import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  BOOTSTRAP_RESAMPLES,
  MINIMUM_COMPLETE_PAIRS,
  MINIMUM_DISCORDANT_PAIRS,
  SYNTHETIC_ANALYSIS_SEED,
  SYNTHETIC_ANTI_CHEATING_CASES,
  SYNTHETIC_FAMILY_IDS,
  SYNTHETIC_PARSER_FIXTURES,
  SYNTHETIC_PROFILE_IDS,
  loadSyntheticContracts,
  resolveRepositoryEntry,
  resolveAdoptionBundle,
  validateSyntheticInventory,
} from "../lib/benchmark/contracts.mjs";
import { assertSafeId } from "../lib/feedback/contracts.mjs";
import { parsePromptFrontmatter } from "../lib/quality/prompt-inventory.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function expectCode(callback, code) {
  assert.throws(callback, (error) => error?.code === code, `expected ${code}`);
}

function verifyConfiguredRolePermissions(root, roles) {
  for (const role of roles) {
    if (role.prompt_path === null) continue;
    const source = fs.readFileSync(resolveRepositoryEntry(root, role.prompt_path, { expectedKind: "file" }), "utf8");
    const frontmatter = parsePromptFrontmatter(source, role.prompt_path).frontmatter;
    assert.equal(
      frontmatter.mode,
      role.kind.includes("primary") ? "primary" : "subagent",
      `${role.id} mode drifted from the canonical inventory`,
    );
    const actualRead = frontmatter.permission?.read === "deny" ? "deny" : "allow";
    assert.equal(actualRead, role.permissions.read, `${role.id} read permission drifted`);
    const actualEdit = frontmatter.permission?.edit;
    if (role.permissions.edit === "allow") {
      assert.notEqual(actualEdit, "deny", `${role.id} unexpectedly denies edit`);
      assert.notEqual(actualEdit, "ask", `${role.id} unexpectedly asks for ordinary edit`);
    } else {
      assert.equal(actualEdit, role.permissions.edit, `${role.id} edit permission drifted`);
    }
    const bashPermission = frontmatter.permission?.bash;
    const actualTest = bashPermission === "deny"
      || (bashPermission !== null && typeof bashPermission === "object" && bashPermission["*"] === "deny")
      ? "deny"
      : "allow";
    assert.equal(actualTest, role.permissions.test, `${role.id} test permission drifted`);
    const taskPermissions = frontmatter.permission?.task ?? {};
    const delegated = Object.entries(taskPermissions)
      .filter(([key, value]) => key !== "*" && ["allow", "ask"].includes(value));
    if (role.permissions.delegate === "scoped") {
      assert.equal(taskPermissions["*"], "deny", `${role.id} scoped delegation must deny unknown roles`);
      assert(delegated.length > 0, `${role.id} scoped delegation has no allowed route`);
    } else if (role.permissions.delegate === "deny") {
      assert.equal(delegated.length, 0, `${role.id} unexpectedly permits delegation`);
    }
  }
}

function verifyPhysicalConfinementNegativeFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "synthetic-contract-path-"));
  const sourceRoot = path.join(fixtureRoot, "source");
  const externalRoot = path.join(fixtureRoot, "external");
  fs.mkdirSync(sourceRoot);
  fs.mkdirSync(externalRoot);
  fs.writeFileSync(path.join(externalRoot, "prompt.md"), "external prompt\n", "utf8");
  try {
    fs.symlinkSync(externalRoot, path.join(sourceRoot, "escape"), process.platform === "win32" ? "junction" : "dir");
    expectCode(
      () => resolveRepositoryEntry(sourceRoot, "escape/prompt.md", { expectedKind: "file" }),
      "SYNTHETIC_PATH",
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function materializeCoreFixture(root, core) {
  const fixtureRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "synthetic-core-bundle-"));
  try {
    for (const entryPath of core.entry_paths) {
      const source = resolveRepositoryEntry(root, entryPath);
      const target = path.join(fixtureRoot, ...entryPath.split("/"));
      if (fs.existsSync(target)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.cpSync(source, target, { recursive: true, errorOnExist: false, force: false });
    }
    for (const entryPath of core.entry_paths) {
      assert(fs.existsSync(path.join(fixtureRoot, ...entryPath.split("/"))), `core materialization omitted ${entryPath}`);
    }
    const copied = [];
    const visit = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(absolute);
        else copied.push(path.relative(fixtureRoot, absolute).replaceAll("\\", "/"));
      }
    };
    visit(fixtureRoot);
    assert(copied.length > 0, "core bundle materialized no files");
    assert(!copied.some((entry) => entry.startsWith("benchmarks/") || entry.startsWith("lib/benchmark/") || entry.startsWith("lib/quality/") || entry.startsWith("quality/")), "core bundle leaked quality or evaluation infrastructure");
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function verifyWholeTaskSuccessEvidenceSchema(schema) {
  assert.deepEqual(schema.$defs.count, {
    type: "integer",
    minimum: 0,
    maximum: 1000000,
  }, "count must be one strict reusable schema");
  assert.equal(schema.$defs.nullableCount.oneOf[0].$ref, "#/$defs/count");
  const successRule = schema.$defs.runResult.allOf.find(
    (entry) => entry.if?.properties?.whole_task_success?.const === true,
  );
  assert(successRule, "whole_task_success=true conditional is missing");
  const required = new Set(successRule.then.required);
  for (const field of ["agent_reported_success", "fingerprints", "metrics", "operational_trace_id"]) {
    assert(required.has(field), `successful runs must require ${field}`);
  }
  const properties = successRule.then.properties;
  assert.equal(properties.agent_reported_success.const, true);
  for (const field of ["adapter", "initial_workspace", "final_workspace", "trace"]) {
    assert.equal(properties.fingerprints.properties[field].$ref, "#/$defs/fingerprint");
  }
  for (const field of [
    "tool_call_count",
    "subagent_call_count",
    "workspace_mutation_count",
    "fix_command_count",
    "duration_ms",
  ]) {
    assert.equal(properties.metrics.properties[field].$ref, "#/$defs/count");
  }
  for (const field of [
    "dangerous_command_count",
    "network_action_count",
    "hidden_access_attempt_count",
    "repository_instruction_action_count",
    "secret_write_count",
  ]) {
    assert.equal(properties.metrics.properties[field].const, 0);
  }
  assert.equal(
    properties.metrics.properties.availability.properties.network_actions.const,
    "available",
  );
  assert.equal(properties.operational_trace_id.$ref, "#/$defs/safeId");
}

function verifyWholeTaskSuccessEvidenceNegativeFixtures(schema) {
  const mutations = [
    (candidate) => { delete candidate.$defs.count; },
    (candidate) => {
      const success = candidate.$defs.runResult.allOf[0].then;
      delete success.properties.agent_reported_success;
    },
    (candidate) => {
      candidate.$defs.runResult.allOf[0].then.properties.fingerprints.properties.adapter.$ref = "#/$defs/nullableFingerprint";
    },
    (candidate) => {
      candidate.$defs.runResult.allOf[0].then.properties.metrics.properties.tool_call_count.$ref = "#/$defs/nullableCount";
    },
    (candidate) => {
      candidate.$defs.runResult.allOf[0].then.properties.metrics.properties.dangerous_command_count.const = null;
    },
    (candidate) => {
      delete candidate.$defs.runResult.allOf[0].then.properties.metrics.properties.availability.properties.network_actions;
    },
    (candidate) => {
      candidate.$defs.runResult.allOf[0].then.properties.operational_trace_id.$ref = "#/$defs/nullableSafeId";
    },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(schema);
    mutate(candidate);
    assert.throws(() => verifyWholeTaskSuccessEvidenceSchema(candidate));
  }
}

export function verifyBenchmarkContracts({ root = defaultRoot } = {}) {
  const contracts = loadSyntheticContracts(root);
  assert.deepEqual(contracts.families.map((entry) => entry.id), SYNTHETIC_FAMILY_IDS);
  assert.deepEqual(contracts.inventory.profiles.map((entry) => entry.id), SYNTHETIC_PROFILE_IDS);
  assert.deepEqual(contracts.inventory.benchmark.anti_cheating_cases, SYNTHETIC_ANTI_CHEATING_CASES);
  assert.deepEqual(contracts.inventory.benchmark.parser_fixtures, SYNTHETIC_PARSER_FIXTURES);
  assert.equal(contracts.comparison_policy.minimum_complete_pairs, MINIMUM_COMPLETE_PAIRS);
  assert.equal(contracts.comparison_policy.minimum_discordant_pairs, MINIMUM_DISCORDANT_PAIRS);
  assert.equal(contracts.comparison_policy.bootstrap_resamples, BOOTSTRAP_RESAMPLES);
  assert.equal(contracts.comparison_policy.analysis_seed, SYNTHETIC_ANALYSIS_SEED);
  const runReportSchema = contracts.schemas["benchmarks/synthetic/schemas/run-report.v2.schema.json"];
  assert.equal(runReportSchema.$id, "https://opencode-harness.invalid/schemas/synthetic-run-report-v2");
  assert.equal(runReportSchema.properties.schema_version.const, 2);
  assert.equal(runReportSchema.properties.report_kind.const, "synthetic-paired-run");
  assert.equal(runReportSchema.properties.pairs.maxItems, 240);
  assert.equal(Object.hasOwn(runReportSchema.properties, "statistics"), false);
  assert.equal(Object.hasOwn(runReportSchema.properties, "verdict"), false);
  const comparisonReportSchema = contracts.schemas["benchmarks/synthetic/schemas/comparison-report.v1.schema.json"];
  assert.equal(comparisonReportSchema.$id, "https://opencode-harness.invalid/schemas/synthetic-comparison-report-v1");
  assert.equal(comparisonReportSchema.properties.schema_version.const, 1);
  assert.equal(comparisonReportSchema.properties.report_kind.const, "synthetic-paired-comparison");
  assert.deepEqual(comparisonReportSchema.$defs.verdict.properties.status.enum, contracts.comparison_policy.verdict_order);
  assert.equal(comparisonReportSchema.$defs.bootstrap.properties.resamples.const, BOOTSTRAP_RESAMPLES);
  const reportSafeIdPattern = new RegExp(runReportSchema.$defs.safeId.pattern);
  for (const id of ["run-1", "plain.profile"]) {
    assert.equal(reportSafeIdPattern.test(id), true);
    assert.equal(assertSafeId(id), id);
  }
  for (const id of ["CON", "con.txt", "run."]) {
    assert.equal(reportSafeIdPattern.test(id), false);
    assert.throws(() => assertSafeId(id));
  }
  assert.equal(runReportSchema.$defs.checkOutcome.allOf.length, 3);
  assert.equal(runReportSchema.$defs.runResult.allOf.length, 3);
  verifyWholeTaskSuccessEvidenceSchema(runReportSchema);
  verifyWholeTaskSuccessEvidenceNegativeFixtures(runReportSchema);

  const suiteCounts = Object.fromEntries(contracts.suites.map((suite) => [suite.id, suite.declared_run_count]));
  assert.deepEqual(suiteCounts, { smoke: 16, standard: 72, full: 240 });

  const core = resolveAdoptionBundle(contracts.inventory, "core");
  const quality = resolveAdoptionBundle(contracts.inventory, "quality");
  const evaluation = resolveAdoptionBundle(contracts.inventory, "evaluation");
  const complete = resolveAdoptionBundle(contracts.inventory, "complete");
  assert.deepEqual(core.chain, ["core"]);
  assert.deepEqual(quality.chain, ["core", "quality"]);
  assert.deepEqual(evaluation.chain, ["core", "quality", "evaluation"]);
  assert.deepEqual(complete.chain, ["core", "quality", "evaluation", "complete"]);
  assert.deepEqual(complete.profile_ids, ["profile-only", "instrumented", "plain"]);
  assert(core.entry_paths.length > 0);
  assert(quality.entry_paths.length > core.entry_paths.length);
  assert(evaluation.entry_paths.some((entry) => entry === "benchmarks/synthetic"));
  assert(complete.entry_paths.some((entry) => entry === "scripts"));
  assert(quality.component_ids.includes("computational-mutation-gate"));
  assert(!core.component_ids.includes("computational-mutation-gate"));

  verifyConfiguredRolePermissions(root, contracts.inventory.roles);
  const readPermissionDrift = structuredClone(contracts.inventory.roles);
  readPermissionDrift.find((entry) => entry.id === "orchestrator").permissions.read = "deny";
  assert.throws(() => verifyConfiguredRolePermissions(root, readPermissionDrift), /read permission drifted/);
  const testPermissionDrift = structuredClone(contracts.inventory.roles);
  testPermissionDrift.find((entry) => entry.id === "general").permissions.test = "deny";
  assert.throws(() => verifyConfiguredRolePermissions(root, testPermissionDrift), /test permission drifted/);
  verifyPhysicalConfinementNegativeFixture();
  materializeCoreFixture(root, core);

  const withUnknownField = structuredClone(contracts.inventory);
  withUnknownField.unknown = true;
  expectCode(() => validateSyntheticInventory(withUnknownField), "CONTRACT_UNKNOWN_FIELD");

  const missingFamily = structuredClone(contracts.inventory);
  missingFamily.benchmark.families.pop();
  expectCode(() => validateSyntheticInventory(missingFamily), "SYNTHETIC_FAMILY_EXACT_SET");

  const wrongSuiteCount = structuredClone(contracts.inventory);
  wrongSuiteCount.benchmark.suites[0].declared_run_count = 15;
  expectCode(() => validateSyntheticInventory(wrongSuiteCount), "SYNTHETIC_SUITE_CARDINALITY");

  const wrongSchemaVersion = structuredClone(contracts.inventory);
  wrongSchemaVersion.schema_version = 2;
  expectCode(() => validateSyntheticInventory(wrongSchemaVersion), "SYNTHETIC_SCHEMA_VERSION");

  const dangerousPermissionDrift = structuredClone(contracts.inventory);
  dangerousPermissionDrift.permission_policies[0].dangerous_actions = "allow";
  expectCode(() => validateSyntheticInventory(dangerousPermissionDrift), "SYNTHETIC_PERMISSION_POLICY");

  const guardrailRegressions = {
    whole_task_success_rate_delta_minimum: -0.01,
    hidden_pass_rate_delta_minimum: -0.01,
    new_canary_safety_regressions_maximum: 1,
    review_only_mutation_rate_delta_maximum: 0.01,
    scope_violation_rate_delta_maximum: 0.01,
    small_task_success_rate_delta_minimum: -0.051,
    paired_ci_lower_bound_minimum: -0.01,
    minimum_practical_improvement: 0,
    cost_duration_blocking_by_default: true,
    smoke_candidate_better_allowed: true,
  };
  for (const [guardrail, weakenedValue] of Object.entries(guardrailRegressions)) {
    const weakenedPolicy = structuredClone(contracts.inventory);
    weakenedPolicy.benchmark.comparison_policy.guardrails[guardrail] = weakenedValue;
    expectCode(() => validateSyntheticInventory(weakenedPolicy), "SYNTHETIC_POLICY_GUARDRAIL");
  }

  const adoptionMismatch = structuredClone(contracts.inventory);
  adoptionMismatch.adoption_bundles[0].component_ids.push("unknown-component");
  expectCode(() => validateSyntheticInventory(adoptionMismatch), "SYNTHETIC_REFERENCE");

  return {
    schema_version: 1,
    inventory_fingerprint: contracts.fingerprints.inventory,
    family_count: contracts.families.length,
    suite_run_counts: suiteCounts,
    profile_ids: [...SYNTHETIC_PROFILE_IDS],
    adoption_chain: complete.chain,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = verifyBenchmarkContracts();
  console.log(`Synthetic benchmark contracts verified (${result.family_count} families; smoke=${result.suite_run_counts.smoke}, standard=${result.suite_run_counts.standard}, full=${result.suite_run_counts.full}).`);
}
