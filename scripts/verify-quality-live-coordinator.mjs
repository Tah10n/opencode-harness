import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ContractError, createTraceStore } from "../lib/feedback/index.mjs";
import { createEngineeringCheckCatalog } from "../lib/quality/gate.mjs";
import {
  buildArchitecturePolicy,
  evaluateArchitecturePolicy,
} from "../lib/quality/architecture.mjs";
import { buildEngineeringImpactGraph } from "../lib/quality/impact-graph.mjs";
import {
  createQualityLiveCoordinator,
  finalizeQualityLiveAttestation,
  handleQualityLiveOperation,
  inspectQualityLiveCoordinator,
  qualityLiveOutcomeEvidence,
  qualityLivePrecompletionVerifierCodes,
  qualityLiveSessionForPublication,
  recordQualityLiveImplementation,
  recordQualityLiveIntegratedVerification,
} from "../lib/quality/live-coordinator.mjs";
import { snapshotEngineeringQualitySession } from "../lib/quality/session.mjs";
import { createEngineeringQualityStore } from "../lib/quality/store.mjs";

const FP_A = `sha256:${"a".repeat(64)}`;
const FP_B = `sha256:${"b".repeat(64)}`;
const FP_C = `sha256:${"c".repeat(64)}`;
const FP_D = `sha256:${"d".repeat(64)}`;
const FP_E = `sha256:${"e".repeat(64)}`;
const START_COMMIT = "0a1d56605b9b8923ac27c3b3b405b38177ca7741";

