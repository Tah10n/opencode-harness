import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadSyntheticContracts } from "../lib/benchmark/contracts.mjs";
import { fingerprint } from "../lib/feedback/contracts.mjs";
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

function passedOutcome() {
  return { status: "passed", passed: true, violations: [] };
}

function failedOutcome(violation) {
  return { status: "failed", passed: false, violations: [violation] };
}

function runResult({
  profileId,
  profileFingerprint,
  familyId,
  repetition,
  success,
  role,
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
    adapter_completed_correctly: true,
    agent_reported_success: true,
    termination_acceptable: true,
    visible_check: passedOutcome(),
    hidden_check: hiddenCheck,
    workspace_policy: passedOutcome(),
    trace_policy: passedOutcome(),
    teardown: passedOutcome(),
    cleanup: passedOutcome(),
    hidden_safety_failed: !success,
    evidence_complete: true,
    whole_task_success: success,
    defect_escape_v2: !success,
    fingerprints: {
      adapter: fp("adapter"),
      initial_workspace: fp(`initial-${familyId}-${repetition}`),
      final_workspace: fp(`final-${suffix}`),
      trace: fp(`trace-${suffix}`),
    },
    metrics: {
      tool_call_count: role === "baseline" ? 2 : 3,
      subagent_call_count: 0,
      context_read_count: null,
      permission_request_count: null,
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
}) {
  const suite = contracts.suites.find((entry) => entry.id === suiteId);
  assert(suite);
  const familyById = new Map(contracts.families.map((entry) => [entry.id, entry]));
  const baselineFingerprint = fp("profile-plain");
  const candidateFingerprint = fp("profile-instrumented");
  const execution = {
    provider: "fixture",
    model: "fixture/model",
    variant: null,
    timeout_ms: 60_000,
    limits_fingerprint: fp("limits"),
    adapter_protocol_version: 2,
    model_tool_availability: {
      opencode: "available",
      model: "available",
      cost: "unavailable",
    },
  };
  const pairs = [];
  for (const [familyIndex, familyId] of suite.family_ids.entries()) {
    const family = familyById.get(familyId);
    assert(family);
    for (let repetition = 1; repetition <= suite.repetitions; repetition += 1) {
      const generatedFixtureFingerprint = fp(`${suiteId}-${familyId}-${repetition}`);
      const identity = {
        family_id: familyId,
        category: family.category,
        risk: family.risk,
        generated_fixture_fingerprint: generatedFixtureFingerprint,
        repetition,
      };
      const pattern = successPattern(mode, familyIndex, repetition);
      pairs.push({
        pair_id: fingerprint({
          schema: "synthetic-pair-identity-v1",
          family_id: familyId,
          generated_fixture_fingerprint: generatedFixtureFingerprint,
          repetition,
        }),
        identity,
        order: (familyIndex + repetition) % 2 === 0
          ? ["plain", "instrumented"]
          : ["instrumented", "plain"],
        binding: {
          public_fixture_fingerprint: fp(`public-${familyId}-${repetition}`),
          hidden_fixture_fingerprint: fp(`hidden-${familyId}-${repetition}`),
          effective_public_input_fingerprint: fp(`input-${familyId}-${repetition}`),
          initial_public_manifest_fingerprint: fp(`manifest-${familyId}-${repetition}`),
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
        }),
        candidate: runResult({
          profileId: "instrumented",
          profileFingerprint: candidateFingerprint,
          familyId,
          repetition,
          success: pattern.candidate,
          role: "candidate",
        }),
      });
    }
  }
  return {
    schema_version: 2,
    report_kind: "synthetic-paired-run",
    run_id: `statistics-${suiteId}-${mode}`,
    generation_id: "generation-statistics-self-test",
    created_at: "2026-01-01T00:00:00.000Z",
    suite: {
      id: suiteId,
      manifest_fingerprint: contracts.fingerprints.suites,
      template_set_fingerprint: fp("templates"),
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

  const betterReport = createStatisticsFixtureReport(contracts, { mode: "better" });
  const better = analyzeSyntheticRunReport({
    report: betterReport,
    policy: contracts.comparison_policy,
  });
  const betterReplay = analyzeSyntheticRunReport({
    report: structuredClone(betterReport),
    policy: structuredClone(contracts.comparison_policy),
  });
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
  const metadataOnlyReplay = analyzeSyntheticRunReport({
    report: metadataOnlyReport,
    policy: contracts.comparison_policy,
  });
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
  assert.equal(countMetricById(better, "duration_ms").delta, 2);
  assert.equal(countMetricById(better, "cost_usd").availability, "unavailable");
  assert.equal(better.pareto.cost_overhead, null);
  assert.equal(metricById(better, "incomplete_evidence").pair_scope, "reported_pairs");
  assert.equal(metricById(better, "incomplete_evidence").candidate_rate, 0);

  const worse = analyzeSyntheticRunReport({
    report: createStatisticsFixtureReport(contracts, { mode: "worse" }),
    policy: contracts.comparison_policy,
  });
  assert.equal(worse.verdict.status, "candidate_worse");
  assert(worse.primary.bootstrap.upper < 0);
  assert.equal(worse.primary.paired_outcomes.baseline_only, 12);
  assert.equal(worse.pareto.scope_safety_regressions.new_canary_safety_regressions, 12);

  const inconclusive = analyzeSyntheticRunReport({
    report: createStatisticsFixtureReport(contracts, { mode: "inconclusive" }),
    policy: contracts.comparison_policy,
  });
  assert.equal(inconclusive.verdict.status, "inconclusive");
  assert.equal(inconclusive.primary.mcnemar.status, "insufficient_discordance");
  assert.equal(inconclusive.sample.discordant_pairs, 8);

  const noClear = analyzeSyntheticRunReport({
    report: createStatisticsFixtureReport(contracts, { mode: "balanced" }),
    policy: contracts.comparison_policy,
  });
  assert.equal(noClear.verdict.status, "no_clear_difference");
  assert.equal(noClear.primary.mcnemar.status, "computed");
  assert.equal(noClear.primary.mcnemar.p_value, 1);
  assert.equal(noClear.primary.delta, 0);

  const insufficient = analyzeSyntheticRunReport({
    report: createStatisticsFixtureReport(contracts, { mode: "better", suiteId: "smoke" }),
    policy: contracts.comparison_policy,
  });
  assert.equal(insufficient.verdict.status, "insufficient_sample");
  assert.equal(insufficient.primary.bootstrap.status, "insufficient_sample");
  assert.equal(insufficient.primary.bootstrap.lower, null);
  assert(insufficient.residual_caveats.includes("smoke-not-eligible-for-candidate-better"));

  const stalePolicy = createStatisticsFixtureReport(contracts, { mode: "better" });
  stalePolicy.suite.comparison_policy_fingerprint = fp("stale-policy");
  assert.throws(
    () => analyzeSyntheticRunReport({
      report: stalePolicy,
      policy: contracts.comparison_policy,
    }),
    (error) => error?.code === "SYNTHETIC_COMPARISON_POLICY",
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
