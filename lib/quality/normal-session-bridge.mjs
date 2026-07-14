import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  atomicWriteJson,
  ensureConfinedDirectory,
  readJson,
  resolveHarnessRoot,
  resolveInside,
  withExclusiveLock,
} from "../feedback/files.mjs";
import {
  evaluateArchitecturePolicy,
  parseArchitecturePolicy,
  validateArchitectureEvaluation,
} from "./architecture.mjs";
import {
  createEngineeringDossierDraft,
  finalizeEngineeringDossier,
  updateEngineeringDossierDraft,
  validateEngineeringDossier,
} from "./dossier.mjs";
import {
  createEngineeringCheckCatalog,
  createEngineeringPreimplementationEvidence,
  evaluateEngineeringGate,
  validateEngineeringCheckCatalog,
  validateEngineeringGateDecision,
  validateEngineeringPreimplementationEvidence,
} from "./gate.mjs";
import {
  diffContentBoundWorkspaces,
  normalizeNormalSessionOwnedPath,
  observeContentBoundWorkspace,
  validateContentBoundWorkspace,
} from "./normal-session-workspace.mjs";
import { requiredEngineeringVerificationTargets } from "./verification-targets.mjs";
import {
  ContractError,
  assertArray,
  assertFingerprint,
  assertInteger,
  assertPlain,
  assertString,
  canonicalJson,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

export const NORMAL_SESSION_QUALITY_TOOL_IDS = Object.freeze([
  "quality_dossier_create",
  "quality_dossier_update",
  "quality_dossier_inspect",
  "quality_architecture_evaluate",
  "quality_dossier_finalize",
  "quality_action_authorize",
  "quality_verification_record",
  "quality_session_finalize",
]);

export const NORMAL_SESSION_BRIDGE_SCHEMA_VERSION = 2;
export const NORMAL_SESSION_BRIDGE_PRODUCER = "opencode-harness-normal-quality-runner";

const BRIDGE_INTERNALS = new WeakMap();
const NATIVE_MUTATION_TOOLS = new Set(["edit", "write", "apply_patch", "task"]);
const READ_ONLY_TASKS = new Set(["architect", "diagnose", "explore", "researcher", "reviewer", "verifier"]);
const MAX_OBSERVED_CALLS = 128;
const OWNER_RECORD_KIND = "owner";
const CHILD_RECORD_KIND = "child_link";
const RUNNER_FIELDS = new Set([
  "architecture_assessment",
  "dossier_id",
  "fingerprint",
  "finalized_at",
  "gate_state",
  "plan_challenge",
  "revision",
  "run_id",
  "schema_version",
  "status",
  "task_id",
  "created_at",
  "updated_at",
  "starting_commit",
]);
const PATCH_RUNNER_FIELDS = new Set(["architecture_assessment", "gate_state", "plan_challenge"]);
const STATE_KEYS = Object.freeze([
  "schema_version",
  "record_kind",
  "state_revision",
  "session_key",
  "worktree_fingerprint",
  "workspace_salt",
  "run_id",
  "task_id",
  "lifecycle",
  "initial_workspace",
  "last_workspace",
  "dossier",
  "gate",
  "preimplementation_evidence",
  "architecture_configuration",
  "architecture_evaluation",
  "contributions",
  "capabilities",
  "observed_calls",
  "pending_mutations",
  "active_task_launch",
  "mutation_revision",
  "verification",
  "attestation",
  "incomplete_reasons",
]);

const CHILD_STATE_KEYS = Object.freeze([
  "schema_version",
  "record_kind",
  "state_revision",
  "session_key",
  "parent_session_key",
  "worktree_fingerprint",
  "launch_id",
  "authorized_agent",
  "writable",
  "status",
  "created_at",
  "fingerprint",
]);

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function safeToken(prefix) {
  return `${prefix}-${randomBytes(12).toString("hex")}`;
}

function bridgeState(bridge) {
  const state = BRIDGE_INTERNALS.get(bridge);
  if (!state) throw new ContractError("QUALITY_NORMAL_BRIDGE", "bridge was not created by createNormalSessionQualityBridge");
  return state;
}

function rejectRunnerFields(value, restricted, label) {
  for (const key of Object.keys(value)) {
    if (restricted.has(key)) {
      throw new ContractError("QUALITY_RUNNER_FIELD", `${label}.${key} is runner-owned`);
    }
  }
}

function parseRequest(serialized, label) {
  if (typeof serialized !== "string" || serialized.length === 0 || Buffer.byteLength(serialized, "utf8") > 256_000) {
    throw new ContractError("QUALITY_TOOL_REQUEST", `${label} must be a bounded JSON string`);
  }
  let value;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new ContractError("QUALITY_TOOL_REQUEST", `${label} must contain valid JSON`);
  }
  assertPlain(value, label);
  return value;
}

function normalizeOwnedPath(value, workspaceRoot, label, { allowNativeSeparators = false } = {}) {
  return normalizeNormalSessionOwnedPath(value, workspaceRoot, label, { allowHostPath: allowNativeSeparators });
}

function withinOwnership(file, ownership) {
  return ownership.some((entry) => file === entry || file.startsWith(`${entry}/`));
}

function normalizePathSet(values, workspaceRoot, label) {
  assertArray(values, label, { min: 1, max: 128 });
  return Object.freeze([...new Set(values.map((entry, index) => {
    assertString(entry, `${label}[${index}]`, { maxBytes: 1000 });
    return normalizeOwnedPath(entry, workspaceRoot, `${label}[${index}]`);
  }))].sort());
}

function exactSameStrings(left, right) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function commandResult(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    status: result.error ? "blocked" : result.status === 0 ? "passed" : "failed",
    exit_code: Number.isInteger(result.status) ? result.status : null,
    signal: result.signal ?? null,
  };
}

export const observeNormalSessionWorkspace = observeContentBoundWorkspace;

export function createDefaultNormalSessionCheckCatalog() {
  return createEngineeringCheckCatalog({
    catalog_id: "normal-session-quality-catalog-v1",
    checks: [
      { check_id: "normal-harness-static", trusted_producer: NORMAL_SESSION_BRIDGE_PRODUCER, phases: ["preimplementation", "slice", "integration"], available: true },
      { check_id: "normal-engineering-quality", trusted_producer: NORMAL_SESSION_BRIDGE_PRODUCER, phases: ["preimplementation", "slice", "integration"], available: true },
      { check_id: "normal-committed-whitespace", trusted_producer: NORMAL_SESSION_BRIDGE_PRODUCER, phases: ["preimplementation", "slice", "integration"], available: true },
    ],
    mechanisms: [
      { mechanism_id: "normal-architect-challenge", trusted_producer: NORMAL_SESSION_BRIDGE_PRODUCER, phases: ["preimplementation", "integration"], available: true },
      { mechanism_id: "normal-reviewer-challenge", trusted_producer: NORMAL_SESSION_BRIDGE_PRODUCER, phases: ["preimplementation", "integration"], available: true },
    ],
  });
}

function defaultTrustedRunner({ targetId, workspaceRoot }) {
  const commands = new Map([
    ["normal-harness-static", [process.execPath, [path.join(workspaceRoot, "scripts", "verify-harness.mjs")], "node:scripts/verify-harness.mjs"]],
    ["normal-engineering-quality", [process.execPath, [path.join(workspaceRoot, "scripts", "verify-engineering-quality.mjs")], "node:scripts/verify-engineering-quality.mjs"]],
    ["normal-committed-whitespace", [process.execPath, [path.join(workspaceRoot, "scripts", "verify-committed-whitespace.mjs"), "--json"], "node:scripts/verify-committed-whitespace.mjs"]],
  ]);
  const selected = commands.get(targetId);
  if (!selected) return { status: "blocked", command_id: `unavailable:${targetId}`, exit_code: null };
  const result = commandResult(selected[0], selected[1], workspaceRoot);
  return { ...result, command_id: selected[2] };
}

function validateWorkspaceSnapshot(value, label) {
  return validateContentBoundWorkspace(value, label);
}

function assertBoundFingerprint(value, label) {
  assertFingerprint(value.fingerprint, `${label}.fingerprint`);
  const source = { ...value };
  delete source.fingerprint;
  if (!fingerprintsEqual(value.fingerprint, fingerprint(source))) {
    throw new ContractError("QUALITY_STATE_FINGERPRINT", `${label}.fingerprint does not bind its fields`);
  }
}

function validateStateArray(value, label, { max = 128, item }) {
  assertArray(value, label, { max });
  value.forEach((entry, index) => item(entry, `${label}[${index}]`));
}

function validateCapability(value, label) {
  exact(value, ["capability_id", "kind", "target_agent", "paths", "dossier_revision", "gate_fingerprint", "mutation_revision", "consumed", "bound_call_id", "fingerprint"], ["capability_id", "kind", "target_agent", "paths", "dossier_revision", "gate_fingerprint", "mutation_revision", "consumed", "bound_call_id", "fingerprint"], label);
  if (!["edit", "task"].includes(value.kind) || typeof value.consumed !== "boolean") throw new ContractError("QUALITY_STATE_SCHEMA", `${label} is invalid`);
  if (value.target_agent !== null && value.target_agent !== "general") throw new ContractError("QUALITY_STATE_SCHEMA", `${label}.target_agent is invalid`);
  assertInteger(value.dossier_revision, `${label}.dossier_revision`, { min: 1 });
  assertInteger(value.mutation_revision, `${label}.mutation_revision`, { min: 0 });
  assertFingerprint(value.gate_fingerprint, `${label}.gate_fingerprint`);
  validateStateArray(value.paths, `${label}.paths`, { max: 128, item: (entry, entryLabel) => assertString(entry, entryLabel, { maxBytes: 1000 }) });
  if (value.bound_call_id !== null) assertString(value.bound_call_id, `${label}.bound_call_id`, { maxBytes: 1000 });
  assertBoundFingerprint(value, label);
}

function validateObservedCall(value, label) {
  exact(value, ["call_id", "session_key", "tool_id", "paths", "target_agent", "fingerprint"], ["call_id", "session_key", "tool_id", "paths", "target_agent", "fingerprint"], label);
  assertString(value.call_id, `${label}.call_id`, { maxBytes: 1000 });
  assertString(value.session_key, `${label}.session_key`, { maxBytes: 128 });
  if (!NATIVE_MUTATION_TOOLS.has(value.tool_id)) throw new ContractError("QUALITY_STATE_SCHEMA", `${label}.tool_id is invalid`);
  validateStateArray(value.paths, `${label}.paths`, { max: 128, item: (entry, entryLabel) => assertString(entry, entryLabel, { maxBytes: 1000 }) });
  if (value.target_agent !== null) assertString(value.target_agent, `${label}.target_agent`, { maxBytes: 128 });
  assertBoundFingerprint(value, label);
}

