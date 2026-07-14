import assert from "node:assert/strict";

import { NORMAL_SESSION_QUALITY_TOOL_IDS } from "../lib/quality/normal-session-bridge.mjs";
import { classifyNormalSessionRuntimeHooks } from "../lib/quality/runtime-hook-verification.mjs";
import { fingerprint } from "../lib/quality/validation.mjs";

function probe(overrides = {}) {
  return classifyNormalSessionRuntimeHooks({
    runtime_version: "1.17.20",
    plugin_api_version: "1.4.7",
    api_loaded: true,
    api_parseable: true,
    hook_surface: {
      tool: true,
      permission_ask: true,
      tool_execute_before: true,
      tool_execute_after: true,
      event: true,
    },
    tool_ids: [...NORMAL_SESSION_QUALITY_TOOL_IDS],
    pre_gate_edit_denied: true,
    pre_gate_writable_task_denied: true,
    host_plugin_discovered: true,
    host_hooks_invoked: true,
    effective_permissions_verified: true,
    permission_hook_host_wired: true,
    task_child_causal_binding_verified: true,
    session_risk_classification_verified: true,
    shell_mutation_boundary: "structured_pre_permission",
    ...overrides,
  });
}

function assertSealed(receipt) {
  const { evidence_fingerprint: ignored, ...body } = receipt;
  assert.equal(receipt.evidence_fingerprint, fingerprint(body));
}

const supported = probe();
assert.equal(supported.status, "passed");
assert.deepEqual(supported.reason_codes, []);
assertSealed(supported);

const missingPermission = probe({
  hook_surface: {
    tool: true,
    permission_ask: false,
    tool_execute_before: true,
    tool_execute_after: true,
    event: true,
  },
});
assert.equal(missingPermission.status, "incomplete");
assert(missingPermission.reason_codes.includes("QUALITY_PLUGIN_HOOK_MISSING_PERMISSION_ASK"));

const unparseable = probe({
  api_parseable: false,
  hook_surface: {
    tool: false,
    permission_ask: false,
    tool_execute_before: false,
    tool_execute_after: false,
    event: false,
  },
  tool_ids: [],
  pre_gate_edit_denied: false,
  pre_gate_writable_task_denied: false,
  shell_mutation_boundary: "unavailable",
});
assert.equal(unparseable.status, "incomplete");
assert(unparseable.reason_codes.includes("QUALITY_PLUGIN_API_UNPARSEABLE"));

const missingTool = probe({ tool_ids: NORMAL_SESSION_QUALITY_TOOL_IDS.slice(1) });
assert.equal(missingTool.status, "failed");
assert(missingTool.reason_codes.includes("QUALITY_PLUGIN_TOOL_SURFACE_MISSING"));

const unsafeEdit = probe({ pre_gate_edit_denied: false });
assert.equal(unsafeEdit.status, "failed");
assert(unsafeEdit.reason_codes.includes("QUALITY_PLUGIN_EDIT_NOT_DENIED"));

const permissionOnlyShell = probe({ shell_mutation_boundary: "permission_only_unclassified" });
assert.equal(permissionOnlyShell.status, "incomplete");
assert(permissionOnlyShell.reason_codes.includes("QUALITY_PLUGIN_SHELL_MUTATION_INCOMPLETE"));

const factoryOnly = probe({
  host_plugin_discovered: false,
  host_hooks_invoked: false,
  effective_permissions_verified: false,
  permission_hook_host_wired: false,
  task_child_causal_binding_verified: false,
  session_risk_classification_verified: false,
});
assert.equal(factoryOnly.status, "incomplete");
assert(factoryOnly.reason_codes.includes("QUALITY_PLUGIN_HOST_DISCOVERY_UNVERIFIED"));
assert(factoryOnly.reason_codes.includes("QUALITY_PLUGIN_HOST_HOOK_INVOCATION_UNVERIFIED"));
assert(factoryOnly.reason_codes.includes("QUALITY_PLUGIN_EFFECTIVE_PERMISSIONS_UNVERIFIED"));
assert(factoryOnly.reason_codes.includes("QUALITY_PLUGIN_PERMISSION_HOOK_NOT_HOST_WIRED"));
assert(factoryOnly.reason_codes.includes("QUALITY_PLUGIN_TASK_CHILD_CAUSAL_BINDING_INCOMPLETE"));
assert(factoryOnly.reason_codes.includes("QUALITY_PLUGIN_SESSION_RISK_CLASSIFICATION_INCOMPLETE"));
assert.equal(factoryOnly.factory_compatibility.pre_gate_edit_denied, true);
assert.equal(factoryOnly.host_runtime.plugin_discovered, false);

const unavailable = probe({
  runtime_version: null,
  plugin_api_version: null,
  api_loaded: false,
  api_parseable: false,
  hook_surface: {
    tool: false,
    permission_ask: false,
    tool_execute_before: false,
    tool_execute_after: false,
    event: false,
  },
  tool_ids: [],
  pre_gate_edit_denied: false,
  pre_gate_writable_task_denied: false,
  host_plugin_discovered: false,
  host_hooks_invoked: false,
  effective_permissions_verified: false,
  permission_hook_host_wired: false,
  task_child_causal_binding_verified: false,
  session_risk_classification_verified: false,
  shell_mutation_boundary: "unavailable",
});
assert.equal(unavailable.status, "incomplete");
assert(unavailable.reason_codes.includes("QUALITY_PLUGIN_API_UNAVAILABLE"));

console.log("Normal-session runtime hook fixtures passed (supported, missing, unsafe, and incomplete surfaces).");
