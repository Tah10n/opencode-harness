import { assertEnum, assertSafeId } from "../feedback/contracts.mjs";

import {
  ENGINEERING_EXPERIMENT_SCHEMA_VERSION,
  MODEL_PROFILE_CATALOG_SCHEMA_VERSION,
  RUNTIME_MODEL_EVIDENCE_SCHEMA_VERSION,
} from "./constants.mjs";
import {
  ContractError,
  assertArray,
  assertBoolean,
  assertCommit,
  assertFingerprint,
  assertInteger,
  assertIso,
  assertSchemaVersion,
  assertString,
  assertStringArray,
  canonicalJson,
  deepFrozenClone,
  exact,
  fingerprint,
} from "./validation.mjs";

export const MODEL_PROFILE_ROLES = Object.freeze([
  "orchestrator",
  "orchestrator-deep",
  "architect",
  "general",
  "reviewer",
  "review-orchestrator",
  "verifier",
  "diagnose",
  "explore",
  "researcher",
  "improver",
]);

export const GPT56_MODEL_IDS = Object.freeze([
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-luna",
]);

export const MODEL_REASONING_EFFORTS = Object.freeze([
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);
export const MODEL_TEXT_VERBOSITIES = Object.freeze(["low", "medium", "high"]);
export const MODEL_MODES = Object.freeze(["standard", "pro"]);
export const PROFILE_PROMOTION_STATES = Object.freeze([
  "retained_baseline",
  "active_default",
  "evaluation_only",
]);
export const CAPABILITY_REQUIREMENTS = Object.freeze(["required", "unsupported", "not_applicable"]);
export const RUNTIME_EVIDENCE_KINDS = Object.freeze(["fixture_parser", "installed_runtime"]);
export const RUNTIME_OPTION_STATUSES = Object.freeze([
  "accepted",
  "unsupported",
  "absent",
  "ignored",
  "conflicting",
  "alias",
  "unparseable",
  "not_applicable",
]);
export const EXPERIMENT_VARIANTS = Object.freeze([
  "same-low",
  "same-medium",
  "lower-low",
  "lower-medium",
]);

const PROFILE_FAMILIES = Object.freeze(["gpt-5.5-baseline", "gpt-5.6-candidate"]);
const PROVENANCE_KINDS = Object.freeze(["starting_commit", "official_guidance"]);
const CAPABILITY_IDS = Object.freeze([
  "reasoning_effort_xhigh",
  "reasoning_effort_max",
  "mode_pro",
  "persisted_reasoning",
  "temperature",
]);
const RUNTIME_OPTION_IDS = Object.freeze([
  "model",
  "reasoning_effort",
  "text_verbosity",
  "mode",
  ...CAPABILITY_IDS,
]);
function assertNullableString(value, label, { maxBytes = 512 } = {}) {
  if (value === null) return null;
  return assertString(value, label, { maxBytes });
}

function assertNullableId(value, label) {
  if (value === null) return null;
  return assertSafeId(value, label);
}

function assertNullableNumber(value, label) {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ContractError("MODEL_PROFILE_NUMBER", `${label} must be a finite number or null`);
  }
  return value;
}

function withoutContentFingerprint(value) {
  const { content_fingerprint: _ignored, ...body } = value;
  return body;
}

function assertSealed(value, label) {
  assertFingerprint(value.content_fingerprint, `${label}.content_fingerprint`);
  const expected = fingerprint(withoutContentFingerprint(value));
  if (value.content_fingerprint !== expected) {
    throw new ContractError("QUALITY_CONTENT_FINGERPRINT", `${label}.content_fingerprint does not match its content`);
  }
}

function validateSource(source, label) {
  exact(source, ["id", "url", "claim_scope"], ["id", "url", "claim_scope"], label);
  assertSafeId(source.id, `${label}.id`);
  assertString(source.url, `${label}.url`, { maxBytes: 1024 });
  if (!/^https:\/\//.test(source.url)) {
    throw new ContractError("MODEL_PROFILE_SOURCE_URL", `${label}.url must be HTTPS`);
  }
  assertString(source.claim_scope, `${label}.claim_scope`, { maxBytes: 1024 });
  return source;
}

function validateCapabilityRequirement(entry, label) {
  exact(
    entry,
    ["capability_id", "classification", "installed_runtime_evidence_id", "rationale"],
    ["capability_id", "classification", "installed_runtime_evidence_id", "rationale"],
    label,
  );
  assertEnum(entry.capability_id, CAPABILITY_IDS, `${label}.capability_id`);
  assertEnum(entry.classification, CAPABILITY_REQUIREMENTS, `${label}.classification`);
  assertNullableId(entry.installed_runtime_evidence_id, `${label}.installed_runtime_evidence_id`);
  assertString(entry.rationale, `${label}.rationale`, { maxBytes: 1024 });
  return entry;
}

function validateProvenance(value, label) {
  exact(value, ["kind", "reference", "note"], ["kind", "reference", "note"], label);
  assertEnum(value.kind, PROVENANCE_KINDS, `${label}.kind`);
  assertString(value.reference, `${label}.reference`, { maxBytes: 1024 });
  assertString(value.note, `${label}.note`, { maxBytes: 1024 });
  return value;
}

function validateEligibility(value, label) {
  exact(
    value,
    ["risk_classes", "workload_classes", "prohibited_scenario_families"],
    ["risk_classes", "workload_classes", "prohibited_scenario_families"],
    label,
  );
  assertStringArray(value.risk_classes, `${label}.risk_classes`, { min: 1, max: 3 });
  for (const riskClass of value.risk_classes) {
    assertEnum(riskClass, ["standard-lite", "high", "critical"], `${label}.risk_classes[]`);
  }
  assertStringArray(value.workload_classes, `${label}.workload_classes`, { min: 1, max: 8 });
  assertStringArray(value.prohibited_scenario_families, `${label}.prohibited_scenario_families`, { max: 16 });
  return value;
}

