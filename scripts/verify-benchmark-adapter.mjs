import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildOpenCodeArgv,
  executeOpenCodeAdapter,
  MINIMUM_SUPPORTED_OPENCODE_VERSION,
  parseOpenCodeJsonl,
  parseOpenCodeVersion,
  SUPPORTED_SYNTHETIC_OPENCODE_TOOL_IDS,
  syntheticObservedPathFingerprint,
} from "../lib/benchmark/opencode-adapter.mjs";
import { NORMAL_SESSION_QUALITY_TOOL_IDS } from "../lib/quality/normal-session-bridge.mjs";
import {
  AdapterTimeoutError,
  runAdapterModule,
} from "../lib/feedback/adapter-worker.mjs";
import { classifyProcessContainment } from "../lib/feedback/process-containment.mjs";
import {
  cleanupSyntheticProfile,
  isolatedSyntheticProfileEnvironment,
  materializeSyntheticProfile,
  readSyntheticProfileManifest,
} from "../lib/benchmark/profiles.mjs";
import { createConfinedTemporaryDirectory } from "../lib/benchmark/isolation.mjs";
import { createInjectedTestContainmentFactory } from "./injected-test-containment.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agentResponse = ({
  agentOutcome = "success",
  reviewFindings = [],
} = {}) => JSON.stringify({
  agent_outcome: agentOutcome,
  review_findings: reviewFindings,
});
const finalEvent = (text = agentResponse()) => JSON.stringify({
  type: "text",
  part: { id: "final", type: "text", text },
});
const toolEvent = ({
  id,
  tool,
  status = "completed",
  input = {},
}) => JSON.stringify({
  type: "tool_use",
  part: {
    id,
    type: "tool",
    tool,
    state: { status, input },
  },
});
const jsonl = (...events) => `${events.join("\n")}\n`;

function fakeOpenCodeSource({
  mode = "success",
  stream = "",
  version = "1.17.20",
  versionMode = "success",
  descendantMarker = null,
} = {}) {
  const descendantSource = descendantMarker === null
    ? null
    : [
        "const fs=require('node:fs');",
        "const parentPid=Number(process.argv[1]);",
        "const marker=process.argv[2];",
        "const poll=setInterval(() => {",
        "  try { process.kill(parentPid, 0); }",
        "  catch { clearInterval(poll); setTimeout(() => fs.writeFileSync(marker, 'survived'), 700); }",
        "}, 25);",
      ].join(" ");
  return [
    "const { spawn } = require('node:child_process');",
    "const args = process.argv.slice(2);",
    `const mode = ${JSON.stringify(mode)};`,
    "if (args[0] === '--version') {",
    versionMode === "timeout"
      ? "  setInterval(() => {}, 60_000);"
      : `  process.stdout.write(${JSON.stringify(`${version}\n`)});`,
    versionMode === "timeout" ? "" : "  process.exit(0);",
    "}",
    "if (args[0] !== '--version') {",
    descendantSource === null
      ? ""
      : `if (mode === 'descendant-success') { spawn(process.execPath, ['-e', ${JSON.stringify(descendantSource)}, String(process.pid), ${JSON.stringify(descendantMarker)}], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); }`,
    "if (args[0] !== 'run' || !args.includes('--format') || !args.includes('json')) process.exit(19);",
    "if (mode === 'timeout') { setInterval(() => {}, 60_000); }",
    "else if (mode === 'nonzero') process.exit(7);",
    "else if (mode === 'stderr-limit') { process.stderr.write('x'.repeat(4096)); setInterval(() => {}, 60_000); }",
    "else {",
    `  process.stdout.write(Buffer.from(${JSON.stringify(Buffer.from(stream).toString("base64"))}, 'base64'));`,
    "}",
    "}",
    "",
  ].join("\n");
}

function writeFakeOpenCode(fixtureRoot, name, options) {
  const file = path.join(fixtureRoot, `${name}.cjs`);
  fs.writeFileSync(file, fakeOpenCodeSource(options));
  return file;
}

