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
  recordEngineeringDossier,
  recordGateDecision,
} from "../lib/quality/store.mjs";
import { createIntegratedVerificationEvidence } from "../lib/quality/verification-evidence.mjs";

const START_COMMIT = "0a1d56605b9b8923ac27c3b3b405b38177ca7741";
const FP_A = `sha256:${"a".repeat(64)}`;
const FP_B = `sha256:${"b".repeat(64)}`;
const FP_C = `sha256:${"c".repeat(64)}`;
const FP_D = `sha256:${"d".repeat(64)}`;
const FP_E = `sha256:${"e".repeat(64)}`;
const tests = [];

function test(name, callback) {
  tests.push({ name, callback });
}

function assertContractError(callback, code) {
  assert.throws(callback, (error) => error instanceof ContractError && error.code === code);
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
      { check_id: "quality-integration", trusted_producer: "opencode-harness-quality-verifier", phases: ["integration"], available: true },
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
  const obligations = new Map(dossier.test_obligations.map((entry) => [entry.check_id, entry]));
  const baselineReceipts = dossier.verification_plan.baseline_check_ids.map((checkId, index) => {
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
    || ["bug_fix", "behavior_preserving_refactor"].includes(dossier.task_type);
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
  return { dossier, checkCatalog, gate, session };
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
    ["baseline", "QUALITY_BASELINE_EVIDENCE_MISSING", (content) => ({ ...content, verification_plan: { ...content.verification_plan, baseline_check_ids: [] } })],
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
  const attestation = sessionFinalizeAttestation(prepared.session, {
    final_workspace_fingerprint: FP_C,
    teardown_verified: true,
    model_profile_id: "candidate-sol-general",
    model_profile_fingerprint: FP_C,
    prompt_profile_id: "baseline-engineering-prompts-v1",
    prompt_profile_fingerprint: FP_D,
    runtime_execution_fingerprint: FP_E,
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
  assertContractError(() => sessionFinalizeAttestation(session, {
    final_workspace_fingerprint: FP_B,
    teardown_verified: true,
    model_profile_id: "candidate-sol-general",
    model_profile_fingerprint: FP_C,
    prompt_profile_id: "baseline-engineering-prompts-v1",
    prompt_profile_fingerprint: FP_D,
    runtime_execution_fingerprint: FP_E,
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
      risk: "high",
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
    sessionFinalizeAttestation(session, {
      final_workspace_fingerprint: FP_B,
      teardown_verified: true,
      model_profile_id: "profile-sol-medium",
      model_profile_fingerprint: FP_C,
      prompt_profile_id: "prompt-candidate",
      prompt_profile_fingerprint: FP_D,
      runtime_execution_fingerprint: FP_E,
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
    runtime_execution_fingerprint: FP_E,
    workspace_at_gate_fingerprint: FP_A,
    final_workspace_fingerprint: FP_B,
    model_profile_id: "profile-sol",
    model_profile_fingerprint: FP_C,
    prompt_profile_id: "prompt-main",
    prompt_profile_fingerprint: FP_D,
    post_architecture_evaluation_fingerprint: null,
    artifact_refs: [
      { kind: "file", value: "quality/dossier.json" },
      { kind: "file", value: "quality/gate.json" },
      { kind: "file", value: "quality/integrated-verification-evidence.json" },
    ],
    teardown_verified: true,
    attested_at: "2026-07-13T00:05:00Z",
  };
  const valid = createQualityAttestation(base);
  validateQualityAttestation(valid);
  assertContractError(() => createQualityAttestation({ ...base, first_implementation_sequence: 2 }), "QUALITY_ATTESTATION_ORDER");
  assertContractError(() => createQualityAttestation({
    ...base,
    runtime_execution_fingerprint: null,
  }), "QUALITY_ATTESTATION_INTEGRATED_EVIDENCE");
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
