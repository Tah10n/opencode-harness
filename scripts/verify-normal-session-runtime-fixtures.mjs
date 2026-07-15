import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { NORMAL_SESSION_QUALITY_TOOL_IDS } from "../lib/quality/normal-session-bridge.mjs";
import {
  NORMAL_SESSION_HOST_EVIDENCE_PRODUCER,
  blockedNormalSessionHostReceipt,
  classifyQualityPluginApiProbe,
  normalSessionRuntimeSourceFingerprint,
  parseNormalSessionHostEvidence,
} from "../lib/quality/runtime-hook-verification.mjs";
import { ContractError, fingerprint } from "../lib/quality/validation.mjs";

const root = fs.realpathSync(new URL("..", import.meta.url));
const now = Date.UTC(2026, 6, 15, 12, 0, 0);
const sourceFingerprint = fingerprint({ source: "current" });
const workspaceFingerprint = fingerprint({ workspace: "probe" });
const finalWorkspaceFingerprint = fingerprint({ workspace: "probe-after" });
const runNonce = "host-e2e-fixture-nonce";
const hookKeys = ["chat_message", "permission_ask", "tool_execute_before", "tool_execute_after", "event"];

function evidence(overrides = {}) {
  const body = {
    schema_version: 1,
    producer: NORMAL_SESSION_HOST_EVIDENCE_PRODUCER,
    generated_at: new Date(now).toISOString(),
    run_nonce: runNonce,
    runtime_version: "1.17.20",
    plugin_source_fingerprint: sourceFingerprint,
    probe_workspace_fingerprint: workspaceFingerprint,
    final_workspace_fingerprint: finalWorkspaceFingerprint,
    plugin_discovered: true,
    hook_surface: Object.fromEntries(hookKeys.map((key) => [key, true])),
    hook_invocations: Object.fromEntries(hookKeys.map((key) => [key, true])),
    effective_permissions_match: true,
    session_registered_unclassified: true,
    unclassified_edit_blocked: true,
    pre_gate_edit_blocked: true,
    pre_gate_writable_task_blocked: true,
    pre_gate_mutating_bash_blocked: true,
    standard_lite_session_started: true,
    one_shot_mutation_authorized: true,
    authorized_exact_command_observed: true,
    authorized_mutation_completed: true,
    after_hook_reconciled_workspace: true,
    replayed_command_blocked: true,
    project_check_passed: true,
    final_attestation_created: true,
    probe_file_unchanged: true,
    raw_output_persisted: false,
    ...overrides,
  };
  return { ...body, evidence_fingerprint: fingerprint(body) };
}

function parse(value, options = {}) {
  return parseNormalSessionHostEvidence(JSON.stringify(value), {
    expectedSourceFingerprint: sourceFingerprint,
    expectedWorkspaceFingerprint: workspaceFingerprint,
    expectedFinalWorkspaceFingerprint: finalWorkspaceFingerprint,
    expectedRunNonce: runNonce,
    now: () => now,
    ...options,
  });
}

const passed = parse(evidence());
assert.equal(passed.status, "evidence_valid");
assert.deepEqual(passed.reason_codes, []);

