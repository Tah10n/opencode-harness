import { deepFrozenClone } from "./validation.mjs";
import { deriveContextFileCoverage } from "./context-file-coverage.mjs";

export const TRANSITIVE_IMPACT_RESOLUTIONS = Object.freeze([
  "represented",
  "evidence_backed_excluded",
  "unresolved",
]);

export const TRANSITIVE_IMPACT_METRIC_RESOLUTIONS = Object.freeze([
  ...TRANSITIVE_IMPACT_RESOLUTIONS,
  "not_applicable",
]);

const DIRECT_CONTENT_INSPECTION_TOOLS = new Set([
  "context_read",
  "context_batch_read",
]);
const NON_LITERAL_DISCOVERY_TOOLS = new Set([
  "context_outline",
  "context_files",
  "context_map",
  "context_symbols",
  "context_related",
]);
const SEMANTIC_TOOLS = new Set(["context_map", "context_symbols", "context_related"]);
const IMPORT_RELATIONSHIPS = new Set(["direct-import", "imported-by"]);
const HEURISTIC_RELATIONSHIPS = new Set(["likely-test", "same-basename", "sibling"]);
const RELATIONSHIP_KINDS = new Set([...IMPORT_RELATIONSHIPS, ...HEURISTIC_RELATIONSHIPS]);
const RECEIPT_EVIDENCE_INDEX_SCHEMA_VERSION = 4;

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function completeStable(entry, { allowEmpty = true } = {}) {
  return entry !== undefined
    && entry !== null
    && (entry.status === "success" || (allowEmpty && entry.status === "empty"))
    && entry.coverage?.partial === false
    && entry.coverage.complete === true
    && entry.coverage.stable === true
    && entry.coverage.changed_during_operation === false;
}

function specificRationale(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (Buffer.byteLength(normalized, "utf8") < 32) return false;
  return !/^(?:none|n\/?a|not applicable|no transitive (?:impact|consumer)s?)[.!]?$/iu.test(normalized);
}

function reason(code, message, subjectIds = []) {
  return { code, message, subject_ids: sortedUnique(subjectIds.filter((entry) => typeof entry === "string")) };
}

function receiptMap(receiptIndex) {
  return new Map((receiptIndex?.receipts ?? []).map((entry) => [entry.receipt_id, entry]));
}

function selectedReceipts(index, ids) {
  const selected = [];
  for (const id of sortedUnique(ids)) {
    const entry = index.get(id);
    if (entry !== undefined) selected.push(entry);
  }
  return selected;
}

function pathsFrom(entries, selector = () => true) {
  return new Set(entries.filter(selector).flatMap((entry) => entry.observed_paths ?? []));
}

function coverageFor(receiptIndex, entries) {
  if (entries.length === 0) return [];
  try {
    return deriveContextFileCoverage(receiptIndex, {
      receipt_ids: sortedUnique(entries.map((entry) => entry.receipt_id)),
    });
  } catch {
    return [];
  }
}

function contentPaths(receiptIndex, entries) {
  return new Set(coverageFor(receiptIndex, entries)
    .filter((entry) => entry.status === "complete")
    .map((entry) => entry.path));
}

function directContentInspectionPaths(receiptIndex, entries) {
  return new Set(coverageFor(receiptIndex, entries)
    .filter((entry) => entry.status === "complete")
    .map((entry) => entry.path));
}

function directPathsForEntry(entry) {
  if (!DIRECT_CONTENT_INSPECTION_TOOLS.has(entry?.tool_id)) return [];
  return sortedUnique([
    ...(entry.requested_paths ?? []),
    ...(entry.observed_paths ?? []),
    ...(entry.content_ranges ?? []).map((range) => range.path),
  ].filter((path) => typeof path === "string" && path !== "."));
}

function directEntryCompleteForPaths(entry, coverageByPath, relevantPaths = null) {
  if (!DIRECT_CONTENT_INSPECTION_TOOLS.has(entry?.tool_id)) return false;
  const entryPaths = directPathsForEntry(entry);
  const targets = relevantPaths === null
    ? entryPaths
    : [...relevantPaths].filter((path) => entryPaths.includes(path));
  if (targets.length === 0) return false;
  return targets.every((path) => {
    const coverage = coverageByPath.get(path);
    return coverage?.status === "complete" && coverage.contributing_receipt_ids.includes(entry.receipt_id);
  });
}