function rejects(callback, code) {
  assert.throws(callback, (error) => error instanceof ContractError && error.code === code, `expected ${code}`);
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

function dossierPatch(overrides = {}) {
  return {
    task_shape: {
      summary: "bounded-live-quality-change",
      starting_commit: START_COMMIT,
      worktree_state: "clean",
      instruction_sources: ["AGENTS.md"],
      skill_ids: ["global-quality-gates"],
      constraints: ["runner-owned-gate"],
      non_goals: ["hidden-oracle-disclosure"],
    },
    behavior_contract: {
      status: "defined",
      requested_behavior: "fix-public-fixture-defect",
      positive_behavior: ["fixture-behavior-is-correct"],
      negative_behavior: ["incomplete-fix-is-rejected"],
      boundary_behavior: ["only-owned-file-is-written"],
      error_behavior: ["verification-failure-remains-explicit"],
      ordering_and_side_effects: ["gate-precedes-edit"],
      preserved_behavior: ["public-api"],
      compatibility_requirements: ["node-24"],
      security_requirements: ["bounded-write-scope"],
      completion_requirements: ["quality-integration"],
    },
    compatibility_contract: {
      status: "defined",
      default_decision: "preserve",
      rationale: "public fixture contract remains compatible",
      evidence_refs: [{ kind: "file", value: "src/app.mjs" }],
    },
    public_contracts: [{ id: "CONTRACT-app", kind: "public_api", path: "src/app.mjs", owner: "fixture", compatibility_decision: "preserve", evidence_refs: [{ kind: "file", value: "src/app.mjs" }] }],
    system_boundaries: [{ id: "SYSBOUNDARY-caller", category: "caller", path: "src/app.mjs", status: "resolved", rationale: "fixture entry is the caller", evidence_refs: [{ kind: "file", value: "src/app.mjs" }] }],
    affected_areas: [{
      id: "AREA-app",
      path: "src/app.mjs",
      node_kind: "file",
      reason: "public-entry",
      confidence: "observed",
      evidence_refs: [{ kind: "file", value: "src/app.mjs" }],
    }],
    entry_points: [{
      id: "ENTRY-app",
      path: "src/app.mjs",
      symbol: "run",
      reason: "fixture-entry",
      evidence_refs: [{ kind: "file", value: "src/app.mjs" }],
    }],
    call_paths: [],
    data_shapes: [],
    invariants: [{
      id: "INV-contract",
      statement: "public-contract-remains-compatible",
      scope_ids: ["AREA-app"],
      mapping: mapping("applicable_directly_tested", { check_ids: ["quality-visible"] }),
    }],
    edge_cases: [{
      id: "EDGE-hidden",
      category: "unexpected_valid_state",
      condition: "runner-owned-counterexample",
      expected_behavior: "integration-verifier-passes",
      scope_ids: ["AREA-app"],
      mapping: mapping("applicable_verified_by_other_mechanism", { mechanism_ids: ["quality-hidden-evaluation"] }),
    }],
    failure_modes: [{
      id: "FAIL-regression",
      category: "partial_success_partial_failure",
      trigger: "incomplete-fix",
      impact: "hidden-regression",
      expected_handling: "quality-integration-rejects",
      scope_ids: ["AREA-app"],
      mapping: mapping("applicable_directly_tested", { check_ids: ["quality-integration"] }),
    }],
    premortem_matrix: [
      { id: "PREMORTEM-valid-state", category: "unexpected_valid_state", subject_ids: ["EDGE-hidden"], mapping: mapping("applicable_verified_by_other_mechanism", { mechanism_ids: ["quality-hidden-evaluation"] }) },
      { id: "PREMORTEM-partial", category: "partial_success_partial_failure", subject_ids: ["FAIL-regression"], mapping: mapping("applicable_directly_tested", { check_ids: ["quality-integration"] }) },
    ],
    counterexamples: [],
    test_obligations: [
      {
        id: "TEST-visible",
        check_id: "quality-visible",
        kind: "command",
        phase: "slice",
        scope_ids: ["AREA-app"],
        command_or_mechanism: "runner-visible-check",
        required: true,
        trusted_producer: "opencode-harness-quality-runner",
      },
      {
        id: "TEST-integration",
        check_id: "quality-integration",
        kind: "command",
        phase: "integration",
        scope_ids: ["AREA-app"],
        command_or_mechanism: "runner-integrated-check",
        required: true,
        trusted_producer: "opencode-harness-quality-runner",
      },
    ],
    specialized_checks: [],
    assumptions: [],
    unknowns: [],
    subagent_handoffs: [],
    implementation_slices: [{ id: "SLICE-app", owner: "live-adapter", intent: "implementation", write_scope: ["src/app.mjs"], concurrent_group: null, depends_on_slice_ids: [], invariant_ids: ["INV-contract"], verification_check_ids: ["quality-visible", "quality-integration"] }],
    impact_graph: null,
    architecture_assessment: {
      policy_id: null,
      status: "not_configured",
      evaluation_id: null,
      violation_ids: [],
      notes: null,
    },
    context_coverage: { status: "complete", affected_area_ids: ["AREA-app"], covered_area_ids: ["AREA-app"], truncated_area_ids: [], accepted_gap_ids: [], evidence_refs: [{ kind: "file", value: "src/app.mjs" }] },
    verification_plan: { baseline_check_ids: [], slice_check_ids: ["quality-visible"], integration_check_ids: ["quality-integration"], architecture_check_ids: [], regression_check_ids: ["quality-integration"], hidden_check_ids: [], truncated_check_ids: [], evidence_refs: [{ kind: "check", value: "quality-integration" }] },
    rollback_recovery: { rollback_expectation: "no persistent state changes", recovery_expectation: "retry begins from fixture input", mapping: mapping("not_applicable", { rationale: "fixture change has no persistence" }) },
    plan_challenge: { architect_result_id: null, reviewer_result_id: null, blockers: [], evidence_refs: [] },
    gate_state: { status: "not_evaluated", gate_id: null, reason_codes: [] },
    verification_boundary: {
      check_ids: ["quality-visible", "quality-integration"],
      mechanism_ids: ["quality-hidden-evaluation"],
      ownership_paths: ["src/app.mjs"],
      integration_check_ids: ["quality-integration"],
    },
    ...overrides,
  };
}

function architectureGraph(graphId, { forbiddenImport = false } = {}) {
  const evidence = [{ kind: "file", value: "src/app.mjs" }];
  const nodes = [
    { id: "NODE-entry", kind: "public_api", path: "src/app.mjs", symbol: "run", label: "entry", boundary: "entry_point", confidence: "observed", coverage: "complete", evidence_refs: evidence },
    { id: "NODE-service", kind: "module", path: "src/service.mjs", symbol: "apply", label: "service", boundary: "module", confidence: "observed", coverage: "complete", evidence_refs: evidence },
    { id: "NODE-store", kind: "data_store", path: "src/store.mjs", symbol: "write", label: "store", boundary: "persistence", confidence: "observed", coverage: "complete", evidence_refs: evidence },
    { id: "NODE-test", kind: "test", path: "test/app.test.mjs", symbol: null, label: "test", boundary: "operational", confidence: "observed", coverage: "complete", evidence_refs: [{ kind: "file", value: "test/app.test.mjs" }] },
  ];
  const edges = [
    { id: "EDGE-entry-service", from: "NODE-entry", to: "NODE-service", relationship: "calls", confidence: "observed", coverage: "complete", evidence_refs: evidence },
    { id: "EDGE-service-store", from: "NODE-service", to: "NODE-store", relationship: "writes", confidence: "observed", coverage: "complete", evidence_refs: evidence },
    { id: "EDGE-test-service", from: "NODE-test", to: "NODE-service", relationship: "verifies", confidence: "observed", coverage: "complete", evidence_refs: [{ kind: "file", value: "test/app.test.mjs" }] },
  ];
  if (forbiddenImport) {
    nodes.push({ id: "NODE-forbidden", kind: "module", path: "src/forbidden.mjs", symbol: null, label: "forbidden", boundary: "module", confidence: "observed", coverage: "complete", evidence_refs: [{ kind: "file", value: "src/forbidden.mjs" }] });
    edges.push({ id: "EDGE-forbidden", from: "NODE-entry", to: "NODE-forbidden", relationship: "imports", confidence: "observed", coverage: "complete", evidence_refs: evidence });
  }
  const boundary = (id, category, refs) => ({
    id,
    category,
    classification: "represented",
    node_ids: refs.node_ids ?? [],
    edge_ids: refs.edge_ids ?? [],
    path_ids: refs.path_ids ?? [],
    unknown_ids: [],
    excluded_sibling_ids: [],
    rationale: null,
    evidence_refs: evidence,
  });
  return buildEngineeringImpactGraph({
    graph_id: graphId,
    risk_class: "standard-lite",
    nodes,
    edges,
    affected_paths: [{ id: "BLAST-direct", kind: "direct", node_ids: ["NODE-entry", "NODE-service"], edge_ids: ["EDGE-entry-service"], critical: true, verification_node_ids: ["NODE-test"], confidence: "observed", evidence_refs: evidence }],
    excluded_siblings: [],
    unknowns: [],
    coverage: {
      completeness: "complete",
      semantic_tool_status: "not_requested",
      semantic_tools: [],
      fallback_tools: [],
      reduced_semantic_coverage: false,
      truncated: false,
      truncation_reason: null,
      available_evaluator_ids: ["dependency-graph-v1"],
      unavailable_evaluator_ids: [],
      boundaries: [
        boundary("BOUNDARY-direct", "direct_affected_paths", { path_ids: ["BLAST-direct"] }),
        boundary("BOUNDARY-entry", "externally_reachable_entry_points", { node_ids: ["NODE-entry"] }),
        boundary("BOUNDARY-side-effects", "downstream_state_or_side_effects", { node_ids: ["NODE-store"], edge_ids: ["EDGE-service-store"] }),
      ],
      evidence_refs: [{ kind: "check", value: "dependency-graph-v1" }],
    },
  });
}

function architecturePolicy() {
  return buildArchitecturePolicy({
    policy_id: "ARCHPOLICY-live",
    enforce_existing: false,
    required_evaluator_ids: ["dependency-graph-v1"],
    rules: [{
      id: "ARCHRULE-no-forbidden",
      kind: "deny_dependency",
      source: { type: "exact_path", value: "src/app.mjs" },
      target: { type: "exact_path", value: "src/forbidden.mjs" },
      relationship_kinds: ["imports"],
      evaluator_id: "dependency-graph-v1",
      rationale: "public entry must not import the forbidden layer",
    }],
  });
}

function catalog() {
  return createEngineeringCheckCatalog({
    catalog_id: "quality-live-catalog",
    checks: [
      { check_id: "quality-visible", trusted_producer: "opencode-harness-quality-runner", phases: ["slice"], available: true },
      { check_id: "quality-integration", trusted_producer: "opencode-harness-quality-runner", phases: ["integration"], available: true },
    ],
    mechanisms: [
      { mechanism_id: "quality-hidden-evaluation", trusted_producer: "opencode-harness-quality-runner", phases: ["integration"], available: true },
    ],
  });
}

function traceEvent(overrides = {}) {
  return {
    task_id: "task-quality-live",
    parent_task_id: null,
    agent: "live-adapter",
    event_type: "tool_call",
    summary: "quality-live-event",
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
    strategy_id: "quality-live",
    finding: null,
    ...overrides,
  };
}

function harness({
  runId,
  riskClass = "standard-lite",
  evaluateArchitecture = undefined,
  auditArchitecture = undefined,
}) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-quality-live-"));
  const trace = createTraceStore({ workspaceRoot }).createBufferedStore();
  trace.createRun({ run_id: runId, risk: riskClass === "standard-lite" ? "standard" : riskClass });
  trace.appendEvent(runId, traceEvent({ event_type: "task_start" }));
  const store = createEngineeringQualityStore({ run_id: runId, task_id: "task-quality-live" });
  let workspaceFingerprint = FP_A;
  let nextId = 0;
  const checkCatalog = catalog();
  const coordinator = createQualityLiveCoordinator({
    store,
    initial_workspace_fingerprint: FP_A,
    risk_class: riskClass,
    ownership_paths: ["src/app.mjs"],
    check_catalog: checkCatalog,
    append_gate_trace: ({ gate_status: gateStatus }) => {
      const event = trace.appendEvent(runId, traceEvent({
        summary: "runner-owned-quality-gate",
        evidence_refs: [{ kind: "file", value: "quality/gate.json" }],
        verifier_codes: [gateStatus === "passed" ? "QUALITY-GATE-PASSED" : "QUALITY-GATE-BLOCKED"],
      }));
      return { sequence: event.sequence, evidence_refs: event.evidence_refs, verifier_codes: event.verifier_codes };
    },
    observe_workspace: () => workspaceFingerprint,
    ...(evaluateArchitecture ? { evaluate_architecture: evaluateArchitecture } : {}),
    ...(auditArchitecture ? { audit_architecture: auditArchitecture } : {}),
    id_factory: (kind) => `${kind}-${++nextId}`,
  });
  const traceHandler = (operation, payload) => {
    if (operation === "emit") return trace.appendEvent(runId, traceEvent(payload));
    if (operation === "job_create") return trace.createJob(runId, payload);
    throw new Error(`unexpected trace operation ${operation}`);
  };
  return {
    workspaceRoot,
    trace,
    coordinator,
    traceHandler,
    checkCatalog,
    setWorkspaceFingerprint: (value) => { workspaceFingerprint = value; },
  };
}

