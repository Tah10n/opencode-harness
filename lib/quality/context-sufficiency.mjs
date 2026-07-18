import { assertEnum } from "../feedback/contracts.mjs";
import { validateEngineeringDossier } from "./dossier.mjs";
import {
  ADVANCED_CONTEXT_TOOLS,
  CONTEXT_DEEP_DIMENSIONS,
  MINIMAL_CONTEXT_TOOLS,
  validateContextStrategyBinding,
} from "./context-strategies.mjs";
import { detectInstalledContextToolSurface } from "./context-tool-overlay.mjs";
import { classifyContextPathKind } from "./context-path-kind.mjs";
import { validateContextReceipt } from "./context-receipts.mjs";
import { engineeringDossierAnalysisFingerprint, validateWholeSystemContextReport } from "./whole-system-context-report.mjs";
import {
  ContractError,
  assertArray,
  assertBoolean,
  assertFingerprint,
  assertInteger,
  assertIso,
  assertPlain,
  assertStableTypedId,
  assertString,
  assertStringArray,
  canonicalJson,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

export const CONTEXT_SUFFICIENCY_DECISION_SCHEMA_VERSION = 1;
export const STANDARD_LITE_CONTEXT_SUMMARY_SCHEMA_VERSION = 1;
export const CONTEXT_RECEIPT_EVIDENCE_INDEX_SCHEMA_VERSION = 2;
export const CONTEXT_TASK_PROFILE_EVIDENCE_SCHEMA_VERSION = 1;
export const CONTEXT_TASK_PROFILE_EVIDENCE_PRODUCER = "opencode-harness/context-task-profile-evidence-v1";
export const CONTEXT_SUFFICIENCY_STATUSES = Object.freeze(["sufficient", "insufficient", "blocked"]);

export const CONTEXT_SUFFICIENCY_REASON_CODES = Object.freeze([
  "CONTEXT_WIDE_CATEGORY_MISSING",
  "CONTEXT_CLAIM_EVIDENCE_MISSING",
  "CONTEXT_DIRECT_PATH_MISSING",
  "CONTEXT_TRANSITIVE_PATH_MISSING",
  "CONTEXT_CRITICAL_PATH_DEEP_MISSING",
  "CONTEXT_DEEP_DIMENSION_UNCLASSIFIED",
  "CONTEXT_VERIFICATION_MAPPING_MISSING",
  "CONTEXT_BLOCKING_UNKNOWN",
  "CONTEXT_TRUNCATION_UNRESOLVED",
  "CONTEXT_TOOL_AVAILABILITY_UNOBSERVED",
  "CONTEXT_SEMANTIC_COMPLETENESS_UNSUPPORTED",
  "CONTEXT_SIBLING_DISCOVERY_MISSING",
  "CONTEXT_OWNING_ABSTRACTION_MISSING",
  "CONTEXT_REPRODUCTION_MISSING",
  "CONTEXT_CHARACTERIZATION_MISSING",
  "CONTEXT_NEGATIVE_PATH_MISSING",
  "CONTEXT_COMPATIBILITY_ANALYSIS_MISSING",
  "CONTEXT_CRITICAL_RISK_ANALYSIS_MISSING",
  "CONTEXT_RECEIPT_UNKNOWN",
  "CONTEXT_RECEIPT_DUPLICATE",
  "CONTEXT_RECEIPT_BINDING_INVALID",
  "CONTEXT_RECEIPT_AFTER_MUTATION",
  "CONTEXT_FINALIZED_AFTER_MUTATION",
  "CONTEXT_GRAPH_PATH_MISMATCH",
  "CONTEXT_EVIDENCE_STALE",
  "CONTEXT_REFUTED_HYPOTHESIS_UNAPPLIED",
  "CONTEXT_REQUIRED_QUESTION_MISSING",
  "CONTEXT_BUDGET_EXHAUSTED",
  "CONTEXT_STANDARD_LITE_EVIDENCE_MISSING",
  "CONTEXT_STANDARD_LITE_OVERANALYSIS",
  "CONTEXT_STANDARD_LITE_ESCALATION_REQUIRED",
  "CONTEXT_REPORT_MISSING",
  "CONTEXT_REPORT_NOT_FINALIZED",
]);

const DECISION_KEYS = Object.freeze([
  "schema_version", "decision_id", "session_key", "run_id", "task_id", "risk_class", "strategy_id",
  "strategy_binding_fingerprint", "workspace_fingerprint", "dossier_id", "dossier_analysis_fingerprint",
  "impact_graph_id", "impact_graph_fingerprint", "report_id", "report_fingerprint",
  "receipt_index_fingerprint", "preimplementation_cutoff_sequence", "implementation_started_sequence",
  "task_profile_evidence", "status", "reasons", "evaluated_at", "fingerprint",
]);
const STANDARD_SUMMARY_KEYS = Object.freeze([
  "schema_version", "summary_id", "session_key", "run_id", "task_id", "strategy_id",
  "strategy_binding_fingerprint", "workspace_fingerprint", "dossier_id", "dossier_analysis_fingerprint",
  "receipt_ids", "inspected_paths", "context_calls", "read_only_subagents", "broad_fanout",
  "discovered_scope_facts", "finalized_at", "fingerprint",
]);
const DISCOVERED_SCOPE_KEYS = Object.freeze([
  "public_contract", "transitive_consumer", "persistence", "concurrency", "security", "migration", "multi_module",
]);
const BLOCKING_REASON_CODES = new Set([
  "CONTEXT_RECEIPT_BINDING_INVALID",
  "CONTEXT_RECEIPT_DUPLICATE",
  "CONTEXT_RECEIPT_AFTER_MUTATION",
  "CONTEXT_FINALIZED_AFTER_MUTATION",
  "CONTEXT_EVIDENCE_STALE",
  "CONTEXT_BUDGET_EXHAUSTED",
]);

function receiptEntries(receiptIndex) {
  const entries = Array.isArray(receiptIndex) ? receiptIndex : receiptIndex?.receipts;
  if (!Array.isArray(entries)) throw new ContractError("CONTEXT_RECEIPT_INDEX_INVALID", "context receipt index must expose a receipts array");
  return entries;
}

export function contentBackedInspectedPaths(receiptIndex, { receipt_ids: receiptIds = null } = {}) {
  const selected = receiptIds === null ? null : new Set(receiptIds);
  return [...new Set(receiptEntries(receiptIndex).flatMap((entry) => {
    if (selected !== null && !selected.has(entry?.receipt_id)) return [];
    if (entry?.status !== "success" || !["context_read", "context_search"].includes(entry.tool_id)) return [];
    const coverage = entry.result?.coverage;
    if (coverage?.partial !== false || coverage.complete !== true || coverage.stable !== true
      || coverage.changed_during_operation !== false) return [];
    return (entry.result?.line_ranges ?? []).map((range) => range.path);
  }))].sort();
}

export function createContextReceiptEvidenceIndex(receiptIndex, {
  session_key: sessionKey,
  run_id: runId,
  task_id: taskId,
  source_fingerprint: sourceFingerprint,
} = {}) {
  const receipts = receiptEntries(receiptIndex);
  const entries = receipts.map((entry) => {
    validateContextReceipt(entry);
    if (entry.session_key !== sessionKey || entry.run_id !== runId || entry.task_id !== taskId || entry.source_fingerprint !== sourceFingerprint) {
      throw new ContractError("CONTEXT_RECEIPT_BINDING_INVALID", "context receipt index contains evidence from another session, run, task, or workspace");
    }
    const observedPaths = [...new Set([
      ...(entry.result?.relative_paths ?? []),
      ...(entry.result?.line_ranges ?? []).map((range) => range.path),
      ...(entry.result?.symbol_ids ?? []).map((symbol) => symbol.path),
      ...(entry.result?.relationships ?? []).map((relationship) => relationship.path),
    ])].sort();
    return {
      receipt_id: entry.receipt_id,
      sequence: entry.sequence,
      tool_id: entry.tool_id,
      status: entry.status,
      requested_paths: [...entry.request.scope_paths].sort(),
      observed_paths: observedPaths,
      relationship_paths: [...new Set((entry.result?.relationships ?? []).map((relationship) => relationship.path))].sort(),
      guidance_paths: [...new Set(entry.result?.guidance_paths ?? [])].sort(),
      tool_inventory: [...(entry.result?.tool_inventory ?? [])].sort(),
      coverage: entry.result === null ? null : {
        partial: entry.result.coverage.partial,
        complete: entry.result.coverage.complete,
        stable: entry.result.coverage.stable,
        changed_during_operation: entry.result.coverage.changed_during_operation,
      },
      fingerprint: entry.fingerprint,
    };
  }).sort((left, right) => left.sequence - right.sequence || left.receipt_id.localeCompare(right.receipt_id));
  const paths = new Set(receipts.flatMap((entry) => entry.result?.relative_paths ?? []));
  const resultFingerprints = receipts.map((entry) => entry.result?.result_fingerprint).filter(Boolean);
  const source = {
    schema_version: CONTEXT_RECEIPT_EVIDENCE_INDEX_SCHEMA_VERSION,
    session_key: sessionKey,
    run_id: runId,
    task_id: taskId,
    source_fingerprint: sourceFingerprint,
    receipts: entries,
    metrics: {
      context_tool_calls: entries.length,
      unique_paths_inspected: paths.size,
      duplicate_read_count: resultFingerprints.length - new Set(resultFingerprints).size,
      truncation_count: entries.filter((entry) => entry.status === "truncated").length,
      semantic_tools_observed: [...new Set(entries.map((entry) => entry.tool_id).filter((tool) => ["context_map", "context_symbols", "context_related"].includes(tool)))].sort(),
    },
  };
  return deepFrozenClone({ ...source, fingerprint: fingerprint(source) }, "context receipt evidence index");
}

export function validateContextReceiptEvidenceIndex(value) {
  assertPlain(value, "context receipt evidence index");
  const keys = ["schema_version", "session_key", "run_id", "task_id", "source_fingerprint", "receipts", "metrics", "fingerprint"];
  exact(value, keys, keys, "context receipt evidence index");
  if (value.schema_version !== CONTEXT_RECEIPT_EVIDENCE_INDEX_SCHEMA_VERSION) throw new ContractError("CONTEXT_RECEIPT_INDEX_SCHEMA", "context receipt evidence index schema is unsupported");
  for (const key of ["session_key", "run_id", "task_id"]) assertString(value[key], `context receipt evidence index.${key}`, { maxBytes: 256 });
  assertFingerprint(value.source_fingerprint, "context receipt evidence index.source_fingerprint");
  assertArray(value.receipts, "context receipt evidence index.receipts", { max: 512, item: (entry, label) => {
    assertPlain(entry, label);
    const entryKeys = ["receipt_id", "sequence", "tool_id", "status", "requested_paths", "observed_paths", "relationship_paths", "guidance_paths", "tool_inventory", "coverage", "fingerprint"];
    exact(entry, entryKeys, entryKeys, label);
    assertString(entry.receipt_id, `${label}.receipt_id`, { maxBytes: 128 });
    assertInteger(entry.sequence, `${label}.sequence`, { min: 1 });
    assertString(entry.tool_id, `${label}.tool_id`, { maxBytes: 128 });
    assertString(entry.status, `${label}.status`, { maxBytes: 64 });
    assertStringArray(entry.requested_paths, `${label}.requested_paths`, { max: 256, maxBytes: 1024 });
    for (const key of ["observed_paths", "relationship_paths", "guidance_paths"]) {
      assertStringArray(entry[key], `${label}.${key}`, { path: true, max: 256, maxBytes: 1024 });
    }
    assertStringArray(entry.tool_inventory, `${label}.tool_inventory`, { max: 8, maxBytes: 128 });
    if (entry.coverage !== null) {
      assertPlain(entry.coverage, `${label}.coverage`);
      const coverageKeys = ["partial", "complete", "stable", "changed_during_operation"];
      exact(entry.coverage, coverageKeys, coverageKeys, `${label}.coverage`);
      for (const key of coverageKeys) assertBoolean(entry.coverage[key], `${label}.coverage.${key}`);
    }
    assertFingerprint(entry.fingerprint, `${label}.fingerprint`);
  } });
  if (new Set(value.receipts.map((entry) => entry.receipt_id)).size !== value.receipts.length) throw new ContractError("CONTEXT_RECEIPT_DUPLICATE", "context receipt evidence index contains duplicate identities");
  assertPlain(value.metrics, "context receipt evidence index.metrics");
  const metricKeys = ["context_tool_calls", "unique_paths_inspected", "duplicate_read_count", "truncation_count", "semantic_tools_observed"];
  exact(value.metrics, metricKeys, metricKeys, "context receipt evidence index.metrics");
  for (const key of metricKeys.filter((entry) => entry !== "semantic_tools_observed")) assertInteger(value.metrics[key], `context receipt evidence index.metrics.${key}`, { min: 0, max: 100000 });
  assertStringArray(value.metrics.semantic_tools_observed, "context receipt evidence index.metrics.semantic_tools_observed", { max: 8, maxBytes: 128 });
  assertFingerprint(value.fingerprint, "context receipt evidence index.fingerprint");
  const source = { ...value };
  delete source.fingerprint;
  if (!fingerprintsEqual(value.fingerprint, fingerprint(source))) throw new ContractError("CONTEXT_RECEIPT_INDEX_FINGERPRINT", "context receipt evidence index fingerprint is invalid");
  return value;
}

export function contextReceiptIndexFingerprint(receiptIndex, binding) {
  return createContextReceiptEvidenceIndex(receiptIndex, binding).fingerprint;
}

function addReason(reasons, code, message, subjectIds = []) {
  if (!CONTEXT_SUFFICIENCY_REASON_CODES.includes(code)) throw new ContractError("CONTEXT_REASON_CODE_UNKNOWN", `unknown context reason code ${code}`);
  const existing = reasons.find((entry) => entry.code === code);
  if (existing) {
    existing.subject_ids = [...new Set([...existing.subject_ids, ...subjectIds])].sort().slice(0, 64);
    return;
  }
  reasons.push({ identity: code, code, subject_ids: [...new Set(subjectIds)].sort().slice(0, 64), message });
}

function validateReason(value, label) {
  assertPlain(value, label);
  exact(value, ["code", "subject_ids", "message"], ["code", "subject_ids", "message"], label);
  assertEnum(value.code, CONTEXT_SUFFICIENCY_REASON_CODES, `${label}.code`);
  assertStringArray(value.subject_ids, `${label}.subject_ids`, { max: 64, maxBytes: 512 });
  assertString(value.message, `${label}.message`, { maxBytes: 2000 });
}

function decisionFingerprintInput(decision) {
  const copy = JSON.parse(canonicalJson(decision));
  delete copy.fingerprint;
  return copy;
}

function validateContextTaskProfileCheck(value, label) {
  assertPlain(value, label);
  const keys = [
    "obligation_id", "check_id", "purpose", "phase", "status", "observed_outcome",
    "trusted_producer", "command_or_mechanism", "evidence_fingerprint", "completed_at",
  ];
  exact(value, keys, keys, label);
  for (const key of ["obligation_id", "check_id", "trusted_producer", "command_or_mechanism"]) {
    assertString(value[key], `${label}.${key}`, { maxBytes: 2000 });
  }
  assertEnum(value.purpose, ["reproducer", "characterization"], `${label}.purpose`);
  if (value.phase !== "preimplementation") throw new ContractError("CONTEXT_TASK_PROFILE_EVIDENCE_PHASE", `${label}.phase must be preimplementation`);
  assertEnum(value.status, ["passed", "failed", "blocked"], `${label}.status`);
  assertEnum(value.observed_outcome, ["failing_reproducer", "passing_characterization", "unavailable", "failed"], `${label}.observed_outcome`);
  const expectedStatus = ["failing_reproducer", "passing_characterization"].includes(value.observed_outcome)
    ? "passed"
    : value.observed_outcome === "failed" ? "failed" : "blocked";
  if (value.status !== expectedStatus
    || (value.purpose === "reproducer" && value.observed_outcome === "passing_characterization")
    || (value.purpose === "characterization" && value.observed_outcome === "failing_reproducer")) {
    throw new ContractError("CONTEXT_TASK_PROFILE_EVIDENCE_OUTCOME", `${label} has an incoherent purpose, status, or observed outcome`);
  }
  assertFingerprint(value.evidence_fingerprint, `${label}.evidence_fingerprint`);
  assertIso(value.completed_at, `${label}.completed_at`);
}

export function validateContextTaskProfileEvidence(value, { dossier = null } = {}) {
  if (value === null) return null;
  assertPlain(value, "context task-profile evidence");
  const keys = [
    "schema_version", "producer", "evidence_id", "session_key", "run_id", "task_id", "workspace_fingerprint",
    "dossier_id", "dossier_analysis_fingerprint", "checks", "created_at", "fingerprint",
  ];
  exact(value, keys, keys, "context task-profile evidence");
  if (value.schema_version !== CONTEXT_TASK_PROFILE_EVIDENCE_SCHEMA_VERSION || value.producer !== CONTEXT_TASK_PROFILE_EVIDENCE_PRODUCER) {
    throw new ContractError("CONTEXT_TASK_PROFILE_EVIDENCE_SCHEMA", "context task-profile evidence producer or schema is unsupported");
  }
  assertStableTypedId(value.evidence_id, "CTXPROFILE", "context task-profile evidence.evidence_id");
  for (const key of ["session_key", "run_id", "task_id", "dossier_id"]) assertString(value[key], `context task-profile evidence.${key}`, { maxBytes: 256 });
  for (const key of ["workspace_fingerprint", "dossier_analysis_fingerprint", "fingerprint"]) assertFingerprint(value[key], `context task-profile evidence.${key}`);
  assertArray(value.checks, "context task-profile evidence.checks", { max: 32, item: validateContextTaskProfileCheck });
  if (new Set(value.checks.map((entry) => entry.obligation_id)).size !== value.checks.length
    || new Set(value.checks.map((entry) => entry.check_id)).size !== value.checks.length) {
    throw new ContractError("CONTEXT_TASK_PROFILE_EVIDENCE_DUPLICATE", "context task-profile evidence checks must be unique");
  }
  assertIso(value.created_at, "context task-profile evidence.created_at");
  if (dossier !== null) {
    validateEngineeringDossier(dossier);
    const obligations = new Map(dossier.test_obligations.map((entry) => [entry.id, entry]));
    for (const check of value.checks) {
      const obligation = obligations.get(check.obligation_id);
      if (!obligation || obligation.check_id !== check.check_id || obligation.phase !== "preimplementation"
        || obligation.kind !== check.purpose || obligation.trusted_producer !== check.trusted_producer
        || obligation.command_or_mechanism !== check.command_or_mechanism) {
        throw new ContractError("CONTEXT_TASK_PROFILE_EVIDENCE_BINDING", `context task-profile check ${check.obligation_id} does not bind a matching dossier obligation`);
      }
      if (Date.parse(check.completed_at) > Date.parse(value.created_at)) {
        throw new ContractError("CONTEXT_TASK_PROFILE_EVIDENCE_TIME", `context task-profile check ${check.obligation_id} completed after its evidence artifact`);
      }
    }
  }
  const source = { ...value };
  delete source.fingerprint;
  if (!fingerprintsEqual(value.fingerprint, fingerprint(source))) throw new ContractError("CONTEXT_TASK_PROFILE_EVIDENCE_FINGERPRINT", "context task-profile evidence fingerprint is invalid");
  return value;
}

export function createContextTaskProfileEvidence({
  evidence_id: evidenceId,
  session_key: sessionKey,
  workspace_fingerprint: workspaceFingerprint,
  dossier,
  checks = [],
  created_at: createdAt,
} = {}) {
  validateEngineeringDossier(dossier);
  const source = {
    schema_version: CONTEXT_TASK_PROFILE_EVIDENCE_SCHEMA_VERSION,
    producer: CONTEXT_TASK_PROFILE_EVIDENCE_PRODUCER,
    evidence_id: evidenceId,
    session_key: sessionKey,
    run_id: dossier.run_id,
    task_id: dossier.task_id,
    workspace_fingerprint: workspaceFingerprint,
    dossier_id: dossier.dossier_id,
    dossier_analysis_fingerprint: engineeringDossierAnalysisFingerprint(dossier),
    checks: checks.map((entry) => ({ ...entry }))
      .sort((left, right) => left.obligation_id.localeCompare(right.obligation_id) || left.check_id.localeCompare(right.check_id)),
    created_at: createdAt,
  };
  const evidence = deepFrozenClone({ ...source, fingerprint: fingerprint(source) }, "context task-profile evidence");
  validateContextTaskProfileEvidence(evidence, { dossier });
  return evidence;
}

export function validateContextSufficiencyDecision(value) {
  assertPlain(value, "context sufficiency decision");
  exact(value, DECISION_KEYS, DECISION_KEYS, "context sufficiency decision");
  if (value.schema_version !== CONTEXT_SUFFICIENCY_DECISION_SCHEMA_VERSION) throw new ContractError("CONTEXT_DECISION_SCHEMA", "context sufficiency decision schema is unsupported");
  assertStableTypedId(value.decision_id, "CTXDEC", "context sufficiency decision.decision_id");
  for (const key of ["session_key", "run_id", "task_id", "dossier_id"]) assertString(value[key], `context sufficiency decision.${key}`, { maxBytes: 256 });
  assertEnum(value.risk_class, ["standard-lite", "high", "critical"], "context sufficiency decision.risk_class");
  assertEnum(value.strategy_id, ["standard-lite-local-v1", "high-wide-deep-v1", "critical-wide-deep-v1"], "context sufficiency decision.strategy_id");
  for (const key of ["strategy_binding_fingerprint", "workspace_fingerprint", "dossier_analysis_fingerprint", "receipt_index_fingerprint", "fingerprint"]) assertFingerprint(value[key], `context sufficiency decision.${key}`);
  for (const key of ["impact_graph_id", "report_id"]) if (value[key] !== null) assertString(value[key], `context sufficiency decision.${key}`, { maxBytes: 256 });
  for (const key of ["impact_graph_fingerprint", "report_fingerprint"]) if (value[key] !== null) assertFingerprint(value[key], `context sufficiency decision.${key}`);
  const full = ["high", "critical"].includes(value.risk_class);
  if (full !== (value.report_id !== null && value.report_fingerprint !== null && value.impact_graph_id !== null && value.impact_graph_fingerprint !== null)) throw new ContractError("CONTEXT_DECISION_ARTIFACT_BINDING", "high/critical decisions require report and graph bindings; standard-lite forbids them");
  assertInteger(value.preimplementation_cutoff_sequence, "context sufficiency decision.preimplementation_cutoff_sequence", { min: 0 });
  if (value.implementation_started_sequence !== null) assertInteger(value.implementation_started_sequence, "context sufficiency decision.implementation_started_sequence", { min: 1 });
  validateContextTaskProfileEvidence(value.task_profile_evidence);
  assertEnum(value.status, CONTEXT_SUFFICIENCY_STATUSES, "context sufficiency decision.status");
  assertArray(value.reasons, "context sufficiency decision.reasons", { max: 64, item: validateReason });
  if ((value.status === "sufficient") !== (value.reasons.length === 0)) throw new ContractError("CONTEXT_DECISION_STATUS", "only a sufficient decision may have zero reasons");
  assertIso(value.evaluated_at, "context sufficiency decision.evaluated_at");
  const expected = fingerprint(decisionFingerprintInput(value));
  if (!fingerprintsEqual(value.fingerprint, expected)) throw new ContractError("CONTEXT_DECISION_FINGERPRINT", "context sufficiency decision fingerprint is invalid");
  return value;
}

function validateDiscoveredScopeFacts(value, label) {
  assertPlain(value, label);
  exact(value, DISCOVERED_SCOPE_KEYS, DISCOVERED_SCOPE_KEYS, label);
  for (const key of DISCOVERED_SCOPE_KEYS) assertBoolean(value[key], `${label}.${key}`);
}

function summaryFingerprintInput(summary) {
  const copy = JSON.parse(canonicalJson(summary));
  delete copy.fingerprint;
  return copy;
}

export function validateStandardLiteContextSummary(value) {
  assertPlain(value, "standard-lite context summary");
  exact(value, STANDARD_SUMMARY_KEYS, STANDARD_SUMMARY_KEYS, "standard-lite context summary");
  if (value.schema_version !== STANDARD_LITE_CONTEXT_SUMMARY_SCHEMA_VERSION) throw new ContractError("CONTEXT_STANDARD_LITE_SCHEMA", "standard-lite context summary schema is unsupported");
  assertStableTypedId(value.summary_id, "CTXLOCAL", "standard-lite context summary.summary_id");
  for (const key of ["session_key", "run_id", "task_id", "dossier_id"]) assertString(value[key], `standard-lite context summary.${key}`, { maxBytes: 256 });
  if (value.strategy_id !== "standard-lite-local-v1") throw new ContractError("CONTEXT_STANDARD_LITE_STRATEGY", "standard-lite summary requires the local strategy");
  for (const key of ["strategy_binding_fingerprint", "workspace_fingerprint", "dossier_analysis_fingerprint", "fingerprint"]) assertFingerprint(value[key], `standard-lite context summary.${key}`);
  assertStringArray(value.receipt_ids, "standard-lite context summary.receipt_ids", { max: 32, maxBytes: 256 });
  assertStringArray(value.inspected_paths, "standard-lite context summary.inspected_paths", { max: 12, maxBytes: 1000, path: true });
  assertInteger(value.context_calls, "standard-lite context summary.context_calls", { min: 0, max: 12 });
  assertInteger(value.read_only_subagents, "standard-lite context summary.read_only_subagents", { min: 0, max: 0 });
  assertBoolean(value.broad_fanout, "standard-lite context summary.broad_fanout");
  validateDiscoveredScopeFacts(value.discovered_scope_facts, "standard-lite context summary.discovered_scope_facts");
  assertIso(value.finalized_at, "standard-lite context summary.finalized_at");
  const expected = fingerprint(summaryFingerprintInput(value));
  if (!fingerprintsEqual(value.fingerprint, expected)) throw new ContractError("CONTEXT_STANDARD_LITE_FINGERPRINT", "standard-lite context summary fingerprint is invalid");
  return value;
}

export function createStandardLiteContextSummary({
  summary_id: summaryId,
  session_key: sessionKey,
  strategy_binding: strategyBinding,
  workspace_fingerprint: workspaceFingerprint,
  dossier,
  receipt_ids: receiptIds = [],
  inspected_paths: inspectedPaths = [],
  context_calls: contextCalls = 0,
  broad_fanout: broadFanout = false,
  discovered_scope_facts: discoveredScopeFacts = Object.fromEntries(DISCOVERED_SCOPE_KEYS.map((key) => [key, false])),
  finalized_at: finalizedAt,
} = {}) {
  validateContextStrategyBinding(strategyBinding);
  validateEngineeringDossier(dossier);
  if (strategyBinding.strategy_id !== "standard-lite-local-v1" || dossier.risk_class !== "standard-lite") throw new ContractError("CONTEXT_STANDARD_LITE_STRATEGY", "compact context summary requires standard-lite strategy and dossier");
  const source = {
    schema_version: STANDARD_LITE_CONTEXT_SUMMARY_SCHEMA_VERSION,
    summary_id: summaryId,
    session_key: sessionKey,
    run_id: dossier.run_id,
    task_id: dossier.task_id,
    strategy_id: strategyBinding.strategy_id,
    strategy_binding_fingerprint: strategyBinding.fingerprint,
    workspace_fingerprint: workspaceFingerprint,
    dossier_id: dossier.dossier_id,
    dossier_analysis_fingerprint: engineeringDossierAnalysisFingerprint(dossier),
    receipt_ids: [...new Set(receiptIds)].sort(),
    inspected_paths: [...new Set(inspectedPaths)].sort(),
    context_calls: contextCalls,
    read_only_subagents: 0,
    broad_fanout: broadFanout,
    discovered_scope_facts: { ...discoveredScopeFacts },
    finalized_at: finalizedAt,
  };
  const summary = deepFrozenClone({ ...source, fingerprint: fingerprint(source) }, "standard-lite context summary");
  validateStandardLiteContextSummary(summary);
  return summary;
}

function inspectReceiptBindings({ reasons, receiptIndex, referencedIds, sessionKey, runId, taskId, workspaceFingerprint, implementationStartedSequence, strategyBinding }) {
  const entries = receiptEntries(receiptIndex);
  const duplicateIds = entries.map((entry) => entry.receipt_id).filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateIds.length > 0) addReason(reasons, "CONTEXT_RECEIPT_DUPLICATE", "Receipt index contains a duplicated runner identity", duplicateIds);
  const map = new Map(entries.map((entry) => [entry.receipt_id, entry]));
  const invalidIds = new Set();
  for (const entry of entries) {
    try {
      validateContextReceipt(entry);
    } catch {
      invalidIds.add(entry?.receipt_id ?? "invalid-receipt");
      addReason(reasons, "CONTEXT_RECEIPT_BINDING_INVALID", "Context receipt failed the runner-owned receipt contract", [entry?.receipt_id ?? "invalid-receipt"]);
    }
    if (entry?.session_key !== sessionKey || entry?.run_id !== runId || entry?.task_id !== taskId
      || entry?.source_fingerprint !== workspaceFingerprint
      || entry?.context_strategy_id !== strategyBinding.strategy_id
      || entry?.context_strategy_fingerprint !== strategyBinding.fingerprint) {
      invalidIds.add(entry?.receipt_id ?? "invalid-receipt");
      addReason(reasons, "CONTEXT_RECEIPT_BINDING_INVALID", "Context receipt index contains evidence from another task, workspace, or strategy", [entry?.receipt_id ?? "invalid-receipt"]);
    }
    if ((entry?.mutation_revision_started ?? 0) !== 0 || (entry?.mutation_revision_completed ?? 0) !== 0
      || (implementationStartedSequence !== null && (entry?.sequence ?? 0) >= implementationStartedSequence)) {
      addReason(reasons, "CONTEXT_RECEIPT_AFTER_MUTATION", "Post-mutation receipt cannot prove pre-change understanding", [entry?.receipt_id ?? "invalid-receipt"]);
    }
  }
  let cutoff = 0;
  for (const receiptId of referencedIds) {
    const receipt = map.get(receiptId);
    if (!receipt) {
      addReason(reasons, "CONTEXT_RECEIPT_UNKNOWN", "Referenced context receipt does not exist", [receiptId]);
      continue;
    }
    if (invalidIds.has(receiptId)) continue;
    cutoff = Math.max(cutoff, receipt.sequence ?? 0);
    if (receipt.session_key !== sessionKey || receipt.run_id !== runId || receipt.task_id !== taskId || receipt.source_fingerprint !== workspaceFingerprint) {
      addReason(reasons, "CONTEXT_RECEIPT_BINDING_INVALID", "Context receipt belongs to another session, task, run, or workspace", [receiptId]);
    }
    if (receipt.context_strategy_id !== strategyBinding.strategy_id
      || !fingerprintsEqual(receipt.context_strategy_fingerprint, strategyBinding.fingerprint)) {
      addReason(reasons, "CONTEXT_RECEIPT_BINDING_INVALID", "Context receipt belongs to another selected strategy", [receiptId]);
    }
    if ((receipt.mutation_revision_started ?? 0) !== 0 || (receipt.mutation_revision_completed ?? 0) !== 0
      || (implementationStartedSequence !== null && (receipt.sequence ?? 0) >= implementationStartedSequence)) {
      addReason(reasons, "CONTEXT_RECEIPT_AFTER_MUTATION", "Post-mutation receipt cannot prove pre-change understanding", [receiptId]);
    }
  }
  return { entries, map, invalidIds, cutoff };
}

