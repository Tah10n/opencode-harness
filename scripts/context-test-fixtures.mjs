import { createEngineeringDossierDraft } from "../lib/quality/dossier.mjs";
import { buildEngineeringImpactGraph, IMPACT_BOUNDARY_CATEGORIES } from "../lib/quality/impact-graph.mjs";
import { beginContextReceiptOperation, completeContextReceiptOperation } from "../lib/quality/context-receipts.mjs";
import { selectMinimumContextStrategy } from "../lib/quality/context-strategies.mjs";
import { createContextTaskProfileEvidence } from "../lib/quality/context-sufficiency.mjs";
import { CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION } from "../lib/quality/context-tool-adapters.mjs";
import { fingerprint } from "../lib/quality/validation.mjs";

export const CONTEXT_TEST_TIME = "2026-07-17T10:00:00.000Z";
export const CONTEXT_TEST_FINAL_TIME = "2026-07-17T10:05:00.000Z";
export const CONTEXT_TEST_WORKSPACE = fingerprint({ head: "bda98ee530a2c0de45b7504bd37b56d7f8545b4d", dirty: [] });
export const CONTEXT_TEST_SESSION_KEY = fingerprint({ purpose: "context-test-session" }).slice("sha256:".length);
const START_COMMIT = "bda98ee530a2c0de45b7504bd37b56d7f8545b4d";

export function contextReadToolOutput(relativePath, identity = "context-test-read") {
  const text = "bounded fixture source";
  const bytes = Buffer.byteLength(text, "utf8");
  const truncation = Object.fromEntries([
    "inventoryLimitReached", "resultLimitReached", "matchLimitReached", "byteLimitReached",
    "lineLimitReached", "durationLimitReached", "excerptTruncated", "contextBeforeTruncated",
    "contextAfterTruncated", "symbolLimitReached", "relationshipLimitReached", "snapshotChanged",
    "coveragePartial",
  ].map((key) => [key, false]));
  return JSON.stringify({
    schemaVersion: CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION,
    tool: "context_read",
    worktree: ".",
    scope: { path: relativePath, filters: {} },
    snapshot: {
      fingerprint: fingerprint({ relativePath, identity }).slice("sha256:".length),
      fingerprintKind: "content",
      fingerprintScope: relativePath,
      complete: true,
      stable: true,
      changedDuringOperation: false,
      truncationReasons: [],
    },
    coverage: {
      candidateFiles: 1,
      scannedFiles: 1,
      bytesScanned: bytes,
      skippedSecret: 0,
      skippedGenerated: 0,
      skippedLarge: 0,
      skippedUnreadable: 0,
      unsupportedLanguages: {},
      truncation,
      truncationReasons: [],
      partial: false,
    },
    limits: {},
    usage: { files: 1, directories: 0, bytes, lines: 1, matches: 0, ranges: 1 },
    truncated: false,
    ok: true,
    path: relativePath,
    sha256: fingerprint({ relativePath, text }).slice("sha256:".length),
    bytes,
    totalLines: 1,
    selectedRange: { startLine: 1, endLine: 1 },
    encoding: "utf-8",
    stableDuringRead: true,
    truncatedBefore: false,
    truncatedAfter: false,
    text,
  });
}

function boundary(category, references = {}, rationale = null, evidenceRefs = null) {
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
    evidence_refs: evidenceRefs ?? [{ kind: "file", value: "lib/context-example.mjs" }],
  };
}

