import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadBenchmarkV2Contracts, validateLoadedBenchmarkV2Contracts } from "../lib/benchmark/v2-contracts.mjs";
import {
  renderBenchmarkV2DevelopmentCorpus,
  renderBenchmarkV2ValidationCorpus,
  renderBenchmarkV2ProceduralSmallCorpus,
  renderBenchmarkV2ProceduralMediumCorpus,
  renderBenchmarkV2ProceduralHighCorpus,
  buildBenchmarkV2ProceduralHoldoutPool,
  validateBenchmarkV2DevelopmentCorpus,
  validateBenchmarkV2ValidationCorpus,
} from "../lib/benchmark/v2-fixtures.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contracts = loadBenchmarkV2Contracts(root);
const contractReport = validateLoadedBenchmarkV2Contracts(root);
assert.equal(contractReport.execution_status, "development-and-validation-executable");

const first = renderBenchmarkV2DevelopmentCorpus({
  repositoryRoot: root,
  manifest: contracts.dev,
  bindings: contracts.devBindings,
  seed: "benchmark-v2-development-fixture-verifier",
  repetition: 1,
});
const second = renderBenchmarkV2DevelopmentCorpus({
  repositoryRoot: root,
  manifest: contracts.dev,
  bindings: contracts.devBindings,
  seed: "benchmark-v2-development-fixture-verifier",
  repetition: 1,
});
const summary = validateBenchmarkV2DevelopmentCorpus(first);
assert.deepEqual(first, second);
assert.deepEqual(summary.counts, { small: 12, medium: 12, high: 12 });
assert.equal(summary.medium_multifile_count, 6);

const validation = renderBenchmarkV2ValidationCorpus({
  repositoryRoot: root,
  manifest: contracts.validation,
  bindings: contracts.validationBindings,
  seed: "benchmark-v2-validation-fixture-verifier",
  repetition: 1,
});
const validationSummary = validateBenchmarkV2ValidationCorpus(validation);
assert.deepEqual(validationSummary.counts, { small: 10, medium: 10, high: 10 });
assert.equal(validationSummary.medium_multifile_count, 5);

const proceduralSmall = renderBenchmarkV2ProceduralSmallCorpus({
  repositoryRoot: root,
  registry: contracts.proceduralCandidates,
  seed: "benchmark-v2-holdout-small-fixture-verifier",
  repetition: 1,
});
assert.equal(proceduralSmall.length, 24);
assert.equal(new Set(proceduralSmall.map((instance) => instance.family_id)).size, 24);
assert.equal(new Set(proceduralSmall.map((instance) => instance.instance_fingerprint)).size, 24);
const forgedProceduralRegistry = structuredClone(contracts.proceduralCandidates);
forgedProceduralRegistry.task_materialization_status = "generator-recipes-preregistered-not-yet-materialized";
assert.throws(() => renderBenchmarkV2ProceduralSmallCorpus({
  repositoryRoot: root,
  registry: forgedProceduralRegistry,
  seed: "benchmark-v2-holdout-small-fixture-verifier",
}), /preregistered executable source/u);

const proceduralMedium = renderBenchmarkV2ProceduralMediumCorpus({
  repositoryRoot: root,
  registry: contracts.proceduralCandidates,
  seed: "benchmark-v2-holdout-medium-fixture-verifier",
  repetition: 1,
});
assert.equal(proceduralMedium.length, 24);
assert.equal(new Set(proceduralMedium.map((instance) => instance.family_id)).size, 24);
assert.equal(new Set(proceduralMedium.map((instance) => instance.instance_fingerprint)).size, 24);
assert.equal(proceduralMedium.every((instance) => instance.solution_files.length === 2), true);

const proceduralHigh = renderBenchmarkV2ProceduralHighCorpus({
  repositoryRoot: root,
  registry: contracts.proceduralCandidates,
  seed: "benchmark-v2-holdout-high-fixture-verifier",
  repetition: 1,
});
assert.equal(proceduralHigh.length, 24);
assert.equal(new Set(proceduralHigh.map((instance) => instance.family_id)).size, 24);
assert.equal(new Set(proceduralHigh.map((instance) => instance.instance_fingerprint)).size, 24);
assert.equal(proceduralHigh.every((instance) => instance.solution_files.length === 2
  && instance.category === "high-risk-contract" && instance.risk === "critical"
  && instance.high_risk_contract?.risk_domain), true);
assert.equal(new Set(proceduralHigh.map((instance) => instance.high_risk_contract.risk_domain)).size, 11);
const proceduralPool = buildBenchmarkV2ProceduralHoldoutPool({
  registry: contracts.proceduralCandidates,
  instances: [...proceduralSmall, ...proceduralMedium, ...proceduralHigh],
});
assert.equal(proceduralPool.task_materialization_status, "executable");
assert.equal(proceduralPool.candidates.length, 72);
assert.equal(new Set(proceduralPool.candidates.map((candidate) => candidate.task_identity)).size, 72);
assert.equal(new Set(proceduralPool.candidates.map((candidate) => candidate.fixture_fingerprint)).size, 72);

for (const instance of [...first, ...validation, ...proceduralSmall, ...proceduralMedium, ...proceduralHigh]) {
  assert.equal(instance.prompt.includes("reference solution"), false);
  assert.equal(instance.public_files.length <= 20, true);
  assert.equal(instance.hidden_files.every((file) => ["test/", "hidden/"].some((prefix) => file.path.startsWith(prefix))), true);
  if (instance.solution_files.length === 2) {
    assert.equal(instance.task_scope.max_changed_files, 2);
    for (const solution of instance.solution_files) {
      assert.equal(instance.task_scope.allowed_changed_paths.includes(solution.path), true);
      assert.equal(instance.prompt.includes(solution.path), true);
    }
  }
}

const executionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-v2-fixtures-"));
try {
  for (const instance of [...first, ...validation, ...proceduralSmall, ...proceduralMedium, ...proceduralHigh]) {
    const fixtureRoot = path.join(executionRoot, instance.family_id);
    for (const file of [...instance.public_files, ...instance.solution_files, ...instance.hidden_files]) {
      const target = path.join(fixtureRoot, ...file.path.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.content, "utf8");
    }
    for (const check of [instance.visible_check, instance.hidden_check, ...(instance.consumer_checks ?? []).map((entry) => entry.check)]) {
      const execution = spawnSync(check.argv[0], check.argv.slice(1), {
        cwd: fixtureRoot,
        encoding: "utf8",
        timeout: check.timeout_ms,
        maxBuffer: 1024 * 1024,
      });
      assert.equal(execution.status, 0, `${instance.family_id} reference solution failed ${check.argv.join(" ")}\n${execution.stdout}\n${execution.stderr}`);
    }
  }
} finally {
  fs.rmSync(executionRoot, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({
  status: "passed",
  evidence_class: "model-free-fixture-validation",
  model_execution: false,
  ...summary,
  validation: validationSummary,
  procedural_small_count: proceduralSmall.length,
  procedural_small_fingerprints: proceduralSmall.map((instance) => instance.instance_fingerprint),
  procedural_medium_count: proceduralMedium.length,
  procedural_medium_fingerprints: proceduralMedium.map((instance) => instance.instance_fingerprint),
  procedural_high_count: proceduralHigh.length,
  procedural_high_fingerprints: proceduralHigh.map((instance) => instance.instance_fingerprint),
  procedural_pool_candidate_count: proceduralPool.candidates.length,
  development_fingerprints: first.map((instance) => instance.instance_fingerprint),
  validation_fingerprints: validation.map((instance) => instance.instance_fingerprint),
}, null, 2)}\n`);
