import {
  engineeringDossierAnalysisFingerprint,
  wholeSystemContextReportAnalysisFingerprint,
} from "./whole-system-context-report.mjs";
import {
  ContractError,
  assertArray,
  assertFingerprint,
  assertPlain,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

export const PLAN_CHALLENGE_SUBJECT_SCHEMA_VERSION = 2;

const MAX_CHALLENGE_SNAPSHOT_BYTES = 128 * 1024;

const SUBJECT_KEYS = Object.freeze([
  "schema_version",
  "dossier_analysis_fingerprint",
  "context_strategy_fingerprint",
  "context_report_analysis_fingerprint",
  "context_decision_fingerprint",
  "context_task_profile_evidence_fingerprint",
  "challenge_snapshot",
  "challenge_snapshot_fingerprint",
  "fingerprint",
]);

function conciseImpactGraph(graph) {
  if (graph === null || graph === undefined) return null;
  return {
    graph_id: graph.graph_id,
    nodes: graph.nodes.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      path: entry.path,
      symbol: entry.symbol,
      label: entry.label,
      boundary: entry.boundary,
      confidence: entry.confidence,
      coverage: entry.coverage,
    })),
    edges: graph.edges.map((entry) => ({
      id: entry.id,
      from: entry.from,
      to: entry.to,
      relationship: entry.relationship,
      confidence: entry.confidence,
      coverage: entry.coverage,
    })),
    affected_paths: graph.affected_paths.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      node_ids: [...entry.node_ids],
      edge_ids: [...entry.edge_ids],
      critical: entry.critical,
      verification_node_ids: [...entry.verification_node_ids],
      confidence: entry.confidence,
    })),
    excluded_siblings: graph.excluded_siblings.map((entry) => ({
      id: entry.id,
      path: entry.path,
      rationale: entry.rationale,
      confidence: entry.confidence,
    })),
    unknowns: graph.unknowns.map((entry) => ({
      id: entry.id,
      statement: entry.statement,
      blocking: entry.blocking,
      next_action: entry.next_action,
    })),
    coverage: {
      completeness: graph.coverage.completeness,
      reduced_semantic_coverage: graph.coverage.reduced_semantic_coverage,
      truncated: graph.coverage.truncated,
      truncation_reason: graph.coverage.truncation_reason,
      boundaries: graph.coverage.boundaries.map((entry) => ({
        id: entry.id,
        category: entry.category,
        classification: entry.classification,
        node_ids: [...entry.node_ids],
        edge_ids: [...entry.edge_ids],
        path_ids: [...entry.path_ids],
        unknown_ids: [...entry.unknown_ids],
        excluded_sibling_ids: [...entry.excluded_sibling_ids],
        rationale: entry.rationale,
      })),
    },
  };
}

function conciseContextReport(report) {
  if (report === null || report === undefined) return null;
  return {
    status: report.status,
    wide_analysis: report.wide_analysis.map((entry) => ({
      id: entry.id,
      category: entry.category,
      classification: entry.classification,
      subject_ids: [...entry.subject_ids],
      rationale: entry.rationale,
    })),
    claims: report.claims.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      statement: entry.statement,
      subject_ids: [...entry.subject_ids],
    })),
    questions: report.questions.map((entry) => ({
      id: entry.id,
      question_key: entry.question_key,
      statement: entry.statement,
      expected_observation: entry.expected_observation,
      actual_observation: entry.actual_observation,
      status: entry.status,
      impact_if_wrong: entry.impact_if_wrong,
      next_action: entry.next_action,
    })),
    deep_analyses: report.deep_analyses.map((entry) => ({
      id: entry.id,
      impact_path_id: entry.impact_path_id,
      node_ids: [...entry.node_ids],
      edge_ids: [...entry.edge_ids],
      inputs: [...entry.inputs],
      outputs: [...entry.outputs],
      dimensions: entry.dimensions.map((dimension) => ({
        dimension: dimension.dimension,
        classification: dimension.classification,
        analysis: dimension.analysis,
        not_applicable_reason: dimension.not_applicable_reason,
        verification_ids: [...dimension.verification_ids],
      })),
      unresolved_question_ids: [...entry.unresolved_question_ids],
      test_obligation_ids: [...entry.test_obligation_ids],
    })),
    tool_state: {
      fallback_used: report.tool_state.fallback_used,
      reduced_semantic_coverage: report.tool_state.reduced_semantic_coverage,
      semantic_completeness_claimed: report.tool_state.semantic_completeness_claimed,
      unresolved_truncation_receipt_ids: [...report.tool_state.unresolved_truncation_receipt_ids],
    },
    budget_state: {
      exhausted: report.budget_state.exhausted,
      unresolved_area: report.budget_state.unresolved_area,
    },
  };
}

