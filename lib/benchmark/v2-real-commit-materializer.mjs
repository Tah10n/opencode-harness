import { createHmac, timingSafeEqual } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { fingerprintProfileValue } from "../profile-v3.mjs";

const SHA1 = /^[0-9a-f]{40}$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const SAFE_PATH_LIMIT = 256;
const FILE_LIMIT = 1024 * 1024;
const SNAPSHOT_LIMIT = 20;
const SNAPSHOT_BYTE_LIMIT = 4 * 1024 * 1024;

export class BenchmarkV2RealCommitMaterializerError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "BenchmarkV2RealCommitMaterializerError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new BenchmarkV2RealCommitMaterializerError(code, message);
}

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function safePath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= SAFE_PATH_LIMIT
    && !value.startsWith("/") && !value.includes("\\")
    && value.split("/").every((part) => !["", ".", ".."].includes(part));
}

function canonicalRemote(value) {
  return String(value).replace(/^git\+/u, "").replace(/\.git$/u, "").replace(/\/$/u, "");
}

function git(root, args, { binary = false, maxBuffer = 8 * 1024 * 1024 } = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: binary ? null : "utf8",
    shell: false,
    windowsHide: true,
    maxBuffer,
    env: {
      PATH: process.env.PATH,
      LANG: "C",
      LC_ALL: "C",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
    },
  });
  if (result.status !== 0 || result.error !== undefined) {
    fail("BENCHMARK_V2_REAL_GIT", `Git metadata operation failed: git ${args[0]}`);
  }
  return binary ? result.stdout : result.stdout.replace(/\r\n/gu, "\n").trimEnd();
}

function validateRegistryBoundary(registry) {
  if (registry?.schema_version !== 2
    || registry.registry_id !== "benchmark-v2-real-commit-candidates"
    || registry.selection_status !== "candidate-pool-not-selected"
    || registry.task_materialization_status !== "provenance-curated-fixtures-not-yet-materialized"
    || registry.reference_patch_access !== "forbidden-before-model-settlement"
    || !Array.isArray(registry.repositories) || !Array.isArray(registry.candidates)) {
    fail("BENCHMARK_V2_REAL_REGISTRY", "real-commit registry boundary is invalid");
  }
}

function candidateRecord(registry, candidateId) {
  validateRegistryBoundary(registry);
  const candidate = registry.candidates.find((entry) => entry.id === candidateId);
  const repository = registry.repositories.find((entry) => entry.id === candidate?.repository_id);
  if (candidate === undefined || repository === undefined || !SHA1.test(candidate.commit_sha)
    || !SHA1.test(candidate.parent_sha) || !Array.isArray(candidate.changed_paths)
    || candidate.changed_paths.some((entry) => !safePath(entry))) {
    fail("BENCHMARK_V2_REAL_CANDIDATE", "real-commit candidate or repository is invalid");
  }
  return { candidate, repository };
}

function requirementRecord(requirements, candidateId) {
  if (requirements?.schema_version !== 2
    || requirements.manifest_id !== "benchmark-v2-real-commit-visible-requirements"
    || requirements.status !== "curated-pre-reference-oracle-audit"
    || requirements.requirements_visibility !== "complete-for-declared-oracle-scope"
    || requirements.reference_patch_access !== "forbidden-before-model-settlement"
    || requirements.oracle_scope_policy !== "post-settlement checks may assert only the visible requirement and parent-visible public contracts"
    || !Array.isArray(requirements.requirements)) {
    fail("BENCHMARK_V2_REAL_REQUIREMENTS", "visible requirement manifest boundary is invalid");
  }
  const matches = requirements.requirements.filter((entry) => entry.candidate_id === candidateId);
  if (matches.length !== 1 || typeof matches[0].visible_requirement !== "string"
    || matches[0].visible_requirement.length < 40 || typeof matches[0].evidence_url !== "string") {
    fail("BENCHMARK_V2_REAL_REQUIREMENTS", "candidate does not have one curated visible requirement");
  }
  return matches[0];
}

function verifyRepository(root, repository) {
  const top = fs.realpathSync.native(path.resolve(root));
  if (!fs.statSync(top).isDirectory() || git(top, ["rev-parse", "--is-inside-work-tree"]) !== "true") {
    fail("BENCHMARK_V2_REAL_REPOSITORY", "materializer source is not a Git work tree");
  }
  const remote = git(top, ["remote", "get-url", "origin"]);
  if (canonicalRemote(remote) !== canonicalRemote(repository.url)) {
    fail("BENCHMARK_V2_REAL_REMOTE", "repository origin does not match the preregistered source");
  }
  return top;
}

