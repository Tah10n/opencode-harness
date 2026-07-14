import { assertEnum, assertSafeId } from "../feedback/contracts.mjs";
import { normalizeRelativePath } from "../feedback/privacy.mjs";
import {
  DOSSIER_MODES,
  DOSSIER_STATUSES,
  DOSSIER_TASK_TYPES,
  ENGINEERING_DOSSIER_SCHEMA_VERSION,
  IMPACT_NODE_KINDS,
  PREMORTEM_CATEGORIES,
  QUALITY_CONFIDENCE_LEVELS,
  QUALITY_LIMITS,
  QUALITY_RISK_CLASSES,
  TEST_OBLIGATION_KINDS,
} from "./constants.mjs";
import {
  ContractError,
  assertArray,
  assertBoolean,
  assertCommit,
  assertFingerprint,
  assertInteger,
  assertIso,
  assertNullable,
  assertPlain,
  assertSchemaVersion,
  assertStableTypedId,
  assertString,
  assertStringArray,
  assertTimestampOrder,
  assertUniqueIds,
  canonicalJson,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
  validateEvidenceReferences,
  validateVerificationMapping,
} from "./validation.mjs";
import { validateEngineeringImpactGraph } from "./impact-graph.mjs";

const DOSSIER_KEYS = Object.freeze([
  "schema_version",
  "dossier_id",
  "run_id",
  "task_id",
  "risk_class",
  "mode",
  "task_type",
  "user_visible_goal",
  "revision",
  "status",
  "task_shape",
  "behavior_contract",
  "compatibility_contract",
  "public_contracts",
  "system_boundaries",
  "affected_areas",
  "entry_points",
  "call_paths",
  "data_shapes",
  "invariants",
  "edge_cases",
  "failure_modes",
  "premortem_matrix",
  "counterexamples",
  "test_obligations",
  "specialized_checks",
  "assumptions",
  "unknowns",
  "subagent_handoffs",
  "implementation_slices",
  "impact_graph",
  "architecture_assessment",
  "context_coverage",
  "verification_plan",
  "rollback_recovery",
  "plan_challenge",
  "gate_state",
  "verification_boundary",
  "created_at",
  "updated_at",
  "finalized_at",
  "fingerprint",
]);

const CONTENT_KEYS = Object.freeze([
  "task_type",
  "user_visible_goal",
  "task_shape",
  "behavior_contract",
  "compatibility_contract",
  "public_contracts",
  "system_boundaries",
  "affected_areas",
  "entry_points",
  "call_paths",
  "data_shapes",
  "invariants",
  "edge_cases",
  "failure_modes",
  "premortem_matrix",
  "counterexamples",
  "test_obligations",
  "specialized_checks",
  "assumptions",
  "unknowns",
  "subagent_handoffs",
  "implementation_slices",
  "impact_graph",
  "architecture_assessment",
  "context_coverage",
  "verification_plan",
  "rollback_recovery",
  "plan_challenge",
  "gate_state",
  "verification_boundary",
]);

function validateTaskShape(value, label) {
  const keys = [
    "summary",
    "starting_commit",
    "worktree_state",
    "instruction_sources",
    "skill_ids",
    "constraints",
    "non_goals",
  ];
  exact(value, keys, keys, label);
  assertString(value.summary, `${label}.summary`, { maxBytes: QUALITY_LIMITS.summaryBytes });
  assertCommit(value.starting_commit, `${label}.starting_commit`);
  assertEnum(value.worktree_state, ["clean", "dirty-preserved"], `${label}.worktree_state`);
  assertStringArray(value.instruction_sources, `${label}.instruction_sources`, { min: 1, path: true });
  assertStringArray(value.skill_ids, `${label}.skill_ids`, { maxBytes: 128 });
  assertStringArray(value.constraints, `${label}.constraints`, { min: 1 });
  assertStringArray(value.non_goals, `${label}.non_goals`);
  return value;
}

function validateBehaviorContract(value, label) {
  const keys = [
    "status",
    "requested_behavior",
    "positive_behavior",
    "negative_behavior",
    "boundary_behavior",
    "error_behavior",
    "ordering_and_side_effects",
    "preserved_behavior",
    "compatibility_requirements",
    "security_requirements",
    "completion_requirements",
  ];
  exact(value, keys, keys, label);
  assertEnum(value.status, ["defined", "ambiguous"], `${label}.status`);
  assertString(value.requested_behavior, `${label}.requested_behavior`);
  assertStringArray(value.positive_behavior, `${label}.positive_behavior`, { min: 1 });
  assertStringArray(value.negative_behavior, `${label}.negative_behavior`);
  assertStringArray(value.boundary_behavior, `${label}.boundary_behavior`);
  assertStringArray(value.error_behavior, `${label}.error_behavior`);
  assertStringArray(value.ordering_and_side_effects, `${label}.ordering_and_side_effects`);
  assertStringArray(value.preserved_behavior, `${label}.preserved_behavior`, { min: 1 });
  assertStringArray(value.compatibility_requirements, `${label}.compatibility_requirements`);
  assertStringArray(value.security_requirements, `${label}.security_requirements`);
  assertStringArray(value.completion_requirements, `${label}.completion_requirements`, { min: 1 });
  return value;
}

function validateCompatibilityContract(value, label) {
  const keys = ["status", "default_decision", "rationale", "evidence_refs"];
  exact(value, keys, keys, label);
  assertEnum(value.status, ["defined", "ambiguous"], `${label}.status`);
  assertEnum(
    value.default_decision,
    ["preserve", "versioned", "breaking_approved", "not_applicable", "unresolved"],
    `${label}.default_decision`,
  );
  assertString(value.rationale, `${label}.rationale`);
  validateEvidenceReferences(value.evidence_refs, `${label}.evidence_refs`, {
    min: value.default_decision === "not_applicable" ? 0 : 1,
  });
  return value;
}

