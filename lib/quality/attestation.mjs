import { assertEnum, assertSafeId } from "../feedback/contracts.mjs";
import { QUALITY_ATTESTATION_SCHEMA_VERSION } from "./constants.mjs";
import {
  ContractError,
  assertBoolean,
  assertFingerprint,
  assertInteger,
  assertIso,
  assertNullable,
  assertSchemaVersion,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
  validateEvidenceReferences,
} from "./validation.mjs";

const LEGACY_QUALITY_ATTESTATION_SCHEMA_VERSION = 2;

const ATTESTATION_KEYS_V2 = Object.freeze([
  "schema_version",
  "run_id",
  "task_id",
  "dossier_id",
  "dossier_schema_version",
  "dossier_fingerprint",
  "gate_id",
  "gate_status",
  "gate_fingerprint",
  "gate_trace_sequence",
  "first_implementation_sequence",
  "last_implementation_action_sequence",
  "last_workspace_mutation_sequence",
  "integrated_verification_sequence",
  "integrated_verification_evidence_fingerprint",
  "workspace_at_gate_fingerprint",
  "final_workspace_fingerprint",
  "prompt_profile_id",
  "prompt_profile_fingerprint",
  "post_architecture_evaluation_fingerprint",
  "artifact_refs",
  "teardown_verified",
  "attested_at",
  "fingerprint",
]);

const ATTESTATION_KEYS_V3 = Object.freeze([
  "schema_version",
  "run_id",
  "task_id",
  "dossier_id",
  "dossier_schema_version",
  "dossier_fingerprint",
  "gate_id",
  "gate_status",
  "gate_fingerprint",
  "gate_trace_sequence",
  "first_implementation_sequence",
  "last_implementation_action_sequence",
  "last_workspace_mutation_sequence",
  "integrated_verification_sequence",
  "integrated_verification_evidence_fingerprint",
  "workspace_at_gate_fingerprint",
  "final_workspace_fingerprint",
  "prompt_profile_id",
  "prompt_profile_fingerprint",
  "post_architecture_evaluation_fingerprint",
  "context_strategy_id",
  "context_sufficiency_decision_fingerprint",
  "context_reconciliation_fingerprint",
  "artifact_refs",
  "teardown_verified",
  "attested_at",
  "fingerprint",
]);

function nullableSequence(value, label) {
  return assertNullable(value, (entry, entryLabel) => assertInteger(entry, entryLabel, { min: 1 }), label);
}

function fingerprintInput(attestation) {
  const copy = { ...attestation };
  delete copy.fingerprint;
  return copy;
}

