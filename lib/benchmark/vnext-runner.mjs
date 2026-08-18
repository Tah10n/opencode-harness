import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { ProfileV3Error, fingerprintProfileValue } from "../profile-v3.mjs";
import {
  VNEXT_COMPARISON_SCHEMA_PATH,
  VNEXT_EXECUTION_PLAN_SCHEMA_PATH,
  VNEXT_FULL_ENVELOPE_SCHEMA_PATH,
  VNEXT_REPORT_SCHEMA_PATH,
  loadVnextContracts,
} from "./vnext-contracts.mjs";
import { renderVnextInstance, validateRenderedVnextInstance } from "./vnext-fixtures.mjs";
import {
  cleanupSyntheticProfile,
  materializeVnextSyntheticProfile,
} from "./profiles.mjs";
import {
  runSyntheticProfileAttempt,
  syntheticPairAttemptMismatchReasons,
} from "./runner.mjs";
import { resolveSyntheticOpenCodeExecutableIdentity } from "./opencode-adapter.mjs";

const SUITE_IDS = new Set(["smoke", "standard", "full"]);
const REPORT_STATUSES = new Set(["complete", "incomplete", "blocked-unproven"]);
const SUMMARY_KEYS = Object.freeze(["baseline", "candidate", "paired_delta", "confidence_interval"]);
const OBSERVATION_INPUT_KEYS = Object.freeze([
  "hidden_check_passed", "workspace_policy_passed", "task_correct", "whole_task_success",
  "defect_escape_v2", "trace_policy_passed", "trace_violations", "treatment_compliance_passed",
  "unexpected_path_count", "attested_owner_count", "duration_ms", "model_turn_count",
  "total_tool_call_count", "subagent_call_count", "reason", "termination_reason",
  "evidence_complete", "consumer_observation",
]);
const RATE_METRIC_IDS = new Set([
  "functional_hidden_check_success", "regression_free_success", "public_contract_preservation",
  "regression_free_high_risk_success",
  "structural_oracle_success", "missed_consumer_rate", "verification_omission",
  "task_completion_without_human_intervention", "timeout_rate", "whole_task_success",
  "protocol_compliance", "trace_completeness", "attestation_completeness",
]);
const FULL_EXECUTION_AUTHORIZATION = Symbol("vnext-full-execution-authorization");
const MODEL_BACKED_EVIDENCE_CLASS = "model-backed-contained-run";
const MODEL_FREE_EVIDENCE_CLASS = "model-free-test";
const MODEL_BACKED_PRODUCER_ID = "opencode-harness-vnext-contained-runner";
const MODEL_FREE_PRODUCER_ID = "opencode-harness-vnext-model-free-test-runner";
const TRUSTED_MODEL_BACKED_REPORTS = new WeakSet();
const TRUSTED_RUN_ENVELOPES = new WeakSet();
const TRUSTED_COMPARISONS = new WeakSet();
const TRUSTED_PROMOTION_DECISIONS = new WeakSet();
const TRUSTED_FULL_PLANS = new WeakSet();

function fail(code, message) {
  throw new ProfileV3Error(code, message);
}

function safeText(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return value;
  if (typeof value !== "string" || value.length === 0 || value.length > 1000
    || /[\r\n\0]/u.test(value)) fail("VNEXT_RUN_ARGUMENT", `${label} is invalid`);
  return value;
}

function sourceSha(root) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  let value = result.status === 0 ? result.stdout.trim() : "";
  if (!/^[0-9a-f]{40}$/u.test(value)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(
        path.join(root, ".opencode-profile-manifest.json"),
        "utf8",
      ));
      if (manifest.managed_by === "opencode-harness-profile-materializer"
        && manifest.bundle_id === "lab") value = manifest.source_sha;
    } catch {
      value = "";
    }
  }
  if (!/^[0-9a-f]{40}$/u.test(value)) fail("VNEXT_SOURCE_SHA", "source Git SHA is unavailable");
  return value;
}

function assertMaterializedSourceTree(root) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(root, ".opencode-profile-manifest.json"), "utf8"));
  } catch {
    return false;
  }
  if (manifest.managed_by !== "opencode-harness-profile-materializer"
    || manifest.bundle_id !== "lab" || !Array.isArray(manifest.files)
    || manifest.source_git_clean !== true
    || manifest.source_all_tracked !== true
    || !/^sha256:[0-9a-f]{64}$/u.test(manifest.source_tree_fingerprint)
    || !/^[0-9a-f]{40}$/u.test(manifest.source_sha)) return false;
  const expectedTreeFingerprint = fingerprintProfileValue({
    domain: "sha256:profile-source-tree-v1",
    files: manifest.files,
  });
  if (manifest.source_tree_fingerprint !== expectedTreeFingerprint) return false;
  const { bundle_fingerprint: declaredBundleFingerprint, ...manifestBody } = manifest;
  if (declaredBundleFingerprint !== fingerprintProfileValue({
    domain: "sha256:profile-path-bytes-v1",
    manifest: manifestBody,
  })) return false;
  const expectedPaths = new Set([
    ".opencode-profile-manifest.json",
    ...manifest.files.map((entry) => entry.path),
  ]);
  const actualPaths = [];
  const visit = (directory, prefix = "") => {
    for (const name of fs.readdirSync(directory).sort()) {
      const relative = prefix.length === 0 ? name : `${prefix}/${name}`;
      const target = path.join(directory, name);
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink()) return false;
      if (stat.isDirectory()) {
        if (visit(target, relative) === false) return false;
      } else if (stat.isFile() && stat.nlink === 1) {
        actualPaths.push(relative);
      } else {
        return false;
      }
    }
    return true;
  };
  if (visit(root) === false
    || actualPaths.length !== expectedPaths.size
    || actualPaths.some((entry) => !expectedPaths.has(entry))) return false;
  for (const entry of manifest.files) {
    if (typeof entry.path !== "string" || typeof entry.size !== "number"
      || typeof entry.sha256 !== "string") return false;
    const target = path.resolve(root, ...entry.path.split("/"));
    const relative = path.relative(root, target);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
    let stat;
    try {
      stat = fs.lstatSync(target);
    } catch {
      return false;
    }
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) return false;
    const bytes = fs.readFileSync(target);
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (bytes.byteLength !== entry.size || digest !== entry.sha256) return false;
  }
  return true;
}

function assertCleanSourceTree(root) {
  const result = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0 && assertMaterializedSourceTree(root)) return;
  if (result.status !== 0 || result.stdout.length !== 0) {
    fail("VNEXT_SOURCE_DIRTY", "model-backed plans require a clean committed source tree");
  }
}

function selectionRank(seed, estimandId, familyId) {
  return createHash("sha256").update(`${seed}\0${estimandId}\0${familyId}`).digest("hex");
}

function selectFamilies(contract, estimand, suiteId, seed) {
  const eligible = contract.families.filter((family) => estimand.eligible_strata.includes(family.stratum));
  const byStratum = new Map(estimand.eligible_strata.map((stratum) => [stratum, eligible
    .filter((family) => family.stratum === stratum)
    .sort((left, right) => selectionRank(seed, estimand.id, left.id)
      .localeCompare(selectionRank(seed, estimand.id, right.id)))]));
  if (suiteId === "full") return eligible.map((entry) => entry.id).sort();
  const limit = suiteId === "smoke" ? 1 : 8;
  const selected = [...byStratum.values()].flatMap((families) => families.slice(0, limit));
  if (suiteId === "standard" && selected.length < 8) {
    fail("VNEXT_STANDARD_COVERAGE", `${estimand.id} has fewer than eight eligible standard families`);
  }
  return selected.map((entry) => entry.id).sort();
}

function vnextArmEvidence(root, arm) {
  const materialized = materializeVnextSyntheticProfile({ sourceRoot: root, profileId: arm.id });
  try {
    return Object.freeze({
      arm_id: arm.id,
      component_ids: Object.freeze([...arm.component_ids]),
      primary_agent_id: materialized.primaryAgentId,
      profile_fingerprint: materialized.profileFingerprint,
      runtime_surface: materialized.profileEvidence.runtime_surface,
      source_entries: materialized.profileEvidence.source_entries,
      common_overlay_id: materialized.profileEvidence.common_overlay_id,
    });
  } finally {
    cleanupSyntheticProfile(materialized);
  }
}

function leafFingerprints(value, prefix = "") {
  if (value === null || typeof value !== "object") return [[prefix, fingerprintProfileValue(value)]];
  if (Array.isArray(value)) return value.flatMap((entry, index) => leafFingerprints(entry, `${prefix}/${index}`));
  return Object.entries(value).flatMap(([key, nested]) => leafFingerprints(nested, `${prefix}/${key}`));
}

