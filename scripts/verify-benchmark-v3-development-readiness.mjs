#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadBenchmarkV3Corpus } from "../lib/benchmark/v3-corpus.mjs";
import { verifyBenchmarkV3ProductBundle } from "../lib/benchmark/v3-runner.mjs";
import { validateBenchmarkV3ReadinessReceipt } from "../lib/benchmark/v3-readiness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpus = loadBenchmarkV3Corpus(root);
if (corpus.families.length !== 120 || corpus.families.some((entry) => !["development", "validation"].includes(entry.split))
  || corpus.development_execution_eligible !== true || corpus.confirmatory_eligible !== false) {
  throw new Error("public development/validation corpus boundary is invalid");
}
const reasons = [];
for (const [environmentName, capability, code, requirement] of [
  ["OPENCODE_QUALITY_PROCESS_CONTAINMENT_RECEIPT", "real-process-containment", "PROCESS_CONTAINMENT_UNAVAILABLE", "real-process-containment"],
  ["BENCHMARK_V3_HIDDEN_NAMESPACE_ISOLATION_RECEIPT", "hidden-namespace-isolation", "HIDDEN_DATA_NAMESPACE_ISOLATION_UNAVAILABLE", "hidden-artifacts-never-mounted-during-model-execution"],
]) {
  try { validateBenchmarkV3ReadinessReceipt(process.env[environmentName], { capability, sourceRoot: root }); }
  catch { reasons.push({ code, requirement }); }
}
if (typeof process.env.BENCHMARK_V3_CANDIDATE_BUNDLE !== "string") {
  reasons.push({ code: "CANDIDATE_PRODUCT_FINGERPRINT_EQUIVALENCE_UNPROVEN", requirement: "exact-product-candidate-fingerprint-equivalence" });
} else {
  try { verifyBenchmarkV3ProductBundle(root, path.resolve(process.env.BENCHMARK_V3_CANDIDATE_BUNDLE)); }
  catch { reasons.push({ code: "CANDIDATE_PRODUCT_FINGERPRINT_MISMATCH", requirement: "exact-product-candidate-fingerprint-equivalence" }); }
}
const runtime = process.env.BENCHMARK_V3_ESLINT_RUNTIME_ROOT;
if (typeof runtime !== "string" || !path.isAbsolute(runtime)) {
  reasons.push({ code: "SEMANTIC_ORACLE_RUNTIME_UNAVAILABLE", requirement: "frozen-semantic-runtime-and-full-contract-audit" });
} else {
  const audit = spawnSync(process.execPath, [path.join(root, "scripts", "verify-benchmark-v3-contract-audit.mjs")], {
    cwd: root, encoding: "utf8", shell: false, windowsHide: true, timeout: 30 * 60 * 1000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, BENCHMARK_V3_ESLINT_RUNTIME_ROOT: runtime },
  });
  if (audit.status !== 0) reasons.push({ code: "VISIBLE_CONTRACT_AUDIT_FAILED", requirement: "pre-fix-fails-reference-and-independent-alternative-pass" });
}
const result = { schema_version: 1, gate: "development-readiness", status: reasons.length === 0 ? "passed" : "blocked_environment",
  public_corpus: "development-validation-only", external_holdout_required: false,
  development_campaign: reasons.length === 0 ? "ready" : "blocked", confirmatory_claim_allowed: false,
  model_calls: 0, candidate_tokens: 0, reasons };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (reasons.length > 0) process.exitCode = 2;
