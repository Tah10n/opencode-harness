import { createHash, createPublicKey, verify } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import { canonicalJson, fingerprint } from "../feedback/contracts.mjs";

const FP = /^sha256:[0-9a-f]{64}$/u;
const CAPABILITY = /^[a-z][a-z0-9-]{2,127}$/u;
const ISSUER_ID = /^[a-z][a-z0-9-]{2,127}$/u;
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/u;
const REQUIRED_CAPABILITIES = Object.freeze([
  "real-process-containment",
  "hidden-namespace-isolation",
  "provider-only-egress",
]);
const AUTHORIZATIONS = new WeakSet();

export const BENCHMARK_V3_READINESS_ISSUERS = Object.freeze([Object.freeze({
  issuer_id: "opencode-harness-readiness-root-v1",
  protected_channel: "root-owned-readiness-v1",
  channel_root: "/var/run/opencode-harness/readiness",
  owner_uid: 0,
  capabilities: Object.freeze(["real-process-containment", "hidden-namespace-isolation", "provider-only-egress"]),
  public_key_pem: "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAiHNCts6lml0pVjQCZZAeWOFdRkoEpjAs8sbKLFyX5P4=\n-----END PUBLIC KEY-----\n",
})]);

function fail(message) { throw new Error(`BENCHMARK_V3_READINESS_RECEIPT: ${message}`); }
function exact(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())) fail("receipt shape is invalid");
}
function sourceSha(sourceRoot) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: sourceRoot, encoding: "utf8", shell: false, windowsHide: true });
  if (result.status !== 0 || !/^[0-9a-f]{40}$/u.test(result.stdout.trim())) fail("source identity is unavailable");
  return result.stdout.trim();
}
function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
function protectedChannelLocation(receiptPath, issuer) {
  if (!Number.isSafeInteger(issuer.owner_uid) || issuer.owner_uid < 0
    || typeof issuer.channel_root !== "string" || !path.isAbsolute(issuer.channel_root)) fail("issuer channel is invalid");
  const configuredRoot = path.resolve(issuer.channel_root);
  let canonicalRoot;
  try { canonicalRoot = fs.realpathSync.native(configuredRoot); } catch { fail("protected issuer channel is unavailable"); }
  const absoluteReceipt = path.resolve(receiptPath);
  const traversalRoot = inside(configuredRoot, absoluteReceipt)
    ? configuredRoot
    : inside(canonicalRoot, absoluteReceipt) ? canonicalRoot : null;
  if (traversalRoot === null) fail("receipt is outside the protected issuer channel");
  let canonicalParent;
  try { canonicalParent = fs.realpathSync.native(path.dirname(absoluteReceipt)); } catch { fail("protected issuer channel is unavailable"); }
  const canonicalReceipt = path.join(canonicalParent, path.basename(absoluteReceipt));
  if (!inside(canonicalRoot, canonicalReceipt)) fail("receipt is outside the protected issuer channel");
  return Object.freeze({ absoluteReceipt, traversalRoot });
}
function assertProtectedChannel(receiptPath, issuer) {
  const { absoluteReceipt, traversalRoot } = protectedChannelLocation(receiptPath, issuer);
  let current = path.dirname(absoluteReceipt);
  while (true) {
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || ![0, issuer.owner_uid].includes(stat.uid)
      || (stat.mode & 0o022) !== 0) fail("protected channel ancestry is untrusted");
    if (current === traversalRoot) break;
    const parent = path.dirname(current);
    if (parent === current || !inside(traversalRoot, parent)) fail("protected channel ancestry escaped its root");
    current = parent;
  }
}
function readStableReceipt(receiptPath, issuer) {
  assertProtectedChannel(receiptPath, issuer);
  let descriptor;
  try {
    const noFollow = fs.constants.O_NOFOLLOW ?? 0;
    descriptor = fs.openSync(receiptPath, fs.constants.O_RDONLY | noFollow);
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size > 64n * 1024n
      || Number(before.uid) !== issuer.owner_uid || (Number(before.mode) & 0o022) !== 0) fail("receipt owner or mode is untrusted");
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor, { bigint: true });
    const pathAfter = fs.lstatSync(receiptPath, { bigint: true });
    for (const key of ["dev", "ino", "mode", "nlink", "size", "mtimeNs", "ctimeNs", "uid"]) {
      if (before[key] !== after[key] || after[key] !== pathAfter[key]) fail("receipt identity changed while it was read");
    }
    if (!pathAfter.isFile() || pathAfter.isSymbolicLink()) fail("receipt file is untrusted");
    return bytes;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}
