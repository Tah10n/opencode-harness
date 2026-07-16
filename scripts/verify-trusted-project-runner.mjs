import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import { classifyProcessContainment } from "../lib/feedback/process-containment.mjs";
import {
  PROJECT_CHECK_CATALOG_SCHEMA_VERSION,
  projectCheckCatalogFingerprint,
  validateProjectCheckCatalog,
} from "../lib/quality/project-check-catalog.mjs";
import {
  WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
  observeContentBoundWorkspace,
} from "../lib/quality/normal-session-workspace.mjs";
import {
  TRUSTED_PROJECT_CHECK_RECEIPT_SCHEMA_VERSION,
  TRUSTED_PROJECT_EXECUTION_POLICY_VERSION,
  runTrustedProjectCheck,
  runTrustedProjectChecks,
  managedCommandSpawnSync,
  trustedProjectCheckResult,
  trustedProjectCommandFingerprint,
} from "../lib/quality/trusted-project-runner.mjs";
import {
  TRUSTED_MACOS_NPM_SCRIPT_SHELL_PATH,
  trustedToolchainMapFingerprint,
  validateTrustedToolchainArguments,
  validateTrustedToolchainMap,
} from "../lib/quality/trusted-toolchains.mjs";
import { TRUSTED_TOOLCHAIN_RESOLUTION_POLICY_VERSION } from "../lib/quality/trusted-toolchain-host-config.mjs";
import { ContractError, fingerprint } from "../lib/quality/validation.mjs";
import {
  sealMilestone2OperationalReport,
  writeMilestone2OperationalReportFromEnvironment,
} from "../lib/quality/milestone-operational-report.mjs";

function expectCode(callback, code) {
  assert.throws(callback, (error) => error instanceof ContractError && error.code === code);
}

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const BUILT_IN_TOOLCHAIN_STATE_PREFIX = "opencode-quality-toolchain-state-v2-";

function builtInToolchainStateDirectories() {
  return new Set(fs.readdirSync(os.tmpdir(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(BUILT_IN_TOOLCHAIN_STATE_PREFIX))
    .slice(0, 32)
    .map((entry) => entry.name));
}

function boundedNpmFailureDiagnostic(previousDirectories) {
  const currentDirectories = [...builtInToolchainStateDirectories()]
    .filter((entry) => !previousDirectories.has(entry))
    .slice(0, 4);
  for (const directory of currentDirectories) {
    const logDirectory = path.join(os.tmpdir(), directory, "npm", "cache", "_logs");
    let logFiles;
    try {
      logFiles = fs.readdirSync(logDirectory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith("-debug-0.log"))
        .slice(0, 8);
    } catch {
      continue;
    }
    for (const entry of logFiles) {
      const logPath = path.join(logDirectory, entry.name);
      const stats = fs.statSync(logPath);
      if (stats.size < 1 || stats.size > 256 * 1024) continue;
      const log = fs.readFileSync(logPath, "utf8");
      const errorCode = log.match(/^\d+ error code ([A-Z][A-Z0-9_]*)$/mu)?.[1] ?? null;
      const syscall = log.match(/^\d+ error syscall ([A-Za-z0-9_./ -]{1,128})$/mu)?.[1] ?? null;
      const errnoText = log.match(/^\d+ error errno (-?\d{1,10})$/mu)?.[1] ?? null;
      return {
        log_found: true,
        error_code: errorCode,
        syscall,
        errno: errnoText === null ? null : Number(errnoText),
      };
    }
  }
  return { log_found: false, error_code: null, syscall: null, errno: null };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function workspaceSnapshot({ sourceEntries = [], outputEntries = [], dirty = false } = {}) {
  const body = {
    schema_version: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
    head_sha: "d".repeat(40),
    index_entry_count: 0,
    index_fingerprint: fingerprint({ index: "stable" }),
    entries: sourceEntries,
    dirty,
  };
  const sourceFingerprint = fingerprint(body);
  const outputFingerprint = fingerprint({
    schema_version: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
    entries: outputEntries,
  });
  return {
    ...body,
    declared_output_entries: outputEntries,
    source_fingerprint: sourceFingerprint,
    declared_outputs_fingerprint: outputFingerprint,
    fingerprint: fingerprint({
      schema_version: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
      source_fingerprint: sourceFingerprint,
      declared_outputs_fingerprint: outputFingerprint,
    }),
  };
}

function containmentDescriptor({
  supportState = "verified",
  kind = "windows-job-object-v1",
  reason = null,
  mechanism = { fixture_controller: "stable" },
} = {}) {
  const identity = {
    schema_version: 1,
    support_state: supportState,
    kind,
    scope_id: null,
    reason,
    mechanism,
  };
  return { ...identity, identity, fingerprint: fingerprint(identity) };
}

function containedExecution(execution = {}, {
  kind = "windows-job-object-v1",
  scopeId = "windows-job-fixture-scope",
} = {}) {
  const linuxParentIdentity = { canonical_path: "/fixture/cgroup/parent", fixture: true };
  const linuxHelperExecutable = {
    canonical_path: "/usr/local/libexec/opencode-quality-cgroup-attach",
    fixture: true,
  };
  const common = {
    schema_version: kind === "macos-exclusive-uid-v1" ? 1 : 2,
    support_state: "verified",
    kind,
    scope_id: scopeId,
    worker_pid: 4242,
  };
  let identity;
  if (kind === "windows-job-object-v1") {
    identity = {
      ...common,
      worker_creation_filetime: "123456789",
      worker_challenge_fingerprint: fingerprint("fixture-windows-worker-challenge"),
      controller_executable: { canonical_path: process.execPath, fixture: true },
      controller_source_fingerprint: fingerprint({ controller: "fixture" }),
    };
  } else if (kind === "macos-exclusive-uid-v1") {
    identity = {
      ...common,
      controller_pid: 4343,
      workload_uid: 501,
      worker_start_identity: { seconds: 10, microseconds: 20 },
      controller_start_identity: { seconds: 30, microseconds: 40 },
      preserved_ancestor_count: 2,
      preparation_scan_count: 3,
      controller_executable: { canonical_path: "/usr/local/libexec/opencode-quality-macos-controller", fixture: true },
      uid_marker: { canonical_path: "/var/db/opencode-quality/uid-501.marker", fixture: true },
      lease_file: { canonical_path: "/var/db/opencode-quality/uid-501.marker.lease", fixture: true },
      controller_protocol_version: 2,
      controller_protocol_fingerprint: fingerprint({ controller: "fixture-macos" }),
    };
  } else {
    identity = {
      ...common,
      worker_start_ticks: "123456",
      worker_challenge_fingerprint: fingerprint("fixture-linux-worker-challenge"),
      watchdog_pid: 4343,
      delegated_root_identity: { canonical_path: "/fixture/cgroup", fixture: true },
      current_parent_identity: linuxParentIdentity,
      guard_identity: linuxParentIdentity,
      leaf_identity: { canonical_path: `/fixture/cgroup/${scopeId}`, fixture: true },
      mount_point: "/sys/fs/cgroup",
      controller_executable: { canonical_path: process.execPath, fixture: true },
      controller_module: { canonical_path: "/fixture/process-containment.mjs", fixture: true },
      controller_source_fingerprint: fingerprint({ controller: "fixture-linux" }),
      attach_helper: {
        mode: "sudo-helper-v2",
        sudo: { canonical_path: "/usr/bin/sudo", fixture: true },
        executable: linuxHelperExecutable,
        policy_probe_executable: linuxHelperExecutable,
        guard_policy_fingerprint: fingerprint({ guard: linuxParentIdentity }),
      },
    };
  }
  const identityFingerprint = fingerprint(identity);
  const state = ["windows-job-object-v1", "macos-exclusive-uid-v1"].includes(kind)
    ? {
      support_state: "verified",
      kind,
      scope_id: scopeId,
      identity_fingerprint: identityFingerprint,
      attached: true,
      closed: true,
      controller_exited: true,
      controller_streams_closed: true,
      controller_exit_code: 0,
      teardown_verified: true,
      preparation_aborted: false,
      failure: null,
    }
    : {
      support_state: "verified",
      kind,
      scope_id: scopeId,
      identity_fingerprint: identityFingerprint,
      attached: true,
      closed: true,
      watchdog_exited: true,
      watchdog_streams_closed: true,
      watchdog_exit_code: 0,
      teardown_verified: true,
      failure: null,
    };
  return {
    status: 0,
    signal: null,
    stdout: Buffer.alloc(0),
    stderr: Buffer.alloc(0),
    error: undefined,
    ...execution,
    teardown_verified: true,
    containment_identity: identity,
    containment_fingerprint: identityFingerprint,
    containment_state: state,
  };
}

const tempRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(
  fs.realpathSync.native(os.tmpdir()),
  "opencode-harness-runner-v3-",
)));
assert.equal(fs.realpathSync.native(tempRoot), tempRoot, "runner fixture temp root must be physically canonical");
fs.mkdirSync(path.join(tempRoot, "project"), { recursive: true });

