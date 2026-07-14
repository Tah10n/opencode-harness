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
import { validateQualityAttestation } from "./attestation.mjs";
import { assertValidatedEngineeringQualityRunBundle } from "./run-bundle.mjs";
import { qualityLiveCheckCatalog } from "./live-scenarios.mjs";

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

const OUTCOME_KEYS = Object.freeze([
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
const MODEL_METADATA_KEYS = Object.freeze(["provider", "model", "reasoning_effort", "text_verbosity"]);
const POLICY_KEYS = Object.freeze([
  "schema_version",
  "policy_version",
  "required_scenarios",
  "required_scenario_risks",
  "quality_requirements",
  "fingerprint",
]);
const REQUIREMENT_KEYS = Object.freeze([
  "require_complete_verification",
  "reject_metric_regressions",
  ...QUALITY_VIOLATION_KEYS.map((key) => `maximum_${key}`),
]);
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
  validateQualityAttestation(bundle.attestation);
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
  return {
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
}

export function qualityOutcomesFingerprint(outcome) {
  return fingerprint(fingerprintInput(outcome));
}

export function validateQualityOutcomes(value, {
  run_bundle = null,
  check_catalog = null,
  label = "quality outcomes",
} = {}) {
  exact(value, OUTCOME_KEYS, OUTCOME_KEYS, label);
  if (value.schema_version !== 2) fail("QUALITY_ACCEPTANCE_OUTCOME_SCHEMA", `${label}.schema_version must be 2`);
  if (value.producer_id !== QUALITY_ACCEPTANCE_PRODUCERS.qualityOutcomes) {
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
    && expectedMissingMechanisms.length === 0;
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
    const trustedComplete = bundle.gate.status === "passed"
      && bundle.verification.status === "passed"
      && evidence !== null
      && targets.checkIds.every((id) => passedChecks.has(id))
      && targets.mechanismIds.every((id) => passedMechanisms.has(id));
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
  const source = {
    schema_version: 2,
    producer_id: QUALITY_ACCEPTANCE_PRODUCERS.qualityOutcomes,
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
      && requiredMechanismIds.every((id) => passedMechanisms.has(id)),
    violations,
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

export function validateQualityAcceptancePolicy(value) {
  exact(value, POLICY_KEYS, POLICY_KEYS, "quality acceptance policy");
  if (value.schema_version !== 2) fail("QUALITY_ACCEPTANCE_POLICY_SCHEMA", "quality acceptance policy.schema_version must be 2");
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
  assertFingerprint(value.fingerprint, "quality acceptance policy.fingerprint");
  if (!fingerprintsEqual(value.fingerprint, qualityAcceptancePolicyFingerprint(value))) {
    fail("QUALITY_ACCEPTANCE_POLICY_FINGERPRINT", "quality acceptance policy fingerprint mismatch");
  }
  return value;
}

export function createQualityAcceptancePolicy(input) {
  const keys = POLICY_KEYS.filter((key) => key !== "schema_version" && key !== "fingerprint");
  exact(input, keys, keys, "quality acceptance policy input");
  const source = { schema_version: 2, ...input };
  const policy = { ...source, fingerprint: fingerprint(source) };
  validateQualityAcceptancePolicy(policy);
  return deepFrozenClone(policy, "quality acceptance policy");
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