function validateProfile(profile, label) {
  const commonKeys = [
    "profile_id",
    "family",
    "role",
    "model_id",
    "allowed_reasoning_efforts",
    "default_reasoning_effort",
    "lower_reasoning_effort",
    "text_verbosity_options",
    "default_text_verbosity",
    "mode",
    "promotion_state",
    "provenance",
    "rationale",
    "capabilities",
    "eligibility",
  ];
  exact(profile, [...commonKeys, "temperature"], commonKeys, label);
  assertSafeId(profile.profile_id, `${label}.profile_id`);
  assertEnum(profile.family, PROFILE_FAMILIES, `${label}.family`);
  assertEnum(profile.role, MODEL_PROFILE_ROLES, `${label}.role`);
  assertString(profile.model_id, `${label}.model_id`, { maxBytes: 128 });
  assertStringArray(profile.allowed_reasoning_efforts, `${label}.allowed_reasoning_efforts`, { min: 2, max: 2 });
  for (const effort of profile.allowed_reasoning_efforts) {
    assertEnum(effort, MODEL_REASONING_EFFORTS, `${label}.allowed_reasoning_efforts[]`);
  }
  if (new Set(profile.allowed_reasoning_efforts).size !== 2) {
    throw new ContractError("MODEL_PROFILE_EFFORT_DUPLICATE", `${label}.allowed_reasoning_efforts must contain two distinct values`);
  }
  assertEnum(profile.default_reasoning_effort, MODEL_REASONING_EFFORTS, `${label}.default_reasoning_effort`);
  assertEnum(profile.lower_reasoning_effort, MODEL_REASONING_EFFORTS, `${label}.lower_reasoning_effort`);
  if (
    profile.allowed_reasoning_efforts[0] !== profile.default_reasoning_effort
    || profile.allowed_reasoning_efforts[1] !== profile.lower_reasoning_effort
  ) {
    throw new ContractError("MODEL_PROFILE_EFFORT_ORDER", `${label} must list the baseline effort followed by exactly one lower effort`);
  }
  const defaultIndex = MODEL_REASONING_EFFORTS.indexOf(profile.default_reasoning_effort);
  const lowerIndex = MODEL_REASONING_EFFORTS.indexOf(profile.lower_reasoning_effort);
  if (lowerIndex !== defaultIndex - 1) {
    throw new ContractError("MODEL_PROFILE_EFFORT_LOWER", `${label}.lower_reasoning_effort must be exactly one supported level lower`);
  }
  assertStringArray(profile.text_verbosity_options, `${label}.text_verbosity_options`, { min: 2, max: 2 });
  if (canonicalJson(profile.text_verbosity_options) !== canonicalJson(["low", "medium"])) {
    throw new ContractError("MODEL_PROFILE_VERBOSITY_OPTIONS", `${label}.text_verbosity_options must be low and medium`);
  }
  assertEnum(profile.default_text_verbosity, MODEL_TEXT_VERBOSITIES, `${label}.default_text_verbosity`);
  if (!profile.text_verbosity_options.includes(profile.default_text_verbosity)) {
    throw new ContractError("MODEL_PROFILE_VERBOSITY_DEFAULT", `${label}.default_text_verbosity is not allowed`);
  }
  assertEnum(profile.mode, MODEL_MODES, `${label}.mode`);
  assertEnum(profile.promotion_state, PROFILE_PROMOTION_STATES, `${label}.promotion_state`);
  validateProvenance(profile.provenance, `${label}.provenance`);
  assertString(profile.rationale, `${label}.rationale`, { maxBytes: 2048 });
  assertArray(profile.capabilities, `${label}.capabilities`, {
    min: CAPABILITY_IDS.length,
    max: CAPABILITY_IDS.length,
    item: validateCapabilityRequirement,
  });
  const capabilityIds = profile.capabilities.map((entry) => entry.capability_id);
  if (canonicalJson(capabilityIds) !== canonicalJson(CAPABILITY_IDS)) {
    throw new ContractError("MODEL_PROFILE_CAPABILITIES", `${label}.capabilities must declare every capability in canonical order`);
  }
  validateEligibility(profile.eligibility, `${label}.eligibility`);

  if (profile.family === "gpt-5.5-baseline") {
    if (profile.promotion_state !== "retained_baseline") {
      throw new ContractError("MODEL_PROFILE_BASELINE_STATE", `${label} baseline must remain available for optional comparison`);
    }
    if (!Object.hasOwn(profile, "temperature")) {
      throw new ContractError("MODEL_PROFILE_BASELINE_TEMPERATURE", `${label} must preserve the starting temperature`);
    }
    assertNullableNumber(profile.temperature, `${label}.temperature`);
  } else {
    assertEnum(profile.model_id, GPT56_MODEL_IDS, `${label}.model_id`);
    const expectedState = profile.model_id === "openai/gpt-5.6-luna" ? "evaluation_only" : "active_default";
    if (profile.promotion_state !== expectedState) {
      throw new ContractError(
        "MODEL_PROFILE_CANDIDATE_STATE",
        `${label} promotion state must be ${expectedState}`,
      );
    }
    if (Object.hasOwn(profile, "temperature")) {
      throw new ContractError("MODEL_PROFILE_GPT56_TEMPERATURE", `${label} GPT-5.6 candidate must omit temperature`);
    }
  }

  if (profile.model_id === "openai/gpt-5.6-luna") {
    if (
      canonicalJson(profile.eligibility.risk_classes) !== canonicalJson(["standard-lite"])
      || canonicalJson(profile.eligibility.workload_classes) !== canonicalJson(["high-volume"])
    ) {
      throw new ContractError("MODEL_PROFILE_LUNA_ELIGIBILITY", `${label} Luna is only eligible for standard-lite high-volume work`);
    }
    for (const family of ["resource-lifecycle", "migration"]) {
      if (!profile.eligibility.prohibited_scenario_families.includes(family)) {
        throw new ContractError("MODEL_PROFILE_LUNA_CANARY", `${label} Luna must prohibit ${family} canaries`);
      }
    }
  }
  return profile;
}

function validateRoleMapping(mapping, label) {
  exact(
    mapping,
    ["mapping_id", "role", "baseline_profile_id", "candidate_profile_id", "hypothesis"],
    ["mapping_id", "role", "baseline_profile_id", "candidate_profile_id", "hypothesis"],
    label,
  );
  assertSafeId(mapping.mapping_id, `${label}.mapping_id`);
  assertEnum(mapping.role, MODEL_PROFILE_ROLES, `${label}.role`);
  assertSafeId(mapping.baseline_profile_id, `${label}.baseline_profile_id`);
  assertSafeId(mapping.candidate_profile_id, `${label}.candidate_profile_id`);
  assertString(mapping.hypothesis, `${label}.hypothesis`, { maxBytes: 2048 });
  return mapping;
}

export function modelProfileCatalogFingerprint(catalog) {
  return fingerprint(withoutContentFingerprint(catalog));
}

export function sealModelProfileCatalog(catalog) {
  const body = withoutContentFingerprint(catalog);
  return deepFrozenClone({ ...body, content_fingerprint: fingerprint(body) }, "model profile catalog");
}

