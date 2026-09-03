#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MODEL, VARIANT, canonical, fingerprint, hash, readJson, writeJson } from "./core-lite-calibrate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpusPath = path.join(root, "benchmarks/core-lite/corpus.json");
const checkerPath = path.join(root, "benchmarks/core-lite/check-task.mjs");
const materializerPath = path.join(root, "scripts/materialize-core-lite.mjs");

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

export function taskBinding(task, checkerSha256) {
  const fileBytes = task.files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0);
  return { task_id: task.id, stratum: task.stratum,
    visible_requirement_bytes: Buffer.byteLength(task.visible_requirement), workspace_file_bytes: fileBytes,
    workspace_files_fingerprint: fingerprint(task.files), task_fingerprint: fingerprint(task),
    public_oracle_fingerprint: fingerprint({ checker_sha256: checkerSha256, task_id: task.id, cases: task.public_cases }),
    hidden_oracle_fingerprint: fingerprint({ checker_sha256: checkerSha256, task_id: task.id, cases: task.hidden_cases }),
    reference_fingerprint: fingerprint(task.reference_files), alternative_fingerprint: fingerprint(task.alternative_files) };
}

export function counterbalancedSchedule(tasks) {
  const schedule = [];
  for (const stratum of ["small", "medium", "high"]) {
    const rows = tasks.filter((task) => task.stratum === stratum).sort((a, b) => a.id.localeCompare(b.id));
    assert.equal(rows.length, 10);
    rows.forEach((task, index) => {
      const arms = index % 2 === 0 ? ["plain", "core-lite"] : ["core-lite", "plain"];
      arms.forEach((arm, order) => schedule.push({ task_id: task.id, stratum, arm, within_pair_order: order + 1 }));
    });
  }
  return schedule;
}

export function buildFreezeManifest({ corpus, checkerSha256, calibrationMetadata, calibrationSummary,
  bundleManifest, productSha, opencodePath, opencodeVersion, opencodeSha256, timeoutMs }) {
  const tasks = corpus.tasks.filter((task) => task.split === "evaluation");
  assert.equal(tasks.length, 30);
  assert.equal(calibrationSummary.calibration_acceptable, true, "development calibration is not acceptable");
  assert.equal(calibrationMetadata.product_sha, productSha, "candidate changed after development calibration");
  assert.equal(calibrationMetadata.model, MODEL);
  assert.equal(calibrationMetadata.variant, VARIANT);
  assert.equal(calibrationMetadata.bundle_fingerprint, bundleManifest.bundle_fingerprint);
  assert.equal(calibrationMetadata.timeout_ms, timeoutMs);
  assert.equal(calibrationMetadata.opencode_path, opencodePath);
  assert.equal(calibrationMetadata.opencode_version, opencodeVersion);
  assert.equal(calibrationMetadata.opencode_sha256, opencodeSha256);
  const schedule = counterbalancedSchedule(tasks);
  const taskBindings = tasks.sort((a, b) => a.id.localeCompare(b.id)).map((task) => taskBinding(task, checkerSha256));
  const base = { schema_version: 1, measurement_id: "core-lite-paired-ab-v1", product_sha: productSha,
    corpus_id: corpus.corpus_id, corpus_sha256: hash(fs.readFileSync(corpusPath)), checker_sha256: checkerSha256,
    bundle_fingerprint: bundleManifest.bundle_fingerprint, bundle_file_count: bundleManifest.file_count,
    bundle_total_bytes: bundleManifest.total_bytes, provider: "openai", model: "gpt-5.6-luna",
    model_binding: MODEL, variant: VARIANT, opencode_path: opencodePath,
    opencode_version: opencodeVersion, opencode_sha256: opencodeSha256, timeout_ms: timeoutMs,
    evaluation_task_count: 30, task_bindings: taskBindings, schedule,
    permissions: { auto_approve_local_tools: true, external_directory: "deny", question: "deny",
      delegation: "deny", webfetch: "deny", websearch: "deny" },
    retry_policy: { maximum_retries_per_arm: 1,
      eligible_only_for: "proven_host_or_provider_failure_before_scored_outcome",
      timeout_bad_solution_failed_test_and_scored_outcome_retry: "forbidden",
      unproven_provider_submission_state: "stop_incomplete_without_retry" },
    statistics: { primary_metric: "task_success", bootstrap_resamples: 100000,
      bootstrap_method: "paired-task-resampling-with-replacement", bootstrap_prng: "xorshift32",
      bootstrap_interval: "percentile-95-floor-lower-ceil-upper", one_sided_direction: "core-lite>plain",
      mcnemar_method: "exact-binomial", effective_minimum_delta_percentage_points: 15,
      effective_minimum_core_only_minus_plain_only: 5, timeout_guardrail_percentage_points: 5,
      operational_regression_margin_percentage_points: 5 } };
  const seedSourceFingerprint = fingerprint(base);
  const body = { ...base, statistics: { ...base.statistics,
    bootstrap_seed_fingerprint: seedSourceFingerprint,
    bootstrap_seed_uint32: Number.parseInt(seedSourceFingerprint.slice("sha256:".length, "sha256:".length + 8), 16) || 1 },
    calibration_metadata_fingerprint: calibrationMetadata.metadata_fingerprint,
    calibration_summary_fingerprint: calibrationSummary.summary_fingerprint };
  return { ...body, manifest_fingerprint: fingerprint(body) };
}

