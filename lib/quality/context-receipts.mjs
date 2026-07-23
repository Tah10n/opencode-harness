import { assertEnum, assertIsoTimestamp } from "../feedback/contracts.mjs";
import {
  assertPersistenceSafe,
  assertSafePersistenceId,
} from "../feedback/privacy.mjs";
import {
  ContractError,
  assertArray,
  assertBoolean,
  assertFingerprint,
  assertInteger,
  assertIso,
  assertPlain,
  assertString,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
  validateEvidenceReferences,
} from "./validation.mjs";
import { CONTEXT_STRATEGY_IDS } from "./context-strategies.mjs";
import {
  CONTEXT_BATCH_ITEM_FAILURE_CODES,
  CONTEXT_RECEIPT_REASON_CODES,
  CONTEXT_RECEIPT_STATUSES,
  CONTEXT_REQUEST_LIMIT_KEYS,
  CONTEXT_TOOL_IDS,
  CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION,
  adaptContextToolOutput,
  adaptContextToolRequest,
  normalizeContextReceiptPath,
} from "./context-tool-adapters.mjs";

export const CONTEXT_RECEIPT_SCHEMA_VERSION = 3;
export const CONTEXT_RECEIPT_PRODUCER = "opencode-harness/context-receipt-v3";
export const CONTEXT_PENDING_RECORD_KIND = "context_tool_pending";
const MAX_CONTENT_RANGE_LINES = 500;

const RECEIPT_BODY_KEYS = Object.freeze([
  "schema_version",
  "producer",
  "receipt_id",
  "sequence",
  "previous_receipt_fingerprint",
  "session_key",
  "parent_session_key",
  "producer_session_key",
  "producer_role",
  "run_id",
  "task_id",
  "worktree_fingerprint",
  "source_fingerprint",
  "context_strategy_id",
  "context_strategy_fingerprint",
  "parent_question_id",
  "evidence_refs",
  "mutation_revision_started",
  "mutation_revision_completed",
  "tool_id",
  "call_key_fingerprint",
  "started_at",
  "completed_at",
  "status",
  "reason_code",
  "tool_output_schema_version",
  "request",
  "tool_snapshot",
  "result",
]);
const RECEIPT_KEYS = Object.freeze([...RECEIPT_BODY_KEYS, "fingerprint"]);
const PENDING_BODY_KEYS = Object.freeze([
  "schema_version",
  "record_kind",
  "receipt_id",
  "sequence",
  "previous_receipt_fingerprint",
  "session_key",
  "parent_session_key",
  "producer_session_key",
  "producer_role",
  "run_id",
  "task_id",
  "worktree_fingerprint",
  "source_fingerprint",
  "context_strategy_id",
  "context_strategy_fingerprint",
  "parent_question_id",
  "evidence_refs",
  "mutation_revision_started",
  "tool_id",
  "call_key_fingerprint",
  "started_at",
  "request",
]);
const PENDING_KEYS = Object.freeze([...PENDING_BODY_KEYS, "fingerprint"]);
const REQUEST_REQUIRED_KEYS = Object.freeze([
  "scope_paths",
  "relationship_target_path",
  "relationship_scope_path",
  "ranges",
  "query_fingerprint",
  "relationship_kinds",
  "extensions",
  "limits",
  "format",
]);
const REQUEST_KEYS = Object.freeze([
  ...REQUEST_REQUIRED_KEYS,
  "after_path",
  "expected_snapshot_fingerprint",
  "require_stable_snapshot",
]);
const REQUEST_RANGE_REQUIRED_KEYS = Object.freeze(["path", "start_line", "max_lines"]);
const REQUEST_RANGE_KEYS = Object.freeze([...REQUEST_RANGE_REQUIRED_KEYS, "expected_content_version_fingerprint"]);
const SNAPSHOT_KEYS = Object.freeze([
  "fingerprint",
  "fingerprint_kind",
  "fingerprint_scope",
  "complete",
  "stable",
  "changed_during_operation",
]);
const RESULT_KEYS = Object.freeze([
  "result_fingerprint",
  "relative_paths",
  "guidance_paths",
  "guidance_entries",
  "item_failures",
  "line_ranges",
  "content_ranges",
  "symbol_ids",
  "relationships",
  "tool_inventory",
  "counts",
  "coverage",
  "empty",
]);
const COUNT_KEYS = Object.freeze([
  "candidate_files",
  "scanned_files",
  "bytes_scanned",
  "skipped_secret",
  "skipped_generated",
  "skipped_large",
  "skipped_unreadable",
  "files",
  "directories",
  "lines",
  "matches",
  "ranges",
  "symbols",
  "relationships",
]);
const COVERAGE_KEYS = Object.freeze([
  "partial",
  "complete",
  "stable",
  "changed_during_operation",
  "truncation_codes",
]);
const FAILURE_STATUS_REASON_CODES = Object.freeze({
  success: [null],
  empty: [null],
  truncated: ["partial_coverage", "partial_tool_failure"],
  timeout: ["deadline_exceeded"],
  unavailable: ["tool_unavailable"],
  failed: [
    "unsupported_schema",
    "unsupported_contract",
    "output_too_large",
    "invalid_output",
    "tool_failed",
    "stale_snapshot",
    "snapshot_mismatch",
    "hash_mismatch",
    "cursor_mismatch",
    "mutation_during_context",
  ],
  interrupted: ["cancelled", "host_interrupted", "pending_recovery"],
});

