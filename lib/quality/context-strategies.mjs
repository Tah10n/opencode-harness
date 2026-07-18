import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { assertEnum } from "../feedback/contracts.mjs";
import {
  ContractError,
  assertArray,
  assertBoolean,
  assertInteger,
  assertPlain,
  assertString,
  assertStringArray,
  canonicalJson,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

export const CONTEXT_STRATEGY_CATALOG_SCHEMA_VERSION = 1;
export const CONTEXT_STRATEGY_BINDING_SCHEMA_VERSION = 1;

export const CONTEXT_STRATEGY_IDS = Object.freeze([
  "standard-lite-local-v1",
  "high-wide-deep-v1",
  "critical-wide-deep-v1",
]);

export const CONTEXT_TASK_PROFILES = Object.freeze([
  "bug_fix",
  "new_feature",
  "behavior_preserving_refactor",
  "maintenance",
  "diagnosis_driven_implementation",
  "migration",
  "security",
]);

export const CONTEXT_QUESTION_KEYS = Object.freeze([
  "owning_abstraction",
  "error_propagation",
  "sibling_variants",
  "test_gap_root_cause",
  "public_entry_point",
  "negative_path",
  "compatibility",
  "analogous_features",
  "externally_observed_behavior",
  "all_boundary_consumers",
  "dependency_ownership",
  "preserved_operational_contract",
  "visible_symptom_chain",
  "falsifying_observation",
  "mixed_version",
  "rollback",
  "partial_success",
  "restart_recovery",
  "trust_boundaries",
  "denial_paths",
  "sensitive_data_movement",
  "unsafe_encoding",
]);

export const CONTEXT_WIDE_CATEGORIES = Object.freeze([
  "repository_guidance",
  "module_service_map",
  "externally_reachable_entry_points",
  "direct_callers_callees",
  "transitive_consumers_side_effects",
  "public_contracts_configuration",
  "state_external_dependencies",
  "architecture_ownership",
  "existing_tests",
  "sibling_implementations",
  "excluded_sibling_paths",
  "relevant_unknown_paths",
  "context_tool_fallback",
  "budget_truncation_state",
]);

export const CONTEXT_DEEP_DIMENSIONS = Object.freeze([
  "inputs_preconditions",
  "outputs_postconditions",
  "state_transitions",
  "data_transformations",
  "side_effects",
  "error_propagation",
  "retry_repeated_invocation",
  "idempotency",
  "timeout_cancellation",
  "concurrency_ordering",
  "transaction_rollback",
  "resource_cleanup",
  "cache_stale_state",
  "compatibility_version_skew",
  "authorization_data_sensitivity",
  "recovery_restart",
  "security_data_integrity",
]);

export const MINIMAL_CONTEXT_TOOLS = Object.freeze([
  "context_outline",
  "context_files",
  "context_search",
  "context_read",
]);

export const ADVANCED_CONTEXT_TOOLS = Object.freeze([
  "context_map",
  "context_batch_read",
  "context_symbols",
  "context_related",
]);

const STRATEGY_KEYS = Object.freeze([
  "id",
  "risk_classes",
  "required_wide_categories",
  "required_deep_dimensions",
  "preferred_tools",
  "fallback_tools",
  "stop_conditions",
  "escalation_conditions",
  "budgets",
  "semantic_relation_evidence",
  "sibling_variant_discovery",
  "pre_change_reproduction",
]);
const PROFILE_KEYS = Object.freeze([
  "id",
  "required_questions",
  "additional_wide_categories",
  "additional_deep_dimensions",
  "requires_sibling_variant_discovery",
  "requires_pre_change_reproduction",
  "requires_characterization",
  "requires_negative_path",
  "requires_compatibility",
]);
const STRATEGY_RANK = new Map(CONTEXT_STRATEGY_IDS.map((id, index) => [id, index]));
const RISK_MINIMUM_STRATEGY = Object.freeze({
  "standard-lite": "standard-lite-local-v1",
  high: "high-wide-deep-v1",
  critical: "critical-wide-deep-v1",
});
const REQUIREMENT_RANK = new Map([
  ["optional", 0],
  ["task_profile", 1],
  ["required", 2],
]);
const SEMANTIC_EVIDENCE_RANK = new Map([
  ["optional", 0],
  ["preferred_with_honest_fallback", 1],
  ["required_or_blocked", 2],
]);
const CANONICAL_PROFILE_DUTIES = Object.freeze({
  bug_fix: Object.freeze({ sibling: true, reproduction: true, characterization: false, negative: false, compatibility: false }),
  diagnosis_driven_implementation: Object.freeze({ sibling: true, reproduction: true, characterization: false, negative: true, compatibility: false }),
  behavior_preserving_refactor: Object.freeze({ sibling: false, reproduction: false, characterization: true, negative: false, compatibility: true }),
  new_feature: Object.freeze({ sibling: false, reproduction: false, characterization: false, negative: true, compatibility: true }),
  maintenance: Object.freeze({ sibling: false, reproduction: false, characterization: false, negative: false, compatibility: false }),
  migration: Object.freeze({ sibling: false, reproduction: false, characterization: true, negative: true, compatibility: true }),
  security: Object.freeze({ sibling: false, reproduction: false, characterization: false, negative: true, compatibility: false }),
});
const defaultCatalogUrl = new URL("../../quality/context-strategies.v1.json", import.meta.url);

function sameMembers(left, right) {
  return left.length === right.length && left.every((entry) => right.includes(entry));
}

function uniqueArray(value, label, allowed, { min = 0, max = 128 } = {}) {
  assertStringArray(value, label, { min, max, maxBytes: 256 });
  for (const entry of value) assertEnum(entry, allowed, `${label} item`);
  return value;
}

function validateBudgets(value, label) {
  assertPlain(value, label);
  exact(value, ["max_context_calls", "max_read_only_subagents"], ["max_context_calls", "max_read_only_subagents"], label);
  assertInteger(value.max_context_calls, `${label}.max_context_calls`, { min: 1, max: 512 });
  assertInteger(value.max_read_only_subagents, `${label}.max_read_only_subagents`, { min: 0, max: 16 });
}

function validateStrategy(value, label) {
  assertPlain(value, label);
  exact(value, STRATEGY_KEYS, STRATEGY_KEYS, label);
  assertEnum(value.id, CONTEXT_STRATEGY_IDS, `${label}.id`);
  uniqueArray(value.risk_classes, `${label}.risk_classes`, ["standard-lite", "high", "critical"], { min: 1, max: 3 });
  uniqueArray(value.required_wide_categories, `${label}.required_wide_categories`, CONTEXT_WIDE_CATEGORIES, { min: 1 });
  uniqueArray(value.required_deep_dimensions, `${label}.required_deep_dimensions`, CONTEXT_DEEP_DIMENSIONS);
  uniqueArray(value.preferred_tools, `${label}.preferred_tools`, [...MINIMAL_CONTEXT_TOOLS, ...ADVANCED_CONTEXT_TOOLS], { min: 1 });
  uniqueArray(value.fallback_tools, `${label}.fallback_tools`, [...MINIMAL_CONTEXT_TOOLS, "bounded_literal_search", "bounded_file_read"], { min: 1 });
  assertStringArray(value.stop_conditions, `${label}.stop_conditions`, { min: 1, max: 16, maxBytes: 128 });
  assertStringArray(value.escalation_conditions, `${label}.escalation_conditions`, { min: 1, max: 16, maxBytes: 128 });
  if (value.stop_conditions.some((entry) => value.escalation_conditions.includes(entry))) {
    throw new ContractError("CONTEXT_STRATEGY_CONTRADICTORY_RULE", `${label} uses the same condition to stop and escalate`);
  }
  validateBudgets(value.budgets, `${label}.budgets`);
  assertEnum(value.semantic_relation_evidence, ["optional", "preferred_with_honest_fallback", "required_or_blocked"], `${label}.semantic_relation_evidence`);
  assertEnum(value.sibling_variant_discovery, ["optional", "task_profile", "required"], `${label}.sibling_variant_discovery`);
  assertEnum(value.pre_change_reproduction, ["optional", "task_profile", "required"], `${label}.pre_change_reproduction`);
  return value;
}

function validateTaskProfile(value, label) {
  assertPlain(value, label);
  exact(value, PROFILE_KEYS, PROFILE_KEYS, label);
  assertEnum(value.id, CONTEXT_TASK_PROFILES, `${label}.id`);
  uniqueArray(value.required_questions, `${label}.required_questions`, CONTEXT_QUESTION_KEYS, { min: 1, max: 16 });
  uniqueArray(value.additional_wide_categories, `${label}.additional_wide_categories`, CONTEXT_WIDE_CATEGORIES);
  uniqueArray(value.additional_deep_dimensions, `${label}.additional_deep_dimensions`, CONTEXT_DEEP_DIMENSIONS);
  for (const key of PROFILE_KEYS.filter((entry) => entry.startsWith("requires_"))) {
    assertBoolean(value[key], `${label}.${key}`);
  }
  return value;
}

function assertNoWeakening(catalog) {
  const byId = new Map(catalog.strategies.map((entry) => [entry.id, entry]));
  const standard = byId.get("standard-lite-local-v1");
  const high = byId.get("high-wide-deep-v1");
  const critical = byId.get("critical-wide-deep-v1");
  if (!sameMembers(standard.risk_classes, ["standard-lite"])
    || !sameMembers(high.risk_classes, ["high"])
    || !sameMembers(critical.risk_classes, ["critical"])) {
    throw new ContractError("CONTEXT_STRATEGY_RISK_BINDING", "each strategy must bind exactly its named risk class");
  }
  for (const category of high.required_wide_categories) {
    if (!critical.required_wide_categories.includes(category)) {
      throw new ContractError("CONTEXT_STRATEGY_CRITICAL_WEAKENING", `critical strategy omits high wide category ${category}`);
    }
  }
  for (const dimension of high.required_deep_dimensions) {
    if (!critical.required_deep_dimensions.includes(dimension)) {
      throw new ContractError("CONTEXT_STRATEGY_CRITICAL_WEAKENING", `critical strategy omits high deep dimension ${dimension}`);
    }
  }
  if (critical.budgets.max_context_calls < high.budgets.max_context_calls
    || critical.budgets.max_read_only_subagents < high.budgets.max_read_only_subagents
    || SEMANTIC_EVIDENCE_RANK.get(critical.semantic_relation_evidence)
      < SEMANTIC_EVIDENCE_RANK.get(high.semantic_relation_evidence)
    || REQUIREMENT_RANK.get(critical.sibling_variant_discovery) < REQUIREMENT_RANK.get(high.sibling_variant_discovery)
    || REQUIREMENT_RANK.get(critical.pre_change_reproduction) < REQUIREMENT_RANK.get(high.pre_change_reproduction)) {
    throw new ContractError("CONTEXT_STRATEGY_CRITICAL_WEAKENING", "critical strategy weakens high evidence or bounds");
  }
  if (standard.required_deep_dimensions.length > 0 || standard.budgets.max_read_only_subagents !== 0) {
    throw new ContractError("CONTEXT_STANDARD_LITE_OVERBUILT", "standard-lite must remain compact and local");
  }
  for (const profile of catalog.task_profiles) {
    const duties = CANONICAL_PROFILE_DUTIES[profile.id];
    const actual = {
      sibling: profile.requires_sibling_variant_discovery,
      reproduction: profile.requires_pre_change_reproduction,
      characterization: profile.requires_characterization,
      negative: profile.requires_negative_path,
      compatibility: profile.requires_compatibility,
    };
    if (canonicalJson(actual) !== canonicalJson(duties)) {
      throw new ContractError("CONTEXT_TASK_PROFILE_WEAKENING", `task profile ${profile.id} weakens its canonical duties`);
    }
  }
}

export function validateContextStrategyCatalog(value) {
  assertPlain(value, "context strategy catalog");
  exact(value, ["schema_version", "catalog_id", "strategies", "task_profiles"], ["schema_version", "catalog_id", "strategies", "task_profiles"], "context strategy catalog");
  if (value.schema_version !== CONTEXT_STRATEGY_CATALOG_SCHEMA_VERSION) {
    throw new ContractError("CONTEXT_STRATEGY_SCHEMA", "context strategy catalog schema is unsupported");
  }
  assertString(value.catalog_id, "context strategy catalog.catalog_id", { maxBytes: 128 });
  assertArray(value.strategies, "context strategy catalog.strategies", { min: 3, max: 3, item: validateStrategy });
  assertArray(value.task_profiles, "context strategy catalog.task_profiles", { min: 5, max: 8, item: validateTaskProfile });
  for (const [items, expected, label] of [
    [value.strategies, CONTEXT_STRATEGY_IDS, "strategy"],
    [value.task_profiles, CONTEXT_TASK_PROFILES, "task profile"],
  ]) {
    const ids = items.map((entry) => entry.id);
    if (new Set(ids).size !== ids.length) throw new ContractError("CONTEXT_STRATEGY_DUPLICATE_ID", `duplicate ${label} ID`);
    for (const id of expected) if (!ids.includes(id)) throw new ContractError("CONTEXT_STRATEGY_REQUIRED_ENTRY", `missing ${label} ${id}`);
  }
  assertNoWeakening(value);
  return value;
}

export function loadContextStrategyCatalog({ file = fileURLToPath(defaultCatalogUrl) } = {}) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
  validateContextStrategyCatalog(parsed);
  return deepFrozenClone(parsed, "context strategy catalog");
}