export function contextTestImpactGraph(riskClass = "high", { transitiveImpact = "represented" } = {}) {
  if (!["represented", "excluded"].includes(transitiveImpact)) {
    throw new Error("context test transitive impact must be represented or excluded");
  }
  const transitiveExcluded = transitiveImpact === "excluded";
  const boundaryByCategory = {
    direct_affected_paths: boundary("direct_affected_paths", { path_ids: ["BLAST-direct"] }),
    transitive_affected_paths: transitiveExcluded
      ? boundary(
        "transitive_affected_paths",
        {},
        "A complete bounded inventory and content inspection found no consumer beyond the owning service.",
        [{ kind: "runtime", value: "CTXRECEIPT-001" }],
      )
      : boundary("transitive_affected_paths", { path_ids: ["BLAST-transitive"] }),
    externally_reachable_entry_points: boundary("externally_reachable_entry_points", { node_ids: ["NODE-entry"] }),
    downstream_state_or_side_effects: transitiveExcluded
      ? boundary("downstream_state_or_side_effects", {}, "The bounded component has no downstream state or external side-effect edge.")
      : boundary("downstream_state_or_side_effects", { node_ids: ["NODE-store"], edge_ids: ["EDGE-service-store"] }),
    cross_boundary_contracts: transitiveExcluded
      ? boundary("cross_boundary_contracts", { node_ids: ["NODE-entry"], edge_ids: ["EDGE-entry-service"] })
      : boundary("cross_boundary_contracts", { node_ids: ["NODE-entry", "NODE-store"], edge_ids: ["EDGE-entry-service", "EDGE-service-store"] }),
    critical_path_tests: boundary("critical_path_tests", {
      node_ids: ["NODE-test"],
      path_ids: transitiveExcluded ? ["BLAST-direct"] : ["BLAST-direct", "BLAST-transitive"],
    }),
    relevant_unknown_paths: boundary("relevant_unknown_paths", {}, "bounded scan found no unresolved relevant path"),
    excluded_sibling_paths: boundary("excluded_sibling_paths", { excluded_sibling_ids: ["EXCLUDED-docs"] }),
  };
  const evidence = [{ kind: "file", value: "lib/context-example.mjs" }];
  return buildEngineeringImpactGraph({
    graph_id: `GRAPH-context-${riskClass}`,
    risk_class: riskClass,
    nodes: [
      { id: "NODE-entry", kind: "public_api", path: "lib/context-example.mjs", symbol: "run", label: "entry", boundary: "entry_point", confidence: "observed", coverage: "complete", evidence_refs: evidence },
      { id: "NODE-service", kind: "module", path: "lib/context-service.mjs", symbol: "apply", label: "owner", boundary: "module", confidence: "observed", coverage: "complete", evidence_refs: evidence },
      ...(transitiveExcluded ? [] : [{ id: "NODE-store", kind: "data_store", path: "lib/context-store.mjs", symbol: "save", label: "store", boundary: "persistence", confidence: "observed", coverage: "complete", evidence_refs: evidence }]),
      { id: "NODE-test", kind: "test", path: "scripts/verify-context-sufficiency.mjs", symbol: null, label: "verification", boundary: "operational", confidence: "observed", coverage: "complete", evidence_refs: [{ kind: "file", value: "scripts/verify-context-sufficiency.mjs" }] },
    ],
    edges: [
      { id: "EDGE-entry-service", from: "NODE-entry", to: "NODE-service", relationship: "calls", confidence: "observed", coverage: "complete", evidence_refs: evidence },
      ...(transitiveExcluded ? [] : [{ id: "EDGE-service-store", from: "NODE-service", to: "NODE-store", relationship: "writes", confidence: "observed", coverage: "complete", evidence_refs: evidence }]),
      { id: "EDGE-test-service", from: "NODE-test", to: "NODE-service", relationship: "verifies", confidence: "observed", coverage: "complete", evidence_refs: [{ kind: "file", value: "scripts/verify-context-sufficiency.mjs" }] },
    ],
    affected_paths: [
      { id: "BLAST-direct", kind: "direct", node_ids: ["NODE-entry", "NODE-service"], edge_ids: ["EDGE-entry-service"], critical: true, verification_node_ids: ["NODE-test"], confidence: "observed", evidence_refs: evidence },
      ...(transitiveExcluded ? [] : [{ id: "BLAST-transitive", kind: "transitive", node_ids: ["NODE-entry", "NODE-service", "NODE-store"], edge_ids: ["EDGE-entry-service", "EDGE-service-store"], critical: true, verification_node_ids: ["NODE-test"], confidence: "observed", evidence_refs: evidence }]),
    ],
    excluded_siblings: [{ id: "EXCLUDED-docs", path: "docs/harness-map.md", reason: "documentation does not import or execute the runtime path", confidence: "observed", evidence_refs: [{ kind: "file", value: "docs/harness-map.md" }] }],
    unknowns: [],
    coverage: {
      completeness: "complete",
      semantic_tool_status: "unavailable",
      semantic_tools: [],
      fallback_tools: ["context_search", "context_read"],
      reduced_semantic_coverage: true,
      truncated: false,
      truncation_reason: null,
      available_evaluator_ids: ["context-test-graph", "dependency-graph-v1"],
      unavailable_evaluator_ids: [],
      boundaries: IMPACT_BOUNDARY_CATEGORIES.map((category) => boundaryByCategory[category]),
      evidence_refs: [{ kind: "check", value: "context-test-graph" }],
    },
  });
}

