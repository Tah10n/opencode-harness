import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  atomicWriteJson,
  ensureConfinedDirectory,
  readJson,
  resolveHarnessRoot,
  resolveInside,
  withExclusiveLock,
} from "../feedback/files.mjs";
import { loadProjectCheckCatalog } from "./project-check-catalog.mjs";
import { DOSSIER_TASK_TYPES } from "./constants.mjs";
import {
  normalizeNormalSessionOwnedPath,
  runSafeGitObservation,
  validateContentBoundWorkspace,
} from "./normal-session-workspace.mjs";
import {
  ContractError,
  assertArray,
  assertBoolean,
  assertInteger,
  assertPlain,
  assertString,
  canonicalJson,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

export const QUALITY_SESSION_REGISTRY_SCHEMA_VERSION = 2;
export const QUALITY_SESSION_LIFECYCLES = Object.freeze([
  "unclassified",
  "standard_lite",
  "dossier_draft",
  "gate_blocked",
  "implementation_enabled",
  "verified",
  "attested",
  "failed",
]);
export const PRIMARY_DEVELOPMENT_AGENTS = Object.freeze(["orchestrator", "orchestrator-deep"]);
export const STANDARD_LITE_LIMITS = Object.freeze({ max_ownership_paths: 3, max_affected_files: 12, max_check_ids: 8 });

const REGISTRIES = new WeakMap();
const REGISTRATION_KEYS = Object.freeze([
  "schema_version",
  "state_revision",
  "session_key",
  "session_id",
  "worktree_fingerprint",
  "agent_name",
  "primary_development_agent",
  "registered_at",
  "initial_lifecycle",
  "initial_workspace",
  "lifecycle",
  "lifecycle_history",
  "run_id",
  "task_id",
  "risk_class",
  "task_type",
  "user_visible_goal",
  "ownership_paths",
  "required_check_ids",
  "classification_rationale",
  "behavior_expectation",
  "expected_preserved_behavior",
  "known_local_edge_cases",
  "reproduction_contract",
  "scope_facts",
  "standard_lite_policy",
  "initial_affected_paths",
  "catalog_id",
  "catalog_fingerprint",
  "workspace_salt",
  "classification_workspace",
  "classification_revision",
  "check_execution_count",
  "receipt_bytes",
  "failure_reason_codes",
  "fingerprint",
]);
const START_KEYS = Object.freeze([
  "risk_class",
  "task_type",
  "user_visible_goal",
  "ownership_paths",
  "required_check_ids",
  "classification_rationale",
  "behavior_expectation",
  "expected_preserved_behavior",
  "known_local_edge_cases",
  "reproduction_contract",
  "scope_facts",
]);
const SCOPE_FACT_KEYS = Object.freeze([
  "parallel_writable_delegation",
  "migration",
  "public_compatibility_change",
  "architecture_policy_change",
  "security_sensitive",
  "persistence_sensitive",
  "concurrency_sensitive",
  "unresolved_unknowns",
]);

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function safeToken(prefix) {
  return `${prefix}-${randomBytes(12).toString("hex")}`;
}

function sessionKey(sessionId) {
  assertString(sessionId, "OpenCode session ID", { maxBytes: 1000 });
  return createHash("sha256").update(sessionId).digest("hex");
}

function registryInternals(registry) {
  const internals = REGISTRIES.get(registry);
  if (!internals) throw new ContractError("QUALITY_SESSION_REGISTRY", "invalid quality session registry");
  return internals;
}

function statePaths(internals, key) {
  return {
    file: resolveInside(internals.registrationRoot, `${key}.json`),
    lock: resolveInside(internals.registrationRoot, `${key}.lock`),
  };
}

function refreshFingerprint(record) {
  const source = { ...record };
  delete source.fingerprint;
  record.fingerprint = fingerprint(source);
  return record;
}

function validateWorkspace(value, label) {
  return validateContentBoundWorkspace(value, label);
}

function validateScopeFacts(value, label) {
  assertPlain(value, label);
  exact(value, SCOPE_FACT_KEYS, SCOPE_FACT_KEYS, label);
  for (const key of SCOPE_FACT_KEYS) assertBoolean(value[key], `${label}.${key}`);
}

function validateStandardLitePolicy(value, label) {
  if (value === null) return;
  assertPlain(value, label);
  exact(value, ["allowed_ownership_prefixes", "protected_paths"], ["allowed_ownership_prefixes", "protected_paths"], label);
  for (const key of ["allowed_ownership_prefixes", "protected_paths"]) {
    assertArray(value[key], `${label}.${key}`, { min: key === "allowed_ownership_prefixes" ? 1 : 0, max: 128 });
    value[key].forEach((entry, index) => assertString(entry, `${label}.${key}[${index}]`, { maxBytes: 1000 }));
    if (new Set(value[key]).size !== value[key].length) throw new ContractError("QUALITY_STANDARD_LITE_POLICY", `${label}.${key} must be unique`);
  }
}

function validateReproductionContract(value, label) {
  if (value === null) return;
  assertPlain(value, label);
  const keys = [
    "check_id",
    "expected_pre_fix",
    "expected_post_fix",
    "unavailable_reason",
    "uncertainty_material",
  ];
  exact(value, keys, keys, label);
  assertString(value.check_id, `${label}.check_id`, { maxBytes: 128 });
  if (!["failing_reproducer", "unavailable"].includes(value.expected_pre_fix)) {
    throw new ContractError("QUALITY_REPRODUCTION_CONTRACT", `${label}.expected_pre_fix is invalid`);
  }
  if (value.expected_post_fix !== "passing_regression") {
    throw new ContractError("QUALITY_REPRODUCTION_CONTRACT", `${label}.expected_post_fix must be passing_regression`);
  }
  assertBoolean(value.uncertainty_material, `${label}.uncertainty_material`);
  if (value.expected_pre_fix === "unavailable") {
    assertString(value.unavailable_reason, `${label}.unavailable_reason`, { maxBytes: 2000 });
  } else if (value.unavailable_reason !== null || value.uncertainty_material) {
    throw new ContractError(
      "QUALITY_REPRODUCTION_CONTRACT",
      `${label} failing_reproducer cannot claim unavailable reproduction or material uncertainty`,
    );
  }
}

function validateRegistration(value, expected) {
  assertPlain(value, "quality session registration");
  exact(value, REGISTRATION_KEYS, REGISTRATION_KEYS, "quality session registration");
  if (value.schema_version !== QUALITY_SESSION_REGISTRY_SCHEMA_VERSION) throw new ContractError("QUALITY_SESSION_SCHEMA", "quality session registration version is unsupported");
  assertInteger(value.state_revision, "quality session registration.state_revision", { min: 1 });
  if (value.session_key !== expected.sessionKey || value.worktree_fingerprint !== expected.worktreeFingerprint) {
    throw new ContractError("QUALITY_SESSION_BINDING", "quality session registration belongs to another session or worktree");
  }
  assertString(value.session_id, "quality session registration.session_id", { maxBytes: 1000 });
  if (sessionKey(value.session_id) !== value.session_key) {
    throw new ContractError("QUALITY_SESSION_BINDING", "quality session ID does not bind its storage key");
  }
  assertString(value.agent_name, "quality session registration.agent_name", { maxBytes: 128 });
  assertBoolean(value.primary_development_agent, "quality session registration.primary_development_agent");
  if (value.primary_development_agent !== PRIMARY_DEVELOPMENT_AGENTS.includes(value.agent_name)) {
    throw new ContractError("QUALITY_SESSION_BINDING", "primary development identity is inconsistent");
  }
  assertString(value.registered_at, "quality session registration.registered_at", { maxBytes: 128 });
  if (value.initial_lifecycle !== "unclassified" || !QUALITY_SESSION_LIFECYCLES.includes(value.lifecycle)) {
    throw new ContractError("QUALITY_SESSION_LIFECYCLE", "quality session lifecycle is invalid");
  }
  validateWorkspace(value.initial_workspace, "quality session registration.initial_workspace");
  assertArray(value.lifecycle_history, "quality session registration.lifecycle_history", { min: 1, max: 256 });
  value.lifecycle_history.forEach((entry, index) => {
    exact(entry, ["lifecycle", "at", "reason_code"], ["lifecycle", "at", "reason_code"], `quality session lifecycle_history[${index}]`);
    if (!QUALITY_SESSION_LIFECYCLES.includes(entry.lifecycle)) throw new ContractError("QUALITY_SESSION_LIFECYCLE", "quality session lifecycle history is invalid");
    assertString(entry.at, `quality session lifecycle_history[${index}].at`, { maxBytes: 128 });
    if (entry.reason_code !== null) assertString(entry.reason_code, `quality session lifecycle_history[${index}].reason_code`, { maxBytes: 128 });
  });
  if (value.lifecycle_history[0].lifecycle !== "unclassified" || value.lifecycle_history.at(-1).lifecycle !== value.lifecycle) {
    throw new ContractError("QUALITY_SESSION_LIFECYCLE", "quality session lifecycle history does not bind current state");
  }
  for (const key of ["run_id", "task_id", "risk_class", "task_type", "user_visible_goal", "classification_rationale", "behavior_expectation", "catalog_id"]) {
    if (value[key] !== null) assertString(value[key], `quality session registration.${key}`, { maxBytes: key === "user_visible_goal" ? 4000 : 1000 });
  }
  for (const key of ["ownership_paths", "required_check_ids", "expected_preserved_behavior", "known_local_edge_cases"]) {
    assertArray(value[key], `quality session registration.${key}`, { max: 128 });
    value[key].forEach((entry, index) => assertString(entry, `quality session registration.${key}[${index}]`, { maxBytes: 2000 }));
  }
  if (value.scope_facts !== null) validateScopeFacts(value.scope_facts, "quality session registration.scope_facts");
  validateReproductionContract(value.reproduction_contract, "quality session registration.reproduction_contract");
  const requiresReproduction = value.risk_class === "standard-lite" && value.task_type === "bug_fix";
  if (requiresReproduction !== (value.reproduction_contract !== null)
    || (requiresReproduction && (!value.required_check_ids.includes(value.reproduction_contract.check_id)))) {
    throw new ContractError(
      "QUALITY_REPRODUCTION_CONTRACT",
      "quality session reproduction contract does not bind its standard-lite bug-fix check set",
    );
  }
  validateStandardLitePolicy(value.standard_lite_policy, "quality session registration.standard_lite_policy");
  assertArray(value.initial_affected_paths, "quality session registration.initial_affected_paths", { max: STANDARD_LITE_LIMITS.max_affected_files });
  value.initial_affected_paths.forEach((entry, index) => assertString(entry, `quality session registration.initial_affected_paths[${index}]`, { maxBytes: 1000 }));
  if (value.catalog_fingerprint !== null) assertString(value.catalog_fingerprint, "quality session registration.catalog_fingerprint", { maxBytes: 128 });
  if (value.workspace_salt !== null) assertString(value.workspace_salt, "quality session registration.workspace_salt", { maxBytes: 128 });
  if (value.classification_workspace !== null) validateWorkspace(value.classification_workspace, "quality session registration.classification_workspace");
  if (value.classification_revision !== null) assertInteger(value.classification_revision, "quality session registration.classification_revision", { min: 1 });
  assertInteger(value.check_execution_count, "quality session registration.check_execution_count", { min: 0, max: 4096 });
  assertInteger(value.receipt_bytes, "quality session registration.receipt_bytes", { min: 0, max: 16 * 1024 * 1024 });
  assertArray(value.failure_reason_codes, "quality session registration.failure_reason_codes", { max: 64 });
  const source = { ...value };
  delete source.fingerprint;
  if (!fingerprintsEqual(value.fingerprint, fingerprint(source))) {
    throw new ContractError("QUALITY_SESSION_FINGERPRINT", "quality session registration fingerprint is invalid");
  }
  return value;
}

function readRegistrationByKey(internals, key, { required = true } = {}) {
  const { file } = statePaths(internals, key);
  if (!fs.existsSync(file)) {
    if (!required) return null;
    throw new ContractError("QUALITY_SESSION_UNCLASSIFIED", "OpenCode session is not registered by chat.message");
  }
  let value;
  try { value = readJson(file); } catch { throw new ContractError("QUALITY_SESSION_CORRUPT", "quality session registration is corrupt"); }
  return validateRegistration(value, { sessionKey: key, worktreeFingerprint: internals.worktreeFingerprint });
}

function writeRegistration(internals, record, { createOnly = false, expectedRevision = null } = {}) {
  const { file, lock } = statePaths(internals, record.session_key);
  return withExclusiveLock(lock, () => {
    if (fs.existsSync(file)) {
      if (createOnly) throw new ContractError("QUALITY_SESSION_REPLAY", "quality session is already registered");
      const current = readRegistrationByKey(internals, record.session_key);
      if (expectedRevision === null || current.state_revision !== expectedRevision) {
        throw new ContractError("QUALITY_SESSION_REVISION_CONFLICT", "quality session registration revision is stale");
      }
      record.state_revision = current.state_revision + 1;
    } else {
      if (expectedRevision !== null) throw new ContractError("QUALITY_SESSION_REVISION_CONFLICT", "quality session registration disappeared");
      record.state_revision = 1;
    }
    refreshFingerprint(record);
    const persisted = deepFrozenClone(record, "quality session registration persistence");
    validateRegistration(persisted, { sessionKey: record.session_key, worktreeFingerprint: internals.worktreeFingerprint });
    atomicWriteJson(file, persisted, { basePath: internals.qualityRoot });
    return persisted;
  }, {
    basePath: internals.qualityRoot,
    lockIdFactory: () => canonicalJson({ schema_version: 1, pid: process.pid, nonce: randomBytes(16).toString("hex") }),
  });
}

function mutateRegistration(internals, sessionId, callback) {
  const key = sessionKey(sessionId);
  const current = readRegistrationByKey(internals, key);
  const next = JSON.parse(canonicalJson(current));
  const result = callback(next);
  const persisted = writeRegistration(internals, next, { expectedRevision: current.state_revision });
  return result === undefined ? persisted : result;
}

function normalizePathSet(values, workspaceRoot, label, max, { min = 1 } = {}) {
  assertArray(values, label, { min, max });
  const paths = values.map((entry, index) => normalizeNormalSessionOwnedPath(entry, workspaceRoot, `${label}[${index}]`));
  if (new Set(paths).size !== paths.length) throw new ContractError("QUALITY_OWNERSHIP_DUPLICATE", `${label} must be unique`);
  return paths.sort();
}

function inspectAffectedFiles(workspaceRoot, ownershipPaths) {
  let stdout;
  try {
    stdout = runSafeGitObservation(workspaceRoot, ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...ownershipPaths], 1024 * 1024);
  } catch {
    throw new ContractError("QUALITY_RISK_ESCALATION_REQUIRED", "standard-lite requires a bounded Git-owned file inventory");
  }
  return [...new Set(String(stdout).split(/\r?\n/u).filter(Boolean))].sort();
}

