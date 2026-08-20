import fs from "node:fs";
import path from "node:path";

const SEVERITIES = new Set(["HIGH", "MEDIUM"]);

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function safePath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 512
    && !value.startsWith("/") && !value.includes("\\") && !/[\r\n\0]/u.test(value)
    && value.split("/").every((part) => !["", ".", ".."].includes(part));
}

function boundedText(value, label, max = 2_000) {
  if (typeof value !== "string" || value.length < 1 || value.length > max || value.includes("\0")) {
    fail("AUTOMATIC_REVIEW_SCHEMA", `${label} is invalid`);
  }
  return value;
}

export function buildAutomaticReviewDiff({ workspace_root, public_files, changed_paths, max_bytes = 10_000 } = {}) {
  if (typeof workspace_root !== "string" || !Array.isArray(public_files) || !Array.isArray(changed_paths)
    || !Number.isSafeInteger(max_bytes) || max_bytes < 1_000 || max_bytes > 10_000) {
    fail("AUTOMATIC_REVIEW_DIFF", "invalid final-diff request");
  }
  const root = fs.realpathSync(path.resolve(workspace_root));
  const beforeByPath = new Map(public_files.map((entry) => [entry.path, entry.content]));
  const paths = [...new Set(changed_paths)].sort();
  if (paths.length > 8 || paths.some((entry) => !safePath(entry))) {
    fail("AUTOMATIC_REVIEW_DIFF", "changed paths are unsafe or unbounded");
  }
  const files = paths.map((relativePath) => {
    const absolute = path.resolve(root, ...relativePath.split("/"));
    let after = null;
    if (fs.existsSync(absolute)) {
      const real = fs.realpathSync(absolute);
      const relative = path.relative(root, real);
      if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || path.relative(absolute, real) !== "") {
        fail("AUTOMATIC_REVIEW_DIFF", "changed path traverses a link or escapes the workspace");
      }
      const stat = fs.lstatSync(absolute);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 256 * 1024) {
        fail("AUTOMATIC_REVIEW_DIFF", "changed path is not a bounded ordinary file");
      }
      after = fs.readFileSync(absolute, "utf8");
      if (after.includes("\0")) fail("AUTOMATIC_REVIEW_DIFF", "binary final diff is unsupported");
    } else {
      const parent = fs.realpathSync(path.dirname(absolute));
      const relativeParent = path.relative(root, parent);
      if ((relativeParent.startsWith(`..${path.sep}`) || path.isAbsolute(relativeParent))
        || !beforeByPath.has(relativePath)) {
        fail("AUTOMATIC_REVIEW_DIFF", "deleted path is not a visible file inside the workspace");
      }
    }
    return Object.freeze({ path: relativePath, before: beforeByPath.get(relativePath) ?? null, after });
  });
  const envelope = Object.freeze({ schema_version: 1, files: Object.freeze(files) });
  if (Buffer.byteLength(JSON.stringify(envelope), "utf8") > max_bytes) {
    fail("AUTOMATIC_REVIEW_DIFF", "final diff exceeds the review byte budget");
  }
  return envelope;
}

export function renderAutomaticReviewPrompt({ visible_requirements, final_diff } = {}) {
  boundedText(visible_requirements, "visible_requirements", 4_000);
  if (final_diff === null || typeof final_diff !== "object" || Array.isArray(final_diff)) {
    fail("AUTOMATIC_REVIEW_PROMPT", "final_diff is invalid");
  }
  return [
    "Perform one independent read-only review of the integrated final diff against only the visible requirements.",
    "Before the verdict, use only native read, glob, and grep tools to inspect public call sites, re-exports, tests, and contract chains implicated by the changed symbols; shell access is unavailable.",
    "Challenge the change with boundary, error, cancellation, concurrency, and compatibility cases only when the visible requirements or public repository evidence make them relevant; a passing visible check is not proof of correctness.",
    "Do not modify files. Do not infer or request a reference solution. Report only concrete HIGH or MEDIUM defects, never speculative concerns.",
    "Return exactly one JSON object and no prose: {\"review_findings\":[{\"severity\":\"HIGH|MEDIUM\",\"path\":\"relative/file\",\"line\":1,\"contract\":\"violated visible contract\",\"evidence\":\"specific trigger and impact\",\"body\":\"smallest safe fix\"}]}",
    `VISIBLE_REQUIREMENTS_JSON=${JSON.stringify(visible_requirements)}`,
    `FINAL_DIFF_V1=${JSON.stringify(final_diff)}`,
  ].join(" ");
}

export function automaticReviewObservation({ eligible, started = false, completed = false, findings = [], workspace_unchanged = false, reviewer_caused_fix_count = 0, reviewer_metrics = null, evidence_fingerprint = null, reason = null } = {}) {
  if (typeof eligible !== "boolean" || typeof started !== "boolean" || typeof completed !== "boolean"
    || typeof workspace_unchanged !== "boolean" || !Array.isArray(findings)
    || !Number.isSafeInteger(reviewer_caused_fix_count) || reviewer_caused_fix_count < 0 || reviewer_caused_fix_count > 1) {
    fail("AUTOMATIC_REVIEW_OBSERVATION", "invalid review observation");
  }
  const normalizedFindings = findings.map((finding, index) => {
    if (finding === null || typeof finding !== "object" || Array.isArray(finding)
      || !SEVERITIES.has(finding.severity) || !safePath(finding.path)
      || !Number.isSafeInteger(finding.line) || finding.line < 1 || finding.line > 10_000) {
      fail("AUTOMATIC_REVIEW_SCHEMA", `finding ${index} is invalid`);
    }
    return Object.freeze({
      severity: finding.severity,
      path: finding.path,
      line: finding.line,
      contract: boundedText(finding.contract, `finding ${index} contract`),
      evidence: boundedText(finding.evidence, `finding ${index} evidence`),
      body: boundedText(finding.body, `finding ${index} body`),
    });
  });
  const operationallyComplete = !eligible || (started && completed && workspace_unchanged);
  if (reviewer_metrics !== null && (typeof reviewer_metrics !== "object" || Array.isArray(reviewer_metrics)
    || ["tool_call_count", "task_action_call_count", "context_read_count", "model_turn_count", "continuation_turn_count", "duration_ms"]
      .some((key) => !Number.isSafeInteger(reviewer_metrics[key]) || reviewer_metrics[key] < 0))) {
    fail("AUTOMATIC_REVIEW_OBSERVATION", "reviewer metrics are invalid");
  }
  if (evidence_fingerprint !== null && !/^sha256:[0-9a-f]{64}$/u.test(evidence_fingerprint)) {
    fail("AUTOMATIC_REVIEW_OBSERVATION", "review evidence fingerprint is invalid");
  }
  return Object.freeze({
    eligible,
    review_required_count: eligible ? 1 : 0,
    review_started_count: started ? 1 : 0,
    review_completed_count: completed ? 1 : 0,
    review_finding_count: normalizedFindings.length,
    reviewer_caused_fix_count,
    reviewer_metrics: reviewer_metrics === null ? null : Object.freeze({ ...reviewer_metrics }),
    evidence_fingerprint,
    workspace_unchanged,
    operationally_complete: operationallyComplete,
    terminal_allowed: operationallyComplete
      && (normalizedFindings.length === 0 || reviewer_caused_fix_count === 1),
    reason: reason ?? (operationallyComplete ? "review_complete" : eligible ? "review_incomplete" : "not_eligible"),
    findings: Object.freeze(normalizedFindings),
  });
}
