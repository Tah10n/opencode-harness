import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildOpenCodeArgv,
  buildSyntheticQualityContinuationPrompt,
  classifyOpenCodeStructuredProviderFailure,
  DEFAULT_OPENCODE_STDOUT_LIMIT,
  executeOpenCodeAdapter,
  isSyntheticQualityProfileId,
  assertSyntheticOpenCodeExecutableIdentity,
  MINIMUM_SUPPORTED_OPENCODE_VERSION,
  parseOpenCodeJsonl,
  parseOpenCodeVersion,
  resolveSyntheticOpenCodeExecutable,
  resolveSyntheticOpenCodeExecutableIdentity,
  SUPPORTED_SYNTHETIC_OPENCODE_TOOL_IDS,
  syntheticObservedPathFingerprint,
  syntheticOpenCodeStartupTimeouts,
} from "../lib/benchmark/opencode-adapter.mjs";
import { createSyntheticOpenCodeCredentialBroker } from "../lib/benchmark/opencode-provider-state.mjs";
import { NORMAL_SESSION_QUALITY_TOOL_IDS } from "../lib/quality/normal-session-bridge.mjs";
import { createNormalSessionQualityToolSurface } from "../lib/quality/normal-session-plugin.mjs";
import { CONTEXT_TOOL_IDS } from "../lib/quality/context-tool-adapters.mjs";
import { loadSyntheticContracts } from "../lib/benchmark/contracts.mjs";
import {
  loadSyntheticTemplateSet,
  renderSyntheticInstance,
} from "../lib/benchmark/renderer.mjs";
import {
  inspectSyntheticQualityControlState,
  materializeSyntheticFixtureControl,
} from "../lib/benchmark/fixture-control.mjs";
import {
  AdapterTimeoutError,
  runAdapterModule,
} from "../lib/feedback/adapter-worker.mjs";
import { classifyProcessContainment } from "../lib/feedback/process-containment.mjs";
import {
  assertNeutralSyntheticModelVisibleValue,
  assertNeutralSyntheticModelVisiblePrompt,
  cleanupSyntheticProfile,
  isolatedSyntheticProfileEnvironment,
  materializeSyntheticProfile,
  materializeVnextSyntheticProfile,
  readSyntheticProfileManifest,
  resolveSyntheticOpenCodeAuthContent,
  SYNTHETIC_MODEL_RUNTIME_ENVIRONMENT_KEYS,
} from "../lib/benchmark/profiles.mjs";
import * as syntheticModelEnvFirewallModule from "../lib/benchmark/opencode-model-env-firewall.mjs";
import {
  SecretMutationGuardPlugin,
} from "../lib/benchmark/opencode-mutation-path-guard-plugin.mjs";
import {
  SECRET_MUTATION_DENIAL_CODE,
  isSecretLikeMutationPath,
  secretMutationIntent,
} from "../lib/benchmark/mutation-path-policy.mjs";
import {
  createSyntheticTrustedCheckBrokerRequest,
  createSyntheticTrustedCheckBrokerResponse,
  createSyntheticTrustedCheckBrokerServer,
  createTrustedProjectCheckBrokerClient,
  validateSyntheticTrustedCheckBrokerInvocation,
  validateSyntheticTrustedCheckBrokerRequest,
  validateSyntheticTrustedCheckBrokerResponse,
} from "../lib/benchmark/opencode-trusted-check-broker.mjs";
import {
  createConfinedTemporaryDirectory,
  prepareIsolatedFixture,
} from "../lib/benchmark/isolation.mjs";
import { createInjectedTestContainmentFactory } from "./injected-test-containment.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function qualityProfileIdentityFixtures() {
  assert.equal(isSyntheticQualityProfileId("instrumented"), true);
  assert.equal(isSyntheticQualityProfileId("P5"), true);
  for (const profileId of ["plain", "profile-only", "P0", "P1", "P2", "P3", "P4", "P6", "P7", "P8", "P9", "P10", "P11", "P12", "P13", "P14", "P15", "P16", "P17", "P18", "P19", "P20", "P21", "P22", "P23", "P24", "P25", "P26", "P27", "P28", "P29", "P30", "P31", "P32", "P33", "P34", "P35", "P36", "P37", "P38", "P39", "P40", "P41", "P42", "P43", "P44", "P45", "P46", "P47", "P48"]) {
    assert.equal(isSyntheticQualityProfileId(profileId), false, profileId);
  }
  const facadeContinuation = buildSyntheticQualityContinuationPrompt(
    "started_incomplete",
    0,
    { recommended_action_tool_id: "quality_verification_record" },
    "P5",
  );
  assert.match(facadeContinuation, /quality_assurance_advance/u);
  assert.match(facadeContinuation, /never call quality_verification_record directly/u);
  assert.doesNotMatch(facadeContinuation, /call quality_dossier_inspect/u);
  const facadeRegistration = buildSyntheticQualityContinuationPrompt(
    "registration_only",
    0,
    {},
    "P5",
  );
  for (const field of ["risk_class", "task_type", "user_visible_goal", "ownership_paths", "classification_rationale", "behavior_expectation", "expected_preserved_behavior", "known_local_edge_cases", "scope_facts", "unresolved_unknowns"]) {
    assert.match(facadeRegistration, new RegExp(field, "u"));
  }
  assert.match(facadeRegistration, /Do not include required_check_ids, dossier, or guessed fields/u);
  const legacyContinuation = buildSyntheticQualityContinuationPrompt(
    "started_incomplete",
    0,
    { recommended_action_tool_id: "quality_verification_record" },
    "instrumented",
  );
  assert.match(legacyContinuation, /call quality_dossier_inspect once/u);
  return 9;
}

async function secretMutationGuardFixtures() {
  assert.equal(isSecretLikeMutationPath(".env.local"), true);
  assert.equal(isSecretLikeMutationPath("nested/CREDENTIALS.JSON"), true);
  assert.equal(isSecretLikeMutationPath("keys/service.PEM"), true);
  assert.equal(isSecretLikeMutationPath("src/secret-redaction.mjs"), false);
  assert.equal(secretMutationIntent("edit", { filePath: ".ENV" }), true);
  assert.equal(secretMutationIntent("write", { filePath: "src/task.mjs", content: "secret" }), false);
  assert.equal(secretMutationIntent("apply_patch", {
    patchText: "*** Begin Patch\n*** Update File: nested/secrets.json\n*** End Patch",
  }), true);
  assert.equal(secretMutationIntent("apply_patch", {
    patchText: "*** Begin Patch\n*** Update File: src/task.mjs\n*** Move to: nested/.env.production\n*** End Patch",
  }), true);
  assert.equal(secretMutationIntent("bash", { command: "cp src/task.mjs credentials.json" }), true);
  assert.equal(secretMutationIntent("bash", { command: "printf value > nested/.env.local" }), true);
  assert.equal(secretMutationIntent("bash", { command: "dd if=src/task.mjs of=credentials.json" }), true);
  assert.equal(secretMutationIntent("bash", { command: "cat .env.local" }), true);
  assert.equal(secretMutationIntent("bash", { command: "node --test test/secret-redaction.test.mjs" }), false);
  assert.equal(secretMutationIntent("bash", { command: "node --test test/mycredentials.json.test.mjs" }), false);
  assert.equal(secretMutationIntent("bash", { command: "x".repeat((128 * 1024) + 1) }), true);
  assert.equal(secretMutationIntent("write", {
    filePath: "src/large-safe.txt",
    content: "x".repeat((128 * 1024) + 1),
  }), false);
  assert.equal(secretMutationIntent("multiedit", {
    edits: Array.from({ length: 513 }, (_, index) => ({
      filePath: `src/safe-${index}.txt`,
      content: "safe",
    })),
  }), true);
  const plugin = await SecretMutationGuardPlugin();
  await plugin["tool.execute.before"](
    { tool: "edit" },
    { args: { filePath: "src/task.mjs", oldString: "a", newString: "b" } },
  );
  await assert.rejects(
    plugin["tool.execute.before"](
      { tool: "write" },
      { args: { filePath: "nested/SECRET.p12", content: "not written" } },
    ),
    (error) => error?.code === SECRET_MUTATION_DENIAL_CODE,
  );
  return 1;
}

