import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ContractError, createTraceStore } from "../lib/feedback/index.mjs";
import { stableCheckId } from "../lib/feedback/contracts.mjs";
import { loadScenarioCorpus } from "../lib/feedback/manifests.mjs";
import { buildArchitecturePolicy, evaluateArchitecturePolicy } from "../lib/quality/architecture.mjs";
import { createQualityOutcomes } from "../lib/quality/acceptance-contracts.mjs";
import { PREMORTEM_CATEGORIES } from "../lib/quality/constants.mjs";
import { createEngineeringDossierDraft, updateEngineeringDossierDraft } from "../lib/quality/dossier.mjs";
import { buildEngineeringImpactGraph, IMPACT_BOUNDARY_CATEGORIES } from "../lib/quality/impact-graph.mjs";
import {
  loadQualityLiveScenarioSidecar,
  qualityLiveCheckCatalog,
  qualityLiveFixtureFingerprint,
  qualityLiveVisibleOracleContract,
} from "../lib/quality/live-scenarios.mjs";
import { validateEngineeringQualityRunBundle } from "../lib/quality/run-bundle.mjs";
import { selectMinimumContextStrategy } from "../lib/quality/context-strategies.mjs";
import { fingerprint } from "../lib/quality/validation.mjs";
import {
  observeRunnerQualityContext,
  productionQualityScenarioRunOptions,
  runnerPreimplementationEvidence,
  runnerReviewerChecks,
  runnerVisibleOracleObservation,
  runScenarioProfile,
} from "./evaluate-live.mjs";
import { completeContextContent } from "./context-test-fixtures.mjs";
import { createInjectedTestContainmentFactory } from "./injected-test-containment.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const START_COMMIT = "0a1d56605b9b8923ac27c3b3b405b38177ca7741";

function createObservedQualityLiveRunnerTestContainment() {
  const baseFactory = createInjectedTestContainmentFactory(
    "injected-quality-live-runner-test-containment-v1",
  );
  let invocationCount = 0;
  return Object.freeze({
    factory: async (worker) => {
      invocationCount += 1;
      return baseFactory(worker);
    },
    invocationCount: () => invocationCount,
  });
}

function highImpactGraph(ownershipPath, riskClass = "high") {
  const critical = riskClass === "critical";
  const entryPath = "src/consumer.mjs";
  const evidence = [{ kind: "file", value: ownershipPath }];
  const boundary = (category, references = {}, rationale = null) => ({
    id: `BOUNDARY-${category}`,
    category,
    classification: rationale === null ? "represented" : "reasoned_excluded",
    node_ids: references.node_ids ?? [],
    edge_ids: references.edge_ids ?? [],
    path_ids: references.path_ids ?? [],
    unknown_ids: references.unknown_ids ?? [],
    excluded_sibling_ids: references.excluded_sibling_ids ?? [],
    rationale,
    evidence_refs: evidence,
  });
  const graphNodes = [
    { id: "NODE-live-entry", kind: "public_api", path: entryPath, symbol: "publicEntry", label: "public entry", boundary: "entry_point", confidence: "observed", coverage: "complete", evidence_refs: evidence },
    { id: "NODE-live-owner", kind: "module", path: ownershipPath, symbol: "owner", label: "owning module", boundary: "module", confidence: "observed", coverage: "complete", evidence_refs: evidence },
    { id: "NODE-live-state", kind: critical ? "module" : "data_store", path: ownershipPath, symbol: null, label: "derived public state", boundary: critical ? "module" : "persistence", confidence: "observed", coverage: "complete", evidence_refs: evidence },
    { id: "NODE-live-test", kind: "test", path: "test/visible.test.mjs", symbol: null, label: "visible contract test", boundary: "operational", confidence: "observed", coverage: "complete", evidence_refs: [{ kind: "file", value: "test/visible.test.mjs" }] },
  ];
  const graphEdges = critical
    ? [
      { id: "EDGE-live-test-entry", from: "NODE-live-test", to: "NODE-live-entry", relationship: "imports", confidence: "observed", coverage: "complete", evidence_refs: [{ kind: "file", value: "test/visible.test.mjs" }] },
      { id: "EDGE-live-entry-owner", from: "NODE-live-entry", to: "NODE-live-owner", relationship: "imports", confidence: "observed", coverage: "complete", evidence_refs: [{ kind: "file", value: entryPath }] },
    ]
    : [
      { id: "EDGE-live-entry-owner", from: "NODE-live-entry", to: "NODE-live-owner", relationship: "calls", confidence: "observed", coverage: "complete", evidence_refs: evidence },
      { id: "EDGE-live-owner-state", from: "NODE-live-owner", to: "NODE-live-state", relationship: "writes", confidence: "observed", coverage: "complete", evidence_refs: evidence },
      { id: "EDGE-live-test-owner", from: "NODE-live-test", to: "NODE-live-owner", relationship: "verifies", confidence: "observed", coverage: "complete", evidence_refs: [{ kind: "file", value: "test/visible.test.mjs" }] },
    ];
  const graphPaths = critical
    ? [
      { id: "BLAST-live-direct", kind: "direct", node_ids: ["NODE-live-entry", "NODE-live-owner"], edge_ids: ["EDGE-live-entry-owner"], critical: true, verification_node_ids: ["NODE-live-test"], confidence: "observed", evidence_refs: evidence },
      { id: "BLAST-live-transitive", kind: "transitive", node_ids: ["NODE-live-test", "NODE-live-entry", "NODE-live-owner"], edge_ids: ["EDGE-live-test-entry", "EDGE-live-entry-owner"], critical: true, verification_node_ids: ["NODE-live-test"], confidence: "observed", evidence_refs: evidence },
    ]
    : [
      { id: "BLAST-live-direct", kind: "direct", node_ids: ["NODE-live-entry", "NODE-live-owner"], edge_ids: ["EDGE-live-entry-owner"], critical: true, verification_node_ids: ["NODE-live-test"], confidence: "observed", evidence_refs: evidence },
      { id: "BLAST-live-transitive", kind: "transitive", node_ids: ["NODE-live-entry", "NODE-live-owner", "NODE-live-state"], edge_ids: ["EDGE-live-entry-owner", "EDGE-live-owner-state"], critical: true, verification_node_ids: ["NODE-live-test"], confidence: "observed", evidence_refs: evidence },
    ];
  const boundaries = {
    direct_affected_paths: boundary("direct_affected_paths", { path_ids: ["BLAST-live-direct"] }),
    transitive_affected_paths: boundary("transitive_affected_paths", { path_ids: ["BLAST-live-transitive"] }),
    externally_reachable_entry_points: boundary("externally_reachable_entry_points", { node_ids: ["NODE-live-entry"] }),
    downstream_state_or_side_effects: critical
      ? boundary("downstream_state_or_side_effects", {}, "the bounded critical import chain has no downstream state or side-effect edge")
      : boundary("downstream_state_or_side_effects", { node_ids: ["NODE-live-state"], edge_ids: ["EDGE-live-owner-state"] }),
    cross_boundary_contracts: boundary("cross_boundary_contracts", { node_ids: ["NODE-live-entry"], edge_ids: ["EDGE-live-entry-owner"] }),
    critical_path_tests: boundary("critical_path_tests", { node_ids: ["NODE-live-test"], path_ids: ["BLAST-live-direct", "BLAST-live-transitive"] }),
    relevant_unknown_paths: boundary("relevant_unknown_paths", {}, "bounded fixture inventory has no unresolved material path"),
    excluded_sibling_paths: boundary("excluded_sibling_paths", { excluded_sibling_ids: ["EXCLUDED-live-readme"] }),
  };
  return buildEngineeringImpactGraph({
    graph_id: `GRAPH-live-${riskClass}-context`,
    risk_class: riskClass,
    nodes: graphNodes,
    edges: graphEdges,
    affected_paths: graphPaths,
    excluded_siblings: [{ id: "EXCLUDED-live-readme", path: "README.md", reason: "documentation does not execute the public API path", confidence: "observed", evidence_refs: [{ kind: "file", value: "README.md" }] }],
    unknowns: [],
    coverage: {
      completeness: "complete",
      semantic_tool_status: riskClass === "critical" ? "available" : "unavailable",
      semantic_tools: riskClass === "critical" ? ["context_related"] : [],
      fallback_tools: riskClass === "critical" ? [] : ["context_read"],
      reduced_semantic_coverage: riskClass !== "critical",
      truncated: false,
      truncation_reason: null,
      available_evaluator_ids: ["cycle-v1"],
      unavailable_evaluator_ids: [],
      boundaries: IMPACT_BOUNDARY_CATEGORIES.map((category) => boundaries[category]),
      evidence_refs: [{ kind: "check", value: "deterministic-live-context" }],
    },
  });
}

function highArchitecturePolicy(ownershipPath) {
  return buildArchitecturePolicy({
    policy_id: "ARCHPOLICY-live-high",
    enforce_existing: true,
    required_evaluator_ids: ["cycle-v1"],
    rules: [{
      id: "ARCHRULE-live-acyclic",
      kind: "deny_cycle",
      scope: { type: "exact_path", value: ownershipPath },
      relationship_kinds: ["calls", "writes"],
      evaluator_id: "cycle-v1",
      rationale: "the public API path must remain acyclic across ownership and state transitions",
    }],
  });
}

function criticalContextRelatedOutput(targetPath, importerPath, targetContent, importerContent) {
  const truncation = Object.fromEntries([
    "inventoryLimitReached", "resultLimitReached", "matchLimitReached", "byteLimitReached",
    "lineLimitReached", "durationLimitReached", "excerptTruncated", "contextBeforeTruncated",
    "contextAfterTruncated", "symbolLimitReached", "relationshipLimitReached", "snapshotChanged",
    "coveragePartial",
  ].map((key) => [key, false]));
  return JSON.stringify({
    schemaVersion: 2,
    tool: "context_related",
    worktree: ".",
    scope: { path: targetPath, filters: {} },
    snapshot: {
      fingerprint: fingerprint({ targetPath, importerPath, targetContent, importerContent }).slice("sha256:".length),
      fingerprintKind: "content",
      fingerprintScope: targetPath,
      complete: true,
      stable: true,
      changedDuringOperation: false,
      truncationReasons: [],
    },
    coverage: {
      candidateFiles: 2,
      scannedFiles: 2,
      bytesScanned: Buffer.byteLength(targetContent, "utf8") + Buffer.byteLength(importerContent, "utf8"),
      skippedSecret: 0,
      skippedGenerated: 0,
      skippedLarge: 0,
      skippedUnreadable: 0,
      unsupportedLanguages: {},
      truncation,
      truncationReasons: [],
      partial: false,
    },
    limits: {},
    usage: { files: 2, directories: 0, bytes: Buffer.byteLength(targetContent, "utf8") + Buffer.byteLength(importerContent, "utf8"), lines: 0, matches: 0, ranges: 0 },
    truncated: false,
    target: targetPath,
    related: [
      { path: importerPath, relationship: "imported-by", confidence: "high", evidence: "bounded fixture importer dependency" },
    ],
    directImports: [],
    importedBy: [],
    likelyTests: [],
    sameBasename: [],
    siblings: [],
    semanticCoverage: { complete: true },
  });
}

