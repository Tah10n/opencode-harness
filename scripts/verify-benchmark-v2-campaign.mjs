import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildBenchmarkV2CampaignPlan,
  evaluateExactFamilyClusterPermutation,
  evaluateBenchmarkV2MechanismActivation,
  executeBenchmarkV2Acceptance,
  executeBenchmarkV2Campaign,
  validateBenchmarkV2CampaignReport,
} from "../lib/benchmark/v2-campaign.mjs";
import { fingerprintProfileValue } from "../lib/profile-v3.mjs";
import { parsePromptFrontmatter } from "../lib/quality/prompt-inventory.mjs";
import {
  cleanupSyntheticProfile,
  materializeVnextSyntheticProfile,
} from "../lib/benchmark/profiles.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executableFingerprint = `sha256:${"a".repeat(64)}`;
const exactPair = (familyId, baseline, candidate) => ({
  family_id: familyId,
  defects: {
    baseline: { regression_free_task_success: baseline },
    candidate: { regression_free_task_success: candidate },
  },
});
const clusteredExact = evaluateExactFamilyClusterPermutation([
  exactPair("family-a", false, true),
  exactPair("family-a", false, true),
  exactPair("family-b", false, true),
  exactPair("family-b", true, false),
]);
assert.deepEqual(clusteredExact, {
  family_count: 2,
  nonzero_family_cluster_count: 1,
  observed_family_difference_sum: 2,
  p_value: 0.5,
});
const sevenToOne = evaluateExactFamilyClusterPermutation([
  ...Array.from({ length: 7 }, (_, index) => exactPair(`candidate-${index}`, false, true)),
  exactPair("baseline-only", true, false),
]);
assert.equal(sevenToOne.p_value, 0.03515625);
const reviewerFreeActivationCandidate = {
  activation: {
    host_verification: { activation_eligible: true, activated: true },
    bounded_context: { eligible: true, activated: true },
    visible_contract: { eligible: true, activated: true },
    verification_remediation: { eligible: false, retry_started_count: 0 },
  },
};
assert.deepEqual(evaluateBenchmarkV2MechanismActivation(
  "reviewer-free-exact-core-candidate",
  reviewerFreeActivationCandidate,
  "medium",
), { eligible: true, activated: true });
assert.deepEqual(evaluateBenchmarkV2MechanismActivation(
  "scenario-typed-visible-contract-exact-core-candidate",
  reviewerFreeActivationCandidate,
  "high",
), { eligible: true, activated: true });
assert.deepEqual(evaluateBenchmarkV2MechanismActivation(
  "public-check-failure-only-transactional-candidate",
  {
    activation: {
      verification_remediation: {
        eligible: true,
        operationally_complete: true,
        trigger_reasons: ["risk-gated-specialized-visible-contract", "public-check-failed"],
        rollback_attempted_count: 1,
        rollback_completed_count: 1,
      },
    },
  },
  "high",
), { eligible: true, activated: true });
assert.deepEqual(evaluateBenchmarkV2MechanismActivation(
  "public-check-failure-only-transactional-candidate",
  {
    activation: {
      verification_remediation: {
        eligible: false,
        operationally_complete: true,
        trigger_reasons: [],
        rollback_attempted_count: 0,
        rollback_completed_count: 0,
      },
    },
  },
  "high",
), { eligible: false, activated: false });
assert.deepEqual(evaluateBenchmarkV2MechanismActivation(
  "public-check-failure-only-transactional-candidate",
  {
    activation: {
      verification_remediation: {
        eligible: true,
        operationally_complete: false,
        trigger_reasons: ["risk-gated-specialized-visible-contract", "public-check-failed"],
        rollback_attempted_count: 1,
        rollback_completed_count: 0,
      },
    },
  },
  "high",
), { eligible: true, activated: false });
assert.deepEqual(evaluateBenchmarkV2MechanismActivation(
  "secret-mutation-guard-candidate",
  { activation: { secret_mutation_guard: { eligible: true, activated: true, denied_count: 1 } } },
  "high",
), { eligible: true, activated: true });
assert.equal(evaluateBenchmarkV2MechanismActivation(
  "reviewer-free-exact-core-candidate",
  {
    activation: {
      ...reviewerFreeActivationCandidate.activation,
      verification_remediation: { eligible: true, retry_started_count: 1 },
    },
  },
  "high",
).activated, false);
const plainProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P0" });
const isolatedVerificationProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P6" });
const isolatedReviewerProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P8" });
const verificationRemediationProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P9" });
const diffGuidedVerificationRemediationProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P10" });
const retryContextProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P11" });
const checkAddressedProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P12" });
const diagnosticGuidedProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P13" });
const visibleContractProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P14" });
const riskGatedContractProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P15" });
const multiTargetContractProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P16" });
const specializedContractProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P17" });
const stratifiedCoreProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P18" });
const riskGatedSpecializedProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P19" });
const coreV2ProductionProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P20" });
const coreV2ExactCoordinatorProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P21" });
const coreV2AdversarialAuditProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P22" });
const coreV2BoundedContextProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P23" });
const coreV2TransactionalProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P24" });
const contractFirstProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P25" });
const hostCompiledContractProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P26" });
const stratifiedVisibleContractProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P27" });
const manifestTransactionalAuditProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P28" });
const evidenceGatedManifestAuditProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P29" });
const manifestRiskGatedAuditProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P30" });
const criticalManifestRiskAuditProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P31" });
const reviewerFreeExactCoreProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P32" });
const scenarioTypedVisibleContractProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P33" });
const publicCheckFailureOnlyProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P34" });
const secretMutationGuardProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P35" });
try {
  assert.equal(plainProfile.primaryAgentId, "build");
  assert.equal(isolatedVerificationProfile.primaryAgentId, "build");
  assert.deepEqual(isolatedVerificationProfile.profileEvidence.component_ids, ["targeted-verification"]);
  assert.deepEqual(
    isolatedVerificationProfile.profileEvidence.runtime_surface.effective_config,
    plainProfile.profileEvidence.runtime_surface.effective_config,
  );
  assert.deepEqual(
    retryContextProfile.profileEvidence.component_ids,
    ["targeted-verification", "diff-guided-verification-remediation", "retry-bounded-context"],
  );
  assert.deepEqual(
    retryContextProfile.profileEvidence.runtime_surface.materialized_files.map((entry) => entry.path),
    [
      "runtime/host/bounded-repository-map.mjs",
      "runtime/host/core-verification-gate.mjs",
      "runtime/host/verification-remediation-gate.mjs",
    ],
  );
  assert.deepEqual(
    checkAddressedProfile.profileEvidence.component_ids,
    ["targeted-verification", "check-addressed-verification-remediation"],
  );
  assert.deepEqual(
    diagnosticGuidedProfile.profileEvidence.component_ids,
    ["targeted-verification", "diagnostic-guided-verification-remediation"],
  );
  assert.deepEqual(
    visibleContractProfile.profileEvidence.component_ids,
    ["targeted-verification", "visible-contract-remediation"],
  );
  assert.deepEqual(
    riskGatedContractProfile.profileEvidence.component_ids,
    ["targeted-verification", "risk-gated-visible-contract-remediation"],
  );
  assert.deepEqual(
    multiTargetContractProfile.profileEvidence.component_ids,
    ["targeted-verification", "multi-target-visible-contract-remediation"],
  );
  assert.deepEqual(
    specializedContractProfile.profileEvidence.component_ids,
    ["targeted-verification", "specialized-visible-contract-remediation"],
  );
  assert.equal(
    specializedContractProfile.profileEvidence.runtime_surface.materialized_files
      .some((entry) => entry.path === "agents/contract-auditor.md"),
    true,
  );
  assert.deepEqual(
    coreV2TransactionalProfile.profileEvidence.component_ids,
    ["targeted-verification", "bounded-pre-mutation-context", "risk-gated-specialized-visible-contract-remediation", "exact-core-v2-coordinator", "adversarial-counterexample-audit", "transactional-remediation-rollback"],
  );
  assert.equal(contractFirstProfile.primaryAgentId, "core-v2-build");
  assert.deepEqual(
    contractFirstProfile.profileEvidence.component_ids,
    ["contract-first-primary", "targeted-verification", "bounded-pre-mutation-context"],
  );
  assert.equal(hostCompiledContractProfile.primaryAgentId, "core-v3-build");
  assert.deepEqual(
    hostCompiledContractProfile.profileEvidence.component_ids,
    ["host-compiled-visible-contract", "targeted-verification", "bounded-pre-mutation-context"],
  );
  assert.equal(stratifiedVisibleContractProfile.primaryAgentId, "build");
  assert.deepEqual(
    stratifiedVisibleContractProfile.profileEvidence.component_ids,
    ["stratified-host-compiled-small", "targeted-verification", "bounded-pre-mutation-context", "risk-gated-specialized-visible-contract-remediation", "exact-core-v2-coordinator", "adversarial-counterexample-audit"],
  );
  assert.equal(manifestTransactionalAuditProfile.primaryAgentId, "core-v3-build");
  assert.deepEqual(
    manifestTransactionalAuditProfile.profileEvidence.component_ids,
    ["host-compiled-visible-contract", "targeted-verification", "bounded-pre-mutation-context", "risk-gated-specialized-visible-contract-remediation", "exact-core-v2-coordinator", "adversarial-counterexample-audit", "transactional-remediation-rollback"],
  );
  assert.equal(
    manifestTransactionalAuditProfile.profileEvidence.runtime_surface.materialized_files
      .some((entry) => entry.path === "runtime/host/visible-contract-manifest.mjs"),
    true,
  );
  assert.equal(evidenceGatedManifestAuditProfile.primaryAgentId, "core-v3-build");
  assert.deepEqual(
    evidenceGatedManifestAuditProfile.profileEvidence.component_ids,
    ["host-compiled-visible-contract", "targeted-verification", "bounded-pre-mutation-context", "public-evidence-gated-specialized-remediation", "exact-core-v2-coordinator", "adversarial-counterexample-audit", "transactional-remediation-rollback"],
  );
  assert.equal(manifestRiskGatedAuditProfile.primaryAgentId, "core-v3-build");
  assert.deepEqual(
    manifestRiskGatedAuditProfile.profileEvidence.component_ids,
    ["host-compiled-visible-contract", "targeted-verification", "bounded-pre-mutation-context", "manifest-risk-gated-specialized-remediation", "exact-core-v2-coordinator", "adversarial-counterexample-audit", "transactional-remediation-rollback"],
  );
  assert.equal(criticalManifestRiskAuditProfile.primaryAgentId, "core-v3-build");
  assert.deepEqual(
    criticalManifestRiskAuditProfile.profileEvidence.component_ids,
    ["host-compiled-visible-contract", "targeted-verification", "bounded-pre-mutation-context", "critical-manifest-risk-gated-remediation", "exact-core-v2-coordinator", "adversarial-counterexample-audit", "transactional-remediation-rollback"],
  );
  assert.equal(reviewerFreeExactCoreProfile.primaryAgentId, "core-v3-build");
  assert.deepEqual(
    reviewerFreeExactCoreProfile.profileEvidence.component_ids,
    ["host-compiled-visible-contract", "targeted-verification", "bounded-pre-mutation-context", "exact-core-v2-coordinator", "reviewer-remediation-removed"],
  );
  assert.equal(
    reviewerFreeExactCoreProfile.profileEvidence.runtime_surface.materialized_files
      .some((entry) => entry.path === "agents/contract-auditor.md"),
    false,
  );
  assert.equal(scenarioTypedVisibleContractProfile.primaryAgentId, "core-v4-build");
  assert.deepEqual(
    scenarioTypedVisibleContractProfile.profileEvidence.component_ids,
    ["scenario-typed-visible-contract", "targeted-verification", "bounded-pre-mutation-context", "exact-core-v2-coordinator", "reviewer-remediation-removed"],
  );
  assert.equal(
    scenarioTypedVisibleContractProfile.profileEvidence.runtime_surface.materialized_files
      .some((entry) => entry.path === "agents/contract-auditor.md"),
    false,
  );
  assert.equal(publicCheckFailureOnlyProfile.primaryAgentId, "core-v4-build");
  assert.deepEqual(
    publicCheckFailureOnlyProfile.profileEvidence.component_ids,
    ["scenario-typed-visible-contract", "targeted-verification", "bounded-pre-mutation-context", "exact-core-v2-coordinator", "public-check-failure-only-remediation", "transactional-remediation-rollback"],
  );
  assert.equal(
    publicCheckFailureOnlyProfile.profileEvidence.runtime_surface.materialized_files
      .some((entry) => entry.path === "agents/contract-auditor.md"),
    true,
  );
  assert.deepEqual(secretMutationGuardProfile.profileEvidence.component_ids, [
    "scenario-typed-visible-contract",
    "targeted-verification",
    "bounded-pre-mutation-context",
    "exact-core-v2-coordinator",
    "secret-mutation-guard",
  ]);
  assert.equal(secretMutationGuardProfile.primaryAgentId, "core-v5-build");
  assert.equal(
    secretMutationGuardProfile.profileEvidence.runtime_surface.materialized_files
      .some((entry) => entry.path.endsWith("opencode-mutation-path-guard-plugin.mjs")),
    true,
  );
  assert.deepEqual(
    stratifiedCoreProfile.profileEvidence.component_ids,
    ["compact-small-core-rules", "targeted-verification", "specialized-visible-contract-remediation"],
  );
  assert.deepEqual(
    stratifiedCoreProfile.profileEvidence.runtime_surface.materialized_files
      .filter((entry) => entry.path.startsWith("agents/"))
      .map((entry) => entry.path),
    ["agents/contract-auditor.md", "agents/vnext-small-core.md"],
  );
  assert.deepEqual(
    riskGatedSpecializedProfile.profileEvidence.component_ids,
    ["targeted-verification", "risk-gated-specialized-visible-contract-remediation"],
  );
  assert.equal(
    riskGatedSpecializedProfile.profileEvidence.runtime_surface.materialized_files
      .some((entry) => entry.path === "agents/contract-auditor.md"),
    true,
  );
  assert.deepEqual(
    coreV2ProductionProfile.profileEvidence.component_ids,
    ["targeted-verification", "risk-gated-specialized-visible-contract-remediation"],
  );
  assert.equal(coreV2ProductionProfile.primaryAgentId, "build");
  assert.equal(coreV2ProductionProfile.profileEvidence.runtime_surface.effective_config.default_agent, "build");
  assert.equal(
    coreV2ProductionProfile.profileEvidence.runtime_surface.materialized_files
      .some((entry) => entry.path === "runtime/host/core-v2-coordinator.mjs"),
    true,
  );
  assert.deepEqual(
    coreV2ExactCoordinatorProfile.profileEvidence.component_ids,
    ["targeted-verification", "risk-gated-specialized-visible-contract-remediation", "exact-core-v2-coordinator"],
  );
  assert.equal(coreV2ExactCoordinatorProfile.primaryAgentId, "build");
  assert.equal(
    coreV2ExactCoordinatorProfile.profileEvidence.runtime_surface.materialized_files
      .some((entry) => entry.path === "runtime/host/core-v2-coordinator.mjs"),
    true,
  );
  assert.deepEqual(
    coreV2AdversarialAuditProfile.profileEvidence.component_ids,
    ["targeted-verification", "risk-gated-specialized-visible-contract-remediation", "exact-core-v2-coordinator", "adversarial-counterexample-audit"],
  );
  assert.deepEqual(
    coreV2BoundedContextProfile.profileEvidence.component_ids,
    ["targeted-verification", "bounded-pre-mutation-context", "risk-gated-specialized-visible-contract-remediation", "exact-core-v2-coordinator", "adversarial-counterexample-audit"],
  );
  assert.equal(
    coreV2BoundedContextProfile.profileEvidence.runtime_surface.materialized_files
      .some((entry) => entry.path === "runtime/host/bounded-repository-map.mjs"),
    true,
  );
  assert.deepEqual(
    isolatedVerificationProfile.profileEvidence.runtime_surface.materialized_files.map((entry) => entry.path),
    ["runtime/host/core-verification-gate.mjs"],
  );
  assert.equal(
    isolatedVerificationProfile.profileEvidence.source_entries.some((entry) => entry.source_path === "agents/core.md"),
    false,
  );
  assert.equal(isolatedReviewerProfile.primaryAgentId, "build");
  assert.deepEqual(
    isolatedReviewerProfile.profileEvidence.component_ids,
    ["targeted-verification", "independent-final-review"],
  );
  assert.deepEqual(
    isolatedReviewerProfile.profileEvidence.runtime_surface.effective_config,
    isolatedVerificationProfile.profileEvidence.runtime_surface.effective_config,
  );
  assert.deepEqual(
    isolatedReviewerProfile.profileEvidence.runtime_surface.materialized_files.map((entry) => entry.path),
    [
      "agents/core-reviewer.md",
      "runtime/host/automatic-review-gate.mjs",
      "runtime/host/core-verification-gate.mjs",
    ],
  );
  assert.equal(
    isolatedReviewerProfile.profileEvidence.source_entries.some((entry) => entry.source_path === "agents/core.md"),
    false,
  );
  const reviewerSource = fs.readFileSync(
    path.join(isolatedReviewerProfile.configDirectory, "agents", "core-reviewer.md"),
    "utf8",
  );
  const reviewerFrontmatter = parsePromptFrontmatter(
    reviewerSource,
    "agents/core-reviewer.md",
  ).frontmatter;
  assert.equal(reviewerFrontmatter.permission.bash, "deny");
  assert.equal(verificationRemediationProfile.primaryAgentId, "build");
  assert.deepEqual(
    verificationRemediationProfile.profileEvidence.component_ids,
    ["targeted-verification", "verification-remediation"],
  );
  assert.deepEqual(
    verificationRemediationProfile.profileEvidence.runtime_surface.materialized_files.map((entry) => entry.path),
    [
      "runtime/host/core-verification-gate.mjs",
      "runtime/host/verification-remediation-gate.mjs",
    ],
  );
  assert.equal(diffGuidedVerificationRemediationProfile.primaryAgentId, "build");
  assert.deepEqual(
    diffGuidedVerificationRemediationProfile.profileEvidence.component_ids,
    ["targeted-verification", "diff-guided-verification-remediation"],
  );
  assert.deepEqual(
    diffGuidedVerificationRemediationProfile.profileEvidence.runtime_surface.materialized_files.map((entry) => entry.path),
    [
      "runtime/host/core-verification-gate.mjs",
      "runtime/host/verification-remediation-gate.mjs",
    ],
  );
} finally {
  cleanupSyntheticProfile(plainProfile);
  cleanupSyntheticProfile(isolatedVerificationProfile);
  cleanupSyntheticProfile(isolatedReviewerProfile);
  cleanupSyntheticProfile(verificationRemediationProfile);
  cleanupSyntheticProfile(diffGuidedVerificationRemediationProfile);
  cleanupSyntheticProfile(retryContextProfile);
  cleanupSyntheticProfile(checkAddressedProfile);
  cleanupSyntheticProfile(diagnosticGuidedProfile);
  cleanupSyntheticProfile(visibleContractProfile);
  cleanupSyntheticProfile(riskGatedContractProfile);
  cleanupSyntheticProfile(multiTargetContractProfile);
  cleanupSyntheticProfile(specializedContractProfile);
  cleanupSyntheticProfile(stratifiedCoreProfile);
  cleanupSyntheticProfile(riskGatedSpecializedProfile);
  cleanupSyntheticProfile(coreV2ProductionProfile);
  cleanupSyntheticProfile(coreV2ExactCoordinatorProfile);
  cleanupSyntheticProfile(coreV2AdversarialAuditProfile);
  cleanupSyntheticProfile(coreV2BoundedContextProfile);
  cleanupSyntheticProfile(coreV2TransactionalProfile);
  cleanupSyntheticProfile(contractFirstProfile);
  cleanupSyntheticProfile(hostCompiledContractProfile);
  cleanupSyntheticProfile(stratifiedVisibleContractProfile);
  cleanupSyntheticProfile(manifestTransactionalAuditProfile);
  cleanupSyntheticProfile(evidenceGatedManifestAuditProfile);
  cleanupSyntheticProfile(manifestRiskGatedAuditProfile);
  cleanupSyntheticProfile(criticalManifestRiskAuditProfile);
  cleanupSyntheticProfile(reviewerFreeExactCoreProfile);
  cleanupSyntheticProfile(scenarioTypedVisibleContractProfile);
  cleanupSyntheticProfile(publicCheckFailureOnlyProfile);
  cleanupSyntheticProfile(secretMutationGuardProfile);
}
const plan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-1",
  baselineArmId: "P0",
  candidateArmId: "P6",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});

