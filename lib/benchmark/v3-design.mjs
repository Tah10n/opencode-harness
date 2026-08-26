import fs from "node:fs";
import path from "node:path";

import { ContractError, assertSafeId, canonicalJson, fingerprint } from "../feedback/contracts.mjs";

const EPSILON = 1e-12;
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;
export const BENCHMARK_V3_STRATA = Object.freeze(["small", "medium", "high"]);

function fail(code, message) { throw new ContractError(code, message); }
function expect(condition, code, message) { if (!condition) fail(code, message); }
function exact(value, keys, label) {
  expect(value && typeof value === "object" && !Array.isArray(value), "BENCHMARK_V3_DESIGN_SHAPE", `${label} must be an object`);
  expect(canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort()), "BENCHMARK_V3_DESIGN_SHAPE", `${label} keys are invalid`);
}
function integer(value, label, { min = 0, max = 1_000_000 } = {}) {
  expect(Number.isSafeInteger(value) && value >= min && value <= max, "BENCHMARK_V3_DESIGN_INTEGER", `${label} must be an integer between ${min} and ${max}`);
}
function finite(value, label, { min = -Infinity, max = Infinity } = {}) {
  expect(typeof value === "number" && Number.isFinite(value) && value >= min && value <= max, "BENCHMARK_V3_DESIGN_NUMBER", `${label} must be a finite number between ${min} and ${max}`);
}
function approximatelyEqual(left, right) { return Math.abs(left - right) <= EPSILON; }
function binomialCoefficient(n, k) {
  const selected = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= selected; index += 1) result = (result * (n - selected + index)) / index;
  return result;
}
function binomialMass(trials, successes, probability) {
  return binomialCoefficient(trials, successes) * (probability ** successes) * ((1 - probability) ** (trials - successes));
}

export function exactBinomialUpperTail(trials, successes, probability) {
  integer(trials, "trials", { min: 1, max: 1_000 });
  integer(successes, "successes", { min: 0, max: trials });
  finite(probability, "probability", { min: 0, max: 1 });
  let total = 0;
  for (let count = successes; count <= trials; count += 1) total += binomialMass(trials, count, probability);
  return total;
}

