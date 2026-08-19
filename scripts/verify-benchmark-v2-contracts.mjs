import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  exactMcNemarPower,
  loadBenchmarkV2Contracts,
  validateBenchmarkV2Contracts,
  validateLoadedBenchmarkV2Contracts,
} from "../lib/benchmark/v2-contracts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const report = validateLoadedBenchmarkV2Contracts(root);
assert.equal(report.status, "passed");
assert.deepEqual(report.family_totals, { development: 36, validation: 30, holdout_planned: 90 });
assert.equal(report.paired_holdout_observations, 180);
assert.equal(report.real_commit_candidate_count, 36);
assert.equal(report.real_commit_repository_count, 5);
assert.equal(report.real_commit_requirement_count, 36);
assert.equal(report.procedural_candidate_count, 72);
assert.equal(report.procedural_high_risk_domain_count, 11);
assert(report.exact_power > 0.86);
assert(report.clustered_sensitivity_power > 0.82);

const loaded = loadBenchmarkV2Contracts(root);
assert.throws(() => validateBenchmarkV2Contracts({
  ...loaded,
  selectedHoldoutExists: true,
}), /BENCHMARK_V2_HOLDOUT/u);

const validationOverlap = structuredClone(loaded.validation);
validationOverlap.families[0].recipe_id = loaded.dev.families[0].recipe_id;
const validationBindingsOverlap = structuredClone(loaded.validationBindings);
validationBindingsOverlap.bindings[0].kernel_id = loaded.dev.families[0].recipe_id;
assert.throws(() => validateBenchmarkV2Contracts({
  ...loaded,
  validation: validationOverlap,
  validationBindings: validationBindingsOverlap,
}), /BENCHMARK_V2_SPLIT_OVERLAP/u);

const weakenedPolicy = structuredClone(loaded.policy);
weakenedPolicy.activation_guardrails.eligible_mechanism_activation_minimum = 0.90;
assert.throws(() => validateBenchmarkV2Contracts({
  ...loaded,
  policy: weakenedPolicy,
}), /BENCHMARK_V2_POLICY/u);

const weakenedSaltCommitment = structuredClone(loaded.saltCommitment);
weakenedSaltCommitment.created_before_holdout_selection = false;
assert.throws(() => validateBenchmarkV2Contracts({
  ...loaded,
  saltCommitment: weakenedSaltCommitment,
}), /BENCHMARK_V2_HOLDOUT_SALT/u);

const exposedReferencePatch = structuredClone(loaded.realCommitCandidates);
exposedReferencePatch.reference_patch_access = "available-before-model-settlement";
assert.throws(() => validateBenchmarkV2Contracts({
  ...loaded,
  realCommitCandidates: exposedReferencePatch,
}), /BENCHMARK_V2_REAL_COMMIT_REGISTRY/u);

const duplicateRealCommit = structuredClone(loaded.realCommitCandidates);
duplicateRealCommit.candidates[1].commit_sha = duplicateRealCommit.candidates[0].commit_sha;
duplicateRealCommit.candidates[1].repository_id = duplicateRealCommit.candidates[0].repository_id;
assert.throws(() => validateBenchmarkV2Contracts({
  ...loaded,
  realCommitCandidates: duplicateRealCommit,
}), /BENCHMARK_V2_REAL_COMMIT_COVERAGE/u);

const unsafeChangedPath = structuredClone(loaded.realCommitCandidates);
unsafeChangedPath.candidates[0].changed_paths[0] = "../reference.patch";
assert.throws(() => validateBenchmarkV2Contracts({
  ...loaded,
  realCommitCandidates: unsafeChangedPath,
}), /BENCHMARK_V2_REAL_COMMIT_PATH/u);

const missingRealRequirement = structuredClone(loaded.realCommitRequirements);
missingRealRequirement.requirements.pop();
assert.throws(() => validateBenchmarkV2Contracts({
  ...loaded,
  realCommitRequirements: missingRealRequirement,
}), /BENCHMARK_V2_REAL_REQUIREMENT_COVERAGE/u);

const hiddenRealRequirement = structuredClone(loaded.realCommitRequirements);
hiddenRealRequirement.requirements[0].visible_requirement = "Apply the reference patch and satisfy the hidden tests for this otherwise unspecified behavior.";
assert.throws(() => validateBenchmarkV2Contracts({
  ...loaded,
  realCommitRequirements: hiddenRealRequirement,
}), /BENCHMARK_V2_REAL_REQUIREMENT/u);

const incompleteProceduralExecution = structuredClone(loaded.proceduralCandidates);
incompleteProceduralExecution.task_materialization_status = "generator-recipes-preregistered-not-yet-materialized";
assert.throws(() => validateBenchmarkV2Contracts({
  ...loaded,
  proceduralCandidates: incompleteProceduralExecution,
}), /BENCHMARK_V2_PROCEDURAL_REGISTRY/u);

const duplicateProceduralRecipe = structuredClone(loaded.proceduralCandidates);
duplicateProceduralRecipe.candidates[1].recipe_id = duplicateProceduralRecipe.candidates[0].recipe_id;
assert.throws(() => validateBenchmarkV2Contracts({
  ...loaded,
  proceduralCandidates: duplicateProceduralRecipe,
}), /BENCHMARK_V2_PROCEDURAL_COVERAGE/u);

const missingRiskDomain = structuredClone(loaded.proceduralCandidates);
for (const candidate of missingRiskDomain.candidates) {
  if (candidate.risk_domain === "rollback") candidate.risk_domain = "authorization";
}
assert.throws(() => validateBenchmarkV2Contracts({
  ...loaded,
  proceduralCandidates: missingRiskDomain,
}), /BENCHMARK_V2_PROCEDURAL_COVERAGE/u);

const underpowered = exactMcNemarPower({
  pair_count: 120,
  candidate_only_probability: 0.10,
  baseline_only_probability: 0.02,
  alpha: 0.025,
});
assert(underpowered < 0.80);

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
