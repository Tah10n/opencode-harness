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
  verification_boundary: {
    check_ids: ["check-boundary", "check-boundary"],
    mechanism_ids: ["mechanism-boundary", "mechanism-boundary"],
    integration_check_ids: ["check-integration"],
  },
  test_obligations: [
    { check_id: "check-required-obligation", required: true },
    { check_id: "check-optional-obligation", required: false },
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

assert(!targets.checkIds.includes("check-optional-obligation"), "optional obligations must not become required targets");
assert(!targets.checkIds.includes("COUNTEREXAMPLE-source"), "mapping owner IDs must not be synthesized as check IDs");
assert(!targets.mechanismIds.includes("ROLLBACK-source"), "rollback owner IDs must not be synthesized as mechanism IDs");
assert.equal(JSON.stringify(dossier), before, "target derivation must not mutate the dossier");
assert(Object.isFrozen(targets), "target result must be immutable");
assert(Object.isFrozen(targets.checkIds), "check IDs must be immutable");
assert(Object.isFrozen(targets.mechanismIds), "mechanism IDs must be immutable");
assert.throws(() => targets.checkIds.push("check-injected"), TypeError);
assert.deepEqual(requiredEngineeringVerificationTargets(dossier), targets, "target derivation must be deterministic");

console.log("Quality verification target checks passed.");
