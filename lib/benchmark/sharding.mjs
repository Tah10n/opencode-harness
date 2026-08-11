import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

import {
  ContractError,
  assertSafeId,
  canonicalJson,
  fingerprint,
} from "../feedback/contracts.mjs";
import {
  assertConfinedExistingPath,
  atomicWriteImmutable,
  atomicWriteJson,
  ensureConfinedDirectory,
  resolveInside,
  withExclusiveLock,
} from "../feedback/files.mjs";
import {
  assertPortableContractPath,
  loadSyntheticContracts,
} from "./contracts.mjs";
import {
  cleanupSyntheticProfile,
  materializeSyntheticProfile,
} from "./profiles.mjs";
import {
  DEFAULT_SYNTHETIC_ARTIFACT_ROOT,
  publishSyntheticRunArtifacts,
  validateSyntheticRunReport,
  validateSyntheticRunReportSourceBinding,
} from "./reporting.mjs";
import {
  SYNTHETIC_OPENCODE_ADAPTER_VERSION,
  syntheticOpenCodeAdapterFingerprint,
} from "./opencode-adapter.mjs";
import {
  loadSyntheticTemplateSet,
} from "./renderer.mjs";
import {
  SYNTHETIC_RUN_REPORT_VERSION,
  SYNTHETIC_SHARD_REPORT_VERSION,
  runSyntheticPairedShard,
  syntheticEffectivePublicInputFingerprint,
} from "./runner.mjs";
import {
  buildSyntheticSuitePlan,
  projectSyntheticSuitePlanFamily,
  syntheticPairIdentity,
} from "./suite-plan.mjs";
import {
  SYNTHETIC_MODEL_JOB_TIMEOUT_MINUTES,
  syntheticMergeJobBudget,
  syntheticModelJobBudget,
} from "./workflow-budget.mjs";

export const SYNTHETIC_SHARD_ARTIFACT_VERSION = 1;
export const SYNTHETIC_PREPARE_VERSION = 1;
export const DEFAULT_SYNTHETIC_SHARD_ROOT = `${DEFAULT_SYNTHETIC_ARTIFACT_ROOT}/shards`;

const FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;
const MAX_SHARD_BYTES = 16 * 1024 * 1024;
const FORBIDDEN_SHARD_KEYS = new Set([
  "credential", "credentials", "secret", "secrets", "token", "tokens",
  "stdout", "stderr", "prompt", "prompts", "completion", "completions",
  "session", "session_id",
]);

function fail(code, message) {
  throw new ContractError(code, message);
}

function expect(condition, code, message) {
  if (!condition) fail(code, message);
}

function exact(value, keys, label) {
  expect(value !== null && typeof value === "object" && !Array.isArray(value), "SYNTHETIC_SHARD_SHAPE", `${label} must be an object`);
  expect(
    canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort()),
    "SYNTHETIC_SHARD_SHAPE",
    `${label} keys are invalid`,
  );
}

function timestamp(value, label) {
  expect(
    typeof value === "string" && value.length <= 40 && new Date(value).toISOString() === value,
    "SYNTHETIC_SHARD_TIMESTAMP",
    `${label} must be a canonical timestamp`,
  );
}

function sha256Bytes(contents) {
  return `sha256:${createHash("sha256").update(contents, "utf8").digest("hex")}`;
}

function canonicalShardPath(report, relativeRoot = DEFAULT_SYNTHETIC_SHARD_ROOT) {
  return `${relativeRoot}/${report.parent_generation_id}/${report.family_id}/${report.shard_id}`;
}

function assertNoHostPathsOrCredentials(value, label = "shard", seen = new Set()) {
  if (value === null || typeof value === "boolean" || typeof value === "number") return;
  if (typeof value === "string") {
    expect(!path.isAbsolute(value), "SYNTHETIC_SHARD_PRIVACY", `${label} contains an absolute host path`);
    expect(!/(?:bearer\s+[a-z0-9._-]{12,}|\bsk-[a-z0-9_-]{12,})/iu.test(value), "SYNTHETIC_SHARD_PRIVACY", `${label} contains credential-like material`);
    return;
  }
  expect(typeof value === "object" && !seen.has(value), "SYNTHETIC_SHARD_PRIVACY", `${label} contains an unsupported value`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoHostPathsOrCredentials(entry, `${label}[${index}]`, seen));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    expect(!FORBIDDEN_SHARD_KEYS.has(key.toLowerCase()), "SYNTHETIC_SHARD_PRIVACY", `${label} contains forbidden key ${key}`);
    assertNoHostPathsOrCredentials(nested, `${label}.${key}`, seen);
  }
}

