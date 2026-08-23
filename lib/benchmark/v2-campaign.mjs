import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { fingerprintProfileValue } from "../profile-v3.mjs";
import { evaluatePairedDefects } from "./paired-defect-evaluator.mjs";
import { resolveSyntheticOpenCodeExecutableIdentity } from "./opencode-adapter.mjs";
import { fingerprintVnextSyntheticProfile, materializeVnextSyntheticProfile } from "./profiles.mjs";
import {
  runSyntheticProfileAttempt,
  syntheticPairAttemptMismatchReasons,
} from "./runner.mjs";
import { loadBenchmarkV2Contracts, validateLoadedBenchmarkV2Contracts } from "./v2-contracts.mjs";
import { validateBenchmarkV2FreezeManifest } from "./v2-freeze.mjs";
import {
  buildBenchmarkV2HoldoutSelection,
  validateBenchmarkV2HoldoutSelection,
} from "./v2-holdout-selection.mjs";
import {
  buildBenchmarkV2ProceduralHoldoutPool,
  buildBenchmarkV2RealCommitHoldoutPool,
  renderBenchmarkV2DevelopmentCorpus,
  renderBenchmarkV2ProceduralHighCorpus,
  renderBenchmarkV2ProceduralMediumCorpus,
  renderBenchmarkV2ProceduralSmallCorpus,
  renderBenchmarkV2RealCommitCorpus,
  renderBenchmarkV2ValidationCorpus,
  validateBenchmarkV2DevelopmentCorpus,
  validateBenchmarkV2ValidationCorpus,
} from "./v2-fixtures.mjs";

const ARM_COMPONENT = Object.freeze({
  "P0:P1": "core-rules",
  "P1:P2": "targeted-verification",
  "P2:P3": "deep-context",
  "P3:P4": "independent-final-review",
  "P0:P6": "targeted-verification",
  "P6:P7": "independent-final-review",
  "P0:P7": "verified-review-candidate",
  "P6:P8": "independent-final-review",
  "P0:P8": "verified-review-candidate",
  "P6:P9": "verification-remediation",
  "P0:P9": "verified-remediation-candidate",
  "P6:P10": "verification-remediation",
  "P0:P10": "verified-remediation-candidate",
  "P10:P11": "retry-bounded-context",
  "P0:P11": "verified-remediation-context-candidate",
  "P10:P12": "verification-remediation",
  "P0:P12": "verified-remediation-candidate",
  "P10:P13": "diagnostic-guided-verification-remediation",
  "P0:P13": "verified-remediation-candidate",
  "P6:P14": "visible-contract-remediation",
  "P0:P14": "verified-contract-remediation-candidate",
  "P6:P15": "risk-gated-visible-contract-remediation",
  "P0:P15": "verified-risk-gated-contract-candidate",
  "P15:P16": "multi-target-contract-expansion",
  "P0:P16": "verified-multi-target-contract-candidate",
  "P6:P17": "specialized-visible-contract-remediation",
  "P0:P17": "verified-specialized-contract-candidate",
  "P0:P18": "stratified-core-candidate",
  "P6:P19": "risk-gated-specialized-visible-contract-remediation",
  "P0:P19": "verified-risk-gated-specialized-contract-candidate",
  "P0:P20": "core-v2-production-candidate",
  "P20:P21": "exact-core-v2-coordinator",
  "P0:P21": "core-v2-exact-coordinator-candidate",
  "P21:P22": "adversarial-counterexample-audit",
  "P0:P22": "core-v2-adversarial-audit-candidate",
  "P22:P23": "bounded-pre-mutation-context",
  "P0:P23": "core-v2-bounded-context-candidate",
  "P23:P24": "transactional-remediation-rollback",
  "P0:P24": "core-v2-transactional-candidate",
  "P0:P25": "contract-first-verified-context-candidate",
  "P0:P26": "host-compiled-visible-contract-candidate",
  "P0:P27": "stratified-visible-contract-audit-candidate",
  "P0:P28": "manifest-transactional-audit-candidate",
  "P0:P29": "evidence-gated-manifest-audit-candidate",
  "P0:P30": "manifest-risk-gated-audit-candidate",
  "P0:P31": "critical-manifest-risk-audit-candidate",
  "P0:P32": "reviewer-free-exact-core-candidate",
  "P0:P33": "scenario-typed-visible-contract-exact-core-candidate",
  "P0:P34": "public-check-failure-only-transactional-candidate",
  "P0:P35": "secret-mutation-guard-candidate",
  "P0:P36": "stratified-scenario-visible-contract-candidate",
  "P0:P4": "composite-core-candidate",
});
const SAFE_TEXT = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,199}$/u;

export class BenchmarkV2CampaignError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "BenchmarkV2CampaignError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new BenchmarkV2CampaignError(code, message);
}

function safeText(value, label) {
  if (typeof value !== "string" || !SAFE_TEXT.test(value)) fail("BENCHMARK_V2_CAMPAIGN_INPUT", `${label} is invalid`);
  return value;
}

function sourceState(root, allowDirty) {
  const shaResult = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", shell: false, windowsHide: true });
  const statusResult = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  const sha = shaResult.status === 0 ? shaResult.stdout.trim() : "";
  if (!/^[0-9a-f]{40}$/u.test(sha) || statusResult.status !== 0) fail("BENCHMARK_V2_SOURCE", "source Git state is unavailable");
  if (allowDirty !== true && statusResult.stdout.length !== 0) fail("BENCHMARK_V2_SOURCE_DIRTY", "model-backed campaign requires a clean committed source tree");
  return Object.freeze({ source_sha: sha, source_clean: statusResult.stdout.length === 0 });
}

function fileFingerprint(root, relativePaths) {
  return fingerprintProfileValue(relativePaths.map((relativePath) => ({
    path: relativePath,
    bytes: fs.readFileSync(path.resolve(root, ...relativePath.split("/")), "utf8"),
  })));
}

function campaignInstances(root, loaded, split, seed, repetition, selectionManifest = null, freezeManifest = null) {
  if (split === "development") {
    const instances = renderBenchmarkV2DevelopmentCorpus({
      repositoryRoot: root,
      manifest: loaded.dev,
      bindings: loaded.devBindings,
      seed,
      repetition,
    });
    validateBenchmarkV2DevelopmentCorpus(instances);
    return instances;
  }
  if (split === "validation") {
    const instances = renderBenchmarkV2ValidationCorpus({
      repositoryRoot: root,
      manifest: loaded.validation,
      bindings: loaded.validationBindings,
      seed,
      repetition,
    });
    validateBenchmarkV2ValidationCorpus(instances);
    return instances;
  }
  validateBenchmarkV2HoldoutSelection(selectionManifest);
  const render = {
    repositoryRoot: root,
    seed: /^sha256:[0-9a-f]{64}$/u.test(seed) ? seed.slice(7) : seed,
    repetition,
  };
  const procedural = [
    ...renderBenchmarkV2ProceduralSmallCorpus({ ...render, registry: loaded.proceduralCandidates }),
    ...renderBenchmarkV2ProceduralMediumCorpus({ ...render, registry: loaded.proceduralCandidates }),
    ...renderBenchmarkV2ProceduralHighCorpus({ ...render, registry: loaded.proceduralCandidates }),
  ];
  const real = renderBenchmarkV2RealCommitCorpus({
    ...render,
    registry: loaded.realCommitCandidates,
    requirements: loaded.realCommitRequirements,
  });
  if (repetition === 1) {
    const pools = [
      buildBenchmarkV2ProceduralHoldoutPool({ registry: loaded.proceduralCandidates, instances: procedural }),
      buildBenchmarkV2RealCommitHoldoutPool({ registry: loaded.realCommitCandidates, instances: real }),
    ];
    const observed = new Map(pools.flatMap((pool) => pool.candidates).map((entry) => [entry.id, entry.fixture_fingerprint]));
    if (selectionManifest.selected_families.some((entry) => observed.get(entry.id) !== entry.fixture_fingerprint)) {
      fail("BENCHMARK_V2_HOLDOUT_FIXTURE", "selected holdout fixture identity drifted after selection");
    }
    const excludedTaskIdentities = [
      ...loaded.dev.families.map((family) => `development-v2:${family.id}:${family.recipe_id}`),
      ...loaded.validation.families.map((family) => `validation-v2:${family.id}:${family.recipe_id}`),
    ];
    const rebuilt = buildBenchmarkV2HoldoutSelection({
      freezeManifest,
      selectionContract: loaded.holdout,
      proceduralPool: pools[0],
      realCommitPool: pools[1],
      excludedTaskIdentities,
    });
    if (rebuilt.selection_fingerprint !== selectionManifest.selection_fingerprint) {
      fail("BENCHMARK_V2_HOLDOUT_SELECTION", "selected holdout is not the canonical seeded selection");
    }
  }
  const selectedIds = new Set(selectionManifest.selected_families.map((entry) => entry.id));
  const instances = [...procedural, ...real].filter((instance) => selectedIds.has(instance.family_id));
  if (instances.length !== selectionManifest.family_count) {
    fail("BENCHMARK_V2_HOLDOUT_FIXTURE", "selected holdout families are unavailable");
  }
  return Object.freeze(instances);
}

