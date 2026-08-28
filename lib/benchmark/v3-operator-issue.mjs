import fs from "node:fs";
import path from "node:path";
import { createHash, createPublicKey, randomBytes, randomUUID, sign, verify } from "node:crypto";
import { spawnSync } from "node:child_process";

import { ContractError, canonicalJson, fingerprint } from "../feedback/contracts.mjs";
import { loadBenchmarkV3Corpus } from "./v3-corpus.mjs";
import { loadBenchmarkV3Design } from "./v3-design.mjs";
import { loadSignedBenchmarkV3ExecutionAuthority } from "./v3-execution-authority.mjs";
import { benchmarkV3ReadinessEnvironment } from "./v3-readiness.mjs";
import { verifyBenchmarkV3OperatorProbeEvidence,
  verifyBenchmarkV3ProviderOnlyEgressEvidence } from "./v3-operator-probes.mjs";
import { benchmarkV3OperatorSpkiFingerprint, loadBenchmarkV3OperatorPrivateKey,
  verifyBenchmarkV3ReviewerRegistryKey } from "./v3-operator-custody.mjs";
import { buildProfileBundleManifest } from "../profile-v3.mjs";

const SHA = /^[0-9a-f]{40}$/u;
const FP = /^sha256:[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{15,99}$/u;
const STRATA = Object.freeze(["small", "medium", "high"]);

function fail(code, message) { throw new ContractError(code, message); }
function expect(condition, code, message) { if (!condition) fail(code, message); }
function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
function git(sourceRoot, args) {
  const result = spawnSync("git", args, { cwd: sourceRoot, encoding: "utf8", shell: false, windowsHide: true });
  expect(result.status === 0 && result.signal === null && result.error === undefined,
    "BENCHMARK_V3_OPERATOR_GIT", "frozen source identity is unavailable");
  return result.stdout.trim();
}
function assertClean(sourceRoot) {
  expect(git(sourceRoot, ["status", "--porcelain", "--untracked-files=all"]) === "",
    "BENCHMARK_V3_OPERATOR_SOURCE", "operator receipts require a clean frozen source tree");
}
function registry(sourceRoot, file) {
  let value;
  try { value = JSON.parse(fs.readFileSync(path.join(sourceRoot, "benchmarks", "v3", file), "utf8")); }
  catch { fail("BENCHMARK_V3_OPERATOR_REGISTRY", `${file} is unavailable`); }
  expect(value?.schema_version === 1 && Array.isArray(value.issuers),
    "BENCHMARK_V3_OPERATOR_REGISTRY", `${file} is invalid`);
  return value;
}
function issuerForRole(sourceRoot, role) {
  if (role === "readiness") return registry(sourceRoot, "readiness-issuers.v1.json").issuers[0];
  if (role === "reviewer-one") return registry(sourceRoot, "review-issuers.v1.json").issuers[0];
  if (role === "reviewer-two") return registry(sourceRoot, "review-issuers.v1.json").issuers[1];
  if (role === "execution-authority") return registry(sourceRoot, "execution-authority-issuers.v1.json").issuers[0];
  if (role === "holdout-custodian") return registry(sourceRoot, "holdout-issuers.v1.json").issuers[0];
  fail("BENCHMARK_V3_OPERATOR_ROLE", "operator issuer role is invalid");
}
function assertKeyMatchesIssuer(key, issuer, role) {
  expect(benchmarkV3OperatorSpkiFingerprint(key) === benchmarkV3OperatorSpkiFingerprint(issuer.public_key_pem),
    "BENCHMARK_V3_OPERATOR_KEY", `${role} key does not match the committed issuer registry`);
}
function assertProtectedParent(file, issuer) {
  const root = fs.realpathSync.native(path.resolve(issuer.channel_root));
  const parent = fs.realpathSync.native(path.dirname(path.resolve(file)));
  expect(inside(root, parent), "BENCHMARK_V3_OPERATOR_CHANNEL", "operator receipt escaped its protected channel");
  let current = parent;
  while (true) {
    const stat = fs.lstatSync(current);
    expect(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === issuer.owner_uid && (stat.mode & 0o077) === 0,
      "BENCHMARK_V3_OPERATOR_CHANNEL", "operator channel ancestry is not private and issuer-owned");
    if (current === root) break;
    current = path.dirname(current);
  }
}
function writeProtectedJson(file, value, issuer) {
  assertProtectedParent(file, issuer);
  const descriptor = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
  try { fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
  const stat = fs.lstatSync(file);
  expect(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.uid === issuer.owner_uid
    && (stat.mode & 0o077) === 0, "BENCHMARK_V3_OPERATOR_CHANNEL", "operator receipt is not private and issuer-owned");
}
function createProtectedDirectory(directory, issuer) {
  const configuredRoot = path.resolve(issuer.channel_root);
  const root = fs.realpathSync.native(configuredRoot);
  const target = path.resolve(directory);
  expect(inside(configuredRoot, target) && target !== configuredRoot,
    "BENCHMARK_V3_OPERATOR_CHANNEL", "operator directory escaped its protected channel");
  const relative = path.relative(configuredRoot, target).split(path.sep).filter(Boolean);
  let current = root;
  for (const component of relative) {
    current = path.join(current, component);
    if (!fs.existsSync(current)) fs.mkdirSync(current, { mode: 0o700 });
    fs.chmodSync(current, 0o700);
    const stat = fs.lstatSync(current);
    expect(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === issuer.owner_uid,
      "BENCHMARK_V3_OPERATOR_CHANNEL", "operator directory is not issuer-owned");
  }
}
function signed(body, key) {
  return Object.freeze({ ...body,
    signature: sign(null, Buffer.from(canonicalJson(body), "utf8"), key).toString("base64url") });
}
function sha256File(file) {
  return `sha256:${createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`;
}
function sourceBindings(sourceRoot) {
  const source = fs.realpathSync.native(path.resolve(sourceRoot));
  assertClean(source);
  const prepared = buildProfileBundleManifest(source, "lab").manifest;
  const corpus = loadBenchmarkV3Corpus(source);
  const { validation } = loadBenchmarkV3Design(source);
  expect(SHA.test(prepared.source_sha) && FP.test(prepared.source_tree_fingerprint)
    && FP.test(corpus.corpus_fingerprint) && FP.test(validation.design_fingerprint),
  "BENCHMARK_V3_OPERATOR_SOURCE", "frozen benchmark bindings are invalid");
  return Object.freeze({ source, source_sha: prepared.source_sha,
    source_tree_fingerprint: prepared.source_tree_fingerprint,
    corpus_fingerprint: corpus.corpus_fingerprint, design_fingerprint: validation.design_fingerprint, corpus });
}
function executionId(prefix) { return `${prefix}-${randomUUID()}`; }
function readRegistryEvents(issuer) {
  const file = path.resolve(issuer.registry_path);
  if (!fs.existsSync(file)) return [];
  const stat = fs.lstatSync(file);
  expect(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.uid === issuer.owner_uid
    && (stat.mode & 0o077) === 0 && stat.size <= 16 * 1024 * 1024,
  "BENCHMARK_V3_OPERATOR_REGISTRY", "global execution registry is not private and bounded");
  const text = fs.readFileSync(file, "utf8");
  expect(text === "" || text.endsWith("\n"), "BENCHMARK_V3_OPERATOR_REGISTRY", "global execution registry has a torn tail");
  return text === "" ? [] : text.trimEnd().split("\n");
}
function writeExecutionAuthorityClaim(issuer, value) {
  const registryRoot = fs.realpathSync.native(path.resolve(issuer.registry_root));
  const claimPath = path.join(registryRoot, "authority-issuance.json");
  const stat = fs.lstatSync(registryRoot);
  expect(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === issuer.owner_uid
    && (stat.mode & 0o077) === 0,
  "BENCHMARK_V3_OPERATOR_REGISTRY", "execution authority registry root is not private and issuer-owned");
  const descriptor = fs.openSync(claimPath,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
  try { fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
  const directory = fs.openSync(registryRoot, fs.constants.O_RDONLY);
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  return claimPath;
}

export function issueBenchmarkV3ExecutionAuthority({ sourceRoot, custodyRoot, outputDirectory, receiptPath,
  ownerUid = 0, lifetimeMs = 30 * 24 * 60 * 60 * 1000, now = Date.now() }) {
  expect(path.isAbsolute(outputDirectory) && path.isAbsolute(receiptPath) && Number.isSafeInteger(lifetimeMs)
    && lifetimeMs > 0 && lifetimeMs <= 30 * 24 * 60 * 60 * 1000,
  "BENCHMARK_V3_OPERATOR_ARGUMENT", "execution authority arguments are invalid");
  const bindings = sourceBindings(sourceRoot);
  const issuer = issuerForRole(bindings.source, "execution-authority");
  expect(readRegistryEvents(issuer).length === 0,
    "BENCHMARK_V3_OPERATOR_REGISTRY", "global execution registry is not empty before authority issuance");
  const key = loadBenchmarkV3OperatorPrivateKey({ custodyRoot, role: "execution-authority", ownerUid });
  assertKeyMatchesIssuer(key, issuer, "execution-authority");
  const body = Object.freeze({ schema_version: 1, issuer_id: issuer.issuer_id,
    protected_channel: issuer.protected_channel, campaign_execution_id: executionId("campaign"),
    holdout_execution_id: executionId("holdout"), source_sha: bindings.source_sha,
    source_tree_fingerprint: bindings.source_tree_fingerprint, design_fingerprint: bindings.design_fingerprint,
    corpus_fingerprint: bindings.corpus_fingerprint,
    output_directory_fingerprint: fingerprint(path.resolve(outputDirectory)), issued_at_ms: now,
    expires_at_ms: now + lifetimeMs });
  expect(SAFE_ID.test(body.campaign_execution_id) && SAFE_ID.test(body.holdout_execution_id),
    "BENCHMARK_V3_OPERATOR_AUTHORITY", "generated execution IDs are invalid");
  const receipt = signed(body, key);
  const authorityFingerprint = fingerprint(receipt);
  const issuanceClaim = signed(Object.freeze({ schema_version: 1, issuer_id: issuer.issuer_id,
    authority_fingerprint: authorityFingerprint, campaign_execution_id: body.campaign_execution_id,
    holdout_execution_id: body.holdout_execution_id, source_sha: body.source_sha,
    source_tree_fingerprint: body.source_tree_fingerprint,
    output_directory_fingerprint: body.output_directory_fingerprint, issued_at_ms: body.issued_at_ms }), key);
  const issuanceClaimPath = writeExecutionAuthorityClaim(issuer, issuanceClaim);
  writeProtectedJson(receiptPath, receipt, issuer);
  return Object.freeze({ receipt_path: receiptPath, authority_fingerprint: authorityFingerprint,
    issuance_claim_path: issuanceClaimPath, issuance_claim_fingerprint: fingerprint(issuanceClaim),
    campaign_execution_id: body.campaign_execution_id, holdout_execution_id: body.holdout_execution_id,
    source_sha: body.source_sha, source_tree_fingerprint: body.source_tree_fingerprint });
}

function reviewRole(reviewer) { return reviewer === "one" ? "reviewer-one" : "reviewer-two"; }
function validateReviewResult(result, issuer, bindings) {
  const keys = ["schema_version", "reviewer_id", "review_execution_id", "review_method", "review_evidence_fingerprint",
    "read_only", "source_sha", "source_tree_fingerprint", "high_findings", "medium_findings",
    "corpus_contract_reviewed", "contract_coverage_reviewed", "oracle_leakage_reviewed"];
  expect(result && typeof result === "object" && !Array.isArray(result)
    && canonicalJson(Object.keys(result).sort()) === canonicalJson([...keys].sort())
    && result.schema_version === 1 && result.read_only === true
    && result.reviewer_id === issuer.reviewer_id && SAFE_ID.test(result.review_execution_id)
    && result.review_method === "independent-read-only-agent-v1" && FP.test(result.review_evidence_fingerprint)
    && result.source_sha === bindings.source_sha && result.source_tree_fingerprint === bindings.source_tree_fingerprint
    && result.high_findings === 0 && result.medium_findings === 0
    && result.corpus_contract_reviewed === true && result.contract_coverage_reviewed === true
    && result.oracle_leakage_reviewed === true,
  "BENCHMARK_V3_OPERATOR_REVIEW", "review result is not an exact current-head zero-HIGH/zero-MEDIUM pass");
}

export function signBenchmarkV3ReviewEvidence({ sourceRoot, custodyRoot, reviewer, resultPath,
  evidencePath, outputPath, ownerUid = 0, now = new Date().toISOString() }) {
  expect(["one", "two"].includes(reviewer) && [resultPath, evidencePath, outputPath].every(path.isAbsolute),
    "BENCHMARK_V3_OPERATOR_ARGUMENT", "review signing arguments are invalid");
  const bindings = sourceBindings(sourceRoot);
  let result;
  try { result = JSON.parse(fs.readFileSync(resultPath, "utf8")); }
  catch { fail("BENCHMARK_V3_OPERATOR_REVIEW", "structured independent review result is unavailable"); }
  const role = reviewRole(reviewer);
  const issuer = issuerForRole(bindings.source, role);
  validateReviewResult(result, issuer, bindings);
  const evidenceStat = fs.lstatSync(evidencePath);
  expect(evidenceStat.isFile() && !evidenceStat.isSymbolicLink() && evidenceStat.nlink === 1
    && evidenceStat.size >= 1 && evidenceStat.size <= 256 * 1024
    && result.review_evidence_fingerprint === sha256File(evidencePath),
  "BENCHMARK_V3_OPERATOR_REVIEW", "review evidence bytes do not match the structured result");
  const key = verifyBenchmarkV3ReviewerRegistryKey({ sourceRoot: bindings.source, custodyRoot, reviewer, ownerUid });
  const reviewResultFingerprint = fingerprint(result);
  const unsigned = Object.freeze({ schema_version: 3, issuer_id: issuer.issuer_id, reviewer_id: issuer.reviewer_id,
    protected_channel: issuer.protected_channel, read_only: true, verdict: "passed", high_findings: 0,
    medium_findings: 0, source_sha: bindings.source_sha, source_tree_fingerprint: bindings.source_tree_fingerprint,
    corpus_contract_reviewed: true, contract_coverage_reviewed: true, oracle_leakage_reviewed: true,
    review_execution_id: result.review_execution_id, review_method: result.review_method,
    review_evidence_fingerprint: result.review_evidence_fingerprint,
    review_result_fingerprint: reviewResultFingerprint, reviewed_at: now });
  const reviewFingerprint = fingerprint(unsigned);
  const receipt = signed(Object.freeze({ ...unsigned, review_fingerprint: reviewFingerprint }), key);
  const descriptor = fs.openSync(outputPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
  try { fs.writeFileSync(descriptor, `${JSON.stringify(receipt, null, 2)}\n`); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
  return Object.freeze({ output_path: outputPath, reviewer_id: issuer.reviewer_id,
    review_fingerprint: reviewFingerprint, source_sha: bindings.source_sha });
}

export function issueBenchmarkV3ReviewReceipt({ sourceRoot, reviewer, resultPath, receiptPath }) {
  expect(["one", "two"].includes(reviewer) && path.isAbsolute(resultPath) && path.isAbsolute(receiptPath),
    "BENCHMARK_V3_OPERATOR_ARGUMENT", "review issuance arguments are invalid");
  const bindings = sourceBindings(sourceRoot);
  let receipt;
  try { receipt = JSON.parse(fs.readFileSync(resultPath, "utf8")); }
  catch { fail("BENCHMARK_V3_OPERATOR_REVIEW", "signed independent review result is unavailable"); }
  const issuer = issuerForRole(bindings.source, reviewRole(reviewer));
  const { signature, review_fingerprint: reviewFingerprint, ...unsigned } = receipt ?? {};
  expect(unsigned.schema_version === 3 && unsigned.issuer_id === issuer.issuer_id
    && unsigned.reviewer_id === issuer.reviewer_id && unsigned.protected_channel === issuer.protected_channel
    && unsigned.read_only === true && unsigned.verdict === "passed" && unsigned.high_findings === 0
    && unsigned.medium_findings === 0 && unsigned.source_sha === bindings.source_sha
    && unsigned.source_tree_fingerprint === bindings.source_tree_fingerprint
    && unsigned.corpus_contract_reviewed === true && unsigned.contract_coverage_reviewed === true
    && unsigned.oracle_leakage_reviewed === true && SAFE_ID.test(unsigned.review_execution_id)
    && unsigned.review_method === "independent-read-only-agent-v1" && FP.test(unsigned.review_evidence_fingerprint)
    && FP.test(unsigned.review_result_fingerprint) && typeof unsigned.reviewed_at === "string"
    && Number.isFinite(Date.parse(unsigned.reviewed_at)) && reviewFingerprint === fingerprint(unsigned)
    && typeof signature === "string" && verify(null,
      Buffer.from(canonicalJson({ ...unsigned, review_fingerprint: reviewFingerprint }), "utf8"),
      createPublicKey(issuer.public_key_pem), Buffer.from(signature, "base64url")),
  "BENCHMARK_V3_OPERATOR_REVIEW", "signed independent review result is invalid or stale");
  writeProtectedJson(path.join(path.resolve(issuer.channel_root), "review-issuance.json"), Object.freeze({
    schema_version: 1, reviewer_id: issuer.reviewer_id, review_execution_id: unsigned.review_execution_id,
    source_sha: bindings.source_sha, source_tree_fingerprint: bindings.source_tree_fingerprint,
    review_result_fingerprint: unsigned.review_result_fingerprint, receipt_fingerprint: fingerprint(receipt),
  }), issuer);
  writeProtectedJson(receiptPath, receipt, issuer);
  return Object.freeze({ receipt_path: receiptPath, reviewer_id: issuer.reviewer_id,
    review_fingerprint: reviewFingerprint, source_sha: bindings.source_sha });
}

export function issueBenchmarkV3ReadinessReceipts({ sourceRoot, custodyRoot, probeEvidence, processReceiptPath,
  namespaceReceiptPath, egressProbeEvidence = null, egressReceiptPath = null,
  ownerUid = 0, lifetimeMs = 24 * 60 * 60 * 1000, now = Date.now() }) {
  expect(path.isAbsolute(processReceiptPath) && path.isAbsolute(namespaceReceiptPath)
    && Number.isSafeInteger(lifetimeMs) && lifetimeMs > 0 && lifetimeMs <= 24 * 60 * 60 * 1000,
  "BENCHMARK_V3_OPERATOR_ARGUMENT", "readiness issuance arguments are invalid");
  const evidence = verifyBenchmarkV3OperatorProbeEvidence(probeEvidence);
  const bindings = sourceBindings(sourceRoot);
  expect(evidence.source_sha === bindings.source_sha && evidence.source_tree_fingerprint === bindings.source_tree_fingerprint,
    "BENCHMARK_V3_OPERATOR_READINESS", "probe evidence is stale for the frozen source");
  const issuer = issuerForRole(bindings.source, "readiness");
  const key = loadBenchmarkV3OperatorPrivateKey({ custodyRoot, role: "readiness", ownerUid });
  assertKeyMatchesIssuer(key, issuer, "readiness");
  const environment = benchmarkV3ReadinessEnvironment();
  const issue = (capability, receiptPath) => {
    const body = Object.freeze({ schema_version: 2, issuer_id: issuer.issuer_id,
      protected_channel: issuer.protected_channel, ...environment, source_sha: bindings.source_sha,
      capability, status: "verified", issued_at_ms: now, expires_at_ms: now + lifetimeMs });
    const receipt = signed(body, key);
    writeProtectedJson(receiptPath, receipt, issuer);
    return Object.freeze({ capability, receipt_path: receiptPath, receipt_fingerprint: fingerprint(receipt) });
  };
  const receipts = [issue("real-process-containment", processReceiptPath),
    issue("hidden-namespace-isolation", namespaceReceiptPath)];
  if (egressProbeEvidence !== null || egressReceiptPath !== null) {
    expect(path.isAbsolute(egressReceiptPath), "BENCHMARK_V3_OPERATOR_ARGUMENT", "egress receipt path is invalid");
    const egressEvidence = verifyBenchmarkV3ProviderOnlyEgressEvidence(egressProbeEvidence);
    expect(egressEvidence.source_sha === bindings.source_sha
      && egressEvidence.source_tree_fingerprint === bindings.source_tree_fingerprint,
    "BENCHMARK_V3_OPERATOR_READINESS", "egress probe evidence is stale for the frozen source");
    receipts.push(issue("provider-only-egress", egressReceiptPath));
  }
  return Object.freeze(receipts);
}

function validateSamplingIdentity(identity) {
  return identity && typeof identity === "object" && !Array.isArray(identity) && STRATA.includes(identity.stratum)
    && SHA.test(identity.source_commit) && SHA.test(identity.parent_commit) && Array.isArray(identity.source_paths)
    && identity.source_paths.length >= 1 && identity.source_paths.length <= 4
    && identity.source_paths.every((entry) => typeof entry === "string" && !path.isAbsolute(entry)
      && !entry.split("/").includes("..") && !entry.includes("\\"));
}

export function commitBenchmarkV3HoldoutSelection({ sourceRoot, custodyRoot, outputDirectory, authorityPath,
  samplingFramePath = null, samplingFrame: suppliedSamplingFrame = null, familyPool = null,
  samplingFrameFactory = null,
  campaignCustodyDirectory, ownerUid = 0, lifetimeMs = 30 * 24 * 60 * 60 * 1000,
  now = Date.now(), salt = randomBytes(32).toString("base64url") }) {
  expect(path.isAbsolute(outputDirectory) && path.isAbsolute(authorityPath)
    && [typeof samplingFramePath === "string" && path.isAbsolute(samplingFramePath),
      Array.isArray(suppliedSamplingFrame), typeof samplingFrameFactory === "function"]
      .filter(Boolean).length === 1
    && path.isAbsolute(campaignCustodyDirectory) && Number.isSafeInteger(lifetimeMs) && lifetimeMs > 0
    && lifetimeMs <= 30 * 24 * 60 * 60 * 1000,
  "BENCHMARK_V3_OPERATOR_ARGUMENT", "holdout commitment arguments are invalid");
  const bindings = sourceBindings(sourceRoot);
  const authority = loadSignedBenchmarkV3ExecutionAuthority({ sourceRoot: bindings.source, receiptPath: authorityPath,
    sourceSha: bindings.source_sha, sourceTreeFingerprint: bindings.source_tree_fingerprint,
    designFingerprint: bindings.design_fingerprint, corpusFingerprint: bindings.corpus_fingerprint,
    outputDirectory: path.resolve(outputDirectory), now });
  expect(readRegistryEvents(authority.issuer).length === 0 && !fs.existsSync(path.join(outputDirectory, "report.json")),
    "BENCHMARK_V3_OPERATOR_HOLDOUT", "holdout commitment must precede every baseline reservation and report");
  let samplingFrame = suppliedSamplingFrame;
  let resolvedFamilyPool = familyPool;
  if (typeof samplingFrameFactory === "function") {
    const generated = samplingFrameFactory();
    samplingFrame = generated?.frame;
    resolvedFamilyPool = generated?.pool ?? null;
  }
  if (samplingFrame === null) {
    try { samplingFrame = JSON.parse(fs.readFileSync(samplingFramePath, "utf8")); }
    catch { fail("BENCHMARK_V3_OPERATOR_HOLDOUT", "external sampling frame is unavailable"); }
  }
  expect(Array.isArray(samplingFrame) && samplingFrame.length >= 90 && samplingFrame.length <= 10_000
    && samplingFrame.every(validateSamplingIdentity),
  "BENCHMARK_V3_OPERATOR_HOLDOUT", "external sampling frame is invalid");
  const normalized = samplingFrame.map((entry) => Object.freeze({ stratum: entry.stratum,
    source_commit: entry.source_commit, parent_commit: entry.parent_commit, source_paths: Object.freeze([...entry.source_paths]) }));
  const publicCommits = new Set(bindings.corpus.split_assignment.entries.map((entry) => entry.source_commit));
  const publicPaths = new Set(bindings.corpus.families.flatMap((entry) => entry.control_surface.provenance.source_paths));
  expect(new Set(normalized.map((entry) => entry.source_commit)).size === normalized.length
    && new Set(normalized.flatMap((entry) => entry.source_paths)).size === normalized.flatMap((entry) => entry.source_paths).length
    && normalized.every((entry) => !publicCommits.has(entry.source_commit)
      && entry.source_paths.every((sourcePath) => !publicPaths.has(sourcePath))),
  "BENCHMARK_V3_OPERATOR_HOLDOUT", "sampling frame overlaps public corpus or contains duplicate identities");
  const strata = Object.fromEntries(STRATA.map((stratum) => [stratum,
    normalized.filter((entry) => entry.stratum === stratum).length]));
  expect(STRATA.every((stratum) => strata[stratum] >= 30),
    "BENCHMARK_V3_OPERATOR_HOLDOUT", "sampling frame does not contain at least 30 identities per stratum");
  expect(resolvedFamilyPool?.schema_version === 1 && Array.isArray(resolvedFamilyPool.families)
    && resolvedFamilyPool.families.length === normalized.length
    && canonicalJson(resolvedFamilyPool.families.map((entry) => entry?.identity)) === canonicalJson(normalized),
  "BENCHMARK_V3_OPERATOR_HOLDOUT", "external private family pool does not cover the exact sampling frame");
  const issuer = issuerForRole(bindings.source, "holdout-custodian");
  const custody = path.resolve(campaignCustodyDirectory);
  expect(inside(path.resolve(issuer.channel_root), custody),
    "BENCHMARK_V3_OPERATOR_CHANNEL", "campaign holdout custody escaped the protected channel");
  const key = loadBenchmarkV3OperatorPrivateKey({ custodyRoot, role: "holdout-custodian", ownerUid });
  assertKeyMatchesIssuer(key, issuer, "holdout-custodian");
  const familyPoolFingerprint = fingerprint(resolvedFamilyPool);
  const familyPoolPath = path.join(custody, "family-pool.private.json");
  const body = Object.freeze({ schema_version: 1, issuer_id: issuer.issuer_id,
    protected_channel: issuer.protected_channel, campaign_execution_id: authority.receipt.campaign_execution_id,
    holdout_execution_id: authority.receipt.holdout_execution_id, source_sha: bindings.source_sha,
    source_tree_fingerprint: bindings.source_tree_fingerprint, design_fingerprint: bindings.design_fingerprint,
    corpus_fingerprint: bindings.corpus_fingerprint, sampling_frame_fingerprint: fingerprint(normalized),
    selection_algorithm: "stratified-sha256-lowest-30-v1", salt_commitment: fingerprint({ salt }),
    sampling_frame_count: normalized.length, selection_count: 90, strata,
    committed_before_baseline: true, issued_at_ms: now, expires_at_ms: now + lifetimeMs });
  const receipt = signed(body, key);
  const poolBindingBody = Object.freeze({ schema_version: 1, issuer_id: issuer.issuer_id,
    protected_channel: issuer.protected_channel, campaign_execution_id: authority.receipt.campaign_execution_id,
    holdout_execution_id: authority.receipt.holdout_execution_id, source_sha: bindings.source_sha,
    source_tree_fingerprint: bindings.source_tree_fingerprint, design_fingerprint: bindings.design_fingerprint,
    corpus_fingerprint: bindings.corpus_fingerprint, authority_fingerprint: authority.authority_fingerprint,
    commitment_fingerprint: fingerprint(receipt), sampling_frame_fingerprint: body.sampling_frame_fingerprint,
    family_pool_fingerprint: familyPoolFingerprint, salt_commitment: body.salt_commitment,
    custody_directory_fingerprint: fingerprint(custody), issued_at_ms: now, expires_at_ms: now + lifetimeMs });
  const poolBinding = signed(poolBindingBody, key);
  const poolBindingPath = path.join(path.resolve(issuer.channel_root), "one-shot-prebaseline-commitment.json");
  writeProtectedJson(poolBindingPath, poolBinding, issuer);
  createProtectedDirectory(custody, issuer);
  const privateFramePath = path.join(custody, "sampling-frame.private.json");
  const privateSaltPath = path.join(custody, "selection-salt.private.json");
  writeProtectedJson(privateFramePath, normalized, issuer);
  writeProtectedJson(privateSaltPath, { schema_version: 1, salt }, issuer);
  writeProtectedJson(familyPoolPath, resolvedFamilyPool, issuer);
  const commitmentPath = path.join(custody, "commitment.json");
  writeProtectedJson(commitmentPath, receipt, issuer);
  return Object.freeze({ commitment_path: commitmentPath, commitment_fingerprint: fingerprint(receipt),
    sampling_frame_fingerprint: body.sampling_frame_fingerprint, salt_commitment: body.salt_commitment,
    sampling_frame_count: normalized.length, strata: Object.freeze(strata),
    family_pool_fingerprint: familyPoolFingerprint, family_pool_path: familyPoolPath,
    pool_binding_path: poolBindingPath, pool_binding_fingerprint: fingerprint(poolBinding) });
}
