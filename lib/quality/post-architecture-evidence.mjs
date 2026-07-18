import { normalizeRelativePath } from "../feedback/privacy.mjs";
import { assertEnum, assertSafeId } from "../feedback/contracts.mjs";
import { validateArchitectureEvaluation, validateArchitecturePolicy } from "./architecture.mjs";
import { validateEngineeringImpactGraph } from "./impact-graph.mjs";
import {
  ContractError,
  assertArray,
  assertBoolean,
  assertFingerprint,
  assertInteger,
  assertIso,
  assertPlain,
  assertStableTypedId,
  assertString,
  assertStringArray,
  canonicalJson,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

export const POST_EDIT_ARCHITECTURE_EVIDENCE_SCHEMA_VERSION = 3;
export const POST_EDIT_ARCHITECTURE_EVIDENCE_PRODUCER = "opencode-harness/post-edit-architecture-v3";
export const POST_EDIT_ARCHITECTURE_MECHANISM_KINDS = Object.freeze([
  "project_check",
  "runner_owned_extractor",
]);

const LEGACY_SCHEMA_VERSION = 1;
const LEGACY_PRODUCER = "opencode-harness/post-edit-architecture-v1";
const HISTORICAL_GRAPH_EVIDENCE_SCHEMA_VERSION = 2;
const HISTORICAL_GRAPH_EVIDENCE_PRODUCER = "opencode-harness/post-edit-architecture-v2";
const HISTORICAL_GRAPH_DELTA_SCHEMA_VERSION = 1;
const GRAPH_DELTA_SCHEMA_VERSION = 2;
const DELTA_LIMIT = 128;
const TRUST_REGRESSION_KINDS = Object.freeze([
  "coverage_regression",
  "confidence_regression",
  "unknown_added",
  "exclusion_added",
  "boundary_loss",
  "critical_path_downgrade",
]);
const PUBLIC_CONTRACT_NODE_KINDS = new Set(["public_api", "contract", "data_shape", "serialization_boundary"]);
const DEPENDENCY_RELATIONSHIPS = new Set(["imports", "calls", "depends_on", "implements"]);
const SIDE_EFFECT_RELATIONSHIPS = new Set([
  "reads", "writes", "emits", "publishes", "consumes", "persists", "invalidates", "migrates",
  "serializes", "deserializes", "schedules",
]);
const SIDE_EFFECT_NODE_KINDS = new Set([
  "data_store", "cache", "external_dependency", "background_job", "event_producer", "event_consumer",
  "migration", "serialization_boundary",
]);

const LEGACY_EVIDENCE_KEYS = Object.freeze([
  "schema_version",
  "evidence_id",
  "producer",
  "mechanism_kind",
  "extractor_identity",
  "evaluator_identity",
  "command_receipt_fingerprint",
  "extractor_output_fingerprint",
  "policy_fingerprint",
  "final_workspace_fingerprint",
  "extracted_graph_fingerprint",
  "architecture_evaluation",
  "completed_at",
  "fingerprint",
]);
const EVIDENCE_KEYS = Object.freeze([
  ...LEGACY_EVIDENCE_KEYS.slice(0, -3),
  "planned_graph_fingerprint",
  "graph_delta",
  ...LEGACY_EVIDENCE_KEYS.slice(-3),
]);
const HISTORICAL_GRAPH_DELTA_KEYS = Object.freeze([
  "schema_version", "planned_graph_fingerprint", "final_graph_fingerprint",
  "added_nodes", "removed_nodes", "added_edges", "removed_edges",
  "added_affected_paths", "removed_affected_paths",
  "unexpected_public_contracts", "unexpected_dependency_directions", "unexpected_side_effect_edges",
  "unplanned_items", "counts", "truncated", "fingerprint",
]);
const GRAPH_DELTA_KEYS = Object.freeze([
  ...HISTORICAL_GRAPH_DELTA_KEYS.slice(0, -4),
  "trust_regressions",
  ...HISTORICAL_GRAPH_DELTA_KEYS.slice(-4),
]);
const STRUCTURAL_DELTA_COUNT_KEYS = Object.freeze([
  "added_nodes", "removed_nodes", "added_edges", "removed_edges",
  "added_affected_paths", "removed_affected_paths",
]);
const HISTORICAL_DELTA_COUNT_KEYS = STRUCTURAL_DELTA_COUNT_KEYS;
const DELTA_COUNT_KEYS = Object.freeze([...STRUCTURAL_DELTA_COUNT_KEYS, "trust_regressions"]);

function validateImplementationIdentity(value, label, { evaluator = false } = {}) {
  assertPlain(value, label);
  const keys = evaluator
    ? ["producer", "algorithm_ids", "implementation_fingerprint"]
    : ["producer", "mechanism_id", "implementation_fingerprint"];
  exact(value, keys, keys, label);
  assertString(value.producer, `${label}.producer`, { maxBytes: 256 });
  assertFingerprint(value.implementation_fingerprint, `${label}.implementation_fingerprint`);
  if (evaluator) {
    assertArray(value.algorithm_ids, `${label}.algorithm_ids`, { min: 1, max: 64 });
    value.algorithm_ids.forEach((entry, index) => assertSafeId(entry, `${label}.algorithm_ids[${index}]`));
    if (new Set(value.algorithm_ids).size !== value.algorithm_ids.length
      || [...value.algorithm_ids].sort().some((entry, index) => entry !== value.algorithm_ids[index])) {
      throw new ContractError("QUALITY_POST_ARCHITECTURE_IDENTITY", `${label}.algorithm_ids must be sorted and unique`);
    }
  } else {
    assertSafeId(value.mechanism_id, `${label}.mechanism_id`);
  }
}

function fingerprintInput(value) {
  const source = { ...value };
  delete source.fingerprint;
  return source;
}

function canonicalPath(value, label) {
  const normalized = normalizeRelativePath(value, label);
  if (normalized !== value) throw new ContractError("QUALITY_POST_ARCHITECTURE_PATH", `${label} must be canonical`);
  return value;
}

function semanticNode(node) {
  return {
    kind: node.kind,
    path: node.path,
    symbol: node.symbol,
    label: node.label,
    boundary: node.boundary,
  };
}

function semanticEdge(edge, nodes) {
  return {
    relationship: edge.relationship,
    from: semanticNode(nodes.get(edge.from)),
    to: semanticNode(nodes.get(edge.to)),
  };
}

function semanticAffectedPath(affectedPath, nodes, edges) {
  return {
    kind: affectedPath.kind,
    critical: affectedPath.critical,
    nodes: affectedPath.node_ids.map((id) => semanticNode(nodes.get(id))),
    edges: affectedPath.edge_ids.map((id) => semanticEdge(edges.get(id), nodes)),
    verification_nodes: affectedPath.verification_node_ids.map((id) => semanticNode(nodes.get(id))),
  };
}

function semanticGraphItems(graph) {
  const nodes = new Map(graph.nodes.map((entry) => [entry.id, entry]));
  const edges = new Map(graph.edges.map((entry) => [entry.id, entry]));
  return {
    nodes: graph.nodes.map(semanticNode),
    edges: graph.edges.map((entry) => semanticEdge(entry, nodes)),
    affectedPaths: graph.affected_paths.map((entry) => semanticAffectedPath(entry, nodes, edges)),
  };
}

const CONFIDENCE_RANK = Object.freeze({ unknown: 0, inferred: 1, observed: 2 });
const COVERAGE_RANK = Object.freeze({ unknown: 0, partial: 1, complete: 2 });
const SEMANTIC_TOOL_STATUS_RANK = Object.freeze({ not_requested: 0, unavailable: 1, available: 2 });
const BOUNDARY_REFERENCE_FIELDS = Object.freeze([
  "node_ids",
  "edge_ids",
  "path_ids",
  "unknown_ids",
  "excluded_sibling_ids",
]);

function semanticNodeTrustIdentity(node) {
  return {
    kind: node.kind,
    path: node.path,
    symbol: node.symbol,
    label: node.label,
  };
}

function semanticEdgeTrustIdentity(edge, nodes) {
  return {
    relationship: edge.relationship,
    from: semanticNodeTrustIdentity(nodes.get(edge.from)),
    to: semanticNodeTrustIdentity(nodes.get(edge.to)),
  };
}

function semanticAffectedPathTrustIdentity(affectedPath, nodes, edges) {
  return {
    kind: affectedPath.kind,
    nodes: affectedPath.node_ids.map((id) => semanticNodeTrustIdentity(nodes.get(id))),
    edges: affectedPath.edge_ids.map((id) => semanticEdgeTrustIdentity(edges.get(id), nodes)),
    verification_nodes: affectedPath.verification_node_ids.map((id) => semanticNodeTrustIdentity(nodes.get(id))),
  };
}

function trustGraphIndex(graph) {
  const nodes = new Map(graph.nodes.map((entry) => [entry.id, entry]));
  const edges = new Map(graph.edges.map((entry) => [entry.id, entry]));
  const paths = new Map(graph.affected_paths.map((entry) => [entry.id, entry]));
  const excluded = new Map(graph.excluded_siblings.map((entry) => [entry.id, entry]));
  const nodeSignatures = new Map([...nodes].map(([id, entry]) => [id, canonicalJson(semanticNodeTrustIdentity(entry))]));
  const edgeSignatures = new Map([...edges].map(([id, entry]) => [id, canonicalJson(semanticEdgeTrustIdentity(entry, nodes))]));
  const pathSignatures = new Map([...paths].map(([id, entry]) => [id, canonicalJson(semanticAffectedPathTrustIdentity(entry, nodes, edges))]));
  const excludedSignatures = new Map([...excluded].map(([id, entry]) => [id, canonicalJson({
    path: entry.path,
    reason: entry.reason,
  })]));
  const scopeSignature = (id) => nodeSignatures.get(id)
    ?? edgeSignatures.get(id)
    ?? pathSignatures.get(id)
    ?? excludedSignatures.get(id)
    ?? `unresolved:${id}`;
  const unknownSignatures = new Map(graph.unknowns.map((entry) => [entry.id, canonicalJson({
    statement: entry.statement,
    impact: entry.impact,
    scope: entry.scope_ids.map(scopeSignature).sort(),
  })]));
  return {
    nodes,
    edges,
    paths,
    excluded,
    nodeSignatures,
    edgeSignatures,
    pathSignatures,
    excludedSignatures,
    unknownSignatures,
    scopeSignature,
  };
}

function pairTrustMultisets(plannedItems, finalItems, plannedIdentity, finalIdentity, trustVector) {
  const group = (items, identity) => {
    const result = new Map();
    for (const entry of items) {
      const key = canonicalJson(identity(entry));
      const values = result.get(key) ?? [];
      values.push(entry);
      result.set(key, values);
    }
    return result;
  };
  const sortByTrust = (items) => [...items].sort((left, right) => {
    const leftVector = trustVector(left);
    const rightVector = trustVector(right);
    for (let index = 0; index < Math.max(leftVector.length, rightVector.length); index += 1) {
      const difference = (rightVector[index] ?? 0) - (leftVector[index] ?? 0);
      if (difference !== 0) return difference;
    }
    return canonicalJson(left).localeCompare(canonicalJson(right));
  });
  const plannedGroups = group(plannedItems, plannedIdentity);
  const finalGroups = group(finalItems, finalIdentity);
  const pairs = [];
  const additions = [];
  for (const [key, finalEntries] of finalGroups) {
    const plannedEntries = plannedGroups.get(key) ?? [];
    const plannedSorted = sortByTrust(plannedEntries);
    const finalSorted = sortByTrust(finalEntries);
    const matchedCount = Math.min(plannedSorted.length, finalSorted.length);
    for (let index = 0; index < matchedCount; index += 1) {
      pairs.push({ planned: plannedSorted[index], final: finalSorted[index], identity: key });
    }
    if (finalSorted.length > matchedCount) {
      additions.push({
        entry: finalSorted[matchedCount],
        identity: key,
        added_count: finalSorted.length - matchedCount,
        planned_count: plannedSorted.length,
        final_count: finalSorted.length,
      });
    }
  }
  return { pairs, additions };
}

function matchedTrustPairs(plannedItems, finalItems, plannedIdentity, finalIdentity, trustVector) {
  return pairTrustMultisets(
    plannedItems,
    finalItems,
    plannedIdentity,
    finalIdentity,
    trustVector,
  ).pairs;
}

function createTrustRegression({ kind, subject, path, before, after, description, identityKey = null }) {
  const identity = { kind, subject, path, before, after, description };
  if (identityKey !== null) identity.identity_key = identityKey;
  const bounded = {
    kind,
    subject: boundedText(subject, 1000),
    path,
    before: boundedText(before, 1000),
    after: boundedText(after, 1000),
    description: boundedText(description, 2000),
  };
  return {
    id: `TRUSTREG-${fingerprint(identity).slice(7, 31)}`,
    ...bounded,
  };
}

function trustRegressionUnplannedItem(regression, riskClass) {
  const kind = regression.kind === "unknown_added"
    ? "unknown"
    : regression.kind === "exclusion_added"
      ? "exclusion"
      : regression.kind === "boundary_loss"
        ? "boundary"
        : regression.kind === "critical_path_downgrade"
          ? "path"
          : "coverage";
  return {
    id: `UNPLANNED-${fingerprint({ trust_regression_id: regression.id }).slice(7, 31)}`,
    kind,
    severity: riskClass === "critical" ? "critical" : "high",
    path: regression.path,
    description: boundedText(`trust regression: ${regression.description}`, 2000),
    disposition: "requires_reanalysis",
    analysis_update_id: null,
  };
}

function boundarySubjectSignatures(boundary, index) {
  const signatures = [];
  const maps = {
    node_ids: index.nodeSignatures,
    edge_ids: index.edgeSignatures,
    path_ids: index.pathSignatures,
    unknown_ids: index.unknownSignatures,
    excluded_sibling_ids: index.excludedSignatures,
  };
  for (const field of BOUNDARY_REFERENCE_FIELDS) {
    for (const id of boundary[field]) signatures.push(`${field}:${maps[field].get(id) ?? `unresolved:${id}`}`);
  }
  return [...new Set(signatures)].sort();
}

function pathForUnknown(unknown, index) {
  for (const id of unknown.scope_ids) {
    const node = index.nodes.get(id);
    if (node?.path !== null && node?.path !== undefined) return node.path;
    const affectedPath = index.paths.get(id);
    if (affectedPath) {
      const path = affectedPath.node_ids.map((nodeId) => index.nodes.get(nodeId)?.path).find((entry) => entry != null);
      if (path !== undefined) return path;
    }
    const excluded = index.excluded.get(id);
    if (excluded) return excluded.path;
  }
  return null;
}

function deriveTrustRegressions(plannedGraph, finalGraph) {
  const plannedIndex = trustGraphIndex(plannedGraph);
  const finalIndex = trustGraphIndex(finalGraph);
  const regressions = [];
  const addRankRegression = ({ kind, subject, path, field, plannedValue, finalValue, ranks, identityKey = null }) => {
    if (ranks[finalValue] >= ranks[plannedValue]) return;
    regressions.push(createTrustRegression({
      kind,
      subject,
      path,
      before: `${field}:${plannedValue}`,
      after: `${field}:${finalValue}`,
      description: `${subject} ${field} regressed from ${plannedValue} to ${finalValue}`,
      identityKey,
    }));
  };

  for (const { planned, final } of matchedTrustPairs(
    plannedGraph.nodes,
    finalGraph.nodes,
    semanticNodeTrustIdentity,
    semanticNodeTrustIdentity,
    (entry) => [CONFIDENCE_RANK[entry.confidence], COVERAGE_RANK[entry.coverage]],
  )) {
    const subject = `node ${nodeDisplay(semanticNode(planned))}`;
    addRankRegression({ kind: "confidence_regression", subject, path: planned.path, field: "confidence", plannedValue: planned.confidence, finalValue: final.confidence, ranks: CONFIDENCE_RANK });
    addRankRegression({ kind: "coverage_regression", subject, path: planned.path, field: "coverage", plannedValue: planned.coverage, finalValue: final.coverage, ranks: COVERAGE_RANK });
    if (planned.boundary !== "none" && final.boundary === "none") {
      regressions.push(createTrustRegression({
        kind: "boundary_loss",
        subject,
        path: planned.path,
        before: `boundary:${planned.boundary}`,
        after: "boundary:none",
        description: `${subject} lost its ${planned.boundary} boundary classification`,
      }));
    }
  }

  for (const { planned, final } of matchedTrustPairs(
    plannedGraph.edges,
    finalGraph.edges,
    (entry) => semanticEdgeTrustIdentity(entry, plannedIndex.nodes),
    (entry) => semanticEdgeTrustIdentity(entry, finalIndex.nodes),
    (entry) => [CONFIDENCE_RANK[entry.confidence], COVERAGE_RANK[entry.coverage]],
  )) {
    const semantic = semanticEdgeTrustIdentity(planned, plannedIndex.nodes);
    const subject = `edge ${edgeDisplay(semantic)}`;
    const path = semantic.from.path ?? semantic.to.path;
    addRankRegression({ kind: "confidence_regression", subject, path, field: "confidence", plannedValue: planned.confidence, finalValue: final.confidence, ranks: CONFIDENCE_RANK });
    addRankRegression({ kind: "coverage_regression", subject, path, field: "coverage", plannedValue: planned.coverage, finalValue: final.coverage, ranks: COVERAGE_RANK });
  }

  for (const { planned, final } of matchedTrustPairs(
    plannedGraph.affected_paths,
    finalGraph.affected_paths,
    (entry) => semanticAffectedPathTrustIdentity(entry, plannedIndex.nodes, plannedIndex.edges),
    (entry) => semanticAffectedPathTrustIdentity(entry, finalIndex.nodes, finalIndex.edges),
    (entry) => [entry.critical ? 1 : 0, CONFIDENCE_RANK[entry.confidence]],
  )) {
    const semantic = semanticAffectedPathTrustIdentity(planned, plannedIndex.nodes, plannedIndex.edges);
    const subject = `${planned.kind} affected path ${affectedPathDisplay(semantic)}`;
    const path = semantic.nodes.find((entry) => entry.path !== null)?.path ?? null;
    addRankRegression({ kind: "confidence_regression", subject, path, field: "confidence", plannedValue: planned.confidence, finalValue: final.confidence, ranks: CONFIDENCE_RANK });
    if (planned.critical && !final.critical) {
      regressions.push(createTrustRegression({
        kind: "critical_path_downgrade",
        subject,
        path,
        before: "critical:true",
        after: "critical:false",
        description: `${subject} was downgraded from critical without renewed analysis`,
      }));
    }
  }

  const unknownComparison = pairTrustMultisets(
    plannedGraph.unknowns,
    finalGraph.unknowns,
    (entry) => plannedIndex.unknownSignatures.get(entry.id),
    (entry) => finalIndex.unknownSignatures.get(entry.id),
    (entry) => [entry.blocking ? 1 : 0],
  );
  for (const { planned, final, identity } of unknownComparison.pairs) {
    if (!planned.blocking && final.blocking) {
      regressions.push(createTrustRegression({
        kind: "unknown_added",
        subject: `unknown ${final.statement}`,
        path: pathForUnknown(final, finalIndex),
        before: "blocking:false",
        after: "blocking:true",
        description: `impact-graph unknown became blocking: ${final.statement}`,
        identityKey: identity,
      }));
    }
  }
  for (const addition of unknownComparison.additions) {
    const { entry } = addition;
    regressions.push(createTrustRegression({
      kind: "unknown_added",
      subject: `unknown ${entry.statement}`,
      path: pathForUnknown(entry, finalIndex),
      before: addition.planned_count === 0 ? "absent" : `count:${addition.planned_count}`,
      after: `count:${addition.final_count}`,
      description: `${addition.added_count} new unresolved impact-graph unknown${addition.added_count === 1 ? "" : "s"}: ${entry.statement}`,
      identityKey: addition.identity,
    }));
  }

  const exclusionComparison = pairTrustMultisets(
    plannedGraph.excluded_siblings,
    finalGraph.excluded_siblings,
    (entry) => plannedIndex.excludedSignatures.get(entry.id),
    (entry) => finalIndex.excludedSignatures.get(entry.id),
    (entry) => [CONFIDENCE_RANK[entry.confidence]],
  );
  for (const { planned, final, identity } of exclusionComparison.pairs) {
    addRankRegression({
      kind: "confidence_regression",
      subject: `excluded sibling ${final.path}`,
      path: final.path,
      field: "confidence",
      plannedValue: planned.confidence,
      finalValue: final.confidence,
      ranks: CONFIDENCE_RANK,
      identityKey: identity,
    });
  }
  for (const addition of exclusionComparison.additions) {
    const { entry } = addition;
    regressions.push(createTrustRegression({
      kind: "exclusion_added",
      subject: `excluded sibling ${entry.path}`,
      path: entry.path,
      before: addition.planned_count === 0 ? "absent" : `count:${addition.planned_count}`,
      after: `count:${addition.final_count}`,
      description: `${addition.added_count} new reasoned exclusion${addition.added_count === 1 ? "" : "s"} introduced for ${entry.path}`,
      identityKey: addition.identity,
    }));
  }

  addRankRegression({
    kind: "coverage_regression",
    subject: "impact graph",
    path: null,
    field: "coverage completeness",
    plannedValue: plannedGraph.coverage.completeness,
    finalValue: finalGraph.coverage.completeness,
    ranks: COVERAGE_RANK,
  });
  addRankRegression({
    kind: "coverage_regression",
    subject: "impact graph",
    path: null,
    field: "semantic tool status",
    plannedValue: plannedGraph.coverage.semantic_tool_status,
    finalValue: finalGraph.coverage.semantic_tool_status,
    ranks: SEMANTIC_TOOL_STATUS_RANK,
  });
  if (!plannedGraph.coverage.truncated && finalGraph.coverage.truncated) {
    regressions.push(createTrustRegression({
      kind: "coverage_regression",
      subject: "impact graph",
      path: null,
      before: "truncated:false",
      after: "truncated:true",
      description: "final impact-graph coverage became truncated",
    }));
  }
  if (!plannedGraph.coverage.reduced_semantic_coverage && finalGraph.coverage.reduced_semantic_coverage) {
    regressions.push(createTrustRegression({
      kind: "coverage_regression",
      subject: "impact graph",
      path: null,
      before: "reduced_semantic_coverage:false",
      after: "reduced_semantic_coverage:true",
      description: "final impact graph lost full semantic-tool coverage",
    }));
  }

  const finalAvailableEvaluatorIds = new Set(finalGraph.coverage.available_evaluator_ids);
  const finalUnavailableEvaluatorIds = new Set(finalGraph.coverage.unavailable_evaluator_ids);
  for (const evaluatorId of [...plannedGraph.coverage.available_evaluator_ids].sort()) {
    if (finalAvailableEvaluatorIds.has(evaluatorId)) continue;
    const finalAvailability = finalUnavailableEvaluatorIds.has(evaluatorId) ? "unavailable" : "absent";
    regressions.push(createTrustRegression({
      kind: "coverage_regression",
      subject: `evaluator ${evaluatorId}`,
      path: null,
      before: "availability:available",
      after: `availability:${finalAvailability}`,
      description: `evaluator ${evaluatorId} lost planned availability`,
    }));
  }

  const finalSemanticTools = new Set(finalGraph.coverage.semantic_tools);
  for (const semanticTool of [...plannedGraph.coverage.semantic_tools].sort()) {
    if (finalSemanticTools.has(semanticTool)) continue;
    regressions.push(createTrustRegression({
      kind: "coverage_regression",
      subject: `semantic tool ${semanticTool}`,
      path: null,
      before: "availability:available",
      after: "availability:absent",
      description: `semantic tool ${semanticTool} lost planned availability`,
    }));
  }

  const finalFallbackTools = new Set(finalGraph.coverage.fallback_tools);
  for (const fallbackTool of [...plannedGraph.coverage.fallback_tools].sort()) {
    if (finalFallbackTools.has(fallbackTool)) continue;
    regressions.push(createTrustRegression({
      kind: "coverage_regression",
      subject: `fallback tool ${fallbackTool}`,
      path: null,
      before: "availability:available",
      after: "availability:absent",
      description: `fallback tool ${fallbackTool} lost planned availability`,
    }));
  }

  const finalBoundaries = new Map(finalGraph.coverage.boundaries.map((entry) => [entry.category, entry]));
  for (const plannedBoundary of plannedGraph.coverage.boundaries) {
    if (plannedBoundary.classification !== "represented") continue;
    const finalBoundary = finalBoundaries.get(plannedBoundary.category);
    if (finalBoundary === undefined) {
      regressions.push(createTrustRegression({
        kind: "boundary_loss",
        subject: `coverage boundary ${plannedBoundary.category}`,
        path: null,
        before: "classification:represented",
        after: "classification:missing",
        description: `${plannedBoundary.category} lost represented coverage`,
      }));
      continue;
    }
    if (finalBoundary.classification !== "represented") {
      regressions.push(createTrustRegression({
        kind: "boundary_loss",
        subject: `coverage boundary ${finalBoundary.category}`,
        path: null,
        before: "classification:represented",
        after: `classification:${finalBoundary.classification}`,
        description: `${finalBoundary.category} lost represented coverage`,
      }));
      continue;
    }
    const finalSubjects = new Set(boundarySubjectSignatures(finalBoundary, finalIndex));
    const lost = boundarySubjectSignatures(plannedBoundary, plannedIndex).filter((signature) => !finalSubjects.has(signature));
    if (lost.length > 0) {
      regressions.push(createTrustRegression({
        kind: "boundary_loss",
        subject: `coverage boundary ${finalBoundary.category}`,
        path: null,
        before: `represented_subjects:${boundarySubjectSignatures(plannedBoundary, plannedIndex).length}`,
        after: `lost_subjects:${lost.length}`,
        description: `${finalBoundary.category} lost ${lost.length} represented subject${lost.length === 1 ? "" : "s"}`,
      }));
    }
  }

  return [...new Map(regressions.map((entry) => [entry.id, entry])).values()]
    .sort((left, right) => left.id.localeCompare(right.id));
}

function counted(items) {
  const result = new Map();
  for (const value of items) {
    const key = canonicalJson(value);
    const current = result.get(key);
    if (current === undefined) result.set(key, { value, count: 1 });
    else current.count += 1;
  }
  return result;
}

function multisetDifference(leftItems, rightItems) {
  const left = counted(leftItems);
  const right = counted(rightItems);
  const result = [];
  for (const [key, entry] of left) {
    const difference = entry.count - (right.get(key)?.count ?? 0);
    if (difference > 0) result.push({ value: entry.value, count: difference, signature: fingerprint(entry.value) });
  }
  return result.sort((leftEntry, rightEntry) => leftEntry.signature.localeCompare(rightEntry.signature));
}

function persistedSignatures(entries) {
  return entries.slice(0, DELTA_LIMIT).map(({ signature, count }) => ({ signature, count }));
}

function nodeDisplay(node) {
  return node.path ?? node.symbol ?? node.label;
}

function edgeDisplay(edge) {
  return `${nodeDisplay(edge.from)} -${edge.relationship}-> ${nodeDisplay(edge.to)}`;
}

function affectedPathDisplay(affectedPath) {
  return affectedPath.nodes.map(nodeDisplay).join(" -> ");
}

function edgeIsSideEffect(edge) {
  return SIDE_EFFECT_RELATIONSHIPS.has(edge.relationship)
    || SIDE_EFFECT_NODE_KINDS.has(edge.from.kind)
    || SIDE_EFFECT_NODE_KINDS.has(edge.to.kind);
}

function uniqueBounded(values) {
  const all = [...new Set(values)].sort();
  return { values: all.slice(0, DELTA_LIMIT), truncated: all.length > DELTA_LIMIT };
}

function boundedText(value, maxBytes) {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let result = "";
  const suffix = "...";
  const contentLimit = maxBytes - Buffer.byteLength(suffix, "utf8");
  let bytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > contentLimit) break;
    result += character;
    bytes += characterBytes;
  }
  return `${result}${suffix}`;
}

