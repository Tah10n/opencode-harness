import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  PROJECT_CHECK_LIMITS,
  PROJECT_CHECK_PHASES,
  projectCheckCatalogFingerprint,
  resolveProjectCheckCwd,
  validateProjectCheckCatalog,
} from "./project-check-catalog.mjs";
import {
  observeContentBoundWorkspace,
  validateContentBoundWorkspace,
} from "./normal-session-workspace.mjs";
import {
  ContractError,
  assertFingerprint,
  assertInteger,
  assertPlain,
  assertString,
  canonicalJson,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

export const TRUSTED_PROJECT_CHECK_RECEIPT_SCHEMA_VERSION = 1;
export const TRUSTED_PROJECT_CHECK_PRODUCER = "opencode-harness/trusted-project-runner-v1";
export const TRUSTED_PROJECT_EXECUTION_POLICY_VERSION = "trusted-project-execution-v2";
export const TRUSTED_PROJECT_CHECK_STATUSES = Object.freeze([
  "passed",
  "failed",
  "timed_out",
  "unavailable",
  "oversized",
  "malformed",
  "workspace_changed",
]);

const MANAGED_COMMAND_SYNC_WORKER = fileURLToPath(new URL("../feedback/managed-command-sync-worker.mjs", import.meta.url));

export function trustedProjectContainmentKind() {
  return process.platform === "win32" ? "windows-job-object-v1" : null;
}

function byteCount(value, explicitBytes) {
  if (Number.isSafeInteger(explicitBytes) && explicitBytes >= 0) return explicitBytes;
  if (Buffer.isBuffer(value)) return value.length;
  if (typeof value === "string") return Buffer.byteLength(value, "utf8");
  return 0;
}

function fileIdentity(candidate) {
  const canonicalPath = fs.realpathSync(path.resolve(candidate));
  const stat = fs.statSync(canonicalPath);
  if (!stat.isFile()) throw Object.assign(new Error("trusted executable is not a regular file"), { code: "ENOENT" });
  return Object.freeze({
    canonical_path: canonicalPath,
    device: Number(stat.dev),
    inode: Number(stat.ino),
    mode: Number(stat.mode),
    size: Number(stat.size),
    modified_ms: Number(stat.mtimeMs),
    changed_ms: Number(stat.ctimeMs),
  });
}

function unavailableInvocation(argv) {
  return Object.freeze({
    file: null,
    args: [...argv.slice(1)],
    identities: Object.freeze([{ kind: "unavailable", requested: argv[0] }]),
    unavailable: true,
    uses_npm: false,
  });
}

function npmCliCandidates(nodeExecutable) {
  const nodeDirectory = path.dirname(nodeExecutable);
  return [...new Set([
    path.join(nodeDirectory, "node_modules", "npm", "bin", "npm-cli.js"),
    path.resolve(nodeDirectory, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    path.resolve(nodeDirectory, "..", "node_modules", "npm", "bin", "npm-cli.js"),
  ])];
}

function resolveInvocation(argv) {
  let nodeIdentity;
  try {
    nodeIdentity = fileIdentity(process.execPath);
  } catch {
    return unavailableInvocation(argv);
  }
  const executable = path.basename(argv[0]).toLowerCase();
  if (["node", "node.exe"].includes(executable)) {
    return Object.freeze({
      file: nodeIdentity.canonical_path,
      args: [...argv.slice(1)],
      identities: Object.freeze([{ kind: "node", ...nodeIdentity }]),
      unavailable: false,
      uses_npm: false,
    });
  }
  if (["npm", "npm.cmd"].includes(executable)) {
    for (const candidate of npmCliCandidates(nodeIdentity.canonical_path)) {
      try {
        const npmIdentity = fileIdentity(candidate);
        return Object.freeze({
          file: nodeIdentity.canonical_path,
          args: [npmIdentity.canonical_path, ...argv.slice(1)],
          identities: Object.freeze([
            { kind: "node", ...nodeIdentity },
            { kind: "npm_cli", ...npmIdentity },
          ]),
          unavailable: false,
          uses_npm: true,
        });
      } catch {
        // Candidate selection is derived exclusively from the canonical Node installation.
      }
    }
    return unavailableInvocation(argv);
  }
  if (path.isAbsolute(argv[0])) {
    try {
      const identity = fileIdentity(argv[0]);
      return Object.freeze({
        file: identity.canonical_path,
        args: [...argv.slice(1)],
        identities: Object.freeze([{ kind: "catalog_absolute", ...identity }]),
        unavailable: false,
        uses_npm: false,
      });
    } catch {
      return unavailableInvocation(argv);
    }
  }
  return unavailableInvocation(argv);
}

export function assertTrustedProjectInvocationCurrent(invocation) {
  if (invocation.unavailable) return;
  for (const expected of invocation.identities) {
    let actual;
    try {
      actual = fileIdentity(expected.canonical_path);
    } catch {
      throw new ContractError("QUALITY_CHECK_EXECUTABLE_DRIFT", "trusted project check executable became unavailable before spawn");
    }
    const expectedIdentity = { ...expected };
    delete expectedIdentity.kind;
    if (!fingerprintsEqual(fingerprint(expectedIdentity), fingerprint(actual))) {
      throw new ContractError("QUALITY_CHECK_EXECUTABLE_DRIFT", "trusted project check executable identity changed before spawn");
    }
  }
}

function canonicalExistingDirectory(candidate, fallback) {
  try {
    const resolved = fs.realpathSync(candidate);
    return fs.statSync(resolved).isDirectory() ? resolved : fallback;
  } catch {
    return fallback;
  }
}

function sanitizedEnvironment(invocation) {
  const nodeDirectory = path.dirname(fileIdentity(process.execPath).canonical_path);
  const environment = Object.create(null);
  if (process.platform === "win32") {
    const driveRoot = path.parse(nodeDirectory).root;
    const windowsDirectory = canonicalExistingDirectory(path.join(driveRoot, "Windows"), driveRoot);
    const system32 = canonicalExistingDirectory(path.join(windowsDirectory, "System32"), windowsDirectory);
    let commandProcessor = path.join(system32, "cmd.exe");
    try { commandProcessor = fileIdentity(commandProcessor).canonical_path; } catch { /* npm will fail closed if cmd is unavailable */ }
    const tempDirectory = canonicalExistingDirectory(
      os.tmpdir(),
      canonicalExistingDirectory(path.join(windowsDirectory, "Temp"), system32),
    );
    environment.SystemRoot = windowsDirectory;
    environment.WINDIR = windowsDirectory;
    environment.ComSpec = commandProcessor;
    environment.Path = [nodeDirectory, system32].join(path.delimiter);
    environment.PATHEXT = ".COM;.EXE;.BAT;.CMD";
    environment.TEMP = tempDirectory;
    environment.TMP = tempDirectory;
  } else {
    environment.PATH = [nodeDirectory, "/usr/local/bin", "/usr/bin", "/bin"].join(path.delimiter);
    environment.TMPDIR = canonicalExistingDirectory("/tmp", "/tmp");
  }
  if (invocation.uses_npm) {
    environment.NPM_CONFIG_USERCONFIG = process.platform === "win32" ? "NUL" : "/dev/null";
    environment.NPM_CONFIG_GLOBALCONFIG = process.platform === "win32"
      ? "NUL:"
      : "/etc/opencode-harness-disabled-npmrc";
    environment.NPM_CONFIG_AUDIT = "false";
    environment.NPM_CONFIG_FUND = "false";
    environment.NPM_CONFIG_UPDATE_NOTIFIER = "false";
  }
  return Object.freeze({ ...environment });
}

export function trustedProjectCommandFingerprint({ argv, cwd, executableIdentity, environmentIdentity }) {
  return fingerprint({
    argv,
    cwd,
    execution_policy_version: TRUSTED_PROJECT_EXECUTION_POLICY_VERSION,
    executable_identity: executableIdentity,
    environment_identity: environmentIdentity,
  });
}

function managedCommandSpawnSync(file, args, options) {
  const input = canonicalJson({
    file,
    args,
    cwd: options.cwd,
    env: options.env,
    timeout_ms: options.timeout,
    max_output_bytes: options.maxBuffer,
  });
  let worker;
  try {
    worker = spawnSync(process.execPath, [MANAGED_COMMAND_SYNC_WORKER], {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      encoding: "utf8",
      env: options.env,
      input,
      maxBuffer: 64 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    return { status: null, signal: null, stdout: null, stderr: null, error, teardown_verified: false };
  }
  if (worker.error || worker.status !== 0 || typeof worker.stdout !== "string") {
    return {
      status: null,
      signal: typeof worker.signal === "string" ? worker.signal : null,
      stdout: null,
      stderr: null,
      error: worker.error ?? Object.assign(new Error("managed command sync worker failed"), { code: "MANAGED_COMMAND_SYNC_WORKER_FAILED" }),
      teardown_verified: false,
    };
  }
  let result;
  try {
    result = JSON.parse(worker.stdout);
  } catch {
    result = null;
  }
  if (result === null || typeof result !== "object" || Array.isArray(result)
    || typeof result.teardown_verified !== "boolean") {
    return {
      status: null,
      signal: null,
      stdout: null,
      stderr: null,
      error: Object.assign(new Error("managed command sync worker result is malformed"), { code: "MANAGED_COMMAND_SYNC_WORKER_FAILED" }),
      teardown_verified: false,
    };
  }
  const errorCode = result.timed_out === true ? "ETIMEDOUT"
    : result.error_code === "PROCESS_OUTPUT_LIMIT" ? "ENOBUFS"
      : result.error_code;
  return {
    status: Number.isInteger(result.status) ? result.status : null,
    signal: typeof result.signal === "string" ? result.signal : null,
    stdout: null,
    stderr: null,
    stdout_bytes: Number.isSafeInteger(result.stdout_bytes) ? result.stdout_bytes : 0,
    stderr_bytes: Number.isSafeInteger(result.stderr_bytes) ? result.stderr_bytes : 0,
    error: typeof errorCode === "string" ? Object.assign(new Error(errorCode), { code: errorCode }) : undefined,
    teardown_verified: result.teardown_verified,
  };
}

function statusFor(result, stdoutBytes, stderrBytes, outputLimit) {
  if (stdoutBytes > outputLimit || stderrBytes > outputLimit || result.error?.code === "ENOBUFS") return "oversized";
  if (result.error?.code === "ETIMEDOUT") return "timed_out";
  if (["ENOENT", "EACCES", "EPERM"].includes(result.error?.code)) return "unavailable";
  if (result.error) return "malformed";
  return result.status === 0 ? "passed" : "failed";
}

function createReceipt({
  check,
  phase,
  catalogFingerprint,
  beforeWorkspace,
  afterWorkspace,
  result,
  commandFingerprint,
  startedAtMs,
  completedAtMs,
}) {
  const stdoutBytes = byteCount(result.stdout, result.stdout_bytes);
  const stderrBytes = byteCount(result.stderr, result.stderr_bytes);
  const executionStatus = statusFor(result, stdoutBytes, stderrBytes, check.max_output_chars);
  const status = afterWorkspace.fingerprint === beforeWorkspace.fingerprint ? executionStatus : "workspace_changed";
  const durationMs = Math.max(0, completedAtMs - startedAtMs);
  const evidenceBody = {
    producer: TRUSTED_PROJECT_CHECK_PRODUCER,
    check_id: check.check_id,
    phase,
    status,
    exit_code: Number.isInteger(result.status) ? result.status : null,
    signal: typeof result.signal === "string" ? result.signal : null,
    duration_ms: durationMs,
    stdout_bytes: stdoutBytes,
    stderr_bytes: stderrBytes,
    command_fingerprint: commandFingerprint,
    catalog_fingerprint: catalogFingerprint,
    workspace_fingerprint: beforeWorkspace.fingerprint,
    post_workspace_fingerprint: afterWorkspace.fingerprint,
  };
  return deepFrozenClone({
    schema_version: TRUSTED_PROJECT_CHECK_RECEIPT_SCHEMA_VERSION,
    ...evidenceBody,
    evidence_fingerprint: fingerprint(evidenceBody),
  }, "trusted project check receipt");
}

export function runTrustedProjectCheck({
  catalog,
  checkId,
  phase,
  workspaceRoot,
  catalogFingerprint = null,
  expectedWorkspaceFingerprint = null,
  observeWorkspace = (root) => observeContentBoundWorkspace(root),
  spawn = managedCommandSpawnSync,
  now = () => Date.now(),
}) {
  const validated = validateProjectCheckCatalog(catalog, { workspaceRoot });
  if (!PROJECT_CHECK_PHASES.includes(phase)) {
    throw new ContractError("QUALITY_CHECK_PHASE", "trusted project check phase is invalid");
  }
  if (expectedWorkspaceFingerprint !== null) {
    assertFingerprint(expectedWorkspaceFingerprint, "trusted project check expected workspace fingerprint");
  }
  const expectedCatalogFingerprint = projectCheckCatalogFingerprint(validated);
  if (catalogFingerprint !== null && catalogFingerprint !== expectedCatalogFingerprint) {
    throw new ContractError("QUALITY_CHECK_CATALOG_DRIFT", "trusted project check catalog fingerprint is stale");
  }
  const check = validated.checks.find((entry) => entry.check_id === checkId);
  if (!check) throw new ContractError("QUALITY_CHECK_UNKNOWN", `unknown trusted project check ID: ${checkId}`);
  if (!check.phases.includes(phase)) {
    throw new ContractError("QUALITY_CHECK_PHASE", `${checkId} is not allowed during ${phase}`);
  }
  const cwd = resolveProjectCheckCwd(workspaceRoot, check.cwd, `${checkId}.cwd`);
  const productionContainment = spawn === managedCommandSpawnSync ? trustedProjectContainmentKind() : "injected-runner";
  if (productionContainment === null) {
    throw new ContractError(
      "QUALITY_CHECK_CONTAINMENT_UNAVAILABLE",
      "trusted project checks require a platform process-containment controller",
    );
  }
  const beforeWorkspace = observeWorkspace(workspaceRoot);
  validateContentBoundWorkspace(beforeWorkspace, "trusted project check before workspace");
  if (expectedWorkspaceFingerprint !== null && beforeWorkspace.fingerprint !== expectedWorkspaceFingerprint) {
    throw new ContractError("QUALITY_CHECK_WORKSPACE_DRIFT", "trusted project check expected workspace fingerprint is stale");
  }
  const invocation = resolveInvocation(check.argv);
  const environment = sanitizedEnvironment(invocation);
  const environmentIdentity = {
    policy_version: TRUSTED_PROJECT_EXECUTION_POLICY_VERSION,
    containment: productionContainment,
    keys: Object.keys(environment).sort(),
    fingerprint: fingerprint(environment),
  };
  const commandFingerprint = trustedProjectCommandFingerprint({
    argv: check.argv,
    cwd: check.cwd,
    executableIdentity: invocation.identities,
    environmentIdentity,
  });
  const startedAtMs = now();
  let result;
  if (invocation.unavailable) {
    result = {
      status: null,
      signal: null,
      stdout: null,
      stderr: null,
      error: Object.assign(new Error("trusted executable unavailable"), { code: "ENOENT" }),
      teardown_verified: true,
    };
  } else {
    assertTrustedProjectInvocationCurrent(invocation);
    try {
      result = spawn(invocation.file, invocation.args, {
        cwd: cwd.resolved,
        shell: false,
        windowsHide: true,
        encoding: null,
        env: environment,
        timeout: check.timeout_ms,
        maxBuffer: check.max_output_chars + 1,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      result = { status: null, signal: null, stdout: null, stderr: null, error, teardown_verified: false };
    }
  }
  if (result?.teardown_verified !== true) {
    throw new ContractError(
      "QUALITY_CHECK_TEARDOWN_UNVERIFIED",
      `trusted project check process tree teardown could not be verified (${result?.error?.code ?? "unknown"})`,
    );
  }
  const completedAtMs = now();
  const afterWorkspace = observeWorkspace(workspaceRoot);
  validateContentBoundWorkspace(afterWorkspace, "trusted project check after workspace");
  return createReceipt({
    check,
    phase,
    catalogFingerprint: expectedCatalogFingerprint,
    beforeWorkspace,
    afterWorkspace,
    result,
    commandFingerprint,
    startedAtMs,
    completedAtMs,
  });
}

export function runTrustedProjectChecks({
  catalog,
  checkIds,
  phase,
  workspaceRoot,
  catalogFingerprint = null,
  expectedWorkspaceFingerprint = null,
  observeWorkspace = (root) => observeContentBoundWorkspace(root),
  spawn = managedCommandSpawnSync,
  now = () => Date.now(),
  maxChecks = PROJECT_CHECK_LIMITS.max_checks_per_run,
  maxReceiptBytes = PROJECT_CHECK_LIMITS.max_receipt_bytes,
}) {
  if (!Array.isArray(checkIds) || checkIds.length === 0 || checkIds.length > maxChecks
    || checkIds.some((entry) => typeof entry !== "string") || new Set(checkIds).size !== checkIds.length) {
    throw new ContractError("QUALITY_CHECK_RUN_LIMIT", "trusted project check run must contain unique bounded check IDs");
  }
  const receipts = [];
  let receiptBytes = 0;
  for (const checkId of checkIds) {
    const receipt = runTrustedProjectCheck({
      catalog,
      checkId,
      phase,
      workspaceRoot,
      catalogFingerprint,
      expectedWorkspaceFingerprint,
      observeWorkspace,
      spawn,
      now,
    });
    receiptBytes += Buffer.byteLength(canonicalJson(receipt), "utf8");
    if (receiptBytes > maxReceiptBytes) {
      throw new ContractError("QUALITY_CHECK_RECEIPT_LIMIT", "trusted project check receipts exceed the bounded run limit");
    }
    receipts.push(receipt);
  }
  return deepFrozenClone({
    receipts,
    complete: receipts.every((entry) => entry.status === "passed"),
    receipt_bytes: receiptBytes,
  }, "trusted project check run");
}

export function trustedProjectCheckResult(receipt) {
  const keys = [
    "schema_version", "producer", "check_id", "phase", "status", "exit_code", "signal",
    "duration_ms", "stdout_bytes", "stderr_bytes", "command_fingerprint", "catalog_fingerprint",
    "workspace_fingerprint", "post_workspace_fingerprint", "evidence_fingerprint",
  ];
  try {
    assertPlain(receipt, "trusted project check receipt");
    exact(receipt, keys, keys, "trusted project check receipt");
    if (receipt.schema_version !== TRUSTED_PROJECT_CHECK_RECEIPT_SCHEMA_VERSION
      || receipt.producer !== TRUSTED_PROJECT_CHECK_PRODUCER
      || !PROJECT_CHECK_PHASES.includes(receipt.phase)
      || !TRUSTED_PROJECT_CHECK_STATUSES.includes(receipt.status)) {
      throw new ContractError("QUALITY_CHECK_RECEIPT", "trusted project check receipt metadata is invalid");
    }
    assertString(receipt.check_id, "trusted project check receipt.check_id", { maxBytes: 128 });
    if (receipt.exit_code !== null) assertInteger(receipt.exit_code, "trusted project check receipt.exit_code", { min: 0, max: 0xFFFFFFFF });
    if (receipt.signal !== null) assertString(receipt.signal, "trusted project check receipt.signal", { maxBytes: 128 });
    for (const key of ["duration_ms", "stdout_bytes", "stderr_bytes"]) {
      assertInteger(receipt[key], `trusted project check receipt.${key}`, { min: 0, max: Number.MAX_SAFE_INTEGER });
    }
    for (const key of ["command_fingerprint", "catalog_fingerprint", "workspace_fingerprint", "post_workspace_fingerprint", "evidence_fingerprint"]) {
      assertFingerprint(receipt[key], `trusted project check receipt.${key}`);
    }
    const evidenceBody = { ...receipt };
    delete evidenceBody.schema_version;
    delete evidenceBody.evidence_fingerprint;
    if (!fingerprintsEqual(receipt.evidence_fingerprint, fingerprint(evidenceBody))) {
      throw new ContractError("QUALITY_CHECK_RECEIPT", "trusted project check receipt evidence fingerprint is invalid");
    }
  } catch (error) {
    if (error instanceof ContractError && error.code === "QUALITY_CHECK_RECEIPT") throw error;
    throw new ContractError("QUALITY_CHECK_RECEIPT", "trusted project check receipt is malformed");
  }
  return Object.freeze({
    status: receipt.status === "passed" ? "passed" : receipt.status === "failed" ? "failed" : "blocked",
    command_id: `trusted-project-check:${receipt.check_id}`,
    exit_code: receipt.exit_code,
    receipt,
  });
}