function syntheticStructuralShardReport(report) {
  return {
    schema_version: SYNTHETIC_RUN_REPORT_VERSION,
    report_kind: "synthetic-paired-run",
    run_id: report.shard_id,
    generation_id: report.parent_generation_id,
    created_at: report.created_at,
    suite: {
      ...report.suite,
      declared_pair_count: report.expected_pair_ids.length,
    },
    execution: report.execution,
    profiles: report.profiles,
    complete: report.complete,
    incomplete_reasons: report.incomplete_reasons,
    pair_count: report.pair_count,
    pairs: report.pairs,
    residual_caveats: report.residual_caveats,
  };
}

export function validateSyntheticShardReport(report) {
  exact(report, [
    "schema_version", "report_kind", "shard_marker", "shard_id", "parent_generation_id",
    "created_at", "suite", "family_id", "model_binding_fingerprint", "adapter_fingerprint",
    "execution", "profiles", "schedule_projection", "expected_pair_ids", "actual_pair_ids",
    "complete", "incomplete_reasons", "pair_count", "pairs", "residual_caveats",
  ], "shard report");
  expect(report.schema_version === SYNTHETIC_SHARD_REPORT_VERSION, "SYNTHETIC_SHARD_VERSION", "shard report version is unsupported");
  expect(report.report_kind === "synthetic-paired-shard", "SYNTHETIC_SHARD_KIND", "shard report kind is invalid");
  expect(report.shard_marker === "synthetic-paired-family-shard-v1", "SYNTHETIC_SHARD_MARKER", "shard marker is invalid");
  assertSafeId(report.shard_id, "shard_id");
  assertSafeId(report.parent_generation_id, "parent_generation_id");
  assertSafeId(report.family_id, "family_id");
  timestamp(report.created_at, "created_at");
  expect(FINGERPRINT.test(report.model_binding_fingerprint), "SYNTHETIC_SHARD_BINDING", "model binding fingerprint is invalid");
  expect(report.adapter_fingerprint === null || FINGERPRINT.test(report.adapter_fingerprint), "SYNTHETIC_SHARD_BINDING", "adapter fingerprint is invalid");
  expect(Array.isArray(report.schedule_projection) && report.schedule_projection.length >= 1, "SYNTHETIC_SHARD_SCHEDULE", "schedule projection is empty");
  for (const entry of report.schedule_projection) {
    exact(entry, ["pair_id", "order"], "shard schedule entry");
    expect(FINGERPRINT.test(entry.pair_id), "SYNTHETIC_SHARD_SCHEDULE", "schedule pair ID is invalid");
    expect(Array.isArray(entry.order) && entry.order.length === 2, "SYNTHETIC_SHARD_SCHEDULE", "schedule order is invalid");
  }
  expect(
    Array.isArray(report.expected_pair_ids)
      && report.expected_pair_ids.length === report.schedule_projection.length
      && canonicalJson(report.expected_pair_ids) === canonicalJson(report.schedule_projection.map((entry) => entry.pair_id)),
    "SYNTHETIC_SHARD_PAIR_SET",
    "expected pair IDs do not match the schedule projection",
  );
  expect(
    Array.isArray(report.actual_pair_ids)
      && report.actual_pair_ids.length === report.pair_count
      && canonicalJson(report.actual_pair_ids) === canonicalJson(report.pairs.map((pair) => pair.pair_id)),
    "SYNTHETIC_SHARD_PAIR_SET",
    "actual pair IDs do not match the shard pairs",
  );
  validateSyntheticRunReport(syntheticStructuralShardReport(report));
  if (report.complete) {
    expect(
      report.adapter_fingerprint !== null
        && canonicalJson(report.actual_pair_ids) === canonicalJson(report.expected_pair_ids),
      "SYNTHETIC_SHARD_COMPLETENESS",
      "complete shard does not contain its exact expected pair universe",
    );
  }
  assertNoHostPathsOrCredentials(report);
  return report;
}

