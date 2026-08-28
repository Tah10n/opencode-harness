import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { canonicalJson, fingerprint } from "../lib/feedback/contracts.mjs";
import { assertBenchmarkV3CapabilityAuthorization, authorizeBenchmarkV3Capabilities,
  benchmarkV3ReadinessEnvironment, validateBenchmarkV3ReadinessReceipt } from "../lib/benchmark/v3-readiness.mjs";
import { verifyBenchmarkV3SplitDistribution } from "../lib/benchmark/v3-split-assignment.mjs";
import { benchmarkV3CampaignLeasePath, benchmarkV3CampaignRegistryPath, benchmarkV3LeaseTargetFingerprint,
  performBenchmarkV3LeaseTakeover } from "../lib/benchmark/v3-lease-takeover.mjs";

import { materializeProfileBundleV3 } from "../lib/profile-v3.mjs";
import { captureBenchmarkV3Workspace, fingerprintBenchmarkV3SemanticRuntimeKey,
  loadBenchmarkV3Corpus } from "../lib/benchmark/v3-corpus.mjs";
import { loadBenchmarkV3Design } from "../lib/benchmark/v3-design.mjs";
import {
  buildBenchmarkV3AttemptEnvelope,
  buildBenchmarkV3CampaignComparisonEvidence,
  buildBenchmarkV3DevelopmentComparisonEvidence,
  buildBenchmarkV3ValidationInfrastructureEvidence,
  buildBenchmarkV3CampaignFingerprint,
  buildBenchmarkV3ModelBinding,
  benchmarkV3PreflightEnvironment,
  benchmarkV3AttemptTimeouts,
  classifyBenchmarkV3AttemptReceipt,
  createBenchmarkV3OAuthCredentialBroker,
  createBenchmarkV3ProviderCredentialStore,
  createBenchmarkV3CampaignJournal,
  evaluateBenchmarkV3EfficacyGate,
  evaluateBenchmarkV3Guardrails,
  preflightBenchmarkV3ProviderCredentialStore,
  resolveBenchmarkV3StudySeeds,
  summarizeBenchmarkV3Stage,
  validateBenchmarkV3ReviewReceipt,
  validateBenchmarkV3ReviewIssuers,
  validateBenchmarkV3OperationalExecutionBinding,
  verifyBenchmarkV3OpenCodeExecutable,
  verifyBenchmarkV3OracleSubjectSafety,
  verifyBenchmarkV3FilesystemIsolation,
  verifyBenchmarkV3ProductBundle,
} from "../lib/benchmark/v3-runner.mjs";
import { BenchmarkV3CredentialBridgePlugin } from "../lib/benchmark/v3-opencode-provider-bridge-plugin.mjs";
import { initializeBenchmarkV3OpenAIOAuthState, loadBenchmarkV3OpenAIOAuthState } from "../lib/benchmark/v3-provider-auth-state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { value: design } = loadBenchmarkV3Design(root);
const corpus = loadBenchmarkV3Corpus(root);
const inventoryFixture = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-v3-inventory-env-"));
try {
  const runtime = path.join(inventoryFixture, "eslint-v7");
  const dependency = path.join(runtime, "node_modules", "fixture-dependency");
  const localDependencyTarget = path.join(runtime, "packages", "local-dependency");
  const localDependency = path.join(runtime, "node_modules", "local-dependency");
  const selfDependency = path.join(runtime, "node_modules", "eslint");
  const mocha = path.join(runtime, "node_modules", "mocha");
  fs.mkdirSync(path.join(mocha, "bin"), { recursive: true });
  fs.mkdirSync(dependency, { recursive: true });
  fs.mkdirSync(localDependencyTarget, { recursive: true });
  fs.symlinkSync(path.relative(path.dirname(localDependency), localDependencyTarget), localDependency, "dir");
  fs.symlinkSync("..", selfDependency, "dir");
  fs.writeFileSync(path.join(runtime, "package.json"), JSON.stringify({ name: "eslint", version: "7.0.0",
    dependencies: { "fixture-dependency": "1.0.0", "local-dependency": "file:packages/local-dependency" },
    devDependencies: { eslint: "file:.", mocha: "1.0.0" } }));
  fs.writeFileSync(path.join(runtime, "package-lock.json"), JSON.stringify({ name: "eslint", version: "7.0.0",
    lockfileVersion: 3, packages: { "": { name: "eslint", version: "7.0.0",
      dependencies: { "fixture-dependency": "1.0.0", "local-dependency": "file:packages/local-dependency" },
      devDependencies: { eslint: "file:.", mocha: "1.0.0" } }, "node_modules/eslint": { resolved: "", link: true },
      "node_modules/fixture-dependency": { version: "1.0.0" },
      "node_modules/local-dependency": { resolved: "packages/local-dependency", link: true },
      "packages/local-dependency": { name: "local-dependency", version: "3.0.0" },
      "node_modules/mocha": { version: "1.0.0" } } }));
  fs.writeFileSync(path.join(dependency, "package.json"), JSON.stringify({ name: "fixture-dependency", version: "1.0.0" }));
  fs.writeFileSync(path.join(localDependencyTarget, "package.json"), JSON.stringify({ name: "local-dependency", version: "3.0.0" }));
  fs.writeFileSync(path.join(mocha, "package.json"), JSON.stringify({ name: "mocha", version: "1.0.0" }));
  fs.writeFileSync(path.join(mocha, "bin", "mocha.js"), "process.exit(0);\n");
  const packageFile = path.join(runtime, "package.json");
  const lockFile = path.join(runtime, "package-lock.json");
  const validPackage = fs.readFileSync(packageFile, "utf8");
  const validLock = fs.readFileSync(lockFile, "utf8");
  const traversalPackage = JSON.parse(validPackage);
  traversalPackage.dependencies["../../outside"] = "1.0.0";
  const traversalLock = JSON.parse(validLock);
  traversalLock.packages[""].dependencies["../../outside"] = "1.0.0";
  traversalLock.packages["node_modules/../../outside"] = { version: "1.0.0" };
  fs.writeFileSync(packageFile, JSON.stringify(traversalPackage));
  fs.writeFileSync(lockFile, JSON.stringify(traversalLock));
  assert.throws(() => fingerprintBenchmarkV3SemanticRuntimeKey(inventoryFixture, "eslint-v7"), /dependencies are invalid/u,
    "semantic runtime inventory must reject dependency names that escape the node_modules tree");
  fs.writeFileSync(packageFile, validPackage);
  const lockWithoutRequiredEntry = JSON.parse(validLock);
  delete lockWithoutRequiredEntry.packages["node_modules/fixture-dependency"];
  fs.writeFileSync(lockFile, JSON.stringify(lockWithoutRequiredEntry));
  assert.throws(() => fingerprintBenchmarkV3SemanticRuntimeKey(inventoryFixture, "eslint-v7"), /absent from the lockfile/u,
    "semantic runtime inventory must reject an installed required dependency omitted from the lockfile");
  const lockWithoutRootDeclaration = JSON.parse(validLock);
  delete lockWithoutRootDeclaration.packages[""].dependencies["fixture-dependency"];
  fs.writeFileSync(lockFile, JSON.stringify(lockWithoutRootDeclaration));
  assert.throws(() => fingerprintBenchmarkV3SemanticRuntimeKey(inventoryFixture, "eslint-v7"), /declaration does not match/u,
    "semantic runtime inventory must reject a required dependency omitted from the lockfile v3 root declaration");
  const lockWithoutSelfEntry = JSON.parse(validLock);
  delete lockWithoutSelfEntry.packages["node_modules/eslint"];
  fs.writeFileSync(lockFile, JSON.stringify(lockWithoutSelfEntry));
  fs.unlinkSync(selfDependency);
  assert.throws(() => fingerprintBenchmarkV3SemanticRuntimeKey(inventoryFixture, "eslint-v7"), /self dependency/u,
    "semantic runtime inventory must reject an absent self lock entry and root link");
  fs.symlinkSync("..", selfDependency, "dir");
  const mismatchedPackage = JSON.parse(validPackage);
  mismatchedPackage.dependencies["fixture-dependency"] = "2.0.0";
  const mismatchedLock = JSON.parse(validLock);
  mismatchedLock.packages[""].dependencies["fixture-dependency"] = "2.0.0";
  fs.writeFileSync(packageFile, JSON.stringify(mismatchedPackage));
  fs.writeFileSync(lockFile, JSON.stringify(mismatchedLock));
  assert.throws(() => fingerprintBenchmarkV3SemanticRuntimeKey(inventoryFixture, "eslint-v7"), /declaration and lockfile/u,
    "semantic runtime inventory must reject an installed version outside its declared range");
  fs.writeFileSync(packageFile, validPackage);
  const validV1Lock = { name: "eslint", version: "7.0.0", lockfileVersion: 1,
    dependencies: { "fixture-dependency": { version: "1.0.0" },
      "local-dependency": { version: "file:packages/local-dependency" }, eslint: { version: "file:." },
      mocha: { version: "1.0.0" } } };
  fs.writeFileSync(lockFile, JSON.stringify(validV1Lock));
  assert.match(fingerprintBenchmarkV3SemanticRuntimeKey(inventoryFixture, "eslint-v7").inventory_fingerprint, /^sha256:/u,
    "semantic runtime inventory must retain child-free lockfile v1 compatibility");
  fs.writeFileSync(lockFile, JSON.stringify({ ...validV1Lock, name: "not-eslint", version: "999.0.0" }));
  assert.throws(() => fingerprintBenchmarkV3SemanticRuntimeKey(inventoryFixture, "eslint-v7"), /root package does not match/u,
    "semantic runtime inventory must reject a lockfile v1 with substituted root identity");
  fs.writeFileSync(lockFile, validLock);
  const wrongVersionPackage = { ...JSON.parse(validPackage), version: "8.0.0" };
  const wrongVersionLock = JSON.parse(validLock);
  wrongVersionLock.version = "8.0.0";
  wrongVersionLock.packages[""].version = "8.0.0";
  fs.writeFileSync(packageFile, JSON.stringify(wrongVersionPackage));
  fs.writeFileSync(lockFile, JSON.stringify(wrongVersionLock));
  assert.throws(() => fingerprintBenchmarkV3SemanticRuntimeKey(inventoryFixture, "eslint-v7"), /declared key/u,
    "semantic runtime inventory must reject a root version that does not match its directory key");
  fs.writeFileSync(packageFile, validPackage);
  fs.writeFileSync(lockFile, validLock);
  const poisonMarker = path.join(inventoryFixture, "ambient-node-options-executed");
  const poisonModule = path.join(inventoryFixture, "poison.cjs");
  fs.writeFileSync(poisonModule, `require("node:fs").writeFileSync(${JSON.stringify(poisonMarker)}, "executed")`);
  const previousNodeOptions = process.env.NODE_OPTIONS;
  process.env.NODE_OPTIONS = `--require=${poisonModule}`;
  try { assert.match(fingerprintBenchmarkV3SemanticRuntimeKey(inventoryFixture, "eslint-v7").inventory_fingerprint, /^sha256:/u); }
  finally { if (previousNodeOptions === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = previousNodeOptions; }
  assert.equal(fs.existsSync(poisonMarker), false,
    "semantic runtime inventory must not launch an ambient NODE_OPTIONS-poisonable npm child");
} finally { fs.rmSync(inventoryFixture, { recursive: true, force: true }); }
const preflightEnvironment = benchmarkV3PreflightEnvironment({ PATH: process.env.PATH ?? "", HOME: os.homedir(),
  OPENAI_API_KEY: "forbidden-openai-sentinel", GITHUB_TOKEN: "forbidden-github-sentinel",
  NODE_OPTIONS: "--require=/tmp/forbidden.js", CI: "true" }, {
  semanticRuntimeRoot: path.join(root, "semantic-runtime"), provenanceBundle: path.join(root, "provenance.bundle"),
});
assert.equal(preflightEnvironment.CI, "true");
assert.equal(preflightEnvironment.BENCHMARK_V3_GATE_CHILD, "1");
for (const forbidden of ["OPENAI_API_KEY", "GITHUB_TOKEN", "NODE_OPTIONS"]) {
  assert.equal(Object.hasOwn(preflightEnvironment, forbidden), false,
    `model-free preflight inherited forbidden host credential ${forbidden}`);
}
const candidateTimeoutBudget = benchmarkV3AttemptTimeouts(900_000, "candidate");
assert.equal(candidateTimeoutBudget.model_timeout_ms, 900_000);
assert.equal(candidateTimeoutBudget.wrapper_timeout_ms, 900_000);
assert(candidateTimeoutBudget.worker_timeout_ms >= candidateTimeoutBudget.wrapper_timeout_ms + 300_000,
  "outer worker deadline must reserve wrapper teardown, verification, and FD3 receipt time");
assert(candidateTimeoutBudget.complete_authorization_reservation_ms
  >= candidateTimeoutBudget.managed_timeout_ms + 150_000,
"capability freshness must cover the entire model plus contained-oracle envelope");
assert.equal(verifyBenchmarkV3SplitDistribution(corpus.split_assignment).passed, true);
const staleDistributionAssignment = structuredClone(corpus.split_assignment);
staleDistributionAssignment.entries[0].patch_size_bytes = Number.MAX_SAFE_INTEGER;
assert.equal(verifyBenchmarkV3SplitDistribution(staleDistributionAssignment).passed, false,
  "stale aggregate distribution must not conceal changed assignment metrics");
const substitutedAssignment = structuredClone(corpus.split_assignment);
const firstSplit = substitutedAssignment.entries[0].split;
const replacement = substitutedAssignment.entries.find((entry) => entry.split !== firstSplit);
[substitutedAssignment.entries[0].split, replacement.split] = [replacement.split, substitutedAssignment.entries[0].split];
assert.equal(verifyBenchmarkV3SplitDistribution(substitutedAssignment).passed, false,
  "substituted seeded split assignment must be rejected");
const readinessRoot = fs.mkdtempSync(path.join(root, ".v3-readiness-receipt-"));
try {
  if (process.platform === "win32") {
    assert.throws(() => validateBenchmarkV3ReadinessReceipt("C:\\untrusted.json", {
      capability: "real-process-containment", sourceRoot: root,
    }));
  } else {
  fs.chmodSync(readinessRoot, 0o700);
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const issuer = Object.freeze({
    issuer_id: "fixture-readiness-issuer-v1",
    protected_channel: "fixture-protected-channel-v1",
    channel_root: readinessRoot,
    owner_uid: process.getuid(),
    capabilities: Object.freeze(["real-process-containment", "hidden-namespace-isolation", "provider-only-egress"]),
    public_key_pem: publicKey.export({ type: "spki", format: "pem" }),
  });
  const environment = benchmarkV3ReadinessEnvironment();
  const sourceSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
  const body = { schema_version: 2, issuer_id: issuer.issuer_id, protected_channel: issuer.protected_channel,
    ...environment, source_sha: sourceSha, capability: "real-process-containment",
    status: "verified", issued_at_ms: Date.now() - 1_000, expires_at_ms: Date.now() + 60_000 };
  const receiptPath = path.join(readinessRoot, "receipt.json");
  const signed = { ...body, signature: sign(null, Buffer.from(canonicalJson(body), "utf8"), privateKey).toString("base64url") };
  fs.writeFileSync(receiptPath, JSON.stringify(signed), { mode: 0o600 });
  assert.equal(validateBenchmarkV3ReadinessReceipt(receiptPath, {
    capability: body.capability, sourceRoot: root, trustedIssuers: [issuer],
  }).status, "verified");
  const capabilityPaths = { "real-process-containment": receiptPath };
  for (const capability of ["hidden-namespace-isolation", "provider-only-egress"]) {
    const capabilityBody = { ...body, capability };
    const capabilityPath = path.join(readinessRoot, `${capability}.json`);
    fs.writeFileSync(capabilityPath, JSON.stringify({ ...capabilityBody,
      signature: sign(null, Buffer.from(canonicalJson(capabilityBody), "utf8"), privateKey).toString("base64url") }), { mode: 0o600 });
    capabilityPaths[capability] = capabilityPath;
  }
  const authorization = authorizeBenchmarkV3Capabilities(capabilityPaths, { sourceRoot: root, trustedIssuers: [issuer], scope: "holdout" });
  assert.match(authorization.authorization_fingerprint, /^sha256:[0-9a-f]{64}$/u);
  assert.throws(() => assertBenchmarkV3CapabilityAuthorization(authorization, { now: authorization.expires_at_ms }), /fresh/u,
    "campaign attempts must not outlive capability evidence");
  assert.throws(() => assertBenchmarkV3CapabilityAuthorization(authorization,
    { now: authorization.expires_at_ms - 1_000, minimumRemainingMs: 2_000 }), /complete bounded operation/u,
  "an attempt must not start unless receipts remain fresh for its complete timeout envelope");
  const reviewIssuer = { issuer_id: "fixture-review-issuer-v1", reviewer_id: "fixture-independent-reviewer",
    protected_channel: "fixture-protected-review-channel", channel_root: readinessRoot, owner_uid: process.getuid(),
    public_key_pem: issuer.public_key_pem };
  const secondReviewIssuer = { ...reviewIssuer, issuer_id: "fixture-review-issuer-two-v1",
    reviewer_id: "fixture-independent-reviewer-two", protected_channel: "fixture-protected-review-channel-two" };
  assert.throws(() => validateBenchmarkV3ReviewIssuers({ schema_version: 1,
    issuers: [reviewIssuer, secondReviewIssuer] }), /canonical signing keys must be independent/u,
  "different reviewer IDs backed by the same signing key must not satisfy independence");
  const reviewUnsigned = { schema_version: 3, issuer_id: reviewIssuer.issuer_id, reviewer_id: reviewIssuer.reviewer_id,
    protected_channel: reviewIssuer.protected_channel,
    read_only: true, verdict: "passed", high_findings: 0, medium_findings: 0, source_sha: sourceSha,
    source_tree_fingerprint: `sha256:${"9".repeat(64)}`, corpus_contract_reviewed: true,
    contract_coverage_reviewed: true, oracle_leakage_reviewed: true,
    review_execution_id: "review-fixture-execution-0001", review_method: "independent-read-only-agent-v1",
    review_evidence_fingerprint: `sha256:${"7".repeat(64)}`,
    review_result_fingerprint: `sha256:${"8".repeat(64)}`, reviewed_at: new Date().toISOString() };
  const reviewFingerprint = fingerprint(reviewUnsigned);
  const reviewSignedBody = { ...reviewUnsigned, review_fingerprint: reviewFingerprint };
  const reviewPath = path.join(readinessRoot, "review.json");
  const signedReview = { ...reviewSignedBody,
    signature: sign(null, Buffer.from(canonicalJson(reviewSignedBody), "utf8"), privateKey).toString("base64url") };
  fs.writeFileSync(reviewPath, JSON.stringify(signedReview), { mode: 0o600 });
  assert.equal(validateBenchmarkV3ReviewReceipt(reviewPath, { sourceSha,
    sourceTreeFingerprint: reviewUnsigned.source_tree_fingerprint, trustedIssuers: [reviewIssuer] }).verdict, "passed");
  const tamperedReview = JSON.parse(fs.readFileSync(reviewPath, "utf8")); tamperedReview.medium_findings = 1;
  fs.writeFileSync(reviewPath, JSON.stringify(tamperedReview), { mode: 0o600 });
  assert.throws(() => validateBenchmarkV3ReviewReceipt(reviewPath, { sourceSha,
    sourceTreeFingerprint: reviewUnsigned.source_tree_fingerprint, trustedIssuers: [reviewIssuer] }));
  const canonicalParent = path.join(readinessRoot, "canonical-parent");
  const configuredParent = path.join(readinessRoot, "configured-parent");
  const canonicalChannel = path.join(canonicalParent, "readiness");
  fs.mkdirSync(canonicalChannel, { recursive: true, mode: 0o700 });
  fs.symlinkSync(canonicalParent, configuredParent);
  const aliasedIssuer = Object.freeze({ ...issuer, channel_root: path.join(configuredParent, "readiness") });
  const canonicalReceiptPath = path.join(canonicalChannel, "receipt.json");
  fs.writeFileSync(canonicalReceiptPath, JSON.stringify(signed), { mode: 0o600 });
  assert.equal(validateBenchmarkV3ReadinessReceipt(path.join(aliasedIssuer.channel_root, "receipt.json"), {
    capability: body.capability, sourceRoot: root, trustedIssuers: [aliasedIssuer],
  }).status, "verified", "a configured channel beneath a system symlink ancestor must remain usable");
  assert.equal(validateBenchmarkV3ReadinessReceipt(canonicalReceiptPath, {
    capability: body.capability, sourceRoot: root, trustedIssuers: [aliasedIssuer],
  }).status, "verified", "the canonical spelling of a protected channel must remain usable");
  const aliasedReviewIssuer = Object.freeze({ ...reviewIssuer, channel_root: path.join(configuredParent, "readiness") });
  const canonicalReviewPath = path.join(canonicalChannel, "review.json");
  fs.writeFileSync(canonicalReviewPath, JSON.stringify(signedReview), { mode: 0o600 });
  assert.equal(validateBenchmarkV3ReviewReceipt(path.join(aliasedReviewIssuer.channel_root, "review.json"), { sourceSha,
    sourceTreeFingerprint: reviewUnsigned.source_tree_fingerprint, trustedIssuers: [aliasedReviewIssuer] }).verdict, "passed",
  "configured /var-style symlink ancestry must canonicalize for protected review receipts");
  const alternateAlias = path.join(readinessRoot, "alternate-channel");
  fs.symlinkSync(canonicalChannel, alternateAlias);
  assert.throws(() => validateBenchmarkV3ReadinessReceipt(path.join(alternateAlias, "receipt.json"), {
    capability: body.capability, sourceRoot: root, trustedIssuers: [aliasedIssuer],
  }), /protected channel/u, "an unregistered alternate alias into the protected channel must be rejected");
  fs.writeFileSync(receiptPath, JSON.stringify({ ...body, signature: "self-authored" }), { mode: 0o600 });
  assert.throws(() => validateBenchmarkV3ReadinessReceipt(receiptPath, {
    capability: body.capability, sourceRoot: root, trustedIssuers: [issuer],
  }), /signature/u, "self-authored readiness JSON must be rejected");
  fs.writeFileSync(receiptPath, JSON.stringify(signed), { mode: 0o600 });
  const hardlinkPath = path.join(readinessRoot, "receipt-hardlink.json");
  fs.linkSync(receiptPath, hardlinkPath);
  assert.throws(() => validateBenchmarkV3ReadinessReceipt(receiptPath, {
    capability: body.capability, sourceRoot: root, trustedIssuers: [issuer],
  }));
  fs.unlinkSync(hardlinkPath);
  const symlinkPath = path.join(readinessRoot, "receipt-symlink.json");
  fs.symlinkSync(receiptPath, symlinkPath);
  assert.throws(() => validateBenchmarkV3ReadinessReceipt(symlinkPath, {
    capability: body.capability, sourceRoot: root, trustedIssuers: [issuer],
  }));
  }
  const readySpoof = spawnSync(process.execPath, [path.join(root, "scripts", "verify-benchmark-v3-development-readiness.mjs")], {
    cwd: root, encoding: "utf8", env: { ...process.env, OPENCODE_QUALITY_PROCESS_CONTAINMENT_READY: "1",
      BENCHMARK_V3_HIDDEN_NAMESPACE_ISOLATION_READY: "1", BENCHMARK_V3_PROVIDER_ONLY_EGRESS_READY: "1" },
  });
  assert.equal(readySpoof.status, 2);
  assert.equal(JSON.parse(readySpoof.stdout).reasons.some((entry) => entry.code === "PROCESS_CONTAINMENT_UNAVAILABLE"), true);
  const holdoutPathSpoof = spawnSync(process.execPath, [path.join(root, "scripts", "verify-benchmark-v3-holdout-readiness.mjs")], {
    cwd: root, encoding: "utf8", env: { ...process.env, BENCHMARK_V3_SEALED_HOLDOUT_ROOT: os.tmpdir() },
  });
  assert.equal(holdoutPathSpoof.status, 2);
  assert.equal(JSON.parse(holdoutPathSpoof.stdout).reasons.some((entry) => entry.code === "SIGNED_EXTERNAL_HOLDOUT_UNAVAILABLE"), true,
    "an arbitrary external directory must never satisfy the sealed holdout gate");
} finally { fs.rmSync(readinessRoot, { recursive: true, force: true }); }
const registryFixture = fs.mkdtempSync(path.join(os.tmpdir(), "v3-campaign-registry-"));
const registryFixtureSecondWorktree = `${registryFixture}-container-two`;
try {
  assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: registryFixture }).status, 0);
  fs.writeFileSync(path.join(registryFixture, "fixture.txt"), "shared git fixture\n");
  assert.equal(spawnSync("git", ["add", "fixture.txt"], { cwd: registryFixture }).status, 0);
  assert.equal(spawnSync("git", ["-c", "user.name=Benchmark V3", "-c", "user.email=benchmark-v3@example.invalid",
    "commit", "--quiet", "-m", "fixture"], { cwd: registryFixture }).status, 0);
  const fixtureIssuerDirectory = path.join(registryFixture, "benchmarks", "v3");
  fs.mkdirSync(fixtureIssuerDirectory, { recursive: true });
  for (const name of ["readiness-issuers.v1.json", "review-issuers.v1.json", "holdout-issuers.v1.json", "execution-authority-issuers.v1.json",
    "lease-takeover-issuers.v1.json"]) {
    fs.copyFileSync(path.join(root, "benchmarks", "v3", name), path.join(fixtureIssuerDirectory, name));
  }
  const campaignFingerprint = `sha256:${"c".repeat(64)}`;
  const attemptBindingFingerprint = `sha256:${"1".repeat(64)}`;
  const initialLedgerBody = Object.freeze({ schema_version: 4, design_fingerprint: `sha256:${"b".repeat(64)}`,
    campaign_fingerprint: campaignFingerprint, campaign_execution_id: "campaign-execution-fixture-001",
    holdout_execution_id: "holdout-execution-fixture-001",
    holdout_selection_commitment_fingerprint: `sha256:${"2".repeat(64)}`,
    arm_order_policy_fingerprint: `sha256:${"3".repeat(64)}`,
    public_arm_order_schedule_fingerprints: Object.freeze({ development: `sha256:${"4".repeat(64)}`,
      validation: `sha256:${"5".repeat(64)}` }), holdout_arm_order_schedule_fingerprint: null,
    registrations: Object.freeze([]), events: Object.freeze([]),
    selected_candidate_id: null, final_candidate_sha: null });
  const initialLedger = Object.freeze({ ...initialLedgerBody, ledger_fingerprint: fingerprint(initialLedgerBody) });
  const output = path.join(registryFixture, "outputs", "campaign-one");
  const operationalBindingFingerprint = `sha256:${"6".repeat(64)}`;
  const createJournal = (target, options = {}) => createBenchmarkV3CampaignJournal(target, {
    sourceRoot: registryFixture, campaignFingerprint, initialLedger, operationalBindingFingerprint, ...options,
  });
  const firstJournal = createJournal(output);
  const reservation = firstJournal.prepareAttempt("baseline", "family-one", 1, attemptBindingFingerprint);
  const firstOutcome = { infrastructure_failure: false, result_fingerprint: `sha256:${"e".repeat(64)}` };
  fs.mkdirSync(path.dirname(reservation.completion_path), { recursive: true });
  fs.writeFileSync(reservation.completion_path, JSON.stringify({ schema_version: 1, campaign_fingerprint: campaignFingerprint,
    arm_id: "baseline", family_id: "family-one", attempt_index: 1,
    attempt_binding_fingerprint: attemptBindingFingerprint, outcome: firstOutcome,
    outcome_fingerprint: fingerprint(firstOutcome) }));
  firstJournal.recordAttempt({ arm_id: "baseline", family_id: "family-one", attempt_index: 1,
    outcome: firstOutcome });
  const staleReusedPidLease = path.join(registryFixture, ".git", "opencode-harness", "benchmark-v3",
    `campaign-${campaignFingerprint.slice(7)}.lease`);
  const liveLease = JSON.parse(fs.readFileSync(staleReusedPidLease, "utf8"));
  fs.writeFileSync(staleReusedPidLease, `${JSON.stringify({ ...liveLease, heartbeat_at_ms: 1 })}\n`, { mode: 0o600 });
  assert.throws(() => createJournal(output),
    /already active/u, "an aged heartbeat must not displace a provably live PID/start owner");
  firstJournal.close();
  assert.throws(() => createJournal(output, { operationalBindingFingerprint: `sha256:${"7".repeat(64)}` }),
    /operational provider environment/u,
  "partial resume must reject API to OAuth or OAuth to API operational transport drift");
  fs.writeFileSync(staleReusedPidLease, `${JSON.stringify({ schema_version: 2, pid: process.pid,
    process_start_fingerprint: fingerprint({ deliberately: "wrong-start-identity" }),
    host_fingerprint: fingerprint(os.hostname().toLowerCase()), nonce: "stale-reused-pid",
    created_at_ms: 1, heartbeat_at_ms: 1 })}\n`, { mode: 0o600 });
  assert.throws(() => createJournal(output),
    /signed audited takeover/u, "same-host PID/start mismatch must not trigger automatic lease reclamation");
  const takeoverChannel = path.join(registryFixture, "takeover-channel"); fs.mkdirSync(takeoverChannel, { mode: 0o700 });
  const { publicKey: takeoverPublicKey, privateKey: takeoverPrivateKey } = generateKeyPairSync("ed25519");
  const takeoverIssuer = { issuer_id: "fixture-takeover-auditor-v1", protected_channel: "fixture-takeover-channel-v1",
    channel_root: takeoverChannel, owner_uid: process.getuid(), public_key_pem: takeoverPublicKey.export({ type: "spki", format: "pem" }) };
  const signTakeover = () => {
    const leaseTarget = benchmarkV3CampaignLeasePath(registryFixture, campaignFingerprint);
    const takeoverBody = { schema_version: 1, issuer_id: takeoverIssuer.issuer_id, protected_channel: takeoverIssuer.protected_channel,
      source_sha: spawnSync("git", ["rev-parse", "HEAD"], { cwd: registryFixture, encoding: "utf8" }).stdout.trim(),
      campaign_fingerprint: campaignFingerprint, lease_target_fingerprint: benchmarkV3LeaseTargetFingerprint(registryFixture, campaignFingerprint),
      observed_lease_fingerprint: fingerprint(fs.readFileSync(leaseTarget, "utf8")), audited_by: "fixture-independent-operator",
      reason: "The fixture proves that reclamation requires explicit signed manual audit.",
      issued_at_ms: Date.now() - 100, expires_at_ms: Date.now() + 60_000 };
    const receiptPath = path.join(takeoverChannel, `receipt-${Date.now()}.json`);
    fs.writeFileSync(receiptPath, JSON.stringify({ ...takeoverBody,
      signature: sign(null, Buffer.from(canonicalJson(takeoverBody), "utf8"), takeoverPrivateKey).toString("base64url") }), { mode: 0o600 });
    return receiptPath;
  };
  const takeoverEvidenceDirectory = path.join(path.dirname(staleReusedPidLease), "takeover-evidence");
  fs.mkdirSync(takeoverEvidenceDirectory, { mode: 0o700 });
  fs.chmodSync(takeoverEvidenceDirectory, 0o770);
  assert.throws(() => performBenchmarkV3LeaseTakeover({ sourceRoot: registryFixture, campaignFingerprint,
    receiptPath: signTakeover(), trustedIssuers: [takeoverIssuer] }), /evidence directory identity/u,
  "takeover must reject a group-writable evidence directory");
  fs.chmodSync(takeoverEvidenceDirectory, 0o700);
  const heartbeatLockPath = `${staleReusedPidLease}.heartbeat-lock`;
  fs.writeFileSync(heartbeatLockPath, `${JSON.stringify({ schema_version: 1, lease_nonce: "in-flight-heartbeat" })}\n`, { mode: 0o600 });
  const leaseBeforeHeartbeatRace = fs.readFileSync(staleReusedPidLease, "utf8");
  assert.throws(() => performBenchmarkV3LeaseTakeover({ sourceRoot: registryFixture, campaignFingerprint,
    receiptPath: signTakeover(), trustedIssuers: [takeoverIssuer] }), /heartbeat update is in flight/u,
  "takeover must reject an already in-flight heartbeat before quarantining the lease");
  assert.equal(fs.readFileSync(staleReusedPidLease, "utf8"), leaseBeforeHeartbeatRace,
    "rejected in-flight heartbeat race must preserve the exact live lease");
  fs.unlinkSync(heartbeatLockPath);
  const staleTakeoverReceipt = signTakeover();
  const leaseBeforeRace = JSON.parse(fs.readFileSync(staleReusedPidLease, "utf8"));
  const leaseAfterRace = `${JSON.stringify({ ...leaseBeforeRace, heartbeat_at_ms: leaseBeforeRace.heartbeat_at_ms + 1 })}\n`;
  fs.writeFileSync(staleReusedPidLease, leaseAfterRace, { mode: 0o600 });
  assert.throws(() => performBenchmarkV3LeaseTakeover({ sourceRoot: registryFixture, campaignFingerprint,
    receiptPath: staleTakeoverReceipt, trustedIssuers: [takeoverIssuer] }), /changed after audit/u,
  "a heartbeat race after signed observation must restore the current lease and reject takeover");
  assert.equal(fs.readFileSync(staleReusedPidLease, "utf8"), leaseAfterRace,
    "rejected takeover must restore the exact quarantined current lease");
  const takeover = performBenchmarkV3LeaseTakeover({ sourceRoot: registryFixture, campaignFingerprint,
    receiptPath: signTakeover(), trustedIssuers: [takeoverIssuer] });
  assert.equal(takeover.status, "taken-over");
  assert.equal(fs.readFileSync(takeover.raw_lease_path, "utf8"), leaseAfterRace,
    "successful takeover must preserve the exact audited raw lease bytes");
  fs.writeFileSync(`${staleReusedPidLease}.takeover-guard`, "manual recovery required\n", { mode: 0o600 });
  assert.throws(() => createJournal(output), /takeover or heartbeat recovery is in progress or requires manual recovery/u,
  "a leftover takeover guard must block automatic lease acquisition");
  fs.unlinkSync(`${staleReusedPidLease}.takeover-guard`);
  fs.writeFileSync(heartbeatLockPath, "manual heartbeat recovery required\n", { mode: 0o600 });
  assert.throws(() => createJournal(output), /heartbeat recovery is in progress or requires manual recovery/u,
  "a leftover heartbeat lock must block automatic lease acquisition");
  fs.unlinkSync(heartbeatLockPath);
  const resumedJournal = createJournal(output);
  assert.equal(resumedJournal.attemptsFor("baseline", "family-one").length, 1,
    "exact resume must preserve completed family execution");
  assert.throws(() => resumedJournal.prepareAttempt("baseline", "family-one", 1, `sha256:${"0".repeat(64)}`),
    /temporal-order binding/u, "exact resume must reject a changed temporal-order attempt binding");
  const crashReservation = resumedJournal.prepareAttempt("candidate", "family-two", 1, attemptBindingFingerprint);
  const crashOutcome = { infrastructure_failure: false, result_fingerprint: `sha256:${"f".repeat(64)}` };
  fs.mkdirSync(path.dirname(crashReservation.completion_path), { recursive: true });
  fs.writeFileSync(crashReservation.completion_path, JSON.stringify({ schema_version: 1,
    campaign_fingerprint: campaignFingerprint, arm_id: "candidate", family_id: "family-two", attempt_index: 1,
    attempt_binding_fingerprint: attemptBindingFingerprint,
    outcome: crashOutcome, outcome_fingerprint: fingerprint(crashOutcome) }));
  resumedJournal.close();
  const crashResumed = createJournal(output);
  assert.deepEqual(crashResumed.prepareAttempt("candidate", "family-two", 1, attemptBindingFingerprint).outcome, crashOutcome,
    "a durable completion written before a crash must resume without another execution");
  const uncertain = crashResumed.prepareAttempt("candidate", "family-three", 1, attemptBindingFingerprint);
  assert.equal(fs.existsSync(uncertain.completion_path), false);
  crashResumed.close();
  const uncertainResume = createJournal(output);
  assert.throws(() => uncertainResume.prepareAttempt("candidate", "family-three", 1, attemptBindingFingerprint), /refusing to repeat/u,
    "an interrupted unreceipted attempt must fail closed instead of repeating a model call");
  uncertainResume.close();
  const recoveredOutcome = { infrastructure_failure: true, result_fingerprint: `sha256:${"9".repeat(64)}` };
  fs.writeFileSync(uncertain.completion_path, JSON.stringify({ schema_version: 1,
    campaign_fingerprint: campaignFingerprint, arm_id: "candidate", family_id: "family-three", attempt_index: 1,
    attempt_binding_fingerprint: attemptBindingFingerprint,
    outcome: recoveredOutcome, outcome_fingerprint: fingerprint(recoveredOutcome) }));
  const recoveredDevelopment = createJournal(output);
  assert.deepEqual(recoveredDevelopment.prepareAttempt("candidate", "family-three", 1, attemptBindingFingerprint).outcome, recoveredOutcome,
    "an authentic late completion may close the exact reserved development attempt");
  const developmentReportBody = { status: "sealed-holdout-required", ledger: initialLedger,
    ledger_fingerprint: initialLedger.ledger_fingerprint };
  const developmentReport = { ...developmentReportBody, study_fingerprint: fingerprint(developmentReportBody) };
  fs.writeFileSync(path.join(output, "report.json"), `${JSON.stringify(developmentReport)}\n`, { mode: 0o600 });
  recoveredDevelopment.markComplete(developmentReport);
  const developmentReportPath = path.join(output, "report.json");
  const tamperedDevelopmentBody = { ...developmentReportBody, validation_efficacy: { passed: true } };
  fs.writeFileSync(developmentReportPath, JSON.stringify({ ...tamperedDevelopmentBody,
    study_fingerprint: fingerprint(tamperedDevelopmentBody) }));
  assert.throws(() => createJournal(output, { phase: "holdout" }), /registered report/u,
  "a self-consistent rewritten development report must not replace the exact registered validation result");
  assert.equal(JSON.parse(fs.readFileSync(benchmarkV3CampaignRegistryPath(registryFixture), "utf8"))
    .entries.find((entry) => entry.campaign_fingerprint === campaignFingerprint).status, "complete",
  "a rejected report substitution must not advance the registered campaign phase");
  fs.writeFileSync(developmentReportPath, `${JSON.stringify(developmentReport)}\n`);
  const holdoutJournal = createJournal(output, { phase: "holdout" });
  assert.equal(holdoutJournal.attemptsFor("baseline", "family-one").length, 1,
    "holdout must resume the exact development/validation checkpoint");
  const holdoutReservation = holdoutJournal.prepareAttempt("candidate", "external-holdout-family-one", 1, attemptBindingFingerprint);
  const holdoutOutcome = { infrastructure_failure: false, result_fingerprint: `sha256:${"a".repeat(64)}` };
  fs.mkdirSync(path.dirname(holdoutReservation.completion_path), { recursive: true });
  fs.writeFileSync(holdoutReservation.completion_path, JSON.stringify({ schema_version: 1,
    campaign_fingerprint: campaignFingerprint, arm_id: "candidate", family_id: "external-holdout-family-one",
    attempt_index: 1, attempt_binding_fingerprint: attemptBindingFingerprint,
    outcome: holdoutOutcome, outcome_fingerprint: fingerprint(holdoutOutcome) }));
  holdoutJournal.recordAttempt({ arm_id: "candidate", family_id: "external-holdout-family-one", attempt_index: 1,
    outcome: holdoutOutcome });
  const extendedLedgerBody = { ...initialLedgerBody, events: [{ event_id: "fixture-holdout-scored" }] };
  const extendedLedger = { ...extendedLedgerBody, ledger_fingerprint: fingerprint(extendedLedgerBody) };
  holdoutJournal.recordLedger(extendedLedger);
  holdoutJournal.close();
  const resumedHoldout = createJournal(output, { phase: "holdout" });
  assert.deepEqual(resumedHoldout.prepareAttempt("candidate", "external-holdout-family-one", 1, attemptBindingFingerprint).outcome, holdoutOutcome,
    "exact holdout resume must preserve a completed confirmatory family instead of executing it twice");
  assert.equal(resumedHoldout.ledger.ledger_fingerprint, extendedLedger.ledger_fingerprint,
    "holdout resume must accept only the exact ledger extension after a scored holdout event");
  resumedHoldout.close();
  const holdoutCheckpointPath = path.join(output, "checkpoint.json");
  const holdoutCheckpointBytes = fs.readFileSync(holdoutCheckpointPath, "utf8");
  const holdoutCheckpoint = JSON.parse(holdoutCheckpointBytes);
  const reboundLedgerBody = { ...holdoutCheckpoint.ledger, campaign_fingerprint: `sha256:${"8".repeat(64)}` };
  delete reboundLedgerBody.ledger_fingerprint;
  const reboundLedger = { ...reboundLedgerBody, ledger_fingerprint: fingerprint(reboundLedgerBody) };
  const reboundCheckpointBody = { schema_version: holdoutCheckpoint.schema_version,
    campaign_fingerprint: holdoutCheckpoint.campaign_fingerprint,
    operational_binding_fingerprint: holdoutCheckpoint.operational_binding_fingerprint,
    attempts: holdoutCheckpoint.attempts, ledger: reboundLedger };
  fs.writeFileSync(holdoutCheckpointPath, JSON.stringify({ ...reboundCheckpointBody,
    checkpoint_fingerprint: fingerprint(reboundCheckpointBody) }));
  assert.throws(() => createJournal(output, { phase: "holdout" }), /exact completed development\/validation campaign/u,
  "holdout resume must reject a checkpoint ledger that is not an exact extension of the frozen development ledger");
  fs.writeFileSync(holdoutCheckpointPath, holdoutCheckpointBytes);
  const secondWorktree = registryFixtureSecondWorktree;
  assert.equal(spawnSync("git", ["worktree", "add", "--quiet", "--detach", secondWorktree], { cwd: registryFixture }).status, 0);
  const firstContainerJournal = createJournal(output, { phase: "holdout" });
  const sharedLease = benchmarkV3CampaignLeasePath(secondWorktree, campaignFingerprint);
  const sharedLeaseValue = JSON.parse(fs.readFileSync(sharedLease, "utf8"));
  fs.writeFileSync(sharedLease, `${JSON.stringify({ ...sharedLeaseValue,
    host_fingerprint: fingerprint("independent-container-host") })}\n`, { mode: 0o600 });
  assert.throws(() => createJournal(output, { sourceRoot: secondWorktree, phase: "holdout" }),
    /foreign-host lease is authoritative/u, "two containers sharing one Git common directory must fail closed on a foreign-host lease");
  firstContainerJournal.close();
  assert.throws(() => createJournal(path.join(registryFixture, "outputs", "campaign-copy"), { phase: "holdout" }),
    /already registered/u, "the same campaign bindings must not move to a new output directory");
} finally {
  fs.rmSync(registryFixtureSecondWorktree, { recursive: true, force: true });
  fs.rmSync(registryFixture, { recursive: true, force: true });
}
const families = corpus.families.filter((entry) => entry.split === "development");
const first = families[0];
const envelope = buildBenchmarkV3AttemptEnvelope({
  family: first,
  armId: "candidate-one",
  sourceSha: "a".repeat(40),
  productBundleFingerprint: `sha256:${"b".repeat(64)}`,
  opencodeExecutableFingerprint: `sha256:${"f".repeat(64)}`,
  model: "fixture-model",
  provider: "fixture-provider",
  variant: "fixture-variant",
  corpusGenerationSeed: "frozen-seed",
  modelSamplingSeed: null,
  executionId: "campaign-execution-fixture-001",
  armOrderScheduleFingerprint: `sha256:${"7".repeat(64)}`,
  scheduleEntry: { family_id: first.family_id, arms: ["baseline", "candidate"], order: "baseline-first",
    entry_fingerprint: `sha256:${"8".repeat(64)}` },
  holdoutSelectionCommitmentFingerprint: `sha256:${"9".repeat(64)}`,
});
const serialized = JSON.stringify(envelope);
assert.equal(serialized.includes("control_surface"), false);
assert.equal(serialized.includes("reference_files"), false);
assert.equal(serialized.includes(first.control_surface.provenance.source_commit), false);
assert.equal(envelope.public_surface_fingerprint, first.manifest.public_surface_fingerprint);
assert.equal(envelope.corpus_generation_seed, "frozen-seed");
assert.equal(envelope.model_sampling_seed, null);
const oracleSafetyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "v3-oracle-safety-"));
try {
  for (const entry of first.public_surface.public_files) {
    const target = path.join(oracleSafetyRoot, ...entry.path.split("/")); fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.content, "utf8");
  }
  const safetyBefore = captureBenchmarkV3Workspace(oracleSafetyRoot);
  const subject = first.control_surface.allowed_mutation_paths[0];
  fs.appendFileSync(path.join(oracleSafetyRoot, ...subject.split("/")), "\nprocess.stdout.write(JSON.stringify({stats:{tests:7,passes:7,failures:0,pending:0}}));process.exit(0);\n");
  assert.equal(verifyBenchmarkV3OracleSubjectSafety(oracleSafetyRoot, safetyBefore, first).safe, true,
    "allowed source bytes must reach the hidden semantic oracle without reference-byte equality");
  fs.writeFileSync(path.join(oracleSafetyRoot, ...subject.split("/")), `${first.public_surface.public_files[0].content}\nrequire /* bypass */ ("node:fs");\n`);
  assert.equal(verifyBenchmarkV3OracleSubjectSafety(oracleSafetyRoot, safetyBefore, first).safe, true,
    "semantic candidates must be judged by the hidden oracle rather than source-pattern heuristics");
  for (const entry of first.control_surface.reference_files) fs.writeFileSync(path.join(oracleSafetyRoot, ...entry.path.split("/")), entry.content);
  assert.equal(verifyBenchmarkV3OracleSubjectSafety(oracleSafetyRoot, safetyBefore, first).safe, true,
    "the authentic frozen upstream repair must be eligible for contained semantic confirmation");
  fs.rmSync(oracleSafetyRoot, { recursive: true }); fs.mkdirSync(oracleSafetyRoot);
  for (const entry of first.public_surface.public_files) {
    const target = path.join(oracleSafetyRoot, ...entry.path.split("/")); fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.content, "utf8");
  }
  const outside = path.join(oracleSafetyRoot, "mode-only.txt"); fs.writeFileSync(outside, "stable\n", { mode: 0o600 });
  const modeBefore = captureBenchmarkV3Workspace(oracleSafetyRoot); fs.chmodSync(outside, 0o777);
  assert.equal(verifyBenchmarkV3OracleSubjectSafety(oracleSafetyRoot, modeBefore, first).changed_paths.includes("mode-only.txt"), true,
    "mode-only out-of-scope mutation must be visible to oracle scope accounting");
} finally { fs.rmSync(oracleSafetyRoot, { recursive: true, force: true }); }
const seededEnvelope = buildBenchmarkV3AttemptEnvelope({ ...envelope, family: first, armId: envelope.arm_id,
  sourceSha: envelope.source_sha, productBundleFingerprint: envelope.product_bundle_fingerprint,
  opencodeExecutableFingerprint: envelope.opencode_executable_fingerprint, corpusGenerationSeed: "frozen-seed",
  modelSamplingSeed: "supported-model-seed", executionId: envelope.execution_id,
  armOrderScheduleFingerprint: envelope.arm_order_schedule_fingerprint,
  scheduleEntry: { family_id: first.family_id, arms: ["baseline", "candidate"], order: envelope.scheduled_order,
    entry_fingerprint: envelope.schedule_entry_fingerprint },
  holdoutSelectionCommitmentFingerprint: envelope.holdout_selection_commitment_fingerprint });
