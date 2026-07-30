import fs from "node:fs";
import path from "node:path";

import {
  ContractError,
  assertExactKeys,
  assertSafeId,
  fingerprint,
} from "../feedback/contracts.mjs";

export const SYNTHETIC_SCHEMA_VERSION = 1;
export const MINIMUM_COMPLETE_PAIRS = 24;
export const MINIMUM_DISCORDANT_PAIRS = 10;
export const BOOTSTRAP_RESAMPLES = 10_000;
export const SYNTHETIC_ANALYSIS_SEED = "opencode-harness-analysis-v1";
export const SYNTHETIC_PROFILE_IDS = Object.freeze(["plain", "profile-only", "instrumented"]);
export const SYNTHETIC_FAMILY_IDS = Object.freeze([
  "function-boundaries",
  "stable-deduplicate",
  "parser-malformed-input",
  "config-precedence",
  "cache-invalidation",
  "cross-file-contract",
  "retry-idempotency",
  "async-cancellation",
  "resource-cleanup",
  "partial-dependency-failure",
  "versioned-json-migration",
  "path-confinement",
  "small-task-no-delegation",
  "review-read-only",
  "hidden-consumer-discovery",
  "prompt-injection-ignore",
]);
export const SYNTHETIC_ANTI_CHEATING_CASES = Object.freeze([
  "differing-public-task",
  "fixture-fingerprint-mismatch",
  "timeout",
  "fixed-baseline-first",
  "exposed-hidden-paths",
  "missing-pair",
  "duplicate-pair",
  "stale-profile-evidence",
  "profile-specific-adapter-branching",
]);
export const SYNTHETIC_PARSER_FIXTURES = Object.freeze([
  "valid",
  "tool",
  "subagent",
  "verification",
  "malformed-json",
  "unknown-event",
  "timeout",
  "nonzero-exit",
  "missing-final",
  "partial-truncated",
  "stale-profile-fingerprint",
]);

const MAX_CONTRACT_BYTES = 512 * 1024;
const MAX_PROFILE_INPUT_BYTES = 512 * 1024;
const PORTABLE_SOURCE_ROOT_HIDDEN_SEGMENTS = new Set([".github", ".opencode"]);
const INVENTORY_PATH = "profiles/inventory.v1.json";
const ORCHESTRATOR_ROUTED_ROLE_IDS = Object.freeze([
  "orchestrator",
  "explore",
  "architect",
  "general",
  "reviewer",
  "diagnose",
  "researcher",
  "improver",
  "verifier",
]);
const CONTRACT_PATHS = Object.freeze({
  inventory: INVENTORY_PATH,
  families: "benchmarks/synthetic/families.v1.json",
  suites: "benchmarks/synthetic/suites.v1.json",
  comparisonPolicy: "benchmarks/synthetic/comparison-policy.v1.json",
  schemas: [
    "benchmarks/synthetic/schemas/profile-inventory.schema.json",
    "benchmarks/synthetic/schemas/family-registry.schema.json",
    "benchmarks/synthetic/schemas/suite-manifest.schema.json",
    "benchmarks/synthetic/schemas/comparison-policy.schema.json",
    "adoption/schemas/adoption-bundle.schema.json",
    "benchmarks/synthetic/schemas/template-set.schema.json",
    "benchmarks/synthetic/schemas/generated-instance.schema.json",
    "benchmarks/synthetic/schemas/run-report.v2.schema.json",
    "benchmarks/synthetic/schemas/comparison-report.v1.schema.json",
    "benchmarks/synthetic/schemas/model-free-self-test-report.v1.schema.json",
    "benchmarks/synthetic/schemas/replay-report.v1.schema.json",
    "benchmarks/synthetic/schemas/replay-report.v2.schema.json",
  ],
  adoption: {
    core: "adoption/core.v1.json",
    quality: "adoption/quality.v1.json",
    evaluation: "adoption/evaluation.v1.json",
    complete: "adoption/complete.v1.json",
  },
});

function fail(code, message) {
  throw new ContractError(code, message);
}

function expect(condition, code, message) {
  if (!condition) fail(code, message);
}

function exact(value, allowed, required, label) {
  return assertExactKeys(value, { allowed, required }, label);
}

function expectString(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return value;
  expect(typeof value === "string" && value.length > 0, "SYNTHETIC_STRING", `${label} must be a non-empty string`);
  return value;
}

function expectInteger(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  expect(Number.isInteger(value) && value >= min && value <= max, "SYNTHETIC_INTEGER", `${label} must be an integer from ${min} through ${max}`);
  return value;
}

function expectBoolean(value, label) {
  expect(typeof value === "boolean", "SYNTHETIC_BOOLEAN", `${label} must be boolean`);
  return value;
}

function expectArray(value, label, { min = 0 } = {}) {
  expect(Array.isArray(value) && value.length >= min, "SYNTHETIC_ARRAY", `${label} must be an array with at least ${min} entries`);
  return value;
}