for (const [label, value, reason] of [
  ["missing plugin", evidence({ plugin_discovered: false }), "QUALITY_HOST_PLUGIN_NOT_DISCOVERED"],
  ["missing hook", evidence({ hook_surface: { ...evidence().hook_surface, chat_message: false } }), "QUALITY_HOST_HOOK_MISSING_CHAT_MESSAGE"],
  ["hook not invoked", evidence({ hook_invocations: { ...evidence().hook_invocations, tool_execute_before: false } }), "QUALITY_HOST_HOOK_NOT_INVOKED_TOOL_EXECUTE_BEFORE"],
  ["edit not blocked", evidence({ pre_gate_edit_blocked: false }), "QUALITY_HOST_PRE_GATE_EDIT_NOT_BLOCKED"],
  ["file changed", evidence({ probe_file_unchanged: false }), "QUALITY_HOST_PROBE_FILE_CHANGED"],
  ["permission mismatch", evidence({ effective_permissions_match: false }), "QUALITY_HOST_PERMISSION_MISMATCH"],
  ["bash not blocked", evidence({ pre_gate_mutating_bash_blocked: false }), "QUALITY_HOST_PRE_GATE_BASH_NOT_BLOCKED"],
  ["standard-lite missing", evidence({ standard_lite_session_started: false }), "QUALITY_HOST_STANDARD_LITE_NOT_STARTED"],
  ["capability missing", evidence({ one_shot_mutation_authorized: false }), "QUALITY_HOST_CAPABILITY_NOT_AUTHORIZED"],
  ["mutation incomplete", evidence({ authorized_mutation_completed: false }), "QUALITY_HOST_AUTHORIZED_MUTATION_NOT_COMPLETED"],
  ["after hook not reconciled", evidence({ after_hook_reconciled_workspace: false }), "QUALITY_HOST_AFTER_HOOK_NOT_RECONCILED"],
  ["command replay", evidence({ replayed_command_blocked: false }), "QUALITY_HOST_COMMAND_REPLAY_NOT_BLOCKED"],
  ["project check missing", evidence({ project_check_passed: false }), "QUALITY_HOST_PROJECT_CHECK_NOT_PASSED"],
  ["attestation missing", evidence({ final_attestation_created: false }), "QUALITY_HOST_FINAL_ATTESTATION_MISSING"],
  ["raw output", evidence({ raw_output_persisted: true }), "QUALITY_HOST_RAW_OUTPUT_PERSISTED"],
]) {
  const receipt = parse(value);
  assert.equal(receipt.status, "evidence_invalid", label);
  assert(receipt.reason_codes.includes(reason), label);
}

const stale = evidence({ generated_at: new Date(now - 60 * 60 * 1000).toISOString() });
assert(parse(stale).reason_codes.includes("QUALITY_HOST_EVIDENCE_STALE"));
const wrongSource = evidence({ plugin_source_fingerprint: fingerprint({ source: "other" }) });
assert(parse(wrongSource).reason_codes.includes("QUALITY_HOST_EVIDENCE_SOURCE_MISMATCH"));
const wrongWorkspace = evidence({ probe_workspace_fingerprint: fingerprint({ workspace: "other" }) });
assert(parse(wrongWorkspace).reason_codes.includes("QUALITY_HOST_EVIDENCE_WORKSPACE_MISMATCH"));
const wrongFinalWorkspace = evidence({ final_workspace_fingerprint: fingerprint({ workspace: "other-after" }) });
assert(parse(wrongFinalWorkspace).reason_codes.includes("QUALITY_HOST_EVIDENCE_FINAL_WORKSPACE_MISMATCH"));
const wrongNonce = evidence({ run_nonce: "another-nonce" });
assert(parse(wrongNonce).reason_codes.includes("QUALITY_HOST_EVIDENCE_NONCE_MISMATCH"));

const forged = evidence();
forged.plugin_discovered = false;
assert.throws(() => parse(forged), (error) => error instanceof ContractError && error.code === "QUALITY_HOST_EVIDENCE_FINGERPRINT");

const apiPassed = classifyQualityPluginApiProbe({
  runtime_version: "1.17.20",
  plugin_api_version: "1.4.7",
  api_loaded: true,
  api_parseable: true,
  hook_surface: Object.fromEntries(hookKeys.map((key) => [key, true])),
  tool_ids: [...NORMAL_SESSION_QUALITY_TOOL_IDS],
  unclassified_edit_denied: true,
  unclassified_mutating_bash_denied: true,
  source_fingerprint: sourceFingerprint,
});
assert.equal(apiPassed.status, "passed");
const apiMissing = classifyQualityPluginApiProbe({
  runtime_version: null,
  plugin_api_version: null,
  api_loaded: false,
  api_parseable: false,
  hook_surface: Object.fromEntries(hookKeys.map((key) => [key, false])),
  tool_ids: [],
  unclassified_edit_denied: false,
  unclassified_mutating_bash_denied: false,
  source_fingerprint: sourceFingerprint,
});
assert.equal(apiMissing.status, "incomplete");
assert(apiMissing.reason_codes.includes("QUALITY_PLUGIN_API_UNAVAILABLE"));

