import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assessBenchmarkV3BaselineOpportunity,
  criticalCandidateWins,
  exactBinomialUpperTail,
  exactEmpiricalClusterBootstrapInterval,
  loadBenchmarkV3Design,
  minimumAllPositiveDiscordantClusters,
  validateBenchmarkV3CandidateBudget,
  validateBenchmarkV3Design,
} from "../lib/benchmark/v3-design.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const loaded = loadBenchmarkV3Design(root);
const { value: design, validation } = loaded;

assert.equal(validation.status, "validated");
assert.equal(validation.evidence_class, "model-free-design-validation");
assert.equal(validation.model_execution, false);
assert.match(validation.design_fingerprint, /^sha256:[0-9a-f]{64}$/u);
assert.equal(validation.familywise_alpha_upper_bound, 0.05);
assert.equal(validation.minimum_all_positive_discordant_clusters, 6);
assert.equal(validation.critical_candidate_wins, 15);
assert.equal(validation.critical_baseline_wins, 5);
assert.equal(validation.planned_power, 0.8042077854595496);
assert.deepEqual(validation.attainability_witness, {
  paired_delta: 1 / 6,
  confidence_interval: [1 / 30, 0.3],
  exact_p: 0.020694732666015625,
});

assert.equal(minimumAllPositiveDiscordantClusters(0.025), 6);
assert.equal(exactBinomialUpperTail(6, 6, 0.5), 0.015625);
assert.equal(exactBinomialUpperTail(2, 2, 0.5), 0.25);
assert.equal(criticalCandidateWins(20, 0.025), 15);
assert.equal(exactBinomialUpperTail(20, 15, 0.5), 0.020694732666015625);
assert.equal(exactBinomialUpperTail(20, 15, 0.8), 0.8042077854595496);
assert.deepEqual(exactEmpiricalClusterBootstrapInterval({
  familyCount: 60,
  candidateOnly: 15,
  baselineOnly: 5,
  confidenceLevel: 0.95,
}), [1 / 30, 0.3]);

const attainable = assessBenchmarkV3BaselineOpportunity(design, {
  small: 5,
  medium: 5,
  high: 5,
});
assert.equal(attainable.eligible, true);
assert.equal(attainable.total_baseline_failures, 15);
assert.deepEqual(attainable.reasons, []);
assert.equal(attainable.disposition, "candidate-execution-allowed-within-budget");

const p52SaturatedBaseline = assessBenchmarkV3BaselineOpportunity(design, {
  small: 0,
  medium: 0,
  high: 2,
});
assert.equal(p52SaturatedBaseline.eligible, false);
assert.equal(p52SaturatedBaseline.total_baseline_failures, 2);
assert.deepEqual(p52SaturatedBaseline.reasons, [
  "baseline-failures-total-below-bound",
  "baseline-failures-small-below-bound",
  "baseline-failures-medium-below-bound",
  "baseline-failures-high-below-bound",
]);
assert.equal(p52SaturatedBaseline.disposition, "design-uninformative-no-candidate-execution");

const candidateOne = {
  candidate_id: "architecture-a",
  architecture_fingerprint: `sha256:${"a".repeat(64)}`,
  registered_before_baseline: true,
  execution_count: 1,
};
const candidateTwo = {
  candidate_id: "architecture-b",
  architecture_fingerprint: `sha256:${"b".repeat(64)}`,
  registered_before_baseline: true,
  execution_count: 0,
};
assert.deepEqual(validateBenchmarkV3CandidateBudget(design, [candidateOne, candidateTwo]), {
  status: "validated",
  registered_candidates: 2,
  remaining_candidates: 0,
  total_executions: 1,
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

rejects("model execution must remain forbidden", () => validateBenchmarkV3Design(changed((copy) => {
  copy.execution_policy.model_execution = "allowed";
})));
rejects("old benchmark splits must not be reused", () => validateBenchmarkV3Design(changed((copy) => {
  copy.execution_policy.previous_split_reuse = "allowed";
})));
rejects("candidate multiplicity must fit familywise alpha", () => validateBenchmarkV3Design(changed((copy) => {
  copy.multiplicity.maximum_registered_candidates = 3;
  copy.derived.bonferroni_familywise_upper_bound = 0.075;
})));
rejects("opportunity count must support the critical win threshold", () => validateBenchmarkV3Design(changed((copy) => {
  copy.opportunity_gate.minimum_baseline_failures_total = 14;
})));
rejects("derived power must be computationally bound", () => validateBenchmarkV3Design(changed((copy) => {
  copy.derived.planned_power = 0.9;
})));
rejects("design shape must reject undeclared keys", () => validateBenchmarkV3Design(changed((copy) => {
  copy.execution_policy.prompt = "hidden adjustment";
})));
rejects("candidate count must be bounded", () => validateBenchmarkV3CandidateBudget(design, [
  candidateOne,
  candidateTwo,
  {
    candidate_id: "architecture-c",
    architecture_fingerprint: `sha256:${"c".repeat(64)}`,
    registered_before_baseline: true,
    execution_count: 0,
  },
]));
rejects("architecture fingerprints must not be reused", () => validateBenchmarkV3CandidateBudget(design, [
  candidateOne,
  { ...candidateTwo, architecture_fingerprint: candidateOne.architecture_fingerprint },
]));
rejects("late candidate registration must fail closed", () => validateBenchmarkV3CandidateBudget(design, [
  { ...candidateOne, registered_before_baseline: false },
]));
rejects("candidate reruns must fail closed", () => validateBenchmarkV3CandidateBudget(design, [
  { ...candidateOne, execution_count: 2 },
]));

console.log(JSON.stringify({
  status: "passed",
  evidence_class: "model-free-design-verification",
  model_execution: false,
  design_fingerprint: validation.design_fingerprint,
  development_family_count: design.splits.development.family_count,
  candidate_budget: design.multiplicity.maximum_registered_candidates,
  familywise_alpha_upper_bound: validation.familywise_alpha_upper_bound,
  minimum_all_positive_discordant_clusters: validation.minimum_all_positive_discordant_clusters,
  planned_power: validation.planned_power,
  p52_saturation_blocked_before_candidate: !p52SaturatedBaseline.eligible,
  negative_cases: negativeCount,
}, null, 2));
