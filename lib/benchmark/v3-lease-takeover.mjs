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
  let current = parent;
  while (true) {
    const ancestry = fs.lstatSync(current);
    expect(ancestry.isDirectory() && !ancestry.isSymbolicLink() && ancestry.uid === issuer.owner_uid
      && (ancestry.mode & 0o022) === 0,
    "BENCHMARK_V3_TAKEOVER_CUSTODY", "takeover protected-channel ancestry is untrusted");
    if (current === root) break;
    const next = path.dirname(current);
    expect(next !== current && inside(root, next), "BENCHMARK_V3_TAKEOVER_CUSTODY", "takeover protected-channel ancestry escaped");
    current = next;
  }
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
  const targetFingerprint = benchmarkV3LeaseTargetFingerprint(sourceRoot, campaignFingerprint);
  const { signature, ...body } = receipt;
  let signatureValid = false;
  try { signatureValid = SIGNATURE.test(signature)
    && verifySignature(null, Buffer.from(canonicalJson(body), "utf8"), createPublicKey(issuer.public_key_pem), Buffer.from(signature, "base64url")); } catch {}
  expect(receipt.schema_version === 1 && receipt.issuer_id === issuer.issuer_id && receipt.protected_channel === issuer.protected_channel
    && receipt.source_sha === git(sourceRoot, ["rev-parse", "HEAD"]) && SHA.test(receipt.source_sha)
    && receipt.campaign_fingerprint === campaignFingerprint && receipt.lease_target_fingerprint === targetFingerprint
    && FP.test(receipt.observed_lease_fingerprint)
    && typeof receipt.audited_by === "string" && receipt.audited_by.length >= 3
    && typeof receipt.reason === "string" && receipt.reason.length >= 20
    && Number.isSafeInteger(receipt.issued_at_ms) && Number.isSafeInteger(receipt.expires_at_ms)
    && receipt.issued_at_ms <= now && receipt.expires_at_ms > now && receipt.expires_at_ms - receipt.issued_at_ms <= 60 * 60 * 1000
    && signatureValid, "BENCHMARK_V3_TAKEOVER_SIGNATURE", "takeover receipt binding, audit, signature, or expiry is invalid");
  const leaseStat = fs.lstatSync(leaseTarget);
  expect(leaseStat.isFile() && !leaseStat.isSymbolicLink() && leaseStat.nlink === 1
    && leaseStat.uid === process.getuid() && (leaseStat.mode & 0o077) === 0 && leaseStat.size <= 64 * 1024,
  "BENCHMARK_V3_TAKEOVER_CUSTODY", "campaign lease identity, ownership, or mode is untrusted");
  const evidenceDirectory = path.join(path.dirname(leaseTarget), "takeover-evidence");
  fs.mkdirSync(evidenceDirectory, { recursive: true, mode: 0o700 });
  const evidenceStat = fs.lstatSync(evidenceDirectory);
  expect(evidenceStat.isDirectory() && !evidenceStat.isSymbolicLink() && evidenceStat.uid === process.getuid()
    && (evidenceStat.mode & 0o077) === 0,
  "BENCHMARK_V3_TAKEOVER_CUSTODY", "takeover evidence directory identity, ownership, or mode is untrusted");
  const suffix = `${Date.now()}-${randomBytes(8).toString("hex")}`;
  const guardTarget = `${leaseTarget}.takeover-guard`;
  const rawTarget = path.join(evidenceDirectory, `${suffix}.lease.raw`);
  const evidenceTarget = path.join(evidenceDirectory, `${suffix}.json`);
  let guard = null;
  let quarantined = false;
  try {
    guard = fs.openSync(guardTarget, "wx", 0o600);
    fs.writeFileSync(guard, `${JSON.stringify({ schema_version: 1, receipt_fingerprint: fingerprint(receipt),
      campaign_fingerprint: campaignFingerprint })}\n`);
    fs.fsyncSync(guard);
    fs.renameSync(leaseTarget, rawTarget);
    quarantined = true;
    const quarantinedBytes = fs.readFileSync(rawTarget);
    expect(receipt.observed_lease_fingerprint === fingerprint(quarantinedBytes.toString("utf8")),
      "BENCHMARK_V3_TAKEOVER_RACE", "campaign lease changed after audit; exact signed takeover is rejected");
    const evidence = { schema_version: 1, receipt_fingerprint: fingerprint(receipt), lease_target_fingerprint: targetFingerprint,
      observed_lease_fingerprint: receipt.observed_lease_fingerprint, archived_at_ms: Date.now(),
      raw_lease_file: path.basename(rawTarget), previous_lease: JSON.parse(quarantinedBytes.toString("utf8")) };
    fs.writeFileSync(evidenceTarget, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    quarantined = false;
    return Object.freeze({ status: "taken-over", evidence_path: evidenceTarget, raw_lease_path: rawTarget,
      receipt_fingerprint: evidence.receipt_fingerprint });
  } catch (error) {
    if (quarantined && fs.existsSync(rawTarget) && !fs.existsSync(leaseTarget)) fs.renameSync(rawTarget, leaseTarget);
    throw error;
  } finally {
    if (guard !== null) fs.closeSync(guard);
    if (fs.existsSync(guardTarget)) fs.unlinkSync(guardTarget);
  }
}