function pathWithinPrefix(candidate, prefix) {
  const comparableCandidate = process.platform === "win32" ? candidate.toLowerCase() : candidate;
  const comparablePrefix = process.platform === "win32" ? prefix.toLowerCase() : prefix;
  return comparableCandidate === comparablePrefix || comparableCandidate.startsWith(`${comparablePrefix}/`);
}

function standardLitePathReason(paths, policy) {
  for (const candidate of paths) {
    if (!policy.allowed_ownership_prefixes.some((prefix) => pathWithinPrefix(candidate, prefix))) {
      return "QUALITY_RISK_ESCALATION_REQUIRED";
    }
    if (policy.protected_paths.some((protectedPath) => pathWithinPrefix(candidate, protectedPath))) {
      return "QUALITY_RISK_ESCALATION_REQUIRED";
    }
    if (candidate.split("/").some((component) => component.toLowerCase() === "migrations")) {
      return "QUALITY_RISK_ESCALATION_REQUIRED";
    }
  }
  return null;
}

function standardLiteReason(request, ownershipPaths, affectedFiles, initialWorkspace, policy) {
  if (ownershipPaths.length > STANDARD_LITE_LIMITS.max_ownership_paths || affectedFiles.length > STANDARD_LITE_LIMITS.max_affected_files) {
    return "QUALITY_STANDARD_LITE_SCOPE_EXCEEDED";
  }
  if (request.required_check_ids.length === 0 || request.required_check_ids.length > STANDARD_LITE_LIMITS.max_check_ids) {
    return "QUALITY_STANDARD_LITE_CHECK_MISSING";
  }
  if (Object.values(request.scope_facts).some(Boolean)) return "QUALITY_RISK_ESCALATION_REQUIRED";
  if (["migration", "security"].includes(request.task_type)) return "QUALITY_RISK_ESCALATION_REQUIRED";
  if (initialWorkspace.dirty ?? (initialWorkspace.entries.length > 0)) return "QUALITY_RISK_ESCALATION_REQUIRED";
  if (policy === null) return "QUALITY_RISK_ESCALATION_REQUIRED";
  const pathReason = standardLitePathReason([...ownershipPaths, ...affectedFiles], policy);
  if (pathReason) return pathReason;
  return null;
}

