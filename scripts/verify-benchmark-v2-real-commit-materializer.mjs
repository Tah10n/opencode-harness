import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { fingerprintProfileValue } from "../lib/profile-v3.mjs";
import {
  createBenchmarkV2RealCommitSettlementReceipt,
  materializeBenchmarkV2RealCommitReference,
  prepareBenchmarkV2RealCommitCandidate,
} from "../lib/benchmark/v2-real-commit-materializer.mjs";

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false, windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function write(root, relativePath, content) {
  const target = path.join(root, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-v2-real-materializer-"));
try {
  git(root, "init", "-q");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.test");
  git(root, "remote", "add", "origin", "https://github.com/example/repository.git");
  write(root, "license", "MIT fixture\n");
  write(root, "index.js", "export const value = 'PARENT_ONLY';\n");
  write(root, "test.js", "// parent visible test\n");
  git(root, "add", "license", "index.js", "test.js");
  git(root, "commit", "-q", "-m", "parent");
  const parentSha = git(root, "rev-parse", "HEAD");
  const licenseBlobSha = git(root, "rev-parse", `${parentSha}:license`);
  write(root, "index.js", "export const value = 'CHILD_REFERENCE_SECRET';\n");
  write(root, "test.js", "// child hidden oracle\n");
  git(root, "add", "index.js", "test.js");
  git(root, "commit", "-q", "-m", "Fix value contract");
  const commitSha = git(root, "rev-parse", "HEAD");

  const registry = {
    schema_version: 2,
    registry_id: "benchmark-v2-real-commit-candidates",
    selection_status: "candidate-pool-not-selected",
    task_materialization_status: "provenance-curated-fixtures-not-yet-materialized",
    metadata_source: "github-commit-api-without-patch-bodies",
    reference_patch_access: "forbidden-before-model-settlement",
    repositories: [{
      id: "example-repository", url: "https://github.com/example/repository",
      license_spdx: "MIT", license_path: "license", license_blob_shas: [licenseBlobSha],
    }],
    candidates: [{
      id: "real-small-value-contract", stratum: "small", repository_id: "example-repository",
      commit_sha: commitSha, parent_sha: parentSha, title: "Fix value contract",
      changed_paths: ["index.js", "test.js"],
    }],
  };
  const prepared = prepareBenchmarkV2RealCommitCandidate({
    registry, candidateId: "real-small-value-contract", repositoryRoot: root,
  });
  assert.equal(prepared.public_files.length <= 20, true);
  assert.equal(prepared.public_files.some((file) => file.content.includes("PARENT_ONLY")), true);
  assert.equal(JSON.stringify(prepared).includes("CHILD_REFERENCE_SECRET"), false);
  assert.equal(prepared.reference_patch_access, "forbidden-before-model-settlement");

  const secret = randomBytes(32);
  const modelRunFingerprint = fingerprintProfileValue({ run: "settled" });
  const receipt = createBenchmarkV2RealCommitSettlementReceipt({
    prepared, modelRunFingerprint, completedAt: "2026-08-19T12:00:00.000Z", secret,
  });
  assert.throws(() => materializeBenchmarkV2RealCommitReference({
    registry, prepared, repositoryRoot: root,
  }), /BENCHMARK_V2_REAL_SETTLEMENT/u);
  const forged = { ...receipt, fixture_fingerprint: fingerprintProfileValue({ forged: true }) };
  assert.throws(() => materializeBenchmarkV2RealCommitReference({
    registry, prepared, repositoryRoot: root, settlementReceipt: forged, settlementSecret: secret,
  }), /BENCHMARK_V2_REAL_SETTLEMENT/u);
  assert.throws(() => materializeBenchmarkV2RealCommitReference({
    registry, prepared, repositoryRoot: root,
    settlementReceipt: { ...receipt, unexpected: true }, settlementSecret: secret,
  }), /BENCHMARK_V2_REAL_SETTLEMENT/u);
  const reference = materializeBenchmarkV2RealCommitReference({
    registry, prepared, repositoryRoot: root, settlementReceipt: receipt, settlementSecret: secret,
  });
  assert.equal(reference.reference_patch_access, "runner-only-after-model-settlement");
  assert.equal(reference.reference_files.find((file) => file.path === "index.js").content.includes("CHILD_REFERENCE_SECRET"), true);

  const changedPathRegistry = structuredClone(registry);
  changedPathRegistry.candidates[0].changed_paths = ["index.js"];
  assert.throws(() => prepareBenchmarkV2RealCommitCandidate({
    registry: changedPathRegistry, candidateId: "real-small-value-contract", repositoryRoot: root,
  }), /BENCHMARK_V2_REAL_CHANGED_PATHS/u);
  const wrongLicenseRegistry = structuredClone(registry);
  wrongLicenseRegistry.repositories[0].license_blob_shas = ["a".repeat(40)];
  assert.throws(() => prepareBenchmarkV2RealCommitCandidate({
    registry: wrongLicenseRegistry, candidateId: "real-small-value-contract", repositoryRoot: root,
  }), /BENCHMARK_V2_REAL_LICENSE/u);
  const wrongRemoteRegistry = structuredClone(registry);
  wrongRemoteRegistry.repositories[0].url = "https://github.com/example/other";
  assert.throws(() => prepareBenchmarkV2RealCommitCandidate({
    registry: wrongRemoteRegistry, candidateId: "real-small-value-contract", repositoryRoot: root,
  }), /BENCHMARK_V2_REAL_REMOTE/u);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

process.stdout.write("benchmark v2 real-commit materializer boundary passed\n");
