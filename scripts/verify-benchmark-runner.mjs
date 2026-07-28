import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

import { fingerprint } from "../lib/feedback/contracts.mjs";
import {
  counterbalancedProfileOrder,
  evaluateSyntheticWorkspacePolicy,
  officialSyntheticAdapterConfigurationIsProfileNeutral,
  runSyntheticProfileAttempt,
  runSyntheticPair,
  syntheticHiddenSafetyFailed,
  syntheticPairAttemptMismatchReasons,
  syntheticPairBindingMismatchReasons,
  syntheticTraceEventsMatch,
  syntheticWholeTaskSuccess,
  validateSyntheticPairSet,
} from "../lib/benchmark/runner.mjs";
import { loadSyntheticContracts } from "../lib/benchmark/contracts.mjs";
import {
  loadSyntheticTemplateSet,
  renderSyntheticInstance,
} from "../lib/benchmark/renderer.mjs";
import {
  captureOrdinaryTreeManifest,
} from "../lib/feedback/evidence.mjs";
import {
  cleanupSyntheticProfile,
  materializeSyntheticProfile,
  readSyntheticProfileManifest,
} from "../lib/benchmark/profiles.mjs";

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function deterministicIdFactory() {
  let next = 0;
  return (kind) => `${kind}-${String(++next).padStart(4, "0")}`;
}

function fakeAdapterSource() {
  return `
import fs from "node:fs";
import path from "node:path";
const fp = ${JSON.stringify(fingerprint({ fake: "synthetic-runner-v1" }))};
export async function runScenario(context) {
  if (fs.existsSync(path.join(context.repo, "test", "hidden.test.mjs"))) {
    throw new Error("hidden oracle existed during adapter execution");
  }
  const source = path.join(context.repo, "src", "task.mjs");
  const original = fs.readFileSync(source, "utf8");
  const caseLine = original.split("\\n")[0];
  fs.writeFileSync(source, caseLine + "\\nexport function normalizePageSize(value, { minimum = 1, maximum = 100 } = {}) {\\n  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) throw new RangeError(\\"invalid_bounds\\");\\n  if (value === undefined || value === null || value === \\"\\") return minimum;\\n  if (!Number.isFinite(value)) throw new TypeError(\\"invalid_input\\");\\n  return Math.min(maximum, Math.max(minimum, value));\\n}\\n");
  await context.trace.emit({
    event_type: "tool_call",
    summary: "read event observed in fake adapter.",
    tool_or_command: "read",
    status: "completed",
    verifier_codes: ["FAKE-READ"]
  });
  await context.trace.emit({
    event_type: "edit",
    summary: "edit event observed in fake adapter.",
    tool_or_command: "mutation",
    status: "completed",
    verifier_codes: ["FAKE-EDIT"]
  });
  await context.trace.emit({
    event_type: "verification",
    summary: "verification event observed in fake adapter.",
    tool_or_command: "verification",
    status: "completed",
    verifier_codes: ["FAKE-VERIFY"]
  });
  return {
    passed: true,
    status: "completed",
    termination_reason: "verified",
    reason: null,
    adapter_protocol_version: 2,
    adapter_fingerprint: fp,
    profile_fingerprint: context.profileFingerprint,
    cli_version: "1.17.0",
    parser_status: "valid",
    response_protocol_status: "valid",
    agent_outcome: "success",
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
      observed_secret_write_count: 0
    },
    trace_summary: {
      trace_complete: false,
      stream_complete: true,
      unobserved_fields: [
        "dangerous_command_count",
        "fix_command_count",
        "hidden_access_attempt_count",
        "network_action_count",
        "repository_instruction_action_count",
        "secret_write_count",
        "workspace_mutation_count"
      ],
      event_count: 3,
      step_start_count: 1,
      step_finish_count: 1,
      reasoning_event_count: 0,
      final_response_bytes: 64,
      tool_call_count: 3,
      delegation_count: 0,
      delegated_agent_ids: [],
      targeted_verification_observed: true,
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
      reported_error: false
    },
    stdout_bytes: 512,
    stderr_bytes: 0,
    duration_ms: 10
  };
}
`;
}

