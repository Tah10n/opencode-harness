import { createHash } from "node:crypto";

export class ContractError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "ContractError";
    this.code = code;
  }
}

export const TRACE_SCHEMA_VERSION = 2;
export const SUPPORTED_TRACE_SCHEMA_VERSIONS = Object.freeze([1, 2]);
export const REPORT_SCHEMA_VERSION = 1;
export const ACCEPTANCE_SCHEMA_VERSION = 1;

export const TRACE_STATUSES = Object.freeze([
  "completed",
  "changed",
  "no-op",
  "no-findings",
  "blocked",
  "failed",
  "unsafe",
]);

export const TERMINATION_REASONS = Object.freeze([
  "done",
  "verified",
  "partially_verified",
  "blocked_missing_context",
  "blocked_user_decision",
  "blocked_permission",
  "blocked_external_state",
  "unsafe_without_permission",
  "conflicting_write_scope",
  "budget_exhausted",
  "verification_failed",
  "not_reproducible",
]);

export const JOB_STATES = Object.freeze([
  "created",
  "running",
  "completed",
  "failed",
  "blocked",
  "cancelled",
]);

export const PERMISSION_DECISIONS = Object.freeze([
  "allowed",
  "asked",
  "denied",
  "not_applicable",
]);

export const RISK_LEVELS = Object.freeze(["standard", "high", "critical"]);

export const EVIDENCE_PRODUCERS = Object.freeze({
  staticVerification: "opencode-harness/static-verification-v1",
  runtimePermissionSnapshot: "opencode-harness/runtime-permission-snapshot-v1",
  runtimePermissionComparison: "opencode-harness/runtime-permission-comparison-v1",
  liveEvaluation: "opencode-harness/live-evaluation-v1",
  infrastructureSelfTest: "opencode-harness/infrastructure-self-test-v1",
});

export function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function assertPlainObject(value, label = "value") {
  if (!isPlainObject(value)) {
    throw new ContractError("CONTRACT_OBJECT", `${label} must be a plain object`);
  }
  return value;
}

export function assertExactKeys(value, { allowed, required = [] }, label = "value") {
  assertPlainObject(value, label);
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new ContractError("CONTRACT_UNKNOWN_FIELD", `${label}.${key} is not supported`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      throw new ContractError("CONTRACT_MISSING_FIELD", `${label}.${key} is required`);
    }
  }
  return value;
}

export function assertEnum(value, allowed, label = "value", { nullable = false } = {}) {
  if (nullable && value === null) return value;
  if (!allowed.includes(value)) {
    throw new ContractError("CONTRACT_ENUM", `${label} must be one of: ${allowed.join(", ")}`);
  }
  return value;
}

export function assertSafeId(value, label = "id") {
  const reservedWindowsName = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;
  if (
    typeof value !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)
    || reservedWindowsName.test(value)
    || value.endsWith(".")
  ) {
    throw new ContractError(
      "CONTRACT_ID",
      `${label} must be a portable filename-safe identifier of at most 128 characters`,
    );
  }
  return value;
}

export function assertIsoTimestamp(value, label = "timestamp") {
  if (
    typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || Number.isNaN(Date.parse(value))
  ) {
    throw new ContractError("CONTRACT_TIMESTAMP", `${label} must be an ISO-8601 timestamp with timezone`);
  }
  return value;
}

function canonicalize(value, label) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ContractError("CONTRACT_CANONICAL_NUMBER", `${label} contains a non-finite number`);
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalize(item, `${label}[${index}]`));
  }
  if (isPlainObject(value)) {
    // A normal object would treat `__proto__` as a magic setter.  Keeping the
    // canonical form on a null prototype preserves every own JSON key and
    // prevents distinct inputs from collapsing to the same fingerprint.
    const result = Object.create(null);
    for (const key of Object.keys(value).sort()) {
      const nested = value[key];
      if (nested === undefined) {
        throw new ContractError("CONTRACT_CANONICAL_UNDEFINED", `${label}.${key} is undefined`);
      }
      result[key] = canonicalize(nested, `${label}.${key}`);
    }
    return result;
  }
  throw new ContractError("CONTRACT_CANONICAL_TYPE", `${label} contains an unsupported value type`);
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value, "value"));
}

export function fingerprint(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

export function stableCheckId(scenarioId, phase, index) {
  assertSafeId(scenarioId, "scenarioId");
  assertSafeId(phase, "phase");
  if (!Number.isInteger(index) || index < 0) {
    throw new ContractError("CONTRACT_CHECK_INDEX", "check index must be a non-negative integer");
  }
  return `${scenarioId}.${phase}.${index + 1}`;
}