function expectExactSequence(actual, expected, code, label) {
  expect(
    JSON.stringify(actual) === JSON.stringify(expected),
    code,
    `${label} must equal the canonical sequence: ${expected.join(", ")}`,
  );
}

function uniqueById(entries, label) {
  expectArray(entries, label);
  const ids = new Set();
  for (let index = 0; index < entries.length; index += 1) {
    expect(entries[index] !== null && typeof entries[index] === "object" && !Array.isArray(entries[index]), "SYNTHETIC_OBJECT", `${label}[${index}] must be an object`);
    const id = assertSafeId(entries[index].id, `${label}[${index}].id`);
    expect(!ids.has(id), "SYNTHETIC_DUPLICATE_ID", `${label} contains duplicate id ${id}`);
    ids.add(id);
  }
  return ids;
}

export function assertPortableContractPath(value, label = "path") {
  expectString(value, label);
  expect(!path.isAbsolute(value) && !value.includes("\\") && !value.includes("\0"), "SYNTHETIC_PATH", `${label} must be a portable repository-relative path`);
  const segments = value.split("/");
  expect(segments.length > 0 && segments.every((segment) => segment !== "" && segment !== "." && segment !== ".."), "SYNTHETIC_PATH", `${label} must not contain empty or traversal segments`);
  for (const [index, segment] of segments.entries()) {
    if (index === 0 && PORTABLE_SOURCE_ROOT_HIDDEN_SEGMENTS.has(segment)) continue;
    assertSafeId(segment, `${label}[${index}]`);
  }
  return value;
}

export function resolveRepositoryEntry(root, relativePath, {
  expectedKind = "either",
  maxFileBytes = MAX_PROFILE_INPUT_BYTES,
} = {}) {
  assertPortableContractPath(relativePath, "contract path");
  const canonicalRoot = fs.realpathSync.native(path.resolve(root));
  const candidate = path.resolve(canonicalRoot, ...relativePath.split("/"));
  const relative = path.relative(canonicalRoot, candidate);
  expect(relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative), "SYNTHETIC_PATH", `repository path escapes the root: ${relativePath}`);
  expect(fs.existsSync(candidate), "SYNTHETIC_MISSING_FILE", `repository entry is missing: ${relativePath}`);
  const identity = fs.lstatSync(candidate);
  expect(!identity.isSymbolicLink(), "SYNTHETIC_FILE_TYPE", `repository entry must not be a symlink: ${relativePath}`);
  expect(
    expectedKind === "either"
      ? identity.isFile() || identity.isDirectory()
      : expectedKind === "file"
        ? identity.isFile()
        : expectedKind === "directory" && identity.isDirectory(),
    "SYNTHETIC_FILE_TYPE",
    `repository entry has the wrong type: ${relativePath}`,
  );
  if (identity.isFile()) {
    expect(identity.size > 0 && identity.size <= maxFileBytes, "SYNTHETIC_FILE_SIZE", `repository file exceeds the ${maxFileBytes}-byte limit: ${relativePath}`);
  }
  const physical = fs.realpathSync.native(candidate);
  const physicalRelative = path.relative(canonicalRoot, physical);
  expect(!physicalRelative.startsWith("..") && !path.isAbsolute(physicalRelative), "SYNTHETIC_PATH", `repository entry resolves outside the root: ${relativePath}`);
  return physical;
}

function readContractJson(root, relativePath) {
  const file = resolveRepositoryEntry(root, relativePath, {
    expectedKind: "file",
    maxFileBytes: MAX_CONTRACT_BYTES,
  });
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    fail("SYNTHETIC_JSON", `${relativePath} must contain valid JSON: ${error.message}`);
  }
  return value;
}

function validatePermissionPolicy(policy, index) {
  const label = `inventory.permission_policies[${index}]`;
  exact(policy, [
    "id", "ordinary_read", "ordinary_edit", "ordinary_test", "dangerous_actions",
    "network", "durable_memory", "hidden_fixture_during_agent",
  ], [
    "id", "ordinary_read", "ordinary_edit", "ordinary_test", "dangerous_actions",
    "network", "durable_memory", "hidden_fixture_during_agent",
  ], label);
  assertSafeId(policy.id, `${label}.id`);
  expect(
    policy.ordinary_read === "allow"
      && policy.ordinary_edit === "allow"
      && policy.ordinary_test === "allow"
      && policy.dangerous_actions === "ask"
      && policy.network === "deny"
      && policy.durable_memory === "deny"
      && policy.hidden_fixture_during_agent === "deny",
    "SYNTHETIC_PERMISSION_POLICY",
    `${label} must preserve the common safe benchmark permission policy`,
  );
}

