import { normalizeRelativePath } from "../feedback/privacy.mjs";
import { validateContextReceipt } from "./context-receipts.mjs";
import { CONTEXT_INFORMATIONAL_RECEIPT_TRUNCATION_CODES } from "./recursive-context-contract.mjs";
import {
  ContractError,
  assertArray,
  assertFingerprint,
  assertInteger,
  assertPlain,
  assertString,
  canonicalJson,
  deepFrozenClone,
  exact,
} from "./validation.mjs";

export const CONTEXT_FILE_COVERAGE_SCHEMA_VERSION = 1;

export const CONTEXT_FILE_COVERAGE_REASON_CODES = Object.freeze([
  "CONTEXT_FILE_COVERAGE_GAP",
  "CONTEXT_FILE_VERSION_MISMATCH",
  "CONTEXT_FILE_TOTAL_LINES_MISMATCH",
  "CONTEXT_FILE_RANGE_UNTRUSTED",
  "CONTEXT_FILE_RANGE_STALE",
  "CONTEXT_FILE_IDENTITY_MISSING",
]);

const DIRECT_CONTENT_TOOLS = new Set(["context_read", "context_batch_read"]);
const CURRENT_RECEIPT_INDEX_SCHEMA_VERSION = 4;
const LEGACY_RECEIPT_INDEX_SCHEMA_VERSION = 3;
const MAX_CONTENT_RANGE_LINES = 500;
const RANGE_ONLY_TRUNCATION_CODES = new Set(["range_truncated_before", "range_truncated_after"]);
const INFORMATIONAL_TRUNCATION_CODES = new Set(CONTEXT_INFORMATIONAL_RECEIPT_TRUNCATION_CODES);
const FILE_STATUS = new Set(["complete", "incomplete", "legacy_unavailable"]);
const FILE_KEYS = Object.freeze([
  "path",
  "status",
  "content_version_fingerprint",
  "total_lines",
  "covered_ranges",
  "gap_ranges",
  "contributing_receipt_ids",
  "reason_codes",
]);
const RANGE_KEYS = Object.freeze(["start_line", "end_line"]);
const CONTENT_RANGE_KEYS = Object.freeze([
  "path",
  "start_line",
  "end_line",
  "total_lines",
  "content_version_fingerprint",
  "stable",
  "changed_during_operation",
  "range_truncated_before",
  "range_truncated_after",
]);

