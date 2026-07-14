import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

import {
  ContractError,
  JOB_STATES,
  PERMISSION_DECISIONS,
  RISK_LEVELS,
  TERMINATION_REASONS,
  TRACE_SCHEMA_VERSION,
  TRACE_STATUSES,
  assertEnum,
  assertExactKeys,
  assertIsoTimestamp,
  assertPlainObject,
  canonicalJson,
} from "./contracts.mjs";
import {
  DEFAULT_LIMITS,
  assertNoForbiddenPersistenceKeys,
  assertPersistenceSafe,
  assertSafePersistenceId,
  normalizeRelativePath,
  sanitizeBoundedString,
  sensitiveTextReasons,
} from "./privacy.mjs";
import {
  assertNoSymlinkEscape,
  assertConfinedTree,
  atomicRewriteJsonLines,
  atomicWriteJson,
  ensureConfinedDirectory,
  readJson,
  readJsonLines,
  resolveHarnessRoot,
  resolveIdPath,
  resolveInside,
  withExclusiveLock,
} from "./files.mjs";

const STORE_INTERNALS = new WeakMap();

function confinedTreeManifest(basePath, treePath) {
  const root = assertConfinedTree(basePath, treePath);
  const entries = [];
  const pending = [{ absolute: root, relative: "" }];
  while (pending.length > 0) {
    const current = pending.pop();
    const children = fs.readdirSync(current.absolute, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of children) {
      const absolute = path.join(current.absolute, entry.name);
      const relative = current.relative ? `${current.relative}/${entry.name}` : entry.name;
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new ContractError("FILES_SYMLINK", `staged trace contains a linked entry: ${relative}`);
      if (stat.isDirectory()) {
        entries.push({ path: relative, type: "directory", mode: stat.mode & 0o777 });
        pending.push({ absolute, relative });
      } else if (stat.isFile()) {
        entries.push({
          path: relative,
          type: "file",
          mode: stat.mode & 0o777,
          size: stat.size,
          digest: createHash("sha256").update(fs.readFileSync(absolute)).digest("hex"),
        });
      } else {
        throw new ContractError("FILES_TYPE", `staged trace contains a non-regular entry: ${relative}`);
      }
    }
  }
  return canonicalJson(entries.sort((left, right) => left.path.localeCompare(right.path)));
}

function materializeBufferedSnapshot(stagedStore, stagedSnapshot) {
  const staged = STORE_INTERNALS.get(stagedStore);
  if (staged?.kind !== "disk" || !staged.stagingRoot) throw new ContractError("TRACE_STAGING_STORE", "buffered materialization requires a disk staging store");
  const runId = stagedSnapshot.run.run_id;
  const runsRoot = resolveInside(staged.harnessRoot, "runs");
  ensureConfinedDirectory(staged.harnessRoot, staged.harnessRoot);
  ensureConfinedDirectory(staged.harnessRoot, runsRoot);
  const runDir = resolveIdPath(runsRoot, runId);
  if (fs.existsSync(runDir)) throw new ContractError("TRACE_RUN_EXISTS", `run already exists: ${runId}`);
  ensureConfinedDirectory(staged.harnessRoot, runDir);
  const paths = artifactPaths(runDir);
  const secureFiles = { basePath: staged.harnessRoot };
  atomicWriteJson(paths.run, stagedSnapshot.run, { ...secureFiles, immutable: true });
  atomicRewriteJsonLines(paths.events, stagedSnapshot.events, secureFiles);
  atomicRewriteJsonLines(paths.receipts, stagedSnapshot.context_receipts, secureFiles);
  ensureConfinedDirectory(staged.harnessRoot, paths.jobs);
  for (const job of stagedSnapshot.jobs) {
    const current = jobPaths(paths.jobs, job.request.task_id);
    ensureConfinedDirectory(staged.harnessRoot, current.directory);
    atomicWriteJson(current.request, job.request, { ...secureFiles, immutable: true });
    atomicWriteJson(current.status, job.status, { ...secureFiles, immutable: true });
    if (job.result) atomicWriteJson(current.result, job.result, { ...secureFiles, immutable: true });
  }
  atomicWriteJson(paths.verification, stagedSnapshot.verification, { ...secureFiles, immutable: true });
  atomicWriteJson(paths.outcome, stagedSnapshot.outcome, { ...secureFiles, immutable: true });
  const inspected = stagedStore.inspectRun(runId);
  if (!inspected.complete) throw new ContractError("TRACE_STAGING_MATERIALIZE", "materialized buffered run is incomplete");
  return inspected;
}

const EVENT_TYPES_V1 = Object.freeze([
  "task_start",
  "context_read",
  "delegation",
  "tool_call",
  "permission_request",
  "edit",
  "review_finding",
  "verification",
  "task_end",
]);

const EVENT_TYPES_V2 = Object.freeze([
  ...EVENT_TYPES_V1,
  "fixture_preparation",
  "setup_verification",
  "adapter_invocation",
  "adapter_result",
  "visible_check",
  "hidden_staging",
  "hidden_check",
  "job_lifecycle",
]);

const VERIFICATION_STATUSES = Object.freeze(["passed", "failed", "incomplete", "not_run"]);
const FINDING_SEVERITIES = Object.freeze(["P0", "P1", "P2", "P3"]);
const TERMINAL_JOB_STATES = new Set(["completed", "failed", "blocked", "cancelled"]);
const RESULT_STATUSES_BY_JOB_STATE = Object.freeze({
  completed: new Set(["completed", "changed", "no-op", "no-findings"]),
  failed: new Set(["failed"]),
  blocked: new Set(["blocked", "unsafe"]),
  cancelled: new Set(["blocked"]),
});
const UNAVAILABLE_FIELDS = Object.freeze([
  "scenario_id",
  "profile_role",
  "harness_fingerprint",
  "model",
  "model_parameters",
  "task_class",
  "strategy_id",
]);
const EVIDENCE_KINDS = Object.freeze(["file", "event", "command", "url", "run", "job", "check"]);
const CONTEXT_SOURCE_KINDS = Object.freeze(["file", "files", "repository", "tool", "other"]);

export const DEFAULT_TRACE_STORE_LIMITS = Object.freeze({
  events: 1000,
  receipts: 500,
  jobs: 100,
  activeJobs: 25,
  recordBytes: 64 * 1024,
  totalBytes: 8 * 1024 * 1024,
});