const LIVE_CHECK_IDS = Object.freeze(["quality-visible", "quality-integration"]);
const LIVE_TARGET_IDS = Object.freeze([...LIVE_CHECK_IDS, "quality-hidden-evaluation"]);

function liveIntegratedVerificationInput(event, overrides = {}) {
  return {
    evidence_id: overrides.evidence_id ?? `integrated-${event.run_id}-${event.sequence}`,
    trace_event: event,
    check_receipts: overrides.check_receipts ?? [
      {
        receipt_id: "receipt-quality-visible",
        check_id: "quality-visible",
        trusted_producer: "opencode-harness-quality-runner",
        phase: "slice",
        status: "passed",
        command_or_mechanism: "runner-visible-check",
        evidence_fingerprint: FP_A,
        completed_at: event.timestamp,
      },
      {
        receipt_id: "receipt-quality-integration",
        check_id: "quality-integration",
        trusted_producer: "opencode-harness-quality-runner",
        phase: "integration",
        status: "passed",
        command_or_mechanism: "runner-integrated-check",
        evidence_fingerprint: FP_B,
        completed_at: event.timestamp,
      },
    ],
    mechanism_receipts: overrides.mechanism_receipts ?? [{
      receipt_id: "receipt-quality-hidden",
      mechanism_id: "quality-hidden-evaluation",
      trusted_producer: "opencode-harness-quality-runner",
      phase: "integration",
      status: "passed",
      evidence_fingerprint: FP_C,
      completed_at: event.timestamp,
    }],
    completed_at: event.timestamp,
  };
}

