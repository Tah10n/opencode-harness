import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

import { ContractError, fingerprint } from "../feedback/contracts.mjs";
import { runManagedCommand } from "../feedback/process-tree.mjs";
import { buildProfileBundleManifest } from "../profile-v3.mjs";
import { evaluatePairedDefects } from "./paired-defect-evaluator.mjs";
import { coreTrustedCheckCommandFingerprint, loadCoreVerificationCatalog } from "../../runtime/core-verification-runtime.mjs";
import { captureBenchmarkV3Workspace, evaluateBenchmarkV3Workspace, fingerprintBenchmarkV3SemanticRuntime, loadBenchmarkV3Corpus, materializeBenchmarkV3Workspace } from "./v3-corpus.mjs";
import {
  assessBenchmarkV3BaselineOpportunity,
  exactBinomialUpperConfidenceBound,
  exactBinomialUpperTail,
  exactConservativePairedDeltaInterval,
  loadBenchmarkV3Design,
} from "./v3-design.mjs";
import {
  appendBenchmarkV3LedgerEvent,
  createBenchmarkV3Ledger,
  freezeBenchmarkV3FinalCandidate,
  selectBenchmarkV3Candidate,
} from "./v3-ledger.mjs";

const AUTHORIZED_GATES = new WeakSet();
const FP = /^sha256:[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u;

function fail(code, message) { throw new ContractError(code, message); }
function expect(condition, code, message) { if (!condition) fail(code, message); }
function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8", shell: false, windowsHide: true, maxBuffer: 32 * 1024 * 1024, ...options,
  });
}
function passed(result) { return result.error === undefined && result.signal === null && result.status === 0; }
function gitSha(root) {
  const result = run("git", ["rev-parse", "HEAD"], { cwd: root });
  expect(passed(result) && /^[0-9a-f]{40}$/u.test(result.stdout.trim()), "BENCHMARK_V3_RUNNER_SOURCE", "source SHA is unavailable");
  return result.stdout.trim();
}
function assertClean(root) {
  const result = run("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root });
  expect(passed(result) && result.stdout.length === 0, "BENCHMARK_V3_RUNNER_SOURCE", "model-backed execution requires a clean committed source tree");
}
function assertReviewedSourceCurrent(root, sourceSha, sourceTreeFingerprint) {
  assertClean(root);
  expect(gitSha(root) === sourceSha && buildProfileBundleManifest(root, "lab").manifest.source_tree_fingerprint === sourceTreeFingerprint,
    "BENCHMARK_V3_RUNNER_SOURCE", "reviewed runner source changed after the model-free gate");
}
function modelEnvironment(source = process.env) {
  const allowed = new Set(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
    "OPENROUTER_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEY", "AZURE_OPENAI_API_KEY", "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_REGION", "AWS_DEFAULT_REGION"]);
  return Object.fromEntries(Object.entries(source).filter(([key, value]) => allowed.has(key) && typeof value === "string"));
}
function coreCatalogFingerprint(workspace) {
  const file = path.join(workspace, ".git", "opencode-harness", "core", "checks.json");
  if (!fs.existsSync(file)) return null;
  const stat = fs.lstatSync(file);
  expect(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, "BENCHMARK_V3_RUNNER_WORKSPACE", "core catalog is not an ordinary file");
  return `sha256:${createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`;
}
function benchmarkV3CandidateCheck(family) {
  const syntaxProgram = "const{spawnSync}=require('node:child_process');for(const f of process.argv.slice(1)){const r=spawnSync(process.execPath,['--check',f],{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1)}";
  return Object.freeze({ check_id: "v3-public-syntax-all", scope_prefixes: [...family.control_surface.allowed_mutation_paths].sort(),
    cost_rank: 1, executable_path: fs.realpathSync.native(process.execPath),
    argv: ["-e", syntaxProgram, ...family.public_surface.public_files.map((entry) => entry.path)], cwd: ".", timeout_ms: 30_000 });
}
function benchmarkV3ActivationBinding(workspace) {
  const catalog = loadCoreVerificationCatalog(workspace);
  expect(catalog.checks.length === 1, "BENCHMARK_V3_RUNNER_WORKSPACE", "candidate catalog must contain exactly one trusted check");
  return Object.freeze({
    catalog_fingerprint: catalog.catalog_fingerprint,
    command_fingerprint: coreTrustedCheckCommandFingerprint(catalog.checks[0]),
  });
}

export function classifyBenchmarkV3AttemptReceipt(receipt, armKind) {
  const authentic = receipt?.schema_version === 1 && receipt.signal === null && receipt.timed_out === false
    && receipt.error_code === null && receipt.protocol_valid === true && receipt.usage_observed === true
    && Number.isSafeInteger(receipt.terminal_event_count) && receipt.terminal_event_count > 0
    && Number.isSafeInteger(receipt.json_event_count) && receipt.json_event_count > 0
    && [0, 20].includes(receipt.status)
    && (armKind === "baseline" || receipt.activation_receipt_authentic === true);
  const verificationSucceeded = authentic && receipt.status === 0
    && (armKind === "baseline" || receipt.activation_receipt_valid === true);
  return Object.freeze({ receipt_authentic: authentic, complete_scored_outcome: authentic,
    verification_succeeded: verificationSucceeded, infrastructure_failure: !authentic });
}
function closedDirectoryFingerprint(directory) {
  const root = fs.realpathSync.native(directory);
  const entries = [];
  const visit = (current, prefix = "") => {
    for (const name of fs.readdirSync(current).sort()) {
      const relative = prefix === "" ? name : `${prefix}/${name}`;
      const target = path.join(current, name);
      const stat = fs.lstatSync(target);
      expect(!stat.isSymbolicLink() && (stat.isDirectory() || (stat.isFile() && stat.nlink === 1)),
        "BENCHMARK_V3_RUNNER_PRODUCT_BINDING", "attempt configuration contains an unsupported entry");
      if (stat.isDirectory()) visit(target, relative);
      else entries.push({ path: relative, size: stat.size, sha256: `sha256:${createHash("sha256").update(fs.readFileSync(target)).digest("hex")}` });
    }
  };
  visit(root);
  return fingerprint(entries);
}
function sandboxLiteral(value) { return JSON.stringify(fs.realpathSync.native(value)); }
function benchmarkV3SandboxProfile({ workspace, attemptDirectory, opencodePath, workerPath }) {
  expect(process.platform === "darwin" && fs.existsSync("/usr/bin/sandbox-exec"), "BENCHMARK_V3_RUNNER_FILESYSTEM_ISOLATION",
    "a supported filesystem sandbox backend is unavailable");
  const readableSystem = ["/System", "/usr", "/Library", "/opt/homebrew", path.dirname(process.execPath)].filter((entry) => fs.existsSync(entry));
  return ["(version 1)", "(deny default)", "(allow process*)", "(allow network-outbound)", "(allow mach-lookup)",
    "(allow sysctl-read)", "(allow file-read-metadata)",
    `(allow file-read* ${readableSystem.map((entry) => `(subpath ${sandboxLiteral(entry)})`).join(" ")}`,
    `  (subpath ${sandboxLiteral(workspace)}) (subpath ${sandboxLiteral(attemptDirectory)})`,
    `  (literal ${sandboxLiteral(opencodePath)}) (literal ${sandboxLiteral(workerPath)}))`,
    `(allow file-write* (subpath ${sandboxLiteral(workspace)}) (subpath ${sandboxLiteral(attemptDirectory)}) (literal "/dev/null"))`,
  ].join("\n");
}

