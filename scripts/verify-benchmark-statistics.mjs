import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadSyntheticContracts } from "../lib/benchmark/contracts.mjs";
import { fingerprint } from "../lib/feedback/contracts.mjs";
import {
  loadSyntheticTemplateSet,
  renderSyntheticInstance,
} from "../lib/benchmark/renderer.mjs";
import {
  counterbalancedProfileSchedule,
  syntheticEffectivePublicInputFingerprint,
} from "../lib/benchmark/runner.mjs";
import {
  cleanupSyntheticProfile,
  materializeSyntheticProfile,
} from "../lib/benchmark/profiles.mjs";
import {
  SYNTHETIC_OPENCODE_ADAPTER_VERSION,
  syntheticOpenCodeAdapterFingerprint,
} from "../lib/benchmark/opencode-adapter.mjs";
import {
  analyzeSyntheticRunReport,
  exactTwoSidedMcNemar,
  macroFamilyPairedRate,
  validateSyntheticComparisonReport,
} from "../lib/benchmark/statistics.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fp(value) {
  return fingerprint({ fixture: value });
}

function modelFingerprint(execution) {
  return fingerprint({
    schema: "synthetic-model-binding-v1",
    provider: execution.provider,
    model: execution.model,
    variant: execution.variant,
  });
}

function canonicalProfileFingerprint(sourceRoot, profileId) {
  const materialized = materializeSyntheticProfile({ sourceRoot, profileId });
  try {
    return materialized.profileFingerprint;
  } finally {
    cleanupSyntheticProfile(materialized);
  }
}

function passedOutcome() {
  return { status: "passed", passed: true, violations: [] };
}

function failedOutcome(violation) {
  return { status: "failed", passed: false, violations: [violation] };
}

function reviewMatchAudit(check, success) {
  return {
    strategy: "semantic-concept-one-to-one-v2",
    candidate_count: 1,
    oracle_count: check.expected_findings.length,
    matched_count: success ? check.expected_findings.length : 0,
    severity_calibrated_count: success ? check.expected_findings.length : 0,
    location_calibrated_count: success ? check.expected_findings.length : 0,
    oracle_fingerprint: fingerprint(check.expected_findings),
  };
}

function auditEvidence(profileId, suffix, instance, success) {
  const changedPaths = instance.task_scope.mode === "edit"
    ? [...instance.task_scope.allowed_changed_paths]
    : [];
  const scope = {
    mode: instance.task_scope.mode,
    allowed_changed_paths: [...instance.task_scope.allowed_changed_paths],
    max_changed_files: instance.task_scope.max_changed_files,
    observation_status: "available",
    changed_allowed_paths: changedPaths,
    changed_path_count: changedPaths.length,
    changed_paths_fingerprint: fingerprint({ schema: "synthetic-changed-paths-v1", paths: changedPaths }),
    unexpected_path_count: 0,
    unexpected_path_ids: [],
    unexpected_path_ids_complete: true,
    forbidden_path_count: 0,
    forbidden_path_ids: [],
    forbidden_path_ids_complete: true,
    violation_codes: [],
  };
  const instrumented = profileId === "instrumented";
  const control = {
    classification: instrumented ? "attested" : "absent",
    session_count: instrumented ? 1 : 0,
    registration_count: instrumented ? 1 : 0,
    registration_only_count: 0,
    owner_session_count: instrumented ? 1 : 0,
    child_session_count: 0,
    attested_owner_count: instrumented ? 1 : 0,
    control_state_fingerprint: instrumented ? fp(`control-${suffix}`) : null,
    violation_codes: [],
  };
  const reviewMatch = instance.visible_check.kind === "structured-review"
    ? {
        visible: reviewMatchAudit(instance.visible_check, true),
        hidden: reviewMatchAudit(instance.hidden_check, success),
      }
    : null;
  const source = { scope, control, review_match: reviewMatch };
  return { ...source, fingerprint: fingerprint(source) };
}