function evaluateStandardLite({ reasons, summary, strategyBinding, dossier, sessionKey, workspaceFingerprint, receiptIndex, implementationStartedSequence, readOnlySubagentsUsed }) {
  if (summary === null) {
    addReason(reasons, "CONTEXT_STANDARD_LITE_EVIDENCE_MISSING", "Standard-lite requires a compact runner-owned context summary");
    return { cutoff: 0 };
  }
  validateStandardLiteContextSummary(summary);
  if (summary.session_key !== sessionKey || summary.run_id !== dossier.run_id || summary.task_id !== dossier.task_id) {
    addReason(reasons, "CONTEXT_RECEIPT_BINDING_INVALID", "Standard-lite summary belongs to another authoritative session, run, or task");
  }
  if (!fingerprintsEqual(summary.strategy_binding_fingerprint, strategyBinding.fingerprint)
    || !fingerprintsEqual(summary.workspace_fingerprint, workspaceFingerprint)
    || !fingerprintsEqual(summary.dossier_analysis_fingerprint, engineeringDossierAnalysisFingerprint(dossier))) {
    addReason(reasons, "CONTEXT_EVIDENCE_STALE", "Standard-lite context summary is stale or bound to another task");
  }
  const receiptState = inspectReceiptBindings({
    reasons,
    receiptIndex,
    referencedIds: summary.receipt_ids,
    sessionKey: summary.session_key,
    runId: summary.run_id,
    taskId: summary.task_id,
    workspaceFingerprint,
    implementationStartedSequence,
    strategyBinding,
  });
  for (const receiptId of summary.receipt_ids) {
    const receipt = receiptState.map.get(receiptId);
    if (receipt && Date.parse(receipt.completed_at) > Date.parse(summary.finalized_at)) {
      addReason(reasons, "CONTEXT_EVIDENCE_STALE", `Receipt ${receiptId} completed after the standard-lite summary was finalized`, [receiptId]);
    }
  }
  const validReceipts = receiptState.entries.filter((entry) => !receiptState.invalidIds.has(entry.receipt_id));
  const observedPaths = contentBackedInspectedPaths(validReceipts, { receipt_ids: summary.receipt_ids });
  if (observedPaths.length === 0 || canonicalJson(summary.inspected_paths) !== canonicalJson(observedPaths)) {
    addReason(reasons, "CONTEXT_STANDARD_LITE_EVIDENCE_MISSING", "Standard-lite inspected paths must exactly match successful, complete runner-owned read/search content evidence");
  }
  if (summary.broad_fanout
    || summary.context_calls !== receiptState.entries.length
    || summary.context_calls > strategyBinding.budgets.max_context_calls
    || summary.read_only_subagents !== readOnlySubagentsUsed
    || readOnlySubagentsUsed > 0
    || receiptState.entries.some((entry) => ["context_map", "context_batch_read", "context_symbols", "context_related"].includes(entry.tool_id))) {
    addReason(reasons, "CONTEXT_STANDARD_LITE_OVERANALYSIS", "Standard-lite performed unnecessary broad analysis");
  }
  const escalations = Object.entries(summary.discovered_scope_facts).filter(([, present]) => present).map(([key]) => key);
  if (escalations.length > 0) addReason(reasons, "CONTEXT_STANDARD_LITE_ESCALATION_REQUIRED", "Discovered non-local impact requires a wide/deep strategy", escalations);
  if (implementationStartedSequence !== null) addReason(reasons, "CONTEXT_FINALIZED_AFTER_MUTATION", "Context sufficiency cannot be first established after implementation started");
  return { cutoff: receiptState.cutoff };
}

