import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import {
  atomicWriteMutable,
  atomicWriteJson,
  ensureConfinedDirectory,
  readJson,
  resolveHarnessRoot,
  resolveInside,
  withExclusiveLock,
} from "../feedback/files.mjs";
import {
  ARCHITECTURE_EVALUATOR_IDS,
  ARCHITECTURE_EVALUATOR_IMPLEMENTATION_FINGERPRINT,
  evaluateArchitecturePolicy,
  parseArchitecturePolicy,
  validateArchitectureEvaluation,
} from "./architecture.mjs";
import { QUALITY_LIMITS } from "./constants.mjs";
import {
  createEngineeringDossierDraft,
  finalizeEngineeringDossier,
  promoteEngineeringDossierRisk,
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
  WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
  diffContentBoundWorkspaces,
  normalizeNormalSessionOwnedPath,
  observeContentBoundWorkspace,
  validateContentBoundWorkspace,
} from "./normal-session-workspace.mjs";
import {
  assertQualitySessionCatalogCurrent,
  assertQualitySessionCatalogCurrentByKey,
  createQualitySessionRegistry,
  escalateQualitySessionRiskByKey,
  inspectQualitySessionRegistration,
  recordQualityCheckBudgetByKey,
  registerQualityChatSession,
  startQualitySession,
  transitionQualitySession,
  transitionQualitySessionByKey,
} from "./session-classification.mjs";
import {
  PROJECT_CHECK_PHASES,
  loadProjectCheckCatalog,
  projectCheckCatalogFingerprint,
  projectCatalogToEngineeringCatalog,
  validateProjectCheckCatalog,
} from "./project-check-catalog.mjs";
import { validateEngineeringImpactGraph } from "./impact-graph.mjs";
import {
  loadContextStrategyCatalog,
  selectMinimumContextStrategy,
  validateContextStrategyBinding,
} from "./context-strategies.mjs";
import {
  createWholeSystemContextReportDraft,
  engineeringDossierAnalysisFingerprint,
  finalizeWholeSystemContextReport,
  updateWholeSystemContextReportDraft,
  validateWholeSystemContextReport,
} from "./whole-system-context-report.mjs";
import {
  assertContextDecisionCurrent,
  contentBackedInspectedPaths,
  createContextTaskProfileEvidence,
  createStandardLiteContextSummary,
  evaluateContextSufficiency,
  validateContextSufficiencyDecision,
  validateContextTaskProfileEvidence,
  validateStandardLiteContextSummary,
} from "./context-sufficiency.mjs";
import {
  assertContextReconciliationCurrent,
  classifyContextReconciliationPathKind,
  createReviewerReconciliationEvidence,
  reconcileFinalBlastRadius,
  validateContextReconciliation,
  validateReviewerReconciliationEvidence,
} from "./context-reconciliation.mjs";
import {
  beginContextReceiptOperation,
  completeContextReceiptOperation,
  failContextReceiptOperation,
  validateContextReceipt,
  validatePendingContextReceipt,
} from "./context-receipts.mjs";
import { createContextReceiptStore } from "./context-receipt-store.mjs";
import { CONTEXT_TOOL_IDS } from "./context-tool-adapters.mjs";
import {
  assertCurrentPlanChallengeReceipts,
  createPlanChallengeSubject,
  validatePlanChallengeSubject,
} from "./plan-challenge-subject.mjs";
import {
  createPostEditArchitectureEvidence,
  validatePostEditArchitectureEvidence,
} from "./post-architecture-evidence.mjs";
import { standardLiteDossierRequest } from "./standard-lite.mjs";
import {
  TRUSTED_PROJECT_CHECK_PRODUCER,
  TRUSTED_PROJECT_CHECK_RECEIPT_SCHEMA_VERSION,
  TRUSTED_PROJECT_CHECK_OBSERVED_OUTCOMES,
  TRUSTED_PROJECT_CHECK_STATUSES,
  runTrustedProjectCheck,
  trustedProjectCheckResult,
} from "./trusted-project-runner.mjs";
import {
  assertTrustedToolchainInvocationCurrent,
  loadTrustedToolchainMap,
  resolveTrustedToolchainInvocation,
  validateTrustedToolchainArguments,
} from "./trusted-toolchains.mjs";
import {
  TRUSTED_TOOLCHAIN_RESOLUTION_POLICY_VERSION,
  assertTrustedToolchainHostConfigurationLeaseCurrent,
  loadTrustedToolchainHostConfigurationLease,
} from "./trusted-toolchain-host-config.mjs";
import { requiredEngineeringVerificationTargets } from "./verification-targets.mjs";
import {
  ContractError,
  assertArray,
  assertFingerprint,
  assertInteger,
  assertIso,
  assertPlain,
  assertString,
  canonicalJson,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

export const NORMAL_SESSION_QUALITY_TOOL_IDS = Object.freeze([
  "quality_session_start",
  "quality_dossier_create",
  "quality_dossier_update",
  "quality_dossier_inspect",
  "quality_context_strategy_escalate",
  "quality_context_report_create",
  "quality_context_report_update",
  "quality_context_report_finalize",
  "quality_architecture_evaluate",
  "quality_dossier_finalize",
  "quality_action_authorize",
  "quality_command_authorize",
  "quality_verification_record",
  "quality_context_reviewer_record",
  "quality_context_reconcile",
  "quality_session_finalize",
]);

export const NORMAL_SESSION_BRIDGE_SCHEMA_VERSION = 5;
export const NORMAL_SESSION_BRIDGE_PRODUCER = "opencode-harness-normal-quality-runner";

const BRIDGE_INTERNALS = new WeakMap();
const NATIVE_MUTATION_TOOLS = new Set(["edit", "write", "apply_patch", "task", "bash"]);
const CONTEXT_TOOLS = new Set(CONTEXT_TOOL_IDS);
const CONTEXT_PENDING_READ_ONLY_QUALITY_TOOLS = new Set([
  "quality_dossier_inspect",
  "quality_context_report_create",
]);
const READ_ONLY_TASKS = new Set(["architect", "diagnose", "explore", "researcher", "reviewer", "verifier"]);
const MAX_OBSERVED_CALLS = 128;
const MAX_SESSION_STATE_RECORDS = 1024;
const MAX_CONTROL_STATE_ENTRIES = 4096;
const MAX_CONTROL_STATE_BYTES = 64 * 1024 * 1024;
const MAX_CONTROL_STATE_DEPTH = 32;
const CONTROL_OPERATION_LOCK = "control-operation.lock";
const ACTIVE_EXTERNAL_GUARD = "active-external.json";
const EXTERNAL_RECOVERY_GUARD = "quality-external-recovery.json";
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
  "catalog_fingerprint",
  "verification_status",
  "attestation",
  "trusted_timestamp",
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
  "project_catalog_fingerprint",
  "context_strategy",
  "standard_lite_policy",
  "reproduction_contract",
  "cumulative_affected_paths",
  "lifecycle",
  "initial_workspace",
  "last_workspace",
  "dossier",
  "context_report",
  "standard_lite_context_summary",
  "context_task_profile_evidence",
  "context_decision",
  "context_receipt_ids",
  "pending_context_calls",
  "context_read_only_subagent_ids",
  "first_mutation_at",
  "first_mutation_sequence",
  "reviewer_reconciliation_evidence",
  "context_reconciliation",
  "gate",
  "preimplementation_evidence",
  "preimplementation_check_receipts",
  "architecture_configuration",
  "architecture_evaluation",
  "post_architecture_evidence",
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

function readBoundedControlFile(target, identity, remainingBytes) {
  if (identity.size > remainingBytes) {
    throw new ContractError("QUALITY_CONTROL_STATE_LIMIT", "control state exceeds its bounded guard budget");
  }
  let descriptor;
  try {
    descriptor = fs.openSync(target, "r");
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== identity.dev || opened.ino !== identity.ino
      || opened.size > remainingBytes) {
      throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "control state file changed while it was inspected");
    }
    const bounded = Buffer.alloc(opened.size + 1);
    let bytesRead = 0;
    while (bytesRead < bounded.length) {
      const count = fs.readSync(descriptor, bounded, bytesRead, bounded.length - bytesRead, null);
      if (count === 0) break;
      bytesRead += count;
    }
    const completed = fs.fstatSync(descriptor);
    if (bytesRead > remainingBytes || bytesRead > opened.size
      || completed.dev !== opened.dev || completed.ino !== opened.ino
      || completed.size !== opened.size || completed.mtimeMs !== opened.mtimeMs) {
      throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "control state file changed while it was read");
    }
    return Buffer.from(bounded.subarray(0, bytesRead));
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function scanControlState(root, { includeContents }) {
  const directories = new Set([""]);
  const files = new Map();
  const manifest = [];
  let totalBytes = 0;
  function walk(relativeDirectory) {
    const directory = relativeDirectory === "" ? root : resolveInside(root, relativeDirectory);
    const names = fs.readdirSync(directory).sort();
    for (const name of names) {
      const relative = relativeDirectory === "" ? name : `${relativeDirectory}/${name}`;
      if (relative === CONTROL_OPERATION_LOCK) continue;
      if (relative.split("/").length > MAX_CONTROL_STATE_DEPTH || manifest.length + 1 > MAX_CONTROL_STATE_ENTRIES) {
        throw new ContractError("QUALITY_CONTROL_STATE_LIMIT", "control state exceeds its bounded guard budget");
      }
      const target = resolveInside(root, relative);
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink()) {
        manifest.push({ path: relative, kind: "symlink", bytes: 0, digest: null });
        continue;
      }
      if (stat.isDirectory()) {
        directories.add(relative);
        manifest.push({ path: relative, kind: "directory", bytes: 0, digest: null });
        walk(relative);
        continue;
      }
      if (!stat.isFile()) throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "control state contains an unsupported filesystem entry");
      const contents = readBoundedControlFile(target, stat, MAX_CONTROL_STATE_BYTES - totalBytes);
      totalBytes += contents.length;
      const digest = sha256(contents);
      manifest.push({ path: relative, kind: "file", bytes: contents.length, digest });
      if (includeContents) files.set(relative, contents);
    }
  }
  walk("");
  return { directories, files, manifest, fingerprint: fingerprint(manifest) };
}

function captureControlState(internals) {
  const stat = fs.lstatSync(internals.qualityRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "control state root is not a local directory");
  }
  return scanControlState(internals.qualityRoot, { includeContents: true });
}

function controlStateMatches(internals, expected) {
  try {
    return scanControlState(internals.qualityRoot, { includeContents: false }).fingerprint === expected.fingerprint;
  } catch {
    return false;
  }
}

function restoreControlState(internals, expected) {
  if (fs.existsSync(internals.qualityRoot)) {
    const rootStat = fs.lstatSync(internals.qualityRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fs.rmSync(internals.qualityRoot, { force: true });
  }
  fs.mkdirSync(internals.qualityRoot, { recursive: true });
  const expectedKinds = new Map([
    ...[...expected.directories].filter(Boolean).map((entry) => [entry, "directory"]),
    ...[...expected.files.keys()].map((entry) => [entry, "file"]),
  ]);
  function expectedDirectChildren(relativeDirectory) {
    const prefix = relativeDirectory === "" ? "" : `${relativeDirectory}/`;
    const children = new Set();
    for (const relative of expectedKinds.keys()) {
      if (!relative.startsWith(prefix)) continue;
      const remainder = relative.slice(prefix.length);
      if (remainder.length > 0) children.add(remainder.split("/")[0]);
    }
    return children;
  }
  function restoreDirectory(relativeDirectory) {
    const directory = relativeDirectory === "" ? internals.qualityRoot : resolveInside(internals.qualityRoot, relativeDirectory);
    if (fs.existsSync(directory)) {
      const stat = fs.lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fs.rmSync(directory, { recursive: true, force: true });
    }
    fs.mkdirSync(directory, { recursive: true });
    const expectedChildren = expectedDirectChildren(relativeDirectory);
    for (const name of fs.readdirSync(directory)) {
      if (relativeDirectory === "" && name === CONTROL_OPERATION_LOCK) continue;
      if (expectedChildren.has(name)) continue;
      fs.rmSync(resolveInside(directory, name), { recursive: true, force: true, maxRetries: 2 });
    }
    for (const name of expectedChildren) {
      const relative = relativeDirectory === "" ? name : `${relativeDirectory}/${name}`;
      if (expectedKinds.get(relative) === "directory") restoreDirectory(relative);
    }
  }
  restoreDirectory("");
  for (const [relative, contents] of expected.files) {
    const target = resolveInside(internals.qualityRoot, relative);
    if (fs.existsSync(target) && !fs.lstatSync(target).isFile()) fs.rmSync(target, { recursive: true, force: true });
    atomicWriteMutable(target, contents, { basePath: internals.qualityRoot });
  }
  internals.controlStateRestoreInjector("before_restore_verification");
  if (!controlStateMatches(internals, expected)) {
    throw new ContractError("QUALITY_CONTROL_STATE_RESTORE_UNVERIFIED", "runner-owned control state could not be exactly restored");
  }
}

function safeToken(prefix) {
  return `${prefix}-${randomBytes(12).toString("hex")}`;
}

function activeExternalPath(internals) {
  return resolveInside(internals.qualityRoot, ACTIVE_EXTERNAL_GUARD);
}

function externalRecoveryPath(internals) {
  return resolveInside(internals.harnessRoot, EXTERNAL_RECOVERY_GUARD);
}

function validateActiveExternalGuard(value, internals) {
  assertPlain(value, "active external quality guard");
  exact(value, [
    "schema_version", "kind", "owner_key", "call_session_key", "call_fingerprint",
    "worktree_fingerprint", "pid", "created_at_ms", "guard_nonce", "restore_status", "fingerprint",
  ], [
    "schema_version", "kind", "owner_key", "call_session_key", "call_fingerprint",
    "worktree_fingerprint", "pid", "created_at_ms", "guard_nonce", "restore_status", "fingerprint",
  ], "active external quality guard");
  if (value.schema_version !== 1 || !["command", "project_check"].includes(value.kind)) {
    throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "active external quality guard has an unsupported shape");
  }
  for (const key of ["owner_key", "call_session_key", "call_fingerprint", "worktree_fingerprint", "guard_nonce"]) {
    assertString(value[key], `active external quality guard.${key}`, { maxBytes: 256 });
  }
  assertFingerprint(value.call_fingerprint, "active external quality guard.call_fingerprint");
  assertFingerprint(value.worktree_fingerprint, "active external quality guard.worktree_fingerprint");
  assertFingerprint(value.fingerprint, "active external quality guard.fingerprint");
  assertInteger(value.pid, "active external quality guard.pid", { min: 1, max: 2147483647 });
  assertInteger(value.created_at_ms, "active external quality guard.created_at_ms", { min: 0, max: Number.MAX_SAFE_INTEGER });
  if (!["pending", "unverified", "containment_unverified"].includes(value.restore_status)) {
    throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "active external quality guard restore status is invalid");
  }
  if (value.worktree_fingerprint !== internals.worktreeFingerprint) {
    throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "active external quality guard belongs to another worktree");
  }
  const source = { ...value };
  delete source.fingerprint;
  if (!fingerprintsEqual(value.fingerprint, fingerprint(source))) {
    throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "active external quality guard fingerprint is invalid");
  }
  return value;
}

function readGuardFile(file, internals, { required = false } = {}) {
  if (!fs.existsSync(file)) {
    if (required) throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "active external quality guard disappeared");
    return null;
  }
  try {
    return validateActiveExternalGuard(readJson(file), internals);
  } catch (error) {
    if (error instanceof ContractError && error.code === "QUALITY_CONTROL_STATE_TAMPER") throw error;
    throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "active external quality guard is unreadable");
  }
}

function readActiveExternalGuard(internals, { required = false } = {}) {
  const activeFile = activeExternalPath(internals);
  const recoveryFile = externalRecoveryPath(internals);
  const activeExists = fs.existsSync(activeFile);
  const recoveryExists = fs.existsSync(recoveryFile);
  if (!activeExists && !recoveryExists) {
    if (required) throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "active external quality guard disappeared");
    return null;
  }
  if (!recoveryExists) {
    throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "independent external recovery guard disappeared");
  }
  const recovery = readGuardFile(recoveryFile, internals, { required: true });
  if (!activeExists) {
    throw new ContractError(
      "QUALITY_CONTROL_STATE_RESTORE_UNVERIFIED",
      "runner-owned control-state restoration remains unverified after the local guard disappeared",
    );
  }
  const active = readGuardFile(activeFile, internals, { required: true });
  if (active.fingerprint !== recovery.fingerprint) {
    throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "external quality guard mirrors disagree");
  }
  return active;
}

function createActiveExternalGuard(internals, { kind, ownerKey, callSessionKey, callId }) {
  if (readActiveExternalGuard(internals) !== null) {
    throw new ContractError("QUALITY_COMMAND_SERIALIZATION", "another external quality operation is already active");
  }
  const source = {
    schema_version: 1,
    kind,
    owner_key: ownerKey,
    call_session_key: callSessionKey,
    call_fingerprint: sha256(callId),
    worktree_fingerprint: internals.worktreeFingerprint,
    pid: process.pid,
    created_at_ms: Date.now(),
    guard_nonce: randomBytes(16).toString("hex"),
    restore_status: "pending",
  };
  const guard = { ...source, fingerprint: fingerprint(source) };
  atomicWriteJson(externalRecoveryPath(internals), guard, { immutable: true, basePath: internals.harnessRoot });
  try {
    atomicWriteJson(activeExternalPath(internals), guard, { immutable: true, basePath: internals.qualityRoot });
  } catch (error) {
    try { fs.unlinkSync(externalRecoveryPath(internals)); } catch { /* a surviving recovery guard remains fail-closed */ }
    throw error;
  }
  return validateActiveExternalGuard(guard, internals);
}

function markActiveGuardStatus(internals, expected, restoreStatus) {
  const recovery = readGuardFile(externalRecoveryPath(internals), internals, { required: true });
  if (recovery.fingerprint !== expected.fingerprint) {
    throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "independent external recovery guard identity changed");
  }
  const source = { ...recovery, restore_status: restoreStatus };
  delete source.fingerprint;
  const updated = { ...source, fingerprint: fingerprint(source) };
  atomicWriteJson(externalRecoveryPath(internals), updated, { basePath: internals.harnessRoot });
  if (fs.existsSync(activeExternalPath(internals))) {
    const active = readGuardFile(activeExternalPath(internals), internals, { required: true });
    if (active.fingerprint !== expected.fingerprint) {
      throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "active external quality guard identity changed");
    }
    atomicWriteJson(activeExternalPath(internals), updated, { basePath: internals.qualityRoot });
  }
}

function markActiveGuardRestoreUnverified(internals, expected) {
  markActiveGuardStatus(internals, expected, "unverified");
}

function markActiveGuardContainmentUnverified(internals, expected) {
  markActiveGuardStatus(internals, expected, "containment_unverified");
}

function removeActiveExternalGuard(internals, expected) {
  const current = readActiveExternalGuard(internals, { required: true });
  if (current.fingerprint !== expected.fingerprint) {
    throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "active external quality guard identity changed");
  }
  const recovery = readGuardFile(externalRecoveryPath(internals), internals, { required: true });
  if (recovery.fingerprint !== expected.fingerprint) {
    throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "independent external recovery guard identity changed");
  }
  fs.unlinkSync(activeExternalPath(internals));
  fs.unlinkSync(externalRecoveryPath(internals));
}

function settlementIdentity(sessionId, callId) {
  return { call_session_key: sessionKey(sessionId), call_fingerprint: sha256(callId) };
}

function assertActiveExternalAccess(internals, settlement = null) {
  const active = readActiveExternalGuard(internals);
  if (active === null) return;
  if (active.restore_status === "unverified") {
    throw new ContractError("QUALITY_CONTROL_STATE_RESTORE_UNVERIFIED", "runner-owned control-state restoration remains unverified");
  }
  if (active.restore_status === "containment_unverified") {
    throw new ContractError("QUALITY_CHECK_TEARDOWN_UNVERIFIED", "trusted project-check process containment remains unverified");
  }
  if (active.kind === "command" && settlement !== null
    && active.call_session_key === settlement.call_session_key
    && active.call_fingerprint === settlement.call_fingerprint) return;
  throw new ContractError("QUALITY_COMMAND_SERIALIZATION", "quality control operations are serialized while an external operation is active");
}

function recoverStaleControlOperationLock(internals, lock) {
  if (!fs.existsSync(lock)) return;
  let raw;
  let record;
  let identity;
  try {
    identity = fs.lstatSync(lock);
    raw = fs.readFileSync(lock, "utf8");
    record = JSON.parse(raw);
  } catch {
    throw new ContractError("FILES_LOCKED", "control operation lock is present but not safely recoverable");
  }
  if (!record || record.schema_version !== 1 || !Number.isInteger(record.pid) || !Number.isInteger(record.created_at_ms)
    || typeof record.nonce !== "string" || Date.now() - record.created_at_ms < internals.lockStaleMs
    || processIsAlive(record.pid)) {
    throw new ContractError("FILES_LOCKED", "quality control operation is already locked");
  }
  const quarantine = resolveInside(internals.qualityRoot, `${CONTROL_OPERATION_LOCK}.stale-${randomBytes(8).toString("hex")}`);
  try {
    fs.renameSync(lock, quarantine);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw new ContractError("FILES_LOCKED", "stale control operation lock could not be isolated");
  }
  const moved = fs.lstatSync(quarantine);
  const sameIdentity = moved.dev === identity.dev && moved.ino === identity.ino
    && moved.size === identity.size && moved.mtimeMs === identity.mtimeMs;
  if (!sameIdentity || fs.readFileSync(quarantine, "utf8") !== raw) {
    if (!fs.existsSync(lock)) fs.renameSync(quarantine, lock);
    throw new ContractError("FILES_LOCKED", "control operation lock changed during stale recovery");
  }
  fs.unlinkSync(quarantine);
}

function recoverOrphanActiveExternalGuard(internals) {
  const active = readActiveExternalGuard(internals);
  if (active?.restore_status === "unverified") {
    throw new ContractError("QUALITY_CONTROL_STATE_RESTORE_UNVERIFIED", "runner-owned control-state restoration remains unverified");
  }
  if (active?.restore_status === "containment_unverified") {
    throw new ContractError("QUALITY_CHECK_TEARDOWN_UNVERIFIED", "trusted project-check process containment remains unverified");
  }
  if (active === null || Date.now() - active.created_at_ms < internals.lockStaleMs || processIsAlive(active.pid)) return;
  internals.quarantinedSessionKeys.add(active.owner_key);
  try {
    mutateStateByKey(internals, active.owner_key, (state) => {
      addIncompleteReason(state, "orphaned_external_operation");
      state.capabilities = [];
      state.pending_mutations = [];
      state.active_task_launch = null;
      state.post_architecture_evidence = null;
      state.verification = null;
      state.attestation = null;
    });
  } catch { /* missing or corrupt owner state remains fail-closed through the registration */ }
  try { transitionQualitySessionByKey(internals.registry, active.owner_key, "failed", "QUALITY_ORPHANED_EXTERNAL_OPERATION"); } catch { /* best effort terminalization */ }
  throw new ContractError(
    "QUALITY_COMMAND_SERIALIZATION",
    "an orphaned external operation may still be running; verify its process tree has stopped and remove the durable guard manually",
  );
}