function inventoryPaths(entries) {
  return pathsFrom(entries, (entry) => completeStable(entry) && NON_LITERAL_DISCOVERY_TOOLS.has(entry.tool_id));
}

function typedRelationshipValid(value) {
  return value !== null
    && typeof value === "object"
    && typeof value.target_path === "string"
    && typeof value.related_path === "string"
    && RELATIONSHIP_KINDS.has(value.relationship)
    && ["high", "medium", "low"].includes(value.confidence);
}

function normalizedImportRelationship(value) {
  if (!typedRelationshipValid(value) || !IMPORT_RELATIONSHIPS.has(value.relationship)) return null;
  if (value.relationship === "direct-import") {
    return { from: value.target_path, to: value.related_path, confidence: value.confidence };
  }
  return { from: value.related_path, to: value.target_path, confidence: value.confidence };
}

function supportsSubjectFactory(graph, receiptIndex, index, { requireSemanticEdges }) {
  const nodes = new Map((graph?.nodes ?? []).map((entry) => [entry.id, entry]));
  const edges = new Map((graph?.edges ?? []).map((entry) => [entry.id, entry]));
  const paths = new Map((graph?.affected_paths ?? []).map((entry) => [entry.id, entry]));
  const excluded = new Map((graph?.excluded_siblings ?? []).map((entry) => [entry.id, entry]));

  const supportForReceipts = (receiptIds) => {
    const entries = selectedReceipts(index, receiptIds);
    const coverage = coverageFor(receiptIndex, entries);
    const coverageByPath = new Map(coverage.map((entry) => [entry.path, entry]));
    const observedContent = contentPaths(receiptIndex, entries);
    const semanticEntries = entries.filter((entry) => completeStable(entry, { allowEmpty: false }) && SEMANTIC_TOOLS.has(entry.tool_id));
    const nodeSupported = (nodeId) => {
      const path = nodes.get(nodeId)?.path;
      return typeof path === "string" && observedContent.has(path);
    };
    const edgeSupported = (edgeId) => {
      const edge = edges.get(edgeId);
      if (edge === undefined || !nodeSupported(edge.from) || !nodeSupported(edge.to)) return false;
      if (!requireSemanticEdges || !["imports", "depends_on"].includes(edge.relationship)) return true;
      const fromPath = nodes.get(edge.from)?.path;
      const toPath = nodes.get(edge.to)?.path;
      return semanticEntries.some((entry) => (entry.relationships ?? []).some((relationship) => {
        const normalized = normalizedImportRelationship(relationship);
        return normalized !== null
          && normalized.confidence === "high"
          && normalized.from === fromPath
          && normalized.to === toPath;
      }));
    };
    const supportsSubject = (subjectId) => {
      if (nodes.has(subjectId)) return nodeSupported(subjectId);
      if (edges.has(subjectId)) return edgeSupported(subjectId);
      if (paths.has(subjectId)) {
        const path = paths.get(subjectId);
        return path.node_ids.every(nodeSupported) && path.edge_ids.every(edgeSupported);
      }
      if (excluded.has(subjectId)) return observedContent.has(excluded.get(subjectId).path);
      return false;
    };
    const entryUsableForObservation = (entry) => (
      DIRECT_CONTENT_INSPECTION_TOOLS.has(entry.tool_id)
        ? directEntryCompleteForPaths(entry, coverageByPath)
        : completeStable(entry, { allowEmpty: false })
    );
    return {
      entries,
      observedContent,
      supportsSubject,
      entryUsableForObservation,
      directEntryComplete: (entry, relevantPaths = null) => directEntryCompleteForPaths(entry, coverageByPath, relevantPaths),
    };
  };

  return supportForReceipts;
}

function bindingMatches(graph, report, receiptIndex) {
  if (graph === null || report === null || receiptIndex === null) return false;
  return report.impact_graph_id === graph.graph_id
    && report.impact_graph_fingerprint === graph.fingerprint
    && receiptIndex.session_key === report.session_key
    && receiptIndex.run_id === report.run_id
    && receiptIndex.task_id === report.task_id
    && receiptIndex.source_fingerprint === report.workspace_fingerprint
    && receiptIndex.schema_version === RECEIPT_EVIDENCE_INDEX_SCHEMA_VERSION
    && (receiptIndex.receipts ?? []).every((entry) => (
      Array.isArray(entry.relationships)
      && entry.relationships.every(typedRelationshipValid)
    ))
    && report.receipt_ids.every((id) => (receiptIndex.receipts ?? []).some((entry) => entry.receipt_id === id));
}