assert.equal(plan.schedules.length, 36);
assert.equal(plan.bindings.baseline_profile_fingerprint, plainProfile.profileFingerprint);
assert.equal(plan.bindings.candidate_profile_fingerprint, isolatedVerificationProfile.profileFingerprint);
assert.equal(plan.component_id, "targeted-verification");
assert.deepEqual([...new Set(plan.schedules.map((entry) => entry.stratum))].sort(), ["high", "medium", "small"]);
assert.equal(new Set(plan.schedules.map((entry) => entry.pair_id)).size, 36);
const reviewerPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-reviewer-1",
  baselineArmId: "P6",
  candidateArmId: "P8",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(reviewerPlan.component_id, "independent-final-review");
assert.equal(reviewerPlan.schedules.length, 36);
const retryPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-retry-1",
  baselineArmId: "P6",
  candidateArmId: "P9",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(retryPlan.component_id, "verification-remediation");
assert.equal(retryPlan.schedules.length, 36);
const diffGuidedRetryPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-diff-guided-retry-1",
  baselineArmId: "P6",
  candidateArmId: "P10",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(diffGuidedRetryPlan.component_id, "verification-remediation");
assert.equal(diffGuidedRetryPlan.schedules.length, 36);
const retryContextPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-retry-context-1",
  baselineArmId: "P10",
  candidateArmId: "P11",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(retryContextPlan.component_id, "retry-bounded-context");
const checkAddressedPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-check-addressed-1",
  baselineArmId: "P10",
  candidateArmId: "P12",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(checkAddressedPlan.component_id, "verification-remediation");
const diagnosticGuidedPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-diagnostic-guided-1",
  baselineArmId: "P10",
  candidateArmId: "P13",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(diagnosticGuidedPlan.component_id, "diagnostic-guided-verification-remediation");
const visibleContractPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-visible-contract-1",
  baselineArmId: "P6",
  candidateArmId: "P14",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(visibleContractPlan.component_id, "visible-contract-remediation");
const riskGatedContractPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-risk-gated-contract-1",
  baselineArmId: "P6",
  candidateArmId: "P15",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(riskGatedContractPlan.component_id, "risk-gated-visible-contract-remediation");
const riskGatedCompositePlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-risk-gated-composite-1",
  baselineArmId: "P0",
  candidateArmId: "P15",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(riskGatedCompositePlan.component_id, "verified-risk-gated-contract-candidate");
const multiTargetContractPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-multi-target-contract-1",
  baselineArmId: "P15",
  candidateArmId: "P16",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(multiTargetContractPlan.component_id, "multi-target-contract-expansion");
const multiTargetCompositePlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-multi-target-composite-1",
  baselineArmId: "P0",
  candidateArmId: "P16",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(multiTargetCompositePlan.component_id, "verified-multi-target-contract-candidate");
const specializedContractPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-specialized-contract-1",
  baselineArmId: "P6",
  candidateArmId: "P17",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(specializedContractPlan.component_id, "specialized-visible-contract-remediation");
const specializedCompositePlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-specialized-composite-1",
  baselineArmId: "P0",
  candidateArmId: "P17",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(specializedCompositePlan.component_id, "verified-specialized-contract-candidate");
const stratifiedCorePlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-stratified-core-1",
  baselineArmId: "P0",
  candidateArmId: "P18",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(stratifiedCorePlan.component_id, "stratified-core-candidate");
const riskGatedSpecializedPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-risk-gated-specialized-1",
  baselineArmId: "P6",
  candidateArmId: "P19",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(riskGatedSpecializedPlan.component_id, "risk-gated-specialized-visible-contract-remediation");
const riskGatedSpecializedCompositePlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-risk-gated-specialized-composite-1",
  baselineArmId: "P0",
  candidateArmId: "P19",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(riskGatedSpecializedCompositePlan.component_id, "verified-risk-gated-specialized-contract-candidate");
const coreV2ProductionPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-core-v2-production-1",
  baselineArmId: "P0",
  candidateArmId: "P20",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(coreV2ProductionPlan.component_id, "core-v2-production-candidate");
const coreV2ExactCoordinatorPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-core-v2-exact-coordinator-1",
  baselineArmId: "P0",
  candidateArmId: "P21",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(coreV2ExactCoordinatorPlan.component_id, "core-v2-exact-coordinator-candidate");