function validateQualityAttestationVersion(value, { schemaVersion, keys, contextAware }) {
  const label = contextAware ? "quality attestation" : "legacy quality attestation v2";
  const fieldLabel = contextAware ? label : "legacy quality attestation";
  exact(value, keys, keys, label);
  assertSchemaVersion(value.schema_version, schemaVersion, label);
  for (const key of ["run_id", "task_id", "dossier_id", "gate_id", "prompt_profile_id"]) {
    assertSafeId(value[key], `${fieldLabel}.${key}`);
  }
  assertInteger(value.dossier_schema_version, `${fieldLabel}.dossier_schema_version`, { min: 1, max: 1 });
  assertFingerprint(value.dossier_fingerprint, `${fieldLabel}.dossier_fingerprint`);
  assertEnum(value.gate_status, ["passed", "blocked"], `${fieldLabel}.gate_status`);
  assertFingerprint(value.gate_fingerprint, `${fieldLabel}.gate_fingerprint`);
  assertInteger(value.gate_trace_sequence, `${fieldLabel}.gate_trace_sequence`, { min: 1 });
  nullableSequence(value.first_implementation_sequence, `${fieldLabel}.first_implementation_sequence`);
  nullableSequence(value.last_implementation_action_sequence, `${fieldLabel}.last_implementation_action_sequence`);
  nullableSequence(value.last_workspace_mutation_sequence, `${fieldLabel}.last_workspace_mutation_sequence`);
  nullableSequence(value.integrated_verification_sequence, `${fieldLabel}.integrated_verification_sequence`);
  assertFingerprint(
    value.integrated_verification_evidence_fingerprint,
    `${fieldLabel}.integrated_verification_evidence_fingerprint`,
    { nullable: true },
  );
  assertFingerprint(value.workspace_at_gate_fingerprint, `${fieldLabel}.workspace_at_gate_fingerprint`);
  assertFingerprint(value.final_workspace_fingerprint, `${fieldLabel}.final_workspace_fingerprint`);
  assertFingerprint(value.prompt_profile_fingerprint, `${fieldLabel}.prompt_profile_fingerprint`);
  if (contextAware) {
    assertEnum(value.context_strategy_id, ["standard-lite-local-v1", "high-wide-deep-v1", "critical-wide-deep-v1"], "quality attestation.context_strategy_id");
    assertFingerprint(value.context_sufficiency_decision_fingerprint, "quality attestation.context_sufficiency_decision_fingerprint");
    if (value.context_reconciliation_fingerprint !== null) {
      assertFingerprint(value.context_reconciliation_fingerprint, "quality attestation.context_reconciliation_fingerprint");
    }
  }
  if (value.post_architecture_evaluation_fingerprint !== null) {
    assertFingerprint(
      value.post_architecture_evaluation_fingerprint,
      `${fieldLabel}.post_architecture_evaluation_fingerprint`,
    );
  }
  validateEvidenceReferences(value.artifact_refs, `${fieldLabel}.artifact_refs`, { min: 2 });
  assertBoolean(value.teardown_verified, `${fieldLabel}.teardown_verified`);
  if (!value.teardown_verified) throw new ContractError("QUALITY_TEARDOWN_UNVERIFIED", `${fieldLabel} requires verified teardown`);
  assertIso(value.attested_at, `${fieldLabel}.attested_at`);
  assertFingerprint(value.fingerprint, `${fieldLabel}.fingerprint`);
  if (!fingerprintsEqual(value.fingerprint, fingerprint(fingerprintInput(value)))) {
    throw new ContractError("QUALITY_ATTESTATION_FINGERPRINT", "quality attestation fingerprint mismatch");
  }
  const first = value.first_implementation_sequence;
  const lastAction = value.last_implementation_action_sequence;
  const last = value.last_workspace_mutation_sequence;
  const integrated = value.integrated_verification_sequence;
  if (first !== null && first <= value.gate_trace_sequence) {
    throw new ContractError("QUALITY_ATTESTATION_ORDER", "implementation must follow the linked gate event");
  }
  if ((lastAction !== null || last !== null) && first === null) {
    throw new ContractError("QUALITY_ATTESTATION_ORDER", "implementation activity requires a first implementation sequence");
  }
  if (lastAction !== null && lastAction < first) {
    throw new ContractError("QUALITY_ATTESTATION_ORDER", "last implementation action cannot precede first implementation");
  }
  if (last !== null && (last < first || last > lastAction)) {
    throw new ContractError("QUALITY_ATTESTATION_ORDER", "last workspace mutation must be within the implementation sequence range");
  }
  if (integrated !== null && integrated <= (lastAction ?? value.gate_trace_sequence)) {
    throw new ContractError("QUALITY_ATTESTATION_ORDER", "integrated verification must follow the last implementation action or gate");
  }
  const hasIntegratedFingerprint = value.integrated_verification_evidence_fingerprint !== null;
  if ((integrated !== null) !== hasIntegratedFingerprint) {
    throw new ContractError(
      "QUALITY_ATTESTATION_INTEGRATED_EVIDENCE",
      "integrated verification sequence and evidence fingerprint must be present together",
    );
  }
  if (value.gate_status === "passed" && (
    integrated === null
    || !hasIntegratedFingerprint
    || (contextAware && value.context_reconciliation_fingerprint === null)
  )) {
    throw new ContractError(
      "QUALITY_ATTESTATION_INTEGRATED_EVIDENCE",
      "passed gate requires integrated verification evidence",
    );
  }
  if (value.gate_status === "blocked" && (
    first !== null
    || lastAction !== null
    || last !== null
    || integrated !== null
    || hasIntegratedFingerprint
  )) {
    throw new ContractError("QUALITY_ATTESTATION_BLOCKED_GATE", "blocked gate cannot attest implementation activity");
  }
  const requiredPaths = new Set(["quality/dossier.json", "quality/gate.json"]);
  const fileRefs = new Set(value.artifact_refs.filter((entry) => entry.kind === "file").map((entry) => entry.value));
  for (const required of requiredPaths) {
    if (!fileRefs.has(required)) throw new ContractError("QUALITY_ATTESTATION_ARTIFACT", `${fieldLabel} is missing ${required}`);
  }
  const postArchitecturePath = "quality/post-architecture-evaluation.json";
  if (
    (value.post_architecture_evaluation_fingerprint !== null) !== fileRefs.has(postArchitecturePath)
  ) {
    throw new ContractError(
      "QUALITY_ATTESTATION_ARCHITECTURE",
      "post-implementation architecture fingerprint and artifact reference must be present together",
    );
  }
  const integratedEvidencePath = "quality/integrated-verification-evidence.json";
  if (hasIntegratedFingerprint !== fileRefs.has(integratedEvidencePath)) {
    throw new ContractError(
      "QUALITY_ATTESTATION_INTEGRATED_EVIDENCE",
      "integrated verification fingerprint and artifact reference must be present together",
    );
  }
  if (contextAware) {
    if (!fileRefs.has("quality/context-sufficiency-decision.json")) {
      throw new ContractError("QUALITY_ATTESTATION_ARTIFACT", "quality attestation is missing quality/context-sufficiency-decision.json");
    }
    const reconciliationPath = "quality/context-reconciliation.json";
    if ((value.context_reconciliation_fingerprint !== null) !== fileRefs.has(reconciliationPath)) {
      throw new ContractError("QUALITY_ATTESTATION_CONTEXT", "context reconciliation fingerprint and artifact reference must be present together");
    }
  }
  return value;
}

