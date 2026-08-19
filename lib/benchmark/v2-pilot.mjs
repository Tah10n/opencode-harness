import { fingerprintProfileValue } from "../profile-v3.mjs";

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/u;

export class BenchmarkV2PilotError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "BenchmarkV2PilotError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new BenchmarkV2PilotError(code, message);
}

function exactKeys(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    fail("BENCHMARK_V2_PILOT_SCHEMA", `${label} has unexpected fields`);
  }
}

export function validateBenchmarkV2PilotContract(contract) {
  exactKeys(contract, [
    "schema_version", "contract_id", "status", "run_after", "promotion_role",
    "minimum_task_count", "minimum_independent_repository_count", "task_origin", "required_disjoint_from", "comparison",
    "binding_parity", "direction_guardrail", "new_critical_regressions_maximum",
    "runtime_failure_rate_maximum", "installation_materialization_pass_required",
    "compatible_license_required", "raw_model_text_persistence", "reference_solution_visibility",
    "compatible_license_allowlist",
  ], "pilot contract");
  if (contract.schema_version !== 2 || contract.contract_id !== "benchmark-v2-real-repository-pilot"
    || contract.status !== "preregistered-pre-execution"
    || contract.run_after !== "positive-synthetic-holdout-promotion-gate"
    || contract.promotion_role !== "external-validity-only" || contract.minimum_task_count !== 12
    || contract.minimum_independent_repository_count !== 3
    || contract.task_origin !== "new-real-repository-tasks"
    || JSON.stringify(contract.required_disjoint_from) !== JSON.stringify(["development", "validation", "holdout"])
    || contract.comparison !== "paired-plain-vs-frozen-final-candidate"
    || JSON.stringify(contract.binding_parity) !== JSON.stringify([
      "model", "provider", "variant", "timeout_ms", "fixture", "seed", "arm_ordering_policy",
    ])
    || contract.direction_guardrail !== "pilot-paired-delta-must-be-nonnegative"
    || contract.new_critical_regressions_maximum !== 0
    || contract.runtime_failure_rate_maximum !== 0.2
    || contract.installation_materialization_pass_required !== true
    || contract.compatible_license_required !== true
    || JSON.stringify(contract.compatible_license_allowlist) !== JSON.stringify([
      "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC",
    ])
    || contract.raw_model_text_persistence !== "forbidden"
    || contract.reference_solution_visibility !== "runner-only-after-model-settlement") {
    fail("BENCHMARK_V2_PILOT_CONTRACT", "pilot timing, scope, binding, or guardrails drifted");
  }
  return contract;
}

function validateArm(arm, label) {
  exactKeys(arm, [
    "execution_status", "regression_free_task_success", "runtime_failure",
    "critical_finding_present", "result_fingerprint", "duration_ms",
    "tool_call_count", "model_turn_count",
  ], label);
  if (!["completed", "failed", "blocked_external_state"].includes(arm.execution_status)
    || typeof arm.regression_free_task_success !== "boolean"
    || typeof arm.runtime_failure !== "boolean"
    || typeof arm.critical_finding_present !== "boolean"
    || !SHA256.test(arm.result_fingerprint)
    || !Number.isSafeInteger(arm.duration_ms) || arm.duration_ms < 0
    || !Number.isSafeInteger(arm.tool_call_count) || arm.tool_call_count < 0
    || !Number.isSafeInteger(arm.model_turn_count) || arm.model_turn_count < 0
    || (arm.execution_status === "completed" && arm.runtime_failure)
    || (arm.execution_status !== "completed" && !arm.runtime_failure)
    || (arm.runtime_failure && arm.regression_free_task_success)) {
    fail("BENCHMARK_V2_PILOT_ARM", `${label} is contradictory or invalid`);
  }
}