function evidenceForReceipts(receiptState, receiptIds) {
  const inventoryPaths = new Set();
  const contentPaths = new Set();
  const exclusionPaths = new Set();
  const relationshipPairs = new Set();
  for (const receiptId of receiptIds) {
    if (receiptState.invalidIds.has(receiptId)) continue;
    const receipt = receiptState.map.get(receiptId);
    if (!receipt || !["success", "empty"].includes(receipt.status) || receipt.result === null) continue;
    for (const path of receipt.result.relative_paths) inventoryPaths.add(path);
    for (const path of receipt.request.scope_paths.filter((entry) => entry !== ".")) exclusionPaths.add(path);
    if (receipt.status !== "success") continue;
    if (["context_read", "context_batch_read", "context_search"].includes(receipt.tool_id)) {
      for (const range of receipt.result.line_ranges) contentPaths.add(range.path);
    }
    if (["context_symbols", "context_map"].includes(receipt.tool_id)) {
      for (const symbol of receipt.result.symbol_ids) contentPaths.add(symbol.path);
    }
    if (receipt.tool_id === "context_related") {
      const target = receipt.request.relationship_target_path;
      for (const relationship of receipt.result.relationships) {
        if (target === null) continue;
        if (relationship.relationship === "direct-import") relationshipPairs.add(`${target}\0${relationship.path}\0imports\0${relationship.confidence}`);
        if (relationship.relationship === "imported-by") relationshipPairs.add(`${relationship.path}\0${target}\0imports\0${relationship.confidence}`);
      }
    }
  }
  return { inventoryPaths, contentPaths, exclusionPaths, relationshipPairs };
}

