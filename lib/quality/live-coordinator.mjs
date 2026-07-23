import {
  createEngineeringDossierDraft,
  finalizeEngineeringDossier,
  promoteEngineeringDossierRisk,
  updateEngineeringDossierDraft,
} from "./dossier.mjs";
import {
  createEngineeringPreimplementationEvidence,
  evaluateEngineeringGate,
  validateEngineeringCheckCatalog,
  validateEngineeringPreimplementationEvidence,
} from "./gate.mjs";
import {
  createEngineeringQualitySession,
  inspectEngineeringQualitySession,
  sessionAuthorizeAction,
  sessionFinalizeAttestation,
  sessionLinkGate,
  sessionObserveWorkspace,
  sessionRecordContextDecision,
  sessionRecordContextReconciliation,
  sessionRecordDossier,
  sessionRecordImplementationDelegation,
  sessionRecordImplementation,
  sessionRecordIntegratedVerification,
  sessionRecordPostArchitectureEvaluation,
} from "./session.mjs";
import { selectMinimumContextStrategy } from "./context-strategies.mjs";
import {
  assertContextDecisionCurrent,
  contentBackedInspectedPaths,
  createContextReceiptEvidenceIndex,
  createContextTaskProfileEvidence,
  createStandardLiteContextSummary,
  evaluateContextSufficiency,
} from "./context-sufficiency.mjs";
import { createPlanChallengeSubject } from "./plan-challenge-subject.mjs";
import {
  evaluateTransitiveImpactResolution,
  receiptSupportedObservedSubjectIds,
} from "./transitive-impact-resolution.mjs";
import {
  classifyContextReconciliationPathKind,
  createReviewerReconciliationEvidence,
  reconcileFinalBlastRadius,
} from "./context-reconciliation.mjs";
import {
  beginContextReceiptOperation,
  completeContextReceiptOperation,
} from "./context-receipts.mjs";
import {
  createWholeSystemContextReportDraft,
  engineeringDossierAnalysisFingerprint,
  finalizeWholeSystemContextReport,
  updateWholeSystemContextReportDraft,
} from "./whole-system-context-report.mjs";
import { validateArchitectureEvaluation } from "./architecture.mjs";
import { createIntegratedVerificationEvidence } from "./verification-evidence.mjs";
import { requiredEngineeringVerificationTargets } from "./verification-targets.mjs";
import { snapshotEngineeringQualityStore } from "./store.mjs";
import {
  ContractError,
  assertArray,
  assertBoolean,
  assertFingerprint,
  assertInteger,
  assertPlain,
  assertString,
  assertStringArray,
  canonicalJson,
  deepFrozenClone,
  exact,
  fingerprint,
} from "./validation.mjs";

const INTERNALS = new WeakMap();
const QUALITY_OPERATIONS = new Set([
  "quality_create_dossier",
  "quality_update_dossier",
  "quality_escalate_context_strategy",
  "quality_evaluate_architecture",
  "quality_create_context_report",
  "quality_update_context_report",
  "quality_finalize_context",
  "quality_finalize_dossier",
  "quality_inspect",
  "quality_authorize_action",
  "quality_reconcile_context",
]);
const IMPLEMENTATION_AGENT_ROLES = new Set(["general"]);

function stateFor(coordinator) {
  const state = INTERNALS.get(coordinator);
  if (!state) throw new ContractError("QUALITY_LIVE_COORDINATOR", "coordinator was not created by createQualityLiveCoordinator");
  return state;
}

function currentWorkspace(state) {
  const value = state.observeWorkspace();
  assertFingerprint(value, "quality live workspace fingerprint");
  sessionObserveWorkspace(state.session, {
    fingerprint: value,
    sequence: state.observationSequence++,
  });
  return value;
}

function dossierReceipt(state) {
  return deepFrozenClone({
    schema_version: 1,
    dossier_id: state.draft?.dossier_id ?? null,
    revision: state.draft?.revision ?? null,
    dossier_status: state.draft?.status ?? "absent",
    dossier_fingerprint: state.finalized?.fingerprint ?? null,
    gate_id: state.gate?.gate_id ?? null,
    gate_status: state.gate?.status ?? "not_evaluated",
    gate_fingerprint: state.gate?.fingerprint ?? null,
    implementation_enabled: state.gate?.status === "passed",
    context_strategy_id: state.contextStrategy?.strategy_id ?? null,
    context_receipt_ids: state.contextReceipts.map((entry) => entry.receipt_id),
    prior_context_receipt_ids: state.priorContextReceipts.map((entry) => entry.receipt_id),
    context_report_id: state.contextReport?.report_id ?? state.contextReportDraft?.report_id ?? null,
    context_report_revision: state.contextReport?.revision ?? state.contextReportDraft?.revision ?? null,
    context_report_status: state.contextReport?.status ?? state.contextReportDraft?.status ?? "absent",
    context_decision_id: state.contextDecision?.decision_id ?? null,
    context_decision_status: state.contextDecision?.status ?? "not_evaluated",
    context_reconciliation_id: state.contextReconciliation?.reconciliation_id ?? null,
    context_reconciliation_status: state.contextReconciliation?.status ?? "not_evaluated",
  }, "quality live dossier receipt");
}

function emptyPlanChallenge() {
  return { architect_result_id: null, reviewer_result_id: null, blockers: [], evidence_refs: [] };
}

function livePlanChallengePresent(state) {
  const plan = state.draft?.plan_challenge;
  return state.planChallengeContributions.length > 0
    || (plan !== undefined && plan.architect_result_id !== null)
    || (plan !== undefined && plan.reviewer_result_id !== null)
    || (plan?.blockers.length ?? 0) > 0
    || (plan?.evidence_refs.length ?? 0) > 0;
}

function invalidateLivePlanChallenges(state, { updatedAt, dossierPatch = null } = {}) {
  const challenged = livePlanChallengePresent(state);
  const attempted = state.planChallengeAttempt !== null;
  if (!challenged && !attempted && dossierPatch === null) return false;
  state.draft = updateEngineeringDossierDraft(state.draft, {
    expected_revision: state.draft.revision,
    updated_at: updatedAt,
    patch: { ...(dossierPatch ?? {}), plan_challenge: emptyPlanChallenge() },
  });
  state.planChallengeContributions = [];
  state.planChallengeAttempt = null;
  return challenged || attempted;
}

function invalidateLiveContextDecision(state) {
  state.contextDecision = null;
  state.contextReceiptIndex = null;
  state.contextTaskProfileEvidence = null;
  state.contextBaselineEvidence = null;
  state.contextDecisionOperationSequence = null;
}

function inspectReceipt(state) {
  return deepFrozenClone({
    schema_version: 1,
    run_id: state.runId,
    task_id: state.taskId,
    risk_class: state.riskClass,
    check_ids: state.checkCatalog.checks.filter((entry) => entry.available).map((entry) => entry.check_id),
    mechanism_ids: state.checkCatalog.mechanisms.filter((entry) => entry.available).map((entry) => entry.mechanism_id),
    ownership_paths: state.ownershipPaths,
    ...dossierReceipt(state),
  }, "quality live inspection receipt");
}

function assertDossierBinding(state, draft) {
  if (draft.run_id !== state.runId) {
    throw new ContractError("QUALITY_LIVE_RUN_BINDING", "adapter dossier run_id does not match the operational run");
  }
  if (draft.task_id !== state.taskId) {
    throw new ContractError("QUALITY_LIVE_TASK_BINDING", "adapter dossier task_id does not match the operational task");
  }
  if (draft.risk_class !== state.riskClass) {
    throw new ContractError("QUALITY_LIVE_RISK_BINDING", "adapter dossier risk_class does not match the runner-owned scenario risk");
  }
  if (draft.verification_boundary.ownership_paths.length > 0) {
    const expected = new Set(state.ownershipPaths);
    if (
      draft.verification_boundary.ownership_paths.length !== expected.size
      || draft.verification_boundary.ownership_paths.some((entry) => !expected.has(entry))
    ) {
      throw new ContractError("QUALITY_LIVE_OWNERSHIP_BINDING", "dossier ownership must exactly match the runner-owned workspace allowlist");
    }
  }
}

function ensureContextStrategy(state, draft) {
  const selected = selectMinimumContextStrategy({
    risk_class: state.riskClass,
    task_type: draft.task_type,
    ...(state.contextStrategy === null ? {} : {
      requested_strategy_id: state.contextStrategy.strategy_id,
      requested_task_profile: state.contextStrategy.task_profile,
    }),
  });
  state.contextStrategy = selected;
  return selected;
}

function recordReadOnlyContextSubagent(state, resultId) {
  assertString(resultId, "quality live read-only subagent result ID", { maxBytes: 256 });
  if (state.gate !== null || state.finalized !== null) return;
  if (state.draft === null) throw new ContractError("CONTEXT_STRATEGY_REQUIRED", "preimplementation subagents require a selected context strategy");
  const strategy = ensureContextStrategy(state, state.draft);
  if (strategy.strategy_id === "standard-lite-local-v1") {
    throw new ContractError("CONTEXT_STANDARD_LITE_OVERANALYSIS", "standard-lite forbids preimplementation read-only subagent fan-out");
  }
  if (state.contextReadOnlySubagentIds.has(resultId)) throw new ContractError("CONTEXT_RECEIPT_DUPLICATE", `read-only subagent ${resultId} was counted twice`);
  if (state.contextReadOnlySubagentIds.size >= strategy.budgets.max_read_only_subagents) {
    throw new ContractError("CONTEXT_BUDGET_EXCEEDED", "selected context strategy read-only subagent budget is exhausted");
  }
  state.contextReadOnlySubagentIds.add(resultId);
}

function liveStandardLiteScopeFacts(state, dossier) {
  const ownership = new Set(state.ownershipPaths);
  const observedPaths = new Set(state.contextReceipts.flatMap((entry) => [
    ...entry.request.scope_paths.filter((path) => path !== "."),
    ...(entry.result?.relative_paths ?? []),
    ...(entry.result?.line_ranges ?? []).map((range) => range.path),
    ...(entry.result?.relationships ?? []).map((relationship) => relationship.path),
  ]));
  const ownerRoots = new Set([...ownership].map((entry) => entry.split("/")[0]));
  const externalCodePath = [...observedPaths].some((entry) => {
    const kind = classifyContextReconciliationPathKind(entry);
    return ["source", "schema", "config"].includes(kind) && !ownership.has(entry) && !ownerRoots.has(entry.split("/")[0]);
  });
  const nonOwnedCodePath = [...observedPaths].some((entry) => (
    ["source", "schema", "config"].includes(classifyContextReconciliationPathKind(entry))
    && !ownership.has(entry)
  ));
  return {
    public_contract: dossier.public_contracts.length > 0,
    transitive_consumer: state.contextReceipts.some((entry) => entry.tool_id === "context_related"
      && (entry.result?.relationships ?? []).some((relationship) => !ownership.has(relationship.path))) || nonOwnedCodePath,
    persistence: dossier.affected_areas.some((entry) => ["data_store", "migration"].includes(entry.node_kind))
      || [...observedPaths].some((entry) => classifyContextReconciliationPathKind(entry) === "schema"),
    concurrency: dossier.failure_modes.some((entry) => ["concurrency_races_interleavings", "timeout_cancellation", "resource_lifecycle_cleanup_shutdown_leaks"].includes(entry.category)),
    security: dossier.task_type === "security",
    migration: dossier.task_type === "migration",
    multi_module: externalCodePath,
  };
}

