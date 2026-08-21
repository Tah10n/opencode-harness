import { createHash } from "node:crypto";

const CHECK_STATUSES = Object.freeze([
  "passed",
  "failed",
  "unavailable",
  "unrelated_infrastructure_failure",
]);
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/u;

class CoreVerificationError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "CoreVerificationError";
    this.code = code;
  }
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function fingerprint(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function fail(code, message) {
  throw new CoreVerificationError(code, message);
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exact(value, keys, label) {
  if (!plainObject(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())) {
    fail("CORE_VERIFICATION_SCHEMA", `${label} must contain exactly ${keys.join(", ")}`);
  }
}

function safeId(value, label) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    fail("CORE_VERIFICATION_SCHEMA", `${label} is invalid`);
  }
  return value;
}

function safeFingerprint(value, label) {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    fail("CORE_VERIFICATION_SCHEMA", `${label} is invalid`);
  }
  return value;
}

function safePath(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 512
    || /[\r\n\0]/u.test(value) || value.startsWith("/") || value.includes("\\")
    || value.split("/").some((part) => ["", ".", ".."].includes(part))) {
    fail("CORE_VERIFICATION_SCHEMA", `${label} is invalid`);
  }
  return value;
}

function normalizePaths(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.length > 128) {
    fail("CORE_VERIFICATION_SCHEMA", `${label} must be a bounded array`);
  }
  const normalized = value.map((entry, index) => safePath(entry, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    fail("CORE_VERIFICATION_SCHEMA", `${label} contains duplicates`);
  }
  return Object.freeze([...normalized].sort());
}

function normalizeCheck(value, index) {
  exact(value, ["check_id", "scope_prefixes", "cost_rank"], `checks[${index}]`);
  const checkId = safeId(value.check_id, `checks[${index}].check_id`);
  const scopePrefixes = normalizePaths(value.scope_prefixes, `checks[${index}].scope_prefixes`, {
    allowEmpty: true,
  });
  if (!Number.isSafeInteger(value.cost_rank) || value.cost_rank < 0 || value.cost_rank > 1_000_000) {
    fail("CORE_VERIFICATION_SCHEMA", `checks[${index}].cost_rank is invalid`);
  }
  return Object.freeze({ check_id: checkId, scope_prefixes: scopePrefixes, cost_rank: value.cost_rank });
}

function checkRelevant(check, changedPaths) {
  return check.scope_prefixes.length === 0 || changedPaths.some((changed) => (
    check.scope_prefixes.some((prefix) => changed === prefix || changed.startsWith(`${prefix}/`))
  ));
}

function chooseCheck(checks, changedPaths) {
  return checks.filter((check) => checkRelevant(check, changedPaths)).sort((left, right) => (
    left.cost_rank - right.cost_rank || left.check_id.localeCompare(right.check_id)
  ))[0] ?? null;
}

function seal(source) {
  const { state_fingerprint: _staleFingerprint, ...current } = source;
  return Object.freeze({ ...current, state_fingerprint: fingerprint(current) });
}

export function createCoreVerificationGate({ catalog_fingerprint, checks } = {}) {
  safeFingerprint(catalog_fingerprint, "catalog_fingerprint");
  if (!Array.isArray(checks) || checks.length > 64) {
    fail("CORE_VERIFICATION_SCHEMA", "checks must be a bounded array");
  }
  const normalized = checks.map(normalizeCheck);
  if (new Set(normalized.map((entry) => entry.check_id)).size !== normalized.length) {
    fail("CORE_VERIFICATION_SCHEMA", "checks contain duplicate check IDs");
  }
  return seal({
    schema_version: 1,
    catalog_fingerprint,
    checks: Object.freeze(normalized),
    mutation_revision: 0,
    workspace_fingerprint: null,
    changed_paths: Object.freeze([]),
    selected_check_id: null,
    verification: null,
    verification_started_count: 0,
    verification_completed_count: 0,
  });
}

function validateState(state) {
  if (!plainObject(state) || state.schema_version !== 1
    || !Array.isArray(state.checks) || !Number.isSafeInteger(state.mutation_revision)
    || state.mutation_revision < 0 || !Array.isArray(state.changed_paths)
    || !Number.isSafeInteger(state.verification_started_count)
    || !Number.isSafeInteger(state.verification_completed_count)) {
    fail("CORE_VERIFICATION_STATE", "core verification state is invalid");
  }
  const { state_fingerprint: declared, ...source } = state;
  if (declared !== fingerprint(source)) fail("CORE_VERIFICATION_STATE", "core verification state fingerprint is invalid");
  return state;
}

