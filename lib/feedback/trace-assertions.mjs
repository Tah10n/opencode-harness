import {
  ContractError,
  PERMISSION_DECISIONS,
  TERMINATION_REASONS,
  TRACE_STATUSES,
  assertEnum,
  assertExactKeys,
  assertPlainObject,
  assertSafeId,
} from "./contracts.mjs";
import { normalizeRelativePath } from "./privacy.mjs";

export const TRACE_ASSERTION_OPERATIONS = Object.freeze([
  "event_exists",
  "event_absent",
  "event_count_at_most",
  "context_receipt_exists",
  "verifier_code_exists",
  "termination_reason_equals",
  "no_overlapping_job_write_scopes",
  "review_finding_exists",
  "sanitized_value_absent",
]);

const EVENT_SELECTOR_FIELDS = Object.freeze([
  "event_type",
  "tool_or_command",
  "permission_decision",
  "status",
]);
const CONTEXT_SOURCE_KINDS = Object.freeze(["file", "files", "repository", "tool", "other"]);

const OPERATION_KEYS = Object.freeze({
  event_exists: ["assertion_id", "op", ...EVENT_SELECTOR_FIELDS],
  event_absent: ["assertion_id", "op", ...EVENT_SELECTOR_FIELDS],
  event_count_at_most: ["assertion_id", "op", "event_type", "max"],
  context_receipt_exists: ["assertion_id", "op", "source_kind", "relative_path"],
  verifier_code_exists: ["assertion_id", "op", "code"],
  termination_reason_equals: ["assertion_id", "op", "value"],
  no_overlapping_job_write_scopes: ["assertion_id", "op"],
  review_finding_exists: ["assertion_id", "op", "finding_id", "severity", "file", "start_line", "end_line", "code"],
  sanitized_value_absent: ["assertion_id", "op", "value"],
});

function assertNonEmptyString(value, label, { maxLength = 256 } = {}) {
  if (typeof value !== "string" || value.trim() === "" || value.length > maxLength) {
    throw new ContractError("ASSERTION_STRING", `${label} must be a non-empty string of at most ${maxLength} characters`);
  }
  return value;
}

function validateEventSelectors(assertion, label) {
  const selectors = EVENT_SELECTOR_FIELDS.filter((field) => Object.hasOwn(assertion, field));
  if (selectors.length === 0) {
    throw new ContractError("ASSERTION_SELECTOR", `${label} must define at least one exact event selector`);
  }
  if (Object.hasOwn(assertion, "event_type")) assertNonEmptyString(assertion.event_type, `${label}.event_type`);
  if (Object.hasOwn(assertion, "tool_or_command")) assertNonEmptyString(assertion.tool_or_command, `${label}.tool_or_command`);
  if (Object.hasOwn(assertion, "permission_decision")) {
    assertEnum(assertion.permission_decision, PERMISSION_DECISIONS, `${label}.permission_decision`);
  }
  if (Object.hasOwn(assertion, "status")) assertEnum(assertion.status, TRACE_STATUSES, `${label}.status`);
}

export function validateTraceAssertion(assertion, label = "assertion") {
  assertPlainObject(assertion, label);
  assertSafeId(assertion.assertion_id, `${label}.assertion_id`);
  assertEnum(assertion.op, TRACE_ASSERTION_OPERATIONS, `${label}.op`);
  const allowed = OPERATION_KEYS[assertion.op];
  assertExactKeys(assertion, { allowed, required: ["assertion_id", "op"] }, label);

  switch (assertion.op) {
    case "event_exists":
    case "event_absent":
      validateEventSelectors(assertion, label);
      break;
    case "event_count_at_most":
      assertNonEmptyString(assertion.event_type, `${label}.event_type`);
      if (!Number.isInteger(assertion.max) || assertion.max < 0 || assertion.max > 1000) {
        throw new ContractError("ASSERTION_MAX", `${label}.max must be an integer from 0 through 1000`);
      }
      break;
    case "context_receipt_exists":
      assertEnum(assertion.source_kind, CONTEXT_SOURCE_KINDS, `${label}.source_kind`);
      if (Object.hasOwn(assertion, "relative_path")) {
        assertNonEmptyString(assertion.relative_path, `${label}.relative_path`, { maxLength: 2000 });
        normalizeRelativePath(assertion.relative_path, `${label}.relative_path`);
      }
      break;
    case "verifier_code_exists":
      assertSafeId(assertion.code, `${label}.code`);
      break;
    case "termination_reason_equals":
      assertEnum(assertion.value, TERMINATION_REASONS, `${label}.value`);
      break;
    case "sanitized_value_absent":
      assertNonEmptyString(assertion.value, `${label}.value`, { maxLength: 200 });
      break;
    case "no_overlapping_job_write_scopes":
      break;
    case "review_finding_exists":
      for (const field of ["finding_id", "code"]) assertSafeId(assertion[field], `${label}.${field}`);
      assertEnum(assertion.severity, ["P0", "P1", "P2", "P3"], `${label}.severity`);
      assertNonEmptyString(assertion.file, `${label}.file`, { maxLength: 2000 });
      normalizeRelativePath(assertion.file, `${label}.file`);
      if (!Number.isInteger(assertion.start_line) || assertion.start_line < 1) throw new ContractError("ASSERTION_FINDING_LINE", `${label}.start_line must be positive`);
      if (!Number.isInteger(assertion.end_line) || assertion.end_line < assertion.start_line) throw new ContractError("ASSERTION_FINDING_LINE", `${label}.end_line must be at least start_line`);
      break;
    default:
      throw new ContractError("ASSERTION_OPERATION", `${label}.op is unsupported`);
  }
  return structuredClone(assertion);
}

