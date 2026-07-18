import { assertEnum, assertSafeId } from "../feedback/contracts.mjs";
import {
  ENGINEERING_GATE_DECISION_SCHEMA_VERSION,
  GATE_STATUSES,
  PREIMPLEMENTATION_EVIDENCE_SCHEMA_VERSION,
  QUALITY_GATE_REASON_CODES,
} from "./constants.mjs";
import { validateEngineeringDossier } from "./dossier.mjs";
import { validateArchitectureEvaluation } from "./architecture.mjs";
import { requiredEngineeringVerificationTargets } from "./verification-targets.mjs";
import {
  ContractError,
  assertArray,
  assertBoolean,
  assertFingerprint,
  assertIso,
  assertPlain,
  assertSchemaVersion,
  assertString,
  assertStringArray,
  canonicalJson,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
  validateEvidenceReferences,
} from "./validation.mjs";

const GATE_KEYS = Object.freeze([
  "schema_version",
  "gate_id",
  "dossier_id",
  "dossier_fingerprint",
  "task_id",
  "risk_class",
  "status",
  "reasons",
  "check_catalog_fingerprint",
  "preimplementation_evidence_fingerprint",
  "architecture_evaluation_fingerprint",
  "evaluated_at",
  "fingerprint",
]);

function validateCatalogEntry(value, label, kind) {
  const idKey = kind === "check" ? "check_id" : "mechanism_id";
  const keys = [idKey, "trusted_producer", "phases", "available"];
  exact(value, keys, keys, label);
  assertSafeId(value[idKey], `${label}.${idKey}`);
  assertString(value.trusted_producer, `${label}.trusted_producer`, { maxBytes: 256 });
  assertStringArray(value.phases, `${label}.phases`, { min: 1, maxBytes: 64 });
  assertBoolean(value.available, `${label}.available`);
  return value;
}

export function validateEngineeringCheckCatalog(value) {
  exact(value, ["schema_version", "catalog_id", "checks", "mechanisms", "fingerprint"], [
    "schema_version",
    "catalog_id",
    "checks",
    "mechanisms",
    "fingerprint",
  ], "engineering check catalog");
  if (value.schema_version !== 1) throw new ContractError("QUALITY_SCHEMA_VERSION", "engineering check catalog.schema_version must be 1");
  assertSafeId(value.catalog_id, "engineering check catalog.catalog_id");
  assertArray(value.checks, "engineering check catalog.checks", {
    min: 1,
    item: (entry, label) => validateCatalogEntry(entry, label, "check"),
  });
  assertArray(value.mechanisms, "engineering check catalog.mechanisms", {
    item: (entry, label) => validateCatalogEntry(entry, label, "mechanism"),
  });
  for (const [name, entries, key] of [
    ["checks", value.checks, "check_id"],
    ["mechanisms", value.mechanisms, "mechanism_id"],
  ]) {
    const ids = entries.map((entry) => entry[key]);
    if (new Set(ids).size !== ids.length) throw new ContractError("QUALITY_DUPLICATE_ID", `engineering check catalog.${name} contains duplicate IDs`);
  }
  assertFingerprint(value.fingerprint, "engineering check catalog.fingerprint");
  const source = { ...value };
  delete source.fingerprint;
  if (!fingerprintsEqual(value.fingerprint, fingerprint(source))) {
    throw new ContractError("QUALITY_CATALOG_FINGERPRINT", "engineering check catalog fingerprint mismatch");
  }
  return value;
}

export function createEngineeringCheckCatalog(input) {
  exact(input, ["catalog_id", "checks", "mechanisms"], ["catalog_id", "checks", "mechanisms"], "engineering check catalog input");
  const source = {
    schema_version: 1,
    catalog_id: input.catalog_id,
    checks: input.checks,
    mechanisms: input.mechanisms,
  };
  const catalog = { ...source, fingerprint: fingerprint(source) };
  validateEngineeringCheckCatalog(catalog);
  return deepFrozenClone(catalog, "engineering check catalog");
}

const PREIMPLEMENTATION_RECEIPT_STATUSES = Object.freeze(["passed", "failed", "blocked"]);

const BASELINE_ORACLE_OUTCOMES = Object.freeze(["failing_reproducer", "passing_characterization", "unavailable"]);
const BASELINE_ORACLE_REASON_CODES = Object.freeze([
  "matched_expected_failure",
  "matched_passing_characterization",
  "unexpected_pass",
  "unexpected_failure",
  "missing",
  "malformed",
  "timed_out",
  "unrelated_failure",
  "workspace_changed",
  "fixture_fingerprint_mismatch",
  "obligation_mismatch",
]);

