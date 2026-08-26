import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { materializeProfileBundleV3 } from "../lib/profile-v3.mjs";
import { runContainedOpenCode } from "../runtime/opencode-core.mjs";
import {
  changedCoreWorkspacePaths,
  loadCoreVerificationCatalog,
  runCoreTrustedCheck,
  snapshotCoreWorkspace,
  verifyCoreWorkspaceMutation,
} from "../runtime/core-verification-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testTrustRoot = process.env.GITHUB_ACTIONS === "true" && process.platform !== "win32" ? os.homedir() : root;
const temporaryRoot = fs.mkdtempSync(path.join(testTrustRoot, ".core-product-runtime-"));
const workspace = path.join(temporaryRoot, "workspace");
const trustedSystemExecutable = fs.realpathSync.native(process.platform === "win32" ? process.env.ComSpec : "/bin/sh");
const shellArguments = (command) => process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-c", command];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", shell: false, windowsHide: true, ...options });
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed: ${result.stderr}`);
  return result;
}

function writeCatalog(checks, targetWorkspace = workspace) {
  const gitPath = run("git", ["rev-parse", "--git-path", "opencode-harness/core/checks.json"], {
    cwd: targetWorkspace,
  }).stdout.trim();
  const catalogPath = path.resolve(targetWorkspace, gitPath);
  const directory = path.dirname(catalogPath);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(catalogPath, `${JSON.stringify({
    schema_version: 1,
    catalog_id: "installed-core-fixture",
    checks,
  }, null, 2)}\n`, "utf8");
}

function check(overrides = {}) {
  return {
    check_id: "source-check",
    scope_prefixes: ["src"],
    cost_rank: 1,
    executable_path: trustedSystemExecutable,
    argv: shellArguments("exit 0"),
    cwd: ".",
    timeout_ms: 10_000,
    ...overrides,
  };
}

function injectedProcessGroupContainment(worker) {
  let closed = false;
  const terminateAndVerify = async () => {
    if (!closed) {
      try { process.kill(-worker.pid, "SIGKILL"); } catch (error) { if (error?.code !== "ESRCH") throw error; }
      await new Promise((resolve) => worker.once("close", resolve));
      closed = true;
    }
    return true;
  };
  return Object.freeze({
    support_state: "verified",
    status: () => Object.freeze({ teardown_verified: closed }),
    terminateAndVerify,
    close: terminateAndVerify,
  });
}

try {
  assert.deepEqual(
    fs.readFileSync(path.join(root, "runtime", "core-verification-gate.mjs")),
    fs.readFileSync(path.join(root, "lib", "quality", "core-verification-gate.mjs")),
    "benchmark and product gate bytes must be identical",
  );
  fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "src", "feature.mjs"), "export const value = 1;\n", "utf8");
  run("git", ["init", "--quiet"], { cwd: workspace });
  run("git", ["add", "src/feature.mjs"], { cwd: workspace });

  writeCatalog([check()]);
  const catalog = loadCoreVerificationCatalog(workspace);
  assert.equal(catalog.catalog_status, "loaded");
  const before = snapshotCoreWorkspace(workspace);
  fs.writeFileSync(path.join(workspace, "src", "feature.mjs"), "export const value = 2;\n", "utf8");
  const after = snapshotCoreWorkspace(workspace);
  assert.deepEqual(changedCoreWorkspacePaths(before, after), ["src/feature.mjs"]);

  const passed = verifyCoreWorkspaceMutation({ catalog, before, after });
  assert.equal(passed.decision.allowed, true);
  assert.equal(passed.decision.reason, "post_last_mutation_verification_passed");
  assert.equal(passed.observation.post_last_mutation_verification, true);

  const beforeDeletion = snapshotCoreWorkspace(workspace);
  fs.rmSync(path.join(workspace, "src", "feature.mjs"));
  const afterDeletion = snapshotCoreWorkspace(workspace);
  assert.equal(afterDeletion.files["src/feature.mjs"], null);
  assert.deepEqual(changedCoreWorkspacePaths(beforeDeletion, afterDeletion), ["src/feature.mjs"]);
  const deleted = verifyCoreWorkspaceMutation({ catalog, before: beforeDeletion, after: afterDeletion });
  assert.equal(deleted.decision.allowed, true);
  assert.equal(deleted.decision.reason, "post_last_mutation_verification_passed");
  fs.writeFileSync(path.join(workspace, "src", "feature.mjs"), "export const value = 2;\n", "utf8");

  const beforeRename = snapshotCoreWorkspace(workspace);
  fs.renameSync(path.join(workspace, "src", "feature.mjs"), path.join(workspace, "src", "renamed.mjs"));
  const afterRename = snapshotCoreWorkspace(workspace);
  assert.equal(afterRename.files["src/feature.mjs"], null);
  assert.match(afterRename.files["src/renamed.mjs"].sha256, /^sha256:/u);
  assert.deepEqual(changedCoreWorkspacePaths(beforeRename, afterRename), ["src/feature.mjs", "src/renamed.mjs"]);
  fs.renameSync(path.join(workspace, "src", "renamed.mjs"), path.join(workspace, "src", "feature.mjs"));

  fs.writeFileSync(path.join(workspace, ".gitignore"), "relevant-ignored.txt\n", "utf8");
  run("git", ["add", ".gitignore"], { cwd: workspace });
  const beforeIgnored = snapshotCoreWorkspace(workspace);
  fs.writeFileSync(path.join(workspace, "relevant-ignored.txt"), "ignored but relevant\n", "utf8");
  const afterIgnored = snapshotCoreWorkspace(workspace);
  assert.deepEqual(changedCoreWorkspacePaths(beforeIgnored, afterIgnored), ["relevant-ignored.txt"]);
  assert.equal(afterIgnored.files["relevant-ignored.txt"].ignored, true);

  fs.writeFileSync(path.join(workspace, "src", "mode-fixture.mjs"), "process.exit(0);\n", "utf8");
  run("git", ["add", "src/mode-fixture.mjs"], { cwd: workspace });
  if (process.platform !== "win32") {
    fs.chmodSync(path.join(workspace, "src", "mode-fixture.mjs"), 0o644);
    const beforeMode = snapshotCoreWorkspace(workspace);
    fs.chmodSync(path.join(workspace, "src", "mode-fixture.mjs"), 0o755);
    const afterMode = snapshotCoreWorkspace(workspace);
    assert.deepEqual(changedCoreWorkspacePaths(beforeMode, afterMode), ["src/mode-fixture.mjs"]);
  }

  if (process.platform !== "win32") {
    fs.symlinkSync("feature.mjs", path.join(workspace, "src", "feature-link.mjs"));
    const beforeLink = snapshotCoreWorkspace(workspace);
    fs.rmSync(path.join(workspace, "src", "feature-link.mjs"));
    fs.symlinkSync("mode-fixture.mjs", path.join(workspace, "src", "feature-link.mjs"));
    const afterLink = snapshotCoreWorkspace(workspace);
    assert.deepEqual(changedCoreWorkspacePaths(beforeLink, afterLink), ["src/feature-link.mjs"]);
    fs.rmSync(path.join(workspace, "src", "feature-link.mjs"));
  }
  fs.rmSync(path.join(workspace, "relevant-ignored.txt"));
  run("git", ["rm", "--cached", "--quiet", "-f", ".gitignore", "src/mode-fixture.mjs"], { cwd: workspace });
  fs.rmSync(path.join(workspace, ".gitignore"));
  fs.rmSync(path.join(workspace, "src", "mode-fixture.mjs"));

  for (const [status, reason] of [
    ["failed", "verification_failed"],
    ["unavailable", "verification_unavailable"],
    ["unrelated_infrastructure_failure", "verification_unrelated_infrastructure_failure"],
  ]) {
    const result = verifyCoreWorkspaceMutation({
      catalog,
      before,
      after,
      checkRunner: () => ({
        status,
        detail_code: `${status.replaceAll("_", "-")}-fixture`,
        command_fingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      }),
    });
    assert.equal(result.decision.allowed, false);
    assert.equal(result.decision.reason, reason);
  }

  writeCatalog([check({ check_id: "docs-check", scope_prefixes: ["docs"] })]);
  const unrelatedCatalog = loadCoreVerificationCatalog(workspace);
  const unrelated = verifyCoreWorkspaceMutation({ catalog: unrelatedCatalog, before, after });
  assert.equal(unrelated.decision.allowed, true);
  assert.equal(unrelated.decision.reason, "no_applicable_trusted_check");
  assert.equal(unrelated.observation.eligible, false);
  assert.equal(unrelated.observation.post_last_mutation_verification, false);

  writeCatalog([check()]);
  const staleCatalog = loadCoreVerificationCatalog(workspace);
  const stale = verifyCoreWorkspaceMutation({
    catalog: staleCatalog,
    before,
    after,
    checkRunner: () => {
      fs.writeFileSync(path.join(workspace, "src", "feature.mjs"), "export const value = 3;\n", "utf8");
      return {
        status: "passed",
        detail_code: "exit-zero",
        command_fingerprint: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      };
    },
  });
  assert.equal(stale.decision.allowed, false);
  assert.equal(stale.state.mutation_revision, 2);
  assert.equal(stale.state.verification, null);
  assert.equal(fs.existsSync(path.join(workspace, ".oc_harness")), false);

  const fixtureExecutable = path.join(temporaryRoot, process.platform === "win32" ? "fixture-command.exe" : "fixture-command");
  if (process.platform === "win32") fs.copyFileSync(trustedSystemExecutable, fixtureExecutable);
  else fs.writeFileSync(fixtureExecutable, "#!/bin/sh\nexec /bin/sh \"$@\"\n", { mode: 0o755 });
  fs.writeFileSync(path.join(workspace, "package.json"), "{\"scripts\":{\"test\":\"node check.mjs\"}}\n", "utf8");
  const checkFile = process.platform === "win32" ? "check.cmd" : "check.sh";
  fs.writeFileSync(path.join(workspace, checkFile), process.platform === "win32" ? "@exit /b 0\r\n" : "exit 0\n", "utf8");
  const trustedInputCheck = check({ executable_path: fixtureExecutable,
    argv: process.platform === "win32" ? ["/d", "/s", "/c", checkFile] : [checkFile] });
  writeCatalog([trustedInputCheck]);
  let trustedInputCatalog = loadCoreVerificationCatalog(workspace);
  fs.writeFileSync(path.join(workspace, "package.json"), "{\"scripts\":{\"test\":\"node changed.mjs\"}}\n", "utf8");
  assert.equal(runCoreTrustedCheck(trustedInputCatalog.checks[0]).detail_code, "trusted-input-identity-changed");

  fs.writeFileSync(path.join(workspace, "package.json"), "{\"scripts\":{\"test\":\"node check.mjs\"}}\n", "utf8");
  writeCatalog([trustedInputCheck]);
  trustedInputCatalog = loadCoreVerificationCatalog(workspace);
  fs.writeFileSync(path.join(workspace, checkFile), process.platform === "win32" ? "@exit /b 1\r\n" : "exit 1\n", "utf8");
  assert.equal(runCoreTrustedCheck(trustedInputCatalog.checks[0]).detail_code, "trusted-input-identity-changed");

  fs.writeFileSync(path.join(workspace, checkFile), process.platform === "win32" ? "@exit /b 0\r\n" : "exit 0\n", "utf8");
  writeCatalog([trustedInputCheck]);
  trustedInputCatalog = loadCoreVerificationCatalog(workspace);
  fs.renameSync(fixtureExecutable, `${fixtureExecutable}.old`);
  fs.copyFileSync(trustedSystemExecutable, fixtureExecutable);
  if (process.platform !== "win32") fs.chmodSync(fixtureExecutable, 0o755);
  assert.equal(runCoreTrustedCheck(trustedInputCatalog.checks[0]).detail_code, "trusted-input-identity-changed");

  fs.rmSync(fixtureExecutable);
  fs.renameSync(`${fixtureExecutable}.old`, fixtureExecutable);
  writeCatalog([trustedInputCheck]);
  trustedInputCatalog = loadCoreVerificationCatalog(workspace);
  if (process.platform !== "win32") {
    fs.renameSync(path.join(workspace, checkFile), path.join(workspace, "check-real.sh"));
    fs.symlinkSync("check-real.sh", path.join(workspace, checkFile));
    assert.equal(runCoreTrustedCheck(trustedInputCatalog.checks[0]).detail_code, "trusted-input-identity-changed");
    fs.rmSync(path.join(workspace, checkFile));
    fs.renameSync(path.join(workspace, "check-real.sh"), path.join(workspace, checkFile));
  }

  const trustedCwd = path.join(workspace, "trusted-cwd");
  fs.mkdirSync(trustedCwd);
  fs.writeFileSync(path.join(trustedCwd, checkFile), process.platform === "win32" ? "@exit /b 0\r\n" : "exit 0\n", "utf8");
  const cwdCheck = check({ executable_path: fixtureExecutable,
    argv: process.platform === "win32" ? ["/d", "/s", "/c", checkFile] : [checkFile], cwd: "trusted-cwd" });
  writeCatalog([cwdCheck]);
  const cwdCatalog = loadCoreVerificationCatalog(workspace);
  fs.renameSync(trustedCwd, `${trustedCwd}-old`);
  fs.mkdirSync(trustedCwd);
  fs.writeFileSync(path.join(trustedCwd, checkFile), process.platform === "win32" ? "@exit /b 0\r\n" : "exit 0\n", "utf8");
  assert.equal(runCoreTrustedCheck(cwdCatalog.checks[0]).detail_code, "trusted-input-identity-changed");
  fs.rmSync(trustedCwd, { recursive: true });
  fs.renameSync(`${trustedCwd}-old`, trustedCwd);

  writeCatalog([trustedInputCheck]);
  const racedCatalog = loadCoreVerificationCatalog(workspace);
  writeCatalog([{ ...trustedInputCheck, timeout_ms: 9_999 }]);
  const catalogRace = verifyCoreWorkspaceMutation({ catalog: racedCatalog, before, after });
  assert.equal(catalogRace.check.detail_code, "catalog-identity-changed");
  assert.equal(catalogRace.decision.allowed, false);

  fs.rmSync(path.join(workspace, ".git", "opencode-harness", "core", "checks.json"));
  assert.throws(
    () => loadCoreVerificationCatalog(workspace),
    (error) => error?.code === "CORE_RUNTIME_CATALOG_REQUIRED",
  );
  const absentCatalog = loadCoreVerificationCatalog(workspace, { catalogRequired: false });
  assert.equal(absentCatalog.catalog_status, "absent");
  const absent = verifyCoreWorkspaceMutation({ catalog: absentCatalog, before, after });
  assert.equal(absent.decision.allowed, true);
  assert.equal(absent.decision.reason, "no_applicable_trusted_check");
  assert.equal(absent.observation.eligible, false);

  run("git", ["config", "user.email", "fixture@example.test"], { cwd: workspace });
  run("git", ["config", "user.name", "Fixture"], { cwd: workspace });
  run("git", ["add", "-A"], { cwd: workspace });
  run("git", ["commit", "--quiet", "-m", "fixture"], { cwd: workspace });
  const linkedWorktree = path.join(temporaryRoot, "linked-worktree");
  run("git", ["worktree", "add", "--quiet", "--detach", linkedWorktree, "HEAD"], { cwd: workspace });
  writeCatalog([check({ cwd: "." })], linkedWorktree);
  const linkedCatalog = loadCoreVerificationCatalog(linkedWorktree);
  assert.equal(linkedCatalog.catalog_status, "loaded");
  assert.equal(linkedCatalog.workspace_root, fs.realpathSync.native(linkedWorktree));
  assert.equal(linkedCatalog.catalog_path.includes(`${path.sep}worktrees${path.sep}`), true);

  if (process.platform !== "win32") {
    const delayedMarker = path.join(temporaryRoot, "delayed-background-marker.txt");
    const grandchildSource = `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(delayedMarker)}, "late"), 500)`;
    const parentSource = `const {spawn}=require("node:child_process"); const child=spawn(process.execPath,["-e",${JSON.stringify(grandchildSource)}],{stdio:"ignore"}); child.unref();`;
    const contained = await runContainedOpenCode({
      file: process.execPath,
      args: ["-e", parentSource],
      cwd: workspace,
      env: process.env,
      processContainmentFactory: async (worker) => injectedProcessGroupContainment(worker),
    });
    assert.equal(contained.status, 0);
    await new Promise((resolve) => setTimeout(resolve, 750));
    assert.equal(fs.existsSync(delayedMarker), false, "delayed descendant mutated after final teardown snapshot boundary");
  }

  const materializedRoot = path.join(temporaryRoot, "materialized-core");
  const materialized = materializeProfileBundleV3({
    repositoryRoot: root,
    bundleId: "core",
    outputDirectory: materializedRoot,
    allowDirty: true,
  });
  for (const relative of [
    "runtime/core-verification-gate.mjs",
    "runtime/core-verification-runtime.mjs",
    "runtime/opencode-core.mjs",
  ]) {
    const sourceBytes = fs.readFileSync(path.join(root, relative));
    const installedBytes = fs.readFileSync(path.join(materializedRoot, relative));
    assert.deepEqual(installedBytes, sourceBytes, `${relative} changed during materialization`);
  }
  const installed = await import(`${pathToFileURL(path.join(materializedRoot, "runtime", "core-verification-runtime.mjs")).href}?installed=1`);
  assert.equal(typeof installed.verifyCoreWorkspaceMutation, "function");
  assert.equal(materialized.manifest.bundle_id, "core");

  process.stdout.write("installed core product runtime verification passed\n");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
