const MAPPING_COLLECTIONS = Object.freeze([
  "invariants",
  "edge_cases",
  "failure_modes",
  "premortem_matrix",
  "counterexamples",
  "specialized_checks",
]);

function sortedUnique(values) {
  return Object.freeze([...new Set(values)].sort());
}

function applicableMappings(dossier) {
  return [
    ...MAPPING_COLLECTIONS.flatMap((field) => dossier[field].map((entry) => entry.mapping)),
    dossier.rollback_recovery.mapping,
  ].filter((mapping) => mapping.classification !== "not_applicable");
}

const PHASE_ORDER = Object.freeze(["preimplementation", "slice", "integration", "live"]);

function freezeCheckTargets(checkIds, obligationsByCheckId) {
  const targets = [];
  for (const checkId of checkIds) {
    const phases = obligationsByCheckId.get(checkId) ?? new Set(["integration"]);
    for (const phase of PHASE_ORDER) {
      if (phases.has(phase)) targets.push(Object.freeze({ checkId, phase }));
    }
  }
  return Object.freeze(targets);
}

/**
 * Derive every dossier-declared verification target without inventing aliases.
 * The returned arrays are sorted, unique, and immutable so every consumer sees
 * the same canonical target set regardless of dossier declaration order.
 */
export function requiredEngineeringVerificationTargets(dossier) {
  const mappings = applicableMappings(dossier);
  const obligationsByCheckId = new Map();
  for (const obligation of dossier.test_obligations) {
    const phases = obligationsByCheckId.get(obligation.check_id) ?? new Set();
    phases.add(obligation.phase);
    obligationsByCheckId.set(obligation.check_id, phases);
  }
  const plannedCheckIds = [
    ...dossier.verification_plan.baseline_check_ids,
    ...dossier.verification_plan.slice_check_ids,
    ...dossier.verification_plan.integration_check_ids,
    ...dossier.verification_plan.architecture_check_ids,
    ...dossier.verification_plan.regression_check_ids,
    ...dossier.verification_plan.hidden_check_ids,
  ];
  const checkIds = sortedUnique([
    ...dossier.verification_boundary.check_ids,
    ...dossier.verification_boundary.integration_check_ids,
    ...plannedCheckIds,
    ...dossier.implementation_slices.flatMap((entry) => entry.verification_check_ids),
    ...dossier.subagent_handoffs.flatMap((entry) => entry.verification_check_ids),
    ...dossier.test_obligations
      .filter((entry) => entry.required)
      .map((entry) => entry.check_id),
    ...mappings.flatMap((mapping) => mapping.check_ids),
  ]);
  const checkTargets = freezeCheckTargets(checkIds, obligationsByCheckId);
  const checksForPhase = (phase) => Object.freeze(checkTargets
    .filter((entry) => entry.phase === phase)
    .map((entry) => entry.checkId));
  const preimplementationCheckIds = checksForPhase("preimplementation");
  const sliceCheckIds = checksForPhase("slice");
  const integrationCheckIds = checksForPhase("integration");
  const liveCheckIds = checksForPhase("live");
  const postMutationCheckTargets = Object.freeze(checkTargets.filter((entry) => (
    entry.phase === "slice" || entry.phase === "integration"
  )));
  return Object.freeze({
    checkIds,
    checkTargets,
    preimplementationCheckIds,
    sliceCheckIds,
    integrationCheckIds,
    liveCheckIds,
    postMutationCheckIds: sortedUnique(postMutationCheckTargets.map((entry) => entry.checkId)),
    postMutationCheckTargets,
    mechanismIds: sortedUnique([
      ...dossier.verification_boundary.mechanism_ids,
      ...mappings.flatMap((mapping) => mapping.mechanism_ids),
    ]),
  });
}