function escalateContextStrategy(state, payload) {
  exact(payload, ["requested_strategy_id"], ["requested_strategy_id"], "quality live context strategy escalation request");
  assertString(payload.requested_strategy_id, "quality live context strategy escalation request.requested_strategy_id", { maxBytes: 128 });
  if (state.draft === null || state.draft.status !== "draft" || state.finalized !== null || state.gate !== null) {
    throw new ContractError("CONTEXT_STRATEGY_ESCALATION_ORDER", "live context strategy escalation requires an active dossier draft before finalization");
  }
  if (state.contextReportDraft !== null) {
    throw new ContractError("CONTEXT_STRATEGY_ESCALATION_ORDER", "live context strategy escalation must precede context report analysis");
  }
  const current = ensureContextStrategy(state, state.draft);
  const strategyRank = new Map(["standard-lite-local-v1", "high-wide-deep-v1", "critical-wide-deep-v1"].map((id, index) => [id, index]));
  if (!strategyRank.has(payload.requested_strategy_id)
    || strategyRank.get(payload.requested_strategy_id) < strategyRank.get(current.strategy_id)) {
    throw new ContractError("CONTEXT_STRATEGY_WEAKENING", "live context strategy escalation cannot downgrade the active runner binding");
  }
  if (payload.requested_strategy_id === current.strategy_id) return dossierReceipt(state);
  const targetRiskClass = payload.requested_strategy_id === "critical-wide-deep-v1" ? "critical" : "high";
  const selected = selectMinimumContextStrategy({
    risk_class: targetRiskClass,
    task_type: state.draft.task_type,
    requested_strategy_id: payload.requested_strategy_id,
    requested_task_profile: current.task_profile,
  });
  const escalatedAt = state.clock();
  state.priorContextReceipts.push(...state.contextReceipts);
  state.contextReceipts = [];
  state.priorContextReadOnlySubagentIds.push(...state.contextReadOnlySubagentIds);
  state.contextReadOnlySubagentIds = new Set();
  state.draft = promoteEngineeringDossierRisk(state.draft, {
    target_risk_class: targetRiskClass,
    created_at: escalatedAt,
  });
  state.riskClass = targetRiskClass;
  state.contextStrategy = selected;
  state.planChallengeContributions = [];
  state.contextReport = null;
  state.contextReportDraft = null;
  invalidateLiveContextDecision(state);
  return dossierReceipt(state);
}

function recordObservedContextToolCall(state, payload) {
  exact(payload, ["session_id", "call_id", "tool_id", "args", "output", "parent_question_id", "evidence_refs"], ["session_id", "call_id", "tool_id", "args", "output"], "quality live observed context tool call");
  assertString(payload.session_id, "quality live observed context tool call.session_id", { maxBytes: 256 });
  assertString(payload.call_id, "quality live observed context tool call.call_id", { maxBytes: 256 });
  if (state.finalized !== null || state.gate !== null) {
    throw new ContractError("CONTEXT_RECEIPT_AFTER_MUTATION", "context tool evidence must be captured before dossier finalization and implementation");
  }
  if (state.draft === null) {
    throw new ContractError("CONTEXT_STRATEGY_REQUIRED", "context evidence requires a runner-selected strategy after dossier creation");
  }
  const strategy = ensureContextStrategy(state, state.draft);
  if (state.contextReceipts.length >= strategy.budgets.max_context_calls) {
    throw new ContractError("CONTEXT_RECEIPT_BUDGET_EXHAUSTED", "selected context strategy call budget is exhausted");
  }
  if (!strategy.preferred_tools.includes(payload.tool_id) && !strategy.fallback_tools.includes(payload.tool_id)) {
    throw new ContractError("CONTEXT_STANDARD_LITE_OVERANALYSIS", `context tool ${payload.tool_id} is outside the selected strategy`);
  }
  const completeChain = [...state.priorContextReceipts, ...state.contextReceipts];
  const sequence = completeChain.length + 1;
  const startedAt = state.clock();
  const pending = beginContextReceiptOperation({
    receipt_id: `context-live-${sequence}`,
    sequence,
    previous_receipt_fingerprint: completeChain.at(-1)?.fingerprint ?? null,
    session_key: state.contextSessionKey,
    parent_session_key: null,
    producer_session_key: state.contextSessionKey,
    producer_role: "runner",
    run_id: state.runId,
    task_id: state.taskId,
    worktree_fingerprint: state.initialWorkspaceFingerprint,
    source_fingerprint: state.initialWorkspaceFingerprint,
    context_strategy_id: strategy.strategy_id,
    context_strategy_fingerprint: strategy.fingerprint,
    parent_question_id: payload.parent_question_id ?? null,
    evidence_refs: payload.evidence_refs ?? [],
    mutation_revision_started: 0,
    tool_id: payload.tool_id,
    call_key_fingerprint: fingerprint({ run_id: state.runId, task_id: state.taskId, session_id: payload.session_id, call_id: payload.call_id, tool_id: payload.tool_id }),
    started_at: startedAt,
    args: payload.args,
    fingerprint_salt: state.contextFingerprintSalt,
  });
  const receipt = completeContextReceiptOperation(pending, {
    output: payload.output,
    completed_at: state.clock(),
    mutation_revision_completed: 0,
    fingerprint_salt: state.contextFingerprintSalt,
  });
  state.contextReceipts.push(receipt);
  const updatedAt = state.clock();
  invalidateLivePlanChallenges(state, { updatedAt });
  invalidateLiveContextDecision(state);
  return deepFrozenClone({
    receipt_id: receipt.receipt_id,
    sequence: receipt.sequence,
    tool_id: receipt.tool_id,
    status: receipt.status,
    reason_code: receipt.reason_code,
    fingerprint: receipt.fingerprint,
  }, "quality live context receipt summary");
}

function createContextReport(state, payload) {
  if (state.draft === null) throw new ContractError("QUALITY_DOSSIER_NOT_CREATED", "quality dossier must exist before the context report");
  if (state.draft.status !== "draft") throw new ContractError("QUALITY_DOSSIER_FINALIZED", "context report cannot be created after dossier finalization");
  if (state.riskClass === "standard-lite") throw new ContractError("CONTEXT_STANDARD_LITE_OVERANALYSIS", "standard-lite uses a compact runner summary, not a Whole-System Context Report");
  if (state.contextReportDraft !== null) throw new ContractError("CONTEXT_REPORT_CONFLICT", "context report was already created");
  exact(payload, ["report_id", "created_at", "content"], ["report_id", "created_at", "content"], "quality live context report create request");
  const strategy = ensureContextStrategy(state, state.draft);
  state.contextReportDraft = createWholeSystemContextReportDraft({
    report_id: payload.report_id,
    session_key: state.contextSessionKey,
    strategy_binding: strategy,
    workspace_fingerprint: state.initialWorkspaceFingerprint,
    dossier: state.draft,
    created_at: payload.created_at,
    content: payload.content,
  });
  return dossierReceipt(state);
}

function updateContextReport(state, payload) {
  const currentReport = state.contextReport ?? state.contextReportDraft;
  if (currentReport === null) throw new ContractError("CONTEXT_REPORT_MISSING", "context report must be created before update");
  state.contextReportDraft = updateWholeSystemContextReportDraft(currentReport, payload);
  state.contextReport = null;
  invalidateLivePlanChallenges(state, { updatedAt: state.clock() });
  invalidateLiveContextDecision(state);
  return dossierReceipt(state);
}

function createLiveContextTaskProfileEvidence(state, dossier, preimplementationEvidence, createdAt) {
  const obligations = new Map(dossier.test_obligations.map((entry) => [entry.check_id, entry]));
  const checks = (preimplementationEvidence?.baseline_receipts ?? []).flatMap((receipt) => {
    const obligation = obligations.get(receipt.check_id);
    if (!obligation || obligation.phase !== "preimplementation" || !["reproducer", "characterization"].includes(obligation.kind)) return [];
    const expectedOutcome = obligation.kind === "reproducer" ? "failing_reproducer" : "passing_characterization";
    const observation = receipt.oracle_observation;
    const outcomeMatched = receipt.status === "passed"
      && observation?.expected_outcome === expectedOutcome
      && observation.observed_outcome === expectedOutcome
      && observation.workspace_fingerprint === state.initialWorkspaceFingerprint
      && (expectedOutcome !== "failing_reproducer"
        || observation.observed_failure_signature === observation.expected_failure_signature);
    const status = outcomeMatched ? "passed" : receipt.status === "failed" ? "failed" : "blocked";
    return [{
      obligation_id: obligation.id,
      check_id: obligation.check_id,
      purpose: obligation.kind,
      phase: "preimplementation",
      status,
      observed_outcome: outcomeMatched ? expectedOutcome : status === "failed" ? "failed" : "unavailable",
      trusted_producer: receipt.trusted_producer,
      command_or_mechanism: receipt.command_or_mechanism,
      evidence_fingerprint: receipt.evidence_fingerprint,
      completed_at: receipt.completed_at,
    }];
  });
  return createContextTaskProfileEvidence({
    evidence_id: `CTXPROFILE-${state.runId}`,
    session_key: state.contextSessionKey,
    workspace_fingerprint: state.initialWorkspaceFingerprint,
    dossier,
    checks,
    created_at: createdAt,
  });
}

function assertLiveEscalatedDiscoveryReobserved(state) {
  if (state.priorContextReceipts.length === 0) return;
  const observedPaths = (receipts) => new Set(receipts.flatMap((entry) => [
    ...(entry.result?.relative_paths ?? []),
    ...(entry.result?.line_ranges ?? []).map((range) => range.path),
    ...(entry.result?.symbol_ids ?? []).map((symbol) => symbol.path),
    ...(entry.result?.relationships ?? []).map((relationship) => relationship.path),
    ...(entry.request.relationship_target_path === null ? [] : [entry.request.relationship_target_path]),
  ]));
  const priorPaths = observedPaths(state.priorContextReceipts);
  const activePaths = observedPaths(state.contextReceipts);
  const missing = [...priorPaths].filter((entry) => !activePaths.has(entry));
  if (missing.length > 0) {
    throw new ContractError(
      "CONTEXT_ESCALATED_DISCOVERY_UNREPEATED",
      `escalated live strategy must re-observe every prior discovery path before finalization: ${missing.join(", ")}`,
    );
  }
}

function contextArtifactsForFinalization(state, dossier, finalizedAt, taskProfileEvidence) {
  assertLiveEscalatedDiscoveryReobserved(state);
  const strategy = ensureContextStrategy(state, dossier);
  let report = null;
  let standardLiteSummary = null;
  if (state.riskClass === "standard-lite") {
    const inspectedPaths = contentBackedInspectedPaths({ receipts: state.contextReceipts }).slice(0, 12);
    const discoveredScopeFacts = liveStandardLiteScopeFacts(state, dossier);
    standardLiteSummary = createStandardLiteContextSummary({
      summary_id: `CTXLOCAL-${state.runId}`,
      session_key: state.contextSessionKey,
      strategy_binding: strategy,
      workspace_fingerprint: state.initialWorkspaceFingerprint,
      dossier,
      receipt_ids: state.contextReceipts.map((entry) => entry.receipt_id),
      inspected_paths: inspectedPaths,
      context_calls: state.contextReceipts.length,
      broad_fanout: state.contextReceipts.length > 6
        || state.contextReceipts.some((entry) => (
          (entry.result?.relative_paths.length ?? 0) > 12
          || (entry.result?.counts.candidate_files ?? 0) > 12
          || (entry.result?.counts.scanned_files ?? 0) > 12
        )),
      discovered_scope_facts: discoveredScopeFacts,
      finalized_at: finalizedAt,
    });
  } else {
    if (state.contextReportDraft === null) {
      throw new ContractError("CONTEXT_REPORT_MISSING", "high and critical work requires a Whole-System Context Report");
    }
    report = finalizeWholeSystemContextReport(state.contextReportDraft, {
      finalized_at: finalizedAt,
      strategy_binding: strategy,
      workspace_fingerprint: state.initialWorkspaceFingerprint,
      dossier,
      receipt_index: { receipts: state.contextReceipts },
    });
  }
  const decision = evaluateContextSufficiency({
    decision_id: `CTXDEC-${state.runId}`,
    session_key: state.contextSessionKey,
    strategy_binding: strategy,
    dossier,
    workspace_fingerprint: state.initialWorkspaceFingerprint,
    receipt_index: { receipts: state.contextReceipts },
    report,
    standard_lite_summary: standardLiteSummary,
    task_profile_evidence: taskProfileEvidence,
    read_only_subagents_used: state.contextReadOnlySubagentIds.size,
    evaluated_at: state.clock(),
  });
  const receiptIndex = createContextReceiptEvidenceIndex({ receipts: state.contextReceipts }, {
    session_key: state.contextSessionKey,
    run_id: state.runId,
    task_id: state.taskId,
    source_fingerprint: state.initialWorkspaceFingerprint,
  });
  return { strategy, report, standardLiteSummary, decision, receiptIndex, taskProfileEvidence };
}