function withoutFingerprint(value) {
  const body = structuredClone(value);
  delete body.fingerprint;
  return body;
}

function assertSessionKey(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new ContractError("CONTEXT_RECEIPT_SESSION", `${label} must be a lowercase SHA-256 session key`);
  }
  return value;
}

function assertNullableSessionKey(value, label) {
  if (value === null) return null;
  return assertSessionKey(value, label);
}

function assertNullableFingerprint(value, label) {
  if (value === null) return null;
  return assertFingerprint(value, label);
}

function assertCanonicalPath(value, label, { root = true } = {}) {
  const normalized = normalizeContextReceiptPath(value, label, { root });
  if (normalized !== value) throw new ContractError("CONTEXT_RECEIPT_PATH", `${label} must be canonical`);
  if (Buffer.byteLength(value, "utf8") > 1024) throw new ContractError("CONTEXT_RECEIPT_PATH", `${label} is too long`);
  return value;
}

function validatePathArray(value, label, { root = true, max = 128 } = {}) {
  assertArray(value, label, {
    max,
    item: (entry, entryLabel) => assertCanonicalPath(entry, entryLabel, { root }),
  });
  if (new Set(value).size !== value.length) throw new ContractError("CONTEXT_RECEIPT_DUPLICATE", `${label} contains duplicates`);
  return value;
}

function validateRequest(value, label = "context receipt request") {
  exact(value, REQUEST_KEYS, REQUEST_REQUIRED_KEYS, label);
  validatePathArray(value.scope_paths, `${label}.scope_paths`);
  if (value.relationship_target_path !== null) {
    assertCanonicalPath(value.relationship_target_path, `${label}.relationship_target_path`, { root: false });
  }
  if (value.relationship_scope_path !== null) {
    assertCanonicalPath(value.relationship_scope_path, `${label}.relationship_scope_path`);
  }
  assertArray(value.ranges, `${label}.ranges`, {
    max: 128,
    item: (entry, entryLabel) => {
      exact(entry, REQUEST_RANGE_KEYS, REQUEST_RANGE_REQUIRED_KEYS, entryLabel);
      assertCanonicalPath(entry.path, `${entryLabel}.path`, { root: false });
      assertInteger(entry.start_line, `${entryLabel}.start_line`, { min: 1 });
      if (entry.max_lines !== null) {
        assertInteger(entry.max_lines, `${entryLabel}.max_lines`, { min: 1, max: MAX_CONTENT_RANGE_LINES });
      }
      if (entry.expected_content_version_fingerprint !== undefined
        && entry.expected_content_version_fingerprint !== null) {
        assertFingerprint(entry.expected_content_version_fingerprint, `${entryLabel}.expected_content_version_fingerprint`);
      }
    },
  });
  assertNullableFingerprint(value.query_fingerprint, `${label}.query_fingerprint`);
  assertArray(value.relationship_kinds, `${label}.relationship_kinds`, {
    max: 5,
    item: (entry, entryLabel) => assertEnum(entry, ["direct-import", "imported-by", "likely-test", "same-basename", "sibling"], entryLabel),
  });
  assertArray(value.extensions, `${label}.extensions`, {
    max: 20,
    item: (entry, entryLabel) => {
      if (typeof entry !== "string" || !/^\.[a-z0-9][a-z0-9._+-]{0,31}$/.test(entry)) {
        throw new ContractError("CONTEXT_RECEIPT_EXTENSION", `${entryLabel} is invalid`);
      }
    },
  });
  exact(value.limits, CONTEXT_REQUEST_LIMIT_KEYS, [], `${label}.limits`);
  for (const [key, entry] of Object.entries(value.limits)) assertInteger(entry, `${label}.limits.${key}`, { min: key === "context_lines" ? 0 : 1 });
  if (value.format !== null) assertEnum(value.format, ["text", "json"], `${label}.format`);
  if (value.after_path !== undefined && value.after_path !== null) {
    assertCanonicalPath(value.after_path, `${label}.after_path`, { root: false });
  }
  if (value.expected_snapshot_fingerprint !== undefined && value.expected_snapshot_fingerprint !== null) {
    assertFingerprint(value.expected_snapshot_fingerprint, `${label}.expected_snapshot_fingerprint`);
  }
  if (value.require_stable_snapshot !== undefined) {
    assertBoolean(value.require_stable_snapshot, `${label}.require_stable_snapshot`);
  }
  return value;
}

