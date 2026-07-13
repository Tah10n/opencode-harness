import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createReportHistory } from "../lib/feedback/report-history.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-report-history-"));
try {
  let id = 0;
  const history = createReportHistory({
    workspaceRoot: tmp,
    reportDir: path.join(tmp, "reports"),
    clock: () => new Date("2026-07-10T10:00:00.000Z"),
    idFactory: () => `history-${++id}`,
    fileOptions: { tempIdFactory: (() => { let n = 0; return () => `temp-${++n}`; })() },
  });
  const report = {
    schema_version: 1,
    evaluation_run_id: "eval-001",
    created_at: "2026-07-10T10:00:00.000Z",
    provenance: { evidence_kind: "infrastructure_self_test" },
    results: [{
      scenario_id: "runner-self-test",
      repetition: 1,
      profile_role: "baseline",
      status: "passed",
      adapter_classification: "passed",
      visible_pass_rate: 1,
      hidden_pass_rate: 1,
      defect_escape_rate: 0,
      operational_run_id: "run-001",
    }],
    incomplete_evidence: [],
  };
  const written = history.write(report);
  assert(fs.existsSync(written.jsonPath));
  assert(fs.existsSync(written.mdPath));
  assert(fs.existsSync(written.markerPath));
  assert(fs.existsSync(path.join(tmp, "reports", "latest.json")));
  assert.equal(history.inspect(written.jsonPath).report.evaluation_run_id, "eval-001");
  assert.equal(history.inspectLatest().report.evaluation_run_id, "eval-001");

  const orphan = path.join(tmp, "reports", "orphan.json");
  fs.writeFileSync(orphan, "{}\n");
  assert.throws(() => history.inspect(orphan), (error) => error?.code === "REPORT_INCOMPLETE");

  assert.throws(() => history.write({ ...report, evaluation_run_id: "AKIA1234567890ABCDEF" }), (error) => error?.code === "PRIVACY_ID");
  assert.throws(() => history.write({ ...report, evaluation_run_id: "eval-deny", model: "opaque-canary-value" }, {
    denyValues: ["opaque-canary-value"],
  }), (error) => error?.code === "PRIVACY_DENY_VALUE");
  assert.throws(() => history.write({ ...report, evaluation_run_id: "eval-path", model: "loaded from /srv/private/model" }), (error) => error?.code === "PRIVACY_UNSAFE_VALUE");

  const originalJson = fs.readFileSync(written.jsonPath, "utf8");
  const originalMarkdown = fs.readFileSync(written.mdPath, "utf8");
  const originalMarker = fs.readFileSync(written.markerPath, "utf8");
  fs.writeFileSync(written.jsonPath, `${JSON.stringify(report)}\n`, "utf8");
  assert.throws(() => history.inspect(written.jsonPath), (error) => error?.code === "REPORT_JSON_FINGERPRINT");
  fs.writeFileSync(written.jsonPath, originalJson, "utf8");
  fs.writeFileSync(written.mdPath, `${originalMarkdown}tampered\n`, "utf8");
  assert.throws(() => history.inspect(written.jsonPath), (error) => error?.code === "REPORT_MARKDOWN_FINGERPRINT");
  fs.writeFileSync(written.mdPath, originalMarkdown, "utf8");
  const marker = JSON.parse(originalMarker);
  fs.writeFileSync(written.markerPath, `${JSON.stringify({ ...marker, markdown_file: "other.md" }, null, 2)}\n`, "utf8");
  assert.throws(() => history.inspect(written.jsonPath), (error) => error?.code === "REPORT_MARKER_IDENTITY");
  fs.writeFileSync(written.markerPath, `${JSON.stringify({ ...marker, extra: true }, null, 2)}\n`, "utf8");
  assert.throws(() => history.inspect(written.jsonPath), (error) => error?.code === "CONTRACT_UNKNOWN_FIELD");
  fs.writeFileSync(written.markerPath, originalMarker, "utf8");
  assert.equal(history.inspect(written.jsonPath).markdown, originalMarkdown);

  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-report-outside-"));
  const linkedWorkspace = path.join(tmp, "linked-workspace");
  fs.mkdirSync(linkedWorkspace);
  const linkedReports = path.join(linkedWorkspace, "reports");
  fs.symlinkSync(outside, linkedReports, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => createReportHistory({ workspaceRoot: linkedWorkspace, reportDir: linkedReports }), (error) => error?.code === "FILES_SYMLINK");
  fs.unlinkSync(linkedReports);
  fs.rmSync(outside, { recursive: true, force: true });
  assert.throws(() => createReportHistory({ workspaceRoot: linkedWorkspace, reportDir: path.join(tmp, "escape") }), (error) => error?.code === "REPORT_DIRECTORY");

  const failureWorkspace = path.join(tmp, "latest-failure");
  fs.mkdirSync(failureWorkspace);
  const failureDir = path.join(failureWorkspace, "reports");
  let firstId = 0;
  const stableHistory = createReportHistory({
    workspaceRoot: failureWorkspace,
    reportDir: failureDir,
    clock: () => new Date("2026-07-10T11:00:00.000Z"),
    idFactory: () => `stable-${++firstId}`,
  });
  stableHistory.write({ ...report, evaluation_run_id: "eval-stable" });
  let commits = 0;
  const failingHistory = createReportHistory({
    workspaceRoot: failureWorkspace,
    reportDir: failureDir,
    clock: () => new Date("2026-07-10T12:00:00.000Z"),
    idFactory: (kind) => kind === "report-history" ? "failing-history" : "failing-lock",
    fileOptions: {
      tempIdFactory: (() => { let n = 0; return () => `failing-temp-${++n}`; })(),
      beforeCommit: () => {
        commits += 1;
        if (commits === 5) throw new Error("injected latest markdown failure");
      },
    },
  });
  assert.throws(() => failingHistory.write({ ...report, evaluation_run_id: "eval-failing" }), /injected latest markdown failure/);
  assert.throws(() => failingHistory.inspectLatest(), (error) => ["REPORT_MARKER_IDENTITY", "REPORT_JSON_FINGERPRINT", "REPORT_MARKDOWN_FINGERPRINT"].includes(error?.code));
  const failingArtifact = fs.readdirSync(failureDir).find((entry) => entry.includes("eval-failing") && entry.endsWith(".json") && !entry.endsWith(".complete.json"));
  assert.equal(failingHistory.inspect(path.join(failureDir, failingArtifact)).report.evaluation_run_id, "eval-failing");

  const lockWorkspace = path.join(tmp, "latest-lock");
  fs.mkdirSync(lockWorkspace);
  const lockDir = path.join(lockWorkspace, "reports");
  let lockId = 0;
  const lockHistory = createReportHistory({
    workspaceRoot: lockWorkspace,
    reportDir: lockDir,
    clock: () => new Date("2026-07-10T13:00:00.000Z"),
    idFactory: () => `lock-${++lockId}`,
  });
  lockHistory.write({ ...report, evaluation_run_id: "eval-lock-stable" });
  fs.writeFileSync(path.join(lockDir, ".latest.lock"), "concurrent-writer", "utf8");
  assert.throws(() => lockHistory.write({ ...report, evaluation_run_id: "eval-lock-contender" }), (error) => error?.code === "FILES_LOCKED");
  assert.equal(lockHistory.inspectLatest().report.evaluation_run_id, "eval-lock-stable");
  fs.unlinkSync(path.join(lockDir, ".latest.lock"));

  console.log("Report history self-tests passed (confinement, tamper, and latest-generation failure cases included).");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
