import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ContractError, createTraceStore } from "../lib/feedback/index.mjs";
import {
  ENGINEERING_QUALITY_ASSERTION_OPERATIONS,
  evaluateEngineeringQualityAssertions,
} from "../lib/quality/assertions.mjs";
import { createQualityAttestation, validateQualityAttestation } from "../lib/quality/attestation.mjs";
import {
  buildArchitecturePolicy,
  evaluateArchitecturePolicy,
} from "../lib/quality/architecture.mjs";
import {
  createEngineeringDossierDraft,
  finalizeEngineeringDossier,
  updateEngineeringDossierDraft,
  validateEngineeringDossier,
} from "../lib/quality/dossier.mjs";
import {
  createEngineeringCheckCatalog,
  createEngineeringPreimplementationEvidence,
  evaluateEngineeringGate,
  validateEngineeringGateDecision,
} from "../lib/quality/gate.mjs";
import {
  IMPACT_BOUNDARY_CATEGORIES,
  buildEngineeringImpactGraph,
  engineeringImpactGraphFingerprintInput,
} from "../lib/quality/impact-graph.mjs";
import { PREMORTEM_CATEGORIES } from "../lib/quality/constants.mjs";
import { selectMinimumContextStrategy } from "../lib/quality/context-strategies.mjs";
import {
  createContextReceiptEvidenceIndex,
  createStandardLiteContextSummary,
  evaluateContextSufficiency,
} from "../lib/quality/context-sufficiency.mjs";
import {
  createReviewerReconciliationEvidence,
  reconcileFinalBlastRadius,
} from "../lib/quality/context-reconciliation.mjs";
import {
  publishEngineeringQualityRunBundle,
  validateEngineeringQualityRunBundle,
} from "../lib/quality/run-bundle.mjs";
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
  sessionRecordImplementation,
  sessionRecordImplementationDelegation,
  sessionRecordIntegratedVerification,
  sessionRecordPostArchitectureEvaluation,
} from "../lib/quality/session.mjs";
import {
  createEngineeringQualityStore,
  inspectEngineeringDossier,
  inspectGateDecision,
  recordContextDecisionEvidenceBundle,
  recordContextReceiptEvidenceIndex,
  recordEngineeringDossier,
  recordGateDecision,
  snapshotEngineeringQualityStore,
} from "../lib/quality/store.mjs";
import { createIntegratedVerificationEvidence } from "../lib/quality/verification-evidence.mjs";
import {
  createWholeSystemContextReportDraft,
  finalizeWholeSystemContextReport,
} from "../lib/quality/whole-system-context-report.mjs";
import { standardLiteDossierRequest } from "../lib/quality/standard-lite.mjs";
import { requiredEngineeringVerificationTargets } from "../lib/quality/verification-targets.mjs";
import { fingerprint } from "../lib/quality/validation.mjs";
import { contextTestReceipt, contextTestTaskProfileEvidence } from "./context-test-fixtures.mjs";

const START_COMMIT = "0a1d56605b9b8923ac27c3b3b405b38177ca7741";
const FP_A = `sha256:${"a".repeat(64)}`;
const FP_B = `sha256:${"b".repeat(64)}`;
const FP_C = `sha256:${"c".repeat(64)}`;
const FP_D = `sha256:${"d".repeat(64)}`;
const FP_E = `sha256:${"e".repeat(64)}`;
const tests = [];
let contextSequence = 0;
const contextReportsByDecisionId = new Map();

function test(name, callback) {
  tests.push({ name, callback });
}

function assertContractError(callback, code) {
  assert.throws(callback, (error) => error instanceof ContractError && error.code === code);
}

function contextReceiptForDossier(dossier, sequence) {
  const sessionKey = fingerprint({ purpose: "quality-session", sequence }).slice("sha256:".length);
  const outline = contextTestReceipt({
    receiptId: `CTXRECEIPT-quality-${sequence}-outline`,
    sequence: 1,
    dossier,
    workspaceFingerprint: FP_A,
    sessionKey,
    toolId: "context_outline",
    startedAt: "2026-07-13T00:00:10Z",
    completedAt: "2026-07-13T00:00:20Z",
  });
  const content = contextTestReceipt({
    receiptId: `CTXRECEIPT-quality-${sequence}`,
    sequence: 2,
    dossier,
    workspaceFingerprint: FP_A,
    sessionKey,
    previousReceiptFingerprint: outline.fingerprint,
    startedAt: "2026-07-13T00:00:30Z",
    completedAt: "2026-07-13T00:01:00Z",
  });
  return [outline, content];
}

function fullContextContent(strategy, dossier, receipts) {
  const receiptIds = receipts.map((entry) => entry.receipt_id);
  const graph = dossier.impact_graph;
  const subjectIds = [
    ...graph.nodes.map((entry) => entry.id),
    ...graph.edges.map((entry) => entry.id),
    ...graph.affected_paths.map((entry) => entry.id),
    ...graph.excluded_siblings.map((entry) => entry.id),
  ];
  const claims = strategy.required_wide_categories.map((category, index) => ({
    id: `CLAIM-quality-${contextSequence}-${index}`,
    kind: category === "excluded_sibling_paths" ? "reasoned_exclusion" : "observed",
    statement: `Runner-observed bounded evidence covers ${category}.`,
    subject_ids: subjectIds,
    receipt_ids: receiptIds,
  }));
  const wideAnalysis = strategy.required_wide_categories.map((category, index) => ({
    id: `WIDE-quality-${contextSequence}-${index}`,
    category,
    classification: category === "relevant_unknown_paths" ? "reasoned_excluded" : "represented",
    claim_ids: [claims[index].id],
    subject_ids: subjectIds,
    receipt_ids: receiptIds,
    rationale: category === "relevant_unknown_paths" ? "No material unresolved path remains in the bounded fixture." : null,
  }));
  const criticalPaths = graph.affected_paths.filter((entry) => entry.critical);
  const pathQuestionKeys = strategy.required_questions.filter((entry) => entry !== "sibling_variants");
  const questions = criticalPaths.map((entry, index) => ({
    id: `QUESTION-quality-${contextSequence}-${index}`,
    question_key: pathQuestionKeys[index % pathQuestionKeys.length],
    statement: `The negative path for ${entry.id} preserves the declared invariant.`,
    expected_observation: "The negative path is rejected without an unexpected side effect.",
    actual_observation: "The bounded regression path rejected the invalid input.",
    status: "confirmed",
    receipt_ids: receiptIds,
    impact_if_wrong: "high",
    next_action: null,
    applied_update_ids: [],
    applied_update_fingerprint: null,
  }));
  if (strategy.requires_sibling_variant_discovery) questions.push({
    id: `QUESTION-quality-${contextSequence}-sibling`,
    question_key: "sibling_variants",
    statement: "Applicable sibling variants use the same corrected owner.",
    expected_observation: "No sibling retains the root defect.",
    actual_observation: "The bounded sibling scan found no missed variant.",
    status: "confirmed",
    receipt_ids: receiptIds,
    impact_if_wrong: "high",
    next_action: null,
    applied_update_ids: [],
    applied_update_fingerprint: null,
  });
  for (const [index, questionKey] of strategy.required_questions.entries()) {
    if (questions.some((entry) => entry.question_key === questionKey)) continue;
    questions.push({
      id: `QUESTION-quality-${contextSequence}-required-${index}`,
      question_key: questionKey,
      statement: `The ${questionKey} assumption matches the bounded quality fixture.`,
      expected_observation: `Runner evidence resolves ${questionKey}.`,
      actual_observation: `The linked receipt and verification plan resolve ${questionKey}.`,
      status: "confirmed",
      receipt_ids: receiptIds,
      impact_if_wrong: "high",
      next_action: null,
      applied_update_ids: [],
      applied_update_fingerprint: null,
    });
  }
  const invariantId = dossier.invariants[0]?.id;
  const edgeCaseId = dossier.edge_cases[0]?.id;
  const failureModeId = dossier.failure_modes[0]?.id;
  const testObligationId = dossier.test_obligations[0]?.id;
  const deepAnalyses = criticalPaths.map((entry, index) => ({
    id: `DEEP-quality-${contextSequence}-${index}`,
    impact_path_id: entry.id,
    node_ids: entry.node_ids,
    edge_ids: entry.edge_ids,
    symbol_ids: ["quality-fixture"],
    inputs: ["bounded fixture input"],
    outputs: ["verified fixture result"],
    dimensions: strategy.required_deep_dimensions.map((dimension) => ({
      dimension,
      classification: "applicable",
      analysis: `${dimension} is covered by the linked fixture obligation.`,
      not_applicable_reason: null,
      receipt_ids: receiptIds,
      verification_ids: [testObligationId],
    })),
    falsification_question_id: questions[index].id,
    invariant_ids: [invariantId],
    edge_case_ids: [edgeCaseId],
    failure_mode_ids: [failureModeId],
    test_obligation_ids: [testObligationId],
    unresolved_question_ids: [],
    receipt_ids: receiptIds,
  }));
  return {
    wide_analysis: wideAnalysis,
    claims,
    deep_analyses: deepAnalyses,
    questions,
    task_evidence: {
      owning_abstraction_claim_id: ["bug_fix", "diagnosis_driven_implementation"].includes(strategy.task_profile) ? claims[0].id : null,
      sibling_variant_question_ids: strategy.requires_sibling_variant_discovery ? [questions.find((entry) => entry.question_key === "sibling_variants").id] : [],
      characterization_test_ids: strategy.requires_characterization ? [testObligationId] : [],
      negative_path_ids: strategy.requires_negative_path ? [edgeCaseId] : [],
      compatibility_ids: strategy.requires_compatibility ? [invariantId] : [],
      reproduction_status: strategy.requires_pre_change_reproduction ? "reproduced" : "not_required",
      reproduction_evidence_ids: strategy.requires_pre_change_reproduction ? [testObligationId] : [],
    },
    tool_state: {
      minimal_available: ["context_files", "context_outline", "context_read", "context_search"],
      advanced_available: ["context_batch_read"],
      advanced_unavailable: ["context_map", "context_symbols", "context_related"],
      unsupported_schema_tools: [],
      fallback_used: false,
      reduced_semantic_coverage: true,
      semantic_completeness_claimed: false,
      unresolved_truncation_receipt_ids: [],
    },
    budget_state: {
      context_calls_used: receipts.length,
      context_calls_max: strategy.budgets.max_context_calls,
      read_only_subagents_used: 0,
      read_only_subagents_max: strategy.budgets.max_read_only_subagents,
      exhausted: false,
      unresolved_area: null,
    },
  };
}

function recordSufficientTestContext(session, dossier, { record = true } = {}) {
  contextSequence += 1;
  const strategy = selectMinimumContextStrategy({
    risk_class: dossier.risk_class,
    task_type: dossier.task_type,
  });
  const sessionKey = fingerprint({ purpose: "quality-session", sequence: contextSequence }).slice("sha256:".length);
  let receipts = [];
  let report = null;
  let standardSummary = null;
  if (dossier.risk_class === "standard-lite") {
    const receipt = contextTestReceipt({
      receiptId: `CTXRECEIPT-quality-${contextSequence}`,
      sequence: 1,
      dossier,
      workspaceFingerprint: FP_A,
      sessionKey,
      toolId: "context_read",
      observedPaths: [dossier.affected_areas[0]?.path ?? "lib/app.mjs"],
      startedAt: "2026-07-13T00:00:30Z",
      completedAt: "2026-07-13T00:01:00Z",
    });
    receipts = [receipt];
    standardSummary = createStandardLiteContextSummary({
      summary_id: `CTXLOCAL-quality-${contextSequence}`,
      session_key: sessionKey,
      strategy_binding: strategy,
      workspace_fingerprint: FP_A,
      dossier,
      receipt_ids: [receipt.receipt_id],
      inspected_paths: [dossier.affected_areas[0]?.path ?? "lib/app.mjs"],
      context_calls: 1,
      finalized_at: "2026-07-13T00:02:00Z",
    });
  } else {
    receipts = contextReceiptForDossier(dossier, contextSequence);
    const draft = createWholeSystemContextReportDraft({
      report_id: `CONTEXT-quality-${contextSequence}`,
      session_key: sessionKey,
      strategy_binding: strategy,
      workspace_fingerprint: FP_A,
      dossier,
      created_at: "2026-07-13T00:01:00Z",
      content: fullContextContent(strategy, dossier, receipts),
    });
    report = finalizeWholeSystemContextReport(draft, {
      finalized_at: "2026-07-13T00:02:00Z",
      strategy_binding: strategy,
      workspace_fingerprint: FP_A,
      dossier,
      receipt_index: { receipts },
    });
  }
  const decision = evaluateContextSufficiency({
    decision_id: `CTXDEC-quality-${contextSequence}`,
    session_key: sessionKey,
    strategy_binding: strategy,
    dossier,
    workspace_fingerprint: FP_A,
    receipt_index: { receipts },
    report,
    standard_lite_summary: standardSummary,
    task_profile_evidence: contextTestTaskProfileEvidence({
      dossier,
      sessionKey,
      workspaceFingerprint: FP_A,
      evidenceId: `CTXPROFILE-quality-${contextSequence}`,
      completedAt: "2026-07-13T00:01:15Z",
      createdAt: "2026-07-13T00:01:30Z",
    }),
    evaluated_at: "2026-07-13T00:03:00Z",
  });
  assert.equal(decision.status, "sufficient", JSON.stringify(decision.reasons));
  contextReportsByDecisionId.set(decision.decision_id, report);
  const receiptIndex = createContextReceiptEvidenceIndex({ receipts }, {
    session_key: sessionKey,
    run_id: dossier.run_id,
    task_id: dossier.task_id,
    source_fingerprint: FP_A,
  });
  if (!record) return { decision, receipt_index: receiptIndex, report };
  sessionRecordContextDecision(session, { decision, receipt_index: receiptIndex, report });
  return decision;
}