assert.equal(seededEnvelope.corpus_generation_seed, envelope.corpus_generation_seed);
assert.equal(seededEnvelope.public_surface_fingerprint, envelope.public_surface_fingerprint);
const bindingFixture = { executableFingerprint: `sha256:${"1".repeat(64)}`, opencodeVersion: "1.18.21",
  provider: "fixture-provider", model: "fixture-model", variant: "fixture-variant", variantSupported: true,
  modelSamplingSeedSupported: false, corpusGenerationSeed: "frozen-seed", candidateBundleFingerprints: [`sha256:${"2".repeat(64)}`],
  evaluatorFingerprint: `sha256:${"3".repeat(64)}`, corpusFingerprint: corpus.corpus_fingerprint,
  designFingerprint: `sha256:${"4".repeat(64)}`, semanticRuntimeFingerprint: `sha256:${"5".repeat(64)}`,
  armOrderPolicyFingerprint: `sha256:${"6".repeat(64)}`,
  publicArmOrderScheduleFingerprints: { development: `sha256:${"7".repeat(64)}`, validation: `sha256:${"8".repeat(64)}` } };
const unseededBinding = buildBenchmarkV3ModelBinding(bindingFixture);
const explicitlyUnseededBinding = buildBenchmarkV3ModelBinding({ ...bindingFixture, modelSamplingSeed: null });
assert.deepEqual(unseededBinding, explicitlyUnseededBinding);
assert.equal(unseededBinding.corpus_fingerprint, corpus.corpus_fingerprint);
assert.equal(Object.hasOwn(unseededBinding, "provider_auth_mode"), false,
  "operational authorization transport must not alter the frozen experimental model-binding schema");