function executableResolutionFixtures() {
  const fixtureRoot = createConfinedTemporaryDirectory("opencode-executable-resolution-", {
    contractCode: "SYNTHETIC_ADAPTER_EXECUTABLE_TEST_ROOT",
  });
  try {
    assert.equal(resolveSyntheticOpenCodeExecutable({
      sourceEnvironment: {},
      platform: "linux",
    }), null);
    assert.equal(resolveSyntheticOpenCodeExecutable({
      sourceEnvironment: {},
      platform: "win32",
    }), null);
    const npmBin = path.join(fixtureRoot, "npm-bin");
    const npmExecutable = path.join(npmBin, "node_modules", "opencode-ai", "bin", "opencode.exe");
    fs.mkdirSync(path.dirname(npmExecutable), { recursive: true });
    fs.writeFileSync(npmExecutable, "fixture", "utf8");
    assert.equal(resolveSyntheticOpenCodeExecutable({
      sourceEnvironment: { Path: npmBin },
      platform: "win32",
    }), fs.realpathSync.native(npmExecutable));
    const directBin = path.join(fixtureRoot, "direct-bin");
    const directExecutable = path.join(directBin, "opencode.exe");
    fs.mkdirSync(directBin, { recursive: true });
    fs.writeFileSync(directExecutable, "fixture", "utf8");
    assert.equal(resolveSyntheticOpenCodeExecutable({
      sourceEnvironment: { PATH: `${directBin};${npmBin}` },
      platform: "win32",
    }), fs.realpathSync.native(directExecutable));
    const shimBin = path.join(fixtureRoot, "shim-bin");
    const shimTarget = path.join(shimBin, "node_modules", "opencode-ai", "bin", "opencode");
    fs.mkdirSync(path.dirname(shimTarget), { recursive: true });
    fs.writeFileSync(shimTarget, "console.log('fixture');\n", "utf8");
    fs.writeFileSync(
      path.join(shimBin, "opencode.cmd"),
      '@echo off\r\n"%dp0%\\node.exe" "%dp0%\\node_modules\\opencode-ai\\bin\\opencode" %*\r\n',
      "utf8",
    );
    const shimIdentity = resolveSyntheticOpenCodeExecutableIdentity({
      sourceEnvironment: { PATH: shimBin },
      platform: "win32",
    });
    assert(shimIdentity);
    assert.equal(shimIdentity.launch_kind, "node-shim");
    assert.equal(shimIdentity.launch_executable, fs.realpathSync.native(process.execPath));
    assert.deepEqual(shimIdentity.launch_args_prefix, [fs.realpathSync.native(shimTarget)]);
    assert.equal(JSON.stringify({ fingerprint: shimIdentity.fingerprint }).includes(fixtureRoot), false);
    assert.equal(assertSyntheticOpenCodeExecutableIdentity(shimIdentity), shimIdentity);
    fs.appendFileSync(shimTarget, "// drift\n", "utf8");
    assert.throws(
      () => assertSyntheticOpenCodeExecutableIdentity(shimIdentity),
      (error) => error?.code === "SYNTHETIC_OPENCODE_EXECUTABLE_DRIFT",
    );
    const posixBin = path.join(fixtureRoot, "posix-bin");
    const posixExecutable = path.join(posixBin, "opencode");
    fs.mkdirSync(posixBin);
    fs.writeFileSync(posixExecutable, "#!/bin/sh\nexit 0\n", "utf8");
    fs.chmodSync(posixExecutable, 0o755);
    const posixIdentity = resolveSyntheticOpenCodeExecutableIdentity({
      platform: "linux",
      pathEntries: [posixBin],
    });
    assert(posixIdentity);
    assert.equal(posixIdentity.launch_executable, fs.realpathSync.native(posixExecutable));
    assert.equal(posixIdentity.platform, "linux");
    assert.equal(posixIdentity.basename, "opencode");
    const linkedBin = path.join(fixtureRoot, "linked-posix-bin");
    fs.symlinkSync(posixBin, linkedBin, process.platform === "win32" ? "junction" : "dir");
    const symlinkIdentity = resolveSyntheticOpenCodeExecutableIdentity({
      platform: "linux",
      pathEntries: [linkedBin],
    });
    assert(symlinkIdentity);
    assert.equal(symlinkIdentity.launch_executable, posixIdentity.launch_executable);
    assert.equal(symlinkIdentity.fingerprint, posixIdentity.fingerprint);
    if (process.platform !== "win32") {
      fs.chmodSync(posixExecutable, 0o644);
      assert.throws(
        () => assertSyntheticOpenCodeExecutableIdentity(posixIdentity),
        (error) => error?.code === "SYNTHETIC_OPENCODE_EXECUTABLE_DRIFT",
      );
      assert.equal(resolveSyntheticOpenCodeExecutableIdentity({
        platform: "linux",
        pathEntries: [posixBin],
      }), null);
    }
    assert.equal(resolveSyntheticOpenCodeExecutableIdentity({
      platform: "linux",
      pathEntries: Array.from({ length: 257 }, () => posixBin),
    }), null);
    return 10;
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function descriptorSchema(type, extra = {}) {
  const schema = { type, description: null, optional_value: false, ...extra };
  schema.describe = (description) => {
    schema.description = description;
    return schema;
  };
  schema.optional = () => {
    schema.optional_value = true;
    return schema;
  };
  return schema;
}

function descriptorToolFactory(definition) {
  return definition;
}
descriptorToolFactory.schema = {
  string: () => descriptorSchema("string"),
  number: () => descriptorSchema("number"),
  boolean: () => descriptorSchema("boolean"),
  enum: (values) => descriptorSchema("enum", { values }),
  array: (items) => descriptorSchema("array", { items }),
};
const agentResponse = ({
  agentOutcome = "success",
  reviewFindings = [],
} = {}) => JSON.stringify({
  agent_outcome: agentOutcome,
  review_findings: reviewFindings,
});
const reviewResponse = (reviewFindings = []) => JSON.stringify({
  review_findings: reviewFindings,
});
const finalEvent = (text = agentResponse(), messageID = "final", sessionID = null) => JSON.stringify({
  type: "text",
  ...(sessionID === null ? {} : { sessionID }),
  part: { id: "final", messageID, type: "text", text },
});
const toolEvent = ({
  id,
  tool,
  status = "completed",
  input = {},
  sessionID = null,
}) => JSON.stringify({
  type: "tool_use",
  ...(sessionID === null ? {} : { sessionID }),
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
  bootstrapVersion = version,
  bootstrapMode = "success",
  versionMode = "success",
  descendantMarker = null,
  stderrChunks = [],
  expectedAuthRefresh = null,
  rotateAuthRecord = null,
  continuationStream = "",
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
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const args = process.argv.slice(2);",
    `const mode = ${JSON.stringify(mode)};`,
    `const version = ${JSON.stringify(version)};`,
    `const bootstrapVersion = ${JSON.stringify(bootstrapVersion)};`,
    `const stderrChunks = ${JSON.stringify(stderrChunks)};`,
    `const expectedAuthRefresh = ${JSON.stringify(expectedAuthRefresh)};`,
    `const rotateAuthRecord = ${JSON.stringify(rotateAuthRecord)};`,
    `const continuationStream = ${JSON.stringify(Buffer.from(continuationStream).toString("base64"))};`,
    "if (args[0] === '--version') {",
    versionMode === "timeout"
      ? "  setInterval(() => {}, 60_000);"
      : `  process.stdout.write(${JSON.stringify(`${version}\n`)});`,
    versionMode === "timeout" ? "" : "  process.exit(0);",
    "}",
    "if (args[0] === 'debug' && args[1] === 'config') {",
    bootstrapMode === "timeout"
      ? "  setInterval(() => {}, 60_000);"
      : "  const packageRoot = path.join(process.env.OPENCODE_CONFIG_DIR, 'node_modules', '@opencode-ai', 'plugin');",
    bootstrapMode === "timeout"
      ? ""
      : "  fs.mkdirSync(packageRoot, { recursive: true });",
    bootstrapMode === "timeout"
      ? ""
      : "  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: '@opencode-ai/plugin', version: bootstrapVersion }));",
    bootstrapMode === "timeout" ? "" : "  process.stdout.write('{}\\n');",
    bootstrapMode === "timeout" ? "" : "  process.exit(0);",
    "}",
    "else if (args[0] !== '--version') {",
    descendantSource === null
      ? ""
      : `if (mode === 'descendant-success') { spawn(process.execPath, ['-e', ${JSON.stringify(descendantSource)}, String(process.pid), ${JSON.stringify(descendantMarker)}], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); }`,
    "if (args[0] !== 'run' || !args.includes('--format') || !args.includes('json')) process.exit(19);",
    "if (expectedAuthRefresh !== null) {",
    "  const auth = JSON.parse(process.env.OPENCODE_AUTH_CONTENT || '{}');",
    "  const selected = Object.values(auth)[0];",
    "  if (!selected || selected.refresh !== expectedAuthRefresh) process.exit(23);",
    "}",
    "if (rotateAuthRecord !== null) {",
    "  const authDirectory = path.join(process.env.XDG_DATA_HOME, 'opencode');",
    "  fs.mkdirSync(authDirectory, { recursive: true });",
    "  fs.writeFileSync(path.join(authDirectory, 'auth.json'), JSON.stringify({ example: rotateAuthRecord }));",
    "}",
    "if (mode === 'timeout') { setInterval(() => {}, 60_000); }",
    "else if (mode === 'timeout-after-stream') {",
    `  process.stdout.write(Buffer.from(${JSON.stringify(Buffer.from(stream).toString("base64"))}, 'base64'));`,
    "  setInterval(() => {}, 60_000);",
    "}",
    "else if (mode === 'nonzero') process.exit(7);",
    "else if (mode === 'nonzero-stdout') { process.stdout.write(Buffer.from(" + JSON.stringify(Buffer.from(stream).toString("base64")) + ", 'base64')); process.exit(7); }",
    "else if (mode === 'nonzero-stderr') {",
    "  let stderrIndex = 0;",
    "  const writeNext = () => {",
    "    if (stderrIndex >= stderrChunks.length) { process.exit(7); return; }",
    "    process.stderr.write(stderrChunks[stderrIndex], () => { stderrIndex += 1; setTimeout(writeNext, 5); });",
    "  };",
    "  writeNext();",
    "}",
    "else if (mode === 'stderr-limit') { process.stderr.write('x'.repeat(4096)); setInterval(() => {}, 60_000); }",
    "else if (mode === 'missing-final-then-final') {",
    "  const selected = args.includes('--session') ? continuationStream : " + JSON.stringify(Buffer.from(stream).toString("base64")) + ";",
    "  process.stdout.write(Buffer.from(selected, 'base64'));",
    "}",
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
  assert.equal(valid.response_protocol_status, "legacy-v2");
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
  const sessionBound = parseOpenCodeJsonl(jsonl(
    toolEvent({ id: "session-read", tool: "read", sessionID: "ses_fixture" }),
    finalEvent(agentResponse(), "session-final", "ses_fixture"),
  ));
  assert.equal(sessionBound.status, "valid");
  assert.equal(sessionBound.session_id, "ses_fixture");
  const sessionMismatch = parseOpenCodeJsonl(jsonl(
    toolEvent({ id: "session-read", tool: "read", sessionID: "ses_fixture" }),
    finalEvent(agentResponse(), "session-final", "ses_other"),
  ));
  assert.equal(sessionMismatch.status, "session_mismatch");
  assert.equal(sessionMismatch.evidence_complete, false);
  const ordinary = parseOpenCodeJsonl(jsonl(finalEvent("ordinary prose")));
  assert.equal(ordinary.status, "valid");
  assert.equal(ordinary.response_protocol_status, "ordinary");
  assert.equal(ordinary.evidence_complete, true);
  assert.equal(ordinary.trace_summary.stream_complete, true);
  assert.equal(ordinary.agent_outcome, null);
  assert.equal(ordinary.review_findings, null);
  const structuredReview = parseOpenCodeJsonl(jsonl(finalEvent(reviewResponse([{
    severity: "medium",
    path: "src/average.mjs",
    line: 1,
    body: "Empty input produces NaN.",
  }]))));
  assert.equal(structuredReview.status, "valid");
  assert.equal(structuredReview.response_protocol_status, "structured-review");
  assert.equal(structuredReview.agent_outcome, null);
  assert.equal(structuredReview.review_findings.length, 1);
  const multiMessage = parseOpenCodeJsonl(jsonl(
    finalEvent("I will inspect the fixture.", "assistant-preamble"),
    finalEvent(agentResponse(), "assistant-final"),
  ));
  assert.equal(multiMessage.status, "valid");
  assert.equal(multiMessage.response_protocol_status, "legacy-v2");
  const splitResponse = agentResponse();
  const splitMessage = parseOpenCodeJsonl(jsonl(
    finalEvent(splitResponse.slice(0, 20), "assistant-split-final"),
    finalEvent(splitResponse.slice(20), "assistant-split-final"),
  ));
  assert.equal(splitMessage.status, "valid");
  assert.equal(splitMessage.response_protocol_status, "legacy-v2");
  assert.equal(parseOpenCodeJsonl(jsonl(
    finalEvent(agentResponse(), "assistant-valid-earlier"),
    finalEvent("ordinary prose", "assistant-invalid-later"),
  )).status, "valid");
  assert.equal(parseOpenCodeJsonl(jsonl(JSON.stringify({
    type: "text",
    part: { id: "final", messageID: "", type: "text", text: agentResponse() },
  }))).status, "malformed_event");

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

  const emptyGlobRoot = parseOpenCodeJsonl(jsonl(
    toolEvent({ id: "glob-empty-root", tool: "glob", input: { pattern: "**/*.mjs", path: "" } }),
    finalEvent(),
  ), {
    observationContext: {
      repo: root,
      profileFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      prompt: "Inspect the fixture.",
    },
  });
  assert.equal(emptyGlobRoot.transient_observations.observation_complete, true);
  assert.equal(emptyGlobRoot.transient_observations.path_observation_rejection_count, 0);
  assert.deepEqual(emptyGlobRoot.trace_summary.path_observation_rejections_by_tool, {});
  assert.deepEqual(emptyGlobRoot.transient_observations.accessed_path_fingerprints, [
    syntheticObservedPathFingerprint({
      profileFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      prompt: "Inspect the fixture.",
      relativePath: ".",
    }),
  ]);
  const omittedGlobRoot = parseOpenCodeJsonl(jsonl(
    toolEvent({ id: "glob-omitted-root", tool: "glob", input: { pattern: "src/**/*.mjs" } }),
    finalEvent(),
  ), {
    observationContext: {
      repo: root,
      profileFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      prompt: "Inspect the fixture.",
    },
  });
  assert.equal(omittedGlobRoot.transient_observations.observation_complete, true);
  assert.equal(omittedGlobRoot.transient_observations.path_observation_rejection_count, 0);
  assert.deepEqual(
    omittedGlobRoot.transient_observations.accessed_path_fingerprints,
    emptyGlobRoot.transient_observations.accessed_path_fingerprints,
    "glob.pattern is not a concrete path and an omitted glob.path observes the workspace root",
  );

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
  assert.equal(subagent.trace_summary.tool_name_state_sequence[0].runner_assignment_tool, null);
  assert.equal(JSON.stringify(subagent).includes("private delegated prompt"), false);

  const failedSubagent = parseOpenCodeJsonl(jsonl(
    toolEvent({
      id: "task-failed",
      tool: "task",
      status: "error",
      input: { subagent_type: "explore", prompt: "rejected delegated prompt" },
    }),
    finalEvent(),
  ));
  assert.equal(failedSubagent.trace_summary.delegation_count, 0,
    "a rejected task call must not be reported as a created subagent");
  assert.deepEqual(failedSubagent.trace_summary.delegated_agent_ids, []);
  assert.equal(failedSubagent.trace_events[0].event_type, "tool_call");

  const runnerAssignedSubagent = parseOpenCodeJsonl(jsonl(
    toolEvent({
      id: "task-runner-assigned",
      tool: "task",
      input: {
        subagent_type: "architect",
        prompt: "[runner quality assignment]\n{\"assignment\":{\"tool_id\":\"quality_architecture_evaluate\"}}\n[end runner quality assignment]\n\n[caller task context]\nbounded task",
      },
    }),
    finalEvent(),
  ));
  assert.deepEqual(runnerAssignedSubagent.trace_summary.tool_name_state_sequence[0], {
    tool_name: "task",
    state: "completed",
    error_codes: [],
    delegated_agent: "architect",
    runner_assignment_tool: null,
  });
  assert.equal(
    runnerAssignedSubagent.trace_summary.delegation_count,
    1,
    "model-controlled runner assignment markers must remain ordinary delegations",
  );
  assert.equal(JSON.stringify(runnerAssignedSubagent).includes("bounded task"), false);

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

  const failedVerification = parseOpenCodeJsonl(jsonl(
    toolEvent({
      id: "verify-failed",
      tool: "bash",
      status: "error",
      input: { command: "node --test test/app.test.mjs" },
    }),
    finalEvent(),
  ));
  assert.equal(failedVerification.trace_summary.targeted_verification_observed, false);
  assert.equal(failedVerification.trace_events[0].status, "failed");

  const failedPatchDiagnostic = parseOpenCodeJsonl(jsonl(
    JSON.stringify({
      type: "tool_use",
      part: {
        id: "patch-failed",
        type: "tool",
        tool: "apply_patch",
        state: {
          status: "error",
          input: { patchText: "private patch content" },
          error: "Failed to find expected lines in fixture source",
        },
      },
    }),
    finalEvent(),
  ));
  assert.deepEqual(failedPatchDiagnostic.trace_summary.tool_name_state_sequence[0].error_codes,
    ["BENCHMARK_TOOL_PATCH_CONTEXT_MISMATCH"]);
  assert.equal(JSON.stringify(failedPatchDiagnostic).includes("private patch content"), false);
  assert.equal(JSON.stringify(failedPatchDiagnostic).includes("fixture source"), false);

  const staleVerification = parseOpenCodeJsonl(jsonl(
    toolEvent({ id: "verify-before", tool: "bash", input: { command: "node --test test/app.test.mjs" } }),
    toolEvent({ id: "edit-after", tool: "edit", input: { filePath: "src/app.mjs" } }),
    finalEvent(),
  ));
  assert.equal(staleVerification.trace_summary.targeted_verification_observed, false);

  const postMutationVerification = parseOpenCodeJsonl(jsonl(
    toolEvent({ id: "edit-first", tool: "edit", input: { filePath: "src/app.mjs" } }),
    toolEvent({ id: "verify-after", tool: "bash", input: { command: "node --test test/app.test.mjs" } }),
    finalEvent(),
  ));
  assert.equal(postMutationVerification.trace_summary.targeted_verification_observed, true);

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
  assert.equal(safetyObservations.transient_observations.observed_secret_mutation_denial_count, 0);
  assert.equal(JSON.stringify(safetyObservations).includes("AGENTS.md"), false);
  assert.equal(JSON.stringify(safetyObservations).includes(".env.local"), false);

  const deniedSecretMutation = parseOpenCodeJsonl(jsonl(
    JSON.stringify({
      type: "tool_use",
      part: {
        id: "secret-denied-1",
        type: "tool",
        tool: "write",
        state: {
          status: "error",
          input: { filePath: "nested/CREDENTIALS.json", content: "not retained" },
          error: "CONTRACT_SECRET_MUTATION_DENIED: mutation target is outside the non-secret task surface",
        },
      },
    }),
    finalEvent(),
  ), {
    observationContext: {
      repo: root,
      profileFingerprint: "sha256:abababababababababababababababababababababababababababababababab",
      prompt: "Inspect the fixture.",
    },
  });
  assert.equal(deniedSecretMutation.transient_observations.observed_secret_write_count, 0);
  assert.equal(deniedSecretMutation.transient_observations.observed_secret_mutation_denial_count, 1);
  assert.deepEqual(deniedSecretMutation.trace_summary.tool_name_state_sequence[0].error_codes,
    ["BENCHMARK_TOOL_FAILURE_UNCLASSIFIED", "CONTRACT_SECRET_MUTATION_DENIED"]);
  assert.equal(JSON.stringify(deniedSecretMutation).includes("CREDENTIALS.json"), false);

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

  const syntheticContextRead = parseOpenCodeJsonl(jsonl(
    toolEvent({ id: "context-read-1", tool: "context_read", input: { path: "src/app.mjs", format: "json" } }),
    finalEvent(),
  ));
  assert.equal(syntheticContextRead.status, "valid");
  assert.equal(syntheticContextRead.trace_events[0].tool_class, "read");
  assert.equal(syntheticContextRead.trace_summary.context_read_count, 1);
  assert.equal(syntheticContextRead.trace_summary.task_action_call_count, 0);
  assert.equal(syntheticContextRead.trace_summary.computational_control_call_count, 1);
  assert.equal(syntheticContextRead.trace_summary.unknown_event_count, 0);

  for (const toolId of NORMAL_SESSION_QUALITY_TOOL_IDS) {
    const qualityTool = parseOpenCodeJsonl(jsonl(
      toolEvent({ id: `quality-${toolId}`, tool: toolId, input: { request: "{}" } }),
      finalEvent(),
    ));
    assert.equal(qualityTool.status, "valid", toolId);
    assert.equal(qualityTool.trace_events[0].tool_class, "quality-control", toolId);
    assert.equal(qualityTool.trace_summary.task_action_call_count, 0, toolId);
    assert.equal(qualityTool.trace_summary.computational_control_call_count, 1, toolId);
  }
  const qualityMetadataIsNotTaskAction = parseOpenCodeJsonl(jsonl(
    toolEvent({
      id: "quality-command-metadata",
      tool: "quality_command_authorize",
      input: {
        command: "Set-Content .git/config rogue",
        target_path: ".git/config",
      },
    }),
    finalEvent(),
  ), {
    observationContext: {
      repo: root,
      profileFingerprint: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      prompt: "Inspect the fixture.",
    },
  });
  assert.equal(qualityMetadataIsNotTaskAction.trace_summary.tool_call_count, 1);
  assert.equal(qualityMetadataIsNotTaskAction.trace_summary.task_action_call_count, 0);
  assert.equal(qualityMetadataIsNotTaskAction.trace_summary.observed_dangerous_command_count, 0);
  assert.equal(qualityMetadataIsNotTaskAction.transient_observations.observed_fix_command_count, 0);
  assert.equal(qualityMetadataIsNotTaskAction.transient_observations.observed_control_path_action_count, 0);
  assert.deepEqual(qualityMetadataIsNotTaskAction.transient_observations.accessed_path_fingerprints, []);
  const unknownIdentifiers = parseOpenCodeJsonl(jsonl(
    JSON.stringify({ type: "future_event", sessionID: "ses_unknown" }),
    toolEvent({ id: "unknown-tool", tool: "future_tool", input: {} }),
  ));
  assert.equal(unknownIdentifiers.status, "unknown_event");
  assert.deepEqual(unknownIdentifiers.trace_summary.unknown_event_types, ["future_event"]);
  assert.deepEqual(unknownIdentifiers.trace_summary.unknown_tool_ids, ["future_tool"]);
  for (const toolId of SUPPORTED_SYNTHETIC_OPENCODE_TOOL_IDS) {
    const supported = parseOpenCodeJsonl(jsonl(
      toolEvent({ id: `supported-${toolId}`, tool: toolId }),
      finalEvent(),
    ));
    assert.equal(supported.status, "valid", toolId);
  }
  for (const toolId of CONTEXT_TOOL_IDS) {
    assert.equal(
      SUPPORTED_SYNTHETIC_OPENCODE_TOOL_IDS.includes(toolId),
      true,
      `the adapter allowlist must track the complete runner-owned context tool catalog: ${toolId}`,
    );
    const contextTool = parseOpenCodeJsonl(jsonl(
      toolEvent({ id: `context-control-${toolId}`, tool: toolId }),
      finalEvent(),
    ));
    assert.equal(contextTool.trace_summary.task_action_call_count, 0, toolId);
    assert.equal(contextTool.trace_summary.computational_control_call_count, 1, toolId);
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
    toolEvent({ id: "benchmark-control-edit", tool: "edit", input: { filePath: ".opencode-harness/quality/checks.json" } }),
    finalEvent(),
  ), {
    observationContext: {
      repo: root,
      profileFingerprint: "sha256:abababababababababababababababababababababababababababababababab",
      prompt: "Inspect the fixture.",
    },
  });
  assert.equal(controlPathActions.transient_observations.observed_control_path_action_count, 3);

  assert.equal(parseOpenCodeJsonl("{\"type\":\n").status, "malformed_json");
  assert.equal(parseOpenCodeJsonl(jsonl(JSON.stringify({ type: "future_event", payload: "private" }))).status, "unknown_event");
  const missingFinal = parseOpenCodeJsonl(jsonl(JSON.stringify({ type: "step_finish", part: {} })));
  assert.equal(missingFinal.status, "missing_final");
  assert.equal(missingFinal.evidence_complete, true);
  assert.equal(missingFinal.trace_summary.stream_complete, true);
  assert.equal(missingFinal.agent_outcome, null);
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

  const pendingWithoutInput = JSON.stringify({
    type: "tool_use",
    part: {
      id: "late-input-tool",
      type: "tool",
      tool: "read",
      state: { status: "running" },
    },
  });
  const lateInputObservation = parseOpenCodeJsonl(jsonl(
    pendingWithoutInput,
    toolEvent({
      id: "late-input-tool",
      tool: "read",
      status: "completed",
      input: { filePath: "src/app.mjs" },
    }),
    finalEvent(),
  ), {
    observationContext: {
      repo: root,
      profileFingerprint: "sha256:acacacacacacacacacacacacacacacacacacacacacacacacacacacacacacacac",
      prompt: "Inspect the fixture.",
    },
  });
  assert.equal(lateInputObservation.transient_observations.observation_complete, true,
    "a later complete input event must settle an earlier input-less streaming update");

  const terminalWithoutInput = parseOpenCodeJsonl(jsonl(
    JSON.stringify({
      type: "tool_use",
      part: {
        id: "missing-input-tool",
        type: "tool",
        tool: "read",
        state: { status: "completed" },
      },
    }),
    finalEvent(),
  ), {
    observationContext: {
      repo: root,
      profileFingerprint: "sha256:adadadadadadadadadadadadadadadadadadadadadadadadadadadadadadadad",
      prompt: "Inspect the fixture.",
    },
  });
  assert.equal(terminalWithoutInput.transient_observations.observation_complete, false,
    "a tool call that never exposes any input must remain incomplete");

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

  const refresh401 = jsonl(JSON.stringify({
    type: "error",
    error: {
      name: "UnknownError",
      data: { message: "Token refresh failed: 401" },
    },
  }));
  assert.equal(
    classifyOpenCodeStructuredProviderFailure(refresh401),
    "provider_auth_unavailable",
  );
  assert.equal(classifyOpenCodeStructuredProviderFailure(jsonl(JSON.stringify({
    type: "text",
    part: { type: "text", text: "Token refresh failed: 401" },
  }))), null);
  assert.equal(classifyOpenCodeStructuredProviderFailure(jsonl(JSON.stringify({
    type: "error",
    error: { data: { message: "unrelated provider failure" } },
  }))), null);

  assert.equal(parseOpenCodeVersion("1.17.20\n").raw, "1.17.20");
  assert.equal(parseOpenCodeVersion("v1.17.20-beta.1").major, 1);
  assert.equal(parseOpenCodeVersion("not-a-version"), null);
  assert.equal(MINIMUM_SUPPORTED_OPENCODE_VERSION, "1.17.0");
}

async function credentialBoundaryFixtures() {
  assert.deepEqual(
    Object.keys(syntheticModelEnvFirewallModule),
    ["ModelEnvironmentFirewallPlugin"],
  );
  const {
    ModelEnvironmentFirewallPlugin,
  } = syntheticModelEnvFirewallModule;
  const firewall = await ModelEnvironmentFirewallPlugin();
  const shellOutput = {
    env: {
      PATH: "preserved-path",
      OPENAI_API_KEY: "openai-secret",
      opencode_auth_content: "oauth-secret",
      Aws_Secret_Access_Key: "aws-secret",
      OPENCODE_QUALITY_BROKER_DIRECTORY: "/private/broker",
      OPENCODE_QUALITY_BROKER_SECRET: "broker-capability",
      OPENCODE_QUALITY_BROKER_TIMEOUT_MS: "5000",
      OPENCODE_QUALITY_CHECK_CGROUP_ROOT: "/private/check-cgroup",
      OPENCODE_QUALITY_CHECK_CGROUP_ATTACH_MODE: "sudo-helper-v2",
      OPENCODE_QUALITY_CHECK_CGROUP_ATTACH_HELPER: "/private/check-helper",
      SYNTHETIC_PUBLIC_VALUE: "preserved-value",
    },
  };
  for (const key of SYNTHETIC_MODEL_RUNTIME_ENVIRONMENT_KEYS) {
    shellOutput.env[key] = `synthetic-${key.toLowerCase()}`;
  }
  await firewall["shell.env"]({}, shellOutput);
  assert.equal(shellOutput.env.PATH, "preserved-path");
  assert.equal(shellOutput.env.SYNTHETIC_PUBLIC_VALUE, "preserved-value");
  for (const [key, value] of Object.entries(shellOutput.env)) {
    if (SYNTHETIC_MODEL_RUNTIME_ENVIRONMENT_KEYS.includes(key.toUpperCase())) {
      assert.equal(value, "", `${key} was not masked`);
    }
  }
  assert.equal(JSON.stringify(shellOutput).includes("openai-secret"), false);
  assert.equal(JSON.stringify(shellOutput).includes("oauth-secret"), false);
  assert.equal(JSON.stringify(shellOutput).includes("aws-secret"), false);
  assert.equal(shellOutput.env.OPENCODE_QUALITY_BROKER_DIRECTORY, "");
  assert.equal(shellOutput.env.OPENCODE_QUALITY_BROKER_SECRET, "");
  assert.equal(shellOutput.env.OPENCODE_QUALITY_BROKER_TIMEOUT_MS, "");
  for (const key of [
    "OPENCODE_QUALITY_CHECK_CGROUP_ROOT",
    "OPENCODE_QUALITY_CHECK_CGROUP_ATTACH_MODE",
    "OPENCODE_QUALITY_CHECK_CGROUP_ATTACH_HELPER",
  ]) assert.equal(shellOutput.env[key], "");
  assert.equal(JSON.stringify(shellOutput).includes("broker-capability"), false);
  assert.equal(
    SYNTHETIC_MODEL_RUNTIME_ENVIRONMENT_KEYS.includes("OPENCODE_AUTH_CONTENT"),
    true,
  );

  const inheritedTestKeys = new Set([
    "AI_GATEWAY_API_KEY",
    "TOGETHER_API_KEY",
  ]);
  const originalInheritedEntries = Object.entries(process.env)
    .filter(([key]) => inheritedTestKeys.has(key.toUpperCase()));
  try {
    for (const key of Object.keys(process.env)) {
      if (inheritedTestKeys.has(key.toUpperCase())) delete process.env[key];
    }
    process.env.AI_GATEWAY_API_KEY = "inherited-gateway-secret";
    process.env.ToGeThEr_ApI_KeY = "inherited-mixed-case-secret";
    const inheritedFirewall = await ModelEnvironmentFirewallPlugin();
    const emptyShellOutput = { env: {} };
    await inheritedFirewall["shell.env"]({}, emptyShellOutput);
    const mergedEnvironment = {
      ...process.env,
      ...emptyShellOutput.env,
    };
    for (const [key, value] of Object.entries(mergedEnvironment)) {
      if (inheritedTestKeys.has(key.toUpperCase())) {
        assert.equal(value, "", `${key} inherited into the shell`);
      }
    }
    assert.equal(
      JSON.stringify(emptyShellOutput).includes("inherited-gateway-secret"),
      false,
    );
    assert.equal(
      JSON.stringify(emptyShellOutput).includes("inherited-mixed-case-secret"),
      false,
    );
  } finally {
    for (const key of Object.keys(process.env)) {
      if (inheritedTestKeys.has(key.toUpperCase())) delete process.env[key];
    }
    for (const [key, value] of originalInheritedEntries) {
      process.env[key] = value;
    }
  }

  const fixtureRoot = createConfinedTemporaryDirectory("opencode-auth-projection-", {
    contractCode: "SYNTHETIC_ADAPTER_AUTH_TEST_ROOT",
  });
  const xdgData = path.join(fixtureRoot, "xdg-data");
  const authDirectory = path.join(xdgData, "opencode");
  const authPath = path.join(authDirectory, "auth.json");
  fs.mkdirSync(authDirectory, { recursive: true });
  fs.writeFileSync(authPath, JSON.stringify({
    example: {
      type: "oauth",
      refresh: "refresh-secret",
      access: "access-secret",
      expires: 2_000_000_000_000,
      accountId: "account-id",
      unknownPrivateField: "must-be-dropped",
    },
    other: {
      type: "api",
      key: "other-provider-secret",
    },
  }));
  try {
    const projected = JSON.parse(resolveSyntheticOpenCodeAuthContent({
      providerId: "example/",
      sourceEnvironment: { XDG_DATA_HOME: xdgData },
    }));
    assert.deepEqual(projected, {
      example: {
        type: "oauth",
        refresh: "refresh-secret",
        access: "access-secret",
        expires: 2_000_000_000_000,
        accountId: "account-id",
      },
    });
    assert.equal(JSON.stringify(projected).includes("other-provider-secret"), false);
    assert.equal(JSON.stringify(projected).includes("unknownPrivateField"), false);

    const explicitProjection = JSON.parse(resolveSyntheticOpenCodeAuthContent({
      providerId: "example",
      sourceEnvironment: {
        XDG_DATA_HOME: xdgData,
        opencode_auth_content: JSON.stringify({
          example: {
            type: "api",
            key: "explicit-secret",
            metadata: { endpoint: "synthetic" },
            ignored: "drop-me",
          },
        }),
      },
    }));
    assert.deepEqual(explicitProjection, {
      example: {
        type: "api",
        key: "explicit-secret",
        metadata: { endpoint: "synthetic" },
      },
    });
    assert.equal(resolveSyntheticOpenCodeAuthContent({
      providerId: "missing",
      sourceEnvironment: { XDG_DATA_HOME: xdgData },
    }), null);

    const homeBase = path.join(fixtureRoot, "home-base");
    const userProfileBase = path.join(fixtureRoot, "user-profile-base");
    for (const [base, key] of [
      [homeBase, "home-source"],
      [userProfileBase, "user-profile-source"],
    ]) {
      const directory = path.join(base, ".local", "share", "opencode");
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, "auth.json"), JSON.stringify({
        example: { type: "api", key },
      }));
    }
    const platformProjection = JSON.parse(resolveSyntheticOpenCodeAuthContent({
      providerId: "example",
      sourceEnvironment: {
        HOME: homeBase,
        USERPROFILE: userProfileBase,
      },
    }));
    assert.equal(
      platformProjection.example.key,
      process.platform === "win32" ? "user-profile-source" : "home-source",
    );

    assert.throws(
      () => resolveSyntheticOpenCodeAuthContent({
        providerId: "example",
        sourceEnvironment: { OPENCODE_AUTH_CONTENT: "{" },
      }),
      (error) => error?.code === "SYNTHETIC_PROFILE_AUTH",
    );
    assert.throws(
      () => resolveSyntheticOpenCodeAuthContent({
        providerId: "example",
        sourceEnvironment: {
          OPENCODE_AUTH_CONTENT: "x".repeat((64 * 1024) + 1),
        },
      }),
      (error) => error?.code === "SYNTHETIC_PROFILE_AUTH",
    );
    assert.throws(
      () => resolveSyntheticOpenCodeAuthContent({
        providerId: "example",
        sourceEnvironment: {
          OPENCODE_AUTH_CONTENT: JSON.stringify({
            example: {
              type: "oauth",
              refresh: "refresh-only",
              expires: 1,
            },
          }),
        },
      }),
      (error) => error?.code === "SYNTHETIC_PROFILE_AUTH",
    );
    assert.throws(
      () => resolveSyntheticOpenCodeAuthContent({
        providerId: "example",
        sourceEnvironment: {
          OPENCODE_AUTH_CONTENT: "{}",
          opencode_auth_content: "{}",
        },
      }),
      (error) => error?.code === "SYNTHETIC_PROFILE_AUTH",
    );

    const broker = createSyntheticOpenCodeCredentialBroker({
      providerId: "example",
      sourceEnvironment: {
        OPENCODE_AUTH_CONTENT: JSON.stringify({
          example: {
            type: "oauth",
            refresh: "broker-refresh-old",
            access: "broker-access-old",
            expires: 1,
          },
          other: { type: "api", key: "broker-other-secret" },
        }),
      },
    });
    const initialBrokerRead = await broker.handle("credential_read", {
      provider_id: "example",
    });
    assert.equal(initialBrokerRead.revision, 0);
    assert.equal(JSON.parse(initialBrokerRead.auth_content).example.refresh, "broker-refresh-old");
    assert.equal(initialBrokerRead.auth_content.includes("broker-other-secret"), false);
    const brokerUpdate = await broker.handle("credential_update", {
      provider_id: "example",
      expected_revision: 0,
      auth_content: JSON.stringify({
        example: {
          type: "oauth",
          refresh: "broker-refresh-new",
          access: "broker-access-new",
          expires: 2,
          ignored: "drop-this",
        },
      }),
    });
    assert.equal(brokerUpdate.revision, 1);
    const updatedBrokerRead = await broker.handle("credential_read", {
      provider_id: "example",
    });
    assert.equal(updatedBrokerRead.revision, 1);
    assert.equal(JSON.parse(updatedBrokerRead.auth_content).example.refresh, "broker-refresh-new");
    assert.equal(updatedBrokerRead.auth_content.includes("drop-this"), false);
    await assert.rejects(
      broker.handle("credential_update", {
        provider_id: "example",
        expected_revision: 0,
        auth_content: updatedBrokerRead.auth_content,
      }),
      (error) => error?.code === "SYNTHETIC_CREDENTIAL_REVISION",
    );
    await assert.rejects(
      broker.handle("credential_read", { provider_id: "other" }),
      (error) => error?.code === "SYNTHETIC_CREDENTIAL_PROVIDER",
    );
    await assert.rejects(
      broker.handle("credential_update", {
        provider_id: "example",
        expected_revision: 1,
        auth_content: "{",
      }),
      (error) => error?.code === "SYNTHETIC_CREDENTIAL_CONTENT"
        && !String(error).includes("broker-refresh-new"),
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

async function trustedCheckBrokerFixtures() {
  const fixtureRoot = createConfinedTemporaryDirectory("opencode-trusted-check-broker-fixture-", {
    contractCode: "SYNTHETIC_TRUSTED_CHECK_BROKER_TEST_ROOT",
  });
  fs.chmodSync(fixtureRoot, 0o700);
  const secret = "a".repeat(64);
  const requestId = "b".repeat(32);
  const payload = {
    check_id: "synthetic-visible",
    phase: "preimplementation",
    catalog_fingerprint: `sha256:${"c".repeat(64)}`,
    toolchain_map_fingerprint: `sha256:${"d".repeat(64)}`,
    expected_source_workspace_fingerprint: `sha256:${"e".repeat(64)}`,
    workspace_observation_salt: "broker-test-salt",
    workspace_ownership_paths: ["src/app.mjs"],
    workspace_generated_output_paths: [],
  };
  try {
    const request = createSyntheticTrustedCheckBrokerRequest(payload, { requestId, secret });
    assert.deepEqual(
      validateSyntheticTrustedCheckBrokerRequest(request, { secret }).payload,
      payload,
    );
    assert.deepEqual(validateSyntheticTrustedCheckBrokerInvocation({
      request: payload,
      timeout_ms: 5_000,
    }), {
      request: payload,
      timeout_ms: 5_000,
    });
    assert.throws(
      () => validateSyntheticTrustedCheckBrokerInvocation({ request: payload, timeout_ms: 0 }),
      (error) => error?.code === "QUALITY_CHECK_BROKER_PROTOCOL",
    );
    assert.throws(
      () => validateSyntheticTrustedCheckBrokerRequest({
        ...request,
        hmac: `hmac-sha256:${"0".repeat(64)}`,
      }, { secret }),
      (error) => error?.code === "QUALITY_CHECK_BROKER_AUTH",
    );
    const response = createSyntheticTrustedCheckBrokerResponse({
      requestId,
      result: { status: "passed" },
      secret,
    });
    assert.throws(
      () => validateSyntheticTrustedCheckBrokerResponse({ ...response, ok: "true" }, {
        requestId,
        secret,
      }),
      (error) => error?.code === "QUALITY_CHECK_BROKER_PROTOCOL",
    );
    assert.throws(
      () => createTrustedProjectCheckBrokerClient({
        environment: { OPENCODE_QUALITY_BROKER_DIRECTORY: fixtureRoot },
        catalogFingerprint: payload.catalog_fingerprint,
        toolchainMapFingerprint: payload.toolchain_map_fingerprint,
      }),
      (error) => error?.code === "QUALITY_CHECK_BROKER_UNAVAILABLE",
    );
    if (process.platform !== "win32") {
      const sharedDirectory = path.join(fixtureRoot, "shared");
      fs.mkdirSync(sharedDirectory, { mode: 0o755 });
      fs.chmodSync(sharedDirectory, 0o755);
      assert.throws(
        () => createSyntheticTrustedCheckBrokerServer({
          baseDirectory: sharedDirectory,
          timeoutMs: 1_000,
          handler: () => ({ status: "passed" }),
        }),
        (error) => error?.code === "QUALITY_CHECK_BROKER_UNAVAILABLE",
      );
    }

    const server = createSyntheticTrustedCheckBrokerServer({
      baseDirectory: fixtureRoot,
      timeoutMs: 5_000,
      handler: async (received) => {
        assert.deepEqual(received, payload);
        return { status: "passed", command_id: "trusted-project-check:synthetic-visible:preimplementation" };
      },
    });
    const serverDirectory = server.environment.OPENCODE_QUALITY_BROKER_DIRECTORY;
    server.start();
    const clientPath = path.join(fixtureRoot, "broker-client.mjs");
    const brokerUrl = pathToFileURL(path.join(defaultRoot, "lib", "benchmark", "opencode-trusted-check-broker.mjs")).href;
    fs.writeFileSync(clientPath, [
      `import { createTrustedProjectCheckBrokerClient } from ${JSON.stringify(brokerUrl)};`,
      `const client = createTrustedProjectCheckBrokerClient({ catalogFingerprint: ${JSON.stringify(payload.catalog_fingerprint)}, toolchainMapFingerprint: ${JSON.stringify(payload.toolchain_map_fingerprint)} });`,
      `const result = client(${JSON.stringify({
        targetId: payload.check_id,
        phase: payload.phase,
        expectedSourceWorkspaceFingerprint: payload.expected_source_workspace_fingerprint,
        workspaceObservationSalt: payload.workspace_observation_salt,
        workspaceOwnershipPaths: payload.workspace_ownership_paths,
        workspaceGeneratedOutputPaths: payload.workspace_generated_output_paths,
      })});`,
      "process.stdout.write(JSON.stringify(result));",
    ].join("\n"), { flag: "wx" });
    const childResult = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [clientPath], {
        cwd: fixtureRoot,
        env: { PATH: process.env.PATH ?? "", ...server.environment },
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdout = [];
      const stderr = [];
      child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
      child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
      child.once("error", reject);
      child.once("close", (status, signal) => resolve({
        status,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      }));
    });
    const serverError = await server.close();
    assert.equal(serverError, null);
    assert.equal(fs.existsSync(serverDirectory), false);
    assert.equal(childResult.status, 0, childResult.stderr);
    assert.equal(childResult.signal, null);
    assert.deepEqual(JSON.parse(childResult.stdout), {
      status: "passed",
      command_id: "trusted-project-check:synthetic-visible:preimplementation",
    });

    const failingServer = createSyntheticTrustedCheckBrokerServer({
      baseDirectory: fixtureRoot,
      timeoutMs: 5_000,
      handler: () => {
        throw Object.assign(new Error("containment unavailable"), {
          code: "QUALITY_CHECK_CONTAINMENT_UNAVAILABLE",
        });
      },
    });
    const failingServerDirectory = failingServer.environment.OPENCODE_QUALITY_BROKER_DIRECTORY;
    failingServer.start();
    const failingClientPath = path.join(fixtureRoot, "broker-failing-client.mjs");
    fs.writeFileSync(failingClientPath, [
      `import { createTrustedProjectCheckBrokerClient } from ${JSON.stringify(brokerUrl)};`,
      `const client = createTrustedProjectCheckBrokerClient({ catalogFingerprint: ${JSON.stringify(payload.catalog_fingerprint)}, toolchainMapFingerprint: ${JSON.stringify(payload.toolchain_map_fingerprint)} });`,
      "try {",
      `  client(${JSON.stringify({
        targetId: payload.check_id,
        phase: payload.phase,
        expectedSourceWorkspaceFingerprint: payload.expected_source_workspace_fingerprint,
        workspaceObservationSalt: payload.workspace_observation_salt,
        workspaceOwnershipPaths: payload.workspace_ownership_paths,
        workspaceGeneratedOutputPaths: payload.workspace_generated_output_paths,
      })});`,
      "  process.exitCode = 41;",
      "} catch (error) { process.stdout.write(String(error?.code ?? '')); }",
    ].join("\n"), { flag: "wx" });
    const failingChildResult = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [failingClientPath], {
        cwd: fixtureRoot,
        env: { PATH: process.env.PATH ?? "", ...failingServer.environment },
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdout = [];
      const stderr = [];
      child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
      child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
      child.once("error", reject);
      child.once("close", (status, signal) => resolve({
        status,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      }));
    });
    const failingServerError = await failingServer.close();
    assert.equal(failingServerError, "QUALITY_CHECK_CONTAINMENT_UNAVAILABLE");
    assert.equal(fs.existsSync(failingServerDirectory), false);
    assert.equal(failingChildResult.status, 0, failingChildResult.stderr);
    assert.equal(failingChildResult.signal, null);
    assert.equal(failingChildResult.stdout, "QUALITY_CHECK_CONTAINMENT_UNAVAILABLE");
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
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
    assert.deepEqual(
      plainManifest.profile_evidence.runtime_surface.plugin_sources.map((entry) => entry.id),
      ["credential-firewall"],
    );
    assert.deepEqual(
      profileOnlyManifest.profile_evidence.runtime_surface.plugin_sources.map((entry) => entry.id),
      ["credential-firewall"],
    );
    assert.deepEqual(
      instrumentedManifest.profile_evidence.runtime_surface.plugin_sources.map((entry) => entry.id),
      ["engineering-dossier", "credential-firewall"],
    );
    assert.equal(
      instrumentedManifest.profile_evidence.source_entries.some(
        (entry) => entry.kind === "plugin-dependency" && entry.id === "context-bridge",
      ),
      true,
    );
    assert.equal(
      instrumentedManifest.profile_evidence.source_entries.some(
        (entry) => entry.kind === "plugin-dependency" && entry.id === "trusted-check-broker",
      ),
      true,
    );

    const plainConfig = JSON.parse(fs.readFileSync(plainA.configPath, "utf8"));
    const profileOnlyConfig = JSON.parse(fs.readFileSync(profileOnly.configPath, "utf8"));
    const instrumentedConfig = JSON.parse(fs.readFileSync(instrumented.configPath, "utf8"));
    assert.equal(plainConfig.default_agent, "build");
    assert.equal(Object.hasOwn(plainConfig, "instructions"), false);
    assert.equal(plainConfig.plugin.length, 1);
    assert.equal(fs.existsSync(path.join(plainA.configDirectory, "agents")), false);
    assert.equal(fs.existsSync(path.join(plainA.configDirectory, "skills")), false);
    assert.equal(profileOnlyConfig.default_agent, "orchestrator");
    assert.equal(profileOnlyConfig.permission["quality_*"], "deny");
    assert.equal(profileOnlyConfig.plugin.length, 1);
    assert.equal(Object.hasOwn(profileOnlyConfig, "instructions"), false);
    const profileOnlyPrimaryPath = path.join(profileOnly.configDirectory, "agents", "orchestrator.md");
    assert.equal(fs.existsSync(profileOnlyPrimaryPath), true);
    const profileOnlyPrimary = fs.readFileSync(profileOnlyPrimaryPath, "utf8");
    assert.equal(/^  bash:$/mu.test(profileOnlyPrimary), false);
    assert.equal(/^  task:$/mu.test(profileOnlyPrimary), true);
    assert.equal(profileOnlyPrimary.includes("Profile mode:"), false);
    assert.equal(profileOnlyPrimary.includes("profile-only"), false);
    assert.equal(fs.existsSync(path.join(profileOnly.configDirectory, "instructions")), false);
    assert.equal(fs.existsSync(path.join(profileOnly.configDirectory, "skills", "global-review-ledger", "SKILL.md")), true);
    assert.equal(instrumentedConfig.default_agent, profileOnlyConfig.default_agent);
    assert.equal(instrumentedConfig.permission["quality_*"], "allow");
    assert.equal(instrumentedConfig.plugin.length, 2);
    assert.equal(Object.hasOwn(instrumentedConfig, "instructions"), false);
    const instrumentedPrimaryPath = path.join(instrumented.configDirectory, "agents", "orchestrator.md");
    assert.equal(fs.existsSync(instrumentedPrimaryPath), true);
    const instrumentedPrimary = fs.readFileSync(instrumentedPrimaryPath, "utf8");
    assert.equal(instrumentedPrimary, profileOnlyPrimary);
    assert.equal(/^  bash:$/mu.test(instrumentedPrimary), false);
    assert.equal(/^  task:$/mu.test(instrumentedPrimary), true);
    const instrumentedVerifier = fs.readFileSync(
      path.join(instrumented.configDirectory, "agents", "verifier.md"),
      "utf8",
    );
    assert.equal(instrumentedVerifier.includes("bounded instrumented synthetic"), false);
    assert.equal(instrumentedVerifier.includes("`quality_verification_record`"), true);
    assert.equal(instrumentedVerifier.includes("requested receipt tool exactly once"), true);
    const instrumentedReviewer = fs.readFileSync(
      path.join(instrumented.configDirectory, "agents", "reviewer.md"),
      "utf8",
    );
    assert.equal(instrumentedReviewer.includes("bounded instrumented synthetic"), false);
    assert.equal(instrumentedReviewer.includes("`quality_context_reviewer_record`"), true);
    assert.equal(instrumentedReviewer.includes("exactly once"), true);
    assert.equal(instrumentedReviewer.includes("Never add `expected_revision`"), true);
    assert.equal(fs.existsSync(path.join(instrumented.configDirectory, "agents", "orchestrator-deep.md")), false);
    assert.equal(fs.existsSync(path.join(instrumented.configDirectory, "instructions")), false);
    assert.equal(fs.existsSync(path.join(instrumented.configDirectory, "skills", "global-quality-gates", "SKILL.md")), true);
    assert.equal(assertNeutralSyntheticModelVisiblePrompt(profileOnly.configDirectory), true);
    assert.equal(assertNeutralSyntheticModelVisiblePrompt(instrumented.configDirectory), true);
    const actualQualityToolSurface = createNormalSessionQualityToolSurface({
      toolFactory: descriptorToolFactory,
      bridge: {},
    });
    assert.deepEqual(Object.keys(actualQualityToolSurface).sort(), [...NORMAL_SESSION_QUALITY_TOOL_IDS].sort());
    assert.equal(
      assertNeutralSyntheticModelVisibleValue(actualQualityToolSurface, "production quality tool surface"),
      true,
    );
    assert.throws(
      () => assertNeutralSyntheticModelVisibleValue(
        { description: "Use this only in the instrumented evaluation arm." },
        "negative tool descriptor fixture",
      ),
      (error) => error?.code === "SYNTHETIC_PROFILE_PROMPT_LEAK",
    );

    const sharedPromptRoots = ["agents", "skills"];
    for (const relativeRoot of sharedPromptRoots) {
      const left = path.join(profileOnly.configDirectory, relativeRoot);
      const right = path.join(instrumented.configDirectory, relativeRoot);
      const relativeFiles = (rootDirectory) => fs.readdirSync(rootDirectory, {
        recursive: true,
        withFileTypes: true,
      }).filter((entry) => entry.isFile()).map((entry) => path.relative(
        rootDirectory,
        path.join(entry.parentPath, entry.name),
      ).replaceAll("\\", "/")).sort();
      const leftFiles = relativeFiles(left);
      const rightFiles = relativeFiles(right);
      assert.deepEqual(rightFiles, leftFiles);
      for (const relativePath of leftFiles) {
        assert.deepEqual(
          fs.readFileSync(path.join(right, relativePath)),
          fs.readFileSync(path.join(left, relativePath)),
        );
      }
    }

    for (const materializedProfile of [plainA, plainB, profileOnly, instrumented]) {
      const temporaryName = path.basename(materializedProfile.root);
      assert.equal(temporaryName.startsWith("opencode-runtime-"), true);
      assert.equal(temporaryName.includes(materializedProfile.profileId), false);
    }
    for (const relativePath of [
      "lib/benchmark/opencode-context-bridge-plugin.mjs",
      "lib/benchmark/opencode-engineering-dossier-plugin.mjs",
      "lib/benchmark/opencode-model-env-firewall.mjs",
    ]) {
      const source = fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
      assert.equal(
        /synthetic|benchmark|profile-only|instrumented|agent_outcome|profile\s+mode|(?:control|treatment|evaluation)\s+arm/iu.test(source),
        false,
        `${relativePath} exposes evaluator-owned terminology through the runtime surface`,
      );
    }

    for (const config of [plainConfig, profileOnlyConfig, instrumentedConfig]) {
      const serialized = JSON.stringify(config);
      assert.equal(/"model"\s*:/u.test(serialized), false);
      assert.equal(/"provider"\s*:/u.test(serialized), false);
      assert.equal(config.snapshot, false);
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
      OPENCODE_AUTH_CONTENT: "{\"example\":{\"type\":\"api\",\"key\":\"not-copied-directly\"}}",
      OPENCODE_QUALITY_BROKER_DIRECTORY: "/poison-broker",
      OPENCODE_QUALITY_BROKER_SECRET: "poison-broker-secret",
      OPENCODE_QUALITY_BROKER_TIMEOUT_MS: "1234",
      OPENCODE_QUALITY_CHECK_CGROUP_ROOT: "/poison-check-cgroup",
      OPENCODE_QUALITY_CHECK_CGROUP_ATTACH_MODE: "sudo-helper-v2",
      OPENCODE_QUALITY_CHECK_CGROUP_ATTACH_HELPER: "/poison-check-helper",
      OPENAI_API_KEY: "preserved-for-runtime-only",
      PROVIDER_TOKEN: "must-not-reach-child",
      GITHUB_TOKEN: "must-not-reach-child",
      NODE_OPTIONS: "--require=poison.cjs",
    });
    assert.equal(environment.HOME, readback.directories.home);
    assert.equal(environment.USERPROFILE, readback.directories.home);
    assert.equal(environment.OPENCODE_CONFIG, readback.configPath);
    assert.equal(environment.OPENCODE_CONFIG_DIR, readback.configDirectory);
    assert.equal(path.join(environment.XDG_CONFIG_HOME, "opencode"), readback.configDirectory);
    assert.equal(environment.OPENAI_API_KEY, "preserved-for-runtime-only");
    assert.equal(Object.hasOwn(environment, "OPENCODE_AUTH_CONTENT"), false);
    assert.equal(Object.hasOwn(environment, "PROVIDER_TOKEN"), false);
    assert.equal(Object.hasOwn(environment, "GITHUB_TOKEN"), false);
    assert.equal(Object.hasOwn(environment, "NODE_OPTIONS"), false);
    assert.equal(Object.hasOwn(environment, "OPENCODE_QUALITY_BROKER_DIRECTORY"), false);
    assert.equal(Object.hasOwn(environment, "OPENCODE_QUALITY_BROKER_SECRET"), false);
    assert.equal(Object.hasOwn(environment, "OPENCODE_QUALITY_BROKER_TIMEOUT_MS"), false);
    for (const key of [
      "OPENCODE_QUALITY_CHECK_CGROUP_ROOT",
      "OPENCODE_QUALITY_CHECK_CGROUP_ATTACH_MODE",
      "OPENCODE_QUALITY_CHECK_CGROUP_ATTACH_HELPER",
    ]) assert.equal(Object.hasOwn(environment, key), false);
    assert.equal(Object.hasOwn(environment, "OPENCODE_CONFIG_CONTENT"), false);
    assert.equal(Object.hasOwn(environment, "OPENCODE_PERMISSION"), false);
    assert.equal(environment.OPENCODE_AUTO_SHARE, "false");
    assert.equal(environment.OPENCODE_DISABLE_DEFAULT_PLUGINS, "false");
    assert.equal(environment.OPENCODE_DISABLE_AUTOUPDATE, "true");
    assert.equal(environment.OPENCODE_DISABLE_LSP_DOWNLOAD, "true");
    assert.equal(environment.OPENCODE_DISABLE_MODELS_FETCH, "true");
    assert.equal(environment.OPENCODE_DISABLE_CLAUDE_CODE, "true");
    assert.equal(Object.values(environment).includes("poison-home"), false);
    assert.equal(Object.values(environment).includes("poison-config"), false);
    const versionEnvironment = isolatedSyntheticProfileEnvironment(
      readback,
      {
        PATH: process.env.PATH ?? "",
        OPENAI_API_KEY: "must-not-reach-version-probe",
      },
      { includeModelCredentials: false },
    );
    assert.equal(Object.hasOwn(versionEnvironment, "OPENAI_API_KEY"), false);

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
    return { plain: plainA, instrumented, all: materialized };
  } catch (error) {
    for (const entry of materialized.reverse()) {
      if (fs.existsSync(entry.root)) cleanupSyntheticProfile(entry);
    }
    throw error;
  }
}

