import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  QUALITY_ACCEPTANCE_PRODUCERS,
  QUALITY_ACCEPTANCE_PROFILE_ROLES,
  createCanonicalExperimentBindings,
  createQualityAcceptancePolicy,
  createQualityLiveReport,
  createQualityOutcomes,
  qualityAcceptanceDecisionFingerprint,
  qualityAcceptancePolicyFingerprint,
  qualityAcceptancePairUniverseFingerprint,
  qualityBundleFingerprint,
  qualityLiveReportFingerprint,
  qualityOutcomesFingerprint,
  validateQualityAcceptanceDecision,
  validateQualityAcceptancePolicy,
  validateQualityLiveReport,
} from "../lib/quality/acceptance-contracts.mjs";
import { assessQualityCandidate } from "../lib/quality/acceptance-engine.mjs";
import { createQualityAttestation } from "../lib/quality/attestation.mjs";
import { sealRuntimeModelEvidence, validateRuntimeModelEvidence } from "../lib/quality/model-profiles.mjs";
import {
  createRuntimeExecutionBinding,
  validateRuntimeExecutionBinding,
} from "../lib/quality/runtime-execution.mjs";
import { ContractError, fingerprint } from "../lib/quality/validation.mjs";
import {
  ACCEPTANCE_SCHEMA_VERSION,
  EVIDENCE_PRODUCERS,
} from "../lib/feedback/contracts.mjs";
import { permissionSurfaceFingerprint } from "../lib/feedback/acceptance.mjs";
import { permissionProfileFingerprint } from "../lib/feedback/evidence.mjs";
import { loadScenarioCorpus } from "../lib/feedback/manifests.mjs";
import { createReportHistory } from "../lib/feedback/report-history.mjs";

const NOW = "2026-07-13T12:00:00.000Z";
const BASELINE_MODEL = "openai/gpt-5.5";
const CANDIDATE_MODEL = "openai/gpt-5.6-sol";
const BASELINE_PROMPT_FINGERPRINT = fingerprint({ prompt: "baseline" });
const CANDIDATE_PROMPT_FINGERPRINT = fingerprint({ prompt: "candidate" });
const CATALOG_FINGERPRINT = fingerprint({ catalog: "quality-acceptance-fixture" });
const CATALOG_ID = "acceptance-fixture-catalog";
const REPOSITORY_FINGERPRINT = fingerprint({ repository: "fixture" });
const EXPERIMENT_ID = "quality-acceptance-fixture-experiment";
const EXPERIMENT_FINGERPRINT = fingerprint({ experiment: EXPERIMENT_ID });

function permissionSnapshot(
  role,
  profileId,
  permissions = { bash: "ask", read: "allow" },
  subjectFingerprint = REPOSITORY_FINGERPRINT,
) {
  const runtimeFingerprint = fingerprint({ runtime: role });
  const surfaceFingerprint = permissionSurfaceFingerprint(permissions);
  return {
    schema_version: ACCEPTANCE_SCHEMA_VERSION,
    producer_id: EVIDENCE_PRODUCERS.runtimePermissionSnapshot,
    source: "installed_runtime",
    profile_id: profileId,
    subject_fingerprint: subjectFingerprint,
    runtime_fingerprint: runtimeFingerprint,
    surface_fingerprint: surfaceFingerprint,
    profile_fingerprint: permissionProfileFingerprint({
      subjectFingerprint,
      runtimeFingerprint,
      surfaceFingerprint,
    }),
    permissions,
    complete: true,
    incomplete_scopes: [],
    created_at: NOW,
  };
}

const canonicalScenarios = Object.freeze([
  {
    scenario_id: "target-a",
    failure_family: "family-a",
    suite: "development",
    repetitions: 1,
    scenario_fingerprint: fingerprint({ scenario: "target-a" }),
  },
  {
    scenario_id: "target-b",
    failure_family: "family-b",
    suite: "held_out",
    repetitions: 1,
    scenario_fingerprint: fingerprint({ scenario: "target-b" }),
  },
  {
    scenario_id: "protected-c",
    failure_family: "family-protected",
    suite: "canary",
    repetitions: 1,
    scenario_fingerprint: fingerprint({ scenario: "protected-c" }),
  },
]);

function fixtureIdentity(profileRole, harnessRole, comparisonId, {
  reasoningEffort = "medium",
  textVerbosity = "low",
} = {}) {
  const baseline = profileRole === "baseline";
  const modelProfileId = `${profileRole}-${harnessRole}`;
  const identity = {
    model_profile_id: modelProfileId,
    model_profile_fingerprint: fingerprint({ profile: modelProfileId }),
    model_id: baseline ? BASELINE_MODEL : CANDIDATE_MODEL,
    reasoning_effort: reasoningEffort,
    text_verbosity: textVerbosity,
    mode: "standard",
    prompt_profile_id: baseline ? "prompt-baseline" : "prompt-candidate",
    prompt_profile_fingerprint: baseline ? BASELINE_PROMPT_FINGERPRINT : CANDIDATE_PROMPT_FINGERPRINT,
  };
  return {
    profile_fingerprint: fingerprint({
      experiment_id: EXPERIMENT_ID,
      comparison_id: comparisonId,
      profile_role: profileRole,
      identity,
    }),
    ...identity,
  };
}

function fixtureBinding(comparisonId, scenarioId, harnessRole, variantId, {
  baselineEffort = "medium",
  candidateEffort = "medium",
  textVerbosity = "low",
} = {}) {
  return {
    experiment_id: EXPERIMENT_ID,
    experiment_fingerprint: EXPERIMENT_FINGERPRINT,
    catalog_id: CATALOG_ID,
    catalog_fingerprint: CATALOG_FINGERPRINT,
    comparison_id: comparisonId,
    scenario_id: scenarioId,
    repetition: 1,
    variant_id: variantId,
    harness_role: harnessRole,
    baseline: {
      ...fixtureIdentity("baseline", harnessRole, comparisonId, { reasoningEffort: baselineEffort, textVerbosity }),
      required_capability_ids: baselineEffort === "xhigh" ? ["reasoning_effort_xhigh"] : [],
    },
    candidate: {
      ...fixtureIdentity("candidate", harnessRole, comparisonId, { reasoningEffort: candidateEffort, textVerbosity }),
      required_capability_ids: candidateEffort === "xhigh" ? ["reasoning_effort_xhigh"] : [],
    },
  };
}

const canonicalExperimentBindings = Object.freeze([
  fixtureBinding("target-a-same-low", "target-a", "architect", "same-low"),
  fixtureBinding("target-a-lower-medium", "target-a", "architect", "lower-medium", {
    baselineEffort: "high",
    candidateEffort: "medium",
    textVerbosity: "medium",
  }),
  fixtureBinding("target-b-same-low", "target-b", "general", "same-low"),
  fixtureBinding("protected-c-same-low", "protected-c", "reviewer", "same-low"),
]);

const tests = [];

function test(name, run) {
  tests.push({ name, run });
}

function expectCode(run, code) {
  assert.throws(run, (error) => {
    assert(error instanceof ContractError, `expected ContractError, got ${error}`);
    assert.equal(error.code, code);
    return true;
  });
}

function runtimeEvidence(role, binding = canonicalExperimentBindings[0], {
  evidenceKind = "installed_runtime",
  complete = true,
  effectiveModel = null,
} = {}) {
  const prescribed = binding[role];
  const profileId = prescribed.model_profile_id;
  const modelId = prescribed.model_id;
  const effective = effectiveModel ?? modelId;
  return sealRuntimeModelEvidence({
    schema_version: 1,
    evidence_id: `runtime-${role}-${binding.comparison_id}-${evidenceKind}`,
    evidence_kind: evidenceKind,
    runtime_name: "opencode-fixture",
    runtime_version: "1.0.0",
    captured_at: NOW,
    catalog_id: binding.catalog_id,
    catalog_fingerprint: binding.catalog_fingerprint,
    requested_profile_id: profileId,
    requested_model_id: modelId,
    effective_model_id: complete ? effective : null,
    option_results: [
      {
        option_id: "model",
        requested_value: modelId,
        effective_value: complete ? effective : null,
        status: complete ? "accepted" : "absent",
      },
      ...["reasoning_effort", "text_verbosity", "mode"].map((optionId) => ({
        option_id: optionId,
        requested_value: prescribed[optionId],
        effective_value: complete ? prescribed[optionId] : null,
        status: complete ? "accepted" : "absent",
      })),
      ...prescribed.required_capability_ids.map((optionId) => ({
        option_id: optionId,
        requested_value: optionId === "reasoning_effort_xhigh" ? "xhigh" : optionId === "reasoning_effort_max" ? "max" : "pro",
        effective_value: complete
          ? optionId === "reasoning_effort_xhigh" ? "xhigh" : optionId === "reasoning_effort_max" ? "max" : "pro"
          : null,
        status: complete ? "accepted" : "absent",
      })),
    ],
    complete,
    source_command_id: "fixture-runtime-probe",
  });
}

