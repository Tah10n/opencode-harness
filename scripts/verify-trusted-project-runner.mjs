import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  projectCheckCatalogFingerprint,
  validateProjectCheckCatalog,
} from "../lib/quality/project-check-catalog.mjs";
import {
  TRUSTED_PROJECT_EXECUTION_POLICY_VERSION,
  assertTrustedProjectInvocationCurrent,
  runTrustedProjectCheck,
  runTrustedProjectChecks,
  trustedProjectCommandFingerprint,
  trustedProjectCheckResult,
} from "../lib/quality/trusted-project-runner.mjs";
import { ContractError, fingerprint } from "../lib/quality/validation.mjs";

function expectCode(callback, code) {
  assert.throws(callback, (error) => error instanceof ContractError && error.code === code);
}

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-runner-"));
fs.mkdirSync(path.join(tempRoot, "project"));

const catalog = validateProjectCheckCatalog({
  schema_version: 1,
  catalog_id: "runner-fixture-v1",
  checks: [
    {
      check_id: "pass",
      argv: ["node", "fixture.mjs", "literal && argument"],
      cwd: "project",
      phases: ["preimplementation", "integration"],
      timeout_ms: 2500,
      max_output_chars: 32,
    },
    {
      check_id: "other",
      argv: ["node", "other.mjs"],
      cwd: ".",
      phases: ["integration"],
      timeout_ms: 1000,
      max_output_chars: 32,
    },
  ],
}, { workspaceRoot: tempRoot });
const catalogFingerprint = projectCheckCatalogFingerprint(catalog);
const stableWorkspaceBody = { head_sha: "d".repeat(40), entries: [] };
const stableWorkspace = { ...stableWorkspaceBody, fingerprint: fingerprint(stableWorkspaceBody) };
const workspaceFingerprint = stableWorkspace.fingerprint;
const observeWorkspace = () => ({ ...stableWorkspace, entries: [] });

function execute(checkId, result, capture = null) {
  let tick = 100;
  return runTrustedProjectCheck({
    catalog,
    checkId,
    phase: "integration",
    workspaceRoot: tempRoot,
    catalogFingerprint,
    expectedWorkspaceFingerprint: workspaceFingerprint,
    observeWorkspace,
    now: () => (tick += 5),
    spawn: (file, args, options) => {
      if (capture) capture({ file, args, options });
      return { teardown_verified: true, ...result };
    },
  });
}

let invocation;
const passed = execute("pass", {
  status: 0,
  signal: null,
  stdout: Buffer.from("private stdout"),
  stderr: Buffer.from("private stderr"),
  error: undefined,
}, (value) => { invocation = value; });
assert.equal(passed.status, "passed");
assert.equal(passed.exit_code, 0);
assert.equal(passed.duration_ms, 5);
assert.equal(passed.stdout_bytes, 14);
assert.equal(passed.stderr_bytes, 14);
assert.equal(invocation.file, process.execPath);
assert.deepEqual(invocation.args, ["fixture.mjs", "literal && argument"]);
assert.equal(invocation.options.shell, false);
assert.equal(invocation.options.cwd, fs.realpathSync(path.join(tempRoot, "project")));
assert.equal(invocation.options.timeout, 2500);
assert.equal(JSON.stringify(passed).includes("private stdout"), false, "receipts must not persist stdout");
assert.equal(JSON.stringify(passed).includes("private stderr"), false, "receipts must not persist stderr");
assert.equal(trustedProjectCheckResult(passed).status, "passed");
assert.equal(trustedProjectCheckResult(passed).command_id, "trusted-project-check:pass");
assert.equal(trustedProjectCheckResult(passed).receipt.command_fingerprint, passed.command_fingerprint);
expectCode(() => trustedProjectCheckResult({ schema_version: 1, status: "passed", check_id: "forged" }), "QUALITY_CHECK_RECEIPT");
expectCode(() => trustedProjectCheckResult({ ...passed, workspace_fingerprint: fingerprint({ forged: true }) }), "QUALITY_CHECK_RECEIPT");
expectCode(() => trustedProjectCheckResult({ ...passed, status: "failed" }), "QUALITY_CHECK_RECEIPT");

