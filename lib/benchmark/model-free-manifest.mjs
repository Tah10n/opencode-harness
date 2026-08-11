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
