import fs from "node:fs";
import path from "node:path";

import {
  ContractError,
  assertSafeId,
  canonicalJson,
  fingerprint,
} from "../feedback/contracts.mjs";

const EPSILON = 1e-12;
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;
const STRATA = Object.freeze(["small", "medium", "high"]);

function fail(code, message) {
  throw new ContractError(code, message);
}

function expect(condition, code, message) {
  if (!condition) fail(code, message);
}

function exact(value, keys, label) {
  expect(
    value && typeof value === "object" && !Array.isArray(value),
    "BENCHMARK_V3_DESIGN_SHAPE",
    `${label} must be an object`,
  );
  expect(
    canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort()),
    "BENCHMARK_V3_DESIGN_SHAPE",
    `${label} keys are invalid`,
  );
}

function integer(value, label, { min = 0, max = 1_000_000 } = {}) {
  expect(
    Number.isSafeInteger(value) && value >= min && value <= max,
    "BENCHMARK_V3_DESIGN_INTEGER",
    `${label} must be an integer between ${min} and ${max}`,
  );
}

function finite(value, label, { min = -Infinity, max = Infinity } = {}) {
  expect(
    typeof value === "number" && Number.isFinite(value) && value >= min && value <= max,
    "BENCHMARK_V3_DESIGN_NUMBER",
    `${label} must be a finite number between ${min} and ${max}`,
  );
}

function approximatelyEqual(left, right) {
  return Math.abs(left - right) <= EPSILON;
}

function binomialCoefficient(n, k) {
  const selected = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= selected; index += 1) {
    result = (result * (n - selected + index)) / index;
  }
  return result;
}

export function exactBinomialUpperTail(trials, successes, probability) {
  integer(trials, "trials", { min: 1, max: 1_000 });
  integer(successes, "successes", { min: 0, max: trials });
  finite(probability, "probability", { min: 0, max: 1 });
  let total = 0;
  for (let count = successes; count <= trials; count += 1) {
    total += binomialCoefficient(trials, count)
      * (probability ** count)
      * ((1 - probability) ** (trials - count));
  }
  return total;
}