export function verifyBenchmarkV3FilesystemIsolation(sourceRoot, opencodeIdentity) {
  const probe = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "benchmark-v3-sandbox-probe-"));
  try {
    const workspace = path.join(probe, "workspace"); fs.mkdirSync(workspace);
    const allowed = path.join(workspace, "allowed.txt"); fs.writeFileSync(allowed, "public\n");
    const forbidden = path.join(sourceRoot, "benchmarks", "v3", "corpus", "index.json");
    const worker = path.join(sourceRoot, "scripts", "benchmark-v3-attempt-worker.mjs");
    const profile = benchmarkV3SandboxProfile({ workspace, attemptDirectory: probe, opencodePath: opencodeIdentity.path, workerPath: worker });
    const profileFile = path.join(probe, "profile.sb"); fs.writeFileSync(profileFile, profile, { mode: 0o600 });
    const program = "const fs=require('node:fs');if(fs.readFileSync(process.argv[1],'utf8')!=='public\\n')process.exit(2);try{fs.readFileSync(process.argv[2]);process.exit(3)}catch{process.exit(0)}";
    const result = run("/usr/bin/sandbox-exec", ["-f", profileFile, process.execPath, "-e", program, allowed, forbidden],
      { env: { PATH: "/usr/bin:/bin", HOME: probe, TMPDIR: probe, LANG: "C", LC_ALL: "C" }, timeout: 30_000 });
    expect(passed(result), "BENCHMARK_V3_RUNNER_FILESYSTEM_ISOLATION", "filesystem sandbox did not enforce the closed read boundary");
    fail("BENCHMARK_V3_RUNNER_NETWORK_ISOLATION", "provider-only network isolation is unavailable; unrestricted outbound access would reveal public upstream oracles");
  } finally { fs.rmSync(probe, { recursive: true, force: true }); }
}

export function verifyBenchmarkV3OpenCodeExecutable(executable) {
  expect(typeof executable === "string" && path.isAbsolute(executable), "BENCHMARK_V3_RUNNER_OPENCODE", "an absolute OpenCode executable path is required");
  const resolved = fs.realpathSync.native(executable);
  const stat = fs.lstatSync(resolved);
  expect(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && (stat.mode & 0o111) !== 0 && stat.size > 0 && stat.size <= 256 * 1024 * 1024,
    "BENCHMARK_V3_RUNNER_OPENCODE", "OpenCode must resolve to one bounded executable ordinary file");
  const versionResult = run(resolved, ["--version"], { env: modelEnvironment(), timeout: 30_000, maxBuffer: 64 * 1024 });
  const version = versionResult.stdout.trim();
  expect(passed(versionResult) && /^1\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/u.test(version), "BENCHMARK_V3_RUNNER_OPENCODE", "OpenCode version probe failed");
  const helpResult = run(resolved, ["run", "--help"], { env: modelEnvironment(), timeout: 30_000, maxBuffer: 256 * 1024 });
  expect(passed(helpResult), "BENCHMARK_V3_RUNNER_OPENCODE", "OpenCode run capability probe failed");
  const help = `${helpResult.stdout}\n${helpResult.stderr}`;
  const body = Object.freeze({ schema_version: 1, path: resolved, size: stat.size, mode: stat.mode & 0o7777,
    device: String(stat.dev), inode: String(stat.ino), sha256: `sha256:${createHash("sha256").update(fs.readFileSync(resolved)).digest("hex")}`, version,
    variant_supported: /(?:^|\s)--variant(?:\s|,|$)/mu.test(help), seed_supported: /(?:^|\s)--seed(?:\s|,|$)/mu.test(help) });
  return Object.freeze({ ...body, executable_fingerprint: fingerprint(body) });
}

export function verifyBenchmarkV3ProductBundle(sourceRoot, materializedCoreDirectory) {
  const source = fs.realpathSync.native(path.resolve(sourceRoot));
  const installed = fs.realpathSync.native(path.resolve(materializedCoreDirectory));
  const expected = buildProfileBundleManifest(source, "core").manifest;
  let observed;
  try { observed = JSON.parse(fs.readFileSync(path.join(installed, ".opencode-profile-manifest.json"), "utf8")); } catch {
    fail("BENCHMARK_V3_RUNNER_PRODUCT_BINDING", "materialized core manifest is unavailable");
  }
  expect(fingerprint(observed) === fingerprint(expected) && observed.bundle_fingerprint === expected.bundle_fingerprint
    && observed.source_sha === gitSha(source) && observed.source_git_clean === true && observed.source_all_tracked === true,
  "BENCHMARK_V3_RUNNER_PRODUCT_BINDING", "materialized core manifest does not match the exact clean source");
  const declared = new Set([".opencode-profile-manifest.json", ...expected.files.map((entry) => entry.path)]);
  const actual = [];
  const visit = (directory, prefix = "") => {
    for (const name of fs.readdirSync(directory).sort()) {
      const relative = prefix === "" ? name : `${prefix}/${name}`;
      const target = path.join(directory, name);
      const stat = fs.lstatSync(target);
      expect(!stat.isSymbolicLink(), "BENCHMARK_V3_RUNNER_PRODUCT_BINDING", "materialized core contains a link");
      if (stat.isDirectory()) visit(target, relative);
      else if (stat.isFile() && stat.nlink === 1) actual.push(relative);
      else fail("BENCHMARK_V3_RUNNER_PRODUCT_BINDING", "materialized core contains an unsupported entry");
    }
  };
  visit(installed);
  expect(actual.length === declared.size && actual.every((entry) => declared.has(entry)), "BENCHMARK_V3_RUNNER_PRODUCT_BINDING", "materialized core file set drifted");
  for (const entry of expected.files) {
    const bytes = fs.readFileSync(path.join(installed, ...entry.path.split("/")));
    expect(bytes.byteLength === entry.size && `sha256:${createHash("sha256").update(bytes).digest("hex")}` === entry.sha256,
      "BENCHMARK_V3_RUNNER_PRODUCT_BINDING", `materialized core bytes drifted at ${entry.path}`);
  }
  return Object.freeze({ source_root: source, source_sha: expected.source_sha, materialized_core_directory: installed,
    architecture_fingerprint: expected.bundle_fingerprint, product_bundle_fingerprint: expected.bundle_fingerprint });
}

export function buildBenchmarkV3ModelBinding({ executableFingerprint, opencodeVersion, provider, model, variant,
  variantSupported, modelSamplingSeedSupported, corpusGenerationSeed, modelSamplingSeed = null,
  candidateBundleFingerprints, evaluatorFingerprint, corpusFingerprint, designFingerprint, semanticRuntimeFingerprint }) {
  expect(FP.test(executableFingerprint) && FP.test(evaluatorFingerprint) && FP.test(corpusFingerprint)
    && FP.test(designFingerprint) && FP.test(semanticRuntimeFingerprint), "BENCHMARK_V3_RUNNER_BINDING", "binding fingerprints are invalid");
  for (const value of [opencodeVersion, provider, model, variant, corpusGenerationSeed]) expect(typeof value === "string" && value.length > 0, "BENCHMARK_V3_RUNNER_BINDING", "binding identity is invalid");
  expect(modelSamplingSeed === null || (modelSamplingSeedSupported === true && typeof modelSamplingSeed === "string" && modelSamplingSeed.length > 0),
    "BENCHMARK_V3_RUNNER_BINDING", "unsupported model sampling seed cannot be bound");
  return Object.freeze({ executable_fingerprint: executableFingerprint, opencode_version: opencodeVersion, provider, model, variant,
    supported_sampling_parameters: Object.freeze({ variant: variantSupported === true, model_sampling_seed: modelSamplingSeedSupported === true }),
    corpus_generation_seed: corpusGenerationSeed, model_sampling_seed: modelSamplingSeed,
    candidate_bundle_fingerprints: Object.freeze([...candidateBundleFingerprints]), evaluator_fingerprint: evaluatorFingerprint,
    corpus_fingerprint: corpusFingerprint, arm_order: "baseline-before-candidate-per-split", design_fingerprint: designFingerprint,
    semantic_runtime_fingerprint: semanticRuntimeFingerprint });
}