function validateSnapshot(value, label = "context receipt tool_snapshot") {
  if (value === null) return null;
  exact(value, SNAPSHOT_KEYS, SNAPSHOT_KEYS, label);
  assertFingerprint(value.fingerprint, `${label}.fingerprint`);
  assertEnum(value.fingerprint_kind, ["metadata", "content", "partial-content"], `${label}.fingerprint_kind`);
  assertCanonicalPath(value.fingerprint_scope, `${label}.fingerprint_scope`);
  assertBoolean(value.complete, `${label}.complete`);
  assertBoolean(value.stable, `${label}.stable`);
  assertBoolean(value.changed_during_operation, `${label}.changed_during_operation`);
  return value;
}

function validateLineRange(value, label) {
  exact(value, ["path", "start_line", "end_line"], ["path", "start_line", "end_line"], label);
  assertCanonicalPath(value.path, `${label}.path`, { root: false });
  assertInteger(value.start_line, `${label}.start_line`, { min: 1 });
  assertInteger(value.end_line, `${label}.end_line`, { min: value.start_line });
  if (value.end_line - value.start_line + 1 > MAX_CONTENT_RANGE_LINES) {
    throw new ContractError("CONTEXT_RECEIPT_RANGE", `${label} exceeds the maximum ${MAX_CONTENT_RANGE_LINES}-line content range`);
  }
}

function validateContentRange(value, label) {
  const keys = [
    "path", "start_line", "end_line", "total_lines", "content_version_fingerprint", "stable",
    "changed_during_operation", "range_truncated_before", "range_truncated_after",
  ];
  exact(value, keys, keys, label);
  assertCanonicalPath(value.path, `${label}.path`, { root: false });
  assertInteger(value.start_line, `${label}.start_line`, { min: 1 });
  assertInteger(value.end_line, `${label}.end_line`, { min: value.start_line });
  assertInteger(value.total_lines, `${label}.total_lines`, { min: value.end_line });
  assertFingerprint(value.content_version_fingerprint, `${label}.content_version_fingerprint`);
  assertBoolean(value.stable, `${label}.stable`);
  assertBoolean(value.changed_during_operation, `${label}.changed_during_operation`);
  if (!value.stable || value.changed_during_operation) {
    throw new ContractError("CONTEXT_RECEIPT_RANGE_UNTRUSTED", `${label} must represent a stable read`);
  }
  assertBoolean(value.range_truncated_before, `${label}.range_truncated_before`);
  assertBoolean(value.range_truncated_after, `${label}.range_truncated_after`);
  if (value.range_truncated_before !== (value.start_line > 1)
    || value.range_truncated_after !== (value.end_line < value.total_lines)) {
    throw new ContractError("CONTEXT_RECEIPT_RANGE", `${label} boundary markers are inconsistent`);
  }
}