function deterministicRunnerReviewerChecks(request, { contentMatches = true } = {}) {
  const check = (passed, findingId) => ({
    status: passed ? "passed" : "blocked",
    finding_ids: passed ? [] : [findingId],
  });
  const plannedTestObligationIds = new Set(request.planned_test_obligation_ids ?? []);
  return {
    changed_path_ownership: check(
      contentMatches && request.changed_paths.every((entry) => entry.ownership_ids.length > 0),
      "fixture-review-ownership-or-content",
    ),
    public_contracts: check(contentMatches && request.unexpected_public_contracts.length === 0, "fixture-review-public-contract"),
    dependency_directions: check(request.unexpected_dependency_directions.length === 0, "fixture-review-dependency"),
    side_effect_edges: check(request.unexpected_side_effect_edges.length === 0, "fixture-review-side-effect"),
    critical_path_tests: check(
      request.changed_paths.filter((entry) => ["source", "schema", "config"].includes(entry.kind))
        .every((entry) => entry.test_obligation_ids.length > 0
          && entry.test_obligation_ids.every((id) => plannedTestObligationIds.has(id))),
      "fixture-review-critical-test",
    ),
    unrelated_changes: check(request.unrelated_paths.length === 0, "fixture-review-unrelated-change"),
  };
}

function mapping(classification, overrides = {}) {
  return {
    classification,
    check_ids: [],
    mechanism_ids: [],
    evidence_refs: [],
    rationale: null,
    blocked_reason: null,
    external_dependency: null,
    ...overrides,
  };
}

function dossierPatch(scenarioId, { narrowed = false } = {}) {
  const baseline = `${scenarioId}-baseline`;
  const visible = `${scenarioId}-visible`;
  const integration = `${scenarioId}-integration`;
  const hidden = `${scenarioId}-hidden-evaluation`;
  const integrationObligations = [{
    id: "TEST-integration",
    check_id: integration,
    kind: "command",
    phase: "integration",
    scope_ids: ["AREA-label"],
    command_or_mechanism: "runner-hidden-integration",
    required: true,
    trusted_producer: "opencode-harness-quality-runner",
  }];
  const baselineObligations = narrowed ? [] : [{
    id: "TEST-baseline",
    check_id: baseline,
    kind: "reproducer",
    phase: "preimplementation",
    scope_ids: ["AREA-label"],
    command_or_mechanism: "node --test test/visible.test.mjs",
    required: true,
    trusted_producer: "opencode-harness-quality-runner",
  }];
  return {
    task_shape: {
      summary: "bounded-one-file-label-fix",
      starting_commit: START_COMMIT,
      worktree_state: "clean",
      instruction_sources: ["AGENTS.md"],
      skill_ids: ["global-quality-gates"],
      constraints: ["one-owned-file"],
      non_goals: ["dependency-addition", "delegation"],
    },
    behavior_contract: {
      status: "defined",
      requested_behavior: "uppercase-label-with-empty-fallback",
      positive_behavior: ["non-empty-label-is-uppercase"],
      negative_behavior: ["lowercase-output-is-rejected"],
      boundary_behavior: ["empty-label-uses-fallback"],
      error_behavior: ["string-coercion-remains-defined"],
      ordering_and_side_effects: ["formatter-remains-pure"],
      preserved_behavior: ["string-coercion"],
      compatibility_requirements: ["node-24"],
      security_requirements: ["bounded-write-scope"],
      completion_requirements: ["visible-and-hidden-verification"],
    },
    compatibility_contract: {
      status: "defined",
      default_decision: "preserve",
      rationale: "public formatter signature and coercion remain stable",
      evidence_refs: [{ kind: "file", value: "src/label.mjs" }],
    },
    public_contracts: [],
    system_boundaries: [{
      id: "SYSBOUNDARY-caller",
      category: "caller",
      path: "src/label.mjs",
      status: "resolved",
      rationale: "export is the bounded entry",
      evidence_refs: [{ kind: "file", value: "src/label.mjs" }],
    }],
    affected_areas: [{
      id: "AREA-label",
      path: "src/label.mjs",
      node_kind: "file",
      reason: "single-public-formatter",
      confidence: "observed",
      evidence_refs: [{ kind: "file", value: "src/label.mjs" }],
    }],
    entry_points: [{
      id: "ENTRY-label",
      path: "src/label.mjs",
      symbol: "label",
      reason: "public-formatter-export",
      evidence_refs: [{ kind: "file", value: "src/label.mjs" }],
    }],
    call_paths: [],
    data_shapes: [],
    invariants: [{
      id: "INV-string-coercion",
      statement: "input-remains-string-coercible",
      scope_ids: ["AREA-label"],
      mapping: mapping("applicable_directly_tested", { check_ids: [visible] }),
    }],
    edge_cases: [{
      id: "EDGE-empty-fallback",
      category: "null_absent_empty_malformed_unsupported",
      condition: "trimmed-input-is-empty",
      expected_behavior: "returns-UNTITLED",
      scope_ids: ["AREA-label"],
      mapping: mapping("applicable_verified_by_other_mechanism", { mechanism_ids: [hidden] }),
    }],
    failure_modes: [{
      id: "FAIL-lowercase-regression",
      category: "unexpected_valid_state",
      trigger: "normalization-keeps-lowercase",
      impact: "documented-display-contract-breaks",
      expected_handling: "integration-check-rejects",
      scope_ids: ["AREA-label"],
      mapping: mapping("applicable_directly_tested", { check_ids: [integration] }),
    }],
    premortem_matrix: [
      {
        id: "PREMORTEM-input",
        category: "null_absent_empty_malformed_unsupported",
        subject_ids: ["EDGE-empty-fallback"],
        mapping: mapping("applicable_verified_by_other_mechanism", { mechanism_ids: [hidden] }),
      },
      {
        id: "PREMORTEM-state",
        category: "unexpected_valid_state",
        subject_ids: ["FAIL-lowercase-regression"],
        mapping: mapping("applicable_directly_tested", { check_ids: [integration] }),
      },
    ],
    counterexamples: [],
    test_obligations: [
      ...baselineObligations,
      {
        id: "TEST-visible",
        check_id: visible,
        kind: "command",
        phase: "slice",
        scope_ids: ["AREA-label"],
        command_or_mechanism: "node --test test/visible.test.mjs",
        required: true,
        trusted_producer: "opencode-harness-quality-runner",
      },
      ...integrationObligations,
    ],
    specialized_checks: [],
    assumptions: [],
    unknowns: [],
    subagent_handoffs: [],
    implementation_slices: [{
      id: "SLICE-label",
      owner: "fixture-adapter",
      intent: "implementation",
      write_scope: ["src/label.mjs"],
      concurrent_group: null,
      depends_on_slice_ids: [],
      invariant_ids: ["INV-string-coercion"],
      verification_check_ids: [visible, integration],
    }],
    impact_graph: null,
    architecture_assessment: {
      policy_id: null,
      status: "not_configured",
      evaluation_id: null,
      violation_ids: [],
      notes: null,
    },
    context_coverage: {
      status: "complete",
      affected_area_ids: ["AREA-label"],
      covered_area_ids: ["AREA-label"],
      truncated_area_ids: [],
      accepted_gap_ids: [],
      evidence_refs: [{ kind: "file", value: "src/label.mjs" }],
    },
    verification_plan: {
      baseline_check_ids: narrowed ? [] : [baseline],
      slice_check_ids: [visible],
      integration_check_ids: [integration],
      architecture_check_ids: [],
      regression_check_ids: [integration],
      hidden_check_ids: [],
      truncated_check_ids: [],
      evidence_refs: [{ kind: "check", value: visible }],
    },
    rollback_recovery: {
      rollback_expectation: "no persistent state changes",
      recovery_expectation: "retry reads the same input",
      mapping: mapping("not_applicable", { rationale: "pure formatter has no persistence" }),
    },
    plan_challenge: {
      architect_result_id: null,
      reviewer_result_id: null,
      blockers: [],
      evidence_refs: [],
    },
    gate_state: { status: "not_evaluated", gate_id: null, reason_codes: [] },
    verification_boundary: {
      check_ids: narrowed ? [visible, integration] : [baseline, visible, integration],
      mechanism_ids: [hidden],
      ownership_paths: ["src/label.mjs"],
      integration_check_ids: [integration],
    },
  };
}

