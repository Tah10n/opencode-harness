import { assertSafeId, canonicalJson } from "../feedback/contracts.mjs";
import { assertPersistenceSafe } from "../feedback/privacy.mjs";
import { QUALITY_LIMITS } from "./constants.mjs";
import { validateArchitectureEvaluation } from "./architecture.mjs";
import { validateEngineeringDossier } from "./dossier.mjs";
import { validateContextReceiptEvidenceIndex, validateContextSufficiencyDecision } from "./context-sufficiency.mjs";
import { validateContextReconciliation } from "./context-reconciliation.mjs";
import { engineeringDossierAnalysisFingerprint, validateWholeSystemContextReport } from "./whole-system-context-report.mjs";
import {
  validateEngineeringGateDecision,
  validateEngineeringPreimplementationEvidence,
} from "./gate.mjs";
import { validateIntegratedVerificationEvidence } from "./verification-evidence.mjs";
import {
  ContractError,
  assertArray,
  assertInteger,
  assertString,
  deepFrozenClone,
  exact,
} from "./validation.mjs";

const STORE_INTERNALS = new WeakMap();

function stateFor(store) {
  const state = STORE_INTERNALS.get(store);
  if (!state) throw new ContractError("QUALITY_STORE", "store must be created by createEngineeringQualityStore");
  return state;
}

