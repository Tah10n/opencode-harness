import { createHash } from "node:crypto";

import { ContractError, assertPlainObject, canonicalJson } from "../feedback/contracts.mjs";
import { normalizeRelativePath } from "../feedback/privacy.mjs";
import {
  ADVANCED_RECURSIVE_CONTEXT_TOOL_IDS,
  CONTEXT_INFORMATIONAL_RECEIPT_TRUNCATION_CODES,
  MINIMAL_RECURSIVE_CONTEXT_TOOL_IDS,
  RECURSIVE_CONTEXT_COVERAGE_TRUNCATION_KEYS,
  RECURSIVE_CONTEXT_INFORMATIONAL_TRUNCATION_KEYS,
  RECURSIVE_CONTEXT_OUTPUT_SCHEMA_VERSION,
  RECURSIVE_CONTEXT_PRODUCER,
  RECURSIVE_CONTEXT_TOOL_IDS,
  SUPPORTED_RECURSIVE_CONTEXT_CONTRACT_VERSIONS,
  SUPPORTED_RECURSIVE_CONTEXT_POLICY_VERSIONS,
} from "./recursive-context-contract.mjs";

export const CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION = RECURSIVE_CONTEXT_OUTPUT_SCHEMA_VERSION;
export const MINIMAL_CONTEXT_TOOL_IDS = MINIMAL_RECURSIVE_CONTEXT_TOOL_IDS;
export const ADVANCED_CONTEXT_TOOL_IDS = ADVANCED_RECURSIVE_CONTEXT_TOOL_IDS;
export const CONTEXT_TOOL_IDS = RECURSIVE_CONTEXT_TOOL_IDS;
export const CONTEXT_BATCH_ITEM_FAILURE_CODES = Object.freeze([
  "hash_mismatch",
  "byte_limit_reached",
  "line_limit_reached",
  "tool_failed",
]);

export const CONTEXT_RECEIPT_STATUSES = Object.freeze([
  "success",
  "empty",
  "truncated",
  "timeout",
  "unavailable",
  "failed",
  "interrupted",
]);

export const CONTEXT_RECEIPT_REASON_CODES = Object.freeze([
  "deadline_exceeded",
  "tool_unavailable",
  "unsupported_schema",
  "unsupported_contract",
  "output_too_large",
  "invalid_output",
  "tool_failed",
  "stale_snapshot",
  "snapshot_mismatch",
  "hash_mismatch",
  "cursor_mismatch",
  "partial_coverage",
  "partial_tool_failure",
  "mutation_during_context",
  "cancelled",
  "host_interrupted",
  "pending_recovery",
]);

export const DEFAULT_CONTEXT_ADAPTER_LIMITS = Object.freeze({
  outputBytes: 4 * 1024 * 1024,
  paths: 128,
  ranges: 128,
  symbols: 128,
  relationships: 128,
});

const TOOL_SET = new Set(CONTEXT_TOOL_IDS);
const RELATIONSHIP_KINDS = new Set([
  "direct-import",
  "imported-by",
  "likely-test",
  "same-basename",
  "sibling",
]);
const RELATIONSHIP_CONFIDENCE = new Set(["high", "medium", "low"]);
const SYMBOL_KINDS = new Set([
  "class",
  "constant",
  "enum",
  "function",
  "interface",
  "method",
  "record",
  "type",
]);
const SNAPSHOT_KINDS = new Set(["metadata", "content", "partial-content"]);
const SECRET_PATH_SEGMENTS = new Set([".ssh", ".gnupg", ".aws", ".azure", ".kube"]);
const CONTROL_PATH_SEGMENTS = new Set([".oc_harness"]);
const SECRET_PATH_FILENAMES = new Set([
  ".env",
  ".git-credentials",
  ".netrc",
  ".npmrc",
  ".pypirc",
  "auth.json",
  "credentials",
  "credentials.ini",
  "credentials.json",
  "credentials.toml",
  "credentials.yaml",
  "credentials.yml",
  "gradle.properties",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "id_rsa",
  "local.properties",
  "nuget.config",
  "pip.conf",
  "secrets.json",
  "secrets.toml",
  "secrets.yaml",
  "secrets.yml",
  "settings-security.xml",
  "settings.xml",
]);
const SECRET_PATH_EXTENSIONS = new Set([".key", ".keystore", ".jks", ".p8", ".p12", ".pem", ".pfx", ".kdbx"]);
const TRUNCATION_KEYS = Object.freeze([
  ...RECURSIVE_CONTEXT_COVERAGE_TRUNCATION_KEYS,
  ...RECURSIVE_CONTEXT_INFORMATIONAL_TRUNCATION_KEYS,
]);
const COVERAGE_TRUNCATION_KEY_SET = new Set(RECURSIVE_CONTEXT_COVERAGE_TRUNCATION_KEYS);
const INFORMATIONAL_TRUNCATION_CODE_SET = new Set(CONTEXT_INFORMATIONAL_RECEIPT_TRUNCATION_CODES);
const REQUEST_LIMIT_KEYS = Object.freeze([
  "depth",
  "limit",
  "max_results",
  "max_matches",
  "max_files",
  "max_bytes",
  "max_bytes_per_file",
  "max_total_bytes",
  "max_total_lines",
  "max_lines",
  "max_duration_ms",
  "context_lines",
  "page_size",
]);
const REQUEST_KEYS = Object.freeze({
  context_outline: ["verifySnapshot", "requireStableSnapshot", "maxDurationMs"],
  context_files: [
    "path", "contains", "limit", "pageSize", "afterPath", "expectedSnapshotFingerprint",
    "verifySnapshot", "requireStableSnapshot", "maxDurationMs",
  ],
  context_search: [
    "query", "path", "pathContains", "extensions", "contextLines", "caseSensitive", "maxMatches",
    "maxFiles", "maxBytesPerFile", "maxTotalBytes", "maxTotalLines", "verifySnapshot",
    "requireStableSnapshot", "expectedSnapshotFingerprint", "maxDurationMs",
  ],
  context_read: ["path", "startLine", "maxLines", "maxBytes", "maxDurationMs", "expectedSha256", "format"],
  context_map: ["path", "depth", "limit", "includeSymbols", "verifySnapshot", "requireStableSnapshot", "maxDurationMs"],
  context_batch_read: ["ranges", "maxTotalLines", "maxBytesPerFile", "maxTotalBytes", "maxDurationMs"],
  context_symbols: ["path", "query", "kind", "limit", "verifySnapshot", "requireStableSnapshot", "maxDurationMs"],
  context_related: [
    "path", "maxResults", "relationshipKinds", "scopePath", "extensions", "includeLowConfidence",
    "verifySnapshot", "requireStableSnapshot", "maxDurationMs",
  ],
});

class UnsupportedContextSchemaError extends Error {}

function unsupported(message) {
  throw new UnsupportedContextSchemaError(message);
}

