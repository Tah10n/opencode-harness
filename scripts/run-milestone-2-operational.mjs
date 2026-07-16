import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  sealMilestone2ReceiptBundle,
  sealOperationalVerificationReceipt,
} from "../lib/quality/milestone-dod.mjs";
import { readMilestone2OperationalReport } from "../lib/quality/milestone-operational-report.mjs";
import {
  assertMilestone2RunContextStable,
  captureMilestone2RunContext,
} from "../lib/quality/milestone-run-context.mjs";
import { fingerprint } from "../lib/quality/validation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLATFORM_DIMENSION = Object.freeze({
  win32: "windows_runtime",
  linux: "linux_runtime",
});
const CHECKS = Object.freeze({
  windows_runtime: Object.freeze([
    Object.freeze({
      check_id: "windows-trusted-project-check",
      report_kind: "trusted_project_check",
      result_kind: "trusted_project_check",
      script: "verify-trusted-project-runner.mjs",
    }),
    Object.freeze({
      check_id: "windows-descendant-teardown",
      report_kind: "descendant_teardown",
      result_kind: "descendant_teardown",
      script: "verify-process-containment.mjs",
    }),
  ]),
  linux_runtime: Object.freeze([
    Object.freeze({
      check_id: "linux-trusted-project-check",
      report_kind: "trusted_project_check",
      result_kind: "trusted_project_check",
      script: "verify-trusted-project-runner.mjs",
    }),
    Object.freeze({
      check_id: "linux-descendant-teardown",
      report_kind: "descendant_teardown",
      result_kind: "descendant_teardown",
      script: "verify-process-containment.mjs",
    }),
  ]),
});

function parseArguments(argv) {
  let dimension = null;
  let output = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dimension" && dimension === null) dimension = argv[++index] ?? null;
    else if (argument === "--out" && output === null) output = argv[++index] ?? null;
    else throw new Error(`unsupported operational runner argument: ${argument}`);
  }
  if (!Object.hasOwn(CHECKS, dimension)) throw new Error("--dimension must be windows_runtime or linux_runtime");
  if (typeof output !== "string" || !path.isAbsolute(output) || path.resolve(output) !== output
    || path.normalize(output) !== output || output.includes("\0") || Buffer.byteLength(output, "utf8") > 4096) {
    throw new Error("--out must be a canonical absolute path");
  }
  return Object.freeze({ dimension, output });
}

function prepareOutput(candidate) {
  if (fs.existsSync(candidate)) throw new Error("operational receipt bundle output already exists");
  const parent = path.dirname(candidate);
  fs.mkdirSync(parent, { recursive: true });
  const canonicalParent = fs.realpathSync.native(parent);
  const comparable = process.platform === "win32"
    ? (value) => value.toLowerCase()
    : (value) => value;
  if (comparable(canonicalParent) !== comparable(parent) || !fs.statSync(canonicalParent).isDirectory()) {
    throw new Error("operational receipt bundle output parent is not canonical");
  }
}

function failedResult(specification, platform, commandEvidence) {
  return {
    kind: specification.result_kind,
    verification_mode: null,
    report_fingerprint: fingerprint(commandEvidence),
    containment_kind: platform === "win32" ? "windows-job-object-v1" : "linux-cgroup-v2",
    containment_identity_fingerprints: [],
    teardown_verified: false,
    scenario_ids: [],
    trusted_check_receipt_fingerprints: [],
    scenario_contract_fingerprint: null,
    attestation_fingerprint: null,
    host_evidence_fingerprint: null,
  };
}

function passedResult(specification, report) {
  if (report.report_kind !== specification.report_kind || report.platform !== process.platform) {
    throw new Error("operational report does not match the registered check");
  }
  return {
    kind: specification.result_kind,
    verification_mode: null,
    report_fingerprint: report.fingerprint,
    containment_kind: report.containment_kind,
    containment_identity_fingerprints: report.containment_identity_fingerprints,
    teardown_verified: report.teardown_verified,
    scenario_ids: report.scenario_ids,
    trusted_check_receipt_fingerprints: report.trusted_check_receipt_fingerprints,
    scenario_contract_fingerprint: null,
    attestation_fingerprint: null,
    host_evidence_fingerprint: null,
  };
}

function runOperationalCheck(specification, context, reportDirectory) {
  const reportPath = path.join(reportDirectory, `${specification.check_id}.json`);
  const startedAt = new Date().toISOString();
  const execution = spawnSync(
    process.execPath,
    [path.join(root, "scripts", specification.script)],
    {
      cwd: root,
      shell: false,
      windowsHide: true,
      stdio: "inherit",
      timeout: 20 * 60 * 1000,
      env: {
        ...process.env,
        OPENCODE_MILESTONE_OPERATIONAL_REPORT: reportPath,
      },
    },
  );
  const completedAt = new Date().toISOString();
  const commandEvidence = {
    check_id: specification.check_id,
    executable: process.execPath,
    script: specification.script,
    status: execution.status,
    signal: execution.signal,
    error_code: execution.error?.code ?? null,
    report_present: fs.existsSync(reportPath),
  };
  let status = "failed";
  let result = failedResult(specification, process.platform, commandEvidence);
  let reportError = null;
  if (execution.status === 0 && execution.signal === null && execution.error === undefined) {
    try {
      const report = readMilestone2OperationalReport(reportPath);
      result = passedResult(specification, report);
      status = "passed";
    } catch (error) {
      reportError = error;
      result = failedResult(specification, process.platform, {
        ...commandEvidence,
        report_error: error.message,
      });
    }
  }
  if (status === "failed") {
    console.error(
      `${specification.check_id} failed (exit ${execution.status ?? "unavailable"}; ${reportError?.message ?? execution.error?.message ?? "no trusted report"}).`,
    );
  }
  return sealOperationalVerificationReceipt({
    check_id: specification.check_id,
    started_at: startedAt,
    completed_at: completedAt,
    status,
    evidence_scope: {
      kind: "milestone_operational",
      dimension_id: PLATFORM_DIMENSION[process.platform],
      platform: process.platform,
      head_sha: context.head_sha,
      workspace_fingerprint: context.workspace_fingerprint,
      run_binding: context.run_binding,
      result,
    },
  });
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (PLATFORM_DIMENSION[process.platform] !== options.dimension) {
    throw new Error(`${options.dimension} cannot run on ${process.platform}`);
  }
  const context = captureMilestone2RunContext({
    workspaceRoot: root,
    localJobId: `${options.dimension}-operational`,
  });
  const reportDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-milestone-2-operational-"));
  let receipts;
  try {
    receipts = CHECKS[options.dimension].map((specification) => (
      runOperationalCheck(specification, context, reportDirectory)
    ));
  } finally {
    fs.rmSync(reportDirectory, { recursive: true, force: true });
  }
  assertMilestone2RunContextStable(context, {
    workspaceRoot: root,
    localJobId: `${options.dimension}-operational`,
  });
  const bundle = sealMilestone2ReceiptBundle({
    dimension_id: options.dimension,
    head_sha: context.head_sha,
    workspace_fingerprint: context.workspace_fingerprint,
    run_binding: context.run_binding,
    receipts,
  });
  prepareOutput(options.output);
  fs.writeFileSync(options.output, `${JSON.stringify(bundle, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  console.log(`Milestone 2 ${options.dimension}: ${receipts.every((receipt) => receipt.status === "passed") ? "verified" : "failed"}.`);
  if (receipts.some((receipt) => receipt.status === "failed")) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`Milestone 2 operational runner failed: ${error.message}`);
  process.exitCode = 1;
}