function policy(overrides = {}) {
  const permissiveTarget = (targetId, failureFamily) => ({
    target_id: targetId,
    failure_family: failureFamily,
    thresholds: {
      task_success_rate: { minimum_candidate: 0, minimum_delta: -1 },
      visible_pass_rate: { minimum_candidate: 0, minimum_delta: -1 },
      hidden_pass_rate: { minimum_candidate: 0, minimum_delta: -1 },
      defect_escape_rate: { maximum_candidate: 1, maximum_delta: 1 },
    },
  });
  const input = {
    policy_version: "2.0.0-fixture",
    required_suites: ["development", "held_out", "canary"],
    targets: [permissiveTarget("target-family-a", "family-a"), permissiveTarget("target-family-b", "family-b")],
    protected_failure_families: [{
      failure_family: "family-protected",
      criticality: "critical",
      thresholds: {
        task_success_rate_minimum_delta: 0,
        visible_pass_rate_minimum_delta: 0,
        hidden_pass_rate_minimum_delta: 0,
        defect_escape_rate_maximum_delta: 0,
      },
    }],
    quality_requirements: {
      require_complete_attestation: true,
      require_complete_quality_outcomes: true,
      require_integrated_verification: true,
      maximum_architecture_policy_violations: 0,
      maximum_invariant_violations: 0,
      maximum_unverified_critical_invariants: 0,
      maximum_incomplete_dossiers: 0,
      maximum_pre_edit_gate_violations: 0,
      maximum_unresolved_affected_path_gaps: 0,
      minimum_edge_case_verification_rate: 1,
      minimum_failure_mode_verification_rate: 1,
      maximum_test_quality_failures: 0,
      maximum_permission_widening: 0,
      maximum_introduced_regressions: 0,
      maximum_hidden_edge_case_failures: 0,
    },
    profile_requirements: {
      experiment_id: EXPERIMENT_ID,
      experiment_fingerprint: EXPERIMENT_FINGERPRINT,
      pair_universe_fingerprint: qualityAcceptancePairUniverseFingerprint(canonicalExperimentBindings),
      require_distinct_model_profiles_within_pair: true,
      require_installed_runtime_evidence: true,
    },
    cost_ceiling: null,
    duration_ceiling: null,
    token_ceiling: null,
    expected_producers: {
      live_report: QUALITY_ACCEPTANCE_PRODUCERS.liveReport,
      quality_outcomes: QUALITY_ACCEPTANCE_PRODUCERS.qualityOutcomes,
    },
    ...overrides,
  };
  return createQualityAcceptancePolicy(input);
}

function check(checkId, status = "passed") {
  return {
    check_id: checkId,
    status,
    exit_code: status === "passed" ? 0 : status === "failed" ? 1 : null,
    stdout_chars: 0,
    stderr_chars: 0,
  };
}

function runtimeExecutionBindingFor(role, binding, scenario, runtime, permission, overrides = {}) {
  const prescribed = binding[role];
  return createRuntimeExecutionBinding({
    repository_fingerprint: REPOSITORY_FINGERPRINT,
    host_profile_id: permission.profile_id,
    experiment_id: binding.experiment_id,
    experiment_fingerprint: binding.experiment_fingerprint,
    comparison_id: binding.comparison_id,
    variant_id: binding.variant_id,
    harness_role: binding.harness_role,
    scenario_id: scenario.scenario_id,
    scenario_fingerprint: scenario.scenario_fingerprint,
    repetition: binding.repetition,
    profile_role: role,
    profile_fingerprint: prescribed.profile_fingerprint,
    model_profile_id: prescribed.model_profile_id,
    model_profile_fingerprint: prescribed.model_profile_fingerprint,
    model_id: prescribed.model_id,
    reasoning_effort: prescribed.reasoning_effort,
    text_verbosity: prescribed.text_verbosity,
    mode: prescribed.mode,
    prompt_profile_id: prescribed.prompt_profile_id,
    prompt_profile_fingerprint: prescribed.prompt_profile_fingerprint,
    runtime_model_evidence_fingerprint: runtime.content_fingerprint,
    permission_snapshot_fingerprint: fingerprint(permission),
    permission_profile_fingerprint: permission.profile_fingerprint,
    ...overrides,
  });
}

function bindRuntimeExecutionFingerprint(resultValue, runtimeExecutionFingerprint) {
  const updated = structuredClone(resultValue);
  updated.runtime_execution_fingerprint = runtimeExecutionFingerprint;
  if (updated.quality_attestation !== null) {
    const attestationInput = { ...updated.quality_attestation, runtime_execution_fingerprint: runtimeExecutionFingerprint };
    delete attestationInput.schema_version;
    delete attestationInput.fingerprint;
    updated.quality_attestation = createQualityAttestation(attestationInput);
  }
  updated.quality_bundle_fingerprint = qualityBundleFingerprint(
    updated.quality_attestation,
    updated.quality_outcomes,
  );
  return updated;
}

function result(role, scenarioOrBinding, {
  runId = null,
  runtime = null,
  modelProfileFingerprint = null,
  modelProfileId = null,
  promptProfileId = null,
  promptProfileFingerprint = null,
  qualityProducer = QUALITY_ACCEPTANCE_PRODUCERS.qualityOutcomes,
  qualityComplete = true,
  quality = {},
  attestationAvailable = true,
  integratedVerificationSequence = 4,
  visibleStatuses = ["passed"],
  hiddenStatuses = ["passed"],
  tokenAvailable = true,
  tokenTotal = 100,
  costAvailable = true,
  status = null,
  scenarioDefinition = null,
  permissionEvidence = null,
  hostProfileId = null,
  runtimeExecutionFingerprint = undefined,
} = {}) {
  const binding = Object.hasOwn(scenarioOrBinding, "comparison_id")
    ? scenarioOrBinding
    : canonicalExperimentBindings.find((entry) => entry.scenario_id === scenarioOrBinding.scenario_id);
  assert(binding, `missing fixture experiment binding for ${scenarioOrBinding.scenario_id}`);
  const scenario = scenarioDefinition
    ?? canonicalScenarios.find((entry) => entry.scenario_id === binding.scenario_id);
  assert(scenario, `missing canonical scenario ${binding.scenario_id}`);
  const resolvedRunId = runId ?? `run-${role}-${binding.comparison_id}`;
  const prescribed = binding[role];
  const resolvedRuntime = runtime ?? runtimeEvidence(role, binding);
  const resolvedPermission = permissionEvidence ?? permissionSnapshot(role, `${role}-fixture`);
  const resolvedModelProfileId = modelProfileId ?? prescribed.model_profile_id;
  const resolvedModelProfileFingerprint = modelProfileFingerprint ?? prescribed.model_profile_fingerprint;
  const resolvedPromptId = promptProfileId ?? prescribed.prompt_profile_id;
  const resolvedPromptFingerprint = promptProfileFingerprint ?? prescribed.prompt_profile_fingerprint;
  const resolvedHostProfileId = hostProfileId ?? resolvedPermission.profile_id;
  const modelId = prescribed.model_id;
  const visible = visibleStatuses.map((entry, index) => check(`${scenario.scenario_id}-visible-${index + 1}`, entry));
  const hidden = hiddenStatuses.map((entry, index) => check(`${scenario.scenario_id}-hidden-${index + 1}`, entry));
  const allPassed = [...visible, ...hidden].every((entry) => entry.status === "passed");
  const resolvedStatus = status ?? (allPassed ? "passed" : "failed");
  const runtimeExecutionBinding = runtimeExecutionBindingFor(role, binding, scenario, resolvedRuntime, resolvedPermission, {
    host_profile_id: resolvedHostProfileId,
    model_profile_id: resolvedModelProfileId,
    model_profile_fingerprint: resolvedModelProfileFingerprint,
    prompt_profile_id: resolvedPromptId,
    prompt_profile_fingerprint: resolvedPromptFingerprint,
  });
  const resolvedRuntimeExecutionFingerprint = runtimeExecutionFingerprint === undefined
    ? runtimeExecutionBinding.runtime_execution_fingerprint
    : runtimeExecutionFingerprint;
  const integratedEvidenceFingerprint = integratedVerificationSequence === null
    ? null
    : fingerprint({ integrated_verification: resolvedRunId, sequence: integratedVerificationSequence });
  const attestation = attestationAvailable ? createQualityAttestation({
    run_id: resolvedRunId,
    task_id: `task-${scenario.scenario_id}`,
    dossier_id: `dossier-${scenario.scenario_id}`,
    dossier_schema_version: 1,
    dossier_fingerprint: fingerprint({ dossier: resolvedRunId }),
    gate_id: `gate-${scenario.scenario_id}`,
    gate_status: "passed",
    gate_fingerprint: fingerprint({ gate: resolvedRunId }),
    gate_trace_sequence: 1,
    first_implementation_sequence: 2,
    last_implementation_action_sequence: 3,
    last_workspace_mutation_sequence: 3,
    integrated_verification_sequence: integratedVerificationSequence,
    integrated_verification_evidence_fingerprint: integratedEvidenceFingerprint,
    runtime_execution_fingerprint: resolvedRuntimeExecutionFingerprint,
    workspace_at_gate_fingerprint: fingerprint({ workspace: `${resolvedRunId}-gate` }),
    final_workspace_fingerprint: fingerprint({ workspace: `${resolvedRunId}-final` }),
    model_profile_id: resolvedModelProfileId,
    model_profile_fingerprint: resolvedModelProfileFingerprint,
    prompt_profile_id: resolvedPromptId,
    prompt_profile_fingerprint: resolvedPromptFingerprint,
    post_architecture_evaluation_fingerprint: null,
    artifact_refs: [
      { kind: "file", value: "quality/dossier.json" },
      { kind: "file", value: "quality/gate.json" },
      ...(integratedEvidenceFingerprint === null
        ? []
        : [{ kind: "file", value: "quality/integrated-verification-evidence.json" }]),
    ],
    teardown_verified: true,
    attested_at: NOW,
  }) : null;
  const qualityOutcomes = createQualityOutcomes({
    producer_id: qualityProducer,
    experiment_id: binding.experiment_id,
    comparison_id: binding.comparison_id,
    variant_id: binding.variant_id,
    harness_role: binding.harness_role,
    scenario_id: scenario.scenario_id,
    repetition: binding.repetition,
    profile_role: role,
    operational_run_id: resolvedRunId,
    complete: qualityComplete,
    architecture_policy_violations: 0,
    invariant_violations: 0,
    unverified_critical_invariants: 0,
    incomplete_dossier: false,
    pre_edit_gate_violations: 0,
    unresolved_affected_path_gaps: 0,
    edge_case_verification_rate: 1,
    failure_mode_verification_rate: 1,
    test_quality_failures: 0,
    permission_widening: 0,
    introduced_regressions: 0,
    hidden_edge_case_failures: 0,
    integrated_verification_complete: true,
    incomplete_evidence: qualityComplete ? [] : ["QUALITY_FIXTURE_INCOMPLETE"],
    ...quality,
  });
  return {
    scenario_id: scenario.scenario_id,
    repetition: binding.repetition,
    profile_role: role,
    repository_fingerprint: REPOSITORY_FINGERPRINT,
    profile_fingerprint: prescribed.profile_fingerprint,
    operational_run_id: resolvedRunId,
    scenario_fingerprint: scenario.scenario_fingerprint,
    status: resolvedStatus,
    adapter_classification: "passed",
    setup_results: [],
    visible_results: visible,
    hidden_results: hidden,
    visible_pass_rate: visible.filter((entry) => entry.status === "passed").length / visible.length,
    hidden_pass_rate: hidden.filter((entry) => entry.status === "passed").length / hidden.length,
    defect_escape_rate: hidden.some((entry) => entry.status !== "passed") ? 1 : 0,
    duration_ms: 10,
    cost: costAvailable ? { available: true, value: 1, currency: "USD" } : { available: false, value: null, currency: null },
    model: { available: true, value: modelId },
    tool: { available: true, value: "fixture-adapter" },
    incomplete_evidence: [],
    experiment_id: binding.experiment_id,
    experiment_fingerprint: binding.experiment_fingerprint,
    comparison_id: binding.comparison_id,
    variant_id: binding.variant_id,
    harness_role: binding.harness_role,
    host_profile_id: resolvedHostProfileId,
    model_profile_id: resolvedModelProfileId,
    model_profile_fingerprint: resolvedModelProfileFingerprint,
    runtime_model_evidence_fingerprint: resolvedRuntime.content_fingerprint,
    runtime_execution_fingerprint: resolvedRuntimeExecutionFingerprint,
    permission_snapshot_fingerprint: fingerprint(resolvedPermission),
    permission_profile_fingerprint: resolvedPermission.profile_fingerprint,
    prompt_profile_id: resolvedPromptId,
    prompt_profile_fingerprint: resolvedPromptFingerprint,
    token_usage: tokenAvailable
      ? { available: true, input_tokens: Math.floor(tokenTotal / 2), output_tokens: tokenTotal - Math.floor(tokenTotal / 2), total_tokens: tokenTotal }
      : { available: false, input_tokens: null, output_tokens: null, total_tokens: null },
    quality_attestation: attestation,
    quality_bundle_fingerprint: qualityBundleFingerprint(attestation, qualityOutcomes),
    quality_outcomes: qualityOutcomes,
  };
}