export function validateTraceAssertions(assertions, label = "hidden_trace_assertions") {
  if (!Array.isArray(assertions) || assertions.length === 0 || assertions.length > 50) {
    throw new ContractError("ASSERTION_ARRAY", `${label} must contain between 1 and 50 assertions`);
  }
  const ids = new Set();
  return assertions.map((assertion, index) => {
    const validated = validateTraceAssertion(assertion, `${label}[${index}]`);
    if (ids.has(validated.assertion_id)) {
      throw new ContractError("ASSERTION_DUPLICATE_ID", `${label} contains duplicate assertion_id ${validated.assertion_id}`);
    }
    ids.add(validated.assertion_id);
    return validated;
  });
}

function eventMatches(event, assertion) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return false;
  return EVENT_SELECTOR_FIELDS.every((field) => !Object.hasOwn(assertion, field) || event[field] === assertion[field]);
}

function verifierCodes(evidence) {
  const codes = [];
  for (const source of [evidence.verification, evidence.provisional_outcome, evidence.outcome]) {
    if (Array.isArray(source?.verifier_codes)) codes.push(...source.verifier_codes);
    if (Array.isArray(source?.checks)) codes.push(...source.checks.map((check) => check?.code).filter((code) => typeof code === "string"));
  }
  for (const event of evidence.events) {
    if (Array.isArray(event?.verifier_codes)) codes.push(...event.verifier_codes);
  }
  return codes;
}

function jobWriteScopes(job) {
  const scopes = job?.write_scope ?? job?.write_scopes ?? job?.request?.write_scope ?? job?.request?.write_scopes ?? [];
  if (!Array.isArray(scopes)) return null;
  try {
    return scopes.map((scope, index) => normalizeRelativePath(scope, `job.write_scopes[${index}]`));
  } catch {
    return null;
  }
}

function lifecycleSequence(job, names) {
  for (const name of names) {
    const value = job?.[name] ?? job?.status?.[name];
    if (Number.isInteger(value) && value >= 0) return value;
  }
  return null;
}

function lifecycleTimestamp(job, names) {
  for (const name of names) {
    const value = job?.[name] ?? job?.request?.[name] ?? job?.status?.[name] ?? job?.result?.[name];
    if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return Date.parse(value);
  }
  return null;
}

function jobInterval(job) {
  const state = job?.state ?? job?.status?.state ?? null;
  const terminal = ["completed", "failed", "blocked", "cancelled"].includes(state);
  const sequenceStart = lifecycleSequence(job, ["started_sequence"]);
  const sequenceEnd = lifecycleSequence(job, ["completed_sequence", "ended_sequence"]);
  if (sequenceStart !== null || sequenceEnd !== null) {
    if (sequenceStart === null) return state === "created" || (terminal && ["blocked", "cancelled"].includes(state)) ? { skipped: true } : null;
    if (sequenceEnd === null) return state === "running" ? { start: sequenceStart, end: Number.POSITIVE_INFINITY } : null;
    return sequenceEnd >= sequenceStart ? { start: sequenceStart, end: sequenceEnd } : null;
  }
  const timestampStart = lifecycleTimestamp(job, ["started_at"])
    ?? (state === "running" ? lifecycleTimestamp(job, ["updated_at"]) : null);
  const timestampEnd = lifecycleTimestamp(job, ["completed_at", "ended_at", "updated_at"]);
  if (timestampStart === null) return state === "created" || (terminal && ["blocked", "cancelled"].includes(state)) ? { skipped: true } : null;
  if (state === "running") return { start: timestampStart, end: Number.POSITIVE_INFINITY };
  return timestampEnd !== null && timestampEnd >= timestampStart ? { start: timestampStart, end: timestampEnd } : null;
}