function subjectEvidenceMatcher(graph, { requireSemanticEdges = false } = {}) {
  const nodes = new Map(graph.nodes.map((entry) => [entry.id, entry]));
  const edges = new Map(graph.edges.map((entry) => [entry.id, entry]));
  const paths = new Map(graph.affected_paths.map((entry) => [entry.id, entry]));
  const excluded = new Map(graph.excluded_siblings.map((entry) => [entry.id, entry]));
  const unknowns = new Map(graph.unknowns.map((entry) => [entry.id, entry]));
  const nodeSupported = (nodeId, evidence) => {
    const node = nodes.get(nodeId);
    return node?.path !== null && node?.path !== undefined && evidence.contentPaths.has(node.path);
  };
  const edgeSupported = (edgeId, evidence) => {
    const edge = edges.get(edgeId);
    if (edge === undefined) return false;
    const fromPath = nodes.get(edge.from)?.path;
    const toPath = nodes.get(edge.to)?.path;
    const semanticImport = typeof fromPath === "string" && typeof toPath === "string"
      && fromPath !== toPath
      && ["imports", "depends_on"].includes(edge.relationship)
      && evidence.relationshipPairs.has(`${fromPath}\0${toPath}\0imports\0high`);
    return semanticImport || (!requireSemanticEdges && nodeSupported(edge.from, evidence) && nodeSupported(edge.to, evidence));
  };
  const supportsSubject = (subjectId, evidence) => {
    if (nodes.has(subjectId)) return nodeSupported(subjectId, evidence);
    if (edges.has(subjectId)) return edgeSupported(subjectId, evidence);
    if (paths.has(subjectId)) {
      const affectedPath = paths.get(subjectId);
      return affectedPath.node_ids.every((nodeId) => nodeSupported(nodeId, evidence))
        && affectedPath.edge_ids.every((edgeId) => edgeSupported(edgeId, evidence));
    }
    if (excluded.has(subjectId)) {
      const excludedPath = excluded.get(subjectId).path;
      return evidence.contentPaths.has(excludedPath)
        || evidence.exclusionPaths.has(excludedPath)
        || evidence.inventoryPaths.has(excludedPath);
    }
    if (unknowns.has(subjectId)) {
      return unknowns.get(subjectId).scope_ids.every((scopeId) => scopeId !== subjectId && supportsSubject(scopeId, evidence));
    }
    return false;
  };
  return supportsSubject;
}

const WIDE_BOUNDARY_MAP = Object.freeze({
  module_service_map: ["direct_affected_paths", "transitive_affected_paths"],
  externally_reachable_entry_points: ["externally_reachable_entry_points"],
  direct_callers_callees: ["direct_affected_paths"],
  transitive_consumers_side_effects: ["transitive_affected_paths", "downstream_state_or_side_effects"],
  public_contracts_configuration: ["cross_boundary_contracts"],
  state_external_dependencies: ["downstream_state_or_side_effects"],
  existing_tests: ["critical_path_tests"],
  sibling_implementations: ["excluded_sibling_paths"],
  excluded_sibling_paths: ["excluded_sibling_paths"],
  relevant_unknown_paths: ["relevant_unknown_paths"],
});

function boundarySubjectIds(boundary) {
  return [
    ...boundary.node_ids,
    ...boundary.edge_ids,
    ...boundary.path_ids,
    ...boundary.unknown_ids,
    ...boundary.excluded_sibling_ids,
  ];
}

function relevantUnresolvedTruncations(receiptState, report, graph) {
  const graphPaths = new Set([
    ...graph.nodes.map((entry) => entry.path).filter((entry) => typeof entry === "string"),
    ...graph.excluded_siblings.map((entry) => entry.path),
  ]);
  const explicitlyUnresolved = new Set(report.tool_state.unresolved_truncation_receipt_ids);
  const completeLater = receiptState.entries.filter((entry) => (
    ["success", "empty"].includes(entry.status)
    && entry.result?.coverage.complete === true
    && entry.result?.coverage.stable === true
    && entry.result?.coverage.changed_during_operation === false
  ));
  const coveredBy = (entry) => new Set([
    ...entry.request.scope_paths.filter((path) => path !== "."),
    ...entry.request.ranges.map((range) => range.path),
    ...(entry.result?.relative_paths ?? []),
    ...(entry.result?.line_ranges ?? []).map((range) => range.path),
    ...(entry.result?.symbol_ids ?? []).map((symbol) => symbol.path),
  ]);
  const relevantTargets = (entry) => {
    const scopes = coveredBy(entry);
    if (entry.request.scope_paths.includes(".")) return [...graphPaths];
    return [...graphPaths].filter((path) => [...scopes].some((scope) => path === scope || path.startsWith(`${scope}/`) || scope.startsWith(`${path}/`)));
  };
  const inferred = receiptState.entries.filter((entry) => entry.status === "truncated").filter((entry) => {
    if (["context_outline", "context_files", "context_search", "context_map", "context_symbols", "context_related"].includes(entry.tool_id)) {
      const requestIdentity = (receipt) => canonicalJson({
        tool_id: receipt.tool_id,
        scope_paths: receipt.request.scope_paths,
        relationship_target_path: receipt.request.relationship_target_path,
        query_fingerprint: receipt.request.query_fingerprint,
        relationship_kinds: receipt.request.relationship_kinds,
        extensions: receipt.request.extensions,
        format: receipt.request.format,
      });
      const exhaustiveRerun = completeLater.some((candidate) => (
        candidate.sequence > entry.sequence
        && requestIdentity(candidate) === requestIdentity(entry)
      ));
      return !exhaustiveRerun || explicitlyUnresolved.has(entry.receipt_id);
    }
    const targets = relevantTargets(entry);
    if (targets.length === 0) return explicitlyUnresolved.has(entry.receipt_id);
    const laterCoverage = new Set(completeLater
      .filter((candidate) => candidate.sequence > entry.sequence)
      .flatMap((candidate) => [...coveredBy(candidate)]));
    const resolved = targets.every((target) => [...laterCoverage].some((path) => target === path || target.startsWith(`${path}/`) || path.startsWith(`${target}/`)));
    return !resolved || explicitlyUnresolved.has(entry.receipt_id);
  }).map((entry) => entry.receipt_id);
  return [...new Set([...inferred, ...explicitlyUnresolved])];
}