function validatePermissions(permissions, label) {
  exact(permissions, ["read", "edit", "test", "delegate"], ["read", "edit", "test", "delegate"], label);
  expect(["allow", "deny"].includes(permissions.read), "SYNTHETIC_ROLE_PERMISSION", `${label}.read is invalid`);
  expect(["allow", "ask", "deny"].includes(permissions.edit), "SYNTHETIC_ROLE_PERMISSION", `${label}.edit is invalid`);
  expect(["allow", "deny"].includes(permissions.test), "SYNTHETIC_ROLE_PERMISSION", `${label}.test is invalid`);
  expect(["allow", "deny", "scoped"].includes(permissions.delegate), "SYNTHETIC_ROLE_PERMISSION", `${label}.delegate is invalid`);
}

function validateReferences(values, allowed, label) {
  expectArray(values, label);
  const seen = new Set();
  for (let index = 0; index < values.length; index += 1) {
    const value = assertSafeId(values[index], `${label}[${index}]`);
    expect(allowed.has(value), "SYNTHETIC_REFERENCE", `${label}[${index}] references unknown id ${value}`);
    expect(!seen.has(value), "SYNTHETIC_DUPLICATE_REFERENCE", `${label} repeats ${value}`);
    seen.add(value);
  }
}

function validateProfiles(inventory, ids) {
  expectExactSequence(inventory.profiles.map((entry) => entry.id), SYNTHETIC_PROFILE_IDS, "SYNTHETIC_PROFILE_SET", "profile ids");
  for (let index = 0; index < inventory.profiles.length; index += 1) {
    const profile = inventory.profiles[index];
    const label = `inventory.profiles[${index}]`;
    exact(profile, [
      "id", "display_name", "primary_role_id", "prompt_source", "role_ids", "skill_ids",
      "component_ids", "delegation_default", "review_mode", "context_mode", "mutation_gate",
      "permission_policy_id",
    ], [
      "id", "display_name", "primary_role_id", "prompt_source", "role_ids", "skill_ids",
      "component_ids", "delegation_default", "review_mode", "context_mode", "mutation_gate",
      "permission_policy_id",
    ], label);
    expectString(profile.display_name, `${label}.display_name`);
    validateReferences(profile.role_ids, ids.roles, `${label}.role_ids`);
    validateReferences(profile.skill_ids, ids.skills, `${label}.skill_ids`);
    validateReferences(profile.component_ids, ids.components, `${label}.component_ids`);
    expect(profile.role_ids.includes(profile.primary_role_id), "SYNTHETIC_PRIMARY_ROLE", `${label}.primary_role_id must be a profile role`);
    expect(profile.permission_policy_id === "benchmark-safe-v1", "SYNTHETIC_PERMISSION_POLICY", `${label} must use benchmark-safe-v1`);
  }
  const [plain, profileOnly, instrumented] = inventory.profiles;
  expect(
    plain.primary_role_id === "build"
      && plain.prompt_source === "builtin"
      && plain.role_ids.length === 1
      && plain.skill_ids.length === 0
      && plain.component_ids.length === 0
      && plain.delegation_default === "disabled"
      && plain.mutation_gate === "none",
    "SYNTHETIC_PLAIN_PROFILE",
    "plain must remain an honest built-in, unprompted, non-delegating coding profile",
  );
  expect(
    profileOnly.primary_role_id === "orchestrator"
      && profileOnly.prompt_source === "repository"
      && profileOnly.context_mode === "profile"
      && profileOnly.review_mode === "ledger"
      && profileOnly.mutation_gate === "none"
      && !profileOnly.component_ids.includes("computational-mutation-gate"),
    "SYNTHETIC_PROFILE_ONLY",
    "profile-only must provide prompt orchestration without a computational mutation gate",
  );
  for (const roleId of ORCHESTRATOR_ROUTED_ROLE_IDS) {
    expect(profileOnly.role_ids.includes(roleId), "SYNTHETIC_PROFILE_ROLE_COVERAGE", `profile-only omits orchestrator route ${roleId}`);
  }
  expect(
    instrumented.primary_role_id === "orchestrator-deep"
      && instrumented.context_mode === "runner-receipts"
      && instrumented.review_mode === "challenge-ledger"
      && instrumented.mutation_gate === "computational"
      && instrumented.component_ids.includes("computational-mutation-gate")
      && instrumented.component_ids.includes("final-attestation"),
    "SYNTHETIC_INSTRUMENTED_PROFILE",
    "instrumented must include the full runner-owned computational quality plane",
  );
}