function createPassedTestReconciliation(decision, dossier, finalWorkspaceFingerprint, changedPaths = ["lib/app.mjs"]) {
  const verifiedTestObligation = dossier.test_obligations.find((entry) => (
    entry.required === true && ["slice", "integration"].includes(entry.phase)
  ));
  assert(verifiedTestObligation, "fixture requires a mandatory post-mutation test obligation");
  const mappedPaths = changedPaths.map((entry) => ({
    path: entry,
    kind: "source",
    ownership_ids: [dossier.implementation_slices[0]?.id ?? "SLICE-quality"],
    context_subject_ids: [dossier.impact_graph?.affected_paths[0]?.id ?? dossier.affected_areas[0]?.id ?? "AREA-quality"],
    test_obligation_ids: [verifiedTestObligation.id],
  }));
  const finalDiffFingerprint = fingerprint({
    changed_paths: mappedPaths,
    unexpected_public_contracts: [],
    unexpected_dependency_directions: [],
    unexpected_side_effect_edges: [],
    unrelated_paths: [],
    unplanned_items: [],
  });
  const reviewerEvidence = createReviewerReconciliationEvidence({
    reviewer_result_id: `reviewer-quality-${contextSequence}`,
    session_key: decision.session_key,
    context_decision: decision,
    final_workspace_fingerprint: finalWorkspaceFingerprint,
    final_diff_fingerprint: finalDiffFingerprint,
    changed_paths: mappedPaths,
    checks: Object.fromEntries([
      "changed_path_ownership", "public_contracts", "dependency_directions", "side_effect_edges", "critical_path_tests", "unrelated_changes",
    ].map((key) => [key, { status: "passed", finding_ids: [] }])),
    unplanned_item_ids: [],
    completed_at: "2026-07-13T00:04:00Z",
  });
  const reconciliation = reconcileFinalBlastRadius({
    reconciliation_id: `CTXREC-quality-${contextSequence}`,
    session_key: decision.session_key,
    context_decision: decision,
    dossier,
    context_report: contextReportsByDecisionId.get(decision.decision_id) ?? null,
    final_workspace_fingerprint: finalWorkspaceFingerprint,
    changed_paths: mappedPaths,
    verified_post_mutation_test_obligation_ids: [verifiedTestObligation.id],
    evidence_mode: "reviewer_grounded",
    reviewer_evidence: reviewerEvidence,
    reconciled_at: "2026-07-13T00:04:30Z",
  });
  assert.equal(reconciliation.status, "passed", JSON.stringify(reconciliation.reason_codes));
  return reconciliation;
}

function recordPassedTestReconciliation(session, decision, dossier, finalWorkspaceFingerprint, changedPaths = ["lib/app.mjs"]) {
  const reconciliation = createPassedTestReconciliation(decision, dossier, finalWorkspaceFingerprint, changedPaths);
  sessionRecordContextReconciliation(session, reconciliation);
  return reconciliation;
}

function mapping(classification, overrides = {}) {
  return {
    classification,
    check_ids: [],
    mechanism_ids: [],
    evidence_refs: [],
    rationale: null,
    blocked_reason: null,
    external_dependency: null,
    ...overrides,
  };
}

function dossierContent(overrides = {}) {
  return {
    task_type: "maintenance",
    user_visible_goal: "Keep the bounded quality contract correct and inspectable.",
    task_shape: {
      summary: "bounded-quality-change",
      starting_commit: START_COMMIT,
      worktree_state: "clean",
      instruction_sources: ["AGENTS.md", "docs/trace-contract.md"],
      skill_ids: ["global-quality-gates"],
      constraints: ["preserve-unrelated-work", "publish-after-teardown"],
      non_goals: ["external-publication"],
    },
    behavior_contract: {
      status: "defined",
      requested_behavior: "enforce-preimplementation-quality-gate",
      positive_behavior: ["valid-dossier-enables-bounded-implementation"],
      negative_behavior: ["invalid-dossier-remains-blocked"],
      boundary_behavior: ["only-declared-write-scope-is-authorized"],
      error_behavior: ["contract-errors-use-stable-codes"],
      ordering_and_side_effects: ["gate-precedes-first-implementation-action"],
      preserved_behavior: ["trace-v1-readability", "trace-v2-writer"],
      compatibility_requirements: ["strict-schema-dispatch"],
      security_requirements: ["bounded-persistence"],
      completion_requirements: ["targeted-check", "integration-check"],
    },
    compatibility_contract: {
      status: "defined",
      default_decision: "preserve",
      rationale: "existing trace and feedback contracts remain readable",
      evidence_refs: [{ kind: "file", value: "lib/app.mjs" }],
    },
    public_contracts: [{
      id: "CONTRACT-main",
      kind: "public_api",
      path: "lib/app.mjs",
      owner: "quality-plane",
      compatibility_decision: "preserve",
      evidence_refs: [{ kind: "file", value: "lib/app.mjs" }],
    }],
    system_boundaries: [
      {
        id: "SYSBOUNDARY-caller",
        category: "caller",
        path: "lib/app.mjs",
        status: "resolved",
        rationale: "public entry owns the call",
        evidence_refs: [{ kind: "file", value: "lib/app.mjs" }],
      },
      {
        id: "SYSBOUNDARY-data",
        category: "data_path",
        path: null,
        status: "not_applicable",
        rationale: "the bounded verifier has no serialized data path",
        evidence_refs: [],
      },
    ],
    affected_areas: [{
      id: "AREA-main",
      path: "lib/app.mjs",
      node_kind: "file",
      reason: "bounded-entry",
      confidence: "observed",
      evidence_refs: [{ kind: "file", value: "lib/app.mjs" }],
    }],
    entry_points: [{
      id: "ENTRY-main",
      path: "lib/app.mjs",
      symbol: "run",
      reason: "public-entry",
      evidence_refs: [{ kind: "file", value: "lib/app.mjs" }],
    }],
    call_paths: [],
    data_shapes: [],
    invariants: [{
      id: "INV-preserve",
      statement: "existing-contract-remains-valid",
      scope_ids: ["AREA-main"],
      mapping: mapping("applicable_directly_tested", { check_ids: ["quality-unit"] }),
    }],
    edge_cases: [{
      id: "EDGE-empty",
      category: "null_absent_empty_malformed_unsupported",
      condition: "empty-optional-input",
      expected_behavior: "bounded-default-applies",
      scope_ids: ["ENTRY-main"],
      mapping: mapping("not_applicable", { rationale: "constructor-default-covers-input" }),
    }],
    failure_modes: [{
      id: "FAIL-conflict",
      category: "partial_success_partial_failure",
      trigger: "revision-conflict",
      impact: "stale-update-rejected",
      expected_handling: "stable-contract-error",
      scope_ids: ["AREA-main"],
      mapping: mapping("applicable_verified_by_other_mechanism", { mechanism_ids: ["contract-review"] }),
    }],
    premortem_matrix: [
      {
        id: "PREMORTEM-inputs",
        category: "null_absent_empty_malformed_unsupported",
        subject_ids: [],
        mapping: mapping("not_applicable", { rationale: "constructor-default-covers-input" }),
      },
      {
        id: "PREMORTEM-partial",
        category: "partial_success_partial_failure",
        subject_ids: ["FAIL-conflict"],
        mapping: mapping("applicable_verified_by_other_mechanism", { mechanism_ids: ["contract-review"] }),
      },
    ],
    counterexamples: [],
    test_obligations: [
      {
        id: "TEST-unit",
        check_id: "quality-unit",
        kind: "command",
        phase: "slice",
        scope_ids: ["AREA-main"],
        command_or_mechanism: "quality-unit-command",
        required: true,
        trusted_producer: "opencode-harness-quality-verifier",
      },
      {
        id: "TEST-integration",
        check_id: "quality-integration",
        kind: "command",
        phase: "integration",
        scope_ids: ["AREA-main"],
        command_or_mechanism: "quality-integration-command",
        required: true,
        trusted_producer: "opencode-harness-quality-verifier",
      },
    ],
    specialized_checks: [],
    assumptions: [{
      id: "ASSUME-local",
      statement: "local-runtime-is-deterministic",
      validation_plan: "execute-targeted-check",
      owner: "root-agent",
      status: "validated",
    }],
    unknowns: [],
    subagent_handoffs: [],
    implementation_slices: [{
      id: "SLICE-main",
      owner: "root-agent",
      intent: "implementation",
      write_scope: ["lib/app.mjs"],
      concurrent_group: null,
      depends_on_slice_ids: [],
      invariant_ids: ["INV-preserve"],
      verification_check_ids: ["quality-unit", "quality-integration"],
    }],
    impact_graph: null,
    architecture_assessment: {
      policy_id: null,
      status: "not_configured",
      evaluation_id: null,
      violation_ids: [],
      notes: null,
    },
    context_coverage: {
      status: "complete",
      affected_area_ids: ["AREA-main"],
      covered_area_ids: ["AREA-main"],
      truncated_area_ids: [],
      accepted_gap_ids: [],
      evidence_refs: [{ kind: "file", value: "lib/app.mjs" }],
    },
    verification_plan: {
      baseline_check_ids: [],
      slice_check_ids: ["quality-unit"],
      integration_check_ids: ["quality-integration"],
      architecture_check_ids: [],
      regression_check_ids: ["quality-integration"],
      hidden_check_ids: [],
      truncated_check_ids: [],
      evidence_refs: [{ kind: "check", value: "quality-integration" }],
    },
    rollback_recovery: {
      rollback_expectation: "no persistent state is changed",
      recovery_expectation: "retry starts from the unchanged input",
      mapping: mapping("not_applicable", { rationale: "bounded pure verifier change has no persistent mutation" }),
    },
    plan_challenge: { architect_result_id: null, reviewer_result_id: null, blockers: [], evidence_refs: [] },
    gate_state: { status: "not_evaluated", gate_id: null, reason_codes: [] },
    verification_boundary: {
      check_ids: ["quality-unit", "quality-integration"],
      mechanism_ids: ["contract-review"],
      ownership_paths: ["lib/app.mjs"],
      integration_check_ids: ["quality-integration"],
    },
    ...overrides,
  };
}

function finalizedDossier(overrides = {}) {
  const draft = createEngineeringDossierDraft({
    dossier_id: overrides.dossier_id ?? "dossier-quality",
    run_id: overrides.run_id ?? "run-quality",
    task_id: overrides.task_id ?? "task-quality",
    risk_class: overrides.risk_class ?? "standard-lite",
    mode: overrides.mode ?? "standard-lite",
    task_type: overrides.task_type ?? "maintenance",
    user_visible_goal: overrides.user_visible_goal ?? "Keep the bounded quality contract correct and inspectable.",
    starting_commit: START_COMMIT,
    created_at: "2026-07-13T00:00:00Z",
  });
  const updated = updateEngineeringDossierDraft(draft, {
    expected_revision: 1,
    updated_at: "2026-07-13T00:01:00Z",
    patch: dossierContent(overrides.content ?? {}),
  });
  return finalizeEngineeringDossier(updated, { finalized_at: "2026-07-13T00:02:00Z" });
}

function finalizedStandardLiteDossier(taskType) {
  const registration = {
    risk_class: "standard-lite",
    lifecycle: "standard_lite",
    task_type: taskType,
    required_check_ids: ["quality-integration"],
    ownership_paths: ["lib/app.mjs"],
    agent_name: "orchestrator",
    run_id: `run-standard-lite-${taskType}`,
    task_id: `task-standard-lite-${taskType}`,
    user_visible_goal: `Complete bounded ${taskType} work.`,
    classification_rationale: "single bounded local ownership with trusted integration verification",
    behavior_expectation: "the bounded behavior remains correct",
    expected_preserved_behavior: ["unrelated behavior remains unchanged"],
    known_local_edge_cases: ["stale or failed verification remains blocked"],
    ...(taskType === "bug_fix" ? {
      reproduction_contract: {
        check_id: "quality-integration",
        expected_pre_fix: "failing_reproducer",
        expected_post_fix: "passing_regression",
        unavailable_reason: null,
        uncertainty_material: false,
      },
    } : {}),
    initial_workspace: { entries: [] },
    classification_workspace: { head_sha: START_COMMIT },
  };
  const content = standardLiteDossierRequest(registration, {
    trustedProducer: "opencode-harness-quality-verifier",
  });
  const draft = createEngineeringDossierDraft({
    dossier_id: `dossier-standard-lite-${taskType}`,
    run_id: registration.run_id,
    task_id: registration.task_id,
    starting_commit: START_COMMIT,
    created_at: "2026-07-13T00:00:00Z",
    ...content,
  });
  return finalizeEngineeringDossier(draft, { finalized_at: "2026-07-13T00:02:00Z" });
}

function impactBoundary(category, references = {}, rationale = null) {
  return {
    id: `BOUNDARY-${category}`,
    category,
    classification: rationale === null ? "represented" : "reasoned_excluded",
    node_ids: references.node_ids ?? [],
    edge_ids: references.edge_ids ?? [],
    path_ids: references.path_ids ?? [],
    unknown_ids: references.unknown_ids ?? [],
    excluded_sibling_ids: references.excluded_sibling_ids ?? [],
    rationale,
    evidence_refs: [{ kind: "file", value: "lib/app.mjs" }],
  };
}