function validatePublicContract(value, label) {
  const keys = ["id", "kind", "path", "owner", "compatibility_decision", "evidence_refs"];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "CONTRACT", `${label}.id`);
  assertEnum(value.kind, ["public_api", "schema", "command", "event", "config", "serialization"], `${label}.kind`);
  if (value.path !== null) {
    const normalized = normalizeRelativePath(value.path, `${label}.path`);
    if (normalized !== value.path) throw new ContractError("QUALITY_PATH_CANONICAL", `${label}.path must use forward slashes`);
  }
  assertString(value.owner, `${label}.owner`, { maxBytes: 256 });
  assertEnum(
    value.compatibility_decision,
    ["preserve", "versioned", "breaking_approved", "not_applicable", "unresolved"],
    `${label}.compatibility_decision`,
  );
  validateEvidenceReferences(value.evidence_refs, `${label}.evidence_refs`, {
    min: value.compatibility_decision === "not_applicable" ? 0 : 1,
  });
  return value;
}

function validateSystemBoundary(value, label) {
  const keys = ["id", "category", "path", "status", "rationale", "evidence_refs"];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "SYSBOUNDARY", `${label}.id`);
  assertEnum(value.category, [
    "caller",
    "callee",
    "state",
    "persistence",
    "transaction",
    "cache",
    "side_effect",
    "data_path",
    "serialization",
    "external_system",
    "dependency",
    "architecture_layer",
    "ownership",
  ], `${label}.category`);
  if (value.path !== null) {
    const normalized = normalizeRelativePath(value.path, `${label}.path`);
    if (normalized !== value.path) throw new ContractError("QUALITY_PATH_CANONICAL", `${label}.path must use forward slashes`);
  }
  assertEnum(value.status, ["resolved", "unresolved", "not_applicable"], `${label}.status`);
  assertString(value.rationale, `${label}.rationale`);
  validateEvidenceReferences(value.evidence_refs, `${label}.evidence_refs`, { min: value.status === "resolved" ? 1 : 0 });
  return value;
}

function validateAffectedArea(value, label) {
  const keys = ["id", "path", "node_kind", "reason", "confidence", "evidence_refs"];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "AREA", `${label}.id`);
  const normalized = normalizeRelativePath(value.path, `${label}.path`);
  if (normalized !== value.path) throw new ContractError("QUALITY_PATH_CANONICAL", `${label}.path must use forward slashes`);
  assertEnum(value.node_kind, IMPACT_NODE_KINDS, `${label}.node_kind`);
  assertString(value.reason, `${label}.reason`);
  assertEnum(value.confidence, QUALITY_CONFIDENCE_LEVELS, `${label}.confidence`);
  validateEvidenceReferences(value.evidence_refs, `${label}.evidence_refs`, { min: value.confidence === "observed" ? 1 : 0 });
  return value;
}

function validateEntryPoint(value, label) {
  const keys = ["id", "path", "symbol", "reason", "evidence_refs"];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "ENTRY", `${label}.id`);
  const normalized = normalizeRelativePath(value.path, `${label}.path`);
  if (normalized !== value.path) throw new ContractError("QUALITY_PATH_CANONICAL", `${label}.path must use forward slashes`);
  assertString(value.symbol, `${label}.symbol`, { nullable: true, maxBytes: 512 });
  assertString(value.reason, `${label}.reason`);
  validateEvidenceReferences(value.evidence_refs, `${label}.evidence_refs`, { min: 1 });
  return value;
}

function validateCallPath(value, label) {
  const keys = ["id", "steps", "confidence", "evidence_refs"];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "PATH", `${label}.id`);
  assertStringArray(value.steps, `${label}.steps`, { min: 2, maxBytes: 256 });
  assertEnum(value.confidence, QUALITY_CONFIDENCE_LEVELS, `${label}.confidence`);
  validateEvidenceReferences(value.evidence_refs, `${label}.evidence_refs`, { min: value.confidence === "observed" ? 1 : 0 });
  return value;
}

function validateDataShape(value, label) {
  const keys = [
    "id",
    "name",
    "producer_ids",
    "consumer_ids",
    "serialization_boundary_ids",
    "compatibility_notes",
    "evidence_refs",
  ];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "DATA", `${label}.id`);
  assertString(value.name, `${label}.name`, { maxBytes: 256 });
  assertStringArray(value.producer_ids, `${label}.producer_ids`, { min: 1, maxBytes: 128 });
  assertStringArray(value.consumer_ids, `${label}.consumer_ids`, { min: 1, maxBytes: 128 });
  assertStringArray(value.serialization_boundary_ids, `${label}.serialization_boundary_ids`, { maxBytes: 128 });
  assertStringArray(value.compatibility_notes, `${label}.compatibility_notes`);
  validateEvidenceReferences(value.evidence_refs, `${label}.evidence_refs`, { min: 1 });
  return value;
}

function validateInvariant(value, label) {
  const keys = ["id", "statement", "scope_ids", "mapping"];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "INV", `${label}.id`);
  assertString(value.statement, `${label}.statement`);
  assertStringArray(value.scope_ids, `${label}.scope_ids`, { min: 1, maxBytes: 128 });
  validateVerificationMapping(value.mapping, `${label}.mapping`);
  if (value.mapping.classification === "not_applicable") {
    throw new ContractError("QUALITY_INVARIANT_NOT_APPLICABLE", `${label} cannot mark an invariant not_applicable`);
  }
  return value;
}

function validateEdgeCase(value, label) {
  const keys = ["id", "category", "condition", "expected_behavior", "scope_ids", "mapping"];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "EDGE", `${label}.id`);
  assertEnum(value.category, PREMORTEM_CATEGORIES, `${label}.category`);
  assertString(value.condition, `${label}.condition`);
  assertString(value.expected_behavior, `${label}.expected_behavior`);
  assertStringArray(value.scope_ids, `${label}.scope_ids`, { min: 1, maxBytes: 128 });
  validateVerificationMapping(value.mapping, `${label}.mapping`);
  return value;
}