function expectedSuiteBinding({ contracts, templateSet, plan }) {
  return {
    id: plan.suite.id,
    manifest_fingerprint: contracts.fingerprints.suites,
    template_set_fingerprint: fingerprint(templateSet),
    comparison_policy_fingerprint: contracts.fingerprints.comparison_policy,
    profile_inventory_fingerprint: contracts.fingerprints.inventory,
    seed: plan.instances[0].seed,
    semantic_variants: plan.suite.semantic_variants,
    trajectory_repetitions: plan.suite.trajectory_repetitions,
    declared_pair_count: plan.schedule.length,
  };
}

export function validateSyntheticShardReportSourceBinding(report, { sourceRoot } = {}) {
  validateSyntheticShardReport(report);
  const root = fs.realpathSync.native(path.resolve(sourceRoot));
  expect(root === path.resolve(sourceRoot), "SYNTHETIC_SHARD_SOURCE_BINDING", "sourceRoot must be physically canonical");
  const contracts = loadSyntheticContracts(root);
  const templateSet = loadSyntheticTemplateSet(root, contracts);
  const plan = buildSyntheticSuitePlan({
    contracts,
    templateSet,
    suiteId: report.suite.id,
    seed: report.suite.seed,
    baselineProfileId: report.profiles.baseline.id,
    candidateProfileId: report.profiles.candidate.id,
  });
  expect(["standard", "full"].includes(plan.suite.id), "SYNTHETIC_SHARD_SOURCE_BINDING", "only standard and full suites may be sharded");
  const projection = projectSyntheticSuitePlanFamily(plan, report.family_id);
  expect(report.parent_generation_id === plan.generation_id, "SYNTHETIC_SHARD_SOURCE_BINDING", "parent generation ID is stale");
  expect(canonicalJson(report.suite) === canonicalJson(expectedSuiteBinding({ contracts, templateSet, plan })), "SYNTHETIC_SHARD_SOURCE_BINDING", "suite binding is stale");
  expect(canonicalJson(report.schedule_projection) === canonicalJson(projection.schedule), "SYNTHETIC_SHARD_SOURCE_BINDING", "shard schedule is not the exact full-suite projection");
  expect(canonicalJson(report.expected_pair_ids) === canonicalJson(projection.pair_ids), "SYNTHETIC_SHARD_SOURCE_BINDING", "expected pair universe is stale");
  expect(
    report.model_binding_fingerprint === fingerprint({
      schema: "synthetic-model-binding-v1",
      provider: report.execution.provider,
      model: report.execution.model,
      variant: report.execution.variant,
    }),
    "SYNTHETIC_SHARD_SOURCE_BINDING",
    "model binding fingerprint is stale",
  );
  const profiles = [];
  try {
    for (const role of ["baseline", "candidate"]) {
      const profile = materializeSyntheticProfile({ sourceRoot: root, profileId: report.profiles[role].id });
      profiles.push(profile);
      expect(report.profiles[role].fingerprint === profile.profileFingerprint, "SYNTHETIC_SHARD_SOURCE_BINDING", `${role} profile fingerprint is stale`);
    }
  } finally {
    for (const profile of profiles) cleanupSyntheticProfile(profile);
  }
  const scheduleByPairId = new Map(projection.schedule.map((entry) => [entry.pair_id, entry]));
  for (const pair of report.pairs) {
    const instance = plan.instance_by_pair_id.get(pair.pair_id);
    expect(instance?.family_id === report.family_id, "SYNTHETIC_SHARD_SOURCE_BINDING", "pair is outside the shard family");
    expect(canonicalJson(pair.identity) === canonicalJson(syntheticPairIdentity(instance)), "SYNTHETIC_SHARD_SOURCE_BINDING", "pair identity is stale");
    expect(canonicalJson(pair.order) === canonicalJson(scheduleByPairId.get(pair.pair_id)?.order), "SYNTHETIC_SHARD_SOURCE_BINDING", "pair order is stale");
    expect(
      pair.binding.public_fixture_fingerprint === instance.public_fixture_fingerprint
        && pair.binding.hidden_fixture_fingerprint === instance.hidden_fixture_fingerprint
        && pair.binding.task_scope_fingerprint === fingerprint(instance.task_scope)
        && pair.binding.effective_public_input_fingerprint === syntheticEffectivePublicInputFingerprint(instance),
      "SYNTHETIC_SHARD_SOURCE_BINDING",
      "pair source binding is stale",
    );
    expect(
      pair.binding.model_fingerprint === report.model_binding_fingerprint
        && pair.binding.timeout_ms === report.execution.timeout_ms
        && pair.binding.limits_fingerprint === report.execution.limits_fingerprint
        && pair.binding.adapter_protocol_version === SYNTHETIC_OPENCODE_ADAPTER_VERSION
        && pair.binding.executable_fingerprint === report.execution.executable_fingerprint
        && pair.binding.executable_version === report.execution.executable_version
        && pair.binding.executable_basename === report.execution.executable_basename
        && pair.binding.executable_platform === report.execution.executable_platform
        && pair.binding.executable_identity_policy_version === report.execution.executable_identity_policy_version,
      "SYNTHETIC_SHARD_SOURCE_BINDING",
      "pair execution binding differs from the shard",
    );
  }
  const adapterFingerprints = [...new Set(report.pairs.flatMap((pair) => (
    [pair.baseline.fingerprints.adapter, pair.candidate.fingerprints.adapter].filter(Boolean)
  )))];
  expect(
    report.adapter_fingerprint === (adapterFingerprints.length === 1 ? adapterFingerprints[0] : null),
    "SYNTHETIC_SHARD_SOURCE_BINDING",
    "adapter fingerprint does not bind the shard attempts",
  );
  expect(
    report.adapter_fingerprint === null
      || report.adapter_fingerprint === syntheticOpenCodeAdapterFingerprint(),
    "SYNTHETIC_SHARD_SOURCE_BINDING",
    "adapter fingerprint is not canonical",
  );
  return report;
}