function challengeSnapshot(dossier, contextReport, contextDecision, taskProfileEvidence) {
  return {
    task: {
      risk_class: dossier.risk_class,
      task_type: dossier.task_type,
      user_visible_goal: dossier.user_visible_goal,
      requested_behavior: dossier.behavior_contract.requested_behavior,
      preserved_behavior: [...dossier.behavior_contract.preserved_behavior],
      compatibility_requirements: [...dossier.behavior_contract.compatibility_requirements],
    },
    blast_radius: {
      affected_areas: dossier.affected_areas.map((entry) => ({
        id: entry.id,
        path: entry.path,
        node_kind: entry.node_kind,
        reason: entry.reason,
        confidence: entry.confidence,
      })),
      entry_points: dossier.entry_points.map((entry) => ({
        id: entry.id,
        path: entry.path,
        symbol: entry.symbol,
        reason: entry.reason,
      })),
      impact_graph: conciseImpactGraph(dossier.impact_graph),
    },
    ownership: {
      ownership_paths: [...dossier.verification_boundary.ownership_paths],
      implementation_slices: dossier.implementation_slices.map((entry) => ({
        id: entry.id,
        owner: entry.owner,
        intent: entry.intent,
        write_scope: [...entry.write_scope],
        depends_on_slice_ids: [...entry.depends_on_slice_ids],
      })),
    },
    failure_and_recovery: {
      failure_modes: dossier.failure_modes.map((entry) => ({
        id: entry.id,
        category: entry.category,
        trigger: entry.trigger,
        impact: entry.impact,
        expected_handling: entry.expected_handling,
        scope_ids: [...entry.scope_ids],
      })),
      edge_cases: dossier.edge_cases.map((entry) => ({
        id: entry.id,
        category: entry.category,
        condition: entry.condition,
        expected_behavior: entry.expected_behavior,
        scope_ids: [...entry.scope_ids],
      })),
      rollback_recovery: {
        rollback_expectation: dossier.rollback_recovery.rollback_expectation,
        recovery_expectation: dossier.rollback_recovery.recovery_expectation,
      },
    },
    verification: {
      boundary_check_ids: [...dossier.verification_boundary.check_ids],
      integration_check_ids: [...dossier.verification_boundary.integration_check_ids],
      plan: {
        baseline_check_ids: [...dossier.verification_plan.baseline_check_ids],
        slice_check_ids: [...dossier.verification_plan.slice_check_ids],
        integration_check_ids: [...dossier.verification_plan.integration_check_ids],
        architecture_check_ids: [...dossier.verification_plan.architecture_check_ids],
        regression_check_ids: [...dossier.verification_plan.regression_check_ids],
        hidden_check_ids: [...dossier.verification_plan.hidden_check_ids],
      },
      obligations: dossier.test_obligations.map((entry) => ({
        id: entry.id,
        check_id: entry.check_id,
        kind: entry.kind,
        phase: entry.phase,
        scope_ids: [...entry.scope_ids],
        command_or_mechanism: entry.command_or_mechanism,
        required: entry.required,
      })),
    },
    context: {
      report: conciseContextReport(contextReport),
      decision: contextDecision === null ? null : {
        status: contextDecision.status,
        reasons: contextDecision.reasons.map((entry) => ({
          code: entry.code,
          summary: entry.summary,
          subject_ids: [...entry.subject_ids],
        })),
      },
      task_profile: taskProfileEvidence === null ? null : {
        checks: taskProfileEvidence.checks.map((entry) => ({
          obligation_id: entry.obligation_id,
          check_id: entry.check_id,
          purpose: entry.purpose,
          phase: entry.phase,
          status: entry.status,
          observed_outcome: entry.observed_outcome,
          command_or_mechanism: entry.command_or_mechanism,
        })),
      },
    },
  };
}