function validateResult(value, label = "context receipt result") {
  if (value === null) return null;
  exact(value, RESULT_KEYS, RESULT_KEYS, label);
  assertFingerprint(value.result_fingerprint, `${label}.result_fingerprint`);
  validatePathArray(value.relative_paths, `${label}.relative_paths`, { root: false });
  validatePathArray(value.guidance_paths, `${label}.guidance_paths`, { root: false });
  if (value.guidance_paths.some((entry) => !value.relative_paths.includes(entry))) {
    throw new ContractError("CONTEXT_RECEIPT_GUIDANCE_PATH", `${label}.guidance_paths must be a subset of relative_paths`);
  }
  assertArray(value.guidance_entries, `${label}.guidance_entries`, {
    max: 128,
    item: (entry, entryLabel) => {
      exact(entry, ["path", "kind", "applies_to", "source"], ["path", "kind", "applies_to", "source"], entryLabel);
      assertCanonicalPath(entry.path, `${entryLabel}.path`, { root: false });
      assertCanonicalPath(entry.applies_to, `${entryLabel}.applies_to`);
      assertEnum(entry.kind, ["agents", "workflow", "skill", "codeowners"], `${entryLabel}.kind`);
      assertEnum(entry.source, ["discovered"], `${entryLabel}.source`);
      if (!value.guidance_paths.includes(entry.path)) {
        throw new ContractError("CONTEXT_RECEIPT_GUIDANCE_PATH", `${entryLabel}.path must be present in guidance_paths`);
      }
    },
  });
  assertArray(value.item_failures, `${label}.item_failures`, {
    max: 20,
    item: (entry, entryLabel) => {
      exact(entry, ["path", "reason_code"], ["path", "reason_code"], entryLabel);
      assertCanonicalPath(entry.path, `${entryLabel}.path`, { root: false });
      assertEnum(entry.reason_code, CONTEXT_BATCH_ITEM_FAILURE_CODES, `${entryLabel}.reason_code`);
      if (!value.relative_paths.includes(entry.path)) {
        throw new ContractError("CONTEXT_RECEIPT_ITEM_FAILURE", `${entryLabel}.path must be present in relative_paths`);
      }
    },
  });
  if (new Set(value.item_failures.map((entry) => `${entry.path}\0${entry.reason_code}`)).size !== value.item_failures.length) {
    throw new ContractError("CONTEXT_RECEIPT_ITEM_FAILURE", `${label}.item_failures contains duplicates`);
  }
  assertArray(value.line_ranges, `${label}.line_ranges`, { max: 128, item: validateLineRange });
  assertArray(value.content_ranges, `${label}.content_ranges`, { max: 128, item: validateContentRange });
  if (value.content_ranges.some((entry) => !value.line_ranges.some((range) => (
    range.path === entry.path && range.start_line === entry.start_line && range.end_line === entry.end_line
  )))) {
    throw new ContractError("CONTEXT_RECEIPT_RANGE", `${label}.content_ranges must be a subset of line_ranges`);
  }
  assertArray(value.symbol_ids, `${label}.symbol_ids`, {
    max: 128,
    item: (entry, entryLabel) => {
      exact(entry, ["symbol_id", "path", "line", "kind"], ["symbol_id", "path", "line", "kind"], entryLabel);
      assertFingerprint(entry.symbol_id, `${entryLabel}.symbol_id`);
      assertCanonicalPath(entry.path, `${entryLabel}.path`, { root: false });
      assertInteger(entry.line, `${entryLabel}.line`, { min: 1 });
      assertEnum(entry.kind, ["class", "constant", "enum", "function", "interface", "method", "record", "type"], `${entryLabel}.kind`);
    },
  });
  assertArray(value.relationships, `${label}.relationships`, {
    max: 128,
    item: (entry, entryLabel) => {
      exact(entry, ["path", "relationship", "confidence"], ["path", "relationship", "confidence"], entryLabel);
      assertCanonicalPath(entry.path, `${entryLabel}.path`, { root: false });
      assertEnum(entry.relationship, ["direct-import", "imported-by", "likely-test", "same-basename", "sibling"], `${entryLabel}.relationship`);
      assertEnum(entry.confidence, ["high", "medium", "low"], `${entryLabel}.confidence`);
    },
  });
  assertArray(value.tool_inventory, `${label}.tool_inventory`, {
    max: CONTEXT_TOOL_IDS.length,
    item: (entry, entryLabel) => assertEnum(entry, CONTEXT_TOOL_IDS, entryLabel),
  });
  exact(value.counts, COUNT_KEYS, COUNT_KEYS, `${label}.counts`);
  for (const key of COUNT_KEYS) assertInteger(value.counts[key], `${label}.counts.${key}`);
  exact(value.coverage, COVERAGE_KEYS, COVERAGE_KEYS, `${label}.coverage`);
  assertBoolean(value.coverage.partial, `${label}.coverage.partial`);
  assertBoolean(value.coverage.complete, `${label}.coverage.complete`);
  assertBoolean(value.coverage.stable, `${label}.coverage.stable`);
  assertBoolean(value.coverage.changed_during_operation, `${label}.coverage.changed_during_operation`);
  assertArray(value.coverage.truncation_codes, `${label}.coverage.truncation_codes`, {
    max: 32,
    item: (entry, entryLabel) => assertString(entry, entryLabel, { maxBytes: 128 }),
  });
  assertBoolean(value.empty, `${label}.empty`);
  return value;
}

