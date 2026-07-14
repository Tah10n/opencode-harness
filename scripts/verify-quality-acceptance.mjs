import assert from "node:assert/strict";

import {
  QUALITY_ACCEPTANCE_PRODUCERS,
  QUALITY_VIOLATION_KEYS,
  createQualityAcceptancePolicy,
  createQualityLiveReport,
  createQualityOutcomes,
  sealQualityAcceptanceDecision,
  validateQualityAcceptanceDecision,
  validateQualityLiveReport,
} from "../lib/quality/acceptance-contracts.mjs";
import { assessQualityCandidate } from "../lib/quality/acceptance-engine.mjs";
import { createEngineeringCheckCatalog } from "../lib/quality/gate.mjs";
import { fingerprint } from "../lib/quality/validation.mjs";
import { createDeterministicQualityRun } from "./verify-quality-live-runner.mjs";

const AT = "2026-07-14T10:00:00.000Z";

function policyInput(
  requiredScenarios = ["quality-small-local-control"],
  requiredScenarioRisks = Object.fromEntries(requiredScenarios.map((scenarioId) => [scenarioId, "standard-lite"])),
) {
  return {
    policy_version: "2.1.0",
    required_scenarios: requiredScenarios,
    required_scenario_risks: requiredScenarioRisks,
    quality_requirements: {
      require_complete_verification: true,
      reject_metric_regressions: true,
      ...Object.fromEntries(QUALITY_VIOLATION_KEYS.map((key) => [`maximum_${key}`, 0])),
    },
  };
}

function bundleEntry(run, model = null) {
  return {
    run_bundle: run.bundle,
    check_catalog: run.checkCatalog,
    ...(model === null ? {} : {
      model_metadata: {
        provider: "host",
        model,
        reasoning_effort: null,
        text_verbosity: null,
      },
    }),
  };
}

function decisionInput(decision) {
  const copy = structuredClone(decision);
  delete copy.schema_version;
  delete copy.fingerprint;
  return copy;
}

