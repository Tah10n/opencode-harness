#!/usr/bin/env node
import path from "node:path";
import process from "node:process";

import { runBenchmarkV3ModelFreeGate, runBenchmarkV3Study } from "../lib/benchmark/v3-runner.mjs";

const values = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || value === undefined) throw new Error("benchmark v3 arguments must be --name value pairs");
  const name = key.slice(2);
  values.set(name, [...(values.get(name) ?? []), value]);
}
const one = (name, { fallback = null } = {}) => {
  const entries = values.get(name) ?? [];
  if (entries.length === 0 && fallback !== null) return fallback;
  if (entries.length !== 1) throw new Error(`exactly one --${name} is required`);
  return entries[0];
};
const sourceRoot = path.resolve(one("source-root", { fallback: process.cwd() }));
const candidateSources = values.get("candidate-source") ?? [];
const candidateBundles = values.get("candidate-bundle") ?? [];
if (candidateSources.length !== 1 || candidateBundles.length !== 1) {
  throw new Error("provide exactly one paired --candidate-source and --candidate-bundle argument");
}
const reviewReceiptPaths = values.get("review-receipt") ?? [];
if (reviewReceiptPaths.length !== 2) throw new Error("exactly two --review-receipt arguments are required");
const gate = runBenchmarkV3ModelFreeGate({
  sourceRoot,
  semanticRuntimeRoot: path.resolve(one("semantic-runtime")),
  opencodeExecutable: path.resolve(one("opencode")),
  candidateBundles: candidateSources.map((entry, index) => ({ sourceRoot: path.resolve(entry), materializedCoreDirectory: path.resolve(candidateBundles[index]) })),
  reviewReceiptPaths: reviewReceiptPaths.map((entry) => path.resolve(entry)),
});
const result = await runBenchmarkV3Study({
  gate,
  semanticRuntimeRoot: path.resolve(one("semantic-runtime")),
  outputDirectory: path.resolve(one("output")),
  model: one("model"),
  provider: one("provider"),
  variant: one("variant"),
  corpusGenerationSeed: values.has("corpus-generation-seed") ? one("corpus-generation-seed") : null,
  modelSamplingSeed: values.has("model-sampling-seed") ? one("model-sampling-seed") : null,
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
