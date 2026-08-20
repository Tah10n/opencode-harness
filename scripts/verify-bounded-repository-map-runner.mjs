import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fingerprint } from "../lib/feedback/contracts.mjs";
import { runSyntheticProfileAttempt, syntheticAdapterWorkerTimeoutMs } from "../lib/benchmark/runner.mjs";
import { loadBenchmarkV2Contracts } from "../lib/benchmark/v2-contracts.mjs";
import { renderBenchmarkV2DevelopmentFamily } from "../lib/benchmark/v2-fixtures.mjs";
import { materializeVnextSyntheticProfile } from "../lib/benchmark/profiles.mjs";
import { SYNTHETIC_OPENCODE_ADAPTER_VERSION } from "../lib/benchmark/opencode-adapter.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contracts = loadBenchmarkV2Contracts(root);
const family = contracts.dev.families.find((entry) => entry.id === "dev-medium-config-propagation");
const binding = contracts.devBindings.bindings.find((entry) => entry.family_id === family.id);
const instance = renderBenchmarkV2DevelopmentFamily({
  repositoryRoot: root,
  family,
  binding,
  seed: "bounded-repository-map-runner",
});
const prompts = new Map();
let reviewerPrompt = null;
let remediationPrimaryCallCount = 0;
let verificationRetryPrimaryCallCount = 0;
let diffGuidedRetryPrimaryCallCount = 0;
let invalidRetryPrimaryCallCount = 0;
let latestPrimaryProfileManifestPath = null;

function commandRunner() {
  return Promise.resolve({
    status: 0,
    signal: null,
    stdout_chars: 0,
    stderr_chars: 0,
    stdout_bytes: 0,
    stderr_bytes: 0,
    timed_out: false,
    teardown_verified: true,
  });
}

function failingCommandRunner() {
  return Promise.resolve({
    status: 1,
    signal: null,
    stdout_chars: 0,
    stderr_chars: 0,
    stdout_bytes: 0,
    stderr_bytes: 0,
    timed_out: false,
    teardown_verified: true,
  });
}

function failOnceCommandRunner() {
  let callCount = 0;
  return () => {
    callCount += 1;
    return Promise.resolve({
      status: callCount === 1 ? 1 : 0,
      signal: null,
      stdout_chars: 0,
      stderr_chars: 0,
      stdout_bytes: 0,
      stderr_bytes: 0,
      timed_out: false,
      teardown_verified: true,
    });
  };
}

async function fixtureAdapter({ context, onTrace, timeout }) {
  assert.equal(timeout, syntheticAdapterWorkerTimeoutMs(context.timeout));
  latestPrimaryProfileManifestPath = context.profileManifestPath;
  prompts.set(context.profileId, context.prompt);
  for (const file of instance.solution_files) {
    const target = path.join(context.repo, ...file.path.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content, "utf8");
  }
  for (const event of [
    { event_type: "tool_call", summary: "read", tool_or_command: "read", status: "completed", verifier_codes: ["FIXTURE_READ"] },
    { event_type: "edit", summary: "edit", tool_or_command: "mutation", status: "completed", verifier_codes: ["FIXTURE_EDIT"] },
  ]) await onTrace("emit", event);
  return {
    passed: true,
    status: "completed",
    termination_reason: "verified",
    reason: null,
    adapter_protocol_version: SYNTHETIC_OPENCODE_ADAPTER_VERSION,
    adapter_fingerprint: fingerprint({ fixture: "bounded-repository-map-runner" }),
    profile_fingerprint: context.profileFingerprint,
    cli_version: "1.18.18",
    parser_status: "valid",
    response_protocol_status: "valid",
    agent_outcome: "success",
    claimed_completion: true,
    claimed_outcome_availability: "available",
    explicit_block: false,
    explicit_failure: false,
    review_findings: [],
    transient_observations: {
      observation_complete: true,
      ambiguity_count: 0,
      path_observation_rejection_count: 0,
      accessed_path_fingerprints: [],
      accessed_path_fingerprint_counts: [],
      mutated_path_fingerprints: [],
      observed_fix_command_count: 1,
      observed_repository_instruction_action_count: 0,
      observed_secret_write_count: 0,
      observed_control_path_action_count: 0,
    },
    trace_summary: {
      trace_complete: false,
      stream_complete: true,
      unobserved_fields: [
        "dangerous_command_count", "fix_command_count", "hidden_access_attempt_count",
        "network_action_count", "repository_instruction_action_count", "secret_write_count",
        "workspace_mutation_count",
      ],
      event_count: 2,
      step_start_count: 1,
      step_finish_count: 1,
      reasoning_event_count: 0,
      final_response_bytes: 32,
      tool_call_count: 2,
      task_action_call_count: 2,
      computational_control_call_count: 0,
      context_read_count: 0,
      delegation_count: 0,
      delegated_agent_ids: [],
      targeted_verification_observed: false,
      dangerous_command_count: null,
      hidden_access_attempt_count: null,
      workspace_mutation_count: null,
      fix_command_count: null,
      repository_instruction_action_count: null,
      secret_write_count: null,
      network_action_count: null,
      observed_dangerous_command_count: 0,
      observed_mutation_tool_count: 1,
      observed_network_tool_count: 0,
      unknown_event_count: 0,
      unfinished_tool_call_count: 0,
      reported_error: false,
    },
    stdout_bytes: 256,
    stderr_bytes: 0,
    duration_ms: 10,
    model_turn_count: 1,
    continuation_turn_count: 0,
  };
}

