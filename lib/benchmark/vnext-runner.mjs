import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { ProfileV3Error, fingerprintProfileValue } from "../profile-v3.mjs";
import { loadVnextContracts } from "./vnext-contracts.mjs";

const SUITE_IDS = new Set(["smoke", "standard", "full"]);
const REPORT_STATUSES = new Set(["complete", "incomplete", "blocked-unproven"]);
const SUMMARY_KEYS = Object.freeze(["baseline", "candidate", "paired_delta", "confidence_interval"]);
const RATE_METRIC_IDS = new Set([
  "functional_hidden_check_success", "regression_free_success", "public_contract_preservation",
  "regression_free_high_risk_success",
  "structural_oracle_success", "missed_consumer_rate", "verification_omission",
  "task_completion_without_human_intervention", "timeout_rate", "whole_task_success",
  "protocol_compliance", "trace_completeness", "attestation_completeness",
]);

function fail(code, message) {
  throw new ProfileV3Error(code, message);
}

export function resolveVnextAdapterPath(repositoryRoot, candidate) {
  const lexicalRoot = path.resolve(repositoryRoot);
  const root = fs.realpathSync.native(lexicalRoot);
  const lexical = path.resolve(candidate);
  const lexicalRelative = path.relative(lexicalRoot, lexical);
  if (lexicalRelative === ".." || lexicalRelative.startsWith(`..${path.sep}`)
    || path.isAbsolute(lexicalRelative)) {
    fail("VNEXT_ADAPTER_PATH", "adapter must be a repository-confined local module");
  }
  let stat;
  try {
    stat = fs.lstatSync(lexical);
  } catch (error) {
    fail("VNEXT_ADAPTER_PATH", `adapter is unavailable: ${error.message}`);
  }
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) {
    fail("VNEXT_ADAPTER_PATH", "adapter must be a single-link regular file");
  }
  const physical = fs.realpathSync.native(lexical);
  const physicalRelative = path.relative(root, physical);
  if (physicalRelative === ".." || physicalRelative.startsWith(`..${path.sep}`)
    || path.isAbsolute(physicalRelative)) {
    fail("VNEXT_ADAPTER_PATH", "adapter physical path escapes the repository");
  }
  return physical;
}

export async function loadVnextAdapterModule(repositoryRoot, candidate) {
  const physical = resolveVnextAdapterPath(repositoryRoot, candidate);
  const before = fs.lstatSync(physical, { bigint: true });
  const bytes = fs.readFileSync(physical);
  const after = fs.lstatSync(physical, { bigint: true });
  if (!after.isFile() || after.nlink !== 1n || before.dev !== after.dev
    || before.ino !== after.ino || before.size !== after.size
    || before.mtimeNs !== after.mtimeNs) {
    fail("VNEXT_ADAPTER_RACE", "adapter changed while its verified bytes were loaded");
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  const url = `data:text/javascript;base64,${bytes.toString("base64")}#sha256=${digest}`;
  try {
    return Object.freeze({
      module: await import(url),
      fingerprint: `sha256:${digest}`,
      physical_path: physical,
    });
  } catch (error) {
    fail("VNEXT_ADAPTER_API", `adapter must be a self-contained module: ${error.message}`);
  }
}

function safeText(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return value;
  if (typeof value !== "string" || value.length === 0 || value.length > 1000
    || /[\r\n\0]/u.test(value)) fail("VNEXT_RUN_ARGUMENT", `${label} is invalid`);
  return value;
}

function sourceSha(root) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  let value = result.status === 0 ? result.stdout.trim() : "";
  if (!/^[0-9a-f]{40}$/u.test(value)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(
        path.join(root, ".opencode-profile-manifest.json"),
        "utf8",
      ));
      if (manifest.managed_by === "opencode-harness-profile-materializer"
        && manifest.bundle_id === "lab") value = manifest.source_sha;
    } catch {
      value = "";
    }
  }
  if (!/^[0-9a-f]{40}$/u.test(value)) fail("VNEXT_SOURCE_SHA", "source Git SHA is unavailable");
  return value;
}