function producerContractSupported(envelope) {
  const keys = ["producer", "producerVersion", "contractVersion", "policyVersion"];
  const present = keys.filter((key) => Object.hasOwn(envelope, key));
  if (present.length === 0) return true;
  if (present.length !== keys.length) return false;
  return envelope.producer === RECURSIVE_CONTEXT_PRODUCER
    && typeof envelope.producerVersion === "string"
    && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(envelope.producerVersion)
    && SUPPORTED_RECURSIVE_CONTEXT_CONTRACT_VERSIONS.includes(envelope.contractVersion)
    && SUPPORTED_RECURSIVE_CONTEXT_POLICY_VERSIONS.includes(envelope.policyVersion);
}

function assertContextToolId(toolId) {
  if (!TOOL_SET.has(toolId)) {
    throw new ContractError("CONTEXT_RECEIPT_TOOL", "tool_id must be one of the eight supported context tools");
  }
  return toolId;
}

function assertFingerprintSalt(value) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") < 16 || Buffer.byteLength(value, "utf8") > 4096) {
    throw new ContractError("CONTEXT_RECEIPT_SALT", "fingerprintSalt must be 16..4096 UTF-8 bytes");
  }
  return value;
}

export function saltedContextFingerprint(value, fingerprintSalt) {
  assertFingerprintSalt(fingerprintSalt);
  const material = typeof value === "string" ? value : canonicalJson(value);
  return `sha256:${createHash("sha256").update(fingerprintSalt).update("\0").update(material).digest("hex")}`;
}

export function isContextToolId(value) {
  return TOOL_SET.has(value);
}

function assertOnlyKeys(value, keys, label) {
  assertPlainObject(value, label);
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ContractError("CONTEXT_RECEIPT_REQUEST_FIELD", `${label}.${key} is not supported`);
    }
  }
}

function canonicalScopePath(value, label) {
  if (value === undefined || value === null || value === "" || value === ".") return ".";
  const normalized = normalizeRelativePath(value, label);
  if (normalized !== value.replaceAll("\\", "/")) {
    throw new ContractError("CONTEXT_RECEIPT_PATH", `${label} must be canonical`);
  }
  if (Buffer.byteLength(normalized, "utf8") > 1024) {
    throw new ContractError("CONTEXT_RECEIPT_PATH", `${label} exceeds 1024 UTF-8 bytes`);
  }
  const segments = normalized.toLowerCase().split("/");
  const filename = segments.at(-1);
  const extension = filename.includes(".") ? `.${filename.split(".").at(-1)}` : "";
  if (segments.some((segment) => CONTROL_PATH_SEGMENTS.has(segment))) {
    throw new ContractError("CONTEXT_RECEIPT_CONTROL_PATH", `${label} is harness control state and cannot be persisted`);
  }
  if (segments.slice(0, -1).includes(".env.example")
    || segments.some((segment) => SECRET_PATH_SEGMENTS.has(segment))
    || SECRET_PATH_FILENAMES.has(filename)
    || (filename.startsWith(".env.") && filename !== ".env.example")
    || /^credentials\.(?:cfg|conf|ini|json|toml|txt|ya?ml)$/.test(filename)
    || /^secrets?\.(?:cfg|conf|ini|json|toml|txt|ya?ml)$/.test(filename)
    || /(^|[-_.])private[-_.]?key($|[-_.])/.test(filename)
    || /(^|[-_.])service[-_.]?account($|[-_.])/.test(filename)
    || SECRET_PATH_EXTENSIONS.has(extension)) {
    throw new ContractError("CONTEXT_RECEIPT_SECRET_PATH", `${label} is secret-like and cannot be persisted`);
  }
  return normalized;
}

export function normalizeContextReceiptPath(value, label = "context path", { root = true } = {}) {
  const normalized = canonicalScopePath(value, label);
  if (!root && normalized === ".") {
    throw new ContractError("CONTEXT_RECEIPT_PATH", `${label} must identify a relative worktree entry`);
  }
  return normalized;
}

function optionalPositiveInteger(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ContractError("CONTEXT_RECEIPT_INTEGER", `${label} must be an integer in ${min}..${max}`);
  }
  return value;
}

function canonicalExtensions(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) {
    throw new ContractError("CONTEXT_RECEIPT_EXTENSIONS", `${label} must contain at most 20 extensions`);
  }
  const result = value.map((entry, index) => {
    if (typeof entry !== "string") throw new ContractError("CONTEXT_RECEIPT_EXTENSIONS", `${label}[${index}] must be a string`);
    const normalized = entry.startsWith(".") ? entry.toLowerCase() : `.${entry.toLowerCase()}`;
    if (!/^\.[a-z0-9][a-z0-9._+-]{0,31}$/.test(normalized)) {
      throw new ContractError("CONTEXT_RECEIPT_EXTENSIONS", `${label}[${index}] is not a bounded extension`);
    }
    return normalized;
  });
  return [...new Set(result)].sort();
}

function canonicalRelationshipKinds(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > RELATIONSHIP_KINDS.size) {
    throw new ContractError("CONTEXT_RECEIPT_RELATIONSHIPS", `${label} must be a bounded relationship-kind array`);
  }
  for (const [index, entry] of value.entries()) {
    if (!RELATIONSHIP_KINDS.has(entry)) {
      throw new ContractError("CONTEXT_RECEIPT_RELATIONSHIPS", `${label}[${index}] is unsupported`);
    }
  }
  return [...new Set(value)].sort();
}

function requestLimits(toolId, args) {
  const mappings = {
    depth: "depth",
    limit: "limit",
    maxResults: "max_results",
    maxMatches: "max_matches",
    maxFiles: "max_files",
    maxBytes: "max_bytes",
    maxBytesPerFile: "max_bytes_per_file",
    maxTotalBytes: "max_total_bytes",
    maxTotalLines: "max_total_lines",
    maxLines: "max_lines",
    maxDurationMs: "max_duration_ms",
    contextLines: "context_lines",
    pageSize: "page_size",
  };
  const result = Object.create(null);
  for (const [source, target] of Object.entries(mappings)) {
    if (!Object.hasOwn(args, source)) continue;
    const min = ["contextLines"].includes(source) ? 0 : 1;
    result[target] = optionalPositiveInteger(args[source], `${toolId}.${source}`, { min });
  }
  return result;
}

function textualSelectorFingerprint(toolId, args, fingerprintSalt) {
  const selectors = Object.create(null);
  for (const key of ["query", "contains", "pathContains", "kind", "expectedSha256", "expectedSnapshotFingerprint", "afterPath"]) {
    if (!Object.hasOwn(args, key)) continue;
    if (typeof args[key] !== "string" || args[key].length === 0 || Buffer.byteLength(args[key], "utf8") > 8192) {
      throw new ContractError("CONTEXT_RECEIPT_SELECTOR", `${toolId}.${key} must be a bounded non-empty string`);
    }
    selectors[key] = args[key];
  }
  return Object.keys(selectors).length === 0 ? null : saltedContextFingerprint(selectors, fingerprintSalt);
}