export function prepareSyntheticBenchmarkMatrix({
  sourceRoot,
  suiteId,
  seed,
  baselineProfileId,
  candidateProfileId,
  timeoutMs,
} = {}) {
  const root = fs.realpathSync.native(path.resolve(sourceRoot));
  const contracts = loadSyntheticContracts(root);
  const templateSet = loadSyntheticTemplateSet(root, contracts);
  const plan = buildSyntheticSuitePlan({ contracts, templateSet, suiteId, seed, baselineProfileId, candidateProfileId });
  const sharded = ["standard", "full"].includes(plan.suite.id);
  const familyIds = sharded ? plan.suite.family_ids : [];
  const maximumPairs = sharded
    ? Math.max(...familyIds.map((familyId) => projectSyntheticSuitePlanFamily(plan, familyId).pair_ids.length))
    : plan.schedule.length;
  const budget = syntheticModelJobBudget({ pairCount: maximumPairs, timeoutMs });
  return Object.freeze({
    schema_version: SYNTHETIC_PREPARE_VERSION,
    preparation_kind: "synthetic-workflow-matrix",
    suite_id: plan.suite.id,
    parent_generation_id: plan.generation_id,
    seed,
    baseline_profile_id: baselineProfileId,
    candidate_profile_id: candidateProfileId,
    semantic_variants: plan.suite.semantic_variants,
    trajectory_repetitions: plan.suite.trajectory_repetitions,
    declared_pair_count: plan.schedule.length,
    execution_mode: sharded ? "family-sharded" : "single-job",
    family_ids: Object.freeze([...familyIds]),
    matrix: Object.freeze({
      include: Object.freeze(familyIds.map((family_id) => Object.freeze({ family_id }))),
    }),
    job_timeout_minutes: SYNTHETIC_MODEL_JOB_TIMEOUT_MINUTES,
    budget,
    merge_budget: sharded ? syntheticMergeJobBudget() : null,
  });
}