function verifyCommitMetadata(root, candidate, repository) {
  if (git(root, ["cat-file", "-t", candidate.parent_sha]) !== "commit"
    || git(root, ["cat-file", "-t", candidate.commit_sha]) !== "commit") {
    fail("BENCHMARK_V2_REAL_COMMIT", "preregistered commit objects are unavailable");
  }
  const parents = git(root, ["show", "-s", "--format=%P", candidate.commit_sha]).split(" ").filter(Boolean);
  if (parents.length !== 1 || parents[0] !== candidate.parent_sha) {
    fail("BENCHMARK_V2_REAL_PARENT", "preregistered parent is not the sole commit parent");
  }
  const licenseBlob = git(root, ["rev-parse", `${candidate.parent_sha}:${repository.license_path}`]);
  if (!repository.license_blob_shas.includes(licenseBlob)) {
    fail("BENCHMARK_V2_REAL_LICENSE", "parent license blob does not match the MIT provenance record");
  }
  const changed = git(root, [
    "diff-tree", "--no-commit-id", "--name-only", "-r", "--no-renames",
    candidate.parent_sha, candidate.commit_sha,
  ]).split("\n").filter(Boolean).sort();
  if (changed.some((entry) => !safePath(entry))
    || JSON.stringify(changed) !== JSON.stringify([...candidate.changed_paths].sort())) {
    fail("BENCHMARK_V2_REAL_CHANGED_PATHS", "commit changed paths do not match preregistration");
  }
}

function parentTreePaths(root, parentSha) {
  const output = git(root, ["ls-tree", "-r", "--name-only", "-z", parentSha], { binary: true });
  return output.toString("utf8").split("\0").filter(Boolean).filter(safePath).sort();
}

function selectParentPaths(treePaths, candidate, repository) {
  const present = new Set(treePaths);
  const required = [repository.license_path, ...candidate.changed_paths].filter((entry) => present.has(entry));
  const preferred = treePaths.filter((entry) => /^(?:package(?:-lock)?\.json|readme(?:\.md)?|index\.(?:js|mjs|cjs|ts|d\.ts)|test\.(?:js|mjs|cjs|ts))$/iu.test(entry)
    || /^(?:lib|source|src|test|tests)\//u.test(entry));
  const ordered = [...new Set([...required, ...preferred, ...treePaths])];
  if (required.length > SNAPSHOT_LIMIT) {
    fail("BENCHMARK_V2_REAL_SNAPSHOT", "required parent files exceed the public snapshot limit");
  }
  return ordered.slice(0, SNAPSHOT_LIMIT).sort();
}

function readBlob(root, revision, relativePath) {
  const sizeText = git(root, ["cat-file", "-s", `${revision}:${relativePath}`]);
  const size = Number(sizeText);
  if (!Number.isSafeInteger(size) || size < 0 || size > FILE_LIMIT) {
    fail("BENCHMARK_V2_REAL_FILE", "repository file exceeds the per-file limit");
  }
  const content = git(root, ["show", `${revision}:${relativePath}`], { binary: true, maxBuffer: FILE_LIMIT + 1024 });
  if (content.length !== size || content.includes(0)) {
    fail("BENCHMARK_V2_REAL_FILE", "repository file is binary or changed during materialization");
  }
  return content.toString("utf8");
}

function snapshotFiles(root, revision, paths) {
  const files = paths.map((relativePath) => Object.freeze({
    path: relativePath,
    content: readBlob(root, revision, relativePath),
  }));
  if (files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0) > SNAPSHOT_BYTE_LIMIT) {
    fail("BENCHMARK_V2_REAL_SNAPSHOT", "public parent snapshot exceeds the total byte limit");
  }
  return Object.freeze(files);
}