function directMapping() {
  return {
    classification: "applicable_directly_tested",
    check_ids: ["context-regression"],
    mechanism_ids: [],
    evidence_refs: [{ kind: "check", value: "context-regression" }],
    rationale: null,
    blocked_reason: null,
    external_dependency: null,
  };
}

export function contextTestDossier({
  riskClass = "high",
  taskType = "bug_fix",
  additionalTestObligations = [],
  transitiveImpact = "represented",
} = {}) {
  const full = ["high", "critical"].includes(riskClass);
  const preChangeObligations = ["bug_fix", "diagnosis_driven_implementation"].includes(taskType)
    ? [{ id: "TEST-reproducer", check_id: "context-reproducer", kind: "reproducer", phase: "preimplementation", scope_ids: ["AREA-main"], command_or_mechanism: "node scripts/verify-context-reproducer.mjs", required: true, trusted_producer: "opencode-harness-context-verifier" }]
    : ["behavior_preserving_refactor", "migration"].includes(taskType)
      ? [{ id: "TEST-characterization", check_id: "context-characterization", kind: "characterization", phase: "preimplementation", scope_ids: ["AREA-main"], command_or_mechanism: "node scripts/verify-context-characterization.mjs", required: true, trusted_producer: "opencode-harness-context-verifier" }]
      : [];
  return createEngineeringDossierDraft({
    dossier_id: `dossier-context-${riskClass}-${taskType}`,
    run_id: `run-context-${riskClass}-${taskType}`,
    task_id: `task-context-${riskClass}-${taskType}`,
    risk_class: riskClass,
    mode: full ? "full" : "standard-lite",
    task_type: taskType,
    user_visible_goal: "Verify the wide/deep context contract before implementation.",
    starting_commit: START_COMMIT,
    created_at: CONTEXT_TEST_TIME,
    affected_areas: [{ id: "AREA-main", path: "lib/context-example.mjs", node_kind: "file", reason: "bounded implementation owner", confidence: "observed", evidence_refs: [{ kind: "file", value: "lib/context-example.mjs" }] }],
    invariants: [{ id: "INV-preserve", statement: "public behavior remains compatible", scope_ids: ["AREA-main"], mapping: directMapping() }],
    edge_cases: [{ id: "EDGE-empty", category: "null_absent_empty_malformed_unsupported", condition: "empty input", expected_behavior: "stable rejection", scope_ids: ["AREA-main"], mapping: directMapping() }],
    failure_modes: [{ id: "FAIL-store", category: "partial_success_partial_failure", trigger: "store failure", impact: "partial side effect", expected_handling: "rollback", scope_ids: ["AREA-main"], mapping: directMapping() }],
    test_obligations: [
      ...preChangeObligations,
      { id: "TEST-context", check_id: "context-regression", kind: "integration", phase: "integration", scope_ids: ["AREA-main"], command_or_mechanism: "node scripts/verify-context-sufficiency.mjs", required: true, trusted_producer: "opencode-harness-context-verifier" },
      ...additionalTestObligations,
    ],
    impact_graph: full ? contextTestImpactGraph(riskClass, { transitiveImpact }) : null,
    context_coverage: {
      status: "complete",
      affected_area_ids: ["AREA-main"],
      covered_area_ids: ["AREA-main"],
      truncated_area_ids: [],
      accepted_gap_ids: [],
      evidence_refs: [{ kind: "file", value: "lib/context-example.mjs" }],
    },
  });
}