assert.equal(execute("pass", { status: 7, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }).status, "failed");
const windowsStyleFailure = execute("pass", {
  status: 0xC0000005, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0),
});
assert.equal(windowsStyleFailure.status, "failed");
assert.equal(trustedProjectCheckResult(windowsStyleFailure).exit_code, 0xC0000005);
assert.equal(execute("pass", {
  status: null, signal: "SIGTERM", stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), error: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }),
}).status, "timed_out");
assert.equal(execute("pass", {
  status: null, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), error: Object.assign(new Error("missing"), { code: "ENOENT" }),
}).status, "unavailable");
assert.equal(execute("pass", {
  status: null, signal: null, stdout: Buffer.alloc(33), stderr: Buffer.alloc(0), error: Object.assign(new Error("buffer"), { code: "ENOBUFS" }),
}).status, "oversized");
assert.equal(execute("pass", {
  status: null, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), error: new Error("unexpected"),
}).status, "malformed");

expectCode(() => runTrustedProjectCheck({
  catalog,
  checkId: "missing",
  phase: "integration",
  workspaceRoot: tempRoot,
  catalogFingerprint,
  expectedWorkspaceFingerprint: workspaceFingerprint,
  observeWorkspace,
}), "QUALITY_CHECK_UNKNOWN");
expectCode(() => runTrustedProjectCheck({
  catalog,
  checkId: "other",
  phase: "slice",
  workspaceRoot: tempRoot,
  catalogFingerprint,
  expectedWorkspaceFingerprint: workspaceFingerprint,
  observeWorkspace,
}), "QUALITY_CHECK_PHASE");
expectCode(() => runTrustedProjectCheck({
  catalog,
  checkId: "pass",
  phase: "integration",
  workspaceRoot: tempRoot,
  catalogFingerprint: fingerprint({ stale: true }),
  expectedWorkspaceFingerprint: workspaceFingerprint,
  observeWorkspace,
}), "QUALITY_CHECK_CATALOG_DRIFT");

expectCode(() => runTrustedProjectCheck({
  catalog,
  checkId: "pass",
  phase: "integration",
  workspaceRoot: tempRoot,
  catalogFingerprint,
  expectedWorkspaceFingerprint: fingerprint({ stale: true }),
  observeWorkspace,
}), "QUALITY_CHECK_WORKSPACE_DRIFT");

let observations = 0;
const changedWorkspaceBody = {
  head_sha: "d".repeat(40),
  entries: [{ path: "changed.txt", fingerprint: fingerprint({ changed: true }) }],
};
const changedWorkspaceSnapshot = { ...changedWorkspaceBody, fingerprint: fingerprint(changedWorkspaceBody) };
const changedWorkspace = runTrustedProjectCheck({
  catalog,
  checkId: "pass",
  phase: "integration",
  workspaceRoot: tempRoot,
  catalogFingerprint,
  expectedWorkspaceFingerprint: workspaceFingerprint,
  observeWorkspace: () => (observations++ === 0 ? { ...stableWorkspace, entries: [] } : changedWorkspaceSnapshot),
  spawn: () => ({ status: 0, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), teardown_verified: true }),
});
assert.equal(changedWorkspace.status, "workspace_changed");
assert.notEqual(changedWorkspace.workspace_fingerprint, changedWorkspace.post_workspace_fingerprint);

const batch = runTrustedProjectChecks({
  catalog,
  checkIds: ["pass", "other"],
  phase: "integration",
  workspaceRoot: tempRoot,
  catalogFingerprint,
  expectedWorkspaceFingerprint: workspaceFingerprint,
  observeWorkspace,
  spawn: () => ({ status: 0, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), teardown_verified: true }),
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
  expectedWorkspaceFingerprint: workspaceFingerprint,
  observeWorkspace,
}), "QUALITY_CHECK_RUN_LIMIT");
expectCode(() => runTrustedProjectChecks({
  catalog,
  checkIds: ["pass"],
  phase: "integration",
  workspaceRoot: tempRoot,
  expectedWorkspaceFingerprint: workspaceFingerprint,
  observeWorkspace,
  maxReceiptBytes: 1,
  spawn: () => ({ status: 0, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), teardown_verified: true }),
}), "QUALITY_CHECK_RECEIPT_LIMIT");

