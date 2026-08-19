#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { prepareBenchmarkV2RealCommitCandidate } from "../lib/benchmark/v2-real-commit-materializer.mjs";
import { fingerprintProfileValue } from "../lib/profile-v3.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length || process.argv[index + 1].startsWith("--")) {
    throw new Error(`${name} is required`);
  }
  return process.argv[index + 1];
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheRoot = fs.realpathSync.native(path.resolve(argument("--cache-root")));
const registry = JSON.parse(fs.readFileSync(
  path.join(repositoryRoot, "benchmarks/v2/holdout/real-commit-candidates.v2.json"),
  "utf8",
));
const requirements = JSON.parse(fs.readFileSync(
  path.join(repositoryRoot, "benchmarks/v2/holdout/real-commit-requirements.v2.json"),
  "utf8",
));
const repositoryIds = new Set(registry.repositories.map((repository) => repository.id));
const prepared = registry.candidates.map((candidate) => prepareBenchmarkV2RealCommitCandidate({
  registry,
  requirements,
  candidateId: candidate.id,
  repositoryRoot: path.join(cacheRoot, candidate.repository_id),
}));
if (prepared.length !== 36 || new Set(prepared.map((entry) => entry.candidate_id)).size !== 36
  || new Set(prepared.map((entry) => entry.fixture_fingerprint)).size !== 36
  || prepared.some((entry) => Object.hasOwn(entry, "reference_files")
    || entry.reference_patch_access !== "forbidden-before-model-settlement"
    || entry.public_files.length < 1 || entry.public_files.length > 20)) {
  throw new Error("real-commit pre-model source verification did not produce the sealed 36-candidate pool");
}
const counts = Object.fromEntries(["small", "medium", "high"].map((stratum) => [
  stratum, prepared.filter((entry) => entry.stratum === stratum).length,
]));
if (Object.values(counts).some((count) => count !== 12)
  || new Set(prepared.map((entry) => entry.repository_id)).size !== repositoryIds.size) {
  throw new Error("real-commit pre-model source verification coverage drifted");
}
const report = {
  status: "passed",
  evidence_class: "live-provenance-and-parent-snapshot-validation",
  model_execution: false,
  reference_patch_accessed: false,
  candidate_count: prepared.length,
  counts,
  repository_count: repositoryIds.size,
  maximum_public_file_count: Math.max(...prepared.map((entry) => entry.public_files.length)),
  unique_fixture_fingerprint_count: new Set(prepared.map((entry) => entry.fixture_fingerprint)).size,
  prepared_pool_fingerprint: fingerprintProfileValue(prepared.map((entry) => ({
    candidate_id: entry.candidate_id,
    fixture_fingerprint: entry.fixture_fingerprint,
  }))),
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