function loadReviewReceipt(file, sourceSha, sourceTreeFingerprint) {
  let value;
  try { value = JSON.parse(fs.readFileSync(file, "utf8")); } catch { fail("BENCHMARK_V3_RUNNER_REVIEW", "review receipt is unavailable"); }
  expect(value?.schema_version === 1 && SAFE_ID.test(value.reviewer_id) && value.read_only === true && value.verdict === "passed"
    && value.high_findings === 0 && value.medium_findings === 0 && value.source_sha === sourceSha
    && value.corpus_contract_reviewed === true && value.contract_coverage_reviewed === true && value.oracle_leakage_reviewed === true
    && value.source_tree_fingerprint === sourceTreeFingerprint && FP.test(value.review_fingerprint),
  "BENCHMARK_V3_RUNNER_REVIEW", "review receipt is invalid or stale");
  const body = { ...value }; delete body.review_fingerprint;
  expect(value.review_fingerprint === fingerprint(body), "BENCHMARK_V3_RUNNER_REVIEW", "review receipt fingerprint is stale");
  return Object.freeze(value);
}

export function runBenchmarkV3ModelFreeGate({ sourceRoot, candidateBundles, reviewReceiptPaths, semanticRuntimeRoot, opencodeExecutable }) {
  const source = fs.realpathSync.native(path.resolve(sourceRoot));
  expect(typeof semanticRuntimeRoot === "string" && path.isAbsolute(semanticRuntimeRoot),
    "BENCHMARK_V3_RUNNER_MODEL_FREE_GATE", "a frozen absolute semantic runtime root is required");
  assertClean(source);
  const sourceSha = gitSha(source);
  const prepared = buildProfileBundleManifest(source, "lab").manifest;
  const corpus = loadBenchmarkV3Corpus(source);
  expect(corpus.promotion_eligible === true, "BENCHMARK_V3_RUNNER_CONTRACT_COMPLETENESS",
    "model execution is forbidden until every public behavioral contract is independently specified and reviewed");
  expect(Array.isArray(candidateBundles) && candidateBundles.length === 1,
    "BENCHMARK_V3_RUNNER_CANDIDATE", "exactly one frozen candidate is required");
  const candidates = candidateBundles.map((entry) => verifyBenchmarkV3ProductBundle(entry.sourceRoot, entry.materializedCoreDirectory));
  expect(candidates.every((entry) => entry.source_root === source && entry.source_sha === sourceSha),
    "BENCHMARK_V3_RUNNER_CANDIDATE", "every candidate must be materialized from the exact independently reviewed source tree");
  expect(new Set(candidates.map((entry) => entry.architecture_fingerprint)).size === candidates.length,
    "BENCHMARK_V3_RUNNER_CANDIDATE", "registered candidate architecture fingerprints must be distinct");
  const opencode = verifyBenchmarkV3OpenCodeExecutable(opencodeExecutable);
  const filesystemIsolation = verifyBenchmarkV3FilesystemIsolation(source, opencode);
  expect(opencode.variant_supported, "BENCHMARK_V3_RUNNER_OPENCODE_CAPABILITY",
    "OpenCode must support exact --variant execution binding before any model call");
  const checks = [
    ["npm", ["run", "verify:benchmark:v3:design"]],
    ["npm", ["run", "verify:benchmark:v3:corpus"]],
    ["npm", ["run", "verify:benchmark:v3:semantic-oracles"]],
    ["npm", ["run", "verify:benchmark:v3:ledger"]],
    ["npm", ["run", "verify:benchmark:v3:runner"]],
    ["npm", ["run", "verify:core-product-installed-runtime"]],
    ["npm", ["run", "verify"]],
  ];
  const checkResults = [];
  for (const [command, args] of checks) {
    const result = run(command, args, { cwd: source, env: { ...process.env, BENCHMARK_V3_GATE_CHILD: "1", BENCHMARK_V3_ESLINT_RUNTIME_ROOT: semanticRuntimeRoot } });
    expect(passed(result), "BENCHMARK_V3_RUNNER_MODEL_FREE_GATE", `${command} ${args.join(" ")} did not pass`);
    checkResults.push(Object.freeze({ command: `${command} ${args.join(" ")}`, output_fingerprint: fingerprint(`${result.stdout}\n${result.stderr}`) }));
  }
  expect(Array.isArray(reviewReceiptPaths) && reviewReceiptPaths.length === 2, "BENCHMARK_V3_RUNNER_REVIEW", "two review receipts are required");
  const reviews = reviewReceiptPaths.map((file) => loadReviewReceipt(file, sourceSha, prepared.source_tree_fingerprint));
  expect(new Set(reviews.map((entry) => entry.reviewer_id)).size === 2, "BENCHMARK_V3_RUNNER_REVIEW", "reviewers must be independent");
  const { validation: design } = loadBenchmarkV3Design(source);
  const semanticRuntime = fingerprintBenchmarkV3SemanticRuntime(semanticRuntimeRoot, corpus.families.map((entry) => entry.control_surface.runtime_key));
  const body = { schema_version: 1, source_sha: sourceSha, source_tree_fingerprint: prepared.source_tree_fingerprint,
    design_fingerprint: design.design_fingerprint, corpus_fingerprint: corpus.corpus_fingerprint,
    semantic_runtime_fingerprint: semanticRuntime.runtime_fingerprint,
    opencode_executable_fingerprint: opencode.executable_fingerprint,
    filesystem_isolation_fingerprint: fingerprint(filesystemIsolation),
    candidate_product_bundle_fingerprints: candidates.map((entry) => entry.product_bundle_fingerprint),
    checks: checkResults, review_fingerprints: reviews.map((entry) => entry.review_fingerprint) };
  const gate = Object.freeze({ ...body, reviewed_source_root: source, gate_fingerprint: fingerprint(body), candidates: Object.freeze(candidates),
    semantic_runtime_entries: semanticRuntime.entries, opencode_executable: opencode, filesystem_isolation: filesystemIsolation });
  AUTHORIZED_GATES.add(gate);
  return gate;
}

function stagePublicWorkspace(sourceRoot, family, candidate) {
  const workspace = materializeBenchmarkV3Workspace(sourceRoot, family);
  expect(passed(run("git", ["init", "--quiet"], { cwd: workspace })) && passed(run("git", ["add", "."], { cwd: workspace })),
    "BENCHMARK_V3_RUNNER_WORKSPACE", "attempt workspace could not be initialized");
  if (candidate) {
    const catalog = path.join(workspace, ".git", "opencode-harness", "core", "checks.json");
    fs.mkdirSync(path.dirname(catalog), { recursive: true });
    const check = benchmarkV3CandidateCheck(family);
    fs.writeFileSync(catalog, `${JSON.stringify({ schema_version: 1, catalog_id: "benchmark-v3-public", checks: [check] })}\n`, "utf8");
  }
  return workspace;
}