export function receiptSupportedObservedSubjectIds({
  impact_graph: graph,
  context_report: report,
  receipt_evidence_index: receiptIndex,
  require_semantic_edges: requireSemanticEdges = false,
} = {}) {
  if (!bindingMatches(graph, report, receiptIndex)) return Object.freeze([]);
  const supportForReceipts = supportsSubjectFactory(graph, receiptIndex, receiptMap(receiptIndex), { requireSemanticEdges });
  const subjectIds = new Set();
  for (const claim of (report?.claims ?? []).filter((entry) => entry.kind === "observed")) {
    const support = supportForReceipts(claim.receipt_ids);
    if (support.entries.length !== claim.receipt_ids.length
      || support.entries.some((entry) => !support.entryUsableForObservation(entry))
      || !claim.subject_ids.every(support.supportsSubject)) continue;
    claim.subject_ids.forEach((id) => subjectIds.add(id));
  }
  return Object.freeze([...subjectIds].sort());
}

function blockingTransitiveUnknowns(graph, report, boundary) {
  const directSubjects = new Set((graph?.affected_paths ?? [])
    .filter((entry) => entry.kind === "direct")
    .flatMap((entry) => [entry.id, ...entry.node_ids, ...entry.edge_ids]));
  const boundaryUnknownIds = new Set(boundary?.unknown_ids ?? []);
  const boundarySubjects = new Set([
    ...(boundary?.node_ids ?? []),
    ...(boundary?.edge_ids ?? []),
    ...(boundary?.path_ids ?? []),
    ...(boundary?.excluded_sibling_ids ?? []),
  ]);
  const graphUnknowns = (graph?.unknowns ?? []).filter((entry) => (
    entry.blocking && (
      boundaryUnknownIds.has(entry.id)
      || entry.scope_ids.some((id) => directSubjects.has(id) || boundarySubjects.has(id))
    )
  ));
  const reportQuestions = (report?.questions ?? []).filter((entry) => (
    entry.question_key === "all_boundary_consumers" && entry.status === "uncertain"
  ));
  return [...graphUnknowns.map((entry) => entry.id), ...reportQuestions.map((entry) => entry.id)];
}

function relevantTruncatedReceipts(receiptIndex, receipts, relevantPaths) {
  const coverageByPath = new Map(coverageFor(receiptIndex, receipts).map((entry) => [entry.path, entry]));
  return receipts.filter((entry) => {
    if (completeStable(entry)) return false;
    const relatedDirectPaths = directPathsForEntry(entry).filter((path) => relevantPaths.has(path));
    if (directEntryCompleteForPaths(entry, coverageByPath, new Set(relatedDirectPaths))) return false;
    const observed = [...(entry.observed_paths ?? []), ...(entry.requested_paths ?? [])];
    return observed.length === 0
      || observed.includes(".")
      || observed.some((path) => relevantPaths.has(path));
  });
}

function reportExclusionArtifact(report, wide, claims, index, supportForReceipts) {
  if (wide === undefined) return null;
  const referencedClaims = wide.claim_ids.map((id) => claims.get(id)).filter(Boolean);
  const exclusionClaims = referencedClaims.filter((claim) => claim.kind === "reasoned_exclusion");
  const consumerQuestions = (report.questions ?? []).filter((entry) => (
    entry.question_key === "all_boundary_consumers"
    && entry.status === "confirmed"
    && entry.actual_observation !== null
  ));
  const candidates = [
    ...exclusionClaims.map((entry) => ({ id: entry.id, receipt_ids: entry.receipt_ids, subject_ids: entry.subject_ids })),
    ...consumerQuestions.map((entry) => ({ id: entry.id, receipt_ids: entry.receipt_ids, subject_ids: [] })),
  ];
  for (const candidate of candidates) {
    const support = supportForReceipts(candidate.receipt_ids);
    if (support.entries.length !== candidate.receipt_ids.length
      || support.entries.some((entry) => !support.entryUsableForObservation(entry))
      || (candidate.subject_ids.length > 0 && !candidate.subject_ids.every(support.supportsSubject))) continue;
    const nonLiteral = support.entries.some((entry) => completeStable(entry) && NON_LITERAL_DISCOVERY_TOOLS.has(entry.tool_id));
    const content = support.entries.some((entry) => support.directEntryComplete(entry));
    if (nonLiteral && content) return candidate;
  }
  return null;
}