export function validateModelProfileCatalog(catalog) {
  const keys = [
    "schema_version",
    "catalog_id",
    "baseline_commit",
    "default_profile_policy",
    "sources",
    "runtime_capability_requirements",
    "profiles",
    "role_mappings",
    "content_fingerprint",
  ];
  exact(catalog, keys, keys, "model profile catalog");
  assertSchemaVersion(catalog.schema_version, MODEL_PROFILE_CATALOG_SCHEMA_VERSION, "model profile catalog");
  assertSafeId(catalog.catalog_id, "model profile catalog.catalog_id");
  assertCommit(catalog.baseline_commit, "model profile catalog.baseline_commit");
  exact(
    catalog.default_profile_policy,
    ["active_family", "candidate_family", "state", "installed_runtime_evidence_id", "behavioral_superiority", "reason"],
    ["active_family", "candidate_family", "state", "installed_runtime_evidence_id", "behavioral_superiority", "reason"],
    "model profile catalog.default_profile_policy",
  );
  if (
    catalog.default_profile_policy.active_family !== "gpt-5.6-candidate"
    || catalog.default_profile_policy.candidate_family !== "gpt-5.6-candidate"
    || catalog.default_profile_policy.state !== "directly_activated"
    || catalog.default_profile_policy.behavioral_superiority !== "unverified"
    || catalog.default_profile_policy.installed_runtime_evidence_id !== null
  ) {
    throw new ContractError(
      "MODEL_PROFILE_DEFAULT_POLICY",
      "GPT-5.6 Sol/Terra must be active without treating optional A/B evidence as a rollout gate",
    );
  }
  assertString(catalog.default_profile_policy.reason, "model profile catalog.default_profile_policy.reason", { maxBytes: 2048 });
  assertArray(catalog.sources, "model profile catalog.sources", { min: 3, max: 8, item: validateSource });
  assertArray(catalog.runtime_capability_requirements, "model profile catalog.runtime_capability_requirements", {
    min: 3,
    max: 3,
    item: validateCapabilityRequirement,
  });
  const topCapabilityIds = catalog.runtime_capability_requirements.map((entry) => entry.capability_id);
  if (canonicalJson(topCapabilityIds) !== canonicalJson(["reasoning_effort_xhigh", "reasoning_effort_max", "mode_pro"])) {
    throw new ContractError("MODEL_PROFILE_RUNTIME_CAPABILITY_SET", "runtime capability table must explicitly cover xhigh, max, and pro");
  }
  assertArray(catalog.profiles, "model profile catalog.profiles", { min: 22, max: 32, item: validateProfile });
  const profilesById = new Map();
  for (const profile of catalog.profiles) {
    if (profilesById.has(profile.profile_id)) {
      throw new ContractError("MODEL_PROFILE_DUPLICATE", `duplicate profile ${profile.profile_id}`);
    }
    profilesById.set(profile.profile_id, profile);
  }
  assertArray(catalog.role_mappings, "model profile catalog.role_mappings", { min: 12, max: 12, item: validateRoleMapping });
  const mappingIds = new Set();
  const coveredRoles = new Set();
  let lunaMappings = 0;
  for (const mapping of catalog.role_mappings) {
    if (mappingIds.has(mapping.mapping_id)) throw new ContractError("MODEL_PROFILE_MAPPING_DUPLICATE", `duplicate mapping ${mapping.mapping_id}`);
    mappingIds.add(mapping.mapping_id);
    coveredRoles.add(mapping.role);
    const baseline = profilesById.get(mapping.baseline_profile_id);
    const candidate = profilesById.get(mapping.candidate_profile_id);
    if (!baseline || !candidate) throw new ContractError("MODEL_PROFILE_MAPPING_UNKNOWN", `${mapping.mapping_id} references an unknown profile`);
    if (baseline.family !== "gpt-5.5-baseline" || candidate.family !== "gpt-5.6-candidate") {
      throw new ContractError("MODEL_PROFILE_MAPPING_FAMILY", `${mapping.mapping_id} must bind baseline to candidate`);
    }
    if (baseline.role !== mapping.role || candidate.role !== mapping.role) {
      throw new ContractError("MODEL_PROFILE_MAPPING_ROLE", `${mapping.mapping_id} role/profile identity mismatch`);
    }
    if (candidate.model_id === "openai/gpt-5.6-luna") lunaMappings += 1;
    if (mapping.mapping_id.endsWith("-primary") && candidate.promotion_state !== "active_default") {
      throw new ContractError("MODEL_PROFILE_ACTIVE_MAPPING", `${mapping.mapping_id} must reference an active-default profile`);
    }
    if (!mapping.mapping_id.endsWith("-primary") && candidate.promotion_state !== "evaluation_only") {
      throw new ContractError("MODEL_PROFILE_EVALUATION_MAPPING", `${mapping.mapping_id} must remain evaluation-only`);
    }
  }
  if (coveredRoles.size !== MODEL_PROFILE_ROLES.length || MODEL_PROFILE_ROLES.some((role) => !coveredRoles.has(role))) {
    throw new ContractError("MODEL_PROFILE_ROLE_COVERAGE", "all 11 harness roles must have a primary mapping");
  }
  if (lunaMappings !== 1) {
    throw new ContractError("MODEL_PROFILE_LUNA_MAPPING", "exactly one evaluation-only Luna mapping is required");
  }
  const exploreBaseline = catalog.profiles.find((profile) => profile.profile_id === "baseline-explore");
  if (
    !exploreBaseline
    || exploreBaseline.model_id !== "openai/gpt-5.4-mini-fast"
    || !/legacy-model exception/i.test(exploreBaseline.provenance.note)
  ) {
    throw new ContractError("MODEL_PROFILE_EXPLORE_EXCEPTION", "the starting explore legacy-model exception must be explicit and unchanged");
  }
  assertSealed(catalog, "model profile catalog");
  return catalog;
}

function validateRuntimeOptionResult(entry, label) {
  exact(
    entry,
    ["option_id", "requested_value", "effective_value", "status"],
    ["option_id", "requested_value", "effective_value", "status"],
    label,
  );
  assertEnum(entry.option_id, RUNTIME_OPTION_IDS, `${label}.option_id`);
  assertNullableString(entry.requested_value, `${label}.requested_value`);
  assertNullableString(entry.effective_value, `${label}.effective_value`);
  assertEnum(entry.status, RUNTIME_OPTION_STATUSES, `${label}.status`);
  return entry;
}

export function runtimeModelEvidenceFingerprint(evidence) {
  return fingerprint(withoutContentFingerprint(evidence));
}

export function sealRuntimeModelEvidence(evidence) {
  const body = withoutContentFingerprint(evidence);
  return deepFrozenClone({ ...body, content_fingerprint: fingerprint(body) }, "runtime model evidence");
}

export function validateRuntimeModelEvidence(evidence, { catalog = null } = {}) {
  const keys = [
    "schema_version",
    "evidence_id",
    "evidence_kind",
    "runtime_name",
    "runtime_version",
    "captured_at",
    "catalog_id",
    "catalog_fingerprint",
    "requested_profile_id",
    "requested_model_id",
    "effective_model_id",
    "option_results",
    "complete",
    "source_command_id",
    "content_fingerprint",
  ];
  exact(evidence, keys, keys, "runtime model evidence");
  assertSchemaVersion(evidence.schema_version, RUNTIME_MODEL_EVIDENCE_SCHEMA_VERSION, "runtime model evidence");
  assertSafeId(evidence.evidence_id, "runtime model evidence.evidence_id");
  assertEnum(evidence.evidence_kind, RUNTIME_EVIDENCE_KINDS, "runtime model evidence.evidence_kind");
  assertString(evidence.runtime_name, "runtime model evidence.runtime_name", { maxBytes: 128 });
  assertNullableString(evidence.runtime_version, "runtime model evidence.runtime_version", { maxBytes: 128 });
  assertIso(evidence.captured_at, "runtime model evidence.captured_at");
  assertSafeId(evidence.catalog_id, "runtime model evidence.catalog_id");
  assertFingerprint(evidence.catalog_fingerprint, "runtime model evidence.catalog_fingerprint");
  assertSafeId(evidence.requested_profile_id, "runtime model evidence.requested_profile_id");
  assertString(evidence.requested_model_id, "runtime model evidence.requested_model_id", { maxBytes: 128 });
  assertNullableString(evidence.effective_model_id, "runtime model evidence.effective_model_id", { maxBytes: 128 });
  assertArray(evidence.option_results, "runtime model evidence.option_results", { min: 1, max: 16, item: validateRuntimeOptionResult });
  const optionIds = evidence.option_results.map((entry) => entry.option_id);
  if (new Set(optionIds).size !== optionIds.length) {
    throw new ContractError("RUNTIME_MODEL_OPTION_DUPLICATE", "runtime model evidence option IDs must be unique");
  }
  assertBoolean(evidence.complete, "runtime model evidence.complete");
  const options = new Map(evidence.option_results.map((entry) => [entry.option_id, entry]));
  const completeFromContent = evidence.effective_model_id !== null
    && ["model", "reasoning_effort", "text_verbosity", "mode"].every((optionId) => options.get(optionId)?.status === "accepted")
    && evidence.option_results.every((entry) => entry.status === "accepted");
  if (evidence.complete !== completeFromContent) {
    throw new ContractError(
      "RUNTIME_MODEL_COMPLETENESS",
      "runtime evidence complete must exactly match effective model and accepted option results",
    );
  }
  assertString(evidence.source_command_id, "runtime model evidence.source_command_id", { maxBytes: 256 });
  assertSealed(evidence, "runtime model evidence");

  if (catalog) {
    validateModelProfileCatalog(catalog);
    if (evidence.catalog_id !== catalog.catalog_id || evidence.catalog_fingerprint !== catalog.content_fingerprint) {
      throw new ContractError("RUNTIME_MODEL_CATALOG_MISMATCH", "runtime evidence does not bind the supplied catalog");
    }
    const profile = catalog.profiles.find((entry) => entry.profile_id === evidence.requested_profile_id);
    if (!profile || profile.model_id !== evidence.requested_model_id) {
      throw new ContractError("RUNTIME_MODEL_PROFILE_MISMATCH", "runtime evidence requested identity does not match the catalog profile");
    }
  }
  return evidence;
}

