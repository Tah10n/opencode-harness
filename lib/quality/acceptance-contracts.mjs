import {
  DECISION_SCHEMA_VERSION,
  REPORT_SCHEMA_VERSION,
  ContractError,
  assertEnum,
  assertSafeId,
} from "../feedback/contracts.mjs";
import { assertPersistenceSafe } from "../feedback/privacy.mjs";
import { QUALITY_RISK_CLASSES } from "./constants.mjs";
import {
  assertArray,
  assertBoolean,
  assertFingerprint,
  assertInteger,
  assertIso,
  assertString,
  assertStringArray,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";
import { requiredEngineeringVerificationTargets } from "./verification-targets.mjs";
import { validateIntegratedVerificationEvidence } from "./verification-evidence.mjs";
import { validateEngineeringDossier } from "./dossier.mjs";
import {
  validateEngineeringCheckCatalog,
  validateEngineeringGateDecision,
} from "./gate.mjs";
import { assertValidatedEngineeringQualityRunBundle } from "./run-bundle.mjs";
import { qualityLiveCheckCatalog } from "./live-scenarios.mjs";
import { loadContextStrategyCatalog } from "./context-strategies.mjs";
import {
  TRANSITIVE_IMPACT_METRIC_RESOLUTIONS,
  deriveTransitiveImpactMetrics,
  evaluateTransitiveImpactResolution,
} from "./transitive-impact-resolution.mjs";
import { deriveCompleteContentPaths } from "./context-file-coverage.mjs";

export const QUALITY_ACCEPTANCE_DECISIONS = Object.freeze(["accepted", "rejected", "inconclusive"]);
export const QUALITY_ACCEPTANCE_PROFILE_ROLES = Object.freeze(["baseline", "candidate"]);
export const QUALITY_ACCEPTANCE_GATE_STATUSES = Object.freeze(["passed", "failed", "inconclusive"]);
export const QUALITY_ACCEPTANCE_HARD_GATES = Object.freeze([
  "required_scenarios",
  "verification_coverage",
  "quality_thresholds",
  "quality_regressions",
]);
export const QUALITY_ACCEPTANCE_PRODUCERS = Object.freeze({
  liveReport: "opencode-harness/quality-live-report-v2",
  qualityOutcomes: "opencode-harness/quality-outcomes-v2",
  legacyContextQualityOutcomes: "opencode-harness/quality-outcomes-v3",
  contextQualityOutcomes: "opencode-harness/quality-outcomes-v4",
});

export const QUALITY_VIOLATION_KEYS = Object.freeze([
  "architecture_policy_violations",
  "invariant_violations",
  "unverified_critical_invariants",
  "pre_edit_gate_violations",
  "unresolved_affected_path_gaps",
  "test_quality_failures",
  "permission_widening",
  "introduced_regressions",
  "hidden_edge_case_failures",
]);

export const CONTEXT_ACCEPTANCE_METRIC_KEYS = Object.freeze([
  "risk_class",
  "context_sufficiency_before_mutation",
  "high_critical_context_report_present",
  "required_wide_category_count",
  "covered_wide_category_count",
  "required_wide_category_coverage_basis_points",
  "critical_path_count",
  "deep_analyzed_critical_path_count",
  "critical_path_deep_analysis_coverage_basis_points",
  "blocking_unknown_count",
  "transitive_impact_resolution",
  "represented_transitive_path_count",
  "evidence_backed_transitive_exclusion_count",
  "contradicted_transitive_exclusion_count",
  "reasoned_exclusion_count",
  "exclusions_evidenced",
  "context_tool_call_count",
  "unique_path_count",
  "duplicate_read_count",
  "duplicate_read_rate_basis_points",
  "truncation_count",
  "unresolved_truncation_count",
  "semantic_tool_availability",
  "required_verification_mapping_count",
  "covered_verification_mapping_count",
  "edge_failure_verification_coverage_basis_points",
  "hidden_defect_escape_count",
  "architecture_regression_count",
  "unrelated_patch_path_count",
  "final_reconciliation_present",
  "standard_lite_over_analysis_count",
]);

export const CONTEXT_ACCEPTANCE_HARD_GATE_KEYS = Object.freeze([
  "context_sufficiency_before_mutation",
  "high_critical_context_report",
  "required_wide_category_coverage",
  "critical_path_deep_analysis_coverage",
  "blocking_unknowns_resolved",
  "transitive_impact_resolved",
  "exclusions_evidenced",
  "truncations_resolved",
  "semantic_availability_honest",
  "verification_mapping_complete",
  "hidden_defect_absent",
  "architecture_regression_absent",
  "unrelated_writes_absent",
  "standard_lite_process_bounded",
]);

const LEGACY_CONTEXT_ACCEPTANCE_METRIC_KEYS_V3 = Object.freeze([
  "risk_class",
  "context_sufficiency_before_mutation",
  "high_critical_context_report_present",
  "required_wide_category_count",
  "covered_wide_category_count",
  "required_wide_category_coverage_basis_points",
  "critical_path_count",
  "deep_analyzed_critical_path_count",
  "critical_path_deep_analysis_coverage_basis_points",
  "blocking_unknown_count",
  "required_transitive_path_count",
  "represented_transitive_path_count",
  "reasoned_exclusion_count",
  "exclusions_evidenced",
  "context_tool_call_count",
  "unique_path_count",
  "duplicate_read_count",
  "duplicate_read_rate_basis_points",
  "truncation_count",
  "unresolved_truncation_count",
  "semantic_tool_availability",
  "required_verification_mapping_count",
  "covered_verification_mapping_count",
  "edge_failure_verification_coverage_basis_points",
  "hidden_defect_escape_count",
  "architecture_regression_count",
  "unrelated_patch_path_count",
  "final_reconciliation_present",
  "standard_lite_over_analysis_count",
]);

const LEGACY_CONTEXT_ACCEPTANCE_HARD_GATE_KEYS_V3 = Object.freeze([
  "context_sufficiency_before_mutation",
  "high_critical_context_report",
  "required_wide_category_coverage",
  "critical_path_deep_analysis_coverage",
  "blocking_unknowns_resolved",
  "transitive_paths_represented",
  "exclusions_evidenced",
  "truncations_resolved",
  "semantic_availability_honest",
  "verification_mapping_complete",
  "hidden_defect_absent",
  "architecture_regression_absent",
  "unrelated_writes_absent",
  "standard_lite_process_bounded",
]);

export const CONTEXT_ACCEPTANCE_SEMANTIC_AVAILABILITY = Object.freeze([
  "available_observed",
  "unavailable_fallback",
  "not_required",
  "claimed_unobserved",
]);

const OUTCOME_KEYS_V2 = Object.freeze([
  "schema_version",
  "producer_id",
  "run_id",
  "scenario_id",
  "profile_role",
  "dossier_id",
  "dossier_fingerprint",
  "gate_fingerprint",
  "check_catalog_fingerprint",
  "quality_attestation_fingerprint",
  "quality_bundle_manifest_fingerprint",
  "integrated_verification_evidence_fingerprint",
  "required_check_ids",
  "required_mechanism_ids",
  "passed_check_ids",
  "passed_mechanism_ids",
  "missing_check_ids",
  "missing_mechanism_ids",
  "complete",
  "violations",
  "model_metadata",
  "fingerprint",
]);
const OUTCOME_KEYS_V3 = Object.freeze([
  ...OUTCOME_KEYS_V2.slice(0, -2),
  "context_metrics",
  "context_hard_gates",
  ...OUTCOME_KEYS_V2.slice(-2),
]);
const OUTCOME_KEYS_V4 = OUTCOME_KEYS_V3;
const MODEL_METADATA_KEYS = Object.freeze(["provider", "model", "reasoning_effort", "text_verbosity"]);
const POLICY_KEYS_V2 = Object.freeze([
  "schema_version",
  "policy_version",
  "required_scenarios",
  "required_scenario_risks",
  "quality_requirements",
  "fingerprint",
]);
const POLICY_KEYS_V3 = Object.freeze([
  ...POLICY_KEYS_V2.slice(0, -1),
  "context_requirements",
  "fingerprint",
]);
const REQUIREMENT_KEYS = Object.freeze([
  "require_complete_verification",
  "reject_metric_regressions",
  ...QUALITY_VIOLATION_KEYS.map((key) => `maximum_${key}`),
]);
const LEGACY_CONTEXT_REQUIREMENT_KEYS_V3 = Object.freeze([
  "required_metric_keys",
  "required_hard_gates",
  "minimum_wide_category_coverage_basis_points",
  "minimum_critical_path_deep_analysis_coverage_basis_points",
  "maximum_blocking_unknown_count",
  "minimum_represented_transitive_path_count",
  "require_reasoned_exclusions",
  "maximum_unresolved_truncation_count",
  "require_honest_semantic_tool_availability",
  "minimum_edge_failure_verification_coverage_basis_points",
  "maximum_hidden_defect_escape_count",
  "maximum_architecture_regression_count",
  "maximum_unrelated_patch_path_count",
  "maximum_standard_lite_over_analysis_count",
  "maximum_standard_lite_context_calls",
]);
const CONTEXT_REQUIREMENT_KEYS = Object.freeze(
  LEGACY_CONTEXT_REQUIREMENT_KEYS_V3.filter((key) => key !== "minimum_represented_transitive_path_count"),
);
const REPORT_KEYS = Object.freeze([
  "schema_version",
  "evaluation_run_id",
  "created_at",
  "provenance",
  "results",
  "fingerprint",
]);
const DECISION_KEYS = Object.freeze([
  "schema_version",
  "decision_id",
  "created_at",
  "policy_fingerprint",
  "decision",
  "reason_codes",
  "gates",
  "summary",
  "fingerprint",
]);

const SUMMARY_KEYS = Object.freeze([
  "required_scenario_count",
  "paired_scenario_count",
  "baseline_complete_count",
  "candidate_complete_count",
  "target_universe_mismatch_count",
  "baseline_violations",
  "candidate_violations",
  "maximum_violations",
  "reject_metric_regressions",
]);

function fail(code, message) {
  throw new ContractError(code, message);
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function assertSortedUniqueIds(values, label) {
  assertStringArray(values, label, { max: 512, maxBytes: 128 });
  values.forEach((entry, index) => assertSafeId(entry, `${label}[${index}]`));
  const canonical = sortedUnique(values);
  if (JSON.stringify(values) !== JSON.stringify(canonical)) {
    fail("QUALITY_ACCEPTANCE_TARGET_ORDER", `${label} must be sorted and unique`);
  }
}

function assertNullableString(value, label) {
  if (value !== null) assertString(value, label, { maxBytes: 256 });
}

function validateModelMetadata(value, label) {
  if (value === null) return value;
  exact(value, MODEL_METADATA_KEYS, MODEL_METADATA_KEYS, label);
  for (const key of MODEL_METADATA_KEYS) assertNullableString(value[key], `${label}.${key}`);
  if (MODEL_METADATA_KEYS.every((key) => value[key] === null)) {
    fail("QUALITY_ACCEPTANCE_MODEL_METADATA", `${label} must contain at least one host-supplied value or be null`);
  }
  return value;
}
function validateViolations(value, label) {
  exact(value, QUALITY_VIOLATION_KEYS, QUALITY_VIOLATION_KEYS, label);
  for (const key of QUALITY_VIOLATION_KEYS) assertInteger(value[key], `${label}.${key}`, { min: 0 });
  return value;
}

function coverageBasisPoints(covered, required) {
  return required === 0 ? null : Math.floor((covered * 10_000) / required);
}

function validateNullableBasisPoints(value, label) {
  if (value !== null) assertInteger(value, label, { min: 0, max: 10_000 });
}

function validateLegacyContextAcceptanceMetrics(value, label = "legacy context acceptance metrics") {
  exact(value, LEGACY_CONTEXT_ACCEPTANCE_METRIC_KEYS_V3, LEGACY_CONTEXT_ACCEPTANCE_METRIC_KEYS_V3, label);
  assertEnum(value.risk_class, QUALITY_RISK_CLASSES, `${label}.risk_class`);
  for (const key of [
    "context_sufficiency_before_mutation",
    "high_critical_context_report_present",
    "exclusions_evidenced",
    "final_reconciliation_present",
  ]) assertBoolean(value[key], `${label}.${key}`);
  for (const key of [
    "required_wide_category_count",
    "covered_wide_category_count",
    "critical_path_count",
    "deep_analyzed_critical_path_count",
    "blocking_unknown_count",
    "required_transitive_path_count",
    "represented_transitive_path_count",
    "reasoned_exclusion_count",
    "context_tool_call_count",
    "unique_path_count",
    "duplicate_read_count",
    "truncation_count",
    "unresolved_truncation_count",
    "required_verification_mapping_count",
    "covered_verification_mapping_count",
    "hidden_defect_escape_count",
    "architecture_regression_count",
    "unrelated_patch_path_count",
    "standard_lite_over_analysis_count",
  ]) assertInteger(value[key], `${label}.${key}`, { min: 0, max: 100_000 });
  for (const key of [
    "required_wide_category_coverage_basis_points",
    "critical_path_deep_analysis_coverage_basis_points",
    "duplicate_read_rate_basis_points",
    "edge_failure_verification_coverage_basis_points",
  ]) validateNullableBasisPoints(value[key], `${label}.${key}`);
  assertEnum(
    value.semantic_tool_availability,
    CONTEXT_ACCEPTANCE_SEMANTIC_AVAILABILITY,
    `${label}.semantic_tool_availability`,
  );

  for (const [covered, required, ratio, metricLabel] of [
    [
      value.covered_wide_category_count,
      value.required_wide_category_count,
      value.required_wide_category_coverage_basis_points,
      "wide category coverage",
    ],
    [
      value.deep_analyzed_critical_path_count,
      value.critical_path_count,
      value.critical_path_deep_analysis_coverage_basis_points,
      "critical path deep-analysis coverage",
    ],
    [
      value.covered_verification_mapping_count,
      value.required_verification_mapping_count,
      value.edge_failure_verification_coverage_basis_points,
      "verification mapping coverage",
    ],
  ]) {
    if (covered > required || ratio !== coverageBasisPoints(covered, required)) {
      fail("QUALITY_CONTEXT_METRIC_RELATION", `${label} ${metricLabel} is internally inconsistent`);
    }
  }
  if (
    value.represented_transitive_path_count > value.required_transitive_path_count
    || value.duplicate_read_count > value.context_tool_call_count
    || value.unresolved_truncation_count > value.truncation_count
    || value.duplicate_read_rate_basis_points
      !== coverageBasisPoints(value.duplicate_read_count, value.context_tool_call_count)
  ) fail("QUALITY_CONTEXT_METRIC_RELATION", `${label} contains an impossible count or rate`);
  if (value.risk_class !== "standard-lite" && value.standard_lite_over_analysis_count !== 0) {
    fail("QUALITY_CONTEXT_METRIC_RELATION", `${label}.standard_lite_over_analysis_count applies only to standard-lite`);
  }
  if (value.risk_class === "standard-lite" && (
    value.high_critical_context_report_present
    || value.required_wide_category_count !== 0
    || value.critical_path_count !== 0
    || value.required_transitive_path_count !== 0
    || value.required_verification_mapping_count !== 0
  )) fail("QUALITY_CONTEXT_METRIC_RELATION", `${label} gives standard-lite a full wide/deep report surface`);
  return value;
}

export function validateContextAcceptanceMetrics(value, label = "context acceptance metrics") {
  exact(value, CONTEXT_ACCEPTANCE_METRIC_KEYS, CONTEXT_ACCEPTANCE_METRIC_KEYS, label);
  assertEnum(value.risk_class, QUALITY_RISK_CLASSES, `${label}.risk_class`);
  for (const key of [
    "context_sufficiency_before_mutation",
    "high_critical_context_report_present",
    "exclusions_evidenced",
    "final_reconciliation_present",
  ]) assertBoolean(value[key], `${label}.${key}`);
  for (const key of [
    "required_wide_category_count",
    "covered_wide_category_count",
    "critical_path_count",
    "deep_analyzed_critical_path_count",
    "blocking_unknown_count",
    "represented_transitive_path_count",
    "evidence_backed_transitive_exclusion_count",
    "contradicted_transitive_exclusion_count",
    "reasoned_exclusion_count",
    "context_tool_call_count",
    "unique_path_count",
    "duplicate_read_count",
    "truncation_count",
    "unresolved_truncation_count",
    "required_verification_mapping_count",
    "covered_verification_mapping_count",
    "hidden_defect_escape_count",
    "architecture_regression_count",
    "unrelated_patch_path_count",
    "standard_lite_over_analysis_count",
  ]) assertInteger(value[key], `${label}.${key}`, { min: 0, max: 100_000 });
  for (const key of [
    "required_wide_category_coverage_basis_points",
    "critical_path_deep_analysis_coverage_basis_points",
    "duplicate_read_rate_basis_points",
    "edge_failure_verification_coverage_basis_points",
  ]) validateNullableBasisPoints(value[key], `${label}.${key}`);
  assertEnum(
    value.semantic_tool_availability,
    CONTEXT_ACCEPTANCE_SEMANTIC_AVAILABILITY,
    `${label}.semantic_tool_availability`,
  );
  assertEnum(
    value.transitive_impact_resolution,
    TRANSITIVE_IMPACT_METRIC_RESOLUTIONS,
    `${label}.transitive_impact_resolution`,
  );

  for (const [covered, required, ratio, metricLabel] of [
    [
      value.covered_wide_category_count,
      value.required_wide_category_count,
      value.required_wide_category_coverage_basis_points,
      "wide category coverage",
    ],
    [
      value.deep_analyzed_critical_path_count,
      value.critical_path_count,
      value.critical_path_deep_analysis_coverage_basis_points,
      "critical path deep-analysis coverage",
    ],
    [
      value.covered_verification_mapping_count,
      value.required_verification_mapping_count,
      value.edge_failure_verification_coverage_basis_points,
      "verification mapping coverage",
    ],
  ]) {
    if (covered > required || ratio !== coverageBasisPoints(covered, required)) {
      fail("QUALITY_CONTEXT_METRIC_RELATION", `${label} ${metricLabel} is internally inconsistent`);
    }
  }
  if (
    value.duplicate_read_count > value.context_tool_call_count
    || value.unresolved_truncation_count > value.truncation_count
    || value.duplicate_read_rate_basis_points
      !== coverageBasisPoints(value.duplicate_read_count, value.context_tool_call_count)
  ) fail("QUALITY_CONTEXT_METRIC_RELATION", `${label} contains an impossible count or rate`);

  const full = ["high", "critical"].includes(value.risk_class);
  const represented = value.transitive_impact_resolution === "represented";
  const excluded = value.transitive_impact_resolution === "evidence_backed_excluded";
  const unresolved = value.transitive_impact_resolution === "unresolved";
  const notApplicable = value.transitive_impact_resolution === "not_applicable";
  if (
    (represented && (
      value.represented_transitive_path_count === 0
      || value.evidence_backed_transitive_exclusion_count !== 0
      || value.contradicted_transitive_exclusion_count !== 0
    ))
    || (excluded && (
      value.represented_transitive_path_count !== 0
      || value.evidence_backed_transitive_exclusion_count === 0
      || value.contradicted_transitive_exclusion_count !== 0
    ))
    || (unresolved && value.evidence_backed_transitive_exclusion_count !== 0)
    || (value.contradicted_transitive_exclusion_count > 0 && !unresolved)
    || (notApplicable && (
      value.represented_transitive_path_count !== 0
      || value.evidence_backed_transitive_exclusion_count !== 0
      || value.contradicted_transitive_exclusion_count !== 0
    ))
  ) fail("QUALITY_CONTEXT_METRIC_RELATION", `${label} has contradictory transitive-impact metrics`);

  if (!full && !notApplicable) {
    fail("QUALITY_CONTEXT_METRIC_RELATION", `${label} requires not_applicable transitive impact for standard-lite`);
  }
  if (full && notApplicable) {
    fail("QUALITY_CONTEXT_METRIC_RELATION", `${label} cannot waive transitive impact for high or critical risk`);
  }
  if (value.risk_class !== "standard-lite" && value.standard_lite_over_analysis_count !== 0) {
    fail("QUALITY_CONTEXT_METRIC_RELATION", `${label}.standard_lite_over_analysis_count applies only to standard-lite`);
  }
  if (value.risk_class === "standard-lite" && (
    value.high_critical_context_report_present
    || value.required_wide_category_count !== 0
    || value.critical_path_count !== 0
    || value.required_verification_mapping_count !== 0
  )) fail("QUALITY_CONTEXT_METRIC_RELATION", `${label} gives standard-lite a full wide/deep report surface`);
  return value;
}

function legacyContextHardGatesFromMetrics(metrics) {
  const full = ["high", "critical"].includes(metrics.risk_class);
  return {
    context_sufficiency_before_mutation: metrics.context_sufficiency_before_mutation,
    high_critical_context_report: !full || metrics.high_critical_context_report_present,
    required_wide_category_coverage: !full || (
      metrics.required_wide_category_count > 0
      && metrics.required_wide_category_coverage_basis_points === 10_000
    ),
    critical_path_deep_analysis_coverage: !full
      || metrics.critical_path_count === 0
      || metrics.critical_path_deep_analysis_coverage_basis_points === 10_000,
    blocking_unknowns_resolved: metrics.blocking_unknown_count === 0,
    transitive_paths_represented: !full || (
      metrics.required_transitive_path_count > 0
      && metrics.represented_transitive_path_count === metrics.required_transitive_path_count
    ),
    exclusions_evidenced: !full || metrics.exclusions_evidenced,
    truncations_resolved: metrics.unresolved_truncation_count === 0,
    semantic_availability_honest: metrics.semantic_tool_availability !== "claimed_unobserved",
    verification_mapping_complete: !full
      || metrics.required_verification_mapping_count === 0
      || metrics.edge_failure_verification_coverage_basis_points === 10_000,
    hidden_defect_absent: metrics.hidden_defect_escape_count === 0,
    architecture_regression_absent: metrics.architecture_regression_count === 0,
    unrelated_writes_absent: metrics.final_reconciliation_present
      && metrics.unrelated_patch_path_count === 0,
    standard_lite_process_bounded: metrics.risk_class !== "standard-lite" || (
      metrics.standard_lite_over_analysis_count === 0
      && metrics.context_tool_call_count <= 12
      && !metrics.high_critical_context_report_present
    ),
  };
}

function contextHardGatesFromMetrics(metrics) {
  const full = ["high", "critical"].includes(metrics.risk_class);
  const transitiveImpactResolved = ["represented", "evidence_backed_excluded"]
    .includes(metrics.transitive_impact_resolution)
    && metrics.contradicted_transitive_exclusion_count === 0
    && (
      (metrics.transitive_impact_resolution === "represented"
        && metrics.represented_transitive_path_count > 0)
      || (metrics.transitive_impact_resolution === "evidence_backed_excluded"
        && metrics.evidence_backed_transitive_exclusion_count > 0)
    );
  return {
    context_sufficiency_before_mutation: metrics.context_sufficiency_before_mutation,
    high_critical_context_report: !full || metrics.high_critical_context_report_present,
    required_wide_category_coverage: !full || (
      metrics.required_wide_category_count > 0
      && metrics.required_wide_category_coverage_basis_points === 10_000
    ),
    critical_path_deep_analysis_coverage: !full
      || metrics.critical_path_count === 0
      || metrics.critical_path_deep_analysis_coverage_basis_points === 10_000,
    blocking_unknowns_resolved: metrics.blocking_unknown_count === 0,
    transitive_impact_resolved: !full || transitiveImpactResolved,
    exclusions_evidenced: !full || metrics.exclusions_evidenced,
    truncations_resolved: metrics.unresolved_truncation_count === 0,
    semantic_availability_honest: metrics.semantic_tool_availability !== "claimed_unobserved",
    verification_mapping_complete: !full
      || metrics.required_verification_mapping_count === 0
      || metrics.edge_failure_verification_coverage_basis_points === 10_000,
    hidden_defect_absent: metrics.hidden_defect_escape_count === 0,
    architecture_regression_absent: metrics.architecture_regression_count === 0,
    unrelated_writes_absent: metrics.final_reconciliation_present
      && metrics.unrelated_patch_path_count === 0,
    standard_lite_process_bounded: metrics.risk_class !== "standard-lite" || (
      metrics.standard_lite_over_analysis_count === 0
      && metrics.context_tool_call_count <= 12
      && !metrics.high_critical_context_report_present
    ),
  };
}

function validateLegacyContextAcceptanceHardGates(
  value,
  { metrics = null, label = "legacy context acceptance hard gates" } = {},
) {
  exact(
    value,
    LEGACY_CONTEXT_ACCEPTANCE_HARD_GATE_KEYS_V3,
    LEGACY_CONTEXT_ACCEPTANCE_HARD_GATE_KEYS_V3,
    label,
  );
  for (const key of LEGACY_CONTEXT_ACCEPTANCE_HARD_GATE_KEYS_V3) {
    assertBoolean(value[key], `${label}.${key}`);
  }
  if (metrics !== null) {
    validateLegacyContextAcceptanceMetrics(metrics);
    const expected = legacyContextHardGatesFromMetrics(metrics);
    if (LEGACY_CONTEXT_ACCEPTANCE_HARD_GATE_KEYS_V3.some((key) => value[key] !== expected[key])) {
      fail("QUALITY_CONTEXT_HARD_GATE_SEMANTICS", `${label} does not match the legacy context metrics`);
    }
  }
  return value;
}

export function validateContextAcceptanceHardGates(
  value,
  { metrics = null, label = "context acceptance hard gates" } = {},
) {
  exact(value, CONTEXT_ACCEPTANCE_HARD_GATE_KEYS, CONTEXT_ACCEPTANCE_HARD_GATE_KEYS, label);
  for (const key of CONTEXT_ACCEPTANCE_HARD_GATE_KEYS) assertBoolean(value[key], `${label}.${key}`);
  if (metrics !== null) {
    validateContextAcceptanceMetrics(metrics);
    const expected = contextHardGatesFromMetrics(metrics);
    if (CONTEXT_ACCEPTANCE_HARD_GATE_KEYS.some((key) => value[key] !== expected[key])) {
      fail("QUALITY_CONTEXT_HARD_GATE_SEMANTICS", `${label} does not match the multidimensional context metrics`);
    }
  }
  return value;
}

export function evaluateContextAcceptanceHardGates(metrics) {
  validateContextAcceptanceMetrics(metrics);
  const gates = contextHardGatesFromMetrics(metrics);
  validateContextAcceptanceHardGates(gates, { metrics });
  return deepFrozenClone(gates, "context acceptance hard gates");
}

function allContextHardGatesPass(gates, { legacy = false } = {}) {
  const keys = legacy ? LEGACY_CONTEXT_ACCEPTANCE_HARD_GATE_KEYS_V3 : CONTEXT_ACCEPTANCE_HARD_GATE_KEYS;
  return keys.every((key) => gates[key]);
}

function fingerprintInput(value) {
  const copy = { ...value };
  delete copy.fingerprint;
  return copy;
}

function sameIds(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail("QUALITY_ACCEPTANCE_TARGET_COVERAGE", `${label} does not match the canonical target set`);
  }
}

function receiptCatalogEntry(catalog, receipt, kind) {
  const entries = kind === "check" ? catalog.checks : catalog.mechanisms;
  const idKey = kind === "check" ? "check_id" : "mechanism_id";
  const entry = entries.find((candidate) => candidate[idKey] === receipt[idKey]);
  if (
    !entry
    || !entry.available
    || entry.trusted_producer !== receipt.trusted_producer
    || !entry.phases.includes(receipt.phase)
  ) {
    fail(
      "QUALITY_ACCEPTANCE_EVIDENCE_CATALOG",
      `integrated ${kind} receipt is not authorized by the bound check catalog: ${receipt[idKey]}`,
    );
  }
  return entry;
}

function canonicalAvailableCatalogTargets(catalog) {
  return Object.freeze({
    checkIds: sortedUnique(catalog.checks.filter((entry) => entry.available).map((entry) => entry.check_id)),
    mechanismIds: sortedUnique(
      catalog.mechanisms.filter((entry) => entry.available).map((entry) => entry.mechanism_id),
    ),
  });
}

function trustedBundleArtifacts(runBundle, checkCatalog) {
  const bundle = assertValidatedEngineeringQualityRunBundle(runBundle);
  validateEngineeringDossier(bundle.dossier, { requireFinalized: true });
  validateEngineeringGateDecision(bundle.gate);
  validateEngineeringCheckCatalog(checkCatalog);
  const canonicalCatalog = qualityLiveCheckCatalog(bundle.run.scenario_id, bundle.dossier.risk_class);
  if (checkCatalog.fingerprint !== canonicalCatalog.fingerprint) {
    fail(
      "QUALITY_ACCEPTANCE_CATALOG_TRUST",
      "quality bundle is not bound to the runner-owned canonical scenario catalog",
    );
  }
  if (
    bundle.gate.check_catalog_fingerprint !== checkCatalog.fingerprint
    || bundle.integrated_verification_evidence?.check_catalog_fingerprint !== checkCatalog.fingerprint
  ) {
    fail("QUALITY_ACCEPTANCE_EVIDENCE_CATALOG", "quality bundle is not bound to the supplied check catalog");
  }
  if (
    bundle.run.run_id !== bundle.attestation.run_id
    || bundle.run.run_id !== bundle.manifest.run_id
    || bundle.gate.dossier_id !== bundle.dossier.dossier_id
    || bundle.gate.dossier_fingerprint !== bundle.dossier.fingerprint
    || bundle.attestation.dossier_id !== bundle.dossier.dossier_id
    || bundle.attestation.dossier_fingerprint !== bundle.dossier.fingerprint
    || bundle.attestation.gate_id !== bundle.gate.gate_id
    || bundle.attestation.gate_fingerprint !== bundle.gate.fingerprint
    || bundle.attestation.gate_status !== bundle.gate.status
  ) fail("QUALITY_ACCEPTANCE_BUNDLE_BINDING", "quality bundle artifact identity chain is inconsistent");
  const evidence = bundle.integrated_verification_evidence;
  if (evidence !== null) {
    validateIntegratedVerificationEvidence(evidence);
    if (
      evidence.run_id !== bundle.run.run_id
      || evidence.dossier_id !== bundle.dossier.dossier_id
      || evidence.dossier_fingerprint !== bundle.dossier.fingerprint
      || evidence.gate_id !== bundle.gate.gate_id
      || evidence.gate_fingerprint !== bundle.gate.fingerprint
      || evidence.fingerprint !== bundle.attestation.integrated_verification_evidence_fingerprint
      || evidence.workspace_fingerprint !== bundle.attestation.final_workspace_fingerprint
    ) fail("QUALITY_ACCEPTANCE_EVIDENCE_BINDING", "integrated evidence is not bound to the validated run bundle");
    for (const receipt of evidence.check_receipts) receiptCatalogEntry(checkCatalog, receipt, "check");
    for (const receipt of evidence.mechanism_receipts) receiptCatalogEntry(checkCatalog, receipt, "mechanism");
  }
  if (bundle.gate.status === "passed" && (
    evidence === null
    || bundle.attestation.integrated_verification_sequence === null
    || bundle.verification.status !== "passed"
  )) fail("QUALITY_ACCEPTANCE_EVIDENCE_BINDING", "passed quality bundle lacks runner-attested integrated verification");
  const targets = requiredEngineeringVerificationTargets(bundle.dossier);
  const canonicalTargets = canonicalAvailableCatalogTargets(canonicalCatalog);
  if (
    JSON.stringify(targets.checkIds) !== JSON.stringify(canonicalTargets.checkIds)
    || JSON.stringify(targets.mechanismIds) !== JSON.stringify(canonicalTargets.mechanismIds)
  ) {
    fail(
      "QUALITY_ACCEPTANCE_TARGET_UNIVERSE",
      "dossier verification targets do not match the runner-owned canonical scenario target universe",
    );
  }
  return { bundle, evidence, targets };
}

let cachedContextStrategyCatalog = null;

function contextStrategy(strategyId) {
  cachedContextStrategyCatalog ??= loadContextStrategyCatalog();
  const strategy = cachedContextStrategyCatalog.strategies.find((entry) => entry.id === strategyId);
  if (!strategy) fail("QUALITY_CONTEXT_STRATEGY", `unknown context strategy ${strategyId}`);
  return strategy;
}

function contextSubjectMatcher(graph) {
  const nodes = new Map((graph?.nodes ?? []).map((entry) => [entry.id, entry]));
  const edges = new Map((graph?.edges ?? []).map((entry) => [entry.id, entry]));
  const paths = new Map((graph?.affected_paths ?? []).map((entry) => [entry.id, entry]));
  const excluded = new Map((graph?.excluded_siblings ?? []).map((entry) => [entry.id, entry]));
  const nodeSupported = (nodeId, observedPaths) => {
    const node = nodes.get(nodeId);
    return node?.path !== null && node?.path !== undefined && observedPaths.has(node.path);
  };
  const edgeSupported = (edgeId, observedPaths) => {
    const edge = edges.get(edgeId);
    return edge !== undefined && nodeSupported(edge.from, observedPaths) && nodeSupported(edge.to, observedPaths);
  };
  return (subjectId, observedPaths) => {
    if (nodes.has(subjectId)) return nodeSupported(subjectId, observedPaths);
    if (edges.has(subjectId)) return edgeSupported(subjectId, observedPaths);
    if (paths.has(subjectId)) {
      const affectedPath = paths.get(subjectId);
      return affectedPath.node_ids.every((nodeId) => nodeSupported(nodeId, observedPaths))
        && affectedPath.edge_ids.every((edgeId) => edgeSupported(edgeId, observedPaths));
    }
    if (excluded.has(subjectId)) return observedPaths.has(excluded.get(subjectId).path);
    return false;
  };
}

function receiptBackedClaim(claim, receiptIndex, supportsSubject) {
  if (claim === undefined || claim.receipt_ids.length === 0) return false;
  const receiptIds = new Set(claim.receipt_ids);
  const observedPaths = claim.kind === "reasoned_exclusion"
    ? new Set(deriveCompleteContentPaths(receiptIndex, { receipt_ids: claim.receipt_ids }))
    : new Set(
      receiptIndex.receipts
        .filter((entry) => receiptIds.has(entry.receipt_id))
        .flatMap((entry) => entry.observed_paths),
    );
  return claim.subject_ids.every((subjectId) => supportsSubject(subjectId, observedPaths));
}

function deriveContextAcceptanceAssessment(bundle, evidence, targets) {
  if (bundle.manifest.schema_version !== 3) return null;
  const receiptIndex = bundle.context_receipt_index;
  const report = bundle.context_report;
  const decision = bundle.context_sufficiency_decision;
  const reconciliation = bundle.context_reconciliation;
  if (receiptIndex === null || decision === null) {
    fail("QUALITY_CONTEXT_ARTIFACT_REQUIRED", "Milestone 3 outcomes require bound context receipt and decision artifacts");
  }
  const riskClass = bundle.dossier.risk_class;
  const full = ["high", "critical"].includes(riskClass);
  const strategy = contextStrategy(decision.strategy_id);
  const requiredWideCategories = full ? strategy.required_wide_categories : [];
  const claims = new Map((report?.claims ?? []).map((entry) => [entry.id, entry]));
  const graph = bundle.dossier.impact_graph;
  const supportsSubject = contextSubjectMatcher(graph);
  const receiptEntries = receiptIndex.receipts;
  const isReceiptBackedClaim = (claim) => receiptBackedClaim(claim, receiptIndex, supportsSubject);
  const wideByCategory = new Map((report?.wide_analysis ?? []).map((entry) => [entry.category, entry]));
  const coveredWideCategories = requiredWideCategories.filter((category) => {
    const entry = wideByCategory.get(category);
    return entry !== undefined
      && ["represented", "reasoned_excluded"].includes(entry.classification)
      && entry.claim_ids.length > 0
      && entry.claim_ids.every((claimId) => isReceiptBackedClaim(claims.get(claimId)));
  });
  const receiptBackedSubjects = new Set(
    [...claims.values()].filter(isReceiptBackedClaim).flatMap((entry) => entry.subject_ids),
  );
  const criticalPaths = full ? (graph?.affected_paths ?? []).filter((entry) => entry.critical) : [];
  const deepByPath = new Map((report?.deep_analyses ?? []).map((entry) => [entry.impact_path_id, entry]));
  const deepAnalyzed = criticalPaths.filter((entry) => {
    const deep = deepByPath.get(entry.id);
    if (deep === undefined) return false;
    const receiptIds = new Set(deep.receipt_ids);
    const observedPaths = new Set(receiptEntries.filter((receipt) => receiptIds.has(receipt.receipt_id)).flatMap((receipt) => receipt.observed_paths));
    return supportsSubject(entry.id, observedPaths);
  });
  const mappedCriticalPaths = criticalPaths.filter((entry) => {
    const deep = deepByPath.get(entry.id);
    return deep !== undefined
      && deep.test_obligation_ids.length > 0
      && deep.failure_mode_ids.length > 0
      && deep.edge_case_ids.length > 0
      && deepAnalyzed.includes(entry);
  });
  const excludedWide = wideByCategory.get("excluded_sibling_paths");
  const excludedSubjects = graph?.excluded_siblings ?? [];
  const exclusionsEvidenced = !full || (
    excludedWide !== undefined
    && ["represented", "reasoned_excluded"].includes(excludedWide.classification)
    && excludedWide.claim_ids.length > 0
    && excludedWide.claim_ids.every((claimId) => isReceiptBackedClaim(claims.get(claimId)))
    && excludedSubjects.every((entry) => receiptBackedSubjects.has(entry.id))
  );
  const blockingUnknownReasons = decision.reasons.filter((entry) => entry.code === "CONTEXT_BLOCKING_UNKNOWN");
  const blockingUnknownCount = Math.max(
    graph?.unknowns?.filter((entry) => entry.blocking).length ?? 0,
    blockingUnknownReasons.length,
  );
  const rawTruncationCount = receiptIndex.metrics.truncation_count;
  const unresolvedTruncationCount = Math.max(
    report?.tool_state?.unresolved_truncation_receipt_ids.length ?? 0,
    decision.reasons.filter((entry) => entry.code === "CONTEXT_TRUNCATION_UNRESOLVED").length,
  );
  const semanticObserved = new Set(receiptIndex.metrics.semantic_tools_observed);
  const semanticClaims = (report?.tool_state?.advanced_available ?? []).filter((tool) => [
    "context_map",
    "context_symbols",
    "context_related",
  ].includes(tool));
  let semanticToolAvailability;
  if (!full) semanticToolAvailability = semanticObserved.size > 0 ? "available_observed" : "not_required";
  else if (
    decision.reasons.some((entry) => [
      "CONTEXT_TOOL_AVAILABILITY_UNOBSERVED",
      "CONTEXT_SEMANTIC_COMPLETENESS_UNSUPPORTED",
    ].includes(entry.code))
    || semanticClaims.some((tool) => !semanticObserved.has(tool))
  ) semanticToolAvailability = "claimed_unobserved";
  else if (semanticClaims.length > 0) semanticToolAvailability = "available_observed";
  else if (report?.tool_state?.fallback_used || report?.tool_state?.reduced_semantic_coverage) {
    semanticToolAvailability = "unavailable_fallback";
  }
  else semanticToolAvailability = "claimed_unobserved";

  const passedMechanisms = new Set(
    evidence?.mechanism_receipts
      .filter((entry) => entry.status === "passed")
      .map((entry) => entry.mechanism_id) ?? [],
  );
  const hiddenMechanisms = targets.mechanismIds.filter((entry) => entry.endsWith("-hidden-evaluation"));
  const hiddenDefectEscapeCount = hiddenMechanisms.filter((entry) => !passedMechanisms.has(entry)).length;
  const architectureRegressionCount = Math.max(
    bundle.post_architecture_evaluation?.summary?.introduced_count ?? 0,
    reconciliation?.unexpected_dependency_directions.length ?? 0,
  );
  const unrelatedPatchPathCount = reconciliation?.unrelated_paths.length ?? 0;
  const contextToolCallCount = receiptIndex.metrics.context_tool_calls;
  const standardLiteOverAnalysisCount = riskClass === "standard-lite"
    ? Math.max(
      decision.reasons.filter((entry) => entry.code === "CONTEXT_STANDARD_LITE_OVERANALYSIS").length,
      contextToolCallCount > 12 ? 1 : 0,
    )
    : 0;
  const reasonedExclusionCount = [...claims.values()].filter(
    (entry) => entry.kind === "reasoned_exclusion" && isReceiptBackedClaim(entry),
  ).length;
  const transitiveImpactMetrics = full
    ? deriveTransitiveImpactMetrics(evaluateTransitiveImpactResolution({
      impact_graph: graph,
      context_report: report,
      receipt_evidence_index: receiptIndex,
      require_semantic_edges: strategy.semantic_relation_evidence === "required_or_blocked",
    }))
    : {
      transitive_impact_resolution: "not_applicable",
      represented_transitive_path_count: 0,
      evidence_backed_transitive_exclusion_count: 0,
      contradicted_transitive_exclusion_count: 0,
    };

  const metrics = {
    risk_class: riskClass,
    context_sufficiency_before_mutation: decision.status === "sufficient"
      && decision.implementation_started_sequence === null,
    high_critical_context_report_present: full
      && report?.status === "finalized"
      && decision.report_id === report.report_id
      && decision.report_fingerprint === report.fingerprint,
    required_wide_category_count: requiredWideCategories.length,
    covered_wide_category_count: coveredWideCategories.length,
    required_wide_category_coverage_basis_points: coverageBasisPoints(
      coveredWideCategories.length,
      requiredWideCategories.length,
    ),
    critical_path_count: criticalPaths.length,
    deep_analyzed_critical_path_count: deepAnalyzed.length,
    critical_path_deep_analysis_coverage_basis_points: coverageBasisPoints(
      deepAnalyzed.length,
      criticalPaths.length,
    ),
    blocking_unknown_count: blockingUnknownCount,
    ...transitiveImpactMetrics,
    reasoned_exclusion_count: reasonedExclusionCount,
    exclusions_evidenced: exclusionsEvidenced,
    context_tool_call_count: contextToolCallCount,
    unique_path_count: receiptIndex.metrics.unique_paths_inspected,
    duplicate_read_count: receiptIndex.metrics.duplicate_read_count,
    duplicate_read_rate_basis_points: coverageBasisPoints(
      receiptIndex.metrics.duplicate_read_count,
      contextToolCallCount,
    ),
    truncation_count: Math.max(rawTruncationCount, unresolvedTruncationCount),
    unresolved_truncation_count: unresolvedTruncationCount,
    semantic_tool_availability: semanticToolAvailability,
    required_verification_mapping_count: criticalPaths.length,
    covered_verification_mapping_count: mappedCriticalPaths.length,
    edge_failure_verification_coverage_basis_points: coverageBasisPoints(
      mappedCriticalPaths.length,
      criticalPaths.length,
    ),
    hidden_defect_escape_count: hiddenDefectEscapeCount,
    architecture_regression_count: architectureRegressionCount,
    unrelated_patch_path_count: unrelatedPatchPathCount,
    final_reconciliation_present: reconciliation !== null,
    standard_lite_over_analysis_count: standardLiteOverAnalysisCount,
  };
  validateContextAcceptanceMetrics(metrics);
  return deepFrozenClone({
    metrics,
    hard_gates: evaluateContextAcceptanceHardGates(metrics),
  }, "context acceptance assessment");
}

export function createContextAcceptanceAssessment({ run_bundle: runBundle, check_catalog: checkCatalog } = {}) {
  const { bundle, evidence, targets } = trustedBundleArtifacts(runBundle, checkCatalog);
  const assessment = deriveContextAcceptanceAssessment(bundle, evidence, targets);
  if (assessment === null) {
    fail("QUALITY_CONTEXT_ARTIFACT_REQUIRED", "legacy v2 bundles do not contain Milestone 3 context evidence");
  }
  return assessment;
}

function mappingVerified(item, evidence) {
  const mapping = item?.mapping;
  if (mapping?.classification === "not_applicable") return true;
  if (mapping?.classification === "applicable_blocked_unverified" || evidence === null) return false;
  const passedChecks = new Set(evidence.check_receipts.filter((entry) => entry.status === "passed").map((entry) => entry.check_id));
  const passedMechanisms = new Set(
    evidence.mechanism_receipts.filter((entry) => entry.status === "passed").map((entry) => entry.mechanism_id),
  );
  return mapping.check_ids.every((id) => passedChecks.has(id))
    && mapping.mechanism_ids.every((id) => passedMechanisms.has(id));
}

function violationsFromBundle(bundle, evidence) {
  const dossier = bundle.dossier;
  const gateReasonCodes = new Set(bundle.gate.reasons.map((entry) => entry.code));
  const verificationFailed = bundle.verification.status !== "passed";
  const missingMappedInvariants = dossier.invariants.filter((entry) => !mappingVerified(entry, evidence)).length;
  const violations = {
    architecture_policy_violations: (
      bundle.post_architecture_evaluation?.violations
      ?? bundle.architecture_evaluation?.violations
      ?? []
    ).filter((entry) => entry.blocking).length,
    invariant_violations: missingMappedInvariants,
    unverified_critical_invariants: dossier.risk_class === "critical" ? missingMappedInvariants : 0,
    pre_edit_gate_violations: bundle.attestation.first_implementation_sequence !== null
      && bundle.attestation.first_implementation_sequence <= bundle.attestation.gate_trace_sequence ? 1 : 0,
    unresolved_affected_path_gaps: dossier.unknowns.filter((entry) => entry.blocking).length
      + (dossier.impact_graph?.unknowns.filter((entry) => entry.blocking).length ?? 0),
    test_quality_failures: [...gateReasonCodes]
      .filter((code) => ["QUALITY_CHECK_UNKNOWN", "QUALITY_MECHANISM_UNKNOWN"].includes(code)).length
      + (verificationFailed ? 1 : 0),
    permission_widening: 0,
    introduced_regressions: verificationFailed ? 1 : 0,
    hidden_edge_case_failures: evidence === null || verificationFailed ? 1 : 0,
  };
  const targets = requiredEngineeringVerificationTargets(dossier);
  const context = deriveContextAcceptanceAssessment(bundle, evidence, targets);
  if (context === null) return violations;
  const gates = context.hard_gates;
  const metrics = context.metrics;
  violations.architecture_policy_violations = Math.max(
    violations.architecture_policy_violations,
    metrics.architecture_regression_count,
  );
  if (!gates.context_sufficiency_before_mutation || !gates.high_critical_context_report) {
    violations.pre_edit_gate_violations += 1;
  }
  violations.unresolved_affected_path_gaps += [
    "required_wide_category_coverage",
    "critical_path_deep_analysis_coverage",
    "blocking_unknowns_resolved",
    "transitive_impact_resolved",
    "exclusions_evidenced",
  ].filter((key) => !gates[key]).length;
  violations.test_quality_failures += [
    "truncations_resolved",
    "semantic_availability_honest",
    "verification_mapping_complete",
    "standard_lite_process_bounded",
  ].filter((key) => !gates[key]).length;
  violations.permission_widening += metrics.unrelated_patch_path_count;
  violations.introduced_regressions += metrics.architecture_regression_count
    + metrics.hidden_defect_escape_count
    + metrics.unrelated_patch_path_count;
  violations.hidden_edge_case_failures = metrics.hidden_defect_escape_count;
  return violations;
}

export function qualityOutcomesFingerprint(outcome) {
  return fingerprint(fingerprintInput(outcome));
}

export function validateQualityOutcomes(value, {
  run_bundle = null,
  check_catalog = null,
  label = "quality outcomes",
} = {}) {
  if (![2, 3, 4].includes(value?.schema_version)) {
    fail("QUALITY_ACCEPTANCE_OUTCOME_SCHEMA", `${label}.schema_version must be 2, 3, or 4`);
  }
  const legacyContextOutcome = value.schema_version === 3;
  const currentContextOutcome = value.schema_version === 4;
  const contextOutcome = legacyContextOutcome || currentContextOutcome;
  const outcomeKeys = currentContextOutcome
    ? OUTCOME_KEYS_V4
    : legacyContextOutcome
      ? OUTCOME_KEYS_V3
      : OUTCOME_KEYS_V2;
  exact(value, outcomeKeys, outcomeKeys, label);
  const expectedProducer = currentContextOutcome
    ? QUALITY_ACCEPTANCE_PRODUCERS.contextQualityOutcomes
    : legacyContextOutcome
      ? QUALITY_ACCEPTANCE_PRODUCERS.legacyContextQualityOutcomes
      : QUALITY_ACCEPTANCE_PRODUCERS.qualityOutcomes;
  if (value.producer_id !== expectedProducer) {
    fail("QUALITY_ACCEPTANCE_PRODUCER", `${label}.producer_id is not the first-party quality outcome producer`);
  }
  for (const key of ["run_id", "scenario_id", "dossier_id"]) assertSafeId(value[key], `${label}.${key}`);
  assertEnum(value.profile_role, QUALITY_ACCEPTANCE_PROFILE_ROLES, `${label}.profile_role`);
  for (const key of [
    "dossier_fingerprint",
    "gate_fingerprint",
    "check_catalog_fingerprint",
    "quality_attestation_fingerprint",
    "quality_bundle_manifest_fingerprint",
  ]) assertFingerprint(value[key], `${label}.${key}`);
  if (value.integrated_verification_evidence_fingerprint !== null) {
    assertFingerprint(
      value.integrated_verification_evidence_fingerprint,
      `${label}.integrated_verification_evidence_fingerprint`,
    );
  }
  for (const key of [
    "required_check_ids",
    "required_mechanism_ids",
    "passed_check_ids",
    "passed_mechanism_ids",
    "missing_check_ids",
    "missing_mechanism_ids",
  ]) assertSortedUniqueIds(value[key], `${label}.${key}`);
  validateViolations(value.violations, `${label}.violations`);
  validateModelMetadata(value.model_metadata, `${label}.model_metadata`);
  assertBoolean(value.complete, `${label}.complete`);
  if (currentContextOutcome) {
    validateContextAcceptanceMetrics(value.context_metrics, `${label}.context_metrics`);
    validateContextAcceptanceHardGates(value.context_hard_gates, {
      metrics: value.context_metrics,
      label: `${label}.context_hard_gates`,
    });
  } else if (legacyContextOutcome) {
    validateLegacyContextAcceptanceMetrics(value.context_metrics, `${label}.context_metrics`);
    validateLegacyContextAcceptanceHardGates(value.context_hard_gates, {
      metrics: value.context_metrics,
      label: `${label}.context_hard_gates`,
    });
  }

  const expectedMissingChecks = value.required_check_ids.filter((id) => !value.passed_check_ids.includes(id));
  const expectedMissingMechanisms = value.required_mechanism_ids.filter((id) => !value.passed_mechanism_ids.includes(id));
  sameIds(value.missing_check_ids, expectedMissingChecks, `${label}.missing_check_ids`);
  sameIds(value.missing_mechanism_ids, expectedMissingMechanisms, `${label}.missing_mechanism_ids`);
  if (value.passed_check_ids.some((id) => !value.required_check_ids.includes(id))) {
    fail("QUALITY_ACCEPTANCE_TARGET_COVERAGE", `${label}.passed_check_ids contains a non-required target`);
  }
  if (value.passed_mechanism_ids.some((id) => !value.required_mechanism_ids.includes(id))) {
    fail("QUALITY_ACCEPTANCE_TARGET_COVERAGE", `${label}.passed_mechanism_ids contains a non-required target`);
  }
  const expectedComplete = value.integrated_verification_evidence_fingerprint !== null
    && expectedMissingChecks.length === 0
    && expectedMissingMechanisms.length === 0
    && (!contextOutcome || allContextHardGatesPass(value.context_hard_gates, { legacy: legacyContextOutcome }));
  if (value.complete !== expectedComplete) {
    fail("QUALITY_ACCEPTANCE_OUTCOME_COMPLETENESS", `${label}.complete does not match verification coverage`);
  }
  if (
    value.integrated_verification_evidence_fingerprint === null
    && (value.passed_check_ids.length > 0 || value.passed_mechanism_ids.length > 0)
  ) {
    fail("QUALITY_ACCEPTANCE_EVIDENCE_BINDING", `${label} cannot claim passed targets without integrated evidence`);
  }

  if ((run_bundle === null) !== (check_catalog === null)) {
    fail("QUALITY_ACCEPTANCE_BUNDLE_BINDING", "run_bundle and check_catalog must be supplied together");
  }
  if (run_bundle !== null) {
    const { bundle, evidence, targets } = trustedBundleArtifacts(run_bundle, check_catalog);
    const contextAssessment = deriveContextAcceptanceAssessment(bundle, evidence, targets);
    const expectedBundleOutcomeSchema = contextAssessment === null ? 2 : 4;
    if (value.schema_version !== expectedBundleOutcomeSchema) {
      fail("QUALITY_ACCEPTANCE_OUTCOME_SCHEMA", `${label} schema does not match the validated bundle generation`);
    }
    if (
      bundle.run.run_id !== value.run_id
      || bundle.run.scenario_id !== value.scenario_id
      || bundle.run.profile_role !== value.profile_role
      || bundle.dossier.dossier_id !== value.dossier_id
      || bundle.dossier.fingerprint !== value.dossier_fingerprint
      || bundle.gate.fingerprint !== value.gate_fingerprint
      || check_catalog.fingerprint !== value.check_catalog_fingerprint
      || bundle.attestation.fingerprint !== value.quality_attestation_fingerprint
      || bundle.manifest.fingerprint !== value.quality_bundle_manifest_fingerprint
      || (evidence?.fingerprint ?? null) !== value.integrated_verification_evidence_fingerprint
    ) fail("QUALITY_ACCEPTANCE_BUNDLE_BINDING", `${label} does not bind the validated run bundle`);
    sameIds(value.required_check_ids, targets.checkIds, `${label}.required_check_ids`);
    sameIds(value.required_mechanism_ids, targets.mechanismIds, `${label}.required_mechanism_ids`);
    const passedChecks = new Set(evidence?.check_receipts.filter((entry) => entry.status === "passed").map((entry) => entry.check_id) ?? []);
    const passedMechanisms = new Set(
      evidence?.mechanism_receipts.filter((entry) => entry.status === "passed").map((entry) => entry.mechanism_id) ?? [],
    );
    sameIds(value.passed_check_ids, targets.checkIds.filter((id) => passedChecks.has(id)), `${label}.passed_check_ids`);
    sameIds(
      value.passed_mechanism_ids,
      targets.mechanismIds.filter((id) => passedMechanisms.has(id)),
      `${label}.passed_mechanism_ids`,
    );
    if (JSON.stringify(value.violations) !== JSON.stringify(violationsFromBundle(bundle, evidence))) {
      fail("QUALITY_ACCEPTANCE_VIOLATIONS", `${label}.violations were not derived from the validated bundle`);
    }
    if (currentContextOutcome && contextAssessment !== null && (
      CONTEXT_ACCEPTANCE_METRIC_KEYS.some(
        (key) => value.context_metrics[key] !== contextAssessment.metrics[key],
      )
      || CONTEXT_ACCEPTANCE_HARD_GATE_KEYS.some(
        (key) => value.context_hard_gates[key] !== contextAssessment.hard_gates[key],
      )
    )) fail("QUALITY_CONTEXT_METRICS_TRUST", `${label} context metrics were not derived from the validated bundle`);
    const trustedComplete = bundle.gate.status === "passed"
      && bundle.verification.status === "passed"
      && evidence !== null
      && targets.checkIds.every((id) => passedChecks.has(id))
      && targets.mechanismIds.every((id) => passedMechanisms.has(id))
      && (contextAssessment === null || allContextHardGatesPass(contextAssessment.hard_gates));
    if (value.complete !== trustedComplete) {
      fail("QUALITY_ACCEPTANCE_OUTCOME_COMPLETENESS", `${label}.complete does not match the validated bundle`);
    }
  }

  assertFingerprint(value.fingerprint, `${label}.fingerprint`);
  if (!fingerprintsEqual(value.fingerprint, qualityOutcomesFingerprint(value))) {
    fail("QUALITY_ACCEPTANCE_OUTCOME_FINGERPRINT", `${label}.fingerprint does not match its content`);
  }
  assertPersistenceSafe(value, { label });
  return value;
}

export function createQualityOutcomes(input) {
  const allowed = ["run_bundle", "check_catalog", "model_metadata"];
  exact(input, allowed, ["run_bundle", "check_catalog"], "quality outcomes input");
  const { bundle, evidence, targets } = trustedBundleArtifacts(input.run_bundle, input.check_catalog);
  const dossier = bundle.dossier;
  const passedChecks = new Set(
    evidence?.check_receipts.filter((entry) => entry.status === "passed").map((entry) => entry.check_id) ?? [],
  );
  const passedMechanisms = new Set(
    evidence?.mechanism_receipts.filter((entry) => entry.status === "passed").map((entry) => entry.mechanism_id) ?? [],
  );
  const requiredCheckIds = [...targets.checkIds];
  const requiredMechanismIds = [...targets.mechanismIds];
  const passedCheckIds = requiredCheckIds.filter((id) => passedChecks.has(id));
  const passedMechanismIds = requiredMechanismIds.filter((id) => passedMechanisms.has(id));
  const violations = violationsFromBundle(bundle, evidence);
  const contextAssessment = deriveContextAcceptanceAssessment(bundle, evidence, targets);
  const contextComplete = contextAssessment === null || allContextHardGatesPass(contextAssessment.hard_gates);
  const source = {
    schema_version: contextAssessment === null ? 2 : 4,
    producer_id: contextAssessment === null
      ? QUALITY_ACCEPTANCE_PRODUCERS.qualityOutcomes
      : QUALITY_ACCEPTANCE_PRODUCERS.contextQualityOutcomes,
    run_id: bundle.run.run_id,
    scenario_id: bundle.run.scenario_id,
    profile_role: bundle.run.profile_role,
    dossier_id: dossier.dossier_id,
    dossier_fingerprint: dossier.fingerprint,
    gate_fingerprint: bundle.gate.fingerprint,
    check_catalog_fingerprint: input.check_catalog.fingerprint,
    quality_attestation_fingerprint: bundle.attestation.fingerprint,
    quality_bundle_manifest_fingerprint: bundle.manifest.fingerprint,
    integrated_verification_evidence_fingerprint: evidence?.fingerprint ?? null,
    required_check_ids: requiredCheckIds,
    required_mechanism_ids: requiredMechanismIds,
    passed_check_ids: passedCheckIds,
    passed_mechanism_ids: passedMechanismIds,
    missing_check_ids: requiredCheckIds.filter((id) => !passedChecks.has(id)),
    missing_mechanism_ids: requiredMechanismIds.filter((id) => !passedMechanisms.has(id)),
    complete: bundle.gate.status === "passed"
      && bundle.verification.status === "passed"
      && evidence !== null
      && requiredCheckIds.every((id) => passedChecks.has(id))
      && requiredMechanismIds.every((id) => passedMechanisms.has(id))
      && contextComplete,
    violations,
    ...(contextAssessment === null ? {} : {
      context_metrics: contextAssessment.metrics,
      context_hard_gates: contextAssessment.hard_gates,
    }),
    model_metadata: input.model_metadata ?? null,
  };
  const outcome = { ...source, fingerprint: fingerprint(source) };
  validateQualityOutcomes(outcome, { run_bundle: bundle, check_catalog: input.check_catalog });
  return deepFrozenClone(outcome, "quality outcomes");
}

export function qualityBundleFingerprint(attestation, outcomes) {
  if (attestation !== null && typeof attestation?.fingerprint !== "string") {
    fail("QUALITY_ACCEPTANCE_ATTESTATION", "attestation must be null or a fingerprinted record");
  }
  validateQualityOutcomes(outcomes);
  return fingerprint({
    quality_attestation_fingerprint: attestation?.fingerprint ?? null,
    quality_outcomes_fingerprint: outcomes.fingerprint,
  });
}

export function qualityAcceptancePolicyFingerprint(policy) {
  return fingerprint(fingerprintInput(policy));
}

function contextPolicyContract(policyVersion) {
  const match = /^3\.(0|1)\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.exec(policyVersion);
  if (match === null) {
    fail(
      "QUALITY_CONTEXT_POLICY_VERSION",
      "schema-3 policy_version must explicitly select the 3.0 legacy or 3.1 current context contract",
    );
  }
  return match[1] === "0" ? "legacy-v3" : "current-v4";
}

export function qualityAcceptancePolicyOutcomeSchema(policy) {
  if (policy?.schema_version !== 3) return 2;
  return contextPolicyContract(policy.policy_version) === "legacy-v3" ? 3 : 4;
}

function validateContextAcceptanceRequirements(value, { legacy }) {
  const requirementKeys = legacy ? LEGACY_CONTEXT_REQUIREMENT_KEYS_V3 : CONTEXT_REQUIREMENT_KEYS;
  const metricKeys = legacy ? LEGACY_CONTEXT_ACCEPTANCE_METRIC_KEYS_V3 : CONTEXT_ACCEPTANCE_METRIC_KEYS;
  const hardGateKeys = legacy
    ? LEGACY_CONTEXT_ACCEPTANCE_HARD_GATE_KEYS_V3
    : CONTEXT_ACCEPTANCE_HARD_GATE_KEYS;
  exact(
    value,
    requirementKeys,
    requirementKeys,
    "quality acceptance policy.context_requirements",
  );
  for (const [key, expected] of [
    ["required_metric_keys", [...metricKeys].sort()],
    ["required_hard_gates", [...hardGateKeys].sort()],
  ]) {
    assertStringArray(value[key], `quality acceptance policy.context_requirements.${key}`, {
      max: 512,
      maxBytes: 128,
    });
    if (JSON.stringify(value[key]) !== JSON.stringify(expected)) {
      fail("QUALITY_CONTEXT_POLICY_SURFACE", `quality acceptance policy.context_requirements.${key} must match the canonical surface`);
    }
  }
  for (const key of ["require_reasoned_exclusions", "require_honest_semantic_tool_availability"]) {
    assertBoolean(value[key], `quality acceptance policy.context_requirements.${key}`);
    if (!value[key]) fail("QUALITY_CONTEXT_POLICY_WEAKENING", `${key} cannot be disabled`);
  }
  const exactBounds = {
    minimum_wide_category_coverage_basis_points: 10_000,
    minimum_critical_path_deep_analysis_coverage_basis_points: 10_000,
    maximum_blocking_unknown_count: 0,
    ...(legacy ? { minimum_represented_transitive_path_count: 1 } : {}),
    maximum_unresolved_truncation_count: 0,
    minimum_edge_failure_verification_coverage_basis_points: 10_000,
    maximum_hidden_defect_escape_count: 0,
    maximum_architecture_regression_count: 0,
    maximum_unrelated_patch_path_count: 0,
    maximum_standard_lite_over_analysis_count: 0,
    maximum_standard_lite_context_calls: 12,
  };
  for (const [key, expected] of Object.entries(exactBounds)) {
    assertInteger(value[key], `quality acceptance policy.context_requirements.${key}`, { min: 0, max: 10_000 });
    if (value[key] !== expected) {
      fail("QUALITY_CONTEXT_POLICY_WEAKENING", `${key} must remain ${expected}`);
    }
  }
  return value;
}

export function validateQualityAcceptancePolicy(value) {
  if (![2, 3].includes(value?.schema_version)) {
    fail("QUALITY_ACCEPTANCE_POLICY_SCHEMA", "quality acceptance policy.schema_version must be 2 or 3");
  }
  const policyKeys = value.schema_version === 3 ? POLICY_KEYS_V3 : POLICY_KEYS_V2;
  exact(value, policyKeys, policyKeys, "quality acceptance policy");
  assertString(value.policy_version, "quality acceptance policy.policy_version", { maxBytes: 64 });
  assertSortedUniqueIds(value.required_scenarios, "quality acceptance policy.required_scenarios");
  if (value.required_scenarios.length === 0) {
    fail("QUALITY_ACCEPTANCE_POLICY_SCENARIOS", "quality acceptance policy requires at least one scenario");
  }
  if (
    value.required_scenario_risks === null
    || typeof value.required_scenario_risks !== "object"
    || Array.isArray(value.required_scenario_risks)
    || JSON.stringify(Object.keys(value.required_scenario_risks)) !== JSON.stringify(value.required_scenarios)
  ) {
    fail(
      "QUALITY_ACCEPTANCE_POLICY_RISKS",
      "quality acceptance policy.required_scenario_risks keys must exactly follow sorted required_scenarios",
    );
  }
  exact(
    value.required_scenario_risks,
    value.required_scenarios,
    value.required_scenarios,
    "quality acceptance policy.required_scenario_risks",
  );
  for (const scenarioId of value.required_scenarios) {
    assertEnum(
      value.required_scenario_risks[scenarioId],
      QUALITY_RISK_CLASSES,
      `quality acceptance policy.required_scenario_risks.${scenarioId}`,
    );
  }
  exact(value.quality_requirements, REQUIREMENT_KEYS, REQUIREMENT_KEYS, "quality acceptance policy.quality_requirements");
  assertBoolean(
    value.quality_requirements.require_complete_verification,
    "quality acceptance policy.quality_requirements.require_complete_verification",
  );
  if (!value.quality_requirements.require_complete_verification) {
    fail("QUALITY_ACCEPTANCE_POLICY_COMPLETENESS", "quality acceptance cannot waive complete integrated verification");
  }
  assertBoolean(
    value.quality_requirements.reject_metric_regressions,
    "quality acceptance policy.quality_requirements.reject_metric_regressions",
  );
  for (const key of QUALITY_VIOLATION_KEYS) {
    assertInteger(
      value.quality_requirements[`maximum_${key}`],
      `quality acceptance policy.quality_requirements.maximum_${key}`,
      { min: 0 },
    );
  }
  if (value.schema_version === 3) {
    const contract = contextPolicyContract(value.policy_version);
    validateContextAcceptanceRequirements(value.context_requirements, { legacy: contract === "legacy-v3" });
  }
  assertFingerprint(value.fingerprint, "quality acceptance policy.fingerprint");
  if (!fingerprintsEqual(value.fingerprint, qualityAcceptancePolicyFingerprint(value))) {
    fail("QUALITY_ACCEPTANCE_POLICY_FINGERPRINT", "quality acceptance policy fingerprint mismatch");
  }
  return value;
}

export function createQualityAcceptancePolicy(input) {
  const keys = POLICY_KEYS_V2.filter((key) => key !== "schema_version" && key !== "fingerprint");
  exact(input, keys, keys, "quality acceptance policy input");
  const source = { schema_version: 2, ...input };
  const policy = { ...source, fingerprint: fingerprint(source) };
  validateQualityAcceptancePolicy(policy);
  return deepFrozenClone(policy, "quality acceptance policy");
}

export function createQualityAcceptancePolicyV3(input) {
  const keys = POLICY_KEYS_V3.filter((key) => key !== "schema_version" && key !== "fingerprint");
  exact(input, keys, keys, "quality acceptance policy v3 input");
  const source = { schema_version: 3, ...input };
  const policy = { ...source, fingerprint: fingerprint(source) };
  validateQualityAcceptancePolicy(policy);
  return deepFrozenClone(policy, "quality acceptance policy v3");
}

export function qualityLiveReportFingerprint(report) {
  return fingerprint(fingerprintInput(report));
}

export function validateQualityLiveReport(value) {
  exact(value, REPORT_KEYS, REPORT_KEYS, "quality live report");
  if (value.schema_version !== REPORT_SCHEMA_VERSION) {
    fail("QUALITY_ACCEPTANCE_REPORT_SCHEMA", `quality live report.schema_version must be ${REPORT_SCHEMA_VERSION}`);
  }
  assertSafeId(value.evaluation_run_id, "quality live report.evaluation_run_id");
  assertIso(value.created_at, "quality live report.created_at");
  exact(value.provenance, ["producer_id", "source"], ["producer_id", "source"], "quality live report.provenance");
  if (value.provenance.producer_id !== QUALITY_ACCEPTANCE_PRODUCERS.liveReport) {
    fail("QUALITY_ACCEPTANCE_PRODUCER", "quality live report has an unexpected producer");
  }
  assertString(value.provenance.source, "quality live report.provenance.source", { maxBytes: 256 });
  assertArray(value.results, "quality live report.results", { min: 1, item: validateQualityOutcomes });
  assertFingerprint(value.fingerprint, "quality live report.fingerprint");
  if (!fingerprintsEqual(value.fingerprint, qualityLiveReportFingerprint(value))) {
    fail("QUALITY_ACCEPTANCE_REPORT_FINGERPRINT", "quality live report fingerprint mismatch");
  }
  assertPersistenceSafe(value, { label: "quality live report" });
  return value;
}

export function createQualityLiveReport(input) {
  const keys = REPORT_KEYS.filter((key) => !["schema_version", "fingerprint"].includes(key));
  exact(input, keys, keys, "quality live report input");
  const source = { schema_version: REPORT_SCHEMA_VERSION, ...input };
  const report = { ...source, fingerprint: fingerprint(source) };
  validateQualityLiveReport(report);
  return deepFrozenClone(report, "quality live report");
}

function validateGate(value, label) {
  exact(value, ["gate_id", "status", "reason_codes"], ["gate_id", "status", "reason_codes"], label);
  assertEnum(value.gate_id, QUALITY_ACCEPTANCE_HARD_GATES, `${label}.gate_id`);
  assertEnum(value.status, QUALITY_ACCEPTANCE_GATE_STATUSES, `${label}.status`);
  assertStringArray(value.reason_codes, `${label}.reason_codes`, { maxBytes: 128 });
  if (JSON.stringify(value.reason_codes) !== JSON.stringify(sortedUnique(value.reason_codes))) {
    fail("QUALITY_ACCEPTANCE_DECISION_REASONS", `${label}.reason_codes must be sorted and unique`);
  }
  if ((value.status === "passed") !== (value.reason_codes.length === 0)) {
    fail("QUALITY_ACCEPTANCE_DECISION_REASONS", `${label} passed status and reason codes are inconsistent`);
  }
}

function validateSummary(value) {
  exact(value, SUMMARY_KEYS, SUMMARY_KEYS, "quality acceptance decision.summary");
  for (const key of [
    "required_scenario_count",
    "paired_scenario_count",
    "baseline_complete_count",
    "candidate_complete_count",
    "target_universe_mismatch_count",
  ]) {
    assertInteger(value[key], `quality acceptance decision.summary.${key}`, { min: 0 });
  }
  if (
    value.required_scenario_count === 0
    || value.paired_scenario_count > value.required_scenario_count
    || value.baseline_complete_count > value.paired_scenario_count
    || value.candidate_complete_count > value.paired_scenario_count
    || value.target_universe_mismatch_count > value.paired_scenario_count
  ) fail("QUALITY_ACCEPTANCE_DECISION_SUMMARY", "quality acceptance decision summary counts are inconsistent");
  validateViolations(value.baseline_violations, "quality acceptance decision.summary.baseline_violations");
  validateViolations(value.candidate_violations, "quality acceptance decision.summary.candidate_violations");
  validateViolations(value.maximum_violations, "quality acceptance decision.summary.maximum_violations");
  assertBoolean(value.reject_metric_regressions, "quality acceptance decision.summary.reject_metric_regressions");
}

function exactGate(gate, status, reasonCodes, label) {
  const expectedReasons = sortedUnique(reasonCodes);
  if (gate.status !== status || JSON.stringify(gate.reason_codes) !== JSON.stringify(expectedReasons)) {
    fail("QUALITY_ACCEPTANCE_DECISION_SEMANTICS", `${label} does not match the decision summary`);
  }
}

function validateDecisionSemantics(value) {
  const gates = new Map(value.gates.map((entry) => [entry.gate_id, entry]));
  const summary = value.summary;
  const requiredGate = gates.get("required_scenarios");
  if (summary.paired_scenario_count === summary.required_scenario_count) {
    exactGate(requiredGate, "passed", [], "required_scenarios gate");
  } else if (
    requiredGate.status !== "inconclusive"
    || requiredGate.reason_codes.length === 0
    || requiredGate.reason_codes.some((code) => ![
      "QUALITY_REQUIRED_SCENARIO_MISSING",
      "QUALITY_REQUIRED_SCENARIO_DUPLICATE",
    ].includes(code))
  ) fail("QUALITY_ACCEPTANCE_DECISION_SEMANTICS", "required_scenarios gate does not match pair coverage");

  const coverageReasons = [];
  if (summary.baseline_complete_count !== summary.paired_scenario_count) {
    coverageReasons.push("QUALITY_BASELINE_INTEGRATED_VERIFICATION_INCOMPLETE");
  }
  if (summary.candidate_complete_count !== summary.paired_scenario_count) {
    coverageReasons.push("QUALITY_CANDIDATE_INTEGRATED_VERIFICATION_INCOMPLETE");
  }
  if (summary.target_universe_mismatch_count > 0) coverageReasons.push("QUALITY_TARGET_UNIVERSE_MISMATCH");
  exactGate(
    gates.get("verification_coverage"),
    coverageReasons.length === 0 ? "passed" : "failed",
    coverageReasons,
    "verification_coverage gate",
  );

  const thresholdReasons = QUALITY_VIOLATION_KEYS
    .filter((key) => summary.candidate_violations[key] > summary.maximum_violations[key])
    .map((key) => `QUALITY_THRESHOLD_${key.toUpperCase()}`);
  exactGate(
    gates.get("quality_thresholds"),
    thresholdReasons.length === 0 ? "passed" : "failed",
    thresholdReasons,
    "quality_thresholds gate",
  );

  const regressionReasons = summary.reject_metric_regressions
    ? QUALITY_VIOLATION_KEYS
      .filter((key) => summary.candidate_violations[key] > summary.baseline_violations[key])
      .map((key) => `QUALITY_REGRESSION_${key.toUpperCase()}`)
    : [];
  exactGate(
    gates.get("quality_regressions"),
    regressionReasons.length === 0 ? "passed" : "failed",
    regressionReasons,
    "quality_regressions gate",
  );

  const expectedDecision = value.gates.some((entry) => entry.status === "inconclusive")
    ? "inconclusive"
    : value.gates.some((entry) => entry.status === "failed") ? "rejected" : "accepted";
  if (value.decision !== expectedDecision) {
    fail("QUALITY_ACCEPTANCE_DECISION_SEMANTICS", "decision does not match hard-gate statuses");
  }
  const expectedReasons = sortedUnique(value.gates.flatMap((entry) => entry.reason_codes));
  if (JSON.stringify(value.reason_codes) !== JSON.stringify(expectedReasons)) {
    fail("QUALITY_ACCEPTANCE_DECISION_REASONS", "top-level reason_codes do not match hard-gate reasons");
  }
  if (value.decision === "accepted" && (
    summary.paired_scenario_count !== summary.required_scenario_count
    || summary.baseline_complete_count !== summary.required_scenario_count
    || summary.candidate_complete_count !== summary.required_scenario_count
    || summary.target_universe_mismatch_count !== 0
  )) fail("QUALITY_ACCEPTANCE_DECISION_SEMANTICS", "accepted decision lacks complete paired evidence");
}

export function qualityAcceptanceDecisionFingerprint(value) {
  return fingerprint(fingerprintInput(value));
}

export function validateQualityAcceptanceDecision(value) {
  exact(value, DECISION_KEYS, DECISION_KEYS, "quality acceptance decision");
  if (value.schema_version !== DECISION_SCHEMA_VERSION) {
    fail("QUALITY_ACCEPTANCE_DECISION_SCHEMA", `quality acceptance decision.schema_version must be ${DECISION_SCHEMA_VERSION}`);
  }
  assertSafeId(value.decision_id, "quality acceptance decision.decision_id");
  assertIso(value.created_at, "quality acceptance decision.created_at");
  assertFingerprint(value.policy_fingerprint, "quality acceptance decision.policy_fingerprint");
  assertEnum(value.decision, QUALITY_ACCEPTANCE_DECISIONS, "quality acceptance decision.decision");
  assertStringArray(value.reason_codes, "quality acceptance decision.reason_codes", { maxBytes: 128 });
  if (JSON.stringify(value.reason_codes) !== JSON.stringify(sortedUnique(value.reason_codes))) {
    fail("QUALITY_ACCEPTANCE_DECISION_REASONS", "quality acceptance decision.reason_codes must be sorted and unique");
  }
  assertArray(value.gates, "quality acceptance decision.gates", {
    min: QUALITY_ACCEPTANCE_HARD_GATES.length,
    max: QUALITY_ACCEPTANCE_HARD_GATES.length,
    item: validateGate,
  });
  if (
    new Set(value.gates.map((entry) => entry.gate_id)).size !== QUALITY_ACCEPTANCE_HARD_GATES.length
    || JSON.stringify(value.gates.map((entry) => entry.gate_id)) !== JSON.stringify(QUALITY_ACCEPTANCE_HARD_GATES)
  ) {
    fail("QUALITY_ACCEPTANCE_DECISION_GATES", "quality acceptance decision must contain each hard gate once");
  }
  validateSummary(value.summary);
  validateDecisionSemantics(value);
  assertFingerprint(value.fingerprint, "quality acceptance decision.fingerprint");
  if (!fingerprintsEqual(value.fingerprint, qualityAcceptanceDecisionFingerprint(value))) {
    fail("QUALITY_ACCEPTANCE_DECISION_FINGERPRINT", "quality acceptance decision fingerprint mismatch");
  }
  assertPersistenceSafe(value, { label: "quality acceptance decision" });
  return value;
}

export function sealQualityAcceptanceDecision(input) {
  const keys = DECISION_KEYS.filter((key) => !["schema_version", "fingerprint"].includes(key));
  exact(input, keys, keys, "quality acceptance decision input");
  const source = { schema_version: DECISION_SCHEMA_VERSION, ...input };
  const decision = { ...source, fingerprint: fingerprint(source) };
  validateQualityAcceptanceDecision(decision);
  return deepFrozenClone(decision, "quality acceptance decision");
}

export const createQualityAcceptanceDecision = sealQualityAcceptanceDecision;

export function isLegacyAcceptanceReport(value) {
  return value?.schema_version === 1;
}

export function isFingerprint(value) {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

export function assertPairKey(value, label = "pair key") {
  assertSafeId(value, label);
  return value;
}
