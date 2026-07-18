import {
  QUALITY_ACCEPTANCE_HARD_GATES,
  QUALITY_VIOLATION_KEYS,
  createQualityOutcomes,
  sealQualityAcceptanceDecision,
  validateQualityAcceptancePolicy,
} from "./acceptance-contracts.mjs";
import { ContractError } from "./validation.mjs";

function nowIso(clock) {
  const value = typeof clock === "function" ? clock() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ContractError("QUALITY_ACCEPTANCE_CLOCK", "clock returned an invalid timestamp");
  }
  return date.toISOString();
}

function gate(gateId, status, reasonCodes = []) {
  return {
    gate_id: gateId,
    status,
    reason_codes: [...new Set(reasonCodes)].sort(),
  };
}

function emptyViolations() {
  return Object.fromEntries(QUALITY_VIOLATION_KEYS.map((key) => [key, 0]));
}

function sumViolations(outcomes) {
  const totals = emptyViolations();
  for (const outcome of outcomes) {
    for (const key of QUALITY_VIOLATION_KEYS) totals[key] += outcome.violations[key];
  }
  return totals;
}

function collectOutcomes({ bundles, outcomes, reports }) {
  if (outcomes !== undefined || reports !== undefined) {
    throw new ContractError(
      "QUALITY_ACCEPTANCE_TRUSTED_BUNDLE_REQUIRED",
      "raw outcomes and reports are informational; acceptance requires validated run bundles and bound check catalogs",
    );
  }
  if (!Array.isArray(bundles) || bundles.length === 0) {
    throw new ContractError("QUALITY_ACCEPTANCE_INPUT", "bundles must be a non-empty array");
  }
  return bundles.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ContractError("QUALITY_ACCEPTANCE_INPUT", `bundles[${index}] must be an object`);
    }
    const keys = Object.keys(entry).sort();
    if (JSON.stringify(keys) !== JSON.stringify(["check_catalog", "model_metadata", "run_bundle"]) &&
      JSON.stringify(keys) !== JSON.stringify(["check_catalog", "run_bundle"])) {
      throw new ContractError("QUALITY_ACCEPTANCE_INPUT", `bundles[${index}] has an invalid field set`);
    }
    const outcome = createQualityOutcomes(entry);
    return Object.freeze({
      outcome,
      risk_class: entry.run_bundle.dossier.risk_class,
    });
  });
}

function assertPolicyScenarioRisks(policy, trustedOutcomes) {
  const required = new Set(policy.required_scenarios);
  for (const entry of trustedOutcomes) {
    if (!required.has(entry.outcome.scenario_id)) continue;
    const expectedRisk = policy.required_scenario_risks[entry.outcome.scenario_id];
    if (entry.risk_class !== expectedRisk) {
      throw new ContractError(
        "QUALITY_ACCEPTANCE_SCENARIO_RISK",
        `validated ${entry.outcome.profile_role} risk for ${entry.outcome.scenario_id} does not match policy`,
      );
    }
  }
}

function assertRoleIdentitySeparation(outcomes) {
  for (const field of ["run_id", "quality_bundle_manifest_fingerprint"]) {
    const roleByIdentity = new Map();
    for (const outcome of outcomes) {
      const identity = outcome[field];
      const existingRole = roleByIdentity.get(identity);
      if (existingRole !== undefined && existingRole !== outcome.profile_role) {
        throw new ContractError(
          "QUALITY_ACCEPTANCE_ROLE_IDENTITY_REUSE",
          `${field} cannot provide both baseline and candidate evidence`,
        );
      }
      roleByIdentity.set(identity, outcome.profile_role);
    }
  }
}

function indexRequiredPairs(policy, outcomes) {
  const required = new Set(policy.required_scenarios);
  const byKey = new Map();
  for (const outcome of outcomes) {
    if (!required.has(outcome.scenario_id)) continue;
    const key = `${outcome.scenario_id}#${outcome.profile_role}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(outcome);
  }
  const pairs = [];
  const reasons = [];
  for (const scenarioId of policy.required_scenarios) {
    const baseline = byKey.get(`${scenarioId}#baseline`) ?? [];
    const candidate = byKey.get(`${scenarioId}#candidate`) ?? [];
    if (baseline.length !== 1 || candidate.length !== 1) {
      reasons.push(baseline.length === 0 || candidate.length === 0
        ? "QUALITY_REQUIRED_SCENARIO_MISSING"
        : "QUALITY_REQUIRED_SCENARIO_DUPLICATE");
      continue;
    }
    pairs.push({ scenario_id: scenarioId, baseline: baseline[0], candidate: candidate[0] });
  }
  return { pairs, reasons };
}

