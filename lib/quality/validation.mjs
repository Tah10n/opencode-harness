import { timingSafeEqual } from "node:crypto";

import {
  ContractError,
  assertEnum,
  assertExactKeys,
  assertIsoTimestamp,
  assertPlainObject,
  assertSafeId,
  canonicalJson,
  fingerprint,
} from "../feedback/contracts.mjs";
import {
  assertPersistenceSafe,
  normalizeRelativePath,
  sanitizeBoundedString,
} from "../feedback/privacy.mjs";
import {
  EVIDENCE_REFERENCE_KINDS,
  QUALITY_LIMITS,
  VERIFICATION_CLASSIFICATIONS,
} from "./constants.mjs";

export { ContractError, canonicalJson, fingerprint };

export function exact(value, allowed, required, label) {
  return assertExactKeys(value, { allowed, required }, label);
}

export function assertString(value, label, {
  minBytes = 1,
  maxBytes = QUALITY_LIMITS.stringBytes,
  nullable = false,
} = {}) {
  if (nullable && value === null) return value;
  if (typeof value !== "string") throw new ContractError("QUALITY_STRING", `${label} must be a string`);
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes < minBytes || bytes > maxBytes) {
    throw new ContractError("QUALITY_STRING_BOUNDS", `${label} must be ${minBytes}..${maxBytes} UTF-8 bytes`);
  }
  const sanitized = sanitizeBoundedString(value, { label, maxLength: value.length });
  if (sanitized.metadata.truncated || sanitized.metadata.redactions.length > 0 || sanitized.value !== value) {
    throw new ContractError("QUALITY_STRING_UNSAFE", `${label} cannot require redaction or truncation`);
  }
  return value;
}

export function assertBoolean(value, label) {
  if (typeof value !== "boolean") throw new ContractError("QUALITY_BOOLEAN", `${label} must be a boolean`);
  return value;
}

export function assertInteger(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ContractError("QUALITY_INTEGER", `${label} must be an integer in ${min}..${max}`);
  }
  return value;
}

export function assertArray(value, label, {
  min = 0,
  max = QUALITY_LIMITS.arrayItems,
  item = null,
} = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ContractError("QUALITY_ARRAY", `${label} must contain ${min}..${max} items`);
  }
  if (item) value.forEach((entry, index) => item(entry, `${label}[${index}]`, index));
  return value;
}

export function assertNullable(value, validator, label) {
  if (value === null) return null;
  return validator(value, label);
}

export function assertCommit(value, label = "commit") {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value)) {
    throw new ContractError("QUALITY_COMMIT", `${label} must be a full lowercase Git commit`);
  }
  return value;
}

export function assertFingerprint(value, label = "fingerprint", { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new ContractError("QUALITY_FINGERPRINT", `${label} must be sha256:<64 lowercase hex>`);
  }
  return value;
}

export function fingerprintsEqual(left, right) {
  assertFingerprint(left, "left fingerprint");
  assertFingerprint(right, "right fingerprint");
  const leftBytes = Buffer.from(left.slice(7), "hex");
  const rightBytes = Buffer.from(right.slice(7), "hex");
  return timingSafeEqual(leftBytes, rightBytes);
}

export function assertStableTypedId(value, prefix, label) {
  assertSafeId(value, label);
  if (!value.startsWith(`${prefix}-`)) {
    throw new ContractError("QUALITY_TYPED_ID", `${label} must start with ${prefix}-`);
  }
  return value;
}

export function assertUniqueIds(items, label) {
  const seen = new Set();
  for (const [index, item] of items.entries()) {
    if (!item || typeof item.id !== "string") {
      throw new ContractError("QUALITY_ITEM_ID", `${label}[${index}].id is required`);
    }
    if (seen.has(item.id)) throw new ContractError("QUALITY_DUPLICATE_ID", `${label} has duplicate id ${item.id}`);
    seen.add(item.id);
  }
  return seen;
}

export function assertStringArray(value, label, options = {}) {
  const { min = 0, max = QUALITY_LIMITS.arrayItems, unique = true, path = false } = options;
  assertArray(value, label, {
    min,
    max,
    item: (entry, entryLabel) => {
      if (path) {
        const normalized = normalizeRelativePath(entry, entryLabel);
        if (normalized !== entry) {
          throw new ContractError("QUALITY_PATH_CANONICAL", `${entryLabel} must use canonical forward slashes`);
        }
      }
      else assertString(entry, entryLabel, { maxBytes: options.maxBytes ?? QUALITY_LIMITS.stringBytes });
    },
  });
  if (unique && new Set(value).size !== value.length) {
    throw new ContractError("QUALITY_DUPLICATE_VALUE", `${label} must not contain duplicates`);
  }
  return value;
}

