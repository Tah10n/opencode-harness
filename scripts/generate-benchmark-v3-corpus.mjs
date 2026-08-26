import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { canonicalJson, fingerprint } from "../lib/feedback/contracts.mjs";
import { assignBenchmarkV3Splits, verifyBenchmarkV3SplitDistribution } from "../lib/benchmark/v3-split-assignment.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRepo = path.resolve(process.argv[2] ?? "");
const semanticRuntimeRoot = process.argv[3] === undefined ? null : path.resolve(process.argv[3]);
const outputRoot = path.join(root, "benchmarks", "v3", "corpus");
const generatorContract = JSON.parse(fs.readFileSync(path.join(root, "benchmarks", "v3", "generator-contract.v1.json"), "utf8"));
const repositoryUrl = "https://github.com/eslint/eslint";
const quotas = Object.freeze({ development: 20, validation: 20, holdout: 30 });
const codePath = /\.(?:cjs|js|mjs)$/u;

function git(args, { encoding = "utf8" } = {}) {
  const result = spawnSync("git", args, {
    cwd: sourceRepo, encoding, shell: false, windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0 || result.signal !== null || result.error) {
    throw new Error(`git ${args[0]} failed while deriving the v3 corpus`);
  }
  return result.stdout;
}

if (!fs.existsSync(path.join(sourceRepo, ".git")) || semanticRuntimeRoot === null) {
  throw new Error("usage: node scripts/generate-benchmark-v3-corpus.mjs <full-eslint-git-clone> <semantic-runtime-root>");
}
const remote = git(["remote", "get-url", "origin"]).trim().replace(/\.git$/u, "");
if (remote !== repositoryUrl) throw new Error("source repository must be the official eslint/eslint clone");
const licenseBytes = git(["show", "HEAD:LICENSE"], { encoding: "buffer" });
const licenseFingerprint = fingerprint(licenseBytes.toString("utf8"));
const sourceTip = git(["rev-parse", "HEAD"]).trim();
const provenanceBundleFile = path.join(fs.realpathSync.native(process.env.TMPDIR ?? "/tmp"), `benchmark-v3-generator-${sourceTip.slice(0, 24)}.bundle`);
if (!fs.existsSync(provenanceBundleFile)) git(["bundle", "create", provenanceBundleFile, sourceTip]);
const provenanceBundle = fs.readFileSync(provenanceBundleFile);

const candidates = [];
for (const line of git(["log", "--no-merges", "--format=%H%x09%P%x09%ct%x09%s"]).split("\n")) {
  if (line.length === 0) continue;
  const [commit, parents, committedAt, ...subjectParts] = line.split("\t");
  const subject = subjectParts.join("\t");
  if (!/^(?:fix|feat|change|update|refactor)(?:\([^)]*\))?:\s+/iu.test(subject) || parents.split(" ").length !== 1) continue;
  const parent = parents;
  const changedPaths = git(["diff-tree", "--no-commit-id", "--name-status", "-r", "--diff-filter=M", commit])
    .split("\n").filter(Boolean).map((entry) => entry.split("\t")[1]);
  const paths = changedPaths.filter((entry) => /^lib\/.+\.js$/u.test(entry)).slice(0, 4);
  const testPaths = changedPaths.filter((entry) => /^tests\/lib\/.+\.js$/u.test(entry)).slice(0, 4);
  if (paths.length === 0 || testPaths.length === 0) continue;
  const beforeFiles = [];
  const afterFiles = [];
  const hiddenTestFiles = [];
  let bytes = 0;
  let changedLines = 0;
  let usable = true;
  for (const sourcePath of paths) {
    const before = git(["show", `${parent}:${sourcePath}`], { encoding: "buffer" });
    const after = git(["show", `${commit}:${sourcePath}`], { encoding: "buffer" });
    if (before.includes(0) || after.includes(0) || before.byteLength > 96 * 1024 || after.byteLength > 96 * 1024) {
      usable = false;
      break;
    }
    bytes += before.byteLength + after.byteLength;
    if (bytes > 256 * 1024 || before.equals(after)) {
      usable = false;
      break;
    }
    const beforeContent = before.toString("utf8");
    const afterContent = after.toString("utf8");
    changedLines += Math.max(1, Math.abs(beforeContent.split("\n").length - afterContent.split("\n").length));
    beforeFiles.push(Object.freeze({ path: sourcePath, content: beforeContent }));
    afterFiles.push(Object.freeze({ path: sourcePath, content: afterContent }));
  }
  for (const testPath of testPaths) {
    const afterTest = git(["show", `${commit}:${testPath}`], { encoding: "buffer" });
    if (afterTest.includes(0) || afterTest.byteLength > 256 * 1024) { usable = false; break; }
    hiddenTestFiles.push(Object.freeze({ path: testPath, content: afterTest.toString("utf8") }));
    bytes += afterTest.byteLength;
  }
  if (!usable) continue;
  const parentPackage = JSON.parse(git(["show", `${parent}:package.json`]));
  const [runtimeMajor, runtimeMinor] = String(parentPackage.version).split(".").map(Number);
  if (!Number.isSafeInteger(runtimeMajor) || !Number.isSafeInteger(runtimeMinor) || runtimeMajor < 6 || runtimeMajor > 10) continue;
  const patch = git(["diff", "--binary", parent, commit, "--", ...paths, ...testPaths]);
  const requirementText = git(["show", "-s", "--format=%B", commit]).trim();
  if (requirementText.length < 20 || requirementText.length > 8_000) continue;
  const leakedCodeLines = patch.split("\n").filter((line) => /^\+(?!\+\+)/u.test(line))
    .map((line) => line.slice(1).trim()).filter((line) => line.length >= 24 && /[(){}[\]"'`:=]/u.test(line));
  if (leakedCodeLines.some((line) => requirementText.includes(line))) continue;
  changedLines += patch.split("\n").filter((entry) => /^[+-](?![+-])/u.test(entry)).length;
  candidates.push(Object.freeze({
    commit, parent, committed_at: Number(committedAt), runtime_key: [7, 10].includes(runtimeMajor) ? `eslint-v${runtimeMajor}` : `eslint-v${runtimeMajor}.${runtimeMinor}`,
    runtime_version: `${runtimeMajor}.${runtimeMinor}`, subject, beforeFiles, afterFiles, hiddenTestFiles,
    patch_fingerprint: fingerprint(patch), requirement_text: requirementText,
    complexity: changedLines + (paths.length * 20) + Math.ceil(bytes / 4096),
    patch_size_bytes: Buffer.byteLength(patch), file_count: paths.length + testPaths.length,
  }));
}
if (candidates.length < 210) throw new Error(`only ${candidates.length} eligible unique fix commits were found`);

let semanticWorkspace = fs.mkdtempSync(path.join(fs.realpathSync.native(process.env.TMPDIR ?? "/tmp"), "v3-generator-oracle-"));
const semanticClone = spawnSync("git", ["clone", "--quiet", "--no-checkout", provenanceBundleFile, semanticWorkspace], { encoding: "utf8" });
if (semanticClone.status !== 0) throw new Error("semantic oracle workspace clone failed");
function semanticCandidatePasses(entry) {
  const nodeModules = path.join(semanticRuntimeRoot, entry.runtime_key, "node_modules");
  const mocha = [path.join(nodeModules, "mocha", "bin", "mocha.js"), path.join(nodeModules, "mocha", "bin", "mocha")]
    .find((candidate) => fs.existsSync(candidate));
  if (mocha === undefined) return false;
  const workspace = semanticWorkspace;
  try {
    const runOracle = (sourceFiles) => {
      if (spawnSync("git", ["checkout", "--quiet", "--force", entry.parent], { cwd: workspace }).status !== 0) return false;
      spawnSync("git", ["clean", "-fdx", "--quiet"], { cwd: workspace });
      for (const file of [...sourceFiles, ...entry.hiddenTestFiles]) {
        const target = path.join(workspace, ...file.path.split("/"));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, file.content, "utf8");
      }
      fs.symlinkSync(nodeModules, path.join(workspace, "node_modules"), "dir");
      const result = spawnSync(process.execPath, [mocha, "--timeout", "30000", ...entry.hiddenTestFiles.map((file) => file.path)], {
        cwd: workspace, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
        env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "/tmp", LANG: "C", LC_ALL: "C", NODE_ENV: "test" },
      });
      fs.rmSync(path.join(workspace, "node_modules"), { force: true });
      return result.status === 0 && result.signal === null && result.error === undefined;
    };
    return runOracle(entry.beforeFiles) === false && runOracle(entry.afterFiles) === true;
  } finally { fs.rmSync(path.join(workspace, "node_modules"), { force: true }); }
}

