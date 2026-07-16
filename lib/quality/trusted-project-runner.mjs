import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  PROJECT_CHECK_LIMITS,
  PROJECT_CHECK_OUTCOMES,
  PROJECT_CHECK_PHASES,
  loadProjectCheckCatalog,
  projectCheckCatalogFingerprint,
  resolveProjectCheckCwd,
  validateProjectCheckCatalog,
} from "./project-check-catalog.mjs";
import {
  WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
  diffContentBoundWorkspaces,
  diffDeclaredWorkspaceOutputs,
  observeContentBoundWorkspace,
  validateContentBoundWorkspace,
} from "./normal-session-workspace.mjs";
import {
  assertTrustedToolchainInvocationCurrent,
  loadTrustedToolchainMap,
  resolveTrustedToolchainInvocation,
  trustedToolchainMapFingerprint,
  validateTrustedToolchainMap,
} from "./trusted-toolchains.mjs";
import { TRUSTED_TOOLCHAIN_RESOLUTION_POLICY_VERSION } from "./trusted-toolchain-host-config.mjs";
import {
  classifyProcessContainment,
  normalizeProcessContainmentOptions,
} from "../feedback/process-containment.mjs";
import {
  MAX_CONTAINMENT_SETUP_TIMEOUT_MS,
  assertManagedCommandWorkingDirectoryIdentityCurrent,
  captureManagedCommandWorkingDirectoryIdentity,
} from "../feedback/process-tree.mjs";
import {
  ContractError,
  assertArray,
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

export const TRUSTED_PROJECT_CHECK_RECEIPT_SCHEMA_VERSION = 3;
export const TRUSTED_PROJECT_CHECK_PRODUCER = "opencode-harness/trusted-project-runner-v3";
export const TRUSTED_PROJECT_EXECUTION_POLICY_VERSION = "trusted-project-execution-v5";
export const TRUSTED_PROJECT_CHECK_STATUSES = Object.freeze(["passed", "failed", "blocked"]);
const MANAGED_SYNC_WORKER_TIMEOUT_OVERHEAD_MS = MAX_CONTAINMENT_SETUP_TIMEOUT_MS + 15_000;
export const TRUSTED_PROJECT_CHECK_OBSERVED_OUTCOMES = Object.freeze([
  ...new Set([
    "passed",
    "failed",
    "timed_out",
    "unavailable",
    "oversized",
    "malformed",
    ...PROJECT_CHECK_OUTCOMES,
  ]),
]);

const VERIFIED_CONTAINMENT_KINDS = Object.freeze([
  "windows-job-object-v1",
  "linux-cgroup-v2",
  "macos-exclusive-uid-v1",
]);
const BLOCKED_OUTCOMES = Object.freeze(["timed_out", "unavailable", "oversized", "malformed"]);
const MANAGED_COMMAND_SYNC_WORKER = fileURLToPath(new URL("../feedback/managed-command-sync-worker.mjs", import.meta.url));

function byteCount(value, explicitBytes) {
  if (Number.isSafeInteger(explicitBytes) && explicitBytes >= 0) return explicitBytes;
  if (Buffer.isBuffer(value)) return value.length;
  if (typeof value === "string") return Buffer.byteLength(value, "utf8");
  return 0;
}

function comparablePath(value) {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function canonicalExistingDirectory(candidate, fallback = null) {
  try {
    const resolved = fs.realpathSync.native(path.resolve(candidate));
    return fs.statSync(resolved).isDirectory() ? resolved : fallback;
  } catch {
    return fallback;
  }
}

function effectiveContainmentOptions(value) {
  let candidate = value;
  if (process.platform === "linux") {
    if ((candidate === undefined || candidate.cgroupRoot === undefined)
      && process.env.OPENCODE_QUALITY_CGROUP_ROOT !== undefined) {
      candidate = { ...(candidate ?? {}), cgroupRoot: process.env.OPENCODE_QUALITY_CGROUP_ROOT };
    }
    if ((candidate === undefined || candidate.cgroupAttachMode === undefined)
      && process.env.OPENCODE_QUALITY_CGROUP_ATTACH_MODE !== undefined) {
      candidate = {
        ...(candidate ?? {}),
        cgroupAttachMode: process.env.OPENCODE_QUALITY_CGROUP_ATTACH_MODE,
      };
    }
    if ((candidate === undefined || candidate.cgroupAttachHelper === undefined)
      && process.env.OPENCODE_QUALITY_CGROUP_ATTACH_HELPER !== undefined) {
      candidate = {
        ...(candidate ?? {}),
        cgroupAttachHelper: process.env.OPENCODE_QUALITY_CGROUP_ATTACH_HELPER,
      };
    }
  } else if (process.platform === "darwin") {
    if ((candidate === undefined || candidate.macosController === undefined)
      && process.env.OPENCODE_QUALITY_MACOS_CONTROLLER !== undefined) {
      candidate = { ...(candidate ?? {}), macosController: process.env.OPENCODE_QUALITY_MACOS_CONTROLLER };
    }
    if ((candidate === undefined || candidate.macosWorkloadUid === undefined)
      && process.env.OPENCODE_QUALITY_MACOS_WORKLOAD_UID !== undefined) {
      const workloadUid = Number(process.env.OPENCODE_QUALITY_MACOS_WORKLOAD_UID);
      candidate = { ...(candidate ?? {}), macosWorkloadUid: workloadUid };
    }
  }
  try {
    return normalizeProcessContainmentOptions(candidate ?? {});
  } catch {
    throw new ContractError(
      "QUALITY_CHECK_CONTAINMENT_UNAVAILABLE",
      "trusted project check containment configuration is invalid",
    );
  }
}

function validateContainmentClassification(value, label = "process containment classification") {
  try {
    assertPlain(value, label);
    const keys = [
      "schema_version", "support_state", "kind", "scope_id", "reason", "mechanism", "identity", "fingerprint",
    ];
    exact(value, keys, keys, label);
    if (value.schema_version !== 1 || !["verified", "unsupported", "unavailable"].includes(value.support_state)) {
      throw new Error("classification metadata is invalid");
    }
    assertString(value.kind, `${label}.kind`, { maxBytes: 128 });
    if (value.scope_id !== null) assertString(value.scope_id, `${label}.scope_id`, { maxBytes: 256 });
    if (value.reason !== null) assertString(value.reason, `${label}.reason`, { maxBytes: 256 });
    if (value.mechanism !== null) assertPlain(value.mechanism, `${label}.mechanism`);
    assertPlain(value.identity, `${label}.identity`);
    exact(value.identity, ["schema_version", "support_state", "kind", "scope_id", "reason", "mechanism"], [
      "schema_version", "support_state", "kind", "scope_id", "reason", "mechanism",
    ], `${label}.identity`);
    for (const key of ["schema_version", "support_state", "kind", "scope_id", "reason"]) {
      if (value[key] !== value.identity[key]) throw new Error("classification identity is inconsistent");
    }
    if (canonicalJson(value.mechanism) !== canonicalJson(value.identity.mechanism)) {
      throw new Error("classification mechanism is inconsistent");
    }
    assertFingerprint(value.fingerprint, `${label}.fingerprint`);
    if (!fingerprintsEqual(value.fingerprint, fingerprint(value.identity))) {
      throw new Error("classification fingerprint is invalid");
    }
    return value;
  } catch (error) {
    if (error instanceof ContractError && error.code === "QUALITY_CHECK_CONTAINMENT_INVALID") throw error;
    throw new ContractError("QUALITY_CHECK_CONTAINMENT_INVALID", `${label} is malformed`);
  }
}

function requireVerifiedContainment(value) {
  const classification = validateContainmentClassification(value);
  if (classification.support_state === "unsupported") {
    throw new ContractError(
      "QUALITY_CHECK_CONTAINMENT_UNSUPPORTED",
      `trusted project checks are unsupported by ${classification.kind}`,
    );
  }
  if (classification.support_state !== "verified") {
    throw new ContractError(
      "QUALITY_CHECK_CONTAINMENT_UNAVAILABLE",
      `trusted project check containment is unavailable (${classification.reason ?? classification.kind})`,
    );
  }
  if (!VERIFIED_CONTAINMENT_KINDS.includes(classification.kind)) {
    throw new ContractError(
      "QUALITY_CHECK_CONTAINMENT_UNAVAILABLE",
      `trusted project check containment kind is not verified: ${classification.kind}`,
    );
  }
  return classification;
}

export function trustedProjectContainmentKind(options = {}) {
  try {
    const classification = requireVerifiedContainment(classifyProcessContainment(options));
    return classification.kind;
  } catch {
    return null;
  }
}

function sanitizedEnvironment(invocation, containmentOptions = {}) {
  const profile = invocation.environment_profile;
  if (profile === null || typeof profile !== "object" || Array.isArray(profile)
    || profile.variables === null || typeof profile.variables !== "object" || Array.isArray(profile.variables)
    || !Array.isArray(profile.path_entries)) {
    throw new ContractError("QUALITY_TOOLCHAIN_ENVIRONMENT", "trusted toolchain environment profile is unavailable");
  }
  const componentDirectories = profile.path_entries;
  const seen = new Set();
  const trustedPathEntries = [];
  for (const directory of componentDirectories) {
    const canonical = canonicalExistingDirectory(directory);
    if (canonical === null) continue;
    const identity = comparablePath(canonical);
    if (!seen.has(identity)) {
      seen.add(identity);
      trustedPathEntries.push(canonical);
    }
  }
  if (trustedPathEntries.length === 0) {
    throw new ContractError("QUALITY_TOOLCHAIN_UNAVAILABLE", "trusted toolchain has no canonical executable directory");
  }

  const environment = Object.assign(Object.create(null), profile.variables);
  if (process.platform === "win32") {
    const driveRoot = path.parse(process.execPath).root;
    const windowsDirectory = canonicalExistingDirectory(path.join(driveRoot, "Windows"));
    const system32 = windowsDirectory === null
      ? null
      : canonicalExistingDirectory(path.join(windowsDirectory, "System32"));
    if (windowsDirectory === null || system32 === null) {
      throw new ContractError("QUALITY_TOOLCHAIN_UNAVAILABLE", "trusted Windows system runtime is unavailable");
    }
    const commandProcessor = fs.realpathSync.native(path.join(system32, "cmd.exe"));
    if (!fs.statSync(commandProcessor).isFile()) {
      throw new ContractError("QUALITY_TOOLCHAIN_UNAVAILABLE", "trusted Windows command processor is unavailable");
    }
    const tempDirectory = canonicalExistingDirectory(
      os.tmpdir(),
      canonicalExistingDirectory(path.join(windowsDirectory, "Temp"), system32),
    );
    environment.SystemRoot = windowsDirectory;
    environment.WINDIR = windowsDirectory;
    environment.ComSpec = commandProcessor;
    environment.Path = [...trustedPathEntries, system32].join(path.delimiter);
    environment.PATHEXT = ".COM;.EXE;.BAT;.CMD";
    environment.TEMP = tempDirectory;
    environment.TMP = tempDirectory;
  } else {
    environment.PATH = trustedPathEntries.join(path.delimiter);
    environment.TMPDIR = canonicalExistingDirectory("/tmp", "/tmp");
    environment.LANG = "C";
    environment.LC_ALL = "C";
  }
  environment.NO_COLOR = "1";
  environment.GIT_CONFIG_NOSYSTEM = "1";
  environment.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null";
  environment.GIT_OPTIONAL_LOCKS = "0";
  environment.GIT_TERMINAL_PROMPT = "0";
  if (invocation.runtime_metadata?.git?.executable_path) {
    environment.OPENCODE_QUALITY_GIT_EXECUTABLE = invocation.runtime_metadata.git.executable_path;
  }
  if (process.platform === "linux" && containmentOptions.cgroupRoot !== undefined) {
    // Nested trusted checks must stay inside the same already-validated
    // delegation. Only this runner-owned coordination value crosses the
    // sanitized boundary; ambient environment variables still do not.
    environment.OPENCODE_QUALITY_CGROUP_ROOT = containmentOptions.cgroupRoot;
    if (containmentOptions.cgroupAttachMode !== undefined) {
      environment.OPENCODE_QUALITY_CGROUP_ATTACH_MODE = containmentOptions.cgroupAttachMode;
    }
    if (containmentOptions.cgroupAttachHelper !== undefined) {
      environment.OPENCODE_QUALITY_CGROUP_ATTACH_HELPER = containmentOptions.cgroupAttachHelper;
    }
  } else if (process.platform === "darwin"
    && containmentOptions.macosController !== undefined
    && containmentOptions.macosWorkloadUid !== undefined) {
    environment.OPENCODE_QUALITY_MACOS_CONTROLLER = containmentOptions.macosController;
    environment.OPENCODE_QUALITY_MACOS_WORKLOAD_UID = String(containmentOptions.macosWorkloadUid);
  }
  return Object.freeze({ ...environment });
}

export function trustedProjectCommandFingerprint({
  checkId,
  phase,
  purpose,
  argv,
  cwd,
  catalogFingerprint,
  toolchainMapFingerprint,
  executableIdentityFingerprint,
  toolchainHostConfigurationFingerprint,
  toolchainResolutionPolicyVersion,
  toolchainEnvironmentFingerprint,
  toolchainRuntimeMetadataFingerprint,
  environmentIdentity,
  containmentKind,
  containmentIdentityFingerprint,
  sourceWorkspaceFingerprint,
  outputWorkspaceFingerprint,
  workingDirectoryIdentityFingerprint,
}) {
  return fingerprint({
    check_id: checkId,
    phase,
    purpose,
    argv,
    cwd,
    execution_policy_version: TRUSTED_PROJECT_EXECUTION_POLICY_VERSION,
    catalog_fingerprint: catalogFingerprint,
    toolchain_map_fingerprint: toolchainMapFingerprint,
    executable_identity_fingerprint: executableIdentityFingerprint,
    toolchain_host_configuration_fingerprint: toolchainHostConfigurationFingerprint,
    toolchain_resolution_policy_version: toolchainResolutionPolicyVersion,
    toolchain_environment_fingerprint: toolchainEnvironmentFingerprint,
    toolchain_runtime_metadata_fingerprint: toolchainRuntimeMetadataFingerprint,
    environment_identity: environmentIdentity,
    containment_kind: containmentKind,
    containment_identity_fingerprint: containmentIdentityFingerprint,
    source_workspace_fingerprint: sourceWorkspaceFingerprint,
    output_workspace_fingerprint: outputWorkspaceFingerprint,
    working_directory_identity_fingerprint: workingDirectoryIdentityFingerprint,
  });
}

export function managedCommandSpawnSync(file, args, options) {
  const containmentOptions = {
    ...(options.containmentOptions?.cgroupRoot === undefined
      ? {}
      : { cgroup_root: options.containmentOptions.cgroupRoot }),
    ...(options.containmentOptions?.cgroupAttachMode === undefined
      ? {}
      : { cgroup_attach_mode: options.containmentOptions.cgroupAttachMode }),
    ...(options.containmentOptions?.cgroupAttachHelper === undefined
      ? {}
      : { cgroup_attach_helper: options.containmentOptions.cgroupAttachHelper }),
    ...(options.containmentOptions?.macosController === undefined
      ? {}
      : { macos_controller: options.containmentOptions.macosController }),
    ...(options.containmentOptions?.macosWorkloadUid === undefined
      ? {}
      : { macos_workload_uid: options.containmentOptions.macosWorkloadUid }),
  };
  const input = canonicalJson({
    file,
    args,
    cwd: options.cwd,
    env: options.env,
    timeout_ms: options.timeout,
    max_output_bytes: options.maxBuffer,
    containment_options: containmentOptions,
    expected_invocation: options.expectedInvocation,
    expected_working_directory_identity: options.expectedWorkingDirectoryIdentity,
  });
  let worker;
  try {
    assertManagedCommandWorkingDirectoryIdentityCurrent(
      options.cwd,
      options.expectedWorkingDirectoryIdentity,
    );
    worker = spawnSync(options.expectedInvocation.managed_worker_executable_path, [MANAGED_COMMAND_SYNC_WORKER], {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      encoding: "utf8",
      env: options.env,
      input,
      maxBuffer: 128 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: Math.min(
        0x7fffffff,
        Math.max(1, Number(options.timeout) || 1) + MANAGED_SYNC_WORKER_TIMEOUT_OVERHEAD_MS,
      ),
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
      error: worker.error ?? Object.assign(
        new Error("managed command sync worker failed"),
        { code: "MANAGED_COMMAND_SYNC_WORKER_FAILED" },
      ),
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
      error: Object.assign(new Error("managed command sync worker result is malformed"), {
        code: "MANAGED_COMMAND_SYNC_WORKER_FAILED",
      }),
      teardown_verified: false,
    };
  }
  const errorCode = result.timed_out === true
    ? "ETIMEDOUT"
    : result.error_code === "PROCESS_OUTPUT_LIMIT"
      ? "ENOBUFS"
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
    containment_identity: result.containment_identity ?? null,
    containment_fingerprint: result.containment_fingerprint ?? null,
    containment_state: result.containment_state ?? null,
  };
}

function validateContainmentIdentity(identity, expectedKind) {
  assertPlain(identity, "trusted project check containment identity");
  const common = ["schema_version", "support_state", "kind", "scope_id", "worker_pid"];
  const keys = expectedKind === "windows-job-object-v1"
    ? [...common, "controller_executable", "controller_source_fingerprint"]
    : expectedKind === "linux-cgroup-v2" ? [
      ...common,
      "watchdog_pid",
      "delegated_root_identity",
      "current_parent_identity",
      "guard_identity",
      "leaf_identity",
      "mount_point",
      "controller_executable",
      "controller_module",
      "controller_source_fingerprint",
      "attach_helper",
    ] : [
      ...common,
      "controller_pid",
      "workload_uid",
      "worker_start_identity",
      "controller_start_identity",
      "preserved_ancestor_count",
      "controller_executable",
      "controller_protocol_version",
      "controller_protocol_fingerprint",
    ];
  exact(identity, keys, keys, "trusted project check containment identity");
  if (identity.schema_version !== 1 || identity.support_state !== "verified" || identity.kind !== expectedKind) {
    throw new Error("containment identity metadata is invalid");
  }
  assertString(identity.scope_id, "trusted project check containment identity.scope_id", { maxBytes: 256 });
  assertInteger(identity.worker_pid, "trusted project check containment identity.worker_pid", {
    min: 1,
    max: 0x7fffffff,
  });
  if (expectedKind === "windows-job-object-v1") {
    assertPlain(identity.controller_executable, "trusted project check containment identity.controller_executable");
    assertFingerprint(
      identity.controller_source_fingerprint,
      "trusted project check containment identity.controller_source_fingerprint",
    );
  } else if (expectedKind === "linux-cgroup-v2") {
    assertInteger(identity.watchdog_pid, "trusted project check containment identity.watchdog_pid", {
      min: 1,
      max: 0x7fffffff,
    });
    assertPlain(identity.delegated_root_identity, "trusted project check containment identity.delegated_root_identity");
    assertPlain(identity.current_parent_identity, "trusted project check containment identity.current_parent_identity");
    assertPlain(identity.guard_identity, "trusted project check containment identity.guard_identity");
    assertPlain(identity.leaf_identity, "trusted project check containment identity.leaf_identity");
    assertPlain(identity.controller_executable, "trusted project check containment identity.controller_executable");
    assertPlain(identity.controller_module, "trusted project check containment identity.controller_module");
    assertPlain(identity.attach_helper, "trusted project check containment identity.attach_helper");
    assertFingerprint(
      identity.controller_source_fingerprint,
      "trusted project check containment identity.controller_source_fingerprint",
    );
    if (identity.mount_point !== null) {
      if (typeof identity.mount_point !== "string" || !identity.mount_point.startsWith("/")
        || identity.mount_point.includes("\0") || Buffer.byteLength(identity.mount_point, "utf8") > 4096) {
        throw new Error("Linux containment mount point is invalid");
      }
    }
    if (!fingerprintsEqual(fingerprint(identity.guard_identity), fingerprint(identity.current_parent_identity))) {
      throw new Error("Linux containment guard identity is inconsistent with the current parent identity");
    }
  } else if (expectedKind === "macos-exclusive-uid-v1") {
    assertInteger(identity.controller_pid, "trusted project check containment identity.controller_pid", {
      min: 1,
      max: 0x7fffffff,
    });
    assertInteger(identity.workload_uid, "trusted project check containment identity.workload_uid", {
      min: 1,
      max: 0x7fffffff,
    });
    assertInteger(identity.preserved_ancestor_count, "trusted project check containment identity.preserved_ancestor_count", {
      min: 1,
      max: 64,
    });
    for (const [key, value] of [
      ["worker_start_identity", identity.worker_start_identity],
      ["controller_start_identity", identity.controller_start_identity],
    ]) {
      assertPlain(value, `trusted project check containment identity.${key}`);
      exact(value, ["seconds", "microseconds"], ["seconds", "microseconds"], `trusted project check containment identity.${key}`);
      assertInteger(value.seconds, `trusted project check containment identity.${key}.seconds`, {
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
      });
      assertInteger(value.microseconds, `trusted project check containment identity.${key}.microseconds`, {
        min: 0,
        max: 999999,
      });
    }
    assertPlain(identity.controller_executable, "trusted project check containment identity.controller_executable");
    if (identity.controller_protocol_version !== 1) {
      throw new Error("macOS containment controller protocol version is invalid");
    }
    assertFingerprint(
      identity.controller_protocol_fingerprint,
      "trusted project check containment identity.controller_protocol_fingerprint",
    );
  } else {
    throw new Error("containment identity kind is unsupported");
  }
  return identity;
}

function validateVerifiedContainmentResult(result, expectedKind) {
  if (result?.teardown_verified !== true) {
    const containmentFailure = typeof result?.containment_state?.failure === "string"
      ? result.containment_state.failure
      : typeof result?.containment_state?.reason === "string"
        ? result.containment_state.reason
        : result?.error?.code ?? "unknown";
    throw new ContractError(
      "QUALITY_CHECK_TEARDOWN_UNVERIFIED",
      `trusted project check process tree teardown could not be verified (${containmentFailure})`,
    );
  }
  try {
    const identity = validateContainmentIdentity(result.containment_identity, expectedKind);
    assertFingerprint(result.containment_fingerprint, "trusted project check containment fingerprint");
    if (!fingerprintsEqual(result.containment_fingerprint, fingerprint(identity))) {
      throw new Error("containment identity fingerprint is invalid");
    }
    const state = result.containment_state;
    assertPlain(state, "trusted project check containment state");
    const keys = ["windows-job-object-v1", "macos-exclusive-uid-v1"].includes(expectedKind)
      ? [
        "support_state", "kind", "scope_id", "identity_fingerprint", "attached", "closed",
        "controller_exited", "controller_streams_closed", "controller_exit_code", "teardown_verified",
        "preparation_aborted", "failure",
      ]
      : [
        "support_state", "kind", "scope_id", "identity_fingerprint", "attached", "closed",
        "watchdog_exited", "watchdog_streams_closed", "watchdog_exit_code", "teardown_verified", "failure",
      ];
    exact(state, keys, keys, "trusted project check containment state");
    if (state.support_state !== "verified" || state.kind !== expectedKind
      || state.scope_id !== identity.scope_id || state.identity_fingerprint !== result.containment_fingerprint
      || state.attached !== true || state.closed !== true || state.teardown_verified !== true || state.failure !== null) {
      throw new Error("containment teardown state is not verified");
    }
    if (["windows-job-object-v1", "macos-exclusive-uid-v1"].includes(expectedKind)
      && (state.controller_exited !== true || state.controller_streams_closed !== true
        || state.controller_exit_code !== 0
        || typeof state.preparation_aborted !== "boolean")) {
      throw new Error("controller-backed containment teardown state is invalid");
    }
    if (expectedKind === "linux-cgroup-v2"
      && (state.watchdog_exited !== true || state.watchdog_streams_closed !== true
        || state.watchdog_exit_code !== 0)) {
      throw new Error("Linux cgroup watchdog teardown state is invalid");
    }
    return Object.freeze({
      identity_fingerprint: result.containment_fingerprint,
      state: Object.freeze({
        support_state: "verified",
        kind: expectedKind,
        scope_id: identity.scope_id,
        identity_fingerprint: result.containment_fingerprint,
        attached: true,
        closed: true,
        teardown_verified: true,
      }),
    });
  } catch (error) {
    if (error instanceof ContractError && error.code === "QUALITY_CHECK_TEARDOWN_UNVERIFIED") throw error;
    throw new ContractError(
      "QUALITY_CHECK_TEARDOWN_UNVERIFIED",
      "trusted project check returned malformed containment evidence",
    );
  }
}

function genericExecutionOutcome(result, stdoutBytes, stderrBytes, outputLimit) {
  if (stdoutBytes > outputLimit || stderrBytes > outputLimit || result.error?.code === "ENOBUFS") return "oversized";
  if (result.error?.code === "ETIMEDOUT") return "timed_out";
  if (["ENOENT", "EACCES", "EPERM"].includes(result.error?.code)) return "unavailable";
  if (result.error) return "malformed";
  if (!Number.isInteger(result.status) || result.status < 0 || result.status > 0xFFFFFFFF) return "malformed";
  return result.status === 0 ? "passed" : "failed";
}

function observedOutcomeFor(check, result, stdoutBytes, stderrBytes) {
  const generic = genericExecutionOutcome(result, stdoutBytes, stderrBytes, check.max_output_chars);
  if (BLOCKED_OUTCOMES.includes(generic) || check.purpose !== "bug_reproducer") return generic;
  for (const outcome of PROJECT_CHECK_OUTCOMES) {
    if (check.outcome_protocol.exit_codes[outcome].includes(result.status)) return outcome;
  }
  return "malformed";
}

function receiptStatusFor(purpose, phase, observedOutcome) {
  if (BLOCKED_OUTCOMES.includes(observedOutcome)) return "blocked";
  if (purpose !== "bug_reproducer") return observedOutcome === "passed" ? "passed" : "failed";
  const expected = phase === "preimplementation" ? "failing_reproducer" : "passing_regression";
  return observedOutcome === expected ? "passed" : "failed";
}

function loadCatalogDescriptor(loader, workspaceRoot, errorCode) {
  let loaded;
  try {
    loaded = loader(workspaceRoot);
    assertPlain(loaded, "trusted project check loaded catalog");
    exact(loaded, ["relative_path", "catalog", "fingerprint"], ["catalog", "fingerprint"], "trusted project check loaded catalog");
    const catalog = validateProjectCheckCatalog(loaded.catalog, { workspaceRoot });
    const expected = projectCheckCatalogFingerprint(catalog);
    assertFingerprint(loaded.fingerprint, "trusted project check loaded catalog.fingerprint");
    if (!fingerprintsEqual(loaded.fingerprint, expected)) throw new Error("catalog fingerprint is inconsistent");
    return Object.freeze({ catalog, fingerprint: expected });
  } catch (error) {
    if (errorCode === null && error instanceof ContractError) throw error;
    throw new ContractError(errorCode ?? "QUALITY_CHECK_CATALOG_DRIFT", "trusted project check catalog changed during execution");
  }
}

function loadToolchainDescriptor(loader, workspaceRoot, errorCode) {
  try {
    const loaded = loader(workspaceRoot);
    assertPlain(loaded, "trusted project check loaded toolchain map");
    exact(loaded, ["relative_path", "map", "fingerprint"], ["map", "fingerprint"], "trusted project check loaded toolchain map");
    const map = validateTrustedToolchainMap(loaded.map);
    const expected = trustedToolchainMapFingerprint(map);
    assertFingerprint(loaded.fingerprint, "trusted project check loaded toolchain map.fingerprint");
    if (!fingerprintsEqual(loaded.fingerprint, expected)) throw new Error("toolchain map fingerprint is inconsistent");
    return Object.freeze({ map, fingerprint: expected });
  } catch (error) {
    if (errorCode === null && error instanceof ContractError) throw error;
    throw new ContractError(errorCode ?? "QUALITY_TOOLCHAIN_MAP_DRIFT", "trusted toolchain map changed during execution");
  }
}

function observeCheckWorkspace(
  observeWorkspace,
  workspaceRoot,
  workspaceObservationSalt,
  ownershipPaths,
  generatedOutputPaths,
) {
  const snapshot = observeWorkspace(
    workspaceRoot,
    workspaceObservationSalt,
    { ownershipPaths, generatedOutputPaths },
  );
  validateContentBoundWorkspace(snapshot, "trusted project check workspace");
  return snapshot;
}

function assertSourceWorkspaceUnchanged(before, after) {
  try {
    const changed = diffContentBoundWorkspaces(before, after);
    if (changed.length > 0 || before.source_fingerprint !== after.source_fingerprint) {
      throw new Error("source workspace changed");
    }
  } catch {
    throw new ContractError(
      "QUALITY_CHECK_WORKSPACE_MUTATED",
      "trusted project check mutated source workspace state",
    );
  }
}

function pathWithinDeclaredOutputs(file, scopes) {
  return scopes.some((scope) => file === scope || file.startsWith(`${scope}/`));
}

function scopedOutputObservation(snapshot, generatedOutputPaths) {
  const entries = snapshot.declared_output_entries.filter((entry) => (
    pathWithinDeclaredOutputs(entry.path, generatedOutputPaths)
  ));
  return Object.freeze({
    entries: Object.freeze(entries.map((entry) => Object.freeze({ ...entry }))),
    fingerprint: fingerprint({
      schema_version: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
      entries,
    }),
  });
}

function validateOutputEntries(entries, label) {
  assertArray(entries, label, { max: 8192 });
  let previous = null;
  for (const [index, entry] of entries.entries()) {
    assertPlain(entry, `${label}[${index}]`);
    exact(entry, ["path", "fingerprint"], ["path", "fingerprint"], `${label}[${index}]`);
    assertString(entry.path, `${label}[${index}].path`, { maxBytes: 1000 });
    assertFingerprint(entry.fingerprint, `${label}[${index}].fingerprint`);
    if (previous !== null && previous.localeCompare(entry.path) >= 0) {
      throw new ContractError("QUALITY_CHECK_RECEIPT", `${label} must be unique and sorted`);
    }
    previous = entry.path;
  }
}

function createReceipt({
  check,
  phase,
  catalogFingerprint,
  toolchainMapFingerprint: mapFingerprint,
  invocation,
  containment,
  beforeWorkspace,
  afterWorkspace,
  beforeOutput,
  afterOutput,
  result,
  commandFingerprint,
  startedAtMs,
  completedAtMs,
}) {
  const stdoutBytes = byteCount(result.stdout, result.stdout_bytes);
  const stderrBytes = byteCount(result.stderr, result.stderr_bytes);
  const observedOutcome = observedOutcomeFor(check, result, stdoutBytes, stderrBytes);
  const status = receiptStatusFor(check.purpose, phase, observedOutcome);
  const durationMs = Math.max(0, completedAtMs - startedAtMs);
  const evidenceBody = {
    producer: TRUSTED_PROJECT_CHECK_PRODUCER,
    command_id: `trusted-project-check:${check.check_id}:${phase}`,
    check_id: check.check_id,
    phase,
    purpose: check.purpose,
    status,
    observed_outcome: observedOutcome,
    exit_code: Number.isInteger(result.status) && result.status >= 0 && result.status <= 0xFFFFFFFF
      ? result.status
      : null,
    signal: typeof result.signal === "string" ? result.signal : null,
    duration_ms: durationMs,
    timeout_ms: check.timeout_ms,
    stdout_bytes: stdoutBytes,
    stderr_bytes: stderrBytes,
    max_output_chars: check.max_output_chars,
    command_fingerprint: commandFingerprint,
    catalog_fingerprint: catalogFingerprint,
    toolchain_map_fingerprint: mapFingerprint,
    executable_identity_fingerprint: invocation.identity_fingerprint,
    toolchain_host_configuration_fingerprint: invocation.toolchain_host_configuration_fingerprint,
    toolchain_resolution_policy_version: invocation.toolchain_resolution_policy_version,
    toolchain_environment_fingerprint: invocation.environment_fingerprint,
    toolchain_runtime_metadata_fingerprint: invocation.runtime_metadata_fingerprint,
    containment_kind: containment.state.kind,
    containment_state: containment.state,
    containment_identity_fingerprint: containment.identity_fingerprint,
    source_workspace_fingerprint: beforeWorkspace.source_fingerprint,
    source_workspace_post_fingerprint: afterWorkspace.source_fingerprint,
    output_workspace_fingerprint: beforeOutput.fingerprint,
    output_workspace_post_fingerprint: afterOutput.fingerprint,
    output_workspace_post_entries: afterOutput.entries,
  };
  return deepFrozenClone({
    schema_version: TRUSTED_PROJECT_CHECK_RECEIPT_SCHEMA_VERSION,
    ...evidenceBody,
    evidence_fingerprint: fingerprint(evidenceBody),
  }, "trusted project check receipt");
}

export function runTrustedProjectCheck({
  catalog = null,
  checkId,
  phase,
  workspaceRoot,
  catalogFingerprint = null,
  expectedToolchainMapFingerprint = null,
  expectedSourceWorkspaceFingerprint = null,
  workspaceObservationSalt = "normal-session-workspace-v3",
  workspaceOwnershipPaths = [],
  workspaceGeneratedOutputPaths = [],
  observeWorkspace = observeContentBoundWorkspace,
  catalogLoader = loadProjectCheckCatalog,
  toolchainMapLoader = loadTrustedToolchainMap,
  toolchainResolver = resolveTrustedToolchainInvocation,
  toolchainIdentityAsserter = assertTrustedToolchainInvocationCurrent,
  containmentClassifier = classifyProcessContainment,
  containmentOptions = {},
  hostConfigurationLease = null,
  hostConfiguration = undefined,
  spawn = managedCommandSpawnSync,
  now = () => Date.now(),
}) {
  if (!PROJECT_CHECK_PHASES.includes(phase)) {
    throw new ContractError("QUALITY_CHECK_PHASE", "trusted project check phase is invalid");
  }
  if (expectedSourceWorkspaceFingerprint !== null) {
    assertFingerprint(
      expectedSourceWorkspaceFingerprint,
      "trusted project check expected source workspace fingerprint",
    );
  }
  if (expectedToolchainMapFingerprint !== null) {
    assertFingerprint(
      expectedToolchainMapFingerprint,
      "trusted project check expected toolchain-map fingerprint",
    );
  }
  assertString(workspaceObservationSalt, "trusted project check workspace observation salt", { maxBytes: 256 });
  if (!Array.isArray(workspaceOwnershipPaths) || workspaceOwnershipPaths.some((entry) => typeof entry !== "string")) {
    throw new ContractError("QUALITY_CHECK_WORKSPACE_SCOPE", "trusted project check ownership paths must be strings");
  }
  if (!Array.isArray(workspaceGeneratedOutputPaths)
    || workspaceGeneratedOutputPaths.some((entry) => typeof entry !== "string")) {
    throw new ContractError("QUALITY_CHECK_WORKSPACE_SCOPE", "trusted project check generated-output paths must be strings");
  }
  const root = fs.realpathSync.native(path.resolve(workspaceRoot));
  const loadedCatalog = loadCatalogDescriptor(catalogLoader, root, null);
  const validatedCatalog = catalog === null
    ? loadedCatalog.catalog
    : validateProjectCheckCatalog(catalog, { workspaceRoot: root });
  const providedCatalogFingerprint = projectCheckCatalogFingerprint(validatedCatalog);
  if (!fingerprintsEqual(providedCatalogFingerprint, loadedCatalog.fingerprint)
    || (catalogFingerprint !== null && catalogFingerprint !== loadedCatalog.fingerprint)) {
    throw new ContractError("QUALITY_CHECK_CATALOG_DRIFT", "trusted project check catalog fingerprint is stale");
  }
  const check = validatedCatalog.checks.find((entry) => entry.check_id === checkId);
  if (!check) throw new ContractError("QUALITY_CHECK_UNKNOWN", `unknown trusted project check ID: ${checkId}`);
  if (!check.phases.includes(phase)) {
    throw new ContractError("QUALITY_CHECK_PHASE", `${checkId} is not allowed during ${phase}`);
  }
  const cwd = resolveProjectCheckCwd(root, check.cwd, `${checkId}.cwd`);
  let workingDirectoryIdentity;
  try {
    workingDirectoryIdentity = captureManagedCommandWorkingDirectoryIdentity(cwd.resolved);
  } catch {
    throw new ContractError("QUALITY_CHECK_CWD_INVALID", "trusted project check cwd identity is invalid");
  }
  const workingDirectoryIdentityFingerprint = fingerprint(workingDirectoryIdentity);
  const loadedToolchains = loadToolchainDescriptor(toolchainMapLoader, root, null);
  if (expectedToolchainMapFingerprint !== null
    && !fingerprintsEqual(expectedToolchainMapFingerprint, loadedToolchains.fingerprint)) {
    throw new ContractError("QUALITY_TOOLCHAIN_MAP_DRIFT", "trusted toolchain map changed after plugin initialization");
  }
  const invocation = toolchainResolver({
    toolchainMap: loadedToolchains.map,
    executableId: check.executable_id,
    argv: check.argv,
    workspaceRoot: root,
    projectRoot: cwd.resolved,
    hostConfigurationLease,
    hostConfiguration,
  });
  if (invocation?.map_fingerprint !== loadedToolchains.fingerprint) {
    throw new ContractError("QUALITY_TOOLCHAIN_MAP_DRIFT", "trusted toolchain invocation used a stale map");
  }
  const normalizedContainmentOptions = effectiveContainmentOptions(containmentOptions);
  const preflightContainment = requireVerifiedContainment(containmentClassifier(normalizedContainmentOptions));
  const observedGeneratedOutputPaths = [...new Set([
    ...workspaceGeneratedOutputPaths,
    ...check.generated_output_paths,
  ])].sort();
  const beforeWorkspace = observeCheckWorkspace(
    observeWorkspace,
    root,
    workspaceObservationSalt,
    workspaceOwnershipPaths,
    observedGeneratedOutputPaths,
  );
  const beforeOutput = scopedOutputObservation(beforeWorkspace, check.generated_output_paths);
  if (expectedSourceWorkspaceFingerprint !== null
    && beforeWorkspace.source_fingerprint !== expectedSourceWorkspaceFingerprint) {
    throw new ContractError("QUALITY_CHECK_WORKSPACE_DRIFT", "trusted project check expected source workspace fingerprint is stale");
  }
  const environment = sanitizedEnvironment(invocation, normalizedContainmentOptions);
  const environmentIdentity = Object.freeze({
    policy_version: TRUSTED_PROJECT_EXECUTION_POLICY_VERSION,
    keys: Object.keys(environment).sort(),
    path_entries: (environment.Path ?? environment.PATH).split(path.delimiter),
    fingerprint: fingerprint(environment),
  });
  const args = [...invocation.argv_prefix, ...check.argv];
  const startedAtMs = now();
  // This is intentionally the last parent-side operation before the worker
  // call. The managed worker must eventually repeat the same assertion after
  // containment attachment to close the remaining cross-process TOCTOU gap.
  toolchainIdentityAsserter(invocation);
  try {
    assertManagedCommandWorkingDirectoryIdentityCurrent(cwd.resolved, workingDirectoryIdentity);
  } catch {
    throw new ContractError("QUALITY_CHECK_CWD_CHANGED", "trusted project check cwd changed before execution");
  }
  let result;
  try {
    result = spawn(invocation.executable_path, args, {
      cwd: cwd.resolved,
      shell: false,
      windowsHide: true,
      encoding: null,
      env: environment,
      timeout: check.timeout_ms,
      maxBuffer: check.max_output_chars,
      containmentOptions: normalizedContainmentOptions,
      expectedInvocation: invocation,
      expectedWorkingDirectoryIdentity: workingDirectoryIdentity,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    result = {
      status: null,
      signal: null,
      stdout: null,
      stderr: null,
      error,
      teardown_verified: false,
    };
  }
  const containment = validateVerifiedContainmentResult(result, preflightContainment.kind);
  const completedAtMs = now();
  const afterWorkspace = observeCheckWorkspace(
    observeWorkspace,
    root,
    workspaceObservationSalt,
    workspaceOwnershipPaths,
    observedGeneratedOutputPaths,
  );
  const afterOutput = scopedOutputObservation(afterWorkspace, check.generated_output_paths);

  const currentCatalog = loadCatalogDescriptor(catalogLoader, root, "QUALITY_CHECK_CATALOG_DRIFT");
  if (!fingerprintsEqual(currentCatalog.fingerprint, loadedCatalog.fingerprint)) {
    throw new ContractError("QUALITY_CHECK_CATALOG_DRIFT", "trusted project check catalog changed during execution");
  }
  const currentToolchains = loadToolchainDescriptor(toolchainMapLoader, root, "QUALITY_TOOLCHAIN_MAP_DRIFT");
  if (!fingerprintsEqual(currentToolchains.fingerprint, loadedToolchains.fingerprint)) {
    throw new ContractError("QUALITY_TOOLCHAIN_MAP_DRIFT", "trusted toolchain map changed during execution");
  }
  toolchainIdentityAsserter(invocation);
  let currentContainment;
  try {
    currentContainment = requireVerifiedContainment(containmentClassifier(normalizedContainmentOptions));
  } catch {
    throw new ContractError("QUALITY_CHECK_CONTAINMENT_DRIFT", "trusted process containment changed during execution");
  }
  if (!fingerprintsEqual(currentContainment.fingerprint, preflightContainment.fingerprint)) {
    throw new ContractError("QUALITY_CHECK_CONTAINMENT_DRIFT", "trusted process containment changed during execution");
  }
  assertSourceWorkspaceUnchanged(beforeWorkspace, afterWorkspace);
  const changedDeclaredOutputs = diffDeclaredWorkspaceOutputs(beforeWorkspace, afterWorkspace);
  if (changedDeclaredOutputs.some((entry) => !pathWithinDeclaredOutputs(entry, check.generated_output_paths))) {
    throw new ContractError(
      "QUALITY_CHECK_WORKSPACE_MUTATED",
      "trusted project check mutated a generated output outside its declared output scope",
    );
  }
  if (check.purpose === "architecture_graph"
    && fingerprintsEqual(beforeOutput.fingerprint, afterOutput.fingerprint)) {
    throw new ContractError(
      "QUALITY_CHECK_ARCHITECTURE_OUTPUT_STALE",
      "architecture graph check must freshly create or rewrite its declared final-workspace evidence",
    );
  }

  const commandFingerprint = trustedProjectCommandFingerprint({
    checkId: check.check_id,
    phase,
    purpose: check.purpose,
    argv: args,
    cwd: check.cwd,
    catalogFingerprint: loadedCatalog.fingerprint,
    toolchainMapFingerprint: loadedToolchains.fingerprint,
    executableIdentityFingerprint: invocation.identity_fingerprint,
    toolchainHostConfigurationFingerprint: invocation.toolchain_host_configuration_fingerprint,
    toolchainResolutionPolicyVersion: invocation.toolchain_resolution_policy_version,
    toolchainEnvironmentFingerprint: invocation.environment_fingerprint,
    toolchainRuntimeMetadataFingerprint: invocation.runtime_metadata_fingerprint,
    environmentIdentity,
    containmentKind: preflightContainment.kind,
    containmentIdentityFingerprint: containment.identity_fingerprint,
    sourceWorkspaceFingerprint: beforeWorkspace.source_fingerprint,
    outputWorkspaceFingerprint: beforeOutput.fingerprint,
    workingDirectoryIdentityFingerprint,
  });
  return createReceipt({
    check,
    phase,
    catalogFingerprint: loadedCatalog.fingerprint,
    toolchainMapFingerprint: loadedToolchains.fingerprint,
    invocation,
    containment,
    beforeWorkspace,
    afterWorkspace,
    beforeOutput,
    afterOutput,
    result,
    commandFingerprint,
    startedAtMs,
    completedAtMs,
  });
}

export function runTrustedProjectChecks({
  catalog = null,
  checkIds,
  phase,
  workspaceRoot,
  catalogFingerprint = null,
  expectedToolchainMapFingerprint = null,
  expectedSourceWorkspaceFingerprint = null,
  workspaceObservationSalt = "normal-session-workspace-v3",
  workspaceOwnershipPaths = [],
  workspaceGeneratedOutputPaths = [],
  observeWorkspace = observeContentBoundWorkspace,
  catalogLoader = loadProjectCheckCatalog,
  toolchainMapLoader = loadTrustedToolchainMap,
  toolchainResolver = resolveTrustedToolchainInvocation,
  toolchainIdentityAsserter = assertTrustedToolchainInvocationCurrent,
  containmentClassifier = classifyProcessContainment,
  containmentOptions = {},
  hostConfigurationLease = null,
  hostConfiguration = undefined,
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
  for (const [index, checkId] of checkIds.entries()) {
    const receipt = runTrustedProjectCheck({
      catalog,
      checkId,
      phase,
      workspaceRoot,
      catalogFingerprint,
      expectedToolchainMapFingerprint,
      expectedSourceWorkspaceFingerprint: index === 0 ? expectedSourceWorkspaceFingerprint : null,
      workspaceObservationSalt,
      workspaceOwnershipPaths,
      workspaceGeneratedOutputPaths,
      observeWorkspace,
      catalogLoader,
      toolchainMapLoader,
      toolchainResolver,
      toolchainIdentityAsserter,
      containmentClassifier,
      containmentOptions,
      hostConfigurationLease,
      hostConfiguration,
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

function expectedReceiptStatus(receipt) {
  if (BLOCKED_OUTCOMES.includes(receipt.observed_outcome)) return "blocked";
  if (receipt.purpose !== "bug_reproducer") {
    if (!["passed", "failed"].includes(receipt.observed_outcome)) return null;
    return receipt.observed_outcome;
  }
  if (!PROJECT_CHECK_OUTCOMES.includes(receipt.observed_outcome)) return null;
  const expected = receipt.phase === "preimplementation" ? "failing_reproducer" : "passing_regression";
  return receipt.observed_outcome === expected ? "passed" : "failed";
}

export function trustedProjectCheckResult(receipt) {
  const keys = [
    "schema_version", "producer", "command_id", "check_id", "phase", "purpose", "status", "observed_outcome",
    "exit_code", "signal", "duration_ms", "timeout_ms", "stdout_bytes", "stderr_bytes", "max_output_chars",
    "command_fingerprint", "catalog_fingerprint", "toolchain_map_fingerprint", "executable_identity_fingerprint",
    "toolchain_host_configuration_fingerprint", "toolchain_resolution_policy_version",
    "toolchain_environment_fingerprint", "toolchain_runtime_metadata_fingerprint",
    "containment_kind", "containment_state", "containment_identity_fingerprint", "source_workspace_fingerprint",
    "source_workspace_post_fingerprint", "output_workspace_fingerprint", "output_workspace_post_fingerprint",
    "output_workspace_post_entries", "evidence_fingerprint",
  ];
  try {
    assertPlain(receipt, "trusted project check receipt");
    exact(receipt, keys, keys, "trusted project check receipt");
    if (receipt.schema_version !== TRUSTED_PROJECT_CHECK_RECEIPT_SCHEMA_VERSION
      || receipt.producer !== TRUSTED_PROJECT_CHECK_PRODUCER
      || !PROJECT_CHECK_PHASES.includes(receipt.phase)
      || !["verification", "architecture_graph", "bug_reproducer"].includes(receipt.purpose)
      || !TRUSTED_PROJECT_CHECK_STATUSES.includes(receipt.status)
      || !TRUSTED_PROJECT_CHECK_OBSERVED_OUTCOMES.includes(receipt.observed_outcome)) {
      throw new ContractError("QUALITY_CHECK_RECEIPT", "trusted project check receipt metadata is invalid");
    }
    assertString(receipt.check_id, "trusted project check receipt.check_id", { maxBytes: 128 });
    if (receipt.command_id !== `trusted-project-check:${receipt.check_id}:${receipt.phase}`) {
      throw new ContractError("QUALITY_CHECK_RECEIPT", "trusted project check receipt command ID is invalid");
    }
    if (expectedReceiptStatus(receipt) !== receipt.status) {
      throw new ContractError("QUALITY_CHECK_RECEIPT", "trusted project check receipt outcome is inconsistent");
    }
    if (receipt.exit_code !== null) {
      assertInteger(receipt.exit_code, "trusted project check receipt.exit_code", { min: 0, max: 0xFFFFFFFF });
    }
    if (receipt.signal !== null) assertString(receipt.signal, "trusted project check receipt.signal", { maxBytes: 128 });
    for (const key of ["duration_ms", "timeout_ms", "stdout_bytes", "stderr_bytes", "max_output_chars"]) {
      assertInteger(receipt[key], `trusted project check receipt.${key}`, {
        min: key === "timeout_ms" || key === "max_output_chars" ? 1 : 0,
        max: Number.MAX_SAFE_INTEGER,
      });
    }
    for (const key of [
      "command_fingerprint", "catalog_fingerprint", "toolchain_map_fingerprint", "executable_identity_fingerprint",
      "toolchain_host_configuration_fingerprint", "toolchain_environment_fingerprint",
      "toolchain_runtime_metadata_fingerprint",
      "containment_identity_fingerprint", "source_workspace_fingerprint", "source_workspace_post_fingerprint",
      "output_workspace_fingerprint", "output_workspace_post_fingerprint", "evidence_fingerprint",
    ]) {
      assertFingerprint(receipt[key], `trusted project check receipt.${key}`);
    }
    assertString(
      receipt.toolchain_resolution_policy_version,
      "trusted project check receipt.toolchain_resolution_policy_version",
      { maxBytes: 128 },
    );
    if (receipt.toolchain_resolution_policy_version !== TRUSTED_TOOLCHAIN_RESOLUTION_POLICY_VERSION) {
      throw new ContractError("QUALITY_CHECK_RECEIPT", "trusted project check receipt toolchain policy is stale");
    }
    if (receipt.source_workspace_fingerprint !== receipt.source_workspace_post_fingerprint) {
      throw new ContractError("QUALITY_CHECK_RECEIPT", "trusted project check receipt records a source mutation");
    }
    if (!VERIFIED_CONTAINMENT_KINDS.includes(receipt.containment_kind)) {
      throw new ContractError("QUALITY_CHECK_RECEIPT", "trusted project check receipt containment kind is invalid");
    }
    assertPlain(receipt.containment_state, "trusted project check receipt.containment_state");
    const containmentKeys = [
      "support_state", "kind", "scope_id", "identity_fingerprint", "attached", "closed", "teardown_verified",
    ];
    exact(
      receipt.containment_state,
      containmentKeys,
      containmentKeys,
      "trusted project check receipt.containment_state",
    );
    if (receipt.containment_state.support_state !== "verified"
      || receipt.containment_state.kind !== receipt.containment_kind
      || receipt.containment_state.identity_fingerprint !== receipt.containment_identity_fingerprint
      || receipt.containment_state.attached !== true
      || receipt.containment_state.closed !== true
      || receipt.containment_state.teardown_verified !== true) {
      throw new ContractError("QUALITY_CHECK_RECEIPT", "trusted project check receipt containment state is invalid");
    }
    assertString(receipt.containment_state.scope_id, "trusted project check receipt.containment_state.scope_id", {
      maxBytes: 256,
    });
    validateOutputEntries(receipt.output_workspace_post_entries, "trusted project check receipt.output_workspace_post_entries");
    const expectedOutputFingerprint = fingerprint({
      schema_version: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
      entries: receipt.output_workspace_post_entries,
    });
    if (!fingerprintsEqual(receipt.output_workspace_post_fingerprint, expectedOutputFingerprint)) {
      throw new ContractError("QUALITY_CHECK_RECEIPT", "trusted project check receipt output fingerprint is invalid");
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
    status: receipt.status,
    command_id: receipt.command_id,
    exit_code: receipt.exit_code,
    observed_outcome: receipt.observed_outcome,
    receipt,
  });
}

export const assertTrustedProjectInvocationCurrent = assertTrustedToolchainInvocationCurrent;