function deltaUnplannedItem(change, category, entry, riskClass) {
  const value = entry.value;
  const kind = category === "node"
    ? PUBLIC_CONTRACT_NODE_KINDS.has(value.kind) ? "contract" : "node"
    : category === "edge"
      ? edgeIsSideEffect(value) ? "side_effect" : DEPENDENCY_RELATIONSHIPS.has(value.relationship) ? "dependency" : "edge"
      : "path";
  const display = category === "node" ? nodeDisplay(value) : category === "edge" ? edgeDisplay(value) : affectedPathDisplay(value);
  const path = category === "node" ? value.path : category === "edge" ? value.from.path ?? value.to.path : value.nodes.find((node) => node.path !== null)?.path ?? null;
  const identity = { change, category, signature: entry.signature };
  return {
    id: `UNPLANNED-${fingerprint(identity).slice(7, 31)}`,
    kind,
    severity: riskClass === "critical" ? "critical" : riskClass === "high" ? "high" : "medium",
    path,
    description: boundedText(`${change} ${category} ${display}${entry.count === 1 ? "" : ` (${entry.count} occurrences)`}`, 2000),
    disposition: "requires_reanalysis",
    analysis_update_id: null,
  };
}

function validateDeltaSignature(value, label) {
  assertPlain(value, label);
  exact(value, ["signature", "count"], ["signature", "count"], label);
  assertFingerprint(value.signature, `${label}.signature`);
  assertInteger(value.count, `${label}.count`, { min: 1, max: 4096 });
}