function finalizeStandardDossier(current, dossierId) {
  handleQualityLiveOperation(current.coordinator, "quality_create_dossier", {
    dossier_id: dossierId,
    task_id: "task-quality-live",
    risk_class: "standard-lite",
    mode: "standard-lite",
    task_type: "maintenance",
    user_visible_goal: "Exercise the bounded quality live contract.",
    starting_commit: START_COMMIT,
    created_at: "2026-07-13T03:00:00Z",
  }, current.traceHandler);
  handleQualityLiveOperation(current.coordinator, "quality_update_dossier", {
    expected_revision: 1,
    updated_at: "2026-07-13T03:01:00Z",
    patch: dossierPatch(),
  }, current.traceHandler);
  return handleQualityLiveOperation(current.coordinator, "quality_finalize_dossier", {
    finalized_at: "2026-07-13T03:02:00Z",
  }, current.traceHandler);
}

function recordLiveEdit(current, workspaceFingerprint, summary = "bounded-live-edit") {
  const event = handleQualityLiveOperation(current.coordinator, "emit", {
    event_type: "edit",
    summary,
    files_written: [{ path: "src/app.mjs", summary: "bounded mutation" }],
  }, current.traceHandler);
  current.setWorkspaceFingerprint(workspaceFingerprint);
  recordQualityLiveImplementation(current.coordinator, {
    final_workspace_fingerprint: workspaceFingerprint,
    changed_paths: ["src/app.mjs"],
  });
  return event;
}

{
  const current = harness({ runId: "run-quality-live-pass" });
  try {
    const inspected = handleQualityLiveOperation(current.coordinator, "quality_inspect", {}, current.traceHandler);
    assert.deepEqual(inspected.check_ids, ["quality-visible", "quality-integration"]);
    const created = handleQualityLiveOperation(current.coordinator, "quality_create_dossier", {
      dossier_id: "dossier-quality-live",
      task_id: "task-quality-live",
      risk_class: "standard-lite",
      mode: "standard-lite",
      task_type: "maintenance",
      user_visible_goal: "Fix the bounded public fixture without widening scope.",
      starting_commit: START_COMMIT,
      created_at: "2026-07-13T00:00:00Z",
    }, current.traceHandler);
    assert.equal(created.revision, 1);
    handleQualityLiveOperation(current.coordinator, "quality_update_dossier", {
      expected_revision: 1,
      updated_at: "2026-07-13T00:01:00Z",
      patch: dossierPatch(),
    }, current.traceHandler);
    const architecture = handleQualityLiveOperation(current.coordinator, "quality_evaluate_architecture", {
      expected_revision: 2,
    }, current.traceHandler);
    assert.equal(architecture.status, "not_configured");
    const finalized = handleQualityLiveOperation(current.coordinator, "quality_finalize_dossier", {
      finalized_at: "2026-07-13T00:02:00Z",
    }, current.traceHandler);
    assert.equal(finalized.gate_status, "passed");
    handleQualityLiveOperation(current.coordinator, "quality_authorize_action", {
      kind: "edit",
      intent: "implementation",
      writable: true,
      write_scope: ["src/app.mjs"],
    }, current.traceHandler);
    const edit = handleQualityLiveOperation(current.coordinator, "emit", {
      event_type: "edit",
      summary: "bounded-fixture-fix",
      files_written: [{ path: "src/app.mjs", summary: "fix" }],
    }, current.traceHandler);
    current.setWorkspaceFingerprint(FP_B);
    assert.equal(recordQualityLiveImplementation(current.coordinator, {
      final_workspace_fingerprint: FP_B,
      changed_paths: ["src/app.mjs"],
    }).implementation_recorded, true);
    assert(!qualityLivePrecompletionVerifierCodes(current.coordinator).includes("ENGINEERING_EDGE_FAILURE_MAPPING_VERIFIED"));
    assert.equal(qualityLiveOutcomeEvidence(current.coordinator).edge_case_mapped, 0);
    assert.equal(qualityLiveOutcomeEvidence(current.coordinator).failure_mode_mapped, 0);
    const verification = current.trace.appendEvent("run-quality-live-pass", traceEvent({
      event_type: "verification",
      verification: { status: "passed", summary: "integrated", verifier_codes: LIVE_TARGET_IDS },
      verifier_codes: LIVE_TARGET_IDS,
    }));
    assert(edit.sequence < verification.sequence);
    recordQualityLiveIntegratedVerification(current.coordinator, liveIntegratedVerificationInput(verification));
    assert(qualityLivePrecompletionVerifierCodes(current.coordinator).includes("ENGINEERING_EDGE_FAILURE_MAPPING_VERIFIED"));
    assert.equal(qualityLiveOutcomeEvidence(current.coordinator).edge_case_mapped, 1);
    assert.equal(qualityLiveOutcomeEvidence(current.coordinator).failure_mode_mapped, 1);
    const attestation = finalizeQualityLiveAttestation(current.coordinator, {
      final_workspace_fingerprint: FP_B,
      teardown_verified: true,
      prompt_profile_id: "baseline-engineering-prompts-v1",
      prompt_profile_fingerprint: FP_D,
      attested_at: "2026-07-13T00:03:00Z",
    });
    assert.equal(attestation.first_implementation_sequence, edit.sequence);
    assert.equal(snapshotEngineeringQualitySession(qualityLiveSessionForPublication(current.coordinator)).store.gate.status, "passed");
    assert.equal(inspectQualityLiveCoordinator(current.coordinator).session.lifecycle, "attested");
  } finally {
    fs.rmSync(current.workspaceRoot, { recursive: true, force: true });
  }
}