function factuallyApplicableDimensions(dossier) {
  const result = new Set(["inputs_preconditions", "outputs_postconditions", "state_transitions", "error_propagation"]);
  const nodeKinds = new Set(dossier.impact_graph.nodes.map((entry) => entry.kind));
  const edgeKinds = new Set(dossier.impact_graph.edges.map((entry) => entry.relationship));
  const failureCategories = new Set(dossier.failure_modes.map((entry) => entry.category));
  const hasNode = (...kinds) => kinds.some((kind) => nodeKinds.has(kind));
  const hasEdge = (...kinds) => kinds.some((kind) => edgeKinds.has(kind));
  const hasFailure = (...categories) => categories.some((category) => failureCategories.has(category));
  const add = (...dimensions) => dimensions.forEach((dimension) => result.add(dimension));

  const transformsData = hasNode("data_shape", "generated_artifact", "serialization_boundary")
    || hasEdge("serializes", "deserializes", "validates", "generates");
  if (transformsData) add("data_transformations");

  const sideEffects = hasNode("data_store", "cache", "external_dependency", "background_job", "event_producer", "event_consumer", "migration")
    || hasEdge("writes", "persists", "publishes", "emits", "consumes", "invalidates", "migrates", "generates", "schedules");
  if (sideEffects) add("side_effects", "security_data_integrity");

  const persistent = hasNode("data_store", "cache", "migration")
    || hasEdge("writes", "persists", "invalidates", "migrates");
  if (persistent) add("transaction_rollback", "recovery_restart");
  if (hasNode("cache") || hasEdge("invalidates") || hasFailure("stale_state_cache_eventual_consistency")) add("cache_stale_state");
  if (hasNode("external_dependency", "background_job", "event_producer", "event_consumer")
    || hasEdge("publishes", "emits", "consumes", "schedules")) {
    add("retry_repeated_invocation", "idempotency", "timeout_cancellation", "resource_cleanup", "recovery_restart");
  }
  if (hasNode("background_job", "event_producer", "event_consumer") || hasEdge("schedules")) add("concurrency_ordering");
  if (dossier.task_type === "migration") {
    add("transaction_rollback", "compatibility_version_skew", "recovery_restart", "security_data_integrity");
  }
  if (dossier.task_type === "security") {
    add("authorization_data_sensitivity", "security_data_integrity");
  }
  if (dossier.public_contracts.length > 0) result.add("compatibility_version_skew");
  if (hasFailure("ordering_out_of_order_delivery", "concurrency_races_interleavings")) add("concurrency_ordering");
  if (hasFailure("timeout_cancellation")) add("timeout_cancellation");
  if (hasFailure("duplicates_repeated_invocation", "idempotency_retry_duplicate_delivery")) add("retry_repeated_invocation", "idempotency");
  if (hasFailure("resource_lifecycle_cleanup_shutdown_leaks")) add("resource_cleanup");
  if (hasFailure("transactions_rollback", "partial_success_partial_failure", "migration_downgrade_rollback")) add("transaction_rollback");
  if (hasFailure("schema_version_skew_mixed_version", "backward_compatibility")) add("compatibility_version_skew");
  if (hasFailure("authorization_tenant_isolation", "injection_encoding_sensitive_data")) add("authorization_data_sensitivity", "security_data_integrity");
  if (hasFailure("restart_recovery_restore", "dependency_outage_degraded_mode")) add("recovery_restart");
  return result;
}

