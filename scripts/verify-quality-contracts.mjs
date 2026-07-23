import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACCEPTANCE_POLICY_SCHEMA_VERSION,
  LEGACY_REPORT_SCHEMA_VERSION,
  REPORT_SCHEMA_VERSION,
} from "../lib/feedback/contracts.mjs";
import * as quality from "../lib/quality/index.mjs";
import { createEngineeringDossierDraft as directCreateDossier } from "../lib/quality/dossier.mjs";
import { evaluateEngineeringGate as directEvaluateGate } from "../lib/quality/gate.mjs";
import { ContractError, fingerprint } from "../lib/quality/validation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8").replace(/^\uFEFF/, ""));
}

const schemas = [
  {
    path: "quality/schemas/engineering-dossier.schema.json",
    version: quality.ENGINEERING_DOSSIER_SCHEMA_VERSION,
    required: [
      "schema_version", "dossier_id", "run_id", "task_id", "risk_class", "mode", "task_type", "user_visible_goal",
      "revision", "status", "task_shape", "behavior_contract", "compatibility_contract", "public_contracts",
      "system_boundaries", "affected_areas", "entry_points", "call_paths", "data_shapes", "invariants",
      "edge_cases", "failure_modes", "premortem_matrix", "counterexamples", "test_obligations",
      "specialized_checks", "assumptions", "unknowns", "subagent_handoffs", "implementation_slices",
      "impact_graph", "architecture_assessment", "context_coverage", "verification_plan", "rollback_recovery",
      "plan_challenge", "gate_state", "verification_boundary", "created_at", "updated_at",
      "finalized_at", "fingerprint",
    ],
  },
  {
    path: "quality/schemas/engineering-gate-decision.schema.json",
    version: quality.ENGINEERING_GATE_DECISION_SCHEMA_VERSION,
    required: [
      "schema_version", "gate_id", "dossier_id", "dossier_fingerprint", "task_id", "risk_class", "status",
      "reasons", "check_catalog_fingerprint", "preimplementation_evidence_fingerprint", "architecture_evaluation_fingerprint", "evaluated_at", "fingerprint",
    ],
  },
  {
    path: "quality/schemas/preimplementation-evidence.schema.json",
    version: quality.PREIMPLEMENTATION_EVIDENCE_SCHEMA_VERSION,
    required: [
      "schema_version", "evidence_id", "dossier_id", "dossier_fingerprint",
      "baseline_receipts", "plan_challenge_receipts", "fingerprint",
    ],
  },
  {
    path: "quality/schemas/integrated-verification-evidence.schema.json",
    version: quality.INTEGRATED_VERIFICATION_EVIDENCE_SCHEMA_VERSION,
    required: [
      "schema_version", "evidence_id", "run_id", "task_id", "dossier_id", "dossier_fingerprint",
      "gate_id", "gate_fingerprint", "check_catalog_fingerprint", "workspace_fingerprint",
      "trace_event_id", "trace_event_sequence", "trace_event_timestamp", "trace_event_fingerprint",
      "check_receipts", "mechanism_receipts", "completed_at", "fingerprint",
    ],
  },
  {
    path: "quality/schemas/quality-attestation.schema.json",
    version: quality.QUALITY_ATTESTATION_SCHEMA_VERSION,
    required: [
      "schema_version", "run_id", "task_id", "dossier_id", "dossier_schema_version", "dossier_fingerprint",
      "gate_id", "gate_status", "gate_fingerprint", "gate_trace_sequence", "first_implementation_sequence",
      "last_implementation_action_sequence", "last_workspace_mutation_sequence", "integrated_verification_sequence",
      "integrated_verification_evidence_fingerprint", "workspace_at_gate_fingerprint",
      "final_workspace_fingerprint", "prompt_profile_id",
      "prompt_profile_fingerprint", "post_architecture_evaluation_fingerprint", "context_strategy_id",
      "context_sufficiency_decision_fingerprint", "context_reconciliation_fingerprint", "artifact_refs",
      "teardown_verified", "attested_at", "fingerprint",
    ],
  },
  {
    path: "quality/schemas/context-receipt.schema.json",
    version: quality.CONTEXT_RECEIPT_SCHEMA_VERSION,
    required: [
      "schema_version", "producer", "receipt_id", "sequence", "previous_receipt_fingerprint", "session_key",
      "parent_session_key", "producer_session_key", "producer_role", "run_id", "task_id", "worktree_fingerprint", "source_fingerprint",
      "context_strategy_id", "context_strategy_fingerprint", "parent_question_id", "evidence_refs",
      "mutation_revision_started", "mutation_revision_completed", "tool_id", "call_key_fingerprint",
      "started_at", "completed_at", "status", "reason_code", "tool_output_schema_version", "request",
      "tool_snapshot", "result", "fingerprint",
    ],
  },
  {
    path: "quality/schemas/whole-system-context-report.schema.json",
    version: quality.WHOLE_SYSTEM_CONTEXT_REPORT_SCHEMA_VERSION,
    required: [
      "schema_version", "report_id", "session_key", "run_id", "task_id", "risk_class", "strategy_id",
      "strategy_binding_fingerprint", "workspace_fingerprint", "dossier_id", "dossier_analysis_fingerprint",
      "impact_graph_id", "impact_graph_fingerprint", "status", "revision", "wide_analysis", "claims",
      "deep_analyses", "questions", "task_evidence", "tool_state", "budget_state", "receipt_ids",
      "created_at", "updated_at", "finalized_at", "fingerprint",
    ],
  },
  {
    path: "quality/schemas/context-sufficiency-decision.schema.json",
    version: quality.CONTEXT_SUFFICIENCY_DECISION_SCHEMA_VERSION,
    required: [
      "schema_version", "decision_id", "session_key", "run_id", "task_id", "risk_class", "strategy_id",
      "strategy_binding_fingerprint", "workspace_fingerprint", "dossier_id", "dossier_analysis_fingerprint",
      "impact_graph_id", "impact_graph_fingerprint", "report_id", "report_fingerprint",
      "receipt_index_fingerprint", "preimplementation_cutoff_sequence", "implementation_started_sequence",
      "task_profile_evidence", "status", "reasons", "evaluated_at", "fingerprint",
    ],
  },
  {
    path: "quality/schemas/context-reconciliation.schema.json",
    version: quality.CONTEXT_RECONCILIATION_SCHEMA_VERSION,
    required: [
      "schema_version", "reconciliation_id", "session_key", "run_id", "task_id", "risk_class",
      "strategy_id", "context_decision_id", "context_decision_fingerprint", "context_report_id",
      "context_report_fingerprint", "impact_graph_id", "impact_graph_fingerprint", "pre_workspace_fingerprint",
      "final_workspace_fingerprint", "final_diff_fingerprint", "evidence_mode", "graph_completeness",
      "post_architecture_evidence_fingerprint", "reviewer_evidence_fingerprint", "changed_paths",
      "verified_post_mutation_test_obligation_ids",
      "unexpected_public_contracts", "unexpected_dependency_directions", "unexpected_side_effect_edges",
      "unrelated_paths", "unplanned_items", "status", "reason_codes", "invalidates_context_decision",
      "reconciled_at", "fingerprint",
    ],
  },
];