function validatePendingMutation(value, label) {
  exact(value, ["call_id", "session_key", "tool_id", "expected_paths", "before_workspace", "started_at", "fingerprint"], ["call_id", "session_key", "tool_id", "expected_paths", "before_workspace", "started_at", "fingerprint"], label);
  assertString(value.call_id, `${label}.call_id`, { maxBytes: 1000 });
  assertString(value.session_key, `${label}.session_key`, { maxBytes: 128 });
  if (!NATIVE_MUTATION_TOOLS.has(value.tool_id)) throw new ContractError("QUALITY_STATE_SCHEMA", `${label}.tool_id is invalid`);
  validateStateArray(value.expected_paths, `${label}.expected_paths`, { max: 128, item: (entry, entryLabel) => assertString(entry, entryLabel, { maxBytes: 1000 }) });
  validateWorkspaceSnapshot(value.before_workspace, `${label}.before_workspace`);
  assertString(value.started_at, `${label}.started_at`, { maxBytes: 128 });
  assertBoundFingerprint(value, label);
}

function validateContribution(value, label) {
  exact(value, ["role", "result_id", "subject_fingerprint", "blocking", "completed_at", "fingerprint"], ["role", "result_id", "subject_fingerprint", "blocking", "completed_at", "fingerprint"], label);
  if (!["architect", "reviewer"].includes(value.role) || typeof value.blocking !== "boolean") throw new ContractError("QUALITY_STATE_SCHEMA", `${label} is invalid`);
  assertString(value.result_id, `${label}.result_id`, { maxBytes: 256 });
  assertFingerprint(value.subject_fingerprint, `${label}.subject_fingerprint`);
  assertString(value.completed_at, `${label}.completed_at`, { maxBytes: 128 });
  assertBoundFingerprint(value, label);
}

function validateActiveTaskLaunch(value, label) {
  if (value === null) return;
  exact(value, ["launch_id", "parent_call_id", "kind", "target_agent", "capability_id", "delegated_paths", "phase", "child_session_key", "before_workspace", "started_at", "fingerprint"], ["launch_id", "parent_call_id", "kind", "target_agent", "capability_id", "delegated_paths", "phase", "child_session_key", "before_workspace", "started_at", "fingerprint"], label);
  if (!["read_only", "writable"].includes(value.kind) || !["awaiting_child", "child_active", "failed"].includes(value.phase)) throw new ContractError("QUALITY_STATE_SCHEMA", `${label} is invalid`);
  assertString(value.launch_id, `${label}.launch_id`, { maxBytes: 256 });
  assertString(value.parent_call_id, `${label}.parent_call_id`, { maxBytes: 1000 });
  assertString(value.target_agent, `${label}.target_agent`, { maxBytes: 128 });
  if (value.capability_id !== null) assertString(value.capability_id, `${label}.capability_id`, { maxBytes: 256 });
  if (value.child_session_key !== null) assertString(value.child_session_key, `${label}.child_session_key`, { maxBytes: 128 });
  validateStateArray(value.delegated_paths, `${label}.delegated_paths`, { max: 128, item: (entry, entryLabel) => assertString(entry, entryLabel, { maxBytes: 1000 }) });
  validateWorkspaceSnapshot(value.before_workspace, `${label}.before_workspace`);
  assertString(value.started_at, `${label}.started_at`, { maxBytes: 128 });
  assertBoundFingerprint(value, label);
}

function validateArchitectureConfiguration(value, label) {
  exact(value, ["status", "path", "policy_id", "policy_fingerprint"], ["status", "path", "policy_id", "policy_fingerprint"], label);
  if (!["not_configured", "configured", "invalid"].includes(value.status) || value.path !== "quality/architecture-policy.json") {
    throw new ContractError("QUALITY_STATE_SCHEMA", `${label} is invalid`);
  }
  if (value.status === "configured") {
    assertString(value.policy_id, `${label}.policy_id`, { maxBytes: 256 });
    assertFingerprint(value.policy_fingerprint, `${label}.policy_fingerprint`);
  } else if (value.policy_id !== null || value.policy_fingerprint !== null) {
    throw new ContractError("QUALITY_STATE_SCHEMA", `${label} non-configured state cannot bind policy identity`);
  }
}

function validateVerificationReceipt(value, label) {
  exact(value, ["kind", "target_id", "status", "command_id", "exit_code"], ["kind", "target_id", "status", "command_id", "exit_code"], label);
  if (!["check", "mechanism"].includes(value.kind) || !["passed", "failed", "blocked"].includes(value.status)) throw new ContractError("QUALITY_STATE_SCHEMA", `${label} is invalid`);
  assertString(value.target_id, `${label}.target_id`, { maxBytes: 256 });
  if (value.command_id !== null) assertString(value.command_id, `${label}.command_id`, { maxBytes: 1000 });
  if (value.exit_code !== null) assertInteger(value.exit_code, `${label}.exit_code`, { min: 0, max: 255 });
}

function validateVerification(value, state, label) {
  exact(value, ["verification_id", "dossier_revision", "gate_fingerprint", "mutation_revision", "workspace_fingerprint", "target_check_ids", "target_mechanism_ids", "receipts", "complete", "completed_at", "fingerprint"], ["verification_id", "dossier_revision", "gate_fingerprint", "mutation_revision", "workspace_fingerprint", "target_check_ids", "target_mechanism_ids", "receipts", "complete", "completed_at", "fingerprint"], label);
  assertInteger(value.dossier_revision, `${label}.dossier_revision`, { min: 1 });
  assertInteger(value.mutation_revision, `${label}.mutation_revision`, { min: 0 });
  assertFingerprint(value.gate_fingerprint, `${label}.gate_fingerprint`);
  assertFingerprint(value.workspace_fingerprint, `${label}.workspace_fingerprint`);
  validateStateArray(value.target_check_ids, `${label}.target_check_ids`, { max: 256, item: (entry, entryLabel) => assertString(entry, entryLabel, { maxBytes: 256 }) });
  validateStateArray(value.target_mechanism_ids, `${label}.target_mechanism_ids`, { max: 256, item: (entry, entryLabel) => assertString(entry, entryLabel, { maxBytes: 256 }) });
  validateStateArray(value.receipts, `${label}.receipts`, { max: 512, item: validateVerificationReceipt });
  if (typeof value.complete !== "boolean") throw new ContractError("QUALITY_STATE_SCHEMA", `${label}.complete is invalid`);
  const required = requiredEngineeringVerificationTargets(state.dossier);
  if (!exactSameStrings(value.target_check_ids, required.checkIds) || !exactSameStrings(value.target_mechanism_ids, required.mechanismIds)) {
    throw new ContractError("QUALITY_STATE_BINDING", `${label} target identities do not match the canonical dossier targets`);
  }
  const receiptIds = value.receipts.map((entry) => `${entry.kind}:${entry.target_id}`).sort();
  const targetIds = [
    ...value.target_check_ids.map((entry) => `check:${entry}`),
    ...value.target_mechanism_ids.map((entry) => `mechanism:${entry}`),
  ].sort();
  if (!exactSameStrings(receiptIds, targetIds)) throw new ContractError("QUALITY_STATE_BINDING", `${label} receipts do not exactly cover canonical targets`);
  const expectedCount = value.target_check_ids.length + value.target_mechanism_ids.length;
  const computedComplete = value.receipts.length === expectedCount && value.receipts.every((entry) => entry.status === "passed");
  if (value.complete !== computedComplete || value.dossier_revision !== state.dossier?.revision || value.gate_fingerprint !== state.gate?.fingerprint
    || value.mutation_revision !== state.mutation_revision || value.workspace_fingerprint !== state.last_workspace.fingerprint) {
    throw new ContractError("QUALITY_STATE_BINDING", `${label} does not bind the current dossier, gate, mutation, and workspace`);
  }
  assertBoundFingerprint(value, label);
}

function validateAttestation(value, state, label) {
  exact(value, ["schema_version", "run_id", "task_id", "dossier_id", "dossier_fingerprint", "gate_fingerprint", "verification_fingerprint", "final_workspace_fingerprint", "mutation_revision", "attested_at", "fingerprint"], ["schema_version", "run_id", "task_id", "dossier_id", "dossier_fingerprint", "gate_fingerprint", "verification_fingerprint", "final_workspace_fingerprint", "mutation_revision", "attested_at", "fingerprint"], label);
  if (value.schema_version !== 1) throw new ContractError("QUALITY_STATE_SCHEMA", `${label}.schema_version is invalid`);
  assertInteger(value.mutation_revision, `${label}.mutation_revision`, { min: 0 });
  for (const key of ["dossier_fingerprint", "gate_fingerprint", "verification_fingerprint", "final_workspace_fingerprint"]) assertFingerprint(value[key], `${label}.${key}`);
  if (value.run_id !== state.run_id || value.task_id !== state.task_id || value.dossier_id !== state.dossier?.dossier_id
    || value.dossier_fingerprint !== state.dossier?.fingerprint || value.gate_fingerprint !== state.gate?.fingerprint
    || value.verification_fingerprint !== state.verification?.fingerprint || value.final_workspace_fingerprint !== state.last_workspace.fingerprint
    || value.mutation_revision !== state.mutation_revision) {
    throw new ContractError("QUALITY_STATE_BINDING", `${label} does not bind the current quality state`);
  }
  assertBoundFingerprint(value, label);
}

function stateBinding(condition, detail, code = "QUALITY_STATE_BINDING") {
  if (!condition) throw new ContractError(code, detail);
}