const RUN_INPUT_KEYS = Object.freeze([
  "run_id",
  "parent_run_id",
  "scenario_id",
  "profile_role",
  "harness_fingerprint",
  "model",
  "model_parameters",
  "task_class",
  "strategy_id",
  "risk",
  "unavailable_metadata",
]);
const EVENT_INPUT_KEYS = Object.freeze([
  "task_id",
  "parent_task_id",
  "agent",
  "event_type",
  "summary",
  "tool_or_command",
  "permission_decision",
  "files_read",
  "files_written",
  "evidence_refs",
  "verification",
  "status",
  "risk",
  "termination_reason",
  "hypothesis",
  "expected_observation",
  "actual_observation",
  "context_snapshot",
  "verifier_codes",
  "strategy_id",
  "finding",
]);
const EVENT_REQUIRED_KEYS = Object.freeze(["task_id", "agent", "event_type", "summary", "status"]);
const EVENT_V2_KEYS = Object.freeze([
  "schema_version",
  "event_id",
  "sequence",
  "run_id",
  "task_id",
  "parent_task_id",
  "agent",
  "event_type",
  "timestamp",
  "summary",
  "tool_or_command",
  "permission_decision",
  "files_read",
  "files_written",
  "evidence_refs",
  "verification",
  "status",
  "risk",
  "termination_reason",
  "hypothesis",
  "expected_observation",
  "actual_observation",
  "context_snapshot",
  "verifier_codes",
  "strategy_id",
  "finding",
  "truncation",
]);
const EVENT_V2_REQUIRED_KEYS = Object.freeze(EVENT_V2_KEYS.filter((key) => key !== "finding"));
const EVENT_V1_KEYS = Object.freeze([
  "schema_version",
  "run_id",
  "task_id",
  "parent_task_id",
  "agent",
  "event_type",
  "timestamp",
  "summary",
  "tool_or_command",
  "permission_decision",
  "files_read",
  "files_written",
  "evidence_refs",
  "verification",
  "token_or_cost_hint",
  "status",
  "termination_reason",
  "risk",
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function snapshot(value) {
  return deepFreeze(clone(value));
}

function exact(value, allowed, required, label) {
  // Trace envelopes intentionally nest bounded checks/evidence one level deeper
  // than the generic privacy default. Exact-key validators below still close
  // every persisted shape; this scan exists to reject raw sensitive fields at
  // any supported envelope depth.
  assertNoForbiddenPersistenceKeys(value, { label, maxDepth: 8 });
  return assertExactKeys(value, { allowed, required }, label);
}

function clockTimestamp(clock) {
  const raw = clock();
  const timestamp = raw instanceof Date ? raw.toISOString() : raw;
  return assertIsoTimestamp(timestamp, "clock result");
}

function generatedId(idFactory, kind) {
  return assertSafePersistenceId(idFactory(kind), `${kind} id`);
}

function nullableId(value, label) {
  if (value === null || value === undefined) return null;
  return assertSafePersistenceId(value, label);
}

function sanitizedText(value, label, { maxLength = DEFAULT_LIMITS.string, nullable = false } = {}) {
  return sanitizeBoundedString(value, { label, maxLength, nullable });
}

function sanitizedIdText(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return { value: null, metadata: emptyTextMetadata() };
  assertSafePersistenceId(value, label);
  return { value, metadata: textMetadata(value) };
}

function emptyTextMetadata() {
  return { truncated: false, original_length: 0, stored_length: 0, redactions: [] };
}

function textMetadata(value) {
  return { truncated: false, original_length: value.length, stored_length: value.length, redactions: [] };
}

function arrayMetadata(originalLength, storedLength, itemMetadata = []) {
  return {
    truncated: originalLength > storedLength || itemMetadata.some((item) => item.truncated),
    original_length: originalLength,
    stored_length: storedLength,
    items: itemMetadata,
  };
}

function sanitizeStringList(value, label, { maxItems = DEFAULT_LIMITS.array, maxLength = DEFAULT_LIMITS.string } = {}) {
  if (!Array.isArray(value)) throw new ContractError("TRACE_ARRAY", `${label} must be an array`);
  const values = [];
  const metadata = [];
  for (const [index, item] of value.slice(0, maxItems).entries()) {
    const safe = sanitizedText(item, `${label}[${index}]`, { maxLength });
    values.push(safe.value);
    metadata.push(safe.metadata);
  }
  return { value: values, metadata: arrayMetadata(value.length, values.length, metadata) };
}

function sanitizeIdList(value, label, { maxItems = DEFAULT_LIMITS.array } = {}) {
  if (!Array.isArray(value)) throw new ContractError("TRACE_ARRAY", `${label} must be an array`);
  const values = value.slice(0, maxItems).map((item, index) => assertSafePersistenceId(item, `${label}[${index}]`));
  return { value: values, metadata: arrayMetadata(value.length, values.length) };
}

function sanitizePathList(value, label, { maxItems = DEFAULT_LIMITS.array } = {}) {
  if (!Array.isArray(value)) throw new ContractError("TRACE_ARRAY", `${label} must be an array`);
  const paths = value.slice(0, maxItems).map((item, index) => normalizeRelativePath(item, `${label}[${index}]`));
  return { value: paths, metadata: arrayMetadata(value.length, paths.length) };
}

function sanitizeFileSummaries(value, label) {
  if (!Array.isArray(value)) throw new ContractError("TRACE_FILES", `${label} must be an array`);
  const items = [];
  const metadata = [];
  for (const [index, item] of value.slice(0, DEFAULT_LIMITS.array).entries()) {
    exact(item, ["path", "summary"], ["path", "summary"], `${label}[${index}]`);
    const summary = sanitizedText(item.summary, `${label}[${index}].summary`, { maxLength: 240 });
    items.push({ path: normalizeRelativePath(item.path, `${label}[${index}].path`), summary: summary.value });
    metadata.push(summary.metadata);
  }
  return { value: items, metadata: arrayMetadata(value.length, items.length, metadata) };
}

function sanitizeEvidenceRefs(value, label) {
  if (!Array.isArray(value)) throw new ContractError("TRACE_EVIDENCE", `${label} must be an array`);
  const refs = [];
  const metadata = [];
  for (const [index, item] of value.slice(0, DEFAULT_LIMITS.array).entries()) {
    exact(item, ["kind", "value"], ["kind", "value"], `${label}[${index}]`);
    const kind = assertEnum(item.kind, EVIDENCE_KINDS, `${label}[${index}].kind`);
    if (kind === "file") {
      const normalized = normalizeRelativePath(item.value, `${label}[${index}].value`);
      refs.push({ kind, value: normalized });
      metadata.push(textMetadata(normalized));
    } else {
      const safe = sanitizedText(item.value, `${label}[${index}].value`, { maxLength: 500 });
      if (kind === "url" && safe.value === "[redacted]") {
        throw new ContractError("TRACE_EVIDENCE_URL", `${label}[${index}].value contains sensitive URL data`);
      }
      if (kind === "url") {
        let url;
        try {
          url = new URL(safe.value);
        } catch {
          throw new ContractError("TRACE_EVIDENCE_URL", `${label}[${index}].value must be an absolute HTTP(S) URL`);
        }
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
          throw new ContractError("TRACE_EVIDENCE_URL", `${label}[${index}].value must not contain credentials or query data`);
        }
      } else {
        assertSafePersistenceId(safe.value, `${label}[${index}].value`);
      }
      refs.push({ kind, value: safe.value });
      metadata.push(safe.metadata);
    }
  }
  return { value: refs, metadata: arrayMetadata(value.length, refs.length, metadata) };
}

function sanitizeEventVerification(value, label) {
  if (value === null || value === undefined) return { value: null, metadata: { truncated: false } };
  exact(value, ["status", "summary", "verifier_codes"], ["status", "summary", "verifier_codes"], label);
  const summary = sanitizedText(value.summary, `${label}.summary`, { maxLength: 300 });
  const codes = sanitizeIdList(value.verifier_codes, `${label}.verifier_codes`);
  return {
    value: {
      status: assertEnum(value.status, VERIFICATION_STATUSES, `${label}.status`),
      summary: summary.value,
      verifier_codes: codes.value,
    },
    metadata: { truncated: summary.metadata.truncated || codes.metadata.truncated, summary: summary.metadata, verifier_codes: codes.metadata },
  };
}

function sanitizeContextSnapshot(value, label) {
  if (value === null || value === undefined) return { value: null, metadata: { truncated: false } };
  exact(value, ["snapshot_id", "fingerprint", "stale"], ["snapshot_id", "fingerprint", "stale"], label);
  if (typeof value.stale !== "boolean") throw new ContractError("TRACE_CONTEXT_STALE", `${label}.stale must be boolean`);
  const fingerprint = sanitizedText(value.fingerprint, `${label}.fingerprint`, { maxLength: 200 });
  return {
    value: { snapshot_id: assertSafePersistenceId(value.snapshot_id, `${label}.snapshot_id`), fingerprint: fingerprint.value, stale: value.stale },
    metadata: { truncated: fingerprint.metadata.truncated, fingerprint: fingerprint.metadata },
  };
}

function sanitizeFinding(value, eventType, label = "event.finding") {
  if (eventType !== "review_finding") {
    if (value !== null && value !== undefined) throw new ContractError("TRACE_FINDING_UNEXPECTED", `${label} is only valid for review_finding events`);
    return null;
  }
  if (value === null || value === undefined) throw new ContractError("TRACE_FINDING_REQUIRED", "review_finding requires structured finding evidence");
  exact(value, ["finding_id", "severity", "file", "start_line", "end_line", "code"], ["finding_id", "severity", "file", "start_line", "end_line", "code"], label);
  if (!Number.isInteger(value.start_line) || value.start_line < 1) throw new ContractError("TRACE_FINDING_LINE", `${label}.start_line must be a positive integer`);
  if (!Number.isInteger(value.end_line) || value.end_line < value.start_line) throw new ContractError("TRACE_FINDING_LINE", `${label}.end_line must be at least start_line`);
  return {
    finding_id: assertSafePersistenceId(value.finding_id, `${label}.finding_id`),
    severity: assertEnum(value.severity, FINDING_SEVERITIES, `${label}.severity`),
    file: normalizeRelativePath(value.file, `${label}.file`),
    start_line: value.start_line,
    end_line: value.end_line,
    code: assertSafePersistenceId(value.code, `${label}.code`),
  };
}

function sanitizeModelParameters(value) {
  if (value === null || value === undefined) return null;
  exact(
    value,
    ["temperature", "top_p", "max_tokens", "seed", "reasoning_effort"],
    [],
    "run.model_parameters",
  );
  const result = {};
  for (const key of ["temperature", "top_p"]) {
    if (Object.hasOwn(value, key)) {
      if (typeof value[key] !== "number" || !Number.isFinite(value[key])) {
        throw new ContractError("TRACE_MODEL_PARAMETER", `run.model_parameters.${key} must be finite`);
      }
      result[key] = value[key];
    }
  }
  for (const key of ["max_tokens", "seed"]) {
    if (Object.hasOwn(value, key)) {
      if (!Number.isInteger(value[key]) || value[key] < 0) {
        throw new ContractError("TRACE_MODEL_PARAMETER", `run.model_parameters.${key} must be a non-negative integer`);
      }
      result[key] = value[key];
    }
  }
  if (Object.hasOwn(value, "reasoning_effort")) {
    result.reasoning_effort = assertEnum(value.reasoning_effort, ["low", "medium", "high"], "run.model_parameters.reasoning_effort");
  }
  return result;
}

function buildRun(input, { clock, idFactory }) {
  exact(input, RUN_INPUT_KEYS, [], "run");
  const runId = input.run_id === undefined ? generatedId(idFactory, "run") : assertSafePersistenceId(input.run_id, "run.run_id");
  const unavailableInput = input.unavailable_metadata ?? [];
  if (!Array.isArray(unavailableInput) || unavailableInput.some((field) => !UNAVAILABLE_FIELDS.includes(field))) {
    throw new ContractError("TRACE_UNAVAILABLE", "run.unavailable_metadata contains an unsupported field");
  }
  const unavailable = new Set(unavailableInput);
  for (const field of UNAVAILABLE_FIELDS) {
    if (input[field] === undefined || input[field] === null) unavailable.add(field);
    else if (unavailable.has(field)) throw new ContractError("TRACE_UNAVAILABLE", `run.${field} is both available and unavailable`);
  }

  const scenario = input.scenario_id == null ? { value: null, metadata: emptyTextMetadata() } : sanitizedIdText(input.scenario_id, "run.scenario_id");
  const profile = input.profile_role == null ? { value: null, metadata: emptyTextMetadata() } : sanitizedIdText(input.profile_role, "run.profile_role");
  const harness = sanitizedText(input.harness_fingerprint ?? null, "run.harness_fingerprint", { maxLength: 200, nullable: true });
  const model = sanitizedText(input.model ?? null, "run.model", { maxLength: 200, nullable: true });
  const taskClass = sanitizedText(input.task_class ?? null, "run.task_class", { maxLength: 100, nullable: true });
  const strategy = input.strategy_id == null ? { value: null, metadata: emptyTextMetadata() } : sanitizedIdText(input.strategy_id, "run.strategy_id");
  const modelParameters = sanitizeModelParameters(input.model_parameters);

  return {
    schema_version: TRACE_SCHEMA_VERSION,
    run_id: runId,
    parent_run_id: nullableId(input.parent_run_id, "run.parent_run_id"),
    scenario_id: scenario.value,
    profile_role: profile.value,
    harness_fingerprint: harness.value,
    model: model.value,
    model_parameters: modelParameters,
    task_class: taskClass.value,
    strategy_id: strategy.value,
    risk: assertEnum(input.risk ?? "standard", RISK_LEVELS, "run.risk"),
    started_at: clockTimestamp(clock),
    completed_at: null,
    final_status: null,
    termination_reason: null,
    lifecycle: "active",
    unavailable_metadata: [...unavailable].sort(),
    truncation: {
      scenario_id: scenario.metadata,
      profile_role: profile.metadata,
      harness_fingerprint: harness.metadata,
      model: model.metadata,
      task_class: taskClass.metadata,
      strategy_id: strategy.metadata,
    },
  };
}

function buildEvent(run, input, events, { clock, idFactory }) {
  exact(input, EVENT_INPUT_KEYS, EVENT_REQUIRED_KEYS, "event");
  const eventType = assertEnum(input.event_type, EVENT_TYPES_V2, "event.event_type");
  const summary = sanitizedText(input.summary, "event.summary", { maxLength: DEFAULT_LIMITS.summary });
  const tool = sanitizedText(input.tool_or_command ?? null, "event.tool_or_command", { maxLength: 200, nullable: true });
  if (tool.value !== null) assertSafePersistenceId(tool.value, "event.tool_or_command");
  const filesRead = sanitizeFileSummaries(input.files_read ?? [], "event.files_read");
  const filesWritten = sanitizeFileSummaries(input.files_written ?? [], "event.files_written");
  const evidence = sanitizeEvidenceRefs(input.evidence_refs ?? [], "event.evidence_refs");
  const verification = sanitizeEventVerification(input.verification ?? null, "event.verification");
  const hypothesis = sanitizedText(input.hypothesis ?? null, "event.hypothesis", { maxLength: 500, nullable: true });
  const expected = sanitizedText(input.expected_observation ?? null, "event.expected_observation", { maxLength: 500, nullable: true });
  const actual = sanitizedText(input.actual_observation ?? null, "event.actual_observation", { maxLength: 500, nullable: true });
  const context = sanitizeContextSnapshot(input.context_snapshot ?? null, "event.context_snapshot");
  const codes = sanitizeIdList(input.verifier_codes ?? [], "event.verifier_codes");
  const strategy = input.strategy_id === undefined ? run.strategy_id : nullableId(input.strategy_id, "event.strategy_id");
  const finding = sanitizeFinding(input.finding ?? null, eventType);
  const terminationReason = input.termination_reason ?? null;
  if (eventType === "task_end" && terminationReason === null) {
    throw new ContractError("TRACE_TASK_END", "task_end requires termination_reason");
  }
  if (terminationReason !== null) assertEnum(terminationReason, TERMINATION_REASONS, "event.termination_reason");

  const eventId = generatedId(idFactory, "event");
  if (events.some((event) => event.schema_version === 2 && event.event_id === eventId)) {
    throw new ContractError("TRACE_EVENT_DUPLICATE", `duplicate event_id: ${eventId}`);
  }
  return {
    schema_version: TRACE_SCHEMA_VERSION,
    event_id: eventId,
    sequence: events.length + 1,
    run_id: run.run_id,
    task_id: assertSafePersistenceId(input.task_id, "event.task_id"),
    parent_task_id: nullableId(input.parent_task_id, "event.parent_task_id"),
    agent: assertSafePersistenceId(input.agent, "event.agent"),
    event_type: eventType,
    timestamp: clockTimestamp(clock),
    summary: summary.value,
    tool_or_command: tool.value,
    permission_decision: assertEnum(input.permission_decision ?? "not_applicable", PERMISSION_DECISIONS, "event.permission_decision"),
    files_read: filesRead.value,
    files_written: filesWritten.value,
    evidence_refs: evidence.value,
    verification: verification.value,
    status: assertEnum(input.status, TRACE_STATUSES, "event.status"),
    risk: assertEnum(input.risk ?? run.risk, RISK_LEVELS, "event.risk"),
    termination_reason: terminationReason,
    hypothesis: hypothesis.value,
    expected_observation: expected.value,
    actual_observation: actual.value,
    context_snapshot: context.value,
    verifier_codes: codes.value,
    strategy_id: strategy,
    finding,
    truncation: {
      summary: summary.metadata,
      tool_or_command: tool.metadata,
      files_read: filesRead.metadata,
      files_written: filesWritten.metadata,
      evidence_refs: evidence.metadata,
      verification: verification.metadata,
      hypothesis: hypothesis.metadata,
      expected_observation: expected.metadata,
      actual_observation: actual.metadata,
      context_snapshot: context.metadata,
      verifier_codes: codes.metadata,
    },
  };
}

function assertSafeStoredText(value, label, { nullable = false, maxLength = DEFAULT_LIMITS.string } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new ContractError("TRACE_STORED_STRING", `${label} is not a bounded string`);
  }
  if (value !== "[redacted]" && sensitiveTextReasons(value).length > 0) {
    throw new ContractError("TRACE_STORED_SENSITIVE", `${label} contains unsafe persisted text`);
  }
}

function validateTruncation(value, allowed, label) {
  exact(value, allowed, allowed, label);
  for (const [key, metadata] of Object.entries(value)) {
    assertPlainObject(metadata, `${label}.${key}`);
    assertNoForbiddenPersistenceKeys(metadata, { label: `${label}.${key}`, maxDepth: 8 });
    validateSafeMetadata(metadata, `${label}.${key}`);
  }
}

function validateSafeMetadata(value, label, depth = 0) {
  if (depth > 8) throw new ContractError("TRACE_METADATA_DEPTH", `${label} exceeds the metadata depth bound`);
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value === "string") {
    if (["secret_assignment", "private_key_marker", "sensitive_marker", "absolute_path", "max_depth"].includes(value)) return;
    assertSafeStoredText(value, label, { maxLength: DEFAULT_LIMITS.string });
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > DEFAULT_LIMITS.array) throw new ContractError("TRACE_METADATA_ARRAY", `${label} exceeds the metadata array bound`);
    value.forEach((item, index) => validateSafeMetadata(item, `${label}[${index}]`, depth + 1));
    return;
  }
  assertPlainObject(value, label);
  if (Object.keys(value).length > DEFAULT_LIMITS.objectKeys) throw new ContractError("TRACE_METADATA_OBJECT", `${label} exceeds the metadata object bound`);
  for (const [key, nested] of Object.entries(value)) validateSafeMetadata(nested, `${label}.${key}`, depth + 1);
}

function validateStoredFileSummaries(value, label) {
  if (!Array.isArray(value) || value.length > DEFAULT_LIMITS.array) throw new ContractError("TRACE_FILES", `${label} is invalid`);
  for (const [index, item] of value.entries()) {
    exact(item, ["path", "summary"], ["path", "summary"], `${label}[${index}]`);
    if (normalizeRelativePath(item.path, `${label}[${index}].path`) !== item.path) throw new ContractError("TRACE_PATH_NORMALIZATION", `${label}[${index}].path is not normalized`);
    assertSafeStoredText(item.summary, `${label}[${index}].summary`, { maxLength: 240 });
  }
}