export function assessQualityCandidate({
  policy,
  bundles,
  outcomes,
  reports,
  decision_id = "quality-decision",
  clock = () => new Date(),
}) {
  validateQualityAcceptancePolicy(policy);
  const trustedOutcomes = collectOutcomes({ bundles, outcomes, reports });
  assertPolicyScenarioRisks(policy, trustedOutcomes);
  const allOutcomes = trustedOutcomes.map((entry) => entry.outcome);
  assertRoleIdentitySeparation(allOutcomes);
  const { pairs, reasons: pairReasons } = indexRequiredPairs(policy, allOutcomes);
  const baseline = pairs.map((entry) => entry.baseline);
  const candidate = pairs.map((entry) => entry.candidate);
  const baselineViolations = sumViolations(baseline);
  const candidateViolations = sumViolations(candidate);

  const gates = [];
  gates.push(gate(
    "required_scenarios",
    pairReasons.length === 0 ? "passed" : "inconclusive",
    pairReasons,
  ));

  const incompleteBaseline = baseline.filter((entry) => !entry.complete);
  const incompleteCandidate = candidate.filter((entry) => !entry.complete);
  const missingBaselineContext = policy.schema_version === 3
    ? baseline.filter((entry) => entry.schema_version !== 3)
    : [];
  const missingCandidateContext = policy.schema_version === 3
    ? candidate.filter((entry) => entry.schema_version !== 3)
    : [];
  const targetUniverseMismatches = pairs.filter((entry) => (
    JSON.stringify(entry.baseline.required_check_ids) !== JSON.stringify(entry.candidate.required_check_ids)
    || JSON.stringify(entry.baseline.required_mechanism_ids) !== JSON.stringify(entry.candidate.required_mechanism_ids)
  ));
  const coverageReasons = [];
  if (incompleteBaseline.length > 0) coverageReasons.push("QUALITY_BASELINE_INTEGRATED_VERIFICATION_INCOMPLETE");
  if (incompleteCandidate.length > 0) coverageReasons.push("QUALITY_CANDIDATE_INTEGRATED_VERIFICATION_INCOMPLETE");
  if (missingBaselineContext.length > 0) coverageReasons.push("QUALITY_BASELINE_CONTEXT_EVIDENCE_MISSING");
  if (missingCandidateContext.length > 0) coverageReasons.push("QUALITY_CANDIDATE_CONTEXT_EVIDENCE_MISSING");
  if (targetUniverseMismatches.length > 0) coverageReasons.push("QUALITY_TARGET_UNIVERSE_MISMATCH");
  gates.push(gate(
    "verification_coverage",
    coverageReasons.length === 0 ? "passed" : "failed",
    coverageReasons,
  ));

  const thresholdReasons = [];
  for (const key of QUALITY_VIOLATION_KEYS) {
    if (candidateViolations[key] > policy.quality_requirements[`maximum_${key}`]) {
      thresholdReasons.push(`QUALITY_THRESHOLD_${key.toUpperCase()}`);
    }
  }
  gates.push(gate(
    "quality_thresholds",
    thresholdReasons.length === 0 ? "passed" : "failed",
    thresholdReasons,
  ));

  const regressionReasons = [];
  if (policy.quality_requirements.reject_metric_regressions) {
    for (const key of QUALITY_VIOLATION_KEYS) {
      if (candidateViolations[key] > baselineViolations[key]) {
        regressionReasons.push(`QUALITY_REGRESSION_${key.toUpperCase()}`);
      }
    }
  }
  gates.push(gate(
    "quality_regressions",
    regressionReasons.length === 0 ? "passed" : "failed",
    regressionReasons,
  ));

  if (JSON.stringify(gates.map((entry) => entry.gate_id)) !== JSON.stringify(QUALITY_ACCEPTANCE_HARD_GATES)) {
    throw new ContractError("QUALITY_ACCEPTANCE_ENGINE", "engine gate order diverged from the contract");
  }
  const decision = gates.some((entry) => entry.status === "inconclusive")
    ? "inconclusive"
    : gates.some((entry) => entry.status === "failed")
      ? "rejected"
      : "accepted";
  return sealQualityAcceptanceDecision({
    decision_id,
    created_at: nowIso(clock),
    policy_fingerprint: policy.fingerprint,
    decision,
    reason_codes: [...new Set(gates.flatMap((entry) => entry.reason_codes))].sort(),
    gates,
    summary: {
      required_scenario_count: policy.required_scenarios.length,
      paired_scenario_count: pairs.length,
      baseline_complete_count: baseline.filter((entry) => entry.complete).length,
      candidate_complete_count: candidate.filter((entry) => entry.complete).length,
      target_universe_mismatch_count: targetUniverseMismatches.length,
      baseline_violations: baselineViolations,
      candidate_violations: candidateViolations,
      maximum_violations: Object.fromEntries(
        QUALITY_VIOLATION_KEYS.map((key) => [key, policy.quality_requirements[`maximum_${key}`]]),
      ),
      reject_metric_regressions: policy.quality_requirements.reject_metric_regressions,
    },
  });
}