export function validateVnextArmSurfaceDelta(baseline, candidate, transitionAnchorComponentId, expectedChangedPaths) {
  if (baseline.common_overlay_id !== candidate.common_overlay_id) {
    fail("VNEXT_ARM_OVERLAY", "evaluation-only common overlay differs between arms");
  }
  const left = new Map(leafFingerprints(baseline.runtime_surface));
  const right = new Map(leafFingerprints(candidate.runtime_surface));
  const changed = [...new Set([...left.keys(), ...right.keys()])]
    .filter((key) => left.get(key) !== right.get(key))
    .sort();
  if (changed.length === 0) fail("VNEXT_ARM_DIFF", "adjacent arms have no materialized runtime-surface difference");
  const expected = [...expectedChangedPaths].sort();
  const missingAnchors = expected.filter((entry) => !changed.includes(entry));
  if (missingAnchors.length > 0) {
    fail("VNEXT_ARM_DIFF", `${transitionAnchorComponentId} compound transition omitted frozen surface anchors: ${missingAnchors.join(", ")}`);
  }
  return Object.freeze({
    estimand_kind: "compound-profile-transition",
    transition_anchor_component_id: transitionAnchorComponentId,
    changed_leaf_paths: Object.freeze(changed),
    baseline_surface_fingerprint: fingerprintProfileValue(baseline.runtime_surface),
    candidate_surface_fingerprint: fingerprintProfileValue(candidate.runtime_surface),
    delta_contract_fingerprint: fingerprintProfileValue({
      estimand_kind: "compound-profile-transition",
      transition_anchor_component_id: transitionAnchorComponentId,
      required_changed_surface_anchors: expected,
    }),
    delta_fingerprint: fingerprintProfileValue({ transitionAnchorComponentId, changed }),
  });
}

function renderPlanPairs(root, loaded, estimand, familyIds, suiteId, seed) {
  const repetitions = loaded.contract.suites.find((entry) => entry.id === suiteId).trajectory_repetitions;
  const familyById = new Map(loaded.contract.families.map((entry) => [entry.id, entry]));
  const pairs = [];
  for (const familyId of familyIds) {
    const family = familyById.get(familyId);
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const instance = validateRenderedVnextInstance(renderVnextInstance({
        repositoryRoot: root,
        family,
        seed: `vnext-${createHash("sha256").update(`${seed}\0${estimand.id}\0${family.id}\0${repetition}`).digest("hex").slice(0, 32)}`,
        repetition,
      }), family);
      const pairId = `pair-${createHash("sha256").update(`${estimand.id}\0${instance.instance_fingerprint}\0${repetition}`).digest("hex").slice(0, 24)}`;
      const baselineFirst = Number.parseInt(createHash("sha256").update(`${seed}\0${pairId}`).digest("hex").slice(0, 2), 16) % 2 === 0;
      pairs.push(Object.freeze({
        pair_id: pairId,
        family_id: family.id,
        stratum: family.stratum,
        repetition,
        instance_fingerprint: instance.instance_fingerprint,
        public_fixture_fingerprint: instance.public_fixture_fingerprint,
        hidden_fixture_fingerprint: instance.hidden_fixture_fingerprint,
        topology_fingerprint: fingerprintProfileValue(instance.topology),
        required_consumer_ids: Object.freeze([...(instance.required_consumer_ids ?? [])]),
        order: Object.freeze(baselineFirst
          ? [estimand.baseline_arm_id, estimand.candidate_arm_id]
          : [estimand.candidate_arm_id, estimand.baseline_arm_id]),
      }));
    }
  }
  return Object.freeze(pairs);
}

function executionEngineFingerprint(root) {
  const paths = [
    "lib/profile-v3.mjs",
    "lib/benchmark/vnext-runner.mjs",
    "lib/benchmark/vnext-contracts.mjs",
    "lib/benchmark/runner.mjs",
    "lib/benchmark/opencode-adapter.mjs",
    "lib/benchmark/profiles.mjs",
    "lib/benchmark/vnext-fixtures.mjs",
    "lib/feedback/adapter-worker.mjs",
  ];
  const files = paths.map((relativePath) => {
    const target = path.join(root, ...relativePath.split("/"));
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
      fail("VNEXT_EXECUTION_ENGINE", `trusted execution module is not a single-link regular file: ${relativePath}`);
    }
    return Object.freeze({
      path: relativePath,
      sha256: `sha256:${createHash("sha256").update(fs.readFileSync(target)).digest("hex")}`,
    });
  });
  return fingerprintProfileValue({ domain: "sha256:vnext-runner-owned-engine-v1", files });
}

function evaluatorFingerprint(root, contractFingerprint) {
  const paths = [
    "lib/profile-v3.mjs",
    "lib/benchmark/vnext-contracts.mjs",
    "lib/benchmark/vnext-runner.mjs",
    VNEXT_REPORT_SCHEMA_PATH,
    VNEXT_COMPARISON_SCHEMA_PATH,
    VNEXT_EXECUTION_PLAN_SCHEMA_PATH,
    VNEXT_FULL_ENVELOPE_SCHEMA_PATH,
  ];
  const files = paths.map((relativePath) => {
    const target = path.join(root, ...relativePath.split("/"));
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
      fail("VNEXT_EVALUATOR", `trusted evaluator input is not a single-link regular file: ${relativePath}`);
    }
    return Object.freeze({
      path: relativePath,
      sha256: `sha256:${createHash("sha256").update(fs.readFileSync(target)).digest("hex")}`,
    });
  });
  return fingerprintProfileValue({
    domain: "sha256:vnext-runner-owned-evaluator-v2",
    contract_fingerprint: contractFingerprint,
    files,
  });
}

export function validateVnextStandardGate(standardGate, standardPromotion) {
  if (!plainObject(standardGate)
    || !["standard_run_fingerprint", "standard_comparison_fingerprint", "standard_promotion_decision_fingerprint"]
      .every((key) => /^sha256:[0-9a-f]{64}$/u.test(standardGate[key]))) {
    fail("VNEXT_FULL_GATE", "full requires the complete fingerprint-bound standard gate");
  }
  if (!plainObject(standardPromotion)
    || standardGate.standard_run_fingerprint !== standardPromotion.source_run_fingerprint
    || standardGate.standard_comparison_fingerprint !== standardPromotion.comparison_fingerprint
    || standardGate.standard_promotion_decision_fingerprint !== standardPromotion.decision_fingerprint) {
    fail("VNEXT_FULL_GATE", "full standard gate does not bind the exact trusted standard artifacts");
  }
  return standardGate;
}

