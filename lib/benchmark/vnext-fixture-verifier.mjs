import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import { fingerprintProfileValue } from "../profile-v3.mjs";
import { loadProjectCheckCatalog } from "../quality/project-check-catalog.mjs";
import { loadTrustedToolchainMap, resolveTrustedToolchainInvocation } from "../quality/trusted-toolchains.mjs";
import {
  captureSyntheticGitState,
  materializeSyntheticFixtureControl,
  syntheticVisiblePreflightChecks,
} from "./fixture-control.mjs";
import { loadVnextContracts } from "./vnext-contracts.mjs";
import { renderVnextInstance, validateRenderedVnextInstance } from "./vnext-fixtures.mjs";

const CATALOG_PATH = ".git/opencode-harness/quality/checks.json";
const TOOLCHAIN_PATH = ".git/opencode-harness/quality/toolchains.json";

function writeFiles(root, files) {
  for (const file of files) {
    const target = path.join(root, ...file.path.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content, "utf8");
  }
}

function runNode(root, args, invocation = null) {
  return spawnSync(invocation?.executable_path ?? process.execPath, [
    ...(invocation?.argv_prefix ?? []),
    ...args,
  ], {
    cwd: root,
    env: {
      ...process.env,
      ...(invocation?.runtime_metadata?.git?.executable_path
        ? { OPENCODE_QUALITY_GIT_EXECUTABLE: invocation.runtime_metadata.git.executable_path }
        : {}),
    },
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 15_000,
    maxBuffer: 256 * 1024,
  });
}

function assertRun(condition, code, instance, result) {
  if (condition) return;
  const diagnostic = `${result?.stdout ?? ""}\n${result?.stderr ?? ""}`.slice(-2000);
  throw new Error(`${code}: ${instance.vnext_family_id}: ${diagnostic}`);
}