function assertMaterializedSourceTree(root) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(root, ".opencode-profile-manifest.json"), "utf8"));
  } catch {
    return false;
  }
  if (manifest.managed_by !== "opencode-harness-profile-materializer"
    || manifest.bundle_id !== "lab" || !Array.isArray(manifest.files)
    || manifest.source_git_clean !== true
    || manifest.source_all_tracked !== true
    || !/^sha256:[0-9a-f]{64}$/u.test(manifest.source_tree_fingerprint)
    || !/^[0-9a-f]{40}$/u.test(manifest.source_sha)) return false;
  const expectedTreeFingerprint = fingerprintProfileValue({
    domain: "sha256:profile-source-tree-v1",
    files: manifest.files,
  });
  if (manifest.source_tree_fingerprint !== expectedTreeFingerprint) return false;
  const { bundle_fingerprint: declaredBundleFingerprint, ...manifestBody } = manifest;
  if (declaredBundleFingerprint !== fingerprintProfileValue({
    domain: "sha256:profile-path-bytes-v1",
    manifest: manifestBody,
  })) return false;
  const expectedPaths = new Set([
    ".opencode-profile-manifest.json",
    ...manifest.files.map((entry) => entry.path),
  ]);
  const actualPaths = [];
  const visit = (directory, prefix = "") => {
    for (const name of fs.readdirSync(directory).sort()) {
      const relative = prefix.length === 0 ? name : `${prefix}/${name}`;
      const target = path.join(directory, name);
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink()) return false;
      if (stat.isDirectory()) {
        if (visit(target, relative) === false) return false;
      } else if (stat.isFile() && stat.nlink === 1) {
        actualPaths.push(relative);
      } else {
        return false;
      }
    }
    return true;
  };
  if (visit(root) === false
    || actualPaths.length !== expectedPaths.size
    || actualPaths.some((entry) => !expectedPaths.has(entry))) return false;
  for (const entry of manifest.files) {
    if (typeof entry.path !== "string" || typeof entry.size !== "number"
      || typeof entry.sha256 !== "string") return false;
    const target = path.resolve(root, ...entry.path.split("/"));
    const relative = path.relative(root, target);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
    let stat;
    try {
      stat = fs.lstatSync(target);
    } catch {
      return false;
    }
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) return false;
    const bytes = fs.readFileSync(target);
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (bytes.byteLength !== entry.size || digest !== entry.sha256) return false;
  }
  return true;
}

function assertCleanSourceTree(root) {
  const result = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0 && assertMaterializedSourceTree(root)) return;
  if (result.status !== 0 || result.stdout.length !== 0) {
    fail("VNEXT_SOURCE_DIRTY", "model-backed plans require a clean committed source tree");
  }
}

function selectionRank(seed, estimandId, familyId) {
  return createHash("sha256").update(`${seed}\0${estimandId}\0${familyId}`).digest("hex");
}

function selectFamilies(contract, estimand, suiteId, seed) {
  const eligible = contract.families.filter((family) => estimand.eligible_strata.includes(family.stratum));
  const byStratum = new Map(estimand.eligible_strata.map((stratum) => [stratum, eligible
    .filter((family) => family.stratum === stratum)
    .sort((left, right) => selectionRank(seed, estimand.id, left.id)
      .localeCompare(selectionRank(seed, estimand.id, right.id)))]));
  if (suiteId === "full") return eligible.map((entry) => entry.id).sort();
  const limit = suiteId === "smoke" ? 1 : 8;
  const selected = [...byStratum.values()].flatMap((families) => families.slice(0, limit));
  if (suiteId === "standard" && selected.length < 8) {
    fail("VNEXT_STANDARD_COVERAGE", `${estimand.id} has fewer than eight eligible standard families`);
  }
  return selected.map((entry) => entry.id).sort();
}

