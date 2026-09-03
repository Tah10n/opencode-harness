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
const calibrationRunnerPath = path.join(root, "scripts/core-lite-calibrate.mjs");
const evaluationRunnerPath = path.join(root, "scripts/core-lite-evaluate.mjs");
const freezeRunnerPath = path.join(root, "scripts/core-lite-freeze.mjs");
const amendmentRelativePath = "research/core-lite-evidence/protocol-amendment.v1.json";
const amendmentPath = path.join(root, amendmentRelativePath);

export const FROZEN_CORE_LITE_BUNDLE_FINGERPRINT =
  "sha256:886a1d5b8fff98b65cdca724a509e4e890c6e583745ed6d2b898f9a5c001ad67";
export const FROZEN_EVALUATION_TASK_FINGERPRINT =
  "sha256:d02a6867a623c0ae01366758340eab7564323fcb515b4e184f47aefabe25311a";
export const EXPECTED_PROTOCOL_AMENDMENT = Object.freeze({
  reason: "development calibration is diagnostic and does not gate an untouched independent evaluation set",
  observed_development_result: Object.freeze({ plain: "9/10", core_lite: "9/10" }),
  candidate_changed: false,
  evaluation_tasks_changed: false,
  evaluation_outcomes_observed: false,
  decision_thresholds_changed: false,
  evaluation_authorized: true,
});

const candidatePaths = ["agents/core-lite.md", "profiles/core-lite/opencode.json", "runtime/core-lite.mjs",
  "scripts/materialize-core-lite.mjs"];
const evaluationPaths = ["benchmarks/core-lite/corpus.json", "benchmarks/core-lite/check-task.mjs"];

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

export function evaluationTaskFingerprint(corpus) {
  return fingerprint(corpus.tasks.filter((task) => task.split === "evaluation"));
}

export function evaluationEvidenceObserved(evaluationRoot) {
  if (!fs.existsSync(evaluationRoot)) return false;
  assert(fs.statSync(evaluationRoot).isDirectory(), "evaluation root is not a directory");
  return ["started", "receipts", "measurement-summary.json"].some((entry) =>
    fs.existsSync(path.join(evaluationRoot, entry)));
}