function evaluateFull({ reasons, report, strategyBinding, dossier, sessionKey, workspaceFingerprint, receiptIndex, implementationStartedSequence, readOnlySubagentsUsed }) {
  if (report === null) {
    addReason(reasons, "CONTEXT_REPORT_MISSING", "High and critical work requires a Whole-System Context Report");
    return { cutoff: 0 };
  }
  if (report.session_key !== sessionKey || report.run_id !== dossier.run_id || report.task_id !== dossier.task_id) {
    addReason(reasons, "CONTEXT_RECEIPT_BINDING_INVALID", "Context report belongs to another authoritative session, run, or task");
  }
  try {
    validateWholeSystemContextReport(report, { dossier, impactGraph: dossier.impact_graph });
  } catch (error) {
    if (error?.code === "CONTEXT_GRAPH_PATH_MISMATCH" || error?.code === "CONTEXT_GRAPH_BINDING_INVALID") {
      addReason(reasons, "CONTEXT_GRAPH_PATH_MISMATCH", error.message);
    } else if (error?.code?.startsWith("CONTEXT_RECEIPT")) {
      addReason(reasons, "CONTEXT_RECEIPT_BINDING_INVALID", error.message);
    } else throw error;
  }
  if (report.status !== "finalized") addReason(reasons, "CONTEXT_REPORT_NOT_FINALIZED", "Context report must be immutable before sufficiency evaluation");
  if (!fingerprintsEqual(report.strategy_binding_fingerprint, strategyBinding.fingerprint)
    || !fingerprintsEqual(report.workspace_fingerprint, workspaceFingerprint)
    || !fingerprintsEqual(report.dossier_analysis_fingerprint, engineeringDossierAnalysisFingerprint(dossier))) {
    addReason(reasons, "CONTEXT_EVIDENCE_STALE", "Context report is stale or bound to another strategy/dossier/workspace");
  }
  if (implementationStartedSequence !== null) addReason(reasons, "CONTEXT_FINALIZED_AFTER_MUTATION", "Context report was not sufficient before implementation started");

  const receiptState = inspectReceiptBindings({
    reasons,
    receiptIndex,
    referencedIds: report.receipt_ids,
    sessionKey: report.session_key,
    runId: report.run_id,
    taskId: report.task_id,
    workspaceFingerprint,
    implementationStartedSequence,
    strategyBinding,
  });
  const allReceiptIds = receiptState.entries.map((entry) => entry.receipt_id).sort();
  const reportReceiptIds = [...new Set(report.receipt_ids)].sort();
  if (canonicalJson(allReceiptIds) !== canonicalJson(reportReceiptIds)) {
    const omitted = allReceiptIds.filter((id) => !reportReceiptIds.includes(id));
    addReason(reasons, "CONTEXT_CLAIM_EVIDENCE_MISSING", "Whole-System Context Report must account for the complete bound preimplementation receipt chain", omitted);
  }
  const classifiedGraphPaths = new Set([
    ...dossier.impact_graph.nodes.map((entry) => entry.path).filter((entry) => typeof entry === "string"),
    ...dossier.impact_graph.excluded_siblings.map((entry) => entry.path),
  ]);
  const contentOrSemanticPaths = new Set(receiptState.entries.flatMap((entry) => {
    if (receiptState.invalidIds.has(entry.receipt_id) || !["success", "truncated"].includes(entry.status) || entry.result === null) return [];
    return [
      ...(entry.tool_id === "context_map" ? entry.result.relative_paths : []),
      ...entry.result.line_ranges.map((range) => range.path),
      ...entry.result.symbol_ids.map((symbol) => symbol.path),
      ...entry.result.relationships.map((relationship) => relationship.path),
      ...(entry.tool_id === "context_related" && entry.request.relationship_target_path !== null
        ? [entry.request.relationship_target_path]
        : []),
    ];
  }));
  const unclassifiedObservedPaths = [...contentOrSemanticPaths].filter((entry) => (
    ["source", "test", "schema", "config"].includes(classifyContextPathKind(entry))
    && !classifiedGraphPaths.has(entry)
  ));
  if (unclassifiedObservedPaths.length > 0) {
    addReason(reasons, "CONTEXT_CLAIM_EVIDENCE_MISSING", "Runner-observed content or semantic paths are omitted from the impact graph classification", unclassifiedObservedPaths);
  }
  const outlineEntries = receiptState.entries.filter((entry) => (
    entry.tool_id === "context_outline"
    && ["success", "empty"].includes(entry.status)
    && !receiptState.invalidIds.has(entry.receipt_id)
    && entry.result?.coverage.complete === true
    && entry.result?.coverage.stable === true
    && entry.result?.coverage.changed_during_operation === false
  ));
  const outlineInventories = outlineEntries.flatMap((entry) => entry.result?.tool_inventory ?? []);
  const installedSurface = detectInstalledContextToolSurface(outlineEntries.length > 0
    ? { tool_ids: [...new Set(outlineInventories)] }
    : null);
  const runnerObservedAvailable = new Set(installedSurface.available_tool_ids);
  if (installedSurface.host_schema !== "supported" || !runnerObservedAvailable.has("context_outline")) {
    addReason(reasons, "CONTEXT_TOOL_AVAILABILITY_UNOBSERVED", "High and critical work requires a complete runner-observed context_outline inventory of the installed tool surface");
  }
  for (const entry of receiptState.entries.filter((candidate) => ["success", "empty"].includes(candidate.status))) {
    if ([...MINIMAL_CONTEXT_TOOLS, ...ADVANCED_CONTEXT_TOOLS].includes(entry.tool_id)
      && !runnerObservedAvailable.has(entry.tool_id)) {
      addReason(reasons, "CONTEXT_TOOL_AVAILABILITY_UNOBSERVED", `Observed context tool ${entry.tool_id} is absent from the runner-owned installed tool inventory`, [entry.receipt_id, entry.tool_id]);
    }
  }
  for (const tool of [...report.tool_state.minimal_available, ...report.tool_state.advanced_available]) {
    if (!runnerObservedAvailable.has(tool)) {
      addReason(reasons, "CONTEXT_TOOL_AVAILABILITY_UNOBSERVED", `Claimed available tool ${tool} was not observed by the runner`, [tool]);
    }
  }
  if (installedSurface.host_schema === "supported") {
    const expectedMinimal = MINIMAL_CONTEXT_TOOLS.filter((tool) => runnerObservedAvailable.has(tool)).sort();
    const expectedAdvanced = ADVANCED_CONTEXT_TOOLS.filter((tool) => runnerObservedAvailable.has(tool)).sort();
    const expectedUnavailable = ADVANCED_CONTEXT_TOOLS.filter((tool) => !runnerObservedAvailable.has(tool)).sort();
    if (canonicalJson([...report.tool_state.minimal_available].sort()) !== canonicalJson(expectedMinimal)
      || canonicalJson([...report.tool_state.advanced_available].sort()) !== canonicalJson(expectedAdvanced)
      || canonicalJson([...report.tool_state.advanced_unavailable].sort()) !== canonicalJson(expectedUnavailable)) {
      addReason(reasons, "CONTEXT_TOOL_AVAILABILITY_UNOBSERVED", "Context report tool availability disagrees with the runner-observed installed surface");
    }
    const advancedInstalled = installedSurface.available_tool_ids.filter((tool) => ADVANCED_CONTEXT_TOOLS.includes(tool));
    const advancedObserved = receiptState.entries.filter((entry) => (
      ADVANCED_CONTEXT_TOOLS.includes(entry.tool_id) && ["success", "empty"].includes(entry.status)
    ));
    const minimalEvidenceUsed = receiptState.entries.some((entry) => (
      ["context_files", "context_search", "context_read"].includes(entry.tool_id)
      && ["success", "empty"].includes(entry.status)
    ));
    const expectedFallback = advancedInstalled.length === 0 && minimalEvidenceUsed;
    const expectedReduced = advancedInstalled.length < ADVANCED_CONTEXT_TOOLS.length
      || (minimalEvidenceUsed && advancedObserved.length === 0);
    if (report.tool_state.fallback_used !== expectedFallback
      || report.tool_state.reduced_semantic_coverage !== expectedReduced) {
      addReason(reasons, "CONTEXT_TOOL_AVAILABILITY_UNOBSERVED", "Fallback and reduced-semantic-coverage flags disagree with runner-observed tool inventory and receipts");
    }
  }
  const unsupportedTools = new Set(receiptState.entries
    .filter((entry) => entry.reason_code === "unsupported_schema")
    .map((entry) => entry.tool_id));
  if (report.tool_state.unsupported_schema_tools.some((tool) => !unsupportedTools.has(tool))
    || [...unsupportedTools].some((tool) => !report.tool_state.unsupported_schema_tools.includes(tool))) {
    addReason(reasons, "CONTEXT_TOOL_AVAILABILITY_UNOBSERVED", "Unsupported context-tool schema state disagrees with runner receipts");
  }
  for (const receiptId of report.receipt_ids) {
    const receipt = receiptState.map.get(receiptId);
    if (receipt && Date.parse(receipt.completed_at) > Date.parse(report.finalized_at)) {
      addReason(reasons, "CONTEXT_EVIDENCE_STALE", `Receipt ${receiptId} completed after the context report was finalized`, [receiptId]);
    }
  }
  const wideByCategory = new Map(report.wide_analysis.map((entry) => [entry.category, entry]));
  for (const category of strategyBinding.required_wide_categories) if (!wideByCategory.has(category)) addReason(reasons, "CONTEXT_WIDE_CATEGORY_MISSING", `Required wide category ${category} is absent`, [category]);

  const claimById = new Map(report.claims.map((entry) => [entry.id, entry]));
  const supportsSubject = subjectEvidenceMatcher(dossier.impact_graph, {
    requireSemanticEdges: strategyBinding.semantic_relation_evidence === "required_or_blocked",
  });
  const machineSubjects = new Set();
  for (const claim of report.claims) {
    if (claim.kind !== "inferred" && claim.receipt_ids.length === 0) addReason(reasons, "CONTEXT_CLAIM_EVIDENCE_MISSING", `Claim ${claim.id} lacks machine-owned evidence`, [claim.id]);
    const evidence = evidenceForReceipts(receiptState, claim.receipt_ids);
    let supportedCount = 0;
    for (const subjectId of claim.subject_ids) {
      if (claim.receipt_ids.length > 0 && supportsSubject(subjectId, evidence)) {
        machineSubjects.add(subjectId);
        supportedCount += 1;
      }
    }
    if (claim.subject_ids.length > 0 && supportedCount === 0) {
      addReason(reasons, "CONTEXT_CLAIM_EVIDENCE_MISSING", `Claim ${claim.id} receipts do not observe any claimed path scope`, [claim.id]);
    }
  }
  const repositoryGuidance = wideByCategory.get("repository_guidance");
  if (repositoryGuidance) {
    const wideEntries = repositoryGuidance.receipt_ids.map((id) => receiptState.map.get(id)).filter(Boolean);
    const completeOutlines = wideEntries.filter((entry) => (
      entry.tool_id === "context_outline"
      && ["success", "empty"].includes(entry.status)
      && entry.result?.coverage.complete === true
      && entry.result?.coverage.stable === true
      && entry.result?.coverage.changed_during_operation === false
    ));
    const guidancePaths = new Set(completeOutlines.flatMap((entry) => entry.result?.guidance_paths ?? []));
    const guidanceEvidence = evidenceForReceipts(receiptState, repositoryGuidance.receipt_ids);
    if (completeOutlines.length === 0
      || (repositoryGuidance.classification === "represented"
        && (guidancePaths.size === 0 || [...guidancePaths].some((entry) => !guidanceEvidence.contentPaths.has(entry))))
      || (repositoryGuidance.classification === "reasoned_excluded" && guidancePaths.size > 0)) {
      addReason(reasons, "CONTEXT_WIDE_CATEGORY_MISSING", "Repository guidance must be established by a complete inventory and, when present, a runner-observed content read", [repositoryGuidance.id]);
    }
  }
  const architectureOwnership = wideByCategory.get("architecture_ownership");
  if (architectureOwnership) {
    const ownerNodeIds = new Set(dossier.impact_graph.nodes
      .filter((node) => node.kind === "module" || node.boundary === "module")
      .map((node) => node.id));
    const ownerObserved = architectureOwnership.classification === "represented"
      && architectureOwnership.subject_ids.some((id) => ownerNodeIds.has(id) && machineSubjects.has(id))
      && architectureOwnership.claim_ids.some((id) => {
        const claim = claimById.get(id);
        return claim?.kind === "observed" && claim.subject_ids.some((subjectId) => ownerNodeIds.has(subjectId));
      });
    if (!ownerObserved) addReason(reasons, "CONTEXT_OWNING_ABSTRACTION_MISSING", "Architecture ownership requires a runner-evidenced module owner claim", [architectureOwnership.id]);
  }
  const toolFallback = wideByCategory.get("context_tool_fallback");
  if (toolFallback) {
    const toolReceiptIds = new Set(outlineEntries.map((entry) => entry.receipt_id));
    const linkedInventory = toolFallback.receipt_ids.some((id) => toolReceiptIds.has(id));
    const linkedFallback = !report.tool_state.fallback_used || toolFallback.receipt_ids.some((id) => {
      const receipt = receiptState.map.get(id);
      return receipt && MINIMAL_CONTEXT_TOOLS.includes(receipt.tool_id) && ["success", "empty"].includes(receipt.status);
    });
    if (toolFallback.classification !== "represented" || !linkedInventory || !linkedFallback) {
      addReason(reasons, "CONTEXT_WIDE_CATEGORY_MISSING", "Context-tool fallback analysis must link the runner-owned inventory and any actual minimal fallback", [toolFallback.id]);
    }
  }
  const budgetTruncation = wideByCategory.get("budget_truncation_state");
  if (budgetTruncation) {
    const linked = [...new Set(budgetTruncation.receipt_ids)].sort();
    const expected = [...new Set(report.receipt_ids)].sort();
    if (budgetTruncation.classification !== "represented" || canonicalJson(linked) !== canonicalJson(expected)) {
      addReason(reasons, "CONTEXT_WIDE_CATEGORY_MISSING", "Budget and truncation analysis must account for every report receipt", [budgetTruncation.id]);
    }
  }
  const boundaryByCategory = new Map(dossier.impact_graph.coverage.boundaries.map((entry) => [entry.category, entry]));
  for (const [category, boundaryCategories] of Object.entries(WIDE_BOUNDARY_MAP)) {
    if (!strategyBinding.required_wide_categories.includes(category)) continue;
    const wide = wideByCategory.get(category);
    if (!wide) continue;
    const mappedBoundaries = boundaryCategories.map((entry) => boundaryByCategory.get(entry)).filter(Boolean);
    const hasRepresentedBoundary = mappedBoundaries.some((entry) => entry.classification === "represented");
    if (hasRepresentedBoundary && wide.classification !== "represented") {
      addReason(reasons, "CONTEXT_WIDE_CATEGORY_MISSING", `Wide category ${category} reasoned-excludes a represented impact-graph boundary`, [wide.id]);
    }
    for (const boundaryCategory of boundaryCategories) {
      const boundary = boundaryByCategory.get(boundaryCategory);
      if (!boundary) continue;
      if (boundary.classification === "reasoned_excluded") {
        if (!hasRepresentedBoundary && (wide.classification !== "reasoned_excluded" || wide.rationale === null)) {
          addReason(reasons, "CONTEXT_WIDE_CATEGORY_MISSING", `Wide category ${category} does not preserve the runner graph exclusion for ${boundaryCategory}`, [wide.id, boundary.id]);
        }
        continue;
      }
      const expectedSubjects = boundarySubjectIds(boundary);
      const referencedClaims = wide.claim_ids.map((id) => claimById.get(id)).filter(Boolean);
      for (const subjectId of expectedSubjects) {
        if (!wide.subject_ids.includes(subjectId)
          || !referencedClaims.some((claim) => claim.subject_ids.includes(subjectId))
          || !machineSubjects.has(subjectId)) {
          addReason(reasons, "CONTEXT_CLAIM_EVIDENCE_MISSING", `Wide category ${category} lacks receipt-backed boundary subject ${subjectId}`, [wide.id, boundary.id, subjectId]);
        }
      }
    }
  }
  const direct = dossier.impact_graph.affected_paths.filter((entry) => entry.kind === "direct");
  const transitive = dossier.impact_graph.affected_paths.filter((entry) => entry.kind === "transitive");
  if (direct.length === 0 || direct.some((entry) => !machineSubjects.has(entry.id))) addReason(reasons, "CONTEXT_DIRECT_PATH_MISSING", "Direct affected paths lack machine-owned context evidence", direct.map((entry) => entry.id));
  if (transitive.length === 0 || transitive.some((entry) => !machineSubjects.has(entry.id))) addReason(reasons, "CONTEXT_TRANSITIVE_PATH_MISSING", "Transitive affected paths lack machine-owned context evidence", transitive.map((entry) => entry.id));
  for (const subject of [...dossier.impact_graph.nodes, ...dossier.impact_graph.edges, ...dossier.impact_graph.affected_paths]) {
    if (!machineSubjects.has(subject.id)) addReason(reasons, "CONTEXT_CLAIM_EVIDENCE_MISSING", `Impact subject ${subject.id} lacks a receipt-backed context claim`, [subject.id]);
  }
  for (const sibling of dossier.impact_graph.excluded_siblings) {
    const exclusion = report.claims.find((claim) => claim.kind === "reasoned_exclusion" && claim.subject_ids.includes(sibling.id));
    if (!exclusion || !machineSubjects.has(sibling.id)) {
      addReason(reasons, "CONTEXT_CLAIM_EVIDENCE_MISSING", `Excluded sibling ${sibling.id} lacks a receipt-backed reasoned exclusion`, [sibling.id]);
    }
  }

  const questions = new Map(report.questions.map((entry) => [entry.id, entry]));
  const graphEvidencePaths = new Set([
    ...dossier.impact_graph.nodes.map((entry) => entry.path).filter((entry) => typeof entry === "string"),
    ...dossier.impact_graph.excluded_siblings.map((entry) => entry.path),
  ]);
  for (const questionKey of strategyBinding.required_questions) {
    const resolved = report.questions.some((entry) => {
      if (entry.question_key !== questionKey || !["confirmed", "refuted"].includes(entry.status)) return false;
      const validReceipt = entry.receipt_ids.some((id) => {
        const receipt = receiptState.map.get(id);
        return receipt && !receiptState.invalidIds.has(id) && ["success", "empty"].includes(receipt.status);
      });
      const evidence = evidenceForReceipts(receiptState, entry.receipt_ids);
      const scoped = [...evidence.contentPaths, ...evidence.exclusionPaths, ...evidence.inventoryPaths]
        .some((path) => graphEvidencePaths.has(path));
      return validReceipt && scoped;
    });
    if (!resolved) addReason(reasons, "CONTEXT_REQUIRED_QUESTION_MISSING", `Required task-profile question ${questionKey} lacks a resolved machine-evidenced answer`, [questionKey]);
  }
  const deepByPath = new Map(report.deep_analyses.map((entry) => [entry.impact_path_id, entry]));
  const applicableDimensions = factuallyApplicableDimensions(dossier);
  for (const path of dossier.impact_graph.affected_paths.filter((entry) => entry.critical)) {
    const deep = deepByPath.get(path.id);
    if (!deep) {
      addReason(reasons, "CONTEXT_CRITICAL_PATH_DEEP_MISSING", `Critical path ${path.id} lacks deep analysis`, [path.id]);
      continue;
    }
    if (!supportsSubject(path.id, evidenceForReceipts(receiptState, deep.receipt_ids))) {
      addReason(reasons, "CONTEXT_CLAIM_EVIDENCE_MISSING", `Deep analysis ${deep.id} receipts do not cover critical path ${path.id}`, [deep.id, path.id]);
    }
    const dimensions = new Set(deep.dimensions.map((entry) => entry.dimension));
    for (const dimension of strategyBinding.required_deep_dimensions) if (!dimensions.has(dimension)) addReason(reasons, "CONTEXT_DEEP_DIMENSION_UNCLASSIFIED", `Critical path ${path.id} lacks ${dimension} classification`, [path.id, dimension]);
    for (const dimension of deep.dimensions) {
      if (dimension.classification === "applicable" && dimension.verification_ids.length === 0) {
        addReason(reasons, "CONTEXT_VERIFICATION_MAPPING_MISSING", `Applicable deep dimension ${deep.id}/${dimension.dimension} lacks a verification mapping`, [deep.id, dimension.dimension]);
      }
      if (applicableDimensions.has(dimension.dimension) && dimension.classification !== "applicable") {
        addReason(reasons, "CONTEXT_DEEP_DIMENSION_UNCLASSIFIED", `Deep dimension ${deep.id}/${dimension.dimension} contradicts runner-observed task and graph facts`, [deep.id, dimension.dimension]);
      }
      if (!supportsSubject(path.id, evidenceForReceipts(receiptState, dimension.receipt_ids))) {
        addReason(reasons, "CONTEXT_CLAIM_EVIDENCE_MISSING", `Deep dimension ${deep.id}/${dimension.dimension} is outside its receipt path scope`, [deep.id, dimension.dimension, path.id]);
      }
    }
    const falsification = questions.get(deep.falsification_question_id);
    if (!falsification || !["confirmed", "refuted"].includes(falsification.status) || falsification.receipt_ids.length === 0) addReason(reasons, "CONTEXT_BLOCKING_UNKNOWN", `Critical path ${path.id} lacks a resolved receipt-backed falsification attempt`, [path.id, deep.falsification_question_id]);
    else if (!supportsSubject(path.id, evidenceForReceipts(receiptState, falsification.receipt_ids))) {
      addReason(reasons, "CONTEXT_CLAIM_EVIDENCE_MISSING", `Falsification ${falsification.id} does not carry receipts covering ${path.id}`, [falsification.id, path.id]);
    }
    if (deep.test_obligation_ids.length === 0 || deep.failure_mode_ids.length === 0 || deep.edge_case_ids.length === 0) {
      addReason(reasons, "CONTEXT_VERIFICATION_MAPPING_MISSING", `Critical path ${path.id} must map edge cases and failure modes to test obligations`, [path.id]);
    }
  }
  for (const unknown of dossier.impact_graph.unknowns.filter((entry) => entry.blocking)) addReason(reasons, "CONTEXT_BLOCKING_UNKNOWN", `Blocking impact unknown ${unknown.id} remains`, [unknown.id]);
  for (const question of report.questions) {
    if (question.status === "uncertain" && ["material", "high"].includes(question.impact_if_wrong)) addReason(reasons, "CONTEXT_BLOCKING_UNKNOWN", `Material hypothesis ${question.id} remains uncertain`, [question.id]);
    if (question.status === "refuted" && question.applied_update_ids.length === 0) addReason(reasons, "CONTEXT_REFUTED_HYPOTHESIS_UNAPPLIED", `Refuted hypothesis ${question.id} did not update the graph, deep analysis, or plan`, [question.id]);
  }
  const unresolvedTruncationIds = relevantUnresolvedTruncations(receiptState, report, dossier.impact_graph).sort();
  if (unresolvedTruncationIds.length > 0) addReason(reasons, "CONTEXT_TRUNCATION_UNRESOLVED", "Relevant truncated context results remain unresolved", unresolvedTruncationIds);
  if (report.tool_state.semantic_completeness_claimed) {
    addReason(reasons, "CONTEXT_SEMANTIC_COMPLETENESS_UNSUPPORTED", "The bounded context contract never permits a claim of complete semantic understanding");
  }
  for (const tool of report.tool_state.advanced_available) {
    if (!receiptState.entries.some((entry) => entry.tool_id === tool && ["success", "empty"].includes(entry.status))) addReason(reasons, "CONTEXT_TOOL_AVAILABILITY_UNOBSERVED", `Claimed advanced tool ${tool} was not observed`, [tool]);
  }
  if (strategyBinding.semantic_relation_evidence === "required_or_blocked") {
    const semanticReceiptObserved = receiptState.entries.some((entry) => (
      entry.tool_id === "context_related"
      && report.receipt_ids.includes(entry.receipt_id)
      && report.tool_state.advanced_available.includes(entry.tool_id)
      && entry.status === "success"
      && (entry.result?.relationships.length ?? 0) > 0
    ));
    const requiredEdgeIds = new Set(dossier.impact_graph.affected_paths.flatMap((path) => path.edge_ids));
    const allRequiredEdgesObserved = dossier.impact_graph.edges
      .filter((edge) => requiredEdgeIds.has(edge.id))
      .every((edge) => supportsSubject(edge.id, evidenceForReceipts(receiptState, report.receipt_ids)));
    if (dossier.impact_graph.coverage.semantic_tool_status !== "available" || !semanticReceiptObserved || !allRequiredEdgesObserved) {
      addReason(
        reasons,
        "CONTEXT_SEMANTIC_COMPLETENESS_UNSUPPORTED",
        "Critical strategy requires runner-observed semantic relation evidence; literal fallback alone is insufficient",
      );
    }
  }
  if (strategyBinding.requires_sibling_variant_discovery) {
    const affectedPaths = new Set(dossier.impact_graph.nodes
      .filter((node) => node.kind !== "test" && typeof node.path === "string")
      .map((node) => node.path));
    const excludedPaths = new Set(dossier.impact_graph.excluded_siblings.map((entry) => entry.path));
    const siblingQuestions = report.task_evidence.sibling_variant_question_ids.map((id) => questions.get(id)).filter(Boolean);
    const siblingResolved = siblingQuestions.some((question) => {
      if (!["confirmed", "refuted"].includes(question.status) || question.receipt_ids.length === 0) return false;
      const evidence = evidenceForReceipts(receiptState, question.receipt_ids);
      const observed = new Set([...evidence.contentPaths, ...evidence.inventoryPaths, ...evidence.exclusionPaths]);
      const ownerObserved = [...affectedPaths].some((path) => observed.has(path));
      const siblingBoundaryObserved = excludedPaths.size === 0
        ? evidence.inventoryPaths.size > 0
        : [...excludedPaths].some((path) => observed.has(path));
      return ownerObserved && siblingBoundaryObserved;
    });
    if (!siblingResolved) addReason(reasons, "CONTEXT_SIBLING_DISCOVERY_MISSING", "Applicable task lacks resolved machine-evidenced sibling-variant discovery");
  }
  if (["bug_fix", "diagnosis_driven_implementation"].includes(strategyBinding.task_profile)) {
    const owningClaim = claimById.get(report.task_evidence.owning_abstraction_claim_id);
    const ownerNodeIds = new Set(dossier.impact_graph.nodes
      .filter((node) => ["module", "service"].includes(node.kind) || node.boundary === "module")
      .map((node) => node.id));
    if (!owningClaim || owningClaim.kind !== "observed"
      || !owningClaim.subject_ids.some((id) => ownerNodeIds.has(id) && machineSubjects.has(id))) {
      addReason(reasons, "CONTEXT_OWNING_ABSTRACTION_MISSING", "Bug/diagnosis work lacks a machine-evidenced owning-abstraction claim");
    }
  }
  if (strategyBinding.requires_negative_path && report.task_evidence.negative_path_ids.length === 0) addReason(reasons, "CONTEXT_NEGATIVE_PATH_MISSING", "Task lacks required negative-path analysis");
  if (strategyBinding.requires_compatibility && report.task_evidence.compatibility_ids.length === 0) addReason(reasons, "CONTEXT_COMPATIBILITY_ANALYSIS_MISSING", "Task lacks required compatibility analysis");
  if (report.risk_class === "critical") {
    const requiredCritical = ["recovery_restart", "security_data_integrity", "transaction_rollback", "concurrency_ordering"];
    for (const deep of report.deep_analyses) {
      const dimensions = new Set(deep.dimensions.map((entry) => entry.dimension));
      for (const dimension of requiredCritical) if (!dimensions.has(dimension)) addReason(reasons, "CONTEXT_CRITICAL_RISK_ANALYSIS_MISSING", `Critical analysis ${deep.id} lacks ${dimension} classification`, [deep.id, dimension]);
    }
  }
  if (report.budget_state.exhausted
    || report.budget_state.context_calls_used !== receiptState.entries.length
    || receiptState.entries.length > strategyBinding.budgets.max_context_calls
    || report.budget_state.read_only_subagents_used !== readOnlySubagentsUsed
    || readOnlySubagentsUsed > strategyBinding.budgets.max_read_only_subagents) {
    addReason(reasons, "CONTEXT_BUDGET_EXHAUSTED", "Context call budget is exhausted or does not match runner-observed receipts");
  }
  for (const wide of report.wide_analysis) for (const claimId of wide.claim_ids) if (!claimById.has(claimId)) addReason(reasons, "CONTEXT_CLAIM_EVIDENCE_MISSING", `Wide category references missing claim ${claimId}`, [wide.id, claimId]);
  return { cutoff: receiptState.cutoff };
}