for (const definition of schemas) {
  const schema = readJson(definition.path);
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema", `${definition.path} draft`);
  assert.equal(schema.type, "object", `${definition.path} root type`);
  assert.equal(schema.additionalProperties, false, `${definition.path} must be closed`);
  assert.equal(schema.properties.schema_version.const, definition.version, `${definition.path} version drift`);
  assert.deepEqual(schema.required, definition.required, `${definition.path} required-key drift`);
  assert.deepEqual(Object.keys(schema.properties), definition.required, `${definition.path} property-key drift`);
}

const dossierSchema = readJson("quality/schemas/engineering-dossier.schema.json");
assert.equal(dossierSchema.properties.unknowns.items.$ref, "#/$defs/unknown", "dossier unknowns must use a closed scoped schema");
assert.deepEqual(
  dossierSchema.$defs.unknown.required,
  ["id", "scope_ids", "statement", "impact", "resolution_plan", "owner", "blocking"],
  "dossier unknown scope contract drift",
);

assert.equal(LEGACY_REPORT_SCHEMA_VERSION, 1);
assert.equal(REPORT_SCHEMA_VERSION, 2);
assert.equal(ACCEPTANCE_POLICY_SCHEMA_VERSION, 2);
assert.equal(quality.createEngineeringDossierDraft, directCreateDossier, "quality package must preserve dossier implementation identity");
assert.equal(quality.evaluateEngineeringGate, directEvaluateGate, "quality package must preserve gate implementation identity");

