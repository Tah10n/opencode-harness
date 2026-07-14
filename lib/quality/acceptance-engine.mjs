import { randomUUID } from "node:crypto";

import { DECISION_SCHEMA_VERSION, ContractError, assertSafeId } from "../feedback/contracts.mjs";
import { comparePermissionSurfaces, validatePermissionSnapshot } from "../feedback/acceptance.mjs";
import {
  QUALITY_ACCEPTANCE_HARD_GATES,
  QUALITY_ACCEPTANCE_PROFILE_ROLES,
  canonicalAcceptanceCorpusFingerprint,
  isLegacyAcceptanceReport,
  qualityAcceptancePairUniverse,
  qualityAcceptancePairUniverseFingerprint,
  qualityAcceptancePolicyFingerprint,
  qualityLiveReportFingerprint,
  sealQualityAcceptanceDecision,
  validateCanonicalAcceptanceScenarios,
  validateCanonicalExperimentBindings,
  validateQualityAcceptancePolicy,
  validateQualityLiveReport,
  validateRuntimeEvidenceArray,
} from "./acceptance-contracts.mjs";
import { runtimeExecutionFingerprint } from "./runtime-execution.mjs";
import { fingerprint } from "./validation.mjs";

const EPSILON = Number.EPSILON * 8;

function gate(status, reasonCodes = []) {
  return { status, reason_codes: [...new Set(reasonCodes)].sort() };
}

function aggregateStatus(items) {
  if (items.some((entry) => entry.status === "inconclusive")) return "inconclusive";
  if (items.some((entry) => entry.status === "failed")) return "failed";
  return "passed";
}

function clockValue(clock) {
  const value = typeof clock === "function" ? clock() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new ContractError("QUALITY_ACCEPTANCE_CLOCK", "clock returned an invalid timestamp");
  return date.toISOString();
}

function resultKey(role, comparisonId) {
  return `${role}:${comparisonId}`;
}

function reasonSet(gates, statuses) {
  return [...new Set(
    QUALITY_ACCEPTANCE_HARD_GATES
      .filter((name) => statuses.includes(gates[name].status))
      .flatMap((name) => gates[name].reason_codes),
  )].sort();
}

function unavailableMetricSet() {
  const unavailable = { available: false, baseline: null, candidate: null, delta: null };
  return {
    task_success_rate: { ...unavailable },
    visible_pass_rate: { ...unavailable },
    hidden_pass_rate: { ...unavailable },
    defect_escape_rate: { ...unavailable },
  };
}

function metricSnapshot(baseline, candidate) {
  return {
    available: true,
    baseline,
    candidate,
    delta: candidate - baseline,
  };
}

function aggregateResultMetrics(pairs) {
  if (pairs.length === 0) return unavailableMetricSet();
  const mean = (role, selector) => pairs.reduce((sum, pair) => sum + selector(pair[role].result), 0) / pairs.length;
  const baseline = {
    task_success_rate: mean("baseline", (result) => result.status === "passed" ? 1 : 0),
    visible_pass_rate: mean("baseline", (result) => result.visible_pass_rate),
    hidden_pass_rate: mean("baseline", (result) => result.hidden_pass_rate),
    defect_escape_rate: mean("baseline", (result) => result.defect_escape_rate),
  };
  const candidate = {
    task_success_rate: mean("candidate", (result) => result.status === "passed" ? 1 : 0),
    visible_pass_rate: mean("candidate", (result) => result.visible_pass_rate),
    hidden_pass_rate: mean("candidate", (result) => result.hidden_pass_rate),
    defect_escape_rate: mean("candidate", (result) => result.defect_escape_rate),
  };
  return Object.fromEntries(
    Object.keys(baseline).map((key) => [key, metricSnapshot(baseline[key], candidate[key])]),
  );
}

function targetAssessment(target, pairs) {
  const familyPairs = pairs.filter((pair) => pair.scenario.failure_family === target.failure_family);
  const metrics = aggregateResultMetrics(familyPairs);
  if (familyPairs.length === 0) {
    return {
      target_id: target.target_id,
      failure_family: target.failure_family,
      metrics,
      status: "inconclusive",
      reason_codes: ["QUALITY_TARGET_EVIDENCE_MISSING"],
    };
  }
  const reasons = [];
  for (const key of ["task_success_rate", "visible_pass_rate", "hidden_pass_rate"]) {
    const threshold = target.thresholds[key];
    if (metrics[key].candidate + EPSILON < threshold.minimum_candidate) {
      reasons.push(`QUALITY_TARGET_${key.toUpperCase()}_BELOW_MINIMUM`);
    }
    if (metrics[key].delta + EPSILON < threshold.minimum_delta) {
      reasons.push(`QUALITY_TARGET_${key.toUpperCase()}_DELTA_BELOW_MINIMUM`);
    }
  }
  const defectThreshold = target.thresholds.defect_escape_rate;
  if (metrics.defect_escape_rate.candidate - EPSILON > defectThreshold.maximum_candidate) {
    reasons.push("QUALITY_TARGET_DEFECT_ESCAPE_RATE_ABOVE_MAXIMUM");
  }
  if (metrics.defect_escape_rate.delta - EPSILON > defectThreshold.maximum_delta) {
    reasons.push("QUALITY_TARGET_DEFECT_ESCAPE_RATE_DELTA_ABOVE_MAXIMUM");
  }
  return {
    target_id: target.target_id,
    failure_family: target.failure_family,
    metrics,
    status: reasons.length === 0 ? "passed" : "failed",
    reason_codes: reasons.sort(),
  };
}