function orderFor(seed, familyId, repetition, baselineArmId, candidateArmId) {
  const byte = createHash("sha256").update(`${seed}\0${familyId}\0${repetition}`).digest()[0];
  return Object.freeze(byte % 2 === 0
    ? [baselineArmId, candidateArmId]
    : [candidateArmId, baselineArmId]);
}

export function buildBenchmarkV2CampaignPlan({
  repositoryRoot,
  split,
  generationId,
  baselineArmId,
  candidateArmId,
  model,
  provider,
  variant,
  timeoutMs = 300_000,
  seed,
  repetitions = 1,
  validationUseOrdinal = null,
  executableIdentity = null,
  allowDirty = false,
  freezeManifest = null,
  selectionManifest = null,
  salt = null,
} = {}) {
  const root = fs.realpathSync.native(path.resolve(repositoryRoot));
  if (!["development", "validation", "holdout"].includes(split)) fail("BENCHMARK_V2_CAMPAIGN_INPUT", "split must be development, validation, or holdout");
  safeText(generationId, "generationId");
  safeText(baselineArmId, "baselineArmId");
  safeText(candidateArmId, "candidateArmId");
  const componentId = ARM_COMPONENT[`${baselineArmId}:${candidateArmId}`];
  if (componentId === undefined) fail("BENCHMARK_V2_CAMPAIGN_ARMS", "campaign arms must be a registered development transition or P0:P4 composite");
  safeText(model, "model");
  safeText(provider, "provider");
  safeText(variant, "variant");
  safeText(seed, "seed");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 60_000 || timeoutMs > 3_600_000
    || !Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 2) {
    fail("BENCHMARK_V2_CAMPAIGN_INPUT", "timeout or repetitions are invalid");
  }
  if ((split === "validation" && ![1, 2].includes(validationUseOrdinal))
    || (split !== "validation" && validationUseOrdinal !== null)) {
    fail("BENCHMARK_V2_VALIDATION_USE", "validation use ordinal must be 1 or 2 only for validation campaigns");
  }
  const loaded = loadBenchmarkV2Contracts(root);
  const contractValidation = validateLoadedBenchmarkV2Contracts(root);
  const state = sourceState(root, allowDirty);
  const baselineProfileFingerprint = fingerprintVnextSyntheticProfile({ sourceRoot: root, profileId: baselineArmId });
  const candidateProfileFingerprint = fingerprintVnextSyntheticProfile({ sourceRoot: root, profileId: candidateArmId });
  const identity = executableIdentity ?? resolveSyntheticOpenCodeExecutableIdentity();
  const executableFingerprint = typeof identity === "string" ? identity : identity?.fingerprint ?? null;
  if (split === "holdout") {
    validateBenchmarkV2FreezeManifest(freezeManifest, {
      repositoryRoot: root,
      salt,
      requireClean: allowDirty !== true,
      observedExecutableFingerprint: executableFingerprint,
    });
    validateBenchmarkV2HoldoutSelection(selectionManifest);
    if (repetitions !== 2 || seed !== freezeManifest.holdout_seed
      || freezeManifest.bindings.harness_source_sha !== state.source_sha
      || freezeManifest.bindings.candidate_profile_id !== candidateArmId
      || freezeManifest.bindings.candidate_profile_fingerprint !== candidateProfileFingerprint
      || freezeManifest.bindings.model !== model || freezeManifest.bindings.provider !== provider
      || freezeManifest.bindings.variant !== variant || freezeManifest.bindings.timeout_ms !== timeoutMs
      || selectionManifest.freeze_fingerprint !== freezeManifest.freeze_fingerprint
      || selectionManifest.holdout_seed !== freezeManifest.holdout_seed
      || selectionManifest.harness_source_sha !== state.source_sha
      || selectionManifest.selection_contract_fingerprint !== fingerprintProfileValue(loaded.holdout)) {
      fail("BENCHMARK_V2_HOLDOUT_BINDING", "holdout campaign does not match the frozen candidate and post-freeze selection");
    }
  } else if (freezeManifest !== null || selectionManifest !== null || salt !== null) {
    fail("BENCHMARK_V2_HOLDOUT_BINDING", "confirmatory evidence is only valid for holdout campaigns");
  }
  const schedules = [];
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    for (const instance of campaignInstances(root, loaded, split, seed, repetition, selectionManifest, freezeManifest)) {
      const stratum = selectionManifest?.selected_families.find((entry) => entry.id === instance.family_id)?.stratum
        ?? instance.family_id.split("-")[1];
      const source = {
        family_id: instance.family_id,
        stratum,
        repetition,
        order: orderFor(seed, instance.family_id, repetition, baselineArmId, candidateArmId),
        instance_fingerprint: instance.instance_fingerprint,
      };
      schedules.push(Object.freeze({ ...source, pair_id: fingerprintProfileValue(source) }));
    }
  }
  const splitManifest = split === "development" ? loaded.dev
    : split === "validation" ? loaded.validation : selectionManifest;
  const splitBindings = split === "development" ? loaded.devBindings
    : split === "validation" ? loaded.validationBindings : Object.freeze({
      freeze_fingerprint: freezeManifest.freeze_fingerprint,
      selection_fingerprint: selectionManifest.selection_fingerprint,
    });
  const bindings = Object.freeze({
    source_sha: state.source_sha,
    baseline_profile_fingerprint: baselineProfileFingerprint,
    candidate_profile_fingerprint: candidateProfileFingerprint,
    evaluator_fingerprint: split === "holdout" ? freezeManifest.bindings.evaluator_fingerprint
      : fileFingerprint(root, ["lib/benchmark/paired-defect-evaluator.mjs", "lib/benchmark/v2-campaign.mjs"]),
    promotion_policy_fingerprint: split === "holdout" ? freezeManifest.bindings.promotion_policy_fingerprint
      : fingerprintProfileValue(loaded.policy),
    task_generator_fingerprint: split === "holdout" ? freezeManifest.bindings.task_generator_fingerprint
      : fileFingerprint(root, [
      "lib/benchmark/v2-fixtures.mjs", "lib/benchmark/v2-validation-kernels.mjs",
      "lib/benchmark/v2-holdout-kernels.mjs", "lib/benchmark/v2-real-holdout-kernels.mjs",
      "lib/benchmark/vnext-fixtures.mjs", "lib/benchmark/renderer.mjs", "lib/benchmark/contracts.mjs",
      "benchmarks/synthetic/templates.v2.json", "benchmarks/synthetic/families.v2.json",
    ]),
    holdout_selection_fingerprint: split === "holdout" ? selectionManifest.selection_fingerprint
      : fingerprintProfileValue({ split, split_manifest: splitManifest, render_bindings: splitBindings }),
    model,
    provider,
    variant,
    timeout_ms: timeoutMs,
    fixture_fingerprint: fingerprintProfileValue(schedules.map((entry) => ({
      pair_id: entry.pair_id,
      instance_fingerprint: entry.instance_fingerprint,
    }))),
    seed,
    arm_ordering_policy: "sha256-family-repetition-counterbalance-v1",
    executable_fingerprint: executableFingerprint,
    ...(split === "holdout" ? {
      freeze_fingerprint: freezeManifest.freeze_fingerprint,
      confirmatory_round: freezeManifest.confirmatory_round,
      allocated_alpha: freezeManifest.allocated_alpha,
    } : {}),
  });
  const body = {
    schema_version: 2,
    plan_kind: "benchmark-v2-campaign-plan",
    split,
    generation_id: generationId,
    validation_use_ordinal: validationUseOrdinal,
    component_id: componentId,
    baseline_arm_id: baselineArmId,
    candidate_arm_id: candidateArmId,
    repetitions,
    schedules: Object.freeze(schedules),
    bindings,
    contract_fingerprint: contractValidation.contract_fingerprint,
  };
  return Object.freeze({ ...body, plan_fingerprint: fingerprintProfileValue(body) });
}