function validateFailureMode(value, label) {
  const keys = ["id", "category", "trigger", "impact", "expected_handling", "scope_ids", "mapping"];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "FAIL", `${label}.id`);
  assertEnum(value.category, PREMORTEM_CATEGORIES, `${label}.category`);
  assertString(value.trigger, `${label}.trigger`);
  assertString(value.impact, `${label}.impact`);
  assertString(value.expected_handling, `${label}.expected_handling`);
  assertStringArray(value.scope_ids, `${label}.scope_ids`, { min: 1, maxBytes: 128 });
  validateVerificationMapping(value.mapping, `${label}.mapping`);
  return value;
}

function validateTestObligation(value, label) {
  const keys = [
    "id",
    "check_id",
    "kind",
    "phase",
    "scope_ids",
    "command_or_mechanism",
    "required",
    "trusted_producer",
  ];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "TEST", `${label}.id`);
  assertSafeId(value.check_id, `${label}.check_id`);
  assertEnum(value.kind, TEST_OBLIGATION_KINDS, `${label}.kind`);
  assertEnum(value.phase, ["preimplementation", "slice", "integration", "live"], `${label}.phase`);
  assertStringArray(value.scope_ids, `${label}.scope_ids`, { min: 1, maxBytes: 128 });
  assertString(value.command_or_mechanism, `${label}.command_or_mechanism`);
  assertBoolean(value.required, `${label}.required`);
  assertString(value.trusted_producer, `${label}.trusted_producer`, { maxBytes: 256 });
  return value;
}

function validatePremortemItem(value, label) {
  const keys = ["id", "category", "subject_ids", "mapping"];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "PREMORTEM", `${label}.id`);
  assertEnum(value.category, PREMORTEM_CATEGORIES, `${label}.category`);
  assertStringArray(value.subject_ids, `${label}.subject_ids`, { maxBytes: 128 });
  validateVerificationMapping(value.mapping, `${label}.mapping`);
  const notApplicable = value.mapping.classification === "not_applicable";
  if (notApplicable !== (value.subject_ids.length === 0)) {
    throw new ContractError(
      "QUALITY_PREMORTEM_SUBJECT_MISSING",
      `${label} applicable classifications need edge/failure subjects and not_applicable must not name subjects`,
    );
  }
  return value;
}

function validateCounterexample(value, label) {
  const keys = ["id", "statement", "expected_behavior", "scope_ids", "mapping"];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "COUNTEREXAMPLE", `${label}.id`);
  assertString(value.statement, `${label}.statement`);
  assertString(value.expected_behavior, `${label}.expected_behavior`);
  assertStringArray(value.scope_ids, `${label}.scope_ids`, { min: 1, maxBytes: 128 });
  validateVerificationMapping(value.mapping, `${label}.mapping`);
  return value;
}

function validateSpecializedCheck(value, label) {
  const keys = ["id", "category", "mapping"];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "SPECIAL", `${label}.id`);
  assertEnum(value.category, [
    "security",
    "data_integrity",
    "rollback_recovery",
    "negative_path",
    "architecture",
    "compatibility",
    "race_stress",
    "property_fuzz",
    "mutation",
  ], `${label}.category`);
  validateVerificationMapping(value.mapping, `${label}.mapping`);
  return value;
}

function validateAssumption(value, label) {
  const keys = ["id", "statement", "validation_plan", "owner", "status"];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "ASSUME", `${label}.id`);
  assertString(value.statement, `${label}.statement`);
  assertString(value.validation_plan, `${label}.validation_plan`);
  assertString(value.owner, `${label}.owner`, { maxBytes: 256 });
  assertEnum(value.status, ["pending", "validated", "invalidated"], `${label}.status`);
  return value;
}

function validateUnknown(value, label) {
  const keys = ["id", "scope_ids", "statement", "impact", "resolution_plan", "owner", "blocking"];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "UNKNOWN", `${label}.id`);
  assertStringArray(value.scope_ids, `${label}.scope_ids`, { min: 1, maxBytes: 128 });
  assertString(value.statement, `${label}.statement`);
  assertString(value.impact, `${label}.impact`);
  assertString(value.resolution_plan, `${label}.resolution_plan`);
  assertString(value.owner, `${label}.owner`, { maxBytes: 256 });
  assertBoolean(value.blocking, `${label}.blocking`);
  return value;
}

function validateHandoff(value, label) {
  const keys = [
    "id",
    "role",
    "intent",
    "write_scope",
    "expected_behavior",
    "invariant_ids",
    "edge_case_ids",
    "failure_mode_ids",
    "verification_check_ids",
  ];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "HANDOFF", `${label}.id`);
  assertString(value.role, `${label}.role`, { maxBytes: 128 });
  assertEnum(value.intent, ["read_only", "implementation"], `${label}.intent`);
  assertStringArray(value.write_scope, `${label}.write_scope`, { path: true });
  if (value.intent === "implementation" && value.write_scope.length === 0) {
    throw new ContractError("QUALITY_HANDOFF_SCOPE", `${label} implementation handoff needs write_scope`);
  }
  if (value.intent === "read_only" && value.write_scope.length > 0) {
    throw new ContractError("QUALITY_HANDOFF_SCOPE", `${label} read-only handoff cannot have write_scope`);
  }
  assertString(value.expected_behavior, `${label}.expected_behavior`);
  assertStringArray(value.invariant_ids, `${label}.invariant_ids`, { maxBytes: 128 });
  assertStringArray(value.edge_case_ids, `${label}.edge_case_ids`, { maxBytes: 128 });
  assertStringArray(value.failure_mode_ids, `${label}.failure_mode_ids`, { maxBytes: 128 });
  assertStringArray(value.verification_check_ids, `${label}.verification_check_ids`, { min: 1, maxBytes: 128 });
  return value;
}