export function buildVnextExecutionPlan({
  repositoryRoot,
  suiteId,
  estimandId,
  model,
  provider,
  variant,
  seed,
  timeoutMs,
  executableIdentity,
  adapterFingerprint = "unconfigured",
  allowFull = false,
  allowDirty = false,
} = {}) {
  if (!SUITE_IDS.has(suiteId)) fail("VNEXT_RUN_ARGUMENT", "suite must be smoke, standard, or full");
  if (suiteId === "full" && allowFull !== true) {
    fail("VNEXT_FULL_GATE", "full requires a separate positive standard promotion decision");
  }
  const loaded = loadVnextContracts(repositoryRoot);
  if (allowDirty !== true) assertCleanSourceTree(loaded.root);
  const estimand = loaded.contract.estimands.find((entry) => entry.id === estimandId);
  if (!estimand) fail("VNEXT_RUN_ARGUMENT", `unknown estimand ${estimandId}`);
  safeText(model, "model");
  safeText(provider, "provider");
  safeText(variant, "variant", { nullable: true });
  safeText(seed, "seed");
  safeText(executableIdentity, "executable identity");
  if (adapterFingerprint !== "unconfigured"
    && !/^sha256:[0-9a-f]{64}$/u.test(adapterFingerprint)) {
    fail("VNEXT_RUN_ARGUMENT", "adapter fingerprint is invalid");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 60_000 || timeoutMs > 3_600_000) {
    fail("VNEXT_RUN_ARGUMENT", "timeout must be between 60000 and 3600000 milliseconds");
  }
  const familyIds = selectFamilies(loaded.contract, estimand, suiteId, seed);
  const bindings = Object.freeze({
    source_sha: sourceSha(loaded.root),
    policy_fingerprint: loaded.validation.policy_fingerprint,
    inventory_fingerprint: loaded.validation.inventory_fingerprint,
    contract_fingerprint: loaded.validation.contract_fingerprint,
    executable_identity: executableIdentity,
    adapter_fingerprint: adapterFingerprint,
    model,
    provider,
    variant: variant ?? "host-default",
    seed,
    timeout_ms: timeoutMs,
    runner_limits: Object.freeze({
      max_parallel_pairs: 1,
      trajectory_repetitions: loaded.contract.suites.find((entry) => entry.id === suiteId).trajectory_repetitions,
      raw_model_output_persisted: false,
    }),
    fixture_fingerprint: fingerprintProfileValue({ family_ids: familyIds }),
    evaluator_fingerprint: fingerprintProfileValue({
      contract: loaded.validation.contract_fingerprint,
      report_schema: "vnext-run-report-v1",
      comparison_schema: "vnext-comparison-report-v1",
    }),
  });
  const body = {
    schema_version: 1,
    plan_kind: "vnext-component-ablation-plan",
    suite_id: suiteId,
    estimand_id: estimand.id,
    baseline_arm_id: estimand.baseline_arm_id,
    candidate_arm_id: estimand.candidate_arm_id,
    added_component_id: estimand.added_component_id,
    eligible_strata: estimand.eligible_strata,
    family_ids: familyIds,
    metric_ids: Object.freeze({
      product: Object.freeze([...loaded.contract.metrics.primary_product]),
      operational: Object.freeze([...loaded.contract.metrics.operational]),
      diagnostic: Object.freeze([...loaded.contract.metrics.diagnostic]),
    }),
    bindings,
  };
  return Object.freeze({ ...body, plan_fingerprint: fingerprintProfileValue(body) });
}

export function blockedVnextRunReport(plan, reason) {
  safeText(reason, "blocked reason");
  return Object.freeze({
    schema_version: 1,
    run_id: `blocked-${plan.plan_fingerprint.slice(7, 31)}`,
    estimand_id: plan.estimand_id,
    suite_id: plan.suite_id,
    bindings: plan.bindings,
    status: "blocked-unproven",
    family_results: [],
    product_metrics: {},
    operational_metrics: {},
    diagnostic_metrics: {},
    incomplete_outcomes: [{
      status: "blocked_external_state",
      reason,
      scored: false,
    }],
  });
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!plainObject(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    fail("VNEXT_ADAPTER_REPORT", `${label} must contain exactly the declared keys`);
  }
}

function validateMetricSummary(value, metricId, label) {
  exactKeys(value, SUMMARY_KEYS, label);
  for (const key of ["baseline", "candidate", "paired_delta"]) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key])) {
      fail("VNEXT_ADAPTER_REPORT", `${label}.${key} must be finite`);
    }
  }
  const computedDelta = value.candidate - value.baseline;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(value.baseline), Math.abs(value.candidate)) * 8;
  if (Math.abs(value.paired_delta - computedDelta) > tolerance) {
    fail("VNEXT_ADAPTER_REPORT", `${label}.paired_delta contradicts candidate minus baseline`);
  }
  if (!Array.isArray(value.confidence_interval) || value.confidence_interval.length !== 2
    || value.confidence_interval.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
    || value.confidence_interval[0] > value.confidence_interval[1]
    || value.paired_delta < value.confidence_interval[0]
    || value.paired_delta > value.confidence_interval[1]) {
    fail("VNEXT_ADAPTER_REPORT", `${label}.confidence_interval is invalid`);
  }
  if (RATE_METRIC_IDS.has(metricId)) {
    if (value.baseline < 0 || value.baseline > 1 || value.candidate < 0 || value.candidate > 1
      || value.paired_delta < -1 || value.paired_delta > 1
      || value.confidence_interval[0] < -1 || value.confidence_interval[1] > 1) {
      fail("VNEXT_ADAPTER_REPORT", `${label} is outside the declared rate range`);
    }
  } else if (value.baseline < 0 || value.candidate < 0) {
    fail("VNEXT_ADAPTER_REPORT", `${label} contains a negative count or cost`);
  }
}

