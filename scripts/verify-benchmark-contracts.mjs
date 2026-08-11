import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  BOOTSTRAP_RESAMPLES,
  MINIMUM_COMPLETE_FAMILIES,
  MINIMUM_COMPLETE_PAIRS,
  MINIMUM_NONZERO_FAMILY_DELTAS,
  SYNTHETIC_ANALYSIS_SEED,
  SYNTHETIC_ANTI_CHEATING_CASES,
  SYNTHETIC_FAMILY_IDS,
  SYNTHETIC_PARSER_FIXTURES,
  SYNTHETIC_PROFILE_IDS,
  assertAdoptionBundleEntryPaths,
  assertPortableContractPath,
  loadSyntheticContracts,
  resolveRepositoryEntry,
  resolveAdoptionBundle,
  validateSyntheticInventory,
} from "../lib/benchmark/contracts.mjs";
import { assertSafeId } from "../lib/feedback/contracts.mjs";
import { parsePromptFrontmatter } from "../lib/quality/prompt-inventory.mjs";
import {
  DEFAULT_MODEL_FREE_CHECKS,
  validateSyntheticModelFreeSelfTestReport,
} from "../lib/benchmark/self-test.mjs";
import { validateSyntheticReplayReport } from "../lib/benchmark/replay.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_FINGERPRINT = `sha256:${"0".repeat(64)}`;

function expectCode(callback, code) {
  assert.throws(callback, (error) => error?.code === code, `expected ${code}`);
}

function sameSchemaValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function matchesSchemaFragment(schema, value) {
  if (schema === true) return true;
  if (schema === false || schema === null || typeof schema !== "object") return false;
  if (Object.hasOwn(schema, "const") && !sameSchemaValue(value, schema.const)) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => sameSchemaValue(value, entry))) {
    return false;
  }
  if (Array.isArray(schema.required)) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    if (schema.required.some((key) => !Object.hasOwn(value, key))) return false;
  }
  if (schema.properties !== undefined) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    for (const [key, nestedSchema] of Object.entries(schema.properties)) {
      if (Object.hasOwn(value, key) && !matchesSchemaFragment(nestedSchema, value[key])) {
        return false;
      }
    }
  }
  if (Array.isArray(schema.allOf)
      && !schema.allOf.every((entry) => matchesSchemaFragment(entry, value))) {
    return false;
  }
  if (Array.isArray(schema.anyOf)
      && !schema.anyOf.some((entry) => matchesSchemaFragment(entry, value))) {
    return false;
  }
  if (schema.if !== undefined) {
    const selected = matchesSchemaFragment(schema.if, value) ? schema.then : schema.else;
    if (selected !== undefined && !matchesSchemaFragment(selected, value)) return false;
  }
  if (schema.items !== undefined) {
    if (!Array.isArray(value)) return false;
    if (!value.every((entry) => matchesSchemaFragment(schema.items, entry))) return false;
  }
  if (schema.contains !== undefined) {
    if (!Array.isArray(value)) return false;
    const matches = value.filter((entry) => matchesSchemaFragment(schema.contains, entry)).length;
    if (matches < (schema.minContains ?? 1)) return false;
    if (schema.maxContains !== undefined && matches > schema.maxContains) return false;
  }
  if (schema.not !== undefined && matchesSchemaFragment(schema.not, value)) return false;
  return true;
}

function matchesRootCrossFieldSemantics(schema, document) {
  return (schema.allOf ?? []).every((entry) => matchesSchemaFragment(entry, document));
}

function selfTestSchemaFixture() {
  return {
    schema_version: 2,
    report_kind: "synthetic-model-free-self-test",
    run_id: "schema-self-test",
    created_at: "2026-01-01T00:00:00.000Z",
    evidence_class: "model-free-fixture",
    model_execution: false,
    complete: true,
    check_count: DEFAULT_MODEL_FREE_CHECKS.length,
    checks: DEFAULT_MODEL_FREE_CHECKS.map((definition) => ({
      ...definition,
      status: "passed",
      exit_code: 0,
      timed_out: false,
      duration_ms: 1,
      stdout_bytes: 0,
      stderr_bytes: 0,
      stdout_fingerprint: FIXTURE_FINGERPRINT,
      stderr_fingerprint: FIXTURE_FINGERPRINT,
    })),
    residual_caveats: [
      "model-free-only",
      "no-model-quality-claim",
    ],
  };
}