function validateStoredEvidenceRefs(value, label) {
  if (!Array.isArray(value) || value.length > DEFAULT_LIMITS.array) throw new ContractError("TRACE_EVIDENCE", `${label} is invalid`);
  for (const [index, item] of value.entries()) {
    exact(item, ["kind", "value"], ["kind", "value"], `${label}[${index}]`);
    assertEnum(item.kind, EVIDENCE_KINDS, `${label}[${index}].kind`);
    if (item.kind === "file") {
      if (normalizeRelativePath(item.value, `${label}[${index}].value`) !== item.value) throw new ContractError("TRACE_PATH_NORMALIZATION", `${label}[${index}].value is not normalized`);
    } else {
      assertSafeStoredText(item.value, `${label}[${index}].value`, { maxLength: 500 });
      if (item.kind === "url") {
        let url;
        try {
          url = new URL(item.value);
        } catch {
          throw new ContractError("TRACE_EVIDENCE_URL", `${label}[${index}].value is not a valid URL`);
        }
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new ContractError("TRACE_EVIDENCE_URL", `${label}[${index}].value is unsafe`);
      } else {
        assertSafePersistenceId(item.value, `${label}[${index}].value`);
      }
    }
  }
}

function validateStoredEventVerification(value, label) {
  if (value === null) return;
  exact(value, ["status", "summary", "verifier_codes"], ["status", "summary", "verifier_codes"], label);
  assertEnum(value.status, VERIFICATION_STATUSES, `${label}.status`);
  assertSafeStoredText(value.summary, `${label}.summary`, { maxLength: 300 });
  if (!Array.isArray(value.verifier_codes) || value.verifier_codes.length > DEFAULT_LIMITS.array) throw new ContractError("TRACE_VERIFIER_CODES", `${label}.verifier_codes is invalid`);
  value.verifier_codes.forEach((code, index) => assertSafePersistenceId(code, `${label}.verifier_codes[${index}]`));
}

function validateStoredContextSnapshot(value, label) {
  if (value === null) return;
  exact(value, ["snapshot_id", "fingerprint", "stale"], ["snapshot_id", "fingerprint", "stale"], label);
  assertSafePersistenceId(value.snapshot_id, `${label}.snapshot_id`);
  assertSafeStoredText(value.fingerprint, `${label}.fingerprint`, { maxLength: 200 });
  if (typeof value.stale !== "boolean") throw new ContractError("TRACE_CONTEXT_STALE", `${label}.stale must be boolean`);
}

function validateStoredFinding(value, eventType, label) {
  // `finding` was added compatibly to trace v2: old persisted v2 events may
  // omit it, but every new producer writes either a structured object or null.
  if (eventType !== "review_finding") {
    if (value !== undefined && value !== null) throw new ContractError("TRACE_FINDING_UNEXPECTED", `${label} is only valid for review_finding events`);
    return;
  }
  if (value === undefined) return;
  if (value === null) throw new ContractError("TRACE_FINDING_REQUIRED", "stored review_finding lacks structured finding evidence");
  const normalized = sanitizeFinding(value, eventType, label);
  if (canonicalJson(normalized) !== canonicalJson(value)) throw new ContractError("TRACE_FINDING", `${label} is not normalized`);
}

function validateV2Event(event, runId) {
  exact(event, EVENT_V2_KEYS, EVENT_V2_REQUIRED_KEYS, "stored event");
  if (event.schema_version !== TRACE_SCHEMA_VERSION) throw new ContractError("TRACE_SCHEMA", "stored event is not schema v2");
  assertSafePersistenceId(event.event_id, "stored event.event_id");
  if (!Number.isInteger(event.sequence) || event.sequence < 1) throw new ContractError("TRACE_SEQUENCE", "stored event.sequence must be positive");
  if (event.run_id !== runId) throw new ContractError("TRACE_RUN_MISMATCH", "stored event.run_id does not match run");
  assertSafePersistenceId(event.task_id, "stored event.task_id");
  nullableId(event.parent_task_id, "stored event.parent_task_id");
  assertSafePersistenceId(event.agent, "stored event.agent");
  assertEnum(event.event_type, EVENT_TYPES_V2, "stored event.event_type");
  assertIsoTimestamp(event.timestamp, "stored event.timestamp");
  assertSafeStoredText(event.summary, "stored event.summary", { maxLength: DEFAULT_LIMITS.summary });
  assertSafeStoredText(event.tool_or_command, "stored event.tool_or_command", { nullable: true, maxLength: 200 });
  if (event.tool_or_command !== null) assertSafePersistenceId(event.tool_or_command, "stored event.tool_or_command");
  assertEnum(event.permission_decision, PERMISSION_DECISIONS, "stored event.permission_decision");
  validateStoredFileSummaries(event.files_read, "stored event.files_read");
  validateStoredFileSummaries(event.files_written, "stored event.files_written");
  validateStoredEvidenceRefs(event.evidence_refs, "stored event.evidence_refs");
  validateStoredEventVerification(event.verification, "stored event.verification");
  assertEnum(event.status, TRACE_STATUSES, "stored event.status");
  assertEnum(event.risk, RISK_LEVELS, "stored event.risk");
  if (event.termination_reason !== null) assertEnum(event.termination_reason, TERMINATION_REASONS, "stored event.termination_reason");
  if (event.event_type === "task_end" && event.termination_reason === null) throw new ContractError("TRACE_TASK_END", "stored task_end lacks termination_reason");
  for (const key of ["hypothesis", "expected_observation", "actual_observation"]) {
    assertSafeStoredText(event[key], `stored event.${key}`, { nullable: true, maxLength: 500 });
  }
  validateStoredContextSnapshot(event.context_snapshot, "stored event.context_snapshot");
  if (!Array.isArray(event.verifier_codes) || event.verifier_codes.length > DEFAULT_LIMITS.array) throw new ContractError("TRACE_VERIFIER_CODES", "stored event.verifier_codes is invalid");
  event.verifier_codes.forEach((code, index) => assertSafePersistenceId(code, `stored event.verifier_codes[${index}]`));
  nullableId(event.strategy_id, "stored event.strategy_id");
  validateStoredFinding(event.finding, event.event_type, "stored event.finding");
  validateTruncation(event.truncation, [
    "summary",
    "tool_or_command",
    "files_read",
    "files_written",
    "evidence_refs",
    "verification",
    "hypothesis",
    "expected_observation",
    "actual_observation",
    "context_snapshot",
    "verifier_codes",
  ], "stored event.truncation");
  return event;
}

function validateV1Event(event, runId) {
  exact(event, EVENT_V1_KEYS, EVENT_V1_KEYS, "legacy event");
  if (event.schema_version !== 1) throw new ContractError("TRACE_SCHEMA", "legacy event schema_version must be 1");
  if (event.run_id !== runId) throw new ContractError("TRACE_RUN_MISMATCH", "legacy event.run_id does not match run");
  assertSafePersistenceId(event.task_id, "legacy event.task_id");
  nullableId(event.parent_task_id, "legacy event.parent_task_id");
  assertSafePersistenceId(event.agent, "legacy event.agent");
  assertEnum(event.event_type, EVENT_TYPES_V1, "legacy event.event_type");
  assertIsoTimestamp(event.timestamp, "legacy event.timestamp");
  assertSafeStoredText(event.summary, "legacy event.summary", { maxLength: DEFAULT_LIMITS.summary });
  assertSafeStoredText(event.tool_or_command, "legacy event.tool_or_command", { nullable: true, maxLength: 200 });
  assertSafePersistenceId(event.permission_decision, "legacy event.permission_decision");
  for (const field of ["files_read", "files_written"]) {
    if (!Array.isArray(event[field]) || event[field].length > DEFAULT_LIMITS.array) throw new ContractError("TRACE_LEGACY_ARRAY", `legacy event.${field} is invalid`);
    for (const [index, item] of event[field].entries()) {
      if (normalizeRelativePath(item, `legacy event.${field}[${index}]`) !== item.replaceAll("\\", "/")) throw new ContractError("TRACE_PATH_NORMALIZATION", `legacy event.${field}[${index}] is unsafe`);
    }
  }
  if (!Array.isArray(event.evidence_refs) || event.evidence_refs.length > DEFAULT_LIMITS.array) throw new ContractError("TRACE_LEGACY_ARRAY", "legacy event.evidence_refs is invalid");
  event.evidence_refs.forEach((item, index) => assertSafeStoredText(item, `legacy event.evidence_refs[${index}]`, { maxLength: 500 }));
  assertSafeStoredText(event.verification, "legacy event.verification", { nullable: true, maxLength: 500 });
  if (!(event.token_or_cost_hint === null || typeof event.token_or_cost_hint === "number" || typeof event.token_or_cost_hint === "string")) {
    throw new ContractError("TRACE_LEGACY_COST", "legacy event.token_or_cost_hint is invalid");
  }
  if (typeof event.token_or_cost_hint === "string") assertSafeStoredText(event.token_or_cost_hint, "legacy event.token_or_cost_hint", { maxLength: 200 });
  assertEnum(event.status, TRACE_STATUSES, "legacy event.status");
  if (event.termination_reason !== null) assertEnum(event.termination_reason, TERMINATION_REASONS, "legacy event.termination_reason");
  assertSafePersistenceId(event.risk, "legacy event.risk");
  return event;
}

function validateEvents(events, runId) {
  const versions = new Set(events.map((event) => event?.schema_version));
  if ([...versions].some((version) => ![1, 2].includes(version))) throw new ContractError("TRACE_SCHEMA", "events contain an unsupported schema version");
  if (versions.size > 1) throw new ContractError("TRACE_MIXED_SCHEMA", "events.jsonl must not mix trace schema versions");
  if (versions.has(1)) {
    events.forEach((event) => validateV1Event(event, runId));
    return { legacy: true };
  }
  const ids = new Set();
  events.forEach((event, index) => {
    validateV2Event(event, runId);
    if (event.sequence !== index + 1) throw new ContractError("TRACE_SEQUENCE", `event sequence must be contiguous at ${index + 1}`);
    if (ids.has(event.event_id)) throw new ContractError("TRACE_EVENT_DUPLICATE", `duplicate event_id: ${event.event_id}`);
    ids.add(event.event_id);
  });
  return { legacy: false };
}

function validateRun(run) {
  const keys = [
    "schema_version", "run_id", "parent_run_id", "scenario_id", "profile_role", "harness_fingerprint", "model",
    "model_parameters", "task_class", "strategy_id", "risk", "started_at", "completed_at", "final_status",
    "termination_reason", "lifecycle", "unavailable_metadata", "truncation",
  ];
  exact(run, keys, keys, "stored run");
  if (run.schema_version !== TRACE_SCHEMA_VERSION) throw new ContractError("TRACE_RUN_SCHEMA", "run.json must use schema v2");
  assertSafePersistenceId(run.run_id, "stored run.run_id");
  nullableId(run.parent_run_id, "stored run.parent_run_id");
  for (const field of ["scenario_id", "profile_role", "strategy_id"]) nullableId(run[field], `stored run.${field}`);
  for (const field of ["harness_fingerprint", "model", "task_class"]) assertSafeStoredText(run[field], `stored run.${field}`, { nullable: true, maxLength: 200 });
  sanitizeModelParameters(run.model_parameters);
  assertEnum(run.risk, RISK_LEVELS, "stored run.risk");
  assertIsoTimestamp(run.started_at, "stored run.started_at");
  if (run.completed_at !== null) assertIsoTimestamp(run.completed_at, "stored run.completed_at");
  if (run.final_status !== null) assertEnum(run.final_status, TRACE_STATUSES, "stored run.final_status");
  if (run.termination_reason !== null) assertEnum(run.termination_reason, TERMINATION_REASONS, "stored run.termination_reason");
  assertEnum(run.lifecycle, ["active", "final"], "stored run.lifecycle");
  if (run.lifecycle === "active" && (run.completed_at !== null || run.final_status !== null || run.termination_reason !== null)) throw new ContractError("TRACE_RUN_STATE", "active run contains final fields");
  if (run.lifecycle === "final" && (run.completed_at === null || run.final_status === null || run.termination_reason === null)) throw new ContractError("TRACE_RUN_STATE", "final run is missing final fields");
  if (!Array.isArray(run.unavailable_metadata) || run.unavailable_metadata.some((field) => !UNAVAILABLE_FIELDS.includes(field))) throw new ContractError("TRACE_UNAVAILABLE", "stored run.unavailable_metadata is invalid");
  if (new Set(run.unavailable_metadata).size !== run.unavailable_metadata.length || canonicalJson(run.unavailable_metadata) !== canonicalJson([...run.unavailable_metadata].sort())) throw new ContractError("TRACE_UNAVAILABLE", "stored run.unavailable_metadata must be unique and sorted");
  for (const field of UNAVAILABLE_FIELDS) {
    if ((run[field] === null) !== run.unavailable_metadata.includes(field)) throw new ContractError("TRACE_UNAVAILABLE", `stored run.${field} availability marker is inconsistent`);
  }
  validateTruncation(run.truncation, ["scenario_id", "profile_role", "harness_fingerprint", "model", "task_class", "strategy_id"], "stored run.truncation");
  return run;
}

function buildReceipt(run, input, receipts, { clock, idFactory }) {
  const keys = ["task_id", "source_kind", "summary", "relative_paths", "snapshot_fingerprint"];
  exact(input, keys, keys, "context receipt");
  const summary = sanitizedText(input.summary, "context receipt.summary", { maxLength: DEFAULT_LIMITS.summary });
  const paths = sanitizePathList(input.relative_paths, "context receipt.relative_paths");
  const fingerprint = sanitizedText(input.snapshot_fingerprint, "context receipt.snapshot_fingerprint", { maxLength: 200 });
  const receiptId = generatedId(idFactory, "receipt");
  if (receipts.some((receipt) => receipt.receipt_id === receiptId)) throw new ContractError("TRACE_RECEIPT_DUPLICATE", `duplicate receipt_id: ${receiptId}`);
  return {
    schema_version: TRACE_SCHEMA_VERSION,
    receipt_id: receiptId,
    run_id: run.run_id,
    task_id: assertSafePersistenceId(input.task_id, "context receipt.task_id"),
    timestamp: clockTimestamp(clock),
    source_kind: assertEnum(input.source_kind, CONTEXT_SOURCE_KINDS, "context receipt.source_kind"),
    summary: summary.value,
    relative_paths: paths.value,
    snapshot_fingerprint: fingerprint.value,
    truncation: { summary: summary.metadata, relative_paths: paths.metadata, snapshot_fingerprint: fingerprint.metadata },
  };
}