export function buildVnextExecutionPlan({
  repositoryRoot,
  suiteId,
  estimandId,
  model,
  provider,
  variant,
  seed,
  timeoutMs,
  executableIdentity,
  fullAuthorization = null,
  standardPromotion = null,
  standardGate = null,
  allowDirty = false,
} = {}) {
  if (!SUITE_IDS.has(suiteId)) fail("VNEXT_RUN_ARGUMENT", "suite must be smoke, standard, or full");
  if (suiteId === "full" && fullAuthorization !== FULL_EXECUTION_AUTHORIZATION) {
    fail("VNEXT_FULL_GATE", "full can start only from the in-process trusted standard-to-full runner");
  }
  if (suiteId !== "full" && (fullAuthorization !== null || standardPromotion !== null || standardGate !== null)) {
    fail("VNEXT_FULL_GATE", "full authorization applies only to the full suite");
  }
  if (suiteId === "full") {
    if (!plainObject(standardPromotion) || standardPromotion.promotable !== true
      || standardPromotion.suite_id !== "standard" || standardPromotion.estimand_id !== estimandId
      || standardPromotion.status !== "complete" || !plainObject(standardPromotion.bindings)
      || !TRUSTED_PROMOTION_DECISIONS.has(standardPromotion)) {
      fail("VNEXT_FULL_GATE", "full requires the current in-process positive standard decision");
    }
    validateVnextStandardGate(standardGate, standardPromotion);
  }
  const loaded = loadVnextContracts(repositoryRoot);
  if (allowDirty !== true) assertCleanSourceTree(loaded.root);
  const estimand = loaded.contract.estimands.find((entry) => entry.id === estimandId);
  if (!estimand) fail("VNEXT_RUN_ARGUMENT", `unknown estimand ${estimandId}`);
  safeText(model, "model");
  safeText(provider, "provider");
  safeText(variant, "variant", { nullable: true });
  safeText(seed, "seed");
  safeText(executableIdentity, "executable identity");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 60_000 || timeoutMs > 3_600_000) {
    fail("VNEXT_RUN_ARGUMENT", "timeout must be between 60000 and 3600000 milliseconds");
  }
  const familyIds = selectFamilies(loaded.contract, estimand, suiteId, seed);
  const armById = new Map(loaded.contract.arms.map((entry) => [entry.id, entry]));
  const baselineArm = vnextArmEvidence(loaded.root, armById.get(estimand.baseline_arm_id));
  const candidateArm = vnextArmEvidence(loaded.root, armById.get(estimand.candidate_arm_id));
  const pairSchedule = renderPlanPairs(loaded.root, loaded, estimand, familyIds, suiteId, seed);
  const surfaceDelta = validateVnextArmSurfaceDelta(
    baselineArm,
    candidateArm,
    estimand.transition_anchor_component_id,
    loaded.inventory.vnext_transition_surface_anchors[estimand.transition_anchor_component_id],
  );
  const bindings = Object.freeze({
    source_sha: sourceSha(loaded.root),
    policy_fingerprint: loaded.validation.policy_fingerprint,
    inventory_fingerprint: loaded.validation.inventory_fingerprint,
    contract_fingerprint: loaded.validation.contract_fingerprint,
    executable_identity: executableIdentity,
    adapter_fingerprint: executionEngineFingerprint(loaded.root),
    model,
    provider,
    variant: variant ?? "host-default",
    seed,
    timeout_ms: timeoutMs,
    runner_limits: Object.freeze({
      max_parallel_pairs: 1,
      trajectory_repetitions: loaded.contract.suites.find((entry) => entry.id === suiteId).trajectory_repetitions,
      raw_model_output_persisted: false,
    }),
    fixture_fingerprint: fingerprintProfileValue(pairSchedule.map((entry) => ({
      pair_id: entry.pair_id,
      instance_fingerprint: entry.instance_fingerprint,
      topology_fingerprint: entry.topology_fingerprint,
    }))),
    evaluator_fingerprint: evaluatorFingerprint(loaded.root, loaded.validation.contract_fingerprint),
  });
  if (suiteId === "full") {
    const matchingBindingKeys = [
      "source_sha", "policy_fingerprint", "inventory_fingerprint", "contract_fingerprint",
      "executable_identity", "adapter_fingerprint", "model", "provider", "variant", "seed",
      "timeout_ms", "evaluator_fingerprint",
    ];
    if (matchingBindingKeys.some((key) => fingerprintProfileValue(standardPromotion.bindings[key])
        !== fingerprintProfileValue(bindings[key]))) {
      fail("VNEXT_FULL_GATE", "full requires a validated positive standard run with matching execution bindings");
    }
  }
  const body = {
    schema_version: 1,
    plan_kind: "vnext-compound-profile-transition-plan",
    suite_id: suiteId,
    estimand_id: estimand.id,
    estimand_kind: estimand.estimand_kind,
    baseline_arm_id: estimand.baseline_arm_id,
    candidate_arm_id: estimand.candidate_arm_id,
    transition_anchor_component_id: estimand.transition_anchor_component_id,
    eligible_strata: estimand.eligible_strata,
    target_strata: estimand.target_strata,
    negative_control_strata: estimand.negative_control_strata,
    family_ids: familyIds,
    metric_ids: Object.freeze({
      product: Object.freeze([...loaded.contract.metrics.primary_product]),
      operational: Object.freeze([...loaded.contract.metrics.operational]),
      diagnostic: Object.freeze([...loaded.contract.metrics.diagnostic]),
    }),
    arms: Object.freeze({ baseline: baselineArm, candidate: candidateArm }),
    surface_delta: surfaceDelta,
    pair_schedule: pairSchedule,
    bindings,
    standard_gate: suiteId === "full" ? Object.freeze({ ...standardGate }) : null,
  };
  const plan = Object.freeze({ ...body, plan_fingerprint: fingerprintProfileValue(body) });
  if (suiteId === "full") TRUSTED_FULL_PLANS.add(plan);
  return plan;
}

export function assertCurrentCanonicalVnextPlan(repositoryRoot, plan, authorization = null) {
  if (!plainObject(plan) || typeof plan.plan_fingerprint !== "string") {
    fail("VNEXT_PLAN_STALE", "execution plan is missing or invalid");
  }
  const source = { ...plan };
  delete source.plan_fingerprint;
  if (fingerprintProfileValue(source) !== plan.plan_fingerprint) {
    fail("VNEXT_PLAN_STALE", "execution plan fingerprint is stale");
  }
  if (plan.suite_id === "full") {
    if (authorization !== FULL_EXECUTION_AUTHORIZATION || !TRUSTED_FULL_PLANS.has(plan)) {
      fail("VNEXT_FULL_GATE", "rehydrated full plans cannot execute outside the trusted standard-to-full runner");
    }
    return plan;
  }
  const rebuilt = buildVnextExecutionPlan({
    repositoryRoot,
    suiteId: plan.suite_id,
    estimandId: plan.estimand_id,
    model: plan.bindings?.model,
    provider: plan.bindings?.provider,
    variant: plan.bindings?.variant === "host-default" ? null : plan.bindings?.variant,
    seed: plan.bindings?.seed,
    timeoutMs: plan.bindings?.timeout_ms,
    executableIdentity: plan.bindings?.executable_identity,
    allowDirty: true,
  });
  if (fingerprintProfileValue(rebuilt) !== fingerprintProfileValue(plan)) {
    fail("VNEXT_PLAN_NONCANONICAL", "execution plan does not match the current canonical source and contracts");
  }
  return plan;
}

function trustedProducer(plan, evidenceClass) {
  return Object.freeze({
    producer_id: evidenceClass === MODEL_BACKED_EVIDENCE_CLASS
      ? MODEL_BACKED_PRODUCER_ID : MODEL_FREE_PRODUCER_ID,
    schema_version: 1,
    engine_fingerprint: plan.bindings.adapter_fingerprint,
    executable_identity: plan.bindings.executable_identity,
  });
}

export function blockedVnextRunReport(plan, reason) {
  safeText(reason, "blocked reason");
  const incompleteOutcomes = Object.freeze([{
    status: reason === "vnext_execution_not_implemented" ? "not_implemented" : "blocked_external_state",
    reason,
    scored: false,
  }]);
  const source = {
    schema_version: 1,
    run_id: `blocked-${plan.plan_fingerprint.slice(7, 31)}`,
    estimand_id: plan.estimand_id,
    suite_id: plan.suite_id,
    evidence_class: MODEL_BACKED_EVIDENCE_CLASS,
    trusted_producer: trustedProducer(plan, MODEL_BACKED_EVIDENCE_CLASS),
    bindings: plan.bindings,
    status: "blocked-unproven",
    family_results: [],
    pair_results: [],
    product_metrics: {},
    operational_metrics: {},
    diagnostic_metrics: {},
    incomplete_outcomes: incompleteOutcomes,
  };
  return Object.freeze({
    ...source,
    evidence_fingerprint: fingerprintProfileValue({
      plan_fingerprint: plan.plan_fingerprint,
      evidence_class: MODEL_BACKED_EVIDENCE_CLASS,
      trusted_producer: trustedProducer(plan, MODEL_BACKED_EVIDENCE_CLASS),
      pair_results: [],
      incomplete_outcomes: incompleteOutcomes,
    }),
  });
}

function numberBoolean(value) {
  return typeof value === "boolean" ? Number(value) : null;
}

function attemptObservationInputs(result) {
  return Object.freeze({
    hidden_check_passed: result.hidden_check?.passed ?? null,
    workspace_policy_passed: result.workspace_policy?.passed ?? null,
    task_correct: result.task_correct ?? null,
    whole_task_success: result.whole_task_success ?? null,
    defect_escape_v2: result.defect_escape_v2 ?? null,
    trace_policy_passed: result.trace_policy?.passed ?? null,
    trace_violations: Object.freeze([...(result.trace_policy?.violations ?? [])]),
    treatment_compliance_passed: result.treatment_compliance?.passed ?? null,
    unexpected_path_count: result.audit_evidence?.scope?.unexpected_path_count ?? null,
    attested_owner_count: result.audit_evidence?.control?.attested_owner_count ?? null,
    duration_ms: result.metrics?.duration_ms ?? null,
    model_turn_count: result.metrics?.model_turn_count ?? null,
    total_tool_call_count: result.metrics?.total_tool_call_count ?? null,
    subagent_call_count: result.metrics?.subagent_call_count ?? null,
    reason: result.reason ?? null,
    termination_reason: result.termination_reason ?? null,
    evidence_complete: result.evidence_complete === true,
    consumer_observation: result.vnext_consumer_observation ?? null,
  });
}

function consumerEvidenceSettled(consumers) {
  if (!plainObject(consumers)
    || !Array.isArray(consumers.required_consumer_ids)
    || !Array.isArray(consumers.consumer_results)
    || consumers.consumer_results.length !== consumers.required_consumer_ids.length) return false;
  return consumers.consumer_results.every((entry, index) => plainObject(entry)
    && entry.consumer_id === consumers.required_consumer_ids[index]
    && ["passed", "failed"].includes(entry.status)
    && entry.passed === (entry.status === "passed"));
}