export function contextTestReceipt({
  receiptId = "CTXRECEIPT-001",
  sequence = 1,
  dossier = contextTestDossier(),
  workspaceFingerprint = CONTEXT_TEST_WORKSPACE,
  sessionKey = CONTEXT_TEST_SESSION_KEY,
  toolId = "context_batch_read",
  availableToolIds = ["context_outline", "context_files", "context_search", "context_read", "context_batch_read"],
  observedPaths = null,
  truncated = false,
  mutationRevisionStarted = 0,
  mutationRevisionCompleted = 0,
  startedAt = "2026-07-17T10:03:00.000Z",
  completedAt = "2026-07-17T10:04:00.000Z",
  previousReceiptFingerprint = null,
  evidenceRefs = null,
} = {}) {
  if (!["context_outline", "context_files", "context_search", "context_read", "context_batch_read"].includes(toolId)) throw new Error("context test receipt supports outline, files, search, read, and batch-read tools only");
  let paths = [...new Set(observedPaths ?? [
    "AGENTS.md",
    ...(dossier.impact_graph?.nodes ?? []).map((entry) => entry.path).filter(Boolean),
    ...(dossier.impact_graph?.excluded_siblings ?? []).map((entry) => entry.path),
    ...dossier.affected_areas.map((entry) => entry.path),
  ])].sort();
  if (toolId === "context_read") paths = paths.slice(0, 1);
  const salt = fingerprint({ purpose: "context-test-salt" });
  const strategy = selectMinimumContextStrategy({ risk_class: dossier.risk_class, task_type: dossier.task_type });
  const pending = beginContextReceiptOperation({
    receipt_id: receiptId,
    sequence,
    previous_receipt_fingerprint: previousReceiptFingerprint,
    session_key: sessionKey,
    parent_session_key: null,
    producer_session_key: sessionKey,
    producer_role: "runner",
    run_id: dossier.run_id,
    task_id: dossier.task_id,
    worktree_fingerprint: workspaceFingerprint,
    source_fingerprint: workspaceFingerprint,
    context_strategy_id: strategy.strategy_id,
    context_strategy_fingerprint: strategy.fingerprint,
    parent_question_id: null,
    evidence_refs: evidenceRefs ?? paths.slice(0, 6).map((value) => ({ kind: "file", value })),
    mutation_revision_started: mutationRevisionStarted,
    tool_id: toolId,
    call_key_fingerprint: fingerprint({ receiptId, sequence }),
    started_at: startedAt,
    args: toolId === "context_outline"
      ? {}
       : toolId === "context_files"
       ? { path: ".", limit: 128 }
       : toolId === "context_search"
       ? { query: "bounded", path: ".", contextLines: 0 }
       : toolId === "context_read"
       ? { path: paths[0], startLine: 1, maxLines: 1 }
      : { ranges: paths.map((entry) => ({ path: entry, startLine: 1, maxLines: 1 })) },
    fingerprint_salt: salt,
  });
  const output = JSON.stringify({
    schemaVersion: CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION,
    tool: toolId,
    worktree: ".",
    scope: { path: ".", filters: {} },
    snapshot: {
      fingerprint: fingerprint({ paths, sequence }).slice("sha256:".length),
      fingerprintKind: "metadata",
      fingerprintScope: ".",
      complete: !truncated,
      stable: true,
      changedDuringOperation: false,
      truncationReasons: [],
    },
    coverage: {
      candidateFiles: paths.length,
      scannedFiles: paths.length,
      bytesScanned: paths.length * 32,
      skippedSecret: 0,
      skippedGenerated: 0,
      skippedLarge: 0,
      skippedUnreadable: 0,
      unsupportedLanguages: {},
      truncation: {
        inventoryLimitReached: false,
        resultLimitReached: truncated,
        matchLimitReached: false,
        byteLimitReached: false,
        lineLimitReached: false,
        durationLimitReached: false,
        excerptTruncated: false,
        contextBeforeTruncated: false,
        contextAfterTruncated: false,
        symbolLimitReached: false,
        relationshipLimitReached: false,
        snapshotChanged: false,
        coveragePartial: truncated,
      },
      truncationReasons: [],
      partial: truncated,
    },
    limits: {},
    usage: { files: paths.length, directories: 1, bytes: paths.length * 32, lines: paths.length, matches: toolId === "context_search" ? paths.length : 0, ranges: ["context_search", "context_read", "context_batch_read"].includes(toolId) ? paths.length : 0 },
    truncated,
    ...(toolId === "context_outline"
      ? {
        guidance: paths.filter((entry) => /(^|\/)(AGENTS|WORKFLOW|README)\.md$/iu.test(entry))
          .map((entry) => ({ path: entry, appliesTo: "." })),
        filesSample: paths.map((entry) => ({ path: entry, size: 32 })),
        tools: [...availableToolIds],
        toolset: availableToolIds.some((entry) => entry.startsWith("context_") && !["context_outline", "context_files", "context_search", "context_read"].includes(entry)) ? "advanced" : "minimal",
        explicitEnabledTools: [],
      }
      : toolId === "context_files"
       ? { files: paths.map((entry) => ({ path: entry, size: 32 })) }
      : toolId === "context_search"
        ? {
          query: "bounded",
          scanned: paths.length,
          matches: paths.map((entry) => ({
            path: entry,
            line: 1,
            text: "bounded fixture source",
            textTruncated: false,
            fileSha256: fingerprint({ entry, sequence }).slice("sha256:".length),
            contextBefore: [],
            contextAfter: [],
          })),
          matchedFiles: paths.map((entry) => ({
            path: entry,
            sha256: fingerprint({ entry, sequence }).slice("sha256:".length),
            bytes: 32,
            matches: 1,
          })),
          matchedFileCount: paths.length,
          totalBytesScanned: paths.length * 32,
        }
      : toolId === "context_read"
        ? {
          path: paths[0],
          ok: true,
          sha256: fingerprint({ entry: paths[0], sequence }).slice("sha256:".length),
          bytes: 32,
          totalLines: 1,
          selectedRange: { startLine: 1, endLine: 1 },
          encoding: "utf-8",
          stableDuringRead: true,
          truncatedBefore: false,
          truncatedAfter: false,
          text: "bounded fixture source",
        }
      : {
        results: paths.map((entry) => ({
          path: entry,
          ok: true,
          sha256: fingerprint({ entry, sequence }).slice("sha256:".length),
          bytes: 32,
          totalLines: 1,
          selectedRange: { startLine: 1, endLine: 1 },
          encoding: "utf-8",
          stableDuringRead: true,
          truncatedBefore: false,
          truncatedAfter: false,
          text: "bounded fixture source",
        })),
    }),
  });
  return completeContextReceiptOperation(pending, {
    output,
    completed_at: completedAt,
    mutation_revision_completed: mutationRevisionCompleted,
    fingerprint_salt: salt,
  });
}