async function directSuccessfulAdapter({ context, onTrace }) {
  const source = path.join(context.repo, "src", "task.mjs");
  const caseLine = fs.readFileSync(source, "utf8").split("\n")[0];
  fs.writeFileSync(source, `${caseLine}
export function normalizePageSize(value, { minimum = 1, maximum = 100 } = {}) {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) throw new RangeError("invalid_bounds");
  if (value === undefined || value === null || value === "") return minimum;
  if (!Number.isFinite(value)) throw new TypeError("invalid_input");
  return Math.min(maximum, Math.max(minimum, value));
}
`);
  for (const event of [
    {
      event_type: "tool_call",
      summary: "read event observed in direct fake adapter.",
      tool_or_command: "read",
      status: "completed",
      verifier_codes: ["FAKE-READ"],
    },
    {
      event_type: "edit",
      summary: "edit event observed in direct fake adapter.",
      tool_or_command: "mutation",
      status: "completed",
      verifier_codes: ["FAKE-EDIT"],
    },
    {
      event_type: "verification",
      summary: "verification event observed in direct fake adapter.",
      tool_or_command: "verification",
      status: "completed",
      verifier_codes: ["FAKE-VERIFY"],
    },
  ]) {
    await onTrace("emit", event);
  }
  return {
    passed: true,
    status: "completed",
    termination_reason: "verified",
    reason: null,
    adapter_protocol_version: 2,
    adapter_fingerprint: fingerprint({ fake: "synthetic-runner-v1" }),
    profile_fingerprint: context.profileFingerprint,
    cli_version: "1.17.0",
    parser_status: "valid",
    response_protocol_status: "valid",
    agent_outcome: "success",
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
    },
    trace_summary: {
      trace_complete: false,
      stream_complete: true,
      unobserved_fields: [
        "dangerous_command_count",
        "fix_command_count",
        "hidden_access_attempt_count",
        "network_action_count",
        "repository_instruction_action_count",
        "secret_write_count",
        "workspace_mutation_count",
      ],
      event_count: 3,
      step_start_count: 1,
      step_finish_count: 1,
      reasoning_event_count: 0,
      final_response_bytes: 64,
      tool_call_count: 3,
      delegation_count: 0,
      delegated_agent_ids: [],
      targeted_verification_observed: true,
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
    stdout_bytes: 512,
    stderr_bytes: 0,
    duration_ms: 10,
  };
}

