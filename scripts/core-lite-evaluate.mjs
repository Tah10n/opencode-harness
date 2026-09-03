#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MODEL, VARIANT, executeAttempt, fingerprint, hash, readJson, validateReceipt,
  verifyMaterializedBundle, writeJson } from "./core-lite-calibrate.mjs";
import { counterbalancedSchedule, taskBinding } from "./core-lite-freeze.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpusPath = path.join(root, "benchmarks/core-lite/corpus.json");
const checkerPath = path.join(root, "benchmarks/core-lite/check-task.mjs");
const materializerPath = path.join(root, "scripts/materialize-core-lite.mjs");

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

function choose(n, k) {
  const count = Math.min(k, n - k); let result = 1;
  for (let index = 1; index <= count; index += 1) result = result * (n - count + index) / index;
  return result;
}

export function exactOneSidedMcNemar(coreOnly, plainOnly) {
  const discordant = coreOnly + plainOnly;
  if (discordant === 0) return 1;
  let probability = 0;
  for (let successes = coreOnly; successes <= discordant; successes += 1) probability += choose(discordant, successes) / 2 ** discordant;
  return probability;
}

export function exactTwoSidedMcNemar(coreOnly, plainOnly) {
  const discordant = coreOnly + plainOnly;
  if (discordant === 0) return 1;
  let lowerTail = 0;
  for (let successes = 0; successes <= Math.min(coreOnly, plainOnly); successes += 1) {
    lowerTail += choose(discordant, successes) / 2 ** discordant;
  }
  return Math.min(1, 2 * lowerTail);
}

function randomGenerator(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 2 ** 32;
  };
}

export function pairedBootstrap(pairs, resamples, seed) {
  assert(pairs.length > 0 && Number.isSafeInteger(resamples) && resamples > 0);
  const random = randomGenerator(seed); const deltas = new Array(resamples);
  for (let sample = 0; sample < resamples; sample += 1) {
    let total = 0;
    for (let draw = 0; draw < pairs.length; draw += 1) {
      const pair = pairs[Math.floor(random() * pairs.length)];
      total += Number(pair.core) - Number(pair.plain);
    }
    deltas[sample] = total / pairs.length * 100;
  }
  deltas.sort((a, b) => a - b);
  return { lower: deltas[Math.floor(0.025 * resamples)], upper: deltas[Math.ceil(0.975 * resamples) - 1],
    resamples, seed, method: "paired-task-resampling-with-replacement" };
}

function armSummary(rows, arm) {
  const selected = rows.filter((entry) => entry.arm === arm);
  return { attempts: selected.length, successes: selected.filter((entry) => entry.task_success).length,
    success_rate: selected.filter((entry) => entry.task_success).length / selected.length,
    timeouts: selected.filter((entry) => entry.process_timed_out).length,
    scope_violations: selected.filter((entry) => !entry.mutation_scope.valid).length,
    first_public_check_passes: selected.filter((entry) => entry.first_public_check_pass).length,
    final_public_check_passes: selected.filter((entry) => entry.final_public_check_pass).length,
    semantic_successes: selected.filter((entry) => entry.hidden_check.passed).length,
    total_duration_ms: selected.reduce((sum, entry) => sum + entry.duration_ms, 0),
    mean_duration_ms: selected.reduce((sum, entry) => sum + entry.duration_ms, 0) / selected.length,
    turns: selected.reduce((sum, entry) => sum + entry.event_metrics.turns, 0),
    tool_calls: selected.reduce((sum, entry) => sum + entry.event_metrics.tool_calls, 0) };
}

function pairRows(receipts, taskIds) {
  return taskIds.map((taskId) => {
    const plain = receipts.find((entry) => entry.task_id === taskId && entry.arm === "plain");
    const core = receipts.find((entry) => entry.task_id === taskId && entry.arm === "core-lite");
    assert(plain && core, `missing pair for ${taskId}`);
    return { task_id: taskId, stratum: plain.stratum, plain: plain.task_success, core: core.task_success };
  });
}

