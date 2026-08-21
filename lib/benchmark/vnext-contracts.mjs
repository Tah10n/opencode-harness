import fs from "node:fs";
import path from "node:path";

import {
  ProfileV3Error,
  fingerprintProfileValue,
  loadProfileInventoryV3,
  normalizePortablePath,
} from "../profile-v3.mjs";

export const VNEXT_CONTRACT_PATH = "benchmarks/vnext/contract.v1.json";
export const VNEXT_POLICY_PATH = "benchmarks/vnext/promotion-policy.v1.json";
export const VNEXT_REPORT_SCHEMA_PATH = "benchmarks/vnext/schemas/run-report.v1.schema.json";
export const VNEXT_COMPARISON_SCHEMA_PATH = "benchmarks/vnext/schemas/comparison-report.v1.schema.json";
export const VNEXT_EXECUTION_PLAN_SCHEMA_PATH = "benchmarks/vnext/schemas/execution-plan.v1.schema.json";
export const VNEXT_FULL_ENVELOPE_SCHEMA_PATH = "benchmarks/vnext/schemas/full-run-envelope.v1.schema.json";
export const VNEXT_ARM_IDS = Object.freeze(["P0", "P1", "P2", "P3", "P4", "P5"]);

function fail(code, message) {
  throw new ProfileV3Error(code, message);
}

function readJson(root, relativePath) {
  normalizePortablePath(relativePath);
  const absolute = path.resolve(root, ...relativePath.split("/"));
  const relative = path.relative(root, absolute);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail("VNEXT_PATH", `${relativePath} escapes the repository`);
  }
  try {
    return JSON.parse(fs.readFileSync(absolute, "utf8").replace(/^\uFEFF/u, ""));
  } catch (error) {
    fail("VNEXT_JSON", `${relativePath} is unreadable or invalid: ${error.message}`);
  }
}

function array(value, label) {
  if (!Array.isArray(value)) fail("VNEXT_SHAPE", `${label} must be an array`);
  return value;
}

function unique(values, label) {
  if (new Set(values).size !== values.length) fail("VNEXT_DUPLICATE", `${label} contains duplicates`);
}

function exactSequence(values, expected, label) {
  if (JSON.stringify(values) !== JSON.stringify(expected)) {
    fail("VNEXT_SEQUENCE", `${label} must equal ${expected.join(", ")}`);
  }
}

function exactObjectKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    fail("VNEXT_SHAPE", `${label} must contain exactly the frozen keys`);
  }
}

function setDifference(left, right) {
  const rightSet = new Set(right);
  return left.filter((entry) => !rightSet.has(entry));
}

