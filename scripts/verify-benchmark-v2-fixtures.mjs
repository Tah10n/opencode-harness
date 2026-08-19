import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadBenchmarkV2Contracts, validateLoadedBenchmarkV2Contracts } from "../lib/benchmark/v2-contracts.mjs";
import {
  renderBenchmarkV2DevelopmentCorpus,
  renderBenchmarkV2ValidationCorpus,
  validateBenchmarkV2DevelopmentCorpus,
  validateBenchmarkV2ValidationCorpus,
} from "../lib/benchmark/v2-fixtures.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contracts = loadBenchmarkV2Contracts(root);
const contractReport = validateLoadedBenchmarkV2Contracts(root);
assert.equal(contractReport.execution_status, "development-and-validation-executable");

const first = renderBenchmarkV2DevelopmentCorpus({
  repositoryRoot: root,
  manifest: contracts.dev,
  bindings: contracts.devBindings,
  seed: "benchmark-v2-development-fixture-verifier",
  repetition: 1,
});
const second = renderBenchmarkV2DevelopmentCorpus({
  repositoryRoot: root,
  manifest: contracts.dev,
  bindings: contracts.devBindings,
  seed: "benchmark-v2-development-fixture-verifier",
  repetition: 1,
});
const summary = validateBenchmarkV2DevelopmentCorpus(first);
assert.deepEqual(first, second);
assert.deepEqual(summary.counts, { small: 12, medium: 12, high: 12 });
assert.equal(summary.medium_multifile_count, 6);

const validation = renderBenchmarkV2ValidationCorpus({
  repositoryRoot: root,
  manifest: contracts.validation,
  bindings: contracts.validationBindings,
  seed: "benchmark-v2-validation-fixture-verifier",
  repetition: 1,
});
const validationSummary = validateBenchmarkV2ValidationCorpus(validation);
assert.deepEqual(validationSummary.counts, { small: 10, medium: 10, high: 10 });
assert.equal(validationSummary.medium_multifile_count, 5);

for (const instance of [...first, ...validation]) {
  assert.equal(instance.prompt.includes("reference solution"), false);
  assert.equal(instance.public_files.length <= 20, true);
  assert.equal(instance.hidden_files.every((file) => ["test/", "hidden/"].some((prefix) => file.path.startsWith(prefix))), true);
  if (instance.solution_files.length === 2) {
    assert.match(instance.prompt, /config\/feature\.json/u);
    assert.match(instance.prompt, /At most 2 files may change/u);
    assert.doesNotMatch(instance.prompt, /At most 1 file may change/u);
  }
}

const executionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-v2-fixtures-"));
try {
  for (const instance of [...first, ...validation]) {
    const fixtureRoot = path.join(executionRoot, instance.family_id);
    for (const file of [...instance.public_files, ...instance.solution_files, ...instance.hidden_files]) {
      const target = path.join(fixtureRoot, ...file.path.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.content, "utf8");
    }
    for (const check of [instance.visible_check, instance.hidden_check, ...(instance.consumer_checks ?? []).map((entry) => entry.check)]) {
      const execution = spawnSync(check.argv[0], check.argv.slice(1), {
        cwd: fixtureRoot,
        encoding: "utf8",
        timeout: check.timeout_ms,
        maxBuffer: 1024 * 1024,
      });
      assert.equal(execution.status, 0, `${instance.family_id} reference solution failed ${check.argv.join(" ")}\n${execution.stdout}\n${execution.stderr}`);
    }
  }
} finally {
  fs.rmSync(executionRoot, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({
  status: "passed",
  evidence_class: "model-free-fixture-validation",
  model_execution: false,
  ...summary,
  validation: validationSummary,
  development_fingerprints: first.map((instance) => instance.instance_fingerprint),
  validation_fingerprints: validation.map((instance) => instance.instance_fingerprint),
}, null, 2)}\n`);
