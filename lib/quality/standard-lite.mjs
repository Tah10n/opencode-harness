import { DOSSIER_TASK_TYPES } from "./constants.mjs";
import { ContractError, assertPlain, deepFrozenClone, exact } from "./validation.mjs";

const STANDARD_LITE_TASK_TYPES = Object.freeze([
  "maintenance",
  "bug_fix",
  "behavior_preserving_refactor",
  "new_feature",
]);

function mapping(checkId) {
  return {
    classification: "applicable_directly_tested",
    check_ids: [checkId],
    mechanism_ids: [],
    evidence_refs: [],
    rationale: null,
    blocked_reason: null,
    external_dependency: null,
  };
}

function obligationKinds(taskType) {
  if (taskType === "bug_fix") return ["reproducer", "unit"];
  if (taskType === "behavior_preserving_refactor") return ["characterization", "unit"];
  if (taskType === "new_feature") return ["contract", "negative_path"];
  return ["unit"];
}

export function standardLiteDossierRequest(registration, { trustedProducer }) {
  assertPlain(registration, "standard-lite registration");
  if (registration.risk_class !== "standard-lite" || registration.lifecycle !== "standard_lite") {
    throw new ContractError("QUALITY_STANDARD_LITE_SCOPE_EXCEEDED", "standard-lite dossier requires a classified standard-lite session");
  }
  if (!DOSSIER_TASK_TYPES.includes(registration.task_type)) throw new ContractError("QUALITY_TASK_TYPE", "standard-lite task type is unsupported");
  if (!STANDARD_LITE_TASK_TYPES.includes(registration.task_type)) {
    throw new ContractError(
      "QUALITY_STANDARD_LITE_SCOPE_EXCEEDED",
      `${registration.task_type} work requires a high or critical dossier`,
    );
  }
  const checkIds = [...registration.required_check_ids];
  const firstCheck = checkIds[0];
  const firstPath = registration.ownership_paths[0];
  const evidence = [{ kind: "file", value: firstPath }];
  const areaIds = registration.ownership_paths.map((_, index) => `AREA-standard-lite-${index + 1}`);
  const entryId = "ENTRY-standard-lite-1";
  const invariantId = "INV-standard-lite-owned";
  const edgeId = "EDGE-standard-lite-local";
  const failureId = "FAIL-standard-lite-verification";
  const obligationEntries = [];
  let obligationIndex = 0;
  for (const checkId of checkIds) {
    const kinds = checkId === firstCheck ? obligationKinds(registration.task_type) : ["integration"];
    for (const kind of kinds) {
      obligationIndex += 1;
      obligationEntries.push({
        id: `TEST-standard-lite-${obligationIndex}`,
        check_id: checkId,
        kind,
        phase: "integration",
        scope_ids: [...areaIds],
        command_or_mechanism: `trusted-project-check:${checkId}`,
        required: true,
        trusted_producer: trustedProducer,
      });
    }
  }
  const counterexamples = registration.task_type === "bug_fix" ? [{
    id: "COUNTEREXAMPLE-standard-lite-reproducer",
    statement: registration.known_local_edge_cases[0],
    expected_behavior: registration.behavior_expectation,
    scope_ids: [entryId],
    mapping: mapping(firstCheck),
  }] : [];
  return deepFrozenClone({
    risk_class: "standard-lite",
    mode: "standard-lite",
    task_type: registration.task_type,
    user_visible_goal: registration.user_visible_goal,
    task_shape: {
      summary: registration.classification_rationale,
      starting_commit: registration.classification_workspace.head_sha,
      worktree_state: registration.initial_workspace.entries.length === 0 ? "clean" : "dirty-preserved",
      instruction_sources: ["AGENTS.md"],
      skill_ids: ["global-quality-gates"],
      constraints: ["bounded-ownership", "one-shot-mutation", "trusted-project-checks"],
      non_goals: ["architecture-policy-change", "parallel-writable-delegation"],
    },
    behavior_contract: {
      status: "defined",
      requested_behavior: registration.behavior_expectation,
      positive_behavior: [registration.behavior_expectation],
      negative_behavior: ["unclassified, stale, or out-of-ownership mutation is rejected"],
      boundary_behavior: [`writes remain inside ${registration.ownership_paths.join(", ")}`],
      error_behavior: ["failed trusted checks block attestation"],
      ordering_and_side_effects: ["classification and one-shot authorization precede mutation; verification follows mutation"],
      preserved_behavior: [...registration.expected_preserved_behavior],
      compatibility_requirements: ["unmentioned local behavior remains unchanged"],
      security_requirements: ["runner-owned identities, fingerprints, and timestamps remain unforgeable by the agent"],
      completion_requirements: ["every required trusted project check passes on the final workspace"],
    },
    compatibility_contract: {
      status: "defined",
      default_decision: "preserve",
      rationale: "standard-lite cannot introduce a public compatibility change",
      evidence_refs: evidence,
    },
    public_contracts: [],
    system_boundaries: [],
    affected_areas: registration.ownership_paths.map((ownedPath, index) => ({
      id: areaIds[index],
      path: ownedPath,
      node_kind: "file",
      reason: "explicit standard-lite ownership",
      confidence: "observed",
      evidence_refs: [{ kind: "file", value: ownedPath }],
    })),
    entry_points: [{
      id: entryId,
      path: firstPath,
      symbol: null,
      reason: "bounded standard-lite implementation entry",
      evidence_refs: evidence,
    }],
    call_paths: [],
    data_shapes: [],
    invariants: [{
      id: invariantId,
      statement: "all changes remain inside the classified ownership and preserve declared behavior",
      scope_ids: [...areaIds],
      mapping: mapping(firstCheck),
    }],
    edge_cases: [{
      id: edgeId,
      category: "unexpected_valid_state",
      condition: registration.known_local_edge_cases.join("; "),
      expected_behavior: registration.behavior_expectation,
      scope_ids: [entryId],
      mapping: mapping(firstCheck),
    }],
    failure_modes: [{
      id: failureId,
      category: "partial_success_partial_failure",
      trigger: "a required project check fails, times out, is unavailable, is oversized, or binds stale state",
      impact: "the session cannot be attested",
      expected_handling: "fail closed and require current successful verification",
      scope_ids: [...areaIds],
      mapping: mapping(firstCheck),
    }],
    premortem_matrix: [{
      id: "PREMORTEM-standard-lite-local",
      category: "unexpected_valid_state",
      subject_ids: [edgeId],
      mapping: mapping(firstCheck),
    }, {
      id: "PREMORTEM-standard-lite-partial",
      category: "partial_success_partial_failure",
      subject_ids: [failureId],
      mapping: mapping(firstCheck),
    }],
    counterexamples,
    test_obligations: obligationEntries,
    specialized_checks: [],
    assumptions: [],
    unknowns: [],
    subagent_handoffs: [],
    implementation_slices: [{
      id: "SLICE-standard-lite-owned",
      owner: registration.agent_name,
      intent: "implementation",
      write_scope: [...registration.ownership_paths],
      concurrent_group: null,
      depends_on_slice_ids: [],
      invariant_ids: [invariantId],
      verification_check_ids: checkIds,
    }],
    impact_graph: null,
    context_coverage: {
      status: "complete",
      affected_area_ids: [...areaIds],
      covered_area_ids: [...areaIds],
      truncated_area_ids: [],
      accepted_gap_ids: [],
      evidence_refs: evidence,
    },
    verification_plan: {
      baseline_check_ids: [],
      slice_check_ids: checkIds,
      integration_check_ids: checkIds,
      architecture_check_ids: [],
      regression_check_ids: checkIds,
      hidden_check_ids: [],
      truncated_check_ids: [],
      evidence_refs: checkIds.map((checkId) => ({ kind: "check", value: checkId })),
    },
    rollback_recovery: {
      rollback_expectation: "revert the bounded local change",
      recovery_expectation: "restart from the last classified workspace",
      mapping: {
        classification: "not_applicable",
        check_ids: [],
        mechanism_ids: [],
        evidence_refs: [],
        rationale: "standard-lite excludes persistence, migration, and recovery-critical work",
        blocked_reason: null,
        external_dependency: null,
      },
    },
    verification_boundary: {
      check_ids: checkIds,
      mechanism_ids: [],
      ownership_paths: [...registration.ownership_paths],
      integration_check_ids: checkIds,
    },
  }, "standard-lite dossier request");
}
