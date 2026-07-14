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

/**
 * Derive every dossier-declared verification target without inventing aliases.
 * The returned arrays are sorted, unique, and immutable so every consumer sees
 * the same canonical target set regardless of dossier declaration order.
 */
export function requiredEngineeringVerificationTargets(dossier) {
  const mappings = applicableMappings(dossier);
  return Object.freeze({
    checkIds: sortedUnique([
      ...dossier.verification_boundary.check_ids,
      ...dossier.verification_boundary.integration_check_ids,
      ...dossier.test_obligations
        .filter((entry) => entry.required)
        .map((entry) => entry.check_id),
      ...mappings.flatMap((mapping) => mapping.check_ids),
    ]),
    mechanismIds: sortedUnique([
      ...dossier.verification_boundary.mechanism_ids,
      ...mappings.flatMap((mapping) => mapping.mechanism_ids),
    ]),
  });
}
