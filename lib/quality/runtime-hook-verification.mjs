import { ContractError, assertBoolean, assertString, exact, fingerprint } from "./validation.mjs";
import { NORMAL_SESSION_QUALITY_TOOL_IDS } from "./normal-session-bridge.mjs";

export const NORMAL_SESSION_RUNTIME_HOOK_SCHEMA_VERSION = 3;
export const NORMAL_SESSION_RUNTIME_HOOK_PRODUCER = "opencode-harness/normal-session-runtime-hooks-v3";
export const NORMAL_SESSION_RUNTIME_HOOK_STATUSES = Object.freeze(["passed", "failed", "incomplete"]);

const HOOK_KEYS = Object.freeze(["tool", "permission_ask", "tool_execute_before", "tool_execute_after", "event"]);
const SHELL_BOUNDARIES = Object.freeze(["structured_pre_permission", "permission_only_unclassified", "unavailable"]);
const INPUT_KEYS = Object.freeze([
  "runtime_version",
  "plugin_api_version",
  "api_loaded",
  "api_parseable",
  "hook_surface",
  "tool_ids",
  "pre_gate_edit_denied",
  "pre_gate_writable_task_denied",
  "host_plugin_discovered",
  "host_hooks_invoked",
  "effective_permissions_verified",
  "permission_hook_host_wired",
  "task_child_causal_binding_verified",
  "session_risk_classification_verified",
  "shell_mutation_boundary",
]);

function safeOptionalVersion(value, label) {
  if (value !== null) assertString(value, label, { maxBytes: 128 });
}

function sealed(body) {
  return Object.freeze({ ...body, evidence_fingerprint: fingerprint(body) });
}