function validateImplementationSlice(value, label) {
  const keys = [
    "id",
    "owner",
    "intent",
    "write_scope",
    "concurrent_group",
    "depends_on_slice_ids",
    "invariant_ids",
    "verification_check_ids",
  ];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "SLICE", `${label}.id`);
  assertString(value.owner, `${label}.owner`, { maxBytes: 128 });
  assertEnum(value.intent, ["implementation", "verification", "read_only"], `${label}.intent`);
  assertStringArray(value.write_scope, `${label}.write_scope`, { path: true });
  if (value.intent === "implementation" && value.write_scope.length === 0) {
    throw new ContractError("QUALITY_SLICE_SCOPE", `${label} implementation slice needs write_scope`);
  }
  if (value.intent !== "implementation" && value.write_scope.length > 0) {
    throw new ContractError("QUALITY_SLICE_SCOPE", `${label} non-implementation slice cannot own writes`);
  }
  assertString(value.concurrent_group, `${label}.concurrent_group`, { nullable: true, maxBytes: 128 });
  assertStringArray(value.depends_on_slice_ids, `${label}.depends_on_slice_ids`, { maxBytes: 128 });
  assertStringArray(value.invariant_ids, `${label}.invariant_ids`, { maxBytes: 128 });
  assertStringArray(value.verification_check_ids, `${label}.verification_check_ids`, { min: 1, maxBytes: 128 });
  return value;
}

function validateContextCoverage(value, label) {
  const keys = [
    "status",
    "affected_area_ids",
    "covered_area_ids",
    "truncated_area_ids",
    "accepted_gap_ids",
    "evidence_refs",
  ];
  exact(value, keys, keys, label);
  assertEnum(value.status, ["complete", "truncated"], `${label}.status`);
  for (const key of ["affected_area_ids", "covered_area_ids", "truncated_area_ids", "accepted_gap_ids"]) {
    assertStringArray(value[key], `${label}.${key}`, { maxBytes: 128 });
  }
  validateEvidenceReferences(value.evidence_refs, `${label}.evidence_refs`, { min: 1 });
  if (value.status === "complete" && (value.truncated_area_ids.length > 0 || value.accepted_gap_ids.length > 0)) {
    throw new ContractError("QUALITY_CONTEXT_COVERAGE_STATE", `${label} complete coverage cannot contain truncation gaps`);
  }
  if (value.status === "truncated" && value.truncated_area_ids.length === 0) {
    throw new ContractError("QUALITY_CONTEXT_COVERAGE_STATE", `${label} truncated coverage needs affected area IDs`);
  }
  return value;
}

function validateVerificationPlan(value, label) {
  const keys = [
    "baseline_check_ids",
    "slice_check_ids",
    "integration_check_ids",
    "architecture_check_ids",
    "regression_check_ids",
    "hidden_check_ids",
    "truncated_check_ids",
    "evidence_refs",
  ];
  exact(value, keys, keys, label);
  for (const key of keys.filter((entry) => entry.endsWith("_ids"))) {
    assertStringArray(value[key], `${label}.${key}`, { maxBytes: 128 });
  }
  validateEvidenceReferences(value.evidence_refs, `${label}.evidence_refs`, { min: 1 });
  return value;
}

function validateRollbackRecovery(value, label) {
  const keys = ["rollback_expectation", "recovery_expectation", "mapping"];
  exact(value, keys, keys, label);
  assertString(value.rollback_expectation, `${label}.rollback_expectation`);
  assertString(value.recovery_expectation, `${label}.recovery_expectation`);
  validateVerificationMapping(value.mapping, `${label}.mapping`);
  return value;
}

function validatePlanChallengeBlocker(value, label) {
  const keys = ["id", "severity", "status", "summary", "evidence_refs"];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "BLOCKER", `${label}.id`);
  assertEnum(value.severity, ["high", "medium", "low"], `${label}.severity`);
  assertEnum(value.status, ["resolved", "unresolved"], `${label}.status`);
  assertString(value.summary, `${label}.summary`);
  validateEvidenceReferences(value.evidence_refs, `${label}.evidence_refs`, { min: 1 });
  return value;
}

function validatePlanChallenge(value, label) {
  const keys = ["architect_result_id", "reviewer_result_id", "blockers", "evidence_refs"];
  exact(value, keys, keys, label);
  assertString(value.architect_result_id, `${label}.architect_result_id`, { nullable: true, maxBytes: 128 });
  assertString(value.reviewer_result_id, `${label}.reviewer_result_id`, { nullable: true, maxBytes: 128 });
  assertArray(value.blockers, `${label}.blockers`, { max: QUALITY_LIMITS.arrayItems, item: validatePlanChallengeBlocker });
  assertUniqueIds(value.blockers, `${label}.blockers`);
  validateEvidenceReferences(value.evidence_refs, `${label}.evidence_refs`);
  return value;
}

function validateGateState(value, label) {
  const keys = ["status", "gate_id", "reason_codes"];
  exact(value, keys, keys, label);
  if (value.status !== "not_evaluated" || value.gate_id !== null || !Array.isArray(value.reason_codes) || value.reason_codes.length !== 0) {
    throw new ContractError(
      "QUALITY_DOSSIER_GATE_STATE",
      `${label} is immutable pre-gate input; evaluated status and reasons belong to the linked gate artifact`,
    );
  }
  return value;
}

function validateArchitectureAssessment(value, label) {
  const keys = ["policy_id", "status", "evaluation_id", "violation_ids", "notes"];
  exact(value, keys, keys, label);
  assertNullable(value.policy_id, (entry, entryLabel) => assertSafeId(entry, entryLabel), `${label}.policy_id`);
  assertEnum(value.status, ["not_configured", "passed", "failed", "blocked"], `${label}.status`);
  assertNullable(value.evaluation_id, (entry, entryLabel) => assertSafeId(entry, entryLabel), `${label}.evaluation_id`);
  assertStringArray(value.violation_ids, `${label}.violation_ids`, { maxBytes: 128 });
  assertString(value.notes, `${label}.notes`, { nullable: true });
  if (value.status === "not_configured" && (value.policy_id !== null || value.evaluation_id !== null || value.violation_ids.length > 0)) {
    throw new ContractError("QUALITY_ARCHITECTURE_STATE", `${label} not_configured state cannot bind policy evidence`);
  }
  if (value.status !== "not_configured" && (value.policy_id === null || value.evaluation_id === null)) {
    throw new ContractError("QUALITY_ARCHITECTURE_STATE", `${label} configured state needs policy_id and evaluation_id`);
  }
  return value;
}