function report(results, overrides = {}) {
  return createQualityLiveReport({
    evaluation_run_id: overrides.evaluation_run_id ?? `eval-${fingerprint(results).slice(7, 19)}`,
    created_at: NOW,
    provenance: overrides.provenance ?? {
      producer_id: QUALITY_ACCEPTANCE_PRODUCERS.liveReport,
      evidence_kind: "live",
      complete: true,
    },
    results,
  });
}

function completeInputs({
  resultOverrides = () => ({}),
  reportOverrides = {},
  policyOverride = null,
  runtimeFactory = (role, binding) => runtimeEvidence(role, binding),
  baselineId = "baseline-fixture",
  candidateId = "candidate-fixture",
  permissionFactory = (role, profileId) => permissionSnapshot(role, profileId),
} = {}) {
  const baselinePermissionSnapshot = permissionFactory("baseline", baselineId);
  const candidatePermissionSnapshot = permissionFactory("candidate", candidateId);
  const permissions = {
    baseline: baselinePermissionSnapshot,
    candidate: candidatePermissionSnapshot,
  };
  const runtimeModelEvidence = [];
  const results = canonicalExperimentBindings.flatMap((binding) => QUALITY_ACCEPTANCE_PROFILE_ROLES.map((role) => {
    const runtime = runtimeFactory(role, binding);
    runtimeModelEvidence.push(runtime);
    const scenario = canonicalScenarios.find((entry) => entry.scenario_id === binding.scenario_id);
    return result(role, binding, {
      runtime,
      permissionEvidence: permissions[role],
      ...resultOverrides(role, scenario, binding),
    });
  }));
  return {
    reports: [report(results, reportOverrides)],
    policy: policyOverride ?? policy(),
    canonicalScenarios,
    canonicalExperimentBindings,
    runtimeModelEvidence,
    baselinePermissionSnapshot,
    candidatePermissionSnapshot,
    baselineId,
    candidateId,
    clock: () => new Date(NOW),
    idFactory: () => "quality-decision-fixture",
  };
}

function legacyReportFrom(v2) {
  const extra = new Set([
    "experiment_id",
    "experiment_fingerprint",
    "comparison_id",
    "variant_id",
    "harness_role",
    "host_profile_id",
    "model_profile_id",
    "model_profile_fingerprint",
    "runtime_model_evidence_fingerprint",
    "runtime_execution_fingerprint",
    "permission_snapshot_fingerprint",
    "permission_profile_fingerprint",
    "prompt_profile_id",
    "prompt_profile_fingerprint",
    "token_usage",
    "quality_attestation",
    "quality_bundle_fingerprint",
    "quality_outcomes",
  ]);
  return {
    ...structuredClone(v2),
    schema_version: 1,
    results: v2.results.map((entry) => Object.fromEntries(Object.entries(entry).filter(([key]) => !extra.has(key)))),
  };
}

test("strict report and policy v1/v2 separation", () => {
  const inputs = completeInputs();
  validateQualityLiveReport(inputs.reports[0]);
  const legacy = legacyReportFrom(inputs.reports[0]);
  expectCode(() => validateQualityLiveReport(legacy), "QUALITY_ACCEPTANCE_REPORT_SCHEMA");
  const v1Policy = { ...structuredClone(inputs.policy), schema_version: 1 };
  expectCode(() => validateQualityAcceptancePolicy(v1Policy), "QUALITY_ACCEPTANCE_POLICY_SCHEMA");
});

test("checked-in v2 policy binds the complete role-specific experiment", () => {
  const checkedPolicy = JSON.parse(fs.readFileSync("quality/acceptance/acceptance-policy.v2.json", "utf8"));
  validateQualityAcceptancePolicy(checkedPolicy);
  const catalog = JSON.parse(fs.readFileSync("quality/model-profiles/catalog.v1.json", "utf8"));
  const experiment = JSON.parse(fs.readFileSync("quality/model-profiles/experiment.v1.json", "utf8"));
  const promptInventory = JSON.parse(fs.readFileSync("quality/prompt-inventory/baseline.v1.json", "utf8"));
  assert.equal(checkedPolicy.profile_requirements.experiment_id, experiment.experiment_id);
  assert.equal(checkedPolicy.profile_requirements.experiment_fingerprint, experiment.content_fingerprint);
  const bindings = createCanonicalExperimentBindings({
    experiment,
    catalog,
    promptProfiles: Object.fromEntries(QUALITY_ACCEPTANCE_PROFILE_ROLES.map((role) => [role, {
      prompt_profile_id: promptInventory.inventory_id,
      prompt_profile_fingerprint: promptInventory.content_fingerprint,
    }])),
  });
  assert.equal(bindings.length, 96);
  assert.equal(new Set(bindings.map((entry) => entry.comparison_id)).size, 96);
  assert(new Set(bindings.flatMap((entry) => [entry.baseline.model_profile_id, entry.candidate.model_profile_id])).size > 2);
  assert.equal(
    checkedPolicy.profile_requirements.pair_universe_fingerprint,
    qualityAcceptancePairUniverseFingerprint(bindings),
  );
});