function assertNonEmptyTypedId(value, prefix, label) {
  assertStableTypedId(value, prefix, label);
  if (value.length === prefix.length + 1) {
    throw new ContractError("QUALITY_TYPED_ID", `${label} must include a non-empty suffix after ${prefix}-`);
  }
}

function validateDeltaUnplannedItem(value, label, { historical = false } = {}) {
  assertPlain(value, label);
  const keys = ["id", "kind", "severity", "path", "description", "disposition", "analysis_update_id"];
  exact(value, keys, keys, label);
  if (historical) assertStableTypedId(value.id, "UNPLANNED", `${label}.id`);
  else assertNonEmptyTypedId(value.id, "UNPLANNED", `${label}.id`);
  assertEnum(
    value.kind,
    historical
      ? ["node", "edge", "contract", "side_effect", "dependency", "path"]
      : ["node", "edge", "contract", "side_effect", "dependency", "path", "coverage", "unknown", "exclusion", "boundary"],
    `${label}.kind`,
  );
  assertEnum(value.severity, ["medium", "high", "critical"], `${label}.severity`);
  if (value.path !== null) canonicalPath(value.path, `${label}.path`);
  assertString(value.description, `${label}.description`, { maxBytes: 2000 });
  if (value.disposition !== "requires_reanalysis" || value.analysis_update_id !== null) {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_DELTA", `${label} must require pre-attestation reanalysis`);
  }
}

