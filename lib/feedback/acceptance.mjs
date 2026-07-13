import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  ACCEPTANCE_SCHEMA_VERSION,
  EVIDENCE_PRODUCERS,
  REPORT_SCHEMA_VERSION,
  ContractError,
  assertEnum,
  assertExactKeys,
  assertIsoTimestamp,
  assertPlainObject,
  assertSafeId,
  fingerprint,
} from "./contracts.mjs";
import {
  assertConfinedExistingPath,
  ensureConfinedDirectory,
  isInside,
  publishImmutableSet,
} from "./files.mjs";
import { permissionProfileFingerprint } from "./evidence.mjs";
import { assertPersistenceSafe, assertSafePersistenceId } from "./privacy.mjs";

export const DECISIONS = Object.freeze(["accepted", "rejected", "inconclusive"]);
export const PROFILE_ROLES = Object.freeze(["baseline", "candidate"]);
export const EVIDENCE_KINDS = Object.freeze(["live", "infrastructure_self_test"]);
export const RESULT_STATUSES = Object.freeze(["passed", "failed", "incomplete"]);
export const ADAPTER_CLASSIFICATIONS = Object.freeze(["passed", "failed", "timed_out", "unavailable"]);
export const CHECK_STATUSES = Object.freeze(["passed", "failed", "timed_out", "unavailable"]);
export const PERMISSION_LEVELS = Object.freeze(["deny", "ask", "allow"]);
export const BEHAVIORAL_SUITES = Object.freeze(["development", "held_out", "canary"]);
export const ALL_SUITES = Object.freeze([...BEHAVIORAL_SUITES, "infrastructure"]);

const HARD_GATE_ORDER = Object.freeze([
  "static_verification",
  "evidence_identity",
  "permission_surface",
  "canary_regressions",
  "held_out_regressions",
  "hidden_check_regressions",
  "required_pairs",
  "target_improvement",
  "cost_ceiling",
  "duration_ceiling",
]);

const FAILURE_REASON_ORDER = Object.freeze([
  "STATIC_VERIFICATION_FAILED",
  "PERMISSION_SURFACE_WIDENED",
  "CANARY_REGRESSION",
  "HELD_OUT_REGRESSION",
  "NEW_HIDDEN_CHECK_FAILURE",
  "TARGET_IMPROVEMENT_BELOW_THRESHOLD",
  "COST_CEILING_EXCEEDED",
  "DURATION_CEILING_EXCEEDED",
]);

const INCONCLUSIVE_REASON_ORDER = Object.freeze([
  "MISSING_STATIC_VERIFICATION",
  "INVALID_STATIC_VERIFICATION",
  "UNTRUSTED_STATIC_VERIFICATION",
  "INCOMPLETE_STATIC_VERIFICATION",
  "MISSING_BASELINE_PERMISSION_SNAPSHOT",
  "INVALID_BASELINE_PERMISSION_SNAPSHOT",
  "UNTRUSTED_BASELINE_PERMISSION_SNAPSHOT",
  "INCOMPLETE_BASELINE_PERMISSION_SNAPSHOT",
  "MISSING_CANDIDATE_PERMISSION_SNAPSHOT",
  "INVALID_CANDIDATE_PERMISSION_SNAPSHOT",
  "UNTRUSTED_CANDIDATE_PERMISSION_SNAPSHOT",
  "INCOMPLETE_CANDIDATE_PERMISSION_SNAPSHOT",
  "MISMATCHED_BASELINE_EVIDENCE_FINGERPRINT",
  "MISMATCHED_CANDIDATE_EVIDENCE_FINGERPRINT",
  "PERMISSION_KEYS_MISMATCH",
  "UNTRUSTED_LIVE_REPORT",
  "INCOMPLETE_LIVE_REPORT",
  "MISSING_REQUIRED_PAIR",
  "INCOMPLETE_REQUIRED_PAIR",
  "MISMATCHED_SCENARIO_FINGERPRINT",
  "MISMATCHED_CHECK_IDS",
  "TARGET_EVIDENCE_INCOMPLETE",
  "COST_EVIDENCE_UNAVAILABLE",
  "DURATION_EVIDENCE_INCOMPLETE",
]);

const permissionRank = Object.freeze({ deny: 0, ask: 1, allow: 2 });
const stableEvidenceCodePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const producerIdPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;
const fingerprintPattern = /^sha256:[0-9a-f]{64}$/;
const permissionKeyPattern = /^[A-Za-z0-9*?][A-Za-z0-9*?._:/-]{0,127}$/;

function fail(code, message) {
  throw new ContractError(code, message);
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") fail("ACCEPTANCE_BOOLEAN", `${label} must be a boolean`);
  return value;
}

function assertNonEmptyString(value, label, { maxLength = 256, pattern = null } = {}) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength || (pattern && !pattern.test(value))) {
    fail("ACCEPTANCE_STRING", `${label} must be a non-empty valid string of at most ${maxLength} characters`);
  }
  return value;
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) fail("ACCEPTANCE_INTEGER", `${label} must be a non-negative integer`);
  return value;
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) fail("ACCEPTANCE_INTEGER", `${label} must be an integer >= 1`);
  return value;
}

function assertNonNegativeNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("ACCEPTANCE_NUMBER", `${label} must be a finite non-negative number`);
  }
  return value;
}

function assertRate(value, label) {
  assertNonNegativeNumber(value, label);
  if (value > 1) fail("ACCEPTANCE_RATE", `${label} must be between 0 and 1`);
  return value;
}

function assertFingerprint(value, label) {
  return assertNonEmptyString(value, label, { maxLength: 71, pattern: fingerprintPattern });
}

function assertUniqueStrings(values, label, { allowEmpty = false, safeIds = true } = {}) {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    fail("ACCEPTANCE_ARRAY", `${label} must be ${allowEmpty ? "an" : "a non-empty"} array`);
  }
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    if (safeIds) assertSafeId(value, `${label}[${index}]`);
    else assertNonEmptyString(value, `${label}[${index}]`);
    if (seen.has(value)) fail("ACCEPTANCE_DUPLICATE", `${label} contains duplicate value ${value}`);
    seen.add(value);
  }
  return seen;
}

function validateCost(cost, label) {
  assertExactKeys(cost, {
    allowed: ["available", "value", "currency"],
    required: ["available", "value", "currency"],
  }, label);
  assertBoolean(cost.available, `${label}.available`);
  if (cost.available) {
    assertNonNegativeNumber(cost.value, `${label}.value`);
    assertNonEmptyString(cost.currency, `${label}.currency`, { maxLength: 3, pattern: /^[A-Z]{3}$/ });
  } else if (cost.value !== null || cost.currency !== null) {
    fail("ACCEPTANCE_COST_UNAVAILABLE", `${label} must use null value and currency when unavailable`);
  }
  return cost;
}

function validateAvailabilityMetadata(metadata, label) {
  assertExactKeys(metadata, {
    allowed: ["available", "value"],
    required: ["available", "value"],
  }, label);
  assertBoolean(metadata.available, `${label}.available`);
  if (metadata.available) {
    assertNonEmptyString(metadata.value, `${label}.value`, { maxLength: 256 });
  } else if (metadata.value !== null) {
    fail("ACCEPTANCE_METADATA_UNAVAILABLE", `${label}.value must be null when unavailable`);
  }
  return metadata;
}

function validateCheckResults(results, label) {
  if (!Array.isArray(results)) fail("ACCEPTANCE_CHECKS", `${label} must be an array`);
  const ids = new Set();
  for (const [index, result] of results.entries()) {
    const resultLabel = `${label}[${index}]`;
    assertExactKeys(result, {
      allowed: ["check_id", "status", "exit_code", "stdout_chars", "stderr_chars"],
      required: ["check_id", "status", "exit_code", "stdout_chars", "stderr_chars"],
    }, resultLabel);
    assertSafeId(result.check_id, `${resultLabel}.check_id`);
    assertEnum(result.status, CHECK_STATUSES, `${resultLabel}.status`);
    if (result.exit_code !== null && !Number.isInteger(result.exit_code)) {
      fail("ACCEPTANCE_EXIT_CODE", `${resultLabel}.exit_code must be an integer or null`);
    }
    if (result.status === "passed" && ![0, null].includes(result.exit_code)) {
      fail("ACCEPTANCE_EXIT_STATUS", `${resultLabel} passed status requires exit_code 0 or null`);
    }
    if (result.status === "failed" && result.exit_code === 0) {
      fail("ACCEPTANCE_EXIT_STATUS", `${resultLabel} failed status cannot use exit_code 0`);
    }
    if (["timed_out", "unavailable"].includes(result.status) && result.exit_code !== null) {
      fail("ACCEPTANCE_EXIT_STATUS", `${resultLabel} ${result.status} status requires exit_code null`);
    }
    assertNonNegativeInteger(result.stdout_chars, `${resultLabel}.stdout_chars`);
    assertNonNegativeInteger(result.stderr_chars, `${resultLabel}.stderr_chars`);
    if (ids.has(result.check_id)) fail("ACCEPTANCE_DUPLICATE_CHECK", `${label} contains duplicate check_id ${result.check_id}`);
    ids.add(result.check_id);
  }
  return ids;
}

