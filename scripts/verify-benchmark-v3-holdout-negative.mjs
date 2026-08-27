#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { canonicalJson, fingerprint } from "../lib/feedback/contracts.mjs";
import { loadBenchmarkV3Design } from "../lib/benchmark/v3-design.mjs";
import { assessBenchmarkV3HoldoutContinuationReadiness } from "../lib/benchmark/v3-execution-authority.mjs";
import { validateBenchmarkV3IssuerRoleEntries, validateBenchmarkV3IssuerRoleSeparation } from "../lib/benchmark/v3-issuer-separation.mjs";
import { loadBenchmarkV3HoldoutIssuers, loadSignedBenchmarkV3HoldoutCommitment, loadSignedExternalBenchmarkV3Holdout,
  revealBenchmarkV3HoldoutSelection } from "../lib/benchmark/v3-holdout.mjs";
import { loadBenchmarkV3ReadinessIssuers } from "../lib/benchmark/v3-readiness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { value: design } = loadBenchmarkV3Design(root);
assert.deepEqual(validateBenchmarkV3IssuerRoleSeparation(root), {
  role_count: 5, issuer_count: 6, canonical_key_count: 6,
});
assert.equal(loadBenchmarkV3HoldoutIssuers(root).length >= 1, true);
const readiness = spawnSync(process.execPath, [path.join(root, "scripts", "verify-benchmark-v3-holdout-readiness.mjs")], {
  cwd: root, encoding: "utf8", shell: false, windowsHide: true, env: {},
});
assert.equal(readiness.status, 2);
const blocked = JSON.parse(readiness.stdout);
assert.equal(blocked.status, "blocked_environment");
for (const code of ["EXACT_CAMPAIGN_RESUME_UNAVAILABLE", "FROZEN_CANDIDATE_BUNDLE_UNAVAILABLE",
  "PROCESS_CONTAINMENT_UNAVAILABLE", "HIDDEN_DATA_NAMESPACE_ISOLATION_UNAVAILABLE",
  "SEALED_HOLDOUT_EGRESS_BOUNDARY_UNAVAILABLE", "SIGNED_EXECUTION_AUTHORITY_UNAVAILABLE",
  "SIGNED_HOLDOUT_COMMITMENT_UNAVAILABLE", "SIGNED_EXTERNAL_HOLDOUT_UNAVAILABLE"]) {
  assert.equal(blocked.reasons.some((entry) => entry.code === code), true, `${code} must fail closed`);
}
const reservedWithoutAttempt = assessBenchmarkV3HoldoutContinuationReadiness({
  globalAuthorityStatus: { holdout_status: "exact-resume", continuation_available: false, continuation_mode: "resume" },
  priorHoldoutAttempt: false, priorHoldoutReport: false, priorExecution: 0,
});
assert.equal(reservedWithoutAttempt.exact_holdout_resume, false);
assert.equal(reservedWithoutAttempt.reasons.some((entry) => entry.code === "GLOBAL_CONTINUATION_ALREADY_CONSUMED"), true,
  "a reserved holdout with no journaled attempt must fail closed after the global continuation is spent");
const resumableWithoutAttempt = assessBenchmarkV3HoldoutContinuationReadiness({
  globalAuthorityStatus: { holdout_status: "exact-resume", continuation_available: true, continuation_mode: null },
  priorHoldoutAttempt: false, priorHoldoutReport: false, priorExecution: 0,
});
assert.equal(resumableWithoutAttempt.exact_holdout_resume, true,
  "a reserved holdout may use the sole remaining exact resume before its first journaled attempt");
assert.deepEqual(resumableWithoutAttempt.reasons, []);
assert.equal(fs.existsSync(path.join(root, "benchmarks", "v3", "corpus", "holdout")), false,
  "public Git must not contain rendered holdout families");
const holdoutIssuerKey = JSON.parse(fs.readFileSync(path.join(root, "benchmarks", "v3", "holdout-issuers.v1.json"), "utf8"))
  .issuers[0].public_key_pem;
const reviewerKeys = JSON.parse(fs.readFileSync(path.join(root, "benchmarks", "v3", "review-issuers.v1.json"), "utf8"))
  .issuers.map((entry) => entry.public_key_pem);
const takeoverIssuerKey = JSON.parse(fs.readFileSync(path.join(root, "benchmarks", "v3", "lease-takeover-issuers.v1.json"), "utf8"))
  .issuers[0].public_key_pem;
assert.equal(new Set([loadBenchmarkV3ReadinessIssuers(root)[0].public_key_pem, holdoutIssuerKey,
  takeoverIssuerKey]).size, 3, "host readiness, holdout custodian, and takeover auditor require distinct signing principals");
assert.equal(reviewerKeys.includes(holdoutIssuerKey), false,
  "the holdout custodian key must be separate from every reviewer key");