function highDossierPatch(scenarioId, {
  impactGraph,
  architectureEvaluation,
  architectResultId,
  reviewerResultId,
  riskClass = "high",
} = {}) {
  const baseline = `${scenarioId}-baseline`;
  const visible = `${scenarioId}-visible`;
  const integration = `${scenarioId}-integration`;
  const hidden = `${scenarioId}-hidden-evaluation`;
  const architecture = `${scenarioId}-architecture-evaluation`;
  const architectChallenge = `${scenarioId}-architect-plan-challenge`;
  const reviewerChallenge = `${scenarioId}-reviewer-plan-challenge`;
  const fileEvidence = [{ kind: "file", value: "src/api.mjs" }];
  const direct = (checkId) => mapping("applicable_directly_tested", {
    check_ids: [checkId],
    evidence_refs: [{ kind: "check", value: checkId }],
  });
  const via = (mechanismId) => mapping("applicable_verified_by_other_mechanism", {
    mechanism_ids: [mechanismId],
    evidence_refs: [{ kind: "check", value: mechanismId }],
  });
  const subjectsByCategory = new Map([
    ["null_absent_empty_malformed_unsupported", ["EDGE-invalid-input"]],
    ["backward_compatibility", ["FAIL-legacy-contract"]],
  ]);
  return {
    task_shape: {
      summary: "additive-public-api-compatibility-change",
      starting_commit: START_COMMIT,
      worktree_state: "clean",
      instruction_sources: ["AGENTS.md"],
      skill_ids: ["global-quality-gates", "global-wide-deep-context"],
      constraints: ["one-owned-file", "preserve-legacy-api", "preserve-error-semantics"],
      non_goals: ["dependency-addition", "schema-removal"],
    },
    behavior_contract: {
      status: "defined",
      requested_behavior: "add-normalized-display-name-without-breaking-legacy-callers",
      positive_behavior: ["displayName-is-normalized"],
      negative_behavior: ["invalid-user-retains-ERR_USER_INPUT"],
      boundary_behavior: ["legacy-name-field-remains-present"],
      error_behavior: ["typed-validation-error-code-and-message-remain-stable"],
      ordering_and_side_effects: ["record-construction-remains-pure-and-synchronous"],
      preserved_behavior: ["id-string-coercion", "trimmed-name", "legacy-name-field"],
      compatibility_requirements: ["additive-object-shape", "legacy-error-semantics"],
      security_requirements: ["bounded-write-scope"],
      completion_requirements: ["visible-contract", "hidden-compatibility", "final-reconciliation"],
    },
    compatibility_contract: {
      status: "defined",
      default_decision: "preserve",
      rationale: "displayName is additive while legacy name and ERR_USER_INPUT remain stable",
      evidence_refs: fileEvidence,
    },
    public_contracts: [{
      id: "CONTRACT-main",
      kind: "public_api",
      path: "src/api.mjs",
      owner: "fixture-public-api",
      compatibility_decision: "preserve",
      evidence_refs: fileEvidence,
    }],
    system_boundaries: [
      ["caller", "public callers consume userRecord"],
      ["callee", "userRecord owns normalization"],
      ["state", "returned record is the only derived state"],
      ["data_path", "input name flows to name and displayName"],
      ["architecture_layer", "public API module remains the owner"],
      ["ownership", "only src/api.mjs is writable"],
    ].map(([category, rationale]) => ({
      id: `SYSBOUNDARY-${category}`,
      category,
      path: "src/api.mjs",
      status: "resolved",
      rationale,
      evidence_refs: fileEvidence,
    })),
    affected_areas: [{
      id: "AREA-main",
      path: "src/api.mjs",
      node_kind: "public_api",
      reason: "the public record constructor owns the additive field and compatibility semantics",
      confidence: "observed",
      evidence_refs: fileEvidence,
    }],
    entry_points: [{
      id: "ENTRY-main",
      path: "src/api.mjs",
      symbol: "userRecord",
      reason: "exported public API entry",
      evidence_refs: fileEvidence,
    }],
    call_paths: [{
      id: "PATH-main",
      steps: ["ENTRY-main", "AREA-main", "CONTRACT-main"],
      confidence: "observed",
      evidence_refs: fileEvidence,
    }],
    data_shapes: [{
      id: "DATA-user-record",
      name: "userRecord result",
      producer_ids: ["ENTRY-main"],
      consumer_ids: ["CONTRACT-main"],
      serialization_boundary_ids: [],
      compatibility_notes: ["name remains present", "displayName is additive"],
      evidence_refs: fileEvidence,
    }],
    invariants: [{
      id: "INV-preserve",
      statement: "legacy name and ERR_USER_INPUT semantics remain stable while displayName is added",
      scope_ids: ["AREA-main"],
      mapping: direct(integration),
    }],
    edge_cases: [{
      id: "EDGE-invalid-input",
      category: "null_absent_empty_malformed_unsupported",
      condition: "input is absent or name is not a string",
      expected_behavior: "the documented TypeError with ERR_USER_INPUT is preserved",
      scope_ids: ["AREA-main"],
      mapping: via(hidden),
    }],
    failure_modes: [{
      id: "FAIL-legacy-contract",
      category: "backward_compatibility",
      trigger: "additive field implementation removes name or changes validation semantics",
      impact: "existing callers or error handlers break",
      expected_handling: "runner-owned hidden compatibility evaluation rejects the change",
      scope_ids: ["AREA-main"],
      mapping: direct(integration),
    }],
    premortem_matrix: PREMORTEM_CATEGORIES.map((category) => {
      const subjectIds = subjectsByCategory.get(category) ?? [];
      return {
        id: `PREMORTEM-${category}`,
        category,
        subject_ids: subjectIds,
        mapping: subjectIds.length > 0
          ? (category === "null_absent_empty_malformed_unsupported" ? via(hidden) : direct(integration))
          : mapping("not_applicable", { rationale: `bounded public API evidence excludes ${category}` }),
      };
    }),
    counterexamples: [{
      id: "COUNTEREXAMPLE-legacy-removal",
      statement: "a patch can satisfy displayName while removing the legacy name field",
      expected_behavior: "hidden compatibility evaluation rejects that superficially successful patch",
      scope_ids: ["AREA-main"],
      mapping: via(hidden),
    }],
    test_obligations: [
      {
        id: "TEST-baseline",
        check_id: baseline,
        kind: "reproducer",
        phase: "preimplementation",
        scope_ids: ["AREA-main"],
        command_or_mechanism: "node --test test/visible.test.mjs",
        required: true,
        trusted_producer: "opencode-harness-quality-runner",
      },
      {
        id: "TEST-visible",
        check_id: visible,
        kind: "contract",
        phase: "slice",
        scope_ids: ["AREA-main"],
        command_or_mechanism: "node --test test/visible.test.mjs",
        required: true,
        trusted_producer: "opencode-harness-quality-runner",
      },
      {
        id: "TEST-integration",
        check_id: integration,
        kind: "negative_path",
        phase: "integration",
        scope_ids: ["AREA-main"],
        command_or_mechanism: "runner-visible-hidden-workspace-integration",
        required: true,
        trusted_producer: "opencode-harness-quality-runner",
      },
      ...(riskClass === "critical" ? [{
        id: "TEST-rollback-recovery",
        check_id: integration,
        kind: "rollback_recovery",
        phase: "integration",
        scope_ids: ["AREA-main"],
        command_or_mechanism: "runner-visible-hidden-workspace-integration",
        required: true,
        trusted_producer: "opencode-harness-quality-runner",
      }] : []),
    ],
    specialized_checks: riskClass === "critical"
      ? [
        { id: "SPECIAL-security", category: "security", mapping: direct(integration) },
        { id: "SPECIAL-data-integrity", category: "data_integrity", mapping: direct(integration) },
        { id: "SPECIAL-rollback-recovery", category: "rollback_recovery", mapping: direct(integration) },
        { id: "SPECIAL-negative-path", category: "negative_path", mapping: direct(integration) },
        { id: "SPECIAL-architecture", category: "architecture", mapping: via(architecture) },
        { id: "SPECIAL-compatibility", category: "compatibility", mapping: direct(integration) },
      ]
      : [
        { id: "SPECIAL-architecture", category: "architecture", mapping: via(architecture) },
        { id: "SPECIAL-compatibility", category: "compatibility", mapping: direct(integration) },
      ],
    assumptions: [],
    unknowns: [],
    subagent_handoffs: [],
    implementation_slices: [{
      id: "SLICE-main",
      owner: "fixture-adapter",
      intent: "implementation",
      write_scope: ["src/api.mjs"],
      concurrent_group: null,
      depends_on_slice_ids: [],
      invariant_ids: ["INV-preserve"],
      verification_check_ids: [visible, integration],
    }],
    impact_graph: impactGraph,
    architecture_assessment: {
      policy_id: architectureEvaluation.policy_id,
      status: architectureEvaluation.status,
      evaluation_id: architectureEvaluation.evaluation_id,
      violation_ids: architectureEvaluation.violations.map((entry) => entry.violation_id),
      notes: "runner-owned cycle evaluator passed for the bounded public API graph",
    },
    context_coverage: {
      status: "complete",
      affected_area_ids: ["AREA-main"],
      covered_area_ids: ["AREA-main"],
      truncated_area_ids: [],
      accepted_gap_ids: [],
      evidence_refs: fileEvidence,
    },
    verification_plan: {
      baseline_check_ids: [baseline],
      slice_check_ids: [visible],
      integration_check_ids: [integration],
      architecture_check_ids: [],
      regression_check_ids: [integration],
      hidden_check_ids: [],
      truncated_check_ids: [],
      evidence_refs: [{ kind: "check", value: integration }],
    },
    rollback_recovery: riskClass === "critical"
      ? {
        rollback_expectation: "discarding the pure returned value restores the pre-call state",
        recovery_expectation: "retry reconstructs the same compatible record from the original input",
        mapping: direct(integration),
      }
      : {
        rollback_expectation: "no persistent state is changed",
        recovery_expectation: "retry reconstructs a record from the original input",
        mapping: mapping("not_applicable", { rationale: "the pure record constructor has no persistence" }),
      },
    plan_challenge: {
      architect_result_id: architectResultId,
      reviewer_result_id: reviewerResultId,
      blockers: [],
      evidence_refs: [architectResultId, reviewerResultId]
        .filter((entry) => entry !== null)
        .map((value) => ({ kind: "job", value })),
    },
    gate_state: { status: "not_evaluated", gate_id: null, reason_codes: [] },
    verification_boundary: {
      check_ids: [baseline, visible, integration],
      mechanism_ids: [hidden, architecture, architectChallenge, reviewerChallenge],
      ownership_paths: ["src/api.mjs"],
      integration_check_ids: [integration],
    },
  };
}

async function completeReadOnlyJob(onTrace, {
  taskId,
  agent,
  scope,
  status,
  evidence,
  summary,
  risk = "high",
} = {}) {
  await onTrace("job_create", { task_id: taskId, agent, assigned_scope: scope, write_scope: [], risk });
  await onTrace("job_transition", { task_id: taskId, state: "running" });
  await onTrace("job_complete", {
    task_id: taskId,
    state: "completed",
    result: {
      status,
      assigned_scope: scope,
      summary,
      evidence,
      files_changed: [],
      verification: "Read-only evidence was checked against the bounded deterministic fixture.",
      decision_unblocked: "The high-assurance plan or reconciliation can proceed.",
      uncertainty: "None for the bounded deterministic fixture.",
      risks: [],
      next_step: "Continue the runner-owned quality lifecycle.",
      termination_reason: "verified",
    },
  });
}