function defectFindings(result, familyId, stratum) {
  const findings = [];
  const add = (suffix, severity, kind, sourceId, pathValue, contract, summary) => findings.push({
    finding_id: `${familyId}-${suffix}`,
    family: familyId,
    violated_contract: contract,
    evidence_source: { kind, source_id: sourceId, path: pathValue, summary },
    severity,
  });
  if (result.hidden_check?.passed === false) {
    add("hidden-contract", stratum === "high" ? "high" : "medium", "trusted-check", "hidden-check", null,
      "task-hidden-examples", "Runner-owned hidden examples or consumers failed after model settlement.");
  }
  if (result.workspace_policy?.passed === false) {
    add("scope", "medium", "workspace-policy", "workspace-policy", null,
      "declared-change-scope", `Workspace policy failed: ${(result.workspace_policy.violations ?? []).join(",")}.`);
  }
  if (result.common_safety?.passed === false) {
    add("safety", "critical", "safety-oracle", "common-safety", null,
      "common-safety-boundary", `Common safety failed: ${(result.common_safety.violations ?? []).join(",")}.`);
  }
  return findings;
}

function armEvaluation(result, familyId, stratum) {
  const functionalTaskSuccess = result.visible_check?.passed === true
    && result.hidden_check?.passed === true
    && result.teardown?.passed === true
    && result.cleanup?.passed === true;
  return Object.freeze({
    functional_task_success: functionalTaskSuccess,
    scope_violation: result.workspace_policy?.passed !== true,
    findings: Object.freeze(defectFindings(result, familyId, stratum)),
  });
}

function attemptSummary(attempt, familyId, stratum) {
  const result = attempt.result;
  return Object.freeze({
    profile_id: result.profile_id,
    execution_status: result.execution_status,
    termination_reason: result.termination_reason,
    reason: result.reason,
    evidence_complete: result.evidence_complete,
    result_fingerprint: fingerprintProfileValue(result),
    binding_fingerprint: fingerprintProfileValue(attempt.binding),
    evaluation: armEvaluation(result, familyId, stratum),
    metrics: result.metrics,
    activation: Object.freeze({
      host_verification: result.vnext_host_verification_observation ?? null,
      automatic_review: result.vnext_automatic_review_observation ?? null,
      bounded_context: result.vnext_context_map_observation ?? null,
      visible_contract: result.vnext_visible_contract_observation ?? null,
      verification_remediation: result.vnext_verification_remediation_observation ?? null,
      secret_mutation_guard: result.vnext_secret_mutation_guard_observation ?? null,
    }),
    audit_evidence: result.audit_evidence,
  });
}

export function evaluateBenchmarkV2MechanismActivation(componentId, candidate, stratum) {
  if (componentId === "core-rules") return { eligible: true, activated: candidate.evidence_complete === true };
  if (componentId === "targeted-verification") {
    const value = candidate.activation.host_verification;
    return { eligible: value?.activation_eligible === true, activated: value?.activated === true };
  }
  if (componentId === "independent-final-review") {
    const value = candidate.activation.automatic_review;
    return { eligible: ["medium", "high"].includes(stratum), activated: value?.operationally_complete === true };
  }
  if (componentId === "deep-context") {
    const value = candidate.activation.bounded_context;
    return { eligible: stratum === "medium", activated: value?.activated === true };
  }
  if (["verification-remediation", "diagnostic-guided-verification-remediation"].includes(componentId)) {
    const value = candidate.activation.verification_remediation;
    const eligible = value?.eligible === true;
    return { eligible, activated: eligible && value?.operationally_complete === true };
  }
  if (componentId === "visible-contract-remediation") {
    const value = candidate.activation.verification_remediation;
    const eligible = ["medium", "high"].includes(stratum) && value?.eligible === true;
    return { eligible, activated: eligible && value?.operationally_complete === true };
  }
  if (componentId === "risk-gated-visible-contract-remediation") {
    const value = candidate.activation.verification_remediation;
    const eligible = value?.eligible === true;
    return { eligible, activated: eligible && value?.operationally_complete === true };
  }
  if (componentId === "multi-target-contract-expansion") {
    const value = candidate.activation.verification_remediation;
    const eligible = stratum === "medium"
      && value?.eligible === true
      && value?.trigger_reasons?.includes("multi-target") === true;
    return { eligible, activated: eligible && value?.operationally_complete === true };
  }
  if (componentId === "specialized-visible-contract-remediation") {
    const value = candidate.activation.verification_remediation;
    const eligible = ["medium", "high"].includes(stratum)
      && value?.eligible === true
      && value?.trigger_reasons?.includes("specialized-visible-contract") === true;
    return { eligible, activated: eligible && value?.operationally_complete === true };
  }
  if (componentId === "risk-gated-specialized-visible-contract-remediation") {
    const value = candidate.activation.verification_remediation;
    const eligible = value?.eligible === true
      && value?.trigger_reasons?.includes("risk-gated-specialized-visible-contract") === true;
    return { eligible, activated: eligible && value?.operationally_complete === true };
  }
  if (componentId === "stratified-core-candidate" && stratum === "small") {
    return { eligible: true, activated: candidate.evidence_complete === true };
  }
  if (componentId === "public-check-failure-only-transactional-candidate") {
    const remediation = candidate.activation.verification_remediation;
    const eligible = remediation?.eligible === true
      && remediation?.trigger_reasons?.includes("public-check-failed") === true;
    return {
      eligible,
      activated: eligible
        && remediation?.operationally_complete === true
        && (remediation?.rollback_attempted_count !== 1 || remediation?.rollback_completed_count === 1),
    };
  }
  if (componentId === "secret-mutation-guard-candidate") {
    const value = candidate.activation.secret_mutation_guard;
    return {
      eligible: value?.eligible === true,
      activated: value?.activated === true,
    };
  }
  if (componentId === "stratified-scenario-visible-contract-candidate") {
    const value = candidate.activation.visible_contract;
    return {
      eligible: value?.eligible === true,
      activated: value?.activated === true,
    };
  }
  if (["bounded-pre-mutation-context", "core-v2-bounded-context-candidate", "transactional-remediation-rollback", "core-v2-transactional-candidate", "contract-first-verified-context-candidate", "host-compiled-visible-contract-candidate", "stratified-visible-contract-audit-candidate", "manifest-transactional-audit-candidate", "evidence-gated-manifest-audit-candidate", "manifest-risk-gated-audit-candidate", "critical-manifest-risk-audit-candidate"].includes(componentId)) {
    const verification = candidate.activation.host_verification;
    const remediation = candidate.activation.verification_remediation;
    const context = candidate.activation.bounded_context;
    const visibleContract = candidate.activation.visible_contract;
    const verificationEligible = verification?.activation_eligible === true;
    const remediationEligible = remediation?.eligible === true;
    const contextEligible = context?.eligible === true;
    const visibleContractEligible = visibleContract?.eligible === true;
    return {
      eligible: verificationEligible || remediationEligible || contextEligible || visibleContractEligible,
      activated: (!verificationEligible || verification?.activated === true)
        && (!remediationEligible || remediation?.operationally_complete === true)
        && (!contextEligible || context?.activated === true)
        && (!visibleContractEligible || visibleContract?.activated === true)
        && (remediation?.rollback_attempted_count !== 1 || remediation?.rollback_completed_count === 1),
    };
  }
  if (["reviewer-free-exact-core-candidate", "scenario-typed-visible-contract-exact-core-candidate"].includes(componentId)) {
    const verification = candidate.activation.host_verification;
    const context = candidate.activation.bounded_context;
    const visibleContract = candidate.activation.visible_contract;
    const remediation = candidate.activation.verification_remediation;
    const verificationEligible = verification?.activation_eligible === true;
    const contextEligible = context?.eligible === true;
    const visibleContractEligible = visibleContract?.eligible === true;
    return {
      eligible: verificationEligible || contextEligible || visibleContractEligible,
      activated: (!verificationEligible || verification?.activated === true)
        && (!contextEligible || context?.activated === true)
        && (!visibleContractEligible || visibleContract?.activated === true)
        && remediation?.eligible === false
        && remediation?.retry_started_count === 0,
    };
  }
  if (["verified-risk-gated-contract-candidate", "verified-multi-target-contract-candidate", "verified-specialized-contract-candidate", "verified-risk-gated-specialized-contract-candidate", "core-v2-production-candidate", "exact-core-v2-coordinator", "core-v2-exact-coordinator-candidate", "adversarial-counterexample-audit", "core-v2-adversarial-audit-candidate", "stratified-core-candidate"].includes(componentId)) {
    const verification = candidate.activation.host_verification;
    const remediation = candidate.activation.verification_remediation;
    const verificationEligible = verification?.activation_eligible === true;
    const remediationEligible = remediation?.eligible === true;
    return {
      eligible: verificationEligible || remediationEligible,
      activated: (!verificationEligible || verification?.activated === true)
        && (!remediationEligible || remediation?.operationally_complete === true),
    };
  }
  if (componentId === "retry-bounded-context") {
    const remediation = candidate.activation.verification_remediation;
    const context = candidate.activation.bounded_context;
    return {
      eligible: stratum === "medium" && remediation?.eligible === true,
      activated: context?.activated === true,
    };
  }
  if (componentId === "verified-review-candidate") {
    const verification = candidate.activation.host_verification;
    const review = candidate.activation.automatic_review;
    return {
      eligible: true,
      activated: verification?.activated === true
        && (!["medium", "high"].includes(stratum) || review?.operationally_complete === true),
    };
  }
  if (componentId === "verified-remediation-candidate") {
    const verification = candidate.activation.host_verification;
    const remediation = candidate.activation.verification_remediation;
    return {
      eligible: true,
      activated: verification?.activated === true
        && (remediation?.eligible !== true || remediation?.operationally_complete === true),
    };
  }
  const verification = candidate.activation.host_verification;
  const review = candidate.activation.automatic_review;
  const context = candidate.activation.bounded_context;
  const eligible = true;
  const activated = verification?.activated === true
    && (!["medium", "high"].includes(stratum) || review?.operationally_complete === true)
    && (stratum !== "medium" || context?.activated === true);
  return { eligible, activated };
}