function protectedAssessment(protectedFamily, pairs) {
  const familyPairs = pairs.filter((pair) => pair.scenario.failure_family === protectedFamily.failure_family);
  const metrics = aggregateResultMetrics(familyPairs);
  if (familyPairs.length === 0) {
    return {
      failure_family: protectedFamily.failure_family,
      criticality: protectedFamily.criticality,
      metrics,
      status: "inconclusive",
      reason_codes: ["QUALITY_PROTECTED_FAMILY_EVIDENCE_MISSING"],
    };
  }
  const thresholds = protectedFamily.thresholds;
  const reasons = [];
  if (metrics.task_success_rate.delta + EPSILON < thresholds.task_success_rate_minimum_delta) {
    reasons.push("QUALITY_PROTECTED_TASK_SUCCESS_REGRESSION");
  }
  if (metrics.visible_pass_rate.delta + EPSILON < thresholds.visible_pass_rate_minimum_delta) {
    reasons.push("QUALITY_PROTECTED_VISIBLE_REGRESSION");
  }
  if (metrics.hidden_pass_rate.delta + EPSILON < thresholds.hidden_pass_rate_minimum_delta) {
    reasons.push("QUALITY_PROTECTED_HIDDEN_REGRESSION");
  }
  if (metrics.defect_escape_rate.delta - EPSILON > thresholds.defect_escape_rate_maximum_delta) {
    reasons.push("QUALITY_PROTECTED_DEFECT_ESCAPE_REGRESSION");
  }
  return {
    failure_family: protectedFamily.failure_family,
    criticality: protectedFamily.criticality,
    metrics,
    status: reasons.length === 0 ? "passed" : "failed",
    reason_codes: reasons.sort(),
  };
}

function qualityFailureScore(result) {
  const quality = result.quality_outcomes;
  return quality.architecture_policy_violations
    + quality.invariant_violations
    + quality.unverified_critical_invariants
    + (quality.incomplete_dossier ? 1 : 0)
    + quality.pre_edit_gate_violations
    + quality.unresolved_affected_path_gaps
    + quality.test_quality_failures
    + quality.permission_widening
    + quality.introduced_regressions
    + quality.hidden_edge_case_failures
    + (quality.integrated_verification_complete ? 0 : 1)
    + (result.quality_attestation?.gate_status === "passed" ? 0 : 1);
}

function pairRegressed(pair) {
  const baseline = pair.baseline.result;
  const candidate = pair.candidate.result;
  return (baseline.status === "passed" && candidate.status !== "passed")
    || candidate.visible_pass_rate + EPSILON < baseline.visible_pass_rate
    || candidate.hidden_pass_rate + EPSILON < baseline.hidden_pass_rate
    || candidate.defect_escape_rate - EPSILON > baseline.defect_escape_rate
    || qualityFailureScore(candidate) > qualityFailureScore(baseline);
}

function suiteRegressionGate(suite, pairs, expectedBindings, scenariosById) {
  const expectedKeys = new Set(
    expectedBindings
      .filter((binding) => scenariosById.get(binding.scenario_id)?.suite === suite)
      .map((binding) => binding.comparison_id),
  );
  const suitePairs = pairs.filter((pair) => pair.scenario.suite === suite);
  const observedKeys = new Set(suitePairs.map((pair) => pair.key));
  if ([...expectedKeys].some((key) => !observedKeys.has(key))) {
    return gate("inconclusive", [`QUALITY_${suite.toUpperCase()}_EVIDENCE_INCOMPLETE`]);
  }
  const regressions = suitePairs.filter(pairRegressed);
  return regressions.length > 0
    ? gate("failed", [`QUALITY_${suite.toUpperCase()}_REGRESSION`])
    : gate("passed");
}

function resourceUnavailable() {
  return {
    available: false,
    baseline_total: null,
    candidate_total: null,
    delta: null,
    ratio: null,
    unit: null,
  };
}

function resourceMetric(pairs, selector, unit) {
  if (pairs.length === 0) return resourceUnavailable();
  const values = [];
  for (const pair of pairs) {
    for (const role of QUALITY_ACCEPTANCE_PROFILE_ROLES) {
      const value = selector(pair[role].result);
      if (value === null) return resourceUnavailable();
      values.push({ role, value });
    }
  }
  const baseline = values.filter((entry) => entry.role === "baseline").reduce((sum, entry) => sum + entry.value, 0);
  const candidate = values.filter((entry) => entry.role === "candidate").reduce((sum, entry) => sum + entry.value, 0);
  if (baseline === 0) return resourceUnavailable();
  return {
    available: true,
    baseline_total: baseline,
    candidate_total: candidate,
    delta: candidate - baseline,
    ratio: candidate / baseline,
    unit,
  };
}

function costMetric(pairs) {
  let currency = null;
  const metric = resourceMetric(pairs, (result) => {
    if (!result.cost.available) return null;
    if (currency === null) currency = result.cost.currency;
    if (currency !== result.cost.currency) return null;
    return result.cost.value;
  }, currency ?? "cost");
  if (metric.available) metric.unit = currency;
  return metric;
}

function ceilingGate(ceiling, metric, { totalKey, exceededCode, unavailableCode, currency = false } = {}) {
  if (ceiling === null) return gate("not_applicable");
  if (!metric.available || (currency && metric.unit !== ceiling.currency)) {
    return gate("inconclusive", [unavailableCode]);
  }
  const totalExceeded = ceiling[totalKey] !== null && metric.candidate_total > ceiling[totalKey] + EPSILON;
  const ratioExceeded = ceiling.maximum_ratio !== null && metric.ratio > ceiling.maximum_ratio + EPSILON;
  return totalExceeded || ratioExceeded ? gate("failed", [exceededCode]) : gate("passed");
}