assert.equal(blockedNormalSessionHostReceipt("QUALITY_HOST_RUNTIME_UNAVAILABLE", sourceFingerprint).status, "blocked_external_state");

const sourceFixture = fs.mkdtempSync(path.join(os.tmpdir(), "quality-runtime-source-fixture-"));
try {
  for (const directory of [".opencode/plugins", "lib/quality", "scripts"]) {
    fs.mkdirSync(path.join(sourceFixture, ...directory.split("/")), { recursive: true });
  }
  fs.writeFileSync(path.join(sourceFixture, ".opencode", "plugins", "engineering-dossier.mjs"), "export const plugin = true;\n", "utf8");
  fs.writeFileSync(path.join(sourceFixture, "lib", "quality", "quality-plugin.mjs"), 'export { dependency } from "./dependency.mjs";\n', "utf8");
  fs.writeFileSync(path.join(sourceFixture, "lib", "quality", "dependency.mjs"), "export const dependency = 1;\n", "utf8");
  fs.writeFileSync(path.join(sourceFixture, "lib", "quality", "runtime-hook-verification.mjs"), "export const runtime = true;\n", "utf8");
  fs.writeFileSync(path.join(sourceFixture, "scripts", "verify-normal-session-runtime.mjs"), "export const verifier = true;\n", "utf8");
  fs.writeFileSync(path.join(sourceFixture, "package.json"), "{}\n", "utf8");
  const first = normalSessionRuntimeSourceFingerprint(sourceFixture);
  fs.writeFileSync(path.join(sourceFixture, "lib", "quality", "dependency.mjs"), "export const dependency = 2;\n", "utf8");
  assert.notEqual(normalSessionRuntimeSourceFingerprint(sourceFixture), first, "transitive runtime dependencies must bind the source fingerprint");
} finally {
  fs.rmSync(sourceFixture, { recursive: true, force: true });
}

const runtimeVerifier = path.join(root, "scripts", "verify-normal-session-runtime.mjs");
const standalone = spawnSync(process.execPath, [runtimeVerifier, "--evidence", "untrusted.json"], {
  cwd: root,
  encoding: "utf8",
  shell: false,
  windowsHide: true,
  timeout: 30000,
});
assert.equal(standalone.status, 2, standalone.stderr);
const standaloneReceipt = JSON.parse(standalone.stdout);
assert.equal(standaloneReceipt.status, "blocked_external_state");
assert.deepEqual(standaloneReceipt.reason_codes, ["QUALITY_HOST_EVIDENCE_TRUST_REQUIRED"]);

