import { TRACE_SCHEMA_VERSION, assertEnum, assertSafeId } from "../feedback/contracts.mjs";
import { INTEGRATED_VERIFICATION_EVIDENCE_SCHEMA_VERSION } from "./constants.mjs";
import {
  ContractError,
  assertArray,
  assertFingerprint,
  assertInteger,
  assertIso,
  assertSchemaVersion,
  assertString,
  assertStringArray,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

const RECEIPT_PHASES = Object.freeze(["preimplementation", "slice", "integration", "live"]);
const RECEIPT_STATUSES = Object.freeze(["passed", "failed", "incomplete"]);

const CHECK_RECEIPT_KEYS = Object.freeze([
  "receipt_id",
  "check_id",
  "trusted_producer",
  "phase",
  "status",
  "command_or_mechanism",
  "evidence_fingerprint",
  "completed_at",
]);

const MECHANISM_RECEIPT_KEYS = Object.freeze([
  "receipt_id",
  "mechanism_id",
  "trusted_producer",
  "phase",
  "status",
  "evidence_fingerprint",
  "completed_at",
]);

const EVIDENCE_KEYS = Object.freeze([
  "schema_version",
  "evidence_id",
  "run_id",
  "task_id",
  "dossier_id",
  "dossier_fingerprint",
  "gate_id",
  "gate_fingerprint",
  "check_catalog_fingerprint",
  "workspace_fingerprint",
  "trace_event_id",
  "trace_event_sequence",
  "trace_event_timestamp",
  "trace_event_fingerprint",
  "check_receipts",
  "mechanism_receipts",
  "completed_at",
  "fingerprint",
]);

function validateCheckReceipt(value, label) {
  exact(value, CHECK_RECEIPT_KEYS, CHECK_RECEIPT_KEYS, label);
  assertSafeId(value.receipt_id, `${label}.receipt_id`);
  assertSafeId(value.check_id, `${label}.check_id`);
  assertString(value.trusted_producer, `${label}.trusted_producer`, { maxBytes: 256 });
  assertEnum(value.phase, RECEIPT_PHASES, `${label}.phase`);
  assertEnum(value.status, RECEIPT_STATUSES, `${label}.status`);
  assertString(value.command_or_mechanism, `${label}.command_or_mechanism`, { maxBytes: 1024 });
  assertFingerprint(value.evidence_fingerprint, `${label}.evidence_fingerprint`);
  assertIso(value.completed_at, `${label}.completed_at`);
  return value;
}

function validateMechanismReceipt(value, label) {
  exact(value, MECHANISM_RECEIPT_KEYS, MECHANISM_RECEIPT_KEYS, label);
  assertSafeId(value.receipt_id, `${label}.receipt_id`);
  assertSafeId(value.mechanism_id, `${label}.mechanism_id`);
  assertString(value.trusted_producer, `${label}.trusted_producer`, { maxBytes: 256 });
  assertEnum(value.phase, RECEIPT_PHASES, `${label}.phase`);
  assertEnum(value.status, RECEIPT_STATUSES, `${label}.status`);
  assertFingerprint(value.evidence_fingerprint, `${label}.evidence_fingerprint`);
  assertIso(value.completed_at, `${label}.completed_at`);
  return value;
}

function assertUniqueReceipts(checkReceipts, mechanismReceipts) {
  const receiptIds = [...checkReceipts, ...mechanismReceipts].map((entry) => entry.receipt_id);
  if (new Set(receiptIds).size !== receiptIds.length) {
    throw new ContractError("QUALITY_INTEGRATED_EVIDENCE_DUPLICATE", "integrated verification receipt IDs must be unique");
  }
  for (const [entries, key, label] of [
    [checkReceipts, "check_id", "check"],
    [mechanismReceipts, "mechanism_id", "mechanism"],
  ]) {
    const ids = entries.map((entry) => entry[key]);
    if (new Set(ids).size !== ids.length) {
      throw new ContractError("QUALITY_INTEGRATED_EVIDENCE_DUPLICATE", `integrated verification has duplicate ${label} receipts`);
    }
  }
}

function traceVerifierCodes(event) {
  const topLevel = assertStringArray(event.verifier_codes, "integrated verification trace event.verifier_codes", {
    min: 1,
    maxBytes: 128,
  });
  if (event.verification === null || typeof event.verification !== "object" || Array.isArray(event.verification)) {
    throw new ContractError("QUALITY_INTEGRATED_TRACE_EVENT", "integrated verification requires structured trace verification evidence");
  }
  exact(
    event.verification,
    ["status", "summary", "verifier_codes"],
    ["status", "summary", "verifier_codes"],
    "integrated verification trace event.verification",
  );
  assertEnum(event.verification.status, ["passed"], "integrated verification trace event.verification.status");
  assertString(event.verification.summary, "integrated verification trace event.verification.summary", { maxBytes: 2048 });
  const nested = assertStringArray(
    event.verification.verifier_codes,
    "integrated verification trace event.verification.verifier_codes",
    { min: 1, maxBytes: 128 },
  );
  if (event.truncation?.verifier_codes?.truncated || event.truncation?.verification?.truncated) {
    throw new ContractError("QUALITY_INTEGRATED_TRACE_EVENT", "integrated verification trace verifier codes must not be truncated");
  }
  return { topLevel: new Set(topLevel), nested: new Set(nested) };
}

function validateVerificationTraceEvent(value, { runId = null, taskId = null } = {}) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ContractError("QUALITY_INTEGRATED_TRACE_EVENT", "trace_event must be a stored trace event");
  }
  if (value.schema_version !== TRACE_SCHEMA_VERSION) {
    throw new ContractError("QUALITY_INTEGRATED_TRACE_EVENT", `trace_event.schema_version must be ${TRACE_SCHEMA_VERSION}`);
  }
  assertSafeId(value.event_id, "integrated verification trace event.event_id");
  assertInteger(value.sequence, "integrated verification trace event.sequence", { min: 1 });
  assertSafeId(value.run_id, "integrated verification trace event.run_id");
  assertSafeId(value.task_id, "integrated verification trace event.task_id");
  if (runId !== null && value.run_id !== runId) {
    throw new ContractError("QUALITY_INTEGRATED_TRACE_EVENT", "trace event run_id does not match integrated evidence");
  }
  if (taskId !== null && value.task_id !== taskId) {
    throw new ContractError("QUALITY_INTEGRATED_TRACE_EVENT", "trace event task_id does not match integrated evidence");
  }
  assertEnum(value.event_type, ["verification"], "integrated verification trace event.event_type");
  assertEnum(value.status, ["completed"], "integrated verification trace event.status");
  assertIso(value.timestamp, "integrated verification trace event.timestamp");
  const codes = traceVerifierCodes(value);
  return { value, ...codes };
}