function identityFromResult(result, prescribedIdentity) {
  const { required_capability_ids: _requiredCapabilities, ...observedIdentity } = prescribedIdentity;
  return {
    ...observedIdentity,
    repository_fingerprint: result.repository_fingerprint,
    host_profile_id: result.host_profile_id,
    profile_fingerprint: result.profile_fingerprint,
    runtime_model_evidence_fingerprint: result.runtime_model_evidence_fingerprint,
    runtime_execution_fingerprint: result.runtime_execution_fingerprint,
    permission_snapshot_fingerprint: result.permission_snapshot_fingerprint,
    permission_profile_fingerprint: result.permission_profile_fingerprint,
  };
}

function permissionSurfaceGate(
  results,
  baselineSnapshot,
  candidateSnapshot,
  baselineId,
  candidateId,
  repositoryFingerprint,
) {
  const reasons = [];
  const trusted = {};
  if (repositoryFingerprint === null) {
    reasons.push("QUALITY_PERMISSION_REPOSITORY_IDENTITY_UNAVAILABLE");
  }
  for (const [role, snapshot, expectedProfileId] of [
    ["baseline", baselineSnapshot, baselineId],
    ["candidate", candidateSnapshot, candidateId],
  ]) {
    const upper = role.toUpperCase();
    if (snapshot === null || snapshot === undefined) {
      reasons.push(`QUALITY_PERMISSION_${upper}_SNAPSHOT_MISSING`);
      continue;
    }
    try {
      validatePermissionSnapshot(snapshot);
    } catch (error) {
      if (!(error instanceof ContractError)) throw error;
      reasons.push(`QUALITY_PERMISSION_${upper}_SNAPSHOT_INVALID`);
      continue;
    }
    if (
      snapshot.profile_id !== expectedProfileId
      || snapshot.source !== "installed_runtime"
      || !snapshot.complete
      || snapshot.incomplete_scopes.length > 0
    ) {
      reasons.push(`QUALITY_PERMISSION_${upper}_SNAPSHOT_UNTRUSTED`);
      continue;
    }
    if (repositoryFingerprint !== null && snapshot.subject_fingerprint !== repositoryFingerprint) {
      reasons.push(`QUALITY_PERMISSION_${upper}_SUBJECT_MISMATCH`);
      continue;
    }
    const snapshotFingerprint = fingerprint(snapshot);
    const roleResults = [...results.values()].filter((entry) => entry.result.profile_role === role);
    if (roleResults.length === 0) {
      reasons.push(`QUALITY_PERMISSION_${upper}_RESULT_MISSING`);
      continue;
    }
    if (
      roleResults.some((entry) => (
        entry.result.permission_snapshot_fingerprint !== snapshotFingerprint
        || entry.result.permission_profile_fingerprint !== snapshot.profile_fingerprint
      ))
    ) {
      reasons.push(`QUALITY_PERMISSION_${upper}_RESULT_BINDING_MISMATCH`);
      continue;
    }
    trusted[role] = snapshot;
  }
  if (reasons.length > 0 || !trusted.baseline || !trusted.candidate) {
    return gate("inconclusive", reasons.length > 0 ? reasons : ["QUALITY_PERMISSION_EVIDENCE_MISSING"]);
  }
  const comparison = comparePermissionSurfaces(
    trusted.baseline.permissions,
    trusted.candidate.permissions,
  );
  if (!comparison.keys_match) return gate("inconclusive", ["QUALITY_PERMISSION_KEYS_MISMATCH"]);
  if (comparison.widened_permissions.length > 0) return gate("failed", ["QUALITY_PERMISSION_SURFACE_WIDENED"]);
  return gate("passed");
}

function candidateQualityMetrics(candidateResults) {
  if (candidateResults.length === 0) {
    return {
      candidate_result_count: 0,
      complete_attestation_count: 0,
      complete_quality_outcome_count: 0,
      architecture_policy_violations: 0,
      invariant_violations: 0,
      unverified_critical_invariants: 0,
      incomplete_dossiers: 0,
      pre_edit_gate_violations: 0,
      unresolved_affected_path_gaps: 0,
      minimum_edge_case_verification_rate: 0,
      minimum_failure_mode_verification_rate: 0,
      test_quality_failures: 0,
      permission_widening: 0,
      introduced_regressions: 0,
      hidden_edge_case_failures: 0,
      integrated_verification_failures: 0,
    };
  }
  const sum = (selector) => candidateResults.reduce((total, entry) => total + selector(entry.result), 0);
  return {
    candidate_result_count: candidateResults.length,
    complete_attestation_count: sum((result) => result.quality_attestation?.gate_status === "passed" ? 1 : 0),
    complete_quality_outcome_count: sum((result) => result.quality_outcomes.complete ? 1 : 0),
    architecture_policy_violations: sum((result) => result.quality_outcomes.architecture_policy_violations),
    invariant_violations: sum((result) => result.quality_outcomes.invariant_violations),
    unverified_critical_invariants: sum((result) => result.quality_outcomes.unverified_critical_invariants),
    incomplete_dossiers: sum((result) => result.quality_outcomes.incomplete_dossier ? 1 : 0),
    pre_edit_gate_violations: sum((result) => result.quality_outcomes.pre_edit_gate_violations),
    unresolved_affected_path_gaps: sum((result) => result.quality_outcomes.unresolved_affected_path_gaps),
    minimum_edge_case_verification_rate: Math.min(...candidateResults.map((entry) => entry.result.quality_outcomes.edge_case_verification_rate)),
    minimum_failure_mode_verification_rate: Math.min(...candidateResults.map((entry) => entry.result.quality_outcomes.failure_mode_verification_rate)),
    test_quality_failures: sum((result) => result.quality_outcomes.test_quality_failures),
    permission_widening: sum((result) => result.quality_outcomes.permission_widening),
    introduced_regressions: sum((result) => result.quality_outcomes.introduced_regressions),
    hidden_edge_case_failures: sum((result) => result.quality_outcomes.hidden_edge_case_failures),
    integrated_verification_failures: sum((result) => result.quality_outcomes.integrated_verification_complete ? 0 : 1),
  };
}