function validateRunnerBinding(value, label) {
  assertSafePersistenceId(value.receipt_id, `${label}.receipt_id`);
  assertInteger(value.sequence, `${label}.sequence`, { min: 1 });
  assertNullableFingerprint(value.previous_receipt_fingerprint, `${label}.previous_receipt_fingerprint`);
  assertSessionKey(value.session_key, `${label}.session_key`);
  assertNullableSessionKey(value.parent_session_key, `${label}.parent_session_key`);
  assertSessionKey(value.producer_session_key, `${label}.producer_session_key`);
  assertEnum(value.producer_role, [
    "runner", "owner_session", "architect", "diagnose", "explore", "general", "researcher", "reviewer", "verifier",
  ], `${label}.producer_role`);
  const childProduced = !["runner", "owner_session"].includes(value.producer_role);
  if (childProduced) {
    if (value.parent_session_key !== value.session_key || value.producer_session_key === value.session_key) {
      throw new ContractError("CONTEXT_RECEIPT_PRODUCER_BINDING", `${label} child producer must bind a distinct serialized child session to the owner session`);
    }
  } else if (value.parent_session_key !== null || value.producer_session_key !== value.session_key) {
    throw new ContractError("CONTEXT_RECEIPT_PRODUCER_BINDING", `${label} runner or owner producer must bind the authoritative context session directly`);
  }
  assertSafePersistenceId(value.run_id, `${label}.run_id`);
  assertSafePersistenceId(value.task_id, `${label}.task_id`);
  assertFingerprint(value.worktree_fingerprint, `${label}.worktree_fingerprint`);
  assertFingerprint(value.source_fingerprint, `${label}.source_fingerprint`);
  assertEnum(value.context_strategy_id, CONTEXT_STRATEGY_IDS, `${label}.context_strategy_id`);
  assertFingerprint(value.context_strategy_fingerprint, `${label}.context_strategy_fingerprint`);
  if (value.parent_question_id !== null) assertSafePersistenceId(value.parent_question_id, `${label}.parent_question_id`);
  validateEvidenceReferences(value.evidence_refs, `${label}.evidence_refs`);
  assertInteger(value.mutation_revision_started, `${label}.mutation_revision_started`);
  assertEnum(value.tool_id, CONTEXT_TOOL_IDS, `${label}.tool_id`);
  assertFingerprint(value.call_key_fingerprint, `${label}.call_key_fingerprint`);
  assertIso(value.started_at, `${label}.started_at`);
  validateRequest(value.request, `${label}.request`);
}

export function validatePendingContextReceipt(value, label = "pending context receipt") {
  exact(value, PENDING_KEYS, PENDING_KEYS, label);
  if (value.schema_version !== CONTEXT_RECEIPT_SCHEMA_VERSION || value.record_kind !== CONTEXT_PENDING_RECORD_KIND) {
    throw new ContractError("CONTEXT_RECEIPT_PENDING_SCHEMA", `${label} schema or record kind is invalid`);
  }
  validateRunnerBinding(value, label);
  assertFingerprint(value.fingerprint, `${label}.fingerprint`);
  if (!fingerprintsEqual(value.fingerprint, fingerprint(withoutFingerprint(value)))) {
    throw new ContractError("CONTEXT_RECEIPT_PENDING_FINGERPRINT", `${label} fingerprint is invalid`);
  }
  assertPersistenceSafe(value, { label });
  return value;
}