export function publishSyntheticShardArtifact({
  sourceRoot,
  contractSourceRoot = sourceRoot,
  report,
  relativeRoot = DEFAULT_SYNTHETIC_SHARD_ROOT,
} = {}) {
  validateSyntheticShardReportSourceBinding(report, { sourceRoot: contractSourceRoot });
  assertPortableContractPath(relativeRoot, "relativeRoot");
  const root = fs.realpathSync.native(path.resolve(sourceRoot));
  const relativeDirectory = canonicalShardPath(report, relativeRoot);
  const directory = resolveInside(root, ...relativeDirectory.split("/"));
  ensureConfinedDirectory(root, directory);
  const reportPath = resolveInside(directory, "report.json");
  const completionPath = resolveInside(directory, "completion.json");
  const lockPath = resolveInside(directory, ".publish.lock");
  const contents = `${JSON.stringify(report, null, 2)}\n`;
  const completion = Object.freeze({
    schema_version: SYNTHETIC_SHARD_ARTIFACT_VERSION,
    artifact_kind: "synthetic-shard-completion",
    shard_id: report.shard_id,
    parent_generation_id: report.parent_generation_id,
    family_id: report.family_id,
    report_fingerprint: fingerprint(report),
    created_at: report.created_at,
    files: Object.freeze([{ id: "json", fingerprint: sha256Bytes(contents) }]),
  });
  return withExclusiveLock(lockPath, () => {
    if (fs.existsSync(reportPath)) {
      assertConfinedExistingPath(root, reportPath, { type: "file" });
      expect(fs.readFileSync(reportPath, "utf8") === contents, "SYNTHETIC_SHARD_ARTIFACT", "immutable shard report differs");
    } else {
      atomicWriteImmutable(reportPath, contents, { basePath: root });
    }
    if (report.complete) {
      if (fs.existsSync(completionPath)) {
        assertConfinedExistingPath(root, completionPath, { type: "file" });
        expect(canonicalJson(JSON.parse(fs.readFileSync(completionPath, "utf8"))) === canonicalJson(completion), "SYNTHETIC_SHARD_ARTIFACT", "immutable shard completion differs");
      } else {
        atomicWriteJson(completionPath, completion, { immutable: true, basePath: root });
      }
    } else {
      expect(!fs.existsSync(completionPath), "SYNTHETIC_SHARD_ARTIFACT", "incomplete shard must not have a completion marker");
    }
    return Object.freeze({
      status: report.complete ? "published" : "incomplete-uncommitted",
      report_fingerprint: fingerprint(report),
      files: Object.freeze({
        json: `${relativeDirectory}/report.json`,
        completion: report.complete ? `${relativeDirectory}/completion.json` : null,
      }),
    });
  }, { basePath: root });
}

function readShardArtifact(root, reportPath) {
  assertConfinedExistingPath(root, reportPath, { type: "file" });
  expect(fs.statSync(reportPath).size <= MAX_SHARD_BYTES, "SYNTHETIC_SHARD_ARTIFACT", "shard report is too large");
  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8").replace(/^\uFEFF/u, ""));
  } catch {
    fail("SYNTHETIC_SHARD_ARTIFACT", "shard report JSON is invalid");
  }
  validateSyntheticShardReport(report);
  const completionPath = path.join(path.dirname(reportPath), "completion.json");
  expect(fs.existsSync(completionPath), "SYNTHETIC_SHARD_ARTIFACT", "shard is missing its completion marker");
  assertConfinedExistingPath(root, completionPath, { type: "file" });
  expect(fs.statSync(completionPath).size <= 64 * 1024, "SYNTHETIC_SHARD_ARTIFACT", "shard completion marker is too large");
  const completion = JSON.parse(fs.readFileSync(completionPath, "utf8"));
  exact(completion, [
    "schema_version", "artifact_kind", "shard_id", "parent_generation_id", "family_id",
    "report_fingerprint", "created_at", "files",
  ], "shard completion");
  const contents = fs.readFileSync(reportPath, "utf8");
  expect(
    completion.schema_version === SYNTHETIC_SHARD_ARTIFACT_VERSION
      && completion.artifact_kind === "synthetic-shard-completion"
      && completion.shard_id === report.shard_id
      && completion.parent_generation_id === report.parent_generation_id
      && completion.family_id === report.family_id
      && completion.report_fingerprint === fingerprint(report)
      && completion.created_at === report.created_at
      && canonicalJson(completion.files) === canonicalJson([{ id: "json", fingerprint: sha256Bytes(contents) }]),
    "SYNTHETIC_SHARD_ARTIFACT",
    "shard completion marker is stale or tampered",
  );
  return report;
}