{
  const baselineGraph = architectureGraph("GRAPH-live-baseline");
  const candidateGraph = architectureGraph("GRAPH-live-candidate", { forbiddenImport: true });
  const policy = architecturePolicy();
  const preEvaluation = evaluateArchitecturePolicy({ graph: baselineGraph, policy, baseline: baselineGraph });
  const postEvaluation = evaluateArchitecturePolicy({ graph: candidateGraph, policy, baseline: baselineGraph });
  assert.equal(preEvaluation.status, "passed");
  assert.equal(postEvaluation.status, "failed");
  const current = harness({
    runId: "run-quality-post-architecture-failure",
    evaluateArchitecture: () => preEvaluation,
    auditArchitecture: () => postEvaluation,
  });
  try {
    handleQualityLiveOperation(current.coordinator, "quality_create_dossier", {
      dossier_id: "dossier-post-architecture",
      task_id: "task-quality-live",
      risk_class: "standard-lite",
      mode: "standard-lite",
      task_type: "maintenance",
      user_visible_goal: "Verify the actual candidate graph after implementation.",
      starting_commit: START_COMMIT,
      created_at: "2026-07-13T01:00:00Z",
    }, current.traceHandler);
    handleQualityLiveOperation(current.coordinator, "quality_update_dossier", {
      expected_revision: 1,
      updated_at: "2026-07-13T01:01:00Z",
      patch: dossierPatch({
        impact_graph: baselineGraph,
        architecture_assessment: {
          policy_id: preEvaluation.policy_id,
          status: preEvaluation.status,
          evaluation_id: preEvaluation.evaluation_id,
          violation_ids: [],
          notes: null,
        },
      }),
    }, current.traceHandler);
    handleQualityLiveOperation(current.coordinator, "quality_finalize_dossier", {
      finalized_at: "2026-07-13T01:02:00Z",
    }, current.traceHandler);
    assert.equal(
      inspectQualityLiveCoordinator(current.coordinator).gate_status,
      "passed",
      JSON.stringify(qualityLiveOutcomeEvidence(current.coordinator)),
    );
    const edit = handleQualityLiveOperation(current.coordinator, "emit", {
      event_type: "edit",
      summary: "introduce-forbidden-import",
      files_written: [{ path: "src/app.mjs", summary: "fixture mutation" }],
    }, current.traceHandler);
    current.setWorkspaceFingerprint(FP_B);
    recordQualityLiveImplementation(current.coordinator, {
      final_workspace_fingerprint: FP_B,
      changed_paths: ["src/app.mjs"],
    });
    const verification = current.trace.appendEvent("run-quality-post-architecture-failure", traceEvent({
      event_type: "verification",
      verification: { status: "passed", summary: "integrated", verifier_codes: LIVE_TARGET_IDS },
      verifier_codes: LIVE_TARGET_IDS,
    }));
    assert(edit.sequence < verification.sequence);
    recordQualityLiveIntegratedVerification(current.coordinator, liveIntegratedVerificationInput(verification));
    const attestation = finalizeQualityLiveAttestation(current.coordinator, {
      final_workspace_fingerprint: FP_B,
      teardown_verified: true,
      prompt_profile_id: "baseline-engineering-prompts-v1",
      prompt_profile_fingerprint: FP_D,
      attested_at: "2026-07-13T01:03:00Z",
    });
    assert.equal(attestation.post_architecture_evaluation_fingerprint, postEvaluation.fingerprint);
    assert.equal(inspectQualityLiveCoordinator(current.coordinator).post_architecture_evaluation_status, "failed");
    assert.equal(qualityLiveOutcomeEvidence(current.coordinator).architecture_policy_violations, 1);
    assert(!qualityLivePrecompletionVerifierCodes(current.coordinator).includes("ENGINEERING_ARCHITECTURE_RESPECTED"));
    assert.equal(
      snapshotEngineeringQualitySession(qualityLiveSessionForPublication(current.coordinator)).store
        .post_architecture_evaluation.fingerprint,
      postEvaluation.fingerprint,
    );
  } finally {
    fs.rmSync(current.workspaceRoot, { recursive: true, force: true });
  }
}