const coreV2AdversarialAuditPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-core-v2-adversarial-audit-1",
  baselineArmId: "P0",
  candidateArmId: "P22",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(coreV2AdversarialAuditPlan.component_id, "core-v2-adversarial-audit-candidate");
const coreV2BoundedContextPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-core-v2-bounded-context-1",
  baselineArmId: "P0",
  candidateArmId: "P23",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(coreV2BoundedContextPlan.component_id, "core-v2-bounded-context-candidate");
const coreV2TransactionalPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-core-v2-transactional-1",
  baselineArmId: "P0",
  candidateArmId: "P24",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(coreV2TransactionalPlan.component_id, "core-v2-transactional-candidate");
const contractFirstPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-contract-first-1",
  baselineArmId: "P0",
  candidateArmId: "P25",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(contractFirstPlan.component_id, "contract-first-verified-context-candidate");
const hostCompiledContractPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-host-compiled-contract-1",
  baselineArmId: "P0",
  candidateArmId: "P26",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(hostCompiledContractPlan.component_id, "host-compiled-visible-contract-candidate");
const stratifiedVisibleContractPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-stratified-visible-contract-1",
  baselineArmId: "P0",
  candidateArmId: "P27",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(stratifiedVisibleContractPlan.component_id, "stratified-visible-contract-audit-candidate");
const manifestTransactionalAuditPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-manifest-transactional-audit-1",
  baselineArmId: "P0",
  candidateArmId: "P28",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(manifestTransactionalAuditPlan.component_id, "manifest-transactional-audit-candidate");
const evidenceGatedManifestAuditPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-evidence-gated-manifest-audit-1",
  baselineArmId: "P0",
  candidateArmId: "P29",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(evidenceGatedManifestAuditPlan.component_id, "evidence-gated-manifest-audit-candidate");
const manifestRiskGatedAuditPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-manifest-risk-gated-audit-1",
  baselineArmId: "P0",
  candidateArmId: "P30",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(manifestRiskGatedAuditPlan.component_id, "manifest-risk-gated-audit-candidate");
const criticalManifestRiskAuditPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-critical-manifest-risk-audit-1",
  baselineArmId: "P0",
  candidateArmId: "P31",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(criticalManifestRiskAuditPlan.component_id, "critical-manifest-risk-audit-candidate");
const reviewerFreeExactCorePlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-reviewer-free-exact-core-1",
  baselineArmId: "P0",
  candidateArmId: "P32",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(reviewerFreeExactCorePlan.component_id, "reviewer-free-exact-core-candidate");
assert.equal(reviewerFreeExactCorePlan.bindings.candidate_profile_fingerprint, reviewerFreeExactCoreProfile.profileFingerprint);
const reviewerFreeRenamedGenerationPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-reviewer-free-exact-core-renamed",
  baselineArmId: "P0",
  candidateArmId: "P32",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.notEqual(reviewerFreeRenamedGenerationPlan.generation_id, reviewerFreeExactCorePlan.generation_id);
assert.equal(
  reviewerFreeRenamedGenerationPlan.bindings.candidate_profile_fingerprint,
  reviewerFreeExactCorePlan.bindings.candidate_profile_fingerprint,
);
const scenarioTypedVisibleContractPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-scenario-typed-visible-contract-1",
  baselineArmId: "P0",
  candidateArmId: "P33",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(scenarioTypedVisibleContractPlan.component_id, "scenario-typed-visible-contract-exact-core-candidate");
assert.equal(
  scenarioTypedVisibleContractPlan.bindings.candidate_profile_fingerprint,
  scenarioTypedVisibleContractProfile.profileFingerprint,
);
const publicCheckFailureOnlyPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-public-check-failure-only-1",
  baselineArmId: "P0",
  candidateArmId: "P34",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(publicCheckFailureOnlyPlan.component_id, "public-check-failure-only-transactional-candidate");
assert.equal(
  publicCheckFailureOnlyPlan.bindings.candidate_profile_fingerprint,
  publicCheckFailureOnlyProfile.profileFingerprint,
);
const secretMutationGuardPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-secret-mutation-guard-1",
  baselineArmId: "P0",
  candidateArmId: "P35",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(secretMutationGuardPlan.component_id, "secret-mutation-guard-candidate");
assert.throws(() => buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "validation",
  generationId: "generation-fixture-1",
  baselineArmId: "P0",
  candidateArmId: "P6",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  seed: "campaign-fixture-seed",
  executableIdentity: executableFingerprint,
  allowDirty: true,
}), /BENCHMARK_V2_VALIDATION_USE/u);

function check(passed, violation = null) {
  return { status: passed ? "passed" : "failed", passed, violations: violation === null ? [] : [violation] };
}

function binding(instance) {
  return Object.freeze({
    public_fixture_fingerprint: instance.public_fixture_fingerprint,
    hidden_fixture_fingerprint: instance.hidden_fixture_fingerprint,
    task_scope_fingerprint: fingerprintProfileValue(instance.task_scope),
    effective_public_input_fingerprint: fingerprintProfileValue({ prompt: instance.prompt, public: instance.public_fixture_fingerprint }),
    initial_public_manifest_fingerprint: fingerprintProfileValue(instance.public_files),
    model_fingerprint: fingerprintProfileValue("fixture/model"),
    executable_fingerprint: null,
    executable_version: "fixture",
    executable_basename: null,
    executable_platform: null,
    executable_identity_policy_version: null,
    timeout_ms: 300_000,
    limits_fingerprint: fingerprintProfileValue("limits"),
    adapter_protocol_version: 20,
  });
}

async function fakeAttempt({ instance, profileId }) {
  const ordinal = Number.parseInt(createHash(instance.family_id).slice(0, 2), 16);
  const baselineFailure = ordinal % 4 === 0;
  const success = ["P6", "P8", "P9", "P10", "P11", "P12", "P13", "P14", "P15", "P16", "P17", "P18", "P19", "P20", "P34", "P35"].includes(profileId) ? true : !baselineFailure;
  const passed = check(true);
  const hidden = success ? passed : check(false, "hidden-contract");
  const result = {
    profile_id: profileId,
    execution_status: "completed",
    termination_reason: "verified",
    reason: null,
    evidence_complete: true,
    visible_check: passed,
    hidden_check: hidden,
    workspace_policy: passed,
    common_safety: passed,
    teardown: passed,
    cleanup: passed,
    hidden_safety_failed: !success,
    metrics: {
      duration_ms: profileId === "P6" ? 150 : 100,
      total_tool_call_count: 2,
      task_action_call_count: 2,
      computational_control_call_count: 0,
      context_read_count: 1,
      model_turn_count: 1,
      continuation_turn_count: 0,
    },
    vnext_host_verification_observation: { activation_eligible: true, activated: true, allowed: true },
    vnext_automatic_review_observation: profileId === "P8" ? {
      eligible: true,
      review_required_count: 1,
      review_started_count: 1,
      review_completed_count: 1,
      review_finding_count: 0,
      reviewer_caused_fix_count: 0,
      operationally_complete: true,
      terminal_allowed: true,
    } : null,
    vnext_verification_remediation_observation: ["P9", "P10", "P11", "P12", "P13", "P14", "P15", "P16", "P17", "P18", "P19", "P20", "P34"].includes(profileId) ? {
      eligible: true,
      retry_required_count: 1,
      retry_started_count: 1,
      retry_completed_count: 1,
      retry_changed_count: 1,
      retry_reverified_count: 1,
      retry_verification_passed_count: 1,
      operationally_complete: true,
      trigger_reasons: profileId === "P34"
        ? ["risk-gated-specialized-visible-contract", "public-check-failed"]
        : profileId === "P16"
        ? ["multi-target"]
        : ["P19", "P20"].includes(profileId) ? ["risk-gated-specialized-visible-contract", "high-risk"]
        : ["P17", "P18"].includes(profileId) ? ["specialized-visible-contract"] : ["fixture-trigger"],
    } : null,
    vnext_secret_mutation_guard_observation: profileId === "P35" ? {
      eligible: true,
      activated: true,
      denied_count: 0,
      reason: "runtime_guard_bound",
    } : null,
    vnext_context_map_observation: profileId === "P11" ? {
      eligible: true,
      activated: true,
      reason: "host_map_injected_before_retry",
    } : null,
    audit_evidence: { fixture: true },
    fingerprints: { adapter: `sha256:${"b".repeat(64)}` },
  };
  return Object.freeze({ result: Object.freeze(result), binding: binding(instance) });
}