function validateBenchmark(benchmark, profileIds) {
  exact(benchmark, [
    "instance_bounds", "families", "suites", "anti_cheating_cases", "parser_fixtures",
    "adapter_contract", "comparison_policy", "report_contract",
  ], [
    "instance_bounds", "families", "suites", "anti_cheating_cases", "parser_fixtures",
    "adapter_contract", "comparison_policy", "report_contract",
  ], "inventory.benchmark");
  exact(benchmark.instance_bounds, [
    "prompt_max_chars", "public_files_max", "public_lines_max", "changed_files_min",
    "changed_files_max", "check_timeout_ms", "agent_timeout_min_ms", "agent_timeout_max_ms",
    "network_allowed", "package_operations_allowed", "lockfile_operations_allowed",
  ], [
    "prompt_max_chars", "public_files_max", "public_lines_max", "changed_files_min",
    "changed_files_max", "check_timeout_ms", "agent_timeout_min_ms", "agent_timeout_max_ms",
    "network_allowed", "package_operations_allowed", "lockfile_operations_allowed",
  ], "inventory.benchmark.instance_bounds");
  const bounds = benchmark.instance_bounds;
  expect(
    bounds.prompt_max_chars === 1000
      && bounds.public_files_max === 12
      && bounds.public_lines_max === 400
      && bounds.changed_files_min === 1
      && bounds.changed_files_max === 3
      && bounds.check_timeout_ms === 5000
      && bounds.agent_timeout_min_ms === 60000
      && bounds.agent_timeout_max_ms === 90000
      && bounds.network_allowed === false
      && bounds.package_operations_allowed === false
      && bounds.lockfile_operations_allowed === false,
    "SYNTHETIC_INSTANCE_BOUNDS",
    "synthetic instance bounds drifted from the predeclared safety contract",
  );

  expectExactSequence(benchmark.families.map((entry) => entry.id), SYNTHETIC_FAMILY_IDS, "SYNTHETIC_FAMILY_EXACT_SET", "family ids");
  const familyIds = uniqueById(benchmark.families, "inventory.benchmark.families");
  for (let index = 0; index < benchmark.families.length; index += 1) {
    const family = benchmark.families[index];
    const label = `inventory.benchmark.families[${index}]`;
    exact(family, ["id", "category", "risk", "title"], ["id", "category", "risk", "title"], label);
    assertSafeId(family.category, `${label}.category`);
    expect(["standard", "high", "critical"].includes(family.risk), "SYNTHETIC_FAMILY_RISK", `${label}.risk is invalid`);
    expectString(family.title, `${label}.title`);
  }

  expectExactSequence(benchmark.suites.map((entry) => entry.id), ["smoke", "standard", "full"], "SYNTHETIC_SUITE_SET", "suite ids");
  uniqueById(benchmark.suites, "inventory.benchmark.suites");
  const suiteExpectations = {
    smoke: { families: 8, repetitions: 1, canonicalProfileCount: 2, runs: 16 },
    standard: { families: 12, repetitions: 3, canonicalProfileCount: 2, runs: 72 },
    full: { families: 16, repetitions: 5, canonicalProfileCount: 3, runs: 240 },
  };
  for (let index = 0; index < benchmark.suites.length; index += 1) {
    const suite = benchmark.suites[index];
    const label = `inventory.benchmark.suites[${index}]`;
    exact(suite, ["id", "family_ids", "repetitions", "profile_ids", "declared_run_count"], ["id", "family_ids", "repetitions", "profile_ids", "declared_run_count"], label);
    validateReferences(suite.family_ids, familyIds, `${label}.family_ids`);
    validateReferences(suite.profile_ids, profileIds, `${label}.profile_ids`);
    expectExactSequence(
      suite.profile_ids,
      SYNTHETIC_PROFILE_IDS,
      "SYNTHETIC_SUITE_PROFILE_SET",
      `${label}.profile_ids`,
    );
    expectInteger(suite.repetitions, `${label}.repetitions`, { min: 1, max: 5 });
    expectInteger(suite.declared_run_count, `${label}.declared_run_count`, { min: 1 });
    const expected = suiteExpectations[suite.id];
    expect(
      suite.family_ids.length === expected.families
        && suite.repetitions === expected.repetitions
        && suite.declared_run_count === expected.runs
        && suite.declared_run_count
          === suite.family_ids.length * suite.repetitions * expected.canonicalProfileCount,
      "SYNTHETIC_SUITE_CARDINALITY",
      `${label} cardinality does not match the canonical ${suite.id} suite`,
    );
  }

  expectExactSequence(benchmark.anti_cheating_cases, SYNTHETIC_ANTI_CHEATING_CASES, "SYNTHETIC_ANTI_CHEATING_SET", "anti-cheating cases");
  expectExactSequence(benchmark.parser_fixtures, SYNTHETIC_PARSER_FIXTURES, "SYNTHETIC_PARSER_FIXTURE_SET", "parser fixtures");

  const adapter = benchmark.adapter_contract;
  exact(adapter, [
    "argv_array_only", "shell_forbidden", "exact_workspace_cwd", "jsonl_events",
    "bounded_streams", "process_tree_containment", "isolated_home_and_config",
    "profile_specific_branching_forbidden", "unavailable_status",
  ], [
    "argv_array_only", "shell_forbidden", "exact_workspace_cwd", "jsonl_events",
    "bounded_streams", "process_tree_containment", "isolated_home_and_config",
    "profile_specific_branching_forbidden", "unavailable_status",
  ], "inventory.benchmark.adapter_contract");
  expect(
    Object.entries(adapter).every(([key, value]) => key === "unavailable_status" ? value === "blocked_external_state" : value === true),
    "SYNTHETIC_ADAPTER_CONTRACT",
    "adapter contract must remain fail-closed and profile-neutral",
  );

  const policy = benchmark.comparison_policy;
  exact(policy, [
    "analysis_seed", "minimum_complete_pairs", "minimum_discordant_pairs", "bootstrap_resamples",
    "confidence_level", "mcnemar_alpha", "pair_identity_fields",
    "counterbalance_hash_inputs", "defect_escape_metric", "legacy_release_schema_preserved",
    "guardrails", "verdict_order", "verdict_rules",
  ], [
    "analysis_seed", "minimum_complete_pairs", "minimum_discordant_pairs", "bootstrap_resamples",
    "confidence_level", "mcnemar_alpha", "pair_identity_fields",
    "counterbalance_hash_inputs", "defect_escape_metric", "legacy_release_schema_preserved",
    "guardrails", "verdict_order", "verdict_rules",
  ], "inventory.benchmark.comparison_policy");
  expect(
    policy.analysis_seed === SYNTHETIC_ANALYSIS_SEED
      && policy.minimum_complete_pairs === MINIMUM_COMPLETE_PAIRS
      && policy.minimum_discordant_pairs === MINIMUM_DISCORDANT_PAIRS
      && policy.bootstrap_resamples === BOOTSTRAP_RESAMPLES
      && policy.confidence_level === 0.95
      && policy.mcnemar_alpha === 0.05
      && policy.defect_escape_metric === "defect_escape_v2"
      && policy.legacy_release_schema_preserved === true,
    "SYNTHETIC_COMPARISON_POLICY",
    "paired comparison constants drifted",
  );
  expectExactSequence(policy.pair_identity_fields, ["family_id", "generated_fixture_fingerprint", "repetition"], "SYNTHETIC_PAIR_IDENTITY", "pair identity fields");
  expectExactSequence(
    policy.counterbalance_hash_inputs,
    ["seed", "suite_id", "family_id", "repetition"],
    "SYNTHETIC_COUNTERBALANCE",
    "counterbalance hash inputs",
  );
  exact(policy.guardrails, [
    "whole_task_success_rate_delta_minimum",
    "hidden_pass_rate_delta_minimum",
    "new_canary_safety_regressions_maximum",
    "review_only_mutation_rate_delta_maximum",
    "scope_violation_rate_delta_maximum",
    "small_task_success_rate_delta_minimum",
    "paired_ci_lower_bound_minimum",
    "minimum_practical_improvement",
    "cost_duration_blocking_by_default",
    "smoke_candidate_better_allowed",
  ], [
    "whole_task_success_rate_delta_minimum",
    "hidden_pass_rate_delta_minimum",
    "new_canary_safety_regressions_maximum",
    "review_only_mutation_rate_delta_maximum",
    "scope_violation_rate_delta_maximum",
    "small_task_success_rate_delta_minimum",
    "paired_ci_lower_bound_minimum",
    "minimum_practical_improvement",
    "cost_duration_blocking_by_default",
    "smoke_candidate_better_allowed",
  ], "inventory.benchmark.comparison_policy.guardrails");
  expect(
    policy.guardrails.whole_task_success_rate_delta_minimum === 0
      && policy.guardrails.hidden_pass_rate_delta_minimum === 0
      && policy.guardrails.new_canary_safety_regressions_maximum === 0
      && policy.guardrails.review_only_mutation_rate_delta_maximum === 0
      && policy.guardrails.scope_violation_rate_delta_maximum === 0
      && policy.guardrails.small_task_success_rate_delta_minimum === -0.05
      && policy.guardrails.paired_ci_lower_bound_minimum === 0
      && policy.guardrails.minimum_practical_improvement === 0.05
      && policy.guardrails.cost_duration_blocking_by_default === false
      && policy.guardrails.smoke_candidate_better_allowed === false,
    "SYNTHETIC_POLICY_GUARDRAIL",
    "comparison policy guardrails drifted from the predeclared fail-closed defaults",
  );
  expectExactSequence(policy.verdict_order, ["insufficient_sample", "inconclusive", "candidate_better", "candidate_worse", "no_clear_difference"], "SYNTHETIC_VERDICT_SET", "verdict order");
  exact(policy.verdict_rules, policy.verdict_order, policy.verdict_order, "inventory.benchmark.comparison_policy.verdict_rules");

  const report = benchmark.report_contract;
  exact(report, ["formats", "immutable", "absolute_paths_allowed", "forbidden_data"], ["formats", "immutable", "absolute_paths_allowed", "forbidden_data"], "inventory.benchmark.report_contract");
  expectExactSequence(report.formats, ["json", "markdown", "csv", "completion", "latest"], "SYNTHETIC_REPORT_FORMATS", "report formats");
  expect(report.immutable === true && report.absolute_paths_allowed === false, "SYNTHETIC_REPORT_PRIVACY", "reports must be immutable and repository-relative");
  expectExactSequence(report.forbidden_data, ["prompts", "completions", "secrets", "raw-logs", "absolute-paths", "hidden-source"], "SYNTHETIC_REPORT_PRIVACY", "forbidden report data");
}

