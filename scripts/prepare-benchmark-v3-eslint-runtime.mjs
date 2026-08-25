#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { fingerprintBenchmarkV3SemanticRuntime, loadBenchmarkV3Corpus, materializeBenchmarkV3ProvenanceBundle } from "../lib/benchmark/v3-corpus.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(process.argv[2] ?? "");
if (process.argv.length !== 3 || fs.existsSync(output)) throw new Error("usage: node scripts/prepare-benchmark-v3-eslint-runtime.mjs <new-output-directory>");
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
fs.mkdirSync(output, { recursive: false, mode: 0o700 });
for (const [key, family] of [...representatives].sort()) {
  const directory = path.join(output, key);
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
const result = fingerprintBenchmarkV3SemanticRuntime(output, [...representatives.keys()]);
fs.writeFileSync(path.join(output, "RUNTIME.json"), `${JSON.stringify({ schema_version: 1, runtime_fingerprint: result.runtime_fingerprint, entries: result.entries }, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ status: "prepared", runtime_fingerprint: result.runtime_fingerprint, keys: [...representatives.keys()].sort() })}\n`);