function validateFingerprintedObject(value, fingerprintKey, label) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} is invalid`);
  const body = { ...value }; delete body[fingerprintKey];
  assert.equal(value[fingerprintKey], fingerprint(body), `${label} fingerprint drifted`);
}

export function developmentCalibrationDiagnostics(summary) {
  const plain = summary.arms?.plain; const core = summary.arms?.["core-lite"];
  const campaignComplete = summary.schema_version === 1 && summary.dataset === "development"
    && summary.task_count === 10 && plain?.attempts === 10 && plain.scored === 10
    && core?.attempts === 10 && core.scored === 10;
  return { development_campaign_complete: campaignComplete,
    development_plain_success: `${plain?.successes}/10`,
    development_core_lite_success: `${core?.successes}/10`,
    development_set_ceiling_warning: plain?.successes > 8,
    remediation_invocations: summary.remediation_invocation_count,
    remediation_recoveries: summary.remediation_recovery_count };
}

export function assertEvaluationAuthorized({ corpus, calibrationMetadata, calibrationSummary, bundleManifest,
  candidateSha, runnerSha, exactHeadCi, protocolAmendment, evaluationOutcomesObserved }) {
  assert.deepEqual(protocolAmendment, EXPECTED_PROTOCOL_AMENDMENT, "protocol amendment drifted");
  validateFingerprintedObject(calibrationMetadata, "metadata_fingerprint", "calibration metadata");
  validateFingerprintedObject(calibrationSummary, "summary_fingerprint", "calibration summary");
  const diagnostics = developmentCalibrationDiagnostics(calibrationSummary);
  assert.equal(diagnostics.development_campaign_complete, true, "development campaign is incomplete");
  assert.equal(evaluationOutcomesObserved, false, "evaluation outcomes were already observed");
  assert.equal(candidateSha, calibrationMetadata.product_sha, "candidate SHA changed after development calibration");
  assert.equal(calibrationMetadata.bundle_fingerprint, FROZEN_CORE_LITE_BUNDLE_FINGERPRINT,
    "candidate fingerprint changed after development calibration");
  assert.equal(bundleManifest.bundle_fingerprint, FROZEN_CORE_LITE_BUNDLE_FINGERPRINT,
    "candidate fingerprint changed before evaluation freeze");
  assert.equal(evaluationTaskFingerprint(corpus), FROZEN_EVALUATION_TASK_FINGERPRINT,
    "evaluation-task fingerprint changed before evaluation freeze");
  assert.equal(calibrationMetadata.model, MODEL); assert.equal(calibrationMetadata.variant, VARIANT);
  assert.match(runnerSha, /^[0-9a-f]{40}$/u, "runner SHA is invalid");
  assert.equal(exactHeadCi?.head_sha, runnerSha, "CI did not run on the exact runner SHA");
  assert.equal(exactHeadCi?.conclusion, "success", "exact-head CI did not pass");
  assert.equal(typeof exactHeadCi?.run_id, "string"); assert(exactHeadCi.run_id.length > 0, "CI run ID is missing");
  return diagnostics;
}

export function buildFreezeManifest({ corpus, checkerSha256, calibrationMetadata, calibrationSummary,
  bundleManifest, candidateSha, runnerSha, opencodePath, opencodeVersion, opencodeSha256, timeoutMs,
  exactHeadCi, protocolAmendment, evaluationOutcomesObserved }) {
  const tasks = corpus.tasks.filter((task) => task.split === "evaluation");
  assert.equal(tasks.length, 30);
  const diagnostics = assertEvaluationAuthorized({ corpus, calibrationMetadata, calibrationSummary, bundleManifest,
    candidateSha, runnerSha, exactHeadCi, protocolAmendment, evaluationOutcomesObserved });
  assert.equal(calibrationMetadata.timeout_ms, timeoutMs);
  assert.equal(calibrationMetadata.opencode_path, opencodePath);
  assert.equal(calibrationMetadata.opencode_version, opencodeVersion);
  assert.equal(calibrationMetadata.opencode_sha256, opencodeSha256);
  const schedule = counterbalancedSchedule(tasks);
  const taskBindings = tasks.sort((a, b) => a.id.localeCompare(b.id)).map((task) => taskBinding(task, checkerSha256));
  const base = { schema_version: 1, measurement_id: "core-lite-paired-ab-v1", product_sha: candidateSha,
    candidate_sha: candidateSha, runner_sha: runnerSha, exact_head_ci: exactHeadCi,
    corpus_id: corpus.corpus_id, corpus_sha256: hash(fs.readFileSync(corpusPath)), checker_sha256: checkerSha256,
    evaluation_task_fingerprint: evaluationTaskFingerprint(corpus),
    bundle_fingerprint: bundleManifest.bundle_fingerprint, bundle_file_count: bundleManifest.file_count,
    bundle_total_bytes: bundleManifest.total_bytes, provider: "openai", model: "gpt-5.6-luna",
    model_binding: MODEL, variant: VARIANT, opencode_path: opencodePath,
    opencode_version: opencodeVersion, opencode_sha256: opencodeSha256, timeout_ms: timeoutMs,
    protocol_amendment: { path: amendmentRelativePath, fingerprint: fingerprint(protocolAmendment) },
    development_calibration: diagnostics, evaluation_outcomes_observed_before_freeze: false,
    runner_bindings: { calibration_sha256: hash(fs.readFileSync(calibrationRunnerPath)),
      evaluation_sha256: hash(fs.readFileSync(evaluationRunnerPath)),
      freeze_sha256: hash(fs.readFileSync(freezeRunnerPath)),
      materializer_sha256: hash(fs.readFileSync(materializerPath)) },
    evaluation_task_count: 30, task_bindings: taskBindings, schedule,
    permissions: { auto_approve_local_tools: true, external_directory: "deny", question: "deny",
      delegation: "deny", webfetch: "deny", websearch: "deny" },
    retry_policy: { maximum_retries_per_arm: 1,
      eligible_only_for: "proven_host_or_provider_failure_before_scored_outcome",
      timeout_bad_solution_failed_test_and_scored_outcome_retry: "forbidden",
      unproven_provider_submission_state: "stop_incomplete_without_retry" },
    scoring: { primary_metric: "task_success",
      required_for_both_arms: ["hidden_semantic_oracle_passed", "mutation_scope_valid",
        "model_process_completed", "no_timeout", "hidden_oracle_not_model_visible"],
      additionally_required_for_core_lite: "final_host_verification_passed",
      observed_metrics: ["first_public_check_pass", "remediation_invoked", "remediation_recovered",
        "final_public_check_pass", "hidden_semantic_success", "scope_violation", "timeout", "duration_ms",
        "turns", "tool_calls"] },
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
  const evaluationRoot = path.resolve(option("--evaluation-root") ?? "");
  const output = path.resolve(option("--output", path.join(root, "benchmarks/core-lite/evaluation-manifest.json")));
  const ciRunId = option("--ci-run-id"); const ciHeadSha = option("--ci-head-sha");
  if (option("--calibration-root") === null) throw new Error("--calibration-root is required");
  if (option("--evaluation-root") === null) throw new Error("--evaluation-root is required");
  if (ciRunId === null || ciHeadSha === null) throw new Error("--ci-run-id and --ci-head-sha are required");
  if (fs.existsSync(output)) throw new Error(`freeze output already exists: ${output}`);
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  if (status.status !== 0 || status.stdout !== "") throw new Error("freeze requires a clean source worktree");
  const runnerSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
  assert.equal(ciHeadSha, runnerSha, "provided CI head differs from the exact runner SHA");
  const calibrationMetadata = readJson(path.join(calibrationRoot, "calibration-metadata.json"));
  const calibrationSummary = readJson(path.join(calibrationRoot, "calibration-summary.json"));
  const candidateSha = calibrationMetadata.product_sha;
  for (const [paths, message] of [[candidatePaths, "candidate changed after development calibration"],
    [evaluationPaths, "evaluation corpus or oracle changed after development calibration"]]) {
    const diff = spawnSync("git", ["diff", "--quiet", candidateSha, "--", ...paths], { cwd: root });
    if (diff.status !== 0) throw new Error(message);
  }
  const corpus = readJson(corpusPath);
  const protocolAmendment = readJson(amendmentPath);
  const exactHeadCi = { run_id: String(ciRunId), head_sha: runnerSha, conclusion: "success" };
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
      calibrationMetadata, calibrationSummary, bundleManifest, candidateSha, runnerSha, opencodePath,
      opencodeVersion: opencodeVersionResult.stdout.trim(), opencodeSha256: hash(fs.readFileSync(opencodePath)),
      timeoutMs: calibrationMetadata.timeout_ms, exactHeadCi, protocolAmendment,
      evaluationOutcomesObserved: evaluationEvidenceObserved(evaluationRoot) });
    writeJson(output, manifest, 0o644);
    process.stdout.write(`${JSON.stringify({ output, manifest_fingerprint: manifest.manifest_fingerprint,
      candidate_sha: manifest.candidate_sha, runner_sha: manifest.runner_sha,
      evaluation_tasks: manifest.evaluation_task_count,
      scheduled_scored_calls: manifest.schedule.length, bootstrap_seed: manifest.statistics.bootstrap_seed_uint32 })}\n`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined
  && pathToFileURL(fs.realpathSync.native(path.resolve(process.argv[1]))).href === import.meta.url) await main();
