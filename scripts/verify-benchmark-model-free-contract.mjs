import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  DEFAULT_MODEL_FREE_CHECKS,
  MODEL_FREE_AGGREGATE_OVERHEAD_MS,
  MODEL_FREE_AGGREGATE_STAGE_TIMEOUT_MS,
  MODEL_FREE_AGGREGATE_TIMEOUT_CEILING_MS,
  MODEL_FREE_CHECK_COUNT,
  MODEL_FREE_CHECK_TIMEOUT_MS,
  MODEL_FREE_SERIAL_INNER_BUDGET_MS,
  SYNTHETIC_MODEL_FREE_ENVIRONMENT_MARKER,
  SYNTHETIC_MODEL_FREE_FORBIDDEN_ENVIRONMENT_KEYS,
  modelFreeAggregateStageTimeoutMs,
} from "../lib/benchmark/model-free-manifest.mjs";
import {
  DEFAULT_DETERMINISTIC_STAGE_TIMEOUT_MS,
  DETERMINISTIC_VERIFY_WORKFLOW_JOB_TIMEOUT_MS,
  DETERMINISTIC_STAGE_REGISTRY,
  MAX_DETERMINISTIC_VERIFY_BUDGET_MS,
  deterministicStageTimeoutMs,
} from "./verify-all.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(root, relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8").replace(/^\uFEFF/u, "");
}