function attemptObservations(inputs, stratum, armId) {
  const hidden = numberBoolean(inputs.hidden_check_passed);
  const workspace = numberBoolean(inputs.workspace_policy_passed);
  const regressionFree = typeof inputs.task_correct === "boolean" && typeof inputs.workspace_policy_passed === "boolean"
    ? Number(inputs.task_correct && inputs.workspace_policy_passed)
    : null;
  const traceViolations = inputs.trace_violations;
  const consumers = inputs.consumer_observation;
  const consumerRequired = Array.isArray(consumers?.required_consumer_ids)
    ? consumers.required_consumer_ids.length : 0;
  const consumerPreserved = consumerEvidenceSettled(consumers)
    && Number.isSafeInteger(consumers?.preserved_consumer_count)
    ? consumers.preserved_consumer_count : null;
  const consumerSuccess = consumerRequired === 0
    ? 1
    : (consumerPreserved === null ? null : Number(consumerPreserved === consumerRequired));
  const wholeTask = typeof inputs.whole_task_success === "boolean"
    ? inputs.whole_task_success && consumerSuccess === 1
    : null;
  const observations = {
    functional_hidden_check_success: hidden,
    regression_free_success: regressionFree,
    regression_free_high_risk_success: stratum === "high" ? regressionFree : regressionFree,
    public_contract_preservation: workspace,
    structural_oracle_success: stratum === "medium" ? consumerSuccess : hidden,
    missed_consumer_rate: consumerRequired === 0 || consumerPreserved === null
      ? (consumerRequired === 0 ? 0 : null)
      : (consumerRequired - consumerPreserved) / consumerRequired,
    introduced_high_medium_defects: typeof inputs.defect_escape_v2 === "boolean" ? Number(inputs.defect_escape_v2) : null,
    unnecessary_changed_files: Number.isSafeInteger(inputs.unexpected_path_count)
      ? inputs.unexpected_path_count
      : null,
    verification_omission: Array.isArray(traceViolations) ? Number(traceViolations.includes("targeted_verification_missing")) : null,
    task_completion_without_human_intervention: numberBoolean(wholeTask),
    duration: Number.isFinite(inputs.duration_ms) ? inputs.duration_ms : null,
    model_turns: Number.isFinite(inputs.model_turn_count) ? inputs.model_turn_count : null,
    tool_calls: Number.isFinite(inputs.total_tool_call_count) ? inputs.total_tool_call_count : null,
    delegated_child_count: Number.isFinite(inputs.subagent_call_count) ? inputs.subagent_call_count : null,
    timeout_rate: Number(["adapter_timeout", "opencode_timeout", "opencode_no_progress_timeout"].includes(inputs.reason)
      || inputs.termination_reason === "budget_exhausted"),
    no_progress_turns: inputs.reason === "opencode_no_progress_timeout" ? 1 : 0,
    whole_task_success: numberBoolean(wholeTask),
    protocol_compliance: typeof inputs.treatment_compliance_passed === "boolean" && typeof inputs.trace_policy_passed === "boolean"
      ? Number(inputs.treatment_compliance_passed && inputs.trace_policy_passed)
      : null,
    trace_completeness: numberBoolean(inputs.evidence_complete),
    attestation_completeness: armId === "P5"
      ? Number((inputs.attested_owner_count ?? 0) === 1)
      : 1,
  };
  return Object.freeze(observations);
}

function vnextAttemptEvidence(attempt, armId, stratum) {
  const result = attempt?.result;
  if (!plainObject(result)) fail("VNEXT_ATTEMPT", "runner attempt result is missing");
  const rawObservationInputs = attemptObservationInputs(result);
  const consumerSettled = consumerEvidenceSettled(rawObservationInputs.consumer_observation);
  const observationInputs = rawObservationInputs.evidence_complete && !consumerSettled
    ? Object.freeze({ ...rawObservationInputs, evidence_complete: false })
    : rawObservationInputs;
  const source = {
    arm_id: armId,
    profile_fingerprint: result.profile_fingerprint,
    execution_status: result.execution_status,
    termination_reason: result.termination_reason,
    reason: result.reason,
    evidence_complete: observationInputs.evidence_complete,
    operational_trace_id: result.operational_trace_id,
    result_fingerprint: fingerprintProfileValue(result),
    binding_fingerprint: fingerprintProfileValue(attempt.binding),
    consumer_observation: result.vnext_consumer_observation ?? null,
    observation_inputs: observationInputs,
    observations: attemptObservations(observationInputs, stratum, armId),
  };
  return Object.freeze(source);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function seededUnit(seed, index) {
  return Number.parseInt(createHash("sha256").update(`${seed}\0${index}`).digest("hex").slice(0, 13), 16) / 0x10000000000000;
}

function metricSummary(pairResults, metricId, seed) {
  const rows = pairResults.map((pair) => ({
    family: pair.family_id,
    baseline: pair.baseline.observations[metricId],
    candidate: pair.candidate.observations[metricId],
  }));
  if (rows.some((entry) => !Number.isFinite(entry.baseline) || !Number.isFinite(entry.candidate))) return null;
  const byFamily = new Map();
  for (const row of rows) {
    if (!byFamily.has(row.family)) byFamily.set(row.family, []);
    byFamily.get(row.family).push(row);
  }
  const familyRows = [...byFamily.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, entries]) => ({
    baseline: mean(entries.map((entry) => entry.baseline)),
    candidate: mean(entries.map((entry) => entry.candidate)),
  }));
  const baseline = mean(familyRows.map((entry) => entry.baseline));
  const candidate = mean(familyRows.map((entry) => entry.candidate));
  const pairedDelta = candidate - baseline;
  const samples = [];
  const resamples = Math.max(200, Math.min(2000, familyRows.length * 250));
  for (let sampleIndex = 0; sampleIndex < resamples; sampleIndex += 1) {
    const sampled = [];
    for (let draw = 0; draw < familyRows.length; draw += 1) {
      const selected = Math.min(familyRows.length - 1, Math.floor(seededUnit(`${seed}:${metricId}:${sampleIndex}`, draw) * familyRows.length));
      sampled.push(familyRows[selected].candidate - familyRows[selected].baseline);
    }
    samples.push(mean(sampled));
  }
  samples.sort((left, right) => left - right);
  const lower = samples[Math.floor((samples.length - 1) * 0.025)];
  const upper = samples[Math.ceil((samples.length - 1) * 0.975)];
  return Object.freeze({
    baseline,
    candidate,
    paired_delta: pairedDelta,
    confidence_interval: Object.freeze([Math.min(lower, pairedDelta), Math.max(upper, pairedDelta)]),
  });
}

function deriveMetricGroups(plan, pairResults) {
  const build = (metricIds) => Object.fromEntries(metricIds.map((metricId) => {
    const summary = metricSummary(pairResults, metricId, plan.plan_fingerprint);
    if (summary === null) fail("VNEXT_EVIDENCE_INCOMPLETE", `trusted attempts lack ${metricId}`);
    return [metricId, summary];
  }));
  return Object.freeze({
    product_metrics: Object.freeze(build(plan.metric_ids.product)),
    operational_metrics: Object.freeze(build(plan.metric_ids.operational)),
    diagnostic_metrics: Object.freeze(build(plan.metric_ids.diagnostic)),
  });
}

function familyResultsFromPairs(plan, pairResults) {
  return Object.freeze(plan.family_ids.map((familyId) => {
    const pairs = pairResults.filter((entry) => entry.family_id === familyId);
    const complete = pairs.length === plan.bindings.runner_limits.trajectory_repetitions
      && pairs.every((entry) => entry.status === "complete");
    return Object.freeze({
      family_id: familyId,
      baseline_arm_id: plan.baseline_arm_id,
      candidate_arm_id: plan.candidate_arm_id,
      repetition_count: pairs.length,
      status: complete ? "complete" : "incomplete",
    });
  }));
}