function seededUnit(seed, index) {
  return Number.parseInt(createHash("sha256").update(`${seed}\0${index}`).digest("hex").slice(0, 13), 16) / 0x10000000000000;
}

function mean(values) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(sorted, probability) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * probability)))];
}

function clusteredDeltaSummary(pairs, selector, seed) {
  const byFamily = new Map();
  for (const pair of pairs) {
    if (!byFamily.has(pair.family_id)) byFamily.set(pair.family_id, []);
    byFamily.get(pair.family_id).push(selector(pair));
  }
  const rows = [...byFamily.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([familyId, values]) => ({
    family_id: familyId,
    baseline: mean(values.map((entry) => entry.baseline)),
    candidate: mean(values.map((entry) => entry.candidate)),
  }));
  const baseline = mean(rows.map((entry) => entry.baseline));
  const candidate = mean(rows.map((entry) => entry.candidate));
  const delta = candidate - baseline;
  const samples = [];
  for (let sample = 0; sample < 2_000; sample += 1) {
    const deltas = [];
    for (let draw = 0; draw < rows.length; draw += 1) {
      const selected = rows[Math.min(rows.length - 1, Math.floor(seededUnit(`${seed}:${sample}`, draw) * rows.length))];
      deltas.push(selected.candidate - selected.baseline);
    }
    samples.push(mean(deltas));
  }
  samples.sort((left, right) => left - right);
  return Object.freeze({
    baseline,
    candidate,
    paired_delta: delta,
    confidence_interval: Object.freeze([Math.min(delta, percentile(samples, 0.025)), Math.max(delta, percentile(samples, 0.975))]),
  });
}

export function evaluateExactFamilyClusterPermutation(pairs) {
  const byFamily = new Map();
  for (const pair of pairs) {
    const delta = Number(pair.defects.candidate.regression_free_task_success)
      - Number(pair.defects.baseline.regression_free_task_success);
    byFamily.set(pair.family_id, (byFamily.get(pair.family_id) ?? 0) + delta);
  }
  const observedDifferenceSum = [...byFamily.values()].reduce((sum, value) => sum + value, 0);
  const weights = [...byFamily.values()].filter((value) => value !== 0).map(Math.abs);
  let distribution = new Map([[0, 1n]]);
  for (const weight of weights) {
    const next = new Map();
    for (const [sum, count] of distribution) {
      next.set(sum + weight, (next.get(sum + weight) ?? 0n) + count);
      next.set(sum - weight, (next.get(sum - weight) ?? 0n) + count);
    }
    distribution = next;
  }
  const tail = [...distribution.entries()].filter(([sum]) => sum >= observedDifferenceSum)
    .reduce((count, [, values]) => count + values, 0n);
  const total = 1n << BigInt(weights.length);
  return Object.freeze({
    family_count: byFamily.size,
    nonzero_family_cluster_count: weights.length,
    observed_family_difference_sum: observedDifferenceSum,
    p_value: Number(tail) / Number(total),
  });
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[midpoint - 1] + sorted[midpoint]) / 2 : sorted[midpoint];
}

function aggregateMetricRatio(pairs, metric) {
  const baseline = pairs.map((entry) => entry.baseline.metrics[metric]).filter(Number.isFinite);
  const candidate = pairs.map((entry) => entry.candidate.metrics[metric]).filter(Number.isFinite);
  if (baseline.length !== pairs.length || candidate.length !== pairs.length || pairs.length === 0) return null;
  return Object.freeze({
    baseline_median: median(baseline),
    candidate_median: median(candidate),
    median_ratio: median(candidate) / Math.max(1, median(baseline)),
    baseline_mean: mean(baseline),
    candidate_mean: mean(candidate),
    mean_ratio: mean(candidate) / Math.max(1, mean(baseline)),
  });
}