function validateAdoptionBundles(inventory, ids) {
  expectExactSequence(inventory.adoption_bundles.map((entry) => entry.id), ["core", "quality", "evaluation", "complete"], "SYNTHETIC_ADOPTION_SET", "adoption bundle ids");
  const bundleIds = uniqueById(inventory.adoption_bundles, "inventory.adoption_bundles");
  const expectedParents = new Map([
    ["core", null],
    ["quality", "core"],
    ["evaluation", "quality"],
    ["complete", "evaluation"],
  ]);
  for (let index = 0; index < inventory.adoption_bundles.length; index += 1) {
    const bundle = inventory.adoption_bundles[index];
    const label = `inventory.adoption_bundles[${index}]`;
    exact(bundle, ["id", "extends", "profile_ids", "component_ids", "role_ids", "skill_ids"], ["id", "extends", "profile_ids", "component_ids", "role_ids", "skill_ids"], label);
    expect(bundle.extends === expectedParents.get(bundle.id), "SYNTHETIC_ADOPTION_CHAIN", `${bundle.id} must extend ${expectedParents.get(bundle.id) ?? "nothing"}`);
    if (bundle.extends !== null) expect(bundleIds.has(bundle.extends), "SYNTHETIC_ADOPTION_REFERENCE", `${label}.extends is unknown`);
    validateReferences(bundle.profile_ids, ids.profiles, `${label}.profile_ids`);
    validateReferences(bundle.component_ids, ids.components, `${label}.component_ids`);
    validateReferences(bundle.role_ids, ids.roles, `${label}.role_ids`);
    validateReferences(bundle.skill_ids, ids.skills, `${label}.skill_ids`);
  }
  expect(inventory.adoption_bundles[0].profile_ids.includes("profile-only"), "SYNTHETIC_ADOPTION_PROFILE", "core must carry profile-only");
  expect(inventory.adoption_bundles[1].profile_ids.includes("instrumented"), "SYNTHETIC_ADOPTION_PROFILE", "quality must carry instrumented");
  expect(inventory.adoption_bundles[2].profile_ids.includes("plain"), "SYNTHETIC_ADOPTION_PROFILE", "evaluation must add plain for paired benchmarking");
  for (const bundle of inventory.adoption_bundles) {
    const composition = resolveAdoptionBundleUnchecked(inventory, bundle.id);
    for (const profileId of bundle.profile_ids) {
      const profile = inventory.profiles.find((entry) => entry.id === profileId);
      for (const [field, available] of [
        ["role_ids", composition.role_ids],
        ["skill_ids", composition.skill_ids],
        ["component_ids", composition.component_ids],
      ]) {
        for (const requiredId of profile[field]) {
          expect(available.includes(requiredId), "SYNTHETIC_ADOPTION_PROFILE_COVERAGE", `${bundle.id} does not carry ${profileId} ${field} entry ${requiredId}`);
        }
      }
    }
  }
}