function expectedContentVersionFingerprint(path, value, fingerprintSalt) {
  if (value === undefined) return null;
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new ContractError("CONTEXT_RECEIPT_HASH", "expectedSha256 must be a lowercase SHA-256 hash");
  }
  return saltedContextFingerprint({
    path,
    full_file_sha256: `sha256:${value.toLowerCase()}`,
  }, fingerprintSalt);
}

function expectedSnapshotFingerprint(value) {
  if (value === undefined) return null;
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new ContractError("CONTEXT_RECEIPT_FINGERPRINT", "expectedSnapshotFingerprint must be a lowercase SHA-256 fingerprint");
  }
  return `sha256:${value}`;
}

function assertOptionalBoolean(value, label) {
  if (value !== undefined && typeof value !== "boolean") {
    throw new ContractError("CONTEXT_RECEIPT_BOOLEAN", `${label} must be boolean`);
  }
}

export function adaptContextToolRequest(toolId, args, { fingerprintSalt } = {}) {
  assertContextToolId(toolId);
  assertFingerprintSalt(fingerprintSalt);
  assertOnlyKeys(args, REQUEST_KEYS[toolId], `${toolId} args`);
  for (const key of ["verifySnapshot", "requireStableSnapshot", "caseSensitive", "includeSymbols", "includeLowConfidence"]) {
    if (Object.hasOwn(args, key)) assertOptionalBoolean(args[key], `${toolId}.${key}`);
  }

  let scopePaths = [];
  let ranges = [];
  let afterPath = null;
  if (toolId === "context_batch_read") {
    if (!Array.isArray(args.ranges) || args.ranges.length < 1 || args.ranges.length > 20) {
      throw new ContractError("CONTEXT_RECEIPT_RANGES", "context_batch_read.ranges must contain 1..20 entries");
    }
    ranges = args.ranges.map((entry, index) => {
      assertOnlyKeys(entry, ["path", "startLine", "maxLines", "expectedSha256"], `context_batch_read.ranges[${index}]`);
      const path = canonicalScopePath(entry.path, `context_batch_read.ranges[${index}].path`);
      if (path === ".") throw new ContractError("CONTEXT_RECEIPT_PATH", "batch read paths must identify files");
      if (entry.expectedSha256 !== undefined && (typeof entry.expectedSha256 !== "string" || !/^[0-9a-f]{64}$/.test(entry.expectedSha256))) {
        throw new ContractError("CONTEXT_RECEIPT_HASH", `context_batch_read.ranges[${index}].expectedSha256 is invalid`);
      }
      return {
        path,
        start_line: optionalPositiveInteger(entry.startLine, `context_batch_read.ranges[${index}].startLine`, { min: 1 }) ?? 1,
        max_lines: optionalPositiveInteger(entry.maxLines, `context_batch_read.ranges[${index}].maxLines`, { min: 1, max: 500 }) ?? null,
        expected_content_version_fingerprint: expectedContentVersionFingerprint(path, entry.expectedSha256, fingerprintSalt),
      };
    });
    scopePaths = [...new Set(ranges.map((entry) => entry.path))].sort();
  } else if (toolId !== "context_outline") {
    if (toolId === "context_related" || toolId === "context_read") {
      if (typeof args.path !== "string" || args.path.length === 0) {
        throw new ContractError("CONTEXT_RECEIPT_PATH", `${toolId}.path is required`);
      }
    }
    scopePaths.push(canonicalScopePath(args.path, `${toolId}.path`));
    if (toolId === "context_related" && args.scopePath !== undefined) {
      scopePaths.push(canonicalScopePath(args.scopePath, "context_related.scopePath"));
    }
    scopePaths = [...new Set(scopePaths)].sort();
    if (toolId === "context_read") {
      ranges = [{
        path: scopePaths[0],
        start_line: optionalPositiveInteger(args.startLine, "context_read.startLine", { min: 1 }) ?? 1,
        max_lines: optionalPositiveInteger(args.maxLines, "context_read.maxLines", { min: 1, max: 500 }),
        expected_content_version_fingerprint: expectedContentVersionFingerprint(scopePaths[0], args.expectedSha256, fingerprintSalt),
      }];
    }
  }

  if (toolId === "context_read" && args.expectedSha256 !== undefined
    && (typeof args.expectedSha256 !== "string" || !/^[0-9a-f]{64}$/.test(args.expectedSha256))) {
    throw new ContractError("CONTEXT_RECEIPT_HASH", "context_read.expectedSha256 is invalid");
  }
  if (toolId === "context_read" && args.format !== undefined && !["text", "json"].includes(args.format)) {
    throw new ContractError("CONTEXT_RECEIPT_FORMAT", "context_read.format is unsupported");
  }
  if (toolId === "context_files") {
    if (args.afterPath !== undefined) {
      afterPath = canonicalScopePath(args.afterPath, "context_files.afterPath");
      if (afterPath === ".") throw new ContractError("CONTEXT_RECEIPT_PATH", "context_files.afterPath must identify a file");
      if (args.pageSize === undefined || args.expectedSnapshotFingerprint === undefined) {
        throw new ContractError("CONTEXT_RECEIPT_PAGINATION", "context_files.afterPath requires pageSize and expectedSnapshotFingerprint");
      }
    }
    if (args.expectedSnapshotFingerprint !== undefined
      && (typeof args.expectedSnapshotFingerprint !== "string" || !/^[0-9a-f]{64}$/.test(args.expectedSnapshotFingerprint))) {
      throw new ContractError("CONTEXT_RECEIPT_FINGERPRINT", "context_files.expectedSnapshotFingerprint is invalid");
    }
  }

  const request = {
    scope_paths: scopePaths,
    relationship_target_path: toolId === "context_related"
      ? canonicalScopePath(args.path, "context_related.path")
      : null,
    relationship_scope_path: toolId === "context_related" && args.scopePath !== undefined
      ? canonicalScopePath(args.scopePath, "context_related.scopePath")
      : null,
    ranges,
    query_fingerprint: textualSelectorFingerprint(toolId, args, fingerprintSalt),
    relationship_kinds: canonicalRelationshipKinds(args.relationshipKinds, `${toolId}.relationshipKinds`),
    extensions: canonicalExtensions(args.extensions, `${toolId}.extensions`),
    limits: requestLimits(toolId, args),
    format: toolId === "context_read" ? (args.format ?? "text") : null,
    after_path: afterPath,
    expected_snapshot_fingerprint: expectedSnapshotFingerprint(args.expectedSnapshotFingerprint),
    require_stable_snapshot: args.requireStableSnapshot === true,
  };
  return Object.freeze(request);
}