export function createQualitySessionRegistry(options) {
  assertPlain(options, "quality session registry options");
  const workspaceRoot = fs.realpathSync(path.resolve(options.workspaceRoot));
  const harnessRoot = resolveHarnessRoot(workspaceRoot);
  const qualityRoot = resolveInside(harnessRoot, "quality");
  const registrationRoot = resolveInside(qualityRoot, "session-registry");
  ensureConfinedDirectory(harnessRoot, registrationRoot);
  const registry = Object.freeze({ schema_version: QUALITY_SESSION_REGISTRY_SCHEMA_VERSION });
  REGISTRIES.set(registry, {
    workspaceRoot,
    qualityRoot,
    registrationRoot,
    worktreeFingerprint: sha256(workspaceRoot.toLowerCase()),
    observeWorkspace: options.observeWorkspace,
    clock: options.clock ?? (() => new Date().toISOString()),
    idFactory: options.idFactory ?? safeToken,
    catalogLoader: options.catalogLoader ?? (() => loadProjectCheckCatalog(workspaceRoot)),
    affectedFileInspector: options.affectedFileInspector ?? ((root, ownershipPaths) => inspectAffectedFiles(root, ownershipPaths)),
  });
  if (typeof options.observeWorkspace !== "function") throw new ContractError("QUALITY_SESSION_REGISTRY", "quality session registry requires a workspace observer");
  return registry;
}