export function validateContextReceipt(value, label = "context receipt") {
  exact(value, RECEIPT_KEYS, RECEIPT_KEYS, label);
  if (value.schema_version !== CONTEXT_RECEIPT_SCHEMA_VERSION || value.producer !== CONTEXT_RECEIPT_PRODUCER) {
    throw new ContractError("CONTEXT_RECEIPT_SCHEMA", `${label} schema or producer is invalid`);
  }
  validateRunnerBinding(value, label);
  assertInteger(value.mutation_revision_completed, `${label}.mutation_revision_completed`, { min: value.mutation_revision_started });
  assertIso(value.completed_at, `${label}.completed_at`);
  if (Date.parse(value.completed_at) < Date.parse(value.started_at)) {
    throw new ContractError("CONTEXT_RECEIPT_TIME", `${label} completed_at precedes started_at`);
  }
  assertEnum(value.status, CONTEXT_RECEIPT_STATUSES, `${label}.status`);
  if (value.reason_code !== null) assertEnum(value.reason_code, CONTEXT_RECEIPT_REASON_CODES, `${label}.reason_code`);
  if (!FAILURE_STATUS_REASON_CODES[value.status].includes(value.reason_code)) {
    throw new ContractError("CONTEXT_RECEIPT_STATUS_REASON", `${label} status and reason_code are inconsistent`);
  }
  if (value.tool_output_schema_version !== null && value.tool_output_schema_version !== CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION) {
    throw new ContractError("CONTEXT_RECEIPT_TOOL_SCHEMA", `${label}.tool_output_schema_version is unsupported`);
  }
  validateSnapshot(value.tool_snapshot, `${label}.tool_snapshot`);
  validateResult(value.result, `${label}.result`);
  if (value.result?.content_ranges.length > 0 && !["context_read", "context_batch_read"].includes(value.tool_id)) {
    throw new ContractError("CONTEXT_RECEIPT_RANGE", `${label} non-read tools cannot carry content ranges`);
  }
  if (value.result?.item_failures.length > 0 && value.tool_id !== "context_batch_read") {
    throw new ContractError("CONTEXT_RECEIPT_ITEM_FAILURE", "only context_batch_read may persist item failures");
  }
  const itemFailures = value.result?.item_failures ?? [];
  if (itemFailures.length > 0) {
    if (value.result.coverage.partial !== true || value.result.coverage.complete !== false) {
      throw new ContractError(
        "CONTEXT_RECEIPT_ITEM_FAILURE",
        `${label} batch item failures require partial, incomplete coverage`,
      );
    }
    if (value.result.empty === true) {
      if (value.status !== "failed") {
        throw new ContractError(
          "CONTEXT_RECEIPT_ITEM_FAILURE",
          `${label} all-failed batch must use failed status`,
        );
      }
    } else if (value.status !== "truncated" || value.reason_code !== "partial_tool_failure") {
      throw new ContractError(
        "CONTEXT_RECEIPT_ITEM_FAILURE",
        `${label} mixed batch failures require truncated status and partial_tool_failure reason`,
      );
    }
  }
  if (value.status === "truncated" && value.reason_code === "partial_tool_failure" && itemFailures.length === 0) {
    throw new ContractError(
      "CONTEXT_RECEIPT_ITEM_FAILURE",
      `${label} partial_tool_failure requires at least one typed batch item failure`,
    );
  }
  if (value.tool_output_schema_version === CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION) {
    if (value.tool_snapshot === null || value.result === null) {
      throw new ContractError("CONTEXT_RECEIPT_TOOL_RESULT", `${label} schema-v2 output needs snapshot and result`);
    }
  } else if (value.tool_snapshot !== null || value.result !== null) {
    throw new ContractError("CONTEXT_RECEIPT_TOOL_RESULT", `${label} unparsed output cannot persist snapshot or result`);
  }
  if (value.status === "empty" && value.result?.empty !== true) {
    throw new ContractError("CONTEXT_RECEIPT_EMPTY", `${label} empty status needs an empty result`);
  }
  if (["success", "empty"].includes(value.status) && value.result?.coverage.partial) {
    throw new ContractError("CONTEXT_RECEIPT_COVERAGE", `${label} complete status cannot carry partial coverage`);
  }
  assertFingerprint(value.fingerprint, `${label}.fingerprint`);
  if (!fingerprintsEqual(value.fingerprint, fingerprint(withoutFingerprint(value)))) {
    throw new ContractError("CONTEXT_RECEIPT_FINGERPRINT", `${label} fingerprint is invalid`);
  }
  assertPersistenceSafe(value, { label });
  return value;
}