export function recordCoreWorkspaceMutation(state, {
  changed_paths,
  workspace_fingerprint,
  pinned_check_id = null,
} = {}) {
  validateState(state);
  const changedPaths = normalizePaths(changed_paths, "changed_paths");
  safeFingerprint(workspace_fingerprint, "workspace_fingerprint");
  if (pinned_check_id !== null) safeId(pinned_check_id, "pinned_check_id");
  const selected = pinned_check_id === null
    ? chooseCheck(state.checks, changedPaths)
    : state.checks.find((entry) => entry.check_id === pinned_check_id) ?? null;
  if (pinned_check_id !== null && (selected === null || !checkRelevant(selected, changedPaths))) {
    fail("CORE_VERIFICATION_CHECK_PIN", "pinned check must remain present and relevant to the cumulative changed paths");
  }
  return seal({
    ...state,
    mutation_revision: state.mutation_revision + 1,
    workspace_fingerprint,
    changed_paths: changedPaths,
    selected_check_id: selected?.check_id ?? null,
    verification: null,
  });
}

export function startCoreVerification(state, { check_id } = {}) {
  validateState(state);
  safeId(check_id, "check_id");
  if (state.mutation_revision === 0) fail("CORE_VERIFICATION_NOT_REQUIRED", "no workspace mutation requires verification");
  if (state.selected_check_id === null) fail("CORE_VERIFICATION_NOT_APPLICABLE", "no trusted check applies to the changed paths");
  if (check_id !== state.selected_check_id) {
    fail("CORE_VERIFICATION_CHECK_SUBSTITUTION", "only the runner-selected trusted check ID may execute");
  }
  if (state.verification !== null) fail("CORE_VERIFICATION_ALREADY_STARTED", "verification already started for this mutation revision");
  return seal({
    ...state,
    verification: Object.freeze({
      mutation_revision: state.mutation_revision,
      workspace_fingerprint: state.workspace_fingerprint,
      check_id,
      status: "started",
      command_fingerprint: null,
      detail_code: null,
    }),
    verification_started_count: state.verification_started_count + 1,
  });
}

export function completeCoreVerification(state, {
  check_id,
  mutation_revision,
  workspace_fingerprint,
  status,
  command_fingerprint,
  detail_code,
} = {}) {
  validateState(state);
  safeId(check_id, "check_id");
  safeFingerprint(workspace_fingerprint, "workspace_fingerprint");
  safeFingerprint(command_fingerprint, "command_fingerprint");
  safeId(detail_code, "detail_code");
  if (!CHECK_STATUSES.includes(status)) fail("CORE_VERIFICATION_SCHEMA", "verification status is invalid");
  if (!Number.isSafeInteger(mutation_revision) || mutation_revision < 1) {
    fail("CORE_VERIFICATION_SCHEMA", "mutation_revision is invalid");
  }
  if (state.verification?.status !== "started" || check_id !== state.selected_check_id
    || check_id !== state.verification.check_id) {
    fail("CORE_VERIFICATION_NOT_STARTED", "runner-selected verification was not started");
  }
  if (mutation_revision !== state.mutation_revision
    || mutation_revision !== state.verification.mutation_revision
    || workspace_fingerprint !== state.workspace_fingerprint
    || workspace_fingerprint !== state.verification.workspace_fingerprint) {
    fail("CORE_VERIFICATION_STALE", "verification does not bind the current mutation revision and workspace");
  }
  return seal({
    ...state,
    verification: Object.freeze({
      mutation_revision,
      workspace_fingerprint,
      check_id,
      status,
      command_fingerprint,
      detail_code,
    }),
    verification_completed_count: state.verification_completed_count + 1,
  });
}

export function coreVerificationTerminalDecision(state) {
  validateState(state);
  if (state.mutation_revision === 0) {
    return Object.freeze({ allowed: true, reason: "no_workspace_mutation", activation_eligible: false, activated: false });
  }
  if (state.selected_check_id === null) {
    return Object.freeze({ allowed: true, reason: "no_applicable_trusted_check", activation_eligible: true, activated: true });
  }
  const status = state.verification?.status ?? "not_started";
  return Object.freeze({
    allowed: status === "passed",
    reason: status === "passed" ? "post_last_mutation_verification_passed" : `verification_${status}`,
    activation_eligible: true,
    activated: state.verification !== null,
  });
}

export function coreVerificationActivationObservation(state) {
  const decision = coreVerificationTerminalDecision(state);
  return Object.freeze({
    eligible: decision.activation_eligible,
    post_last_mutation_verification: decision.activation_eligible && decision.activated,
    terminal_success_allowed: decision.allowed,
    selected_check_id: state.selected_check_id,
    mutation_revision: state.mutation_revision,
    verification_started_count: state.verification_started_count,
    verification_completed_count: state.verification_completed_count,
    terminal_reason: decision.reason,
  });
}