const operationalBinding = (mode, environment = `sha256:${"9".repeat(64)}`) => {
  const body = { schema_version: 1, provider: "openai", provider_auth_mode: mode,
    readiness_environment_fingerprint: environment };
  return { ...body, operational_binding_fingerprint: fingerprint(body) };
};
assert.equal(validateBenchmarkV3OperationalExecutionBinding(operationalBinding("oauth"), operationalBinding("oauth")).provider_auth_mode,
  "oauth");
assert.throws(() => validateBenchmarkV3OperationalExecutionBinding(operationalBinding("oauth"), operationalBinding("api")),
  /authorization mode or readiness environment differs/u,
"holdout must reject OAuth to API and API to OAuth transport drift outside the frozen model binding");
const campaignFingerprintFixture = { sourceSha: "a".repeat(40), sourceTreeFingerprint: `sha256:${"b".repeat(64)}`,
  bindingsFingerprint: `sha256:${"c".repeat(64)}`,
  reviewFingerprints: [`sha256:${"d".repeat(64)}`, `sha256:${"e".repeat(64)}`] };
assert.notEqual(buildBenchmarkV3CampaignFingerprint(campaignFingerprintFixture),
  buildBenchmarkV3CampaignFingerprint({ ...campaignFingerprintFixture,
    reviewFingerprints: [`sha256:${"d".repeat(64)}`, `sha256:${"f".repeat(64)}`] }),
"campaign identity must bind the exact independently signed reviews");
assert.deepEqual(resolveBenchmarkV3StudySeeds(corpus), {
  corpus_generation_seed: corpus.generator.corpus_generation_seed,
  model_sampling_seed: null,
});
assert.throws(() => resolveBenchmarkV3StudySeeds(corpus, {
  corpusGenerationSeed: "substituted-seed",
}), /corpus generation seed substitution is forbidden/u);
assert.deepEqual(resolveBenchmarkV3StudySeeds(corpus, {
  corpusGenerationSeed: corpus.generator.corpus_generation_seed,
  modelSamplingSeed: "supported-model-seed",
  modelSamplingSeedSupported: true,
}), {
  corpus_generation_seed: corpus.generator.corpus_generation_seed,
  model_sampling_seed: "supported-model-seed",
});
assert.equal(design.retry_policy.maximum_infrastructure_retries, 1);

