import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateBenchmarkV3Corpus } from "../lib/benchmark/v3-corpus.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const semanticRuntimeRoot = process.env.BENCHMARK_V3_ESLINT_RUNTIME_ROOT ?? null;
console.log(JSON.stringify({
  ...validateBenchmarkV3Corpus(root, {
    executeOracles: semanticRuntimeRoot !== null,
    semanticRuntimeRoot,
  }),
  evidence_class: "model-free-corpus-verification",
  model_execution: false,
}, null, 2));