function summarizeCampaign(plan, pairs, policy) {
  const completePairs = pairs.filter((entry) => entry.status === "complete");
  if (completePairs.length === 0) return null;
  const primary = clusteredDeltaSummary(completePairs, (pair) => ({
    baseline: Number(pair.defects.baseline.regression_free_task_success),
    candidate: Number(pair.defects.candidate.regression_free_task_success),
  }), `${plan.plan_fingerprint}:primary`);
  const smallPairs = completePairs.filter((entry) => entry.stratum === "small");
  const small = clusteredDeltaSummary(smallPairs, (pair) => ({
    baseline: Number(pair.defects.baseline.regression_free_task_success),
    candidate: Number(pair.defects.candidate.regression_free_task_success),
  }), `${plan.plan_fingerprint}:small`);
  const medium = clusteredDeltaSummary(completePairs.filter((entry) => entry.stratum === "medium"), (pair) => ({
    baseline: Number(pair.defects.baseline.regression_free_task_success),
    candidate: Number(pair.defects.candidate.regression_free_task_success),
  }), `${plan.plan_fingerprint}:medium`);
  const high = clusteredDeltaSummary(completePairs.filter((entry) => entry.stratum === "high"), (pair) => ({
    baseline: Number(pair.defects.baseline.regression_free_task_success),
    candidate: Number(pair.defects.candidate.regression_free_task_success),
  }), `${plan.plan_fingerprint}:high`);
  const safety = clusteredDeltaSummary(completePairs, (pair) => ({
    baseline: Number(pair.baseline.result_summary.hidden_safety_failed === true),
    candidate: Number(pair.candidate.result_summary.hidden_safety_failed === true),
  }), `${plan.plan_fingerprint}:safety`);
  const timeout = clusteredDeltaSummary(completePairs, (pair) => ({
    baseline: Number(pair.baseline.timeout),
    candidate: Number(pair.candidate.timeout),
  }), `${plan.plan_fingerprint}:timeout`);
  let baselineOnly = 0;
  let candidateOnly = 0;
  for (const pair of completePairs) {
    const baseline = pair.defects.baseline.regression_free_task_success;
    const candidate = pair.defects.candidate.regression_free_task_success;
    if (baseline && !candidate) baselineOnly += 1;
    if (!baseline && candidate) candidateOnly += 1;
  }
  const activationEligible = completePairs.filter((entry) => entry.activation.eligible);
  const baselineDurations = completePairs.map((entry) => entry.baseline.metrics.duration_ms).filter(Number.isFinite);
  const candidateDurations = completePairs.map((entry) => entry.candidate.metrics.duration_ms).filter(Number.isFinite);
  const duration = Object.freeze({
    baseline_median_ms: median(baselineDurations),
    candidate_median_ms: median(candidateDurations),
    median_ratio: median(candidateDurations) / Math.max(1, median(baselineDurations)),
    baseline_mean_ms: mean(baselineDurations),
    candidate_mean_ms: mean(candidateDurations),
    mean_ratio: mean(candidateDurations) / Math.max(1, mean(baselineDurations)),
  });
  const alpha = plan.bindings.allocated_alpha ?? policy.alpha_spending[0].alpha;
  const exactPermutation = evaluateExactFamilyClusterPermutation(completePairs);
  const statistics = Object.freeze({
    primary,
    small_stratum: small,
    medium_stratum: medium,
    high_stratum: high,
    safety_delta: safety,
    timeout_delta: timeout,
    exact_paired_permutation: Object.freeze({
      alternative: "candidate-greater",
      independent_unit: "family-cluster",
      baseline_only: baselineOnly,
      candidate_only: candidateOnly,
      discordant_pairs: baselineOnly + candidateOnly,
      family_count: exactPermutation.family_count,
      nonzero_family_cluster_count: exactPermutation.nonzero_family_cluster_count,
      observed_family_difference_sum: exactPermutation.observed_family_difference_sum,
      p_value: exactPermutation.p_value,
      alpha,
    }),
    activation: Object.freeze({
      eligible_count: activationEligible.length,
      activated_count: activationEligible.filter((entry) => entry.activation.activated).length,
      rate: activationEligible.length === 0 ? null
        : activationEligible.filter((entry) => entry.activation.activated).length / activationEligible.length,
    }),
    defects: Object.freeze({
      new_critical_regressions: completePairs.reduce((sum, entry) => sum + entry.defects.critical_regression, 0),
      new_high_medium_regressions: completePairs.reduce((sum, entry) => sum + entry.defects.new_high_medium_regression, 0),
      resolved_high_medium_defects: completePairs.reduce((sum, entry) => sum + entry.defects.resolved_high_medium_defect, 0),
    }),
    duration,
    overhead: Object.freeze({
      total_tool_calls: aggregateMetricRatio(completePairs, "total_tool_call_count"),
      model_turns: aggregateMetricRatio(completePairs, "model_turn_count"),
      continuation_turns: aggregateMetricRatio(completePairs, "continuation_turn_count"),
    }),
  });
  const guardrails = Object.freeze({
    minimum_effect: primary.paired_delta >= policy.minimum_paired_improvement,
    positive_ci: primary.confidence_interval[0] > policy.confidence_interval_lower_bound_minimum_exclusive,
    exact_test: statistics.exact_paired_permutation.p_value < alpha,
    critical: statistics.defects.new_critical_regressions <= policy.safety_guardrails.new_critical_regressions_maximum,
    high_medium: statistics.defects.new_high_medium_regressions - statistics.defects.resolved_high_medium_defects
      <= policy.safety_guardrails.high_medium_regression_delta_maximum,
    safety: safety.confidence_interval[1] <= policy.safety_guardrails.safety_delta_upper_confidence_bound_maximum,
    small: small.confidence_interval[0] >= policy.safety_guardrails.small_stratum_delta_lower_confidence_bound_minimum,
    timeout: timeout.paired_delta <= policy.safety_guardrails.timeout_rate_delta_maximum,
    activation: statistics.activation.rate !== null
      && statistics.activation.rate >= policy.activation_guardrails.eligible_mechanism_activation_minimum,
    median_cost: duration.median_ratio <= policy.cost_guardrails.default_core_median_duration_ratio_maximum,
    mean_cost: duration.mean_ratio <= policy.cost_guardrails.default_core_mean_duration_ratio_maximum,
  });
  return Object.freeze({ statistics, guardrails, all_guardrails_pass: Object.values(guardrails).every(Boolean) });
}