async function conditionalNoopAttempt(input) {
  const attempt = await fakeAttempt(input);
  if (input.profileId !== "P34") return attempt;
  return Object.freeze({
    ...attempt,
    result: Object.freeze({
      ...attempt.result,
      vnext_verification_remediation_observation: Object.freeze({
        eligible: false,
        retry_required_count: 0,
        retry_started_count: 0,
        retry_completed_count: 0,
        retry_changed_count: 0,
        retry_reverified_count: 0,
        retry_verification_passed_count: 0,
        rollback_attempted_count: 0,
        rollback_completed_count: 0,
        operationally_complete: true,
        trigger_reasons: Object.freeze([]),
      }),
    }),
  });
}

async function conditionalNoopWithoutVerificationAttempt(input) {
  const attempt = await conditionalNoopAttempt(input);
  if (input.profileId !== "P34") return attempt;
  return Object.freeze({
    ...attempt,
    result: Object.freeze({
      ...attempt.result,
      vnext_host_verification_observation: Object.freeze({
        activation_eligible: true,
        activated: false,
        allowed: false,
      }),
    }),
  });
}

async function ineligibleDiagnosticAttempt(input) {
  const attempt = await fakeAttempt(input);
  if (input.profileId !== "P13") return attempt;
  return Object.freeze({
    ...attempt,
    result: Object.freeze({
      ...attempt.result,
      vnext_verification_remediation_observation: Object.freeze({
        eligible: false,
        retry_required_count: 0,
        retry_started_count: 0,
        retry_completed_count: 0,
        retry_changed_count: 0,
        retry_reverified_count: 0,
        retry_verification_passed_count: 0,
        operationally_complete: true,
      }),
    }),
  });
}

function createHash(value) {
  return fingerprintProfileValue(value).slice(7);
}