function validateMetricGroup(value, metricIds, label) {
  exactKeys(value, metricIds, label);
  for (const metricId of metricIds) validateMetricSummary(value[metricId], metricId, `${label}.${metricId}`);
}

function validateFamilyResults(plan, report) {
  if (!Array.isArray(report.family_results)) {
    fail("VNEXT_ADAPTER_REPORT", "family_results must be an array");
  }
  const expectedRepetitions = plan.bindings.runner_limits.trajectory_repetitions;
  const familyIds = [];
  for (const [index, result] of report.family_results.entries()) {
    exactKeys(result, [
      "family_id", "baseline_arm_id", "candidate_arm_id", "repetition_count", "status",
    ], `family_results[${index}]`);
    if (typeof result.family_id !== "string" || !plan.family_ids.includes(result.family_id)
      || result.baseline_arm_id !== plan.baseline_arm_id
      || result.candidate_arm_id !== plan.candidate_arm_id
      || !Number.isSafeInteger(result.repetition_count) || result.repetition_count < 0
      || !["complete", "incomplete", "blocked"].includes(result.status)) {
      fail("VNEXT_ADAPTER_REPORT", `family_results[${index}] is invalid or unbound`);
    }
    if (result.status === "complete" && result.repetition_count !== expectedRepetitions) {
      fail("VNEXT_ADAPTER_REPORT", `${result.family_id} has incomplete trajectory coverage`);
    }
    familyIds.push(result.family_id);
  }
  if (new Set(familyIds).size !== familyIds.length) {
    fail("VNEXT_ADAPTER_REPORT", "family_results contains duplicate families");
  }
  if (report.status === "complete") {
    if (JSON.stringify([...familyIds].sort()) !== JSON.stringify([...plan.family_ids].sort())
      || report.family_results.some((entry) => entry.status !== "complete")) {
      fail("VNEXT_ADAPTER_REPORT", "complete report must cover every selected family exactly once");
    }
  }
}

function validateIncompleteOutcomes(report) {
  if (!Array.isArray(report.incomplete_outcomes)) {
    fail("VNEXT_ADAPTER_REPORT", "incomplete_outcomes must be an array");
  }
  for (const [index, outcome] of report.incomplete_outcomes.entries()) {
    if (!plainObject(outcome) || outcome.scored !== false
      || typeof outcome.status !== "string" || outcome.status.length === 0
      || typeof outcome.reason !== "string" || outcome.reason.length === 0) {
      fail("VNEXT_ADAPTER_REPORT", `incomplete_outcomes[${index}] must be explicit and unscored`);
    }
  }
}

export function validateVnextAdapterReport(plan, report) {
  if (!plainObject(report)) {
    fail("VNEXT_ADAPTER_REPORT", "adapter report must be an object");
  }
  exactKeys(report, [
    "schema_version", "run_id", "estimand_id", "suite_id", "bindings", "status",
    "family_results", "product_metrics", "operational_metrics", "diagnostic_metrics",
    "incomplete_outcomes",
  ], "adapter report");
  if (report.schema_version !== 1 || report.estimand_id !== plan.estimand_id
    || report.suite_id !== plan.suite_id
    || fingerprintProfileValue(report.bindings) !== fingerprintProfileValue(plan.bindings)
    || !REPORT_STATUSES.has(report.status)
    || typeof report.run_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(report.run_id)) {
    fail("VNEXT_ADAPTER_REPORT", "adapter report is stale, unbound, or invalid");
  }
  validateFamilyResults(plan, report);
  validateIncompleteOutcomes(report);
  if (report.status === "complete") {
    if (report.incomplete_outcomes.length !== 0) {
      fail("VNEXT_ADAPTER_REPORT", "complete report cannot contain incomplete outcomes");
    }
    validateMetricGroup(report.product_metrics, plan.metric_ids.product, "product_metrics");
    validateMetricGroup(report.operational_metrics, plan.metric_ids.operational, "operational_metrics");
    validateMetricGroup(report.diagnostic_metrics, plan.metric_ids.diagnostic, "diagnostic_metrics");
  } else {
    if (report.incomplete_outcomes.length === 0) {
      fail("VNEXT_ADAPTER_REPORT", "non-complete report must enumerate incomplete outcomes");
    }
    for (const [label, value] of Object.entries({
      product_metrics: report.product_metrics,
      operational_metrics: report.operational_metrics,
      diagnostic_metrics: report.diagnostic_metrics,
    })) {
      exactKeys(value, [], `${label} for a non-complete report`);
    }
  }
  return report;
}
