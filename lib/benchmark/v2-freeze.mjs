import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { fingerprintProfileValue } from "../profile-v3.mjs";
import { validateLoadedBenchmarkV2Contracts } from "./v2-contracts.mjs";

export const BENCHMARK_V2_SALT_COMMITMENT_PATH = "benchmarks/v2/holdout/salt-commitment.v2.json";

const EVALUATOR_FILES = Object.freeze([
  "lib/benchmark/paired-defect-evaluator.mjs",
  "lib/benchmark/v2-campaign.mjs",
]);
const GENERATOR_FILES = Object.freeze([
  "lib/benchmark/v2-fixtures.mjs",
  "lib/benchmark/v2-validation-kernels.mjs",
  "lib/benchmark/v2-holdout-selection.mjs",
  "lib/benchmark/vnext-fixtures.mjs",
  "lib/benchmark/renderer.mjs",
  "lib/benchmark/contracts.mjs",
  "benchmarks/synthetic/templates.v2.json",
  "benchmarks/synthetic/families.v2.json",
  "benchmarks/v2/holdout/real-commit-candidates.v2.json",
]);
const HARNESS_FILES = Object.freeze([
  "agents/core.md",
  "agents/core-reviewer.md",
  "profiles/config/core.opencode.json",
  "benchmarks/vnext/components/core-rules.md",
  "benchmarks/vnext/components/targeted-verification.md",
  "benchmarks/vnext/components/independent-final-review.md",
  "benchmarks/vnext/components/deep-context.md",
  "lib/benchmark/profiles.mjs",
  "lib/benchmark/runner.mjs",
  "lib/quality/core-verification-gate.mjs",
  "lib/quality/automatic-review-gate.mjs",
  "lib/quality/bounded-repository-map.mjs",
]);
const PROMOTION_POLICY_FILES = Object.freeze(["benchmarks/v2/promotion-policy.v2.json"]);
const SAFE_BINDING = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,199}$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;

export class BenchmarkV2FreezeError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "BenchmarkV2FreezeError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new BenchmarkV2FreezeError(code, message);
}

function exactKeys(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    fail("BENCHMARK_V2_FREEZE_SCHEMA", `${label} has unexpected fields`);
  }
}

function safeBinding(value, label) {
  if (typeof value !== "string" || !SAFE_BINDING.test(value)) {
    fail("BENCHMARK_V2_FREEZE_INPUT", `${label} is invalid`);
  }
  return value;
}

function repositoryState(root, { requireClean = true } = {}) {
  const sha = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root, encoding: "utf8", shell: false, windowsHide: true,
  });
  const tree = spawnSync("git", ["rev-parse", "HEAD^{tree}"], {
    cwd: root, encoding: "utf8", shell: false, windowsHide: true,
  });
  const status = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: root, encoding: "utf8", shell: false, windowsHide: true,
  });
  const sourceSha = sha.status === 0 ? sha.stdout.trim() : "";
  const treeSha = tree.status === 0 ? tree.stdout.trim() : "";
  if (!/^[0-9a-f]{40}$/u.test(sourceSha) || !/^[0-9a-f]{40}$/u.test(treeSha) || status.status !== 0) {
    fail("BENCHMARK_V2_FREEZE_SOURCE", "Git source identity is unavailable");
  }
  const clean = status.stdout.length === 0;
  if (requireClean && !clean) fail("BENCHMARK_V2_FREEZE_DIRTY", "freeze requires a clean committed source tree");
  return Object.freeze({ source_sha: sourceSha, tree_sha: treeSha, source_clean: clean });
}

function readOrdinaryFile(root, relativePath) {
  const target = path.resolve(root, ...relativePath.split("/"));
  const relative = path.relative(root, target).split(path.sep).join("/");
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch {
    fail("BENCHMARK_V2_FREEZE_FILE", `${relativePath} is unavailable`);
  }
  if (relative !== relativePath || !stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 4 * 1024 * 1024) {
    fail("BENCHMARK_V2_FREEZE_FILE", `${relativePath} is unsafe or unbounded`);
  }
  return fs.readFileSync(target, "utf8").replace(/^\uFEFF/u, "");
}

function closureFingerprint(root, files) {
  return fingerprintProfileValue(files.map((relativePath) => ({
    path: relativePath,
    content: readOrdinaryFile(root, relativePath),
  })));
}