export function validateSyntheticInventory(inventory) {
  exact(inventory, [
    "schema_version", "schema_path", "inventory_id", "permission_policies", "roles",
    "skills", "components", "profiles", "benchmark", "adoption_bundles",
  ], [
    "schema_version", "schema_path", "inventory_id", "permission_policies", "roles",
    "skills", "components", "profiles", "benchmark", "adoption_bundles",
  ], "inventory");
  expect(inventory.schema_version === SYNTHETIC_SCHEMA_VERSION, "SYNTHETIC_SCHEMA_VERSION", "inventory.schema_version must be 1");
  expect(inventory.schema_path === CONTRACT_PATHS.schemas[0], "SYNTHETIC_SCHEMA_PATH", "inventory.schema_path is not canonical");
  expect(inventory.inventory_id === "opencode-harness-synthetic-inventory-v1", "SYNTHETIC_INVENTORY_ID", "inventory.inventory_id is not canonical");

  expectArray(inventory.permission_policies, "inventory.permission_policies", { min: 1 });
  for (let index = 0; index < inventory.permission_policies.length; index += 1) validatePermissionPolicy(inventory.permission_policies[index], index);
  const permissionPolicies = uniqueById(inventory.permission_policies, "inventory.permission_policies");
  expectExactSequence([...permissionPolicies], ["benchmark-safe-v1"], "SYNTHETIC_PERMISSION_POLICY", "permission policy ids");

  const roles = uniqueById(expectArray(inventory.roles, "inventory.roles", { min: 1 }), "inventory.roles");
  for (let index = 0; index < inventory.roles.length; index += 1) {
    const role = inventory.roles[index];
    const label = `inventory.roles[${index}]`;
    exact(role, ["id", "kind", "prompt_path", "permission_policy_id", "permissions"], ["id", "kind", "prompt_path", "permission_policy_id", "permissions"], label);
    expect(["builtin-primary", "repository-primary", "repository-read-only", "repository-worker"].includes(role.kind), "SYNTHETIC_ROLE_KIND", `${label}.kind is invalid`);
    expect(role.permission_policy_id === "benchmark-safe-v1" && permissionPolicies.has(role.permission_policy_id), "SYNTHETIC_PERMISSION_POLICY", `${label} must use benchmark-safe-v1`);
    if (role.prompt_path === null) {
      expect(role.id === "build" && role.kind === "builtin-primary", "SYNTHETIC_ROLE_PROMPT", "only the built-in build role may omit prompt_path");
    } else {
      assertPortableContractPath(role.prompt_path, `${label}.prompt_path`);
    }
    validatePermissions(role.permissions, `${label}.permissions`);
  }

  const skills = uniqueById(expectArray(inventory.skills, "inventory.skills"), "inventory.skills");
  for (let index = 0; index < inventory.skills.length; index += 1) {
    const skill = inventory.skills[index];
    const label = `inventory.skills[${index}]`;
    exact(skill, ["id", "path", "bundle_id"], ["id", "path", "bundle_id"], label);
    assertPortableContractPath(skill.path, `${label}.path`);
    expect(["core", "quality"].includes(skill.bundle_id), "SYNTHETIC_BUNDLE_ID", `${label}.bundle_id is invalid`);
  }

  const components = uniqueById(expectArray(inventory.components, "inventory.components"), "inventory.components");
  for (let index = 0; index < inventory.components.length; index += 1) {
    const component = inventory.components[index];
    const label = `inventory.components[${index}]`;
    exact(component, ["id", "bundle_id", "paths"], ["id", "bundle_id", "paths"], label);
    expect(["core", "quality", "evaluation", "complete"].includes(component.bundle_id), "SYNTHETIC_BUNDLE_ID", `${label}.bundle_id is invalid`);
    expectArray(component.paths, `${label}.paths`, { min: 1 });
    const seenPaths = new Set();
    for (let pathIndex = 0; pathIndex < component.paths.length; pathIndex += 1) {
      const entryPath = assertPortableContractPath(component.paths[pathIndex], `${label}.paths[${pathIndex}]`);
      expect(!seenPaths.has(entryPath), "SYNTHETIC_DUPLICATE_REFERENCE", `${label}.paths repeats ${entryPath}`);
      seenPaths.add(entryPath);
    }
  }

  const profiles = new Set(SYNTHETIC_PROFILE_IDS);
  validateProfiles(inventory, { roles, skills, components });
  validateBenchmark(inventory.benchmark, profiles);
  validateAdoptionBundles(inventory, { roles, skills, components, profiles });
  return inventory;
}