function validateVerificationBoundary(value, label, { finalized }) {
  const keys = ["check_ids", "mechanism_ids", "ownership_paths", "integration_check_ids"];
  exact(value, keys, keys, label);
  assertStringArray(value.check_ids, `${label}.check_ids`, { min: finalized ? 1 : 0, maxBytes: 128 });
  assertStringArray(value.mechanism_ids, `${label}.mechanism_ids`, { maxBytes: 128 });
  assertStringArray(value.ownership_paths, `${label}.ownership_paths`, { min: finalized ? 1 : 0, path: true });
  assertStringArray(value.integration_check_ids, `${label}.integration_check_ids`, { min: finalized ? 1 : 0, maxBytes: 128 });
  return value;
}

function validateImpactGraphPlaceholder(value, label) {
  if (value === null) return null;
  assertPlain(value, label);
  return validateEngineeringImpactGraph(value);
}

function collectScopeIds(dossier) {
  const ids = new Set();
  for (const collection of [dossier.affected_areas, dossier.entry_points, dossier.call_paths, dossier.data_shapes]) {
    for (const item of collection) ids.add(item.id);
  }
  return ids;
}

function assertReferences(dossier) {
  const scopeIds = collectScopeIds(dossier);
  const invariantIds = new Set(dossier.invariants.map((item) => item.id));
  const edgeIds = new Set(dossier.edge_cases.map((item) => item.id));
  const failureIds = new Set(dossier.failure_modes.map((item) => item.id));
  const edgeFailureIds = new Set([...edgeIds, ...failureIds]);
  const checkIds = new Set(dossier.test_obligations.map((item) => item.check_id));
  if (checkIds.size !== dossier.test_obligations.length) {
    throw new ContractError("QUALITY_DUPLICATE_CHECK", "test_obligations.check_id values must be unique");
  }
  for (const item of dossier.premortem_matrix) {
    for (const subjectId of item.subject_ids) {
      if (!edgeFailureIds.has(subjectId)) {
        throw new ContractError("QUALITY_DANGLING_PREMORTEM", `${item.id} references unknown edge/failure subject ${subjectId}`);
      }
      const subject = [...dossier.edge_cases, ...dossier.failure_modes].find((entry) => entry.id === subjectId);
      if (subject.category !== item.category) {
        throw new ContractError("QUALITY_PREMORTEM_CATEGORY_SUBJECT", `${item.id} category does not match ${subjectId}`);
      }
    }
    for (const checkId of item.mapping.check_ids) {
      if (!checkIds.has(checkId)) throw new ContractError("QUALITY_DANGLING_CHECK", `${item.id} references unknown check ${checkId}`);
    }
  }
  for (const item of dossier.counterexamples) {
    for (const scopeId of item.scope_ids) {
      if (!scopeIds.has(scopeId)) throw new ContractError("QUALITY_DANGLING_SCOPE", `${item.id} references unknown scope ${scopeId}`);
    }
    for (const checkId of item.mapping.check_ids) {
      if (!checkIds.has(checkId)) throw new ContractError("QUALITY_DANGLING_CHECK", `${item.id} references unknown check ${checkId}`);
    }
  }
  for (const item of dossier.specialized_checks) {
    for (const checkId of item.mapping.check_ids) {
      if (!checkIds.has(checkId)) throw new ContractError("QUALITY_DANGLING_CHECK", `${item.id} references unknown check ${checkId}`);
    }
  }
  for (const checkId of dossier.rollback_recovery.mapping.check_ids) {
    if (!checkIds.has(checkId)) throw new ContractError("QUALITY_DANGLING_CHECK", `rollback_recovery references unknown check ${checkId}`);
  }
  for (const [collectionName, collection] of [
    ["invariants", dossier.invariants],
    ["edge_cases", dossier.edge_cases],
    ["failure_modes", dossier.failure_modes],
  ]) {
    for (const item of collection) {
      for (const scopeId of item.scope_ids) {
        if (!scopeIds.has(scopeId)) {
          throw new ContractError("QUALITY_DANGLING_SCOPE", `${collectionName}.${item.id} references unknown scope ${scopeId}`);
        }
      }
      for (const checkId of item.mapping.check_ids) {
        if (!checkIds.has(checkId)) {
          throw new ContractError("QUALITY_DANGLING_CHECK", `${collectionName}.${item.id} references unknown check ${checkId}`);
        }
      }
    }
  }
  for (const handoff of dossier.subagent_handoffs) {
    for (const id of handoff.invariant_ids) if (!invariantIds.has(id)) throw new ContractError("QUALITY_DANGLING_HANDOFF", `${handoff.id} references unknown invariant ${id}`);
    for (const id of handoff.edge_case_ids) if (!edgeIds.has(id)) throw new ContractError("QUALITY_DANGLING_HANDOFF", `${handoff.id} references unknown edge case ${id}`);
    for (const id of handoff.failure_mode_ids) if (!failureIds.has(id)) throw new ContractError("QUALITY_DANGLING_HANDOFF", `${handoff.id} references unknown failure mode ${id}`);
    for (const id of handoff.verification_check_ids) if (!checkIds.has(id)) throw new ContractError("QUALITY_DANGLING_HANDOFF", `${handoff.id} references unknown check ${id}`);
  }
  const sliceIds = new Set(dossier.implementation_slices.map((item) => item.id));
  for (const slice of dossier.implementation_slices) {
    for (const id of slice.depends_on_slice_ids) if (!sliceIds.has(id)) throw new ContractError("QUALITY_DANGLING_SLICE", `${slice.id} references unknown slice ${id}`);
    for (const id of slice.invariant_ids) if (!invariantIds.has(id)) throw new ContractError("QUALITY_DANGLING_SLICE", `${slice.id} references unknown invariant ${id}`);
    for (const id of slice.verification_check_ids) if (!checkIds.has(id)) throw new ContractError("QUALITY_DANGLING_SLICE", `${slice.id} references unknown check ${id}`);
  }
  const areaIds = new Set(dossier.affected_areas.map((item) => item.id));
  for (const unknown of dossier.unknowns) {
    for (const scopeId of unknown.scope_ids) {
      if (!areaIds.has(scopeId)) {
        throw new ContractError("QUALITY_DANGLING_SCOPE", `unknown.${unknown.id} references unknown affected area ${scopeId}`);
      }
    }
  }
  for (const key of ["affected_area_ids", "covered_area_ids", "truncated_area_ids"]) {
    for (const id of dossier.context_coverage[key]) {
      if (!areaIds.has(id)) throw new ContractError("QUALITY_DANGLING_CONTEXT", `context_coverage.${key} references unknown area ${id}`);
    }
  }
  const unknownIds = new Set(dossier.unknowns.map((item) => item.id));
  for (const id of dossier.context_coverage.accepted_gap_ids) {
    if (!unknownIds.has(id)) throw new ContractError("QUALITY_DANGLING_CONTEXT", `context coverage accepts unknown gap ${id}`);
  }
  const affected = [...dossier.context_coverage.affected_area_ids].sort();
  const expectedAffected = [...areaIds].sort();
  if (canonicalJson(affected) !== canonicalJson(expectedAffected)) {
    throw new ContractError("QUALITY_CONTEXT_AFFECTED_AREAS", "context coverage must enumerate every affected area exactly");
  }
  const coveredOrTruncated = new Set([
    ...dossier.context_coverage.covered_area_ids,
    ...dossier.context_coverage.truncated_area_ids,
  ]);
  if (coveredOrTruncated.size !== areaIds.size || [...areaIds].some((id) => !coveredOrTruncated.has(id))) {
    throw new ContractError("QUALITY_CONTEXT_AFFECTED_AREAS", "every affected area must be covered or explicitly truncated");
  }
  const planCheckIds = Object.entries(dossier.verification_plan)
    .filter(([key]) => key.endsWith("_check_ids"))
    .flatMap(([, ids]) => ids);
  for (const id of planCheckIds) {
    if (!checkIds.has(id)) throw new ContractError("QUALITY_DANGLING_VERIFICATION_PLAN", `verification plan references unknown check ${id}`);
  }
  for (const id of dossier.verification_boundary.check_ids) {
    if (!checkIds.has(id)) throw new ContractError("QUALITY_DANGLING_BOUNDARY", `verification boundary references unknown check ${id}`);
  }
  for (const id of dossier.verification_boundary.integration_check_ids) {
    if (!checkIds.has(id)) throw new ContractError("QUALITY_DANGLING_BOUNDARY", `integration boundary references unknown check ${id}`);
  }
}

