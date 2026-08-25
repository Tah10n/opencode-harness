import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { materializeProfileBundleV3 } from "../lib/profile-v3.mjs";
import {
  changedCoreWorkspacePaths,
  loadCoreVerificationCatalog,
  snapshotCoreWorkspace,
  verifyCoreWorkspaceMutation,
} from "../runtime/core-verification-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "core-product-runtime-"));
const workspace = path.join(temporaryRoot, "workspace");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", shell: false, windowsHide: true, ...options });
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed: ${result.stderr}`);
  return result;
}

function writeCatalog(checks) {
  const directory = path.join(workspace, ".git", "opencode-harness", "core");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "checks.json"), `${JSON.stringify({
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
    executable_path: fs.realpathSync.native(process.execPath),
    argv: ["-e", "process.exit(0)"],
    cwd: ".",
    timeout_ms: 10_000,
    ...overrides,
  };
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
  assert.match(afterRename.files["src/renamed.mjs"], /^sha256:/u);
  assert.deepEqual(changedCoreWorkspacePaths(beforeRename, afterRename), ["src/feature.mjs", "src/renamed.mjs"]);
  fs.renameSync(path.join(workspace, "src", "renamed.mjs"), path.join(workspace, "src", "feature.mjs"));

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

  fs.rmSync(path.join(workspace, ".git", "opencode-harness", "core", "checks.json"));
  const absentCatalog = loadCoreVerificationCatalog(workspace);
  assert.equal(absentCatalog.catalog_status, "absent");
  const absent = verifyCoreWorkspaceMutation({ catalog: absentCatalog, before, after });
  assert.equal(absent.decision.allowed, true);
  assert.equal(absent.decision.reason, "no_applicable_trusted_check");
  assert.equal(absent.observation.eligible, false);

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