async function automaticReviewerAdapter({ context, timeout }) {
  assert.equal(timeout, syntheticAdapterWorkerTimeoutMs(context.timeout));
  assert.equal(context.agentId, "core-reviewer");
  assert.equal(context.taskScopeMode, "read-only");
  assert.notEqual(context.profileManifestPath, latestPrimaryProfileManifestPath);
  reviewerPrompt = context.prompt;
  return {
    passed: true,
    status: "completed",
    termination_reason: "verified",
    reason: null,
    adapter_protocol_version: SYNTHETIC_OPENCODE_ADAPTER_VERSION,
    adapter_fingerprint: fingerprint({ fixture: "automatic-reviewer" }),
    profile_fingerprint: context.profileFingerprint,
    cli_version: "1.18.18",
    parser_status: "valid",
    response_protocol_status: "structured-review",
    agent_outcome: null,
    claimed_completion: true,
    claimed_outcome_availability: "unavailable",
    explicit_block: false,
    explicit_failure: false,
    review_findings: [],
    transient_observations: {
      observation_complete: true,
      ambiguity_count: 0,
      path_observation_rejection_count: 0,
      observed_repository_instruction_action_count: 0,
      observed_secret_write_count: 0,
      observed_control_path_action_count: 0,
    },
    trace_summary: {
      stream_complete: true,
      unknown_event_count: 0,
      unfinished_tool_call_count: 0,
      observed_mutation_tool_count: 0,
      observed_dangerous_command_count: 0,
      observed_network_tool_count: 0,
    },
    stdout_bytes: 128,
    stderr_bytes: 0,
    duration_ms: 5,
    model_turn_count: 1,
    continuation_turn_count: 0,
  };
}

async function findingReviewerAdapter(input) {
  const result = await automaticReviewerAdapter(input);
  return {
    ...result,
    review_findings: [{
      severity: "MEDIUM",
      path: instance.solution_files[0].path,
      line: 1,
      contract: "the final source must not retain the injected review marker",
      evidence: "the exact final diff contains REVIEW_DEFECT_MARKER",
      body: "remove only the marker and preserve the functional fix",
    }],
  };
}

async function offDiffReviewerAdapter(input) {
  const result = await automaticReviewerAdapter(input);
  return {
    ...result,
    review_findings: [{
      severity: "HIGH",
      path: "src/not-in-final-diff.mjs",
      line: 1,
      contract: "invented contract",
      evidence: "invented evidence",
      body: "do not accept this finding",
    }],
  };
}

async function remediationPrimaryAdapter(input) {
  remediationPrimaryCallCount += 1;
  const result = await fixtureAdapter(input);
  if (remediationPrimaryCallCount === 1) {
    const target = path.join(input.context.repo, ...instance.solution_files[0].path.split("/"));
    fs.appendFileSync(target, "// REVIEW_DEFECT_MARKER\n", "utf8");
  }
  return result;
}

async function verificationRetryPrimaryAdapter(input) {
  verificationRetryPrimaryCallCount += 1;
  const result = await fixtureAdapter(input);
  if (verificationRetryPrimaryCallCount === 1) {
    const target = path.join(input.context.repo, ...instance.solution_files[0].path.split("/"));
    fs.appendFileSync(target, "// VISIBLE_VERIFICATION_DEFECT\n", "utf8");
  }
  return result;
}