export function contextTestTaskProfileEvidence({
  dossier = contextTestDossier(),
  sessionKey = CONTEXT_TEST_SESSION_KEY,
  workspaceFingerprint = CONTEXT_TEST_WORKSPACE,
  evidenceId = `CTXPROFILE-${dossier.risk_class}-${dossier.task_type}`,
  checks = null,
  completedAt = "2026-07-17T10:04:15.000Z",
  createdAt = "2026-07-17T10:04:30.000Z",
} = {}) {
  const evidenceChecks = checks ?? dossier.test_obligations
    .filter((entry) => entry.phase === "preimplementation" && ["reproducer", "characterization"].includes(entry.kind))
    .map((entry) => ({
      obligation_id: entry.id,
      check_id: entry.check_id,
      purpose: entry.kind,
      phase: "preimplementation",
      status: "passed",
      observed_outcome: entry.kind === "reproducer" ? "failing_reproducer" : "passing_characterization",
      trusted_producer: entry.trusted_producer,
      command_or_mechanism: entry.command_or_mechanism,
      evidence_fingerprint: fingerprint({ check_id: entry.check_id, outcome: entry.kind }),
      completed_at: completedAt,
    }));
  return createContextTaskProfileEvidence({
    evidence_id: evidenceId,
    session_key: sessionKey,
    workspace_fingerprint: workspaceFingerprint,
    dossier,
    checks: evidenceChecks,
    created_at: createdAt,
  });
}