function fullImpactGraph(riskClass) {
  const boundaryByCategory = {
    direct_affected_paths: impactBoundary("direct_affected_paths", { path_ids: ["BLAST-direct"] }),
    transitive_affected_paths: impactBoundary("transitive_affected_paths", { path_ids: ["BLAST-transitive"] }),
    externally_reachable_entry_points: impactBoundary("externally_reachable_entry_points", { node_ids: ["NODE-entry"] }),
    downstream_state_or_side_effects: impactBoundary("downstream_state_or_side_effects", {
      node_ids: ["NODE-store"],
      edge_ids: ["EDGE-service-store"],
    }),
    cross_boundary_contracts: impactBoundary("cross_boundary_contracts", {
      node_ids: ["NODE-entry", "NODE-store"],
      edge_ids: ["EDGE-entry-service", "EDGE-service-store"],
    }),
    critical_path_tests: impactBoundary("critical_path_tests", {
      node_ids: ["NODE-test"],
      path_ids: ["BLAST-direct", "BLAST-transitive"],
    }),
    relevant_unknown_paths: impactBoundary("relevant_unknown_paths", {}, "bounded mapping found no unresolved relevant path"),
    excluded_sibling_paths: impactBoundary("excluded_sibling_paths", { excluded_sibling_ids: ["EXCLUDED-docs"] }),
  };
  const evidence = [{ kind: "file", value: "lib/app.mjs" }];
  return buildEngineeringImpactGraph({
    graph_id: `GRAPH-${riskClass}`,
    risk_class: riskClass,
    nodes: [
      { id: "NODE-entry", kind: "public_api", path: "lib/app.mjs", symbol: "run", label: "public entry", boundary: "entry_point", confidence: "observed", coverage: "complete", evidence_refs: evidence },
      { id: "NODE-service", kind: "module", path: "lib/service.mjs", symbol: "apply", label: "service", boundary: "module", confidence: "observed", coverage: "complete", evidence_refs: evidence },
      { id: "NODE-store", kind: "data_store", path: "lib/store.mjs", symbol: "write", label: "state store", boundary: "persistence", confidence: "observed", coverage: "complete", evidence_refs: evidence },
      { id: "NODE-test", kind: "test", path: "scripts/verify-engineering-quality.mjs", symbol: null, label: "integration verifier", boundary: "operational", confidence: "observed", coverage: "complete", evidence_refs: [{ kind: "file", value: "scripts/verify-engineering-quality.mjs" }] },
    ],
    edges: [
      { id: "EDGE-entry-service", from: "NODE-entry", to: "NODE-service", relationship: "calls", confidence: "observed", coverage: "complete", evidence_refs: evidence },
      { id: "EDGE-service-store", from: "NODE-service", to: "NODE-store", relationship: "writes", confidence: "observed", coverage: "complete", evidence_refs: evidence },
      { id: "EDGE-test-service", from: "NODE-test", to: "NODE-service", relationship: "verifies", confidence: "observed", coverage: "complete", evidence_refs: [{ kind: "file", value: "scripts/verify-engineering-quality.mjs" }] },
    ],
    affected_paths: [
      { id: "BLAST-direct", kind: "direct", node_ids: ["NODE-entry", "NODE-service"], edge_ids: ["EDGE-entry-service"], critical: true, verification_node_ids: ["NODE-test"], confidence: "observed", evidence_refs: evidence },
      { id: "BLAST-transitive", kind: "transitive", node_ids: ["NODE-entry", "NODE-service", "NODE-store"], edge_ids: ["EDGE-entry-service", "EDGE-service-store"], critical: true, verification_node_ids: ["NODE-test"], confidence: "observed", evidence_refs: evidence },
    ],
    excluded_siblings: [{ id: "EXCLUDED-docs", path: "docs", reason: "no runtime dependency reaches documentation", confidence: "observed", evidence_refs: [{ kind: "file", value: "docs/harness-map.md" }] }],
    unknowns: [],
    coverage: {
      completeness: "complete",
      semantic_tool_status: "unavailable",
      semantic_tools: [],
      fallback_tools: ["rg", "bounded-read"],
      reduced_semantic_coverage: true,
      truncated: false,
      truncation_reason: null,
      available_evaluator_ids: ["quality-impact-test"],
      unavailable_evaluator_ids: [],
      boundaries: IMPACT_BOUNDARY_CATEGORIES.map((category) => boundaryByCategory[category]),
      evidence_refs: [{ kind: "check", value: "quality-impact-test" }],
    },
  });
}

function architectureGraph(graphId, { riskClass = "standard-lite", forbiddenImport = false } = {}) {
  const input = JSON.parse(JSON.stringify(engineeringImpactGraphFingerprintInput(fullImpactGraph(riskClass))));
  delete input.schema_version;
  input.graph_id = graphId;
  input.coverage.available_evaluator_ids = ["dependency-graph-v1"];
  input.coverage.evidence_refs = [{ kind: "check", value: "dependency-graph-v1" }];
  if (forbiddenImport) {
    input.nodes.push({
      id: "NODE-forbidden",
      kind: "module",
      path: "lib/forbidden.mjs",
      symbol: null,
      label: "forbidden layer",
      boundary: "module",
      confidence: "observed",
      coverage: "complete",
      evidence_refs: [{ kind: "file", value: "lib/forbidden.mjs" }],
    });
    input.edges.push({
      id: "EDGE-forbidden-import",
      from: "NODE-entry",
      to: "NODE-forbidden",
      relationship: "imports",
      confidence: "observed",
      coverage: "complete",
      evidence_refs: [{ kind: "file", value: "lib/app.mjs" }],
    });
  }
  return buildEngineeringImpactGraph(input);
}

function architecturePolicy() {
  return buildArchitecturePolicy({
    policy_id: "ARCHPOLICY-bundle",
    enforce_existing: false,
    required_evaluator_ids: ["dependency-graph-v1"],
    rules: [{
      id: "ARCHRULE-no-forbidden",
      kind: "deny_dependency",
      source: { type: "exact_path", value: "lib/app.mjs" },
      target: { type: "exact_path", value: "lib/forbidden.mjs" },
      relationship_kinds: ["imports"],
      evaluator_id: "dependency-graph-v1",
      rationale: "the public entry must not import the forbidden layer",
    }],
  });
}

function fullDossierContent(riskClass) {
  const base = dossierContent();
  const categorySubjects = new Map([
    [base.edge_cases[0].category, [base.edge_cases[0].id]],
    [base.failure_modes[0].category, [base.failure_modes[0].id]],
  ]);
  const extraTests = [{
    id: "TEST-baseline",
    check_id: "quality-baseline",
    kind: "characterization",
    phase: "preimplementation",
    scope_ids: ["AREA-main"],
    command_or_mechanism: "quality-baseline-command",
    required: true,
    trusted_producer: "opencode-harness-quality-verifier",
  }];
  if (riskClass === "critical") {
    extraTests.push(
      { id: "TEST-negative", check_id: "quality-negative", kind: "negative_path", phase: "integration", scope_ids: ["AREA-main"], command_or_mechanism: "quality-negative-command", required: true, trusted_producer: "opencode-harness-quality-verifier" },
      { id: "TEST-rollback", check_id: "quality-rollback", kind: "rollback_recovery", phase: "integration", scope_ids: ["AREA-main"], command_or_mechanism: "quality-rollback-command", required: true, trusted_producer: "opencode-harness-quality-verifier" },
    );
  }
  const direct = (checkId) => mapping("applicable_directly_tested", { check_ids: [checkId] });
  return {
    ...base,
    call_paths: [{ id: "PATH-main", steps: ["ENTRY-main", "AREA-main"], confidence: "observed", evidence_refs: [{ kind: "file", value: "lib/app.mjs" }] }],
    system_boundaries: [
      ["caller", "lib/app.mjs", "public caller is mapped"],
      ["callee", "lib/service.mjs", "direct callee is mapped"],
      ["state", "lib/store.mjs", "state owner is mapped"],
      ["data_path", "lib/store.mjs", "transitive data path is mapped"],
      ["architecture_layer", "lib/service.mjs", "service layer is mapped"],
      ["ownership", "lib/app.mjs", "write owner is explicit"],
    ].map(([category, boundaryPath, rationale]) => ({
      id: `SYSBOUNDARY-${category}`,
      category,
      path: boundaryPath,
      status: "resolved",
      rationale,
      evidence_refs: [{ kind: "file", value: boundaryPath }],
    })),
    premortem_matrix: PREMORTEM_CATEGORIES.map((category) => {
      const subjectIds = categorySubjects.get(category) ?? [];
      return {
        id: `PREMORTEM-${category}`,
        category,
        subject_ids: subjectIds,
        mapping: subjectIds.length > 0
          ? direct("quality-unit")
          : mapping("not_applicable", { rationale: `bounded evidence excludes ${category}` }),
      };
    }),
    counterexamples: [{
      id: "COUNTEREXAMPLE-bypass",
      statement: "an implementation action before a passed gate must be rejected",
      expected_behavior: "the session latches QUALITY_PRE_GATE_VIOLATION",
      scope_ids: ["AREA-main"],
      mapping: direct("quality-baseline"),
    }],
    test_obligations: [...base.test_obligations, ...extraTests],
    specialized_checks: [
      { id: "SPECIAL-architecture", category: "architecture", mapping: direct("quality-integration") },
      { id: "SPECIAL-compatibility", category: "compatibility", mapping: direct("quality-integration") },
      ...(riskClass === "critical" ? [
        { id: "SPECIAL-security", category: "security", mapping: direct("quality-negative") },
        { id: "SPECIAL-data-integrity", category: "data_integrity", mapping: direct("quality-rollback") },
        { id: "SPECIAL-rollback", category: "rollback_recovery", mapping: direct("quality-rollback") },
        { id: "SPECIAL-negative", category: "negative_path", mapping: direct("quality-negative") },
      ] : []),
    ],
    impact_graph: fullImpactGraph(riskClass),
    verification_plan: {
      ...base.verification_plan,
      baseline_check_ids: ["quality-baseline"],
      architecture_check_ids: ["quality-integration"],
      regression_check_ids: ["quality-integration"],
      integration_check_ids: riskClass === "critical"
        ? ["quality-integration", "quality-negative", "quality-rollback"]
        : ["quality-integration"],
    },
    verification_boundary: {
      ...base.verification_boundary,
      check_ids: riskClass === "critical"
        ? ["quality-unit", "quality-integration", "quality-baseline", "quality-negative", "quality-rollback"]
        : ["quality-unit", "quality-integration", "quality-baseline"],
      integration_check_ids: riskClass === "critical"
        ? ["quality-integration", "quality-negative", "quality-rollback"]
        : ["quality-integration"],
    },
    rollback_recovery: riskClass === "critical" ? {
      rollback_expectation: "failed writes restore the pre-change state",
      recovery_expectation: "restart is idempotent after rollback",
      mapping: direct("quality-rollback"),
    } : base.rollback_recovery,
    plan_challenge: {
      architect_result_id: "architect-quality-plan",
      reviewer_result_id: "reviewer-quality-plan",
      blockers: [{ id: "BLOCKER-test-design", severity: "medium", status: "resolved", summary: "integration boundary was added", evidence_refs: [{ kind: "check", value: "quality-integration" }] }],
      evidence_refs: [{ kind: "check", value: "quality-integration" }],
    },
  };
}

function catalog(overrides = {}) {
  return createEngineeringCheckCatalog({
    catalog_id: "catalog-quality",
    checks: [
      { check_id: "quality-unit", trusted_producer: "opencode-harness-quality-verifier", phases: ["slice"], available: true },
      { check_id: "quality-integration", trusted_producer: "opencode-harness-quality-verifier", phases: ["preimplementation", "integration"], available: true },
      { check_id: "quality-baseline", trusted_producer: "opencode-harness-quality-verifier", phases: ["preimplementation"], available: true },
      { check_id: "quality-negative", trusted_producer: "opencode-harness-quality-verifier", phases: ["integration"], available: true },
      { check_id: "quality-rollback", trusted_producer: "opencode-harness-quality-verifier", phases: ["integration"], available: true },
    ],
    mechanisms: [
      { mechanism_id: "contract-review", trusted_producer: "opencode-harness-quality-verifier", phases: ["preimplementation"], available: true },
    ],
    ...overrides,
  });
}

function preimplementationEvidence(dossier, overrides = {}) {
  const obligations = new Map(dossier.test_obligations
    .filter((entry) => entry.phase === "preimplementation")
    .map((entry) => [entry.check_id, entry]));
  const baselineReceipts = requiredEngineeringVerificationTargets(dossier).preimplementationCheckIds.map((checkId, index) => {
    const obligation = obligations.get(checkId);
    return {
      receipt_id: `baseline-receipt-${index + 1}`,
      check_id: checkId,
      trusted_producer: obligation?.trusted_producer ?? "opencode-harness-quality-verifier",
      phase: "preimplementation",
      status: "passed",
      command_or_mechanism: obligation?.command_or_mechanism ?? "missing-baseline-command",
      evidence_fingerprint: FP_A,
      completed_at: "2026-07-13T00:02:00Z",
    };
  });
  const planChallengeReceipts = ["high", "critical"].includes(dossier.risk_class)
    ? [
      {
        receipt_id: "plan-receipt-architect",
        result_id: dossier.plan_challenge.architect_result_id ?? "missing-architect-result",
        role: "architect",
        mechanism_id: "contract-review",
        trusted_producer: "opencode-harness-quality-verifier",
        phase: "preimplementation",
        status: "passed",
        evidence_fingerprint: FP_C,
        completed_at: "2026-07-13T00:02:00Z",
      },
      {
        receipt_id: "plan-receipt-reviewer",
        result_id: dossier.plan_challenge.reviewer_result_id ?? "missing-reviewer-result",
        role: "reviewer",
        mechanism_id: "contract-review",
        trusted_producer: "opencode-harness-quality-verifier",
        phase: "preimplementation",
        status: "passed",
        evidence_fingerprint: FP_D,
        completed_at: "2026-07-13T00:02:00Z",
      },
    ]
    : [];
  return createEngineeringPreimplementationEvidence({
    evidence_id: `preimplementation-${dossier.dossier_id}`,
    dossier_id: dossier.dossier_id,
    dossier_fingerprint: dossier.fingerprint,
    baseline_receipts: overrides.baseline_receipts ?? baselineReceipts,
    plan_challenge_receipts: overrides.plan_challenge_receipts ?? planChallengeReceipts,
  });
}

function passedGate(dossier, overrides = {}) {
  const requiresPreimplementationEvidence = ["high", "critical"].includes(dossier.risk_class)
    || requiredEngineeringVerificationTargets(dossier).preimplementationCheckIds.length > 0;
  return evaluateEngineeringGate({
    gate_id: overrides.gate_id ?? "gate-quality",
    dossier,
    check_catalog: overrides.check_catalog ?? catalog(),
    preimplementation_evidence: Object.hasOwn(overrides, "preimplementation_evidence")
      ? overrides.preimplementation_evidence
      : requiresPreimplementationEvidence ? preimplementationEvidence(dossier) : null,
    architecture_evaluation: overrides.architecture_evaluation ?? null,
    evaluated_at: "2026-07-13T00:03:00Z",
  });
}