function verifyInstance(root, instance, stratum) {
  writeFiles(root, instance.public_files);
  const control = materializeSyntheticFixtureControl({ repo: root, instance });
  const loadedCatalog = loadProjectCheckCatalog(root, { relativePath: CATALOG_PATH });
  const loadedToolchains = loadTrustedToolchainMap(root, { relativePath: TOOLCHAIN_PATH });
  const check = loadedCatalog.catalog.checks.find((entry) => entry.check_id === "synthetic-visible");
  if (JSON.stringify(check?.argv) !== JSON.stringify(instance.visible_check.kind === "command"
    ? instance.visible_check.argv.slice(1)
    : ["--test", ".git/opencode-harness/quality/review-read-only.test.mjs"])) {
    throw new Error(`VNEXT_FIXTURE_CATALOG_ARGV: ${instance.vnext_family_id}`);
  }
  const invocation = resolveTrustedToolchainInvocation({
    toolchainMap: loadedToolchains.map,
    executableId: check.executable_id,
    argv: check.argv,
    workspaceRoot: root,
  });
  if (!invocation.identity_fingerprint || !loadedCatalog.fingerprint) {
    throw new Error(`VNEXT_FIXTURE_TRUSTED_INVOCATION: ${instance.vnext_family_id}`);
  }

  if (instance.visible_check.kind === "command") {
    const testPaths = instance.visible_check.argv.slice(2);
    const combinedBefore = runNode(root, instance.visible_check.argv.slice(1), invocation);
    assertRun(combinedBefore.status !== null, "VNEXT_FIXTURE_COMBINED_PREFIX", instance, combinedBefore);
    if (stratum === "small") {
      assertRun(combinedBefore.status !== 0, "VNEXT_FIXTURE_SMALL_REPRODUCER_PREFIX", instance, combinedBefore);
    }
    if (stratum === "medium") {
      for (const preflight of syntheticVisiblePreflightChecks(check)) {
        const result = runNode(root, preflight.check.argv, invocation);
        assertRun(
          preflight.expected_outcome === "failing_reproducer" ? result.status === 1 : result.status === 0,
          preflight.role === "auxiliary" ? "VNEXT_FIXTURE_AUXILIARY_PREFIX"
            : preflight.role === "primary" ? "VNEXT_FIXTURE_PRIMARY_PREFIX" : "VNEXT_FIXTURE_VISIBLE_SYNTAX",
          instance,
          result,
        );
      }
      assertRun(combinedBefore.status !== 0, "VNEXT_FIXTURE_COMBINED_PREFIX", instance, combinedBefore);
    }
    writeFiles(root, instance.solution_files);
    const combinedAfter = runNode(root, instance.visible_check.argv.slice(1), invocation);
    assertRun(combinedAfter.status === 0, "VNEXT_FIXTURE_COMBINED_POSTFIX", instance, combinedAfter);
  } else {
    const before = runNode(root, check.argv, invocation);
    assertRun(before.status === 0, "VNEXT_FIXTURE_STRUCTURED_VISIBLE_PREFIX", instance, before);
    writeFiles(root, instance.solution_files);
    const after = runNode(root, check.argv, invocation);
    assertRun(after.status === 0, "VNEXT_FIXTURE_STRUCTURED_VISIBLE_POSTFIX", instance, after);
  }

  writeFiles(root, instance.hidden_files);
  if (instance.hidden_check.kind === "command") {
    const hidden = runNode(root, instance.hidden_check.argv.slice(1), invocation);
    assertRun(hidden.status === 0, "VNEXT_FIXTURE_HIDDEN", instance, hidden);
  }
  for (const consumer of instance.consumer_checks ?? []) {
    const result = runNode(root, consumer.check.argv.slice(1), invocation);
    assertRun(result.status === 0, "VNEXT_FIXTURE_CONSUMER", instance, result);
  }
  const finalGit = captureSyntheticGitState(root);
  if (finalGit.fingerprint !== control.git_state.fingerprint) {
    throw new Error(`VNEXT_FIXTURE_TEARDOWN: ${instance.vnext_family_id}`);
  }
  if (fs.existsSync(path.join(root, ".oc_harness"))) {
    throw new Error(`VNEXT_FIXTURE_CONTROL_TEARDOWN: ${instance.vnext_family_id}`);
  }
  return Object.freeze({
    family_id: instance.vnext_family_id,
    stratum,
    visible_kind: instance.visible_check.kind,
    catalog_fingerprint: loadedCatalog.fingerprint,
    command_argv: Object.freeze([...(check.argv ?? [])]),
  });
}