export function buildBenchmarkV3AttemptEnvelope({ family, armId, sourceSha, productBundleFingerprint, opencodeExecutableFingerprint, model, provider, variant, corpusGenerationSeed, modelSamplingSeed = null }) {
  for (const value of [armId, model, provider, variant, corpusGenerationSeed]) expect(SAFE_ID.test(value), "BENCHMARK_V3_RUNNER_ARGUMENT", "attempt identity is invalid");
  expect(modelSamplingSeed === null || SAFE_ID.test(modelSamplingSeed), "BENCHMARK_V3_RUNNER_ARGUMENT", "model sampling seed is invalid");
  expect(/^[0-9a-f]{40}$/u.test(sourceSha) && FP.test(productBundleFingerprint) && FP.test(opencodeExecutableFingerprint), "BENCHMARK_V3_RUNNER_ARGUMENT", "attempt binding is invalid");
  const body = Object.freeze({ schema_version: 1, family_id: family.family_id, split: family.split, stratum: family.stratum,
    arm_id: armId, source_sha: sourceSha, product_bundle_fingerprint: productBundleFingerprint, opencode_executable_fingerprint: opencodeExecutableFingerprint,
    model, provider, variant, corpus_generation_seed: corpusGenerationSeed, model_sampling_seed: modelSamplingSeed,
    prompt: family.public_surface.visible_requirements.join("\n\n"),
    public_surface_fingerprint: family.manifest.public_surface_fingerprint });
  const serialized = JSON.stringify(body);
  expect(!serialized.includes("control_surface") && !serialized.includes("reference_files") && !serialized.includes("baseline"),
    "BENCHMARK_V3_RUNNER_VISIBILITY", "attempt envelope leaked runner-owned control data");
  return Object.freeze({ ...body, envelope_fingerprint: fingerprint(body) });
}