export function loadSyntheticShardReportArtifact({
  sourceRoot,
  contractSourceRoot = sourceRoot,
  reportPath,
} = {}) {
  assertPortableContractPath(reportPath, "reportPath");
  const root = fs.realpathSync.native(path.resolve(sourceRoot));
  const file = resolveInside(root, ...reportPath.split("/"));
  assertConfinedExistingPath(root, file, { type: "file" });
  expect(fs.statSync(file).size <= MAX_SHARD_BYTES, "SYNTHETIC_SHARD_ARTIFACT", "shard report is too large");
  let report;
  try {
    report = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
  } catch {
    fail("SYNTHETIC_SHARD_ARTIFACT", "shard report JSON is invalid");
  }
  validateSyntheticShardReportSourceBinding(report, { sourceRoot: contractSourceRoot });
  expect(
    reportPath === `${canonicalShardPath(report)}/report.json`,
    "SYNTHETIC_SHARD_ARTIFACT",
    "shard report path is not canonical",
  );
  if (report.complete) {
    readShardArtifact(root, file);
  } else {
    expect(!fs.existsSync(path.join(path.dirname(file), "completion.json")), "SYNTHETIC_SHARD_ARTIFACT", "incomplete shard has a completion marker");
  }
  return Object.freeze({ report, reportPath });
}

function collectShardReports(root, shardsRoot) {
  const reports = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail("SYNTHETIC_SHARD_ARTIFACT", "shard directory contains a symlink");
      if (entry.isDirectory()) visit(file);
      if (entry.isFile() && entry.name === "report.json") {
        const report = readShardArtifact(root, file);
        expect(
          file === path.join(shardsRoot, report.parent_generation_id, report.family_id, report.shard_id, "report.json"),
          "SYNTHETIC_SHARD_ARTIFACT",
          "shard report is outside its canonical artifact path",
        );
        reports.push(report);
      }
    }
  };
  visit(shardsRoot);
  return reports;
}

function mergeBinding(report) {
  return {
    parent_generation_id: report.parent_generation_id,
    suite: report.suite,
    model_binding_fingerprint: report.model_binding_fingerprint,
    adapter_fingerprint: report.adapter_fingerprint,
    execution: report.execution,
    profiles: report.profiles,
    residual_caveats: report.residual_caveats,
  };
}

