export const SYNTHETIC_MODEL_FREE_ENVIRONMENT_MARKER = "OPENCODE_BENCH_MODEL_FREE";

export const SYNTHETIC_MODEL_FREE_FORBIDDEN_ENVIRONMENT_KEYS = Object.freeze([
  "OPENCODE_BENCH_MODEL",
  "OPENCODE_BENCH_PROVIDER",
  "OPENCODE_BENCH_VARIANT",
]);

export const DEFAULT_MODEL_FREE_CHECKS = Object.freeze([
  Object.freeze({
    id: "benchmark-model-free-contract",
    script: "scripts/verify-benchmark-model-free-contract.mjs",
  }),
  Object.freeze({
    id: "benchmark-evaluation-contracts",
    script: "scripts/verify-benchmark-evaluation-contracts.mjs",
  }),
  Object.freeze({ id: "benchmark-renderer", script: "scripts/verify-benchmark-renderer.mjs" }),
  Object.freeze({ id: "benchmark-isolation", script: "scripts/verify-benchmark-isolation.mjs" }),
  Object.freeze({ id: "benchmark-adapter", script: "scripts/verify-benchmark-adapter.mjs" }),
  Object.freeze({ id: "benchmark-runner", script: "scripts/verify-benchmark-runner.mjs" }),
  Object.freeze({ id: "benchmark-reporting", script: "scripts/verify-benchmark-reporting.mjs" }),
  Object.freeze({ id: "benchmark-statistics", script: "scripts/verify-benchmark-statistics.mjs" }),
  Object.freeze({
    id: "benchmark-comparison-reporting",
    script: "scripts/verify-benchmark-comparison-reporting.mjs",
  }),
  Object.freeze({ id: "benchmark-cli", script: "scripts/verify-benchmark-cli.mjs" }),
  Object.freeze({ id: "benchmark-ci", script: "scripts/verify-benchmark-ci.mjs" }),
]);

export const MODEL_FREE_CHECK_TIMEOUT_MS = 300_000;
export const MODEL_FREE_CHECK_COUNT = DEFAULT_MODEL_FREE_CHECKS.length;
export const MODEL_FREE_AGGREGATE_OVERHEAD_MS = 60_000;
export const MODEL_FREE_AGGREGATE_TIMEOUT_CEILING_MS = 2 * 60 * 60 * 1000;

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

export function modelFreeAggregateStageTimeoutMs({
  checkTimeoutMs = MODEL_FREE_CHECK_TIMEOUT_MS,
  checkCount = MODEL_FREE_CHECK_COUNT,
  overheadMs = MODEL_FREE_AGGREGATE_OVERHEAD_MS,
} = {}) {
  positiveSafeInteger(checkTimeoutMs, "model-free check timeout");
  positiveSafeInteger(checkCount, "model-free check count");
  positiveSafeInteger(overheadMs, "model-free aggregate overhead");
  const serialInnerBudgetMs = checkTimeoutMs * checkCount;
  const aggregateTimeoutMs = serialInnerBudgetMs + overheadMs;
  if (!Number.isSafeInteger(serialInnerBudgetMs)
    || !Number.isSafeInteger(aggregateTimeoutMs)
    || aggregateTimeoutMs > MODEL_FREE_AGGREGATE_TIMEOUT_CEILING_MS) {
    throw new TypeError(
      `model-free aggregate timeout exceeds the reviewed ${MODEL_FREE_AGGREGATE_TIMEOUT_CEILING_MS} ms ceiling`,
    );
  }
  return aggregateTimeoutMs;
}

export const MODEL_FREE_SERIAL_INNER_BUDGET_MS =
  MODEL_FREE_CHECK_TIMEOUT_MS * MODEL_FREE_CHECK_COUNT;
export const MODEL_FREE_AGGREGATE_STAGE_TIMEOUT_MS = modelFreeAggregateStageTimeoutMs();