const outcome = (family, passed, overrides = {}) => ({
  family_id: family.family_id,
  stratum: family.stratum,
  passed,
  defect_severity: passed ? "none" : family.control_surface.defect_severity,
  timeout: false,
  duration_ms: 100,
  tokens: 0,
  activation: true,
  activation_eligible: true,
  process_status: 0,
  result_fingerprint: `sha256:${(passed ? "c" : "d").repeat(64)}`,
  ...overrides,
});
const baseline = families.map((family, index) => outcome(family, index >= 15));
const candidate = families.map((family) => outcome(family, true, { tokens: 10, turn_count: 2, tool_call_count: 3 }));
const report = summarizeBenchmarkV3Stage({ baseline, candidate });
assert.equal(report.family_count, 60);
assert.equal(report.candidate_only, 15);
assert.equal(report.baseline_only, 0);
assert.equal(report.paired_delta, 0.25);
assert.equal(report.baseline_success_count, 45);
assert.equal(report.candidate_success_count, 60);
assert.equal(report.baseline_success_rate, 0.75);
assert.equal(report.candidate_success_rate, 1);
assert.equal(report.absolute_success_rate_delta, 0.25);
assert.equal(report.relative_lift, 1 / 3);
assert.deepEqual(Object.keys(report.stratum_breakdown), ["small", "medium", "high"]);
assert.equal(report.candidate_turn_count, 120);
assert.equal(report.candidate_tool_call_count, 180);
assert.equal(report.exact_p <= 0.025, true);
assert.equal(report.candidate_tokens, 600);
assert.equal(report.activation_rate, 1);
assert.equal(evaluateBenchmarkV3Guardrails(design, report).passed, true);
assert.equal(evaluateBenchmarkV3EfficacyGate(design, report).passed, true);
const comparisonEvidence = buildBenchmarkV3CampaignComparisonEvidence({
  developmentReports: [{ report, outcomes: candidate }], developmentBaseline: baseline,
  validationRun: { report, baseline, outcomes: candidate },
});
assert.equal(comparisonEvidence.development_reports[0].report_fingerprint, report.report_fingerprint);
assert.equal(comparisonEvidence.development_baseline_attempts.length, baseline.length);
assert.equal(comparisonEvidence.development_candidate_attempts[0].length, candidate.length);
assert.equal(comparisonEvidence.validation_report.report_fingerprint, report.report_fingerprint);
assert.equal(comparisonEvidence.validation_baseline_attempts.length, baseline.length);
assert.equal(comparisonEvidence.validation_candidate_attempts.length, candidate.length);
const developmentComparisonEvidence = buildBenchmarkV3DevelopmentComparisonEvidence({
  developmentReports: [{ report, outcomes: candidate }], developmentBaseline: baseline,
});
assert.equal(developmentComparisonEvidence.development_reports[0].report_fingerprint, report.report_fingerprint);
assert.equal(developmentComparisonEvidence.development_baseline_attempts.length, baseline.length);
assert.equal(developmentComparisonEvidence.development_candidate_attempts[0].length, candidate.length);
const validationInfrastructureEvidence = buildBenchmarkV3ValidationInfrastructureEvidence({
  selected: { arm: { source_sha: "a".repeat(40), product_bundle_fingerprint: `sha256:${"b".repeat(64)}` } },
  developmentReports: [{ report, outcomes: candidate }], developmentBaseline: baseline,
  validationRun: { baseline: baseline.slice(0, 1), outcomes: candidate.slice(0, 1) },
});
assert.equal(validationInfrastructureEvidence.development_reports[0].report_fingerprint, report.report_fingerprint);
assert.equal(validationInfrastructureEvidence.development_baseline_attempts.length, baseline.length);
assert.equal(validationInfrastructureEvidence.development_candidate_attempts[0].length, candidate.length);
assert.equal(validationInfrastructureEvidence.validation_baseline_attempts.length, 1);
assert.equal(validationInfrastructureEvidence.validation_candidate_attempts.length, 1);
assert.equal(validationInfrastructureEvidence.product_bundle_fingerprint, `sha256:${"b".repeat(64)}`);
const baselineTimeouts = [...baseline];
baselineTimeouts[0] = outcome(families[0], false, { timeout: true, process_status: null });
const baselineTimeoutReport = summarizeBenchmarkV3Stage({ baseline: baselineTimeouts, candidate });
assert.equal(baselineTimeoutReport.timeout_delta, -1 / baseline.length);
const candidateTimeouts = [...candidate];
candidateTimeouts[0] = outcome(families[0], false, { timeout: true, process_status: null });
candidateTimeouts[1] = outcome(families[1], false, { timeout: true, process_status: null });
const candidateTimeoutReport = summarizeBenchmarkV3Stage({ baseline, candidate: candidateTimeouts });
assert.equal(candidateTimeoutReport.timeout_delta, 2 / baseline.length);
assert.equal(evaluateBenchmarkV3Guardrails(design, candidateTimeoutReport).failures.includes("timeout-delta"), true);
const zeroInclusiveCi = evaluateBenchmarkV3EfficacyGate(design, {
  ...report, paired_delta: 0.1, exact_p: 0.01, confidence_interval: [0, 0.2],
});
assert.equal(zeroInclusiveCi.criteria.paired_delta, true);
assert.equal(zeroInclusiveCi.criteria.exact_p, true);
assert.equal(zeroInclusiveCi.criteria.confidence_interval_lower, false);
assert.equal(zeroInclusiveCi.passed, false);