const catalog = validateProjectCheckCatalog({
  schema_version: PROJECT_CHECK_CATALOG_SCHEMA_VERSION,
  catalog_id: "runner-fixture-v2",
  checks: [
    {
      check_id: "pass",
      executable_id: "fixture-node",
      argv: ["fixture.mjs", "literal && argument"],
      cwd: "project",
      phases: ["preimplementation", "integration"],
      purpose: "verification",
      timeout_ms: 2500,
      max_output_chars: 32,
    },
    {
      check_id: "other",
      executable_id: "fixture-node",
      argv: ["other.mjs"],
      cwd: ".",
      phases: ["integration"],
      purpose: "verification",
      timeout_ms: 1000,
      max_output_chars: 32,
    },
    {
      check_id: "declared-output",
      executable_id: "fixture-node",
      argv: ["output.mjs"],
      cwd: "project",
      phases: ["integration"],
      purpose: "verification",
      generated_output_paths: ["project/generated.json"],
      timeout_ms: 1000,
      max_output_chars: 32,
    },
    {
      check_id: "reproducer",
      executable_id: "fixture-node",
      argv: ["reproducer.mjs"],
      cwd: "project",
      phases: ["preimplementation", "integration"],
      purpose: "bug_reproducer",
      outcome_protocol: {
        kind: "exit_code",
        exit_codes: {
          failing_reproducer: [10],
          passing_regression: [0],
          unrelated_failure: [20],
          unavailable: [30],
        },
      },
      timeout_ms: 1000,
      max_output_chars: 32,
    },
  ],
}, { workspaceRoot: tempRoot });
const catalogFingerprint = projectCheckCatalogFingerprint(catalog);
const toolchainMap = validateTrustedToolchainMap({
  schema_version: 1,
  map_id: "runner-tools-v1",
  toolchains: [{ executable_id: "fixture-node", resolver: "node" }],
});
const mapFingerprint = trustedToolchainMapFingerprint(toolchainMap);
const stableWorkspace = workspaceSnapshot();

function fixtureInvocation(overrides = {}) {
  const identities = [{
    role: "executable",
    canonical_path: process.execPath,
    device: "1",
    inode: "2",
    size: "3",
    mode: "4",
    modified_ns: "5",
    changed_ns: "6",
    content_fingerprint: fingerprint({ executable: "fixture" }),
  }, {
    role: "auxiliary_git_executable",
    canonical_path: process.execPath,
    device: "1",
    inode: "2",
    size: "3",
    mode: "4",
    modified_ns: "5",
    changed_ns: "6",
    content_fingerprint: fingerprint({ executable: "fixture" }),
  }, {
    role: "managed_worker_executable",
    canonical_path: process.execPath,
    device: "1",
    inode: "2",
    size: "3",
    mode: "4",
    modified_ns: "5",
    changed_ns: "6",
    content_fingerprint: fingerprint({ executable: "fixture" }),
  }];
  const managedWorkerIdentities = identities.filter((entry) => entry.role.startsWith("managed_worker_"));
  const managedWorkerIdentityFingerprint = fingerprint(managedWorkerIdentities);
  const hostContentFingerprint = fingerprint({ built_in: true, content: null });
  const hostNormalizedFingerprint = fingerprint({ built_in: true, configuration: null });
  const hostFingerprint = fingerprint({
    source_kind: "built_in",
    source_path: null,
    source_identity: null,
    content_fingerprint: hostContentFingerprint,
    configuration_fingerprint: hostNormalizedFingerprint,
    resolution_policy_version: TRUSTED_TOOLCHAIN_RESOLUTION_POLICY_VERSION,
  });
  const environmentBody = {
    schema_version: 1,
    profile_id: "trusted-node-environment-v2",
    variables: {},
    removed_variables: ["NODE_OPTIONS", "NODE_PATH"],
    path_entries: [path.dirname(process.execPath)],
    state_root: null,
  };
  const environmentProfile = { ...environmentBody, fingerprint: fingerprint(environmentBody) };
  const runtimeMetadata = {
    shell: false,
    strategy: "direct",
    project_root: path.join(tempRoot, "project"),
    state_root: null,
    state_root_boundary: null,
    java_home: null,
    distribution_root: null,
    distribution_identity_roles: [],
    distribution_manifest_fingerprint: null,
    distribution_manifest_spec: null,
    implicit_configuration: [],
    managed_worker_executable_path: process.execPath,
    managed_worker_identity_fingerprint: managedWorkerIdentityFingerprint,
    git: {
      executable_path: process.execPath,
      argv_prefix: [],
      directory: path.dirname(process.execPath),
      identity_fingerprint: fingerprint(identities.filter((entry) => entry.role.startsWith("auxiliary_git_"))),
    },
  };
  return {
    executable_id: "fixture-node",
    resolver: "node",
    strategy: "direct",
    executable_path: process.execPath,
    argv_prefix: [],
    identities,
    identity_fingerprint: fingerprint(identities),
    managed_worker_executable_path: process.execPath,
    managed_worker_identity_fingerprint: managedWorkerIdentityFingerprint,
    map_fingerprint: mapFingerprint,
    toolchain_host_configuration_source_kind: "built_in",
    toolchain_host_configuration_source_path: null,
    toolchain_host_configuration_content_fingerprint: hostContentFingerprint,
    toolchain_host_configuration_normalized_fingerprint: hostNormalizedFingerprint,
    toolchain_host_configuration_fingerprint: hostFingerprint,
    toolchain_host_configuration_source_identity: null,
    toolchain_resolution_policy_version: TRUSTED_TOOLCHAIN_RESOLUTION_POLICY_VERSION,
    environment_profile: environmentProfile,
    environment_fingerprint: environmentProfile.fingerprint,
    runtime_metadata: runtimeMetadata,
    runtime_metadata_fingerprint: fingerprint(runtimeMetadata),
    ...overrides,
  };
}