function validateReceipt(receipt, runId) {
  const keys = ["schema_version", "receipt_id", "run_id", "task_id", "timestamp", "source_kind", "summary", "relative_paths", "snapshot_fingerprint", "truncation"];
  exact(receipt, keys, keys, "stored context receipt");
  if (receipt.schema_version !== TRACE_SCHEMA_VERSION || receipt.run_id !== runId) throw new ContractError("TRACE_RECEIPT_SCHEMA", "stored context receipt has wrong schema or run");
  assertSafePersistenceId(receipt.receipt_id, "stored context receipt.receipt_id");
  assertSafePersistenceId(receipt.task_id, "stored context receipt.task_id");
  assertIsoTimestamp(receipt.timestamp, "stored context receipt.timestamp");
  assertEnum(receipt.source_kind, CONTEXT_SOURCE_KINDS, "stored context receipt.source_kind");
  assertSafeStoredText(receipt.summary, "stored context receipt.summary", { maxLength: DEFAULT_LIMITS.summary });
  if (!Array.isArray(receipt.relative_paths) || receipt.relative_paths.length > DEFAULT_LIMITS.array) throw new ContractError("TRACE_RECEIPT_PATHS", "stored context receipt.relative_paths is invalid");
  receipt.relative_paths.forEach((item, index) => {
    if (normalizeRelativePath(item, `stored context receipt.relative_paths[${index}]`) !== item) throw new ContractError("TRACE_PATH_NORMALIZATION", "stored context receipt path is not normalized");
  });
  assertSafeStoredText(receipt.snapshot_fingerprint, "stored context receipt.snapshot_fingerprint", { maxLength: 200 });
  validateTruncation(receipt.truncation, ["summary", "relative_paths", "snapshot_fingerprint"], "stored context receipt.truncation");
  return receipt;
}

function buildJobRequest(run, input, { clock, idFactory }) {
  const keys = ["task_id", "parent_task_id", "agent", "assigned_scope", "write_scope", "risk"];
  exact(input, keys, ["agent", "assigned_scope"], "job");
  const taskId = input.task_id === undefined ? generatedId(idFactory, "task") : assertSafePersistenceId(input.task_id, "job.task_id");
  const scope = sanitizedText(input.assigned_scope, "job.assigned_scope", { maxLength: DEFAULT_LIMITS.summary });
  const writeScope = sanitizePathList(input.write_scope ?? [], "job.write_scope");
  return {
    schema_version: TRACE_SCHEMA_VERSION,
    run_id: run.run_id,
    task_id: taskId,
    parent_task_id: nullableId(input.parent_task_id, "job.parent_task_id"),
    agent: assertSafePersistenceId(input.agent, "job.agent"),
    assigned_scope: scope.value,
    write_scope: writeScope.value,
    risk: assertEnum(input.risk ?? run.risk, RISK_LEVELS, "job.risk"),
    created_at: clockTimestamp(clock),
    truncation: { assigned_scope: scope.metadata, write_scope: writeScope.metadata },
  };
}

function validateJobRequest(request, runId, taskId) {
  const keys = ["schema_version", "run_id", "task_id", "parent_task_id", "agent", "assigned_scope", "write_scope", "risk", "created_at", "truncation"];
  exact(request, keys, keys, "stored job request");
  if (request.schema_version !== TRACE_SCHEMA_VERSION || request.run_id !== runId || request.task_id !== taskId) throw new ContractError("TRACE_JOB_REQUEST", "stored job request identity mismatch");
  nullableId(request.parent_task_id, "stored job request.parent_task_id");
  assertSafePersistenceId(request.agent, "stored job request.agent");
  assertSafeStoredText(request.assigned_scope, "stored job request.assigned_scope", { maxLength: DEFAULT_LIMITS.summary });
  if (!Array.isArray(request.write_scope) || request.write_scope.length > DEFAULT_LIMITS.array) throw new ContractError("TRACE_JOB_SCOPE", "stored job write_scope is invalid");
  request.write_scope.forEach((item, index) => {
    if (normalizeRelativePath(item, `stored job request.write_scope[${index}]`) !== item) throw new ContractError("TRACE_PATH_NORMALIZATION", "stored job write_scope is not normalized");
  });
  assertEnum(request.risk, RISK_LEVELS, "stored job request.risk");
  assertIsoTimestamp(request.created_at, "stored job request.created_at");
  validateTruncation(request.truncation, ["assigned_scope", "write_scope"], "stored job request.truncation");
  return request;
}

function buildJobStatus(runId, taskId, state, timestamp, startedAt = null) {
  return {
    schema_version: TRACE_SCHEMA_VERSION,
    run_id: runId,
    task_id: taskId,
    state,
    started_at: startedAt,
    updated_at: timestamp,
  };
}

function validateJobStatus(status, runId, taskId) {
  const keys = ["schema_version", "run_id", "task_id", "state", "started_at", "updated_at"];
  exact(status, keys, keys, "stored job status");
  if (status.schema_version !== TRACE_SCHEMA_VERSION || status.run_id !== runId || status.task_id !== taskId) throw new ContractError("TRACE_JOB_STATUS", "stored job status identity mismatch");
  assertEnum(status.state, JOB_STATES, "stored job status.state");
  if (status.started_at !== null) assertIsoTimestamp(status.started_at, "stored job status.started_at");
  assertIsoTimestamp(status.updated_at, "stored job status.updated_at");
  if (status.state === "running" && status.started_at === null) throw new ContractError("TRACE_JOB_STATUS", "running job status must preserve started_at");
  if (status.started_at !== null && Date.parse(status.updated_at) < Date.parse(status.started_at)) throw new ContractError("TRACE_JOB_STATUS", "job status updated_at precedes started_at");
  return status;
}

function sanitizeJobResult(runId, taskId, result, completedAt) {
  const keys = ["status", "assigned_scope", "summary", "evidence", "files_changed", "verification", "decision_unblocked", "uncertainty", "risks", "next_step", "termination_reason"];
  exact(result, keys, keys, "job result");
  const assignedScope = sanitizedText(result.assigned_scope, "job result.assigned_scope", { maxLength: DEFAULT_LIMITS.summary });
  const summary = sanitizedText(result.summary, "job result.summary", { maxLength: DEFAULT_LIMITS.summary });
  const evidence = sanitizeStringList(result.evidence, "job result.evidence", { maxLength: 500 });
  const filesChanged = sanitizePathList(result.files_changed, "job result.files_changed");
  const verification = sanitizedText(result.verification, "job result.verification", { maxLength: DEFAULT_LIMITS.summary });
  const decision = sanitizedText(result.decision_unblocked, "job result.decision_unblocked", { maxLength: DEFAULT_LIMITS.summary });
  const uncertainty = sanitizedText(result.uncertainty, "job result.uncertainty", { maxLength: DEFAULT_LIMITS.summary });
  const risks = sanitizeStringList(result.risks, "job result.risks", { maxLength: 300 });
  const nextStep = sanitizedText(result.next_step, "job result.next_step", { maxLength: DEFAULT_LIMITS.summary });
  return {
    schema_version: TRACE_SCHEMA_VERSION,
    run_id: runId,
    task_id: taskId,
    completed_at: completedAt,
    status: assertEnum(result.status, TRACE_STATUSES, "job result.status"),
    assigned_scope: assignedScope.value,
    summary: summary.value,
    evidence: evidence.value,
    files_changed: filesChanged.value,
    verification: verification.value,
    decision_unblocked: decision.value,
    uncertainty: uncertainty.value,
    risks: risks.value,
    next_step: nextStep.value,
    termination_reason: assertEnum(result.termination_reason, TERMINATION_REASONS, "job result.termination_reason"),
    truncation: {
      assigned_scope: assignedScope.metadata,
      summary: summary.metadata,
      evidence: evidence.metadata,
      files_changed: filesChanged.metadata,
      verification: verification.metadata,
      decision_unblocked: decision.metadata,
      uncertainty: uncertainty.metadata,
      risks: risks.metadata,
      next_step: nextStep.metadata,
    },
  };
}

function validateJobResult(result, runId, taskId) {
  const keys = ["schema_version", "run_id", "task_id", "completed_at", "status", "assigned_scope", "summary", "evidence", "files_changed", "verification", "decision_unblocked", "uncertainty", "risks", "next_step", "termination_reason", "truncation"];
  exact(result, keys, keys, "stored job result");
  if (result.schema_version !== TRACE_SCHEMA_VERSION || result.run_id !== runId || result.task_id !== taskId) throw new ContractError("TRACE_JOB_RESULT", "stored job result identity mismatch");
  assertIsoTimestamp(result.completed_at, "stored job result.completed_at");
  assertEnum(result.status, TRACE_STATUSES, "stored job result.status");
  for (const field of ["assigned_scope", "summary", "verification", "decision_unblocked", "uncertainty", "next_step"]) assertSafeStoredText(result[field], `stored job result.${field}`, { maxLength: DEFAULT_LIMITS.summary });
  for (const field of ["evidence", "risks"]) {
    if (!Array.isArray(result[field]) || result[field].length > DEFAULT_LIMITS.array) throw new ContractError("TRACE_JOB_RESULT", `stored job result.${field} is invalid`);
    result[field].forEach((item, index) => assertSafeStoredText(item, `stored job result.${field}[${index}]`, { maxLength: 500 }));
  }
  if (!Array.isArray(result.files_changed) || result.files_changed.length > DEFAULT_LIMITS.array) throw new ContractError("TRACE_JOB_RESULT", "stored job result.files_changed is invalid");
  result.files_changed.forEach((item, index) => {
    if (normalizeRelativePath(item, `stored job result.files_changed[${index}]`) !== item) throw new ContractError("TRACE_PATH_NORMALIZATION", "stored job result.files_changed is not normalized");
  });
  assertEnum(result.termination_reason, TERMINATION_REASONS, "stored job result.termination_reason");
  validateTruncation(result.truncation, ["assigned_scope", "summary", "evidence", "files_changed", "verification", "decision_unblocked", "uncertainty", "risks", "next_step"], "stored job result.truncation");
  return result;
}

function sanitizeVerificationArtifact(runId, input, timestamp) {
  const keys = ["status", "summary", "checks", "evidence_refs", "incomplete_reasons"];
  exact(input, keys, keys, "verification");
  const summary = sanitizedText(input.summary, "verification.summary", { maxLength: DEFAULT_LIMITS.summary });
  const evidence = sanitizeEvidenceRefs(input.evidence_refs, "verification.evidence_refs");
  const incomplete = sanitizeStringList(input.incomplete_reasons, "verification.incomplete_reasons", { maxLength: 300 });
  if (!Array.isArray(input.checks)) throw new ContractError("TRACE_CHECKS", "verification.checks must be an array");
  const checks = [];
  const checkMetadata = [];
  for (const [index, check] of input.checks.slice(0, DEFAULT_LIMITS.array).entries()) {
    exact(check, ["code", "status", "summary", "evidence_refs"], ["code", "status", "summary", "evidence_refs"], `verification.checks[${index}]`);
    const checkSummary = sanitizedText(check.summary, `verification.checks[${index}].summary`, { maxLength: 300 });
    const checkEvidence = sanitizeEvidenceRefs(check.evidence_refs, `verification.checks[${index}].evidence_refs`);
    checks.push({
      code: assertSafePersistenceId(check.code, `verification.checks[${index}].code`),
      status: assertEnum(check.status, VERIFICATION_STATUSES, `verification.checks[${index}].status`),
      summary: checkSummary.value,
      evidence_refs: checkEvidence.value,
    });
    checkMetadata.push({ truncated: checkSummary.metadata.truncated || checkEvidence.metadata.truncated, summary: checkSummary.metadata, evidence_refs: checkEvidence.metadata });
  }
  const verification = {
    schema_version: TRACE_SCHEMA_VERSION,
    run_id: runId,
    status: assertEnum(input.status, VERIFICATION_STATUSES.filter((status) => status !== "not_run"), "verification.status"),
    summary: summary.value,
    checks,
    evidence_refs: evidence.value,
    incomplete_reasons: incomplete.value,
    recorded_at: timestamp,
    truncation: {
      summary: summary.metadata,
      checks: arrayMetadata(input.checks.length, checks.length, checkMetadata),
      evidence_refs: evidence.metadata,
      incomplete_reasons: incomplete.metadata,
    },
  };
  assertVerificationConsistency(verification);
  return verification;
}

function assertVerificationConsistency(verification) {
  if (verification.checks.length === 0) throw new ContractError("TRACE_VERIFICATION_EMPTY", "verification must contain at least one check");
  const codes = new Set();
  for (const check of verification.checks) {
    if (codes.has(check.code)) throw new ContractError("TRACE_VERIFICATION_DUPLICATE", `duplicate verification check: ${check.code}`);
    codes.add(check.code);
  }
  const semanticTruncation = Boolean(
    verification.truncation.checks?.truncated
    || verification.truncation.evidence_refs?.truncated
    || verification.truncation.incomplete_reasons?.truncated
    || verification.truncation.checks?.items?.some((item) => item?.truncated),
  );
  const hasFailed = verification.checks.some((check) => check.status === "failed");
  const hasIncomplete = verification.checks.some((check) => ["incomplete", "not_run"].includes(check.status))
    || verification.incomplete_reasons.length > 0
    || semanticTruncation;
  const expected = hasFailed ? "failed" : hasIncomplete ? "incomplete" : "passed";
  if (verification.status !== expected) {
    const code = semanticTruncation && verification.status === "passed" ? "TRACE_VERIFICATION_TRUNCATED" : "TRACE_VERIFICATION_AGGREGATE";
    throw new ContractError(code, `verification status ${verification.status} contradicts its checks (${expected})`);
  }
  return verification;
}