function validateOwnerStateCoherence(value, expected) {
  const lifecycle = value.lifecycle;
  stateBinding(
    ["dossier_draft", "implementation_enabled", "gate_blocked", "attested"].includes(lifecycle),
    "normal-session lifecycle is invalid",
    "QUALITY_STATE_LIFECYCLE",
  );
  stateBinding(value.dossier !== null, "normal-session owner state must retain its dossier");
  stateBinding(value.dossier.run_id === value.run_id && value.dossier.task_id === value.task_id,
    "normal-session runner identity does not match its dossier");
  stateBinding(value.dossier.task_shape.starting_commit === value.initial_workspace.head_sha,
    "normal-session dossier does not bind the initial workspace commit");

  if (value.gate !== null) {
    stateBinding(value.gate.dossier_id === value.dossier.dossier_id
      && value.gate.dossier_fingerprint === value.dossier.fingerprint
      && value.gate.task_id === value.task_id
      && value.gate.risk_class === value.dossier.risk_class,
    "normal-session gate identity does not bind its dossier");
    stateBinding(value.gate.check_catalog_fingerprint === expected.catalogFingerprint,
      "normal-session gate does not bind the active trusted check catalog");
    stateBinding(value.gate.preimplementation_evidence_fingerprint === (value.preimplementation_evidence?.fingerprint ?? null),
      "normal-session gate does not bind its preimplementation evidence");
  }
  if (value.preimplementation_evidence !== null) {
    stateBinding(value.preimplementation_evidence.dossier_id === value.dossier.dossier_id
      && value.preimplementation_evidence.dossier_fingerprint === value.dossier.fingerprint,
    "normal-session preimplementation evidence does not bind its dossier");
  }

  const contributionRoles = value.contributions.map((entry) => entry.role);
  stateBinding(new Set(contributionRoles).size === contributionRoles.length,
    "normal-session plan challenge roles must be unique");
  const challengeSubject = challengeSubjectFingerprint(value.dossier);
  for (const contribution of value.contributions) {
    stateBinding(contribution.subject_fingerprint === challengeSubject,
      "normal-session plan challenge evidence is stale");
    const dossierResult = contribution.role === "architect"
      ? value.dossier.plan_challenge.architect_result_id
      : value.dossier.plan_challenge.reviewer_result_id;
    stateBinding(contribution.result_id === dossierResult,
      "normal-session plan challenge result identity does not bind the dossier");
  }

  for (const capability of value.capabilities) {
    stateBinding(capability.dossier_revision === value.dossier.revision
      && capability.gate_fingerprint === value.gate?.fingerprint
      && capability.mutation_revision <= value.mutation_revision,
    "normal-session capability does not bind the current dossier, gate, and mutation lineage");
    stateBinding(capability.consumed === (capability.bound_call_id !== null),
      "normal-session capability consumption state is inconsistent");
    if (!capability.consumed) {
      stateBinding(capability.mutation_revision === value.mutation_revision,
        "unconsumed normal-session capability is stale");
    } else {
      const observed = value.observed_calls.find((entry) => entry.call_id === capability.bound_call_id
        && entry.session_key === value.session_key);
      const kindMatches = capability.kind === "task"
        ? observed?.tool_id === "task" && observed.target_agent === "general"
        : ["edit", "write", "apply_patch"].includes(observed?.tool_id) && observed.target_agent === null;
      stateBinding(kindMatches && exactSameStrings(observed.paths, capability.paths),
        "consumed normal-session capability does not bind its observed native call");
    }
  }

  stateBinding(value.pending_mutations.length <= 1, "normal-session state contains concurrent pending mutations");
  for (const pending of value.pending_mutations) {
    const observed = value.observed_calls.find((entry) => entry.call_id === pending.call_id
      && entry.session_key === pending.session_key && entry.tool_id === pending.tool_id);
    stateBinding(observed !== undefined && exactSameStrings(observed.paths, pending.expected_paths),
      "normal-session pending mutation does not bind its observed native call");
  }
  if (value.active_task_launch !== null) {
    const launch = value.active_task_launch;
    const observed = value.observed_calls.find((entry) => entry.call_id === launch.parent_call_id
      && entry.session_key === value.session_key && entry.tool_id === "task");
    stateBinding(observed?.target_agent === launch.target_agent,
      "normal-session task launch does not bind its observed native call");
    if (launch.kind === "writable") {
      const capability = value.capabilities.find((entry) => entry.capability_id === launch.capability_id);
      stateBinding(launch.target_agent === "general" && capability?.kind === "task" && capability.consumed
        && exactSameStrings(capability.paths, launch.delegated_paths),
      "writable normal-session task launch does not bind its capability");
    } else {
      stateBinding(launch.target_agent !== "general" && launch.capability_id === null && launch.delegated_paths.length === 0,
        "read-only normal-session task launch has writable authority");
    }
    stateBinding((launch.phase === "awaiting_child" && launch.child_session_key === null)
      || (["child_active", "failed"].includes(launch.phase) && launch.child_session_key !== null),
    "normal-session task child binding is inconsistent");
  }

  if (lifecycle === "dossier_draft") {
    stateBinding(value.dossier.status === "draft" && value.gate === null && value.preimplementation_evidence === null
      && value.architecture_evaluation === null && value.verification === null && value.attestation === null
      && value.capabilities.length === 0 && value.pending_mutations.length === 0,
    "draft normal-session lifecycle contains post-gate state", "QUALITY_STATE_LIFECYCLE");
  } else if (lifecycle === "gate_blocked") {
    stateBinding(value.dossier.status === "finalized" && value.gate?.status === "blocked"
      && value.verification === null && value.attestation === null && value.capabilities.length === 0
      && value.pending_mutations.length === 0 && value.active_task_launch === null,
    "blocked normal-session lifecycle is inconsistent", "QUALITY_STATE_LIFECYCLE");
  } else if (lifecycle === "implementation_enabled") {
    stateBinding(value.dossier.status === "finalized" && value.gate?.status === "passed" && value.attestation === null,
      "implementation-enabled normal-session lifecycle is inconsistent", "QUALITY_STATE_LIFECYCLE");
  } else {
    stateBinding(value.dossier.status === "finalized" && value.gate?.status === "passed"
      && value.verification?.complete === true && value.attestation !== null
      && value.pending_mutations.length === 0 && value.active_task_launch === null
      && value.capabilities.every((entry) => entry.consumed) && value.incomplete_reasons.length === 0,
    "attested normal-session lifecycle is inconsistent", "QUALITY_STATE_LIFECYCLE");
  }
}

function validateOwnerState(value, expected) {
  exact(value, STATE_KEYS, STATE_KEYS, "normal-session owner state");
  if (value.record_kind !== OWNER_RECORD_KIND) throw new ContractError("QUALITY_STATE_SCHEMA", "normal-session owner record kind is invalid");
  assertInteger(value.state_revision, "normal-session state.state_revision", { min: 1 });
  if (value.session_key !== expected.sessionKey || value.worktree_fingerprint !== expected.worktreeFingerprint) throw new ContractError("QUALITY_STATE_BINDING", "normal-session owner belongs to another session or worktree");
  assertFingerprint(value.workspace_salt, "normal-session state.workspace_salt");
  assertString(value.run_id, "normal-session state.run_id", { maxBytes: 256 });
  assertString(value.task_id, "normal-session state.task_id", { maxBytes: 256 });
  validateWorkspaceSnapshot(value.initial_workspace, "normal-session state.initial_workspace");
  validateWorkspaceSnapshot(value.last_workspace, "normal-session state.last_workspace");
  if (value.dossier !== null) validateEngineeringDossier(value.dossier);
  if (value.gate !== null) validateEngineeringGateDecision(value.gate);
  if (value.preimplementation_evidence !== null) validateEngineeringPreimplementationEvidence(value.preimplementation_evidence);
  validateArchitectureConfiguration(value.architecture_configuration, "normal-session state.architecture_configuration");
  if (value.architecture_evaluation !== null) validateArchitectureEvaluation(value.architecture_evaluation);
  if (value.gate !== null && value.gate.architecture_evaluation_fingerprint !== (value.architecture_evaluation?.fingerprint ?? null)) {
    throw new ContractError("QUALITY_STATE_BINDING", "normal-session gate does not bind its architecture evaluation");
  }
  validateStateArray(value.contributions, "normal-session state.contributions", { item: validateContribution });
  validateStateArray(value.capabilities, "normal-session state.capabilities", { item: validateCapability });
  validateStateArray(value.observed_calls, "normal-session state.observed_calls", { item: validateObservedCall });
  validateStateArray(value.pending_mutations, "normal-session state.pending_mutations", { item: validatePendingMutation });
  validateActiveTaskLaunch(value.active_task_launch, "normal-session state.active_task_launch");
  assertInteger(value.mutation_revision, "normal-session state.mutation_revision", { min: 0 });
  if (value.verification !== null) validateVerification(value.verification, value, "normal-session state.verification");
  if (value.attestation !== null) validateAttestation(value.attestation, value, "normal-session state.attestation");
  validateStateArray(value.incomplete_reasons, "normal-session state.incomplete_reasons", { max: 64, item: (entry, entryLabel) => assertString(entry, entryLabel, { maxBytes: 256 }) });
  validateOwnerStateCoherence(value, expected);
  return value;
}

function validateChildState(value, expected) {
  exact(value, CHILD_STATE_KEYS, CHILD_STATE_KEYS, "normal-session child link");
  if (value.record_kind !== CHILD_RECORD_KIND || value.session_key !== expected.sessionKey || value.worktree_fingerprint !== expected.worktreeFingerprint) throw new ContractError("QUALITY_STATE_BINDING", "normal-session child link binding is invalid");
  assertInteger(value.state_revision, "normal-session child link.state_revision", { min: 1 });
  assertString(value.parent_session_key, "normal-session child link.parent_session_key", { maxBytes: 128 });
  assertString(value.launch_id, "normal-session child link.launch_id", { maxBytes: 256 });
  if (!READ_ONLY_TASKS.has(value.authorized_agent) && value.authorized_agent !== "general") throw new ContractError("QUALITY_STATE_SCHEMA", "normal-session child role is invalid");
  if (typeof value.writable !== "boolean" || !["active", "closed", "quarantined"].includes(value.status)) throw new ContractError("QUALITY_STATE_SCHEMA", "normal-session child link state is invalid");
  assertString(value.created_at, "normal-session child link.created_at", { maxBytes: 128 });
  assertBoundFingerprint(value, "normal-session child link");
  return value;
}

function validatePersistedState(value, expected) {
  if (value?.schema_version !== NORMAL_SESSION_BRIDGE_SCHEMA_VERSION) throw new ContractError("QUALITY_STATE_VERSION", "normal-session state schema is unsupported");
  if (value.record_kind === OWNER_RECORD_KIND) return validateOwnerState(value, expected);
  if (value.record_kind === CHILD_RECORD_KIND) return validateChildState(value, expected);
  throw new ContractError("QUALITY_STATE_SCHEMA", "normal-session persisted record kind is invalid");
}

function sessionKey(sessionId) {
  assertString(sessionId, "OpenCode session ID", { maxBytes: 1000 });
  return createHash("sha256").update(sessionId).digest("hex");
}

function statePaths(internals, key) {
  const file = resolveInside(internals.sessionRoot, `${key}.json`);
  return { file, lock: resolveInside(internals.sessionRoot, `${key}.lock`) };
}

function readStateByKey(internals, key, { required = true } = {}) {
  const { file } = statePaths(internals, key);
  if (!fs.existsSync(file)) {
    if (!required) return null;
    throw new ContractError("QUALITY_SESSION_PENDING", "quality session has not created a dossier");
  }
  let value;
  try {
    value = readJson(file);
  } catch {
    throw new ContractError("QUALITY_STATE_CORRUPT", "normal-session quality state is corrupt or partial");
  }
  return validatePersistedState(value, {
    sessionKey: key,
    worktreeFingerprint: internals.worktreeFingerprint,
    catalogFingerprint: internals.catalog.fingerprint,
  });
}

