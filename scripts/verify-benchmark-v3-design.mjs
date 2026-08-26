import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assessBenchmarkV3BaselineOpportunity,
  assessSmallNonInferiorityAttainability,
  computeBenchmarkV3PowerGate,
  criticalCandidateWins,
  exactBinomialUpperTail,
  exactBinomialUpperConfidenceBound,
  exactConservativePairedDeltaInterval,
  loadBenchmarkV3Design,
  minimumAllPositiveDiscordantClusters,
  validateBenchmarkV3CandidateBudget,
  validateBenchmarkV3Design,
} from "../lib/benchmark/v3-design.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { value: design, validation } = loadBenchmarkV3Design(root);
assert.equal(validation.status, "validated");
assert.equal(validation.evidence_class, "model-free-executable-design-validation");
assert.equal(validation.model_execution, false);
assert.equal(validation.conditional_power, 0.8042077854595496);
assert.equal(validation.minimum_baseline_failures_for_attainable_power, 11);
assert.equal(validation.attainable_power_at_minimum, 0.8512584537246037);
assert.deepEqual(validation.minimum_baseline_failures_per_stratum, { small: 2, medium: 2, high: 2 });

assert.equal(minimumAllPositiveDiscordantClusters(0.025), 6);
assert.equal(criticalCandidateWins(20, 0.025), 15);
assert.equal(exactBinomialUpperTail(20, 15, 0.5), 0.020694732666015625);
assert(Math.abs(exactBinomialUpperConfidenceBound(60, 0, 0.95) - 0.04870291331009752) < 1e-12);
assert(Math.abs(exactBinomialUpperConfidenceBound(90, 0, 0.95) - 0.03273803383353452) < 1e-12);
assert(exactBinomialUpperConfidenceBound(90, 0, 0.95) <= 0.033);
assert(exactBinomialUpperConfidenceBound(60, 0, 0.95) > 0.033);
assert(exactBinomialUpperConfidenceBound(149, 0, 0.95) <= 0.02);
const conservativeInterval = exactConservativePairedDeltaInterval({
  familyCount: 60,
  candidateOnly: 15,
  baselineOnly: 5,
  confidenceLevel: 0.95,
});
assert(conservativeInterval[0] < (1 / 30) && conservativeInterval[1] > 0.3);
assert(exactConservativePairedDeltaInterval({ familyCount: 20, candidateOnly: 0, baselineOnly: 0, confidenceLevel: 0.95 })[0] < -0.1);
for (const familyCount of [20, 30]) {
  assert.equal(assessSmallNonInferiorityAttainability({
    familyCount, margin: -0.03, test: "zero-discordance-pass-else-conservative-ci",
  }).equal_arms_pass, true);
  assert.equal(assessSmallNonInferiorityAttainability({
    familyCount, margin: -0.03, test: "conservative-ci-lower-bound",
  }).attainable, false);
}

const insufficient = computeBenchmarkV3PowerGate({
  familyCount: 60,
  observedBaselineFailures: 11,
  alpha: 0.025,
  minimumPracticalDelta: 0.1,
  preregisteredFixProbability: 0.8,
  permittedRegressionProbability: 0.02,
});
assert.equal(insufficient.eligible, false);
assert.equal(insufficient.criteria.best_possible_exact_p_passed, true);
assert.equal(insufficient.criteria.best_possible_delta_passed, true);
assert.equal(insufficient.criteria.attainable_power_passed, false);
assert(insufficient.attainable_power < 0.8);

const sufficient = computeBenchmarkV3PowerGate({
  familyCount: 60,
  observedBaselineFailures: 12,
  alpha: 0.025,
  minimumPracticalDelta: 0.1,
  preregisteredFixProbability: 0.8,
  permittedRegressionProbability: 0.02,
});
assert.equal(sufficient.eligible, true);
assert.equal(sufficient.attainable_power, 0.8254979768174975);