function validateVerificationArtifact(verification, runId) {
  const keys = ["schema_version", "run_id", "status", "summary", "checks", "evidence_refs", "incomplete_reasons", "recorded_at", "truncation"];
  exact(verification, keys, keys, "stored verification");
  if (verification.schema_version !== TRACE_SCHEMA_VERSION || verification.run_id !== runId) throw new ContractError("TRACE_VERIFICATION", "stored verification identity mismatch");
  assertEnum(verification.status, ["passed", "failed", "incomplete"], "stored verification.status");
  assertSafeStoredText(verification.summary, "stored verification.summary", { maxLength: DEFAULT_LIMITS.summary });
  if (!Array.isArray(verification.checks) || verification.checks.length > DEFAULT_LIMITS.array) throw new ContractError("TRACE_CHECKS", "stored verification.checks is invalid");
  for (const [index, check] of verification.checks.entries()) {
    exact(check, ["code", "status", "summary", "evidence_refs"], ["code", "status", "summary", "evidence_refs"], `stored verification.checks[${index}]`);
    assertSafePersistenceId(check.code, `stored verification.checks[${index}].code`);
    assertEnum(check.status, VERIFICATION_STATUSES, `stored verification.checks[${index}].status`);
    assertSafeStoredText(check.summary, `stored verification.checks[${index}].summary`, { maxLength: 300 });
    validateStoredEvidenceRefs(check.evidence_refs, `stored verification.checks[${index}].evidence_refs`);
  }
  validateStoredEvidenceRefs(verification.evidence_refs, "stored verification.evidence_refs");
  if (!Array.isArray(verification.incomplete_reasons) || verification.incomplete_reasons.length > DEFAULT_LIMITS.array) throw new ContractError("TRACE_VERIFICATION", "stored verification.incomplete_reasons is invalid");
  verification.incomplete_reasons.forEach((item, index) => assertSafeStoredText(item, `stored verification.incomplete_reasons[${index}]`, { maxLength: 300 }));
  assertIsoTimestamp(verification.recorded_at, "stored verification.recorded_at");
  validateTruncation(verification.truncation, ["summary", "checks", "evidence_refs", "incomplete_reasons"], "stored verification.truncation");
  return assertVerificationConsistency(verification);
}

function sanitizeOutcome(run, verification, input, timestamp) {
  const keys = ["status", "termination_reason", "summary", "evidence_refs"];
  exact(input, keys, keys, "outcome");
  const summary = sanitizedText(input.summary, "outcome.summary", { maxLength: DEFAULT_LIMITS.summary });
  const evidence = sanitizeEvidenceRefs(input.evidence_refs, "outcome.evidence_refs");
  return {
    schema_version: TRACE_SCHEMA_VERSION,
    run_id: run.run_id,
    status: assertEnum(input.status, TRACE_STATUSES, "outcome.status"),
    termination_reason: assertEnum(input.termination_reason, TERMINATION_REASONS, "outcome.termination_reason"),
    summary: summary.value,
    evidence_refs: evidence.value,
    verification_status: verification.status,
    completed_at: timestamp,
    truncation: { summary: summary.metadata, evidence_refs: evidence.metadata },
  };
}

function validateOutcome(outcome, run, verification) {
  const keys = ["schema_version", "run_id", "status", "termination_reason", "summary", "evidence_refs", "verification_status", "completed_at", "truncation"];
  exact(outcome, keys, keys, "stored outcome");
  if (outcome.schema_version !== TRACE_SCHEMA_VERSION || outcome.run_id !== run.run_id) throw new ContractError("TRACE_OUTCOME", "stored outcome identity mismatch");
  assertEnum(outcome.status, TRACE_STATUSES, "stored outcome.status");
  assertEnum(outcome.termination_reason, TERMINATION_REASONS, "stored outcome.termination_reason");
  assertSafeStoredText(outcome.summary, "stored outcome.summary", { maxLength: DEFAULT_LIMITS.summary });
  validateStoredEvidenceRefs(outcome.evidence_refs, "stored outcome.evidence_refs");
  assertEnum(outcome.verification_status, ["passed", "failed", "incomplete"], "stored outcome.verification_status");
  if (verification && outcome.verification_status !== verification.status) throw new ContractError("TRACE_OUTCOME", "stored outcome verification status mismatch");
  assertIsoTimestamp(outcome.completed_at, "stored outcome.completed_at");
  validateTruncation(outcome.truncation, ["summary", "evidence_refs"], "stored outcome.truncation");
  if (run.lifecycle === "final" && (run.final_status !== outcome.status || run.termination_reason !== outcome.termination_reason || run.completed_at !== outcome.completed_at)) throw new ContractError("TRACE_OUTCOME", "run and outcome final fields disagree");
  return outcome;
}

function assertFinalizationConsistency({ events, jobs, verification, outcome }) {
  assertVerificationConsistency(verification);
  const nonTerminal = jobs.filter((job) => !TERMINAL_JOB_STATES.has(job.status.state));
  if (nonTerminal.length > 0) throw new ContractError("TRACE_JOBS_ACTIVE", "all delegated jobs must be terminal before finalization");
  const taskEnd = events.at(-1);
  if (!taskEnd || taskEnd.schema_version !== TRACE_SCHEMA_VERSION || taskEnd.event_type !== "task_end" || taskEnd.parent_task_id !== null) {
    throw new ContractError("TRACE_TASK_END_REQUIRED", "the final trace event must be a root task_end");
  }
  if (taskEnd.status !== outcome.status || taskEnd.termination_reason !== outcome.termination_reason) {
    throw new ContractError("TRACE_TASK_END_MISMATCH", "task_end status or termination reason does not match the outcome");
  }
  if (taskEnd.verification === null || taskEnd.verification.status !== verification.status) {
    throw new ContractError("TRACE_TASK_END_VERIFICATION", "task_end verification does not match the verification artifact");
  }
  const expectedCodes = [...new Set(verification.checks.map((check) => check.code))].sort();
  const eventCodes = [...new Set(taskEnd.verifier_codes)].sort();
  const nestedEventCodes = [...new Set(taskEnd.verification.verifier_codes)].sort();
  if (
    canonicalJson(expectedCodes) !== canonicalJson(eventCodes)
    || canonicalJson(expectedCodes) !== canonicalJson(nestedEventCodes)
  ) {
    throw new ContractError("TRACE_TASK_END_VERIFICATION", "task_end verifier codes do not match the verification artifact");
  }
  const allowedTerminations = new Map([
    ["completed", new Set(["done", "verified"])],
    ["changed", new Set(["done", "verified"])],
    ["no-op", new Set(["done", "verified"])],
    ["no-findings", new Set(["done", "verified"])],
    ["blocked", new Set([
      "blocked_missing_context",
      "blocked_user_decision",
      "blocked_permission",
      "blocked_external_state",
      "conflicting_write_scope",
      "budget_exhausted",
    ])],
    ["unsafe", new Set(["unsafe_without_permission"])],
    ["failed", new Set(["partially_verified", "budget_exhausted", "verification_failed", "not_reproducible"])],
  ]);
  if (!allowedTerminations.get(outcome.status)?.has(outcome.termination_reason)) {
    throw new ContractError("TRACE_OUTCOME_CONSISTENCY", `outcome status ${outcome.status} contradicts termination ${outcome.termination_reason}`);
  }
  if (verification.status === "failed" && (outcome.status !== "failed" || outcome.termination_reason !== "verification_failed")) {
    throw new ContractError("TRACE_OUTCOME_CONSISTENCY", "failed verification requires a verification_failed outcome");
  }
  if (
    verification.status === "incomplete"
    && (outcome.status !== "failed" || !["partially_verified", "verification_failed"].includes(outcome.termination_reason))
  ) {
    throw new ContractError("TRACE_OUTCOME_CONSISTENCY", "incomplete verification requires a failed partially_verified or verification_failed outcome");
  }
  if (verification.status === "passed" && ["partially_verified", "verification_failed"].includes(outcome.termination_reason)) {
    throw new ContractError("TRACE_OUTCOME_CONSISTENCY", "passed verification contradicts a partial or failed verification termination");
  }
  return outcome;
}

function artifactPaths(runDir) {
  return {
    run: path.join(runDir, "run.json"),
    events: path.join(runDir, "events.jsonl"),
    receipts: path.join(runDir, "context-receipts.jsonl"),
    verification: path.join(runDir, "verification.json"),
    outcome: path.join(runDir, "outcome.json"),
    pendingOutcome: path.join(runDir, ".outcome.pending.json"),
    jobs: path.join(runDir, "jobs"),
    lock: path.join(runDir, ".write.lock"),
  };
}

function assertRunArtifactsSafe(harnessRoot, paths) {
  for (const candidate of [paths.run, paths.events, paths.receipts, paths.verification, paths.outcome, paths.pendingOutcome, paths.jobs, paths.lock]) {
    assertNoSymlinkEscape(harnessRoot, candidate);
  }
}

function jobPaths(jobsDir, taskId) {
  const directory = resolveIdPath(jobsDir, taskId);
  return {
    directory,
    request: path.join(directory, "request.json"),
    status: path.join(directory, "status.json"),
    result: path.join(directory, "result.json"),
  };
}

function ensureActiveRun(run, paths) {
  if (run.lifecycle !== "active" || fs.existsSync(paths.outcome)) throw new ContractError("TRACE_FINALIZED", `run ${run.run_id} is already finalized`);
}

