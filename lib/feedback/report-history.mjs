import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  ContractError,
  assertExactKeys,
  assertIsoTimestamp,
  fingerprint,
} from "./contracts.mjs";
import {
  assertPersistenceSafe,
  assertSafePersistenceId,
} from "./privacy.mjs";
import {
  assertConfinedExistingPath,
  assertNoSymlinkEscape,
  atomicWriteMutable,
  ensureConfinedDirectory,
  isInside,
  publishImmutableSet,
  readJson,
  withExclusiveLock,
} from "./files.mjs";

const HISTORY_MARKER_KEYS = Object.freeze([
  "schema_version",
  "generation",
  "evaluation_run_id",
  "report_fingerprint",
  "json_text_fingerprint",
  "markdown_fingerprint",
  "json_file",
  "markdown_file",
  "completed_at",
]);

function timestampSlug(timestamp) {
  assertIsoTimestamp(timestamp, "report timestamp");
  return timestamp.replace(/[-:]/g, "").replace(/\.\d+(?=Z|[+-])/, "").replace("+", "p").replace(/(?<!^)\-/g, "m");
}

function markdownFor(report) {
  const lines = [
    "# Live Evaluation Report",
    "",
    `Evaluation run: ${report.evaluation_run_id}`,
    `Created: ${report.created_at}`,
    `Evidence provenance: ${report.provenance?.evidence_kind ?? "unavailable"}`,
    "",
    "| Scenario | Repetition | Profile | Status | Adapter | Visible | Hidden | Defect escape | Operational run |",
    "| --- | ---: | --- | --- | --- | ---: | ---: | ---: | --- |",
  ];
  for (const result of report.results ?? []) {
    lines.push(
      `| ${result.scenario_id} | ${result.repetition} | ${result.profile_role} | ${result.status} | ${result.adapter_classification} | ${result.visible_pass_rate} | ${result.hidden_pass_rate} | ${result.defect_escape_rate} | ${result.operational_run_id} |`,
    );
  }
  if ((report.incomplete_evidence ?? []).length > 0) {
    lines.push("", `Incomplete evidence: ${(report.incomplete_evidence ?? []).join(", ")}`);
  }
  lines.push("");
  return lines.join("\n");
}

function textFingerprint(text) {
  return fingerprint(text);
}