export function validateEvidenceReference(value, label = "evidence reference") {
  exact(value, ["kind", "value"], ["kind", "value"], label);
  assertEnum(value.kind, EVIDENCE_REFERENCE_KINDS, `${label}.kind`);
  if (["file", "doc"].includes(value.kind)) normalizeRelativePath(value.value, `${label}.value`);
  else assertString(value.value, `${label}.value`, { maxBytes: 512 });
  return value;
}

export function validateEvidenceReferences(value, label = "evidence_refs", { min = 0 } = {}) {
  assertArray(value, label, {
    min,
    max: QUALITY_LIMITS.evidenceRefs,
    item: validateEvidenceReference,
  });
  const identities = value.map((entry) => `${entry.kind}:${entry.value}`);
  if (new Set(identities).size !== identities.length) {
    throw new ContractError("QUALITY_DUPLICATE_EVIDENCE", `${label} contains duplicate references`);
  }
  return value;
}

export function validateVerificationMapping(value, label = "mapping") {
  const keys = [
    "classification",
    "check_ids",
    "mechanism_ids",
    "evidence_refs",
    "rationale",
    "blocked_reason",
    "external_dependency",
  ];
  exact(value, keys, keys, label);
  assertEnum(value.classification, VERIFICATION_CLASSIFICATIONS, `${label}.classification`);
  assertStringArray(value.check_ids, `${label}.check_ids`, { max: 64, maxBytes: 128 });
  assertStringArray(value.mechanism_ids, `${label}.mechanism_ids`, { max: 64, maxBytes: 128 });
  validateEvidenceReferences(value.evidence_refs, `${label}.evidence_refs`);
  assertString(value.rationale, `${label}.rationale`, { nullable: true });
  assertString(value.blocked_reason, `${label}.blocked_reason`, { nullable: true });
  assertString(value.external_dependency, `${label}.external_dependency`, { nullable: true, maxBytes: 512 });

  const direct = value.classification === "applicable_directly_tested";
  const mechanism = value.classification === "applicable_verified_by_other_mechanism";
  const blocked = value.classification === "applicable_blocked_unverified";
  const notApplicable = value.classification === "not_applicable";
  if (direct !== (value.check_ids.length > 0)) {
    throw new ContractError("QUALITY_MAPPING_CHECKS", `${label} direct classification must contain only check_ids`);
  }
  if (mechanism !== (value.mechanism_ids.length > 0)) {
    throw new ContractError("QUALITY_MAPPING_MECHANISMS", `${label} mechanism classification must contain mechanism_ids`);
  }
  if (!direct && value.check_ids.length > 0) throw new ContractError("QUALITY_MAPPING_CHECKS", `${label} has unexpected check_ids`);
  if (!mechanism && value.mechanism_ids.length > 0) throw new ContractError("QUALITY_MAPPING_MECHANISMS", `${label} has unexpected mechanism_ids`);
  if (blocked !== (value.blocked_reason !== null && value.external_dependency !== null)) {
    throw new ContractError("QUALITY_MAPPING_BLOCKED", `${label} blocked classification needs reason and dependency`);
  }
  if (!blocked && (value.blocked_reason !== null || value.external_dependency !== null)) {
    throw new ContractError("QUALITY_MAPPING_BLOCKED", `${label} has unexpected blocked fields`);
  }
  if (notApplicable !== (value.rationale !== null)) {
    throw new ContractError("QUALITY_MAPPING_RATIONALE", `${label} not_applicable classification needs rationale`);
  }
  if (!notApplicable && value.rationale !== null) {
    throw new ContractError("QUALITY_MAPPING_RATIONALE", `${label} has unexpected rationale`);
  }
  return value;
}

export function assertSchemaVersion(value, expected, label) {
  if (value !== expected) {
    throw new ContractError("QUALITY_SCHEMA_VERSION", `${label}.schema_version must be ${expected}`);
  }
  return value;
}

export function assertTimestampOrder(earlier, later, label) {
  assertIsoTimestamp(earlier, `${label}.earlier`);
  assertIsoTimestamp(later, `${label}.later`);
  if (Date.parse(later) < Date.parse(earlier)) {
    throw new ContractError("QUALITY_TIMESTAMP_ORDER", `${label} is not monotonic`);
  }
}

export function deepFrozenClone(value, label = "value") {
  const clone = JSON.parse(canonicalJson(value));
  const freeze = (entry) => {
    if (entry && typeof entry === "object") {
      Object.values(entry).forEach(freeze);
      Object.freeze(entry);
    }
    return entry;
  };
  assertPersistenceSafe(clone, { label, maxDepth: QUALITY_LIMITS.objectDepth });
  const bytes = Buffer.byteLength(canonicalJson(clone), "utf8");
  if (bytes > QUALITY_LIMITS.recordBytes) {
    throw new ContractError("QUALITY_RECORD_BYTES", `${label} exceeds ${QUALITY_LIMITS.recordBytes} UTF-8 bytes`);
  }
  return freeze(clone);
}

export function assertPlain(value, label) {
  return assertPlainObject(value, label);
}

export function assertIso(value, label) {
  return assertIsoTimestamp(value, label);
}