function assessQualityThresholds(metrics, requirements) {
  if (metrics.candidate_result_count === 0) {
    return gate("inconclusive", ["QUALITY_CANDIDATE_EVIDENCE_MISSING"]);
  }
  const reasons = [];
  if (
    requirements.require_complete_attestation
    && metrics.complete_attestation_count !== metrics.candidate_result_count
  ) reasons.push("QUALITY_ATTESTATION_REQUIREMENT_FAILED");
  if (
    requirements.require_complete_quality_outcomes
    && metrics.complete_quality_outcome_count !== metrics.candidate_result_count
  ) reasons.push("QUALITY_OUTCOME_COMPLETENESS_REQUIREMENT_FAILED");
  if (metrics.architecture_policy_violations > requirements.maximum_architecture_policy_violations) {
    reasons.push("QUALITY_ARCHITECTURE_POLICY_VIOLATION");
  }
  if (metrics.invariant_violations > requirements.maximum_invariant_violations) {
    reasons.push("QUALITY_INVARIANT_VIOLATION");
  }
  if (metrics.unverified_critical_invariants > requirements.maximum_unverified_critical_invariants) {
    reasons.push("QUALITY_CRITICAL_INVARIANT_UNVERIFIED");
  }
  if (metrics.incomplete_dossiers > requirements.maximum_incomplete_dossiers) {
    reasons.push("QUALITY_DOSSIER_INCOMPLETE");
  }
  if (metrics.pre_edit_gate_violations > requirements.maximum_pre_edit_gate_violations) {
    reasons.push("QUALITY_PRE_EDIT_GATE_VIOLATION");
  }
  if (metrics.unresolved_affected_path_gaps > requirements.maximum_unresolved_affected_path_gaps) {
    reasons.push("QUALITY_AFFECTED_PATH_UNRESOLVED");
  }
  if (metrics.minimum_edge_case_verification_rate + EPSILON < requirements.minimum_edge_case_verification_rate) {
    reasons.push("QUALITY_EDGE_CASE_COVERAGE_BELOW_MINIMUM");
  }
  if (metrics.minimum_failure_mode_verification_rate + EPSILON < requirements.minimum_failure_mode_verification_rate) {
    reasons.push("QUALITY_FAILURE_MODE_COVERAGE_BELOW_MINIMUM");
  }
  if (metrics.test_quality_failures > requirements.maximum_test_quality_failures) {
    reasons.push("QUALITY_TEST_QUALITY_FAILURE");
  }
  if (metrics.permission_widening > requirements.maximum_permission_widening) {
    reasons.push("QUALITY_PERMISSION_WIDENED");
  }
  if (metrics.introduced_regressions > requirements.maximum_introduced_regressions) {
    reasons.push("QUALITY_INTRODUCED_REGRESSION");
  }
  if (metrics.hidden_edge_case_failures > requirements.maximum_hidden_edge_case_failures) {
    reasons.push("QUALITY_HIDDEN_EDGE_CASE_FAILURE");
  }
  if (requirements.require_integrated_verification && metrics.integrated_verification_failures > 0) {
    reasons.push("QUALITY_INTEGRATED_VERIFICATION_MISSING");
  }
  return reasons.length === 0 ? gate("passed") : gate("failed", reasons);
}

function validatePolicyAgainstCorpus(policy, scenarios, experimentBindings) {
  const actualUniverseFingerprint = qualityAcceptancePairUniverseFingerprint(experimentBindings);
  if (actualUniverseFingerprint !== policy.profile_requirements.pair_universe_fingerprint) {
    throw new ContractError(
      "QUALITY_ACCEPTANCE_PAIR_UNIVERSE_POLICY",
      "canonical experiment bindings do not match the exact policy pair universe",
    );
  }
  const families = new Set(scenarios.map((entry) => entry.failure_family));
  for (const target of policy.targets) {
    if (!families.has(target.failure_family)) {
      throw new ContractError(
        "QUALITY_ACCEPTANCE_TARGET_CORPUS",
        `target ${target.target_id} references failure family absent from the canonical corpus`,
      );
    }
  }
  for (const protectedFamily of policy.protected_failure_families) {
    if (!families.has(protectedFamily.failure_family)) {
      throw new ContractError(
        "QUALITY_ACCEPTANCE_PROTECTED_CORPUS",
        `protected failure family ${protectedFamily.failure_family} is absent from the canonical corpus`,
      );
    }
  }
  const suites = new Set(scenarios.map((entry) => entry.suite));
  for (const suite of policy.required_suites) {
    if (!suites.has(suite)) {
      throw new ContractError("QUALITY_ACCEPTANCE_SUITE_CORPUS", `required suite ${suite} has no canonical scenario`);
    }
  }
  const scenarioById = new Map(scenarios.map((entry) => [entry.scenario_id, entry]));
  const coveredScenarioRepetitions = new Set();
  for (const binding of experimentBindings) {
    if (
      binding.experiment_id !== policy.profile_requirements.experiment_id
      || binding.experiment_fingerprint !== policy.profile_requirements.experiment_fingerprint
    ) {
      throw new ContractError(
        "QUALITY_ACCEPTANCE_EXPERIMENT_POLICY",
        `comparison ${binding.comparison_id} does not bind the policy experiment`,
      );
    }
    const scenario = scenarioById.get(binding.scenario_id);
    if (!scenario || binding.repetition > scenario.repetitions) {
      throw new ContractError(
        "QUALITY_ACCEPTANCE_EXPERIMENT_CORPUS",
        `comparison ${binding.comparison_id} is outside the canonical scenario corpus`,
      );
    }
    coveredScenarioRepetitions.add(`${binding.scenario_id}#${binding.repetition}`);
    if (
      policy.profile_requirements.require_distinct_model_profiles_within_pair
      && binding.baseline.model_profile_fingerprint === binding.candidate.model_profile_fingerprint
    ) {
      throw new ContractError(
        "QUALITY_ACCEPTANCE_EXPERIMENT_PROFILE",
        `comparison ${binding.comparison_id} does not use distinct baseline/candidate model profiles`,
      );
    }
  }
  for (const scenario of scenarios) {
    for (let repetition = 1; repetition <= scenario.repetitions; repetition += 1) {
      if (!coveredScenarioRepetitions.has(`${scenario.scenario_id}#${repetition}`)) {
        throw new ContractError(
          "QUALITY_ACCEPTANCE_EXPERIMENT_COVERAGE",
          `experiment omits ${scenario.scenario_id} repetition ${repetition}`,
        );
      }
    }
  }
}