async function main() {
  const calibrationRoot = path.resolve(option("--calibration-root") ?? "");
  const output = path.resolve(option("--output", path.join(root, "benchmarks/core-lite/evaluation-manifest.json")));
  if (option("--calibration-root") === null) throw new Error("--calibration-root is required");
  if (fs.existsSync(output)) throw new Error(`freeze output already exists: ${output}`);
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  if (status.status !== 0 || status.stdout !== "") throw new Error("freeze requires a clean source worktree");
  const productSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
  const calibrationMetadata = readJson(path.join(calibrationRoot, "calibration-metadata.json"));
  const calibrationSummary = readJson(path.join(calibrationRoot, "calibration-summary.json"));
  const corpus = readJson(corpusPath);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "core-lite-freeze-"));
  try {
    const bundle = path.join(temporary, "bundle");
    const materialized = spawnSync(process.execPath, [materializerPath, "--output", bundle], { cwd: root, encoding: "utf8" });
    if (materialized.status !== 0) throw new Error(`materialization failed: ${materialized.stderr}`);
    const bundleManifest = JSON.parse(materialized.stdout);
    const opencodePath = fs.realpathSync.native(calibrationMetadata.opencode_path);
    const opencodeVersionResult = spawnSync(opencodePath, ["--version"], { encoding: "utf8" });
    if (opencodeVersionResult.status !== 0) throw new Error("OpenCode version probe failed");
    const manifest = buildFreezeManifest({ corpus, checkerSha256: hash(fs.readFileSync(checkerPath)),
      calibrationMetadata, calibrationSummary, bundleManifest, productSha, opencodePath,
      opencodeVersion: opencodeVersionResult.stdout.trim(), opencodeSha256: hash(fs.readFileSync(opencodePath)),
      timeoutMs: calibrationMetadata.timeout_ms });
    writeJson(output, manifest, 0o644);
    process.stdout.write(`${JSON.stringify({ output, manifest_fingerprint: manifest.manifest_fingerprint,
      product_sha: manifest.product_sha, evaluation_tasks: manifest.evaluation_task_count,
      scheduled_scored_calls: manifest.schedule.length, bootstrap_seed: manifest.statistics.bootstrap_seed_uint32 })}\n`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined
  && pathToFileURL(fs.realpathSync.native(path.resolve(process.argv[1]))).href === import.meta.url) await main();
