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
      "integrated_verification_evidence_fingerprint", "runtime_execution_fingerprint", "workspace_at_gate_fingerprint",
      "final_workspace_fingerprint", "model_profile_id", "model_profile_fingerprint", "prompt_profile_id",
      "prompt_profile_fingerprint", "post_architecture_evaluation_fingerprint", "artifact_refs",
      "teardown_verified", "attested_at", "fingerprint",
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

const catalog = readJson("quality/model-profiles/catalog.v1.json");
const experiment = readJson("quality/model-profiles/experiment.v1.json");
const runtimeFixture = readJson("quality/model-profiles/runtime-fixture-evidence.v1.json");
const promptInventory = readJson("quality/prompt-inventory/baseline.v1.json");
const acceptancePolicy = readJson("quality/acceptance/acceptance-policy.v2.json");
quality.validateModelProfileCatalog(catalog);
quality.validateEngineeringExperimentManifest(experiment, { catalog });
quality.validateRuntimeModelEvidence(runtimeFixture, { catalog });
quality.validatePromptInventory(promptInventory);
quality.validateQualityAcceptancePolicy(acceptancePolicy);

assert.equal(runtimeFixture.evidence_kind, "fixture_parser");
assert.equal(quality.evaluateRuntimeModelEvidence(runtimeFixture, catalog).eligible, false, "fixture evidence must not authorize execution");
assert(quality.evaluateRuntimeModelEvidence(runtimeFixture, catalog).reason_codes.includes("RUNTIME_MODEL_INSTALLED_EVIDENCE_REQUIRED"));

console.log("Quality contract verification passed (closed checked schemas, v1/v2 dispatch, public API identity, and fail-closed runtime evidence).");
