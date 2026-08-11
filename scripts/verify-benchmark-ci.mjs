import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadSyntheticContracts } from "../lib/benchmark/contracts.mjs";
import {
  SYNTHETIC_MERGE_JOB_TIMEOUT_MINUTES,
  SYNTHETIC_MODEL_JOB_TIMEOUT_MINUTES,
} from "../lib/benchmark/workflow-budget.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8").replace(/^\uFEFF/u, "");
}

export function verifyBenchmarkCi({ root = defaultRoot } = {}) {
  const contracts = loadSyntheticContracts(root);
  const defaultWorkflow = read(root, ".github/workflows/verify.yml");
  const manualWorkflow = read(root, ".github/workflows/synthetic-benchmark.yml");
  const eventStart = manualWorkflow.indexOf("on:");
  const permissionsStart = manualWorkflow.indexOf("\npermissions:");
  assert(eventStart >= 0 && permissionsStart > eventStart);
  const eventBlock = manualWorkflow.slice(eventStart, permissionsStart);

  assert.match(eventBlock, /^\s*on:\s*\r?\n\s{2}workflow_dispatch:\s*$/mu);
  for (const forbiddenEvent of ["push:", "pull_request:", "schedule:", "repository_dispatch:"]) {
    assert.equal(eventBlock.includes(forbiddenEvent), false);
  }
  assert.match(manualWorkflow, /runs-on: \[self-hosted, opencode-benchmark\]/u);
  assert.match(manualWorkflow, /environment: synthetic-benchmark/u);
  assert.match(manualWorkflow, /permissions:\s*\r?\n\s{2}contents: read/u);
  assert.match(manualWorkflow, /OPENCODE_BENCH_MODEL: \$\{\{ secrets\.OPENCODE_BENCH_MODEL \}\}/u);
  assert.equal(/^\s{6}model:\s*$/mu.test(manualWorkflow), false);
  assert.match(manualWorkflow, /default: smoke/u);
  const suiteChoices = manualWorkflow.slice(
    manualWorkflow.indexOf("      suite:"),
    manualWorkflow.indexOf("      baseline:"),
  );
  const baselineChoices = manualWorkflow.slice(
    manualWorkflow.indexOf("      baseline:"),
    manualWorkflow.indexOf("      candidate:"),
  );
  const candidateChoices = manualWorkflow.slice(
    manualWorkflow.indexOf("      candidate:"),
    manualWorkflow.indexOf("      seed:"),
  );
  const profileIds = contracts.inventory.profiles.map((entry) => entry.id);
  for (const profileId of profileIds) {
    assert(baselineChoices.includes(`          - ${profileId}`));
    assert(candidateChoices.includes(`          - ${profileId}`));
  }
  for (const suite of contracts.suites) {
    assert(suiteChoices.includes(`          - ${suite.id}`));
    assert.deepEqual(
      suite.profile_ids,
      suite.id === "micro" ? ["plain", "instrumented"] : profileIds,
    );
  }

  for (const command of [
    "npm ci",
    "npm run bench:synthetic:validate",
    "npm run bench:synthetic:self-test",
    "npm run --silent bench:synthetic:prepare --",
    "npm run --silent bench:synthetic:shard --",
    "npm run --silent bench:synthetic:merge --",
    "npm run bench:synthetic:shard:validate --",
    "npm run bench:synthetic:compare -- --report \"$report_path\"",
  ]) {
    assert(manualWorkflow.includes(command), `manual workflow is missing ${command}`);
  }
  assert.match(manualWorkflow, /family_matrix=\$\{JSON\.stringify\(value\.matrix\)\}/u);
  assert.match(manualWorkflow, /matrix: \$\{\{ fromJSON\(needs\.prepare\.outputs\.family_matrix\) \}\}/u);
  assert.match(manualWorkflow, /needs\.prepare\.outputs\.execution_mode == 'single-job'/u);
  assert.match(manualWorkflow, /needs\.prepare\.outputs\.execution_mode == 'family-sharded'/u);
  for (const duplicatedDimension of ["semantic_variants=", "trajectory_repetitions=", "--semantic-variants", "--trajectory-repetitions"]) {
    assert.equal(manualWorkflow.includes(duplicatedDimension), false);
  }
  assert.equal(manualWorkflow.includes("if: success()"), false);
  assert.match(manualWorkflow, /if: always\(\)\s*\r?\n\s*shell: bash/u);
  assert.match(manualWorkflow, /if: always\(\) && steps\.validate\.outcome == 'success'/u);
  for (const restore of ["Restore benchmark exit status", "Restore shard exit status", "Restore merge exit status"]) {
    assert(manualWorkflow.includes(restore));
  }
  assert.match(manualWorkflow, /benchmark-synthetic-workflow-status\.mjs/u);
  assert.match(manualWorkflow, /path: evals\/reports\/synthetic/u);
  assert.match(manualWorkflow, /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/u);
  assert.match(manualWorkflow, /actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c/u);
  assert(
    manualWorkflow.indexOf("npm run bench:synthetic:shard:validate")
      < manualWorkflow.indexOf("Upload validated family artifact"),
  );
  assert(
    manualWorkflow.lastIndexOf("npm run bench:synthetic:compare")
      < manualWorkflow.indexOf("Upload validated merged artifacts"),
  );
  for (const bypass of ["continue-on-error:", "|| true", "exit 0"]) {
    assert.equal(manualWorkflow.includes(bypass), false);
  }
  assert.equal(
    (manualWorkflow.match(new RegExp(`timeout-minutes: ${SYNTHETIC_MODEL_JOB_TIMEOUT_MINUTES}`, "gu")) ?? []).length,
    2,
  );
  assert.match(manualWorkflow, new RegExp(`timeout-minutes: ${SYNTHETIC_MERGE_JOB_TIMEOUT_MINUTES}`, "u"));

  for (const modelBackedNeedle of ["bench:synthetic --", "OPENCODE_BENCH_MODEL", "opencode-benchmark"]) {
    assert.equal(defaultWorkflow.includes(modelBackedNeedle), false);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  verifyBenchmarkCi();
  process.stdout.write("Synthetic benchmark CI and sharding boundaries verified.\n");
}