const adapterFixture = fs.mkdtempSync(path.join(os.tmpdir(), "quality-runtime-adapter-fixture-"));
try {
  const adapterPath = path.join(adapterFixture, "trusted-adapter.mjs");
  const observerUrl = pathToFileURL(path.join(root, "lib", "quality", "normal-session-workspace.mjs")).href;
  const validationUrl = pathToFileURL(path.join(root, "lib", "quality", "validation.mjs")).href;
  fs.writeFileSync(adapterPath, [
    'import fs from "node:fs";',
    'import path from "node:path";',
    'import { spawnSync } from "node:child_process";',
    `import { observeContentBoundWorkspace } from ${JSON.stringify(observerUrl)};`,
    `import { fingerprint } from ${JSON.stringify(validationUrl)};`,
    'const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk);',
    'const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));',
    'fs.writeFileSync(path.join(request.probe_workspace, request.authorized_changed_path), request.expected_authorized_content, "utf8");',
    'const finalWorkspace = observeContentBoundWorkspace(request.probe_workspace);',
    `const hookKeys = ${JSON.stringify(hookKeys)};`,
    'const body = {',
    '  schema_version: 1, producer: "opencode-harness/normal-session-host-e2e-v1", generated_at: new Date().toISOString(),',
    '  run_nonce: request.run_nonce, runtime_version: "fixture-host", plugin_source_fingerprint: request.plugin_source_fingerprint,',
    '  probe_workspace_fingerprint: request.probe_workspace_fingerprint, final_workspace_fingerprint: finalWorkspace.fingerprint,',
    '  plugin_discovered: true, hook_surface: Object.fromEntries(hookKeys.map((key) => [key, true])),',
    '  hook_invocations: Object.fromEntries(hookKeys.map((key) => [key, true])), effective_permissions_match: true,',
    '  session_registered_unclassified: true, unclassified_edit_blocked: true, pre_gate_edit_blocked: true,',
    '  pre_gate_writable_task_blocked: true, pre_gate_mutating_bash_blocked: true, standard_lite_session_started: true,',
    '  one_shot_mutation_authorized: true, authorized_exact_command_observed: true, authorized_mutation_completed: true,',
    '  after_hook_reconciled_workspace: true, replayed_command_blocked: true, project_check_passed: true,',
    '  final_attestation_created: true, probe_file_unchanged: true, raw_output_persisted: false,',
    '};',
    'process.stdout.write(`${JSON.stringify({ ...body, evidence_fingerprint: fingerprint(body) })}\\n`);',
    "",
  ].join("\n"), "utf8");
  const adapterRun = spawnSync(process.execPath, [runtimeVerifier, "--adapter", adapterPath], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 60000,
  });
  assert.equal(adapterRun.status, 0, `${adapterRun.stdout}\n${adapterRun.stderr}`);
  const adapterReceipt = JSON.parse(adapterRun.stdout);
  assert.equal(adapterReceipt.status, "passed");
  assert.equal(adapterReceipt.verification_mode, "trusted_adapter");
  assert.deepEqual(adapterReceipt.reason_codes, []);

  const adapterSource = fs.readFileSync(adapterPath, "utf8");
  const authorizedMutation = 'fs.writeFileSync(path.join(request.probe_workspace, request.authorized_changed_path), request.expected_authorized_content, "utf8");';
  const unexpectedEffects = [
    ["extra untracked file", `${authorizedMutation}\nfs.writeFileSync(path.join(request.probe_workspace, "UNAUTHORIZED.txt"), "extra\\n", "utf8");`],
    ["deleted tracked file", `${authorizedMutation}\nfs.unlinkSync(path.join(request.probe_workspace, request.forbidden_probe_path));`],
    ["renamed tracked file", `${authorizedMutation}\nfs.renameSync(path.join(request.probe_workspace, request.forbidden_probe_path), path.join(request.probe_workspace, "RENAMED.txt"));`],
    ["changed HEAD", `${authorizedMutation}\nfor (const args of [["add", request.authorized_changed_path], ["-c", "user.name=OpenCode Harness", "-c", "user.email=harness@example.invalid", "commit", "-qm", "unexpected"]]) { const result = spawnSync("git", args, { cwd: request.probe_workspace, shell: false, windowsHide: true }); if (result.status !== 0) throw new Error("unexpected fixture commit failed"); }`],
  ];
  for (const [label, mutation] of unexpectedEffects) {
    fs.writeFileSync(adapterPath, adapterSource.replace(authorizedMutation, mutation), "utf8");
    const escapedEffectRun = spawnSync(process.execPath, [runtimeVerifier, "--adapter", adapterPath], {
      cwd: root,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
      timeout: 60000,
    });
    assert.equal(escapedEffectRun.status, 1, `${label}: ${escapedEffectRun.stdout}\n${escapedEffectRun.stderr}`);
    const escapedEffectReceipt = JSON.parse(escapedEffectRun.stdout);
    assert.equal(escapedEffectReceipt.status, "verification_failed", label);
    const expectedReason = label === "changed HEAD"
      ? "QUALITY_WORKSPACE_HEAD_CHANGED"
      : "QUALITY_HOST_UNEXPECTED_WORKSPACE_EFFECT";
    assert.deepEqual(escapedEffectReceipt.reason_codes, [expectedReason], label);
  }
} finally {
  fs.rmSync(adapterFixture, { recursive: true, force: true });
}

console.log("Normal-session runtime evidence fixtures passed.");