export function registerQualityChatSession(registry, input) {
  const internals = registryInternals(registry);
  assertPlain(input, "chat.message quality registration");
  exact(input, ["sessionID", "agent"], ["sessionID"], "chat.message quality registration");
  assertString(input.sessionID, "chat.message sessionID", { maxBytes: 1000 });
  const hasAgent = typeof input.agent === "string";
  const agent = input.agent ?? "unknown";
  assertString(agent, "chat.message agent", { maxBytes: 128 });
  const key = sessionKey(input.sessionID);
  const existing = readRegistrationByKey(internals, key, { required: false });
  if (existing) {
    if (existing.session_id !== input.sessionID) {
      throw new ContractError("QUALITY_SESSION_AGENT_MISMATCH", "chat.message identity does not match the registered session");
    }
    if (!hasAgent || existing.agent_name === agent) return deepFrozenClone(existing, "idempotent chat.message registration");
    if (existing.agent_name === "unknown" && existing.lifecycle === "unclassified" && existing.classification_revision === null) {
      return mutateRegistration(internals, input.sessionID, (record) => {
        record.agent_name = agent;
        record.primary_development_agent = PRIMARY_DEVELOPMENT_AGENTS.includes(agent);
      });
    }
    if (existing.agent_name !== agent) {
      throw new ContractError("QUALITY_SESSION_AGENT_MISMATCH", "chat.message identity does not match the registered session");
    }
    return deepFrozenClone(existing, "idempotent chat.message registration");
  }
  const initialWorkspace = internals.observeWorkspace(internals.workspaceRoot, sha256(`registration:${key}`));
  validateWorkspace(initialWorkspace, "chat.message initial workspace");
  const registeredAt = internals.clock();
  const record = {
    schema_version: QUALITY_SESSION_REGISTRY_SCHEMA_VERSION,
    state_revision: 0,
    session_key: key,
    session_id: input.sessionID,
    worktree_fingerprint: internals.worktreeFingerprint,
    agent_name: agent,
    primary_development_agent: PRIMARY_DEVELOPMENT_AGENTS.includes(agent),
    registered_at: registeredAt,
    initial_lifecycle: "unclassified",
    initial_workspace: initialWorkspace,
    lifecycle: "unclassified",
    lifecycle_history: [{ lifecycle: "unclassified", at: registeredAt, reason_code: null }],
    run_id: null,
    task_id: null,
    risk_class: null,
    task_type: null,
    user_visible_goal: null,
    ownership_paths: [],
    required_check_ids: [],
    classification_rationale: null,
    behavior_expectation: null,
    expected_preserved_behavior: [],
    known_local_edge_cases: [],
    reproduction_contract: null,
    scope_facts: null,
    standard_lite_policy: null,
    initial_affected_paths: [],
    catalog_id: null,
    catalog_fingerprint: null,
    workspace_salt: null,
    classification_workspace: null,
    classification_revision: null,
    check_execution_count: 0,
    receipt_bytes: 0,
    failure_reason_codes: [],
    fingerprint: null,
  };
  return writeRegistration(internals, record, { createOnly: true });
}