function traceEvent(overrides = {}) {
  return {
    task_id: "task-quality",
    parent_task_id: null,
    agent: "orchestrator",
    event_type: "task_start",
    summary: "quality-run-event",
    tool_or_command: null,
    permission_decision: "not_applicable",
    files_read: [],
    files_written: [],
    evidence_refs: [],
    verification: null,
    status: "completed",
    risk: "high",
    termination_reason: null,
    hypothesis: null,
    expected_observation: null,
    actual_observation: null,
    context_snapshot: null,
    verifier_codes: [],
    strategy_id: "strategy-quality",
    ...overrides,
  };
}

function syntheticVerificationEvent({ runId, sequence, targetIds, timestamp = "2026-07-13T00:04:00Z" }) {
  return {
    schema_version: 2,
    event_id: `event-verification-${sequence}`,
    sequence,
    run_id: runId,
    task_id: "task-quality",
    event_type: "verification",
    status: "completed",
    timestamp,
    verification: { status: "passed", summary: "integration-passed", verifier_codes: [...targetIds] },
    verifier_codes: [...targetIds],
    truncation: {
      verifier_codes: { truncated: false },
      verification: { truncated: false },
    },
  };
}

function integratedEvidence({ dossier, gate, checkCatalog, traceEvent: event, workspaceFingerprint, overrides = {} }) {
  const obligations = new Map(dossier.test_obligations.map((entry) => [entry.check_id, entry]));
  const checks = dossier.verification_boundary.check_ids.map((checkId, index) => {
    const obligation = obligations.get(checkId);
    return {
      receipt_id: `integrated-check-${index + 1}`,
      check_id: checkId,
      trusted_producer: obligation.trusted_producer,
      phase: obligation.phase,
      status: "passed",
      command_or_mechanism: obligation.command_or_mechanism,
      evidence_fingerprint: obligation.phase === "preimplementation" ? FP_A : FP_B,
      completed_at: obligation.phase === "preimplementation" ? "2026-07-13T00:02:00Z" : event.timestamp,
    };
  });
  const mechanisms = dossier.verification_boundary.mechanism_ids.map((mechanismId, index) => {
    const catalogEntry = checkCatalog.mechanisms.find((entry) => entry.mechanism_id === mechanismId);
    return {
      receipt_id: `integrated-mechanism-${index + 1}`,
      mechanism_id: mechanismId,
      trusted_producer: catalogEntry.trusted_producer,
      phase: catalogEntry.phases[0],
      status: "passed",
      evidence_fingerprint: FP_C,
      completed_at: catalogEntry.phases[0] === "preimplementation" ? "2026-07-13T00:02:00Z" : event.timestamp,
    };
  });
  return createIntegratedVerificationEvidence({
    evidence_id: overrides.evidence_id ?? `integrated-${dossier.dossier_id}-${event.sequence}`,
    run_id: dossier.run_id,
    task_id: dossier.task_id,
    dossier_id: dossier.dossier_id,
    dossier_fingerprint: dossier.fingerprint,
    gate_id: gate.gate_id,
    gate_fingerprint: gate.fingerprint,
    check_catalog_fingerprint: checkCatalog.fingerprint,
    workspace_fingerprint: workspaceFingerprint,
    trace_event: event,
    check_receipts: overrides.check_receipts ?? checks,
    mechanism_receipts: overrides.mechanism_receipts ?? mechanisms,
    completed_at: event.timestamp,
  });
}

function completeTrace(staged, runId, targetIds) {
  staged.recordVerification(runId, {
    status: "passed",
    summary: "quality-integration-passed",
    checks: targetIds.map((targetId) => ({
      code: targetId,
      status: "passed",
      summary: "integration-passed",
      evidence_refs: [{ kind: "file", value: "scripts/verify-engineering-quality.mjs" }],
    })),
    evidence_refs: targetIds.map((targetId) => ({ kind: "check", value: targetId })),
    incomplete_reasons: [],
  });
  staged.appendEvent(runId, traceEvent({
    event_type: "task_end",
    summary: "quality-run-verified",
    status: "completed",
    termination_reason: "verified",
    verification: { status: "passed", summary: "integration-passed", verifier_codes: targetIds },
    verifier_codes: targetIds,
  }));
  staged.finalizeRun(runId, {
    status: "completed",
    termination_reason: "verified",
    summary: "quality-run-verified",
    evidence_refs: targetIds.map((targetId) => ({ kind: "check", value: targetId })),
  });
}

function preparedImplementationSession({ runId, dossierId, workspaceFingerprint = FP_B }) {
  const dossier = finalizedDossier({ dossier_id: dossierId, run_id: runId });
  const checkCatalog = catalog();
  const gate = passedGate(dossier, { gate_id: `gate-${runId}`, check_catalog: checkCatalog });
  const store = createEngineeringQualityStore({ run_id: runId, task_id: dossier.task_id });
  const session = createEngineeringQualitySession({ store, initial_workspace_fingerprint: FP_A });
  const contextDecision = recordSufficientTestContext(session, dossier);
  sessionRecordDossier(session, dossier);
  sessionLinkGate(session, {
    decision: gate,
    workspace_fingerprint: FP_A,
    append_trace: () => ({
      sequence: 2,
      evidence_refs: [{ kind: "file", value: "quality/gate.json" }],
      verifier_codes: ["QUALITY-GATE-PASSED"],
    }),
  });
  sessionAuthorizeAction(session, {
    kind: "edit",
    intent: "implementation",
    writable: true,
    write_scope: ["lib/app.mjs"],
  });
  sessionRecordImplementation(session, {
    first_sequence: 3,
    sequence: 3,
    workspace_fingerprint: workspaceFingerprint,
    files_written: ["lib/app.mjs"],
  });
  return { dossier, checkCatalog, gate, store, session, contextDecision };
}