function validateLiveResult(result, index) {
  const label = `report.results[${index}]`;
  assertExactKeys(result, {
    allowed: [
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
    ],
    required: [
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
    ],
  }, label);
  assertSafeId(result.scenario_id, `${label}.scenario_id`);
  assertPositiveInteger(result.repetition, `${label}.repetition`);
  assertEnum(result.profile_role, PROFILE_ROLES, `${label}.profile_role`);
  assertFingerprint(result.repository_fingerprint, `${label}.repository_fingerprint`);
  assertFingerprint(result.profile_fingerprint, `${label}.profile_fingerprint`);
  assertSafeId(result.operational_run_id, `${label}.operational_run_id`);
  assertFingerprint(result.scenario_fingerprint, `${label}.scenario_fingerprint`);
  assertEnum(result.status, RESULT_STATUSES, `${label}.status`);
  assertEnum(result.adapter_classification, ADAPTER_CLASSIFICATIONS, `${label}.adapter_classification`);
  const setupIds = validateCheckResults(result.setup_results, `${label}.setup_results`);
  const visibleIds = validateCheckResults(result.visible_results, `${label}.visible_results`);
  const hiddenIds = validateCheckResults(result.hidden_results, `${label}.hidden_results`);
  if (hiddenIds.size === 0) fail("ACCEPTANCE_HIDDEN_CHECKS", `${label}.hidden_results must contain at least one hidden check`);
  const allCheckIds = new Set();
  for (const [phase, ids] of [["setup", setupIds], ["visible", visibleIds], ["hidden", hiddenIds]]) {
    for (const checkId of ids) {
      if (allCheckIds.has(checkId)) fail("ACCEPTANCE_DUPLICATE_CHECK", `${label} reuses check_id ${checkId} across result phases`);
      allCheckIds.add(checkId);
    }
  }
  assertRate(result.visible_pass_rate, `${label}.visible_pass_rate`);
  assertRate(result.hidden_pass_rate, `${label}.hidden_pass_rate`);
  assertRate(result.defect_escape_rate, `${label}.defect_escape_rate`);
  const expectedVisiblePassRate = result.visible_results.length === 0
    ? 1
    : result.visible_results.filter((entry) => entry.status === "passed").length / result.visible_results.length;
  const expectedHiddenPassRate = result.hidden_results.filter((entry) => entry.status === "passed").length / result.hidden_results.length;
  const expectedDefectEscapeRate = result.hidden_results.some((entry) => entry.status !== "passed") ? 1 : 0;
  if (Math.abs(result.visible_pass_rate - expectedVisiblePassRate) > Number.EPSILON) {
    fail("ACCEPTANCE_VISIBLE_RATE", `${label}.visible_pass_rate does not match visible_results`);
  }
  if (Math.abs(result.hidden_pass_rate - expectedHiddenPassRate) > Number.EPSILON) {
    fail("ACCEPTANCE_HIDDEN_RATE", `${label}.hidden_pass_rate does not match hidden_results`);
  }
  if (result.defect_escape_rate !== expectedDefectEscapeRate) {
    fail("ACCEPTANCE_DEFECT_ESCAPE_RATE", `${label}.defect_escape_rate does not match hidden_results`);
  }
  assertNonNegativeInteger(result.duration_ms, `${label}.duration_ms`);
  validateCost(result.cost, `${label}.cost`);
  validateAvailabilityMetadata(result.model, `${label}.model`);
  validateAvailabilityMetadata(result.tool, `${label}.tool`);
  assertUniqueStrings(result.incomplete_evidence, `${label}.incomplete_evidence`, { allowEmpty: true, safeIds: false });
  for (const [evidenceIndex, code] of result.incomplete_evidence.entries()) {
    assertNonEmptyString(code, `${label}.incomplete_evidence[${evidenceIndex}]`, {
      maxLength: 128,
      pattern: stableEvidenceCodePattern,
    });
  }

  const allChecksPassed = [...result.setup_results, ...result.visible_results, ...result.hidden_results]
    .every((entry) => entry.status === "passed");
  if (result.status === "passed" && (
    result.adapter_classification !== "passed"
    || !allChecksPassed
    || result.incomplete_evidence.length > 0
  )) {
    fail("ACCEPTANCE_FALSE_PASS", `${label} cannot be passed unless the adapter and every check passed with complete evidence`);
  }
  if (result.status === "failed" && result.adapter_classification === "passed" && allChecksPassed) {
    fail("ACCEPTANCE_FALSE_FAILURE", `${label} cannot be failed without a failed adapter or check`);
  }
  if (result.adapter_classification === "unavailable" && result.status !== "incomplete") {
    fail("ACCEPTANCE_UNAVAILABLE_STATUS", `${label} must be incomplete when the adapter is unavailable`);
  }
  if (result.status === "incomplete" && (
    result.adapter_classification !== "unavailable"
    && result.incomplete_evidence.length === 0
    && ![...result.setup_results, ...result.visible_results, ...result.hidden_results]
      .some((entry) => entry.status === "unavailable")
  )) {
    fail("ACCEPTANCE_INCOMPLETE_REASON", `${label} incomplete status requires explicit unavailable or incomplete evidence`);
  }
  return result;
}

export function validateLiveReport(report) {
  assertExactKeys(report, {
    allowed: ["schema_version", "evaluation_run_id", "created_at", "provenance", "results"],
    required: ["schema_version", "evaluation_run_id", "created_at", "provenance", "results"],
  }, "report");
  if (report.schema_version !== REPORT_SCHEMA_VERSION) {
    fail("ACCEPTANCE_REPORT_SCHEMA", `report.schema_version must be ${REPORT_SCHEMA_VERSION}`);
  }
  assertSafeId(report.evaluation_run_id, "report.evaluation_run_id");
  assertIsoTimestamp(report.created_at, "report.created_at");
  assertExactKeys(report.provenance, {
    allowed: ["producer_id", "evidence_kind", "complete"],
    required: ["producer_id", "evidence_kind", "complete"],
  }, "report.provenance");
  assertNonEmptyString(report.provenance.producer_id, "report.provenance.producer_id", {
    maxLength: 256,
    pattern: producerIdPattern,
  });
  assertEnum(report.provenance.evidence_kind, EVIDENCE_KINDS, "report.provenance.evidence_kind");
  assertBoolean(report.provenance.complete, "report.provenance.complete");
  if (!Array.isArray(report.results) || report.results.length === 0) {
    fail("ACCEPTANCE_REPORT_RESULTS", "report.results must be a non-empty array");
  }
  const pairKeys = new Set();
  const operationalRunIds = new Set();
  const profileFingerprints = new Map();
  for (const [index, result] of report.results.entries()) {
    validateLiveResult(result, index);
    const pairKey = `${result.profile_role}:${scenarioRepetitionKey(result.scenario_id, result.repetition)}`;
    if (pairKeys.has(pairKey)) fail("ACCEPTANCE_DUPLICATE_PAIR", `report contains duplicate result pair ${pairKey}`);
    pairKeys.add(pairKey);
    if (operationalRunIds.has(result.operational_run_id)) {
      fail("ACCEPTANCE_DUPLICATE_OPERATIONAL_RUN", `report reuses operational_run_id ${result.operational_run_id}`);
    }
    operationalRunIds.add(result.operational_run_id);
    const existingFingerprint = profileFingerprints.get(result.profile_role);
    if (existingFingerprint && existingFingerprint !== result.profile_fingerprint) {
      fail("ACCEPTANCE_PROFILE_FINGERPRINT", `report has inconsistent ${result.profile_role} profile_fingerprint values`);
    }
    profileFingerprints.set(result.profile_role, result.profile_fingerprint);
  }
  if (
    profileFingerprints.has("baseline")
    && profileFingerprints.has("candidate")
    && profileFingerprints.get("baseline") === profileFingerprints.get("candidate")
  ) {
    fail("ACCEPTANCE_PROFILE_FINGERPRINT", "baseline and candidate profile_fingerprint values must differ");
  }
  return report;
}

export function validateStaticEvidence(evidence) {
  assertExactKeys(evidence, {
    allowed: [
      "schema_version",
      "producer_id",
      "source",
      "candidate_id",
      "repository_fingerprint",
      "command_id",
      "passed",
      "complete",
      "created_at",
      "duration_ms",
    ],
    required: [
      "schema_version",
      "producer_id",
      "source",
      "candidate_id",
      "repository_fingerprint",
      "command_id",
      "passed",
      "complete",
      "created_at",
      "duration_ms",
    ],
  }, "staticEvidence");
  if (evidence.schema_version !== ACCEPTANCE_SCHEMA_VERSION) {
    fail("ACCEPTANCE_STATIC_SCHEMA", `staticEvidence.schema_version must be ${ACCEPTANCE_SCHEMA_VERSION}`);
  }
  if (evidence.producer_id !== EVIDENCE_PRODUCERS.staticVerification) {
    fail("ACCEPTANCE_STATIC_PRODUCER", "staticEvidence.producer_id is not the first-party static verifier");
  }
  if (evidence.source !== "local_verify") {
    fail("ACCEPTANCE_STATIC_SOURCE", "staticEvidence.source must be local_verify");
  }
  assertSafeId(evidence.candidate_id, "staticEvidence.candidate_id");
  assertFingerprint(evidence.repository_fingerprint, "staticEvidence.repository_fingerprint");
  if (evidence.command_id !== "npm-run-verify") {
    fail("ACCEPTANCE_STATIC_COMMAND", "staticEvidence.command_id must be npm-run-verify");
  }
  assertBoolean(evidence.passed, "staticEvidence.passed");
  assertBoolean(evidence.complete, "staticEvidence.complete");
  if (evidence.passed && !evidence.complete) {
    fail("ACCEPTANCE_STATIC_FALSE_PASS", "staticEvidence cannot pass when evidence is incomplete");
  }
  assertIsoTimestamp(evidence.created_at, "staticEvidence.created_at");
  assertNonNegativeInteger(evidence.duration_ms, "staticEvidence.duration_ms");
  return evidence;
}

export function permissionSurfaceFingerprint(permissions) {
  assertPlainObject(permissions, "permissions");
  return fingerprint(permissions);
}

export function validatePermissionSnapshot(snapshot) {
  assertExactKeys(snapshot, {
    allowed: [
      "schema_version",
      "producer_id",
      "source",
      "profile_id",
      "subject_fingerprint",
      "runtime_fingerprint",
      "surface_fingerprint",
      "profile_fingerprint",
      "permissions",
      "complete",
      "incomplete_scopes",
      "created_at",
    ],
    required: [
      "schema_version",
      "producer_id",
      "source",
      "profile_id",
      "subject_fingerprint",
      "runtime_fingerprint",
      "surface_fingerprint",
      "profile_fingerprint",
      "permissions",
      "complete",
      "incomplete_scopes",
      "created_at",
    ],
  }, "permissionSnapshot");
  if (snapshot.schema_version !== ACCEPTANCE_SCHEMA_VERSION) {
    fail("ACCEPTANCE_PERMISSION_SCHEMA", `permissionSnapshot.schema_version must be ${ACCEPTANCE_SCHEMA_VERSION}`);
  }
  if (snapshot.producer_id !== EVIDENCE_PRODUCERS.runtimePermissionSnapshot) {
    fail("ACCEPTANCE_PERMISSION_PRODUCER", "permissionSnapshot.producer_id is not the first-party runtime permission producer");
  }
  if (!["installed_runtime", "fixture"].includes(snapshot.source)) {
    fail("ACCEPTANCE_PERMISSION_SOURCE", "permissionSnapshot.source must be installed_runtime or fixture");
  }
  assertSafeId(snapshot.profile_id, "permissionSnapshot.profile_id");
  assertFingerprint(snapshot.subject_fingerprint, "permissionSnapshot.subject_fingerprint");
  assertFingerprint(snapshot.runtime_fingerprint, "permissionSnapshot.runtime_fingerprint");
  assertFingerprint(snapshot.surface_fingerprint, "permissionSnapshot.surface_fingerprint");
  assertFingerprint(snapshot.profile_fingerprint, "permissionSnapshot.profile_fingerprint");
  assertPlainObject(snapshot.permissions, "permissionSnapshot.permissions");
  const keys = Object.keys(snapshot.permissions);
  for (const key of keys) {
    assertNonEmptyString(key, `permissionSnapshot.permissions key ${key}`, {
      maxLength: 128,
      pattern: permissionKeyPattern,
    });
    assertEnum(snapshot.permissions[key], PERMISSION_LEVELS, `permissionSnapshot.permissions.${key}`);
  }
  if (snapshot.surface_fingerprint !== permissionSurfaceFingerprint(snapshot.permissions)) {
    fail("ACCEPTANCE_PERMISSION_FINGERPRINT", "permissionSnapshot.surface_fingerprint does not match permissions");
  }
  if (snapshot.profile_fingerprint !== permissionProfileFingerprint({
    subjectFingerprint: snapshot.subject_fingerprint,
    runtimeFingerprint: snapshot.runtime_fingerprint,
    surfaceFingerprint: snapshot.surface_fingerprint,
  })) {
    fail("ACCEPTANCE_PROFILE_FINGERPRINT", "permissionSnapshot.profile_fingerprint does not match its content attestations");
  }
  assertBoolean(snapshot.complete, "permissionSnapshot.complete");
  assertUniqueStrings(snapshot.incomplete_scopes, "permissionSnapshot.incomplete_scopes", { allowEmpty: true, safeIds: false });
  for (const [index, scope] of snapshot.incomplete_scopes.entries()) {
    assertNonEmptyString(scope, `permissionSnapshot.incomplete_scopes[${index}]`, {
      maxLength: 128,
      pattern: /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/,
    });
  }
  if (snapshot.complete && (keys.length === 0 || snapshot.incomplete_scopes.length > 0)) {
    fail("ACCEPTANCE_PERMISSION_COMPLETE", "complete permissionSnapshot requires non-empty permissions and no incomplete scopes");
  }
  if (!snapshot.complete && snapshot.incomplete_scopes.length === 0) {
    fail("ACCEPTANCE_PERMISSION_COMPLETE", "incomplete permissionSnapshot requires explicit incomplete scopes");
  }
  assertIsoTimestamp(snapshot.created_at, "permissionSnapshot.created_at");
  return snapshot;
}