export function startQualitySession(registry, sessionId, request, { agent }) {
  const internals = registryInternals(registry);
  assertPlain(request, "quality session start request");
  exact(request, START_KEYS, ["risk_class", "task_type", "user_visible_goal", "ownership_paths", "required_check_ids", "classification_rationale"], "quality session start request");
  if (!["standard-lite", "high", "critical"].includes(request.risk_class)) throw new ContractError("QUALITY_RISK_CLASS", "quality session risk_class is invalid");
  for (const [key, maxBytes] of [["task_type", 256], ["user_visible_goal", 4000], ["classification_rationale", 4000]]) {
    assertString(request[key], `quality session start request.${key}`, { maxBytes });
  }
  if (!DOSSIER_TASK_TYPES.includes(request.task_type)) {
    throw new ContractError("QUALITY_TASK_TYPE", "quality session task_type is unsupported");
  }
  const ownershipPaths = normalizePathSet(request.ownership_paths, internals.workspaceRoot, "quality session ownership_paths", 128);
  assertArray(request.required_check_ids, "quality session start request.required_check_ids", { min: 1, max: 64 });
  request.required_check_ids.forEach((entry, index) => assertString(entry, `quality session start request.required_check_ids[${index}]`, { maxBytes: 128 }));
  if (new Set(request.required_check_ids).size !== request.required_check_ids.length) throw new ContractError("QUALITY_CHECK_DUPLICATE", "required check IDs must be unique");
  const catalog = internals.catalogLoader();
  const knownChecks = new Map(catalog.catalog.checks.map((entry) => [entry.check_id, entry]));
  for (const checkId of request.required_check_ids) {
    const entry = knownChecks.get(checkId);
    if (!entry || !entry.phases.includes("integration")) {
      throw new ContractError("QUALITY_STANDARD_LITE_CHECK_MISSING", `required trusted integration check is unavailable: ${checkId}`);
    }
  }
  const currentPreliminary = internals.observeWorkspace(internals.workspaceRoot, sha256(`registration:${sessionKey(sessionId)}`));
  validateWorkspace(currentPreliminary, "quality session preliminary workspace");
  return mutateRegistration(internals, sessionId, (record) => {
    if (record.agent_name === "unknown" && PRIMARY_DEVELOPMENT_AGENTS.includes(agent)
      && record.lifecycle === "unclassified" && record.classification_revision === null) {
      record.agent_name = agent;
      record.primary_development_agent = true;
    }
    if (!record.primary_development_agent || record.agent_name !== agent) throw new ContractError("QUALITY_TOOL_ROLE", "quality_session_start requires the registered primary development agent");
    if (record.lifecycle !== "unclassified" || record.classification_revision !== null) throw new ContractError("QUALITY_SESSION_REPLAY", "quality session classification cannot be replayed");
    if (currentPreliminary.source_fingerprint !== record.initial_workspace.source_fingerprint) {
      throw new ContractError("QUALITY_WORKSPACE_UNTRACED", "workspace changed before quality session classification");
    }
    let behaviorExpectation = null;
    let preserved = [];
    let edgeCases = [];
    let reproductionContract = null;
    let scopeFacts = null;
    if (request.risk_class === "standard-lite") {
      for (const key of ["behavior_expectation", "expected_preserved_behavior", "known_local_edge_cases", "scope_facts"]) {
        if (!Object.hasOwn(request, key)) throw new ContractError("QUALITY_STANDARD_LITE_SCOPE_EXCEEDED", `standard-lite requires ${key}`);
      }
      assertString(request.behavior_expectation, "quality session start request.behavior_expectation", { maxBytes: 4000 });
      for (const key of ["expected_preserved_behavior", "known_local_edge_cases"]) {
        assertArray(request[key], `quality session start request.${key}`, { min: 1, max: 16 });
        request[key].forEach((entry, index) => assertString(entry, `quality session start request.${key}[${index}]`, { maxBytes: 2000 }));
      }
      validateScopeFacts(request.scope_facts, "quality session start request.scope_facts");
      if (request.task_type === "bug_fix") {
        if (!Object.hasOwn(request, "reproduction_contract")) {
          throw new ContractError("QUALITY_REPRODUCTION_CONTRACT", "standard-lite bug_fix requires reproduction_contract");
        }
        validateReproductionContract(request.reproduction_contract, "quality session start request.reproduction_contract");
        const reproducer = knownChecks.get(request.reproduction_contract.check_id);
        if (!reproducer || reproducer.purpose !== "bug_reproducer"
          || !reproducer.phases.includes("preimplementation") || !reproducer.phases.includes("integration")
          || !request.required_check_ids.includes(reproducer.check_id)) {
          throw new ContractError(
            "QUALITY_REPRODUCTION_CHECK_MISSING",
            "standard-lite bug_fix requires a selected bug_reproducer check with preimplementation and integration phases",
          );
        }
        if (request.reproduction_contract.uncertainty_material) {
          throw new ContractError(
            "QUALITY_RISK_ESCALATION_REQUIRED",
            "material reproduction uncertainty requires a high or critical dossier",
          );
        }
        reproductionContract = deepFrozenClone(request.reproduction_contract, "standard-lite reproduction contract");
      } else if (Object.hasOwn(request, "reproduction_contract") && request.reproduction_contract !== null) {
        throw new ContractError("QUALITY_REPRODUCTION_CONTRACT", "reproduction_contract is only valid for a bug_fix");
      }
      const affectedFiles = normalizePathSet(
        internals.affectedFileInspector(internals.workspaceRoot, ownershipPaths),
        internals.workspaceRoot,
        "standard-lite affected files",
        STANDARD_LITE_LIMITS.max_affected_files + 1,
        { min: 0 },
      );
      const policy = catalog.catalog.standard_lite_policy ?? null;
      const reason = standardLiteReason(request, ownershipPaths, affectedFiles, record.initial_workspace, policy);
      if (reason) throw new ContractError(reason, "standard-lite facts require a high or critical Engineering Dossier");
      behaviorExpectation = request.behavior_expectation;
      preserved = [...request.expected_preserved_behavior];
      edgeCases = [...request.known_local_edge_cases];
      scopeFacts = { ...request.scope_facts };
      record.standard_lite_policy = deepFrozenClone(policy, "standard-lite project policy");
      record.initial_affected_paths = [...affectedFiles];
    }
    const workspaceSalt = sha256(internals.idFactory("workspace-salt"));
    const classificationWorkspace = internals.observeWorkspace(internals.workspaceRoot, workspaceSalt, ownershipPaths);
    validateWorkspace(classificationWorkspace, "quality session classification workspace");
    const currentFinal = internals.observeWorkspace(internals.workspaceRoot, sha256(`registration:${sessionKey(sessionId)}`));
    validateWorkspace(currentFinal, "quality session final classification workspace");
    if (currentFinal.source_fingerprint !== currentPreliminary.source_fingerprint) {
      throw new ContractError("QUALITY_WORKSPACE_UNTRACED", "workspace changed while quality session classification was in progress");
    }
    const now = internals.clock();
    record.lifecycle = request.risk_class === "standard-lite" ? "standard_lite" : "dossier_draft";
    record.lifecycle_history.push({ lifecycle: record.lifecycle, at: now, reason_code: null });
    record.run_id = internals.idFactory("run");
    record.task_id = internals.idFactory("task");
    record.risk_class = request.risk_class;
    record.task_type = request.task_type;
    record.user_visible_goal = request.user_visible_goal;
    record.ownership_paths = [...ownershipPaths];
    record.required_check_ids = [...request.required_check_ids].sort();
    record.classification_rationale = request.classification_rationale;
    record.behavior_expectation = behaviorExpectation;
    record.expected_preserved_behavior = preserved;
    record.known_local_edge_cases = edgeCases;
    record.reproduction_contract = reproductionContract;
    record.scope_facts = scopeFacts;
    record.catalog_id = catalog.catalog.catalog_id;
    record.catalog_fingerprint = catalog.fingerprint;
    record.workspace_salt = workspaceSalt;
    record.classification_workspace = classificationWorkspace;
    record.classification_revision = 1;
  });
}

