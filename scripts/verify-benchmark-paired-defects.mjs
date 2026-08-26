import assert from "node:assert/strict";

import { ProfileV3Error } from "../lib/profile-v3.mjs";
import {
  classifySeverityTransition,
  evaluatePairedDefects,
} from "../lib/benchmark/paired-defect-evaluator.mjs";

function finding({ id = "shared-defect", severity = "medium", contract = "output-contract" } = {}) {
  return {
    finding_id: id,
    family: "calibration-family",
    violated_contract: contract,
    evidence_source: {
      kind: "trusted-check",
      source_id: "hidden-contract-check",
      path: "test/hidden-contract.test.mjs",
      summary: "The trusted hidden contract check demonstrated the defect.",
    },
    severity,
  };
}

function arm(findings, overrides = {}) {
  return { functional_task_success: true, scope_violation: false, findings, ...overrides };
}

const severities = ["none", "low", "medium", "high", "critical"];
const rank = (severity) => severities.indexOf(severity);
const expectedRelation = (baselineSeverity, candidateSeverity) => {
  if (baselineSeverity === "none") return candidateSeverity === "none" ? null : "introduced-defect";
  if (candidateSeverity === "none") return "resolved-defect";
  if (rank(candidateSeverity) > rank(baselineSeverity)) return "severity-escalation";
  if (rank(candidateSeverity) < rank(baselineSeverity)) return "severity-reduction";
  return "unchanged-defect";
};

for (const baselineSeverity of severities) {
  for (const candidateSeverity of severities) {
    const baselineFindings = baselineSeverity === "none" ? [] : [finding({ severity: baselineSeverity })];
    const candidateFindings = candidateSeverity === "none"
      ? []
      : [finding({ id: "candidate-label-may-differ", severity: candidateSeverity })];
    const evaluation = evaluatePairedDefects({
      baseline: arm(baselineFindings),
      candidate: arm(candidateFindings),
    });
    const expected = expectedRelation(baselineSeverity, candidateSeverity);
    assert.equal(classifySeverityTransition(baselineSeverity, candidateSeverity), expected);
    assert.equal(evaluation.relations.length, expected === null ? 0 : 1);
    if (expected !== null) assert.equal(evaluation.relations[0].relation, expected);
    assert.equal(
      evaluation.new_critical_regression,
      Number(candidateSeverity === "critical" && baselineSeverity !== "critical"),
    );
    assert.equal(
      evaluation.new_high_medium_regression,
      Number(["medium", "high", "critical"].includes(candidateSeverity)
        && !["medium", "high", "critical"].includes(baselineSeverity)),
    );
    assert.equal(
      evaluation.resolved_critical_defect,
      Number(baselineSeverity === "critical" && candidateSeverity !== "critical"),
    );
    assert.equal(
      evaluation.resolved_high_medium_defect,
      Number(["medium", "high", "critical"].includes(baselineSeverity)
        && !["medium", "high", "critical"].includes(candidateSeverity)),
    );
    assert.equal(
      evaluation.unchanged_blocking_defect,
      Number(["medium", "high", "critical"].includes(baselineSeverity)
        && ["medium", "high", "critical"].includes(candidateSeverity)),
    );
    assert.equal(
      evaluation.blocking_severity_escalation,
      Number(expected === "severity-escalation"
        && ["medium", "high", "critical"].includes(candidateSeverity)),
    );
    assert.equal(
      evaluation.critical_severity_escalation,
      Number(expected === "severity-escalation" && candidateSeverity === "critical"),
    );
  }
}

for (const [baselineSeverity, candidateSeverity, relation, counters] of [
  ["critical", "high", "severity-reduction", { newCritical: 0, newHighMedium: 0, resolvedCritical: 1, blockingEscalation: 0, criticalEscalation: 0 }],
  ["critical", "none", "resolved-defect", { newCritical: 0, newHighMedium: 0, resolvedCritical: 1, blockingEscalation: 0, criticalEscalation: 0 }],
  ["medium", "high", "severity-escalation", { newCritical: 0, newHighMedium: 0, resolvedCritical: 0, blockingEscalation: 1, criticalEscalation: 0 }],
  ["high", "critical", "severity-escalation", { newCritical: 1, newHighMedium: 0, resolvedCritical: 0, blockingEscalation: 1, criticalEscalation: 1 }],
  ["low", "medium", "severity-escalation", { newCritical: 0, newHighMedium: 1, resolvedCritical: 0, blockingEscalation: 1, criticalEscalation: 0 }],
]) {
  const evaluation = evaluatePairedDefects({
    baseline: arm(baselineSeverity === "none" ? [] : [finding({ severity: baselineSeverity })]),
    candidate: arm(candidateSeverity === "none" ? [] : [finding({ severity: candidateSeverity })]),
  });
  assert.equal(evaluation.relations[0].relation, relation);
  assert.equal(evaluation.new_critical_regression, counters.newCritical);
  assert.equal(evaluation.new_high_medium_regression, counters.newHighMedium);
  assert.equal(evaluation.resolved_critical_defect, counters.resolvedCritical);
  assert.equal(evaluation.blocking_severity_escalation, counters.blockingEscalation);
  assert.equal(evaluation.critical_severity_escalation, counters.criticalEscalation);
}

const scoped = evaluatePairedDefects({
  baseline: arm([]),
  candidate: arm([], { scope_violation: true }),
});
assert.equal(scoped.candidate.regression_free_task_success, false);

const functionalFailure = evaluatePairedDefects({
  baseline: arm([]),
  candidate: arm([], { functional_task_success: false }),
});
assert.equal(functionalFailure.candidate.regression_free_task_success, false);

assert.throws(
  () => classifySeverityTransition("informational", "low"),
  (error) => error instanceof ProfileV3Error && error.code === "PAIRED_DEFECT_SEVERITY",
);

assert.throws(() => evaluatePairedDefects({
  baseline: arm([finding(), finding({ id: "duplicate-display-id" })]),
  candidate: arm([]),
}), (error) => error instanceof ProfileV3Error && error.code === "PAIRED_DEFECT_DUPLICATE");

assert.throws(() => evaluatePairedDefects({
  baseline: arm([{ ...finding(), unexpected: true }]),
  candidate: arm([]),
}), (error) => error instanceof ProfileV3Error && error.code === "PAIRED_DEFECT_SCHEMA");

process.stdout.write("paired defect evaluator verification passed\n");