function serializedBytes(value) {
  return Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertRecordWithinLimits(state, value, label) {
  assertPersistenceSafe(value, {
    label,
    denyValues: state.denyValues,
    maxDepth: state.limits.objectDepth,
  });
  const recordBytes = serializedBytes(value);
  if (recordBytes > state.limits.recordBytes) {
    throw new ContractError("QUALITY_RECORD_BYTES", `${label} exceeds ${state.limits.recordBytes} UTF-8 bytes`);
  }
  return recordBytes;
}

function assertWithinLimits(state, value, label, { replacingBytes = 0 } = {}) {
  const recordBytes = assertRecordWithinLimits(state, value, label);
  if (state.totalBytes - replacingBytes + recordBytes > state.limits.bundleBytes) {
    throw new ContractError("QUALITY_BUNDLE_BYTES", `quality bundle exceeds ${state.limits.bundleBytes} UTF-8 bytes`);
  }
  return recordBytes;
}

function normalizeLimits(overrides) {
  exact(overrides, ["recordBytes", "bundleBytes", "objectDepth"], [], "quality store limits");
  const limits = {
    recordBytes: overrides.recordBytes ?? QUALITY_LIMITS.recordBytes,
    bundleBytes: overrides.bundleBytes ?? QUALITY_LIMITS.bundleBytes,
    objectDepth: overrides.objectDepth ?? QUALITY_LIMITS.objectDepth,
  };
  assertInteger(limits.recordBytes, "quality store limits.recordBytes", { min: 1024, max: 16 * 1024 * 1024 });
  assertInteger(limits.bundleBytes, "quality store limits.bundleBytes", { min: limits.recordBytes, max: 64 * 1024 * 1024 });
  assertInteger(limits.objectDepth, "quality store limits.objectDepth", { min: 4, max: 32 });
  return Object.freeze(limits);
}

export function createEngineeringQualityStore(options) {
  exact(options, ["run_id", "task_id", "deny_values", "limits"], ["run_id", "task_id"], "quality store options");
  const runId = assertSafeId(options.run_id, "quality store.run_id");
  const taskId = assertSafeId(options.task_id, "quality store.task_id");
  const denyValues = options.deny_values ?? [];
  assertArray(denyValues, "quality store.deny_values", {
    max: 64,
    item: (entry, label) => assertString(entry, label, { maxBytes: 512 }),
  });
  const api = Object.freeze({ run_id: runId, task_id: taskId });
  STORE_INTERNALS.set(api, {
    runId,
    taskId,
    denyValues: Object.freeze([...denyValues]),
    limits: normalizeLimits(options.limits ?? {}),
    dossiers: new Map(),
    architectureEvaluations: new Map(),
    postArchitectureEvaluations: new Map(),
    preimplementationEvidence: new Map(),
    integratedVerificationEvidence: new Map(),
    contextDecisions: new Map(),
    contextReconciliations: new Map(),
    contextReceiptIndexes: new Map(),
    contextReports: new Map(),
    gates: new Map(),
    totalBytes: 0,
    sealed: false,
  });
  return api;
}

export function recordArchitectureEvaluation(store, evaluation) {
  const state = stateFor(store);
  if (state.sealed) throw new ContractError("QUALITY_STORE_SEALED", "quality store is sealed");
  validateArchitectureEvaluation(evaluation);
  const dossier = [...state.dossiers.values()][0] ?? null;
  if (!dossier || dossier.impact_graph === null) {
    throw new ContractError("QUALITY_ARCHITECTURE_DOSSIER", "architecture evaluation requires a recorded dossier impact graph");
  }
  if (
    evaluation.graph_id !== dossier.impact_graph.graph_id
    || evaluation.graph_fingerprint !== dossier.impact_graph.fingerprint
    || evaluation.evaluation_id !== dossier.architecture_assessment.evaluation_id
    || evaluation.status !== dossier.architecture_assessment.status
  ) {
    throw new ContractError("QUALITY_ARCHITECTURE_DOSSIER", "architecture evaluation does not match the recorded dossier assessment");
  }
  const existing = state.architectureEvaluations.get(evaluation.evaluation_id);
  if (existing) {
    if (existing.fingerprint !== evaluation.fingerprint || canonicalJson(existing) !== canonicalJson(evaluation)) {
      throw new ContractError("QUALITY_ARCHITECTURE_RECORD_CONFLICT", `architecture evaluation differs: ${evaluation.evaluation_id}`);
    }
    return existing;
  }
  if (state.architectureEvaluations.size >= 1) {
    throw new ContractError("QUALITY_ARCHITECTURE_CARDINALITY", "a quality run binds at most one architecture evaluation");
  }
  const stored = deepFrozenClone(evaluation, "recorded architecture evaluation");
  const bytes = assertWithinLimits(state, stored, "recorded architecture evaluation");
  state.architectureEvaluations.set(stored.evaluation_id, stored);
  state.totalBytes += bytes;
  return stored;
}

export function recordPostArchitectureEvaluation(store, evaluation) {
  const state = stateFor(store);
  if (state.sealed) throw new ContractError("QUALITY_STORE_SEALED", "quality store is sealed");
  validateArchitectureEvaluation(evaluation);
  const dossier = [...state.dossiers.values()][0] ?? null;
  const baselineEvaluation = [...state.architectureEvaluations.values()][0] ?? null;
  if (!dossier?.impact_graph || !baselineEvaluation || baselineEvaluation.policy_id === null) {
    throw new ContractError(
      "QUALITY_POST_ARCHITECTURE_BASELINE",
      "post-implementation architecture evaluation requires a configured recorded baseline evaluation",
    );
  }
  if (
    evaluation.policy_id !== baselineEvaluation.policy_id
    || evaluation.policy_fingerprint !== baselineEvaluation.policy_fingerprint
    || evaluation.baseline_graph_id !== dossier.impact_graph.graph_id
    || evaluation.baseline_graph_fingerprint !== dossier.impact_graph.fingerprint
  ) {
    throw new ContractError(
      "QUALITY_POST_ARCHITECTURE_BINDING",
      "post-implementation architecture evaluation does not bind the dossier baseline and policy",
    );
  }
  const existing = state.postArchitectureEvaluations.get(evaluation.evaluation_id);
  if (existing) {
    if (existing.fingerprint !== evaluation.fingerprint || canonicalJson(existing) !== canonicalJson(evaluation)) {
      throw new ContractError(
        "QUALITY_POST_ARCHITECTURE_RECORD_CONFLICT",
        `post-implementation architecture evaluation differs: ${evaluation.evaluation_id}`,
      );
    }
    return existing;
  }
  if (state.postArchitectureEvaluations.size >= 1) {
    throw new ContractError(
      "QUALITY_POST_ARCHITECTURE_CARDINALITY",
      "a quality run binds at most one post-implementation architecture evaluation",
    );
  }
  const stored = deepFrozenClone(evaluation, "recorded post-implementation architecture evaluation");
  const bytes = assertWithinLimits(state, stored, "recorded post-implementation architecture evaluation");
  state.postArchitectureEvaluations.set(stored.evaluation_id, stored);
  state.totalBytes += bytes;
  return stored;
}

export function recordEngineeringDossier(store, dossier) {
  const state = stateFor(store);
  if (state.sealed) throw new ContractError("QUALITY_STORE_SEALED", "quality store is sealed");
  validateEngineeringDossier(dossier, { requireFinalized: true });
  if (dossier.run_id !== state.runId) throw new ContractError("QUALITY_STORE_RUN", "dossier run_id does not match quality store");
  if (dossier.task_id !== state.taskId) throw new ContractError("QUALITY_STORE_TASK", "dossier task_id does not match quality store");
  const existing = state.dossiers.get(dossier.dossier_id);
  if (existing) {
    if (existing.fingerprint !== dossier.fingerprint || canonicalJson(existing) !== canonicalJson(dossier)) {
      throw new ContractError("QUALITY_DOSSIER_RECORD_CONFLICT", `dossier already recorded with different contents: ${dossier.dossier_id}`);
    }
    return existing;
  }
  if (state.dossiers.size >= 1) throw new ContractError("QUALITY_DOSSIER_CARDINALITY", "a quality run binds exactly one dossier");
  const contextDecision = [...state.contextDecisions.values()][0] ?? null;
  if (contextDecision !== null && (
    contextDecision.dossier_id !== dossier.dossier_id
    || contextDecision.dossier_analysis_fingerprint !== engineeringDossierAnalysisFingerprint(dossier)
  )) {
    throw new ContractError("CONTEXT_EVIDENCE_STALE", "finalized dossier does not preserve the context decision analysis binding");
  }
  const stored = deepFrozenClone(dossier, "recorded engineering dossier");
  const bytes = assertWithinLimits(state, stored, "recorded engineering dossier");
  state.dossiers.set(stored.dossier_id, stored);
  state.totalBytes += bytes;
  return stored;
}

export function recordContextSufficiencyDecision(store, decision) {
  const state = stateFor(store);
  if (state.sealed) throw new ContractError("QUALITY_STORE_SEALED", "quality store is sealed");
  validateContextSufficiencyDecision(decision);
  if (decision.run_id !== state.runId || decision.task_id !== state.taskId) {
    throw new ContractError("CONTEXT_DECISION_BINDING", "context decision identity does not match quality store");
  }
  const receiptIndex = [...state.contextReceiptIndexes.values()][0] ?? null;
  if (!receiptIndex || decision.receipt_index_fingerprint !== receiptIndex.fingerprint) {
    throw new ContractError("CONTEXT_DECISION_BINDING", "context decision requires its exact recorded receipt evidence index");
  }
  const report = [...state.contextReports.values()][0] ?? null;
  if (decision.report_id !== (report?.report_id ?? null) || decision.report_fingerprint !== (report?.fingerprint ?? null)) {
    throw new ContractError("CONTEXT_DECISION_BINDING", "context decision report fingerprint does not match the recorded context report");
  }
  const existing = state.contextDecisions.get(decision.decision_id);
  if (existing) {
    if (existing.fingerprint !== decision.fingerprint || canonicalJson(existing) !== canonicalJson(decision)) {
      throw new ContractError("CONTEXT_DECISION_CONFLICT", `context decision differs: ${decision.decision_id}`);
    }
    return existing;
  }
  if (state.contextDecisions.size >= 1) throw new ContractError("CONTEXT_DECISION_CARDINALITY", "a quality run binds exactly one preimplementation context decision");
  const dossier = [...state.dossiers.values()][0] ?? null;
  if (dossier !== null && (
    decision.dossier_id !== dossier.dossier_id
    || decision.dossier_analysis_fingerprint !== engineeringDossierAnalysisFingerprint(dossier)
  )) {
    throw new ContractError("CONTEXT_EVIDENCE_STALE", "context decision does not bind the recorded dossier analysis");
  }
  const stored = deepFrozenClone(decision, "recorded context sufficiency decision");
  const bytes = assertWithinLimits(state, stored, "recorded context sufficiency decision");
  state.contextDecisions.set(stored.decision_id, stored);
  state.totalBytes += bytes;
  return stored;
}

export function recordContextReceiptEvidenceIndex(store, index) {
  const state = stateFor(store);
  if (state.sealed) throw new ContractError("QUALITY_STORE_SEALED", "quality store is sealed");
  validateContextReceiptEvidenceIndex(index);
  if (index.run_id !== state.runId || index.task_id !== state.taskId) throw new ContractError("CONTEXT_RECEIPT_INDEX_BINDING", "context receipt index identity does not match quality store");
  const existing = [...state.contextReceiptIndexes.values()][0] ?? null;
  if (existing) {
    if (existing.fingerprint !== index.fingerprint || canonicalJson(existing) !== canonicalJson(index)) throw new ContractError("CONTEXT_RECEIPT_INDEX_CONFLICT", "quality run already binds another context receipt index");
    return existing;
  }
  const stored = deepFrozenClone(index, "recorded context receipt evidence index");
  const bytes = assertWithinLimits(state, stored, "recorded context receipt evidence index");
  state.contextReceiptIndexes.set(stored.fingerprint, stored);
  state.totalBytes += bytes;
  return stored;
}

export function recordWholeSystemContextReport(store, report) {
  const state = stateFor(store);
  if (state.sealed) throw new ContractError("QUALITY_STORE_SEALED", "quality store is sealed");
  validateWholeSystemContextReport(report);
  if (report.status !== "finalized") throw new ContractError("CONTEXT_REPORT_NOT_FINALIZED", "quality store accepts only immutable context reports");
  if (report.run_id !== state.runId || report.task_id !== state.taskId) throw new ContractError("CONTEXT_REPORT_BINDING", "context report identity does not match quality store");
  const existing = state.contextReports.get(report.report_id);
  if (existing) {
    if (existing.fingerprint !== report.fingerprint || canonicalJson(existing) !== canonicalJson(report)) throw new ContractError("CONTEXT_REPORT_CONFLICT", `context report differs: ${report.report_id}`);
    return existing;
  }
  if (state.contextReports.size >= 1) throw new ContractError("CONTEXT_REPORT_CARDINALITY", "a quality run binds at most one Whole-System Context Report");
  const stored = deepFrozenClone(report, "recorded whole-system context report");
  const bytes = assertWithinLimits(state, stored, "recorded whole-system context report");
  state.contextReports.set(stored.report_id, stored);
  state.totalBytes += bytes;
  return stored;
}

export function recordContextDecisionEvidenceBundle(store, input) {
  const state = stateFor(store);
  if (state.sealed) throw new ContractError("QUALITY_STORE_SEALED", "quality store is sealed");
  exact(input, ["decision", "receipt_index", "report"], ["decision", "receipt_index", "report"], "context decision evidence bundle");
  const decision = validateContextSufficiencyDecision(input.decision);
  const receiptIndex = validateContextReceiptEvidenceIndex(input.receipt_index);
  const report = input.report === null ? null : validateWholeSystemContextReport(input.report);

  if (receiptIndex.run_id !== state.runId || receiptIndex.task_id !== state.taskId) {
    throw new ContractError("CONTEXT_RECEIPT_INDEX_BINDING", "context receipt index identity does not match quality store");
  }
  if (decision.run_id !== state.runId || decision.task_id !== state.taskId) {
    throw new ContractError("CONTEXT_DECISION_BINDING", "context decision identity does not match quality store");
  }
  if (decision.receipt_index_fingerprint !== receiptIndex.fingerprint
    || decision.session_key !== receiptIndex.session_key
    || decision.workspace_fingerprint !== receiptIndex.source_fingerprint) {
    throw new ContractError("CONTEXT_DECISION_BINDING", "context decision requires its exact recorded receipt evidence index");
  }
  if (report !== null) {
    if (report.status !== "finalized") {
      throw new ContractError("CONTEXT_REPORT_NOT_FINALIZED", "quality store accepts only immutable context reports");
    }
    if (report.run_id !== state.runId || report.task_id !== state.taskId) {
      throw new ContractError("CONTEXT_REPORT_BINDING", "context report identity does not match quality store");
    }
  }
  if (decision.report_id !== (report?.report_id ?? null)
    || decision.report_fingerprint !== (report?.fingerprint ?? null)) {
    throw new ContractError("CONTEXT_DECISION_BINDING", "context decision report fingerprint does not match the recorded context report");
  }
  if (report !== null) {
    const reportBindings = [
      ["session_key", "session_key"],
      ["run_id", "run_id"],
      ["task_id", "task_id"],
      ["risk_class", "risk_class"],
      ["strategy_id", "strategy_id"],
      ["strategy_binding_fingerprint", "strategy_binding_fingerprint"],
      ["workspace_fingerprint", "workspace_fingerprint"],
      ["dossier_id", "dossier_id"],
      ["dossier_analysis_fingerprint", "dossier_analysis_fingerprint"],
      ["impact_graph_id", "impact_graph_id"],
      ["impact_graph_fingerprint", "impact_graph_fingerprint"],
    ];
    if (reportBindings.some(([reportKey, decisionKey]) => report[reportKey] !== decision[decisionKey])) {
      throw new ContractError("CONTEXT_DECISION_BINDING", "context decision does not bind the exact context report identity and analysis");
    }
    const indexedReceiptIds = new Set(receiptIndex.receipts.map((entry) => entry.receipt_id));
    if (report.receipt_ids.some((receiptId) => !indexedReceiptIds.has(receiptId))) {
      throw new ContractError("CONTEXT_DECISION_BINDING", "context report references evidence outside the recorded receipt index");
    }
  }
  const taskProfileEvidence = decision.task_profile_evidence;
  if (taskProfileEvidence !== null && (
    taskProfileEvidence.session_key !== decision.session_key
    || taskProfileEvidence.run_id !== decision.run_id
    || taskProfileEvidence.task_id !== decision.task_id
    || taskProfileEvidence.dossier_id !== decision.dossier_id
    || taskProfileEvidence.workspace_fingerprint !== decision.workspace_fingerprint
    || taskProfileEvidence.dossier_analysis_fingerprint !== decision.dossier_analysis_fingerprint
  )) {
    throw new ContractError("CONTEXT_DECISION_BINDING", "context decision task-profile evidence does not bind its analytical state");
  }
  const dossier = [...state.dossiers.values()][0] ?? null;
  if (dossier !== null && (
    decision.dossier_id !== dossier.dossier_id
    || decision.dossier_analysis_fingerprint !== engineeringDossierAnalysisFingerprint(dossier)
  )) {
    throw new ContractError("CONTEXT_EVIDENCE_STALE", "context decision does not bind the recorded dossier analysis");
  }

  const existingIndex = [...state.contextReceiptIndexes.values()][0] ?? null;
  if (existingIndex !== null && canonicalJson(existingIndex) !== canonicalJson(receiptIndex)) {
    throw new ContractError("CONTEXT_RECEIPT_INDEX_CONFLICT", "quality run already binds another context receipt index");
  }
  const existingReport = [...state.contextReports.values()][0] ?? null;
  if (report === null && existingReport !== null) {
    throw new ContractError("CONTEXT_REPORT_CARDINALITY", "a quality run already binds a Whole-System Context Report");
  }
  if (report !== null && existingReport !== null && canonicalJson(existingReport) !== canonicalJson(report)) {
    if (existingReport.report_id === report.report_id) {
      throw new ContractError("CONTEXT_REPORT_CONFLICT", `context report differs: ${report.report_id}`);
    }
    throw new ContractError("CONTEXT_REPORT_CARDINALITY", "a quality run binds at most one Whole-System Context Report");
  }
  const existingDecision = [...state.contextDecisions.values()][0] ?? null;
  if (existingDecision !== null && canonicalJson(existingDecision) !== canonicalJson(decision)) {
    if (existingDecision.decision_id === decision.decision_id) {
      throw new ContractError("CONTEXT_DECISION_CONFLICT", `context decision differs: ${decision.decision_id}`);
    }
    throw new ContractError("CONTEXT_DECISION_CARDINALITY", "a quality run binds exactly one preimplementation context decision");
  }

  const storedIndex = existingIndex ?? deepFrozenClone(receiptIndex, "recorded context receipt evidence index");
  const storedReport = report === null
    ? null
    : existingReport ?? deepFrozenClone(report, "recorded whole-system context report");
  const storedDecision = existingDecision ?? deepFrozenClone(decision, "recorded context sufficiency decision");
  const indexBytes = assertRecordWithinLimits(state, storedIndex, "recorded context receipt evidence index");
  const reportBytes = storedReport === null
    ? 0
    : assertRecordWithinLimits(state, storedReport, "recorded whole-system context report");
  const decisionBytes = assertRecordWithinLimits(state, storedDecision, "recorded context sufficiency decision");
  const newBytes = (existingIndex === null ? indexBytes : 0)
    + (report !== null && existingReport === null ? reportBytes : 0)
    + (existingDecision === null ? decisionBytes : 0);
  if (state.totalBytes + newBytes > state.limits.bundleBytes) {
    throw new ContractError("QUALITY_BUNDLE_BYTES", `quality bundle exceeds ${state.limits.bundleBytes} UTF-8 bytes`);
  }

  if (existingIndex === null) state.contextReceiptIndexes.set(storedIndex.fingerprint, storedIndex);
  if (report !== null && existingReport === null) state.contextReports.set(storedReport.report_id, storedReport);
  if (existingDecision === null) state.contextDecisions.set(storedDecision.decision_id, storedDecision);
  state.totalBytes += newBytes;
  return deepFrozenClone({
    decision: storedDecision,
    receipt_index: storedIndex,
    report: storedReport,
  }, "recorded context decision evidence bundle");
}

export function recordContextReconciliation(store, reconciliation) {
  const state = stateFor(store);
  if (state.sealed) throw new ContractError("QUALITY_STORE_SEALED", "quality store is sealed");
  validateContextReconciliation(reconciliation);
  if (reconciliation.run_id !== state.runId || reconciliation.task_id !== state.taskId) {
    throw new ContractError("CONTEXT_RECONCILIATION_BINDING", "context reconciliation identity does not match quality store");
  }
  const decision = [...state.contextDecisions.values()][0] ?? null;
  if (!decision || reconciliation.context_decision_id !== decision.decision_id
    || reconciliation.context_decision_fingerprint !== decision.fingerprint) {
    throw new ContractError("CONTEXT_RECONCILIATION_BINDING", "context reconciliation requires its exact recorded context decision");
  }
  const existing = state.contextReconciliations.get(reconciliation.reconciliation_id);
  if (existing) {
    if (existing.fingerprint !== reconciliation.fingerprint || canonicalJson(existing) !== canonicalJson(reconciliation)) {
      throw new ContractError("CONTEXT_RECONCILIATION_CONFLICT", `context reconciliation differs: ${reconciliation.reconciliation_id}`);
    }
    return existing;
  }
  if (state.contextReconciliations.size >= 1) throw new ContractError("CONTEXT_RECONCILIATION_CARDINALITY", "a quality run binds exactly one final reconciliation");
  const stored = deepFrozenClone(reconciliation, "recorded context reconciliation");
  const bytes = assertWithinLimits(state, stored, "recorded context reconciliation");
  state.contextReconciliations.set(stored.reconciliation_id, stored);
  state.totalBytes += bytes;
  return stored;
}

export function recordPreimplementationEvidence(store, evidence) {
  const state = stateFor(store);
  if (state.sealed) throw new ContractError("QUALITY_STORE_SEALED", "quality store is sealed");
  validateEngineeringPreimplementationEvidence(evidence);
  const dossier = state.dossiers.get(evidence.dossier_id);
  if (!dossier || dossier.fingerprint !== evidence.dossier_fingerprint) {
    throw new ContractError(
      "QUALITY_PREIMPLEMENTATION_EVIDENCE_BINDING",
      "preimplementation evidence requires its exact recorded finalized dossier",
    );
  }
  const existing = state.preimplementationEvidence.get(evidence.evidence_id);
  if (existing) {
    if (existing.fingerprint !== evidence.fingerprint || canonicalJson(existing) !== canonicalJson(evidence)) {
      throw new ContractError(
        "QUALITY_PREIMPLEMENTATION_EVIDENCE_CONFLICT",
        `preimplementation evidence differs: ${evidence.evidence_id}`,
      );
    }
    return existing;
  }
  if (state.preimplementationEvidence.size >= 1) {
    throw new ContractError(
      "QUALITY_PREIMPLEMENTATION_EVIDENCE_CARDINALITY",
      "a quality run binds at most one preimplementation evidence bundle",
    );
  }
  const stored = deepFrozenClone(evidence, "recorded preimplementation evidence");
  const bytes = assertWithinLimits(state, stored, "recorded preimplementation evidence");
  state.preimplementationEvidence.set(stored.evidence_id, stored);
  state.totalBytes += bytes;
  return stored;
}

export function recordGateDecision(store, decision) {
  const state = stateFor(store);
  if (state.sealed) throw new ContractError("QUALITY_STORE_SEALED", "quality store is sealed");
  validateEngineeringGateDecision(decision);
  if (decision.task_id !== state.taskId) throw new ContractError("QUALITY_STORE_TASK", "gate task_id does not match quality store");
  const dossier = state.dossiers.get(decision.dossier_id);
  if (!dossier) throw new ContractError("QUALITY_GATE_DOSSIER", "gate requires its finalized dossier to be recorded first");
  if (decision.dossier_fingerprint !== dossier.fingerprint) {
    throw new ContractError("QUALITY_GATE_DOSSIER", "gate dossier fingerprint does not match recorded dossier");
  }
  const architectureEvaluation = [...state.architectureEvaluations.values()][0] ?? null;
  if (decision.architecture_evaluation_fingerprint !== (architectureEvaluation?.fingerprint ?? null)) {
    throw new ContractError("QUALITY_GATE_ARCHITECTURE", "gate architecture fingerprint does not match recorded evaluation evidence");
  }
  const preimplementationEvidence = [...state.preimplementationEvidence.values()][0] ?? null;
  if (decision.preimplementation_evidence_fingerprint !== (preimplementationEvidence?.fingerprint ?? null)) {
    throw new ContractError(
      "QUALITY_GATE_PREIMPLEMENTATION_EVIDENCE",
      "gate preimplementation evidence fingerprint does not match recorded execution receipts",
    );
  }
  const existing = state.gates.get(decision.gate_id);
  if (existing) {
    if (existing.fingerprint !== decision.fingerprint || canonicalJson(existing) !== canonicalJson(decision)) {
      throw new ContractError("QUALITY_GATE_RECORD_CONFLICT", `gate already recorded with different contents: ${decision.gate_id}`);
    }
    return existing;
  }
  if (state.gates.size >= 1) throw new ContractError("QUALITY_GATE_CARDINALITY", "a quality run binds exactly one gate decision");
  const stored = deepFrozenClone(decision, "recorded engineering gate");
  const bytes = assertWithinLimits(state, stored, "recorded engineering gate");
  state.gates.set(stored.gate_id, stored);
  state.totalBytes += bytes;
  return stored;
}

export function recordIntegratedVerificationEvidence(store, evidence) {
  const state = stateFor(store);
  if (state.sealed) throw new ContractError("QUALITY_STORE_SEALED", "quality store is sealed");
  validateIntegratedVerificationEvidence(evidence);
  if (evidence.run_id !== state.runId || evidence.task_id !== state.taskId) {
    throw new ContractError("QUALITY_INTEGRATED_EVIDENCE_BINDING", "integrated verification identity does not match quality store");
  }
  const dossier = state.dossiers.get(evidence.dossier_id);
  const gate = state.gates.get(evidence.gate_id);
  if (
    !dossier
    || !gate
    || evidence.dossier_fingerprint !== dossier.fingerprint
    || evidence.gate_fingerprint !== gate.fingerprint
    || evidence.check_catalog_fingerprint !== gate.check_catalog_fingerprint
  ) {
    throw new ContractError(
      "QUALITY_INTEGRATED_EVIDENCE_BINDING",
      "integrated verification does not bind the exact recorded dossier, gate, and check catalog",
    );
  }
  const existing = state.integratedVerificationEvidence.get(evidence.evidence_id);
  if (existing) {
    if (existing.fingerprint !== evidence.fingerprint || canonicalJson(existing) !== canonicalJson(evidence)) {
      throw new ContractError(
        "QUALITY_INTEGRATED_EVIDENCE_CONFLICT",
        `integrated verification evidence differs: ${evidence.evidence_id}`,
      );
    }
    return existing;
  }
  if (state.integratedVerificationEvidence.size >= 16) {
    throw new ContractError("QUALITY_INTEGRATED_EVIDENCE_CARDINALITY", "a quality run may retain at most 16 verification revisions");
  }
  for (const recorded of state.integratedVerificationEvidence.values()) {
    if (recorded.trace_event_sequence === evidence.trace_event_sequence) {
      throw new ContractError(
        "QUALITY_INTEGRATED_EVIDENCE_CONFLICT",
        `integrated verification sequence is already recorded: ${evidence.trace_event_sequence}`,
      );
    }
    if (recorded.trace_event_sequence > evidence.trace_event_sequence) {
      throw new ContractError(
        "QUALITY_INTEGRATED_EVIDENCE_ORDER",
        "integrated verification evidence revisions must be recorded in trace order",
      );
    }
  }
  const stored = deepFrozenClone(evidence, "recorded integrated verification evidence");
  const bytes = assertWithinLimits(state, stored, "recorded integrated verification evidence");
  state.integratedVerificationEvidence.set(stored.evidence_id, stored);
  state.totalBytes += bytes;
  return stored;
}

export function inspectEngineeringDossier(store, dossierId) {
  const state = stateFor(store);
  assertSafeId(dossierId, "dossierId");
  const dossier = state.dossiers.get(dossierId);
  if (!dossier) throw new ContractError("QUALITY_DOSSIER_MISSING", `dossier is not recorded: ${dossierId}`);
  validateEngineeringDossier(dossier, { requireFinalized: true });
  assertWithinLimits(state, dossier, "inspected engineering dossier", { replacingBytes: serializedBytes(dossier) });
  return dossier;
}

export function inspectGateDecision(store, gateId) {
  const state = stateFor(store);
  assertSafeId(gateId, "gateId");
  const gate = state.gates.get(gateId);
  if (!gate) throw new ContractError("QUALITY_GATE_MISSING", `gate is not recorded: ${gateId}`);
  validateEngineeringGateDecision(gate);
  assertWithinLimits(state, gate, "inspected engineering gate", { replacingBytes: serializedBytes(gate) });
  return gate;
}

export function inspectContextSufficiencyDecision(store, decisionId) {
  const state = stateFor(store);
  assertSafeId(decisionId, "context decision ID");
  const decision = state.contextDecisions.get(decisionId);
  if (!decision) throw new ContractError("CONTEXT_DECISION_MISSING", `context decision is not recorded: ${decisionId}`);
  validateContextSufficiencyDecision(decision);
  assertWithinLimits(state, decision, "inspected context sufficiency decision", { replacingBytes: serializedBytes(decision) });
  return decision;
}

export function inspectContextReconciliation(store, reconciliationId) {
  const state = stateFor(store);
  assertSafeId(reconciliationId, "context reconciliation ID");
  const reconciliation = state.contextReconciliations.get(reconciliationId);
  if (!reconciliation) throw new ContractError("CONTEXT_RECONCILIATION_MISSING", `context reconciliation is not recorded: ${reconciliationId}`);
  validateContextReconciliation(reconciliation);
  assertWithinLimits(state, reconciliation, "inspected context reconciliation", { replacingBytes: serializedBytes(reconciliation) });
  return reconciliation;
}

export function snapshotEngineeringQualityStore(store, {
  seal = false,
  integrated_verification_evidence_id = null,
} = {}) {
  const state = stateFor(store);
  if (state.dossiers.size !== 1 || state.gates.size !== 1) {
    throw new ContractError("QUALITY_STORE_INCOMPLETE", "quality store requires exactly one dossier and one gate");
  }
  const dossier = [...state.dossiers.values()][0];
  const gate = [...state.gates.values()][0];
  const architectureEvaluation = [...state.architectureEvaluations.values()][0] ?? null;
  const postArchitectureEvaluation = [...state.postArchitectureEvaluations.values()][0] ?? null;
  const preimplementationEvidence = [...state.preimplementationEvidence.values()][0] ?? null;
  const contextDecision = [...state.contextDecisions.values()][0] ?? null;
  const contextReconciliation = [...state.contextReconciliations.values()][0] ?? null;
  const contextReceiptIndex = [...state.contextReceiptIndexes.values()][0] ?? null;
  const contextReport = [...state.contextReports.values()][0] ?? null;
  let integratedVerificationEvidence = null;
  if (integrated_verification_evidence_id !== null) {
    assertSafeId(integrated_verification_evidence_id, "integrated_verification_evidence_id");
    integratedVerificationEvidence = state.integratedVerificationEvidence.get(integrated_verification_evidence_id) ?? null;
    if (integratedVerificationEvidence === null) {
      throw new ContractError(
        "QUALITY_INTEGRATED_EVIDENCE_MISSING",
        `integrated verification evidence is not recorded: ${integrated_verification_evidence_id}`,
      );
    }
  }
  if (gate.dossier_fingerprint !== dossier.fingerprint) {
    throw new ContractError("QUALITY_STORE_BINDING", "stored gate and dossier fingerprints do not match");
  }
  if (seal) state.sealed = true;
  return deepFrozenClone({
    run_id: state.runId,
    task_id: state.taskId,
    dossier,
    architecture_evaluation: architectureEvaluation,
    post_architecture_evaluation: postArchitectureEvaluation,
    preimplementation_evidence: preimplementationEvidence,
    context_sufficiency_decision: contextDecision,
    context_reconciliation: contextReconciliation,
    context_receipt_index: contextReceiptIndex,
    context_report: contextReport,
    integrated_verification_evidence: integratedVerificationEvidence,
    gate,
    total_bytes: state.totalBytes,
    sealed: state.sealed,
  }, "engineering quality store snapshot");
}

export function sealEngineeringQualityStore(store) {
  return snapshotEngineeringQualityStore(store, { seal: true });
}