export function validateSuiteManifest(manifest) {
  assertExactKeys(manifest, {
    allowed: ["schema_version", "manifest_version", "suites"],
    required: ["schema_version", "manifest_version", "suites"],
  }, "suiteManifest");
  if (manifest.schema_version !== ACCEPTANCE_SCHEMA_VERSION) {
    fail("ACCEPTANCE_SUITE_SCHEMA", `suiteManifest.schema_version must be ${ACCEPTANCE_SCHEMA_VERSION}`);
  }
  assertSafeId(manifest.manifest_version, "suiteManifest.manifest_version");
  assertExactKeys(manifest.suites, { allowed: ALL_SUITES, required: ALL_SUITES }, "suiteManifest.suites");
  const allMembership = new Map();
  for (const suite of ALL_SUITES) {
    const ids = assertUniqueStrings(manifest.suites[suite], `suiteManifest.suites.${suite}`);
    for (const scenarioId of ids) {
      if (allMembership.has(scenarioId)) {
        fail(
          "ACCEPTANCE_DUPLICATE_SUITE_MEMBERSHIP",
          `scenario ${scenarioId} belongs to both ${allMembership.get(scenarioId)} and ${suite}`,
        );
      }
      allMembership.set(scenarioId, suite);
    }
  }
  return manifest;
}

function validateExpectedProducerIds(expected) {
  assertExactKeys(expected, {
    allowed: ["live_evaluation", "infrastructure_self_test", "static_verification", "permission_snapshot"],
    required: ["live_evaluation", "infrastructure_self_test", "static_verification", "permission_snapshot"],
  }, "policy.expected_producer_ids");
  const required = {
    live_evaluation: EVIDENCE_PRODUCERS.liveEvaluation,
    infrastructure_self_test: EVIDENCE_PRODUCERS.infrastructureSelfTest,
    static_verification: EVIDENCE_PRODUCERS.staticVerification,
    permission_snapshot: EVIDENCE_PRODUCERS.runtimePermissionSnapshot,
  };
  for (const [key, producerId] of Object.entries(required)) {
    if (expected[key] !== producerId) {
      fail("ACCEPTANCE_POLICY_PRODUCER", `policy.expected_producer_ids.${key} must be ${producerId}`);
    }
  }
}

function validateCostCeiling(ceiling) {
  if (ceiling === undefined) return;
  assertExactKeys(ceiling, {
    allowed: ["maximum_ratio", "maximum_candidate_total", "currency"],
    required: ["currency"],
  }, "policy.cost_ceiling");
  if (!Object.hasOwn(ceiling, "maximum_ratio") && !Object.hasOwn(ceiling, "maximum_candidate_total")) {
    fail("ACCEPTANCE_COST_CEILING", "policy.cost_ceiling requires maximum_ratio or maximum_candidate_total");
  }
  if (Object.hasOwn(ceiling, "maximum_ratio")) {
    assertNonNegativeNumber(ceiling.maximum_ratio, "policy.cost_ceiling.maximum_ratio");
  }
  if (Object.hasOwn(ceiling, "maximum_candidate_total")) {
    assertNonNegativeNumber(ceiling.maximum_candidate_total, "policy.cost_ceiling.maximum_candidate_total");
  }
  assertNonEmptyString(ceiling.currency, "policy.cost_ceiling.currency", { maxLength: 3, pattern: /^[A-Z]{3}$/ });
}

function validateDurationCeiling(ceiling) {
  if (ceiling === undefined) return;
  assertExactKeys(ceiling, {
    allowed: ["maximum_ratio", "maximum_candidate_total_ms"],
    required: [],
  }, "policy.duration_ceiling");
  if (!Object.hasOwn(ceiling, "maximum_ratio") && !Object.hasOwn(ceiling, "maximum_candidate_total_ms")) {
    fail("ACCEPTANCE_DURATION_CEILING", "policy.duration_ceiling requires maximum_ratio or maximum_candidate_total_ms");
  }
  if (Object.hasOwn(ceiling, "maximum_ratio")) {
    assertNonNegativeNumber(ceiling.maximum_ratio, "policy.duration_ceiling.maximum_ratio");
  }
  if (Object.hasOwn(ceiling, "maximum_candidate_total_ms")) {
    assertNonNegativeInteger(ceiling.maximum_candidate_total_ms, "policy.duration_ceiling.maximum_candidate_total_ms");
  }
}

export function validateAcceptancePolicy(policy) {
  assertExactKeys(policy, {
    allowed: [
      "schema_version",
      "policy_version",
      "required_suites",
      "target",
      "cost_ceiling",
      "duration_ceiling",
      "expected_producer_ids",
    ],
    required: ["schema_version", "policy_version", "required_suites", "target", "expected_producer_ids"],
  }, "policy");
  if (policy.schema_version !== ACCEPTANCE_SCHEMA_VERSION) {
    fail("ACCEPTANCE_POLICY_SCHEMA", `policy.schema_version must be ${ACCEPTANCE_SCHEMA_VERSION}`);
  }
  assertSafeId(policy.policy_version, "policy.policy_version");
  const requiredSuites = assertUniqueStrings(policy.required_suites, "policy.required_suites");
  if (requiredSuites.size !== BEHAVIORAL_SUITES.length || BEHAVIORAL_SUITES.some((suite) => !requiredSuites.has(suite))) {
    fail("ACCEPTANCE_REQUIRED_SUITES", `policy.required_suites must contain exactly ${BEHAVIORAL_SUITES.join(", ")}`);
  }
  assertExactKeys(policy.target, {
    allowed: ["failure_family", "scenario_ids", "minimum_improvement"],
    required: ["failure_family", "scenario_ids", "minimum_improvement"],
  }, "policy.target");
  assertSafeId(policy.target.failure_family, "policy.target.failure_family");
  assertUniqueStrings(policy.target.scenario_ids, "policy.target.scenario_ids");
  assertRate(policy.target.minimum_improvement, "policy.target.minimum_improvement");
  validateCostCeiling(policy.cost_ceiling);
  validateDurationCeiling(policy.duration_ceiling);
  validateExpectedProducerIds(policy.expected_producer_ids);
  return policy;
}

export function acceptancePolicyFingerprint(policy) {
  validateAcceptancePolicy(policy);
  return fingerprint(policy);
}

export function scenarioRepetitionKey(scenarioId, repetition) {
  assertSafeId(scenarioId, "scenarioId");
  assertPositiveInteger(repetition, "repetition");
  return `${scenarioId}#${repetition}`;
}

function parseScenarioRepetitionKey(key) {
  const separator = key.lastIndexOf("#");
  return { scenarioId: key.slice(0, separator), repetition: Number(key.slice(separator + 1)) };
}

function comparePairKeys(left, right) {
  const a = parseScenarioRepetitionKey(left);
  const b = parseScenarioRepetitionKey(right);
  return a.scenarioId.localeCompare(b.scenarioId) || a.repetition - b.repetition;
}

function suiteMembership(manifest) {
  const membership = new Map();
  for (const suite of ALL_SUITES) {
    for (const scenarioId of manifest.suites[suite]) membership.set(scenarioId, suite);
  }
  return membership;
}

function validateExpectedPairs(expectedPairs, requiredScenarioIds) {
  if (!Array.isArray(expectedPairs) || expectedPairs.length === 0) {
    fail("ACCEPTANCE_EXPECTED_PAIRS", "expectedPairs must be a non-empty array");
  }
  const keys = new Set();
  const repetitionsByScenario = new Map();
  for (const [index, pair] of expectedPairs.entries()) {
    const label = `expectedPairs[${index}]`;
    assertExactKeys(pair, {
      allowed: ["scenario_id", "repetition"],
      required: ["scenario_id", "repetition"],
    }, label);
    assertSafeId(pair.scenario_id, `${label}.scenario_id`);
    assertPositiveInteger(pair.repetition, `${label}.repetition`);
    if (!requiredScenarioIds.has(pair.scenario_id)) {
      fail("ACCEPTANCE_EXPECTED_PAIR_SCENARIO", `${label} references non-required scenario ${pair.scenario_id}`);
    }
    const key = scenarioRepetitionKey(pair.scenario_id, pair.repetition);
    if (keys.has(key)) fail("ACCEPTANCE_DUPLICATE_EXPECTED_PAIR", `expectedPairs contains duplicate ${key}`);
    keys.add(key);
    const repetitions = repetitionsByScenario.get(pair.scenario_id) ?? [];
    repetitions.push(pair.repetition);
    repetitionsByScenario.set(pair.scenario_id, repetitions);
  }
  for (const scenarioId of requiredScenarioIds) {
    const repetitions = (repetitionsByScenario.get(scenarioId) ?? []).sort((a, b) => a - b);
    if (repetitions.length === 0) fail("ACCEPTANCE_EXPECTED_PAIR_MISSING", `expectedPairs omits scenario ${scenarioId}`);
    for (let index = 0; index < repetitions.length; index += 1) {
      if (repetitions[index] !== index + 1) {
        fail("ACCEPTANCE_EXPECTED_PAIR_GAP", `expectedPairs repetitions for ${scenarioId} must be contiguous from 1`);
      }
    }
  }
  return [...keys].sort(comparePairKeys);
}

function deriveExpectedPairs(requiredScenarioIds, scenarioRepetitions) {
  assertPlainObject(scenarioRepetitions, "scenarioRepetitions");
  const pairs = [];
  for (const scenarioId of requiredScenarioIds) {
    if (!Object.hasOwn(scenarioRepetitions, scenarioId)) {
      fail("ACCEPTANCE_SCENARIO_REPETITIONS", `scenarioRepetitions is missing ${scenarioId}`);
    }
    const repetitions = assertPositiveInteger(scenarioRepetitions[scenarioId], `scenarioRepetitions.${scenarioId}`);
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      pairs.push({ scenario_id: scenarioId, repetition });
    }
  }
  for (const key of Object.keys(scenarioRepetitions)) {
    assertSafeId(key, "scenarioRepetitions key");
  }
  return validateExpectedPairs(pairs, requiredScenarioIds);
}