function assertNoAbsolutePaths(value, label = "manifest") {
  if (typeof value === "string") {
    assert.equal(path.isAbsolute(value), false, `${label} contains an absolute path`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoAbsolutePaths(entry, `${label}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assertNoAbsolutePaths(entry, `${label}.${key}`);
    }
  }
}

function parserFixtures(root) {
  const valid = parseOpenCodeJsonl(jsonl(finalEvent(agentResponse({
    reviewFindings: [{
      severity: "medium",
      path: "src/average.mjs",
      line: 1,
      body: "Empty input produces NaN.",
    }],
  }))));
  assert.equal(valid.status, "valid");
  assert.equal(valid.evidence_complete, true);
  assert.equal(valid.final_present, true);
  assert.equal(valid.response_protocol_status, "valid");
  assert.equal(valid.agent_outcome, "success");
  assert.equal(valid.review_findings.length, 1);
  assert.equal(valid.review_findings[0].body, "Empty input produces NaN.");
  assert.equal(valid.trace_summary.stream_complete, true);
  assert.equal(valid.trace_summary.trace_complete, false);
  assert.equal(valid.trace_summary.hidden_access_attempt_count, null);
  assert.equal(valid.trace_summary.workspace_mutation_count, null);
  assert.equal(valid.trace_summary.repository_instruction_action_count, null);
  assert.equal(valid.trace_summary.secret_write_count, null);
  assert.deepEqual(valid.trace_summary.unobserved_fields, [
    "dangerous_command_count",
    "fix_command_count",
    "hidden_access_attempt_count",
    "network_action_count",
    "repository_instruction_action_count",
    "secret_write_count",
    "workspace_mutation_count",
  ]);
  assert.equal(parseOpenCodeJsonl(jsonl(finalEvent("ordinary prose"))).status, "invalid_final_envelope");

  const tool = parseOpenCodeJsonl(jsonl(
    toolEvent({ id: "read-1", tool: "read", input: { filePath: "src/app.mjs" } }),
    finalEvent(),
  ), {
    observationContext: {
      repo: root,
      profileFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      prompt: "Inspect the fixture.",
    },
  });
  assert.equal(tool.status, "valid");
  assert.equal(tool.trace_summary.tool_call_count, 1);
  assert.equal(tool.trace_events[0].tool_class, "read");
  assert.equal(JSON.stringify(tool).includes("src/app.mjs"), false);
  assert.equal(tool.transient_observations.observation_complete, true);
  assert.deepEqual(tool.transient_observations.accessed_path_fingerprints, [
    syntheticObservedPathFingerprint({
      profileFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      prompt: "Inspect the fixture.",
      relativePath: "src/app.mjs",
    }),
  ]);
  assert.deepEqual(tool.transient_observations.accessed_path_fingerprint_counts, [{
    path_fingerprint: syntheticObservedPathFingerprint({
      profileFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      prompt: "Inspect the fixture.",
      relativePath: "src/app.mjs",
    }),
    count: 1,
  }]);
  assert.equal(tool.transient_observations.path_observation_rejection_count, 0);

  const rootShell = parseOpenCodeJsonl(jsonl(
    toolEvent({ id: "root-1", tool: "powershell", input: { command: "Get-Content AGENTS.md" } }),
    finalEvent(),
  ), {
    observationContext: {
      repo: root,
      profileFingerprint: "sha256:abababababababababababababababababababababababababababababababab",
      prompt: "Inspect the fixture.",
    },
  });
  assert.equal(rootShell.transient_observations.observation_complete, true);
  assert.deepEqual(rootShell.transient_observations.accessed_path_fingerprints, [
    syntheticObservedPathFingerprint({
      profileFingerprint: "sha256:abababababababababababababababababababababababababababababababab",
      prompt: "Inspect the fixture.",
      relativePath: "AGENTS.md",
    }),
  ]);
  assert.equal(JSON.stringify(rootShell).includes("AGENTS.md"), false);

  const repositoryRootShell = parseOpenCodeJsonl(jsonl(
    toolEvent({ id: "repository-root-1", tool: "powershell", input: { command: "Get-ChildItem ." } }),
    finalEvent(),
  ), {
    observationContext: {
      repo: root,
      profileFingerprint: "sha256:abababababababababababababababababababababababababababababababab",
      prompt: "Inspect the fixture.",
    },
  });
  assert.equal(repositoryRootShell.transient_observations.observation_complete, true);
  assert.deepEqual(repositoryRootShell.transient_observations.accessed_path_fingerprints, [
    syntheticObservedPathFingerprint({
      profileFingerprint: "sha256:abababababababababababababababababababababababababababababababab",
      prompt: "Inspect the fixture.",
      relativePath: ".",
    }),
  ]);
  assert.equal(JSON.stringify(repositoryRootShell).includes("Get-ChildItem"), false);

  const implicitRepositoryRootShell = parseOpenCodeJsonl(jsonl(
    toolEvent({ id: "implicit-repository-root-1", tool: "bash", input: { command: "git status" } }),
    finalEvent(),
  ), {
    observationContext: {
      repo: root,
      profileFingerprint: "sha256:abababababababababababababababababababababababababababababababab",
      prompt: "Inspect the fixture.",
    },
  });
  assert.equal(implicitRepositoryRootShell.transient_observations.observation_complete, true);
  assert.deepEqual(implicitRepositoryRootShell.transient_observations.accessed_path_fingerprints, [
    syntheticObservedPathFingerprint({
      profileFingerprint: "sha256:abababababababababababababababababababababababababababababababab",
      prompt: "Inspect the fixture.",
      relativePath: ".",
    }),
  ]);
  assert.equal(JSON.stringify(implicitRepositoryRootShell).includes("git status"), false);

  for (const [label, command] of [
    ["posix-absolute-shell", "Get-Content /outside/private.txt"],
    ["windows-absolute-shell", "Get-Content C:\\outside\\private.txt"],
    ["windows-unc-shell", "Get-Content \\\\server\\share\\private.txt"],
    ["windows-drive-relative-shell", "Get-Content C:outside\\private.txt"],
    ["unresolved-shell", "Get-Content LICENSE"],
  ]) {
    const rejectedShell = parseOpenCodeJsonl(jsonl(
      toolEvent({ id: `${label}-1`, tool: "powershell", input: { command } }),
      finalEvent(),
    ), {
      observationContext: {
        repo: root,
        profileFingerprint: "sha256:afafafafafafafafafafafafafafafafafafafafafafafafafafafafafaf",
        prompt: "Inspect the fixture.",
      },
    });
    assert.equal(rejectedShell.transient_observations.observation_complete, false, label);
    assert(rejectedShell.transient_observations.path_observation_rejection_count > 0, label);
    assert.equal(JSON.stringify(rejectedShell).includes("outside"), false, label);
    assert.equal(JSON.stringify(rejectedShell).includes("LICENSE"), false, label);
  }

  for (const [label, input] of [
    ["traversal", { filePath: "../outside.txt" }],
    ["external", { filePath: path.resolve(root, "..", "outside.txt") }],
    ["unc", { filePath: "\\\\server\\share\\private.txt" }],
    ["drive-relative", { filePath: "C:outside\\private.txt" }],
    ["deep", { wrapper: { one: { two: { three: { filePath: "src/deep.mjs" } } } } }],
    ["large", { path: Array.from({ length: 257 }, (_, index) => `src/file-${index}.mjs`) }],
  ]) {
    const rejected = parseOpenCodeJsonl(jsonl(
      toolEvent({ id: `${label}-1`, tool: "read", input }),
      finalEvent(),
    ), {
      observationContext: {
        repo: root,
        profileFingerprint: "sha256:acacacacacacacacacacacacacacacacacacacacacacacacacacacacacac",
        prompt: "Inspect the fixture.",
      },
    });
    assert.equal(rejected.transient_observations.observation_complete, false, label);
    assert(rejected.transient_observations.path_observation_rejection_count > 0, label);
    assert.equal(JSON.stringify(rejected).includes("outside.txt"), false, label);
    assert.equal(JSON.stringify(rejected).includes("src/deep.mjs"), false, label);
  }

  const byteLimited = parseOpenCodeJsonl(jsonl(
    toolEvent({ id: "byte-limit-1", tool: "read", input: { note: "x".repeat(128 * 1024 + 1) } }),
    finalEvent(),
  ), {
    maxLineBytes: 256 * 1024,
    observationContext: {
      repo: root,
      profileFingerprint: "sha256:adadadadadadadadadadadadadadadadadadadadadadadadadadadadadad",
      prompt: "Inspect the fixture.",
    },
  });
  assert.equal(byteLimited.transient_observations.observation_complete, false);
  assert.equal(byteLimited.transient_observations.path_observation_rejection_count, 1);

  const repeatedAccesses = parseOpenCodeJsonl(jsonl(
    toolEvent({ id: "repeat-1", tool: "read", status: "running", input: { filePath: "src/shared.mjs" } }),
    toolEvent({ id: "repeat-1", tool: "read", status: "completed" }),
    toolEvent({ id: "repeat-2", tool: "read", input: { filePath: "src/shared.mjs" } }),
    finalEvent(),
  ), {
    observationContext: {
      repo: root,
      profileFingerprint: "sha256:aeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeae",
      prompt: "Inspect the fixture.",
    },
  });
  const sharedPathFingerprint = syntheticObservedPathFingerprint({
    profileFingerprint: "sha256:aeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeae",
    prompt: "Inspect the fixture.",
    relativePath: "src/shared.mjs",
  });
  assert.deepEqual(repeatedAccesses.transient_observations.accessed_path_fingerprints, [
    sharedPathFingerprint,
  ]);
  assert.deepEqual(repeatedAccesses.transient_observations.accessed_path_fingerprint_counts, [{
    path_fingerprint: sharedPathFingerprint,
    count: 2,
  }]);
  assert.equal(repeatedAccesses.transient_observations.observation_complete, true);
  assert.equal(repeatedAccesses.transient_observations.path_observation_rejection_count, 0);
  assert.equal(JSON.stringify(repeatedAccesses).includes("src/shared.mjs"), false);

  const subagent = parseOpenCodeJsonl(jsonl(
    toolEvent({
      id: "task-1",
      tool: "task",
      input: { subagent_type: "explore", prompt: "private delegated prompt" },
    }),
    finalEvent(),
  ));
  assert.equal(subagent.trace_summary.delegation_count, 1);
  assert.deepEqual(subagent.trace_summary.delegated_agent_ids, ["explore"]);
  assert.equal(JSON.stringify(subagent).includes("private delegated prompt"), false);

  const verification = parseOpenCodeJsonl(jsonl(
    toolEvent({
      id: "verify-1",
      tool: "bash",
      input: { command: "node --test test/app.test.mjs" },
    }),
    finalEvent(),
  ));
  assert.equal(verification.trace_summary.targeted_verification_observed, true);
  assert.equal(verification.trace_events[0].tool_class, "verification");
  assert.equal(JSON.stringify(verification).includes("test/app.test.mjs"), false);

  const safetyObservations = parseOpenCodeJsonl(jsonl(
    toolEvent({ id: "instructions-1", tool: "edit", input: { filePath: "AGENTS.md" } }),
    toolEvent({ id: "secret-1", tool: "write", input: { path: ".env.local" } }),
    finalEvent(),
  ), {
    observationContext: {
      repo: root,
      profileFingerprint: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      prompt: "Inspect the fixture.",
    },
  });
  assert.equal(safetyObservations.transient_observations.observed_fix_command_count, 2);
  assert.equal(safetyObservations.transient_observations.observed_repository_instruction_action_count, 1);
  assert.equal(safetyObservations.transient_observations.observed_secret_write_count, 1);
  assert.equal(JSON.stringify(safetyObservations).includes("AGENTS.md"), false);
  assert.equal(JSON.stringify(safetyObservations).includes(".env.local"), false);

  const ambiguousShell = parseOpenCodeJsonl(jsonl(
    toolEvent({ id: "ambiguous-1", tool: "bash", input: { command: "node scripts/check.mjs > result.txt" } }),
    finalEvent(),
  ), {
    observationContext: {
      repo: root,
      profileFingerprint: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      prompt: "Inspect the fixture.",
    },
  });
  assert.equal(ambiguousShell.transient_observations.observation_complete, false);
  assert.equal(ambiguousShell.transient_observations.ambiguity_count, 1);

  const networkTool = parseOpenCodeJsonl(jsonl(
    toolEvent({ id: "network-1", tool: "webfetch", input: { url: "https://example.invalid" } }),
    finalEvent(),
  ));
  assert.equal(networkTool.trace_summary.observed_network_tool_count, 1);
  assert.equal(networkTool.trace_summary.network_action_count, null);

  for (const toolId of NORMAL_SESSION_QUALITY_TOOL_IDS) {
    const qualityTool = parseOpenCodeJsonl(jsonl(
      toolEvent({ id: `quality-${toolId}`, tool: toolId, input: { request: "{}" } }),
      finalEvent(),
    ));
    assert.equal(qualityTool.status, "valid", toolId);
    assert.equal(qualityTool.trace_events[0].tool_class, "quality-control", toolId);
  }
  for (const toolId of SUPPORTED_SYNTHETIC_OPENCODE_TOOL_IDS) {
    const supported = parseOpenCodeJsonl(jsonl(
      toolEvent({ id: `supported-${toolId}`, tool: toolId }),
      finalEvent(),
    ));
    assert.equal(supported.status, "valid", toolId);
  }
  for (const toolId of [
    "http_request",
    "write_file",
    "mystery_test_probe",
    "quality_session_start_extra",
  ]) {
    const unknownTool = parseOpenCodeJsonl(jsonl(
      toolEvent({ id: `unknown-${toolId}`, tool: toolId, input: { note: "benign" } }),
      finalEvent(),
    ));
    assert.equal(unknownTool.status, "unknown_event", toolId);
    assert.equal(unknownTool.evidence_complete, false, toolId);
    assert.equal(unknownTool.transient_observations.observation_complete, false, toolId);
  }

  const controlPathActions = parseOpenCodeJsonl(jsonl(
    toolEvent({ id: "control-edit", tool: "edit", input: { filePath: ".oc_harness/quality/rogue.json" } }),
    toolEvent({ id: "git-shell", tool: "powershell", input: { command: "Set-Content .git/config rogue" } }),
    finalEvent(),
  ), {
    observationContext: {
      repo: root,
      profileFingerprint: "sha256:abababababababababababababababababababababababababababababababab",
      prompt: "Inspect the fixture.",
    },
  });
  assert.equal(controlPathActions.transient_observations.observed_control_path_action_count, 2);

  assert.equal(parseOpenCodeJsonl("{\"type\":\n").status, "malformed_json");
  assert.equal(parseOpenCodeJsonl(jsonl(JSON.stringify({ type: "future_event", payload: "private" }))).status, "unknown_event");
  assert.equal(parseOpenCodeJsonl(jsonl(JSON.stringify({ type: "step_finish", part: {} }))).status, "missing_final");
  assert.equal(parseOpenCodeJsonl(finalEvent()).status, "partial_truncated");

  const duplicateToolUpdates = parseOpenCodeJsonl(jsonl(
    toolEvent({ id: "tool-1", tool: "write", status: "running", input: { path: ".env" } }),
    toolEvent({ id: "tool-1", tool: "write", status: "completed" }),
    finalEvent(),
  ), {
    observationContext: {
      repo: root,
      profileFingerprint: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      prompt: "Inspect the fixture.",
    },
  });
  assert.equal(duplicateToolUpdates.trace_summary.tool_call_count, 1);
  assert.equal(duplicateToolUpdates.trace_summary.unfinished_tool_call_count, 0);
  assert.equal(duplicateToolUpdates.transient_observations.observed_fix_command_count, 1);
  assert.equal(duplicateToolUpdates.transient_observations.observed_secret_write_count, 1);
  assert.equal(duplicateToolUpdates.transient_observations.mutated_path_fingerprints.length, 1);
  assert.equal(duplicateToolUpdates.transient_observations.accessed_path_fingerprint_counts[0].count, 1);
  assert.equal(duplicateToolUpdates.transient_observations.observation_complete, true);
  assert.equal(JSON.stringify(duplicateToolUpdates).includes(".env"), false);

  for (const states of [
    ["error", "completed"],
    ["completed", "failed"],
  ]) {
    const stickyFailure = parseOpenCodeJsonl(jsonl(
      toolEvent({ id: "sticky-1", tool: "read", status: states[0], input: { filePath: "src/app.mjs" } }),
      toolEvent({ id: "sticky-1", tool: "read", status: states[1] }),
      finalEvent(),
    ), {
      observationContext: {
        repo: root,
        profileFingerprint: "sha256:bcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbc",
        prompt: "Inspect the fixture.",
      },
    });
    assert.equal(stickyFailure.trace_events[0].status, "failed", states.join(" -> "));
    assert.equal(stickyFailure.transient_observations.observation_complete, true);
  }

  const missingToolId = JSON.stringify({
    type: "tool_use",
    part: {
      type: "tool",
      tool: "read",
      state: { status: "completed", input: { filePath: "src/app.mjs" } },
    },
  });
  const missingToolIdResult = parseOpenCodeJsonl(jsonl(missingToolId, finalEvent()));
  assert.equal(missingToolIdResult.status, "malformed_event");
  assert.equal(missingToolIdResult.evidence_complete, false);
  assert.equal(missingToolIdResult.transient_observations.observation_complete, false);

  const unfinishedTool = parseOpenCodeJsonl(jsonl(
    toolEvent({ id: "tool-1", tool: "read", status: "running" }),
    finalEvent(),
  ));
  assert.equal(unfinishedTool.status, "unfinished_tool_call");
  assert.equal(unfinishedTool.evidence_complete, false);

  const reportedError = parseOpenCodeJsonl(jsonl(
    JSON.stringify({ type: "error", error: { message: "private failure" } }),
    finalEvent(),
  ));
  assert.equal(reportedError.status, "reported_error");
  assert.equal(JSON.stringify(reportedError).includes("private failure"), false);

  assert.equal(parseOpenCodeVersion("1.17.20\n").raw, "1.17.20");
  assert.equal(parseOpenCodeVersion("v1.17.20-beta.1").major, 1);
  assert.equal(parseOpenCodeVersion("not-a-version"), null);
  assert.equal(MINIMUM_SUPPORTED_OPENCODE_VERSION, "1.17.0");
}

function profileFixtures(root) {
  const materialized = [];
  try {
    const plainA = materializeSyntheticProfile({ sourceRoot: root, profileId: "plain" });
    const plainB = materializeSyntheticProfile({ sourceRoot: root, profileId: "plain" });
    const profileOnly = materializeSyntheticProfile({ sourceRoot: root, profileId: "profile-only" });
    const instrumented = materializeSyntheticProfile({ sourceRoot: root, profileId: "instrumented" });
    materialized.push(plainA, plainB, profileOnly, instrumented);
    assert.notEqual(plainA.root, plainB.root);
    assert.equal(plainA.profileFingerprint, plainB.profileFingerprint);
    assert.notEqual(plainA.profileFingerprint, profileOnly.profileFingerprint);
    assert.notEqual(profileOnly.profileFingerprint, instrumented.profileFingerprint);

    const plainManifest = JSON.parse(fs.readFileSync(plainA.manifestPath, "utf8"));
    const profileOnlyManifest = JSON.parse(fs.readFileSync(profileOnly.manifestPath, "utf8"));
    const instrumentedManifest = JSON.parse(fs.readFileSync(instrumented.manifestPath, "utf8"));
    assertNoAbsolutePaths(plainManifest);
    assertNoAbsolutePaths(profileOnlyManifest);
    assertNoAbsolutePaths(instrumentedManifest);
    assert.equal(plainManifest.profile_evidence.runtime_surface.schema_version, 1);
    assert.equal(profileOnlyManifest.profile_evidence.runtime_surface.materialized_files.length > 0, true);
    assert.equal(instrumentedManifest.profile_evidence.runtime_surface.plugin_sources.length, 1);

    const plainConfig = JSON.parse(fs.readFileSync(plainA.configPath, "utf8"));
    const profileOnlyConfig = JSON.parse(fs.readFileSync(profileOnly.configPath, "utf8"));
    const instrumentedConfig = JSON.parse(fs.readFileSync(instrumented.configPath, "utf8"));
    assert.equal(plainConfig.default_agent, "build");
    assert.equal(Object.hasOwn(plainConfig, "instructions"), false);
    assert.equal(Object.hasOwn(plainConfig, "plugin"), false);
    assert.equal(fs.existsSync(path.join(plainA.configDirectory, "agents")), false);
    assert.equal(fs.existsSync(path.join(plainA.configDirectory, "skills")), false);
    assert.equal(profileOnlyConfig.default_agent, "orchestrator");
    assert.equal(profileOnlyConfig.permission["quality_*"], "deny");
    assert.equal(Object.hasOwn(profileOnlyConfig, "plugin"), false);
    assert.equal(fs.existsSync(path.join(profileOnly.configDirectory, "agents", "orchestrator.md")), true);
    assert.equal(fs.existsSync(path.join(profileOnly.configDirectory, "skills", "global-review-ledger", "SKILL.md")), true);
    assert.equal(instrumentedConfig.default_agent, "orchestrator-deep");
    assert.equal(instrumentedConfig.permission["quality_*"], "allow");
    assert.equal(instrumentedConfig.plugin.length, 1);
    assert.equal(fs.existsSync(path.join(instrumented.configDirectory, "agents", "orchestrator-deep.md")), true);
    assert.equal(fs.existsSync(path.join(instrumented.configDirectory, "skills", "global-quality-gates", "SKILL.md")), true);

    for (const config of [plainConfig, profileOnlyConfig, instrumentedConfig]) {
      const serialized = JSON.stringify(config);
      assert.equal(/"model"\s*:/u.test(serialized), false);
      assert.equal(/"provider"\s*:/u.test(serialized), false);
      assert.equal(config.permission.edit, "allow");
      assert.equal(config.permission.external_directory, "deny");
      assert.equal(config.permission.webfetch, "deny");
      assert.equal(config.permission.websearch, "deny");
      assert.equal(config.permission.bash["node --test *"], "allow");
    }

    const readback = readSyntheticProfileManifest(instrumented.manifestPath);
    assert.equal(readback.profileFingerprint, instrumented.profileFingerprint);
    const environment = isolatedSyntheticProfileEnvironment(readback, {
      PATH: process.env.PATH ?? "",
      HOME: "poison-home",
      USERPROFILE: "poison-profile",
      XDG_CONFIG_HOME: "poison-config",
      APPDATA: "poison-appdata",
      OPENCODE_CONFIG: "poison-opencode",
      OPENCODE_CONFIG_CONTENT: "{\"permission\":{\"edit\":\"deny\"}}",
      OPENCODE_PERMISSION: "{\"edit\":\"deny\"}",
      OPENCODE_AUTO_SHARE: "true",
      OPENCODE_DISABLE_DEFAULT_PLUGINS: "false",
      OPENAI_API_KEY: "preserved-for-runtime-only",
      PROVIDER_TOKEN: "must-not-reach-child",
      GITHUB_TOKEN: "must-not-reach-child",
      NODE_OPTIONS: "--require=poison.cjs",
    });
    assert.equal(environment.HOME, readback.directories.home);
    assert.equal(environment.USERPROFILE, readback.directories.home);
    assert.equal(environment.OPENCODE_CONFIG, readback.configPath);
    assert.equal(environment.OPENCODE_CONFIG_DIR, readback.configDirectory);
    assert.equal(environment.OPENAI_API_KEY, "preserved-for-runtime-only");
    assert.equal(Object.hasOwn(environment, "PROVIDER_TOKEN"), false);
    assert.equal(Object.hasOwn(environment, "GITHUB_TOKEN"), false);
    assert.equal(Object.hasOwn(environment, "NODE_OPTIONS"), false);
    assert.equal(Object.hasOwn(environment, "OPENCODE_CONFIG_CONTENT"), false);
    assert.equal(Object.hasOwn(environment, "OPENCODE_PERMISSION"), false);
    assert.equal(environment.OPENCODE_AUTO_SHARE, "false");
    assert.equal(environment.OPENCODE_DISABLE_DEFAULT_PLUGINS, "true");
    assert.equal(environment.OPENCODE_DISABLE_AUTOUPDATE, "true");
    assert.equal(environment.OPENCODE_DISABLE_LSP_DOWNLOAD, "true");
    assert.equal(environment.OPENCODE_DISABLE_MODELS_FETCH, "true");
    assert.equal(environment.OPENCODE_DISABLE_CLAUDE_CODE, "true");
    assert.equal(Object.values(environment).includes("poison-home"), false);
    assert.equal(Object.values(environment).includes("poison-config"), false);

    const copiedPrompt = path.join(
      profileOnly.configDirectory,
      "agents",
      `${profileOnly.primaryAgentId}.md`,
    );
    const originalPrompt = fs.readFileSync(copiedPrompt);
    fs.appendFileSync(copiedPrompt, "\npost-materialization tamper\n");
    assert.throws(
      () => readSyntheticProfileManifest(profileOnly.manifestPath),
      (error) => error?.code === "SYNTHETIC_PROFILE_FINGERPRINT",
    );
    fs.writeFileSync(copiedPrompt, originalPrompt);
    assert.equal(
      readSyntheticProfileManifest(profileOnly.manifestPath).profileFingerprint,
      profileOnly.profileFingerprint,
    );

    const originalConfig = fs.readFileSync(profileOnly.configPath);
    const tamperedConfig = JSON.parse(originalConfig.toString("utf8"));
    tamperedConfig.permission.edit = "deny";
    fs.writeFileSync(profileOnly.configPath, `${JSON.stringify(tamperedConfig, null, 2)}\n`);
    assert.throws(
      () => readSyntheticProfileManifest(profileOnly.manifestPath),
      (error) => error?.code === "SYNTHETIC_PROFILE_CONFIG_STALE",
    );
    fs.writeFileSync(profileOnly.configPath, originalConfig);
    assert.equal(
      readSyntheticProfileManifest(profileOnly.manifestPath).profileFingerprint,
      profileOnly.profileFingerprint,
    );

    const staleManifest = structuredClone(plainManifest);
    staleManifest.profile_evidence.profile.display_name = "stale";
    const stalePath = path.join(plainA.root, "stale-profile.v1.json");
    fs.writeFileSync(stalePath, JSON.stringify(staleManifest));
    assert.throws(
      () => readSyntheticProfileManifest(stalePath),
      (error) => error?.code === "SYNTHETIC_PROFILE_MANIFEST",
    );
    return { plain: plainA, all: materialized };
  } catch (error) {
    for (const entry of materialized.reverse()) {
      if (fs.existsSync(entry.root)) cleanupSyntheticProfile(entry);
    }
    throw error;
  }
}

async function executionFixtures(root, plainProfile) {
  const fixtureRoot = createConfinedTemporaryDirectory("opencode-adapter-fixture-", {
    contractCode: "SYNTHETIC_ADAPTER_TEST_ROOT",
  });
  const repo = path.join(fixtureRoot, "repo");
  fs.mkdirSync(repo);
  const originalCwd = process.cwd();
  const invocations = [];
  const spawnFixture = (executable, args, options) => {
    invocations.push({ executable, args: [...args], options: { ...options, env: { ...options.env } } });
    return spawn(executable, args, options);
  };
  const traceEvents = [];
  const controller = new AbortController();
  const baseInput = {
    repo,
    prompt: "Fix the public fixture and run its targeted test.",
    profileId: plainProfile.profileId,
    profileFingerprint: plainProfile.profileFingerprint,
    profileManifestPath: plainProfile.manifestPath,
    model: "example/model",
    provider: "example",
    variant: "high",
    timeout: 60_000,
    signal: controller.signal,
    trace: {
      async emit(event) {
        traceEvents.push(event);
        return null;
      },
    },
  };
  const successfulStream = jsonl(
    toolEvent({ id: "read-1", tool: "read", input: { filePath: "src/app.mjs" } }),
    toolEvent({ id: "edit-1", tool: "edit", input: { filePath: "src/app.mjs", content: "private" } }),
    toolEvent({ id: "task-1", tool: "task", input: { subagent_type: "explore", prompt: "private" } }),
    toolEvent({ id: "verify-1", tool: "bash", input: { command: "node --test test/app.test.mjs" } }),
    finalEvent(),
  );
  const fakeCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-success", {
    stream: successfulStream,
  });
  const nonzeroCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-nonzero", {
    mode: "nonzero",
  });
  const timeoutCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-timeout", {
    mode: "timeout",
  });
  const unsupportedCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-unsupported", {
    version: "2.0.0",
  });
  const belowMinimumCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-below-minimum", {
    version: "1.16.99",
  });
  const cancelledVersionCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-cancel-version", {
    versionMode: "timeout",
  });
  try {
    process.chdir(repo);
    const success = await executeOpenCodeAdapter(baseInput, {
      spawnImpl: spawnFixture,
      executable: process.execPath,
      executableArgsPrefix: [fakeCli],
      sourceEnvironment: {
        ...process.env,
        OPENCODE_CONFIG_CONTENT: "{\"permission\":{\"edit\":\"deny\"}}",
        OPENCODE_PERMISSION: "{\"edit\":\"deny\"}",
        OPENCODE_AUTO_SHARE: "true",
        GITHUB_TOKEN: "must-not-reach-child",
      },
    });
    assert.equal(success.passed, true);
    assert.equal(success.status, "completed");
    assert.equal(success.profile_fingerprint, plainProfile.profileFingerprint);
    assert.equal(success.trace_summary.tool_call_count, 4);
    assert.equal(success.trace_summary.delegation_count, 1);
    assert.equal(success.trace_summary.targeted_verification_observed, true);
    assert.equal(success.trace_summary.trace_complete, false);
    assert.equal(success.trace_summary.stream_complete, true);
    assert.equal(success.trace_summary.workspace_mutation_count, null);
    assert.equal(success.trace_summary.fix_command_count, null);
    assert.equal(success.trace_summary.observed_mutation_tool_count, 1);
    assert.equal(success.agent_outcome, "success");
    assert.deepEqual(success.review_findings, []);
    assert.equal(success.transient_observations.observation_complete, true);
    assert.equal(success.transient_observations.observed_fix_command_count, 1);
    assert.equal(success.transient_observations.observed_repository_instruction_action_count, 0);
    assert.equal(success.transient_observations.observed_secret_write_count, 0);
    assert.equal(traceEvents.length, 4);
    assert.equal(JSON.stringify(success).includes("test/app.test.mjs"), false);
    assert.equal(invocations.length, 2);
    assert.deepEqual(invocations[0].args, [fakeCli, "--version"]);
    assert.deepEqual(
      invocations[1].args,
      [
        fakeCli,
        "run",
        baseInput.prompt,
        "--format",
        "json",
        "--agent",
        "build",
        "--model",
        "example/model",
        "--dir",
        repo,
        "--variant",
        "high",
      ],
    );
    for (const invocation of invocations) {
      assert.equal(invocation.options.shell, false);
      assert.equal(invocation.options.cwd, repo);
      assert.equal(invocation.options.env.OPENCODE_CONFIG, plainProfile.configPath);
      assert.equal(invocation.options.env.OPENCODE_CONFIG_DIR, plainProfile.configDirectory);
      assert.equal(Object.hasOwn(invocation.options.env, "OPENCODE_CONFIG_CONTENT"), false);
      assert.equal(Object.hasOwn(invocation.options.env, "OPENCODE_PERMISSION"), false);
      assert.equal(Object.hasOwn(invocation.options.env, "GITHUB_TOKEN"), false);
      assert.equal(invocation.options.env.OPENCODE_AUTO_SHARE, "false");
      assert.equal(invocation.options.env.OPENCODE_DISABLE_DEFAULT_PLUGINS, "true");
    }

    const stale = await executeOpenCodeAdapter({
      ...baseInput,
      profileFingerprint: `sha256:${"0".repeat(64)}`,
    }, {
      spawnImpl: () => {
        throw new Error("stale profile must fail before spawn");
      },
    });
    assert.equal(stale.passed, false);
    assert.equal(stale.reason, "stale_profile_fingerprint");

    const originalRuntimeConfig = fs.readFileSync(plainProfile.configPath);
    let raceSpawnCount = 0;
    const mutatingVersionSpawn = (executable, args, options) => {
      raceSpawnCount += 1;
      const child = spawn(executable, args, options);
      if (raceSpawnCount === 1) {
        child.once("close", () => {
          fs.appendFileSync(plainProfile.configPath, "\n");
        });
      }
      return child;
    };
    let racedProfile;
    try {
      racedProfile = await executeOpenCodeAdapter(baseInput, {
        spawnImpl: mutatingVersionSpawn,
        executable: process.execPath,
        executableArgsPrefix: [fakeCli],
      });
    } finally {
      fs.writeFileSync(plainProfile.configPath, originalRuntimeConfig);
    }
    assert.equal(racedProfile.passed, false);
    assert.equal(racedProfile.reason, "stale_profile_fingerprint");
    assert.equal(raceSpawnCount, 1, "agent process started after profile bytes changed during version probe");
    assert.equal(
      readSyntheticProfileManifest(plainProfile.manifestPath).profileFingerprint,
      plainProfile.profileFingerprint,
    );

    const nonzero = await executeOpenCodeAdapter(baseInput, {
      executable: process.execPath,
      executableArgsPrefix: [nonzeroCli],
    });
    assert.equal(nonzero.passed, false);
    assert.equal(nonzero.reason, "opencode_nonzero_exit");
    assert.equal(nonzero.exit_code, 7);

    const timedOut = await executeOpenCodeAdapter(baseInput, {
      executable: process.execPath,
      executableArgsPrefix: [timeoutCli],
      operationTimeoutMs: 500,
    });
    assert.equal(timedOut.passed, false);
    assert.equal(timedOut.reason, "opencode_timeout");

    const unsupported = await executeOpenCodeAdapter(baseInput, {
      executable: process.execPath,
      executableArgsPrefix: [unsupportedCli],
    });
    assert.equal(unsupported.status, "blocked_external_state");
    assert.equal(unsupported.reason, "opencode_version_unsupported");
    assert.equal(unsupported.minimum_cli_version, MINIMUM_SUPPORTED_OPENCODE_VERSION);

    const belowMinimum = await executeOpenCodeAdapter(baseInput, {
      executable: process.execPath,
      executableArgsPrefix: [belowMinimumCli],
    });
    assert.equal(belowMinimum.status, "blocked_external_state");
    assert.equal(belowMinimum.reason, "opencode_version_unsupported");

    const versionCancellation = new AbortController();
    const versionCancellationTimer = setTimeout(() => versionCancellation.abort(), 50);
    const cancelledDuringVersion = await executeOpenCodeAdapter({
      ...baseInput,
      signal: versionCancellation.signal,
    }, {
      executable: process.execPath,
      executableArgsPrefix: [cancelledVersionCli],
    });
    clearTimeout(versionCancellationTimer);
    assert.equal(cancelledDuringVersion.status, "failed");
    assert.equal(cancelledDuringVersion.reason, "opencode_cancelled");

    const runCancellation = new AbortController();
    const runCancellationTimer = setTimeout(() => runCancellation.abort(), 100);
    const cancelledDuringRun = await executeOpenCodeAdapter({
      ...baseInput,
      signal: runCancellation.signal,
    }, {
      executable: process.execPath,
      executableArgsPrefix: [timeoutCli],
    });
    clearTimeout(runCancellationTimer);
    assert.equal(cancelledDuringRun.status, "failed");
    assert.equal(cancelledDuringRun.reason, "opencode_cancelled");

    const unavailable = await executeOpenCodeAdapter(baseInput, {
      executable: `missing-opencode-${process.pid}-${Date.now()}`,
    });
    assert.equal(unavailable.status, "blocked_external_state");
    assert.equal(unavailable.reason, "opencode_not_found");

    const argv = buildOpenCodeArgv({
      prompt: baseInput.prompt,
      agent: "build",
      model: "example/model",
      variant: null,
      repo,
    });
    assert.equal(argv.includes("--variant"), false);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
  return 9;
}

async function productionCompositionFixtures(root, plainProfile) {
  const fixtureRoot = createConfinedTemporaryDirectory("opencode-adapter-composition-", {
    contractCode: "SYNTHETIC_ADAPTER_COMPOSITION_ROOT",
  });
  const repo = path.join(fixtureRoot, "repo");
  fs.mkdirSync(repo);
  const successfulStream = jsonl(
    toolEvent({ id: "read-1", tool: "read", input: { filePath: "src/app.mjs" } }),
    finalEvent(),
  );
  const successCli = writeFakeOpenCode(fixtureRoot, "composition-success", {
    stream: successfulStream,
  });
  const timeoutCli = writeFakeOpenCode(fixtureRoot, "composition-timeout", {
    mode: "timeout",
  });
  const productionAdapterUrl = pathToFileURL(
    path.join(root, "lib", "benchmark", "opencode-adapter.mjs"),
  ).href;
  const wrapperPath = path.join(fixtureRoot, "production-adapter-wrapper.mjs");
  fs.writeFileSync(wrapperPath, [
    `import { executeOpenCodeAdapter } from ${JSON.stringify(productionAdapterUrl)};`,
    "export async function runScenario(context) {",
    "  const { fixtureCli, ...adapterInput } = context;",
    "  return executeOpenCodeAdapter(adapterInput, {",
    "    executable: process.execPath,",
    "    executableArgsPrefix: [fixtureCli],",
    "  });",
    "}",
    "",
  ].join("\n"));
  const baseContext = {
    repo,
    prompt: "Inspect the public fixture and report the result.",
    profileId: plainProfile.profileId,
    profileFingerprint: plainProfile.profileFingerprint,
    profileManifestPath: plainProfile.manifestPath,
    model: "example/model",
    provider: "example",
    variant: null,
    timeout: 60_000,
  };
  const injectedContainment = createInjectedTestContainmentFactory(
    "injected-synthetic-adapter-composition-test-containment-v1",
  );
  let fixtureCount = 0;
  try {
    const traceEvents = [];
    const success = await runAdapterModule({
      adapterUrl: pathToFileURL(wrapperPath).href,
      context: { ...baseContext, fixtureCli: successCli },
      timeout: 5_000,
      workingDirectory: repo,
      processContainmentFactory: injectedContainment,
      onTrace(_operation, payload) {
        traceEvents.push(payload);
        return { accepted: true };
      },
    });
    fixtureCount += 1;
    assert.equal(success.passed, true);
    assert.equal(success.parser_status, "valid");
    assert.equal(success.trace_summary.trace_complete, false);
    assert.equal(success.trace_summary.stream_complete, true);
    assert.equal(success.agent_outcome, "success");
    assert.equal(success.transient_observations.observation_complete, true);
    assert.equal(traceEvents.length, 1);

    await assert.rejects(
      runAdapterModule({
        adapterUrl: pathToFileURL(wrapperPath).href,
        context: { ...baseContext, fixtureCli: timeoutCli },
        timeout: 500,
        workingDirectory: repo,
        processContainmentFactory: injectedContainment,
        abortGraceMs: 100,
      }),
      (error) => error instanceof AdapterTimeoutError,
    );
    fixtureCount += 1;

    if (classifyProcessContainment().support_state === "verified") {
      const descendantMarker = path.join(fixtureRoot, "surviving-descendant.txt");
      const descendantCli = writeFakeOpenCode(fixtureRoot, "composition-descendant", {
        mode: "descendant-success",
        stream: successfulStream,
        descendantMarker,
      });
      const descendantResult = await runAdapterModule({
        adapterUrl: pathToFileURL(wrapperPath).href,
        context: { ...baseContext, fixtureCli: descendantCli },
        timeout: 5_000,
        workingDirectory: repo,
        onTrace: () => ({ accepted: true }),
      });
      fixtureCount += 1;
      assert.equal(descendantResult.passed, true);
      await new Promise((resolve) => setTimeout(resolve, 900));
      assert.equal(
        fs.existsSync(descendantMarker),
        false,
        "production adapter composition left a surviving descendant after verified teardown",
      );
    }
    return fixtureCount;
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

export async function verifyBenchmarkAdapter({ root = defaultRoot } = {}) {
  parserFixtures(root);
  const profiles = profileFixtures(root);
  let lifecycleFixtureCount = 0;
  try {
    lifecycleFixtureCount += await executionFixtures(root, profiles.plain);
    lifecycleFixtureCount += await productionCompositionFixtures(root, profiles.plain);
  } finally {
    for (const entry of profiles.all.reverse()) {
      if (fs.existsSync(entry.root)) cleanupSyntheticProfile(entry);
    }
  }
  return {
    schema_version: 1,
    parser_fixture_count: 14,
    profile_count: 3,
    lifecycle_fixture_count: lifecycleFixtureCount,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = await verifyBenchmarkAdapter();
  console.log(
    `Synthetic OpenCode adapter verified (${result.parser_fixture_count} parser fixtures; ${result.profile_count} isolated profiles; ${result.lifecycle_fixture_count} lifecycle fixtures).`,
  );
}