function validateCompoundTransitions(inventory, contract) {
  const inventoryComponentIds = inventory.components.map((entry) => entry.id);
  const componentIds = array(contract.component_order, "component order");
  exactSequence(
    inventoryComponentIds.filter((entry) => componentIds.includes(entry)),
    componentIds,
    "canonical component order",
  );
  if (componentIds.some((entry) => !inventoryComponentIds.includes(entry))) {
    fail("VNEXT_SEQUENCE", "canonical component order references an absent inventory component");
  }
  const deltaManifests = inventory.vnext_transition_surface_anchors;
  if (deltaManifests === null || typeof deltaManifests !== "object" || Array.isArray(deltaManifests)) {
    fail("VNEXT_TRANSITION_SURFACE", "vnext transition surface anchors are missing");
  }
  exactSequence(Object.keys(deltaManifests), inventoryComponentIds, "transition surface anchor IDs");
  for (const componentId of inventoryComponentIds) {
    const paths = array(deltaManifests[componentId], `${componentId} surface delta paths`);
    unique(paths, `${componentId} surface delta paths`);
    if (paths.length === 0 || paths.some((entry) => typeof entry !== "string" || !entry.startsWith("/"))) {
      fail("VNEXT_TRANSITION_SURFACE", `${componentId} transition surface anchor is invalid`);
    }
  }
  const arms = array(contract.arms, "arms");
  exactSequence(arms.map((entry) => entry.id), VNEXT_ARM_IDS, "arm IDs");
  for (const [index, arm] of arms.entries()) {
    exactSequence(arm.component_ids, componentIds.slice(0, index), `${arm.id} components`);
  }
  const estimands = array(contract.estimands, "estimands");
  if (estimands.length !== componentIds.length) fail("VNEXT_ESTIMAND_COUNT", "one adjacent compound-transition estimand is required per cumulative arm step");
  const armById = new Map(arms.map((entry) => [entry.id, entry]));
  const componentById = new Map(inventory.components.map((entry) => [entry.id, entry]));
  for (const [index, estimand] of estimands.entries()) {
    const baseline = armById.get(estimand.baseline_arm_id);
    const candidate = armById.get(estimand.candidate_arm_id);
    if (!baseline || !candidate || baseline.id !== VNEXT_ARM_IDS[index]
      || candidate.id !== VNEXT_ARM_IDS[index + 1]) {
      fail("VNEXT_ESTIMAND_PAIR", `${estimand.id} must compare adjacent canonical arms`);
    }
    if (estimand.estimand_kind !== "compound-profile-transition") {
      fail("VNEXT_ESTIMAND_KIND", `${estimand.id} must be declared as a compound profile transition`);
    }
    const added = setDifference(candidate.component_ids, baseline.component_ids);
    const removed = setDifference(baseline.component_ids, candidate.component_ids);
    if (added.length !== 1 || removed.length !== 0 || added[0] !== estimand.transition_anchor_component_id) {
      fail("VNEXT_TRANSITION_DIFF", `${estimand.id} must advance one canonical cumulative-arm step`);
    }
    const component = componentById.get(estimand.transition_anchor_component_id);
    if (!component || component.target_metric !== estimand.target_metric) {
      fail("VNEXT_TARGET_METRIC", `${estimand.id} must use its component target metric`);
    }
    const declaredStrata = [...estimand.target_strata, ...estimand.negative_control_strata];
    unique(declaredStrata, `${estimand.id} target and negative-control strata`);
    exactSequence([...declaredStrata].sort(), [...estimand.eligible_strata].sort(), `${estimand.id} selected strata`);
    if (estimand.negative_control_strata.some((entry) => entry !== "small")) {
      fail("VNEXT_NEGATIVE_CONTROL", `${estimand.id} negative controls must use the small stratum`);
    }
  }
}

function validateFamilies(root, contract) {
  const families = array(contract.families, "families");
  unique(families.map((entry) => entry.id), "family IDs");
  unique(families.map((entry) => entry.fixture_id), "fixture IDs");
  const counts = Object.fromEntries(["small", "medium", "high"].map((stratum) => [
    stratum,
    families.filter((entry) => entry.stratum === stratum).length,
  ]));
  const legacyInventory = readJson(root, "profiles/inventory.v2.json");
  const sourceFamilyIds = new Set(legacyInventory.benchmark?.families?.map((entry) => entry.id) ?? []);
  if (counts.small < 5 || counts.medium < 8 || counts.high < 8) {
    fail("VNEXT_STRATA", "vnext requires at least 5 small, 8 medium, and 8 high-risk families");
  }
  for (const family of families) {
    if (!["small", "medium", "high"].includes(family.stratum)
      || family.requirement_visibility !== "complete") {
      fail("VNEXT_FAMILY", `${family.id} has an invalid stratum or hidden requirement`);
    }
    if (!sourceFamilyIds.has(family.source_family_id)
      || !Number.isSafeInteger(family.source_semantic_variant)
      || family.source_semantic_variant < 1 || family.source_semantic_variant > 5) {
      fail("VNEXT_FAMILY_SOURCE", `${family.id} has no valid executable fixture source`);
    }
    if (["medium", "high"].includes(family.stratum)) {
      exactSequence(family.change_file_bounds, [1, 4], `${family.id} change bounds`);
      exactSequence(family.potential_file_bounds, [8, 20], `${family.id} potential bounds`);
    }
  }
  return counts;
}