export function criticalCandidateWins(discordantClusters, alpha) {
  integer(discordantClusters, "discordantClusters", { min: 1, max: 1_000 });
  finite(alpha, "alpha", { min: Number.EPSILON, max: 0.5 });
  for (let wins = 0; wins <= discordantClusters; wins += 1) {
    if (exactBinomialUpperTail(discordantClusters, wins, 0.5) <= alpha + EPSILON) {
      return wins;
    }
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

function distributionQuantile(distribution, probability) {
  let cumulative = 0;
  for (const [sum, mass] of [...distribution.entries()].sort(([left], [right]) => left - right)) {
    cumulative += mass;
    if (cumulative + EPSILON >= probability) return sum;
  }
  return Math.max(...distribution.keys());
}

export function exactEmpiricalClusterBootstrapInterval({
  familyCount,
  candidateOnly,
  baselineOnly,
  confidenceLevel,
}) {
  integer(familyCount, "familyCount", { min: 1, max: 1_000 });
  integer(candidateOnly, "candidateOnly", { min: 0, max: familyCount });
  integer(baselineOnly, "baselineOnly", { min: 0, max: familyCount });
  expect(
    candidateOnly + baselineOnly <= familyCount,
    "BENCHMARK_V3_DESIGN_BOOTSTRAP",
    "discordant counts exceed the family count",
  );
  finite(confidenceLevel, "confidenceLevel", { min: 0.5, max: 0.999 });

  const probabilities = Object.freeze([
    Object.freeze([-1, baselineOnly / familyCount]),
    Object.freeze([0, (familyCount - candidateOnly - baselineOnly) / familyCount]),
    Object.freeze([1, candidateOnly / familyCount]),
  ]);
  let distribution = new Map([[0, 1]]);
  for (let draw = 0; draw < familyCount; draw += 1) {
    const next = new Map();
    for (const [sum, mass] of distribution) {
      for (const [difference, probability] of probabilities) {
        if (probability === 0) continue;
        const nextSum = sum + difference;
        next.set(nextSum, (next.get(nextSum) ?? 0) + (mass * probability));
      }
    }
    distribution = next;
  }
  const tail = (1 - confidenceLevel) / 2;
  return Object.freeze([
    distributionQuantile(distribution, tail) / familyCount,
    distributionQuantile(distribution, 1 - tail) / familyCount,
  ]);
}

function validateSplit(split, label, {
  expectedStatus,
  expectedCandidateSelection,
}) {
  exact(split, [
    "status",
    "family_count",
    "strata",
    "candidate_selection",
    "maximum_uses_per_candidate",
  ], label);
  expect(split.status === expectedStatus, "BENCHMARK_V3_DESIGN_SPLIT", `${label}.status is invalid`);
  expect(
    split.candidate_selection === expectedCandidateSelection,
    "BENCHMARK_V3_DESIGN_SPLIT",
    `${label}.candidate_selection is invalid`,
  );
  integer(split.family_count, `${label}.family_count`, { min: 30, max: 1_000 });
  exact(split.strata, STRATA, `${label}.strata`);
  for (const stratum of STRATA) integer(split.strata[stratum], `${label}.strata.${stratum}`, { min: 8, max: 1_000 });
  expect(
    STRATA.reduce((sum, stratum) => sum + split.strata[stratum], 0) === split.family_count,
    "BENCHMARK_V3_DESIGN_SPLIT",
    `${label} stratum counts must sum to family_count`,
  );
  expect(
    split.maximum_uses_per_candidate === 1,
    "BENCHMARK_V3_DESIGN_SPLIT",
    `${label} must permit at most one use per candidate`,
  );
}

export function validateBenchmarkV3Design(value) {
  exact(value, [
    "schema_version",
    "design_id",
    "status",
    "execution_policy",
    "multiplicity",
    "splits",
    "opportunity_gate",
    "primary_inference",
    "guardrails",
    "derived",
  ], "design");
  expect(value.schema_version === 1, "BENCHMARK_V3_DESIGN_VERSION", "schema_version must be 1");
  assertSafeId(value.design_id, "design.design_id");
  expect(
    value.status === "model-free-design-only",
    "BENCHMARK_V3_DESIGN_STATUS",
    "v3 must remain design-only until a fresh corpus and runner are separately frozen",
  );

  const execution = value.execution_policy;
  exact(execution, [
    "scope",
    "model_execution",
    "profile_changes",
    "previous_split_reuse",
    "candidate_binding",
    "candidate_visibility",
  ], "design.execution_policy");
  expect(execution.scope === "lab-only", "BENCHMARK_V3_DESIGN_EXECUTION", "v3 design must stay lab-only");
  expect(execution.model_execution === "forbidden", "BENCHMARK_V3_DESIGN_EXECUTION", "model execution must remain forbidden");
  expect(execution.profile_changes === "forbidden", "BENCHMARK_V3_DESIGN_EXECUTION", "profile changes must remain outside design work");
  expect(execution.previous_split_reuse === "forbidden", "BENCHMARK_V3_DESIGN_EXECUTION", "v2 splits must not be reused");
  expect(execution.candidate_binding === "frozen-before-baseline", "BENCHMARK_V3_DESIGN_EXECUTION", "candidate binding must precede baseline execution");
  expect(
    execution.candidate_visibility === "aggregate-opportunity-counts-hidden-from-candidate",
    "BENCHMARK_V3_DESIGN_EXECUTION",
    "candidate execution must not receive baseline outcomes or identities",
  );

  const multiplicity = value.multiplicity;
  exact(multiplicity, [
    "familywise_alpha",
    "per_candidate_alpha",
    "maximum_registered_candidates",
    "maximum_executions_per_candidate",
    "architecture_fingerprint_reuse",
    "failed_candidate_rerun",
  ], "design.multiplicity");
  finite(multiplicity.familywise_alpha, "design.multiplicity.familywise_alpha", { min: 0.001, max: 0.05 });
  finite(multiplicity.per_candidate_alpha, "design.multiplicity.per_candidate_alpha", { min: 0.001, max: 0.05 });
  integer(multiplicity.maximum_registered_candidates, "design.multiplicity.maximum_registered_candidates", { min: 1, max: 3 });
  expect(multiplicity.maximum_executions_per_candidate === 1, "BENCHMARK_V3_DESIGN_MULTIPLICITY", "candidate reruns are forbidden");
  expect(multiplicity.architecture_fingerprint_reuse === "forbidden", "BENCHMARK_V3_DESIGN_MULTIPLICITY", "architecture fingerprints must be unique");
  expect(multiplicity.failed_candidate_rerun === "forbidden", "BENCHMARK_V3_DESIGN_MULTIPLICITY", "failed candidates must not be rerun");
  const familywiseUpperBound = multiplicity.per_candidate_alpha * multiplicity.maximum_registered_candidates;
  expect(
    familywiseUpperBound <= multiplicity.familywise_alpha + EPSILON,
    "BENCHMARK_V3_DESIGN_MULTIPLICITY",
    "candidate budget exceeds the familywise alpha bound",
  );

  exact(value.splits, ["development", "validation", "holdout"], "design.splits");
  validateSplit(value.splits.development, "design.splits.development", {
    expectedStatus: "design-only-unmaterialized",
    expectedCandidateSelection: "allowed-within-budget",
  });
  validateSplit(value.splits.validation, "design.splits.validation", {
    expectedStatus: "sealed-unmaterialized",
    expectedCandidateSelection: "forbidden",
  });
  validateSplit(value.splits.holdout, "design.splits.holdout", {
    expectedStatus: "sealed-unmaterialized",
    expectedCandidateSelection: "forbidden",
  });
  expect(
    value.splits.validation.family_count >= value.splits.development.family_count
      && value.splits.holdout.family_count >= value.splits.validation.family_count,
    "BENCHMARK_V3_DESIGN_SPLIT",
    "sealed confirmatory splits must not be smaller than development",
  );

  const opportunity = value.opportunity_gate;
  exact(opportunity, [
    "stage",
    "minimum_baseline_failures_total",
    "minimum_baseline_failures_per_stratum",
    "failure_disposition",
  ], "design.opportunity_gate");
  expect(opportunity.stage === "after-baseline-before-candidate", "BENCHMARK_V3_DESIGN_OPPORTUNITY", "opportunity gate stage is invalid");
  expect(
    opportunity.failure_disposition === "design-uninformative-no-candidate-execution",
    "BENCHMARK_V3_DESIGN_OPPORTUNITY",
    "an unattainable baseline must stop before candidate execution",
  );
  integer(opportunity.minimum_baseline_failures_total, "design.opportunity_gate.minimum_baseline_failures_total", { min: 1, max: value.splits.development.family_count });
  exact(opportunity.minimum_baseline_failures_per_stratum, STRATA, "design.opportunity_gate.minimum_baseline_failures_per_stratum");
  for (const stratum of STRATA) {
    integer(
      opportunity.minimum_baseline_failures_per_stratum[stratum],
      `design.opportunity_gate.minimum_baseline_failures_per_stratum.${stratum}`,
      { min: 1, max: value.splits.development.strata[stratum] },
    );
  }

  const inference = value.primary_inference;
  exact(inference, [
    "independent_unit",
    "test",
    "confidence_method",
    "confidence_level",
    "minimum_practical_delta",
    "planned_discordant_clusters",
    "alternative_candidate_win_probability",
    "planned_power_minimum",
  ], "design.primary_inference");
  expect(inference.independent_unit === "family-cluster", "BENCHMARK_V3_DESIGN_INFERENCE", "family cluster must remain the independent unit");
  expect(inference.test === "one-sided-exact-binomial-on-discordant-family-clusters", "BENCHMARK_V3_DESIGN_INFERENCE", "primary exact test is invalid");
  expect(inference.confidence_method === "exact-empirical-cluster-bootstrap", "BENCHMARK_V3_DESIGN_INFERENCE", "confidence method is invalid");
  finite(inference.confidence_level, "design.primary_inference.confidence_level", { min: 0.95, max: 0.99 });
  finite(inference.minimum_practical_delta, "design.primary_inference.minimum_practical_delta", { min: 0.1, max: 0.5 });
  integer(inference.planned_discordant_clusters, "design.primary_inference.planned_discordant_clusters", { min: 6, max: value.splits.development.family_count });
  finite(inference.alternative_candidate_win_probability, "design.primary_inference.alternative_candidate_win_probability", { min: 0.6, max: 0.95 });
  finite(inference.planned_power_minimum, "design.primary_inference.planned_power_minimum", { min: 0.8, max: 0.99 });

  exact(value.guardrails, [
    "introduced_critical_regressions_maximum",
    "introduced_high_medium_regressions_maximum",
    "safety_failure_delta_maximum",
    "small_stratum_delta_minimum",
    "timeout_delta_maximum",
    "median_duration_ratio_maximum",
    "mean_duration_ratio_maximum",
  ], "design.guardrails");
  expect(value.guardrails.introduced_critical_regressions_maximum === 0, "BENCHMARK_V3_DESIGN_GUARDRAIL", "critical regressions must remain forbidden");
  expect(value.guardrails.introduced_high_medium_regressions_maximum === 0, "BENCHMARK_V3_DESIGN_GUARDRAIL", "high and medium regressions must remain forbidden");
  expect(value.guardrails.safety_failure_delta_maximum === 0, "BENCHMARK_V3_DESIGN_GUARDRAIL", "safety harm must remain forbidden");
  expect(value.guardrails.small_stratum_delta_minimum === 0, "BENCHMARK_V3_DESIGN_GUARDRAIL", "small-stratum harm must remain forbidden");
  expect(value.guardrails.timeout_delta_maximum === 0, "BENCHMARK_V3_DESIGN_GUARDRAIL", "timeout harm must remain forbidden");
  finite(value.guardrails.median_duration_ratio_maximum, "design.guardrails.median_duration_ratio_maximum", { min: 1, max: 1.25 });
  finite(value.guardrails.mean_duration_ratio_maximum, "design.guardrails.mean_duration_ratio_maximum", { min: 1, max: 1.5 });

  const criticalWins = criticalCandidateWins(
    inference.planned_discordant_clusters,
    multiplicity.per_candidate_alpha,
  );
  expect(criticalWins !== null, "BENCHMARK_V3_DESIGN_POWER", "planned exact test cannot reject");
  const criticalBaselineWins = inference.planned_discordant_clusters - criticalWins;
  const criticalP = exactBinomialUpperTail(inference.planned_discordant_clusters, criticalWins, 0.5);
  const plannedPower = exactBinomialUpperTail(
    inference.planned_discordant_clusters,
    criticalWins,
    inference.alternative_candidate_win_probability,
  );
  const minimumDiscordant = minimumAllPositiveDiscordantClusters(multiplicity.per_candidate_alpha);
  const minimumExactP = 2 ** -minimumDiscordant;
  const witnessCandidateOnly = criticalWins;
  const witnessBaselineOnly = criticalBaselineWins;
  const witnessConcordant = value.splits.development.family_count - inference.planned_discordant_clusters;
  const witnessDelta = (witnessCandidateOnly - witnessBaselineOnly) / value.splits.development.family_count;
  const witnessInterval = exactEmpiricalClusterBootstrapInterval({
    familyCount: value.splits.development.family_count,
    candidateOnly: witnessCandidateOnly,
    baselineOnly: witnessBaselineOnly,
    confidenceLevel: inference.confidence_level,
  });

  expect(plannedPower >= inference.planned_power_minimum - EPSILON, "BENCHMARK_V3_DESIGN_POWER", "planned exact-test power is insufficient");
  expect(witnessDelta >= inference.minimum_practical_delta - EPSILON, "BENCHMARK_V3_DESIGN_ATTAINABILITY", "attainability witness misses the practical effect floor");
  expect(witnessInterval[0] > 0, "BENCHMARK_V3_DESIGN_ATTAINABILITY", "attainability witness lacks a positive confidence interval");
  expect(
    opportunity.minimum_baseline_failures_total >= witnessCandidateOnly,
    "BENCHMARK_V3_DESIGN_OPPORTUNITY",
    "baseline opportunity gate cannot support the planned candidate-win threshold",
  );

  const derived = value.derived;
  exact(derived, [
    "bonferroni_familywise_upper_bound",
    "minimum_all_positive_discordant_clusters",
    "minimum_all_positive_exact_p",
    "critical_candidate_wins",
    "critical_baseline_wins",
    "critical_exact_p",
    "planned_power",
    "attainability_witness",
  ], "design.derived");
  exact(derived.attainability_witness, [
    "candidate_only",
    "baseline_only",
    "concordant",
    "paired_delta",
    "bootstrap_confidence_interval",
  ], "design.derived.attainability_witness");
  expect(Array.isArray(derived.attainability_witness.bootstrap_confidence_interval)
    && derived.attainability_witness.bootstrap_confidence_interval.length === 2,
  "BENCHMARK_V3_DESIGN_ATTAINABILITY", "bootstrap confidence interval must contain two bounds");
  const derivedChecks = [
    [derived.bonferroni_familywise_upper_bound, familywiseUpperBound, "bonferroni_familywise_upper_bound"],
    [derived.minimum_all_positive_exact_p, minimumExactP, "minimum_all_positive_exact_p"],
    [derived.critical_exact_p, criticalP, "critical_exact_p"],
    [derived.planned_power, plannedPower, "planned_power"],
    [derived.attainability_witness.paired_delta, witnessDelta, "attainability_witness.paired_delta"],
    [derived.attainability_witness.bootstrap_confidence_interval[0], witnessInterval[0], "attainability_witness.bootstrap_confidence_interval[0]"],
    [derived.attainability_witness.bootstrap_confidence_interval[1], witnessInterval[1], "attainability_witness.bootstrap_confidence_interval[1]"],
  ];
  for (const [actual, expected, label] of derivedChecks) {
    finite(actual, `design.derived.${label}`);
    expect(approximatelyEqual(actual, expected), "BENCHMARK_V3_DESIGN_DERIVED", `${label} does not match the computed value`);
  }
  const integerDerivedChecks = [
    [derived.minimum_all_positive_discordant_clusters, minimumDiscordant, "minimum_all_positive_discordant_clusters"],
    [derived.critical_candidate_wins, criticalWins, "critical_candidate_wins"],
    [derived.critical_baseline_wins, criticalBaselineWins, "critical_baseline_wins"],
    [derived.attainability_witness.candidate_only, witnessCandidateOnly, "attainability_witness.candidate_only"],
    [derived.attainability_witness.baseline_only, witnessBaselineOnly, "attainability_witness.baseline_only"],
    [derived.attainability_witness.concordant, witnessConcordant, "attainability_witness.concordant"],
  ];
  for (const [actual, expected, label] of integerDerivedChecks) {
    expect(actual === expected, "BENCHMARK_V3_DESIGN_DERIVED", `${label} does not match the computed value`);
  }

  return Object.freeze({
    status: "validated",
    evidence_class: "model-free-design-validation",
    model_execution: false,
    design_id: value.design_id,
    design_fingerprint: fingerprint(value),
    familywise_alpha_upper_bound: familywiseUpperBound,
    minimum_all_positive_discordant_clusters: minimumDiscordant,
    critical_candidate_wins: criticalWins,
    critical_baseline_wins: criticalBaselineWins,
    planned_power: plannedPower,
    attainability_witness: Object.freeze({
      paired_delta: witnessDelta,
      confidence_interval: witnessInterval,
      exact_p: criticalP,
    }),
  });
}

export function loadBenchmarkV3Design(sourceRoot) {
  const designPath = path.join(sourceRoot, "benchmarks", "v3", "design.v1.json");
  const value = JSON.parse(fs.readFileSync(designPath, "utf8"));
  return Object.freeze({
    path: designPath,
    value,
    validation: validateBenchmarkV3Design(value),
  });
}

export function assessBenchmarkV3BaselineOpportunity(design, failuresByStratum) {
  validateBenchmarkV3Design(design);
  exact(failuresByStratum, STRATA, "failuresByStratum");
  const reasons = [];
  let total = 0;
  for (const stratum of STRATA) {
    integer(failuresByStratum[stratum], `failuresByStratum.${stratum}`, {
      min: 0,
      max: design.splits.development.strata[stratum],
    });
    total += failuresByStratum[stratum];
  }
  if (total < design.opportunity_gate.minimum_baseline_failures_total) {
    reasons.push("baseline-failures-total-below-bound");
  }
  for (const stratum of STRATA) {
    if (failuresByStratum[stratum] < design.opportunity_gate.minimum_baseline_failures_per_stratum[stratum]) {
      reasons.push(`baseline-failures-${stratum}-below-bound`);
    }
  }
  return Object.freeze({
    eligible: reasons.length === 0,
    total_baseline_failures: total,
    failures_by_stratum: Object.freeze({ ...failuresByStratum }),
    reasons: Object.freeze(reasons),
    disposition: reasons.length === 0
      ? "candidate-execution-allowed-within-budget"
      : design.opportunity_gate.failure_disposition,
  });
}

export function validateBenchmarkV3CandidateBudget(design, registrations) {
  validateBenchmarkV3Design(design);
  expect(Array.isArray(registrations), "BENCHMARK_V3_CANDIDATE_BUDGET", "registrations must be an array");
  expect(
    registrations.length <= design.multiplicity.maximum_registered_candidates,
    "BENCHMARK_V3_CANDIDATE_BUDGET",
    "candidate registrations exceed the frozen budget",
  );
  const candidateIds = new Set();
  const architectureFingerprints = new Set();
  for (const [index, registration] of registrations.entries()) {
    exact(registration, [
      "candidate_id",
      "architecture_fingerprint",
      "registered_before_baseline",
      "execution_count",
    ], `registrations[${index}]`);
    assertSafeId(registration.candidate_id, `registrations[${index}].candidate_id`);
    expect(
      typeof registration.architecture_fingerprint === "string"
        && FINGERPRINT.test(registration.architecture_fingerprint),
      "BENCHMARK_V3_CANDIDATE_BUDGET",
      `registrations[${index}].architecture_fingerprint must be a sha256 fingerprint`,
    );
    expect(registration.registered_before_baseline === true, "BENCHMARK_V3_CANDIDATE_BUDGET", "candidates must be registered before baseline execution");
    integer(registration.execution_count, `registrations[${index}].execution_count`, {
      min: 0,
      max: design.multiplicity.maximum_executions_per_candidate,
    });
    expect(!candidateIds.has(registration.candidate_id), "BENCHMARK_V3_CANDIDATE_BUDGET", "candidate IDs must be unique");
    expect(!architectureFingerprints.has(registration.architecture_fingerprint), "BENCHMARK_V3_CANDIDATE_BUDGET", "architecture fingerprints must be unique");
    candidateIds.add(registration.candidate_id);
    architectureFingerprints.add(registration.architecture_fingerprint);
  }
  return Object.freeze({
    status: "validated",
    registered_candidates: registrations.length,
    remaining_candidates: design.multiplicity.maximum_registered_candidates - registrations.length,
    total_executions: registrations.reduce((sum, entry) => sum + entry.execution_count, 0),
  });
}