async function executeVnextPlanInternal({
  repositoryRoot,
  plan,
  attemptRunner = runSyntheticProfileAttempt,
  executableIdentity = undefined,
  commandRunner = undefined,
  clock = undefined,
  idFactory = undefined,
  evidenceClass = MODEL_BACKED_EVIDENCE_CLASS,
  fullAuthorization = null,
} = {}) {
  const loaded = loadVnextContracts(repositoryRoot);
  assertCurrentCanonicalVnextPlan(loaded.root, plan, fullAuthorization);
  if (![MODEL_BACKED_EVIDENCE_CLASS, MODEL_FREE_EVIDENCE_CLASS].includes(evidenceClass)) {
    fail("VNEXT_EVIDENCE_CLASS", "run evidence class is unsupported");
  }
  const identity = executableIdentity ?? resolveSyntheticOpenCodeExecutableIdentity();
  const identityBinding = typeof identity === "string" ? identity : identity.fingerprint;
  if (identityBinding !== plan.bindings.executable_identity) {
    fail("VNEXT_EXECUTABLE_IDENTITY", "resolved OpenCode executable does not match the plan binding");
  }
  const familyById = new Map(loaded.contract.families.map((entry) => [entry.id, entry]));
  const pairResults = [];
  const incomplete = [];
  for (const scheduled of plan.pair_schedule) {
    const family = familyById.get(scheduled.family_id);
    const instance = validateRenderedVnextInstance(renderVnextInstance({
      repositoryRoot: loaded.root,
      family,
      seed: `vnext-${createHash("sha256").update(`${plan.bindings.seed}\0${plan.estimand_id}\0${family.id}\0${scheduled.repetition}`).digest("hex").slice(0, 32)}`,
      repetition: scheduled.repetition,
    }), family);
    if (instance.instance_fingerprint !== scheduled.instance_fingerprint) {
      fail("VNEXT_FIXTURE_STALE", `${scheduled.pair_id} rendered fixture changed after planning`);
    }
    const attempts = new Map();
    for (const armId of scheduled.order) {
      const attempt = await attemptRunner({
        sourceRoot: loaded.root,
        instance,
        profileId: armId,
        operationalRunId: `vnext-${scheduled.pair_id}-${armId}`,
        model: plan.bindings.model,
        provider: plan.bindings.provider,
        variant: plan.bindings.variant === "host-default" ? null : plan.bindings.variant,
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
    const mismatchReasons = syntheticPairAttemptMismatchReasons(baselineAttempt, candidateAttempt);
    const baseline = vnextAttemptEvidence(baselineAttempt, plan.baseline_arm_id, scheduled.stratum);
    const candidate = vnextAttemptEvidence(candidateAttempt, plan.candidate_arm_id, scheduled.stratum);
    const complete = mismatchReasons.length === 0 && baseline.evidence_complete && candidate.evidence_complete;
    const pairSource = {
      pair_id: scheduled.pair_id,
      family_id: scheduled.family_id,
      stratum: scheduled.stratum,
      repetition: scheduled.repetition,
      order: scheduled.order,
      instance_fingerprint: scheduled.instance_fingerprint,
      required_consumer_ids: scheduled.required_consumer_ids,
      status: complete ? "complete" : "incomplete",
      incomplete_reasons: Object.freeze([
        ...mismatchReasons,
        ...(!baseline.evidence_complete ? ["baseline-evidence-incomplete"] : []),
        ...(!candidate.evidence_complete ? ["candidate-evidence-incomplete"] : []),
      ]),
      baseline,
      candidate,
    };
    pairResults.push(Object.freeze({ ...pairSource, evidence_fingerprint: fingerprintProfileValue(pairSource) }));
    if (!complete) {
      incomplete.push(Object.freeze({
        status: [baseline.execution_status, candidate.execution_status].includes("blocked_external_state")
          ? "blocked_external_state" : "incomplete_evidence",
        reason: `${scheduled.pair_id}:${pairSource.incomplete_reasons.join(",") || "attempt-incomplete"}`,
        scored: false,
      }));
    }
    if ([baseline.execution_status, candidate.execution_status].includes("blocked_external_state")) break;
  }
  const familyResults = familyResultsFromPairs(plan, pairResults);
  const complete = incomplete.length === 0 && pairResults.length === plan.pair_schedule.length
    && familyResults.every((entry) => entry.status === "complete");
  const metrics = complete ? deriveMetricGroups(plan, pairResults) : {
    product_metrics: {}, operational_metrics: {}, diagnostic_metrics: {},
  };
  const reportSource = {
    schema_version: 1,
    run_id: `vnext-${plan.plan_fingerprint.slice(7, 31)}`,
    estimand_id: plan.estimand_id,
    suite_id: plan.suite_id,
    evidence_class: evidenceClass,
    trusted_producer: trustedProducer(plan, evidenceClass),
    bindings: plan.bindings,
    status: complete ? "complete" : (incomplete.some((entry) => entry.status === "blocked_external_state") ? "blocked-unproven" : "incomplete"),
    family_results: familyResults,
    pair_results: Object.freeze(pairResults),
    ...metrics,
    incomplete_outcomes: Object.freeze(incomplete.length > 0 ? incomplete : []),
  };
  const report = Object.freeze({
    ...reportSource,
    evidence_fingerprint: fingerprintProfileValue({
      plan_fingerprint: plan.plan_fingerprint,
      evidence_class: reportSource.evidence_class,
      trusted_producer: reportSource.trusted_producer,
      pair_results: reportSource.pair_results,
      incomplete_outcomes: reportSource.incomplete_outcomes,
    }),
  });
  const validated = validateVnextRunReport(plan, report);
  if (evidenceClass === MODEL_BACKED_EVIDENCE_CLASS) TRUSTED_MODEL_BACKED_REPORTS.add(validated);
  return validated;
}

export async function executeVnextPlan({ repositoryRoot, plan, executableIdentity = undefined } = {}) {
  if (plan?.suite_id === "full") {
    fail("VNEXT_FULL_GATE", "full execution is available only through executeVnextFull");
  }
  return executeVnextPlanInternal({ repositoryRoot, plan, executableIdentity });
}

export async function executeVnextPlanModelFreeTest({
  repositoryRoot,
  plan,
  attemptRunner,
  executableIdentity,
} = {}) {
  if (typeof attemptRunner !== "function") fail("VNEXT_TEST_RUNNER", "model-free attempt runner is required");
  return executeVnextPlanInternal({
    repositoryRoot,
    plan,
    attemptRunner,
    executableIdentity,
    evidenceClass: MODEL_FREE_EVIDENCE_CLASS,
  });
}

function createTrustedRunEnvelope(plan, report) {
  if (!TRUSTED_MODEL_BACKED_REPORTS.has(report)) {
    fail("VNEXT_PROMOTION_PROVENANCE", "only a runner-owned model-backed report can form promotion evidence");
  }
  const source = {
    schema_version: 1,
    run_kind: "vnext-run-envelope",
    plan,
    report,
  };
  const envelope = Object.freeze({ ...source, envelope_fingerprint: fingerprintProfileValue(source) });
  TRUSTED_RUN_ENVELOPES.add(envelope);
  return envelope;
}

export async function executeVnextStandard({
  repositoryRoot,
  estimandId,
  model,
  provider,
  variant,
  seed,
  timeoutMs,
  executableIdentity,
} = {}) {
  const identityBinding = typeof executableIdentity === "string"
    ? executableIdentity : executableIdentity?.fingerprint;
  const plan = buildVnextExecutionPlan({
    repositoryRoot,
    suiteId: "standard",
    estimandId,
    model,
    provider,
    variant,
    seed,
    timeoutMs,
    executableIdentity: identityBinding,
  });
  const report = await executeVnextPlan({ repositoryRoot, plan, executableIdentity });
  const envelope = createTrustedRunEnvelope(plan, report);
  const decision = buildVnextPromotionDecisionFromRun({ repositoryRoot, envelope });
  return Object.freeze({ envelope, decision });
}

export async function executeVnextFull({
  repositoryRoot,
  estimandId,
  model,
  provider,
  variant,
  seed,
  timeoutMs,
  executableIdentity,
} = {}) {
  const standard = await executeVnextStandard({
    repositoryRoot,
    estimandId,
    model,
    provider,
    variant,
    seed,
    timeoutMs,
    executableIdentity,
  });
  const standardEnvelope = standard.envelope;
  const standardDecision = standard.decision;
  if (standardDecision.promotable !== true) {
    fail("VNEXT_FULL_GATE", `in-process standard execution did not promote: ${standardDecision.verdict}`);
  }
  const standardGate = Object.freeze({
    standard_run_fingerprint: standardEnvelope.envelope_fingerprint,
    standard_comparison_fingerprint: standardDecision.comparison_fingerprint,
    standard_promotion_decision_fingerprint: standardDecision.decision_fingerprint,
  });
  const identityBinding = typeof executableIdentity === "string"
    ? executableIdentity : executableIdentity?.fingerprint;
  const fullPlan = buildVnextExecutionPlan({
    repositoryRoot,
    suiteId: "full",
    estimandId,
    model,
    provider,
    variant,
    seed,
    timeoutMs,
    executableIdentity: identityBinding,
    fullAuthorization: FULL_EXECUTION_AUTHORIZATION,
    standardPromotion: standardDecision,
    standardGate,
  });
  const report = await executeVnextPlanInternal({
    repositoryRoot,
    plan: fullPlan,
    executableIdentity,
    fullAuthorization: FULL_EXECUTION_AUTHORIZATION,
  });
  const fullEnvelopeSource = {
    schema_version: 1,
    run_kind: "vnext-full-run-envelope",
    plan: fullPlan,
    report,
    standard_gate: standardGate,
  };
  const envelope = Object.freeze({
    ...fullEnvelopeSource,
    envelope_fingerprint: fingerprintProfileValue(fullEnvelopeSource),
  });
  return validateVnextFullRunEnvelope(envelope);
}

export function validateVnextFullRunEnvelope(envelope) {
  exactKeys(envelope, [
    "schema_version", "run_kind", "plan", "report", "standard_gate", "envelope_fingerprint",
  ], "full run envelope");
  const { envelope_fingerprint: declared, ...source } = envelope;
  if (envelope.schema_version !== 1 || envelope.run_kind !== "vnext-full-run-envelope"
    || declared !== fingerprintProfileValue(source)
    || envelope.plan?.suite_id !== "full" || envelope.report?.suite_id !== "full"
    || fingerprintProfileValue(envelope.standard_gate)
      !== fingerprintProfileValue(envelope.plan?.standard_gate)) {
    fail("VNEXT_FULL_ENVELOPE", "full run envelope is stale or does not bind its plan standard gate");
  }
  validateVnextRunReport(envelope.plan, envelope.report);
  return envelope;
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!plainObject(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    fail("VNEXT_ADAPTER_REPORT", `${label} must contain exactly the declared keys`);
  }
}

function validateMetricSummary(value, metricId, label) {
  exactKeys(value, SUMMARY_KEYS, label);
  for (const key of ["baseline", "candidate", "paired_delta"]) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key])) {
      fail("VNEXT_ADAPTER_REPORT", `${label}.${key} must be finite`);
    }
  }
  const computedDelta = value.candidate - value.baseline;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(value.baseline), Math.abs(value.candidate)) * 8;
  if (Math.abs(value.paired_delta - computedDelta) > tolerance) {
    fail("VNEXT_ADAPTER_REPORT", `${label}.paired_delta contradicts candidate minus baseline`);
  }
  if (!Array.isArray(value.confidence_interval) || value.confidence_interval.length !== 2
    || value.confidence_interval.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
    || value.confidence_interval[0] > value.confidence_interval[1]
    || value.paired_delta < value.confidence_interval[0]
    || value.paired_delta > value.confidence_interval[1]) {
    fail("VNEXT_ADAPTER_REPORT", `${label}.confidence_interval is invalid`);
  }
  if (RATE_METRIC_IDS.has(metricId)) {
    if (value.baseline < 0 || value.baseline > 1 || value.candidate < 0 || value.candidate > 1
      || value.paired_delta < -1 || value.paired_delta > 1
      || value.confidence_interval[0] < -1 || value.confidence_interval[1] > 1) {
      fail("VNEXT_ADAPTER_REPORT", `${label} is outside the declared rate range`);
    }
  } else if (value.baseline < 0 || value.candidate < 0) {
    fail("VNEXT_ADAPTER_REPORT", `${label} contains a negative count or cost`);
  }
}