test("dossier lifecycle is immutable, CAS-versioned, strict, and fingerprinted", () => {
  const draft = createEngineeringDossierDraft({
    dossier_id: "dossier-lifecycle",
    run_id: "run-lifecycle",
    task_id: "task-quality",
    risk_class: "standard-lite",
    mode: "standard-lite",
    task_type: "maintenance",
    user_visible_goal: "Verify the dossier lifecycle.",
    starting_commit: START_COMMIT,
    created_at: "2026-07-13T00:00:00Z",
  });
  assert.equal(draft.status, "draft");
  assert.equal(draft.fingerprint, null);
  assert.equal(Object.isFrozen(draft), true);
  assertContractError(() => updateEngineeringDossierDraft(draft, {
    expected_revision: 2,
    updated_at: "2026-07-13T00:01:00Z",
    patch: dossierContent(),
  }), "QUALITY_DOSSIER_REVISION_CONFLICT");
  const updated = updateEngineeringDossierDraft(draft, {
    expected_revision: 1,
    updated_at: "2026-07-13T00:01:00Z",
    patch: dossierContent(),
  });
  assert.equal(updated.revision, 2);
  const finalized = finalizeEngineeringDossier(updated, { finalized_at: "2026-07-13T00:02:00Z" });
  assert.equal(finalized.status, "finalized");
  assert.match(finalized.fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(finalizeEngineeringDossier(finalized, { finalized_at: finalized.finalized_at }), finalized);
  assertContractError(() => updateEngineeringDossierDraft(finalized, {
    expected_revision: 2,
    updated_at: "2026-07-13T00:03:00Z",
    patch: { unknowns: [] },
  }), "QUALITY_DOSSIER_FINALIZED");
  const tampered = JSON.parse(JSON.stringify(finalized));
  tampered.task_shape.summary = "tampered-value";
  assertContractError(() => validateEngineeringDossier(tampered), "QUALITY_DOSSIER_FINGERPRINT");
});

test("standard-lite supports every bounded task type with one operational check binding", () => {
  const expectedKinds = new Map([
    ["maintenance", ["unit"]],
    ["bug_fix", ["reproducer", "unit"]],
    ["behavior_preserving_refactor", ["characterization", "unit"]],
    ["new_feature", ["contract", "negative_path"]],
  ]);
  for (const [taskType, kinds] of expectedKinds) {
    const dossier = finalizedStandardLiteDossier(taskType);
    assert.equal(dossier.task_type, taskType);
    assert.deepEqual(dossier.test_obligations.map((entry) => entry.kind), kinds);
    assert.equal(new Set(dossier.test_obligations.map((entry) => entry.check_id)).size, 1);
    if (taskType === "bug_fix") {
      assert.deepEqual(dossier.test_obligations.map((entry) => entry.phase), ["preimplementation", "integration"]);
      assert.deepEqual(dossier.verification_plan.baseline_check_ids, ["quality-integration"]);
      assert.deepEqual(requiredEngineeringVerificationTargets(dossier).checkTargets, [
        { checkId: "quality-integration", phase: "preimplementation" },
        { checkId: "quality-integration", phase: "integration" },
      ]);
    }
    assert.equal(passedGate(dossier, { gate_id: `gate-standard-lite-${taskType}` }).status, "passed");
  }

  for (const taskType of ["migration", "security"]) {
    assertContractError(() => standardLiteDossierRequest({
      risk_class: "standard-lite",
      lifecycle: "standard_lite",
      task_type: taskType,
    }, { trustedProducer: "opencode-harness-quality-verifier" }), "QUALITY_STANDARD_LITE_SCOPE_EXCEEDED");
  }
});

test("multi-obligation checks require unique semantic kinds and one immutable operational binding", () => {
  const compatible = dossierContent();
  compatible.test_obligations = [
    ...compatible.test_obligations,
    {
      ...compatible.test_obligations[0],
      id: "TEST-unit-second-kind",
      kind: "unit",
    },
  ];
  const accepted = finalizedDossier({
    dossier_id: "dossier-compatible-multi-obligation",
    content: compatible,
  });
  assert.equal(accepted.test_obligations.filter((entry) => entry.check_id === "quality-unit").length, 2);
  assert.equal(requiredEngineeringVerificationTargets(accepted).checkIds.filter((entry) => entry === "quality-unit").length, 1);

  const conflicting = dossierContent();
  conflicting.test_obligations = [
    ...conflicting.test_obligations,
    {
      ...conflicting.test_obligations[0],
      id: "TEST-unit-conflicting-binding",
      kind: "unit",
      command_or_mechanism: "substituted-command",
    },
  ];
  assertContractError(() => finalizedDossier({
    dossier_id: "dossier-conflicting-multi-obligation",
    content: conflicting,
  }), "QUALITY_CHECK_BINDING_CONFLICT");

  const duplicateKind = dossierContent();
  duplicateKind.test_obligations = [
    ...duplicateKind.test_obligations,
    {
      ...duplicateKind.test_obligations[0],
      id: "TEST-unit-duplicate-kind",
    },
  ];
  assertContractError(() => finalizedDossier({
    dossier_id: "dossier-duplicate-obligation-kind",
    content: duplicateKind,
  }), "QUALITY_DUPLICATE_CHECK_KIND");
});

test("dossier rejects dangling mappings, contradictory classifications, unsafe content, and path drift", () => {
  assertContractError(() => finalizedDossier({ content: {
    invariants: [{
      id: "INV-dangling",
      statement: "dangling-check-is-rejected",
      scope_ids: ["AREA-main"],
      mapping: mapping("applicable_directly_tested", { check_ids: ["missing-check"] }),
    }],
  } }), "QUALITY_DANGLING_CHECK");
  assertContractError(() => finalizedDossier({ content: {
    edge_cases: [{
      id: "EDGE-empty",
      category: "null_absent_empty_malformed_unsupported",
      condition: "conflicting-mapping",
      expected_behavior: "rejected",
      scope_ids: ["AREA-main"],
      mapping: mapping("not_applicable", { rationale: "not-used", check_ids: ["quality-unit"] }),
    }],
  } }), "QUALITY_MAPPING_CHECKS");
  assertContractError(() => createEngineeringDossierDraft({
    dossier_id: "dossier-unsafe",
    run_id: "run-unsafe",
    task_id: "task-quality",
    risk_class: "standard-lite",
    mode: "standard-lite",
    task_type: "maintenance",
    user_visible_goal: "Reject unsafe dossier content.",
    starting_commit: START_COMMIT,
    created_at: "2026-07-13T00:00:00Z",
    task_shape: { ...dossierContent().task_shape, summary: "API_KEY=do-not-store" },
  }), "QUALITY_STRING_UNSAFE");
  assertContractError(() => finalizedDossier({ content: {
    verification_boundary: {
      ...dossierContent().verification_boundary,
      ownership_paths: ["lib\\app.mjs"],
    },
  } }), "QUALITY_PATH_CANONICAL");
  assertContractError(() => finalizedDossier({ content: {
    affected_areas: [{
      ...dossierContent().affected_areas[0],
      path: "../outside.mjs",
    }],
  } }), "PRIVACY_PATH");

  const oversized = finalizedDossier({ dossier_id: "dossier-oversized", run_id: "run-oversized" });
  const recordLimitedStore = createEngineeringQualityStore({
    run_id: "run-oversized",
    task_id: "task-quality",
    limits: { recordBytes: 1024, bundleBytes: 1024, objectDepth: 16 },
  });
  assertContractError(() => recordEngineeringDossier(recordLimitedStore, oversized), "QUALITY_RECORD_BYTES");

  const bundleDossier = finalizedDossier({ dossier_id: "dossier-bundle-limit", run_id: "run-bundle-limit" });
  const bundleGate = passedGate(bundleDossier, { gate_id: "gate-bundle-limit" });
  const dossierBytes = Buffer.byteLength(`${JSON.stringify(bundleDossier, null, 2)}\n`, "utf8");
  const gateBytes = Buffer.byteLength(`${JSON.stringify(bundleGate, null, 2)}\n`, "utf8");
  const singleRecordLimit = Math.max(1024, dossierBytes, gateBytes) + 16;
  const bundleLimitedStore = createEngineeringQualityStore({
    run_id: "run-bundle-limit",
    task_id: "task-quality",
    limits: { recordBytes: singleRecordLimit, bundleBytes: singleRecordLimit, objectDepth: 16 },
  });
  recordEngineeringDossier(bundleLimitedStore, bundleDossier);
  assertContractError(() => recordGateDecision(bundleLimitedStore, bundleGate), "QUALITY_BUNDLE_BYTES");
});

test("context gaps are explicitly scoped and only nonblocking accepted gaps satisfy truncation", () => {
  const gap = {
    id: "UNKNOWN-context-gap",
    scope_ids: ["AREA-main"],
    statement: "transitive sibling context is unavailable",
    impact: "the bounded sibling path may be underexplored",
    resolution_plan: "rerun semantic discovery when the tool is available",
    owner: "orchestrator",
    blocking: false,
  };
  const contextCoverage = {
    status: "truncated",
    affected_area_ids: ["AREA-main"],
    covered_area_ids: [],
    truncated_area_ids: ["AREA-main"],
    accepted_gap_ids: [gap.id],
    evidence_refs: [{ kind: "file", value: "lib/app.mjs" }],
  };
  const accepted = finalizedDossier({
    dossier_id: "dossier-scoped-gap",
    run_id: "run-scoped-gap",
    content: { unknowns: [gap], context_coverage: contextCoverage },
  });
  assert.equal(passedGate(accepted, { gate_id: "gate-scoped-gap" }).status, "passed");
  assertContractError(() => finalizedDossier({
    dossier_id: "dossier-unscoped-gap",
    run_id: "run-unscoped-gap",
    content: { unknowns: [{ ...gap, scope_ids: [] }], context_coverage: contextCoverage },
  }), "QUALITY_ARRAY");
  assertContractError(() => finalizedDossier({
    dossier_id: "dossier-mismatched-gap",
    run_id: "run-mismatched-gap",
    content: { unknowns: [{ ...gap, scope_ids: ["AREA-missing"] }], context_coverage: contextCoverage },
  }), "QUALITY_DANGLING_SCOPE");
  const blocking = finalizedDossier({
    dossier_id: "dossier-blocking-gap",
    run_id: "run-blocking-gap",
    content: { unknowns: [{ ...gap, blocking: true }], context_coverage: contextCoverage },
  });
  const blockedGate = passedGate(blocking, { gate_id: "gate-blocking-gap" });
  assert.equal(blockedGate.status, "blocked");
  assert(blockedGate.reasons.some((entry) => entry.code === "QUALITY_UNKNOWN_BLOCKING"));
  assert(blockedGate.reasons.some((entry) => entry.code === "QUALITY_CONTEXT_COVERAGE_TRUNCATED"));
});

test("full high and critical dossiers pass only with complete preimplementation evidence", () => {
  for (const riskClass of ["high", "critical"]) {
    const dossier = finalizedDossier({
      dossier_id: `dossier-${riskClass}`,
      risk_class: riskClass,
      mode: "full",
      content: fullDossierContent(riskClass),
    });
    assert.equal(dossier.risk_class, riskClass);
    assert.equal(dossier.premortem_matrix.length, PREMORTEM_CATEGORIES.length);
    const gate = passedGate(dossier, { gate_id: `gate-${riskClass}` });
    assert.equal(gate.status, "passed", JSON.stringify(gate.reasons));
    assert.equal(gate.preimplementation_evidence_fingerprint, preimplementationEvidence(dossier).fingerprint);
  }
});

test("high gate requires runner-owned baseline and independent plan challenge receipts", () => {
  const dossier = finalizedDossier({
    dossier_id: "dossier-receipts",
    risk_class: "high",
    mode: "full",
    content: fullDossierContent("high"),
  });
  const missing = passedGate(dossier, {
    gate_id: "gate-receipts-missing",
    preimplementation_evidence: null,
  });
  assert.equal(missing.status, "blocked");
  assert(missing.reasons.some((entry) => entry.code === "QUALITY_BASELINE_EVIDENCE_MISSING"));
  assert(missing.reasons.some((entry) => entry.code === "QUALITY_PLAN_CHALLENGE_MISSING"));

  const good = preimplementationEvidence(dossier);
  const failedBaseline = preimplementationEvidence(dossier, {
    baseline_receipts: good.baseline_receipts.map((entry) => ({ ...entry, status: "failed" })),
  });
  const failed = passedGate(dossier, {
    gate_id: "gate-receipts-failed",
    preimplementation_evidence: failedBaseline,
  });
  assert.equal(failed.status, "blocked");
  assert(failed.reasons.some((entry) => entry.code === "QUALITY_BASELINE_EVIDENCE_MISSING"));
});

test("gate requires every canonical preimplementation target, not only baseline plan IDs", () => {
  const content = fullDossierContent("high");
  content.test_obligations = [
    ...content.test_obligations,
    {
      id: "TEST-extra-preimplementation",
      check_id: "quality-extra-preimplementation",
      kind: "contract",
      phase: "preimplementation",
      scope_ids: ["AREA-main"],
      command_or_mechanism: "quality-extra-preimplementation-command",
      required: false,
      trusted_producer: "opencode-harness-quality-verifier",
    },
    {
      id: "TEST-plan-preimplementation",
      check_id: "quality-plan-preimplementation",
      kind: "contract",
      phase: "preimplementation",
      scope_ids: ["AREA-main"],
      command_or_mechanism: "quality-plan-preimplementation-command",
      required: false,
      trusted_producer: "opencode-harness-quality-verifier",
    },
  ];
  content.verification_plan = {
    ...content.verification_plan,
    baseline_check_ids: [
      ...content.verification_plan.baseline_check_ids,
      "quality-plan-preimplementation",
    ],
  };
  content.invariants = [
    ...content.invariants,
    {
      id: "INV-extra-preimplementation",
      statement: "the extra mapped preimplementation contract is checked before mutation",
      scope_ids: ["AREA-main"],
      mapping: mapping("applicable_directly_tested", { check_ids: ["quality-extra-preimplementation"] }),
    },
  ];
  const dossier = finalizedDossier({
    dossier_id: "dossier-canonical-preimplementation",
    run_id: "run-canonical-preimplementation",
    risk_class: "high",
    mode: "full",
    content,
  });
  assert.deepEqual(requiredEngineeringVerificationTargets(dossier).preimplementationCheckIds, [
    "quality-baseline",
    "quality-extra-preimplementation",
    "quality-plan-preimplementation",
  ]);
  assert.deepEqual(dossier.verification_plan.baseline_check_ids, [
    "quality-baseline",
    "quality-plan-preimplementation",
  ]);

  const baseCatalog = catalog();
  const checkCatalog = catalog({
    checks: [
      ...baseCatalog.checks.map(({ check_id, trusted_producer, phases, available }) => ({
        check_id,
        trusted_producer,
        phases: [...phases],
        available,
      })),
      {
        check_id: "quality-extra-preimplementation",
        trusted_producer: "opencode-harness-quality-verifier",
        phases: ["preimplementation"],
        available: true,
      },
      {
        check_id: "quality-plan-preimplementation",
        trusted_producer: "opencode-harness-quality-verifier",
        phases: ["preimplementation"],
        available: true,
      },
    ],
  });
  const good = preimplementationEvidence(dossier);
  assert.equal(passedGate(dossier, {
    gate_id: "gate-canonical-preimplementation-good",
    check_catalog: checkCatalog,
    preimplementation_evidence: good,
  }).status, "passed");

  const evidenceWith = (suffix, receipts, dossierFingerprint = dossier.fingerprint) => createEngineeringPreimplementationEvidence({
    evidence_id: `preimplementation-canonical-${suffix}`,
    dossier_id: dossier.dossier_id,
    dossier_fingerprint: dossierFingerprint,
    baseline_receipts: receipts,
    plan_challenge_receipts: good.plan_challenge_receipts,
  });
  const extraReceipt = good.baseline_receipts.find((entry) => entry.check_id === "quality-plan-preimplementation");
  const negativeCases = [
    ["missing", good.baseline_receipts.filter((entry) => entry.check_id !== "quality-extra-preimplementation"), "quality-extra-preimplementation"],
    ["failed", good.baseline_receipts.map((entry) => entry === extraReceipt ? { ...entry, status: "failed" } : entry), "quality-plan-preimplementation"],
    ["stale", good.baseline_receipts.map((entry) => entry === extraReceipt ? { ...entry, completed_at: "2026-07-13T00:00:30Z" } : entry), "quality-plan-preimplementation"],
    ["producer", good.baseline_receipts.map((entry) => entry === extraReceipt ? { ...entry, trusted_producer: "substituted-producer" } : entry), "quality-plan-preimplementation"],
    ["binding", good.baseline_receipts.map((entry) => entry === extraReceipt ? { ...entry, command_or_mechanism: "substituted-command" } : entry), "quality-plan-preimplementation"],
  ];
  for (const [suffix, receipts, expectedSubjectId] of negativeCases) {
    const decision = passedGate(dossier, {
      gate_id: `gate-canonical-preimplementation-${suffix}`,
      check_catalog: checkCatalog,
      preimplementation_evidence: evidenceWith(suffix, receipts),
    });
    assert.equal(decision.status, "blocked", `${suffix} canonical pre-check unexpectedly passed`);
    assert(decision.reasons.some((entry) => (
      entry.code === "QUALITY_BASELINE_EVIDENCE_MISSING"
      && entry.subject_id === expectedSubjectId
    )));
  }

  const unavailableCatalog = catalog({
    checks: checkCatalog.checks.map(({ check_id, trusted_producer, phases, available }) => ({
      check_id,
      trusted_producer,
      phases: [...phases],
      available: check_id === "quality-plan-preimplementation" ? false : available,
    })),
  });
  const unavailable = passedGate(dossier, {
    gate_id: "gate-canonical-preimplementation-unavailable",
    check_catalog: unavailableCatalog,
    preimplementation_evidence: good,
  });
  assert.equal(unavailable.status, "blocked");
  assert(unavailable.reasons.some((entry) => entry.code === "QUALITY_CHECK_UNKNOWN"));

  assertContractError(() => evidenceWith("wrong-phase", good.baseline_receipts.map((entry) => (
    entry === extraReceipt ? { ...entry, phase: "integration" } : entry
  ))), "CONTRACT_ENUM");
  assertContractError(() => passedGate(dossier, {
    gate_id: "gate-canonical-preimplementation-wrong-dossier",
    check_catalog: checkCatalog,
    preimplementation_evidence: evidenceWith("wrong-dossier", good.baseline_receipts, FP_A),
  }), "QUALITY_PREIMPLEMENTATION_EVIDENCE_BINDING");
});

test("task-specific evidence ignores optional obligations and requires explicit behavior fields", () => {
  const content = fullDossierContent("high");
  content.task_type = "new_feature";
  content.test_obligations = content.test_obligations.map((entry) => {
    if (entry.check_id === "quality-unit") return { ...entry, kind: "contract", required: false };
    if (entry.check_id === "quality-integration") return { ...entry, kind: "negative_path", required: false };
    return entry;
  });
  content.behavior_contract = { ...content.behavior_contract, negative_behavior: [] };
  const dossier = finalizedDossier({
    dossier_id: "dossier-required-obligations",
    risk_class: "high",
    mode: "full",
    task_type: "new_feature",
    content,
  });
  const gate = passedGate(dossier, { gate_id: "gate-required-obligations" });
  assert.equal(gate.status, "blocked");
  assert(gate.reasons.some((entry) => entry.code === "QUALITY_TASK_SPECIFIC_EVIDENCE_MISSING"));
  assert(gate.reasons.some((entry) => entry.subject_id.endsWith("negative_behavior")));
});

test("high and critical gate rejects ambiguity, unresolved coverage, ownership, baseline, rollback, and plan blockers", () => {
  const cases = [
    ["ambiguous", "QUALITY_BEHAVIOR_AMBIGUOUS", (content) => ({ ...content, behavior_contract: { ...content.behavior_contract, status: "ambiguous" } })],
    ["compatibility", "QUALITY_COMPATIBILITY_UNRESOLVED", (content) => ({ ...content, compatibility_contract: { ...content.compatibility_contract, default_decision: "unresolved" } })],
    ["boundary", "QUALITY_SYSTEM_BOUNDARY_UNRESOLVED", (content) => ({ ...content, system_boundaries: content.system_boundaries.filter((entry) => entry.category !== "callee") })],
    ["context", "QUALITY_CONTEXT_COVERAGE_TRUNCATED", (content) => ({ ...content, context_coverage: { ...content.context_coverage, status: "truncated", covered_area_ids: [], truncated_area_ids: ["AREA-main"] } })],
    ["overlap", "QUALITY_WRITE_OWNERSHIP_OVERLAP", (content) => ({
      ...content,
      implementation_slices: [
        { ...content.implementation_slices[0], concurrent_group: "parallel" },
        { ...content.implementation_slices[0], id: "SLICE-overlap", owner: "worker-two", concurrent_group: "parallel" },
      ],
    })],
    ["plan", "QUALITY_PLAN_CHALLENGE_UNRESOLVED", (content) => ({
      ...content,
      plan_challenge: {
        ...content.plan_challenge,
        blockers: [{ ...content.plan_challenge.blockers[0], status: "unresolved" }],
      },
    })],
  ];
  for (const [name, expectedCode, mutate] of cases) {
    const content = mutate(fullDossierContent("high"));
    const dossier = finalizedDossier({ dossier_id: `dossier-block-${name}`, risk_class: "high", mode: "full", content });
    const gate = passedGate(dossier, { gate_id: `gate-block-${name}` });
    assert.equal(gate.status, "blocked", `${name} unexpectedly passed`);
    assert(gate.reasons.some((entry) => entry.code === expectedCode), `${name} missed ${expectedCode}`);
  }

  const criticalContent = fullDossierContent("critical");
  criticalContent.rollback_recovery = {
    rollback_expectation: "unknown",
    recovery_expectation: "unknown",
    mapping: mapping("applicable_blocked_unverified", {
      blocked_reason: "recovery contract unresolved",
      external_dependency: "storage-owner",
    }),
  };
  const critical = finalizedDossier({ dossier_id: "dossier-block-rollback", risk_class: "critical", mode: "full", content: criticalContent });
  const criticalGate = passedGate(critical, { gate_id: "gate-block-rollback" });
  assert.equal(criticalGate.status, "blocked");
  assert(criticalGate.reasons.some((entry) => entry.code === "QUALITY_ROLLBACK_RECOVERY_UNKNOWN"));
});

test("pure gate resolves only trusted catalog IDs and blocks unavailable evidence", () => {
  const dossier = finalizedDossier();
  const passed = passedGate(dossier);
  assert.equal(passed.status, "passed");
  validateEngineeringGateDecision(passed);
  const blockedCatalog = catalog({
    checks: [
      { check_id: "quality-unit", trusted_producer: "opencode-harness-quality-verifier", phases: ["slice"], available: false },
      { check_id: "quality-integration", trusted_producer: "opencode-harness-quality-verifier", phases: ["integration"], available: true },
    ],
  });
  const blocked = passedGate(dossier, { gate_id: "gate-blocked", check_catalog: blockedCatalog });
  assert.equal(blocked.status, "blocked");
  assert(blocked.reasons.some((entry) => entry.code === "QUALITY_CHECK_UNKNOWN"));
  const tampered = JSON.parse(JSON.stringify(passed));
  tampered.status = "blocked";
  assertContractError(() => validateEngineeringGateDecision(tampered), "QUALITY_GATE_STATUS");
});

test("quality store records one immutable dossier and gate with exact idempotency", () => {
  const dossier = finalizedDossier({ dossier_id: "dossier-store", run_id: "run-store" });
  const gate = passedGate(dossier, { gate_id: "gate-store" });
  const store = createEngineeringQualityStore({ run_id: "run-store", task_id: "task-quality" });
  assert.equal(recordEngineeringDossier(store, dossier), recordEngineeringDossier(store, dossier));
  assert.equal(recordGateDecision(store, gate), recordGateDecision(store, gate));
  assert.equal(inspectEngineeringDossier(store, dossier.dossier_id).fingerprint, dossier.fingerprint);
  assert.equal(inspectGateDecision(store, gate.gate_id).fingerprint, gate.fingerprint);
  const changedGate = JSON.parse(JSON.stringify(gate));
  changedGate.fingerprint = FP_A;
  assertContractError(() => recordGateDecision(store, changedGate), "QUALITY_GATE_FINGERPRINT");
});

test("pre-gate mutation attempt and unobserved workspace mutation latch an irreversible failure", () => {
  const store = createEngineeringQualityStore({ run_id: "run-latched", task_id: "task-quality" });
  const session = createEngineeringQualitySession({ store, initial_workspace_fingerprint: FP_A });
  assertContractError(() => sessionAuthorizeAction(session, {
    kind: "edit",
    intent: "implementation",
    writable: true,
    write_scope: ["lib/app.mjs"],
  }), "QUALITY_PRE_GATE_VIOLATION");
  assert.equal(inspectEngineeringQualitySession(session).lifecycle, "failed");
  assertContractError(() => sessionObserveWorkspace(session, { fingerprint: FP_A, sequence: 1 }), "QUALITY_PRE_GATE_VIOLATION");

  const secondStore = createEngineeringQualityStore({ run_id: "run-unobserved", task_id: "task-quality" });
  const second = createEngineeringQualitySession({ store: secondStore, initial_workspace_fingerprint: FP_A });
  assertContractError(() => sessionObserveWorkspace(second, { fingerprint: FP_B, sequence: 1 }), "QUALITY_PRE_GATE_VIOLATION");
});

test("passed linked gate authorizes bounded implementation and produces ordered attestation", () => {
  const dossier = finalizedDossier({ dossier_id: "dossier-session", run_id: "run-session" });
  const gate = passedGate(dossier, { gate_id: "gate-session" });
  const store = createEngineeringQualityStore({ run_id: "run-session", task_id: "task-quality" });
  const session = createEngineeringQualitySession({ store, initial_workspace_fingerprint: FP_A });
  recordSufficientTestContext(session, dossier);
  sessionRecordDossier(session, dossier);
  const linked = sessionLinkGate(session, {
    decision: gate,
    workspace_fingerprint: FP_A,
    append_trace: () => ({
      sequence: 2,
      evidence_refs: [{ kind: "file", value: "quality/gate.json" }],
      verifier_codes: ["QUALITY-GATE-PASSED"],
    }),
  });
  assert.equal(linked.implementation_enabled, true);
  assert.equal(sessionAuthorizeAction(session, {
    kind: "job_create",
    intent: "implementation",
    writable: true,
    write_scope: ["lib/app.mjs"],
  }).authorized, true);
  assertContractError(() => sessionAuthorizeAction(session, {
    kind: "job_create",
    intent: "implementation",
    writable: true,
    write_scope: [],
  }), "QUALITY_HANDOFF_INCOMPLETE");

  const malformedStore = createEngineeringQualityStore({ run_id: "run-malformed-edit", task_id: "task-quality" });
  const malformed = createEngineeringQualitySession({ store: malformedStore, initial_workspace_fingerprint: FP_A });
  assertContractError(() => sessionAuthorizeAction(malformed, {
    kind: "edit",
    intent: "read_only",
    writable: false,
    write_scope: [],
  }), "QUALITY_HANDOFF_INCOMPLETE");
});

test("authorization rejects out-of-ownership, false-prefix, traversal, and empty scopes before side effects", () => {
  for (const [suffix, writeScope, code] of [
    ["outside", ["lib/other.mjs"], "QUALITY_WRITE_SCOPE_VIOLATION"],
    ["false-prefix", ["lib/app.mjsx"], "QUALITY_WRITE_SCOPE_VIOLATION"],
    ["traversal", ["lib/app.mjs/../outside.mjs"], "PRIVACY_PATH"],
    ["empty", [], "QUALITY_HANDOFF_INCOMPLETE"],
  ]) {
    const { session } = preparedImplementationSession({
      runId: `run-authorization-${suffix}`,
      dossierId: `dossier-authorization-${suffix}`,
    });
    assertContractError(() => sessionAuthorizeAction(session, {
      kind: "edit",
      intent: "implementation",
      writable: true,
      write_scope: writeScope,
    }), code);
  }
});

test("rejected context decision artifacts do not poison a corrected retry on the same store", () => {
  const dossier = finalizedDossier({
    dossier_id: "dossier-context-decision-retry",
    run_id: "run-context-decision-retry",
    risk_class: "high",
    mode: "full",
    content: fullDossierContent("high"),
  });
  const store = createEngineeringQualityStore({ run_id: dossier.run_id, task_id: dossier.task_id });
  const session = createEngineeringQualitySession({ store, initial_workspace_fingerprint: FP_A });
  const correct = recordSufficientTestContext(null, dossier, { record: false });
  const alternate = recordSufficientTestContext(null, dossier, { record: false });
  const mismatchedIndex = createContextReceiptEvidenceIndex({ receipts: [] }, {
    session_key: correct.decision.session_key,
    run_id: dossier.run_id,
    task_id: dossier.task_id,
    source_fingerprint: FP_A,
  });

  assertContractError(() => sessionRecordContextDecision(session, {
    decision: correct.decision,
    receipt_index: mismatchedIndex,
    report: correct.report,
  }), "CONTEXT_DECISION_BINDING");
  assertContractError(() => sessionRecordContextDecision(session, {
    decision: correct.decision,
    receipt_index: correct.receipt_index,
    report: alternate.report,
  }), "CONTEXT_DECISION_BINDING");
  assert.equal(inspectEngineeringQualitySession(session).lifecycle, "init");

  const recorded = sessionRecordContextDecision(session, correct);
  assert.equal(recorded.decision_id, correct.decision.decision_id);
  assert.equal(inspectEngineeringQualitySession(session).lifecycle, "context_sufficient");
  const replayed = recordContextDecisionEvidenceBundle(store, correct);
  assert.equal(replayed.decision.fingerprint, correct.decision.fingerprint);
  assert.equal(replayed.receipt_index.fingerprint, correct.receipt_index.fingerprint);
  assert.equal(replayed.report.fingerprint, correct.report.fingerprint);
});

test("context decision bundle preserves nullable task-profile evidence semantics", () => {
  const dossier = finalizedDossier({
    dossier_id: "dossier-context-null-task-profile",
    run_id: "run-context-null-task-profile",
    risk_class: "high",
    mode: "full",
    content: fullDossierContent("high"),
  });
  const bundle = recordSufficientTestContext(null, dossier, { record: false });
  const refingerprint = (value, patch) => {
    const source = { ...structuredClone(value), ...patch };
    delete source.fingerprint;
    return { ...source, fingerprint: fingerprint(source) };
  };
  const mismatchedTaskProfile = refingerprint(bundle.decision.task_profile_evidence, {
    session_key: "mismatched-task-profile-session",
  });
  const mismatchedDecision = refingerprint(bundle.decision, {
    task_profile_evidence: mismatchedTaskProfile,
  });
  const nullableDecision = refingerprint(bundle.decision, { task_profile_evidence: null });
  const store = createEngineeringQualityStore({ run_id: dossier.run_id, task_id: dossier.task_id });
  const session = createEngineeringQualitySession({ store, initial_workspace_fingerprint: FP_A });

  assertContractError(() => sessionRecordContextDecision(session, {
    ...bundle,
    decision: mismatchedDecision,
  }), "CONTEXT_DECISION_BINDING");
  assert.equal(inspectEngineeringQualitySession(session).lifecycle, "init");

  const recorded = sessionRecordContextDecision(session, {
    ...bundle,
    decision: nullableDecision,
  });
  assert.equal(recorded.status, "sufficient");
  assert.equal(recorded.task_profile_evidence, null);
  assert.equal(inspectEngineeringQualitySession(session).lifecycle, "context_sufficient");
  const replayed = recordContextDecisionEvidenceBundle(store, {
    ...bundle,
    decision: nullableDecision,
  });
  assert.equal(replayed.decision.fingerprint, nullableDecision.fingerprint);
  assert.equal(replayed.decision.task_profile_evidence, null);
});

test("conflicting low-level context partial state does not receive new bundle records", () => {
  const dossier = finalizedDossier({
    dossier_id: "dossier-context-partial-conflict",
    run_id: "run-context-partial-conflict",
  });
  const gate = passedGate(dossier, { gate_id: "gate-context-partial-conflict" });
  const correct = recordSufficientTestContext(null, dossier, { record: false });
  const conflictingIndex = createContextReceiptEvidenceIndex({ receipts: [] }, {
    session_key: correct.decision.session_key,
    run_id: dossier.run_id,
    task_id: dossier.task_id,
    source_fingerprint: FP_A,
  });
  const store = createEngineeringQualityStore({ run_id: dossier.run_id, task_id: dossier.task_id });
  recordEngineeringDossier(store, dossier);
  recordGateDecision(store, gate);
  recordContextReceiptEvidenceIndex(store, conflictingIndex);
  const session = createEngineeringQualitySession({ store, initial_workspace_fingerprint: FP_A });

  assertContractError(
    () => sessionRecordContextDecision(session, correct),
    "CONTEXT_RECEIPT_INDEX_CONFLICT",
  );
  const snapshot = snapshotEngineeringQualityStore(store);
  assert.equal(snapshot.context_receipt_index.fingerprint, conflictingIndex.fingerprint);
  assert.equal(snapshot.context_sufficiency_decision, null);
  assert.equal(snapshot.context_report, null);
  assert.equal(inspectEngineeringQualitySession(session).lifecycle, "init");
});

test("context decision bundle quota rejection is atomic", () => {
  const dossier = finalizedDossier({
    dossier_id: "dossier-context-bundle-quota",
    run_id: "run-context-bundle-quota",
  });
  const gate = passedGate(dossier, { gate_id: "gate-context-bundle-quota" });
  const bundle = recordSufficientTestContext(null, dossier, { record: false });
  const bytes = (value) => Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  const dossierBytes = bytes(dossier);
  const gateBytes = bytes(gate);
  const indexBytes = bytes(bundle.receipt_index);
  const decisionBytes = bytes(bundle.decision);
  const recordBytes = Math.max(1024, dossierBytes, gateBytes, indexBytes, decisionBytes);
  const baselineBytes = dossierBytes + gateBytes;
  const bundleBytes = baselineBytes + Math.max(indexBytes, decisionBytes);
  assert(bundleBytes >= recordBytes);
  assert(bundleBytes < baselineBytes + indexBytes + decisionBytes);
  const store = createEngineeringQualityStore({
    run_id: dossier.run_id,
    task_id: dossier.task_id,
    limits: { recordBytes, bundleBytes },
  });
  recordEngineeringDossier(store, dossier);
  recordGateDecision(store, gate);
  const session = createEngineeringQualitySession({ store, initial_workspace_fingerprint: FP_A });

  assertContractError(
    () => sessionRecordContextDecision(session, bundle),
    "QUALITY_BUNDLE_BYTES",
  );
  const snapshot = snapshotEngineeringQualityStore(store);
  assert.equal(snapshot.context_receipt_index, null);
  assert.equal(snapshot.context_sufficiency_decision, null);
  assert.equal(snapshot.context_report, null);
  assert.equal(inspectEngineeringQualitySession(session).lifecycle, "init");
});

test("final context reconciliation cannot precede integrated verification", () => {
  const current = preparedImplementationSession({
    runId: "run-reconciliation-before-verification",
    dossierId: "dossier-reconciliation-before-verification",
  });
  assertContractError(
    () => recordPassedTestReconciliation(current.session, current.contextDecision, current.dossier, FP_B),
    "CONTEXT_RECONCILIATION_ORDER",
  );
});

test("rejected stale reconciliation does not poison a corrected retry on the same store", () => {
  const prepared = preparedImplementationSession({
    runId: "run-reconciliation-retry",
    dossierId: "dossier-reconciliation-retry",
  });
  const targetIds = [
    ...prepared.dossier.verification_boundary.check_ids,
    ...prepared.dossier.verification_boundary.mechanism_ids,
  ];
  const event = syntheticVerificationEvent({
    runId: prepared.dossier.run_id,
    sequence: 4,
    targetIds,
  });
  const evidence = integratedEvidence({
    dossier: prepared.dossier,
    gate: prepared.gate,
    checkCatalog: prepared.checkCatalog,
    traceEvent: event,
    workspaceFingerprint: FP_B,
  });
  sessionRecordIntegratedVerification(prepared.session, {
    evidence,
    check_catalog: prepared.checkCatalog,
  });

  const stale = createPassedTestReconciliation(
    prepared.contextDecision,
    prepared.dossier,
    FP_C,
  );
  assertContractError(
    () => sessionRecordContextReconciliation(prepared.session, stale),
    "CONTEXT_RECONCILIATION_FINAL_WORKSPACE_STALE",
  );
  assert.equal(inspectEngineeringQualitySession(prepared.session).context_reconciliation_id, null);

  const corrected = createPassedTestReconciliation(
    prepared.contextDecision,
    prepared.dossier,
    FP_B,
  );
  const recorded = sessionRecordContextReconciliation(prepared.session, corrected);
  assert.equal(recorded.reconciliation_id, corrected.reconciliation_id);
  assert.equal(
    inspectEngineeringQualitySession(prepared.session).context_reconciliation_id,
    corrected.reconciliation_id,
  );
});

test("workspace changes invalidate integrated verification before reconciliation and remain retryable", () => {
  const prepared = preparedImplementationSession({
    runId: "run-reconciliation-workspace-reverification",
    dossierId: "dossier-reconciliation-workspace-reverification",
  });
  const targetIds = [
    ...prepared.dossier.verification_boundary.check_ids,
    ...prepared.dossier.verification_boundary.mechanism_ids,
  ];
  const firstEvent = syntheticVerificationEvent({
    runId: prepared.dossier.run_id,
    sequence: 4,
    targetIds,
  });
  sessionRecordIntegratedVerification(prepared.session, {
    evidence: integratedEvidence({
      dossier: prepared.dossier,
      gate: prepared.gate,
      checkCatalog: prepared.checkCatalog,
      traceEvent: firstEvent,
      workspaceFingerprint: FP_B,
    }),
    check_catalog: prepared.checkCatalog,
  });

  sessionObserveWorkspace(prepared.session, { fingerprint: FP_C, sequence: 5 });
  let sessionState = inspectEngineeringQualitySession(prepared.session);
  assert.equal(sessionState.integrated_verification_sequence, null);
  assert.equal(sessionState.integrated_verification_evidence_id, null);
  const currentWorkspaceReconciliation = createPassedTestReconciliation(
    prepared.contextDecision,
    prepared.dossier,
    FP_C,
  );
  assertContractError(
    () => sessionRecordContextReconciliation(prepared.session, currentWorkspaceReconciliation),
    "CONTEXT_RECONCILIATION_ORDER",
  );
  sessionState = inspectEngineeringQualitySession(prepared.session);
  assert.equal(sessionState.lifecycle, "implementation_enabled");
  assert.equal(sessionState.context_reconciliation_id, null);
  assert.equal(snapshotEngineeringQualityStore(prepared.store).context_reconciliation, null);

  const secondEvent = syntheticVerificationEvent({
    runId: prepared.dossier.run_id,
    sequence: 6,
    targetIds,
  });
  const secondEvidence = integratedEvidence({
    dossier: prepared.dossier,
    gate: prepared.gate,
    checkCatalog: prepared.checkCatalog,
    traceEvent: secondEvent,
    workspaceFingerprint: FP_C,
  });
  sessionRecordIntegratedVerification(prepared.session, {
    evidence: secondEvidence,
    check_catalog: prepared.checkCatalog,
  });
  const recorded = sessionRecordContextReconciliation(prepared.session, currentWorkspaceReconciliation);
  assert.equal(recorded.reconciliation_id, currentWorkspaceReconciliation.reconciliation_id);
  assert.equal(
    inspectEngineeringQualitySession(prepared.session).integrated_verification_evidence_id,
    secondEvidence.evidence_id,
  );

  assertContractError(
    () => sessionObserveWorkspace(prepared.session, { fingerprint: FP_D, sequence: 7 }),
    "CONTEXT_RECONCILIATION_ORDER",
  );
  assert.equal(inspectEngineeringQualitySession(prepared.session).lifecycle, "failed");
});

test("integrated evidence rejects omitted, substituted, duplicate, and untrusted execution receipts", () => {
  const missingTarget = preparedImplementationSession({
    runId: "run-evidence-missing-event-target",
    dossierId: "dossier-evidence-missing-event-target",
  });
  const allTargets = [
    ...missingTarget.dossier.verification_boundary.check_ids,
    ...missingTarget.dossier.verification_boundary.mechanism_ids,
  ];
  const incompleteEvent = syntheticVerificationEvent({
    runId: missingTarget.dossier.run_id,
    sequence: 4,
    targetIds: missingTarget.dossier.verification_boundary.check_ids,
  });
  assertContractError(() => integratedEvidence({
    dossier: missingTarget.dossier,
    gate: missingTarget.gate,
    checkCatalog: missingTarget.checkCatalog,
    traceEvent: incompleteEvent,
    workspaceFingerprint: FP_B,
  }), "QUALITY_INTEGRATED_TRACE_EVENT");

  const duplicateEvent = syntheticVerificationEvent({
    runId: missingTarget.dossier.run_id,
    sequence: 4,
    targetIds: allTargets,
  });
  const valid = integratedEvidence({
    dossier: missingTarget.dossier,
    gate: missingTarget.gate,
    checkCatalog: missingTarget.checkCatalog,
    traceEvent: duplicateEvent,
    workspaceFingerprint: FP_B,
  });
  assertContractError(() => integratedEvidence({
    dossier: missingTarget.dossier,
    gate: missingTarget.gate,
    checkCatalog: missingTarget.checkCatalog,
    traceEvent: duplicateEvent,
    workspaceFingerprint: FP_B,
    overrides: {
      check_receipts: [valid.check_receipts[0], { ...valid.check_receipts[0] }],
    },
  }), "QUALITY_INTEGRATED_EVIDENCE_DUPLICATE");

  const wrongProducer = preparedImplementationSession({
    runId: "run-evidence-wrong-producer",
    dossierId: "dossier-evidence-wrong-producer",
  });
  const producerTargets = [
    ...wrongProducer.dossier.verification_boundary.check_ids,
    ...wrongProducer.dossier.verification_boundary.mechanism_ids,
  ];
  const producerEvent = syntheticVerificationEvent({
    runId: wrongProducer.dossier.run_id,
    sequence: 4,
    targetIds: producerTargets,
  });
  const producerBase = integratedEvidence({
    dossier: wrongProducer.dossier,
    gate: wrongProducer.gate,
    checkCatalog: wrongProducer.checkCatalog,
    traceEvent: producerEvent,
    workspaceFingerprint: FP_B,
  });
  const untrusted = integratedEvidence({
    dossier: wrongProducer.dossier,
    gate: wrongProducer.gate,
    checkCatalog: wrongProducer.checkCatalog,
    traceEvent: producerEvent,
    workspaceFingerprint: FP_B,
    overrides: {
      check_receipts: producerBase.check_receipts.map((entry, index) => (
        index === 0 ? { ...entry, trusted_producer: "untrusted-producer" } : entry
      )),
    },
  });
  assertContractError(() => sessionRecordIntegratedVerification(wrongProducer.session, {
    evidence: untrusted,
    check_catalog: wrongProducer.checkCatalog,
  }), "QUALITY_INTEGRATED_EVIDENCE_RECEIPT");

  const substituted = preparedImplementationSession({
    runId: "run-evidence-catalog-substitution",
    dossierId: "dossier-evidence-catalog-substitution",
  });
  const substitutedCatalog = catalog({ catalog_id: "substituted-quality-catalog" });
  const substitutedTargets = [
    ...substituted.dossier.verification_boundary.check_ids,
    ...substituted.dossier.verification_boundary.mechanism_ids,
  ];
  const substitutedEvent = syntheticVerificationEvent({
    runId: substituted.dossier.run_id,
    sequence: 4,
    targetIds: substitutedTargets,
  });
  const substitutedEvidence = integratedEvidence({
    dossier: substituted.dossier,
    gate: substituted.gate,
    checkCatalog: substitutedCatalog,
    traceEvent: substitutedEvent,
    workspaceFingerprint: FP_B,
  });
  assertContractError(() => sessionRecordIntegratedVerification(substituted.session, {
    evidence: substitutedEvidence,
    check_catalog: substituted.checkCatalog,
  }), "QUALITY_INTEGRATED_EVIDENCE_BINDING");
});

test("preimplementation mechanism receipts remain bound to gate-authoritative plan challenges", () => {
  const dossier = finalizedDossier({
    dossier_id: "dossier-plan-receipt-binding",
    run_id: "run-plan-receipt-binding",
    risk_class: "high",
    mode: "full",
    content: fullDossierContent("high"),
  });
  const checkCatalog = catalog();
  const authoritative = preimplementationEvidence(dossier);
  const gate = passedGate(dossier, {
    gate_id: "gate-plan-receipt-binding",
    check_catalog: checkCatalog,
    preimplementation_evidence: authoritative,
  });
  assert.equal(gate.status, "passed", JSON.stringify(gate.reasons));
  const store = createEngineeringQualityStore({ run_id: dossier.run_id, task_id: dossier.task_id });
  const session = createEngineeringQualitySession({ store, initial_workspace_fingerprint: FP_A });
  recordSufficientTestContext(session, dossier);
  sessionRecordDossier(session, dossier);
  sessionLinkGate(session, {
    decision: gate,
    preimplementation_evidence: authoritative,
    workspace_fingerprint: FP_A,
    append_trace: () => ({
      sequence: 2,
      evidence_refs: [{ kind: "file", value: "quality/gate.json" }],
      verifier_codes: ["QUALITY-GATE-PASSED"],
    }),
  });
  sessionAuthorizeAction(session, {
    kind: "edit",
    intent: "implementation",
    writable: true,
    write_scope: ["lib/app.mjs"],
  });
  sessionRecordImplementation(session, {
    first_sequence: 3,
    sequence: 3,
    workspace_fingerprint: FP_B,
    files_written: ["lib/app.mjs"],
  });
  const targetIds = [...dossier.verification_boundary.check_ids, ...dossier.verification_boundary.mechanism_ids];
  const event = syntheticVerificationEvent({ runId: dossier.run_id, sequence: 4, targetIds });
  const base = integratedEvidence({
    dossier,
    gate,
    checkCatalog,
    traceEvent: event,
    workspaceFingerprint: FP_B,
  });
  const substituted = integratedEvidence({
    dossier,
    gate,
    checkCatalog,
    traceEvent: event,
    workspaceFingerprint: FP_B,
    overrides: {
      mechanism_receipts: base.mechanism_receipts.map((entry) => ({
        ...entry,
        evidence_fingerprint: FP_E,
      })),
    },
  });
  assertContractError(() => sessionRecordIntegratedVerification(session, {
    evidence: substituted,
    check_catalog: checkCatalog,
  }), "QUALITY_INTEGRATED_EVIDENCE_RECEIPT");
});

test("late edit and delegation invalidate evidence until a later trusted verification", () => {
  const prepared = preparedImplementationSession({
    runId: "run-evidence-revisions",
    dossierId: "dossier-evidence-revisions",
  });
  const targets = [
    ...prepared.dossier.verification_boundary.check_ids,
    ...prepared.dossier.verification_boundary.mechanism_ids,
  ];
  const recordAt = (sequence, workspaceFingerprint) => {
    const event = syntheticVerificationEvent({ runId: prepared.dossier.run_id, sequence, targetIds: targets });
    const evidence = integratedEvidence({
      dossier: prepared.dossier,
      gate: prepared.gate,
      checkCatalog: prepared.checkCatalog,
      traceEvent: event,
      workspaceFingerprint,
      overrides: { evidence_id: `integrated-revision-${sequence}` },
    });
    sessionRecordIntegratedVerification(prepared.session, { evidence, check_catalog: prepared.checkCatalog });
    return evidence;
  };
  recordAt(4, FP_B);
  sessionAuthorizeAction(prepared.session, {
    kind: "edit",
    intent: "implementation",
    writable: true,
    write_scope: ["lib/app.mjs"],
  });
  assert.equal(inspectEngineeringQualitySession(prepared.session).integrated_verification_sequence, null);
  sessionRecordImplementation(prepared.session, {
    first_sequence: 5,
    sequence: 5,
    workspace_fingerprint: FP_C,
    files_written: ["lib/app.mjs"],
  });
  recordAt(6, FP_C);
  sessionAuthorizeAction(prepared.session, {
    kind: "job_create",
    intent: "implementation",
    writable: true,
    write_scope: ["lib/app.mjs"],
  });
  assert.equal(inspectEngineeringQualitySession(prepared.session).integrated_verification_sequence, null);
  sessionRecordImplementationDelegation(prepared.session, { sequence: 7, write_scope: ["lib/app.mjs"] });
  const finalEvidence = recordAt(8, FP_C);
  recordPassedTestReconciliation(prepared.session, prepared.contextDecision, prepared.dossier, FP_C);
  const attestation = sessionFinalizeAttestation(prepared.session, {
    final_workspace_fingerprint: FP_C,
    teardown_verified: true,
    prompt_profile_id: "baseline-engineering-prompts-v1",
    prompt_profile_fingerprint: FP_D,
    attested_at: "2026-07-13T00:09:00Z",
  });
  assert.equal(attestation.last_implementation_action_sequence, 7);
  assert.equal(attestation.last_workspace_mutation_sequence, 5);
  assert.equal(attestation.integrated_verification_sequence, 8);
  assert.equal(attestation.integrated_verification_evidence_fingerprint, finalEvidence.fingerprint);
});

test("high session cannot attest completion after a failed trusted post-architecture audit", () => {
  const baselineGraph = architectureGraph("GRAPH-high-session-baseline", { riskClass: "high" });
  const candidateGraph = architectureGraph("GRAPH-high-session-candidate", {
    riskClass: "high",
    forbiddenImport: true,
  });
  const policy = architecturePolicy();
  const preArchitecture = evaluateArchitecturePolicy({ graph: baselineGraph, policy, baseline: baselineGraph });
  const postArchitecture = evaluateArchitecturePolicy({ graph: candidateGraph, policy, baseline: baselineGraph });
  assert.equal(preArchitecture.status, "passed");
  assert.equal(postArchitecture.status, "failed");
  const dossier = finalizedDossier({
    dossier_id: "dossier-high-post-architecture",
    run_id: "run-high-post-architecture",
    risk_class: "high",
    mode: "full",
    content: {
      ...fullDossierContent("high"),
      impact_graph: baselineGraph,
      architecture_assessment: {
        policy_id: preArchitecture.policy_id,
        status: preArchitecture.status,
        evaluation_id: preArchitecture.evaluation_id,
        violation_ids: [],
        notes: null,
      },
    },
  });
  const qualityCatalog = catalog();
  const gate = passedGate(dossier, {
    gate_id: "gate-high-post-architecture",
    check_catalog: qualityCatalog,
    architecture_evaluation: preArchitecture,
  });
  assert.equal(gate.status, "passed", JSON.stringify(gate.reasons));
  const store = createEngineeringQualityStore({ run_id: dossier.run_id, task_id: dossier.task_id });
  const session = createEngineeringQualitySession({ store, initial_workspace_fingerprint: FP_A });
  const contextDecision = recordSufficientTestContext(session, dossier);
  sessionRecordDossier(session, dossier);
  sessionLinkGate(session, {
    decision: gate,
    preimplementation_evidence: preimplementationEvidence(dossier),
    architecture_evaluation: preArchitecture,
    workspace_fingerprint: FP_A,
    append_trace: () => ({
      sequence: 2,
      evidence_refs: [{ kind: "file", value: "quality/gate.json" }],
      verifier_codes: ["QUALITY-GATE-PASSED"],
    }),
  });
  sessionAuthorizeAction(session, {
    kind: "edit",
    intent: "implementation",
    writable: true,
    write_scope: ["lib/app.mjs"],
  });
  sessionRecordImplementation(session, {
    first_sequence: 3,
    sequence: 3,
    workspace_fingerprint: FP_B,
    files_written: ["lib/app.mjs"],
  });
  sessionRecordPostArchitectureEvaluation(session, postArchitecture);
  const targetIds = [...dossier.verification_boundary.check_ids, ...dossier.verification_boundary.mechanism_ids];
  const event = syntheticVerificationEvent({ runId: dossier.run_id, sequence: 4, targetIds });
  sessionRecordIntegratedVerification(session, {
    evidence: integratedEvidence({
      dossier,
      gate,
      checkCatalog: qualityCatalog,
      traceEvent: event,
      workspaceFingerprint: FP_B,
    }),
    check_catalog: qualityCatalog,
  });
  recordPassedTestReconciliation(session, contextDecision, dossier, FP_B);
  assertContractError(() => sessionFinalizeAttestation(session, {
    final_workspace_fingerprint: FP_B,
    teardown_verified: true,
    prompt_profile_id: "baseline-engineering-prompts-v1",
    prompt_profile_fingerprint: FP_D,
    attested_at: "2026-07-13T00:05:00Z",
  }), "QUALITY_POST_ARCHITECTURE_AUDIT_FAILED");
});

test("quality bundle is runner-bound, post-teardown, atomic, and restart-idempotent", () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-quality-bundle-"));
  try {
    const durable = createTraceStore({ workspaceRoot: ws });
    const staged = durable.createStagingStore();
    const runId = "run-quality-bundle";
    staged.createRun({
      run_id: runId,
      scenario_id: "quality-scenario",
      profile_role: "candidate",
      harness_fingerprint: FP_A,
      model: "openai-gpt-5-6-sol",
      model_parameters: { reasoning_effort: "medium" },
      task_class: "implementation",
      strategy_id: "strategy-quality",
      risk: "standard",
    });
    staged.appendEvent(runId, traceEvent());

    const baselineGraph = architectureGraph("GRAPH-bundle-baseline");
    const candidateGraph = architectureGraph("GRAPH-bundle-candidate");
    const policy = architecturePolicy();
    const preArchitecture = evaluateArchitecturePolicy({
      graph: baselineGraph,
      policy,
      baseline: baselineGraph,
    });
    const postArchitecture = evaluateArchitecturePolicy({
      graph: candidateGraph,
      policy,
      baseline: baselineGraph,
    });
    assert.equal(preArchitecture.status, "passed");
    assert.equal(postArchitecture.status, "passed");
    const dossier = finalizedDossier({
      dossier_id: "dossier-bundle",
      run_id: runId,
      content: {
        impact_graph: baselineGraph,
        architecture_assessment: {
          policy_id: preArchitecture.policy_id,
          status: preArchitecture.status,
          evaluation_id: preArchitecture.evaluation_id,
          violation_ids: [],
          notes: null,
        },
      },
    });
    const qualityCatalog = catalog();
    const gate = passedGate(dossier, {
      gate_id: "gate-bundle",
      check_catalog: qualityCatalog,
      architecture_evaluation: preArchitecture,
    });
    const store = createEngineeringQualityStore({ run_id: runId, task_id: "task-quality" });
    const session = createEngineeringQualitySession({ store, initial_workspace_fingerprint: FP_A });
    const contextDecision = recordSufficientTestContext(session, dossier);
    sessionRecordDossier(session, dossier);
    sessionLinkGate(session, {
      decision: gate,
      architecture_evaluation: preArchitecture,
      workspace_fingerprint: FP_A,
      append_trace: ({ gate_status: gateStatus }) => {
        const event = staged.appendEvent(runId, traceEvent({
          event_type: "tool_call",
          summary: "runner-owned-quality-gate",
          evidence_refs: [{ kind: "file", value: "quality/gate.json" }],
          verifier_codes: [gateStatus === "passed" ? "QUALITY-GATE-PASSED" : "QUALITY-GATE-BLOCKED"],
        }));
        return { sequence: event.sequence, evidence_refs: event.evidence_refs, verifier_codes: event.verifier_codes };
      },
    });
    sessionAuthorizeAction(session, {
      kind: "edit",
      intent: "implementation",
      writable: true,
      write_scope: ["lib/app.mjs"],
    });
    const editEvent = staged.appendEvent(runId, traceEvent({
      event_type: "edit",
      summary: "bounded-implementation-event",
      files_written: [{ path: "lib/app.mjs", summary: "bounded-edit" }],
    }));
    sessionRecordImplementation(session, {
      first_sequence: editEvent.sequence,
      sequence: editEvent.sequence,
      workspace_fingerprint: FP_B,
      files_written: ["lib/app.mjs"],
    });
    sessionRecordPostArchitectureEvaluation(session, postArchitecture);
    const targetIds = [...dossier.verification_boundary.check_ids, ...dossier.verification_boundary.mechanism_ids];
    const verificationEvent = staged.appendEvent(runId, traceEvent({
      event_type: "verification",
      summary: "quality-integration-passed",
      verification: { status: "passed", summary: "integration-passed", verifier_codes: targetIds },
      verifier_codes: targetIds,
    }));
    const executionEvidence = integratedEvidence({
      dossier,
      gate,
      checkCatalog: qualityCatalog,
      traceEvent: verificationEvent,
      workspaceFingerprint: FP_B,
    });
    sessionRecordIntegratedVerification(session, {
      evidence: executionEvidence,
      check_catalog: qualityCatalog,
    });
    recordPassedTestReconciliation(session, contextDecision, dossier, FP_B);
    sessionFinalizeAttestation(session, {
      final_workspace_fingerprint: FP_B,
      teardown_verified: true,
      prompt_profile_id: "prompt-candidate",
      prompt_profile_fingerprint: FP_D,
      attested_at: "2026-07-13T00:05:00Z",
    });
    completeTrace(
      staged,
      runId,
      targetIds,
    );
    assert.equal(fs.existsSync(path.join(ws, ".oc_harness", "runs", runId)), false);

    assert.throws(() => publishEngineeringQualityRunBundle({
      durable_trace_store: durable,
      staged_trace_store: staged,
      session,
      after_publish: () => { throw new Error("injected-post-rename-ack-failure"); },
    }), /injected-post-rename-ack-failure/);
    const committedDir = path.join(ws, ".oc_harness", "runs", runId);
    assert.equal(validateEngineeringQualityRunBundle(committedDir).gate.status, "passed");
    const retry = publishEngineeringQualityRunBundle({
      durable_trace_store: durable,
      staged_trace_store: staged,
      session,
    });
    assert.equal(retry.committed.complete, true);
    const bundle = validateEngineeringQualityRunBundle(committedDir);
    assert.equal(bundle.post_architecture_evaluation.fingerprint, postArchitecture.fingerprint);
    assert.equal(
      bundle.attestation.post_architecture_evaluation_fingerprint,
      postArchitecture.fingerprint,
    );
    const eventsPath = path.join(committedDir, "events.jsonl");
    const originalEventsText = fs.readFileSync(eventsPath, "utf8");
    const tamperedEvents = originalEventsText.trimEnd().split(/\r?\n/).map(JSON.parse);
    const linkedVerificationEvent = tamperedEvents.find(
      (entry) => entry.sequence === bundle.integrated_verification_evidence.trace_event_sequence,
    );
    linkedVerificationEvent.summary = "substituted-verification-event";
    fs.writeFileSync(eventsPath, `${tamperedEvents.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
    assertContractError(() => validateEngineeringQualityRunBundle(committedDir), "QUALITY_BUNDLE_TRACE_LINK");
    fs.writeFileSync(eventsPath, originalEventsText, "utf8");

    const verificationPath = path.join(committedDir, "verification.json");
    const originalVerificationText = fs.readFileSync(verificationPath, "utf8");
    const substitutedVerification = JSON.parse(originalVerificationText);
    substitutedVerification.checks[0].code = "quality-substituted";
    fs.writeFileSync(verificationPath, `${JSON.stringify(substitutedVerification, null, 2)}\n`, "utf8");
    assertContractError(() => validateEngineeringQualityRunBundle(committedDir), "QUALITY_BUNDLE_VERIFICATION_LINK");
    fs.writeFileSync(verificationPath, originalVerificationText, "utf8");

    const missingMechanismVerification = JSON.parse(originalVerificationText);
    missingMechanismVerification.checks = missingMechanismVerification.checks.filter(
      (entry) => entry.code !== "contract-review",
    );
    fs.writeFileSync(verificationPath, `${JSON.stringify(missingMechanismVerification, null, 2)}\n`, "utf8");
    assertContractError(() => validateEngineeringQualityRunBundle(committedDir), "QUALITY_BUNDLE_VERIFICATION_LINK");
    fs.writeFileSync(verificationPath, originalVerificationText, "utf8");

    const assertionResults = evaluateEngineeringQualityAssertions(
      ENGINEERING_QUALITY_ASSERTION_OPERATIONS.map((op, index) => ({ assertion_id: `quality-assert-${index + 1}`, op })),
      {
        dossier: bundle.dossier,
        gate: bundle.gate,
        attestation: bundle.attestation,
        architecture_evaluation: bundle.post_architecture_evaluation,
        integrated_verification_evidence: bundle.integrated_verification_evidence,
        trace: durable.inspectRun(runId),
      },
    );
    assert(assertionResults.every((entry) => entry.status === "passed"));
    const unrelatedPostArchitecture = evaluateArchitecturePolicy({
      graph: architectureGraph("GRAPH-bundle-unrelated"),
      policy,
      baseline: baselineGraph,
    });
    assert.equal(unrelatedPostArchitecture.status, "passed");
    const unrelatedArchitectureResult = evaluateEngineeringQualityAssertions(
      [{ assertion_id: "quality-assert-unrelated-architecture", op: "architecture_respected" }],
      {
        dossier: bundle.dossier,
        gate: bundle.gate,
        attestation: bundle.attestation,
        architecture_evaluation: unrelatedPostArchitecture,
        integrated_verification_evidence: bundle.integrated_verification_evidence,
        trace: durable.inspectRun(runId),
      },
    );
    assert.equal(unrelatedArchitectureResult[0].status, "failed");
    durable.discardStagingStore(staged);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("attestation rejects inverted ordering, false teardown, and fingerprint tampering", () => {
  const base = {
    run_id: "run-attestation",
    task_id: "task-quality",
    dossier_id: "dossier-quality",
    dossier_schema_version: 1,
    dossier_fingerprint: FP_A,
    gate_id: "gate-quality",
    gate_status: "passed",
    gate_fingerprint: FP_B,
    gate_trace_sequence: 2,
    first_implementation_sequence: 3,
    last_implementation_action_sequence: 4,
    last_workspace_mutation_sequence: 4,
    integrated_verification_sequence: 5,
    integrated_verification_evidence_fingerprint: FP_E,
    workspace_at_gate_fingerprint: FP_A,
    final_workspace_fingerprint: FP_B,
    prompt_profile_id: "prompt-main",
    prompt_profile_fingerprint: FP_D,
    post_architecture_evaluation_fingerprint: null,
    context_strategy_id: "standard-lite-local-v1",
    context_sufficiency_decision_fingerprint: FP_C,
    context_reconciliation_fingerprint: FP_E,
    artifact_refs: [
      { kind: "file", value: "quality/dossier.json" },
      { kind: "file", value: "quality/gate.json" },
      { kind: "file", value: "quality/integrated-verification-evidence.json" },
      { kind: "file", value: "quality/context-sufficiency-decision.json" },
      { kind: "file", value: "quality/context-reconciliation.json" },
    ],
    teardown_verified: true,
    attested_at: "2026-07-13T00:05:00Z",
  };
  const valid = createQualityAttestation(base);
  validateQualityAttestation(valid);
  assertContractError(() => createQualityAttestation({ ...base, first_implementation_sequence: 2 }), "QUALITY_ATTESTATION_ORDER");
  assertContractError(() => createQualityAttestation({ ...base, model_profile_id: "not-a-gate" }), "CONTRACT_UNKNOWN_FIELD");
  assertContractError(() => createQualityAttestation({ ...base, teardown_verified: false }), "QUALITY_TEARDOWN_UNVERIFIED");
  const tampered = JSON.parse(JSON.stringify(valid));
  tampered.final_workspace_fingerprint = FP_C;
  assertContractError(() => validateQualityAttestation(tampered), "QUALITY_ATTESTATION_FINGERPRINT");
});

let passed = 0;
for (const { name, callback } of tests) {
  try {
    callback();
    passed += 1;
  } catch (error) {
    process.stderr.write(`Engineering quality self-test failed: ${name}\n${error.stack ?? error}\n`);
    process.exit(1);
  }
}

console.log(`Engineering quality self-tests passed (${passed} tests).`);