export function verificationTraceEventFingerprint(traceEvent) {
  const validated = validateVerificationTraceEvent(traceEvent);
  return fingerprint(validated.value);
}

function evidenceFingerprintInput(evidence) {
  const copy = { ...evidence };
  delete copy.fingerprint;
  return copy;
}

export function validateIntegratedVerificationEvidence(value) {
  exact(value, EVIDENCE_KEYS, EVIDENCE_KEYS, "integrated verification evidence");
  assertSchemaVersion(
    value.schema_version,
    INTEGRATED_VERIFICATION_EVIDENCE_SCHEMA_VERSION,
    "integrated verification evidence",
  );
  for (const key of ["evidence_id", "run_id", "task_id", "dossier_id", "gate_id", "trace_event_id"]) {
    assertSafeId(value[key], `integrated verification evidence.${key}`);
  }
  for (const key of [
    "dossier_fingerprint",
    "gate_fingerprint",
    "check_catalog_fingerprint",
    "workspace_fingerprint",
    "trace_event_fingerprint",
  ]) {
    assertFingerprint(value[key], `integrated verification evidence.${key}`);
  }
  assertInteger(value.trace_event_sequence, "integrated verification evidence.trace_event_sequence", { min: 1 });
  assertIso(value.trace_event_timestamp, "integrated verification evidence.trace_event_timestamp");
  assertArray(value.check_receipts, "integrated verification evidence.check_receipts", {
    min: 1,
    item: validateCheckReceipt,
  });
  assertArray(value.mechanism_receipts, "integrated verification evidence.mechanism_receipts", {
    item: validateMechanismReceipt,
  });
  assertUniqueReceipts(value.check_receipts, value.mechanism_receipts);
  assertIso(value.completed_at, "integrated verification evidence.completed_at");
  if (value.completed_at !== value.trace_event_timestamp) {
    throw new ContractError(
      "QUALITY_INTEGRATED_EVIDENCE_TIME",
      "integrated verification completed_at must equal the authoritative trace event timestamp",
    );
  }
  for (const receipt of [...value.check_receipts, ...value.mechanism_receipts]) {
    if (Date.parse(receipt.completed_at) > Date.parse(value.completed_at)) {
      throw new ContractError("QUALITY_INTEGRATED_EVIDENCE_TIME", "receipt completion cannot follow integrated verification");
    }
  }
  assertFingerprint(value.fingerprint, "integrated verification evidence.fingerprint");
  if (!fingerprintsEqual(value.fingerprint, fingerprint(evidenceFingerprintInput(value)))) {
    throw new ContractError("QUALITY_INTEGRATED_EVIDENCE_FINGERPRINT", "integrated verification evidence fingerprint mismatch");
  }
  return value;
}