{
  const baselineGraph = architectureGraph("GRAPH-live-audit-required");
  const policy = architecturePolicy();
  const preEvaluation = evaluateArchitecturePolicy({ graph: baselineGraph, policy, baseline: baselineGraph });
  const current = harness({
    runId: "run-quality-post-architecture-missing",
    evaluateArchitecture: () => preEvaluation,
  });
  try {
    handleQualityLiveOperation(current.coordinator, "quality_create_dossier", {
      dossier_id: "dossier-post-architecture-missing",
      task_id: "task-quality-live",
      risk_class: "standard-lite",
      mode: "standard-lite",
      task_type: "maintenance",
      user_visible_goal: "Reject configured architecture checks without a trusted post-edit auditor.",
      starting_commit: START_COMMIT,
      created_at: "2026-07-13T02:00:00Z",
    }, current.traceHandler);
    handleQualityLiveOperation(current.coordinator, "quality_update_dossier", {
      expected_revision: 1,
      updated_at: "2026-07-13T02:01:00Z",
      patch: dossierPatch({
        impact_graph: baselineGraph,
        architecture_assessment: {
          policy_id: preEvaluation.policy_id,
          status: preEvaluation.status,
          evaluation_id: preEvaluation.evaluation_id,
          violation_ids: [],
          notes: null,
        },
      }),
    }, current.traceHandler);
    handleQualityLiveOperation(current.coordinator, "quality_finalize_dossier", {
      finalized_at: "2026-07-13T02:02:00Z",
    }, current.traceHandler);
    assert.equal(
      inspectQualityLiveCoordinator(current.coordinator).gate_status,
      "passed",
      JSON.stringify(qualityLiveOutcomeEvidence(current.coordinator)),
    );
    handleQualityLiveOperation(current.coordinator, "emit", {
      event_type: "edit",
      summary: "configured-policy-edit",
      files_written: [{ path: "src/app.mjs", summary: "fixture mutation" }],
    }, current.traceHandler);
    current.setWorkspaceFingerprint(FP_B);
    rejects(() => recordQualityLiveImplementation(current.coordinator, {
      final_workspace_fingerprint: FP_B,
      changed_paths: ["src/app.mjs"],
    }), "QUALITY_POST_ARCHITECTURE_AUDIT_UNAVAILABLE");
    assert.equal(inspectQualityLiveCoordinator(current.coordinator).post_architecture_evaluation_status, null);
  } finally {
    fs.rmSync(current.workspaceRoot, { recursive: true, force: true });
  }
}

for (const [name, mutateInput, code] of [
  ["missing-mechanism", (input) => ({ ...input, mechanism_receipts: [] }), "QUALITY_INTEGRATED_VERIFICATION_MISSING"],
  ["wrong-producer", (input) => ({
    ...input,
    check_receipts: input.check_receipts.map((entry, index) => (
      index === 0 ? { ...entry, trusted_producer: "untrusted-live-producer" } : entry
    )),
  }), "QUALITY_INTEGRATED_EVIDENCE_RECEIPT"],
  ["wrong-phase", (input) => ({
    ...input,
    check_receipts: input.check_receipts.map((entry, index) => (
      index === 0 ? { ...entry, phase: "integration" } : entry
    )),
  }), "QUALITY_INTEGRATED_EVIDENCE_RECEIPT"],
]) {
  const runId = `run-quality-live-evidence-${name}`;
  const current = harness({ runId });
  try {
    finalizeStandardDossier(current, `dossier-quality-live-evidence-${name}`);
    recordLiveEdit(current, FP_B);
    const verification = current.trace.appendEvent(runId, traceEvent({
      event_type: "verification",
      verification: { status: "passed", summary: "integrated", verifier_codes: LIVE_TARGET_IDS },
      verifier_codes: LIVE_TARGET_IDS,
    }));
    rejects(
      () => recordQualityLiveIntegratedVerification(
        current.coordinator,
        mutateInput(liveIntegratedVerificationInput(verification)),
      ),
      code,
    );
  } finally {
    fs.rmSync(current.workspaceRoot, { recursive: true, force: true });
  }
}

