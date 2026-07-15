import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { NORMAL_SESSION_QUALITY_TOOL_IDS } from "./normal-session-bridge.mjs";
import {
  ContractError,
  assertBoolean,
  assertFingerprint,
  assertPlain,
  assertString,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

export const QUALITY_PLUGIN_API_PROBE_SCHEMA_VERSION = 1;
export const NORMAL_SESSION_HOST_EVIDENCE_SCHEMA_VERSION = 1;
export const NORMAL_SESSION_HOST_EVIDENCE_PRODUCER = "opencode-harness/normal-session-host-e2e-v1";
export const NORMAL_SESSION_RUNTIME_SOURCE_FILES = Object.freeze([
  ".opencode/plugins/engineering-dossier.mjs",
  "lib/quality/quality-plugin.mjs",
  "lib/quality/runtime-hook-verification.mjs",
  "package.json",
  "scripts/verify-normal-session-runtime.mjs",
]);

const API_HOOK_KEYS = Object.freeze([
  "chat_message",
  "permission_ask",
  "tool_execute_before",
  "tool_execute_after",
  "event",
]);
const HOST_EVIDENCE_KEYS = Object.freeze([
  "schema_version",
  "producer",
  "generated_at",
  "run_nonce",
  "runtime_version",
  "plugin_source_fingerprint",
  "probe_workspace_fingerprint",
  "final_workspace_fingerprint",
  "plugin_discovered",
  "hook_surface",
  "hook_invocations",
  "effective_permissions_match",
  "session_registered_unclassified",
  "unclassified_edit_blocked",
  "pre_gate_edit_blocked",
  "pre_gate_writable_task_blocked",
  "pre_gate_mutating_bash_blocked",
  "standard_lite_session_started",
  "one_shot_mutation_authorized",
  "authorized_exact_command_observed",
  "authorized_mutation_completed",
  "after_hook_reconciled_workspace",
  "replayed_command_blocked",
  "project_check_passed",
  "final_attestation_created",
  "probe_file_unchanged",
  "raw_output_persisted",
  "evidence_fingerprint",
]);

function digest(contents) {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

function sealed(body) {
  return deepFrozenClone({ ...body, evidence_fingerprint: fingerprint(body) }, "runtime quality evidence receipt");
}

function validateBooleanMap(value, keys, label) {
  assertPlain(value, label);
  exact(value, keys, keys, label);
  for (const key of keys) assertBoolean(value[key], `${label}.${key}`);
}

export function normalSessionRuntimeSourceFingerprint(workspaceRoot) {
  const root = fs.realpathSync(path.resolve(workspaceRoot));
  const pending = [...NORMAL_SESSION_RUNTIME_SOURCE_FILES];
  const discovered = new Set();
  while (pending.length > 0) {
    const relative = pending.pop();
    if (discovered.has(relative)) continue;
    const target = path.resolve(root, ...relative.split("/"));
    const confined = path.relative(root, target);
    let realTarget;
    try { realTarget = fs.realpathSync(target); } catch { realTarget = null; }
    const realConfined = realTarget === null ? ".." : path.relative(root, realTarget);
    if (confined.startsWith("..") || path.isAbsolute(confined) || realConfined.startsWith("..")
      || path.isAbsolute(realConfined) || !fs.statSync(realTarget).isFile()) {
      throw new ContractError("QUALITY_RUNTIME_SOURCE", `runtime source file is unavailable: ${relative}`);
    }
    discovered.add(relative);
    if (!relative.endsWith(".mjs") && !relative.endsWith(".js")) continue;
    const source = fs.readFileSync(realTarget, "utf8");
    const pattern = /\b(?:import|export)\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["']/gu;
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) continue;
      const dependency = path.resolve(path.dirname(realTarget), specifier);
      const dependencyRelative = path.relative(root, dependency).replaceAll("\\", "/");
      if (dependencyRelative.startsWith("../") || path.isAbsolute(dependencyRelative)) {
        throw new ContractError("QUALITY_RUNTIME_SOURCE", `runtime import escapes the source root: ${relative}`);
      }
      pending.push(dependencyRelative);
    }
  }
  const files = [...discovered].sort().map((relative) => {
    const contents = fs.readFileSync(path.resolve(root, ...relative.split("/")));
    return { path: relative, bytes: contents.length, digest: digest(contents) };
  });
  return fingerprint({ files });
}

export function classifyQualityPluginApiProbe(input) {
  const keys = [
    "runtime_version",
    "plugin_api_version",
    "api_loaded",
    "api_parseable",
    "hook_surface",
    "tool_ids",
    "unclassified_edit_denied",
    "unclassified_mutating_bash_denied",
    "source_fingerprint",
  ];
  assertPlain(input, "quality plugin API probe");
  exact(input, keys, keys, "quality plugin API probe");
  for (const key of ["runtime_version", "plugin_api_version"]) {
    if (input[key] !== null) assertString(input[key], `quality plugin API probe.${key}`, { maxBytes: 128 });
  }
  assertBoolean(input.api_loaded, "quality plugin API probe.api_loaded");
  assertBoolean(input.api_parseable, "quality plugin API probe.api_parseable");
  validateBooleanMap(input.hook_surface, API_HOOK_KEYS, "quality plugin API probe.hook_surface");
  if (!Array.isArray(input.tool_ids) || input.tool_ids.some((entry) => typeof entry !== "string") || input.tool_ids.length > 64) {
    throw new ContractError("QUALITY_RUNTIME_HOOK_INPUT", "quality plugin API probe.tool_ids must be bounded strings");
  }
  assertBoolean(input.unclassified_edit_denied, "quality plugin API probe.unclassified_edit_denied");
  assertBoolean(input.unclassified_mutating_bash_denied, "quality plugin API probe.unclassified_mutating_bash_denied");
  assertFingerprint(input.source_fingerprint, "quality plugin API probe.source_fingerprint");
  const reasons = [];
  if (!input.api_loaded) reasons.push("QUALITY_PLUGIN_API_UNAVAILABLE");
  else if (!input.api_parseable) reasons.push("QUALITY_PLUGIN_API_UNPARSEABLE");
  for (const key of API_HOOK_KEYS) if (!input.hook_surface[key]) reasons.push(`QUALITY_PLUGIN_HOOK_MISSING_${key.toUpperCase()}`);
  const expectedTools = [...NORMAL_SESSION_QUALITY_TOOL_IDS].sort();
  const observedTools = [...new Set(input.tool_ids)].sort();
  if (expectedTools.some((entry) => !observedTools.includes(entry))) reasons.push("QUALITY_PLUGIN_TOOL_SURFACE_MISSING");
  if (observedTools.some((entry) => !expectedTools.includes(entry))) reasons.push("QUALITY_PLUGIN_TOOL_SURFACE_UNEXPECTED");
  if (!input.unclassified_edit_denied) reasons.push("QUALITY_PLUGIN_UNCLASSIFIED_EDIT_NOT_DENIED");
  if (!input.unclassified_mutating_bash_denied) reasons.push("QUALITY_PLUGIN_UNCLASSIFIED_BASH_NOT_DENIED");
  const unsafe = input.api_loaded && input.api_parseable && reasons.length > 0;
  return sealed({
    schema_version: QUALITY_PLUGIN_API_PROBE_SCHEMA_VERSION,
    producer: "opencode-harness/quality-plugin-api-probe-v1",
    status: reasons.length === 0 ? "passed" : unsafe ? "failed" : "incomplete",
    reason_codes: [...new Set(reasons)].sort(),
    runtime_version: input.runtime_version,
    plugin_api_version: input.plugin_api_version,
    source_fingerprint: input.source_fingerprint,
    hook_surface: { ...input.hook_surface },
    tool_ids: observedTools,
    expected_tool_ids: expectedTools,
    unclassified_edit_denied: input.unclassified_edit_denied,
    unclassified_mutating_bash_denied: input.unclassified_mutating_bash_denied,
  });
}

export function parseNormalSessionHostEvidence(serialized, {
  expectedSourceFingerprint,
  expectedWorkspaceFingerprint,
  expectedFinalWorkspaceFingerprint,
  expectedRunNonce,
  now = () => Date.now(),
  maxAgeMs = 10 * 60 * 1000,
} = {}) {
  if (typeof serialized !== "string" || Buffer.byteLength(serialized, "utf8") > 64 * 1024) {
    throw new ContractError("QUALITY_HOST_EVIDENCE_SIZE", "host evidence must be bounded UTF-8 JSON");
  }
  let value;
  try { value = JSON.parse(serialized.replace(/^\uFEFF/u, "")); } catch { throw new ContractError("QUALITY_HOST_EVIDENCE_JSON", "host evidence must contain valid JSON"); }
  assertPlain(value, "normal-session host evidence");
  exact(value, HOST_EVIDENCE_KEYS, HOST_EVIDENCE_KEYS, "normal-session host evidence");
  if (value.schema_version !== NORMAL_SESSION_HOST_EVIDENCE_SCHEMA_VERSION || value.producer !== NORMAL_SESSION_HOST_EVIDENCE_PRODUCER) {
    throw new ContractError("QUALITY_HOST_EVIDENCE_SCHEMA", "host evidence schema or producer is unsupported");
  }
  for (const [key, maxBytes] of [["generated_at", 128], ["run_nonce", 256], ["runtime_version", 128]]) {
    assertString(value[key], `normal-session host evidence.${key}`, { maxBytes });
  }
  for (const key of ["plugin_source_fingerprint", "probe_workspace_fingerprint", "final_workspace_fingerprint", "evidence_fingerprint"]) {
    assertFingerprint(value[key], `normal-session host evidence.${key}`);
  }
  validateBooleanMap(value.hook_surface, API_HOOK_KEYS, "normal-session host evidence.hook_surface");
  validateBooleanMap(value.hook_invocations, API_HOOK_KEYS, "normal-session host evidence.hook_invocations");
  for (const key of HOST_EVIDENCE_KEYS.filter((entry) => ![
    "schema_version", "producer", "generated_at", "run_nonce", "runtime_version",
    "plugin_source_fingerprint", "probe_workspace_fingerprint", "final_workspace_fingerprint", "hook_surface", "hook_invocations", "evidence_fingerprint",
  ].includes(entry))) {
    assertBoolean(value[key], `normal-session host evidence.${key}`);
  }
  const source = { ...value };
  delete source.evidence_fingerprint;
  if (!fingerprintsEqual(value.evidence_fingerprint, fingerprint(source))) {
    throw new ContractError("QUALITY_HOST_EVIDENCE_FINGERPRINT", "host evidence fingerprint is invalid");
  }
  const reasons = [];
  const generatedAt = Date.parse(value.generated_at);
  if (!Number.isFinite(generatedAt) || generatedAt > now() + 60_000 || now() - generatedAt > maxAgeMs) reasons.push("QUALITY_HOST_EVIDENCE_STALE");
  if (expectedSourceFingerprint && value.plugin_source_fingerprint !== expectedSourceFingerprint) reasons.push("QUALITY_HOST_EVIDENCE_SOURCE_MISMATCH");
  if (expectedWorkspaceFingerprint && value.probe_workspace_fingerprint !== expectedWorkspaceFingerprint) reasons.push("QUALITY_HOST_EVIDENCE_WORKSPACE_MISMATCH");
  if (expectedFinalWorkspaceFingerprint && value.final_workspace_fingerprint !== expectedFinalWorkspaceFingerprint) reasons.push("QUALITY_HOST_EVIDENCE_FINAL_WORKSPACE_MISMATCH");
  if (expectedRunNonce && value.run_nonce !== expectedRunNonce) reasons.push("QUALITY_HOST_EVIDENCE_NONCE_MISMATCH");
  if (!value.plugin_discovered) reasons.push("QUALITY_HOST_PLUGIN_NOT_DISCOVERED");
  for (const key of API_HOOK_KEYS) {
    if (!value.hook_surface[key]) reasons.push(`QUALITY_HOST_HOOK_MISSING_${key.toUpperCase()}`);
    if (!value.hook_invocations[key]) reasons.push(`QUALITY_HOST_HOOK_NOT_INVOKED_${key.toUpperCase()}`);
  }
  if (!value.effective_permissions_match) reasons.push("QUALITY_HOST_PERMISSION_MISMATCH");
  if (!value.session_registered_unclassified) reasons.push("QUALITY_HOST_SESSION_NOT_UNCLASSIFIED");
  if (!value.unclassified_edit_blocked) reasons.push("QUALITY_HOST_UNCLASSIFIED_EDIT_NOT_BLOCKED");
  if (!value.pre_gate_edit_blocked) reasons.push("QUALITY_HOST_PRE_GATE_EDIT_NOT_BLOCKED");
  if (!value.pre_gate_writable_task_blocked) reasons.push("QUALITY_HOST_PRE_GATE_TASK_NOT_BLOCKED");
  if (!value.pre_gate_mutating_bash_blocked) reasons.push("QUALITY_HOST_PRE_GATE_BASH_NOT_BLOCKED");
  if (!value.standard_lite_session_started) reasons.push("QUALITY_HOST_STANDARD_LITE_NOT_STARTED");
  if (!value.one_shot_mutation_authorized) reasons.push("QUALITY_HOST_CAPABILITY_NOT_AUTHORIZED");
  if (!value.authorized_exact_command_observed) reasons.push("QUALITY_HOST_EXACT_COMMAND_NOT_ENFORCED");
  if (!value.authorized_mutation_completed) reasons.push("QUALITY_HOST_AUTHORIZED_MUTATION_NOT_COMPLETED");
  if (!value.after_hook_reconciled_workspace) reasons.push("QUALITY_HOST_AFTER_HOOK_NOT_RECONCILED");
  if (!value.replayed_command_blocked) reasons.push("QUALITY_HOST_COMMAND_REPLAY_NOT_BLOCKED");
  if (!value.project_check_passed) reasons.push("QUALITY_HOST_PROJECT_CHECK_NOT_PASSED");
  if (!value.final_attestation_created) reasons.push("QUALITY_HOST_FINAL_ATTESTATION_MISSING");
  if (!value.probe_file_unchanged) reasons.push("QUALITY_HOST_PROBE_FILE_CHANGED");
  if (value.raw_output_persisted) reasons.push("QUALITY_HOST_RAW_OUTPUT_PERSISTED");
  return sealed({
    schema_version: 1,
    producer: "opencode-harness/normal-session-host-evidence-parser-v1",
    status: reasons.length === 0 ? "evidence_valid" : "evidence_invalid",
    reason_codes: [...new Set(reasons)].sort(),
    runtime_version: value.runtime_version,
    generated_at: value.generated_at,
    run_nonce: value.run_nonce,
    plugin_source_fingerprint: value.plugin_source_fingerprint,
    probe_workspace_fingerprint: value.probe_workspace_fingerprint,
    final_workspace_fingerprint: value.final_workspace_fingerprint,
    host_evidence_fingerprint: value.evidence_fingerprint,
  });
}

export function blockedNormalSessionHostReceipt(reasonCode, sourceFingerprint) {
  assertString(reasonCode, "blocked host receipt reason", { maxBytes: 128 });
  assertFingerprint(sourceFingerprint, "blocked host receipt source fingerprint");
  return sealed({
    schema_version: 1,
    producer: "opencode-harness/normal-session-host-e2e-v1",
    status: "blocked_external_state",
    reason_codes: [reasonCode],
    source_fingerprint: sourceFingerprint,
  });
}