const opportunity = assessBenchmarkV3BaselineOpportunity(design, { small: 4, medium: 4, high: 4 });
assert.equal(opportunity.eligible, true);
assert.equal(opportunity.total_baseline_failures, 12);
assert.equal(opportunity.per_candidate_alpha, 0.05);
assert.throws(() => assessBenchmarkV3BaselineOpportunity(design, { small: 4, medium: 4, high: 4 }, 2));

const stratumBlocked = assessBenchmarkV3BaselineOpportunity(design, { small: 1, medium: 5, high: 6 });
assert.equal(stratumBlocked.eligible, false);
assert(stratumBlocked.reasons.includes("opportunity-minimum-small-not-met"));
assert.equal(stratumBlocked.candidate_tokens, 0);

const p52Blocked = assessBenchmarkV3BaselineOpportunity(design, { small: 0, medium: 0, high: 2 });
assert.equal(p52Blocked.eligible, false);
assert(p52Blocked.reasons.includes("best-possible-exact-p-failed"));
assert(p52Blocked.reasons.includes("best-possible-delta-failed"));
assert(p52Blocked.reasons.includes("actual-attainable-power-failed"));
assert.equal(p52Blocked.disposition, "design-uninformative-candidate-tokens-zero");

const candidate = (id, fill) => ({
  candidate_id: id,
  architecture_fingerprint: `sha256:${fill.repeat(64)}`,
  product_bundle_fingerprint: `sha256:${fill.toUpperCase().toLowerCase().repeat(64)}`,
  source_sha: fill.repeat(40),
  registered_before_baseline: true,
  development_execution_count: 0,
});
const a = candidate("architecture-a", "a");
const b = candidate("architecture-b", "b");
assert.deepEqual(validateBenchmarkV3CandidateBudget(design, [a]), {
  status: "validated",
  registered_candidates: 1,
  remaining_candidates: 0,
  per_candidate_alpha: 0.05,
  familywise_alpha: 0.05,
  registrations_immutable: true,
  development_executions: 0,
});

let negativeCount = 0;
function rejects(label, operation) {
  assert.throws(operation, undefined, label);
  negativeCount += 1;
}
function changed(mutator) {
  const copy = structuredClone(design);
  mutator(copy);
  return copy;
}

rejects("model gate cannot be weakened", () => validateBenchmarkV3Design(changed((copy) => {
  copy.execution_policy.model_execution = "allowed";
})));
rejects("selection rule cannot change after baseline", () => validateBenchmarkV3Design(changed((copy) => {
  copy.stages.selection_rule = "manual";
})));
rejects("fixed historical threshold cannot return", () => validateBenchmarkV3Design(changed((copy) => {
  copy.opportunity_power_gate.minimum_baseline_failures_total = 15;
})));
rejects("guardrails cannot weaken", () => validateBenchmarkV3Design(changed((copy) => {
  copy.guardrails.timeout_delta_maximum = 0.03;
})));
rejects("impossible two-percent safety threshold cannot return at n=90", () => validateBenchmarkV3Design(changed((copy) => {
  copy.guardrails.new_high_medium_regression_rate_upper_bound_maximum = 0.02;
})));
rejects("derived attainable power cannot drift", () => validateBenchmarkV3Design(changed((copy) => {
  copy.derived.attainable_power_at_minimum = 0.9;
})));
rejects("candidate count is bounded", () => validateBenchmarkV3CandidateBudget(design, [a, b]));
rejects("late registration is forbidden", () => validateBenchmarkV3CandidateBudget(design, [{ ...a, registered_before_baseline: false }]));
rejects("development rerun is forbidden", () => validateBenchmarkV3CandidateBudget(design, [{ ...a, development_execution_count: 2 }]));

console.log(JSON.stringify({
  status: "passed",
  evidence_class: "model-free-executable-design-verification",
  model_execution: false,
  design_fingerprint: validation.design_fingerprint,
  development_family_count: 60,
  conditional_power: validation.conditional_power,
  minimum_baseline_failures_for_attainable_power: validation.minimum_baseline_failures_for_attainable_power,
  attainable_power_at_minimum: validation.attainable_power_at_minimum,
  p52_saturation_blocked_before_candidate: !p52Blocked.eligible,
  negative_cases: negativeCount,
}, null, 2));
