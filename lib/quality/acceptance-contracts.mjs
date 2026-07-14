import {
  ACCEPTANCE_POLICY_SCHEMA_VERSION,
  DECISION_SCHEMA_VERSION,
  LEGACY_REPORT_SCHEMA_VERSION,
  REPORT_SCHEMA_VERSION,
  ContractError,
  assertEnum,
  assertSafeId,
} from "../feedback/contracts.mjs";
import { validateLiveReport as validateLegacyLiveReport } from "../feedback/acceptance.mjs";
import { validateQualityAttestation } from "./attestation.mjs";
import {
  MODEL_MODES,
  MODEL_PROFILE_ROLES as HARNESS_MODEL_PROFILE_ROLES,
  MODEL_REASONING_EFFORTS,
  MODEL_TEXT_VERBOSITIES,
  validateEngineeringExperimentManifest,
  validateModelProfileCatalog,
  validateRuntimeModelEvidence,
} from "./model-profiles.mjs";
import { assertPersistenceSafe } from "../feedback/privacy.mjs";
import { QUALITY_LIMITS } from "./constants.mjs";
import {
  assertArray,
  assertBoolean,
  assertFingerprint,
  assertInteger,
  assertIso,
  assertString,
  assertStringArray,
  canonicalJson,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

export const QUALITY_ACCEPTANCE_DECISIONS = Object.freeze(["accepted", "rejected", "inconclusive"]);
export const QUALITY_ACCEPTANCE_PROFILE_ROLES = Object.freeze(["baseline", "candidate"]);
export const QUALITY_ACCEPTANCE_SUITES = Object.freeze(["development", "held_out", "canary"]);
export const QUALITY_ACCEPTANCE_GATE_STATUSES = Object.freeze([
  "passed",
  "failed",
  "inconclusive",
  "not_applicable",
]);
export const QUALITY_ACCEPTANCE_HARD_GATES = Object.freeze([
  "evidence_integrity",
  "required_pairs",
  "profile_identity",
  "permission_surface",
  "runtime_model_evidence",
  "quality_evidence",
  "quality_thresholds",
  "targets",
  "protected_failure_families",
  "canary_regressions",
  "held_out_regressions",
  "cost_ceiling",
  "duration_ceiling",
  "token_ceiling",
]);

export const QUALITY_ACCEPTANCE_PRODUCERS = Object.freeze({
  liveReport: "opencode-harness/live-evaluation-v2",
  qualityOutcomes: "opencode-harness/quality-outcomes-v1",
});

const FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/;
const REASON_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/;
const PRODUCER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;
const PAIR_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}#[1-9]\d*$/;

const LEGACY_RESULT_KEYS = Object.freeze([
  "scenario_id",
  "repetition",
  "profile_role",
  "repository_fingerprint",
  "profile_fingerprint",
  "operational_run_id",
  "scenario_fingerprint",
  "status",
  "adapter_classification",
  "setup_results",
  "visible_results",
  "hidden_results",
  "visible_pass_rate",
  "hidden_pass_rate",
  "defect_escape_rate",
  "duration_ms",
  "cost",
  "model",
  "tool",
  "incomplete_evidence",
]);

const V2_RESULT_KEYS = Object.freeze([
  ...LEGACY_RESULT_KEYS,
  "experiment_id",
  "experiment_fingerprint",
  "comparison_id",
  "variant_id",
  "harness_role",
  "host_profile_id",
  "model_profile_id",
  "model_profile_fingerprint",
  "runtime_model_evidence_fingerprint",
  "runtime_execution_fingerprint",
  "permission_snapshot_fingerprint",
  "permission_profile_fingerprint",
  "prompt_profile_id",
  "prompt_profile_fingerprint",
  "token_usage",
  "quality_attestation",
  "quality_bundle_fingerprint",
  "quality_outcomes",
]);

const QUALITY_OUTCOME_KEYS = Object.freeze([
  "producer_id",
  "experiment_id",
  "comparison_id",
  "variant_id",
  "harness_role",
  "scenario_id",
  "repetition",
  "profile_role",
  "operational_run_id",
  "complete",
  "architecture_policy_violations",
  "invariant_violations",
  "unverified_critical_invariants",
  "incomplete_dossier",
  "pre_edit_gate_violations",
  "unresolved_affected_path_gaps",
  "edge_case_verification_rate",
  "failure_mode_verification_rate",
  "test_quality_failures",
  "permission_widening",
  "introduced_regressions",
  "hidden_edge_case_failures",
  "integrated_verification_complete",
  "incomplete_evidence",
  "fingerprint",
]);

const QUALITY_REQUIREMENT_KEYS = Object.freeze([
  "require_complete_attestation",
  "require_complete_quality_outcomes",
  "require_integrated_verification",
  "maximum_architecture_policy_violations",
  "maximum_invariant_violations",
  "maximum_unverified_critical_invariants",
  "maximum_incomplete_dossiers",
  "maximum_pre_edit_gate_violations",
  "maximum_unresolved_affected_path_gaps",
  "minimum_edge_case_verification_rate",
  "minimum_failure_mode_verification_rate",
  "maximum_test_quality_failures",
  "maximum_permission_widening",
  "maximum_introduced_regressions",
  "maximum_hidden_edge_case_failures",
]);

const PROFILE_IDENTITY_KEYS = Object.freeze([
  "profile_fingerprint",
  "model_profile_id",
  "model_profile_fingerprint",
  "model_id",
  "reasoning_effort",
  "text_verbosity",
  "mode",
  "prompt_profile_id",
  "prompt_profile_fingerprint",
]);
const CANONICAL_PROFILE_IDENTITY_KEYS = Object.freeze([
  ...PROFILE_IDENTITY_KEYS,
  "required_capability_ids",
]);

const OBSERVED_IDENTITY_KEYS = Object.freeze([
  "repository_fingerprint",
  "host_profile_id",
  ...PROFILE_IDENTITY_KEYS,
  "runtime_model_evidence_fingerprint",
  "runtime_execution_fingerprint",
  "permission_snapshot_fingerprint",
  "permission_profile_fingerprint",
]);

const METRIC_KEYS = Object.freeze([
  "task_success_rate",
  "visible_pass_rate",
  "hidden_pass_rate",
  "defect_escape_rate",
]);

function fail(code, message) {
  throw new ContractError(code, message);
}

function frozenReportClone(value) {
  const serialized = canonicalJson(value);
  if (Buffer.byteLength(serialized, "utf8") > QUALITY_LIMITS.bundleBytes) {
    fail("QUALITY_ACCEPTANCE_REPORT_BYTES", `quality live report exceeds ${QUALITY_LIMITS.bundleBytes} UTF-8 bytes`);
  }
  const clone = JSON.parse(serialized);
  assertPersistenceSafe(clone, { label: "quality live report", maxDepth: QUALITY_LIMITS.objectDepth });
  const freeze = (entry) => {
    if (entry && typeof entry === "object") {
      Object.values(entry).forEach(freeze);
      Object.freeze(entry);
    }
    return entry;
  };
  return freeze(clone);
}

