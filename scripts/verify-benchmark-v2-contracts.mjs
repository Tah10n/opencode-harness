import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  exactMcNemarPower,
  loadBenchmarkV2Contracts,
  validateBenchmarkV2Contracts,
  validateLoadedBenchmarkV2Contracts,
} from "../lib/benchmark/v2-contracts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const report = validateLoadedBenchmarkV2Contracts(root);
assert.equal(report.status, "passed");
assert.deepEqual(report.family_totals, { development: 36, validation: 30, holdout_planned: 90 });
assert.equal(report.paired_holdout_observations, 180);
assert(report.exact_power > 0.86);
assert(report.clustered_sensitivity_power > 0.82);

const loaded = loadBenchmarkV2Contracts(root);
assert.throws(() => validateBenchmarkV2Contracts({
  ...loaded,
  selectedHoldoutExists: true,
}), /BENCHMARK_V2_HOLDOUT/u);

const validationOverlap = structuredClone(loaded.validation);
validationOverlap.families[0].recipe_id = loaded.dev.families[0].recipe_id;
assert.throws(() => validateBenchmarkV2Contracts({
  ...loaded,
  validation: validationOverlap,
}), /BENCHMARK_V2_SPLIT_OVERLAP/u);

const weakenedPolicy = structuredClone(loaded.policy);
weakenedPolicy.activation_guardrails.eligible_mechanism_activation_minimum = 0.90;
assert.throws(() => validateBenchmarkV2Contracts({
  ...loaded,
  policy: weakenedPolicy,
}), /BENCHMARK_V2_POLICY/u);

const underpowered = exactMcNemarPower({
  pair_count: 120,
  candidate_only_probability: 0.10,
  baseline_only_probability: 0.02,
  alpha: 0.025,
});
assert(underpowered < 0.80);

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