const report = await executeBenchmarkV2Campaign({
  repositoryRoot: root,
  plan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
const acceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(acceptance.status, "passed");
assert.equal(acceptance.activation.activated, true);
assert.deepEqual(acceptance.mechanism_acceptance, { satisfied: true, mode: "activated" });
const reviewerAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: reviewerPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(reviewerAcceptance.status, "passed");
assert.equal(reviewerAcceptance.family_id, "dev-medium-config-propagation");
assert.deepEqual(reviewerAcceptance.activation, { eligible: true, activated: true });
const retryAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: retryPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(retryAcceptance.status, "passed");
assert.equal(retryAcceptance.family_id, "dev-medium-public-result-shape");
assert.deepEqual(retryAcceptance.activation, { eligible: true, activated: true });
const diffGuidedRetryAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: diffGuidedRetryPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(diffGuidedRetryAcceptance.status, "passed");
assert.equal(diffGuidedRetryAcceptance.family_id, "dev-medium-public-result-shape");
assert.deepEqual(diffGuidedRetryAcceptance.activation, { eligible: true, activated: true });
const retryContextAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: retryContextPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(retryContextAcceptance.status, "passed");
assert.equal(retryContextAcceptance.family_id, "dev-medium-public-result-shape");
assert.deepEqual(retryContextAcceptance.activation, { eligible: true, activated: true });
const checkAddressedAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: checkAddressedPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(checkAddressedAcceptance.status, "passed");
assert.equal(checkAddressedAcceptance.family_id, "dev-medium-public-result-shape");
assert.deepEqual(checkAddressedAcceptance.activation, { eligible: true, activated: true });
const diagnosticGuidedAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: diagnosticGuidedPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(diagnosticGuidedAcceptance.status, "passed");
assert.equal(diagnosticGuidedAcceptance.family_id, "dev-high-durable-persistence");
assert.deepEqual(diagnosticGuidedAcceptance.activation, { eligible: true, activated: true });
const ineligibleDiagnosticAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: diagnosticGuidedPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: ineligibleDiagnosticAttempt,
});
assert.equal(ineligibleDiagnosticAcceptance.status, "passed");
assert.deepEqual(ineligibleDiagnosticAcceptance.activation, { eligible: false, activated: false });
const visibleContractAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: visibleContractPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(visibleContractAcceptance.status, "passed");
assert.equal(visibleContractAcceptance.family_id, "dev-medium-config-propagation");
assert.deepEqual(visibleContractAcceptance.activation, { eligible: true, activated: true });
const riskGatedContractAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: riskGatedContractPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(riskGatedContractAcceptance.status, "passed");
assert.equal(riskGatedContractAcceptance.family_id, "dev-high-authorization-boundary");
assert.deepEqual(riskGatedContractAcceptance.activation, { eligible: true, activated: true });
const riskGatedCompositeAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: riskGatedCompositePlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(riskGatedCompositeAcceptance.status, "passed");
assert.equal(riskGatedCompositeAcceptance.family_id, "dev-high-authorization-boundary");
assert.deepEqual(riskGatedCompositeAcceptance.activation, { eligible: true, activated: true });
const multiTargetContractAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: multiTargetContractPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(multiTargetContractAcceptance.status, "passed");
assert.equal(multiTargetContractAcceptance.family_id, "dev-medium-config-propagation");
assert.deepEqual(multiTargetContractAcceptance.activation, { eligible: true, activated: true });
const multiTargetCompositeAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: multiTargetCompositePlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(multiTargetCompositeAcceptance.status, "passed");
assert.equal(multiTargetCompositeAcceptance.family_id, "dev-medium-config-propagation");
assert.deepEqual(multiTargetCompositeAcceptance.activation, { eligible: true, activated: true });
const specializedContractAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: specializedContractPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(specializedContractAcceptance.status, "passed");
assert.equal(specializedContractAcceptance.family_id, "dev-medium-config-propagation");
assert.deepEqual(specializedContractAcceptance.activation, { eligible: true, activated: true });
const specializedCompositeAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: specializedCompositePlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(specializedCompositeAcceptance.status, "passed");
assert.equal(specializedCompositeAcceptance.family_id, "dev-medium-config-propagation");
assert.deepEqual(specializedCompositeAcceptance.activation, { eligible: true, activated: true });
const stratifiedCoreAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: stratifiedCorePlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(stratifiedCoreAcceptance.status, "passed");
assert.equal(stratifiedCoreAcceptance.family_id, "dev-medium-config-propagation");
assert.deepEqual(stratifiedCoreAcceptance.activation, { eligible: true, activated: true });
const riskGatedSpecializedAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: riskGatedSpecializedPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(riskGatedSpecializedAcceptance.status, "passed");
assert.equal(riskGatedSpecializedAcceptance.family_id, "dev-high-authorization-boundary");
assert.deepEqual(riskGatedSpecializedAcceptance.activation, { eligible: true, activated: true });
const riskGatedSpecializedCompositeAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: riskGatedSpecializedCompositePlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(riskGatedSpecializedCompositeAcceptance.status, "passed");
assert.equal(riskGatedSpecializedCompositeAcceptance.family_id, "dev-high-authorization-boundary");
assert.deepEqual(riskGatedSpecializedCompositeAcceptance.activation, { eligible: true, activated: true });
const coreV2ProductionAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: coreV2ProductionPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(coreV2ProductionAcceptance.status, "passed");
assert.equal(coreV2ProductionAcceptance.family_id, "dev-high-authorization-boundary");
assert.deepEqual(coreV2ProductionAcceptance.activation, { eligible: true, activated: true });
const publicCheckFailureOnlyAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: publicCheckFailureOnlyPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(publicCheckFailureOnlyAcceptance.status, "passed");
assert.equal(publicCheckFailureOnlyAcceptance.family_id, "dev-high-duplicate-side-effects");
assert.deepEqual(publicCheckFailureOnlyAcceptance.activation, { eligible: true, activated: true });
assert.deepEqual(publicCheckFailureOnlyAcceptance.mechanism_acceptance, { satisfied: true, mode: "activated" });
const secretMutationGuardAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: secretMutationGuardPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(secretMutationGuardAcceptance.status, "passed");
assert.equal(secretMutationGuardAcceptance.family_id, "dev-high-secret-redaction");
assert.deepEqual(secretMutationGuardAcceptance.activation, { eligible: true, activated: true });
assert.deepEqual(secretMutationGuardAcceptance.mechanism_acceptance, { satisfied: true, mode: "activated" });
const publicCheckFailureOnlyNoopAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: publicCheckFailureOnlyPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: conditionalNoopAttempt,
});
assert.equal(publicCheckFailureOnlyNoopAcceptance.status, "passed");
assert.deepEqual(publicCheckFailureOnlyNoopAcceptance.activation, { eligible: false, activated: false });
assert.deepEqual(publicCheckFailureOnlyNoopAcceptance.mechanism_acceptance, {
  satisfied: true,
  mode: "verified-not-needed",
});
const publicCheckFailureOnlyUnverifiedNoopAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: publicCheckFailureOnlyPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: conditionalNoopWithoutVerificationAttempt,
});
assert.equal(publicCheckFailureOnlyUnverifiedNoopAcceptance.status, "failed");
assert.deepEqual(publicCheckFailureOnlyUnverifiedNoopAcceptance.mechanism_acceptance, {
  satisfied: false,
  mode: "unsatisfied",
});
assert.equal(report.status, "complete");
assert.equal(report.pair_results.length, 36);
assert.equal(report.summary.statistics.activation.rate, 1);
assert(report.summary.statistics.primary.paired_delta > 0);
assert.notEqual(report.summary.statistics.medium_stratum, null);
assert.notEqual(report.summary.statistics.high_stratum, null);
assert(report.summary.statistics.exact_paired_permutation.candidate_only > 0);
assert.equal(report.summary.statistics.duration.median_ratio, 1.5);
assert.equal(report.summary.statistics.overhead.total_tool_calls.median_ratio, 1);
assert.equal(report.summary.statistics.overhead.model_turns.median_ratio, 1);
assert.match(report.report_fingerprint, /^sha256:[0-9a-f]{64}$/u);
assert.equal(validateBenchmarkV2CampaignReport(report, { repositoryRoot: root }), report);
const tampered = structuredClone(report);
tampered.pair_results[0].candidate.metrics.duration_ms += 1;
assert.throws(() => validateBenchmarkV2CampaignReport(tampered, { repositoryRoot: root }), /REPORT_SCHEMA|REPORT_PAIRS/u);

process.stdout.write("benchmark v2 campaign passed\n");
