#!/usr/bin/env node
import path from "node:path";
import { runBenchmarkV3Holdout } from "../lib/benchmark/v3-runner.mjs";

const values = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index]; const value = process.argv[index + 1];
  if (!key?.startsWith("--") || value === undefined || values.has(key.slice(2))) {
    throw new Error("benchmark v3 holdout arguments must be unique --name value pairs");
  }
  values.set(key.slice(2), value);
}
const required = ["semantic-runtime", "output", "external-manifest", "opencode", "candidate-source", "candidate-bundle",
  "process-receipt", "namespace-receipt", "egress-receipt"];
for (const name of required) if (!values.has(name)) throw new Error(`--${name} is required`);
const result = await runBenchmarkV3Holdout({
  sourceRoot: path.resolve(values.get("source-root") ?? process.cwd()),
  semanticRuntimeRoot: path.resolve(values.get("semantic-runtime")),
  outputDirectory: path.resolve(values.get("output")),
  externalManifestPath: path.resolve(values.get("external-manifest")),
  opencodeExecutable: path.resolve(values.get("opencode")),
  candidateSourceRoot: path.resolve(values.get("candidate-source")),
  candidateBundle: path.resolve(values.get("candidate-bundle")),
  readinessReceiptPaths: {
    "real-process-containment": path.resolve(values.get("process-receipt")),
    "hidden-namespace-isolation": path.resolve(values.get("namespace-receipt")),
    "provider-only-egress": path.resolve(values.get("egress-receipt")),
  },
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
