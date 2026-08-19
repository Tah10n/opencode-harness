import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateBenchmarkV2Pilot,
  validateBenchmarkV2PilotContract,
} from "../lib/benchmark/v2-pilot.mjs";
import { fingerprintProfileValue } from "../lib/profile-v3.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(fs.readFileSync(path.join(root, "benchmarks", "v2", "pilot-contract.v2.json"), "utf8"));
assert.equal(validateBenchmarkV2PilotContract(contract), contract);
const sha = (character) => `sha256:${character.repeat(64)}`;
const task = (index, { baseline = false, candidate = true, runtime = false, critical = false } = {}) => {
  const repositoryIdentity = sha(String((index % 4) + 1));
  const sourceCommit = index.toString(16).padStart(40, "0");
  const fixtureFingerprint = sha((index + 4).toString(16).slice(-1));
  return ({
    task_id: `pilot-task-${String(index).padStart(2, "0")}`,
    repository_identity: repositoryIdentity,
    source_commit: sourceCommit,
    license_spdx: "MIT",
    license_evidence_fingerprint: sha("a"),
    task_identity_fingerprint: fingerprintProfileValue({
      repository_identity: repositoryIdentity,
      source_commit: sourceCommit,
      fixture_fingerprint: fixtureFingerprint,
    }),
    disjointness_evidence_fingerprint: sha((index + 20).toString(16).slice(-1)),
    fixture_fingerprint: fixtureFingerprint,
    installation_materialization_passed: true,
    baseline: {
      execution_status: runtime ? "failed" : "completed",
      regression_free_task_success: baseline,
      runtime_failure: runtime,
      critical_finding_present: false,
      result_fingerprint: sha("b"),
      duration_ms: 100,
      tool_call_count: 2,
      model_turn_count: 1,
    },
    candidate: {
      execution_status: "completed",
      regression_free_task_success: candidate,
      runtime_failure: false,
      critical_finding_present: critical,
      result_fingerprint: sha("c"),
      duration_ms: 150,
      tool_call_count: 3,
      model_turn_count: 2,
    },
  });
};

const tasks = Array.from({ length: 12 }, (_, index) => task(index + 1, {
  baseline: index >= 8,
  candidate: index >= 2,
}));
const excludedTaskIdentityFingerprints = Array.from({ length: 156 }, (_, index) => fingerprintProfileValue(`excluded-${index}`));
const report = evaluateBenchmarkV2Pilot({
  contract,
  syntheticHoldoutDecision: "promote",
  frozenCandidateFingerprint: sha("d"),
  bindingsFingerprint: sha("e"),
  excludedTaskIdentityFingerprints,
  tasks,
});
assert.equal(report.task_count, 12);
assert.equal(report.independent_repository_count, 4);
assert(report.paired_delta > 0);
assert.equal(report.runtime_failure_rate, 0);
assert.equal(report.new_critical_regressions, 0);
assert.equal(report.decision, "supports-external-validity");
assert.equal(report.overhead.duration_mean_ratio, 1.5);
assert.match(report.report_fingerprint, /^sha256:[0-9a-f]{64}$/u);

assert.throws(() => evaluateBenchmarkV2Pilot({
  contract,
  syntheticHoldoutDecision: "reject",
  frozenCandidateFingerprint: sha("d"),
  bindingsFingerprint: sha("e"),
  excludedTaskIdentityFingerprints,
  tasks,
}), /BENCHMARK_V2_PILOT_PRECONDITION/u);

const criticalTasks = tasks.map((entry, index) => index === 0 ? task(1, { baseline: true, candidate: true, critical: true }) : entry);
const criticalReport = evaluateBenchmarkV2Pilot({
  contract,
  syntheticHoldoutDecision: "promote",
  frozenCandidateFingerprint: sha("d"),
  bindingsFingerprint: sha("e"),
  excludedTaskIdentityFingerprints,
  tasks: criticalTasks,
});
assert.equal(criticalReport.guardrails.critical, false);
assert.equal(criticalReport.decision, "contradicts-or-inconclusive");

const duplicateTasks = [...tasks];
duplicateTasks[11] = { ...duplicateTasks[0] };
assert.throws(() => evaluateBenchmarkV2Pilot({
  contract,
  syntheticHoldoutDecision: "promote",
  frozenCandidateFingerprint: sha("d"),
  bindingsFingerprint: sha("e"),
  excludedTaskIdentityFingerprints,
  tasks: duplicateTasks,
}), /BENCHMARK_V2_PILOT_DUPLICATE/u);

process.stdout.write("benchmark v2 real-repository pilot contracts passed\n");