function readState(internals, rawSessionId, options = {}) {
  return readStateByKey(internals, sessionKey(rawSessionId), options);
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

function recoverStaleSessionLock(internals, lock) {
  if (!fs.existsSync(lock)) return;
  let raw;
  let record;
  let identity;
  try {
    identity = fs.lstatSync(lock);
    raw = fs.readFileSync(lock, "utf8");
    record = JSON.parse(raw);
  } catch {
    throw new ContractError("FILES_LOCKED", `session lock is present but not safely recoverable: ${path.basename(lock)}`);
  }
  if (!record || record.schema_version !== 1 || !Number.isInteger(record.pid) || !Number.isInteger(record.created_at_ms)
    || typeof record.nonce !== "string" || Date.now() - record.created_at_ms < internals.lockStaleMs
    || processIsAlive(record.pid)) {
    throw new ContractError("FILES_LOCKED", `artifact is already locked: ${path.basename(lock)}`);
  }
  const quarantine = resolveInside(internals.sessionRoot, `${path.basename(lock)}.stale-${randomBytes(8).toString("hex")}`);
  try {
    fs.renameSync(lock, quarantine);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw new ContractError("FILES_LOCKED", `stale session lock could not be isolated: ${path.basename(lock)}`);
  }
  const moved = fs.lstatSync(quarantine);
  const sameIdentity = moved.dev === identity.dev && moved.ino === identity.ino
    && moved.size === identity.size && moved.mtimeMs === identity.mtimeMs;
  if (!sameIdentity || fs.readFileSync(quarantine, "utf8") !== raw) {
    if (!fs.existsSync(lock)) fs.renameSync(quarantine, lock);
    throw new ContractError("FILES_LOCKED", `session lock changed during stale recovery: ${path.basename(lock)}`);
  }
  fs.unlinkSync(quarantine);
}

function writeState(internals, state, { expectedRevision = null, createOnly = false } = {}) {
  const { file, lock } = statePaths(internals, state.session_key);
  recoverStaleSessionLock(internals, lock);
  return withExclusiveLock(lock, () => {
    if (fs.existsSync(file)) {
      if (createOnly) throw new ContractError("QUALITY_STATE_RECORD_CONFLICT", "normal-session state already exists");
      let current;
      try {
        current = readJson(file);
      } catch {
        throw new ContractError("QUALITY_STATE_CORRUPT", "normal-session quality state cannot be overwritten after corruption");
      }
      validatePersistedState(current, {
        sessionKey: state.session_key,
        worktreeFingerprint: internals.worktreeFingerprint,
        catalogFingerprint: internals.catalog.fingerprint,
      });
      if (expectedRevision !== null && current.state_revision !== expectedRevision) {
        throw new ContractError("QUALITY_STATE_REVISION_CONFLICT", "normal-session quality state changed concurrently");
      }
      state.state_revision = current.state_revision + 1;
    } else {
      if (expectedRevision !== null) throw new ContractError("QUALITY_STATE_REVISION_CONFLICT", "normal-session quality state disappeared");
      state.state_revision = 1;
    }
    if (state.record_kind === CHILD_RECORD_KIND) refreshBoundFingerprint(state);
    const persisted = deepFrozenClone(state, "normal-session persisted state");
    validatePersistedState(persisted, {
      sessionKey: state.session_key,
      worktreeFingerprint: internals.worktreeFingerprint,
      catalogFingerprint: internals.catalog.fingerprint,
    });
    atomicWriteJson(file, persisted, { basePath: internals.qualityRoot });
    return state;
  }, {
    basePath: internals.qualityRoot,
    lockIdFactory: () => canonicalJson({ schema_version: 1, pid: process.pid, created_at_ms: Date.now(), nonce: randomBytes(16).toString("hex") }),
  });
}

function mutateStateByKey(internals, key, callback) {
  const current = readStateByKey(internals, key);
  const beforeRevision = current.state_revision;
  const next = JSON.parse(canonicalJson(current));
  const result = callback(next);
  writeState(internals, next, { expectedRevision: beforeRevision });
  return result;
}

function mutateState(internals, rawSessionId, callback) {
  return mutateStateByKey(internals, sessionKey(rawSessionId), callback);
}

function resolveOwnerRecord(internals, rawSessionId, { required = true } = {}) {
  const record = readState(internals, rawSessionId, { required });
  if (record === null) return null;
  if (record.record_kind === OWNER_RECORD_KIND) return { owner: record, ownerKey: record.session_key, link: null };
  const owner = readStateByKey(internals, record.parent_session_key);
  if (owner.record_kind !== OWNER_RECORD_KIND || record.status !== "active"
    || owner.active_task_launch?.launch_id !== record.launch_id
    || owner.active_task_launch?.child_session_key !== record.session_key
    || owner.active_task_launch?.phase !== "child_active") {
    throw new ContractError("QUALITY_CHILD_LINK_STALE", "child session is not bound to an active parent task launch");
  }
  return { owner, ownerKey: owner.session_key, link: record };
}

function mutateOwnerState(internals, rawSessionId, callback) {
  const resolved = resolveOwnerRecord(internals, rawSessionId);
  return mutateStateByKey(internals, resolved.ownerKey, (owner) => callback(owner, resolved.link));
}

function inspectReceipt(state, catalog) {
  return deepFrozenClone({
    schema_version: 1,
    run_id: state.run_id,
    task_id: state.task_id,
    lifecycle: state.lifecycle,
    dossier_id: state.dossier?.dossier_id ?? null,
    dossier_revision: state.dossier?.revision ?? null,
    dossier_status: state.dossier?.status ?? "absent",
    gate_status: state.gate?.status ?? "not_evaluated",
    gate_fingerprint: state.gate?.fingerprint ?? null,
    ownership_paths: state.dossier?.verification_boundary?.ownership_paths ?? [],
    available_check_ids: catalog.checks.filter((entry) => entry.available).map((entry) => entry.check_id).sort(),
    available_mechanism_ids: catalog.mechanisms.filter((entry) => entry.available).map((entry) => entry.mechanism_id).sort(),
    mutation_pending: state.pending_mutations.length > 0,
    verification_complete: state.verification?.complete === true,
    incomplete_reasons: [...state.incomplete_reasons],
  }, "normal-session quality inspection receipt");
}

function observeStateWorkspace(internals, state, additionalPaths = []) {
  const retainedPaths = state.last_workspace.entries.map((entry) => entry.path);
  const ownershipPaths = state.dossier.verification_boundary.ownership_paths;
  const policyPath = state.architecture_configuration.path;
  const includedPaths = [...new Set([...retainedPaths, ...ownershipPaths, policyPath, ...additionalPaths])].sort();
  const current = internals.observeWorkspace(internals.workspaceRoot, state.workspace_salt, includedPaths);
  validateWorkspaceSnapshot(current, "normal-session current workspace");
  return current;
}

function stateWorkspaceMatches(internals, state) {
  const current = observeStateWorkspace(internals, state);
  if (current.fingerprint !== state.last_workspace.fingerprint) {
    throw new ContractError("QUALITY_WORKSPACE_UNTRACED", "workspace changed outside a reconciled quality mutation");
  }
  return current;
}

function contributionFor(state, role) {
  return state.contributions.find((entry) => entry.role === role) ?? null;
}

function challengeSubjectFingerprint(dossier) {
  const {
    architecture_assessment: _architectureAssessment,
    created_at: _createdAt,
    dossier_id: _dossierId,
    finalized_at: _finalizedAt,
    fingerprint: _fingerprint,
    gate_state: _gateState,
    plan_challenge: _planChallenge,
    revision: _revision,
    run_id: _runId,
    schema_version: _schemaVersion,
    starting_commit: _startingCommit,
    status: _status,
    task_id: _taskId,
    updated_at: _updatedAt,
    ...agentOwned
  } = dossier;
  return fingerprint(agentOwned);
}

function loadArchitecturePolicy(workspaceRoot) {
  const relativePath = "quality/architecture-policy.json";
  const policyPath = path.join(workspaceRoot, "quality", "architecture-policy.json");
  if (!fs.existsSync(policyPath)) {
    return { configuration: { status: "not_configured", path: relativePath, policy_id: null, policy_fingerprint: null }, policy: null };
  }
  try {
    const policy = parseArchitecturePolicy(fs.readFileSync(policyPath, "utf8"));
    return {
      configuration: { status: "configured", path: relativePath, policy_id: policy.policy_id, policy_fingerprint: policy.fingerprint },
      policy,
    };
  } catch {
    return { configuration: { status: "invalid", path: relativePath, policy_id: null, policy_fingerprint: null }, policy: null };
  }
}

function sameArchitectureConfiguration(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function assertCurrentArchitectureConfiguration(internals, state) {
  const current = loadArchitecturePolicy(internals.workspaceRoot);
  if (current.configuration.status === "invalid") {
    throw new ContractError("QUALITY_ARCHITECTURE_POLICY_INVALID", "configured architecture policy is invalid or unreadable");
  }
  if (!sameArchitectureConfiguration(current.configuration, state.architecture_configuration)) {
    throw new ContractError("QUALITY_ARCHITECTURE_POLICY_DRIFT", "configured architecture policy changed during the quality session");
  }
  return current;
}

function architectureAssessment(evaluation) {
  return {
    policy_id: evaluation.policy_id,
    status: evaluation.status,
    evaluation_id: evaluation.evaluation_id,
    violation_ids: evaluation.violations.map((entry) => entry.violation_id),
    notes: null,
  };
}

function createChallengeEvidence(internals, state, finalized, evaluatedAt) {
  const baselineReceipts = [];
  const obligations = new Map(finalized.test_obligations.map((entry) => [entry.check_id, entry]));
  for (const checkId of finalized.verification_plan.baseline_check_ids) {
    const catalogEntry = internals.catalog.checks.find((entry) => entry.check_id === checkId);
    const obligation = obligations.get(checkId);
    const result = internals.runTrustedTarget({
      kind: "check",
      targetId: checkId,
      phase: "preimplementation",
      dossier: finalized,
      workspaceRoot: internals.workspaceRoot,
    });
    const commandId = result.command_id ?? `unavailable:${checkId}`;
    baselineReceipts.push({
      receipt_id: internals.idFactory("baseline"),
      check_id: checkId,
      trusted_producer: catalogEntry?.trusted_producer ?? NORMAL_SESSION_BRIDGE_PRODUCER,
      phase: "preimplementation",
      status: result.status === "passed" && obligation?.command_or_mechanism === commandId ? "passed" : result.status === "failed" ? "failed" : "blocked",
      command_or_mechanism: commandId,
      evidence_fingerprint: fingerprint({ check_id: checkId, command_id: commandId, status: result.status, exit_code: result.exit_code ?? null, workspace: state.last_workspace.fingerprint }),
      completed_at: evaluatedAt,
    });
  }
  const planChallengeReceipts = [];
  for (const [role, mechanismId] of [["architect", "normal-architect-challenge"], ["reviewer", "normal-reviewer-challenge"]]) {
    const contribution = contributionFor(state, role);
    if (!contribution) continue;
    planChallengeReceipts.push({
      receipt_id: internals.idFactory("challenge"),
      result_id: contribution.result_id,
      role,
      mechanism_id: mechanismId,
      trusted_producer: NORMAL_SESSION_BRIDGE_PRODUCER,
      phase: "preimplementation",
      status: contribution.blocking ? "blocked" : "passed",
      evidence_fingerprint: contribution.fingerprint,
      completed_at: contribution.completed_at,
    });
  }
  if (baselineReceipts.length === 0 && planChallengeReceipts.length === 0) return null;
  return createEngineeringPreimplementationEvidence({
    evidence_id: internals.idFactory("preimplementation"),
    dossier_id: finalized.dossier_id,
    dossier_fingerprint: finalized.fingerprint,
    baseline_receipts: baselineReceipts,
    plan_challenge_receipts: planChallengeReceipts,
  });
}

function createInitialState(internals, rawSessionId, request) {
  const key = sessionKey(rawSessionId);
  const workspaceSalt = sha256(internals.idFactory("workspace-salt"));
  const preliminary = internals.observeWorkspace(internals.workspaceRoot, workspaceSalt);
  validateWorkspaceSnapshot(preliminary, "normal-session preliminary workspace");
  rejectRunnerFields(request, RUNNER_FIELDS, "quality dossier create request");
  const now = internals.clock();
  const runId = internals.idFactory("run");
  const taskId = internals.idFactory("task");
  const dossier = createEngineeringDossierDraft({
    ...request,
    dossier_id: internals.idFactory("dossier"),
    run_id: runId,
    task_id: taskId,
    starting_commit: preliminary.head_sha,
    created_at: now,
  });
  const ownership = dossier.verification_boundary.ownership_paths.map((entry, index) => (
    normalizeOwnedPath(entry, internals.workspaceRoot, `quality dossier ownership_paths[${index}]`)
  ));
  if (new Set(ownership).size !== ownership.length) {
    throw new ContractError("QUALITY_OWNERSHIP_DUPLICATE", "quality dossier ownership paths must be unique");
  }
  const initial = internals.observeWorkspace(internals.workspaceRoot, workspaceSalt, [
    ...ownership,
    internals.architectureConfiguration.path,
  ]);
  validateWorkspaceSnapshot(initial, "normal-session initial workspace");
  if (initial.head_sha !== preliminary.head_sha) {
    throw new ContractError("QUALITY_WORKSPACE_UNTRACED", "workspace HEAD changed while the quality session was being created");
  }
  return {
    schema_version: NORMAL_SESSION_BRIDGE_SCHEMA_VERSION,
    record_kind: OWNER_RECORD_KIND,
    state_revision: 0,
    session_key: key,
    worktree_fingerprint: internals.worktreeFingerprint,
    workspace_salt: workspaceSalt,
    run_id: runId,
    task_id: taskId,
    lifecycle: "dossier_draft",
    initial_workspace: initial,
    last_workspace: initial,
    dossier,
    gate: null,
    preimplementation_evidence: null,
    architecture_configuration: deepFrozenClone(internals.architectureConfiguration, "normal-session architecture configuration"),
    architecture_evaluation: null,
    contributions: [],
    capabilities: [],
    observed_calls: [],
    pending_mutations: [],
    active_task_launch: null,
    mutation_revision: 0,
    verification: null,
    attestation: null,
    incomplete_reasons: [],
  };
}

function assertQualityToolRole(toolId, agent) {
  const orchestrators = new Set(["orchestrator", "orchestrator-deep"]);
  if (["quality_dossier_create", "quality_dossier_update", "quality_dossier_finalize", "quality_action_authorize", "quality_session_finalize"].includes(toolId)
    && !orchestrators.has(agent)) {
    throw new ContractError("QUALITY_TOOL_ROLE", `${toolId} requires an orchestrator identity`);
  }
  if (toolId === "quality_architecture_evaluate" && !["architect", "reviewer"].includes(agent)) {
    throw new ContractError("QUALITY_CONTRIBUTOR_ROLE", "only architect or reviewer may record plan-challenge evidence");
  }
  if (toolId === "quality_verification_record" && agent !== "verifier") {
    throw new ContractError("QUALITY_VERIFIER_ROLE", "only verifier may request trusted verification");
  }
}

function executeOperation(internals, toolId, request, context) {
  const sessionId = context.sessionID;
  assertQualityToolRole(toolId, context.agent);
  if (toolId === "quality_dossier_create") {
    if (readState(internals, sessionId, { required: false }) !== null) {
      throw new ContractError("QUALITY_DOSSIER_RECORD_CONFLICT", "quality session already has durable state");
    }
    const state = createInitialState(internals, sessionId, request);
    writeState(internals, state, { createOnly: true });
    return inspectReceipt(state, internals.catalog);
  }
  const resolved = resolveOwnerRecord(internals, sessionId);
  if (resolved.link !== null && resolved.link.authorized_agent !== context.agent) {
    throw new ContractError("QUALITY_CHILD_ROLE_MISMATCH", "child quality tool identity does not match its bound task role");
  }
  if (resolved.link?.authorized_agent === "general" && toolId !== "quality_dossier_inspect") {
    throw new ContractError("QUALITY_CHILD_ROLE_MISMATCH", "writable implementation children cannot mutate quality control state");
  }
  if (toolId === "quality_dossier_inspect") {
    exact(request, [], [], "quality dossier inspect request");
    return inspectReceipt(resolved.owner, internals.catalog);
  }
  if (toolId === "quality_dossier_update") {
    exact(request, ["expected_revision", "patch"], ["expected_revision", "patch"], "quality dossier update request");
    assertPlain(request.patch, "quality dossier update request.patch");
    rejectRunnerFields(request.patch, PATCH_RUNNER_FIELDS, "quality dossier update request.patch");
    return mutateOwnerState(internals, sessionId, (state) => {
      if (state.lifecycle !== "dossier_draft") throw new ContractError("QUALITY_DOSSIER_FINALIZED", "quality dossier is not editable");
      if (request.patch.verification_boundary) {
        const proposed = request.patch.verification_boundary.ownership_paths ?? state.dossier.verification_boundary.ownership_paths;
        const current = state.dossier.verification_boundary.ownership_paths;
        if (!exactSameStrings([...proposed].sort(), [...current].sort())) {
          throw new ContractError("QUALITY_OWNERSHIP_IMMUTABLE", "dossier ownership cannot change after session creation");
        }
      }
      state.dossier = updateEngineeringDossierDraft(state.dossier, {
        expected_revision: request.expected_revision,
        updated_at: internals.clock(),
        patch: {
          ...request.patch,
          plan_challenge: {
            architect_result_id: null,
            reviewer_result_id: null,
            blockers: [],
            evidence_refs: [],
          },
        },
      });
      state.contributions = [];
      state.verification = null;
      return inspectReceipt(state, internals.catalog);
    });
  }
  if (toolId === "quality_architecture_evaluate") {
    exact(request, ["expected_revision", "blockers"], ["expected_revision", "blockers"], "quality architecture contribution request");
    assertArray(request.blockers, "quality architecture contribution request.blockers", { max: 32 });
    const blockers = request.blockers.map((entry, index) => {
      exact(entry, ["severity", "summary", "resolved"], ["severity", "summary", "resolved"], `quality blocker[${index}]`);
      if (!["high", "medium", "low"].includes(entry.severity) || typeof entry.resolved !== "boolean") {
        throw new ContractError("QUALITY_PLAN_CHALLENGE", `quality blocker[${index}] is invalid`);
      }
      assertString(entry.summary, `quality blocker[${index}].summary`, { maxBytes: 2000 });
      return {
        id: internals.idFactory("blocker"),
        severity: entry.severity,
        status: entry.resolved ? "resolved" : "unresolved",
        summary: entry.summary,
        evidence_refs: [],
      };
    });
    return mutateOwnerState(internals, sessionId, (state) => {
      if (state.lifecycle !== "dossier_draft" || state.dossier.revision !== request.expected_revision) {
        throw new ContractError("QUALITY_DOSSIER_REVISION_CONFLICT", "plan challenge expected_revision is stale");
      }
      if (contributionFor(state, context.agent)) {
        throw new ContractError("QUALITY_PLAN_CHALLENGE_DUPLICATE", `${context.agent} contribution already exists`);
      }
      const resultId = internals.idFactory(`${context.agent}-result`);
      const completedAt = internals.clock();
      const contributionSource = {
        role: context.agent,
        result_id: resultId,
        subject_fingerprint: challengeSubjectFingerprint(state.dossier),
        blocking: blockers.some((entry) => ["high", "medium"].includes(entry.severity) && entry.status === "unresolved"),
        completed_at: completedAt,
      };
      const contribution = { ...contributionSource, fingerprint: fingerprint(contributionSource) };
      state.contributions.push(contribution);
      const current = state.dossier.plan_challenge;
      const planChallenge = {
        architect_result_id: context.agent === "architect" ? resultId : current.architect_result_id,
        reviewer_result_id: context.agent === "reviewer" ? resultId : current.reviewer_result_id,
        blockers: [...current.blockers, ...blockers],
        evidence_refs: [...current.evidence_refs],
      };
      state.dossier = updateEngineeringDossierDraft(state.dossier, {
        expected_revision: request.expected_revision,
        updated_at: completedAt,
        patch: { plan_challenge: planChallenge },
      });
      return { result_id: resultId, role: context.agent, dossier_revision: state.dossier.revision, blocking: contribution.blocking };
    });
  }
  if (toolId === "quality_dossier_finalize") {
    exact(request, ["expected_revision"], ["expected_revision"], "quality dossier finalization request");
    return mutateOwnerState(internals, sessionId, (state) => {
      if (state.lifecycle !== "dossier_draft" || state.dossier.revision !== request.expected_revision) {
        throw new ContractError("QUALITY_DOSSIER_REVISION_CONFLICT", "dossier finalization expected_revision is stale");
      }
      if (state.active_task_launch !== null || state.pending_mutations.length > 0) {
        throw new ContractError("QUALITY_SESSION_INCOMPLETE", "dossier finalization requires all delegated work to be reconciled");
      }
      stateWorkspaceMatches(internals, state);
      if (["high", "critical"].includes(state.dossier.risk_class)
        && (!contributionFor(state, "architect") || !contributionFor(state, "reviewer"))) {
        throw new ContractError("QUALITY_PLAN_CHALLENGE_MISSING", "high and critical dossiers require architect and reviewer contributions");
      }
      const subjectFingerprint = challengeSubjectFingerprint(state.dossier);
      if (state.contributions.some((entry) => entry.subject_fingerprint !== subjectFingerprint)) {
        throw new ContractError("QUALITY_PLAN_CHALLENGE_STALE", "architect or reviewer evidence does not bind the current dossier plan");
      }
      const currentArchitecture = assertCurrentArchitectureConfiguration(internals, state);
      const finalizedAt = internals.clock();
      let architectureEvaluation = null;
      let evaluatedDraft = state.dossier;
      if (currentArchitecture.policy !== null) {
        if (state.dossier.impact_graph === null) {
          throw new ContractError("QUALITY_ARCHITECTURE_GRAPH_MISSING", "configured architecture policy requires an impact graph");
        }
        architectureEvaluation = internals.evaluateArchitecture({
          graph: state.dossier.impact_graph,
          policy: currentArchitecture.policy,
          baseline: null,
        });
        validateArchitectureEvaluation(architectureEvaluation);
        evaluatedDraft = updateEngineeringDossierDraft(state.dossier, {
          expected_revision: state.dossier.revision,
          updated_at: finalizedAt,
          patch: { architecture_assessment: architectureAssessment(architectureEvaluation) },
        });
      }
      const finalized = finalizeEngineeringDossier(evaluatedDraft, { finalized_at: finalizedAt });
      const evidence = createChallengeEvidence(internals, state, finalized, finalizedAt);
      const gate = internals.evaluateGate({
        gate_id: internals.idFactory("gate"),
        dossier: finalized,
        check_catalog: internals.catalog,
        preimplementation_evidence: evidence,
        architecture_evaluation: architectureEvaluation,
        evaluated_at: finalizedAt,
      });
      validateEngineeringGateDecision(gate);
      state.dossier = finalized;
      state.gate = gate;
      state.preimplementation_evidence = evidence;
      state.architecture_evaluation = architectureEvaluation;
      state.lifecycle = gate.status === "passed" ? "implementation_enabled" : "gate_blocked";
      state.capabilities = [];
      state.verification = null;
      return inspectReceipt(state, internals.catalog);
    });
  }
  if (toolId === "quality_action_authorize") {
    exact(request, ["expected_revision", "kind", "paths", "target_agent"], ["expected_revision", "kind", "paths"], "quality action authorization request");
    if (!['edit', 'task'].includes(request.kind)) throw new ContractError("QUALITY_ACTION_KIND", "quality action kind must be edit or task");
    if (request.kind === "task" && request.target_agent !== "general") {
      throw new ContractError("QUALITY_ACTION_KIND", "only the general implementation worker is writable");
    }
    if (request.kind === "edit" && Object.hasOwn(request, "target_agent")) {
      throw new ContractError("QUALITY_ACTION_KIND", "edit authorization cannot name a target agent");
    }
    const paths = normalizePathSet(request.paths, internals.workspaceRoot, "quality action authorization paths");
    return mutateOwnerState(internals, sessionId, (state) => {
      if (state.lifecycle !== "implementation_enabled" || state.gate?.status !== "passed") {
        throw new ContractError("QUALITY_PRE_GATE_VIOLATION", "mutation authorization requires a runner-owned passed gate");
      }
      if (state.dossier.revision !== request.expected_revision) {
        throw new ContractError("QUALITY_DOSSIER_REVISION_CONFLICT", "action authorization expected_revision is stale");
      }
      if (state.pending_mutations.length > 0 || state.active_task_launch !== null || state.incomplete_reasons.length > 0) {
        throw new ContractError("QUALITY_SESSION_INCOMPLETE", "quality session has unresolved mutation or runtime evidence");
      }
      stateWorkspaceMatches(internals, state);
      const ownership = state.dossier.verification_boundary.ownership_paths;
      for (const file of paths) {
        if (!withinOwnership(file, ownership)) {
          throw new ContractError("QUALITY_WRITE_SCOPE_VIOLATION", `action exceeds dossier ownership: ${file}`);
        }
        if (state.architecture_configuration.status === "configured" && file === state.architecture_configuration.path) {
          throw new ContractError("QUALITY_ARCHITECTURE_POLICY_IMMUTABLE", "the configured architecture policy cannot change during its bound quality session");
        }
      }
      state.capabilities = state.capabilities.filter((entry) => entry.consumed !== true);
      const capabilitySource = {
        capability_id: internals.idFactory("capability"),
        kind: request.kind,
        target_agent: request.target_agent ?? null,
        paths: [...paths],
        dossier_revision: state.dossier.revision,
        gate_fingerprint: state.gate.fingerprint,
        mutation_revision: state.mutation_revision,
        consumed: false,
        bound_call_id: null,
      };
      const capability = { ...capabilitySource, fingerprint: fingerprint(capabilitySource) };
      state.capabilities.push(capability);
      return deepFrozenClone(capability, "quality action capability");
    });
  }
  if (toolId === "quality_verification_record") {
    exact(request, ["expected_revision"], ["expected_revision"], "quality verification request");
    return mutateOwnerState(internals, sessionId, (state, link) => {
      if (state.lifecycle !== "implementation_enabled" || state.gate?.status !== "passed") {
        throw new ContractError("QUALITY_PRE_GATE_VIOLATION", "trusted verification requires a passed gate");
      }
      const activeVerifierChild = link?.authorized_agent === "verifier"
        && state.active_task_launch?.target_agent === "verifier"
        && state.active_task_launch?.child_session_key === link.session_key;
      if (state.dossier.revision !== request.expected_revision || state.pending_mutations.length > 0
        || state.incomplete_reasons.length > 0 || (state.active_task_launch !== null && !activeVerifierChild)) {
        throw new ContractError("QUALITY_SESSION_INCOMPLETE", "trusted verification requires the current dossier and no pending mutation");
      }
      state.capabilities = state.capabilities.filter((entry) => entry.consumed);
      let workspace = stateWorkspaceMatches(internals, state);
      assertCurrentArchitectureConfiguration(internals, state);
      const targets = requiredEngineeringVerificationTargets(state.dossier);
      const receipts = [];
      for (const targetId of targets.checkIds) {
        const result = internals.runTrustedTarget({ kind: "check", targetId, phase: "integration", dossier: state.dossier, workspaceRoot: internals.workspaceRoot });
        receipts.push({ kind: "check", target_id: targetId, status: result.status, command_id: result.command_id ?? null, exit_code: result.exit_code ?? null });
      }
      for (const targetId of targets.mechanismIds) {
        let status = "blocked";
        if (targetId === "normal-architect-challenge") status = contributionFor(state, "architect")?.blocking ? "blocked" : contributionFor(state, "architect") ? "passed" : "blocked";
        else if (targetId === "normal-reviewer-challenge") status = contributionFor(state, "reviewer")?.blocking ? "blocked" : contributionFor(state, "reviewer") ? "passed" : "blocked";
        else status = internals.runTrustedTarget({ kind: "mechanism", targetId, phase: "integration", dossier: state.dossier, workspaceRoot: internals.workspaceRoot }).status;
        receipts.push({ kind: "mechanism", target_id: targetId, status, command_id: null, exit_code: null });
      }
      assertCurrentArchitectureConfiguration(internals, state);
      workspace = stateWorkspaceMatches(internals, state);
      const complete = receipts.length === targets.checkIds.length + targets.mechanismIds.length
        && receipts.every((entry) => entry.status === "passed");
      const completedAt = internals.clock();
      const source = {
        verification_id: internals.idFactory("verification"),
        dossier_revision: state.dossier.revision,
        gate_fingerprint: state.gate.fingerprint,
        mutation_revision: state.mutation_revision,
        workspace_fingerprint: workspace.fingerprint,
        target_check_ids: [...targets.checkIds],
        target_mechanism_ids: [...targets.mechanismIds],
        receipts,
        complete,
        completed_at: completedAt,
      };
      state.verification = { ...source, fingerprint: fingerprint(source) };
      return deepFrozenClone(state.verification, "normal-session trusted verification receipt");
    });
  }
  if (toolId === "quality_session_finalize") {
    exact(request, ["expected_revision"], ["expected_revision"], "quality session finalization request");
    return mutateOwnerState(internals, sessionId, (state) => {
      if (state.dossier?.revision !== request.expected_revision || state.gate?.status !== "passed") {
        throw new ContractError("QUALITY_SESSION_FINALIZE", "quality session finalization requires the current passed gate");
      }
      if (state.pending_mutations.length > 0 || state.active_task_launch !== null || state.incomplete_reasons.length > 0
        || state.capabilities.some((entry) => !entry.consumed) || state.verification?.complete !== true) {
        throw new ContractError("QUALITY_SESSION_INCOMPLETE", "quality session has incomplete mandatory verification or mutation evidence");
      }
      let workspace = stateWorkspaceMatches(internals, state);
      assertCurrentArchitectureConfiguration(internals, state);
      workspace = stateWorkspaceMatches(internals, state);
      if (state.verification.workspace_fingerprint !== workspace.fingerprint
        || state.verification.mutation_revision !== state.mutation_revision) {
        throw new ContractError("QUALITY_VERIFICATION_STALE", "trusted verification does not bind the final workspace");
      }
      const attestedAt = internals.clock();
      const source = {
        schema_version: 1,
        run_id: state.run_id,
        task_id: state.task_id,
        dossier_id: state.dossier.dossier_id,
        dossier_fingerprint: state.dossier.fingerprint,
        gate_fingerprint: state.gate.fingerprint,
        verification_fingerprint: state.verification.fingerprint,
        final_workspace_fingerprint: workspace.fingerprint,
        mutation_revision: state.mutation_revision,
        attested_at: attestedAt,
      };
      state.attestation = { ...source, fingerprint: fingerprint(source) };
      state.lifecycle = "attested";
      return deepFrozenClone(state.attestation, "normal-session quality attestation");
    });
  }
  throw new ContractError("QUALITY_TOOL_UNKNOWN", `unknown quality tool ID: ${toolId}`);
}

function refreshBoundFingerprint(value) {
  const source = { ...value };
  delete source.fingerprint;
  value.fingerprint = fingerprint(source);
  return value;
}

function parseApplyPatchPaths(patchText, internals) {
  assertString(patchText, "apply_patch.patchText", { maxBytes: 1_000_000 });
  const paths = [];
  for (const line of patchText.replaceAll("\r\n", "\n").split("\n")) {
    const operation = line.match(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/u);
    const move = line.match(/^\*\*\* Move to: (.+)$/u);
    if (operation) paths.push(operation[1]);
    if (move) paths.push(move[1]);
  }
  if (paths.length === 0) throw new ContractError("QUALITY_NATIVE_TOOL_ARGS", "apply_patch contains no bounded file paths");
  return Object.freeze([...new Set(paths.map((entry, index) => normalizeOwnedPath(entry, internals.workspaceRoot, `apply_patch path[${index}]`)))].sort());
}

function parseNativeToolIntent(input, output, internals) {
  if (!output || typeof output !== "object") throw new ContractError("QUALITY_NATIVE_TOOL_ARGS", "tool.execute.before output is missing");
  assertPlain(output.args, `${input.tool} arguments`);
  if (input.tool === "edit") {
    exact(output.args, ["filePath", "oldString", "newString", "replaceAll"], ["filePath", "oldString", "newString"], "native edit arguments");
    return { paths: [normalizeOwnedPath(output.args.filePath, internals.workspaceRoot, "native edit filePath", { allowNativeSeparators: true })], targetAgent: null };
  }
  if (input.tool === "write") {
    exact(output.args, ["filePath", "content"], ["filePath", "content"], "native write arguments");
    return { paths: [normalizeOwnedPath(output.args.filePath, internals.workspaceRoot, "native write filePath", { allowNativeSeparators: true })], targetAgent: null };
  }
  if (input.tool === "apply_patch") {
    exact(output.args, ["patchText"], ["patchText"], "native apply_patch arguments");
    return { paths: parseApplyPatchPaths(output.args.patchText, internals), targetAgent: null };
  }
  if (input.tool === "task") {
    exact(output.args, ["description", "prompt", "subagent_type", "task_id", "command", "background"], ["description", "prompt", "subagent_type"], "native task arguments");
    assertString(output.args.subagent_type, "native task subagent_type", { maxBytes: 128 });
    if (Object.hasOwn(output.args, "task_id") && output.args.task_id !== undefined) assertString(output.args.task_id, "native task task_id", { maxBytes: 1000 });
    if (output.args.background === true) throw new ContractError("QUALITY_TASK_BACKGROUND_UNSUPPORTED", "quality-bound tasks must run in the foreground");
    return { paths: [], targetAgent: output.args.subagent_type, resumeSessionId: output.args.task_id ?? null };
  }
  throw new ContractError("QUALITY_NATIVE_TOOL_UNSUPPORTED", `unsupported native tool: ${input.tool}`);
}

function recordObservedCall(state, { callId, sessionKey: callSessionKey, toolId, paths, targetAgent }) {
  if (state.observed_calls.some((entry) => entry.call_id === callId && entry.session_key === callSessionKey)) {
    throw new ContractError("QUALITY_CALL_REPLAY", "native tool call ID was replayed");
  }
  const source = { call_id: callId, session_key: callSessionKey, tool_id: toolId, paths: [...paths], target_agent: targetAgent };
  state.observed_calls.push({ ...source, fingerprint: fingerprint(source) });
  pruneObservedCalls(state);
}

function observedCallIsReferenced(state, observed) {
  const capabilityReference = state.capabilities.some((entry) => entry.consumed
    && entry.bound_call_id === observed.call_id
    && observed.session_key === state.session_key
    && (entry.kind === "task" ? observed.tool_id === "task" : ["edit", "write", "apply_patch"].includes(observed.tool_id)));
  return capabilityReference
    || state.pending_mutations.some((entry) => entry.call_id === observed.call_id
      && entry.session_key === observed.session_key && entry.tool_id === observed.tool_id)
    || (state.active_task_launch?.parent_call_id === observed.call_id
      && observed.session_key === state.session_key && observed.tool_id === "task");
}

function pruneObservedCalls(state) {
  const referenced = state.observed_calls.filter((entry) => observedCallIsReferenced(state, entry));
  if (referenced.length > MAX_OBSERVED_CALLS) {
    throw new ContractError("QUALITY_STATE_LIMIT", "normal-session state has too many referenced native calls");
  }
  const unreferenced = state.observed_calls.filter((entry) => !observedCallIsReferenced(state, entry));
  const replayBudget = MAX_OBSERVED_CALLS - referenced.length;
  const replayHistory = replayBudget === 0 ? [] : unreferenced.slice(-replayBudget);
  const retained = new Set([...referenced, ...replayHistory]);
  state.observed_calls = state.observed_calls.filter((entry) => retained.has(entry));
}

function settleCapabilityForCall(state, kind, callId, callSessionKey) {
  if (callSessionKey !== state.session_key) return;
  state.capabilities = state.capabilities.filter((entry) => entry.kind !== kind || entry.bound_call_id !== callId);
}

function consumeCapability(internals, state, { kind, targetAgent = null, paths, callId, callSessionKey, toolId }) {
  if (callSessionKey !== state.session_key) {
    throw new ContractError("QUALITY_STATE_BINDING", "one-shot capabilities can bind only owner-session native calls");
  }
  const capability = state.capabilities.find((entry) => (
    entry.consumed === false
    && entry.kind === kind
    && entry.target_agent === targetAgent
    && entry.dossier_revision === state.dossier.revision
    && entry.gate_fingerprint === state.gate.fingerprint
    && entry.mutation_revision === state.mutation_revision
    && exactSameStrings(entry.paths, paths)
  ));
  if (!capability) throw new ContractError("QUALITY_CAPABILITY_MISSING", "no exact one-shot quality capability matches the mutation");
  capability.consumed = true;
  capability.bound_call_id = callId;
  refreshBoundFingerprint(capability);
  if (kind === "task") return capability;
  const beforeWorkspace = observeStateWorkspace(internals, state, paths);
  const pendingSource = {
    call_id: callId,
    session_key: callSessionKey,
    tool_id: toolId,
    expected_paths: [...paths],
    before_workspace: beforeWorkspace,
    started_at: internals.clock(),
  };
  state.pending_mutations.push({ ...pendingSource, fingerprint: fingerprint(pendingSource) });
  state.verification = null;
  state.attestation = null;
  return capability;
}

export function createNormalSessionQualityBridge(options) {
  assertPlain(options, "normal-session quality bridge options");
  const workspaceRoot = fs.realpathSync(path.resolve(options.workspaceRoot));
  const harnessRoot = resolveHarnessRoot(workspaceRoot);
  const qualityRoot = resolveInside(harnessRoot, "quality");
  const sessionRoot = resolveInside(qualityRoot, "sessions");
  ensureConfinedDirectory(harnessRoot, sessionRoot);
  const catalog = options.checkCatalog ?? createDefaultNormalSessionCheckCatalog();
  validateEngineeringCheckCatalog(catalog);
  const worktreeFingerprint = sha256(workspaceRoot.toLowerCase());
  const loadedArchitecture = loadArchitecturePolicy(workspaceRoot);
  const internals = {
    workspaceRoot,
    harnessRoot,
    qualityRoot,
    sessionRoot,
    worktreeFingerprint,
    architectureConfiguration: loadedArchitecture.configuration,
    architecturePolicy: loadedArchitecture.policy,
    catalog,
    observeWorkspace: options.observeWorkspace ?? observeNormalSessionWorkspace,
    runTrustedTarget: options.runTrustedTarget ?? defaultTrustedRunner,
    evaluateGate: options.evaluateGate ?? evaluateEngineeringGate,
    evaluateArchitecture: options.evaluateArchitecture ?? evaluateArchitecturePolicy,
    clock: options.clock ?? (() => new Date().toISOString()),
    idFactory: options.idFactory ?? safeToken,
    lockStaleMs: options.lockStaleMs ?? 5 * 60_000,
  };
  const bridge = Object.freeze({ tool_ids: NORMAL_SESSION_QUALITY_TOOL_IDS });
  BRIDGE_INTERNALS.set(bridge, internals);
  return bridge;
}

export function executeNormalSessionQualityTool(bridge, toolId, args, context) {
  const internals = bridgeState(bridge);
  if (!NORMAL_SESSION_QUALITY_TOOL_IDS.includes(toolId)) throw new ContractError("QUALITY_TOOL_UNKNOWN", `unknown quality tool ID: ${toolId}`);
  exact(args, ["request"], ["request"], `${toolId} arguments`);
  if (!context || typeof context.sessionID !== "string" || typeof context.agent !== "string") {
    throw new ContractError("QUALITY_TOOL_CONTEXT", `${toolId} requires runner-provided session and agent identity`);
  }
  const request = parseRequest(args.request, `${toolId} request`);
  return executeOperation(internals, toolId, request, context);
}

function addIncompleteReason(state, reason) {
  if (!state.incomplete_reasons.includes(reason)) state.incomplete_reasons.push(reason);
}

function assertMutationScope(state, paths, delegatedPaths = null) {
  const ownership = state.dossier.verification_boundary.ownership_paths;
  for (const file of paths) {
    if (!withinOwnership(file, ownership) || (delegatedPaths !== null && !withinOwnership(file, delegatedPaths))) {
      throw new ContractError("QUALITY_WRITE_SCOPE_VIOLATION", `native mutation exceeds its exact quality scope: ${file}`);
    }
    if (state.architecture_configuration.status === "configured" && file === state.architecture_configuration.path) {
      throw new ContractError("QUALITY_ARCHITECTURE_POLICY_IMMUTABLE", "the configured architecture policy cannot change during its bound quality session");
    }
  }
}

function createTaskLaunch(internals, state, input, intent, capability) {
  const beforeWorkspace = observeStateWorkspace(internals, state, capability?.paths ?? []);
  const source = {
    launch_id: internals.idFactory("task-launch"),
    parent_call_id: input.callID,
    kind: intent.targetAgent === "general" ? "writable" : "read_only",
    target_agent: intent.targetAgent,
    capability_id: capability?.capability_id ?? null,
    delegated_paths: capability ? [...capability.paths] : [],
    phase: "awaiting_child",
    child_session_key: null,
    before_workspace: beforeWorkspace,
    started_at: internals.clock(),
  };
  return { ...source, fingerprint: fingerprint(source) };
}

function createPendingMutation(internals, state, { input, callSessionKey, paths }) {
  const beforeWorkspace = observeStateWorkspace(internals, state, paths);
  const source = {
    call_id: input.callID,
    session_key: callSessionKey,
    tool_id: input.tool,
    expected_paths: [...paths],
    before_workspace: beforeWorkspace,
    started_at: internals.clock(),
  };
  state.pending_mutations.push({ ...source, fingerprint: fingerprint(source) });
  state.verification = null;
  state.attestation = null;
}

export function handleNormalSessionToolBefore(bridge, input, output) {
  const internals = bridgeState(bridge);
  if (!NATIVE_MUTATION_TOOLS.has(input?.tool)) return;
  if (typeof input.sessionID !== "string" || typeof input.callID !== "string") {
    throw new ContractError("QUALITY_NATIVE_TOOL_CONTEXT", "native mutation hook lacks session or call identity");
  }
  const intent = parseNativeToolIntent(input, output, internals);
  const resolved = resolveOwnerRecord(internals, input.sessionID, { required: false });
  if (resolved === null) return;
  const callSessionKey = sessionKey(input.sessionID);
  if (resolved.link !== null) {
    if (input.tool === "task") throw new ContractError("QUALITY_CHILD_DELEGATION_DENIED", "quality-bound child sessions cannot delegate further tasks");
    if (!resolved.link.writable || resolved.link.authorized_agent !== "general") {
      throw new ContractError("QUALITY_READ_ONLY_MUTATION", "read-only quality child cannot mutate the worktree");
    }
    return mutateStateByKey(internals, resolved.ownerKey, (state) => {
      const launch = state.active_task_launch;
      if (!launch || launch.phase !== "child_active" || launch.child_session_key !== callSessionKey || launch.kind !== "writable") {
        throw new ContractError("QUALITY_CHILD_LINK_STALE", "writable child is not bound to the active task launch");
      }
      if (state.lifecycle !== "implementation_enabled" || state.gate?.status !== "passed" || state.incomplete_reasons.length > 0 || state.pending_mutations.length > 0) {
        throw new ContractError("QUALITY_PRE_GATE_VIOLATION", "child mutation requires a complete passed quality gate");
      }
      stateWorkspaceMatches(internals, state);
      assertMutationScope(state, intent.paths, launch.delegated_paths);
      recordObservedCall(state, { callId: input.callID, sessionKey: callSessionKey, toolId: input.tool, paths: intent.paths, targetAgent: null });
      createPendingMutation(internals, state, { input, callSessionKey, paths: intent.paths });
    });
  }
  return mutateStateByKey(internals, resolved.ownerKey, (state) => {
    if (input.tool === "task") {
      if (state.active_task_launch !== null || state.pending_mutations.length > 0) {
        throw new ContractError("QUALITY_TASK_SERIALIZATION", "quality-bound task launches are serialized");
      }
      if (intent.resumeSessionId !== null) {
        throw new ContractError("QUALITY_TASK_RESUME_UNSUPPORTED", "quality-bound task resume lacks causal host correlation");
      }
      if (!READ_ONLY_TASKS.has(intent.targetAgent) && intent.targetAgent !== "general") {
        throw new ContractError("QUALITY_TASK_TARGET", `unsupported quality-bound task target: ${intent.targetAgent}`);
      }
      stateWorkspaceMatches(internals, state);
      let capability = null;
      if (intent.targetAgent === "general") {
        if (state.lifecycle !== "implementation_enabled" || state.gate?.status !== "passed" || state.incomplete_reasons.length > 0) {
          throw new ContractError("QUALITY_PRE_GATE_VIOLATION", "writable delegation requires a complete passed quality gate");
        }
        capability = consumeCapability(internals, state, {
          kind: "task",
          targetAgent: "general",
          paths: state.capabilities.find((entry) => entry.kind === "task" && entry.target_agent === "general" && entry.consumed === false)?.paths ?? [],
          callId: input.callID,
          callSessionKey,
          toolId: input.tool,
        });
      }
      recordObservedCall(state, { callId: input.callID, sessionKey: callSessionKey, toolId: input.tool, paths: capability?.paths ?? [], targetAgent: intent.targetAgent });
      state.active_task_launch = createTaskLaunch(internals, state, input, intent, capability);
      state.verification = null;
      state.attestation = null;
      return;
    }
    if (state.lifecycle !== "implementation_enabled" || state.gate?.status !== "passed" || state.incomplete_reasons.length > 0
      || state.pending_mutations.length > 0 || state.active_task_launch !== null) {
      throw new ContractError("QUALITY_PRE_GATE_VIOLATION", "native mutation requires a complete passed quality gate");
    }
    stateWorkspaceMatches(internals, state);
    assertMutationScope(state, intent.paths);
    recordObservedCall(state, { callId: input.callID, sessionKey: callSessionKey, toolId: input.tool, paths: intent.paths, targetAgent: null });
    consumeCapability(internals, state, { kind: "edit", paths: intent.paths, callId: input.callID, callSessionKey, toolId: input.tool });
  });
}

function permissionPatternValues(input) {
  if (typeof input?.pattern === "string") return [input.pattern];
  if (Array.isArray(input?.pattern) && input.pattern.every((entry) => typeof entry === "string")) return input.pattern;
  return null;
}

export function handleNormalSessionPermission(bridge, input, output) {
  const internals = bridgeState(bridge);
  if (!output || !["ask", "deny", "allow"].includes(output.status)) throw new ContractError("QUALITY_PERMISSION_OUTPUT", "permission hook output is invalid");
  if (!["edit", "task"].includes(input?.type)) return;
  const originalStatus = output.status;
  output.status = "deny";
  const earlyValues = permissionPatternValues(input);
  if (input.type === "task" && earlyValues?.length === 1 && READ_ONLY_TASKS.has(earlyValues[0])
    && (typeof input.sessionID !== "string" || typeof input.callID !== "string")) {
    output.status = originalStatus;
    return;
  }
  if (typeof input.sessionID !== "string" || typeof input.callID !== "string") return;
  try {
    const resolved = resolveOwnerRecord(internals, input.sessionID, { required: false });
    const values = permissionPatternValues(input);
    if (values === null) return;
    if (resolved === null) {
      output.status = originalStatus;
      return;
    }
    const callSessionKey = sessionKey(input.sessionID);
    const observed = resolved.owner.observed_calls.find((entry) => entry.call_id === input.callID && entry.session_key === callSessionKey);
    if (!observed) return;
    if (input.type === "task") {
      if (values.length === 1 && values[0] === observed.target_agent && resolved.owner.active_task_launch?.parent_call_id === input.callID) {
        output.status = originalStatus;
      }
      return;
    }
    const paths = [...new Set(values.map((entry, index) => normalizeOwnedPath(entry, internals.workspaceRoot, `edit permission pattern[${index}]`, { allowNativeSeparators: true })))].sort();
    if (exactSameStrings(paths, observed.paths)) output.status = originalStatus;
  } catch {
    output.status = "deny";
  }
}

function reconcilePendingMutation(internals, rawSessionId, toolId, callId) {
  const callSessionKey = sessionKey(rawSessionId);
  return mutateOwnerState(internals, rawSessionId, (state) => {
    const index = state.pending_mutations.findIndex((entry) => entry.call_id === callId && entry.session_key === callSessionKey && entry.tool_id === toolId);
    if (index === -1) return null;
    const pending = state.pending_mutations[index];
    const after = observeStateWorkspace(internals, state, pending.expected_paths);
    validateWorkspaceSnapshot(after, "normal-session post-mutation workspace");
    const changed = diffContentBoundWorkspaces(pending.before_workspace, after);
    let violation = null;
    for (const file of changed) {
      const normalized = normalizeOwnedPath(file, internals.workspaceRoot, "post-mutation changed path");
      if (!withinOwnership(normalized, state.dossier.verification_boundary.ownership_paths) || !withinOwnership(normalized, pending.expected_paths)) {
        violation = `native mutation changed an unowned or unauthorized path: ${normalized}`;
        addIncompleteReason(state, "post_mutation_ownership_mismatch");
      }
    }
    state.pending_mutations.splice(index, 1);
    settleCapabilityForCall(state, "edit", callId, callSessionKey);
    if (after.fingerprint !== pending.before_workspace.fingerprint) {
      state.last_workspace = after;
      state.mutation_revision += 1;
      state.verification = null;
      state.attestation = null;
    }
    pruneObservedCalls(state);
    return violation;
  });
}

function closeChildLink(internals, childKey) {
  if (childKey === null) return;
  const child = readStateByKey(internals, childKey, { required: false });
  if (!child || child.record_kind !== CHILD_RECORD_KIND || child.status !== "active") return;
  mutateStateByKey(internals, childKey, (link) => {
    link.status = "closed";
    refreshBoundFingerprint(link);
  });
}

function reconcileTaskLaunch(internals, rawSessionId, callId, { failed = false } = {}) {
  const callSessionKey = sessionKey(rawSessionId);
  let childKey = null;
  const violation = mutateOwnerState(internals, rawSessionId, (state, link) => {
    if (link !== null) return null;
    const launch = state.active_task_launch;
    if (!launch || launch.parent_call_id !== callId) return null;
    childKey = launch.child_session_key;
    const after = observeStateWorkspace(internals, state, launch.delegated_paths);
    validateWorkspaceSnapshot(after, "normal-session post-task workspace");
    const changed = diffContentBoundWorkspaces(launch.before_workspace, after);
    let message = null;
    if (!failed && (launch.phase !== "child_active" || launch.child_session_key === null)) {
      addIncompleteReason(state, "task_child_binding_missing");
      message = "task completed without one bound child session";
    }
    if (state.pending_mutations.some((entry) => entry.session_key === launch.child_session_key)) {
      addIncompleteReason(state, "task_child_mutation_pending");
      message = "task completed with a pending child mutation";
    }
    for (const file of changed) {
      const normalized = normalizeOwnedPath(file, internals.workspaceRoot, "post-task changed path");
      const writable = launch.kind === "writable" && withinOwnership(normalized, launch.delegated_paths)
        && withinOwnership(normalized, state.dossier.verification_boundary.ownership_paths);
      if (!writable) {
        addIncompleteReason(state, launch.kind === "read_only" ? "read_only_task_mutation" : "task_ownership_mismatch");
        message = `task changed an unauthorized path: ${normalized}`;
      }
    }
    state.active_task_launch = null;
    settleCapabilityForCall(state, "task", callId, callSessionKey);
    if (after.fingerprint !== state.last_workspace.fingerprint) {
      state.last_workspace = after;
      state.mutation_revision += 1;
      state.verification = null;
      state.attestation = null;
    }
    pruneObservedCalls(state);
    return message;
  });
  closeChildLink(internals, childKey);
  return violation;
}

export function handleNormalSessionToolAfter(bridge, input) {
  const internals = bridgeState(bridge);
  if (!NATIVE_MUTATION_TOOLS.has(input?.tool) || typeof input.sessionID !== "string" || typeof input.callID !== "string") return;
  const resolved = resolveOwnerRecord(internals, input.sessionID, { required: false });
  if (resolved === null) return;
  const violation = input.tool === "task"
    ? reconcileTaskLaunch(internals, input.sessionID, input.callID, { failed: false })
    : reconcilePendingMutation(internals, input.sessionID, input.tool, input.callID);
  if (violation) throw new ContractError("QUALITY_WRITE_SCOPE_VIOLATION", violation);
}

function childLinkSource(internals, { childKey, parentKey, launch, status }) {
  const source = {
    schema_version: NORMAL_SESSION_BRIDGE_SCHEMA_VERSION,
    record_kind: CHILD_RECORD_KIND,
    state_revision: 0,
    session_key: childKey,
    parent_session_key: parentKey,
    worktree_fingerprint: internals.worktreeFingerprint,
    launch_id: launch?.launch_id ?? internals.idFactory("quarantined-child"),
    authorized_agent: launch?.target_agent ?? "explore",
    writable: launch?.kind === "writable",
    status,
    created_at: internals.clock(),
  };
  return { ...source, fingerprint: fingerprint(source) };
}

function handleSessionCreated(internals, info) {
  const parent = readState(internals, info.parentID, { required: false });
  if (!parent || parent.record_kind !== OWNER_RECORD_KIND) return;
  const childKey = sessionKey(info.id);
  const existing = readStateByKey(internals, childKey, { required: false });
  if (existing) {
    if (existing.record_kind === CHILD_RECORD_KIND && existing.parent_session_key === parent.session_key
      && parent.active_task_launch?.child_session_key === childKey) return;
    throw new ContractError("QUALITY_CHILD_RECORD_CONFLICT", "child session already has unrelated quality state");
  }
  let selectedLaunch = null;
  let childStatus = "quarantined";
  mutateStateByKey(internals, parent.session_key, (state) => {
    const launch = state.active_task_launch;
    if (!launch) return;
    if (launch.phase === "child_active" && launch.child_session_key !== childKey) {
      addIncompleteReason(state, "task_child_ambiguous");
      launch.phase = "failed";
      refreshBoundFingerprint(launch);
      selectedLaunch = JSON.parse(canonicalJson(launch));
      return;
    }
    if (launch.phase !== "awaiting_child") return;
    selectedLaunch = JSON.parse(canonicalJson(launch));
    launch.phase = "child_active";
    launch.child_session_key = childKey;
    refreshBoundFingerprint(launch);
    childStatus = "active";
  });
  const child = childLinkSource(internals, { childKey, parentKey: parent.session_key, launch: selectedLaunch, status: childStatus });
  writeState(internals, child, { createOnly: true });
}

function reconcileFailedToolPart(internals, part) {
  const state = readState(internals, part.sessionID, { required: false });
  if (!state) return;
  const violation = part.tool === "task"
    ? reconcileTaskLaunch(internals, part.sessionID, part.callID, { failed: true })
    : reconcilePendingMutation(internals, part.sessionID, part.tool, part.callID);
  if (violation) throw new ContractError("QUALITY_WRITE_SCOPE_VIOLATION", violation);
}

export function handleNormalSessionEvent(bridge, event) {
  const internals = bridgeState(bridge);
  if (event?.type === "session.created") {
    const info = event.properties?.info;
    if (info && typeof info.id === "string" && typeof info.parentID === "string") handleSessionCreated(internals, info);
    return;
  }
  if (event?.type === "message.part.updated") {
    const part = event.properties?.part;
    if (part?.type === "tool" && part.state?.status === "error" && typeof part.sessionID === "string"
      && typeof part.callID === "string" && NATIVE_MUTATION_TOOLS.has(part.tool)) {
      reconcileFailedToolPart(internals, part);
    }
  }
}

export function inspectNormalSessionQualityState(bridge, sessionId) {
  const internals = bridgeState(bridge);
  return deepFrozenClone(readState(internals, sessionId), "normal-session quality state inspection");
}

export function normalSessionQualityStatePath(bridge, sessionId) {
  const internals = bridgeState(bridge);
  return statePaths(internals, sessionKey(sessionId)).file;
}