function runResult({
  profileId,
  profileFingerprint,
  familyId,
  repetition,
  success,
  role,
  instance,
}) {
  const suffix = `${familyId}-${repetition}-${role}`;
  const safeSuffix = fp(suffix).slice(7, 23);
  const reviewOnly = familyId === "review-read-only";
  const hiddenCheck = success ? passedOutcome() : failedOutcome("hidden_failure");
  return {
    profile_id: profileId,
    profile_fingerprint: profileFingerprint,
    operational_run_id: `op-${role}-${repetition}-${safeSuffix}`,
    execution_status: "completed",
    termination_reason: success ? "verified" : "verification_failed",
    reason: null,
    cli_version: "1.17.0",
    adapter_evidence_observed: true,
    adapter_completed_correctly: true,
    agent_reported_success: true,
    termination_acceptable: true,
    visible_check: passedOutcome(),
    hidden_check: hiddenCheck,
    workspace_policy: passedOutcome(),
    common_safety: passedOutcome(),
    treatment_compliance: passedOutcome(),
    trace_policy: passedOutcome(),
    teardown: passedOutcome(),
    cleanup: passedOutcome(),
    hidden_safety_failed: !success,
    task_evidence_complete: true,
    task_correct: success,
    evidence_complete: true,
    whole_task_success: success,
    defect_escape_v2: !success,
    audit_evidence: auditEvidence(profileId, suffix, instance, success),
    fingerprints: {
      adapter: syntheticOpenCodeAdapterFingerprint(),
      initial_workspace: fp(`initial-${familyId}-${repetition}`),
      final_workspace: fp(`final-${suffix}`),
      trace: fp(`trace-${suffix}`),
    },
    metrics: {
      tool_call_count: role === "baseline" ? 2 : 3,
      subagent_call_count: 0,
      context_read_count: null,
      permission_request_count: null,
      model_turn_count: role === "baseline" ? 1 : 2,
      continuation_turn_count: role === "baseline" ? 0 : 1,
      dangerous_command_count: 0,
      network_action_count: 0,
      hidden_access_attempt_count: 0,
      workspace_mutation_count: reviewOnly ? 0 : 1,
      fix_command_count: reviewOnly ? 0 : 1,
      repository_instruction_action_count: 0,
      secret_write_count: 0,
      duration_ms: role === "baseline" ? 10 : 12,
      cost_usd: null,
      availability: {
        context_reads: "unavailable",
        permission_requests: "unavailable",
        network_actions: "available",
        cost: "unavailable",
      },
    },
    operational_trace_id: `trace-${role}-${repetition}-${safeSuffix}`,
  };
}

function successPattern(mode, familyIndex, repetition) {
  if (mode === "better") {
    return {
      baseline: repetition !== 1,
      candidate: true,
    };
  }
  if (mode === "worse") {
    return {
      baseline: true,
      candidate: repetition !== 1,
    };
  }
  if (mode === "inconclusive") {
    return {
      baseline: !(familyIndex < 8 && repetition === 1),
      candidate: true,
    };
  }
  if (mode === "balanced") {
    if (familyIndex < 5 && repetition === 1) return { baseline: false, candidate: true };
    if (familyIndex >= 5 && familyIndex < 10 && repetition === 1) return { baseline: true, candidate: false };
    return { baseline: true, candidate: true };
  }
  throw new Error(`unknown fixture mode ${mode}`);
}