function runSynthetic({
  checkId = "pass",
  phase = "integration",
  execution = {},
  capture = null,
  ...overrides
} = {}) {
  let tick = 100;
  return runTrustedProjectCheck({
    catalog,
    checkId,
    phase,
    workspaceRoot: tempRoot,
    catalogFingerprint,
    expectedSourceWorkspaceFingerprint: stableWorkspace.source_fingerprint,
    observeWorkspace: () => clone(stableWorkspace),
    catalogLoader: () => ({ catalog, fingerprint: catalogFingerprint }),
    toolchainMapLoader: () => ({ map: toolchainMap, fingerprint: mapFingerprint }),
    toolchainResolver: () => fixtureInvocation(),
    toolchainIdentityAsserter: () => {},
    containmentClassifier: () => containmentDescriptor(),
    now: () => (tick += 5),
    spawn: (file, args, options) => {
      capture?.({ file, args, options });
      return containedExecution(execution);
    },
    ...overrides,
  });
}

let invocation;
const passed = runSynthetic({
  execution: {
    status: 0,
    stdout: Buffer.from("private stdout"),
    stderr: Buffer.from("private stderr"),
  },
  capture: (value) => { invocation = value; },
});
assert.equal(passed.schema_version, TRUSTED_PROJECT_CHECK_RECEIPT_SCHEMA_VERSION);
assert.equal(passed.status, "passed");
assert.equal(passed.observed_outcome, "passed");
assert.equal(passed.exit_code, 0);
assert.equal(passed.duration_ms, 5);
assert.equal(passed.stdout_bytes, 14);
assert.equal(passed.stderr_bytes, 14);
assert.equal(passed.source_workspace_fingerprint, passed.source_workspace_post_fingerprint);
assert.equal(passed.toolchain_host_configuration_fingerprint, fixtureInvocation().toolchain_host_configuration_fingerprint);
assert.equal(passed.toolchain_resolution_policy_version, TRUSTED_TOOLCHAIN_RESOLUTION_POLICY_VERSION);
assert.equal(passed.toolchain_environment_fingerprint, fixtureInvocation().environment_fingerprint);
assert.equal(passed.toolchain_runtime_metadata_fingerprint, fixtureInvocation().runtime_metadata_fingerprint);
assert.equal(invocation.file, process.execPath);
assert.deepEqual(invocation.args, ["fixture.mjs", "literal && argument"]);
assert.equal(invocation.options.shell, false);
assert.equal(invocation.options.cwd, fs.realpathSync(path.join(tempRoot, "project")));
assert.equal(invocation.options.timeout, 2500);
assert.equal(invocation.options.expectedInvocation.identity_fingerprint, fixtureInvocation().identity_fingerprint);
assert.equal(invocation.options.expectedInvocation.managed_worker_executable_path, process.execPath);
assert.equal(
  invocation.options.expectedInvocation.managed_worker_identity_fingerprint,
  fixtureInvocation().managed_worker_identity_fingerprint,
);
assert.match(invocation.options.expectedWorkingDirectoryIdentity.inode, /^[0-9]+$/u);
assert.equal(invocation.options.env.NODE_OPTIONS, undefined);
for (const key of [
  "OPENCODE_QUALITY_CGROUP_ROOT",
  "OPENCODE_QUALITY_CGROUP_ATTACH_MODE",
  "OPENCODE_QUALITY_CGROUP_ATTACH_HELPER",
  "OPENCODE_QUALITY_MACOS_CONTROLLER",
  "OPENCODE_QUALITY_MACOS_WORKLOAD_UID",
  "OPENCODE_QUALITY_MACOS_UID_MARKER",
]) assert.equal(invocation.options.env[key], undefined, `${key} crossed into a trusted project command`);
const syntheticPathEntries = (invocation.options.env.PATH ?? invocation.options.env.Path).split(path.delimiter);
assert.equal(syntheticPathEntries[0], path.dirname(process.execPath));
assert.equal(syntheticPathEntries.length, process.platform === "win32" ? 2 : 1);
if (process.platform === "win32") assert.equal(path.basename(syntheticPathEntries[1]).toLowerCase(), "system32");
assert.equal(JSON.stringify(passed).includes("private stdout"), false);
assert.equal(JSON.stringify(passed).includes("private stderr"), false);
assert.equal(trustedProjectCheckResult(passed).status, "passed");
assert.equal(trustedProjectCheckResult(passed).command_id, "trusted-project-check:pass:integration");
assert.equal(trustedProjectCheckResult(passed).observed_outcome, "passed");

const syntheticProject = path.join(tempRoot, "project");
const syntheticProjectOriginal = path.join(tempRoot, "project-before-cwd-swap");
const syntheticSwapMarker = path.join(tempRoot, "cwd-swap-command-side-effect.txt");
expectCode(() => runSynthetic({
  spawn: (file, args, options) => {
    fs.renameSync(syntheticProject, syntheticProjectOriginal);
    fs.mkdirSync(syntheticProject);
    fs.writeFileSync(path.join(syntheticProject, "fixture.mjs"), `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(syntheticSwapMarker)}, "executed", "utf8");\n`, "utf8");
    try {
      return managedCommandSpawnSync(file, args, options);
    } finally {
      fs.rmSync(syntheticProject, { recursive: true, force: true });
      fs.renameSync(syntheticProjectOriginal, syntheticProject);
    }
  },
}), "QUALITY_CHECK_TEARDOWN_UNVERIFIED");
assert.equal(fs.existsSync(syntheticSwapMarker), false, "replacement cwd command produced a side effect");

const linuxContainmentDescriptor = containmentDescriptor({
  kind: "linux-cgroup-v2",
  mechanism: {
    root_identity: { canonical_path: "/fixture/cgroup", fixture: true },
    current_parent_identity: { canonical_path: "/fixture/cgroup/parent", fixture: true },
    guard_identity: { canonical_path: "/fixture/cgroup/parent", fixture: true },
    mount_point: "/sys/fs/cgroup",
    attach_helper: { mode: "sudo-helper-v2" },
  },
});
const linuxPassed = runSynthetic({
  containmentClassifier: () => linuxContainmentDescriptor,
  spawn: () => containedExecution({}, { kind: "linux-cgroup-v2", scopeId: "linux-cgroup-fixture-scope" }),
});
assert.equal(linuxPassed.status, "passed");
assert.equal(linuxPassed.containment_kind, "linux-cgroup-v2");

const macosContainmentDescriptor = containmentDescriptor({
  kind: "macos-exclusive-uid-v1",
  mechanism: {
    controller_executable: {
      canonical_path: "/usr/local/libexec/opencode-quality-macos-controller",
      fixture: true,
    },
    workload_uid: 501,
    uid_marker: {
      canonical_path: "/var/db/opencode-quality/uid-501.marker",
      fixture: true,
    },
    lease_file: {
      canonical_path: "/var/db/opencode-quality/uid-501.marker.lease",
      fixture: true,
    },
    controller_protocol_version: 2,
    controller_protocol_fingerprint: fingerprint({ controller: "fixture-macos" }),
  },
});
const macosPassed = runSynthetic({
  containmentClassifier: () => macosContainmentDescriptor,
  spawn: () => containedExecution({}, {
    kind: "macos-exclusive-uid-v1",
    scopeId: "macos-exclusive-uid-fixture-scope",
  }),
});
assert.equal(macosPassed.status, "passed");
assert.equal(macosPassed.containment_kind, "macos-exclusive-uid-v1");

const mismatchedLinuxExecution = structuredClone(containedExecution({}, {
  kind: "linux-cgroup-v2",
  scopeId: "linux-cgroup-mismatched-guard",
}));
mismatchedLinuxExecution.containment_identity.guard_identity = {
  canonical_path: "/fixture/cgroup/different-parent",
  fixture: true,
};
mismatchedLinuxExecution.containment_fingerprint = fingerprint(mismatchedLinuxExecution.containment_identity);
mismatchedLinuxExecution.containment_state.identity_fingerprint = mismatchedLinuxExecution.containment_fingerprint;
expectCode(() => runSynthetic({
  containmentClassifier: () => linuxContainmentDescriptor,
  spawn: () => mismatchedLinuxExecution,
}), "QUALITY_CHECK_TEARDOWN_UNVERIFIED");