function validateTrustRegression(value, label) {
  assertPlain(value, label);
  const keys = ["id", "kind", "subject", "path", "before", "after", "description"];
  exact(value, keys, keys, label);
  assertNonEmptyTypedId(value.id, "TRUSTREG", `${label}.id`);
  assertEnum(value.kind, TRUST_REGRESSION_KINDS, `${label}.kind`);
  assertString(value.subject, `${label}.subject`, { maxBytes: 1000 });
  if (value.path !== null) canonicalPath(value.path, `${label}.path`);
  assertString(value.before, `${label}.before`, { maxBytes: 1000 });
  assertString(value.after, `${label}.after`, { maxBytes: 1000 });
  assertString(value.description, `${label}.description`, { maxBytes: 2000 });
}

export function validatePostEditArchitectureGraphDelta(value) {
  assertPlain(value, "post-edit architecture graph delta");
  const historical = value.schema_version === HISTORICAL_GRAPH_DELTA_SCHEMA_VERSION;
  const current = value.schema_version === GRAPH_DELTA_SCHEMA_VERSION;
  if (!historical && !current) {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_DELTA_SCHEMA", "post-edit graph delta schema is unsupported");
  }
  const deltaKeys = historical ? HISTORICAL_GRAPH_DELTA_KEYS : GRAPH_DELTA_KEYS;
  const countKeys = historical ? HISTORICAL_DELTA_COUNT_KEYS : DELTA_COUNT_KEYS;
  exact(value, deltaKeys, deltaKeys, "post-edit architecture graph delta");
  assertFingerprint(value.planned_graph_fingerprint, "post-edit architecture graph delta.planned_graph_fingerprint");
  assertFingerprint(value.final_graph_fingerprint, "post-edit architecture graph delta.final_graph_fingerprint");
  for (const key of STRUCTURAL_DELTA_COUNT_KEYS) {
    assertArray(value[key], `post-edit architecture graph delta.${key}`, { max: DELTA_LIMIT, item: validateDeltaSignature });
    if (new Set(value[key].map((entry) => entry.signature)).size !== value[key].length) {
      throw new ContractError("QUALITY_POST_ARCHITECTURE_DELTA_DUPLICATE", `post-edit architecture graph delta.${key} has duplicate signatures`);
    }
    if (canonicalJson(value[key]) !== canonicalJson([...value[key]].sort((left, right) => left.signature.localeCompare(right.signature)))) {
      throw new ContractError("QUALITY_POST_ARCHITECTURE_DELTA_ORDER", `post-edit architecture graph delta.${key} must be sorted`);
    }
  }
  for (const key of ["unexpected_public_contracts", "unexpected_dependency_directions", "unexpected_side_effect_edges"]) {
    assertStringArray(value[key], `post-edit architecture graph delta.${key}`, { max: DELTA_LIMIT, maxBytes: 1000 });
    if (canonicalJson(value[key]) !== canonicalJson([...new Set(value[key])].sort())) {
      throw new ContractError("QUALITY_POST_ARCHITECTURE_DELTA_ORDER", `post-edit architecture graph delta.${key} must be sorted and unique`);
    }
  }
  if (current) {
    assertArray(value.trust_regressions, "post-edit architecture graph delta.trust_regressions", { max: DELTA_LIMIT, item: validateTrustRegression });
    if (new Set(value.trust_regressions.map((entry) => entry.id)).size !== value.trust_regressions.length) {
      throw new ContractError("QUALITY_POST_ARCHITECTURE_DELTA_DUPLICATE", "post-edit architecture graph delta has duplicate trust regressions");
    }
    if (canonicalJson(value.trust_regressions) !== canonicalJson([...value.trust_regressions].sort((left, right) => left.id.localeCompare(right.id)))) {
      throw new ContractError("QUALITY_POST_ARCHITECTURE_DELTA_ORDER", "post-edit architecture graph delta trust regressions must be sorted");
    }
  }
  assertArray(value.unplanned_items, "post-edit architecture graph delta.unplanned_items", {
    max: DELTA_LIMIT,
    item: (entry, label) => validateDeltaUnplannedItem(entry, label, { historical }),
  });
  if (new Set(value.unplanned_items.map((entry) => entry.id)).size !== value.unplanned_items.length) {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_DELTA_DUPLICATE", "post-edit architecture graph delta has duplicate unplanned items");
  }
  if (canonicalJson(value.unplanned_items) !== canonicalJson([...value.unplanned_items].sort((left, right) => left.id.localeCompare(right.id)))) {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_DELTA_ORDER", "post-edit architecture graph delta unplanned items must be sorted");
  }
  assertPlain(value.counts, "post-edit architecture graph delta.counts");
  exact(value.counts, countKeys, countKeys, "post-edit architecture graph delta.counts");
  for (const key of countKeys) {
    assertInteger(value.counts[key], `post-edit architecture graph delta.counts.${key}`, { min: 0, max: 4096 });
    const persistedCount = key === "trust_regressions"
      ? value.trust_regressions.length
      : value[key].reduce((sum, entry) => sum + entry.count, 0);
    if (persistedCount > value.counts[key]) {
      throw new ContractError("QUALITY_POST_ARCHITECTURE_DELTA_COUNT", `post-edit architecture graph delta.${key} exceeds its total count`);
    }
  }
  assertBoolean(value.truncated, "post-edit architecture graph delta.truncated");
  if (!value.truncated) {
    for (const key of countKeys) {
      const persistedCount = key === "trust_regressions"
        ? value.trust_regressions.length
        : value[key].reduce((sum, entry) => sum + entry.count, 0);
      if (persistedCount !== value.counts[key]) {
        throw new ContractError("QUALITY_POST_ARCHITECTURE_DELTA_COUNT", `complete post-edit architecture graph delta.${key} omits changes`);
      }
    }
    const signatureCount = STRUCTURAL_DELTA_COUNT_KEYS.reduce((sum, key) => sum + value[key].length, 0)
      + (current ? value.trust_regressions.length : 0);
    if (value.unplanned_items.length !== signatureCount) {
      throw new ContractError("QUALITY_POST_ARCHITECTURE_DELTA_COUNT", "complete post-edit architecture graph delta must classify every changed signature");
    }
  }
  assertFingerprint(value.fingerprint, "post-edit architecture graph delta.fingerprint");
  if (!fingerprintsEqual(value.fingerprint, fingerprint(fingerprintInput(value)))) {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_DELTA_FINGERPRINT", "post-edit architecture graph delta fingerprint is invalid");
  }
  return value;
}