export function createStatisticsFixtureReport(contracts, {
  mode,
  suiteId = "standard",
  sourceRoot = defaultRoot,
}) {
  const suite = contracts.suites.find((entry) => entry.id === suiteId);
  assert(suite);
  const templateSet = loadSyntheticTemplateSet(sourceRoot, contracts);
  const familyById = new Map(contracts.families.map((entry) => [entry.id, entry]));
  const baselineFingerprint = canonicalProfileFingerprint(sourceRoot, "plain");
  const candidateFingerprint = canonicalProfileFingerprint(sourceRoot, "instrumented");
  const execution = {
    provider: "fixture",
    model: "fixture/model",
    variant: null,
    timeout_ms: 60_000,
    limits_fingerprint: fp("limits"),
    adapter_protocol_version: SYNTHETIC_OPENCODE_ADAPTER_VERSION,
    model_tool_availability: {
      opencode: "available",
      model: "available",
      cost: "unavailable",
    },
  };
  const instances = suite.family_ids.flatMap((familyId) => (
    Array.from({ length: suite.repetitions }, (_, index) => renderSyntheticInstance({
      contracts,
      templateSet,
      familyId,
      seed: "statistics-self-test",
      repetition: index + 1,
    }))
  ));
  const orderByPairId = new Map(counterbalancedProfileSchedule({
    seed: "statistics-self-test",
    suiteId,
    instances,
    baselineProfileId: "plain",
    candidateProfileId: "instrumented",
  }).map((entry) => [entry.pair_id, entry.order]));
  const pairs = [];
  for (const instance of instances) {
    const familyId = instance.family_id;
    const familyIndex = suite.family_ids.indexOf(familyId);
    const family = familyById.get(familyId);
    assert(family);
    const repetition = instance.repetition;
    const generatedFixtureFingerprint = instance.generated_fixture_fingerprint;
    const identity = {
      family_id: familyId,
      category: family.category,
      risk: family.risk,
      source_class: instance.source_class,
      generated_fixture_fingerprint: generatedFixtureFingerprint,
      repetition,
    };
    const pattern = successPattern(mode, familyIndex, repetition);
    const currentPairId = fingerprint({
      schema: "synthetic-pair-identity-v1",
      family_id: familyId,
      generated_fixture_fingerprint: generatedFixtureFingerprint,
      repetition,
    });
    pairs.push({
      pair_id: currentPairId,
      identity,
      order: [...orderByPairId.get(currentPairId)],
      binding: {
        public_fixture_fingerprint: instance.public_fixture_fingerprint,
        hidden_fixture_fingerprint: instance.hidden_fixture_fingerprint,
        task_scope_fingerprint: fingerprint(instance.task_scope),
        effective_public_input_fingerprint: syntheticEffectivePublicInputFingerprint(instance),
        initial_public_manifest_fingerprint: fp(`initial-${familyId}-${repetition}`),
        model_fingerprint: modelFingerprint(execution),
        timeout_ms: execution.timeout_ms,
        limits_fingerprint: execution.limits_fingerprint,
        adapter_protocol_version: execution.adapter_protocol_version,
      },
      complete: true,
      incomplete_reasons: [],
      baseline: runResult({
        profileId: "plain",
        profileFingerprint: baselineFingerprint,
        familyId,
        repetition,
        success: pattern.baseline,
        role: "baseline",
        instance,
      }),
      candidate: runResult({
        profileId: "instrumented",
        profileFingerprint: candidateFingerprint,
        familyId,
        repetition,
        success: pattern.candidate,
        role: "candidate",
        instance,
      }),
    });
  }
  return {
    schema_version: 3,
    report_kind: "synthetic-paired-run",
    run_id: `statistics-${suiteId}-${mode}`,
    generation_id: "generation-statistics-self-test",
    created_at: "2026-01-01T00:00:00.000Z",
    suite: {
      id: suiteId,
      manifest_fingerprint: contracts.fingerprints.suites,
      template_set_fingerprint: fingerprint(templateSet),
      comparison_policy_fingerprint: contracts.fingerprints.comparison_policy,
      profile_inventory_fingerprint: contracts.fingerprints.inventory,
      seed: "statistics-self-test",
      repetitions: suite.repetitions,
      declared_pair_count: pairs.length,
    },
    execution,
    profiles: {
      baseline: { id: "plain", fingerprint: baselineFingerprint },
      candidate: { id: "instrumented", fingerprint: candidateFingerprint },
    },
    complete: true,
    incomplete_reasons: [],
    pair_count: pairs.length,
    pairs,
    residual_caveats: [
      "context-reads-unavailable",
      "cost-unavailable",
      "permission-requests-unavailable",
    ],
  };
}

function metricById(comparison, id) {
  const metric = comparison.rates.find((entry) => entry.id === id);
  assert(metric);
  return metric;
}

function countMetricById(comparison, id) {
  const metric = comparison.count_metrics.find((entry) => entry.id === id);
  assert(metric);
  return metric;
}

