import { assertEnum, assertSafeId } from "../feedback/contracts.mjs";
import { QUALITY_ATTESTATION_SCHEMA_VERSION } from "./constants.mjs";
import {
  ContractError,
  assertArray,
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

const ATTESTATION_KEYS = Object.freeze([
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
  "runtime_execution_fingerprint",
  "workspace_at_gate_fingerprint",
  "final_workspace_fingerprint",
  "model_profile_id",
  "model_profile_fingerprint",
  "prompt_profile_id",
  "prompt_profile_fingerprint",
  "post_architecture_evaluation_fingerprint",
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

export function validateQualityAttestation(value) {
  exact(value, ATTESTATION_KEYS, ATTESTATION_KEYS, "quality attestation");
  assertSchemaVersion(value.schema_version, QUALITY_ATTESTATION_SCHEMA_VERSION, "quality attestation");
  for (const key of ["run_id", "task_id", "dossier_id", "gate_id", "model_profile_id", "prompt_profile_id"]) {
    assertSafeId(value[key], `quality attestation.${key}`);
  }
  assertInteger(value.dossier_schema_version, "quality attestation.dossier_schema_version", { min: 1, max: 1 });
  assertFingerprint(value.dossier_fingerprint, "quality attestation.dossier_fingerprint");
  assertEnum(value.gate_status, ["passed", "blocked"], "quality attestation.gate_status");
  assertFingerprint(value.gate_fingerprint, "quality attestation.gate_fingerprint");
  assertInteger(value.gate_trace_sequence, "quality attestation.gate_trace_sequence", { min: 1 });
  nullableSequence(value.first_implementation_sequence, "quality attestation.first_implementation_sequence");
  nullableSequence(value.last_implementation_action_sequence, "quality attestation.last_implementation_action_sequence");
  nullableSequence(value.last_workspace_mutation_sequence, "quality attestation.last_workspace_mutation_sequence");
  nullableSequence(value.integrated_verification_sequence, "quality attestation.integrated_verification_sequence");
  assertFingerprint(
    value.integrated_verification_evidence_fingerprint,
    "quality attestation.integrated_verification_evidence_fingerprint",
    { nullable: true },
  );
  assertFingerprint(value.runtime_execution_fingerprint, "quality attestation.runtime_execution_fingerprint", { nullable: true });
  assertFingerprint(value.workspace_at_gate_fingerprint, "quality attestation.workspace_at_gate_fingerprint");
  assertFingerprint(value.final_workspace_fingerprint, "quality attestation.final_workspace_fingerprint");
  assertFingerprint(value.model_profile_fingerprint, "quality attestation.model_profile_fingerprint");
  assertFingerprint(value.prompt_profile_fingerprint, "quality attestation.prompt_profile_fingerprint");
  if (value.post_architecture_evaluation_fingerprint !== null) {
    assertFingerprint(
      value.post_architecture_evaluation_fingerprint,
      "quality attestation.post_architecture_evaluation_fingerprint",
    );
  }
  validateEvidenceReferences(value.artifact_refs, "quality attestation.artifact_refs", { min: 2 });
  assertBoolean(value.teardown_verified, "quality attestation.teardown_verified");
  if (!value.teardown_verified) throw new ContractError("QUALITY_TEARDOWN_UNVERIFIED", "quality attestation requires verified teardown");
  assertIso(value.attested_at, "quality attestation.attested_at");
  assertFingerprint(value.fingerprint, "quality attestation.fingerprint");
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
    || value.runtime_execution_fingerprint === null
  )) {
    throw new ContractError(
      "QUALITY_ATTESTATION_INTEGRATED_EVIDENCE",
      "passed gate requires integrated verification and runtime execution fingerprints",
    );
  }
  if (value.gate_status === "blocked" && (
    first !== null
    || lastAction !== null
    || last !== null
    || integrated !== null
    || hasIntegratedFingerprint
    || value.runtime_execution_fingerprint !== null
  )) {
    throw new ContractError("QUALITY_ATTESTATION_BLOCKED_GATE", "blocked gate cannot attest implementation activity");
  }
  const requiredPaths = new Set(["quality/dossier.json", "quality/gate.json"]);
  const fileRefs = new Set(value.artifact_refs.filter((entry) => entry.kind === "file").map((entry) => entry.value));
  for (const required of requiredPaths) {
    if (!fileRefs.has(required)) throw new ContractError("QUALITY_ATTESTATION_ARTIFACT", `quality attestation is missing ${required}`);
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
  return value;
}

export function createQualityAttestation(input) {
  const keys = ATTESTATION_KEYS.filter((key) => key !== "schema_version" && key !== "fingerprint");
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
