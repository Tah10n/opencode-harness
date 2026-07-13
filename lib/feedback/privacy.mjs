import path from "node:path";
import { ContractError, assertPlainObject, assertSafeId } from "./contracts.mjs";

export const DEFAULT_LIMITS = Object.freeze({
  string: 1000,
  summary: 500,
  array: 50,
  objectKeys: 50,
  depth: 4,
});

const secretAssignmentPattern = /\b[A-Za-z0-9_]*(?:API_KEY|TOKEN|SECRET|PRIVATE_KEY|PASSWORD|CREDENTIAL)[A-Za-z0-9_]*\s*(?:=|:)\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|`[^`\r\n]*`|[^\s"'`]+)/i;
const bearerTokenPattern = /\b(?:authorization\s*:\s*)?bearer\s+[A-Za-z0-9._~+\/-]+/i;
const providerTokenPattern = /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{6,}|eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}|gh[pousr]_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|AKIA[A-Z0-9]{12,}|AIza[A-Za-z0-9_-]{12,})\b/i;
const privateKeyPattern = /-----?BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----?/i;
const sensitiveTextPattern = /\b(?:api[_\s-]?key|access[_\s-]?token|secret|credential|private[_\s-]?key|password)\b/i;
const forbiddenKeyPattern = /^(?:stdout|stderr|transcript|raw_?(?:prompt|completion|log|logs|source|source_dump)|prompt|completion|private_log|source_dump)$/i;
const reservedWindowsName = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;
const persistenceIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const credentialMaterialReasons = new Set([
  "secret_assignment",
  "bearer_token",
  "token_pattern",
  "private_key_marker",
  "absolute_path",
]);

function credentialMaterialDetected(reasons) {
  return reasons.some((reason) => credentialMaterialReasons.has(reason));
}

export function isAbsoluteLikePath(value) {
  if (typeof value !== "string") return false;
  return path.win32.isAbsolute(value)
    || path.posix.isAbsolute(value)
    || /^[A-Za-z]:[\\/]/.test(value)
    || /^\\\\[?.]\\/.test(value);
}