export function evaluateRuntimeModelEvidence(evidence, catalog, { purpose = "candidate_execution", expectedInvocation = null } = {}) {
  assertEnum(purpose, ["candidate_execution", "default_promotion", "max_experiment", "pro_experiment"], "runtime evidence purpose");
  validateRuntimeModelEvidence(evidence, { catalog });
  const profile = catalog.profiles.find((entry) => entry.profile_id === evidence.requested_profile_id);
  if (expectedInvocation !== null) {
    validateInvocation(expectedInvocation, "runtime evidence expected invocation");
    if (
      expectedInvocation.profile_id !== profile.profile_id
      || expectedInvocation.role !== profile.role
      || expectedInvocation.model_id !== profile.model_id
    ) {
      throw new ContractError("RUNTIME_MODEL_PROFILE_MISMATCH", "expected invocation does not bind the runtime evidence profile");
    }
  }
  const reasonCodes = [];
  if (evidence.evidence_kind !== "installed_runtime") reasonCodes.push("RUNTIME_MODEL_INSTALLED_EVIDENCE_REQUIRED");
  if (evidence.evidence_kind === "installed_runtime" && evidence.runtime_version === null) {
    reasonCodes.push("RUNTIME_MODEL_RUNTIME_VERSION_ABSENT");
  }
  if (!evidence.complete) reasonCodes.push("RUNTIME_MODEL_EVIDENCE_INCOMPLETE");
  if (evidence.effective_model_id === null) reasonCodes.push("RUNTIME_MODEL_EFFECTIVE_MODEL_ABSENT");
  else if (evidence.effective_model_id !== profile.model_id) reasonCodes.push("RUNTIME_MODEL_EFFECTIVE_MODEL_MISMATCH");

  const results = new Map(evidence.option_results.map((entry) => [entry.option_id, entry]));
  for (const optionId of ["model", "reasoning_effort", "text_verbosity", "mode"]) {
    const result = results.get(optionId);
    if (!result) {
      reasonCodes.push(`RUNTIME_MODEL_OPTION_${optionId.toUpperCase()}_ABSENT`);
      continue;
    }
    if (result.status !== "accepted") {
      reasonCodes.push(`RUNTIME_MODEL_OPTION_${optionId.toUpperCase()}_${result.status.toUpperCase()}`);
    }
  }
  const expected = {
    model: expectedInvocation?.model_id ?? profile.model_id,
    reasoning_effort: expectedInvocation?.reasoning_effort ?? profile.default_reasoning_effort,
    text_verbosity: expectedInvocation?.text_verbosity ?? profile.default_text_verbosity,
    mode: expectedInvocation?.mode ?? profile.mode,
  };
  for (const [optionId, expectedValue] of Object.entries(expected)) {
    const result = results.get(optionId);
    if (result?.status === "accepted") {
      if (result.requested_value !== expectedValue) {
        reasonCodes.push(`RUNTIME_MODEL_OPTION_${optionId.toUpperCase()}_REQUEST_MISMATCH`);
      }
      if (result.effective_value !== expectedValue) {
        reasonCodes.push(`RUNTIME_MODEL_OPTION_${optionId.toUpperCase()}_VALUE_MISMATCH`);
      }
    }
  }

  const capabilityById = new Map(catalog.runtime_capability_requirements.map((entry) => [entry.capability_id, entry]));
  const purposeCapability = {
    max_experiment: "reasoning_effort_max",
    pro_experiment: "mode_pro",
  }[purpose];
  const requiredCapabilityIds = expectedInvocation === null
    ? new Set(profile.capabilities
      .filter((entry) => entry.classification === "required")
      .map((entry) => entry.capability_id))
    : new Set([
      ...(expectedInvocation.reasoning_effort === "xhigh" ? ["reasoning_effort_xhigh"] : []),
      ...(expectedInvocation.reasoning_effort === "max" ? ["reasoning_effort_max"] : []),
      ...(expectedInvocation.mode === "pro" ? ["mode_pro"] : []),
    ]);
  if (purposeCapability) requiredCapabilityIds.add(purposeCapability);
  for (const capabilityId of requiredCapabilityIds) {
    const declaration = capabilityById.get(capabilityId);
    const profileDeclaration = profile.capabilities.find((entry) => entry.capability_id === capabilityId);
    const result = results.get(capabilityId);
    if (!declaration || declaration.classification !== "required") {
      reasonCodes.push(`RUNTIME_MODEL_CAPABILITY_${capabilityId.toUpperCase()}_NOT_REQUIRED`);
    }
    if (!result || result.status !== "accepted") {
      reasonCodes.push(`RUNTIME_MODEL_CAPABILITY_${capabilityId.toUpperCase()}_UNPROVEN`);
    }
    if (
      profileDeclaration?.classification === "required"
      && profileDeclaration.installed_runtime_evidence_id !== null
      && profileDeclaration.installed_runtime_evidence_id !== evidence.evidence_id
    ) {
      reasonCodes.push(`RUNTIME_MODEL_CAPABILITY_${capabilityId.toUpperCase()}_PROFILE_UNBOUND`);
    }
    if (
      declaration?.classification === "required"
      && declaration.installed_runtime_evidence_id !== null
      && declaration.installed_runtime_evidence_id !== evidence.evidence_id
    ) {
      reasonCodes.push(`RUNTIME_MODEL_CAPABILITY_${capabilityId.toUpperCase()}_CATALOG_UNBOUND`);
    }
  }
  if (purpose === "default_promotion") {
    reasonCodes.push("RUNTIME_MODEL_BEHAVIORAL_ACCEPTANCE_REQUIRED");
  }
  return deepFrozenClone({
    eligible: reasonCodes.length === 0,
    purpose,
    evidence_id: evidence.evidence_id,
    profile_id: profile.profile_id,
    reason_codes: [...new Set(reasonCodes)].sort(),
  }, "runtime model evidence decision");
}

