import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { materializeProfileBundleV3 } from "../lib/profile-v3.mjs";
import { sanitizeSyntheticModelFreeFailureDiagnostic } from "../lib/benchmark/self-test.mjs";
import { runContainedOpenCode, runCoreLauncher } from "../runtime/opencode-core.mjs";
import {
  CORE_CHECK_CATALOG_PATH,
  changedCoreWorkspacePaths,
  coreTrustedCheckCommandFingerprint,
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
    schema_version: 2,
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
    immutable_input_paths: [],
    subject_paths: ["src/feature.mjs"],
    cwd: ".",
    timeout_ms: 10_000,
    ...overrides,
  };
}

function injectedProcessGroupContainment(worker) {
  let closed = false;
  const terminateAndVerify = async () => {
    if (!closed) {
      try {
        process.platform === "win32" ? worker.kill() : process.kill(-worker.pid, "SIGKILL");
      } catch (error) { if (error?.code !== "ESRCH") throw error; }
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

function injectedDescendantContainmentFactory(pidFile) {
  return async (worker) => {
    let closed = false;
    const terminateAndVerify = async () => {
      if (closed) return true;
      if (fs.existsSync(pidFile)) {
        const pid = Number.parseInt(fs.readFileSync(pidFile, "utf8"), 10);
        if (Number.isSafeInteger(pid) && pid > 1) {
          try { process.kill(pid, "SIGKILL"); } catch (error) { if (error?.code !== "ESRCH") throw error; }
        }
      }
      try { process.kill(-worker.pid, "SIGKILL"); } catch (error) { if (error?.code !== "ESRCH") throw error; }
      await new Promise((resolve) => worker.once("close", resolve));
      closed = true;
      return true;
    };
    return Object.freeze({
      support_state: "verified",
      status: () => Object.freeze({ teardown_verified: closed }),
      terminateAndVerify,
      close: terminateAndVerify,
    });
  };
}

try {
  assert.deepEqual(
    fs.readFileSync(path.join(root, "runtime", "core-verification-gate.mjs")),
    fs.readFileSync(path.join(root, "lib", "quality", "core-verification-gate.mjs")),
    "benchmark and product gate bytes must be identical",
  );
  fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
  if (process.platform !== "win32") fs.chmodSync(workspace, 0o700);
  fs.writeFileSync(path.join(workspace, "src", "feature.mjs"), "export const value = 1;\n", "utf8");
  run("git", ["init", "--quiet"], { cwd: workspace });
  run("git", ["add", "src/feature.mjs"], { cwd: workspace });

  writeCatalog([check()]);
  const catalog = loadCoreVerificationCatalog(workspace);
  assert.equal(catalog.catalog_status, "loaded");
  assert.equal(catalog.checks[0].input_manifest.length, 0, "mutable check subject leaked into immutable inputs");
  const commandBindingBeforeMutation = coreTrustedCheckCommandFingerprint(catalog.checks[0]);
  const before = snapshotCoreWorkspace(workspace);
  fs.writeFileSync(path.join(workspace, "src", "feature.mjs"), "export const value = 2;\n", "utf8");
  const after = snapshotCoreWorkspace(workspace);
  assert.deepEqual(changedCoreWorkspacePaths(before, after), ["src/feature.mjs"]);
  assert.equal(coreTrustedCheckCommandFingerprint(catalog.checks[0]), commandBindingBeforeMutation,
    "subject byte mutation changed the bound host/check identity");

  const passed = await verifyCoreWorkspaceMutation({
    catalog, before, after, processContainmentFactory: injectedProcessGroupContainment,
  });
  assert.equal(passed.decision.allowed, true);
  assert.equal(passed.decision.reason, "post_last_mutation_verification_passed");
  assert.equal(passed.observation.post_last_mutation_verification, true);

  const beforeDeletion = snapshotCoreWorkspace(workspace);
  fs.rmSync(path.join(workspace, "src", "feature.mjs"));
  const afterDeletion = snapshotCoreWorkspace(workspace);
  assert.equal(afterDeletion.files["src/feature.mjs"], null);
  assert.deepEqual(changedCoreWorkspacePaths(beforeDeletion, afterDeletion), ["src/feature.mjs"]);
  const deleted = await verifyCoreWorkspaceMutation({
    catalog, before: beforeDeletion, after: afterDeletion,
    processContainmentFactory: injectedProcessGroupContainment,
  });
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
    const result = await verifyCoreWorkspaceMutation({
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

  writeCatalog([check({ check_id: "docs-check", scope_prefixes: ["docs"], subject_paths: ["docs/readme.md"] })]);
  const unrelatedCatalog = loadCoreVerificationCatalog(workspace);
  const unrelated = await verifyCoreWorkspaceMutation({ catalog: unrelatedCatalog, before, after });
  assert.equal(unrelated.decision.allowed, true);
  assert.equal(unrelated.decision.reason, "no_applicable_trusted_check");
  assert.equal(unrelated.observation.eligible, false);
  assert.equal(unrelated.observation.post_last_mutation_verification, false);

  writeCatalog([check()]);
  const staleCatalog = loadCoreVerificationCatalog(workspace);
  const stale = await verifyCoreWorkspaceMutation({
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
    argv: process.platform === "win32" ? ["/d", "/s", "/c", checkFile] : [checkFile],
    immutable_input_paths: ["package.json", checkFile] });
  if (process.platform !== "win32") {
    const insideTarget = path.join(workspace, "initial-link-target.sh");
    const outsideTarget = path.join(temporaryRoot, "outside-link-target.sh");
    fs.renameSync(path.join(workspace, checkFile), insideTarget);
    fs.writeFileSync(outsideTarget, "exit 0\n", "utf8");
    fs.symlinkSync(path.basename(insideTarget), path.join(workspace, checkFile));
    writeCatalog([trustedInputCheck]);
    assert.throws(
      () => loadCoreVerificationCatalog(workspace),
      (error) => error?.code === "CORE_RUNTIME_UNTRUSTED_FILE",
      "an initial argv symlink must be rejected",
    );
    fs.rmSync(path.join(workspace, checkFile));
    fs.symlinkSync(outsideTarget, path.join(workspace, checkFile));
    assert.throws(
      () => loadCoreVerificationCatalog(workspace),
      (error) => error?.code === "CORE_RUNTIME_UNTRUSTED_FILE",
      "retargeting an argv symlink outside the workspace must remain rejected",
    );
    fs.rmSync(path.join(workspace, checkFile));
    fs.renameSync(insideTarget, path.join(workspace, checkFile));
  }
  writeCatalog([trustedInputCheck]);
  let trustedInputCatalog = loadCoreVerificationCatalog(workspace);
  fs.writeFileSync(path.join(workspace, "package.json"), "{\"scripts\":{\"test\":\"node changed.mjs\"}}\n", "utf8");
  assert.equal((await runCoreTrustedCheck(trustedInputCatalog.checks[0])).detail_code, "trusted-input-identity-changed");

  fs.writeFileSync(path.join(workspace, "package.json"), "{\"scripts\":{\"test\":\"node check.mjs\"}}\n", "utf8");
  writeCatalog([trustedInputCheck]);
  trustedInputCatalog = loadCoreVerificationCatalog(workspace);
  fs.writeFileSync(path.join(workspace, checkFile), process.platform === "win32" ? "@exit /b 1\r\n" : "exit 1\n", "utf8");
  assert.equal((await runCoreTrustedCheck(trustedInputCatalog.checks[0])).detail_code, "trusted-input-identity-changed");

  fs.writeFileSync(path.join(workspace, checkFile), process.platform === "win32" ? "@exit /b 0\r\n" : "exit 0\n", "utf8");
  writeCatalog([trustedInputCheck]);
  trustedInputCatalog = loadCoreVerificationCatalog(workspace);
  fs.renameSync(fixtureExecutable, `${fixtureExecutable}.old`);
  fs.copyFileSync(trustedSystemExecutable, fixtureExecutable);
  if (process.platform !== "win32") fs.chmodSync(fixtureExecutable, 0o755);
  assert.equal((await runCoreTrustedCheck(trustedInputCatalog.checks[0])).detail_code, "trusted-input-identity-changed");

  fs.rmSync(fixtureExecutable);
  fs.renameSync(`${fixtureExecutable}.old`, fixtureExecutable);
  writeCatalog([trustedInputCheck]);
  trustedInputCatalog = loadCoreVerificationCatalog(workspace);
  if (process.platform !== "win32") {
    fs.renameSync(path.join(workspace, checkFile), path.join(workspace, "check-real.sh"));
    fs.symlinkSync("check-real.sh", path.join(workspace, checkFile));
    assert.equal((await runCoreTrustedCheck(trustedInputCatalog.checks[0])).detail_code, "trusted-input-identity-changed");
    fs.rmSync(path.join(workspace, checkFile));
    fs.renameSync(path.join(workspace, "check-real.sh"), path.join(workspace, checkFile));
  }

  const trustedCwd = path.join(workspace, "trusted-cwd");
  fs.mkdirSync(trustedCwd);
  if (process.platform !== "win32") fs.chmodSync(trustedCwd, 0o700);
  fs.writeFileSync(path.join(trustedCwd, checkFile), process.platform === "win32" ? "@exit /b 0\r\n" : "exit 0\n", "utf8");
  const cwdCheck = check({ executable_path: fixtureExecutable,
    argv: process.platform === "win32" ? ["/d", "/s", "/c", checkFile] : [checkFile], cwd: "trusted-cwd",
    immutable_input_paths: [`trusted-cwd/${checkFile}`] });
  writeCatalog([cwdCheck]);
  const cwdCatalog = loadCoreVerificationCatalog(workspace);
  fs.renameSync(trustedCwd, `${trustedCwd}-old`);
  fs.mkdirSync(trustedCwd);
  if (process.platform !== "win32") fs.chmodSync(trustedCwd, 0o700);
  fs.writeFileSync(path.join(trustedCwd, checkFile), process.platform === "win32" ? "@exit /b 0\r\n" : "exit 0\n", "utf8");
  assert.equal((await runCoreTrustedCheck(cwdCatalog.checks[0])).detail_code, "trusted-input-identity-changed");
  fs.rmSync(trustedCwd, { recursive: true });
  fs.renameSync(`${trustedCwd}-old`, trustedCwd);

  writeCatalog([trustedInputCheck]);
  const racedCatalog = loadCoreVerificationCatalog(workspace);
  writeCatalog([{ ...trustedInputCheck, timeout_ms: 9_999 }]);
  const catalogRace = await verifyCoreWorkspaceMutation({ catalog: racedCatalog, before, after });
  assert.equal(catalogRace.check.detail_code, "catalog-identity-changed");
  assert.equal(catalogRace.decision.allowed, false);

  fs.rmSync(path.join(workspace, ".git", "opencode-harness", "core", "checks.json"));
  assert.throws(
    () => loadCoreVerificationCatalog(workspace),
    (error) => error?.code === "CORE_RUNTIME_CATALOG_REQUIRED",
  );
  const absentCatalog = loadCoreVerificationCatalog(workspace, { catalogRequired: false });
  assert.equal(absentCatalog.catalog_status, "absent");
  const absent = await verifyCoreWorkspaceMutation({ catalog: absentCatalog, before, after });
  assert.equal(absent.decision.allowed, true);
  assert.equal(absent.decision.reason, "no_applicable_trusted_check");
  assert.equal(absent.observation.eligible, false);

  const submoduleSource = path.join(temporaryRoot, "submodule-source");
  const submoduleWorkspace = path.join(temporaryRoot, "submodule-workspace");
  fs.mkdirSync(submoduleSource);
  fs.mkdirSync(submoduleWorkspace);
  for (const repository of [submoduleSource, submoduleWorkspace]) {
    run("git", ["init", "--quiet"], { cwd: repository });
    run("git", ["config", "user.email", "fixture@example.test"], { cwd: repository });
    run("git", ["config", "user.name", "Fixture"], { cwd: repository });
  }
  fs.writeFileSync(path.join(submoduleSource, "tracked.txt"), "one\n", "utf8");
  run("git", ["add", "tracked.txt"], { cwd: submoduleSource });
  run("git", ["commit", "--quiet", "-m", "submodule fixture"], { cwd: submoduleSource });
  fs.writeFileSync(path.join(submoduleWorkspace, "root.txt"), "root\n", "utf8");
  run("git", ["add", "root.txt"], { cwd: submoduleWorkspace });
  run("git", ["commit", "--quiet", "-m", "root fixture"], { cwd: submoduleWorkspace });
  run("git", ["-c", "protocol.file.allow=always", "submodule", "add", "--quiet", submoduleSource, "vendor/fixture"], {
    cwd: submoduleWorkspace,
  });
  snapshotCoreWorkspace(submoduleWorkspace);
  const dirtySubmoduleFile = path.join(submoduleWorkspace, "vendor", "fixture", "tracked.txt");
  fs.writeFileSync(dirtySubmoduleFile, "two\n", "utf8");
  const firstDirtyStatus = run("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: path.dirname(dirtySubmoduleFile),
  }).stdout;
  assert.throws(
    () => snapshotCoreWorkspace(submoduleWorkspace),
    (error) => error?.code === "CORE_RUNTIME_DIRTY_SUBMODULE",
  );
  fs.writeFileSync(dirtySubmoduleFile, "three\n", "utf8");
  const secondDirtyStatus = run("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: path.dirname(dirtySubmoduleFile),
  }).stdout;
  assert.equal(secondDirtyStatus, firstDirtyStatus, "dirty submodule status text fixture must remain unchanged");
  assert.throws(
    () => snapshotCoreWorkspace(submoduleWorkspace),
    (error) => error?.code === "CORE_RUNTIME_DIRTY_SUBMODULE",
    "dirty submodule content must fail closed even when status text is unchanged",
  );

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
    const containedWorkspace = path.join(temporaryRoot, "contained-check-workspace");
    const nodeFixtureExecutable = path.join(temporaryRoot, "fixture-node");
    fs.writeFileSync(nodeFixtureExecutable, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} "$@"\n`, { mode: 0o755 });
    fs.mkdirSync(path.join(containedWorkspace, "src"), { recursive: true });
    fs.writeFileSync(path.join(containedWorkspace, "src", "feature.mjs"), "export const value = 1;\n", "utf8");
    run("git", ["init", "--quiet"], { cwd: containedWorkspace });
    run("git", ["add", "src/feature.mjs"], { cwd: containedWorkspace });
    const detachedScript = path.join(containedWorkspace, "detached-check.mjs");
    const timeoutScript = path.join(containedWorkspace, "timeout-check.mjs");
    const childSource = `const fs=require("node:fs"); fs.writeFileSync(process.argv[1],String(process.pid)); setTimeout(()=>fs.writeFileSync(process.argv[2],"late"),Number(process.argv[3]));`;
    const parentPrefix = `import fs from "node:fs"; import {spawn} from "node:child_process"; const child=spawn(process.execPath,["-e",${JSON.stringify(childSource)},process.argv[2],process.argv[3],process.argv[4]],{detached:true,stdio:"ignore"}); child.unref(); const until=Date.now()+2000; while(!fs.existsSync(process.argv[2])&&Date.now()<until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);`;
    fs.writeFileSync(detachedScript, `${parentPrefix}\n`, "utf8");
    fs.writeFileSync(timeoutScript, `${parentPrefix} setInterval(()=>{},1000);\n`, "utf8");
    run("git", ["add", "detached-check.mjs", "timeout-check.mjs"], { cwd: containedWorkspace });

    const runDescendantCase = async ({ script, timeoutMs, writerDelayMs, pidName, markerName }) => {
      const pidFile = path.join(temporaryRoot, pidName);
      const marker = path.join(temporaryRoot, markerName);
      writeCatalog([check({
        executable_path: nodeFixtureExecutable,
        argv: [path.basename(script), pidFile, marker, String(writerDelayMs)],
        immutable_input_paths: [path.basename(script)],
        timeout_ms: timeoutMs,
      })], containedWorkspace);
      const containedCatalog = loadCoreVerificationCatalog(containedWorkspace);
      const containedBefore = snapshotCoreWorkspace(containedWorkspace);
      fs.writeFileSync(path.join(containedWorkspace, "src", "feature.mjs"), `export const value = ${Date.now()};\n`, "utf8");
      const containedAfter = snapshotCoreWorkspace(containedWorkspace);
      const result = await verifyCoreWorkspaceMutation({
        catalog: containedCatalog,
        before: containedBefore,
        after: containedAfter,
        processContainmentFactory: injectedDescendantContainmentFactory(pidFile),
      });
      await new Promise((resolve) => setTimeout(resolve, 750));
      assert.equal(fs.existsSync(marker), false, `${markerName} survived verified descendant teardown`);
      return result;
    };

    const detached = await runDescendantCase({
      script: detachedScript,
      timeoutMs: 5_000,
      writerDelayMs: 500,
      pidName: "detached-check.pid",
      markerName: "detached-check-late.txt",
    });
    assert.equal(detached.check.status, "passed");
    assert.equal(detached.decision.reason, "post_last_mutation_verification_passed");

    const timedOut = await runDescendantCase({
      script: timeoutScript,
      timeoutMs: 3_000,
      writerDelayMs: 3_500,
      pidName: "timeout-check.pid",
      markerName: "timeout-check-late.txt",
    });
    assert.equal(timedOut.check.detail_code, "check-timeout");
    assert.equal(timedOut.decision.allowed, false);
  }

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
    writeCatalog([check()]);
    const timedLauncher = await runCoreLauncher({ workspace, catalog: CORE_CHECK_CATALOG_PATH,
      opencode: process.execPath, opencodeArgs: ["-e", "setInterval(()=>{},1000)"], childTimeoutMs: 50,
      env: process.env }, { processContainmentFactory: async (worker) => injectedProcessGroupContainment(worker) });
    assert.equal(timedLauncher.receipt.child_execution.status, null);
    assert.equal(timedLauncher.receipt.child_execution.error_code, "ETIMEDOUT",
      "a wrapper-managed child timeout must still yield an authentic child-execution receipt");
    assert.equal(timedLauncher.receipt.child_execution.signal, "SIGKILL");
    const postChildFailure = await runCoreLauncher({ workspace, catalog: CORE_CHECK_CATALOG_PATH,
      opencode: process.execPath, opencodeArgs: ["-e", "process.exit(0)"],
      childTimeoutMs: 5_000, env: process.env },
    { processContainmentFactory: async (worker) => injectedProcessGroupContainment(worker),
      verifyCoreWorkspaceMutationFn: async () => { throw new Error("synthetic post-child verification failure"); } });
    assert.equal(postChildFailure.receipt.child_execution.status, 0);
    assert.equal(postChildFailure.receipt.decision.reason, "post_child_verification_failed",
      "post-child verification exceptions must preserve the authentic child-execution receipt");
    const unverifiedContainment = await runCoreLauncher({ workspace, catalog: CORE_CHECK_CATALOG_PATH,
      opencode: process.execPath, opencodeArgs: ["-e", "process.exit(0)"], childTimeoutMs: 5_000, env: process.env },
    { processContainmentFactory: async (worker) => {
      const base = injectedProcessGroupContainment(worker);
      return Object.freeze({ ...base, terminateAndVerify: async () => { await base.terminateAndVerify(); return false; },
        close: async () => true, status: () => Object.freeze({ teardown_verified: false }) });
    } });
    assert.equal(unverifiedContainment.receipt.child_execution.status, 0);
    assert.equal(unverifiedContainment.receipt.child_execution.error_code, "PROCESS_CONTAINMENT_UNVERIFIED",
      "post-child teardown failure must preserve child disposition while remaining infrastructure-invalid");
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
} catch (error) {
  process.stderr.write(`${sanitizeSyntheticModelFreeFailureDiagnostic(error?.stack ?? error?.message ?? String(error))}\n`);
  process.exitCode = 1;
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
