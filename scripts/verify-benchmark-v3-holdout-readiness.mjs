#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, fingerprint } from "../lib/feedback/contracts.mjs";
import { buildBenchmarkV3ArmOrderSchedule } from "../lib/benchmark/v3-arm-order.mjs";
import { loadBenchmarkV3Corpus } from "../lib/benchmark/v3-corpus.mjs";
import { loadBenchmarkV3Design } from "../lib/benchmark/v3-design.mjs";
import { loadSignedBenchmarkV3HoldoutCommitment, loadSignedExternalBenchmarkV3Holdout } from "../lib/benchmark/v3-holdout.mjs";
import { benchmarkV3ExecutionCloneBinding, inspectBenchmarkV3HoldoutExecutionAuthority,
  loadSignedBenchmarkV3ExecutionAuthority } from "../lib/benchmark/v3-execution-authority.mjs";
import { benchmarkV3CampaignRegistryPath } from "../lib/benchmark/v3-lease-takeover.mjs";
import { validateBenchmarkV3Ledger } from "../lib/benchmark/v3-ledger.mjs";
import { verifyBenchmarkV3ProductBundle } from "../lib/benchmark/v3-runner.mjs";
import { validateBenchmarkV3ReadinessReceipt } from "../lib/benchmark/v3-readiness.mjs";
import { buildProfileBundleManifest } from "../lib/profile-v3.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function extendsDevelopmentLedger(development, current) {
  if (!development || !current || !Array.isArray(development.events) || !Array.isArray(current.events)
    || current.events.length < development.events.length) return false;
  const invariantKeys = ["schema_version", "design_fingerprint", "campaign_fingerprint", "registrations",
    "campaign_execution_id", "holdout_execution_id", "holdout_selection_commitment_fingerprint",
    "arm_order_policy_fingerprint", "public_arm_order_schedule_fingerprints", "selected_candidate_id", "final_candidate_sha"];
  return invariantKeys.every((key) => canonicalJson(current[key]) === canonicalJson(development[key]))
    && canonicalJson(current.events.slice(0, development.events.length)) === canonicalJson(development.events);
}
const { value: design, validation: designValidation } = loadBenchmarkV3Design(root);
const corpus = loadBenchmarkV3Corpus(root);
const expectedPublicArmOrderSchedules = Object.fromEntries(["development", "validation"].map((split) => [split,
  buildBenchmarkV3ArmOrderSchedule({ policy: design.arm_order_schedule, split,
    families: corpus.families.filter((entry) => entry.split === split)
      .map((entry) => ({ family_id: entry.family_id, stratum: entry.stratum })) })]));
