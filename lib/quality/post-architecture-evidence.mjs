import { assertSafeId } from "../feedback/contracts.mjs";
import { validateArchitectureEvaluation, validateArchitecturePolicy } from "./architecture.mjs";
import { validateEngineeringImpactGraph } from "./impact-graph.mjs";
import {
  ContractError,
  assertArray,
  assertFingerprint,
  assertIso,
  assertPlain,
  assertString,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

export const POST_EDIT_ARCHITECTURE_EVIDENCE_SCHEMA_VERSION = 1;
export const POST_EDIT_ARCHITECTURE_EVIDENCE_PRODUCER = "opencode-harness/post-edit-architecture-v1";
export const POST_EDIT_ARCHITECTURE_MECHANISM_KINDS = Object.freeze([
  "project_check",
  "runner_owned_extractor",
]);

const EVIDENCE_KEYS = Object.freeze([
  "schema_version",
  "evidence_id",
  "producer",
  "mechanism_kind",
  "extractor_identity",
  "evaluator_identity",
  "command_receipt_fingerprint",
  "extractor_output_fingerprint",
  "policy_fingerprint",
  "final_workspace_fingerprint",
  "extracted_graph_fingerprint",
  "architecture_evaluation",
  "completed_at",
  "fingerprint",
]);

function validateImplementationIdentity(value, label, { evaluator = false } = {}) {
  assertPlain(value, label);
  const keys = evaluator
    ? ["producer", "algorithm_ids", "implementation_fingerprint"]
    : ["producer", "mechanism_id", "implementation_fingerprint"];
  exact(value, keys, keys, label);
  assertString(value.producer, `${label}.producer`, { maxBytes: 256 });
  assertFingerprint(value.implementation_fingerprint, `${label}.implementation_fingerprint`);
  if (evaluator) {
    assertArray(value.algorithm_ids, `${label}.algorithm_ids`, { min: 1, max: 64 });
    value.algorithm_ids.forEach((entry, index) => assertSafeId(entry, `${label}.algorithm_ids[${index}]`));
    if (new Set(value.algorithm_ids).size !== value.algorithm_ids.length
      || [...value.algorithm_ids].sort().some((entry, index) => entry !== value.algorithm_ids[index])) {
      throw new ContractError("QUALITY_POST_ARCHITECTURE_IDENTITY", `${label}.algorithm_ids must be sorted and unique`);
    }
  } else {
    assertSafeId(value.mechanism_id, `${label}.mechanism_id`);
  }
}

function fingerprintInput(value) {
  const source = { ...value };
  delete source.fingerprint;
  return source;
}

export function validatePostEditArchitectureEvidence(value) {
  assertPlain(value, "post-edit architecture evidence");
  exact(value, EVIDENCE_KEYS, EVIDENCE_KEYS, "post-edit architecture evidence");
  if (value.schema_version !== POST_EDIT_ARCHITECTURE_EVIDENCE_SCHEMA_VERSION
    || value.producer !== POST_EDIT_ARCHITECTURE_EVIDENCE_PRODUCER) {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_SCHEMA", "post-edit architecture evidence schema or producer is unsupported");
  }
  assertSafeId(value.evidence_id, "post-edit architecture evidence.evidence_id");
  if (!POST_EDIT_ARCHITECTURE_MECHANISM_KINDS.includes(value.mechanism_kind)) {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_MECHANISM", "post-edit architecture evidence mechanism is unsupported");
  }
  validateImplementationIdentity(value.extractor_identity, "post-edit architecture evidence.extractor_identity");
  validateImplementationIdentity(value.evaluator_identity, "post-edit architecture evidence.evaluator_identity", { evaluator: true });
  if (value.command_receipt_fingerprint !== null) {
    assertFingerprint(value.command_receipt_fingerprint, "post-edit architecture evidence.command_receipt_fingerprint");
  }
  if ((value.mechanism_kind === "project_check") !== (value.command_receipt_fingerprint !== null)) {
    throw new ContractError(
      "QUALITY_POST_ARCHITECTURE_RECEIPT",
      "project-check architecture evidence requires exactly one trusted command receipt binding",
    );
  }
  for (const key of ["policy_fingerprint", "final_workspace_fingerprint", "extracted_graph_fingerprint"]) {
    assertFingerprint(value[key], `post-edit architecture evidence.${key}`);
  }
  assertFingerprint(value.extractor_output_fingerprint, "post-edit architecture evidence.extractor_output_fingerprint");
  validateArchitectureEvaluation(value.architecture_evaluation);
  const evaluation = value.architecture_evaluation;
  if (evaluation.status === "not_configured" || evaluation.policy_fingerprint !== value.policy_fingerprint
    || evaluation.graph_fingerprint !== value.extracted_graph_fingerprint) {
    throw new ContractError(
      "QUALITY_POST_ARCHITECTURE_BINDING",
      "post-edit architecture evidence does not bind its configured policy and extracted graph",
    );
  }
  const evaluatorIds = evaluation.evaluators.map((entry) => entry.id).sort();
  if (evaluatorIds.length !== value.evaluator_identity.algorithm_ids.length
    || evaluatorIds.some((entry, index) => entry !== value.evaluator_identity.algorithm_ids[index])) {
    throw new ContractError(
      "QUALITY_POST_ARCHITECTURE_IDENTITY",
      "post-edit architecture evaluator identity does not cover the executed algorithms",
    );
  }
  assertIso(value.completed_at, "post-edit architecture evidence.completed_at");
  assertFingerprint(value.fingerprint, "post-edit architecture evidence.fingerprint");
  if (!fingerprintsEqual(value.fingerprint, fingerprint(fingerprintInput(value)))) {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_FINGERPRINT", "post-edit architecture evidence fingerprint is invalid");
  }
  return value;
}

export function createPostEditArchitectureEvidence(input) {
  assertPlain(input, "post-edit architecture evidence input");
  const keys = [
    "evidence_id",
    "mechanism_kind",
    "extractor_identity",
    "evaluator_identity",
    "command_receipt_fingerprint",
    "extractor_output_fingerprint",
    "policy",
    "final_workspace_fingerprint",
    "extracted_graph",
    "architecture_evaluation",
    "completed_at",
  ];
  exact(input, keys, keys, "post-edit architecture evidence input");
  validateArchitecturePolicy(input.policy);
  validateEngineeringImpactGraph(input.extracted_graph);
  validateArchitectureEvaluation(input.architecture_evaluation);
  if (input.architecture_evaluation.policy_fingerprint !== input.policy.fingerprint
    || input.architecture_evaluation.graph_fingerprint !== input.extracted_graph.fingerprint) {
    throw new ContractError(
      "QUALITY_POST_ARCHITECTURE_BINDING",
      "post-edit architecture evaluation does not bind the supplied policy and graph",
    );
  }
  const source = {
    schema_version: POST_EDIT_ARCHITECTURE_EVIDENCE_SCHEMA_VERSION,
    evidence_id: input.evidence_id,
    producer: POST_EDIT_ARCHITECTURE_EVIDENCE_PRODUCER,
    mechanism_kind: input.mechanism_kind,
    extractor_identity: input.extractor_identity,
    evaluator_identity: input.evaluator_identity,
    command_receipt_fingerprint: input.command_receipt_fingerprint,
    extractor_output_fingerprint: input.extractor_output_fingerprint,
    policy_fingerprint: input.policy.fingerprint,
    final_workspace_fingerprint: input.final_workspace_fingerprint,
    extracted_graph_fingerprint: input.extracted_graph.fingerprint,
    architecture_evaluation: input.architecture_evaluation,
    completed_at: input.completed_at,
  };
  const evidence = { ...source, fingerprint: fingerprint(source) };
  validatePostEditArchitectureEvidence(evidence);
  return deepFrozenClone(evidence, "post-edit architecture evidence");
}