export function derivePostEditArchitectureGraphDelta({ planned_graph: plannedGraph, final_graph: finalGraph } = {}) {
  validateEngineeringImpactGraph(plannedGraph);
  validateEngineeringImpactGraph(finalGraph);
  if (plannedGraph.risk_class !== finalGraph.risk_class) {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_BINDING", "planned and final graphs must use the same risk class");
  }
  const planned = semanticGraphItems(plannedGraph);
  const final = semanticGraphItems(finalGraph);
  const changes = {
    added_nodes: multisetDifference(final.nodes, planned.nodes),
    removed_nodes: multisetDifference(planned.nodes, final.nodes),
    added_edges: multisetDifference(final.edges, planned.edges),
    removed_edges: multisetDifference(planned.edges, final.edges),
    added_affected_paths: multisetDifference(final.affectedPaths, planned.affectedPaths),
    removed_affected_paths: multisetDifference(planned.affectedPaths, final.affectedPaths),
  };
  const nodeChanges = [
    ...changes.added_nodes.map((entry) => ({ change: "added", entry })),
    ...changes.removed_nodes.map((entry) => ({ change: "removed", entry })),
  ];
  const edgeChanges = [
    ...changes.added_edges.map((entry) => ({ change: "added", entry })),
    ...changes.removed_edges.map((entry) => ({ change: "removed", entry })),
  ];
  const pathChanges = [
    ...changes.added_affected_paths.map((entry) => ({ change: "added", entry })),
    ...changes.removed_affected_paths.map((entry) => ({ change: "removed", entry })),
  ];
  const publicContracts = uniqueBounded(nodeChanges
    .filter(({ entry }) => PUBLIC_CONTRACT_NODE_KINDS.has(entry.value.kind))
    .map(({ change, entry }) => boundedText(`${change}:${entry.value.kind}:${nodeDisplay(entry.value)}`, 1000)));
  const dependencies = uniqueBounded(edgeChanges
    .filter(({ entry }) => DEPENDENCY_RELATIONSHIPS.has(entry.value.relationship))
    .map(({ change, entry }) => boundedText(`${change}:${edgeDisplay(entry.value)}`, 1000)));
  const sideEffects = uniqueBounded(edgeChanges
    .filter(({ entry }) => edgeIsSideEffect(entry.value))
    .map(({ change, entry }) => boundedText(`${change}:${edgeDisplay(entry.value)}`, 1000)));
  const trustRegressions = deriveTrustRegressions(plannedGraph, finalGraph);
  const allUnplanned = [
    ...nodeChanges.map(({ change, entry }) => deltaUnplannedItem(change, "node", entry, finalGraph.risk_class)),
    ...edgeChanges.map(({ change, entry }) => deltaUnplannedItem(change, "edge", entry, finalGraph.risk_class)),
    ...pathChanges.map(({ change, entry }) => deltaUnplannedItem(change, "path", entry, finalGraph.risk_class)),
    ...trustRegressions.map((entry) => trustRegressionUnplannedItem(entry, finalGraph.risk_class)),
  ];
  const uniqueUnplanned = [...new Map(allUnplanned.map((entry) => [entry.id, entry])).values()]
    .sort((left, right) => left.id.localeCompare(right.id));
  const truncated = Object.values(changes).some((entries) => entries.length > DELTA_LIMIT)
    || publicContracts.truncated || dependencies.truncated || sideEffects.truncated
    || trustRegressions.length > DELTA_LIMIT || uniqueUnplanned.length > DELTA_LIMIT;
  const source = {
    schema_version: GRAPH_DELTA_SCHEMA_VERSION,
    planned_graph_fingerprint: plannedGraph.fingerprint,
    final_graph_fingerprint: finalGraph.fingerprint,
    added_nodes: persistedSignatures(changes.added_nodes),
    removed_nodes: persistedSignatures(changes.removed_nodes),
    added_edges: persistedSignatures(changes.added_edges),
    removed_edges: persistedSignatures(changes.removed_edges),
    added_affected_paths: persistedSignatures(changes.added_affected_paths),
    removed_affected_paths: persistedSignatures(changes.removed_affected_paths),
    unexpected_public_contracts: publicContracts.values,
    unexpected_dependency_directions: dependencies.values,
    unexpected_side_effect_edges: sideEffects.values,
    trust_regressions: trustRegressions.slice(0, DELTA_LIMIT),
    unplanned_items: uniqueUnplanned.slice(0, DELTA_LIMIT),
    counts: {
      ...Object.fromEntries(STRUCTURAL_DELTA_COUNT_KEYS.map((key) => [key, changes[key].reduce((sum, entry) => sum + entry.count, 0)])),
      trust_regressions: trustRegressions.length,
    },
    truncated,
  };
  const delta = deepFrozenClone({ ...source, fingerprint: fingerprint(source) }, "post-edit architecture graph delta");
  validatePostEditArchitectureGraphDelta(delta);
  return delta;
}