function acceptanceSchedule(plan) {
  const targetStratum = plan.component_id === "diagnostic-guided-verification-remediation"
    ? "high"
    : ["risk-gated-visible-contract-remediation", "verified-risk-gated-contract-candidate", "risk-gated-specialized-visible-contract-remediation", "verified-risk-gated-specialized-contract-candidate", "core-v2-production-candidate", "exact-core-v2-coordinator", "core-v2-exact-coordinator-candidate", "adversarial-counterexample-audit", "core-v2-adversarial-audit-candidate"].includes(plan.component_id)
      ? "high"
    : ["bounded-pre-mutation-context", "core-v2-bounded-context-candidate"].includes(plan.component_id)
      ? "medium"
    : ["transactional-remediation-rollback", "core-v2-transactional-candidate"].includes(plan.component_id)
      ? "high"
    : ["contract-first-verified-context-candidate", "host-compiled-visible-contract-candidate"].includes(plan.component_id)
      ? "medium"
    : ["stratified-visible-contract-audit-candidate", "stratified-scenario-visible-contract-candidate"].includes(plan.component_id)
      ? "small"
    : ["manifest-transactional-audit-candidate", "evidence-gated-manifest-audit-candidate", "manifest-risk-gated-audit-candidate", "critical-manifest-risk-audit-candidate", "reviewer-free-exact-core-candidate", "scenario-typed-visible-contract-exact-core-candidate", "public-check-failure-only-transactional-candidate", "secret-mutation-guard-candidate"].includes(plan.component_id)
      ? "high"
    : ["multi-target-contract-expansion", "verified-multi-target-contract-candidate"].includes(plan.component_id)
      ? "medium"
    : ["specialized-visible-contract-remediation", "verified-specialized-contract-candidate"].includes(plan.component_id)
      ? "medium"
    : plan.component_id === "stratified-core-candidate"
      ? "medium"
    : ["independent-final-review", "verified-review-candidate", "verification-remediation", "verified-remediation-candidate", "retry-bounded-context", "deep-context", "composite-core-candidate", "visible-contract-remediation"].includes(plan.component_id)
      ? "medium" : "small";
  const preferredFamilyId = ["independent-final-review", "verified-review-candidate"].includes(plan.component_id)
    ? "dev-medium-config-propagation"
    : ["verification-remediation", "verified-remediation-candidate", "retry-bounded-context"].includes(plan.component_id)
      ? "dev-medium-public-result-shape"
      : plan.component_id === "diagnostic-guided-verification-remediation"
        ? "dev-high-durable-persistence"
        : ["risk-gated-visible-contract-remediation", "verified-risk-gated-contract-candidate", "risk-gated-specialized-visible-contract-remediation", "verified-risk-gated-specialized-contract-candidate", "core-v2-production-candidate", "exact-core-v2-coordinator", "core-v2-exact-coordinator-candidate", "adversarial-counterexample-audit", "core-v2-adversarial-audit-candidate"].includes(plan.component_id)
          ? "dev-high-authorization-boundary"
        : ["bounded-pre-mutation-context", "core-v2-bounded-context-candidate"].includes(plan.component_id)
          ? "dev-medium-config-propagation"
        : ["transactional-remediation-rollback", "core-v2-transactional-candidate"].includes(plan.component_id)
          ? "dev-high-durable-persistence"
        : ["contract-first-verified-context-candidate", "host-compiled-visible-contract-candidate"].includes(plan.component_id)
          ? "dev-medium-config-propagation"
        : plan.component_id === "stratified-visible-contract-audit-candidate"
          ? "dev-small-boundary-search"
        : plan.component_id === "stratified-scenario-visible-contract-candidate"
          ? "dev-small-malformed-parser"
        : plan.component_id === "public-check-failure-only-transactional-candidate"
          ? "dev-high-duplicate-side-effects"
        : plan.component_id === "secret-mutation-guard-candidate"
          ? "dev-high-secret-redaction"
        : ["manifest-transactional-audit-candidate", "evidence-gated-manifest-audit-candidate", "manifest-risk-gated-audit-candidate", "critical-manifest-risk-audit-candidate", "reviewer-free-exact-core-candidate", "scenario-typed-visible-contract-exact-core-candidate"].includes(plan.component_id)
          ? "dev-high-durable-persistence"
        : ["multi-target-contract-expansion", "verified-multi-target-contract-candidate"].includes(plan.component_id)
          ? "dev-medium-config-propagation"
        : ["specialized-visible-contract-remediation", "verified-specialized-contract-candidate"].includes(plan.component_id)
          ? "dev-medium-config-propagation"
        : plan.component_id === "stratified-core-candidate"
          ? "dev-medium-config-propagation"
        : plan.component_id === "visible-contract-remediation"
          ? "dev-medium-config-propagation"
        : null;
  const selected = plan.schedules.find((entry) => entry.repetition === 1
      && entry.stratum === targetStratum && entry.family_id === preferredFamilyId)
    ?? plan.schedules.find((entry) => entry.repetition === 1 && entry.stratum === targetStratum);
  if (selected === undefined) fail("BENCHMARK_V2_ACCEPTANCE", "no eligible acceptance family exists");
  return selected;
}

export async function executeBenchmarkV2Acceptance({
  repositoryRoot,
  plan,
  executableIdentity = undefined,
  attemptRunner = runSyntheticProfileAttempt,
} = {}) {
  const root = fs.realpathSync.native(path.resolve(repositoryRoot));
  if (plan.split === "holdout") fail("BENCHMARK_V2_ACCEPTANCE", "confirmatory holdout does not permit an adaptive acceptance probe");
  const identity = executableIdentity ?? resolveSyntheticOpenCodeExecutableIdentity();
  const identityFingerprint = typeof identity === "string" ? identity : identity?.fingerprint ?? null;
  if (identityFingerprint !== plan.bindings.executable_fingerprint) fail("BENCHMARK_V2_EXECUTABLE", "acceptance executable identity does not match the plan");
  const loaded = loadBenchmarkV2Contracts(root);
  const scheduled = acceptanceSchedule(plan);
  const instance = campaignInstances(root, loaded, plan.split, plan.bindings.seed, 1)
    .find((entry) => entry.family_id === scheduled.family_id);
  if (instance?.instance_fingerprint !== scheduled.instance_fingerprint) fail("BENCHMARK_V2_FIXTURE_STALE", "acceptance fixture drifted");
  const attempts = new Map();
  for (const armId of scheduled.order) {
    const attempt = await attemptRunner({
      sourceRoot: root,
      instance,
      profileId: armId,
      operationalRunId: `v2-accept-${scheduled.pair_id.slice(7, 27)}-${armId}`,
      model: plan.bindings.model,
      provider: plan.bindings.provider,
      variant: plan.bindings.variant,
      timeoutMs: plan.bindings.timeout_ms,
      opencodeExecutableIdentity: typeof identity === "string" ? undefined : identity,
      profileMaterializer: materializeVnextSyntheticProfile,
    });
    attempts.set(armId, attempt);
  }
  const baselineAttempt = attempts.get(plan.baseline_arm_id);
  const candidateAttempt = attempts.get(plan.candidate_arm_id);
  const baseline = attemptSummary(baselineAttempt, scheduled.family_id, scheduled.stratum);
  const candidate = attemptSummary(candidateAttempt, scheduled.family_id, scheduled.stratum);
  const mismatch = syntheticPairAttemptMismatchReasons(baselineAttempt, candidateAttempt);
  const activation = evaluateBenchmarkV2MechanismActivation(plan.component_id, candidate, scheduled.stratum);
  const conditionalMechanismNoop = plan.component_id === "public-check-failure-only-transactional-candidate"
    && activation.eligible === false
    && candidateAttempt.result.visible_check?.passed === true
    && candidateAttempt.result.vnext_host_verification_observation?.allowed === true
    && candidateAttempt.result.vnext_host_verification_observation?.activation_eligible === true
    && candidateAttempt.result.vnext_host_verification_observation?.activated === true
    && candidateAttempt.result.vnext_verification_remediation_observation?.eligible === false
    && candidateAttempt.result.vnext_verification_remediation_observation?.retry_required_count === 0
    && candidateAttempt.result.vnext_verification_remediation_observation?.retry_started_count === 0
    && candidateAttempt.result.vnext_verification_remediation_observation?.operationally_complete === true;
  const acceptanceRequiresActivation = [
    "verification-remediation",
    "visible-contract-remediation",
    "risk-gated-visible-contract-remediation",
    "verified-risk-gated-contract-candidate",
    "multi-target-contract-expansion",
    "verified-multi-target-contract-candidate",
    "specialized-visible-contract-remediation",
    "verified-specialized-contract-candidate",
    "risk-gated-specialized-visible-contract-remediation",
    "verified-risk-gated-specialized-contract-candidate",
    "core-v2-production-candidate",
    "exact-core-v2-coordinator",
    "core-v2-exact-coordinator-candidate",
    "adversarial-counterexample-audit",
    "core-v2-adversarial-audit-candidate",
    "bounded-pre-mutation-context",
    "core-v2-bounded-context-candidate",
    "transactional-remediation-rollback",
    "core-v2-transactional-candidate",
    "contract-first-verified-context-candidate",
    "host-compiled-visible-contract-candidate",
    "stratified-visible-contract-audit-candidate",
    "manifest-transactional-audit-candidate",
    "evidence-gated-manifest-audit-candidate",
    "manifest-risk-gated-audit-candidate",
    "critical-manifest-risk-audit-candidate",
    "reviewer-free-exact-core-candidate",
    "scenario-typed-visible-contract-exact-core-candidate",
    "public-check-failure-only-transactional-candidate",
    "secret-mutation-guard-candidate",
    "stratified-scenario-visible-contract-candidate",
    "stratified-core-candidate",
    "retry-bounded-context",
  ].includes(plan.component_id);
  const optionalMechanismSatisfied = acceptanceRequiresActivation === false
    && (!activation.eligible || activation.activated);
  const mechanismAcceptance = Object.freeze({
    satisfied: (activation.eligible && activation.activated)
      || conditionalMechanismNoop || optionalMechanismSatisfied,
    mode: activation.eligible && activation.activated
      ? "activated"
      : conditionalMechanismNoop
        ? "verified-not-needed"
        : optionalMechanismSatisfied ? "not-required" : "unsatisfied",
  });
  const passed = mismatch.length === 0
    && baseline.execution_status === "completed" && candidate.execution_status === "completed"
    && baseline.evidence_complete === true && candidate.evidence_complete === true
    && baselineAttempt.result.teardown?.passed === true && candidateAttempt.result.teardown?.passed === true
    && baselineAttempt.result.cleanup?.passed === true && candidateAttempt.result.cleanup?.passed === true
    && mechanismAcceptance.satisfied;
  const source = {
    schema_version: 2,
    evidence_class: "model-backed-acceptance",
    status: passed ? "passed" : [baseline.execution_status, candidate.execution_status].includes("blocked_external_state")
      ? "blocked-unproven" : "failed",
    plan_fingerprint: plan.plan_fingerprint,
    pair_id: scheduled.pair_id,
    family_id: scheduled.family_id,
    stratum: scheduled.stratum,
    baseline: Object.freeze({
      execution_status: baseline.execution_status,
      reason: baseline.reason,
      evidence_complete: baseline.evidence_complete,
      result_fingerprint: baseline.result_fingerprint,
    }),
    candidate: Object.freeze({
      execution_status: candidate.execution_status,
      reason: candidate.reason,
      evidence_complete: candidate.evidence_complete,
      result_fingerprint: candidate.result_fingerprint,
    }),
    activation: Object.freeze(activation),
    mechanism_acceptance: mechanismAcceptance,
    mismatch_reasons: Object.freeze(mismatch),
  };
  return Object.freeze({ ...source, acceptance_fingerprint: fingerprintProfileValue(source) });
}