export function createContextReceipt(body) {
  exact(body, RECEIPT_BODY_KEYS, RECEIPT_BODY_KEYS, "context receipt body");
  const receipt = { ...structuredClone(body), fingerprint: fingerprint(body) };
  validateContextReceipt(receipt);
  return deepFrozenClone(receipt, "context receipt");
}

export function beginContextReceiptOperation(input) {
  const inputKeys = [
    "receipt_id", "sequence", "previous_receipt_fingerprint", "session_key", "parent_session_key", "run_id",
    "producer_session_key", "producer_role",
    "task_id", "worktree_fingerprint", "source_fingerprint", "mutation_revision_started", "tool_id",
    "context_strategy_id", "context_strategy_fingerprint", "parent_question_id", "evidence_refs",
    "call_key_fingerprint", "started_at", "args", "fingerprint_salt",
  ];
  exact(input, inputKeys, inputKeys, "begin context receipt input");
  const body = {
    schema_version: CONTEXT_RECEIPT_SCHEMA_VERSION,
    record_kind: CONTEXT_PENDING_RECORD_KIND,
    receipt_id: input.receipt_id,
    sequence: input.sequence,
    previous_receipt_fingerprint: input.previous_receipt_fingerprint,
    session_key: input.session_key,
    parent_session_key: input.parent_session_key,
    producer_session_key: input.producer_session_key,
    producer_role: input.producer_role,
    run_id: input.run_id,
    task_id: input.task_id,
    worktree_fingerprint: input.worktree_fingerprint,
    source_fingerprint: input.source_fingerprint,
    context_strategy_id: input.context_strategy_id,
    context_strategy_fingerprint: input.context_strategy_fingerprint,
    parent_question_id: input.parent_question_id,
    evidence_refs: structuredClone(input.evidence_refs),
    mutation_revision_started: input.mutation_revision_started,
    tool_id: input.tool_id,
    call_key_fingerprint: input.call_key_fingerprint,
    started_at: input.started_at,
    request: adaptContextToolRequest(input.tool_id, input.args, { fingerprintSalt: input.fingerprint_salt }),
  };
  const pending = { ...body, fingerprint: fingerprint(body) };
  validatePendingContextReceipt(pending);
  return deepFrozenClone(pending, "pending context receipt");
}

function receiptBodyFromPending(pending, settlement, adapted) {
  return {
    schema_version: CONTEXT_RECEIPT_SCHEMA_VERSION,
    producer: CONTEXT_RECEIPT_PRODUCER,
    receipt_id: pending.receipt_id,
    sequence: pending.sequence,
    previous_receipt_fingerprint: pending.previous_receipt_fingerprint,
    session_key: pending.session_key,
    parent_session_key: pending.parent_session_key,
    producer_session_key: pending.producer_session_key,
    producer_role: pending.producer_role,
    run_id: pending.run_id,
    task_id: pending.task_id,
    worktree_fingerprint: pending.worktree_fingerprint,
    source_fingerprint: pending.source_fingerprint,
    context_strategy_id: pending.context_strategy_id,
    context_strategy_fingerprint: pending.context_strategy_fingerprint,
    parent_question_id: pending.parent_question_id,
    evidence_refs: structuredClone(pending.evidence_refs),
    mutation_revision_started: pending.mutation_revision_started,
    mutation_revision_completed: settlement.mutation_revision_completed,
    tool_id: pending.tool_id,
    call_key_fingerprint: pending.call_key_fingerprint,
    started_at: pending.started_at,
    completed_at: settlement.completed_at,
    status: adapted.status,
    reason_code: adapted.reason_code,
    tool_output_schema_version: adapted.tool_output_schema_version,
    request: pending.request,
    tool_snapshot: adapted.tool_snapshot,
    result: adapted.result,
  };
}