expectCode(() => runTrustedProjectCheck({
  catalog,
  checkId: "pass",
  phase: "integration",
  workspaceRoot: tempRoot,
  catalogFingerprint,
  expectedWorkspaceFingerprint: workspaceFingerprint,
  observeWorkspace,
  spawn: () => ({
    status: 0,
    signal: null,
    stdout: Buffer.alloc(0),
    stderr: Buffer.alloc(0),
    teardown_verified: false,
  }),
}), "QUALITY_CHECK_TEARDOWN_UNVERIFIED");

const mutableExecutable = path.join(tempRoot, process.platform === "win32" ? "mutable-check.exe" : "mutable-check");
fs.writeFileSync(mutableExecutable, "original executable identity\n", "utf8");
const mutableCanonicalPath = fs.realpathSync(mutableExecutable);
const mutableIdentity = fs.statSync(mutableCanonicalPath);
const resolvedMutableInvocation = {
  unavailable: false,
  identities: [{
    kind: "catalog_absolute",
    canonical_path: mutableCanonicalPath,
    device: Number(mutableIdentity.dev),
    inode: Number(mutableIdentity.ino),
    mode: Number(mutableIdentity.mode),
    size: Number(mutableIdentity.size),
    modified_ms: Number(mutableIdentity.mtimeMs),
    changed_ms: Number(mutableIdentity.ctimeMs),
  }],
};
fs.writeFileSync(mutableExecutable, "replacement executable identity with different bytes\n", "utf8");
expectCode(
  () => assertTrustedProjectInvocationCurrent(resolvedMutableInvocation),
  "QUALITY_CHECK_EXECUTABLE_DRIFT",
);

const fingerprintInput = {
  argv: ["node", "fixture.mjs"],
  cwd: ".",
  executableIdentity: [{ kind: "node", canonical_path: process.execPath, inode: 1 }],
  environmentIdentity: {
    policy_version: TRUSTED_PROJECT_EXECUTION_POLICY_VERSION,
    containment: "windows-job-object-v1",
    fingerprint: fingerprint({ PATH: "trusted" }),
  },
};
assert.notEqual(
  trustedProjectCommandFingerprint(fingerprintInput),
  trustedProjectCommandFingerprint({
    ...fingerprintInput,
    executableIdentity: [{ ...fingerprintInput.executableIdentity[0], inode: 2 }],
  }),
  "command fingerprint did not bind executable provenance",
);
assert.notEqual(
  trustedProjectCommandFingerprint(fingerprintInput),
  trustedProjectCommandFingerprint({
    ...fingerprintInput,
    environmentIdentity: { ...fingerprintInput.environmentIdentity, policy_version: "future-policy" },
  }),
  "command fingerprint did not bind the effective environment policy",
);
assert.notEqual(
  trustedProjectCommandFingerprint(fingerprintInput),
  trustedProjectCommandFingerprint({
    ...fingerprintInput,
    environmentIdentity: { ...fingerprintInput.environmentIdentity, containment: "different-containment" },
  }),
  "command fingerprint did not bind process-containment provenance",
);