export function benchmarkV3ReadinessEnvironment() {
  return Object.freeze({
    host_fingerprint: `sha256:${createHash("sha256").update(os.hostname().toLowerCase()).digest("hex")}`,
    environment_fingerprint: fingerprint({ platform: process.platform, arch: process.arch, node: process.versions.node }),
  });
}
export function validateBenchmarkV3ReadinessReceipt(receiptPath, {
  capability,
  sourceRoot,
  now = Date.now(),
  trustedIssuers = BENCHMARK_V3_READINESS_ISSUERS,
} = {}) {
  if (typeof receiptPath !== "string" || !path.isAbsolute(receiptPath) || !CAPABILITY.test(capability)
    || !Array.isArray(trustedIssuers)) fail("receipt path, capability, or issuer registry is invalid");
  const channelIssuers = trustedIssuers.filter((entry) => {
    try { protectedChannelLocation(receiptPath, entry); return true; } catch { return false; }
  });
  if (channelIssuers.length !== 1) fail("receipt protected channel is untrusted or ambiguous");
  const [issuer] = channelIssuers;
  if (!ISSUER_ID.test(issuer.issuer_id) || !issuer.capabilities?.includes(capability)) fail("receipt issuer identity is untrusted");
  const value = JSON.parse(readStableReceipt(receiptPath, issuer).toString("utf8"));
  const keys = ["schema_version", "issuer_id", "protected_channel", "host_fingerprint", "source_sha", "environment_fingerprint",
    "capability", "status", "issued_at_ms", "expires_at_ms", "signature"];
  exact(value, keys);
  const { signature, ...body } = value;
  const environment = benchmarkV3ReadinessEnvironment();
  let signatureValid = false;
  try {
    signatureValid = SIGNATURE.test(signature)
      && verify(null, Buffer.from(canonicalJson(body), "utf8"), createPublicKey(issuer.public_key_pem), Buffer.from(signature, "base64url"));
  } catch { signatureValid = false; }
  if (value.schema_version !== 2 || value.status !== "verified" || value.capability !== capability
    || value.issuer_id !== issuer.issuer_id || value.protected_channel !== issuer.protected_channel
    || value.host_fingerprint !== environment.host_fingerprint || value.environment_fingerprint !== environment.environment_fingerprint
    || value.source_sha !== sourceSha(sourceRoot) || !FP.test(value.host_fingerprint) || !FP.test(value.environment_fingerprint)
    || !signatureValid || !Number.isSafeInteger(value.issued_at_ms) || !Number.isSafeInteger(value.expires_at_ms)
    || value.issued_at_ms > now || value.expires_at_ms <= now || value.expires_at_ms - value.issued_at_ms > 24 * 60 * 60 * 1000) {
    fail("receipt binding, status, signature, or expiry is invalid");
  }
  return Object.freeze(value);
}

export function authorizeBenchmarkV3Capabilities(receiptPaths, {
  sourceRoot,
  now = Date.now(),
  trustedIssuers = BENCHMARK_V3_READINESS_ISSUERS,
} = {}) {
  exact(receiptPaths, REQUIRED_CAPABILITIES);
  const receipts = REQUIRED_CAPABILITIES.map((capability) => validateBenchmarkV3ReadinessReceipt(receiptPaths[capability], {
    capability, sourceRoot, now, trustedIssuers,
  }));
  const body = Object.freeze({
    schema_version: 1,
    source_sha: receipts[0].source_sha,
    host_fingerprint: receipts[0].host_fingerprint,
    environment_fingerprint: receipts[0].environment_fingerprint,
    capabilities: Object.freeze([...REQUIRED_CAPABILITIES]),
    receipt_fingerprints: Object.freeze(receipts.map((entry) => fingerprint(entry))),
  });
  if (receipts.some((entry) => entry.source_sha !== body.source_sha
    || entry.host_fingerprint !== body.host_fingerprint
    || entry.environment_fingerprint !== body.environment_fingerprint)) fail("capability receipts do not bind one execution environment");
  const authorization = Object.freeze({ ...body, authorization_fingerprint: fingerprint(body) });
  AUTHORIZATIONS.add(authorization);
  return authorization;
}

export function assertBenchmarkV3CapabilityAuthorization(authorization) {
  if (!AUTHORIZATIONS.has(authorization)) fail("opaque same-process capability authorization is required");
  return authorization;
}