export function measurementSummary(receipts, manifest) {
  assert.equal(receipts.length, 60);
  assert(receipts.every((entry) => entry.scored_outcome), "official measurement contains an unscored outcome");
  const taskIds = manifest.task_bindings.map((entry) => entry.task_id);
  const pairs = pairRows(receipts, taskIds);
  const plain = armSummary(receipts, "plain"); const core = armSummary(receipts, "core-lite");
  const coreOnly = pairs.filter((pair) => pair.core && !pair.plain).length;
  const plainOnly = pairs.filter((pair) => pair.plain && !pair.core).length;
  const ties = pairs.length - coreOnly - plainOnly;
  const deltaPercentagePoints = (core.success_rate - plain.success_rate) * 100;
  const bootstrap = pairedBootstrap(pairs, manifest.statistics.bootstrap_resamples,
    manifest.statistics.bootstrap_seed_uint32);
  const oneSided = exactOneSidedMcNemar(coreOnly, plainOnly);
  const twoSided = exactTwoSidedMcNemar(coreOnly, plainOnly);
  const strata = Object.fromEntries(["small", "medium", "high"].map((stratum) => {
    const selected = receipts.filter((entry) => entry.stratum === stratum);
    const selectedPairs = pairs.filter((pair) => pair.stratum === stratum);
    return [stratum, { plain_successes: selected.filter((entry) => entry.arm === "plain" && entry.task_success).length,
      core_lite_successes: selected.filter((entry) => entry.arm === "core-lite" && entry.task_success).length,
      core_only_wins: selectedPairs.filter((pair) => pair.core && !pair.plain).length,
      plain_only_wins: selectedPairs.filter((pair) => pair.plain && !pair.core).length }];
  }));
  const coreRows = receipts.filter((entry) => entry.arm === "core-lite");
  const activationCount = coreRows.filter((entry) => entry.verification_activated).length;
  const remediationCount = coreRows.filter((entry) => entry.remediation_invoked).length;
  const recoveryCount = coreRows.filter((entry) => entry.remediation_recovered).length;
  const timeoutDelta = (core.timeouts - plain.timeouts) / 30 * 100;
  const scopeDelta = (core.scope_violations - plain.scope_violations) / 30 * 100;
  const effective = deltaPercentagePoints >= manifest.statistics.effective_minimum_delta_percentage_points
    && oneSided < 0.05 && bootstrap.lower > 0
    && coreOnly - plainOnly >= manifest.statistics.effective_minimum_core_only_minus_plain_only
    && timeoutDelta <= manifest.statistics.timeout_guardrail_percentage_points
    && core.scope_violations <= plain.scope_violations && activationCount / 30 >= 0.9 && recoveryCount >= 1;
  const regresses = core.successes < plain.successes
    || timeoutDelta > manifest.statistics.operational_regression_margin_percentage_points
    || scopeDelta > manifest.statistics.operational_regression_margin_percentage_points;
  const body = { schema_version: 1, measurement_id: manifest.measurement_id,
    manifest_fingerprint: manifest.manifest_fingerprint, product_sha: manifest.product_sha,
    bundle_fingerprint: manifest.bundle_fingerprint, model_binding: manifest.model_binding,
    evaluation_task_count: 30, plain, core_lite: core, plain_successes: plain.successes,
    core_lite_successes: core.successes, absolute_delta_percentage_points: deltaPercentagePoints,
    relative_lift_percent: plain.successes === 0 ? null : (core.successes - plain.successes) / plain.successes * 100,
    core_only_wins: coreOnly, plain_only_wins: plainOnly, ties,
    exact_one_sided_mcnemar_p: oneSided, exact_two_sided_mcnemar_p: twoSided,
    paired_bootstrap_95_ci_percentage_points: bootstrap, strata,
    verification_activation_count: activationCount, verification_activation_rate: activationCount / 30,
    remediation_invocation_count: remediationCount, remediation_recovery_count: recoveryCount,
    timeout_rate_delta_percentage_points: timeoutDelta, scope_violation_delta_percentage_points: scopeDelta,
    overhead: { mean_duration_ms_delta: core.mean_duration_ms - plain.mean_duration_ms,
      turns_delta: core.turns - plain.turns, tool_calls_delta: core.tool_calls - plain.tool_calls },
    decision: regresses ? "CORE-LITE REGRESSES" : effective ? "CORE-LITE EFFECTIVE" : "NO PROVEN BENEFIT",
    exact_claim: null };
  body.exact_claim = `On 30 frozen evaluation tasks, core-lite changed task success relative to plain by ${deltaPercentagePoints} percentage points.`;
  return { ...body, summary_fingerprint: fingerprint(body) };
}