function validateCommonEvidence(value) {
  assertSafeId(value.evidence_id, "post-edit architecture evidence.evidence_id");
  if (!POST_EDIT_ARCHITECTURE_MECHANISM_KINDS.includes(value.mechanism_kind)) {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_MECHANISM", "post-edit architecture evidence mechanism is unsupported");
  }
  validateImplementationIdentity(value.extractor_identity, "post-edit architecture evidence.extractor_identity");
  validateImplementationIdentity(value.evaluator_identity, "post-edit architecture evidence.evaluator_identity", { evaluator: true });
  if (value.command_receipt_fingerprint !== null) {
    assertFingerprint(value.command_receipt_fingerprint, "post-edit architecture evidence.command_receipt_fingerprint");
  }
  if ((value.mechanism_kind === "project_check") !== (value.command_receipt_fingerprint !== null)) {
    throw new ContractError(
      "QUALITY_POST_ARCHITECTURE_RECEIPT",
      "project-check architecture evidence requires exactly one trusted command receipt binding",
    );
  }
  for (const key of ["policy_fingerprint", "final_workspace_fingerprint", "extracted_graph_fingerprint"]) {
    assertFingerprint(value[key], `post-edit architecture evidence.${key}`);
  }
  assertFingerprint(value.extractor_output_fingerprint, "post-edit architecture evidence.extractor_output_fingerprint");
  validateArchitectureEvaluation(value.architecture_evaluation);
  const evaluation = value.architecture_evaluation;
  if (evaluation.status === "not_configured" || evaluation.policy_fingerprint !== value.policy_fingerprint
    || evaluation.graph_fingerprint !== value.extracted_graph_fingerprint) {
    throw new ContractError(
      "QUALITY_POST_ARCHITECTURE_BINDING",
      "post-edit architecture evidence does not bind its configured policy and extracted graph",
    );
  }
  const evaluatorIds = evaluation.evaluators.map((entry) => entry.id).sort();
  if (evaluatorIds.length !== value.evaluator_identity.algorithm_ids.length
    || evaluatorIds.some((entry, index) => entry !== value.evaluator_identity.algorithm_ids[index])) {
    throw new ContractError(
      "QUALITY_POST_ARCHITECTURE_IDENTITY",
      "post-edit architecture evaluator identity does not cover the executed algorithms",
    );
  }
  assertIso(value.completed_at, "post-edit architecture evidence.completed_at");
  assertFingerprint(value.fingerprint, "post-edit architecture evidence.fingerprint");
  if (!fingerprintsEqual(value.fingerprint, fingerprint(fingerprintInput(value)))) {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_FINGERPRINT", "post-edit architecture evidence fingerprint is invalid");
  }
}

