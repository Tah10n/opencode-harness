#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "../lib/feedback/contracts.mjs";
import { loadSignedExternalBenchmarkV3Holdout } from "../lib/benchmark/v3-holdout.mjs";
import { BENCHMARK_V3_READINESS_ISSUERS } from "../lib/benchmark/v3-readiness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readiness = spawnSync(process.execPath, [path.join(root, "scripts", "verify-benchmark-v3-holdout-readiness.mjs")], {
  cwd: root, encoding: "utf8", shell: false, windowsHide: true, env: {},
});
assert.equal(readiness.status, 2);
const blocked = JSON.parse(readiness.stdout);
assert.equal(blocked.status, "blocked_environment");
for (const code of ["EXACT_CAMPAIGN_RESUME_UNAVAILABLE", "FROZEN_CANDIDATE_BUNDLE_UNAVAILABLE",
  "PROCESS_CONTAINMENT_UNAVAILABLE", "HIDDEN_DATA_NAMESPACE_ISOLATION_UNAVAILABLE",
  "SEALED_HOLDOUT_EGRESS_BOUNDARY_UNAVAILABLE", "SIGNED_EXTERNAL_HOLDOUT_UNAVAILABLE"]) {
  assert.equal(blocked.reasons.some((entry) => entry.code === code), true, `${code} must fail closed`);
}
assert.equal(fs.existsSync(path.join(root, "benchmarks", "v3", "corpus", "holdout")), false,
  "public Git must not contain rendered holdout families");
const holdoutIssuerKey = JSON.parse(fs.readFileSync(path.join(root, "benchmarks", "v3", "holdout-issuers.v1.json"), "utf8"))
  .issuers[0].public_key_pem;
const takeoverIssuerKey = JSON.parse(fs.readFileSync(path.join(root, "benchmarks", "v3", "lease-takeover-issuers.v1.json"), "utf8"))
  .issuers[0].public_key_pem;
assert.equal(new Set([BENCHMARK_V3_READINESS_ISSUERS[0].public_key_pem, holdoutIssuerKey, takeoverIssuerKey]).size, 3,
  "host readiness, external holdout custody, and manual takeover audit require distinct signing principals");

const custody = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-v3-private-holdout-"));
try {
  fs.chmodSync(custody, 0o700);
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const issuer = { issuer_id: "fixture-external-custodian-v1", protected_channel: "fixture-private-holdout-v1",
    channel_root: custody, owner_uid: process.getuid(), public_key_pem: publicKey.export({ type: "spki", format: "pem" }) };
  const body = { schema_version: 1, issuer_id: issuer.issuer_id, protected_channel: issuer.protected_channel,
    campaign_fingerprint: `sha256:${"1".repeat(64)}`, design_fingerprint: `sha256:${"2".repeat(64)}`,
    final_candidate_sha: "3".repeat(40), product_bundle_fingerprint: `sha256:${"4".repeat(64)}`,
    candidate_frozen_at_ms: Date.now() - 1_000,
    created_after_candidate_freeze: true, family_count: 90, strata: { small: 30, medium: 30, high: 30 },
    corpus_index_fingerprint: `sha256:${"5".repeat(64)}`, controls_fingerprint: `sha256:${"6".repeat(64)}`,
    oracle_calibration: { pre_fix_fails: true, reference_fix_passes: true, independent_alternative_passes: true,
      audited_outside_public_git: true }, reference_solutions_included: true, execution_limit: 1,
    issued_at_ms: Date.now() - 100, expires_at_ms: Date.now() + 60_000 };
  const manifestPath = path.join(custody, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify({ ...body,
    signature: sign(null, Buffer.from(canonicalJson(body), "utf8"), privateKey).toString("base64url") }), { mode: 0o600 });
  assert.throws(() => loadSignedExternalBenchmarkV3Holdout({ sourceRoot: root, manifestPath,
    campaignFingerprint: body.campaign_fingerprint, designFingerprint: body.design_fingerprint,
    finalCandidateSha: body.final_candidate_sha, productBundleFingerprint: body.product_bundle_fingerprint,
    candidateFrozenAtMs: body.candidate_frozen_at_ms,
    trustedIssuers: [issuer] }), /reference|signature|calibration/u,
  "a signed external manifest that includes reference solutions must be rejected");
  const unsigned = { ...body, reference_solutions_included: false, signature: "self-authored" };
  fs.writeFileSync(manifestPath, JSON.stringify(unsigned), { mode: 0o600 });
  assert.throws(() => loadSignedExternalBenchmarkV3Holdout({ sourceRoot: root, manifestPath,
    campaignFingerprint: body.campaign_fingerprint, designFingerprint: body.design_fingerprint,
    finalCandidateSha: body.final_candidate_sha, productBundleFingerprint: body.product_bundle_fingerprint,
    candidateFrozenAtMs: body.candidate_frozen_at_ms,
    trustedIssuers: [issuer] }), /signature/u, "self-authored external custody JSON must be rejected");
} finally { fs.rmSync(custody, { recursive: true, force: true }); }

const runnerSource = fs.readFileSync(path.join(root, "lib", "benchmark", "v3-runner.mjs"), "utf8");
assert.equal(runnerSource.includes('phase: "holdout"'), true);
assert.equal(runnerSource.includes('reportName: "holdout-report.json"'), true);
assert.equal(runnerSource.includes("reference_solutions_included"), false,
  "the execution runner must consume only the opaque validated external corpus object");
process.stdout.write(`${JSON.stringify({ schema_version: 1, status: "passed", gate: "holdout-readiness-negative",
  model_calls: 0, public_holdout_paths_absent: true, unsigned_manifest_rejected: true,
  reference_solution_manifest_rejected: true, exact_resume_required: true, distinct_custody_trust_roots: true }, null, 2)}\n`);