function validateBaselineOracleObservation(value, label) {
  assertPlain(value, label);
  const keys = [
    "oracle_id",
    "command",
    "oracle_identity_fingerprint",
    "workspace_fingerprint",
    "expected_outcome",
    "observed_outcome",
    "expected_failure_signature",
    "observed_failure_signature",
    "result_fingerprint",
    "reason_code",
  ];
  exact(value, keys, keys, label);
  assertSafeId(value.oracle_id, `${label}.oracle_id`);
  assertString(value.command, `${label}.command`);
  assertFingerprint(value.oracle_identity_fingerprint, `${label}.oracle_identity_fingerprint`);
  assertFingerprint(value.workspace_fingerprint, `${label}.workspace_fingerprint`);
  assertEnum(value.expected_outcome, ["failing_reproducer", "passing_characterization"], `${label}.expected_outcome`);
  assertEnum(value.observed_outcome, BASELINE_ORACLE_OUTCOMES, `${label}.observed_outcome`);
  assertFingerprint(value.expected_failure_signature, `${label}.expected_failure_signature`);
  assertFingerprint(value.observed_failure_signature, `${label}.observed_failure_signature`, { nullable: true });
  assertFingerprint(value.result_fingerprint, `${label}.result_fingerprint`, { nullable: true });
  assertEnum(value.reason_code, BASELINE_ORACLE_REASON_CODES, `${label}.reason_code`);

  const matchedFailure = value.expected_outcome === "failing_reproducer"
    && value.observed_outcome === "failing_reproducer"
    && value.observed_failure_signature === value.expected_failure_signature
    && value.reason_code === "matched_expected_failure";
  const matchedCharacterization = value.expected_outcome === "passing_characterization"
    && value.observed_outcome === "passing_characterization"
    && value.observed_failure_signature === null
    && value.reason_code === "matched_passing_characterization";
  const unexpectedPass = value.expected_outcome === "failing_reproducer"
    && value.observed_outcome === "passing_characterization"
    && value.observed_failure_signature === null
    && value.reason_code === "unexpected_pass";
  const unexpectedFailure = value.expected_outcome === "passing_characterization"
    && value.observed_outcome === "failing_reproducer"
    && value.observed_failure_signature === value.expected_failure_signature
    && value.reason_code === "unexpected_failure";
  const unavailable = value.observed_outcome === "unavailable"
    && value.observed_failure_signature === null
    && [
      "missing", "malformed", "timed_out", "unrelated_failure", "workspace_changed",
      "fixture_fingerprint_mismatch", "obligation_mismatch",
    ].includes(value.reason_code);
  if (!matchedFailure && !matchedCharacterization && !unexpectedPass && !unexpectedFailure && !unavailable) {
    throw new ContractError("QUALITY_BASELINE_ORACLE_OUTCOME", `${label} has an incoherent expected outcome, observed outcome, signature, or reason`);
  }
  return value;
}

function validateBaselineReceipt(value, label) {
  const keys = [
    "receipt_id",
    "check_id",
    "trusted_producer",
    "phase",
    "status",
    "command_or_mechanism",
    "evidence_fingerprint",
    "completed_at",
    "oracle_observation",
  ];
  exact(value, keys, keys.filter((key) => key !== "oracle_observation"), label);
  assertSafeId(value.receipt_id, `${label}.receipt_id`);
  assertSafeId(value.check_id, `${label}.check_id`);
  assertString(value.trusted_producer, `${label}.trusted_producer`, { maxBytes: 256 });
  assertEnum(value.phase, ["preimplementation"], `${label}.phase`);
  assertEnum(value.status, PREIMPLEMENTATION_RECEIPT_STATUSES, `${label}.status`);
  assertString(value.command_or_mechanism, `${label}.command_or_mechanism`);
  assertFingerprint(value.evidence_fingerprint, `${label}.evidence_fingerprint`);
  assertIso(value.completed_at, `${label}.completed_at`);
  if (Object.hasOwn(value, "oracle_observation")) {
    validateBaselineOracleObservation(value.oracle_observation, `${label}.oracle_observation`);
    if (value.command_or_mechanism !== value.oracle_observation.command
      && value.oracle_observation.reason_code !== "obligation_mismatch") {
      throw new ContractError("QUALITY_BASELINE_ORACLE_BINDING", `${label} command does not match its runner-owned oracle observation`);
    }
    const matched = ["matched_expected_failure", "matched_passing_characterization"].includes(value.oracle_observation.reason_code);
    const mismatched = ["unexpected_pass", "unexpected_failure"].includes(value.oracle_observation.reason_code);
    const expectedStatus = matched ? "passed" : mismatched ? "failed" : "blocked";
    if (value.status !== expectedStatus) {
      throw new ContractError("QUALITY_BASELINE_ORACLE_STATUS", `${label} status does not match its runner-owned oracle outcome`);
    }
  }
  return value;
}

