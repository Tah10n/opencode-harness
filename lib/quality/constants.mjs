export const ENGINEERING_DOSSIER_SCHEMA_VERSION = 1;
export const ENGINEERING_IMPACT_GRAPH_SCHEMA_VERSION = 1;
export const ARCHITECTURE_POLICY_SCHEMA_VERSION = 1;
export const ARCHITECTURE_EVALUATION_SCHEMA_VERSION = 1;
export const ENGINEERING_GATE_DECISION_SCHEMA_VERSION = 1;
export const PREIMPLEMENTATION_EVIDENCE_SCHEMA_VERSION = 1;
export const INTEGRATED_VERIFICATION_EVIDENCE_SCHEMA_VERSION = 1;
export const QUALITY_ATTESTATION_SCHEMA_VERSION = 2;
export const PROMPT_INVENTORY_SCHEMA_VERSION = 2;
export const MILESTONE_DOD_SCHEMA_VERSION = 1;

export const QUALITY_RISK_CLASSES = Object.freeze(["standard-lite", "high", "critical"]);
export const DOSSIER_MODES = Object.freeze(["standard-lite", "full"]);
export const DOSSIER_STATUSES = Object.freeze(["draft", "finalized"]);
export const QUALITY_CONFIDENCE_LEVELS = Object.freeze(["observed", "inferred", "unknown"]);

export const DOSSIER_TASK_TYPES = Object.freeze([
  "bug_fix",
  "behavior_preserving_refactor",
  "new_feature",
  "migration",
  "security",
  "maintenance",
]);

export const PREMORTEM_CATEGORIES = Object.freeze([
  "null_absent_empty_malformed_unsupported",
  "min_max_boundary_overflow_large_input",
  "duplicates_repeated_invocation",
  "ordering_out_of_order_delivery",
  "idempotency_retry_duplicate_delivery",
  "partial_success_partial_failure",
  "timeout_cancellation",
  "concurrency_races_interleavings",
  "resource_lifecycle_cleanup_shutdown_leaks",
  "transactions_rollback",
  "stale_state_cache_eventual_consistency",
  "schema_version_skew_mixed_version",
  "backward_compatibility",
  "authorization_tenant_isolation",
  "injection_encoding_sensitive_data",
  "dependency_outage_degraded_mode",
  "restart_recovery_restore",
  "locale_timezone_calendar_date",
  "migration_downgrade_rollback",
  "unexpected_valid_state",
]);

export const TEST_OBLIGATION_KINDS = Object.freeze([
  "reproducer",
  "characterization",
  "unit",
  "contract",
  "integration",
  "system_e2e",
  "negative_path",
  "property_fuzz",
  "race_stress",
  "rollback_recovery",
  "compatibility_version_skew",
  "mutation",
  "command",
  "static",
  "runtime",
  "hidden",
  "manual",
]);

export const VERIFICATION_CLASSIFICATIONS = Object.freeze([
  "applicable_directly_tested",
  "applicable_verified_by_other_mechanism",
  "applicable_blocked_unverified",
  "not_applicable",
]);

export const EVIDENCE_REFERENCE_KINDS = Object.freeze([
  "file",
  "symbol",
  "command",
  "event",
  "check",
  "run",
  "job",
  "doc",
  "runtime",
]);

export const IMPACT_NODE_KINDS = Object.freeze([
  "repository",
  "module",
  "file",
  "symbol",
  "public_api",
  "contract",
  "data_shape",
  "data_store",
  "cache",
  "external_dependency",
  "background_job",
  "event_producer",
  "event_consumer",
  "migration",
  "generated_artifact",
  "serialization_boundary",
  "test",
  "doc",
  "config",
  "command",
]);

export const IMPACT_RELATIONSHIP_KINDS = Object.freeze([
  "imports",
  "calls",
  "reads",
  "writes",
  "defines",
  "tests",
  "documents",
  "configures",
  "depends_on",
  "emits",
  "implements",
  "serializes",
  "deserializes",
  "validates",
  "publishes",
  "consumes",
  "persists",
  "invalidates",
  "migrates",
  "generates",
  "verifies",
  "schedules",
  "owns",
]);

export const ARCHITECTURE_RULE_KINDS = Object.freeze([
  "deny_dependency",
  "allow_dependency",
  "require_test_coverage",
  "deny_cycle",
]);

export const GATE_STATUSES = Object.freeze(["passed", "blocked"]);
export const ARCHITECTURE_EVALUATION_STATUSES = Object.freeze([
  "passed",
  "failed",
  "blocked",
  "not_configured",
]);

export const QUALITY_LIMITS = Object.freeze({
  stringBytes: 2 * 1024,
  summaryBytes: 1024,
  arrayItems: 128,
  evidenceRefs: 64,
  graphNodes: 512,
  graphEdges: 2048,
  objectDepth: 16,
  recordBytes: 256 * 1024,
  bundleBytes: 4 * 1024 * 1024,
  ipcRequestBytes: 128 * 1024,
  ipcResponseBytes: 64 * 1024,
  ipcTotalBytes: 1024 * 1024,
});

export const QUALITY_GATE_REASON_CODES = Object.freeze([
  "QUALITY_DOSSIER_NOT_FINALIZED",
  "QUALITY_DOSSIER_FINGERPRINT_INVALID",
  "QUALITY_DOSSIER_MODE_INVALID",
  "QUALITY_INVARIANT_UNMAPPED",
  "QUALITY_EDGE_CASE_UNMAPPED",
  "QUALITY_FAILURE_MODE_UNMAPPED",
  "QUALITY_PREMORTEM_CATEGORY_MISSING",
  "QUALITY_PREMORTEM_SUBJECT_MISSING",
  "QUALITY_CHECK_UNKNOWN",
  "QUALITY_MECHANISM_UNKNOWN",
  "QUALITY_BLOCKED_UNVERIFIED",
  "QUALITY_BEHAVIOR_AMBIGUOUS",
  "QUALITY_COMPATIBILITY_UNRESOLVED",
  "QUALITY_SYSTEM_BOUNDARY_UNRESOLVED",
  "QUALITY_CONTEXT_COVERAGE_TRUNCATED",
  "QUALITY_WRITE_OWNERSHIP_OVERLAP",
  "QUALITY_BASELINE_EVIDENCE_MISSING",
  "QUALITY_TASK_SPECIFIC_EVIDENCE_MISSING",
  "QUALITY_ROLLBACK_RECOVERY_UNKNOWN",
  "QUALITY_PLAN_CHALLENGE_MISSING",
  "QUALITY_PLAN_CHALLENGE_UNRESOLVED",
  "QUALITY_SPECIALIZED_CHECK_MISSING",
  "QUALITY_VERIFICATION_TRUNCATED",
  "QUALITY_UNKNOWN_BLOCKING",
  "QUALITY_IMPACT_GRAPH_REQUIRED",
  "QUALITY_IMPACT_GRAPH_INCOMPLETE",
  "QUALITY_ARCHITECTURE_REQUIRED_CHECK_UNAVAILABLE",
  "QUALITY_ARCHITECTURE_VIOLATION",
  "QUALITY_STANDARD_LITE_OVERBUILT",
  "QUALITY_HANDOFF_INCOMPLETE",
  "QUALITY_VERIFICATION_BOUNDARY_INCOMPLETE",
  "QUALITY_PRE_GATE_VIOLATION",
  "QUALITY_IMPLEMENTATION_EVENT_MISSING",
  "QUALITY_INTEGRATED_VERIFICATION_MISSING",
]);