function frozenDecisionClone(value) {
  const serialized = canonicalJson(value);
  if (Buffer.byteLength(serialized, "utf8") > QUALITY_LIMITS.bundleBytes) {
    fail(
      "QUALITY_ACCEPTANCE_DECISION_BYTES",
      `quality acceptance decision exceeds ${QUALITY_LIMITS.bundleBytes} UTF-8 bytes`,
    );
  }
  const clone = JSON.parse(serialized);
  assertPersistenceSafe(clone, { label: "quality acceptance decision", maxDepth: QUALITY_LIMITS.objectDepth });
  const freeze = (entry) => {
    if (entry && typeof entry === "object") {
      Object.values(entry).forEach(freeze);
      Object.freeze(entry);
    }
    return entry;
  };
  return freeze(clone);
}

function assertRate(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    fail("QUALITY_ACCEPTANCE_RATE", `${label} must be a finite number between 0 and 1`);
  }
  return value;
}

function assertDelta(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < -1 || value > 1) {
    fail("QUALITY_ACCEPTANCE_DELTA", `${label} must be a finite number between -1 and 1`);
  }
  return value;
}

function assertNonNegativeNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("QUALITY_ACCEPTANCE_NUMBER", `${label} must be a finite non-negative number`);
  }
  return value;
}

function validateReasonCodes(value, label, { min = 0 } = {}) {
  assertStringArray(value, label, { min, max: 128, maxBytes: 128 });
  value.forEach((entry, index) => {
    if (!REASON_CODE_PATTERN.test(entry)) {
      fail("QUALITY_ACCEPTANCE_REASON_CODE", `${label}[${index}] must be a stable uppercase reason code`);
    }
  });
  return value;
}

function validateTokenUsage(value, label) {
  const keys = ["available", "input_tokens", "output_tokens", "total_tokens"];
  exact(value, keys, keys, label);
  assertBoolean(value.available, `${label}.available`);
  if (!value.available) {
    if (value.input_tokens !== null || value.output_tokens !== null || value.total_tokens !== null) {
      fail("QUALITY_ACCEPTANCE_TOKEN_UNAVAILABLE", `${label} unavailable values must be null`);
    }
    return value;
  }
  for (const key of ["input_tokens", "output_tokens", "total_tokens"]) {
    assertInteger(value[key], `${label}.${key}`);
  }
  if (value.total_tokens !== value.input_tokens + value.output_tokens) {
    fail("QUALITY_ACCEPTANCE_TOKEN_TOTAL", `${label}.total_tokens must equal input_tokens + output_tokens`);
  }
  return value;
}

function outcomeFingerprintInput(outcome) {
  const body = { ...outcome };
  delete body.fingerprint;
  return body;
}

export function qualityOutcomesFingerprint(outcome) {
  return fingerprint(outcomeFingerprintInput(outcome));
}

export function validateQualityOutcomes(value, label = "quality outcomes") {
  exact(value, QUALITY_OUTCOME_KEYS, QUALITY_OUTCOME_KEYS, label);
  assertString(value.producer_id, `${label}.producer_id`, { maxBytes: 256 });
  if (!PRODUCER_PATTERN.test(value.producer_id)) {
    fail("QUALITY_ACCEPTANCE_PRODUCER", `${label}.producer_id is not a valid producer identity`);
  }
  assertSafeId(value.experiment_id, `${label}.experiment_id`);
  assertSafeId(value.comparison_id, `${label}.comparison_id`);
  assertSafeId(value.variant_id, `${label}.variant_id`);
  assertEnum(value.harness_role, HARNESS_MODEL_PROFILE_ROLES, `${label}.harness_role`);
  assertSafeId(value.scenario_id, `${label}.scenario_id`);
  assertInteger(value.repetition, `${label}.repetition`, { min: 1 });
  assertEnum(value.profile_role, QUALITY_ACCEPTANCE_PROFILE_ROLES, `${label}.profile_role`);
  assertSafeId(value.operational_run_id, `${label}.operational_run_id`);
  assertBoolean(value.complete, `${label}.complete`);
  for (const key of [
    "architecture_policy_violations",
    "invariant_violations",
    "unverified_critical_invariants",
    "pre_edit_gate_violations",
    "unresolved_affected_path_gaps",
    "test_quality_failures",
    "permission_widening",
    "introduced_regressions",
    "hidden_edge_case_failures",
  ]) {
    assertInteger(value[key], `${label}.${key}`);
  }
  assertBoolean(value.incomplete_dossier, `${label}.incomplete_dossier`);
  assertRate(value.edge_case_verification_rate, `${label}.edge_case_verification_rate`);
  assertRate(value.failure_mode_verification_rate, `${label}.failure_mode_verification_rate`);
  assertBoolean(value.integrated_verification_complete, `${label}.integrated_verification_complete`);
  validateReasonCodes(value.incomplete_evidence, `${label}.incomplete_evidence`);
  if (value.complete === (value.incomplete_evidence.length > 0)) {
    fail(
      "QUALITY_ACCEPTANCE_OUTCOME_COMPLETENESS",
      `${label} complete status and incomplete_evidence are inconsistent`,
    );
  }
  assertFingerprint(value.fingerprint, `${label}.fingerprint`);
  if (!fingerprintsEqual(value.fingerprint, qualityOutcomesFingerprint(value))) {
    fail("QUALITY_ACCEPTANCE_OUTCOME_FINGERPRINT", `${label}.fingerprint does not match its content`);
  }
  return value;
}

export function createQualityOutcomes(input) {
  const inputKeys = QUALITY_OUTCOME_KEYS.filter((key) => key !== "fingerprint");
  exact(input, inputKeys, inputKeys, "quality outcomes input");
  const outcome = { ...input, fingerprint: fingerprint(input) };
  validateQualityOutcomes(outcome);
  return deepFrozenClone(outcome, "quality outcomes");
}

export function qualityBundleFingerprint(attestation, outcomes) {
  if (attestation !== null) validateQualityAttestation(attestation);
  validateQualityOutcomes(outcomes);
  return fingerprint({
    quality_attestation_fingerprint: attestation?.fingerprint ?? null,
    quality_outcomes_fingerprint: outcomes.fingerprint,
  });
}

function projectLegacyResult(result) {
  return Object.fromEntries(LEGACY_RESULT_KEYS.map((key) => [key, result[key]]));
}