function validatePlanChallengeReceipt(value, label) {
  const keys = [
    "receipt_id",
    "result_id",
    "role",
    "mechanism_id",
    "trusted_producer",
    "phase",
    "status",
    "evidence_fingerprint",
    "completed_at",
  ];
  exact(value, keys, keys, label);
  assertSafeId(value.receipt_id, `${label}.receipt_id`);
  assertSafeId(value.result_id, `${label}.result_id`);
  assertEnum(value.role, ["architect", "reviewer"], `${label}.role`);
  assertSafeId(value.mechanism_id, `${label}.mechanism_id`);
  assertString(value.trusted_producer, `${label}.trusted_producer`, { maxBytes: 256 });
  assertEnum(value.phase, ["preimplementation"], `${label}.phase`);
  assertEnum(value.status, PREIMPLEMENTATION_RECEIPT_STATUSES, `${label}.status`);
  assertFingerprint(value.evidence_fingerprint, `${label}.evidence_fingerprint`);
  assertIso(value.completed_at, `${label}.completed_at`);
  return value;
}

function preimplementationEvidenceFingerprintInput(value) {
  const copy = { ...value };
  delete copy.fingerprint;
  return copy;
}

export function validateEngineeringPreimplementationEvidence(value) {
  const keys = [
    "schema_version",
    "evidence_id",
    "dossier_id",
    "dossier_fingerprint",
    "baseline_receipts",
    "plan_challenge_receipts",
    "fingerprint",
  ];
  exact(value, keys, keys, "engineering preimplementation evidence");
  assertSchemaVersion(
    value.schema_version,
    PREIMPLEMENTATION_EVIDENCE_SCHEMA_VERSION,
    "engineering preimplementation evidence",
  );
  assertSafeId(value.evidence_id, "engineering preimplementation evidence.evidence_id");
  assertSafeId(value.dossier_id, "engineering preimplementation evidence.dossier_id");
  assertFingerprint(value.dossier_fingerprint, "engineering preimplementation evidence.dossier_fingerprint");
  assertArray(value.baseline_receipts, "engineering preimplementation evidence.baseline_receipts", {
    max: 128,
    item: validateBaselineReceipt,
  });
  assertArray(value.plan_challenge_receipts, "engineering preimplementation evidence.plan_challenge_receipts", {
    max: 16,
    item: validatePlanChallengeReceipt,
  });
  const receiptIds = [
    ...value.baseline_receipts.map((entry) => entry.receipt_id),
    ...value.plan_challenge_receipts.map((entry) => entry.receipt_id),
  ];
  if (new Set(receiptIds).size !== receiptIds.length) {
    throw new ContractError("QUALITY_PREIMPLEMENTATION_EVIDENCE_DUPLICATE", "preimplementation receipt IDs must be unique");
  }
  const baselineCheckIds = value.baseline_receipts.map((entry) => entry.check_id);
  if (new Set(baselineCheckIds).size !== baselineCheckIds.length) {
    throw new ContractError("QUALITY_PREIMPLEMENTATION_EVIDENCE_DUPLICATE", "baseline check receipts must be unique by check ID");
  }
  const challengeRoles = value.plan_challenge_receipts.map((entry) => entry.role);
  if (new Set(challengeRoles).size !== challengeRoles.length) {
    throw new ContractError("QUALITY_PREIMPLEMENTATION_EVIDENCE_DUPLICATE", "plan challenge receipts must be unique by role");
  }
  assertFingerprint(value.fingerprint, "engineering preimplementation evidence.fingerprint");
  if (!fingerprintsEqual(value.fingerprint, fingerprint(preimplementationEvidenceFingerprintInput(value)))) {
    throw new ContractError("QUALITY_PREIMPLEMENTATION_EVIDENCE_FINGERPRINT", "preimplementation evidence fingerprint mismatch");
  }
  return value;
}

export function createEngineeringPreimplementationEvidence(input) {
  const keys = [
    "evidence_id",
    "dossier_id",
    "dossier_fingerprint",
    "baseline_receipts",
    "plan_challenge_receipts",
  ];
  exact(input, keys, keys, "engineering preimplementation evidence input");
  const source = {
    schema_version: PREIMPLEMENTATION_EVIDENCE_SCHEMA_VERSION,
    ...input,
  };
  const evidence = { ...source, fingerprint: fingerprint(source) };
  validateEngineeringPreimplementationEvidence(evidence);
  return deepFrozenClone(evidence, "engineering preimplementation evidence");
}

function validateReason(value, label) {
  const keys = ["code", "subject_id", "detail", "evidence_refs"];
  exact(value, keys, keys, label);
  assertEnum(value.code, QUALITY_GATE_REASON_CODES, `${label}.code`);
  assertString(value.subject_id, `${label}.subject_id`, { maxBytes: 128 });
  assertString(value.detail, `${label}.detail`);
  validateEvidenceReferences(value.evidence_refs, `${label}.evidence_refs`);
  return value;
}