function normalizeLimits(input = {}) {
  assertPlainObject(input, "context adapter limits");
  const allowed = new Set(Object.keys(DEFAULT_CONTEXT_ADAPTER_LIMITS));
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new ContractError("CONTEXT_RECEIPT_LIMIT", `unknown adapter limit ${key}`);
  }
  const limits = { ...DEFAULT_CONTEXT_ADAPTER_LIMITS, ...input };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value < 1 || value > 64 * 1024 * 1024) {
      throw new ContractError("CONTEXT_RECEIPT_LIMIT", `adapter limit ${key} is invalid`);
    }
  }
  return limits;
}

function plain(value, label) {
  try {
    return assertPlainObject(value, label);
  } catch {
    return unsupported(`${label} must be an object`);
  }
}

function array(value, label) {
  if (!Array.isArray(value)) unsupported(`${label} must be an array`);
  return value;
}

function nonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) unsupported(`${label} must be a non-negative integer`);
  return value;
}

function boolean(value, label) {
  if (typeof value !== "boolean") unsupported(`${label} must be boolean`);
  return value;
}

function normalizeToolFingerprint(value, label) {
  if (typeof value !== "string") unsupported(`${label} must be a fingerprint`);
  if (/^[0-9a-f]{64}$/.test(value)) return `sha256:${value}`;
  if (/^sha256:[0-9a-f]{64}$/.test(value)) return value;
  return unsupported(`${label} must be a SHA-256 fingerprint`);
}

function outputPath(value, label) {
  try {
    return canonicalScopePath(value, label);
  } catch {
    return unsupported(`${label} must be a canonical relative path`);
  }
}

function snapshotFromEnvelope(envelope) {
  const snapshot = plain(envelope.snapshot, "context output.snapshot");
  if (!SNAPSHOT_KINDS.has(snapshot.fingerprintKind)) unsupported("snapshot.fingerprintKind is unsupported");
  return {
    fingerprint: normalizeToolFingerprint(snapshot.fingerprint, "snapshot.fingerprint"),
    fingerprint_kind: snapshot.fingerprintKind,
    fingerprint_scope: outputPath(snapshot.fingerprintScope, "snapshot.fingerprintScope"),
    complete: boolean(snapshot.complete, "snapshot.complete"),
    stable: boolean(snapshot.stable, "snapshot.stable"),
    changed_during_operation: boolean(snapshot.changedDuringOperation, "snapshot.changedDuringOperation"),
  };
}

function emptyCounts() {
  return {
    candidate_files: 0,
    scanned_files: 0,
    bytes_scanned: 0,
    skipped_secret: 0,
    skipped_generated: 0,
    skipped_large: 0,
    skipped_unreadable: 0,
    files: 0,
    directories: 0,
    lines: 0,
    matches: 0,
    ranges: 0,
    symbols: 0,
    relationships: 0,
  };
}