export function bindInstalledRuntimeEvidence(catalog, evidence) {
  validateModelProfileCatalog(catalog);
  validateRuntimeModelEvidence(evidence, { catalog });
  if (evidence.evidence_kind !== "installed_runtime" || !evidence.complete || evidence.runtime_version === null) {
    throw new ContractError("RUNTIME_MODEL_BINDING_EVIDENCE", "only complete versioned installed-runtime evidence can bind capabilities");
  }
  const acceptedCapabilities = new Set(
    evidence.option_results
      .filter((entry) => CAPABILITY_IDS.includes(entry.option_id) && entry.status === "accepted")
      .map((entry) => entry.option_id),
  );
  const body = JSON.parse(canonicalJson(catalog));
  delete body.content_fingerprint;
  const profile = body.profiles.find((entry) => entry.profile_id === evidence.requested_profile_id);
  for (const capability of profile.capabilities) {
    if (capability.classification === "required" && acceptedCapabilities.has(capability.capability_id)) {
      capability.installed_runtime_evidence_id = evidence.evidence_id;
    }
  }
  for (const capability of body.runtime_capability_requirements) {
    if (capability.classification === "required" && acceptedCapabilities.has(capability.capability_id)) {
      capability.installed_runtime_evidence_id = evidence.evidence_id;
    }
  }
  const bound = sealModelProfileCatalog(body);
  validateModelProfileCatalog(bound);
  return bound;
}

function validateInvocation(value, label) {
  exact(
    value,
    ["role", "profile_id", "model_id", "reasoning_effort", "text_verbosity", "mode"],
    ["role", "profile_id", "model_id", "reasoning_effort", "text_verbosity", "mode"],
    label,
  );
  assertEnum(value.role, MODEL_PROFILE_ROLES, `${label}.role`);
  assertSafeId(value.profile_id, `${label}.profile_id`);
  assertString(value.model_id, `${label}.model_id`, { maxBytes: 128 });
  assertEnum(value.reasoning_effort, MODEL_REASONING_EFFORTS, `${label}.reasoning_effort`);
  assertEnum(value.text_verbosity, MODEL_TEXT_VERBOSITIES, `${label}.text_verbosity`);
  assertEnum(value.mode, MODEL_MODES, `${label}.mode`);
  return value;
}

function validateScenarioCell(cell, label) {
  const keys = [
    "scenario_id",
    "suite",
    "role",
    "scenario_family",
    "risk_class",
    "workload_class",
    "baseline_profile_id",
    "candidate_profile_id",
    "fixture_id",
    "corpus_fingerprint",
    "quality_focus",
  ];
  exact(cell, keys, keys, label);
  assertSafeId(cell.scenario_id, `${label}.scenario_id`);
  assertEnum(cell.suite, ["development", "held_out", "canary"], `${label}.suite`);
  assertEnum(cell.role, MODEL_PROFILE_ROLES, `${label}.role`);
  assertSafeId(cell.scenario_family, `${label}.scenario_family`);
  assertEnum(cell.risk_class, ["standard-lite", "high", "critical"], `${label}.risk_class`);
  assertSafeId(cell.workload_class, `${label}.workload_class`);
  assertSafeId(cell.baseline_profile_id, `${label}.baseline_profile_id`);
  assertSafeId(cell.candidate_profile_id, `${label}.candidate_profile_id`);
  assertSafeId(cell.fixture_id, `${label}.fixture_id`);
  assertFingerprint(cell.corpus_fingerprint, `${label}.corpus_fingerprint`);
  assertString(cell.quality_focus, `${label}.quality_focus`, { maxBytes: 1024 });
  return cell;
}

function validateComparison(comparison, label) {
  const keys = [
    "comparison_id",
    "comparison_group_id",
    "scenario_id",
    "role",
    "repetition",
    "fixture_id",
    "corpus_fingerprint",
    "variant_id",
    "baseline_invocation",
    "candidate_invocation",
    "status",
    "report_id",
  ];
  exact(comparison, keys, keys, label);
  assertSafeId(comparison.comparison_id, `${label}.comparison_id`);
  assertSafeId(comparison.comparison_group_id, `${label}.comparison_group_id`);
  assertSafeId(comparison.scenario_id, `${label}.scenario_id`);
  assertEnum(comparison.role, MODEL_PROFILE_ROLES, `${label}.role`);
  assertInteger(comparison.repetition, `${label}.repetition`, { min: 1, max: 2 });
  assertSafeId(comparison.fixture_id, `${label}.fixture_id`);
  assertFingerprint(comparison.corpus_fingerprint, `${label}.corpus_fingerprint`);
  assertEnum(comparison.variant_id, EXPERIMENT_VARIANTS, `${label}.variant_id`);
  validateInvocation(comparison.baseline_invocation, `${label}.baseline_invocation`);
  validateInvocation(comparison.candidate_invocation, `${label}.candidate_invocation`);
  if (comparison.status !== "planned") {
    throw new ContractError("MODEL_EXPERIMENT_STATUS", `${label}.status must remain planned until live evidence exists`);
  }
  if (comparison.report_id !== null) {
    throw new ContractError("MODEL_EXPERIMENT_REPORT", `${label}.report_id must remain null for the checked-in unexecuted plan`);
  }
  return comparison;
}

export function engineeringExperimentFingerprint(manifest) {
  return fingerprint(withoutContentFingerprint(manifest));
}

export function sealEngineeringExperimentManifest(manifest) {
  const body = withoutContentFingerprint(manifest);
  return deepFrozenClone({ ...body, content_fingerprint: fingerprint(body) }, "engineering experiment manifest");
}

