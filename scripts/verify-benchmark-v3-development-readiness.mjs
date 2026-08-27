#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadBenchmarkV3Corpus } from "../lib/benchmark/v3-corpus.mjs";
import { loadBenchmarkV3Design } from "../lib/benchmark/v3-design.mjs";
import { loadSignedBenchmarkV3ExecutionAuthority } from "../lib/benchmark/v3-execution-authority.mjs";
import { loadSignedBenchmarkV3HoldoutCommitment } from "../lib/benchmark/v3-holdout.mjs";
import { verifyBenchmarkV3ProductBundle } from "../lib/benchmark/v3-runner.mjs";
import { validateBenchmarkV3ReadinessReceipt } from "../lib/benchmark/v3-readiness.mjs";
import { buildProfileBundleManifest } from "../lib/profile-v3.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpus = loadBenchmarkV3Corpus(root);
const { validation: designValidation } = loadBenchmarkV3Design(root);
if (corpus.families.length !== 120 || corpus.families.some((entry) => !["development", "validation"].includes(entry.split))
  || corpus.development_execution_eligible !== true || corpus.confirmatory_eligible !== false) {
  throw new Error("public development/validation corpus boundary is invalid");
}
const reasons = [];
let executionAuthority = null;
const output = process.env.BENCHMARK_V3_CAMPAIGN_OUTPUT;
if (typeof output === "string" && path.isAbsolute(output)
  && typeof process.env.BENCHMARK_V3_EXECUTION_AUTHORITY === "string") {
  try {
    const prepared = buildProfileBundleManifest(root, "lab").manifest;
    executionAuthority = loadSignedBenchmarkV3ExecutionAuthority({ sourceRoot: root,
      receiptPath: path.resolve(process.env.BENCHMARK_V3_EXECUTION_AUTHORITY), sourceSha: prepared.source_sha,
      sourceTreeFingerprint: prepared.source_tree_fingerprint, designFingerprint: designValidation.design_fingerprint,
      corpusFingerprint: corpus.corpus_fingerprint, outputDirectory: path.resolve(output) });
  } catch { reasons.push({ code: "SIGNED_EXECUTION_AUTHORITY_INVALID", requirement: "signed-global-campaign-and-holdout-execution-ids" }); }
} else reasons.push({ code: "SIGNED_EXECUTION_AUTHORITY_UNAVAILABLE", requirement: "signed-global-campaign-and-holdout-execution-ids" });
if (executionAuthority !== null && typeof process.env.BENCHMARK_V3_HOLDOUT_SELECTION_COMMITMENT === "string") {
  try {
    const prepared = buildProfileBundleManifest(root, "lab").manifest;
    loadSignedBenchmarkV3HoldoutCommitment({ sourceRoot: root,
      commitmentPath: path.resolve(process.env.BENCHMARK_V3_HOLDOUT_SELECTION_COMMITMENT),
      campaignExecutionId: executionAuthority.receipt.campaign_execution_id,
      holdoutExecutionId: executionAuthority.receipt.holdout_execution_id, sourceSha: prepared.source_sha,
      sourceTreeFingerprint: prepared.source_tree_fingerprint, designFingerprint: designValidation.design_fingerprint,
      corpusFingerprint: corpus.corpus_fingerprint });
  } catch { reasons.push({ code: "SIGNED_HOLDOUT_COMMITMENT_INVALID", requirement: "pre-baseline-sampling-frame-algorithm-salt-commitment" }); }
} else reasons.push({ code: "SIGNED_HOLDOUT_COMMITMENT_UNAVAILABLE", requirement: "pre-baseline-sampling-frame-algorithm-salt-commitment" });
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
  reasons.push({ code: "SEMANTIC_ORACLE_RUNTIME_UNAVAILABLE", requirement: "frozen-semantic-runtime-and-structural-contract-audit" });
} else {
  const audit = spawnSync(process.execPath, [path.join(root, "scripts", "verify-benchmark-v3-contract-audit.mjs")], {
    cwd: root, encoding: "utf8", shell: false, windowsHide: true, timeout: 30 * 60 * 1000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, BENCHMARK_V3_ESLINT_RUNTIME_ROOT: runtime },
  });
  if (audit.status !== 0) reasons.push({ code: "VISIBLE_CONTRACT_AUDIT_FAILED", requirement: "all-family-structural-audit-and-representative-alternative-witnesses" });
}
const result = { schema_version: 1, gate: "development-readiness", status: reasons.length === 0 ? "passed" : "blocked_environment",
  public_corpus: "development-validation-only", external_holdout_required: false,
  development_campaign: reasons.length === 0 ? "ready" : "blocked", confirmatory_claim_allowed: false,
  model_calls: 0, candidate_tokens: 0, reasons };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (reasons.length > 0) process.exitCode = 2;