export function createIntegratedVerificationEvidence(input) {
  const keys = [
    "evidence_id",
    "run_id",
    "task_id",
    "dossier_id",
    "dossier_fingerprint",
    "gate_id",
    "gate_fingerprint",
    "check_catalog_fingerprint",
    "workspace_fingerprint",
    "trace_event",
    "check_receipts",
    "mechanism_receipts",
    "completed_at",
  ];
  exact(input, keys, keys, "integrated verification evidence input");
  const trace = validateVerificationTraceEvent(input.trace_event, { runId: input.run_id, taskId: input.task_id });
  const targetIds = [
    ...input.check_receipts.map((entry) => entry.check_id),
    ...input.mechanism_receipts.map((entry) => entry.mechanism_id),
  ];
  for (const targetId of targetIds) {
    if (!trace.topLevel.has(targetId) || !trace.nested.has(targetId)) {
      throw new ContractError(
        "QUALITY_INTEGRATED_TRACE_EVENT",
        `authoritative trace event does not bind verification target ${targetId}`,
      );
    }
  }
  const source = {
    schema_version: INTEGRATED_VERIFICATION_EVIDENCE_SCHEMA_VERSION,
    evidence_id: input.evidence_id,
    run_id: input.run_id,
    task_id: input.task_id,
    dossier_id: input.dossier_id,
    dossier_fingerprint: input.dossier_fingerprint,
    gate_id: input.gate_id,
    gate_fingerprint: input.gate_fingerprint,
    check_catalog_fingerprint: input.check_catalog_fingerprint,
    workspace_fingerprint: input.workspace_fingerprint,
    trace_event_id: input.trace_event.event_id,
    trace_event_sequence: input.trace_event.sequence,
    trace_event_timestamp: input.trace_event.timestamp,
    trace_event_fingerprint: fingerprint(input.trace_event),
    check_receipts: input.check_receipts,
    mechanism_receipts: input.mechanism_receipts,
    completed_at: input.completed_at,
  };
  const evidence = { ...source, fingerprint: fingerprint(source) };
  validateIntegratedVerificationEvidence(evidence);
  return deepFrozenClone(evidence, "integrated verification evidence");
}

export function integratedVerificationEvidenceFingerprintInput(evidence) {
  validateIntegratedVerificationEvidence(evidence);
  return deepFrozenClone(evidenceFingerprintInput(evidence), "integrated verification evidence fingerprint input");
}
