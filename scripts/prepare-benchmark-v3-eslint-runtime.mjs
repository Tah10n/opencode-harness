#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { discoverBenchmarkV3SemanticRuntimeKeys, fingerprintBenchmarkV3SemanticRuntime,
  loadBenchmarkV3Corpus, materializeBenchmarkV3ProvenanceBundle } from "../lib/benchmark/v3-corpus.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extendExisting = process.argv[2] === "--extend-existing";
const output = path.resolve(process.argv[extendExisting ? 3 : 2] ?? "");
if ((!extendExisting && process.argv.length !== 3) || (extendExisting && process.argv.length !== 4)
  || (!extendExisting && fs.existsSync(output)) || (extendExisting && !fs.statSync(output).isDirectory())) {
  throw new Error("usage: node scripts/prepare-benchmark-v3-eslint-runtime.mjs [--extend-existing] <output-directory>");
}
const corpus = loadBenchmarkV3Corpus(sourceRoot);
const provenanceBundle = materializeBenchmarkV3ProvenanceBundle(sourceRoot, corpus.source);
const npmCache = path.join(output, ".npm-cache");
const representatives = new Map();
for (const family of corpus.families) {
  const key = family.control_surface.runtime_key;
  const current = representatives.get(key);
  if (current === undefined || Number(family.control_surface.runtime_version.split(".")[1]) > Number(current.control_surface.runtime_version.split(".")[1])) {
    representatives.set(key, family);
  }
}
for (const [key, tag] of [["eslint-v6.0", "v6.0.1"], ["eslint-v6.1", "v6.1.0"],
  ["eslint-v6.2", "v6.2.2"], ["eslint-v6.3", "v6.3.0"], ["eslint-v6.4", "v6.4.0"]]) {
  if (!representatives.has(key)) representatives.set(key, { control_surface: {
    runtime_version: key.slice("eslint-v".length), provenance: { parent_commit: tag },
  } });
}
for (const [key, tag] of [["eslint-v5.0", "v5.0.1"], ["eslint-v5.1", "v5.1.0"],
  ["eslint-v5.2", "v5.2.0"], ["eslint-v5.3", "v5.3.0"], ["eslint-v5.4", "v5.4.0"],
  ["eslint-v5.5", "v5.5.0"], ["eslint-v5.6", "v5.6.1"]]) {
  if (!representatives.has(key)) representatives.set(key, { control_surface: {
    runtime_version: key.slice("eslint-v".length), provenance: { parent_commit: tag },
  } });
}
if (!extendExisting) fs.mkdirSync(output, { recursive: false, mode: 0o700 });
for (const [key, family] of [...representatives].sort()) {
  const directory = path.join(output, key);
  if (fs.existsSync(directory)) continue;
  const clone = spawnSync("git", ["clone", "--quiet", "--no-checkout", provenanceBundle, directory], { encoding: "utf8" });
  if (clone.status !== 0) throw new Error(`${key} clone failed`);
  const checkout = spawnSync("git", ["checkout", "--quiet", family.control_surface.provenance.parent_commit], { cwd: directory, encoding: "utf8" });
  if (checkout.status !== 0) throw new Error(`${key} checkout failed`);
  fs.rmSync(path.join(directory, ".git"), { recursive: true, force: true });
  const install = spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock", "--legacy-peer-deps"], {
    cwd: directory, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NODE_ENV: "development", npm_config_cache: npmCache },
  });
  if (install.status !== 0) throw new Error(`${key} dependency installation failed`);
}
const runtimeKeys = discoverBenchmarkV3SemanticRuntimeKeys(output);
const result = fingerprintBenchmarkV3SemanticRuntime(output, runtimeKeys);
const runtimeManifest = path.join(output, "RUNTIME.json");
const temporaryManifest = `${runtimeManifest}.tmp-${process.pid}`;
fs.writeFileSync(temporaryManifest, `${JSON.stringify({ schema_version: 1, runtime_fingerprint: result.runtime_fingerprint, entries: result.entries }, null, 2)}\n`, "utf8");
fs.renameSync(temporaryManifest, runtimeManifest);
process.stdout.write(`${JSON.stringify({ status: "prepared", runtime_fingerprint: result.runtime_fingerprint, keys: runtimeKeys })}\n`);
