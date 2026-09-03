#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fingerprint, hash } from "./core-lite-calibrate.mjs";
import { buildFreezeManifest, counterbalancedSchedule } from "./core-lite-freeze.mjs";
import { exactOneSidedMcNemar, exactTwoSidedMcNemar, measurementSummary, pairedBootstrap } from "./core-lite-evaluate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpus = JSON.parse(fs.readFileSync(path.join(root, "benchmarks/core-lite/corpus.json"), "utf8"));
const checkerSha256 = hash(fs.readFileSync(path.join(root, "benchmarks/core-lite/check-task.mjs")));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "core-lite-evaluation-verifier-"));

try {
  const bundle = path.join(temporary, "bundle");
  const materialized = spawnSync(process.execPath, [path.join(root, "scripts/materialize-core-lite.mjs"),
    "--output", bundle], { cwd: root, encoding: "utf8" });
  assert.equal(materialized.status, 0, materialized.stderr);
  const bundleManifest = JSON.parse(materialized.stdout);
  const productSha = "0123456789abcdef0123456789abcdef01234567";
  const opencodePath = "/fixture/opencode"; const opencodeSha256 = `sha256:${"a".repeat(64)}`;
  const calibrationMetadata = { product_sha: productSha, model: "openai/gpt-5.6-luna", variant: "low",
    bundle_fingerprint: bundleManifest.bundle_fingerprint, timeout_ms: 300000, opencode_path: opencodePath,
    opencode_version: "1.18.26", opencode_sha256: opencodeSha256,
    metadata_fingerprint: `sha256:${"b".repeat(64)}` };
  const calibrationSummary = { calibration_acceptable: true, summary_fingerprint: `sha256:${"c".repeat(64)}` };
  const manifest = buildFreezeManifest({ corpus, checkerSha256, calibrationMetadata, calibrationSummary,
    bundleManifest, productSha, opencodePath, opencodeVersion: "1.18.26", opencodeSha256, timeoutMs: 300000 });
  assert.equal(manifest.evaluation_task_count, 30);
  assert.equal(manifest.schedule.length, 60);
  assert.equal(manifest.statistics.bootstrap_resamples, 100000);
  assert.equal(manifest.statistics.one_sided_direction, "core-lite>plain");
  assert.equal(manifest.manifest_fingerprint, fingerprint(Object.fromEntries(Object.entries(manifest)
    .filter(([key]) => key !== "manifest_fingerprint"))));
  assert.deepEqual(manifest.schedule, counterbalancedSchedule(corpus.tasks.filter((task) => task.split === "evaluation")));
  for (const stratum of ["small", "medium", "high"]) {
    const first = manifest.schedule.filter((entry) => entry.stratum === stratum && entry.within_pair_order === 1);
    assert.equal(first.filter((entry) => entry.arm === "plain").length, 5);
    assert.equal(first.filter((entry) => entry.arm === "core-lite").length, 5);
  }

  assert.equal(exactOneSidedMcNemar(6, 0), 0.015625);
  assert.equal(exactTwoSidedMcNemar(6, 0), 0.03125);
  assert.equal(exactOneSidedMcNemar(0, 0), 1);
  assert.deepEqual(pairedBootstrap([{ plain: false, core: true }], 100, 7),
    { lower: 100, upper: 100, resamples: 100, seed: 7, method: "paired-task-resampling-with-replacement" });

  function receipts(plainSuccesses, coreSuccesses, coreOnlyStart = null) {
    const rows = [];
    manifest.task_bindings.forEach((binding, index) => {
      for (const arm of ["plain", "core-lite"]) {
        const success = index < (arm === "plain" ? plainSuccesses : coreSuccesses);
        rows.push({ task_id: binding.task_id, stratum: binding.stratum, arm, scored_outcome: true,
          task_success: success, process_timed_out: false, mutation_scope: { valid: true },
          first_public_check_pass: success, final_public_check_pass: success, hidden_check: { passed: success },
          duration_ms: arm === "plain" ? 100 : 120, event_metrics: { turns: 1, tool_calls: arm === "plain" ? 1 : 2 },
          verification_activated: arm === "core-lite", remediation_invoked: arm === "core-lite" && index === coreOnlyStart,
          remediation_recovered: arm === "core-lite" && index === coreOnlyStart });
      }
    });
    return rows;
  }

  const effective = measurementSummary(receipts(10, 16, 10), manifest);
  assert.equal(effective.decision, "CORE-LITE EFFECTIVE");
  assert.equal(effective.plain_successes, 10); assert.equal(effective.core_lite_successes, 16);
  assert.equal(effective.absolute_delta_percentage_points, 20);
  assert.equal(effective.core_only_wins, 6); assert.equal(effective.plain_only_wins, 0);
  assert.equal(effective.exact_one_sided_mcnemar_p, 0.015625);
  assert(effective.paired_bootstrap_95_ci_percentage_points.lower > 0);
  assert.equal(measurementSummary(receipts(10, 10), manifest).decision, "NO PROVEN BENEFIT");
  assert.equal(measurementSummary(receipts(12, 10), manifest).decision, "CORE-LITE REGRESSES");

  for (const file of ["scripts/core-lite-freeze.mjs", "scripts/core-lite-evaluate.mjs"]) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    for (const forbidden of ["benchmarks/v3", "severity_oracle", "regression_free", "external holdout"]) {
      assert(!source.includes(forbidden), `${file} includes forbidden concept: ${forbidden}`);
    }
  }
  process.stdout.write(`${JSON.stringify({ status: "passed", gate: "core-lite-evaluation",
    evaluation_tasks: 30, scheduled_scored_calls: 60, bootstrap_resamples: 100000,
    decision_fixtures: ["CORE-LITE EFFECTIVE", "NO PROVEN BENEFIT", "CORE-LITE REGRESSES"],
    model_calls_during_verification: 0 })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