function defaultProfile(taskType) {
  if (CONTEXT_TASK_PROFILES.includes(taskType)) return taskType;
  throw new ContractError("CONTEXT_TASK_PROFILE_UNSUPPORTED", `unsupported context task profile: ${taskType}`);
}

function discoveredEscalation(scopeFacts = {}, boundaryCount = 1) {
  return boundaryCount > 1 || [
    "migration",
    "public_compatibility_change",
    "architecture_policy_change",
    "security_sensitive",
    "persistence_sensitive",
    "concurrency_sensitive",
    "unresolved_unknowns",
  ].some((key) => scopeFacts[key] === true);
}

export function selectMinimumContextStrategy({
  catalog = loadContextStrategyCatalog(),
  risk_class: riskClass,
  task_type: taskType,
  scope_facts: scopeFacts = {},
  boundary_count: boundaryCount = 1,
  requested_strategy_id: requestedStrategyId = null,
  requested_task_profile: requestedTaskProfile = null,
} = {}) {
  validateContextStrategyCatalog(catalog);
  assertEnum(riskClass, ["standard-lite", "high", "critical"], "context strategy risk_class");
  assertInteger(boundaryCount, "context strategy boundary_count", { min: 0, max: 512 });
  assertPlain(scopeFacts, "context strategy scope_facts");
  const defaultProfileId = defaultProfile(taskType);
  const profileId = requestedTaskProfile ?? defaultProfileId;
  assertEnum(profileId, CONTEXT_TASK_PROFILES, "context task profile");
  if (profileId !== defaultProfileId) {
    const baselineProfile = catalog.task_profiles.find((entry) => entry.id === defaultProfileId);
    const requestedProfile = catalog.task_profiles.find((entry) => entry.id === profileId);
    const arraySuperset = ["required_questions", "additional_wide_categories", "additional_deep_dimensions"]
      .every((key) => baselineProfile[key].every((entry) => requestedProfile[key].includes(entry)));
    const booleanSuperset = PROFILE_KEYS.filter((entry) => entry.startsWith("requires_"))
      .every((key) => baselineProfile[key] !== true || requestedProfile[key] === true);
    if (!arraySuperset || !booleanSuperset) {
      throw new ContractError("CONTEXT_TASK_PROFILE_WEAKENING", `requested task profile ${profileId} weakens the canonical ${defaultProfileId} obligations`);
    }
  }

  let minimumId = riskClass === "critical"
    ? "critical-wide-deep-v1"
    : riskClass === "high"
      ? "high-wide-deep-v1"
      : "standard-lite-local-v1";
  const reasons = [`risk:${riskClass}`, `task_profile:${profileId}`];
  if (profileId !== defaultProfileId) reasons.push("agent_requested_task_profile_escalation");
  if (minimumId === "standard-lite-local-v1" && discoveredEscalation(scopeFacts, boundaryCount)) {
    minimumId = "high-wide-deep-v1";
    reasons.push("scope_facts:wide_deep_required");
  }
  if (requestedStrategyId !== null) {
    assertEnum(requestedStrategyId, CONTEXT_STRATEGY_IDS, "requested context strategy");
    if (STRATEGY_RANK.get(requestedStrategyId) < STRATEGY_RANK.get(minimumId)) {
      throw new ContractError("CONTEXT_STRATEGY_WEAKENING", `requested ${requestedStrategyId} is weaker than runner minimum ${minimumId}`);
    }
    if (STRATEGY_RANK.get(requestedStrategyId) > STRATEGY_RANK.get(minimumId)) {
      minimumId = requestedStrategyId;
      reasons.push("agent_requested_escalation");
    }
  }

  const strategy = catalog.strategies.find((entry) => entry.id === minimumId);
  const profile = catalog.task_profiles.find((entry) => entry.id === profileId);
  const source = {
    schema_version: CONTEXT_STRATEGY_BINDING_SCHEMA_VERSION,
    catalog_id: catalog.catalog_id,
    strategy_id: strategy.id,
    risk_class: riskClass,
    task_profile: profileId,
    selection_reasons: [...new Set(reasons)].sort(),
    required_wide_categories: [...new Set([...strategy.required_wide_categories, ...profile.additional_wide_categories])].sort(),
    required_deep_dimensions: [...new Set([...strategy.required_deep_dimensions, ...profile.additional_deep_dimensions])].sort(),
    required_questions: [...profile.required_questions],
    preferred_tools: [...strategy.preferred_tools],
    fallback_tools: [...strategy.fallback_tools],
    stop_conditions: [...strategy.stop_conditions],
    escalation_conditions: [...strategy.escalation_conditions],
    budgets: { ...strategy.budgets },
    semantic_relation_evidence: strategy.semantic_relation_evidence,
    requires_sibling_variant_discovery: profile.requires_sibling_variant_discovery || strategy.sibling_variant_discovery === "required",
    requires_pre_change_reproduction: profile.requires_pre_change_reproduction || strategy.pre_change_reproduction === "required",
    requires_characterization: profile.requires_characterization,
    requires_negative_path: profile.requires_negative_path,
    requires_compatibility: profile.requires_compatibility,
  };
  return deepFrozenClone({ ...source, fingerprint: fingerprint(source) }, "context strategy binding");
}

