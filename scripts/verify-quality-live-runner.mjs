import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createTraceStore } from "../lib/feedback/index.mjs";
import {
  QUALITY_ACCEPTANCE_PRODUCERS,
  createQualityLiveReport,
} from "../lib/quality/acceptance-contracts.mjs";
import { sealRuntimeModelEvidence } from "../lib/quality/model-profiles.mjs";
import { validateEngineeringQualityRunBundle } from "../lib/quality/run-bundle.mjs";
import { runtimeExecutionFingerprint } from "../lib/quality/runtime-execution.mjs";
import { fingerprint } from "../lib/quality/validation.mjs";
import {
  loadQualityExperimentContext,
  runnerPreimplementationEvidence,
  runScenarioProfile,
} from "./evaluate-live.mjs";
import { loadScenarioCorpus } from "../lib/feedback/manifests.mjs";

const root = path.resolve(import.meta.dirname, "..");
const START_COMMIT = "0a1d56605b9b8923ac27c3b3b405b38177ca7741";

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

function dossierPatch(scenarioId) {
  const visible = `${scenarioId}-visible`;
  const integration = `${scenarioId}-integration`;
  const hidden = `${scenarioId}-hidden-evaluation`;
  return {
    task_shape: {
      summary: "bounded-one-file-label-fix",
      starting_commit: START_COMMIT,
      worktree_state: "clean",
      instruction_sources: ["AGENTS.md"],
      skill_ids: ["global-quality-gates"],
      constraints: ["one-owned-file"],
      non_goals: ["dependency-addition", "delegation"],
    },
    behavior_contract: {
      status: "defined",
      requested_behavior: "uppercase-label-with-empty-fallback",
      positive_behavior: ["non-empty-label-is-uppercase"],
      negative_behavior: ["lowercase-output-is-rejected"],
      boundary_behavior: ["empty-label-uses-fallback"],
      error_behavior: ["string-coercion-remains-defined"],
      ordering_and_side_effects: ["formatter-remains-pure"],
      preserved_behavior: ["string-coercion"],
      compatibility_requirements: ["node-24"],
      security_requirements: ["bounded-write-scope"],
      completion_requirements: ["visible-and-hidden-verification"],
    },
    compatibility_contract: { status: "defined", default_decision: "preserve", rationale: "public formatter signature and coercion remain stable", evidence_refs: [{ kind: "file", value: "src/label.mjs" }] },
    public_contracts: [{ id: "CONTRACT-label", kind: "public_api", path: "src/label.mjs", owner: "fixture", compatibility_decision: "preserve", evidence_refs: [{ kind: "file", value: "src/label.mjs" }] }],
    system_boundaries: [{ id: "SYSBOUNDARY-caller", category: "caller", path: "src/label.mjs", status: "resolved", rationale: "export is the bounded entry", evidence_refs: [{ kind: "file", value: "src/label.mjs" }] }],
    affected_areas: [{
      id: "AREA-label",
      path: "src/label.mjs",
      node_kind: "file",
      reason: "single-public-formatter",
      confidence: "observed",
      evidence_refs: [{ kind: "file", value: "src/label.mjs" }],
    }],
    entry_points: [{
      id: "ENTRY-label",
      path: "src/label.mjs",
      symbol: "label",
      reason: "public-formatter-export",
      evidence_refs: [{ kind: "file", value: "src/label.mjs" }],
    }],
    call_paths: [],
    data_shapes: [],
    invariants: [{
      id: "INV-string-coercion",
      statement: "input-remains-string-coercible",
      scope_ids: ["AREA-label"],
      mapping: mapping("applicable_directly_tested", { check_ids: [visible] }),
    }],
    edge_cases: [{
      id: "EDGE-empty-fallback",
      category: "null_absent_empty_malformed_unsupported",
      condition: "trimmed-input-is-empty",
      expected_behavior: "returns-UNTITLED",
      scope_ids: ["AREA-label"],
      mapping: mapping("applicable_verified_by_other_mechanism", { mechanism_ids: [hidden] }),
    }],
    failure_modes: [{
      id: "FAIL-lowercase-regression",
      category: "unexpected_valid_state",
      trigger: "normalization-keeps-lowercase",
      impact: "documented-display-contract-breaks",
      expected_handling: "integration-check-rejects",
      scope_ids: ["AREA-label"],
      mapping: mapping("applicable_directly_tested", { check_ids: [integration] }),
    }],
    premortem_matrix: [
      { id: "PREMORTEM-input", category: "null_absent_empty_malformed_unsupported", subject_ids: ["EDGE-empty-fallback"], mapping: mapping("applicable_verified_by_other_mechanism", { mechanism_ids: [hidden] }) },
      { id: "PREMORTEM-state", category: "unexpected_valid_state", subject_ids: ["FAIL-lowercase-regression"], mapping: mapping("applicable_directly_tested", { check_ids: [integration] }) },
    ],
    counterexamples: [],
    test_obligations: [
      {
        id: "TEST-visible",
        check_id: visible,
        kind: "command",
        phase: "slice",
        scope_ids: ["AREA-label"],
        command_or_mechanism: "node --test test/visible.test.mjs",
        required: true,
        trusted_producer: "opencode-harness-quality-runner",
      },
      {
        id: "TEST-integration",
        check_id: integration,
        kind: "command",
        phase: "integration",
        scope_ids: ["AREA-label"],
        command_or_mechanism: "runner-hidden-integration",
        required: true,
        trusted_producer: "opencode-harness-quality-runner",
      },
    ],
    specialized_checks: [],
    assumptions: [],
    unknowns: [],
    subagent_handoffs: [],
    implementation_slices: [{ id: "SLICE-label", owner: "fixture-adapter", intent: "implementation", write_scope: ["src/label.mjs"], concurrent_group: null, depends_on_slice_ids: [], invariant_ids: ["INV-string-coercion"], verification_check_ids: [visible, integration] }],
    impact_graph: null,
    architecture_assessment: {
      policy_id: null,
      status: "not_configured",
      evaluation_id: null,
      violation_ids: [],
      notes: null,
    },
    context_coverage: { status: "complete", affected_area_ids: ["AREA-label"], covered_area_ids: ["AREA-label"], truncated_area_ids: [], accepted_gap_ids: [], evidence_refs: [{ kind: "file", value: "src/label.mjs" }] },
    verification_plan: { baseline_check_ids: [], slice_check_ids: [visible], integration_check_ids: [integration], architecture_check_ids: [], regression_check_ids: [integration], hidden_check_ids: [], truncated_check_ids: [], evidence_refs: [{ kind: "check", value: integration }] },
    rollback_recovery: { rollback_expectation: "no persistent state changes", recovery_expectation: "retry reads the same input", mapping: mapping("not_applicable", { rationale: "pure formatter has no persistence" }) },
    plan_challenge: { architect_result_id: null, reviewer_result_id: null, blockers: [], evidence_refs: [] },
    gate_state: { status: "not_evaluated", gate_id: null, reason_codes: [] },
    verification_boundary: {
      check_ids: [visible, integration],
      mechanism_ids: [hidden],
      ownership_paths: ["src/label.mjs"],
      integration_check_ids: [integration],
    },
  };
}