function replaySchemaFixture({
  modelExecutionConfirmed = true,
  adapterCompletedCorrectly = true,
  evidenceComplete = true,
  wholeTaskSuccess = true,
  executionStatus = "completed",
  terminationReason = "verified",
  reason = null,
} = {}) {
  return {
    schema_version: 1,
    report_kind: "synthetic-profile-replay",
    run_id: "schema-replay",
    created_at: "2026-01-01T00:00:00.000Z",
    evidence_class: "model-backed-attempt",
    model_execution_confirmed: modelExecutionConfirmed,
    family_id: "function-boundaries",
    seed: "schema-seed",
    repetition: 1,
    instance_fingerprint: FIXTURE_FINGERPRINT,
    profile_id: "plain",
    model_binding_fingerprint: FIXTURE_FINGERPRINT,
    execution_status: executionStatus,
    termination_reason: terminationReason,
    reason,
    adapter_completed_correctly: adapterCompletedCorrectly,
    evidence_complete: evidenceComplete,
    whole_task_success: wholeTaskSuccess,
    result_fingerprint: FIXTURE_FINGERPRINT,
    residual_caveats: [
      "single-profile-replay-no-comparison",
    ],
  };
}

function verifyEvidenceSchemaRuntimeParity(selfTestSchema, replaySchema) {
  const allPassed = selfTestSchemaFixture();
  assert.equal(matchesRootCrossFieldSemantics(selfTestSchema, allPassed), true);
  assert.equal(validateSyntheticModelFreeSelfTestReport(allPassed), allPassed);

  const failed = structuredClone(allPassed);
  failed.complete = false;
  failed.checks[0].status = "failed";
  failed.checks[0].exit_code = 1;
  assert.equal(matchesRootCrossFieldSemantics(selfTestSchema, failed), true);
  assert.equal(validateSyntheticModelFreeSelfTestReport(failed), failed);

  const falseComplete = structuredClone(failed);
  falseComplete.complete = true;
  assert.equal(matchesRootCrossFieldSemantics(selfTestSchema, falseComplete), false);
  expectCode(
    () => validateSyntheticModelFreeSelfTestReport(falseComplete),
    "SYNTHETIC_SELF_TEST_COMPLETE",
  );

  const falseIncomplete = structuredClone(allPassed);
  falseIncomplete.complete = false;
  assert.equal(matchesRootCrossFieldSemantics(selfTestSchema, falseIncomplete), false);
  expectCode(
    () => validateSyntheticModelFreeSelfTestReport(falseIncomplete),
    "SYNTHETIC_SELF_TEST_COMPLETE",
  );

  const completedReplay = replaySchemaFixture();
  assert.equal(matchesRootCrossFieldSemantics(replaySchema, completedReplay), true);
  assert.equal(validateSyntheticReplayReport(completedReplay), completedReplay);

  const failedReplay = replaySchemaFixture({
    modelExecutionConfirmed: false,
    adapterCompletedCorrectly: false,
    evidenceComplete: false,
    wholeTaskSuccess: false,
    executionStatus: "failed",
    terminationReason: "verification_failed",
    reason: "fixture_failure",
  });
  assert.equal(matchesRootCrossFieldSemantics(replaySchema, failedReplay), true);
  assert.equal(validateSyntheticReplayReport(failedReplay), failedReplay);

  for (const [modelExecutionConfirmed, adapterCompletedCorrectly] of [
    [true, false],
    [false, true],
  ]) {
    const contradictoryReplay = replaySchemaFixture({
      modelExecutionConfirmed,
      adapterCompletedCorrectly,
      evidenceComplete: false,
      wholeTaskSuccess: false,
      executionStatus: "failed",
      terminationReason: "verification_failed",
      reason: "fixture_failure",
    });
    assert.equal(
      matchesRootCrossFieldSemantics(replaySchema, contradictoryReplay),
      false,
    );
    expectCode(
      () => validateSyntheticReplayReport(contradictoryReplay),
      "SYNTHETIC_REPLAY_EVIDENCE",
    );
  }
}

