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
const stratifiedScenarioVisibleContractProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P36" });
const minimalSmallScenarioVisibleContractProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P37" });
const minimalSmallScenarioVisibleContractNoAuditProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P38" });
const protocolBoundSmallNoAuditProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P39" });
const smallProtocolOnlyProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P40" });
const universalCompactProtocolProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P41" });
const highRiskCompactProtocolProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P42" });
const correctedRequirementsUniversalCompactProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P43" });
const editTaskNoMutationRemediationProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P44" });
const highRiskFinalDiffReconciliationProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P45" });
const terminalFailureRemediationProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P46" });
const terminalFailureReplacementProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P47" });
const repairedNoMutationRecoveryProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P48" });
const minimalDirectProtocolProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P49" });
const boundedMapOnlyProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P50" });
const minimalStratumProtocolProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P51" });
const minimalStratumNoMutationProfile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: "P52" });
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
  assert.equal(
    secretMutationGuardProfile.profileEvidence.source_entries
      .some((entry) => entry.source_path === "lib/benchmark/mutation-path-policy.mjs"
        && entry.kind === "plugin-dependency"),
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
  assert.equal(minimalSmallScenarioVisibleContractProfile.primaryAgentId, "build");
  assert.deepEqual(
    minimalSmallScenarioVisibleContractProfile.profileEvidence.component_ids,
    ["minimal-small-scenario-visible-contract", "targeted-verification", "bounded-pre-mutation-context", "exact-core-v2-coordinator"],
  );
  assert.equal(minimalSmallScenarioVisibleContractNoAuditProfile.primaryAgentId, "build");
  assert.deepEqual(
    minimalSmallScenarioVisibleContractNoAuditProfile.profileEvidence.component_ids,
    ["minimal-small-scenario-visible-contract-no-audit", "targeted-verification", "bounded-pre-mutation-context", "exact-core-v2-coordinator"],
  );
  assert.equal(protocolBoundSmallNoAuditProfile.primaryAgentId, "build");
  assert.deepEqual(
    protocolBoundSmallNoAuditProfile.profileEvidence.component_ids,
    ["protocol-bound-small-no-audit", "targeted-verification", "bounded-pre-mutation-context", "exact-core-v2-coordinator"],
  );
  assert.equal(smallProtocolOnlyProfile.primaryAgentId, "build");
  assert.deepEqual(
    smallProtocolOnlyProfile.profileEvidence.component_ids,
    ["small-protocol-only", "targeted-verification"],
  );
  assert.deepEqual(
    smallProtocolOnlyProfile.profileEvidence.runtime_surface.effective_config,
    plainProfile.profileEvidence.runtime_surface.effective_config,
  );
  assert.deepEqual(
    smallProtocolOnlyProfile.profileEvidence.runtime_surface.materialized_files.map((entry) => entry.path),
    ["agents/core-v4-build.md", "runtime/host/core-verification-gate.mjs"],
  );
  assert.equal(universalCompactProtocolProfile.primaryAgentId, "build");
  assert.deepEqual(
    universalCompactProtocolProfile.profileEvidence.component_ids,
    ["universal-compact-protocol", "targeted-verification"],
  );
  assert.deepEqual(
    universalCompactProtocolProfile.profileEvidence.runtime_surface.effective_config,
    plainProfile.profileEvidence.runtime_surface.effective_config,
  );
  assert.deepEqual(
    universalCompactProtocolProfile.profileEvidence.runtime_surface.materialized_files.map((entry) => entry.path),
    ["agents/core-v4-build.md", "runtime/host/core-verification-gate.mjs"],
  );
  assert.equal(correctedRequirementsUniversalCompactProfile.primaryAgentId, "build");
  assert.deepEqual(
    correctedRequirementsUniversalCompactProfile.profileEvidence.component_ids,
    ["universal-compact-protocol", "targeted-verification"],
  );
  assert.deepEqual(
    correctedRequirementsUniversalCompactProfile.profileEvidence.runtime_surface.effective_config,
    plainProfile.profileEvidence.runtime_surface.effective_config,
  );
  assert.deepEqual(
    correctedRequirementsUniversalCompactProfile.profileEvidence.runtime_surface.materialized_files.map((entry) => entry.path),
    ["agents/core-v4-build.md", "runtime/host/core-verification-gate.mjs"],
  );
  assert.equal(editTaskNoMutationRemediationProfile.primaryAgentId, "build");
  assert.deepEqual(
    editTaskNoMutationRemediationProfile.profileEvidence.component_ids,
    ["universal-compact-protocol", "targeted-verification", "edit-task-no-mutation-remediation"],
  );
  assert.deepEqual(
    editTaskNoMutationRemediationProfile.profileEvidence.runtime_surface.effective_config,
    plainProfile.profileEvidence.runtime_surface.effective_config,
  );
  assert.deepEqual(
    editTaskNoMutationRemediationProfile.profileEvidence.runtime_surface.materialized_files.map((entry) => entry.path),
    [
      "agents/core-v4-build.md",
      "runtime/host/core-verification-gate.mjs",
      "runtime/host/verification-remediation-gate.mjs",
    ],
  );
  assert.equal(repairedNoMutationRecoveryProfile.primaryAgentId, "build");
  assert.deepEqual(
    repairedNoMutationRecoveryProfile.profileEvidence.component_ids,
    ["universal-compact-protocol", "targeted-verification", "edit-task-no-mutation-remediation"],
  );
  assert.deepEqual(
    repairedNoMutationRecoveryProfile.profileEvidence.runtime_surface.effective_config,
    plainProfile.profileEvidence.runtime_surface.effective_config,
  );
  assert.deepEqual(
    repairedNoMutationRecoveryProfile.profileEvidence.runtime_surface.materialized_files.map((entry) => entry.path),
    [
      "agents/core-v4-build.md",
      "runtime/host/core-verification-gate.mjs",
      "runtime/host/verification-remediation-gate.mjs",
    ],
  );
  assert.equal(minimalDirectProtocolProfile.primaryAgentId, "build");
  assert.deepEqual(
    minimalDirectProtocolProfile.profileEvidence.component_ids,
    ["minimal-direct-protocol", "targeted-verification"],
  );
  assert.deepEqual(
    minimalDirectProtocolProfile.profileEvidence.runtime_surface.effective_config,
    plainProfile.profileEvidence.runtime_surface.effective_config,
  );
  assert.deepEqual(
    minimalDirectProtocolProfile.profileEvidence.runtime_surface.materialized_files.map((entry) => entry.path),
    ["agents/core-v7-build.md", "runtime/host/core-verification-gate.mjs"],
  );
  assert.equal(boundedMapOnlyProfile.primaryAgentId, "build");
  assert.deepEqual(
    boundedMapOnlyProfile.profileEvidence.component_ids,
    ["universal-compact-protocol", "targeted-verification", "bounded-pre-mutation-context"],
  );
  assert.deepEqual(
    boundedMapOnlyProfile.profileEvidence.runtime_surface.effective_config,
    plainProfile.profileEvidence.runtime_surface.effective_config,
  );
  assert.deepEqual(
    boundedMapOnlyProfile.profileEvidence.runtime_surface.materialized_files.map((entry) => entry.path),
    [
      "agents/core-v4-build.md",
      "runtime/host/bounded-repository-map.mjs",
      "runtime/host/core-verification-gate.mjs",
    ],
  );
  assert.equal(minimalStratumProtocolProfile.primaryAgentId, "build");
  assert.deepEqual(
    minimalStratumProtocolProfile.profileEvidence.component_ids,
    ["minimal-stratum-protocol", "targeted-verification"],
  );
  assert.deepEqual(
    minimalStratumProtocolProfile.profileEvidence.runtime_surface.effective_config,
    plainProfile.profileEvidence.runtime_surface.effective_config,
  );
  assert.deepEqual(
    minimalStratumProtocolProfile.profileEvidence.runtime_surface.materialized_files.map((entry) => entry.path),
    ["agents/core-v4-build.md", "runtime/host/core-verification-gate.mjs"],
  );
  assert.equal(minimalStratumNoMutationProfile.primaryAgentId, "build");
  assert.deepEqual(
    minimalStratumNoMutationProfile.profileEvidence.component_ids,
    ["minimal-stratum-no-mutation-remediation", "targeted-verification", "edit-task-no-mutation-remediation"],
  );
  assert.deepEqual(
    minimalStratumNoMutationProfile.profileEvidence.runtime_surface.effective_config,
    plainProfile.profileEvidence.runtime_surface.effective_config,
  );
  assert.deepEqual(
    minimalStratumNoMutationProfile.profileEvidence.runtime_surface.materialized_files.map((entry) => entry.path),
    ["agents/core-v4-build.md", "runtime/host/core-verification-gate.mjs", "runtime/host/verification-remediation-gate.mjs"],
  );
  assert.equal(highRiskFinalDiffReconciliationProfile.primaryAgentId, "build");
  assert.deepEqual(
    highRiskFinalDiffReconciliationProfile.profileEvidence.component_ids,
    ["universal-compact-protocol", "targeted-verification", "high-risk-final-diff-reconciliation"],
  );
  assert.deepEqual(
    highRiskFinalDiffReconciliationProfile.profileEvidence.runtime_surface.effective_config,
    plainProfile.profileEvidence.runtime_surface.effective_config,
  );
  assert.deepEqual(
    highRiskFinalDiffReconciliationProfile.profileEvidence.runtime_surface.materialized_files.map((entry) => entry.path),
    [
      "agents/core-v4-build.md",
      "runtime/host/core-verification-gate.mjs",
      "runtime/host/verification-remediation-gate.mjs",
    ],
  );
  assert.equal(terminalFailureRemediationProfile.primaryAgentId, "build");
  assert.deepEqual(
    terminalFailureRemediationProfile.profileEvidence.component_ids,
    ["universal-compact-protocol", "targeted-verification", "terminal-failure-remediation"],
  );
  assert.deepEqual(
    terminalFailureRemediationProfile.profileEvidence.runtime_surface.effective_config,
    plainProfile.profileEvidence.runtime_surface.effective_config,
  );
  assert.deepEqual(
    terminalFailureRemediationProfile.profileEvidence.runtime_surface.materialized_files.map((entry) => entry.path),
    [
      "agents/core-v4-build.md",
      "runtime/host/core-verification-gate.mjs",
      "runtime/host/verification-remediation-gate.mjs",
    ],
  );
  assert.equal(highRiskCompactProtocolProfile.primaryAgentId, "build");
  assert.deepEqual(
    highRiskCompactProtocolProfile.profileEvidence.component_ids,
    ["high-risk-compact-protocol", "targeted-verification"],
  );
  assert.deepEqual(
    highRiskCompactProtocolProfile.profileEvidence.runtime_surface.effective_config,
    plainProfile.profileEvidence.runtime_surface.effective_config,
  );
  assert.deepEqual(
    highRiskCompactProtocolProfile.profileEvidence.runtime_surface.materialized_files.map((entry) => entry.path),
    ["agents/core-v4-build.md", "agents/core-v6-build.md", "runtime/host/core-verification-gate.mjs"],
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
  cleanupSyntheticProfile(stratifiedScenarioVisibleContractProfile);
  cleanupSyntheticProfile(minimalSmallScenarioVisibleContractProfile);
  cleanupSyntheticProfile(minimalSmallScenarioVisibleContractNoAuditProfile);
  cleanupSyntheticProfile(protocolBoundSmallNoAuditProfile);
  cleanupSyntheticProfile(smallProtocolOnlyProfile);
  cleanupSyntheticProfile(universalCompactProtocolProfile);
  cleanupSyntheticProfile(highRiskCompactProtocolProfile);
  cleanupSyntheticProfile(correctedRequirementsUniversalCompactProfile);
  cleanupSyntheticProfile(editTaskNoMutationRemediationProfile);
  cleanupSyntheticProfile(highRiskFinalDiffReconciliationProfile);
  cleanupSyntheticProfile(terminalFailureRemediationProfile);
  cleanupSyntheticProfile(terminalFailureReplacementProfile);
  cleanupSyntheticProfile(repairedNoMutationRecoveryProfile);
  cleanupSyntheticProfile(minimalDirectProtocolProfile);
  cleanupSyntheticProfile(boundedMapOnlyProfile);
  cleanupSyntheticProfile(minimalStratumProtocolProfile);
  cleanupSyntheticProfile(minimalStratumNoMutationProfile);
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
const stratifiedScenarioVisibleContractPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-stratified-scenario-visible-contract-1",
  baselineArmId: "P0",
  candidateArmId: "P36",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(stratifiedScenarioVisibleContractPlan.component_id, "stratified-scenario-visible-contract-candidate");
assert.equal(
  stratifiedScenarioVisibleContractPlan.bindings.candidate_profile_fingerprint,
  stratifiedScenarioVisibleContractProfile.profileFingerprint,
);
const minimalSmallScenarioVisibleContractPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-minimal-small-scenario-visible-contract-1",
  baselineArmId: "P0",
  candidateArmId: "P37",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(minimalSmallScenarioVisibleContractPlan.component_id, "minimal-small-scenario-visible-contract-candidate");
assert.equal(
  minimalSmallScenarioVisibleContractPlan.bindings.candidate_profile_fingerprint,
  minimalSmallScenarioVisibleContractProfile.profileFingerprint,
);
const minimalSmallScenarioVisibleContractNoAuditPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-minimal-small-scenario-visible-contract-no-audit-1",
  baselineArmId: "P0",
  candidateArmId: "P38",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(minimalSmallScenarioVisibleContractNoAuditPlan.component_id, "minimal-small-scenario-visible-contract-no-audit-candidate");
assert.equal(
  minimalSmallScenarioVisibleContractNoAuditPlan.bindings.candidate_profile_fingerprint,
  minimalSmallScenarioVisibleContractNoAuditProfile.profileFingerprint,
);
const protocolBoundSmallNoAuditPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-protocol-bound-small-no-audit-1",
  baselineArmId: "P0",
  candidateArmId: "P39",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(protocolBoundSmallNoAuditPlan.component_id, "protocol-bound-small-no-audit-candidate");
assert.equal(
  protocolBoundSmallNoAuditPlan.bindings.candidate_profile_fingerprint,
  protocolBoundSmallNoAuditProfile.profileFingerprint,
);
const smallProtocolOnlyPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-small-protocol-only-1",
  baselineArmId: "P0",
  candidateArmId: "P40",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(smallProtocolOnlyPlan.component_id, "small-protocol-only-candidate");
assert.equal(
  smallProtocolOnlyPlan.bindings.candidate_profile_fingerprint,
  smallProtocolOnlyProfile.profileFingerprint,
);
const universalCompactProtocolPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-universal-compact-protocol-1",
  baselineArmId: "P0",
  candidateArmId: "P41",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(universalCompactProtocolPlan.component_id, "universal-compact-protocol-candidate");
assert.equal(
  universalCompactProtocolPlan.bindings.candidate_profile_fingerprint,
  universalCompactProtocolProfile.profileFingerprint,
);
const highRiskCompactProtocolPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-high-risk-compact-protocol-1",
  baselineArmId: "P0",
  candidateArmId: "P42",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(highRiskCompactProtocolPlan.component_id, "high-risk-compact-protocol-candidate");
assert.equal(
  highRiskCompactProtocolPlan.bindings.candidate_profile_fingerprint,
  highRiskCompactProtocolProfile.profileFingerprint,
);
const correctedRequirementsUniversalCompactPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-corrected-requirements-universal-compact-1",
  baselineArmId: "P0",
  candidateArmId: "P43",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(correctedRequirementsUniversalCompactPlan.component_id, "universal-compact-protocol-candidate");
assert.equal(
  correctedRequirementsUniversalCompactPlan.bindings.candidate_profile_fingerprint,
  correctedRequirementsUniversalCompactProfile.profileFingerprint,
);
const editTaskNoMutationRemediationPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-edit-task-no-mutation-remediation-1",
  baselineArmId: "P0",
  candidateArmId: "P44",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(editTaskNoMutationRemediationPlan.component_id, "edit-task-no-mutation-remediation-candidate");
assert.equal(
  editTaskNoMutationRemediationPlan.bindings.candidate_profile_fingerprint,
  editTaskNoMutationRemediationProfile.profileFingerprint,
);
const repairedNoMutationRecoveryPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-repaired-no-mutation-recovery-1",
  baselineArmId: "P0",
  candidateArmId: "P48",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(repairedNoMutationRecoveryPlan.component_id, "edit-task-no-mutation-remediation-candidate");
assert.equal(
  repairedNoMutationRecoveryPlan.bindings.candidate_profile_fingerprint,
  repairedNoMutationRecoveryProfile.profileFingerprint,
);
const minimalDirectProtocolPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-minimal-direct-protocol-1",
  baselineArmId: "P0",
  candidateArmId: "P49",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(minimalDirectProtocolPlan.component_id, "minimal-direct-protocol-candidate");
assert.equal(
  minimalDirectProtocolPlan.bindings.candidate_profile_fingerprint,
  minimalDirectProtocolProfile.profileFingerprint,
);
const boundedMapOnlyPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-bounded-map-only-1",
  baselineArmId: "P0",
  candidateArmId: "P50",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(boundedMapOnlyPlan.component_id, "bounded-map-only-candidate");
assert.equal(
  boundedMapOnlyPlan.bindings.candidate_profile_fingerprint,
  boundedMapOnlyProfile.profileFingerprint,
);
const minimalStratumProtocolPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-minimal-stratum-protocol-1",
  baselineArmId: "P0",
  candidateArmId: "P51",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(minimalStratumProtocolPlan.component_id, "minimal-stratum-protocol-candidate");
assert.equal(
  minimalStratumProtocolPlan.bindings.candidate_profile_fingerprint,
  minimalStratumProtocolProfile.profileFingerprint,
);
const minimalStratumNoMutationPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-minimal-stratum-no-mutation-1",
  baselineArmId: "P0",
  candidateArmId: "P52",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(minimalStratumNoMutationPlan.component_id, "minimal-stratum-no-mutation-remediation-candidate");
assert.equal(
  minimalStratumNoMutationPlan.bindings.candidate_profile_fingerprint,
  minimalStratumNoMutationProfile.profileFingerprint,
);
const highRiskFinalDiffReconciliationPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-high-risk-final-diff-reconciliation-1",
  baselineArmId: "P0",
  candidateArmId: "P45",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(highRiskFinalDiffReconciliationPlan.component_id, "high-risk-final-diff-reconciliation-candidate");
assert.equal(
  highRiskFinalDiffReconciliationPlan.bindings.candidate_profile_fingerprint,
  highRiskFinalDiffReconciliationProfile.profileFingerprint,
);
const terminalFailureRemediationPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-terminal-failure-remediation-1",
  baselineArmId: "P0",
  candidateArmId: "P46",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(terminalFailureRemediationPlan.component_id, "terminal-failure-remediation-candidate");
assert.equal(
  terminalFailureRemediationPlan.bindings.candidate_profile_fingerprint,
  terminalFailureRemediationProfile.profileFingerprint,
);
const terminalFailureReplacementPlan = buildBenchmarkV2CampaignPlan({
  repositoryRoot: root,
  split: "development",
  generationId: "generation-fixture-terminal-failure-replacement-1",
  baselineArmId: "P0",
  candidateArmId: "P47",
  model: "fixture/model",
  provider: "fixture",
  variant: "low",
  timeoutMs: 300_000,
  seed: "campaign-fixture-seed",
  repetitions: 1,
  executableIdentity: executableFingerprint,
  allowDirty: true,
});
assert.equal(terminalFailureReplacementPlan.component_id, "terminal-failure-replacement-candidate");
assert.equal(
  terminalFailureReplacementPlan.bindings.candidate_profile_fingerprint,
  terminalFailureReplacementProfile.profileFingerprint,
);
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
  const success = ["P6", "P8", "P9", "P10", "P11", "P12", "P13", "P14", "P15", "P16", "P17", "P18", "P19", "P20", "P34", "P35", "P36", "P37", "P38", "P39", "P40", "P41", "P42", "P43", "P44", "P45", "P46", "P47", "P48", "P49", "P50", "P51", "P52"].includes(profileId) ? true : !baselineFailure;
  const passed = check(true);
  const hidden = success ? passed : check(false, "hidden-contract");
  const result = {
    profile_id: profileId,
    execution_status: "completed",
    termination_reason: "verified",
    reason: null,
    execution_diagnostics: {
      exit_code: 0,
      stdout_bytes: 512,
      stderr_bytes: 0,
      stderr_fingerprint: null,
    },
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
    } : ["P51", "P52"].includes(profileId) ? {
      eligible: false,
      review_required_count: 0,
      review_started_count: 0,
      review_completed_count: 0,
      review_finding_count: 0,
      reviewer_caused_fix_count: 0,
      operationally_complete: true,
      terminal_allowed: true,
      reason: "not_eligible",
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
    } : ["P46", "P47"].includes(profileId) ? {
      eligible: true,
      retry_required_count: 1,
      retry_started_count: 1,
      retry_completed_count: 1,
      retry_changed_count: 1,
      retry_reverified_count: 1,
      retry_verification_passed_count: 1,
      replacement_reset_attempted_count: profileId === "P47" ? 1 : 0,
      replacement_reset_completed_count: profileId === "P47" ? 1 : 0,
      operationally_complete: true,
      trigger_reasons: ["public-check-failed"],
    } : profileId === "P45" && /(?:^|-)high-/u.test(instance.family_id) ? {
      eligible: true,
      retry_required_count: 1,
      retry_started_count: 1,
      retry_completed_count: 1,
      retry_changed_count: 0,
      retry_reverified_count: 0,
      retry_verification_passed_count: 0,
      operationally_complete: true,
      trigger_reasons: ["high-risk-final-diff-reconciliation"],
    } : ["P38", "P39", "P40", "P41", "P42", "P43", "P44", "P45", "P46", "P47", "P48", "P49", "P50", "P51", "P52"].includes(profileId) ? {
      eligible: false,
      retry_required_count: 0,
      retry_started_count: 0,
      retry_completed_count: 0,
      operationally_complete: true,
    } : null,
    vnext_secret_mutation_guard_observation: profileId === "P35" ? {
      eligible: true,
      activated: true,
      denied_count: 0,
      reason: "runtime_guard_bound",
    } : null,
    vnext_visible_contract_observation: (profileId === "P36"
      || (["P37", "P38", "P39"].includes(profileId) && !/(?:^|-)small-/u.test(instance.family_id))) ? {
      eligible: true,
      activated: true,
      reason: "host_visible_contract_compiled_before_model",
      manifest_fingerprint: `sha256:${"d".repeat(64)}`,
      clause_count: 1,
    } : ["P40", "P41", "P42", "P43", "P44", "P45", "P46", "P47", "P48", "P49", "P50", "P51", "P52"].includes(profileId) ? {
      eligible: false,
      activated: false,
      reason: "profile_without_visible_contract_manifest",
      manifest_fingerprint: null,
      clause_count: 0,
    } : null,
    vnext_primary_route_observation: ["P36", "P37", "P38", "P39", "P40", "P41", "P42", "P43", "P44", "P45", "P46", "P47", "P48", "P49", "P50", "P51", "P52"].includes(profileId) ? {
      eligible: true,
      activated: true,
      stratum: /(?:^|-)high-/u.test(instance.family_id)
        ? "high" : /(?:^|-)medium-/u.test(instance.family_id) ? "medium" : "small",
      agent_id: profileId === "P49" ? "core-v7-build" : /(?:^|-)small-/u.test(instance.family_id)
        ? (profileId === "P36" ? "core-v3-build" : ["P39", "P40", "P41", "P42", "P43", "P44", "P45", "P46", "P47", "P48", "P50"].includes(profileId) ? "core-v4-build" : "build")
        : (profileId === "P40" ? "build" : profileId === "P42" && /(?:^|-)high-/u.test(instance.family_id) ? "core-v6-build" : "core-v4-build"),
      visible_contract_version: ["P40", "P41", "P42", "P43", "P44", "P45", "P46", "P47", "P48", "P49", "P50", "P51", "P52"].includes(profileId) ? "NONE" : /(?:^|-)small-/u.test(instance.family_id)
        ? (profileId === "P36" ? "V1" : "NONE") : "V2",
      reason: "host_route_bound",
    } : null,
    vnext_context_map_observation: profileId === "P11" ? {
      eligible: true,
      activated: true,
      reason: "host_map_injected_before_retry",
    } : profileId === "P50" && /(?:^|-)medium-/u.test(instance.family_id)
      && instance.task_scope.allowed_changed_paths.length > 1 ? {
      eligible: true,
      activated: true,
      reason: "host_map_injected_before_model",
    } : profileId === "P50" ? {
      eligible: false,
      activated: false,
      reason: "not_eligible",
    } : ["P40", "P41", "P42", "P43", "P44", "P45", "P46", "P47", "P48", "P49", "P51", "P52"].includes(profileId) ? { eligible: true, activated: false, reason: "profile_without_host_context" } : null,
    audit_evidence: { fixture: true },
    fingerprints: { adapter: `sha256:${"b".repeat(64)}` },
  };
  return Object.freeze({ result: Object.freeze(result), binding: binding(instance) });
}