export function transitionQualitySession(registry, sessionId, lifecycle, reasonCode = null) {
  const internals = registryInternals(registry);
  return transitionQualitySessionByKey(registry, sessionKey(sessionId), lifecycle, reasonCode);
}

export function escalateQualitySessionRiskByKey(registry, key, targetRiskClass) {
  const internals = registryInternals(registry);
  if (!["high", "critical"].includes(targetRiskClass)) {
    throw new ContractError("QUALITY_RISK_CLASS", "quality session escalation target must be high or critical");
  }
  const current = readRegistrationByKey(internals, key);
  const rank = new Map([["standard-lite", 0], ["high", 1], ["critical", 2]]);
  if (rank.get(targetRiskClass) < rank.get(current.risk_class)) {
    throw new ContractError("CONTEXT_STRATEGY_WEAKENING", "quality session risk escalation cannot downgrade classification");
  }
  if (targetRiskClass === current.risk_class) return deepFrozenClone(current, "idempotent quality risk escalation");
  return mutateRegistration(internals, current.session_id, (record) => {
    if (!["standard_lite", "dossier_draft"].includes(record.lifecycle) || record.classification_revision === null) {
      throw new ContractError("CONTEXT_STRATEGY_ESCALATION_ORDER", "quality risk escalation must precede gate evaluation and implementation");
    }
    const now = internals.clock();
    record.risk_class = targetRiskClass;
    record.lifecycle = "dossier_draft";
    record.lifecycle_history.push({ lifecycle: "dossier_draft", at: now, reason_code: "CONTEXT_STRATEGY_ESCALATED" });
    record.classification_revision += 1;
    record.reproduction_contract = null;
    record.standard_lite_policy = null;
    record.scope_facts = null;
  });
}