function fixtureRuntimeEvidence(catalog, binding, evidenceKind = "installed_runtime") {
  const expected = binding.candidate;
  return sealRuntimeModelEvidence({
    schema_version: 1,
    evidence_id: "fixture-quality-live-runner",
    evidence_kind: evidenceKind,
    runtime_name: "deterministic-live-runner-fixture",
    runtime_version: "1.0.0",
    captured_at: "2026-07-13T12:00:00.000Z",
    catalog_id: catalog.catalog_id,
    catalog_fingerprint: catalog.content_fingerprint,
    requested_profile_id: expected.model_profile_id,
    requested_model_id: expected.model_id,
    effective_model_id: expected.model_id,
    option_results: Object.entries({
      model: expected.model_id,
      reasoning_effort: expected.reasoning_effort,
      text_verbosity: expected.text_verbosity,
      mode: expected.mode,
    }).map(([option_id, value]) => ({
      option_id,
      requested_value: value,
      effective_value: value,
      status: "accepted",
    })),
    complete: true,
    source_command_id: "deterministic-quality-live-runner-self-test",
  });
}

const receiptDossierFingerprint = fingerprint({ dossier: "runner-preimplementation-receipts" });
const receiptDossier = {
  dossier_id: "dossier-runner-receipts",
  fingerprint: receiptDossierFingerprint,
  test_obligations: [{
    check_id: "quality-receipt-scenario-baseline",
    command_or_mechanism: "runner-setup-checks",
  }],
  verification_plan: { baseline_check_ids: ["quality-receipt-scenario-baseline"] },
  plan_challenge: {
    architect_result_id: "architect-plan-result",
    reviewer_result_id: "reviewer-plan-result",
  },
};
const receiptJobs = ["architect", "reviewer"].map((role) => ({
  request: {
    task_id: `${role}-plan-result`,
    agent: role,
    assigned_scope: `${role} plan challenge`,
    write_scope: [],
  },
  status: { state: "completed", updated_at: "2026-07-13T11:59:30.000Z" },
  result: {
    status: role === "reviewer" ? "no-findings" : "completed",
    termination_reason: "verified",
    completed_at: "2026-07-13T11:59:30.000Z",
  },
}));
const runnerReceipts = runnerPreimplementationEvidence({
  dossier: receiptDossier,
  scenarioId: "quality-receipt-scenario",
  setupResults: [{ status: "passed" }],
  traceSnapshot: {
    events: [{ agent: "live-eval-runner", event_type: "setup_verification", timestamp: "2026-07-13T11:59:00.000Z" }],
    jobs: receiptJobs,
  },
  evaluatedAt: "2026-07-13T12:00:00.000Z",
});
assert.equal(runnerReceipts.baseline_receipts[0].status, "passed");
assert.deepEqual(runnerReceipts.plan_challenge_receipts.map((entry) => entry.role), ["architect", "reviewer"]);