function validateMetrics(contract) {
  const product = contract.metrics?.primary_product;
  const operational = contract.metrics?.operational;
  const diagnostic = contract.metrics?.diagnostic;
  for (const [label, values] of Object.entries({ product, operational, diagnostic })) {
    array(values, `${label} metrics`);
    unique(values, `${label} metrics`);
  }
  for (const required of [
    "functional_hidden_check_success",
    "regression_free_success",
    "regression_free_high_risk_success",
    "public_contract_preservation",
    "missed_consumer_rate",
    "verification_omission",
    "task_completion_without_human_intervention",
  ]) {
    if (!product.includes(required)) fail("VNEXT_METRIC", `missing product metric ${required}`);
  }
  for (const required of ["duration", "tool_calls", "delegated_child_count", "timeout_rate"]) {
    if (!operational.includes(required)) fail("VNEXT_METRIC", `missing operational metric ${required}`);
  }
  for (const required of ["whole_task_success", "protocol_compliance", "trace_completeness", "attestation_completeness"]) {
    if (!diagnostic.includes(required)) fail("VNEXT_METRIC", `missing diagnostic metric ${required}`);
  }
  const allMetrics = [...product, ...operational, ...diagnostic];
  unique(allMetrics, "metrics across groups");
  for (const estimand of contract.estimands) {
    if (allMetrics.filter((metric) => metric === estimand.target_metric).length !== 1) {
      fail("VNEXT_TARGET_METRIC", `${estimand.id} target metric must belong to exactly one report group`);
    }
  }
}

function validateSuites(contract) {
  const suites = array(contract.suites, "suites");
  exactSequence(suites.map((entry) => entry.id), ["smoke", "standard", "full"], "suite IDs");
  const smoke = suites.find((entry) => entry.id === "smoke");
  const standard = suites.find((entry) => entry.id === "standard");
  if (smoke.family_count_per_stratum !== 1
    || standard.family_selection !== "up-to-8-per-eligible-stratum"
    || standard.minimum_family_count < 8) {
    fail("VNEXT_SUITE", "smoke and standard family selection is invalid");
  }
  if (suites.some((entry) => entry.full_cross_product !== false)
    || suites.find((entry) => entry.id === "full").requires_standard_promotion_signal !== true) {
    fail("VNEXT_SUITE", "suites must avoid a full cross-product and gate full on standard evidence");
  }
}

function validateRunReportSchema(contract, schema) {
  if (schema?.properties?.schema_version?.const !== 1) {
    fail("VNEXT_REPORT_SCHEMA", `${VNEXT_REPORT_SCHEMA_PATH} is missing or invalid`);
  }
  exactSequence(schema.$defs?.productMetricGroup?.required, contract.metrics.primary_product,
    "run-report product metrics");
  exactSequence(schema.$defs?.operationalMetricGroup?.required, contract.metrics.operational,
    "run-report operational metrics");
  exactSequence(schema.$defs?.diagnosticMetricGroup?.required, contract.metrics.diagnostic,
    "run-report diagnostic metrics");
  if (schema.if?.properties?.status?.const !== "complete"
    || schema.then?.properties?.family_results?.minItems !== 1
    || schema.then?.properties?.family_results?.items?.properties?.status?.const !== "complete"
    || schema.then?.properties?.incomplete_outcomes?.maxItems !== 0
    || schema.else?.properties?.incomplete_outcomes?.minItems !== 1
    || ["product_metrics", "operational_metrics", "diagnostic_metrics"]
      .some((key) => schema.else?.properties?.[key]?.maxProperties !== 0)) {
    fail("VNEXT_REPORT_SCHEMA", "run-report status-dependent schema invariants drifted");
  }
}

