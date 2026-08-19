import assert from "node:assert/strict";

import { ProfileV3Error } from "../lib/profile-v3.mjs";
import { evaluatePairedDefects } from "../lib/benchmark/paired-defect-evaluator.mjs";

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

const unchanged = evaluatePairedDefects({
  baseline: arm([finding()]),
  candidate: arm([finding({ id: "candidate-label-may-differ" })]),
});
assert.equal(unchanged.new_high_medium_regression, 0);
assert.equal(unchanged.resolved_high_medium_defect, 0);
assert.equal(unchanged.relations[0].relation, "unchanged-defect");
assert.equal(unchanged.baseline.high_medium_defect_present, true);
assert.equal(unchanged.candidate.high_medium_defect_present, true);
assert.equal(unchanged.candidate.regression_free_task_success, false);

const improved = evaluatePairedDefects({
  baseline: arm([finding()]),
  candidate: arm([]),
});
assert.equal(improved.new_high_medium_regression, 0);
assert.equal(improved.resolved_high_medium_defect, 1);
assert.equal(improved.candidate.regression_free_task_success, true);

const regressed = evaluatePairedDefects({
  baseline: arm([]),
  candidate: arm([finding({ severity: "high" })]),
});
assert.equal(regressed.new_high_medium_regression, 1);
assert.equal(regressed.resolved_high_medium_defect, 0);

const critical = evaluatePairedDefects({
  baseline: arm([finding({ severity: "high" })]),
  candidate: arm([finding({ severity: "critical" })]),
});
assert.equal(critical.new_high_medium_regression, 0);
assert.equal(critical.critical_regression, 1);
assert.equal(critical.relations[0].relation, "critical-regression");

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

assert.throws(() => evaluatePairedDefects({
  baseline: arm([finding(), finding({ id: "duplicate-display-id" })]),
  candidate: arm([]),
}), (error) => error instanceof ProfileV3Error && error.code === "PAIRED_DEFECT_DUPLICATE");

assert.throws(() => evaluatePairedDefects({
  baseline: arm([{ ...finding(), unexpected: true }]),
  candidate: arm([]),
}), (error) => error instanceof ProfileV3Error && error.code === "PAIRED_DEFECT_SCHEMA");

process.stdout.write("paired defect evaluator verification passed\n");