function validateMetricGroup(value, metricIds, label) {
  exactKeys(value, metricIds, label);
  for (const metricId of metricIds) validateMetricSummary(value[metricId], metricId, `${label}.${metricId}`);
}

function validateFamilyResults(plan, report) {
  if (!Array.isArray(report.family_results)) {
    fail("VNEXT_ADAPTER_REPORT", "family_results must be an array");
  }
  const expectedRepetitions = plan.bindings.runner_limits.trajectory_repetitions;
  const familyIds = [];
  for (const [index, result] of report.family_results.entries()) {
    exactKeys(result, [
      "family_id", "baseline_arm_id", "candidate_arm_id", "repetition_count", "status",
    ], `family_results[${index}]`);
    if (typeof result.family_id !== "string" || !plan.family_ids.includes(result.family_id)
      || result.baseline_arm_id !== plan.baseline_arm_id
      || result.candidate_arm_id !== plan.candidate_arm_id
      || !Number.isSafeInteger(result.repetition_count) || result.repetition_count < 0
      || !["complete", "incomplete", "blocked"].includes(result.status)) {
      fail("VNEXT_ADAPTER_REPORT", `family_results[${index}] is invalid or unbound`);
    }
    if (result.status === "complete" && result.repetition_count !== expectedRepetitions) {
      fail("VNEXT_ADAPTER_REPORT", `${result.family_id} has incomplete trajectory coverage`);
    }
    familyIds.push(result.family_id);
  }
  if (new Set(familyIds).size !== familyIds.length) {
    fail("VNEXT_ADAPTER_REPORT", "family_results contains duplicate families");
  }
  if (report.status === "complete") {
    if (JSON.stringify([...familyIds].sort()) !== JSON.stringify([...plan.family_ids].sort())
      || report.family_results.some((entry) => entry.status !== "complete")) {
      fail("VNEXT_ADAPTER_REPORT", "complete report must cover every selected family exactly once");
    }
  }
}

function validateIncompleteOutcomes(report) {
  if (!Array.isArray(report.incomplete_outcomes)) {
    fail("VNEXT_ADAPTER_REPORT", "incomplete_outcomes must be an array");
  }
  for (const [index, outcome] of report.incomplete_outcomes.entries()) {
    if (!plainObject(outcome) || outcome.scored !== false
      || typeof outcome.status !== "string" || outcome.status.length === 0
      || typeof outcome.reason !== "string" || outcome.reason.length === 0) {
      fail("VNEXT_ADAPTER_REPORT", `incomplete_outcomes[${index}] must be explicit and unscored`);
    }
  }
}

function validatePairResults(plan, report) {
  if (!Array.isArray(report.pair_results)) fail("VNEXT_ADAPTER_REPORT", "pair_results must be an array");
  const scheduleById = new Map(plan.pair_schedule.map((entry) => [entry.pair_id, entry]));
  const metricIds = [...plan.metric_ids.product, ...plan.metric_ids.operational, ...plan.metric_ids.diagnostic];
  const observed = new Set();
  for (const [index, pair] of report.pair_results.entries()) {
    if (!plainObject(pair) || observed.has(pair.pair_id)) {
      fail("VNEXT_ADAPTER_REPORT", `pair_results[${index}] is invalid or duplicated`);
    }
    observed.add(pair.pair_id);
    const scheduled = scheduleById.get(pair.pair_id);
    if (!scheduled || pair.family_id !== scheduled.family_id || pair.stratum !== scheduled.stratum
      || pair.repetition !== scheduled.repetition || pair.instance_fingerprint !== scheduled.instance_fingerprint
      || fingerprintProfileValue(pair.required_consumer_ids) !== fingerprintProfileValue(scheduled.required_consumer_ids)
      || fingerprintProfileValue(pair.order) !== fingerprintProfileValue(scheduled.order)
      || !["complete", "incomplete"].includes(pair.status) || !Array.isArray(pair.incomplete_reasons)) {
      fail("VNEXT_ADAPTER_REPORT", `pair_results[${index}] is stale or unbound`);
    }
    const { evidence_fingerprint: declaredPairFingerprint, ...pairSource } = pair;
    if (declaredPairFingerprint !== fingerprintProfileValue(pairSource)) {
      fail("VNEXT_ADAPTER_REPORT", `pair_results[${index}] evidence fingerprint is invalid`);
    }
    for (const [side, expectedArm, expectedFingerprint] of [
      ["baseline", plan.baseline_arm_id, plan.arms.baseline.profile_fingerprint],
      ["candidate", plan.candidate_arm_id, plan.arms.candidate.profile_fingerprint],
    ]) {
      const attempt = pair[side];
      if (!plainObject(attempt) || attempt.arm_id !== expectedArm
        || attempt.profile_fingerprint !== expectedFingerprint
        || !plainObject(attempt.observation_inputs)
        || !plainObject(attempt.observations)
        || JSON.stringify(Object.keys(attempt.observations).sort()) !== JSON.stringify([...metricIds].sort())
        || !/^sha256:[0-9a-f]{64}$/u.test(attempt.result_fingerprint ?? "")
        || !/^sha256:[0-9a-f]{64}$/u.test(attempt.binding_fingerprint ?? "")) {
        fail("VNEXT_ADAPTER_REPORT", `pair_results[${index}].${side} is invalid or unbound`);
      }
      exactKeys(attempt.observation_inputs, OBSERVATION_INPUT_KEYS,
        `pair_results[${index}].${side}.observation_inputs`);
      const recomputedObservations = attemptObservations(attempt.observation_inputs, pair.stratum, expectedArm);
      if (fingerprintProfileValue(recomputedObservations) !== fingerprintProfileValue(attempt.observations)
        || attempt.evidence_complete !== attempt.observation_inputs.evidence_complete
        || attempt.reason !== attempt.observation_inputs.reason
        || attempt.termination_reason !== attempt.observation_inputs.termination_reason
        || fingerprintProfileValue(attempt.consumer_observation)
          !== fingerprintProfileValue(attempt.observation_inputs.consumer_observation)) {
        fail("VNEXT_ADAPTER_REPORT", `pair_results[${index}].${side} observations do not match runner receipt inputs`);
      }
      for (const [metricId, value] of Object.entries(attempt.observations)) {
        if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
          fail("VNEXT_ADAPTER_REPORT", `pair_results[${index}].${side}.${metricId} is invalid`);
        }
      }
      if (pair.status === "complete" && (!attempt.evidence_complete
        || !consumerEvidenceSettled(attempt.consumer_observation)
        || Object.values(attempt.observations).some((entry) => !Number.isFinite(entry)))) {
        fail("VNEXT_ADAPTER_REPORT", `complete pair ${pair.pair_id} lacks complete runner evidence`);
      }
      const consumer = attempt.consumer_observation;
      if (!plainObject(consumer) || !Array.isArray(consumer.required_consumer_ids)
        || fingerprintProfileValue(consumer.required_consumer_ids) !== fingerprintProfileValue(pair.required_consumer_ids)
        || !Array.isArray(consumer.consumer_results)
        || !Number.isSafeInteger(consumer.preserved_consumer_count)
        || consumer.preserved_consumer_count < 0
        || consumer.preserved_consumer_count > consumer.required_consumer_ids.length
        || attempt.observations.missed_consumer_rate
          !== (consumerEvidenceSettled(consumer)
            ? (consumer.required_consumer_ids.length === 0 ? 0
              : (consumer.required_consumer_ids.length - consumer.preserved_consumer_count)
                / consumer.required_consumer_ids.length)
            : null)) {
        fail("VNEXT_ADAPTER_REPORT", `pair_results[${index}].${side} consumer evidence is invalid`);
      }
      exactKeys(consumer, [
        "required_consumer_ids", "consumer_results", "preserved_consumer_count", "check_status", "passed",
      ], `pair_results[${index}].${side}.consumer_observation`);
      const completedConsumerChecks = consumer.consumer_results.every((entry, consumerIndex) => {
        if (!plainObject(entry)) return false;
        exactKeys(entry, ["consumer_id", "status", "passed"],
          `pair_results[${index}].${side}.consumer_observation.consumer_results[${consumerIndex}]`);
        return entry.consumer_id === consumer.required_consumer_ids[consumerIndex]
          && ["passed", "failed", "blocked", "not_run", "incomplete"].includes(entry.status)
          && ((entry.status === "passed" && entry.passed === true)
            || (entry.status === "failed" && entry.passed === false)
            || (["blocked", "not_run", "incomplete"].includes(entry.status) && entry.passed === null));
      });
      const allConsumerChecksSettled = consumer.consumer_results.length === consumer.required_consumer_ids.length
        && consumer.consumer_results.every((entry) => ["passed", "failed"].includes(entry.status));
      const expectedConsumerPassed = consumer.required_consumer_ids.length === 0
        ? true
        : (allConsumerChecksSettled
          ? consumer.consumer_results.every((entry) => entry.passed === true)
          : null);
      const expectedConsumerStatus = consumer.required_consumer_ids.length === 0
        ? "not_applicable"
        : (allConsumerChecksSettled ? (expectedConsumerPassed ? "passed" : "failed") : "incomplete");
      if (!completedConsumerChecks
        || consumer.consumer_results.length !== consumer.required_consumer_ids.length
        || consumer.preserved_consumer_count
          !== consumer.consumer_results.filter((entry) => entry.passed === true).length
        || consumer.passed !== expectedConsumerPassed
        || consumer.check_status !== expectedConsumerStatus) {
        fail("VNEXT_ADAPTER_REPORT", `pair_results[${index}].${side} consumer result map is invalid`);
      }
    }
    if (pair.status === "complete" && pair.incomplete_reasons.length !== 0) {
      fail("VNEXT_ADAPTER_REPORT", `complete pair ${pair.pair_id} contains incomplete reasons`);
    }
  }
  if (report.status === "complete" && (observed.size !== plan.pair_schedule.length
    || plan.pair_schedule.some((entry) => !observed.has(entry.pair_id)))) {
    fail("VNEXT_ADAPTER_REPORT", "complete report must contain every planned pair exactly once");
  }
  const expectedEvidenceFingerprint = fingerprintProfileValue({
    plan_fingerprint: plan.plan_fingerprint,
    evidence_class: report.evidence_class,
    trusted_producer: report.trusted_producer,
    pair_results: report.pair_results,
    incomplete_outcomes: report.incomplete_outcomes,
  });
  if (report.evidence_fingerprint !== expectedEvidenceFingerprint) {
    fail("VNEXT_ADAPTER_REPORT", "run report evidence fingerprint is invalid");
  }
}