expectCode(
  () => trustedProjectCheckResult({ ...passed, schema_version: 1 }),
  "QUALITY_CHECK_RECEIPT",
);
expectCode(
  () => trustedProjectCheckResult({
    ...passed,
    schema_version: 2,
    producer: "opencode-harness/trusted-project-runner-v2",
    toolchain_resolution_policy_version: "trusted-toolchain-resolution-v2",
  }),
  "QUALITY_CHECK_RECEIPT",
);
expectCode(
  () => trustedProjectCheckResult({ ...passed, source_workspace_post_fingerprint: fingerprint({ forged: true }) }),
  "QUALITY_CHECK_RECEIPT",
);
expectCode(
  () => trustedProjectCheckResult({ ...passed, status: "failed" }),
  "QUALITY_CHECK_RECEIPT",
);
expectCode(
  () => trustedProjectCheckResult({
    ...passed,
    output_workspace_post_entries: [{ path: "forged.json", fingerprint: fingerprint({ forged: true }) }],
  }),
  "QUALITY_CHECK_RECEIPT",
);
expectCode(
  () => trustedProjectCheckResult({
    ...passed,
    toolchain_environment_fingerprint: fingerprint({ forged: "environment" }),
  }),
  "QUALITY_CHECK_RECEIPT",
);
expectCode(
  () => trustedProjectCheckResult({
    ...passed,
    toolchain_runtime_metadata_fingerprint: fingerprint({ forged: "runtime-metadata" }),
  }),
  "QUALITY_CHECK_RECEIPT",
);
expectCode(
  () => trustedProjectCheckResult({
    ...passed,
    toolchain_resolution_policy_version: "forged-policy",
  }),
  "QUALITY_CHECK_RECEIPT",
);

for (const [execution, expectedStatus, expectedOutcome] of [
  [{ status: 7 }, "failed", "failed"],
  [{ status: 0xC0000005 }, "failed", "failed"],
  [{ status: null, signal: "SIGTERM", error: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }) }, "blocked", "timed_out"],
  [{ status: null, error: Object.assign(new Error("missing"), { code: "ENOENT" }) }, "blocked", "unavailable"],
  [{ status: null, stdout: Buffer.alloc(33), error: Object.assign(new Error("buffer"), { code: "ENOBUFS" }) }, "blocked", "oversized"],
  [{ status: null, error: new Error("unexpected") }, "blocked", "malformed"],
]) {
  const receipt = runSynthetic({ execution });
  assert.equal(receipt.status, expectedStatus);
  assert.equal(receipt.observed_outcome, expectedOutcome);
  assert.equal(trustedProjectCheckResult(receipt).status, expectedStatus);
}

for (const [phase, exitCode, expectedStatus, expectedOutcome] of [
  ["preimplementation", 10, "passed", "failing_reproducer"],
  ["preimplementation", 0, "failed", "passing_regression"],
  ["preimplementation", 20, "failed", "unrelated_failure"],
  ["preimplementation", 30, "blocked", "unavailable"],
  ["integration", 0, "passed", "passing_regression"],
  ["integration", 10, "failed", "failing_reproducer"],
  ["integration", 20, "failed", "unrelated_failure"],
  ["integration", 30, "blocked", "unavailable"],
  ["integration", 99, "blocked", "malformed"],
]) {
  const receipt = runSynthetic({ checkId: "reproducer", phase, execution: { status: exitCode } });
  assert.equal(receipt.status, expectedStatus, `${phase}:${exitCode}`);
  assert.equal(receipt.observed_outcome, expectedOutcome, `${phase}:${exitCode}`);
}

expectCode(() => validateProjectCheckCatalog({
  schema_version: PROJECT_CHECK_CATALOG_SCHEMA_VERSION,
  catalog_id: "dishonest-reproducer-v2",
  checks: [{
    check_id: "integration-only",
    executable_id: "fixture-node",
    argv: ["reproducer.mjs"],
    cwd: "project",
    phases: ["integration"],
    purpose: "bug_reproducer",
    outcome_protocol: {
      kind: "exit_code",
      exit_codes: {
        failing_reproducer: [10],
        passing_regression: [0],
        unrelated_failure: [20],
        unavailable: [30],
      },
    },
    timeout_ms: 1000,
    max_output_chars: 32,
  }],
}, { workspaceRoot: tempRoot }), "QUALITY_CHECK_REPRODUCER");

expectCode(() => runSynthetic({ checkId: "missing" }), "QUALITY_CHECK_UNKNOWN");
expectCode(() => runSynthetic({ checkId: "other", phase: "slice" }), "QUALITY_CHECK_PHASE");
expectCode(() => runSynthetic({ catalogFingerprint: fingerprint({ stale: true }) }), "QUALITY_CHECK_CATALOG_DRIFT");
expectCode(
  () => runSynthetic({ expectedToolchainMapFingerprint: fingerprint({ stale: "toolchain-map" }) }),
  "QUALITY_TOOLCHAIN_MAP_DRIFT",
);

for (const [family, argv] of [
  ["maven", ["-Dmaven.repo.local=.m2/repository", "verify"]],
  ["maven", ["--settings", ".m2/settings.xml", "verify"]],
  ["gradle", ["--gradle-user-home", ".gradle", "check"]],
  ["gradle", ["-I.gradle/init.gradle", "check"]],
]) {
  const unsafeCatalog = validateProjectCheckCatalog({
    schema_version: PROJECT_CHECK_CATALOG_SCHEMA_VERSION,
    catalog_id: `unsafe-${family}-state-override-v1`,
    checks: [{
      check_id: "unsafe-state-override",
      executable_id: family,
      argv,
      cwd: "project",
      phases: ["integration"],
      purpose: "verification",
      timeout_ms: 1000,
      max_output_chars: 32,
    }],
  }, { workspaceRoot: tempRoot });
  const unsafeCatalogFingerprint = projectCheckCatalogFingerprint(unsafeCatalog);
  const unsafeMap = validateTrustedToolchainMap({
    schema_version: 1,
    map_id: `unsafe-${family}-map-v1`,
    toolchains: [{ executable_id: family, resolver: family }],
  });
  const unsafeMapFingerprint = trustedToolchainMapFingerprint(unsafeMap);
  let spawnCalled = false;
  expectCode(() => runTrustedProjectCheck({
    catalog: unsafeCatalog,
    checkId: "unsafe-state-override",
    phase: "integration",
    workspaceRoot: tempRoot,
    catalogFingerprint: unsafeCatalogFingerprint,
    catalogLoader: () => ({ catalog: unsafeCatalog, fingerprint: unsafeCatalogFingerprint }),
    toolchainMapLoader: () => ({ map: unsafeMap, fingerprint: unsafeMapFingerprint }),
    toolchainResolver: (input) => {
      validateTrustedToolchainArguments(family, input.argv);
      return fixtureInvocation({ resolver: family, map_fingerprint: unsafeMapFingerprint });
    },
    spawn: () => {
      spawnCalled = true;
      return containedExecution();
    },
  }), "QUALITY_TOOLCHAIN_ARGUMENT");
  assert.equal(spawnCalled, false, `${family} state override reached the process boundary`);
}
expectCode(
  () => runSynthetic({ expectedSourceWorkspaceFingerprint: fingerprint({ stale: true }) }),
  "QUALITY_CHECK_WORKSPACE_DRIFT",
);