function validateCollections(dossier, { finalized }) {
  const collections = [
    ["public_contracts", dossier.public_contracts, validatePublicContract, 0],
    ["system_boundaries", dossier.system_boundaries, validateSystemBoundary, 0],
    ["affected_areas", dossier.affected_areas, validateAffectedArea, finalized ? 1 : 0],
    ["entry_points", dossier.entry_points, validateEntryPoint, finalized ? 1 : 0],
    ["call_paths", dossier.call_paths, validateCallPath, dossier.mode === "full" && finalized ? 1 : 0],
    ["data_shapes", dossier.data_shapes, validateDataShape, 0],
    ["invariants", dossier.invariants, validateInvariant, finalized ? 1 : 0],
    ["edge_cases", dossier.edge_cases, validateEdgeCase, finalized ? 1 : 0],
    ["failure_modes", dossier.failure_modes, validateFailureMode, finalized ? 1 : 0],
    ["premortem_matrix", dossier.premortem_matrix, validatePremortemItem, finalized ? 1 : 0],
    ["counterexamples", dossier.counterexamples, validateCounterexample, 0],
    ["test_obligations", dossier.test_obligations, validateTestObligation, finalized ? 1 : 0],
    ["specialized_checks", dossier.specialized_checks, validateSpecializedCheck, 0],
    ["assumptions", dossier.assumptions, validateAssumption, 0],
    ["unknowns", dossier.unknowns, validateUnknown, 0],
    ["subagent_handoffs", dossier.subagent_handoffs, validateHandoff, 0],
    ["implementation_slices", dossier.implementation_slices, validateImplementationSlice, finalized ? 1 : 0],
  ];
  for (const [name, value, validator, min] of collections) {
    assertArray(value, `dossier.${name}`, { min, max: QUALITY_LIMITS.arrayItems, item: validator });
    assertUniqueIds(value, `dossier.${name}`);
  }
}

function fingerprintInput(dossier) {
  const copy = { ...dossier };
  delete copy.fingerprint;
  return copy;
}