export function validateVnextRunReport(plan, report) {
  if (!plainObject(report)) {
    fail("VNEXT_ADAPTER_REPORT", "run report must be an object");
  }
  exactKeys(report, [
    "schema_version", "run_id", "estimand_id", "suite_id", "evidence_class", "trusted_producer", "bindings", "status",
    "family_results", "pair_results", "product_metrics", "operational_metrics", "diagnostic_metrics",
    "incomplete_outcomes", "evidence_fingerprint",
  ], "run report");
  if (report.schema_version !== 1 || report.estimand_id !== plan.estimand_id
    || report.suite_id !== plan.suite_id
    || fingerprintProfileValue(report.bindings) !== fingerprintProfileValue(plan.bindings)
    || !REPORT_STATUSES.has(report.status)
    || typeof report.run_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(report.run_id)) {
    fail("VNEXT_ADAPTER_REPORT", "run report is stale, unbound, or invalid");
  }
  if (![MODEL_BACKED_EVIDENCE_CLASS, MODEL_FREE_EVIDENCE_CLASS].includes(report.evidence_class)) {
    fail("VNEXT_EVIDENCE_CLASS", "run report evidence class is unsupported");
  }
  exactKeys(report.trusted_producer, [
    "producer_id", "schema_version", "engine_fingerprint", "executable_identity",
  ], "run report trusted producer");
  const expectedProducer = trustedProducer(plan, report.evidence_class);
  if (fingerprintProfileValue(report.trusted_producer) !== fingerprintProfileValue(expectedProducer)) {
    fail("VNEXT_TRUSTED_PRODUCER", "run report producer is not the runner-owned producer bound to this plan");
  }
  validateFamilyResults(plan, report);
  validateIncompleteOutcomes(report);
  validatePairResults(plan, report);
  if (report.status === "complete") {
    if (report.incomplete_outcomes.length !== 0) {
      fail("VNEXT_ADAPTER_REPORT", "complete report cannot contain incomplete outcomes");
    }
    validateMetricGroup(report.product_metrics, plan.metric_ids.product, "product_metrics");
    validateMetricGroup(report.operational_metrics, plan.metric_ids.operational, "operational_metrics");
    validateMetricGroup(report.diagnostic_metrics, plan.metric_ids.diagnostic, "diagnostic_metrics");
    const derived = deriveMetricGroups(plan, report.pair_results);
    for (const group of ["product_metrics", "operational_metrics", "diagnostic_metrics"]) {
      if (fingerprintProfileValue(report[group]) !== fingerprintProfileValue(derived[group])) {
        fail("VNEXT_ADAPTER_REPORT", `${group} was not derived from runner-owned pair evidence`);
      }
    }
  } else {
    if (report.incomplete_outcomes.length === 0) {
      fail("VNEXT_ADAPTER_REPORT", "non-complete report must enumerate incomplete outcomes");
    }
    for (const [label, value] of Object.entries({
      product_metrics: report.product_metrics,
      operational_metrics: report.operational_metrics,
      diagnostic_metrics: report.diagnostic_metrics,
    })) {
      exactKeys(value, [], `${label} for a non-complete report`);
    }
  }
  return report;
}

function metricGroupFor(plan, metricId) {
  for (const group of ["product", "operational", "diagnostic"]) {
    if (plan.metric_ids[group].includes(metricId)) return `${group === "product" ? "product" : group === "operational" ? "operational" : "diagnostic"}_metrics`;
  }
  fail("VNEXT_COMPARISON", `unknown target metric ${metricId}`);
}