const sourceChanged = workspaceSnapshot({
  sourceEntries: [{ path: "project/source.mjs", fingerprint: fingerprint({ source: "changed" }) }],
  dirty: true,
});
let sourceObservations = 0;
expectCode(() => runSynthetic({
  observeWorkspace: () => clone(sourceObservations++ === 0 ? stableWorkspace : sourceChanged),
}), "QUALITY_CHECK_WORKSPACE_MUTATED");

const declaredEntry = { path: "project/generated.json", fingerprint: fingerprint({ output: "new" }) };
const outputChanged = workspaceSnapshot({ outputEntries: [declaredEntry] });
let outputObservations = 0;
let observedOptions;
const outputReceipt = runSynthetic({
  checkId: "declared-output",
  observeWorkspace: (_root, _salt, options) => {
    observedOptions = options;
    return clone(outputObservations++ === 0 ? stableWorkspace : outputChanged);
  },
});
assert.equal(outputReceipt.status, "passed");
assert.notEqual(outputReceipt.output_workspace_fingerprint, outputReceipt.output_workspace_post_fingerprint);
assert.deepEqual(outputReceipt.output_workspace_post_entries, [declaredEntry]);
assert.deepEqual(observedOptions, {
  ownershipPaths: [],
  generatedOutputPaths: ["project/generated.json"],
});
assert.equal(trustedProjectCheckResult(outputReceipt).status, "passed");

const otherOutput = { path: "project/other.json", fingerprint: fingerprint({ output: "other" }) };
const globalBefore = workspaceSnapshot({ outputEntries: [otherOutput] });
const globalAfter = workspaceSnapshot({ outputEntries: [declaredEntry, otherOutput] });
let globalObservations = 0;
let globalOptions;
let globalSalt;
const globalOutputReceipt = runSynthetic({
  checkId: "declared-output",
  expectedSourceWorkspaceFingerprint: globalBefore.source_fingerprint,
  workspaceObservationSalt: "session-specific-workspace-salt",
  workspaceGeneratedOutputPaths: ["project/other.json"],
  observeWorkspace: (_root, salt, options) => {
    globalSalt = salt;
    globalOptions = options;
    return clone(globalObservations++ === 0 ? globalBefore : globalAfter);
  },
});
assert.equal(globalSalt, "session-specific-workspace-salt");
assert.deepEqual(globalOptions.generatedOutputPaths, ["project/generated.json", "project/other.json"]);
assert.deepEqual(globalOutputReceipt.output_workspace_post_entries, [declaredEntry]);
assert.equal(globalOutputReceipt.output_workspace_post_fingerprint, outputChanged.declared_outputs_fingerprint);

const otherOutputChanged = { path: "project/other.json", fingerprint: fingerprint({ output: "other-changed" }) };
let unauthorizedOutputObservations = 0;
expectCode(() => runSynthetic({
  checkId: "declared-output",
  expectedSourceWorkspaceFingerprint: globalBefore.source_fingerprint,
  workspaceGeneratedOutputPaths: ["project/other.json"],
  observeWorkspace: () => clone(unauthorizedOutputObservations++ === 0
    ? globalBefore
    : workspaceSnapshot({ outputEntries: [otherOutputChanged] })),
}), "QUALITY_CHECK_WORKSPACE_MUTATED");

expectCode(() => runSynthetic({
  observeWorkspace: () => ({ ...clone(stableWorkspace), schema_version: 1 }),
}), "QUALITY_WORKSPACE_SCHEMA");
expectCode(() => runSynthetic({
  spawn: () => ({ status: 0, teardown_verified: false }),
}), "QUALITY_CHECK_TEARDOWN_UNVERIFIED");
expectCode(() => runSynthetic({
  spawn: () => {
    const forged = containedExecution();
    forged.containment_fingerprint = fingerprint({ forged: true });
    return forged;
  },
}), "QUALITY_CHECK_TEARDOWN_UNVERIFIED");

expectCode(() => runSynthetic({
  containmentClassifier: () => containmentDescriptor({
    supportState: "unsupported",
    kind: "macos-unsupported-v1",
    reason: "no_verified_descendant_controller",
    mechanism: null,
  }),
}), "QUALITY_CHECK_CONTAINMENT_UNSUPPORTED");
expectCode(() => runSynthetic({
  containmentClassifier: () => containmentDescriptor({
    supportState: "unavailable",
    kind: "linux-cgroup-v2",
    reason: "delegated_root_missing",
    mechanism: null,
  }),
}), "QUALITY_CHECK_CONTAINMENT_UNAVAILABLE");

let catalogLoads = 0;
const changedCatalog = validateProjectCheckCatalog({
  ...clone(catalog),
  catalog_id: "runner-fixture-drift-v2",
}, { workspaceRoot: tempRoot });
expectCode(() => runSynthetic({
  catalogLoader: () => {
    const current = catalogLoads++ === 0 ? catalog : changedCatalog;
    return { catalog: current, fingerprint: projectCheckCatalogFingerprint(current) };
  },
}), "QUALITY_CHECK_CATALOG_DRIFT");

let mapLoads = 0;
const changedMap = validateTrustedToolchainMap({ ...clone(toolchainMap), map_id: "runner-tools-drift-v1" });
expectCode(() => runSynthetic({
  toolchainMapLoader: () => {
    const current = mapLoads++ === 0 ? toolchainMap : changedMap;
    return { map: current, fingerprint: trustedToolchainMapFingerprint(current) };
  },
}), "QUALITY_TOOLCHAIN_MAP_DRIFT");

let containmentLoads = 0;
expectCode(() => runSynthetic({
  containmentClassifier: () => containmentDescriptor({
    mechanism: { fixture_controller: containmentLoads++ === 0 ? "before" : "after" },
  }),
}), "QUALITY_CHECK_CONTAINMENT_DRIFT");

