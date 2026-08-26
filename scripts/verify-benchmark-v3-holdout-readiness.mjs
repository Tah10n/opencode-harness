#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fingerprint } from "../lib/feedback/contracts.mjs";
import { loadBenchmarkV3Corpus } from "../lib/benchmark/v3-corpus.mjs";
import { loadBenchmarkV3Design } from "../lib/benchmark/v3-design.mjs";
import { loadSignedExternalBenchmarkV3Holdout } from "../lib/benchmark/v3-holdout.mjs";
import { validateBenchmarkV3Ledger } from "../lib/benchmark/v3-ledger.mjs";
import { verifyBenchmarkV3ProductBundle } from "../lib/benchmark/v3-runner.mjs";
import { validateBenchmarkV3ReadinessReceipt } from "../lib/benchmark/v3-readiness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { value: design, validation: designValidation } = loadBenchmarkV3Design(root);
const corpus = loadBenchmarkV3Corpus(root);
const reasons = [];
let report = null;
const output = process.env.BENCHMARK_V3_CAMPAIGN_OUTPUT;
if (typeof output !== "string" || !path.isAbsolute(output)) {
  reasons.push({ code: "EXACT_CAMPAIGN_RESUME_UNAVAILABLE", requirement: "absolute-existing-campaign-output" });
} else {
  try {
    report = JSON.parse(fs.readFileSync(path.join(output, "report.json"), "utf8"));
    const { study_fingerprint: declared, ...body } = report;
    if (declared !== fingerprint(body) || report.status !== "sealed-holdout-required"
      || report.confirmatory_claim_allowed !== false || report.validation_efficacy?.passed !== true
      || report.ledger?.final_candidate_sha === null || !Number.isSafeInteger(report.final_candidate_frozen_at_ms)) {
      throw new Error("campaign is not frozen after passed validation");
    }
    validateBenchmarkV3Ledger(report.ledger, design);
  } catch {
    report = null;
    reasons.push({ code: "VALIDATION_OR_FREEZE_EVIDENCE_INVALID", requirement: "passed-validation-and-frozen-final-candidate" });
  }
}
let candidate = null;
if (typeof process.env.BENCHMARK_V3_CANDIDATE_BUNDLE !== "string") {
  reasons.push({ code: "FROZEN_CANDIDATE_BUNDLE_UNAVAILABLE", requirement: "exact-frozen-product-bundle" });
} else {
  try {
    candidate = verifyBenchmarkV3ProductBundle(root, path.resolve(process.env.BENCHMARK_V3_CANDIDATE_BUNDLE));
    if (report !== null && (candidate.source_sha !== report.ledger.final_candidate_sha
      || candidate.product_bundle_fingerprint !== report.product_bundle_fingerprint)) throw new Error("candidate drift");
  } catch {
    candidate = null;
    reasons.push({ code: "FROZEN_CANDIDATE_BINDING_MISMATCH", requirement: "exact-frozen-product-bundle" });
  }
}
for (const [environmentName, capability, code] of [
  ["OPENCODE_QUALITY_PROCESS_CONTAINMENT_RECEIPT", "real-process-containment", "PROCESS_CONTAINMENT_UNAVAILABLE"],
  ["BENCHMARK_V3_HIDDEN_NAMESPACE_ISOLATION_RECEIPT", "hidden-namespace-isolation", "HIDDEN_DATA_NAMESPACE_ISOLATION_UNAVAILABLE"],
  ["BENCHMARK_V3_PROVIDER_ONLY_EGRESS_RECEIPT", "provider-only-egress", "SEALED_HOLDOUT_EGRESS_BOUNDARY_UNAVAILABLE"],
]) {
  try { validateBenchmarkV3ReadinessReceipt(process.env[environmentName], { capability, sourceRoot: root }); }
  catch { reasons.push({ code, requirement: capability }); }
}
if (report !== null && candidate !== null && typeof process.env.BENCHMARK_V3_EXTERNAL_HOLDOUT_MANIFEST === "string") {
  try {
    loadSignedExternalBenchmarkV3Holdout({ sourceRoot: root,
      manifestPath: path.resolve(process.env.BENCHMARK_V3_EXTERNAL_HOLDOUT_MANIFEST),
      campaignFingerprint: report.ledger.campaign_fingerprint,
      designFingerprint: designValidation.design_fingerprint,
      finalCandidateSha: report.ledger.final_candidate_sha,
      productBundleFingerprint: candidate.product_bundle_fingerprint,
      candidateFrozenAtMs: report.final_candidate_frozen_at_ms,
      publicSourceCommits: corpus.split_assignment.entries.map((entry) => entry.source_commit),
      publicSourcePaths: corpus.families.flatMap((entry) => entry.control_surface.provenance.source_paths) });
  } catch { reasons.push({ code: "SIGNED_EXTERNAL_HOLDOUT_INVALID", requirement: "signed-private-disjoint-external-holdout-manifest" }); }
} else {
  reasons.push({ code: "SIGNED_EXTERNAL_HOLDOUT_UNAVAILABLE", requirement: "signed-private-disjoint-external-holdout-manifest" });
}
const priorExecution = report?.ledger?.events?.filter((entry) => entry.event_type === "holdout-execution").length ?? 0;
if (priorExecution !== 0) reasons.push({ code: "CONFIRMATORY_EXECUTION_ALREADY_CONSUMED", requirement: "exactly-one-holdout-execution" });
const result = { schema_version: 1, gate: "holdout-readiness", status: reasons.length === 0 ? "passed" : "blocked_environment",
  exact_campaign_resume: report !== null, validation_efficacy_passed: report?.validation_efficacy?.passed === true,
  final_candidate_frozen: report?.ledger?.final_candidate_sha !== null && report?.ledger?.final_candidate_sha !== undefined,
  confirmatory_execution_count: priorExecution, confirmatory_claim_allowed: false, model_calls: 0, candidate_tokens: 0, reasons };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (reasons.length > 0) process.exitCode = 2;
