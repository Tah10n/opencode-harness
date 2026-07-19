import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  QUALITY_ACCEPTANCE_PRODUCERS,
  QUALITY_VIOLATION_KEYS,
  createQualityAcceptancePolicy,
  createQualityAcceptancePolicyV3,
  createQualityLiveReport,
  createQualityOutcomes,
  qualityAcceptancePolicyOutcomeSchema,
  sealQualityAcceptanceDecision,
  validateQualityAcceptanceDecision,
  validateQualityLiveReport,
} from "../lib/quality/acceptance-contracts.mjs";
import { assessQualityCandidate } from "../lib/quality/acceptance-engine.mjs";
import { createEngineeringCheckCatalog } from "../lib/quality/gate.mjs";
import { validateEngineeringQualityRunBundle } from "../lib/quality/run-bundle.mjs";
import { fingerprint } from "../lib/quality/validation.mjs";
import {
  assessQualityBundles,
  parseQualityBundleAssessmentArgs,
} from "./assess-quality-bundles.mjs";
import {
  convertRunBundleToLegacyV2,
  createDeterministicHighQualityRun,
  createDeterministicQualityRun,
} from "./verify-quality-live-runner.mjs";

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

function contextPolicyInput(
  scenarioId = "quality-small-local-control",
  riskClass = "standard-lite",
) {
  const policy = JSON.parse(fs.readFileSync("quality/acceptance/acceptance-policy.v3.json", "utf8"));
  delete policy.schema_version;
  delete policy.fingerprint;
  return {
    ...policy,
    policy_version: "3.1.0-test",
    required_scenarios: [scenarioId],
    required_scenario_risks: { [scenarioId]: riskClass },
  };
}