function validatePolicy(inventory, contract, policy) {
  exactObjectKeys(policy, [
    "schema_version", "policy_id", "status", "created_before_model_backed_runs",
    "confidence_level", "minimum_complete_pairs_per_stratum",
    "minimum_task_families_per_standard_estimand", "small_negative_control_delta_minimum",
    "functional_harm_ci_lower_bound_minimum", "timeout_rate_delta_maximum",
    "introduced_high_medium_defects_maximum", "incomplete_outcome_policy",
    "external_state_policy", "threshold_change_policy", "full_run_policy",
    "promotion_rules", "required_bindings", "verdicts",
  ], "promotion policy");
  if (policy.schema_version !== 1 || policy.status !== "predeclared"
    || policy.created_before_model_backed_runs !== true) {
    fail("VNEXT_POLICY", "promotion policy must be predeclared before model-backed runs");
  }
  if (policy.confidence_level !== 0.95 || policy.minimum_complete_pairs_per_stratum !== 8
    || policy.minimum_task_families_per_standard_estimand !== 8
    || policy.small_negative_control_delta_minimum !== -0.03
    || policy.functional_harm_ci_lower_bound_minimum !== -0.05
    || policy.timeout_rate_delta_maximum !== 0.02
    || policy.introduced_high_medium_defects_maximum !== 0
    || policy.incomplete_outcome_policy !== "separate-not-scored"
    || policy.external_state_policy !== "blocked-unproven"
    || policy.threshold_change_policy !== "new-version-and-new-run-required"
    || policy.full_run_policy !== "only-after-positive-standard-signal-with-all-guardrails") {
    fail("VNEXT_POLICY", "promotion guardrails are incomplete or weakened");
  }
  const requiredBindings = [
    "source_sha",
    "policy_fingerprint",
    "inventory_fingerprint",
    "contract_fingerprint",
    "executable_identity",
    "adapter_fingerprint",
    "model",
    "provider",
    "variant",
    "seed",
    "timeout_ms",
    "runner_limits",
    "fixture_fingerprint",
    "evaluator_fingerprint",
  ];
  exactSequence(policy.required_bindings, requiredBindings, "policy bindings");
  const rules = array(policy.promotion_rules, "promotion rules");
  exactSequence(rules.map((entry) => entry.estimand_id), contract.estimands.map((entry) => entry.id), "promotion estimands");
  const frozenDirections = new Map([
    ["plain-to-core-rules", "higher-is-better"],
    ["core-rules-to-core-verified", "lower-is-better"],
    ["core-verified-to-deep", "lower-is-better"],
    ["deep-to-core-reviewed", "lower-is-better"],
    ["deep-to-assurance", "higher-is-better"],
  ]);
  for (const rule of rules) {
    exactObjectKeys(rule, ["estimand_id", "target_metric", "direction"], `${rule?.estimand_id ?? "unknown"} promotion rule`);
    const estimand = contract.estimands.find((entry) => entry.id === rule.estimand_id);
    if (!estimand || rule.target_metric !== estimand.target_metric
      || rule.direction !== frozenDirections.get(rule.estimand_id)) {
      fail("VNEXT_POLICY_TARGET", `${rule.estimand_id} promotion target drifted`);
    }
  }
  if (JSON.stringify(policy.verdicts) !== JSON.stringify([
    "promote", "retain-optional", "reject", "inconclusive", "blocked-unproven",
  ])) {
    fail("VNEXT_POLICY_VERDICT", "policy must retain inconclusive and blocked-unproven");
  }
}