export function validatePostEditArchitectureEvidence(value) {
  assertPlain(value, "post-edit architecture evidence");
  const legacy = value.schema_version === LEGACY_SCHEMA_VERSION && value.producer === LEGACY_PRODUCER;
  const historicalGraphEvidence = value.schema_version === HISTORICAL_GRAPH_EVIDENCE_SCHEMA_VERSION
    && value.producer === HISTORICAL_GRAPH_EVIDENCE_PRODUCER;
  const current = value.schema_version === POST_EDIT_ARCHITECTURE_EVIDENCE_SCHEMA_VERSION
    && value.producer === POST_EDIT_ARCHITECTURE_EVIDENCE_PRODUCER;
  if (!legacy && !historicalGraphEvidence && !current) {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_SCHEMA", "post-edit architecture evidence schema or producer is unsupported");
  }
  exact(value, legacy ? LEGACY_EVIDENCE_KEYS : EVIDENCE_KEYS, legacy ? LEGACY_EVIDENCE_KEYS : EVIDENCE_KEYS, "post-edit architecture evidence");
  validateCommonEvidence(value);
  if (historicalGraphEvidence || current) {
    assertFingerprint(value.planned_graph_fingerprint, "post-edit architecture evidence.planned_graph_fingerprint");
    validatePostEditArchitectureGraphDelta(value.graph_delta);
    const expectedDeltaVersion = historicalGraphEvidence
      ? HISTORICAL_GRAPH_DELTA_SCHEMA_VERSION
      : GRAPH_DELTA_SCHEMA_VERSION;
    if (value.graph_delta.schema_version !== expectedDeltaVersion) {
      throw new ContractError("QUALITY_POST_ARCHITECTURE_DELTA_SCHEMA", "post-edit architecture evidence binds the wrong graph-delta schema");
    }
    if (value.architecture_evaluation.baseline_graph_fingerprint !== value.planned_graph_fingerprint
      || value.graph_delta.planned_graph_fingerprint !== value.planned_graph_fingerprint
      || value.graph_delta.final_graph_fingerprint !== value.extracted_graph_fingerprint) {
      throw new ContractError("QUALITY_POST_ARCHITECTURE_BINDING", "post-edit graph delta does not bind the planned and extracted graphs");
    }
  }
  return value;
}