assert.throws(() => validateBenchmarkV3IssuerRoleEntries([
  ...Array.from({ length: 5 }, (_, index) => ({ role: `fixture-role-${index}`, issuer_id: `fixture-${index}`,
    public_key_pem: generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }) })),
  { role: "fixture-duplicate-role", issuer_id: "fixture-duplicate",
    public_key_pem: reviewerKeys[0].replace(/\n/gu, "\r\n") },
  { role: "fixture-review-role", issuer_id: "fixture-review", public_key_pem: reviewerKeys[0] },
]), /signing key is shared/u, "canonical key identity must reject alternate PEM encoding across roles");

const custody = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-v3-private-holdout-"));
try {
  fs.chmodSync(custody, 0o700);
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const issuer = { issuer_id: "fixture-external-custodian-v1", protected_channel: "fixture-private-holdout-v1",
    channel_root: custody, owner_uid: process.getuid(), public_key_pem: publicKey.export({ type: "spki", format: "pem" }) };
  const campaignExecutionId = "campaign-execution-precommit-001";
  const holdoutExecutionId = "holdout-execution-precommit-001";
  const sourceSha = "3".repeat(40);
  const sourceTreeFingerprint = `sha256:${"1".repeat(64)}`;
  const designFingerprint = `sha256:${"2".repeat(64)}`;
  const corpusFingerprint = `sha256:${"4".repeat(64)}`;
  const salt = "fixture-secret-selection-salt-2026-08-27";
  const samplingFrame = ["small", "medium", "high"].flatMap((stratum, stratumIndex) =>
    Array.from({ length: 33 }, (_, index) => ({ stratum,
      source_commit: `${stratumIndex + 1}${String(index + 1).padStart(39, "0")}`,
      parent_commit: `${stratumIndex + 4}${String(index + 1).padStart(39, "0")}`,
      source_paths: [`lib/rules/${stratum}-${String(index + 1).padStart(2, "0")}.js`] })));
  const commitmentBody = { schema_version: 1, issuer_id: issuer.issuer_id, protected_channel: issuer.protected_channel,
    campaign_execution_id: campaignExecutionId, holdout_execution_id: holdoutExecutionId,
    source_sha: sourceSha, source_tree_fingerprint: sourceTreeFingerprint, design_fingerprint: designFingerprint,
    corpus_fingerprint: corpusFingerprint, sampling_frame_fingerprint: fingerprint(samplingFrame),
    selection_algorithm: "stratified-sha256-lowest-30-v1", salt_commitment: fingerprint({ salt }),
    sampling_frame_count: 99, selection_count: 90, strata: { small: 33, medium: 33, high: 33 },
    committed_before_baseline: true, issued_at_ms: Date.now() - 1_000, expires_at_ms: Date.now() + 60_000 };
  const commitmentPath = path.join(custody, "commitment.json");
  fs.writeFileSync(commitmentPath, JSON.stringify({ ...commitmentBody,
    signature: sign(null, Buffer.from(canonicalJson(commitmentBody), "utf8"), privateKey).toString("base64url") }), { mode: 0o600 });
  const commitment = loadSignedBenchmarkV3HoldoutCommitment({ sourceRoot: root, commitmentPath,
    campaignExecutionId, holdoutExecutionId, sourceSha, sourceTreeFingerprint, designFingerprint, corpusFingerprint,
    trustedIssuers: [issuer] });
  const reveal = revealBenchmarkV3HoldoutSelection({ commitment, samplingFrame, salt });
  assert.equal(reveal.selected_identities.length, 90);
  const manifestBase = { schema_version: 2, issuer_id: issuer.issuer_id, protected_channel: issuer.protected_channel,
    campaign_execution_id: campaignExecutionId, holdout_execution_id: holdoutExecutionId,
    campaign_fingerprint: `sha256:${"5".repeat(64)}`, design_fingerprint: designFingerprint,
    final_candidate_sha: sourceSha, product_bundle_fingerprint: `sha256:${"6".repeat(64)}`,
    candidate_frozen_at_ms: Date.now() - 500, created_after_candidate_freeze: true, family_count: 90,
    strata: { small: 30, medium: 30, high: 30 }, corpus_index_fingerprint: `sha256:${"7".repeat(64)}`,
    controls_fingerprint: `sha256:${"8".repeat(64)}`,
    oracle_calibration: { pre_fix_fails: true, reference_fix_passes: true, independent_alternative_passes: true,
      audited_outside_public_git: true }, reference_solutions_included: false,
    holdout_selection: { commitment_fingerprint: commitment.commitment_fingerprint, ...reveal },
    arm_order_schedule: { deliberately: "not-reached-by-negative" }, execution_limit: 1,
    issued_at_ms: Date.now() - 100, expires_at_ms: Date.now() + 60_000 };
  const manifestPath = path.join(custody, "manifest.json");
  const writeSignedManifest = (body) => fs.writeFileSync(manifestPath, JSON.stringify({ ...body,
    signature: sign(null, Buffer.from(canonicalJson(body), "utf8"), privateKey).toString("base64url") }), { mode: 0o600 });
  writeSignedManifest({ ...manifestBase, reference_solutions_included: true });
  assert.throws(() => loadSignedExternalBenchmarkV3Holdout({ sourceRoot: root, manifestPath,
    campaignFingerprint: manifestBase.campaign_fingerprint, designFingerprint,
    finalCandidateSha: sourceSha, productBundleFingerprint: manifestBase.product_bundle_fingerprint,
    candidateFrozenAtMs: manifestBase.candidate_frozen_at_ms, campaignExecutionId, holdoutExecutionId,
    holdoutCommitment: commitment, armOrderPolicy: design.arm_order_schedule, trustedIssuers: [issuer] }),
  /reference|signature|calibration/u, "a signed external manifest containing reference solutions must be rejected");

  const selected = structuredClone(reveal.selected_identities);
  const unselected = samplingFrame.find((identity) => !selected.some((entry) => canonicalJson(entry) === canonicalJson(identity)));
  selected[0] = unselected;
  const candidateAwareReveal = { ...reveal, selected_identities: selected,
    selection_proof_fingerprint: fingerprint({ commitment_fingerprint: commitment.commitment_fingerprint,
      sampling_frame_fingerprint: reveal.sampling_frame_fingerprint, selection_algorithm: reveal.selection_algorithm,
      salt, selected_identities: selected }) };
  writeSignedManifest({ ...manifestBase, holdout_selection: { commitment_fingerprint: commitment.commitment_fingerprint,
    ...candidateAwareReveal } });
  assert.throws(() => loadSignedExternalBenchmarkV3Holdout({ sourceRoot: root, manifestPath,
    campaignFingerprint: manifestBase.campaign_fingerprint, designFingerprint,
    finalCandidateSha: sourceSha, productBundleFingerprint: manifestBase.product_bundle_fingerprint,
    candidateFrozenAtMs: manifestBase.candidate_frozen_at_ms, campaignExecutionId, holdoutExecutionId,
    holdoutCommitment: commitment, armOrderPolicy: design.arm_order_schedule, trustedIssuers: [issuer] }),
  /selection reveal or proof/u, "a post-candidate cherry-picked selection must fail despite a valid custodian signature");

  const expiredCommitmentBody = { ...commitmentBody, issued_at_ms: Date.now() - 20_000,
    expires_at_ms: Date.now() - 10_000 };
  fs.writeFileSync(commitmentPath, JSON.stringify({ ...expiredCommitmentBody,
    signature: sign(null, Buffer.from(canonicalJson(expiredCommitmentBody), "utf8"), privateKey).toString("base64url") }), { mode: 0o600 });
  assert.throws(() => loadSignedBenchmarkV3HoldoutCommitment({ sourceRoot: root, commitmentPath,
    campaignExecutionId, holdoutExecutionId, sourceSha, sourceTreeFingerprint, designFingerprint, corpusFingerprint,
    trustedIssuers: [issuer] }), /expiry is invalid/u, "an expired holdout commitment must fail before baseline");

  fs.writeFileSync(commitmentPath, JSON.stringify({ ...commitmentBody, signature: "self-authored" }), { mode: 0o600 });
  assert.throws(() => loadSignedBenchmarkV3HoldoutCommitment({ sourceRoot: root, commitmentPath,
    campaignExecutionId, holdoutExecutionId, sourceSha, sourceTreeFingerprint, designFingerprint, corpusFingerprint,
    trustedIssuers: [issuer] }), /signature/u, "an unsigned sampling commitment must fail before baseline");
} finally { fs.rmSync(custody, { recursive: true, force: true }); }

const runnerSource = fs.readFileSync(path.join(root, "lib", "benchmark", "v3-runner.mjs"), "utf8");
assert.equal(runnerSource.includes('phase: "holdout"'), true);
assert.equal(runnerSource.includes('reportName: "holdout-report.json"'), true);
assert.equal(runnerSource.includes("reference_solutions_included"), false,
  "the execution runner must consume only the opaque validated external corpus object");
process.stdout.write(`${JSON.stringify({ schema_version: 1, status: "passed", gate: "holdout-readiness-negative",
  model_calls: 0, public_holdout_paths_absent: true, unsigned_commitment_rejected: true,
  expired_commitment_rejected: true,
  candidate_aware_cherry_pick_rejected: true, reference_solution_manifest_rejected: true,
  exact_resume_required: true, distinct_custody_trust_roots: true }, null, 2)}\n`);