function finalizeLiveContext(state, payload) {
  exact(payload, ["expected_revision"], ["expected_revision"], "quality live context finalization request");
  assertInteger(payload.expected_revision, "quality live context finalization request.expected_revision", { min: 1 });
  if (state.riskClass === "standard-lite") {
    throw new ContractError("CONTEXT_STANDARD_LITE_OVERANALYSIS", "standard-lite context is finalized with its lightweight Dossier flow");
  }
  if (state.draft === null || state.draft.status !== "draft" || state.finalized !== null || state.gate !== null) {
    throw new ContractError("CONTEXT_FINALIZED_AFTER_MUTATION", "live context finalization requires an active preimplementation Dossier draft");
  }
  if (state.contextReportDraft === null || state.contextReportDraft.revision !== payload.expected_revision) {
    throw new ContractError("CONTEXT_REPORT_REVISION_CONFLICT", "live context finalization expected_revision is stale or the report is missing");
  }
  if (state.contextReport !== null && state.contextDecision !== null) {
    assertContextDecisionCurrent(state.contextDecision, {
      strategy_binding: state.contextStrategy,
      dossier: state.draft,
      workspace_fingerprint: state.initialWorkspaceFingerprint,
      receipt_index: { receipts: state.contextReceipts },
    });
    return dossierReceipt(state);
  }
  assertLiveEscalatedDiscoveryReobserved(state);
  const evaluatedAt = state.clock();
  const baselineEvidence = state.collectPreimplementationEvidence(Object.freeze({
    dossier: state.draft,
    check_catalog: state.checkCatalog,
    evaluated_at: evaluatedAt,
  }));
  if (baselineEvidence === null) {
    throw new ContractError("QUALITY_PREIMPLEMENTATION_EVIDENCE_BINDING", "context sufficiency requires baseline-only preimplementation evidence before formal challenges");
  }
  validateEngineeringPreimplementationEvidence(baselineEvidence);
  if (baselineEvidence.dossier_id !== state.draft.dossier_id) {
    throw new ContractError(
      "QUALITY_PREIMPLEMENTATION_EVIDENCE_BINDING",
      "context sufficiency baseline evidence must bind the current Dossier identity",
    );
  }
  if (baselineEvidence.dossier_fingerprint !== engineeringDossierAnalysisFingerprint(state.draft)) {
    throw new ContractError(
      "QUALITY_PREIMPLEMENTATION_EVIDENCE_BINDING",
      "context sufficiency baseline evidence must bind the exact current Dossier analysis",
    );
  }
  if (baselineEvidence.plan_challenge_receipts.length !== 0) {
    throw new ContractError("QUALITY_PREIMPLEMENTATION_EVIDENCE_BINDING", "context sufficiency baseline evidence cannot contain formal challenges");
  }
  const taskProfileEvidence = createLiveContextTaskProfileEvidence(
    state,
    state.draft,
    baselineEvidence,
    evaluatedAt,
  );
  const context = contextArtifactsForFinalization(state, state.draft, evaluatedAt, taskProfileEvidence);
  state.contextStrategy = context.strategy;
  state.contextReport = context.report;
  state.contextDecision = context.decision;
  state.contextReceiptIndex = context.receiptIndex;
  state.contextTaskProfileEvidence = taskProfileEvidence;
  state.contextBaselineEvidence = baselineEvidence;
  return dossierReceipt(state);
}

function reconciliationDiffFingerprint(proposal) {
  return fingerprint({
    changed_paths: proposal.changed_paths,
    unexpected_public_contracts: proposal.unexpected_public_contracts,
    unexpected_dependency_directions: proposal.unexpected_dependency_directions,
    unexpected_side_effect_edges: proposal.unexpected_side_effect_edges,
    unrelated_paths: proposal.unrelated_paths,
    unplanned_items: proposal.unplanned_items,
  });
}

function verifiedPostMutationTestObligationIds(state) {
  const passedTargets = new Set((state.integratedVerificationEvidence?.check_receipts ?? [])
    .filter((entry) => entry.status === "passed" && ["slice", "integration"].includes(entry.phase))
    .map((entry) => `${entry.check_id}\0${entry.phase}`));
  return (state.finalized?.test_obligations ?? [])
    .filter((entry) => entry.required
      && ["slice", "integration"].includes(entry.phase)
      && passedTargets.has(`${entry.check_id}\0${entry.phase}`))
    .map((entry) => entry.id)
    .sort();
}

function finalizePendingContextReconciliation(state) {
  const proposal = state.contextReconciliationCandidate;
  if (proposal === null) {
    throw new ContractError("CONTEXT_RECONCILIATION_REQUIRED", "the adapter did not provide reviewer-grounded final-diff evidence");
  }
  if (state.integratedVerificationEvidence === null) {
    throw new ContractError("CONTEXT_RECONCILIATION_ORDER", "final reconciliation requires integrated verification of the final workspace");
  }
  if (state.observedImplementation === null) {
    throw new ContractError("CONTEXT_RECONCILIATION_FINAL_DIFF_MISSING", "runner did not record the exact final implementation delta");
  }
  if (state.postArchitectureEvaluation !== null && state.postArchitectureEvaluation.status !== "passed") {
    throw new ContractError("CONTEXT_RECONCILIATION_REQUIRED", "trusted post-edit architecture evidence did not pass");
  }
  const finalWorkspaceFingerprint = inspectEngineeringQualitySession(state.session).current_workspace_fingerprint;
  if (state.observedImplementation.final_workspace_fingerprint !== finalWorkspaceFingerprint
    || state.integratedVerificationEvidence.workspace_fingerprint !== finalWorkspaceFingerprint) {
    throw new ContractError("CONTEXT_RECONCILIATION_FINAL_WORKSPACE_STALE", "reviewer contribution does not bind the final workspace");
  }
  const declaredPaths = proposal.changed_paths.map((entry) => entry.path).sort();
  if (canonicalJson(declaredPaths) !== canonicalJson(state.observedImplementation.changed_paths)) {
    throw new ContractError("CONTEXT_RECONCILIATION_FINAL_DIFF_MISMATCH", "adapter reconciliation paths do not equal the runner-observed final diff");
  }
  if (state.contextReconciliation === null) {
    const finalDiffFingerprint = reconciliationDiffFingerprint(proposal);
    const reviewer = state.resolveReviewerReconciliation(Object.freeze({
      reviewer_result_id: state.reviewerResultId,
      final_workspace_fingerprint: finalWorkspaceFingerprint,
      final_diff_fingerprint: finalDiffFingerprint,
      changed_paths: deepFrozenClone(proposal.changed_paths, "quality live reviewer changed paths"),
      unexpected_public_contracts: Object.freeze([...proposal.unexpected_public_contracts]),
      unexpected_dependency_directions: Object.freeze([...proposal.unexpected_dependency_directions]),
      unexpected_side_effect_edges: Object.freeze([...proposal.unexpected_side_effect_edges]),
      unrelated_paths: Object.freeze([...proposal.unrelated_paths]),
      unplanned_items: deepFrozenClone(proposal.unplanned_items, "quality live reviewer unplanned items"),
    }));
    assertPlain(reviewer, "quality live trusted reviewer reconciliation");
    exact(reviewer, ["reviewer_result_id", "checks", "completed_at"], ["reviewer_result_id", "checks", "completed_at"], "quality live trusted reviewer reconciliation");
    if (reviewer.reviewer_result_id !== state.reviewerResultId) {
      throw new ContractError("CONTEXT_RECONCILIATION_REVIEWER_UNTRUSTED", "runner reviewer result identity is not authoritative");
    }
    const reviewerEvidence = createReviewerReconciliationEvidence({
      reviewer_result_id: reviewer.reviewer_result_id,
      session_key: state.contextSessionKey,
      context_decision: state.contextDecision,
      final_workspace_fingerprint: finalWorkspaceFingerprint,
      final_diff_fingerprint: finalDiffFingerprint,
      changed_paths: proposal.changed_paths,
      checks: reviewer.checks,
      unplanned_item_ids: proposal.unplanned_items.map((entry) => entry.id),
      completed_at: reviewer.completed_at,
    });
    const reconciliation = reconcileFinalBlastRadius({
      reconciliation_id: `CTXREC-${state.runId}`,
      session_key: state.contextSessionKey,
      context_decision: state.contextDecision,
      dossier: state.finalized,
      context_report: state.contextReport,
      final_workspace_fingerprint: finalWorkspaceFingerprint,
      changed_paths: proposal.changed_paths,
      unexpected_public_contracts: proposal.unexpected_public_contracts,
      unexpected_dependency_directions: proposal.unexpected_dependency_directions,
      unexpected_side_effect_edges: proposal.unexpected_side_effect_edges,
      unrelated_paths: proposal.unrelated_paths,
      unplanned_items: proposal.unplanned_items,
      verified_post_mutation_test_obligation_ids: verifiedPostMutationTestObligationIds(state),
      evidence_mode: "reviewer_grounded",
      reviewer_evidence: reviewerEvidence,
      reconciled_at: state.clock(),
    });
    if (reconciliation.status !== "passed") {
      throw new ContractError("CONTEXT_RECONCILIATION_REQUIRED", `final reconciliation is blocked: ${reconciliation.reason_codes.join(",")}`);
    }
    sessionRecordContextReconciliation(state.session, reconciliation);
    state.contextReconciliation = reconciliation;
  }
  return dossierReceipt(state);
}

function reconcileContext(state, payload) {
  if (state.contextDecision === null || state.finalized === null) {
    throw new ContractError("CONTEXT_RECONCILIATION_ORDER", "context reconciliation requires a sufficient preimplementation decision");
  }
  const keys = [
    "changed_paths", "unexpected_public_contracts", "unexpected_dependency_directions",
    "unexpected_side_effect_edges", "unrelated_paths", "unplanned_items",
  ];
  exact(payload, keys, keys, "quality live context reconciliation request");
  const normalizedChanged = JSON.parse(canonicalJson(payload.changed_paths)).sort((left, right) => left.path.localeCompare(right.path));
  const normalizedUnplanned = JSON.parse(canonicalJson(payload.unplanned_items)).sort((left, right) => left.id.localeCompare(right.id));
  const source = {
    changed_paths: normalizedChanged,
    unexpected_public_contracts: [...payload.unexpected_public_contracts].sort(),
    unexpected_dependency_directions: [...payload.unexpected_dependency_directions].sort(),
    unexpected_side_effect_edges: [...payload.unexpected_side_effect_edges].sort(),
    unrelated_paths: [...payload.unrelated_paths].sort(),
    unplanned_items: normalizedUnplanned,
  };
  state.contextReconciliationCandidate = deepFrozenClone({ ...source, fingerprint: fingerprint(source) }, "quality live reconciliation proposal");
  return deepFrozenClone({
    status: "pending_runner_reconciliation",
    proposal_fingerprint: state.contextReconciliationCandidate.fingerprint,
  }, "quality live pending reconciliation proposal");
}

