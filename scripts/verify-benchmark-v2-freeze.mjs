import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { fingerprintProfileValue } from "../lib/profile-v3.mjs";
import {
  buildBenchmarkV2FreezeManifest,
  validateBenchmarkV2FreezeManifest,
} from "../lib/benchmark/v2-freeze.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryParent = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-v2-freeze-fixture-"));
const root = path.join(temporaryParent, "repo");

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false, windowsHide: true });
  if (result.status !== 0) throw new Error(`fixture git ${args[0]} failed: ${result.stderr}`);
  return result.stdout.trim();
}

try {
  const listed = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: sourceRoot, encoding: "utf8", shell: false, windowsHide: true,
  });
  if (listed.status !== 0) throw new Error(`fixture source inventory failed: ${listed.stderr}`);
  fs.mkdirSync(root, { recursive: true });
  for (const relativePath of listed.stdout.split("\0").filter(Boolean)) {
    const source = path.resolve(sourceRoot, ...relativePath.split("/"));
    const target = path.resolve(root, ...relativePath.split("/"));
    const stat = fs.lstatSync(source);
    if (!stat.isFile() || stat.isSymbolicLink()) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  const salt = "0123456789abcdef".repeat(4);
  const commitmentPath = path.join(root, "benchmarks", "v2", "holdout", "salt-commitment.v2.json");
  const commitment = JSON.parse(fs.readFileSync(commitmentPath, "utf8"));
  commitment.commitment = fingerprintProfileValue(salt);
  fs.writeFileSync(commitmentPath, `${JSON.stringify(commitment, null, 2)}\n`, "utf8");
  git(["init", "--initial-branch=fixture"]);
  git(["config", "user.name", "Benchmark Fixture"]);
  git(["config", "user.email", "benchmark-fixture@example.invalid"]);
  git(["add", "."]);
  git(["commit", "-m", "fixture freeze source"]);

  const executableFingerprint = `sha256:${"a".repeat(64)}`;
  const options = {
    repositoryRoot: root,
    round: 1,
    workflowRunId: "123456789",
    salt,
    model: "openai/gpt-5.6-luna",
    provider: "openai",
    variant: "low",
    timeoutMs: 300_000,
    candidateProfileId: "P51",
    executableFingerprint,
  };
  const manifest = buildBenchmarkV2FreezeManifest(options);
  assert.equal(manifest.status, "frozen-pre-selection");
  assert.equal(manifest.confirmatory_round, 1);
  assert.equal(manifest.allocated_alpha, 0.025);
  assert.equal(manifest.holdout_selected, false);
  assert.equal(manifest.selected_holdout_manifest, null);
  assert.match(manifest.holdout_seed, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(validateBenchmarkV2FreezeManifest(manifest, {
    repositoryRoot: root,
    salt,
    expectedFreezeFingerprint: manifest.freeze_fingerprint,
    observedExecutableFingerprint: executableFingerprint,
  }), manifest);

  const roundTwo = buildBenchmarkV2FreezeManifest({ ...options, round: 2 });
  assert.equal(roundTwo.allocated_alpha, 0.015);
  assert.notEqual(roundTwo.freeze_fingerprint, manifest.freeze_fingerprint);
  assert.equal(roundTwo.holdout_seed, manifest.holdout_seed);

  const changedWorkflow = buildBenchmarkV2FreezeManifest({ ...options, workflowRunId: "123456790" });
  assert.notEqual(changedWorkflow.holdout_seed, manifest.holdout_seed);
  assert.notEqual(changedWorkflow.freeze_fingerprint, manifest.freeze_fingerprint);

  const tampered = structuredClone(manifest);
  tampered.bindings.timeout_ms += 1;
  const { freeze_fingerprint: _discardedFingerprint, ...tamperedSource } = tampered;
  tampered.freeze_fingerprint = fingerprintProfileValue(tamperedSource);
  assert.throws(() => validateBenchmarkV2FreezeManifest(tampered, {
    repositoryRoot: root,
    salt,
    expectedFreezeFingerprint: manifest.freeze_fingerprint,
  }), /BENCHMARK_V2_FREEZE_IDENTITY/u);
  assert.throws(() => validateBenchmarkV2FreezeManifest(manifest, {
    repositoryRoot: root,
    salt,
    expectedFreezeFingerprint: manifest.freeze_fingerprint,
    observedExecutableFingerprint: `sha256:${"b".repeat(64)}`,
  }), /BENCHMARK_V2_FREEZE_EXECUTABLE/u);

  assert.throws(() => buildBenchmarkV2FreezeManifest({ ...options, salt: "0".repeat(64) }), /BENCHMARK_V2_FREEZE_SALT/u);
  assert.throws(() => buildBenchmarkV2FreezeManifest({ ...options, round: 4 }), /BENCHMARK_V2_FREEZE_INPUT/u);
  assert.throws(() => buildBenchmarkV2FreezeManifest({
    ...options,
    executableFingerprint: fingerprintProfileValue("not-an-executable-identity"),
    workflowRunId: "bad workflow value",
  }), /BENCHMARK_V2_FREEZE_INPUT/u);

  fs.appendFileSync(path.join(root, "agents", "core-v5.md"), "\nfixture drift\n", "utf8");
  assert.throws(() => validateBenchmarkV2FreezeManifest(manifest, {
    repositoryRoot: root,
    salt,
    expectedFreezeFingerprint: manifest.freeze_fingerprint,
  }), /BENCHMARK_V2_FREEZE_DIRTY/u);
  assert.throws(() => validateBenchmarkV2FreezeManifest(manifest, {
    repositoryRoot: root,
    salt,
    requireClean: false,
    expectedFreezeFingerprint: manifest.freeze_fingerprint,
  }), /BENCHMARK_V2_FREEZE_STALE/u);

  process.stdout.write("benchmark v2 freeze contracts passed\n");
} finally {
  fs.rmSync(temporaryParent, { recursive: true, force: true });
}