export function exactBinomialUpperConfidenceBound(trials, successes, confidenceLevel = 0.95) {
  integer(trials, "trials", { min: 1, max: 1_000 });
  integer(successes, "successes", { min: 0, max: trials });
  finite(confidenceLevel, "confidenceLevel", { min: 0.5, max: 0.999 });
  if (successes === trials) return 1;
  const alpha = 1 - confidenceLevel;
  const lowerTail = (probability) => {
    let total = 0;
    for (let count = 0; count <= successes; count += 1) total += binomialMass(trials, count, probability);
    return total;
  };
  let low = 0; let high = 1;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const middle = (low + high) / 2;
    if (lowerTail(middle) > alpha) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export function criticalCandidateWins(discordantClusters, alpha) {
  integer(discordantClusters, "discordantClusters", { min: 1, max: 1_000 });
  finite(alpha, "alpha", { min: Number.EPSILON, max: 0.5 });
  for (let wins = 0; wins <= discordantClusters; wins += 1) {
    if (exactBinomialUpperTail(discordantClusters, wins, 0.5) <= alpha + EPSILON) return wins;
  }
  return null;
}

export function minimumAllPositiveDiscordantClusters(alpha) {
  finite(alpha, "alpha", { min: Number.EPSILON, max: 0.5 });
  for (let discordant = 1; discordant <= 1_000; discordant += 1) {
    if ((2 ** -discordant) <= alpha + EPSILON) return discordant;
  }
  fail("BENCHMARK_V3_DESIGN_ATTAINABILITY", "alpha is not attainable within bounded discordant clusters");
}

export function exactConservativePairedDeltaInterval({ familyCount, candidateOnly, baselineOnly, confidenceLevel }) {
  integer(familyCount, "familyCount", { min: 1, max: 1_000 });
  integer(candidateOnly, "candidateOnly", { min: 0, max: familyCount });
  integer(baselineOnly, "baselineOnly", { min: 0, max: familyCount });
  expect(candidateOnly + baselineOnly <= familyCount, "BENCHMARK_V3_DESIGN_BOOTSTRAP", "discordant counts exceed the family count");
  finite(confidenceLevel, "confidenceLevel", { min: 0.5, max: 0.999 });
  const marginalConfidence = 1 - ((1 - confidenceLevel) / 4);
  const lower = (successes) => 1 - exactBinomialUpperConfidenceBound(familyCount, familyCount - successes, marginalConfidence);
  const upper = (successes) => exactBinomialUpperConfidenceBound(familyCount, successes, marginalConfidence);
  return Object.freeze([
    Math.max(-1, lower(candidateOnly) - upper(baselineOnly)),
    Math.min(1, upper(candidateOnly) - lower(baselineOnly)),
  ]);
}

export function assessSmallNonInferiorityAttainability({ familyCount, margin, test, confidenceLevel = 0.95 }) {
  integer(familyCount, "familyCount", { min: 1, max: 1_000 });
  finite(margin, "margin", { min: -1, max: 0 });
  const equalArmsLower = exactConservativePairedDeltaInterval({
    familyCount, candidateOnly: 0, baselineOnly: 0, confidenceLevel,
  })[0];
  const supported = test === "zero-discordance-pass-else-conservative-ci";
  return Object.freeze({ family_count: familyCount, margin, test,
    equal_arms_conservative_lower: equalArmsLower,
    equal_arms_pass: supported || equalArmsLower >= margin,
    attainable: supported || equalArmsLower >= margin });
}

export function computeBenchmarkV3PowerGate({
  familyCount, observedBaselineFailures, alpha, minimumPracticalDelta,
  preregisteredFixProbability, permittedRegressionProbability, minimumPower = 0.8,
}) {
  integer(familyCount, "familyCount", { min: 1, max: 1_000 });
  integer(observedBaselineFailures, "observedBaselineFailures", { min: 0, max: familyCount });
  finite(alpha, "alpha", { min: Number.EPSILON, max: 0.5 });
  finite(minimumPracticalDelta, "minimumPracticalDelta", { min: 0, max: 1 });
  finite(preregisteredFixProbability, "preregisteredFixProbability", { min: 0, max: 1 });
  finite(permittedRegressionProbability, "permittedRegressionProbability", { min: 0, max: 1 });
  finite(minimumPower, "minimumPower", { min: 0.5, max: 0.999 });
  const bestPossibleExactP = observedBaselineFailures === 0 ? 1 : 2 ** -observedBaselineFailures;
  const bestPossibleDelta = observedBaselineFailures / familyCount;
  let attainablePower = 0;
  for (let fixes = 0; fixes <= observedBaselineFailures; fixes += 1) {
    const fixMass = binomialMass(observedBaselineFailures, fixes, preregisteredFixProbability);
    for (let regressions = 0; regressions <= familyCount - observedBaselineFailures; regressions += 1) {
      const discordant = fixes + regressions;
      if (discordant === 0) continue;
      const exactP = exactBinomialUpperTail(discordant, fixes, 0.5);
      const delta = (fixes - regressions) / familyCount;
      if (exactP <= alpha + EPSILON && delta >= minimumPracticalDelta - EPSILON) {
        attainablePower += fixMass * binomialMass(familyCount - observedBaselineFailures, regressions, permittedRegressionProbability);
      }
    }
  }
  const criteria = Object.freeze({
    best_possible_exact_p_passed: bestPossibleExactP <= alpha + EPSILON,
    best_possible_delta_passed: bestPossibleDelta >= minimumPracticalDelta - EPSILON,
    attainable_power_passed: attainablePower >= minimumPower - EPSILON,
  });
  return Object.freeze({
    family_count: familyCount,
    observed_baseline_failures: observedBaselineFailures,
    best_possible_exact_p: bestPossibleExactP,
    best_possible_delta: bestPossibleDelta,
    attainable_power: attainablePower,
    minimum_power: minimumPower,
    criteria,
    eligible: Object.values(criteria).every(Boolean),
  });
}

function minimumFailuresForPower(parameters) {
  for (let failures = 0; failures <= parameters.familyCount; failures += 1) {
    const result = computeBenchmarkV3PowerGate({ ...parameters, observedBaselineFailures: failures });
    if (result.eligible) return Object.freeze({ failures, result });
  }
  fail("BENCHMARK_V3_DESIGN_POWER", "the preregistered alternative is unattainable for this family count");
}

function validateSplit(split, label, { familyCount, strataCount }) {
  exact(split, ["status", "family_count", "strata", "candidate_selection", "maximum_runs"], label);
  expect(split.status === "materialized-model-free" && split.family_count === familyCount && split.maximum_runs === 1, "BENCHMARK_V3_DESIGN_SPLIT", `${label} is invalid`);
  exact(split.strata, BENCHMARK_V3_STRATA, `${label}.strata`);
  for (const stratum of BENCHMARK_V3_STRATA) expect(split.strata[stratum] === strataCount, "BENCHMARK_V3_DESIGN_SPLIT", `${label}.strata.${stratum} is invalid`);
}

function validateStages(stages) {
  exact(stages, ["development", "validation", "holdout", "selection_rule"], "design.stages");
  exact(stages.development, ["minimum_registered_candidates", "maximum_registered_candidates", "current_registered_candidates", "registrations_immutable", "runs_per_candidate"], "design.stages.development");
  expect(stages.development.minimum_registered_candidates === 1
    && stages.development.maximum_registered_candidates === 1
    && stages.development.current_registered_candidates === 1
    && stages.development.registrations_immutable === true
    && stages.development.runs_per_candidate === 1, "BENCHMARK_V3_DESIGN_STAGE", "development stage semantics are invalid");
  exact(stages.validation, ["candidate_count", "runs_per_candidate", "selection"], "design.stages.validation");
  expect(stages.validation.candidate_count === 1 && stages.validation.runs_per_candidate === 1 && stages.validation.selection === "deterministic-development-winner", "BENCHMARK_V3_DESIGN_STAGE", "validation stage semantics are invalid");
  exact(stages.holdout, ["candidate_count", "runs_per_candidate", "candidate_binding"], "design.stages.holdout");
  expect(stages.holdout.candidate_count === 1 && stages.holdout.runs_per_candidate === 1 && stages.holdout.candidate_binding === "unchanged-validation-candidate", "BENCHMARK_V3_DESIGN_STAGE", "holdout stage semantics are invalid");
  expect(stages.selection_rule === "highest-development-paired-delta-then-lower-new-high-medium-upper-ci-then-lower-mean-duration-then-candidate-id", "BENCHMARK_V3_DESIGN_SELECTION", "selection rule is invalid");
}

export function validateBenchmarkV3Design(value) {
  exact(value, ["schema_version", "design_id", "status", "execution_policy", "stages", "splits", "opportunity_power_gate", "primary_inference", "estimands", "holdout_policy", "guardrails", "retry_policy", "ledger_policy", "derived"], "design");
  expect(value.schema_version === 3, "BENCHMARK_V3_DESIGN_VERSION", "schema_version must be 3");
  assertSafeId(value.design_id, "design.design_id");
  expect(value.status === "executable-model-free-gated", "BENCHMARK_V3_DESIGN_STATUS", "v3 design status is invalid");
  exact(value.execution_policy, ["scope", "model_execution", "previous_split_reuse", "candidate_binding", "candidate_visibility", "product_bundle_binding", "automatic_candidate_creation"], "design.execution_policy");
  expect(value.execution_policy.scope === "lab-only"
    && value.execution_policy.model_execution === "forbidden-until-model-free-review-gate"
    && value.execution_policy.previous_split_reuse === "forbidden"
    && value.execution_policy.candidate_binding === "frozen-before-baseline"
    && value.execution_policy.candidate_visibility === "visible-requirements-only-no-baseline-output-family-failure-or-hidden-finding"
    && value.execution_policy.product_bundle_binding === "byte-identical-materialized-core"
    && value.execution_policy.automatic_candidate_creation === "forbidden", "BENCHMARK_V3_DESIGN_EXECUTION", "execution policy is invalid");
  validateStages(value.stages);
  exact(value.splits, ["development", "validation", "holdout"], "design.splits");
  validateSplit(value.splits.development, "design.splits.development", { familyCount: 60, strataCount: 20 });
  validateSplit(value.splits.validation, "design.splits.validation", { familyCount: 60, strataCount: 20 });
  validateSplit(value.splits.holdout, "design.splits.holdout", { familyCount: 90, strataCount: 30 });
  expect(value.splits.development.candidate_selection === "one-preregistered"
    && value.splits.validation.candidate_selection === "one-deterministically-selected"
    && value.splits.holdout.candidate_selection === "same-unchanged-candidate", "BENCHMARK_V3_DESIGN_SPLIT", "split candidate selection is invalid");
  exact(value.opportunity_power_gate, ["stage", "alpha", "familywise_alpha", "alpha_allocation", "minimum_practical_delta", "preregistered_fix_probability", "permitted_regression_probability", "minimum_power", "stratum_opportunity_rule", "failure_disposition"], "design.opportunity_power_gate");
  const gate = value.opportunity_power_gate;
  expect(gate.stage === "after-baseline-before-first-candidate" && gate.stratum_opportunity_rule === "ceiling-stratum-family-count-times-minimum-practical-delta" && gate.failure_disposition === "design-uninformative-candidate-tokens-zero", "BENCHMARK_V3_DESIGN_OPPORTUNITY", "opportunity gate semantics are invalid");
  finite(gate.alpha, "gate.alpha", { min: 0.001, max: 0.05 });
  expect(gate.alpha === 0.05 && gate.familywise_alpha === 0.05
    && gate.alpha_allocation === "familywise-alpha-divided-by-registered-candidates-before-baseline",
  "BENCHMARK_V3_DESIGN_OPPORTUNITY", "candidate alpha allocation is invalid");
  finite(gate.minimum_practical_delta, "gate.minimum_practical_delta", { min: 0.01, max: 0.5 });
  finite(gate.preregistered_fix_probability, "gate.preregistered_fix_probability", { min: 0.5, max: 0.99 });
  finite(gate.permitted_regression_probability, "gate.permitted_regression_probability", { min: 0, max: 0.2 });
  finite(gate.minimum_power, "gate.minimum_power", { min: 0.8, max: 0.99 });
  const inference = value.primary_inference;
  exact(inference, ["independent_unit", "test", "confidence_method", "confidence_level", "conditional_power_witness", "actual_attainable_power"], "design.primary_inference");
  expect(inference.independent_unit === "family-cluster" && inference.test === "one-sided-exact-binomial-on-discordant-family-clusters" && inference.confidence_method === "exact-conservative-bonferroni-binomial-difference" && inference.actual_attainable_power === "computed-from-observed-baseline-opportunities-before-candidate", "BENCHMARK_V3_DESIGN_INFERENCE", "primary inference contract is invalid");
  finite(inference.confidence_level, "confidence_level", { min: 0.95, max: 0.99 });
  exact(inference.conditional_power_witness, ["discordant_clusters", "candidate_win_probability"], "conditional_power_witness");
  integer(inference.conditional_power_witness.discordant_clusters, "discordant_clusters", { min: 1, max: 60 });
  finite(inference.conditional_power_witness.candidate_win_probability, "candidate_win_probability", { min: 0.5, max: 0.99 });
  exact(value.estimands, ["representative_all_comers", "challenge_opportunity_enriched", "reporting_boundary"], "design.estimands");
  expect(value.estimands.representative_all_comers === "all-families-in-preregistered-split" && value.estimands.challenge_opportunity_enriched === "baseline-failure-opportunities-only" && value.estimands.reporting_boundary === "enriched-effect-must-not-be-labeled-repository-wide-lift", "BENCHMARK_V3_DESIGN_ESTIMAND", "estimand boundary is invalid");
  exact(value.holdout_policy, ["public_split", "confirmatory_use", "sealed_holdout_storage", "sealed_holdout_creation", "execution_source"], "design.holdout_policy");
  expect(value.holdout_policy.public_split === "permanently-development-only"
    && value.holdout_policy.confirmatory_use === "forbidden"
    && value.holdout_policy.sealed_holdout_storage === "outside-public-git"
    && value.holdout_policy.sealed_holdout_creation === "after-design-and-candidate-freeze"
    && value.holdout_policy.execution_source === "external-sealed-receipt-only",
  "BENCHMARK_V3_DESIGN_HOLDOUT", "public and sealed holdout boundaries are invalid");
  exact(value.guardrails, ["new_critical_regressions_maximum", "new_unclassified_semantic_regressions_maximum", "new_high_medium_regressions_maximum", "new_high_medium_regression_rate_upper_bound_maximum", "safety_independent_unit", "candidate_safety_comparison", "small_noninferiority_test", "small_noninferiority_sample_sizes", "small_delta_lower_ci_minimum", "timeout_delta_maximum", "median_duration_ratio_maximum", "mean_duration_ratio_maximum", "activation_minimum"], "design.guardrails");
  exact(value.guardrails.small_noninferiority_sample_sizes, ["validation", "holdout"], "design.guardrails.small_noninferiority_sample_sizes");
  expect(value.guardrails.new_critical_regressions_maximum === 0 && value.guardrails.new_unclassified_semantic_regressions_maximum === 0
    && value.guardrails.new_high_medium_regressions_maximum === 0
    && value.guardrails.new_high_medium_regression_rate_upper_bound_maximum === 0.033
    && value.guardrails.safety_independent_unit === "family-cluster"
    && value.guardrails.candidate_safety_comparison === "not-worse-than-baseline"
    && value.guardrails.small_noninferiority_test === "zero-discordance-pass-else-conservative-ci"
    && value.guardrails.small_noninferiority_sample_sizes.validation === 20
    && value.guardrails.small_noninferiority_sample_sizes.holdout === 30
    && value.guardrails.small_delta_lower_ci_minimum === -0.03
    && value.guardrails.timeout_delta_maximum === 0.02
    && value.guardrails.median_duration_ratio_maximum === 2
    && value.guardrails.mean_duration_ratio_maximum === 2.5
    && value.guardrails.activation_minimum === 0.95, "BENCHMARK_V3_DESIGN_GUARDRAIL", "guardrails are invalid");
  for (const familyCount of Object.values(value.guardrails.small_noninferiority_sample_sizes)) {
    expect(assessSmallNonInferiorityAttainability({ familyCount,
      margin: value.guardrails.small_delta_lower_ci_minimum,
      test: value.guardrails.small_noninferiority_test,
      confidenceLevel: value.primary_inference.confidence_level }).attainable,
    "BENCHMARK_V3_DESIGN_GUARDRAIL", "small non-inferiority guardrail is unattainable");
  }
  exact(value.retry_policy, ["maximum_infrastructure_retries", "eligibility", "binding", "architecture_slot_cost", "ledger_requirement"], "design.retry_policy");
  expect(value.retry_policy.maximum_infrastructure_retries === 1 && value.retry_policy.eligibility === "infrastructure-failure-before-scored-outcome-only" && value.retry_policy.binding === "same-source-corpus-seed-and-model-bindings" && value.retry_policy.architecture_slot_cost === 0 && value.retry_policy.ledger_requirement === "both-attempts-preserved", "BENCHMARK_V3_DESIGN_RETRY", "retry policy is invalid");
  exact(value.ledger_policy, ["event_types", "relabel", "reuse", "stage_order"], "design.ledger_policy");
  expect(canonicalJson(value.ledger_policy.event_types) === canonicalJson(["acceptance-probe", "infrastructure-failure-before-scoring", "development-execution", "validation-execution", "holdout-execution"]) && value.ledger_policy.relabel === "forbidden" && value.ledger_policy.reuse === "forbidden" && value.ledger_policy.stage_order === "acceptance-development-validation-holdout", "BENCHMARK_V3_DESIGN_LEDGER", "ledger policy is invalid");

  const conditional = inference.conditional_power_witness;
  const criticalWins = criticalCandidateWins(conditional.discordant_clusters, gate.alpha);
  expect(criticalWins !== null, "BENCHMARK_V3_DESIGN_POWER", "conditional witness cannot reject");
  const conditionalPower = exactBinomialUpperTail(conditional.discordant_clusters, criticalWins, conditional.candidate_win_probability);
  const conditionalBaselineWins = conditional.discordant_clusters - criticalWins;
  const conditionalDelta = (criticalWins - conditionalBaselineWins) / value.splits.development.family_count;
  const minimum = minimumFailuresForPower({ familyCount: 60, alpha: gate.alpha, minimumPracticalDelta: gate.minimum_practical_delta, preregisteredFixProbability: gate.preregistered_fix_probability, permittedRegressionProbability: gate.permitted_regression_probability, minimumPower: gate.minimum_power });
  const perStratumMinimum = Object.fromEntries(BENCHMARK_V3_STRATA.map((stratum) => [stratum, Math.ceil(value.splits.development.strata[stratum] * gate.minimum_practical_delta)]));
  exact(value.derived, ["conditional_power_witness", "minimum_baseline_failures_for_attainable_power", "minimum_baseline_failures_per_stratum", "attainable_power_at_minimum", "safety_zero_regression_upper_bounds"], "design.derived");
  exact(value.derived.safety_zero_regression_upper_bounds, ["development_60", "validation_60", "holdout_90", "minimum_149_for_two_percent", "required_maximum", "holdout_attainable"], "design.derived.safety_zero_regression_upper_bounds");
  exact(value.derived.conditional_power_witness, ["critical_candidate_wins", "critical_baseline_wins", "exact_p", "conditional_power", "paired_delta"], "derived.conditional_power_witness");
  const expectedExactP = exactBinomialUpperTail(conditional.discordant_clusters, criticalWins, 0.5);
  const safety = value.derived.safety_zero_regression_upper_bounds;
  expect(value.derived.conditional_power_witness.critical_candidate_wins === criticalWins && value.derived.conditional_power_witness.critical_baseline_wins === conditionalBaselineWins && approximatelyEqual(value.derived.conditional_power_witness.exact_p, expectedExactP) && approximatelyEqual(value.derived.conditional_power_witness.conditional_power, conditionalPower) && approximatelyEqual(value.derived.conditional_power_witness.paired_delta, conditionalDelta) && value.derived.minimum_baseline_failures_for_attainable_power === minimum.failures && canonicalJson(value.derived.minimum_baseline_failures_per_stratum) === canonicalJson(perStratumMinimum) && approximatelyEqual(value.derived.attainable_power_at_minimum, minimum.result.attainable_power)
    && approximatelyEqual(safety.development_60, exactBinomialUpperConfidenceBound(60, 0, value.primary_inference.confidence_level))
    && approximatelyEqual(safety.validation_60, exactBinomialUpperConfidenceBound(60, 0, value.primary_inference.confidence_level))
    && approximatelyEqual(safety.holdout_90, exactBinomialUpperConfidenceBound(90, 0, value.primary_inference.confidence_level))
    && approximatelyEqual(safety.minimum_149_for_two_percent, exactBinomialUpperConfidenceBound(149, 0, value.primary_inference.confidence_level))
    && safety.required_maximum === value.guardrails.new_high_medium_regression_rate_upper_bound_maximum && safety.holdout_attainable === true,
  "BENCHMARK_V3_DESIGN_DERIVED", "derived power or safety values are stale");
  return Object.freeze({ status: "validated", evidence_class: "model-free-executable-design-validation", model_execution: false, design_id: value.design_id, design_fingerprint: fingerprint(value), conditional_power: conditionalPower, minimum_baseline_failures_for_attainable_power: minimum.failures, attainable_power_at_minimum: minimum.result.attainable_power, minimum_baseline_failures_per_stratum: Object.freeze(perStratumMinimum) });
}

export function loadBenchmarkV3Design(sourceRoot) {
  const designPath = path.join(sourceRoot, "benchmarks", "v3", "design.v1.json");
  const value = JSON.parse(fs.readFileSync(designPath, "utf8"));
  return Object.freeze({ path: designPath, value, validation: validateBenchmarkV3Design(value) });
}

export function assessBenchmarkV3BaselineOpportunity(design, failuresByStratum, registeredCandidates = design.stages.development.current_registered_candidates) {
  const validation = validateBenchmarkV3Design(design);
  integer(registeredCandidates, "registeredCandidates", { min: design.stages.development.minimum_registered_candidates, max: design.stages.development.maximum_registered_candidates });
  exact(failuresByStratum, BENCHMARK_V3_STRATA, "failuresByStratum");
  let total = 0;
  const reasons = [];
  for (const stratum of BENCHMARK_V3_STRATA) {
    integer(failuresByStratum[stratum], `failuresByStratum.${stratum}`, { min: 0, max: design.splits.development.strata[stratum] });
    total += failuresByStratum[stratum];
    if (failuresByStratum[stratum] < validation.minimum_baseline_failures_per_stratum[stratum]) reasons.push(`opportunity-minimum-${stratum}-not-met`);
  }
  const perCandidateAlpha = design.opportunity_power_gate.familywise_alpha / registeredCandidates;
  const gate = computeBenchmarkV3PowerGate({ familyCount: 60, observedBaselineFailures: total, alpha: perCandidateAlpha, minimumPracticalDelta: design.opportunity_power_gate.minimum_practical_delta, preregisteredFixProbability: design.opportunity_power_gate.preregistered_fix_probability, permittedRegressionProbability: design.opportunity_power_gate.permitted_regression_probability, minimumPower: design.opportunity_power_gate.minimum_power });
  if (!gate.criteria.best_possible_exact_p_passed) reasons.push("best-possible-exact-p-failed");
  if (!gate.criteria.best_possible_delta_passed) reasons.push("best-possible-delta-failed");
  if (!gate.criteria.attainable_power_passed) reasons.push("actual-attainable-power-failed");
  return Object.freeze({ eligible: reasons.length === 0, candidate_tokens: 0, registered_candidates: registeredCandidates,
    per_candidate_alpha: perCandidateAlpha, familywise_alpha: design.opportunity_power_gate.familywise_alpha,
    total_baseline_failures: total, failures_by_stratum: Object.freeze({ ...failuresByStratum }), power_gate: gate,
    reasons: Object.freeze(reasons), disposition: reasons.length === 0 ? "candidate-execution-allowed" : design.opportunity_power_gate.failure_disposition });
}

export function validateBenchmarkV3CandidateBudget(design, registrations) {
  validateBenchmarkV3Design(design);
  expect(Array.isArray(registrations)
    && registrations.length >= design.stages.development.minimum_registered_candidates
    && registrations.length <= design.stages.development.maximum_registered_candidates,
    "BENCHMARK_V3_CANDIDATE_BUDGET", "candidate registrations exceed the frozen budget");
  const ids = new Set();
  const architectures = new Set();
  for (const [index, registration] of registrations.entries()) {
    exact(registration, ["candidate_id", "architecture_fingerprint", "product_bundle_fingerprint", "source_sha", "registered_before_baseline", "development_execution_count"], `registrations[${index}]`);
    assertSafeId(registration.candidate_id, `registrations[${index}].candidate_id`);
    expect(FINGERPRINT.test(registration.architecture_fingerprint) && FINGERPRINT.test(registration.product_bundle_fingerprint) && /^[0-9a-f]{40}$/u.test(registration.source_sha) && registration.registered_before_baseline === true, "BENCHMARK_V3_CANDIDATE_BUDGET", "candidate binding is invalid");
    integer(registration.development_execution_count, "development_execution_count", { min: 0, max: 1 });
    expect(!ids.has(registration.candidate_id) && !architectures.has(registration.architecture_fingerprint), "BENCHMARK_V3_CANDIDATE_BUDGET", "candidate relabel or architecture reuse is forbidden");
    ids.add(registration.candidate_id);
    architectures.add(registration.architecture_fingerprint);
  }
  const perCandidateAlpha = design.opportunity_power_gate.familywise_alpha / registrations.length;
  return Object.freeze({ status: "validated", registered_candidates: registrations.length,
    remaining_candidates: design.stages.development.maximum_registered_candidates - registrations.length,
    per_candidate_alpha: perCandidateAlpha, familywise_alpha: design.opportunity_power_gate.familywise_alpha,
    registrations_immutable: true,
    development_executions: registrations.reduce((sum, entry) => sum + entry.development_execution_count, 0) });
}
