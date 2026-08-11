import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadSyntheticContracts } from "../lib/benchmark/contracts.mjs";

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
  assert.match(
    manualWorkflow,
    /OPENCODE_BENCH_MODEL: \$\{\{ secrets\.OPENCODE_BENCH_MODEL \}\}/u,
  );
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
  assert.match(manualWorkflow, /npm ci/u);
  assert.match(manualWorkflow, /npm run bench:synthetic:validate/u);
  assert.match(manualWorkflow, /npm run bench:synthetic:self-test/u);
  assert.match(manualWorkflow, /npm run bench:synthetic -- \\/u);
  assert.match(manualWorkflow, /micro\|smoke\) semantic_variants=1; trajectory_repetitions=1/u);
  assert.match(manualWorkflow, /standard\) semantic_variants=3; trajectory_repetitions=2/u);
  assert.match(manualWorkflow, /full\) semantic_variants=5; trajectory_repetitions=2/u);
  assert.match(manualWorkflow, /--semantic-variants "\$semantic_variants"/u);
  assert.match(manualWorkflow, /--trajectory-repetitions "\$trajectory_repetitions"/u);
  assert.equal(manualWorkflow.includes("--repetitions"), false);
  assert.match(manualWorkflow, /npm run bench:synthetic:compare -- --report "\$report_path"/u);
  assert.match(manualWorkflow, /if: success\(\)/u);
  assert.match(manualWorkflow, /path: evals\/reports\/synthetic/u);
  assert.match(
    manualWorkflow,
    /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/u,
  );
  assert(
    manualWorkflow.indexOf("npm run bench:synthetic:compare")
      < manualWorkflow.indexOf("Upload validated synthetic artifacts"),
  );
  for (const bypass of ["continue-on-error:", "|| true", "exit 0"]) {
    assert.equal(manualWorkflow.includes(bypass), false);
  }

  for (const modelBackedNeedle of [
    "bench:synthetic --",
    "OPENCODE_BENCH_MODEL",
    "opencode-benchmark",
  ]) {
    assert.equal(defaultWorkflow.includes(modelBackedNeedle), false);
  }
}

if (
  process.argv[1]
    && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  verifyBenchmarkCi();
  process.stdout.write("Synthetic benchmark CI boundary verified.\n");
}