function readJobs(harnessRoot, paths, runId) {
  const jobs = [];
  if (!fs.existsSync(paths.jobs)) return jobs;
  for (const entry of fs.readdirSync(paths.jobs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue;
    if (!entry.isDirectory()) throw new ContractError("TRACE_JOB_ENTRY", `unexpected jobs entry: ${entry.name}`);
    const taskId = assertSafePersistenceId(entry.name, "job directory");
    const current = jobPaths(paths.jobs, taskId);
    for (const candidate of Object.values(current)) assertNoSymlinkEscape(harnessRoot, candidate);
    if (!fs.existsSync(current.request) || !fs.existsSync(current.status)) throw new ContractError("TRACE_JOB_PARTIAL", `job ${taskId} is missing request or status`);
    const request = validateJobRequest(readJson(current.request), runId, taskId);
    const status = validateJobStatus(readJson(current.status), runId, taskId);
    const result = fs.existsSync(current.result) ? validateJobResult(readJson(current.result), runId, taskId) : null;
    if (TERMINAL_JOB_STATES.has(status.state) !== (result !== null)) throw new ContractError("TRACE_JOB_PARTIAL", `job ${taskId} terminal status/result mismatch`);
    if (result && !RESULT_STATUSES_BY_JOB_STATE[status.state].has(result.status)) throw new ContractError("TRACE_JOB_RESULT_STATUS", `job ${taskId} result status does not match ${status.state}`);
    jobs.push({ request, status, result });
  }
  return jobs;
}

function normalizeTraceLimits(overrides) {
  if (overrides === null || typeof overrides !== "object" || Array.isArray(overrides)) {
    throw new ContractError("TRACE_LIMITS", "limits must be an object");
  }
  const keys = Object.keys(DEFAULT_TRACE_STORE_LIMITS);
  for (const key of Object.keys(overrides)) {
    if (!keys.includes(key)) throw new ContractError("TRACE_LIMITS", `unsupported trace limit: ${key}`);
  }
  const result = { ...DEFAULT_TRACE_STORE_LIMITS, ...overrides };
  for (const [key, value] of Object.entries(result)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new ContractError("TRACE_LIMITS", `limits.${key} must be a positive safe integer`);
  }
  if (result.activeJobs > result.jobs) throw new ContractError("TRACE_LIMITS", "limits.activeJobs cannot exceed limits.jobs");
  return Object.freeze(result);
}

function serializedRecordBytes(value) {
  return Buffer.byteLength(canonicalJson(value), "utf8");
}

function jsonDocumentBytes(value) {
  return Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function jsonLinesBytes(entries) {
  if (entries.length === 0) return 0;
  return Buffer.byteLength(`${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
}

function assertRecordWithinQuota(value, limits, label) {
  if (serializedRecordBytes(value) > limits.recordBytes) {
    throw new ContractError("TRACE_QUOTA_RECORD_BYTES", `${label} exceeds the per-record byte quota`);
  }
  assertPersistenceSafe(value, { label });
  return value;
}

function persistentBytes(root) {
  if (!fs.existsSync(root)) return 0;
  let total = 0;
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      // Lock files are coordination metadata, but stale temporary files are
      // durable bytes until they are removed and must consume the quota.
      if (entry.name === ".write.lock" || entry.name === ".create.lock") continue;
      const target = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new ContractError("FILES_SYMLINK", "trace storage must not contain symbolic links");
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) total += fs.statSync(target).size;
      if (total > Number.MAX_SAFE_INTEGER) throw new ContractError("TRACE_QUOTA_TOTAL_BYTES", "trace storage byte count is not safe");
    }
  }
  return total;
}

function assertCurrentTotal(runDir, limits) {
  const total = persistentBytes(runDir);
  if (total > limits.totalBytes) throw new ContractError("TRACE_QUOTA_TOTAL_BYTES", "run exceeds the total serialized byte quota");
  return total;
}

function bufferedRunBytes(state) {
  let total = jsonDocumentBytes(state.run)
    + jsonLinesBytes(state.events)
    + jsonLinesBytes(state.receipts);
  for (const job of state.jobs.values()) {
    total += jsonDocumentBytes(job.request) + jsonDocumentBytes(job.status);
    if (job.result) total += jsonDocumentBytes(job.result);
  }
  if (state.verification) total += jsonDocumentBytes(state.verification);
  if (state.outcome) total += jsonDocumentBytes(state.outcome);
  return total;
}

function assertBufferedTotal(state, limits) {
  if (bufferedRunBytes(state) > limits.totalBytes) {
    throw new ContractError("TRACE_QUOTA_TOTAL_BYTES", "buffered run exceeds the total serialized byte quota");
  }
}

function bufferedJobs(state) {
  return [...state.jobs.values()]
    .sort((left, right) => left.request.task_id.localeCompare(right.request.task_id));
}

export function createBufferedTraceStore({ clock = () => new Date(), idFactory = () => randomUUID(), limits: limitOverrides = {} } = {}) {
  if (typeof clock !== "function" || typeof idFactory !== "function") throw new ContractError("TRACE_FACTORY", "clock and idFactory must be functions");
  const limits = normalizeTraceLimits(limitOverrides);
  const runs = new Map();

  const requireRun = (runId) => {
    const safeRunId = assertSafePersistenceId(runId, "runId");
    const state = runs.get(safeRunId);
    if (!state) throw new ContractError("TRACE_RUN_MISSING", `run does not exist: ${safeRunId}`);
    return { safeRunId, state };
  };
  const requireActive = (state) => {
    if (state.run.lifecycle !== "active" || state.outcome !== null) throw new ContractError("TRACE_FINALIZED", `run ${state.run.run_id} is already finalized`);
  };
  const storeState = (runId, next) => {
    assertBufferedTotal(next, limits);
    runs.set(runId, next);
  };

  function createRun(input = {}) {
    const run = buildRun(input, { clock, idFactory });
    if (runs.has(run.run_id)) throw new ContractError("TRACE_RUN_EXISTS", `run already exists: ${run.run_id}`);
    assertRecordWithinQuota(run, limits, "run");
    const state = { run, events: [], receipts: [], jobs: new Map(), verification: null, outcome: null };
    storeState(run.run_id, state);
    return snapshot(run);
  }

  function appendEvent(runId, input) {
    const { safeRunId, state } = requireRun(runId);
    requireActive(state);
    if (state.events.length >= limits.events) throw new ContractError("TRACE_QUOTA_EVENTS", "run reached the event count quota");
    const event = buildEvent(state.run, input, state.events, { clock, idFactory });
    assertRecordWithinQuota(event, limits, "event");
    storeState(safeRunId, { ...state, events: [...state.events, event] });
    return snapshot(event);
  }

  function recordContextReceipt(runId, input) {
    const { safeRunId, state } = requireRun(runId);
    requireActive(state);
    if (state.receipts.length >= limits.receipts) throw new ContractError("TRACE_QUOTA_RECEIPTS", "run reached the context receipt count quota");
    const receipt = buildReceipt(state.run, input, state.receipts, { clock, idFactory });
    assertRecordWithinQuota(receipt, limits, "context receipt");
    storeState(safeRunId, { ...state, receipts: [...state.receipts, receipt] });
    return snapshot(receipt);
  }

  function createJob(runId, input) {
    const { safeRunId, state } = requireRun(runId);
    requireActive(state);
    if (state.jobs.size >= limits.jobs) throw new ContractError("TRACE_QUOTA_JOBS", "run reached the job count quota");
    const activeJobs = [...state.jobs.values()].filter((job) => !TERMINAL_JOB_STATES.has(job.status.state)).length;
    if (activeJobs >= limits.activeJobs) throw new ContractError("TRACE_QUOTA_ACTIVE_JOBS", "run reached the active job quota");
    const request = buildJobRequest(state.run, input, { clock, idFactory });
    if (state.jobs.has(request.task_id)) throw new ContractError("TRACE_JOB_EXISTS", `job already exists: ${request.task_id}`);
    const status = buildJobStatus(safeRunId, request.task_id, "created", request.created_at);
    assertRecordWithinQuota(request, limits, "job request");
    assertRecordWithinQuota(status, limits, "job status");
    const jobs = new Map(state.jobs);
    jobs.set(request.task_id, { request, status, result: null });
    storeState(safeRunId, { ...state, jobs });
    return snapshot({ request, status });
  }

  function transitionJob(runId, taskId, input) {
    exact(input, ["state"], ["state"], "job transition");
    const { safeRunId, state } = requireRun(runId);
    requireActive(state);
    const safeTaskId = assertSafePersistenceId(taskId, "taskId");
    const job = state.jobs.get(safeTaskId);
    if (!job) throw new ContractError("TRACE_JOB_MISSING", `job does not exist: ${safeTaskId}`);
    if (input.state !== "running" || job.status.state !== "created") {
      if (TERMINAL_JOB_STATES.has(input.state)) throw new ContractError("TRACE_JOB_RESULT_REQUIRED", "terminal transitions require completeJob with a structured result");
      throw new ContractError("TRACE_JOB_TRANSITION", `invalid job transition ${job.status.state} -> ${input.state}`);
    }
    const startedAt = clockTimestamp(clock);
    const status = buildJobStatus(safeRunId, safeTaskId, "running", startedAt, startedAt);
    assertRecordWithinQuota(status, limits, "job status");
    const jobs = new Map(state.jobs);
    jobs.set(safeTaskId, { ...job, status });
    storeState(safeRunId, { ...state, jobs });
    return snapshot(status);
  }

  function completeJob(runId, taskId, input) {
    exact(input, ["state", "result"], ["state", "result"], "job completion");
    const finalState = assertEnum(input.state, [...TERMINAL_JOB_STATES], "job completion.state");
    const { safeRunId, state } = requireRun(runId);
    requireActive(state);
    const safeTaskId = assertSafePersistenceId(taskId, "taskId");
    const job = state.jobs.get(safeTaskId);
    if (!job) throw new ContractError("TRACE_JOB_MISSING", `job does not exist: ${safeTaskId}`);
    if (!["created", "running"].includes(job.status.state)) throw new ContractError("TRACE_JOB_TRANSITION", `job is already terminal: ${job.status.state}`);
    if (["completed", "failed"].includes(finalState) && job.status.state !== "running") {
      throw new ContractError("TRACE_JOB_TRANSITION", `${finalState} job must first enter running state`);
    }
    const completedAt = clockTimestamp(clock);
    const result = sanitizeJobResult(safeRunId, safeTaskId, input.result, completedAt);
    if (!RESULT_STATUSES_BY_JOB_STATE[finalState].has(result.status)) throw new ContractError("TRACE_JOB_RESULT_STATUS", `result status ${result.status} does not match ${finalState}`);
    const status = buildJobStatus(safeRunId, safeTaskId, finalState, completedAt, job.status.started_at);
    assertRecordWithinQuota(result, limits, "job result");
    assertRecordWithinQuota(status, limits, "job status");
    const jobs = new Map(state.jobs);
    jobs.set(safeTaskId, { request: job.request, status, result });
    storeState(safeRunId, { ...state, jobs });
    return snapshot({ status, result });
  }

  function recordVerification(runId, input) {
    const { safeRunId, state } = requireRun(runId);
    requireActive(state);
    if (state.verification) throw new ContractError("FILES_IMMUTABLE_EXISTS", "immutable artifact already exists: verification.json");
    const verification = sanitizeVerificationArtifact(safeRunId, input, clockTimestamp(clock));
    assertRecordWithinQuota(verification, limits, "verification");
    storeState(safeRunId, { ...state, verification });
    return snapshot(verification);
  }

  function finalizeRun(runId, input) {
    exact(input, ["status", "termination_reason", "summary", "evidence_refs"], ["status", "termination_reason", "summary", "evidence_refs"], "outcome");
    const { safeRunId, state } = requireRun(runId);
    requireActive(state);
    if (!state.verification) throw new ContractError("TRACE_VERIFICATION_REQUIRED", "recordVerification must run before finalizeRun");
    const outcome = sanitizeOutcome(state.run, state.verification, input, clockTimestamp(clock));
    assertRecordWithinQuota(outcome, limits, "outcome");
    assertFinalizationConsistency({ events: state.events, jobs: bufferedJobs(state), verification: state.verification, outcome });
    const run = {
      ...state.run,
      completed_at: outcome.completed_at,
      final_status: outcome.status,
      termination_reason: outcome.termination_reason,
      lifecycle: "final",
    };
    validateRun(run);
    assertRecordWithinQuota(run, limits, "final run");
    storeState(safeRunId, { ...state, run, outcome });
    return snapshot({ run, outcome });
  }

  function inspectRun(runId) {
    const { state } = requireRun(runId);
    validateRun(state.run);
    validateEvents(state.events, state.run.run_id);
    state.receipts.forEach((receipt) => validateReceipt(receipt, state.run.run_id));
    const jobs = bufferedJobs(state);
    for (const job of jobs) {
      validateJobRequest(job.request, state.run.run_id, job.request.task_id);
      validateJobStatus(job.status, state.run.run_id, job.request.task_id);
      if (job.result) validateJobResult(job.result, state.run.run_id, job.request.task_id);
    }
    if (state.verification) validateVerificationArtifact(state.verification, state.run.run_id);
    if (state.outcome) validateOutcome(state.outcome, state.run, state.verification);
    const complete = state.run.lifecycle === "final" && state.verification !== null && state.outcome !== null;
    if (complete) assertFinalizationConsistency({ events: state.events, jobs, verification: state.verification, outcome: state.outcome });
    assertBufferedTotal(state, limits);
    return snapshot({
      run: state.run,
      events: state.events,
      context_receipts: state.receipts,
      jobs,
      verification: state.verification,
      outcome: state.outcome,
      legacy_events_present: false,
      complete,
    });
  }

  const api = Object.freeze({
    createRun,
    appendEvent,
    recordContextReceipt,
    createJob,
    transitionJob,
    completeJob,
    recordVerification,
    finalizeRun,
    inspectRun,
  });
  STORE_INTERNALS.set(api, { kind: "buffered", runs, limits });
  return api;
}

function assertProjectedTotal(runDir, limits, replacements = [], additions = []) {
  let projected = assertCurrentTotal(runDir, limits);
  for (const replacement of replacements) {
    if (fs.existsSync(replacement.path)) projected -= fs.statSync(replacement.path).size;
    projected += replacement.bytes;
  }
  for (const bytes of additions) projected += bytes;
  if (projected > limits.totalBytes) throw new ContractError("TRACE_QUOTA_TOTAL_BYTES", "mutation would exceed the total serialized byte quota");
  return projected;
}

// Internal integration seam used by the trusted quality-plane coordinator.
// It is intentionally not re-exported from lib/feedback/index.mjs or from a
// package subpath. Artifacts join an already-finalized staging run before the
// existing manifest/copy/single-rename publication path.
export function materializeStagedRunArtifacts(stagedStore, runId, entries) {
  const staged = STORE_INTERNALS.get(stagedStore);
  if (!staged?.stagingRoot) {
    throw new ContractError("TRACE_STAGING_STORE", "quality materialization requires a staging trace store");
  }
  const safeRunId = assertSafePersistenceId(runId, "runId");
  const snapshot = stagedStore.inspectRun(safeRunId);
  if (!snapshot.complete) {
    throw new ContractError("TRACE_STAGING_INCOMPLETE", "quality artifacts require a complete finalized staging run");
  }
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 32) {
    throw new ContractError("TRACE_STAGING_ARTIFACTS", "quality artifacts must contain 1..32 entries");
  }
  const sourceRunsRoot = resolveInside(staged.harnessRoot, "runs");
  const sourceRunDir = resolveIdPath(sourceRunsRoot, safeRunId);
  const seen = new Set();
  const prepared = entries.map((entry, index) => {
    exact(entry, ["relative_path", "value"], ["relative_path", "value"], `quality artifact[${index}]`);
    const relativePath = normalizeRelativePath(entry.relative_path, `quality artifact[${index}].relative_path`);
    if (relativePath !== entry.relative_path || !relativePath.startsWith("quality/") || relativePath.split("/").length < 2) {
      throw new ContractError("TRACE_STAGING_ARTIFACT_PATH", "quality artifacts must use canonical paths under quality/");
    }
    if (seen.has(relativePath)) throw new ContractError("TRACE_STAGING_ARTIFACT_DUPLICATE", `duplicate artifact path: ${relativePath}`);
    seen.add(relativePath);
    assertPersistenceSafe(entry.value, { label: `quality artifact[${index}].value` });
    const bytes = jsonDocumentBytes(entry.value);
    if (bytes > staged.limits.totalBytes) {
      throw new ContractError("TRACE_QUOTA_RECORD_BYTES", `quality artifact exceeds the staging run quota: ${relativePath}`);
    }
    return {
      relativePath,
      targetPath: resolveInside(sourceRunDir, ...relativePath.split("/")),
      value: entry.value,
      bytes,
    };
  });
  assertProjectedTotal(sourceRunDir, staged.limits, [], prepared
    .filter((entry) => !fs.existsSync(entry.targetPath))
    .map((entry) => entry.bytes));
  const secureFiles = { basePath: staged.harnessRoot };
  for (const entry of prepared) {
    ensureConfinedDirectory(staged.harnessRoot, path.dirname(entry.targetPath));
    if (fs.existsSync(entry.targetPath)) {
      assertNoSymlinkEscape(staged.harnessRoot, entry.targetPath);
      if (canonicalJson(readJson(entry.targetPath)) !== canonicalJson(entry.value)) {
        throw new ContractError("TRACE_STAGING_ARTIFACT_CONFLICT", `immutable artifact differs: ${entry.relativePath}`);
      }
      continue;
    }
    atomicWriteJson(entry.targetPath, entry.value, { ...secureFiles, immutable: true });
  }
  assertCurrentTotal(sourceRunDir, staged.limits);
  return Object.freeze(prepared.map((entry) => Object.freeze({
    relative_path: entry.relativePath,
    bytes: entry.bytes,
  })));
}

export function createTraceStore({ workspaceRoot, clock = () => new Date(), idFactory = () => randomUUID(), limits: limitOverrides = {} } = {}) {
  if (typeof clock !== "function" || typeof idFactory !== "function") throw new ContractError("TRACE_FACTORY", "clock and idFactory must be functions");
  const limits = normalizeTraceLimits(limitOverrides);
  const harnessRoot = resolveHarnessRoot(workspaceRoot);
  const runsRoot = resolveInside(harnessRoot, "runs");
  const secureFiles = Object.freeze({ basePath: harnessRoot });

  function resolveRun(runId, { mustExist = true } = {}) {
    const runDir = resolveIdPath(runsRoot, runId);
    if (mustExist && !fs.existsSync(runDir)) throw new ContractError("TRACE_RUN_MISSING", `run does not exist: ${runId}`);
    if (fs.existsSync(harnessRoot)) assertNoSymlinkEscape(harnessRoot, runDir);
    const paths = artifactPaths(runDir);
    if (fs.existsSync(harnessRoot)) assertRunArtifactsSafe(harnessRoot, paths);
    return { runDir, paths };
  }

  function mutate(runId, callback) {
    const { runDir, paths } = resolveRun(runId);
    assertNoSymlinkEscape(harnessRoot, runDir);
    return withExclusiveLock(paths.lock, () => {
      assertCurrentTotal(runDir, limits);
      return callback();
    }, { ...secureFiles, lockIdFactory: () => generatedId(idFactory, "lock") });
  }

  function createRun(input = {}) {
    const run = buildRun(input, { clock, idFactory });
    assertRecordWithinQuota(run, limits, "run");
    const initialBytes = jsonDocumentBytes(run);
    if (initialBytes > limits.totalBytes) throw new ContractError("TRACE_QUOTA_TOTAL_BYTES", "new run exceeds the total serialized byte quota");
    ensureConfinedDirectory(harnessRoot, harnessRoot);
    ensureConfinedDirectory(harnessRoot, runsRoot);
    const runDir = resolveIdPath(runsRoot, run.run_id);
    const createLock = path.join(runsRoot, ".create.lock");
    withExclusiveLock(createLock, () => {
      if (fs.existsSync(runDir)) throw new ContractError("TRACE_RUN_EXISTS", `run already exists: ${run.run_id}`);
      const staging = resolveInside(runsRoot, `.${run.run_id}.creating`);
      if (fs.existsSync(staging)) throw new ContractError("TRACE_RUN_STAGING", `stale run staging directory exists: ${run.run_id}`);
      fs.mkdirSync(staging);
      try {
        const paths = artifactPaths(staging);
        fs.mkdirSync(paths.jobs);
        atomicWriteJson(paths.run, run, secureFiles);
        atomicRewriteJsonLines(paths.events, [], secureFiles);
        atomicRewriteJsonLines(paths.receipts, [], secureFiles);
        assertNoSymlinkEscape(harnessRoot, staging);
        assertNoSymlinkEscape(harnessRoot, runDir);
        fs.renameSync(staging, runDir);
        assertNoSymlinkEscape(harnessRoot, runDir);
      } catch (error) {
        if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
        throw error;
      }
    }, { ...secureFiles, lockIdFactory: () => generatedId(idFactory, "lock") });
    return snapshot(run);
  }

  function appendEvent(runId, input) {
    return mutate(runId, () => {
      const { runDir, paths } = resolveRun(runId);
      const run = validateRun(readJson(paths.run));
      ensureActiveRun(run, paths);
      const events = readJsonLines(paths.events);
      const state = validateEvents(events, runId);
      if (state.legacy) throw new ContractError("TRACE_LEGACY_APPEND", "cannot append v2 events to a legacy v1 event stream");
      if (events.length >= limits.events) throw new ContractError("TRACE_QUOTA_EVENTS", "run reached the event count quota");
      const event = buildEvent(run, input, events, { clock, idFactory });
      assertRecordWithinQuota(event, limits, "event");
      const nextEvents = [...events, event];
      assertProjectedTotal(runDir, limits, [{ path: paths.events, bytes: jsonLinesBytes(nextEvents) }]);
      atomicRewriteJsonLines(paths.events, nextEvents, secureFiles);
      return snapshot(event);
    });
  }

  function recordContextReceipt(runId, input) {
    return mutate(runId, () => {
      const { runDir, paths } = resolveRun(runId);
      const run = validateRun(readJson(paths.run));
      ensureActiveRun(run, paths);
      const receipts = readJsonLines(paths.receipts);
      const ids = new Set();
      for (const receipt of receipts) {
        validateReceipt(receipt, runId);
        if (ids.has(receipt.receipt_id)) throw new ContractError("TRACE_RECEIPT_DUPLICATE", `duplicate receipt_id: ${receipt.receipt_id}`);
        ids.add(receipt.receipt_id);
      }
      if (receipts.length >= limits.receipts) throw new ContractError("TRACE_QUOTA_RECEIPTS", "run reached the context receipt count quota");
      const receipt = buildReceipt(run, input, receipts, { clock, idFactory });
      assertRecordWithinQuota(receipt, limits, "context receipt");
      const nextReceipts = [...receipts, receipt];
      assertProjectedTotal(runDir, limits, [{ path: paths.receipts, bytes: jsonLinesBytes(nextReceipts) }]);
      atomicRewriteJsonLines(paths.receipts, nextReceipts, secureFiles);
      return snapshot(receipt);
    });
  }

  function createJob(runId, input) {
    return mutate(runId, () => {
      const { runDir, paths } = resolveRun(runId);
      const run = validateRun(readJson(paths.run));
      ensureActiveRun(run, paths);
      const jobs = readJobs(harnessRoot, paths, runId);
      if (jobs.length >= limits.jobs) throw new ContractError("TRACE_QUOTA_JOBS", "run reached the job count quota");
      const activeJobs = jobs.filter((job) => !TERMINAL_JOB_STATES.has(job.status.state)).length;
      if (activeJobs >= limits.activeJobs) throw new ContractError("TRACE_QUOTA_ACTIVE_JOBS", "run reached the active job quota");
      const request = buildJobRequest(run, input, { clock, idFactory });
      const current = jobPaths(paths.jobs, request.task_id);
      if (fs.existsSync(current.directory)) throw new ContractError("TRACE_JOB_EXISTS", `job already exists: ${request.task_id}`);
      const staging = resolveInside(paths.jobs, `.${request.task_id}.creating`);
      if (fs.existsSync(staging)) throw new ContractError("TRACE_JOB_STAGING", `stale job staging directory exists: ${request.task_id}`);
      const status = buildJobStatus(runId, request.task_id, "created", request.created_at);
      assertRecordWithinQuota(request, limits, "job request");
      assertRecordWithinQuota(status, limits, "job status");
      assertProjectedTotal(runDir, limits, [], [jsonDocumentBytes(request), jsonDocumentBytes(status)]);
      assertNoSymlinkEscape(harnessRoot, staging);
      fs.mkdirSync(staging);
      try {
        const stagePaths = { request: path.join(staging, "request.json"), status: path.join(staging, "status.json") };
        atomicWriteJson(stagePaths.request, request, { ...secureFiles, immutable: true });
        atomicWriteJson(stagePaths.status, status, secureFiles);
        assertNoSymlinkEscape(harnessRoot, staging);
        assertNoSymlinkEscape(harnessRoot, current.directory);
        fs.renameSync(staging, current.directory);
        assertNoSymlinkEscape(harnessRoot, current.directory);
        return snapshot({ request, status, result: null });
      } catch (error) {
        if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
        throw error;
      }
    });
  }

  function transitionJob(runId, taskId, input) {
    exact(input, ["state"], ["state"], "job transition");
    return mutate(runId, () => {
      const { runDir, paths } = resolveRun(runId);
      const run = validateRun(readJson(paths.run));
      ensureActiveRun(run, paths);
      const current = jobPaths(paths.jobs, assertSafePersistenceId(taskId, "taskId"));
      if (!fs.existsSync(current.request) || !fs.existsSync(current.status)) throw new ContractError("TRACE_JOB_MISSING", `job does not exist: ${taskId}`);
      validateJobRequest(readJson(current.request), runId, taskId);
      const status = validateJobStatus(readJson(current.status), runId, taskId);
      if (input.state !== "running" || status.state !== "created") {
        if (TERMINAL_JOB_STATES.has(input.state)) throw new ContractError("TRACE_JOB_RESULT_REQUIRED", "terminal transitions require completeJob with a structured result");
        throw new ContractError("TRACE_JOB_TRANSITION", `invalid job transition ${status.state} -> ${input.state}`);
      }
      const startedAt = clockTimestamp(clock);
      const next = buildJobStatus(runId, taskId, "running", startedAt, startedAt);
      assertRecordWithinQuota(next, limits, "job status");
      assertProjectedTotal(runDir, limits, [{ path: current.status, bytes: jsonDocumentBytes(next) }]);
      atomicWriteJson(current.status, next, secureFiles);
      return snapshot(next);
    });
  }

  function completeJob(runId, taskId, input) {
    exact(input, ["state", "result"], ["state", "result"], "job completion");
    const finalState = assertEnum(input.state, [...TERMINAL_JOB_STATES], "job completion.state");
    return mutate(runId, () => {
      const { runDir, paths } = resolveRun(runId);
      const run = validateRun(readJson(paths.run));
      ensureActiveRun(run, paths);
      const current = jobPaths(paths.jobs, assertSafePersistenceId(taskId, "taskId"));
      if (!fs.existsSync(current.request) || !fs.existsSync(current.status)) throw new ContractError("TRACE_JOB_MISSING", `job does not exist: ${taskId}`);
      validateJobRequest(readJson(current.request), runId, taskId);
      const status = validateJobStatus(readJson(current.status), runId, taskId);
      if (!["created", "running"].includes(status.state)) throw new ContractError("TRACE_JOB_TRANSITION", `job is already terminal: ${status.state}`);
      if (["completed", "failed"].includes(finalState) && status.state !== "running") {
        throw new ContractError("TRACE_JOB_TRANSITION", `${finalState} job must first enter running state`);
      }
      const existingResult = fs.existsSync(current.result) ? validateJobResult(readJson(current.result), runId, taskId) : null;
      const completedAt = existingResult?.completed_at ?? clockTimestamp(clock);
      const result = sanitizeJobResult(runId, taskId, input.result, completedAt);
      assertRecordWithinQuota(result, limits, "job result");
      if (!RESULT_STATUSES_BY_JOB_STATE[finalState].has(result.status)) throw new ContractError("TRACE_JOB_RESULT_STATUS", `result status ${result.status} does not match ${finalState}`);
      if (existingResult) {
        if (canonicalJson(existingResult) !== canonicalJson(result)) throw new ContractError("FILES_IMMUTABLE_EXISTS", `immutable artifact already exists: result.json`);
      } else {
        const next = buildJobStatus(runId, taskId, finalState, completedAt, status.started_at);
        assertRecordWithinQuota(next, limits, "job status");
        assertProjectedTotal(runDir, limits, [{ path: current.status, bytes: jsonDocumentBytes(next) }], [jsonDocumentBytes(result)]);
        atomicWriteJson(current.result, result, { ...secureFiles, immutable: true });
      }
      const next = buildJobStatus(runId, taskId, finalState, completedAt, status.started_at);
      if (existingResult) {
        assertRecordWithinQuota(next, limits, "job status");
        assertProjectedTotal(runDir, limits, [{ path: current.status, bytes: jsonDocumentBytes(next) }]);
      }
      atomicWriteJson(current.status, next, secureFiles);
      return snapshot({ status: next, result });
    });
  }

  function recordVerification(runId, input) {
    return mutate(runId, () => {
      const { runDir, paths } = resolveRun(runId);
      const run = validateRun(readJson(paths.run));
      ensureActiveRun(run, paths);
      const verification = sanitizeVerificationArtifact(runId, input, clockTimestamp(clock));
      assertRecordWithinQuota(verification, limits, "verification");
      assertProjectedTotal(runDir, limits, [], [jsonDocumentBytes(verification)]);
      atomicWriteJson(paths.verification, verification, { ...secureFiles, immutable: true });
      return snapshot(verification);
    });
  }

  function finalizeRun(runId, input) {
    exact(input, ["status", "termination_reason", "summary", "evidence_refs"], ["status", "termination_reason", "summary", "evidence_refs"], "outcome");
    assertEnum(input.status, TRACE_STATUSES, "outcome.status");
    assertEnum(input.termination_reason, TERMINATION_REASONS, "outcome.termination_reason");
    return mutate(runId, () => {
      const { runDir, paths } = resolveRun(runId);
      let run = validateRun(readJson(paths.run));
      if (fs.existsSync(paths.outcome)) throw new ContractError("TRACE_FINALIZED", `run ${runId} is already finalized`);
      if (!fs.existsSync(paths.verification)) throw new ContractError("TRACE_VERIFICATION_REQUIRED", "recordVerification must run before finalizeRun");
      const verification = validateVerificationArtifact(readJson(paths.verification), runId);
      const events = readJsonLines(paths.events);
      validateEvents(events, runId);
      const jobs = readJobs(harnessRoot, paths, runId);

      if (run.lifecycle === "final") {
        if (!fs.existsSync(paths.pendingOutcome)) throw new ContractError("TRACE_FINALIZATION_PARTIAL", "final run is missing outcome recovery data");
        const pending = validateOutcome(readJson(paths.pendingOutcome), run, verification);
        if (input.status !== pending.status || input.termination_reason !== pending.termination_reason) throw new ContractError("TRACE_FINALIZATION_MISMATCH", "retry outcome does not match pending finalization");
        assertFinalizationConsistency({ events, jobs, verification, outcome: pending });
        assertNoSymlinkEscape(harnessRoot, paths.pendingOutcome);
        assertNoSymlinkEscape(harnessRoot, paths.outcome);
        fs.renameSync(paths.pendingOutcome, paths.outcome);
        assertNoSymlinkEscape(harnessRoot, paths.outcome);
        return snapshot({ run, outcome: pending });
      }

      ensureActiveRun(run, paths);
      let outcome;
      if (fs.existsSync(paths.pendingOutcome)) {
        outcome = validateOutcome(readJson(paths.pendingOutcome), run, verification);
        if (input.status !== outcome.status || input.termination_reason !== outcome.termination_reason) throw new ContractError("TRACE_FINALIZATION_MISMATCH", "retry outcome does not match pending finalization");
      } else {
        outcome = sanitizeOutcome(run, verification, input, clockTimestamp(clock));
      }
      assertRecordWithinQuota(outcome, limits, "outcome");
      assertFinalizationConsistency({ events, jobs, verification, outcome });
      run = { ...run, completed_at: outcome.completed_at, final_status: outcome.status, termination_reason: outcome.termination_reason, lifecycle: "final" };
      validateRun(run);
      assertRecordWithinQuota(run, limits, "final run");
      const additions = fs.existsSync(paths.pendingOutcome) ? [] : [jsonDocumentBytes(outcome)];
      assertProjectedTotal(runDir, limits, [{ path: paths.run, bytes: jsonDocumentBytes(run) }], additions);
      if (!fs.existsSync(paths.pendingOutcome)) atomicWriteJson(paths.pendingOutcome, outcome, { ...secureFiles, immutable: true });
      atomicWriteJson(paths.run, run, secureFiles);
      assertNoSymlinkEscape(harnessRoot, paths.pendingOutcome);
      assertNoSymlinkEscape(harnessRoot, paths.outcome);
      fs.renameSync(paths.pendingOutcome, paths.outcome);
      assertNoSymlinkEscape(harnessRoot, paths.outcome);
      return snapshot({ run, outcome });
    });
  }

  function inspectRun(runId) {
    const { runDir, paths } = resolveRun(runId);
    assertCurrentTotal(runDir, limits);
    const run = validateRun(readJson(paths.run));
    assertRecordWithinQuota(run, limits, "stored run");
    const events = readJsonLines(paths.events);
    if (events.length > limits.events) throw new ContractError("TRACE_QUOTA_EVENTS", "stored run exceeds the event count quota");
    const eventState = validateEvents(events, runId);
    events.forEach((event) => assertRecordWithinQuota(event, limits, "stored event"));
    const receipts = readJsonLines(paths.receipts);
    if (receipts.length > limits.receipts) throw new ContractError("TRACE_QUOTA_RECEIPTS", "stored run exceeds the context receipt count quota");
    const receiptIds = new Set();
    for (const receipt of receipts) {
      validateReceipt(receipt, runId);
      assertRecordWithinQuota(receipt, limits, "stored context receipt");
      if (receiptIds.has(receipt.receipt_id)) throw new ContractError("TRACE_RECEIPT_DUPLICATE", `duplicate receipt_id: ${receipt.receipt_id}`);
      receiptIds.add(receipt.receipt_id);
    }
    const jobs = readJobs(harnessRoot, paths, runId);
    if (jobs.length > limits.jobs) throw new ContractError("TRACE_QUOTA_JOBS", "stored run exceeds the job count quota");
    if (jobs.filter((job) => !TERMINAL_JOB_STATES.has(job.status.state)).length > limits.activeJobs) throw new ContractError("TRACE_QUOTA_ACTIVE_JOBS", "stored run exceeds the active job quota");
    for (const job of jobs) {
      assertRecordWithinQuota(job.request, limits, "stored job request");
      assertRecordWithinQuota(job.status, limits, "stored job status");
      if (job.result) assertRecordWithinQuota(job.result, limits, "stored job result");
    }
    const verification = fs.existsSync(paths.verification) ? validateVerificationArtifact(readJson(paths.verification), runId) : null;
    if (verification) assertRecordWithinQuota(verification, limits, "stored verification");
    const outcome = fs.existsSync(paths.outcome) ? validateOutcome(readJson(paths.outcome), run, verification) : null;
    if (outcome) assertRecordWithinQuota(outcome, limits, "stored outcome");
    if (outcome && run.lifecycle !== "final") throw new ContractError("TRACE_OUTCOME", "outcome exists for an active run");
    const complete = run.lifecycle === "final" && outcome !== null && verification !== null;
    if (complete) assertFinalizationConsistency({ events, jobs, verification, outcome });
    return snapshot({
      run,
      events,
      context_receipts: receipts,
      jobs,
      verification,
      outcome,
      legacy_events_present: eventState.legacy,
      complete,
    });
  }

  function createStagingStore() {
    const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-trace-stage-"));
    const stagedStore = createTraceStore({ workspaceRoot: stagingRoot, clock, idFactory, limits });
    STORE_INTERNALS.get(stagedStore).stagingRoot = stagingRoot;
    return stagedStore;
  }

  function createBufferedStore() {
    return createBufferedTraceStore({ clock, idFactory, limits });
  }

  function commitStagedRun(stagedStore, runId, {
    beforePublish = null,
    validateImport = null,
    afterPublish = null,
  } = {}) {
    const staged = STORE_INTERNALS.get(stagedStore);
    if (!staged?.stagingRoot) throw new ContractError("TRACE_STAGING_STORE", "commit requires a trace store created by createStagingStore");
    if (beforePublish !== null && typeof beforePublish !== "function") throw new ContractError("TRACE_STAGING_HOOK", "beforePublish must be a function");
    if (validateImport !== null && typeof validateImport !== "function") throw new ContractError("TRACE_STAGING_HOOK", "validateImport must be a function");
    if (afterPublish !== null && typeof afterPublish !== "function") throw new ContractError("TRACE_STAGING_HOOK", "afterPublish must be a function");
    const safeRunId = assertSafePersistenceId(runId, "runId");
    const stagedSnapshot = stagedStore.inspectRun(safeRunId);
    if (!stagedSnapshot.complete) throw new ContractError("TRACE_STAGING_INCOMPLETE", "only a complete finalized run can be committed");
    const sourceRunsRoot = resolveInside(staged.harnessRoot, "runs");
    const sourceRunDir = resolveIdPath(sourceRunsRoot, safeRunId);
    const sourceManifest = confinedTreeManifest(staged.harnessRoot, sourceRunDir);

    ensureConfinedDirectory(harnessRoot, harnessRoot);
    ensureConfinedDirectory(harnessRoot, runsRoot);
    const targetRunDir = resolveIdPath(runsRoot, safeRunId);
    if (fs.existsSync(targetRunDir)) {
      const targetManifest = confinedTreeManifest(harnessRoot, targetRunDir);
      if (targetManifest !== sourceManifest) {
        throw new ContractError("TRACE_STAGING_CONFLICT", `run exists with different immutable contents: ${safeRunId}`);
      }
      const committed = inspectRun(safeRunId);
      if (!committed.complete) throw new ContractError("TRACE_STAGING_CONFLICT", `existing run is not a complete immutable bundle: ${safeRunId}`);
      return committed;
    }
    const importingDir = resolveInside(runsRoot, `.${safeRunId}.${randomUUID()}.importing`);
    assertNoSymlinkEscape(harnessRoot, importingDir);
    try {
      fs.cpSync(sourceRunDir, importingDir, { recursive: true, errorOnExist: true, force: false, dereference: false });
      const copiedManifest = confinedTreeManifest(harnessRoot, importingDir);
      if (copiedManifest !== sourceManifest) throw new ContractError("TRACE_STAGING_COPY", "staged run changed while it was copied");
      validateImport?.(Object.freeze({ run_id: safeRunId, run_dir: importingDir, manifest: copiedManifest }));
      beforePublish?.();
      // The adapter process tree has already been proven absent by the caller.
      // This publication step therefore runs only in the trusted coordinator.
      assertNoSymlinkEscape(harnessRoot, targetRunDir);
      fs.renameSync(importingDir, targetRunDir);
      assertNoSymlinkEscape(harnessRoot, targetRunDir);
      const committed = inspectRun(safeRunId);
      if (!committed.complete) throw new ContractError("TRACE_STAGING_COMMIT", "committed staged run is incomplete");
      afterPublish?.(committed);
      return committed;
    } finally {
      if (fs.existsSync(importingDir)) fs.rmSync(importingDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  }

  function discardStagingStore(stagedStore) {
    const staged = STORE_INTERNALS.get(stagedStore);
    if (!staged?.stagingRoot) throw new ContractError("TRACE_STAGING_STORE", "discard requires a trace store created by createStagingStore");
    fs.rmSync(staged.stagingRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    STORE_INTERNALS.delete(stagedStore);
  }

  function createStagedRunFromBuffered(bufferedStore, runId) {
    const buffered = STORE_INTERNALS.get(bufferedStore);
    if (buffered?.kind !== "buffered") throw new ContractError("TRACE_BUFFERED_STORE", "staging requires a store created by createBufferedStore");
    const safeRunId = assertSafePersistenceId(runId, "runId");
    const bufferedSnapshot = bufferedStore.inspectRun(safeRunId);
    if (!bufferedSnapshot.complete) throw new ContractError("TRACE_STAGING_INCOMPLETE", "only a complete finalized buffered run can be staged");
    const stagedStore = createStagingStore();
    try {
      materializeBufferedSnapshot(stagedStore, bufferedSnapshot);
      return stagedStore;
    } catch (error) {
      discardStagingStore(stagedStore);
      throw error;
    }
  }

  function commitBufferedRun(bufferedStore, runId) {
    const stagedStore = createStagedRunFromBuffered(bufferedStore, runId);
    let stagingDiscarded = false;
    let commitSucceeded = false;
    let primaryError = null;
    try {
      const committed = commitStagedRun(stagedStore, runId, {
        beforePublish: () => {
          discardStagingStore(stagedStore);
          stagingDiscarded = true;
        },
      });
      commitSucceeded = true;
      return committed;
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      if (!stagingDiscarded && STORE_INTERNALS.has(stagedStore)) {
        try {
          discardStagingStore(stagedStore);
        } catch (cleanupError) {
          if (!commitSucceeded && primaryError === null) throw cleanupError;
          // Preserve the primary publication failure. If commitStagedRun
          // already confirmed identical durable contents, staging cleanup is
          // best-effort and must not turn idempotent success into a failure.
        }
      }
    }
  }

  function discardBufferedStore(bufferedStore) {
    const buffered = STORE_INTERNALS.get(bufferedStore);
    if (buffered?.kind !== "buffered") throw new ContractError("TRACE_BUFFERED_STORE", "discard requires a store created by createBufferedStore");
    buffered.runs.clear();
    STORE_INTERNALS.delete(bufferedStore);
  }

  const api = Object.freeze({
    createRun,
    appendEvent,
    recordContextReceipt,
    createJob,
    transitionJob,
    completeJob,
    recordVerification,
    finalizeRun,
    inspectRun,
    createBufferedStore,
    commitBufferedRun,
    discardBufferedStore,
    createStagingStore,
    createStagedRunFromBuffered,
    commitStagedRun,
    discardStagingStore,
  });
  STORE_INTERNALS.set(api, { kind: "disk", harnessRoot, runsRoot, stagingRoot: null, limits });
  return api;
}

export function createAdapterInstrumentation(store, defaults) {
  if (!store || typeof store.appendEvent !== "function") throw new ContractError("TRACE_ADAPTER_STORE", "store must be a trace store");
  const keys = ["run_id", "task_id", "parent_task_id", "agent", "risk", "strategy_id"];
  exact(defaults, keys, ["run_id", "task_id", "agent"], "adapter instrumentation defaults");
  const runId = assertSafePersistenceId(defaults.run_id, "adapter instrumentation.run_id");
  const taskId = assertSafePersistenceId(defaults.task_id, "adapter instrumentation.task_id");
  const parentTaskId = nullableId(defaults.parent_task_id, "adapter instrumentation.parent_task_id");
  const agent = assertSafePersistenceId(defaults.agent, "adapter instrumentation.agent");
  const risk = assertEnum(defaults.risk ?? "standard", RISK_LEVELS, "adapter instrumentation.risk");
  const strategyId = nullableId(defaults.strategy_id, "adapter instrumentation.strategy_id");

  const facadeEventKeys = EVENT_INPUT_KEYS.filter((key) => !["task_id", "parent_task_id", "agent", "risk", "strategy_id"].includes(key));
  const facade = {
    emit(input) {
      exact(input, facadeEventKeys, ["event_type", "summary", "status"], "adapter event");
      return store.appendEvent(runId, { ...input, task_id: taskId, parent_task_id: parentTaskId, agent, risk, strategy_id: strategyId });
    },
    recordContextReceipt(input) {
      exact(input, ["source_kind", "summary", "relative_paths", "snapshot_fingerprint"], ["source_kind", "summary", "relative_paths", "snapshot_fingerprint"], "adapter context receipt");
      return store.recordContextReceipt(runId, { ...input, task_id: taskId });
    },
    createJob(input) {
      exact(input, ["task_id", "agent", "assigned_scope", "write_scope", "risk"], ["agent", "assigned_scope"], "adapter job");
      return store.createJob(runId, { ...input, parent_task_id: taskId, risk: input.risk ?? risk });
    },
    transitionJob(delegatedTaskId, input) {
      return store.transitionJob(runId, delegatedTaskId, input);
    },
    completeJob(delegatedTaskId, input) {
      return store.completeJob(runId, delegatedTaskId, input);
    },
  };
  return Object.freeze(facade);
}