export function validateEngineeringDossier(value, { requireFinalized = false } = {}) {
  exact(value, DOSSIER_KEYS, DOSSIER_KEYS, "engineering dossier");
  assertSchemaVersion(value.schema_version, ENGINEERING_DOSSIER_SCHEMA_VERSION, "engineering dossier");
  assertSafeId(value.dossier_id, "engineering dossier.dossier_id");
  assertSafeId(value.run_id, "engineering dossier.run_id");
  assertSafeId(value.task_id, "engineering dossier.task_id");
  assertEnum(value.risk_class, QUALITY_RISK_CLASSES, "engineering dossier.risk_class");
  assertEnum(value.mode, DOSSIER_MODES, "engineering dossier.mode");
  assertEnum(value.task_type, DOSSIER_TASK_TYPES, "engineering dossier.task_type");
  assertString(value.user_visible_goal, "engineering dossier.user_visible_goal", { maxBytes: QUALITY_LIMITS.summaryBytes });
  assertInteger(value.revision, "engineering dossier.revision", { min: 1 });
  assertEnum(value.status, DOSSIER_STATUSES, "engineering dossier.status");
  const finalized = value.status === "finalized";
  if (requireFinalized && !finalized) throw new ContractError("QUALITY_DOSSIER_NOT_FINALIZED", "engineering dossier must be finalized");
  if (value.risk_class === "standard-lite" && value.mode !== "standard-lite") {
    throw new ContractError("QUALITY_DOSSIER_MODE", "standard-lite risk requires standard-lite mode");
  }
  if (["high", "critical"].includes(value.risk_class) && value.mode !== "full") {
    throw new ContractError("QUALITY_DOSSIER_MODE", "high and critical risk require full mode");
  }
  validateTaskShape(value.task_shape, "engineering dossier.task_shape");
  validateBehaviorContract(value.behavior_contract, "engineering dossier.behavior_contract");
  validateCompatibilityContract(value.compatibility_contract, "engineering dossier.compatibility_contract");
  validateCollections(value, { finalized });
  const premortemCategories = value.premortem_matrix.map((entry) => entry.category);
  if (new Set(premortemCategories).size !== premortemCategories.length) {
    throw new ContractError("QUALITY_PREMORTEM_CATEGORY_DUPLICATE", "premortem matrix must classify each category at most once");
  }
  if (finalized && ["high", "critical"].includes(value.risk_class)) {
    const missing = PREMORTEM_CATEGORIES.filter((category) => !premortemCategories.includes(category));
    if (missing.length > 0) {
      throw new ContractError("QUALITY_PREMORTEM_CATEGORY_MISSING", `full dossier omits premortem categories: ${missing.join(", ")}`);
    }
  }
  validateImpactGraphPlaceholder(value.impact_graph, "engineering dossier.impact_graph");
  if (value.impact_graph !== null && value.impact_graph.risk_class !== value.risk_class) {
    throw new ContractError("QUALITY_IMPACT_GRAPH_RISK", "dossier and impact graph risk_class values must match");
  }
  validateArchitectureAssessment(value.architecture_assessment, "engineering dossier.architecture_assessment");
  validateContextCoverage(value.context_coverage, "engineering dossier.context_coverage");
  validateVerificationPlan(value.verification_plan, "engineering dossier.verification_plan");
  validateRollbackRecovery(value.rollback_recovery, "engineering dossier.rollback_recovery");
  validatePlanChallenge(value.plan_challenge, "engineering dossier.plan_challenge");
  validateGateState(value.gate_state, "engineering dossier.gate_state");
  validateVerificationBoundary(value.verification_boundary, "engineering dossier.verification_boundary", { finalized });
  assertIso(value.created_at, "engineering dossier.created_at");
  assertIso(value.updated_at, "engineering dossier.updated_at");
  assertTimestampOrder(value.created_at, value.updated_at, "engineering dossier update time");
  if (finalized) {
    if (
      value.user_visible_goal.startsWith("pending-")
      || value.behavior_contract.requested_behavior.startsWith("pending-")
    ) {
      throw new ContractError("QUALITY_DOSSIER_INCOMPLETE", "finalized dossier cannot retain placeholder goal or behavior");
    }
    assertIso(value.finalized_at, "engineering dossier.finalized_at");
    assertTimestampOrder(value.updated_at, value.finalized_at, "engineering dossier finalization time");
    assertFingerprint(value.fingerprint, "engineering dossier.fingerprint");
    const expected = fingerprint(fingerprintInput(value));
    if (!fingerprintsEqual(value.fingerprint, expected)) {
      throw new ContractError("QUALITY_DOSSIER_FINGERPRINT", "engineering dossier fingerprint does not match persisted fields");
    }
    if (["high", "critical"].includes(value.risk_class) && value.impact_graph === null) {
      throw new ContractError("QUALITY_IMPACT_GRAPH_REQUIRED", "high and critical dossiers require an impact graph");
    }
  } else {
    if (value.finalized_at !== null || value.fingerprint !== null) {
      throw new ContractError("QUALITY_DOSSIER_DRAFT_IDENTITY", "draft dossier must have null finalization identity");
    }
  }
  assertReferences(value);
  return value;
}

function emptyTaskShape(startingCommit) {
  return {
    summary: "pending-task-shape",
    starting_commit: startingCommit,
    worktree_state: "clean",
    instruction_sources: ["AGENTS.md"],
    skill_ids: [],
    constraints: ["preserve-unrelated-work"],
    non_goals: [],
  };
}

function emptyBehaviorContract() {
  return {
    status: "ambiguous",
    requested_behavior: "pending-behavior-contract",
    positive_behavior: ["pending-positive-behavior"],
    negative_behavior: [],
    boundary_behavior: [],
    error_behavior: [],
    ordering_and_side_effects: [],
    preserved_behavior: ["existing-public-contracts"],
    compatibility_requirements: [],
    security_requirements: [],
    completion_requirements: ["verification-boundary-passes"],
  };
}

function emptyCompatibilityContract() {
  return {
    status: "ambiguous",
    default_decision: "unresolved",
    rationale: "pending-compatibility-decision",
    evidence_refs: [{ kind: "doc", value: "AGENTS.md" }],
  };
}

function emptyContextCoverage() {
  return {
    status: "complete",
    affected_area_ids: [],
    covered_area_ids: [],
    truncated_area_ids: [],
    accepted_gap_ids: [],
    evidence_refs: [{ kind: "doc", value: "AGENTS.md" }],
  };
}

function emptyVerificationPlan() {
  return {
    baseline_check_ids: [],
    slice_check_ids: [],
    integration_check_ids: [],
    architecture_check_ids: [],
    regression_check_ids: [],
    hidden_check_ids: [],
    truncated_check_ids: [],
    evidence_refs: [{ kind: "doc", value: "AGENTS.md" }],
  };
}

function emptyRollbackRecovery() {
  return {
    rollback_expectation: "pending-rollback-expectation",
    recovery_expectation: "pending-recovery-expectation",
    mapping: {
      classification: "applicable_blocked_unverified",
      check_ids: [],
      mechanism_ids: [],
      evidence_refs: [],
      rationale: null,
      blocked_reason: "rollback-and-recovery-not-yet-classified",
      external_dependency: "engineering-plan",
    },
  };
}