async function diffGuidedRetryPrimaryAdapter(input) {
  diffGuidedRetryPrimaryCallCount += 1;
  const result = await fixtureAdapter(input);
  if (diffGuidedRetryPrimaryCallCount === 1) {
    const target = path.join(input.context.repo, ...instance.solution_files[0].path.split("/"));
    fs.appendFileSync(target, "// VISIBLE_VERIFICATION_DEFECT\n", "utf8");
  }
  return result;
}

async function invalidRetryPrimaryAdapter(input) {
  invalidRetryPrimaryCallCount += 1;
  const result = await fixtureAdapter(input);
  if (invalidRetryPrimaryCallCount === 1) {
    const target = path.join(input.context.repo, ...instance.solution_files[0].path.split("/"));
    fs.appendFileSync(target, "// VISIBLE_VERIFICATION_DEFECT\n", "utf8");
    return result;
  }
  fs.writeFileSync(path.join(input.context.repo, "unexpected-retry-output.mjs"), "export default true;\n", "utf8");
  return {
    ...result,
    passed: false,
    status: "failed",
    termination_reason: "verification_failed",
    reason: "opencode_nonzero_exit",
  };
}

async function attempt(
  profileId,
  reviewerInvoker = null,
  primaryInvoker = fixtureAdapter,
  selectedCommandRunner = commandRunner,
) {
  let nextId = 0;
  return runSyntheticProfileAttempt({
    sourceRoot: root,
    instance,
    profileId,
    operationalRunId: `bounded-repository-map-${profileId}`,
    model: "fixture/model",
    provider: "fixture",
    timeoutMs: 60_000,
    adapterUrl: new URL("../lib/benchmark/opencode-adapter.mjs", import.meta.url).href,
    adapterInvoker: primaryInvoker,
    reviewerInvoker,
    commandRunner: selectedCommandRunner,
    profileMaterializer: materializeVnextSyntheticProfile,
    clock: () => new Date("2026-08-19T00:00:00.000Z"),
    idFactory: (kind) => `${kind}-${profileId}-${++nextId}`,
  });
}

