import assert from "node:assert/strict";
import fs from "node:fs";

import {
  CONTEXT_ACCEPTANCE_HARD_GATE_KEYS,
  CONTEXT_ACCEPTANCE_METRIC_KEYS,
  QUALITY_ACCEPTANCE_PRODUCERS,
  QUALITY_VIOLATION_KEYS,
  createQualityAcceptancePolicy,
  createQualityAcceptancePolicyV3,
  evaluateContextAcceptanceHardGates,
  qualityOutcomesFingerprint,
  validateContextAcceptanceHardGates,
  validateContextAcceptanceMetrics,
  validateQualityAcceptancePolicy,
  validateQualityOutcomes,
} from "../lib/quality/acceptance-contracts.mjs";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function withoutEnvelope(value) {
  const copy = structuredClone(value);
  delete copy.schema_version;
  delete copy.fingerprint;
  return copy;
}

function nestedKeys(value) {
  if (Array.isArray(value)) return value.flatMap(nestedKeys);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, entry]) => [key, ...nestedKeys(entry)]);
}

function allPassed(gates) {
  return CONTEXT_ACCEPTANCE_HARD_GATE_KEYS.every((key) => gates[key]);
}

function highMetrics() {
  return {
    risk_class: "high",
    context_sufficiency_before_mutation: true,
    high_critical_context_report_present: true,
    required_wide_category_count: 14,
    covered_wide_category_count: 14,
    required_wide_category_coverage_basis_points: 10_000,
    critical_path_count: 2,
    deep_analyzed_critical_path_count: 2,
    critical_path_deep_analysis_coverage_basis_points: 10_000,
    blocking_unknown_count: 0,
    required_transitive_path_count: 2,
    represented_transitive_path_count: 2,
    reasoned_exclusion_count: 1,
    exclusions_evidenced: true,
    context_tool_call_count: 6,
    unique_path_count: 5,
    duplicate_read_count: 1,
    duplicate_read_rate_basis_points: 1_666,
    truncation_count: 1,
    unresolved_truncation_count: 0,
    semantic_tool_availability: "unavailable_fallback",
    required_verification_mapping_count: 2,
    covered_verification_mapping_count: 2,
    edge_failure_verification_coverage_basis_points: 10_000,
    hidden_defect_escape_count: 0,
    architecture_regression_count: 0,
    unrelated_patch_path_count: 0,
    final_reconciliation_present: true,
    standard_lite_over_analysis_count: 0,
  };
}

function standardLiteMetrics() {
  return {
    risk_class: "standard-lite",
    context_sufficiency_before_mutation: true,
    high_critical_context_report_present: false,
    required_wide_category_count: 0,
    covered_wide_category_count: 0,
    required_wide_category_coverage_basis_points: null,
    critical_path_count: 0,
    deep_analyzed_critical_path_count: 0,
    critical_path_deep_analysis_coverage_basis_points: null,
    blocking_unknown_count: 0,
    required_transitive_path_count: 0,
    represented_transitive_path_count: 0,
    reasoned_exclusion_count: 0,
    exclusions_evidenced: true,
    context_tool_call_count: 3,
    unique_path_count: 2,
    duplicate_read_count: 0,
    duplicate_read_rate_basis_points: 0,
    truncation_count: 0,
    unresolved_truncation_count: 0,
    semantic_tool_availability: "not_required",
    required_verification_mapping_count: 0,
    covered_verification_mapping_count: 0,
    edge_failure_verification_coverage_basis_points: null,
    hidden_defect_escape_count: 0,
    architecture_regression_count: 0,
    unrelated_patch_path_count: 0,
    final_reconciliation_present: true,
    standard_lite_over_analysis_count: 0,
  };
}

function expectRejectedMetric(label, base, changes, gateId) {
  const metrics = { ...base, ...changes };
  validateContextAcceptanceMetrics(metrics);
  const gates = evaluateContextAcceptanceHardGates(metrics);
  assert.equal(gates[gateId], false, `${label} did not fail ${gateId}`);
  assert.equal(allPassed(gates), false, `${label} produced a false-green context assessment`);
}

const v2 = readJson("quality/acceptance/acceptance-policy.v2.json");
const v3 = readJson("quality/acceptance/acceptance-policy.v3.json");
const contextCatalog = readJson("quality/context-live-scenarios.v1.json");