const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-quality-live-runner-"));
try {
  const { scenarios } = loadScenarioCorpus({ root });
  const scenario = scenarios.find((entry) => entry.id === "quality-small-local-control");
  assert(scenario, "quality-small-local-control scenario missing");
  const experimentContext = loadQualityExperimentContext(root);
  const binding = experimentContext.bindings.find((entry) => (
    entry.scenario_id === scenario.id && entry.repetition === 1 && entry.variant_id === "same-low"
  ));
  assert(binding, "canonical same-low quality comparison missing");
  const permissionFingerprint = fingerprint({ permission_profile: "quality-live-runner-fixture" });
  const repositoryFingerprint = fingerprint({ repository: "quality-live-runner-fixture" });
  const profileRun = {
    profile_role: "candidate",
    profile: "quality-live-runner-fixture",
    repository_fingerprint: repositoryFingerprint,
    permission_profile_fingerprint: permissionFingerprint,
    permission_snapshot_fingerprint: fingerprint({ permission_snapshot: "quality-live-runner-fixture" }),
    profile_fingerprint: binding.candidate.profile_fingerprint,
  };
  const runtimeEvidence = fixtureRuntimeEvidence(experimentContext.catalog, binding);
  const runtimeBindingInput = {
    repository_fingerprint: profileRun.repository_fingerprint,
    host_profile_id: profileRun.profile,
    experiment_id: binding.experiment_id,
    experiment_fingerprint: binding.experiment_fingerprint,
    comparison_id: binding.comparison_id,
    variant_id: binding.variant_id,
    harness_role: binding.harness_role,
    scenario_id: scenario.id,
    scenario_fingerprint: fingerprint(scenario),
    repetition: binding.repetition,
    profile_role: profileRun.profile_role,
    profile_fingerprint: profileRun.profile_fingerprint,
    model_profile_id: binding.candidate.model_profile_id,
    model_profile_fingerprint: binding.candidate.model_profile_fingerprint,
    model_id: binding.candidate.model_id,
    reasoning_effort: binding.candidate.reasoning_effort,
    text_verbosity: binding.candidate.text_verbosity,
    mode: binding.candidate.mode,
    prompt_profile_id: binding.candidate.prompt_profile_id,
    prompt_profile_fingerprint: binding.candidate.prompt_profile_fingerprint,
    runtime_model_evidence_fingerprint: runtimeEvidence.content_fingerprint,
    permission_snapshot_fingerprint: profileRun.permission_snapshot_fingerprint,
    permission_profile_fingerprint: profileRun.permission_profile_fingerprint,
  };
  const exactRuntimeFingerprint = runtimeExecutionFingerprint(runtimeBindingInput);
  for (const mutation of [
    { reasoning_effort: binding.candidate.reasoning_effort === "high" ? "medium" : "high" },
    { text_verbosity: binding.candidate.text_verbosity === "high" ? "medium" : "high" },
    { mode: binding.candidate.mode === "pro" ? "standard" : "pro" },
    { runtime_model_evidence_fingerprint: fingerprint({ runtime: "other" }) },
    { permission_snapshot_fingerprint: fingerprint({ permission: "other" }) },
    { repository_fingerprint: fingerprint({ repository: "other" }) },
    { host_profile_id: "other-host-profile" },
  ]) {
    assert.notEqual(runtimeExecutionFingerprint({ ...runtimeBindingInput, ...mutation }), exactRuntimeFingerprint);
  }
  const traceStore = createTraceStore({ workspaceRoot });
  const qualityAdapter = (echoMode) => async ({ context, onTrace, workingDirectory }) => {
      assert.equal(workingDirectory, context.repo, "runner did not bind adapter cwd to the isolated fixture repository");
      const inspected = await onTrace("quality_inspect", {});
      assert.deepEqual(inspected.ownership_paths, ["src/label.mjs"]);
      const created = await onTrace("quality_create_dossier", {
        dossier_id: "dossier-quality-live-runner",
        task_id: "task-root",
        risk_class: "standard-lite",
        mode: "standard-lite",
        task_type: "maintenance",
        user_visible_goal: "Correct the bounded label formatter.",
        starting_commit: START_COMMIT,
        created_at: "2026-07-13T12:00:00.000Z",
      });
      const updated = await onTrace("quality_update_dossier", {
        expected_revision: created.revision,
        updated_at: "2026-07-13T12:01:00.000Z",
        patch: dossierPatch(scenario.id),
      });
      await onTrace("quality_finalize_dossier", { finalized_at: "2026-07-13T12:02:00.000Z" });
      await onTrace("quality_authorize_action", {
        kind: "edit",
        intent: "implementation",
        writable: true,
        write_scope: ["src/label.mjs"],
      });
      await onTrace("emit", {
        event_type: "edit",
        summary: "Implement the bounded label contract.",
        status: "completed",
        files_written: [{ path: "src/label.mjs", summary: "Uppercase output and empty fallback." }],
      });
      fs.writeFileSync(
        path.join(context.repo, "src", "label.mjs"),
        "export function label(value) {\n  const normalized = String(value).trim();\n  return normalized ? normalized.toUpperCase() : \"UNTITLED\";\n}\n",
        "utf8",
      );
      assert.equal(updated.revision, 2);
      return {
        passed: true,
        profile_fingerprint: context.profileFingerprint,
        ...(echoMode === "missing" ? {} : {
          execution_binding_fingerprint: echoMode === "wrong"
            ? fingerprint({ wrong_execution_binding: true })
            : context.executionBindingFingerprint,
        }),
        model: binding.candidate.model_id,
        tool: "deterministic-fixture-adapter",
        token_usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      };
  };
  const result = await runScenarioProfile({
    adapterUrl: "fixture://quality-live-runner",
    scenario,
    repetition: binding.repetition,
    profileRun,
    evaluationRunId: "quality-live-runner-self-test",
    traceStore,
    modelName: binding.candidate.model_id,
    qualityBinding: binding,
    runtimeModelEvidence: runtimeEvidence,
    sourceRoot: root,
    runAdapterModuleFn: qualityAdapter("matching"),
  });
  assert.equal(result.status, "passed", JSON.stringify({
    incomplete_evidence: result.incomplete_evidence,
    adapter_classification: result.adapter_classification,
    visible_results: result.visible_results,
    hidden_results: result.hidden_results,
    quality_outcomes: result.quality_outcomes,
  }));
  assert.deepEqual(result.incomplete_evidence, []);
  assert(result.quality_attestation, "runner did not produce post-teardown quality attestation");
  assert.equal(result.host_profile_id, "quality-live-runner-fixture");
  assert.equal(result.runtime_execution_fingerprint, exactRuntimeFingerprint);
  assert.equal(result.runtime_execution_fingerprint, result.quality_attestation.runtime_execution_fingerprint);
  assert.equal(result.quality_outcomes.complete, true);
  assert.equal(result.quality_outcomes.integrated_verification_complete, true);
  assert(result.hidden_results.every((entry) => entry.status === "passed"));
  const report = createQualityLiveReport({
    evaluation_run_id: "quality-live-runner-self-test",
    created_at: "2026-07-13T12:05:00.000Z",
    provenance: {
      producer_id: QUALITY_ACCEPTANCE_PRODUCERS.liveReport,
      evidence_kind: "infrastructure_self_test",
      complete: true,
    },
    results: [result],
  });
  assert.equal(report.results[0].comparison_id, binding.comparison_id);
  const bundle = validateEngineeringQualityRunBundle(
    path.join(workspaceRoot, ".oc_harness", "runs", result.operational_run_id),
  );
  assert.equal(bundle.gate.status, "passed");
  assert.equal(bundle.attestation.model_profile_id, binding.candidate.model_profile_id);
  for (const [echoMode, reason] of [
    ["missing", "ADAPTER_EXECUTION_BINDING_MISSING"],
    ["wrong", "ADAPTER_EXECUTION_BINDING_MISMATCH"],
  ]) {
    const rejected = await runScenarioProfile({
      adapterUrl: `fixture://quality-live-runner-${echoMode}`,
      scenario,
      repetition: binding.repetition,
      profileRun,
      evaluationRunId: `quality-live-runner-${echoMode}`,
      traceStore,
      modelName: binding.candidate.model_id,
      qualityBinding: binding,
      runtimeModelEvidence: runtimeEvidence,
      sourceRoot: root,
      runAdapterModuleFn: qualityAdapter(echoMode),
    });
    assert.equal(rejected.status, "incomplete");
    assert(rejected.incomplete_evidence.includes(reason));
    assert.equal(rejected.runtime_execution_fingerprint, null);
    assert.equal(rejected.quality_attestation, null);
    assert.equal(
      fs.existsSync(path.join(workspaceRoot, ".oc_harness", "runs", rejected.operational_run_id, "quality")),
      false,
      `${echoMode} execution binding published a quality bundle`,
    );
  }
  const nonAuthorizingRuntime = await runScenarioProfile({
    adapterUrl: "fixture://quality-live-runner-non-authorizing-runtime",
    scenario,
    repetition: binding.repetition,
    profileRun,
    evaluationRunId: "quality-live-runner-non-authorizing-runtime",
    traceStore,
    modelName: binding.candidate.model_id,
    qualityBinding: binding,
    runtimeModelEvidence: fixtureRuntimeEvidence(experimentContext.catalog, binding, "fixture_parser"),
    sourceRoot: root,
    runAdapterModuleFn: qualityAdapter("matching"),
  });
  assert.equal(nonAuthorizingRuntime.status, "incomplete");
  assert(nonAuthorizingRuntime.incomplete_evidence.includes("RUNTIME_MODEL_INSTALLED_EVIDENCE_REQUIRED"));
  assert.equal(nonAuthorizingRuntime.quality_attestation, null);
  assert.equal(nonAuthorizingRuntime.quality_outcomes.complete, false);
  assert.equal(
    fs.existsSync(path.join(workspaceRoot, ".oc_harness", "runs", nonAuthorizingRuntime.operational_run_id, "quality")),
    false,
  );
  let cleanupAttemptedRunId = null;
  let failCleanupOnce = true;
  const cleanupFailingTraceStore = {
    ...traceStore,
    createStagedRunFromBuffered(buffered, runId) {
      cleanupAttemptedRunId = runId;
      return traceStore.createStagedRunFromBuffered(buffered, runId);
    },
    discardStagingStore(staged) {
      if (failCleanupOnce) {
        failCleanupOnce = false;
        throw new Error("injected-quality-staging-cleanup-failure");
      }
      return traceStore.discardStagingStore(staged);
    },
  };
  await assert.rejects(
    () => runScenarioProfile({
      adapterUrl: "fixture://quality-live-runner-cleanup-failure",
      scenario,
      repetition: binding.repetition,
      profileRun,
      evaluationRunId: "quality-live-runner-cleanup-failure",
      traceStore: cleanupFailingTraceStore,
      modelName: binding.candidate.model_id,
      qualityBinding: binding,
      runtimeModelEvidence: runtimeEvidence,
      sourceRoot: root,
      runAdapterModuleFn: qualityAdapter("matching"),
    }),
    /injected-quality-staging-cleanup-failure/,
  );
  assert(cleanupAttemptedRunId, "cleanup failure was not injected at the publication boundary");
  assert.equal(
    fs.existsSync(path.join(workspaceRoot, ".oc_harness", "runs", cleanupAttemptedRunId)),
    false,
    "pre-rename staging cleanup failure left a durable quality run",
  );
  console.log("Quality live runner integration passed (exact runtime binding, runner receipts, and atomic publication)." );
} finally {
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
}