const realProject = path.join(tempRoot, "project");
const environmentMarker = path.join(realProject, "environment-marker.json");
const descendantMarker = path.join(realProject, "descendant-marker.txt");
const timeoutDescendantMarker = path.join(realProject, "timeout-descendant-marker.txt");
const timeoutStartedMarker = path.join(realProject, "timeout-started-marker.txt");
const poisonMarker = path.join(realProject, "poison-marker.txt");
const npmKnownMarker = path.join(realProject, "npm-known-marker.txt");
const realNodeMarker = path.join(realProject, "real-node-marker.txt");
const fakeNodeMarker = path.join(realProject, "fake-node-marker.txt");
const childWriter = path.join(realProject, "delayed-writer.mjs");
const survivorMonitor = path.join(realProject, "survivor-monitor.mjs");
fs.writeFileSync(childWriter, `import fs from "node:fs";
const [marker, delay] = process.argv.slice(2);
setTimeout(() => fs.writeFileSync(marker, "late", "utf8"), Number(delay));
setInterval(() => {}, 60_000);
`, "utf8");
fs.writeFileSync(survivorMonitor, `import fs from "node:fs";
const [parentPid, marker] = process.argv.slice(2);
setInterval(() => {
  try {
    process.kill(Number(parentPid), 0);
  } catch {
    fs.writeFileSync(marker, "survived", "utf8");
    process.exit(0);
  }
}, 50);
`, "utf8");
fs.writeFileSync(path.join(realProject, "environment-fixture.mjs"), `import fs from "node:fs";
const names = ["NODE_OPTIONS", "NODE_PATH", "npm_execpath", "npm_config_registry", "AWS_SECRET_ACCESS_KEY", "GH_TOKEN", "PATH", "Path"];
fs.writeFileSync(process.argv[2], JSON.stringify(Object.fromEntries(names.map((name) => [name, process.env[name] ?? null]))), "utf8");
`, "utf8");
fs.writeFileSync(path.join(realProject, "direct-exit-parent.mjs"), `import { spawn } from "node:child_process";
const child = spawn(process.execPath, [${JSON.stringify(childWriter)}, process.argv[2], "700"], { detached: process.platform === "win32", stdio: "ignore", windowsHide: true });
child.unref();
`, "utf8");
fs.writeFileSync(path.join(realProject, "timeout-parent.mjs"), `import fs from "node:fs";
import { spawn } from "node:child_process";
fs.writeFileSync(process.argv[3], "started", "utf8");
const child = spawn(process.execPath, [${JSON.stringify(survivorMonitor)}, String(process.pid), process.argv[2]], { detached: process.platform === "win32", stdio: "ignore", windowsHide: true });
child.unref();
setInterval(() => {}, 60_000);
`, "utf8");
fs.writeFileSync(path.join(realProject, "real-node-fixture.mjs"), `import fs from "node:fs";
fs.writeFileSync(process.argv[2], "real", "utf8");
`, "utf8");
const poisonedNpmCli = path.join(realProject, "poisoned-npm-cli.mjs");
fs.writeFileSync(poisonedNpmCli, `import fs from "node:fs";
fs.writeFileSync(${JSON.stringify(poisonMarker)}, "poisoned", "utf8");
`, "utf8");
fs.writeFileSync(path.join(realProject, "package.json"), JSON.stringify({
  name: "trusted-runner-fixture",
  private: true,
  scripts: { known: "node real-node-fixture.mjs npm-known-marker.txt" },
}), "utf8");

