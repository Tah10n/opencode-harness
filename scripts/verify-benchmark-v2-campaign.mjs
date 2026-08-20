import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildBenchmarkV2CampaignPlan,
  executeBenchmarkV2Acceptance,
  executeBenchmarkV2Campaign,
  validateBenchmarkV2CampaignReport,
} from "../lib/benchmark/v2-campaign.mjs";
import { fingerprintProfileValue } from "../lib/profile-v3.mjs";
import {
  cleanupSyntheticProfile,
  materializeVnextSyntheticProfile,
} from "../lib/benchmark/profiles.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executableFingerprint = `sha256:${"a".repeat(64)}`;
const plainProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P0" });
const isolatedVerificationProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P6" });
try {
  assert.equal(plainProfile.primaryAgentId, "build");
  assert.equal(isolatedVerificationProfile.primaryAgentId, "build");
  assert.deepEqual(isolatedVerificationProfile.profileEvidence.component_ids, ["targeted-verification"]);
  assert.deepEqual(
    isolatedVerificationProfile.profileEvidence.runtime_surface.effective_config,
    plainProfile.profileEvidence.runtime_surface.effective_config,
  );
  assert.deepEqual(
    isolatedVerificationProfile.profileEvidence.runtime_surface.materialized_files.map((entry) => entry.path),
    ["runtime/host/core-verification-gate.mjs"],
  );
  assert.equal(
    isolatedVerificationProfile.profileEvidence.source_entries.some((entry) => entry.source_path === "agents/core.md"),
    false,
  );
} finally {
  cleanupSyntheticProfile(plainProfile);
  cleanupSyntheticProfile(isolatedVerificationProfile);
}
const plan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-1",
  baselineArmId: "P0",
  candidateArmId: "P6",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});

assert.equal(plan.schedules.length, 36);
assert.equal(plan.component_id, "targeted-verification");
assert.deepEqual([...new Set(plan.schedules.map((entry) => entry.stratum))].sort(), ["high", "medium", "small"]);
assert.equal(new Set(plan.schedules.map((entry) => entry.pair_id)).size, 36);
assert.throws(() => buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "validation",
  generationId: "generation-fixture-1",
  baselineArmId: "P0",
  candidateArmId: "P6",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  seed: "campaign-fixture-seed",
  executableIdentity: executableFingerprint,
  allowDirty: true,
}), /BENCHMARK_V2_VALIDATION_USE/u);

function check(passed, violation = null) {
  return { status: passed ? "passed" : "failed", passed, violations: violation === null ? [] : [violation] };
}

function binding(instance) {
  return Object.freeze({
    public_fixture_fingerprint: instance.public_fixture_fingerprint,
    hidden_fixture_fingerprint: instance.hidden_fixture_fingerprint,
    task_scope_fingerprint: fingerprintProfileValue(instance.task_scope),
    effective_public_input_fingerprint: fingerprintProfileValue({ prompt: instance.prompt, public: instance.public_fixture_fingerprint }),
    initial_public_manifest_fingerprint: fingerprintProfileValue(instance.public_files),
    model_fingerprint: fingerprintProfileValue("fixture/model"),
    executable_fingerprint: null,
    executable_version: "fixture",
    executable_basename: null,
    executable_platform: null,
    executable_identity_policy_version: null,
    timeout_ms: 300_000,
    limits_fingerprint: fingerprintProfileValue("limits"),
    adapter_protocol_version: 19,
  });
}

async function fakeAttempt({ instance, profileId }) {
  const ordinal = Number.parseInt(createHash(instance.family_id).slice(0, 2), 16);
  const baselineFailure = ordinal % 4 === 0;
  const success = profileId === "P6" ? true : !baselineFailure;
  const passed = check(true);
  const hidden = success ? passed : check(false, "hidden-contract");
  const result = {
    profile_id: profileId,
    execution_status: "completed",
    termination_reason: "verified",
    reason: null,
    evidence_complete: true,
    visible_check: passed,
    hidden_check: hidden,
    workspace_policy: passed,
    common_safety: passed,
    teardown: passed,
    cleanup: passed,
    hidden_safety_failed: !success,
    metrics: {
      duration_ms: profileId === "P6" ? 150 : 100,
      total_tool_call_count: 2,
      task_action_call_count: 2,
      computational_control_call_count: 0,
      context_read_count: 1,
      model_turn_count: 1,
      continuation_turn_count: 0,
    },
    vnext_host_verification_observation: { activation_eligible: true, activated: true, allowed: true },
    vnext_automatic_review_observation: null,
    vnext_context_map_observation: null,
    audit_evidence: { fixture: true },
    fingerprints: { adapter: `sha256:${"b".repeat(64)}` },
  };
  return Object.freeze({ result: Object.freeze(result), binding: binding(instance) });
}

function createHash(value) {
  return fingerprintProfileValue(value).slice(7);
}

const report = await executeBenchmarkV2Campaign({
  repositoryRoot: root,
  plan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
const acceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(acceptance.status, "passed");
assert.equal(acceptance.activation.activated, true);
assert.equal(report.status, "complete");
assert.equal(report.pair_results.length, 36);
assert.equal(report.summary.statistics.activation.rate, 1);
assert(report.summary.statistics.primary.paired_delta > 0);
assert(report.summary.statistics.exact_paired_permutation.candidate_only > 0);
assert.equal(report.summary.statistics.duration.median_ratio, 1.5);
assert.match(report.report_fingerprint, /^sha256:[0-9a-f]{64}$/u);
assert.equal(validateBenchmarkV2CampaignReport(report, { repositoryRoot: root }), report);
const tampered = structuredClone(report);
tampered.pair_results[0].candidate.metrics.duration_ms += 1;
assert.throws(() => validateBenchmarkV2CampaignReport(tampered, { repositoryRoot: root }), /REPORT_SCHEMA|REPORT_PAIRS/u);

process.stdout.write("benchmark v2 campaign passed\n");