expectCode(() => runSynthetic({
  toolchainIdentityAsserter: () => {
    throw new ContractError("QUALITY_TOOLCHAIN_IDENTITY_CHANGED", "fixture drift");
  },
}), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");
let identityChecks = 0;
expectCode(() => runSynthetic({
  toolchainIdentityAsserter: () => {
    identityChecks += 1;
    if (identityChecks === 2) throw new ContractError("QUALITY_TOOLCHAIN_IDENTITY_CHANGED", "fixture drift");
  },
}), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");

const fingerprintInput = {
  checkId: "pass",
  phase: "integration",
  purpose: "verification",
  argv: ["fixture.mjs"],
  cwd: "project",
  catalogFingerprint,
  toolchainMapFingerprint: mapFingerprint,
  executableIdentityFingerprint: fixtureInvocation().identity_fingerprint,
  toolchainHostConfigurationFingerprint: fixtureInvocation().toolchain_host_configuration_fingerprint,
  toolchainResolutionPolicyVersion: TRUSTED_TOOLCHAIN_RESOLUTION_POLICY_VERSION,
  toolchainEnvironmentFingerprint: fixtureInvocation().environment_fingerprint,
  toolchainRuntimeMetadataFingerprint: fixtureInvocation().runtime_metadata_fingerprint,
  environmentIdentity: {
    policy_version: TRUSTED_PROJECT_EXECUTION_POLICY_VERSION,
    fingerprint: fingerprint({ PATH: "trusted" }),
  },
  containmentKind: "windows-job-object-v1",
  containmentIdentityFingerprint: fingerprint({ containment: "one" }),
  sourceWorkspaceFingerprint: stableWorkspace.source_fingerprint,
  outputWorkspaceFingerprint: stableWorkspace.declared_outputs_fingerprint,
  workingDirectoryIdentityFingerprint: fingerprint({ cwd: "one" }),
};
assert.notEqual(
  trustedProjectCommandFingerprint(fingerprintInput),
  trustedProjectCommandFingerprint({
    ...fingerprintInput,
    executableIdentityFingerprint: fingerprint({ executable: "changed" }),
  }),
  "command fingerprint did not bind toolchain identity",
);
assert.notEqual(
  trustedProjectCommandFingerprint(fingerprintInput),
  trustedProjectCommandFingerprint({
    ...fingerprintInput,
    containmentIdentityFingerprint: fingerprint({ containment: "two" }),
  }),
  "command fingerprint did not bind containment identity",
);
assert.notEqual(
  trustedProjectCommandFingerprint(fingerprintInput),
  trustedProjectCommandFingerprint({ ...fingerprintInput, outputWorkspaceFingerprint: fingerprint({ output: "changed" }) }),
  "command fingerprint did not bind declared-output state",
);
assert.notEqual(
  trustedProjectCommandFingerprint(fingerprintInput),
  trustedProjectCommandFingerprint({
    ...fingerprintInput,
    workingDirectoryIdentityFingerprint: fingerprint({ cwd: "two" }),
  }),
  "command fingerprint did not bind working-directory identity",
);
assert.notEqual(
  trustedProjectCommandFingerprint(fingerprintInput),
  trustedProjectCommandFingerprint({
    ...fingerprintInput,
    toolchainRuntimeMetadataFingerprint: fingerprint({ runtime_metadata: "changed" }),
  }),
  "command fingerprint did not bind toolchain runtime metadata",
);

const batch = runTrustedProjectChecks({
  catalog,
  checkIds: ["pass", "other"],
  phase: "integration",
  workspaceRoot: tempRoot,
  catalogFingerprint,
  expectedSourceWorkspaceFingerprint: stableWorkspace.source_fingerprint,
  observeWorkspace: () => clone(stableWorkspace),
  catalogLoader: () => ({ catalog, fingerprint: catalogFingerprint }),
  toolchainMapLoader: () => ({ map: toolchainMap, fingerprint: mapFingerprint }),
  toolchainResolver: () => fixtureInvocation(),
  toolchainIdentityAsserter: () => {},
  containmentClassifier: () => containmentDescriptor(),
  spawn: () => containedExecution(),
  now: () => 1,
});
assert.equal(batch.complete, true);
assert.equal(batch.receipts.length, 2);
assert(batch.receipt_bytes > 0);
expectCode(() => runTrustedProjectChecks({
  catalog,
  checkIds: ["pass", "pass"],
  phase: "integration",
  workspaceRoot: tempRoot,
}), "QUALITY_CHECK_RUN_LIMIT");
expectCode(() => runTrustedProjectChecks({
  catalog,
  checkIds: ["pass"],
  phase: "integration",
  workspaceRoot: tempRoot,
  catalogFingerprint,
  observeWorkspace: () => clone(stableWorkspace),
  catalogLoader: () => ({ catalog, fingerprint: catalogFingerprint }),
  toolchainMapLoader: () => ({ map: toolchainMap, fingerprint: mapFingerprint }),
  toolchainResolver: () => fixtureInvocation(),
  toolchainIdentityAsserter: () => {},
  containmentClassifier: () => containmentDescriptor(),
  spawn: () => containedExecution(),
  maxReceiptBytes: 1,
}), "QUALITY_CHECK_RECEIPT_LIMIT");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false, windowsHide: true });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
}

const realRoot = path.join(tempRoot, "real-project");
const realProject = path.join(realRoot, "project");
fs.mkdirSync(path.join(realRoot, ".opencode", "quality"), { recursive: true });
fs.mkdirSync(realProject, { recursive: true });
fs.writeFileSync(path.join(realRoot, ".gitignore"), "node_modules/\n.env\ncoverage/\nbuild/\n", "utf8");
fs.writeFileSync(path.join(realProject, "environment-fixture.mjs"), `import fs from "node:fs";
import { spawnSync } from "node:child_process";
const names = ["NODE_OPTIONS", "NODE_PATH", "npm_execpath", "npm_config_registry", "AWS_SECRET_ACCESS_KEY", "GH_TOKEN", "PATH", "Path", "OPENCODE_QUALITY_GIT_EXECUTABLE", "OPENCODE_QUALITY_CGROUP_ROOT", "OPENCODE_QUALITY_CGROUP_ATTACH_MODE", "OPENCODE_QUALITY_CGROUP_ATTACH_HELPER", "OPENCODE_QUALITY_MACOS_CONTROLLER", "OPENCODE_QUALITY_MACOS_WORKLOAD_UID", "OPENCODE_QUALITY_MACOS_UID_MARKER"];
const observed = Object.fromEntries(names.map((name) => [name, process.env[name] ?? null]));
const git = spawnSync("git", ["--version"], { encoding: "utf8", env: process.env, shell: false, windowsHide: true });
observed.git_by_name = {
  status: git.status,
  signal: git.signal,
  error_code: git.error?.code ?? null,
  stdout: typeof git.stdout === "string" ? git.stdout.trim() : null,
  stderr: typeof git.stderr === "string" ? git.stderr.trim() : null,
};
fs.writeFileSync(process.argv[2], JSON.stringify(observed), "utf8");
`, "utf8");
fs.writeFileSync(path.join(realProject, "ignored-output-fixture.mjs"), `import fs from "node:fs";
for (const file of ["coverage/result.txt", "build/result.txt"]) {
  fs.mkdirSync(file.split("/").slice(0, -1).join("/"), { recursive: true });
  fs.writeFileSync(file, "ignored", "utf8");
}
fs.writeFileSync(".env", "IGNORED_SECRET=changed", "utf8");
`, "utf8");
fs.writeFileSync(path.join(realProject, "architecture-fixture.mjs"), `import fs from "node:fs";
fs.mkdirSync("artifacts", { recursive: true });
fs.writeFileSync(process.argv[2], JSON.stringify({ nodes: ["entry"], edges: [] }), "utf8");
`, "utf8");
fs.writeFileSync(path.join(realProject, "delayed-writer.mjs"), `import fs from "node:fs";
const [marker, delay] = process.argv.slice(2);
setTimeout(() => fs.writeFileSync(marker, "late", "utf8"), Number(delay));
setInterval(() => {}, 60_000);
`, "utf8");
fs.writeFileSync(path.join(realProject, "direct-exit-parent.mjs"), `import { spawn } from "node:child_process";
const child = spawn(process.execPath, ["delayed-writer.mjs", process.argv[2], "700"], {
  detached: process.platform === "win32", stdio: "ignore", windowsHide: true,
});
child.unref();
`, "utf8");
fs.writeFileSync(path.join(realProject, "survivor-monitor.mjs"), `import fs from "node:fs";
const [parentPid, marker] = process.argv.slice(2);
setInterval(() => {
  try { process.kill(Number(parentPid), 0); }
  catch { fs.writeFileSync(marker, "survived", "utf8"); process.exit(0); }
}, 50);
`, "utf8");
fs.writeFileSync(path.join(realProject, "timeout-parent.mjs"), `import fs from "node:fs";
import { spawn } from "node:child_process";
fs.writeFileSync(process.argv[3], "started", "utf8");
const child = spawn(process.execPath, ["survivor-monitor.mjs", String(process.pid), process.argv[2]], {
  detached: process.platform === "win32", stdio: "ignore", windowsHide: true,
});
child.unref();
setInterval(() => {}, 60_000);
`, "utf8");
fs.writeFileSync(path.join(realProject, "npm-known-fixture.mjs"), `import fs from "node:fs";
fs.writeFileSync("npm-known-marker.txt", JSON.stringify({
  marker: "real",
  script_shell: process.env.NPM_CONFIG_SCRIPT_SHELL ?? null,
  path: process.env.PATH ?? null,
}), "utf8");
`, "utf8");
const poisonMarker = path.join(realProject, "poison-marker.txt");
const poisonedNpmCli = path.join(realProject, "poisoned-npm-cli.mjs");
fs.writeFileSync(poisonedNpmCli, `import fs from "node:fs";
fs.writeFileSync(${JSON.stringify(poisonMarker)}, "poisoned", "utf8");
`, "utf8");
writeJson(path.join(realProject, "package.json"), {
  name: "trusted-runner-v2-fixture",
  private: true,
  scripts: { known: "node npm-known-fixture.mjs" },
});