function decisionFingerprintInput(decision) {
  const copy = { ...decision };
  delete copy.fingerprint;
  return copy;
}

export function validateEngineeringGateDecision(value) {
  exact(value, GATE_KEYS, GATE_KEYS, "engineering gate decision");
  assertSchemaVersion(value.schema_version, ENGINEERING_GATE_DECISION_SCHEMA_VERSION, "engineering gate decision");
  assertSafeId(value.gate_id, "engineering gate decision.gate_id");
  assertSafeId(value.dossier_id, "engineering gate decision.dossier_id");
  assertFingerprint(value.dossier_fingerprint, "engineering gate decision.dossier_fingerprint");
  assertSafeId(value.task_id, "engineering gate decision.task_id");
  assertEnum(value.risk_class, ["standard-lite", "high", "critical"], "engineering gate decision.risk_class");
  assertEnum(value.status, GATE_STATUSES, "engineering gate decision.status");
  assertArray(value.reasons, "engineering gate decision.reasons", { item: validateReason });
  if ((value.status === "passed") !== (value.reasons.length === 0)) {
    throw new ContractError("QUALITY_GATE_STATUS", "passed gate must have no reasons; blocked gate must have reasons");
  }
  assertFingerprint(value.check_catalog_fingerprint, "engineering gate decision.check_catalog_fingerprint");
  assertFingerprint(
    value.preimplementation_evidence_fingerprint,
    "engineering gate decision.preimplementation_evidence_fingerprint",
    { nullable: true },
  );
  assertFingerprint(value.architecture_evaluation_fingerprint, "engineering gate decision.architecture_evaluation_fingerprint", { nullable: true });
  assertIso(value.evaluated_at, "engineering gate decision.evaluated_at");
  assertFingerprint(value.fingerprint, "engineering gate decision.fingerprint");
  if (!fingerprintsEqual(value.fingerprint, fingerprint(decisionFingerprintInput(value)))) {
    throw new ContractError("QUALITY_GATE_FINGERPRINT", "engineering gate decision fingerprint mismatch");
  }
  const identities = value.reasons.map((reason) => `${reason.code}:${reason.subject_id}`);
  if (new Set(identities).size !== identities.length) {
    throw new ContractError("QUALITY_GATE_REASON_DUPLICATE", "gate reasons must be unique by code and subject");
  }
  return value;
}

function reason(code, subjectId, detail, evidenceRefs = []) {
  return { code, subject_id: subjectId, detail, evidence_refs: evidenceRefs };
}

function mappingReasons(dossier, catalog) {
  const reasons = [];
  const checks = new Map(catalog.checks.map((entry) => [entry.check_id, entry]));
  const mechanisms = new Map(catalog.mechanisms.map((entry) => [entry.mechanism_id, entry]));
  for (const [collectionName, collection, missingCode] of [
    ["invariant", dossier.invariants, "QUALITY_INVARIANT_UNMAPPED"],
    ["edge-case", dossier.edge_cases, "QUALITY_EDGE_CASE_UNMAPPED"],
    ["failure-mode", dossier.failure_modes, "QUALITY_FAILURE_MODE_UNMAPPED"],
    ["premortem", dossier.premortem_matrix, "QUALITY_PREMORTEM_CATEGORY_MISSING"],
    ["counterexample", dossier.counterexamples, "QUALITY_TASK_SPECIFIC_EVIDENCE_MISSING"],
    ["specialized-check", dossier.specialized_checks, "QUALITY_SPECIALIZED_CHECK_MISSING"],
    ["rollback-recovery", [{ id: "ROLLBACK-recovery", mapping: dossier.rollback_recovery.mapping }], "QUALITY_ROLLBACK_RECOVERY_UNKNOWN"],
  ]) {
    for (const item of collection) {
      const mapping = item.mapping;
      if (!mapping || typeof mapping.classification !== "string") {
        reasons.push(reason(missingCode, item.id, `${collectionName} has no verification mapping`));
        continue;
      }
      if (mapping.classification === "applicable_blocked_unverified") {
        reasons.push(reason("QUALITY_BLOCKED_UNVERIFIED", item.id, mapping.blocked_reason, mapping.evidence_refs));
      }
      for (const checkId of mapping.check_ids) {
        const check = checks.get(checkId);
        if (!check || !check.available) {
          reasons.push(reason("QUALITY_CHECK_UNKNOWN", item.id, `check ${checkId} is not available in the trusted catalog`));
        }
      }
      for (const mechanismId of mapping.mechanism_ids) {
        const mechanism = mechanisms.get(mechanismId);
        if (!mechanism || !mechanism.available) {
          reasons.push(reason("QUALITY_MECHANISM_UNKNOWN", item.id, `mechanism ${mechanismId} is not available in the trusted catalog`));
        }
      }
    }
  }
  return reasons;
}