function runtimeGate(results, bindingById, runtimeEvidence, policy) {
  const evidenceByFingerprint = new Map(runtimeEvidence.map((entry) => [entry.content_fingerprint, entry]));
  const missing = [];
  const failures = [];
  for (const entry of results.values()) {
    const result = entry.result;
    const role = result.profile_role;
    const prescribed = bindingById.get(result.comparison_id)?.[role];
    if (!prescribed) {
      failures.push("QUALITY_RUNTIME_UNPLANNED_COMPARISON");
      continue;
    }
    const evidence = evidenceByFingerprint.get(result.runtime_model_evidence_fingerprint);
    if (!evidence) {
      missing.push(`QUALITY_RUNTIME_${role.toUpperCase()}_EVIDENCE_MISSING`);
      continue;
    }
    if (evidence.evidence_kind !== "installed_runtime") {
      missing.push(`QUALITY_RUNTIME_${role.toUpperCase()}_INSTALLED_EVIDENCE_REQUIRED`);
      continue;
    }
    if (!evidence.complete || evidence.effective_model_id === null || evidence.runtime_version === null || !result.model.available) {
      missing.push(`QUALITY_RUNTIME_${role.toUpperCase()}_EVIDENCE_INCOMPLETE`);
      continue;
    }
    if (
      evidence.catalog_id !== bindingById.get(result.comparison_id).catalog_id
      || evidence.catalog_fingerprint !== bindingById.get(result.comparison_id).catalog_fingerprint
      ||
      evidence.requested_profile_id !== prescribed.model_profile_id
      || evidence.requested_model_id !== prescribed.model_id
      || evidence.effective_model_id !== prescribed.model_id
      || result.model.value !== prescribed.model_id
    ) {
      failures.push(`QUALITY_RUNTIME_${role.toUpperCase()}_IDENTITY_MISMATCH`);
    }
    const options = new Map(evidence.option_results.map((option) => [option.option_id, option]));
    for (const [optionId, expectedValue] of Object.entries({
      model: prescribed.model_id,
      reasoning_effort: prescribed.reasoning_effort,
      text_verbosity: prescribed.text_verbosity,
      mode: prescribed.mode,
    })) {
      const option = options.get(optionId);
      if (
        !option
        || option.status !== "accepted"
        || option.requested_value !== expectedValue
        || option.effective_value !== expectedValue
      ) {
        failures.push(`QUALITY_RUNTIME_${role.toUpperCase()}_OPTION_MISMATCH`);
      }
    }
    for (const capabilityId of prescribed.required_capability_ids) {
      const capability = options.get(capabilityId);
      if (!capability || capability.status !== "accepted") {
        failures.push(`QUALITY_RUNTIME_${role.toUpperCase()}_CAPABILITY_MISSING`);
      }
    }
  }
  if (missing.length > 0 && policy.profile_requirements.require_installed_runtime_evidence) {
    return gate("inconclusive", missing);
  }
  if (failures.length > 0) return gate("failed", failures);
  return gate("passed");
}