const reasons = [];
let report = null;
let checkpoint = null;
let exactResume = false;
const output = process.env.BENCHMARK_V3_CAMPAIGN_OUTPUT;
let executionAuthority = null;
let holdoutCommitment = null;
let globalAuthorityStatus = null;
let externalHoldout = null;
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
if (report !== null) {
  try {
    const registry = JSON.parse(fs.readFileSync(benchmarkV3CampaignRegistryPath(root), "utf8"));
    if (registry?.schema_version !== 1 || !Array.isArray(registry.entries)
      || registry.registry_fingerprint !== fingerprint({ schema_version: registry.schema_version, entries: registry.entries })) {
      throw new Error("registry integrity");
    }
    const entries = registry.entries.filter((entry) => entry.campaign_fingerprint === report.ledger.campaign_fingerprint);
    checkpoint = JSON.parse(fs.readFileSync(path.join(output, "checkpoint.json"), "utf8"));
    const checkpointBody = { schema_version: checkpoint.schema_version, campaign_fingerprint: checkpoint.campaign_fingerprint,
      attempts: checkpoint.attempts, ledger: checkpoint.ledger };
    validateBenchmarkV3Ledger(checkpoint.ledger, design);
    if (entries.length !== 1 || entries[0].output_directory !== path.resolve(output)
      || !["complete", "holdout-in-progress"].includes(entries[0].status)
      || entries[0].development_report_fingerprint !== fingerprint(report)
      || checkpoint.schema_version !== 4 || checkpoint.campaign_fingerprint !== report.ledger.campaign_fingerprint
      || checkpoint.checkpoint_fingerprint !== fingerprint(checkpointBody)
      || !extendsDevelopmentLedger(report.ledger, checkpoint.ledger)
      || !Array.isArray(checkpoint.attempts) || checkpoint.attempts.some((entry) => entry.state !== "completed")
      || fs.existsSync(path.join(output, "holdout-report.json"))) {
      throw new Error("campaign was not resumed before holdout consumption");
    }
    exactResume = true;
  } catch {
    reasons.push({ code: "EXACT_CAMPAIGN_RESUME_INVALID", requirement: "registered-output-and-unused-exact-checkpoint" });
  }
}
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
    holdoutCommitment = loadSignedBenchmarkV3HoldoutCommitment({ sourceRoot: root,
      commitmentPath: path.resolve(process.env.BENCHMARK_V3_HOLDOUT_SELECTION_COMMITMENT),
      campaignExecutionId: executionAuthority.receipt.campaign_execution_id,
      holdoutExecutionId: executionAuthority.receipt.holdout_execution_id, sourceSha: prepared.source_sha,
      sourceTreeFingerprint: prepared.source_tree_fingerprint, designFingerprint: designValidation.design_fingerprint,
      corpusFingerprint: corpus.corpus_fingerprint });
  } catch { reasons.push({ code: "SIGNED_HOLDOUT_COMMITMENT_INVALID", requirement: "pre-baseline-sampling-frame-algorithm-salt-commitment" }); }
} else reasons.push({ code: "SIGNED_HOLDOUT_COMMITMENT_UNAVAILABLE", requirement: "pre-baseline-sampling-frame-algorithm-salt-commitment" });
if (report !== null && executionAuthority !== null && holdoutCommitment !== null) {
  try {
    const binding = report.campaign_binding;
    const cloneBinding = benchmarkV3ExecutionCloneBinding(root, path.resolve(output));
    if (binding?.campaign_fingerprint !== report.ledger.campaign_fingerprint
      || binding.execution_authority_fingerprint !== executionAuthority.authority_fingerprint
      || binding.campaign_execution_id !== executionAuthority.receipt.campaign_execution_id
      || binding.holdout_execution_id !== executionAuthority.receipt.holdout_execution_id
      || binding.execution_clone_binding_fingerprint !== cloneBinding.clone_binding_fingerprint
      || binding.holdout_selection_commitment_fingerprint !== holdoutCommitment.commitment_fingerprint
      || report.ledger.campaign_execution_id !== executionAuthority.receipt.campaign_execution_id
      || report.ledger.holdout_execution_id !== executionAuthority.receipt.holdout_execution_id
      || report.ledger.holdout_selection_commitment_fingerprint !== holdoutCommitment.commitment_fingerprint
      || binding.model_binding?.arm_order_policy_fingerprint !== report.ledger.arm_order_policy_fingerprint
      || canonicalJson(binding.model_binding?.public_arm_order_schedule_fingerprints)
        !== canonicalJson(report.ledger.public_arm_order_schedule_fingerprints)
      || canonicalJson(binding.arm_order_schedules) !== canonicalJson(expectedPublicArmOrderSchedules)) throw new Error("campaign binding mismatch");
    validateBenchmarkV3Ledger(report.ledger, design, {
      development: expectedPublicArmOrderSchedules.development.schedule_fingerprint,
      validation: expectedPublicArmOrderSchedules.validation.schedule_fingerprint,
      holdout: null,
    });
    globalAuthorityStatus = inspectBenchmarkV3HoldoutExecutionAuthority({ authority: executionAuthority,
      campaignFingerprint: binding.campaign_fingerprint, cloneBinding });
  } catch {
    globalAuthorityStatus = null;
    reasons.push({ code: "SIGNED_EXECUTION_CAMPAIGN_BINDING_MISMATCH",
      requirement: "exact-report-ledger-authority-commitment-and-external-registry-binding" });
  }
}
let candidate = null;
if (typeof process.env.BENCHMARK_V3_CANDIDATE_BUNDLE !== "string") {
  reasons.push({ code: "FROZEN_CANDIDATE_BUNDLE_UNAVAILABLE", requirement: "exact-frozen-product-bundle" });
} else {
  try {
    candidate = verifyBenchmarkV3ProductBundle(root, path.resolve(process.env.BENCHMARK_V3_CANDIDATE_BUNDLE));
    if (report !== null && (candidate.source_sha !== report.ledger.final_candidate_sha
      || candidate.product_bundle_fingerprint !== report.product_bundle_fingerprint
      || report.campaign_binding?.campaign_fingerprint !== report.ledger.campaign_fingerprint
      || report.campaign_binding?.source_sha !== candidate.source_sha
      || report.campaign_binding?.source_tree_fingerprint !== buildProfileBundleManifest(root, "lab").manifest.source_tree_fingerprint
      || report.campaign_binding?.bindings_fingerprint !== fingerprint(report.campaign_binding?.model_binding))) {
      throw new Error("candidate or exact campaign binding drift");
    }
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
if (report !== null && candidate !== null && executionAuthority !== null && holdoutCommitment !== null
  && typeof process.env.BENCHMARK_V3_EXTERNAL_HOLDOUT_MANIFEST === "string") {
  try {
    externalHoldout = loadSignedExternalBenchmarkV3Holdout({ sourceRoot: root,
      manifestPath: path.resolve(process.env.BENCHMARK_V3_EXTERNAL_HOLDOUT_MANIFEST),
      campaignFingerprint: report.ledger.campaign_fingerprint,
      designFingerprint: designValidation.design_fingerprint,
      finalCandidateSha: report.ledger.final_candidate_sha,
      productBundleFingerprint: candidate.product_bundle_fingerprint,
      candidateFrozenAtMs: report.final_candidate_frozen_at_ms,
      campaignExecutionId: executionAuthority.receipt.campaign_execution_id,
      holdoutExecutionId: executionAuthority.receipt.holdout_execution_id,
      holdoutCommitment, armOrderPolicy: design.arm_order_schedule,
      publicSourceCommits: corpus.split_assignment.entries.map((entry) => entry.source_commit),
      publicSourcePaths: corpus.families.flatMap((entry) => entry.control_surface.provenance.source_paths) });
    const expectedSchedules = { development: report.campaign_binding.arm_order_schedules.development.schedule_fingerprint,
      validation: report.campaign_binding.arm_order_schedules.validation.schedule_fingerprint,
      holdout: externalHoldout.manifest.arm_order_schedule.schedule_fingerprint };
    if (checkpoint?.ledger?.holdout_arm_order_schedule_fingerprint !== null) {
      validateBenchmarkV3Ledger(checkpoint.ledger, design, expectedSchedules);
    }
  } catch { reasons.push({ code: "SIGNED_EXTERNAL_HOLDOUT_INVALID", requirement: "signed-private-disjoint-external-holdout-manifest" }); }
} else {
  reasons.push({ code: "SIGNED_EXTERNAL_HOLDOUT_UNAVAILABLE", requirement: "signed-private-disjoint-external-holdout-manifest" });
}
const priorExecution = checkpoint?.ledger?.events?.filter((entry) => entry.event_type === "holdout-execution").length
  ?? report?.ledger?.events?.filter((entry) => entry.event_type === "holdout-execution").length ?? 0;
const priorHoldoutReport = typeof output === "string" && path.isAbsolute(output)
  && fs.existsSync(path.join(output, "holdout-report.json"));
const priorHoldoutAttempt = checkpoint?.attempts?.some((entry) => /^v3-external-holdout-/u.test(entry.family_id ?? "")) === true;
const exactHoldoutResume = globalAuthorityStatus?.holdout_status === "exact-resume" && priorHoldoutAttempt && !priorHoldoutReport;
if (priorExecution !== 0 || priorHoldoutReport || (priorHoldoutAttempt && !exactHoldoutResume)) reasons.push({ code: "CONFIRMATORY_EXECUTION_ALREADY_CONSUMED",
  requirement: "zero-prior-holdout-attempts-and-exactly-one-confirmatory-execution" });
const result = { schema_version: 1, gate: "holdout-readiness", status: reasons.length === 0 ? "passed" : "blocked_environment",
  exact_campaign_resume: exactResume, global_execution_authority_status: globalAuthorityStatus,
  exact_holdout_resume: exactHoldoutResume, validation_efficacy_passed: report?.validation_efficacy?.passed === true,
  final_candidate_frozen: report?.ledger?.final_candidate_sha !== null && report?.ledger?.final_candidate_sha !== undefined,
  confirmatory_execution_count: priorExecution, confirmatory_claim_allowed: false, model_calls: 0, candidate_tokens: 0, reasons };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (reasons.length > 0) process.exitCode = 2;