const contractFingerprint = (digit) => `sha256:${digit.repeat(64)}`;

function refingerprint(value) {
  const candidate = structuredClone(value);
  delete candidate.fingerprint;
  return { ...candidate, fingerprint: fingerprint(candidate) };
}

function expectContractError(action, code, label) {
  assert.throws(
    action,
    (error) => error instanceof ContractError && error.code === code,
    `${label} must fail with ${code}`,
  );
}

const currentAttestation = quality.createQualityAttestation({
  run_id: "run-attestation-contract",
  task_id: "task-attestation-contract",
  dossier_id: "dossier-attestation-contract",
  dossier_schema_version: 1,
  dossier_fingerprint: contractFingerprint("1"),
  gate_id: "gate-attestation-contract",
  gate_status: "passed",
  gate_fingerprint: contractFingerprint("2"),
  gate_trace_sequence: 1,
  first_implementation_sequence: 2,
  last_implementation_action_sequence: 3,
  last_workspace_mutation_sequence: 3,
  integrated_verification_sequence: 4,
  integrated_verification_evidence_fingerprint: contractFingerprint("3"),
  workspace_at_gate_fingerprint: contractFingerprint("4"),
  final_workspace_fingerprint: contractFingerprint("5"),
  prompt_profile_id: "prompt-attestation-contract",
  prompt_profile_fingerprint: contractFingerprint("6"),
  post_architecture_evaluation_fingerprint: null,
  context_strategy_id: "high-wide-deep-v1",
  context_sufficiency_decision_fingerprint: contractFingerprint("7"),
  context_reconciliation_fingerprint: contractFingerprint("8"),
  artifact_refs: [
    { kind: "file", value: "quality/dossier.json" },
    { kind: "file", value: "quality/gate.json" },
    { kind: "file", value: "quality/integrated-verification-evidence.json" },
    { kind: "file", value: "quality/context-sufficiency-decision.json" },
    { kind: "file", value: "quality/context-reconciliation.json" },
  ],
  teardown_verified: true,
  attested_at: "2026-07-18T00:00:00.000Z",
});
assert.equal(currentAttestation.schema_version, quality.QUALITY_ATTESTATION_SCHEMA_VERSION, "attestation creator must emit only the current schema");
assert.strictEqual(quality.validateQualityAttestation(currentAttestation), currentAttestation, "public validator must accept current v3 attestations");

const legacyAttestation = structuredClone(currentAttestation);
legacyAttestation.schema_version = 2;
legacyAttestation.artifact_refs = legacyAttestation.artifact_refs.filter((entry) => ![
  "quality/context-sufficiency-decision.json",
  "quality/context-reconciliation.json",
].includes(entry.value));
delete legacyAttestation.context_strategy_id;
delete legacyAttestation.context_sufficiency_decision_fingerprint;
delete legacyAttestation.context_reconciliation_fingerprint;
const validLegacyAttestation = refingerprint(legacyAttestation);
assert.strictEqual(quality.validateQualityAttestation(validLegacyAttestation), validLegacyAttestation, "public validator must accept strict legacy v2 attestations");
assert.equal(
  Object.hasOwn(quality.qualityAttestationFingerprintInput(validLegacyAttestation), "fingerprint"),
  false,
  "public fingerprint-input helper must support legacy v2 attestations",
);

const mixedVersionFields = refingerprint({
  ...validLegacyAttestation,
  context_strategy_id: "high-wide-deep-v1",
});
expectContractError(
  () => quality.validateQualityAttestation(mixedVersionFields),
  "CONTRACT_UNKNOWN_FIELD",
  "v2 attestation with a v3 field",
);

const extraLegacyField = refingerprint({ ...validLegacyAttestation, unexpected: true });
expectContractError(
  () => quality.validateQualityAttestation(extraLegacyField),
  "CONTRACT_UNKNOWN_FIELD",
  "v2 attestation with an extra field",
);

