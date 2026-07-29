import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";

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
  captureSyntheticGitState,
  captureSyntheticTaskManifest,
  evaluateSyntheticFixtureControl,
  inspectSyntheticQualityControlState,
  materializeSyntheticFixtureControl,
} from "../lib/benchmark/fixture-control.mjs";
import {
  prepareIsolatedFixture,
} from "../lib/benchmark/isolation.mjs";
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
import { registerHooks } from "node:module";
const fp = ${JSON.stringify(fingerprint({ fake: "synthetic-runner-v1" }))};
export async function runScenario(context) {
  const profileRoot = path.dirname(context.profileManifestPath);
  const profileManifest = JSON.parse(fs.readFileSync(context.profileManifestPath, "utf8"));
  const profileConfig = JSON.parse(fs.readFileSync(path.join(profileRoot, profileManifest.config_path), "utf8"));
  if (Array.isArray(profileConfig.plugin)) {
    const apiUrl = "data:text/javascript," + encodeURIComponent(
      "export function tool(definition){return definition}; tool.schema={string:()=>({describe:()=>({type:'string'})})};"
    );
    const qualityPluginUrl = new URL(
      "../../lib/quality/quality-plugin.mjs",
      profileConfig.plugin[0]
    ).href;
    const hooks = registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === "@opencode-ai/plugin") return { url: apiUrl, shortCircuit: true };
        if (specifier === "opencode-harness/quality-plugin") {
          return { url: qualityPluginUrl, shortCircuit: true };
        }
        return nextResolve(specifier, context);
      }
    });
    try {
      for (const pluginUrl of profileConfig.plugin) {
        const loaded = await import(pluginUrl);
        await loaded.EngineeringDossierPlugin({ directory: context.repo, worktree: context.repo });
      }
    } finally {
      hooks.deregister();
    }
  }
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
      observed_secret_write_count: 0,
      observed_control_path_action_count: 0
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
      observed_control_path_action_count: 0,
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

function contextReadOutput(relativePath, content) {
  const lineCount = Math.max(1, content.split(/\r?\n/u).length);
  const truncation = Object.fromEntries([
    "inventoryLimitReached", "resultLimitReached", "matchLimitReached", "byteLimitReached",
    "lineLimitReached", "durationLimitReached", "excerptTruncated", "contextBeforeTruncated",
    "contextAfterTruncated", "symbolLimitReached", "relationshipLimitReached", "snapshotChanged",
    "coveragePartial",
  ].map((key) => [key, false]));
  return JSON.stringify({
    schemaVersion: 2,
    tool: "context_read",
    worktree: ".",
    scope: { path: relativePath, filters: {} },
    snapshot: {
      fingerprint: fingerprint({ relativePath, content }).slice("sha256:".length),
      fingerprintKind: "content",
      fingerprintScope: relativePath,
      complete: true,
      stable: true,
      changedDuringOperation: false,
      truncationReasons: [],
    },
    coverage: {
      candidateFiles: 1,
      scannedFiles: 1,
      bytesScanned: Buffer.byteLength(content, "utf8"),
      skippedSecret: 0,
      skippedGenerated: 0,
      skippedLarge: 0,
      skippedUnreadable: 0,
      unsupportedLanguages: {},
      truncation,
      truncationReasons: [],
      partial: false,
    },
    limits: {},
    usage: {
      files: 1,
      directories: 0,
      bytes: Buffer.byteLength(content, "utf8"),
      lines: lineCount,
      matches: 0,
      ranges: 1,
    },
    truncated: false,
    ok: true,
    path: relativePath,
    sha256: fingerprint(content).slice("sha256:".length),
    bytes: Buffer.byteLength(content, "utf8"),
    totalLines: lineCount,
    selectedRange: { startLine: 1, endLine: lineCount },
    encoding: "utf-8",
    stableDuringRead: true,
    truncatedBefore: false,
    truncatedAfter: false,
    text: content,
  });
}

function scopeFacts() {
  return {
    parallel_writable_delegation: false,
    migration: false,
    public_compatibility_change: false,
    architecture_policy_change: false,
    security_sensitive: false,
    persistence_sensitive: false,
    concurrency_sensitive: false,
    unresolved_unknowns: false,
  };
}

