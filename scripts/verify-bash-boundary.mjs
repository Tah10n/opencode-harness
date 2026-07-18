import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createDefaultNormalSessionCheckCatalog,
  createNormalSessionQualityBridge,
  executeNormalSessionQualityTool,
  handleNormalSessionChatMessage,
  handleNormalSessionPermission,
  handleNormalSessionToolAfter,
  handleNormalSessionToolBefore,
} from "../lib/quality/normal-session-bridge.mjs";
import { ContractError, fingerprint } from "../lib/quality/validation.mjs";
import { contextReadToolOutput } from "./context-test-fixtures.mjs";

function expectCode(callback, code) {
  assert.throws(callback, (error) => error instanceof ContractError && error.code === code);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-bash-boundary-"));
fs.mkdirSync(path.join(tempRoot, "src"));
fs.writeFileSync(path.join(tempRoot, "src", "file.mjs"), "export const value = 1;\n", "utf8");

const entries = [];
let id = 0;
const headSha = "c".repeat(40);
const indexFingerprint = fingerprint({ index: "bash-boundary-fixture" });
const observeWorkspace = () => {
  const normalizedEntries = entries.map((entry) => ({ ...entry })).sort((left, right) => left.path.localeCompare(right.path));
  const source = {
    schema_version: 3,
    head_sha: headSha,
    index_entry_count: 0,
    index_fingerprint: indexFingerprint,
    entries: normalizedEntries,
    dirty: normalizedEntries.length > 0,
  };
  const sourceFingerprint = fingerprint(source);
  const declaredOutputEntries = [];
  const declaredOutputsFingerprint = fingerprint({ schema_version: 3, entries: declaredOutputEntries });
  return {
    ...source,
    declared_output_entries: declaredOutputEntries,
    source_fingerprint: sourceFingerprint,
    declared_outputs_fingerprint: declaredOutputsFingerprint,
    fingerprint: fingerprint({
      schema_version: 3,
      source_fingerprint: sourceFingerprint,
      declared_outputs_fingerprint: declaredOutputsFingerprint,
    }),
  };
};
const bridge = createNormalSessionQualityBridge({
  workspaceRoot: tempRoot,
  checkCatalog: createDefaultNormalSessionCheckCatalog(),
  standardLitePolicy: {
    allowed_ownership_prefixes: ["src"],
    protected_paths: ["src/auth", "src/security.mjs"],
  },
  observeWorkspace,
  affectedFileInspector: () => ["src/file.mjs"],
  runTrustedTarget: () => ({ status: "passed", command_id: "fixture", exit_code: 0 }),
  idFactory: (prefix) => `${prefix}-${++id}`,
});

function call(sessionID, agent, toolId, request) {
  return executeNormalSessionQualityTool(bridge, toolId, { request: JSON.stringify(request) }, { sessionID, agent });
}

function classifyAndGate(sessionID) {
  handleNormalSessionChatMessage(bridge, { sessionID, agent: "orchestrator" });
  call(sessionID, "orchestrator", "quality_session_start", {
    risk_class: "standard-lite",
    task_type: "maintenance",
    user_visible_goal: "Exercise the fail-closed native Bash boundary.",
    ownership_paths: ["src"],
    required_check_ids: ["normal-harness-static"],
    classification_rationale: "bounded native-command fixture",
    behavior_expectation: "native Bash stays disabled while bounded edits and trusted checks remain available",
    expected_preserved_behavior: ["unrelated files remain unchanged"],
    known_local_edge_cases: ["read-only-looking and compound commands are both rejected"],
    scope_facts: {
      parallel_writable_delegation: false,
      migration: false,
      public_compatibility_change: false,
      architecture_policy_change: false,
      security_sensitive: false,
      persistence_sensitive: false,
      concurrency_sensitive: false,
      unresolved_unknowns: false,
    },
  });
  const callID = `bash-context-read-${sessionID}`;
  handleNormalSessionToolBefore(bridge, {
    tool: "context_read",
    sessionID,
    callID,
  }, { args: { path: "src/file.mjs", startLine: 1, maxLines: 1, maxBytes: 4096, format: "text" } });
  handleNormalSessionToolAfter(bridge, {
    tool: "context_read",
    sessionID,
    callID,
  }, {
    output: contextReadToolOutput("src/file.mjs", callID),
    title: "bash-boundary context read",
    metadata: {},
  });
  call(sessionID, "orchestrator", "quality_dossier_finalize", { expected_revision: 1 });
}

const unclassified = "session/bash-unclassified";
handleNormalSessionChatMessage(bridge, { sessionID: unclassified, agent: "orchestrator" });
for (const command of [
  "git rev-parse HEAD",
  "git status --short",
  "npm test",
  "git diff --check && echo chained",
  "git diff --check; echo chained",
  "git diff --check | more",
  "git diff --check > output.txt",
]) {
  expectCode(() => handleNormalSessionToolBefore(
    bridge,
    { tool: "bash", sessionID: unclassified, callID: `unclassified-${command.length}` },
    { args: { command } },
  ), "QUALITY_SESSION_UNCLASSIFIED");
}

const highSession = "session/bash-high-pregate";
handleNormalSessionChatMessage(bridge, { sessionID: highSession, agent: "orchestrator" });
call(highSession, "orchestrator", "quality_session_start", {
  risk_class: "high",
  task_type: "maintenance",
  user_visible_goal: "Prove native Bash is closed before a high-risk gate.",
  ownership_paths: ["src"],
  required_check_ids: ["normal-harness-static"],
  classification_rationale: "high-risk native-command fixture",
});
expectCode(() => handleNormalSessionToolBefore(
  bridge,
  { tool: "bash", sessionID: highSession, callID: "high-pregate" },
  { args: { command: "npm test" } },
), "QUALITY_PRE_GATE_VIOLATION");

const session = "session/bash-postgate";
classifyAndGate(session);
expectCode(() => call(session, "orchestrator", "quality_command_authorize", {
  expected_revision: 1,
  exact_command: "node scripts/update-fixture.mjs",
  allowed_changed_paths: ["src/file.mjs"],
  expected_effect: "would update the fixture",
  timeout_ms: 1000,
}), "QUALITY_NATIVE_BASH_DISABLED");
for (const command of ["git status --short", "npm test", "node scripts/update-fixture.mjs && echo bypass"]) {
  expectCode(() => handleNormalSessionToolBefore(
    bridge,
    { tool: "bash", sessionID: session, callID: `postgate-${command.length}` },
    { args: { command } },
  ), "QUALITY_NATIVE_BASH_DISABLED");
}

const permission = { status: "allow" };
handleNormalSessionPermission(bridge, {
  type: "bash",
  sessionID: session,
  callID: "permission",
  pattern: "npm test",
}, permission);
assert.equal(permission.status, "deny", "native Bash permission must remain denied after a passed gate");

const editCapability = call(session, "orchestrator", "quality_action_authorize", {
  expected_revision: 1,
  kind: "edit",
  paths: ["src/file.mjs"],
});
assert.equal(editCapability.kind, "edit", "bounded non-Bash mutation authority must remain available");

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("Native Bash fail-closed boundary checks passed.");
