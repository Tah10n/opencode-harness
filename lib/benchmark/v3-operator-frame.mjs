import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

import { ContractError, fingerprint } from "../feedback/contracts.mjs";
import { loadBenchmarkV3Corpus } from "./v3-corpus.mjs";
import { runBenchmarkV3IsolatedSemanticCase } from "./v3-operator-semantic.mjs";

const STRATA = Object.freeze(["small", "medium", "high"]);
const REPOSITORY = "https://github.com/eslint/eslint";
const SOURCE_PATH = /^(?:(?:lib|bin|conf|messages)\/.+|packages\/[^/]+\/(?!(?:tests|types)\/).+)\.(?:js|cjs|mjs)$/u;
const TEST_PATH = /^(?:tests\/.+|packages\/[^/]+\/tests\/.+)\.(?:js|cjs|mjs)$/u;

function fail(message) { throw new ContractError("BENCHMARK_V3_OPERATOR_FRAME", message); }
function expect(condition, message) { if (!condition) fail(message); }
function passed(result) { return result.status === 0 && result.signal === null && result.error === undefined; }
function run(repository, args, options = {}) {
  return spawnSync("git", args, { cwd: repository, encoding: "utf8", shell: false, windowsHide: true,
    maxBuffer: 64 * 1024 * 1024, ...options });
}
function git(repository, args, options = {}) {
  const result = run(repository, args, options);
  expect(passed(result), `git ${args[0]} failed while deriving the external sampling frame`);
  return result.stdout;
}
function gitPathExists(repository, commit, sourcePath) {
  return passed(run(repository, ["cat-file", "-e", `${commit}:${sourcePath}`]));
}
function sha256File(file) {
  return `sha256:${createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`;
}
function stageFiles(repository, files) {
  for (const entry of files) {
    const target = path.join(repository, ...entry.path.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.content, "utf8");
  }
}
function semanticCase(repository, candidate, semanticRuntimeRoot, sourceFiles) {
  expect(passed(run(repository, ["checkout", "--quiet", "--force", candidate.parent])),
    "external sampling candidate parent checkout failed");
  expect(passed(run(repository, ["clean", "-fdx", "--quiet"])), "external sampling candidate cleanup failed");
  stageFiles(repository, sourceFiles);
  stageFiles(repository, candidate.hiddenTestFiles);
  return runBenchmarkV3IsolatedSemanticCase({ repository, semanticRuntimeRoot,
    runtimeKey: candidate.runtime_key, testArgv: candidate.hiddenTestFiles.map((entry) => entry.path) });
}