function currentLiveChallengeSubject(state) {
  return createPlanChallengeSubject({
    dossier: state.draft,
    strategy_binding: state.contextStrategy,
    context_report: state.contextReport,
    context_decision: state.contextDecision,
    task_profile_evidence: state.contextTaskProfileEvidence,
  });
}

function livePreimplementationEvidence(state, finalized) {
  if (state.contextBaselineEvidence === null) {
    throw new ContractError("QUALITY_PREIMPLEMENTATION_EVIDENCE_BINDING", "live gate lacks the baseline evidence used by context sufficiency");
  }
  validateEngineeringPreimplementationEvidence(state.contextBaselineEvidence);
  if (state.contextBaselineEvidence.dossier_id !== state.draft.dossier_id
    || state.contextBaselineEvidence.dossier_fingerprint !== state.contextTaskProfileEvidence?.dossier_analysis_fingerprint
    || state.contextTaskProfileEvidence?.dossier_id !== state.draft.dossier_id
    || state.contextTaskProfileEvidence?.run_id !== state.runId
    || state.contextTaskProfileEvidence?.task_id !== state.taskId
    || state.contextTaskProfileEvidence?.workspace_fingerprint !== state.initialWorkspaceFingerprint) {
    throw new ContractError(
      "QUALITY_PREIMPLEMENTATION_EVIDENCE_BINDING",
      "live gate baseline evidence is not the current Dossier and workspace evidence used by context sufficiency",
    );
  }
  const baselineByCheck = new Map(state.contextBaselineEvidence.baseline_receipts.map((entry) => [entry.check_id, entry]));
  for (const check of state.contextTaskProfileEvidence.checks) {
    const receipt = baselineByCheck.get(check.check_id);
    if (receipt === undefined || canonicalJson({
      check_id: receipt.check_id,
      trusted_producer: receipt.trusted_producer,
      phase: receipt.phase,
      status: receipt.status,
      command_or_mechanism: receipt.command_or_mechanism,
      evidence_fingerprint: receipt.evidence_fingerprint,
      completed_at: receipt.completed_at,
    }) !== canonicalJson({
      check_id: check.check_id,
      trusted_producer: check.trusted_producer,
      phase: check.phase,
      status: check.status,
      command_or_mechanism: check.command_or_mechanism,
      evidence_fingerprint: check.evidence_fingerprint,
      completed_at: check.completed_at,
    })) {
      throw new ContractError(
        "QUALITY_PREIMPLEMENTATION_EVIDENCE_BINDING",
        `live gate baseline receipt ${check.check_id} differs from the evidence used by context sufficiency`,
      );
    }
  }
  const subject = currentLiveChallengeSubject(state);
  const byRole = new Map(state.planChallengeContributions.map((entry) => [entry.role, entry]));
  const challengeReceipts = ["architect", "reviewer"].map((role) => {
    const contribution = byRole.get(role);
    if (contribution === undefined || contribution.subject_fingerprint !== subject.fingerprint) {
      throw new ContractError("QUALITY_PLAN_CHALLENGE_STALE", `live ${role} contribution is missing or stale`);
    }
    const mechanismId = state.checkCatalog.mechanisms.find((entry) => entry.mechanism_id.endsWith(`-${role}-plan-challenge`))?.mechanism_id;
    if (mechanismId === undefined) {
      throw new ContractError("QUALITY_PREIMPLEMENTATION_EVIDENCE_BINDING", `live catalog lacks the ${role} plan challenge mechanism`);
    }
    return {
      receipt_id: `${role}-${contribution.result_id}-receipt`,
      result_id: contribution.result_id,
      role,
      session_key: state.contextSessionKey,
      run_id: state.runId,
      task_id: state.taskId,
      dossier_id: state.draft.dossier_id,
      dossier_analysis_fingerprint: subject.dossier_analysis_fingerprint,
      context_strategy_fingerprint: subject.context_strategy_fingerprint,
      context_report_fingerprint: state.contextReport.fingerprint,
      context_report_analysis_fingerprint: subject.context_report_analysis_fingerprint,
      context_decision_fingerprint: subject.context_decision_fingerprint,
      context_task_profile_evidence_fingerprint: subject.context_task_profile_evidence_fingerprint,
      subject_fingerprint: subject.fingerprint,
      mechanism_id: mechanismId,
      trusted_producer: `opencode-harness-traced-${role}`,
      phase: "preimplementation",
      status: contribution.blocking ? "blocked" : "passed",
      evidence_fingerprint: contribution.evidence_fingerprint,
      completed_at: contribution.completed_at,
    };
  });
  return createEngineeringPreimplementationEvidence({
    evidence_id: `preimpl-${finalized.dossier_id}`,
    dossier_id: finalized.dossier_id,
    dossier_fingerprint: finalized.fingerprint,
    baseline_receipts: structuredClone(state.contextBaselineEvidence.baseline_receipts),
    plan_challenge_receipts: challengeReceipts,
  });
}

function handleQualityOperation(state, operation, payload) {
  currentWorkspace(state);
  if (operation === "quality_inspect") {
    exact(payload, [], [], "quality live inspect request");
    return inspectReceipt(state);
  }
  if (operation === "quality_create_dossier") {
    if (state.draft !== null) throw new ContractError("QUALITY_DOSSIER_RECORD_CONFLICT", "quality dossier was already created");
    assertPlain(payload, "quality live dossier create request");
    state.draft = createEngineeringDossierDraft({ ...payload, run_id: state.runId });
    assertDossierBinding(state, state.draft);
    ensureContextStrategy(state, state.draft);
    return dossierReceipt(state);
  }
  if (operation === "quality_update_dossier") {
    if (state.draft === null) throw new ContractError("QUALITY_DOSSIER_NOT_CREATED", "quality dossier must be created before update");
    exact(payload, ["expected_revision", "updated_at", "patch"], ["expected_revision", "updated_at", "patch"], "quality live dossier update request");
    if (payload.expected_revision !== state.draft.revision) {
      throw new ContractError("QUALITY_DOSSIER_REVISION_CONFLICT", "quality live dossier update expected_revision is stale");
    }
    const emptyPlanChallenge = {
      architect_result_id: null,
      reviewer_result_id: null,
      blockers: [],
      evidence_refs: [],
    };
    if (Object.hasOwn(payload?.patch ?? {}, "plan_challenge")
      && canonicalJson(payload.patch.plan_challenge) !== canonicalJson(emptyPlanChallenge)) {
      throw new ContractError("QUALITY_PLAN_CHALLENGE_UNTRUSTED", "adapter-authored Dossier updates cannot mint plan challenge evidence");
    }
    const updatedAt = payload.updated_at;
    invalidateLivePlanChallenges(state, { updatedAt, dossierPatch: payload.patch });
    assertDossierBinding(state, state.draft);
    state.contextReportDraft = null;
    state.contextReport = null;
    invalidateLiveContextDecision(state);
    return dossierReceipt(state);
  }
  if (operation === "quality_escalate_context_strategy") return escalateContextStrategy(state, payload);
  if (operation === "quality_evaluate_architecture") {
    if (state.draft === null) throw new ContractError("QUALITY_DOSSIER_NOT_CREATED", "quality dossier must be created before architecture evaluation");
    if (state.draft.status !== "draft") throw new ContractError("QUALITY_DOSSIER_FINALIZED", "finalized dossier architecture cannot be re-evaluated");
    exact(payload, ["expected_revision"], ["expected_revision"], "quality live architecture evaluation request");
    assertInteger(payload.expected_revision, "quality live architecture evaluation request.expected_revision", { min: 1 });
    if (payload.expected_revision !== state.draft.revision) {
      throw new ContractError("QUALITY_DOSSIER_REVISION_CONFLICT", "architecture evaluation expected_revision is stale");
    }
    const evaluation = state.evaluateArchitecture(state.draft);
    if (evaluation === null) {
      return deepFrozenClone({
        policy_id: null,
        status: "not_configured",
        evaluation_id: null,
        violation_ids: [],
        notes: null,
      }, "quality live architecture assessment");
    }
    return deepFrozenClone({
      policy_id: evaluation.policy_id,
      status: evaluation.status,
      evaluation_id: evaluation.evaluation_id,
      violation_ids: evaluation.violations.map((entry) => entry.violation_id),
      notes: null,
    }, "quality live architecture assessment");
  }
  if (operation === "quality_create_context_report") return createContextReport(state, payload);
  if (operation === "quality_update_context_report") return updateContextReport(state, payload);
  if (operation === "quality_finalize_context") return finalizeLiveContext(state, payload);
  if (operation === "quality_finalize_dossier") {
    if (state.draft === null) throw new ContractError("QUALITY_DOSSIER_NOT_CREATED", "quality dossier must be created before finalization");
    exact(payload, ["finalized_at"], [], "quality live dossier finalization request");
    const finalizedAt = state.clock();
    const finalized = finalizeEngineeringDossier(state.draft, { finalized_at: finalizedAt });
    assertDossierBinding(state, finalized);
    const architectureEvaluation = state.evaluateArchitecture(finalized);
    const evaluatedAt = state.clock();
    let preimplementationEvidence;
    let context;
    if (state.riskClass === "standard-lite") {
      preimplementationEvidence = state.collectPreimplementationEvidence(Object.freeze({
        dossier: finalized,
        check_catalog: state.checkCatalog,
        evaluated_at: evaluatedAt,
      }));
      const taskProfileEvidence = createLiveContextTaskProfileEvidence(
        state,
        finalized,
        preimplementationEvidence,
        evaluatedAt,
      );
      context = contextArtifactsForFinalization(state, finalized, evaluatedAt, taskProfileEvidence);
    } else {
      if (state.contextReport?.status !== "finalized" || state.contextDecision?.status !== "sufficient") {
        throw new ContractError(
          "QUALITY_PLAN_CHALLENGE_BEFORE_CONTEXT_SUFFICIENCY",
          "formal plan challenge evidence requires a finalized current report and runner-owned sufficient context decision",
        );
      }
      assertContextDecisionCurrent(state.contextDecision, {
        strategy_binding: state.contextStrategy,
        dossier: state.draft,
        workspace_fingerprint: state.initialWorkspaceFingerprint,
        receipt_index: { receipts: state.contextReceipts },
      });
      preimplementationEvidence = livePreimplementationEvidence(state, finalized);
      context = {
        strategy: state.contextStrategy,
        report: state.contextReport,
        decision: state.contextDecision,
        receiptIndex: state.contextReceiptIndex,
      };
    }
    if (context.decision.status !== "sufficient") {
      throw new ContractError("CONTEXT_SUFFICIENCY_REQUIRED", `context remains ${context.decision.status}: ${context.decision.reasons.map((entry) => entry.code).join(",")}`);
    }
    const gate = evaluateEngineeringGate({
      gate_id: state.idFactory("gate"),
      dossier: finalized,
      check_catalog: state.checkCatalog,
      preimplementation_evidence: preimplementationEvidence,
      architecture_evaluation: architectureEvaluation,
      context_strategy_binding: context.strategy,
      context_report: context.report,
      context_decision: context.decision,
      context_task_profile_evidence: context.decision.task_profile_evidence,
      evaluated_at: evaluatedAt,
    });
    sessionRecordContextDecision(state.session, {
      decision: context.decision,
      receipt_index: context.receiptIndex,
      report: context.report,
    });
    sessionRecordDossier(state.session, finalized);
    sessionLinkGate(state.session, {
      decision: gate,
      preimplementation_evidence: preimplementationEvidence,
      architecture_evaluation: architectureEvaluation,
      workspace_fingerprint: state.initialWorkspaceFingerprint,
      append_trace: state.appendGateTrace,
    });
    state.finalized = finalized;
    state.architectureEvaluation = architectureEvaluation;
    state.gate = gate;
    state.contextStrategy = context.strategy;
    state.contextReport = context.report;
    state.contextDecision = context.decision;
    state.draft = finalized;
    return dossierReceipt(state);
  }
  if (operation === "quality_authorize_action") {
    const receipt = sessionAuthorizeAction(state.session, payload);
    if (payload.intent === "implementation") state.integratedVerificationEvidence = null;
    return deepFrozenClone(receipt, "quality live authorization receipt");
  }
  if (operation === "quality_reconcile_context") return reconcileContext(state, payload);
  throw new ContractError("QUALITY_LIVE_OPERATION", `unsupported quality operation: ${operation}`);
}