function scopesConflict(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function overlappingWriteScopes(jobs) {
  const normalized = [];
  for (const job of jobs) {
    const scopes = jobWriteScopes(job);
    if (scopes === null) return { malformed: true, overlap: false };
    if (scopes.length === 0) continue;
    const interval = jobInterval(job);
    if (interval === null) return { malformed: true, overlap: false };
    if (interval.skipped) continue;
    normalized.push({ scopes, ...interval });
  }
  for (let leftIndex = 0; leftIndex < normalized.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < normalized.length; rightIndex += 1) {
      const left = normalized[leftIndex];
      const right = normalized[rightIndex];
      // Persisted timestamps currently have millisecond precision. Adjacent
      // boundaries in the same millisecond are therefore ambiguous rather
      // than proof of serialization, so the assertion fails closed.
      const lifecyclesOverlap = left.start <= right.end && right.start <= left.end;
      if (lifecyclesOverlap && left.scopes.some((a) => right.scopes.some((b) => scopesConflict(a, b)))) {
        return { malformed: false, overlap: true };
      }
    }
  }
  return { malformed: false, overlap: false };
}

function structuredValueContains(value, needle, depth = 0) {
  if (depth > 8) return false;
  if (typeof value === "string") return value.includes(needle);
  if (Array.isArray(value)) return value.some((item) => structuredValueContains(item, needle, depth + 1));
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, nested]) => key.includes(needle) || structuredValueContains(nested, needle, depth + 1));
  }
  return false;
}

function result(assertion, passed, failureReason) {
  return {
    assertion_id: assertion.assertion_id,
    status: passed ? "passed" : "failed",
    reason_code: passed ? "ASSERTION_PASSED" : failureReason,
  };
}

function evaluateOne(assertion, evidence) {
  switch (assertion.op) {
    case "event_exists":
      return result(assertion, evidence.events.some((event) => eventMatches(event, assertion)), "ASSERTION_EVENT_MISSING");
    case "event_absent":
      return result(assertion, !evidence.events.some((event) => eventMatches(event, assertion)), "ASSERTION_FORBIDDEN_EVENT_PRESENT");
    case "event_count_at_most":
      return result(assertion, evidence.events.filter((event) => event?.event_type === assertion.event_type).length <= assertion.max, "ASSERTION_EVENT_COUNT_EXCEEDED");
    case "context_receipt_exists":
      return result(
        assertion,
        evidence.context_receipts.some((receipt) => receipt?.source_kind === assertion.source_kind
          && (!Object.hasOwn(assertion, "relative_path")
            || (Array.isArray(receipt?.relative_paths) && receipt.relative_paths.includes(assertion.relative_path)))),
        "ASSERTION_CONTEXT_RECEIPT_MISSING",
      );
    case "verifier_code_exists":
      return result(assertion, verifierCodes(evidence).includes(assertion.code), "ASSERTION_VERIFIER_CODE_MISSING");
    case "termination_reason_equals": {
      const actual = evidence.provisional_outcome?.termination_reason ?? evidence.outcome?.termination_reason;
      return result(assertion, actual === assertion.value, "ASSERTION_TERMINATION_REASON_MISMATCH");
    }
    case "no_overlapping_job_write_scopes": {
      const checked = overlappingWriteScopes(evidence.jobs);
      if (checked.malformed) return result(assertion, false, "ASSERTION_EVIDENCE_MALFORMED");
      return result(assertion, !checked.overlap, "ASSERTION_JOB_WRITE_SCOPE_OVERLAP");
    }
    case "review_finding_exists": {
      const expected = {
        finding_id: assertion.finding_id,
        severity: assertion.severity,
        file: assertion.file,
        start_line: assertion.start_line,
        end_line: assertion.end_line,
        code: assertion.code,
      };
      const found = evidence.events.some((event) => event?.event_type === "review_finding"
        && event.finding
        && Object.keys(expected).every((key) => event.finding[key] === expected[key]));
      return result(assertion, found, "ASSERTION_REVIEW_FINDING_MISSING");
    }
    case "sanitized_value_absent": {
      const structuredEvidence = {
        events: evidence.events,
        context_receipts: evidence.context_receipts,
        jobs: evidence.jobs,
        verification: evidence.verification,
        provisional_outcome: evidence.provisional_outcome,
        outcome: evidence.outcome,
      };
      return result(assertion, !structuredValueContains(structuredEvidence, assertion.value), "ASSERTION_SANITIZED_VALUE_PRESENT");
    }
    default:
      return result(assertion, false, "ASSERTION_EVIDENCE_MALFORMED");
  }
}

export function evaluateTraceAssertions(assertions, evidence = {}) {
  const validated = validateTraceAssertions(assertions);
  const normalizedEvidence = {
    events: Array.isArray(evidence.events) ? evidence.events : [],
    context_receipts: Array.isArray(evidence.context_receipts) ? evidence.context_receipts : [],
    jobs: Array.isArray(evidence.jobs) ? evidence.jobs : [],
    verification: evidence.verification && typeof evidence.verification === "object" ? evidence.verification : {},
    provisional_outcome: evidence.provisional_outcome && typeof evidence.provisional_outcome === "object" ? evidence.provisional_outcome : {},
    outcome: evidence.outcome && typeof evidence.outcome === "object" ? evidence.outcome : {},
  };
  return validated.map((assertion) => evaluateOne(assertion, normalizedEvidence));
}