export function transitionQualitySessionByKey(registry, key, lifecycle, reasonCode = null) {
  const internals = registryInternals(registry);
  if (!QUALITY_SESSION_LIFECYCLES.includes(lifecycle)) throw new ContractError("QUALITY_SESSION_LIFECYCLE", "unsupported quality session lifecycle transition");
  const current = readRegistrationByKey(internals, key);
  const record = JSON.parse(canonicalJson(current));
  if (record.lifecycle === lifecycle) return deepFrozenClone(current, "idempotent quality session lifecycle transition");
  if (record.lifecycle === "attested" || record.lifecycle === "failed") throw new ContractError("QUALITY_SESSION_LIFECYCLE", "terminal quality session cannot transition");
  const allowed = new Map([
    ["unclassified", new Set(["standard_lite", "dossier_draft", "failed"])],
    ["standard_lite", new Set(["implementation_enabled", "gate_blocked", "failed"])],
    ["dossier_draft", new Set(["implementation_enabled", "gate_blocked", "failed"])],
    ["gate_blocked", new Set(["failed"])],
    ["implementation_enabled", new Set(["verified", "failed"])],
    ["verified", new Set(["implementation_enabled", "attested", "failed"])],
  ]);
  if (!allowed.get(record.lifecycle)?.has(lifecycle)) throw new ContractError("QUALITY_SESSION_LIFECYCLE", `invalid transition ${record.lifecycle} -> ${lifecycle}`);
  record.lifecycle = lifecycle;
  record.lifecycle_history.push({ lifecycle, at: internals.clock(), reason_code: reasonCode });
  if (lifecycle === "failed" && reasonCode && !record.failure_reason_codes.includes(reasonCode)) record.failure_reason_codes.push(reasonCode);
  return writeRegistration(internals, record, { expectedRevision: current.state_revision });
}