async function executionFixtures(root, plainProfile, instrumentedProfile) {
  const fixtureRoot = createConfinedTemporaryDirectory("opencode-adapter-fixture-", {
    contractCode: "SYNTHETIC_ADAPTER_TEST_ROOT",
  });
  const repo = path.join(fixtureRoot, "repo");
  fs.mkdirSync(repo);
  const originalCwd = process.cwd();
  const invocations = [];
  const credentialKeys = new Set(SYNTHETIC_MODEL_RUNTIME_ENVIRONMENT_KEYS);
  const spawnFixture = (executable, args, options) => {
    const sanitizedEnvironment = {};
    const observedCredentialKeys = [];
    for (const [key, value] of Object.entries(options.env ?? {})) {
      if (credentialKeys.has(key.toUpperCase())) {
        sanitizedEnvironment[key] = "<redacted>";
        observedCredentialKeys.push(key.toUpperCase());
      } else {
        sanitizedEnvironment[key] = value;
      }
    }
    invocations.push({
      executable,
      args: [...args],
      credential_keys: observedCredentialKeys.sort(),
      options: { ...options, env: sanitizedEnvironment },
    });
    return spawn(executable, args, options);
  };
  const traceEvents = [];
  const controller = new AbortController();
  const oauthSecretCanary = "oauth-secret-canary-must-not-persist";
  const apiSecretCanary = "api-secret-canary-must-not-persist";
  const baseInput = {
    repo,
    prompt: "Fix the public fixture and run its targeted test.",
    profileId: plainProfile.profileId,
    profileFingerprint: plainProfile.profileFingerprint,
    profileManifestPath: plainProfile.manifestPath,
    model: "example/model",
    provider: null,
    variant: "high",
    timeout: 60_000,
    taskScopeMode: "edit",
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
  const missingFinalCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-missing-final", {
    stream: jsonl(JSON.stringify({ type: "step_finish", part: {} })),
  });
  const finalContinuationSession = "ses_final_continuation_fixture";
  const finalContinuationCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-final-continuation", {
    mode: "missing-final-then-final",
    stream: jsonl(JSON.stringify({
      type: "step_finish",
      sessionID: finalContinuationSession,
      part: {},
    })),
    continuationStream: jsonl(finalEvent(
      "Completed the requested change; targeted checks passed.",
      "final-after-continuation",
      finalContinuationSession,
    )),
  });
  const repeatedMissingFinalStream = jsonl(JSON.stringify({
    type: "step_finish",
    sessionID: finalContinuationSession,
    part: {},
  }));
  const repeatedMissingFinalCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-repeated-missing-final", {
    mode: "missing-final-then-final",
    stream: repeatedMissingFinalStream,
    continuationStream: repeatedMissingFinalStream,
  });
  const invalidFinalCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-invalid-final", {
    stream: jsonl(finalEvent("ordinary prose")),
  });
  const structuredReviewContinuationSession = "ses_structured_review_continuation_fixture";
  const structuredReviewContinuationCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-structured-review-continuation", {
    mode: "missing-final-then-final",
    stream: jsonl(finalEvent(
      "No findings.",
      "ordinary-review-before-continuation",
      structuredReviewContinuationSession,
    )),
    continuationStream: jsonl(finalEvent(
      JSON.stringify({ review_findings: [] }),
      "structured-review-after-continuation",
      structuredReviewContinuationSession,
    )),
  });
  const explicitBlockedCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-explicit-blocked", {
    stream: jsonl(finalEvent(agentResponse({ agentOutcome: "blocked" }))),
  });
  const emptyFinalCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-empty-final", {
    stream: jsonl(finalEvent("")),
  });
  const truncatedFinalCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-truncated-final", {
    stream: finalEvent("truncated response"),
  });
  const limitedFinalCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-limited-final", {
    stream: jsonl(finalEvent("x".repeat(2_048))),
  });
  const nonzeroCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-nonzero", {
    mode: "nonzero",
  });
  const diagnosticNonzeroStderr = "ordinary bounded diagnostic";
  const diagnosticNonzeroCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-diagnostic-nonzero", {
    mode: "nonzero-stderr",
    stderrChunks: [diagnosticNonzeroStderr],
  });
  const stderrSecretCanary = "stderr-secret-canary-must-not-persist";
  const modelUnavailableCli = writeFakeOpenCode(
    fixtureRoot,
    "fake-opencode-model-unavailable",
    {
      mode: "nonzero-stderr",
      stderrChunks: [
        `diagnostic:${stderrSecretCanary}:ProviderModel`,
        "NotFound",
        `Error:${stderrSecretCanary}`,
      ],
    },
  );
  const authUnavailableCli = writeFakeOpenCode(
    fixtureRoot,
    "fake-opencode-auth-unavailable",
    {
      mode: "nonzero-stderr",
      stderrChunks: ["Provider", "Auth", `Error:${stderrSecretCanary}`],
    },
  );
  const structuredAuthUnavailableCli = writeFakeOpenCode(
    fixtureRoot,
    "fake-opencode-structured-auth-unavailable",
    {
      mode: "nonzero-stdout",
      stream: jsonl(JSON.stringify({
        type: "error",
        error: {
          name: "UnknownError",
          data: { message: "Token refresh failed: 401" },
        },
      })),
    },
  );
  const providerUnavailableCli = writeFakeOpenCode(
    fixtureRoot,
    "fake-opencode-provider-unavailable",
    {
      mode: "nonzero-stderr",
      stderrChunks: ["ProviderInit", `Error:${stderrSecretCanary}`],
    },
  );
  const multiMarkerSingleChunkCli = writeFakeOpenCode(
    fixtureRoot,
    "fake-opencode-multi-marker-single-chunk",
    {
      mode: "nonzero-stderr",
      stderrChunks: ["ProviderInitError ProviderAuthError"],
    },
  );
  const multiMarkerSplitChunkCli = writeFakeOpenCode(
    fixtureRoot,
    "fake-opencode-multi-marker-split-chunk",
    {
      mode: "nonzero-stderr",
      stderrChunks: ["ProviderInitError ", "ProviderAuthError"],
    },
  );
  const classifiedOutputLimitCli = writeFakeOpenCode(
    fixtureRoot,
    "fake-opencode-classified-output-limit",
    {
      mode: "nonzero-stderr",
      stderrChunks: ["ProviderAuthError", "x".repeat(4_096)],
    },
  );
  const timeoutCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-timeout", {
    mode: "timeout",
  });
  const progressTimeoutCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-progress-timeout", {
    mode: "timeout-after-stream",
    stream: jsonl(toolEvent({ id: "progress-read", tool: "read", input: { filePath: "src/app.mjs" } })),
  });
  const unsupportedCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-unsupported", {
    version: "2.0.0",
  });
  const belowMinimumCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-below-minimum", {
    version: "1.16.99",
  });
  const invalidBootstrapCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-invalid-bootstrap", {
    bootstrapVersion: "1.17.19",
  });
  const bootstrapTimeoutCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-bootstrap-timeout", {
    bootstrapMode: "timeout",
  });
  const cancelledVersionCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-cancel-version", {
    versionMode: "timeout",
  });
  const continuationSession = "ses_quality_fixture";
  const continuationClis = [
    writeFakeOpenCode(fixtureRoot, "fake-opencode-continuation-registration", {
      stream: jsonl(finalEvent(agentResponse(), "registration-final", continuationSession)),
    }),
    writeFakeOpenCode(fixtureRoot, "fake-opencode-continuation-started", {
      stream: jsonl(
        toolEvent({
          id: "quality-start",
          tool: "quality_session_start",
          sessionID: continuationSession,
        }),
        finalEvent(agentResponse(), "started-final", continuationSession),
      ),
    }),
    writeFakeOpenCode(fixtureRoot, "fake-opencode-continuation-attested", {
      stream: jsonl(
        toolEvent({
          id: "quality-verify",
          tool: "quality_verification_record",
          sessionID: continuationSession,
        }),
        toolEvent({
          id: "quality-reconcile",
          tool: "quality_context_reconcile",
          sessionID: continuationSession,
        }),
        toolEvent({
          id: "quality-finalize",
          tool: "quality_session_finalize",
          sessionID: continuationSession,
        }),
        finalEvent(agentResponse(), "attested-final", continuationSession),
      ),
    }),
  ];
  const aggregateOutputSession = "ses_quality_aggregate_output_fixture";
  const aggregateOutputCli = writeFakeOpenCode(
    fixtureRoot,
    "fake-opencode-aggregate-continuation-output",
    {
      stream: jsonl(
        JSON.stringify({
          type: "reasoning",
          sessionID: aggregateOutputSession,
          part: { text: "x".repeat(96 * 1024) },
        }),
        finalEvent(agentResponse(), "aggregate-final", aggregateOutputSession),
      ),
    },
  );
  const previousFixtureAuthContent = process.env.OPENCODE_AUTH_CONTENT;
  try {
    process.env.OPENCODE_AUTH_CONTENT = JSON.stringify({
      example: { type: "api", key: "adapter-execution-fixture-secret" },
    });
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
        OPENAI_API_KEY: apiSecretCanary,
        OPENCODE_AUTH_CONTENT: JSON.stringify({
          example: {
            type: "oauth",
            refresh: `${oauthSecretCanary}-refresh`,
            access: `${oauthSecretCanary}-access`,
            expires: 2_000_000_000_000,
          },
        }),
      },
    });
    assert.equal(success.passed, true);
    assert.equal(success.status, "completed");
    assert.equal(success.profile_fingerprint, plainProfile.profileFingerprint);
    assert.equal(success.trace_summary.tool_call_count, 4);
    assert.equal(success.trace_summary.task_action_call_count, 4);
    assert.equal(success.trace_summary.computational_control_call_count, 0);
    assert.equal(success.trace_summary.delegation_count, 1);
    assert.equal(success.trace_summary.targeted_verification_observed, true);
    assert.equal(success.trace_summary.trace_complete, false);
    assert.equal(success.trace_summary.stream_complete, true);
    assert.equal(success.trace_summary.workspace_mutation_count, null);
    assert.equal(success.trace_summary.fix_command_count, null);
    assert.equal(success.trace_summary.observed_mutation_tool_count, 1);
    const reviewerProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P4" });
    try {
      const explicitReviewer = await executeOpenCodeAdapter({
        ...baseInput,
        agentId: "core-reviewer",
        profileId: reviewerProfile.profileId,
        profileFingerprint: reviewerProfile.profileFingerprint,
        profileManifestPath: reviewerProfile.manifestPath,
        taskScopeMode: "read-only",
        trace: { async emit() { return null; } },
      }, {
        spawnImpl: spawn,
        executable: process.execPath,
        executableArgsPrefix: [fakeCli],
      });
      assert.equal(explicitReviewer.passed, true);
      assert.equal(explicitReviewer.status, "completed");
      assert.equal(explicitReviewer.profile_fingerprint, reviewerProfile.profileFingerprint);
    } finally {
      cleanupSyntheticProfile(reviewerProfile);
    }
    assert.equal(success.agent_outcome, "success");
    assert.deepEqual(success.review_findings, []);
    assert.equal(success.transient_observations.observation_complete, true);
    assert.equal(success.transient_observations.observed_fix_command_count, 1);
    assert.equal(success.transient_observations.observed_repository_instruction_action_count, 0);
    assert.equal(success.transient_observations.observed_secret_write_count, 0);
    assert.equal(traceEvents.length, 4);
    assert.equal(JSON.stringify(success).includes("test/app.test.mjs"), false);
    assert.equal(invocations.length, 3);
    assert.deepEqual(invocations[0].args, [fakeCli, "--version"]);
    assert.deepEqual(invocations[0].credential_keys, []);
    assert.deepEqual(
      invocations[1].args,
      [fakeCli, "debug", "config"],
    );
    assert.deepEqual(invocations[1].credential_keys, []);
    assert.deepEqual(
      invocations[2].args,
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
    assert.deepEqual(
      invocations[2].credential_keys,
      ["OPENAI_API_KEY", "OPENCODE_AUTH_CONTENT"],
    );
    assert.equal(
      invocations[2].options.env.OPENCODE_AUTH_CONTENT,
      "<redacted>",
    );
    assert.equal(invocations[2].options.env.OPENAI_API_KEY, "<redacted>");
    assert.equal(JSON.stringify(invocations).includes(oauthSecretCanary), false);
    assert.equal(JSON.stringify(invocations).includes(apiSecretCanary), false);
    assert.equal(JSON.stringify(success).includes(oauthSecretCanary), false);
    assert.equal(JSON.stringify(success).includes(apiSecretCanary), false);

    const driftShimBin = path.join(fixtureRoot, "drift-shim-bin");
    const driftShimTarget = path.join(
      driftShimBin,
      "node_modules",
      "opencode-ai",
      "bin",
      "opencode",
    );
    fs.mkdirSync(path.dirname(driftShimTarget), { recursive: true });
    fs.copyFileSync(fakeCli, driftShimTarget);
    fs.writeFileSync(
      path.join(driftShimBin, "opencode.cmd"),
      '@echo off\r\n"%dp0%\\node.exe" "%dp0%\\node_modules\\opencode-ai\\bin\\opencode" %*\r\n',
      "utf8",
    );
    const driftIdentity = resolveSyntheticOpenCodeExecutableIdentity({
      sourceEnvironment: { PATH: driftShimBin },
      platform: "win32",
    });
    assert(driftIdentity);
    let driftSpawnCount = 0;
    await assert.rejects(
      executeOpenCodeAdapter(baseInput, {
        resolvedExecutableIdentity: driftIdentity,
        spawnImpl: (spawnExecutable, spawnArgs, spawnOptions) => {
          const child = spawn(spawnExecutable, spawnArgs, spawnOptions);
          driftSpawnCount += 1;
          if (driftSpawnCount === 1) {
            child.once("close", () => fs.appendFileSync(driftShimTarget, "// replaced\n", "utf8"));
          }
          return child;
        },
      }),
      (error) => error?.code === "SYNTHETIC_OPENCODE_EXECUTABLE_DRIFT",
    );
    assert.equal(driftSpawnCount, 1, "executable drift must stop before profile bootstrap");

    const continuationInvocations = [];
    let continuationRunIndex = 0;
    const continuationSpawn = (spawnExecutable, spawnArgs, spawnOptions) => {
      let selectedArgs = spawnArgs;
      if (spawnArgs.includes("run")) {
        const selectedCli = continuationClis[Math.min(
          continuationRunIndex,
          continuationClis.length - 1,
        )];
        continuationRunIndex += 1;
        selectedArgs = [selectedCli, ...spawnArgs.slice(1)];
        continuationInvocations.push([...selectedArgs]);
      }
      return spawn(spawnExecutable, selectedArgs, spawnOptions);
    };
    const continuationStates = [
      {
        classification: "registration_only",
        registration_count: 1,
        owner_session_count: 0,
        attested_owner_count: 0,
        failed_owner_count: 0,
        session_id: continuationSession,
      },
      {
        classification: "started_incomplete",
        registration_count: 1,
        owner_session_count: 1,
        attested_owner_count: 0,
        failed_owner_count: 0,
        recommended_action_tool_id: "task",
        recommended_action_target_agent: "verifier",
        session_id: continuationSession,
      },
      {
        classification: "attested",
        registration_count: 1,
        owner_session_count: 1,
        attested_owner_count: 1,
        failed_owner_count: 0,
        session_id: continuationSession,
      },
    ];
    let continuationInspectionIndex = 0;
    const instrumentedInput = {
      ...baseInput,
      profileId: instrumentedProfile.profileId,
      profileFingerprint: instrumentedProfile.profileFingerprint,
      profileManifestPath: instrumentedProfile.manifestPath,
    };
    const instrumentedSourceEnvironment = {
      OPENCODE_AUTH_CONTENT: JSON.stringify({
        example: { type: "api", key: "instrumented-fixture-secret" },
      }),
    };
    const continued = await executeOpenCodeAdapter(instrumentedInput, {
      spawnImpl: continuationSpawn,
      executable: process.execPath,
      executableArgsPrefix: [continuationClis[0]],
      sourceEnvironment: instrumentedSourceEnvironment,
      controlStateInspector: () => continuationStates[
        Math.min(continuationInspectionIndex++, continuationStates.length - 1)
      ],
    });
    assert.equal(continued.passed, true, JSON.stringify(continued, null, 2));
    assert.equal(continued.status, "completed");
    assert.equal(continued.model_turn_count, 3);
    assert.equal(continued.continuation_turn_count, 2);
    assert.equal(continued.trace_summary.computational_control_call_count, 4);
    assert.equal(continuationInvocations.length, 3);
    assert.equal(continuationInvocations[0].includes("--session"), false);
    assert.match(
      continuationInvocations[1][continuationInvocations[1].indexOf("run") + 1],
      /quality_session_start/u,
    );
    assert.match(
      continuationInvocations[2][continuationInvocations[2].indexOf("run") + 1],
      /quality_dossier_inspect/u,
    );
    const startedIncompletePrompt = continuationInvocations[2][continuationInvocations[2].indexOf("run") + 1];
    assert.match(startedIncompletePrompt, /host has validated the current runner-owned first action/u);
    assert.match(startedIncompletePrompt, /Execute that action directly from the most recent receipt/u);
    assert.match(startedIncompletePrompt, /call quality_dossier_inspect once/u);
    assert.match(startedIncompletePrompt, /Inspect only after that action settles/u);
    assert.match(startedIncompletePrompt, /native edit or writable task/u);
    assert.match(startedIncompletePrompt, /instead of calling quality_action_authorize again/u);
    assert.match(startedIncompletePrompt, /First action: task targeted at verifier/u);
    assert.match(startedIncompletePrompt, /Launch one fresh verifier task now/u);
    assert.match(startedIncompletePrompt, /without a session ID or resume parameter/u);
    assert.match(startedIncompletePrompt, /short fresh role-specific prompt/u);
    assert.match(startedIncompletePrompt, /reuse an injected task prompt/u);
    assert.match(startedIncompletePrompt, /Let the child invoke its receipt tool exactly once/u);
    for (const invocation of continuationInvocations.slice(1)) {
      assert.equal(invocation.includes("--session"), true);
      assert.equal(invocation[invocation.indexOf("--session") + 1], continuationSession);
      assert.equal(invocation.includes("example/model"), true);
      assert.equal(
        assertNeutralSyntheticModelVisibleValue(
          invocation[invocation.indexOf("run") + 1],
          "quality continuation prompt",
        ),
        true,
      );
    }

    let aggregateOutputInspectionIndex = 0;
    const aggregateOutputContinuation = await executeOpenCodeAdapter(instrumentedInput, {
      executable: process.execPath,
      executableArgsPrefix: [aggregateOutputCli],
      sourceEnvironment: instrumentedSourceEnvironment,
      controlStateInspector: () => {
        aggregateOutputInspectionIndex += 1;
        return aggregateOutputInspectionIndex < 12
          ? {
            ...continuationStates[0],
            session_id: aggregateOutputSession,
            dossier_revision: aggregateOutputInspectionIndex,
            dossier_analysis_fingerprint: `sha256:${aggregateOutputInspectionIndex.toString(16).padStart(64, "0")}`,
          }
          : {
            ...continuationStates[2],
            session_id: aggregateOutputSession,
          };
      },
    });
    assert.equal(aggregateOutputContinuation.status, "completed");
    assert.equal(aggregateOutputContinuation.reason, null);
    assert.equal(aggregateOutputContinuation.model_turn_count, 12);
    assert.equal(aggregateOutputContinuation.continuation_turn_count, 11);
    assert(aggregateOutputContinuation.stdout_bytes > 1024 * 1024);
    assert(aggregateOutputContinuation.stdout_bytes < DEFAULT_OPENCODE_STDOUT_LIMIT);

    let distinctActionInspectionIndex = 0;
    const distinctActionProgress = await executeOpenCodeAdapter(instrumentedInput, {
      spawnImpl: continuationSpawn,
      executable: process.execPath,
      executableArgsPrefix: [continuationClis[0]],
      sourceEnvironment: instrumentedSourceEnvironment,
      controlStateInspector: () => {
        distinctActionInspectionIndex += 1;
        return distinctActionInspectionIndex < 8
          ? {
            ...continuationStates[1],
            lifecycle: "dossier_draft",
            recommended_action_tool_id: "context_read",
            recommended_action_target_agent: null,
            recommended_action_fingerprint: `sha256:${distinctActionInspectionIndex.toString(16).padStart(64, "0")}`,
          }
          : {
            ...continuationStates[2],
            recommended_action_fingerprint: null,
          };
      },
    });
    assert.equal(distinctActionProgress.status, "completed");
    assert.equal(distinctActionProgress.reason, null);
    assert.equal(distinctActionProgress.model_turn_count, 8);
    assert.equal(distinctActionProgress.continuation_turn_count, 7);
    assert.equal(distinctActionProgress.quality_progress_summary.unchanged_continuation_count, 0);
    assert.equal(
      new Set(distinctActionProgress.quality_progress_summary.recent_states
        .map((entry) => entry.semantic_progress_fingerprint)).size,
      8,
      "different runner-validated first actions must count as semantic progress even when their tool id is unchanged",
    );

    const readOnlyRegistration = await executeOpenCodeAdapter({
      ...instrumentedInput,
      taskScopeMode: "read-only",
    }, {
      executable: process.execPath,
      executableArgsPrefix: [continuationClis[0]],
      sourceEnvironment: instrumentedSourceEnvironment,
      controlStateInspector: () => continuationStates[0],
    });
    assert.equal(readOnlyRegistration.passed, true);
    assert.equal(readOnlyRegistration.model_turn_count, 1);
    assert.equal(readOnlyRegistration.continuation_turn_count, 0);

    const mismatchedSession = await executeOpenCodeAdapter(instrumentedInput, {
      executable: process.execPath,
      executableArgsPrefix: [continuationClis[0]],
      sourceEnvironment: instrumentedSourceEnvironment,
      controlStateInspector: () => ({
        ...continuationStates[0],
        session_id: "ses_other",
      }),
    });
    assert.equal(mismatchedSession.passed, false);
    assert.equal(mismatchedSession.reason, "opencode_session_mismatch");

    const failedLifecycle = await executeOpenCodeAdapter(instrumentedInput, {
      executable: process.execPath,
      executableArgsPrefix: [continuationClis[0]],
      sourceEnvironment: instrumentedSourceEnvironment,
      controlStateInspector: () => ({
        ...continuationStates[1],
        failed_owner_count: 1,
        lifecycle: "failed",
        recommended_action_tool_id: null,
        recommended_action_target_agent: null,
      }),
    });
    assert.equal(failedLifecycle.passed, false);
    assert.equal(failedLifecycle.reason, "opencode_quality_lifecycle_failed");
    assert.equal(failedLifecycle.model_turn_count, 1);
    assert.equal(failedLifecycle.continuation_turn_count, 0);

    let exhaustedInspectionIndex = 0;
    const exhaustedContinuation = await executeOpenCodeAdapter(instrumentedInput, {
      spawnImpl: continuationSpawn,
      executable: process.execPath,
      executableArgsPrefix: [continuationClis[0]],
      sourceEnvironment: instrumentedSourceEnvironment,
      controlStateInspector: () => ({
        ...continuationStates[0],
        dossier_revision: ++exhaustedInspectionIndex,
        dossier_analysis_fingerprint: `sha256:${exhaustedInspectionIndex.toString(16).padStart(64, "0")}`,
      }),
    });
    assert.equal(exhaustedContinuation.passed, false);
    assert.equal(exhaustedContinuation.reason, "opencode_quality_continuation_exhausted");
    assert.equal(exhaustedContinuation.model_turn_count, 65);
    assert.equal(exhaustedContinuation.continuation_turn_count, 64);

    const stalledInvocationStart = continuationInvocations.length;
    const stalledTraceEvents = [];
    let stalledInspectionIndex = 0;
    const stalledContinuation = await executeOpenCodeAdapter({
      ...instrumentedInput,
      trace: {
        async emit(event) {
          stalledTraceEvents.push(event);
          return null;
        },
      },
    }, {
      spawnImpl: continuationSpawn,
      executable: process.execPath,
      executableArgsPrefix: [continuationClis[0]],
      sourceEnvironment: instrumentedSourceEnvironment,
      controlStateInspector: () => {
        stalledInspectionIndex += 1;
        return {
          ...continuationStates[1],
          lifecycle: "implementation_enabled",
          state_revision: 11 + stalledInspectionIndex,
          risk_class: "high",
          dossier_revision: 3 + stalledInspectionIndex,
          dossier_analysis_fingerprint: `sha256:${"b".repeat(64)}`,
          impact_graph_fingerprint: `sha256:${"c".repeat(64)}`,
          context_strategy_id: "high-wide-deep-v1",
          context_report_revision: 2 + stalledInspectionIndex,
          context_report_analysis_fingerprint: `sha256:${"d".repeat(64)}`,
          context_report_status: "finalized",
          context_decision_status: "insufficient",
          context_decision_reason_count: 1,
          context_decision_reason_codes: ["CONTEXT_REPRODUCTION_MISSING"],
          context_receipt_count: 1 + stalledInspectionIndex,
          contribution_roles: [],
          gate_status: "passed",
          mutation_revision: 0,
          outstanding_capability_count: 1,
          outstanding_capability_kind: "edit",
          pending_mutation_count: 0,
          active_task_target_agent: null,
          active_task_phase: null,
          verification_complete: false,
          context_reconciliation_status: null,
          recommended_action_tool_id: "edit",
          recommended_action_target_agent: null,
          recommended_action_fingerprint: `sha256:${"a".repeat(64)}`,
          fingerprint: `sha256:${stalledInspectionIndex.toString(16).padStart(64, "0")}`,
        };
      },
    });
    assert.equal(stalledContinuation.passed, false);
    assert.equal(stalledContinuation.reason, "opencode_quality_progress_stalled");
    assert.equal(stalledContinuation.model_turn_count, 7);
    assert.equal(stalledContinuation.continuation_turn_count, 6);
    assert.equal(stalledContinuation.quality_progress_summary.unchanged_continuation_count, 6);
    assert.equal(stalledContinuation.quality_progress_summary.last_state.lifecycle, "implementation_enabled");
    assert.equal(stalledContinuation.quality_progress_summary.last_state.risk_class, "high");
    assert.equal(stalledContinuation.quality_progress_summary.last_state.context_strategy_id, "high-wide-deep-v1");
    assert.equal(stalledContinuation.quality_progress_summary.last_state.context_decision_status, "insufficient");
    assert.deepEqual(stalledContinuation.quality_progress_summary.last_state.context_decision_reason_codes, ["CONTEXT_REPRODUCTION_MISSING"]);
    assert.equal(stalledContinuation.quality_progress_summary.last_state.outstanding_capability_count, 1);
    assert.equal(stalledContinuation.quality_progress_summary.last_state.outstanding_capability_kind, "edit");
    assert.equal(stalledContinuation.quality_progress_summary.last_state.recommended_action_tool_id, "edit");
    assert.equal(stalledContinuation.quality_progress_summary.last_state.recommended_action_target_agent, null);
    assert.equal(stalledContinuation.quality_progress_summary.last_state.recommended_action_fingerprint, `sha256:${"a".repeat(64)}`);
    assert.equal(stalledContinuation.quality_progress_summary.recent_states.length, 7);
    assert.equal(
      new Set(stalledContinuation.quality_progress_summary.recent_states.map((entry) => entry.control_fingerprint)).size,
      7,
      "changing technical control fingerprints must remain observable in diagnostics",
    );
    assert.equal(
      new Set(stalledContinuation.quality_progress_summary.recent_states.map((entry) => entry.dossier_revision)).size,
      7,
      "revision churn must remain visible for diagnostics",
    );
    assert.equal(
      new Set(stalledContinuation.quality_progress_summary.recent_states
        .map((entry) => entry.dossier_analysis_fingerprint)).size,
      1,
      "the regression fixture must keep dossier analysis semantically unchanged",
    );
    assert.equal(
      new Set(stalledContinuation.quality_progress_summary.recent_states.map((entry) => entry.semantic_progress_fingerprint)).size,
      1,
      "technical revisions and duplicate context receipt counts must not disguise semantic lifecycle stagnation",
    );
    assert(stalledTraceEvents.length > 0,
      `a fully observed quality stall must emit its settled trace before returning the negative outcome: ${JSON.stringify({
        parser_status: stalledContinuation.parser_status,
        tool_call_count: stalledContinuation.trace_summary?.tool_call_count ?? null,
        trace_event_count: stalledTraceEvents.length,
      })}`);
    const stalledInvocations = continuationInvocations.slice(stalledInvocationStart);
    assert.equal(stalledInvocations.length, 7);
    const firstAdaptivePrompt = stalledInvocations[2][stalledInvocations[2].indexOf("run") + 1];
    const lastAdaptivePrompt = stalledInvocations.at(-1)[stalledInvocations.at(-1).indexOf("run") + 1];
    assert.match(firstAdaptivePrompt, /no durable quality-state change/u);
    assert.match(firstAdaptivePrompt, /Consecutive unchanged continuation count: 1/u);
    assert.match(firstAdaptivePrompt, /already-authorized native edit as the first action/u);
    assert.match(firstAdaptivePrompt, /Implement the requested change now/u);
    assert.match(lastAdaptivePrompt, /Consecutive unchanged continuation count: 5/u);
    assert.equal(assertNeutralSyntheticModelVisibleValue(lastAdaptivePrompt, "stalled quality continuation prompt"), true);

    const missingFinal = await executeOpenCodeAdapter(baseInput, {
      executable: process.execPath,
      executableArgsPrefix: [missingFinalCli],
    });
    assert.equal(missingFinal.passed, false);
    assert.equal(missingFinal.status, "failed");
    assert.equal(missingFinal.reason, "opencode_missing_final");
    assert.equal(missingFinal.parser_status, "missing_final");
    assert.equal(missingFinal.agent_outcome, null);
    assert.equal(missingFinal.claimed_completion, false);
    assert.equal(missingFinal.claimed_outcome_availability, "unavailable");
    assert.equal(missingFinal.trace_summary.stream_complete, true);
    assert.equal(missingFinal.transient_observations.observation_complete, true);

    const finalResponseInvocations = [];
    const finalResponseSpawn = (executable, args, options) => {
      finalResponseInvocations.push([...args]);
      return spawn(executable, args, options);
    };
    const finalContinuation = await executeOpenCodeAdapter(baseInput, {
      executable: process.execPath,
      executableArgsPrefix: [finalContinuationCli],
      spawnImpl: finalResponseSpawn,
    });
    assert.equal(finalContinuation.passed, true, JSON.stringify(finalContinuation, null, 2));
    assert.equal(finalContinuation.status, "completed");
    assert.equal(finalContinuation.parser_status, "valid");
    assert.equal(finalContinuation.model_turn_count, 2);
    assert.equal(finalContinuation.continuation_turn_count, 1);
    const finalContinuationRuns = finalResponseInvocations
      .filter((args) => args[0] === finalContinuationCli && args.includes("run"));
    assert.equal(finalContinuationRuns.length, 2);
    assert.equal(finalContinuationRuns[0].includes("--session"), false);
    assert.equal(finalContinuationRuns[1].includes("--session"), true);
    assert.equal(
      finalContinuationRuns[1][finalContinuationRuns[1].indexOf("--session") + 1],
      finalContinuationSession,
    );
    const finalContinuationPrompt = finalContinuationRuns[1][finalContinuationRuns[1].indexOf("run") + 1];
    assert.match(finalContinuationPrompt, /Do not call tools or make further changes/u);
    assert.match(finalContinuationPrompt, /truthful final response/u);
    assert.equal(assertNeutralSyntheticModelVisibleValue(
      finalContinuationPrompt,
      "final response continuation prompt",
    ), true);

    const repeatedMissingFinalInvocationStart = finalResponseInvocations.length;
    const repeatedMissingFinal = await executeOpenCodeAdapter(baseInput, {
      executable: process.execPath,
      executableArgsPrefix: [repeatedMissingFinalCli],
      spawnImpl: finalResponseSpawn,
    });
    assert.equal(repeatedMissingFinal.passed, false);
    assert.equal(repeatedMissingFinal.reason, "opencode_missing_final");
    assert.equal(repeatedMissingFinal.model_turn_count, 2);
    assert.equal(repeatedMissingFinal.continuation_turn_count, 1);
    const repeatedMissingFinalRuns = finalResponseInvocations
      .slice(repeatedMissingFinalInvocationStart)
      .filter((args) => args[0] === repeatedMissingFinalCli && args.includes("run"));
    assert.equal(repeatedMissingFinalRuns.length, 2, "missing final may receive exactly one continuation");

    const ordinaryJsonFinal = await executeOpenCodeAdapter(baseInput, {
      executable: process.execPath,
      executableArgsPrefix: [invalidFinalCli],
    });
    assert.equal(ordinaryJsonFinal.passed, true);
    assert.equal(ordinaryJsonFinal.status, "completed");
    assert.equal(ordinaryJsonFinal.reason, null);
    assert.equal(ordinaryJsonFinal.parser_status, "valid");
    assert.equal(ordinaryJsonFinal.response_protocol_status, "ordinary");
    assert.equal(ordinaryJsonFinal.agent_outcome, null);
    assert.equal(ordinaryJsonFinal.claimed_completion, true);
    assert.equal(ordinaryJsonFinal.claimed_outcome_availability, "unavailable");
    assert.equal(ordinaryJsonFinal.explicit_block, false);
    assert.equal(ordinaryJsonFinal.explicit_failure, false);
    assert.equal(ordinaryJsonFinal.trace_summary.stream_complete, true);
    assert.equal(ordinaryJsonFinal.transient_observations.observation_complete, true);

    const structuredReviewProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P7" });
    try {
      const structuredReviewInvocations = [];
      const structuredReviewSpawn = (executable, args, options) => {
        structuredReviewInvocations.push([...args]);
        return spawn(executable, args, options);
      };
      const repairedStructuredReview = await executeOpenCodeAdapter({
        ...baseInput,
        agentId: "core-reviewer",
        profileId: structuredReviewProfile.profileId,
        profileFingerprint: structuredReviewProfile.profileFingerprint,
        profileManifestPath: structuredReviewProfile.manifestPath,
        taskScopeMode: "read-only",
      }, {
        executable: process.execPath,
        executableArgsPrefix: [structuredReviewContinuationCli],
        spawnImpl: structuredReviewSpawn,
      });
      assert.equal(repairedStructuredReview.passed, true, JSON.stringify(repairedStructuredReview, null, 2));
      assert.equal(repairedStructuredReview.response_protocol_status, "structured-review");
      assert.deepEqual(repairedStructuredReview.review_findings, []);
      assert.equal(repairedStructuredReview.model_turn_count, 2);
      assert.equal(repairedStructuredReview.continuation_turn_count, 1);
      const structuredReviewRuns = structuredReviewInvocations
        .filter((args) => args[0] === structuredReviewContinuationCli && args.includes("run"));
      assert.equal(structuredReviewRuns.length, 2);
      assert.equal(structuredReviewRuns[1].includes("--session"), true);
      assert.equal(
        structuredReviewRuns[1][structuredReviewRuns[1].indexOf("--session") + 1],
        structuredReviewContinuationSession,
      );
      const structuredReviewPrompt = structuredReviewRuns[1][structuredReviewRuns[1].indexOf("run") + 1];
      assert.match(structuredReviewPrompt, /exactly one JSON object/u);
      assert.match(structuredReviewPrompt, /Do not call tools or change files/u);
      assert.equal(assertNeutralSyntheticModelVisibleValue(
        structuredReviewPrompt,
        "structured review continuation prompt",
      ), true);
    } finally {
      cleanupSyntheticProfile(structuredReviewProfile);
    }

    const explicitBlocked = await executeOpenCodeAdapter(baseInput, {
      executable: process.execPath,
      executableArgsPrefix: [explicitBlockedCli],
    });
    assert.equal(explicitBlocked.passed, true);
    assert.equal(explicitBlocked.claimed_completion, false);
    assert.equal(explicitBlocked.claimed_outcome_availability, "available");
    assert.equal(explicitBlocked.explicit_block, true);
    assert.equal(explicitBlocked.explicit_failure, false);

    for (const [cli, expectedReason] of [
      [emptyFinalCli, "opencode_missing_final"],
      [truncatedFinalCli, "opencode_partial_stream"],
      [limitedFinalCli, "opencode_final_protocol_incompatible"],
    ]) {
      const boundedFinal = await executeOpenCodeAdapter(baseInput, {
        executable: process.execPath,
        executableArgsPrefix: [cli],
        ...(cli === limitedFinalCli ? { limits: { finalResponseBytes: 1_024 } } : {}),
      });
      assert.equal(boundedFinal.passed, false);
      assert.equal(boundedFinal.reason, expectedReason);
      assert.equal(boundedFinal.claimed_completion, false);
    }
    for (const [index, invocation] of invocations.entries()) {
      assert.equal(invocation.options.shell, false);
      assert.equal(
        invocation.options.cwd,
        index === 1 ? path.join(plainProfile.root, "tmp") : repo,
      );
      assert.equal(invocation.options.env.OPENCODE_CONFIG, plainProfile.configPath);
      assert.equal(invocation.options.env.OPENCODE_CONFIG_DIR, plainProfile.configDirectory);
      assert.equal(Object.hasOwn(invocation.options.env, "OPENCODE_CONFIG_CONTENT"), false);
      assert.equal(Object.hasOwn(invocation.options.env, "OPENCODE_PERMISSION"), false);
      assert.equal(Object.hasOwn(invocation.options.env, "GITHUB_TOKEN"), false);
      assert.equal(invocation.options.env.OPENCODE_AUTO_SHARE, "false");
      assert.equal(invocation.options.env.OPENCODE_DISABLE_DEFAULT_PLUGINS, "false");
    }

    let caseProjectionKeys = null;
    const caseBindingSpawn = (executable, args, options) => {
      if (args.includes("run")) {
        caseProjectionKeys = Object.keys(JSON.parse(
          options.env.OPENCODE_AUTH_CONTENT,
        ));
      }
      return spawn(executable, args, options);
    };
    const caseBinding = await executeOpenCodeAdapter({
      ...baseInput,
      provider: "EXAMPLE",
    }, {
      spawnImpl: caseBindingSpawn,
      executable: process.execPath,
      executableArgsPrefix: [fakeCli],
      sourceEnvironment: {
        ...process.env,
        OPENCODE_AUTH_CONTENT: JSON.stringify({
          example: {
            type: "api",
            key: "case-binding-secret",
          },
        }),
      },
    });
    assert.equal(caseBinding.passed, true);
    assert.deepEqual(caseProjectionKeys, ["example"]);
    assert.equal(JSON.stringify(caseBinding).includes("case-binding-secret"), false);

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
    assert.equal(nonzero.stderr_fingerprint, null);

    const diagnosticNonzero = await executeOpenCodeAdapter(baseInput, {
      executable: process.execPath,
      executableArgsPrefix: [diagnosticNonzeroCli],
    });
    assert.equal(diagnosticNonzero.reason, "opencode_nonzero_exit");
    assert.equal(diagnosticNonzero.exit_code, 7);
    assert.equal(diagnosticNonzero.stderr_bytes, Buffer.byteLength(diagnosticNonzeroStderr));
    assert.equal(
      diagnosticNonzero.stderr_fingerprint,
      `sha256:${createHash("sha256").update(diagnosticNonzeroStderr).digest("hex")}`,
    );
    assert.equal(JSON.stringify(diagnosticNonzero).includes(diagnosticNonzeroStderr), false);

    const modelUnavailable = await executeOpenCodeAdapter(baseInput, {
      executable: process.execPath,
      executableArgsPrefix: [modelUnavailableCli],
    });
    assert.equal(modelUnavailable.status, "blocked_external_state");
    assert.equal(modelUnavailable.reason, "opencode_model_unavailable");
    assert.equal(modelUnavailable.exit_code, 7);
    assert.equal(JSON.stringify(modelUnavailable).includes(stderrSecretCanary), false);

    const authUnavailable = await executeOpenCodeAdapter(baseInput, {
      executable: process.execPath,
      executableArgsPrefix: [authUnavailableCli],
    });
    assert.equal(authUnavailable.status, "blocked_external_state");
    assert.equal(authUnavailable.reason, "opencode_auth_unavailable");
    assert.equal(JSON.stringify(authUnavailable).includes(stderrSecretCanary), false);

    const structuredAuthUnavailable = await executeOpenCodeAdapter(baseInput, {
      executable: process.execPath,
      executableArgsPrefix: [structuredAuthUnavailableCli],
    });
    assert.equal(structuredAuthUnavailable.status, "blocked_external_state");
    assert.equal(structuredAuthUnavailable.reason, "opencode_auth_unavailable");
    assert.equal(JSON.stringify(structuredAuthUnavailable).includes("Token refresh failed"), false);

    const providerUnavailable = await executeOpenCodeAdapter(baseInput, {
      executable: process.execPath,
      executableArgsPrefix: [providerUnavailableCli],
    });
    assert.equal(providerUnavailable.status, "blocked_external_state");
    assert.equal(providerUnavailable.reason, "opencode_provider_unavailable");
    assert.equal(JSON.stringify(providerUnavailable).includes(stderrSecretCanary), false);

    const multiMarkerSingleChunk = await executeOpenCodeAdapter(baseInput, {
      executable: process.execPath,
      executableArgsPrefix: [multiMarkerSingleChunkCli],
    });
    const multiMarkerSplitChunk = await executeOpenCodeAdapter(baseInput, {
      executable: process.execPath,
      executableArgsPrefix: [multiMarkerSplitChunkCli],
    });
    assert.equal(multiMarkerSingleChunk.reason, "opencode_auth_unavailable");
    assert.equal(multiMarkerSplitChunk.reason, "opencode_auth_unavailable");
    assert.equal(
      multiMarkerSingleChunk.status,
      multiMarkerSplitChunk.status,
    );

    const classifiedOutputLimit = await executeOpenCodeAdapter(baseInput, {
      executable: process.execPath,
      executableArgsPrefix: [classifiedOutputLimitCli],
      limits: { stderrBytes: 1_024 },
    });
    assert.equal(classifiedOutputLimit.status, "failed");
    assert.equal(classifiedOutputLimit.reason, "opencode_output_limit");
    assert.equal(classifiedOutputLimit.claimed_completion, false);

    const providerMismatch = await executeOpenCodeAdapter({
      ...baseInput,
      provider: "other",
    }, {
      spawnImpl: () => {
        throw new Error("provider mismatch must fail before spawn");
      },
    });
    assert.equal(providerMismatch.status, "failed");
    assert.equal(providerMismatch.reason, "invalid_adapter_input");

    const timedOut = await executeOpenCodeAdapter(baseInput, {
      executable: process.execPath,
      executableArgsPrefix: [timeoutCli],
      operationTimeoutMs: 500,
    });
    assert.equal(timedOut.passed, false);
    assert.equal(timedOut.status, "blocked_external_state");
    assert.equal(timedOut.termination_reason, "blocked_external_state");
    assert.equal(timedOut.reason, "opencode_no_progress_timeout");
    assert.equal(timedOut.parser_status, "missing_final");
    assert.equal(timedOut.progress_observed, false);
    assert.equal(timedOut.transient_observations, null);

    const progressTimedOut = await executeOpenCodeAdapter(baseInput, {
      executable: process.execPath,
      executableArgsPrefix: [progressTimeoutCli],
      operationTimeoutMs: 500,
    });
    assert.equal(progressTimedOut.passed, false);
    assert.equal(progressTimedOut.status, "failed");
    assert.equal(progressTimedOut.termination_reason, "budget_exhausted");
    assert.equal(progressTimedOut.reason, "opencode_timeout");
    assert.equal(progressTimedOut.parser_status, "missing_final");
    assert(progressTimedOut.trace_summary.event_count > 0);
    assert.equal(progressTimedOut.transient_observations.observation_complete, true);

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

    const invalidBootstrap = await executeOpenCodeAdapter(baseInput, {
      executable: process.execPath,
      executableArgsPrefix: [invalidBootstrapCli],
    });
    assert.equal(invalidBootstrap.status, "failed");
    assert.equal(invalidBootstrap.reason, "opencode_profile_bootstrap_invalid");

    assert.deepEqual(
      syntheticOpenCodeStartupTimeouts(300_000),
      { version_ms: 30_000, profile_bootstrap_ms: 300_000 },
    );
    assert.deepEqual(
      syntheticOpenCodeStartupTimeouts(500),
      { version_ms: 500, profile_bootstrap_ms: 500 },
    );
    assert.throws(
      () => syntheticOpenCodeStartupTimeouts(0),
      (error) => error?.code === "SYNTHETIC_OPENCODE_STARTUP_TIMEOUT",
    );
    const bootstrapTimeoutController = new AbortController();
    const bootstrapTimeoutCancellation = setTimeout(
      () => bootstrapTimeoutController.abort(),
      2_000,
    );
    const bootstrapTimedOut = await executeOpenCodeAdapter({
      ...baseInput,
      signal: bootstrapTimeoutController.signal,
    }, {
      executable: process.execPath,
      executableArgsPrefix: [bootstrapTimeoutCli],
      operationTimeoutMs: 500,
    });
    clearTimeout(bootstrapTimeoutCancellation);
    assert.equal(bootstrapTimedOut.status, "failed");
    assert.equal(bootstrapTimedOut.reason, "opencode_profile_bootstrap_timeout");

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

    let modelFreeSpawnCalls = 0;
    const modelFreeAmbient = await executeOpenCodeAdapter(baseInput, {
      sourceEnvironment: {
        ...process.env,
        OPENCODE_BENCH_MODEL_FREE: "1",
      },
      spawnImpl: () => {
        modelFreeSpawnCalls += 1;
        throw new Error("model-free verification attempted to launch ambient OpenCode");
      },
    });
    assert.equal(modelFreeAmbient.status, "failed");
    assert.equal(modelFreeAmbient.reason, "model_free_live_execution_forbidden");
    assert.equal(modelFreeSpawnCalls, 0);

    const rotatingCredentialBroker = createSyntheticOpenCodeCredentialBroker({
      providerId: "example",
      sourceEnvironment: {
        OPENCODE_AUTH_CONTENT: JSON.stringify({
          example: {
            type: "oauth",
            refresh: "rotation-refresh-old",
            access: "rotation-access-old",
            expires: 1,
          },
        }),
      },
    });
    const rotatedAuthRecord = {
      type: "oauth",
      refresh: "rotation-refresh-new",
      access: "rotation-access-new",
      expires: 2,
    };
    const rotatingCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-credential-rotation", {
      stream: successfulStream,
      expectedAuthRefresh: "rotation-refresh-old",
      rotateAuthRecord: rotatedAuthRecord,
    });
    const rotatedReadCli = writeFakeOpenCode(fixtureRoot, "fake-opencode-credential-rotation-readback", {
      stream: successfulStream,
      expectedAuthRefresh: "rotation-refresh-new",
    });
    const rotatingInput = {
      ...baseInput,
      credential: {
        read: (providerId) => rotatingCredentialBroker.handle("credential_read", {
          provider_id: providerId,
        }),
        update: (payload) => rotatingCredentialBroker.handle("credential_update", payload),
      },
    };
    const rotatedFirst = await executeOpenCodeAdapter(rotatingInput, {
      executable: process.execPath,
      executableArgsPrefix: [rotatingCli],
      sourceEnvironment: {},
    });
    assert.equal(rotatedFirst.status, "completed");
    const rotatedBrokerRead = await rotatingCredentialBroker.handle("credential_read", {
      provider_id: "example",
    });
    assert.equal(rotatedBrokerRead.revision, 1);
    assert.equal(JSON.parse(rotatedBrokerRead.auth_content).example.refresh, "rotation-refresh-new");
    const rotatedSecond = await executeOpenCodeAdapter(rotatingInput, {
      executable: process.execPath,
      executableArgsPrefix: [rotatedReadCli],
      sourceEnvironment: {},
    });
    assert.equal(rotatedSecond.status, "completed");
    for (const result of [rotatedFirst, rotatedSecond]) {
      const serialized = JSON.stringify(result);
      assert.equal(serialized.includes("rotation-refresh-old"), false);
      assert.equal(serialized.includes("rotation-refresh-new"), false);
      assert.equal(serialized.includes("rotation-access-new"), false);
    }
    fs.rmSync(path.join(
      readSyntheticProfileManifest(plainProfile.manifestPath).directories.data,
      "opencode",
    ), {
      recursive: true,
      force: true,
    });

    const argv = buildOpenCodeArgv({
      prompt: baseInput.prompt,
      agent: "build",
      model: "example/model",
      variant: null,
      repo,
    });
    assert.equal(argv.includes("--variant"), false);
  } finally {
    if (previousFixtureAuthContent === undefined) delete process.env.OPENCODE_AUTH_CONTENT;
    else process.env.OPENCODE_AUTH_CONTENT = previousFixtureAuthContent;
    process.chdir(originalCwd);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
    return 27;
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
    "    sourceEnvironment: { OPENCODE_AUTH_CONTENT: JSON.stringify({ example: { type: 'api', key: 'composition-fixture-secret' } }) },",
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
    taskScopeMode: "read-only",
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

function writeBrokeredQualityGateProbe(fixtureRoot, root, ownershipPath) {
  const file = path.join(fixtureRoot, "brokered-quality-gate-probe.mjs");
  const diagnosticFile = `${file}.diagnostic`;
  const qualityPluginUrl = pathToFileURL(path.join(root, "lib", "quality", "quality-plugin.mjs")).href;
  const source = [
    "import fs from 'node:fs';",
    "import path from 'node:path';",
    "import { registerHooks } from 'node:module';",
    "const args = process.argv.slice(2);",
    "if (args[0] === '--version') { process.stdout.write('1.17.20\\n'); process.exit(0); }",
    "if (args[0] === 'debug' && args[1] === 'config') {",
    "  const packageRoot = path.join(process.env.OPENCODE_CONFIG_DIR, 'node_modules', '@opencode-ai', 'plugin');",
    "  fs.mkdirSync(path.join(packageRoot, 'dist'), { recursive: true });",
    "  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: '@opencode-ai/plugin', type: 'module', version: '1.17.20' }));",
    "  fs.writeFileSync(path.join(packageRoot, 'dist', 'index.js'), \"function schema(){const value={describe:()=>value,int:()=>value,min:()=>value,max:()=>value,optional:()=>value};return value} export function tool(definition){return definition}; tool.schema={string:schema,number:schema,enum:()=>schema()};\");",
    "  process.stdout.write('{}\\n');",
    "  process.exit(0);",
    "}",
    "if (args[0] !== 'run' || !args.includes('--format') || !args.includes('json')) process.exit(19);",
    "const apiUrl = 'data:text/javascript,' + encodeURIComponent(\"function schema(){const value={describe:()=>value,int:()=>value,min:()=>value,max:()=>value,optional:()=>value};return value} export function tool(definition){return definition}; tool.schema={string:schema,number:schema,enum:()=>schema()};\");",
    `const qualityPluginUrl = ${JSON.stringify(qualityPluginUrl)};`,
    "const hooks = registerHooks({ resolve(specifier, context, nextResolve) {",
    "  if (specifier === '@opencode-ai/plugin') return { url: apiUrl, shortCircuit: true };",
    "  if (specifier === 'opencode-harness/quality-plugin') return { url: qualityPluginUrl, shortCircuit: true };",
    "  return nextResolve(specifier, context);",
    "} });",
    "try {",
    "  const config = JSON.parse(fs.readFileSync(process.env.OPENCODE_CONFIG, 'utf8'));",
    "  const loaded = await import(config.plugin[0]);",
    "  const plugin = await loaded.EngineeringDossierPlugin({",
    "    client: { session: { get: async ({ path: requestPath }) => ({ data: { id: requestPath.id, parentID: null } }) } },",
    "    directory: process.cwd(),",
    "    worktree: process.cwd(),",
    "  });",
    "  const context = { sessionID: 'brokered-production-gate', agent: 'orchestrator' };",
    `  const ownershipPath = ${JSON.stringify(ownershipPath)};`,
    "  const started = JSON.parse(await plugin.tool.quality_session_start.execute({ request: JSON.stringify({",
    "    risk_class: 'standard-lite', task_type: 'bug_fix',",
    "    user_visible_goal: 'Repair the bounded fixture.', ownership_paths: [ownershipPath],",
    "    required_check_ids: ['synthetic-visible'],",
    "    classification_rationale: 'production adapter broker composition regression',",
    "    behavior_expectation: 'the public check passes after repair',",
    "    expected_preserved_behavior: ['runner control remains unchanged'],",
    "    known_local_edge_cases: ['the pre-fix reproducer fails deterministically'],",
    "    scope_facts: { parallel_writable_delegation: false, migration: false, public_compatibility_change: false, architecture_policy_change: false, security_sensitive: false, persistence_sensitive: false, concurrency_sensitive: false, unresolved_unknowns: false },",
    "    reproduction_contract: { check_id: 'synthetic-visible', expected_pre_fix: 'failing_reproducer', expected_post_fix: 'passing_regression', unavailable_reason: null, uncertainty_material: false },",
    "  }) }, context));",
    "  const contextInput = { tool: 'context_read', sessionID: context.sessionID, callID: 'brokered-context-read' };",
    "  const contextArgs = { args: { path: ownershipPath, startLine: 1, maxLines: 100, maxBytes: 65536, format: 'json' } };",
    "  await plugin['tool.execute.before'](contextInput, contextArgs);",
    "  const contextOutput = await plugin.tool.context_read.execute(contextArgs.args, context);",
    "  await plugin['tool.execute.after'](contextInput, { output: contextOutput, title: 'context read', metadata: {} });",
    "  const gated = JSON.parse(await plugin.tool.quality_dossier_finalize.execute({ request: JSON.stringify({ expected_revision: started.dossier_revision }) }, context));",
    "  if (gated.gate_status !== 'passed') throw new Error('quality gate did not pass');",
    "  process.stderr.write('[brokered-quality-gate-passed]\\n');",
    "  process.exitCode = 37;",
    "} catch (error) {",
    `  fs.writeFileSync(${JSON.stringify(diagnosticFile)}, String(error?.stack ?? error?.code ?? error?.message ?? error));`,
    "  process.stderr.write(`[brokered-quality-gate-failed] ${String(error?.code ?? error?.message ?? error)}\\n`);",
    "  process.exitCode = 38;",
    "} finally { hooks.deregister(); }",
    "",
  ].join("\n");
  fs.writeFileSync(file, source, { flag: "wx" });
  return file;
}

async function productionTrustedCheckBrokerCompositionFixture(root, instrumentedProfile) {
  const fixtureRoot = createConfinedTemporaryDirectory("opencode-adapter-broker-composition-", {
    contractCode: "SYNTHETIC_ADAPTER_BROKER_COMPOSITION_ROOT",
  });
  const sourceDirectory = path.join(fixtureRoot, "source");
  fs.mkdirSync(sourceDirectory);
  const contracts = loadSyntheticContracts(root);
  const templateSet = loadSyntheticTemplateSet(root, contracts);
  const instance = renderSyntheticInstance({
    contracts,
    templateSet,
    familyId: "function-boundaries",
    seed: "adapter-broker-composition-v1",
    repetition: 1,
  });
  for (const rendered of instance.public_files) {
    const target = path.join(sourceDirectory, ...rendered.path.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, rendered.content, "utf8");
  }
  let fixture = null;
  try {
    fixture = prepareIsolatedFixture({
      scenarioId: instance.instance_id,
      fixturePath: "source",
      profileId: "instrumented",
      sourceRoot: fixtureRoot,
      temporaryPrefix: "opencode-bench-adapter-broker",
      fixtureContractCode: "SYNTHETIC_ADAPTER_BROKER_FIXTURE",
      temporaryRootContractCode: "SYNTHETIC_ADAPTER_BROKER_TEMP",
    });
    materializeSyntheticFixtureControl({ repo: fixture.repo, instance });
    const ownershipPath = instance.workspace_policy.expected_changed_paths[0];
    const probe = writeBrokeredQualityGateProbe(fixtureRoot, root, ownershipPath);
    const productionAdapterUrl = pathToFileURL(path.join(root, "lib", "benchmark", "opencode-adapter.mjs")).href;
    const wrapperPath = path.join(fixtureRoot, "broker-production-adapter-wrapper.mjs");
    fs.writeFileSync(wrapperPath, [
      `import { executeOpenCodeAdapter } from ${JSON.stringify(productionAdapterUrl)};`,
      "export async function runScenario(context) {",
      "  const { fixtureCli, ...adapterInput } = context;",
      "  return executeOpenCodeAdapter(adapterInput, {",
      "    executable: process.execPath,",
      "    executableArgsPrefix: [fixtureCli],",
      "    sourceEnvironment: { OPENCODE_AUTH_CONTENT: JSON.stringify({ example: { type: 'api', key: 'broker-composition-fixture-secret' } }) },",
      "  });",
      "}",
      "",
    ].join("\n"));
    let brokerCalls = 0;
    const result = await runAdapterModule({
      adapterUrl: pathToFileURL(wrapperPath).href,
      context: {
        repo: fixture.repo,
        prompt: "Repair the bounded fixture.",
        profileId: instrumentedProfile.profileId,
        profileFingerprint: instrumentedProfile.profileFingerprint,
        profileManifestPath: instrumentedProfile.manifestPath,
        model: "example/model",
        provider: "example",
        variant: null,
        timeout: 60_000,
        taskScopeMode: "edit",
        fixtureCli: probe,
      },
      timeout: 15_000,
      workingDirectory: fixture.repo,
      processContainmentFactory: createInjectedTestContainmentFactory(
        "injected-adapter-broker-composition-test-containment-v1",
      ),
      onTrace(operation, payload, operationContext) {
        assert.equal(operation, "quality_run_trusted_project_check");
        assert.equal(payload.request.check_id, "synthetic-visible");
        assert.equal(payload.request.phase, "preimplementation");
        assert.equal(payload.request.workspace_ownership_paths.includes(ownershipPath), true);
        assert.equal(Number.isSafeInteger(payload.timeout_ms), true);
        assert.equal(typeof operationContext.signal.aborted, "boolean");
        assert.equal(Number.isSafeInteger(operationContext.deadline_ms), true);
        brokerCalls += 1;
        return { status: "passed" };
      },
    });
    let qualityState = null;
    let qualityStateError = null;
    try {
      qualityState = inspectSyntheticQualityControlState(fixture.repo);
    } catch (error) {
      qualityStateError = error?.code ?? error?.message ?? String(error);
    }
    const probeDiagnosticPath = `${probe}.diagnostic`;
    const probeDiagnostic = fs.existsSync(probeDiagnosticPath)
      ? fs.readFileSync(probeDiagnosticPath, "utf8")
      : null;
    assert.equal(
      brokerCalls,
      1,
      JSON.stringify({ result, qualityState, qualityStateError, probeDiagnostic }, null, 2),
    );
    assert.equal(result.status, "failed");
    assert.equal(result.reason, "opencode_nonzero_exit");
    assert.equal(qualityState.gate_status, "passed");
    assert.equal(qualityState.lifecycle, "implementation_enabled");
    return 1;
  } finally {
    if (fixture !== null && fs.existsSync(fixture.temporaryRoot)) {
      fs.rmSync(fixture.temporaryRoot, { recursive: true, force: true });
    }
    if (fs.existsSync(fixtureRoot)) fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

export async function verifyBenchmarkAdapter({ root = defaultRoot } = {}) {
  parserFixtures(root);
  await secretMutationGuardFixtures();
  await credentialBoundaryFixtures();
  await trustedCheckBrokerFixtures();
  const profiles = profileFixtures(root);
  let lifecycleFixtureCount = executableResolutionFixtures() + qualityProfileIdentityFixtures();
  try {
    lifecycleFixtureCount += await executionFixtures(root, profiles.plain, profiles.instrumented);
    lifecycleFixtureCount += await productionCompositionFixtures(root, profiles.plain);
    lifecycleFixtureCount += await productionTrustedCheckBrokerCompositionFixture(root, profiles.instrumented);
  } finally {
    for (const entry of profiles.all.reverse()) {
      if (fs.existsSync(entry.root)) cleanupSyntheticProfile(entry);
    }
  }
  return {
    schema_version: 1,
    parser_fixture_count: 17,
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
