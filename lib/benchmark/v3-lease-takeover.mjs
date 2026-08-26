import fs from "node:fs";
import path from "node:path";
import { createPublicKey, randomBytes, verify as verifySignature } from "node:crypto";
import { spawnSync } from "node:child_process";

import { ContractError, canonicalJson, fingerprint } from "../feedback/contracts.mjs";

const FP = /^sha256:[0-9a-f]{64}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/u;

function fail(code, message) { throw new ContractError(code, message); }
function expect(condition, code, message) { if (!condition) fail(code, message); }
function exact(value, keys, label) {
  expect(value && typeof value === "object" && !Array.isArray(value)
    && canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort()),
  "BENCHMARK_V3_TAKEOVER_SHAPE", `${label} shape is invalid`);
}
function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
function git(sourceRoot, args) {
  const result = spawnSync("git", args, { cwd: sourceRoot, encoding: "utf8", shell: false, windowsHide: true });
  expect(result.status === 0 && result.signal === null && result.error === undefined,
    "BENCHMARK_V3_TAKEOVER_GIT", "Git campaign identity is unavailable");
  return result.stdout.trim();
}
export function benchmarkV3CampaignRegistryPath(sourceRoot) {
  const common = fs.realpathSync.native(path.resolve(sourceRoot, git(sourceRoot, ["rev-parse", "--git-common-dir"])));
  return path.join(common, "opencode-harness", "benchmark-v3", "campaign-registry.json");
}
export function benchmarkV3CampaignLeasePath(sourceRoot, campaignFingerprint) {
  expect(FP.test(campaignFingerprint), "BENCHMARK_V3_TAKEOVER_ARGUMENT", "campaign fingerprint is invalid");
  return path.join(path.dirname(benchmarkV3CampaignRegistryPath(sourceRoot)), `campaign-${campaignFingerprint.slice(7)}.lease`);
}
export function benchmarkV3LeaseTargetFingerprint(sourceRoot, campaignFingerprint) {
  const leaseTarget = benchmarkV3CampaignLeasePath(sourceRoot, campaignFingerprint);
  return fingerprint({ campaign_fingerprint: campaignFingerprint,
    registry_path: benchmarkV3CampaignRegistryPath(sourceRoot), lease_basename: path.basename(leaseTarget) });
}
export function loadBenchmarkV3TakeoverIssuers(sourceRoot) {
  const value = JSON.parse(fs.readFileSync(path.join(sourceRoot, "benchmarks", "v3", "lease-takeover-issuers.v1.json"), "utf8"));
  exact(value, ["schema_version", "issuers"], "takeover issuer registry");
  expect(value.schema_version === 1 && Array.isArray(value.issuers) && value.issuers.length >= 1,
    "BENCHMARK_V3_TAKEOVER_ISSUER", "takeover issuer registry is invalid");
  return value.issuers;
}
function readProtectedReceipt(receiptPath, issuer) {
  const root = fs.realpathSync.native(path.resolve(issuer.channel_root));
  const parent = fs.realpathSync.native(path.dirname(path.resolve(receiptPath)));
  const target = path.join(parent, path.basename(receiptPath));
  expect(inside(root, target), "BENCHMARK_V3_TAKEOVER_CUSTODY", "takeover receipt is outside the protected channel");
  const descriptor = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fs.fstatSync(descriptor);
    expect(stat.isFile() && stat.nlink === 1 && stat.uid === issuer.owner_uid && (stat.mode & 0o022) === 0 && stat.size <= 64 * 1024,
      "BENCHMARK_V3_TAKEOVER_CUSTODY", "takeover receipt ownership or mode is untrusted");
    return JSON.parse(fs.readFileSync(descriptor, "utf8"));
  } finally { fs.closeSync(descriptor); }
}
export function performBenchmarkV3LeaseTakeover({ sourceRoot, campaignFingerprint, receiptPath,
  trustedIssuers = loadBenchmarkV3TakeoverIssuers(sourceRoot), now = Date.now() }) {
  const leaseTarget = benchmarkV3CampaignLeasePath(sourceRoot, campaignFingerprint);
  expect(fs.existsSync(leaseTarget), "BENCHMARK_V3_TAKEOVER_MISSING", "campaign lease does not exist");
  const matching = trustedIssuers.filter((issuer) => {
    try { return inside(fs.realpathSync.native(issuer.channel_root), fs.realpathSync.native(path.dirname(receiptPath))); } catch { return false; }
  });
  expect(matching.length === 1, "BENCHMARK_V3_TAKEOVER_ISSUER", "takeover issuer is untrusted or ambiguous");
  const [issuer] = matching;
  const receipt = readProtectedReceipt(receiptPath, issuer);
  exact(receipt, ["schema_version", "issuer_id", "protected_channel", "source_sha", "campaign_fingerprint",
    "lease_target_fingerprint", "observed_lease_fingerprint", "audited_by", "reason", "issued_at_ms", "expires_at_ms", "signature"],
  "takeover receipt");
  const leaseBytes = fs.readFileSync(leaseTarget);
  const targetFingerprint = benchmarkV3LeaseTargetFingerprint(sourceRoot, campaignFingerprint);
  const { signature, ...body } = receipt;
  let signatureValid = false;
  try { signatureValid = SIGNATURE.test(signature)
    && verifySignature(null, Buffer.from(canonicalJson(body), "utf8"), createPublicKey(issuer.public_key_pem), Buffer.from(signature, "base64url")); } catch {}
  expect(receipt.schema_version === 1 && receipt.issuer_id === issuer.issuer_id && receipt.protected_channel === issuer.protected_channel
    && receipt.source_sha === git(sourceRoot, ["rev-parse", "HEAD"]) && SHA.test(receipt.source_sha)
    && receipt.campaign_fingerprint === campaignFingerprint && receipt.lease_target_fingerprint === targetFingerprint
    && receipt.observed_lease_fingerprint === fingerprint(leaseBytes.toString("utf8"))
    && typeof receipt.audited_by === "string" && receipt.audited_by.length >= 3
    && typeof receipt.reason === "string" && receipt.reason.length >= 20
    && Number.isSafeInteger(receipt.issued_at_ms) && Number.isSafeInteger(receipt.expires_at_ms)
    && receipt.issued_at_ms <= now && receipt.expires_at_ms > now && receipt.expires_at_ms - receipt.issued_at_ms <= 60 * 60 * 1000
    && signatureValid, "BENCHMARK_V3_TAKEOVER_SIGNATURE", "takeover receipt binding, audit, signature, or expiry is invalid");
  const evidenceDirectory = path.join(path.dirname(leaseTarget), "takeover-evidence");
  fs.mkdirSync(evidenceDirectory, { recursive: true, mode: 0o700 });
  const evidenceTarget = path.join(evidenceDirectory, `${Date.now()}-${randomBytes(8).toString("hex")}.json`);
  const evidence = { schema_version: 1, receipt_fingerprint: fingerprint(receipt), lease_target_fingerprint: targetFingerprint,
    observed_lease_fingerprint: receipt.observed_lease_fingerprint, archived_at_ms: Date.now(), previous_lease: JSON.parse(leaseBytes.toString("utf8")) };
  fs.renameSync(leaseTarget, evidenceTarget);
  fs.writeFileSync(evidenceTarget, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "w", mode: 0o600 });
  return Object.freeze({ status: "taken-over", evidence_path: evidenceTarget, receipt_fingerprint: evidence.receipt_fingerprint });
}