function candidateRecords(repository, sourceTip) {
  const candidates = [];
  for (const line of git(repository, ["log", "--no-merges", "--format=%H%x09%P%x09%ct%x09%s", sourceTip]).split("\n")) {
    if (line.length === 0) continue;
    const [commit, parents, committedAt, ...subjectParts] = line.split("\t");
    const subject = subjectParts.join("\t");
    if (parents.split(" ").length !== 1) continue;
    const parent = parents;
    const changed = git(repository, ["diff-tree", "--no-commit-id", "--name-status", "-r", "--diff-filter=AM", commit])
      .split("\n").filter(Boolean).map((entry) => {
        const [status, changedPath] = entry.split("\t"); return { status, path: changedPath };
      });
    const sourcePaths = changed.filter((entry) => entry.status === "M" && SOURCE_PATH.test(entry.path))
      .map((entry) => entry.path).slice(0, 12);
    const changedTests = changed.filter((entry) => /^[AM]$/u.test(entry.status) && TEST_PATH.test(entry.path))
      .map((entry) => entry.path).slice(0, 4);
    const preservationTests = sourcePaths.filter((entry) => /^lib\/rules\/.+\.js$/u.test(entry))
      .map((entry) => entry.replace(/^lib\/rules\//u, "tests/lib/rules/"))
      .filter((entry) => gitPathExists(repository, commit, entry));
    const testPaths = [...new Set([...changedTests, ...preservationTests])].slice(0, 4);
    if (sourcePaths.length === 0 || changedTests.length === 0 || testPaths.length === 0) continue;
    const alternativeCommits = git(repository, ["log", "--format=%H", "--reverse", `${commit}..${sourceTip}`, "--", ...sourcePaths])
      .split("\n").filter(Boolean)
      .filter((candidate) => sourcePaths.every((entry) => gitPathExists(repository, candidate, entry))).slice(0, 16);
    if (alternativeCommits.length === 0) continue;
    const beforeFiles = []; const referenceFiles = []; const hiddenTestFiles = [];
    let bytes = 0; let controlBytes = 0; let changedLines = 0; let usable = true;
    for (const sourcePath of sourcePaths) {
      const before = git(repository, ["show", `${parent}:${sourcePath}`], { encoding: "buffer" });
      const reference = git(repository, ["show", `${commit}:${sourcePath}`], { encoding: "buffer" });
      if ([before, reference].some((entry) => entry.includes(0) || entry.byteLength > 96 * 1024)
        || before.equals(reference)) { usable = false; break; }
      bytes += before.byteLength + reference.byteLength;
      if (bytes > 256 * 1024) { usable = false; break; }
      const beforeContent = before.toString("utf8");
      const referenceContent = reference.toString("utf8");
      beforeFiles.push(Object.freeze({ path: sourcePath, content: beforeContent }));
      referenceFiles.push(Object.freeze({ path: sourcePath, content: referenceContent }));
      changedLines += Math.max(1, Math.abs(beforeContent.split("\n").length - referenceContent.split("\n").length));
    }
    for (const testPath of testPaths) {
      const test = git(repository, ["show", `${commit}:${testPath}`], { encoding: "buffer" });
      if (test.includes(0) || test.byteLength > 256 * 1024) { usable = false; break; }
      hiddenTestFiles.push(Object.freeze({ path: testPath, content: test.toString("utf8") }));
      controlBytes += test.byteLength;
      if (controlBytes > 1024 * 1024) { usable = false; break; }
    }
    if (!usable) continue;
    const alternatives = alternativeCommits.map((alternativeCommit) => {
      const files = sourcePaths.map((sourcePath) => {
        const bytes = git(repository, ["show", `${alternativeCommit}:${sourcePath}`], { encoding: "buffer" });
        return bytes.includes(0) || bytes.byteLength > 96 * 1024
          ? null : Object.freeze({ path: sourcePath, content: bytes.toString("utf8") });
      });
      return files.every(Boolean) && fingerprint(referenceFiles) !== fingerprint(files)
        ? Object.freeze({ commit: alternativeCommit, files: Object.freeze(files) }) : null;
    }).filter(Boolean);
    if (alternatives.length === 0) continue;
    let parentPackage;
    try { parentPackage = JSON.parse(git(repository, ["show", `${parent}:package.json`])); } catch { continue; }
    const [runtimeMajor, runtimeMinor] = String(parentPackage.version).split(".").map(Number);
    if (!Number.isSafeInteger(runtimeMajor) || !Number.isSafeInteger(runtimeMinor)
      || runtimeMajor < 5 || runtimeMajor > 10) continue;
    const patch = git(repository, ["diff", "--binary", parent, commit, "--", ...sourcePaths, ...changedTests]);
    const requirementText = git(repository, ["show", "-s", "--format=%B", commit]).trim();
    if (requirementText.length < 20 || requirementText.length > 8_000) continue;
    const leakedCodeLines = patch.split("\n").filter((entry) => /^\+(?!\+\+)/u.test(entry))
      .map((entry) => entry.slice(1).trim()).filter((entry) => entry.length >= 24 && /[(){}[\]"'`:=]/u.test(entry));
    if (leakedCodeLines.some((entry) => requirementText.includes(entry))) continue;
    changedLines += patch.split("\n").filter((entry) => /^[+-](?![+-])/u.test(entry)).length;
    const publicTestDelta = git(repository, ["diff", "--no-ext-diff", "--unified=3", parent, commit, "--", ...changedTests]).trim();
    if (Buffer.byteLength(publicTestDelta) > 64 * 1024) continue;
    candidates.push(Object.freeze({ commit, parent, alternatives: Object.freeze(alternatives),
      committed_at: Number(committedAt), subject, sourcePaths,
      beforeFiles, referenceFiles, hiddenTestFiles,
      runtime_key: [7, 10].includes(runtimeMajor) ? `eslint-v${runtimeMajor}` : `eslint-v${runtimeMajor}.${runtimeMinor}`,
      runtime_version: `${runtimeMajor}.${runtimeMinor}`, requirementText, publicTestDelta,
      complexity: changedLines + (sourcePaths.length * 20) + Math.ceil(bytes / 4096) }));
  }
  return candidates;
}

export function stratifyBenchmarkV3ExternalPool(entries) {
  expect(Array.isArray(entries) && entries.length >= 90, "external sampling frame has fewer than 90 calibrated identities");
  return entries.slice().sort((left, right) => left.complexity - right.complexity || left.commit.localeCompare(right.commit))
    .map((entry, index, values) => Object.freeze({ ...entry,
      stratum: STRATA[Math.min(2, Math.floor((index * 3) / values.length))] }));
}

export function matchBenchmarkV3SinglePathOptions(singleOptions) {
  expect(Array.isArray(singleOptions) && singleOptions.every((options) => Array.isArray(options)
    && options.every((option) => Array.isArray(option?.sourcePaths) && option.sourcePaths.length === 1
      && typeof option.sourcePaths[0] === "string")),
  "single-path matching options are invalid");
  const pathOwner = new Map();
  const matchedOption = new Map();
  function assign(candidateIndex, visitedPaths) {
    for (const option of singleOptions[candidateIndex]) {
      const sourcePath = option.sourcePaths[0];
      if (visitedPaths.has(sourcePath)) continue;
      visitedPaths.add(sourcePath);
      const owner = pathOwner.get(sourcePath);
      if (owner === undefined || assign(owner, visitedPaths)) {
        pathOwner.set(sourcePath, candidateIndex);
        matchedOption.set(candidateIndex, option);
        return true;
      }
    }
    return false;
  }
  for (let index = 0; index < singleOptions.length; index += 1) assign(index, new Set());
  return Object.freeze([...matchedOption.entries()].sort((left, right) => left[0] - right[0]));
}

export function generateBenchmarkV3ExternalSamplingFrame({ sourceRoot, provenanceBundle, semanticRuntimeRoot }) {
  const source = fs.realpathSync.native(path.resolve(sourceRoot));
  const bundle = fs.realpathSync.native(path.resolve(provenanceBundle));
  const runtime = fs.realpathSync.native(path.resolve(semanticRuntimeRoot));
  const corpus = loadBenchmarkV3Corpus(source);
  expect(fs.lstatSync(bundle).isFile() && !fs.lstatSync(bundle).isSymbolicLink()
    && fs.statSync(bundle).size === corpus.source.provenance_bundle.size
    && sha256File(bundle) === corpus.source.provenance_bundle.sha256,
  "external sampling provenance bundle does not match the frozen public corpus");
  const repository = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "benchmark-v3-external-frame-"));
  try {
    expect(passed(spawnSync("git", ["clone", "--quiet", "--no-checkout", bundle, repository], {
      encoding: "utf8", shell: false, windowsHide: true, timeout: 120_000 })), "external sampling provenance clone failed");
    expect(git(repository, ["rev-parse", "HEAD"]).trim() === corpus.source.source_tip
      && passed(run(repository, ["bundle", "verify", bundle])), "external sampling provenance identity is invalid");
    const excludedCommits = new Set(corpus.split_assignment.entries.map((entry) => entry.source_commit));
    const publicPaths = new Set(corpus.families.flatMap((entry) => entry.control_surface.provenance.source_paths));
    const viable = [];
    let authenticPreFixFailures = 0;
    let referencePasses = 0;
    const candidates = candidateRecords(repository, corpus.source.source_tip)
      .filter((entry) => !excludedCommits.has(entry.commit))
      .map((entry) => {
        const sourcePaths = entry.sourcePaths.filter((sourcePath) => !publicPaths.has(sourcePath));
        const keep = new Set(sourcePaths);
        const beforeFiles = entry.beforeFiles.filter((file) => keep.has(file.path));
        const referenceFiles = entry.referenceFiles.filter((file) => keep.has(file.path));
        const alternatives = entry.alternatives.map((alternative) => {
          const files = alternative.files.filter((file) => keep.has(file.path));
          return files.length === sourcePaths.length && fingerprint(files) !== fingerprint(referenceFiles)
            ? Object.freeze({ ...alternative, files: Object.freeze(files) }) : null;
        }).filter(Boolean);
        return Object.freeze({ ...entry, sourcePaths: Object.freeze(sourcePaths),
          beforeFiles: Object.freeze(beforeFiles), referenceFiles: Object.freeze(referenceFiles),
          alternatives: Object.freeze(alternatives) });
      })
      .filter((entry) => entry.sourcePaths.length > 0 && entry.alternatives.length > 0)
      .sort((left, right) => left.sourcePaths.length - right.sourcePaths.length
        || left.complexity - right.complexity || left.commit.localeCompare(right.commit));
    for (const candidate of candidates) {
      const before = semanticCase(repository, candidate, runtime, candidate.beforeFiles);
      if (!before.authentic || before.passed) continue;
      authenticPreFixFailures += 1;
      const reference = semanticCase(repository, candidate, runtime, candidate.referenceFiles);
      if (!reference.passed) continue;
      referencePasses += 1;
      let witness = null;
      for (const alternative of candidate.alternatives) {
        const result = semanticCase(repository, candidate, runtime, alternative.files);
        if (result.passed && result.tests === reference.tests) { witness = alternative; break; }
      }
      if (witness === null) continue;
      viable.push(Object.freeze({ ...candidate, alternative_commit: witness.commit,
        alternativeFiles: witness.files, expected_test_count: reference.tests }));
    }
    const singleOptions = viable.map((entry) => {
      if (entry.sourcePaths.length === 1) return Object.freeze([entry]);
      const options = [];
      for (const sourcePath of entry.sourcePaths.slice().sort()) {
        const referenceFiles = entry.referenceFiles.filter((file) => file.path === sourcePath);
        const reference = semanticCase(repository, entry, runtime, referenceFiles);
        if (!reference.passed || reference.tests !== entry.expected_test_count) continue;
        let witness = null;
        const laterCommits = git(repository, ["log", "--format=%H", "--reverse",
          `${entry.commit}..${corpus.source.source_tip}`, "--", sourcePath]).split("\n").filter(Boolean)
          .filter((commit) => gitPathExists(repository, commit, sourcePath)).slice(0, 16);
        for (const commit of laterCommits) {
          const bytes = git(repository, ["show", `${commit}:${sourcePath}`], { encoding: "buffer" });
          if (bytes.includes(0) || bytes.byteLength > 96 * 1024) continue;
          const files = Object.freeze([{ path: sourcePath, content: bytes.toString("utf8") }]);
          if (fingerprint(files) === fingerprint(referenceFiles)) continue;
          const result = semanticCase(repository, entry, runtime, files);
          if (result.passed && result.tests === reference.tests) { witness = { commit, files }; break; }
        }
        if (witness === null) continue;
        options.push(Object.freeze({ ...entry, sourcePaths: Object.freeze([sourcePath]),
          beforeFiles: Object.freeze(entry.beforeFiles.filter((file) => file.path === sourcePath)),
          referenceFiles: Object.freeze(referenceFiles), alternativeFiles: Object.freeze(witness.files),
          alternative_commit: witness.commit, expected_test_count: reference.tests }));
      }
      return Object.freeze(options);
    });
    const matchedOption = new Map(matchBenchmarkV3SinglePathOptions(singleOptions));
    const independent = [...matchedOption.values()];
    const usedPaths = new Set(independent.flatMap((entry) => entry.sourcePaths));
    for (let index = 0; index < viable.length; index += 1) {
      if (matchedOption.has(index) || viable[index].sourcePaths.length > 4
        || viable[index].sourcePaths.some((sourcePath) => usedPaths.has(sourcePath))) continue;
      independent.push(viable[index]);
      for (const sourcePath of viable[index].sourcePaths) usedPaths.add(sourcePath);
    }
    independent.sort((left, right) => left.complexity - right.complexity || left.commit.localeCompare(right.commit));
    const viableUniquePaths = new Set(viable.flatMap((entry) => entry.sourcePaths)).size;
    const singleOptionCandidates = singleOptions.filter((options) => options.length > 0).length;
    expect(independent.length >= 90, `external sampling frame has fewer than 90 calibrated identities `
      + `(aggregate candidates=${candidates.length}, pre_fix_failures=${authenticPreFixFailures}, `
      + `reference_passes=${referencePasses}, alternative_passes=${viable.length}, `
      + `viable_unique_paths=${viableUniquePaths}, single_option_candidates=${singleOptionCandidates}, `
      + `matched_single_identities=${matchedOption.size}, disjoint_identities=${independent.length})`);
    const stratified = stratifyBenchmarkV3ExternalPool(independent);
    const strata = Object.fromEntries(STRATA.map((stratum) => [stratum,
      stratified.filter((entry) => entry.stratum === stratum).length]));
    expect(STRATA.every((stratum) => strata[stratum] >= 30),
      "external sampling frame lacks 30 calibrated identities in every stratum");
    const frame = stratified.map((entry) => Object.freeze({ stratum: entry.stratum,
      source_commit: entry.commit, parent_commit: entry.parent, source_paths: Object.freeze(entry.sourcePaths) }));
    const families = stratified.map((entry) => {
      const clauses = Object.freeze([
        Object.freeze({ clause_id: "REQ-001", kind: "observed-bug", text: `Observed upstream behavior defect:\n${entry.requirementText}` }),
        Object.freeze({ clause_id: "REQ-002", kind: "required-behavior", text: "Correct the observed defect so the documented behavioral examples and their semantic equivalents produce the expected ESLint behavior." }),
        Object.freeze({ clause_id: "REQ-003", kind: "preserved-behavior", text: "Preserve all pre-existing behavior, diagnostics, options, and public APIs outside the observed defect; the full pre-existing upstream test suite remains authoritative." }),
        Object.freeze({ clause_id: "REQ-004", kind: "boundary-error-cases", text: `Public behavioral examples (test-only diff, not implementation):\n${entry.publicTestDelta}` }),
        Object.freeze({ clause_id: "REQ-005", kind: "allowed-mutation", text: `Modify only these supplied source paths: ${entry.sourcePaths.join(", ")}. Do not add, delete, rename, or change modes of other paths.` }),
      ]);
      return Object.freeze({ schema_version: 1, identity: frame[stratified.indexOf(entry)],
        prompt: "Repair the supplied ESLint source according to the visible public contract.", clauses,
        public_files: Object.freeze(entry.beforeFiles), hidden_test_files: Object.freeze(entry.hiddenTestFiles),
        reference_files: Object.freeze(entry.referenceFiles), alternative_files: Object.freeze(entry.alternativeFiles),
        alternative_provenance: Object.freeze({ policy: "first-semantic-later-frozen-history-real-git-bytes-v1",
          source_commit: entry.alternative_commit }),
        defect_severity: "unclassified", test_argv: Object.freeze(entry.hiddenTestFiles.map((file) => file.path)),
        runtime_key: entry.runtime_key, runtime_version: entry.runtime_version,
        expected_test_count: entry.expected_test_count });
    });
    const pool = Object.freeze({ schema_version: 1, provenance_repository: REPOSITORY,
      provenance_source_tip: corpus.source.source_tip,
      sampling_frame_policy: "semantic-private-path-matching-frozen-eslint-history-v5",
      alternative_witness_policy: "first-semantic-later-frozen-history-real-git-bytes-v1", families: Object.freeze(families) });
    return Object.freeze({ frame: Object.freeze(frame), pool, strata: Object.freeze(strata),
      frame_fingerprint: fingerprint(frame), pool_fingerprint: fingerprint(pool), candidate_count: frame.length });
  } finally { fs.rmSync(repository, { recursive: true, force: true }); }
}