export function postEditArchitectureEvidenceHasAuthoritativeGraphDelta(value) {
  validatePostEditArchitectureEvidence(value);
  return value.schema_version === POST_EDIT_ARCHITECTURE_EVIDENCE_SCHEMA_VERSION
    && value.producer === POST_EDIT_ARCHITECTURE_EVIDENCE_PRODUCER;
}

export function createPostEditArchitectureEvidence(input) {
  assertPlain(input, "post-edit architecture evidence input");
  const keys = [
    "evidence_id",
    "mechanism_kind",
    "extractor_identity",
    "evaluator_identity",
    "command_receipt_fingerprint",
    "extractor_output_fingerprint",
    "policy",
    "final_workspace_fingerprint",
    "planned_graph",
    "extracted_graph",
    "architecture_evaluation",
    "completed_at",
  ];
  exact(input, keys, keys.filter((key) => key !== "planned_graph"), "post-edit architecture evidence input");
  if (input.planned_graph === undefined) {
    throw new ContractError("QUALITY_POST_ARCHITECTURE_BASELINE_MISSING", "post-edit architecture evidence requires the exact planned graph for machine-derived reconciliation");
  }
  validateArchitecturePolicy(input.policy);
  validateEngineeringImpactGraph(input.planned_graph);
  validateEngineeringImpactGraph(input.extracted_graph);
  validateArchitectureEvaluation(input.architecture_evaluation);
  if (input.architecture_evaluation.policy_fingerprint !== input.policy.fingerprint
    || input.architecture_evaluation.graph_fingerprint !== input.extracted_graph.fingerprint
    || input.architecture_evaluation.baseline_graph_fingerprint !== input.planned_graph.fingerprint) {
    throw new ContractError(
      "QUALITY_POST_ARCHITECTURE_BINDING",
      "post-edit architecture evaluation does not bind the supplied policy, planned graph, and extracted graph",
    );
  }
  const graphDelta = derivePostEditArchitectureGraphDelta({
    planned_graph: input.planned_graph,
    final_graph: input.extracted_graph,
  });
  const source = {
    schema_version: POST_EDIT_ARCHITECTURE_EVIDENCE_SCHEMA_VERSION,
    evidence_id: input.evidence_id,
    producer: POST_EDIT_ARCHITECTURE_EVIDENCE_PRODUCER,
    mechanism_kind: input.mechanism_kind,
    extractor_identity: input.extractor_identity,
    evaluator_identity: input.evaluator_identity,
    command_receipt_fingerprint: input.command_receipt_fingerprint,
    extractor_output_fingerprint: input.extractor_output_fingerprint,
    policy_fingerprint: input.policy.fingerprint,
    final_workspace_fingerprint: input.final_workspace_fingerprint,
    extracted_graph_fingerprint: input.extracted_graph.fingerprint,
    planned_graph_fingerprint: input.planned_graph.fingerprint,
    graph_delta: graphDelta,
    architecture_evaluation: input.architecture_evaluation,
    completed_at: input.completed_at,
  };
  const evidence = { ...source, fingerprint: fingerprint(source) };
  validatePostEditArchitectureEvidence(evidence);
  return deepFrozenClone(evidence, "post-edit architecture evidence");
}