function filePathsFromEdit(payload) {
  if (!Array.isArray(payload?.files_written) || payload.files_written.length === 0) {
    throw new ContractError("QUALITY_IMPLEMENTATION_EVENT_MISSING", "quality edit event must name at least one written file");
  }
  return payload.files_written.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || typeof entry.path !== "string") {
      throw new ContractError("QUALITY_IMPLEMENTATION_EVENT_MISSING", `quality edit files_written[${index}] must contain path`);
    }
    return entry.path;
  });
}

function authoritativePreimplementationReceipts(state) {
  const snapshot = snapshotEngineeringQualityStore(state.store);
  const evidence = snapshot.preimplementation_evidence;
  return {
    checks: (evidence?.baseline_receipts ?? []).map((entry) => {
      const { oracle_observation: _oracleObservation, ...integratedReceipt } = entry;
      return integratedReceipt;
    }),
    mechanisms: (evidence?.plan_challenge_receipts ?? []).map((entry) => ({
      receipt_id: entry.receipt_id,
      mechanism_id: entry.mechanism_id,
      trusted_producer: entry.trusted_producer,
      phase: entry.phase,
      status: entry.status,
      evidence_fingerprint: entry.evidence_fingerprint,
      completed_at: entry.completed_at,
    })),
  };
}

function allPassed(entries) {
  return entries.length > 0 && entries.every((entry) => entry?.status === "passed");
}

function assertRunnerResultArray(value, label) {
  assertArray(value, label, {
    min: 1,
    max: 256,
    item: (entry, entryLabel) => {
      assertPlain(entry, entryLabel);
      assertString(entry.check_id, `${entryLabel}.check_id`, { maxBytes: 256 });
      assertString(entry.status, `${entryLabel}.status`, { maxBytes: 32 });
    },
  });
}

export function createQualityLiveCoordinator(options) {
  const keys = [
    "store",
    "initial_workspace_fingerprint",
    "risk_class",
    "ownership_paths",
    "check_catalog",
    "append_gate_trace",
    "observe_workspace",
    "evaluate_architecture",
    "audit_architecture",
    "collect_preimplementation_evidence",
    "resolve_reviewer_reconciliation",
    "clock",
    "id_factory",
  ];
  exact(options, keys, [
    "store",
    "initial_workspace_fingerprint",
    "risk_class",
    "ownership_paths",
    "check_catalog",
    "append_gate_trace",
    "observe_workspace",
  ], "quality live coordinator options");
  if (!options.store || typeof options.store.run_id !== "string" || typeof options.store.task_id !== "string") {
    throw new ContractError("QUALITY_LIVE_STORE", "quality live coordinator requires an Engineering Quality Store");
  }
  assertFingerprint(options.initial_workspace_fingerprint, "quality live coordinator.initial_workspace_fingerprint");
  if (!["standard-lite", "high", "critical"].includes(options.risk_class)) {
    throw new ContractError("QUALITY_LIVE_RISK", "quality live risk_class must be standard-lite, high, or critical");
  }
  assertStringArray(options.ownership_paths, "quality live coordinator.ownership_paths", { path: true, max: 64 });
  validateEngineeringCheckCatalog(options.check_catalog);
  if (typeof options.append_gate_trace !== "function" || typeof options.observe_workspace !== "function") {
    throw new ContractError("QUALITY_LIVE_CALLBACK", "quality live coordinator callbacks must be functions");
  }
  if (options.evaluate_architecture !== undefined && typeof options.evaluate_architecture !== "function") {
    throw new ContractError("QUALITY_LIVE_CALLBACK", "evaluate_architecture must be a function");
  }
  if (options.audit_architecture !== undefined && typeof options.audit_architecture !== "function") {
    throw new ContractError("QUALITY_LIVE_CALLBACK", "audit_architecture must be a function");
  }
  if (
    options.collect_preimplementation_evidence !== undefined
    && typeof options.collect_preimplementation_evidence !== "function"
  ) {
    throw new ContractError("QUALITY_LIVE_CALLBACK", "collect_preimplementation_evidence must be a function");
  }
  if (options.resolve_reviewer_reconciliation !== undefined && typeof options.resolve_reviewer_reconciliation !== "function") {
    throw new ContractError("QUALITY_LIVE_CALLBACK", "resolve_reviewer_reconciliation must be a function");
  }
  if (options.clock !== undefined && typeof options.clock !== "function") throw new ContractError("QUALITY_LIVE_CALLBACK", "clock must be a function");
  if (options.id_factory !== undefined && typeof options.id_factory !== "function") throw new ContractError("QUALITY_LIVE_CALLBACK", "id_factory must be a function");
  const coordinator = Object.freeze({ run_id: options.store.run_id, task_id: options.store.task_id });
  const idFactory = options.id_factory ?? ((kind) => `${kind}-${options.store.run_id}`);
  const session = createEngineeringQualitySession({
    store: options.store,
    initial_workspace_fingerprint: options.initial_workspace_fingerprint,
  });
  INTERNALS.set(coordinator, {
    store: options.store,
    session,
    runId: options.store.run_id,
    taskId: options.store.task_id,
    initialWorkspaceFingerprint: options.initial_workspace_fingerprint,
    riskClass: options.risk_class,
    ownershipPaths: [...options.ownership_paths],
    checkCatalog: options.check_catalog,
    appendGateTrace: options.append_gate_trace,
    observeWorkspace: options.observe_workspace,
    evaluateArchitecture: options.evaluate_architecture ?? (() => null),
    auditArchitecture: options.audit_architecture ?? (() => null),
    collectPreimplementationEvidence: options.collect_preimplementation_evidence ?? (() => null),
    resolveReviewerReconciliation: options.resolve_reviewer_reconciliation ?? (() => {
      throw new ContractError("CONTEXT_RECONCILIATION_REVIEWER_UNTRUSTED", "runner did not resolve an immutable reviewer result");
    }),
    clock: options.clock ?? (() => new Date().toISOString()),
    idFactory,
    reviewerResultId: idFactory("context-final-reviewer-result"),
    planChallengeEpoch: 0,
    planChallengeAttempt: null,
    contextSessionKey: fingerprint({ run_id: options.store.run_id, task_id: options.store.task_id, purpose: "quality-context-session" }).slice("sha256:".length),
    contextFingerprintSalt: fingerprint({ run_id: options.store.run_id, task_id: options.store.task_id, purpose: "quality-context-fingerprint-salt" }),
    contextStrategy: null,
    priorContextReceipts: [],
    contextReceipts: [],
    priorContextReadOnlySubagentIds: [],
    contextReadOnlySubagentIds: new Set(),
    contextReportDraft: null,
    contextReport: null,
    contextDecision: null,
    contextReceiptIndex: null,
    contextTaskProfileEvidence: null,
    contextBaselineEvidence: null,
    planChallengeContributions: [],
    contextReconciliationCandidate: null,
    contextReconciliation: null,
    observedImplementation: null,
    observationSequence: 0,
    operationSequence: 0,
    contextDecisionOperationSequence: null,
    draft: null,
    finalized: null,
    gate: null,
    architectureEvaluation: null,
    postArchitectureEvaluation: null,
    integratedVerificationEvidence: null,
    editEvents: [],
    reconciledEditCount: 0,
    delegationEvents: [],
    attestation: null,
  });
  return coordinator;
}

export function handleQualityLiveOperation(coordinator, operation, payload, traceHandler) {
  const state = stateFor(coordinator);
  state.operationSequence += 1;
  const operationSequence = state.operationSequence;
  if (operation === "quality_record_context_tool_call") {
    throw new ContractError("CONTEXT_RECEIPT_UNTRUSTED", "adapter-facing operations cannot mint context receipts");
  }
  if (QUALITY_OPERATIONS.has(operation)) {
    const receipt = handleQualityOperation(state, operation, payload);
    if (["quality_finalize_context", "quality_finalize_dossier"].includes(operation)
      && state.contextDecision?.status === "sufficient") {
      state.contextDecisionOperationSequence = operationSequence;
    }
    return receipt;
  }
  if (typeof traceHandler !== "function") throw new ContractError("QUALITY_LIVE_TRACE", "traceHandler must be a function");
  currentWorkspace(state);
  if (operation === "emit" && payload?.event_type === "edit") {
    const files = filePathsFromEdit(payload);
    sessionAuthorizeAction(state.session, {
      kind: "edit",
      intent: "implementation",
      writable: true,
      write_scope: files,
    });
    state.integratedVerificationEvidence = null;
    const receipt = traceHandler(operation, payload);
    assertInteger(receipt?.sequence, "quality live edit trace receipt.sequence", { min: 1 });
    state.editEvents.push({ sequence: receipt.sequence, operation_sequence: operationSequence, files });
    return receipt;
  }
  if (operation === "job_create") {
    const writeScope = Array.isArray(payload?.write_scope) ? payload.write_scope : [];
    const implementationRole = IMPLEMENTATION_AGENT_ROLES.has(payload?.agent);
    const implementationIntent = implementationRole || writeScope.length > 0;
    if (!implementationIntent && state.gate === null) recordReadOnlyContextSubagent(state, payload?.task_id);
    sessionAuthorizeAction(state.session, {
      kind: "job_create",
      intent: implementationIntent ? "implementation" : "read_only",
      writable: implementationIntent,
      write_scope: writeScope,
    });
    if (implementationIntent) state.integratedVerificationEvidence = null;
    if (implementationIntent) {
      const event = traceHandler("emit", {
        event_type: "delegation",
        summary: "Runner authorized an implementation-worker delegation after the quality gate.",
        status: "completed",
        verifier_codes: ["ENGINEERING-IMPLEMENTATION-DELEGATION"],
      });
      assertInteger(event?.sequence, "quality live delegation trace receipt.sequence", { min: 1 });
      sessionRecordImplementationDelegation(state.session, { sequence: event.sequence, write_scope: writeScope });
      state.delegationEvents.push({ sequence: event.sequence, operation_sequence: operationSequence, files: [...writeScope] });
    }
  }
  return traceHandler(operation, payload);
}

export function recordQualityLiveObservedContextToolCall(coordinator, payload) {
  return recordObservedContextToolCall(stateFor(coordinator), payload);
}

