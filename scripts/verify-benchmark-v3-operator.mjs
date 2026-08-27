import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPrivateKey, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "../lib/feedback/contracts.mjs";
import { initializeBenchmarkV3OperatorCustody, loadBenchmarkV3OperatorPrivateKey,
  verifyBenchmarkV3OperatorRegistryKeys } from "../lib/benchmark/v3-operator-custody.mjs";
import { commitBenchmarkV3HoldoutSelection, issueBenchmarkV3ExecutionAuthority,
  issueBenchmarkV3ReadinessReceipts, issueBenchmarkV3ReviewReceipt } from "../lib/benchmark/v3-operator-issue.mjs";
import { runBenchmarkV3OperatorProbes } from "../lib/benchmark/v3-operator-probes.mjs";
import { stratifyBenchmarkV3ExternalPool } from "../lib/benchmark/v3-operator-frame.mjs";
import { loadSignedBenchmarkV3ExecutionAuthority } from "../lib/benchmark/v3-execution-authority.mjs";
import { validateBenchmarkV3ReviewReceipt } from "../lib/benchmark/v3-runner.mjs";
import { validateBenchmarkV3ReadinessReceipt } from "../lib/benchmark/v3-readiness.mjs";
import { buildProfileBundleManifest } from "../lib/profile-v3.mjs";
import { loadBenchmarkV3Corpus } from "../lib/benchmark/v3-corpus.mjs";
import { loadBenchmarkV3Design } from "../lib/benchmark/v3-design.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-v3-operator-"));
const run = (file, args, options = {}) => spawnSync(file, args, { encoding: "utf8", shell: false, windowsHide: true, ...options });
try {
  const stratifiedFixture = stratifyBenchmarkV3ExternalPool(Array.from({ length: 93 }, (_, index) => ({
    complexity: index, commit: String(index).padStart(40, "0"),
  })));
  assert.deepEqual(["small", "medium", "high"].map((stratum) => (
    stratifiedFixture.filter((entry) => entry.stratum === stratum).length
  )), [31, 31, 31]);
  const source = path.join(temporary, "source");
  const clone = run("git", ["clone", "--quiet", "--no-hardlinks", root, source]);
  assert.equal(clone.status, 0, clone.stderr);
  fs.copyFileSync(path.join(root, "benchmarks", "v3", "readiness-issuers.v1.json"),
    path.join(source, "benchmarks", "v3", "readiness-issuers.v1.json"));
  const channels = path.join(temporary, "channels");
  const registryRoot = path.join(temporary, "registry");
  const registryPath = path.join(registryRoot, "registry.jsonl");
  const ownerUid = process.getuid();
  const layouts = {
    "readiness-issuers.v1.json": [path.join(channels, "readiness")],
    "review-issuers.v1.json": [path.join(channels, "reviewer-one"), path.join(channels, "reviewer-two")],
    "execution-authority-issuers.v1.json": [path.join(channels, "execution-authority")],
    "holdout-issuers.v1.json": [path.join(channels, "holdout")],
    "lease-takeover-issuers.v1.json": [path.join(channels, "takeover")],
  };
  for (const [file, roots] of Object.entries(layouts)) {
    const target = path.join(source, "benchmarks", "v3", file);
    const value = JSON.parse(fs.readFileSync(target, "utf8"));
    value.issuers.forEach((issuer, index) => { issuer.channel_root = roots[index]; issuer.owner_uid = ownerUid; });
    if (file === "execution-authority-issuers.v1.json") {
      value.issuers[0].registry_root = registryRoot;
      value.issuers[0].registry_path = registryPath;
    }
    fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  }
  assert.equal(run("git", ["add", "benchmarks/v3"], { cwd: source }).status, 0);
  assert.equal(run("git", ["-c", "user.name=Operator Test", "-c", "user.email=operator@example.invalid", "commit", "--quiet", "-m", "test layout"], { cwd: source }).status, 0);
  const custody = path.join(temporary, "custody");
  const initialized = initializeBenchmarkV3OperatorCustody({ sourceRoot: source, custodyRoot: custody, ownerUid, provision: true });
  assert.equal(initialized.roles.length, 6);
  assert.equal(new Set(initialized.roles.map((entry) => entry.spki_fingerprint)).size, 6);
  assert.equal(JSON.stringify(initialized).includes("PRIVATE KEY"), false, "authority:init output must not contain private PEM fragments");
  const existingCustody = initializeBenchmarkV3OperatorCustody({ sourceRoot: source, custodyRoot: custody,
    ownerUid, provision: true, now: "2099-01-01T00:00:00.000Z" });
  assert.equal(existingCustody.status, "verified-existing");
  assert.equal(existingCustody.inventory_fingerprint, initialized.inventory_fingerprint,
    "idempotent custody verification changed the persisted inventory fingerprint");
  for (const [file, value] of Object.entries(initialized.registry_bundle)) {
    fs.writeFileSync(path.join(source, "benchmarks", "v3", file), `${JSON.stringify(value, null, 2)}\n`);
  }
  const fingerprintLedger = {
    schema_version: 1,
    rotated_at: new Date().toISOString(),
    rotation_reason: "isolated model-free operator verification fixture key rotation",
    prior_source_sha: run("git", ["rev-parse", "HEAD"], { cwd: source }).stdout.trim(),
    custody_inventory_fingerprint: initialized.inventory_fingerprint,
    keys: initialized.roles.map((entry) => {
      const spec = {
        readiness: ["readiness-issuers.v1.json", 0],
        "reviewer-one": ["review-issuers.v1.json", 0],
        "reviewer-two": ["review-issuers.v1.json", 1],
        "execution-authority": ["execution-authority-issuers.v1.json", 0],
        "holdout-custodian": ["holdout-issuers.v1.json", 0],
        "lease-takeover-auditor": ["lease-takeover-issuers.v1.json", 0],
      }[entry.role];
      return { role: entry.role, registry: spec[0], issuer_id: entry.issuer_id,
        spki_fingerprint: entry.spki_fingerprint };
    }),
  };
  fs.writeFileSync(path.join(source, "benchmarks", "v3", "operator-key-fingerprints.v1.json"),
    `${JSON.stringify(fingerprintLedger, null, 2)}\n`);
  assert.equal(run("git", ["add", "benchmarks/v3"], { cwd: source }).status, 0);
  assert.equal(run("git", ["-c", "user.name=Operator Test", "-c", "user.email=operator@example.invalid", "commit", "--quiet", "-m", "test keys"], { cwd: source }).status, 0);
  assert.equal(verifyBenchmarkV3OperatorRegistryKeys({ sourceRoot: source, custodyRoot: custody, ownerUid }).length, 6);
  for (const role of initialized.roles.map((entry) => entry.role)) {
    const stat = fs.lstatSync(path.join(custody, "keys", `${role}.private.pem`));
    assert.equal(stat.mode & 0o777, 0o600);
  }
  const weakCustody = path.join(temporary, "weak-custody");
  fs.cpSync(custody, weakCustody, { recursive: true });
  fs.chmodSync(weakCustody, 0o700);
  fs.chmodSync(path.join(weakCustody, "keys"), 0o700);
  const weakKey = path.join(weakCustody, "keys", "readiness.private.pem");
  fs.chmodSync(weakKey, 0o644);
  assert.throws(() => loadBenchmarkV3OperatorPrivateKey({ custodyRoot: weakCustody, role: "readiness", ownerUid }), /owner-only/u);
  fs.chmodSync(weakKey, 0o600);
  fs.copyFileSync(path.join(weakCustody, "keys", "reviewer-two.private.pem"),
    path.join(weakCustody, "keys", "reviewer-one.private.pem"));
  assert.throws(() => verifyBenchmarkV3OperatorRegistryKeys({ sourceRoot: source, custodyRoot: weakCustody, ownerUid }), /does not match/u);

  const output = path.join(temporary, "campaign-output");
  const authorityPath = path.join(channels, "execution-authority", "authority.json");
  const authorityResult = issueBenchmarkV3ExecutionAuthority({ sourceRoot: source, custodyRoot: custody,
    outputDirectory: output, receiptPath: authorityPath, ownerUid });
  assert.notEqual(authorityResult.campaign_execution_id, authorityResult.holdout_execution_id);
  const prepared = buildProfileBundleManifest(source, "lab").manifest;
  const corpus = loadBenchmarkV3Corpus(source);
  const { validation } = loadBenchmarkV3Design(source);
  const executionIssuer = JSON.parse(fs.readFileSync(path.join(source, "benchmarks", "v3", "execution-authority-issuers.v1.json"), "utf8")).issuers[0];
  const authority = loadSignedBenchmarkV3ExecutionAuthority({ sourceRoot: source, receiptPath: authorityPath,
    sourceSha: prepared.source_sha, sourceTreeFingerprint: prepared.source_tree_fingerprint,
    designFingerprint: validation.design_fingerprint, corpusFingerprint: corpus.corpus_fingerprint,
    outputDirectory: output, trustedIssuers: [executionIssuer] });
  const duplicated = { ...authority.receipt, holdout_execution_id: authority.receipt.campaign_execution_id };
  delete duplicated.signature;
  duplicated.signature = sign(null, Buffer.from(canonicalJson(duplicated), "utf8"),
    loadBenchmarkV3OperatorPrivateKey({ custodyRoot: custody, role: "execution-authority", ownerUid })).toString("base64url");
  const duplicatePath = path.join(channels, "execution-authority", "duplicate.json");
  fs.writeFileSync(duplicatePath, JSON.stringify(duplicated), { mode: 0o600 });
  assert.throws(() => loadSignedBenchmarkV3ExecutionAuthority({ sourceRoot: source, receiptPath: duplicatePath,
    sourceSha: prepared.source_sha, sourceTreeFingerprint: prepared.source_tree_fingerprint,
    designFingerprint: validation.design_fingerprint, corpusFingerprint: corpus.corpus_fingerprint,
    outputDirectory: output, trustedIssuers: [executionIssuer] }), /binding|signature|expiry/u);

  const reviewResult = path.join(temporary, "review-result.json");
  fs.writeFileSync(reviewResult, JSON.stringify({ schema_version: 1, read_only: true, source_sha: prepared.source_sha,
    source_tree_fingerprint: prepared.source_tree_fingerprint, high_findings: 0, medium_findings: 0,
    corpus_contract_reviewed: true, contract_coverage_reviewed: true, oracle_leakage_reviewed: true }));
  const reviewIssuers = JSON.parse(fs.readFileSync(path.join(source, "benchmarks", "v3", "review-issuers.v1.json"), "utf8")).issuers;
  const reviewPaths = [path.join(channels, "reviewer-one", "review.json"), path.join(channels, "reviewer-two", "review.json")];
  for (const [index, reviewer] of ["one", "two"].entries()) {
    issueBenchmarkV3ReviewReceipt({ sourceRoot: source, custodyRoot: custody, reviewer,
      resultPath: reviewResult, receiptPath: reviewPaths[index], ownerUid });
    assert.equal(validateBenchmarkV3ReviewReceipt(reviewPaths[index], { sourceSha: prepared.source_sha,
      sourceTreeFingerprint: prepared.source_tree_fingerprint, trustedIssuers: reviewIssuers }).verdict, "passed");
  }
  const forgedReview = JSON.parse(fs.readFileSync(reviewPaths[0], "utf8"));
  forgedReview.medium_findings = 1;
  fs.writeFileSync(reviewPaths[0], JSON.stringify(forgedReview));
  assert.throws(() => validateBenchmarkV3ReviewReceipt(reviewPaths[0], { sourceSha: prepared.source_sha,
    sourceTreeFingerprint: prepared.source_tree_fingerprint, trustedIssuers: reviewIssuers }), /invalid|stale/u);

  const fakeOpenCode = path.join(temporary, "opencode");
  fs.writeFileSync(fakeOpenCode, "#!/bin/sh\nif [ \"${1:-}\" = \"--version\" ]; then echo 1.18.21; else echo '  --variant low'; fi\n");
  fs.chmodSync(fakeOpenCode, 0o500);
  const probeEnvironment = { PATH: "/usr/bin:/bin", OPENCODE_QUALITY_CGROUP_ROOT: path.join(temporary, "cgroup"),
    OPENCODE_QUALITY_CGROUP_ATTACH_MODE: "sudo-helper-v2", OPENCODE_QUALITY_CGROUP_ATTACH_HELPER: path.join(temporary, "helper") };
  const managedPass = async ({ outputMarker }) => ({ teardown_verified: true,
    containment_fingerprint: `sha256:${"a".repeat(64)}`, output_marker_match: { count: 1, fingerprint: outputMarker } });
  const namespacePass = (_file, args) => {
    const bindIndex = args.indexOf("--bind");
    fs.writeFileSync(path.join(args[bindIndex + 1], "written.txt"), "bounded-write\n");
    return { status: 0, signal: null, error: undefined, stdout: "", stderr: "" };
  };
  const probeEvidence = await runBenchmarkV3OperatorProbes({ sourceRoot: source, opencodeExecutable: fakeOpenCode,
    environment: probeEnvironment, managedRunner: managedPass, namespaceRunner: namespacePass,
    platform: "linux", bubblewrapExecutable: "/bin/echo" });
  const processReceipt = path.join(channels, "readiness", "process.json");
  const namespaceReceipt = path.join(channels, "readiness", "namespace.json");
  assert.throws(() => issueBenchmarkV3ReadinessReceipts({ sourceRoot: source, custodyRoot: custody,
    probeEvidence: { ...probeEvidence }, processReceiptPath: processReceipt, namespaceReceiptPath: namespaceReceipt, ownerUid }), /opaque evidence/u);
  issueBenchmarkV3ReadinessReceipts({ sourceRoot: source, custodyRoot: custody, probeEvidence,
    processReceiptPath: processReceipt, namespaceReceiptPath: namespaceReceipt, ownerUid });
  const readinessIssuer = JSON.parse(fs.readFileSync(path.join(source, "benchmarks", "v3", "readiness-issuers.v1.json"), "utf8")).issuers[0];
  assert.equal(validateBenchmarkV3ReadinessReceipt(processReceipt, { capability: "real-process-containment",
    sourceRoot: source, trustedIssuers: [readinessIssuer] }).status, "verified");
  const failedProcessReceipt = path.join(channels, "readiness", "failed-process.json");
  await assert.rejects(runBenchmarkV3OperatorProbes({ sourceRoot: source, opencodeExecutable: fakeOpenCode,
    environment: probeEnvironment, managedRunner: async () => ({ teardown_verified: false }), namespaceRunner: namespacePass,
    platform: "linux", bubblewrapExecutable: "/bin/echo" }), /containment|teardown/u);
  assert.equal(fs.existsSync(failedProcessReceipt), false);
  await assert.rejects(runBenchmarkV3OperatorProbes({ sourceRoot: source, opencodeExecutable: fakeOpenCode,
    environment: probeEnvironment, managedRunner: managedPass,
    namespaceRunner: () => ({ status: 1, signal: null, error: undefined, stdout: "", stderr: "" }),
    platform: "linux", bubblewrapExecutable: "/bin/echo" }), /namespace|boundary|identity/u);

  const frame = ["small", "medium", "high"].flatMap((stratum, stratumIndex) => Array.from({ length: 30 }, (_, index) => ({
    stratum, source_commit: `${stratumIndex + 7}${String(index + 1).padStart(39, "0")}`,
    parent_commit: `${stratumIndex + 4}${String(index + 1).padStart(39, "0")}`,
    source_paths: [`external/${stratum}-${String(index + 1).padStart(2, "0")}.js`],
  })));
  const framePath = path.join(temporary, "sampling-frame.json"); fs.writeFileSync(framePath, JSON.stringify(frame));
  const commitmentDirectory = path.join(channels, "holdout", "commitments", "campaign-one");
  const commitmentResult = commitBenchmarkV3HoldoutSelection({ sourceRoot: source, custodyRoot: custody,
    outputDirectory: output, authorityPath, samplingFramePath: framePath,
    campaignCustodyDirectory: commitmentDirectory, ownerUid });
  assert.equal(commitmentResult.sampling_frame_count, 90);
  assert.throws(() => commitBenchmarkV3HoldoutSelection({ sourceRoot: source, custodyRoot: custody,
    outputDirectory: output, authorityPath, samplingFramePath: framePath,
    campaignCustodyDirectory: commitmentDirectory, ownerUid }), /exist|baseline|registry/u);
  fs.appendFileSync(registryPath, "baseline-reserved\n");
  const secondCommitment = path.join(channels, "holdout", "commitments", "campaign-two");
  assert.throws(() => commitBenchmarkV3HoldoutSelection({ sourceRoot: source, custodyRoot: custody,
    outputDirectory: output, authorityPath, samplingFramePath: framePath,
    campaignCustodyDirectory: secondCommitment, ownerUid }), /precede|registry/u);
  assert.equal(fs.existsSync(secondCommitment), false);

  const tracked = run("git", ["ls-files", "-z"], { cwd: source, encoding: "buffer" });
  assert.equal(tracked.status, 0);
  const trackedPrivateKeys = tracked.stdout.toString("utf8").split("\0").filter(Boolean).filter((file) => {
    try { createPrivateKey(fs.readFileSync(path.join(source, file))); return true; } catch { return false; }
  });
  assert.deepEqual(trackedPrivateKeys, [], "private keys must not appear in Git");
  process.stdout.write(`${JSON.stringify({ schema_version: 1, status: "passed", gate: "benchmark-v3-operator",
    role_key_count: 6, issuer_spki_separation: true, wrong_role_key_rejected: true,
    world_readable_key_rejected: true, forged_review_rejected: true, forged_readiness_rejected: true,
    failed_containment_not_signed: true, failed_namespace_not_signed: true, duplicate_execution_ids_rejected: true,
    commitment_regeneration_rejected: true, private_key_fragments_emitted: false, model_calls: 0, candidate_tokens: 0 }, null, 2)}\n`);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