const missingLegacyField = structuredClone(validLegacyAttestation);
delete missingLegacyField.task_id;
expectContractError(
  () => quality.validateQualityAttestation(refingerprint(missingLegacyField)),
  "CONTRACT_MISSING_FIELD",
  "v2 attestation with a missing field",
);

const badFingerprint = structuredClone(validLegacyAttestation);
badFingerprint.final_workspace_fingerprint = contractFingerprint("9");
expectContractError(
  () => quality.validateQualityAttestation(badFingerprint),
  "QUALITY_ATTESTATION_FINGERPRINT",
  "v2 attestation with a stale fingerprint",
);

expectContractError(
  () => quality.validateQualityAttestation(refingerprint({ ...validLegacyAttestation, teardown_verified: false })),
  "QUALITY_TEARDOWN_UNVERIFIED",
  "v2 attestation without verified teardown",
);

expectContractError(
  () => quality.validateQualityAttestation(refingerprint({
    ...validLegacyAttestation,
    first_implementation_sequence: validLegacyAttestation.gate_trace_sequence,
  })),
  "QUALITY_ATTESTATION_ORDER",
  "v2 attestation with implementation before its gate",
);

const passedWithoutIntegratedEvidence = structuredClone(validLegacyAttestation);
passedWithoutIntegratedEvidence.integrated_verification_sequence = null;
passedWithoutIntegratedEvidence.integrated_verification_evidence_fingerprint = null;
passedWithoutIntegratedEvidence.artifact_refs = passedWithoutIntegratedEvidence.artifact_refs.filter(
  (entry) => entry.value !== "quality/integrated-verification-evidence.json",
);
expectContractError(
  () => quality.validateQualityAttestation(refingerprint(passedWithoutIntegratedEvidence)),
  "QUALITY_ATTESTATION_INTEGRATED_EVIDENCE",
  "passed v2 attestation without integrated evidence",
);

expectContractError(
  () => quality.validateQualityAttestation(refingerprint({ ...validLegacyAttestation, gate_status: "blocked" })),
  "QUALITY_ATTESTATION_BLOCKED_GATE",
  "blocked v2 attestation with implementation activity",
);

const integratedArtifactMismatch = structuredClone(validLegacyAttestation);
integratedArtifactMismatch.artifact_refs = integratedArtifactMismatch.artifact_refs.filter(
  (entry) => entry.value !== "quality/integrated-verification-evidence.json",
);
expectContractError(
  () => quality.validateQualityAttestation(refingerprint(integratedArtifactMismatch)),
  "QUALITY_ATTESTATION_INTEGRATED_EVIDENCE",
  "v2 attestation with an integrated-artifact mismatch",
);

expectContractError(
  () => quality.validateQualityAttestation(refingerprint({ ...structuredClone(currentAttestation), schema_version: 4 })),
  "QUALITY_SCHEMA_VERSION",
  "attestation with an unknown schema version",
);

const malformedCurrentAttestation = structuredClone(currentAttestation);
delete malformedCurrentAttestation.context_strategy_id;
expectContractError(
  () => quality.validateQualityAttestation(refingerprint(malformedCurrentAttestation)),
  "CONTRACT_MISSING_FIELD",
  "malformed v3 attestation without legacy fallback",
);

const legacyPromptInventory = readJson("quality/prompt-inventory/baseline.v2.json");
const promptInventory = readJson("quality/prompt-inventory/baseline.v3.json");
const acceptancePolicy = readJson("quality/acceptance/acceptance-policy.v2.json");
const contextAcceptancePolicy = readJson("quality/acceptance/acceptance-policy.v3.json");
quality.validatePromptInventory(legacyPromptInventory);
quality.validatePromptInventory(promptInventory);
quality.validateQualityAcceptancePolicy(acceptancePolicy);
quality.validateQualityAcceptancePolicy(contextAcceptancePolicy);
assert.equal(
  quality.requiredEngineeringVerificationTargets,
  (await import("../lib/quality/verification-targets.mjs")).requiredEngineeringVerificationTargets,
  "quality package must preserve canonical verification-target implementation identity",
);

console.log("Quality contract verification passed (closed schemas, strict prompt-inventory v2/v3 and attestation compatibility, model-neutral acceptance, and public API identity).");