export function prepareBenchmarkV2RealCommitCandidate({ registry, requirements, candidateId, repositoryRoot } = {}) {
  const { candidate, repository } = candidateRecord(registry, candidateId);
  const requirement = requirementRecord(requirements, candidateId);
  const root = verifyRepository(repositoryRoot, repository);
  verifyCommitMetadata(root, candidate, repository);
  const publicFiles = snapshotFiles(root, candidate.parent_sha,
    selectParentPaths(parentTreePaths(root, candidate.parent_sha), candidate, repository));
  const source = {
    schema_version: 2,
    candidate_id: candidate.id,
    stratum: candidate.stratum,
    origin: "real-commit-derived-compatible-license",
    repository_id: repository.id,
    repository_url: repository.url,
    parent_sha: candidate.parent_sha,
    commit_sha: candidate.commit_sha,
    visible_requirement: requirement.visible_requirement,
    requirement_evidence_url: requirement.evidence_url,
    requirement_source: "curated-from-public-metadata-without-reference-patch",
    oracle_scope_policy: requirements.oracle_scope_policy,
    allowed_changed_paths: Object.freeze([...candidate.changed_paths].sort()),
    public_files: publicFiles,
    reference_patch_access: "forbidden-before-model-settlement",
  };
  return Object.freeze({ ...source, fixture_fingerprint: fingerprintProfileValue(source) });
}

function receiptMac(body, secret) {
  if (!Buffer.isBuffer(secret) || secret.length < 32) {
    fail("BENCHMARK_V2_REAL_SETTLEMENT_SECRET", "settlement secret must contain at least 256 bits");
  }
  return createHmac("sha256", secret).update(JSON.stringify(body)).digest("hex");
}

export function createBenchmarkV2RealCommitSettlementReceipt({ prepared, modelRunFingerprint, completedAt, secret } = {}) {
  if (!SHA256.test(prepared?.fixture_fingerprint) || !SHA256.test(modelRunFingerprint)
    || typeof completedAt !== "string" || Number.isNaN(Date.parse(completedAt))) {
    fail("BENCHMARK_V2_REAL_SETTLEMENT", "settlement receipt input is invalid");
  }
  const body = Object.freeze({
    schema_version: 2,
    status: "model-settled",
    candidate_id: prepared.candidate_id,
    fixture_fingerprint: prepared.fixture_fingerprint,
    model_run_fingerprint: modelRunFingerprint,
    completed_at: completedAt,
  });
  return Object.freeze({ ...body, settlement_mac: receiptMac(body, secret) });
}

function validateReceipt(prepared, receipt, secret) {
  if (!exactKeys(receipt, [
    "schema_version", "status", "candidate_id", "fixture_fingerprint",
    "model_run_fingerprint", "completed_at", "settlement_mac",
  ])) {
    fail("BENCHMARK_V2_REAL_SETTLEMENT", "settlement receipt schema is invalid");
  }
  const { settlement_mac: actual, ...body } = receipt ?? {};
  if (body.schema_version !== 2 || body.status !== "model-settled"
    || body.candidate_id !== prepared.candidate_id
    || body.fixture_fingerprint !== prepared.fixture_fingerprint
    || !SHA256.test(body.model_run_fingerprint)
    || typeof actual !== "string" || !/^[0-9a-f]{64}$/u.test(actual)) {
    fail("BENCHMARK_V2_REAL_SETTLEMENT", "reference access requires a bound model-settlement receipt");
  }
  const expected = receiptMac(body, secret);
  if (!timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"))) {
    fail("BENCHMARK_V2_REAL_SETTLEMENT", "model-settlement receipt authentication failed");
  }
}

export function materializeBenchmarkV2RealCommitReference({
  registry, prepared, repositoryRoot, settlementReceipt, settlementSecret,
} = {}) {
  const { candidate, repository } = candidateRecord(registry, prepared?.candidate_id);
  const root = verifyRepository(repositoryRoot, repository);
  verifyCommitMetadata(root, candidate, repository);
  validateReceipt(prepared, settlementReceipt, settlementSecret);
  const treePaths = new Set(parentTreePaths(root, candidate.commit_sha));
  const referenceFiles = Object.freeze(candidate.changed_paths.map((relativePath) => Object.freeze({
    path: relativePath,
    operation: treePaths.has(relativePath) ? "write" : "delete",
    ...(treePaths.has(relativePath) ? { content: readBlob(root, candidate.commit_sha, relativePath) } : {}),
  })));
  const source = {
    schema_version: 2,
    candidate_id: candidate.id,
    fixture_fingerprint: prepared.fixture_fingerprint,
    model_run_fingerprint: settlementReceipt.model_run_fingerprint,
    reference_files: referenceFiles,
    reference_patch_access: "runner-only-after-model-settlement",
  };
  return Object.freeze({ ...source, reference_fingerprint: fingerprintProfileValue(source) });
}