function bindQualityResult(result, index) {
  const label = `report.results[${index}]`;
  exact(result, V2_RESULT_KEYS, V2_RESULT_KEYS, label);
  assertSafeId(result.experiment_id, `${label}.experiment_id`);
  assertFingerprint(result.experiment_fingerprint, `${label}.experiment_fingerprint`);
  assertSafeId(result.comparison_id, `${label}.comparison_id`);
  assertSafeId(result.variant_id, `${label}.variant_id`);
  assertEnum(result.harness_role, HARNESS_MODEL_PROFILE_ROLES, `${label}.harness_role`);
  assertSafeId(result.host_profile_id, `${label}.host_profile_id`);
  assertSafeId(result.model_profile_id, `${label}.model_profile_id`);
  assertFingerprint(result.model_profile_fingerprint, `${label}.model_profile_fingerprint`);
  assertFingerprint(result.runtime_model_evidence_fingerprint, `${label}.runtime_model_evidence_fingerprint`);
  assertFingerprint(result.runtime_execution_fingerprint, `${label}.runtime_execution_fingerprint`, { nullable: true });
  assertFingerprint(result.permission_snapshot_fingerprint, `${label}.permission_snapshot_fingerprint`);
  assertFingerprint(result.permission_profile_fingerprint, `${label}.permission_profile_fingerprint`);
  assertSafeId(result.prompt_profile_id, `${label}.prompt_profile_id`);
  assertFingerprint(result.prompt_profile_fingerprint, `${label}.prompt_profile_fingerprint`);
  validateTokenUsage(result.token_usage, `${label}.token_usage`);
  if (result.quality_attestation !== null) validateQualityAttestation(result.quality_attestation);
  validateQualityOutcomes(result.quality_outcomes, `${label}.quality_outcomes`);
  assertFingerprint(result.quality_bundle_fingerprint, `${label}.quality_bundle_fingerprint`);

  const tuple = [
    "experiment_id",
    "comparison_id",
    "variant_id",
    "harness_role",
    "scenario_id",
    "repetition",
    "profile_role",
    "operational_run_id",
  ];
  for (const key of tuple) {
    if (result.quality_outcomes[key] !== result[key]) {
      fail("QUALITY_ACCEPTANCE_OUTCOME_BINDING", `${label}.quality_outcomes.${key} does not bind the result`);
    }
  }
  const attestation = result.quality_attestation;
  if (attestation !== null) {
    if (attestation.run_id !== result.operational_run_id) {
      fail("QUALITY_ACCEPTANCE_ATTESTATION_RUN", `${label}.quality_attestation.run_id does not bind the result run`);
    }
    if (attestation.runtime_execution_fingerprint !== result.runtime_execution_fingerprint) {
      fail(
        "QUALITY_ACCEPTANCE_ATTESTATION_RUNTIME_EXECUTION",
        `${label}.quality_attestation.runtime_execution_fingerprint does not bind the result`,
      );
    }
    for (const key of [
      "model_profile_id",
      "model_profile_fingerprint",
      "prompt_profile_id",
      "prompt_profile_fingerprint",
    ]) {
      if (attestation[key] !== result[key]) {
        fail("QUALITY_ACCEPTANCE_ATTESTATION_PROFILE", `${label}.quality_attestation.${key} does not bind the result`);
      }
    }
    if (
      result.quality_outcomes.integrated_verification_complete
      && attestation.integrated_verification_sequence === null
    ) {
      fail(
        "QUALITY_ACCEPTANCE_ATTESTATION_INTEGRATED_VERIFICATION",
        `${label} cannot claim complete integrated verification without a runner-attested sequence`,
      );
    }
  } else if (
    result.quality_outcomes.complete
    && !result.quality_outcomes.incomplete_dossier
    && result.quality_outcomes.pre_edit_gate_violations === 0
    && result.quality_outcomes.integrated_verification_complete
  ) {
    fail(
      "QUALITY_ACCEPTANCE_ATTESTATION_MISSING_REASON",
      `${label}.quality_attestation may be null only for explicit incomplete or unattestable failure evidence`,
    );
  }
  const expectedBundle = qualityBundleFingerprint(attestation, result.quality_outcomes);
  if (!fingerprintsEqual(result.quality_bundle_fingerprint, expectedBundle)) {
    fail("QUALITY_ACCEPTANCE_BUNDLE_FINGERPRINT", `${label}.quality_bundle_fingerprint does not bind attestation and outcomes`);
  }
  return result;
}

export function qualityLiveReportFingerprint(report) {
  validateQualityLiveReport(report);
  return fingerprint(report);
}