export function validateEngineeringExperimentManifest(manifest, { catalog }) {
  validateModelProfileCatalog(catalog);
  const keys = [
    "schema_version",
    "experiment_id",
    "catalog_id",
    "catalog_fingerprint",
    "execution_state",
    "repetitions",
    "variants",
    "scenario_cells",
    "comparisons",
    "content_fingerprint",
  ];
  exact(manifest, keys, keys, "engineering experiment manifest");
  assertSchemaVersion(manifest.schema_version, ENGINEERING_EXPERIMENT_SCHEMA_VERSION, "engineering experiment manifest");
  assertSafeId(manifest.experiment_id, "engineering experiment manifest.experiment_id");
  if (manifest.catalog_id !== catalog.catalog_id || manifest.catalog_fingerprint !== catalog.content_fingerprint) {
    throw new ContractError("MODEL_EXPERIMENT_CATALOG", "experiment manifest does not bind the supplied catalog");
  }
  if (manifest.execution_state !== "planned_unexecuted") {
    throw new ContractError("MODEL_EXPERIMENT_EXECUTION_STATE", "checked-in experiment must not claim live execution");
  }
  if (canonicalJson(manifest.repetitions) !== canonicalJson([1, 2])) {
    throw new ContractError("MODEL_EXPERIMENT_REPETITIONS", "experiment must have exactly two repetitions");
  }
  if (canonicalJson(manifest.variants) !== canonicalJson(EXPERIMENT_VARIANTS)) {
    throw new ContractError("MODEL_EXPERIMENT_VARIANTS", "experiment must contain the four required variants in canonical order");
  }
  assertArray(manifest.scenario_cells, "engineering experiment manifest.scenario_cells", { min: 12, max: 12, item: validateScenarioCell });
  assertArray(manifest.comparisons, "engineering experiment manifest.comparisons", { min: 96, max: 96, item: validateComparison });

  const profiles = new Map(catalog.profiles.map((entry) => [entry.profile_id, entry]));
  const cells = new Map();
  const roles = new Set();
  for (const cell of manifest.scenario_cells) {
    if (cells.has(cell.scenario_id)) throw new ContractError("MODEL_EXPERIMENT_SCENARIO_DUPLICATE", `duplicate scenario ${cell.scenario_id}`);
    cells.set(cell.scenario_id, cell);
    roles.add(cell.role);
    const baseline = profiles.get(cell.baseline_profile_id);
    const candidate = profiles.get(cell.candidate_profile_id);
    if (!baseline || !candidate || baseline.role !== cell.role || candidate.role !== cell.role) {
      throw new ContractError("MODEL_EXPERIMENT_SCENARIO_PROFILE", `${cell.scenario_id} has an invalid role/profile identity`);
    }
    if (candidate.model_id === "openai/gpt-5.6-luna") {
      if (cell.risk_class !== "standard-lite" || cell.workload_class !== "high-volume") {
        throw new ContractError("MODEL_EXPERIMENT_LUNA_ELIGIBILITY", `${cell.scenario_id} violates Luna eligibility`);
      }
      if (["resource-lifecycle", "migration"].includes(cell.scenario_family)) {
        throw new ContractError("MODEL_EXPERIMENT_LUNA_CANARY", `${cell.scenario_id} assigns a prohibited canary to Luna`);
      }
    }
  }
  if (roles.size !== MODEL_PROFILE_ROLES.length || MODEL_PROFILE_ROLES.some((role) => !roles.has(role))) {
    throw new ContractError("MODEL_EXPERIMENT_ROLE_COVERAGE", "all 11 agent roles must be primary in at least one scenario cell");
  }

  const comparisonIds = new Set();
  const groups = new Map();
  for (const comparison of manifest.comparisons) {
    if (comparisonIds.has(comparison.comparison_id)) {
      throw new ContractError("MODEL_EXPERIMENT_COMPARISON_DUPLICATE", `duplicate comparison ${comparison.comparison_id}`);
    }
    comparisonIds.add(comparison.comparison_id);
    const cell = cells.get(comparison.scenario_id);
    if (!cell) throw new ContractError("MODEL_EXPERIMENT_SCENARIO_UNKNOWN", `${comparison.comparison_id} references an unknown scenario`);
    if (
      comparison.role !== cell.role
      || comparison.fixture_id !== cell.fixture_id
      || comparison.corpus_fingerprint !== cell.corpus_fingerprint
    ) {
      throw new ContractError("MODEL_EXPERIMENT_GROUP_IDENTITY", `${comparison.comparison_id} changes the paired scenario identity`);
    }
    const expectedGroupId = `${cell.scenario_id}-r${comparison.repetition}`;
    if (comparison.comparison_group_id !== expectedGroupId) {
      throw new ContractError("MODEL_EXPERIMENT_GROUP_ID", `${comparison.comparison_id} has an invalid comparison group`);
    }
    const baseline = profiles.get(cell.baseline_profile_id);
    const candidate = profiles.get(cell.candidate_profile_id);
    if (
      comparison.baseline_invocation.role !== cell.role
      || comparison.baseline_invocation.profile_id !== baseline.profile_id
      || comparison.baseline_invocation.model_id !== baseline.model_id
      || comparison.candidate_invocation.role !== cell.role
      || comparison.candidate_invocation.profile_id !== candidate.profile_id
      || comparison.candidate_invocation.model_id !== candidate.model_id
    ) {
      throw new ContractError("MODEL_EXPERIMENT_INVOCATION_IDENTITY", `${comparison.comparison_id} does not bind exact role/profile/model identity`);
    }
    const lower = comparison.variant_id.startsWith("lower-");
    const verbosity = comparison.variant_id.endsWith("-medium") ? "medium" : "low";
    if (
      comparison.baseline_invocation.reasoning_effort !== baseline.default_reasoning_effort
      || comparison.candidate_invocation.reasoning_effort !== (lower ? candidate.lower_reasoning_effort : candidate.default_reasoning_effort)
      || comparison.baseline_invocation.text_verbosity !== verbosity
      || comparison.candidate_invocation.text_verbosity !== verbosity
      || comparison.baseline_invocation.mode !== baseline.mode
      || comparison.candidate_invocation.mode !== candidate.mode
    ) {
      throw new ContractError("MODEL_EXPERIMENT_VARIANT_OPTIONS", `${comparison.comparison_id} does not implement its declared variant`);
    }
    const group = groups.get(expectedGroupId) ?? [];
    group.push(comparison);
    groups.set(expectedGroupId, group);
  }
  if (groups.size !== 24) throw new ContractError("MODEL_EXPERIMENT_GROUP_COUNT", "experiment must contain 24 scenario/repetition groups");
  for (const [groupId, comparisons] of groups) {
    if (
      comparisons.length !== 4
      || canonicalJson(comparisons.map((entry) => entry.variant_id).sort()) !== canonicalJson([...EXPERIMENT_VARIANTS].sort())
    ) {
      throw new ContractError("MODEL_EXPERIMENT_GROUP_VARIANTS", `${groupId} must contain exactly the four required variants`);
    }
    const identities = comparisons.map((entry) => canonicalJson({
      scenario_id: entry.scenario_id,
      repetition: entry.repetition,
      fixture_id: entry.fixture_id,
      corpus_fingerprint: entry.corpus_fingerprint,
      role: entry.role,
    }));
    if (new Set(identities).size !== 1) {
      throw new ContractError("MODEL_EXPERIMENT_PAIRING", `${groupId} does not preserve identical paired fixture/corpus identity`);
    }
  }
  assertSealed(manifest, "engineering experiment manifest");
  return manifest;
}

export function createEngineeringExperimentManifest(catalog, scenarioCells, {
  experimentId = "gpt56-role-ab-v1",
} = {}) {
  validateModelProfileCatalog(catalog);
  assertArray(scenarioCells, "scenarioCells", { min: 12, max: 12, item: validateScenarioCell });
  const profiles = new Map(catalog.profiles.map((entry) => [entry.profile_id, entry]));
  const comparisons = [];
  for (const cell of scenarioCells) {
    const baseline = profiles.get(cell.baseline_profile_id);
    const candidate = profiles.get(cell.candidate_profile_id);
    if (!baseline || !candidate) {
      throw new ContractError("MODEL_EXPERIMENT_PROFILE_UNKNOWN", `${cell.scenario_id} references an unknown profile`);
    }
    for (const repetition of [1, 2]) {
      for (const variantId of EXPERIMENT_VARIANTS) {
        const lower = variantId.startsWith("lower-");
        const verbosity = variantId.endsWith("-medium") ? "medium" : "low";
        comparisons.push({
          comparison_id: `${cell.scenario_id}-r${repetition}-${variantId}`,
          comparison_group_id: `${cell.scenario_id}-r${repetition}`,
          scenario_id: cell.scenario_id,
          role: cell.role,
          repetition,
          fixture_id: cell.fixture_id,
          corpus_fingerprint: cell.corpus_fingerprint,
          variant_id: variantId,
          baseline_invocation: {
            role: cell.role,
            profile_id: baseline.profile_id,
            model_id: baseline.model_id,
            reasoning_effort: baseline.default_reasoning_effort,
            text_verbosity: verbosity,
            mode: baseline.mode,
          },
          candidate_invocation: {
            role: cell.role,
            profile_id: candidate.profile_id,
            model_id: candidate.model_id,
            reasoning_effort: lower ? candidate.lower_reasoning_effort : candidate.default_reasoning_effort,
            text_verbosity: verbosity,
            mode: candidate.mode,
          },
          status: "planned",
          report_id: null,
        });
      }
    }
  }
  const sealed = sealEngineeringExperimentManifest({
    schema_version: ENGINEERING_EXPERIMENT_SCHEMA_VERSION,
    experiment_id: experimentId,
    catalog_id: catalog.catalog_id,
    catalog_fingerprint: catalog.content_fingerprint,
    execution_state: "planned_unexecuted",
    repetitions: [1, 2],
    variants: [...EXPERIMENT_VARIANTS],
    scenario_cells: scenarioCells,
    comparisons,
  });
  validateEngineeringExperimentManifest(sealed, { catalog });
  return sealed;
}