function taskProfileCheckObserved(evidence, obligation, expectedOutcome) {
  if (evidence === null || obligation === undefined) return false;
  return evidence.checks.some((check) => (
    check.obligation_id === obligation.id
    && check.check_id === obligation.check_id
    && check.purpose === obligation.kind
    && check.phase === "preimplementation"
    && check.status === "passed"
    && check.observed_outcome === expectedOutcome
    && check.trusted_producer === obligation.trusted_producer
    && check.command_or_mechanism === obligation.command_or_mechanism
  ));
}

function evaluateTaskProfileEvidence({
  reasons,
  evidence,
  strategyBinding,
  dossier,
  report,
  sessionKey,
  workspaceFingerprint,
  evaluatedAt,
}) {
  validateContextTaskProfileEvidence(evidence, { dossier });
  if (evidence !== null && (
    evidence.session_key !== sessionKey
    || evidence.run_id !== dossier.run_id
    || evidence.task_id !== dossier.task_id
    || evidence.dossier_id !== dossier.dossier_id
    || !fingerprintsEqual(evidence.workspace_fingerprint, workspaceFingerprint)
    || !fingerprintsEqual(evidence.dossier_analysis_fingerprint, engineeringDossierAnalysisFingerprint(dossier))
    || Date.parse(evidence.created_at) > Date.parse(evaluatedAt)
  )) {
    addReason(reasons, "CONTEXT_EVIDENCE_STALE", "Context task-profile evidence is stale or bound to another task, dossier, or workspace", [evidence.evidence_id]);
  }
  const obligations = new Map(dossier.test_obligations.map((entry) => [entry.id, entry]));
  if (strategyBinding.requires_pre_change_reproduction) {
    const referencedIds = report?.task_evidence.reproduction_evidence_ids
      ?? dossier.test_obligations.filter((entry) => entry.phase === "preimplementation" && entry.kind === "reproducer").map((entry) => entry.id);
    const reproduced = (report?.task_evidence.reproduction_status ?? "reproduced") === "reproduced"
      && referencedIds.length > 0
      && referencedIds.every((id) => {
        const obligation = obligations.get(id);
        return obligation?.phase === "preimplementation" && obligation.kind === "reproducer"
          && taskProfileCheckObserved(evidence, obligation, "failing_reproducer");
      });
    if (!reproduced) {
      addReason(reasons, "CONTEXT_REPRODUCTION_MISSING", "Required pre-change reproduction lacks a runner-owned failing-reproducer outcome", referencedIds);
    }
  }
  if (strategyBinding.requires_characterization) {
    const referencedIds = report?.task_evidence.characterization_test_ids
      ?? dossier.test_obligations.filter((entry) => entry.phase === "preimplementation" && entry.kind === "characterization").map((entry) => entry.id);
    const characterized = referencedIds.length > 0 && referencedIds.every((id) => {
      const obligation = obligations.get(id);
      return obligation?.phase === "preimplementation" && obligation.kind === "characterization"
        && taskProfileCheckObserved(evidence, obligation, "passing_characterization");
    });
    if (!characterized) {
      addReason(reasons, "CONTEXT_CHARACTERIZATION_MISSING", "Behavior-preserving work lacks a runner-owned passing-characterization outcome", referencedIds);
    }
  }
}