const viableCandidates = [];
const usedSourcePaths = new Set();
for (const candidate of [...candidates].sort((left, right) => right.committed_at - left.committed_at || left.commit.localeCompare(right.commit))) {
  if (candidate.beforeFiles.some((entry) => usedSourcePaths.has(entry.path))) continue;
  if (semanticCandidatePasses(candidate)) {
    viableCandidates.push(candidate);
    for (const entry of candidate.beforeFiles) usedSourcePaths.add(entry.path);
  }
  if (viableCandidates.length === 210) break;
}
fs.rmSync(semanticWorkspace, { recursive: true, force: true });
semanticWorkspace = null;
if (viableCandidates.length < 210) throw new Error(`only ${viableCandidates.length} semantically discriminating fix commits were found`);

const recentWindow = viableCandidates
  .sort((left, right) => right.committed_at - left.committed_at || left.commit.localeCompare(right.commit))
  .slice(0, 210);
const commitAgeRank = new Map(recentWindow.map((entry, index) => [entry.commit, index + 1]));
const selected = [...recentWindow].sort((left, right) => left.complexity - right.complexity || left.commit.localeCompare(right.commit));
const groups = Object.freeze({
  small: selected.slice(0, 70),
  medium: selected.slice(70, 140),
  high: selected.slice(140, 210),
});
const candidateByCommit = new Map(selected.map((entry) => [entry.commit, entry]));
const assignment = assignBenchmarkV3Splits(Object.entries(groups).flatMap(([stratum, entries]) => entries.map((entry) => ({
  source_commit: entry.commit, stratum, complexity_score: entry.complexity,
  patch_size_bytes: entry.patch_size_bytes, file_count: entry.file_count,
  runtime_version: entry.runtime_version, committed_at: entry.committed_at,
  commit_age_rank: commitAgeRank.get(entry.commit),
}))), generatorContract.corpus_generation_seed);
const distribution = verifyBenchmarkV3SplitDistribution(assignment);
if (!distribution.passed) throw new Error(`seeded split distribution failed: ${JSON.stringify(distribution)}`);
if (assignment.assignment_fingerprint !== generatorContract.split_assignment_fingerprint) {
  throw new Error("generated split assignment does not match the frozen generator contract");
}
const assignedGroups = Object.fromEntries(Object.keys(quotas).map((split) => [split, Object.fromEntries(Object.keys(groups).map((stratum) => [
  stratum,
  assignment.entries.filter((entry) => entry.split === split && entry.stratum === stratum)
    .sort((left, right) => left.complexity_quantile - right.complexity_quantile || left.source_commit.localeCompare(right.source_commit))
    .map((entry) => candidateByCommit.get(entry.source_commit)),
]))]));

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });
fs.writeFileSync(path.join(root, "benchmarks", "v3", "split-assignment.v1.json"), `${JSON.stringify(assignment, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outputRoot, "SOURCE.json"), `${JSON.stringify({
  schema_version: 1,
  repository: repositoryUrl,
  source_tip: sourceTip,
  source_commit: sourceTip,
  license: "MIT",
    spdx_license: "MIT",
    license_fingerprint: licenseFingerprint,
    provenance_bundle: { sha256: `sha256:${createHash("sha256").update(provenanceBundle).digest("hex")}`,
      size: provenanceBundle.length, redistribution_status: "excluded-from-git-and-release-assets",
      local_environment_variable: "BENCHMARK_V3_PROVENANCE_BUNDLE" },
    third_party_notices: "THIRD_PARTY_NOTICES.md",
    materializer: "scripts/materialize-benchmark-v3-provenance.mjs",
    derivation: "unique-real-eslint-source-lineages-with-development-only-reference-byte-contracts-and-hidden-upstream-tests",
}, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outputRoot, "THIRD_PARTY_LICENSE.txt"), licenseBytes);
fs.writeFileSync(path.join(outputRoot, "THIRD_PARTY_NOTICES.md"), `# Third-party notices\n\nDerived from ${repositoryUrl} at ${sourceTip}. SPDX-License-Identifier: MIT. Raw provenance bundles are excluded from Git and release assets.\n`, "utf8");

for (const [stratum] of Object.entries(groups)) {
  for (const [split] of Object.entries(quotas)) {
    const splitEntries = assignedGroups[split][stratum];
    for (const [zeroIndex, entry] of splitEntries.entries()) {
      const index = zeroIndex + 1;
      const familyId = `v3-${split}-${stratum}-${String(index).padStart(2, "0")}`;
      const clauses = Object.freeze([
        Object.freeze({ clause_id: "REQ-001", kind: "required-behavior", text: "Reproduce the frozen upstream repair bytes for every supplied source path." }),
        Object.freeze({ clause_id: "REQ-002", kind: "preserved-behavior", text: "Pass the runner-owned upstream test files without modifying them." }),
        Object.freeze({ clause_id: "REQ-003", kind: "allowed-mutation", text: "Modify only the supplied source paths." }),
      ]);
      const contractBody = { schema_version: 1, contract_id: `${familyId}-public-contract`, clauses };
      const contract = Object.freeze({ ...contractBody, contract_fingerprint: fingerprint(contractBody) });
      const publicSurface = Object.freeze({
        schema_version: 1,
        family_id: familyId,
        split,
        stratum,
        prompt: "Repair the supplied ESLint source according to the visible public contract.",
        visible_requirements: Object.freeze([
          "Development-only reconstruction: reproduce the frozen upstream repair bytes; semantic alternatives and confirmatory claims are out of scope.",
          ...clauses.map((clause) => clause.text),
        ]),
        contract,
        base_source_tip: sourceTip,
        public_files: Object.freeze(entry.beforeFiles),
      });
      const controlSurface = Object.freeze({
        schema_version: 1,
        family_id: familyId,
        oracle: "upstream-eslint-rule-test-and-closed-mutation-set",
        defect_severity: "unclassified",
        reference_files: Object.freeze(entry.afterFiles),
        hidden_test_files: Object.freeze(entry.hiddenTestFiles),
        allowed_mutation_paths: Object.freeze(entry.beforeFiles.map((file) => file.path)),
        test_argv: Object.freeze(["--timeout", "30000", ...entry.hiddenTestFiles.map((file) => file.path)]),
        runtime_key: entry.runtime_key,
        runtime_version: entry.runtime_version,
        provenance: Object.freeze({
          kind: "real-commit-derived",
          repository: repositoryUrl,
          source_commit: entry.commit,
          parent_commit: entry.parent,
          source_paths: Object.freeze(entry.beforeFiles.map((file) => file.path)),
          patch_fingerprint: entry.patch_fingerprint,
          visible_requirement_fingerprint: fingerprint(entry.requirement_text),
          license: "MIT",
          license_fingerprint: licenseFingerprint,
        }),
        requirement_coverage: Object.freeze({ schema_version: 1, contract_fingerprint: contract.contract_fingerprint,
          contract_completeness: "reference-byte-bound",
          hidden_test_witnesses: Object.freeze(entry.hiddenTestFiles.map((file) => Object.freeze({ hidden_test_fingerprint: fingerprint(file.content), clause_ids: Object.freeze(["REQ-002"]) }))),
          runner_witnesses: Object.freeze([{ witness_id: "frozen-reference-bytes-and-closed-mutation-set", clause_ids: Object.freeze(["REQ-001", "REQ-003"]) }]) }),
      });
      const manifestBody = {
        schema_version: 1,
        family_id: familyId,
        split,
        stratum,
        semantic_kernel_id: `eslint-change-${entry.commit}`,
        public_surface_fingerprint: fingerprint(publicSurface),
        control_surface_fingerprint: fingerprint(controlSurface),
        source_identity_fingerprint: fingerprint({ repository: repositoryUrl, commit: entry.commit }),
      };
      const manifest = Object.freeze({ ...manifestBody, family_fingerprint: fingerprint(manifestBody) });
      const directory = path.join(outputRoot, split, familyId);
      fs.mkdirSync(directory, { recursive: true });
      for (const [name, value] of [["public.json", publicSurface], ["control.json", controlSurface], ["manifest.json", manifest]]) {
        fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
      }
    }
  }
}

const corpusIndex = [...Object.keys(quotas)].flatMap((split) => [...Object.keys(groups)].flatMap((stratum) => {
  const count = quotas[split];
  return Array.from({ length: count }, (_, index) => `v3-${split}-${stratum}-${String(index + 1).padStart(2, "0")}`);
}));
fs.writeFileSync(path.join(outputRoot, "index.json"), `${JSON.stringify({
  schema_version: 1,
  family_ids: corpusIndex,
  family_count: corpusIndex.length,
  corpus_index_fingerprint: fingerprint(corpusIndex),
}, null, 2)}\n`, "utf8");
process.stdout.write(`${canonicalJson({ status: "generated", family_count: corpusIndex.length, source_tip: sourceTip })}\n`);
