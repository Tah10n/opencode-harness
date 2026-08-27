import fs from "node:fs";
import path from "node:path";
import { createHash, createPublicKey } from "node:crypto";

import { ContractError } from "../feedback/contracts.mjs";
import { BENCHMARK_V3_READINESS_ISSUERS } from "./v3-readiness.mjs";

const ROLE_FILES = Object.freeze([
  ["review", "review-issuers.v1.json"],
  ["holdout", "holdout-issuers.v1.json"],
  ["execution-authority", "execution-authority-issuers.v1.json"],
  ["lease-takeover", "lease-takeover-issuers.v1.json"],
]);

function fail(message) { throw new ContractError("BENCHMARK_V3_ISSUER_SEPARATION", message); }

export function benchmarkV3CanonicalPublicKeyFingerprint(publicKeyPem) {
  try {
    return `sha256:${createHash("sha256").update(createPublicKey(publicKeyPem)
      .export({ type: "spki", format: "der" })).digest("hex")}`;
  } catch { fail("issuer public key is invalid"); }
}

export function validateBenchmarkV3IssuerRoleEntries(entries) {
  if (!Array.isArray(entries) || entries.length < 6) fail("issuer role inventory is incomplete");
  const seen = new Map();
  for (const entry of entries) {
    if (typeof entry?.role !== "string" || typeof entry?.issuer_id !== "string"
      || typeof entry?.public_key_pem !== "string") fail("issuer role entry is invalid");
    const keyFingerprint = benchmarkV3CanonicalPublicKeyFingerprint(entry.public_key_pem);
    if (seen.has(keyFingerprint)) fail(`${entry.role} signing key is shared with ${seen.get(keyFingerprint)}`);
    seen.set(keyFingerprint, entry.role);
  }
  return Object.freeze({ role_count: new Set(entries.map((entry) => entry.role)).size,
    issuer_count: entries.length, canonical_key_count: seen.size });
}

export function validateBenchmarkV3IssuerRoleSeparation(sourceRoot) {
  const directory = path.join(sourceRoot, "benchmarks", "v3");
  const entries = BENCHMARK_V3_READINESS_ISSUERS.map((issuer) => ({ role: "readiness", ...issuer }));
  for (const [role, fileName] of ROLE_FILES) {
    let registry;
    try { registry = JSON.parse(fs.readFileSync(path.join(directory, fileName), "utf8")); }
    catch { fail(`${role} issuer registry is unavailable`); }
    if (registry?.schema_version !== 1 || !Array.isArray(registry.issuers) || registry.issuers.length < 1) {
      fail(`${role} issuer registry is invalid`);
    }
    entries.push(...registry.issuers.map((issuer) => ({ role, ...issuer })));
  }
  return validateBenchmarkV3IssuerRoleEntries(entries);
}