function capabilitiesForProfile({ defaultEffort, candidate }) {
  return CAPABILITY_IDS.map((capabilityId) => {
    let classification = "not_applicable";
    let rationale = "This capability is outside the bounded Milestone 2 comparison.";
    if (capabilityId === "reasoning_effort_xhigh" && defaultEffort === "xhigh") {
      classification = "required";
      rationale = "The exact xhigh option needs installed-runtime evidence before this profile can execute.";
    } else if (capabilityId === "reasoning_effort_max") {
      rationale = "Max remains out of the comparison until installed-runtime evidence proves the option surface.";
    } else if (capabilityId === "mode_pro") {
      rationale = "Pro mode remains out of the comparison because no installed OpenCode option key is proven.";
    } else if (capabilityId === "persisted_reasoning") {
      rationale = "Persisted reasoning remains out of scope because no safe installed host integration is proven.";
    } else if (capabilityId === "temperature" && candidate) {
      classification = "unsupported";
      rationale = "GPT-5.6 candidate profiles omit temperature; provider metadata marks it unsupported.";
    } else if (capabilityId === "temperature") {
      rationale = "The baseline preserves the starting temperature as evidence, not as a GPT-5.6 capability claim.";
    }
    return {
      capability_id: capabilityId,
      classification,
      installed_runtime_evidence_id: null,
      rationale,
    };
  });
}

export function createDefaultModelProfileCatalog() {
  const baselineCommit = "0a1d56605b9b8923ac27c3b3b405b38177ca7741";
  const baselines = [
    ["orchestrator", "openai/gpt-5.5", "xhigh", 0.2],
    ["orchestrator-deep", "openai/gpt-5.5", "xhigh", 0.1],
    ["architect", "openai/gpt-5.5", "high", 0.1],
    ["general", "openai/gpt-5.5", "high", 0.2],
    ["reviewer", "openai/gpt-5.5", "high", 0.1],
    ["review-orchestrator", "openai/gpt-5.5", "xhigh", 0.1],
    ["verifier", "openai/gpt-5.5", "medium", 0.1],
    ["diagnose", "openai/gpt-5.5", "high", 0.1],
    ["explore", "openai/gpt-5.4-mini-fast", "low", 0.1],
    ["researcher", "openai/gpt-5.5", "medium", 0.1],
    ["improver", "openai/gpt-5.5", "high", 0.1],
  ];
  const lowerEffort = {
    low: "none",
    medium: "low",
    high: "medium",
    xhigh: "high",
  };
  const baselineProfiles = baselines.map(([role, modelId, effort, temperature]) => ({
    profile_id: `baseline-${role}`,
    family: "gpt-5.5-baseline",
    role,
    model_id: modelId,
    allowed_reasoning_efforts: [effort, lowerEffort[effort]],
    default_reasoning_effort: effort,
    lower_reasoning_effort: lowerEffort[effort],
    text_verbosity_options: ["low", "medium"],
    default_text_verbosity: "low",
    mode: "standard",
    promotion_state: "retained_baseline",
    provenance: {
      kind: "starting_commit",
      reference: baselineCommit,
      note: role === "explore"
        ? "Explicit legacy-model exception preserved from the starting commit; it is not silently normalized to GPT-5.5."
        : "Exact role model and options preserved from the starting commit.",
    },
    rationale: "Immutable paired-evaluation baseline; retaining it prevents configuration parsing from being mistaken for GPT-5.6 acceptance.",
    capabilities: capabilitiesForProfile({ defaultEffort: effort, candidate: false }),
    eligibility: {
      risk_classes: ["standard-lite", "high", "critical"],
      workload_classes: ["general", "bounded-exploration", "research-sidecar", "high-volume"],
      prohibited_scenario_families: [],
    },
    temperature,
  }));

  const candidateModelForRole = {
    explore: "openai/gpt-5.6-terra",
    researcher: "openai/gpt-5.6-terra",
  };
  const candidateProfiles = baselines.map(([role, _modelId, effort]) => {
    const modelId = candidateModelForRole[role] ?? "openai/gpt-5.6-sol";
    const terra = modelId.endsWith("-terra");
    return {
      profile_id: `candidate-${terra ? "terra" : "sol"}-${role}`,
      family: "gpt-5.6-candidate",
      role,
      model_id: modelId,
      allowed_reasoning_efforts: [effort, lowerEffort[effort]],
      default_reasoning_effort: effort,
      lower_reasoning_effort: lowerEffort[effort],
      text_verbosity_options: ["low", "medium"],
      default_text_verbosity: "low",
      mode: "standard",
      promotion_state: "active_default",
      provenance: {
        kind: "official_guidance",
        reference: terra
          ? "https://models.dev/models/openai/gpt-5.6-terra/"
          : "https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.6",
        note: "Exact model identity is a quality-first hypothesis; installed runtime support and behavioral superiority remain unverified.",
      },
      rationale: terra
        ? "Evaluate Terra only for bounded exploration or research sidecars where completeness does not regress."
        : "Evaluate Sol for decision, architecture, implementation, review, diagnosis, verification, or integration work.",
      capabilities: capabilitiesForProfile({ defaultEffort: effort, candidate: true }),
      eligibility: terra
        ? {
            risk_classes: ["standard-lite", "high"],
            workload_classes: ["bounded-exploration", "research-sidecar"],
            prohibited_scenario_families: ["resource-lifecycle", "migration"],
          }
        : {
            risk_classes: ["standard-lite", "high", "critical"],
            workload_classes: ["general", "bounded-exploration", "research-sidecar", "high-volume"],
            prohibited_scenario_families: [],
          },
    };
  });
  const lunaProfile = {
    profile_id: "candidate-luna-general-high-volume",
    family: "gpt-5.6-candidate",
    role: "general",
    model_id: "openai/gpt-5.6-luna",
    allowed_reasoning_efforts: ["high", "medium"],
    default_reasoning_effort: "high",
    lower_reasoning_effort: "medium",
    text_verbosity_options: ["low", "medium"],
    default_text_verbosity: "low",
    mode: "standard",
    promotion_state: "evaluation_only",
    provenance: {
      kind: "official_guidance",
      reference: "https://models.dev/models/openai/gpt-5.6-luna/",
      note: "Evaluation-only exact model identity; no runtime or quality acceptance is claimed.",
    },
    rationale: "Evaluate only for high-volume, low-risk implementation work and reject any hidden-quality regression.",
    capabilities: capabilitiesForProfile({ defaultEffort: "high", candidate: true }),
    eligibility: {
      risk_classes: ["standard-lite"],
      workload_classes: ["high-volume"],
      prohibited_scenario_families: ["resource-lifecycle", "migration"],
    },
  };

  const primaryMappings = MODEL_PROFILE_ROLES.map((role) => {
    const candidate = candidateProfiles.find((profile) => profile.role === role);
    const modelName = candidate.model_id.split("-").at(-1);
    return {
      mapping_id: `map-${role}-primary`,
      role,
      baseline_profile_id: `baseline-${role}`,
      candidate_profile_id: candidate.profile_id,
      hypothesis: modelName === "terra"
        ? "Terra may preserve bounded discovery completeness at lower cost; hidden completeness metrics decide."
        : "Sol may improve quality for this decision or execution role; paired hidden-quality evidence decides.",
    };
  });
  primaryMappings.push({
    mapping_id: "map-general-luna-evaluation",
    role: "general",
    baseline_profile_id: "baseline-general",
    candidate_profile_id: "candidate-luna-general-high-volume",
    hypothesis: "Luna may be useful only for standard-lite high-volume work when hidden quality does not regress.",
  });

  const catalog = sealModelProfileCatalog({
    schema_version: MODEL_PROFILE_CATALOG_SCHEMA_VERSION,
    catalog_id: "gpt56-role-catalog-v1",
    baseline_commit: baselineCommit,
    default_profile_policy: {
      active_family: "gpt-5.6-candidate",
      candidate_family: "gpt-5.6-candidate",
      state: "directly_activated",
      installed_runtime_evidence_id: null,
      behavioral_superiority: "unverified",
      reason: "GPT-5.6 Sol/Terra are active by explicit configuration policy; optional A/B evidence may measure behavior but does not gate activation or claim superiority.",
    },
    sources: [
      {
        id: "openai-latest-model-guide",
        url: "https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.6",
        claim_scope: "Exact GPT-5.6 model identities and migration guidance.",
      },
      {
        id: "openai-reasoning-guide",
        url: "https://developers.openai.com/api/docs/guides/reasoning",
        claim_scope: "Reasoning effort and API-level reasoning capabilities; not proof of OpenCode option keys.",
      },
      {
        id: "opencode-agent-docs",
        url: "https://opencode.ai/docs/agents/",
        claim_scope: "Documented OpenCode agent model and camelCase option surface.",
      },
      {
        id: "models-dev-sol",
        url: "https://models.dev/models/openai/gpt-5.6-sol/",
        claim_scope: "Provider model identity and temperature capability metadata.",
      },
      {
        id: "models-dev-terra",
        url: "https://models.dev/models/openai/gpt-5.6-terra/",
        claim_scope: "Provider model identity for the bounded exploration hypothesis.",
      },
      {
        id: "models-dev-luna",
        url: "https://models.dev/models/openai/gpt-5.6-luna/",
        claim_scope: "Provider model identity for the evaluation-only high-volume hypothesis.",
      },
    ],
    runtime_capability_requirements: [
      {
        capability_id: "reasoning_effort_xhigh",
        classification: "required",
        installed_runtime_evidence_id: null,
        rationale: "Hard architecture and review candidates need installed evidence that xhigh is effective, not ignored.",
      },
      {
        capability_id: "reasoning_effort_max",
        classification: "not_applicable",
        installed_runtime_evidence_id: null,
        rationale: "Max comparisons are excluded until the installed runtime proves an exact supported option.",
      },
      {
        capability_id: "mode_pro",
        classification: "not_applicable",
        installed_runtime_evidence_id: null,
        rationale: "Pro comparisons are excluded because no OpenCode configuration key has installed-runtime proof.",
      },
    ],
    profiles: [...baselineProfiles, ...candidateProfiles, lunaProfile],
    role_mappings: primaryMappings,
  });
  validateModelProfileCatalog(catalog);
  return catalog;
}