const withoutMap = await attempt("P2");
const withMap = await attempt("P3");
const withReview = await attempt("P4", automaticReviewerAdapter);
const withReviewAfterFailedVerification = await attempt(
  "P4",
  automaticReviewerAdapter,
  fixtureAdapter,
  failingCommandRunner,
);
const withRemediation = await attempt("P4", findingReviewerAdapter, remediationPrimaryAdapter);
const withOffDiffFinding = await attempt("P4", offDiffReviewerAdapter);
const withVerificationRetry = await attempt(
  "P9",
  null,
  verificationRetryPrimaryAdapter,
  failOnceCommandRunner(),
);
const withDiffGuidedVerificationRetry = await attempt(
  "P10",
  null,
  diffGuidedRetryPrimaryAdapter,
  failOnceCommandRunner(),
);
const withInvalidRetryMutation = await attempt(
  "P9",
  null,
  invalidRetryPrimaryAdapter,
  failOnceCommandRunner(),
);
assert.equal(prompts.get("P2").includes("HOST_REPOSITORY_MAP_V1="), false);
assert.equal(prompts.get("P3").includes("HOST_REPOSITORY_MAP_V1="), true);
assert.doesNotMatch(prompts.get("P3"), /[\r\n]/u);
assert(prompts.get("P3").length <= 16_000);
assert.deepEqual(withoutMap.result.vnext_context_map_observation, {
  eligible: true,
  activated: false,
  reason: "profile_without_host_context",
});
assert.equal(withMap.result.vnext_context_map_observation.eligible, true);
assert.equal(withMap.result.vnext_context_map_observation.activated, true);
assert.equal(withMap.result.vnext_context_map_observation.relevant_file_recall, 1);
assert.equal(withMap.result.vnext_context_map_observation.consumer_recall, 1);
assert(withMap.result.vnext_context_map_observation.context_bytes <= 12_000);
assert.equal(withMap.result.termination_acceptable, true);
assert.equal(withMap.result.metrics.context_read_count, withoutMap.result.metrics.context_read_count + 1);
assert.match(reviewerPrompt, /VISIBLE_REQUIREMENTS_JSON=/u);
assert.match(reviewerPrompt, /FINAL_DIFF_V1=/u);
assert.doesNotMatch(reviewerPrompt, /[\r\n]/u);
assert.equal(withReview.result.vnext_automatic_review_observation.review_required_count, 1);
assert.equal(withReview.result.vnext_automatic_review_observation.review_started_count, 1);
assert.equal(withReview.result.vnext_automatic_review_observation.review_completed_count, 1);
assert.equal(withReview.result.vnext_automatic_review_observation.review_finding_count, 0);
assert.equal(withReview.result.vnext_automatic_review_observation.reviewer_caused_fix_count, 0);
assert.equal(withReview.result.vnext_automatic_review_observation.workspace_unchanged, true);
assert.equal(withReview.result.termination_acceptable, true);
assert.equal(withReviewAfterFailedVerification.result.visible_check.passed, false);
assert.equal(
  withReviewAfterFailedVerification.result.vnext_automatic_review_observation.review_started_count,
  1,
);
assert.equal(
  withReviewAfterFailedVerification.result.vnext_automatic_review_observation.review_completed_count,
  1,
);
assert.equal(
  withReviewAfterFailedVerification.result.vnext_automatic_review_observation.operationally_complete,
  true,
);
assert.equal(withReviewAfterFailedVerification.result.termination_acceptable, false);
assert.equal(remediationPrimaryCallCount, 2);
assert.equal(withRemediation.result.vnext_automatic_review_observation.review_finding_count, 1);
assert.equal(withRemediation.result.vnext_automatic_review_observation.reviewer_caused_fix_count, 1);
assert.equal(withRemediation.result.vnext_automatic_review_observation.reason, "review_findings_remediated_and_reverified");
assert.equal(withRemediation.result.visible_check.passed, true);
assert.equal(withRemediation.result.termination_acceptable, true);
assert.equal(withOffDiffFinding.result.vnext_automatic_review_observation.review_started_count, 1);
assert.equal(withOffDiffFinding.result.vnext_automatic_review_observation.review_completed_count, 0);
assert.equal(withOffDiffFinding.result.termination_acceptable, false);
assert.equal(verificationRetryPrimaryCallCount, 2);
assert.equal(withVerificationRetry.result.vnext_verification_remediation_observation.eligible, true);
assert.equal(withVerificationRetry.result.vnext_verification_remediation_observation.retry_started_count, 1);
assert.equal(withVerificationRetry.result.vnext_verification_remediation_observation.retry_completed_count, 1);
assert.equal(withVerificationRetry.result.vnext_verification_remediation_observation.retry_changed_count, 1);
assert.equal(withVerificationRetry.result.vnext_verification_remediation_observation.retry_reverified_count, 1);
assert.equal(withVerificationRetry.result.vnext_verification_remediation_observation.retry_verification_passed_count, 1);
assert.equal(withVerificationRetry.result.visible_check.passed, true);
assert.equal(withVerificationRetry.result.termination_acceptable, true);
assert.equal(withVerificationRetry.result.metrics.total_tool_call_count, 4);
assert.match(prompts.get("P9"), /runner-selected trusted visible verification did not pass/u);
assert.equal(diffGuidedRetryPrimaryCallCount, 2);
assert.equal(withDiffGuidedVerificationRetry.result.vnext_verification_remediation_observation.eligible, true);
assert.equal(withDiffGuidedVerificationRetry.result.vnext_verification_remediation_observation.retry_changed_count, 1);
assert.equal(withDiffGuidedVerificationRetry.result.vnext_verification_remediation_observation.retry_verification_passed_count, 1);
assert.equal(withDiffGuidedVerificationRetry.result.termination_acceptable, true);
assert.match(prompts.get("P10"), /CURRENT_PUBLIC_DIFF_V1=/u);
assert.match(prompts.get("P10"), /VISIBLE_VERIFICATION_DEFECT/u);
assert.doesNotMatch(prompts.get("P10"), /[\r\n]/u);
assert.equal(invalidRetryPrimaryCallCount, 2);
assert.equal(withInvalidRetryMutation.result.vnext_verification_remediation_observation.retry_completed_count, 0);
assert.equal(withInvalidRetryMutation.result.vnext_verification_remediation_observation.retry_changed_count, 1);
assert.equal(withInvalidRetryMutation.result.workspace_policy.passed, false);
assert.equal(withInvalidRetryMutation.result.termination_acceptable, false);

process.stdout.write("bounded repository map runner integration passed\n");