function expectMaterializationRejected(instance, mutate) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "opencode-vnext-negative-")));
  try {
    writeFiles(root, instance.public_files);
    mutate({ root, instance });
    try {
      materializeSyntheticFixtureControl({ repo: root, instance });
    } catch {
      return;
    }
    throw new Error("VNEXT_FIXTURE_NEGATIVE_ACCEPTED");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function verifyNegativeCases(medium) {
  const withArgv = (argv) => ({ ...medium, visible_check: { ...medium.visible_check, argv } });
  const base = medium.visible_check.argv;
  const cases = [
    withArgv([...base, "--watch"]),
    withArgv(["node", "--test", "/tmp/absolute.test.mjs"]),
    withArgv(["node", "--test", "test/../public.test.mjs"]),
    withArgv(["node", "--test", "https://example.invalid/public.test.mjs"]),
    withArgv(["node", "--test", "test\\public.test.mjs"]),
    withArgv(["node", "--test", "test/public\0.test.mjs"]),
    withArgv(["node", "--test", "test/*.test.mjs"]),
    withArgv(["node", "--test", "test/unknown.test.mjs"]),
    withArgv(["node", "--test", medium.hidden_files[0].path]),
    withArgv([...base, base[2]]),
    withArgv(["node", "--test", ...Array.from({ length: 9 }, (_, index) => `test/${index}.test.mjs`)]),
  ];
  for (const candidate of cases) expectMaterializationRejected(candidate, () => {});
  expectMaterializationRejected(medium, ({ root }) => {
    const target = path.join(root, "test", "remote-consumer.test.mjs");
    fs.unlinkSync(target);
    fs.symlinkSync("public.test.mjs", target);
  });
  expectMaterializationRejected(medium, ({ root }) => {
    fs.unlinkSync(path.join(root, "test", "remote-consumer.test.mjs"));
  });

  const malformedRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "opencode-vnext-catalog-negative-")));
  try {
    writeFiles(malformedRoot, medium.public_files);
    materializeSyntheticFixtureControl({ repo: malformedRoot, instance: medium });
    fs.writeFileSync(path.join(malformedRoot, ...CATALOG_PATH.split("/")), "{ malformed\n", "utf8");
    let rejected = false;
    try { loadProjectCheckCatalog(malformedRoot, { relativePath: CATALOG_PATH }); } catch { rejected = true; }
    if (!rejected) throw new Error("VNEXT_FIXTURE_MALFORMED_CATALOG_ACCEPTED");
    const launch = spawnSync(path.join(malformedRoot, "missing-node-executable"), ["--test", base[2]], {
      cwd: malformedRoot,
      shell: false,
      encoding: "utf8",
    });
    if (launch.error === undefined || launch.status !== null) {
      throw new Error("VNEXT_FIXTURE_LAUNCH_FAILURE_CLASSIFIED_AS_REPRODUCER");
    }
  } finally {
    fs.rmSync(malformedRoot, { recursive: true, force: true });
  }

  const auxiliaryPath = base.at(-1);
  const auxiliary = medium.public_files.find((entry) => entry.path === auxiliaryPath);
  const failingAuxiliary = {
    ...medium,
    public_files: medium.public_files.map((entry) => entry.path === auxiliaryPath
      ? { ...entry, content: `${entry.content}\nthrow new Error("auxiliary failure");\n`,
        bytes: Buffer.byteLength(`${entry.content}\nthrow new Error("auxiliary failure");\n`, "utf8"),
        content_fingerprint: fingerprintProfileValue({ path: entry.path,
          content: `${entry.content}\nthrow new Error("auxiliary failure");\n` }) }
      : entry),
  };
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "opencode-vnext-aux-negative-")));
  try {
    let rejected = false;
    let observedMessage = "";
    try { verifyInstance(root, failingAuxiliary, "medium"); } catch (error) {
      observedMessage = String(error.message);
      rejected = observedMessage.includes("VNEXT_FIXTURE_AUXILIARY_PREFIX");
    }
    if (!rejected) throw new Error(`VNEXT_FIXTURE_AUXILIARY_FAILURE_ACCEPTED: ${observedMessage}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  return 16;
}

export function verifyVnextFixtureControlBoundary(repositoryRoot) {
  const loaded = loadVnextContracts(repositoryRoot);
  const results = [];
  for (const family of loaded.contract.families) {
    const instance = validateRenderedVnextInstance(renderVnextInstance({
      repositoryRoot,
      family,
      seed: `vnext-fixture-boundary-${family.id}`,
      repetition: 1,
    }), family);
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "opencode-vnext-boundary-")));
    try { results.push(verifyInstance(root, instance, family.stratum)); }
    finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  const medium = validateRenderedVnextInstance(renderVnextInstance({
    repositoryRoot,
    family: loaded.contract.families.find((entry) => entry.stratum === "medium"),
    seed: "vnext-fixture-boundary-negative",
    repetition: 1,
  }), loaded.contract.families.find((entry) => entry.stratum === "medium"));
  const negativeCaseCount = verifyNegativeCases(medium);
  return Object.freeze({
    status: "passed",
    materialized_family_count: results.length,
    family_counts: Object.freeze(Object.fromEntries(["small", "medium", "high"].map(
      (stratum) => [stratum, results.filter((entry) => entry.stratum === stratum).length],
    ))),
    negative_case_count: negativeCaseCount,
    reproducer_family_count: results.filter((entry) => entry.visible_kind === "command"
      && ["small", "medium"].includes(entry.stratum)).length,
    hidden_oracle_family_count: results.filter((entry) => entry.stratum === "high").length,
    regression_argv: Object.freeze([...medium.visible_check.argv]),
    fingerprint: fingerprintProfileValue(results),
  });
}