function pathScopesOverlap(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function checkAvailabilityReasons(dossier, catalog) {
  const checks = new Map(catalog.checks.map((entry) => [entry.check_id, entry]));
  const reasons = [];
  const namedChecks = [
    ...requiredEngineeringVerificationTargets(dossier).checkIds,
    ...dossier.verification_plan.baseline_check_ids,
    ...dossier.verification_plan.slice_check_ids,
    ...dossier.verification_plan.integration_check_ids,
    ...dossier.verification_plan.architecture_check_ids,
    ...dossier.verification_plan.regression_check_ids,
    ...dossier.verification_plan.hidden_check_ids,
    ...dossier.implementation_slices.flatMap((entry) => entry.verification_check_ids),
  ];
  for (const checkId of new Set(namedChecks)) {
    if (!checks.get(checkId)?.available) {
      reasons.push(reason("QUALITY_CHECK_UNKNOWN", checkId, `planned check ${checkId} is unavailable in the trusted catalog`));
    }
  }
  return reasons;
}

function preimplementationEvidenceReasons(dossier, catalog, evidence, evaluatedAt) {
  const reasons = [];
  const highAssurance = ["high", "critical"].includes(dossier.risk_class);
  const baselineRequired = highAssurance;
  const preimplementationCheckIds = requiredEngineeringVerificationTargets(dossier).preimplementationCheckIds;
  if (evidence === null) {
    if (baselineRequired || preimplementationCheckIds.length > 0) {
      reasons.push(reason(
        "QUALITY_BASELINE_EVIDENCE_MISSING",
        dossier.dossier_id,
        "mandatory pre-change baseline has no runner-owned execution receipt",
      ));
    }
    if (highAssurance) {
      reasons.push(reason(
        "QUALITY_PLAN_CHALLENGE_MISSING",
        dossier.dossier_id,
        "independent architect and reviewer results have no runner-owned execution receipts",
      ));
    }
    return reasons;
  }
  validateEngineeringPreimplementationEvidence(evidence);
  if (evidence.dossier_id !== dossier.dossier_id || evidence.dossier_fingerprint !== dossier.fingerprint) {
    throw new ContractError(
      "QUALITY_PREIMPLEMENTATION_EVIDENCE_BINDING",
      "preimplementation evidence does not bind the exact finalized dossier",
    );
  }
  const gateTime = Date.parse(evaluatedAt);
  const checks = new Map(catalog.checks.map((entry) => [entry.check_id, entry]));
  const mechanisms = new Map(catalog.mechanisms.map((entry) => [entry.mechanism_id, entry]));
  const baselineReceipts = new Map(evidence.baseline_receipts.map((entry) => [entry.check_id, entry]));
  const obligations = new Map();
  for (const obligation of dossier.test_obligations) {
    if (obligation.phase === "preimplementation") {
      obligations.set(obligation.check_id, obligation);
    }
  }
  const finalizedTime = Date.parse(dossier.finalized_at);
  for (const checkId of preimplementationCheckIds) {
    const receipt = baselineReceipts.get(checkId);
    const check = checks.get(checkId);
    const obligation = obligations.get(checkId);
    const complete = receipt
      && receipt.status === "passed"
      && Date.parse(receipt.completed_at) >= finalizedTime
      && Date.parse(receipt.completed_at) <= gateTime
      && check?.available
      && check.phases.includes("preimplementation")
      && check.trusted_producer === receipt.trusted_producer
      && obligation?.phase === "preimplementation"
      && obligation.trusted_producer === receipt.trusted_producer
      && obligation.command_or_mechanism === receipt.command_or_mechanism;
    if (!complete) {
      reasons.push(reason(
        "QUALITY_BASELINE_EVIDENCE_MISSING",
        checkId,
        `preimplementation check ${checkId} lacks a current, passed, phase-correct, producer-bound execution receipt`,
      ));
    }
  }
  if (baselineRequired && preimplementationCheckIds.length === 0) {
    reasons.push(reason(
      "QUALITY_BASELINE_EVIDENCE_MISSING",
      dossier.dossier_id,
      "mandatory pre-change baseline evidence is absent",
    ));
  }
  if (highAssurance) {
    const expected = [
      ["architect", dossier.plan_challenge.architect_result_id],
      ["reviewer", dossier.plan_challenge.reviewer_result_id],
    ];
    const receiptsByRole = new Map(evidence.plan_challenge_receipts.map((entry) => [entry.role, entry]));
    for (const [role, resultId] of expected) {
      const receipt = receiptsByRole.get(role);
      const mechanism = receipt ? mechanisms.get(receipt.mechanism_id) : null;
      const complete = resultId !== null
        && receipt
        && receipt.result_id === resultId
        && receipt.status === "passed"
        && Date.parse(receipt.completed_at) <= gateTime
        && mechanism?.available
        && mechanism.phases.includes("preimplementation")
        && mechanism.trusted_producer === receipt.trusted_producer;
      if (!complete) {
        reasons.push(reason(
          "QUALITY_PLAN_CHALLENGE_MISSING",
          resultId ?? `${dossier.dossier_id}-${role}`,
          `${role} plan challenge lacks a passed, phase-correct, producer-bound execution receipt`,
        ));
      }
    }
    const architect = receiptsByRole.get("architect");
    const reviewer = receiptsByRole.get("reviewer");
    if (architect && reviewer && architect.result_id === reviewer.result_id) {
      reasons.push(reason(
        "QUALITY_PLAN_CHALLENGE_MISSING",
        architect.result_id,
        "architect and reviewer plan challenges must be independently identified results",
      ));
    }
  }
  return reasons;
}

function contractAndPlanReasons(dossier, catalog) {
  const reasons = [];
  const highAssurance = ["high", "critical"].includes(dossier.risk_class);
  if (dossier.behavior_contract.status !== "defined") {
    reasons.push(reason("QUALITY_BEHAVIOR_AMBIGUOUS", dossier.dossier_id, "changed behavior is still ambiguous"));
  }
  if (
    dossier.compatibility_contract.status !== "defined"
    || dossier.compatibility_contract.default_decision === "unresolved"
  ) {
    reasons.push(reason("QUALITY_COMPATIBILITY_UNRESOLVED", dossier.dossier_id, "compatibility contract has no resolved default decision"));
  }
  for (const contract of dossier.public_contracts) {
    if (contract.compatibility_decision === "unresolved") {
      reasons.push(reason("QUALITY_COMPATIBILITY_UNRESOLVED", contract.id, "affected public contract has no compatibility decision", contract.evidence_refs));
    }
  }
  const requiredBoundaryCategories = highAssurance
    ? ["caller", "callee", "state", "data_path", "architecture_layer", "ownership"]
    : [];
  for (const category of requiredBoundaryCategories) {
    if (!dossier.system_boundaries.some((entry) => entry.category === category)) {
      reasons.push(reason("QUALITY_SYSTEM_BOUNDARY_UNRESOLVED", `SYSBOUNDARY-${category}`, `full dossier does not classify ${category}`));
    }
  }
  for (const boundary of dossier.system_boundaries) {
    if (boundary.status === "unresolved") {
      reasons.push(reason("QUALITY_SYSTEM_BOUNDARY_UNRESOLVED", boundary.id, `${boundary.category} remains unresolved`, boundary.evidence_refs));
    }
  }
  if (dossier.context_coverage.status === "truncated") {
    const acceptedAreas = new Set(
      dossier.unknowns
        .filter((entry) => dossier.context_coverage.accepted_gap_ids.includes(entry.id) && !entry.blocking)
        .flatMap((entry) => entry.scope_ids),
    );
    for (const areaId of dossier.context_coverage.truncated_area_ids) {
      if (!acceptedAreas.has(areaId)) {
        reasons.push(reason("QUALITY_CONTEXT_COVERAGE_TRUNCATED", areaId, "affected context truncation lacks an explicit accepted non-blocking gap"));
      }
    }
  }
  const concurrentSlices = dossier.implementation_slices.filter((entry) => entry.concurrent_group !== null && entry.intent === "implementation");
  for (let leftIndex = 0; leftIndex < concurrentSlices.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < concurrentSlices.length; rightIndex += 1) {
      const left = concurrentSlices[leftIndex];
      const right = concurrentSlices[rightIndex];
      if (left.concurrent_group !== right.concurrent_group) continue;
      if (left.write_scope.some((leftPath) => right.write_scope.some((rightPath) => pathScopesOverlap(leftPath, rightPath)))) {
        reasons.push(reason(
          "QUALITY_WRITE_OWNERSHIP_OVERLAP",
          `${left.id}-${right.id}`,
          `concurrent implementation slices ${left.id} and ${right.id} overlap`,
        ));
      }
    }
  }
  if (dossier.verification_plan.truncated_check_ids.length > 0) {
    for (const checkId of dossier.verification_plan.truncated_check_ids) {
      reasons.push(reason("QUALITY_VERIFICATION_TRUNCATED", checkId, "mandatory verification cannot pass after its evidence was truncated"));
    }
  }
  const testKinds = new Set(dossier.test_obligations.filter((entry) => entry.required).map((entry) => entry.kind));
  if (dossier.task_type === "bug_fix" && (!testKinds.has("reproducer") || dossier.counterexamples.length === 0)) {
    reasons.push(reason("QUALITY_TASK_SPECIFIC_EVIDENCE_MISSING", dossier.dossier_id, "bug fix needs reproducer evidence and a concrete or evidence-backed counterexample"));
  }
  if (dossier.task_type === "behavior_preserving_refactor" && !testKinds.has("characterization")) {
    reasons.push(reason("QUALITY_TASK_SPECIFIC_EVIDENCE_MISSING", dossier.dossier_id, "behavior-preserving refactor needs characterization evidence"));
  }
  if (dossier.task_type === "new_feature" && (!testKinds.has("contract") || !testKinds.has("negative_path"))) {
    reasons.push(reason("QUALITY_TASK_SPECIFIC_EVIDENCE_MISSING", dossier.dossier_id, "new feature needs public contract and negative-path evidence"));
  }
  if (dossier.risk_class === "critical" && (!testKinds.has("negative_path") || !testKinds.has("rollback_recovery"))) {
    reasons.push(reason("QUALITY_TASK_SPECIFIC_EVIDENCE_MISSING", dossier.dossier_id, "critical work needs negative-path and rollback/recovery test obligations"));
  }
  const behaviorFields = new Set();
  if (highAssurance) {
    for (const field of ["negative_behavior", "boundary_behavior", "error_behavior", "ordering_and_side_effects"]) {
      behaviorFields.add(field);
    }
  }
  for (const field of ({
    bug_fix: ["negative_behavior", "error_behavior"],
    behavior_preserving_refactor: ["error_behavior", "ordering_and_side_effects"],
    new_feature: ["negative_behavior", "boundary_behavior", "error_behavior"],
    migration: ["negative_behavior", "error_behavior", "compatibility_requirements"],
    security: ["negative_behavior", "error_behavior", "security_requirements"],
    maintenance: [],
  })[dossier.task_type]) {
    behaviorFields.add(field);
  }
  for (const field of behaviorFields) {
    if (dossier.behavior_contract[field].length === 0) {
      reasons.push(reason(
        "QUALITY_TASK_SPECIFIC_EVIDENCE_MISSING",
        `${dossier.dossier_id}-${field}`,
        `${dossier.task_type} ${dossier.risk_class} work must explicitly define ${field}`,
      ));
    }
  }
  if (highAssurance && dossier.counterexamples.length === 0) {
    reasons.push(reason("QUALITY_TASK_SPECIFIC_EVIDENCE_MISSING", dossier.dossier_id, "high and critical plans need a counterexample or evidence-backed not-applicable record"));
  }
  if (highAssurance) {
    for (const blocker of dossier.plan_challenge.blockers) {
      if (["high", "medium"].includes(blocker.severity) && blocker.status === "unresolved") {
        reasons.push(reason("QUALITY_PLAN_CHALLENGE_UNRESOLVED", blocker.id, `${blocker.severity} plan blocker remains unresolved`, blocker.evidence_refs));
      }
    }
  }
  const requiredSpecialized = dossier.risk_class === "critical"
    ? ["security", "data_integrity", "rollback_recovery", "negative_path"]
    : highAssurance ? ["architecture", "compatibility"] : [];
  for (const category of requiredSpecialized) {
    const item = dossier.specialized_checks.find((entry) => entry.category === category);
    if (!item || ["not_applicable", "applicable_blocked_unverified"].includes(item.mapping.classification)) {
      reasons.push(reason("QUALITY_SPECIALIZED_CHECK_MISSING", `SPECIAL-${category}`, `${dossier.risk_class} work lacks verified ${category} evidence`));
    }
  }
  if (
    dossier.risk_class === "critical"
    && !["applicable_directly_tested", "applicable_verified_by_other_mechanism"].includes(dossier.rollback_recovery.mapping.classification)
  ) {
    reasons.push(reason("QUALITY_ROLLBACK_RECOVERY_UNKNOWN", dossier.dossier_id, "critical rollback and recovery behavior is not verified"));
  }
  reasons.push(...checkAvailabilityReasons(dossier, catalog));
  return reasons;
}