const runs = [];
try {
  const baseline = await createDeterministicQualityRun({ profileRole: "baseline" });
  const candidate = await createDeterministicQualityRun({ profileRole: "candidate" });
  const narrowedBaseline = await createDeterministicQualityRun({ profileRole: "baseline", narrowed: true });
  const narrowedCandidate = await createDeterministicQualityRun({ profileRole: "candidate", narrowed: true });
  const reusedIdentityBaseline = await createDeterministicQualityRun({
    profileRole: "baseline",
    runIdentity: "shared-quality-run",
  });
  const reusedIdentityCandidate = await createDeterministicQualityRun({
    profileRole: "candidate",
    runIdentity: "shared-quality-run",
  });
  runs.push(
    baseline,
    candidate,
    narrowedBaseline,
    narrowedCandidate,
    reusedIdentityBaseline,
    reusedIdentityCandidate,
  );
  const policy = createQualityAcceptancePolicy(policyInput());

  const baselineOutcome = createQualityOutcomes(bundleEntry(baseline, "host/baseline"));
  const candidateOutcome = createQualityOutcomes(bundleEntry(candidate, "host/candidate"));
  assert.equal(baselineOutcome.complete, true);
  assert.equal(candidateOutcome.complete, true);
  assert.equal(candidateOutcome.check_catalog_fingerprint, candidate.checkCatalog.fingerprint);
  assert.equal(candidateOutcome.quality_bundle_manifest_fingerprint, candidate.bundle.manifest.fingerprint);
  assert(candidateOutcome.required_check_ids.includes("quality-small-local-control-baseline"));
  assert(candidateOutcome.required_check_ids.includes("quality-small-local-control-integration"));
  assert(candidateOutcome.required_mechanism_ids.includes("quality-small-local-control-hidden-evaluation"));

  const accepted = assessQualityCandidate({
    policy,
    bundles: [bundleEntry(baseline, "host/baseline"), bundleEntry(candidate, "host/candidate")],
    decision_id: "decision-accepted",
    clock: () => new Date(AT),
  });
  assert.equal(accepted.decision, "accepted");
  assert.equal(accepted.summary.baseline_complete_count, 1);
  assert.equal(accepted.summary.candidate_complete_count, 1);
  assert.equal(accepted.summary.target_universe_mismatch_count, 0);
  assert(!accepted.gates.some((entry) => entry.gate_id.includes("model")), "model identity became an acceptance gate");
  validateQualityAcceptanceDecision(accepted);

  const alternateModel = assessQualityCandidate({
    policy,
    bundles: [bundleEntry(baseline, "host/baseline"), bundleEntry(candidate, "other-provider/other-model")],
    decision_id: "decision-alternate-model",
    clock: () => new Date(AT),
  });
  assert.equal(alternateModel.decision, "accepted", "informational model metadata changed acceptance");

  for (const expectedRisk of ["high", "critical"]) {
    const stricterRiskPolicy = createQualityAcceptancePolicy(policyInput(
      ["quality-small-local-control"],
      { "quality-small-local-control": expectedRisk },
    ));
    for (const [role, run] of [["baseline", baseline], ["candidate", candidate]]) {
      assert.throws(
        () => assessQualityCandidate({
          policy: stricterRiskPolicy,
          bundles: [bundleEntry(run)],
          decision_id: `decision-risk-${expectedRisk}-${role}`,
          clock: () => new Date(AT),
        }),
        /QUALITY_ACCEPTANCE_SCENARIO_RISK/u,
        `${role} risk mismatch reached missing-pair decision logic instead of failing closed`,
      );
    }
    assert.throws(
      () => assessQualityCandidate({
        policy: stricterRiskPolicy,
        bundles: [bundleEntry(baseline), bundleEntry(candidate)],
        decision_id: `decision-risk-${expectedRisk}`,
        clock: () => new Date(AT),
      }),
      /QUALITY_ACCEPTANCE_SCENARIO_RISK/u,
      `internally consistent lower-risk bundles satisfied a policy requiring ${expectedRisk}`,
    );
  }

  assert.throws(
    () => assessQualityCandidate({
      policy,
      bundles: [bundleEntry(reusedIdentityBaseline), bundleEntry(reusedIdentityCandidate)],
      decision_id: "decision-reused-run-identity",
      clock: () => new Date(AT),
    }),
    /QUALITY_ACCEPTANCE_ROLE_IDENTITY_REUSE/u,
    "one runner identity filled both baseline and candidate roles",
  );

  const report = createQualityLiveReport({
    evaluation_run_id: "quality-acceptance-report",
    created_at: AT,
    provenance: {
      producer_id: QUALITY_ACCEPTANCE_PRODUCERS.liveReport,
      source: "deterministic validated run bundles",
    },
    results: [baselineOutcome, candidateOutcome],
  });
  validateQualityLiveReport(report);
  assert.throws(
    () => assessQualityCandidate({ policy, reports: [report] }),
    /QUALITY_ACCEPTANCE_TRUSTED_BUNDLE_REQUIRED/u,
    "self-described live report was accepted without validated bundles",
  );
  assert.throws(
    () => assessQualityCandidate({ policy, outcomes: [baselineOutcome, candidateOutcome] }),
    /QUALITY_ACCEPTANCE_TRUSTED_BUNDLE_REQUIRED/u,
    "self-described outcomes were accepted without validated bundles",
  );

  const missingBaseline = assessQualityCandidate({
    policy,
    bundles: [bundleEntry(candidate)],
    decision_id: "decision-missing-baseline",
    clock: () => new Date(AT),
  });
  assert.equal(missingBaseline.decision, "inconclusive");
  assert(missingBaseline.reason_codes.includes("QUALITY_REQUIRED_SCENARIO_MISSING"));
  assert.notEqual(missingBaseline.decision, "accepted", "zero paired scenarios were accepted");

  const duplicateBaseline = assessQualityCandidate({
    policy,
    bundles: [bundleEntry(baseline), bundleEntry(baseline), bundleEntry(candidate)],
    decision_id: "decision-duplicate-baseline",
    clock: () => new Date(AT),
  });
  assert.equal(duplicateBaseline.decision, "inconclusive");
  assert(duplicateBaseline.reason_codes.includes("QUALITY_REQUIRED_SCENARIO_DUPLICATE"));

  for (const narrowedRun of [narrowedBaseline, narrowedCandidate]) {
    assert.equal(narrowedRun.expectedFailure, "QUALITY_ACCEPTANCE_TARGET_UNIVERSE");
    assert.throws(
      () => createQualityOutcomes(bundleEntry(narrowedRun)),
      /QUALITY_ACCEPTANCE_TARGET_UNIVERSE/u,
      "a single genuine bundle with a narrowed dossier target universe was trusted",
    );
  }
  assert.throws(
    () => assessQualityCandidate({
      policy,
      bundles: [bundleEntry(baseline), bundleEntry(narrowedCandidate)],
      decision_id: "decision-one-sided-narrowed-targets",
      clock: () => new Date(AT),
    }),
    /QUALITY_ACCEPTANCE_TARGET_UNIVERSE/u,
    "one-sided target narrowing reached acceptance",
  );
  assert.throws(
    () => assessQualityCandidate({
      policy,
      bundles: [bundleEntry(narrowedBaseline), bundleEntry(narrowedCandidate)],
      decision_id: "decision-both-sides-narrowed-targets",
      clock: () => new Date(AT),
    }),
    /QUALITY_ACCEPTANCE_TARGET_UNIVERSE/u,
    "matching baseline and candidate target narrowing produced a false-green decision",
  );

  for (const [label, run] of [["baseline", baseline], ["candidate", candidate]]) {
    const unvalidatedClone = structuredClone(run.bundle);
    assert.throws(
      () => assessQualityCandidate({
        policy,
        bundles: [{ run_bundle: unvalidatedClone, check_catalog: run.checkCatalog }],
      }),
      /QUALITY_BUNDLE_VALIDATION_REQUIRED/u,
      `${label} unvalidated or incomplete bundle did not fail closed`,
    );
  }

  const forgedCatalog = createEngineeringCheckCatalog({
    catalog_id: candidate.checkCatalog.catalog_id,
    checks: candidate.checkCatalog.checks.map((entry, index) => ({
      ...entry,
      trusted_producer: index === 0 ? "untrusted/self-described-runner" : entry.trusted_producer,
    })),
    mechanisms: candidate.checkCatalog.mechanisms,
  });
  assert.throws(
    () => createQualityOutcomes({ run_bundle: candidate.bundle, check_catalog: forgedCatalog }),
    /QUALITY_ACCEPTANCE_CATALOG_TRUST/u,
    "receipt producer was trusted from the receipt string instead of the bound catalog",
  );

  assert.throws(
    () => createQualityAcceptancePolicy(policyInput([])),
    /QUALITY_ACCEPTANCE_POLICY_SCENARIOS/u,
    "empty acceptance policy was accepted",
  );
  assert.throws(
    () => createQualityAcceptancePolicy(policyInput(["quality-small-local-control"], {})),
    /QUALITY_ACCEPTANCE_POLICY_RISKS/u,
    "policy risk map omitted a required scenario",
  );
  assert.throws(
    () => createQualityAcceptancePolicy(policyInput(
      ["quality-small-local-control"],
      {
        "quality-small-local-control": "standard-lite",
        "quality-unexpected": "high",
      },
    )),
    /QUALITY_ACCEPTANCE_POLICY_RISKS/u,
    "policy risk map included an extra scenario",
  );
  assert.throws(
    () => createQualityAcceptancePolicy(policyInput(
      ["quality-small-local-control"],
      { "quality-small-local-control": "standard" },
    )),
    /CONTRACT_ENUM/u,
    "policy risk map accepted a non-dossier risk class",
  );
  assert.throws(
    () => createQualityAcceptancePolicy(policyInput(
      ["quality-alpha", "quality-zeta"],
      {
        "quality-zeta": "high",
        "quality-alpha": "critical",
      },
    )),
    /QUALITY_ACCEPTANCE_POLICY_RISKS/u,
    "policy risk map key order diverged from sorted required scenarios",
  );
  assert.throws(
    () => createQualityAcceptancePolicy({
      ...policyInput(),
      quality_requirements: { ...policyInput().quality_requirements, require_complete_verification: false },
    }),
    /QUALITY_ACCEPTANCE_POLICY_COMPLETENESS/u,
    "policy was allowed to waive complete verification",
  );

  const contradictoryGate = decisionInput(accepted);
  contradictoryGate.gates[1] = {
    ...contradictoryGate.gates[1],
    status: "failed",
    reason_codes: ["QUALITY_CANDIDATE_INTEGRATED_VERIFICATION_INCOMPLETE"],
  };
  assert.throws(
    () => sealQualityAcceptanceDecision(contradictoryGate),
    /QUALITY_ACCEPTANCE_DECISION_SEMANTICS/u,
    "accepted decision with failed gate was sealed",
  );

  const forgedReasons = decisionInput(accepted);
  forgedReasons.reason_codes = ["QUALITY_FORGED_REASON"];
  assert.throws(
    () => sealQualityAcceptanceDecision(forgedReasons),
    /QUALITY_ACCEPTANCE_DECISION_REASONS/u,
    "top-level reasons diverged from gate reasons",
  );

  const forgedSummary = decisionInput(accepted);
  forgedSummary.summary.candidate_complete_count = 0;
  assert.throws(
    () => sealQualityAcceptanceDecision(forgedSummary),
    /QUALITY_ACCEPTANCE_DECISION_SEMANTICS/u,
    "decision summary contradicted verification coverage",
  );

  const forgedOutcome = structuredClone(candidateOutcome);
  forgedOutcome.passed_check_ids = [];
  forgedOutcome.missing_check_ids = [...forgedOutcome.required_check_ids];
  forgedOutcome.complete = false;
  forgedOutcome.fingerprint = fingerprint(Object.fromEntries(
    Object.entries(forgedOutcome).filter(([key]) => key !== "fingerprint"),
  ));
  assert.throws(
    () => assessQualityCandidate({ policy, outcomes: [baselineOutcome, forgedOutcome] }),
    /QUALITY_ACCEPTANCE_TRUSTED_BUNDLE_REQUIRED/u,
    "re-fingerprinted forged outcome reached acceptance",
  );

  console.log("Trusted-bundle quality acceptance checks passed (coverage, target universe, producer catalog, semantic decision sealing).");
} finally {
  for (const run of runs) run.cleanup();
}