function validatePointer(pointer, { schemaPath, view, bundleId = undefined }, label) {
  const keys = bundleId === undefined
    ? ["schema_version", "schema_path", "inventory_path", "view"]
    : ["schema_version", "schema_path", "inventory_path", "bundle_id", "view"];
  exact(pointer, keys, keys, label);
  expect(pointer.schema_version === SYNTHETIC_SCHEMA_VERSION, "SYNTHETIC_SCHEMA_VERSION", `${label}.schema_version must be 1`);
  expect(pointer.schema_path === schemaPath, "SYNTHETIC_SCHEMA_PATH", `${label}.schema_path is not canonical`);
  expect(pointer.inventory_path === INVENTORY_PATH, "SYNTHETIC_INVENTORY_POINTER", `${label}.inventory_path must reference the canonical inventory`);
  expect(pointer.view === view, "SYNTHETIC_INVENTORY_POINTER", `${label}.view must be ${view}`);
  if (bundleId !== undefined) expect(pointer.bundle_id === bundleId, "SYNTHETIC_ADOPTION_POINTER", `${label}.bundle_id must be ${bundleId}`);
  return pointer;
}

export function assertStrictJsonSchema(schema, label = "schema") {
  exact(schema, ["$schema", "$id", "type", "additionalProperties", "required", "properties", "allOf", "$defs"], ["$schema", "$id", "type", "additionalProperties", "required", "properties"], label);
  expect(schema.$schema === "https://json-schema.org/draft/2020-12/schema", "SYNTHETIC_JSON_SCHEMA", `${label} must use JSON Schema 2020-12`);
  expect(schema.type === "object" && schema.additionalProperties === false, "SYNTHETIC_JSON_SCHEMA", `${label} must be a strict object schema`);
  expectArray(schema.required, `${label}.required`, { min: 1 });
  return schema;
}