export function completeContextReceiptOperation(pending, settlement) {
  validatePendingContextReceipt(pending);
  const keys = ["output", "completed_at", "mutation_revision_completed", "fingerprint_salt", "adapter_limits"];
  exact(settlement, keys, ["output", "completed_at", "mutation_revision_completed", "fingerprint_salt"], "complete context receipt input");
  assertIsoTimestamp(settlement.completed_at, "complete context receipt input.completed_at");
  assertInteger(settlement.mutation_revision_completed, "complete context receipt input.mutation_revision_completed");
  let adapted = adaptContextToolOutput(pending.tool_id, settlement.output, {
    fingerprintSalt: settlement.fingerprint_salt,
    limits: settlement.adapter_limits ?? {},
    request: pending.request,
  });
  if (settlement.mutation_revision_completed !== pending.mutation_revision_started) {
    adapted = { ...adapted, status: "failed", reason_code: "mutation_during_context" };
  }
  return createContextReceipt(receiptBodyFromPending(pending, settlement, adapted));
}

export function failContextReceiptOperation(pending, settlement) {
  validatePendingContextReceipt(pending);
  const keys = ["status", "reason_code", "completed_at", "mutation_revision_completed"];
  exact(settlement, keys, keys, "fail context receipt input");
  assertEnum(settlement.status, ["timeout", "unavailable", "failed", "interrupted"], "fail context receipt input.status");
  assertEnum(settlement.reason_code, CONTEXT_RECEIPT_REASON_CODES, "fail context receipt input.reason_code");
  assertIsoTimestamp(settlement.completed_at, "fail context receipt input.completed_at");
  assertInteger(settlement.mutation_revision_completed, "fail context receipt input.mutation_revision_completed");
  const adapted = {
    status: settlement.mutation_revision_completed === pending.mutation_revision_started ? settlement.status : "failed",
    reason_code: settlement.mutation_revision_completed === pending.mutation_revision_started
      ? settlement.reason_code
      : "mutation_during_context",
    tool_output_schema_version: null,
    tool_snapshot: null,
    result: null,
  };
  return createContextReceipt(receiptBodyFromPending(pending, settlement, adapted));
}

export function assertSameSessionContextReceipt(receipt, expected) {
  validateContextReceipt(receipt);
  const keys = ["session_key", "run_id", "task_id", "worktree_fingerprint", "source_fingerprint"];
  exact(expected, keys, ["session_key", "run_id", "worktree_fingerprint"], "same-session expectation");
  const comparisons = ["session_key", "run_id", "worktree_fingerprint"];
  if (expected.task_id !== undefined) comparisons.push("task_id");
  if (expected.source_fingerprint !== undefined) comparisons.push("source_fingerprint");
  for (const key of comparisons) {
    if (receipt[key] !== expected[key]) throw new ContractError("CONTEXT_RECEIPT_SESSION_MISMATCH", `context receipt ${key} does not match`);
  }
  return receipt;
}

export function assertPreMutationContextReceipt(receipt, expected) {
  validateContextReceipt(receipt);
  const keys = [
    "session_key", "run_id", "task_id", "worktree_fingerprint", "source_fingerprint",
    "current_mutation_revision", "first_mutation_at",
  ];
  exact(expected, keys, ["session_key", "run_id", "worktree_fingerprint", "source_fingerprint", "current_mutation_revision", "first_mutation_at"], "pre-mutation expectation");
  assertSameSessionContextReceipt(receipt, {
    session_key: expected.session_key,
    run_id: expected.run_id,
    task_id: expected.task_id,
    worktree_fingerprint: expected.worktree_fingerprint,
    source_fingerprint: expected.source_fingerprint,
  });
  assertInteger(expected.current_mutation_revision, "pre-mutation expectation.current_mutation_revision");
  if (expected.first_mutation_at !== null) assertIsoTimestamp(expected.first_mutation_at, "pre-mutation expectation.first_mutation_at");
  if (receipt.mutation_revision_started !== 0 || receipt.mutation_revision_completed !== 0
    || expected.current_mutation_revision !== 0) {
    throw new ContractError("CONTEXT_RECEIPT_POST_MUTATION", "context receipt is not pre-mutation evidence");
  }
  if (expected.first_mutation_at !== null && Date.parse(receipt.completed_at) >= Date.parse(expected.first_mutation_at)) {
    throw new ContractError("CONTEXT_RECEIPT_POST_MUTATION", "context receipt did not complete before the first mutation");
  }
  return receipt;
}