export function contextStrategyBindingFingerprintInput(binding) {
  const copy = JSON.parse(canonicalJson(binding));
  delete copy.fingerprint;
  return deepFrozenClone(copy, "context strategy binding fingerprint input");
}

export function validateContextStrategyBinding(value) {
  assertPlain(value, "context strategy binding");
  const keys = [
    "schema_version", "catalog_id", "strategy_id", "risk_class", "task_profile", "selection_reasons",
    "required_wide_categories", "required_deep_dimensions", "required_questions", "preferred_tools",
    "fallback_tools", "stop_conditions", "escalation_conditions", "budgets", "semantic_relation_evidence",
    "requires_sibling_variant_discovery", "requires_pre_change_reproduction", "requires_characterization",
    "requires_negative_path", "requires_compatibility", "fingerprint",
  ];
  exact(value, keys, keys, "context strategy binding");
  if (value.schema_version !== CONTEXT_STRATEGY_BINDING_SCHEMA_VERSION) {
    throw new ContractError("CONTEXT_STRATEGY_BINDING_SCHEMA", "context strategy binding schema is unsupported");
  }
  assertString(value.catalog_id, "context strategy binding.catalog_id", { maxBytes: 128 });
  assertEnum(value.strategy_id, CONTEXT_STRATEGY_IDS, "context strategy binding.strategy_id");
  assertEnum(value.risk_class, ["standard-lite", "high", "critical"], "context strategy binding.risk_class");
  if (STRATEGY_RANK.get(value.strategy_id) < STRATEGY_RANK.get(RISK_MINIMUM_STRATEGY[value.risk_class])) {
    throw new ContractError("CONTEXT_STRATEGY_WEAKENING", `strategy ${value.strategy_id} is weaker than risk ${value.risk_class}`);
  }
  assertEnum(value.task_profile, CONTEXT_TASK_PROFILES, "context strategy binding.task_profile");
  assertStringArray(value.selection_reasons, "context strategy binding.selection_reasons", { min: 1, max: 16, maxBytes: 256 });
  uniqueArray(value.required_wide_categories, "context strategy binding.required_wide_categories", CONTEXT_WIDE_CATEGORIES, { min: 1 });
  uniqueArray(value.required_deep_dimensions, "context strategy binding.required_deep_dimensions", CONTEXT_DEEP_DIMENSIONS);
  assertStringArray(value.required_questions, "context strategy binding.required_questions", { min: 1, max: 16, maxBytes: 128 });
  uniqueArray(value.preferred_tools, "context strategy binding.preferred_tools", [...MINIMAL_CONTEXT_TOOLS, ...ADVANCED_CONTEXT_TOOLS], { min: 1 });
  uniqueArray(value.fallback_tools, "context strategy binding.fallback_tools", [...MINIMAL_CONTEXT_TOOLS, "bounded_literal_search", "bounded_file_read"], { min: 1 });
  assertStringArray(value.stop_conditions, "context strategy binding.stop_conditions", { min: 1, max: 16, maxBytes: 128 });
  assertStringArray(value.escalation_conditions, "context strategy binding.escalation_conditions", { min: 1, max: 16, maxBytes: 128 });
  validateBudgets(value.budgets, "context strategy binding.budgets");
  assertEnum(value.semantic_relation_evidence, ["optional", "preferred_with_honest_fallback", "required_or_blocked"], "context strategy binding.semantic_relation_evidence");
  for (const key of keys.filter((entry) => entry.startsWith("requires_"))) assertBoolean(value[key], `context strategy binding.${key}`);
  const catalog = loadContextStrategyCatalog();
  const strategy = catalog.strategies.find((entry) => entry.id === value.strategy_id);
  const profile = catalog.task_profiles.find((entry) => entry.id === value.task_profile);
  const canonical = {
    catalog_id: catalog.catalog_id,
    required_wide_categories: [...new Set([...strategy.required_wide_categories, ...profile.additional_wide_categories])].sort(),
    required_deep_dimensions: [...new Set([...strategy.required_deep_dimensions, ...profile.additional_deep_dimensions])].sort(),
    required_questions: [...profile.required_questions],
    preferred_tools: [...strategy.preferred_tools],
    fallback_tools: [...strategy.fallback_tools],
    stop_conditions: [...strategy.stop_conditions],
    escalation_conditions: [...strategy.escalation_conditions],
    budgets: { ...strategy.budgets },
    semantic_relation_evidence: strategy.semantic_relation_evidence,
    requires_sibling_variant_discovery: profile.requires_sibling_variant_discovery || strategy.sibling_variant_discovery === "required",
    requires_pre_change_reproduction: profile.requires_pre_change_reproduction || strategy.pre_change_reproduction === "required",
    requires_characterization: profile.requires_characterization,
    requires_negative_path: profile.requires_negative_path,
    requires_compatibility: profile.requires_compatibility,
  };
  for (const [field, expectedValue] of Object.entries(canonical)) {
    if (canonicalJson(value[field]) !== canonicalJson(expectedValue)) {
      throw new ContractError("CONTEXT_STRATEGY_BINDING_NONCANONICAL", `context strategy binding.${field} does not match the canonical catalog and task profile`);
    }
  }
  if (!value.selection_reasons.includes(`risk:${value.risk_class}`)
    || !value.selection_reasons.includes(`task_profile:${value.task_profile}`)) {
    throw new ContractError("CONTEXT_STRATEGY_BINDING_NONCANONICAL", "context strategy binding selection reasons omit the canonical risk or task profile");
  }
  const expected = fingerprint(contextStrategyBindingFingerprintInput(value));
  if (!fingerprintsEqual(value.fingerprint, expected)) {
    throw new ContractError("CONTEXT_STRATEGY_BINDING_FINGERPRINT", "context strategy binding fingerprint is invalid");
  }
  return value;
}
