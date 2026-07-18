import { normalizeRelativePath } from "../feedback/privacy.mjs";
import { assertEnum } from "../feedback/contracts.mjs";
import { validateContextSufficiencyDecision } from "./context-sufficiency.mjs";
import {
  classifyContextPathKind,
  contextPathKindRequiresVerificationMapping,
} from "./context-path-kind.mjs";
import { validateEngineeringDossier } from "./dossier.mjs";
import {
  postEditArchitectureEvidenceHasAuthoritativeGraphDelta,
  validatePostEditArchitectureEvidence,
} from "./post-architecture-evidence.mjs";
import { engineeringDossierAnalysisFingerprint, validateWholeSystemContextReport } from "./whole-system-context-report.mjs";
import {
  ContractError,
  assertArray,
  assertBoolean,
  assertFingerprint,
  assertIso,
  assertPlain,
  assertStableTypedId,
  assertString,
  assertStringArray,
  assertUniqueIds,
  canonicalJson,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

export const CONTEXT_RECONCILIATION_SCHEMA_VERSION = 1;
export const REVIEWER_RECONCILIATION_EVIDENCE_SCHEMA_VERSION = 1;
export const CONTEXT_RECONCILIATION_REASON_CODES = Object.freeze([
  "CONTEXT_RECONCILIATION_DECISION_NOT_SUFFICIENT",
  "CONTEXT_RECONCILIATION_CHANGED_PATH_UNOWNED",
  "CONTEXT_RECONCILIATION_CHANGED_PATH_UNREPRESENTED",
  "CONTEXT_RECONCILIATION_CRITICAL_TEST_MISSING",
  "CONTEXT_RECONCILIATION_UNEXPECTED_PUBLIC_CONTRACT",
  "CONTEXT_RECONCILIATION_UNEXPECTED_DEPENDENCY",
  "CONTEXT_RECONCILIATION_UNEXPECTED_SIDE_EFFECT",
  "CONTEXT_RECONCILIATION_UNRELATED_WRITE",
  "CONTEXT_RECONCILIATION_REVIEWER_EVIDENCE_MISSING",
  "CONTEXT_RECONCILIATION_REVIEWER_EVIDENCE_STALE",
  "CONTEXT_RECONCILIATION_EXTRACTOR_EVIDENCE_MISSING",
  "CONTEXT_RECONCILIATION_GRAPH_DELTA_MISSING",
  "CONTEXT_RECONCILIATION_GRAPH_DELTA_TRUNCATED",
  "CONTEXT_RECONCILIATION_EXTRACTOR_FACT_MISMATCH",
  "CONTEXT_RECONCILIATION_UNPLANNED_HIGH_IMPACT",
  "CONTEXT_RECONCILIATION_GRAPH_TRUST_REGRESSION",
  "CONTEXT_RECONCILIATION_FINAL_WORKSPACE_STALE",
]);

const RECONCILIATION_KEYS = Object.freeze([
  "schema_version", "reconciliation_id", "session_key", "run_id", "task_id", "risk_class", "strategy_id",
  "context_decision_id", "context_decision_fingerprint", "context_report_id", "context_report_fingerprint",
  "impact_graph_id", "impact_graph_fingerprint", "pre_workspace_fingerprint", "final_workspace_fingerprint",
  "final_diff_fingerprint", "evidence_mode", "graph_completeness", "post_architecture_evidence_fingerprint",
  "reviewer_evidence_fingerprint", "changed_paths", "verified_post_mutation_test_obligation_ids", "unexpected_public_contracts",
  "unexpected_dependency_directions", "unexpected_side_effect_edges", "unrelated_paths", "unplanned_items",
  "status", "reason_codes", "invalidates_context_decision", "reconciled_at", "fingerprint",
]);
const REVIEWER_KEYS = Object.freeze([
  "schema_version", "reviewer_result_id", "session_key", "context_decision_fingerprint",
  "pre_workspace_fingerprint", "final_workspace_fingerprint", "final_diff_fingerprint",
  "changed_path_manifest_fingerprint", "graph_completeness", "checks", "unplanned_item_ids",
  "completed_at", "fingerprint",
]);
const CHECK_KEYS = Object.freeze([
  "changed_path_ownership", "public_contracts", "dependency_directions", "side_effect_edges",
  "critical_path_tests", "unrelated_changes",
]);

function canonicalPath(value, label) {
  assertSchemaBoundedString(value, label, { maxLength: 1000 });
  const normalized = normalizeRelativePath(value, label);
  if (normalized !== value) throw new ContractError("CONTEXT_RECONCILIATION_PATH", `${label} must use canonical workspace-relative separators`);
  return value;
}

function assertSchemaBoundedString(value, label, { maxLength, nullable = false } = {}) {
  assertString(value, label, { nullable, maxBytes: maxLength * 4 });
  if (value === null) return value;
  if ([...value].length > maxLength) {
    throw new ContractError("QUALITY_STRING_BOUNDS", `${label} must contain at most ${maxLength} Unicode code points`);
  }
  return value;
}

function assertSchemaBoundedStringArray(value, label, { max, maxLength, path = false } = {}) {
  assertStringArray(value, label, { max, maxBytes: maxLength * 4, path });
  value.forEach((entry, index) => {
    if (path) canonicalPath(entry, `${label}[${index}]`);
    else assertSchemaBoundedString(entry, `${label}[${index}]`, { maxLength });
  });
  return value;
}

export const classifyContextReconciliationPathKind = classifyContextPathKind;

function assertCurrentTypedId(value, prefix, label) {
  assertStableTypedId(value, prefix, label);
  if (value.length === prefix.length + 1) {
    throw new ContractError("QUALITY_TYPED_ID", `${label} must include a non-empty suffix after ${prefix}-`);
  }
}

function validateChangedPath(value, label) {
  assertPlain(value, label);
  const keys = ["path", "kind", "ownership_ids", "context_subject_ids", "test_obligation_ids"];
  exact(value, keys, keys, label);
  canonicalPath(value.path, `${label}.path`);
  assertEnum(value.kind, ["source", "test", "schema", "config", "documentation", "fixture", "other"], `${label}.kind`);
  const expectedKind = classifyContextReconciliationPathKind(value.path);
  if (value.kind !== expectedKind) {
    throw new ContractError("CONTEXT_RECONCILIATION_PATH_KIND", `${label}.kind must be runner-derived as ${expectedKind}`);
  }
  for (const key of keys.filter((entry) => entry.endsWith("_ids"))) {
    assertSchemaBoundedStringArray(value[key], `${label}.${key}`, { max: 64, maxLength: 512 });
  }
}

function validateUnplannedItem(value, label) {
  assertPlain(value, label);
  const keys = ["id", "kind", "severity", "path", "description", "disposition", "analysis_update_id"];
  exact(value, keys, keys, label);
  assertCurrentTypedId(value.id, "UNPLANNED", `${label}.id`);
  assertEnum(value.kind, ["node", "edge", "contract", "side_effect", "dependency", "path", "coverage", "unknown", "exclusion", "boundary"], `${label}.kind`);
  assertEnum(value.severity, ["low", "medium", "high", "critical"], `${label}.severity`);
  if (value.path !== null) canonicalPath(value.path, `${label}.path`);
  assertSchemaBoundedString(value.description, `${label}.description`, { maxLength: 2000 });
  assertEnum(value.disposition, ["planned_equivalent", "accepted_low_impact", "requires_reanalysis"], `${label}.disposition`);
  assertSchemaBoundedString(value.analysis_update_id, `${label}.analysis_update_id`, { nullable: true, maxLength: 512 });
  if ((value.disposition === "requires_reanalysis") !== (value.analysis_update_id === null)) {
    throw new ContractError("CONTEXT_RECONCILIATION_UNPLANNED_DISPOSITION", `${label} reanalysis must not claim a post-hoc analysis update`);
  }
}

function changedPathManifestFingerprint(changedPaths) {
  return fingerprint([...changedPaths].sort((left, right) => left.path.localeCompare(right.path)));
}

function validateReviewerCheck(value, label) {
  assertPlain(value, label);
  exact(value, ["status", "finding_ids"], ["status", "finding_ids"], label);
  assertEnum(value.status, ["passed", "blocked"], `${label}.status`);
  assertStringArray(value.finding_ids, `${label}.finding_ids`, { max: 64, maxBytes: 512 });
  if ((value.status === "blocked") !== (value.finding_ids.length > 0)) throw new ContractError("CONTEXT_RECONCILIATION_REVIEW_CHECK", `${label} blocked status must identify findings`);
}

function reviewerFingerprintInput(value) {
  const copy = JSON.parse(canonicalJson(value));
  delete copy.fingerprint;
  return copy;
}

export function validateReviewerReconciliationEvidence(value) {
  assertPlain(value, "reviewer reconciliation evidence");
  exact(value, REVIEWER_KEYS, REVIEWER_KEYS, "reviewer reconciliation evidence");
  if (value.schema_version !== REVIEWER_RECONCILIATION_EVIDENCE_SCHEMA_VERSION) throw new ContractError("CONTEXT_RECONCILIATION_REVIEWER_SCHEMA", "reviewer reconciliation evidence schema is unsupported");
  assertString(value.reviewer_result_id, "reviewer reconciliation evidence.reviewer_result_id", { maxBytes: 256 });
  assertString(value.session_key, "reviewer reconciliation evidence.session_key", { maxBytes: 128 });
  for (const key of ["context_decision_fingerprint", "pre_workspace_fingerprint", "final_workspace_fingerprint", "final_diff_fingerprint", "changed_path_manifest_fingerprint", "fingerprint"]) assertFingerprint(value[key], `reviewer reconciliation evidence.${key}`);
  if (value.graph_completeness !== "not_claimed") throw new ContractError("CONTEXT_RECONCILIATION_COMPLETENESS", "reviewer evidence cannot claim computational graph completeness");
  assertPlain(value.checks, "reviewer reconciliation evidence.checks");
  exact(value.checks, CHECK_KEYS, CHECK_KEYS, "reviewer reconciliation evidence.checks");
  for (const key of CHECK_KEYS) validateReviewerCheck(value.checks[key], `reviewer reconciliation evidence.checks.${key}`);
  assertStringArray(value.unplanned_item_ids, "reviewer reconciliation evidence.unplanned_item_ids", { max: 128, maxBytes: 512 });
  assertIso(value.completed_at, "reviewer reconciliation evidence.completed_at");
  const expected = fingerprint(reviewerFingerprintInput(value));
  if (!fingerprintsEqual(value.fingerprint, expected)) throw new ContractError("CONTEXT_RECONCILIATION_REVIEWER_FINGERPRINT", "reviewer reconciliation evidence fingerprint is invalid");
  return value;
}

export function createReviewerReconciliationEvidence({
  reviewer_result_id: reviewerResultId,
  session_key: sessionKey,
  context_decision: contextDecision,
  final_workspace_fingerprint: finalWorkspaceFingerprint,
  final_diff_fingerprint: finalDiffFingerprint,
  changed_paths: changedPaths,
  checks,
  unplanned_item_ids: unplannedItemIds = [],
  completed_at: completedAt,
} = {}) {
  validateContextSufficiencyDecision(contextDecision);
  assertArray(changedPaths, "reviewer changed_paths", { max: 256, item: validateChangedPath });
  const source = {
    schema_version: REVIEWER_RECONCILIATION_EVIDENCE_SCHEMA_VERSION,
    reviewer_result_id: reviewerResultId,
    session_key: sessionKey,
    context_decision_fingerprint: contextDecision.fingerprint,
    pre_workspace_fingerprint: contextDecision.workspace_fingerprint,
    final_workspace_fingerprint: finalWorkspaceFingerprint,
    final_diff_fingerprint: finalDiffFingerprint,
    changed_path_manifest_fingerprint: changedPathManifestFingerprint(changedPaths),
    graph_completeness: "not_claimed",
    checks: JSON.parse(canonicalJson(checks)),
    unplanned_item_ids: [...new Set(unplannedItemIds)].sort(),
    completed_at: completedAt,
  };
  const evidence = deepFrozenClone({ ...source, fingerprint: fingerprint(source) }, "reviewer reconciliation evidence");
  validateReviewerReconciliationEvidence(evidence);
  return evidence;
}

function reconciliationFingerprintInput(value) {
  const copy = JSON.parse(canonicalJson(value));
  delete copy.fingerprint;
  return copy;
}

export function validateContextReconciliation(value) {
  assertPlain(value, "context reconciliation");
  exact(value, RECONCILIATION_KEYS, RECONCILIATION_KEYS, "context reconciliation");
  if (value.schema_version !== CONTEXT_RECONCILIATION_SCHEMA_VERSION) throw new ContractError("CONTEXT_RECONCILIATION_SCHEMA", "context reconciliation schema is unsupported");
  assertCurrentTypedId(value.reconciliation_id, "CTXREC", "context reconciliation.reconciliation_id");
  for (const key of ["session_key", "run_id", "task_id", "context_decision_id"]) {
    assertSchemaBoundedString(value[key], `context reconciliation.${key}`, { maxLength: 256 });
  }
  assertEnum(value.risk_class, ["standard-lite", "high", "critical"], "context reconciliation.risk_class");
  assertEnum(value.strategy_id, ["standard-lite-local-v1", "high-wide-deep-v1", "critical-wide-deep-v1"], "context reconciliation.strategy_id");
  for (const key of ["context_decision_fingerprint", "pre_workspace_fingerprint", "final_workspace_fingerprint", "final_diff_fingerprint", "fingerprint"]) assertFingerprint(value[key], `context reconciliation.${key}`);
  for (const key of ["context_report_id", "impact_graph_id"]) {
    assertSchemaBoundedString(value[key], `context reconciliation.${key}`, { nullable: true, maxLength: 256 });
  }
  for (const key of ["context_report_fingerprint", "impact_graph_fingerprint", "post_architecture_evidence_fingerprint", "reviewer_evidence_fingerprint"]) if (value[key] !== null) assertFingerprint(value[key], `context reconciliation.${key}`);
  assertEnum(value.evidence_mode, ["extractor_grounded", "reviewer_grounded"], "context reconciliation.evidence_mode");
  assertEnum(value.graph_completeness, ["complete", "incomplete", "not_claimed"], "context reconciliation.graph_completeness");
  if (value.evidence_mode === "extractor_grounded") {
    if (value.reviewer_evidence_fingerprint !== null || value.graph_completeness === "not_claimed") throw new ContractError("CONTEXT_RECONCILIATION_EVIDENCE_MODE", "extractor-grounded reconciliation allows only extractor evidence and an explicit graph-completeness classification");
    if (value.status === "passed" && value.graph_completeness !== "complete") throw new ContractError("CONTEXT_RECONCILIATION_COMPLETENESS", "passed extractor-grounded reconciliation requires a complete machine-derived graph delta");
  } else if (value.post_architecture_evidence_fingerprint !== null || value.graph_completeness !== "not_claimed") {
    throw new ContractError("CONTEXT_RECONCILIATION_EVIDENCE_MODE", "reviewer-grounded reconciliation requires only reviewer evidence and must not claim graph completeness");
  }
  assertArray(value.changed_paths, "context reconciliation.changed_paths", { max: 256, item: validateChangedPath });
  if (new Set(value.changed_paths.map((entry) => entry.path)).size !== value.changed_paths.length) throw new ContractError("CONTEXT_RECONCILIATION_PATH_DUPLICATE", "changed path manifest contains duplicates");
  assertSchemaBoundedStringArray(value.verified_post_mutation_test_obligation_ids, "context reconciliation.verified_post_mutation_test_obligation_ids", { max: 256, maxLength: 512 });
  if (canonicalJson(value.verified_post_mutation_test_obligation_ids) !== canonicalJson([...new Set(value.verified_post_mutation_test_obligation_ids)].sort())) {
    throw new ContractError("CONTEXT_RECONCILIATION_TEST_EVIDENCE", "verified post-mutation test obligation ids must be sorted and unique");
  }
  for (const key of ["unexpected_public_contracts", "unexpected_dependency_directions", "unexpected_side_effect_edges", "unrelated_paths", "reason_codes"]) {
    assertSchemaBoundedStringArray(value[key], `context reconciliation.${key}`, { max: 256, maxLength: 1000, path: key === "unrelated_paths" });
  }
  for (const code of value.reason_codes) assertEnum(code, CONTEXT_RECONCILIATION_REASON_CODES, "context reconciliation reason code");
  assertArray(value.unplanned_items, "context reconciliation.unplanned_items", { max: 128, item: validateUnplannedItem });
  assertUniqueIds(value.unplanned_items, "context reconciliation.unplanned_items");
  assertEnum(value.status, ["passed", "blocked"], "context reconciliation.status");
  assertBoolean(value.invalidates_context_decision, "context reconciliation.invalidates_context_decision");
  if ((value.status === "passed") !== (value.reason_codes.length === 0)) throw new ContractError("CONTEXT_RECONCILIATION_STATUS", "passed reconciliation must have no reasons");
  if (value.reason_codes.includes("CONTEXT_RECONCILIATION_GRAPH_TRUST_REGRESSION") && !value.invalidates_context_decision) {
    throw new ContractError("CONTEXT_RECONCILIATION_INVALIDATION", "graph trust regressions must invalidate the pre-edit context decision");
  }
  if (value.evidence_mode === "extractor_grounded" && value.graph_completeness === "incomplete"
    && !value.reason_codes.some((code) => [
      "CONTEXT_RECONCILIATION_EXTRACTOR_EVIDENCE_MISSING",
      "CONTEXT_RECONCILIATION_GRAPH_DELTA_MISSING",
      "CONTEXT_RECONCILIATION_GRAPH_DELTA_TRUNCATED",
    ].includes(code))) {
    throw new ContractError("CONTEXT_RECONCILIATION_COMPLETENESS", "incomplete extractor reconciliation must identify the missing or truncated graph evidence");
  }
  if (value.evidence_mode === "extractor_grounded" && value.post_architecture_evidence_fingerprint === null
    && !value.reason_codes.includes("CONTEXT_RECONCILIATION_EXTRACTOR_EVIDENCE_MISSING")) {
    throw new ContractError("CONTEXT_RECONCILIATION_EVIDENCE_MODE", "missing extractor evidence must block with an explicit reason");
  }
  if (value.evidence_mode === "reviewer_grounded" && value.reviewer_evidence_fingerprint === null
    && !value.reason_codes.includes("CONTEXT_RECONCILIATION_REVIEWER_EVIDENCE_MISSING")) {
    throw new ContractError("CONTEXT_RECONCILIATION_EVIDENCE_MODE", "missing reviewer evidence must block with an explicit reason");
  }
  assertIso(value.reconciled_at, "context reconciliation.reconciled_at");
  const expected = fingerprint(reconciliationFingerprintInput(value));
  if (!fingerprintsEqual(value.fingerprint, expected)) throw new ContractError("CONTEXT_RECONCILIATION_FINGERPRINT", "context reconciliation fingerprint is invalid");
  return value;
}

function addReason(reasons, code) {
  if (!reasons.includes(code)) reasons.push(code);
}

function scopeContainsPath(scope, changedPath, { container = false } = {}) {
  if (changedPath === scope) return true;
  return container && changedPath.startsWith(`${scope}/`);
}

function reconciliationReferences(dossier, contextReport, verifiedPostMutationTestObligationIds) {
  const areas = new Map(dossier.affected_areas.map((entry) => [entry.id, entry]));
  const slices = new Map(dossier.implementation_slices.map((entry) => [entry.id, entry]));
  const obligations = new Map(dossier.test_obligations.map((entry) => [entry.id, entry]));
  const scoped = new Map([
    ...dossier.invariants,
    ...dossier.edge_cases,
    ...dossier.failure_modes,
    ...dossier.counterexamples,
    ...dossier.test_obligations,
  ].map((entry) => [entry.id, entry]));
  const graph = dossier.impact_graph;
  const nodes = new Map((graph?.nodes ?? []).map((entry) => [entry.id, entry]));
  const edges = new Map((graph?.edges ?? []).map((entry) => [entry.id, entry]));
  const affectedPaths = new Map((graph?.affected_paths ?? []).map((entry) => [entry.id, entry]));
  const excluded = new Map((graph?.excluded_siblings ?? []).map((entry) => [entry.id, entry]));
  const claims = new Map((contextReport?.claims ?? []).map((entry) => [entry.id, entry]));
  const containerPaths = new Set([
    ...dossier.affected_areas.filter((entry) => entry.node_kind === "repository").map((entry) => entry.path),
    ...(graph?.nodes ?? []).filter((entry) => entry.kind === "repository").map((entry) => entry.path),
  ]);

  const scopedEntityCovers = (id, changedPath, seen = new Set()) => {
    if (seen.has(id)) return false;
    seen.add(id);
    const area = areas.get(id);
    if (area) return scopeContainsPath(area.path, changedPath, { container: area.node_kind === "repository" });
    const entity = scoped.get(id);
    return entity?.scope_ids?.some((scopeId) => scopedEntityCovers(scopeId, changedPath, seen)) ?? false;
  };
  const nodeCovers = (id, changedPath) => {
    const node = nodes.get(id);
    return typeof node?.path === "string" && scopeContainsPath(node.path, changedPath, { container: node.kind === "repository" });
  };
  const subjectCovers = (id, changedPath, seen = new Set()) => {
    if (seen.has(id)) return false;
    seen.add(id);
    if (dossier.risk_class === "standard-lite" && scopedEntityCovers(id, changedPath)) return true;
    if (nodeCovers(id, changedPath)) return true;
    const edge = edges.get(id);
    if (edge && (nodeCovers(edge.from, changedPath) || nodeCovers(edge.to, changedPath))) return true;
    const affectedPath = affectedPaths.get(id);
    if (affectedPath?.node_ids.some((nodeId) => nodeCovers(nodeId, changedPath))) return true;
    const sibling = excluded.get(id);
    if (sibling && scopeContainsPath(sibling.path, changedPath)) return true;
    const claim = claims.get(id);
    return claim?.subject_ids.some((subjectId) => subjectCovers(subjectId, changedPath, seen)) ?? false;
  };
  const ownershipCovers = (id, changedPath) => {
    const slice = slices.get(id);
    if (slice) return slice.write_scope.some((scope) => scopeContainsPath(scope, changedPath, { container: containerPaths.has(scope) }));
    return scopedEntityCovers(id, changedPath);
  };
  const obligationCovers = (id, changedPath) => {
    const obligation = obligations.get(id);
    return obligation !== undefined
      && obligation.required === true
      && ["slice", "integration"].includes(obligation.phase)
      && verifiedPostMutationTestObligationIds.has(id)
      && obligation.scope_ids.length > 0
      && obligation.scope_ids.some((scopeId) => scopedEntityCovers(scopeId, changedPath));
  };
  return { ownershipCovers, subjectCovers, obligationCovers };
}

export function reconcileFinalBlastRadius({
  reconciliation_id: reconciliationId,
  session_key: sessionKey,
  context_decision: contextDecision,
  dossier,
  context_report: contextReport = null,
  final_workspace_fingerprint: finalWorkspaceFingerprint,
  changed_paths: changedPaths,
  unexpected_public_contracts: unexpectedPublicContracts = [],
  unexpected_dependency_directions: unexpectedDependencyDirections = [],
  unexpected_side_effect_edges: unexpectedSideEffectEdges = [],
  unrelated_paths: unrelatedPaths = [],
  unplanned_items: unplannedItems = [],
  evidence_mode: evidenceMode,
  post_architecture_evidence: postArchitectureEvidence = null,
  reviewer_evidence: reviewerEvidence = null,
  verified_post_mutation_test_obligation_ids: verifiedPostMutationTestObligationIds,
  reconciled_at: reconciledAt,
} = {}) {
  validateContextSufficiencyDecision(contextDecision);
  validateEngineeringDossier(dossier);
  if (dossier.dossier_id !== contextDecision.dossier_id
    || dossier.run_id !== contextDecision.run_id
    || dossier.task_id !== contextDecision.task_id
    || !fingerprintsEqual(engineeringDossierAnalysisFingerprint(dossier), contextDecision.dossier_analysis_fingerprint)) {
    throw new ContractError("CONTEXT_RECONCILIATION_BINDING", "reconciliation dossier is not the dossier bound to the context decision");
  }
  if (["high", "critical"].includes(contextDecision.risk_class)) {
    validateWholeSystemContextReport(contextReport, { dossier, impactGraph: dossier.impact_graph });
    if (contextReport.report_id !== contextDecision.report_id
      || !fingerprintsEqual(contextReport.fingerprint, contextDecision.report_fingerprint)) {
      throw new ContractError("CONTEXT_RECONCILIATION_BINDING", "reconciliation report is not the report bound to the context decision");
    }
  } else if (contextReport !== null) {
    throw new ContractError("CONTEXT_RECONCILIATION_BINDING", "standard-lite reconciliation must not bind a whole-system report");
  }
  assertFingerprint(finalWorkspaceFingerprint, "final workspace fingerprint");
  assertArray(changedPaths, "changed paths", { max: 256, item: validateChangedPath });
  assertArray(unplannedItems, "unplanned items", { max: 128, item: validateUnplannedItem });
  assertStringArray(verifiedPostMutationTestObligationIds, "verified post-mutation test obligation ids", { max: 256, maxBytes: 512 });
  for (const [value, label, pathValue] of [
    [unexpectedPublicContracts, "unexpected public contracts", false],
    [unexpectedDependencyDirections, "unexpected dependency directions", false],
    [unexpectedSideEffectEdges, "unexpected side-effect edges", false],
    [unrelatedPaths, "unrelated paths", true],
  ]) assertStringArray(value, label, { max: 256, maxBytes: 1000, path: pathValue });
  const normalizedChangedPaths = JSON.parse(canonicalJson(changedPaths)).sort((left, right) => left.path.localeCompare(right.path));
  const normalizeStrings = (value) => [...new Set(value)].sort();
  const normalizedVerifiedPostMutationTestObligationIds = normalizeStrings(verifiedPostMutationTestObligationIds);
  const normalizedCallerFacts = {
    unexpectedPublicContracts: normalizeStrings(unexpectedPublicContracts),
    unexpectedDependencyDirections: normalizeStrings(unexpectedDependencyDirections),
    unexpectedSideEffectEdges: normalizeStrings(unexpectedSideEffectEdges),
    unplannedItems: JSON.parse(canonicalJson(unplannedItems)).sort((left, right) => left.id.localeCompare(right.id)),
  };
  const reasons = [];
  let effectiveFacts = normalizedCallerFacts;
  let postArchitectureFingerprint = null;
  let reviewerFingerprint = null;
  let graphCompleteness;
  let graphTrustRegressions = [];
  if (evidenceMode === "extractor_grounded") {
    graphCompleteness = "incomplete";
    effectiveFacts = {
      unexpectedPublicContracts: [],
      unexpectedDependencyDirections: [],
      unexpectedSideEffectEdges: [],
      unplannedItems: [],
    };
    if (!postArchitectureEvidence?.fingerprint) addReason(reasons, "CONTEXT_RECONCILIATION_EXTRACTOR_EVIDENCE_MISSING");
    else {
      validatePostEditArchitectureEvidence(postArchitectureEvidence);
      postArchitectureFingerprint = postArchitectureEvidence.fingerprint;
      const workspaceCurrent = fingerprintsEqual(postArchitectureEvidence.final_workspace_fingerprint, finalWorkspaceFingerprint);
      const authoritative = postEditArchitectureEvidenceHasAuthoritativeGraphDelta(postArchitectureEvidence);
      const plannedGraphCurrent = authoritative
        && dossier.impact_graph !== null
        && fingerprintsEqual(postArchitectureEvidence.planned_graph_fingerprint, dossier.impact_graph.fingerprint)
        && fingerprintsEqual(postArchitectureEvidence.planned_graph_fingerprint, contextDecision.impact_graph_fingerprint);
      if (!workspaceCurrent || postArchitectureEvidence.architecture_evaluation.status !== "passed") {
        addReason(reasons, "CONTEXT_RECONCILIATION_EXTRACTOR_EVIDENCE_MISSING");
      }
      if (!authoritative || !plannedGraphCurrent) {
        addReason(reasons, "CONTEXT_RECONCILIATION_GRAPH_DELTA_MISSING");
        effectiveFacts = {
          unexpectedPublicContracts: [],
          unexpectedDependencyDirections: [],
          unexpectedSideEffectEdges: [],
          unplannedItems: [],
        };
      } else if (workspaceCurrent) {
        const delta = postArchitectureEvidence.graph_delta;
        effectiveFacts = {
          unexpectedPublicContracts: [...delta.unexpected_public_contracts],
          unexpectedDependencyDirections: [...delta.unexpected_dependency_directions],
          unexpectedSideEffectEdges: [...delta.unexpected_side_effect_edges],
          unplannedItems: JSON.parse(canonicalJson(delta.unplanned_items)).sort((left, right) => left.id.localeCompare(right.id)),
        };
        graphTrustRegressions = [...delta.trust_regressions];
        graphCompleteness = delta.truncated ? "incomplete" : "complete";
        if (delta.truncated) addReason(reasons, "CONTEXT_RECONCILIATION_GRAPH_DELTA_TRUNCATED");
        if (graphTrustRegressions.length > 0) addReason(reasons, "CONTEXT_RECONCILIATION_GRAPH_TRUST_REGRESSION");
        if (canonicalJson(normalizedCallerFacts) !== canonicalJson(effectiveFacts)) {
          addReason(reasons, "CONTEXT_RECONCILIATION_EXTRACTOR_FACT_MISMATCH");
        }
      }
    }
  } else if (evidenceMode === "reviewer_grounded") {
    graphCompleteness = "not_claimed";
  } else throw new ContractError("CONTEXT_RECONCILIATION_EVIDENCE_MODE", `unsupported context reconciliation evidence mode ${evidenceMode}`);

  const references = reconciliationReferences(
    dossier,
    contextReport,
    new Set(normalizedVerifiedPostMutationTestObligationIds),
  );
  const plannedPathCoverage = normalizedChangedPaths.map((entry) => ({
    entry,
    ownershipCovered: entry.ownership_ids.length > 0
      && entry.ownership_ids.every((id) => references.ownershipCovers(id, entry.path)),
    contextCovered: entry.context_subject_ids.length > 0
      && entry.context_subject_ids.every((id) => references.subjectCovers(id, entry.path)),
  }));
  const normalizedUnrelatedPaths = plannedPathCoverage
    .filter((entry) => !entry.ownershipCovered || !entry.contextCovered)
    .map((entry) => entry.entry.path)
    .sort();
  const finalDiffFingerprint = fingerprint({
    changed_paths: normalizedChangedPaths,
    unexpected_public_contracts: effectiveFacts.unexpectedPublicContracts,
    unexpected_dependency_directions: effectiveFacts.unexpectedDependencyDirections,
    unexpected_side_effect_edges: effectiveFacts.unexpectedSideEffectEdges,
    unrelated_paths: normalizedUnrelatedPaths,
    unplanned_items: effectiveFacts.unplannedItems,
  });
  if (contextDecision.status !== "sufficient") addReason(reasons, "CONTEXT_RECONCILIATION_DECISION_NOT_SUFFICIENT");
  for (const { entry, ownershipCovered, contextCovered } of plannedPathCoverage
    .filter((item) => ["source", "schema", "config"].includes(item.entry.kind))) {
    if (!ownershipCovered) {
      addReason(reasons, "CONTEXT_RECONCILIATION_CHANGED_PATH_UNOWNED");
    }
    if (!contextCovered) {
      addReason(reasons, "CONTEXT_RECONCILIATION_CHANGED_PATH_UNREPRESENTED");
    }
    if (contextPathKindRequiresVerificationMapping(entry.kind)
      && (entry.test_obligation_ids.length === 0 || entry.test_obligation_ids.some((id) => !references.obligationCovers(id, entry.path)))) {
      addReason(reasons, "CONTEXT_RECONCILIATION_CRITICAL_TEST_MISSING");
    }
  }
  if (effectiveFacts.unexpectedPublicContracts.length > 0) addReason(reasons, "CONTEXT_RECONCILIATION_UNEXPECTED_PUBLIC_CONTRACT");
  if (effectiveFacts.unexpectedDependencyDirections.length > 0) addReason(reasons, "CONTEXT_RECONCILIATION_UNEXPECTED_DEPENDENCY");
  if (effectiveFacts.unexpectedSideEffectEdges.length > 0) addReason(reasons, "CONTEXT_RECONCILIATION_UNEXPECTED_SIDE_EFFECT");
  if (normalizedUnrelatedPaths.length > 0) addReason(reasons, "CONTEXT_RECONCILIATION_UNRELATED_WRITE");
  const highUnplanned = effectiveFacts.unplannedItems.filter((entry) => ["high", "critical"].includes(entry.severity) || entry.disposition === "requires_reanalysis");
  if (highUnplanned.length > 0) addReason(reasons, "CONTEXT_RECONCILIATION_UNPLANNED_HIGH_IMPACT");

  if (evidenceMode === "reviewer_grounded") {
    if (reviewerEvidence === null) addReason(reasons, "CONTEXT_RECONCILIATION_REVIEWER_EVIDENCE_MISSING");
    else {
      validateReviewerReconciliationEvidence(reviewerEvidence);
      reviewerFingerprint = reviewerEvidence.fingerprint;
      if (reviewerEvidence.session_key !== sessionKey
        || !fingerprintsEqual(reviewerEvidence.context_decision_fingerprint, contextDecision.fingerprint)
        || !fingerprintsEqual(reviewerEvidence.pre_workspace_fingerprint, contextDecision.workspace_fingerprint)
        || !fingerprintsEqual(reviewerEvidence.final_workspace_fingerprint, finalWorkspaceFingerprint)
        || !fingerprintsEqual(reviewerEvidence.final_diff_fingerprint, finalDiffFingerprint)
        || !fingerprintsEqual(reviewerEvidence.changed_path_manifest_fingerprint, changedPathManifestFingerprint(normalizedChangedPaths))) {
        addReason(reasons, "CONTEXT_RECONCILIATION_REVIEWER_EVIDENCE_STALE");
      }
      if (Object.values(reviewerEvidence.checks).some((entry) => entry.status === "blocked")) addReason(reasons, "CONTEXT_RECONCILIATION_REVIEWER_EVIDENCE_STALE");
      const expectedUnplanned = effectiveFacts.unplannedItems.map((entry) => entry.id).sort();
      if (canonicalJson(reviewerEvidence.unplanned_item_ids) !== canonicalJson(expectedUnplanned)) addReason(reasons, "CONTEXT_RECONCILIATION_REVIEWER_EVIDENCE_STALE");
    }
  }

  const invalidates = highUnplanned.length > 0 || effectiveFacts.unexpectedPublicContracts.length > 0
    || effectiveFacts.unexpectedDependencyDirections.length > 0 || effectiveFacts.unexpectedSideEffectEdges.length > 0
    || reasons.includes("CONTEXT_RECONCILIATION_GRAPH_DELTA_TRUNCATED")
    || reasons.includes("CONTEXT_RECONCILIATION_GRAPH_TRUST_REGRESSION")
    || reasons.includes("CONTEXT_RECONCILIATION_CHANGED_PATH_UNREPRESENTED");
  const source = {
    schema_version: CONTEXT_RECONCILIATION_SCHEMA_VERSION,
    reconciliation_id: reconciliationId,
    session_key: sessionKey,
    run_id: contextDecision.run_id,
    task_id: contextDecision.task_id,
    risk_class: contextDecision.risk_class,
    strategy_id: contextDecision.strategy_id,
    context_decision_id: contextDecision.decision_id,
    context_decision_fingerprint: contextDecision.fingerprint,
    context_report_id: contextDecision.report_id,
    context_report_fingerprint: contextDecision.report_fingerprint,
    impact_graph_id: contextDecision.impact_graph_id,
    impact_graph_fingerprint: contextDecision.impact_graph_fingerprint,
    pre_workspace_fingerprint: contextDecision.workspace_fingerprint,
    final_workspace_fingerprint: finalWorkspaceFingerprint,
    final_diff_fingerprint: finalDiffFingerprint,
    evidence_mode: evidenceMode,
    graph_completeness: graphCompleteness,
    post_architecture_evidence_fingerprint: postArchitectureFingerprint,
    reviewer_evidence_fingerprint: reviewerFingerprint,
    changed_paths: normalizedChangedPaths,
    verified_post_mutation_test_obligation_ids: normalizedVerifiedPostMutationTestObligationIds,
    unexpected_public_contracts: effectiveFacts.unexpectedPublicContracts,
    unexpected_dependency_directions: effectiveFacts.unexpectedDependencyDirections,
    unexpected_side_effect_edges: effectiveFacts.unexpectedSideEffectEdges,
    unrelated_paths: normalizedUnrelatedPaths,
    unplanned_items: effectiveFacts.unplannedItems,
    status: reasons.length === 0 ? "passed" : "blocked",
    reason_codes: [...reasons].sort(),
    invalidates_context_decision: invalidates,
    reconciled_at: reconciledAt,
  };
  const reconciliation = deepFrozenClone({ ...source, fingerprint: fingerprint(source) }, "context reconciliation");
  validateContextReconciliation(reconciliation);
  return reconciliation;
}

export function assertContextReconciliationCurrent(reconciliation, {
  context_decision: contextDecision,
  final_workspace_fingerprint: finalWorkspaceFingerprint,
} = {}) {
  validateContextReconciliation(reconciliation);
  validateContextSufficiencyDecision(contextDecision);
  if (reconciliation.status !== "passed" || reconciliation.invalidates_context_decision) throw new ContractError("CONTEXT_RECONCILIATION_REQUIRED", "attestation requires a passed final blast-radius reconciliation");
  if (!fingerprintsEqual(reconciliation.context_decision_fingerprint, contextDecision.fingerprint)
    || !fingerprintsEqual(reconciliation.final_workspace_fingerprint, finalWorkspaceFingerprint)) throw new ContractError("CONTEXT_RECONCILIATION_FINAL_WORKSPACE_STALE", "context reconciliation does not bind the final workspace or context decision");
  return reconciliation;
}