function cleanupRetainedResources(receipt) {
  const canonicalTemporaryRoot = fs.realpathSync.native(path.resolve(os.tmpdir()));
  if (receipt.fixture_root !== null && fs.existsSync(receipt.fixture_root)) {
    const fixtureRoot = fs.realpathSync.native(receipt.fixture_root);
    assert(fixtureRoot.startsWith(`${canonicalTemporaryRoot}${path.sep}`));
    assert(path.basename(fixtureRoot).startsWith("opencode-bench-"));
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
  if (receipt.profile_root !== null && fs.existsSync(receipt.profile_root)) {
    cleanupSyntheticProfile(receipt.profile_root);
  }
}

function syntheticBinding(overrides = {}) {
  return {
    public_fixture_fingerprint: sha256("public"),
    hidden_fixture_fingerprint: sha256("hidden"),
    effective_public_input_fingerprint: sha256("input"),
    initial_public_manifest_fingerprint: sha256("manifest"),
    model_fingerprint: sha256("model"),
    timeout_ms: 75_000,
    limits_fingerprint: sha256("limits"),
    adapter_protocol_version: 2,
    ...overrides,
  };
}

export async function verifyBenchmarkRunner({ root = path.resolve(".") } = {}) {
  const contracts = loadSyntheticContracts(root);
  const templateSet = loadSyntheticTemplateSet(root, contracts);
  const antiCheating = new Set(contracts.inventory.benchmark.anti_cheating_cases);
  assert.equal(antiCheating.size, 9);

  const orderSamples = contracts.families.map((family) => counterbalancedProfileOrder({
    seed: "runner-counterbalance-v1",
    familyId: family.id,
    repetition: 1,
    baselineProfileId: "plain",
    candidateProfileId: "instrumented",
  }));
  assert(orderSamples.some((entry) => entry[0] === "plain"));
  assert(orderSamples.some((entry) => entry[0] === "instrumented"));
  assert.deepEqual(orderSamples, contracts.families.map((family) => counterbalancedProfileOrder({
    seed: "runner-counterbalance-v1",
    familyId: family.id,
    repetition: 1,
    baselineProfileId: "plain",
    candidateProfileId: "instrumented",
  })));
  antiCheating.delete("fixed-baseline-first");

  assert.deepEqual(
    syntheticPairBindingMismatchReasons(
      syntheticBinding(),
      syntheticBinding({ effective_public_input_fingerprint: sha256("different-task") }),
    ),
    ["effective-public-input-fingerprint-mismatch"],
  );
  antiCheating.delete("differing-public-task");
  assert.deepEqual(
    syntheticPairBindingMismatchReasons(
      syntheticBinding(),
      syntheticBinding({ public_fixture_fingerprint: sha256("different-fixture") }),
    ),
    ["public-fixture-fingerprint-mismatch"],
  );
  antiCheating.delete("fixture-fingerprint-mismatch");
  assert.deepEqual(
    syntheticPairAttemptMismatchReasons(
      {
        binding: syntheticBinding(),
        result: { fingerprints: { adapter: sha256("adapter-a") } },
      },
      {
        binding: syntheticBinding(),
        result: { fingerprints: { adapter: sha256("adapter-b") } },
      },
    ),
    ["adapter-fingerprint-mismatch"],
  );
  assert.deepEqual(
    syntheticPairBindingMismatchReasons(
      syntheticBinding(),
      syntheticBinding({ timeout_ms: 60_000 }),
    ),
    ["timeout-ms-mismatch"],
  );
  antiCheating.delete("timeout");

  const expectedPairIds = [sha256("one"), sha256("two")];
  assert.deepEqual(
    validateSyntheticPairSet([{ pair_id: expectedPairIds[0] }], expectedPairIds).violations,
    ["missing-pair"],
  );
  antiCheating.delete("missing-pair");
  assert.deepEqual(
    validateSyntheticPairSet([
      { pair_id: expectedPairIds[0] },
      { pair_id: expectedPairIds[0] },
      { pair_id: expectedPairIds[1] },
    ], expectedPairIds).violations,
    ["duplicate-pair"],
  );
  antiCheating.delete("duplicate-pair");

  assert.equal(officialSyntheticAdapterConfigurationIsProfileNeutral(), true);
  antiCheating.delete("profile-specific-adapter-branching");
  const staleProfile = materializeSyntheticProfile({ sourceRoot: root, profileId: "plain" });
  try {
    fs.appendFileSync(staleProfile.configPath, "\n");
    assert.throws(
      () => readSyntheticProfileManifest(staleProfile.manifestPath),
      (error) => error?.code === "SYNTHETIC_PROFILE_CONFIG_STALE",
    );
  } finally {
    cleanupSyntheticProfile(staleProfile);
  }
  antiCheating.delete("stale-profile-evidence");

  assert.equal(syntheticTraceEventsMatch({
    tool_call_count: 3,
    delegation_count: 1,
    targeted_verification_observed: true,
  }, {
    emitted_tool_event_count: 3,
    delegation_event_count: 1,
    verification_event_count: 1,
  }), true);
  assert.equal(syntheticTraceEventsMatch({
    tool_call_count: 4,
    delegation_count: 1,
    targeted_verification_observed: true,
  }, {
    emitted_tool_event_count: 3,
    delegation_event_count: 1,
    verification_event_count: 1,
  }), false);

  const initialRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bench-policy-initial-"));
  const changedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bench-policy-changed-"));
  try {
    fs.mkdirSync(path.join(initialRoot, "src"));
    fs.mkdirSync(path.join(changedRoot, "src"));
    fs.writeFileSync(path.join(initialRoot, "src", "task.mjs"), "old\n");
    fs.writeFileSync(path.join(changedRoot, "src", "task.mjs"), "new\n");
    const policy = evaluateSyntheticWorkspacePolicy(
      {
        expected_changed_paths: ["src/task.mjs"],
        forbidden_paths: ["package.json"],
        max_changed_files: 1,
        review_only: false,
      },
      captureOrdinaryTreeManifest(initialRoot),
      captureOrdinaryTreeManifest(changedRoot),
    );
    assert.equal(policy.outcome.passed, true);
  } finally {
    fs.rmSync(initialRoot, { recursive: true, force: true });
    fs.rmSync(changedRoot, { recursive: true, force: true });
  }

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bench-runner-test-"));
  try {
    const fakeAdapterPath = path.join(temporaryRoot, "fake-adapter.mjs");
    fs.writeFileSync(fakeAdapterPath, fakeAdapterSource());
    const instance = renderSyntheticInstance({
      contracts,
      templateSet,
      familyId: "function-boundaries",
      seed: "runner-self-test-v1",
      repetition: 1,
    });
    const executed = await runSyntheticPair({
      sourceRoot: root,
      contracts,
      templateSet,
      instance,
      reportRunId: "runner-self-test",
      baselineProfileId: "plain",
      candidateProfileId: "instrumented",
      model: "fixture/model",
      timeoutMs: 60_000,
      adapterUrl: pathToFileURL(fakeAdapterPath).href,
      clock: () => new Date("2026-01-01T00:00:00.000Z"),
      idFactory: deterministicIdFactory(),
    });
    assert.equal(executed.pair.complete, true);
    assert.equal(executed.pair.baseline.whole_task_success, true);
    assert.equal(executed.pair.candidate.whole_task_success, true);
    assert.equal(executed.pair.baseline.defect_escape_v2, false);
    assert.equal(executed.pair.candidate.defect_escape_v2, false);
    assert.notEqual(
      executed.pair.baseline.operational_run_id,
      executed.pair.candidate.operational_run_id,
    );
    assert.equal(
      executed.pair.baseline.fingerprints.initial_workspace,
      executed.pair.candidate.fingerprints.initial_workspace,
    );
    assert(!canonicalPrivacyText(executed.pair).includes("hidden.test.mjs"));
    antiCheating.delete("exposed-hidden-paths");

    const retainedVisible = [];
    let visibleCommandCalls = 0;
    const visibleTeardownFailure = await runSyntheticProfileAttempt({
      sourceRoot: root,
      instance,
      profileId: "plain",
      operationalRunId: "runner-visible-teardown-test",
      model: "fixture/model",
      timeoutMs: 60_000,
      adapterInvoker: directSuccessfulAdapter,
      commandRunner: async () => {
        visibleCommandCalls += 1;
        return {
          status: 0,
          signal: null,
          stdout_chars: 0,
          stderr_chars: 0,
          stdout_bytes: 0,
          stderr_bytes: 0,
          timed_out: false,
          teardown_verified: false,
        };
      },
      onResourcesPreserved: (receipt) => retainedVisible.push(receipt),
      clock: () => new Date("2026-01-01T00:00:00.000Z"),
      idFactory: deterministicIdFactory(),
    });
    try {
      assert.equal(visibleCommandCalls, 1);
      assert.equal(visibleTeardownFailure.result.teardown.passed, false);
      assert.equal(visibleTeardownFailure.result.cleanup.status, "not_run");
      assert.equal(visibleTeardownFailure.result.evidence_complete, false);
      assert.equal(retainedVisible.length, 1);
      assert.equal(
        fs.existsSync(path.join(retainedVisible[0].repo, "test", "hidden.test.mjs")),
        false,
      );
    } finally {
      retainedVisible.forEach(cleanupRetainedResources);
    }

    const retainedHidden = [];
    let hiddenCommandCalls = 0;
    const hiddenTeardownFailure = await runSyntheticProfileAttempt({
      sourceRoot: root,
      instance,
      profileId: "plain",
      operationalRunId: "runner-hidden-teardown-test",
      model: "fixture/model",
      timeoutMs: 60_000,
      adapterInvoker: directSuccessfulAdapter,
      commandRunner: async () => {
        hiddenCommandCalls += 1;
        return {
          status: 0,
          signal: null,
          stdout_chars: 0,
          stderr_chars: 0,
          stdout_bytes: 0,
          stderr_bytes: 0,
          timed_out: false,
          teardown_verified: hiddenCommandCalls === 1,
        };
      },
      onResourcesPreserved: (receipt) => retainedHidden.push(receipt),
      clock: () => new Date("2026-01-01T00:00:00.000Z"),
      idFactory: deterministicIdFactory(),
    });
    try {
      assert.equal(hiddenCommandCalls, 2);
      assert.equal(hiddenTeardownFailure.result.teardown.passed, false);
      assert.equal(hiddenTeardownFailure.result.cleanup.status, "not_run");
      assert.equal(hiddenTeardownFailure.result.evidence_complete, false);
      assert.equal(retainedHidden.length, 1);
      assert.equal(
        fs.existsSync(path.join(retainedHidden[0].repo, "test", "hidden.test.mjs")),
        true,
      );
    } finally {
      retainedHidden.forEach(cleanupRetainedResources);
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }

  const passed = { status: "passed", passed: true, violations: [] };
  const failed = { status: "failed", passed: false, violations: ["oracle"] };
  assert.equal(syntheticHiddenSafetyFailed({
    hiddenCheck: failed,
    workspacePolicy: passed,
    tracePolicy: passed,
  }), true);
  const baseOutcome = {
    adapter_completed_correctly: true,
    agent_reported_success: true,
    termination_acceptable: true,
    visible_check: passed,
    hidden_check: passed,
    workspace_policy: passed,
    trace_policy: passed,
    teardown: passed,
    cleanup: passed,
    hidden_safety_failed: false,
    evidence_complete: true,
  };
  assert.equal(syntheticWholeTaskSuccess(baseOutcome), true);
  for (const key of [
    "adapter_completed_correctly",
    "agent_reported_success",
    "termination_acceptable",
    "hidden_safety_failed",
    "evidence_complete",
  ]) {
    assert.equal(syntheticWholeTaskSuccess({
      ...baseOutcome,
      [key]: key === "hidden_safety_failed",
    }), false);
  }
  for (const key of [
    "visible_check",
    "hidden_check",
    "workspace_policy",
    "trace_policy",
    "teardown",
    "cleanup",
  ]) {
    assert.equal(syntheticWholeTaskSuccess({
      ...baseOutcome,
      [key]: failed,
    }), false);
  }
  assert.deepEqual([...antiCheating], []);
  return {
    anti_cheating_cases: 9,
    counterbalance_families: orderSamples.length,
    production_runner_pairs: 1,
  };
}

function canonicalPrivacyText(value) {
  return JSON.stringify(value);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await verifyBenchmarkRunner();
  console.log(`Synthetic benchmark runner verification passed (${result.anti_cheating_cases} anti-cheating cases, ${result.counterbalance_families} counterbalance families, ${result.production_runner_pairs} production pair).`);
}