{
  const runId = "run-quality-live-evidence-revisions";
  const current = harness({ runId });
  try {
    finalizeStandardDossier(current, "dossier-quality-live-evidence-revisions");
    recordLiveEdit(current, FP_B, "first-bounded-live-edit");
    const firstVerification = current.trace.appendEvent(runId, traceEvent({
      event_type: "verification",
      verification: { status: "passed", summary: "first-integrated", verifier_codes: LIVE_TARGET_IDS },
      verifier_codes: LIVE_TARGET_IDS,
    }));
    recordQualityLiveIntegratedVerification(current.coordinator, liveIntegratedVerificationInput(firstVerification));
    assert.notEqual(inspectQualityLiveCoordinator(current.coordinator).integrated_verification_evidence_fingerprint, null);

    recordLiveEdit(current, FP_C, "late-bounded-live-edit");
    assert.equal(inspectQualityLiveCoordinator(current.coordinator).integrated_verification_evidence_fingerprint, null);
    const secondVerification = current.trace.appendEvent(runId, traceEvent({
      event_type: "verification",
      verification: { status: "passed", summary: "second-integrated", verifier_codes: LIVE_TARGET_IDS },
      verifier_codes: LIVE_TARGET_IDS,
    }));
    recordQualityLiveIntegratedVerification(current.coordinator, liveIntegratedVerificationInput(secondVerification, {
      evidence_id: "integrated-live-revision-2",
    }));

    handleQualityLiveOperation(current.coordinator, "job_create", {
      task_id: "quality-late-writer",
      agent: "general",
      assigned_scope: "bounded late implementation handoff",
      write_scope: ["src/app.mjs"],
    }, current.traceHandler);
    assert.equal(inspectQualityLiveCoordinator(current.coordinator).integrated_verification_evidence_fingerprint, null);
    const finalVerification = current.trace.appendEvent(runId, traceEvent({
      event_type: "verification",
      verification: { status: "passed", summary: "final-integrated", verifier_codes: LIVE_TARGET_IDS },
      verifier_codes: LIVE_TARGET_IDS,
    }));
    recordQualityLiveIntegratedVerification(current.coordinator, liveIntegratedVerificationInput(finalVerification, {
      evidence_id: "integrated-live-revision-3",
    }));
    const attestation = finalizeQualityLiveAttestation(current.coordinator, {
      final_workspace_fingerprint: FP_C,
      teardown_verified: true,
      prompt_profile_id: "baseline-engineering-prompts-v1",
      prompt_profile_fingerprint: FP_D,
      attested_at: "2026-07-13T03:09:00Z",
    });
    assert.equal(attestation.integrated_verification_sequence, finalVerification.sequence);
    assert(attestation.last_implementation_action_sequence < attestation.integrated_verification_sequence);
  } finally {
    fs.rmSync(current.workspaceRoot, { recursive: true, force: true });
  }
}

{
  const runId = "run-quality-live-two-edit-reconciliation";
  const current = harness({ runId });
  try {
    finalizeStandardDossier(current, "dossier-quality-live-two-edit-reconciliation");
    const firstEdit = handleQualityLiveOperation(current.coordinator, "emit", {
      event_type: "edit",
      summary: "first-edit-before-reconciliation",
      files_written: [{ path: "src/app.mjs", summary: "first bounded mutation" }],
    }, current.traceHandler);
    const secondEdit = handleQualityLiveOperation(current.coordinator, "emit", {
      event_type: "edit",
      summary: "second-edit-before-reconciliation",
      files_written: [{ path: "src/app.mjs", summary: "second bounded mutation" }],
    }, current.traceHandler);
    current.setWorkspaceFingerprint(FP_B);
    recordQualityLiveImplementation(current.coordinator, {
      final_workspace_fingerprint: FP_B,
      changed_paths: ["src/app.mjs"],
    });
    const reconciled = inspectQualityLiveCoordinator(current.coordinator).session;
    assert.equal(reconciled.first_implementation_sequence, firstEdit.sequence);
    assert.equal(reconciled.last_implementation_action_sequence, secondEdit.sequence);
    assert.equal(reconciled.last_workspace_mutation_sequence, secondEdit.sequence);

    const verification = current.trace.appendEvent(runId, traceEvent({
      event_type: "verification",
      verification: { status: "passed", summary: "two-edit-integrated", verifier_codes: LIVE_TARGET_IDS },
      verifier_codes: LIVE_TARGET_IDS,
    }));
    recordQualityLiveIntegratedVerification(current.coordinator, liveIntegratedVerificationInput(verification));
    const attestation = finalizeQualityLiveAttestation(current.coordinator, {
      final_workspace_fingerprint: FP_B,
      teardown_verified: true,
      prompt_profile_id: "baseline-engineering-prompts-v1",
      prompt_profile_fingerprint: FP_D,
      attested_at: "2026-07-13T03:10:00Z",
    });
    assert.equal(attestation.first_implementation_sequence, firstEdit.sequence);
    assert.equal(attestation.last_implementation_action_sequence, secondEdit.sequence);
  } finally {
    fs.rmSync(current.workspaceRoot, { recursive: true, force: true });
  }
}