function legacyContextPolicyInput(
  scenarioId = "quality-small-local-control",
  riskClass = "standard-lite",
) {
  const current = contextPolicyInput(scenarioId, riskClass);
  const contextRequirements = structuredClone(current.context_requirements);
  contextRequirements.required_metric_keys = [
    ...contextRequirements.required_metric_keys.filter((key) => ![
      "contradicted_transitive_exclusion_count",
      "evidence_backed_transitive_exclusion_count",
      "transitive_impact_resolution",
    ].includes(key)),
    "required_transitive_path_count",
  ].sort();
  contextRequirements.required_hard_gates = contextRequirements.required_hard_gates
    .map((key) => key === "transitive_impact_resolved" ? "transitive_paths_represented" : key)
    .sort();
  contextRequirements.minimum_represented_transitive_path_count = 1;
  return {
    ...current,
    policy_version: "3.0.0-test",
    context_requirements: contextRequirements,
  };
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
  const highBaseline = await createDeterministicHighQualityRun({ profileRole: "baseline" });
  const highCandidate = await createDeterministicHighQualityRun({ profileRole: "candidate" });
  const criticalBaseline = await createDeterministicHighQualityRun({ profileRole: "baseline", riskClass: "critical" });
  const criticalCandidate = await createDeterministicHighQualityRun({ profileRole: "candidate", riskClass: "critical" });
  const legacyBaseline = await createDeterministicQualityRun({ profileRole: "baseline", runIdentity: "legacy-v2-baseline" });
  const legacyCandidate = await createDeterministicQualityRun({ profileRole: "candidate", runIdentity: "legacy-v2-candidate" });
  convertRunBundleToLegacyV2(legacyBaseline.runDir);
  convertRunBundleToLegacyV2(legacyCandidate.runDir);
  runs.push(
    baseline,
    candidate,
    narrowedBaseline,
    narrowedCandidate,
    reusedIdentityBaseline,
    reusedIdentityCandidate,
    highBaseline,
    highCandidate,
    criticalBaseline,
    criticalCandidate,
    legacyBaseline,
    legacyCandidate,
  );
  const policy = createQualityAcceptancePolicy(policyInput());
  const contextPolicy = createQualityAcceptancePolicyV3(contextPolicyInput());
  const legacyContextPolicy = createQualityAcceptancePolicyV3(legacyContextPolicyInput());
  const highContextPolicy = createQualityAcceptancePolicyV3(contextPolicyInput(
    "quality-public-api-compatibility",
    "high",
  ));
  const criticalContextPolicy = createQualityAcceptancePolicyV3(contextPolicyInput(
    "quality-public-api-compatibility",
    "critical",
  ));

  const baselineOutcome = createQualityOutcomes(bundleEntry(baseline, "host/baseline"));
  const candidateOutcome = createQualityOutcomes(bundleEntry(candidate, "host/candidate"));
  assert.equal(baselineOutcome.complete, true);
  assert.equal(candidateOutcome.complete, true);
  assert.equal(baselineOutcome.schema_version, 4);
  assert.equal(candidateOutcome.schema_version, 4);
  assert.equal(candidateOutcome.producer_id, QUALITY_ACCEPTANCE_PRODUCERS.contextQualityOutcomes);
  assert.equal(candidateOutcome.context_metrics.transitive_impact_resolution, "not_applicable");
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

  const contextAccepted = assessQualityCandidate({
    policy: contextPolicy,
    bundles: [bundleEntry(baseline, "host/baseline"), bundleEntry(candidate, "host/candidate")],
    decision_id: "decision-context-accepted",
    clock: () => new Date(AT),
  });
  assert.equal(contextAccepted.decision, "accepted", "v3.1 context policy rejected complete trusted context bundles");
  assert.equal(qualityAcceptancePolicyOutcomeSchema(contextPolicy), 4);
  assert.equal(qualityAcceptancePolicyOutcomeSchema(legacyContextPolicy), 3);
  assert.throws(
    () => assessQualityCandidate({
      policy: legacyContextPolicy,
      bundles: [bundleEntry(baseline), bundleEntry(candidate)],
      decision_id: "decision-legacy-context-boundary",
      clock: () => new Date(AT),
    }),
    /QUALITY_ACCEPTANCE_CONTEXT_SCHEMA/u,
    "a 3.0 policy silently consumed current v4 outcomes",
  );

  const highBaselineOutcome = createQualityOutcomes(bundleEntry(highBaseline, "host/high-baseline"));
  const highCandidateOutcome = createQualityOutcomes(bundleEntry(highCandidate, "host/high-candidate"));
  for (const outcome of [highBaselineOutcome, highCandidateOutcome]) {
    assert.equal(outcome.complete, true);
    assert.equal(outcome.context_metrics.risk_class, "high");
    assert.equal(outcome.schema_version, 4);
    assert.equal(outcome.context_metrics.transitive_impact_resolution, "represented");
    assert(outcome.context_metrics.represented_transitive_path_count > 0);
    assert.equal(outcome.context_metrics.required_wide_category_coverage_basis_points, 10000);
    assert.equal(outcome.context_metrics.critical_path_deep_analysis_coverage_basis_points, 10000);
    assert(Object.values(outcome.context_hard_gates).every(Boolean), JSON.stringify(outcome.context_hard_gates));
  }
  const highContextAccepted = assessQualityCandidate({
    policy: highContextPolicy,
    bundles: [
      bundleEntry(highBaseline, "host/high-baseline"),
      bundleEntry(highCandidate, "host/high-candidate"),
    ],
    decision_id: "decision-high-context-accepted",
    clock: () => new Date(AT),
  });
  assert.equal(
    highContextAccepted.decision,
    "accepted",
    "validated high-risk runner bundles did not pass the v3.1 acceptance engine",
  );
  assert.equal(highContextAccepted.summary.baseline_complete_count, 1);
  assert.equal(highContextAccepted.summary.candidate_complete_count, 1);

  const criticalContextAccepted = assessQualityCandidate({
    policy: criticalContextPolicy,
    bundles: [
      bundleEntry(criticalBaseline, "host/critical-baseline"),
      bundleEntry(criticalCandidate, "host/critical-candidate"),
    ],
    decision_id: "decision-critical-context-accepted",
    clock: () => new Date(AT),
  });
  assert.equal(
    criticalContextAccepted.decision,
    "accepted",
    "validated critical runner bundles did not pass the v3.1 acceptance engine",
  );

  const qualityCliRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-quality-bundle-assessment-"));
  try {
    const policyPath = path.join(qualityCliRoot, "policy.json");
    const legacyPolicyPath = path.join(qualityCliRoot, "legacy-policy.json");
    const baselineCatalogPath = path.join(qualityCliRoot, "baseline-catalog.json");
    const candidateCatalogPath = path.join(qualityCliRoot, "candidate-catalog.json");
    const legacyBaselineCatalogPath = path.join(qualityCliRoot, "legacy-baseline-catalog.json");
    const legacyCandidateCatalogPath = path.join(qualityCliRoot, "legacy-candidate-catalog.json");
    fs.writeFileSync(policyPath, `${JSON.stringify(highContextPolicy, null, 2)}\n`, "utf8");
    fs.writeFileSync(legacyPolicyPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");
    fs.writeFileSync(baselineCatalogPath, `${JSON.stringify(highBaseline.checkCatalog, null, 2)}\n`, "utf8");
    fs.writeFileSync(candidateCatalogPath, `${JSON.stringify(highCandidate.checkCatalog, null, 2)}\n`, "utf8");
    fs.writeFileSync(legacyBaselineCatalogPath, `${JSON.stringify(legacyBaseline.checkCatalog, null, 2)}\n`, "utf8");
    fs.writeFileSync(legacyCandidateCatalogPath, `${JSON.stringify(legacyCandidate.checkCatalog, null, 2)}\n`, "utf8");
    const cliDecision = assessQualityBundles({
      policyPath,
      bundlePairs: [
        { runDirectory: highBaseline.runDir, catalogPath: baselineCatalogPath },
        { runDirectory: highCandidate.runDir, catalogPath: candidateCatalogPath },
      ],
      decisionId: "decision-high-context-cli",
      clock: () => new Date(AT),
    });
    assert.equal(cliDecision.decision, "accepted", "supported quality bundle assessment entrypoint rejected valid high bundles");
    const aliasedRunParent = path.join(qualityCliRoot, "aliased-run-parent");
    fs.symlinkSync(
      path.dirname(highBaseline.runDir),
      aliasedRunParent,
      process.platform === "win32" ? "junction" : "dir",
    );
    const aliasedRunDirectory = path.join(aliasedRunParent, path.basename(highBaseline.runDir));
    assert.throws(
      () => assessQualityBundles({
        policyPath,
        bundlePairs: [{ runDirectory: aliasedRunDirectory, catalogPath: baselineCatalogPath }],
        decisionId: "decision-aliased-bundle-cli",
        clock: () => new Date(AT),
      }),
      (error) => error?.code === "QUALITY_ASSESSMENT_PATH",
      "quality bundle CLI accepted an ordinary final directory reached through a linked parent",
    );
    assert.throws(
      () => validateEngineeringQualityRunBundle(aliasedRunDirectory),
      (error) => error?.code === "QUALITY_BUNDLE_TYPE",
      "quality bundle validator accepted an ordinary run directory reached through a linked parent",
    );
    fs.unlinkSync(aliasedRunParent);
    const cliScript = path.resolve("scripts/assess-quality-bundles.mjs");
    const runCli = (args) => spawnSync(process.execPath, [cliScript, ...args], { encoding: "utf8" });
    const highCliArgs = [
      "--policy", policyPath,
      "--bundle", highBaseline.runDir,
      "--catalog", baselineCatalogPath,
      "--bundle", highCandidate.runDir,
      "--catalog", candidateCatalogPath,
      "--decision-id", "decision-high-context-cli-process",
    ];
    const validProcess = runCli(highCliArgs);
    assert.equal(validProcess.status, 0, validProcess.stderr);
    assert.equal(JSON.parse(validProcess.stdout).decision, "accepted");

    const rejectedProcess = runCli([
      "--policy", policyPath,
      "--bundle", highBaseline.runDir,
      "--catalog", baselineCatalogPath,
      "--decision-id", "decision-high-context-cli-rejected",
    ]);
    assert.equal(rejectedProcess.status, 2, rejectedProcess.stderr);
    assert.notEqual(JSON.parse(rejectedProcess.stdout).decision, "accepted");

    for (const relativePath of [
      "quality/context-receipt-index.json",
      "quality/context-report.json",
      "quality/context-sufficiency-decision.json",
      "quality/context-reconciliation.json",
    ]) {
      const artifactPath = path.join(highCandidate.runDir, ...relativePath.split("/"));
      const original = fs.readFileSync(artifactPath, "utf8");
      try {
        fs.writeFileSync(artifactPath, `${original}\n`, "utf8");
        const tamperedProcess = runCli(highCliArgs);
        assert.equal(tamperedProcess.status, 1, `${relativePath}: ${tamperedProcess.stdout}\n${tamperedProcess.stderr}`);
      } finally {
        fs.writeFileSync(artifactPath, original, "utf8");
      }
    }

    const legacyProcess = runCli([
      "--policy", legacyPolicyPath,
      "--bundle", legacyBaseline.runDir,
      "--catalog", legacyBaselineCatalogPath,
      "--bundle", legacyCandidate.runDir,
      "--catalog", legacyCandidateCatalogPath,
      "--decision-id", "decision-legacy-v2-cli-process",
    ]);
    assert.equal(legacyProcess.status, 0, legacyProcess.stderr);
    assert.equal(JSON.parse(legacyProcess.stdout).decision, "accepted");
    assert.deepEqual(parseQualityBundleAssessmentArgs([
      "--policy", policyPath,
      "--bundle", highBaseline.runDir,
      "--catalog", baselineCatalogPath,
      "--bundle", highCandidate.runDir,
      "--catalog", candidateCatalogPath,
      "--decision-id", "decision-high-context-cli",
    ]), {
      policyPath,
      decisionId: "decision-high-context-cli",
      bundlePaths: [highBaseline.runDir, highCandidate.runDir],
      catalogPaths: [baselineCatalogPath, candidateCatalogPath],
    });
    assert.throws(
      () => parseQualityBundleAssessmentArgs(["--policy", policyPath, "--bundle", highBaseline.runDir]),
      /QUALITY_ASSESSMENT_CLI_PAIR/u,
    );
  } finally {
    fs.rmSync(qualityCliRoot, { recursive: true, force: true });
  }

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
