import assert from "node:assert/strict";

import { requiredEngineeringVerificationTargets } from "../lib/quality/verification-targets.mjs";

function mapping(classification, { checkIds = [], mechanismIds = [] } = {}) {
  return {
    classification,
    check_ids: checkIds,
    mechanism_ids: mechanismIds,
  };
}

const dossier = {
  verification_plan: {
    baseline_check_ids: [],
    slice_check_ids: [],
    integration_check_ids: [],
    architecture_check_ids: [],
    regression_check_ids: [],
    hidden_check_ids: [],
  },
  implementation_slices: [],
  subagent_handoffs: [],
  verification_boundary: {
    check_ids: ["check-boundary", "check-boundary"],
    mechanism_ids: ["mechanism-boundary", "mechanism-boundary"],
    integration_check_ids: ["check-integration"],
  },
  test_obligations: [
    { check_id: "check-boundary", phase: "integration", required: false },
    { check_id: "check-integration", phase: "integration", required: false },
    { check_id: "check-required-obligation", phase: "slice", required: true },
    { check_id: "check-required-obligation", phase: "slice", required: true },
    { check_id: "check-optional-obligation", phase: "live", required: false },
    { check_id: "check-invariant", phase: "preimplementation", required: false },
    { check_id: "check-failure", phase: "slice", required: false },
    { check_id: "check-premortem", phase: "integration", required: false },
    { check_id: "check-counterexample", phase: "live", required: false },
  ],
  invariants: [
    { id: "INVARIANT-source", mapping: mapping("applicable_directly_tested", { checkIds: ["check-invariant"] }) },
  ],
  edge_cases: [
    { id: "EDGE-source", mapping: mapping("applicable_verified_by_other_mechanism", { mechanismIds: ["mechanism-edge"] }) },
  ],
  failure_modes: [
    { id: "FAILURE-source", mapping: mapping("applicable_blocked_unverified", { checkIds: ["check-failure"] }) },
  ],
  premortem_matrix: [
    { id: "PREMORTEM-source", mapping: mapping("applicable_directly_tested", { checkIds: ["check-premortem"] }) },
  ],
  counterexamples: [
    { id: "COUNTEREXAMPLE-source", mapping: mapping("applicable_directly_tested", { checkIds: ["check-counterexample"] }) },
  ],
  specialized_checks: [
    { id: "SPECIAL-source", mapping: mapping("applicable_verified_by_other_mechanism", { mechanismIds: ["mechanism-specialized"] }) },
    { id: "SPECIAL-not-applicable", mapping: mapping("not_applicable") },
  ],
  rollback_recovery: {
    id: "ROLLBACK-source",
    mapping: mapping("applicable_verified_by_other_mechanism", { mechanismIds: ["mechanism-rollback"] }),
  },
};

const before = JSON.stringify(dossier);
const targets = requiredEngineeringVerificationTargets(dossier);

assert.deepEqual(targets.checkIds, [
  "check-boundary",
  "check-counterexample",
  "check-failure",
  "check-integration",
  "check-invariant",
  "check-premortem",
  "check-required-obligation",
]);
assert.deepEqual(targets.mechanismIds, [
  "mechanism-boundary",
  "mechanism-edge",
  "mechanism-rollback",
  "mechanism-specialized",
]);
assert.deepEqual(targets.checkTargets, [
  { checkId: "check-boundary", phase: "integration" },
  { checkId: "check-counterexample", phase: "live" },
  { checkId: "check-failure", phase: "slice" },
  { checkId: "check-integration", phase: "integration" },
  { checkId: "check-invariant", phase: "preimplementation" },
  { checkId: "check-premortem", phase: "integration" },
  { checkId: "check-required-obligation", phase: "slice" },
]);
assert.deepEqual(targets.preimplementationCheckIds, ["check-invariant"]);
assert.deepEqual(targets.sliceCheckIds, ["check-failure", "check-required-obligation"]);
assert.deepEqual(targets.integrationCheckIds, ["check-boundary", "check-integration", "check-premortem"]);
assert.deepEqual(targets.liveCheckIds, ["check-counterexample"]);
assert.deepEqual(targets.postMutationCheckIds, [
  "check-boundary",
  "check-failure",
  "check-integration",
  "check-premortem",
  "check-required-obligation",
]);
assert.deepEqual(targets.postMutationCheckTargets, [
  { checkId: "check-boundary", phase: "integration" },
  { checkId: "check-failure", phase: "slice" },
  { checkId: "check-integration", phase: "integration" },
  { checkId: "check-premortem", phase: "integration" },
  { checkId: "check-required-obligation", phase: "slice" },
]);

assert(!targets.checkIds.includes("check-optional-obligation"), "optional obligations must not become required targets");
assert(!targets.checkIds.includes("COUNTEREXAMPLE-source"), "mapping owner IDs must not be synthesized as check IDs");
assert(!targets.mechanismIds.includes("ROLLBACK-source"), "rollback owner IDs must not be synthesized as mechanism IDs");
assert.equal(JSON.stringify(dossier), before, "target derivation must not mutate the dossier");
assert(Object.isFrozen(targets), "target result must be immutable");
assert(Object.isFrozen(targets.checkIds), "check IDs must be immutable");
assert(Object.isFrozen(targets.checkTargets), "check targets must be immutable");
assert(targets.checkTargets.every(Object.isFrozen), "each check target must be immutable");
assert(Object.isFrozen(targets.postMutationCheckTargets), "post-mutation targets must be immutable");
assert(Object.isFrozen(targets.mechanismIds), "mechanism IDs must be immutable");
assert.throws(() => targets.checkIds.push("check-injected"), TypeError);
assert.deepEqual(requiredEngineeringVerificationTargets(dossier), targets, "target derivation must be deterministic");

console.log("Quality verification target checks passed.");