function verifyReplayV2CompleteNegativeEvidenceSchema(replaySchema) {
  const completeNegative = replaySchemaFixture({
    modelExecutionConfirmed: true,
    adapterCompletedCorrectly: false,
    evidenceComplete: true,
    wholeTaskSuccess: false,
    executionStatus: "failed",
    terminationReason: "verification_failed",
    reason: "opencode_missing_final",
  });
  completeNegative.schema_version = 2;
  assert.equal(matchesRootCrossFieldSemantics(replaySchema, completeNegative), true);

  const unconfirmed = structuredClone(completeNegative);
  unconfirmed.model_execution_confirmed = false;
  assert.equal(matchesRootCrossFieldSemantics(replaySchema, unconfirmed), false);

  const unsupportedConfirmation = structuredClone(completeNegative);
  unsupportedConfirmation.evidence_complete = false;
  assert.equal(matchesRootCrossFieldSemantics(replaySchema, unsupportedConfirmation), false);

  const incompleteStatus = structuredClone(completeNegative);
  incompleteStatus.execution_status = "incomplete";
  assert.equal(matchesRootCrossFieldSemantics(replaySchema, incompleteStatus), false);
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

function materializeExecutableBundleFixture(root, bundle, {
  prefix,
  imports,
  commands = [],
  missingDependency = null,
  missingDependencyCommands = [],
} = {}) {
  const fixtureRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), prefix));
  const runNode = (
    argv,
    label,
    expectedStatus = 0,
    expectedStderrIncludes = null,
  ) => {
    const result = spawnSync(process.execPath, argv, {
      cwd: fixtureRoot,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      shell: false,
    });
    assert.equal(result.error, undefined, `${label} failed to spawn: ${result.error?.message}`);
    assert.equal(
      result.status,
      expectedStatus,
      `${label} exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
    if (expectedStderrIncludes !== null) {
      assert(
        result.stderr.includes(expectedStderrIncludes),
        `${label} stderr did not include ${expectedStderrIncludes}\nstderr:\n${result.stderr}`,
      );
    }
  };
  try {
    const orderedEntryPaths = [...bundle.entry_paths].sort((left, right) => (
      left.split("/").length - right.split("/").length
        || left.localeCompare(right)
    ));
    for (const entryPath of orderedEntryPaths) {
      const source = resolveRepositoryEntry(root, entryPath);
      const target = path.join(fixtureRoot, ...entryPath.split("/"));
      if (fs.existsSync(target)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.cpSync(source, target, { recursive: true, errorOnExist: false, force: false });
    }
    for (const entryPath of bundle.entry_paths) {
      assert(
        fs.existsSync(path.join(fixtureRoot, ...entryPath.split("/"))),
        `${bundle.bundle_id} materialization omitted ${entryPath}`,
      );
    }
    const probePath = path.join(fixtureRoot, "bundle-import-probe.mjs");
    fs.writeFileSync(
      probePath,
      `for (const specifier of ${JSON.stringify(imports)}) await import(specifier);\n`,
      "utf8",
    );
    runNode([probePath], `${bundle.bundle_id} import closure`);
    for (const command of commands) {
      const definition = Array.isArray(command) ? { argv: command } : command;
      runNode(
        definition.argv,
        definition.label ?? `${bundle.bundle_id} executable command`,
        definition.expectedStatus ?? 0,
        definition.expectedStderrIncludes ?? null,
      );
    }
    if (missingDependency !== null) {
      const dependencyPath = path.join(fixtureRoot, ...missingDependency.split("/"));
      const quarantinedPath = `${dependencyPath}.missing`;
      fs.renameSync(dependencyPath, quarantinedPath);
      try {
        runNode([probePath], `${bundle.bundle_id} missing-dependency negative fixture`, 1);
        for (const command of missingDependencyCommands) {
          runNode(
            command.argv,
            command.label,
            command.expectedStatus,
            command.expectedStderrIncludes,
          );
        }
      } finally {
        fs.renameSync(quarantinedPath, dependencyPath);
      }
    }
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
  for (const field of ["fingerprints", "metrics", "operational_trace_id"]) {
    assert(required.has(field), `successful runs must require ${field}`);
  }
  const properties = successRule.then.properties;
  assert.equal(Object.hasOwn(properties, "agent_reported_success"), false,
    "whole_task_success must be based on objective evidence rather than the agent self-report");
  for (const field of ["adapter", "initial_workspace", "final_workspace", "trace"]) {
    assert.equal(properties.fingerprints.properties[field].$ref, "#/$defs/fingerprint");
  }
  for (const field of [
    "total_tool_call_count",
    "subagent_call_count",
    "model_turn_count",
    "continuation_turn_count",
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
      success.properties.agent_reported_success = { const: true };
    },
    (candidate) => {
      candidate.$defs.runResult.allOf[0].then.properties.fingerprints.properties.adapter.$ref = "#/$defs/nullableFingerprint";
    },
    (candidate) => {
      candidate.$defs.runResult.allOf[0].then.properties.metrics.properties.total_tool_call_count.$ref = "#/$defs/nullableCount";
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

function verifyPortableContractPaths() {
  assert.equal(
    assertPortableContractPath(".github/workflows/verify.yml"),
    ".github/workflows/verify.yml",
  );
  assert.equal(
    assertPortableContractPath(".opencode/plugins/engineering-dossier.mjs"),
    ".opencode/plugins/engineering-dossier.mjs",
  );
  assert.throws(() => assertPortableContractPath(".git/config"));
  assert.throws(() => assertPortableContractPath("nested/.github/workflow.yml"));
}

function verifyBenchmarkEvaluationContractsLoaded({ root, contracts }) {
  assert.deepEqual(contracts.families.map((entry) => entry.id), SYNTHETIC_FAMILY_IDS);
  assert.deepEqual(contracts.inventory.profiles.map((entry) => entry.id), SYNTHETIC_PROFILE_IDS);
  assert.deepEqual(contracts.inventory.benchmark.anti_cheating_cases, SYNTHETIC_ANTI_CHEATING_CASES);
  assert.deepEqual(contracts.inventory.benchmark.parser_fixtures, SYNTHETIC_PARSER_FIXTURES);
  assert.equal(contracts.comparison_policy.minimum_complete_pairs, MINIMUM_COMPLETE_PAIRS);
  assert.equal(contracts.comparison_policy.minimum_complete_families, MINIMUM_COMPLETE_FAMILIES);
  assert.equal(contracts.comparison_policy.minimum_nonzero_family_deltas, MINIMUM_NONZERO_FAMILY_DELTAS);
  assert.equal(contracts.comparison_policy.bootstrap_resamples, BOOTSTRAP_RESAMPLES);
  assert.equal(contracts.comparison_policy.analysis_seed, SYNTHETIC_ANALYSIS_SEED);
  const legacyRunReportSchema = contracts.schemas["benchmarks/synthetic/schemas/run-report.v3.schema.json"];
  assert.equal(legacyRunReportSchema.properties.schema_version.const, 3);
  const currentRunReportSchema = contracts.schemas["benchmarks/synthetic/schemas/run-report.v5.schema.json"];
  assert.equal(currentRunReportSchema.$id, "https://opencode-harness.invalid/schemas/synthetic-run-report-v5");
  assert.equal(currentRunReportSchema.properties.schema_version.const, 5);
  assert.equal(
    currentRunReportSchema.$defs.pair.allOf[1].properties.candidate.$ref,
    "#/$defs/runResult",
  );
  const currentTerminationRule = currentRunReportSchema.$defs.runResult.allOf.find((entry) => (
    entry.if?.properties?.termination_acceptable?.const === true
  ));
  assert(currentTerminationRule, "current run report schema must constrain accepted termination");
  for (const [field, expected] of [
    ["claimed_completion", true],
    ["explicit_block", false],
    ["explicit_failure", false],
  ]) {
    assert.equal(currentTerminationRule.then.properties[field].const, expected);
  }
  const currentSuccessRule = currentRunReportSchema.$defs.runResult.allOf.find((entry) => (
    entry.if?.properties?.whole_task_success?.const === true
  ));
  assert(currentSuccessRule, "current run report schema must constrain whole-task success");
  assert.equal(currentSuccessRule.then.properties.claimed_completion.const, true);
  assert.equal(currentSuccessRule.then.properties.explicit_block.const, false);
  assert.equal(currentSuccessRule.then.properties.explicit_failure.const, false);
  const runReportSchema = contracts.schemas["benchmarks/synthetic/schemas/run-report.v4.schema.json"];
  assert.equal(runReportSchema.$id, "https://opencode-harness.invalid/schemas/synthetic-run-report-v4");
  const shardReportSchema = contracts.schemas["benchmarks/synthetic/schemas/shard-report.v1.schema.json"];
  assert.equal(shardReportSchema.$id, "https://opencode-harness.invalid/schemas/synthetic-shard-report-v1");
  assert.equal(shardReportSchema.additionalProperties, false);
  assert.equal(shardReportSchema.properties.shard_marker.const, "synthetic-paired-family-shard-v1");
  assert.equal(shardReportSchema.properties.schedule_projection.maxItems, 10);
  assert.equal(runReportSchema.properties.schema_version.const, 4);
  assert(runReportSchema.$defs.execution.required.includes("executable_fingerprint"));
  assert.equal(
    runReportSchema.$defs.execution.properties.executable_fingerprint.$ref,
    "#/$defs/nullableFingerprint",
  );
  assert(runReportSchema.$defs.pairBinding.required.includes("executable_fingerprint"));
  assert.equal(
    runReportSchema.$defs.pairBinding.properties.executable_fingerprint.$ref,
    "#/$defs/nullableFingerprint",
  );
  assert.equal(runReportSchema.properties.report_kind.const, "synthetic-paired-run");
  assert.equal(runReportSchema.properties.pairs.maxItems, 240);
  assert.equal(Object.hasOwn(runReportSchema.properties, "statistics"), false);
  assert.equal(Object.hasOwn(runReportSchema.properties, "verdict"), false);
  assert(runReportSchema.$defs.pairBinding.required.includes("task_scope_fingerprint"));
  assert(runReportSchema.$defs.runResult.required.includes("audit_evidence"));
  assert(runReportSchema.$defs.runResult.required.includes("claimed_completion"));
  assert(runReportSchema.$defs.runResult.required.includes("false_block"));
  const completionEquivalence = runReportSchema.$defs.runResult.allOf.find((entry) => (
    entry.if?.properties?.adapter_evidence_observed?.const === true
      && entry.if?.properties?.execution_status?.const === "completed"
      && entry.if?.properties?.teardown?.properties?.passed?.const === true
      && entry.then?.properties?.claimed_completion?.const === true
  ));
  assert(completionEquivalence, "run report schema must derive claimed completion from settled execution evidence");
  const completionEvidence = runReportSchema.$defs.runResult.allOf.find((entry) => (
    entry.if?.properties?.claimed_completion?.const === true
      && entry.then?.properties?.teardown?.properties?.passed?.const === true
  ));
  assert(completionEvidence, "run report schema must reject completion without verified teardown");
  assert.equal(runReportSchema.$defs.auditEvidence.additionalProperties, false);
  const comparisonReportSchema = contracts.schemas["benchmarks/synthetic/schemas/comparison-report.v2.schema.json"];
  assert.equal(comparisonReportSchema.$id, "https://opencode-harness.invalid/schemas/synthetic-comparison-report-v2");
  assert.equal(comparisonReportSchema.properties.schema_version.const, 2);
  assert.equal(comparisonReportSchema.properties.report_kind.const, "synthetic-paired-comparison");
  assert.deepEqual(comparisonReportSchema.$defs.verdict.properties.status.enum, contracts.comparison_policy.verdict_order);
  assert.equal(comparisonReportSchema.$defs.bootstrap.properties.resamples.const, BOOTSTRAP_RESAMPLES);
  assert.equal(comparisonReportSchema.$defs.bootstrap.properties.method.const, contracts.comparison_policy.bootstrap_method);
  assert.equal(comparisonReportSchema.$defs.familySignFlip.properties.method.const, contracts.comparison_policy.family_sign_flip_method);
  assert.equal(comparisonReportSchema.$defs.diagnostics.additionalProperties, false);
  assert.equal(comparisonReportSchema.properties.count_metrics.minItems, 12);
  assert.equal(comparisonReportSchema.properties.count_metrics.maxItems, 12);
  const selfTestReportSchema =
    contracts.schemas["benchmarks/synthetic/schemas/model-free-self-test-report.v2.schema.json"];
  const legacySelfTestReportSchema =
    contracts.schemas["benchmarks/synthetic/schemas/model-free-self-test-report.v1.schema.json"];
  assert.equal(
    selfTestReportSchema.$id,
    "https://opencode-harness.invalid/schemas/synthetic-model-free-self-test-report-v2",
  );
  assert.equal(selfTestReportSchema.properties.schema_version.const, 2);
  assert.equal(selfTestReportSchema.properties.report_kind.const, "synthetic-model-free-self-test");
  assert.equal(selfTestReportSchema.properties.model_execution.const, false);
  assert.equal(
    selfTestReportSchema.properties.check_count.const,
    DEFAULT_MODEL_FREE_CHECKS.length,
  );
  assert.equal(
    selfTestReportSchema.properties.checks.prefixItems.length,
    DEFAULT_MODEL_FREE_CHECKS.length,
  );
  for (const [index, definition] of DEFAULT_MODEL_FREE_CHECKS.entries()) {
    const binding =
      selfTestReportSchema.properties.checks.prefixItems[index].allOf[1].properties;
    assert.equal(binding.id.const, definition.id);
    assert.equal(binding.script.const, definition.script);
  }
  assert.equal(legacySelfTestReportSchema.properties.schema_version.const, 1);
  assert.equal(legacySelfTestReportSchema.properties.check_count.const, 10);
  assert.equal(legacySelfTestReportSchema.properties.checks.prefixItems.length, 10);
  const replayReportSchema =
    contracts.schemas["benchmarks/synthetic/schemas/replay-report.v1.schema.json"];
  assert.equal(
    replayReportSchema.$id,
    "https://opencode-harness.invalid/schemas/synthetic-replay-report-v1",
  );
  assert.equal(replayReportSchema.properties.report_kind.const, "synthetic-profile-replay");
  assert.equal(Object.hasOwn(replayReportSchema.properties, "model_execution"), false);
  assert.equal(
    replayReportSchema.properties.model_execution_confirmed.type,
    "boolean",
  );
  verifyEvidenceSchemaRuntimeParity(selfTestReportSchema, replayReportSchema);
  const replayReportV2Schema =
    contracts.schemas["benchmarks/synthetic/schemas/replay-report.v2.schema.json"];
  assert.equal(
    replayReportV2Schema.$id,
    "https://opencode-harness.invalid/schemas/synthetic-replay-report-v2",
  );
  assert.equal(replayReportV2Schema.properties.schema_version.const, 2);
  assert.equal(
    replayReportV2Schema.properties.attempt.properties.binding.$ref,
    "https://opencode-harness.invalid/schemas/synthetic-run-report-v3#/$defs/pairBinding",
  );
  assert.equal(
    replayReportV2Schema.properties.attempt.properties.result.$ref,
    "https://opencode-harness.invalid/schemas/synthetic-run-report-v3#/$defs/runResult",
  );
  verifyReplayV2CompleteNegativeEvidenceSchema(replayReportV2Schema);
  const replayReportV3Schema =
    contracts.schemas["benchmarks/synthetic/schemas/replay-report.v3.schema.json"];
  assert.equal(
    replayReportV3Schema.$id,
    "https://opencode-harness.invalid/schemas/synthetic-replay-report-v3",
  );
  assert.equal(replayReportV3Schema.properties.schema_version.const, 3);
  assert.equal(
    replayReportV3Schema.properties.attempt.properties.binding.$ref,
    "https://opencode-harness.invalid/schemas/synthetic-run-report-v4#/$defs/pairBinding",
  );
  assert.equal(
    replayReportV3Schema.properties.attempt.properties.result.$ref,
    "https://opencode-harness.invalid/schemas/synthetic-run-report-v4#/$defs/runResult",
  );
  const replayReportV4Schema =
    contracts.schemas["benchmarks/synthetic/schemas/replay-report.v4.schema.json"];
  assert.equal(
    replayReportV4Schema.$id,
    "https://opencode-harness.invalid/schemas/synthetic-replay-report-v4",
  );
  assert.equal(replayReportV4Schema.properties.schema_version.const, 4);
  assert.equal(
    replayReportV4Schema.properties.attempt.properties.binding.$ref,
    "https://opencode-harness.invalid/schemas/synthetic-run-report-v5#/$defs/pairBinding",
  );
  assert.equal(
    replayReportV4Schema.properties.attempt.properties.result.$ref,
    "https://opencode-harness.invalid/schemas/synthetic-run-report-v5#/$defs/runResult",
  );
  for (const field of ["explicit_block", "explicit_failure"]) {
    assert(replayReportV4Schema.required.includes(field));
  }
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
  assert.equal(runReportSchema.$defs.runResult.allOf.length, 7);
  verifyWholeTaskSuccessEvidenceSchema(runReportSchema);
  verifyWholeTaskSuccessEvidenceNegativeFixtures(runReportSchema);

  const suiteCounts = Object.fromEntries(contracts.suites.map((suite) => [suite.id, suite.declared_run_count]));
  assert.deepEqual(suiteCounts, { micro: 8, smoke: 16, standard: 144, full: 320 });
  for (const suite of contracts.suites) {
    assert.deepEqual(
      suite.profile_ids,
      SYNTHETIC_PROFILE_IDS,
    );
  }

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
  assert(evaluation.component_ids.includes("benchmark-commands"));
  assert(evaluation.entry_paths.includes("package.json"));
  assert(evaluation.entry_paths.includes("scripts/benchmark-synthetic.mjs"));
  assert(evaluation.entry_paths.includes("scripts/verify-benchmark-cli.mjs"));
  assert(evaluation.entry_paths.includes("scripts/verify-benchmark-runner.mjs"));
  assert(evaluation.entry_paths.includes("scripts/verify-benchmark-model-free.mjs"));
  assert(evaluation.entry_paths.includes("scripts/verify-benchmark-model-free-contract.mjs"));
  assert(evaluation.entry_paths.includes(".github/workflows/synthetic-benchmark.yml"));
  assert(complete.entry_paths.some((entry) => entry === "scripts"));
  assert(quality.component_ids.includes("computational-mutation-gate"));
  assert(!core.component_ids.includes("computational-mutation-gate"));

  const profileOnly = contracts.inventory.profiles.find((entry) => entry.id === "profile-only");
  const instrumented = contracts.inventory.profiles.find((entry) => entry.id === "instrumented");
  assert.equal(instrumented.primary_role_id, profileOnly.primary_role_id);
  assert.deepEqual(instrumented.role_ids, profileOnly.role_ids);
  const confoundedInstrumentedProfile = structuredClone(contracts.inventory);
  const confoundedProfile = confoundedInstrumentedProfile.profiles.find((entry) => entry.id === "instrumented");
  confoundedProfile.primary_role_id = "orchestrator-deep";
  confoundedProfile.role_ids[0] = "orchestrator-deep";
  expectCode(
    () => validateSyntheticInventory(confoundedInstrumentedProfile),
    "SYNTHETIC_INSTRUMENTED_PROFILE",
  );

  verifyConfiguredRolePermissions(root, contracts.inventory.roles);
  const readPermissionDrift = structuredClone(contracts.inventory.roles);
  readPermissionDrift.find((entry) => entry.id === "orchestrator").permissions.read = "deny";
  assert.throws(() => verifyConfiguredRolePermissions(root, readPermissionDrift), /read permission drifted/);
  const testPermissionDrift = structuredClone(contracts.inventory.roles);
  testPermissionDrift.find((entry) => entry.id === "general").permissions.test = "deny";
  assert.throws(() => verifyConfiguredRolePermissions(root, testPermissionDrift), /test permission drifted/);
  verifyPhysicalConfinementNegativeFixture();

  const withUnknownField = structuredClone(contracts.inventory);
  withUnknownField.unknown = true;
  expectCode(() => validateSyntheticInventory(withUnknownField), "CONTRACT_UNKNOWN_FIELD");

  const missingFamily = structuredClone(contracts.inventory);
  missingFamily.benchmark.families.pop();
  expectCode(() => validateSyntheticInventory(missingFamily), "SYNTHETIC_FAMILY_EXACT_SET");

  const wrongSuiteCount = structuredClone(contracts.inventory);
  wrongSuiteCount.benchmark.suites[0].declared_run_count = 7;
  expectCode(() => validateSyntheticInventory(wrongSuiteCount), "SYNTHETIC_SUITE_CARDINALITY");

  const wrongSchemaVersion = structuredClone(contracts.inventory);
  wrongSchemaVersion.schema_version = 1;
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

function verifyExecutableBundleClosures(root, contracts) {
  const core = resolveAdoptionBundle(contracts.inventory, "core");
  const quality = resolveAdoptionBundle(contracts.inventory, "quality");
  const evaluation = resolveAdoptionBundle(contracts.inventory, "evaluation");
  materializeCoreFixture(root, core);
  materializeExecutableBundleFixture(root, quality, {
    prefix: "synthetic-quality-bundle-",
    imports: ["./lib/quality/quality-plugin.mjs"],
    missingDependency: "lib/feedback/contracts.mjs",
  });
  materializeExecutableBundleFixture(root, evaluation, {
    prefix: "synthetic-evaluation-bundle-",
    imports: [
      "./lib/benchmark/cli.mjs",
      "./scripts/verify-benchmark-adapter.mjs",
      "./scripts/verify-benchmark-ci.mjs",
      "./scripts/verify-benchmark-cli.mjs",
      "./scripts/verify-benchmark-comparison-reporting.mjs",
      "./scripts/verify-benchmark-contracts.mjs",
      "./scripts/verify-benchmark-evaluation-contracts.mjs",
      "./scripts/verify-benchmark-isolation.mjs",
      "./scripts/verify-benchmark-renderer.mjs",
      "./scripts/verify-benchmark-reporting.mjs",
      "./scripts/verify-benchmark-runner.mjs",
      "./scripts/verify-benchmark-statistics.mjs",
    ],
    commands: [
      ["scripts/benchmark-synthetic-validate.mjs"],
      ["scripts/verify-benchmark-evaluation-contracts.mjs"],
      {
        argv: ["scripts/verify-benchmark-contracts.mjs"],
        label: "full verifier rejects evaluation-only bundle",
        expectedStatus: 1,
        expectedStderrIncludes: "SYNTHETIC_MISSING_FILE",
      },
      {
        argv: [
          "scripts/verify-benchmark-contracts.mjs",
          "--scope",
          "evaluation",
        ],
        label: "full verifier cannot downgrade through argv",
        expectedStatus: 1,
        expectedStderrIncludes: "SYNTHETIC_MISSING_FILE",
      },
    ],
    missingDependency: "scripts/verify-benchmark-runner.mjs",
    missingDependencyCommands: [
      {
        argv: ["scripts/benchmark-synthetic-validate.mjs"],
        label: "production loader rejects a missing evaluation dependency",
        expectedStatus: 1,
        expectedStderrIncludes: "SYNTHETIC_MISSING_FILE",
      },
      {
        argv: ["scripts/verify-benchmark-evaluation-contracts.mjs"],
        label: "evaluation verifier rejects a missing evaluation dependency",
        expectedStatus: 1,
        expectedStderrIncludes: "SYNTHETIC_MISSING_FILE",
      },
    ],
  });
}

export function verifyBenchmarkEvaluationContracts({ root = defaultRoot } = {}) {
  verifyPortableContractPaths();
  const contracts = loadSyntheticContracts(root);
  return verifyBenchmarkEvaluationContractsLoaded({ root, contracts });
}

export function verifyBenchmarkContracts({ root = defaultRoot } = {}) {
  verifyPortableContractPaths();
  const contracts = loadSyntheticContracts(root);
  assertAdoptionBundleEntryPaths(root, contracts.inventory, "complete");
  const result = verifyBenchmarkEvaluationContractsLoaded({ root, contracts });
  verifyExecutableBundleClosures(root, contracts);
  return result;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = verifyBenchmarkContracts();
  console.log(`Synthetic benchmark contracts verified (${result.family_count} families; micro=${result.suite_run_counts.micro}, smoke=${result.suite_run_counts.smoke}, standard=${result.suite_run_counts.standard}, full=${result.suite_run_counts.full}).`);
}