function validateManifest(manifest, corpus, opencodePath) {
  const body = { ...manifest }; delete body.manifest_fingerprint;
  assert.equal(manifest.manifest_fingerprint, fingerprint(body), "manifest fingerprint drifted");
  assert.equal(manifest.measurement_id, "core-lite-paired-ab-v1");
  assert.equal(manifest.model_binding, MODEL); assert.equal(manifest.variant, VARIANT);
  assert.equal(manifest.evaluation_task_count, 30); assert.equal(manifest.schedule.length, 60);
  assert.equal(manifest.corpus_sha256, hash(fs.readFileSync(corpusPath)));
  assert.equal(manifest.checker_sha256, hash(fs.readFileSync(checkerPath)));
  assert.equal(manifest.opencode_path, opencodePath);
  assert.equal(manifest.opencode_sha256, hash(fs.readFileSync(opencodePath)));
  assert.deepEqual(manifest.runner_bindings, {
    calibration_sha256: hash(fs.readFileSync(path.join(root, "scripts/core-lite-calibrate.mjs"))),
    evaluation_sha256: hash(fs.readFileSync(path.join(root, "scripts/core-lite-evaluate.mjs"))),
    freeze_sha256: hash(fs.readFileSync(path.join(root, "scripts/core-lite-freeze.mjs"))),
    materializer_sha256: hash(fs.readFileSync(materializerPath)),
  }, "frozen runner source binding drifted");
  const tasks = corpus.tasks.filter((task) => task.split === "evaluation").sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(manifest.task_bindings, tasks.map((task) => taskBinding(task, manifest.checker_sha256)));
  assert.deepEqual(manifest.schedule, counterbalancedSchedule(tasks), "counterbalanced schedule drifted");
  assert.equal(manifest.statistics.bootstrap_resamples, 100000);
  assert.equal(manifest.statistics.one_sided_direction, "core-lite>plain");
  for (const stratum of ["small", "medium", "high"]) {
    const scheduled = manifest.schedule.filter((entry) => entry.stratum === stratum && entry.within_pair_order === 1);
    assert.equal(scheduled.filter((entry) => entry.arm === "plain").length, 5);
    assert.equal(scheduled.filter((entry) => entry.arm === "core-lite").length, 5);
  }
}