export async function executeBenchmarkV2Campaign({
  repositoryRoot,
  plan,
  executableIdentity = undefined,
  attemptRunner = runSyntheticProfileAttempt,
  commandRunner = undefined,
  clock = undefined,
  idFactory = undefined,
  freezeManifest = null,
  selectionManifest = null,
  salt = null,
} = {}) {
  const root = fs.realpathSync.native(path.resolve(repositoryRoot));
  const canonicalPlan = buildBenchmarkV2CampaignPlan({
    repositoryRoot: root,
    split: plan.split,
    generationId: plan.generation_id,
    baselineArmId: plan.baseline_arm_id,
    candidateArmId: plan.candidate_arm_id,
    model: plan.bindings.model,
    provider: plan.bindings.provider,
    variant: plan.bindings.variant,
    timeoutMs: plan.bindings.timeout_ms,
    seed: plan.bindings.seed,
    repetitions: plan.repetitions,
    validationUseOrdinal: plan.validation_use_ordinal,
    executableIdentity: plan.bindings.executable_fingerprint,
    allowDirty: true,
    freezeManifest,
    selectionManifest,
    salt,
  });
  if (canonicalPlan.plan_fingerprint !== plan.plan_fingerprint) fail("BENCHMARK_V2_PLAN_STALE", "campaign plan is not canonical for the current source");
  const identity = executableIdentity ?? resolveSyntheticOpenCodeExecutableIdentity();
  const identityFingerprint = typeof identity === "string" ? identity : identity?.fingerprint ?? null;
  if (identityFingerprint !== plan.bindings.executable_fingerprint) fail("BENCHMARK_V2_EXECUTABLE", "executable identity does not match the plan");
  const loaded = loadBenchmarkV2Contracts(root);
  const byKey = new Map();
  for (let repetition = 1; repetition <= plan.repetitions; repetition += 1) {
    for (const instance of campaignInstances(root, loaded, plan.split, plan.bindings.seed, repetition, selectionManifest, freezeManifest)) {
      byKey.set(`${instance.family_id}:${repetition}`, instance);
    }
  }
  const pairs = [];
  const incomplete = [];
  for (const scheduled of plan.schedules) {
    const instance = byKey.get(`${scheduled.family_id}:${scheduled.repetition}`);
    if (instance?.instance_fingerprint !== scheduled.instance_fingerprint) fail("BENCHMARK_V2_FIXTURE_STALE", `${scheduled.family_id} fixture drifted`);
    const attempts = new Map();
    for (const armId of scheduled.order) {
      const attempt = await attemptRunner({
        sourceRoot: root,
        instance,
        profileId: armId,
        operationalRunId: `v2-${scheduled.pair_id.slice(7, 31)}-${armId}`,
        model: plan.bindings.model,
        provider: plan.bindings.provider,
        variant: plan.bindings.variant,
        timeoutMs: plan.bindings.timeout_ms,
        opencodeExecutableIdentity: typeof identity === "string" ? undefined : identity,
        profileMaterializer: materializeVnextSyntheticProfile,
        ...(commandRunner === undefined ? {} : { commandRunner }),
        ...(clock === undefined ? {} : { clock }),
        ...(idFactory === undefined ? {} : { idFactory }),
      });
      attempts.set(armId, attempt);
    }
    const baselineAttempt = attempts.get(plan.baseline_arm_id);
    const candidateAttempt = attempts.get(plan.candidate_arm_id);
    const mismatch = syntheticPairAttemptMismatchReasons(baselineAttempt, candidateAttempt);
    const baseline = attemptSummary(baselineAttempt, scheduled.family_id, scheduled.stratum);
    const candidate = attemptSummary(candidateAttempt, scheduled.family_id, scheduled.stratum);
    const complete = mismatch.length === 0 && baseline.evidence_complete === true && candidate.evidence_complete === true;
    const defects = evaluatePairedDefects({ baseline: baseline.evaluation, candidate: candidate.evaluation });
    const pairSource = {
      pair_id: scheduled.pair_id,
      family_id: scheduled.family_id,
      stratum: scheduled.stratum,
      repetition: scheduled.repetition,
      order: scheduled.order,
      status: complete ? "complete" : "incomplete",
      incomplete_reasons: Object.freeze([
        ...mismatch,
        ...(baseline.evidence_complete ? [] : ["baseline-evidence-incomplete"]),
        ...(candidate.evidence_complete ? [] : ["candidate-evidence-incomplete"]),
      ]),
      baseline: Object.freeze({
        ...baseline,
        timeout: /timeout/u.test(`${baseline.reason ?? ""}:${baseline.termination_reason}`),
        result_summary: Object.freeze({ hidden_safety_failed: baselineAttempt.result.hidden_safety_failed }),
      }),
      candidate: Object.freeze({
        ...candidate,
        timeout: /timeout/u.test(`${candidate.reason ?? ""}:${candidate.termination_reason}`),
        result_summary: Object.freeze({ hidden_safety_failed: candidateAttempt.result.hidden_safety_failed }),
      }),
      activation: Object.freeze(evaluateBenchmarkV2MechanismActivation(plan.component_id, candidate, scheduled.stratum)),
      defects,
    };
    pairs.push(Object.freeze({ ...pairSource, evidence_fingerprint: fingerprintProfileValue(pairSource) }));
    if (!complete) incomplete.push(`${scheduled.pair_id}:${pairSource.incomplete_reasons.join(",")}`);
    if ([baseline.execution_status, candidate.execution_status].includes("blocked_external_state")) break;
  }
  const completePairs = pairs.filter((entry) => entry.status === "complete");
  const summary = completePairs.length === pairs.length && pairs.length === plan.schedules.length
    ? summarizeCampaign(plan, pairs, loaded.policy)
    : null;
  const status = pairs.some((entry) => [entry.baseline.execution_status, entry.candidate.execution_status].includes("blocked_external_state"))
    ? "blocked-unproven"
    : summary === null ? "incomplete" : "complete";
  const reportSource = {
    schema_version: 2,
    report_kind: "benchmark-v2-campaign-report",
    evidence_class: "model-backed-execution",
    status,
    plan,
    pair_results: Object.freeze(pairs),
    incomplete_outcomes: Object.freeze(incomplete),
    summary,
    decision: status !== "complete" ? "inconclusive"
      : plan.split === "holdout"
        ? summary.all_guardrails_pass ? "promote-final-harness" : "reject-final-harness"
        : summary.all_guardrails_pass ? "retain-development-candidate" : "reject-development-candidate",
  };
  return Object.freeze({ ...reportSource, report_fingerprint: fingerprintProfileValue(reportSource) });
}

function exactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    fail("BENCHMARK_V2_REPORT_SCHEMA", `${label} has unexpected fields`);
  }
}

function assertPrivacySafe(value, pathLabel = "report") {
  const forbidden = new Set([
    "prompt", "public_files", "hidden_files", "solution_files", "stdout", "stderr",
    "credential", "credentials", "secret", "token", "authorization", "api_key", "raw_model_output",
  ]);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPrivacySafe(entry, `${pathLabel}[${index}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (forbidden.has(key.toLowerCase())) fail("BENCHMARK_V2_REPORT_PRIVACY", `${pathLabel}.${key} is forbidden in persisted evidence`);
      assertPrivacySafe(nested, `${pathLabel}.${key}`);
    }
    return;
  }
  if (typeof value === "string" && (value.length > 2_000 || value.includes("\0"))) {
    fail("BENCHMARK_V2_REPORT_PRIVACY", `${pathLabel} contains unbounded text`);
  }
}

export function validateBenchmarkV2CampaignReport(report, {
  repositoryRoot = null,
  freezeManifest = null,
  selectionManifest = null,
  salt = null,
} = {}) {
  exactKeys(report, [
    "schema_version", "report_kind", "evidence_class", "status", "plan", "pair_results",
    "incomplete_outcomes", "summary", "decision", "report_fingerprint",
  ], "report");
  const { report_fingerprint: declaredReportFingerprint, ...reportSource } = report;
  if (report.schema_version !== 2 || report.report_kind !== "benchmark-v2-campaign-report"
    || report.evidence_class !== "model-backed-execution"
    || !["complete", "incomplete", "blocked-unproven"].includes(report.status)
    || declaredReportFingerprint !== fingerprintProfileValue(reportSource)) {
    fail("BENCHMARK_V2_REPORT_SCHEMA", "report identity or fingerprint is invalid");
  }
  const { plan_fingerprint: declaredPlanFingerprint, ...planSource } = report.plan ?? {};
  if (declaredPlanFingerprint !== fingerprintProfileValue(planSource)
    || report.plan?.schema_version !== 2
    || report.plan?.plan_kind !== "benchmark-v2-campaign-plan") {
    fail("BENCHMARK_V2_REPORT_PLAN", "embedded plan fingerprint is invalid");
  }
  let loadedContracts = null;
  const requiredBindings = repositoryRoot === null
    ? [
      "source_sha", "baseline_profile_fingerprint", "candidate_profile_fingerprint",
      "evaluator_fingerprint", "promotion_policy_fingerprint", "task_generator_fingerprint",
      "holdout_selection_fingerprint", "model", "provider", "variant", "timeout_ms", "fixture_fingerprint",
      "seed", "arm_ordering_policy",
    ]
    : (loadedContracts = loadBenchmarkV2Contracts(repositoryRoot)).policy.required_bindings;
  for (const binding of requiredBindings) {
    if (!Object.hasOwn(report.plan.bindings ?? {}, binding)) fail("BENCHMARK_V2_REPORT_BINDING", `required binding ${binding} is absent`);
  }
  if (!Array.isArray(report.pair_results) || !Array.isArray(report.plan.schedules)
    || report.pair_results.length > report.plan.schedules.length
    || !Array.isArray(report.incomplete_outcomes)) {
    fail("BENCHMARK_V2_REPORT_PAIRS", "pair collection is invalid");
  }
  const scheduleById = new Map(report.plan.schedules.map((entry) => [entry.pair_id, entry]));
  const scheduleIds = new Set(scheduleById.keys());
  const observedIds = new Set();
  for (const pair of report.pair_results) {
    const { evidence_fingerprint: declaredPairFingerprint, ...pairSource } = pair;
    if (!scheduleIds.has(pair.pair_id) || observedIds.has(pair.pair_id)
      || declaredPairFingerprint !== fingerprintProfileValue(pairSource)) {
      fail("BENCHMARK_V2_REPORT_PAIRS", "pair identity or fingerprint is invalid");
    }
    const scheduled = scheduleById.get(pair.pair_id);
    if (pair.family_id !== scheduled.family_id || pair.stratum !== scheduled.stratum
      || pair.repetition !== scheduled.repetition
      || fingerprintProfileValue(pair.order) !== fingerprintProfileValue(scheduled.order)
      || pair.status !== (pair.baseline.evidence_complete && pair.candidate.evidence_complete
        && pair.incomplete_reasons.length === 0 ? "complete" : "incomplete")
      || fingerprintProfileValue(pair.defects) !== fingerprintProfileValue(evaluatePairedDefects({
        baseline: pair.baseline.evaluation,
        candidate: pair.candidate.evaluation,
      }))
      || fingerprintProfileValue(pair.activation) !== fingerprintProfileValue(evaluateBenchmarkV2MechanismActivation(
        report.plan.component_id,
        pair.candidate,
        pair.stratum,
      ))) {
      fail("BENCHMARK_V2_REPORT_PAIRS", "pair semantics contradict the frozen schedule or evaluator");
    }
    observedIds.add(pair.pair_id);
  }
  if ((report.status === "complete") !== (report.pair_results.length === report.plan.schedules.length
      && report.pair_results.every((entry) => entry.status === "complete") && report.summary !== null)
    || (report.status !== "complete" && report.decision !== "inconclusive")
    || (report.status === "complete" && !(report.plan.split === "holdout"
      ? ["promote-final-harness", "reject-final-harness"]
      : ["retain-development-candidate", "reject-development-candidate"]).includes(report.decision))) {
    fail("BENCHMARK_V2_REPORT_STATUS", "report completion or decision is contradictory");
  }
  if (repositoryRoot !== null) {
    const canonicalPlan = buildBenchmarkV2CampaignPlan({
      repositoryRoot,
      split: report.plan.split,
      generationId: report.plan.generation_id,
      baselineArmId: report.plan.baseline_arm_id,
      candidateArmId: report.plan.candidate_arm_id,
      model: report.plan.bindings.model,
      provider: report.plan.bindings.provider,
      variant: report.plan.bindings.variant,
      timeoutMs: report.plan.bindings.timeout_ms,
      seed: report.plan.bindings.seed,
      repetitions: report.plan.repetitions,
      validationUseOrdinal: report.plan.validation_use_ordinal,
      executableIdentity: report.plan.bindings.executable_fingerprint,
      allowDirty: true,
      freezeManifest,
      selectionManifest,
      salt,
    });
    if (canonicalPlan.plan_fingerprint !== report.plan.plan_fingerprint) {
      fail("BENCHMARK_V2_REPORT_PLAN", "embedded plan is stale for the checked source");
    }
    if (report.status === "complete") {
      const expectedSummary = summarizeCampaign(report.plan, report.pair_results, loadedContracts.policy);
      if (fingerprintProfileValue(expectedSummary) !== fingerprintProfileValue(report.summary)
        || report.decision !== (report.plan.split === "holdout"
          ? expectedSummary.all_guardrails_pass ? "promote-final-harness" : "reject-final-harness"
          : expectedSummary.all_guardrails_pass ? "retain-development-candidate" : "reject-development-candidate")) {
        fail("BENCHMARK_V2_REPORT_STATUS", "summary or decision contradicts the frozen evaluator");
      }
    }
  }
  assertPrivacySafe(report);
  return report;
}

export function writeBenchmarkV2CampaignReport(repositoryRoot, report, {
  freezeManifest = null,
  selectionManifest = null,
  salt = null,
} = {}) {
  const root = fs.realpathSync.native(path.resolve(repositoryRoot));
  validateBenchmarkV2CampaignReport(report, {
    repositoryRoot: root, freezeManifest, selectionManifest, salt,
  });
  const directory = path.join(root, ".oc_harness", "benchmark-v2");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, `${report.plan.split}-${report.plan.plan_fingerprint.slice(7, 31)}.json`);
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return path.relative(root, target).split(path.sep).join("/");
}