{
  const runId = "run-quality-live-delayed-edit-reconciliation";
  const current = harness({ runId });
  try {
    finalizeStandardDossier(current, "dossier-quality-live-delayed-edit-reconciliation");
    const edit = handleQualityLiveOperation(current.coordinator, "emit", {
      event_type: "edit",
      summary: "edit-recorded-before-delegation",
      files_written: [{ path: "src/app.mjs", summary: "pending reconciliation" }],
    }, current.traceHandler);
    handleQualityLiveOperation(current.coordinator, "job_create", {
      task_id: "quality-writer-after-edit",
      agent: "general",
      assigned_scope: "bounded work after an emitted edit",
      write_scope: ["src/app.mjs"],
    }, current.traceHandler);
    current.setWorkspaceFingerprint(FP_B);
    recordQualityLiveImplementation(current.coordinator, {
      final_workspace_fingerprint: FP_B,
      changed_paths: ["src/app.mjs"],
    });
    const reconciled = inspectQualityLiveCoordinator(current.coordinator).session;
    assert.equal(reconciled.first_implementation_sequence, edit.sequence);
    assert.equal(reconciled.last_workspace_mutation_sequence, edit.sequence);
    assert(reconciled.last_implementation_action_sequence > edit.sequence);

    const verification = current.trace.appendEvent(runId, traceEvent({
      event_type: "verification",
      verification: { status: "passed", summary: "reconciled-integrated", verifier_codes: LIVE_TARGET_IDS },
      verifier_codes: LIVE_TARGET_IDS,
    }));
    recordQualityLiveIntegratedVerification(current.coordinator, liveIntegratedVerificationInput(verification));
    const attestation = finalizeQualityLiveAttestation(current.coordinator, {
      final_workspace_fingerprint: FP_B,
      teardown_verified: true,
      prompt_profile_id: "baseline-engineering-prompts-v1",
      prompt_profile_fingerprint: FP_D,
      attested_at: "2026-07-13T03:10:00Z",
    });
    assert.equal(attestation.first_implementation_sequence, edit.sequence);
    assert.equal(attestation.last_workspace_mutation_sequence, edit.sequence);
    assert(attestation.last_implementation_action_sequence < attestation.integrated_verification_sequence);
  } finally {
    fs.rmSync(current.workspaceRoot, { recursive: true, force: true });
  }
}

{
  const current = harness({ runId: "run-quality-live-pre-side-effect-ownership" });
  try {
    finalizeStandardDossier(current, "dossier-quality-live-pre-side-effect-ownership");
    const eventCount = current.trace.inspectRun("run-quality-live-pre-side-effect-ownership").events.length;
    rejects(() => handleQualityLiveOperation(current.coordinator, "emit", {
      event_type: "edit",
      summary: "out-of-scope-edit",
      files_written: [{ path: "src/app.mjsx", summary: "must not be persisted" }],
    }, current.traceHandler), "QUALITY_WRITE_SCOPE_VIOLATION");
    assert.equal(
      current.trace.inspectRun("run-quality-live-pre-side-effect-ownership").events.length,
      eventCount,
      "rejected edit must not reach the trace side-effect callback",
    );
  } finally {
    fs.rmSync(current.workspaceRoot, { recursive: true, force: true });
  }
}

for (const [name, action] of [
  ["edit", (current) => handleQualityLiveOperation(current.coordinator, "emit", {
    event_type: "edit",
    summary: "forbidden-pre-gate-edit",
    files_written: [{ path: "src/app.mjs", summary: "forbidden" }],
  }, current.traceHandler)],
  ["delegation", (current) => handleQualityLiveOperation(current.coordinator, "job_create", {
    task_id: "quality-writer",
    agent: "general",
    assigned_scope: "forbidden-pre-gate-write",
    write_scope: ["src/app.mjs"],
  }, current.traceHandler)],
  ["empty-scope-implementation-delegation", (current) => handleQualityLiveOperation(current.coordinator, "job_create", {
    task_id: "quality-writer-empty",
    agent: "general",
    assigned_scope: "forbidden-pre-gate-write-with-omitted-scope",
    write_scope: [],
  }, current.traceHandler)],
]) {
  const current = harness({ runId: `run-quality-pre-gate-${name}`, riskClass: "high" });
  try {
    rejects(() => action(current), "QUALITY_PRE_GATE_VIOLATION");
    assert.equal(inspectQualityLiveCoordinator(current.coordinator).session.lifecycle, "failed");
  } finally {
    fs.rmSync(current.workspaceRoot, { recursive: true, force: true });
  }
}

{
  const current = harness({ runId: "run-quality-stealth", riskClass: "high" });
  try {
    current.setWorkspaceFingerprint(FP_B);
    rejects(() => handleQualityLiveOperation(current.coordinator, "quality_inspect", {}, current.traceHandler), "QUALITY_PRE_GATE_VIOLATION");
  } finally {
    fs.rmSync(current.workspaceRoot, { recursive: true, force: true });
  }
}

{
  const current = harness({ runId: "run-quality-old-integrated-api" });
  try {
    rejects(() => recordQualityLiveIntegratedVerification(current.coordinator, {
      sequence: 1,
      status: "passed",
      check_ids: ["quality-integration"],
    }), "CONTRACT_UNKNOWN_FIELD");
  } finally {
    fs.rmSync(current.workspaceRoot, { recursive: true, force: true });
  }
}

console.log("Quality live coordinator self-tests passed (15 contracts).");