export function verifyBenchmarkModelFreeContract({ root = defaultRoot } = {}) {
  const packageJson = JSON.parse(read(root, "package.json"));
  const expectedChecks = [
    ["benchmark-model-free-contract", "scripts/verify-benchmark-model-free-contract.mjs"],
    ["benchmark-evaluation-contracts", "scripts/verify-benchmark-evaluation-contracts.mjs"],
    ["benchmark-renderer", "scripts/verify-benchmark-renderer.mjs"],
    ["benchmark-isolation", "scripts/verify-benchmark-isolation.mjs"],
    ["benchmark-adapter", "scripts/verify-benchmark-adapter.mjs"],
    ["benchmark-runner", "scripts/verify-benchmark-runner.mjs"],
    ["benchmark-reporting", "scripts/verify-benchmark-reporting.mjs"],
    ["benchmark-statistics", "scripts/verify-benchmark-statistics.mjs"],
    ["benchmark-comparison-reporting", "scripts/verify-benchmark-comparison-reporting.mjs"],
    ["benchmark-cli", "scripts/verify-benchmark-cli.mjs"],
    ["benchmark-ci", "scripts/verify-benchmark-ci.mjs"],
  ];
  assert.deepEqual(DEFAULT_MODEL_FREE_CHECKS.map(({ id, script }) => [id, script]), expectedChecks);
  assert.equal(new Set(DEFAULT_MODEL_FREE_CHECKS.map((check) => check.id)).size, expectedChecks.length);
  assert.equal(new Set(DEFAULT_MODEL_FREE_CHECKS.map((check) => check.script)).size, expectedChecks.length);
  assert.equal(
    MODEL_FREE_CHECK_TIMEOUT_MS,
    300_000,
    "each model-free verifier needs finite headroom above the production runner regression duration",
  );
  assert.equal(MODEL_FREE_CHECK_COUNT, DEFAULT_MODEL_FREE_CHECKS.length);
  assert.equal(
    MODEL_FREE_SERIAL_INNER_BUDGET_MS,
    MODEL_FREE_CHECK_TIMEOUT_MS * DEFAULT_MODEL_FREE_CHECKS.length,
  );
  assert.equal(
    MODEL_FREE_AGGREGATE_STAGE_TIMEOUT_MS,
    MODEL_FREE_SERIAL_INNER_BUDGET_MS + MODEL_FREE_AGGREGATE_OVERHEAD_MS,
  );
  assert(MODEL_FREE_AGGREGATE_STAGE_TIMEOUT_MS >= MODEL_FREE_SERIAL_INNER_BUDGET_MS);
  assert(MODEL_FREE_AGGREGATE_STAGE_TIMEOUT_MS <= MODEL_FREE_AGGREGATE_TIMEOUT_CEILING_MS);
  assert.equal(
    modelFreeAggregateStageTimeoutMs({ checkCount: DEFAULT_MODEL_FREE_CHECKS.length + 1 }),
    MODEL_FREE_AGGREGATE_STAGE_TIMEOUT_MS + MODEL_FREE_CHECK_TIMEOUT_MS,
    "manifest cardinality must mechanically change the aggregate budget",
  );
  for (const { script } of DEFAULT_MODEL_FREE_CHECKS) {
    assert.equal(fs.statSync(path.join(root, ...script.split("/"))).isFile(), true, script);
  }
  assert.equal(
    packageJson.scripts?.["verify:benchmark:model-free"],
    "node scripts/verify-benchmark-model-free.mjs",
  );
  const aggregateSource = read(root, "scripts/verify-benchmark-model-free.mjs");
  assert.match(aggregateSource, /await runSyntheticModelFreeSelfTest\(\{ sourceRoot: root \}\)/u);
  assert.equal(
    [...aggregateSource.matchAll(/await runSyntheticModelFreeSelfTest\(/gu)].length,
    1,
    "the aggregate must execute the canonical self-test exactly once",
  );
  const aggregateStages = DETERMINISTIC_STAGE_REGISTRY.filter(
    (stage) => stage.npm_script === "verify:benchmark:model-free",
  );
  assert.equal(aggregateStages.length, 1, "model-free aggregate must occur exactly once in npm run verify");
  assert.deepEqual(aggregateStages[0].check_ids, []);
  assert.equal(
    deterministicStageTimeoutMs(aggregateStages[0]),
    MODEL_FREE_AGGREGATE_STAGE_TIMEOUT_MS,
  );
  assert.throws(() => deterministicStageTimeoutMs({
    ...aggregateStages[0],
    timeout_ms: MODEL_FREE_SERIAL_INNER_BUDGET_MS - 1,
  }));
  assert.throws(() => deterministicStageTimeoutMs({
    command_id: "ordinary",
    npm_script: "verify:static",
    check_ids: [],
    timeout_ms: MODEL_FREE_AGGREGATE_STAGE_TIMEOUT_MS,
  }));
  assert.equal(
    deterministicStageTimeoutMs({ npm_script: "verify:static" }),
    DEFAULT_DETERMINISTIC_STAGE_TIMEOUT_MS,
  );
  assert.equal(
    DETERMINISTIC_STAGE_REGISTRY.some(
      (stage) => stage.npm_script.startsWith("verify:benchmark:")
        && stage.npm_script !== "verify:benchmark:model-free",
    ),
    false,
    "individual benchmark verifiers must not also be deterministic stages",
  );
  const harnessSource = read(root, "scripts/verify-harness.mjs");
  assert.doesNotMatch(harnessSource, /from "\.\/verify-benchmark-(?:adapter|ci|cli|comparison-reporting|contracts|renderer|reporting|runner|statistics)\.mjs"/u);
  const selfTestSource = read(root, "lib/benchmark/self-test.mjs");
  const verifyAllSource = read(root, "scripts/verify-all.mjs");
  const verifyWorkflow = read(root, ".github/workflows/verify.yml");
  assert.match(selfTestSource, /checks = DEFAULT_MODEL_FREE_CHECKS/u);
  assert.match(selfTestSource, /for \(const check of normalizedChecks\)/u);
  assert.equal(selfTestSource.includes("300_000"), false, "self-test must not duplicate the timeout value");
  assert(selfTestSource.includes("MODEL_FREE_CHECK_TIMEOUT_MS"));
  assert(verifyAllSource.includes("MODEL_FREE_AGGREGATE_STAGE_TIMEOUT_MS"));
  assert(
    360 * 60 * 1000 === DETERMINISTIC_VERIFY_WORKFLOW_JOB_TIMEOUT_MS
      && DETERMINISTIC_VERIFY_WORKFLOW_JOB_TIMEOUT_MS > MAX_DETERMINISTIC_VERIFY_BUDGET_MS,
    "the explicit GitHub job limit must exceed the bounded full verify budget",
  );
  for (const job of ["verify", "macos-containment"]) {
    assert.match(
      verifyWorkflow,
      new RegExp(`^  ${job}:\\n(?:    .+\\n){0,4}    timeout-minutes: 360$`, "mu"),
      `${job} must retain an explicit six-hour job budget`,
    );
  }
  assert(selfTestSource.includes(`result[SYNTHETIC_MODEL_FREE_ENVIRONMENT_MARKER] = "1"`));
  for (const key of SYNTHETIC_MODEL_FREE_FORBIDDEN_ENVIRONMENT_KEYS) {
    assert(selfTestSource.includes("SYNTHETIC_MODEL_FREE_FORBIDDEN_ENVIRONMENT_KEYS"), key);
  }
  const adapterSource = read(root, "lib/benchmark/opencode-adapter.mjs");
  assert(adapterSource.includes(`sourceEnvironment.${SYNTHETIC_MODEL_FREE_ENVIRONMENT_MARKER} === "1"`));
  assert.match(
    adapterSource,
    /sourceEnvironment\.OPENCODE_BENCH_MODEL_FREE === "1"[\s\S]{0,160}executable === null[\s\S]{0,160}resolvedExecutableIdentity === undefined/u,
  );
  assert.equal(DEFAULT_MODEL_FREE_CHECKS.some(({ script }) => [
    "scripts/benchmark-synthetic.mjs",
    "scripts/benchmark-synthetic-replay.mjs",
    "scripts/verify-benchmark-model-free.mjs",
  ].includes(script)), false);
  return { check_count: expectedChecks.length, aggregate_stage_count: aggregateStages.length };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = verifyBenchmarkModelFreeContract();
  process.stdout.write(`Synthetic model-free manifest verified (${result.check_count} checks; exactly one aggregate stage).\n`);
}