function emptyPlanChallenge() {
  return { architect_result_id: null, reviewer_result_id: null, blockers: [], evidence_refs: [] };
}

export function createEngineeringDossierDraft(input) {
  const keys = [
    "dossier_id",
    "run_id",
    "task_id",
    "risk_class",
    "mode",
    "starting_commit",
    "created_at",
    ...CONTENT_KEYS,
  ];
  exact(input, keys, [
    "dossier_id",
    "run_id",
    "task_id",
    "risk_class",
    "mode",
    "task_type",
    "user_visible_goal",
    "starting_commit",
    "created_at",
  ], "dossier draft input");
  const draft = {
    schema_version: ENGINEERING_DOSSIER_SCHEMA_VERSION,
    dossier_id: input.dossier_id,
    run_id: input.run_id,
    task_id: input.task_id,
    risk_class: input.risk_class,
    mode: input.mode,
    task_type: input.task_type,
    user_visible_goal: input.user_visible_goal,
    revision: 1,
    status: "draft",
    task_shape: input.task_shape ?? emptyTaskShape(input.starting_commit),
    behavior_contract: input.behavior_contract ?? emptyBehaviorContract(),
    compatibility_contract: input.compatibility_contract ?? emptyCompatibilityContract(),
    public_contracts: input.public_contracts ?? [],
    system_boundaries: input.system_boundaries ?? [],
    affected_areas: input.affected_areas ?? [],
    entry_points: input.entry_points ?? [],
    call_paths: input.call_paths ?? [],
    data_shapes: input.data_shapes ?? [],
    invariants: input.invariants ?? [],
    edge_cases: input.edge_cases ?? [],
    failure_modes: input.failure_modes ?? [],
    premortem_matrix: input.premortem_matrix ?? [],
    counterexamples: input.counterexamples ?? [],
    test_obligations: input.test_obligations ?? [],
    specialized_checks: input.specialized_checks ?? [],
    assumptions: input.assumptions ?? [],
    unknowns: input.unknowns ?? [],
    subagent_handoffs: input.subagent_handoffs ?? [],
    implementation_slices: input.implementation_slices ?? [],
    impact_graph: input.impact_graph ?? null,
    architecture_assessment: input.architecture_assessment ?? {
      policy_id: null,
      status: "not_configured",
      evaluation_id: null,
      violation_ids: [],
      notes: null,
    },
    context_coverage: input.context_coverage ?? emptyContextCoverage(),
    verification_plan: input.verification_plan ?? emptyVerificationPlan(),
    rollback_recovery: input.rollback_recovery ?? emptyRollbackRecovery(),
    plan_challenge: input.plan_challenge ?? emptyPlanChallenge(),
    gate_state: input.gate_state ?? { status: "not_evaluated", gate_id: null, reason_codes: [] },
    verification_boundary: input.verification_boundary ?? {
      check_ids: [],
      mechanism_ids: [],
      ownership_paths: [],
      integration_check_ids: [],
    },
    created_at: input.created_at,
    updated_at: input.created_at,
    finalized_at: null,
    fingerprint: null,
  };
  validateEngineeringDossier(draft);
  return deepFrozenClone(draft, "engineering dossier draft");
}

export function updateEngineeringDossierDraft(draft, input) {
  validateEngineeringDossier(draft);
  if (draft.status !== "draft") throw new ContractError("QUALITY_DOSSIER_FINALIZED", "finalized dossier cannot be updated");
  exact(input, ["expected_revision", "updated_at", "patch"], ["expected_revision", "updated_at", "patch"], "dossier update");
  assertInteger(input.expected_revision, "dossier update.expected_revision", { min: 1 });
  if (input.expected_revision !== draft.revision) {
    throw new ContractError("QUALITY_DOSSIER_REVISION_CONFLICT", `expected revision ${input.expected_revision}, found ${draft.revision}`);
  }
  assertIso(input.updated_at, "dossier update.updated_at");
  assertTimestampOrder(draft.updated_at, input.updated_at, "dossier update time");
  assertPlain(input.patch, "dossier update.patch");
  exact(input.patch, CONTENT_KEYS, [], "dossier update.patch");
  if (Object.keys(input.patch).length === 0) throw new ContractError("QUALITY_DOSSIER_EMPTY_UPDATE", "dossier update.patch cannot be empty");
  const next = {
    ...JSON.parse(canonicalJson(draft)),
    ...JSON.parse(canonicalJson(input.patch)),
    revision: draft.revision + 1,
    updated_at: input.updated_at,
  };
  validateEngineeringDossier(next);
  return deepFrozenClone(next, "engineering dossier draft");
}

export function finalizeEngineeringDossier(draft, { finalized_at } = {}) {
  validateEngineeringDossier(draft);
  if (draft.status === "finalized") {
    if (finalized_at !== undefined && finalized_at !== draft.finalized_at) {
      throw new ContractError("QUALITY_DOSSIER_FINALIZE_CONFLICT", "finalization retry timestamp differs from persisted dossier");
    }
    return draft;
  }
  assertIso(finalized_at, "dossier finalization.finalized_at");
  assertTimestampOrder(draft.updated_at, finalized_at, "dossier finalization time");
  const withoutFingerprint = {
    ...JSON.parse(canonicalJson(draft)),
    status: "finalized",
    finalized_at,
  };
  delete withoutFingerprint.fingerprint;
  const finalized = {
    ...withoutFingerprint,
    fingerprint: fingerprint(withoutFingerprint),
  };
  validateEngineeringDossier(finalized, { requireFinalized: true });
  return deepFrozenClone(finalized, "finalized engineering dossier");
}

export function dossierFingerprintInput(dossier) {
  validateEngineeringDossier(dossier);
  return deepFrozenClone(fingerprintInput(dossier), "engineering dossier fingerprint input");
}