export function validatePlanChallengeSubject(value) {
  exact(value, SUBJECT_KEYS, SUBJECT_KEYS, "plan challenge subject");
  if (value.schema_version !== PLAN_CHALLENGE_SUBJECT_SCHEMA_VERSION) {
    throw new ContractError("QUALITY_PLAN_CHALLENGE_SUBJECT", "plan challenge subject schema is unsupported");
  }
  for (const key of SUBJECT_KEYS.filter((entry) => !["schema_version", "fingerprint"].includes(entry))) {
    if (key === "challenge_snapshot") continue;
    assertFingerprint(value[key], `plan challenge subject.${key}`);
  }
  assertPlain(value.challenge_snapshot, "plan challenge subject.challenge_snapshot");
  const snapshotBytes = Buffer.byteLength(JSON.stringify(value.challenge_snapshot), "utf8");
  if (snapshotBytes === 0 || snapshotBytes > MAX_CHALLENGE_SNAPSHOT_BYTES
    || !fingerprintsEqual(value.challenge_snapshot_fingerprint, fingerprint(value.challenge_snapshot))) {
    throw new ContractError("QUALITY_PLAN_CHALLENGE_SUBJECT", "plan challenge snapshot is invalid or exceeds its bounded size");
  }
  assertFingerprint(value.fingerprint, "plan challenge subject.fingerprint");
  const source = { ...value };
  delete source.fingerprint;
  if (!fingerprintsEqual(value.fingerprint, fingerprint(source))) {
    throw new ContractError("QUALITY_PLAN_CHALLENGE_SUBJECT", "plan challenge subject fingerprint is invalid");
  }
  return value;
}

export function createPlanChallengeSubject({
  dossier,
  strategy_binding: strategyBinding,
  context_report: contextReport,
  context_decision: contextDecision,
  task_profile_evidence: taskProfileEvidence,
} = {}) {
  if (dossier?.risk_class === "standard-lite") {
    const notApplicable = fingerprint({ mode: "standard-lite-not-applicable" });
    const snapshot = challengeSnapshot(dossier, null, null, null);
    const source = {
      schema_version: PLAN_CHALLENGE_SUBJECT_SCHEMA_VERSION,
      dossier_analysis_fingerprint: engineeringDossierAnalysisFingerprint(dossier),
      context_strategy_fingerprint: strategyBinding.fingerprint,
      context_report_analysis_fingerprint: wholeSystemContextReportAnalysisFingerprint(null),
      context_decision_fingerprint: notApplicable,
      context_task_profile_evidence_fingerprint: notApplicable,
      challenge_snapshot: snapshot,
      challenge_snapshot_fingerprint: fingerprint(snapshot),
    };
    const subject = { ...source, fingerprint: fingerprint(source) };
    validatePlanChallengeSubject(subject);
    return deepFrozenClone(subject, "standard-lite plan challenge subject");
  }
  if (contextReport?.status !== "finalized" || contextDecision?.status !== "sufficient" || taskProfileEvidence === null) {
    throw new ContractError(
      "QUALITY_PLAN_CHALLENGE_BEFORE_CONTEXT_SUFFICIENCY",
      "formal plan challenge evidence requires a finalized current report and runner-owned sufficient context decision",
    );
  }
  const dossierAnalysisFingerprint = engineeringDossierAnalysisFingerprint(dossier);
  if (!fingerprintsEqual(contextDecision.dossier_analysis_fingerprint, dossierAnalysisFingerprint)
    || !fingerprintsEqual(contextDecision.strategy_binding_fingerprint, strategyBinding?.fingerprint)
    || !fingerprintsEqual(contextDecision.report_fingerprint, contextReport.fingerprint)
    || !fingerprintsEqual(contextDecision.task_profile_evidence?.fingerprint, taskProfileEvidence.fingerprint)) {
    throw new ContractError("QUALITY_PLAN_CHALLENGE_STALE", "runner-owned context artifacts do not bind one current challenge subject");
  }
  const snapshot = challengeSnapshot(dossier, contextReport, contextDecision, taskProfileEvidence);
  const source = {
    schema_version: PLAN_CHALLENGE_SUBJECT_SCHEMA_VERSION,
    dossier_analysis_fingerprint: dossierAnalysisFingerprint,
    context_strategy_fingerprint: strategyBinding.fingerprint,
    context_report_analysis_fingerprint: wholeSystemContextReportAnalysisFingerprint(contextReport),
    context_decision_fingerprint: contextDecision.fingerprint,
    context_task_profile_evidence_fingerprint: taskProfileEvidence.fingerprint,
    challenge_snapshot: snapshot,
    challenge_snapshot_fingerprint: fingerprint(snapshot),
  };
  const subject = { ...source, fingerprint: fingerprint(source) };
  validatePlanChallengeSubject(subject);
  return deepFrozenClone(subject, "plan challenge subject");
}