async function executeAttempt({ sourceRoot, semanticRuntimeRoot, semanticRuntimeEntries, family, arm, opencodeIdentity, model, provider, variant, seed, timeoutMs, containmentOptions = {} }) {
  const workspace = stagePublicWorkspace(sourceRoot, family, arm.kind === "candidate");
  let attemptDirectory = null;
  let outputFile = null;
  let envelope = null;
  const started = process.hrtime.bigint();
  try {
    assertReviewedSourceCurrent(sourceRoot, arm.source_sha, arm.source_tree_fingerprint);
    envelope = buildBenchmarkV3AttemptEnvelope({ family, armId: arm.arm_id, sourceSha: arm.source_sha,
      productBundleFingerprint: arm.product_bundle_fingerprint, opencodeExecutableFingerprint: opencodeIdentity.executable_fingerprint,
      model, provider, variant, corpusGenerationSeed: seed, modelSamplingSeed: opencodeIdentity.seed_supported ? seed : null });
    attemptDirectory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "benchmark-v3-receipt-"));
    const attemptConfig = path.join(attemptDirectory, "configuration");
    if (arm.kind === "candidate") fs.cpSync(arm.materialized_core_directory, attemptConfig, { recursive: true, errorOnExist: true, force: false });
    else fs.mkdirSync(attemptConfig, { mode: 0o700 });
    const configurationBefore = closedDirectoryFingerprint(attemptConfig);
    if (arm.kind === "candidate") {
      const rebound = verifyBenchmarkV3ProductBundle(sourceRoot, attemptConfig);
      expect(rebound.product_bundle_fingerprint === arm.product_bundle_fingerprint, "BENCHMARK_V3_RUNNER_PRODUCT_BINDING", "attempt product differs from the gate-bound product");
    } else expect(configurationBefore === fingerprint([]), "BENCHMARK_V3_RUNNER_PRODUCT_BINDING", "baseline configuration is not empty");
    expect(verifyBenchmarkV3OpenCodeExecutable(opencodeIdentity.path).executable_fingerprint === opencodeIdentity.executable_fingerprint,
      "BENCHMARK_V3_RUNNER_OPENCODE", "OpenCode changed after the gate");
    const modelId = provider.includes("/") ? provider : `${provider}/${model}`;
    const samplingArgs = opencodeIdentity.seed_supported ? ["--seed", seed] : [];
    const opencodeArgs = ["run", "--format", "json", "--model", modelId, "--variant", variant, ...samplingArgs,
      "--agent", arm.agent_id, "--dir", workspace, envelope.prompt];
    const command = arm.kind === "candidate" ? process.execPath : opencodeIdentity.path;
    const argv = arm.kind === "candidate" ? [path.join(attemptConfig, "runtime", "opencode-core.mjs"), "--workspace", workspace,
      "--opencode", opencodeIdentity.path, "--receipt-fd", "3", "--", ...opencodeArgs] : opencodeArgs;
    const beforeSnapshot = captureBenchmarkV3Workspace(workspace);
    const catalogBefore = coreCatalogFingerprint(workspace);
    const inputFile = path.join(attemptDirectory, "input.json");
    outputFile = path.join(attemptDirectory, "output.json");
    const isolatedHome = path.join(attemptDirectory, "home"); fs.mkdirSync(isolatedHome, { mode: 0o700 });
    const isolatedTmp = path.join(attemptDirectory, "tmp"); fs.mkdirSync(isolatedTmp, { mode: 0o700 });
    const workerPath = path.join(sourceRoot, "scripts", "benchmark-v3-attempt-worker.mjs");
    const sandboxProfileFile = path.join(attemptDirectory, "profile.sb");
    fs.writeFileSync(sandboxProfileFile, benchmarkV3SandboxProfile({ workspace, attemptDirectory,
      opencodePath: opencodeIdentity.path, workerPath }), { mode: 0o600 });
    const marker = `BENCHMARK_V3_COMPLETED_${fingerprint(envelope).slice(7, 31)}`;
    const activationBinding = arm.kind === "candidate" ? benchmarkV3ActivationBinding(workspace) : null;
    fs.writeFileSync(inputFile, JSON.stringify({ schema_version: 1, file: command, args: argv, cwd: workspace, timeout_ms: timeoutMs,
      env_overrides: { OPENCODE_CONFIG_DIR: attemptConfig }, opencode_identity: opencodeIdentity,
      activation_binding: activationBinding }), { mode: 0o600 });
    let managed;
    try {
      managed = await runManagedCommand({ file: "/usr/bin/sandbox-exec",
        args: ["-f", sandboxProfileFile, process.execPath, workerPath, inputFile, outputFile, marker],
        cwd: workspace, env: { ...modelEnvironment(), HOME: isolatedHome, TMPDIR: isolatedTmp }, timeout: timeoutMs + 30_000,
        maxOutputChars: 4096, outputMarker: marker, containmentOptions });
    } catch (error) {
      let failedReceipt = null;
      try { failedReceipt = JSON.parse(fs.readFileSync(outputFile, "utf8")); } catch { failedReceipt = null; }
      const consumedTokens = Number.isSafeInteger(failedReceipt?.tokens) && failedReceipt.tokens >= 0 ? failedReceipt.tokens : 0;
      return Object.freeze({ family_id: family.family_id, stratum: family.stratum, passed: false, defect_severity: family.control_surface.defect_severity,
        scope_violation: false, timeout: failedReceipt?.timed_out === true, duration_ms: Number(process.hrtime.bigint() - started) / 1e6, tokens: consumedTokens, activation: false,
        infrastructure_failure: true, completion_accepted: false, process_status: null, result_fingerprint: fingerprint({ envelope, containment_error: error?.classification ?? error?.code ?? "unknown" }) });
    }
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    assertReviewedSourceCurrent(sourceRoot, arm.source_sha, arm.source_tree_fingerprint);
    expect(verifyBenchmarkV3OpenCodeExecutable(opencodeIdentity.path).executable_fingerprint === opencodeIdentity.executable_fingerprint,
      "BENCHMARK_V3_RUNNER_OPENCODE", "OpenCode changed during the attempt");
    let receipt = null;
    try { receipt = JSON.parse(fs.readFileSync(outputFile, "utf8")); } catch { receipt = null; }
    const contained = managed.teardown_verified === true && FP.test(managed.containment_fingerprint ?? "") && managed.output_marker_match?.count === 1;
    const receiptClassification = classifyBenchmarkV3AttemptReceipt(receipt, arm.kind);
    const completionAccepted = contained && receiptClassification.complete_scored_outcome;
    const runtimeEntry = semanticRuntimeEntries.find((entry) => entry.key === family.control_surface.runtime_key);
    const oracle = evaluateBenchmarkV3Workspace(workspace, family.control_surface, { beforeSnapshot, semanticRuntimeRoot,
      expectedRuntimeKeyFingerprint: runtimeEntry?.key_fingerprint });
    const catalogAfter = coreCatalogFingerprint(workspace);
    const catalogDrift = catalogBefore !== catalogAfter;
    const configurationAfter = closedDirectoryFingerprint(attemptConfig);
    const configurationDrift = configurationBefore !== configurationAfter;
    const taskPassed = oracle.passed && receiptClassification.verification_succeeded && !catalogDrift && !configurationDrift;
    return Object.freeze({ family_id: family.family_id, stratum: family.stratum, passed: taskPassed,
      defect_severity: taskPassed ? "none" : family.control_surface.defect_severity, scope_violation: oracle.scope_violation || catalogDrift || configurationDrift,
      timeout: receipt?.timed_out === true, duration_ms: durationMs,
      tokens: receipt?.tokens ?? 0, activation: arm.kind === "baseline" ? true : receipt?.activation === true && !catalogDrift && !configurationDrift,
      activation_eligible: arm.kind === "candidate" && oracle.changed_paths.some((entry) => family.control_surface.allowed_mutation_paths.includes(entry)),
      infrastructure_failure: !completionAccepted, completion_accepted: completionAccepted,
      receipt_authentic: receiptClassification.receipt_authentic,
      process_status: receipt?.status ?? null, containment_fingerprint: managed.containment_fingerprint,
      result_fingerprint: fingerprint({ envelope, oracle: oracle.result_fingerprint, receipt, containment: managed.containment_fingerprint,
        catalog_before: catalogBefore, catalog_after: catalogAfter, configuration_before: configurationBefore,
        configuration_after: configurationAfter, duration_ms: durationMs }) });
  } catch (error) {
    let failedReceipt = null;
    try { failedReceipt = JSON.parse(fs.readFileSync(outputFile, "utf8")); } catch { failedReceipt = null; }
    return Object.freeze({ family_id: family.family_id, stratum: family.stratum, passed: false,
      defect_severity: family.control_surface.defect_severity, scope_violation: false, timeout: failedReceipt?.timed_out === true,
      duration_ms: Number(process.hrtime.bigint() - started) / 1e6,
      tokens: Number.isSafeInteger(failedReceipt?.tokens) && failedReceipt.tokens >= 0 ? failedReceipt.tokens : 0,
      activation: false, infrastructure_failure: true, completion_accepted: false, process_status: failedReceipt?.status ?? null,
      result_fingerprint: fingerprint({ envelope, post_execution_error: error?.code ?? "unknown", receipt_fingerprint: failedReceipt === null ? null : fingerprint(failedReceipt) }) });
  } finally {
    if (attemptDirectory !== null) fs.rmSync(attemptDirectory, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

function finding(outcome) {
  if (outcome.passed) return [];
  if (outcome.defect_severity === "unclassified") return [];
  return [{ finding_id: `oracle-${outcome.family_id}`, family: outcome.family_id, violated_contract: "hidden-upstream-semantic-test",
    evidence_source: { kind: "trusted-check", source_id: `v3-oracle-${outcome.family_id}`, path: null, summary: "Runner-owned hidden oracle did not accept the workspace." }, severity: outcome.defect_severity }];
}
function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function median(values) { const ordered = [...values].sort((a, b) => a - b); const middle = Math.floor(ordered.length / 2); return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2; }

export function summarizeBenchmarkV3Stage({ baseline, candidate, confidenceLevel = 0.95 }) {
  expect(Array.isArray(baseline) && Array.isArray(candidate) && baseline.length > 0 && baseline.length === candidate.length,
    "BENCHMARK_V3_RUNNER_RESULT", "paired stage outcomes are incomplete");
  const candidateById = new Map(candidate.map((entry) => [entry.family_id, entry]));
  expect(candidateById.size === candidate.length, "BENCHMARK_V3_RUNNER_RESULT", "candidate family outcomes are duplicated");
  let candidateOnly = 0; let baselineOnly = 0; let newCritical = 0; let newBlocking = 0;
  const relations = [];
  for (const left of baseline) {
    const right = candidateById.get(left.family_id);
    expect(right !== undefined && right.stratum === left.stratum, "BENCHMARK_V3_RUNNER_RESULT", "paired family identity drifted");
    if (!left.passed && right.passed) candidateOnly += 1;
    if (left.passed && !right.passed) baselineOnly += 1;
    const defects = evaluatePairedDefects({ baseline: { functional_task_success: left.passed, scope_violation: left.scope_violation === true, findings: finding(left) }, candidate: { functional_task_success: right.passed, scope_violation: right.scope_violation === true, findings: finding(right) } });
    newCritical += defects.new_critical_regression;
    newBlocking += defects.new_high_medium_regression;
    relations.push(defects);
  }
  const discordant = candidateOnly + baselineOnly;
  const interval = exactConservativePairedDeltaInterval({ familyCount: baseline.length, candidateOnly, baselineOnly, confidenceLevel });
  const smallLeft = baseline.filter((entry) => entry.stratum === "small");
  const smallRight = new Map(candidate.filter((entry) => entry.stratum === "small").map((entry) => [entry.family_id, entry]));
  const smallCandidateOnly = smallLeft.filter((entry) => !entry.passed && smallRight.get(entry.family_id)?.passed).length;
  const smallBaselineOnly = smallLeft.filter((entry) => entry.passed && !smallRight.get(entry.family_id)?.passed).length;
  const smallInterval = exactConservativePairedDeltaInterval({ familyCount: smallLeft.length, candidateOnly: smallCandidateOnly, baselineOnly: smallBaselineOnly, confidenceLevel });
  const baselineDurations = baseline.map((entry) => entry.duration_ms);
  const candidateDurations = candidate.map((entry) => entry.duration_ms);
  const pairedDelta = (candidateOnly - baselineOnly) / baseline.length;
  const activationEligible = candidate.filter((entry) => entry.activation_eligible === true);
  const report = Object.freeze({ family_count: baseline.length, candidate_only: candidateOnly, baseline_only: baselineOnly, discordant,
    paired_delta: pairedDelta, exact_p: discordant === 0 ? 1 : exactBinomialUpperTail(discordant, candidateOnly, 0.5), confidence_interval: interval,
    new_critical_regressions: newCritical, new_unclassified_semantic_regressions: baselineOnly,
    new_high_medium_regression_delta: newBlocking / baseline.length,
    new_high_medium_upper_ci: exactBinomialUpperConfidenceBound(baseline.length, newBlocking, confidenceLevel),
    small_discordant: smallCandidateOnly + smallBaselineOnly, small_delta_lower_ci: smallInterval[0], timeout_delta: (candidate.filter((entry) => entry.timeout).length - baseline.filter((entry) => entry.timeout).length) / baseline.length,
    median_duration_ratio: median(candidateDurations) / Math.max(median(baselineDurations), 1), mean_duration_ratio: mean(candidateDurations) / Math.max(mean(baselineDurations), 1),
    activation_rate: activationEligible.length === 0 ? 0 : activationEligible.filter((entry) => entry.activation).length / activationEligible.length,
    activation_eligible_count: activationEligible.length,
    candidate_tokens: candidate.reduce((sum, entry) => sum + entry.tokens, 0), duration_ms: candidateDurations.reduce((sum, value) => sum + value, 0),
    candidate_attempt_count: candidate.reduce((sum, entry) => sum + (entry.attempt_count ?? 1), 0),
    retried_family_count: candidate.filter((entry) => (entry.attempt_count ?? 1) === 2).length,
    attempt_audit_fingerprint: fingerprint(candidate.map((entry) => ({ family_id: entry.family_id, attempts: entry.attempt_fingerprints ?? [entry.result_fingerprint] }))),
    relations_fingerprint: fingerprint(relations.map((entry) => entry.evaluation_fingerprint)) });
  return Object.freeze({ ...report, report_fingerprint: fingerprint(report) });
}

export function evaluateBenchmarkV3Guardrails(design, report) {
  const guard = design.guardrails;
  const failures = [];
  if (report.new_critical_regressions > guard.new_critical_regressions_maximum) failures.push("new-critical-regression");
  if (report.new_unclassified_semantic_regressions > guard.new_unclassified_semantic_regressions_maximum) failures.push("new-unclassified-semantic-regression");
  if (report.new_high_medium_regression_delta > 0
    || (report.family_count >= 90 && report.new_high_medium_upper_ci > guard.new_high_medium_regression_rate_upper_bound_maximum)) failures.push("new-high-medium-safety");
  if (report.small_discordant > 0 && report.small_delta_lower_ci < guard.small_delta_lower_ci_minimum) failures.push("small-delta-lower-ci");
  if (report.timeout_delta > guard.timeout_delta_maximum) failures.push("timeout-delta");
  if (report.median_duration_ratio > guard.median_duration_ratio_maximum) failures.push("median-duration-ratio");
  if (report.mean_duration_ratio > guard.mean_duration_ratio_maximum) failures.push("mean-duration-ratio");
  if (report.activation_rate < guard.activation_minimum) failures.push("activation");
  return Object.freeze({ passed: failures.length === 0, failures: Object.freeze(failures) });
}

export function evaluateBenchmarkV3EfficacyGate(design, report, registeredCandidates = 1) {
  const guardrails = evaluateBenchmarkV3Guardrails(design, report);
  const criteria = Object.freeze({
    paired_delta: report.paired_delta >= design.opportunity_power_gate.minimum_practical_delta,
    exact_p: report.exact_p <= design.opportunity_power_gate.familywise_alpha / registeredCandidates,
    confidence_interval_lower: Array.isArray(report.confidence_interval) && report.confidence_interval[0] > 0,
    guardrails: guardrails.passed,
  });
  return Object.freeze({ passed: Object.values(criteria).every(Boolean), criteria, guardrails });
}

function safeLedgerId(value, prefix) {
  const normalized = String(value).replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 70);
  return `${prefix}-${normalized || fingerprint(value).slice(7, 23)}`;
}
function ledgerMetrics(report) {
  return Object.freeze({ paired_delta: report.paired_delta, new_critical_regressions: report.new_critical_regressions,
    new_unclassified_semantic_regressions: report.new_unclassified_semantic_regressions,
    new_high_medium_upper_ci: report.new_high_medium_upper_ci, small_delta_lower_ci: report.small_delta_lower_ci,
    timeout_delta: report.timeout_delta, median_duration_ratio: report.median_duration_ratio,
    mean_duration_ratio: report.mean_duration_ratio, activation_rate: report.activation_rate,
    candidate_tokens: report.candidate_tokens, duration_ms: report.duration_ms,
    candidate_attempt_count: report.candidate_attempt_count, retried_family_count: report.retried_family_count });
}
function ledgerEvent({ id, type, stage, registration, model, provider, variant, seed, bindingsFingerprint, status, scored, retry = null, report = null }) {
  return Object.freeze({ event_id: `event-${id}`, event_type: type, candidate_id: registration.candidate_id,
    attempt_id: `attempt-${id}`, retry_of_attempt_id: retry, stage, source_sha: registration.source_sha,
    model: safeLedgerId(model, "model"), provider: safeLedgerId(provider, "provider"), variant: safeLedgerId(variant, "variant"), seed: safeLedgerId(seed, "seed"),
    bindings_fingerprint: bindingsFingerprint, architecture_fingerprint: registration.architecture_fingerprint,
    product_bundle_fingerprint: registration.product_bundle_fingerprint, scored_outcome: scored, status,
    result_fingerprint: report === null ? (type === "acceptance-probe" ? registration.product_bundle_fingerprint : null) : report.report_fingerprint,
    metrics: report === null ? null : ledgerMetrics(report) });
}
async function runSplit({ sourceRoot, semanticRuntimeRoot, semanticRuntimeEntries, families, arm, opencodeIdentity, model, provider, variant, seed, timeoutMs, containmentOptions, journal }) {
  const outcomes = [];
  let retriedFamilyCount = 0;
  for (const family of families) {
    const first = await executeAttempt({ sourceRoot, semanticRuntimeRoot, semanticRuntimeEntries, family, arm, opencodeIdentity, model, provider, variant, seed, timeoutMs, containmentOptions });
    journal.recordAttempt({ arm_id: arm.arm_id, family_id: family.family_id, attempt_index: 1, outcome: first });
    if (!first.infrastructure_failure) {
      outcomes.push(Object.freeze({ ...first, attempt_count: 1, attempt_fingerprints: Object.freeze([first.result_fingerprint]) }));
      continue;
    }
    retriedFamilyCount += 1;
    const retry = await executeAttempt({ sourceRoot, semanticRuntimeRoot, semanticRuntimeEntries, family, arm, opencodeIdentity, model, provider, variant, seed, timeoutMs, containmentOptions });
    journal.recordAttempt({ arm_id: arm.arm_id, family_id: family.family_id, attempt_index: 2, outcome: retry });
    outcomes.push(Object.freeze({ ...retry, tokens: first.tokens + retry.tokens, duration_ms: first.duration_ms + retry.duration_ms,
      attempt_count: 2, attempt_fingerprints: Object.freeze([first.result_fingerprint, retry.result_fingerprint]) }));
  }
  return Object.freeze({ outcomes: Object.freeze(outcomes), retried_family_count: retriedFamilyCount,
    infrastructure_failure: outcomes.some((entry) => entry.infrastructure_failure) });
}
async function runCandidateStage({ sourceRoot, semanticRuntimeRoot, semanticRuntimeEntries, containmentOptions, ledger, design, stage, families, baseline, arm, registration, opencodeIdentity, model, provider, variant, seed, timeoutMs, bindingsFingerprint, journal }) {
  const baseId = `${stage}-${registration.candidate_id}`;
  const execution = await runSplit({ sourceRoot, semanticRuntimeRoot, semanticRuntimeEntries, containmentOptions, families, arm, opencodeIdentity, model, provider, variant, seed, timeoutMs, journal });
  let retry = null;
  if (execution.infrastructure_failure) {
    ledger = appendBenchmarkV3LedgerEvent(ledger, design, ledgerEvent({ id: `${baseId}-infra`, type: "infrastructure-failure-before-scoring", stage,
      registration, model, provider, variant, seed, bindingsFingerprint, status: "infrastructure-failure", scored: false }));
    journal.recordLedger(ledger);
    return Object.freeze({ ledger, blocked: true, outcomes: execution.outcomes, report: null });
  }
  if (execution.retried_family_count > 0) {
    ledger = appendBenchmarkV3LedgerEvent(ledger, design, ledgerEvent({ id: `${baseId}-infra`, type: "infrastructure-failure-before-scoring", stage,
      registration, model, provider, variant, seed, bindingsFingerprint, status: "infrastructure-failure", scored: false }));
    journal.recordLedger(ledger);
    retry = `attempt-${baseId}-infra`;
  }
  const report = summarizeBenchmarkV3Stage({ baseline, candidate: execution.outcomes });
  const type = `${stage}-execution`;
  ledger = appendBenchmarkV3LedgerEvent(ledger, design, ledgerEvent({ id: `${baseId}-scored`, type, stage, registration, model, provider, variant, seed,
    bindingsFingerprint, status: "scored", scored: true, retry, report }));
  journal.recordLedger(ledger);
  return Object.freeze({ ledger, blocked: false, outcomes: execution.outcomes, report });
}

function attemptAudit(outcomes) {
  return Object.freeze(outcomes.map((entry) => Object.freeze({ family_id: entry.family_id, attempt_count: entry.attempt_count ?? 1,
    attempt_fingerprints: entry.attempt_fingerprints ?? Object.freeze([entry.result_fingerprint]), tokens: entry.tokens,
    duration_ms: entry.duration_ms, infrastructure_failure: entry.infrastructure_failure, process_status: entry.process_status,
    containment_fingerprint: entry.containment_fingerprint ?? null })));
}
function finalizeStudy(outputDirectory, ledger, value) {
  const final = Object.freeze({ ...value, ledger, ledger_fingerprint: ledger.ledger_fingerprint });
  if (outputDirectory !== undefined) {
    const output = path.resolve(outputDirectory);
    fs.mkdirSync(output, { recursive: true });
    for (const [name, artifact] of [["ledger.json", ledger], ["report.json", final]]) {
      const target = path.join(output, name);
      expect(!fs.existsSync(target), "BENCHMARK_V3_RUNNER_ARTIFACT", `${name} already exists`);
      const temporary = `${target}.tmp-${process.pid}`;
      fs.writeFileSync(temporary, `${JSON.stringify(artifact, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      fs.renameSync(temporary, target);
    }
  }
  return final;
}

function createDurableJournal(outputDirectory) {
  const attempts = [];
  let ledger = null;
  let output = null;
  if (outputDirectory !== undefined) {
    output = path.resolve(outputDirectory);
    expect(!fs.existsSync(output), "BENCHMARK_V3_RUNNER_ARTIFACT", "campaign output directory already exists; replay and overwrite are forbidden");
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.mkdirSync(output, { mode: 0o700 });
  }
  const write = () => {
    if (output === null) return;
    const target = path.join(output, "checkpoint.json");
    const temporary = `${target}.tmp-${process.pid}`;
    const body = { schema_version: 1, attempts, ledger, checkpoint_fingerprint: fingerprint({ attempts, ledger }) };
    fs.writeFileSync(temporary, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, target);
  };
  return Object.freeze({
    recordAttempt(value) { attempts.push(Object.freeze(value)); write(); },
    recordLedger(value) { ledger = value; write(); },
  });
}

export async function runBenchmarkV3Study({ gate, semanticRuntimeRoot, outputDirectory, containmentOptions = {}, model, provider, variant, seed, timeoutMs = 900_000 }) {
  expect(AUTHORIZED_GATES.has(gate), "BENCHMARK_V3_RUNNER_MODEL_FREE_GATE", "study execution requires a same-process passed model-free gate");
  const { value: design, validation: currentDesign } = loadBenchmarkV3Design(gate.reviewed_source_root);
  const corpus = loadBenchmarkV3Corpus(gate.reviewed_source_root);
  expect(currentDesign.design_fingerprint === gate.design_fingerprint && corpus.corpus_fingerprint === gate.corpus_fingerprint,
    "BENCHMARK_V3_RUNNER_MODEL_FREE_GATE", "reviewed design or corpus bytes changed after the gate");
  const semanticRuntime = fingerprintBenchmarkV3SemanticRuntime(semanticRuntimeRoot, corpus.families.map((entry) => entry.control_surface.runtime_key));
  expect(semanticRuntime.runtime_fingerprint === gate.semantic_runtime_fingerprint,
    "BENCHMARK_V3_RUNNER_MODEL_FREE_GATE", "semantic runtime changed after the gate");
  const opencodeIdentity = verifyBenchmarkV3OpenCodeExecutable(gate.opencode_executable.path);
  expect(opencodeIdentity.executable_fingerprint === gate.opencode_executable_fingerprint,
    "BENCHMARK_V3_RUNNER_MODEL_FREE_GATE", "OpenCode changed after the gate");
  const registrations = gate.candidates.map((binding, index) => Object.freeze({ candidate_id: `candidate-${index + 1}`,
    architecture_fingerprint: binding.architecture_fingerprint, product_bundle_fingerprint: binding.product_bundle_fingerprint,
    source_sha: binding.source_sha, registered_before_baseline: true, development_execution_count: 0 }));
  const modelBinding = buildBenchmarkV3ModelBinding({ executableFingerprint: gate.opencode_executable_fingerprint,
    opencodeVersion: opencodeIdentity.version, provider, model, variant, variantSupported: opencodeIdentity.variant_supported,
    modelSamplingSeedSupported: opencodeIdentity.seed_supported, corpusGenerationSeed: seed,
    modelSamplingSeed: opencodeIdentity.seed_supported ? seed : null,
    candidateBundleFingerprints: registrations.map((entry) => entry.product_bundle_fingerprint),
    evaluatorFingerprint: fingerprint(evaluatePairedDefects.toString()), corpusFingerprint: gate.corpus_fingerprint,
    designFingerprint: gate.design_fingerprint, semanticRuntimeFingerprint: gate.semantic_runtime_fingerprint });
  const bindingsFingerprint = fingerprint(modelBinding);
  let ledger = createBenchmarkV3Ledger({ design, designFingerprint: gate.design_fingerprint, campaignFingerprint: fingerprint({ gate: gate.gate_fingerprint, bindings: bindingsFingerprint }), registrations });
  const journal = createDurableJournal(outputDirectory);
  journal.recordLedger(ledger);
  for (const [index, registration] of registrations.entries()) ledger = appendBenchmarkV3LedgerEvent(ledger, design, ledgerEvent({ id: `accept-${registration.candidate_id}`,
    type: "acceptance-probe", stage: "acceptance", registration, model, provider, variant, seed, bindingsFingerprint,
    status: "accepted", scored: false, report: null }));
  journal.recordLedger(ledger);
  const development = corpus.families.filter((entry) => entry.split === "development");
  const baselineFingerprint = fingerprint({ schema_version: 1, files: [] });
  const baselineArm = Object.freeze({ kind: "baseline", arm_id: "plain-baseline", source_sha: gate.source_sha,
    source_tree_fingerprint: gate.source_tree_fingerprint, product_bundle_fingerprint: baselineFingerprint, agent_id: "build" });
  const developmentBaselineRun = await runSplit({ sourceRoot: gate.reviewed_source_root, semanticRuntimeRoot, semanticRuntimeEntries: gate.semantic_runtime_entries, families: development,
    arm: baselineArm, opencodeIdentity, model, provider, variant, seed, timeoutMs, containmentOptions, journal });
  const baseline = developmentBaselineRun.outcomes;
  if (developmentBaselineRun.infrastructure_failure) return finalizeStudy(outputDirectory, ledger,
    { status: "infrastructure-blocked", final_status: "STUDY BLOCKED — INFRASTRUCTURE", baseline_attempt_count: baseline.reduce((sum, entry) => sum + entry.attempt_count, 0), candidate_attempt_count: 0, candidate_tokens: 0, development_baseline_attempts: attemptAudit(baseline) });
  const failures = Object.fromEntries(["small", "medium", "high"].map((stratum) => [stratum, baseline.filter((entry) => entry.stratum === stratum && !entry.passed).length]));
  const opportunity = assessBenchmarkV3BaselineOpportunity(design, failures, registrations.length);
  if (!opportunity.eligible) return finalizeStudy(outputDirectory, ledger,
    { status: "design-uninformative", final_status: "NO PROMOTABLE HARNESS",
      baseline_attempt_count: baseline.reduce((sum, entry) => sum + entry.attempt_count, 0), candidate_attempt_count: 0, candidate_tokens: 0,
      opportunity_power_gate: opportunity, baseline_fingerprint: fingerprint(baseline), development_baseline_attempts: attemptAudit(baseline) });
  const developmentReports = [];
  for (const [index, binding] of gate.candidates.entries()) {
    const arm = Object.freeze({ kind: "candidate", arm_id: `candidate-${index + 1}`, ...binding,
      source_tree_fingerprint: gate.source_tree_fingerprint, agent_id: "core" });
    const runResult = await runCandidateStage({ sourceRoot: gate.reviewed_source_root, semanticRuntimeRoot, semanticRuntimeEntries: gate.semantic_runtime_entries, containmentOptions, ledger, design, stage: "development", families: development, baseline, arm, registration: registrations[index],
      opencodeIdentity, model, provider, variant, seed, timeoutMs, bindingsFingerprint, journal });
    ledger = runResult.ledger;
    if (runResult.blocked) return finalizeStudy(outputDirectory, ledger,
      { status: "infrastructure-blocked", final_status: "STUDY BLOCKED — INFRASTRUCTURE", stage: "development",
        development_baseline_attempts: attemptAudit(baseline), candidate_attempts: attemptAudit(runResult.outcomes) });
    developmentReports.push(Object.freeze({ arm, outcomes: runResult.outcomes, report: runResult.report }));
  }
  ledger = selectBenchmarkV3Candidate(ledger, design);
  journal.recordLedger(ledger);
  const selectedIndex = registrations.findIndex((entry) => entry.candidate_id === ledger.selected_candidate_id);
  const selected = developmentReports[selectedIndex];
  const validationFamilies = corpus.families.filter((entry) => entry.split === "validation");
  const validationBaselineRun = await runSplit({ sourceRoot: gate.reviewed_source_root, semanticRuntimeRoot, semanticRuntimeEntries: gate.semantic_runtime_entries, families: validationFamilies,
    arm: baselineArm, opencodeIdentity, model, provider, variant, seed, timeoutMs, containmentOptions, journal });
  const validationBaseline = validationBaselineRun.outcomes;
  if (validationBaselineRun.infrastructure_failure) return finalizeStudy(outputDirectory, ledger,
    { status: "infrastructure-blocked", final_status: "STUDY BLOCKED — INFRASTRUCTURE", stage: "validation-baseline",
      validation_baseline_attempts: attemptAudit(validationBaseline) });
  const validationRun = await runCandidateStage({ sourceRoot: gate.reviewed_source_root, semanticRuntimeRoot, semanticRuntimeEntries: gate.semantic_runtime_entries, containmentOptions, ledger, design, stage: "validation", families: validationFamilies, baseline: validationBaseline,
    arm: selected.arm, registration: registrations[selectedIndex], opencodeIdentity, model, provider, variant, seed, timeoutMs, bindingsFingerprint, journal });
  ledger = validationRun.ledger;
  if (validationRun.blocked) return finalizeStudy(outputDirectory, ledger,
    { status: "infrastructure-blocked", final_status: "STUDY BLOCKED — INFRASTRUCTURE", stage: "validation",
      validation_baseline_attempts: attemptAudit(validationBaseline), candidate_attempts: attemptAudit(validationRun.outcomes) });
  const validationReport = validationRun.report;
  const validationEfficacy = evaluateBenchmarkV3EfficacyGate(design, validationReport, registrations.length);
  if (!validationEfficacy.passed) return finalizeStudy(outputDirectory, ledger,
    { status: "validation-efficacy-failed", final_status: "NO PROMOTABLE HARNESS", selected_candidate_sha: selected.arm.source_sha,
      validation_report: validationReport, validation_efficacy: validationEfficacy, validation_baseline_attempts: attemptAudit(validationBaseline),
      validation_candidate_attempts: attemptAudit(validationRun.outcomes) });
  ledger = freezeBenchmarkV3FinalCandidate(ledger, design);
  journal.recordLedger(ledger);
  const holdoutFamilies = corpus.families.filter((entry) => entry.split === "holdout");
  const holdoutBaselineRun = await runSplit({ sourceRoot: gate.reviewed_source_root, semanticRuntimeRoot, semanticRuntimeEntries: gate.semantic_runtime_entries, families: holdoutFamilies,
    arm: baselineArm, opencodeIdentity, model, provider, variant, seed, timeoutMs, containmentOptions, journal });
  const holdoutBaseline = holdoutBaselineRun.outcomes;
  if (holdoutBaselineRun.infrastructure_failure) return finalizeStudy(outputDirectory, ledger,
    { status: "infrastructure-blocked", final_status: "STUDY BLOCKED — INFRASTRUCTURE", stage: "holdout-baseline",
      holdout_baseline_attempts: attemptAudit(holdoutBaseline) });
  const holdoutRun = await runCandidateStage({ sourceRoot: gate.reviewed_source_root, semanticRuntimeRoot, semanticRuntimeEntries: gate.semantic_runtime_entries, containmentOptions, ledger, design, stage: "holdout", families: holdoutFamilies, baseline: holdoutBaseline,
    arm: selected.arm, registration: registrations[selectedIndex], opencodeIdentity, model, provider, variant, seed, timeoutMs, bindingsFingerprint, journal });
  ledger = holdoutRun.ledger;
  if (holdoutRun.blocked) return finalizeStudy(outputDirectory, ledger,
    { status: "infrastructure-blocked", final_status: "STUDY BLOCKED — INFRASTRUCTURE", stage: "holdout",
      holdout_baseline_attempts: attemptAudit(holdoutBaseline), candidate_attempts: attemptAudit(holdoutRun.outcomes) });
  const holdoutReport = holdoutRun.report;
  const holdoutEfficacy = evaluateBenchmarkV3EfficacyGate(design, holdoutReport, registrations.length);
  const holdoutGuardrails = holdoutEfficacy.guardrails;
  const promotion = holdoutEfficacy.passed;
  const finalStatus = promotion ? "POSITIVE HOLDOUT — PILOT REQUIRED" : "NO PROMOTABLE HARNESS";
  return finalizeStudy(outputDirectory, ledger, { status: promotion ? "pilot-required" : "no-promotion", final_status: finalStatus,
    selected_candidate_sha: selected.arm.source_sha, development_reports: Object.freeze(developmentReports.map((entry) => entry.report)), validation_report: validationReport,
    holdout_report: holdoutReport, holdout_efficacy: holdoutEfficacy, holdout_guardrails: holdoutGuardrails, product_bundle_fingerprint: selected.arm.product_bundle_fingerprint,
    final_candidate_sha: ledger.final_candidate_sha, development_baseline_attempts: attemptAudit(baseline),
    development_candidate_attempts: Object.freeze(developmentReports.map((entry) => attemptAudit(entry.outcomes))),
    validation_baseline_attempts: attemptAudit(validationBaseline), validation_candidate_attempts: attemptAudit(validationRun.outcomes),
    holdout_baseline_attempts: attemptAudit(holdoutBaseline), holdout_candidate_attempts: attemptAudit(holdoutRun.outcomes) });
}