export function verifyBenchmarkStatistics({ root = defaultRoot } = {}) {
  const contracts = loadSyntheticContracts(root);
  const fixtureReport = (options) => createStatisticsFixtureReport(contracts, {
    ...options,
    sourceRoot: root,
  });
  const analyzeReport = (report, policy = contracts.comparison_policy) =>
    analyzeSyntheticRunReport({
      report,
      policy,
      contractSourceRoot: root,
    });
  const macro = macroFamilyPairedRate([
    { family_id: "large-family", baseline: false, candidate: true },
    { family_id: "large-family", baseline: false, candidate: true },
    { family_id: "large-family", baseline: false, candidate: true },
    { family_id: "small-family", baseline: true, candidate: false },
  ]);
  assert.equal(macro.baseline_rate, 0.5);
  assert.equal(macro.candidate_rate, 0.5);
  assert.equal(macro.delta, 0);
  assert.equal(exactTwoSidedMcNemar(12, 0), 0.00048828125);

  const betterReport = fixtureReport({ mode: "better" });
  assert.throws(
    () => analyzeSyntheticRunReport({
      report: betterReport,
      policy: contracts.comparison_policy,
    }),
    (error) => error?.code === "SYNTHETIC_REPORT_SOURCE_BINDING",
  );
  const better = analyzeReport(betterReport);
  const betterReplay = analyzeReport(
    structuredClone(betterReport),
    structuredClone(contracts.comparison_policy),
  );
  assert.deepEqual(betterReplay, better);
  assert.equal(validateSyntheticComparisonReport(better, {
    report: betterReport,
    policy: contracts.comparison_policy,
  }), better);
  assert.throws(
    () => validateSyntheticComparisonReport(better),
    (error) => error?.code === "SYNTHETIC_COMPARISON_SOURCE",
  );
  const unreadableWithoutSource = new Proxy({}, {
    get() {
      throw new Error("comparison must not be traversed before source validation");
    },
    ownKeys() {
      throw new Error("comparison must not be traversed before source validation");
    },
  });
  assert.throws(
    () => validateSyntheticComparisonReport(unreadableWithoutSource),
    (error) => error?.code === "SYNTHETIC_COMPARISON_SOURCE",
  );
  const metadataOnlyReport = structuredClone(betterReport);
  metadataOnlyReport.run_id = "statistics-standard-better-metadata-replay";
  metadataOnlyReport.generation_id = "generation-statistics-metadata-replay";
  metadataOnlyReport.created_at = "2026-01-02T00:00:00.000Z";
  metadataOnlyReport.pairs.reverse();
  for (const [pairIndex, pair] of metadataOnlyReport.pairs.entries()) {
    for (const role of ["baseline", "candidate"]) {
      pair[role].operational_run_id = `metadata-${role}-${pairIndex}`;
      pair[role].operational_trace_id = `metadata-trace-${role}-${pairIndex}`;
      pair[role].fingerprints.trace = fp(`metadata-trace-${role}-${pairIndex}`);
    }
  }
  const metadataOnlyReplay = analyzeReport(metadataOnlyReport);
  assert.equal(
    metadataOnlyReplay.primary.bootstrap.seed_fingerprint,
    better.primary.bootstrap.seed_fingerprint,
  );
  assert.deepEqual(
    {
      lower: metadataOnlyReplay.primary.bootstrap.lower,
      upper: metadataOnlyReplay.primary.bootstrap.upper,
      mcnemar: metadataOnlyReplay.primary.mcnemar,
      verdict: metadataOnlyReplay.verdict,
    },
    {
      lower: better.primary.bootstrap.lower,
      upper: better.primary.bootstrap.upper,
      mcnemar: better.primary.mcnemar,
      verdict: better.verdict,
    },
  );
  assert.equal(better.verdict.status, "candidate_better");
  assert.equal(better.primary.metric, "task_correct");
  assert.equal(better.sample.complete_pairs, 36);
  assert.equal(better.sample.discordant_pairs, 12);
  assert.deepEqual(better.primary.paired_outcomes, {
    both_pass: 24,
    baseline_only: 0,
    candidate_only: 12,
    both_fail: 0,
  });
  assert.equal(better.primary.bootstrap.status, "computed");
  assert.equal(better.primary.bootstrap.resamples, 10_000);
  assert(better.primary.bootstrap.lower > 0);
  assert.equal(better.primary.mcnemar.status, "computed");
  assert.equal(better.primary.mcnemar.p_value, 0.00048828125);
  assert.equal(better.primary.mcnemar.significant, true);
  assert.equal(better.guardrails.every((entry) => entry.status === "passed"), true);
  assert.equal(better.breakdowns.by_family.length, 12);
  assert(better.breakdowns.by_category.length > 1);
  assert.deepEqual(better.breakdowns.by_risk.map((entry) => entry.id), ["critical", "high", "standard"]);
  assert.deepEqual(
    better.breakdowns.by_source_class.map((entry) => [entry.id, entry.complete_pairs]),
    [["project-authored", 27], ["public-benchmark-adaptation", 9]],
  );
  assert.equal(metricById(better, "whole_task_success").candidate_rate, 1);
  assert.equal(countMetricById(better, "duration_ms").delta, 2);
  assert.equal(countMetricById(better, "model_turn_count").delta, 1);
  assert.equal(countMetricById(better, "continuation_turn_count").delta, 1);
  assert.equal(countMetricById(better, "cost_usd").availability, "unavailable");
  assert.equal(better.pareto.cost_overhead, null);
  assert.equal(metricById(better, "incomplete_evidence").pair_scope, "reported_pairs");
  assert.equal(metricById(better, "incomplete_evidence").candidate_rate, 0);

  const oracleTimeoutReport = fixtureReport({ mode: "better" });
  const oracleTimeoutResult = oracleTimeoutReport.pairs[0].candidate;
  oracleTimeoutResult.hidden_check = failedOutcome("check_timeout");
  oracleTimeoutResult.hidden_safety_failed = true;
  oracleTimeoutResult.task_correct = false;
  oracleTimeoutResult.whole_task_success = false;
  oracleTimeoutResult.defect_escape_v2 = true;
  const oracleTimeout = analyzeReport(oracleTimeoutReport);
  assert.equal(metricById(oracleTimeout, "timeout").candidate_rate, 0);
  assert.equal(metricById(oracleTimeout, "oracle_check_timeout").candidate_rate, 1 / 36);

  const treatmentDivergenceReport = fixtureReport({ mode: "better" });
  const treatmentDivergenceResult = treatmentDivergenceReport.pairs[0].candidate;
  treatmentDivergenceResult.treatment_compliance = failedOutcome("plugin_quality_lifecycle_incomplete");
  treatmentDivergenceResult.audit_evidence.control.violation_codes = [
    "plugin_quality_lifecycle_incomplete",
  ];
  treatmentDivergenceResult.audit_evidence.control.classification = "started_incomplete";
  treatmentDivergenceResult.audit_evidence.control.attested_owner_count = 0;
  treatmentDivergenceResult.audit_evidence.fingerprint = fingerprint({
    scope: treatmentDivergenceResult.audit_evidence.scope,
    control: treatmentDivergenceResult.audit_evidence.control,
    review_match: treatmentDivergenceResult.audit_evidence.review_match,
  });
  treatmentDivergenceResult.whole_task_success = false;
  const treatmentDivergence = analyzeReport(treatmentDivergenceReport);
  const wholeTaskDelta = metricById(treatmentDivergence, "whole_task_success").delta;
  assert.notEqual(
    treatmentDivergence.primary.delta,
    wholeTaskDelta,
    "fixture must distinguish task correctness from treatment-aware whole-task success",
  );
  assert.equal(
    treatmentDivergence.guardrails.find((entry) => entry.id === "whole_task_success_rate_delta").observed,
    wholeTaskDelta,
    "whole-task guardrail validation must not substitute the task_correct primary delta",
  );
  assert.equal(validateSyntheticComparisonReport(treatmentDivergence, {
    report: treatmentDivergenceReport,
    policy: contracts.comparison_policy,
  }), treatmentDivergence);

  const worse = analyzeReport(fixtureReport({ mode: "worse" }));
  assert.equal(worse.verdict.status, "candidate_worse");
  assert(worse.primary.bootstrap.upper < 0);
  assert.equal(worse.primary.paired_outcomes.baseline_only, 12);
  assert.equal(worse.pareto.scope_safety_regressions.new_canary_safety_regressions, 12);

  const inconclusive = analyzeReport(fixtureReport({ mode: "inconclusive" }));
  assert.equal(inconclusive.verdict.status, "inconclusive");
  assert.equal(inconclusive.primary.mcnemar.status, "insufficient_discordance");
  assert.equal(inconclusive.sample.discordant_pairs, 8);

  const noClear = analyzeReport(fixtureReport({ mode: "balanced" }));
  assert.equal(noClear.verdict.status, "no_clear_difference");
  assert.equal(noClear.primary.mcnemar.status, "computed");
  assert.equal(noClear.primary.mcnemar.p_value, 1);
  assert.equal(noClear.primary.delta, 0);

  const insufficient = analyzeReport(fixtureReport({
    mode: "better",
    suiteId: "smoke",
  }));
  assert.equal(insufficient.verdict.status, "insufficient_sample");
  assert.equal(insufficient.primary.bootstrap.status, "insufficient_sample");
  assert.equal(insufficient.primary.bootstrap.lower, null);
  assert(insufficient.residual_caveats.includes("smoke-not-eligible-for-candidate-better"));

  const stalePolicy = fixtureReport({ mode: "better" });
  stalePolicy.suite.comparison_policy_fingerprint = fp("stale-policy");
  assert.throws(
    () => analyzeReport(stalePolicy),
    (error) => error?.code === "SYNTHETIC_REPORT_SOURCE_BINDING",
  );
  const inconsistentOutput = structuredClone(better);
  inconsistentOutput.primary.paired_outcomes.candidate_only += 1;
  assert.throws(
    () => validateSyntheticComparisonReport(inconsistentOutput, {
      report: betterReport,
      policy: contracts.comparison_policy,
    }),
    (error) => error?.code === "SYNTHETIC_COMPARISON_OUTCOMES",
  );
  const assertTamperRejected = (mutate, code) => {
    const tampered = structuredClone(better);
    mutate(tampered);
    assert.throws(
      () => validateSyntheticComparisonReport(tampered, {
        report: betterReport,
        policy: contracts.comparison_policy,
      }),
      (error) => error?.code === code,
    );
  };
  assertTamperRejected(
    (comparison) => {
      comparison.guardrails[0].status = "failed";
    },
    "SYNTHETIC_COMPARISON_GUARDRAIL",
  );
  assertTamperRejected(
    (comparison) => {
      comparison.guardrails[0].operator = "lte";
    },
    "SYNTHETIC_COMPARISON_GUARDRAIL",
  );
  assertTamperRejected(
    (comparison) => {
      comparison.guardrails[0].threshold = 1;
    },
    "SYNTHETIC_COMPARISON_GUARDRAIL",
  );
  assertTamperRejected(
    (comparison) => {
      comparison.verdict.status = "candidate_worse";
    },
    "SYNTHETIC_COMPARISON_VERDICT",
  );
  assertTamperRejected(
    (comparison) => {
      comparison.verdict.reasons = ["forged-decision"];
    },
    "SYNTHETIC_COMPARISON_VERDICT",
  );
  assertTamperRejected(
    (comparison) => {
      comparison.pareto.quality_gain += 0.01;
    },
    "SYNTHETIC_COMPARISON_PARETO",
  );
  assertTamperRejected(
    (comparison) => {
      comparison.pareto.duration_overhead += 1;
    },
    "SYNTHETIC_COMPARISON_PARETO",
  );
  assertTamperRejected(
    (comparison) => {
      comparison.pareto.cost_overhead = 0;
    },
    "SYNTHETIC_COMPARISON_PARETO",
  );
  assertTamperRejected(
    (comparison) => {
      comparison.pareto.scope_safety_regressions.scope_violation_rate_delta = 0.01;
    },
    "SYNTHETIC_COMPARISON_PARETO",
  );
  assertTamperRejected(
    (comparison) => {
      comparison.pareto.scope_safety_regressions.review_only_mutation_rate_delta = 0.01;
    },
    "SYNTHETIC_COMPARISON_PARETO",
  );
  assertTamperRejected(
    (comparison) => {
      comparison.guardrails[2].observed = 1;
      comparison.guardrails[2].status = "failed";
      comparison.pareto.scope_safety_regressions.new_canary_safety_regressions = 1;
      comparison.verdict = {
        status: "no_clear_difference",
        reasons: [
          "directional-significance-not-established",
          "guardrail-failed",
        ],
      };
    },
    "SYNTHETIC_COMPARISON_CANONICAL",
  );
  assertTamperRejected(
    (comparison) => {
      comparison.breakdowns.by_family.push(
        ...Array.from({ length: 5 }, (_, index) => ({
          ...structuredClone(comparison.breakdowns.by_family[0]),
          id: `oversized-family-${index}`,
        })),
      );
    },
    "SYNTHETIC_COMPARISON_BREAKDOWN",
  );

  return {
    fixture_verdicts: [
      better.verdict.status,
      worse.verdict.status,
      inconclusive.verdict.status,
      noClear.verdict.status,
      insufficient.verdict.status,
    ],
    bootstrap_resamples: better.primary.bootstrap.resamples,
    rate_metrics: better.rates.length,
    count_metrics: better.count_metrics.length,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = verifyBenchmarkStatistics();
  console.log(`Synthetic benchmark statistics verified (${result.fixture_verdicts.join(", ")}; ${result.bootstrap_resamples} bootstrap resamples; ${result.rate_metrics} rate metrics; ${result.count_metrics} count metrics).`);
}