async function conditionalNoopAttempt(input) {
  const attempt = await fakeAttempt(input);
  if (!["P34", "P46", "P47", "P48"].includes(input.profileId)) return attempt;
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
  if (!["P34", "P46", "P47", "P48"].includes(input.profileId)) return attempt;
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
const stratifiedScenarioVisibleContractAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: stratifiedScenarioVisibleContractPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(stratifiedScenarioVisibleContractAcceptance.status, "passed");
assert.equal(stratifiedScenarioVisibleContractAcceptance.family_id, "dev-small-malformed-parser");
assert.deepEqual(stratifiedScenarioVisibleContractAcceptance.activation, { eligible: true, activated: true });
assert.deepEqual(stratifiedScenarioVisibleContractAcceptance.mechanism_acceptance, { satisfied: true, mode: "activated" });
const stratifiedScenarioWrongRouteAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: stratifiedScenarioVisibleContractPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: async (input) => {
    const attempt = await fakeAttempt(input);
    if (input.profileId !== "P36") return attempt;
    return Object.freeze({
      ...attempt,
      result: Object.freeze({
        ...attempt.result,
        vnext_primary_route_observation: Object.freeze({
          ...attempt.result.vnext_primary_route_observation,
          agent_id: "core-v4-build",
          visible_contract_version: "V2",
        }),
      }),
    });
  },
});
assert.equal(stratifiedScenarioWrongRouteAcceptance.status, "failed");
assert.deepEqual(stratifiedScenarioWrongRouteAcceptance.activation, { eligible: true, activated: false });
assert.deepEqual(stratifiedScenarioWrongRouteAcceptance.mechanism_acceptance, { satisfied: false, mode: "unsatisfied" });
const minimalSmallScenarioVisibleContractAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: minimalSmallScenarioVisibleContractPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(minimalSmallScenarioVisibleContractAcceptance.status, "passed");
assert.equal(minimalSmallScenarioVisibleContractAcceptance.family_id, "dev-small-boundary-search");
assert.deepEqual(minimalSmallScenarioVisibleContractAcceptance.activation, { eligible: true, activated: true });
assert.deepEqual(minimalSmallScenarioVisibleContractAcceptance.mechanism_acceptance, { satisfied: true, mode: "activated" });
const minimalSmallScenarioWrongRouteAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: minimalSmallScenarioVisibleContractPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: async (input) => {
    const attempt = await fakeAttempt(input);
    if (input.profileId !== "P37") return attempt;
    return Object.freeze({
      ...attempt,
      result: Object.freeze({
        ...attempt.result,
        vnext_primary_route_observation: Object.freeze({
          ...attempt.result.vnext_primary_route_observation,
          agent_id: "core-v3-build",
          visible_contract_version: "V1",
        }),
      }),
    });
  },
});
assert.equal(minimalSmallScenarioWrongRouteAcceptance.status, "failed");
assert.deepEqual(minimalSmallScenarioWrongRouteAcceptance.activation, { eligible: true, activated: false });
assert.deepEqual(minimalSmallScenarioWrongRouteAcceptance.mechanism_acceptance, { satisfied: false, mode: "unsatisfied" });
const minimalSmallScenarioVisibleContractNoAuditAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: minimalSmallScenarioVisibleContractNoAuditPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(minimalSmallScenarioVisibleContractNoAuditAcceptance.status, "passed");
assert.equal(minimalSmallScenarioVisibleContractNoAuditAcceptance.family_id, "dev-small-boundary-search");
assert.deepEqual(minimalSmallScenarioVisibleContractNoAuditAcceptance.activation, { eligible: true, activated: true });
assert.deepEqual(minimalSmallScenarioVisibleContractNoAuditAcceptance.mechanism_acceptance, { satisfied: true, mode: "activated" });
const minimalSmallScenarioUnexpectedRetryAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: minimalSmallScenarioVisibleContractNoAuditPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: async (input) => {
    const attempt = await fakeAttempt(input);
    if (input.profileId !== "P38") return attempt;
    return Object.freeze({
      ...attempt,
      result: Object.freeze({
        ...attempt.result,
        vnext_verification_remediation_observation: Object.freeze({
          eligible: true,
          retry_started_count: 1,
          retry_completed_count: 0,
        }),
      }),
    });
  },
});
assert.equal(minimalSmallScenarioUnexpectedRetryAcceptance.status, "failed");
assert.deepEqual(minimalSmallScenarioUnexpectedRetryAcceptance.activation, { eligible: true, activated: false });
assert.deepEqual(minimalSmallScenarioUnexpectedRetryAcceptance.mechanism_acceptance, { satisfied: false, mode: "unsatisfied" });
const protocolBoundSmallNoAuditAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: protocolBoundSmallNoAuditPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(protocolBoundSmallNoAuditAcceptance.status, "passed");
assert.equal(protocolBoundSmallNoAuditAcceptance.family_id, "dev-small-boundary-search");
assert.deepEqual(protocolBoundSmallNoAuditAcceptance.activation, { eligible: true, activated: true });
assert.deepEqual(protocolBoundSmallNoAuditAcceptance.mechanism_acceptance, { satisfied: true, mode: "activated" });
const protocolBoundSmallWrongRouteAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: protocolBoundSmallNoAuditPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: async (input) => {
    const attempt = await fakeAttempt(input);
    if (input.profileId !== "P39") return attempt;
    return Object.freeze({
      ...attempt,
      result: Object.freeze({
        ...attempt.result,
        vnext_primary_route_observation: Object.freeze({
          ...attempt.result.vnext_primary_route_observation,
          agent_id: "build",
        }),
      }),
    });
  },
});
assert.equal(protocolBoundSmallWrongRouteAcceptance.status, "failed");
assert.deepEqual(protocolBoundSmallWrongRouteAcceptance.activation, { eligible: true, activated: false });
const protocolBoundSmallUnexpectedRetryAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: protocolBoundSmallNoAuditPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: async (input) => {
    const attempt = await fakeAttempt(input);
    if (input.profileId !== "P39") return attempt;
    return Object.freeze({
      ...attempt,
      result: Object.freeze({
        ...attempt.result,
        vnext_verification_remediation_observation: Object.freeze({
          eligible: true,
          retry_started_count: 1,
          retry_completed_count: 0,
        }),
      }),
    });
  },
});
assert.equal(protocolBoundSmallUnexpectedRetryAcceptance.status, "failed");
assert.deepEqual(protocolBoundSmallUnexpectedRetryAcceptance.activation, { eligible: true, activated: false });
const smallProtocolOnlyAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: smallProtocolOnlyPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(smallProtocolOnlyAcceptance.status, "passed");
assert.equal(smallProtocolOnlyAcceptance.family_id, "dev-small-boundary-search");
assert.deepEqual(smallProtocolOnlyAcceptance.activation, { eligible: true, activated: true });
const smallProtocolOnlyWrongRouteAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: smallProtocolOnlyPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: async (input) => {
    const attempt = await fakeAttempt(input);
    if (input.profileId !== "P40") return attempt;
    return Object.freeze({
      ...attempt,
      result: Object.freeze({
        ...attempt.result,
        vnext_primary_route_observation: Object.freeze({
          ...attempt.result.vnext_primary_route_observation,
          agent_id: "build",
        }),
      }),
    });
  },
});
assert.equal(smallProtocolOnlyWrongRouteAcceptance.status, "failed");
assert.deepEqual(smallProtocolOnlyWrongRouteAcceptance.activation, { eligible: true, activated: false });
const universalCompactProtocolAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: universalCompactProtocolPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(universalCompactProtocolAcceptance.status, "passed");
assert.equal(universalCompactProtocolAcceptance.family_id, "dev-small-boundary-search");
assert.deepEqual(universalCompactProtocolAcceptance.activation, { eligible: true, activated: true });
const universalCompactProtocolWrongRouteAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: universalCompactProtocolPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: async (input) => {
    const attempt = await fakeAttempt(input);
    if (input.profileId !== "P41") return attempt;
    return Object.freeze({
      ...attempt,
      result: Object.freeze({
        ...attempt.result,
        vnext_primary_route_observation: Object.freeze({
          ...attempt.result.vnext_primary_route_observation,
          agent_id: "build",
        }),
      }),
    });
  },
});
assert.equal(universalCompactProtocolWrongRouteAcceptance.status, "failed");
assert.deepEqual(universalCompactProtocolWrongRouteAcceptance.activation, { eligible: true, activated: false });
const correctedRequirementsUniversalCompactAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: correctedRequirementsUniversalCompactPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(correctedRequirementsUniversalCompactAcceptance.status, "passed");
assert.equal(correctedRequirementsUniversalCompactAcceptance.family_id, "dev-high-path-confinement");
assert.deepEqual(correctedRequirementsUniversalCompactAcceptance.activation, { eligible: true, activated: true });
const editTaskNoMutationRemediationAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: editTaskNoMutationRemediationPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(editTaskNoMutationRemediationAcceptance.status, "failed");
assert.equal(editTaskNoMutationRemediationAcceptance.family_id, "dev-high-duplicate-side-effects");
assert.deepEqual(editTaskNoMutationRemediationAcceptance.activation, { eligible: false, activated: false });
const repairedNoMutationRecoveryAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: repairedNoMutationRecoveryPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(repairedNoMutationRecoveryAcceptance.status, "passed");
assert.equal(repairedNoMutationRecoveryAcceptance.family_id, "dev-high-duplicate-side-effects");
assert.deepEqual(repairedNoMutationRecoveryAcceptance.activation, { eligible: false, activated: false });
assert.deepEqual(repairedNoMutationRecoveryAcceptance.mechanism_acceptance, {
  satisfied: true,
  mode: "verified-not-needed",
});
const minimalDirectProtocolAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: minimalDirectProtocolPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(minimalDirectProtocolAcceptance.status, "passed");
assert.equal(minimalDirectProtocolAcceptance.family_id, "dev-small-boundary-search");
assert.deepEqual(minimalDirectProtocolAcceptance.activation, { eligible: true, activated: true });
const boundedMapOnlyAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: boundedMapOnlyPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(boundedMapOnlyAcceptance.status, "passed");
assert.equal(boundedMapOnlyAcceptance.family_id, "dev-medium-feature-flag-callpath");
assert.deepEqual(boundedMapOnlyAcceptance.activation, { eligible: true, activated: true });
const minimalStratumProtocolAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: minimalStratumProtocolPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(
  minimalStratumProtocolAcceptance.status,
  "passed",
  JSON.stringify(minimalStratumProtocolAcceptance),
);
assert.equal(minimalStratumProtocolAcceptance.family_id, "dev-medium-public-result-shape");
assert.deepEqual(minimalStratumProtocolAcceptance.activation, { eligible: true, activated: true });
const minimalStratumProtocolWrongRouteAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: minimalStratumProtocolPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: async (input) => {
    const attempt = await fakeAttempt(input);
    if (input.profileId !== "P51") return attempt;
    return Object.freeze({
      ...attempt,
      result: Object.freeze({
        ...attempt.result,
        vnext_primary_route_observation: Object.freeze({
          ...attempt.result.vnext_primary_route_observation,
          agent_id: "build",
        }),
      }),
    });
  },
});
assert.equal(minimalStratumProtocolWrongRouteAcceptance.status, "failed");
assert.deepEqual(minimalStratumProtocolWrongRouteAcceptance.activation, { eligible: true, activated: false });
const minimalStratumNoMutationAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: minimalStratumNoMutationPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(minimalStratumNoMutationAcceptance.status, "passed");
assert.equal(minimalStratumNoMutationAcceptance.family_id, "dev-high-duplicate-side-effects");
assert.deepEqual(minimalStratumNoMutationAcceptance.activation, { eligible: false, activated: false });
assert.equal(minimalStratumNoMutationAcceptance.mechanism_acceptance.mode, "verified-not-needed");
const highRiskFinalDiffReconciliationAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: highRiskFinalDiffReconciliationPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(highRiskFinalDiffReconciliationAcceptance.status, "passed");
assert.equal(highRiskFinalDiffReconciliationAcceptance.family_id, "dev-high-authorization-boundary");
assert.deepEqual(highRiskFinalDiffReconciliationAcceptance.activation, { eligible: true, activated: true });
const terminalFailureRemediationAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: terminalFailureRemediationPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(terminalFailureRemediationAcceptance.status, "passed");
assert.equal(terminalFailureRemediationAcceptance.family_id, "dev-medium-plugin-registry");
assert.deepEqual(terminalFailureRemediationAcceptance.activation, { eligible: true, activated: true });
const highRiskCompactProtocolAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: highRiskCompactProtocolPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(highRiskCompactProtocolAcceptance.status, "passed");
assert.equal(highRiskCompactProtocolAcceptance.family_id, "dev-high-authorization-boundary");
assert.deepEqual(highRiskCompactProtocolAcceptance.activation, { eligible: true, activated: true });
const highRiskCompactProtocolWrongRouteAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: highRiskCompactProtocolPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: async (input) => {
    const attempt = await fakeAttempt(input);
    if (input.profileId !== "P42") return attempt;
    return Object.freeze({
      ...attempt,
      result: Object.freeze({
        ...attempt.result,
        vnext_primary_route_observation: Object.freeze({
          ...attempt.result.vnext_primary_route_observation,
          agent_id: "core-v4-build",
        }),
      }),
    });
  },
});
assert.equal(highRiskCompactProtocolWrongRouteAcceptance.status, "failed");
assert.deepEqual(highRiskCompactProtocolWrongRouteAcceptance.activation, { eligible: true, activated: false });
const smallProtocolOnlyMediumActivationFixture = {
  activation: {
    primary_route: {
      eligible: true,
      activated: true,
      stratum: "medium",
      agent_id: "build",
      visible_contract_version: "NONE",
    },
    host_verification: { activation_eligible: true, activated: true, allowed: true },
    verification_remediation: { eligible: false, retry_started_count: 0, retry_completed_count: 0 },
    bounded_context: { eligible: true, activated: false, reason: "profile_without_host_context" },
    visible_contract: { eligible: false, activated: false },
  },
  metrics: { model_turn_count: 1, continuation_turn_count: 0 },
};
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "small-protocol-only-candidate",
    smallProtocolOnlyMediumActivationFixture,
    "medium",
  ),
  { eligible: true, activated: true },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "small-protocol-only-candidate",
    {
      ...smallProtocolOnlyMediumActivationFixture,
      metrics: { model_turn_count: 2, continuation_turn_count: 1 },
    },
    "medium",
  ),
  { eligible: true, activated: false },
);
const universalCompactProtocolMediumActivationFixture = {
  ...smallProtocolOnlyMediumActivationFixture,
  activation: {
    ...smallProtocolOnlyMediumActivationFixture.activation,
    primary_route: {
      ...smallProtocolOnlyMediumActivationFixture.activation.primary_route,
      agent_id: "core-v4-build",
    },
  },
};
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "universal-compact-protocol-candidate",
    universalCompactProtocolMediumActivationFixture,
    "medium",
  ),
  { eligible: true, activated: true },
);
const boundedMapOnlyMediumActivationFixture = {
  ...universalCompactProtocolMediumActivationFixture,
  activation: {
    ...universalCompactProtocolMediumActivationFixture.activation,
    bounded_context: { eligible: true, activated: true, reason: "host_map_injected" },
  },
};
const minimalStratumProtocolMediumActivationFixture = {
  ...universalCompactProtocolMediumActivationFixture,
  activation: {
    ...universalCompactProtocolMediumActivationFixture.activation,
    automatic_review: {
      eligible: false,
      review_started_count: 0,
      review_completed_count: 0,
    },
  },
};
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "minimal-stratum-protocol-candidate",
    minimalStratumProtocolMediumActivationFixture,
    "medium",
  ),
  { eligible: true, activated: true },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "minimal-stratum-protocol-candidate",
    {
      ...minimalStratumProtocolMediumActivationFixture,
      activation: {
        ...minimalStratumProtocolMediumActivationFixture.activation,
        host_verification: { activation_eligible: true, activated: true, allowed: false },
      },
    },
    "medium",
  ),
  { eligible: true, activated: true },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "minimal-stratum-protocol-candidate",
    {
      ...minimalStratumProtocolMediumActivationFixture,
      activation: {
        ...minimalStratumProtocolMediumActivationFixture.activation,
        host_verification: { activation_eligible: true, activated: false, allowed: false },
      },
    },
    "medium",
  ),
  { eligible: true, activated: false },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "minimal-stratum-protocol-candidate",
    {
      ...minimalStratumProtocolMediumActivationFixture,
      activation: {
        ...minimalStratumProtocolMediumActivationFixture.activation,
        primary_route: {
          ...minimalStratumProtocolMediumActivationFixture.activation.primary_route,
          stratum: "small",
          agent_id: "build",
        },
      },
    },
    "small",
  ),
  { eligible: true, activated: true },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "minimal-stratum-protocol-candidate",
    {
      ...minimalStratumProtocolMediumActivationFixture,
      activation: {
        ...minimalStratumProtocolMediumActivationFixture.activation,
        primary_route: {
          ...minimalStratumProtocolMediumActivationFixture.activation.primary_route,
          stratum: "small",
          agent_id: "core-v4-build",
        },
      },
    },
    "small",
  ),
  { eligible: true, activated: false },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "minimal-stratum-no-mutation-remediation-candidate",
    minimalStratumProtocolMediumActivationFixture,
    "medium",
  ),
  { eligible: false, activated: false },
);
const successfulNoMutationRemediation = {
  eligible: true,
  trigger_reasons: ["edit-task-no-mutation"],
  operationally_complete: true,
  retry_started_count: 1,
  retry_completed_count: 1,
  retry_changed_count: 1,
  retry_reverified_count: 1,
  retry_verification_passed_count: 1,
};
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "minimal-stratum-no-mutation-remediation-candidate",
    {
      ...minimalStratumProtocolMediumActivationFixture,
      activation: {
        ...minimalStratumProtocolMediumActivationFixture.activation,
        verification_remediation: successfulNoMutationRemediation,
      },
    },
    "medium",
  ),
  { eligible: true, activated: true },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "minimal-stratum-no-mutation-remediation-candidate",
    {
      ...minimalStratumProtocolMediumActivationFixture,
      activation: {
        ...minimalStratumProtocolMediumActivationFixture.activation,
        verification_remediation: { ...successfulNoMutationRemediation, retry_changed_count: 0 },
      },
    },
    "medium",
  ),
  { eligible: true, activated: false },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "bounded-map-only-candidate",
    boundedMapOnlyMediumActivationFixture,
    "medium",
  ),
  { eligible: true, activated: true },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "bounded-map-only-candidate",
    {
      ...boundedMapOnlyMediumActivationFixture,
      activation: {
        ...boundedMapOnlyMediumActivationFixture.activation,
        host_verification: { activation_eligible: true, activated: true, allowed: false },
      },
    },
    "medium",
  ),
  { eligible: true, activated: true },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "bounded-map-only-candidate",
    {
      ...boundedMapOnlyMediumActivationFixture,
      activation: {
        ...boundedMapOnlyMediumActivationFixture.activation,
        bounded_context: { eligible: true, activated: false, reason: "map_unavailable" },
      },
    },
    "medium",
  ),
  { eligible: true, activated: false },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "bounded-map-only-candidate",
    {
      ...boundedMapOnlyMediumActivationFixture,
      activation: {
        ...boundedMapOnlyMediumActivationFixture.activation,
        bounded_context: { eligible: false, activated: false, reason: "not_eligible" },
      },
    },
    "small",
  ),
  { eligible: false, activated: false },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "edit-task-no-mutation-remediation-candidate",
    universalCompactProtocolMediumActivationFixture,
    "medium",
  ),
  { eligible: false, activated: false },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "edit-task-no-mutation-remediation-candidate",
    {
      ...universalCompactProtocolMediumActivationFixture,
      activation: {
        ...universalCompactProtocolMediumActivationFixture.activation,
        verification_remediation: {
          eligible: true,
          operationally_complete: true,
          retry_changed_count: 1,
          retry_reverified_count: 1,
          retry_verification_passed_count: 1,
          trigger_reasons: ["edit-task-no-mutation"],
        },
      },
    },
    "medium",
  ),
  { eligible: true, activated: true },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "edit-task-no-mutation-remediation-candidate",
    {
      ...universalCompactProtocolMediumActivationFixture,
      activation: {
        ...universalCompactProtocolMediumActivationFixture.activation,
        verification_remediation: {
          eligible: true,
          operationally_complete: true,
          retry_changed_count: 0,
          retry_reverified_count: 0,
          retry_verification_passed_count: 0,
          trigger_reasons: ["edit-task-no-mutation"],
        },
      },
    },
    "medium",
  ),
  { eligible: true, activated: false },
);
const highRiskFinalDiffReconciliationActivationFixture = {
  ...universalCompactProtocolMediumActivationFixture,
  activation: {
    ...universalCompactProtocolMediumActivationFixture.activation,
    primary_route: {
      ...universalCompactProtocolMediumActivationFixture.activation.primary_route,
      stratum: "high",
    },
    verification_remediation: {
      eligible: true,
      retry_started_count: 1,
      retry_completed_count: 1,
      retry_changed_count: 0,
      retry_reverified_count: 0,
      operationally_complete: true,
      trigger_reasons: ["high-risk-final-diff-reconciliation"],
    },
  },
};
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "high-risk-final-diff-reconciliation-candidate",
    highRiskFinalDiffReconciliationActivationFixture,
    "high",
  ),
  { eligible: true, activated: true },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "high-risk-final-diff-reconciliation-candidate",
    {
      ...highRiskFinalDiffReconciliationActivationFixture,
      activation: {
        ...highRiskFinalDiffReconciliationActivationFixture.activation,
        verification_remediation: {
          ...highRiskFinalDiffReconciliationActivationFixture.activation.verification_remediation,
          retry_changed_count: 1,
          retry_reverified_count: 1,
        },
      },
    },
    "high",
  ),
  { eligible: true, activated: true },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "high-risk-final-diff-reconciliation-candidate",
    {
      ...highRiskFinalDiffReconciliationActivationFixture,
      activation: {
        ...highRiskFinalDiffReconciliationActivationFixture.activation,
        verification_remediation: {
          ...highRiskFinalDiffReconciliationActivationFixture.activation.verification_remediation,
          retry_changed_count: 1,
          retry_reverified_count: 0,
        },
      },
    },
    "high",
  ),
  { eligible: true, activated: false },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "high-risk-final-diff-reconciliation-candidate",
    universalCompactProtocolMediumActivationFixture,
    "medium",
  ),
  { eligible: false, activated: false },
);
const terminalFailureRemediationActivationFixture = {
  ...universalCompactProtocolMediumActivationFixture,
  activation: {
    ...universalCompactProtocolMediumActivationFixture.activation,
    verification_remediation: {
      eligible: true,
      retry_started_count: 1,
      retry_completed_count: 1,
      retry_changed_count: 1,
      retry_reverified_count: 1,
      retry_verification_passed_count: 1,
      operationally_complete: true,
      trigger_reasons: ["public-check-failed"],
    },
  },
};
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "terminal-failure-remediation-candidate",
    terminalFailureRemediationActivationFixture,
    "medium",
  ),
  { eligible: true, activated: true },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "terminal-failure-remediation-candidate",
    {
      ...terminalFailureRemediationActivationFixture,
      activation: {
        ...terminalFailureRemediationActivationFixture.activation,
        verification_remediation: {
          ...terminalFailureRemediationActivationFixture.activation.verification_remediation,
          retry_changed_count: 0,
          retry_reverified_count: 0,
          retry_verification_passed_count: 0,
        },
      },
    },
    "medium",
  ),
  { eligible: true, activated: false },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "terminal-failure-remediation-candidate",
    {
      ...terminalFailureRemediationActivationFixture,
      activation: {
        ...terminalFailureRemediationActivationFixture.activation,
        verification_remediation: {
          ...terminalFailureRemediationActivationFixture.activation.verification_remediation,
          trigger_reasons: ["public-check-failed", "edit-task-no-mutation"],
        },
      },
    },
    "medium",
  ),
  { eligible: false, activated: false },
);
const terminalFailureReplacementActivationFixture = {
  ...terminalFailureRemediationActivationFixture,
  activation: {
    ...terminalFailureRemediationActivationFixture.activation,
    verification_remediation: {
      ...terminalFailureRemediationActivationFixture.activation.verification_remediation,
      replacement_reset_attempted_count: 1,
      replacement_reset_completed_count: 1,
    },
  },
};
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "terminal-failure-replacement-candidate",
    terminalFailureReplacementActivationFixture,
    "medium",
  ),
  { eligible: true, activated: true },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "terminal-failure-replacement-candidate",
    {
      ...terminalFailureReplacementActivationFixture,
      activation: {
        ...terminalFailureReplacementActivationFixture.activation,
        verification_remediation: {
          ...terminalFailureReplacementActivationFixture.activation.verification_remediation,
          replacement_reset_completed_count: 0,
        },
      },
    },
    "medium",
  ),
  { eligible: true, activated: false },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "terminal-failure-replacement-candidate",
    {
      ...terminalFailureReplacementActivationFixture,
      activation: {
        ...terminalFailureReplacementActivationFixture.activation,
        verification_remediation: {
          ...terminalFailureReplacementActivationFixture.activation.verification_remediation,
          replacement_reset_attempted_count: 0,
          replacement_reset_completed_count: 0,
          trigger_reasons: ["edit-task-no-mutation"],
        },
      },
    },
    "medium",
  ),
  { eligible: true, activated: true },
);
const highRiskCompactProtocolActivationFixture = {
  ...universalCompactProtocolMediumActivationFixture,
  activation: {
    ...universalCompactProtocolMediumActivationFixture.activation,
    primary_route: {
      ...universalCompactProtocolMediumActivationFixture.activation.primary_route,
      stratum: "high",
      agent_id: "core-v6-build",
    },
  },
};
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "high-risk-compact-protocol-candidate",
    highRiskCompactProtocolActivationFixture,
    "high",
  ),
  { eligible: true, activated: true },
);
assert.deepEqual(
  evaluateBenchmarkV2MechanismActivation(
    "high-risk-compact-protocol-candidate",
    {
      ...highRiskCompactProtocolActivationFixture,
      activation: {
        ...highRiskCompactProtocolActivationFixture.activation,
        primary_route: {
          ...highRiskCompactProtocolActivationFixture.activation.primary_route,
          agent_id: "core-v4-build",
        },
      },
    },
    "high",
  ),
  { eligible: true, activated: false },
);
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
const terminalFailureNoopAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: terminalFailureRemediationPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: conditionalNoopAttempt,
});
assert.equal(terminalFailureNoopAcceptance.status, "passed");
assert.deepEqual(terminalFailureNoopAcceptance.activation, { eligible: false, activated: false });
assert.deepEqual(terminalFailureNoopAcceptance.mechanism_acceptance, {
  satisfied: true,
  mode: "verified-not-needed",
});
const terminalFailureReplacementNoopAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: terminalFailureReplacementPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: conditionalNoopAttempt,
});
assert.equal(terminalFailureReplacementNoopAcceptance.status, "passed");
assert.deepEqual(terminalFailureReplacementNoopAcceptance.activation, { eligible: false, activated: false });
assert.deepEqual(terminalFailureReplacementNoopAcceptance.mechanism_acceptance, {
  satisfied: true,
  mode: "verified-not-needed",
});
const terminalFailureWrongRouteNoopAcceptance = await executeBenchmarkV2Acceptance({
  repositoryRoot: root,
  plan: terminalFailureRemediationPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: async (input) => {
    const attempt = await conditionalNoopAttempt(input);
    if (input.profileId !== "P46") return attempt;
    return Object.freeze({
      ...attempt,
      result: Object.freeze({
        ...attempt.result,
        vnext_primary_route_observation: Object.freeze({
          ...attempt.result.vnext_primary_route_observation,
          agent_id: "build",
        }),
      }),
    });
  },
});
assert.equal(terminalFailureWrongRouteNoopAcceptance.status, "failed");
assert.deepEqual(terminalFailureWrongRouteNoopAcceptance.mechanism_acceptance, {
  satisfied: false,
  mode: "unsatisfied",
});
assert.equal(report.status, "complete");
assert.equal(report.pair_results.length, 36);
assert.deepEqual(report.pair_results[0].baseline.execution_diagnostics, {
  exit_code: 0,
  stdout_bytes: 512,
  stderr_bytes: 0,
  stderr_fingerprint: null,
});
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
const smallProtocolOnlyReport = await executeBenchmarkV2Campaign({
  repositoryRoot: root,
  plan: smallProtocolOnlyPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(smallProtocolOnlyReport.status, "complete");
assert.equal(smallProtocolOnlyReport.summary.statistics.activation.rate, 1);
assert.deepEqual(
  smallProtocolOnlyReport.pair_results.reduce((routes, pair) => {
    const route = pair.candidate.activation.primary_route;
    const key = `${route.stratum}:${route.agent_id}:${route.visible_contract_version}`;
    routes[key] = (routes[key] ?? 0) + 1;
    return routes;
  }, {}),
  {
    "small:core-v4-build:NONE": 12,
    "medium:build:NONE": 12,
    "high:build:NONE": 12,
  },
);
assert.equal(validateBenchmarkV2CampaignReport(smallProtocolOnlyReport, { repositoryRoot: root }), smallProtocolOnlyReport);
const universalCompactProtocolReport = await executeBenchmarkV2Campaign({
  repositoryRoot: root,
  plan: universalCompactProtocolPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(universalCompactProtocolReport.status, "complete");
assert.equal(universalCompactProtocolReport.summary.statistics.activation.rate, 1);
assert.deepEqual(
  universalCompactProtocolReport.pair_results.reduce((routes, pair) => {
    const route = pair.candidate.activation.primary_route;
    const key = `${route.stratum}:${route.agent_id}:${route.visible_contract_version}`;
    routes[key] = (routes[key] ?? 0) + 1;
    return routes;
  }, {}),
  {
    "small:core-v4-build:NONE": 12,
    "medium:core-v4-build:NONE": 12,
    "high:core-v4-build:NONE": 12,
  },
);
assert.equal(validateBenchmarkV2CampaignReport(universalCompactProtocolReport, { repositoryRoot: root }), universalCompactProtocolReport);
const minimalStratumProtocolReport = await executeBenchmarkV2Campaign({
  repositoryRoot: root,
  plan: minimalStratumProtocolPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(minimalStratumProtocolReport.status, "complete");
assert.equal(minimalStratumProtocolReport.summary.statistics.activation.rate, 1);
assert.deepEqual(
  minimalStratumProtocolReport.pair_results.reduce((routes, pair) => {
    const route = pair.candidate.activation.primary_route;
    const key = `${route.stratum}:${route.agent_id}:${route.visible_contract_version}`;
    routes[key] = (routes[key] ?? 0) + 1;
    return routes;
  }, {}),
  {
    "small:build:NONE": 12,
    "medium:core-v4-build:NONE": 12,
    "high:core-v4-build:NONE": 12,
  },
);
assert.equal(
  minimalStratumProtocolReport.pair_results.filter((pair) => pair.candidate.activation.bounded_context.activated).length,
  0,
);
assert.equal(
  minimalStratumProtocolReport.pair_results.filter((pair) => pair.candidate.activation.visible_contract.activated).length,
  0,
);
assert.equal(
  validateBenchmarkV2CampaignReport(minimalStratumProtocolReport, { repositoryRoot: root }),
  minimalStratumProtocolReport,
);
const minimalStratumNoMutationReport = await executeBenchmarkV2Campaign({
  repositoryRoot: root,
  plan: minimalStratumNoMutationPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(minimalStratumNoMutationReport.status, "complete");
assert.equal(minimalStratumNoMutationReport.summary.statistics.activation.rate, null);
assert.deepEqual(
  minimalStratumNoMutationReport.pair_results.reduce((routes, pair) => {
    const route = pair.candidate.activation.primary_route;
    const key = `${route.stratum}:${route.agent_id}:${route.visible_contract_version}`;
    routes[key] = (routes[key] ?? 0) + 1;
    return routes;
  }, {}),
  {
    "small:build:NONE": 12,
    "medium:core-v4-build:NONE": 12,
    "high:core-v4-build:NONE": 12,
  },
);
assert.equal(
  validateBenchmarkV2CampaignReport(minimalStratumNoMutationReport, { repositoryRoot: root }),
  minimalStratumNoMutationReport,
);
const correctedRequirementsUniversalCompactReport = await executeBenchmarkV2Campaign({
  repositoryRoot: root,
  plan: correctedRequirementsUniversalCompactPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(correctedRequirementsUniversalCompactReport.status, "complete");
assert.equal(correctedRequirementsUniversalCompactReport.summary.statistics.activation.rate, 1);
assert.deepEqual(
  correctedRequirementsUniversalCompactReport.pair_results.reduce((routes, pair) => {
    const route = pair.candidate.activation.primary_route;
    const key = `${route.stratum}:${route.agent_id}:${route.visible_contract_version}`;
    routes[key] = (routes[key] ?? 0) + 1;
    return routes;
  }, {}),
  {
    "small:core-v4-build:NONE": 12,
    "medium:core-v4-build:NONE": 12,
    "high:core-v4-build:NONE": 12,
  },
);
assert.equal(
  validateBenchmarkV2CampaignReport(correctedRequirementsUniversalCompactReport, { repositoryRoot: root }),
  correctedRequirementsUniversalCompactReport,
);
const editTaskNoMutationRemediationReport = await executeBenchmarkV2Campaign({
  repositoryRoot: root,
  plan: editTaskNoMutationRemediationPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(editTaskNoMutationRemediationReport.status, "complete");
assert.equal(editTaskNoMutationRemediationReport.summary.statistics.activation.rate, null);
assert.equal(editTaskNoMutationRemediationReport.summary.guardrails.activation, false);
assert.equal(editTaskNoMutationRemediationReport.decision, "reject-development-candidate");
assert.equal(
  validateBenchmarkV2CampaignReport(editTaskNoMutationRemediationReport, { repositoryRoot: root }),
  editTaskNoMutationRemediationReport,
);
const repairedNoMutationRecoveryReport = await executeBenchmarkV2Campaign({
  repositoryRoot: root,
  plan: repairedNoMutationRecoveryPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(repairedNoMutationRecoveryReport.status, "complete");
assert.equal(repairedNoMutationRecoveryReport.summary.statistics.activation.rate, null);
assert.equal(repairedNoMutationRecoveryReport.summary.guardrails.activation, false);
assert.equal(repairedNoMutationRecoveryReport.decision, "reject-development-candidate");
assert.equal(
  validateBenchmarkV2CampaignReport(repairedNoMutationRecoveryReport, { repositoryRoot: root }),
  repairedNoMutationRecoveryReport,
);
const minimalDirectProtocolReport = await executeBenchmarkV2Campaign({
  repositoryRoot: root,
  plan: minimalDirectProtocolPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(minimalDirectProtocolReport.status, "complete");
assert.equal(minimalDirectProtocolReport.summary.statistics.activation.eligible_count, 36);
assert.equal(minimalDirectProtocolReport.summary.statistics.activation.activated_count, 36);
assert.equal(minimalDirectProtocolReport.summary.statistics.activation.rate, 1);
assert.equal(
  validateBenchmarkV2CampaignReport(minimalDirectProtocolReport, { repositoryRoot: root }),
  minimalDirectProtocolReport,
);
const highRiskFinalDiffReconciliationReport = await executeBenchmarkV2Campaign({
  repositoryRoot: root,
  plan: highRiskFinalDiffReconciliationPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(highRiskFinalDiffReconciliationReport.status, "complete");
assert.equal(highRiskFinalDiffReconciliationReport.summary.statistics.activation.eligible_count, 12);
assert.equal(highRiskFinalDiffReconciliationReport.summary.statistics.activation.activated_count, 12);
assert.equal(highRiskFinalDiffReconciliationReport.summary.statistics.activation.rate, 1);
assert.equal(
  validateBenchmarkV2CampaignReport(highRiskFinalDiffReconciliationReport, { repositoryRoot: root }),
  highRiskFinalDiffReconciliationReport,
);
const terminalFailureRemediationReport = await executeBenchmarkV2Campaign({
  repositoryRoot: root,
  plan: terminalFailureRemediationPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(terminalFailureRemediationReport.status, "complete");
assert.equal(terminalFailureRemediationReport.summary.statistics.activation.eligible_count, 36);
assert.equal(terminalFailureRemediationReport.summary.statistics.activation.activated_count, 36);
assert.equal(terminalFailureRemediationReport.summary.statistics.activation.rate, 1);
assert.equal(
  validateBenchmarkV2CampaignReport(terminalFailureRemediationReport, { repositoryRoot: root }),
  terminalFailureRemediationReport,
);
const terminalFailureReplacementReport = await executeBenchmarkV2Campaign({
  repositoryRoot: root,
  plan: terminalFailureReplacementPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(terminalFailureReplacementReport.status, "complete");
assert.equal(terminalFailureReplacementReport.summary.statistics.activation.eligible_count, 36);
assert.equal(terminalFailureReplacementReport.summary.statistics.activation.activated_count, 36);
assert.equal(terminalFailureReplacementReport.summary.statistics.activation.rate, 1);
assert.equal(
  validateBenchmarkV2CampaignReport(terminalFailureReplacementReport, { repositoryRoot: root }),
  terminalFailureReplacementReport,
);
const highRiskCompactProtocolReport = await executeBenchmarkV2Campaign({
  repositoryRoot: root,
  plan: highRiskCompactProtocolPlan,
  executableIdentity: executableFingerprint,
  attemptRunner: fakeAttempt,
});
assert.equal(highRiskCompactProtocolReport.status, "complete");
assert.equal(highRiskCompactProtocolReport.summary.statistics.activation.rate, 1);
assert.deepEqual(
  highRiskCompactProtocolReport.pair_results.reduce((routes, pair) => {
    const route = pair.candidate.activation.primary_route;
    const key = `${route.stratum}:${route.agent_id}:${route.visible_contract_version}`;
    routes[key] = (routes[key] ?? 0) + 1;
    return routes;
  }, {}),
  {
    "small:core-v4-build:NONE": 12,
    "medium:core-v4-build:NONE": 12,
    "high:core-v6-build:NONE": 12,
  },
);
assert.equal(validateBenchmarkV2CampaignReport(highRiskCompactProtocolReport, { repositoryRoot: root }), highRiskCompactProtocolReport);
const tampered = structuredClone(report);
tampered.pair_results[0].candidate.metrics.duration_ms += 1;
assert.throws(() => validateBenchmarkV2CampaignReport(tampered, { repositoryRoot: root }), /REPORT_SCHEMA|REPORT_PAIRS/u);

process.stdout.write("benchmark v2 campaign passed\n");
