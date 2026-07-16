import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createNormalSessionQualityPlugin } from "opencode-harness/quality-plugin";
import { createDefaultNormalSessionCheckCatalog } from "../lib/quality/normal-session-bridge.mjs";
import {
  classifyQualityPluginApiProbe,
  normalSessionRuntimeSourceFingerprint,
} from "../lib/quality/runtime-hook-verification.mjs";
import { ContractError, fingerprint } from "../lib/quality/validation.mjs";
import { isExpectedUnclassifiedDenial } from "./probe-normal-session-plugin-api.mjs";

const root = fs.realpathSync(new URL("..", import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8").replace(/^\uFEFF/u, ""));
assert.equal(packageJson.exports["./quality-plugin"], "./lib/quality/quality-plugin.mjs");

for (const relative of [
  ".opencode/plugins/engineering-dossier.mjs",
  "quality/examples/global-quality-plugin.mjs",
]) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  assert(source.includes('from "opencode-harness/quality-plugin"'));
  assert.equal(source.includes("../../lib/quality"), false, `${relative} must use the public package export`);
}
const localWrapperSource = fs.readFileSync(path.join(root, ".opencode/plugins/engineering-dossier.mjs"), "utf8");
const globalWrapperSource = fs.readFileSync(path.join(root, "quality/examples/global-quality-plugin.mjs"), "utf8");
assert.equal(localWrapperSource.includes("hostToolchainAnchorUrl"), false, "project-local wrapper cannot claim a host-owned anchor");
assert(globalWrapperSource.includes("hostToolchainAnchorUrl: import.meta.url"), "global wrapper must bind host configuration beside itself");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-plugin-export-"));
fs.mkdirSync(path.join(tempRoot, "src"));
fs.writeFileSync(path.join(tempRoot, "src", "file.mjs"), "export const value = 1;\n", "utf8");
const headSha = "e".repeat(40);
const observeWorkspace = () => {
  const source = {
    schema_version: 3,
    head_sha: headSha,
    index_entry_count: 0,
    index_fingerprint: fingerprint({ index: "global-plugin-export-fixture" }),
    entries: [],
    dirty: false,
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
const toolFactory = (definition) => definition;
toolFactory.schema = { string: () => ({ describe: () => ({ type: "string" }) }) };
assert.throws(() => createNormalSessionQualityPlugin({
  toolFactory,
  workspaceRoot: tempRoot,
  bridgeOptions: {
    checkCatalog: createDefaultNormalSessionCheckCatalog(),
    observeWorkspace,
    hostToolchainAnchorUrl: import.meta.url,
  },
}), (error) => error instanceof ContractError && error.code === "QUALITY_TOOLCHAIN_HOST_CONFIG_BOUNDARY");
const plugin = createNormalSessionQualityPlugin({
  toolFactory,
  workspaceRoot: tempRoot,
  bridgeOptions: {
    checkCatalog: createDefaultNormalSessionCheckCatalog(),
    observeWorkspace,
    affectedFileInspector: () => ["src/file.mjs"],
  },
});
assert.equal(typeof plugin["chat.message"], "function");
assert.equal(typeof plugin["permission.ask"], "function");
assert.equal(typeof plugin["tool.execute.before"], "function");
assert.equal(typeof plugin["tool.execute.after"], "function");
assert.equal(typeof plugin.event, "function");
assert.deepEqual(Object.keys(plugin.tool).sort(), [
  "quality_action_authorize",
  "quality_architecture_evaluate",
  "quality_command_authorize",
  "quality_dossier_create",
  "quality_dossier_finalize",
  "quality_dossier_inspect",
  "quality_dossier_update",
  "quality_session_finalize",
  "quality_session_start",
  "quality_verification_record",
]);

assert.equal(await isExpectedUnclassifiedDenial(async () => {
  throw new ContractError("QUALITY_SESSION_UNCLASSIFIED", "expected unclassified denial");
}), true);
assert.equal(await isExpectedUnclassifiedDenial(async () => {
  const error = new Error("forged denial code");
  error.code = "QUALITY_SESSION_UNCLASSIFIED";
  throw error;
}), false);
assert.equal(await isExpectedUnclassifiedDenial(async () => {
  throw new TypeError("unrelated plugin defect");
}), false);
assert.equal(await isExpectedUnclassifiedDenial(async () => {
  throw new ContractError("QUALITY_ACTION_UNAUTHORIZED", "wrong denial code");
}), false);

const unexpectedErrorReceipt = classifyQualityPluginApiProbe({
  runtime_version: null,
  plugin_api_version: null,
  api_loaded: true,
  api_parseable: true,
  hook_surface: {
    chat_message: true,
    permission_ask: true,
    tool_execute_before: true,
    tool_execute_after: true,
    event: true,
  },
  tool_ids: Object.keys(plugin.tool),
  unclassified_edit_denied: await isExpectedUnclassifiedDenial(async () => {
    throw new TypeError("unrelated plugin defect");
  }),
  unclassified_mutating_bash_denied: true,
  source_fingerprint: normalSessionRuntimeSourceFingerprint(root),
});
assert.equal(unexpectedErrorReceipt.status, "failed");
assert(unexpectedErrorReceipt.reason_codes.includes("QUALITY_PLUGIN_UNCLASSIFIED_EDIT_NOT_DENIED"));

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("Global quality plugin export checks passed.");
