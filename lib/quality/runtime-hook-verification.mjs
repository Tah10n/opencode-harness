import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { NORMAL_SESSION_QUALITY_TOOL_IDS } from "./normal-session-bridge.mjs";
import {
  ContractError,
  assertArray,
  assertBoolean,
  assertFingerprint,
  assertInteger,
  assertPlain,
  assertString,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

export const QUALITY_PLUGIN_API_PROBE_SCHEMA_VERSION = 1;
export const NORMAL_SESSION_HOST_EVIDENCE_SCHEMA_VERSION = 2;
export const NORMAL_SESSION_HOST_EVIDENCE_PRODUCER = "opencode-harness/normal-session-host-e2e-v2";
export const NORMAL_SESSION_HOST_ADAPTER_TIMEOUT_MS = 300_000;
export const NORMAL_SESSION_HOST_PROBE_CLEANUP_OPTIONS = Object.freeze({
  recursive: true,
  force: true,
  maxRetries: 10,
  retryDelay: 100,
});
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
const HOST_ACTIVE_HOOK_KEYS = Object.freeze([
  "chat_message",
  "tool_execute_before",
  "tool_execute_after",
  "event",
]);
const VERIFICATION_CONTEXTS = Object.freeze(["installed_host", "deterministic_fixture"]);
const SCENARIO_SPECS = Object.freeze([
  Object.freeze({ scenario_id: "unclassified_bash_blocked", expected_code: "QUALITY_SESSION_UNCLASSIFIED", expected_status: "blocked", path: false }),
  Object.freeze({ scenario_id: "pre_gate_bash_blocked", expected_code: "QUALITY_PRE_GATE_VIOLATION", expected_status: "blocked", path: false }),
  Object.freeze({ scenario_id: "post_gate_bash_blocked", expected_code: "QUALITY_NATIVE_BASH_DISABLED", expected_status: "blocked", path: false }),
  Object.freeze({ scenario_id: "edit_capability_authorized", expected_code: null, expected_status: "authorized", path: true }),
  Object.freeze({ scenario_id: "exact_edit_binding_observed", expected_code: null, expected_status: "bound", path: true }),
  Object.freeze({ scenario_id: "authorized_edit_completed", expected_code: null, expected_status: "completed", path: true }),
  Object.freeze({ scenario_id: "replayed_edit_capability_blocked", expected_code: "QUALITY_CAPABILITY_MISSING", expected_status: "blocked", path: true }),
  Object.freeze({ scenario_id: "after_hook_workspace_reconciled", expected_code: null, expected_status: "reconciled", path: true }),
  Object.freeze({ scenario_id: "trusted_project_check_passed", expected_code: null, expected_status: "passed", path: false }),
  Object.freeze({ scenario_id: "final_attestation_created", expected_code: null, expected_status: "created", path: false }),
]);

export const NORMAL_SESSION_HOST_SCENARIO_IDS = Object.freeze(SCENARIO_SPECS.map((entry) => entry.scenario_id));

const SCENARIO_CONTRACT_KEYS = Object.freeze([
  "sequence",
  "scenario_id",
  "expected_code",
  "expected_status",
  "expected_path",
]);
const SCENARIO_BINDING_KEYS = Object.freeze([
  "code",
  "status",
  "path",
  "capability_id",
  "call_id",
  "before_workspace_fingerprint",
  "after_workspace_fingerprint",
  "receipt_fingerprint",
  "attestation_fingerprint",
]);
const SCENARIO_RECEIPT_BODY_KEYS = Object.freeze([
  "sequence",
  "scenario_id",
  "run_binding_fingerprint",
  "previous_scenario_fingerprint",
  "expected",
  "observed",
]);
const SCENARIO_RECEIPT_KEYS = Object.freeze([...SCENARIO_RECEIPT_BODY_KEYS, "fingerprint"]);
const HOST_EVIDENCE_BODY_KEYS = Object.freeze([
  "schema_version",
  "producer",
  "generated_at",
  "run_nonce",
  "runtime_version",
  "verification_context",
  "plugin_source_fingerprint",
  "probe_workspace_fingerprint",
  "final_workspace_fingerprint",
  "scenario_contract",
  "scenario_contract_fingerprint",
  "run_binding_fingerprint",
  "plugin_discovered",
  "hook_surface",
  "hook_invocations",
  "effective_permissions_match",
  "observed_scenarios",
  "probe_file_unchanged",
  "raw_output_persisted",
]);
const HOST_EVIDENCE_KEYS = Object.freeze([...HOST_EVIDENCE_BODY_KEYS, "evidence_fingerprint"]);

function digest(contents) {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

function sealed(body) {
  return deepFrozenClone({ ...body, evidence_fingerprint: fingerprint(body) }, "runtime quality evidence receipt");
}

export function removeNormalSessionHostProbeWorkspace(workspaceRoot, remove = fs.rmSync) {
  if (typeof workspaceRoot !== "string" || workspaceRoot.includes("\0")
    || !path.isAbsolute(workspaceRoot) || path.resolve(workspaceRoot) !== workspaceRoot
    || typeof remove !== "function") {
    throw new ContractError("QUALITY_HOST_PROBE_CLEANUP", "host probe cleanup requires a canonical absolute workspace and remover");
  }
  remove(workspaceRoot, NORMAL_SESSION_HOST_PROBE_CLEANUP_OPTIONS);
}

function withoutFingerprint(value, key = "fingerprint") {
  const body = structuredClone(value);
  delete body[key];
  return body;
}

function validateBooleanMap(value, keys, label) {
  assertPlain(value, label);
  exact(value, keys, keys, label);
  for (const key of keys) assertBoolean(value[key], `${label}.${key}`);
}

function assertNullableString(value, label, { maxBytes = 1000 } = {}) {
  if (value === null) return;
  assertString(value, label, { maxBytes });
}

function assertNullableFingerprint(value, label) {
  if (value === null) return;
  assertFingerprint(value, label);
}

function canonicalChangedPath(value, label = "changed path") {
  assertString(value, label, { maxBytes: 1000 });
  if (value.includes("\0") || value.includes("\\") || path.posix.isAbsolute(value)
    || value.split("/").some((segment) => segment === "..") || path.posix.normalize(value) !== value || value === ".") {
    throw new ContractError("QUALITY_HOST_CHANGED_PATH", `${label} must be a canonical relative worktree path`);
  }
  return value;
}

export function createNormalSessionHostScenarioContract(changedPath) {
  const canonicalPath = canonicalChangedPath(changedPath, "host scenario changed path");
  return deepFrozenClone(SCENARIO_SPECS.map((entry, index) => ({
    sequence: index + 1,
    scenario_id: entry.scenario_id,
    expected_code: entry.expected_code,
    expected_status: entry.expected_status,
    expected_path: entry.path ? canonicalPath : null,
  })), "normal-session host scenario contract");
}

export function normalSessionHostScenarioContractFingerprint(changedPath) {
  return fingerprint(createNormalSessionHostScenarioContract(changedPath));
}

function validateScenarioContract(value, label = "normal-session host scenario contract") {
  assertArray(value, label, { min: SCENARIO_SPECS.length, max: SCENARIO_SPECS.length });
  value.forEach((entry, index) => {
    const entryLabel = `${label}[${index}]`;
    exact(entry, SCENARIO_CONTRACT_KEYS, SCENARIO_CONTRACT_KEYS, entryLabel);
    assertInteger(entry.sequence, `${entryLabel}.sequence`, { min: index + 1, max: index + 1 });
    assertString(entry.scenario_id, `${entryLabel}.scenario_id`, { maxBytes: 128 });
    assertNullableString(entry.expected_code, `${entryLabel}.expected_code`, { maxBytes: 128 });
    assertString(entry.expected_status, `${entryLabel}.expected_status`, { maxBytes: 128 });
    if (entry.expected_path !== null) canonicalChangedPath(entry.expected_path, `${entryLabel}.expected_path`);
  });
  return value;
}

export function normalSessionHostRunBindingFingerprint(input) {
  const keys = [
    "run_nonce",
    "runtime_version",
    "verification_context",
    "plugin_source_fingerprint",
    "probe_workspace_fingerprint",
    "final_workspace_fingerprint",
    "scenario_contract_fingerprint",
  ];
  assertPlain(input, "normal-session host run binding input");
  exact(input, keys, keys, "normal-session host run binding input");
  const {
    run_nonce,
    runtime_version,
    verification_context,
    plugin_source_fingerprint,
    probe_workspace_fingerprint,
    final_workspace_fingerprint,
    scenario_contract_fingerprint,
  } = input;
  const source = {
    run_nonce,
    runtime_version,
    verification_context,
    plugin_source_fingerprint,
    probe_workspace_fingerprint,
    final_workspace_fingerprint,
    scenario_contract_fingerprint,
  };
  assertString(source.run_nonce, "host run binding.run_nonce", { maxBytes: 256 });
  assertString(source.runtime_version, "host run binding.runtime_version", { maxBytes: 128 });
  if (!VERIFICATION_CONTEXTS.includes(source.verification_context)) {
    throw new ContractError("QUALITY_HOST_VERIFICATION_CONTEXT", "host run binding.verification_context is unsupported");
  }
  for (const key of [
    "plugin_source_fingerprint",
    "probe_workspace_fingerprint",
    "final_workspace_fingerprint",
    "scenario_contract_fingerprint",
  ]) assertFingerprint(source[key], `host run binding.${key}`);
  return fingerprint(source);
}

function validateScenarioBinding(value, label) {
  assertPlain(value, label);
  exact(value, SCENARIO_BINDING_KEYS, SCENARIO_BINDING_KEYS, label);
  assertNullableString(value.code, `${label}.code`, { maxBytes: 128 });
  assertString(value.status, `${label}.status`, { maxBytes: 128 });
  if (value.path !== null) canonicalChangedPath(value.path, `${label}.path`);
  assertNullableString(value.capability_id, `${label}.capability_id`, { maxBytes: 256 });
  assertNullableString(value.call_id, `${label}.call_id`, { maxBytes: 256 });
  for (const key of [
    "before_workspace_fingerprint",
    "after_workspace_fingerprint",
    "receipt_fingerprint",
    "attestation_fingerprint",
  ]) assertNullableFingerprint(value[key], `${label}.${key}`);
  return value;
}

function validateScenarioReceipt(value, label) {
  assertPlain(value, label);
  exact(value, SCENARIO_RECEIPT_KEYS, SCENARIO_RECEIPT_KEYS, label);
  assertInteger(value.sequence, `${label}.sequence`, { min: 1, max: SCENARIO_SPECS.length });
  assertString(value.scenario_id, `${label}.scenario_id`, { maxBytes: 128 });
  assertFingerprint(value.run_binding_fingerprint, `${label}.run_binding_fingerprint`);
  assertNullableFingerprint(value.previous_scenario_fingerprint, `${label}.previous_scenario_fingerprint`);
  validateScenarioBinding(value.expected, `${label}.expected`);
  validateScenarioBinding(value.observed, `${label}.observed`);
  assertFingerprint(value.fingerprint, `${label}.fingerprint`);
  if (!fingerprintsEqual(value.fingerprint, fingerprint(withoutFingerprint(value)))) {
    throw new ContractError("QUALITY_HOST_SCENARIO_FINGERPRINT", `${label}.fingerprint is invalid`);
  }
  return value;
}

export function sealNormalSessionHostScenarioReceipt(body) {
  assertPlain(body, "normal-session host scenario receipt body");
  exact(body, SCENARIO_RECEIPT_BODY_KEYS, SCENARIO_RECEIPT_BODY_KEYS, "normal-session host scenario receipt body");
  const receipt = { ...structuredClone(body), fingerprint: fingerprint(body) };
  validateScenarioReceipt(receipt, "normal-session host scenario receipt");
  return deepFrozenClone(receipt, "normal-session host scenario receipt");
}

function validateHostEvidenceStructure(value) {
  assertPlain(value, "normal-session host evidence");
  exact(value, HOST_EVIDENCE_KEYS, HOST_EVIDENCE_KEYS, "normal-session host evidence");
  if (value.schema_version !== NORMAL_SESSION_HOST_EVIDENCE_SCHEMA_VERSION
    || value.producer !== NORMAL_SESSION_HOST_EVIDENCE_PRODUCER) {
    throw new ContractError("QUALITY_HOST_EVIDENCE_SCHEMA", "host evidence schema or producer is unsupported");
  }
  for (const [key, maxBytes] of [["generated_at", 128], ["run_nonce", 256], ["runtime_version", 128]]) {
    assertString(value[key], `normal-session host evidence.${key}`, { maxBytes });
  }
  if (!VERIFICATION_CONTEXTS.includes(value.verification_context)) {
    throw new ContractError("QUALITY_HOST_VERIFICATION_CONTEXT", "host evidence verification_context is unsupported");
  }
  for (const key of [
    "plugin_source_fingerprint",
    "probe_workspace_fingerprint",
    "final_workspace_fingerprint",
    "scenario_contract_fingerprint",
    "run_binding_fingerprint",
    "evidence_fingerprint",
  ]) assertFingerprint(value[key], `normal-session host evidence.${key}`);
  validateScenarioContract(value.scenario_contract);
  assertBoolean(value.plugin_discovered, "normal-session host evidence.plugin_discovered");
  validateBooleanMap(value.hook_surface, API_HOOK_KEYS, "normal-session host evidence.hook_surface");
  validateBooleanMap(value.hook_invocations, API_HOOK_KEYS, "normal-session host evidence.hook_invocations");
  assertBoolean(value.effective_permissions_match, "normal-session host evidence.effective_permissions_match");
  assertArray(value.observed_scenarios, "normal-session host evidence.observed_scenarios", {
    min: SCENARIO_SPECS.length,
    max: SCENARIO_SPECS.length,
    item: validateScenarioReceipt,
  });
  assertBoolean(value.probe_file_unchanged, "normal-session host evidence.probe_file_unchanged");
  assertBoolean(value.raw_output_persisted, "normal-session host evidence.raw_output_persisted");
  if (!fingerprintsEqual(value.evidence_fingerprint, fingerprint(withoutFingerprint(value, "evidence_fingerprint")))) {
    throw new ContractError("QUALITY_HOST_EVIDENCE_FINGERPRINT", "host evidence fingerprint is invalid");
  }
  return value;
}

export function sealNormalSessionHostEvidence(body) {
  assertPlain(body, "normal-session host evidence body");
  exact(body, HOST_EVIDENCE_BODY_KEYS, HOST_EVIDENCE_BODY_KEYS, "normal-session host evidence body");
  const evidence = { ...structuredClone(body), evidence_fingerprint: fingerprint(body) };
  validateHostEvidenceStructure(evidence);
  return deepFrozenClone(evidence, "normal-session host evidence");
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

function addBindingMismatchReasons(reasons, expected, observed) {
  const reasonByKey = {
    code: "QUALITY_HOST_SCENARIO_CODE_MISMATCH",
    status: "QUALITY_HOST_SCENARIO_STATUS_MISMATCH",
    path: "QUALITY_HOST_SCENARIO_PATH_MISMATCH",
    capability_id: "QUALITY_HOST_SCENARIO_CAPABILITY_MISMATCH",
    call_id: "QUALITY_HOST_SCENARIO_CALL_MISMATCH",
    before_workspace_fingerprint: "QUALITY_HOST_SCENARIO_WORKSPACE_MISMATCH",
    after_workspace_fingerprint: "QUALITY_HOST_SCENARIO_WORKSPACE_MISMATCH",
    receipt_fingerprint: "QUALITY_HOST_SCENARIO_RECEIPT_MISMATCH",
    attestation_fingerprint: "QUALITY_HOST_SCENARIO_ATTESTATION_MISMATCH",
  };
  for (const key of SCENARIO_BINDING_KEYS) {
    if (expected[key] !== observed[key]) reasons.push(reasonByKey[key]);
  }
}

function expectedWorkspacePair(index, before, after) {
  if (index <= 4) return [before, before];
  if (index === 5 || index === 7) return [before, after];
  return [after, after];
}

function validateScenarioSemantics(value, canonicalContract, reasons) {
  const scenarios = value.observed_scenarios;
  let previous = null;
  for (let index = 0; index < scenarios.length; index += 1) {
    const receipt = scenarios[index];
    const contract = canonicalContract[index];
    if (receipt.sequence !== index + 1 || receipt.scenario_id !== contract.scenario_id) {
      reasons.push("QUALITY_HOST_SCENARIO_ORDER_MISMATCH");
    }
    if (receipt.run_binding_fingerprint !== value.run_binding_fingerprint) {
      reasons.push("QUALITY_HOST_SCENARIO_RUN_BINDING_MISMATCH");
    }
    if (receipt.previous_scenario_fingerprint !== previous) {
      reasons.push("QUALITY_HOST_SCENARIO_PREVIOUS_MISMATCH");
    }
    previous = receipt.fingerprint;
    addBindingMismatchReasons(reasons, receipt.expected, receipt.observed);
    if (receipt.expected.code !== contract.expected_code) reasons.push("QUALITY_HOST_SCENARIO_CODE_MISMATCH");
    if (receipt.expected.status !== contract.expected_status) reasons.push("QUALITY_HOST_SCENARIO_STATUS_MISMATCH");
    if (receipt.expected.path !== contract.expected_path) reasons.push("QUALITY_HOST_SCENARIO_PATH_MISMATCH");
    const [expectedBefore, expectedAfter] = expectedWorkspacePair(
      index,
      value.probe_workspace_fingerprint,
      value.final_workspace_fingerprint,
    );
    if (receipt.observed.before_workspace_fingerprint !== expectedBefore
      || receipt.observed.after_workspace_fingerprint !== expectedAfter) {
      reasons.push("QUALITY_HOST_SCENARIO_WORKSPACE_MISMATCH");
    }
  }

  const capabilityId = scenarios[3].observed.capability_id;
  if (capabilityId === null || scenarios.slice(3, 8).some((entry) => entry.observed.capability_id !== capabilityId)
    || scenarios.slice(0, 3).some((entry) => entry.observed.capability_id !== null)
    || scenarios.slice(8).some((entry) => entry.observed.capability_id !== null)) {
    reasons.push("QUALITY_HOST_SCENARIO_CAPABILITY_MISMATCH");
  }
  const bashCalls = scenarios.slice(0, 3).map((entry) => entry.observed.call_id);
  if (bashCalls.some((entry) => entry === null) || new Set(bashCalls).size !== bashCalls.length) {
    reasons.push("QUALITY_HOST_SCENARIO_CALL_MISMATCH");
  }
  const editCallId = scenarios[4].observed.call_id;
  const replayCallId = scenarios[6].observed.call_id;
  if (editCallId === null || replayCallId === null || editCallId === replayCallId
    || scenarios[5].observed.call_id !== editCallId || scenarios[7].observed.call_id !== editCallId
    || scenarios[3].observed.call_id !== null || scenarios.slice(8).some((entry) => entry.observed.call_id !== null)) {
    reasons.push("QUALITY_HOST_SCENARIO_CALL_MISMATCH");
  }
  if (scenarios.slice(0, 8).some((entry) => entry.observed.receipt_fingerprint !== null)
    || scenarios[8].observed.receipt_fingerprint === null
    || scenarios[9].observed.receipt_fingerprint === null) {
    reasons.push("QUALITY_HOST_SCENARIO_RECEIPT_MISMATCH");
  }
  if (scenarios.slice(0, 9).some((entry) => entry.observed.attestation_fingerprint !== null)
    || scenarios[9].observed.attestation_fingerprint === null) {
    reasons.push("QUALITY_HOST_SCENARIO_ATTESTATION_MISMATCH");
  }
}

export function parseNormalSessionHostEvidence(serialized, options = {}) {
  const optionKeys = [
    "expectedSourceFingerprint",
    "expectedWorkspaceFingerprint",
    "expectedFinalWorkspaceFingerprint",
    "expectedRunNonce",
    "expectedRuntimeVersion",
    "expectedVerificationContext",
    "expectedChangedPath",
    "now",
    "maxAgeMs",
  ];
  exact(options, optionKeys, optionKeys.slice(0, 7), "normal-session host evidence parser options");
  const {
    expectedSourceFingerprint,
    expectedWorkspaceFingerprint,
    expectedFinalWorkspaceFingerprint,
    expectedRunNonce,
    expectedRuntimeVersion,
    expectedVerificationContext,
    expectedChangedPath,
    now = () => Date.now(),
    maxAgeMs = 10 * 60 * 1000,
  } = options;
  for (const [value, label] of [
    [expectedSourceFingerprint, "expected source fingerprint"],
    [expectedWorkspaceFingerprint, "expected workspace fingerprint"],
    [expectedFinalWorkspaceFingerprint, "expected final workspace fingerprint"],
  ]) assertFingerprint(value, label);
  assertString(expectedRunNonce, "expected run nonce", { maxBytes: 256 });
  assertString(expectedRuntimeVersion, "expected runtime version", { maxBytes: 128 });
  if (!VERIFICATION_CONTEXTS.includes(expectedVerificationContext)) {
    throw new ContractError("QUALITY_HOST_VERIFICATION_CONTEXT", "expected verification context is unsupported");
  }
  const changedPath = canonicalChangedPath(expectedChangedPath, "expected changed path");
  if (typeof now !== "function" || !Number.isInteger(maxAgeMs) || maxAgeMs < 1 || maxAgeMs > 60 * 60 * 1000) {
    throw new ContractError("QUALITY_HOST_EVIDENCE_TIME", "host evidence parser time policy is invalid");
  }
  if (typeof serialized !== "string" || Buffer.byteLength(serialized, "utf8") > 64 * 1024) {
    throw new ContractError("QUALITY_HOST_EVIDENCE_SIZE", "host evidence must be bounded UTF-8 JSON");
  }
  let value;
  try { value = JSON.parse(serialized.replace(/^\uFEFF/u, "")); } catch {
    throw new ContractError("QUALITY_HOST_EVIDENCE_JSON", "host evidence must contain valid JSON");
  }
  validateHostEvidenceStructure(value);
  const reasons = [];
  const generatedAt = Date.parse(value.generated_at);
  const observedNow = now();
  if (!Number.isFinite(generatedAt) || generatedAt > observedNow + 60_000 || observedNow - generatedAt > maxAgeMs) {
    reasons.push("QUALITY_HOST_EVIDENCE_STALE");
  }
  if (value.plugin_source_fingerprint !== expectedSourceFingerprint) reasons.push("QUALITY_HOST_EVIDENCE_SOURCE_MISMATCH");
  if (value.probe_workspace_fingerprint !== expectedWorkspaceFingerprint) reasons.push("QUALITY_HOST_EVIDENCE_WORKSPACE_MISMATCH");
  if (value.final_workspace_fingerprint !== expectedFinalWorkspaceFingerprint) reasons.push("QUALITY_HOST_EVIDENCE_FINAL_WORKSPACE_MISMATCH");
  if (value.run_nonce !== expectedRunNonce) reasons.push("QUALITY_HOST_EVIDENCE_NONCE_MISMATCH");
  if (value.runtime_version !== expectedRuntimeVersion) reasons.push("QUALITY_HOST_EVIDENCE_RUNTIME_MISMATCH");
  if (value.verification_context !== expectedVerificationContext) reasons.push("QUALITY_HOST_EVIDENCE_CONTEXT_MISMATCH");

  const canonicalContract = createNormalSessionHostScenarioContract(changedPath);
  const canonicalContractFingerprint = fingerprint(canonicalContract);
  if (JSON.stringify(value.scenario_contract) !== JSON.stringify(canonicalContract)
    || value.scenario_contract_fingerprint !== canonicalContractFingerprint
    || value.scenario_contract_fingerprint !== fingerprint(value.scenario_contract)) {
    reasons.push("QUALITY_HOST_SCENARIO_CONTRACT_MISMATCH");
  }
  const expectedRunBinding = normalSessionHostRunBindingFingerprint({
    run_nonce: value.run_nonce,
    runtime_version: value.runtime_version,
    verification_context: value.verification_context,
    plugin_source_fingerprint: value.plugin_source_fingerprint,
    probe_workspace_fingerprint: value.probe_workspace_fingerprint,
    final_workspace_fingerprint: value.final_workspace_fingerprint,
    scenario_contract_fingerprint: value.scenario_contract_fingerprint,
  });
  if (value.run_binding_fingerprint !== expectedRunBinding) reasons.push("QUALITY_HOST_RUN_BINDING_MISMATCH");
  validateScenarioSemantics(value, canonicalContract, reasons);
  if (!value.plugin_discovered) reasons.push("QUALITY_HOST_PLUGIN_NOT_DISCOVERED");
  for (const key of API_HOOK_KEYS) {
    if (!value.hook_surface[key]) reasons.push(`QUALITY_HOST_HOOK_MISSING_${key.toUpperCase()}`);
  }
  for (const key of HOST_ACTIVE_HOOK_KEYS) {
    if (!value.hook_invocations[key]) reasons.push(`QUALITY_HOST_HOOK_NOT_INVOKED_${key.toUpperCase()}`);
  }
  if (!value.effective_permissions_match) reasons.push("QUALITY_HOST_PERMISSION_MISMATCH");
  if (!value.probe_file_unchanged) reasons.push("QUALITY_HOST_PROBE_FILE_CHANGED");
  if (value.raw_output_persisted) reasons.push("QUALITY_HOST_RAW_OUTPUT_PERSISTED");
  const checkScenario = value.observed_scenarios[8];
  const attestationScenario = value.observed_scenarios[9];
  return sealed({
    schema_version: NORMAL_SESSION_HOST_EVIDENCE_SCHEMA_VERSION,
    producer: "opencode-harness/normal-session-host-evidence-parser-v2",
    status: reasons.length === 0 ? "evidence_valid" : "evidence_invalid",
    reason_codes: [...new Set(reasons)].sort(),
    verification_context: value.verification_context,
    runtime_version: value.runtime_version,
    generated_at: value.generated_at,
    run_nonce: value.run_nonce,
    plugin_source_fingerprint: value.plugin_source_fingerprint,
    probe_workspace_fingerprint: value.probe_workspace_fingerprint,
    final_workspace_fingerprint: value.final_workspace_fingerprint,
    scenario_contract_fingerprint: value.scenario_contract_fingerprint,
    run_binding_fingerprint: value.run_binding_fingerprint,
    scenario_receipt_fingerprints: value.observed_scenarios.map((entry) => entry.fingerprint),
    trusted_check_receipt_fingerprint: checkScenario.observed.receipt_fingerprint,
    verification_fingerprint: attestationScenario.observed.receipt_fingerprint,
    attestation_fingerprint: attestationScenario.observed.attestation_fingerprint,
    host_evidence_fingerprint: value.evidence_fingerprint,
  });
}

export function blockedNormalSessionHostReceipt(reasonCode, sourceFingerprint) {
  assertString(reasonCode, "blocked host receipt reason", { maxBytes: 128 });
  assertFingerprint(sourceFingerprint, "blocked host receipt source fingerprint");
  return sealed({
    schema_version: NORMAL_SESSION_HOST_EVIDENCE_SCHEMA_VERSION,
    producer: NORMAL_SESSION_HOST_EVIDENCE_PRODUCER,
    status: "blocked_external_state",
    reason_codes: [reasonCode],
    source_fingerprint: sourceFingerprint,
  });
}