function profileGate(
  results,
  bindingById,
  scenarioById,
  repositoryFingerprint,
  baselineId,
  candidateId,
  baselinePermissionSnapshot,
  candidatePermissionSnapshot,
) {
  const failures = [];
  const incomplete = [];
  const hostProfileByRole = { baseline: baselineId, candidate: candidateId };
  const permissionByRole = {
    baseline: baselinePermissionSnapshot,
    candidate: candidatePermissionSnapshot,
  };
  for (const entry of results.values()) {
    const result = entry.result;
    const expectedBinding = bindingById.get(result.comparison_id);
    const expected = expectedBinding?.[result.profile_role];
    if (!expectedBinding || !expected) {
      failures.push("QUALITY_PROFILE_UNPLANNED_COMPARISON");
      continue;
    }
    for (const key of [
      "experiment_id",
      "experiment_fingerprint",
      "comparison_id",
      "scenario_id",
      "repetition",
      "variant_id",
      "harness_role",
    ]) {
      if (result[key] !== expectedBinding[key]) {
        failures.push(`QUALITY_PROFILE_BINDING_${key.toUpperCase()}_MISMATCH`);
      }
    }
    for (const key of [
      "profile_fingerprint",
      "model_profile_id",
      "model_profile_fingerprint",
      "prompt_profile_id",
      "prompt_profile_fingerprint",
    ]) {
      if (result[key] !== expected[key]) {
        failures.push(`QUALITY_PROFILE_${result.profile_role.toUpperCase()}_${key.toUpperCase()}_MISMATCH`);
      }
    }
    if (!result.model.available || result.model.value !== expected.model_id) {
      failures.push(`QUALITY_PROFILE_${result.profile_role.toUpperCase()}_MODEL_ID_MISMATCH`);
    }
    const upper = result.profile_role.toUpperCase();
    const expectedHostProfileId = hostProfileByRole[result.profile_role];
    if (result.host_profile_id !== expectedHostProfileId) {
      failures.push(`QUALITY_RUNTIME_EXECUTION_${upper}_HOST_PROFILE_MISMATCH`);
    }
    if (result.runtime_execution_fingerprint === null) {
      incomplete.push(`QUALITY_RUNTIME_EXECUTION_${upper}_MISSING`);
      continue;
    }
    const scenario = scenarioById.get(expectedBinding.scenario_id);
    const permission = permissionByRole[result.profile_role];
    if (repositoryFingerprint === null || !scenario || !permission) {
      incomplete.push(`QUALITY_RUNTIME_EXECUTION_${upper}_INPUT_UNAVAILABLE`);
      continue;
    }
    let expectedRuntimeExecutionFingerprint;
    try {
      expectedRuntimeExecutionFingerprint = runtimeExecutionFingerprint({
        repository_fingerprint: repositoryFingerprint,
        host_profile_id: expectedHostProfileId,
        experiment_id: expectedBinding.experiment_id,
        experiment_fingerprint: expectedBinding.experiment_fingerprint,
        comparison_id: expectedBinding.comparison_id,
        variant_id: expectedBinding.variant_id,
        harness_role: expectedBinding.harness_role,
        scenario_id: expectedBinding.scenario_id,
        scenario_fingerprint: scenario.scenario_fingerprint,
        repetition: expectedBinding.repetition,
        profile_role: result.profile_role,
        profile_fingerprint: expected.profile_fingerprint,
        model_profile_id: expected.model_profile_id,
        model_profile_fingerprint: expected.model_profile_fingerprint,
        model_id: expected.model_id,
        reasoning_effort: expected.reasoning_effort,
        text_verbosity: expected.text_verbosity,
        mode: expected.mode,
        prompt_profile_id: expected.prompt_profile_id,
        prompt_profile_fingerprint: expected.prompt_profile_fingerprint,
        runtime_model_evidence_fingerprint: result.runtime_model_evidence_fingerprint,
        permission_snapshot_fingerprint: fingerprint(permission),
        permission_profile_fingerprint: permission.profile_fingerprint,
      });
    } catch (error) {
      if (!(error instanceof ContractError)) throw error;
      incomplete.push(`QUALITY_RUNTIME_EXECUTION_${upper}_INPUT_UNAVAILABLE`);
      continue;
    }
    if (result.runtime_execution_fingerprint !== expectedRuntimeExecutionFingerprint) {
      failures.push(`QUALITY_RUNTIME_EXECUTION_${upper}_BINDING_MISMATCH`);
    }
  }
  if (incomplete.length > 0) return gate("inconclusive", [...incomplete, ...failures]);
  if (failures.length > 0) return gate("failed", failures);
  return gate("passed");
}