export function validateQualityAttestation(value) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    if (value.schema_version === LEGACY_QUALITY_ATTESTATION_SCHEMA_VERSION) {
      return validateQualityAttestationVersion(value, {
        schemaVersion: LEGACY_QUALITY_ATTESTATION_SCHEMA_VERSION,
        keys: ATTESTATION_KEYS_V2,
        contextAware: false,
      });
    }
    if (value.schema_version === QUALITY_ATTESTATION_SCHEMA_VERSION) {
      return validateQualityAttestationVersion(value, {
        schemaVersion: QUALITY_ATTESTATION_SCHEMA_VERSION,
        keys: ATTESTATION_KEYS_V3,
        contextAware: true,
      });
    }
    if (Object.hasOwn(value, "schema_version")) {
      assertSchemaVersion(value.schema_version, QUALITY_ATTESTATION_SCHEMA_VERSION, "quality attestation");
    }
  }
  return validateQualityAttestationVersion(value, {
    schemaVersion: QUALITY_ATTESTATION_SCHEMA_VERSION,
    keys: ATTESTATION_KEYS_V3,
    contextAware: true,
  });
}

export function createQualityAttestation(input) {
  const keys = ATTESTATION_KEYS_V3.filter((key) => key !== "schema_version" && key !== "fingerprint");
  exact(input, keys, keys, "quality attestation input");
  const source = { schema_version: QUALITY_ATTESTATION_SCHEMA_VERSION, ...input };
  const attestation = { ...source, fingerprint: fingerprint(source) };
  validateQualityAttestation(attestation);
  return deepFrozenClone(attestation, "quality attestation");
}

export function qualityAttestationFingerprintInput(attestation) {
  validateQualityAttestation(attestation);
  return deepFrozenClone(fingerprintInput(attestation), "quality attestation fingerprint input");
}