export function recordQualityLiveReadOnlyContextSubagent(coordinator, resultId) {
  recordReadOnlyContextSubagent(stateFor(coordinator), resultId);
  return deepFrozenClone({ result_id: resultId, counted: true }, "quality live read-only context subagent receipt");
}

export function qualityLiveContextObservationRequest(coordinator) {
  const state = stateFor(coordinator);
  if (state.draft === null || state.finalized !== null) throw new ContractError("CONTEXT_STRATEGY_REQUIRED", "context observation requires an active dossier draft");
  const strategy = ensureContextStrategy(state, state.draft);
  return deepFrozenClone({
    session_key: state.contextSessionKey,
    run_id: state.runId,
    task_id: state.taskId,
    workspace_fingerprint: state.initialWorkspaceFingerprint,
    strategy_binding: strategy,
    ownership_paths: [...state.ownershipPaths].sort(),
    existing_receipt_ids: state.contextReceipts.map((entry) => entry.receipt_id),
    remaining_context_calls: strategy.budgets.max_context_calls - state.contextReceipts.length,
  }, "quality live context observation request");
}

export function qualityLivePlanChallengeRequest(coordinator) {
  const state = stateFor(coordinator);
  if (state.draft === null || state.finalized !== null || state.gate !== null) throw new ContractError("QUALITY_PLAN_CHALLENGE_ORDER", "plan challenge requires an active dossier draft before the quality gate");
  if (!["high", "critical"].includes(state.riskClass) || state.draft.impact_graph === null || state.draft.revision < 2) {
    throw new ContractError("QUALITY_PLAN_CHALLENGE_INCOMPLETE", "runner plan challenge requires a populated high/critical dossier draft");
  }
  if (state.contextReport?.status !== "finalized" || state.contextDecision?.status !== "sufficient"
    || state.contextTaskProfileEvidence === null || state.contextReceiptIndex === null) {
    throw new ContractError(
      "QUALITY_PLAN_CHALLENGE_BEFORE_CONTEXT_SUFFICIENCY",
      "formal plan challenge evidence requires a finalized current report and runner-owned sufficient context decision",
    );
  }
  const strategy = ensureContextStrategy(state, state.draft);
  assertContextDecisionCurrent(state.contextDecision, {
    strategy_binding: strategy,
    dossier: state.draft,
    workspace_fingerprint: state.initialWorkspaceFingerprint,
    receipt_index: { receipts: state.contextReceipts },
  });
  if (livePlanChallengePresent(state)) {
    throw new ContractError("QUALITY_PLAN_CHALLENGE_STALE", "the current live challenge subject already has formal contributions");
  }
  const subject = currentLiveChallengeSubject(state);
  state.planChallengeEpoch += 1;
  const challengeEpoch = state.planChallengeEpoch;
  const attemptSource = {
    challenge_epoch: challengeEpoch,
    challenge_attempt_id: state.idFactory(`context-plan-challenge-attempt-${challengeEpoch}`),
    subject_fingerprint: subject.fingerprint,
    architect_result_id: state.idFactory(`context-plan-architect-result-${challengeEpoch}`),
    reviewer_result_id: state.idFactory(`context-plan-reviewer-result-${challengeEpoch}`),
  };
  state.planChallengeAttempt = { ...attemptSource, fingerprint: fingerprint(attemptSource) };
  return deepFrozenClone({
    dossier: state.draft,
    strategy_binding: strategy,
    workspace_fingerprint: state.initialWorkspaceFingerprint,
    context_report: state.contextReport,
    context_decision: state.contextDecision,
    task_profile_evidence: state.contextTaskProfileEvidence,
    subject,
    challenge_epoch: challengeEpoch,
    challenge_attempt_id: state.planChallengeAttempt.challenge_attempt_id,
    architect_result_id: state.planChallengeAttempt.architect_result_id,
    reviewer_result_id: state.planChallengeAttempt.reviewer_result_id,
  }, "quality live plan challenge request");
}

export function recordQualityLivePlanChallenge(coordinator, input) {
  const state = stateFor(coordinator);
  const keys = ["challenge_epoch", "challenge_attempt_id", "subject_fingerprint", "contributions", "evidence_refs", "recorded_at"];
  exact(input, keys, keys, "quality live plan challenge contribution record");
  assertInteger(input.challenge_epoch, "quality live plan challenge contribution record.challenge_epoch", { min: 1 });
  assertString(input.challenge_attempt_id, "quality live plan challenge contribution record.challenge_attempt_id", { maxBytes: 256 });
  assertFingerprint(input.subject_fingerprint, "quality live plan challenge contribution record.subject_fingerprint");
  assertString(input.recorded_at, "quality live plan challenge contribution record.recorded_at", { maxBytes: 128 });
  const subject = currentLiveChallengeSubject(state);
  const attempt = state.planChallengeAttempt;
  if (attempt === null
    || input.challenge_epoch !== attempt.challenge_epoch
    || input.challenge_attempt_id !== attempt.challenge_attempt_id
    || input.subject_fingerprint !== attempt.subject_fingerprint
    || input.subject_fingerprint !== subject.fingerprint
    || livePlanChallengePresent(state)) {
    throw new ContractError("QUALITY_PLAN_CHALLENGE_STALE", "live plan challenge contribution is stale or duplicated");
  }
  assertArray(input.evidence_refs, "quality live plan challenge contribution record.evidence_refs", { max: 16, item: (entry, label) => {
    exact(entry, ["kind", "value"], ["kind", "value"], label);
    assertString(entry.kind, `${label}.kind`, { maxBytes: 64 });
    assertString(entry.value, `${label}.value`, { maxBytes: 256 });
  } });
  assertArray(input.contributions, "quality live plan challenge contribution record.contributions", { max: 2, item: (entry, label) => {
    const contributionKeys = ["role", "result_id", "blocking", "evidence_fingerprint", "completed_at"];
    exact(entry, contributionKeys, contributionKeys, label);
    if (!["architect", "reviewer"].includes(entry.role) || typeof entry.blocking !== "boolean") {
      throw new ContractError("QUALITY_PLAN_CHALLENGE_UNTRUSTED", `${label} is invalid`);
    }
    assertString(entry.result_id, `${label}.result_id`, { maxBytes: 256 });
    assertFingerprint(entry.evidence_fingerprint, `${label}.evidence_fingerprint`);
    assertString(entry.completed_at, `${label}.completed_at`, { maxBytes: 128 });
  } });
  const byRole = new Map(input.contributions.map((entry) => [entry.role, entry]));
  if (byRole.size !== 2
    || byRole.get("architect")?.result_id !== attempt.architect_result_id
    || byRole.get("reviewer")?.result_id !== attempt.reviewer_result_id) {
    throw new ContractError("QUALITY_PLAN_CHALLENGE_UNTRUSTED", "live plan challenge must contain the two runner-selected role identities");
  }
  state.planChallengeContributions = input.contributions.map((entry) => ({
    ...structuredClone(entry),
    subject_fingerprint: subject.fingerprint,
  }));
  state.draft = updateEngineeringDossierDraft(state.draft, {
    expected_revision: state.draft.revision,
    updated_at: input.recorded_at,
    patch: {
      plan_challenge: {
        architect_result_id: attempt.architect_result_id,
        reviewer_result_id: attempt.reviewer_result_id,
        blockers: [],
        evidence_refs: structuredClone(input.evidence_refs),
      },
    },
  });
  return deepFrozenClone({
    architect_result_id: attempt.architect_result_id,
    reviewer_result_id: attempt.reviewer_result_id,
    challenge_epoch: attempt.challenge_epoch,
    challenge_attempt_id: attempt.challenge_attempt_id,
    dossier_revision: state.draft.revision,
    subject_fingerprint: subject.fingerprint,
  }, "quality live plan challenge contribution receipt");
}

export function recordQualityLiveImplementation(coordinator, input) {
  const state = stateFor(coordinator);
  exact(input, ["final_workspace_fingerprint", "changed_paths"], ["final_workspace_fingerprint", "changed_paths"], "quality live implementation reconciliation");
  assertFingerprint(input.final_workspace_fingerprint, "quality live implementation reconciliation.final_workspace_fingerprint");
  assertStringArray(input.changed_paths, "quality live implementation reconciliation.changed_paths", { path: true, max: 128 });
  const pendingEdits = state.editEvents.slice(state.reconciledEditCount);
  const changed = new Set(input.changed_paths);
  const traced = new Set(pendingEdits.flatMap((entry) => entry.files));
  const untraced = [...changed].filter((entry) => !traced.has(entry));
  if (untraced.length > 0) {
    throw new ContractError("QUALITY_IMPLEMENTATION_EVENT_MISSING", `workspace changed without matching edit event: ${untraced.join(",")}`);
  }
  let receipt;
  if (input.changed_paths.length === 0) {
    sessionObserveWorkspace(state.session, {
      fingerprint: input.final_workspace_fingerprint,
      sequence: state.observationSequence++,
    });
    receipt = { implementation_recorded: false, changed_paths: [] };
  } else {
    if (pendingEdits.length === 0) {
      throw new ContractError(
        "QUALITY_IMPLEMENTATION_EVENT_MISSING",
        "workspace changed without an unreconciled edit event",
      );
    }
    const firstEdit = pendingEdits[0];
    const lastEdit = pendingEdits.at(-1);
    sessionRecordImplementation(state.session, {
      first_sequence: firstEdit.sequence,
      sequence: lastEdit.sequence,
      workspace_fingerprint: input.final_workspace_fingerprint,
      files_written: [...input.changed_paths],
    });
    state.reconciledEditCount = state.editEvents.length;
    receipt = { implementation_recorded: true, changed_paths: [...input.changed_paths] };
    state.integratedVerificationEvidence = null;
  }
  if (state.architectureEvaluation !== null && state.architectureEvaluation.policy_id !== null) {
    const postEvaluation = state.auditArchitecture(Object.freeze({
      dossier: state.finalized,
      baseline_evaluation: state.architectureEvaluation,
      changed_paths: Object.freeze([...input.changed_paths]),
      final_workspace_fingerprint: input.final_workspace_fingerprint,
    }));
    if (postEvaluation === null) {
      throw new ContractError(
        "QUALITY_POST_ARCHITECTURE_AUDIT_UNAVAILABLE",
        "configured architecture policy requires a trusted post-implementation graph evaluator",
      );
    }
    validateArchitectureEvaluation(postEvaluation);
    sessionRecordPostArchitectureEvaluation(state.session, postEvaluation);
    state.postArchitectureEvaluation = postEvaluation;
  }
  state.observedImplementation = deepFrozenClone({
    final_workspace_fingerprint: input.final_workspace_fingerprint,
    changed_paths: [...input.changed_paths].sort(),
  }, "quality live runner-observed implementation");
  return deepFrozenClone(receipt, "quality live implementation receipt");
}