export function assessQualityCandidate({
  reports,
  policy,
  canonicalScenarios,
  canonicalExperimentBindings,
  runtimeModelEvidence = [],
  baselinePermissionSnapshot = null,
  candidatePermissionSnapshot = null,
  baselineId,
  candidateId,
  clock = () => new Date(),
  idFactory = () => `quality-decision-${randomUUID()}`,
}) {
  validateQualityAcceptancePolicy(policy);
  validateCanonicalAcceptanceScenarios(canonicalScenarios);
  validateCanonicalExperimentBindings(canonicalExperimentBindings);
  validateRuntimeEvidenceArray(runtimeModelEvidence);
  validatePolicyAgainstCorpus(policy, canonicalScenarios, canonicalExperimentBindings);
  if (!Array.isArray(reports) || reports.length === 0) {
    throw new ContractError("QUALITY_ACCEPTANCE_REPORTS", "reports must be a non-empty array");
  }
  assertSafeId(baselineId, "baselineId");
  assertSafeId(candidateId, "candidateId");
  if (baselineId === candidateId) {
    throw new ContractError("QUALITY_ACCEPTANCE_PROFILE_IDS", "baselineId and candidateId must differ");
  }

  const evidenceReasons = [];
  const trustedReports = [];
  for (const report of reports) {
    if (isLegacyAcceptanceReport(report)) {
      evidenceReasons.push("QUALITY_LEGACY_REPORT_V1_UNAVAILABLE");
      continue;
    }
    try {
      validateQualityLiveReport(report);
    } catch (error) {
      if (!(error instanceof ContractError)) throw error;
      evidenceReasons.push("QUALITY_LIVE_REPORT_INVALID");
      continue;
    }
    if (
      report.provenance.evidence_kind !== "live"
      || report.provenance.producer_id !== policy.expected_producers.live_report
    ) {
      evidenceReasons.push("QUALITY_LIVE_REPORT_UNTRUSTED");
      continue;
    }
    if (!report.provenance.complete) {
      evidenceReasons.push("QUALITY_LIVE_REPORT_INCOMPLETE");
      continue;
    }
    trustedReports.push({ report, fingerprint: qualityLiveReportFingerprint(report) });
  }
  if (trustedReports.length === 0) evidenceReasons.push("QUALITY_LIVE_REPORT_V2_MISSING");

  const scenarioById = new Map(canonicalScenarios.map((entry) => [entry.scenario_id, entry]));
  const bindingById = new Map(canonicalExperimentBindings.map((entry) => [entry.comparison_id, entry]));
  const results = new Map();
  const runIds = new Set();
  for (const reportEntry of trustedReports) {
    for (const result of reportEntry.report.results) {
      const binding = bindingById.get(result.comparison_id);
      if (!binding) {
        throw new ContractError(
          "QUALITY_ACCEPTANCE_UNPLANNED_COMPARISON",
          `result references unplanned comparison ${result.comparison_id}`,
        );
      }
      const scenario = scenarioById.get(result.scenario_id);
      if (!scenario) {
        throw new ContractError("QUALITY_ACCEPTANCE_ORPHAN_RESULT", `result references unknown scenario ${result.scenario_id}`);
      }
      if (result.repetition > scenario.repetitions) {
        throw new ContractError("QUALITY_ACCEPTANCE_ORPHAN_REPETITION", `result exceeds repetitions for ${result.scenario_id}`);
      }
      if (result.scenario_fingerprint !== scenario.scenario_fingerprint) {
        throw new ContractError("QUALITY_ACCEPTANCE_SCENARIO_FINGERPRINT", `result fingerprint mismatch for ${result.scenario_id}`);
      }
      const key = resultKey(result.profile_role, result.comparison_id);
      if (results.has(key)) throw new ContractError("QUALITY_ACCEPTANCE_DUPLICATE_PAIR", `duplicate result ${key}`);
      if (runIds.has(result.operational_run_id)) {
        throw new ContractError("QUALITY_ACCEPTANCE_DUPLICATE_RUN", `duplicate operational run ${result.operational_run_id}`);
      }
      results.set(key, { result, reportFingerprint: reportEntry.fingerprint });
      runIds.add(result.operational_run_id);
    }
  }
  const repositoryFingerprints = new Set(
    [...results.values()].map((entry) => entry.result.repository_fingerprint),
  );
  const repositoryFingerprint = repositoryFingerprints.size === 1
    ? [...repositoryFingerprints][0]
    : null;
  if (repositoryFingerprints.size > 1) {
    evidenceReasons.push("QUALITY_REPOSITORY_FINGERPRINT_MISMATCH");
  }

  const expectedPairKeys = qualityAcceptancePairUniverse(canonicalExperimentBindings);
  const paired = [];
  const missingPairs = [];
  const incompletePairs = [];
  const repositoryMismatchPairs = [];
  for (const key of expectedPairKeys) {
    const binding = bindingById.get(key);
    const baseline = results.get(resultKey("baseline", key));
    const candidate = results.get(resultKey("candidate", key));
    if (!baseline || !candidate) {
      missingPairs.push(key);
      continue;
    }
    if (baseline.result.repository_fingerprint !== candidate.result.repository_fingerprint) {
      repositoryMismatchPairs.push(key);
      continue;
    }
    if (baseline.result.status === "incomplete" || candidate.result.status === "incomplete") {
      incompletePairs.push(key);
      continue;
    }
    paired.push({
      key,
      binding,
      scenario: scenarioById.get(binding.scenario_id),
      baseline,
      candidate,
    });
  }

  const hardGates = {};
  hardGates.evidence_integrity = evidenceReasons.length > 0
    ? gate("inconclusive", evidenceReasons)
    : gate("passed");
  hardGates.required_pairs = missingPairs.length > 0 || incompletePairs.length > 0 || repositoryMismatchPairs.length > 0
    ? gate("inconclusive", [
      ...(missingPairs.length > 0 ? ["QUALITY_REQUIRED_PAIR_MISSING"] : []),
      ...(incompletePairs.length > 0 ? ["QUALITY_REQUIRED_PAIR_INCOMPLETE"] : []),
      ...(repositoryMismatchPairs.length > 0 ? ["QUALITY_REQUIRED_PAIR_REPOSITORY_MISMATCH"] : []),
    ])
    : gate("passed");
  hardGates.profile_identity = profileGate(
    results,
    bindingById,
    scenarioById,
    repositoryFingerprint,
    baselineId,
    candidateId,
    baselinePermissionSnapshot,
    candidatePermissionSnapshot,
  );
  hardGates.permission_surface = permissionSurfaceGate(
    results,
    baselinePermissionSnapshot,
    candidatePermissionSnapshot,
    baselineId,
    candidateId,
    repositoryFingerprint,
  );
  hardGates.runtime_model_evidence = runtimeGate(results, bindingById, runtimeModelEvidence, policy);

  const qualityEvidenceReasons = [];
  for (const entry of results.values()) {
    const quality = entry.result.quality_outcomes;
    if (entry.result.quality_attestation === null) {
      qualityEvidenceReasons.push("QUALITY_ATTESTATION_EVIDENCE_MISSING");
    }
    if (quality.producer_id !== policy.expected_producers.quality_outcomes) {
      qualityEvidenceReasons.push("QUALITY_OUTCOME_PRODUCER_UNTRUSTED");
    }
    if (!quality.complete) qualityEvidenceReasons.push("QUALITY_OUTCOME_EVIDENCE_INCOMPLETE");
  }
  if (results.size === 0) qualityEvidenceReasons.push("QUALITY_OUTCOME_EVIDENCE_MISSING");
  hardGates.quality_evidence = qualityEvidenceReasons.length > 0
    ? gate("inconclusive", qualityEvidenceReasons)
    : gate("passed");

  const candidateResults = [...results.values()].filter((entry) => entry.result.profile_role === "candidate");
  const qualityMetrics = candidateQualityMetrics(candidateResults);
  hardGates.quality_thresholds = assessQualityThresholds(qualityMetrics, policy.quality_requirements);

  const perTargetMetrics = policy.targets.map((target) => targetAssessment(target, paired));
  hardGates.targets = gate(
    aggregateStatus(perTargetMetrics),
    perTargetMetrics.flatMap((entry) => entry.reason_codes),
  );
  const perProtectedFamilyMetrics = policy.protected_failure_families
    .map((protectedFamily) => protectedAssessment(protectedFamily, paired));
  hardGates.protected_failure_families = gate(
    aggregateStatus(perProtectedFamilyMetrics),
    perProtectedFamilyMetrics.flatMap((entry) => entry.reason_codes),
  );
  hardGates.canary_regressions = suiteRegressionGate("canary", paired, canonicalExperimentBindings, scenarioById);
  hardGates.held_out_regressions = suiteRegressionGate("held_out", paired, canonicalExperimentBindings, scenarioById);

  const resourceMetrics = {
    cost: costMetric(paired),
    duration_ms: resourceMetric(paired, (result) => result.duration_ms, "ms"),
    tokens: resourceMetric(
      paired,
      (result) => result.token_usage.available ? result.token_usage.total_tokens : null,
      "tokens",
    ),
  };
  hardGates.cost_ceiling = ceilingGate(policy.cost_ceiling, resourceMetrics.cost, {
    totalKey: "maximum_candidate_total",
    exceededCode: "QUALITY_COST_CEILING_EXCEEDED",
    unavailableCode: "QUALITY_COST_EVIDENCE_UNAVAILABLE",
    currency: true,
  });
  hardGates.duration_ceiling = ceilingGate(policy.duration_ceiling, resourceMetrics.duration_ms, {
    totalKey: "maximum_candidate_total_ms",
    exceededCode: "QUALITY_DURATION_CEILING_EXCEEDED",
    unavailableCode: "QUALITY_DURATION_EVIDENCE_UNAVAILABLE",
  });
  hardGates.token_ceiling = ceilingGate(policy.token_ceiling, resourceMetrics.tokens, {
    totalKey: "maximum_candidate_total",
    exceededCode: "QUALITY_TOKEN_CEILING_EXCEEDED",
    unavailableCode: "QUALITY_TOKEN_EVIDENCE_UNAVAILABLE",
  });

  const statuses = QUALITY_ACCEPTANCE_HARD_GATES.map((name) => hardGates[name].status);
  const decision = statuses.includes("inconclusive")
    ? "inconclusive"
    : statuses.includes("failed")
      ? "rejected"
      : "accepted";
  const reasons = decision === "accepted"
    ? ["QUALITY_ACCEPTANCE_ALL_GATES_PASSED"]
    : reasonSet(hardGates, ["failed", "inconclusive"]);
  const decisionId = idFactory("quality-decision");
  assertSafeId(decisionId, "decision_id");
  const experimentIdentity = canonicalExperimentBindings[0];
  const input = {
    schema_version: DECISION_SCHEMA_VERSION,
    decision_id: decisionId,
    policy_version: policy.policy_version,
    policy_fingerprint: qualityAcceptancePolicyFingerprint(policy),
    scenario_corpus_fingerprint: canonicalAcceptanceCorpusFingerprint(canonicalScenarios),
    pair_universe_fingerprint: qualityAcceptancePairUniverseFingerprint(canonicalExperimentBindings),
    dossier_schema_versions: [...new Set(
      [...results.values()]
        .map((entry) => entry.result.quality_attestation?.dossier_schema_version ?? null)
        .filter((entry) => entry !== null),
    )].sort((a, b) => a - b),
    input_report_fingerprints: trustedReports.map((entry) => entry.fingerprint).sort(),
    identities: {
      baseline_acceptance_profile_id: baselineId,
      candidate_acceptance_profile_id: candidateId,
      experiment_id: experimentIdentity.experiment_id,
      experiment_fingerprint: experimentIdentity.experiment_fingerprint,
      repository_fingerprint: repositoryFingerprint,
    },
    paired_bindings: paired.map((entry) => ({
      experiment_id: entry.binding.experiment_id,
      experiment_fingerprint: entry.binding.experiment_fingerprint,
      comparison_id: entry.binding.comparison_id,
      scenario_id: entry.scenario.scenario_id,
      repetition: entry.binding.repetition,
      variant_id: entry.binding.variant_id,
      harness_role: entry.binding.harness_role,
      failure_family: entry.scenario.failure_family,
      suite: entry.scenario.suite,
      baseline_operational_run_id: entry.baseline.result.operational_run_id,
      candidate_operational_run_id: entry.candidate.result.operational_run_id,
      baseline_report_fingerprint: entry.baseline.reportFingerprint,
      candidate_report_fingerprint: entry.candidate.reportFingerprint,
      baseline_identity: identityFromResult(entry.baseline.result, entry.binding.baseline),
      candidate_identity: identityFromResult(entry.candidate.result, entry.binding.candidate),
    })),
    hard_gates: hardGates,
    per_target_metrics: perTargetMetrics,
    per_protected_family_metrics: perProtectedFamilyMetrics,
    quality_metrics: qualityMetrics,
    resource_metrics: resourceMetrics,
    decision,
    reason_codes: reasons,
    missing_evidence: reasonSet(hardGates, ["inconclusive"]),
    created_at: clockValue(clock),
  };
  return sealQualityAcceptanceDecision(input);
}