export function classifyNormalSessionRuntimeHooks(input) {
  exact(input, INPUT_KEYS, INPUT_KEYS, "normal-session runtime hook probe");
  safeOptionalVersion(input.runtime_version, "normal-session runtime hook probe.runtime_version");
  safeOptionalVersion(input.plugin_api_version, "normal-session runtime hook probe.plugin_api_version");
  assertBoolean(input.api_loaded, "normal-session runtime hook probe.api_loaded");
  assertBoolean(input.api_parseable, "normal-session runtime hook probe.api_parseable");
  exact(input.hook_surface, HOOK_KEYS, HOOK_KEYS, "normal-session runtime hook probe.hook_surface");
  for (const key of HOOK_KEYS) {
    assertBoolean(input.hook_surface[key], `normal-session runtime hook probe.hook_surface.${key}`);
  }
  if (!Array.isArray(input.tool_ids) || input.tool_ids.some((entry) => typeof entry !== "string")) {
    throw new ContractError("QUALITY_RUNTIME_HOOK_INPUT", "normal-session runtime hook probe.tool_ids must be strings");
  }
  assertBoolean(input.pre_gate_edit_denied, "normal-session runtime hook probe.pre_gate_edit_denied");
  assertBoolean(
    input.pre_gate_writable_task_denied,
    "normal-session runtime hook probe.pre_gate_writable_task_denied",
  );
  assertBoolean(input.host_plugin_discovered, "normal-session runtime hook probe.host_plugin_discovered");
  assertBoolean(input.host_hooks_invoked, "normal-session runtime hook probe.host_hooks_invoked");
  assertBoolean(input.effective_permissions_verified, "normal-session runtime hook probe.effective_permissions_verified");
  assertBoolean(input.permission_hook_host_wired, "normal-session runtime hook probe.permission_hook_host_wired");
  assertBoolean(input.task_child_causal_binding_verified, "normal-session runtime hook probe.task_child_causal_binding_verified");
  assertBoolean(input.session_risk_classification_verified, "normal-session runtime hook probe.session_risk_classification_verified");
  if (!SHELL_BOUNDARIES.includes(input.shell_mutation_boundary)) {
    throw new ContractError("QUALITY_RUNTIME_HOOK_INPUT", "normal-session runtime hook shell boundary is unsupported");
  }

  const reasons = [];
  if (!input.api_loaded) reasons.push("QUALITY_PLUGIN_API_UNAVAILABLE");
  else if (!input.api_parseable) reasons.push("QUALITY_PLUGIN_API_UNPARSEABLE");
  for (const key of HOOK_KEYS) {
    if (!input.hook_surface[key]) reasons.push(`QUALITY_PLUGIN_HOOK_MISSING_${key.toUpperCase()}`);
  }
  const expectedTools = [...NORMAL_SESSION_QUALITY_TOOL_IDS].sort();
  const observedTools = [...new Set(input.tool_ids)].sort();
  const missingTools = expectedTools.filter((toolId) => !observedTools.includes(toolId));
  const unexpectedTools = observedTools.filter((toolId) => !expectedTools.includes(toolId));
  if (missingTools.length > 0) reasons.push("QUALITY_PLUGIN_TOOL_SURFACE_MISSING");
  if (unexpectedTools.length > 0) reasons.push("QUALITY_PLUGIN_TOOL_SURFACE_UNEXPECTED");
  if (!input.pre_gate_edit_denied) reasons.push("QUALITY_PLUGIN_EDIT_NOT_DENIED");
  if (!input.pre_gate_writable_task_denied) reasons.push("QUALITY_PLUGIN_WRITABLE_TASK_NOT_DENIED");
  if (!input.host_plugin_discovered) reasons.push("QUALITY_PLUGIN_HOST_DISCOVERY_UNVERIFIED");
  if (!input.host_hooks_invoked) reasons.push("QUALITY_PLUGIN_HOST_HOOK_INVOCATION_UNVERIFIED");
  if (!input.effective_permissions_verified) reasons.push("QUALITY_PLUGIN_EFFECTIVE_PERMISSIONS_UNVERIFIED");
  if (!input.permission_hook_host_wired) reasons.push("QUALITY_PLUGIN_PERMISSION_HOOK_NOT_HOST_WIRED");
  if (!input.task_child_causal_binding_verified) reasons.push("QUALITY_PLUGIN_TASK_CHILD_CAUSAL_BINDING_INCOMPLETE");
  if (!input.session_risk_classification_verified) reasons.push("QUALITY_PLUGIN_SESSION_RISK_CLASSIFICATION_INCOMPLETE");
  if (input.shell_mutation_boundary !== "structured_pre_permission") {
    reasons.push("QUALITY_PLUGIN_SHELL_MUTATION_INCOMPLETE");
  }

  const unsafe = input.api_loaded
    && input.api_parseable
    && (
      missingTools.length > 0
      || unexpectedTools.length > 0
      || !input.pre_gate_edit_denied
      || !input.pre_gate_writable_task_denied
    );
  const status = unsafe ? "failed" : reasons.length === 0 ? "passed" : "incomplete";
  return sealed({
    schema_version: NORMAL_SESSION_RUNTIME_HOOK_SCHEMA_VERSION,
    producer: NORMAL_SESSION_RUNTIME_HOOK_PRODUCER,
    status,
    reason_codes: [...new Set(reasons)].sort(),
    runtime_version: input.runtime_version,
    factory_compatibility: {
      plugin_api_version: input.plugin_api_version,
      api_loaded: input.api_loaded,
      api_parseable: input.api_parseable,
      hook_surface: { ...input.hook_surface },
      tool_ids: observedTools,
      expected_tool_ids: expectedTools,
      pre_gate_edit_denied: input.pre_gate_edit_denied,
      pre_gate_writable_task_denied: input.pre_gate_writable_task_denied,
    },
    host_runtime: {
      plugin_discovered: input.host_plugin_discovered,
      hooks_invoked: input.host_hooks_invoked,
      effective_permissions_verified: input.effective_permissions_verified,
      permission_hook_host_wired: input.permission_hook_host_wired,
      task_child_causal_binding_verified: input.task_child_causal_binding_verified,
      session_risk_classification_verified: input.session_risk_classification_verified,
    },
    shell_mutation_boundary: input.shell_mutation_boundary,
  });
}
