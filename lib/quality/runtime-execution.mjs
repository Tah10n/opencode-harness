import { assertEnum, assertSafeId } from "../feedback/contracts.mjs";
import {
  MODEL_MODES,
  MODEL_PROFILE_ROLES,
  MODEL_REASONING_EFFORTS,
  MODEL_TEXT_VERBOSITIES,
} from "./model-profiles.mjs";
import {
  ContractError,
  assertFingerprint,
  assertInteger,
  assertString,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

export const RUNTIME_EXECUTION_BINDING_SCHEMA_VERSION = 1;

const PROFILE_ROLES = Object.freeze(["baseline", "candidate"]);
const INPUT_KEYS = Object.freeze([
  "repository_fingerprint",
  "host_profile_id",
  "experiment_id",
  "experiment_fingerprint",
  "comparison_id",
  "variant_id",
  "harness_role",
  "scenario_id",
  "scenario_fingerprint",
  "repetition",
  "profile_role",
  "profile_fingerprint",
  "model_profile_id",
  "model_profile_fingerprint",
  "model_id",
  "reasoning_effort",
  "text_verbosity",
  "mode",
  "prompt_profile_id",
  "prompt_profile_fingerprint",
  "runtime_model_evidence_fingerprint",
  "permission_snapshot_fingerprint",
  "permission_profile_fingerprint",
]);
const BINDING_KEYS = Object.freeze([
  "schema_version",
  ...INPUT_KEYS,
  "runtime_execution_fingerprint",
]);

function validateInput(value, label = "runtime execution binding input") {
  exact(value, INPUT_KEYS, INPUT_KEYS, label);
  for (const key of [
    "host_profile_id",
    "experiment_id",
    "comparison_id",
    "variant_id",
    "scenario_id",
    "model_profile_id",
    "prompt_profile_id",
  ]) {
    assertSafeId(value[key], `${label}.${key}`);
  }
  for (const key of [
    "repository_fingerprint",
    "experiment_fingerprint",
    "scenario_fingerprint",
    "profile_fingerprint",
    "model_profile_fingerprint",
    "prompt_profile_fingerprint",
    "runtime_model_evidence_fingerprint",
    "permission_snapshot_fingerprint",
    "permission_profile_fingerprint",
  ]) {
    assertFingerprint(value[key], `${label}.${key}`);
  }
  assertEnum(value.harness_role, MODEL_PROFILE_ROLES, `${label}.harness_role`);
  assertInteger(value.repetition, `${label}.repetition`, { min: 1, max: 100 });
  assertEnum(value.profile_role, PROFILE_ROLES, `${label}.profile_role`);
  assertString(value.model_id, `${label}.model_id`, { maxBytes: 128 });
  assertEnum(value.reasoning_effort, MODEL_REASONING_EFFORTS, `${label}.reasoning_effort`);
  assertEnum(value.text_verbosity, MODEL_TEXT_VERBOSITIES, `${label}.text_verbosity`);
  assertEnum(value.mode, MODEL_MODES, `${label}.mode`);
  return value;
}

function fingerprintSource(input) {
  validateInput(input);
  return { schema_version: RUNTIME_EXECUTION_BINDING_SCHEMA_VERSION, ...input };
}

export function runtimeExecutionFingerprint(input) {
  return fingerprint(fingerprintSource(input));
}

export function createRuntimeExecutionBinding(input) {
  const source = fingerprintSource(input);
  return deepFrozenClone({
    ...source,
    runtime_execution_fingerprint: fingerprint(source),
  }, "runtime execution binding");
}

export function validateRuntimeExecutionBinding(value) {
  exact(value, BINDING_KEYS, BINDING_KEYS, "runtime execution binding");
  if (value.schema_version !== RUNTIME_EXECUTION_BINDING_SCHEMA_VERSION) {
    throw new ContractError(
      "QUALITY_RUNTIME_EXECUTION_SCHEMA",
      `runtime execution binding.schema_version must be ${RUNTIME_EXECUTION_BINDING_SCHEMA_VERSION}`,
    );
  }
  const input = Object.fromEntries(INPUT_KEYS.map((key) => [key, value[key]]));
  validateInput(input, "runtime execution binding");
  assertFingerprint(value.runtime_execution_fingerprint, "runtime execution binding.runtime_execution_fingerprint");
  if (!fingerprintsEqual(value.runtime_execution_fingerprint, runtimeExecutionFingerprint(input))) {
    throw new ContractError(
      "QUALITY_RUNTIME_EXECUTION_FINGERPRINT",
      "runtime execution binding fingerprint does not match its canonical inputs",
    );
  }
  return value;
}