const realCatalogValue = {
  schema_version: PROJECT_CHECK_CATALOG_SCHEMA_VERSION,
  catalog_id: "runner-real-v2",
  checks: [
    {
      check_id: "environment",
      executable_id: "node",
      argv: ["environment-fixture.mjs", "environment-marker.json"],
      cwd: "project",
      phases: ["integration"],
      purpose: "verification",
      generated_output_paths: ["project/environment-marker.json"],
      timeout_ms: 5000,
      max_output_chars: 4096,
    },
    {
      check_id: "ignored-output",
      executable_id: "node",
      argv: ["ignored-output-fixture.mjs"],
      cwd: "project",
      phases: ["integration"],
      purpose: "verification",
      timeout_ms: 5000,
      max_output_chars: 4096,
    },
    {
      check_id: "architecture-output",
      executable_id: "node",
      argv: ["architecture-fixture.mjs", "artifacts/graph.json"],
      cwd: "project",
      phases: ["integration"],
      purpose: "architecture_graph",
      generated_output_paths: ["project/artifacts/graph.json"],
      timeout_ms: 5000,
      max_output_chars: 4096,
    },
    {
      check_id: "direct-exit",
      executable_id: "node",
      argv: ["direct-exit-parent.mjs", "descendant-marker.txt"],
      cwd: "project",
      phases: ["integration"],
      purpose: "verification",
      generated_output_paths: ["project/descendant-marker.txt"],
      timeout_ms: 5000,
      max_output_chars: 4096,
    },
    {
      check_id: "timeout-descendant",
      executable_id: "node",
      argv: ["timeout-parent.mjs", "timeout-descendant-marker.txt", "timeout-started-marker.txt"],
      cwd: "project",
      phases: ["integration"],
      purpose: "verification",
      generated_output_paths: [
        "project/timeout-descendant-marker.txt",
        "project/timeout-started-marker.txt",
      ],
      timeout_ms: 3000,
      max_output_chars: 4096,
    },
    {
      check_id: "npm-known",
      executable_id: "npm",
      argv: ["run", "known"],
      cwd: "project",
      phases: ["integration"],
      purpose: "verification",
      generated_output_paths: ["project/npm-known-marker.txt"],
      timeout_ms: 10000,
      max_output_chars: 32 * 1024,
    },
  ],
};
const realToolchainValue = {
  schema_version: 1,
  map_id: "runner-real-toolchains-v1",
  toolchains: [
    { executable_id: "node", resolver: "node" },
    { executable_id: "npm", resolver: "npm" },
  ],
};
writeJson(path.join(realRoot, ".opencode", "quality", "checks.json"), realCatalogValue);
writeJson(path.join(realRoot, ".opencode", "quality", "toolchains.json"), realToolchainValue);
git(realRoot, ["init", "-q"]);
git(realRoot, ["config", "user.email", "runner@example.invalid"]);
git(realRoot, ["config", "user.name", "Runner Fixture"]);
git(realRoot, ["config", "commit.gpgsign", "false"]);
git(realRoot, ["add", "."]);
git(realRoot, ["commit", "-q", "-m", "fixture"]);

const ignoredModules = path.join(realProject, "node_modules", "large-tree");
fs.mkdirSync(ignoredModules, { recursive: true });
for (let index = 0; index < 4105; index += 1) {
  fs.writeFileSync(path.join(ignoredModules, `file-${index}.txt`), "ignored", "utf8");
}
fs.writeFileSync(path.join(realProject, ".env"), "IGNORED_SECRET=before", "utf8");
const ignoredBaseline = observeContentBoundWorkspace(realRoot);
assert.equal(ignoredBaseline.entries.some((entry) => entry.path.includes("node_modules")), false);
assert.equal(ignoredBaseline.entries.some((entry) => entry.path.endsWith(".env")), false);

const realCatalog = validateProjectCheckCatalog(realCatalogValue, { workspaceRoot: realRoot });
const realCatalogFingerprint = projectCheckCatalogFingerprint(realCatalog);
function realCheckSnapshot(checkId) {
  const check = realCatalog.checks.find((entry) => entry.check_id === checkId);
  return observeContentBoundWorkspace(realRoot, "normal-session-workspace-v3", {
    ownershipPaths: [],
    generatedOutputPaths: check.generated_output_paths,
  });
}
function runRealCheck(checkId) {
  const before = realCheckSnapshot(checkId);
  return runTrustedProjectCheck({
    catalog: realCatalog,
    checkId,
    phase: "integration",
    workspaceRoot: realRoot,
    catalogFingerprint: realCatalogFingerprint,
    expectedSourceWorkspaceFingerprint: before.source_fingerprint,
  });
}

const platformClassification = classifyProcessContainment();
let runtimeResult;
const operationalReceipts = [];
const configuredMacos = process.env.OPENCODE_QUALITY_MACOS_CONTROLLER !== undefined
  && process.env.OPENCODE_QUALITY_MACOS_WORKLOAD_UID !== undefined
  && process.env.OPENCODE_QUALITY_MACOS_UID_MARKER !== undefined;
const shouldRunReal = process.platform === "win32"
  || (process.platform === "linux" && process.env.OPENCODE_QUALITY_CGROUP_ROOT !== undefined)
  || (process.platform === "darwin" && configuredMacos);
if (process.platform === "win32") {
  assert.equal(platformClassification.support_state, "verified", "Windows Job Object runtime is mandatory on Windows");
} else if (process.platform === "linux" && shouldRunReal) {
  assert.equal(platformClassification.support_state, "verified", "configured Linux cgroup-v2 runtime must be usable");
} else if (process.platform === "linux") {
  assert.equal(platformClassification.support_state, "unavailable");
  assert.equal(platformClassification.reason, "delegated_root_missing");
} else if (process.platform === "darwin" && shouldRunReal) {
  assert.equal(
    platformClassification.support_state,
    "verified",
    `configured macOS exclusive-UID runtime must be usable: ${JSON.stringify(platformClassification)}`,
  );
} else if (process.platform === "darwin") {
  assert.equal(platformClassification.support_state, "unavailable");
} else {
  assert.equal(platformClassification.support_state, "unavailable");
}