function inputDescriptor(value) {
  const receipts = Array.isArray(value) ? value : value?.receipts;
  if (!Array.isArray(receipts)) {
    throw new ContractError("CONTEXT_FILE_COVERAGE_INPUT", "context file coverage requires a receipts array");
  }
  if (Array.isArray(value) || value?.schema_version === undefined) return { kind: "raw", receipts };
  if (value.schema_version === LEGACY_RECEIPT_INDEX_SCHEMA_VERSION) return { kind: "legacy", receipts };
  if (value.schema_version === CURRENT_RECEIPT_INDEX_SCHEMA_VERSION) return { kind: "current-index", receipts };
  throw new ContractError("CONTEXT_RECEIPT_INDEX_SCHEMA", "context file coverage received an unsupported receipt index schema");
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function rangeSource(entry) {
  if (Array.isArray(entry?.content_ranges)) return entry.content_ranges;
  if (Array.isArray(entry?.result?.content_ranges)) return entry.result.content_ranges;
  return [];
}

function observedDirectPaths(entry) {
  if (!DIRECT_CONTENT_TOOLS.has(entry?.tool_id)) return [];
  return sortedUnique([
    ...(entry?.requested_paths ?? []),
    ...(entry?.request?.scope_paths ?? []),
    ...(entry?.request?.ranges ?? []).map((range) => range?.path).filter(Boolean),
    ...(entry?.observed_paths ?? []),
    ...(entry?.result?.relative_paths ?? []),
    ...(entry?.result?.line_ranges ?? []).map((range) => range?.path).filter(Boolean),
  ]);
}

function receiptSchemaVersion(entry) {
  return entry?.receipt_schema_version ?? entry?.schema_version ?? null;
}

function coverageFor(entry) {
  return entry?.coverage ?? entry?.result?.coverage ?? null;
}

function bindingFor(entry) {
  return {
    session_key: entry?.session_key ?? null,
    run_id: entry?.run_id ?? null,
    task_id: entry?.task_id ?? null,
    worktree_fingerprint: entry?.worktree_fingerprint ?? null,
    source_fingerprint: entry?.source_fingerprint ?? null,
    context_strategy_id: entry?.context_strategy_id ?? null,
    context_strategy_fingerprint: entry?.context_strategy_fingerprint ?? null,
  };
}

function fingerprintShapeValid(value) {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function canonicalPathShapeValid(value, { allowRoot = false } = {}) {
  if (typeof value !== "string") return false;
  if (allowRoot && value === ".") return true;
  try {
    const normalized = normalizeRelativePath(value, "context file coverage path");
    return (allowRoot || normalized !== ".") && normalized === value;
  } catch {
    return false;
  }
}

function validateCurrentIndexBindings(value, entries) {
  for (const key of ["session_key", "run_id", "task_id"]) {
    if (typeof value?.[key] !== "string" || value[key].length === 0) {
      throw new ContractError("CONTEXT_RECEIPT_BINDING_INVALID", `context receipt evidence index.${key} is required`);
    }
  }
  if (!fingerprintShapeValid(value?.source_fingerprint)) {
    throw new ContractError("CONTEXT_RECEIPT_BINDING_INVALID", "context receipt evidence index.source_fingerprint is required");
  }
  for (const entry of entries) {
    if (typeof entry?.receipt_id !== "string" || entry.receipt_id.length === 0
      || receiptSchemaVersion(entry) !== 3
      || entry.session_key !== value.session_key
      || entry.run_id !== value.run_id
      || entry.task_id !== value.task_id
      || entry.source_fingerprint !== value.source_fingerprint
      || !fingerprintShapeValid(entry.worktree_fingerprint)
      || !fingerprintShapeValid(entry.source_fingerprint)
      || typeof entry.context_strategy_id !== "string"
      || !fingerprintShapeValid(entry.context_strategy_fingerprint)
      || !Number.isInteger(entry.mutation_revision_started)
      || !Number.isInteger(entry.mutation_revision_completed)
      || typeof entry.tool_id !== "string"
      || !Array.isArray(entry.requested_paths)
      || !Array.isArray(entry.observed_paths)
      || !Array.isArray(entry.content_ranges)
      || entry.requested_paths.some((path) => !canonicalPathShapeValid(path, { allowRoot: true }))
      || entry.observed_paths.some((path) => !canonicalPathShapeValid(path))) {
      throw new ContractError("CONTEXT_RECEIPT_BINDING_INVALID", `context receipt ${entry?.receipt_id ?? "unknown"} is not a bound current-index projection`);
    }
  }
}

function selectEntries(entries, receiptIds) {
  if (receiptIds !== null && new Set(receiptIds).size !== receiptIds.length) {
    throw new ContractError("CONTEXT_RECEIPT_DUPLICATE", "receipt_ids contains duplicate identities");
  }
  const requestedIds = receiptIds === null ? [...new Set(entries.map((entry) => entry?.receipt_id))] : receiptIds;
  const counts = new Map();
  for (const entry of entries) counts.set(entry?.receipt_id, (counts.get(entry?.receipt_id) ?? 0) + 1);
  for (const receiptId of requestedIds) {
    const count = counts.get(receiptId) ?? 0;
    if (count === 0) throw new ContractError("CONTEXT_RECEIPT_UNKNOWN", `context receipt ${receiptId} does not exist`);
    if (count !== 1) throw new ContractError("CONTEXT_RECEIPT_DUPLICATE", `context receipt ${receiptId} is ambiguous`);
  }
  if (receiptIds === null && entries.some((entry) => typeof entry?.receipt_id !== "string" || entry.receipt_id.length === 0)) {
    throw new ContractError("CONTEXT_RECEIPT_BINDING_INVALID", "context file coverage requires receipt identities");
  }
  const selected = entries.filter((entry) => requestedIds.includes(entry.receipt_id));
  if (selected.length !== requestedIds.length) {
    throw new ContractError("CONTEXT_RECEIPT_UNKNOWN", "context file coverage could not resolve the exact receipt subset");
  }
  return selected;
}

function validateCurrentEntries(value, kind, entries) {
  if (kind === "legacy") return;
  if (kind === "raw") {
    for (const entry of entries) validateContextReceipt(entry, `context file coverage receipt ${entry?.receipt_id ?? "unknown"}`);
  } else {
    validateCurrentIndexBindings(value, entries);
  }
  const bindings = new Set(entries.map((entry) => canonicalJson(bindingFor(entry))));
  if (bindings.size > 1) {
    throw new ContractError("CONTEXT_RECEIPT_BINDING_INVALID", "context file coverage receipts cross session, workspace, or strategy bindings");
  }
}

function rangeShapeValid(range) {
  if (range === null || typeof range !== "object" || Array.isArray(range)) return false;
  if (canonicalJson(Object.keys(range).sort()) !== canonicalJson([...CONTENT_RANGE_KEYS].sort())) return false;
  if (typeof range.path !== "string") return false;
  try {
    const normalized = normalizeRelativePath(range.path, "context content range.path");
    if (normalized === "." || normalized !== range.path) return false;
  } catch {
    return false;
  }
  return Number.isInteger(range.start_line)
    && Number.isInteger(range.end_line)
    && Number.isInteger(range.total_lines)
    && range.start_line >= 1
    && range.end_line >= range.start_line
    && range.end_line - range.start_line + 1 <= MAX_CONTENT_RANGE_LINES
    && range.total_lines >= 1
    && range.end_line <= range.total_lines
    && typeof range.content_version_fingerprint === "string"
    && /^sha256:[0-9a-f]{64}$/.test(range.content_version_fingerprint)
    && typeof range.stable === "boolean"
    && typeof range.changed_during_operation === "boolean"
    && typeof range.range_truncated_before === "boolean"
    && typeof range.range_truncated_after === "boolean"
    && range.range_truncated_before === (range.start_line > 1)
    && range.range_truncated_after === (range.end_line < range.total_lines);
}

function operationEligible(entry, implementationStartedSequence) {
  const coverage = coverageFor(entry);
  const codes = coverage?.truncation_codes ?? [];
  const completeSuccess = entry?.status === "success"
    && entry.reason_code === null
    && (entry?.item_failures ?? entry?.result?.item_failures ?? []).length === 0
    && coverage?.partial === false
    && coverage?.complete === true
    && codes.every((code) => INFORMATIONAL_TRUNCATION_CODES.has(code));
  const rangeBoundPartial = entry?.status === "truncated"
    && entry.reason_code === "partial_coverage"
    && coverage?.partial === true
    && coverage?.complete === false
    && codes.length > 0
    && codes.every((code) => RANGE_ONLY_TRUNCATION_CODES.has(code));
  return DIRECT_CONTENT_TOOLS.has(entry?.tool_id)
    && receiptSchemaVersion(entry) === 3
    && entry?.tool_output_schema_version === 2
    && (completeSuccess || rangeBoundPartial)
    && coverage !== null
    && coverage.stable === true
    && coverage.changed_during_operation === false
    && Array.isArray(codes)
    && Number.isInteger(entry?.mutation_revision_started)
    && Number.isInteger(entry?.mutation_revision_completed)
    && entry.mutation_revision_started === 0
    && entry.mutation_revision_completed === 0
    && (implementationStartedSequence === null
      || (Number.isInteger(entry?.sequence) && entry.sequence < implementationStartedSequence));
}

function pathLocalOperationEligible(entry, implementationStartedSequence) {
  if (operationEligible(entry, implementationStartedSequence)) return true;
  const coverage = coverageFor(entry);
  return entry?.tool_id === "context_batch_read"
    && receiptSchemaVersion(entry) === 3
    && entry?.tool_output_schema_version === 2
    && entry?.status === "truncated"
    && entry?.reason_code === "partial_tool_failure"
    && coverage?.partial === true
    && coverage?.complete === false
    && coverage?.stable === true
    && coverage?.changed_during_operation === false
    && Array.isArray(coverage?.truncation_codes)
    && Number.isInteger(entry?.mutation_revision_started)
    && Number.isInteger(entry?.mutation_revision_completed)
    && entry.mutation_revision_started === 0
    && entry.mutation_revision_completed === 0
    && (implementationStartedSequence === null
      || (Number.isInteger(entry?.sequence) && entry.sequence < implementationStartedSequence));
}

function mergeRanges(ranges) {
  const sorted = ranges
    .map(({ start_line: startLine, end_line: endLine }) => ({ start_line: startLine, end_line: endLine }))
    .sort((left, right) => left.start_line - right.start_line || left.end_line - right.end_line);
  const merged = [];
  for (const range of sorted) {
    const prior = merged.at(-1);
    if (prior === undefined || range.start_line > prior.end_line + 1) merged.push({ ...range });
    else prior.end_line = Math.max(prior.end_line, range.end_line);
  }
  return merged;
}

function gapsFor(totalLines, coveredRanges) {
  if (!Number.isInteger(totalLines) || totalLines < 1) return [];
  const gaps = [];
  let nextLine = 1;
  for (const range of coveredRanges) {
    if (range.start_line > nextLine) gaps.push({ start_line: nextLine, end_line: range.start_line - 1 });
    nextLine = Math.max(nextLine, range.end_line + 1);
  }
  if (nextLine <= totalLines) gaps.push({ start_line: nextLine, end_line: totalLines });
  return gaps;
}

function fileCoverage(path, records, { legacy, implementationStartedSequence }) {
  const reasons = new Set();
  const identities = new Set();
  const totals = new Set();
  const bindings = new Set();
  const eligibleRanges = [];
  const contributingReceiptIds = new Set();

  for (const { entry, range } of records) {
    if (!rangeShapeValid(range)) {
      reasons.add(range?.content_version_fingerprint == null
        ? "CONTEXT_FILE_IDENTITY_MISSING"
        : "CONTEXT_FILE_RANGE_UNTRUSTED");
      continue;
    }
    identities.add(range.content_version_fingerprint);
    totals.add(range.total_lines);
    bindings.add(canonicalJson(bindingFor(entry)));
    if (!operationEligible(entry, implementationStartedSequence)) {
      const coverage = coverageFor(entry);
      const stale = range.stable !== true
        || range.changed_during_operation !== false
        || coverage?.stable !== true
        || coverage?.changed_during_operation !== false
        || entry?.mutation_revision_started !== 0
        || entry?.mutation_revision_completed !== 0;
      reasons.add(stale ? "CONTEXT_FILE_RANGE_STALE" : "CONTEXT_FILE_RANGE_UNTRUSTED");
      continue;
    }
    if (range.stable !== true || range.changed_during_operation !== false) {
      reasons.add("CONTEXT_FILE_RANGE_STALE");
      continue;
    }
    eligibleRanges.push(range);
    if (typeof entry.receipt_id === "string") contributingReceiptIds.add(entry.receipt_id);
  }

  if (legacy) reasons.add("CONTEXT_FILE_IDENTITY_MISSING");
  if (identities.size === 0) reasons.add("CONTEXT_FILE_IDENTITY_MISSING");
  if (identities.size > 1) reasons.add("CONTEXT_FILE_VERSION_MISMATCH");
  if (totals.size > 1) reasons.add("CONTEXT_FILE_TOTAL_LINES_MISMATCH");
  if (bindings.size > 1) reasons.add("CONTEXT_FILE_RANGE_UNTRUSTED");

  const totalLines = totals.size === 1 ? [...totals][0] : null;
  const identity = identities.size === 1 ? [...identities][0] : null;
  const coveredRanges = identities.size <= 1 && totals.size <= 1 && bindings.size <= 1
    ? mergeRanges(eligibleRanges)
    : [];
  const gapRanges = gapsFor(totalLines, coveredRanges);
  if (gapRanges.length > 0) reasons.add("CONTEXT_FILE_COVERAGE_GAP");
  const complete = reasons.size === 0
    && totalLines !== null
    && coveredRanges.length === 1
    && coveredRanges[0].start_line === 1
    && coveredRanges[0].end_line >= totalLines;
  return {
    path,
    status: complete ? "complete" : legacy ? "legacy_unavailable" : "incomplete",
    content_version_fingerprint: identity,
    total_lines: totalLines,
    covered_ranges: coveredRanges,
    gap_ranges: gapRanges,
    contributing_receipt_ids: sortedUnique([...contributingReceiptIds]),
    reason_codes: complete ? [] : sortedUnique([...reasons]),
  };
}

export function deriveContextFileCoverage(receiptIndex, {
  receipt_ids: receiptIds = null,
  implementation_started_sequence: implementationStartedSequence = null,
} = {}) {
  if (receiptIds !== null && (!Array.isArray(receiptIds) || receiptIds.some((entry) => typeof entry !== "string"))) {
    throw new ContractError("CONTEXT_FILE_COVERAGE_INPUT", "receipt_ids must be null or a string array");
  }
  if (implementationStartedSequence !== null
    && (!Number.isInteger(implementationStartedSequence) || implementationStartedSequence < 1)) {
    throw new ContractError("CONTEXT_FILE_COVERAGE_INPUT", "implementation_started_sequence must be null or a positive integer");
  }
  const descriptor = inputDescriptor(receiptIndex);
  const entries = selectEntries(descriptor.receipts, receiptIds);
  validateCurrentEntries(receiptIndex, descriptor.kind, entries);
  const records = new Map();
  for (const entry of entries) {
    const rangedPaths = new Set();
    for (const range of rangeSource(entry)) {
      const path = typeof range?.path === "string" ? range.path : `<invalid:${entry?.receipt_id ?? "unknown"}>`;
      if (!records.has(path)) records.set(path, []);
      records.get(path).push({ entry, range });
      rangedPaths.add(path);
    }
    for (const path of observedDirectPaths(entry)) {
      if (!records.has(path)) records.set(path, []);
      if (!rangedPaths.has(path)) records.get(path).push({ entry, range: null });
    }
  }
  const legacy = descriptor.kind === "legacy";
  const files = [...records.entries()]
    .map(([path, ranges]) => fileCoverage(path, ranges, {
      legacy,
      implementationStartedSequence,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return deepFrozenClone(files, "context file coverage");
}

export function deriveCompleteContentPaths(receiptIndex, options = {}) {
  return Object.freeze(deriveContextFileCoverage(receiptIndex, options)
    .filter((entry) => entry.status === "complete")
    .map((entry) => entry.path));
}

export function deriveContentBackedInspectedRanges(receiptIndex, {
  receipt_ids: receiptIds = null,
  implementation_started_sequence: implementationStartedSequence = null,
} = {}) {
  if (receiptIds !== null && (!Array.isArray(receiptIds) || receiptIds.some((entry) => typeof entry !== "string"))) {
    throw new ContractError("CONTEXT_FILE_COVERAGE_INPUT", "receipt_ids must be null or a string array");
  }
  if (implementationStartedSequence !== null
    && (!Number.isInteger(implementationStartedSequence) || implementationStartedSequence < 1)) {
    throw new ContractError("CONTEXT_FILE_COVERAGE_INPUT", "implementation_started_sequence must be null or a positive integer");
  }
  const descriptor = inputDescriptor(receiptIndex);
  const entries = selectEntries(descriptor.receipts, receiptIds);
  validateCurrentEntries(receiptIndex, descriptor.kind, entries);
  if (descriptor.kind === "legacy") return Object.freeze([]);
  const ranges = [];
  for (const entry of entries) {
    if (!pathLocalOperationEligible(entry, implementationStartedSequence)) continue;
    const requestedScopeComplete = operationEligible(entry, implementationStartedSequence);
    for (const range of rangeSource(entry)) {
      if (!rangeShapeValid(range) || range.stable !== true || range.changed_during_operation !== false) continue;
      ranges.push({
        receipt_id: entry.receipt_id,
        tool_id: entry.tool_id,
        path: range.path,
        start_line: range.start_line,
        end_line: range.end_line,
        total_lines: range.total_lines,
        content_version_fingerprint: range.content_version_fingerprint,
        requested_scope_complete: requestedScopeComplete,
      });
    }
  }
  ranges.sort((left, right) => (
    left.path.localeCompare(right.path)
    || left.start_line - right.start_line
    || left.end_line - right.end_line
    || left.receipt_id.localeCompare(right.receipt_id)
  ));
  return deepFrozenClone(ranges, "content-backed inspected ranges");
}

export function validateContextFileCoverage(value, label = "context file coverage") {
  assertArray(value, label, { max: 512, item: (entry, entryLabel) => {
    assertPlain(entry, entryLabel);
    exact(entry, FILE_KEYS, FILE_KEYS, entryLabel);
    const normalized = normalizeRelativePath(entry.path, `${entryLabel}.path`);
    if (normalized === "." || normalized !== entry.path) throw new ContractError("CONTEXT_FILE_RANGE_UNTRUSTED", `${entryLabel}.path must be canonical`);
    if (!FILE_STATUS.has(entry.status)) throw new ContractError("CONTEXT_FILE_RANGE_UNTRUSTED", `${entryLabel}.status is invalid`);
    if (entry.content_version_fingerprint !== null) assertFingerprint(entry.content_version_fingerprint, `${entryLabel}.content_version_fingerprint`);
    if (entry.total_lines !== null) assertInteger(entry.total_lines, `${entryLabel}.total_lines`, { min: 1 });
    for (const key of ["covered_ranges", "gap_ranges"]) {
      assertArray(entry[key], `${entryLabel}.${key}`, { max: 512, item: (range, rangeLabel) => {
        exact(range, RANGE_KEYS, RANGE_KEYS, rangeLabel);
        assertInteger(range.start_line, `${rangeLabel}.start_line`, { min: 1 });
        assertInteger(range.end_line, `${rangeLabel}.end_line`, { min: range.start_line });
      } });
    }
    assertArray(entry.contributing_receipt_ids, `${entryLabel}.contributing_receipt_ids`, { max: 512, item: (id, idLabel) => assertString(id, idLabel, { maxBytes: 256 }) });
    assertArray(entry.reason_codes, `${entryLabel}.reason_codes`, { max: CONTEXT_FILE_COVERAGE_REASON_CODES.length, item: (code, codeLabel) => {
      assertString(code, codeLabel, { maxBytes: 128 });
      if (!CONTEXT_FILE_COVERAGE_REASON_CODES.includes(code)) throw new ContractError("CONTEXT_FILE_RANGE_UNTRUSTED", `${codeLabel} is unsupported`);
    } });
    if ((entry.status === "complete") !== (entry.reason_codes.length === 0)) {
      throw new ContractError("CONTEXT_FILE_RANGE_UNTRUSTED", `${entryLabel} status and reason_codes disagree`);
    }
  } });
  if (new Set(value.map((entry) => entry.path)).size !== value.length) {
    throw new ContractError("CONTEXT_FILE_RANGE_UNTRUSTED", `${label} contains duplicate paths`);
  }
  return value;
}

export function assertContextFileCoverage(receiptIndex, options = {}) {
  const coverage = deriveContextFileCoverage(receiptIndex, options);
  validateContextFileCoverage(coverage);
  const incomplete = coverage.filter((entry) => entry.status !== "complete");
  if (incomplete.length > 0) {
    throw new ContractError(
      incomplete[0].reason_codes[0] ?? "CONTEXT_FILE_RANGE_UNTRUSTED",
      `complete content coverage is unavailable for ${incomplete.map((entry) => entry.path).join(", ")}`,
    );
  }
  return coverage;
}