function standardLiteReasons(dossier) {
  if (dossier.risk_class !== "standard-lite") return [];
  const overbuilt = dossier.affected_areas.length > 3
    || dossier.call_paths.length > 2
    || dossier.data_shapes.length > 2
    || (
      dossier.impact_graph !== null
      && dossier.architecture_assessment.status === "not_configured"
    )
    || dossier.subagent_handoffs.length > 1
    || dossier.subagent_handoffs.some((handoff) => handoff.intent === "implementation");
  return overbuilt
    ? [reason("QUALITY_STANDARD_LITE_OVERBUILT", dossier.dossier_id, "standard-lite dossier exceeds the bounded local-work contract")]
    : [];
}

function impactAndArchitectureReasons(dossier, architectureEvaluation) {
  const reasons = [];
  if (["high", "critical"].includes(dossier.risk_class)) {
    if (dossier.impact_graph === null) {
      reasons.push(reason("QUALITY_IMPACT_GRAPH_REQUIRED", dossier.dossier_id, "high and critical work requires a bounded impact graph"));
    } else if (dossier.impact_graph.coverage?.completeness !== "complete") {
      reasons.push(reason("QUALITY_IMPACT_GRAPH_INCOMPLETE", dossier.impact_graph.graph_id ?? dossier.dossier_id, "impact graph coverage is incomplete"));
    }
  }
  if (architectureEvaluation === null) return reasons;
  if (architectureEvaluation.status === "blocked") {
    reasons.push(reason(
      "QUALITY_ARCHITECTURE_REQUIRED_CHECK_UNAVAILABLE",
      architectureEvaluation.evaluation_id ?? dossier.dossier_id,
      "a required architecture evaluator is unavailable",
    ));
  }
  if (architectureEvaluation.status === "failed") {
    for (const violation of architectureEvaluation.violations ?? []) {
      if (violation.blocking) {
        reasons.push(reason(
          "QUALITY_ARCHITECTURE_VIOLATION",
          violation.violation_id,
          violation.message,
          violation.evidence_refs ?? [],
        ));
      }
    }
  }
  return reasons;
}