export async function createDeterministicQualityRun({
  profileRole,
  narrowed = false,
  runIdentity = null,
  observerMode = "production",
  reviewerMode = "implicit",
  oracleMode = "managed",
} = {}) {
  assert(["baseline", "candidate"].includes(profileRole), "profileRole must be baseline or candidate");
  assert(["managed", "forged-result"].includes(oracleMode), "oracleMode must be managed or forged-result");
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opencode-quality-live-runner-${profileRole}-`));
  const scenario = loadScenarioCorpus({ root }).scenarios
    .find((entry) => entry.id === "quality-small-local-control");
  assert(scenario, "quality-small-local-control scenario missing");
  const repositoryFingerprint = fingerprint({ repository: "quality-live-runner-fixture" });
  const profileFingerprint = fingerprint({ profile: profileRole, narrowed, repositoryFingerprint });
  let generatedId = 0;
  const traceStore = createTraceStore({
    workspaceRoot,
    ...(runIdentity === null ? {} : {
      idFactory: (kind) => kind === "run"
        ? runIdentity
        : `${kind}-${profileRole}-${++generatedId}`,
    }),
  });
  const checkCatalog = qualityLiveCheckCatalog(scenario.id, "standard-lite");
  const testContainment = createObservedQualityLiveRunnerTestContainment();
  const executeFixtureChecks = async (_scenario, phase, commands, repo) => {
    if (phase === "setup") return [];
    const moduleUrl = `${pathToFileURL(path.join(repo, "src", "label.mjs")).href}?phase=${phase}&v=${Date.now()}`;
    const { label } = await import(moduleUrl);
    const passed = ["preimplementation", "visible"].includes(phase)
      ? label("hello") === "HELLO"
      : label("") === "UNTITLED" && fs.existsSync(path.join(repo, ".live-hidden", "quality-small-local-control.test.mjs"));
    return commands.map((command, index) => ({
      check_id: stableCheckId(_scenario.id, phase, index),
      status: passed ? "passed" : "failed",
      exit_code: passed ? 0 : 1,
      stdout_chars: 0,
      stderr_chars: 0,
    }));
  };
  const qualityAdapter = async ({ context, onTrace, workingDirectory }) => {
    assert.equal(workingDirectory, context.repo, "adapter cwd is not bound to the isolated fixture");
    const inspected = await onTrace("quality_inspect", {});
    assert.deepEqual(inspected.ownership_paths, ["src/label.mjs"]);
    const created = await onTrace("quality_create_dossier", {
      dossier_id: `dossier-quality-live-${profileRole}-${narrowed ? "narrow" : "full"}`,
      task_id: "task-root",
      risk_class: "standard-lite",
      mode: "standard-lite",
      task_type: "maintenance",
      user_visible_goal: "Correct the bounded label formatter.",
      starting_commit: START_COMMIT,
      created_at: "2026-07-13T12:00:00.000Z",
    });
    await onTrace("quality_update_dossier", {
      expected_revision: created.revision,
      updated_at: "2026-07-13T12:01:00.000Z",
      patch: dossierPatch(scenario.id, { narrowed }),
    });
    const observed = await onTrace("quality_observe_context", {});
    assert(observed.context_receipt_ids.length > 0, "standard-lite runner context observation was not recorded");
    await onTrace("quality_finalize_dossier", { finalized_at: "2026-07-13T12:02:00.000Z" });
    await onTrace("quality_authorize_action", {
      kind: "edit",
      intent: "implementation",
      writable: true,
      write_scope: ["src/label.mjs"],
    });
    await onTrace("emit", {
      event_type: "edit",
      summary: "Implement the bounded label contract.",
      status: "completed",
      files_written: [{ path: "src/label.mjs", summary: "Uppercase output and empty fallback." }],
    });
    fs.writeFileSync(
      path.join(context.repo, "src", "label.mjs"),
      "export function label(value) {\n  const normalized = String(value).trim();\n  return normalized ? normalized.toUpperCase() : \"UNTITLED\";\n}\n",
      "utf8",
    );
    const reviewerResultId = `reviewer-${scenario.id}-${profileRole}`;
    const reviewerScope = "Review the exact final diff for ownership, contracts, dependencies, side effects, critical-path tests, and unrelated changes.";
    await onTrace("job_create", { task_id: reviewerResultId, agent: "reviewer", assigned_scope: reviewerScope, write_scope: [], risk: "standard" });
    await onTrace("job_transition", { task_id: reviewerResultId, state: "running" });
    await onTrace("job_complete", {
      task_id: reviewerResultId,
      state: "completed",
      result: {
        status: "no-findings",
        assigned_scope: reviewerScope,
        summary: "The bounded final diff matches the planned ownership and verification scope.",
        evidence: [
          "context-reconciliation:changed_path_ownership:passed",
          "context-reconciliation:public_contracts:passed",
          "context-reconciliation:dependency_directions:passed",
          "context-reconciliation:side_effect_edges:passed",
          "context-reconciliation:critical_path_tests:passed",
          "context-reconciliation:unrelated_changes:passed",
        ],
        files_changed: [],
        verification: "Read-only final-diff review completed.",
        decision_unblocked: "Runner may reconcile after exact diff extraction and integrated verification.",
        uncertainty: "None for the bounded deterministic fixture.",
        risks: [],
        next_step: "Complete runner-owned verification.",
        termination_reason: "verified",
      },
    });
    await onTrace("quality_reconcile_context", {
      changed_paths: [{
        path: "src/label.mjs",
        kind: "source",
        ownership_ids: ["SLICE-label"],
        context_subject_ids: ["AREA-label"],
        test_obligation_ids: ["TEST-visible", "TEST-integration"],
      }],
      unexpected_public_contracts: [],
      unexpected_dependency_directions: [],
      unexpected_side_effect_edges: [],
      unrelated_paths: [],
      unplanned_items: [],
    });
    return { passed: true, profile_fingerprint: profileFingerprint, tool: "deterministic-fixture-adapter" };
  };
  try {
    const productionOptions = productionQualityScenarioRunOptions(root);
    const observeQualityContextFn = observerMode === "production"
      ? productionOptions.observeQualityContextFn
      : observerMode === "null"
        ? null
        : observerMode === "throws"
          ? async () => { throw new ContractError("QUALITY_CONTEXT_OBSERVER_TEST_THROW", "injected trusted observer failure"); }
          : observerMode === "malformed"
            ? async (input) => {
              await productionOptions.observeQualityContextFn(input);
              return { receipts: [] };
            }
            : (() => { throw new Error(`unknown observerMode ${observerMode}`); })();
    const reviewerOptions = reviewerMode === "implicit"
      ? {}
      : reviewerMode === "null"
        ? { reviewQualityReconciliationFn: null }
        : reviewerMode === "throws"
          ? { reviewQualityReconciliationFn: async () => { throw new ContractError("QUALITY_REVIEWER_TEST_THROW", "injected trusted reviewer failure"); } }
          : reviewerMode === "malformed"
            ? { reviewQualityReconciliationFn: async () => ({ unexpected: true }) }
            : (() => { throw new Error(`unknown reviewerMode ${reviewerMode}`); })();
    const oracleOptions = oracleMode === "managed"
      ? {}
      : {
          executePreimplementationOracleFn: async (oracleScenario, phase, commands) => commands.map((_, index) => ({
            check_id: stableCheckId(oracleScenario.id, phase, index),
            status: "failed",
            exit_code: 1,
            stdout_chars: 0,
            stderr_chars: 0,
          })),
        };
    const result = await runScenarioProfile({
      adapterUrl: "fixture://quality-live-runner",
      scenario,
      repetition: 1,
      profileRun: {
        profile_role: profileRole,
        profile: `quality-live-${profileRole}`,
        repository_fingerprint: repositoryFingerprint,
        profile_fingerprint: profileFingerprint,
      },
      evaluationRunId: `quality-live-runner-${profileRole}-${narrowed ? "narrow" : "full"}`,
      traceStore,
      sourceRoot: productionOptions.sourceRoot,
      processContainmentFactory: testContainment.factory,
      observeQualityContextFn,
      ...reviewerOptions,
      ...oracleOptions,
      runAdapterModuleFn: qualityAdapter,
      executeChecksFn: executeFixtureChecks,
    });
    if (oracleMode === "managed") {
      assert.equal(testContainment.invocationCount(), 1, "managed baseline oracle did not use explicit test containment exactly once");
    }
    const runDir = path.join(workspaceRoot, ".oc_harness", "runs", result.operational_run_id);
    const expectedCallbackFailure = observerMode === "null"
      ? "QUALITY_CONTEXT_OBSERVER_UNAVAILABLE"
      : observerMode === "throws"
        ? "QUALITY_CONTEXT_OBSERVER_TEST_THROW"
        : observerMode === "malformed"
          ? "QUALITY_CONTEXT_OBSERVER_UNTRUSTED"
          : reviewerMode === "null"
            ? "QUALITY_LIVE_CALLBACK"
            : reviewerMode === "throws"
              ? "QUALITY_REVIEWER_TEST_THROW"
              : reviewerMode === "malformed"
                ? "CONTEXT_RECONCILIATION_REVIEWER_UNTRUSTED"
                : null;
    if (expectedCallbackFailure !== null) {
      assert.notEqual(result.status, "passed", `${observerMode}/${reviewerMode} callback failure passed`);
      assert(result.incomplete_evidence.includes(expectedCallbackFailure), JSON.stringify(result.incomplete_evidence));
      return {
        workspaceRoot,
        runDir,
        result,
        bundle: null,
        checkCatalog,
        cleanup: () => fs.rmSync(workspaceRoot, { recursive: true, force: true }),
      };
    }
    if (oracleMode === "forged-result") {
      assert.equal(testContainment.invocationCount(), 0, "forged oracle unexpectedly reached the managed command path");
      assert.notEqual(result.status, "passed", "plain oracle results produced a passing quality run");
      assert(result.incomplete_evidence.includes("QUALITY_BASELINE_ORACLE_UNTRUSTED"), JSON.stringify(result.incomplete_evidence));
      assert.equal(result.quality_bundle_manifest_fingerprint, null);
      assert.equal(result.quality_outcomes, null);
      return {
        workspaceRoot,
        runDir,
        result,
        bundle: null,
        checkCatalog,
        cleanup: () => fs.rmSync(workspaceRoot, { recursive: true, force: true }),
      };
    }
    assert(fs.existsSync(runDir), `deterministic quality run was not published: ${JSON.stringify(result)}`);
    assert(
      fs.existsSync(path.join(runDir, "quality", "dossier.json")),
      `deterministic quality bundle was not published: ${JSON.stringify(result)}`,
    );
    const bundle = validateEngineeringQualityRunBundle(runDir);
    return {
      workspaceRoot,
      runDir,
      result,
      bundle,
      checkCatalog,
      cleanup: () => fs.rmSync(workspaceRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    if (narrowed && error?.code === "QUALITY_ACCEPTANCE_TARGET_UNIVERSE") {
      const runsRoot = path.join(workspaceRoot, ".oc_harness", "runs");
      const runDirs = fs.existsSync(runsRoot)
        ? fs.readdirSync(runsRoot, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => path.join(runsRoot, entry.name))
        : [];
      assert.equal(runDirs.length, 1, "narrowed production run did not leave exactly one atomically published bundle");
      return {
        workspaceRoot,
        runDir: runDirs[0],
        result: null,
        bundle: validateEngineeringQualityRunBundle(runDirs[0]),
        checkCatalog,
        expectedFailure: error.code,
        cleanup: () => fs.rmSync(workspaceRoot, { recursive: true, force: true }),
      };
    }
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function createDeterministicHighQualityRun({
  profileRole,
  runIdentity = null,
  riskClass = "high",
  mutateAfterRunnerReview = false,
  provideRunnerReviewer = true,
  planChallengeMode = "valid",
} = {}) {
  assert(["baseline", "candidate"].includes(profileRole), "profileRole must be baseline or candidate");
  assert(["high", "critical"].includes(riskClass), "riskClass must be high or critical");
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opencode-quality-live-runner-${riskClass}-${profileRole}-`));
  const canonicalScenario = loadScenarioCorpus({ root }).scenarios
    .find((entry) => entry.id === "quality-public-api-compatibility");
  assert(canonicalScenario, "quality-public-api-compatibility scenario missing");
  const scenario = riskClass === "high"
    ? canonicalScenario
    : { ...structuredClone(canonicalScenario), risk_tags: [...new Set(canonicalScenario.risk_tags.filter((entry) => entry !== "high").concat("critical"))].sort() };
  const canonicalSidecar = loadQualityLiveScenarioSidecar({ root, scenario: canonicalScenario });
  const qualitySidecar = riskClass === "high" ? canonicalSidecar : { ...structuredClone(canonicalSidecar), risk_class: "critical" };
  const ownershipPath = "src/api.mjs";
  const graph = highImpactGraph(ownershipPath, riskClass);
  const architecturePolicy = highArchitecturePolicy(ownershipPath);
  const architectureEvaluation = evaluateArchitecturePolicy({ graph, policy: architecturePolicy, baseline: graph });
  assert.equal(architectureEvaluation.status, "passed", JSON.stringify(architectureEvaluation.violations));
  const repositoryFingerprint = fingerprint({ repository: `quality-live-runner-${riskClass}-fixture` });
  const profileFingerprint = fingerprint({ profile: profileRole, risk: riskClass, repositoryFingerprint });
  let generatedId = 0;
  const traceStore = createTraceStore({
    workspaceRoot,
    ...(runIdentity === null ? {} : {
      idFactory: (kind) => kind === "run"
        ? runIdentity
        : `${kind}-${riskClass}-${profileRole}-${++generatedId}`,
    }),
  });
  const checkCatalog = qualityLiveCheckCatalog(scenario.id, riskClass);
  const testContainment = createObservedQualityLiveRunnerTestContainment();
  const architectResultId = `architect-${scenario.id}-${profileRole}`;
  const planReviewerResultId = `plan-reviewer-${scenario.id}-${profileRole}`;
  const finalReviewerResultId = `final-reviewer-${scenario.id}-${profileRole}`;
  let adapterRepo = null;
  const qualityAdapter = async ({ context, onTrace, workingDirectory }) => {
    assert.equal(workingDirectory, context.repo, "adapter cwd is not bound to the isolated fixture");
    adapterRepo = context.repo;
    const inspected = await onTrace("quality_inspect", {});
    assert.deepEqual(inspected.ownership_paths, [ownershipPath]);
    assert.equal(inspected.risk_class, riskClass);
    assert.deepEqual(inspected.context_receipt_ids, []);
    const createdAt = new Date().toISOString();
    const updatedAt = new Date().toISOString();
    const dossierInput = {
      dossier_id: `dossier-quality-live-${riskClass}-${profileRole}`,
      task_id: inspected.task_id,
      risk_class: riskClass,
      mode: "full",
      task_type: "new_feature",
      user_visible_goal: "Add displayName while preserving the public API and validation semantics.",
      starting_commit: START_COMMIT,
      created_at: createdAt,
    };
    const created = await onTrace("quality_create_dossier", dossierInput);
    await completeReadOnlyJob(onTrace, {
      taskId: architectResultId,
      agent: "architect",
      scope: "Challenge the high-risk public API plan, ownership, compatibility, and architecture boundaries.",
      status: "completed",
      evidence: ["impact graph and compatibility contract challenged"],
      summary: "The plan covers the additive API contract, legacy caller behavior, and bounded ownership.",
      risk: riskClass,
    });
    await completeReadOnlyJob(onTrace, {
      taskId: planReviewerResultId,
      agent: "reviewer",
      scope: "Review the high-risk plan for missing edge cases, failure modes, tests, and rollback assumptions.",
      status: "no-findings",
      evidence: ["edge failure and verification mappings challenged"],
      summary: "No unresolved high or medium plan blocker remains in the bounded fixture.",
      risk: riskClass,
    });
    const initialPatch = highDossierPatch(scenario.id, {
      impactGraph: graph,
      architectureEvaluation,
      architectResultId: null,
      reviewerResultId: null,
      riskClass,
    });
    const localInitialDraft = updateEngineeringDossierDraft(createEngineeringDossierDraft({
      ...dossierInput,
      run_id: inspected.run_id,
    }), {
      expected_revision: 1,
      updated_at: updatedAt,
      patch: initialPatch,
    });
    const updated = await onTrace("quality_update_dossier", {
      expected_revision: created.revision,
      updated_at: updatedAt,
      patch: initialPatch,
    });
    const evaluated = await onTrace("quality_evaluate_architecture", { expected_revision: updated.revision });
    assert.equal(evaluated.status, "passed");
    assert.equal(evaluated.evaluation_id, architectureEvaluation.evaluation_id);
    const observed = await onTrace("quality_observe_context", {});
    const expectedReceiptCount = riskClass === "critical" ? 7 : 5;
    assert.deepEqual(
      observed.context_receipt_ids,
      Array.from({ length: expectedReceiptCount }, (_, index) => `context-live-${index + 1}`),
    );
    const challenge = await onTrace("quality_challenge_plan", {});
    const challengedAt = new Date().toISOString();
    const planChallenge = {
      architect_result_id: challenge.architect_result_id,
      reviewer_result_id: challenge.reviewer_result_id,
      blockers: [],
      evidence_refs: challenge.evidence_refs,
    };
    const challenged = await onTrace("quality_update_dossier", {
      expected_revision: updated.revision,
      updated_at: challengedAt,
      patch: { plan_challenge: planChallenge },
    });
    const localDraft = updateEngineeringDossierDraft(localInitialDraft, {
      expected_revision: localInitialDraft.revision,
      updated_at: challengedAt,
      patch: { plan_challenge: planChallenge },
    });
    const strategy = selectMinimumContextStrategy({ risk_class: riskClass, task_type: "new_feature" });
    await onTrace("quality_create_context_report", {
      report_id: `CONTEXT-live-${riskClass}-${profileRole}`,
      created_at: challengedAt,
      content: completeContextContent({
        strategyBinding: strategy,
        dossier: localDraft,
        receiptIds: observed.context_receipt_ids,
        minimalAvailable: ["context_outline", "context_files", "context_search", "context_read"],
        advancedAvailable: riskClass === "critical" ? ["context_related"] : [],
        readOnlySubagents: 4,
      }),
    });
    assert.equal(challenged.revision, localDraft.revision);
    const finalized = await onTrace("quality_finalize_dossier", { finalized_at: new Date().toISOString() });
    assert.equal(finalized.gate_status, "passed", JSON.stringify(finalized));
    assert.equal(finalized.context_decision_status, "sufficient");
    await onTrace("quality_authorize_action", {
      kind: "edit",
      intent: "implementation",
      writable: true,
      write_scope: [ownershipPath],
    });
    await onTrace("emit", {
      event_type: "edit",
      summary: "Apply the additive backward-compatible public API change.",
      status: "completed",
      files_written: [{ path: ownershipPath, summary: "Add normalized displayName while preserving legacy fields and errors." }],
    });
    fs.copyFileSync(
      path.join(root, "quality", "live-scenarios", "artifacts", scenario.id, "good", "api.mjs"),
      path.join(context.repo, "src", "api.mjs"),
    );
    await completeReadOnlyJob(onTrace, {
      taskId: finalReviewerResultId,
      agent: "reviewer",
      scope: "Review the exact final diff for ownership, contracts, dependencies, side effects, critical-path tests, and unrelated changes.",
      status: "no-findings",
      evidence: [
        "context-reconciliation:changed_path_ownership:passed",
        "context-reconciliation:public_contracts:passed",
        "context-reconciliation:dependency_directions:passed",
        "context-reconciliation:side_effect_edges:passed",
        "context-reconciliation:critical_path_tests:passed",
        "context-reconciliation:unrelated_changes:passed",
      ],
      summary: "The exact final diff remains inside the analyzed high-risk blast radius.",
      risk: riskClass,
    });
    await onTrace("quality_reconcile_context", {
      changed_paths: [{
        path: ownershipPath,
        kind: "source",
        ownership_ids: ["SLICE-main"],
        context_subject_ids: ["BLAST-live-direct"],
        test_obligation_ids: ["TEST-visible", "TEST-integration"],
      }],
      unexpected_public_contracts: [],
      unexpected_dependency_directions: [],
      unexpected_side_effect_edges: [],
      unrelated_paths: [],
      unplanned_items: [],
    });
    return { passed: true, profile_fingerprint: profileFingerprint, tool: "deterministic-high-fixture-adapter" };
  };
  const architectureEvaluatorFactory = () => (dossier) => {
    assert.equal(dossier.impact_graph?.fingerprint, graph.fingerprint);
    return architectureEvaluation;
  };
  const architectureAuditorFactory = () => ({ dossier, changed_paths: changedPaths }) => {
    assert.equal(dossier.impact_graph?.fingerprint, graph.fingerprint);
    assert.deepEqual([...changedPaths], [ownershipPath]);
    return architectureEvaluation;
  };
  let adapterError = null;
  try {
    const validPlanChallengeFn = (request) => {
      const dossierMatches = request.dossier.impact_graph?.fingerprint === graph.fingerprint
        && request.dossier.verification_plan.integration_check_ids.length > 0
        && request.dossier.public_contracts.some((entry) => entry.compatibility_decision === "preserve");
      return {
        architect: {
          status: dossierMatches ? "passed" : "blocked",
          summary: "Runner architect independently checked ownership, graph boundaries, and compatibility.",
          evidence_refs: [{ kind: "check", value: "deterministic-runner-architect-plan-challenge" }],
        },
        reviewer: {
          status: dossierMatches && request.dossier.failure_modes.length > 0 ? "passed" : "blocked",
          summary: "Runner reviewer independently checked failures, edge cases, and verification mappings.",
          evidence_refs: [{ kind: "check", value: "deterministic-runner-reviewer-plan-challenge" }],
        },
      };
    };
    const planChallengeOptions = planChallengeMode === "valid"
      ? { challengeQualityPlanFn: validPlanChallengeFn }
      : planChallengeMode === "omitted"
        ? {}
        : planChallengeMode === "null"
          ? { challengeQualityPlanFn: null }
          : planChallengeMode === "throws"
            ? { challengeQualityPlanFn: async () => { throw new ContractError("QUALITY_PLAN_CHALLENGE_TEST_THROW", "injected trusted challenge failure"); } }
            : planChallengeMode === "malformed"
              ? { challengeQualityPlanFn: async () => ({ architect: null }) }
              : (() => { throw new Error(`unknown planChallengeMode ${planChallengeMode}`); })();
    const result = await runScenarioProfile({
      adapterUrl: `fixture://quality-live-runner-${riskClass}`,
      scenario,
      repetition: 1,
      profileRun: {
        profile_role: profileRole,
        profile: `quality-live-${riskClass}-${profileRole}`,
        repository_fingerprint: repositoryFingerprint,
        profile_fingerprint: profileFingerprint,
      },
      evaluationRunId: `quality-live-runner-${riskClass}-${profileRole}`,
      traceStore,
      sourceRoot: root,
      processContainmentFactory: testContainment.factory,
      qualitySidecarOverride: qualitySidecar,
      runAdapterModuleFn: async (input) => {
        try {
          return await qualityAdapter(input);
        } catch (error) {
          adapterError = error;
          throw error;
        }
      },
      qualityArchitectureEvaluatorFn: architectureEvaluatorFactory,
      qualityArchitectureAuditorFn: architectureAuditorFactory,
      ...planChallengeOptions,
      ...(riskClass === "critical" ? {
        observeQualityContextFn: async (input) => {
          const baseObservation = await observeRunnerQualityContext({
            ...input,
            available_tool_ids: ["context_outline", "context_files", "context_search", "context_read", "context_related"],
          });
          const sourcePath = ownershipPath;
          const consumerPath = "src/consumer.mjs";
          const testPath = "test/visible.test.mjs";
          const sourceContent = fs.readFileSync(path.join(input.fixture.repo, sourcePath), "utf8");
          const consumerContent = fs.readFileSync(path.join(input.fixture.repo, consumerPath), "utf8");
          const testContent = fs.readFileSync(path.join(input.fixture.repo, testPath), "utf8");
          const testConsumerReceipt = input.recordObservedContextToolCall({
            session_id: "runner-quality-context",
            call_id: "runner-context-related-critical-test-consumer",
            tool_id: "context_related",
            args: { path: consumerPath, relationshipKinds: ["imported-by"] },
            output: criticalContextRelatedOutput(consumerPath, testPath, consumerContent, testContent),
            parent_question_id: null,
            evidence_refs: [{ kind: "runtime", value: "deterministic-critical-semantic-host-observer" }],
          });
          const consumerOwnerReceipt = input.recordObservedContextToolCall({
            session_id: "runner-quality-context",
            call_id: "runner-context-related-critical-consumer-owner",
            tool_id: "context_related",
            args: { path: sourcePath, relationshipKinds: ["imported-by"] },
            output: criticalContextRelatedOutput(sourcePath, consumerPath, sourceContent, consumerContent),
            parent_question_id: null,
            evidence_refs: [{ kind: "runtime", value: "deterministic-critical-semantic-host-observer" }],
          });
          return {
            receipt_ids: [
              ...baseObservation.receipt_ids,
              testConsumerReceipt.receipt_id,
              consumerOwnerReceipt.receipt_id,
            ],
          };
        },
      } : { observeQualityContextFn: observeRunnerQualityContext }),
      ...(provideRunnerReviewer ? {
        reviewQualityReconciliationFn: (request) => {
          assert(adapterRepo, "fixture repository was not captured before runner review");
          const expectedSource = fs.readFileSync(
            path.join(root, "quality", "live-scenarios", "artifacts", scenario.id, "good", "api.mjs"),
            "utf8",
          );
          const actualSource = fs.readFileSync(path.join(adapterRepo, ownershipPath), "utf8");
          const checks = deterministicRunnerReviewerChecks(request, { contentMatches: actualSource === expectedSource });
          if (mutateAfterRunnerReview) {
            fs.appendFileSync(path.join(adapterRepo, ownershipPath), "\n// post-review mutation must invalidate reconciliation\n", "utf8");
          }
          return {
            checks,
          };
        },
      } : {}),
    });
    assert(testContainment.invocationCount() > 0, `${riskClass} runner did not use explicit test containment`);
    const runDir = path.join(workspaceRoot, ".oc_harness", "runs", result.operational_run_id);
    if (adapterError !== null) throw adapterError;
    if (!provideRunnerReviewer) {
      assert.notEqual(result.status, "passed", "high-risk run passed without a trusted runner reviewer");
      assert(
        result.incomplete_evidence.includes("CONTEXT_RECONCILIATION_REVIEWER_UNTRUSTED"),
        JSON.stringify(result.incomplete_evidence),
      );
      return {
        workspaceRoot,
        runDir,
        result,
        bundle: null,
        checkCatalog,
        cleanup: () => fs.rmSync(workspaceRoot, { recursive: true, force: true }),
      };
    }
    if (mutateAfterRunnerReview) {
      assert.notEqual(result.status, "passed", "post-review source mutation incorrectly preserved a passed run");
      assert(
        result.incomplete_evidence.includes("CONTEXT_RECONCILIATION_FINAL_WORKSPACE_STALE"),
        JSON.stringify(result.incomplete_evidence),
      );
      return {
        workspaceRoot,
        runDir,
        result,
        bundle: null,
        checkCatalog,
        cleanup: () => fs.rmSync(workspaceRoot, { recursive: true, force: true }),
      };
    }
    assert.equal(result.status, "passed", JSON.stringify({
      incomplete_evidence: result.incomplete_evidence,
      adapter_classification: result.adapter_classification,
      failing_hidden_results: result.hidden_results.filter((entry) => entry.status !== "passed"),
    }));
    assert(fs.existsSync(path.join(runDir, "quality", "context-report.json")), "high context report was not published");
    const bundle = validateEngineeringQualityRunBundle(runDir);
    assert.equal(bundle.dossier.risk_class, riskClass);
    assert.equal(bundle.attestation.schema_version, 3);
    assert.equal(bundle.context_sufficiency_decision.status, "sufficient");
    assert.equal(bundle.context_reconciliation.status, "passed");
    const traceSnapshot = traceStore.inspectRun(result.operational_run_id);
    const reviewerJobs = traceSnapshot.jobs
      .filter((entry) => entry.request.agent === "reviewer");
    const adapterAuthoredReviewer = reviewerJobs.find((entry) => entry.request.task_id === finalReviewerResultId);
    const runnerReviewer = reviewerJobs.find((entry) => entry.request.assigned_scope.startsWith("Review runner-observed final diff "));
    assert(adapterAuthoredReviewer, "fixture did not exercise an adapter-authored fake final reviewer job");
    assert(runnerReviewer, "runner did not create the authoritative final reviewer job");
    assert.notEqual(runnerReviewer.request.task_id, adapterAuthoredReviewer.request.task_id);
    assert(Date.parse(runnerReviewer.result.completed_at) >= Date.parse(adapterAuthoredReviewer.result.completed_at));
    return {
      workspaceRoot,
      runDir,
      result,
      bundle,
      traceSnapshot,
      checkCatalog,
      cleanup: () => fs.rmSync(workspaceRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    throw error;
  }
}

function writePrettyJson(file, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(file, text, "utf8");
  return Buffer.byteLength(text, "utf8");
}

function refingerprint(value) {
  const source = structuredClone(value);
  delete source.fingerprint;
  return { ...source, fingerprint: fingerprint(source) };
}

function writeLegacyAttestation(runDir, attestation) {
  const attestationPath = path.join(runDir, "quality", "attestation.json");
  const bytes = writePrettyJson(attestationPath, attestation);
  const manifestPath = path.join(runDir, "quality", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const descriptor = manifest.artifacts.find((entry) => entry.relative_path === "quality/attestation.json");
  descriptor.schema_version = 2;
  descriptor.fingerprint = attestation.fingerprint;
  descriptor.bytes = bytes;
  manifest.total_bytes = manifest.artifacts.reduce((total, entry) => total + entry.bytes, 0);
  writePrettyJson(manifestPath, refingerprint(manifest));
}

export function convertRunBundleToLegacyV2(runDir) {
  const qualityDir = path.join(runDir, "quality");
  const attestation = JSON.parse(fs.readFileSync(path.join(qualityDir, "attestation.json"), "utf8"));
  for (const key of ["context_strategy_id", "context_sufficiency_decision_fingerprint", "context_reconciliation_fingerprint"]) delete attestation[key];
  attestation.schema_version = 2;
  attestation.artifact_refs = attestation.artifact_refs.filter((entry) => !entry.value.startsWith("quality/context-"));
  const legacyAttestation = refingerprint(attestation);
  const manifestPath = path.join(qualityDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const removed = manifest.artifacts.filter((entry) => entry.relative_path.startsWith("quality/context-"));
  for (const descriptor of removed) fs.unlinkSync(path.join(runDir, ...descriptor.relative_path.split("/")));
  manifest.schema_version = 2;
  manifest.artifacts = manifest.artifacts.filter((entry) => !entry.relative_path.startsWith("quality/context-"));
  const attestationDescriptor = manifest.artifacts.find((entry) => entry.relative_path === "quality/attestation.json");
  attestationDescriptor.schema_version = 2;
  attestationDescriptor.fingerprint = legacyAttestation.fingerprint;
  attestationDescriptor.bytes = writePrettyJson(path.join(qualityDir, "attestation.json"), legacyAttestation);
  manifest.total_bytes = manifest.artifacts.reduce((total, entry) => total + entry.bytes, 0);
  writePrettyJson(manifestPath, refingerprint(manifest));
  return legacyAttestation;
}

function assertRunnerVisibleOracleMatrix({ scenario, dossier }) {
  const sidecar = loadQualityLiveScenarioSidecar({ root, scenario });
  const oracleContract = qualityLiveVisibleOracleContract({ scenario, sidecar });
  const fixture = path.join(root, ...scenario.repo_fixture.split("/"));
  const actualFixtureFingerprint = qualityLiveFixtureFingerprint(fixture);
  const workspaceFingerprint = fingerprint({ workspace: scenario.id, state: "preimplementation" });
  const result = (status, exitCode, checkId = stableCheckId(scenario.id, "preimplementation", 0), extra = {}) => ({
    check_id: checkId,
    status,
    exit_code: exitCode,
    stdout_chars: 0,
    stderr_chars: 0,
    ...extra,
  });
  const observation = (results, overrides = {}) => runnerVisibleOracleObservation({
    scenario,
    sidecar,
    results,
    actualFixtureFingerprint: overrides.actualFixtureFingerprint ?? actualFixtureFingerprint,
    workspaceFingerprintBefore: workspaceFingerprint,
    workspaceFingerprintAfter: overrides.workspaceFingerprintAfter ?? workspaceFingerprint,
    executionMetadata: overrides.executionMetadata ?? {
      timed_out: results?.[0]?.status === "timed_out",
      error_code: null,
      output_marker_fingerprint: oracleContract.assertion_marker_fingerprint,
      output_marker_count: results?.[0]?.status === "failed" ? 1 : 0,
    },
  });
  const receipt = (oracleObservation, dossierOverride = dossier) => runnerPreimplementationEvidence({
    dossier: dossierOverride,
    scenarioId: scenario.id,
    preimplementationOracleObservation: oracleObservation,
    traceSnapshot: { events: [], jobs: [] },
    trustedPlanChallengeResultIds: new Set(),
    evaluatedAt: new Date(Date.parse(dossier.finalized_at) + 1000).toISOString(),
  }).baseline_receipts[0];

  const failing = observation([result("failed", 1)]);
  const failingReceipt = receipt(failing);
  assert.equal(failingReceipt.status, "passed");
  assert.equal(failingReceipt.oracle_observation.observed_outcome, "failing_reproducer");
  assert.equal(failingReceipt.oracle_observation.reason_code, "matched_expected_failure");
  assert.equal(
    failingReceipt.oracle_observation.observed_failure_signature,
    failingReceipt.oracle_observation.expected_failure_signature,
  );

  const matrix = [
    ["green", observation([result("passed", 0)]), "failed", "unexpected_pass"],
    ["timeout", observation([result("timed_out", null)]), "blocked", "timed_out"],
    ["missing", observation([]), "blocked", "missing"],
    ["malformed", observation([{ status: "failed" }]), "blocked", "malformed"],
    ["unrelated", observation([result("failed", 1, `${scenario.id}.unrelated.1`)]), "blocked", "unrelated_failure"],
    ["unrelated-process-failure", observation([result("failed", 1)], { executionMetadata: {
      timed_out: false,
      error_code: "PROCESS_EXECUTION_FAILED",
      output_marker_fingerprint: oracleContract.assertion_marker_fingerprint,
      output_marker_count: 1,
    } }), "blocked", "unrelated_failure"],
    ["missing-marker", observation([result("failed", 1)], { executionMetadata: {
      timed_out: false,
      error_code: null,
      output_marker_fingerprint: oracleContract.assertion_marker_fingerprint,
      output_marker_count: 0,
    } }), "blocked", "unrelated_failure"],
    ["duplicate-marker", observation([result("failed", 1)], { executionMetadata: {
      timed_out: false,
      error_code: null,
      output_marker_fingerprint: oracleContract.assertion_marker_fingerprint,
      output_marker_count: 2,
    } }), "blocked", "unrelated_failure"],
    ["wrong-marker", observation([result("failed", 1)], { executionMetadata: {
      timed_out: false,
      error_code: null,
      output_marker_fingerprint: `sha256:${"0".repeat(64)}`,
      output_marker_count: 1,
    } }), "blocked", "unrelated_failure"],
    ["marker-metadata-missing", observation([result("failed", 1)], { executionMetadata: {
      timed_out: false,
      error_code: null,
    } }), "blocked", "unrelated_failure"],
    ["negative-exit", observation([result("failed", -1)]), "blocked", "unrelated_failure"],
    ["unexpected-exit", observation([result("failed", 2)]), "blocked", "unrelated_failure"],
    ["oversized-exit", observation([result("failed", 256)]), "blocked", "unrelated_failure"],
    ["oversized-marker-count", observation([result("failed", 1)], { executionMetadata: {
      timed_out: false,
      error_code: null,
      output_marker_fingerprint: oracleContract.assertion_marker_fingerprint,
      output_marker_count: 4097,
    } }), "blocked", "unrelated_failure"],
    ["fixture-mismatch", observation([result("failed", 1)], { actualFixtureFingerprint: "0".repeat(64) }), "blocked", "fixture_fingerprint_mismatch"],
    ["workspace-change", observation([result("failed", 1)], { workspaceFingerprintAfter: fingerprint({ workspace: scenario.id, state: "mutated" }) }), "blocked", "workspace_changed"],
  ];
  for (const [label, candidate, expectedStatus, reasonCode] of matrix) {
    const candidateReceipt = receipt(candidate);
    assert.equal(candidateReceipt.status, expectedStatus, `${label} baseline status`);
    assert.equal(candidateReceipt.oracle_observation.reason_code, reasonCode, `${label} baseline reason`);
    assert.notEqual(candidateReceipt.oracle_observation.observed_outcome, "failing_reproducer", `${label} fabricated a reproducer`);
  }

  const characterizationDossier = structuredClone(dossier);
  characterizationDossier.test_obligations = characterizationDossier.test_obligations.map((entry) => (
    entry.check_id === `${scenario.id}-baseline` ? { ...entry, kind: "characterization" } : entry
  ));
  const characterization = receipt(observation([result("passed", 0)]), characterizationDossier);
  assert.equal(characterization.status, "passed");
  assert.equal(characterization.oracle_observation.observed_outcome, "passing_characterization");
  assert.equal(characterization.oracle_observation.reason_code, "matched_passing_characterization");
  const failedCharacterization = receipt(failing, characterizationDossier);
  assert.equal(failedCharacterization.status, "failed");
  assert.equal(failedCharacterization.oracle_observation.reason_code, "unexpected_failure");

  const mismatchedObligationDossier = structuredClone(dossier);
  mismatchedObligationDossier.test_obligations = mismatchedObligationDossier.test_obligations.map((entry) => (
    entry.check_id === `${scenario.id}-baseline`
      ? { ...entry, command_or_mechanism: "runner-unrelated-command" }
      : entry
  ));
  const mismatched = receipt(failing, mismatchedObligationDossier);
  assert.equal(mismatched.status, "blocked");
  assert.equal(mismatched.oracle_observation.reason_code, "obligation_mismatch");
}

function assertRunnerReviewerConfigMapping() {
  const request = (testObligationIds) => ({
    planned_test_obligation_ids: ["TEST-config"],
    changed_paths: [{
      path: "config/runtime.json",
      kind: "config",
      ownership_ids: ["SLICE-config"],
      context_subject_ids: ["AREA-config"],
      test_obligation_ids: testObligationIds,
    }],
    unexpected_public_contracts: [],
    unexpected_dependency_directions: [],
    unexpected_side_effect_edges: [],
    unrelated_paths: [],
  });
  assert.equal(runnerReviewerChecks(request([])).critical_path_tests.status, "blocked");
  assert.equal(runnerReviewerChecks(request(["TEST-invented"])).critical_path_tests.status, "blocked");
  assert.equal(runnerReviewerChecks(request(["TEST-config"])).critical_path_tests.status, "passed");
}

async function main() {
  const run = await createDeterministicQualityRun({ profileRole: "candidate" });
  try {
    assert.equal(run.result.status, "passed", JSON.stringify(run.result.incomplete_evidence));
    assert(run.result.quality_outcomes?.complete, "runner did not derive complete quality outcomes");
    assert.equal(run.bundle.gate.status, "passed");
    const scenario = loadScenarioCorpus({ root }).scenarios
      .find((entry) => entry.id === "quality-small-local-control");
    assert(scenario, "quality-small-local-control scenario missing");
    const productionOptions = productionQualityScenarioRunOptions(root);
    assert.deepEqual(Object.keys(productionOptions).sort(), ["observeQualityContextFn", "sourceRoot"]);
    assert.equal(typeof productionOptions.observeQualityContextFn, "function");
    assert.equal(Object.hasOwn(productionOptions, "challengeQualityPlanFn"), false);
    assert.equal(Object.hasOwn(productionOptions, "reviewQualityReconciliationFn"), false);
    assert.equal(Object.hasOwn(productionOptions, "processContainmentFactory"), false);
    const forgedOracleRun = await createDeterministicQualityRun({ profileRole: "candidate", oracleMode: "forged-result" });
    try {
      assert.notEqual(forgedOracleRun.result.status, "passed");
      assert.equal(forgedOracleRun.bundle, null);
      assert(forgedOracleRun.result.incomplete_evidence.includes("QUALITY_BASELINE_ORACLE_UNTRUSTED"));
    } finally {
      forgedOracleRun.cleanup();
    }
    assertRunnerVisibleOracleMatrix({ scenario, dossier: run.bundle.dossier });
    assertRunnerReviewerConfigMapping();
    const baselineReceipt = run.bundle.preimplementation_evidence.baseline_receipts[0];
    assert.equal(baselineReceipt.status, "passed");
    assert.equal(baselineReceipt.oracle_observation.observed_outcome, "failing_reproducer");
    assert.equal(baselineReceipt.command_or_mechanism, scenario.visible_checks[0]);
    assert(run.result.visible_results.every((entry) => entry.status === "passed"), "the same visible oracle did not pass after the fix");
    const targets = [
      ...run.result.quality_outcomes.required_check_ids,
      ...run.result.quality_outcomes.required_mechanism_ids,
    ];
    assert.equal(new Set(targets).size, targets.length, "canonical runner target IDs are not unique");
    assert(targets.includes("quality-small-local-control-integration"));
    assert(targets.includes("quality-small-local-control-hidden-evaluation"));
    assert.equal(run.bundle.manifest.scenario_id, run.bundle.run.scenario_id);
    assert.equal(run.bundle.manifest.profile_role, run.bundle.run.profile_role);
    assert.equal(run.bundle.manifest.risk, run.bundle.run.risk);
    assert.equal(run.bundle.manifest.harness_fingerprint, run.bundle.run.harness_fingerprint);
    assert.equal(run.bundle.manifest.run_fingerprint, fingerprint(run.bundle.run));
    const tampered = structuredClone(run.bundle);
    assert.throws(
      () => createQualityOutcomes({ run_bundle: tampered, check_catalog: run.checkCatalog }),
      /QUALITY_BUNDLE_VALIDATION_REQUIRED/u,
      "unvalidated evidence clone was accepted",
    );

    const runPath = path.join(run.runDir, "run.json");
    const manifestPath = path.join(run.runDir, "quality", "manifest.json");
    const originalRunText = fs.readFileSync(runPath, "utf8");
    const originalManifestText = fs.readFileSync(manifestPath, "utf8");
    try {
      const profileMutatedRun = JSON.parse(originalRunText);
      profileMutatedRun.profile_role = "baseline";
      fs.writeFileSync(runPath, `${JSON.stringify(profileMutatedRun, null, 2)}\n`, "utf8");
      assert.throws(
        () => validateEngineeringQualityRunBundle(run.runDir),
        /QUALITY_BUNDLE_RUN_FINGERPRINT/u,
        "post-publication run.json profile_role mutation was accepted",
      );

      fs.writeFileSync(runPath, originalRunText, "utf8");
      const riskMutatedRun = JSON.parse(originalRunText);
      riskMutatedRun.risk = "high";
      const riskMutatedManifest = JSON.parse(originalManifestText);
      riskMutatedManifest.risk = "high";
      riskMutatedManifest.run_fingerprint = fingerprint(riskMutatedRun);
      const manifestFingerprintInput = { ...riskMutatedManifest };
      delete manifestFingerprintInput.fingerprint;
      riskMutatedManifest.fingerprint = fingerprint(manifestFingerprintInput);
      fs.writeFileSync(runPath, `${JSON.stringify(riskMutatedRun, null, 2)}\n`, "utf8");
      fs.writeFileSync(manifestPath, `${JSON.stringify(riskMutatedManifest, null, 2)}\n`, "utf8");
      assert.throws(
        () => validateEngineeringQualityRunBundle(run.runDir),
        /QUALITY_BUNDLE_RISK/u,
        "runner risk downgrade or dossier-risk mismatch was accepted",
      );
    } finally {
      fs.writeFileSync(runPath, originalRunText, "utf8");
      fs.writeFileSync(manifestPath, originalManifestText, "utf8");
    }

    for (const observerMode of ["null", "throws", "malformed"]) {
      const rejectedObserver = await createDeterministicQualityRun({ profileRole: "candidate", observerMode });
      try {
        assert.equal(rejectedObserver.bundle, null);
      } finally {
        rejectedObserver.cleanup();
      }
    }
    for (const reviewerMode of ["null", "throws", "malformed"]) {
      const rejectedReviewer = await createDeterministicQualityRun({ profileRole: "candidate", reviewerMode });
      try {
        assert.equal(rejectedReviewer.bundle, null);
      } finally {
        rejectedReviewer.cleanup();
      }
    }

    const legacyRun = await createDeterministicQualityRun({ profileRole: "candidate", runIdentity: "legacy-v2-quality-run" });
    try {
      const legacy = convertRunBundleToLegacyV2(legacyRun.runDir);
      const validatedLegacy = validateEngineeringQualityRunBundle(legacyRun.runDir);
      assert.equal(validatedLegacy.manifest.schema_version, 2);
      const legacyOutcome = createQualityOutcomes({
        run_bundle: validatedLegacy,
        check_catalog: legacyRun.checkCatalog,
      });
      assert.equal(legacyOutcome.complete, true, "validated legacy v2 bundle did not reach acceptance outcome derivation");
      for (const [mutate, code] of [
        [(value) => { value.teardown_verified = false; }, "QUALITY_TEARDOWN_UNVERIFIED"],
        [(value) => { value.integrated_verification_sequence = value.last_implementation_action_sequence; }, "QUALITY_ATTESTATION_ORDER"],
        [(value) => { value.artifact_refs = value.artifact_refs.filter((entry) => entry.value !== "quality/integrated-verification-evidence.json"); }, "QUALITY_ATTESTATION_INTEGRATED_EVIDENCE"],
      ]) {
        const candidate = structuredClone(legacy);
        mutate(candidate);
        writeLegacyAttestation(legacyRun.runDir, refingerprint(candidate));
        assert.throws(
          () => validateEngineeringQualityRunBundle(legacyRun.runDir),
          (error) => error?.code === code,
          `legacy v2 semantic regression was accepted: ${code}`,
        );
        writeLegacyAttestation(legacyRun.runDir, legacy);
      }
    } finally {
      legacyRun.cleanup();
    }
    const highRun = await createDeterministicHighQualityRun({ profileRole: "candidate" });
    try {
      assert.equal(highRun.result.status, "passed");
      assert.equal(highRun.result.quality_outcomes?.complete, true);
      assert.equal(highRun.result.quality_outcomes?.context_metrics.risk_class, "high");
      assert.equal(highRun.result.quality_outcomes?.context_metrics.required_wide_category_coverage_basis_points, 10000);
      assert.equal(highRun.result.quality_outcomes?.context_metrics.critical_path_deep_analysis_coverage_basis_points, 10000);
      assert.equal(highRun.bundle.context_receipt_index.receipts.length, 5);
      assert.deepEqual(
        highRun.traceSnapshot.context_receipts
          .filter((entry) => entry.source_kind === "file")
          .flatMap((entry) => entry.relative_paths)
          .sort(),
        ["README.md", "src/api.mjs", "src/consumer.mjs", "test/visible.test.mjs"],
        "runner-owned quality context reads were not mirrored into path-specific trace receipts",
      );
      assert.deepEqual(
        highRun.bundle.context_receipt_index.receipts.map((entry) => entry.tool_id),
        ["context_outline", "context_read", "context_read", "context_read", "context_read"],
      );
      assert.equal(highRun.bundle.context_reconciliation.status, "passed");
    } finally {
      highRun.cleanup();
    }
    for (const [planChallengeMode, expectedCode] of [
      ["omitted", "QUALITY_PLAN_CHALLENGE_UNTRUSTED"],
      ["null", "QUALITY_PLAN_CHALLENGE_UNTRUSTED"],
      ["throws", "QUALITY_PLAN_CHALLENGE_TEST_THROW"],
      ["malformed", "QUALITY_PLAN_CHALLENGE_UNTRUSTED"],
    ]) {
      await assert.rejects(
        () => createDeterministicHighQualityRun({ profileRole: "candidate", planChallengeMode }),
        (error) => error instanceof ContractError && error.code === expectedCode,
        `${planChallengeMode} challenge callback did not fail closed with ${expectedCode}`,
      );
    }
    const postReviewMutationRun = await createDeterministicHighQualityRun({
      profileRole: "candidate",
      mutateAfterRunnerReview: true,
    });
    try {
      assert.equal(postReviewMutationRun.bundle, null);
      assert(
        postReviewMutationRun.result.incomplete_evidence.includes("CONTEXT_RECONCILIATION_FINAL_WORKSPACE_STALE"),
      );
    } finally {
      postReviewMutationRun.cleanup();
    }
    const missingRunnerReviewerRun = await createDeterministicHighQualityRun({
      profileRole: "candidate",
      provideRunnerReviewer: false,
    });
    try {
      assert.equal(missingRunnerReviewerRun.bundle, null);
      assert(
        missingRunnerReviewerRun.result.incomplete_evidence.includes("CONTEXT_RECONCILIATION_REVIEWER_UNTRUSTED"),
      );
    } finally {
      missingRunnerReviewerRun.cleanup();
    }
    const criticalRun = await createDeterministicHighQualityRun({ profileRole: "candidate", riskClass: "critical" });
    try {
      assert.equal(criticalRun.result.status, "passed");
      assert.equal(criticalRun.bundle.dossier.risk_class, "critical");
      assert.equal(criticalRun.bundle.context_sufficiency_decision.strategy_id, "critical-wide-deep-v1");
      assert(criticalRun.bundle.context_receipt_index.receipts.some((entry) => entry.tool_id === "context_related"));
      assert(Object.values(criticalRun.result.quality_outcomes?.context_hard_gates ?? {}).every(Boolean));
    } finally {
      criticalRun.cleanup();
    }
    console.log("Model-neutral quality live-runner integration checks passed (real sidecar/coordinator/runner path; no LLM or network).");
  } finally {
    run.cleanup();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