export function assertQualitySessionCatalogCurrent(registry, sessionId) {
  const internals = registryInternals(registry);
  return assertQualitySessionCatalogCurrentByKey(registry, sessionKey(sessionId));
}

export function assertQualitySessionCatalogCurrentByKey(registry, key) {
  const internals = registryInternals(registry);
  const record = readRegistrationByKey(internals, key);
  if (record.catalog_fingerprint === null) throw new ContractError("QUALITY_SESSION_UNCLASSIFIED", "quality session has not captured a trusted check catalog");
  let current = null;
  try {
    current = internals.catalogLoader();
  } catch {
    current = null;
  }
  if (current === null || current.fingerprint !== record.catalog_fingerprint || current.catalog?.catalog_id !== record.catalog_id) {
    const next = JSON.parse(canonicalJson(record));
    if (!next.failure_reason_codes.includes("QUALITY_CHECK_CATALOG_DRIFT")) next.failure_reason_codes.push("QUALITY_CHECK_CATALOG_DRIFT");
    if (!["attested", "failed"].includes(next.lifecycle)) {
      next.lifecycle = "failed";
      next.lifecycle_history.push({ lifecycle: "failed", at: internals.clock(), reason_code: "QUALITY_CHECK_CATALOG_DRIFT" });
      try { writeRegistration(internals, next, { expectedRevision: record.state_revision }); } catch { /* original drift is authoritative */ }
    }
    throw new ContractError("QUALITY_CHECK_CATALOG_DRIFT", "trusted project check catalog changed during the quality session");
  }
  return deepFrozenClone(record, "current quality session catalog binding");
}

export function recordQualityCheckBudget(registry, sessionId, { count, receiptBytes, maxChecks = 64, maxReceiptBytes = 1024 * 1024 }) {
  const internals = registryInternals(registry);
  return recordQualityCheckBudgetByKey(registry, sessionKey(sessionId), { count, receiptBytes, maxChecks, maxReceiptBytes });
}

export function recordQualityCheckBudgetByKey(registry, key, { count, receiptBytes, maxChecks = 64, maxReceiptBytes = 1024 * 1024 }) {
  const internals = registryInternals(registry);
  assertInteger(count, "quality check budget count", { min: 0, max: maxChecks });
  assertInteger(receiptBytes, "quality check budget receiptBytes", { min: 0, max: maxReceiptBytes });
  const current = readRegistrationByKey(internals, key);
  const next = JSON.parse(canonicalJson(current));
  if (next.check_execution_count + count > maxChecks || next.receipt_bytes + receiptBytes > maxReceiptBytes) {
    throw new ContractError("QUALITY_CHECK_RUN_LIMIT", "quality session trusted check budget is exhausted");
  }
  next.check_execution_count += count;
  next.receipt_bytes += receiptBytes;
  return writeRegistration(internals, next, { expectedRevision: current.state_revision });
}

export function inspectQualitySessionRegistration(registry, sessionId, { required = true } = {}) {
  const internals = registryInternals(registry);
  const record = readRegistrationByKey(internals, sessionKey(sessionId), { required });
  return record === null ? null : deepFrozenClone(record, "quality session registration inspection");
}

export function qualitySessionRegistrationPath(registry, sessionId) {
  const internals = registryInternals(registry);
  return statePaths(internals, sessionKey(sessionId)).file;
}