async function verifyProductionInstrumentedActivation(root, contracts, templateSet) {
  const instance = renderSyntheticInstance({
    contracts,
    templateSet,
    familyId: "function-boundaries",
    seed: "instrumented-plugin-activation-v1",
    repetition: 1,
  });
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bench-plugin-source-"));
  const sourceDirectory = path.join(sourceRoot, "public");
  fs.mkdirSync(sourceDirectory);
  let fixture = null;
  let profile = null;
  let hooks = null;
  try {
    for (const file of instance.public_files) {
      const target = path.join(sourceDirectory, ...file.path.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.content, "utf8");
    }
    fixture = prepareIsolatedFixture({
      scenarioId: instance.instance_id,
      fixturePath: "public",
      profileId: "instrumented",
      sourceRoot,
      temporaryPrefix: "opencode-bench-plugin",
      fixtureContractCode: "SYNTHETIC_RUNNER_PLUGIN_FIXTURE",
      temporaryRootContractCode: "SYNTHETIC_RUNNER_PLUGIN_TEMP",
    });
    const initialControl = materializeSyntheticFixtureControl({
      repo: fixture.repo,
      instance,
    });
    profile = materializeSyntheticProfile({ sourceRoot: root, profileId: "instrumented" });
    const config = JSON.parse(fs.readFileSync(profile.configPath, "utf8"));
    assert.equal(config.plugin.length, 1);
    const apiUrl = `data:text/javascript,${encodeURIComponent(
      "export function tool(definition){return definition}; tool.schema={string:()=>({describe:()=>({type:'string'})})};",
    )}`;
    const qualityPluginUrl = pathToFileURL(
      path.join(root, "lib", "quality", "quality-plugin.mjs"),
    ).href;
    hooks = registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === "@opencode-ai/plugin") return { url: apiUrl, shortCircuit: true };
        if (specifier === "opencode-harness/quality-plugin") {
          return { url: qualityPluginUrl, shortCircuit: true };
        }
        return nextResolve(specifier, context);
      },
    });
    const loaded = await import(config.plugin[0]);
    const plugin = await loaded.EngineeringDossierPlugin({
      directory: fixture.repo,
      worktree: fixture.repo,
    });
    assert.equal(typeof plugin["chat.message"], "function");
    assert.equal(Object.hasOwn(plugin.tool, "quality_session_start"), true);
    const sessionID = "synthetic/instrumented-plugin-activation";
    const context = { sessionID, agent: "orchestrator-deep" };
    await plugin["chat.message"](context);
    const ownershipPath = instance.workspace_policy.expected_changed_paths[0];
    const request = {
      risk_class: "standard-lite",
      task_type: "bug_fix",
      user_visible_goal: "Repair the bounded synthetic fixture.",
      ownership_paths: [ownershipPath],
      required_check_ids: ["synthetic-visible"],
      classification_rationale: "model-free production plugin activation regression",
      behavior_expectation: "the public synthetic test passes after the bounded repair",
      expected_preserved_behavior: ["runner-owned control state remains unchanged"],
      known_local_edge_cases: ["the pre-fix public test fails deterministically"],
      scope_facts: scopeFacts(),
      reproduction_contract: {
        check_id: "synthetic-visible",
        expected_pre_fix: "failing_reproducer",
        expected_post_fix: "passing_regression",
        unavailable_reason: null,
        uncertainty_material: false,
      },
    };
    const started = JSON.parse(await plugin.tool.quality_session_start.execute({
      request: JSON.stringify(request),
    }, context));
    const content = fs.readFileSync(path.join(fixture.repo, ...ownershipPath.split("/")), "utf8");
    const callID = "synthetic-context-read";
    await plugin["tool.execute.before"](
      { tool: "context_read", sessionID, callID },
      { args: { path: ownershipPath, startLine: 1, maxLines: 100, maxBytes: 64 * 1024, format: "text" } },
    );
    await plugin["tool.execute.after"](
      { tool: "context_read", sessionID, callID },
      { output: contextReadOutput(ownershipPath, content), title: "context read", metadata: {} },
    );
    const gated = JSON.parse(await plugin.tool.quality_dossier_finalize.execute({
      request: JSON.stringify({ expected_revision: started.dossier_revision }),
    }, context));
    assert.equal(gated.gate_status, "passed");
    const sessionKey = createHash("sha256").update(sessionID).digest("hex");
    const state = JSON.parse(fs.readFileSync(
      path.join(fixture.repo, ".oc_harness", "quality", "sessions", `${sessionKey}.json`),
      "utf8",
    ));
    const receipt = state.preimplementation_check_receipts[0];
    assert.equal(receipt.check_id, "synthetic-visible");
    assert.equal(receipt.phase, "preimplementation");
    assert.equal(receipt.observed_outcome, "failing_reproducer");
    assert.equal(receipt.status, "passed");
    assert.match(receipt.evidence_fingerprint, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(receipt.containment_state.support_state, "verified");
    assert.equal(inspectSyntheticQualityControlState(fixture.repo).session_count, 1);
    const finalGit = captureSyntheticGitState(fixture.repo);
    assert.deepEqual(evaluateSyntheticFixtureControl({
      repo: fixture.repo,
      profileId: "instrumented",
      initialGitState: initialControl.git_state,
      finalGitState: finalGit,
      adapterResult: { transient_observations: { observed_control_path_action_count: 0 } },
    }), []);
    const ownerPath = path.join(
      fixture.repo,
      ".oc_harness",
      "quality",
      "sessions",
      `${sessionKey}.json`,
    );
    const tamperedOwner = JSON.parse(fs.readFileSync(ownerPath, "utf8"));
    tamperedOwner.lifecycle = "attested";
    fs.writeFileSync(ownerPath, `${JSON.stringify(tamperedOwner, null, 2)}\n`, "utf8");
    assert.throws(
      () => inspectSyntheticQualityControlState(fixture.repo),
      (error) => error?.code === "SYNTHETIC_FIXTURE_CONTROL_STATE",
    );
    assert.deepEqual(evaluateSyntheticFixtureControl({
      repo: fixture.repo,
      profileId: "instrumented",
      initialGitState: initialControl.git_state,
      finalGitState: finalGit,
      adapterResult: { transient_observations: { observed_control_path_action_count: 0 } },
    }), ["plugin_control_state_invalid"]);
  } finally {
    hooks?.deregister();
    if (profile !== null && fs.existsSync(profile.root)) cleanupSyntheticProfile(profile);
    if (fixture !== null && fs.existsSync(fixture.temporaryRoot)) {
      fs.rmSync(fixture.temporaryRoot, { recursive: true, force: true });
    }
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
}