export function createDefaultExperimentScenarioCells(catalog = createDefaultModelProfileCatalog()) {
  validateModelProfileCatalog(catalog);
  const definitions = [
    ["quality-cross-module-invariant", "development", "orchestrator", "cross-module-invariant", "high", "general", "map-orchestrator-primary", "Whole-system mapping, invariant coverage, and compatibility completeness."],
    ["quality-public-api-compatibility", "development", "architect", "public-api-compatibility", "high", "general", "map-architect-primary", "Public API behavior, ownership, and version compatibility."],
    ["quality-architecture-boundary", "development", "orchestrator-deep", "architecture-boundary", "critical", "general", "map-orchestrator-deep-primary", "Architecture boundaries, dependency direction, and cross-module contracts."],
    ["quality-concurrency-cancellation", "development", "general", "concurrency-cancellation", "high", "general", "map-general-primary", "Cancellation, race, cleanup, and lifecycle-safe implementation."],
    ["quality-parser-boundaries", "development", "diagnose", "parser-boundaries", "high", "general", "map-diagnose-primary", "Malformed, unsupported, boundary, and version-skew diagnosis."],
    ["quality-small-local-control", "development", "general", "small-local-control", "standard-lite", "high-volume", "map-general-luna-evaluation", "Bounded low-risk work without overengineering or hidden-quality regression."],
    ["quality-persistence-rollback", "held_out", "improver", "persistence-rollback", "critical", "general", "map-improver-primary", "Persistence ownership, rollback safety, recovery, and write-boundary discipline."],
    ["quality-retry-idempotency", "held_out", "reviewer", "retry-idempotency", "high", "general", "map-reviewer-primary", "Retry, duplicate delivery, idempotency, and partial-success regressions."],
    ["quality-stale-cache-version-skew", "held_out", "explore", "stale-cache-version-skew", "high", "bounded-exploration", "map-explore-primary", "Bounded discovery of stale state, invalidation, and mixed-version paths."],
    ["quality-partial-dependency-failure", "held_out", "researcher", "partial-dependency-failure", "high", "research-sidecar", "map-researcher-primary", "Primary-source evidence for degraded mode and dependency-failure semantics."],
    ["quality-resource-lifecycle", "canary", "verifier", "resource-lifecycle", "critical", "general", "map-verifier-primary", "Resource acquisition, teardown, cancellation, leaks, and process lifecycle."],
    ["quality-migration-compatibility", "canary", "review-orchestrator", "migration", "critical", "general", "map-review-orchestrator-primary", "Migration compatibility, downgrade, rollback, and final evidence integration."],
  ];
  const mappings = new Map(catalog.role_mappings.map((entry) => [entry.mapping_id, entry]));
  return definitions.map(([scenarioId, suite, role, family, riskClass, workloadClass, mappingId, qualityFocus]) => {
    const mapping = mappings.get(mappingId);
    if (!mapping) throw new ContractError("MODEL_EXPERIMENT_MAPPING_UNKNOWN", `missing mapping ${mappingId}`);
    const fixtureId = `fixture-${scenarioId}-v1`;
    return {
      scenario_id: scenarioId,
      suite,
      role,
      scenario_family: family,
      risk_class: riskClass,
      workload_class: workloadClass,
      baseline_profile_id: mapping.baseline_profile_id,
      candidate_profile_id: mapping.candidate_profile_id,
      fixture_id: fixtureId,
      corpus_fingerprint: fingerprint({ scenario_id: scenarioId, fixture_id: fixtureId, corpus_version: 1 }),
      quality_focus: qualityFocus,
    };
  });
}
