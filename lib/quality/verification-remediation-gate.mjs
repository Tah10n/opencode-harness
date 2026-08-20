import { sanitizeBoundedString } from "../feedback/privacy.mjs";

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

const PUBLIC_CHECK_DIAGNOSTIC_MAX_BYTES = 8_000;
const ANSI_ESCAPE_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/gu;
const UNSAFE_CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu;
const UNSAFE_BIDI_PATTERN = /[\u202A-\u202E\u2066-\u2069]/gu;

function utf8Prefix(value, maxBytes) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= maxBytes) return value;
  let end = maxBytes;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
  return bytes.subarray(0, end).toString("utf8");
}

export function buildBoundedPublicCheckDiagnostic({ result, redacted_roots = [] } = {}) {
  if (result === null || typeof result !== "object" || Array.isArray(result)
    || !Array.isArray(redacted_roots)
    || redacted_roots.some((entry) => typeof entry !== "string" || entry.length < 1)) {
    fail("VERIFICATION_REMEDIATION_DIAGNOSTIC", "public check result is invalid");
  }
  const rawStatus = result.status;
  if (rawStatus !== null && rawStatus !== undefined
    && (!Number.isSafeInteger(rawStatus) || rawStatus < 0 || rawStatus > 255)) {
    fail("VERIFICATION_REMEDIATION_DIAGNOSTIC", "public check status is invalid");
  }
  let output = [result.stdout, result.stderr]
    .map((entry) => typeof entry === "string" ? entry : "")
    .filter((entry) => entry.length > 0)
    .join("\n")
    .replace(ANSI_ESCAPE_PATTERN, "")
    .replace(/\r\n?/gu, "\n")
    .replace(UNSAFE_CONTROL_PATTERN, "?")
    .replace(UNSAFE_BIDI_PATTERN, "?");
  for (const root of [...new Set(redacted_roots)].sort((left, right) => right.length - left.length)) {
    output = output.replaceAll(`file://${root}`, "[workspace]").replaceAll(root, "[workspace]");
  }
  const sanitizedLines = output.split("\n").map((line, index) => sanitizeBoundedString(line, {
    label: `public check diagnostic line ${index + 1}`,
    maxLength: 1_000,
  }).value);
  const normalized = sanitizedLines.join("\n").trim() || "[no public diagnostic output]";
  const bounded = utf8Prefix(normalized, PUBLIC_CHECK_DIAGNOSTIC_MAX_BYTES);
  return Object.freeze({
    exit_status: rawStatus ?? null,
    output: bounded,
    truncated: bounded !== normalized,
  });
}

const METRIC_KEYS = Object.freeze([
  "tool_call_count",
  "task_action_call_count",
  "context_read_count",
  "model_turn_count",
  "continuation_turn_count",
  "duration_ms",
]);

function boundedText(value, label, max = 4_000) {
  if (typeof value !== "string" || value.length < 1 || value.length > max || value.includes("\0")) {
    fail("VERIFICATION_REMEDIATION_PROMPT", `${label} is invalid`);
  }
  return value;
}

export function renderDiffGuidedVerificationRemediationPrompt({
  visible_requirements,
  current_diff,
} = {}) {
  boundedText(visible_requirements, "visible_requirements");
  if (current_diff === null || typeof current_diff !== "object" || Array.isArray(current_diff)) {
    fail("VERIFICATION_REMEDIATION_PROMPT", "current_diff is invalid");
  }
  return [
    "The runner-selected trusted visible verification did not pass after the first implementation attempt.",
    "Perform exactly one bounded remediation pass using only the visible requirements, the current public diff, and public repository files or tests.",
    "Inspect the supplied diff against relevant public call sites and tests before deciding that no change is needed.",
    "Preserve unrelated behavior, do not seek hidden tests or a reference solution, and return the normal final outcome protocol after the edit.",
    `VISIBLE_REQUIREMENTS_JSON=${JSON.stringify(visible_requirements)}`,
    `CURRENT_PUBLIC_DIFF_V1=${JSON.stringify(current_diff)}`,
  ].join(" ");
}

export function renderCheckAddressedVerificationRemediationPrompt({
  visible_requirements,
  current_diff,
  fixed_public_check,
} = {}) {
  const base = renderDiffGuidedVerificationRemediationPrompt({
    visible_requirements,
    current_diff,
  });
  if (fixed_public_check === null || typeof fixed_public_check !== "object"
    || Array.isArray(fixed_public_check) || !Array.isArray(fixed_public_check.argv)
    || fixed_public_check.argv.length < 1 || fixed_public_check.argv.length > 32
    || fixed_public_check.argv.some((entry) => typeof entry !== "string"
      || entry.length < 1 || entry.length > 512 || /[\0\r\n]/u.test(entry))) {
    fail("VERIFICATION_REMEDIATION_PROMPT", "fixed_public_check is invalid");
  }
  return [
    base,
    "The following invocation is the fixed runner-selected public check. You may run this exact invocation to obtain visible diagnostics, but it is not terminal evidence and you must not substitute a different command.",
    `RUNNER_SELECTED_PUBLIC_CHECK_V1=${JSON.stringify({ argv: fixed_public_check.argv })}`,
  ].join(" ");
}