function resolveCanonicalCorpus({ canonicalScenarios, manifest, policy }) {
  if (!Array.isArray(canonicalScenarios) || canonicalScenarios.length === 0) {
    fail("ACCEPTANCE_CANONICAL_CORPUS", "canonicalScenarios must be the non-empty validated workspace corpus");
  }
  const scenariosById = new Map();
  for (const [index, scenario] of canonicalScenarios.entries()) {
    assertPlainObject(scenario, `canonicalScenarios[${index}]`);
    assertSafeId(scenario.id, `canonicalScenarios[${index}].id`);
    assertPositiveInteger(scenario.repetitions, `canonicalScenarios[${index}].repetitions`);
    if (scenariosById.has(scenario.id)) {
      fail("ACCEPTANCE_CANONICAL_CORPUS", `canonicalScenarios contains duplicate ${scenario.id}`);
    }
    scenariosById.set(scenario.id, scenario);
  }
  const manifestScenarioIds = ALL_SUITES.flatMap((suite) => manifest.suites[suite]);
  if (
    manifestScenarioIds.length !== scenariosById.size
    || manifestScenarioIds.some((scenarioId) => !scenariosById.has(scenarioId))
  ) {
    fail("ACCEPTANCE_CANONICAL_CORPUS", "canonicalScenarios must exactly match the suite manifest universe");
  }
  const requiredScenarioIds = new Set(policy.required_suites.flatMap((suite) => manifest.suites[suite]));
  for (const scenarioId of policy.target.scenario_ids) {
    if (!requiredScenarioIds.has(scenarioId)) {
      fail("ACCEPTANCE_TARGET_SCENARIO", `policy target scenario ${scenarioId} is not in a required behavioral suite`);
    }
    const scenario = scenariosById.get(scenarioId);
    try {
      assertSafeId(scenario.failure_family, `canonical target scenario ${scenarioId}.failure_family`);
    } catch {
      fail(
        "ACCEPTANCE_TARGET_FAILURE_FAMILY",
        `canonical target scenario ${scenarioId} is missing a valid failure_family`,
      );
    }
    if (scenario.failure_family !== policy.target.failure_family) {
      fail(
        "ACCEPTANCE_TARGET_FAILURE_FAMILY",
        `policy target scenario ${scenarioId} belongs to ${scenario.failure_family}, not ${policy.target.failure_family}`,
      );
    }
  }
  const scenarioRepetitions = Object.fromEntries(
    [...requiredScenarioIds].map((scenarioId) => [scenarioId, scenariosById.get(scenarioId).repetitions]),
  );
  const expectedPairKeys = deriveExpectedPairs(requiredScenarioIds, scenarioRepetitions);
  const scenarioEntries = [...scenariosById.entries()]
    .map(([scenarioId, scenario]) => ({
      scenario_id: scenarioId,
      repetitions: scenario.repetitions,
      fingerprint: fingerprint(scenario),
    }))
    .sort((left, right) => left.scenario_id.localeCompare(right.scenario_id));
  return {
    expectedPairKeys,
    pairUniverseFingerprint: fingerprint(expectedPairKeys),
    scenarioCorpusFingerprint: fingerprint({ suite_manifest: manifest, scenarios: scenarioEntries }),
    scenarioFingerprintById: new Map(scenarioEntries.map((entry) => [entry.scenario_id, entry.fingerprint])),
  };
}

const REPORT_ATTESTATION_KEYS = Object.freeze([
  "evaluation_run_id",
  "generation",
  "report_fingerprint",
  "json_text_fingerprint",
  "markdown_fingerprint",
  "json_file",
  "markdown_file",
  "marker_fingerprint",
  "marker",
]);

const REPORT_MARKER_KEYS = Object.freeze([
  "schema_version",
  "generation",
  "evaluation_run_id",
  "report_fingerprint",
  "json_text_fingerprint",
  "markdown_fingerprint",
  "json_file",
  "markdown_file",
  "completed_at",
]);

function reportAttestationBinding(attestation) {
  return fingerprint(Object.fromEntries(
    REPORT_ATTESTATION_KEYS
      .filter((key) => key !== "marker")
      .map((key) => [key, attestation[key]]),
  ));
}

function trustedReportAttestation(attestation, report) {
  try {
    assertExactKeys(attestation, { allowed: REPORT_ATTESTATION_KEYS, required: REPORT_ATTESTATION_KEYS }, "report attestation");
    assertSafePersistenceId(attestation.evaluation_run_id, "report attestation.evaluation_run_id");
    assertSafePersistenceId(attestation.generation, "report attestation.generation");
    for (const field of ["report_fingerprint", "json_text_fingerprint", "markdown_fingerprint", "marker_fingerprint"]) {
      assertFingerprint(attestation[field], `report attestation.${field}`);
    }
    assertNonEmptyString(attestation.json_file, "report attestation.json_file", { maxLength: 255, pattern: /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/ });
    assertNonEmptyString(attestation.markdown_file, "report attestation.markdown_file", { maxLength: 255, pattern: /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/ });
    assertExactKeys(attestation.marker, { allowed: REPORT_MARKER_KEYS, required: REPORT_MARKER_KEYS }, "report attestation.marker");
    assertIsoTimestamp(attestation.marker.completed_at, "report attestation.marker.completed_at");
    if (attestation.marker.schema_version !== 1 || attestation.marker_fingerprint !== fingerprint(attestation.marker)) return false;
    for (const field of REPORT_MARKER_KEYS.filter((key) => !["schema_version", "completed_at"].includes(key))) {
      if (attestation.marker[field] !== attestation[field]) return false;
    }
    return (
      attestation.evaluation_run_id === report.evaluation_run_id
      && attestation.report_fingerprint === fingerprint(report)
      && attestation.json_file === `${attestation.generation}.json`
      && attestation.markdown_file === `${attestation.generation}.md`
    );
  } catch (error) {
    if (error instanceof ContractError) return false;
    throw error;
  }
}

function validateOptionalEvidence(evidence, validator) {
  if (evidence === null || evidence === undefined) return { value: null, error: null };
  try {
    return { value: validator(evidence), error: null };
  } catch (error) {
    if (!(error instanceof ContractError)) throw error;
    return { value: null, error };
  }
}

function addMissing(state, code, detail) {
  state.inconclusiveReasons.add(code);
  state.missingEvidence.add(detail);
}

function gate(status, details = {}) {
  return { status, ...details };
}