function loadSaltCommitment(root) {
  let value;
  try {
    value = JSON.parse(readOrdinaryFile(root, BENCHMARK_V2_SALT_COMMITMENT_PATH));
  } catch (error) {
    if (error instanceof BenchmarkV2FreezeError) throw error;
    fail("BENCHMARK_V2_FREEZE_SALT", "salt commitment is invalid JSON");
  }
  exactKeys(value, [
    "schema_version", "commitment_id", "algorithm", "commitment",
    "created_before_holdout_selection", "preimage_storage",
  ], "salt commitment");
  if (value.schema_version !== 2
    || value.commitment_id !== "benchmark-v2-holdout-preregistered-salt"
    || value.algorithm !== "profile-value-sha256-v1"
    || !SHA256.test(value.commitment)
    || value.created_before_holdout_selection !== true
    || value.preimage_storage !== "git-ignored-private-runtime-state") {
    fail("BENCHMARK_V2_FREEZE_SALT", "salt commitment contract drifted");
  }
  return Object.freeze(value);
}

function validateSalt(salt, commitment) {
  if (typeof salt !== "string" || !/^[0-9a-f]{64}$/u.test(salt)
    || fingerprintProfileValue(salt) !== commitment.commitment) {
    fail("BENCHMARK_V2_FREEZE_SALT", "salt preimage does not match the preregistered commitment");
  }
}

function alphaForRound(policyPathContent, round) {
  const policy = JSON.parse(policyPathContent);
  const entry = policy.alpha_spending?.find((candidate) => candidate.round === round);
  if (entry === undefined) fail("BENCHMARK_V2_FREEZE_ROUND", "confirmatory round is outside the preregistered alpha schedule");
  return entry.alpha;
}

function canonicalFreezeBindings(root, {
  round,
  workflowRunId,
  salt,
  model,
  provider,
  variant,
  timeoutMs,
  candidateProfileId,
  executableFingerprint,
  requireClean,
}) {
  if (!Number.isSafeInteger(round) || round < 1 || round > 3
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 60_000 || timeoutMs > 3_600_000) {
    fail("BENCHMARK_V2_FREEZE_INPUT", "round or timeout is invalid");
  }
  if (typeof workflowRunId !== "string" || !/^[1-9][0-9]{0,19}$/u.test(workflowRunId)) {
    fail("BENCHMARK_V2_FREEZE_INPUT", "workflowRunId must be a canonical GitHub run ID");
  }
  safeBinding(model, "model");
  safeBinding(provider, "provider");
  safeBinding(variant, "variant");
  if (!/^P[1-4]$/u.test(candidateProfileId)) {
    fail("BENCHMARK_V2_FREEZE_INPUT", "candidateProfileId must be a bounded non-assurance candidate arm");
  }
  if (!SHA256.test(executableFingerprint)) fail("BENCHMARK_V2_FREEZE_INPUT", "executableFingerprint is invalid");
  const state = repositoryState(root, { requireClean });
  const contracts = validateLoadedBenchmarkV2Contracts(root);
  const saltCommitment = loadSaltCommitment(root);
  validateSalt(salt, saltCommitment);
  const evaluatorFingerprint = closureFingerprint(root, EVALUATOR_FILES);
  const generatorFingerprint = closureFingerprint(root, GENERATOR_FILES);
  const harnessFingerprint = closureFingerprint(root, HARNESS_FILES);
  const policyFingerprint = closureFingerprint(root, PROMOTION_POLICY_FILES);
  const seedSource = {
    frozen_candidate_sha: state.source_sha,
    github_workflow_run_id: workflowRunId,
    preregistered_salt: salt,
  };
  return Object.freeze({
    state,
    contracts,
    saltCommitment,
    evaluatorFingerprint,
    generatorFingerprint,
    harnessFingerprint,
    policyFingerprint,
    seed: fingerprintProfileValue(seedSource),
    allocatedAlpha: alphaForRound(readOrdinaryFile(root, "benchmarks/v2/promotion-policy.v2.json"), round),
  });
}