function pathRedactionNeeded(value) {
  if (isAbsoluteLikePath(value)) return true;
  return /(^|[\s('"`=])(?:[A-Za-z]:[\\/]|\\\\[^\s]+[\\/]|\/+?(?=[^\s)'"`])[^\s)'"`]*)/i.test(value);
}

export function sensitiveTextReasons(value) {
  if (typeof value !== "string") return [];
  const reasons = [];
  if (secretAssignmentPattern.test(value)) reasons.push("secret_assignment");
  if (bearerTokenPattern.test(value)) reasons.push("bearer_token");
  if (providerTokenPattern.test(value)) reasons.push("token_pattern");
  if (privateKeyPattern.test(value)) reasons.push("private_key_marker");
  if (sensitiveTextPattern.test(value)) reasons.push("sensitive_marker");
  if (pathRedactionNeeded(value)) reasons.push("absolute_path");
  return reasons;
}

/**
 * Validate an identity that will be persisted.  Identities cannot be redacted:
 * doing so would merge unrelated records, so sensitive-looking IDs fail closed.
 */
export function assertSafePersistenceId(value, label = "id") {
  assertSafeId(value, label);
  if (credentialMaterialDetected(sensitiveTextReasons(value))) {
    throw new ContractError("PRIVACY_ID", `${label} contains sensitive identity material`);
  }
  return value;
}

/**
 * Final, recursive persistence boundary.  This is deliberately independent of
 * individual field sanitizers so a newly added report field cannot bypass the
 * privacy contract. `denyValues` is intended for secret-bait/canary values.
 */
export function assertPersistenceSafe(value, {
  label = "value",
  denyValues = [],
  maxDepth = 16,
  depth = 0,
} = {}) {
  if (!Array.isArray(denyValues) || denyValues.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new ContractError("PRIVACY_DENY_VALUES", "denyValues must contain non-empty strings");
  }
  if (depth > maxDepth) throw new ContractError("PRIVACY_DEPTH", `${label} exceeds maximum object depth ${maxDepth}`);
  if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value;
  if (typeof value === "string") {
    if (denyValues.some((denied) => value.includes(denied))) {
      throw new ContractError("PRIVACY_DENY_VALUE", `${label} contains a denied persistence value`);
    }
    if (value !== "[redacted]") {
      const reasons = sensitiveTextReasons(value);
      if (
        credentialMaterialDetected(reasons)
        || (reasons.includes("sensitive_marker") && !persistenceIdPattern.test(value))
      ) {
        throw new ContractError("PRIVACY_UNSAFE_VALUE", `${label} contains unsafe persisted text`);
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPersistenceSafe(item, { label: `${label}[${index}]`, denyValues, maxDepth, depth: depth + 1 }));
    return value;
  }
  assertPlainObject(value, label);
  for (const [key, nested] of Object.entries(value)) {
    if (isForbiddenPersistenceKey(key)) {
      throw new ContractError("PRIVACY_FORBIDDEN_FIELD", `${label}.${key} must never be persisted`);
    }
    if (denyValues.some((denied) => key.includes(denied))) {
      throw new ContractError("PRIVACY_DENY_VALUE", `${label} contains a denied persistence key`);
    }
    if (sensitiveTextReasons(key).length > 0) {
      throw new ContractError("PRIVACY_UNSAFE_KEY", `${label} contains an unsafe persistence key`);
    }
    assertPersistenceSafe(nested, { label: `${label}.${key}`, denyValues, maxDepth, depth: depth + 1 });
  }
  return value;
}

export function sanitizeBoundedString(value, {
  label = "value",
  maxLength = DEFAULT_LIMITS.string,
  nullable = false,
} = {}) {
  if (nullable && value === null) {
    return {
      value: null,
      metadata: { truncated: false, original_length: 0, stored_length: 0, redactions: [] },
    };
  }
  if (typeof value !== "string") {
    throw new ContractError("PRIVACY_STRING", `${label} must be a string`);
  }
  const reasons = sensitiveTextReasons(value);
  const redacted = reasons.length > 0;
  const safeSource = redacted ? "[redacted]" : value;
  const safeValue = safeSource.slice(0, maxLength);
  return {
    value: safeValue,
    metadata: {
      truncated: safeSource.length > maxLength,
      original_length: value.length,
      stored_length: safeValue.length,
      redactions: reasons,
    },
  };
}

export function sanitizeStringArray(value, {
  label = "value",
  maxItems = DEFAULT_LIMITS.array,
  maxLength = DEFAULT_LIMITS.string,
} = {}) {
  if (!Array.isArray(value)) {
    throw new ContractError("PRIVACY_ARRAY", `${label} must be an array`);
  }
  const items = [];
  const itemMetadata = [];
  for (const [index, item] of value.slice(0, maxItems).entries()) {
    const sanitized = sanitizeBoundedString(item, { label: `${label}[${index}]`, maxLength });
    items.push(sanitized.value);
    itemMetadata.push(sanitized.metadata);
  }
  return {
    value: items,
    metadata: {
      truncated: value.length > maxItems || itemMetadata.some((item) => item.truncated),
      original_length: value.length,
      stored_length: items.length,
      items: itemMetadata,
    },
  };
}

export function normalizeRelativePath(value, label = "path") {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") || isAbsoluteLikePath(value)) {
    throw new ContractError("PRIVACY_PATH", `${label} must be a non-empty relative path`);
  }
  const normalized = value.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
    || segments.some((segment) => reservedWindowsName.test(segment) || /[. ]$/.test(segment) || segment.includes(":"))
  ) {
    throw new ContractError("PRIVACY_PATH", `${label} contains traversal, dot, reserved, or unsafe segments`);
  }
  return segments.join("/");
}

export function isForbiddenPersistenceKey(key) {
  return typeof key === "string" && forbiddenKeyPattern.test(key);
}

export function assertNoForbiddenPersistenceKeys(value, {
  label = "value",
  maxDepth = DEFAULT_LIMITS.depth,
  depth = 0,
} = {}) {
  if (depth > maxDepth) {
    throw new ContractError("PRIVACY_DEPTH", `${label} exceeds maximum object depth ${maxDepth}`);
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertNoForbiddenPersistenceKeys(item, { label: `${label}[${index}]`, maxDepth, depth: depth + 1 });
    }
    return value;
  }
  if (value && typeof value === "object") {
    assertPlainObject(value, label);
    for (const [key, nested] of Object.entries(value)) {
      if (isForbiddenPersistenceKey(key)) {
        throw new ContractError("PRIVACY_FORBIDDEN_FIELD", `${label}.${key} must never be persisted`);
      }
      assertNoForbiddenPersistenceKeys(nested, { label: `${label}.${key}`, maxDepth, depth: depth + 1 });
    }
  }
  return value;
}

export function pickAllowlistedObject(value, allowedKeys, {
  label = "value",
  rejectUnknown = true,
} = {}) {
  assertPlainObject(value, label);
  assertNoForbiddenPersistenceKeys(value, { label });
  const allowed = new Set(allowedKeys);
  if (rejectUnknown) {
    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) {
        throw new ContractError("PRIVACY_UNKNOWN_FIELD", `${label}.${key} is not allowlisted`);
      }
    }
  }
  const result = Object.create(null);
  for (const key of allowedKeys) {
    if (Object.hasOwn(value, key)) result[key] = value[key];
  }
  return result;
}

export function sanitizeBoundedValue(value, {
  label = "value",
  depth = 0,
  limits = DEFAULT_LIMITS,
} = {}) {
  if (depth > limits.depth) {
    return { value: null, metadata: { truncated: true, reason: "max_depth" } };
  }
  if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
    return { value, metadata: { truncated: false } };
  }
  if (typeof value === "string") return sanitizeBoundedString(value, { label, maxLength: limits.string });
  if (Array.isArray(value)) {
    const source = value.slice(0, limits.array);
    const children = source.map((item, index) => sanitizeBoundedValue(item, { label: `${label}[${index}]`, depth: depth + 1, limits }));
    return {
      value: children.map((child) => child.value),
      metadata: {
        truncated: value.length > limits.array || children.some((child) => child.metadata.truncated),
        original_length: value.length,
        stored_length: source.length,
        children: children.map((child) => child.metadata),
      },
    };
  }
  if (value && typeof value === "object") {
    assertPlainObject(value, label);
    for (const key of Object.keys(value)) {
      if (isForbiddenPersistenceKey(key)) {
        throw new ContractError("PRIVACY_FORBIDDEN_FIELD", `${label}.${key} must never be persisted`);
      }
    }
    const entries = Object.entries(value).slice(0, limits.objectKeys);
    const sanitized = Object.create(null);
    const fields = Object.create(null);
    for (const [key, nested] of entries) {
      const child = sanitizeBoundedValue(nested, { label: `${label}.${key}`, depth: depth + 1, limits });
      sanitized[key] = child.value;
      fields[key] = child.metadata;
    }
    return {
      value: sanitized,
      metadata: {
        truncated: Object.keys(value).length > limits.objectKeys || Object.values(fields).some((item) => item.truncated),
        original_length: Object.keys(value).length,
        stored_length: entries.length,
        fields,
      },
    };
  }
  throw new ContractError("PRIVACY_VALUE", `${label} contains an unsupported value type`);
}