export function validateVnextContracts({ root, inventory, contract, policy }) {
  if (contract.schema_version !== 1 || contract.inventory_path !== "profiles/inventory.v3.json") {
    fail("VNEXT_VERSION", "vnext contract version or inventory binding is invalid");
  }
  validateCompoundTransitions(inventory, contract);
  const family_counts = validateFamilies(root, contract);
  validateMetrics(contract);
  validateSuites(contract);
  validatePolicy(inventory, contract, policy);
  for (const component of inventory.components) {
    const relativePath = normalizePortablePath(component.intervention_path, `${component.id} intervention path`);
    const absolute = path.resolve(root, ...relativePath.split("/"));
    if (!fs.existsSync(absolute) || !fs.lstatSync(absolute).isFile()) {
      fail("VNEXT_COMPONENT_SOURCE", `${component.id} intervention source is missing`);
    }
  }
  validateRunReportSchema(contract, readJson(root, VNEXT_REPORT_SCHEMA_PATH));
  for (const [relativePath, reportKind] of [
    [VNEXT_COMPARISON_SCHEMA_PATH, "vnext-compound-profile-transition-comparison"],
    [VNEXT_EXECUTION_PLAN_SCHEMA_PATH, "vnext-compound-profile-transition-plan"],
    [VNEXT_FULL_ENVELOPE_SCHEMA_PATH, "vnext-full-run-envelope"],
  ]) {
    const schema = readJson(root, relativePath);
    if (schema?.properties?.schema_version?.const !== 1
      || !Object.values(schema.properties ?? {})
        .some((entry) => entry?.const === reportKind)) {
      fail("VNEXT_REPORT_SCHEMA", `${relativePath} is missing or invalid`);
    }
  }
  return Object.freeze({
    status: "passed",
    evidence_class: "model-free-validation",
    model_execution: false,
    arm_count: contract.arms.length,
    estimand_count: contract.estimands.length,
    family_count: contract.families.length,
    family_counts,
    inventory_fingerprint: fingerprintProfileValue(inventory),
    contract_fingerprint: fingerprintProfileValue(contract),
    policy_fingerprint: fingerprintProfileValue(policy),
  });
}

export function loadVnextContracts(repositoryRoot) {
  const loadedInventory = loadProfileInventoryV3(repositoryRoot);
  const contract = readJson(loadedInventory.root, VNEXT_CONTRACT_PATH);
  const policy = readJson(loadedInventory.root, VNEXT_POLICY_PATH);
  return Object.freeze({
    ...loadedInventory,
    contract,
    policy,
    validation: validateVnextContracts({
      root: loadedInventory.root,
      inventory: loadedInventory.inventory,
      contract,
      policy,
    }),
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function selfTestVnextContracts(repositoryRoot) {
  const loaded = loadVnextContracts(repositoryRoot);
  const cases = [
    {
      id: "noncanonical-compound-transition-rejected",
      mutate(contract) {
        contract.arms[2].component_ids.push("deep-context");
      },
    },
    {
      id: "hidden-requirement-rejected",
      mutate(contract) {
        contract.families[0].requirement_visibility = "hidden";
      },
    },
    {
      id: "insufficient-medium-families-rejected",
      mutate(contract) {
        contract.families = contract.families.filter((entry) => (
          entry.stratum !== "medium" || entry.id.endsWith("consumer")
        ));
      },
    },
    {
      id: "post-result-threshold-change-rejected",
      mutate(_contract, policy) {
        policy.threshold_change_policy = "mutable";
      },
    },
    {
      id: "blocked-outcome-scoring-rejected",
      mutate(_contract, policy) {
        policy.external_state_policy = "score-as-failure";
      },
    },
    {
      id: "unknown-promotion-direction-rejected",
      mutate(_contract, policy) {
        policy.promotion_rules[0].direction = "nonsense";
      },
    },
    {
      id: "weakened-full-run-policy-rejected",
      mutate(_contract, policy) {
        policy.full_run_policy = "always";
      },
    },
    {
      id: "extra-promotion-rule-field-rejected",
      mutate(_contract, policy) {
        policy.promotion_rules[0].after_results = true;
      },
    },
    {
      id: "empty-transition-surface-anchor-rejected",
      mutate(_contract, _policy, inventory) {
        inventory.vnext_transition_surface_anchors["deep-context"] = [];
      },
    },
  ];
  const results = [];
  for (const testCase of cases) {
    const contract = clone(loaded.contract);
    const policy = clone(loaded.policy);
    const inventory = clone(loaded.inventory);
    testCase.mutate(contract, policy, inventory);
    let rejected = false;
    try {
      validateVnextContracts({
        root: loaded.root,
        inventory,
        contract,
        policy,
      });
    } catch (error) {
      if (!(error instanceof ProfileV3Error)) throw error;
      rejected = true;
    }
    if (!rejected) fail("VNEXT_SELF_TEST", `${testCase.id} was not rejected`);
    results.push({ id: testCase.id, status: "passed" });
  }
  return Object.freeze({
    status: "passed",
    evidence_class: "model-free-self-test",
    model_execution: false,
    check_count: results.length,
    checks: results,
  });
}