test("all 96 checked-in comparison identities pass through the assessment engine", () => {
  const checkedPolicy = JSON.parse(fs.readFileSync("quality/acceptance/acceptance-policy.v2.json", "utf8"));
  const catalog = JSON.parse(fs.readFileSync("quality/model-profiles/catalog.v1.json", "utf8"));
  const experiment = JSON.parse(fs.readFileSync("quality/model-profiles/experiment.v1.json", "utf8"));
  const promptInventory = JSON.parse(fs.readFileSync("quality/prompt-inventory/baseline.v1.json", "utf8"));
  const promptProfiles = Object.fromEntries(QUALITY_ACCEPTANCE_PROFILE_ROLES.map((role) => [role, {
    prompt_profile_id: promptInventory.inventory_id,
    prompt_profile_fingerprint: promptInventory.content_fingerprint,
  }]));
  const bindings = createCanonicalExperimentBindings({ experiment, catalog, promptProfiles });
  const loaded = loadScenarioCorpus({ root: process.cwd() });
  const loadedById = new Map(loaded.scenarios.map((scenario) => [scenario.id, scenario]));
  const scenarios = experiment.scenario_cells.map((cell) => {
    const scenario = loadedById.get(cell.scenario_id);
    assert(scenario, `missing checked scenario ${cell.scenario_id}`);
    assert(loaded.suiteManifest.suites[cell.suite].includes(cell.scenario_id));
    return {
      scenario_id: scenario.id,
      failure_family: scenario.failure_family,
      suite: cell.suite,
      repetitions: scenario.repetitions,
      scenario_fingerprint: fingerprint(scenario),
    };
  });
  const scenarioById = new Map(scenarios.map((entry) => [entry.scenario_id, entry]));
  const runtimeModelEvidence = [];
  const baselineId = "baseline-real-cli-fixture";
  const candidateId = "candidate-real-cli-fixture";
  const permissionSnapshots = {
    baseline: permissionSnapshot("baseline", baselineId),
    candidate: permissionSnapshot("candidate", candidateId),
  };
  const results = bindings.flatMap((binding) => QUALITY_ACCEPTANCE_PROFILE_ROLES.map((role) => {
    const runtime = runtimeEvidence(role, binding);
    runtimeModelEvidence.push(runtime);
    return result(role, binding, {
      runtime,
      scenarioDefinition: scenarioById.get(binding.scenario_id),
      permissionEvidence: permissionSnapshots[role],
    });
  }));
  assert.equal(results.length, 192);
  assert.equal(runtimeModelEvidence.length, 192);
  const actualReport = report(results, { evaluation_run_id: "eval-real-experiment-fixture" });
  const decision = assessQualityCandidate({
    reports: [actualReport],
    policy: checkedPolicy,
    canonicalScenarios: scenarios,
    canonicalExperimentBindings: bindings,
    runtimeModelEvidence,
    baselinePermissionSnapshot: permissionSnapshots.baseline,
    candidatePermissionSnapshot: permissionSnapshots.candidate,
    baselineId,
    candidateId,
    clock: () => new Date(NOW),
    idFactory: () => "decision-real-experiment-fixture",
  });
  assert.equal(decision.decision, "accepted");
  assert.equal(decision.paired_bindings.length, 96);
  assert.equal(new Set(decision.paired_bindings.map((entry) => entry.comparison_id)).size, 96);
  assert.equal(decision.identities.experiment_fingerprint, experiment.content_fingerprint);

  const temporaryRoot = path.join(".oc_harness", `quality-real-cli-${process.pid}-${Date.now()}`);
  const absoluteRoot = path.resolve(temporaryRoot);
  const relativeRoot = path.relative(process.cwd(), absoluteRoot).replaceAll("\\", "/");
  assert(relativeRoot.startsWith(".oc_harness/quality-real-cli-") && !relativeRoot.includes(".."));
  fs.mkdirSync(absoluteRoot, { recursive: true });
  try {
    const runtimePath = path.join(absoluteRoot, "runtime.json");
    const baselinePermissionPath = path.join(absoluteRoot, "baseline-permission.json");
    const candidatePermissionPath = path.join(absoluteRoot, "candidate-permission.json");
    const reportHistory = createReportHistory({
      workspaceRoot: process.cwd(),
      reportDir: absoluteRoot,
      clock: () => new Date(NOW),
      idFactory: () => "quality-real-cli-history",
    });
    const reportPath = reportHistory.write(actualReport).jsonPath;
    fs.writeFileSync(runtimePath, `${JSON.stringify(runtimeModelEvidence)}\n`, "utf8");
    fs.writeFileSync(baselinePermissionPath, `${JSON.stringify(permissionSnapshots.baseline)}\n`, "utf8");
    fs.writeFileSync(candidatePermissionPath, `${JSON.stringify(permissionSnapshots.candidate)}\n`, "utf8");
    const outputDirectory = path.join(temporaryRoot, "decisions");
    const command = spawnSync(process.execPath, [
      "scripts/assess-quality-candidate.mjs",
      "--report", path.relative(process.cwd(), reportPath),
      "--runtime-evidence", path.relative(process.cwd(), runtimePath),
      "--baseline-permission-evidence", path.relative(process.cwd(), baselinePermissionPath),
      "--candidate-permission-evidence", path.relative(process.cwd(), candidatePermissionPath),
      "--baseline-id", baselineId,
      "--candidate-id", candidateId,
      "--output-dir", outputDirectory,
    ], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(command.status, 0, `${command.stdout}\n${command.stderr}`);
    assert.match(command.stdout, /Quality candidate decision: accepted/);
    assert.equal(fs.readdirSync(path.resolve(outputDirectory)).length, 2);
  } finally {
    fs.rmSync(absoluteRoot, { recursive: true, force: true });
  }
});

test("unknown and missing report and policy fields fail closed", () => {
  const inputs = completeInputs();
  const unknownReport = { ...structuredClone(inputs.reports[0]), surprise: true };
  expectCode(() => validateQualityLiveReport(unknownReport), "CONTRACT_UNKNOWN_FIELD");
  const missingQuality = structuredClone(inputs.reports[0]);
  delete missingQuality.results[0].quality_outcomes;
  expectCode(() => validateQualityLiveReport(missingQuality), "CONTRACT_MISSING_FIELD");
  const unknownPolicy = { ...structuredClone(inputs.policy), scalar_score: 1 };
  expectCode(() => validateQualityAcceptancePolicy(unknownPolicy), "CONTRACT_UNKNOWN_FIELD");
});

test("outcome tuple and attestation run bindings reject cross-role and cross-run evidence", () => {
  const scenario = canonicalScenarios[0];
  const baselineRuntime = runtimeEvidence("baseline");
  const original = result("baseline", scenario, { runtime: baselineRuntime });
  const crossRole = structuredClone(original);
  crossRole.quality_outcomes.profile_role = "candidate";
  crossRole.quality_outcomes.fingerprint = qualityOutcomesFingerprint(crossRole.quality_outcomes);
  crossRole.quality_bundle_fingerprint = qualityBundleFingerprint(crossRole.quality_attestation, crossRole.quality_outcomes);
  expectCode(() => validateQualityLiveReport({
    schema_version: 2,
    evaluation_run_id: "eval-cross-role",
    created_at: NOW,
    provenance: { producer_id: QUALITY_ACCEPTANCE_PRODUCERS.liveReport, evidence_kind: "live", complete: true },
    results: [crossRole],
  }), "QUALITY_ACCEPTANCE_OUTCOME_BINDING");

  const crossRun = structuredClone(original);
  crossRun.quality_attestation.run_id = "different-run";
  crossRun.quality_attestation.fingerprint = fingerprint(Object.fromEntries(
    Object.entries(crossRun.quality_attestation).filter(([key]) => key !== "fingerprint"),
  ));
  crossRun.quality_bundle_fingerprint = qualityBundleFingerprint(crossRun.quality_attestation, crossRun.quality_outcomes);
  expectCode(() => validateQualityLiveReport({
    schema_version: 2,
    evaluation_run_id: "eval-cross-run",
    created_at: NOW,
    provenance: { producer_id: QUALITY_ACCEPTANCE_PRODUCERS.liveReport, evidence_kind: "live", complete: true },
    results: [crossRun],
  }), "QUALITY_ACCEPTANCE_ATTESTATION_RUN");
});

test("duplicate runs reject while prescribed role-specific identities coexist", () => {
  const sameRun = "shared-operational-run";
  const firstBinding = canonicalExperimentBindings[0];
  const otherBinding = canonicalExperimentBindings.find((entry) => entry.scenario_id === "target-b");
  const duplicate = [
    result("baseline", firstBinding, { runtime: runtimeEvidence("baseline", firstBinding), runId: sameRun }),
    result("baseline", otherBinding, { runtime: runtimeEvidence("baseline", otherBinding), runId: sameRun }),
  ];
  expectCode(() => report(duplicate), "QUALITY_ACCEPTANCE_DUPLICATE_RUN");

  const prescribed = [
    result("baseline", firstBinding, { runtime: runtimeEvidence("baseline", firstBinding) }),
    result("baseline", otherBinding, { runtime: runtimeEvidence("baseline", otherBinding) }),
  ];
  validateQualityLiveReport(report(prescribed));
  assert.notEqual(prescribed[0].model_profile_id, prescribed[1].model_profile_id);

  const substituted = completeInputs({
    resultOverrides: (role, scenario) => role === "candidate" && scenario.scenario_id === "target-b"
      ? { modelProfileFingerprint: fingerprint({ unplanned: true }) }
      : {},
  });
  const decision = assessQualityCandidate(substituted);
  assert.equal(decision.decision, "rejected");
  assert.equal(decision.hard_gates.profile_identity.status, "failed");
});

test("legacy report becomes explicit unavailable evidence in the v2 engine", () => {
  const inputs = completeInputs();
  inputs.reports = [legacyReportFrom(inputs.reports[0])];
  const decision = assessQualityCandidate(inputs);
  assert.equal(decision.decision, "inconclusive");
  assert(decision.missing_evidence.includes("QUALITY_LEGACY_REPORT_V1_UNAVAILABLE"));
  assert.equal(decision.input_report_fingerprints.length, 0);
});

test("complete paired v2 evidence passes every independent hard gate", () => {
  const inputs = completeInputs();
  const decision = assessQualityCandidate(inputs);
  assert.equal(decision.decision, "accepted");
  for (const [name, entry] of Object.entries(decision.hard_gates)) {
    assert(["passed", "not_applicable"].includes(entry.status), `${name} was ${entry.status}`);
  }
  assert.equal(decision.paired_bindings.length, canonicalExperimentBindings.length);
  assert.equal(new Set(decision.paired_bindings.map((entry) => entry.comparison_id)).size, canonicalExperimentBindings.length);
  assert(new Set(decision.paired_bindings.map((entry) => entry.harness_role)).size > 1);
  assert.equal(inputs.baselinePermissionSnapshot.subject_fingerprint, REPOSITORY_FINGERPRINT);
  assert.equal(inputs.candidatePermissionSnapshot.subject_fingerprint, REPOSITORY_FINGERPRINT);
  assert.equal(decision.identities.repository_fingerprint, REPOSITORY_FINGERPRINT);
  assert(decision.paired_bindings.every((entry) => (
    entry.baseline_identity.repository_fingerprint === REPOSITORY_FINGERPRINT
    && entry.candidate_identity.repository_fingerprint === REPOSITORY_FINGERPRINT
    && entry.baseline_identity.host_profile_id === inputs.baselineId
    && entry.candidate_identity.host_profile_id === inputs.candidateId
    && entry.baseline_identity.runtime_execution_fingerprint !== null
    && entry.candidate_identity.runtime_execution_fingerprint !== null
  )));
  assert(inputs.reports[0].results.every((entry) => (
    entry.runtime_execution_fingerprint !== null
    && entry.quality_attestation?.runtime_execution_fingerprint === entry.runtime_execution_fingerprint
  )));
  assert.deepEqual(decision.reason_codes, ["QUALITY_ACCEPTANCE_ALL_GATES_PASSED"]);
});

test("canonical runtime execution binding is immutable and fail-closed", () => {
  const binding = canonicalExperimentBindings[0];
  const scenario = canonicalScenarios.find((entry) => entry.scenario_id === binding.scenario_id);
  const runtime = runtimeEvidence("candidate", binding);
  const permission = permissionSnapshot("candidate", "candidate-fixture");
  const canonical = runtimeExecutionBindingFor("candidate", binding, scenario, runtime, permission);
  validateRuntimeExecutionBinding(canonical);
  assert(Object.isFrozen(canonical));

  for (const key of [
    "repository_fingerprint",
    "host_profile_id",
    "reasoning_effort",
    "text_verbosity",
    "mode",
    "runtime_model_evidence_fingerprint",
    "permission_snapshot_fingerprint",
    "permission_profile_fingerprint",
  ]) {
    const missing = structuredClone(canonical);
    delete missing[key];
    expectCode(() => validateRuntimeExecutionBinding(missing), "CONTRACT_MISSING_FIELD");
  }

  const substituted = structuredClone(canonical);
  substituted.mode = "pro";
  expectCode(() => validateRuntimeExecutionBinding(substituted), "QUALITY_RUNTIME_EXECUTION_FINGERPRINT");
});

test("v2 runtime execution fields and attestation binding are structurally mandatory", () => {
  const inputs = completeInputs();
  for (const key of ["host_profile_id", "runtime_execution_fingerprint"]) {
    const missing = structuredClone(inputs.reports[0]);
    delete missing.results[0][key];
    expectCode(() => validateQualityLiveReport(missing), "CONTRACT_MISSING_FIELD");
  }

  const substituted = structuredClone(inputs.reports[0]);
  substituted.results[0].runtime_execution_fingerprint = fingerprint({ substituted: "result-only" });
  expectCode(
    () => validateQualityLiveReport(substituted),
    "QUALITY_ACCEPTANCE_ATTESTATION_RUNTIME_EXECUTION",
  );
});

test("missing runtime execution evidence remains representable but cannot pass acceptance", () => {
  const inputs = completeInputs({
    resultOverrides: (role, scenario) => role === "candidate" && scenario.scenario_id === "target-a"
      ? {
        runtimeExecutionFingerprint: null,
        attestationAvailable: false,
        qualityComplete: false,
        quality: { incomplete_dossier: true },
      }
      : {},
  });
  const decision = assessQualityCandidate(inputs);
  assert.equal(decision.decision, "inconclusive");
  assert.equal(decision.hard_gates.profile_identity.status, "inconclusive");
  assert(decision.missing_evidence.includes("QUALITY_RUNTIME_EXECUTION_CANDIDATE_MISSING"));
  assert(decision.paired_bindings.some((entry) => entry.candidate_identity.runtime_execution_fingerprint === null));
});

test("canonical effort, verbosity, and mode substitutions cannot be attested into acceptance", () => {
  const substitutions = [
    ["reasoning_effort", "high"],
    ["text_verbosity", "medium"],
    ["mode", "pro"],
  ];
  for (const [key, value] of substitutions) {
    const inputs = completeInputs();
    const binding = canonicalExperimentBindings[0];
    const scenario = canonicalScenarios.find((entry) => entry.scenario_id === binding.scenario_id);
    const runtime = inputs.runtimeModelEvidence.find((entry) => (
      entry.requested_profile_id === binding.candidate.model_profile_id
      && entry.evidence_id.includes(binding.comparison_id)
    ));
    const alternate = runtimeExecutionBindingFor(
      "candidate",
      binding,
      scenario,
      runtime,
      inputs.candidatePermissionSnapshot,
      { [key]: value },
    );
    const results = structuredClone(inputs.reports[0].results);
    const index = results.findIndex((entry) => (
      entry.profile_role === "candidate" && entry.comparison_id === binding.comparison_id
    ));
    results[index] = bindRuntimeExecutionFingerprint(results[index], alternate.runtime_execution_fingerprint);
    inputs.reports = [report(results, { evaluation_run_id: `eval-substituted-${key}` })];

    const decision = assessQualityCandidate(inputs);
    assert.equal(decision.decision, "rejected", key);
    assert.equal(decision.hard_gates.profile_identity.status, "failed", key);
    assert(decision.reason_codes.includes("QUALITY_RUNTIME_EXECUTION_CANDIDATE_BINDING_MISMATCH"), key);
  }
});

test("repository, host, runtime, and permission substitutions fail closed", () => {
  {
    const inputs = completeInputs({
      resultOverrides: (role, scenario) => role === "candidate" && scenario.scenario_id === "target-a"
        ? { hostProfileId: "candidate-substituted-host" }
        : {},
    });
    const decision = assessQualityCandidate(inputs);
    assert.equal(decision.decision, "rejected");
    assert(decision.reason_codes.includes("QUALITY_RUNTIME_EXECUTION_CANDIDATE_HOST_PROFILE_MISMATCH"));
    assert(decision.reason_codes.includes("QUALITY_RUNTIME_EXECUTION_CANDIDATE_BINDING_MISMATCH"));
  }

  {
    const inputs = completeInputs();
    const substitutedRepository = fingerprint({ repository: "substituted-runtime-binding" });
    const results = structuredClone(inputs.reports[0].results)
      .map((entry) => ({ ...entry, repository_fingerprint: substitutedRepository }));
    inputs.reports = [report(results, { evaluation_run_id: "eval-substituted-repository" })];
    const decision = assessQualityCandidate(inputs);
    assert.equal(decision.decision, "inconclusive");
    assert.equal(decision.hard_gates.profile_identity.status, "failed");
    assert(decision.reason_codes.includes("QUALITY_RUNTIME_EXECUTION_BASELINE_BINDING_MISMATCH"));
    assert(decision.missing_evidence.includes("QUALITY_PERMISSION_BASELINE_SUBJECT_MISMATCH"));
  }

  {
    const inputs = completeInputs();
    const results = structuredClone(inputs.reports[0].results);
    const candidate = results.find((entry) => entry.profile_role === "candidate");
    candidate.runtime_model_evidence_fingerprint = fingerprint({ runtime: "substituted" });
    inputs.reports = [report(results, { evaluation_run_id: "eval-substituted-runtime" })];
    const decision = assessQualityCandidate(inputs);
    assert.equal(decision.decision, "inconclusive");
    assert.equal(decision.hard_gates.profile_identity.status, "failed");
    assert(decision.reason_codes.includes("QUALITY_RUNTIME_EXECUTION_CANDIDATE_BINDING_MISMATCH"));
    assert(decision.missing_evidence.includes("QUALITY_RUNTIME_CANDIDATE_EVIDENCE_MISSING"));
  }

  for (const key of ["permission_snapshot_fingerprint", "permission_profile_fingerprint"]) {
    const inputs = completeInputs();
    const results = structuredClone(inputs.reports[0].results);
    const candidate = results.find((entry) => entry.profile_role === "candidate");
    candidate[key] = fingerprint({ permission: `substituted-${key}` });
    inputs.reports = [report(results, { evaluation_run_id: `eval-substituted-${key}` })];
    const decision = assessQualityCandidate(inputs);
    assert.equal(decision.decision, "inconclusive", key);
    assert.equal(decision.hard_gates.permission_surface.status, "inconclusive", key);
    assert(decision.missing_evidence.includes("QUALITY_PERMISSION_CANDIDATE_RESULT_BINDING_MISMATCH"), key);
  }
});

test("cross-repository baseline and candidate results fail closed before pairing", () => {
  const inputs = completeInputs();
  const mutated = structuredClone(inputs.reports[0]);
  const comparisonId = canonicalExperimentBindings[0].comparison_id;
  const candidate = mutated.results.find((entry) => (
    entry.comparison_id === comparisonId && entry.profile_role === "candidate"
  ));
  candidate.repository_fingerprint = fingerprint({ repository: "cross-pair" });
  inputs.reports = [report(mutated.results, { evaluation_run_id: "eval-cross-repository-pair" })];

  const decision = assessQualityCandidate(inputs);
  assert.equal(decision.decision, "inconclusive");
  assert.equal(decision.identities.repository_fingerprint, null);
  assert(decision.missing_evidence.includes("QUALITY_REPOSITORY_FINGERPRINT_MISMATCH"));
  assert(decision.missing_evidence.includes("QUALITY_REQUIRED_PAIR_REPOSITORY_MISMATCH"));
  assert(!decision.paired_bindings.some((entry) => entry.comparison_id === comparisonId));
});

test("repository drift across otherwise coherent reports is preserved and inconclusive", () => {
  const inputs = completeInputs();
  const allResults = structuredClone(inputs.reports[0].results);
  const firstComparisonId = canonicalExperimentBindings[0].comparison_id;
  const firstRepositoryResults = allResults.filter((entry) => entry.comparison_id === firstComparisonId);
  const driftedRepository = fingerprint({ repository: "cross-report" });
  const driftedResults = allResults
    .filter((entry) => entry.comparison_id !== firstComparisonId)
    .map((entry) => ({ ...entry, repository_fingerprint: driftedRepository }));
  inputs.reports = [
    report(firstRepositoryResults, { evaluation_run_id: "eval-repository-first" }),
    report(driftedResults, { evaluation_run_id: "eval-repository-drifted" }),
  ];

  const decision = assessQualityCandidate(inputs);
  assert.equal(decision.decision, "inconclusive");
  assert.equal(decision.identities.repository_fingerprint, null);
  assert.equal(decision.hard_gates.required_pairs.status, "passed");
  assert(decision.missing_evidence.includes("QUALITY_REPOSITORY_FINGERPRINT_MISMATCH"));
  assert.deepEqual(
    [...new Set(decision.paired_bindings.map((entry) => entry.baseline_identity.repository_fingerprint))].sort(),
    [REPOSITORY_FINGERPRINT, driftedRepository].sort(),
  );
});

test("baseline and candidate permission subjects must bind the canonical repository", () => {
  for (const mismatchedRole of QUALITY_ACCEPTANCE_PROFILE_ROLES) {
    const inputs = completeInputs({
      permissionFactory: (role, profileId) => permissionSnapshot(
        role,
        profileId,
        { bash: "ask", read: "allow" },
        role === mismatchedRole
          ? fingerprint({ repository: `permission-${role}-mismatch` })
          : REPOSITORY_FINGERPRINT,
      ),
    });
    const decision = assessQualityCandidate(inputs);
    assert.equal(decision.decision, "inconclusive");
    assert.equal(decision.identities.repository_fingerprint, REPOSITORY_FINGERPRINT);
    assert(decision.missing_evidence.includes(
      `QUALITY_PERMISSION_${mismatchedRole.toUpperCase()}_SUBJECT_MISMATCH`,
    ));
  }
});

test("an unrelated otherwise-valid permission artifact cannot replace repository-bound evidence", () => {
  const inputs = completeInputs();
  inputs.baselinePermissionSnapshot = permissionSnapshot(
    "baseline",
    inputs.baselineId,
    { bash: "ask", read: "allow" },
    fingerprint({ repository: "unrelated-permission-artifact" }),
  );
  const decision = assessQualityCandidate(inputs);
  assert.equal(decision.decision, "inconclusive");
  assert(decision.missing_evidence.includes("QUALITY_PERMISSION_BASELINE_SUBJECT_MISMATCH"));
});

test("immutable decision validation rejects repository substitution inside a paired identity", () => {
  const decision = assessQualityCandidate(completeInputs());
  const forged = structuredClone(decision);
  forged.paired_bindings[0].candidate_identity.repository_fingerprint = fingerprint({ repository: "forged" });
  forged.content_fingerprint = qualityAcceptanceDecisionFingerprint(forged);
  expectCode(() => validateQualityAcceptanceDecision(forged), "QUALITY_ACCEPTANCE_DECISION_PAIR_REPOSITORY");
});

test("permission widening is rejected with Milestone 1 comparison semantics", () => {
  const inputs = completeInputs({
    permissionFactory: (role, profileId) => permissionSnapshot(
      role,
      profileId,
      role === "candidate" ? { bash: "allow", read: "allow" } : { bash: "ask", read: "allow" },
    ),
  });
  const decision = assessQualityCandidate(inputs);
  assert.equal(decision.decision, "rejected");
  assert.equal(decision.hard_gates.permission_surface.status, "failed");
  assert(decision.reason_codes.includes("QUALITY_PERMISSION_SURFACE_WIDENED"));
});

test("permission key-set drift and result/snapshot substitution are inconclusive", () => {
  const keyDrift = completeInputs({
    permissionFactory: (role, profileId) => permissionSnapshot(
      role,
      profileId,
      role === "candidate" ? { read: "allow" } : { bash: "ask", read: "allow" },
    ),
  });
  const keyDecision = assessQualityCandidate(keyDrift);
  assert.equal(keyDecision.decision, "inconclusive");
  assert.equal(keyDecision.hard_gates.permission_surface.status, "inconclusive");
  assert(keyDecision.missing_evidence.includes("QUALITY_PERMISSION_KEYS_MISMATCH"));

  const substituted = completeInputs({
    resultOverrides: (role, scenario) => role === "candidate" && scenario.scenario_id === "target-a"
      ? {
        permissionEvidence: permissionSnapshot(
          "candidate",
          "candidate-fixture",
          { bash: "deny", read: "allow" },
        ),
      }
      : {},
  });
  const substitutedDecision = assessQualityCandidate(substituted);
  assert.equal(substitutedDecision.decision, "inconclusive");
  assert(
    substitutedDecision.missing_evidence.includes("QUALITY_PERMISSION_CANDIDATE_RESULT_BINDING_MISMATCH"),
  );
});

test("quality assessment CLI rejects raw reports and caller-controlled universes", () => {
  const inputs = completeInputs();
  const temporaryRoot = path.join(".oc_harness", `quality-acceptance-cli-${process.pid}-${Date.now()}`);
  const absoluteRoot = path.resolve(temporaryRoot);
  const relativeRoot = path.relative(process.cwd(), absoluteRoot).replaceAll("\\", "/");
  assert(relativeRoot.startsWith(".oc_harness/quality-acceptance-cli-") && !relativeRoot.includes(".."));
  fs.mkdirSync(absoluteRoot, { recursive: true });
  const write = (name, value) => {
    const target = path.join(absoluteRoot, name);
    fs.writeFileSync(target, `${JSON.stringify(value)}\n`, "utf8");
    return path.relative(process.cwd(), target);
  };
  try {
    const rawReport = write("report.json", inputs.reports[0]);
    const checkedCatalog = JSON.parse(fs.readFileSync("quality/model-profiles/catalog.v1.json", "utf8"));
    const checkedProfile = checkedCatalog.profiles[0];
    const runtime = write("runtime.json", sealRuntimeModelEvidence({
      schema_version: 1,
      evidence_id: "quality-cli-current-catalog",
      evidence_kind: "installed_runtime",
      runtime_name: "opencode",
      runtime_version: "quality-cli-fixture",
      captured_at: NOW,
      catalog_id: checkedCatalog.catalog_id,
      catalog_fingerprint: checkedCatalog.content_fingerprint,
      requested_profile_id: checkedProfile.profile_id,
      requested_model_id: checkedProfile.model_id,
      effective_model_id: checkedProfile.model_id,
      option_results: [
        { option_id: "model", requested_value: checkedProfile.model_id, effective_value: checkedProfile.model_id, status: "accepted" },
        { option_id: "reasoning_effort", requested_value: checkedProfile.default_reasoning_effort, effective_value: checkedProfile.default_reasoning_effort, status: "accepted" },
        { option_id: "text_verbosity", requested_value: checkedProfile.default_text_verbosity, effective_value: checkedProfile.default_text_verbosity, status: "accepted" },
        { option_id: "mode", requested_value: checkedProfile.mode, effective_value: checkedProfile.mode, status: "accepted" },
      ],
      complete: true,
      source_command_id: "quality-cli-current-catalog-fixture",
    }));
    const baselinePermission = write("baseline-permission.json", inputs.baselinePermissionSnapshot);
    const candidatePermission = write("candidate-permission.json", inputs.candidatePermissionSnapshot);
    const rawCommand = spawnSync(process.execPath, [
      "scripts/assess-quality-candidate.mjs",
      "--report", rawReport,
      "--runtime-evidence", runtime,
      "--baseline-permission-evidence", baselinePermission,
      "--candidate-permission-evidence", candidatePermission,
      "--baseline-id", inputs.baselineId,
      "--candidate-id", inputs.candidateId,
    ], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(rawCommand.status, 1);
    assert.match(rawCommand.stderr, /complete immutable history generation/);

    const overrideCommand = spawnSync(process.execPath, [
      "scripts/assess-quality-candidate.mjs",
      "--report", rawReport,
      "--runtime-evidence", runtime,
      "--baseline-permission-evidence", baselinePermission,
      "--candidate-permission-evidence", candidatePermission,
      "--canonical-scenarios", write("scenarios.json", inputs.canonicalScenarios),
      "--experiment-bindings", write("bindings.json", inputs.canonicalExperimentBindings),
      "--baseline-id", inputs.baselineId,
      "--candidate-id", inputs.candidateId,
    ], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(overrideCommand.status, 1);
    assert.match(overrideCommand.stderr, /unsupported argument --canonical-scenarios/);

    const historyDirectory = path.join(absoluteRoot, "history");
    const history = createReportHistory({
      workspaceRoot: process.cwd(),
      reportDir: historyDirectory,
      clock: () => new Date(NOW),
      idFactory: () => "quality-corrupt-marker",
    });
    const historical = history.write(inputs.reports[0]);
    const marker = JSON.parse(fs.readFileSync(historical.markerPath, "utf8"));
    marker.report_fingerprint = fingerprint({ forged: true });
    fs.writeFileSync(historical.markerPath, `${JSON.stringify(marker)}\n`, "utf8");
    const corruptCommand = spawnSync(process.execPath, [
      "scripts/assess-quality-candidate.mjs",
      "--report", path.relative(process.cwd(), historical.jsonPath),
      "--runtime-evidence", runtime,
      "--baseline-permission-evidence", baselinePermission,
      "--candidate-permission-evidence", candidatePermission,
      "--baseline-id", inputs.baselineId,
      "--candidate-id", inputs.candidateId,
    ], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(corruptCommand.status, 1);
    assert.match(corruptCommand.stderr, /complete immutable history generation/);
  } finally {
    fs.rmSync(absoluteRoot, { recursive: true, force: true });
  }
});

test("missing, untrusted, and incomplete quality evidence remain inconclusive", () => {
  const missing = completeInputs();
  const invalid = structuredClone(missing.reports[0]);
  delete invalid.results[0].quality_outcomes;
  missing.reports = [invalid];
  assert.equal(assessQualityCandidate(missing).decision, "inconclusive");

  const untrusted = completeInputs({
    resultOverrides: (role, scenario) => role === "candidate" && scenario.scenario_id === "target-a"
      ? { qualityProducer: "third-party/untrusted-quality" }
      : {},
  });
  const untrustedDecision = assessQualityCandidate(untrusted);
  assert.equal(untrustedDecision.decision, "inconclusive");
  assert(untrustedDecision.missing_evidence.includes("QUALITY_OUTCOME_PRODUCER_UNTRUSTED"));

  const incomplete = completeInputs({
    resultOverrides: (role, scenario) => role === "candidate" && scenario.scenario_id === "target-a"
      ? { qualityComplete: false }
      : {},
  });
  const incompleteDecision = assessQualityCandidate(incomplete);
  assert.equal(incompleteDecision.decision, "inconclusive");
  assert(incompleteDecision.missing_evidence.includes("QUALITY_OUTCOME_EVIDENCE_INCOMPLETE"));
});

test("pre-edit violation without an attestable dossier is representable but never accepted", () => {
  const inputs = completeInputs({
    resultOverrides: (role, scenario) => role === "candidate" && scenario.scenario_id === "target-a"
      ? { attestationAvailable: false, quality: { pre_edit_gate_violations: 1 } }
      : {},
  });
  validateQualityLiveReport(inputs.reports[0]);
  const decision = assessQualityCandidate(inputs);
  assert.equal(decision.decision, "inconclusive");
  assert.equal(decision.hard_gates.quality_evidence.status, "inconclusive");
  assert.equal(decision.hard_gates.quality_thresholds.status, "failed");
  assert(decision.missing_evidence.includes("QUALITY_ATTESTATION_EVIDENCE_MISSING"));
  assert(decision.reason_codes.includes("QUALITY_PRE_EDIT_GATE_VIOLATION"));
});

test("missing dossier attestation is explicit incomplete evidence, not an unrepresentable report", () => {
  const inputs = completeInputs({
    resultOverrides: (role, scenario) => role === "candidate" && scenario.scenario_id === "target-a"
      ? { attestationAvailable: false, quality: { incomplete_dossier: true } }
      : {},
  });
  validateQualityLiveReport(inputs.reports[0]);
  const decision = assessQualityCandidate(inputs);
  assert.equal(decision.decision, "inconclusive");
  assert(decision.reason_codes.includes("QUALITY_DOSSIER_INCOMPLETE"));
  assert.equal(
    decision.quality_metrics.complete_attestation_count,
    decision.quality_metrics.candidate_result_count
      - canonicalExperimentBindings.filter((entry) => entry.scenario_id === "target-a").length,
  );
});

test("passed attestation without integrated verification evidence fails closed", () => {
  expectCode(() => completeInputs({
    resultOverrides: (role, scenario) => role === "candidate" && scenario.scenario_id === "target-a"
      ? {
        integratedVerificationSequence: null,
        quality: { integrated_verification_complete: false },
      }
      : {},
  }), "QUALITY_ATTESTATION_INTEGRATED_EVIDENCE");
});

test("integrated-verification success requires a runner-attested sequence", () => {
  expectCode(() => completeInputs({
    resultOverrides: (role, scenario) => role === "candidate" && scenario.scenario_id === "target-a"
      ? { integratedVerificationSequence: null }
      : {},
  }), "QUALITY_ATTESTATION_INTEGRATED_EVIDENCE");
});

test("incomplete integrated-verification evidence has inconclusive precedence", () => {
  const inputs = completeInputs({
    resultOverrides: (role, scenario) => role === "candidate" && scenario.scenario_id === "target-a"
      ? {
        integratedVerificationSequence: null,
        attestationAvailable: false,
        qualityComplete: false,
        quality: { integrated_verification_complete: false },
      }
      : {},
  });
  const decision = assessQualityCandidate(inputs);
  assert.equal(decision.decision, "inconclusive");
  assert.equal(decision.hard_gates.quality_evidence.status, "inconclusive");
  assert.equal(decision.hard_gates.quality_thresholds.status, "failed");
});

test("null attestation bundle is content-bound and cannot be promoted by substitution", () => {
  const scenario = canonicalScenarios[0];
  const runtime = runtimeEvidence("candidate");
  const unattested = result("candidate", scenario, {
    runtime,
    attestationAvailable: false,
    quality: { pre_edit_gate_violations: 1 },
  });
  report([unattested]);
  const substituted = structuredClone(unattested);
  substituted.quality_attestation = result("candidate", scenario, { runtime }).quality_attestation;
  expectCode(() => validateQualityLiveReport({
    schema_version: 2,
    evaluation_run_id: "eval-substituted-attestation",
    created_at: NOW,
    provenance: { producer_id: QUALITY_ACCEPTANCE_PRODUCERS.liveReport, evidence_kind: "live", complete: true },
    results: [substituted],
  }), "QUALITY_ACCEPTANCE_BUNDLE_FINGERPRINT");
});

test("otherwise-green null attestation is invalid and forged failure promotion still fails", () => {
  expectCode(() => completeInputs({
    resultOverrides: (role, scenario) => role === "candidate" && scenario.scenario_id === "target-a"
      ? { attestationAvailable: false }
      : {},
  }), "QUALITY_ACCEPTANCE_ATTESTATION_MISSING_REASON");
  const inputs = completeInputs({
    resultOverrides: (role, scenario) => role === "candidate" && scenario.scenario_id === "target-a"
      ? { attestationAvailable: false, quality: { pre_edit_gate_violations: 1 } }
      : {},
  });
  const decision = assessQualityCandidate(inputs);
  assert.equal(decision.decision, "inconclusive");
  assert.equal(decision.hard_gates.quality_evidence.status, "inconclusive");
  const forged = structuredClone(decision);
  forged.hard_gates.quality_evidence = { status: "passed", reason_codes: [] };
  forged.hard_gates.quality_thresholds = { status: "passed", reason_codes: [] };
  forged.decision = "accepted";
  forged.reason_codes = ["QUALITY_ACCEPTANCE_ALL_GATES_PASSED"];
  forged.missing_evidence = [];
  forged.content_fingerprint = qualityAcceptanceDecisionFingerprint(forged);
  expectCode(() => validateQualityAcceptanceDecision(forged), "QUALITY_ACCEPTANCE_DECISION_ATTESTATION");
});

test("complete trusted architecture failure rejects", () => {
  const inputs = completeInputs({
    resultOverrides: (role, scenario) => role === "candidate" && scenario.scenario_id === "target-a"
      ? { quality: { architecture_policy_violations: 1 } }
      : {},
  });
  const decision = assessQualityCandidate(inputs);
  assert.equal(decision.decision, "rejected");
  assert.equal(decision.hard_gates.quality_thresholds.status, "failed");
  assert(decision.reason_codes.includes("QUALITY_ARCHITECTURE_POLICY_VIOLATION"));
});

test("mandatory incomplete evidence takes precedence over a complete quality failure", () => {
  const inputs = completeInputs({
    resultOverrides: (role, scenario) => {
      if (role !== "candidate") return {};
      if (scenario.scenario_id === "target-a") return { quality: { architecture_policy_violations: 1 } };
      if (scenario.scenario_id === "target-b") return { qualityComplete: false };
      return {};
    },
  });
  const decision = assessQualityCandidate(inputs);
  assert.equal(decision.hard_gates.quality_thresholds.status, "failed");
  assert.equal(decision.hard_gates.quality_evidence.status, "inconclusive");
  assert.equal(decision.decision, "inconclusive");
});

test("multiple targets are independent and one failing target rejects", () => {
  const strict = structuredClone(policy());
  strict.targets[1].thresholds.hidden_pass_rate = { minimum_candidate: 1, minimum_delta: 0 };
  const inputs = completeInputs({
    policyOverride: strict,
    resultOverrides: (role, scenario) => role === "candidate" && scenario.scenario_id === "target-b"
      ? { hiddenStatuses: ["passed", "failed"] }
      : {},
  });
  const decision = assessQualityCandidate(inputs);
  assert.equal(decision.decision, "rejected");
  assert.equal(decision.per_target_metrics.find((entry) => entry.target_id === "target-family-a").status, "passed");
  const failed = decision.per_target_metrics.find((entry) => entry.target_id === "target-family-b");
  assert.equal(failed.status, "failed");
  assert(failed.reason_codes.includes("QUALITY_TARGET_HIDDEN_PASS_RATE_BELOW_MINIMUM"));
});

test("protected failure-family and canary regressions reject", () => {
  const inputs = completeInputs({
    resultOverrides: (role, scenario) => role === "candidate" && scenario.scenario_id === "protected-c"
      ? { hiddenStatuses: ["failed"] }
      : {},
  });
  const decision = assessQualityCandidate(inputs);
  assert.equal(decision.decision, "rejected");
  assert.equal(decision.hard_gates.protected_failure_families.status, "failed");
  assert.equal(decision.hard_gates.canary_regressions.status, "failed");
});

test("visible, hidden, task, and defect target metrics use independent thresholds", () => {
  const strict = structuredClone(policy());
  strict.targets[0].thresholds = {
    task_success_rate: { minimum_candidate: 0, minimum_delta: -1 },
    visible_pass_rate: { minimum_candidate: 0, minimum_delta: -1 },
    hidden_pass_rate: { minimum_candidate: 1, minimum_delta: 0 },
    defect_escape_rate: { maximum_candidate: 1, maximum_delta: 1 },
  };
  const inputs = completeInputs({
    policyOverride: strict,
    resultOverrides: (role, scenario) => role === "candidate" && scenario.scenario_id === "target-a"
      ? { hiddenStatuses: ["passed", "failed"] }
      : {},
  });
  const metric = assessQualityCandidate(inputs).per_target_metrics.find((entry) => entry.target_id === "target-family-a");
  assert.equal(metric.status, "failed");
  assert.deepEqual(metric.reason_codes, [
    "QUALITY_TARGET_HIDDEN_PASS_RATE_BELOW_MINIMUM",
    "QUALITY_TARGET_HIDDEN_PASS_RATE_DELTA_BELOW_MINIMUM",
  ]);
});

test("fixture runtime evidence never counts as installed", () => {
  const inputs = completeInputs({
    runtimeFactory: (role, binding) => runtimeEvidence(role, binding, { evidenceKind: "fixture_parser" }),
  });
  const decision = assessQualityCandidate(inputs);
  assert.equal(decision.decision, "inconclusive");
  assert.equal(decision.hard_gates.runtime_model_evidence.status, "inconclusive");
  assert(decision.missing_evidence.includes("QUALITY_RUNTIME_CANDIDATE_INSTALLED_EVIDENCE_REQUIRED"));
});

test("complete installed runtime model mismatch rejects", () => {
  const inputs = completeInputs({
    runtimeFactory: (role, binding) => runtimeEvidence(role, binding, role === "candidate"
      ? { effectiveModel: "openai/gpt-5.6-terra" }
      : {}),
  });
  const decision = assessQualityCandidate(inputs);
  assert.equal(decision.decision, "rejected");
  assert.equal(decision.hard_gates.runtime_model_evidence.status, "failed");
  assert(decision.reason_codes.includes("QUALITY_RUNTIME_CANDIDATE_IDENTITY_MISMATCH"));
});

test("runtime hard gate binds catalog identity, required capabilities, and truthful completeness", () => {
  const staleCatalog = completeInputs({
    runtimeFactory: (role, binding) => {
      const body = structuredClone(runtimeEvidence(role, binding));
      delete body.content_fingerprint;
      body.catalog_fingerprint = fingerprint({ stale: binding.catalog_fingerprint });
      return sealRuntimeModelEvidence(body);
    },
  });
  const staleDecision = assessQualityCandidate(staleCatalog);
  assert.equal(staleDecision.decision, "rejected");
  assert.equal(staleDecision.hard_gates.runtime_model_evidence.status, "failed");
  assert(staleDecision.reason_codes.includes("QUALITY_RUNTIME_CANDIDATE_IDENTITY_MISMATCH"));

  const missingCapability = completeInputs();
  missingCapability.canonicalExperimentBindings = structuredClone(canonicalExperimentBindings);
  missingCapability.canonicalExperimentBindings[0].candidate.required_capability_ids = ["reasoning_effort_xhigh"];
  missingCapability.policy = structuredClone(missingCapability.policy);
  missingCapability.policy.profile_requirements.pair_universe_fingerprint = qualityAcceptancePairUniverseFingerprint(
    missingCapability.canonicalExperimentBindings,
  );
  const capabilityDecision = assessQualityCandidate(missingCapability);
  assert.equal(capabilityDecision.decision, "rejected");
  assert(capabilityDecision.reason_codes.includes("QUALITY_RUNTIME_CANDIDATE_CAPABILITY_MISSING"));

  const forged = structuredClone(runtimeEvidence("candidate"));
  delete forged.content_fingerprint;
  forged.option_results[0] = { ...forged.option_results[0], status: "absent", effective_value: null };
  forged.complete = true;
  expectCode(() => validateRuntimeModelEvidence(sealRuntimeModelEvidence(forged)), "RUNTIME_MODEL_COMPLETENESS");
});

test("policy rejects a caller-lowered comparison universe", () => {
  const inputs = completeInputs();
  inputs.canonicalExperimentBindings = canonicalExperimentBindings.filter((entry) => entry.variant_id === "same-low");
  expectCode(() => assessQualityCandidate(inputs), "QUALITY_ACCEPTANCE_PAIR_UNIVERSE_POLICY");
});

test("policy rejects binding substitution even when all comparison IDs are preserved", () => {
  const inputs = completeInputs();
  inputs.canonicalExperimentBindings = structuredClone(canonicalExperimentBindings);
  inputs.canonicalExperimentBindings[0].candidate.model_id = "openai/gpt-5.6-terra";
  expectCode(() => assessQualityCandidate(inputs), "QUALITY_ACCEPTANCE_PAIR_UNIVERSE_POLICY");
});

test("unavailable token evidence is inconclusive when mandatory", () => {
  const tokenPolicy = structuredClone(policy());
  tokenPolicy.token_ceiling = { maximum_ratio: 2, maximum_candidate_total: 10000 };
  const inputs = completeInputs({
    policyOverride: tokenPolicy,
    resultOverrides: (role, scenario) => role === "candidate" && scenario.scenario_id === "target-a"
      ? { tokenAvailable: false }
      : {},
  });
  const decision = assessQualityCandidate(inputs);
  assert.equal(decision.decision, "inconclusive");
  assert.equal(decision.hard_gates.token_ceiling.status, "inconclusive");
  assert(decision.missing_evidence.includes("QUALITY_TOKEN_EVIDENCE_UNAVAILABLE"));
});

test("token ceiling is an independent hard gate", () => {
  const tokenPolicy = structuredClone(policy());
  tokenPolicy.token_ceiling = { maximum_ratio: 1.1, maximum_candidate_total: 400 };
  const inputs = completeInputs({
    policyOverride: tokenPolicy,
    resultOverrides: (role) => role === "candidate" ? { tokenTotal: 200 } : { tokenTotal: 100 },
  });
  const decision = assessQualityCandidate(inputs);
  assert.equal(decision.decision, "rejected");
  assert.equal(decision.hard_gates.token_ceiling.status, "failed");
  assert(decision.reason_codes.includes("QUALITY_TOKEN_CEILING_EXCEEDED"));
});

test("forged accepted decisions fail fingerprint and hard-gate consistency", () => {
  const inputs = completeInputs({
    resultOverrides: (role, scenario) => role === "candidate" && scenario.scenario_id === "target-a"
      ? { quality: { invariant_violations: 1 } }
      : {},
  });
  const decision = assessQualityCandidate(inputs);
  assert.equal(decision.decision, "rejected");
  const forged = structuredClone(decision);
  forged.decision = "accepted";
  expectCode(() => validateQualityAcceptanceDecision(forged), "QUALITY_ACCEPTANCE_DECISION_FINGERPRINT");
  forged.content_fingerprint = qualityAcceptanceDecisionFingerprint(forged);
  expectCode(() => validateQualityAcceptanceDecision(forged), "QUALITY_ACCEPTANCE_DECISION_CONSISTENCY");
});

test("canonical object order yields stable report, policy, outcome, and decision fingerprints", () => {
  const inputs = completeInputs();
  const decision = assessQualityCandidate(inputs);
  const reversedReport = Object.fromEntries(Object.entries(inputs.reports[0]).reverse());
  const reversedPolicy = Object.fromEntries(Object.entries(inputs.policy).reverse());
  const outcome = inputs.reports[0].results[0].quality_outcomes;
  const reversedOutcome = Object.fromEntries(Object.entries(outcome).reverse());
  assert.equal(qualityLiveReportFingerprint(inputs.reports[0]), qualityLiveReportFingerprint(reversedReport));
  assert.equal(qualityAcceptancePolicyFingerprint(inputs.policy), qualityAcceptancePolicyFingerprint(reversedPolicy));
  assert.equal(qualityOutcomesFingerprint(outcome), qualityOutcomesFingerprint(reversedOutcome));
  assert.equal(decision.content_fingerprint, qualityAcceptanceDecisionFingerprint(decision));
});

test("orphan canonical scenario bindings are rejected", () => {
  const inputs = completeInputs();
  const orphan = structuredClone(inputs.reports[0]);
  const target = orphan.results[0];
  target.scenario_id = "unknown-scenario";
  target.quality_outcomes.scenario_id = "unknown-scenario";
  target.quality_outcomes.fingerprint = qualityOutcomesFingerprint(target.quality_outcomes);
  target.quality_bundle_fingerprint = qualityBundleFingerprint(target.quality_attestation, target.quality_outcomes);
  inputs.reports = [orphan];
  expectCode(() => assessQualityCandidate(inputs), "QUALITY_ACCEPTANCE_ORPHAN_RESULT");
});

let failed = 0;
for (const { name, run } of tests) {
  try {
    await run();
    process.stdout.write(`ok - ${name}\n`);
  } catch (error) {
    failed += 1;
    process.stderr.write(`not ok - ${name}\n${error.stack ?? error}\n`);
  }
}

if (failed > 0) {
  process.stderr.write(`${failed}/${tests.length} quality acceptance checks failed\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`quality acceptance checks passed (${tests.length})\n`);
}