function validateTask(task, index) {
  exactKeys(task, [
    "task_id", "repository_identity", "source_commit", "license_spdx",
    "license_evidence_fingerprint", "task_identity_fingerprint",
    "disjointness_evidence_fingerprint", "fixture_fingerprint",
    "installation_materialization_passed", "baseline", "candidate",
  ], `pilot task[${index}]`);
  if (!SAFE_ID.test(task.task_id) || !SHA256.test(task.repository_identity)
    || !/^[0-9a-f]{40}$/u.test(task.source_commit)
    || typeof task.license_spdx !== "string" || !/^[A-Za-z0-9.+-]{2,32}$/u.test(task.license_spdx)
    || !SHA256.test(task.license_evidence_fingerprint) || !SHA256.test(task.task_identity_fingerprint)
    || !SHA256.test(task.disjointness_evidence_fingerprint)
    || !SHA256.test(task.fixture_fingerprint)
    || typeof task.installation_materialization_passed !== "boolean") {
    fail("BENCHMARK_V2_PILOT_TASK", `pilot task[${index}] identity or provenance is invalid`);
  }
  validateArm(task.baseline, `pilot task[${index}].baseline`);
  validateArm(task.candidate, `pilot task[${index}].candidate`);
  const expectedIdentity = fingerprintProfileValue({
    repository_identity: task.repository_identity,
    source_commit: task.source_commit,
    fixture_fingerprint: task.fixture_fingerprint,
  });
  if (task.task_identity_fingerprint !== expectedIdentity) {
    fail("BENCHMARK_V2_PILOT_TASK", `pilot task[${index}] task identity is not canonical`);
  }
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ratio(candidate, baseline) {
  return candidate / Math.max(1, baseline);
}

export function evaluateBenchmarkV2Pilot({
  contract,
  syntheticHoldoutDecision,
  frozenCandidateFingerprint,
  bindingsFingerprint,
  excludedTaskIdentityFingerprints,
  tasks,
} = {}) {
  validateBenchmarkV2PilotContract(contract);
  if (syntheticHoldoutDecision !== "promote" || !SHA256.test(frozenCandidateFingerprint)
    || !SHA256.test(bindingsFingerprint) || !Array.isArray(tasks)
    || tasks.length < contract.minimum_task_count) {
    fail("BENCHMARK_V2_PILOT_PRECONDITION", "pilot requires a positive frozen synthetic holdout and at least 12 tasks");
  }
  if (!Array.isArray(excludedTaskIdentityFingerprints) || excludedTaskIdentityFingerprints.length < 156
    || excludedTaskIdentityFingerprints.some((entry) => !SHA256.test(entry))
    || new Set(excludedTaskIdentityFingerprints).size !== excludedTaskIdentityFingerprints.length) {
    fail("BENCHMARK_V2_PILOT_DISJOINT", "complete dev, validation, and holdout task identity universe is required");
  }
  tasks.forEach(validateTask);
  const ids = tasks.map((task) => task.task_id);
  const repositories = tasks.map((task) => task.repository_identity);
  const commits = tasks.map((task) => `${task.repository_identity}:${task.source_commit}`);
  const fixtures = tasks.map((task) => task.fixture_fingerprint);
  const taskIdentities = tasks.map((task) => task.task_identity_fingerprint);
  const excludedIdentities = new Set(excludedTaskIdentityFingerprints);
  if (new Set(ids).size !== ids.length || new Set(commits).size !== commits.length
    || new Set(fixtures).size !== fixtures.length || new Set(taskIdentities).size !== taskIdentities.length) {
    fail("BENCHMARK_V2_PILOT_DUPLICATE", "pilot task, commit, fixture, or disjointness identities overlap");
  }
  if (taskIdentities.some((entry) => excludedIdentities.has(entry))) {
    fail("BENCHMARK_V2_PILOT_DISJOINT", "pilot overlaps development, validation, or holdout task identity");
  }
  if (tasks.some((task) => !contract.compatible_license_allowlist.includes(task.license_spdx))) {
    fail("BENCHMARK_V2_PILOT_LICENSE", "pilot contains a task outside the preregistered compatible-license allowlist");
  }
  const baselineRate = mean(tasks.map((task) => Number(task.baseline.regression_free_task_success)));
  const candidateRate = mean(tasks.map((task) => Number(task.candidate.regression_free_task_success)));
  const delta = candidateRate - baselineRate;
  const runtimeFailures = tasks.reduce((sum, task) => sum
    + Number(task.baseline.runtime_failure) + Number(task.candidate.runtime_failure), 0);
  const runtimeFailureRate = runtimeFailures / (tasks.length * 2);
  const newCriticalRegressions = tasks.filter((task) => !task.baseline.critical_finding_present
    && task.candidate.critical_finding_present).length;
  const guardrails = Object.freeze({
    direction: delta >= 0,
    critical: newCriticalRegressions <= contract.new_critical_regressions_maximum,
    runtime: runtimeFailureRate <= contract.runtime_failure_rate_maximum,
    installation_materialization: tasks.every((task) => task.installation_materialization_passed),
    unique_repository_count: new Set(repositories).size >= contract.minimum_independent_repository_count,
  });
  const source = {
    schema_version: 2,
    report_kind: "benchmark-v2-real-repository-pilot-summary",
    evidence_role: "external-validity-only-not-promotion",
    synthetic_holdout_decision: syntheticHoldoutDecision,
    frozen_candidate_fingerprint: frozenCandidateFingerprint,
    bindings_fingerprint: bindingsFingerprint,
    excluded_task_universe_fingerprint: fingerprintProfileValue([...excludedTaskIdentityFingerprints].sort()),
    task_count: tasks.length,
    independent_repository_count: new Set(repositories).size,
    baseline_regression_free_task_success: baselineRate,
    candidate_regression_free_task_success: candidateRate,
    paired_delta: delta,
    new_critical_regressions: newCriticalRegressions,
    runtime_failure_rate: runtimeFailureRate,
    overhead: Object.freeze({
      duration_mean_ratio: ratio(
        mean(tasks.map((task) => task.candidate.duration_ms)),
        mean(tasks.map((task) => task.baseline.duration_ms)),
      ),
      tool_call_mean_ratio: ratio(
        mean(tasks.map((task) => task.candidate.tool_call_count)),
        mean(tasks.map((task) => task.baseline.tool_call_count)),
      ),
      model_turn_mean_ratio: ratio(
        mean(tasks.map((task) => task.candidate.model_turn_count)),
        mean(tasks.map((task) => task.baseline.model_turn_count)),
      ),
    }),
    guardrails,
    decision: Object.values(guardrails).every(Boolean)
      ? "supports-external-validity" : "contradicts-or-inconclusive",
    task_evidence_fingerprints: Object.freeze(tasks.map((task) => fingerprintProfileValue(task))),
  };
  return Object.freeze({ ...source, report_fingerprint: fingerprintProfileValue(source) });
}
