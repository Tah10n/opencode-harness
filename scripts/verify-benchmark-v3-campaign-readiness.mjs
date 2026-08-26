#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBenchmarkV3Corpus } from "../lib/benchmark/v3-corpus.mjs";
import { verifyBenchmarkV3ProductBundle } from "../lib/benchmark/v3-runner.mjs";
import { validateBenchmarkV3ReadinessReceipt } from "../lib/benchmark/v3-readiness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpus = loadBenchmarkV3Corpus(root);
if (corpus.development_execution_eligible !== true || corpus.confirmatory_eligible !== false) {
  throw new Error("public corpus development/confirmatory boundary is invalid");
}
const reasons = [];
for (const [environmentName, capability, code, requirement] of [
  ["OPENCODE_QUALITY_PROCESS_CONTAINMENT_RECEIPT", "real-process-containment", "PROCESS_CONTAINMENT_UNAVAILABLE", "real-process-containment"],
  ["BENCHMARK_V3_HIDDEN_NAMESPACE_ISOLATION_RECEIPT", "hidden-namespace-isolation", "HIDDEN_DATA_NAMESPACE_ISOLATION_UNAVAILABLE", "hidden-artifacts-never-mounted-during-model-execution"],
  ["BENCHMARK_V3_PROVIDER_ONLY_EGRESS_RECEIPT", "provider-only-egress", "SEALED_HOLDOUT_EGRESS_BOUNDARY_UNAVAILABLE", "provider-only-egress-or-proven-equivalent"],
]) {
  try { validateBenchmarkV3ReadinessReceipt(process.env[environmentName], { capability, sourceRoot: root }); }
  catch { reasons.push({ code, requirement }); }
}
if (typeof process.env.BENCHMARK_V3_CANDIDATE_BUNDLE !== "string") reasons.push({ code: "CANDIDATE_PRODUCT_FINGERPRINT_EQUIVALENCE_UNPROVEN", requirement: "exact-product-candidate-fingerprint-equivalence" });
else {
  try { verifyBenchmarkV3ProductBundle(root, path.resolve(process.env.BENCHMARK_V3_CANDIDATE_BUNDLE)); }
  catch { reasons.push({ code: "CANDIDATE_PRODUCT_FINGERPRINT_MISMATCH", requirement: "exact-product-candidate-fingerprint-equivalence" }); }
}
if (typeof process.env.BENCHMARK_V3_SEALED_HOLDOUT_ROOT !== "string") {
  reasons.push({ code: "EXTERNAL_SEALED_HOLDOUT_UNAVAILABLE", requirement: "outside-public-git-created-after-design-and-candidate-freeze" });
} else {
  try {
    const sealed = fs.realpathSync.native(path.resolve(process.env.BENCHMARK_V3_SEALED_HOLDOUT_ROOT));
    const relative = path.relative(root, sealed);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)) || !fs.statSync(sealed).isDirectory()) throw new Error("invalid sealed holdout root");
  } catch { reasons.push({ code: "EXTERNAL_SEALED_HOLDOUT_INVALID", requirement: "outside-public-git-created-after-design-and-candidate-freeze" }); }
}
const result = { schema_version: 1, gate: "campaign-readiness", status: reasons.length === 0 ? "passed" : "blocked_environment",
  foundation_publication: "published", lab_infrastructure_publication: "pr-current-head", model_campaign: reasons.length === 0 ? "ready" : "blocked",
  holdout_promotion: reasons.length === 0 ? "eligible-for-sealed-execution" : "blocked_environment", model_calls: 0, candidate_tokens: 0, reasons };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (reasons.length > 0) process.exitCode = 2;