export function buildBenchmarkV2FreezeManifest({
  repositoryRoot,
  round,
  workflowRunId,
  salt,
  model,
  provider,
  variant,
  timeoutMs = 300_000,
  candidateProfileId = "P4",
  executableFingerprint,
  requireClean = true,
} = {}) {
  const root = fs.realpathSync.native(path.resolve(repositoryRoot));
  const frozen = canonicalFreezeBindings(root, {
    round, workflowRunId, salt, model, provider, variant, timeoutMs,
    candidateProfileId, executableFingerprint, requireClean,
  });
  const bindings = Object.freeze({
    harness_source_sha: frozen.state.source_sha,
    harness_tree_sha: frozen.state.tree_sha,
    harness_fingerprint: frozen.harnessFingerprint,
    evaluator_fingerprint: frozen.evaluatorFingerprint,
    promotion_policy_fingerprint: frozen.policyFingerprint,
    task_generator_fingerprint: frozen.generatorFingerprint,
    benchmark_contract_fingerprint: frozen.contracts.contract_fingerprint,
    model,
    provider,
    variant,
    timeout_ms: timeoutMs,
    executable_fingerprint: executableFingerprint,
    candidate_profile_id: candidateProfileId,
    arm_ordering_policy: "sha256-family-repetition-counterbalance-v1",
  });
  const source = {
    schema_version: 2,
    manifest_kind: "benchmark-v2-confirmatory-freeze",
    status: "frozen-pre-selection",
    confirmatory_round: round,
    allocated_alpha: frozen.allocatedAlpha,
    github_workflow_run_id: workflowRunId,
    salt_commitment: frozen.saltCommitment.commitment,
    holdout_seed: frozen.seed,
    holdout_selected: false,
    selected_holdout_manifest: null,
    bindings,
  };
  return Object.freeze({ ...source, freeze_fingerprint: fingerprintProfileValue(source) });
}

export function validateBenchmarkV2FreezeManifest(manifest, {
  repositoryRoot,
  salt,
  requireClean = true,
  expectedFreezeFingerprint = null,
  observedExecutableFingerprint = null,
} = {}) {
  exactKeys(manifest, [
    "schema_version", "manifest_kind", "status", "confirmatory_round", "allocated_alpha",
    "github_workflow_run_id", "salt_commitment", "holdout_seed", "holdout_selected",
    "selected_holdout_manifest", "bindings", "freeze_fingerprint",
  ], "freeze manifest");
  const { freeze_fingerprint: declared, ...source } = manifest;
  if (manifest.schema_version !== 2 || manifest.manifest_kind !== "benchmark-v2-confirmatory-freeze"
    || manifest.status !== "frozen-pre-selection" || manifest.holdout_selected !== false
    || manifest.selected_holdout_manifest !== null || declared !== fingerprintProfileValue(source)) {
    fail("BENCHMARK_V2_FREEZE_SCHEMA", "freeze manifest identity or state is invalid");
  }
  if (expectedFreezeFingerprint !== null && expectedFreezeFingerprint !== declared) {
    fail("BENCHMARK_V2_FREEZE_IDENTITY", "freeze manifest does not match the externally bound fingerprint");
  }
  if (observedExecutableFingerprint !== null
    && observedExecutableFingerprint !== manifest.bindings?.executable_fingerprint) {
    fail("BENCHMARK_V2_FREEZE_EXECUTABLE", "current executable identity does not match the frozen binding");
  }
  exactKeys(manifest.bindings, [
    "harness_source_sha", "harness_tree_sha", "harness_fingerprint", "evaluator_fingerprint",
    "promotion_policy_fingerprint", "task_generator_fingerprint", "benchmark_contract_fingerprint",
    "model", "provider", "variant", "timeout_ms", "executable_fingerprint",
    "candidate_profile_id", "arm_ordering_policy",
  ], "freeze bindings");
  const rebuilt = buildBenchmarkV2FreezeManifest({
    repositoryRoot,
    round: manifest.confirmatory_round,
    workflowRunId: manifest.github_workflow_run_id,
    salt,
    model: manifest.bindings.model,
    provider: manifest.bindings.provider,
    variant: manifest.bindings.variant,
    timeoutMs: manifest.bindings.timeout_ms,
    candidateProfileId: manifest.bindings.candidate_profile_id,
    executableFingerprint: manifest.bindings.executable_fingerprint,
    requireClean,
  });
  if (rebuilt.freeze_fingerprint !== declared) {
    fail("BENCHMARK_V2_FREEZE_STALE", "source, evaluator, policy, generator, binding, or seed drifted after freeze");
  }
  return manifest;
}

export function writeBenchmarkV2FreezeManifest(repositoryRoot, manifest, { salt } = {}) {
  const root = fs.realpathSync.native(path.resolve(repositoryRoot));
  validateBenchmarkV2FreezeManifest(manifest, {
    repositoryRoot: root,
    salt,
    expectedFreezeFingerprint: manifest.freeze_fingerprint,
  });
  const directory = path.join(root, ".oc_harness", "benchmark-v2", "freezes");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, `round-${manifest.confirmatory_round}-${manifest.freeze_fingerprint.slice(7, 31)}.json`);
  fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return path.relative(root, target).split(path.sep).join("/");
}