export function evaluateContextSufficiency({
  decision_id: decisionId,
  session_key: sessionKey,
  strategy_binding: strategyBinding,
  dossier,
  workspace_fingerprint: workspaceFingerprint,
  receipt_index: receiptIndex,
  report = null,
  standard_lite_summary: standardLiteSummary = null,
  task_profile_evidence: taskProfileEvidence = null,
  implementation_started_sequence: implementationStartedSequence = null,
  read_only_subagents_used: readOnlySubagentsUsed = 0,
  evaluated_at: evaluatedAt,
} = {}) {
  validateContextStrategyBinding(strategyBinding);
  validateEngineeringDossier(dossier);
  assertFingerprint(workspaceFingerprint, "context sufficiency workspace fingerprint");
  assertIso(evaluatedAt, "context sufficiency evaluated_at");
  assertInteger(readOnlySubagentsUsed, "context sufficiency read_only_subagents_used", { min: 0, max: 16 });
  if (strategyBinding.risk_class !== dossier.risk_class) throw new ContractError("CONTEXT_DECISION_RISK_BINDING", "strategy and dossier risk classes differ");
  const reasons = [];
  const state = dossier.risk_class === "standard-lite"
    ? evaluateStandardLite({ reasons, summary: standardLiteSummary, strategyBinding, dossier, sessionKey, workspaceFingerprint, receiptIndex, implementationStartedSequence, readOnlySubagentsUsed })
    : evaluateFull({ reasons, report, strategyBinding, dossier, sessionKey, workspaceFingerprint, receiptIndex, implementationStartedSequence, readOnlySubagentsUsed });
  evaluateTaskProfileEvidence({
    reasons,
    evidence: taskProfileEvidence,
    strategyBinding,
    dossier,
    report,
    sessionKey,
    workspaceFingerprint,
    evaluatedAt,
  });
  let receiptIndexFingerprint;
  try {
    receiptIndexFingerprint = contextReceiptIndexFingerprint(receiptIndex, {
      session_key: sessionKey,
      run_id: dossier.run_id,
      task_id: dossier.task_id,
      source_fingerprint: workspaceFingerprint,
    });
  } catch (error) {
    addReason(reasons, "CONTEXT_RECEIPT_BINDING_INVALID", error instanceof Error ? error.message : "Context receipt index is invalid");
    receiptIndexFingerprint = fingerprint({
      invalid_context_receipt_index: true,
      session_key: sessionKey,
      run_id: dossier.run_id,
      task_id: dossier.task_id,
      source_fingerprint: workspaceFingerprint,
      receipt_count: receiptEntries(receiptIndex).length,
    });
  }
  const cleanReasons = reasons.map(({ identity: _identity, ...entry }) => entry).sort((left, right) => left.code.localeCompare(right.code) || left.subject_ids.join(",").localeCompare(right.subject_ids.join(",")));
  const status = cleanReasons.length === 0 ? "sufficient" : cleanReasons.some((entry) => BLOCKING_REASON_CODES.has(entry.code)) ? "blocked" : "insufficient";
  const source = {
    schema_version: CONTEXT_SUFFICIENCY_DECISION_SCHEMA_VERSION,
    decision_id: decisionId,
    session_key: sessionKey,
    run_id: dossier.run_id,
    task_id: dossier.task_id,
    risk_class: dossier.risk_class,
    strategy_id: strategyBinding.strategy_id,
    strategy_binding_fingerprint: strategyBinding.fingerprint,
    workspace_fingerprint: workspaceFingerprint,
    dossier_id: dossier.dossier_id,
    dossier_analysis_fingerprint: engineeringDossierAnalysisFingerprint(dossier),
    impact_graph_id: dossier.impact_graph?.graph_id ?? null,
    impact_graph_fingerprint: dossier.impact_graph?.fingerprint ?? null,
    report_id: report?.report_id ?? null,
    report_fingerprint: report?.fingerprint ?? null,
    receipt_index_fingerprint: receiptIndexFingerprint,
    preimplementation_cutoff_sequence: state.cutoff,
    implementation_started_sequence: implementationStartedSequence,
    task_profile_evidence: taskProfileEvidence === null ? null : JSON.parse(canonicalJson(taskProfileEvidence)),
    status,
    reasons: cleanReasons,
    evaluated_at: evaluatedAt,
  };
  const decision = deepFrozenClone({ ...source, fingerprint: fingerprint(source) }, "context sufficiency decision");
  validateContextSufficiencyDecision(decision);
  return decision;
}

export function contextSufficiencyDecisionFingerprintInput(decision) {
  validateContextSufficiencyDecision(decision);
  return deepFrozenClone(decisionFingerprintInput(decision), "context sufficiency decision fingerprint input");
}

export function assertContextDecisionCurrent(decision, {
  strategy_binding: strategyBinding,
  dossier,
  workspace_fingerprint: workspaceFingerprint,
  receipt_index: receiptIndex,
} = {}) {
  validateContextSufficiencyDecision(decision);
  validateContextStrategyBinding(strategyBinding);
  validateEngineeringDossier(dossier);
  validateContextTaskProfileEvidence(decision.task_profile_evidence, { dossier });
  if (decision.status !== "sufficient") throw new ContractError("CONTEXT_SUFFICIENCY_REQUIRED", "mutation requires a sufficient context decision");
  if (!fingerprintsEqual(decision.strategy_binding_fingerprint, strategyBinding.fingerprint)
    || !fingerprintsEqual(decision.dossier_analysis_fingerprint, engineeringDossierAnalysisFingerprint(dossier))
    || !fingerprintsEqual(decision.workspace_fingerprint, workspaceFingerprint)
    || (decision.task_profile_evidence !== null && (
      decision.task_profile_evidence.session_key !== decision.session_key
      || decision.task_profile_evidence.run_id !== decision.run_id
      || decision.task_profile_evidence.task_id !== decision.task_id
      || decision.task_profile_evidence.dossier_id !== decision.dossier_id
      || !fingerprintsEqual(decision.task_profile_evidence.workspace_fingerprint, workspaceFingerprint)
      || !fingerprintsEqual(decision.task_profile_evidence.dossier_analysis_fingerprint, engineeringDossierAnalysisFingerprint(dossier))
    ))
    || !fingerprintsEqual(decision.receipt_index_fingerprint, contextReceiptIndexFingerprint(receiptIndex, {
      session_key: decision.session_key,
      run_id: decision.run_id,
      task_id: decision.task_id,
      source_fingerprint: workspaceFingerprint,
    }))) {
    throw new ContractError("CONTEXT_EVIDENCE_STALE", "context sufficiency decision is stale");
  }
  return decision;
}