export function evaluateEngineeringGate({
  gate_id,
  dossier,
  check_catalog,
  preimplementation_evidence = null,
  architecture_evaluation = null,
  evaluated_at,
}) {
  validateEngineeringDossier(dossier, { requireFinalized: true });
  validateEngineeringCheckCatalog(check_catalog);
  if (preimplementation_evidence !== null) {
    validateEngineeringPreimplementationEvidence(preimplementation_evidence);
  }
  assertSafeId(gate_id, "gate input.gate_id");
  assertIso(evaluated_at, "gate input.evaluated_at");
  if (architecture_evaluation !== null) {
    validateArchitectureEvaluation(architecture_evaluation);
    if (
      architecture_evaluation.graph_id !== dossier.impact_graph?.graph_id
      || architecture_evaluation.graph_fingerprint !== dossier.impact_graph?.fingerprint
      || architecture_evaluation.status !== dossier.architecture_assessment.status
      || architecture_evaluation.evaluation_id !== dossier.architecture_assessment.evaluation_id
      || architecture_evaluation.policy_id !== dossier.architecture_assessment.policy_id
    ) {
      throw new ContractError("QUALITY_ARCHITECTURE_EVALUATION", "architecture evaluation does not match the dossier assessment and impact graph");
    }
  } else if (dossier.architecture_assessment.status !== "not_configured") {
    throw new ContractError("QUALITY_ARCHITECTURE_EVALUATION", "configured dossier architecture assessment requires its evaluation artifact");
  }
  const reasons = [
    ...mappingReasons(dossier, check_catalog),
    ...contractAndPlanReasons(dossier, check_catalog),
    ...preimplementationEvidenceReasons(dossier, check_catalog, preimplementation_evidence, evaluated_at),
    ...dossier.unknowns.filter((entry) => entry.blocking).map((entry) => reason(
      "QUALITY_UNKNOWN_BLOCKING",
      entry.id,
      entry.resolution_plan,
    )),
    ...standardLiteReasons(dossier),
    ...impactAndArchitectureReasons(dossier, architecture_evaluation),
  ].sort((left, right) => `${left.code}:${left.subject_id}`.localeCompare(`${right.code}:${right.subject_id}`));
  const source = {
    schema_version: ENGINEERING_GATE_DECISION_SCHEMA_VERSION,
    gate_id,
    dossier_id: dossier.dossier_id,
    dossier_fingerprint: dossier.fingerprint,
    task_id: dossier.task_id,
    risk_class: dossier.risk_class,
    status: reasons.length === 0 ? "passed" : "blocked",
    reasons,
    check_catalog_fingerprint: check_catalog.fingerprint,
    preimplementation_evidence_fingerprint: preimplementation_evidence?.fingerprint ?? null,
    architecture_evaluation_fingerprint: architecture_evaluation?.fingerprint ?? null,
    evaluated_at,
  };
  const decision = { ...source, fingerprint: fingerprint(source) };
  validateEngineeringGateDecision(decision);
  return deepFrozenClone(decision, "engineering gate decision");
}

export function engineeringGateFingerprintInput(decision) {
  validateEngineeringGateDecision(decision);
  return deepFrozenClone(JSON.parse(canonicalJson(decisionFingerprintInput(decision))), "engineering gate fingerprint input");
}