if (shouldRunReal) {
  const environmentBackup = new Map([
    ["NODE_OPTIONS", process.env.NODE_OPTIONS],
    ["NODE_PATH", process.env.NODE_PATH],
    ["npm_execpath", process.env.npm_execpath],
    ["npm_config_registry", process.env.npm_config_registry],
    ["AWS_SECRET_ACCESS_KEY", process.env.AWS_SECRET_ACCESS_KEY],
    ["GH_TOKEN", process.env.GH_TOKEN],
    ["PATH", process.env.PATH],
  ]);
  try {
    process.env.NODE_OPTIONS = "--require=definitely-missing-sensitive-preload.cjs";
    process.env.NODE_PATH = path.join(realProject, "node_modules", "poisoned-node-path");
    process.env.npm_execpath = poisonedNpmCli;
    process.env.npm_config_registry = "https://credentials.invalid/secret";
    process.env.AWS_SECRET_ACCESS_KEY = "must-not-cross-boundary";
    process.env.GH_TOKEN = "must-not-cross-boundary";
    const fakeBin = path.join(realProject, "node_modules", "fake-bin");
    fs.mkdirSync(fakeBin, { recursive: true });
    fs.writeFileSync(path.join(fakeBin, process.platform === "win32" ? "node.exe" : "node"), "poison", "utf8");
    process.env.PATH = fakeBin;

    const environmentReceipt = runRealCheck("environment");
    operationalReceipts.push(environmentReceipt);
    assert.equal(environmentReceipt.status, "passed");
    const observedEnvironment = JSON.parse(fs.readFileSync(path.join(realProject, "environment-marker.json"), "utf8"));
    for (const key of ["NODE_OPTIONS", "NODE_PATH", "npm_execpath", "npm_config_registry", "AWS_SECRET_ACCESS_KEY", "GH_TOKEN", "OPENCODE_QUALITY_CGROUP_ROOT", "OPENCODE_QUALITY_CGROUP_ATTACH_MODE", "OPENCODE_QUALITY_CGROUP_ATTACH_HELPER", "OPENCODE_QUALITY_MACOS_CONTROLLER", "OPENCODE_QUALITY_MACOS_WORKLOAD_UID", "OPENCODE_QUALITY_MACOS_UID_MARKER"]) {
      assert.equal(observedEnvironment[key], null, `${key} crossed the trusted runner environment boundary`);
    }
    for (const key of ["PATH", "Path"]) {
      if (observedEnvironment[key] !== null) {
        assert.equal(observedEnvironment[key].includes(fakeBin), false, "ambient PATH crossed the trusted runner boundary");
      }
    }
    assert.equal(observedEnvironment.git_by_name.status, 0);
    assert.equal(observedEnvironment.git_by_name.signal, null);
    assert.equal(observedEnvironment.git_by_name.error_code, null);
    assert.equal(observedEnvironment.git_by_name.stderr, "");
    assert.match(observedEnvironment.git_by_name.stdout, /^git version /u);
    if (process.platform === "darwin") {
      assert.equal(
        observedEnvironment.OPENCODE_QUALITY_GIT_EXECUTABLE,
        "/usr/local/libexec/opencode-quality-git/bin/git",
        "macOS trusted checks did not select the protected fixed Git executable",
      );
    }

    const ignoredReceipt = runRealCheck("ignored-output");
    operationalReceipts.push(ignoredReceipt);
    assert.equal(ignoredReceipt.status, "passed");
    assert.equal(ignoredReceipt.source_workspace_fingerprint, ignoredReceipt.source_workspace_post_fingerprint);
    assert.deepEqual(ignoredReceipt.output_workspace_post_entries, []);

    const architectureReceipt = runRealCheck("architecture-output");
    operationalReceipts.push(architectureReceipt);
    assert.equal(architectureReceipt.status, "passed");
    assert.equal(architectureReceipt.output_workspace_post_entries.length, 1);
    assert.equal(architectureReceipt.output_workspace_post_entries[0].path, "project/artifacts/graph.json");
    trustedProjectCheckResult(architectureReceipt);
    fs.writeFileSync(path.join(realProject, "architecture-fixture.mjs"), "process.exitCode = 0;\n", "utf8");
    expectCode(
      () => runRealCheck("architecture-output"),
      "QUALITY_CHECK_ARCHITECTURE_OUTPUT_STALE",
    );

    const npmStateDirectoriesBefore = builtInToolchainStateDirectories();
    const npmReceipt = runRealCheck("npm-known");
    operationalReceipts.push(npmReceipt);
    assert.equal(npmReceipt.status, "passed", JSON.stringify({
      observed_outcome: npmReceipt.observed_outcome,
      exit_code: npmReceipt.exit_code,
      signal: npmReceipt.signal,
      stdout_bytes: npmReceipt.stdout_bytes,
      stderr_bytes: npmReceipt.stderr_bytes,
      containment_state: npmReceipt.containment_state,
      output_workspace_post_entries: npmReceipt.output_workspace_post_entries,
      npm_failure: npmReceipt.status === "passed"
        ? null
        : boundedNpmFailureDiagnostic(npmStateDirectoriesBefore),
    }));
    const npmMarker = JSON.parse(fs.readFileSync(path.join(realProject, "npm-known-marker.txt"), "utf8"));
    assert.equal(npmMarker.marker, "real");
    if (process.platform === "darwin") {
      assert.equal(npmMarker.script_shell, TRUSTED_MACOS_NPM_SCRIPT_SHELL_PATH);
      assert.equal(npmMarker.path.split(path.delimiter).includes(
        path.dirname(TRUSTED_MACOS_NPM_SCRIPT_SHELL_PATH),
      ), true, "macOS npm script did not receive the fixed shell directory");
    } else {
      assert.equal(npmMarker.script_shell, null);
    }
    assert.equal(fs.existsSync(poisonMarker), false, "ambient npm_execpath was executed");

    const directReceipt = runRealCheck("direct-exit");
    operationalReceipts.push(directReceipt);
    assert.equal(directReceipt.status, "passed", JSON.stringify({
      observed_outcome: directReceipt.observed_outcome,
      exit_code: directReceipt.exit_code,
      signal: directReceipt.signal,
      stdout_bytes: directReceipt.stdout_bytes,
      stderr_bytes: directReceipt.stderr_bytes,
      containment_state: directReceipt.containment_state,
      output_workspace_post_entries: directReceipt.output_workspace_post_entries,
    }));
    const timeoutReceipt = runRealCheck("timeout-descendant");
    operationalReceipts.push(timeoutReceipt);
    assert.equal(timeoutReceipt.status, "blocked");
    assert.equal(timeoutReceipt.observed_outcome, "timed_out");
    assert.equal(
      fs.readFileSync(path.join(realProject, "timeout-started-marker.txt"), "utf8"),
      "started",
      "timeout fixture never started after containment readiness",
    );
    await pause(900);
    assert.equal(fs.existsSync(path.join(realProject, "descendant-marker.txt")), false, "detached descendant survived normal completion");
    assert.equal(
      fs.existsSync(path.join(realProject, "timeout-descendant-marker.txt")),
      false,
      "detached descendant survived timeout teardown",
    );
    runtimeResult = `${platformClassification.kind}: verified`;
  } finally {
    for (const [key, value] of environmentBackup) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
} else if (process.platform === "darwin") {
  runtimeResult = "macos-exclusive-uid-v1: unavailable without a dedicated configured UID marker/lease (not counted as runtime coverage)";
} else if (process.platform === "linux") {
  runtimeResult = "linux-cgroup-v2: unavailable without OPENCODE_QUALITY_CGROUP_ROOT (not counted as runtime coverage)";
} else {
  runtimeResult = `${process.platform}: containment unavailable (not counted as runtime coverage)`;
}

if (process.env.OPENCODE_MILESTONE_OPERATIONAL_REPORT !== undefined) {
  if (!shouldRunReal || operationalReceipts.length === 0) {
    throw new Error("trusted-project operational report requires verified platform containment");
  }
  writeMilestone2OperationalReportFromEnvironment(sealMilestone2OperationalReport({
    report_kind: "trusted_project_check",
    platform: process.platform,
    containment_kind: platformClassification.kind,
    containment_identity_fingerprints: operationalReceipts.map((receipt) => (
      receipt.containment_identity_fingerprint
    )),
    teardown_verified: operationalReceipts.every((receipt) => (
      receipt.containment_state?.teardown_verified === true
    )),
    scenario_ids: ["trusted_project_check"],
    trusted_check_receipt_fingerprints: operationalReceipts.map((receipt) => receipt.evidence_fingerprint),
  }));
}

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log(`Trusted project runner v3 checks passed (${runtimeResult}).`);
