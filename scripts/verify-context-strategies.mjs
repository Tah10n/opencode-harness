import assert from "node:assert/strict";

import {
  CONTEXT_DEEP_DIMENSIONS,
  CONTEXT_STRATEGY_IDS,
  CONTEXT_TASK_PROFILES,
  CONTEXT_WIDE_CATEGORIES,
  loadContextStrategyCatalog,
  selectMinimumContextStrategy,
  validateContextStrategyBinding,
  validateContextStrategyCatalog,
} from "../lib/quality/context-strategies.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function rejects(code, action) {
  assert.throws(action, (error) => error?.code === code, `expected ${code}`);
}

const catalog = loadContextStrategyCatalog();
validateContextStrategyCatalog(catalog);
assert.deepEqual(catalog.strategies.map((entry) => entry.id), CONTEXT_STRATEGY_IDS);
for (const profile of CONTEXT_TASK_PROFILES) assert.ok(catalog.task_profiles.some((entry) => entry.id === profile));
for (const category of CONTEXT_WIDE_CATEGORIES) assert.ok(catalog.strategies.some((entry) => entry.required_wide_categories.includes(category)));
for (const dimension of CONTEXT_DEEP_DIMENSIONS) assert.ok(catalog.strategies.some((entry) => entry.required_deep_dimensions.includes(dimension)));

const standard = selectMinimumContextStrategy({ risk_class: "standard-lite", task_type: "maintenance", scope_facts: {}, boundary_count: 1 });
validateContextStrategyBinding(standard);
assert.equal(standard.strategy_id, "standard-lite-local-v1");
assert.equal(standard.required_deep_dimensions.length, 0);
assert.equal(standard.budgets.max_read_only_subagents, 0);

const escalated = selectMinimumContextStrategy({
  risk_class: "standard-lite",
  task_type: "maintenance",
  scope_facts: { public_compatibility_change: true },
  boundary_count: 1,
});
assert.equal(escalated.strategy_id, "high-wide-deep-v1");
assert.ok(escalated.selection_reasons.includes("scope_facts:wide_deep_required"));

const diagnosis = selectMinimumContextStrategy({
  risk_class: "high",
  task_type: "diagnosis_driven_implementation",
  requested_strategy_id: "critical-wide-deep-v1",
});
assert.equal(diagnosis.strategy_id, "critical-wide-deep-v1");
assert.equal(diagnosis.requires_sibling_variant_discovery, true);
assert.equal(diagnosis.requires_pre_change_reproduction, true);
assert.ok(diagnosis.required_questions.includes("owning_abstraction"));
assert.equal(diagnosis.semantic_relation_evidence, "preferred_with_honest_fallback");
assert.deepEqual(diagnosis.fallback_tools, ["context_outline", "context_files", "context_search", "context_read"]);

rejects("CONTEXT_STRATEGY_WEAKENING", () => selectMinimumContextStrategy({
  risk_class: "critical",
  task_type: "security",
  requested_strategy_id: "high-wide-deep-v1",
}));
rejects("CONTEXT_TASK_PROFILE_WEAKENING", () => selectMinimumContextStrategy({
  risk_class: "high",
  task_type: "bug_fix",
  requested_task_profile: "maintenance",
}));

for (const mutate of [
  (value) => { value.unexpected = true; return "CONTRACT_UNKNOWN_FIELD"; },
  (value) => { value.strategies[1].id = value.strategies[0].id; return "CONTEXT_STRATEGY_DUPLICATE_ID"; },
  (value) => { value.task_profiles[0].id = "unsupported"; return "CONTRACT_ENUM"; },
  (value) => { value.strategies[1].budgets.max_context_calls = 0; return "QUALITY_INTEGER"; },
  (value) => { value.strategies[1].required_wide_categories = []; return "QUALITY_ARRAY"; },
  (value) => { value.strategies[1].escalation_conditions.push(value.strategies[1].stop_conditions[0]); return "CONTEXT_STRATEGY_CONTRADICTORY_RULE"; },
  (value) => { value.strategies[2].required_deep_dimensions = value.strategies[2].required_deep_dimensions.filter((entry) => entry !== "error_propagation"); return "CONTEXT_STRATEGY_CRITICAL_WEAKENING"; },
  (value) => { value.strategies[2].semantic_relation_evidence = "optional"; return "CONTEXT_STRATEGY_CRITICAL_WEAKENING"; },
  (value) => { value.strategies[0].required_deep_dimensions = ["error_propagation"]; return "CONTEXT_STANDARD_LITE_OVERBUILT"; },
]) {
  const changed = clone(catalog);
  const code = mutate(changed);
  rejects(code, () => validateContextStrategyCatalog(changed));
}

console.log("Context strategy verification passed (strict catalog, monotonic selection, honest critical fallback, overlays, bounds, and standard-lite compactness).");