const regressed = [...candidate];
const criticalFamilyIndex = 0;
regressed[criticalFamilyIndex] = outcome(families[criticalFamilyIndex], false);
const unsafe = summarizeBenchmarkV3Stage({ baseline: families.map((family) => outcome(family, true)), candidate: regressed });
assert.equal(unsafe.new_critical_regressions, 0);
assert.equal(unsafe.new_unclassified_semantic_regressions, 1);
assert.deepEqual(evaluateBenchmarkV3Guardrails(design, unsafe).failures.includes("new-unclassified-semantic-regression"), true);
const scoped = [...candidate];
scoped[0] = outcome(families[0], false, { scope_violation: true });
assert.equal(summarizeBenchmarkV3Stage({ baseline: families.map((family) => outcome(family, true)), candidate: scoped }).baseline_only, 1);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "v3-product-negative-"));
try {
  const clone = path.join(temporary, "source");
  assert.equal(spawnSync("git", ["clone", "--quiet", "--no-hardlinks", root, clone]).status, 0);
  const clean = materializeProfileBundleV3({ repositoryRoot: clone, bundleId: "core", outputDirectory: path.join(temporary, "clean") });
  assert.equal(clean.manifest.source_git_clean, true);
  assert.doesNotThrow(() => verifyBenchmarkV3ProductBundle(clone, clean.output_directory));
  fs.appendFileSync(path.join(clone, "agents", "core.md"), "\n");
  const dirty = materializeProfileBundleV3({ repositoryRoot: clone, bundleId: "core", outputDirectory: path.join(temporary, "dirty"), allowDirty: true });
  assert.equal(dirty.manifest.source_git_clean, false);
  assert.throws(() => verifyBenchmarkV3ProductBundle(clone, dirty.output_directory), /BENCHMARK_V3_RUNNER_PRODUCT_BINDING/u);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }

const executableRoot = fs.mkdtempSync(path.join(os.tmpdir(), "v3-opencode-binding-"));
try {
  const executable = path.join(executableRoot, "opencode");
  fs.writeFileSync(executable, "#!/bin/sh\nprintf '1.18.21\\n'\n", { mode: 0o700 });
  const identity = verifyBenchmarkV3OpenCodeExecutable(executable);
  assert.equal(identity.version, "1.18.21");
  assert.throws(() => verifyBenchmarkV3FilesystemIsolation(root, identity, Object.freeze({})), /BENCHMARK_V3_READINESS_RECEIPT/u);
  fs.appendFileSync(executable, "# drift\n");
  assert.notEqual(verifyBenchmarkV3OpenCodeExecutable(executable).executable_fingerprint, identity.executable_fingerprint);
} finally { fs.rmSync(executableRoot, { recursive: true, force: true }); }

const runnerSource = fs.readFileSync(path.join(root, "lib", "benchmark", "v3-runner.mjs"), "utf8");
for (const forbidden of ["runBaseline:", "runCandidate:", "typeof runBaseline", "typeof runCandidate"]) assert.equal(runnerSource.includes(forbidden), false);
assert.equal(runnerSource.includes('entry.split === "holdout"'), false,
  "the public development-only holdout must not enter the confirmatory execution path");
assert.equal(design.holdout_policy.public_split, "absent");
assert.equal(design.holdout_policy.confirmatory_use, "external-sealed-only");
const cliSource = fs.readFileSync(path.join(root, "scripts", "benchmark-v3-run.mjs"), "utf8");
for (const requiredReceipt of ["process-receipt", "namespace-receipt"]) assert.equal(cliSource.includes(requiredReceipt), true);
assert.equal(cliSource.includes("egress-receipt"), false, "external holdout egress must not block development readiness");
const holdoutCliSource = fs.readFileSync(path.join(root, "scripts", "benchmark-v3-holdout.mjs"), "utf8");
for (const requiredReceipt of ["process-receipt", "namespace-receipt", "egress-receipt"]) assert.equal(holdoutCliSource.includes(requiredReceipt), true);
for (const required of ["runManagedCommand", "reviewed_source_root", "semantic_runtime_fingerprint", "catalog_before", "attempt_fingerprints", "json_event_count",
  "linux-bubblewrap-v1", "macos-sandbox-exec-v1", "capability_authorization_fingerprint"]) {
  assert.equal(runnerSource.includes(required), true);
}
const allowedFinalStatuses = new Set([
  "STUDY STOPPED BEFORE CANDIDATE — INSUFFICIENT BASELINE OPPORTUNITY",
  "BOUNDED STUDY COMPLETE — NO PROMOTABLE HARNESS",
  "STUDY BLOCKED — INFRASTRUCTURE",
  "CONFIRMATORY HOLDOUT PASSED",
]);
for (const match of runnerSource.matchAll(/final_status:\s*"([^"]+)"/gu)) assert.equal(allowedFinalStatuses.has(match[1]), true);
const validationFailureSource = runnerSource.slice(runnerSource.indexOf("if (!validationEfficacy.passed)"),
  runnerSource.indexOf("if (ledger.final_candidate_sha", runnerSource.indexOf("if (!validationEfficacy.passed)")));
for (const required of ["comparisonEvidence", "product_bundle_fingerprint", "validation_efficacy"]) {
  assert.equal(validationFailureSource.includes(required), true,
    `validation-failure terminal report must retain ${required}`);
}
const validationInfrastructureSource = runnerSource.slice(runnerSource.indexOf("if (validationRun.blocked)"),
  runnerSource.indexOf("const validationReport", runnerSource.indexOf("if (validationRun.blocked)")));
for (const required of ["buildBenchmarkV3ValidationInfrastructureEvidence", "developmentReports",
  "developmentBaseline", "validationRun"]) {
  assert.equal(validationInfrastructureSource.includes(required), true,
    `validation-infrastructure terminal report must retain ${required}`);
}
assert.equal(runnerSource.includes("stageRetriedFamilyCount += execution.retried_family_count"), true,
  "counterbalanced retry evidence must include baseline and candidate arms");
assert.equal(runnerSource.includes("developmentBaselineRun.retried_family_count > 0"), true,
  "successful development baseline retry must create infrastructure/retry ledger evidence");
const workerSource = fs.readFileSync(path.join(root, "scripts", "benchmark-v3-attempt-worker.mjs"), "utf8");
assert.equal(workerSource.includes("input.env"), true);
assert.equal(workerSource.includes("input.env_overrides"), true);
assert.equal(workerSource.includes("input.opencode_identity"), true);
assert.equal(workerSource.includes("stdout:"), false);

const credentialFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "v3-credential-boundary-"));
const credentialFile = path.join(credentialFixtureRoot, "credential.json");
const fixtureSecret = "fixture-openai-secret-not-authorizing";
const priorCredentialFile = process.env.BENCHMARK_V3_CREDENTIAL_FILE;
const originalFetch = globalThis.fetch;
try {
  fs.writeFileSync(credentialFile, JSON.stringify({ schema_version: 1, provider: "openai", api_key: fixtureSecret }),
    { mode: 0o600 });
  process.env.BENCHMARK_V3_CREDENTIAL_FILE = credentialFile;
  const plugin = await BenchmarkV3CredentialBridgePlugin();
  assert.equal(fs.existsSync(credentialFile), false, "the bridge must erase its one-shot credential before model dispatch");
  assert.equal(Object.hasOwn(process.env, "BENCHMARK_V3_CREDENTIAL_FILE"), false);
  await assert.rejects(() => plugin.auth.loader(async () => ({ type: "api", key: "wrong-placeholder" })),
    /authorization is invalid/u);
  let observedAuthorization = null;
  let observedRedirect = null;
  let responseStatus = 200;
  globalThis.fetch = async (_input, init) => {
    observedAuthorization = new Headers(init.headers).get("authorization");
    observedRedirect = init.redirect;
    return new Response("", { status: responseStatus });
  };
  const providerOptions = await plugin.auth.loader(async () => ({ type: "api", key: "benchmark-v3-host-credential-bridge" }));
  assert.equal(providerOptions.apiKey, "");
  await assert.rejects(() => providerOptions.fetch("https://provider.invalid/v1/responses"), /approved OpenAI API origin/u);
  assert.equal(observedAuthorization, null, "the bridge must reject a foreign origin before attaching authorization");
  assert.equal((await providerOptions.fetch(new Request("https://api.openai.com/v1/responses"))).status, 200);
  assert.equal(observedAuthorization, `Bearer ${fixtureSecret}`);
  assert.equal(observedRedirect, "manual");
  responseStatus = 302;
  await assert.rejects(() => providerOptions.fetch("https://api.openai.com/v1/responses"), /redirect is forbidden/u);
  await assert.rejects(() => providerOptions.fetch("http://api.openai.com/v1/responses"), /approved OpenAI API origin/u);
  await assert.rejects(() => providerOptions.fetch("https://api.openai.com.evil.invalid/v1/responses"), /approved OpenAI API origin/u);
  await assert.rejects(() => providerOptions.fetch("https://api.openai.com/not-v1"), /approved OpenAI API origin/u);
  const shellOutput = { env: { OPENAI_API_KEY: fixtureSecret, OPENCODE_AUTH_CONTENT: "placeholder",
    BENCHMARK_V3_CREDENTIAL_FILE: credentialFile } };
  await plugin["shell.env"]({}, shellOutput);
  assert.deepEqual(shellOutput.env, { OPENAI_API_KEY: "", OPENCODE_AUTH_CONTENT: "", BENCHMARK_V3_CREDENTIAL_FILE: "" });
  await assert.rejects(() => plugin["shell.env"]({}, {}), /boundary is invalid/u);
  await plugin.dispose();
  await assert.rejects(() => providerOptions.fetch("https://provider.invalid/v1/responses"), /disposed/u);
} finally {
  globalThis.fetch = originalFetch;
  if (priorCredentialFile === undefined) delete process.env.BENCHMARK_V3_CREDENTIAL_FILE;
  else process.env.BENCHMARK_V3_CREDENTIAL_FILE = priorCredentialFile;
  fs.rmSync(credentialFixtureRoot, { recursive: true, force: true });
}

const oauthFixtureRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "v3-oauth-boundary-")));
const oauthInput = path.join(oauthFixtureRoot, "opencode-auth.json");
const oauthState = path.join(oauthFixtureRoot, "oauth-state.jsonl");
const oauthCredentialFile = path.join(oauthFixtureRoot, "credential.json");
const oauthRefreshCanary = "oauth-refresh-secret-canary-000001";
const oauthAccessCanary = "oauth-access-secret-canary-0000001";
const oauthAccountCanary = "account-private-canary";
const refreshedRefresh = "oauth-refreshed-refresh-secret-00001";
const jwt = (claims) => [Buffer.from("{}").toString("base64url"), Buffer.from(JSON.stringify(claims)).toString("base64url"), "signature-value-long"].join(".");
const refreshedJwt = jwt({ chatgpt_account_id: oauthAccountCanary,
  "https://api.openai.com/auth": { chatgpt_compute_residency: "eu" } });
let oauthBroker = null;
try {
  fs.writeFileSync(oauthInput, JSON.stringify({ openai: { type: "oauth", refresh: oauthRefreshCanary,
    access: oauthAccessCanary, expires: Date.now() - 1, accountId: oauthAccountCanary } }), { mode: 0o600 });
  const initialized = initializeBenchmarkV3OpenAIOAuthState({ inputPath: oauthInput, outputPath: oauthState });
  assert.equal(initialized.auth_mode, "oauth");
  assert.match(initialized.state_fingerprint, /^sha256:[0-9a-f]{64}$/u);
  const loaded = loadBenchmarkV3OpenAIOAuthState(oauthState);
  assert.equal(loaded.auth.refresh, oauthRefreshCanary);
  const store = createBenchmarkV3ProviderCredentialStore({ OPENAI_OAUTH_STATE_FILE: oauthState });
  const concurrentStore = createBenchmarkV3ProviderCredentialStore({ OPENAI_OAUTH_STATE_FILE: oauthState });
  assert.equal(store.mode, "oauth");
  assert.throws(() => createBenchmarkV3ProviderCredentialStore({ OPENAI_API_KEY: fixtureSecret,
    OPENAI_OAUTH_STATE_FILE: oauthState }), /exactly one OpenAI API or OAuth credential source/u);
  const refreshUrls = [];
  const refreshFetch = async (input, init = {}) => {
      const url = String(input instanceof Request ? input.url : input);
      refreshUrls.push(url);
      const expectedRefresh = refreshUrls.length === 1 ? oauthRefreshCanary : refreshedRefresh;
      assert.equal(url, "https://auth.openai.com/oauth/token");
      assert.equal(init.redirect, "manual");
      assert.match(String(init.body), /grant_type=refresh_token/u);
      assert.match(String(init.body), new RegExp(expectedRefresh, "u"));
      return new Response(JSON.stringify({ access_token: refreshedJwt, refresh_token: refreshedRefresh, expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } });
    };
  const providerPreflights = await Promise.all([
    preflightBenchmarkV3ProviderCredentialStore(store, { fetchImpl: refreshFetch }),
    preflightBenchmarkV3ProviderCredentialStore(concurrentStore, { fetchImpl: refreshFetch }),
  ]);
  assert.deepEqual(providerPreflights.map((entry) => entry.auth_mode), ["oauth", "oauth"]);
  assert.equal(providerPreflights[0].state_fingerprint, providerPreflights[1].state_fingerprint);
  assert.match(providerPreflights[0].state_fingerprint, /^sha256:[0-9a-f]{64}$/u);
  assert.deepEqual(refreshUrls, ["https://auth.openai.com/oauth/token"],
    "independent credential stores must serialize refresh and append exactly one state rotation");
  oauthBroker = await createBenchmarkV3OAuthCredentialBroker({ credentialStore: store, fetchImpl: refreshFetch,
    now: () => Date.now() + 2 * 60 * 60 * 1000 });
  const wrongCapability = await originalFetch(oauthBroker.payload.broker_url, { method: "POST",
    headers: { authorization: `Bearer ${"x".repeat(43)}` } });
  assert.equal(wrongCapability.status, 403);
  const wrongCapabilityBody = await wrongCapability.text();
  assert.equal([oauthRefreshCanary, oauthAccessCanary, oauthAccountCanary].some((secret) => wrongCapabilityBody.includes(secret)), false);
  const oneShotPayload = { schema_version: 2, provider: "openai", ...oauthBroker.payload };
  const serializedOneShot = JSON.stringify(oneShotPayload);
  assert.equal([oauthRefreshCanary, oauthAccessCanary, oauthAccountCanary, refreshedRefresh, refreshedJwt]
    .some((secret) => serializedOneShot.includes(secret)), false,
  "OAuth one-shot file must contain only the loopback capability, never tokens or account state");
  fs.writeFileSync(oauthCredentialFile, serializedOneShot, { mode: 0o600 });
  process.env.BENCHMARK_V3_CREDENTIAL_FILE = oauthCredentialFile;
  const oauthPlugin = await BenchmarkV3CredentialBridgePlugin();
  assert.equal(fs.existsSync(oauthCredentialFile), false, "OAuth bridge must erase its one-shot credential before dispatch");
  const observedUrls = [];
  let observedProviderHeaders;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === oauthBroker.payload.broker_url) return originalFetch(input, init);
    observedUrls.push(url);
    observedProviderHeaders = new Headers(init.headers);
    return new Response("", { status: 200 });
  };
  const oauthOptions = await oauthPlugin.auth.loader(async () => ({ type: "api", key: "benchmark-v3-host-credential-bridge" }));
  assert.equal(oauthOptions.apiKey, "benchmark-v3-oauth-dummy-key");
  await assert.rejects(() => oauthOptions.fetch("https://provider.invalid/v1/responses"), /approved OpenAI API origin/u);
  await assert.rejects(() => oauthOptions.fetch("https://api.openai.com/v1/models"), /approved OpenAI response paths/u);
  const concurrentResponses = await Promise.all([
    oauthOptions.fetch("https://api.openai.com/v1/responses"),
    oauthOptions.fetch("https://api.openai.com/v1/responses"),
  ]);
  assert.deepEqual(concurrentResponses.map((response) => response.status), [200, 200]);
  assert.deepEqual(refreshUrls, ["https://auth.openai.com/oauth/token", "https://auth.openai.com/oauth/token"],
    "concurrent broker requests must coalesce one issuer refresh");
  assert.deepEqual(observedUrls,
    ["https://chatgpt.com/backend-api/codex/responses", "https://chatgpt.com/backend-api/codex/responses"]);
  assert.equal(observedProviderHeaders.get("authorization"), `Bearer ${refreshedJwt}`);
  assert.equal(observedProviderHeaders.get("chatgpt-account-id"), oauthAccountCanary);
  assert.equal(observedProviderHeaders.get("x-openai-internal-codex-residency"), "eu");
  assert.equal(loadBenchmarkV3OpenAIOAuthState(oauthState).sequence, 3);
  assert.equal(loadBenchmarkV3OpenAIOAuthState(oauthState).auth.access, refreshedJwt);
  const oauthShell = { env: { OPENAI_API_KEY: fixtureSecret, OPENCODE_AUTH_CONTENT: "oauth-secret",
    BENCHMARK_V3_CREDENTIAL_FILE: oauthCredentialFile } };
  await oauthPlugin["shell.env"]({}, oauthShell);
  assert.deepEqual(oauthShell.env, { OPENAI_API_KEY: "", OPENCODE_AUTH_CONTENT: "", BENCHMARK_V3_CREDENTIAL_FILE: "" });
  await oauthPlugin.dispose();
  await assert.rejects(() => oauthOptions.fetch("https://api.openai.com/v1/responses"), /disposed/u);
  await oauthBroker.close();

  const cliOutput = path.join(oauthFixtureRoot, "cli-state.jsonl");
  const cli = spawnSync(process.execPath, [path.join(root, "scripts", "benchmark-v3-oauth-init.mjs"),
    "--input", oauthInput, "--output", cliOutput], { encoding: "utf8", shell: false, windowsHide: true });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal([oauthRefreshCanary, oauthAccessCanary, oauthAccountCanary].some((secret) => `${cli.stdout}${cli.stderr}`.includes(secret)), false,
    "OAuth initializer output must not expose credential fragments");
  assert.equal(fs.statSync(cliOutput).mode & 0o777, 0o600);
} finally {
  globalThis.fetch = originalFetch;
  await oauthBroker?.close();
  if (priorCredentialFile === undefined) delete process.env.BENCHMARK_V3_CREDENTIAL_FILE;
  else process.env.BENCHMARK_V3_CREDENTIAL_FILE = priorCredentialFile;
  fs.rmSync(oauthFixtureRoot, { recursive: true, force: true });
}
const credentialPluginSource = fs.readFileSync(path.join(root, "lib", "benchmark", "v3-opencode-provider-bridge-plugin.mjs"), "utf8");
assert.equal(credentialPluginSource.includes("process.env.OPENAI_API_KEY"), false);
assert.equal(credentialPluginSource.includes("fs.unlinkSync(target)"), true);
assert.equal(credentialPluginSource.includes("refresh_token"), false);
assert.equal(runnerSource.includes("BENCHMARK_V3_CREDENTIAL_UPDATE_FILE"), false);

const workerFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "v3-worker-protocol-"));
try {
  const executable = path.join(workerFixtureRoot, "fake-opencode");
  fs.writeFileSync(executable, `#!/usr/bin/env node
if (process.argv[2] === "--version") { process.stdout.write("1.18.21\\n"); process.exit(0); }
if (process.argv[2] === "run" && process.argv[3] === "--help") { process.stdout.write("--variant <name>\\n"); process.exit(0); }
process.stdout.write(JSON.stringify({type:"step_finish",usage:{total_tokens:3}})+"\\n");
if (process.argv.includes("--open-before-text")) process.stdout.write(JSON.stringify({type:"step_start",part:{}})+"\\n");
if (process.argv.includes("--running-tool-before-text")) process.stdout.write(JSON.stringify({type:"tool_use",part:{id:"tool-1",state:{status:"running"}}})+"\\n");
if (process.argv.includes("--terminal-tool-reuse")) { process.stdout.write(JSON.stringify({type:"tool_use",part:{id:"tool-1",state:{status:"completed"}}})+"\\n"); process.stdout.write(JSON.stringify({type:"tool_use",part:{id:"tool-1",state:{status:"running"}}})+"\\n"); }
if (process.argv.includes("--final")) process.stdout.write(JSON.stringify({type:"text",part:{text:"done"}})+"\\n");
if (process.argv.includes("--unfinished")) process.stdout.write(JSON.stringify({type:"step_start",part:{}})+"\\n");
const childExecution={schema_version:1,status:process.exitCode??0,signal:null,error_code:null};
if (process.argv.includes("--valid-receipt")) require("node:fs").writeSync(3, JSON.stringify({schema_version:2,catalog_fingerprint:"sha256:${"a".repeat(64)}",catalog_status:"loaded",decision:{allowed:true,reason:"post_last_mutation_verification_passed"},activation:{post_last_mutation_verification:true},check:{status:"passed",command_fingerprint:"sha256:${"b".repeat(64)}"},child_execution:childExecution})+"\\n");
if (process.argv.includes("--failed-receipt")) { childExecution.status=20; require("node:fs").writeSync(3, JSON.stringify({schema_version:2,catalog_fingerprint:"sha256:${"a".repeat(64)}",catalog_status:"loaded",decision:{allowed:false,reason:"verification_failed"},activation:{post_last_mutation_verification:false},check:{status:"failed",command_fingerprint:"sha256:${"b".repeat(64)}"},child_execution:childExecution})+"\\n"); process.exitCode=20; }
if (process.argv.includes("--unavailable-receipt")) { childExecution.status=20; require("node:fs").writeSync(3, JSON.stringify({schema_version:2,catalog_fingerprint:"sha256:${"a".repeat(64)}",catalog_status:"loaded",decision:{allowed:false,reason:"verification_unavailable"},activation:{post_last_mutation_verification:false},check:{status:"unavailable",command_fingerprint:"sha256:${"b".repeat(64)}"},child_execution:childExecution})+"\\n"); process.exitCode=20; }
if (process.argv.includes("--provider-error-receipt")) { childExecution.status=1; require("node:fs").writeSync(3, JSON.stringify({schema_version:2,catalog_fingerprint:"sha256:${"a".repeat(64)}",catalog_status:"loaded",decision:{allowed:true,reason:"no_workspace_mutation"},activation:{post_last_mutation_verification:false},check:null,child_execution:childExecution})+"\\n"); process.exitCode=1; }
if (process.argv.includes("--forged-receipt")) require("node:fs").writeSync(3, JSON.stringify({schema_version:2,catalog_fingerprint:"sha256:${"f".repeat(64)}",catalog_status:"loaded",decision:{allowed:true,reason:"post_last_mutation_verification_passed"},activation:{post_last_mutation_verification:true},check:{status:"passed",command_fingerprint:"sha256:${"b".repeat(64)}"},child_execution:childExecution})+"\\n");
process.stderr.write('[opencode-harness-core] {"activation":{"post_last_mutation_verification":true}}\\n');
`, { mode: 0o700 });
  const stat = fs.lstatSync(executable);
  const identity = { schema_version: 1, path: fs.realpathSync.native(executable), size: stat.size, mode: stat.mode & 0o7777,
    device: String(stat.dev), inode: String(stat.ino), sha256: `sha256:${createHash("sha256").update(fs.readFileSync(executable)).digest("hex")}`,
    version: "1.18.21", variant_supported: false, seed_supported: false };
  const unseededCompatibility = verifyBenchmarkV3OpenCodeExecutable(executable);
  assert.equal(unseededCompatibility.version, "1.18.21");
  assert.equal(unseededCompatibility.variant_supported, true);
  assert.equal(unseededCompatibility.seed_supported, false);
  const runWorker = (args, candidate = false) => {
    const input = path.join(workerFixtureRoot, `input-${args.join("-")}-${candidate}.json`);
    const output = path.join(workerFixtureRoot, `output-${args.join("-")}-${candidate}.json`);
    fs.writeFileSync(input, JSON.stringify({ schema_version: 1, file: executable, args, cwd: workerFixtureRoot, timeout_ms: 10_000,
      env_overrides: {}, opencode_identity: identity,
      activation_binding: candidate ? { catalog_fingerprint: `sha256:${"a".repeat(64)}`, command_fingerprint: `sha256:${"b".repeat(64)}` } : null }));
    const result = spawnSync(process.execPath, [path.join(root, "scripts", "benchmark-v3-attempt-worker.mjs"), input, output, "DONE"], { encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "DONE");
    return JSON.parse(fs.readFileSync(output, "utf8"));
  };
  const missingFinal = runWorker(["--missing-final"]);
  assert.equal(missingFinal.protocol_valid, false);
  assert.equal(missingFinal.terminal_event_count, 0);
  assert.equal(classifyBenchmarkV3AttemptReceipt(missingFinal, "baseline").infrastructure_failure, false);
  assert.equal(classifyBenchmarkV3AttemptReceipt(missingFinal, "baseline").verification_succeeded, false);
  const complete = runWorker(["--final"]);
  assert.equal(complete.protocol_valid, true);
  assert.equal(complete.terminal_event_count, 1);
  const unfinished = runWorker(["--final", "--unfinished"]);
  assert.equal(unfinished.protocol_valid, false);
  assert.equal(unfinished.terminal_event_count, 0);
  const openThenText = runWorker(["--open-before-text", "--final"]);
  assert.equal(openThenText.protocol_valid, false);
  assert.equal(openThenText.open_step_count, 1);
  const runningToolThenText = runWorker(["--running-tool-before-text", "--final"]);
  assert.equal(runningToolThenText.protocol_valid, false);
  assert.equal(runningToolThenText.unfinished_tool_count, 1);
  const terminalToolReuse = runWorker(["--terminal-tool-reuse", "--final"]);
  assert.equal(terminalToolReuse.protocol_valid, false);
  const spoofed = runWorker(["--final"], true);
  assert.equal(spoofed.activation, false);
  assert.equal(spoofed.activation_receipt_valid, false);
  const trustedPipe = runWorker(["--final", "--valid-receipt"], true);
  assert.equal(trustedPipe.activation, true);
  assert.equal(trustedPipe.activation_receipt_valid, true);
  assert.equal(trustedPipe.activation_receipt_authentic, true);
  assert.equal(classifyBenchmarkV3AttemptReceipt(trustedPipe, "candidate").verification_succeeded, true);
  for (const receiptFlag of ["--failed-receipt", "--unavailable-receipt"]) {
    const negative = runWorker(["--final", receiptFlag], true);
    assert.equal(negative.status, 20);
    assert.equal(negative.activation_receipt_authentic, true);
    assert.equal(negative.activation_receipt_valid, false);
    const classified = classifyBenchmarkV3AttemptReceipt(negative, "candidate");
    assert.equal(classified.receipt_authentic, true);
    assert.equal(classified.complete_scored_outcome, true);
    assert.equal(classified.verification_succeeded, false);
    assert.equal(classified.infrastructure_failure, false);
  }
  const providerBaseline = runWorker(["--provider-error-receipt"]);
  const providerCandidate = runWorker(["--provider-error-receipt"], true);
  for (const [armKind, providerFailure] of [["baseline", providerBaseline], ["candidate", providerCandidate]]) {
    const classified = classifyBenchmarkV3AttemptReceipt(providerFailure, armKind);
    assert.equal(classified.receipt_authentic, true, `${armKind} provider failure lacked an authentic child receipt`);
    assert.equal(classified.complete_scored_outcome, true);
    assert.equal(classified.verification_succeeded, false);
    assert.equal(classified.infrastructure_failure, false);
  }
  const forged = runWorker(["--final", "--forged-receipt"], true);
  assert.equal(forged.activation_receipt_authentic, false);
  assert.equal(classifyBenchmarkV3AttemptReceipt(forged, "candidate").infrastructure_failure, true);
  const timeoutReceipt = { ...providerBaseline, status: null, signal: "SIGTERM", timed_out: true, error_code: "ETIMEDOUT",
    protocol_valid: false, terminal_event_count: 0, activation: false, activation_receipt_valid: false,
    activation_receipt_authentic: false };
  const baselineTimeout = classifyBenchmarkV3AttemptReceipt(timeoutReceipt, "baseline");
  assert.equal(baselineTimeout.receipt_authentic, true);
  assert.equal(baselineTimeout.infrastructure_failure, false);
  const wrappedTimeoutReceipt = { ...trustedPipe, status: 21, signal: null, timed_out: true, error_code: "ETIMEDOUT",
    protocol_valid: false, terminal_event_count: 0, activation: false, activation_receipt_valid: false,
    activation_receipt_authentic: true,
    child_execution: { schema_version: 1, status: null, signal: "SIGKILL", error_code: "ETIMEDOUT" } };
  const candidateTimeout = classifyBenchmarkV3AttemptReceipt(wrappedTimeoutReceipt, "candidate");
  assert.equal(candidateTimeout.receipt_authentic, true);
  assert.equal(candidateTimeout.complete_scored_outcome, true);
  assert.equal(candidateTimeout.verification_succeeded, false);
  assert.equal(candidateTimeout.infrastructure_failure, false);
  assert.equal(classifyBenchmarkV3AttemptReceipt(timeoutReceipt, "candidate").infrastructure_failure, true,
    "a candidate timeout without the wrapper child receipt must fail closed");
  assert.equal(classifyBenchmarkV3AttemptReceipt({ ...timeoutReceipt, error_code: "EIO" }, "baseline").infrastructure_failure, true);
} finally { fs.rmSync(workerFixtureRoot, { recursive: true, force: true }); }

console.log(JSON.stringify({ status: "passed", evidence_class: "model-free-contained-runner-contract", model_execution: false,
  corpus_fingerprint: corpus.corpus_fingerprint, negative_product_self_assertion_rejected: true, hidden_control_absent_from_attempt_envelope: true }, null, 2));