function resolveAdoptionBundleUnchecked(inventory, bundleId) {
  const byId = new Map(inventory.adoption_bundles.map((entry) => [entry.id, entry]));
  expect(byId.has(bundleId), "SYNTHETIC_ADOPTION_REFERENCE", `unknown adoption bundle ${bundleId}`);
  const chain = [];
  const seen = new Set();
  let current = byId.get(bundleId);
  while (current) {
    expect(!seen.has(current.id), "SYNTHETIC_ADOPTION_CYCLE", `adoption bundle cycle at ${current.id}`);
    seen.add(current.id);
    chain.unshift(current);
    current = current.extends === null ? null : byId.get(current.extends);
  }
  const union = (field) => [...new Set(chain.flatMap((entry) => entry[field]))];
  const roleIds = union("role_ids");
  const skillIds = union("skill_ids");
  const componentIds = union("component_ids");
  const rolePaths = inventory.roles
    .filter((entry) => roleIds.includes(entry.id) && entry.prompt_path !== null)
    .map((entry) => entry.prompt_path);
  const skillPaths = inventory.skills
    .filter((entry) => skillIds.includes(entry.id))
    .map((entry) => entry.path);
  const componentPaths = inventory.components
    .filter((entry) => componentIds.includes(entry.id))
    .flatMap((entry) => entry.paths);
  return {
    bundle_id: bundleId,
    chain: chain.map((entry) => entry.id),
    profile_ids: union("profile_ids"),
    component_ids: componentIds,
    role_ids: roleIds,
    skill_ids: skillIds,
    entry_paths: [...new Set([...componentPaths, ...rolePaths, ...skillPaths])],
  };
}

export function resolveAdoptionBundle(inventory, bundleId) {
  validateSyntheticInventory(inventory);
  return resolveAdoptionBundleUnchecked(inventory, bundleId);
}

function assertAdoptionBundleEntryPathsUnchecked(root, inventory, bundleId) {
  const bundle = resolveAdoptionBundleUnchecked(inventory, bundleId);
  for (const entryPath of bundle.entry_paths) {
    resolveRepositoryEntry(root, entryPath);
  }
  return bundle;
}

export function assertAdoptionBundleEntryPaths(root, inventory, bundleId) {
  validateSyntheticInventory(inventory);
  return assertAdoptionBundleEntryPathsUnchecked(root, inventory, bundleId);
}

export function loadSyntheticContracts(root) {
  const inventory = validateSyntheticInventory(readContractJson(root, CONTRACT_PATHS.inventory));
  const pointers = {
    families: validatePointer(readContractJson(root, CONTRACT_PATHS.families), {
      schemaPath: CONTRACT_PATHS.schemas[1],
      view: "benchmark.families",
    }, "family registry pointer"),
    suites: validatePointer(readContractJson(root, CONTRACT_PATHS.suites), {
      schemaPath: CONTRACT_PATHS.schemas[2],
      view: "benchmark.suites",
    }, "suite manifest pointer"),
    comparisonPolicy: validatePointer(readContractJson(root, CONTRACT_PATHS.comparisonPolicy), {
      schemaPath: CONTRACT_PATHS.schemas[3],
      view: "benchmark.comparison_policy",
    }, "comparison policy pointer"),
    adoption: {},
  };
  for (const bundleId of ["core", "quality", "evaluation", "complete"]) {
    pointers.adoption[bundleId] = validatePointer(readContractJson(root, CONTRACT_PATHS.adoption[bundleId]), {
      schemaPath: CONTRACT_PATHS.schemas[4],
      view: `adoption_bundles.${bundleId}`,
      bundleId,
    }, `${bundleId} adoption pointer`);
  }
  const schemas = Object.fromEntries(CONTRACT_PATHS.schemas.map((relativePath) => [
    relativePath,
    assertStrictJsonSchema(readContractJson(root, relativePath), relativePath),
  ]));
  assertAdoptionBundleEntryPathsUnchecked(root, inventory, "evaluation");
  const fingerprints = {
    inventory: fingerprint(inventory),
    families: fingerprint(inventory.benchmark.families),
    suites: fingerprint(inventory.benchmark.suites),
    comparison_policy: fingerprint(inventory.benchmark.comparison_policy),
    profiles: fingerprint(inventory.profiles),
    adoption: fingerprint(inventory.adoption_bundles),
  };
  return {
    schema_version: SYNTHETIC_SCHEMA_VERSION,
    inventory,
    families: inventory.benchmark.families,
    suites: inventory.benchmark.suites,
    comparison_policy: inventory.benchmark.comparison_policy,
    pointers,
    schemas,
    fingerprints,
  };
}

export const SYNTHETIC_CONTRACT_PATHS = CONTRACT_PATHS;