export function assertCurrentPlanChallengeReceipts({
  plan_challenge_receipts: receipts,
  dossier,
  strategy_binding: strategyBinding,
  context_report: contextReport,
  context_decision: contextDecision,
  task_profile_evidence: taskProfileEvidence,
} = {}) {
  assertArray(receipts, "current plan challenge receipts", { max: 2 });
  if (dossier?.risk_class === "standard-lite") {
    if (receipts.length !== 0) {
      throw new ContractError("QUALITY_PLAN_CHALLENGE_STALE", "standard-lite cannot persist formal plan challenge receipts");
    }
    return createPlanChallengeSubject({
      dossier,
      strategy_binding: strategyBinding,
      context_report: null,
      context_decision: null,
      task_profile_evidence: null,
    });
  }
  if (receipts.length !== 2) {
    throw new ContractError(
      "QUALITY_PLAN_CHALLENGE_STALE",
      "high-assurance work requires exactly one current architect receipt and one current reviewer receipt",
    );
  }
  const subject = createPlanChallengeSubject({
    dossier,
    strategy_binding: strategyBinding,
    context_report: contextReport,
    context_decision: contextDecision,
    task_profile_evidence: taskProfileEvidence,
  });
  if (contextDecision.session_key !== contextReport?.session_key
    || contextDecision.run_id !== dossier?.run_id
    || contextDecision.task_id !== dossier?.task_id
    || contextDecision.dossier_id !== dossier?.dossier_id
    || contextReport?.run_id !== dossier?.run_id
    || contextReport?.task_id !== dossier?.task_id
    || contextReport?.dossier_id !== dossier?.dossier_id
    || taskProfileEvidence?.session_key !== contextDecision.session_key
    || taskProfileEvidence?.run_id !== dossier?.run_id
    || taskProfileEvidence?.task_id !== dossier?.task_id
    || taskProfileEvidence?.dossier_id !== dossier?.dossier_id) {
    throw new ContractError("QUALITY_PLAN_CHALLENGE_STALE", "current plan challenge artifacts cross session, run, task, or Dossier identities");
  }
  const roles = new Set();
  for (const receipt of receipts) {
    if (roles.has(receipt.role)) {
      throw new ContractError("QUALITY_PLAN_CHALLENGE_STALE", "current plan challenge receipts duplicate a role");
    }
    roles.add(receipt.role);
    const expectedResultId = receipt.role === "architect"
      ? dossier.plan_challenge.architect_result_id
      : receipt.role === "reviewer" ? dossier.plan_challenge.reviewer_result_id : null;
    if (receipt.session_key !== contextDecision.session_key
      || receipt.run_id !== dossier.run_id
      || receipt.task_id !== dossier.task_id
      || receipt.dossier_id !== dossier.dossier_id
      || receipt.result_id !== expectedResultId
      || receipt.dossier_analysis_fingerprint !== subject.dossier_analysis_fingerprint
      || receipt.context_strategy_fingerprint !== subject.context_strategy_fingerprint
      || receipt.context_report_fingerprint !== contextReport.fingerprint
      || receipt.context_report_analysis_fingerprint !== subject.context_report_analysis_fingerprint
      || receipt.context_decision_fingerprint !== subject.context_decision_fingerprint
      || receipt.context_task_profile_evidence_fingerprint !== subject.context_task_profile_evidence_fingerprint
      || receipt.subject_fingerprint !== subject.fingerprint) {
      throw new ContractError("QUALITY_PLAN_CHALLENGE_STALE", `${receipt.role ?? "unknown"} plan challenge receipt does not bind the current artifact set`);
    }
  }
  if (!roles.has("architect") || !roles.has("reviewer")) {
    throw new ContractError(
      "QUALITY_PLAN_CHALLENGE_STALE",
      "high-assurance work requires distinct current architect and reviewer receipts",
    );
  }
  return subject;
}