const realCatalog = validateProjectCheckCatalog({
  schema_version: 1,
  catalog_id: "runner-adversarial-fixture-v1",
  checks: [
    {
      check_id: "environment",
      argv: ["node", "environment-fixture.mjs", path.basename(environmentMarker)],
      cwd: "project",
      phases: ["integration"],
      timeout_ms: 2500,
      max_output_chars: 4096,
    },
    {
      check_id: "direct-exit",
      argv: ["node", "direct-exit-parent.mjs", path.basename(descendantMarker)],
      cwd: "project",
      phases: ["integration"],
      timeout_ms: 2500,
      max_output_chars: 4096,
    },
    {
      check_id: "timeout-descendant",
      argv: ["node", "timeout-parent.mjs", path.basename(timeoutDescendantMarker), path.basename(timeoutStartedMarker)],
      cwd: "project",
      phases: ["integration"],
      timeout_ms: 5000,
      max_output_chars: 4096,
    },
    {
      check_id: "npm-poison",
      argv: ["npm", "run", "definitely-missing-script"],
      cwd: "project",
      phases: ["integration"],
      timeout_ms: 5000,
      max_output_chars: 32 * 1024,
    },
    {
      check_id: "npm-known",
      argv: ["npm", "run", "known"],
      cwd: "project",
      phases: ["integration"],
      timeout_ms: 5000,
      max_output_chars: 32 * 1024,
    },
    {
      check_id: "path-poison",
      argv: ["node", "real-node-fixture.mjs", path.basename(realNodeMarker)],
      cwd: "project",
      phases: ["integration"],
      timeout_ms: 2500,
      max_output_chars: 4096,
    },
  ],
}, { workspaceRoot: tempRoot });
const realCatalogFingerprint = projectCheckCatalogFingerprint(realCatalog);
const runRealCheck = (checkId) => runTrustedProjectCheck({
  catalog: realCatalog,
  checkId,
  phase: "integration",
  workspaceRoot: tempRoot,
  catalogFingerprint: realCatalogFingerprint,
  expectedWorkspaceFingerprint: workspaceFingerprint,
  observeWorkspace,
});

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
  process.env.NODE_PATH = path.join(realProject, "poisoned-node-path");
  process.env.npm_execpath = poisonedNpmCli;
  process.env.npm_config_registry = "https://credentials.invalid/secret";
  process.env.AWS_SECRET_ACCESS_KEY = "must-not-cross-boundary";
  process.env.GH_TOKEN = "must-not-cross-boundary";
  if (process.platform !== "win32") {
    expectCode(() => runRealCheck("environment"), "QUALITY_CHECK_CONTAINMENT_UNAVAILABLE");
  } else {
    const environmentReceipt = runRealCheck("environment");
    assert.equal(environmentReceipt.status, "passed");
    const observedEnvironment = JSON.parse(fs.readFileSync(environmentMarker, "utf8"));
    for (const key of ["NODE_OPTIONS", "NODE_PATH", "npm_execpath", "npm_config_registry", "AWS_SECRET_ACCESS_KEY", "GH_TOKEN"]) {
      assert.equal(observedEnvironment[key], null, `${key} crossed the trusted runner environment boundary`);
    }

    const poisonedNpmReceipt = runRealCheck("npm-poison");
    assert.equal(poisonedNpmReceipt.status, "failed", "ambient npm_execpath replaced the canonical npm CLI");
    assert.equal(fs.existsSync(poisonMarker), false, "poisoned npm_execpath was executed");
    const knownNpmReceipt = runRealCheck("npm-known");
    assert.equal(knownNpmReceipt.status, "passed", "canonical npm CLI did not execute a repository-owned script");
    assert.equal(fs.readFileSync(npmKnownMarker, "utf8"), "real");

    const fakeBin = path.join(realProject, "fake-bin");
    fs.mkdirSync(fakeBin);
    fs.writeFileSync(path.join(fakeBin, "node.exe"), "not-an-executable", "utf8");
    process.env.PATH = fakeBin;
    const pathPoisonReceipt = runRealCheck("path-poison");
    assert.equal(pathPoisonReceipt.status, "passed", "ambient PATH replaced the canonical Node executable");
    assert.equal(fs.readFileSync(realNodeMarker, "utf8"), "real");
    assert.equal(fs.existsSync(fakeNodeMarker), false, "fake PATH executable was used");

    const directExitReceipt = runRealCheck("direct-exit");
    assert.equal(directExitReceipt.status, "passed");
    const timeoutReceipt = runRealCheck("timeout-descendant");
    assert.equal(timeoutReceipt.status, "timed_out");
    assert.equal(fs.readFileSync(timeoutStartedMarker, "utf8"), "started", "trusted timeout fixture never started after containment readiness");
    await pause(750);
    assert.equal(fs.existsSync(descendantMarker), false, "descendant survived a normally completed trusted check");
    assert.equal(fs.existsSync(timeoutDescendantMarker), false, "descendant survived a timed-out trusted check");
  }
} finally {
  for (const [key, value] of environmentBackup) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

fs.mkdirSync(path.join(tempRoot, "project-retarget"));
fs.renameSync(path.join(tempRoot, "project"), path.join(tempRoot, "project-original"));
fs.symlinkSync(
  path.join(tempRoot, "project-retarget"),
  path.join(tempRoot, "project"),
  process.platform === "win32" ? "junction" : "dir",
);
expectCode(() => runTrustedProjectCheck({
  catalog,
  checkId: "pass",
  phase: "integration",
  workspaceRoot: tempRoot,
  catalogFingerprint,
  expectedWorkspaceFingerprint: workspaceFingerprint,
  observeWorkspace,
  spawn: () => ({ status: 0, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }),
}), "QUALITY_CHECK_CWD_SYMLINK");

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("Trusted project runner checks passed.");