validateQualityAcceptancePolicy(v2);
validateQualityAcceptancePolicy(v3);
assert.deepEqual(createQualityAcceptancePolicy(withoutEnvelope(v2)), v2, "v2 policy round-trip changed");
assert.deepEqual(createQualityAcceptancePolicyV3(withoutEnvelope(v3)), v3, "v3 policy round-trip changed");
for (const scenarioId of v2.required_scenarios) {
  assert(v3.required_scenarios.includes(scenarioId), `v3 dropped the Milestone 2 scenario ${scenarioId}`);
}
for (const scenario of contextCatalog.scenarios) {
  assert(v3.required_scenarios.includes(scenario.scenario_id), `v3 omitted context scenario ${scenario.scenario_id}`);
  assert.equal(
    v3.required_scenario_risks[scenario.scenario_id],
    scenario.risk_class,
    `v3 risk drifted for ${scenario.scenario_id}`,
  );
}
assert.equal(
  nestedKeys(v3).some((key) => /score/iu.test(key)),
  false,
  "v3 policy introduced a forbidden scalar score",
);
assert.deepEqual(
  v3.context_requirements.required_metric_keys,
  [...CONTEXT_ACCEPTANCE_METRIC_KEYS].sort(),
  "v3 policy does not require the complete multidimensional metric surface",
);
assert.deepEqual(
  v3.context_requirements.required_hard_gates,
  [...CONTEXT_ACCEPTANCE_HARD_GATE_KEYS].sort(),
  "v3 policy does not require every context hard gate",
);

const happyHigh = highMetrics();
validateContextAcceptanceMetrics(happyHigh);
const happyHighGates = evaluateContextAcceptanceHardGates(happyHigh);
assert(allPassed(happyHighGates), "complete high wide/deep evidence did not pass");

const stableFingerprint = `sha256:${"a".repeat(64)}`;
const v2OutcomeSource = {
  schema_version: 2,
  producer_id: QUALITY_ACCEPTANCE_PRODUCERS.qualityOutcomes,
  run_id: "run-v2-compatibility",
  scenario_id: "quality-small-local-control",
  profile_role: "candidate",
  dossier_id: "dossier-v2-compatibility",
  dossier_fingerprint: stableFingerprint,
  gate_fingerprint: stableFingerprint,
  check_catalog_fingerprint: stableFingerprint,
  quality_attestation_fingerprint: stableFingerprint,
  quality_bundle_manifest_fingerprint: stableFingerprint,
  integrated_verification_evidence_fingerprint: stableFingerprint,
  required_check_ids: ["visible-check"],
  required_mechanism_ids: ["hidden-check"],
  passed_check_ids: ["visible-check"],
  passed_mechanism_ids: ["hidden-check"],
  missing_check_ids: [],
  missing_mechanism_ids: [],
  complete: true,
  violations: Object.fromEntries(QUALITY_VIOLATION_KEYS.map((key) => [key, 0])),
  model_metadata: null,
};
const v2Outcome = {
  ...v2OutcomeSource,
  fingerprint: qualityOutcomesFingerprint(v2OutcomeSource),
};
validateQualityOutcomes(v2Outcome);
const v3OutcomeSource = {
  ...v2OutcomeSource,
  schema_version: 3,
  producer_id: QUALITY_ACCEPTANCE_PRODUCERS.contextQualityOutcomes,
  context_metrics: happyHigh,
  context_hard_gates: happyHighGates,
};
const v3Outcome = {
  ...v3OutcomeSource,
  fingerprint: qualityOutcomesFingerprint(v3OutcomeSource),
};
validateQualityOutcomes(v3Outcome);
const failedHiddenMetrics = { ...happyHigh, hidden_defect_escape_count: 1 };
const falseGreenV3Source = {
  ...v3OutcomeSource,
  context_metrics: failedHiddenMetrics,
  context_hard_gates: evaluateContextAcceptanceHardGates(failedHiddenMetrics),
};
const falseGreenV3 = {
  ...falseGreenV3Source,
  fingerprint: qualityOutcomesFingerprint(falseGreenV3Source),
};
assert.throws(
  () => validateQualityOutcomes(falseGreenV3),
  /QUALITY_ACCEPTANCE_OUTCOME_COMPLETENESS/u,
  "v3 outcome claimed complete while a context hard gate failed",
);
assert.equal(
  happyHighGates.truncations_resolved,
  true,
  "a resolved truncation should remain visible without failing acceptance",
);
assert.equal(
  allPassed(evaluateContextAcceptanceHardGates({ ...happyHigh, duplicate_read_count: 2, duplicate_read_rate_basis_points: 3_333 })),
  true,
  "duplicate-read rate was incorrectly reduced to a scalar hard gate",
);

