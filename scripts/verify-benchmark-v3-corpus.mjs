import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureBenchmarkV3Workspace, evaluateBenchmarkV3Workspace,
  validateBenchmarkV3Corpus } from "../lib/benchmark/v3-corpus.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const semanticRuntimeRoot = process.env.BENCHMARK_V3_ESLINT_RUNTIME_ROOT ?? null;

const cleanupSensorRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "benchmark-v3-cleanup-sensor-"));
try {
  const workspace = path.join(cleanupSensorRoot, "workspace");
  const runtimeRoot = path.join(cleanupSensorRoot, "runtime");
  const runtimeKey = "eslint-v10";
  const nodeModules = path.join(runtimeRoot, runtimeKey, "node_modules");
  const mocha = path.join(nodeModules, "mocha", "bin", "mocha.js");
  const sentinel = path.join(nodeModules, "runtime-sentinel");
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(path.dirname(mocha), { recursive: true });
  fs.writeFileSync(mocha, 'console.log(JSON.stringify({ stats: { tests: 1, passes: 1, failures: 0, pending: 0 } }));\n', "utf8");
  fs.writeFileSync(sentinel, "preserved\n", "utf8");
  const result = evaluateBenchmarkV3Workspace(workspace, {
    runtime_key: runtimeKey,
    hidden_test_files: [{ path: "test/hidden.js", content: "// cleanup sensor\n" }],
    test_argv: [],
    allowed_mutation_paths: [],
    defect_severity: "high",
  }, {
    beforeSnapshot: captureBenchmarkV3Workspace(workspace),
    semanticRuntimeRoot: runtimeRoot,
    expectedRuntimeKeyFingerprint: `sha256:${"0".repeat(64)}`,
    revalidateRuntimeKey: false,
  });
  assert.equal(result.passed, true, "cleanup sensor oracle must pass");
  assert.equal(fs.existsSync(path.join(workspace, "node_modules")), false,
    "cleanup must remove the workspace node_modules symlink");
  assert.equal(fs.readFileSync(sentinel, "utf8"), "preserved\n",
    "cleanup must preserve the semantic runtime target");
  assert.equal(fs.existsSync(path.join(workspace, "test", "hidden.js")), false,
    "cleanup must remove staged hidden tests");
} finally {
  fs.rmSync(cleanupSensorRoot, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ...validateBenchmarkV3Corpus(root, {
    executeOracles: semanticRuntimeRoot !== null,
    semanticRuntimeRoot,
  }),
  evidence_class: "model-free-corpus-verification",
  model_execution: false,
}, null, 2));