export async function verifyBenchmarkRunner({ root = path.resolve(".") } = {}) {
  const contracts = loadSyntheticContracts(root);
  const templateSet = loadSyntheticTemplateSet(root, contracts);
  await verifyProductionInstrumentedActivation(root, contracts, templateSet);
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

    const substrateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bench-substrate-"));
    try {
      for (const file of instance.public_files) {
        const target = path.join(substrateRoot, ...file.path.split("/"));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, file.content, "utf8");
      }
      const substrate = materializeSyntheticFixtureControl({ repo: substrateRoot, instance });
      const initialTask = captureSyntheticTaskManifest(substrateRoot, substrate.git_state);
      fs.appendFileSync(path.join(substrateRoot, ".git", "config"), "\n[synthetic]\n\trogue = true\n");
      const changedGit = captureSyntheticGitState(substrateRoot);
      assert.deepEqual(evaluateSyntheticFixtureControl({
        repo: substrateRoot,
        profileId: "plain",
        initialGitState: substrate.git_state,
        finalGitState: changedGit,
        adapterResult: { transient_observations: { observed_control_path_action_count: 0 } },
      }), ["git_control_changed"]);
      assert.notEqual(
        captureSyntheticTaskManifest(substrateRoot, changedGit).fingerprint,
        initialTask.fingerprint,
      );
    } finally {
      fs.rmSync(substrateRoot, { recursive: true, force: true });
    }

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
    production_plugin_activations: 1,
  };
}

function canonicalPrivacyText(value) {
  return JSON.stringify(value);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await verifyBenchmarkRunner();
  console.log(`Synthetic benchmark runner verification passed (${result.anti_cheating_cases} anti-cheating cases, ${result.counterbalance_families} counterbalance families, ${result.production_runner_pairs} production pair).`);
}
