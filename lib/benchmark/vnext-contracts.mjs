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

function setDifference(left, right) {
  const rightSet = new Set(right);
  return left.filter((entry) => !rightSet.has(entry));
}

function validateAblations(inventory, contract) {
  const componentIds = inventory.components.map((entry) => entry.id);
  exactSequence(contract.component_order, componentIds, "component order");
  const arms = array(contract.arms, "arms");
  exactSequence(arms.map((entry) => entry.id), VNEXT_ARM_IDS, "arm IDs");
  for (const [index, arm] of arms.entries()) {
    exactSequence(arm.component_ids, componentIds.slice(0, index), `${arm.id} components`);
  }
  const estimands = array(contract.estimands, "estimands");
  if (estimands.length !== componentIds.length) fail("VNEXT_ESTIMAND_COUNT", "one estimand is required per component");
  const armById = new Map(arms.map((entry) => [entry.id, entry]));
  const componentById = new Map(inventory.components.map((entry) => [entry.id, entry]));
  for (const [index, estimand] of estimands.entries()) {
    const baseline = armById.get(estimand.baseline_arm_id);
    const candidate = armById.get(estimand.candidate_arm_id);
    if (!baseline || !candidate || baseline.id !== VNEXT_ARM_IDS[index]
      || candidate.id !== VNEXT_ARM_IDS[index + 1]) {
      fail("VNEXT_ESTIMAND_PAIR", `${estimand.id} must compare adjacent canonical arms`);
    }
    const added = setDifference(candidate.component_ids, baseline.component_ids);
    const removed = setDifference(baseline.component_ids, candidate.component_ids);
    if (added.length !== 1 || removed.length !== 0 || added[0] !== estimand.added_component_id) {
      fail("VNEXT_ABLATION_DIFF", `${estimand.id} must add exactly one declared component`);
    }
    const component = componentById.get(estimand.added_component_id);
    if (!component || component.target_metric !== estimand.target_metric) {
      fail("VNEXT_TARGET_METRIC", `${estimand.id} must use its component target metric`);
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
    if (family.stratum === "medium") {
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
  for (const required of ["tokens", "duration", "tool_calls", "delegated_child_count", "timeout_rate"]) {
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

function validatePolicy(inventory, policy) {
  if (policy.schema_version !== 1 || policy.status !== "predeclared"
    || policy.created_before_model_backed_runs !== true) {
    fail("VNEXT_POLICY", "promotion policy must be predeclared before model-backed runs");
  }
  if (policy.confidence_level !== 0.95 || policy.minimum_task_families_per_standard_estimand < 8
    || policy.timeout_rate_delta_maximum > 0.02
    || policy.incomplete_outcome_policy !== "separate-not-scored"
    || policy.external_state_policy !== "blocked-unproven"
    || policy.threshold_change_policy !== "new-version-and-new-run-required") {
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
  exactSequence(rules.map((entry) => entry.component_id), inventory.components.map((entry) => entry.id), "promotion components");
  for (const rule of rules) {
    const component = inventory.components.find((entry) => entry.id === rule.component_id);
    if (rule.target_metric !== component.target_metric) {
      fail("VNEXT_POLICY_TARGET", `${rule.component_id} promotion target drifted`);
    }
  }
  if (!policy.verdicts.includes("inconclusive") || !policy.verdicts.includes("blocked-unproven")) {
    fail("VNEXT_POLICY_VERDICT", "policy must retain inconclusive and blocked-unproven");
  }
}

export function validateVnextContracts({ root, inventory, contract, policy }) {
  if (contract.schema_version !== 1 || contract.inventory_path !== "profiles/inventory.v3.json") {
    fail("VNEXT_VERSION", "vnext contract version or inventory binding is invalid");
  }
  validateAblations(inventory, contract);
  const family_counts = validateFamilies(root, contract);
  validateMetrics(contract);
  validateSuites(contract);
  validatePolicy(inventory, policy);
  for (const component of inventory.components) {
    const relativePath = normalizePortablePath(component.intervention_path, `${component.id} intervention path`);
    const absolute = path.resolve(root, ...relativePath.split("/"));
    if (!fs.existsSync(absolute) || !fs.lstatSync(absolute).isFile()) {
      fail("VNEXT_COMPONENT_SOURCE", `${component.id} intervention source is missing`);
    }
  }
  validateRunReportSchema(contract, readJson(root, VNEXT_REPORT_SCHEMA_PATH));
  for (const [relativePath, reportKind] of [
    [VNEXT_COMPARISON_SCHEMA_PATH, "vnext-component-ablation-comparison"],
    [VNEXT_EXECUTION_PLAN_SCHEMA_PATH, "vnext-component-ablation-plan"],
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
      id: "two-component-ablation-rejected",
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
  ];
  const results = [];
  for (const testCase of cases) {
    const contract = clone(loaded.contract);
    const policy = clone(loaded.policy);
    testCase.mutate(contract, policy);
    let rejected = false;
    try {
      validateVnextContracts({
        root: loaded.root,
        inventory: loaded.inventory,
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