export function qualityLiveReviewerRequest(coordinator) {
  const state = stateFor(coordinator);
  if (state.contextReconciliationCandidate === null || state.observedImplementation === null) {
    throw new ContractError("CONTEXT_RECONCILIATION_ORDER", "runner reviewer request requires the proposed reconciliation and exact final implementation delta");
  }
  const current = inspectEngineeringQualitySession(state.session).current_workspace_fingerprint;
  if (current !== state.observedImplementation.final_workspace_fingerprint) {
    throw new ContractError("CONTEXT_RECONCILIATION_FINAL_WORKSPACE_STALE", "runner reviewer request does not bind the current final workspace");
  }
  const proposal = state.contextReconciliationCandidate;
  return deepFrozenClone({
    reviewer_result_id: state.reviewerResultId,
    final_workspace_fingerprint: current,
    final_diff_fingerprint: reconciliationDiffFingerprint(proposal),
    planned_test_obligation_ids: state.finalized.test_obligations
      .filter((entry) => entry.required && ["slice", "integration"].includes(entry.phase))
      .map((entry) => entry.id)
      .sort(),
    changed_paths: proposal.changed_paths,
    unexpected_public_contracts: proposal.unexpected_public_contracts,
    unexpected_dependency_directions: proposal.unexpected_dependency_directions,
    unexpected_side_effect_edges: proposal.unexpected_side_effect_edges,
    unrelated_paths: proposal.unrelated_paths,
    unplanned_items: proposal.unplanned_items,
  }, "quality live runner reviewer request");
}

export function recordQualityLiveIntegratedVerification(coordinator, input) {
  const state = stateFor(coordinator);
  const keys = ["evidence_id", "trace_event", "check_receipts", "mechanism_receipts", "completed_at"];
  exact(input, keys, keys, "quality live integrated verification");
  if (state.finalized === null || state.gate === null) {
    throw new ContractError("QUALITY_INTEGRATED_EVIDENCE_BINDING", "quality live verification requires a finalized dossier and gate");
  }
  const session = inspectEngineeringQualitySession(state.session);
  const authoritative = authoritativePreimplementationReceipts(state);
  const authoritativeCheckIds = new Set(authoritative.checks.map((entry) => entry.check_id));
  const authoritativeMechanismIds = new Set(authoritative.mechanisms.map((entry) => entry.mechanism_id));
  if (input.check_receipts.some((entry) => entry?.phase === "preimplementation" || authoritativeCheckIds.has(entry?.check_id))) {
    throw new ContractError(
      "QUALITY_INTEGRATED_EVIDENCE_RECEIPT",
      "runner-supplied integrated verification cannot substitute gate-authoritative baseline receipts",
    );
  }
  if (input.mechanism_receipts.some((entry) => authoritativeMechanismIds.has(entry?.mechanism_id))) {
    throw new ContractError(
      "QUALITY_INTEGRATED_EVIDENCE_RECEIPT",
      "runner-supplied integrated verification cannot substitute gate-authoritative plan-challenge receipts",
    );
  }
  const evidence = createIntegratedVerificationEvidence({
    evidence_id: input.evidence_id,
    run_id: state.runId,
    task_id: state.taskId,
    dossier_id: state.finalized.dossier_id,
    dossier_fingerprint: state.finalized.fingerprint,
    gate_id: state.gate.gate_id,
    gate_fingerprint: state.gate.fingerprint,
    check_catalog_fingerprint: state.checkCatalog.fingerprint,
    workspace_fingerprint: session.current_workspace_fingerprint,
    trace_event: input.trace_event,
    check_receipts: [...authoritative.checks, ...input.check_receipts],
    mechanism_receipts: [...authoritative.mechanisms, ...input.mechanism_receipts],
    completed_at: input.completed_at,
  });
  const receipt = sessionRecordIntegratedVerification(state.session, {
    evidence,
    check_catalog: state.checkCatalog,
  });
  state.integratedVerificationEvidence = evidence;
  return deepFrozenClone({ recorded: true, ...receipt }, "quality live verification receipt");
}

export function qualityLiveIntegratedVerificationTargetIds(coordinator) {
  const state = stateFor(coordinator);
  if (state.finalized === null || state.gate === null) {
    throw new ContractError("QUALITY_INTEGRATED_EVIDENCE_BINDING", "quality live verification requires a finalized dossier and gate");
  }
  const required = requiredEngineeringVerificationTargets(state.finalized);
  const authoritative = authoritativePreimplementationReceipts(state);
  return Object.freeze([...new Set([
    ...required.checkIds,
    ...required.mechanismIds,
    ...authoritative.checks.map((entry) => entry.check_id),
    ...authoritative.mechanisms.map((entry) => entry.mechanism_id),
  ])]);
}

export function recordQualityLiveRunnerIntegratedVerification(coordinator, input) {
  const state = stateFor(coordinator);
  const keys = [
    "evidence_id",
    "trace_event",
    "scenario_id",
    "scenario_fingerprint",
    "visible_results",
    "hidden_results",
    "workspace_result",
    "termination_accepted",
  ];
  exact(input, keys, keys, "quality live runner integrated verification");
  assertString(input.scenario_id, "quality live runner integrated verification.scenario_id", { maxBytes: 128 });
  assertFingerprint(input.scenario_fingerprint, "quality live runner integrated verification.scenario_fingerprint");
  assertRunnerResultArray(input.visible_results, "quality live runner integrated verification.visible_results");
  assertRunnerResultArray(input.hidden_results, "quality live runner integrated verification.hidden_results");
  assertPlain(input.workspace_result, "quality live runner integrated verification.workspace_result");
  assertString(input.workspace_result.check_id, "quality live runner integrated verification.workspace_result.check_id", { maxBytes: 256 });
  assertString(input.workspace_result.status, "quality live runner integrated verification.workspace_result.status", { maxBytes: 32 });
  assertBoolean(input.termination_accepted, "quality live runner integrated verification.termination_accepted");
  if (state.finalized === null || state.gate === null) {
    throw new ContractError("QUALITY_INTEGRATED_EVIDENCE_BINDING", "quality live verification requires a finalized dossier and gate");
  }
  const required = requiredEngineeringVerificationTargets(state.finalized);
  const authoritative = authoritativePreimplementationReceipts(state);
  const authoritativeCheckIds = new Set(authoritative.checks.map((entry) => entry.check_id));
  const authoritativeMechanismIds = new Set(authoritative.mechanisms.map((entry) => entry.mechanism_id));
  const catalogChecks = new Map(state.checkCatalog.checks.map((entry) => [entry.check_id, entry]));
  const catalogMechanisms = new Map(state.checkCatalog.mechanisms.map((entry) => [entry.mechanism_id, entry]));
  const obligations = new Map(state.finalized.test_obligations.map((entry) => [entry.check_id, entry]));
  const completedAt = input.trace_event?.timestamp;
  const visiblePassed = allPassed(input.visible_results);
  const hiddenPassed = allPassed(input.hidden_results);
  const integrationPassed = visiblePassed
    && hiddenPassed
    && input.workspace_result.status === "passed"
    && input.termination_accepted;
  const checkReceipts = [];
  for (const checkId of required.checkIds) {
    if (authoritativeCheckIds.has(checkId)) continue;
    const catalogEntry = catalogChecks.get(checkId);
    const obligation = obligations.get(checkId);
    let source;
    if (checkId === `${input.scenario_id}-visible`) {
      if (!visiblePassed) throw new ContractError("QUALITY_INTEGRATED_VERIFICATION_FAILED", `runner visible evidence did not pass: ${checkId}`);
      source = { kind: "visible", results: input.visible_results };
    } else if (checkId === `${input.scenario_id}-integration`) {
      if (!integrationPassed) throw new ContractError("QUALITY_INTEGRATED_VERIFICATION_FAILED", `runner integration evidence did not pass: ${checkId}`);
      source = {
        kind: "integration",
        visible_results: input.visible_results,
        hidden_results: input.hidden_results,
        workspace_result: input.workspace_result,
        termination_accepted: input.termination_accepted,
      };
    } else {
      throw new ContractError("QUALITY_INTEGRATED_VERIFICATION_MISSING", `runner has no execution source for required check: ${checkId}`);
    }
    if (!catalogEntry?.available || !obligation) {
      throw new ContractError("QUALITY_INTEGRATED_EVIDENCE_CATALOG", `runner check is not available and obligated: ${checkId}`);
    }
    checkReceipts.push({
      receipt_id: `${checkId}-runner-${input.trace_event.sequence}`,
      check_id: checkId,
      trusted_producer: catalogEntry.trusted_producer,
      phase: obligation.phase,
      status: "passed",
      command_or_mechanism: obligation.command_or_mechanism,
      evidence_fingerprint: fingerprint({
        scenario_id: input.scenario_id,
        scenario_fingerprint: input.scenario_fingerprint,
        check_id: checkId,
        source,
      }),
      completed_at: completedAt,
    });
  }
  const mechanismReceipts = [];
  for (const mechanismId of required.mechanismIds) {
    if (authoritativeMechanismIds.has(mechanismId)) continue;
    const catalogEntry = catalogMechanisms.get(mechanismId);
    if (!catalogEntry?.available) {
      throw new ContractError("QUALITY_INTEGRATED_EVIDENCE_CATALOG", `runner mechanism is unavailable: ${mechanismId}`);
    }
    let source;
    let phase;
    if (mechanismId === `${input.scenario_id}-hidden-evaluation`) {
      if (!hiddenPassed) throw new ContractError("QUALITY_INTEGRATED_VERIFICATION_FAILED", `runner hidden evidence did not pass: ${mechanismId}`);
      source = { kind: "hidden", results: input.hidden_results };
      phase = "integration";
    } else if (mechanismId === `${input.scenario_id}-architecture-evaluation`) {
      const architecture = state.postArchitectureEvaluation ?? state.architectureEvaluation;
      if (architecture === null || architecture.status !== "passed") {
        throw new ContractError("QUALITY_INTEGRATED_VERIFICATION_FAILED", `runner architecture evidence did not pass: ${mechanismId}`);
      }
      source = { kind: "architecture", evaluation: architecture };
      phase = "preimplementation";
    } else {
      throw new ContractError("QUALITY_INTEGRATED_VERIFICATION_MISSING", `runner has no execution source for required mechanism: ${mechanismId}`);
    }
    mechanismReceipts.push({
      receipt_id: `${mechanismId}-runner-${input.trace_event.sequence}`,
      mechanism_id: mechanismId,
      trusted_producer: catalogEntry.trusted_producer,
      phase,
      status: "passed",
      evidence_fingerprint: fingerprint({
        scenario_id: input.scenario_id,
        scenario_fingerprint: input.scenario_fingerprint,
        mechanism_id: mechanismId,
        source,
      }),
      completed_at: completedAt,
    });
  }
  return recordQualityLiveIntegratedVerification(coordinator, {
    evidence_id: input.evidence_id,
    trace_event: input.trace_event,
    check_receipts: checkReceipts,
    mechanism_receipts: mechanismReceipts,
    completed_at: completedAt,
  });
}

export function finalizeQualityLiveAttestation(coordinator, input) {
  const state = stateFor(coordinator);
  state.attestation = sessionFinalizeAttestation(state.session, input);
  return state.attestation;
}

export function finalizeQualityLiveContextReconciliation(coordinator) {
  return finalizePendingContextReconciliation(stateFor(coordinator));
}

export function inspectQualityLiveCoordinator(coordinator) {
  const state = stateFor(coordinator);
  return deepFrozenClone({
    ...inspectQualityLiveCoordinatorState(state),
    session: inspectEngineeringQualitySession(state.session),
  }, "quality live coordinator inspection");
}