export function createReportHistory({
  workspaceRoot,
  reportDir,
  clock = () => new Date(),
  idFactory = () => randomUUID(),
  fileOptions = {},
} = {}) {
  if (typeof workspaceRoot !== "string" || workspaceRoot.trim() === "") {
    throw new ContractError("REPORT_WORKSPACE", "workspaceRoot must be a non-empty path");
  }
  if (typeof reportDir !== "string" || reportDir.trim() === "") {
    throw new ContractError("REPORT_DIRECTORY", "reportDir must be a non-empty path");
  }
  const resolvedWorkspace = path.resolve(workspaceRoot);
  const resolvedDir = path.resolve(reportDir);
  assertConfinedExistingPath(resolvedWorkspace, resolvedWorkspace, { type: "directory" });
  if (resolvedDir === resolvedWorkspace || !isInside(resolvedWorkspace, resolvedDir)) {
    throw new ContractError("REPORT_DIRECTORY", "reportDir must be strictly inside workspaceRoot");
  }
  ensureConfinedDirectory(resolvedWorkspace, resolvedDir);

  const securedFileOptions = Object.freeze({ ...fileOptions, basePath: resolvedWorkspace });
  const latestJsonPath = path.join(resolvedDir, "latest.json");
  const latestMarkdownPath = path.join(resolvedDir, "latest.md");
  const latestMarkerPath = path.join(resolvedDir, "latest.complete.json");
  const latestLockPath = path.join(resolvedDir, ".latest.lock");

  function validateMarker(marker, {
    generation,
    evaluationRunId,
    jsonFile,
    markdownFile,
    report,
    json,
    markdown,
  }) {
    assertExactKeys(marker, { allowed: HISTORY_MARKER_KEYS, required: HISTORY_MARKER_KEYS }, "report marker");
    if (marker.schema_version !== 1) throw new ContractError("REPORT_MARKER_SCHEMA", "report marker schema_version must be 1");
    assertSafePersistenceId(marker.generation, "report marker.generation");
    assertSafePersistenceId(marker.evaluation_run_id, "report marker.evaluation_run_id");
    assertIsoTimestamp(marker.completed_at, "report marker.completed_at");
    if (
      marker.generation !== generation
      || marker.evaluation_run_id !== evaluationRunId
      || marker.json_file !== jsonFile
      || marker.markdown_file !== markdownFile
    ) throw new ContractError("REPORT_MARKER_IDENTITY", "report marker identity or filenames do not match the artifact set");
    if (marker.report_fingerprint !== fingerprint(report)) throw new ContractError("REPORT_FINGERPRINT", "semantic report fingerprint does not match its completion marker");
    if (marker.json_text_fingerprint !== textFingerprint(json)) throw new ContractError("REPORT_JSON_FINGERPRINT", "JSON text fingerprint does not match its completion marker");
    if (marker.markdown_fingerprint !== textFingerprint(markdown)) throw new ContractError("REPORT_MARKDOWN_FINGERPRINT", "Markdown fingerprint does not match its completion marker");
    if (markdown !== markdownFor(report)) throw new ContractError("REPORT_MARKDOWN_CONTENT", "Markdown is not the deterministic rendering of the JSON report");
    return marker;
  }

  function inspectSet({ jsonPath, markdownPath, markerPath, generation }) {
    for (const candidate of [jsonPath, markdownPath, markerPath]) {
      assertNoSymlinkEscape(resolvedWorkspace, candidate);
      assertConfinedExistingPath(resolvedWorkspace, candidate, { type: "file" });
      if (path.dirname(path.resolve(candidate)) !== resolvedDir) {
        throw new ContractError("REPORT_PATH", "report artifacts must be direct children of reportDir");
      }
    }
    const json = fs.readFileSync(jsonPath, "utf8");
    const markdown = fs.readFileSync(markdownPath, "utf8");
    const report = JSON.parse(json.replace(/^\uFEFF/, ""));
    const marker = readJson(markerPath);
    assertSafePersistenceId(report.evaluation_run_id, "evaluation_run_id");
    validateMarker(marker, {
      generation,
      evaluationRunId: report.evaluation_run_id,
      jsonFile: path.basename(jsonPath),
      markdownFile: path.basename(markdownPath),
      report,
      json,
      markdown,
    });
    assertPersistenceSafe(report, { label: "historical report" });
    return { report, marker, markdown };
  }

  function inspect(jsonPath) {
    const resolved = path.resolve(jsonPath);
    if (
      path.dirname(resolved) !== resolvedDir
      || path.extname(resolved) !== ".json"
      || resolved.endsWith(".complete.json")
      || path.basename(resolved) === "latest.json"
    ) throw new ContractError("REPORT_PATH", "historical report path must be a JSON artifact inside reportDir");
    assertNoSymlinkEscape(resolvedWorkspace, resolved);
    if (!fs.existsSync(resolved)) throw new ContractError("REPORT_MISSING", "historical report does not exist");
    const generation = path.basename(resolved, ".json");
    const markerPath = path.join(resolvedDir, `${generation}.complete.json`);
    if (!fs.existsSync(markerPath)) throw new ContractError("REPORT_INCOMPLETE", "historical report has no completion marker");
    return inspectSet({
      jsonPath: resolved,
      markdownPath: path.join(resolvedDir, `${generation}.md`),
      markerPath,
      generation,
    });
  }

  function inspectLatest() {
    if (!fs.existsSync(latestMarkerPath)) throw new ContractError("REPORT_LATEST_INCOMPLETE", "latest report has no completion marker");
    assertNoSymlinkEscape(resolvedWorkspace, latestMarkerPath);
    assertConfinedExistingPath(resolvedWorkspace, latestMarkerPath, { type: "file" });
    const marker = readJson(latestMarkerPath);
    const generation = marker?.generation;
    if (typeof generation !== "string") throw new ContractError("REPORT_MARKER_IDENTITY", "latest marker has no valid generation");
    return inspectSet({
      jsonPath: latestJsonPath,
      markdownPath: latestMarkdownPath,
      markerPath: latestMarkerPath,
      generation,
    });
  }

  function write(report, { denyValues = [] } = {}) {
    if (!report || typeof report !== "object" || Array.isArray(report)) {
      throw new ContractError("REPORT_OBJECT", "report must be an object");
    }
    assertSafePersistenceId(report.evaluation_run_id, "evaluation_run_id");
    assertPersistenceSafe(report, { label: "report", denyValues });
    const nowValue = clock();
    const timestamp = nowValue instanceof Date ? nowValue.toISOString() : String(nowValue);
    assertIsoTimestamp(timestamp, "history timestamp");
    const collisionId = assertSafePersistenceId(idFactory("report-history"), "report history id");
    const generation = `${timestampSlug(timestamp)}-${report.evaluation_run_id}-${collisionId}`;
    assertSafePersistenceId(generation, "report generation");
    const jsonPath = path.join(resolvedDir, `${generation}.json`);
    const mdPath = path.join(resolvedDir, `${generation}.md`);
    const markerPath = path.join(resolvedDir, `${generation}.complete.json`);
    const json = `${JSON.stringify(report, null, 2)}\n`;
    const markdown = markdownFor(report);
    assertPersistenceSafe(markdown, { label: "report markdown", denyValues });
    const reportFingerprint = fingerprint(report);
    const jsonTextFingerprint = textFingerprint(json);
    const markdownFingerprint = textFingerprint(markdown);
    const markerValue = {
      schema_version: 1,
      generation,
      evaluation_run_id: report.evaluation_run_id,
      report_fingerprint: reportFingerprint,
      json_text_fingerprint: jsonTextFingerprint,
      markdown_fingerprint: markdownFingerprint,
      json_file: path.basename(jsonPath),
      markdown_file: path.basename(mdPath),
      completed_at: timestamp,
    };

    ensureConfinedDirectory(resolvedWorkspace, resolvedDir);
    publishImmutableSet({
      files: [
        { path: jsonPath, contents: json },
        { path: mdPath, contents: markdown },
      ],
      markerPath,
      markerValue,
    }, securedFileOptions);

    // latest.* is explicitly non-authoritative, but it must still represent a
    // single complete generation.  A prior marker is left in place until the
    // final atomic write; any injected mid-write failure therefore mismatches
    // fingerprints and inspectLatest fails closed.
    withExclusiveLock(latestLockPath, () => {
      atomicWriteMutable(latestJsonPath, json, securedFileOptions);
      atomicWriteMutable(latestMarkdownPath, markdown, securedFileOptions);
      atomicWriteMutable(latestMarkerPath, `${JSON.stringify({
        ...markerValue,
        json_file: "latest.json",
        markdown_file: "latest.md",
      }, null, 2)}\n`, securedFileOptions);
    }, { ...securedFileOptions, lockIdFactory: () => assertSafePersistenceId(idFactory("report-latest-lock"), "report latest lock id") });

    return {
      jsonPath,
      mdPath,
      markerPath,
      reportFingerprint,
      jsonTextFingerprint,
      markdownFingerprint,
      generation,
    };
  }

  return Object.freeze({ write, inspect, inspectLatest, reportDir: resolvedDir, workspaceRoot: resolvedWorkspace });
}

export { markdownFor as evaluationReportMarkdown };