function coverageFromEnvelope(envelope, snapshot) {
  const coverage = plain(envelope.coverage, "context output.coverage");
  const usage = plain(envelope.usage, "context output.usage");
  const truncation = plain(coverage.truncation, "context output.coverage.truncation");
  const counts = emptyCounts();
  const countMappings = [
    [coverage, "candidateFiles", "candidate_files"],
    [coverage, "scannedFiles", "scanned_files"],
    [coverage, "bytesScanned", "bytes_scanned"],
    [coverage, "skippedSecret", "skipped_secret"],
    [coverage, "skippedGenerated", "skipped_generated"],
    [coverage, "skippedLarge", "skipped_large"],
    [coverage, "skippedUnreadable", "skipped_unreadable"],
    [usage, "files", "files"],
    [usage, "directories", "directories"],
    [usage, "lines", "lines"],
    [usage, "matches", "matches"],
    [usage, "ranges", "ranges"],
  ];
  for (const [source, inputKey, outputKey] of countMappings) {
    counts[outputKey] = nonNegativeInteger(source[inputKey], `${inputKey}`);
  }
  const truncationCodes = [];
  const activeCoverageTruncations = [];
  for (const key of TRUNCATION_KEYS) {
    if (!Object.hasOwn(truncation, key)) unsupported(`coverage.truncation.${key} is missing`);
    if (boolean(truncation[key], `coverage.truncation.${key}`)) {
      truncationCodes.push(key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`));
      if (COVERAGE_TRUNCATION_KEY_SET.has(key)) activeCoverageTruncations.push(key);
    }
  }
  const declaredPartial = boolean(coverage.partial, "coverage.partial");
  if (typeof envelope.truncated !== "boolean" || envelope.truncated !== declaredPartial) {
    unsupported("context output.truncated must exactly match coverage.partial");
  }
  if (truncation.coveragePartial !== declaredPartial) {
    unsupported("coverage.truncation.coveragePartial must exactly match coverage.partial");
  }
  if (activeCoverageTruncations.some((key) => key !== "coveragePartial") && !declaredPartial) {
    unsupported("coverage-affecting truncation flags require coverage.partial=true");
  }
  if ((counts.skipped_large > 0 || counts.skipped_unreadable > 0) && !declaredPartial) {
    unsupported("skipped large or unreadable files require coverage.partial=true");
  }
  if ((!snapshot.complete || !snapshot.stable || snapshot.changed_during_operation) && !declaredPartial) {
    unsupported("incomplete or unstable snapshots require partial coverage");
  }
  const partial = declaredPartial
    || !snapshot.complete
    || !snapshot.stable
    || snapshot.changed_during_operation;
  return {
    counts,
    coverage: {
      partial,
      complete: snapshot.complete && !partial,
      stable: snapshot.stable,
      changed_during_operation: snapshot.changed_during_operation,
      truncation_codes: [...new Set(truncationCodes)].sort(),
    },
  };
}

function boundedPush(target, value, limit, code, state) {
  if (target.length < limit) target.push(value);
  else state.adapterTruncations.add(code);
}

function addPath(state, value, label) {
  const normalized = outputPath(value, label);
  if (normalized === ".") return normalized;
  if (!state.pathSet.has(normalized)) {
    if (state.pathSet.size < state.limits.paths) state.pathSet.add(normalized);
    else state.adapterTruncations.add("receipt_path_limit");
  }
  return normalized;
}

function addRange(state, pathValue, range, label, {
  fullFileSha256 = null,
  totalLines = null,
  stableDuringRead = null,
  truncatedBefore = null,
  truncatedAfter = null,
  fingerprintSalt = null,
  snapshot = null,
} = {}) {
  const path = addPath(state, pathValue, `${label}.path`);
  const selected = plain(range, `${label}.selectedRange`);
  const startLine = nonNegativeInteger(selected.startLine, `${label}.selectedRange.startLine`);
  const endLine = nonNegativeInteger(selected.endLine, `${label}.selectedRange.endLine`);
  if (startLine < 1 || endLine < startLine) unsupported(`${label}.selectedRange is invalid`);
  boundedPush(state.lineRanges, { path, start_line: startLine, end_line: endLine }, state.limits.ranges, "receipt_range_limit", state);
  if (snapshot === null) return;
  if (fullFileSha256 === null) unsupported(`${label}.sha256 is required for trusted content coverage`);
  const normalizedSha256 = normalizeToolFingerprint(fullFileSha256, `${label}.sha256`);
  const normalizedTotalLines = nonNegativeInteger(totalLines, `${label}.totalLines`);
  if (normalizedTotalLines < 1 || endLine > normalizedTotalLines) unsupported(`${label}.totalLines is inconsistent with selectedRange`);
  const stableRead = boolean(stableDuringRead, `${label}.stableDuringRead`);
  if (!stableRead) unsupported(`${label}.stableDuringRead must be true for successful content evidence`);
  const boundedBefore = boolean(truncatedBefore, `${label}.truncatedBefore`);
  const boundedAfter = boolean(truncatedAfter, `${label}.truncatedAfter`);
  if (boundedBefore !== (startLine > 1) || boundedAfter !== (endLine < normalizedTotalLines)) {
    unsupported(`${label} range boundary markers are inconsistent`);
  }
  boundedPush(state.contentRanges, {
    path,
    start_line: startLine,
    end_line: endLine,
    total_lines: normalizedTotalLines,
    content_version_fingerprint: saltedContextFingerprint({ path, full_file_sha256: normalizedSha256 }, fingerprintSalt),
    stable: stableRead && snapshot.stable,
    changed_during_operation: !stableRead || snapshot.changed_during_operation,
    range_truncated_before: boundedBefore,
    range_truncated_after: boundedAfter,
  }, state.limits.ranges, "receipt_range_limit", state);
  return {
    path,
    start_line: startLine,
    end_line: endLine,
    total_lines: normalizedTotalLines,
    full_file_sha256: normalizedSha256,
  };
}

function extractPathItems(state, value, label) {
  for (const [index, entry] of array(value, label).entries()) {
    const item = plain(entry, `${label}[${index}]`);
    addPath(state, item.path, `${label}[${index}].path`);
  }
}

const GUIDANCE_KINDS = new Set(["agents", "workflow", "skill", "codeowners"]);

function addGuidancePath(state, value, label) {
  const guidancePath = addPath(state, value, label);
  if (state.pathSet.has(guidancePath)) state.guidancePaths.add(guidancePath);
  return guidancePath;
}

function extractGuidance(state, envelope, label) {
  if (Object.hasOwn(envelope, "guidanceEntries")) {
    for (const [index, entry] of array(envelope.guidanceEntries, `${label}.guidanceEntries`).entries()) {
      const item = plain(entry, `${label}.guidanceEntries[${index}]`);
      if (!GUIDANCE_KINDS.has(item.kind) || item.source !== "discovered") {
        unsupported(`${label}.guidanceEntries[${index}] has unsupported typed metadata`);
      }
      const guidancePath = addGuidancePath(state, item.path, `${label}.guidanceEntries[${index}].path`);
      const appliesTo = outputPath(item.appliesTo, `${label}.guidanceEntries[${index}].appliesTo`);
      boundedPush(state.guidanceEntries, {
        path: guidancePath,
        kind: item.kind,
        applies_to: appliesTo,
        source: "discovered",
      }, state.limits.paths, "receipt_path_limit", state);
    }
    return;
  }

  for (const [index, entry] of array(envelope.guidance, `${label}.guidance`).entries()) {
    const pathValue = typeof entry === "string"
      ? entry
      : plain(entry, `${label}.guidance[${index}]`).path;
    addGuidancePath(state, pathValue, `${label}.guidance[${index}].path`);
  }
}

function addSymbols(state, value, label, fingerprintSalt) {
  for (const [index, entry] of array(value, label).entries()) {
    const item = plain(entry, `${label}[${index}]`);
    const path = addPath(state, item.path, `${label}[${index}].path`);
    const line = nonNegativeInteger(item.line, `${label}[${index}].line`);
    if (line < 1 || !SYMBOL_KINDS.has(item.kind) || typeof item.name !== "string" || item.name.length === 0) {
      unsupported(`${label}[${index}] is not a supported symbol identifier`);
    }
    boundedPush(state.symbolIds, {
      symbol_id: saltedContextFingerprint({ path, line, kind: item.kind, name: item.name }, fingerprintSalt),
      path,
      line,
      kind: item.kind,
    }, state.limits.symbols, "receipt_symbol_limit", state);
  }
}

function addRelationships(state, value, label) {
  for (const [index, entry] of array(value, label).entries()) {
    const item = plain(entry, `${label}[${index}]`);
    if (!RELATIONSHIP_KINDS.has(item.relationship) || !RELATIONSHIP_CONFIDENCE.has(item.confidence)) {
      unsupported(`${label}[${index}] has unsupported relationship metadata`);
    }
    boundedPush(state.relationships, {
      path: addPath(state, item.path, `${label}[${index}].path`),
      relationship: item.relationship,
      confidence: item.confidence,
    }, state.limits.relationships, "receipt_relationship_limit", state);
  }
}

function familyState(limits) {
  return {
    limits,
    pathSet: new Set(),
    guidancePaths: new Set(),
    guidanceEntries: [],
    lineRanges: [],
    contentRanges: [],
    symbolIds: [],
    relationships: [],
    toolInventory: [],
    adapterTruncations: new Set(),
    primaryCount: 0,
    failedItems: [],
    readItems: [],
  };
}

function extractFamily(toolId, envelope, limits, fingerprintSalt, snapshot) {
  const state = familyState(limits);
  switch (toolId) {
    case "context_outline": {
      extractGuidance(state, envelope, "context_outline");
      extractPathItems(state, envelope.filesSample, "context_outline.filesSample");
      const tools = array(envelope.tools, "context_outline.tools");
      state.toolInventory = [...new Set(tools.filter((entry) => TOOL_SET.has(entry)))].sort();
      state.primaryCount = state.pathSet.size;
      break;
    }
    case "context_files":
      extractPathItems(state, envelope.files, "context_files.files");
      state.primaryCount = state.pathSet.size;
      break;
    case "context_search": {
      extractPathItems(state, envelope.matchedFiles, "context_search.matchedFiles");
      const matches = array(envelope.matches, "context_search.matches");
      for (const [index, entry] of matches.entries()) {
        const item = plain(entry, `context_search.matches[${index}]`);
        const path = addPath(state, item.path, `context_search.matches[${index}].path`);
        const line = nonNegativeInteger(item.line, `context_search.matches[${index}].line`);
        if (line < 1) unsupported("context_search match line must be positive");
        boundedPush(state.lineRanges, { path, start_line: line, end_line: line }, limits.ranges, "receipt_range_limit", state);
      }
      state.primaryCount = matches.length;
      break;
    }
    case "context_read":
      if (envelope.ok !== true) unsupported("context_read success envelope must set ok=true");
      state.readItems.push({
        ok: true,
        ...addRange(state, envelope.path, envelope.selectedRange, "context_read", {
        fullFileSha256: envelope.sha256,
        totalLines: envelope.totalLines,
        stableDuringRead: envelope.stableDuringRead,
        truncatedBefore: envelope.truncatedBefore,
        truncatedAfter: envelope.truncatedAfter,
        fingerprintSalt,
        snapshot,
        }),
      });
      if (boolean(envelope.truncatedBefore, "context_read.truncatedBefore")) state.adapterTruncations.add("range_truncated_before");
      if (boolean(envelope.truncatedAfter, "context_read.truncatedAfter")) state.adapterTruncations.add("range_truncated_after");
      state.primaryCount = 1;
      break;
    case "context_map":
      extractGuidance(state, envelope, "context_map");
      extractPathItems(state, envelope.files, "context_map.files");
      for (const key of ["manifests", "ci", "docs", "tests"]) extractPathItems(state, envelope[key], `context_map.${key}`);
      for (const [index, entry] of array(envelope.workspaces ?? [], "context_map.workspaces").entries()) {
        const workspace = plain(entry, `context_map.workspaces[${index}]`);
        addPath(state, workspace.path, `context_map.workspaces[${index}].path`);
        addPath(state, workspace.manifest, `context_map.workspaces[${index}].manifest`);
        for (const [pathIndex, entrypoint] of array(workspace.entrypoints, `context_map.workspaces[${index}].entrypoints`).entries()) {
          addPath(state, entrypoint, `context_map.workspaces[${index}].entrypoints[${pathIndex}]`);
        }
        for (const [pathIndex, testRoot] of array(workspace.testRoots, `context_map.workspaces[${index}].testRoots`).entries()) {
          addPath(state, testRoot, `context_map.workspaces[${index}].testRoots[${pathIndex}]`);
        }
      }
      addSymbols(state, envelope.symbols, "context_map.symbols", fingerprintSalt);
      state.primaryCount = array(envelope.files, "context_map.files").length;
      break;
    case "context_batch_read": {
      const results = array(envelope.results, "context_batch_read.results");
      let successful = 0;
      for (const [index, entry] of results.entries()) {
        const item = plain(entry, `context_batch_read.results[${index}]`);
        const path = addPath(state, item.path, `context_batch_read.results[${index}].path`);
        if (item.ok === true) {
          successful++;
          state.readItems.push({
            ok: true,
            ...addRange(state, path, item.selectedRange, `context_batch_read.results[${index}]`, {
            fullFileSha256: item.sha256,
            totalLines: item.totalLines,
            stableDuringRead: item.stableDuringRead,
            truncatedBefore: item.truncatedBefore,
            truncatedAfter: item.truncatedAfter,
            fingerprintSalt,
            snapshot,
            }),
          });
          if (boolean(item.truncatedBefore, `context_batch_read.results[${index}].truncatedBefore`)) state.adapterTruncations.add("range_truncated_before");
          if (boolean(item.truncatedAfter, `context_batch_read.results[${index}].truncatedAfter`)) state.adapterTruncations.add("range_truncated_after");
        } else if (item.ok === false) {
          const reasonCode = {
            "hash-mismatch": "hash_mismatch",
            "line-limit-reached": "line_limit_reached",
            "byte-limit-reached": "byte_limit_reached",
          }[item.error] ?? "tool_failed";
          state.failedItems.push({ path, reason_code: reasonCode });
          state.readItems.push({
            ok: false,
            path,
            error: item.error,
            expected_sha256: item.expectedSha256 === undefined
              ? null
              : normalizeToolFingerprint(item.expectedSha256, `context_batch_read.results[${index}].expectedSha256`),
            actual_sha256: item.actualSha256 === undefined
              ? null
              : normalizeToolFingerprint(item.actualSha256, `context_batch_read.results[${index}].actualSha256`),
          });
        } else unsupported(`context_batch_read.results[${index}].ok must be boolean`);
      }
      state.primaryCount = successful;
      break;
    }
    case "context_symbols":
      addSymbols(state, envelope.symbols, "context_symbols.symbols", fingerprintSalt);
      state.primaryCount = state.symbolIds.length;
      break;
    case "context_related":
      addPath(state, envelope.target, "context_related.target");
      addRelationships(state, envelope.related, "context_related.related");
      state.primaryCount = state.relationships.length;
      break;
    default:
      throw new ContractError("CONTEXT_RECEIPT_TOOL", "unsupported context tool");
  }
  return state;
}

function pathWithinScope(candidate, scope) {
  return scope === "." || candidate === scope || candidate.startsWith(`${scope}/`);
}

function contentVersionBinding(path, normalizedSha256, fingerprintSalt) {
  return saltedContextFingerprint({ path, full_file_sha256: normalizedSha256 }, fingerprintSalt);
}

function successfulReadMatchesRange(item, range, fingerprintSalt) {
  if (item.path !== range.path) return false;
  const effectiveStart = Math.min(range.start_line, item.total_lines);
  if (item.start_line !== effectiveStart) return false;
  const maximumEnd = range.max_lines === null
    ? item.total_lines
    : Math.min(item.total_lines, effectiveStart + range.max_lines - 1);
  if (item.end_line !== maximumEnd) return false;
  const expected = range.expected_content_version_fingerprint ?? null;
  return expected === null || expected === contentVersionBinding(item.path, item.full_file_sha256, fingerprintSalt);
}

function failedReadMatchesRange(item, range, fingerprintSalt) {
  if (item.path !== range.path) return false;
  if (item.error !== "hash-mismatch") return true;
  const expected = range.expected_content_version_fingerprint ?? null;
  return expected !== null
    && item.expected_sha256 !== null
    && expected === contentVersionBinding(item.path, item.expected_sha256, fingerprintSalt)
    && item.actual_sha256 !== null
    && item.actual_sha256 !== item.expected_sha256;
}

function readItemsMatchRequest(items, ranges, fingerprintSalt) {
  if (items.length !== ranges.length) return false;
  const candidates = items.map((item) => ranges.map((range, index) => (
    (item.ok ? successfulReadMatchesRange(item, range, fingerprintSalt) : failedReadMatchesRange(item, range, fingerprintSalt))
      ? index
      : -1
  )).filter((index) => index >= 0));
  if (candidates.some((entry) => entry.length === 0)) return false;
  const order = candidates.map((_, index) => index).sort((left, right) => candidates[left].length - candidates[right].length);
  const used = new Set();
  const match = (position) => {
    if (position === order.length) return true;
    for (const rangeIndex of candidates[order[position]]) {
      if (used.has(rangeIndex)) continue;
      used.add(rangeIndex);
      if (match(position + 1)) return true;
      used.delete(rangeIndex);
    }
    return false;
  };
  return match(0);
}

function assertFailureRequestCoherence(toolId, envelope, request, fingerprintSalt) {
  if (request === undefined) return;
  if (envelope.error === "snapshot-mismatch") {
    const expected = request.expected_snapshot_fingerprint ?? null;
    if (expected === null) unsupported(`${toolId} returned snapshot-mismatch without an expected snapshot`);
    const echoedExpected = normalizeToolFingerprint(envelope.expectedSnapshotFingerprint, `${toolId}.expectedSnapshotFingerprint`);
    const echoedActual = normalizeToolFingerprint(envelope.actualSnapshotFingerprint, `${toolId}.actualSnapshotFingerprint`);
    const snapshot = plain(envelope.snapshot, `${toolId}.snapshot`);
    if (echoedExpected !== expected || echoedActual !== normalizeToolFingerprint(snapshot.fingerprint, `${toolId}.snapshot.fingerprint`)) {
      unsupported(`${toolId} snapshot-mismatch does not match the request`);
    }
  }
  if (envelope.error === "cursor-mismatch" && (request.after_path ?? null) === null) {
    unsupported("context_files returned cursor-mismatch without a cursor-bound request");
  }
  if (envelope.error === "stale-snapshot" && request.require_stable_snapshot !== true) {
    unsupported(`${toolId} returned stale-snapshot without a stable-snapshot request`);
  }
  if (toolId === "context_read" && envelope.error === "hash-mismatch") {
    const range = request.ranges?.[0];
    if (!range || (range.expected_content_version_fingerprint ?? null) === null) {
      unsupported("context_read returned hash-mismatch without an expected content version");
    }
    const path = outputPath(envelope.path, "context_read.path");
    const expected = normalizeToolFingerprint(envelope.expectedSha256, "context_read.expectedSha256");
    const actual = normalizeToolFingerprint(envelope.actualSha256, "context_read.actualSha256");
    if (path !== range.path
      || contentVersionBinding(path, expected, fingerprintSalt) !== range.expected_content_version_fingerprint
      || actual === expected) {
      unsupported("context_read hash-mismatch does not match the request");
    }
  }
}

function assertOutputRequestCoherence(toolId, envelope, family, request, fingerprintSalt) {
  if (request === undefined) return;
  assertPlainObject(request, "context normalized request");
  const requestedScopes = Array.isArray(request.scope_paths) ? request.scope_paths : [];
  const requestedExtensions = new Set(request.extensions ?? []);
  const matchesExtension = (candidate) => requestedExtensions.size === 0
    || [...requestedExtensions].some((extension) => candidate.toLowerCase().endsWith(extension));
  if (request.limits?.max_results !== undefined && family.primaryCount > request.limits.max_results) {
    unsupported(`${toolId} returned more results than requested`);
  }
  if (request.limits?.max_matches !== undefined && family.lineRanges.length > request.limits.max_matches) {
    unsupported(`${toolId} returned more matches than requested`);
  }
  if (request.limits?.limit !== undefined && family.primaryCount > request.limits.limit) {
    unsupported(`${toolId} returned more items than requested`);
  }
  if (request.limits?.max_files !== undefined && family.pathSet.size > request.limits.max_files) {
    unsupported(`${toolId} returned more files than requested`);
  }
  const expectedSnapshot = request.expected_snapshot_fingerprint ?? null;
  if (expectedSnapshot !== null) {
    const actualSnapshot = toolId === "context_search"
      ? normalizeToolFingerprint(envelope.verifiedSnapshotFingerprint, "context_search.verifiedSnapshotFingerprint")
      : normalizeToolFingerprint(plain(envelope.snapshot, `${toolId}.snapshot`).fingerprint, `${toolId}.snapshot.fingerprint`);
    if (actualSnapshot !== expectedSnapshot) {
      unsupported(`${toolId} output snapshot does not match the request`);
    }
  }
  if (request.require_stable_snapshot === true) {
    const snapshot = plain(envelope.snapshot, `${toolId}.snapshot`);
    if (snapshot.stable !== true || snapshot.changedDuringOperation !== false) {
      unsupported(`${toolId} did not satisfy requireStableSnapshot`);
    }
  }
  if (toolId === "context_files") {
    const paginated = request.limits?.page_size !== undefined;
    const hasHasMore = Object.hasOwn(envelope, "hasMore");
    const hasNextAfterPath = Object.hasOwn(envelope, "nextAfterPath");
    if (paginated && (!hasHasMore || !hasNextAfterPath)) unsupported("context_files paginated output is missing continuation metadata");
    if (hasHasMore !== hasNextAfterPath) unsupported("context_files pagination metadata must be present together");
    if (hasHasMore) {
      const hasMore = boolean(envelope.hasMore, "context_files.hasMore");
      const nextAfterPath = envelope.nextAfterPath === null
        ? null
        : outputPath(envelope.nextAfterPath, "context_files.nextAfterPath");
      if (hasMore !== (nextAfterPath !== null)) unsupported("context_files pagination continuation metadata is inconsistent");
      if (hasMore && family.pathSet.size === 0) unsupported("context_files cannot continue from an empty page");
      const filePaths = array(envelope.files, "context_files.files").map((entry, index) => (
        outputPath(plain(entry, `context_files.files[${index}]`).path, `context_files.files[${index}].path`)
      ));
      if (filePaths.some((entry, index) => index > 0 && filePaths[index - 1].localeCompare(entry) >= 0)) {
        unsupported("context_files pagination paths must be strictly sorted without duplicates");
      }
      if ((request.after_path ?? null) !== null && filePaths.some((entry) => entry.localeCompare(request.after_path) <= 0)) {
        unsupported("context_files returned a path at or before the requested cursor");
      }
      if (nextAfterPath !== null && filePaths.at(-1) !== nextAfterPath) {
        unsupported("context_files.nextAfterPath must equal the final returned path");
      }
      if (request.limits?.page_size !== undefined && family.primaryCount > request.limits.page_size) {
        unsupported("context_files returned more entries than the requested page size");
      }
    }
  }
  if (toolId === "context_related") {
    const target = outputPath(envelope.target, "context_related.target");
    if (target !== request.relationship_target_path) unsupported("context_related.target does not match the requested target");
    const allowedRelationships = new Set(request.relationship_kinds ?? []);
    if (allowedRelationships.size > 0
      && family.relationships.some((entry) => !allowedRelationships.has(entry.relationship))) {
      unsupported("context_related returned a relationship kind outside the request");
    }
    if (request.relationship_scope_path !== null
      && family.relationships.some((entry) => !pathWithinScope(entry.path, request.relationship_scope_path))) {
      unsupported("context_related returned a path outside the explicit relationship scope");
    }
    if (family.relationships.some((entry) => !matchesExtension(entry.path))) {
      unsupported("context_related returned a path outside the requested extensions");
    }
    return;
  }
  if (toolId === "context_read" || toolId === "context_batch_read") {
    if (!readItemsMatchRequest(family.readItems, request.ranges ?? [], fingerprintSalt)) {
      unsupported(`${toolId} results do not exactly match the requested ranges and content versions`);
    }
    return;
  }
  if (toolId !== "context_outline" && requestedScopes.length > 0
    && [...family.pathSet].some((entry) => !family.guidancePaths.has(entry)
      && !requestedScopes.some((scope) => pathWithinScope(entry, scope)))) {
    unsupported(`${toolId} returned a path outside the requested scope`);
  }
  if (toolId !== "context_outline" && [...family.pathSet].some((entry) => !matchesExtension(entry))) {
    unsupported(`${toolId} returned a path outside the requested extensions`);
  }
}

function failureReason(error) {
  return {
    "stale-snapshot": { status: "failed", reason_code: "stale_snapshot" },
    "snapshot-mismatch": { status: "failed", reason_code: "snapshot_mismatch" },
    "hash-mismatch": { status: "failed", reason_code: "hash_mismatch" },
    "cursor-mismatch": { status: "failed", reason_code: "cursor_mismatch" },
    "deadline-exceeded": { status: "timeout", reason_code: "deadline_exceeded" },
  }[error] ?? { status: "failed", reason_code: "tool_failed" };
}

function unsupportedResult(resultFingerprint, reasonCode = "unsupported_schema") {
  return {
    status: "failed",
    reason_code: reasonCode,
    tool_output_schema_version: null,
    tool_snapshot: null,
    result: null,
    result_fingerprint: resultFingerprint,
  };
}

export function adaptContextToolOutput(toolId, output, { fingerprintSalt, limits: requestedLimits = {}, request } = {}) {
  assertContextToolId(toolId);
  assertFingerprintSalt(fingerprintSalt);
  const limits = normalizeLimits(requestedLimits);
  if (typeof output !== "string") {
    return unsupportedResult(saltedContextFingerprint(canonicalJson({ type: typeof output }), fingerprintSalt), "invalid_output");
  }
  const resultFingerprint = saltedContextFingerprint(output, fingerprintSalt);
  if (Buffer.byteLength(output, "utf8") > limits.outputBytes) {
    return unsupportedResult(resultFingerprint, "output_too_large");
  }

  let envelope;
  try {
    envelope = JSON.parse(output);
    plain(envelope, "context output");
    if (envelope.schemaVersion !== CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION
      || envelope.tool !== toolId
      || envelope.worktree !== ".") {
      return unsupportedResult(resultFingerprint);
    }
    if (!producerContractSupported(envelope)) {
      return unsupportedResult(resultFingerprint, "unsupported_contract");
    }
  } catch (error) {
    if (error instanceof ContractError) throw error;
    return unsupportedResult(resultFingerprint);
  }

  try {
    const toolSnapshot = snapshotFromEnvelope(envelope);
    const normalizedCoverage = coverageFromEnvelope(envelope, toolSnapshot);
    if (envelope.ok === false) {
      assertFailureRequestCoherence(toolId, envelope, request, fingerprintSalt);
      const failure = failureReason(envelope.error);
      return {
        ...failure,
        tool_output_schema_version: CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION,
        tool_snapshot: toolSnapshot,
        result: {
          result_fingerprint: resultFingerprint,
          relative_paths: [],
          guidance_paths: [],
          guidance_entries: [],
          item_failures: [],
          line_ranges: [],
          content_ranges: [],
          symbol_ids: [],
          relationships: [],
          tool_inventory: [],
          counts: normalizedCoverage.counts,
          coverage: normalizedCoverage.coverage,
          empty: true,
        },
        result_fingerprint: resultFingerprint,
      };
    }

    const family = extractFamily(toolId, envelope, limits, fingerprintSalt, toolSnapshot);
    assertOutputRequestCoherence(toolId, envelope, family, request, fingerprintSalt);
    if (toolId === "context_files"
      && (request.limits?.page_size !== undefined || envelope.hasMore === true)) {
      // A single page cannot prove a complete inventory. Until the receipt
      // contract carries and validates the whole continuation chain, every
      // paginated page remains non-authorizing partial evidence.
      family.adapterTruncations.add("pagination_page");
    }
    normalizedCoverage.counts.symbols = family.symbolIds.length;
    normalizedCoverage.counts.relationships = family.relationships.length;
    for (const code of family.adapterTruncations) normalizedCoverage.coverage.truncation_codes.push(code);
    normalizedCoverage.coverage.truncation_codes = [...new Set(normalizedCoverage.coverage.truncation_codes)].sort();
    const adapterCoverageTruncations = [...family.adapterTruncations]
      .filter((code) => !INFORMATIONAL_TRUNCATION_CODE_SET.has(code));
    if (adapterCoverageTruncations.length > 0 || family.failedItems.length > 0) normalizedCoverage.coverage.partial = true;
    normalizedCoverage.coverage.complete = toolSnapshot.complete && !normalizedCoverage.coverage.partial;

    let status = "success";
    let reasonCode = null;
    if (family.failedItems.length > 0 && family.primaryCount === 0) {
      status = "failed";
      reasonCode = family.failedItems.every((entry) => entry.reason_code === "hash_mismatch") ? "hash_mismatch" : "tool_failed";
    } else if (normalizedCoverage.coverage.partial) {
      status = "truncated";
      reasonCode = family.failedItems.length > 0 ? "partial_tool_failure" : "partial_coverage";
    } else if (family.primaryCount === 0) status = "empty";

    return {
      status,
      reason_code: reasonCode,
      tool_output_schema_version: CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION,
      tool_snapshot: toolSnapshot,
      result: {
        result_fingerprint: resultFingerprint,
        relative_paths: [...family.pathSet].sort(),
        guidance_paths: [...family.guidancePaths].sort(),
        guidance_entries: family.guidanceEntries
          .filter((entry, index, all) => all.findIndex((candidate) => canonicalJson(candidate) === canonicalJson(entry)) === index)
          .sort((left, right) => left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind)),
        item_failures: family.failedItems
          .filter((entry, index, all) => all.findIndex((candidate) => canonicalJson(candidate) === canonicalJson(entry)) === index)
          .sort((left, right) => left.path.localeCompare(right.path) || left.reason_code.localeCompare(right.reason_code)),
        line_ranges: family.lineRanges
          .filter((entry, index, all) => all.findIndex((candidate) => canonicalJson(candidate) === canonicalJson(entry)) === index)
          .sort((left, right) => left.path.localeCompare(right.path) || left.start_line - right.start_line),
        content_ranges: family.contentRanges
          .filter((entry, index, all) => all.findIndex((candidate) => canonicalJson(candidate) === canonicalJson(entry)) === index)
          .sort((left, right) => left.path.localeCompare(right.path) || left.start_line - right.start_line || left.end_line - right.end_line),
        symbol_ids: family.symbolIds,
        relationships: family.relationships,
        tool_inventory: family.toolInventory,
        counts: normalizedCoverage.counts,
        coverage: normalizedCoverage.coverage,
        empty: family.primaryCount === 0,
      },
      result_fingerprint: resultFingerprint,
    };
  } catch (error) {
    if (error instanceof UnsupportedContextSchemaError) return unsupportedResult(resultFingerprint);
    throw error;
  }
}

export const CONTEXT_REQUEST_LIMIT_KEYS = REQUEST_LIMIT_KEYS;