expectRejectedMetric("missing wide analysis", happyHigh, {
  covered_wide_category_count: 13,
  required_wide_category_coverage_basis_points: 9_285,
}, "required_wide_category_coverage");
expectRejectedMetric("missing deep analysis", happyHigh, {
  deep_analyzed_critical_path_count: 1,
  critical_path_deep_analysis_coverage_basis_points: 5_000,
}, "critical_path_deep_analysis_coverage");
expectRejectedMetric("blocking unknown", happyHigh, {
  blocking_unknown_count: 1,
}, "blocking_unknowns_resolved");
expectRejectedMetric("missing transitive representation", happyHigh, {
  represented_transitive_path_count: 1,
}, "transitive_paths_represented");
expectRejectedMetric("missing exclusion evidence", happyHigh, {
  exclusions_evidenced: false,
}, "exclusions_evidenced");
expectRejectedMetric("unresolved truncation", happyHigh, {
  unresolved_truncation_count: 1,
}, "truncations_resolved");
expectRejectedMetric("unobserved semantic capability", happyHigh, {
  semantic_tool_availability: "claimed_unobserved",
}, "semantic_availability_honest");
expectRejectedMetric("missing verification mapping", happyHigh, {
  covered_verification_mapping_count: 1,
  edge_failure_verification_coverage_basis_points: 5_000,
}, "verification_mapping_complete");
expectRejectedMetric("hidden defect escape", happyHigh, {
  hidden_defect_escape_count: 1,
}, "hidden_defect_absent");
expectRejectedMetric("architecture regression", happyHigh, {
  architecture_regression_count: 1,
}, "architecture_regression_absent");
expectRejectedMetric("unrelated write", happyHigh, {
  unrelated_patch_path_count: 1,
}, "unrelated_writes_absent");
expectRejectedMetric("missing pre-mutation context sufficiency", happyHigh, {
  context_sufficiency_before_mutation: false,
}, "context_sufficiency_before_mutation");
expectRejectedMetric("missing high context report", happyHigh, {
  high_critical_context_report_present: false,
}, "high_critical_context_report");

const happyStandardLite = standardLiteMetrics();
assert(allPassed(evaluateContextAcceptanceHardGates(happyStandardLite)), "bounded standard-lite evidence did not pass");
expectRejectedMetric("standard-lite over-analysis", happyStandardLite, {
  context_tool_call_count: 13,
  standard_lite_over_analysis_count: 1,
}, "standard_lite_process_bounded");

const forgedGates = { ...happyHighGates, hidden_defect_absent: false };
assert.throws(
  () => validateContextAcceptanceHardGates(forgedGates, { metrics: happyHigh }),
  /QUALITY_CONTEXT_HARD_GATE_SEMANTICS/u,
  "hard-gate booleans were accepted independently of their metrics",
);
assert.throws(
  () => validateContextAcceptanceMetrics({ ...happyHigh, duplicate_read_rate_basis_points: 9_999 }),
  /QUALITY_CONTEXT_METRIC_RELATION/u,
  "inconsistent duplicate-read rate was accepted",
);

const weakenedPolicy = structuredClone(v3);
weakenedPolicy.context_requirements.maximum_hidden_defect_escape_count = 1;
assert.throws(
  () => validateQualityAcceptancePolicy(weakenedPolicy),
  /QUALITY_CONTEXT_POLICY_WEAKENING/u,
  "v3 policy was allowed to tolerate a hidden defect",
);
const incompleteSurface = structuredClone(v3);
incompleteSurface.context_requirements.required_hard_gates.pop();
assert.throws(
  () => validateQualityAcceptancePolicy(incompleteSurface),
  /QUALITY_CONTEXT_POLICY_SURFACE/u,
  "v3 policy was allowed to omit a context hard gate",
);
const scalarPolicy = structuredClone(v3);
scalarPolicy.context_requirements.scalar_quality_score = 100;
assert.throws(
  () => validateQualityAcceptancePolicy(scalarPolicy),
  /CONTRACT_/u,
  "v3 policy accepted a scalar quality score",
);

console.log(
  "Context acceptance self-test passed (v2 compatibility, 29 metrics, 14 hard gates, 14 negative mechanisms, standard-lite control, happy paths).",
);