export function mergeSyntheticShardReports({
  sourceRoot,
  suiteId,
  seed,
  baselineProfileId,
  candidateProfileId,
  shardReports,
  clock = () => new Date(),
  idFactory = (kind) => `${kind}-${randomUUID()}`,
} = {}) {
  const root = fs.realpathSync.native(path.resolve(sourceRoot));
  const contracts = loadSyntheticContracts(root);
  const templateSet = loadSyntheticTemplateSet(root, contracts);
  const plan = buildSyntheticSuitePlan({ contracts, templateSet, suiteId, seed, baselineProfileId, candidateProfileId });
  expect(["standard", "full"].includes(plan.suite.id), "SYNTHETIC_SHARD_MERGE", "only standard and full suites may be merged from shards");
  expect(Array.isArray(shardReports), "SYNTHETIC_SHARD_MERGE", "shardReports must be an array");
  shardReports.forEach((report) => validateSyntheticShardReportSourceBinding(report, { sourceRoot: root }));
  const expectedFamilies = plan.suite.family_ids;
  const actualFamilies = shardReports.map((report) => report.family_id);
  expect(new Set(actualFamilies).size === actualFamilies.length, "SYNTHETIC_SHARD_MERGE", "duplicate family shard");
  expect(canonicalJson([...actualFamilies].sort()) === canonicalJson([...expectedFamilies].sort()), "SYNTHETIC_SHARD_MERGE", "missing or unexpected family shard");
  expect(shardReports.every((report) => report.complete), "SYNTHETIC_SHARD_MERGE", "incomplete shard cannot be merged");
  const firstBinding = canonicalJson(mergeBinding(shardReports[0]));
  expect(shardReports.every((report) => canonicalJson(mergeBinding(report)) === firstBinding), "SYNTHETIC_SHARD_MERGE", "shard source or execution bindings differ");
  const pairs = shardReports.flatMap((report) => report.pairs);
  const pairById = new Map(pairs.map((pair) => [pair.pair_id, pair]));
  expect(pairById.size === pairs.length, "SYNTHETIC_SHARD_MERGE", "duplicate pair across shards");
  const expectedPairIds = plan.schedule.map((entry) => entry.pair_id);
  expect(canonicalJson([...pairById.keys()].sort()) === canonicalJson([...expectedPairIds].sort()), "SYNTHETIC_SHARD_MERGE", "missing or unexpected pair across shards");
  const orderedPairs = Object.freeze(expectedPairIds.map((pairId) => pairById.get(pairId)));
  const first = shardReports[0];
  const createdAtValue = clock();
  const createdAt = createdAtValue instanceof Date ? createdAtValue.toISOString() : createdAtValue;
  const report = Object.freeze({
    schema_version: SYNTHETIC_RUN_REPORT_VERSION,
    report_kind: "synthetic-paired-run",
    run_id: assertSafeId(idFactory("synthetic-merged-run"), "run_id"),
    generation_id: plan.generation_id,
    created_at: createdAt,
    suite: first.suite,
    execution: first.execution,
    profiles: first.profiles,
    complete: true,
    incomplete_reasons: Object.freeze([]),
    pair_count: orderedPairs.length,
    pairs: orderedPairs,
    residual_caveats: first.residual_caveats,
  });
  validateSyntheticRunReportSourceBinding(report, { sourceRoot: root });
  return report;
}

export function mergeSyntheticShardArtifacts({
  sourceRoot,
  contractSourceRoot = sourceRoot,
  suiteId,
  seed,
  baselineProfileId,
  candidateProfileId,
  shardsDirectory,
  publishRun = publishSyntheticRunArtifacts,
  clock,
  idFactory,
} = {}) {
  assertPortableContractPath(shardsDirectory, "shardsDirectory");
  const root = fs.realpathSync.native(path.resolve(sourceRoot));
  const shardsRoot = resolveInside(root, ...shardsDirectory.split("/"));
  assertConfinedExistingPath(root, shardsRoot, { type: "directory" });
  const shardReports = collectShardReports(root, shardsRoot);
  const report = mergeSyntheticShardReports({
    sourceRoot: contractSourceRoot,
    suiteId,
    seed,
    baselineProfileId,
    candidateProfileId,
    shardReports,
    clock,
    idFactory,
  });
  const publication = publishRun({ sourceRoot: root, contractSourceRoot, report });
  return Object.freeze({ report, publication });
}

export async function runSyntheticShardWorkflow(options = {}) {
  const preparation = prepareSyntheticBenchmarkMatrix(options);
  expect(preparation.execution_mode === "family-sharded", "SYNTHETIC_SHARD_WORKFLOW", "suite does not use family sharding");
  const familyProjection = preparation.matrix.include.find((entry) => entry.family_id === options.familyId);
  expect(familyProjection !== undefined, "SYNTHETIC_SHARD_WORKFLOW", "family is not in the prepared matrix");
  const planBudget = syntheticModelJobBudget({
    pairCount: preparation.semantic_variants * preparation.trajectory_repetitions,
    timeoutMs: options.timeoutMs,
  });
  const report = await (options.runShard ?? runSyntheticPairedShard)(options);
  validateSyntheticShardReportSourceBinding(report, { sourceRoot: options.contractSourceRoot ?? options.sourceRoot });
  const publication = (options.publishShard ?? publishSyntheticShardArtifact)({
    sourceRoot: options.sourceRoot,
    contractSourceRoot: options.contractSourceRoot ?? options.sourceRoot,
    report,
  });
  return Object.freeze({ report, publication, budget: planBudget });
}