function promotionAssessment(loaded, plan, report, perStratum) {
  if (report.status === "blocked-unproven") return { verdict: "blocked-unproven", guardrailResults: [] };
  if (report.status !== "complete" || plan.suite_id === "smoke") return { verdict: "inconclusive", guardrailResults: [] };
  const policy = loaded.policy;
  const estimand = loaded.contract.estimands.find((entry) => entry.id === plan.estimand_id);
  const rule = policy.promotion_rules.find((entry) => entry.estimand_id === estimand.id);
  const targetPairs = report.pair_results.filter((entry) => (
    entry.status === "complete" && estimand.target_strata.includes(entry.stratum)
  ));
  const target = metricSummary(targetPairs, estimand.target_metric, `${plan.plan_fingerprint}:target`);
  const timeout = report.operational_metrics.timeout_rate;
  const functional = report.product_metrics.functional_hidden_check_success;
  const defects = report.product_metrics.introduced_high_medium_defects;
  const targetFamilyCount = new Set(targetPairs.map((entry) => entry.family_id)).size;
  const completePairsByStratum = Object.fromEntries(perStratum.map((entry) => [entry.stratum, entry.pair_count]));
  const smallControl = estimand.negative_control_strata.includes("small")
    ? perStratum.find((entry) => entry.stratum === "small")?.paired_effects?.functional_hidden_check_success ?? null
    : null;
  const normalizedSmallDelta = smallControl?.paired_delta ?? null;
  const guardrailResults = Object.freeze([
    Object.freeze({
      id: "minimum-complete-pairs-per-stratum",
      passed: plan.eligible_strata.every((stratum) => (
        (completePairsByStratum[stratum] ?? 0) >= policy.minimum_complete_pairs_per_stratum
      )),
      observed: completePairsByStratum,
      threshold: policy.minimum_complete_pairs_per_stratum,
    }),
    Object.freeze({
      id: "minimum-task-families-per-standard-estimand",
      passed: targetFamilyCount >= policy.minimum_task_families_per_standard_estimand,
      observed: targetFamilyCount,
      threshold: policy.minimum_task_families_per_standard_estimand,
    }),
    Object.freeze({
      id: "small-negative-control-delta-minimum",
      passed: normalizedSmallDelta === null || normalizedSmallDelta >= policy.small_negative_control_delta_minimum,
      observed: normalizedSmallDelta,
      threshold: policy.small_negative_control_delta_minimum,
    }),
    Object.freeze({
      id: "timeout-rate-delta-maximum",
      passed: timeout.paired_delta <= policy.timeout_rate_delta_maximum,
      observed: timeout.paired_delta,
      threshold: policy.timeout_rate_delta_maximum,
    }),
    Object.freeze({
      id: "functional-harm-ci-lower-bound-minimum",
      passed: functional.confidence_interval[0] >= policy.functional_harm_ci_lower_bound_minimum,
      observed: functional.confidence_interval[0],
      threshold: policy.functional_harm_ci_lower_bound_minimum,
    }),
    Object.freeze({
      id: "introduced-high-medium-defects-maximum",
      passed: defects.candidate <= policy.introduced_high_medium_defects_maximum,
      observed: defects.candidate,
      threshold: policy.introduced_high_medium_defects_maximum,
    }),
    Object.freeze({
      id: "trusted-model-backed-contained-run",
      passed: report.evidence_class === MODEL_BACKED_EVIDENCE_CLASS
        && report.trusted_producer.producer_id === MODEL_BACKED_PRODUCER_ID,
      observed: report.evidence_class,
      threshold: MODEL_BACKED_EVIDENCE_CLASS,
    }),
  ]);
  if (guardrailResults.some((entry) => !entry.passed)) return { verdict: "reject", guardrailResults };
  const directional = rule.direction === "higher-is-better"
    ? target.paired_delta > 0 && target.confidence_interval[0] >= 0
    : target.paired_delta < 0 && target.confidence_interval[1] <= 0;
  if (directional) return { verdict: "promote", guardrailResults };
  const harmful = rule.direction === "higher-is-better"
    ? target.confidence_interval[1] < 0
    : target.confidence_interval[0] > 0;
  return { verdict: harmful ? "reject" : "retain-optional", guardrailResults };
}

export function buildVnextComparisonReport({
  repositoryRoot,
  plan,
  report,
  promotionAuthorization = null,
} = {}) {
  const loaded = loadVnextContracts(repositoryRoot);
  assertCurrentCanonicalVnextPlan(loaded.root, plan);
  validateVnextRunReport(plan, report);
  const perFamily = plan.family_ids.map((familyId) => {
    const pairs = report.pair_results.filter((entry) => entry.family_id === familyId && entry.status === "complete");
    const paired_effects = report.status === "complete"
      ? Object.fromEntries([...plan.metric_ids.product, ...plan.metric_ids.operational, ...plan.metric_ids.diagnostic]
        .map((metricId) => [metricId, metricSummary(pairs, metricId, `${plan.plan_fingerprint}:${familyId}`)]))
      : {};
    return Object.freeze({ family_id: familyId, pair_count: pairs.length, paired_effects });
  });
  const perStratum = [...new Set(plan.pair_schedule.map((entry) => entry.stratum))].sort().map((stratum) => {
    const pairs = report.pair_results.filter((entry) => entry.stratum === stratum && entry.status === "complete");
    return Object.freeze({
      stratum,
      pair_count: pairs.length,
      family_count: new Set(pairs.map((entry) => entry.family_id)).size,
      paired_effects: report.status === "complete"
        ? Object.fromEntries([...plan.metric_ids.product, ...plan.metric_ids.operational, ...plan.metric_ids.diagnostic]
          .map((metricId) => [metricId, metricSummary(pairs, metricId, `${plan.plan_fingerprint}:${stratum}`)]))
        : {},
    });
  });
  const assessment = promotionAssessment(loaded, plan, report, perStratum);
  const source = {
    schema_version: 1,
    report_kind: "vnext-compound-profile-transition-comparison",
    estimand_id: plan.estimand_id,
    suite_id: plan.suite_id,
    bindings: plan.bindings,
    evidence_class: report.evidence_class,
    trusted_producer: report.trusted_producer,
    status: report.status,
    paired_effects: report.status === "complete" ? {
      ...report.product_metrics,
      ...report.operational_metrics,
      ...report.diagnostic_metrics,
    } : {},
    per_family: Object.freeze(perFamily),
    per_stratum: Object.freeze(perStratum),
    pareto: report.status === "complete" ? Object.freeze({
      target_metric: loaded.contract.estimands.find((entry) => entry.id === plan.estimand_id).target_metric,
      duration_delta: report.operational_metrics.duration.paired_delta,
      tool_call_delta: report.operational_metrics.tool_calls.paired_delta,
      timeout_rate_delta: report.operational_metrics.timeout_rate.paired_delta,
    }) : {},
    incomplete_outcomes: report.incomplete_outcomes,
    guardrail_results: assessment.guardrailResults,
    verdict: assessment.verdict,
    source_evidence_fingerprint: report.evidence_fingerprint,
    policy_fingerprint: loaded.validation.policy_fingerprint,
  };
  const comparison = Object.freeze({ ...source, decision_fingerprint: fingerprintProfileValue(source) });
  if (promotionAuthorization === FULL_EXECUTION_AUTHORIZATION
    && TRUSTED_MODEL_BACKED_REPORTS.has(report)) {
    TRUSTED_COMPARISONS.add(comparison);
  }
  return comparison;
}

function applyVnextPromotionPolicy(comparison) {
  if (!plainObject(comparison)) fail("VNEXT_PROMOTION", "comparison report is invalid");
  const { decision_fingerprint: declared, ...source } = comparison;
  if (declared !== fingerprintProfileValue(source)
    || !["promote", "retain-optional", "reject", "inconclusive", "blocked-unproven"].includes(comparison.verdict)) {
    fail("VNEXT_PROMOTION", "comparison decision is stale or invalid");
  }
  if (comparison.evidence_class !== MODEL_BACKED_EVIDENCE_CLASS
    || comparison.trusted_producer?.producer_id !== MODEL_BACKED_PRODUCER_ID) {
    fail("VNEXT_PROMOTION_EVIDENCE", "promotion accepts only trusted model-backed contained-run evidence");
  }
  if (!TRUSTED_COMPARISONS.has(comparison)) {
    fail("VNEXT_PROMOTION_PROVENANCE", "standalone comparison artifacts cannot authorize promotion");
  }
  return Object.freeze({
    schema_version: 1,
    decision_kind: "vnext-compound-profile-transition-promotion-decision",
    estimand_id: comparison.estimand_id,
    suite_id: comparison.suite_id,
    verdict: comparison.verdict,
    promotable: comparison.verdict === "promote" && comparison.suite_id !== "smoke",
    comparison_fingerprint: declared,
    policy_fingerprint: comparison.policy_fingerprint,
  });
}

export function buildVnextPromotionDecisionFromRun({ repositoryRoot, envelope } = {}) {
  if (!plainObject(envelope)) fail("VNEXT_PROMOTION", "standard run envelope is invalid");
  exactKeys(envelope, ["schema_version", "run_kind", "plan", "report", "envelope_fingerprint"], "run envelope");
  const { envelope_fingerprint: declaredEnvelopeFingerprint, ...envelopeSource } = envelope;
  if (envelope.schema_version !== 1 || envelope.run_kind !== "vnext-run-envelope"
    || declaredEnvelopeFingerprint !== fingerprintProfileValue(envelopeSource)) {
    fail("VNEXT_PROMOTION", "standard run envelope is stale or invalid");
  }
  if (!TRUSTED_RUN_ENVELOPES.has(envelope)
    || !TRUSTED_MODEL_BACKED_REPORTS.has(envelope.report)) {
    fail("VNEXT_PROMOTION_PROVENANCE", "serialized or caller-fabricated run envelopes cannot authorize promotion");
  }
  const comparison = buildVnextComparisonReport({
    repositoryRoot,
    plan: envelope.plan,
    report: envelope.report,
    promotionAuthorization: FULL_EXECUTION_AUTHORIZATION,
  });
  const policyDecision = applyVnextPromotionPolicy(comparison);
  const source = {
    ...policyDecision,
    status: comparison.status,
    bindings: comparison.bindings,
    source_run_fingerprint: declaredEnvelopeFingerprint,
    source_evidence_fingerprint: comparison.source_evidence_fingerprint,
  };
  const decision = Object.freeze({ ...source, decision_fingerprint: fingerprintProfileValue(source) });
  TRUSTED_PROMOTION_DECISIONS.add(decision);
  return decision;
}