export function validateQualityLiveReport(report) {
  const reportKeys = ["schema_version", "evaluation_run_id", "created_at", "provenance", "results"];
  exact(report, reportKeys, reportKeys, "report");
  if (report.schema_version !== REPORT_SCHEMA_VERSION) {
    fail("QUALITY_ACCEPTANCE_REPORT_SCHEMA", `report.schema_version must be ${REPORT_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(report.results) || report.results.length === 0 || report.results.length > 2048) {
    fail("QUALITY_ACCEPTANCE_REPORT_RESULTS", "report.results must contain 1..2048 results");
  }
  const runIds = new Set();
  const pairKeys = new Set();
  for (const [index, result] of report.results.entries()) {
    validateLegacyLiveReport({
      ...report,
      schema_version: LEGACY_REPORT_SCHEMA_VERSION,
      results: [projectLegacyResult(result)],
    });
    bindQualityResult(result, index);
    const pairKey = `${result.profile_role}:${result.comparison_id}`;
    if (pairKeys.has(pairKey)) {
      fail("QUALITY_ACCEPTANCE_DUPLICATE_PAIR", `report contains duplicate result ${pairKey}`);
    }
    pairKeys.add(pairKey);
    if (runIds.has(result.operational_run_id)) {
      fail("QUALITY_ACCEPTANCE_DUPLICATE_RUN", `report reuses operational_run_id ${result.operational_run_id}`);
    }
    runIds.add(result.operational_run_id);
  }
  return report;
}

export function createQualityLiveReport(input) {
  const inputKeys = ["evaluation_run_id", "created_at", "provenance", "results"];
  exact(input, inputKeys, inputKeys, "quality live report input");
  const report = { schema_version: REPORT_SCHEMA_VERSION, ...input };
  validateQualityLiveReport(report);
  return frozenReportClone(report);
}

function validateSuccessThreshold(value, label) {
  const keys = ["minimum_candidate", "minimum_delta"];
  exact(value, keys, keys, label);
  assertRate(value.minimum_candidate, `${label}.minimum_candidate`);
  assertDelta(value.minimum_delta, `${label}.minimum_delta`);
  return value;
}

function validateDefectThreshold(value, label) {
  const keys = ["maximum_candidate", "maximum_delta"];
  exact(value, keys, keys, label);
  assertRate(value.maximum_candidate, `${label}.maximum_candidate`);
  assertDelta(value.maximum_delta, `${label}.maximum_delta`);
  return value;
}

function validateTargetThresholds(value, label) {
  exact(value, METRIC_KEYS, METRIC_KEYS, label);
  validateSuccessThreshold(value.task_success_rate, `${label}.task_success_rate`);
  validateSuccessThreshold(value.visible_pass_rate, `${label}.visible_pass_rate`);
  validateSuccessThreshold(value.hidden_pass_rate, `${label}.hidden_pass_rate`);
  validateDefectThreshold(value.defect_escape_rate, `${label}.defect_escape_rate`);
  return value;
}

function validateProtectedThresholds(value, label) {
  const keys = [
    "task_success_rate_minimum_delta",
    "visible_pass_rate_minimum_delta",
    "hidden_pass_rate_minimum_delta",
    "defect_escape_rate_maximum_delta",
  ];
  exact(value, keys, keys, label);
  keys.forEach((key) => assertDelta(value[key], `${label}.${key}`));
  return value;
}

function validateQualityRequirements(value) {
  exact(value, QUALITY_REQUIREMENT_KEYS, QUALITY_REQUIREMENT_KEYS, "policy.quality_requirements");
  for (const key of [
    "require_complete_attestation",
    "require_complete_quality_outcomes",
    "require_integrated_verification",
  ]) {
    assertBoolean(value[key], `policy.quality_requirements.${key}`);
  }
  for (const key of QUALITY_REQUIREMENT_KEYS.filter((entry) => entry.startsWith("maximum_"))) {
    assertInteger(value[key], `policy.quality_requirements.${key}`);
  }
  assertRate(value.minimum_edge_case_verification_rate, "policy.quality_requirements.minimum_edge_case_verification_rate");
  assertRate(value.minimum_failure_mode_verification_rate, "policy.quality_requirements.minimum_failure_mode_verification_rate");
  return value;
}

function validateProfileIdentity(value, label) {
  exact(value, PROFILE_IDENTITY_KEYS, PROFILE_IDENTITY_KEYS, label);
  assertFingerprint(value.profile_fingerprint, `${label}.profile_fingerprint`);
  assertSafeId(value.model_profile_id, `${label}.model_profile_id`);
  assertFingerprint(value.model_profile_fingerprint, `${label}.model_profile_fingerprint`);
  assertString(value.model_id, `${label}.model_id`, { maxBytes: 128 });
  assertEnum(value.reasoning_effort, MODEL_REASONING_EFFORTS, `${label}.reasoning_effort`);
  assertEnum(value.text_verbosity, MODEL_TEXT_VERBOSITIES, `${label}.text_verbosity`);
  assertEnum(value.mode, MODEL_MODES, `${label}.mode`);
  assertSafeId(value.prompt_profile_id, `${label}.prompt_profile_id`);
  assertFingerprint(value.prompt_profile_fingerprint, `${label}.prompt_profile_fingerprint`);
  return value;
}

function validateCanonicalProfileIdentity(value, label) {
  exact(value, CANONICAL_PROFILE_IDENTITY_KEYS, CANONICAL_PROFILE_IDENTITY_KEYS, label);
  validateProfileIdentity(
    Object.fromEntries(PROFILE_IDENTITY_KEYS.map((key) => [key, value[key]])),
    label,
  );
  assertStringArray(value.required_capability_ids, `${label}.required_capability_ids`, { max: 16, maxBytes: 128 });
  return value;
}

function validateOptionalRatioCeiling(value, label, totalKey, { currency = false } = {}) {
  if (value === null) return value;
  const keys = ["maximum_ratio", totalKey, ...(currency ? ["currency"] : [])];
  exact(value, keys, keys, label);
  if (value.maximum_ratio !== null) assertNonNegativeNumber(value.maximum_ratio, `${label}.maximum_ratio`);
  if (value[totalKey] !== null) assertNonNegativeNumber(value[totalKey], `${label}.${totalKey}`);
  if (value.maximum_ratio === null && value[totalKey] === null) {
    fail("QUALITY_ACCEPTANCE_CEILING", `${label} must configure at least one ceiling`);
  }
  if (currency) {
    assertString(value.currency, `${label}.currency`, { maxBytes: 3 });
    if (!/^[A-Z]{3}$/.test(value.currency)) fail("QUALITY_ACCEPTANCE_CURRENCY", `${label}.currency must be ISO-style uppercase`);
  }
  return value;
}

export function qualityAcceptancePolicyFingerprint(policy) {
  validateQualityAcceptancePolicy(policy);
  return fingerprint(policy);
}

export function validateQualityAcceptancePolicy(policy) {
  const keys = [
    "schema_version",
    "policy_version",
    "required_suites",
    "targets",
    "protected_failure_families",
    "quality_requirements",
    "profile_requirements",
    "cost_ceiling",
    "duration_ceiling",
    "token_ceiling",
    "expected_producers",
  ];
  exact(policy, keys, keys, "policy");
  if (policy.schema_version !== ACCEPTANCE_POLICY_SCHEMA_VERSION) {
    fail(
      "QUALITY_ACCEPTANCE_POLICY_SCHEMA",
      `policy.schema_version must be ${ACCEPTANCE_POLICY_SCHEMA_VERSION}; v1 is compatibility-only evidence`,
    );
  }
  assertSafeId(policy.policy_version, "policy.policy_version");
  assertStringArray(policy.required_suites, "policy.required_suites", { min: 3, max: 3, maxBytes: 32 });
  if (
    [...policy.required_suites].sort().join("|")
    !== [...QUALITY_ACCEPTANCE_SUITES].sort().join("|")
  ) {
    fail("QUALITY_ACCEPTANCE_REQUIRED_SUITES", "policy.required_suites must contain development, held_out, and canary");
  }
  assertArray(policy.targets, "policy.targets", {
    min: 1,
    max: 64,
    item: (target, label) => {
      const targetKeys = ["target_id", "failure_family", "thresholds"];
      exact(target, targetKeys, targetKeys, label);
      assertSafeId(target.target_id, `${label}.target_id`);
      assertSafeId(target.failure_family, `${label}.failure_family`);
      validateTargetThresholds(target.thresholds, `${label}.thresholds`);
    },
  });
  if (new Set(policy.targets.map((entry) => entry.target_id)).size !== policy.targets.length) {
    fail("QUALITY_ACCEPTANCE_DUPLICATE_TARGET", "policy.targets contains duplicate target_id values");
  }
  if (new Set(policy.targets.map((entry) => entry.failure_family)).size !== policy.targets.length) {
    fail("QUALITY_ACCEPTANCE_DUPLICATE_TARGET", "policy.targets contains duplicate failure families");
  }
  assertArray(policy.protected_failure_families, "policy.protected_failure_families", {
    min: 1,
    max: 128,
    item: (entry, label) => {
      const protectedKeys = ["failure_family", "criticality", "thresholds"];
      exact(entry, protectedKeys, protectedKeys, label);
      assertSafeId(entry.failure_family, `${label}.failure_family`);
      assertEnum(entry.criticality, ["high", "critical"], `${label}.criticality`);
      validateProtectedThresholds(entry.thresholds, `${label}.thresholds`);
    },
  });
  if (
    new Set(policy.protected_failure_families.map((entry) => entry.failure_family)).size
    !== policy.protected_failure_families.length
  ) {
    fail("QUALITY_ACCEPTANCE_DUPLICATE_PROTECTED", "policy.protected_failure_families contains duplicates");
  }
  validateQualityRequirements(policy.quality_requirements);
  const profileKeys = [
    "experiment_id",
    "experiment_fingerprint",
    "pair_universe_fingerprint",
    "require_distinct_model_profiles_within_pair",
    "require_installed_runtime_evidence",
  ];
  exact(policy.profile_requirements, profileKeys, profileKeys, "policy.profile_requirements");
  assertSafeId(policy.profile_requirements.experiment_id, "policy.profile_requirements.experiment_id");
  assertFingerprint(
    policy.profile_requirements.experiment_fingerprint,
    "policy.profile_requirements.experiment_fingerprint",
  );
  assertFingerprint(
    policy.profile_requirements.pair_universe_fingerprint,
    "policy.profile_requirements.pair_universe_fingerprint",
  );
  assertBoolean(
    policy.profile_requirements.require_distinct_model_profiles_within_pair,
    "policy.profile_requirements.require_distinct_model_profiles_within_pair",
  );
  assertBoolean(
    policy.profile_requirements.require_installed_runtime_evidence,
    "policy.profile_requirements.require_installed_runtime_evidence",
  );
  validateOptionalRatioCeiling(policy.cost_ceiling, "policy.cost_ceiling", "maximum_candidate_total", { currency: true });
  validateOptionalRatioCeiling(policy.duration_ceiling, "policy.duration_ceiling", "maximum_candidate_total_ms");
  validateOptionalRatioCeiling(policy.token_ceiling, "policy.token_ceiling", "maximum_candidate_total");
  const producerKeys = ["live_report", "quality_outcomes"];
  exact(policy.expected_producers, producerKeys, producerKeys, "policy.expected_producers");
  for (const key of producerKeys) {
    assertString(policy.expected_producers[key], `policy.expected_producers.${key}`, { maxBytes: 256 });
    if (!PRODUCER_PATTERN.test(policy.expected_producers[key])) {
      fail("QUALITY_ACCEPTANCE_PRODUCER", `policy.expected_producers.${key} is invalid`);
    }
  }
  return policy;
}

export function createQualityAcceptancePolicy(input) {
  const inputKeys = [
    "policy_version",
    "required_suites",
    "targets",
    "protected_failure_families",
    "quality_requirements",
    "profile_requirements",
    "cost_ceiling",
    "duration_ceiling",
    "token_ceiling",
    "expected_producers",
  ];
  exact(input, inputKeys, inputKeys, "quality acceptance policy input");
  const policy = { schema_version: ACCEPTANCE_POLICY_SCHEMA_VERSION, ...input };
  validateQualityAcceptancePolicy(policy);
  return deepFrozenClone(policy, "quality acceptance policy");
}

export function validateCanonicalAcceptanceScenarios(value) {
  assertArray(value, "canonical scenarios", {
    min: 1,
    max: 512,
    item: (entry, label) => {
      const keys = ["scenario_id", "failure_family", "suite", "repetitions", "scenario_fingerprint"];
      exact(entry, keys, keys, label);
      assertSafeId(entry.scenario_id, `${label}.scenario_id`);
      assertSafeId(entry.failure_family, `${label}.failure_family`);
      assertEnum(entry.suite, QUALITY_ACCEPTANCE_SUITES, `${label}.suite`);
      assertInteger(entry.repetitions, `${label}.repetitions`, { min: 1, max: 100 });
      assertFingerprint(entry.scenario_fingerprint, `${label}.scenario_fingerprint`);
    },
  });
  const ids = value.map((entry) => entry.scenario_id);
  if (new Set(ids).size !== ids.length) {
    fail("QUALITY_ACCEPTANCE_DUPLICATE_SCENARIO", "canonical scenarios contains duplicate scenario_id values");
  }
  return value;
}

export function canonicalAcceptanceCorpusFingerprint(value) {
  validateCanonicalAcceptanceScenarios(value);
  return fingerprint([...value].sort((a, b) => a.scenario_id.localeCompare(b.scenario_id)));
}

function validatePromptProfileBinding(value, label) {
  const keys = ["prompt_profile_id", "prompt_profile_fingerprint"];
  exact(value, keys, keys, label);
  assertSafeId(value.prompt_profile_id, `${label}.prompt_profile_id`);
  assertFingerprint(value.prompt_profile_fingerprint, `${label}.prompt_profile_fingerprint`);
  return value;
}

export function validateCanonicalExperimentBindings(value) {
  assertArray(value, "canonical experiment bindings", {
    min: 1,
    max: 1024,
    item: (entry, label) => {
      const keys = [
        "experiment_id",
        "experiment_fingerprint",
        "catalog_id",
        "catalog_fingerprint",
        "comparison_id",
        "scenario_id",
        "repetition",
        "variant_id",
        "harness_role",
        "baseline",
        "candidate",
      ];
      exact(entry, keys, keys, label);
      assertSafeId(entry.experiment_id, `${label}.experiment_id`);
      assertFingerprint(entry.experiment_fingerprint, `${label}.experiment_fingerprint`);
      assertSafeId(entry.catalog_id, `${label}.catalog_id`);
      assertFingerprint(entry.catalog_fingerprint, `${label}.catalog_fingerprint`);
      assertSafeId(entry.comparison_id, `${label}.comparison_id`);
      assertSafeId(entry.scenario_id, `${label}.scenario_id`);
      assertInteger(entry.repetition, `${label}.repetition`, { min: 1, max: 100 });
      assertSafeId(entry.variant_id, `${label}.variant_id`);
      assertEnum(entry.harness_role, HARNESS_MODEL_PROFILE_ROLES, `${label}.harness_role`);
      validateCanonicalProfileIdentity(entry.baseline, `${label}.baseline`);
      validateCanonicalProfileIdentity(entry.candidate, `${label}.candidate`);
    },
  });
  const comparisonIds = value.map((entry) => entry.comparison_id);
  if (new Set(comparisonIds).size !== comparisonIds.length) {
    fail("QUALITY_ACCEPTANCE_DUPLICATE_COMPARISON", "canonical experiment bindings contains duplicate comparison IDs");
  }
  const experiments = new Set(value.map((entry) => `${entry.experiment_id}:${entry.experiment_fingerprint}:${entry.catalog_id}:${entry.catalog_fingerprint}`));
  if (experiments.size !== 1) {
    fail("QUALITY_ACCEPTANCE_EXPERIMENT_DRIFT", "canonical experiment bindings must describe one immutable experiment");
  }
  return value;
}

export function createCanonicalExperimentBindings({ experiment, catalog, promptProfiles }) {
  validateModelProfileCatalog(catalog);
  validateEngineeringExperimentManifest(experiment, { catalog });
  exact(promptProfiles, QUALITY_ACCEPTANCE_PROFILE_ROLES, QUALITY_ACCEPTANCE_PROFILE_ROLES, "promptProfiles");
  QUALITY_ACCEPTANCE_PROFILE_ROLES.forEach((role) => (
    validatePromptProfileBinding(promptProfiles[role], `promptProfiles.${role}`)
  ));
  const profiles = new Map(catalog.profiles.map((profile) => [profile.profile_id, profile]));
  const bindings = experiment.comparisons.map((comparison) => {
    const roleIdentity = (role) => {
      const invocation = comparison[`${role}_invocation`];
      const profile = profiles.get(invocation.profile_id);
      if (!profile) {
        fail("QUALITY_ACCEPTANCE_EXPERIMENT_PROFILE", `${comparison.comparison_id} references missing ${role} profile`);
      }
      return {
        profile_fingerprint: fingerprint({
          experiment_id: experiment.experiment_id,
          comparison_id: comparison.comparison_id,
          profile_role: role,
          invocation,
          prompt_profile: promptProfiles[role],
        }),
        model_profile_id: invocation.profile_id,
        model_profile_fingerprint: fingerprint(profile),
        model_id: invocation.model_id,
        reasoning_effort: invocation.reasoning_effort,
        text_verbosity: invocation.text_verbosity,
        mode: invocation.mode,
        required_capability_ids: [...new Set([
          ...profile.capabilities
            .filter((entry) => entry.classification === "required")
            .map((entry) => entry.capability_id),
          ...(invocation.reasoning_effort === "xhigh" ? ["reasoning_effort_xhigh"] : []),
          ...(invocation.reasoning_effort === "max" ? ["reasoning_effort_max"] : []),
          ...(invocation.mode === "pro" ? ["mode_pro"] : []),
        ])].sort(),
        ...promptProfiles[role],
      };
    };
    return {
      experiment_id: experiment.experiment_id,
      experiment_fingerprint: experiment.content_fingerprint,
      catalog_id: catalog.catalog_id,
      catalog_fingerprint: catalog.content_fingerprint,
      comparison_id: comparison.comparison_id,
      scenario_id: comparison.scenario_id,
      repetition: comparison.repetition,
      variant_id: comparison.variant_id,
      harness_role: comparison.role,
      baseline: roleIdentity("baseline"),
      candidate: roleIdentity("candidate"),
    };
  });
  validateCanonicalExperimentBindings(bindings);
  return deepFrozenClone(bindings, "canonical experiment bindings");
}

export function qualityAcceptancePairUniverse(value) {
  validateCanonicalExperimentBindings(value);
  return value.map((entry) => entry.comparison_id).sort();
}

export function qualityAcceptancePairUniverseFingerprint(value) {
  validateCanonicalExperimentBindings(value);
  return fingerprint([...value].sort((left, right) => left.comparison_id.localeCompare(right.comparison_id)));
}

function validateGate(value, label) {
  const keys = ["status", "reason_codes"];
  exact(value, keys, keys, label);
  assertEnum(value.status, QUALITY_ACCEPTANCE_GATE_STATUSES, `${label}.status`);
  validateReasonCodes(value.reason_codes, `${label}.reason_codes`);
  if ((value.status === "passed" || value.status === "not_applicable") && value.reason_codes.length > 0) {
    fail("QUALITY_ACCEPTANCE_GATE_REASON", `${label} passed/not_applicable gate cannot contain reason codes`);
  }
  if ((value.status === "failed" || value.status === "inconclusive") && value.reason_codes.length === 0) {
    fail("QUALITY_ACCEPTANCE_GATE_REASON", `${label} failed/inconclusive gate requires reason codes`);
  }
  return value;
}

function validateMetricSnapshot(value, label) {
  const keys = ["available", "baseline", "candidate", "delta"];
  exact(value, keys, keys, label);
  assertBoolean(value.available, `${label}.available`);
  if (!value.available) {
    if (value.baseline !== null || value.candidate !== null || value.delta !== null) {
      fail("QUALITY_ACCEPTANCE_METRIC_UNAVAILABLE", `${label} unavailable values must be null`);
    }
    return value;
  }
  assertRate(value.baseline, `${label}.baseline`);
  assertRate(value.candidate, `${label}.candidate`);
  assertDelta(value.delta, `${label}.delta`);
  if (Math.abs((value.candidate - value.baseline) - value.delta) > Number.EPSILON * 4) {
    fail("QUALITY_ACCEPTANCE_METRIC_DELTA", `${label}.delta does not match baseline and candidate`);
  }
  return value;
}

function validateMetricSet(value, label) {
  exact(value, METRIC_KEYS, METRIC_KEYS, label);
  METRIC_KEYS.forEach((key) => validateMetricSnapshot(value[key], `${label}.${key}`));
  return value;
}

function validateObservedIdentity(value, label) {
  exact(value, OBSERVED_IDENTITY_KEYS, OBSERVED_IDENTITY_KEYS, label);
  assertFingerprint(value.repository_fingerprint, `${label}.repository_fingerprint`);
  assertSafeId(value.host_profile_id, `${label}.host_profile_id`);
  assertFingerprint(value.profile_fingerprint, `${label}.profile_fingerprint`);
  validateProfileIdentity(
    Object.fromEntries(PROFILE_IDENTITY_KEYS.map((key) => [key, value[key]])),
    label,
  );
  assertFingerprint(value.runtime_model_evidence_fingerprint, `${label}.runtime_model_evidence_fingerprint`);
  assertFingerprint(value.runtime_execution_fingerprint, `${label}.runtime_execution_fingerprint`, { nullable: true });
  assertFingerprint(value.permission_snapshot_fingerprint, `${label}.permission_snapshot_fingerprint`);
  assertFingerprint(value.permission_profile_fingerprint, `${label}.permission_profile_fingerprint`);
  return value;
}

function decisionFingerprintInput(decision) {
  const body = { ...decision };
  delete body.content_fingerprint;
  return body;
}

export function qualityAcceptanceDecisionFingerprint(decision) {
  return fingerprint(decisionFingerprintInput(decision));
}

export function sealQualityAcceptanceDecision(input) {
  const decision = { ...input, content_fingerprint: fingerprint(input) };
  validateQualityAcceptanceDecision(decision);
  return frozenDecisionClone(decision);
}

export const createQualityAcceptanceDecision = sealQualityAcceptanceDecision;

export function validateQualityAcceptanceDecision(decision) {
  const keys = [
    "schema_version",
    "decision_id",
    "policy_version",
    "policy_fingerprint",
    "scenario_corpus_fingerprint",
    "pair_universe_fingerprint",
    "dossier_schema_versions",
    "input_report_fingerprints",
    "identities",
    "paired_bindings",
    "hard_gates",
    "per_target_metrics",
    "per_protected_family_metrics",
    "quality_metrics",
    "resource_metrics",
    "decision",
    "reason_codes",
    "missing_evidence",
    "created_at",
    "content_fingerprint",
  ];
  exact(decision, keys, keys, "decision");
  if (decision.schema_version !== DECISION_SCHEMA_VERSION) {
    fail("QUALITY_ACCEPTANCE_DECISION_SCHEMA", `decision.schema_version must be ${DECISION_SCHEMA_VERSION}`);
  }
  assertSafeId(decision.decision_id, "decision.decision_id");
  assertSafeId(decision.policy_version, "decision.policy_version");
  assertFingerprint(decision.policy_fingerprint, "decision.policy_fingerprint");
  assertFingerprint(decision.scenario_corpus_fingerprint, "decision.scenario_corpus_fingerprint");
  assertFingerprint(decision.pair_universe_fingerprint, "decision.pair_universe_fingerprint");
  assertArray(decision.dossier_schema_versions, "decision.dossier_schema_versions", {
    min: 0,
    max: 16,
    item: (entry, label) => assertInteger(entry, label, { min: 1 }),
  });
  if (new Set(decision.dossier_schema_versions).size !== decision.dossier_schema_versions.length) {
    fail("QUALITY_ACCEPTANCE_DOSSIER_VERSION", "decision.dossier_schema_versions contains duplicates");
  }
  assertStringArray(decision.input_report_fingerprints, "decision.input_report_fingerprints", { min: 0, max: 512 });
  decision.input_report_fingerprints.forEach((entry, index) => assertFingerprint(entry, `decision.input_report_fingerprints[${index}]`));
  const identityKeys = [
    "baseline_acceptance_profile_id",
    "candidate_acceptance_profile_id",
    "experiment_id",
    "experiment_fingerprint",
    "repository_fingerprint",
  ];
  exact(decision.identities, identityKeys, identityKeys, "decision.identities");
  assertSafeId(decision.identities.baseline_acceptance_profile_id, "decision.identities.baseline_acceptance_profile_id");
  assertSafeId(decision.identities.candidate_acceptance_profile_id, "decision.identities.candidate_acceptance_profile_id");
  if (decision.identities.baseline_acceptance_profile_id === decision.identities.candidate_acceptance_profile_id) {
    fail("QUALITY_ACCEPTANCE_DECISION_IDENTITIES", "decision baseline and candidate acceptance profile IDs must differ");
  }
  assertSafeId(decision.identities.experiment_id, "decision.identities.experiment_id");
  assertFingerprint(decision.identities.experiment_fingerprint, "decision.identities.experiment_fingerprint");
  if (decision.identities.repository_fingerprint !== null) {
    assertFingerprint(decision.identities.repository_fingerprint, "decision.identities.repository_fingerprint");
  }

  assertArray(decision.paired_bindings, "decision.paired_bindings", {
    min: 0,
    max: 1024,
    item: (binding, label) => {
      const bindingKeys = [
        "experiment_id",
        "experiment_fingerprint",
        "comparison_id",
        "scenario_id",
        "repetition",
        "variant_id",
        "harness_role",
        "failure_family",
        "suite",
        "baseline_operational_run_id",
        "candidate_operational_run_id",
        "baseline_report_fingerprint",
        "candidate_report_fingerprint",
        "baseline_identity",
        "candidate_identity",
      ];
      exact(binding, bindingKeys, bindingKeys, label);
      assertSafeId(binding.experiment_id, `${label}.experiment_id`);
      assertFingerprint(binding.experiment_fingerprint, `${label}.experiment_fingerprint`);
      if (
        binding.experiment_id !== decision.identities.experiment_id
        || binding.experiment_fingerprint !== decision.identities.experiment_fingerprint
      ) {
        fail("QUALITY_ACCEPTANCE_DECISION_EXPERIMENT", `${label} does not bind the decision experiment`);
      }
      assertSafeId(binding.comparison_id, `${label}.comparison_id`);
      assertSafeId(binding.scenario_id, `${label}.scenario_id`);
      assertInteger(binding.repetition, `${label}.repetition`, { min: 1 });
      assertSafeId(binding.variant_id, `${label}.variant_id`);
      assertEnum(binding.harness_role, HARNESS_MODEL_PROFILE_ROLES, `${label}.harness_role`);
      assertSafeId(binding.failure_family, `${label}.failure_family`);
      assertEnum(binding.suite, QUALITY_ACCEPTANCE_SUITES, `${label}.suite`);
      assertSafeId(binding.baseline_operational_run_id, `${label}.baseline_operational_run_id`);
      assertSafeId(binding.candidate_operational_run_id, `${label}.candidate_operational_run_id`);
      assertFingerprint(binding.baseline_report_fingerprint, `${label}.baseline_report_fingerprint`);
      assertFingerprint(binding.candidate_report_fingerprint, `${label}.candidate_report_fingerprint`);
      validateObservedIdentity(binding.baseline_identity, `${label}.baseline_identity`);
      validateObservedIdentity(binding.candidate_identity, `${label}.candidate_identity`);
      if (binding.baseline_identity.repository_fingerprint !== binding.candidate_identity.repository_fingerprint) {
        fail("QUALITY_ACCEPTANCE_DECISION_PAIR_REPOSITORY", `${label} crosses repository snapshots`);
      }
      if (
        decision.identities.repository_fingerprint !== null
        && binding.baseline_identity.repository_fingerprint !== decision.identities.repository_fingerprint
      ) {
        fail("QUALITY_ACCEPTANCE_DECISION_REPOSITORY", `${label} does not bind the decision repository snapshot`);
      }
      if (binding.baseline_operational_run_id === binding.candidate_operational_run_id) {
        fail("QUALITY_ACCEPTANCE_DECISION_RUN_BINDING", `${label} reuses an operational run across roles`);
      }
    },
  });
  const pairKeys = decision.paired_bindings.map((entry) => entry.comparison_id);
  if (new Set(pairKeys).size !== pairKeys.length) {
    fail("QUALITY_ACCEPTANCE_DECISION_PAIR_BINDING", "decision.paired_bindings contains duplicates");
  }

  exact(decision.hard_gates, QUALITY_ACCEPTANCE_HARD_GATES, QUALITY_ACCEPTANCE_HARD_GATES, "decision.hard_gates");
  QUALITY_ACCEPTANCE_HARD_GATES.forEach((name) => validateGate(decision.hard_gates[name], `decision.hard_gates.${name}`));
  const pairedRepositoryFingerprints = new Set(
    decision.paired_bindings.map((entry) => entry.baseline_identity.repository_fingerprint),
  );
  if (
    decision.hard_gates.profile_identity.status === "passed"
    && decision.paired_bindings.some((entry) => (
      entry.baseline_identity.runtime_execution_fingerprint === null
      || entry.candidate_identity.runtime_execution_fingerprint === null
    ))
  ) {
    fail(
      "QUALITY_ACCEPTANCE_DECISION_RUNTIME_EXECUTION",
      "passed profile identity gate requires runtime execution evidence for every paired role",
    );
  }
  if (
    decision.identities.repository_fingerprint === null
    && decision.hard_gates.required_pairs.status === "passed"
    && pairedRepositoryFingerprints.size === 1
  ) {
    fail("QUALITY_ACCEPTANCE_DECISION_REPOSITORY", "decision omits an available canonical repository snapshot");
  }
  if (
    decision.identities.repository_fingerprint === null
    && decision.hard_gates.evidence_integrity.status === "passed"
  ) {
    fail("QUALITY_ACCEPTANCE_DECISION_REPOSITORY", "decision without a canonical repository snapshot must be inconclusive");
  }

  assertArray(decision.per_target_metrics, "decision.per_target_metrics", {
    min: 0,
    max: 64,
    item: (entry, label) => {
      const targetKeys = ["target_id", "failure_family", "metrics", "status", "reason_codes"];
      exact(entry, targetKeys, targetKeys, label);
      assertSafeId(entry.target_id, `${label}.target_id`);
      assertSafeId(entry.failure_family, `${label}.failure_family`);
      validateMetricSet(entry.metrics, `${label}.metrics`);
      assertEnum(entry.status, ["passed", "failed", "inconclusive"], `${label}.status`);
      validateReasonCodes(entry.reason_codes, `${label}.reason_codes`, { min: entry.status === "passed" ? 0 : 1 });
      if (entry.status === "passed" && entry.reason_codes.length > 0) {
        fail("QUALITY_ACCEPTANCE_TARGET_REASON", `${label} passed target cannot contain reason codes`);
      }
    },
  });
  if (new Set(decision.per_target_metrics.map((entry) => entry.target_id)).size !== decision.per_target_metrics.length) {
    fail("QUALITY_ACCEPTANCE_DECISION_TARGET", "decision.per_target_metrics contains duplicate target IDs");
  }
  assertArray(decision.per_protected_family_metrics, "decision.per_protected_family_metrics", {
    min: 0,
    max: 128,
    item: (entry, label) => {
      const protectedKeys = ["failure_family", "criticality", "metrics", "status", "reason_codes"];
      exact(entry, protectedKeys, protectedKeys, label);
      assertSafeId(entry.failure_family, `${label}.failure_family`);
      assertEnum(entry.criticality, ["high", "critical"], `${label}.criticality`);
      validateMetricSet(entry.metrics, `${label}.metrics`);
      assertEnum(entry.status, ["passed", "failed", "inconclusive"], `${label}.status`);
      validateReasonCodes(entry.reason_codes, `${label}.reason_codes`, { min: entry.status === "passed" ? 0 : 1 });
      if (entry.status === "passed" && entry.reason_codes.length > 0) {
        fail("QUALITY_ACCEPTANCE_PROTECTED_REASON", `${label} passed family cannot contain reason codes`);
      }
    },
  });
  if (
    new Set(decision.per_protected_family_metrics.map((entry) => entry.failure_family)).size
    !== decision.per_protected_family_metrics.length
  ) {
    fail("QUALITY_ACCEPTANCE_DECISION_PROTECTED", "decision.per_protected_family_metrics contains duplicates");
  }

  const qualityMetricKeys = [
    "candidate_result_count",
    "complete_attestation_count",
    "complete_quality_outcome_count",
    "architecture_policy_violations",
    "invariant_violations",
    "unverified_critical_invariants",
    "incomplete_dossiers",
    "pre_edit_gate_violations",
    "unresolved_affected_path_gaps",
    "minimum_edge_case_verification_rate",
    "minimum_failure_mode_verification_rate",
    "test_quality_failures",
    "permission_widening",
    "introduced_regressions",
    "hidden_edge_case_failures",
    "integrated_verification_failures",
  ];
  exact(decision.quality_metrics, qualityMetricKeys, qualityMetricKeys, "decision.quality_metrics");
  for (const key of qualityMetricKeys.filter((entry) => !entry.includes("_rate"))) {
    assertInteger(decision.quality_metrics[key], `decision.quality_metrics.${key}`);
  }
  assertRate(
    decision.quality_metrics.minimum_edge_case_verification_rate,
    "decision.quality_metrics.minimum_edge_case_verification_rate",
  );
  assertRate(
    decision.quality_metrics.minimum_failure_mode_verification_rate,
    "decision.quality_metrics.minimum_failure_mode_verification_rate",
  );

  const resourceKeys = ["cost", "duration_ms", "tokens"];
  exact(decision.resource_metrics, resourceKeys, resourceKeys, "decision.resource_metrics");
  for (const key of resourceKeys) {
    const label = `decision.resource_metrics.${key}`;
    const metricKeys = ["available", "baseline_total", "candidate_total", "delta", "ratio", "unit"];
    exact(decision.resource_metrics[key], metricKeys, metricKeys, label);
    const metric = decision.resource_metrics[key];
    assertBoolean(metric.available, `${label}.available`);
    if (!metric.available) {
      for (const field of ["baseline_total", "candidate_total", "delta", "ratio", "unit"]) {
        if (metric[field] !== null) fail("QUALITY_ACCEPTANCE_RESOURCE_UNAVAILABLE", `${label}.${field} must be null`);
      }
    } else {
      assertNonNegativeNumber(metric.baseline_total, `${label}.baseline_total`);
      assertNonNegativeNumber(metric.candidate_total, `${label}.candidate_total`);
      if (typeof metric.delta !== "number" || !Number.isFinite(metric.delta)) {
        fail("QUALITY_ACCEPTANCE_RESOURCE_DELTA", `${label}.delta must be finite`);
      }
      assertNonNegativeNumber(metric.ratio, `${label}.ratio`);
      assertString(metric.unit, `${label}.unit`, { maxBytes: 32 });
    }
  }

  assertEnum(decision.decision, QUALITY_ACCEPTANCE_DECISIONS, "decision.decision");
  validateReasonCodes(decision.reason_codes, "decision.reason_codes", { min: 1 });
  validateReasonCodes(decision.missing_evidence, "decision.missing_evidence");
  assertIso(decision.created_at, "decision.created_at");
  assertFingerprint(decision.content_fingerprint, "decision.content_fingerprint");
  if (!fingerprintsEqual(decision.content_fingerprint, qualityAcceptanceDecisionFingerprint(decision))) {
    fail("QUALITY_ACCEPTANCE_DECISION_FINGERPRINT", "decision.content_fingerprint does not match its content");
  }

  const statuses = QUALITY_ACCEPTANCE_HARD_GATES.map((name) => decision.hard_gates[name].status);
  const expected = statuses.includes("inconclusive")
    ? "inconclusive"
    : statuses.includes("failed")
      ? "rejected"
      : "accepted";
  if (decision.decision !== expected) {
    fail("QUALITY_ACCEPTANCE_DECISION_CONSISTENCY", `decision must be ${expected} for its hard gates`);
  }
  if (decision.decision === "accepted" && decision.paired_bindings.length === 0) {
    fail("QUALITY_ACCEPTANCE_DECISION_PAIRS", "accepted decision requires paired bindings");
  }
  if (decision.decision === "accepted" && decision.identities.repository_fingerprint === null) {
    fail("QUALITY_ACCEPTANCE_DECISION_REPOSITORY", "accepted decision requires a canonical repository snapshot");
  }
  if (
    decision.decision === "accepted"
    && decision.quality_metrics.complete_attestation_count !== decision.quality_metrics.candidate_result_count
  ) {
    fail("QUALITY_ACCEPTANCE_DECISION_ATTESTATION", "accepted decision requires a complete attestation for every candidate result");
  }
  const targetAggregate = decision.per_target_metrics.some((entry) => entry.status === "inconclusive")
    ? "inconclusive"
    : decision.per_target_metrics.some((entry) => entry.status === "failed")
      ? "failed"
      : "passed";
  if (decision.hard_gates.targets.status !== targetAggregate) {
    fail("QUALITY_ACCEPTANCE_DECISION_TARGET_GATE", "decision target hard gate does not match per-target metrics");
  }
  const protectedAggregate = decision.per_protected_family_metrics.some((entry) => entry.status === "inconclusive")
    ? "inconclusive"
    : decision.per_protected_family_metrics.some((entry) => entry.status === "failed")
      ? "failed"
      : "passed";
  if (decision.hard_gates.protected_failure_families.status !== protectedAggregate) {
    fail("QUALITY_ACCEPTANCE_DECISION_PROTECTED_GATE", "decision protected hard gate does not match per-family metrics");
  }
  return decision;
}

export function validateRuntimeEvidenceArray(value) {
  assertArray(value, "runtime model evidence", {
    min: 0,
    max: 2048,
    item: validateRuntimeModelEvidence,
  });
  const fingerprints = value.map((entry) => entry.content_fingerprint);
  if (new Set(fingerprints).size !== fingerprints.length) {
    fail("QUALITY_ACCEPTANCE_RUNTIME_DUPLICATE", "runtime model evidence contains duplicate fingerprints");
  }
  return value;
}

export function isLegacyAcceptanceReport(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && value.schema_version === LEGACY_REPORT_SCHEMA_VERSION;
}

export function isFingerprint(value) {
  return typeof value === "string" && FINGERPRINT_PATTERN.test(value);
}

export function assertPairKey(value, label = "pair key") {
  if (typeof value !== "string" || !PAIR_KEY_PATTERN.test(value)) {
    fail("QUALITY_ACCEPTANCE_PAIR_KEY", `${label} is invalid`);
  }
  return value;
}