function checkMap(results) {
  return new Map(results.map((entry) => [entry.check_id, entry.status]));
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function pairShape(pair) {
  const baselineSetup = checkMap(pair.baseline.result.setup_results);
  const candidateSetup = checkMap(pair.candidate.result.setup_results);
  const baselineVisible = checkMap(pair.baseline.result.visible_results);
  const candidateVisible = checkMap(pair.candidate.result.visible_results);
  const baselineHidden = checkMap(pair.baseline.result.hidden_results);
  const candidateHidden = checkMap(pair.candidate.result.hidden_results);
  return {
    baselineSetup,
    candidateSetup,
    baselineVisible,
    candidateVisible,
    baselineHidden,
    candidateHidden,
    checkIdsMatch: sameSet(new Set(baselineSetup.keys()), new Set(candidateSetup.keys()))
      && sameSet(new Set(baselineVisible.keys()), new Set(candidateVisible.keys()))
      && sameSet(new Set(baselineHidden.keys()), new Set(candidateHidden.keys())),
  };
}

function resultHasIncompleteEvidence(entry) {
  const { result, report } = entry;
  return !report.provenance.complete
    || result.status === "incomplete"
    || result.adapter_classification === "unavailable"
    || result.incomplete_evidence.length > 0
    || [...result.setup_results, ...result.visible_results, ...result.hidden_results]
      .some((check) => check.status === "unavailable");
}

function provenFailure(status) {
  return status === "failed" || status === "timed_out";
}

function newCheckFailures(baselineMap, candidateMap) {
  const failures = [];
  for (const [checkId, baselineStatus] of baselineMap.entries()) {
    const candidateStatus = candidateMap.get(checkId);
    if (baselineStatus === "passed" && provenFailure(candidateStatus)) failures.push(checkId);
  }
  return failures;
}

function pairRegression(pair, shape) {
  const baseline = pair.baseline.result;
  const candidate = pair.candidate.result;
  const setup = newCheckFailures(shape.baselineSetup, shape.candidateSetup);
  const visible = newCheckFailures(shape.baselineVisible, shape.candidateVisible);
  const hidden = newCheckFailures(shape.baselineHidden, shape.candidateHidden);
  const adapterRegression = baseline.adapter_classification === "passed"
    && ["failed", "timed_out"].includes(candidate.adapter_classification);
  const resultRegression = shape.checkIdsMatch && baseline.status === "passed" && candidate.status === "failed";
  return {
    adapterRegression,
    resultRegression,
    setup,
    visible,
    hidden,
    any: adapterRegression || resultRegression || setup.length > 0 || visible.length > 0 || hidden.length > 0,
  };
}

function safeRatio(candidate, baseline) {
  if (baseline === 0) return candidate === 0 ? 1 : null;
  return candidate / baseline;
}

function costMetrics(completePairs) {
  const costs = completePairs.flatMap((pair) => [pair.baseline.result.cost, pair.candidate.result.cost]);
  if (costs.some((cost) => !cost.available)) {
    return {
      available: false,
      baseline_total: null,
      candidate_total: null,
      delta: null,
      ratio: null,
      currency: null,
    };
  }
  const currencies = new Set(costs.map((cost) => cost.currency));
  if (currencies.size !== 1) {
    return {
      available: false,
      baseline_total: null,
      candidate_total: null,
      delta: null,
      ratio: null,
      currency: null,
    };
  }
  const baselineTotal = completePairs.reduce((sum, pair) => sum + pair.baseline.result.cost.value, 0);
  const candidateTotal = completePairs.reduce((sum, pair) => sum + pair.candidate.result.cost.value, 0);
  return {
    available: true,
    baseline_total: baselineTotal,
    candidate_total: candidateTotal,
    delta: candidateTotal - baselineTotal,
    ratio: safeRatio(candidateTotal, baselineTotal),
    currency: [...currencies][0],
  };
}

function durationMetrics(completePairs) {
  const baselineTotal = completePairs.reduce((sum, pair) => sum + pair.baseline.result.duration_ms, 0);
  const candidateTotal = completePairs.reduce((sum, pair) => sum + pair.candidate.result.duration_ms, 0);
  return {
    baseline_total: baselineTotal,
    candidate_total: candidateTotal,
    delta: candidateTotal - baselineTotal,
    ratio: safeRatio(candidateTotal, baselineTotal),
  };
}

function targetMetrics(completePairs, policy) {
  const targetIds = new Set(policy.target.scenario_ids);
  const pairs = completePairs.filter((pair) => targetIds.has(pair.scenarioId));
  if (pairs.length === 0) {
    return {
      available: false,
      failure_family: policy.target.failure_family,
      baseline_pass_rate: null,
      candidate_pass_rate: null,
      delta: null,
      minimum_required: policy.target.minimum_improvement,
    };
  }
  const baselinePassRate = pairs.filter((pair) => pair.baseline.result.status === "passed").length / pairs.length;
  const candidatePassRate = pairs.filter((pair) => pair.candidate.result.status === "passed").length / pairs.length;
  return {
    available: true,
    failure_family: policy.target.failure_family,
    baseline_pass_rate: baselinePassRate,
    candidate_pass_rate: candidatePassRate,
    delta: candidatePassRate - baselinePassRate,
    minimum_required: policy.target.minimum_improvement,
  };
}

function orderedReasons(state, decision) {
  if (decision === "accepted") return ["ACCEPTED"];
  const known = [...FAILURE_REASON_ORDER, ...INCONCLUSIVE_REASON_ORDER];
  const selected = new Set([...state.failureReasons, ...state.inconclusiveReasons]);
  const ordered = known.filter((code) => selected.delete(code));
  return [...ordered, ...[...selected].sort()];
}

function evidenceRef(kind, id, value) {
  return `${kind}:${id}:${fingerprint(value)}`;
}

function timestampValue(clock) {
  const value = clock();
  const timestamp = value instanceof Date ? value.toISOString() : String(value);
  assertIsoTimestamp(timestamp, "decision created_at");
  return timestamp;
}

export function assessCandidate({
  reports,
  reportAttestations = [],
  staticEvidence = null,
  baselinePermissionSnapshot = null,
  candidatePermissionSnapshot = null,
  policy,
  suiteManifest,
  canonicalScenarios,
  baselineId,
  candidateId,
  clock = () => new Date(),
  idFactory = () => randomUUID(),
} = {}) {
  assertSafePersistenceId(baselineId, "baselineId");
  assertSafePersistenceId(candidateId, "candidateId");
  if (baselineId === candidateId) fail("ACCEPTANCE_PROFILE_IDS", "baselineId and candidateId must differ");
  validateAcceptancePolicy(policy);
  validateSuiteManifest(suiteManifest);
  const canonicalCorpus = resolveCanonicalCorpus({ canonicalScenarios, manifest: suiteManifest, policy });
  const {
    expectedPairKeys,
    pairUniverseFingerprint,
    scenarioCorpusFingerprint,
    scenarioFingerprintById,
  } = canonicalCorpus;
  if (!Array.isArray(reports) || reports.length === 0) fail("ACCEPTANCE_REPORTS", "reports must be a non-empty array");
  if (!Array.isArray(reportAttestations)) fail("ACCEPTANCE_REPORT_ATTESTATIONS", "reportAttestations must be an array");

  const suppliedAttestations = new Map();
  for (const attestation of reportAttestations) {
    const id = attestation?.evaluation_run_id;
    if (typeof id !== "string") continue;
    if (suppliedAttestations.has(id)) fail("ACCEPTANCE_REPORT_ATTESTATIONS", `duplicate report attestation ${id}`);
    suppliedAttestations.set(id, attestation);
  }

  const reportIds = new Set();
  const reportFingerprints = [];
  const observedProfileFingerprints = new Map();
  const trustedReportIds = new Set();
  for (const report of reports) {
    validateLiveReport(report);
    if (reportIds.has(report.evaluation_run_id)) {
      fail("ACCEPTANCE_DUPLICATE_REPORT", `duplicate evaluation_run_id ${report.evaluation_run_id}`);
    }
    reportIds.add(report.evaluation_run_id);
    const attestation = suppliedAttestations.get(report.evaluation_run_id);
    const trusted = attestation !== undefined && trustedReportAttestation(attestation, report);
    if (trusted) trustedReportIds.add(report.evaluation_run_id);
    reportFingerprints.push({
      evaluation_run_id: report.evaluation_run_id,
      fingerprint: fingerprint(report),
      generation: trusted ? attestation.generation : null,
      json_text_fingerprint: trusted ? attestation.json_text_fingerprint : null,
      markdown_fingerprint: trusted ? attestation.markdown_fingerprint : null,
      marker_fingerprint: trusted ? attestation.marker_fingerprint : null,
      artifact_attestation_fingerprint: trusted ? reportAttestationBinding(attestation) : null,
    });
    if (trusted && report.provenance.evidence_kind === "live") {
      for (const result of report.results) {
        const existingFingerprint = observedProfileFingerprints.get(result.profile_role);
        if (existingFingerprint && existingFingerprint !== result.profile_fingerprint) {
          fail(
            "ACCEPTANCE_PROFILE_FINGERPRINT",
            `reports have inconsistent ${result.profile_role} profile_fingerprint values`,
          );
        }
        observedProfileFingerprints.set(result.profile_role, result.profile_fingerprint);
      }
    }
  }
  if (
    observedProfileFingerprints.has("baseline")
    && observedProfileFingerprints.has("candidate")
    && observedProfileFingerprints.get("baseline") === observedProfileFingerprints.get("candidate")
  ) {
    fail("ACCEPTANCE_PROFILE_FINGERPRINT", "baseline and candidate profile_fingerprint values must differ across reports");
  }
  reportFingerprints.sort((a, b) => a.evaluation_run_id.localeCompare(b.evaluation_run_id));

  const state = {
    failureReasons: new Set(),
    inconclusiveReasons: new Set(),
    missingEvidence: new Set(),
  };
  const hardGates = {};
  const evidenceRefs = [
    `policy:${policy.policy_version}:${fingerprint(policy)}`,
    `suite:${suiteManifest.manifest_version}:${fingerprint(suiteManifest)}`,
    `scenario-corpus:${scenarioCorpusFingerprint}`,
    `pair-universe:${pairUniverseFingerprint}`,
    ...reportFingerprints.map((entry) => entry.artifact_attestation_fingerprint === null
      ? `report-untrusted:${entry.evaluation_run_id}:${entry.fingerprint}`
      : `report-artifacts:${entry.evaluation_run_id}:${entry.artifact_attestation_fingerprint}`),
  ];
  for (const report of reports) {
    if (!trustedReportIds.has(report.evaluation_run_id)) {
      addMissing(state, "UNTRUSTED_LIVE_REPORT", `report:${report.evaluation_run_id}:artifact_attestation`);
    }
  }

  const staticValidation = validateOptionalEvidence(staticEvidence, validateStaticEvidence);
  let trustedStaticEvidence = null;
  if (staticEvidence === null || staticEvidence === undefined) {
    addMissing(state, "MISSING_STATIC_VERIFICATION", "static_verification");
    hardGates.static_verification = gate("inconclusive");
  } else if (staticValidation.error) {
    const untrusted = ["ACCEPTANCE_STATIC_PRODUCER", "ACCEPTANCE_STATIC_SOURCE"].includes(staticValidation.error.code);
    addMissing(
      state,
      untrusted ? "UNTRUSTED_STATIC_VERIFICATION" : "INVALID_STATIC_VERIFICATION",
      `static_verification:${untrusted ? "untrusted" : "invalid"}`,
    );
    hardGates.static_verification = gate("inconclusive");
  } else {
    evidenceRefs.push(evidenceRef("static", staticValidation.value.candidate_id, staticValidation.value));
    if (staticValidation.value.candidate_id !== candidateId) {
      addMissing(state, "UNTRUSTED_STATIC_VERIFICATION", "static_verification:candidate_id");
      hardGates.static_verification = gate("inconclusive");
    } else if (!staticValidation.value.complete) {
      addMissing(state, "INCOMPLETE_STATIC_VERIFICATION", "static_verification:complete");
      hardGates.static_verification = gate("inconclusive");
    } else if (!staticValidation.value.passed) {
      trustedStaticEvidence = staticValidation.value;
      state.failureReasons.add("STATIC_VERIFICATION_FAILED");
      hardGates.static_verification = gate("failed", { command_id: staticValidation.value.command_id });
    } else {
      trustedStaticEvidence = staticValidation.value;
      hardGates.static_verification = gate("passed", { command_id: staticValidation.value.command_id });
    }
  }

  const permissionInputs = [
    ["baseline", baselinePermissionSnapshot, baselineId],
    ["candidate", candidatePermissionSnapshot, candidateId],
  ];
  const permissions = {};
  for (const [role, snapshot, expectedProfileId] of permissionInputs) {
    const upper = role.toUpperCase();
    const validation = validateOptionalEvidence(snapshot, validatePermissionSnapshot);
    if (snapshot === null || snapshot === undefined) {
      addMissing(state, `MISSING_${upper}_PERMISSION_SNAPSHOT`, `permission_snapshot:${role}`);
    } else if (validation.error) {
      const untrusted = ["ACCEPTANCE_PERMISSION_PRODUCER", "ACCEPTANCE_PERMISSION_SOURCE"].includes(validation.error.code);
      addMissing(
        state,
        `${untrusted ? "UNTRUSTED" : "INVALID"}_${upper}_PERMISSION_SNAPSHOT`,
        `permission_snapshot:${role}:${untrusted ? "untrusted" : "invalid"}`,
      );
    } else {
      permissions[role] = validation.value;
      evidenceRefs.push(evidenceRef("permission", role, validation.value));
      if (validation.value.profile_id !== expectedProfileId) {
        addMissing(state, `UNTRUSTED_${upper}_PERMISSION_SNAPSHOT`, `permission_snapshot:${role}:profile_id`);
        permissions[role] = null;
      } else if (validation.value.source !== "installed_runtime") {
        addMissing(state, `UNTRUSTED_${upper}_PERMISSION_SNAPSHOT`, `permission_snapshot:${role}:source`);
        permissions[role] = null;
      } else if (!validation.value.complete) {
        addMissing(state, `INCOMPLETE_${upper}_PERMISSION_SNAPSHOT`, `permission_snapshot:${role}:complete`);
        permissions[role] = null;
      }
    }
  }

  if (!permissions.baseline || !permissions.candidate) {
    hardGates.permission_surface = gate("inconclusive", { widened_permissions: [] });
  } else {
    const baselineKeys = new Set(Object.keys(permissions.baseline.permissions));
    const candidateKeys = new Set(Object.keys(permissions.candidate.permissions));
    const widened = [...baselineKeys]
      .filter((key) => candidateKeys.has(key))
      .filter((key) => permissionRank[permissions.candidate.permissions[key]] > permissionRank[permissions.baseline.permissions[key]])
      .sort();
    if (!sameSet(baselineKeys, candidateKeys)) {
      addMissing(state, "PERMISSION_KEYS_MISMATCH", "permission_snapshot:permission_keys");
      if (widened.length > 0) state.failureReasons.add("PERMISSION_SURFACE_WIDENED");
      hardGates.permission_surface = gate("inconclusive", { widened_permissions: widened });
    } else if (widened.length > 0) {
      state.failureReasons.add("PERMISSION_SURFACE_WIDENED");
      hardGates.permission_surface = gate("failed", { widened_permissions: widened });
    } else {
      hardGates.permission_surface = gate("passed", { widened_permissions: [] });
    }
  }

  const membership = suiteMembership(suiteManifest);
  const expectedPairKeySet = new Set(expectedPairKeys);
  const resultEntries = { baseline: new Map(), candidate: new Map() };
  const trustedProfileFingerprints = {
    baseline: permissions.baseline?.profile_fingerprint ?? null,
    candidate: permissions.candidate?.profile_fingerprint ?? null,
  };
  const aggregatePairKeys = new Set();
  const aggregateOperationalRunIds = new Set();
  for (const report of reports) {
    if (!trustedReportIds.has(report.evaluation_run_id)) continue;
    for (const result of report.results) {
      const resultKey = `${result.profile_role}:${scenarioRepetitionKey(result.scenario_id, result.repetition)}`;
      if (aggregatePairKeys.has(resultKey)) fail("ACCEPTANCE_DUPLICATE_PAIR", `reports contain duplicate result pair ${resultKey}`);
      aggregatePairKeys.add(resultKey);
      if (aggregateOperationalRunIds.has(result.operational_run_id)) {
        fail("ACCEPTANCE_DUPLICATE_OPERATIONAL_RUN", `reports reuse operational_run_id ${result.operational_run_id}`);
      }
      aggregateOperationalRunIds.add(result.operational_run_id);
      const suite = membership.get(result.scenario_id);
      if (!suite) fail("ACCEPTANCE_UNKNOWN_SCENARIO", `report references scenario absent from suite manifest: ${result.scenario_id}`);
      if (report.provenance.evidence_kind === "infrastructure_self_test") {
        if (report.provenance.producer_id !== policy.expected_producer_ids.infrastructure_self_test) {
          state.inconclusiveReasons.add("UNTRUSTED_LIVE_REPORT");
          state.missingEvidence.add(`report:${report.evaluation_run_id}:producer_id`);
        }
        continue;
      }
      if (suite === "infrastructure") continue;
      const pairKey = scenarioRepetitionKey(result.scenario_id, result.repetition);
      if (!expectedPairKeySet.has(pairKey)) {
        fail("ACCEPTANCE_UNEXPECTED_PAIR", `report contains non-expected behavioral pair ${pairKey}`);
      }
      if (report.provenance.producer_id !== policy.expected_producer_ids.live_evaluation) {
        state.inconclusiveReasons.add("UNTRUSTED_LIVE_REPORT");
        state.missingEvidence.add(`report:${report.evaluation_run_id}:producer_id`);
        continue;
      }
      resultEntries[result.profile_role].set(pairKey, { result, report, suite });
      if (!report.provenance.complete) {
        state.inconclusiveReasons.add("INCOMPLETE_LIVE_REPORT");
        state.missingEvidence.add(`report:${report.evaluation_run_id}:complete`);
      }
    }
  }

  let evidenceIdentityIncomplete = reports.some((report) => !trustedReportIds.has(report.evaluation_run_id));
  const identityMismatch = (role, detail) => {
    const upper = role.toUpperCase();
    evidenceIdentityIncomplete = true;
    state.inconclusiveReasons.add(`MISMATCHED_${upper}_EVIDENCE_FINGERPRINT`);
    state.missingEvidence.add(`evidence_identity:${role}:${detail}`);
  };
  if (!trustedStaticEvidence) {
    evidenceIdentityIncomplete = true;
    state.missingEvidence.add("evidence_identity:static_verification");
  }
  for (const role of PROFILE_ROLES) {
    if (!permissions[role]) {
      evidenceIdentityIncomplete = true;
      state.missingEvidence.add(`evidence_identity:${role}:permission_snapshot`);
    }
  }
  if (
    trustedStaticEvidence
    && permissions.candidate
    && permissions.candidate.subject_fingerprint !== trustedStaticEvidence.repository_fingerprint
  ) {
    identityMismatch("candidate", "permission_subject_fingerprint");
  }
  const observedLiveRoles = new Set();
  for (const report of reports.filter((entry) => (
    trustedReportIds.has(entry.evaluation_run_id)
    && entry.provenance.evidence_kind === "live"
  ))) {
    if (
      report.provenance.producer_id !== policy.expected_producer_ids.live_evaluation
      || !report.provenance.complete
    ) {
      evidenceIdentityIncomplete = true;
      state.missingEvidence.add(`evidence_identity:report:${report.evaluation_run_id}:provenance`);
    }
    for (const result of report.results) {
      observedLiveRoles.add(result.profile_role);
      if (
        trustedStaticEvidence
        && result.repository_fingerprint !== trustedStaticEvidence.repository_fingerprint
      ) {
        identityMismatch(result.profile_role, `${result.scenario_id}#${result.repetition}:repository_fingerprint`);
      }
      if (
        permissions[result.profile_role]
        && result.profile_fingerprint !== permissions[result.profile_role].profile_fingerprint
      ) {
        identityMismatch(result.profile_role, `${result.scenario_id}#${result.repetition}:profile_fingerprint`);
      }
    }
  }
  for (const role of PROFILE_ROLES) {
    if (!observedLiveRoles.has(role)) {
      evidenceIdentityIncomplete = true;
      state.missingEvidence.add(`evidence_identity:${role}:live_result`);
    }
  }
  hardGates.evidence_identity = gate(evidenceIdentityIncomplete ? "inconclusive" : "passed");

  const pairs = [];
  const completePairs = [];
  const incompletePairKeys = new Set();
  const missingPairKeys = new Set();
  for (const key of expectedPairKeys) {
    const baseline = resultEntries.baseline.get(key);
    const candidate = resultEntries.candidate.get(key);
    const { scenarioId, repetition } = parseScenarioRepetitionKey(key);
    if (!baseline || !candidate) {
      missingPairKeys.add(key);
      state.inconclusiveReasons.add("MISSING_REQUIRED_PAIR");
      state.missingEvidence.add(`pair:${key}:${baseline ? "candidate" : candidate ? "baseline" : "baseline,candidate"}`);
      continue;
    }
    const pair = { key, scenarioId, repetition, suite: membership.get(scenarioId), baseline, candidate };
    pairs.push(pair);
    const shape = pairShape(pair);
    pair.shape = shape;
    const canonicalScenarioFingerprint = scenarioFingerprintById.get(scenarioId);
    pair.scenarioFingerprintMatches = (
      baseline.result.scenario_fingerprint === canonicalScenarioFingerprint
      && candidate.result.scenario_fingerprint === canonicalScenarioFingerprint
    );
    let complete = true;
    if (!pair.scenarioFingerprintMatches) {
      complete = false;
      state.inconclusiveReasons.add("MISMATCHED_SCENARIO_FINGERPRINT");
      state.missingEvidence.add(`pair:${key}:scenario_fingerprint`);
    }
    if (!shape.checkIdsMatch) {
      complete = false;
      state.inconclusiveReasons.add("MISMATCHED_CHECK_IDS");
      state.missingEvidence.add(`pair:${key}:check_ids`);
    }
    if (resultHasIncompleteEvidence(baseline) || resultHasIncompleteEvidence(candidate)) {
      complete = false;
      state.inconclusiveReasons.add("INCOMPLETE_REQUIRED_PAIR");
      state.missingEvidence.add(`pair:${key}:complete`);
    }
    if (complete) completePairs.push(pair);
    else incompletePairKeys.add(key);
  }

  hardGates.required_pairs = missingPairKeys.size > 0 || incompletePairKeys.size > 0
    ? gate("inconclusive", {
      expected_count: expectedPairKeys.length,
      complete_count: completePairs.length,
      missing_pair_keys: [...missingPairKeys].sort(comparePairKeys),
      incomplete_pair_keys: [...incompletePairKeys].sort(comparePairKeys),
    })
    : gate("passed", {
      expected_count: expectedPairKeys.length,
      complete_count: completePairs.length,
      missing_pair_keys: [],
      incomplete_pair_keys: [],
    });

  const regressionByPair = new Map();
  for (const pair of pairs.filter((entry) => entry.scenarioFingerprintMatches)) {
    regressionByPair.set(pair.key, pairRegression(pair, pair.shape));
  }
  const canaryRegressionKeys = pairs
    .filter((pair) => pair.suite === "canary" && regressionByPair.get(pair.key)?.any)
    .map((pair) => pair.key)
    .sort(comparePairKeys);
  const heldOutRegressionKeys = pairs
    .filter((pair) => pair.suite === "held_out" && regressionByPair.get(pair.key)?.any)
    .map((pair) => pair.key)
    .sort(comparePairKeys);
  const newHiddenFailures = pairs
    .filter((pair) => regressionByPair.has(pair.key))
    .flatMap((pair) => regressionByPair.get(pair.key).hidden.map((checkId) => `${pair.key}:${checkId}`))
    .sort();

  const incompleteSuites = new Set([...missingPairKeys, ...incompletePairKeys].map((key) => membership.get(parseScenarioRepetitionKey(key).scenarioId)));
  if (canaryRegressionKeys.length > 0) {
    state.failureReasons.add("CANARY_REGRESSION");
    hardGates.canary_regressions = gate("failed", { regression_pair_keys: canaryRegressionKeys });
  } else if (incompleteSuites.has("canary")) {
    hardGates.canary_regressions = gate("inconclusive", { regression_pair_keys: [] });
  } else {
    hardGates.canary_regressions = gate("passed", { regression_pair_keys: [] });
  }
  if (heldOutRegressionKeys.length > 0) {
    state.failureReasons.add("HELD_OUT_REGRESSION");
    hardGates.held_out_regressions = gate("failed", { regression_pair_keys: heldOutRegressionKeys });
  } else if (incompleteSuites.has("held_out")) {
    hardGates.held_out_regressions = gate("inconclusive", { regression_pair_keys: [] });
  } else {
    hardGates.held_out_regressions = gate("passed", { regression_pair_keys: [] });
  }
  if (newHiddenFailures.length > 0) {
    state.failureReasons.add("NEW_HIDDEN_CHECK_FAILURE");
    hardGates.hidden_check_regressions = gate("failed", { failures: newHiddenFailures });
  } else if (missingPairKeys.size > 0 || incompletePairKeys.size > 0) {
    hardGates.hidden_check_regressions = gate("inconclusive", { failures: [] });
  } else {
    hardGates.hidden_check_regressions = gate("passed", { failures: [] });
  }

  const targetExpectedKeys = expectedPairKeys.filter((key) => policy.target.scenario_ids.includes(parseScenarioRepetitionKey(key).scenarioId));
  const targetComplete = targetExpectedKeys.every((key) => completePairs.some((pair) => pair.key === key));
  const target = targetMetrics(completePairs, policy);
  if (!targetComplete || !target.available) {
    addMissing(state, "TARGET_EVIDENCE_INCOMPLETE", "target_improvement");
    hardGates.target_improvement = gate("inconclusive", { delta: null, minimum_required: policy.target.minimum_improvement });
  } else if (target.delta + Number.EPSILON < policy.target.minimum_improvement) {
    state.failureReasons.add("TARGET_IMPROVEMENT_BELOW_THRESHOLD");
    hardGates.target_improvement = gate("failed", {
      delta: target.delta,
      minimum_required: policy.target.minimum_improvement,
    });
  } else {
    hardGates.target_improvement = gate("passed", {
      delta: target.delta,
      minimum_required: policy.target.minimum_improvement,
    });
  }

  const costs = costMetrics(completePairs);
  if (policy.cost_ceiling === undefined) {
    hardGates.cost_ceiling = gate("not_applicable");
  } else if (
    Object.hasOwn(policy.cost_ceiling, "maximum_candidate_total")
    && costs.available
    && costs.currency === policy.cost_ceiling.currency
    && costs.candidate_total > policy.cost_ceiling.maximum_candidate_total
  ) {
    state.failureReasons.add("COST_CEILING_EXCEEDED");
    hardGates.cost_ceiling = gate("failed", {
      ratio: costs.ratio,
      candidate_total: costs.candidate_total,
    });
  } else if (completePairs.length !== expectedPairKeys.length || !costs.available || costs.currency !== policy.cost_ceiling.currency) {
    addMissing(state, "COST_EVIDENCE_UNAVAILABLE", "cost");
    hardGates.cost_ceiling = gate("inconclusive");
  } else {
    const ratioExceeded = Object.hasOwn(policy.cost_ceiling, "maximum_ratio")
      && (costs.ratio === null || costs.ratio > policy.cost_ceiling.maximum_ratio);
    const totalExceeded = Object.hasOwn(policy.cost_ceiling, "maximum_candidate_total")
      && costs.candidate_total > policy.cost_ceiling.maximum_candidate_total;
    if (ratioExceeded || totalExceeded) {
      state.failureReasons.add("COST_CEILING_EXCEEDED");
      hardGates.cost_ceiling = gate("failed", {
        ratio: costs.ratio,
        candidate_total: costs.candidate_total,
      });
    } else {
      hardGates.cost_ceiling = gate("passed", {
        ratio: costs.ratio,
        candidate_total: costs.candidate_total,
      });
    }
  }

  const durations = durationMetrics(completePairs);
  if (policy.duration_ceiling === undefined) {
    hardGates.duration_ceiling = gate("not_applicable");
  } else if (
    Object.hasOwn(policy.duration_ceiling, "maximum_candidate_total_ms")
    && durations.candidate_total > policy.duration_ceiling.maximum_candidate_total_ms
  ) {
    state.failureReasons.add("DURATION_CEILING_EXCEEDED");
    hardGates.duration_ceiling = gate("failed", {
      ratio: durations.ratio,
      candidate_total_ms: durations.candidate_total,
    });
  } else if (completePairs.length !== expectedPairKeys.length) {
    addMissing(state, "DURATION_EVIDENCE_INCOMPLETE", "duration");
    hardGates.duration_ceiling = gate("inconclusive");
  } else {
    const ratioExceeded = Object.hasOwn(policy.duration_ceiling, "maximum_ratio")
      && (durations.ratio === null || durations.ratio > policy.duration_ceiling.maximum_ratio);
    const totalExceeded = Object.hasOwn(policy.duration_ceiling, "maximum_candidate_total_ms")
      && durations.candidate_total > policy.duration_ceiling.maximum_candidate_total_ms;
    if (ratioExceeded || totalExceeded) {
      state.failureReasons.add("DURATION_CEILING_EXCEEDED");
      hardGates.duration_ceiling = gate("failed", {
        ratio: durations.ratio,
        candidate_total_ms: durations.candidate_total,
      });
    } else {
      hardGates.duration_ceiling = gate("passed", {
        ratio: durations.ratio,
        candidate_total_ms: durations.candidate_total,
      });
    }
  }

  const gateStatuses = HARD_GATE_ORDER.map((name) => hardGates[name].status);
  const decision = gateStatuses.includes("inconclusive")
    ? "inconclusive"
    : gateStatuses.includes("failed")
      ? "rejected"
      : "accepted";
  const decisionId = assertSafePersistenceId(idFactory("decision"), "decision_id");
  const createdAt = timestampValue(clock);
  const decisionDocument = {
    schema_version: ACCEPTANCE_SCHEMA_VERSION,
    decision_id: decisionId,
    policy_version: policy.policy_version,
    policy_fingerprint: fingerprint(policy),
    scenario_corpus_fingerprint: scenarioCorpusFingerprint,
    pair_universe_fingerprint: pairUniverseFingerprint,
    input_report_fingerprints: reportFingerprints,
    baseline_id: baselineId,
    candidate_id: candidateId,
    profile_fingerprints: trustedProfileFingerprints,
    paired_scenario_repetition_keys: pairs.map((pair) => pair.key).sort(comparePairKeys),
    hard_gates: hardGates,
    metric_deltas: {
      target_success_rate: target,
      cost: costs,
      duration_ms: durations,
      regressions: {
        canary_pair_count: canaryRegressionKeys.length,
        held_out_pair_count: heldOutRegressionKeys.length,
        new_hidden_check_count: newHiddenFailures.length,
      },
    },
    decision,
    reason_codes: orderedReasons(state, decision),
    evidence_refs: [...new Set(evidenceRefs)].sort(),
    missing_evidence: [...state.missingEvidence].sort(),
    created_at: createdAt,
  };
  assertPersistenceSafe(decisionDocument, { label: "acceptance decision" });
  return decisionDocument;
}

function timestampSlug(timestamp) {
  assertIsoTimestamp(timestamp, "decision timestamp");
  return timestamp.replace(/[-:]/g, "").replace(/\.\d+(?=Z|[+-])/, "").replace("+", "p").replace(/(?<!^)\-/g, "m");
}

function markdownList(values) {
  return values.length === 0 ? "- none" : values.map((value) => `- ${value}`).join("\n");
}

function assertFiniteNumberOrNull(value, label, { nonNegative = false } = {}) {
  if (value === null) return value;
  if (typeof value !== "number" || !Number.isFinite(value) || (nonNegative && value < 0)) {
    fail("ACCEPTANCE_DECISION_NUMBER", `${label} must be ${nonNegative ? "a non-negative " : "a finite "}number or null`);
  }
  return value;
}

function validateDecisionStringArray(values, label, { pattern = null, allowEmpty = true } = {}) {
  assertUniqueStrings(values, label, { allowEmpty, safeIds: false });
  for (const [index, value] of values.entries()) {
    assertNonEmptyString(value, `${label}[${index}]`, { maxLength: 512, pattern });
  }
}

function validateDecisionGate(value, label, allowedDetails) {
  assertExactKeys(value, {
    allowed: ["status", ...allowedDetails],
    required: ["status"],
  }, label);
  assertEnum(value.status, ["passed", "failed", "inconclusive", "not_applicable"], `${label}.status`);
}

export function validateDecisionDocument(decision) {
  assertExactKeys(decision, {
    allowed: [
      "schema_version",
      "decision_id",
      "policy_version",
      "policy_fingerprint",
      "scenario_corpus_fingerprint",
      "pair_universe_fingerprint",
      "input_report_fingerprints",
      "baseline_id",
      "candidate_id",
      "profile_fingerprints",
      "paired_scenario_repetition_keys",
      "hard_gates",
      "metric_deltas",
      "decision",
      "reason_codes",
      "evidence_refs",
      "missing_evidence",
      "created_at",
    ],
    required: [
      "schema_version",
      "decision_id",
      "policy_version",
      "policy_fingerprint",
      "scenario_corpus_fingerprint",
      "pair_universe_fingerprint",
      "input_report_fingerprints",
      "baseline_id",
      "candidate_id",
      "profile_fingerprints",
      "paired_scenario_repetition_keys",
      "hard_gates",
      "metric_deltas",
      "decision",
      "reason_codes",
      "evidence_refs",
      "missing_evidence",
      "created_at",
    ],
  }, "decision");
  if (decision.schema_version !== ACCEPTANCE_SCHEMA_VERSION) {
    fail("ACCEPTANCE_DECISION_SCHEMA", `decision.schema_version must be ${ACCEPTANCE_SCHEMA_VERSION}`);
  }
  assertSafeId(decision.decision_id, "decision.decision_id");
  assertSafeId(decision.policy_version, "decision.policy_version");
  assertFingerprint(decision.policy_fingerprint, "decision.policy_fingerprint");
  assertFingerprint(decision.scenario_corpus_fingerprint, "decision.scenario_corpus_fingerprint");
  assertFingerprint(decision.pair_universe_fingerprint, "decision.pair_universe_fingerprint");
  if (!Array.isArray(decision.input_report_fingerprints) || decision.input_report_fingerprints.length === 0) {
    fail("ACCEPTANCE_DECISION_REPORTS", "decision.input_report_fingerprints must be a non-empty array");
  }
  const reportIds = new Set();
  for (const [index, report] of decision.input_report_fingerprints.entries()) {
    const label = `decision.input_report_fingerprints[${index}]`;
    assertExactKeys(report, {
      allowed: [
        "evaluation_run_id",
        "fingerprint",
        "generation",
        "json_text_fingerprint",
        "markdown_fingerprint",
        "marker_fingerprint",
        "artifact_attestation_fingerprint",
      ],
      required: [
        "evaluation_run_id",
        "fingerprint",
        "generation",
        "json_text_fingerprint",
        "markdown_fingerprint",
        "marker_fingerprint",
        "artifact_attestation_fingerprint",
      ],
    }, label);
    assertSafeId(report.evaluation_run_id, `${label}.evaluation_run_id`);
    assertFingerprint(report.fingerprint, `${label}.fingerprint`);
    const artifactFields = [
      "generation",
      "json_text_fingerprint",
      "markdown_fingerprint",
      "marker_fingerprint",
      "artifact_attestation_fingerprint",
    ];
    const presentCount = artifactFields.filter((field) => report[field] !== null).length;
    if (![0, artifactFields.length].includes(presentCount)) {
      fail("ACCEPTANCE_DECISION_REPORT_ATTESTATION", `${label} must contain either a complete artifact attestation or nulls`);
    }
    if (presentCount === artifactFields.length) {
      assertSafeId(report.generation, `${label}.generation`);
      for (const field of artifactFields.slice(1)) assertFingerprint(report[field], `${label}.${field}`);
      const expectedAttestationFingerprint = fingerprint({
        evaluation_run_id: report.evaluation_run_id,
        generation: report.generation,
        report_fingerprint: report.fingerprint,
        json_text_fingerprint: report.json_text_fingerprint,
        markdown_fingerprint: report.markdown_fingerprint,
        json_file: `${report.generation}.json`,
        markdown_file: `${report.generation}.md`,
        marker_fingerprint: report.marker_fingerprint,
      });
      if (report.artifact_attestation_fingerprint !== expectedAttestationFingerprint) {
        fail("ACCEPTANCE_DECISION_REPORT_ATTESTATION", `${label} artifact attestation fingerprint is inconsistent`);
      }
    }
    if (reportIds.has(report.evaluation_run_id)) fail("ACCEPTANCE_DECISION_REPORT_DUPLICATE", `${label} is duplicated`);
    reportIds.add(report.evaluation_run_id);
  }
  assertSafeId(decision.baseline_id, "decision.baseline_id");
  assertSafeId(decision.candidate_id, "decision.candidate_id");
  assertExactKeys(decision.profile_fingerprints, {
    allowed: PROFILE_ROLES,
    required: PROFILE_ROLES,
  }, "decision.profile_fingerprints");
  for (const role of PROFILE_ROLES) {
    if (decision.profile_fingerprints[role] !== null) {
      assertFingerprint(decision.profile_fingerprints[role], `decision.profile_fingerprints.${role}`);
    }
  }
  if (
    decision.profile_fingerprints.baseline !== null
    && decision.profile_fingerprints.baseline === decision.profile_fingerprints.candidate
  ) {
    fail("ACCEPTANCE_DECISION_PROFILE", "decision baseline and candidate profile fingerprints must differ");
  }
  validateDecisionStringArray(decision.paired_scenario_repetition_keys, "decision.paired_scenario_repetition_keys", {
    pattern: /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}#[1-9]\d*$/,
  });

  assertExactKeys(decision.hard_gates, { allowed: HARD_GATE_ORDER, required: HARD_GATE_ORDER }, "decision.hard_gates");
  validateDecisionGate(decision.hard_gates.static_verification, "decision.hard_gates.static_verification", ["command_id"]);
  if (Object.hasOwn(decision.hard_gates.static_verification, "command_id")) {
    if (decision.hard_gates.static_verification.command_id !== "npm-run-verify") {
      fail("ACCEPTANCE_DECISION_COMMAND", "decision static command_id must be npm-run-verify");
    }
  }
  validateDecisionGate(decision.hard_gates.evidence_identity, "decision.hard_gates.evidence_identity", []);
  validateDecisionGate(decision.hard_gates.permission_surface, "decision.hard_gates.permission_surface", ["widened_permissions"]);
  if (Object.hasOwn(decision.hard_gates.permission_surface, "widened_permissions")) {
    validateDecisionStringArray(
      decision.hard_gates.permission_surface.widened_permissions,
      "decision.hard_gates.permission_surface.widened_permissions",
      { pattern: permissionKeyPattern },
    );
  }
  for (const gateName of ["canary_regressions", "held_out_regressions"]) {
    validateDecisionGate(decision.hard_gates[gateName], `decision.hard_gates.${gateName}`, ["regression_pair_keys"]);
    if (Object.hasOwn(decision.hard_gates[gateName], "regression_pair_keys")) {
      validateDecisionStringArray(
        decision.hard_gates[gateName].regression_pair_keys,
        `decision.hard_gates.${gateName}.regression_pair_keys`,
        { pattern: /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}#[1-9]\d*$/ },
      );
    }
  }
  validateDecisionGate(decision.hard_gates.hidden_check_regressions, "decision.hard_gates.hidden_check_regressions", ["failures"]);
  if (Object.hasOwn(decision.hard_gates.hidden_check_regressions, "failures")) {
    validateDecisionStringArray(
      decision.hard_gates.hidden_check_regressions.failures,
      "decision.hard_gates.hidden_check_regressions.failures",
      { pattern: /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}#[1-9]\d*:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/ },
    );
  }
  validateDecisionGate(decision.hard_gates.required_pairs, "decision.hard_gates.required_pairs", [
    "expected_count",
    "complete_count",
    "missing_pair_keys",
    "incomplete_pair_keys",
  ]);
  for (const field of ["expected_count", "complete_count"]) {
    if (Object.hasOwn(decision.hard_gates.required_pairs, field)) {
      assertNonNegativeInteger(decision.hard_gates.required_pairs[field], `decision.hard_gates.required_pairs.${field}`);
    }
  }
  for (const field of ["missing_pair_keys", "incomplete_pair_keys"]) {
    if (Object.hasOwn(decision.hard_gates.required_pairs, field)) {
      validateDecisionStringArray(
        decision.hard_gates.required_pairs[field],
        `decision.hard_gates.required_pairs.${field}`,
        { pattern: /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}#[1-9]\d*$/ },
      );
    }
  }
  validateDecisionGate(decision.hard_gates.target_improvement, "decision.hard_gates.target_improvement", [
    "delta",
    "minimum_required",
  ]);
  if (Object.hasOwn(decision.hard_gates.target_improvement, "delta")) {
    assertFiniteNumberOrNull(decision.hard_gates.target_improvement.delta, "decision.hard_gates.target_improvement.delta");
  }
  if (Object.hasOwn(decision.hard_gates.target_improvement, "minimum_required")) {
    assertRate(decision.hard_gates.target_improvement.minimum_required, "decision.hard_gates.target_improvement.minimum_required");
  }
  validateDecisionGate(decision.hard_gates.cost_ceiling, "decision.hard_gates.cost_ceiling", ["ratio", "candidate_total"]);
  if (Object.hasOwn(decision.hard_gates.cost_ceiling, "ratio")) {
    assertFiniteNumberOrNull(decision.hard_gates.cost_ceiling.ratio, "decision.hard_gates.cost_ceiling.ratio", { nonNegative: true });
  }
  if (Object.hasOwn(decision.hard_gates.cost_ceiling, "candidate_total")) {
    assertFiniteNumberOrNull(decision.hard_gates.cost_ceiling.candidate_total, "decision.hard_gates.cost_ceiling.candidate_total", { nonNegative: true });
  }
  validateDecisionGate(decision.hard_gates.duration_ceiling, "decision.hard_gates.duration_ceiling", [
    "ratio",
    "candidate_total_ms",
  ]);
  if (Object.hasOwn(decision.hard_gates.duration_ceiling, "ratio")) {
    assertFiniteNumberOrNull(decision.hard_gates.duration_ceiling.ratio, "decision.hard_gates.duration_ceiling.ratio", { nonNegative: true });
  }
  if (Object.hasOwn(decision.hard_gates.duration_ceiling, "candidate_total_ms")) {
    assertFiniteNumberOrNull(
      decision.hard_gates.duration_ceiling.candidate_total_ms,
      "decision.hard_gates.duration_ceiling.candidate_total_ms",
      { nonNegative: true },
    );
  }

  assertExactKeys(decision.metric_deltas, {
    allowed: ["target_success_rate", "cost", "duration_ms", "regressions"],
    required: ["target_success_rate", "cost", "duration_ms", "regressions"],
  }, "decision.metric_deltas");
  const target = decision.metric_deltas.target_success_rate;
  assertExactKeys(target, {
    allowed: [
      "available",
      "failure_family",
      "baseline_pass_rate",
      "candidate_pass_rate",
      "delta",
      "minimum_required",
    ],
    required: [
      "available",
      "failure_family",
      "baseline_pass_rate",
      "candidate_pass_rate",
      "delta",
      "minimum_required",
    ],
  }, "decision.metric_deltas.target_success_rate");
  assertBoolean(target.available, "decision.metric_deltas.target_success_rate.available");
  assertSafeId(target.failure_family, "decision.metric_deltas.target_success_rate.failure_family");
  for (const field of ["baseline_pass_rate", "candidate_pass_rate", "delta"]) {
    assertFiniteNumberOrNull(target[field], `decision.metric_deltas.target_success_rate.${field}`);
  }
  assertRate(target.minimum_required, "decision.metric_deltas.target_success_rate.minimum_required");

  const cost = decision.metric_deltas.cost;
  assertExactKeys(cost, {
    allowed: ["available", "baseline_total", "candidate_total", "delta", "ratio", "currency"],
    required: ["available", "baseline_total", "candidate_total", "delta", "ratio", "currency"],
  }, "decision.metric_deltas.cost");
  assertBoolean(cost.available, "decision.metric_deltas.cost.available");
  assertFiniteNumberOrNull(cost.baseline_total, "decision.metric_deltas.cost.baseline_total", { nonNegative: true });
  assertFiniteNumberOrNull(cost.candidate_total, "decision.metric_deltas.cost.candidate_total", { nonNegative: true });
  assertFiniteNumberOrNull(cost.delta, "decision.metric_deltas.cost.delta");
  assertFiniteNumberOrNull(cost.ratio, "decision.metric_deltas.cost.ratio", { nonNegative: true });
  if (cost.currency !== null) assertNonEmptyString(cost.currency, "decision.metric_deltas.cost.currency", { maxLength: 3, pattern: /^[A-Z]{3}$/ });

  const duration = decision.metric_deltas.duration_ms;
  assertExactKeys(duration, {
    allowed: ["baseline_total", "candidate_total", "delta", "ratio"],
    required: ["baseline_total", "candidate_total", "delta", "ratio"],
  }, "decision.metric_deltas.duration_ms");
  assertFiniteNumberOrNull(duration.baseline_total, "decision.metric_deltas.duration_ms.baseline_total", { nonNegative: true });
  assertFiniteNumberOrNull(duration.candidate_total, "decision.metric_deltas.duration_ms.candidate_total", { nonNegative: true });
  assertFiniteNumberOrNull(duration.delta, "decision.metric_deltas.duration_ms.delta");
  assertFiniteNumberOrNull(duration.ratio, "decision.metric_deltas.duration_ms.ratio", { nonNegative: true });

  const regressions = decision.metric_deltas.regressions;
  assertExactKeys(regressions, {
    allowed: ["canary_pair_count", "held_out_pair_count", "new_hidden_check_count"],
    required: ["canary_pair_count", "held_out_pair_count", "new_hidden_check_count"],
  }, "decision.metric_deltas.regressions");
  for (const field of ["canary_pair_count", "held_out_pair_count", "new_hidden_check_count"]) {
    assertNonNegativeInteger(regressions[field], `decision.metric_deltas.regressions.${field}`);
  }

  assertEnum(decision.decision, DECISIONS, "decision.decision");
  validateDecisionStringArray(decision.reason_codes, "decision.reason_codes", {
    allowEmpty: false,
    pattern: /^[A-Z][A-Z0-9_]{0,127}$/,
  });
  validateDecisionStringArray(decision.evidence_refs, "decision.evidence_refs", {
    allowEmpty: false,
    pattern: /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/,
  });
  validateDecisionStringArray(decision.missing_evidence, "decision.missing_evidence", {
    pattern: /^[A-Za-z0-9][A-Za-z0-9._,:#/-]{0,511}$/,
  });
  assertIsoTimestamp(decision.created_at, "decision.created_at");
  const statuses = HARD_GATE_ORDER.map((name) => decision.hard_gates[name].status);
  const expectedDecision = statuses.includes("inconclusive")
    ? "inconclusive"
    : statuses.includes("failed")
      ? "rejected"
      : "accepted";
  if (decision.decision !== expectedDecision) {
    fail("ACCEPTANCE_DECISION_CONSISTENCY", `decision must be ${expectedDecision} for its hard-gate statuses`);
  }
  if (
    decision.decision === "accepted"
    && (decision.profile_fingerprints.baseline === null || decision.profile_fingerprints.candidate === null)
  ) {
    fail("ACCEPTANCE_DECISION_PROFILE", "accepted decision requires baseline and candidate profile fingerprints");
  }
  if (
    decision.decision === "accepted"
    && decision.input_report_fingerprints.some((report) => report.artifact_attestation_fingerprint === null)
  ) {
    fail("ACCEPTANCE_DECISION_REPORT_ATTESTATION", "accepted decision requires exact artifact attestations for every report");
  }
  return decision;
}

export function decisionMarkdown(decision) {
  validateDecisionDocument(decision);
  const lines = [
    "# Candidate Acceptance Decision",
    "",
    `Decision: **${decision.decision}**`,
    `Decision ID: ${decision.decision_id}`,
    `Created: ${decision.created_at}`,
    `Baseline: ${decision.baseline_id}`,
    `Candidate: ${decision.candidate_id}`,
    `Baseline profile fingerprint: ${decision.profile_fingerprints.baseline ?? "unavailable"}`,
    `Candidate profile fingerprint: ${decision.profile_fingerprints.candidate ?? "unavailable"}`,
    `Policy: ${decision.policy_version} (${decision.policy_fingerprint})`,
    `Scenario corpus fingerprint: ${decision.scenario_corpus_fingerprint}`,
    `Pair universe fingerprint: ${decision.pair_universe_fingerprint}`,
    "",
    "## Hard gates",
    "",
    ...HARD_GATE_ORDER.map((name) => `- ${name}: ${decision.hard_gates[name].status}`),
    "",
    "## Reason codes",
    "",
    markdownList(decision.reason_codes),
    "",
    "## Compared pairs",
    "",
    markdownList(decision.paired_scenario_repetition_keys),
    "",
    "## Missing evidence",
    "",
    markdownList(decision.missing_evidence),
    "",
  ];
  return lines.join("\n");
}

export function writeDecisionArtifacts({ decision, workspaceRoot, outputDirectory, fileOptions = {} } = {}) {
  validateDecisionDocument(decision);
  if (typeof workspaceRoot !== "string" || workspaceRoot.trim() === "") {
    fail("ACCEPTANCE_WORKSPACE_ROOT", "workspaceRoot must be a non-empty path");
  }
  if (typeof outputDirectory !== "string" || outputDirectory.trim() === "") {
    fail("ACCEPTANCE_OUTPUT_DIRECTORY", "outputDirectory must be a non-empty path");
  }
  const resolvedWorkspace = path.resolve(workspaceRoot);
  const resolvedDirectory = path.resolve(outputDirectory);
  assertConfinedExistingPath(resolvedWorkspace, resolvedWorkspace, { type: "directory" });
  if (resolvedDirectory === resolvedWorkspace || !isInside(resolvedWorkspace, resolvedDirectory)) {
    fail("ACCEPTANCE_OUTPUT_DIRECTORY", "outputDirectory must be strictly inside workspaceRoot");
  }
  ensureConfinedDirectory(resolvedWorkspace, resolvedDirectory);
  const base = `${timestampSlug(decision.created_at)}-${decision.decision_id}`;
  const jsonPath = path.join(resolvedDirectory, `${base}.json`);
  const markdownPath = path.join(resolvedDirectory, `${base}.md`);
  const markerPath = path.join(resolvedDirectory, `${base}.complete.json`);
  const json = `${JSON.stringify(decision, null, 2)}\n`;
  const markdown = decisionMarkdown(decision);
  assertPersistenceSafe(decision, { label: "acceptance decision" });
  assertPersistenceSafe(markdown, { label: "acceptance decision markdown" });
  publishImmutableSet({
    files: [
      { path: jsonPath, contents: json },
      { path: markdownPath, contents: markdown },
    ],
    markerPath,
    markerValue: {
      schema_version: ACCEPTANCE_SCHEMA_VERSION,
      decision_id: decision.decision_id,
      decision_fingerprint: fingerprint(decision),
      json_text_fingerprint: fingerprint(json),
      markdown_fingerprint: fingerprint(markdown),
      json_file: path.basename(jsonPath),
      markdown_file: path.basename(markdownPath),
      completed_at: decision.created_at,
    },
  }, { ...fileOptions, basePath: resolvedWorkspace });
  return { jsonPath, markdownPath, markerPath, decisionFingerprint: fingerprint(decision) };
}
