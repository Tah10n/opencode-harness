#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { fingerprint } from "../lib/feedback/contracts.mjs";
import { assignBenchmarkV3Splits, verifyBenchmarkV3SplitDistribution } from "../lib/benchmark/v3-split-assignment.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metadataRepository = path.resolve(process.argv[2] ?? "");
const corpusRoot = path.join(root, "benchmarks", "v3", "corpus");
const generatorPath = path.join(root, "benchmarks", "v3", "generator-contract.v1.json");
if (!fs.existsSync(path.join(metadataRepository, ".git"))) {
  throw new Error("usage: node scripts/rebalance-benchmark-v3-corpus.mjs <eslint-metadata-repository>");
}
const git = (args) => {
  const result = spawnSync("git", args, { cwd: metadataRepository, encoding: "utf8", shell: false, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed for split assignment metadata`);
  return result.stdout;
};
const generator = JSON.parse(fs.readFileSync(generatorPath, "utf8"));
const raw = [];
for (const split of ["development", "validation", "holdout"]) for (const name of fs.readdirSync(path.join(corpusRoot, split)).sort()) {
  const directory = path.join(corpusRoot, split, name);
  if (!fs.statSync(directory).isDirectory()) continue;
  const publicSurface = JSON.parse(fs.readFileSync(path.join(directory, "public.json"), "utf8"));
  const controlSurface = JSON.parse(fs.readFileSync(path.join(directory, "control.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
  const commit = controlSurface.provenance.source_commit;
  const parent = controlSurface.provenance.parent_commit;
  const paths = [...controlSurface.provenance.source_paths, ...controlSurface.hidden_test_files.map((entry) => entry.path)];
  const patch = git(["diff", "--binary", parent, commit, "--", ...paths]);
  let changedLines = patch.split("\n").filter((entry) => /^[+-](?![+-])/u.test(entry)).length;
  let bytes = 0;
  for (const [before, after] of publicSurface.public_files.map((entry, index) => [entry.content, controlSurface.reference_files[index].content])) {
    bytes += Buffer.byteLength(before) + Buffer.byteLength(after);
    changedLines += Math.max(1, Math.abs(before.split("\n").length - after.split("\n").length));
  }
  bytes += controlSurface.hidden_test_files.reduce((sum, entry) => sum + Buffer.byteLength(entry.content), 0);
  raw.push({ publicSurface, controlSurface, manifest, source_commit: commit, stratum: publicSurface.stratum,
    complexity_score: changedLines + (publicSurface.public_files.length * 20) + Math.ceil(bytes / 4096),
    patch_size_bytes: Buffer.byteLength(patch),
    file_count: paths.length,
    runtime_version: controlSurface.runtime_version,
    committed_at: Number(git(["show", "-s", "--format=%ct", commit]).trim()) });
}
const chronological = [...raw].sort((left, right) => right.committed_at - left.committed_at || left.source_commit.localeCompare(right.source_commit));
const rank = new Map(chronological.map((entry, index) => [entry.source_commit, index + 1]));
const assignment = assignBenchmarkV3Splits(raw.map((entry) => ({
  source_commit: entry.source_commit,
  stratum: entry.stratum,
  complexity_score: entry.complexity_score,
  patch_size_bytes: entry.patch_size_bytes,
  file_count: entry.file_count,
  runtime_version: entry.runtime_version,
  committed_at: entry.committed_at,
  commit_age_rank: rank.get(entry.source_commit),
})), generator.corpus_generation_seed);
const distribution = verifyBenchmarkV3SplitDistribution(assignment);
if (!distribution.passed) throw new Error(`split distribution failed: ${JSON.stringify(distribution)}`);
const assignmentByCommit = new Map(assignment.entries.map((entry) => [entry.source_commit, entry]));
const staging = path.join(root, "benchmarks", "v3", `.corpus-rebalanced-${process.pid}`);
fs.mkdirSync(staging);
const ids = [];
for (const split of ["development", "validation", "holdout"]) {
  const entries = raw.filter((entry) => assignmentByCommit.get(entry.source_commit).split === split)
    .sort((left, right) => left.stratum.localeCompare(right.stratum)
      || assignmentByCommit.get(left.source_commit).complexity_quantile - assignmentByCommit.get(right.source_commit).complexity_quantile
      || left.source_commit.localeCompare(right.source_commit));
  const stratumIndex = new Map();
  for (const entry of entries) {
    const index = (stratumIndex.get(entry.stratum) ?? 0) + 1;
    stratumIndex.set(entry.stratum, index);
    const familyId = `v3-${split}-${entry.stratum}-${String(index).padStart(2, "0")}`;
    ids.push(familyId);
    const publicSurface = { ...entry.publicSurface, family_id: familyId, split,
      contract: { ...entry.publicSurface.contract, contract_id: `${familyId}-public-contract` } };
    const contractBody = { ...publicSurface.contract }; delete contractBody.contract_fingerprint;
    publicSurface.contract.contract_fingerprint = fingerprint(contractBody);
    const controlSurface = { ...entry.controlSurface, family_id: familyId,
      requirement_coverage: { ...entry.controlSurface.requirement_coverage, contract_fingerprint: publicSurface.contract.contract_fingerprint } };
    const manifestBody = { schema_version: 1, family_id: familyId, split, stratum: entry.stratum,
      semantic_kernel_id: entry.manifest.semantic_kernel_id, public_surface_fingerprint: fingerprint(publicSurface),
      control_surface_fingerprint: fingerprint(controlSurface), source_identity_fingerprint: entry.manifest.source_identity_fingerprint };
    const manifest = { ...manifestBody, family_fingerprint: fingerprint(manifestBody) };
    const directory = path.join(staging, split, familyId); fs.mkdirSync(directory, { recursive: true });
    for (const [name, value] of [["public.json", publicSurface], ["control.json", controlSurface], ["manifest.json", manifest]]) {
      fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
    }
  }
}
const indexBody = { schema_version: 1, family_ids: ids, family_count: ids.length, corpus_index_fingerprint: fingerprint(ids) };
for (const name of ["SOURCE.json", "THIRD_PARTY_LICENSE.txt", "THIRD_PARTY_NOTICES.md"]) fs.copyFileSync(path.join(corpusRoot, name), path.join(staging, name));
fs.writeFileSync(path.join(staging, "index.json"), `${JSON.stringify(indexBody, null, 2)}\n`);
fs.writeFileSync(path.join(root, "benchmarks", "v3", "split-assignment.v1.json"), `${JSON.stringify(assignment, null, 2)}\n`);
fs.rmSync(corpusRoot, { recursive: true });
fs.renameSync(staging, corpusRoot);
process.stdout.write(`${JSON.stringify({ status: "rebalanced", assignment_fingerprint: assignment.assignment_fingerprint, distribution })}\n`);
