import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import { canonicalJson, fingerprint } from "../feedback/contracts.mjs";

const FP = /^sha256:[0-9a-f]{64}$/u;
const CAPABILITY = /^[a-z][a-z0-9-]{2,127}$/u;

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
export function benchmarkV3ReadinessEnvironment() {
  return Object.freeze({
    host_fingerprint: `sha256:${createHash("sha256").update(os.hostname().toLowerCase()).digest("hex")}`,
    environment_fingerprint: fingerprint({ platform: process.platform, arch: process.arch, node: process.versions.node }),
  });
}
export function validateBenchmarkV3ReadinessReceipt(receiptPath, { capability, sourceRoot, now = Date.now() }) {
  if (typeof receiptPath !== "string" || !path.isAbsolute(receiptPath) || !CAPABILITY.test(capability)) fail("receipt path or capability is invalid");
  const stat = fs.lstatSync(receiptPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 64 * 1024) fail("receipt file is untrusted");
  const value = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  const keys = ["schema_version", "host_fingerprint", "source_sha", "environment_fingerprint", "capability", "status", "issued_at_ms", "expires_at_ms", "fingerprint"];
  exact(value, keys);
  const { fingerprint: claimed, ...body } = value;
  const environment = benchmarkV3ReadinessEnvironment();
  if (value.schema_version !== 1 || value.status !== "verified" || value.capability !== capability
    || value.host_fingerprint !== environment.host_fingerprint
    || value.environment_fingerprint !== environment.environment_fingerprint
    || value.source_sha !== sourceSha(sourceRoot)
    || !FP.test(claimed) || claimed !== fingerprint(body)
    || !Number.isSafeInteger(value.issued_at_ms) || !Number.isSafeInteger(value.expires_at_ms)
    || value.issued_at_ms > now || value.expires_at_ms <= now || value.expires_at_ms - value.issued_at_ms > 24 * 60 * 60 * 1000) {
    fail("receipt binding, status, fingerprint, or expiry is invalid");
  }
  return Object.freeze(value);
}