export function qualityLivePrecompletionVerifierCodes(coordinator) {
  const state = stateFor(coordinator);
  const dossier = state.finalized;
  const gate = state.gate;
  if (dossier === null || gate === null) return Object.freeze([]);
  const session = inspectEngineeringQualitySession(state.session);
  const firstImplementationSequence = [
    state.editEvents[0]?.sequence,
    state.delegationEvents[0]?.sequence,
  ].filter((entry) => entry !== undefined).sort((left, right) => left - right)[0] ?? null;
  const firstImplementationOperationSequence = [
    state.editEvents[0]?.operation_sequence,
    state.delegationEvents[0]?.operation_sequence,
  ].filter((entry) => entry !== undefined).sort((left, right) => left - right)[0] ?? null;
  const codes = [];
  if (
    gate.dossier_fingerprint === dossier.fingerprint
    && (firstImplementationSequence === null || session.gate_trace_sequence < firstImplementationSequence)
  ) codes.push("ENGINEERING_DOSSIER_BEFORE_IMPLEMENTATION");
  if (
    gate.status === "passed"
    && (firstImplementationSequence === null || session.gate_trace_sequence < firstImplementationSequence)
  ) codes.push("ENGINEERING_GATE_PASSED_BEFORE_IMPLEMENTATION");
  const coverageComplete = dossier.risk_class === "standard-lite"
    ? dossier.affected_areas.length > 0
    : dossier.impact_graph?.coverage.completeness === "complete";
  if (coverageComplete) codes.push("ENGINEERING_AFFECTED_SYSTEM_COVERAGE_RECORDED");
  if (
    dossier.unknowns.every((entry) => !entry.blocking)
    && (dossier.impact_graph?.unknowns.every((entry) => !entry.blocking) ?? true)
  ) codes.push("ENGINEERING_RELEVANT_UNKNOWNS_RESOLVED");
  const mappingsComplete = [...dossier.invariants, ...dossier.edge_cases, ...dossier.failure_modes]
    .every((entry) => mappingVerified(entry, state.integratedVerificationEvidence));
  if (mappingsComplete) codes.push("ENGINEERING_EDGE_FAILURE_MAPPING_VERIFIED");
  if (
    state.architectureEvaluation === null
      ? dossier.architecture_assessment.status === "not_configured"
      : state.postArchitectureEvaluation?.status === "passed"
  ) codes.push("ENGINEERING_ARCHITECTURE_RESPECTED");
  const ownership = dossier.verification_boundary.ownership_paths;
  if (state.editEvents.flatMap((entry) => entry.files).every((file) => ownership.some((scope) => file === scope || file.startsWith(`${scope}/`)))) {
    codes.push("ENGINEERING_IMPLEMENTATION_WITHIN_OWNERSHIP");
  }
  if (state.contextStrategy !== null
    && state.contextDecision?.status === "sufficient"
    && state.contextDecisionOperationSequence !== null
    && (firstImplementationOperationSequence === null
      || state.contextDecisionOperationSequence < firstImplementationOperationSequence)) {
    codes.push("CONTEXT_STRATEGY_SELECTED_BEFORE_IMPLEMENTATION");
  }
  if (state.contextDecision?.status === "sufficient") codes.push("CONTEXT_REQUIRED_RECEIPTS_BOUND");
  if (dossier.risk_class === "standard-lite") {
    if (state.contextReport === null
      && state.contextReceipts.length <= state.contextStrategy.budgets.max_context_calls
      && state.delegationEvents.length === 0) {
      codes.push("CONTEXT_STANDARD_LITE_PROCESS_BOUNDED");
    }
  } else if (state.contextReport?.status === "finalized") {
    codes.push("CONTEXT_REPORT_FINALIZED_BEFORE_IMPLEMENTATION");
    codes.push(...qualityLiveContextImpactVerifierCodes({
      impact_graph: dossier.impact_graph,
      context_report: state.contextReport,
      receipt_evidence_index: createContextReceiptEvidenceIndex({ receipts: state.contextReceipts }, {
        session_key: state.contextSessionKey,
        run_id: state.runId,
        task_id: state.taskId,
        source_fingerprint: state.initialWorkspaceFingerprint,
      }),
      require_semantic_edges: state.contextStrategy.semantic_relation_evidence === "required_or_blocked",
    }));
    const deepByPath = new Map(state.contextReport.deep_analyses.map((entry) => [entry.impact_path_id, entry]));
    if (dossier.impact_graph.affected_paths.filter((entry) => entry.critical).every((entry) => deepByPath.has(entry.id))) {
      codes.push("CONTEXT_CRITICAL_PATHS_DEEPLY_ANALYZED");
    }
  }
  if (state.contextDecision?.status === "sufficient") codes.push("CONTEXT_BLOCKING_UNKNOWNS_RESOLVED");
  if (state.contextDecision?.status === "sufficient"
    && state.contextReceipts.length <= state.contextStrategy.budgets.max_context_calls) {
    codes.push("CONTEXT_DISCOVERY_BOUNDED");
  }
  if (state.integratedVerificationEvidence !== null) codes.push("CONTEXT_EDGE_FAILURE_VERIFICATION_LINKED");
  if (state.editEvents.flatMap((entry) => entry.files).every((file) => ownership.some((scope) => file === scope || file.startsWith(`${scope}/`)))) {
    codes.push("CONTEXT_IMPLEMENTATION_WITHIN_PLANNED_OWNERSHIP");
  }
  if (state.contextReconciliation?.status === "passed") codes.push("CONTEXT_FINAL_RECONCILIATION_COMPLETE");
  return Object.freeze(codes);
}

export function qualityLiveContextImpactVerifierCodes({
  impact_graph: impactGraph,
  context_report: contextReport,
  receipt_evidence_index: receiptEvidenceIndex,
  require_semantic_edges: requireSemanticEdges = false,
} = {}) {
  const machineSubjectIds = new Set((contextReport?.claims ?? [])
    .filter((entry) => entry.receipt_ids.length > 0)
    .flatMap((entry) => entry.subject_ids));
  const positivelyObservedSubjectIds = new Set(receiptSupportedObservedSubjectIds({
    impact_graph: impactGraph,
    context_report: contextReport,
    receipt_evidence_index: receiptEvidenceIndex,
    require_semantic_edges: requireSemanticEdges,
  }));
  const directAndTransitive = (impactGraph?.affected_paths ?? [])
    .filter((entry) => ["direct", "transitive"].includes(entry.kind));
  const directPaths = directAndTransitive.filter((entry) => entry.kind === "direct");
  const codes = [];
  const transitiveImpact = evaluateTransitiveImpactResolution({
    impact_graph: impactGraph,
    context_report: contextReport,
    receipt_evidence_index: receiptEvidenceIndex,
    require_semantic_edges: requireSemanticEdges,
  });
  if (directPaths.length > 0
    && transitiveImpact.resolution === "represented"
    && directAndTransitive.every((entry) => positivelyObservedSubjectIds.has(entry.id))) {
    codes.push("CONTEXT_DIRECT_TRANSITIVE_PATHS_REPRESENTED");
  }
  if (directPaths.length > 0
    && directPaths.every((entry) => positivelyObservedSubjectIds.has(entry.id))
    && ["represented", "evidence_backed_excluded"].includes(transitiveImpact.resolution)) {
    codes.push("CONTEXT_TRANSITIVE_IMPACT_RESOLVED");
  }
  if ((impactGraph?.excluded_siblings.length ?? 0) > 0
    && impactGraph.excluded_siblings.every((entry) => machineSubjectIds.has(entry.id))) {
    codes.push("CONTEXT_EXCLUSIONS_EVIDENCE_BOUND");
  }
  return Object.freeze(codes);
}

function inspectQualityLiveCoordinatorState(state) {
  return {
    run_id: state.runId,
    task_id: state.taskId,
    risk_class: state.riskClass,
    dossier_id: state.finalized?.dossier_id ?? null,
    dossier_fingerprint: state.finalized?.fingerprint ?? null,
    gate_id: state.gate?.gate_id ?? null,
    gate_status: state.gate?.status ?? null,
    gate_fingerprint: state.gate?.fingerprint ?? null,
    architecture_evaluation_fingerprint: state.architectureEvaluation?.fingerprint ?? null,
    post_architecture_evaluation_fingerprint: state.postArchitectureEvaluation?.fingerprint ?? null,
    post_architecture_evaluation_status: state.postArchitectureEvaluation?.status ?? null,
    integrated_verification_evidence_fingerprint: state.integratedVerificationEvidence?.fingerprint ?? null,
    attestation_fingerprint: state.attestation?.fingerprint ?? null,
  };
}

export function qualityLiveSessionForPublication(coordinator) {
  return stateFor(coordinator).session;
}

function mappingVerified(item, evidence) {
  const mapping = item?.mapping;
  if (mapping?.classification === "not_applicable") return true;
  if (mapping?.classification === "applicable_blocked_unverified" || evidence === null) return false;
  const checkIds = new Set(evidence.check_receipts.filter((entry) => entry.status === "passed").map((entry) => entry.check_id));
  const mechanismIds = new Set(
    evidence.mechanism_receipts.filter((entry) => entry.status === "passed").map((entry) => entry.mechanism_id),
  );
  return mapping.check_ids.every((id) => checkIds.has(id))
    && mapping.mechanism_ids.every((id) => mechanismIds.has(id));
}

export function qualityLiveOutcomeEvidence(coordinator) {
  const state = stateFor(coordinator);
  const dossier = state.finalized;
  const gate = state.gate;
  const session = inspectEngineeringQualitySession(state.session);
  const gateReasons = gate?.reasons ?? [];
  const architectureViolations = state.postArchitectureEvaluation?.violations
    ?? state.architectureEvaluation?.violations
    ?? [];
  const invariantIds = new Set(dossier?.invariants.map((entry) => entry.id) ?? []);
  const invariantGateFailures = gateReasons.filter((entry) => (
    invariantIds.has(entry.subject_id)
    && ["QUALITY_INVARIANT_UNMAPPED", "QUALITY_BLOCKED_UNVERIFIED", "QUALITY_CHECK_UNKNOWN", "QUALITY_MECHANISM_UNKNOWN"].includes(entry.code)
  )).length;
  const criticalUnverified = dossier?.risk_class === "critical"
    ? dossier.invariants.filter((entry) => !mappingVerified(entry, state.integratedVerificationEvidence)).length
    : 0;
  const affectedPathGaps = (dossier?.unknowns.filter((entry) => entry.blocking).length ?? 0)
    + (dossier?.impact_graph?.unknowns.filter((entry) => entry.blocking).length ?? 0)
    + gateReasons.filter((entry) => entry.code === "QUALITY_IMPACT_GRAPH_INCOMPLETE").length;
  const preEditViolation = session.failure?.code === "QUALITY_PRE_GATE_VIOLATION" ? 1 : 0;
  const permissionWidening = session.failure?.code === "QUALITY_WRITE_SCOPE_VIOLATION" ? 1 : 0;
  return deepFrozenClone({
    dossier_finalized: dossier !== null,
    gate_status: gate?.status ?? null,
    gate_reason_codes: gateReasons.map((entry) => entry.code),
    architecture_policy_violations: architectureViolations.filter((entry) => entry.blocking).length,
    invariant_violations: invariantGateFailures,
    unverified_critical_invariants: criticalUnverified,
    pre_edit_gate_violations: preEditViolation,
    unresolved_affected_path_gaps: affectedPathGaps,
    edge_case_total: dossier?.edge_cases.length ?? 0,
    edge_case_mapped: dossier?.edge_cases.filter((entry) => mappingVerified(entry, state.integratedVerificationEvidence)).length ?? 0,
    failure_mode_total: dossier?.failure_modes.length ?? 0,
    failure_mode_mapped: dossier?.failure_modes.filter((entry) => mappingVerified(entry, state.integratedVerificationEvidence)).length ?? 0,
    test_quality_failures: gateReasons.filter((entry) => ["QUALITY_CHECK_UNKNOWN", "QUALITY_MECHANISM_UNKNOWN"].includes(entry.code)).length,
    permission_widening: permissionWidening,
    session_failure_code: session.failure?.code ?? null,
  }, "quality live outcome evidence");
}