export function renderDiagnosticGuidedVerificationRemediationPrompt({
  visible_requirements,
  current_diff,
  fixed_public_check,
  public_check_diagnostic,
} = {}) {
  const base = renderCheckAddressedVerificationRemediationPrompt({
    visible_requirements,
    current_diff,
    fixed_public_check,
  });
  if (public_check_diagnostic === null || typeof public_check_diagnostic !== "object"
    || Array.isArray(public_check_diagnostic)
    || !["exit_status", "output", "truncated"].every((key) => Object.hasOwn(public_check_diagnostic, key))
    || Object.keys(public_check_diagnostic).length !== 3
    || (public_check_diagnostic.exit_status !== null
      && (!Number.isSafeInteger(public_check_diagnostic.exit_status)
        || public_check_diagnostic.exit_status < 0 || public_check_diagnostic.exit_status > 255))
    || typeof public_check_diagnostic.output !== "string"
    || public_check_diagnostic.output.length < 1
    || Buffer.byteLength(public_check_diagnostic.output, "utf8") > PUBLIC_CHECK_DIAGNOSTIC_MAX_BYTES
    || /[\u0000\u202A-\u202E\u2066-\u2069]/u.test(public_check_diagnostic.output)
    || typeof public_check_diagnostic.truncated !== "boolean") {
    fail("VERIFICATION_REMEDIATION_PROMPT", "public_check_diagnostic is invalid");
  }
  return [
    base,
    "The host already ran that public check after the current diff. Use the following bounded public-only diagnostic to identify and correct the visible failure. It is diagnostic context, not terminal evidence.",
    `PUBLIC_CHECK_DIAGNOSTIC_V1=${JSON.stringify(public_check_diagnostic)}`,
  ].join(" ");
}

export function verificationRemediationObservation({
  eligible,
  started = false,
  completed = false,
  changed = false,
  reverified = false,
  verification_passed = false,
  retry_metrics = null,
  evidence_fingerprint = null,
  reason = null,
} = {}) {
  if ([eligible, started, completed, changed, reverified, verification_passed]
    .some((value) => typeof value !== "boolean")) {
    fail("VERIFICATION_REMEDIATION_OBSERVATION", "boolean lifecycle fields are required");
  }
  if (!eligible && (started || completed || changed || reverified)) {
    fail("VERIFICATION_REMEDIATION_OBSERVATION", "an ineligible retry cannot have lifecycle activity");
  }
  if (completed && !started) {
    fail("VERIFICATION_REMEDIATION_OBSERVATION", "a completed retry must have started");
  }
  if (changed && !started) {
    fail("VERIFICATION_REMEDIATION_OBSERVATION", "workspace change requires a started retry");
  }
  if (reverified && !changed) {
    fail("VERIFICATION_REMEDIATION_OBSERVATION", "reverification requires a workspace change");
  }
  if (verification_passed && !reverified) {
    fail("VERIFICATION_REMEDIATION_OBSERVATION", "a passed verification must have been rerun");
  }
  if (retry_metrics !== null && (
    typeof retry_metrics !== "object"
      || Array.isArray(retry_metrics)
      || METRIC_KEYS.some((key) => !Number.isSafeInteger(retry_metrics[key]) || retry_metrics[key] < 0)
  )) {
    fail("VERIFICATION_REMEDIATION_OBSERVATION", "retry metrics are invalid");
  }
  if (evidence_fingerprint !== null && !/^sha256:[0-9a-f]{64}$/u.test(evidence_fingerprint)) {
    fail("VERIFICATION_REMEDIATION_OBSERVATION", "evidence fingerprint is invalid");
  }
  const operationallyComplete = !eligible || (started && completed);
  return Object.freeze({
    eligible,
    retry_required_count: eligible ? 1 : 0,
    retry_started_count: started ? 1 : 0,
    retry_completed_count: completed ? 1 : 0,
    retry_changed_count: changed ? 1 : 0,
    retry_reverified_count: reverified ? 1 : 0,
    retry_verification_passed_count: verification_passed ? 1 : 0,
    operationally_complete: operationallyComplete,
    retry_metrics: retry_metrics === null ? null : Object.freeze({ ...retry_metrics }),
    evidence_fingerprint,
    reason: reason ?? (operationallyComplete
      ? eligible ? verification_passed ? "retry_verification_passed" : reverified ? "retry_verification_failed" : changed ? "retry_changed" : "retry_no_change" : "not_eligible"
      : started ? "retry_incomplete" : "retry_not_started"),
  });
}