export function completeContextContent({
  strategyBinding,
  dossier,
  receiptId = "CTXRECEIPT-001",
  receiptIds = null,
  minimalAvailable = ["context_outline", "context_files", "context_search", "context_read"],
  advancedAvailable = ["context_batch_read"],
  readOnlySubagents = 0,
}) {
  const evidenceReceiptIds = receiptIds === null ? [receiptId] : [...receiptIds];
  const invariantId = dossier.invariants[0]?.id;
  const edgeCaseId = dossier.edge_cases[0]?.id;
  const failureModeId = dossier.failure_modes[0]?.id;
  const testObligationId = dossier.test_obligations.find((entry) => entry.phase === "integration")?.id
    ?? dossier.test_obligations[0]?.id;
  const reproductionObligationId = dossier.test_obligations.find((entry) => entry.phase === "preimplementation" && entry.kind === "reproducer")?.id;
  const characterizationObligationId = dossier.test_obligations.find((entry) => entry.phase === "preimplementation" && entry.kind === "characterization")?.id;
  if (![invariantId, edgeCaseId, failureModeId, testObligationId].every(Boolean)) {
    throw new Error("complete context content requires an invariant, edge case, failure mode, and test obligation");
  }
  const graphSubjects = [
    ...dossier.impact_graph.nodes.map((entry) => entry.id),
    ...dossier.impact_graph.edges.map((entry) => entry.id),
    ...dossier.impact_graph.affected_paths.map((entry) => entry.id),
    ...dossier.impact_graph.excluded_siblings.map((entry) => entry.id),
  ];
  const wideBoundaryMap = {
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
  };
  const boundaryByCategory = new Map(dossier.impact_graph.coverage.boundaries.map((entry) => [entry.category, entry]));
  const isReasonedExcluded = (category) => {
    const mapped = (wideBoundaryMap[category] ?? []).map((entry) => boundaryByCategory.get(entry)).filter(Boolean);
    return mapped.length > 0 && mapped.every((entry) => entry.classification === "reasoned_excluded");
  };
  const claims = strategyBinding.required_wide_categories.map((category, index) => ({
    id: `CLAIM-wide-${index}`,
    kind: isReasonedExcluded(category) ? "reasoned_exclusion" : "observed",
    statement: `Bounded context evidence represents ${category} for the affected system.`,
    subject_ids: graphSubjects,
    receipt_ids: evidenceReceiptIds,
  }));
  const wideAnalysis = strategyBinding.required_wide_categories.map((category, index) => {
    const reasonedExcluded = isReasonedExcluded(category);
    return {
      id: `WIDE-${index}`,
      category,
      classification: reasonedExcluded ? "reasoned_excluded" : "represented",
      claim_ids: [`CLAIM-wide-${index}`],
      subject_ids: graphSubjects,
      receipt_ids: evidenceReceiptIds,
      rationale: reasonedExcluded ? "the runner-owned impact graph reasoned-excludes every mapped boundary" : null,
    };
  });
  const pathQuestionKeys = strategyBinding.required_questions.filter((entry) => entry !== "sibling_variants");
  const questions = dossier.impact_graph.affected_paths.filter((entry) => entry.critical).map((path, index) => ({
    id: `QUESTION-path-${index}`,
    question_key: pathQuestionKeys[index % pathQuestionKeys.length],
    statement: `A counterexample cannot bypass the invariant on ${path.id}.`,
    expected_observation: "The bounded negative path is rejected before a side effect.",
    actual_observation: "The negative path is rejected and the side effect remains absent.",
    status: "confirmed",
    receipt_ids: evidenceReceiptIds,
    impact_if_wrong: "high",
    next_action: null,
    applied_update_ids: [],
    applied_update_fingerprint: null,
  }));
  if (strategyBinding.requires_sibling_variant_discovery) questions.push({
    id: "QUESTION-sibling",
    question_key: "sibling_variants",
    statement: "No applicable sibling variant retains the same root defect.",
    expected_observation: "Sibling implementations share the corrected owning abstraction.",
    actual_observation: "The bounded sibling scan found all variants routed through the owner.",
    status: "confirmed",
    receipt_ids: evidenceReceiptIds,
    impact_if_wrong: "high",
    next_action: null,
    applied_update_ids: [],
    applied_update_fingerprint: null,
  });
  for (const [index, questionKey] of strategyBinding.required_questions.entries()) {
    if (questions.some((entry) => entry.question_key === questionKey)) continue;
    questions.push({
      id: `QUESTION-required-${index}`,
      question_key: questionKey,
      statement: `The bounded ${questionKey} assumption matches the linked impact graph and verification plan.`,
      expected_observation: `Receipt-backed evidence resolves ${questionKey} without expanding the planned blast radius.`,
      actual_observation: `The observed paths and mapped checks resolve ${questionKey} for this task.`,
      status: "confirmed",
      receipt_ids: evidenceReceiptIds,
      impact_if_wrong: "high",
      next_action: null,
      applied_update_ids: [],
      applied_update_fingerprint: null,
    });
  }
  const deepAnalyses = dossier.impact_graph.affected_paths.filter((entry) => entry.critical).map((path, index) => ({
    id: `DEEP-${index}`,
    impact_path_id: path.id,
    node_ids: path.node_ids,
    edge_ids: path.edge_ids,
    symbol_ids: ["run", "apply"],
    inputs: ["validated request"],
    outputs: ["compatible result or stable error"],
    dimensions: strategyBinding.required_deep_dimensions.map((dimension) => ({
      dimension,
      classification: "applicable",
      analysis: `${dimension} is bounded by the linked invariant and regression obligation.`,
      not_applicable_reason: null,
      receipt_ids: evidenceReceiptIds,
      verification_ids: [testObligationId],
    })),
    falsification_question_id: `QUESTION-path-${index}`,
    invariant_ids: [invariantId],
    edge_case_ids: [edgeCaseId],
    failure_mode_ids: [failureModeId],
    test_obligation_ids: [testObligationId],
    unresolved_question_ids: [],
    receipt_ids: evidenceReceiptIds,
  }));
  return {
    wide_analysis: wideAnalysis,
    claims,
    deep_analyses: deepAnalyses,
    questions,
    task_evidence: {
      owning_abstraction_claim_id: ["bug_fix", "diagnosis_driven_implementation"].includes(strategyBinding.task_profile) ? "CLAIM-wide-0" : null,
      sibling_variant_question_ids: strategyBinding.requires_sibling_variant_discovery ? ["QUESTION-sibling"] : [],
      characterization_test_ids: strategyBinding.requires_characterization ? [characterizationObligationId] : [],
      negative_path_ids: strategyBinding.requires_negative_path ? [edgeCaseId] : [],
      compatibility_ids: strategyBinding.requires_compatibility ? [invariantId] : [],
      reproduction_status: strategyBinding.requires_pre_change_reproduction ? "reproduced" : "not_required",
      reproduction_evidence_ids: strategyBinding.requires_pre_change_reproduction ? [reproductionObligationId] : [],
    },
    tool_state: {
      minimal_available: [...minimalAvailable].sort(),
      advanced_available: [...advancedAvailable].sort(),
      advanced_unavailable: ["context_map", "context_batch_read", "context_symbols", "context_related"]
        .filter((tool) => !advancedAvailable.includes(tool)),
      unsupported_schema_tools: [],
      fallback_used: advancedAvailable.length === 0,
      reduced_semantic_coverage: true,
      semantic_completeness_claimed: false,
      unresolved_truncation_receipt_ids: [],
    },
    budget_state: {
      context_calls_used: evidenceReceiptIds.length,
      context_calls_max: strategyBinding.budgets.max_context_calls,
      read_only_subagents_used: readOnlySubagents,
      read_only_subagents_max: strategyBinding.budgets.max_read_only_subagents,
      exhausted: false,
      unresolved_area: null,
    },
  };
}