function finalizeResult({ resolution, representedIds = [], exclusionIds = [], contradictedIds = [], receiptIds = [], reasons = [] }) {
  return deepFrozenClone({
    resolution,
    represented_transitive_path_ids: sortedUnique(representedIds),
    evidence_backed_exclusion_boundary_ids: sortedUnique(exclusionIds),
    contradicted_exclusion_subject_ids: sortedUnique(contradictedIds),
    supporting_receipt_ids: sortedUnique(receiptIds),
    reasons: reasons
      .filter((entry, index, items) => items.findIndex((candidate) => (
        candidate.code === entry.code
        && JSON.stringify(candidate.subject_ids) === JSON.stringify(entry.subject_ids)
      )) === index)
      .sort((left, right) => left.code.localeCompare(right.code) || left.subject_ids.join(",").localeCompare(right.subject_ids.join(","))),
  }, "transitive impact resolution");
}

export function evaluateTransitiveImpactResolution({
  impact_graph: graph,
  context_report: report,
  receipt_evidence_index: receiptIndex,
  require_semantic_edges: requireSemanticEdges = false,
} = {}) {
  const transitivePaths = (graph?.affected_paths ?? []).filter((entry) => entry.kind === "transitive");
  const boundary = (graph?.coverage?.boundaries ?? []).find((entry) => entry.category === "transitive_affected_paths");
  const wide = (report?.wide_analysis ?? []).find((entry) => entry.category === "transitive_consumers_side_effects");
  const claims = new Map((report?.claims ?? []).map((entry) => [entry.id, entry]));
  const index = receiptMap(receiptIndex);
  const supportForReceipts = supportsSubjectFactory(graph, receiptIndex, index, { requireSemanticEdges });
  const reasons = [];
  const bindingValid = bindingMatches(graph, report, receiptIndex);
  if (!bindingValid) {
    reasons.push(reason(
      "CONTEXT_CLAIM_EVIDENCE_MISSING",
      "Transitive-impact evidence is missing or bound to another graph, session, task, or workspace",
      [boundary?.id, wide?.id],
    ));
  }

  const blockingIds = blockingTransitiveUnknowns(graph, report, boundary);
  if (blockingIds.length > 0) {
    reasons.push(reason(
      "CONTEXT_BLOCKING_UNKNOWN",
      "A blocking unknown still covers the transitive-consumer boundary",
      blockingIds,
    ));
  }

  if (transitivePaths.length > 0) {
    if (boundary?.classification === "reasoned_excluded") {
      const contradicted = [boundary.id, ...transitivePaths.map((entry) => entry.id)];
      reasons.push(reason(
        "CONTEXT_TRANSITIVE_EXCLUSION_CONTRADICTED",
        "The graph claims no transitive impact while representing a transitive affected path",
        contradicted,
      ));
      return finalizeResult({ resolution: "unresolved", contradictedIds: contradicted, reasons });
    }
    const wideClaims = wide?.classification === "represented"
      ? wide.claim_ids.map((id) => claims.get(id)).filter((claim) => claim?.kind === "observed")
      : [];
    const machineSubjects = new Set();
    const supportingReceiptIds = [];
    for (const claim of wideClaims) {
      const support = supportForReceipts(claim.receipt_ids);
      if (support.entries.length !== claim.receipt_ids.length
        || support.entries.some((entry) => !support.entryUsableForObservation(entry))
        || !claim.subject_ids.every(support.supportsSubject)) continue;
      claim.subject_ids.forEach((id) => machineSubjects.add(id));
      supportingReceiptIds.push(...claim.receipt_ids);
    }
    const represented = transitivePaths.filter((path) => (
      boundary?.classification === "represented"
      && boundary.path_ids.includes(path.id)
      && wide?.classification === "represented"
      && [path.id, ...path.node_ids, ...path.edge_ids].every((id) => (
        wide.subject_ids.includes(id) && machineSubjects.has(id)
      ))
    ));
    if (bindingValid && blockingIds.length === 0 && represented.length === transitivePaths.length) {
      return finalizeResult({
        resolution: "represented",
        representedIds: represented.map((entry) => entry.id),
        receiptIds: supportingReceiptIds,
      });
    }
    reasons.push(reason(
      "CONTEXT_TRANSITIVE_PATH_MISSING",
      "Represented transitive affected paths lack complete runner-owned graph and report evidence",
      transitivePaths.map((entry) => entry.id),
    ));
    return finalizeResult({
      resolution: "unresolved",
      representedIds: represented.map((entry) => entry.id),
      receiptIds: supportingReceiptIds,
      reasons,
    });
  }

  if (boundary?.classification !== "reasoned_excluded") {
    reasons.push(reason(
      "CONTEXT_TRANSITIVE_PATH_MISSING",
      "No transitive affected path or reasoned-excluded transitive boundary is present",
      [boundary?.id],
    ));
    return finalizeResult({ resolution: "unresolved", reasons });
  }

  const runtimeReceiptIds = boundary.evidence_refs
    .filter((entry) => (
      entry.kind === "runtime"
      && index.has(entry.value)
      && (report?.receipt_ids ?? []).includes(entry.value)
    ))
    .map((entry) => entry.value);
  const exclusionArtifact = reportExclusionArtifact(report, wide, claims, index, supportForReceipts);
  const artifactReceiptIds = exclusionArtifact?.receipt_ids ?? [];
  const evidenceReceiptIds = sortedUnique([
    ...runtimeReceiptIds,
    ...artifactReceiptIds,
    ...(wide?.receipt_ids ?? []),
  ]);
  const evidenceReceipts = selectedReceipts(index, evidenceReceiptIds);
  const directPaths = (graph?.affected_paths ?? []).filter((entry) => entry.kind === "direct");
  const directNodeIds = new Set(directPaths.flatMap((entry) => entry.node_ids));
  const requiredPaths = new Set([
    ...(graph?.nodes ?? [])
      .filter((entry) => directNodeIds.has(entry.id) && typeof entry.path === "string")
      .map((entry) => entry.path),
    ...(graph?.excluded_siblings ?? []).map((entry) => entry.path),
  ]);
  const inspectedContent = directContentInspectionPaths(receiptIndex, evidenceReceipts);
  const inspectedInventory = inventoryPaths(evidenceReceipts);
  const inventoryCoversScope = evidenceReceipts.some((entry) => (
    completeStable(entry)
    && NON_LITERAL_DISCOVERY_TOOLS.has(entry.tool_id)
    && ((entry.requested_paths ?? []).includes(".")
      || [...requiredPaths].every((path) => inspectedInventory.has(path) || (entry.observed_paths ?? []).includes(path)))
  ));
  const relevantTruncations = relevantTruncatedReceipts(
    receiptIndex,
    selectedReceipts(index, report?.receipt_ids ?? []),
    requiredPaths,
  );
  const unresolvedTruncationIds = new Set(report?.tool_state?.unresolved_truncation_receipt_ids ?? []);
  const reportMarksRelevantTruncation = relevantTruncations.some((entry) => unresolvedTruncationIds.has(entry.receipt_id));

  const classifiedPaths = new Set([
    ...(graph?.nodes ?? []).map((entry) => entry.path).filter((entry) => typeof entry === "string"),
    ...(graph?.excluded_siblings ?? []).map((entry) => entry.path),
  ]);
  const relationshipEvidence = (receiptIndex?.receipts ?? [])
    .filter((entry) => ["success", "truncated"].includes(entry.status))
    .flatMap((entry) => (entry.relationships ?? []).map((relationship) => ({
      receipt_id: entry.receipt_id,
      relationship,
    })));
  const directAffectedPaths = new Set((graph?.nodes ?? [])
    .filter((entry) => directNodeIds.has(entry.id) && typeof entry.path === "string")
    .map((entry) => entry.path));
  const consumerContradictions = relationshipEvidence.flatMap(({ receipt_id: receiptId, relationship }) => {
    const normalized = normalizedImportRelationship(relationship);
    if (normalized === null
      || !directAffectedPaths.has(normalized.to)
      || directAffectedPaths.has(normalized.from)) return [];
    return [{ path: normalized.from, receipt_id: receiptId }];
  });
  if (consumerContradictions.length > 0) {
    const contradicted = sortedUnique(consumerContradictions.map((entry) => entry.path));
    const contradictionReceiptIds = sortedUnique(consumerContradictions.map((entry) => entry.receipt_id));
    reasons.push(reason(
      "CONTEXT_TRANSITIVE_EXCLUSION_CONTRADICTED",
      "Runner-owned import evidence identifies a consumer outside the direct affected path",
      contradicted,
    ));
    return finalizeResult({
      resolution: "unresolved",
      contradictedIds: contradicted,
      receiptIds: [...evidenceReceiptIds, ...contradictionReceiptIds],
      reasons,
    });
  }
  const unresolvedHeuristicCandidates = relationshipEvidence.flatMap(({ receipt_id: receiptId, relationship }) => {
    if (!HEURISTIC_RELATIONSHIPS.has(relationship.relationship)) return [];
    let candidate = null;
    if (directAffectedPaths.has(relationship.target_path) && !directAffectedPaths.has(relationship.related_path)) {
      candidate = relationship.related_path;
    } else if (directAffectedPaths.has(relationship.related_path) && !directAffectedPaths.has(relationship.target_path)) {
      candidate = relationship.target_path;
    }
    if (candidate === null || (classifiedPaths.has(candidate) && inspectedContent.has(candidate))) return [];
    return [{ path: candidate, receipt_id: receiptId }];
  });
  if (unresolvedHeuristicCandidates.length > 0) {
    const unresolved = sortedUnique(unresolvedHeuristicCandidates.map((entry) => entry.path));
    const heuristicReceiptIds = sortedUnique(unresolvedHeuristicCandidates.map((entry) => entry.receipt_id));
    reasons.push(reason(
      "CONTEXT_CLAIM_EVIDENCE_MISSING",
      "Heuristic relationship candidates require graph classification and direct content inspection",
      unresolved,
    ));
    return finalizeResult({
      resolution: "unresolved",
      receiptIds: [...evidenceReceiptIds, ...heuristicReceiptIds],
      reasons,
    });
  }

  const widePreservesExclusion = wide !== undefined
    && ((wide.classification === "reasoned_excluded" && specificRationale(wide.rationale))
      || (wide.classification === "represented" && exclusionArtifact !== null));
  const completeEvidence = runtimeReceiptIds.length > 0
    && exclusionArtifact !== null
    && evidenceReceipts.length === evidenceReceiptIds.length
    && evidenceReceipts.some((entry) => completeStable(entry) && NON_LITERAL_DISCOVERY_TOOLS.has(entry.tool_id))
    && evidenceReceipts.some((entry) => DIRECT_CONTENT_INSPECTION_TOOLS.has(entry.tool_id))
    && inventoryCoversScope
    && [...requiredPaths].every((path) => inspectedContent.has(path))
    && relevantTruncations.length === 0
    && !reportMarksRelevantTruncation;

  if (bindingValid
    && blockingIds.length === 0
    && specificRationale(boundary.rationale)
    && widePreservesExclusion
    && completeEvidence) {
    return finalizeResult({
      resolution: "evidence_backed_excluded",
      exclusionIds: [boundary.id],
      receiptIds: evidenceReceiptIds,
    });
  }

  reasons.push(reason(
    "CONTEXT_CLAIM_EVIDENCE_MISSING",
    "The claimed absence of transitive impact lacks complete, stable, runner-bound repository evidence",
    [boundary.id, wide?.id, ...relevantTruncations.map((entry) => entry.receipt_id)],
  ));
  return finalizeResult({ resolution: "unresolved", receiptIds: evidenceReceiptIds, reasons });
}

export function deriveTransitiveImpactMetrics(result) {
  const resolution = TRANSITIVE_IMPACT_RESOLUTIONS.includes(result?.resolution)
    ? result.resolution
    : "unresolved";
  return deepFrozenClone({
    transitive_impact_resolution: resolution,
    represented_transitive_path_count: result?.represented_transitive_path_ids?.length ?? 0,
    evidence_backed_transitive_exclusion_count: result?.evidence_backed_exclusion_boundary_ids?.length ?? 0,
    contradicted_transitive_exclusion_count: result?.contradicted_exclusion_subject_ids?.length ?? 0,
  }, "transitive impact metrics");
}