async function main() {
  const manifestPath = path.resolve(option("--manifest", path.join(root, "benchmarks/core-lite/evaluation-manifest.json")));
  const campaignRoot = path.resolve(option("--campaign-root") ?? "");
  const authPath = path.resolve(option("--auth", "/Users/tahion/.local/share/opencode/auth.json"));
  if (option("--campaign-root") === null) throw new Error("--campaign-root is required");
  const manifest = readJson(manifestPath); const corpus = readJson(corpusPath);
  const opencodePath = fs.realpathSync.native(manifest.opencode_path);
  validateManifest(manifest, corpus, opencodePath);
  const version = spawnSync(opencodePath, ["--version"], { encoding: "utf8" });
  if (version.status !== 0 || version.stdout.trim() !== manifest.opencode_version) {
    throw new Error("OpenCode version differs from freeze");
  }
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  if (status.status !== 0 || status.stdout !== "") throw new Error("official evaluation requires a clean source worktree");
  const protectedPaths = ["agents/core-lite.md", "profiles/core-lite/opencode.json", "runtime/core-lite.mjs",
    "scripts/materialize-core-lite.mjs", "scripts/core-lite-calibrate.mjs", "scripts/core-lite-evaluate.mjs",
    "scripts/core-lite-freeze.mjs", "benchmarks/core-lite/corpus.json", "benchmarks/core-lite/check-task.mjs"];
  const productDiff = spawnSync("git", ["diff", "--quiet", manifest.product_sha, "--", ...protectedPaths], { cwd: root });
  if (productDiff.status !== 0) throw new Error("frozen product or corpus differs from product SHA");
  const authContent = fs.readFileSync(authPath, "utf8"); JSON.parse(authContent);
  fs.mkdirSync(campaignRoot, { recursive: true });
  const bundle = path.join(campaignRoot, "bundle");
  if (!fs.existsSync(bundle)) {
    const result = spawnSync(process.execPath, [materializerPath, "--output", bundle], { cwd: root, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`materialization failed: ${result.stderr}`);
  }
  assert.equal(verifyMaterializedBundle(bundle).bundle_fingerprint,
    manifest.bundle_fingerprint, "materialized bundle differs from freeze");
  const tasks = new Map(corpus.tasks.filter((task) => task.split === "evaluation").map((task) => [task.id, task]));
  const receipts = [];
  for (const scheduled of manifest.schedule) {
    const task = tasks.get(scheduled.task_id); assert(task);
    const receiptPath = path.join(campaignRoot, "receipts", task.id, `${scheduled.arm}.json`);
    const startedPath = path.join(campaignRoot, "started", task.id, `${scheduled.arm}.json`);
    if (fs.existsSync(receiptPath)) {
      receipts.push(validateReceipt(readJson(receiptPath), { dataset: "evaluation", taskId: task.id,
        arm: scheduled.arm, evidenceBinding: manifest.manifest_fingerprint }));
      continue;
    }
    if (fs.existsSync(startedPath)) throw new Error(`${task.id}/${scheduled.arm} is ambiguous after process start; refusing a retry`);
    writeJson(startedPath, { schema_version: 1, task_id: task.id, arm: scheduled.arm,
      manifest_fingerprint: manifest.manifest_fingerprint, started_at: new Date().toISOString() });
    process.stdout.write(`${JSON.stringify({ event: "attempt_started", task_id: task.id, arm: scheduled.arm })}\n`);
    const receipt = await executeAttempt({ task, arm: scheduled.arm, campaignRoot, opencode: opencodePath,
      timeoutMs: manifest.timeout_ms, authContent, bundle, dataset: "evaluation",
      evidenceBinding: manifest.manifest_fingerprint });
    validateReceipt(receipt, { dataset: "evaluation", taskId: task.id, arm: scheduled.arm,
      evidenceBinding: manifest.manifest_fingerprint });
    writeJson(receiptPath, receipt); receipts.push(receipt);
    process.stdout.write(`${JSON.stringify({ event: "attempt_completed", task_id: task.id, arm: scheduled.arm,
      scored_outcome: receipt.scored_outcome, task_success: receipt.task_success,
      remediation_invoked: receipt.remediation_invoked, remediation_recovered: receipt.remediation_recovered })}\n`);
    if (!receipt.scored_outcome) throw new Error(`${task.id}/${scheduled.arm} ended without a scored outcome; no retry was attempted`);
  }
  const summary = measurementSummary(receipts, manifest);
  writeJson(path.join(campaignRoot, "measurement-summary.json"), summary);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

if (process.argv[1] !== undefined
  && pathToFileURL(fs.realpathSync.native(path.resolve(process.argv[1]))).href === import.meta.url) await main();
