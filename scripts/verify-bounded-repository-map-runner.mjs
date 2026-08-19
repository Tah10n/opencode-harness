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

async function fixtureAdapter({ context, onTrace, timeout }) {
  assert.equal(timeout, syntheticAdapterWorkerTimeoutMs(context.timeout));
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

async function attempt(profileId) {
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
    adapterInvoker: fixtureAdapter,
    commandRunner,
    profileMaterializer: materializeVnextSyntheticProfile,
    clock: () => new Date("2026-08-19T00:00:00.000Z"),
    idFactory: (kind) => `${kind}-${profileId}-${++nextId}`,
  });
}

const withoutMap = await attempt("P3");
const withMap = await attempt("P4");
assert.equal(prompts.get("P3").includes("HOST_REPOSITORY_MAP_V1="), false);
assert.equal(prompts.get("P4").includes("HOST_REPOSITORY_MAP_V1="), true);
assert(prompts.get("P4").length <= 16_000);
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

process.stdout.write("bounded repository map runner integration passed\n");