function withControlOperationLock(internals, callback, { settlement = null } = {}) {
  const lock = resolveInside(internals.qualityRoot, CONTROL_OPERATION_LOCK);
  try {
    recoverStaleControlOperationLock(internals, lock);
    return withExclusiveLock(lock, () => {
      recoverOrphanActiveExternalGuard(internals);
      assertActiveExternalAccess(internals, settlement);
      return callback();
    }, {
      basePath: internals.qualityRoot,
      lockIdFactory: () => canonicalJson({ schema_version: 1, pid: process.pid, created_at_ms: Date.now(), nonce: randomBytes(16).toString("hex") }),
    });
  } catch (error) {
    if (error instanceof ContractError && error.code === "FILES_LOCKED") {
      throw new ContractError("QUALITY_COMMAND_SERIALIZATION", "another quality control operation holds the workspace lock");
    }
    throw error;
  }
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

function comparablePolicyPath(value) {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function samePolicyPath(left, right) {
  return comparablePolicyPath(left) === comparablePolicyPath(right);
}

function withinOwnership(file, ownership) {
  const comparableFile = comparablePolicyPath(file);
  return ownership.some((entry) => {
    const comparableEntry = comparablePolicyPath(entry);
    return comparableFile === comparableEntry || comparableFile.startsWith(`${comparableEntry}/`);
  });
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

function checkExecutionEvidenceBody(value) {
  return {
    producer: value.producer,
    command_id: value.command_id,
    check_id: value.check_id,
    phase: value.phase,
    purpose: value.purpose,
    status: value.status,
    observed_outcome: value.observed_outcome,
    exit_code: value.exit_code,
    signal: value.signal,
    duration_ms: value.duration_ms,
    timeout_ms: value.timeout_ms,
    stdout_bytes: value.stdout_bytes,
    stderr_bytes: value.stderr_bytes,
    max_output_chars: value.max_output_chars,
    command_fingerprint: value.command_fingerprint,
    catalog_fingerprint: value.catalog_fingerprint,
    toolchain_map_fingerprint: value.toolchain_map_fingerprint,
    executable_identity_fingerprint: value.executable_identity_fingerprint,
    toolchain_host_configuration_fingerprint: value.toolchain_host_configuration_fingerprint,
    toolchain_resolution_policy_version: value.toolchain_resolution_policy_version,
    toolchain_environment_fingerprint: value.toolchain_environment_fingerprint,
    toolchain_runtime_metadata_fingerprint: value.toolchain_runtime_metadata_fingerprint,
    containment_kind: value.containment_kind,
    containment_state: value.containment_state,
    containment_identity_fingerprint: value.containment_identity_fingerprint,
    source_workspace_fingerprint: value.source_workspace_fingerprint,
    source_workspace_post_fingerprint: value.source_workspace_post_fingerprint,
    output_workspace_fingerprint: value.output_workspace_fingerprint,
    output_workspace_post_fingerprint: value.output_workspace_post_fingerprint,
    output_workspace_post_entries: value.output_workspace_post_entries,
  };
}

function expectedOutcomeStatus(purpose, phase, outcome) {
  if (["timed_out", "unavailable", "oversized", "malformed"].includes(outcome)) return "blocked";
  if (purpose !== "bug_reproducer") return outcome === "passed" ? "passed" : "failed";
  const expected = phase === "preimplementation" ? "failing_reproducer" : "passing_regression";
  return outcome === expected ? "passed" : "failed";
}

function normalizeCheckExecutionReceipt(internals, result, { checkId, phase, workspace }) {
  const commandId = `trusted-project-check:${checkId}:${phase}`;
  let source;
  if (result?.receipt !== undefined) {
    const trusted = trustedProjectCheckResult(result.receipt);
    if (trusted.receipt.check_id !== checkId || trusted.receipt.phase !== phase
      || trusted.receipt.catalog_fingerprint !== internals.projectCatalogFingerprint
      || trusted.receipt.source_workspace_fingerprint !== workspace.source_fingerprint
      || trusted.receipt.source_workspace_post_fingerprint !== workspace.source_fingerprint) {
      throw new ContractError("QUALITY_CHECK_RECEIPT", "trusted project check receipt does not bind its requested target");
    }
    source = { ...trusted.receipt };
  } else {
    const check = internals.projectCatalog?.checks.find((entry) => entry.check_id === checkId);
    const purpose = check?.purpose ?? "verification";
    const requestedStatus = TRUSTED_PROJECT_CHECK_STATUSES.includes(result?.status) ? result.status : "blocked";
    const observedOutcome = TRUSTED_PROJECT_CHECK_OBSERVED_OUTCOMES.includes(result?.observed_outcome)
      ? result.observed_outcome
      : purpose === "bug_reproducer"
        ? requestedStatus === "blocked" ? "unavailable"
          : requestedStatus === "passed" ? (phase === "preimplementation" ? "failing_reproducer" : "passing_regression")
            : "unrelated_failure"
        : requestedStatus === "passed" ? "passed" : requestedStatus === "failed" ? "failed" : "unavailable";
    const status = expectedOutcomeStatus(purpose, phase, observedOutcome);
    const outputEntries = Array.isArray(result?.output_workspace_post_entries)
      ? result.output_workspace_post_entries.map((entry) => ({ ...entry }))
      : [];
    const emptyOutputFingerprint = fingerprint({
      schema_version: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
      entries: outputEntries,
    });
    const containmentKind = result?.containment_kind
      ?? (process.platform === "win32"
        ? "windows-job-object-v1"
        : process.platform === "darwin" ? "macos-exclusive-uid-v1" : "linux-cgroup-v2");
    const containmentIdentityFingerprint = typeof result?.containment_identity_fingerprint === "string"
      ? result.containment_identity_fingerprint
      : fingerprint({ kind: containmentKind, check_id: checkId, phase, injected_runner: true });
    source = {
      schema_version: TRUSTED_PROJECT_CHECK_RECEIPT_SCHEMA_VERSION,
      producer: TRUSTED_PROJECT_CHECK_PRODUCER,
      command_id: commandId,
      check_id: checkId,
      phase,
      purpose,
      status,
      observed_outcome: observedOutcome,
      exit_code: Number.isInteger(result?.exit_code) ? result.exit_code : null,
      signal: typeof result?.signal === "string" ? result.signal : null,
      duration_ms: Number.isInteger(result?.duration_ms) ? result.duration_ms : 0,
      timeout_ms: check?.timeout_ms ?? 120_000,
      stdout_bytes: Number.isInteger(result?.stdout_bytes) ? result.stdout_bytes : 0,
      stderr_bytes: Number.isInteger(result?.stderr_bytes) ? result.stderr_bytes : 0,
      max_output_chars: check?.max_output_chars ?? 1024 * 1024,
      command_fingerprint: typeof result?.command_fingerprint === "string"
        ? result.command_fingerprint
        : fingerprint({ check_id: checkId, command_id: commandId }),
      catalog_fingerprint: internals.projectCatalogFingerprint,
      toolchain_map_fingerprint: typeof result?.toolchain_map_fingerprint === "string"
        ? result.toolchain_map_fingerprint : fingerprint({ injected_runner: true, kind: "toolchain-map" }),
      executable_identity_fingerprint: typeof result?.executable_identity_fingerprint === "string"
        ? result.executable_identity_fingerprint : fingerprint({ injected_runner: true, check_id: checkId }),
      toolchain_host_configuration_fingerprint:
        typeof result?.toolchain_host_configuration_fingerprint === "string"
          ? result.toolchain_host_configuration_fingerprint
          : fingerprint({ injected_runner: true, kind: "toolchain-host-configuration" }),
      toolchain_resolution_policy_version: TRUSTED_TOOLCHAIN_RESOLUTION_POLICY_VERSION,
      toolchain_environment_fingerprint: typeof result?.toolchain_environment_fingerprint === "string"
        ? result.toolchain_environment_fingerprint
        : fingerprint({ injected_runner: true, kind: "toolchain-environment", check_id: checkId }),
      toolchain_runtime_metadata_fingerprint:
        typeof result?.toolchain_runtime_metadata_fingerprint === "string"
          ? result.toolchain_runtime_metadata_fingerprint
          : fingerprint({ injected_runner: true, kind: "toolchain-runtime-metadata", check_id: checkId }),
      containment_kind: containmentKind,
      containment_state: result?.containment_state ?? {
        support_state: "verified",
        kind: containmentKind,
        scope_id: `fixture-${checkId}-${phase}`,
        identity_fingerprint: containmentIdentityFingerprint,
        attached: true,
        closed: true,
        teardown_verified: true,
      },
      containment_identity_fingerprint: containmentIdentityFingerprint,
      source_workspace_fingerprint: workspace.source_fingerprint,
      source_workspace_post_fingerprint: workspace.source_fingerprint,
      output_workspace_fingerprint: typeof result?.output_workspace_fingerprint === "string"
        ? result.output_workspace_fingerprint : emptyOutputFingerprint,
      output_workspace_post_fingerprint: typeof result?.output_workspace_post_fingerprint === "string"
        ? result.output_workspace_post_fingerprint : emptyOutputFingerprint,
      output_workspace_post_entries: outputEntries,
    };
    source.evidence_fingerprint = fingerprint(checkExecutionEvidenceBody(source));
  }
  const durable = { kind: "check", ...source };
  validateCheckExecutionReceipt(durable, "trusted project check execution receipt");
  return deepFrozenClone(durable, "trusted project check execution receipt");
}

function gateReceiptStatus(status) {
  if (status === "passed" || status === "failed") return status;
  return "blocked";
}

function preimplementationGateReceiptStatus(state, receipt) {
  const contract = state.reproduction_contract;
  if (receipt.purpose !== "bug_reproducer" || contract?.check_id !== receipt.check_id) {
    return gateReceiptStatus(receipt.status);
  }
  if (contract.expected_pre_fix === "unavailable") {
    return receipt.observed_outcome === "unavailable" && contract.uncertainty_material === false
      ? "passed"
      : gateReceiptStatus(receipt.status);
  }
  return receipt.observed_outcome === "failing_reproducer" && receipt.status === "passed"
    ? "passed"
    : gateReceiptStatus(receipt.status);
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
  const keys = ["capability_id", "kind", "target_agent", "paths", "command", "command_fingerprint", "expected_effect", "timeout_ms", "dossier_revision", "gate_fingerprint", "mutation_revision", "consumed", "bound_call_id", "fingerprint"];
  exact(value, keys, keys, label);
  if (!["edit", "task", "command"].includes(value.kind) || typeof value.consumed !== "boolean") throw new ContractError("QUALITY_STATE_SCHEMA", `${label} is invalid`);
  if (value.target_agent !== null && value.target_agent !== "general") throw new ContractError("QUALITY_STATE_SCHEMA", `${label}.target_agent is invalid`);
  if (value.kind === "command") {
    assertString(value.command, `${label}.command`, { maxBytes: 16000 });
    assertFingerprint(value.command_fingerprint, `${label}.command_fingerprint`);
    if (value.command_fingerprint !== sha256(value.command)) throw new ContractError("QUALITY_STATE_BINDING", `${label}.command_fingerprint is stale`);
    assertString(value.expected_effect, `${label}.expected_effect`, { maxBytes: 4000 });
    assertInteger(value.timeout_ms, `${label}.timeout_ms`, { min: 1, max: 600000 });
    if (value.target_agent !== null) throw new ContractError("QUALITY_STATE_SCHEMA", `${label}.target_agent is invalid for command capability`);
  } else if (value.command !== null || value.command_fingerprint !== null || value.expected_effect !== null || value.timeout_ms !== null) {
    throw new ContractError("QUALITY_STATE_SCHEMA", `${label} non-command capability contains command authority`);
  }
  assertInteger(value.dossier_revision, `${label}.dossier_revision`, { min: 1 });
  assertInteger(value.mutation_revision, `${label}.mutation_revision`, { min: 0 });
  assertFingerprint(value.gate_fingerprint, `${label}.gate_fingerprint`);
  validateStateArray(value.paths, `${label}.paths`, { max: 128, item: (entry, entryLabel) => assertString(entry, entryLabel, { maxBytes: 1000 }) });
  if (value.bound_call_id !== null) assertString(value.bound_call_id, `${label}.bound_call_id`, { maxBytes: 1000 });
  assertBoundFingerprint(value, label);
}

function validateObservedCall(value, label) {
  exact(value, ["call_id", "session_key", "tool_id", "paths", "target_agent", "command_fingerprint", "fingerprint"], ["call_id", "session_key", "tool_id", "paths", "target_agent", "command_fingerprint", "fingerprint"], label);
  assertString(value.call_id, `${label}.call_id`, { maxBytes: 1000 });
  assertString(value.session_key, `${label}.session_key`, { maxBytes: 128 });
  if (!NATIVE_MUTATION_TOOLS.has(value.tool_id)) throw new ContractError("QUALITY_STATE_SCHEMA", `${label}.tool_id is invalid`);
  validateStateArray(value.paths, `${label}.paths`, { max: 128, item: (entry, entryLabel) => assertString(entry, entryLabel, { maxBytes: 1000 }) });
  if (value.target_agent !== null) assertString(value.target_agent, `${label}.target_agent`, { maxBytes: 128 });
  if (value.tool_id === "bash") assertFingerprint(value.command_fingerprint, `${label}.command_fingerprint`);
  else if (value.command_fingerprint !== null) throw new ContractError("QUALITY_STATE_SCHEMA", `${label}.command_fingerprint is invalid`);
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

function validateContextReceiptIds(value, label) {
  validateStateArray(value, label, {
    max: 512,
    item: (entry, entryLabel) => assertString(entry, entryLabel, { maxBytes: 256 }),
  });
  if (new Set(value).size !== value.length) {
    throw new ContractError("QUALITY_STATE_BINDING", `${label} must contain unique receipt identities`);
  }
}

function validatePendingContextCalls(value, label) {
  validateStateArray(value, label, { max: 1, item: validatePendingContextReceipt });
  const identities = new Set();
  for (const pending of value) {
    const identity = `${pending.session_key}:${pending.receipt_id}:${pending.call_key_fingerprint}`;
    if (identities.has(identity)) throw new ContractError("QUALITY_STATE_BINDING", `${label} contains duplicate pending context calls`);
    identities.add(identity);
  }
}

function validateContribution(value, label) {
  const keys = [
    "role", "result_id", "session_key", "run_id", "task_id", "dossier_id",
    "dossier_analysis_fingerprint", "context_strategy_fingerprint", "context_report_analysis_fingerprint",
    "context_decision_fingerprint", "context_task_profile_evidence_fingerprint", "subject_fingerprint",
    "blocking", "completed_at", "fingerprint",
  ];
  exact(value, keys, keys, label);
  if (!["architect", "reviewer"].includes(value.role) || typeof value.blocking !== "boolean") throw new ContractError("QUALITY_STATE_SCHEMA", `${label} is invalid`);
  for (const key of ["result_id", "session_key", "run_id", "task_id", "dossier_id"]) assertString(value[key], `${label}.${key}`, { maxBytes: 256 });
  for (const key of [
    "dossier_analysis_fingerprint", "context_strategy_fingerprint", "context_report_analysis_fingerprint",
    "context_decision_fingerprint", "context_task_profile_evidence_fingerprint", "subject_fingerprint",
  ]) assertFingerprint(value[key], `${label}.${key}`);
  assertString(value.completed_at, `${label}.completed_at`, { maxBytes: 128 });
  assertBoundFingerprint(value, label);
}

function validatePendingChallengeProposal(value, label) {
  if (value === null) return;
  const keys = [
    "launch_id", "child_session_key", "role", "expected_dossier_revision", "expected_report_revision",
    "expected_workspace_fingerprint", "expected_mutation_revision", "subject", "blockers", "proposed_at", "fingerprint",
  ];
  exact(value, keys, keys, label);
  for (const key of ["launch_id", "child_session_key"]) assertString(value[key], `${label}.${key}`, { maxBytes: 256 });
  if (!["architect", "reviewer"].includes(value.role)) throw new ContractError("QUALITY_STATE_SCHEMA", `${label}.role is invalid`);
  assertInteger(value.expected_dossier_revision, `${label}.expected_dossier_revision`, { min: 1 });
  assertInteger(value.expected_report_revision, `${label}.expected_report_revision`, { min: 1 });
  assertFingerprint(value.expected_workspace_fingerprint, `${label}.expected_workspace_fingerprint`);
  assertInteger(value.expected_mutation_revision, `${label}.expected_mutation_revision`, { min: 0 });
  validatePlanChallengeSubject(value.subject);
  validateStateArray(value.blockers, `${label}.blockers`, { max: 32, item: (entry, entryLabel) => {
    exact(entry, ["id", "severity", "status", "summary", "evidence_refs"], ["id", "severity", "status", "summary", "evidence_refs"], entryLabel);
    assertString(entry.id, `${entryLabel}.id`, { maxBytes: 256 });
    if (!["high", "medium", "low"].includes(entry.severity) || !["resolved", "unresolved"].includes(entry.status)) {
      throw new ContractError("QUALITY_STATE_SCHEMA", `${entryLabel} is invalid`);
    }
    assertString(entry.summary, `${entryLabel}.summary`, { maxBytes: 2000 });
    validateStateArray(entry.evidence_refs, `${entryLabel}.evidence_refs`, { max: 32, item: (ref, refLabel) => {
      exact(ref, ["kind", "value"], ["kind", "value"], refLabel);
      assertString(ref.kind, `${refLabel}.kind`, { maxBytes: 64 });
      assertString(ref.value, `${refLabel}.value`, { maxBytes: 1000 });
    } });
  } });
  assertIso(value.proposed_at, `${label}.proposed_at`);
  assertBoundFingerprint(value, label);
}

function validateActiveTaskLaunch(value, label) {
  if (value === null) return;
  const keys = ["launch_id", "parent_call_id", "kind", "target_agent", "capability_id", "delegated_paths", "phase", "child_session_key", "pending_challenge_proposal", "before_workspace", "started_at", "fingerprint"];
  exact(value, keys, keys, label);
  if (!["read_only", "writable"].includes(value.kind) || !["awaiting_child", "child_active", "failed"].includes(value.phase)) throw new ContractError("QUALITY_STATE_SCHEMA", `${label} is invalid`);
  assertString(value.launch_id, `${label}.launch_id`, { maxBytes: 256 });
  assertString(value.parent_call_id, `${label}.parent_call_id`, { maxBytes: 1000 });
  assertString(value.target_agent, `${label}.target_agent`, { maxBytes: 128 });
  if (value.capability_id !== null) assertString(value.capability_id, `${label}.capability_id`, { maxBytes: 256 });
  if (value.child_session_key !== null) assertString(value.child_session_key, `${label}.child_session_key`, { maxBytes: 128 });
  validatePendingChallengeProposal(value.pending_challenge_proposal, `${label}.pending_challenge_proposal`);
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

function validateStandardLitePolicy(value, label) {
  if (value === null) return;
  exact(value, ["allowed_ownership_prefixes", "protected_paths"], ["allowed_ownership_prefixes", "protected_paths"], label);
  for (const key of ["allowed_ownership_prefixes", "protected_paths"]) {
    validateStateArray(value[key], `${label}.${key}`, {
      max: 128,
      item: (entry, entryLabel) => assertString(entry, entryLabel, { maxBytes: 1000 }),
    });
    if (key === "allowed_ownership_prefixes" && value[key].length === 0) {
      throw new ContractError("QUALITY_STATE_BINDING", `${label}.${key} cannot be empty`);
    }
  }
}

function validatePersistedReproductionContract(value, label) {
  if (value === null) return;
  const keys = ["check_id", "expected_pre_fix", "expected_post_fix", "unavailable_reason", "uncertainty_material"];
  exact(value, keys, keys, label);
  assertString(value.check_id, `${label}.check_id`, { maxBytes: 128 });
  if (!["failing_reproducer", "unavailable"].includes(value.expected_pre_fix)
    || value.expected_post_fix !== "passing_regression" || typeof value.uncertainty_material !== "boolean") {
    throw new ContractError("QUALITY_STATE_SCHEMA", `${label} is invalid`);
  }
  if (value.expected_pre_fix === "unavailable") {
    assertString(value.unavailable_reason, `${label}.unavailable_reason`, { maxBytes: 2000 });
  } else if (value.unavailable_reason !== null) {
    throw new ContractError("QUALITY_STATE_SCHEMA", `${label}.unavailable_reason is invalid`);
  }
}

function validateCheckExecutionReceipt(value, label) {
  const keys = [
    "kind", "schema_version", "producer", "command_id", "check_id", "phase", "purpose", "status",
    "observed_outcome", "exit_code", "signal", "duration_ms", "timeout_ms", "stdout_bytes",
    "stderr_bytes", "max_output_chars", "command_fingerprint", "catalog_fingerprint",
    "toolchain_map_fingerprint", "executable_identity_fingerprint",
    "toolchain_host_configuration_fingerprint", "toolchain_resolution_policy_version",
    "toolchain_environment_fingerprint", "toolchain_runtime_metadata_fingerprint", "containment_kind",
    "containment_state", "containment_identity_fingerprint", "source_workspace_fingerprint",
    "source_workspace_post_fingerprint", "output_workspace_fingerprint",
    "output_workspace_post_fingerprint", "output_workspace_post_entries", "evidence_fingerprint",
  ];
  exact(value, keys, keys, label);
  if (value.kind !== "check") {
    throw new ContractError("QUALITY_STATE_SCHEMA", `${label} is invalid`);
  }
  const receipt = { ...value };
  delete receipt.kind;
  trustedProjectCheckResult(receipt);
}

function validateVerificationReceipt(value, label) {
  if (value?.kind === "check") return validateCheckExecutionReceipt(value, label);
  exact(value, ["kind", "target_id", "status", "command_id", "exit_code"], ["kind", "target_id", "status", "command_id", "exit_code"], label);
  if (value.kind !== "mechanism" || !["passed", "failed", "blocked"].includes(value.status)) {
    throw new ContractError("QUALITY_STATE_SCHEMA", `${label} is invalid`);
  }
  assertString(value.target_id, `${label}.target_id`, { maxBytes: 256 });
  if (value.command_id !== null) assertString(value.command_id, `${label}.command_id`, { maxBytes: 1000 });
  if (value.exit_code !== null) assertInteger(value.exit_code, `${label}.exit_code`, { min: 0, max: 0xFFFFFFFF });
}

function validateVerification(value, state, label) {
  const keys = ["verification_id", "dossier_revision", "gate_fingerprint", "mutation_revision", "workspace_fingerprint", "target_check_ids", "target_mechanism_ids", "receipts", "post_architecture_evidence_fingerprint", "complete", "completed_at", "fingerprint"];
  exact(value, keys, keys, label);
  assertInteger(value.dossier_revision, `${label}.dossier_revision`, { min: 1 });
  assertInteger(value.mutation_revision, `${label}.mutation_revision`, { min: 0 });
  assertFingerprint(value.gate_fingerprint, `${label}.gate_fingerprint`);
  assertFingerprint(value.workspace_fingerprint, `${label}.workspace_fingerprint`);
  validateStateArray(value.target_check_ids, `${label}.target_check_ids`, { max: 256, item: (entry, entryLabel) => assertString(entry, entryLabel, { maxBytes: 256 }) });
  validateStateArray(value.target_mechanism_ids, `${label}.target_mechanism_ids`, { max: 256, item: (entry, entryLabel) => assertString(entry, entryLabel, { maxBytes: 256 }) });
  validateStateArray(value.receipts, `${label}.receipts`, { max: 512, item: validateVerificationReceipt });
  if (new Set(value.target_check_ids).size !== value.target_check_ids.length) {
    throw new ContractError("QUALITY_STATE_BINDING", `${label}.target_check_ids must be unique`);
  }
  if (value.post_architecture_evidence_fingerprint !== null) {
    assertFingerprint(value.post_architecture_evidence_fingerprint, `${label}.post_architecture_evidence_fingerprint`);
  }
  if (typeof value.complete !== "boolean") throw new ContractError("QUALITY_STATE_SCHEMA", `${label}.complete is invalid`);
  const required = requiredEngineeringVerificationTargets(state.dossier);
  if (!exactSameStrings(value.target_check_ids, required.postMutationCheckIds) || !exactSameStrings(value.target_mechanism_ids, required.mechanismIds)) {
    throw new ContractError("QUALITY_STATE_BINDING", `${label} target identities do not match the canonical dossier targets`);
  }
  const receiptIds = value.receipts.map((entry) => (
    entry.kind === "check" ? `check:${entry.check_id}:${entry.phase}` : `mechanism:${entry.target_id}`
  )).sort();
  const targetIds = [
    ...required.postMutationCheckTargets.map((entry) => `check:${entry.checkId}:${entry.phase}`),
    ...value.target_mechanism_ids.map((entry) => `mechanism:${entry}`),
  ].sort();
  if (!exactSameStrings(receiptIds, targetIds)) throw new ContractError("QUALITY_STATE_BINDING", `${label} receipts do not exactly cover canonical targets`);
  for (const receipt of value.receipts.filter((entry) => entry.kind === "check")) {
    if (!required.postMutationCheckTargets.some((entry) => (
      entry.checkId === receipt.check_id && entry.phase === receipt.phase
    ))
      || receipt.catalog_fingerprint !== state.project_catalog_fingerprint
      || receipt.source_workspace_fingerprint !== state.last_workspace.source_fingerprint
      || receipt.source_workspace_post_fingerprint !== state.last_workspace.source_fingerprint) {
      throw new ContractError("QUALITY_STATE_BINDING", `${label} check receipt does not bind its phase, catalog, and final workspace`);
    }
  }
  const expectedCount = required.postMutationCheckTargets.length + required.mechanismIds.length;
  const architectureRequired = postEditArchitectureRequired(state);
  const architectureComplete = !architectureRequired
    || state.post_architecture_evidence?.architecture_evaluation.status === "passed";
  const computedComplete = value.receipts.length === expectedCount
    && value.receipts.every((entry) => entry.status === "passed") && architectureComplete;
  if (value.complete !== computedComplete || value.dossier_revision !== state.dossier?.revision || value.gate_fingerprint !== state.gate?.fingerprint
    || value.mutation_revision !== state.mutation_revision || value.workspace_fingerprint !== state.last_workspace.source_fingerprint
    || value.post_architecture_evidence_fingerprint !== (state.post_architecture_evidence?.fingerprint ?? null)) {
    throw new ContractError("QUALITY_STATE_BINDING", `${label} does not bind the current dossier, gate, mutation, and workspace`);
  }
  assertBoundFingerprint(value, label);
}

function validatePreimplementationCheckReceipts(value, state, label) {
  validateStateArray(value, label, { max: 128, item: validateCheckExecutionReceipt });
  const required = requiredEngineeringVerificationTargets(state.dossier);
  const receiptIds = value.map((entry) => entry.check_id).sort();
  if (new Set(receiptIds).size !== receiptIds.length
    || receiptIds.some((checkId) => !required.preimplementationCheckIds.includes(checkId))) {
    throw new ContractError("QUALITY_STATE_BINDING", `${label} does not exactly cover preimplementation targets`);
  }
  const taskProfileChecks = new Map((state.context_task_profile_evidence?.checks ?? []).map((entry) => [entry.check_id, entry]));
  if (state.gate === null) {
    const profileCheckIds = [...taskProfileChecks.keys()].sort();
    if (!exactSameStrings(receiptIds, profileCheckIds)) {
      throw new ContractError("QUALITY_STATE_BINDING", `${label} does not exactly bind the task-profile baseline cache`);
    }
    for (const receipt of value) {
      if (taskProfileChecks.get(receipt.check_id)?.evidence_fingerprint !== receipt.evidence_fingerprint) {
        throw new ContractError("QUALITY_STATE_BINDING", `${label} does not preserve the task-profile execution evidence`);
      }
    }
  } else if (!exactSameStrings(receiptIds, [...required.preimplementationCheckIds].sort())) {
    throw new ContractError("QUALITY_STATE_BINDING", `${label} does not exactly cover preimplementation targets`);
  }
  const gateReceipts = new Map((state.preimplementation_evidence?.baseline_receipts ?? []).map((entry) => [entry.check_id, entry]));
  for (const receipt of value) {
    const gateReceipt = gateReceipts.get(receipt.check_id);
    if (receipt.phase !== "preimplementation"
      || receipt.catalog_fingerprint !== state.project_catalog_fingerprint
      || receipt.source_workspace_fingerprint !== state.initial_workspace.source_fingerprint
      || receipt.source_workspace_post_fingerprint !== state.initial_workspace.source_fingerprint
      || (state.gate !== null && (
        gateReceipt?.command_or_mechanism !== `trusted-project-check:${receipt.check_id}`
        || gateReceipt?.evidence_fingerprint !== receipt.evidence_fingerprint
        || gateReceipt?.status !== preimplementationGateReceiptStatus(state, receipt)
      ))) {
      throw new ContractError("QUALITY_STATE_BINDING", `${label} contains a stale or reduced preimplementation receipt`);
    }
  }
}

function validateAttestation(value, state, label) {
  const keys = ["schema_version", "run_id", "task_id", "dossier_id", "dossier_fingerprint", "gate_fingerprint", "verification_fingerprint", "post_architecture_evidence_fingerprint", "context_reconciliation_fingerprint", "final_workspace_fingerprint", "mutation_revision", "attested_at", "fingerprint"];
  exact(value, keys, keys, label);
  if (value.schema_version !== 3) throw new ContractError("QUALITY_STATE_SCHEMA", `${label}.schema_version is invalid`);
  assertInteger(value.mutation_revision, `${label}.mutation_revision`, { min: 0 });
  for (const key of ["dossier_fingerprint", "gate_fingerprint", "verification_fingerprint", "final_workspace_fingerprint"]) assertFingerprint(value[key], `${label}.${key}`);
  if (value.post_architecture_evidence_fingerprint !== null) {
    assertFingerprint(value.post_architecture_evidence_fingerprint, `${label}.post_architecture_evidence_fingerprint`);
  }
  assertFingerprint(value.context_reconciliation_fingerprint, `${label}.context_reconciliation_fingerprint`);
  if (value.run_id !== state.run_id || value.task_id !== state.task_id || value.dossier_id !== state.dossier?.dossier_id
    || value.dossier_fingerprint !== state.dossier?.fingerprint || value.gate_fingerprint !== state.gate?.fingerprint
    || value.verification_fingerprint !== state.verification?.fingerprint
    || value.post_architecture_evidence_fingerprint !== (state.post_architecture_evidence?.fingerprint ?? null)
    || value.context_reconciliation_fingerprint !== state.context_reconciliation?.fingerprint
    || value.final_workspace_fingerprint !== state.last_workspace.source_fingerprint
    || value.mutation_revision !== state.mutation_revision) {
    throw new ContractError("QUALITY_STATE_BINDING", `${label} does not bind the current quality state`);
  }
  assertBoundFingerprint(value, label);
}

function stateBinding(condition, detail, code = "QUALITY_STATE_BINDING") {
  if (!condition) throw new ContractError(code, detail);
}

function postEditArchitectureRequired(state) {
  return state.architecture_configuration.status === "configured"
    && ["high", "critical"].includes(state.dossier?.risk_class);
}

function validateOwnerStateCoherence(value, expected) {
  const lifecycle = value.lifecycle;
  stateBinding(
    ["dossier_draft", "implementation_enabled", "gate_blocked", "verified", "attested"].includes(lifecycle),
    "normal-session lifecycle is invalid",
    "QUALITY_STATE_LIFECYCLE",
  );
  stateBinding(value.dossier !== null, "normal-session owner state must retain its dossier");
  stateBinding(value.dossier.run_id === value.run_id && value.dossier.task_id === value.task_id,
    "normal-session runner identity does not match its dossier");
  stateBinding(value.context_strategy.risk_class === value.dossier.risk_class,
    "normal-session context strategy does not match its dossier risk class");
  stateBinding(value.context_strategy.task_profile === value.dossier.task_type,
    "normal-session context strategy does not match its dossier task profile");
  stateBinding(value.dossier.task_shape.starting_commit === value.initial_workspace.head_sha,
    "normal-session dossier does not bind the initial workspace commit");
  if (value.dossier.risk_class === "standard-lite") {
    stateBinding(value.standard_lite_policy !== null,
      "standard-lite owner state must bind a runner-owned project policy");
    for (const candidate of value.cumulative_affected_paths) {
      stateBinding(standardLitePathViolation(value, candidate) === null,
        "standard-lite cumulative affected path violates its bound project policy");
    }
    stateBinding(value.context_report === null,
      "standard-lite owner state cannot retain a Whole-System Context Report");
  } else {
    stateBinding(value.standard_lite_policy === null && value.reproduction_contract === null,
      "high or critical owner state cannot retain standard-lite authority");
    stateBinding(value.standard_lite_context_summary === null,
      "high or critical owner state cannot retain a standard-lite context summary");
    if (value.context_report === null) {
      stateBinding(value.dossier.impact_graph === null && value.context_task_profile_evidence === null
        && value.context_decision === null,
      "high or critical owner state without a context report must await a replanned impact graph");
    }
  }
  if (value.context_report !== null) {
    stateBinding(value.context_report.session_key === value.session_key
      && value.context_report.strategy_binding_fingerprint === value.context_strategy.fingerprint
      && value.context_report.workspace_fingerprint === value.initial_workspace.source_fingerprint,
    "normal-session context report does not bind its session, strategy, and pre-change workspace");
    for (const receiptId of value.context_report.receipt_ids) {
      stateBinding(value.context_receipt_ids.includes(receiptId),
        "normal-session context report references an unbound receipt");
    }
  }
  if (value.standard_lite_context_summary !== null) {
    stateBinding(value.dossier.risk_class === "standard-lite"
      && value.standard_lite_context_summary.session_key === value.session_key
      && value.standard_lite_context_summary.strategy_binding_fingerprint === value.context_strategy.fingerprint
      && value.standard_lite_context_summary.workspace_fingerprint === value.initial_workspace.source_fingerprint,
    "normal-session standard-lite context summary is stale");
    for (const receiptId of value.standard_lite_context_summary.receipt_ids) {
      stateBinding(value.context_receipt_ids.includes(receiptId),
        "normal-session standard-lite summary references an unbound receipt");
    }
  }
  if (value.context_task_profile_evidence !== null) {
    stateBinding(value.context_task_profile_evidence.session_key === value.session_key
      && value.context_task_profile_evidence.run_id === value.run_id
      && value.context_task_profile_evidence.task_id === value.task_id
      && value.context_task_profile_evidence.dossier_id === value.dossier.dossier_id
      && value.context_task_profile_evidence.workspace_fingerprint === value.initial_workspace.source_fingerprint
      && value.context_task_profile_evidence.dossier_analysis_fingerprint === engineeringDossierAnalysisFingerprint(value.dossier),
    "normal-session context task-profile evidence is stale");
  }
  for (const pending of value.pending_context_calls) {
    const ownerProduced = pending.parent_session_key === null
      && pending.producer_session_key === value.session_key
      && pending.producer_role === "owner_session";
    const childProduced = pending.parent_session_key === value.session_key
      && pending.producer_session_key === value.active_task_launch?.child_session_key
      && pending.producer_role === value.active_task_launch?.target_agent;
    stateBinding(pending.session_key === value.session_key && (ownerProduced || childProduced)
      && pending.run_id === value.run_id && pending.task_id === value.task_id
      && pending.worktree_fingerprint === value.worktree_fingerprint
      && !value.context_receipt_ids.includes(pending.receipt_id),
    "normal-session pending context call does not bind its owner state");
  }
  if (value.context_decision !== null) {
    stateBinding(value.context_decision.session_key === value.session_key
      && value.context_decision.strategy_binding_fingerprint === value.context_strategy.fingerprint
      && value.context_decision.dossier_analysis_fingerprint === engineeringDossierAnalysisFingerprint(value.dossier)
      && value.context_decision.workspace_fingerprint === value.initial_workspace.source_fingerprint,
    "normal-session context decision does not bind the current analytical state");
    stateBinding(value.context_decision.report_fingerprint === (value.context_report?.fingerprint ?? null),
      "normal-session context decision does not bind the current context report");
    stateBinding((value.context_decision.task_profile_evidence?.fingerprint ?? null)
      === (value.context_task_profile_evidence?.fingerprint ?? null),
    "normal-session context decision does not bind its runner-owned task-profile evidence");
  }
  if (value.reviewer_reconciliation_evidence !== null) {
    stateBinding(value.context_decision !== null
      && value.reviewer_reconciliation_evidence.session_key === value.session_key
      && value.reviewer_reconciliation_evidence.context_decision_fingerprint === value.context_decision.fingerprint,
    "normal-session reviewer reconciliation evidence is stale");
  }
  if (value.context_reconciliation !== null) {
    stateBinding(value.context_decision !== null
      && value.context_reconciliation.session_key === value.session_key
      && value.context_reconciliation.context_decision_fingerprint === value.context_decision.fingerprint
      && value.context_reconciliation.final_workspace_fingerprint === value.last_workspace.source_fingerprint,
    "normal-session context reconciliation is stale");
  }
  stateBinding((value.dossier.risk_class === "standard-lite" && value.dossier.task_type === "bug_fix")
    === (value.reproduction_contract !== null),
  "normal-session bug-fix reproduction contract binding is inconsistent");

  if (value.gate !== null) {
    stateBinding(value.context_decision?.status === "sufficient",
      "normal-session gate exists without a sufficient context decision");
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
    if (["high", "critical"].includes(value.dossier.risk_class)) {
      assertCurrentPlanChallengeReceipts({
        plan_challenge_receipts: value.preimplementation_evidence.plan_challenge_receipts,
        dossier: value.dossier,
        strategy_binding: value.context_strategy,
        context_report: value.context_report,
        context_decision: value.context_decision,
        task_profile_evidence: value.context_task_profile_evidence,
      });
    }
  }

  const contributionRoles = value.contributions.map((entry) => entry.role);
  stateBinding(new Set(contributionRoles).size === contributionRoles.length,
    "normal-session plan challenge roles must be unique");
  const currentChallengeSubject = value.contributions.length === 0 ? null : challengeSubject(value);
  for (const contribution of value.contributions) {
    stateBinding(contribution.session_key === value.session_key
      && contribution.run_id === value.run_id
      && contribution.task_id === value.task_id
      && contribution.dossier_id === value.dossier.dossier_id,
    "normal-session plan challenge evidence belongs to another session, run, task, or Dossier");
    for (const key of [
      "dossier_analysis_fingerprint", "context_strategy_fingerprint", "context_report_analysis_fingerprint",
      "context_decision_fingerprint", "context_task_profile_evidence_fingerprint",
    ]) stateBinding(contribution[key] === currentChallengeSubject[key], `normal-session plan challenge ${key} is stale`);
    stateBinding(contribution.subject_fingerprint === currentChallengeSubject.fingerprint,
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
        : capability.kind === "command"
          ? observed?.tool_id === "bash" && observed.target_agent === null
            && observed.command_fingerprint === capability.command_fingerprint
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
    const proposal = launch.pending_challenge_proposal;
    if (proposal !== null) {
      stateBinding(launch.kind === "read_only" && launch.phase === "child_active"
        && ["architect", "reviewer"].includes(launch.target_agent)
        && proposal.launch_id === launch.launch_id
        && proposal.child_session_key === launch.child_session_key
        && proposal.role === launch.target_agent,
      "normal-session pending challenge proposal does not bind its active read-only child");
    }
  }

  if (lifecycle === "dossier_draft") {
    stateBinding(value.dossier.status === "draft" && value.gate === null && value.preimplementation_evidence === null
      && value.architecture_evaluation === null && value.post_architecture_evidence === null
      && value.verification === null && value.attestation === null
      && value.capabilities.length === 0 && value.pending_mutations.length === 0,
    "draft normal-session lifecycle contains post-gate state", "QUALITY_STATE_LIFECYCLE");
  } else if (lifecycle === "gate_blocked") {
    stateBinding(value.dossier.status === "finalized" && value.gate?.status === "blocked"
      && value.post_architecture_evidence === null && value.verification === null
      && value.attestation === null && value.capabilities.length === 0
      && value.pending_mutations.length === 0 && value.active_task_launch === null,
    "blocked normal-session lifecycle is inconsistent", "QUALITY_STATE_LIFECYCLE");
  } else if (lifecycle === "implementation_enabled") {
    stateBinding(value.dossier.status === "finalized" && value.gate?.status === "passed" && value.attestation === null,
      "implementation-enabled normal-session lifecycle is inconsistent", "QUALITY_STATE_LIFECYCLE");
  } else if (lifecycle === "verified") {
    stateBinding(value.dossier.status === "finalized" && value.gate?.status === "passed"
      && value.verification?.complete === true && value.attestation === null
      && (!postEditArchitectureRequired(value)
        || value.post_architecture_evidence?.architecture_evaluation.status === "passed")
      && value.pending_mutations.length === 0
      && value.capabilities.every((entry) => entry.consumed) && value.incomplete_reasons.length === 0,
    "verified normal-session lifecycle is inconsistent", "QUALITY_STATE_LIFECYCLE");
  } else {
    stateBinding(value.dossier.status === "finalized" && value.gate?.status === "passed"
      && value.verification?.complete === true && value.attestation !== null
      && value.context_reconciliation?.status === "passed"
      && value.context_reconciliation.invalidates_context_decision === false
      && (!postEditArchitectureRequired(value)
        || value.post_architecture_evidence?.architecture_evaluation.status === "passed")
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
  assertFingerprint(value.project_catalog_fingerprint, "normal-session state.project_catalog_fingerprint");
  if (value.project_catalog_fingerprint !== expected.projectCatalogFingerprint) {
    throw new ContractError("QUALITY_STATE_BINDING", "normal-session state does not bind the plugin-start project catalog");
  }
  validateContextStrategyBinding(value.context_strategy);
  validateStandardLitePolicy(value.standard_lite_policy, "normal-session state.standard_lite_policy");
  validatePersistedReproductionContract(value.reproduction_contract, "normal-session state.reproduction_contract");
  validateStateArray(value.cumulative_affected_paths, "normal-session state.cumulative_affected_paths", {
    max: 12,
    item: (entry, entryLabel) => assertString(entry, entryLabel, { maxBytes: 1000 }),
  });
  if (new Set(value.cumulative_affected_paths).size !== value.cumulative_affected_paths.length) {
    throw new ContractError("QUALITY_STATE_BINDING", "normal-session cumulative affected paths must be unique");
  }
  validateWorkspaceSnapshot(value.initial_workspace, "normal-session state.initial_workspace");
  validateWorkspaceSnapshot(value.last_workspace, "normal-session state.last_workspace");
  if (value.dossier !== null) validateEngineeringDossier(value.dossier);
  if (value.context_report !== null) {
    validateWholeSystemContextReport(value.context_report, {
      dossier: value.dossier,
      impactGraph: value.dossier?.impact_graph ?? null,
    });
  }
  if (value.standard_lite_context_summary !== null) validateStandardLiteContextSummary(value.standard_lite_context_summary);
  if (value.context_task_profile_evidence !== null) {
    validateContextTaskProfileEvidence(value.context_task_profile_evidence, { dossier: value.dossier });
  }
  if (value.context_decision !== null) validateContextSufficiencyDecision(value.context_decision);
  validateContextReceiptIds(value.context_receipt_ids, "normal-session state.context_receipt_ids");
  validatePendingContextCalls(value.pending_context_calls, "normal-session state.pending_context_calls");
  if ((value.first_mutation_at === null) !== (value.first_mutation_sequence === null)) {
    throw new ContractError("QUALITY_STATE_BINDING", "normal-session first-mutation timestamp and sequence must be recorded together");
  }
  if (value.first_mutation_at !== null) {
    assertIso(value.first_mutation_at, "normal-session state.first_mutation_at");
    assertInteger(value.first_mutation_sequence, "normal-session state.first_mutation_sequence", { min: 1 });
  }
  if (value.reviewer_reconciliation_evidence !== null) {
    validateReviewerReconciliationEvidence(value.reviewer_reconciliation_evidence);
  }
  if (value.context_reconciliation !== null) validateContextReconciliation(value.context_reconciliation);
  if (value.gate !== null) validateEngineeringGateDecision(value.gate);
  if (value.preimplementation_evidence !== null) validateEngineeringPreimplementationEvidence(value.preimplementation_evidence);
  validatePreimplementationCheckReceipts(value.preimplementation_check_receipts, value, "normal-session state.preimplementation_check_receipts");
  validateArchitectureConfiguration(value.architecture_configuration, "normal-session state.architecture_configuration");
  if (value.architecture_evaluation !== null) validateArchitectureEvaluation(value.architecture_evaluation);
  if (value.gate !== null && value.gate.architecture_evaluation_fingerprint !== (value.architecture_evaluation?.fingerprint ?? null)) {
    throw new ContractError("QUALITY_STATE_BINDING", "normal-session gate does not bind its architecture evaluation");
  }
  if (value.post_architecture_evidence !== null) {
    validatePostEditArchitectureEvidence(value.post_architecture_evidence);
    const post = value.post_architecture_evidence;
    if (post.policy_fingerprint !== value.architecture_configuration.policy_fingerprint
      || post.final_workspace_fingerprint !== value.last_workspace.source_fingerprint
      || post.architecture_evaluation.baseline_graph_fingerprint !== value.dossier?.impact_graph?.fingerprint) {
      throw new ContractError("QUALITY_STATE_BINDING", "post-edit architecture evidence does not bind the current policy, baseline, and final workspace");
    }
  }
  if (!postEditArchitectureRequired(value) && value.post_architecture_evidence !== null) {
    throw new ContractError("QUALITY_STATE_BINDING", "post-edit architecture evidence is present without a configured high-assurance policy");
  }
  validateStateArray(value.contributions, "normal-session state.contributions", { item: validateContribution });
  validateStateArray(value.capabilities, "normal-session state.capabilities", { item: validateCapability });
  validateStateArray(value.observed_calls, "normal-session state.observed_calls", { item: validateObservedCall });
  validateStateArray(value.context_read_only_subagent_ids, "normal-session state.context_read_only_subagent_ids", {
    max: 16,
    item: (entry, label) => assertString(entry, label, { maxBytes: 256 }),
  });
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
    projectCatalogFingerprint: internals.projectCatalogFingerprint,
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
        projectCatalogFingerprint: internals.projectCatalogFingerprint,
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
      projectCatalogFingerprint: internals.projectCatalogFingerprint,
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

function restoreContextStrategyBinding(internals, ownerKey, previousBinding, hadPreviousBinding) {
  if (hadPreviousBinding) internals.contextStrategyBindings.set(ownerKey, previousBinding);
  else internals.contextStrategyBindings.delete(ownerKey);
}

function escalateOwnerContextStrategy(internals, rawSessionId, requestedStrategyId, registration) {
  const resolved = resolveOwnerRecord(internals, rawSessionId);
  const current = resolved.owner;
  if (current.lifecycle !== "dossier_draft" || current.dossier.status !== "draft"
    || current.first_mutation_sequence !== null || current.gate !== null) {
    throw new ContractError("CONTEXT_STRATEGY_ESCALATION_ORDER", "context strategy escalation must precede dossier finalization and implementation");
  }
  if (current.pending_context_calls.length > 0 || current.active_task_launch !== null
    || current.pending_mutations.length > 0) {
    throw new ContractError("CONTEXT_STRATEGY_ESCALATION_ORDER", "context strategy escalation cannot run while context or mutation work is pending");
  }
  const targetRiskClass = requestedStrategyId === "critical-wide-deep-v1"
    ? "critical"
    : requestedStrategyId === "high-wide-deep-v1" ? "high" : current.dossier.risk_class;
  const selected = selectMinimumContextStrategy({
    catalog: internals.contextStrategyCatalog,
    risk_class: targetRiskClass,
    task_type: current.dossier.task_type,
    requested_strategy_id: requestedStrategyId,
  });
  const rank = new Map(["standard-lite-local-v1", "high-wide-deep-v1", "critical-wide-deep-v1"].map((id, index) => [id, index]));
  if (rank.get(selected.strategy_id) < rank.get(current.context_strategy.strategy_id)) {
    throw new ContractError("CONTEXT_STRATEGY_WEAKENING", "context strategy escalation cannot downgrade the active runner binding");
  }
  if (selected.strategy_id === current.context_strategy.strategy_id) {
    return inspectReceipt(current, internals.catalog, registration);
  }

  const controlSnapshot = captureControlState(internals);
  const hadPreviousBinding = internals.contextStrategyBindings.has(current.session_key);
  const previousBinding = internals.contextStrategyBindings.get(current.session_key);
  try {
    const next = JSON.parse(canonicalJson(current));
    const escalatedAt = internals.clock();
    invalidatePlanChallenges(next, { updatedAt: escalatedAt });
    next.dossier = promoteEngineeringDossierRisk(next.dossier, {
      target_risk_class: targetRiskClass,
      created_at: escalatedAt,
    });
    next.context_strategy = selected;
    next.standard_lite_policy = null;
    next.reproduction_contract = null;
    next.context_report = null;
    next.standard_lite_context_summary = null;
    next.context_task_profile_evidence = null;
    next.context_decision = null;
    next.contributions = [];
    next.reviewer_reconciliation_evidence = null;
    next.context_reconciliation = null;
    next.architecture_evaluation = null;
    next.post_architecture_evidence = null;
    next.preimplementation_evidence = null;
    next.preimplementation_check_receipts = [];
    next.capabilities = [];
    next.verification = null;
    next.attestation = null;

    writeState(internals, next, { expectedRevision: current.state_revision });
    internals.failureInjector("after_owner_risk_escalation", { session_id: rawSessionId, target_risk_class: targetRiskClass });
    const escalatedRegistration = escalateQualitySessionRiskByKey(internals.registry, next.session_key, targetRiskClass);
    internals.failureInjector("after_registry_risk_escalation", { session_id: rawSessionId, target_risk_class: targetRiskClass });
    internals.contextStrategyBindings.set(next.session_key, selected);
    internals.failureInjector("after_strategy_binding_publish", { session_id: rawSessionId, target_risk_class: targetRiskClass });
    return inspectReceipt(next, internals.catalog, escalatedRegistration);
  } catch (error) {
    restoreContextStrategyBinding(internals, current.session_key, previousBinding, hadPreviousBinding);
    try {
      restoreControlState(internals, controlSnapshot);
    } catch {
      throw new ContractError("QUALITY_CONTROL_STATE_RESTORE_UNVERIFIED", "context strategy escalation could not restore runner-owned control state");
    }
    throw error;
  }
}

function inspectReceipt(state, catalog, registration = null) {
  const registrationFailed = registration?.lifecycle === "failed";
  return deepFrozenClone({
    schema_version: 1,
    run_id: state.run_id,
    task_id: state.task_id,
    lifecycle: registrationFailed ? "failed" : state.lifecycle,
    dossier_id: state.dossier?.dossier_id ?? null,
    dossier_revision: state.dossier?.revision ?? null,
    dossier_status: state.dossier?.status ?? "absent",
    context_strategy_id: state.context_strategy?.strategy_id ?? null,
    context_report_id: state.context_report?.report_id ?? null,
    context_report_status: state.context_report?.status ?? "not_applicable",
    context_decision_status: state.context_decision?.status ?? "not_evaluated",
    context_receipt_count: state.context_receipt_ids?.length ?? 0,
    context_reconciliation_status: state.context_reconciliation?.status ?? "not_evaluated",
    gate_status: state.gate?.status ?? "not_evaluated",
    gate_fingerprint: state.gate?.fingerprint ?? null,
    ownership_paths: state.dossier?.verification_boundary?.ownership_paths ?? [],
    available_check_ids: catalog.checks.filter((entry) => entry.available).map((entry) => entry.check_id).sort(),
    available_mechanism_ids: catalog.mechanisms.filter((entry) => entry.available).map((entry) => entry.mechanism_id).sort(),
    mutation_pending: state.pending_mutations.length > 0,
    verification_complete: state.verification?.complete === true,
    incomplete_reasons: [...new Set([
      ...state.incomplete_reasons,
      ...(registrationFailed ? registration.failure_reason_codes : []),
    ])],
  }, "normal-session quality inspection receipt");
}

function minimalScopePaths(values) {
  const candidates = [...new Set(values)]
    .sort((left, right) => left.split("/").length - right.split("/").length || left.localeCompare(right));
  return candidates.filter((candidate, index) => !candidates.slice(0, index).some((parent) => (
    parent === "." || candidate === parent || candidate.startsWith(`${parent}/`)
  ))).sort();
}

function stateWorkspaceOwnershipPaths(state, additionalPaths = []) {
  const retainedPaths = state.last_workspace.entries.map((entry) => entry.path);
  const ownershipPaths = state.dossier.verification_boundary.ownership_paths;
  const policyPath = state.architecture_configuration.path;
  return minimalScopePaths([...retainedPaths, ...ownershipPaths, policyPath, ...additionalPaths]);
}

function observeStateWorkspace(internals, state, additionalPaths = [], generatedOutputPaths = null) {
  const includedPaths = stateWorkspaceOwnershipPaths(state, additionalPaths);
  const current = internals.observeWorkspace(internals.workspaceRoot, state.workspace_salt, {
    ownershipPaths: includedPaths,
    generatedOutputPaths: generatedOutputPaths ?? internals.projectGeneratedOutputPaths,
  });
  validateWorkspaceSnapshot(current, "normal-session current workspace");
  return current;
}

function stateWorkspaceMatches(internals, state) {
  const current = observeStateWorkspace(internals, state);
  if (current.source_fingerprint !== state.last_workspace.source_fingerprint) {
    throw new ContractError("QUALITY_WORKSPACE_UNTRACED", "workspace changed outside a reconciled quality mutation");
  }
  return current;
}

function contextCallKeyFingerprint(ownerKey, callSessionKey, callId, toolId) {
  return fingerprint({
    owner_session_key: ownerKey,
    call_session_key: callSessionKey,
    call_id: callId,
    tool_id: toolId,
  });
}

function readBoundContextReceipts(internals, state, { preimplementationOnly = false, activeStrategyOnly = true } = {}) {
  const index = internals.contextReceiptStore.inspectSession(state.session_key);
  const refs = new Map(index.receipt_refs.map((entry) => [entry.receipt_id, entry]));
  const allowed = new Set([
    ...state.context_receipt_ids,
    ...state.pending_context_calls.map((entry) => entry.receipt_id),
  ]);
  for (const receiptId of refs.keys()) {
    if (!allowed.has(receiptId)) {
      throw new ContractError("CONTEXT_RECEIPT_STORE_TAMPER", "receipt store contains an unbound normal-session receipt");
    }
  }
  const receipts = state.context_receipt_ids.map((receiptId) => {
    const ref = refs.get(receiptId);
    if (!ref) throw new ContractError("CONTEXT_RECEIPT_NOT_FOUND", `bound context receipt ${receiptId} is missing`);
    const receipt = internals.contextReceiptStore.readReceipt(state.session_key, receiptId);
    validateContextReceipt(receipt);
    if (receipt.fingerprint !== ref.fingerprint || receipt.session_key !== state.session_key
      || receipt.run_id !== state.run_id || receipt.task_id !== state.task_id
      || receipt.worktree_fingerprint !== state.worktree_fingerprint) {
      throw new ContractError("CONTEXT_RECEIPT_SESSION_MISMATCH", "stored context receipt does not bind the normal-session owner");
    }
    return receipt;
  });
  const active = activeStrategyOnly ? receipts.filter((receipt) => (
    receipt.context_strategy_id === state.context_strategy.strategy_id
    && receipt.context_strategy_fingerprint === state.context_strategy.fingerprint
  )) : receipts;
  return {
    receipts: preimplementationOnly ? active.filter((receipt) => (
      receipt.mutation_revision_started === 0
      && receipt.mutation_revision_completed === 0
      && (state.first_mutation_sequence === null || receipt.sequence < state.first_mutation_sequence)
    )) : active,
  };
}

function assertEscalatedDiscoveryReobserved(internals, state) {
  const all = readBoundContextReceipts(internals, state, {
    preimplementationOnly: true,
    activeStrategyOnly: false,
  }).receipts;
  const active = all.filter((receipt) => (
    receipt.context_strategy_id === state.context_strategy.strategy_id
    && receipt.context_strategy_fingerprint === state.context_strategy.fingerprint
  ));
  const prior = all.filter((receipt) => !active.includes(receipt));
  const observedPaths = (receipts) => new Set(receipts.flatMap((entry) => [
    ...(entry.result?.relative_paths ?? []),
    ...(entry.result?.line_ranges ?? []).map((range) => range.path),
    ...(entry.result?.symbol_ids ?? []).map((symbol) => symbol.path),
    ...(entry.result?.relationships ?? []).map((relationship) => relationship.path),
    ...(entry.request.relationship_target_path === null ? [] : [entry.request.relationship_target_path]),
  ]));
  const contentObservedPaths = (receipts) => new Set(receipts.flatMap((entry) => [
    ...(entry.result?.line_ranges ?? []).map((range) => range.path),
    ...(entry.result?.symbol_ids ?? []).map((symbol) => symbol.path),
    ...(entry.result?.relationships ?? []).map((relationship) => relationship.path),
  ]));
  const priorPaths = new Set([...state.cumulative_affected_paths, ...observedPaths(prior)]);
  if (priorPaths.size === 0) return;
  const activePaths = contentObservedPaths(active);
  const missing = [...priorPaths].filter((entry) => ![...activePaths].some((activePath) => (
    activePath === entry || activePath.startsWith(`${entry}/`)
  )));
  if (missing.length > 0) {
    throw new ContractError(
      "CONTEXT_ESCALATED_DISCOVERY_UNREPEATED",
      `escalated strategy must re-observe every prior discovery path before finalization: ${missing.join(", ")}`,
    );
  }
}

function standardLiteScopeFacts(state, receipts) {
  const ownership = new Set([
    ...state.dossier.verification_boundary.ownership_paths,
    ...state.cumulative_affected_paths,
  ]);
  const ownershipPaths = [...ownership];
  const observedPaths = new Set(receipts.flatMap((entry) => [
    ...entry.request.scope_paths.filter((path) => path !== "."),
    ...(entry.result?.relative_paths ?? []),
    ...(entry.result?.line_ranges ?? []).map((range) => range.path),
    ...(entry.result?.relationships ?? []).map((relationship) => relationship.path),
  ]));
  const relationshipOutsideOwnership = receipts.some((entry) => entry.tool_id === "context_related"
    && (entry.result?.relationships ?? []).some((relationship) => !withinOwnership(relationship.path, ownershipPaths)));
  const ownerRoots = new Set([...ownership].map((entry) => entry.split("/")[0]));
  const externalCodePaths = [...observedPaths].filter((entry) => {
    const kind = classifyContextReconciliationPathKind(entry);
    return ["source", "schema", "config"].includes(kind)
      && !withinOwnership(entry, ownershipPaths)
      && !ownerRoots.has(entry.split("/")[0]);
  });
  const nonOwnedCodePaths = [...observedPaths].filter((entry) => (
    ["source", "schema", "config"].includes(classifyContextReconciliationPathKind(entry))
    && !withinOwnership(entry, ownershipPaths)
  ));
  return {
    public_contract: state.dossier.public_contracts.length > 0,
    transitive_consumer: relationshipOutsideOwnership || nonOwnedCodePaths.length > 0,
    persistence: state.dossier.affected_areas.some((entry) => ["data_store", "migration"].includes(entry.node_kind))
      || [...observedPaths].some((entry) => classifyContextReconciliationPathKind(entry) === "schema"),
    concurrency: state.dossier.failure_modes.some((entry) => ["concurrency_races_interleavings", "timeout_cancellation", "resource_lifecycle_cleanup_shutdown_leaks"].includes(entry.category)),
    security: state.dossier.task_type === "security",
    migration: state.dossier.task_type === "migration",
    multi_module: externalCodePaths.length > 0,
  };
}

function createRunnerContextTaskProfileEvidence(internals, state, createdAt) {
  const checks = [];
  const checkExecutionReceipts = [];
  const obligations = state.dossier.test_obligations.filter((entry) => (
    entry.phase === "preimplementation" && ["reproducer", "characterization"].includes(entry.kind)
  ));
  for (const obligation of obligations) {
    const result = internals.runTrustedTarget({
      kind: "check",
      targetId: obligation.check_id,
      phase: "preimplementation",
      dossier: state.dossier,
      workspaceRoot: internals.workspaceRoot,
      expectedSourceWorkspaceFingerprint: state.last_workspace.source_fingerprint,
      workspaceOwnershipPaths: stateWorkspaceOwnershipPaths(state),
      workspaceGeneratedOutputPaths: internals.projectGeneratedOutputPaths,
      workspaceObservationSalt: state.workspace_salt,
      workspaceObserver: (_root, _salt, options = {}) => observeStateWorkspace(
        internals,
        state,
        [],
        options.generatedOutputPaths ?? [],
      ),
      sessionKey: state.session_key,
    });
    const receipt = normalizeCheckExecutionReceipt(internals, result, {
      checkId: obligation.check_id,
      phase: "preimplementation",
      workspace: state.last_workspace,
    });
    checkExecutionReceipts.push(receipt);
    const passed = receipt.status === "passed"
      && (obligation.kind === "reproducer"
        ? receipt.observed_outcome === "failing_reproducer"
        : receipt.observed_outcome === "passed");
    const blocked = receipt.status === "blocked" || receipt.observed_outcome === "unavailable";
    checks.push({
      obligation_id: obligation.id,
      check_id: obligation.check_id,
      purpose: obligation.kind,
      phase: "preimplementation",
      status: passed ? "passed" : blocked ? "blocked" : "failed",
      observed_outcome: passed
        ? obligation.kind === "reproducer" ? "failing_reproducer" : "passing_characterization"
        : blocked ? "unavailable" : "failed",
      trusted_producer: obligation.trusted_producer,
      command_or_mechanism: obligation.command_or_mechanism,
      evidence_fingerprint: receipt.evidence_fingerprint,
      completed_at: createdAt,
    });
  }
  const evidence = createContextTaskProfileEvidence({
    evidence_id: typedId(internals, "CTXPROFILE", "context-task-profile"),
    session_key: state.session_key,
    workspace_fingerprint: state.initial_workspace.source_fingerprint,
    dossier: state.dossier,
    checks,
    created_at: createdAt,
  });
  return Object.freeze({
    evidence,
    checkExecutionReceipts: Object.freeze(checkExecutionReceipts),
  });
}

function synthesizeStandardLiteContext(internals, state, evaluatedAt) {
  const receiptIndex = readBoundContextReceipts(internals, state, { preimplementationOnly: true });
  const inspectedPaths = contentBackedInspectedPaths(receiptIndex).slice(0, 12);
  const summary = createStandardLiteContextSummary({
    summary_id: typedId(internals, "CTXLOCAL", "context-local"),
    session_key: state.session_key,
    strategy_binding: state.context_strategy,
    workspace_fingerprint: state.initial_workspace.source_fingerprint,
    dossier: state.dossier,
    receipt_ids: receiptIndex.receipts.map((entry) => entry.receipt_id).slice(0, 32),
    inspected_paths: inspectedPaths,
    context_calls: receiptIndex.receipts.length,
    broad_fanout: receiptIndex.receipts.length > 6
      || receiptIndex.receipts.some((entry) => (
        (entry.result?.relative_paths.length ?? 0) > 12
        || (entry.result?.counts.candidate_files ?? 0) > 12
        || (entry.result?.counts.scanned_files ?? 0) > 12
      )),
    discovered_scope_facts: standardLiteScopeFacts(state, receiptIndex.receipts),
    finalized_at: evaluatedAt,
  });
  const decision = evaluateContextSufficiency({
    decision_id: typedId(internals, "CTXDEC", "context-decision"),
    session_key: state.session_key,
    strategy_binding: state.context_strategy,
    dossier: state.dossier,
    workspace_fingerprint: state.initial_workspace.source_fingerprint,
    receipt_index: receiptIndex,
    standard_lite_summary: summary,
    task_profile_evidence: state.context_task_profile_evidence,
    implementation_started_sequence: state.first_mutation_sequence,
    read_only_subagents_used: state.context_read_only_subagent_ids.length,
    evaluated_at: evaluatedAt,
  });
  return { summary, decision, receiptIndex };
}

function recomputeCurrentContextDecision(internals, state, evaluatedAt = internals.clock()) {
  const priorDecisionFingerprint = state.context_decision?.fingerprint ?? null;
  if (state.dossier.risk_class === "standard-lite") {
    const evaluated = synthesizeStandardLiteContext(internals, state, evaluatedAt);
    state.standard_lite_context_summary = evaluated.summary;
    state.context_decision = evaluated.decision;
    return evaluated.decision;
  }
  if (state.context_report?.status !== "finalized") {
    state.context_decision = null;
    return null;
  }
  const receiptIndex = readBoundContextReceipts(internals, state, { preimplementationOnly: true });
  state.context_decision = evaluateContextSufficiency({
    decision_id: typedId(internals, "CTXDEC", "context-decision"),
    session_key: state.session_key,
    strategy_binding: state.context_strategy,
    dossier: state.dossier,
    workspace_fingerprint: state.initial_workspace.source_fingerprint,
    receipt_index: receiptIndex,
    report: state.context_report,
    task_profile_evidence: state.context_task_profile_evidence,
    implementation_started_sequence: state.first_mutation_sequence,
    read_only_subagents_used: state.context_read_only_subagent_ids.length,
    evaluated_at: evaluatedAt,
  });
  if (priorDecisionFingerprint !== null && priorDecisionFingerprint !== state.context_decision.fingerprint) {
    invalidatePlanChallenges(state, { updatedAt: evaluatedAt });
  }
  return state.context_decision;
}

function assertCurrentContextDecision(internals, state) {
  if (state.context_decision === null) {
    throw new ContractError("CONTEXT_SUFFICIENCY_REQUIRED", "mutation requires a runner-owned context sufficiency decision");
  }
  if (state.context_decision.status !== "sufficient") {
    const codes = state.context_decision.reasons.map((entry) => entry.code).join(", ");
    throw new ContractError(
      "CONTEXT_SUFFICIENCY_REQUIRED",
      `context decision for ${state.session_key} is ${state.context_decision.status}: ${codes}`,
    );
  }
  if (state.context_reconciliation?.invalidates_context_decision === true) {
    throw new ContractError("CONTEXT_EVIDENCE_STALE", "final blast-radius evidence invalidated the preimplementation context decision");
  }
  return assertContextDecisionCurrent(state.context_decision, {
    strategy_binding: state.context_strategy,
    dossier: state.dossier,
    workspace_fingerprint: state.initial_workspace.source_fingerprint,
    receipt_index: readBoundContextReceipts(internals, state, { preimplementationOnly: true }),
  });
}

function attachPublishedContextReceipt(internals, state, pending, receipt) {
  validateContextReceipt(receipt);
  for (const key of [
    "receipt_id", "sequence", "previous_receipt_fingerprint", "session_key", "parent_session_key",
    "producer_session_key", "producer_role", "run_id",
    "task_id", "worktree_fingerprint", "source_fingerprint", "mutation_revision_started", "tool_id",
    "call_key_fingerprint", "started_at",
  ]) {
    if (receipt[key] !== pending[key]) {
      throw new ContractError("CONTEXT_RECEIPT_SESSION_MISMATCH", `settled context receipt changed pending field ${key}`);
    }
  }
  for (const key of ["context_strategy_id", "context_strategy_fingerprint", "parent_question_id", "evidence_refs"]) {
    if (canonicalJson(receipt[key]) !== canonicalJson(pending[key])) {
      throw new ContractError("CONTEXT_RECEIPT_SESSION_MISMATCH", `settled context receipt changed pending field ${key}`);
    }
  }
  if (!state.context_receipt_ids.includes(receipt.receipt_id)) state.context_receipt_ids.push(receipt.receipt_id);
  state.pending_context_calls = state.pending_context_calls.filter((entry) => entry.receipt_id !== pending.receipt_id);
  invalidatePlanChallenges(state, { updatedAt: receipt.completed_at });
  if (state.context_decision !== null && state.first_mutation_sequence === null) {
    recomputeCurrentContextDecision(internals, state);
  }
  state.reviewer_reconciliation_evidence = null;
  state.context_reconciliation = null;
  state.attestation = null;
}

function recoverPendingContextCallsByKey(internals, ownerKey) {
  const current = readStateByKey(internals, ownerKey, { required: false });
  if (current?.record_kind !== OWNER_RECORD_KIND || current.pending_context_calls.length === 0) return;
  const recoverableCalls = current.pending_context_calls.filter(
    (pending) => !internals.activeContextCalls.has(pending.call_key_fingerprint),
  );
  if (recoverableCalls.length === 0) return;
  const recoverableCallKeys = new Set(recoverableCalls.map((pending) => pending.call_key_fingerprint));
  mutateStateByKey(internals, ownerKey, (state) => {
    for (const pending of [...state.pending_context_calls]) {
      if (!recoverableCallKeys.has(pending.call_key_fingerprint)) continue;
      const index = internals.contextReceiptStore.inspectSession(state.session_key);
      const existing = index.receipt_refs.find((entry) => entry.receipt_id === pending.receipt_id);
      let receipt;
      if (existing) receipt = internals.contextReceiptStore.readReceipt(state.session_key, pending.receipt_id);
      else {
        const observedAt = internals.clock();
        const completedAt = Date.parse(observedAt) >= Date.parse(pending.started_at)
          ? observedAt
          : new Date(Date.parse(pending.started_at) + 1).toISOString();
        receipt = failContextReceiptOperation(pending, {
          status: "interrupted",
          reason_code: "pending_recovery",
          completed_at: completedAt,
          mutation_revision_completed: Math.max(state.mutation_revision, pending.mutation_revision_started),
        });
        receipt = internals.contextReceiptStore.publishReceipt(receipt).receipt;
      }
      attachPublishedContextReceipt(internals, state, pending, receipt);
    }
  });
}

function recoverPendingContextCalls(internals, rawSessionId) {
  const resolved = resolveOwnerRecord(internals, rawSessionId, { required: false });
  if (resolved !== null) recoverPendingContextCallsByKey(internals, resolved.ownerKey);
}

function assertContextOperationsSettled(state) {
  if (state.pending_context_calls.length > 0) {
    throw new ContractError(
      "CONTEXT_RECEIPT_PENDING",
      "quality state transitions and native mutations require the active context call to settle first",
    );
  }
}

function contributionFor(state, role) {
  return state.contributions.find((entry) => entry.role === role) ?? null;
}

function hasPlanChallengeState(state) {
  const plan = state.dossier.plan_challenge;
  return state.contributions.length > 0
    || plan.architect_result_id !== null
    || plan.reviewer_result_id !== null
    || plan.blockers.length > 0
    || plan.evidence_refs.length > 0;
}

function invalidatePlanChallenges(state, { updatedAt, dossierPatch = null } = {}) {
  const challenged = hasPlanChallengeState(state);
  if (!challenged && dossierPatch === null) return false;
  state.dossier = updateEngineeringDossierDraft(state.dossier, {
    expected_revision: state.dossier.revision,
    updated_at: updatedAt,
    patch: {
      ...(dossierPatch ?? {}),
      plan_challenge: {
        architect_result_id: null,
        reviewer_result_id: null,
        blockers: [],
        evidence_refs: [],
      },
    },
  });
  state.contributions = [];
  return challenged;
}

function challengeSubject(state) {
  return createPlanChallengeSubject({
    dossier: state.dossier,
    strategy_binding: state.context_strategy,
    context_report: state.context_report,
    context_decision: state.context_decision,
    task_profile_evidence: state.context_task_profile_evidence,
  });
}

function commitPlanChallengeContribution(internals, state, {
  role,
  blockers,
  expectedRevision,
  completedAt,
  expectedSubject = null,
}) {
  if (state.dossier.revision !== expectedRevision) {
    throw new ContractError("QUALITY_DOSSIER_REVISION_CONFLICT", "plan challenge expected_revision is stale");
  }
  if (contributionFor(state, role)) {
    throw new ContractError("QUALITY_PLAN_CHALLENGE_DUPLICATE", `${role} contribution already exists`);
  }
  const subject = challengeSubject(state);
  if (expectedSubject !== null && canonicalJson(subject) !== canonicalJson(expectedSubject)) {
    throw new ContractError("QUALITY_PLAN_CHALLENGE_STALE", `${role} proposal no longer binds the current challenge subject`);
  }
  const resultId = internals.idFactory(`${role}-result`);
  const contributionSource = {
    role,
    result_id: resultId,
    session_key: state.session_key,
    run_id: state.run_id,
    task_id: state.task_id,
    dossier_id: state.dossier.dossier_id,
    dossier_analysis_fingerprint: subject.dossier_analysis_fingerprint,
    context_strategy_fingerprint: subject.context_strategy_fingerprint,
    context_report_analysis_fingerprint: subject.context_report_analysis_fingerprint,
    context_decision_fingerprint: subject.context_decision_fingerprint,
    context_task_profile_evidence_fingerprint: subject.context_task_profile_evidence_fingerprint,
    subject_fingerprint: subject.fingerprint,
    blocking: blockers.some((entry) => ["high", "medium"].includes(entry.severity) && entry.status === "unresolved"),
    completed_at: completedAt,
  };
  const contribution = { ...contributionSource, fingerprint: fingerprint(contributionSource) };
  state.contributions.push(contribution);
  const current = state.dossier.plan_challenge;
  state.dossier = updateEngineeringDossierDraft(state.dossier, {
    expected_revision: expectedRevision,
    updated_at: completedAt,
    patch: {
      plan_challenge: {
        architect_result_id: role === "architect" ? resultId : current.architect_result_id,
        reviewer_result_id: role === "reviewer" ? resultId : current.reviewer_result_id,
        blockers: [...current.blockers, ...blockers],
        evidence_refs: [...current.evidence_refs],
      },
    },
  });
  return { result_id: resultId, role, dossier_revision: state.dossier.revision, blocking: contribution.blocking };
}

function createPendingChallengeProposal(state, launch, role, blockers, expectedRevision, proposedAt) {
  const source = {
    launch_id: launch.launch_id,
    child_session_key: launch.child_session_key,
    role,
    expected_dossier_revision: expectedRevision,
    expected_report_revision: state.context_report.revision,
    expected_workspace_fingerprint: state.last_workspace.source_fingerprint,
    expected_mutation_revision: state.mutation_revision,
    subject: challengeSubject(state),
    blockers: JSON.parse(canonicalJson(blockers)),
    proposed_at: proposedAt,
  };
  return { ...source, fingerprint: fingerprint(source) };
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

function requiredPostArchitectureCheck(internals, stateOrDossier) {
  const dossier = stateOrDossier.dossier ?? stateOrDossier;
  const configured = stateOrDossier.architecture_configuration?.status === "configured"
    || internals.architectureConfiguration.status === "configured";
  if (!configured || !["high", "critical"].includes(dossier.risk_class)) return null;
  const checkIds = dossier.verification_plan.architecture_check_ids;
  if (checkIds.length !== 1) {
    throw new ContractError(
      "QUALITY_POST_ARCHITECTURE_CHECK_REQUIRED",
      "configured high and critical sessions require exactly one post-edit architecture project check",
    );
  }
  const check = internals.projectCatalog?.checks.find((entry) => entry.check_id === checkIds[0]);
  if (check?.purpose !== "architecture_graph" || !check.phases.includes("integration")
    || check.generated_output_paths?.length !== 1) {
    throw new ContractError(
      "QUALITY_POST_ARCHITECTURE_CHECK_INVALID",
      "the dossier architecture check must select an integration project-catalog check with purpose architecture_graph and one declared output",
    );
  }
  return check;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
    && left.size === right.size && left.nlink === right.nlink
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function readBoundedArchitectureGraph(workspaceRoot, relativePath) {
  const absolute = resolveInside(workspaceRoot, relativePath);
  let lexical;
  try {
    lexical = fs.lstatSync(absolute, { bigint: true });
  } catch {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_OUTPUT_MISSING", "post-edit architecture graph output is missing");
  }
  if (lexical.isSymbolicLink() || !lexical.isFile() || lexical.nlink !== 1n
    || lexical.size < 1n || lexical.size > BigInt(QUALITY_LIMITS.recordBytes)) {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_OUTPUT_INVALID", "post-edit architecture graph must be a bounded singly-linked regular file");
  }
  const canonical = fs.realpathSync.native(absolute);
  const comparable = (candidate) => process.platform === "win32" ? candidate.toLowerCase() : candidate;
  if (comparable(canonical) !== comparable(absolute)) {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_OUTPUT_ALIAS", "post-edit architecture graph cannot traverse a filesystem alias");
  }
  let descriptor;
  try {
    let flags = fs.constants.O_RDONLY;
    if (process.platform !== "win32" && Number.isInteger(fs.constants.O_NOFOLLOW)) flags |= fs.constants.O_NOFOLLOW;
    descriptor = fs.openSync(canonical, flags);
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || !sameFileIdentity(lexical, before)) {
      throw new ContractError("QUALITY_POST_ARCHITECTURE_OUTPUT_RACE", "post-edit architecture graph identity changed before read");
    }
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor, { bigint: true });
    if (bytes.length !== Number(before.size) || !sameFileIdentity(before, after)) {
      throw new ContractError("QUALITY_POST_ARCHITECTURE_OUTPUT_RACE", "post-edit architecture graph changed during read");
    }
    let parsed;
    try {
      parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      throw new ContractError("QUALITY_POST_ARCHITECTURE_OUTPUT_JSON", "post-edit architecture graph is not strict bounded UTF-8 JSON");
    }
    validateEngineeringImpactGraph(parsed);
    return deepFrozenClone(parsed, "post-edit architecture graph");
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function architectureReceiptFor(state, check) {
  return state.verification?.receipts.find((entry) => (
    entry.kind === "check" && entry.check_id === check.check_id && entry.phase === "integration"
  )) ?? null;
}

function declaredOutputBindingFor(snapshot, outputPath) {
  const entries = snapshot.declared_output_entries.filter((entry) => (
    entry.path === outputPath || entry.path.startsWith(`${outputPath}/`)
  ));
  return {
    entries,
    fingerprint: fingerprint({
      schema_version: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
      entries,
    }),
  };
}

function createPostArchitectureEvidenceFromReceipt(internals, state, receipt, completedAt, evidenceId) {
  const check = requiredPostArchitectureCheck(internals, state);
  if (check === null || receipt === null || receipt.check_id !== check.check_id
    || receipt.phase !== "integration" || receipt.purpose !== "architecture_graph") {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_RECEIPT_MISSING", "post-edit architecture evidence requires the selected architecture check receipt");
  }
  const outputPath = check.generated_output_paths[0];
  const beforeRead = observeStateWorkspace(internals, state);
  const beforeOutput = declaredOutputBindingFor(beforeRead, outputPath);
  if (beforeRead.source_fingerprint !== state.last_workspace.source_fingerprint
    || beforeOutput.fingerprint !== receipt.output_workspace_post_fingerprint
    || canonicalJson(beforeOutput.entries) !== canonicalJson(receipt.output_workspace_post_entries)) {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_OUTPUT_STALE", "architecture output no longer matches its trusted project-check receipt");
  }
  const graph = readBoundedArchitectureGraph(internals.workspaceRoot, outputPath);
  const afterRead = observeStateWorkspace(internals, state);
  if (afterRead.fingerprint !== beforeRead.fingerprint || graph.risk_class !== state.dossier.risk_class) {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_OUTPUT_STALE", "architecture output changed during validation or targets another risk class");
  }
  const currentArchitecture = assertCurrentArchitectureConfiguration(internals, state);
  if (currentArchitecture.policy === null || state.dossier.impact_graph === null) {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_BASELINE_MISSING", "post-edit architecture evaluation requires configured policy and baseline graph");
  }
  const evaluation = internals.evaluateArchitecture({
    graph,
    policy: currentArchitecture.policy,
    baseline: state.dossier.impact_graph,
  });
  validateArchitectureEvaluation(evaluation);
  const extractorIdentity = {
    producer: receipt.producer,
    mechanism_id: check.check_id,
    implementation_fingerprint: fingerprint({
      check_id: check.check_id,
      command_fingerprint: receipt.command_fingerprint,
      catalog_fingerprint: receipt.catalog_fingerprint,
      toolchain_map_fingerprint: receipt.toolchain_map_fingerprint,
      executable_identity_fingerprint: receipt.executable_identity_fingerprint,
      toolchain_host_configuration_fingerprint: receipt.toolchain_host_configuration_fingerprint,
      toolchain_resolution_policy_version: receipt.toolchain_resolution_policy_version,
      toolchain_environment_fingerprint: receipt.toolchain_environment_fingerprint,
      toolchain_runtime_metadata_fingerprint: receipt.toolchain_runtime_metadata_fingerprint,
      containment_identity_fingerprint: receipt.containment_identity_fingerprint,
      output_path: outputPath,
    }),
  };
  return createPostEditArchitectureEvidence({
    evidence_id: evidenceId,
    mechanism_kind: "project_check",
    extractor_identity: extractorIdentity,
    evaluator_identity: {
      producer: NORMAL_SESSION_BRIDGE_PRODUCER,
      algorithm_ids: evaluation.evaluators.map((entry) => entry.id).sort(),
      implementation_fingerprint: internals.architectureEvaluatorFingerprint,
    },
    command_receipt_fingerprint: receipt.evidence_fingerprint,
    extractor_output_fingerprint: receipt.output_workspace_post_fingerprint,
    policy: currentArchitecture.policy,
    final_workspace_fingerprint: state.last_workspace.source_fingerprint,
    planned_graph: state.dossier.impact_graph,
    extracted_graph: graph,
    architecture_evaluation: evaluation,
    completed_at: completedAt,
  });
}

function assertCurrentPostArchitectureEvidence(internals, state) {
  if (!postEditArchitectureRequired(state)) return;
  const evidence = state.post_architecture_evidence;
  const check = requiredPostArchitectureCheck(internals, state);
  const receipt = architectureReceiptFor(state, check);
  if (evidence === null || receipt === null) {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_EVIDENCE_MISSING", "configured high-assurance finalization requires post-edit architecture evidence");
  }
  const current = createPostArchitectureEvidenceFromReceipt(
    internals,
    state,
    receipt,
    evidence.completed_at,
    evidence.evidence_id,
  );
  if (current.fingerprint !== evidence.fingerprint || current.architecture_evaluation.status !== "passed") {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_EVIDENCE_STALE", "post-edit architecture evidence is stale, blocked, or failed");
  }
}

function createChallengeEvidence(internals, state, finalized, evaluatedAt) {
  const baselineReceipts = [];
  const checkExecutionReceipts = [];
  const obligations = new Map(finalized.test_obligations.map((entry) => [entry.check_id, entry]));
  const targets = requiredEngineeringVerificationTargets(finalized);
  const cachedReceipts = new Map(state.preimplementation_check_receipts.map((entry) => [entry.check_id, entry]));
  const profileChecks = new Map((state.context_task_profile_evidence?.checks ?? []).map((entry) => [entry.check_id, entry]));
  for (const checkId of targets.preimplementationCheckIds) {
    const catalogEntry = internals.catalog.checks.find((entry) => entry.check_id === checkId);
    const obligation = obligations.get(checkId);
    let checkReceipt = cachedReceipts.get(checkId) ?? null;
    if (checkReceipt === null) {
      const result = internals.runTrustedTarget({
        kind: "check",
        targetId: checkId,
        phase: "preimplementation",
        dossier: finalized,
        workspaceRoot: internals.workspaceRoot,
        expectedSourceWorkspaceFingerprint: state.last_workspace.source_fingerprint,
        workspaceOwnershipPaths: stateWorkspaceOwnershipPaths(state),
        workspaceGeneratedOutputPaths: internals.projectGeneratedOutputPaths,
        workspaceObservationSalt: state.workspace_salt,
        workspaceObserver: (_root, _salt, options = {}) => observeStateWorkspace(
          internals,
          state,
          [],
          options.generatedOutputPaths ?? [],
        ),
        sessionKey: state.session_key,
      });
      checkReceipt = normalizeCheckExecutionReceipt(internals, result, {
        checkId,
        phase: "preimplementation",
        workspace: state.last_workspace,
      });
    }
    checkExecutionReceipts.push(checkReceipt);
    baselineReceipts.push({
      receipt_id: internals.idFactory("baseline"),
      check_id: checkId,
      trusted_producer: catalogEntry?.trusted_producer ?? NORMAL_SESSION_BRIDGE_PRODUCER,
      phase: "preimplementation",
      status: obligation?.command_or_mechanism === `trusted-project-check:${checkId}`
        ? preimplementationGateReceiptStatus(state, checkReceipt)
        : gateReceiptStatus(checkReceipt.status),
      command_or_mechanism: `trusted-project-check:${checkId}`,
      evidence_fingerprint: checkReceipt.evidence_fingerprint,
      completed_at: profileChecks.get(checkId)?.completed_at ?? evaluatedAt,
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
      session_key: contribution.session_key,
      run_id: contribution.run_id,
      task_id: contribution.task_id,
      dossier_id: contribution.dossier_id,
      dossier_analysis_fingerprint: contribution.dossier_analysis_fingerprint,
      context_strategy_fingerprint: contribution.context_strategy_fingerprint,
      context_report_fingerprint: state.context_report?.fingerprint
        ?? fingerprint({ purpose: "standard-lite-context-report-not-applicable" }),
      context_report_analysis_fingerprint: contribution.context_report_analysis_fingerprint,
      context_decision_fingerprint: contribution.context_decision_fingerprint,
      context_task_profile_evidence_fingerprint: contribution.context_task_profile_evidence_fingerprint,
      subject_fingerprint: contribution.subject_fingerprint,
      mechanism_id: mechanismId,
      trusted_producer: NORMAL_SESSION_BRIDGE_PRODUCER,
      phase: "preimplementation",
      status: contribution.blocking ? "blocked" : "passed",
      evidence_fingerprint: contribution.fingerprint,
      completed_at: contribution.completed_at,
    });
  }
  const evidence = baselineReceipts.length === 0 && planChallengeReceipts.length === 0
    ? null
    : createEngineeringPreimplementationEvidence({
    evidence_id: internals.idFactory("preimplementation"),
    dossier_id: finalized.dossier_id,
    dossier_fingerprint: finalized.fingerprint,
    baseline_receipts: baselineReceipts,
    plan_challenge_receipts: planChallengeReceipts,
  });
  return Object.freeze({ evidence, checkExecutionReceipts: Object.freeze(checkExecutionReceipts) });
}

function assertClassificationMatchesDossier(registration, request, ownership) {
  if (request.risk_class !== registration.risk_class || request.task_type !== registration.task_type
    || request.user_visible_goal !== registration.user_visible_goal) {
    throw new ContractError("QUALITY_SESSION_CLASSIFICATION_MISMATCH", "dossier identity does not match quality_session_start");
  }
  if (!exactSameStrings([...ownership].sort(), [...registration.ownership_paths].sort())) {
    throw new ContractError("QUALITY_OWNERSHIP_IMMUTABLE", "dossier ownership does not match quality_session_start");
  }
  const dossierChecks = [...new Set([
    ...(request.verification_boundary?.check_ids ?? []),
    ...(request.verification_boundary?.integration_check_ids ?? []),
  ])].sort();
  if (!registration.required_check_ids.every((checkId) => dossierChecks.includes(checkId))) {
    throw new ContractError("QUALITY_STANDARD_LITE_CHECK_MISSING", "dossier omits a required trusted project check");
  }
  if (registration.risk_class === "standard-lite") {
    const compact = standardLiteDossierRequest(registration, { trustedProducer: NORMAL_SESSION_BRIDGE_PRODUCER });
    if (canonicalJson(request) !== canonicalJson(compact)) {
      throw new ContractError("QUALITY_SESSION_CLASSIFICATION_MISMATCH", "standard-lite dossier must exactly match its runner-synthesized compact contract");
    }
  }
}

function standardLiteStartRequestFromRegistration(registration) {
  return {
    risk_class: registration.risk_class,
    task_type: registration.task_type,
    user_visible_goal: registration.user_visible_goal,
    ownership_paths: [...registration.ownership_paths],
    required_check_ids: [...registration.required_check_ids],
    classification_rationale: registration.classification_rationale,
    behavior_expectation: registration.behavior_expectation,
    expected_preserved_behavior: [...registration.expected_preserved_behavior],
    known_local_edge_cases: [...registration.known_local_edge_cases],
    scope_facts: { ...registration.scope_facts },
    ...(registration.reproduction_contract === null ? {} : {
      reproduction_contract: { ...registration.reproduction_contract },
    }),
  };
}

function exactStandardLiteStartReplay(registration, request) {
  return registration.risk_class === "standard-lite"
    && canonicalJson(request) === canonicalJson(standardLiteStartRequestFromRegistration(registration));
}

function selectedContextStrategy(internals, registration) {
  const selected = selectMinimumContextStrategy({
    catalog: internals.contextStrategyCatalog,
    risk_class: registration.risk_class,
    task_type: registration.task_type,
    scope_facts: registration.scope_facts ?? {},
    boundary_count: registration.risk_class === "standard-lite"
      ? 1
      : Math.max(1, registration.ownership_paths.length),
  });
  const cached = internals.contextStrategyBindings.get(registration.session_key);
  if (cached !== undefined) {
    validateContextStrategyBinding(cached);
    const rank = new Map(["standard-lite-local-v1", "high-wide-deep-v1", "critical-wide-deep-v1"].map((id, index) => [id, index]));
    if (cached.risk_class !== selected.risk_class || cached.task_profile !== selected.task_profile
      || rank.get(cached.strategy_id) < rank.get(selected.strategy_id)) {
      throw new ContractError("CONTEXT_STRATEGY_BINDING_INVALID", "cached context strategy is weaker than the current runner minimum");
    }
    return cached;
  }
  internals.contextStrategyBindings.set(registration.session_key, selected);
  return selected;
}

function typedId(internals, prefix, purpose) {
  return `${prefix}-${internals.idFactory(purpose)}`;
}

function hasCurrentStrategyContextReceipts(internals, state) {
  return readBoundContextReceipts(internals, state, { activeStrategyOnly: false }).receipts.some((receipt) => (
    receipt.context_strategy_id === state.context_strategy.strategy_id
    && receipt.context_strategy_fingerprint === state.context_strategy.fingerprint
  ));
}

function isFreshRiskPromotionDraft(internals, state) {
  const dossier = state.dossier;
  const expectedStrategyId = dossier.risk_class === "critical"
    ? "critical-wide-deep-v1"
    : "high-wide-deep-v1";
  return state.context_strategy.strategy_id === expectedStrategyId
    && dossier.mode === "full"
    && dossier.revision === 1
    && dossier.created_at === dossier.updated_at
    && dossier.finalized_at === null
    && canonicalJson(dossier.plan_challenge) === canonicalJson({
      architect_result_id: null,
      reviewer_result_id: null,
      blockers: [],
      evidence_refs: [],
    })
    && canonicalJson(dossier.gate_state) === canonicalJson({
      status: "not_evaluated",
      gate_id: null,
      reason_codes: [],
    })
    && state.pending_context_calls.length === 0
    && state.context_task_profile_evidence === null
    && state.contributions.length === 0
    && state.reviewer_reconciliation_evidence === null
    && state.context_reconciliation === null
    && state.architecture_evaluation === null
    && state.post_architecture_evidence === null
    && state.preimplementation_evidence === null
    && state.preimplementation_check_receipts.length === 0
    && state.capabilities.length === 0
    && state.verification === null
    && state.attestation === null
    && !hasCurrentStrategyContextReceipts(internals, state);
}

function reconcileOwnerRegistrationRisk(internals, registration, state) {
  const immutableIdentityMatches = registration.run_id === state.run_id
    && registration.task_id === state.task_id
    && registration.catalog_fingerprint === state.project_catalog_fingerprint
    && registration.workspace_salt === state.workspace_salt;
  if (!immutableIdentityMatches) {
    throw new ContractError("QUALITY_LIFECYCLE_RECONCILIATION", "registry and owner state identities conflict");
  }
  if (registration.risk_class === state.dossier.risk_class) {
    internals.contextStrategyBindings.set(state.session_key, state.context_strategy);
    return registration;
  }

  const rank = new Map([["standard-lite", 0], ["high", 1], ["critical", 2]]);
  const registryRank = rank.get(registration.risk_class);
  const ownerRank = rank.get(state.dossier.risk_class);
  const recoverableOwnerCommit = ownerRank > registryRank
    && state.lifecycle === "dossier_draft"
    && state.dossier.status === "draft"
    && state.first_mutation_sequence === null
    && state.pending_mutations.length === 0
    && state.active_task_launch === null
    && state.gate === null
    && state.context_strategy.risk_class === state.dossier.risk_class
    && state.standard_lite_policy === null
    && state.reproduction_contract === null
    && state.standard_lite_context_summary === null
    && state.context_report === null
    && state.dossier.impact_graph === null
    && state.context_decision === null
    && isFreshRiskPromotionDraft(internals, state);
  if (!recoverableOwnerCommit) {
    throw new ContractError(
      "QUALITY_LIFECYCLE_RECONCILIATION",
      "registry risk class conflicts with the durable owner authority",
    );
  }

  const repaired = escalateQualitySessionRiskByKey(
    internals.registry,
    state.session_key,
    state.dossier.risk_class,
  );
  internals.contextStrategyBindings.set(state.session_key, state.context_strategy);
  return repaired;
}

function reconcileOwnerRegistrationLifecycle(internals, registration, state) {
  const reconciledRegistration = reconcileOwnerRegistrationRisk(internals, registration, state);
  const expected = state.lifecycle === "dossier_draft" && state.dossier.risk_class === "standard-lite"
    ? "standard_lite"
    : state.lifecycle;
  if (reconciledRegistration.lifecycle === expected) return reconciledRegistration;
  const recoverable = (expected === "implementation_enabled" && ["standard_lite", "dossier_draft", "verified"].includes(reconciledRegistration.lifecycle))
    || (expected === "gate_blocked" && ["standard_lite", "dossier_draft"].includes(reconciledRegistration.lifecycle))
    || (expected === "verified" && reconciledRegistration.lifecycle === "implementation_enabled")
    || (expected === "attested" && reconciledRegistration.lifecycle === "verified");
  if (!recoverable) {
    throw new ContractError("QUALITY_LIFECYCLE_RECONCILIATION", `registry lifecycle ${reconciledRegistration.lifecycle} conflicts with owner lifecycle ${state.lifecycle}`);
  }
  return transitionQualitySessionByKey(
    internals.registry,
    state.session_key,
    expected,
    reconciledRegistration.lifecycle === "verified" ? "QUALITY_VERIFICATION_STALE" : "QUALITY_LIFECYCLE_RECOVERY",
  );
}

function reconcileOwnerAuthorityBeforeUse(internals, rawSessionId, { required = false } = {}) {
  const resolved = resolveOwnerRecord(internals, rawSessionId, { required });
  if (resolved === null) return null;
  let registration = assertQualitySessionCatalogCurrentByKey(internals.registry, resolved.ownerKey);
  if (registration.lifecycle !== "failed") {
    registration = reconcileOwnerRegistrationLifecycle(internals, registration, resolved.owner);
  }
  return { ...resolved, registration };
}

function createInitialState(internals, rawSessionId, request, registration) {
  const key = sessionKey(rawSessionId);
  if (!registration || registration.session_key !== key || registration.classification_revision === null) {
    throw new ContractError("QUALITY_SESSION_UNCLASSIFIED", "quality dossier requires quality_session_start");
  }
  const workspaceSalt = registration.workspace_salt;
  const preliminary = internals.observeWorkspace(internals.workspaceRoot, workspaceSalt, registration.ownership_paths);
  validateWorkspaceSnapshot(preliminary, "normal-session preliminary workspace");
  if (preliminary.source_fingerprint !== registration.classification_workspace.source_fingerprint) {
    throw new ContractError("QUALITY_WORKSPACE_UNTRACED", "workspace changed after quality session classification");
  }
  rejectRunnerFields(request, RUNNER_FIELDS, "quality dossier create request");
  const now = internals.clock();
  const runId = registration.run_id;
  const taskId = registration.task_id;
  const dossier = createEngineeringDossierDraft({
    ...request,
    dossier_id: internals.idFactory("dossier"),
    run_id: runId,
    task_id: taskId,
    starting_commit: registration.classification_workspace.head_sha,
    created_at: now,
  });
  const ownership = dossier.verification_boundary.ownership_paths.map((entry, index) => (
    normalizeOwnedPath(entry, internals.workspaceRoot, `quality dossier ownership_paths[${index}]`)
  ));
  if (new Set(ownership).size !== ownership.length) {
    throw new ContractError("QUALITY_OWNERSHIP_DUPLICATE", "quality dossier ownership paths must be unique");
  }
  assertClassificationMatchesDossier(registration, request, ownership);
  const initial = internals.observeWorkspace(internals.workspaceRoot, workspaceSalt, {
    ownershipPaths: minimalScopePaths([...ownership, internals.architectureConfiguration.path]),
    generatedOutputPaths: internals.projectGeneratedOutputPaths,
  });
  validateWorkspaceSnapshot(initial, "normal-session initial workspace");
  if (initial.head_sha !== preliminary.head_sha) {
    throw new ContractError("QUALITY_WORKSPACE_UNTRACED", "workspace HEAD changed while the quality session was being created");
  }
  const finalClassification = internals.observeWorkspace(internals.workspaceRoot, workspaceSalt, registration.ownership_paths);
  validateWorkspaceSnapshot(finalClassification, "normal-session final classified workspace");
  if (finalClassification.fingerprint !== preliminary.fingerprint) {
    throw new ContractError("QUALITY_WORKSPACE_UNTRACED", "workspace changed while the classified quality session was being created");
  }
  const contextStrategy = selectedContextStrategy(internals, registration);
  const contextReport = dossier.risk_class === "standard-lite" ? null : createWholeSystemContextReportDraft({
    report_id: typedId(internals, "CONTEXT", "context-report"),
    session_key: key,
    strategy_binding: contextStrategy,
    workspace_fingerprint: initial.source_fingerprint,
    dossier,
    created_at: now,
  });
  return {
    schema_version: NORMAL_SESSION_BRIDGE_SCHEMA_VERSION,
    record_kind: OWNER_RECORD_KIND,
    state_revision: 0,
    session_key: key,
    worktree_fingerprint: internals.worktreeFingerprint,
    workspace_salt: workspaceSalt,
    run_id: runId,
    task_id: taskId,
    project_catalog_fingerprint: registration.catalog_fingerprint,
    context_strategy: contextStrategy,
    standard_lite_policy: registration.standard_lite_policy,
    reproduction_contract: registration.reproduction_contract,
    cumulative_affected_paths: [...registration.initial_affected_paths],
    lifecycle: "dossier_draft",
    initial_workspace: initial,
    last_workspace: initial,
    dossier,
    context_report: contextReport,
    standard_lite_context_summary: null,
    context_task_profile_evidence: null,
    context_decision: null,
    context_receipt_ids: [],
    pending_context_calls: [],
    context_read_only_subagent_ids: [],
    first_mutation_at: null,
    first_mutation_sequence: null,
    reviewer_reconciliation_evidence: null,
    context_reconciliation: null,
    gate: null,
    preimplementation_evidence: null,
    preimplementation_check_receipts: [],
    architecture_configuration: deepFrozenClone(internals.architectureConfiguration, "normal-session architecture configuration"),
    architecture_evaluation: null,
    post_architecture_evidence: null,
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
  if (["quality_session_start", "quality_dossier_create", "quality_dossier_update", "quality_context_strategy_escalate", "quality_context_report_create", "quality_context_report_update", "quality_context_report_finalize", "quality_dossier_finalize", "quality_action_authorize", "quality_command_authorize", "quality_context_reconcile", "quality_session_finalize"].includes(toolId)
    && !orchestrators.has(agent)) {
    throw new ContractError("QUALITY_TOOL_ROLE", `${toolId} requires an orchestrator identity`);
  }
  if (toolId === "quality_architecture_evaluate" && !["architect", "reviewer"].includes(agent)) {
    throw new ContractError("QUALITY_CONTRIBUTOR_ROLE", "only architect or reviewer may record plan-challenge evidence");
  }
  if (toolId === "quality_verification_record" && agent !== "verifier") {
    throw new ContractError("QUALITY_VERIFIER_ROLE", "only verifier may request trusted verification");
  }
  if (toolId === "quality_context_reviewer_record" && agent !== "reviewer") {
    throw new ContractError("QUALITY_CONTRIBUTOR_ROLE", "only reviewer may record final context reconciliation evidence");
  }
}

function executeOperation(internals, toolId, request, context) {
  const sessionId = context.sessionID;
  assertQualityToolRole(toolId, context.agent);
  if (internals.commandGuards.size > 0) {
    throw new ContractError("QUALITY_COMMAND_SERIALIZATION", "quality control operations are serialized while an authorized command is running");
  }
  if (internals.quarantinedSessionKeys.has(sessionKey(sessionId)) && toolId !== "quality_dossier_inspect") {
    throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "quality session is quarantined after control-state tampering");
  }
  if (toolId === "quality_session_start") {
    const existingState = readState(internals, sessionId, { required: false });
    const existingRegistration = inspectQualitySessionRegistration(internals.registry, sessionId, { required: false });
    if (existingState !== null) {
      if (existingRegistration && exactStandardLiteStartReplay(existingRegistration, request)) {
        reconcileOwnerRegistrationLifecycle(internals, existingRegistration, existingState);
        recoverPendingContextCallsByKey(internals, existingState.session_key);
        return inspectReceipt(readStateByKey(internals, existingState.session_key), internals.catalog);
      }
      throw new ContractError("QUALITY_SESSION_REPLAY", "quality session already has dossier state");
    }
    if (existingRegistration !== null && existingRegistration.classification_revision !== null) {
      if (!exactStandardLiteStartReplay(existingRegistration, request)) {
        throw new ContractError("QUALITY_SESSION_REPLAY", "quality session classification conflicts with its exact retry");
      }
      const compactRequest = standardLiteDossierRequest(existingRegistration, { trustedProducer: NORMAL_SESSION_BRIDGE_PRODUCER });
      const recoveredState = createInitialState(internals, sessionId, compactRequest, existingRegistration);
      writeState(internals, recoveredState, { createOnly: true });
      return inspectReceipt(recoveredState, internals.catalog);
    }
    const registration = startQualitySession(internals.registry, sessionId, request, { agent: context.agent });
    const contextStrategy = selectedContextStrategy(internals, registration);
    if (registration.risk_class !== "standard-lite") {
      return deepFrozenClone({
        schema_version: 1,
        run_id: registration.run_id,
        task_id: registration.task_id,
        lifecycle: registration.lifecycle,
        risk_class: registration.risk_class,
        ownership_paths: registration.ownership_paths,
        required_check_ids: registration.required_check_ids,
        catalog_fingerprint: registration.catalog_fingerprint,
        context_strategy_id: contextStrategy.strategy_id,
        context_strategy_fingerprint: contextStrategy.fingerprint,
      }, "quality session start receipt");
    }
    internals.failureInjector("after_registry_classification", { session_id: sessionId });
    const compactRequest = standardLiteDossierRequest(registration, { trustedProducer: NORMAL_SESSION_BRIDGE_PRODUCER });
    const state = createInitialState(internals, sessionId, compactRequest, registration);
    writeState(internals, state, { createOnly: true });
    return inspectReceipt(state, internals.catalog);
  }
  let preResolved = resolveOwnerRecord(internals, sessionId, { required: false });
  if (preResolved !== null && internals.quarantinedSessionKeys.has(preResolved.ownerKey) && toolId !== "quality_dossier_inspect") {
    throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "quality session is quarantined after control-state tampering");
  }
  const registration = inspectQualitySessionRegistration(internals.registry, sessionId, { required: false });
  if (preResolved === null && registration === null) {
    throw new ContractError("QUALITY_SESSION_UNCLASSIFIED", "quality tool session was not registered by chat.message");
  }
  if (preResolved === null && registration?.lifecycle === "unclassified") {
    if (toolId === "quality_dossier_inspect") {
      return deepFrozenClone({
        schema_version: 1,
        run_id: null,
        task_id: null,
        lifecycle: "unclassified",
        dossier_id: null,
        dossier_revision: null,
        dossier_status: "absent",
        gate_status: "not_evaluated",
        ownership_paths: [],
        required_check_ids: [],
        verification_complete: false,
        incomplete_reasons: ["QUALITY_SESSION_UNCLASSIFIED"],
      }, "unclassified quality session inspection");
    }
    throw new ContractError("QUALITY_SESSION_UNCLASSIFIED", "quality_session_start must precede quality control operations");
  }
  let currentRegistration = preResolved === null
    ? assertQualitySessionCatalogCurrent(internals.registry, sessionId)
    : assertQualitySessionCatalogCurrentByKey(internals.registry, preResolved.ownerKey);
  if (preResolved !== null && currentRegistration.lifecycle !== "failed") {
    currentRegistration = reconcileOwnerRegistrationLifecycle(internals, currentRegistration, preResolved.owner);
  }
  if (preResolved !== null) {
    recoverPendingContextCallsByKey(internals, preResolved.ownerKey);
    preResolved = resolveOwnerRecord(internals, sessionId);
  }
  if (preResolved !== null && !CONTEXT_PENDING_READ_ONLY_QUALITY_TOOLS.has(toolId)) {
    assertContextOperationsSettled(preResolved.owner);
  }
  if (currentRegistration.lifecycle === "failed" && toolId !== "quality_dossier_inspect") {
    throw new ContractError("QUALITY_SESSION_INCOMPLETE", "failed quality session cannot mutate control state");
  }
  if (currentRegistration.lifecycle === "attested" && !["quality_dossier_inspect", "quality_session_finalize"].includes(toolId)) {
    throw new ContractError("QUALITY_SESSION_INCOMPLETE", "attested quality session cannot mutate control state");
  }
  if (toolId === "quality_dossier_create") {
    if (!registration || registration.classification_revision === null) {
      throw new ContractError("QUALITY_SESSION_UNCLASSIFIED", "quality dossier requires quality_session_start");
    }
    const existing = readState(internals, sessionId, { required: false });
    if (existing !== null && registration.risk_class === "standard-lite") {
      throw new ContractError("QUALITY_SESSION_CLASSIFICATION_MISMATCH", "runner-synthesized standard-lite dossier state is immutable");
    }
    if (existing !== null) {
      throw new ContractError("QUALITY_DOSSIER_RECORD_CONFLICT", "quality session already has durable dossier state");
    }
    const state = createInitialState(internals, sessionId, request, registration);
    writeState(internals, state, { createOnly: true });
    return inspectReceipt(state, internals.catalog);
  }
  const resolved = preResolved ?? resolveOwnerRecord(internals, sessionId);
  if (resolved.link !== null && resolved.link.authorized_agent !== context.agent) {
    throw new ContractError("QUALITY_CHILD_ROLE_MISMATCH", "child quality tool identity does not match its bound task role");
  }
  if (resolved.link?.authorized_agent === "general" && toolId !== "quality_dossier_inspect") {
    throw new ContractError("QUALITY_CHILD_ROLE_MISMATCH", "writable implementation children cannot mutate quality control state");
  }
  if (toolId === "quality_dossier_inspect") {
    exact(request, [], [], "quality dossier inspect request");
    return inspectReceipt(resolved.owner, internals.catalog, currentRegistration);
  }
  if (toolId === "quality_context_strategy_escalate") {
    exact(request, ["requested_strategy_id"], ["requested_strategy_id"], "quality context strategy escalation request");
    assertString(request.requested_strategy_id, "quality context strategy escalation request.requested_strategy_id", { maxBytes: 128 });
    return escalateOwnerContextStrategy(internals, sessionId, request.requested_strategy_id, currentRegistration);
  }
  if (toolId === "quality_context_report_create") {
    exact(request, ["expected_dossier_revision"], ["expected_dossier_revision"], "quality context report create request");
    const state = resolved.owner;
    if (state.dossier.risk_class === "standard-lite") {
      throw new ContractError("CONTEXT_REPORT_NOT_APPLICABLE", "standard-lite uses a runner-owned compact context summary");
    }
    if (state.context_report === null) {
      throw new ContractError("CONTEXT_GRAPH_REQUIRED", "escalated dossier must be updated with a new impact graph before creating its context report");
    }
    if (state.dossier.revision !== request.expected_dossier_revision) {
      throw new ContractError("QUALITY_DOSSIER_REVISION_CONFLICT", "context report create expected_dossier_revision is stale");
    }
    return deepFrozenClone(state.context_report, "normal-session Whole-System Context Report draft");
  }
  if (toolId === "quality_context_report_update") {
    exact(request, ["expected_revision", "patch"], ["expected_revision", "patch"], "quality context report update request");
    assertPlain(request.patch, "quality context report update request.patch");
    return mutateOwnerState(internals, sessionId, (state, link) => {
      if (state.lifecycle !== "dossier_draft" || state.context_report === null || state.first_mutation_at !== null) {
        throw new ContractError("CONTEXT_REPORT_FINALIZED", "context report is not editable before implementation");
      }
      const updatedAt = internals.clock();
      state.context_report = updateWholeSystemContextReportDraft(state.context_report, {
        expected_revision: request.expected_revision,
        updated_at: updatedAt,
        patch: request.patch,
      });
      invalidatePlanChallenges(state, { updatedAt });
      state.context_decision = null;
      state.reviewer_reconciliation_evidence = null;
      state.context_reconciliation = null;
      return deepFrozenClone({
        report: state.context_report,
        dossier_revision: state.dossier.revision,
      }, "normal-session context report update receipt");
    });
  }
  if (toolId === "quality_context_report_finalize") {
    exact(request, ["expected_revision"], ["expected_revision"], "quality context report finalization request");
    return mutateOwnerState(internals, sessionId, (state, link) => {
      if (state.lifecycle !== "dossier_draft" || state.context_report === null) {
        throw new ContractError("CONTEXT_REPORT_NOT_APPLICABLE", "Whole-System Context Report finalization requires a high or critical draft dossier");
      }
      if (state.first_mutation_at !== null) {
        throw new ContractError("CONTEXT_FINALIZED_AFTER_MUTATION", "context report cannot first establish sufficiency after implementation starts");
      }
      stateWorkspaceMatches(internals, state);
      assertEscalatedDiscoveryReobserved(internals, state);
      const receiptIndex = readBoundContextReceipts(internals, state, { preimplementationOnly: true });
      if (state.context_report.status === "draft") {
        if (state.context_report.revision !== request.expected_revision) {
          throw new ContractError("CONTEXT_REPORT_REVISION_CONFLICT", "context report expected_revision is stale");
        }
        const taskProfileEvaluatedAt = internals.clock();
        const profiled = createRunnerContextTaskProfileEvidence(
          internals,
          state,
          taskProfileEvaluatedAt,
        );
        state.context_task_profile_evidence = profiled.evidence;
        state.preimplementation_check_receipts = [...profiled.checkExecutionReceipts];
        const candidate = finalizeWholeSystemContextReport(state.context_report, {
          finalized_at: internals.clock(),
          strategy_binding: state.context_strategy,
          workspace_fingerprint: state.initial_workspace.source_fingerprint,
          dossier: state.dossier,
          receipt_index: receiptIndex,
          implementation_started_sequence: state.first_mutation_sequence,
        });
        const decision = evaluateContextSufficiency({
          decision_id: typedId(internals, "CTXDEC", "context-decision"),
          session_key: state.session_key,
          strategy_binding: state.context_strategy,
          dossier: state.dossier,
          workspace_fingerprint: state.initial_workspace.source_fingerprint,
          receipt_index: receiptIndex,
          report: candidate,
          task_profile_evidence: state.context_task_profile_evidence,
          implementation_started_sequence: state.first_mutation_sequence,
          read_only_subagents_used: state.context_read_only_subagent_ids.length,
          evaluated_at: internals.clock(),
        });
        if (decision.status !== "sufficient") {
          state.context_report = candidate;
          state.context_decision = decision;
          state.reviewer_reconciliation_evidence = null;
          state.context_reconciliation = null;
          return deepFrozenClone({ report: state.context_report, decision }, "insufficient recoverable context report finalization receipt");
        }
        state.context_report = candidate;
        state.context_decision = decision;
        state.reviewer_reconciliation_evidence = null;
        state.context_reconciliation = null;
        return deepFrozenClone({ report: state.context_report, decision }, "normal-session context report finalization receipt");
      } else if (state.context_report.revision !== request.expected_revision) {
        throw new ContractError("CONTEXT_REPORT_REVISION_CONFLICT", "context report expected_revision is stale");
      } else if (state.context_decision !== null) {
        try {
          assertCurrentContextDecision(internals, state);
          return deepFrozenClone({ report: state.context_report, decision: state.context_decision }, "idempotent context report finalization receipt");
        } catch (error) {
          if (!(error instanceof ContractError) || !["CONTEXT_EVIDENCE_STALE", "CONTEXT_SUFFICIENCY_REQUIRED"].includes(error.code)) throw error;
        }
      }
      const decision = recomputeCurrentContextDecision(internals, state);
      state.reviewer_reconciliation_evidence = null;
      state.context_reconciliation = null;
      return deepFrozenClone({ report: state.context_report, decision }, "normal-session context report finalization receipt");
    });
  }
  if (toolId === "quality_dossier_update") {
    exact(request, ["expected_revision", "patch"], ["expected_revision", "patch"], "quality dossier update request");
    assertPlain(request.patch, "quality dossier update request.patch");
    rejectRunnerFields(request.patch, PATCH_RUNNER_FIELDS, "quality dossier update request.patch");
    return mutateOwnerState(internals, sessionId, (state, link) => {
      if (state.lifecycle !== "dossier_draft") throw new ContractError("QUALITY_DOSSIER_FINALIZED", "quality dossier is not editable");
      if (state.dossier.revision !== request.expected_revision) {
        throw new ContractError("QUALITY_DOSSIER_REVISION_CONFLICT", "quality dossier update expected_revision is stale");
      }
      if (state.dossier.risk_class === "standard-lite") {
        throw new ContractError("QUALITY_SESSION_CLASSIFICATION_MISMATCH", "runner-synthesized standard-lite dossier state is immutable");
      }
      if (request.patch.verification_boundary) {
        const proposed = request.patch.verification_boundary.ownership_paths ?? state.dossier.verification_boundary.ownership_paths;
        const current = state.dossier.verification_boundary.ownership_paths;
        if (!exactSameStrings([...proposed].sort(), [...current].sort())) {
          throw new ContractError("QUALITY_OWNERSHIP_IMMUTABLE", "dossier ownership cannot change after session creation");
        }
      }
      const updatedAt = internals.clock();
      invalidatePlanChallenges(state, { updatedAt, dossierPatch: request.patch });
      const updated = state.dossier;
      assertClassificationMatchesDossier(registration, updated, updated.verification_boundary.ownership_paths);
      state.context_report = createWholeSystemContextReportDraft({
        report_id: typedId(internals, "CONTEXT", "context-report"),
        session_key: state.session_key,
        strategy_binding: state.context_strategy,
        workspace_fingerprint: state.initial_workspace.source_fingerprint,
        dossier: updated,
        created_at: updatedAt,
      });
      state.standard_lite_context_summary = null;
      state.context_task_profile_evidence = null;
      state.preimplementation_check_receipts = [];
      state.context_decision = null;
      state.reviewer_reconciliation_evidence = null;
      state.context_reconciliation = null;
      state.post_architecture_evidence = null;
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
    return mutateOwnerState(internals, sessionId, (state, link) => {
      if (state.lifecycle !== "dossier_draft" || state.dossier.revision !== request.expected_revision) {
        throw new ContractError("QUALITY_DOSSIER_REVISION_CONFLICT", "plan challenge expected_revision is stale");
      }
      if (state.dossier.status !== "draft") {
        throw new ContractError("QUALITY_DOSSIER_FINALIZED", "formal plan challenge requires a draft Dossier");
      }
      const full = ["high", "critical"].includes(state.dossier.risk_class);
      if (full && (state.context_report?.status !== "finalized" || state.context_decision?.status !== "sufficient")) {
        throw new ContractError(
          "QUALITY_PLAN_CHALLENGE_BEFORE_CONTEXT_SUFFICIENCY",
          "formal plan challenge evidence requires a finalized current report and runner-owned sufficient context decision",
        );
      }
      if (full) {
        try {
          assertCurrentContextDecision(internals, state);
        } catch (error) {
          if (!(error instanceof ContractError)) throw error;
          throw new ContractError(
            "QUALITY_PLAN_CHALLENGE_BEFORE_CONTEXT_SUFFICIENCY",
            "formal plan challenge evidence requires a finalized current report and runner-owned sufficient context decision",
          );
        }
      }
      if (state.pending_context_calls.length > 0
        || state.pending_mutations.length > 0 || state.first_mutation_at !== null) {
        throw new ContractError("QUALITY_SESSION_INCOMPLETE", "formal plan challenge requires settled context, child tasks, mutations, and preimplementation state");
      }
      if (contributionFor(state, context.agent)) {
        throw new ContractError("QUALITY_PLAN_CHALLENGE_DUPLICATE", `${context.agent} contribution already exists`);
      }
      const completedAt = internals.clock();
      if (link !== null) {
        const launch = state.active_task_launch;
        if (launch?.phase !== "child_active"
          || launch.kind !== "read_only"
          || launch.target_agent !== context.agent
          || launch.child_session_key !== link.session_key
          || launch.launch_id !== link.launch_id
          || launch.pending_challenge_proposal !== null) {
          throw new ContractError("QUALITY_CHILD_LINK_STALE", "plan challenge proposal does not bind one active role-matched child launch");
        }
        launch.pending_challenge_proposal = createPendingChallengeProposal(
          state,
          launch,
          context.agent,
          blockers,
          request.expected_revision,
          completedAt,
        );
        refreshBoundFingerprint(launch);
        return {
          result_id: null,
          role: context.agent,
          dossier_revision: state.dossier.revision,
          blocking: blockers.some((entry) => ["high", "medium"].includes(entry.severity) && entry.status === "unresolved"),
          status: "pending_parent_settlement",
        };
      }
      if (state.active_task_launch !== null) {
        throw new ContractError("QUALITY_SESSION_INCOMPLETE", "direct plan challenge contribution requires no active child task");
      }
      return commitPlanChallengeContribution(internals, state, {
        role: context.agent,
        blockers,
        expectedRevision: request.expected_revision,
        completedAt,
      });
    });
  }
  if (toolId === "quality_dossier_finalize") {
    exact(request, ["expected_revision"], ["expected_revision"], "quality dossier finalization request");
    if (["implementation_enabled", "gate_blocked"].includes(resolved.owner.lifecycle)
      && resolved.owner.dossier.revision === request.expected_revision && resolved.owner.gate !== null) {
      return inspectReceipt(resolved.owner, internals.catalog);
    }
    if (resolved.owner.lifecycle === "dossier_draft"
      && resolved.owner.dossier.risk_class === "standard-lite"
      && resolved.owner.dossier.revision === request.expected_revision) {
      mutateOwnerState(internals, sessionId, (state) => {
        if (state.first_mutation_at !== null) {
          throw new ContractError("CONTEXT_FINALIZED_AFTER_MUTATION", "standard-lite context cannot first establish sufficiency after implementation starts");
        }
        stateWorkspaceMatches(internals, state);
        const taskProfileEvaluatedAt = internals.clock();
        const profiled = createRunnerContextTaskProfileEvidence(
          internals,
          state,
          taskProfileEvaluatedAt,
        );
        state.context_task_profile_evidence = profiled.evidence;
        state.preimplementation_check_receipts = [...profiled.checkExecutionReceipts];
        recomputeCurrentContextDecision(internals, state, taskProfileEvaluatedAt);
      });
    }
    const receipt = mutateOwnerState(internals, sessionId, (state) => {
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
      if (["high", "critical"].includes(state.dossier.risk_class)) {
        const subject = challengeSubject(state);
        if (state.contributions.some((entry) => entry.subject_fingerprint !== subject.fingerprint
          || entry.context_decision_fingerprint !== subject.context_decision_fingerprint
          || entry.context_task_profile_evidence_fingerprint !== subject.context_task_profile_evidence_fingerprint)) {
          throw new ContractError("QUALITY_PLAN_CHALLENGE_STALE", "architect or reviewer evidence does not bind the current dossier plan");
        }
      }
      assertCurrentContextDecision(internals, state);
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
      requiredPostArchitectureCheck(internals, {
        dossier: finalized,
        architecture_configuration: state.architecture_configuration,
      });
      const verificationTargets = requiredEngineeringVerificationTargets(finalized);
      if (verificationTargets.liveCheckIds.length > 0) {
        throw new ContractError(
          "QUALITY_CHECK_PHASE",
          "normal-session project checks cannot execute live-phase obligations",
        );
      }
      if (verificationTargets.postMutationCheckIds.length === 0) {
        throw new ContractError("QUALITY_CHECK_PHASE_MAPPING", "quality session requires at least one post-mutation trusted check");
      }
      const challenge = createChallengeEvidence(internals, state, finalized, finalizedAt);
      const evidence = challenge.evidence;
      const gate = internals.evaluateGate({
        gate_id: internals.idFactory("gate"),
        dossier: finalized,
        check_catalog: internals.catalog,
        preimplementation_evidence: evidence,
        architecture_evaluation: architectureEvaluation,
        context_strategy_binding: state.context_strategy,
        context_report: state.context_report,
        context_decision: state.context_decision,
        context_task_profile_evidence: state.context_task_profile_evidence,
        evaluated_at: finalizedAt,
      });
      validateEngineeringGateDecision(gate);
      state.dossier = finalized;
      state.gate = gate;
      state.preimplementation_evidence = evidence;
      state.preimplementation_check_receipts = [...challenge.checkExecutionReceipts];
      state.architecture_evaluation = architectureEvaluation;
      state.lifecycle = gate.status === "passed" ? "implementation_enabled" : "gate_blocked";
      state.capabilities = [];
      state.post_architecture_evidence = null;
      state.verification = null;
      return inspectReceipt(state, internals.catalog);
    });
    internals.failureInjector("after_owner_gate", { session_id: sessionId });
    transitionQualitySession(internals.registry, sessionId, receipt.gate_status === "passed" ? "implementation_enabled" : "gate_blocked");
    return receipt;
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
    let reopenedVerifiedSession = false;
    const capability = mutateOwnerState(internals, sessionId, (state) => {
      if (!["implementation_enabled", "verified"].includes(state.lifecycle) || state.gate?.status !== "passed") {
        throw new ContractError("QUALITY_PRE_GATE_VIOLATION", "mutation authorization requires a runner-owned passed gate");
      }
      if (state.dossier.revision !== request.expected_revision) {
        throw new ContractError("QUALITY_DOSSIER_REVISION_CONFLICT", "action authorization expected_revision is stale");
      }
      if (state.pending_mutations.length > 0 || state.active_task_launch !== null || state.incomplete_reasons.length > 0) {
        throw new ContractError("QUALITY_SESSION_INCOMPLETE", "quality session has unresolved mutation or runtime evidence");
      }
      if (state.capabilities.some((entry) => entry.consumed === false)) {
        throw new ContractError("QUALITY_CAPABILITY_OUTSTANDING", "quality session already has an outstanding one-shot capability");
      }
      assertCurrentContextDecision(internals, state);
      stateWorkspaceMatches(internals, state);
      if (state.lifecycle === "verified") {
        reopenedVerifiedSession = true;
        state.lifecycle = "implementation_enabled";
        state.post_architecture_evidence = null;
        state.verification = null;
      }
      const ownership = state.dossier.verification_boundary.ownership_paths;
      for (const file of paths) {
        if (!withinOwnership(file, ownership)) {
          throw new ContractError("QUALITY_WRITE_SCOPE_VIOLATION", `action exceeds dossier ownership: ${file}`);
        }
        if (state.architecture_configuration.status === "configured" && samePolicyPath(file, state.architecture_configuration.path)) {
          throw new ContractError("QUALITY_ARCHITECTURE_POLICY_IMMUTABLE", "the configured architecture policy cannot change during its bound quality session");
        }
      }
      authorizeStandardLitePaths(internals, state, paths);
      state.capabilities = state.capabilities.filter((entry) => entry.consumed !== true);
      const capabilitySource = {
        capability_id: internals.idFactory("capability"),
        kind: request.kind,
        target_agent: request.target_agent ?? null,
        paths: [...paths],
        command: null,
        command_fingerprint: null,
        expected_effect: null,
        timeout_ms: null,
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
    if (reopenedVerifiedSession) transitionQualitySessionByKey(internals.registry, resolved.ownerKey, "implementation_enabled", "QUALITY_VERIFICATION_STALE");
    return capability;
  }
  if (toolId === "quality_command_authorize") {
    throw new ContractError(
      "QUALITY_NATIVE_BASH_DISABLED",
      "native Bash cannot prove descendant process teardown; use runner-owned project checks and bounded edit/task capabilities",
    );
  }
  if (toolId === "quality_verification_record") {
    exact(request, ["expected_revision"], ["expected_revision"], "quality verification request");
    if (resolved.owner.lifecycle === "verified" && resolved.owner.dossier.revision === request.expected_revision
      && resolved.owner.verification?.complete === true) {
      return deepFrozenClone(resolved.owner.verification, "idempotent normal-session trusted verification receipt");
    }
    const receipt = mutateOwnerState(internals, sessionId, (state, link) => {
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
      for (const { checkId: targetId, phase } of targets.postMutationCheckTargets) {
        const result = internals.runTrustedTarget({
          kind: "check",
          targetId,
          phase,
          dossier: state.dossier,
          workspaceRoot: internals.workspaceRoot,
          expectedSourceWorkspaceFingerprint: workspace.source_fingerprint,
          workspaceOwnershipPaths: stateWorkspaceOwnershipPaths(state),
          workspaceGeneratedOutputPaths: internals.projectGeneratedOutputPaths,
          workspaceObservationSalt: state.workspace_salt,
          workspaceObserver: (_root, _salt, options = {}) => observeStateWorkspace(
            internals,
            state,
            [],
            options.generatedOutputPaths ?? [],
          ),
          sessionKey: state.session_key,
        });
        receipts.push(normalizeCheckExecutionReceipt(internals, result, {
          checkId: targetId,
          phase,
          workspace,
        }));
      }
      for (const targetId of targets.mechanismIds) {
        let status = "blocked";
        if (targetId === "normal-architect-challenge") status = contributionFor(state, "architect")?.blocking ? "blocked" : contributionFor(state, "architect") ? "passed" : "blocked";
        else if (targetId === "normal-reviewer-challenge") status = contributionFor(state, "reviewer")?.blocking ? "blocked" : contributionFor(state, "reviewer") ? "passed" : "blocked";
        else status = internals.runTrustedTarget({
          kind: "mechanism",
          targetId,
          phase: "integration",
          dossier: state.dossier,
          workspaceRoot: internals.workspaceRoot,
          expectedSourceWorkspaceFingerprint: workspace.source_fingerprint,
          workspaceOwnershipPaths: stateWorkspaceOwnershipPaths(state),
          workspaceGeneratedOutputPaths: internals.projectGeneratedOutputPaths,
          workspaceObservationSalt: state.workspace_salt,
          workspaceObserver: (_root, _salt, options = {}) => observeStateWorkspace(
            internals,
            state,
            [],
            options.generatedOutputPaths ?? [],
          ),
          sessionKey: state.session_key,
        }).status;
        receipts.push({ kind: "mechanism", target_id: targetId, status, command_id: null, exit_code: null });
      }
      assertCurrentArchitectureConfiguration(internals, state);
      workspace = stateWorkspaceMatches(internals, state);
      const completedAt = internals.clock();
      let postArchitectureEvidence = null;
      if (postEditArchitectureRequired(state)) {
        const architectureCheck = requiredPostArchitectureCheck(internals, state);
        const architectureReceipt = receipts.find((entry) => (
          entry.kind === "check" && entry.check_id === architectureCheck.check_id
          && entry.phase === "integration"
        )) ?? null;
        postArchitectureEvidence = createPostArchitectureEvidenceFromReceipt(
          internals,
          state,
          architectureReceipt,
          completedAt,
          internals.idFactory("post-architecture"),
        );
      }
      state.post_architecture_evidence = postArchitectureEvidence;
      const complete = receipts.length === targets.postMutationCheckTargets.length + targets.mechanismIds.length
        && receipts.every((entry) => entry.status === "passed")
        && (!postEditArchitectureRequired(state)
          || postArchitectureEvidence?.architecture_evaluation.status === "passed");
      const source = {
        verification_id: internals.idFactory("verification"),
        dossier_revision: state.dossier.revision,
        gate_fingerprint: state.gate.fingerprint,
        mutation_revision: state.mutation_revision,
        workspace_fingerprint: workspace.source_fingerprint,
        target_check_ids: [...targets.postMutationCheckIds],
        target_mechanism_ids: [...targets.mechanismIds],
        receipts,
        post_architecture_evidence_fingerprint: postArchitectureEvidence?.fingerprint ?? null,
        complete,
        completed_at: completedAt,
      };
      state.verification = { ...source, fingerprint: fingerprint(source) };
      if (complete) state.lifecycle = "verified";
      return deepFrozenClone(state.verification, "normal-session trusted verification receipt");
    });
    if (receipt.complete) {
      internals.failureInjector("after_owner_verification", { session_id: sessionId });
      transitionQualitySessionByKey(internals.registry, resolved.ownerKey, "verified");
    }
    return receipt;
  }
  if (toolId === "quality_context_reviewer_record") {
    const factKeys = [
      "changed_paths", "unexpected_public_contracts", "unexpected_dependency_directions",
      "unexpected_side_effect_edges", "unrelated_paths", "unplanned_items", "checks",
    ];
    exact(request, factKeys, factKeys, "quality context reviewer request");
    return mutateOwnerState(internals, sessionId, (state, link) => {
      if (state.lifecycle !== "verified" || state.gate?.status !== "passed" || state.verification?.complete !== true) {
        throw new ContractError("CONTEXT_RECONCILIATION_ORDER", "final context review must follow trusted verification of the final workspace");
      }
      const activeReviewerChild = link?.authorized_agent === "reviewer"
        && state.active_task_launch?.target_agent === "reviewer"
        && state.active_task_launch?.child_session_key === link.session_key;
      if (state.pending_mutations.length > 0 || (state.active_task_launch !== null && !activeReviewerChild)) {
        throw new ContractError("QUALITY_SESSION_INCOMPLETE", "final context review requires settled implementation work");
      }
      assertCurrentContextDecision(internals, state);
      const workspace = stateWorkspaceMatches(internals, state);
      assertReconciliationChangedPaths(state, request.changed_paths);
      const completedAt = internals.clock();
      const preview = reconcileFinalBlastRadius({
        reconciliation_id: typedId(internals, "CTXREC", "context-reconciliation-preview"),
        session_key: state.session_key,
        context_decision: state.context_decision,
        dossier: state.dossier,
        context_report: state.context_report,
        final_workspace_fingerprint: workspace.source_fingerprint,
        changed_paths: request.changed_paths,
        unexpected_public_contracts: request.unexpected_public_contracts,
        unexpected_dependency_directions: request.unexpected_dependency_directions,
        unexpected_side_effect_edges: request.unexpected_side_effect_edges,
        unrelated_paths: request.unrelated_paths,
        unplanned_items: request.unplanned_items,
        verified_post_mutation_test_obligation_ids: verifiedPostMutationTestObligationIds(state),
        evidence_mode: "reviewer_grounded",
        reviewer_evidence: null,
        reconciled_at: completedAt,
      });
      state.reviewer_reconciliation_evidence = createReviewerReconciliationEvidence({
        reviewer_result_id: internals.idFactory("context-reviewer-result"),
        session_key: state.session_key,
        context_decision: state.context_decision,
        final_workspace_fingerprint: workspace.source_fingerprint,
        final_diff_fingerprint: preview.final_diff_fingerprint,
        changed_paths: request.changed_paths,
        checks: request.checks,
        unplanned_item_ids: request.unplanned_items.map((entry) => entry.id),
        completed_at: completedAt,
      });
      state.context_reconciliation = null;
      state.attestation = null;
      return deepFrozenClone(state.reviewer_reconciliation_evidence, "normal-session reviewer reconciliation evidence");
    });
  }
  if (toolId === "quality_context_reconcile") {
    const factKeys = [
      "evidence_mode", "changed_paths", "unexpected_public_contracts", "unexpected_dependency_directions",
      "unexpected_side_effect_edges", "unrelated_paths", "unplanned_items",
    ];
    exact(request, factKeys, factKeys, "quality context reconciliation request");
    if (!["extractor_grounded", "reviewer_grounded"].includes(request.evidence_mode)) {
      throw new ContractError("CONTEXT_RECONCILIATION_EVIDENCE_MODE", "unsupported context reconciliation evidence mode");
    }
    return mutateOwnerState(internals, sessionId, (state) => {
      if (state.lifecycle !== "verified" || state.gate?.status !== "passed" || state.verification?.complete !== true) {
        throw new ContractError("CONTEXT_RECONCILIATION_ORDER", "context reconciliation must follow trusted verification of the final workspace");
      }
      if (state.pending_mutations.length > 0 || state.active_task_launch !== null) {
        throw new ContractError("QUALITY_SESSION_INCOMPLETE", "context reconciliation requires settled implementation work");
      }
      assertCurrentContextDecision(internals, state);
      const workspace = stateWorkspaceMatches(internals, state);
      assertReconciliationChangedPaths(state, request.changed_paths);
      state.context_reconciliation = reconcileFinalBlastRadius({
        reconciliation_id: typedId(internals, "CTXREC", "context-reconciliation"),
        session_key: state.session_key,
        context_decision: state.context_decision,
        dossier: state.dossier,
        context_report: state.context_report,
        final_workspace_fingerprint: workspace.source_fingerprint,
        changed_paths: request.changed_paths,
        unexpected_public_contracts: request.unexpected_public_contracts,
        unexpected_dependency_directions: request.unexpected_dependency_directions,
        unexpected_side_effect_edges: request.unexpected_side_effect_edges,
        unrelated_paths: request.unrelated_paths,
        unplanned_items: request.unplanned_items,
        verified_post_mutation_test_obligation_ids: verifiedPostMutationTestObligationIds(state),
        evidence_mode: request.evidence_mode,
        post_architecture_evidence: request.evidence_mode === "extractor_grounded" ? state.post_architecture_evidence : null,
        reviewer_evidence: request.evidence_mode === "reviewer_grounded" ? state.reviewer_reconciliation_evidence : null,
        reconciled_at: internals.clock(),
      });
      state.attestation = null;
      return deepFrozenClone(state.context_reconciliation, "normal-session context reconciliation");
    });
  }
  if (toolId === "quality_session_finalize") {
    exact(request, ["expected_revision"], ["expected_revision"], "quality session finalization request");
    if (resolved.owner.lifecycle === "attested" && resolved.owner.dossier.revision === request.expected_revision
      && resolved.owner.attestation !== null) {
      return deepFrozenClone(resolved.owner.attestation, "idempotent normal-session quality attestation");
    }
    const attestation = mutateOwnerState(internals, sessionId, (state) => {
      if (state.lifecycle !== "verified" || state.dossier?.revision !== request.expected_revision || state.gate?.status !== "passed") {
        throw new ContractError("QUALITY_SESSION_FINALIZE", "quality session finalization requires the current passed gate");
      }
      if (state.pending_mutations.length > 0 || state.active_task_launch !== null || state.incomplete_reasons.length > 0
        || state.capabilities.some((entry) => !entry.consumed) || state.verification?.complete !== true) {
        throw new ContractError("QUALITY_SESSION_INCOMPLETE", "quality session has incomplete mandatory verification or mutation evidence");
      }
      let workspace = stateWorkspaceMatches(internals, state);
      assertCurrentArchitectureConfiguration(internals, state);
      workspace = stateWorkspaceMatches(internals, state);
      if (state.verification.workspace_fingerprint !== workspace.source_fingerprint
        || state.verification.mutation_revision !== state.mutation_revision) {
        throw new ContractError("QUALITY_VERIFICATION_STALE", "trusted verification does not bind the final workspace");
      }
      assertCurrentPostArchitectureEvidence(internals, state);
      assertCurrentContextDecision(internals, state);
      if (state.context_reconciliation === null) {
        throw new ContractError("CONTEXT_RECONCILIATION_REQUIRED", "quality attestation requires final blast-radius reconciliation");
      }
      assertContextReconciliationCurrent(state.context_reconciliation, {
        context_decision: state.context_decision,
        final_workspace_fingerprint: workspace.source_fingerprint,
      });
      const attestedAt = internals.clock();
      const source = {
        schema_version: 3,
        run_id: state.run_id,
        task_id: state.task_id,
        dossier_id: state.dossier.dossier_id,
        dossier_fingerprint: state.dossier.fingerprint,
        gate_fingerprint: state.gate.fingerprint,
        verification_fingerprint: state.verification.fingerprint,
        post_architecture_evidence_fingerprint: state.post_architecture_evidence?.fingerprint ?? null,
        context_reconciliation_fingerprint: state.context_reconciliation.fingerprint,
        final_workspace_fingerprint: workspace.source_fingerprint,
        mutation_revision: state.mutation_revision,
        attested_at: attestedAt,
      };
      state.attestation = { ...source, fingerprint: fingerprint(source) };
      state.lifecycle = "attested";
      return deepFrozenClone(state.attestation, "normal-session quality attestation");
    });
    internals.failureInjector("after_owner_attestation", { session_id: sessionId });
    transitionQualitySession(internals.registry, sessionId, "attested");
    return attestation;
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
  if (input.tool === "bash") {
    exact(output.args, ["command", "timeout", "description", "workdir"], ["command"], "native bash arguments");
    assertString(output.args.command, "native bash command", { maxBytes: 16000 });
    if (output.args.command.length === 0 || output.args.command.includes("\0")) {
      throw new ContractError("QUALITY_COMMAND_BOUNDED", "native bash command must be bounded and contain no NUL");
    }
    if (Object.hasOwn(output.args, "timeout") && output.args.timeout !== undefined) {
      assertInteger(output.args.timeout, "native bash timeout", { min: 1, max: 600000 });
    }
    if (Object.hasOwn(output.args, "description") && output.args.description !== undefined) {
      assertString(output.args.description, "native bash description", { maxBytes: 2000 });
    }
    if (Object.hasOwn(output.args, "workdir") && output.args.workdir !== undefined) {
      assertString(output.args.workdir, "native bash workdir", { maxBytes: 1000 });
      const resolved = fs.realpathSync(path.resolve(internals.workspaceRoot, output.args.workdir));
      if (resolved !== internals.workspaceRoot) throw new ContractError("QUALITY_COMMAND_CWD", "native bash command must execute at the bound worktree root");
    }
    return { paths: [], targetAgent: null, command: output.args.command, timeout: output.args.timeout ?? null };
  }
  throw new ContractError("QUALITY_NATIVE_TOOL_UNSUPPORTED", `unsupported native tool: ${input.tool}`);
}

function recordObservedCall(state, { callId, sessionKey: callSessionKey, toolId, paths, targetAgent, commandFingerprint = null }) {
  if (state.observed_calls.some((entry) => entry.call_id === callId && entry.session_key === callSessionKey)) {
    throw new ContractError("QUALITY_CALL_REPLAY", "native tool call ID was replayed");
  }
  const source = {
    call_id: callId,
    session_key: callSessionKey,
    tool_id: toolId,
    paths: [...paths],
    target_agent: targetAgent,
    command_fingerprint: commandFingerprint,
  };
  state.observed_calls.push({ ...source, fingerprint: fingerprint(source) });
  pruneObservedCalls(state);
}

function observedCallIsReferenced(state, observed) {
  const capabilityReference = state.capabilities.some((entry) => entry.consumed
    && entry.bound_call_id === observed.call_id
    && observed.session_key === state.session_key
    && (entry.kind === "task" ? observed.tool_id === "task"
      : entry.kind === "command" ? observed.tool_id === "bash" : ["edit", "write", "apply_patch"].includes(observed.tool_id)));
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

function markImplementationStarted(internals, state) {
  if (state.first_mutation_at === null) {
    const receiptIndex = internals.contextReceiptStore.inspectSession(state.session_key);
    state.first_mutation_at = internals.clock();
    state.first_mutation_sequence = (receiptIndex.last_sequence ?? 0) + 1;
  }
  state.reviewer_reconciliation_evidence = null;
  state.context_reconciliation = null;
  state.attestation = null;
}

function consumeCapability(internals, state, { kind, targetAgent = null, paths, command = null, callId, callSessionKey, toolId }) {
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
    && (kind !== "command" || entry.command === command)
  ));
  if (!capability) throw new ContractError("QUALITY_CAPABILITY_MISSING", "no exact one-shot quality capability matches the mutation");
  capability.consumed = true;
  capability.bound_call_id = callId;
  refreshBoundFingerprint(capability);
  if (kind !== "command") markImplementationStarted(internals, state);
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
  state.post_architecture_evidence = null;
  state.verification = null;
  state.attestation = null;
  return capability;
}

export function bindArchitectureEvaluatorImplementationFingerprint(evaluator, transitiveImplementationFingerprint) {
  if (typeof evaluator !== "function") {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_IDENTITY", "architecture evaluator must be callable");
  }
  assertFingerprint(
    transitiveImplementationFingerprint,
    "architecture evaluator transitive implementation fingerprint",
  );
  return fingerprint({
    producer: NORMAL_SESSION_BRIDGE_PRODUCER,
    algorithm_ids: ARCHITECTURE_EVALUATOR_IDS,
    transitive_implementation_fingerprint: transitiveImplementationFingerprint,
    entrypoint_source: Function.prototype.toString.call(evaluator).replace(/\r\n?/gu, "\n"),
  });
}

export function createNormalSessionQualityBridge(options) {
  assertPlain(options, "normal-session quality bridge options");
  const workspaceRoot = fs.realpathSync(path.resolve(options.workspaceRoot));
  const harnessRoot = resolveHarnessRoot(workspaceRoot);
  const qualityRoot = resolveInside(harnessRoot, "quality");
  const sessionRoot = resolveInside(qualityRoot, "sessions");
  ensureConfinedDirectory(harnessRoot, sessionRoot);
  const contextStrategyCatalog = options.contextStrategyCatalog ?? loadContextStrategyCatalog();
  const contextReceiptStore = createContextReceiptStore({
    workspaceRoot,
    limits: options.contextReceiptStoreLimits ?? {},
  });
  const observeWorkspace = options.observeWorkspace ?? observeNormalSessionWorkspace;
  const clock = options.clock ?? (() => new Date().toISOString());
  const idFactory = options.idFactory ?? safeToken;
  const suppliedProjectCatalog = options.projectCatalog === undefined
    ? null
    : validateProjectCheckCatalog(options.projectCatalog);
  const loadedProjectCatalog = options.checkCatalog || suppliedProjectCatalog !== null
    ? null
    : loadProjectCheckCatalog(workspaceRoot);
  const catalog = options.checkCatalog ?? createEngineeringCheckCatalog(
    projectCatalogToEngineeringCatalog(loadedProjectCatalog.catalog, NORMAL_SESSION_BRIDGE_PRODUCER),
  );
  validateEngineeringCheckCatalog(catalog);
  const worktreeFingerprint = sha256(workspaceRoot.toLowerCase());
  const loadedArchitecture = loadArchitecturePolicy(workspaceRoot);
  const fallbackProjectCatalog = loadedProjectCatalog === null && suppliedProjectCatalog === null ? {
    catalog_id: catalog.catalog_id,
    ...(options.standardLitePolicy === undefined ? {} : {
      standard_lite_policy: deepFrozenClone(options.standardLitePolicy, "normal-session configured standard-lite policy"),
    }),
    checks: catalog.checks.map((entry) => ({
      check_id: entry.check_id,
      phases: [...entry.phases],
      purpose: "verification",
      generated_output_paths: [],
    })),
  } : null;
  const fallbackProjectCatalogFingerprint = fallbackProjectCatalog === null
    ? null
    : fingerprint(fallbackProjectCatalog);
  const boundProjectCatalog = loadedProjectCatalog?.catalog ?? suppliedProjectCatalog ?? fallbackProjectCatalog;
  const boundProjectCatalogFingerprint = loadedProjectCatalog?.fingerprint
    ?? (suppliedProjectCatalog === null ? fallbackProjectCatalogFingerprint : projectCheckCatalogFingerprint(suppliedProjectCatalog));
  const usesProductionProjectRunner = loadedProjectCatalog !== null && options.runTrustedTarget === undefined;
  let boundToolchainMapFingerprint = null;
  let hostToolchainConfigurationLease = options.hostToolchainConfigurationLease ?? null;
  if (usesProductionProjectRunner) {
    const loadedToolchains = loadTrustedToolchainMap(workspaceRoot);
    boundToolchainMapFingerprint = loadedToolchains.fingerprint;
    const mappingById = new Map(loadedToolchains.map.toolchains.map((entry) => [entry.executable_id, entry]));
    for (const check of boundProjectCatalog.checks) {
      const mapping = mappingById.get(check.executable_id);
      if (mapping === undefined) {
        throw new ContractError(
          "QUALITY_TOOLCHAIN_UNKNOWN",
          `trusted toolchain map has no executable ID ${check.executable_id}`,
        );
      }
      validateTrustedToolchainArguments(mapping.resolver, check.argv, `${check.check_id}.argv`);
    }
    const requiresHostConfiguration = [...new Set(boundProjectCatalog.checks.map(
      (check) => mappingById.get(check.executable_id).resolver,
    ))].some((family) => !["node", "npm"].includes(family));
    if (hostToolchainConfigurationLease !== null) {
      hostToolchainConfigurationLease = assertTrustedToolchainHostConfigurationLeaseCurrent(
        hostToolchainConfigurationLease,
      );
    } else if (options.hostToolchainAnchorUrl !== undefined) {
      hostToolchainConfigurationLease = loadTrustedToolchainHostConfigurationLease({
        anchorUrl: options.hostToolchainAnchorUrl,
        workspaceRoot,
        required: requiresHostConfiguration,
      });
    } else if (requiresHostConfiguration) {
      throw new ContractError(
        "QUALITY_TOOLCHAIN_HOST_CONFIG_REQUIRED",
        "non-Node trusted project checks require a fixed-source host toolchain configuration",
      );
    }
    const representativeByExecutable = new Map();
    for (const check of boundProjectCatalog.checks) {
      if (!representativeByExecutable.has(check.executable_id)) representativeByExecutable.set(check.executable_id, check);
    }
    for (const check of representativeByExecutable.values()) {
      const invocation = resolveTrustedToolchainInvocation({
        toolchainMap: loadedToolchains.map,
        executableId: check.executable_id,
        argv: check.argv,
        workspaceRoot,
        hostConfigurationLease: hostToolchainConfigurationLease,
      });
      assertTrustedToolchainInvocationCurrent(invocation);
    }
  }
  const projectGeneratedOutputPaths = [...new Set(
    boundProjectCatalog.checks.flatMap((entry) => entry.generated_output_paths ?? []),
  )].sort();
  for (const [index, candidate] of projectGeneratedOutputPaths.entries()) {
    if (projectGeneratedOutputPaths.some((other, otherIndex) => otherIndex !== index
      && (candidate.startsWith(`${other}/`) || other.startsWith(`${candidate}/`)))) {
      throw new ContractError("QUALITY_CHECK_OUTPUT_PATH_OVERLAP", "project check generated-output scopes must be globally disjoint");
    }
  }
  const projectCatalogLoader = options.projectCatalogLoader ?? (loadedProjectCatalog === null
    ? (() => ({
      catalog: boundProjectCatalog,
      fingerprint: boundProjectCatalogFingerprint,
    }))
    : (() => {
      const current = loadProjectCheckCatalog(workspaceRoot);
      if (current.fingerprint !== loadedProjectCatalog.fingerprint) {
        throw new ContractError("QUALITY_CHECK_CATALOG_DRIFT", "project check catalog changed after plugin initialization; restart the plugin before classifying a session");
      }
      return current;
    }));
  const registry = createQualitySessionRegistry({
    workspaceRoot,
    observeWorkspace,
    clock,
    idFactory,
    catalogLoader: projectCatalogLoader,
    affectedFileInspector: options.affectedFileInspector,
  });
  const targetRunner = options.runTrustedTarget ?? (loadedProjectCatalog === null
    ? defaultTrustedRunner
    : ({
      targetId,
      phase,
      expectedSourceWorkspaceFingerprint,
      workspaceOwnershipPaths,
      workspaceGeneratedOutputPaths,
      workspaceObservationSalt,
      workspaceObserver,
      sessionKey: ownerSessionKey,
    }) => {
      let currentCatalog;
      try {
        currentCatalog = loadProjectCheckCatalog(workspaceRoot);
      } catch {
        try { transitionQualitySessionByKey(registry, ownerSessionKey, "failed", "QUALITY_CHECK_CATALOG_DRIFT"); } catch { /* drift remains authoritative */ }
        throw new ContractError("QUALITY_CHECK_CATALOG_DRIFT", "trusted project check catalog is missing or malformed during the quality session");
      }
      if (currentCatalog.fingerprint !== loadedProjectCatalog.fingerprint) {
        try { transitionQualitySessionByKey(registry, ownerSessionKey, "failed", "QUALITY_CHECK_CATALOG_DRIFT"); } catch { /* drift remains authoritative */ }
        throw new ContractError("QUALITY_CHECK_CATALOG_DRIFT", "trusted project check catalog changed during the quality session");
      }
      const receipt = runTrustedProjectCheck({
        catalog: currentCatalog.catalog,
        checkId: targetId,
        phase,
        workspaceRoot,
        catalogFingerprint: currentCatalog.fingerprint,
        expectedToolchainMapFingerprint: boundToolchainMapFingerprint,
        expectedSourceWorkspaceFingerprint,
        workspaceOwnershipPaths,
        workspaceGeneratedOutputPaths,
        workspaceObservationSalt,
        observeWorkspace: workspaceObserver,
        hostConfigurationLease: hostToolchainConfigurationLease,
      });
      return trustedProjectCheckResult(receipt);
    });
  const configuredRunner = (input) => {
    const ownerSessionKey = input.sessionKey;
    recordQualityCheckBudgetByKey(registry, ownerSessionKey, { count: 1, receiptBytes: 0 });
    const activeGuard = createActiveExternalGuard(internals, {
      kind: "project_check",
      ownerKey: ownerSessionKey,
      callSessionKey: ownerSessionKey,
      callId: internals.idFactory(`project-check-${input.targetId}`),
    });
    let controlSnapshot;
    let result;
    let containmentUnverified = false;
    try {
      controlSnapshot = captureControlState(internals);
      result = targetRunner(input);
    } catch (error) {
      containmentUnverified = error instanceof ContractError && error.code === "QUALITY_CHECK_TEARDOWN_UNVERIFIED";
      throw error;
    } finally {
      let tampered = false;
      if (controlSnapshot && !controlStateMatches(internals, controlSnapshot)) {
        tampered = true;
        quarantineControlTamper(internals, ownerSessionKey, controlSnapshot, activeGuard);
      }
      if (containmentUnverified) {
        try { markActiveGuardContainmentUnverified(internals, activeGuard); } catch { /* the mirrored pending guard remains fail-closed */ }
      } else {
        try {
          removeActiveExternalGuard(internals, activeGuard);
        } catch {
          tampered = true;
          internals.quarantinedSessionKeys.add(ownerSessionKey);
        }
      }
      if (tampered) {
        throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "trusted project check changed runner-owned control state");
      }
    }
    recordQualityCheckBudgetByKey(registry, ownerSessionKey, {
      count: 0,
      receiptBytes: Buffer.byteLength(canonicalJson(result), "utf8"),
    });
    return result;
  };
  const architectureEvaluator = options.evaluateArchitecture ?? evaluateArchitecturePolicy;
  const transitiveArchitectureEvaluatorFingerprint = options.evaluateArchitecture === undefined
    ? ARCHITECTURE_EVALUATOR_IMPLEMENTATION_FINGERPRINT
    : options.architectureEvaluatorImplementationFingerprint;
  if (options.evaluateArchitecture !== undefined
    && transitiveArchitectureEvaluatorFingerprint === undefined) {
    throw new ContractError(
      "QUALITY_POST_ARCHITECTURE_IDENTITY",
      "custom architecture evaluator requires a trusted transitive implementation fingerprint",
    );
  }
  const internals = {
    workspaceRoot,
    harnessRoot,
    qualityRoot,
    sessionRoot,
    worktreeFingerprint,
    architectureConfiguration: loadedArchitecture.configuration,
    architecturePolicy: loadedArchitecture.policy,
    catalog,
    projectCatalog: boundProjectCatalog,
    projectGeneratedOutputPaths,
    projectCatalogFingerprint: options.projectCatalogLoader
      ? catalog.fingerprint
      : boundProjectCatalogFingerprint,
    contextStrategyCatalog,
    contextStrategyBindings: new Map(),
    contextReceiptStore,
    registry,
    observeWorkspace,
    runTrustedTarget: configuredRunner,
    evaluateGate: options.evaluateGate ?? evaluateEngineeringGate,
    evaluateArchitecture: architectureEvaluator,
    architectureEvaluatorFingerprint: bindArchitectureEvaluatorImplementationFingerprint(
      architectureEvaluator,
      transitiveArchitectureEvaluatorFingerprint,
    ),
    clock,
    idFactory,
    failureInjector: options.failureInjector ?? (() => {}),
    controlStateRestoreInjector: options.controlStateRestoreInjector ?? (() => {}),
    lockStaleMs: options.lockStaleMs ?? 5 * 60_000,
    commandGuards: new Map(),
    activeContextCalls: new Set(),
    quarantinedSessionKeys: new Set(),
  };
  const bridge = Object.freeze({ tool_ids: NORMAL_SESSION_QUALITY_TOOL_IDS });
  BRIDGE_INTERNALS.set(bridge, internals);
  return bridge;
}

function executeNormalSessionQualityToolInternal(bridge, toolId, args, context) {
  const internals = bridgeState(bridge);
  if (!NORMAL_SESSION_QUALITY_TOOL_IDS.includes(toolId)) throw new ContractError("QUALITY_TOOL_UNKNOWN", `unknown quality tool ID: ${toolId}`);
  exact(args, ["request"], ["request"], `${toolId} arguments`);
  if (!context || typeof context.sessionID !== "string" || typeof context.agent !== "string") {
    throw new ContractError("QUALITY_TOOL_CONTEXT", `${toolId} requires runner-provided session and agent identity`);
  }
  const request = parseRequest(args.request, `${toolId} request`);
  return executeOperation(internals, toolId, request, context);
}

export function executeNormalSessionQualityTool(bridge, toolId, args, context) {
  const internals = bridgeState(bridge);
  return withControlOperationLock(internals, () => executeNormalSessionQualityToolInternal(bridge, toolId, args, context));
}

function handleNormalSessionChatMessageInternal(bridge, input) {
  const internals = bridgeState(bridge);
  if (internals.commandGuards.size > 0) {
    throw new ContractError("QUALITY_COMMAND_SERIALIZATION", "chat registration is serialized while an authorized command is running");
  }
  if (!input || typeof input.sessionID !== "string") {
    throw new ContractError("QUALITY_CHAT_MESSAGE_CONTEXT", "chat.message hook lacks a session ID");
  }
  return registerQualityChatSession(internals.registry, {
    sessionID: input.sessionID,
    ...(typeof input.agent === "string" ? { agent: input.agent } : {}),
  });
}

export function handleNormalSessionChatMessage(bridge, input) {
  const internals = bridgeState(bridge);
  return withControlOperationLock(internals, () => handleNormalSessionChatMessageInternal(bridge, input));
}

export function inspectNormalSessionRegistration(bridge, sessionId, options = {}) {
  const internals = bridgeState(bridge);
  return inspectQualitySessionRegistration(internals.registry, sessionId, options);
}

function addIncompleteReason(state, reason) {
  if (!state.incomplete_reasons.includes(reason)) state.incomplete_reasons.push(reason);
}

function assertReconciliationChangedPaths(state, changedPaths) {
  const observed = diffContentBoundWorkspaces(state.initial_workspace, state.last_workspace)
    .sort();
  const claimed = changedPaths.map((entry) => entry.path).sort();
  if (!exactSameStrings(observed, claimed)) {
    throw new ContractError("CONTEXT_RECONCILIATION_FINAL_WORKSPACE_STALE", "changed path manifest does not exactly match the runner-observed workspace delta");
  }
}

function verifiedPostMutationTestObligationIds(state) {
  const passedTargets = new Set((state.verification?.receipts ?? [])
    .filter((entry) => entry.kind === "check"
      && entry.status === "passed"
      && ["slice", "integration"].includes(entry.phase))
    .map((entry) => `${entry.check_id}\0${entry.phase}`));
  return state.dossier.test_obligations
    .filter((entry) => entry.required
      && ["slice", "integration"].includes(entry.phase)
      && passedTargets.has(`${entry.check_id}\0${entry.phase}`))
    .map((entry) => entry.id)
    .sort();
}

function quarantineControlTamper(internals, ownerKey, snapshot, activeGuard) {
  internals.quarantinedSessionKeys.add(ownerKey);
  try {
    restoreControlState(internals, snapshot);
  } catch {
    try { markActiveGuardRestoreUnverified(internals, activeGuard); } catch { /* the remaining durable guard still fails closed */ }
    throw new ContractError("QUALITY_CONTROL_STATE_RESTORE_UNVERIFIED", "runner-owned control state could not be exactly restored");
  }
  try {
    mutateStateByKey(internals, ownerKey, (state) => {
      addIncompleteReason(state, "control_state_tamper");
      state.capabilities = [];
      state.pending_mutations = [];
      state.active_task_launch = null;
      state.post_architecture_evidence = null;
      state.verification = null;
      state.attestation = null;
    });
  } catch { /* restored or quarantined state remains fail-closed */ }
  try { transitionQualitySessionByKey(internals.registry, ownerKey, "failed", "QUALITY_CONTROL_STATE_TAMPER"); } catch { /* in-memory quarantine remains */ }
}

function commandGuardKey(callSessionKey, callId) {
  return `${callSessionKey}:${sha256(callId)}`;
}

function settleCommandControlGuard(internals, rawSessionId, callId) {
  const callSessionKey = sessionKey(rawSessionId);
  const key = commandGuardKey(callSessionKey, callId);
  const guard = internals.commandGuards.get(key);
  if (!guard) {
    if (readActiveExternalGuard(internals) !== null) {
      throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "durable command guard has no in-process reconciliation state");
    }
    return;
  }
  let tampered = false;
  if (!controlStateMatches(internals, guard.snapshot)) {
    tampered = true;
    quarantineControlTamper(internals, guard.owner_key, guard.snapshot, guard.active_guard);
  }
  try {
    removeActiveExternalGuard(internals, guard.active_guard);
  } catch {
    tampered = true;
    internals.quarantinedSessionKeys.add(guard.owner_key);
  }
  if (tampered) {
    internals.commandGuards.delete(key);
    throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "authorized command changed runner-owned control state");
  }
  internals.commandGuards.delete(key);
}

function assertMutationScope(state, paths, delegatedPaths = null) {
  const ownership = state.dossier.verification_boundary.ownership_paths;
  for (const file of paths) {
    if (!withinOwnership(file, ownership) || (delegatedPaths !== null && !withinOwnership(file, delegatedPaths))) {
      throw new ContractError("QUALITY_WRITE_SCOPE_VIOLATION", `native mutation exceeds its exact quality scope: ${file}`);
    }
    if (state.architecture_configuration.status === "configured" && samePolicyPath(file, state.architecture_configuration.path)) {
      throw new ContractError("QUALITY_ARCHITECTURE_POLICY_IMMUTABLE", "the configured architecture policy cannot change during its bound quality session");
    }
  }
}

function pathWithinPolicyPrefix(candidate, prefix) {
  const comparableCandidate = comparablePolicyPath(candidate);
  const comparablePrefix = comparablePolicyPath(prefix);
  return comparableCandidate === comparablePrefix || comparableCandidate.startsWith(`${comparablePrefix}/`);
}

function standardLitePathViolation(state, candidate) {
  if (state.dossier.risk_class !== "standard-lite") return null;
  const policy = state.standard_lite_policy;
  if (policy === null) return "standard-lite has no runner-owned project policy";
  if (!policy.allowed_ownership_prefixes.some((prefix) => pathWithinPolicyPrefix(candidate, prefix))) {
    return `standard-lite path is outside the project allowlist: ${candidate}`;
  }
  if (policy.protected_paths.some((protectedPath) => pathWithinPolicyPrefix(candidate, protectedPath))) {
    return `standard-lite path is protected by project policy: ${candidate}`;
  }
  if (candidate.split("/").some((component) => component.toLowerCase() === "migrations")) {
    return `standard-lite cannot mutate migration paths: ${candidate}`;
  }
  return null;
}

function proposedAffectedPaths(internals, paths) {
  return paths.filter((candidate) => {
    const target = path.resolve(internals.workspaceRoot, ...candidate.split("/"));
    try {
      return !fs.lstatSync(target).isDirectory();
    } catch (error) {
      if (error?.code === "ENOENT") return true;
      throw new ContractError("QUALITY_WORKSPACE_UNREADABLE", `standard-lite path cannot be inspected: ${candidate}`);
    }
  });
}

function authorizeStandardLitePaths(internals, state, paths) {
  if (state.dossier.risk_class !== "standard-lite") return;
  for (const candidate of paths) {
    const violation = standardLitePathViolation(state, candidate);
    if (violation !== null) throw new ContractError("QUALITY_RISK_ESCALATION_REQUIRED", violation);
  }
  const cumulative = new Set(state.cumulative_affected_paths);
  for (const candidate of proposedAffectedPaths(internals, paths)) cumulative.add(candidate);
  if (cumulative.size > 12) {
    throw new ContractError("QUALITY_STANDARD_LITE_SCOPE_EXCEEDED", "standard-lite cumulative affected path limit would be exceeded");
  }
  state.cumulative_affected_paths = [...cumulative].sort();
}

function reconcileStandardLiteActualPaths(state, paths) {
  if (state.dossier.risk_class !== "standard-lite") return null;
  const cumulative = new Set(state.cumulative_affected_paths);
  for (const candidate of paths) {
    const violation = standardLitePathViolation(state, candidate);
    if (violation !== null) return violation;
    cumulative.add(candidate);
    if (cumulative.size > 12) return `standard-lite actual mutation exceeded 12 cumulative affected paths: ${candidate}`;
  }
  state.cumulative_affected_paths = [...cumulative].sort();
  return null;
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
    pending_challenge_proposal: null,
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
  state.post_architecture_evidence = null;
  state.verification = null;
  state.attestation = null;
}

function assertNoActiveControlOperations(internals) {
  const entries = fs.readdirSync(internals.sessionRoot).filter((entry) => entry.endsWith(".json"));
  if (entries.length > MAX_SESSION_STATE_RECORDS) {
    throw new ContractError("QUALITY_STATE_LIMIT", "too many quality session records for bounded command serialization");
  }
  for (const entry of entries) {
    const key = entry.slice(0, -".json".length);
    const record = readStateByKey(internals, key, { required: false });
    if (record?.record_kind === OWNER_RECORD_KIND
      && (record.pending_mutations.length > 0 || record.active_task_launch !== null)) {
      throw new ContractError("QUALITY_COMMAND_SERIALIZATION", "authorized commands require all quality mutations and task launches to be settled");
    }
  }
}

function beginNormalSessionContextCall(internals, input, output) {
  if (typeof input.sessionID !== "string" || typeof input.callID !== "string") {
    throw new ContractError("CONTEXT_RECEIPT_CONTEXT", "context tool hook lacks session or call identity");
  }
  if (!output || typeof output !== "object") {
    throw new ContractError("CONTEXT_RECEIPT_CONTEXT", "context tool before hook lacks runner-provided arguments");
  }
  assertPlain(output.args, `${input.tool} arguments`);
  const resolved = resolveOwnerRecord(internals, input.sessionID, { required: false });
  if (resolved === null) {
    const registration = inspectQualitySessionRegistration(internals.registry, input.sessionID, { required: false });
    if (registration?.classification_revision !== null && ["high", "critical"].includes(registration.risk_class)) {
      throw new ContractError("CONTEXT_DOSSIER_REQUIRED", "high or critical context discovery requires the dossier and report draft first");
    }
    return null;
  }
  if (input.tool === "context_read") output.args.format = "json";
  const callSessionKey = sessionKey(input.sessionID);
  const callKey = contextCallKeyFingerprint(resolved.ownerKey, callSessionKey, input.callID, input.tool);
  assertQualitySessionCatalogCurrentByKey(internals.registry, resolved.ownerKey);
  const result = mutateStateByKey(internals, resolved.ownerKey, (state) => {
    if (["attested"].includes(state.lifecycle)) {
      throw new ContractError("QUALITY_SESSION_INCOMPLETE", "attested quality session cannot record new context evidence");
    }
    if (state.pending_context_calls.length > 0) {
      throw new ContractError("CONTEXT_RECEIPT_PENDING", "normal-session context calls are serialized for immutable receipt chaining");
    }
    if (state.pending_mutations.length > 0) {
      throw new ContractError("CONTEXT_RECEIPT_PENDING", "context collection cannot overlap a pending mutation");
    }
    const currentWorkspace = stateWorkspaceMatches(internals, state);
    const receiptIndex = internals.contextReceiptStore.inspectSession(state.session_key);
    if (receiptIndex.receipt_count >= state.context_strategy.budgets.max_context_calls) {
      throw new ContractError("CONTEXT_BUDGET_EXCEEDED", "selected context strategy call budget is exhausted");
    }
    if (!state.context_strategy.preferred_tools.includes(input.tool)
      && !state.context_strategy.fallback_tools.includes(input.tool)) {
      throw new ContractError("CONTEXT_STANDARD_LITE_OVERANALYSIS", `context tool ${input.tool} is outside the selected strategy`);
    }
    const pending = beginContextReceiptOperation({
      receipt_id: internals.idFactory("context-receipt"),
      sequence: (receiptIndex.last_sequence ?? 0) + 1,
      previous_receipt_fingerprint: receiptIndex.latest_receipt_fingerprint,
      session_key: state.session_key,
      parent_session_key: resolved.link === null ? null : state.session_key,
      producer_session_key: callSessionKey,
      producer_role: resolved.link === null ? "owner_session" : state.active_task_launch.target_agent,
      run_id: state.run_id,
      task_id: state.task_id,
      worktree_fingerprint: state.worktree_fingerprint,
      source_fingerprint: currentWorkspace.source_fingerprint,
      context_strategy_id: state.context_strategy.strategy_id,
      context_strategy_fingerprint: state.context_strategy.fingerprint,
      parent_question_id: null,
      evidence_refs: [],
      mutation_revision_started: state.mutation_revision,
      tool_id: input.tool,
      call_key_fingerprint: callKey,
      started_at: internals.clock(),
      args: output.args,
      fingerprint_salt: state.workspace_salt,
    });
    state.pending_context_calls.push(pending);
    return deepFrozenClone({ receipt_id: pending.receipt_id, sequence: pending.sequence }, "pending normal-session context call");
  });
  internals.activeContextCalls.add(callKey);
  return result;
}

function settleNormalSessionContextCall(internals, input, output, failure = null) {
  if (typeof input?.sessionID !== "string" || typeof input?.callID !== "string" || !CONTEXT_TOOLS.has(input?.tool)) return null;
  const resolved = resolveOwnerRecord(internals, input.sessionID, { required: false });
  if (resolved === null) return null;
  const callKey = contextCallKeyFingerprint(resolved.ownerKey, sessionKey(input.sessionID), input.callID, input.tool);
  try {
    return mutateStateByKey(internals, resolved.ownerKey, (state) => {
      const pending = state.pending_context_calls.find((entry) => entry.call_key_fingerprint === callKey && entry.tool_id === input.tool);
      if (!pending) return null;
      const observedAt = internals.clock();
      const completedAt = Date.parse(observedAt) >= Date.parse(pending.started_at)
        ? observedAt
        : new Date(Date.parse(pending.started_at) + 1).toISOString();
      let receipt;
      if (failure !== null) {
        receipt = failContextReceiptOperation(pending, {
          status: failure.status,
          reason_code: failure.reason_code,
          completed_at: completedAt,
          mutation_revision_completed: state.mutation_revision,
        });
      } else {
        try {
          receipt = completeContextReceiptOperation(pending, {
            output: output?.output,
            completed_at: completedAt,
            mutation_revision_completed: state.mutation_revision,
            fingerprint_salt: state.workspace_salt,
          });
        } catch {
          receipt = failContextReceiptOperation(pending, {
            status: "failed",
            reason_code: "invalid_output",
            completed_at: completedAt,
            mutation_revision_completed: state.mutation_revision,
          });
        }
      }
      const published = internals.contextReceiptStore.publishReceipt(receipt).receipt;
      attachPublishedContextReceipt(internals, state, pending, published);
      return deepFrozenClone(published, "normal-session context receipt");
    });
  } finally {
    internals.activeContextCalls.delete(callKey);
  }
}

function handleNormalSessionToolBeforeInternal(bridge, input, output) {
  const internals = bridgeState(bridge);
  if (CONTEXT_TOOLS.has(input?.tool)) return beginNormalSessionContextCall(internals, input, output);
  if (!NATIVE_MUTATION_TOOLS.has(input?.tool)) return;
  if (typeof input.sessionID !== "string" || typeof input.callID !== "string") {
    throw new ContractError("QUALITY_NATIVE_TOOL_CONTEXT", "native mutation hook lacks session or call identity");
  }
  if (internals.commandGuards.size > 0) {
    throw new ContractError("QUALITY_COMMAND_SERIALIZATION", "native tool calls are serialized while an authorized command is running");
  }
  const intent = parseNativeToolIntent(input, output, internals);
  const resolved = resolveOwnerRecord(internals, input.sessionID, { required: false });
  const registration = inspectQualitySessionRegistration(internals.registry, input.sessionID, { required: false });
  if (resolved === null) {
    if (registration === null) {
      throw new ContractError("QUALITY_SESSION_UNCLASSIFIED", "unknown session ID has no mutation authority");
    }
    if (registration.lifecycle === "failed" || registration.lifecycle === "attested") {
      throw new ContractError("QUALITY_SESSION_INCOMPLETE", "terminal quality session has no mutation authority");
    }
    if (input.tool === "task" && READ_ONLY_TASKS.has(intent.targetAgent)) return;
    if (!registration.primary_development_agent) {
      throw new ContractError("QUALITY_READ_ONLY_MUTATION", "read-only or review-only session cannot mutate the worktree");
    }
    if (registration.lifecycle === "unclassified") {
      throw new ContractError("QUALITY_SESSION_UNCLASSIFIED", "quality_session_start must precede mutation");
    }
    throw new ContractError("QUALITY_PRE_GATE_VIOLATION", "classified session cannot mutate before its runner-owned gate");
  }
  if (internals.quarantinedSessionKeys.has(resolved.ownerKey)) {
    throw new ContractError("QUALITY_CONTROL_STATE_TAMPER", "quality session is quarantined after control-state tampering");
  }
  const callSessionKey = sessionKey(input.sessionID);
  const ownerRegistration = assertQualitySessionCatalogCurrentByKey(internals.registry, resolved.ownerKey);
  if (["failed", "attested"].includes(ownerRegistration.lifecycle)) {
    throw new ContractError("QUALITY_SESSION_INCOMPLETE", "terminal quality session has no mutation authority");
  }
  if (input.tool === "bash") {
    throw new ContractError(
      "QUALITY_NATIVE_BASH_DISABLED",
      "native Bash cannot prove descendant process teardown; use runner-owned project checks",
    );
  }
  if (input.tool === "bash") assertNoActiveControlOperations(internals);
  if (resolved.link !== null) {
    if (input.tool === "task") throw new ContractError("QUALITY_CHILD_DELEGATION_DENIED", "quality-bound child sessions cannot delegate further tasks");
    if (input.tool === "bash") throw new ContractError("QUALITY_CHILD_DELEGATION_DENIED", "writable child bash requires an owner-session exact command capability");
    if (!resolved.link.writable || resolved.link.authorized_agent !== "general") {
      throw new ContractError("QUALITY_READ_ONLY_MUTATION", "read-only quality child cannot mutate the worktree");
    }
    return mutateStateByKey(internals, resolved.ownerKey, (state) => {
      assertContextOperationsSettled(state);
      const launch = state.active_task_launch;
      if (!launch || launch.phase !== "child_active" || launch.child_session_key !== callSessionKey || launch.kind !== "writable") {
        throw new ContractError("QUALITY_CHILD_LINK_STALE", "writable child is not bound to the active task launch");
      }
      if (state.lifecycle !== "implementation_enabled" || state.gate?.status !== "passed" || state.incomplete_reasons.length > 0 || state.pending_mutations.length > 0) {
        throw new ContractError("QUALITY_PRE_GATE_VIOLATION", "child mutation requires a complete passed quality gate");
      }
      assertCurrentContextDecision(internals, state);
      stateWorkspaceMatches(internals, state);
      assertMutationScope(state, intent.paths, launch.delegated_paths);
      authorizeStandardLitePaths(internals, state, intent.paths);
      recordObservedCall(state, { callId: input.callID, sessionKey: callSessionKey, toolId: input.tool, paths: intent.paths, targetAgent: null });
      createPendingMutation(internals, state, { input, callSessionKey, paths: intent.paths });
    });
  }
  const result = mutateStateByKey(internals, resolved.ownerKey, (state) => {
    assertContextOperationsSettled(state);
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
        assertCurrentContextDecision(internals, state);
        capability = consumeCapability(internals, state, {
          kind: "task",
          targetAgent: "general",
          paths: state.capabilities.find((entry) => entry.kind === "task" && entry.target_agent === "general" && entry.consumed === false)?.paths ?? [],
          callId: input.callID,
          callSessionKey,
          toolId: input.tool,
        });
      } else if (state.gate === null) {
        if (state.context_strategy.strategy_id === "standard-lite-local-v1") {
          throw new ContractError("CONTEXT_STANDARD_LITE_OVERANALYSIS", "standard-lite forbids preimplementation read-only subagent fan-out");
        }
        if (state.context_read_only_subagent_ids.length >= state.context_strategy.budgets.max_read_only_subagents) {
          throw new ContractError("CONTEXT_BUDGET_EXCEEDED", "selected context strategy read-only subagent budget is exhausted");
        }
        state.context_read_only_subagent_ids.push(input.callID);
      }
      recordObservedCall(state, { callId: input.callID, sessionKey: callSessionKey, toolId: input.tool, paths: capability?.paths ?? [], targetAgent: intent.targetAgent });
      state.active_task_launch = createTaskLaunch(internals, state, input, intent, capability);
      state.post_architecture_evidence = null;
      state.verification = null;
      state.attestation = null;
      return;
    }
    if (state.lifecycle !== "implementation_enabled" || state.gate?.status !== "passed" || state.incomplete_reasons.length > 0
      || state.pending_mutations.length > 0 || state.active_task_launch !== null) {
      throw new ContractError("QUALITY_PRE_GATE_VIOLATION", "native mutation requires a complete passed quality gate");
    }
    stateWorkspaceMatches(internals, state);
    assertCurrentContextDecision(internals, state);
    if (input.tool === "bash") {
      const capability = consumeCapability(internals, state, {
        kind: "command",
        paths: state.capabilities.find((entry) => entry.kind === "command" && entry.consumed === false
          && entry.command === intent.command)?.paths ?? [],
        command: intent.command,
        callId: input.callID,
        callSessionKey,
        toolId: input.tool,
      });
      if (intent.timeout !== null && intent.timeout > capability.timeout_ms) {
        throw new ContractError("QUALITY_COMMAND_TIMEOUT", "native bash timeout exceeds its one-shot authorization");
      }
      output.args.timeout = capability.timeout_ms;
      recordObservedCall(state, {
        callId: input.callID,
        sessionKey: callSessionKey,
        toolId: input.tool,
        paths: capability.paths,
        targetAgent: null,
        commandFingerprint: capability.command_fingerprint,
      });
      return;
    }
    assertMutationScope(state, intent.paths);
    authorizeStandardLitePaths(internals, state, intent.paths);
    recordObservedCall(state, { callId: input.callID, sessionKey: callSessionKey, toolId: input.tool, paths: intent.paths, targetAgent: null });
    consumeCapability(internals, state, { kind: "edit", paths: intent.paths, callId: input.callID, callSessionKey, toolId: input.tool });
  });
  if (ownerRegistration.lifecycle === "verified") {
    transitionQualitySessionByKey(internals.registry, resolved.ownerKey, "implementation_enabled", "QUALITY_VERIFICATION_STALE");
  }
  if (input.tool === "bash") {
    const callSessionKey = sessionKey(input.sessionID);
    const activeGuard = createActiveExternalGuard(internals, {
      kind: "command",
      ownerKey: resolved.ownerKey,
      callSessionKey,
      callId: input.callID,
    });
    let snapshot;
    try {
      snapshot = captureControlState(internals);
    } catch (error) {
      try { removeActiveExternalGuard(internals, activeGuard); } catch { /* original bounded snapshot failure remains authoritative */ }
      throw error;
    }
    internals.commandGuards.set(commandGuardKey(callSessionKey, input.callID), {
      owner_key: resolved.ownerKey,
      call_session_key: callSessionKey,
      snapshot,
      active_guard: activeGuard,
    });
  }
  return result;
}

export function handleNormalSessionToolBefore(bridge, input, output) {
  if (!NATIVE_MUTATION_TOOLS.has(input?.tool) && !CONTEXT_TOOLS.has(input?.tool)) return;
  const internals = bridgeState(bridge);
  return withControlOperationLock(internals, () => {
    const authority = reconcileOwnerAuthorityBeforeUse(internals, input?.sessionID, { required: false });
    if (authority !== null && ["failed", "attested"].includes(authority.registration.lifecycle)) {
      throw new ContractError("QUALITY_SESSION_INCOMPLETE", "terminal quality session has no tool authority");
    }
    if (authority !== null) recoverPendingContextCallsByKey(internals, authority.ownerKey);
    return handleNormalSessionToolBeforeInternal(bridge, input, output);
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
  if (!["edit", "task", "bash"].includes(input?.type)) return;
  const originalStatus = output.status;
  output.status = "deny";
  const earlyValues = permissionPatternValues(input);
  if (input.type === "task" && earlyValues?.length === 1 && READ_ONLY_TASKS.has(earlyValues[0])
    && (typeof input.sessionID !== "string" || typeof input.callID !== "string")) {
    output.status = originalStatus;
    return;
  }
  if (typeof input.sessionID !== "string" || typeof input.callID !== "string") return;
  return withControlOperationLock(internals, () => {
    try {
      const authority = reconcileOwnerAuthorityBeforeUse(internals, input.sessionID, { required: false });
      const resolved = authority === null ? null : authority;
      const values = permissionPatternValues(input);
      if (values === null) return;
      if (resolved === null) {
        const registration = inspectQualitySessionRegistration(internals.registry, input.sessionID, { required: false });
        if (registration === null) return;
        if (input.type === "task" && values.length === 1 && READ_ONLY_TASKS.has(values[0])) output.status = originalStatus;
        return;
      }
      if (["failed", "attested"].includes(resolved.registration.lifecycle)) return;
      const callSessionKey = sessionKey(input.sessionID);
      const observed = resolved.owner.observed_calls.find((entry) => entry.call_id === input.callID && entry.session_key === callSessionKey);
      if (!observed) return;
      if (input.type === "task") {
        if (values.length === 1 && values[0] === observed.target_agent && resolved.owner.active_task_launch?.parent_call_id === input.callID) {
          output.status = originalStatus;
        }
        return;
      }
      if (input.type === "bash") {
        if (values.length === 1 && observed.tool_id === "bash" && observed.command_fingerprint === sha256(values[0])) {
          output.status = originalStatus;
        }
        return;
      }
      const paths = [...new Set(values.map((entry, index) => normalizeOwnedPath(entry, internals.workspaceRoot, `edit permission pattern[${index}]`, { allowNativeSeparators: true })))].sort();
      if (exactSameStrings(paths, observed.paths)) output.status = originalStatus;
    } catch {
      output.status = "deny";
    }
  });
}

function reconcilePendingMutation(internals, rawSessionId, toolId, callId) {
  const callSessionKey = sessionKey(rawSessionId);
  const resolved = resolveOwnerRecord(internals, rawSessionId);
  const violation = mutateStateByKey(internals, resolved.ownerKey, (state) => {
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
    const standardLiteViolation = reconcileStandardLiteActualPaths(state, changed);
    if (standardLiteViolation !== null) {
      violation = standardLiteViolation;
      addIncompleteReason(state, "standard_lite_scope_violation");
    }
    state.pending_mutations.splice(index, 1);
    settleCapabilityForCall(state, toolId === "bash" ? "command" : "edit", callId, callSessionKey);
    if (after.source_fingerprint !== pending.before_workspace.source_fingerprint) {
      state.last_workspace = after;
      state.mutation_revision += 1;
      state.post_architecture_evidence = null;
      state.verification = null;
      state.attestation = null;
    }
    pruneObservedCalls(state);
    return violation;
  });
  if (violation) {
    try { transitionQualitySessionByKey(internals.registry, resolved.ownerKey, "failed", "QUALITY_WRITE_SCOPE_VIOLATION"); } catch { /* persisted owner state remains fail-closed */ }
  }
  return violation;
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
  const resolved = resolveOwnerRecord(internals, rawSessionId);
  const violation = mutateStateByKey(internals, resolved.ownerKey, (state) => {
    const link = resolved.link;
    if (link !== null) return null;
    const launch = state.active_task_launch;
    if (!launch || launch.parent_call_id !== callId) return null;
    assertContextOperationsSettled(state);
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
    const standardLiteViolation = reconcileStandardLiteActualPaths(state, changed);
    if (standardLiteViolation !== null) {
      addIncompleteReason(state, "standard_lite_scope_violation");
      message = standardLiteViolation;
    }
    const proposal = launch.pending_challenge_proposal;
    if (proposal !== null && !failed && message === null
      && launch.phase === "child_active" && launch.child_session_key !== null
      && launch.kind === "read_only" && changed.length === 0
      && state.lifecycle === "dossier_draft" && state.dossier.status === "draft"
      && state.dossier.revision === proposal.expected_dossier_revision
      && state.context_report?.status === "finalized"
      && state.context_report.revision === proposal.expected_report_revision
      && state.context_decision?.status === "sufficient"
      && state.context_task_profile_evidence !== null
      && state.mutation_revision === proposal.expected_mutation_revision
      && state.mutation_revision === 0 && state.first_mutation_at === null
      && state.last_workspace.source_fingerprint === proposal.expected_workspace_fingerprint
      && after.source_fingerprint === proposal.expected_workspace_fingerprint
      && state.pending_context_calls.length === 0 && state.pending_mutations.length === 0
      && contributionFor(state, proposal.role) === null) {
      let subjectCurrent = false;
      try {
        subjectCurrent = canonicalJson(challengeSubject(state)) === canonicalJson(proposal.subject);
      } catch (error) {
        if (!(error instanceof ContractError)) throw error;
      }
      if (subjectCurrent) {
        commitPlanChallengeContribution(internals, state, {
          role: proposal.role,
          blockers: proposal.blockers,
          expectedRevision: proposal.expected_dossier_revision,
          completedAt: proposal.proposed_at,
          expectedSubject: proposal.subject,
        });
      }
    }
    state.active_task_launch = null;
    settleCapabilityForCall(state, "task", callId, callSessionKey);
    if (after.source_fingerprint !== state.last_workspace.source_fingerprint) {
      state.last_workspace = after;
      state.mutation_revision += 1;
      state.post_architecture_evidence = null;
      state.verification = null;
      state.attestation = null;
    }
    pruneObservedCalls(state);
    return message;
  });
  closeChildLink(internals, childKey);
  if (violation) {
    try { transitionQualitySessionByKey(internals.registry, resolved.ownerKey, "failed", "QUALITY_WRITE_SCOPE_VIOLATION"); } catch { /* persisted owner state remains fail-closed */ }
  }
  return violation;
}

function handleNormalSessionToolAfterInternal(bridge, input, output) {
  const internals = bridgeState(bridge);
  reconcileOwnerAuthorityBeforeUse(internals, input?.sessionID, { required: false });
  if (CONTEXT_TOOLS.has(input?.tool)) return settleNormalSessionContextCall(internals, input, output);
  if (!NATIVE_MUTATION_TOOLS.has(input?.tool) || typeof input.sessionID !== "string" || typeof input.callID !== "string") return;
  if (input.tool === "bash") settleCommandControlGuard(internals, input.sessionID, input.callID);
  else if (internals.commandGuards.size > 0) {
    throw new ContractError("QUALITY_COMMAND_SERIALIZATION", "native tool settlement is serialized while an authorized command is running");
  }
  const resolved = resolveOwnerRecord(internals, input.sessionID, { required: false });
  if (resolved === null) return;
  const violation = input.tool === "task"
    ? reconcileTaskLaunch(internals, input.sessionID, input.callID, { failed: false })
    : reconcilePendingMutation(internals, input.sessionID, input.tool, input.callID);
  if (violation) throw new ContractError("QUALITY_WRITE_SCOPE_VIOLATION", violation);
}

export function handleNormalSessionToolAfter(bridge, input, output) {
  if ((!NATIVE_MUTATION_TOOLS.has(input?.tool) && !CONTEXT_TOOLS.has(input?.tool))
    || typeof input.sessionID !== "string" || typeof input.callID !== "string") return;
  const internals = bridgeState(bridge);
  const settlement = input.tool === "bash" ? settlementIdentity(input.sessionID, input.callID) : null;
  return withControlOperationLock(internals, () => handleNormalSessionToolAfterInternal(bridge, input, output), { settlement });
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
  const rawParent = readState(internals, info.parentID, { required: false });
  if (!rawParent || rawParent.record_kind !== OWNER_RECORD_KIND) return;
  const authority = reconcileOwnerAuthorityBeforeUse(internals, info.parentID, { required: false });
  const parent = authority?.owner ?? null;
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
  reconcileOwnerAuthorityBeforeUse(internals, part.sessionID, { required: false });
  if (CONTEXT_TOOLS.has(part.tool)) {
    return settleNormalSessionContextCall(internals, part, null, { status: "failed", reason_code: "tool_failed" });
  }
  const state = readState(internals, part.sessionID, { required: false });
  if (!state) return;
  const violation = part.tool === "task"
    ? reconcileTaskLaunch(internals, part.sessionID, part.callID, { failed: true })
    : reconcilePendingMutation(internals, part.sessionID, part.tool, part.callID);
  if (violation) throw new ContractError("QUALITY_WRITE_SCOPE_VIOLATION", violation);
}

function handleNormalSessionEventInternal(bridge, event) {
  const internals = bridgeState(bridge);
  const part = event?.type === "message.part.updated" ? event.properties?.part : null;
  const guardedBashFailure = part?.type === "tool" && part.state?.status === "error" && part.tool === "bash"
    && typeof part.sessionID === "string" && typeof part.callID === "string";
  const controlWritingEvent = event?.type === "session.created"
    || (part?.type === "tool" && part.state?.status === "error"
      && (NATIVE_MUTATION_TOOLS.has(part.tool) || CONTEXT_TOOLS.has(part.tool)));
  if (guardedBashFailure) settleCommandControlGuard(internals, part.sessionID, part.callID);
  else if (controlWritingEvent && internals.commandGuards.size > 0) {
    throw new ContractError("QUALITY_COMMAND_SERIALIZATION", "quality lifecycle events are serialized while an authorized command is running");
  }
  if (event?.type === "session.created") {
    const info = event.properties?.info;
    if (info && typeof info.id === "string" && typeof info.parentID === "string") handleSessionCreated(internals, info);
    return;
  }
  if (event?.type === "message.part.updated") {
    if (part?.type === "tool" && part.state?.status === "error" && typeof part.sessionID === "string"
      && typeof part.callID === "string" && (NATIVE_MUTATION_TOOLS.has(part.tool) || CONTEXT_TOOLS.has(part.tool))) {
      reconcileFailedToolPart(internals, part);
    }
  }
}

export function handleNormalSessionEvent(bridge, event) {
  const part = event?.type === "message.part.updated" ? event.properties?.part : null;
  const guardedBashFailure = part?.type === "tool" && part.state?.status === "error" && part.tool === "bash"
    && typeof part.sessionID === "string" && typeof part.callID === "string";
  const controlWritingEvent = event?.type === "session.created"
    || (part?.type === "tool" && part.state?.status === "error"
      && (NATIVE_MUTATION_TOOLS.has(part.tool) || CONTEXT_TOOLS.has(part.tool)));
  if (!guardedBashFailure && !controlWritingEvent) return handleNormalSessionEventInternal(bridge, event);
  const internals = bridgeState(bridge);
  const settlement = guardedBashFailure ? settlementIdentity(part.sessionID, part.callID) : null;
  return withControlOperationLock(internals, () => handleNormalSessionEventInternal(bridge, event), { settlement });
}

export function inspectNormalSessionQualityState(bridge, sessionId) {
  const internals = bridgeState(bridge);
  return deepFrozenClone(readState(internals, sessionId), "normal-session quality state inspection");
}

export function normalSessionQualityStatePath(bridge, sessionId) {
  const internals = bridgeState(bridge);
  return statePaths(internals, sessionKey(sessionId)).file;
}
