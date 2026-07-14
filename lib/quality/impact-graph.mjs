import { assertEnum } from "../feedback/contracts.mjs";
import { normalizeRelativePath } from "../feedback/privacy.mjs";
import {
  ENGINEERING_IMPACT_GRAPH_SCHEMA_VERSION,
  IMPACT_NODE_KINDS,
  IMPACT_RELATIONSHIP_KINDS,
  QUALITY_CONFIDENCE_LEVELS,
  QUALITY_LIMITS,
  QUALITY_RISK_CLASSES,
} from "./constants.mjs";
import {
  ContractError,
  assertArray,
  assertBoolean,
  assertFingerprint,
  assertPlain,
  assertSchemaVersion,
  assertStableTypedId,
  assertString,
  assertStringArray,
  assertUniqueIds,
  canonicalJson,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
  validateEvidenceReferences,
} from "./validation.mjs";

export const IMPACT_BOUNDARY_CATEGORIES = Object.freeze([
  "direct_affected_paths",
  "transitive_affected_paths",
  "externally_reachable_entry_points",
  "downstream_state_or_side_effects",
  "cross_boundary_contracts",
  "critical_path_tests",
  "relevant_unknown_paths",
  "excluded_sibling_paths",
]);

export const IMPACT_BOUNDARY_KINDS = Object.freeze([
  "entry_point",
  "module",
  "package",
  "process",
  "service",
  "persistence",
  "external",
  "operational",
  "none",
]);

export const IMPACT_COVERAGE_LEVELS = Object.freeze(["complete", "partial", "unknown"]);

const GRAPH_KEYS = Object.freeze([
  "schema_version",
  "graph_id",
  "risk_class",
  "nodes",
  "edges",
  "affected_paths",
  "excluded_siblings",
  "unknowns",
  "coverage",
  "fingerprint",
]);

const GRAPH_INPUT_KEYS = Object.freeze(GRAPH_KEYS.filter((key) => !["schema_version", "fingerprint"].includes(key)));
const STANDARD_LITE_BOUNDARIES = Object.freeze([
  "direct_affected_paths",
  "externally_reachable_entry_points",
  "downstream_state_or_side_effects",
]);

function canonicalPath(value, label) {
  assertString(value, label, { maxBytes: QUALITY_LIMITS.stringBytes });
  const normalized = normalizeRelativePath(value, label);
  if (normalized !== value) {
    throw new ContractError("QUALITY_PATH_CANONICAL", `${label} must use canonical forward slashes`);
  }
  return value;
}

function validateCanonicalEvidenceReferences(value, label, options = {}) {
  validateEvidenceReferences(value, label, options);
  value.forEach((entry, index) => {
    if (["file", "doc"].includes(entry.kind)) canonicalPath(entry.value, `${label}[${index}].value`);
  });
  return value;
}

function validateConfidenceAndEvidence(value, label) {
  assertEnum(value.confidence, QUALITY_CONFIDENCE_LEVELS, `${label}.confidence`);
  assertEnum(value.coverage, IMPACT_COVERAGE_LEVELS, `${label}.coverage`);
  validateCanonicalEvidenceReferences(value.evidence_refs, `${label}.evidence_refs`, {
    min: value.confidence === "unknown" ? 0 : 1,
  });
  if (value.confidence === "unknown" && value.coverage !== "unknown") {
    throw new ContractError("QUALITY_IMPACT_UNKNOWN_COVERAGE", `${label} with unknown confidence must have unknown coverage`);
  }
}

function validateNode(value, label) {
  const keys = [
    "id",
    "kind",
    "path",
    "symbol",
    "label",
    "boundary",
    "confidence",
    "coverage",
    "evidence_refs",
  ];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "NODE", `${label}.id`);
  assertEnum(value.kind, IMPACT_NODE_KINDS, `${label}.kind`);
  if (value.path !== null) canonicalPath(value.path, `${label}.path`);
  assertString(value.symbol, `${label}.symbol`, { nullable: true, maxBytes: 512 });
  assertString(value.label, `${label}.label`, { maxBytes: 512 });
  assertEnum(value.boundary, IMPACT_BOUNDARY_KINDS, `${label}.boundary`);
  validateConfidenceAndEvidence(value, label);
  return value;
}

function validateEdge(value, label) {
  const keys = ["id", "from", "to", "relationship", "confidence", "coverage", "evidence_refs"];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "EDGE", `${label}.id`);
  assertStableTypedId(value.from, "NODE", `${label}.from`);
  assertStableTypedId(value.to, "NODE", `${label}.to`);
  assertEnum(value.relationship, IMPACT_RELATIONSHIP_KINDS, `${label}.relationship`);
  validateConfidenceAndEvidence(value, label);
  return value;
}

function validateAffectedPath(value, label) {
  const keys = [
    "id",
    "kind",
    "node_ids",
    "edge_ids",
    "critical",
    "verification_node_ids",
    "confidence",
    "evidence_refs",
  ];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "BLAST", `${label}.id`);
  assertEnum(value.kind, ["direct", "transitive"], `${label}.kind`);
  assertStringArray(value.node_ids, `${label}.node_ids`, { min: value.kind === "direct" ? 2 : 3, max: 128, maxBytes: 128 });
  assertStringArray(value.edge_ids, `${label}.edge_ids`, { min: value.kind === "direct" ? 1 : 2, max: 127, maxBytes: 128 });
  if (value.node_ids.length !== value.edge_ids.length + 1) {
    throw new ContractError("QUALITY_IMPACT_PATH_SHAPE", `${label} must contain exactly one more node than edge`);
  }
  if (value.kind === "direct" && (value.node_ids.length !== 2 || value.edge_ids.length !== 1)) {
    throw new ContractError("QUALITY_IMPACT_PATH_DIRECT", `${label} direct path must contain two nodes and one edge`);
  }
  assertBoolean(value.critical, `${label}.critical`);
  assertStringArray(value.verification_node_ids, `${label}.verification_node_ids`, { max: 64, maxBytes: 128 });
  assertEnum(value.confidence, QUALITY_CONFIDENCE_LEVELS, `${label}.confidence`);
  validateCanonicalEvidenceReferences(value.evidence_refs, `${label}.evidence_refs`, {
    min: value.confidence === "unknown" ? 0 : 1,
  });
  return value;
}

function validateExcludedSibling(value, label) {
  const keys = ["id", "path", "reason", "confidence", "evidence_refs"];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "EXCLUDED", `${label}.id`);
  canonicalPath(value.path, `${label}.path`);
  assertString(value.reason, `${label}.reason`);
  assertEnum(value.confidence, ["observed", "inferred"], `${label}.confidence`);
  validateCanonicalEvidenceReferences(value.evidence_refs, `${label}.evidence_refs`, { min: 1 });
  return value;
}

function validateUnknown(value, label) {
  const keys = ["id", "statement", "scope_ids", "impact", "resolution_plan", "owner", "blocking", "evidence_refs"];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "GRAPHUNKNOWN", `${label}.id`);
  assertString(value.statement, `${label}.statement`);
  assertStringArray(value.scope_ids, `${label}.scope_ids`, { min: 1, max: 128, maxBytes: 128 });
  assertString(value.impact, `${label}.impact`);
  assertString(value.resolution_plan, `${label}.resolution_plan`);
  assertString(value.owner, `${label}.owner`, { maxBytes: 256 });
  assertBoolean(value.blocking, `${label}.blocking`);
  validateCanonicalEvidenceReferences(value.evidence_refs, `${label}.evidence_refs`);
  return value;
}

function validateBoundaryCoverage(value, label) {
  const keys = [
    "id",
    "category",
    "classification",
    "node_ids",
    "edge_ids",
    "path_ids",
    "unknown_ids",
    "excluded_sibling_ids",
    "rationale",
    "evidence_refs",
  ];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "BOUNDARY", `${label}.id`);
  assertEnum(value.category, IMPACT_BOUNDARY_CATEGORIES, `${label}.category`);
  assertEnum(value.classification, ["represented", "reasoned_excluded"], `${label}.classification`);
  for (const field of ["node_ids", "edge_ids", "path_ids", "unknown_ids", "excluded_sibling_ids"]) {
    assertStringArray(value[field], `${label}.${field}`, { max: 128, maxBytes: 128 });
  }
  assertString(value.rationale, `${label}.rationale`, { nullable: true });
  validateCanonicalEvidenceReferences(value.evidence_refs, `${label}.evidence_refs`, { min: 1 });
  const references = value.node_ids.length
    + value.edge_ids.length
    + value.path_ids.length
    + value.unknown_ids.length
    + value.excluded_sibling_ids.length;
  if (value.classification === "represented" && (references === 0 || value.rationale !== null)) {
    throw new ContractError("QUALITY_IMPACT_BOUNDARY_REPRESENTED", `${label} represented category needs references and no exclusion rationale`);
  }
  if (value.classification === "reasoned_excluded" && (references !== 0 || value.rationale === null)) {
    throw new ContractError("QUALITY_IMPACT_BOUNDARY_EXCLUDED", `${label} reasoned exclusion needs a rationale and no subject references`);
  }
  return value;
}

function validateCoverage(value, label, riskClass) {
  const keys = [
    "completeness",
    "semantic_tool_status",
    "semantic_tools",
    "fallback_tools",
    "reduced_semantic_coverage",
    "truncated",
    "truncation_reason",
    "available_evaluator_ids",
    "unavailable_evaluator_ids",
    "boundaries",
    "evidence_refs",
  ];
  exact(value, keys, keys, label);
  assertEnum(value.completeness, IMPACT_COVERAGE_LEVELS, `${label}.completeness`);
  assertEnum(value.semantic_tool_status, ["available", "unavailable", "not_requested"], `${label}.semantic_tool_status`);
  assertStringArray(value.semantic_tools, `${label}.semantic_tools`, { max: 64, maxBytes: 128 });
  assertStringArray(value.fallback_tools, `${label}.fallback_tools`, { max: 64, maxBytes: 128 });
  assertBoolean(value.reduced_semantic_coverage, `${label}.reduced_semantic_coverage`);
  assertBoolean(value.truncated, `${label}.truncated`);
  assertString(value.truncation_reason, `${label}.truncation_reason`, { nullable: true });
  assertStringArray(value.available_evaluator_ids, `${label}.available_evaluator_ids`, { max: 64, maxBytes: 128 });
  assertStringArray(value.unavailable_evaluator_ids, `${label}.unavailable_evaluator_ids`, { max: 64, maxBytes: 128 });
  const evaluatorOverlap = value.available_evaluator_ids.filter((id) => value.unavailable_evaluator_ids.includes(id));
  if (evaluatorOverlap.length > 0) {
    throw new ContractError("QUALITY_IMPACT_EVALUATOR_STATE", `${label} evaluator cannot be both available and unavailable: ${evaluatorOverlap.join(", ")}`);
  }
  assertArray(value.boundaries, `${label}.boundaries`, {
    min: riskClass === "standard-lite" ? STANDARD_LITE_BOUNDARIES.length : IMPACT_BOUNDARY_CATEGORIES.length,
    max: IMPACT_BOUNDARY_CATEGORIES.length,
    item: validateBoundaryCoverage,
  });
  assertUniqueIds(value.boundaries, `${label}.boundaries`);
  const categories = value.boundaries.map((entry) => entry.category);
  if (new Set(categories).size !== categories.length) {
    throw new ContractError("QUALITY_IMPACT_BOUNDARY_DUPLICATE", `${label}.boundaries contains duplicate categories`);
  }
  const required = riskClass === "standard-lite" ? STANDARD_LITE_BOUNDARIES : IMPACT_BOUNDARY_CATEGORIES;
  const missing = required.filter((category) => !categories.includes(category));
  if (missing.length > 0) {
    throw new ContractError("QUALITY_IMPACT_BOUNDARY_MISSING", `${label}.boundaries is missing ${missing.join(", ")}`);
  }
  validateCanonicalEvidenceReferences(value.evidence_refs, `${label}.evidence_refs`, { min: 1 });
  if (
    value.available_evaluator_ids.length + value.unavailable_evaluator_ids.length > 0
    && !value.evidence_refs.some((entry) => ["check", "runtime"].includes(entry.kind))
  ) {
    throw new ContractError("QUALITY_IMPACT_EVALUATOR_EVIDENCE", `${label} evaluator availability needs a named check or runtime evidence reference`);
  }

  if (value.semantic_tool_status === "available" && value.semantic_tools.length === 0) {
    throw new ContractError("QUALITY_IMPACT_SEMANTIC_TOOLS", `${label} available semantic tools must be named`);
  }
  if (value.semantic_tool_status !== "available" && value.semantic_tools.length > 0) {
    throw new ContractError("QUALITY_IMPACT_SEMANTIC_TOOLS", `${label} cannot name available semantic tools for status ${value.semantic_tool_status}`);
  }
  if (value.semantic_tool_status === "unavailable" && (value.fallback_tools.length === 0 || !value.reduced_semantic_coverage)) {
    throw new ContractError("QUALITY_IMPACT_REDUCED_COVERAGE", `${label} unavailable semantic tools require named fallbacks and reduced coverage`);
  }
  if (value.semantic_tool_status === "available" && value.reduced_semantic_coverage) {
    throw new ContractError("QUALITY_IMPACT_REDUCED_COVERAGE", `${label} cannot claim reduced semantic coverage when tools were available`);
  }
  if (value.semantic_tool_status === "not_requested" && (value.fallback_tools.length > 0 || value.reduced_semantic_coverage)) {
    throw new ContractError("QUALITY_IMPACT_SEMANTIC_NOT_REQUESTED", `${label} not_requested semantic tooling cannot claim fallback execution or reduced coverage`);
  }
  if (["high", "critical"].includes(riskClass) && value.semantic_tool_status === "not_requested") {
    throw new ContractError("QUALITY_IMPACT_SEMANTIC_NOT_REQUESTED", `${label} high and critical graphs must record available or unavailable semantic tooling`);
  }
  if (value.truncated !== (value.truncation_reason !== null)) {
    throw new ContractError("QUALITY_IMPACT_TRUNCATION", `${label} truncation flag and reason must agree`);
  }
  if (value.truncated && value.completeness === "complete") {
    throw new ContractError("QUALITY_IMPACT_TRUNCATION", `${label} truncated coverage cannot be complete`);
  }
  return value;
}

function assertReferences(graph) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const pathMap = new Map(graph.affected_paths.map((entry) => [entry.id, entry]));
  const paths = new Set(pathMap.keys());
  const unknowns = new Set(graph.unknowns.map((entry) => entry.id));
  const excluded = new Set(graph.excluded_siblings.map((entry) => entry.id));
  const allScopeIds = new Set([...nodes.keys(), ...edges.keys(), ...paths, ...excluded]);

  for (const edge of graph.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) {
      throw new ContractError("QUALITY_IMPACT_DANGLING_EDGE", `${edge.id} has an unknown endpoint`);
    }
  }
  for (const affectedPath of graph.affected_paths) {
    for (const nodeId of affectedPath.node_ids) {
      if (!nodes.has(nodeId)) throw new ContractError("QUALITY_IMPACT_DANGLING_PATH", `${affectedPath.id} references unknown node ${nodeId}`);
    }
    for (const verificationNodeId of affectedPath.verification_node_ids) {
      const node = nodes.get(verificationNodeId);
      if (!node || node.kind !== "test") {
        throw new ContractError("QUALITY_IMPACT_DANGLING_TEST", `${affectedPath.id} references non-test verification node ${verificationNodeId}`);
      }
    }
    for (let index = 0; index < affectedPath.edge_ids.length; index += 1) {
      const edgeId = affectedPath.edge_ids[index];
      const edge = edges.get(edgeId);
      if (!edge) throw new ContractError("QUALITY_IMPACT_DANGLING_PATH", `${affectedPath.id} references unknown edge ${edgeId}`);
      if (edge.from !== affectedPath.node_ids[index] || edge.to !== affectedPath.node_ids[index + 1]) {
        throw new ContractError("QUALITY_IMPACT_PATH_CHAIN", `${affectedPath.id} edge ${edgeId} does not connect its ordered nodes`);
      }
    }
    if (affectedPath.critical && affectedPath.verification_node_ids.length === 0) {
      throw new ContractError("QUALITY_IMPACT_CRITICAL_TEST", `${affectedPath.id} critical path needs a verification test node`);
    }
  }
  for (const unknown of graph.unknowns) {
    for (const scopeId of unknown.scope_ids) {
      if (!allScopeIds.has(scopeId)) {
        throw new ContractError("QUALITY_IMPACT_DANGLING_UNKNOWN", `${unknown.id} references unknown scope ${scopeId}`);
      }
    }
  }
  const unknownScopes = new Set(graph.unknowns.flatMap((entry) => entry.scope_ids));
  for (const item of [...graph.nodes, ...graph.edges, ...graph.affected_paths]) {
    if (item.confidence === "unknown" && !unknownScopes.has(item.id)) {
      throw new ContractError("QUALITY_IMPACT_UNKNOWN_PLAN", `${item.id} has unknown confidence without a resolution-plan record`);
    }
  }
  for (const boundary of graph.coverage.boundaries) {
    for (const nodeId of boundary.node_ids) if (!nodes.has(nodeId)) throw new ContractError("QUALITY_IMPACT_DANGLING_BOUNDARY", `${boundary.id} references unknown node ${nodeId}`);
    for (const edgeId of boundary.edge_ids) if (!edges.has(edgeId)) throw new ContractError("QUALITY_IMPACT_DANGLING_BOUNDARY", `${boundary.id} references unknown edge ${edgeId}`);
    for (const pathId of boundary.path_ids) if (!paths.has(pathId)) throw new ContractError("QUALITY_IMPACT_DANGLING_BOUNDARY", `${boundary.id} references unknown path ${pathId}`);
    for (const unknownId of boundary.unknown_ids) if (!unknowns.has(unknownId)) throw new ContractError("QUALITY_IMPACT_DANGLING_BOUNDARY", `${boundary.id} references unknown unknown ${unknownId}`);
    for (const excludedId of boundary.excluded_sibling_ids) if (!excluded.has(excludedId)) throw new ContractError("QUALITY_IMPACT_DANGLING_BOUNDARY", `${boundary.id} references unknown exclusion ${excludedId}`);
    if (boundary.classification !== "represented") continue;
    const selectedNodes = boundary.node_ids.map((id) => nodes.get(id));
    const selectedEdges = boundary.edge_ids.map((id) => edges.get(id));
    const selectedPaths = boundary.path_ids.map((id) => pathMap.get(id));
    let categoryMatched = false;
    if (boundary.category === "direct_affected_paths") categoryMatched = selectedPaths.some((entry) => entry.kind === "direct");
    if (boundary.category === "transitive_affected_paths") categoryMatched = selectedPaths.some((entry) => entry.kind === "transitive");
    if (boundary.category === "externally_reachable_entry_points") {
      categoryMatched = selectedNodes.some((entry) => entry.boundary === "entry_point" || ["public_api", "command"].includes(entry.kind));
    }
    if (boundary.category === "downstream_state_or_side_effects") {
      categoryMatched = selectedNodes.some((entry) => (
        ["data_store", "cache", "external_dependency", "background_job", "event_producer"].includes(entry.kind)
        || ["persistence", "external"].includes(entry.boundary)
      )) || selectedEdges.some((entry) => ["writes", "persists", "publishes", "invalidates", "emits"].includes(entry.relationship));
    }
    if (boundary.category === "cross_boundary_contracts") {
      categoryMatched = selectedNodes.some((entry) => ["public_api", "contract", "data_shape", "serialization_boundary", "config"].includes(entry.kind))
        || selectedEdges.some((entry) => nodes.get(entry.from).boundary !== nodes.get(entry.to).boundary);
    }
    if (boundary.category === "critical_path_tests") {
      categoryMatched = selectedNodes.some((entry) => entry.kind === "test")
        || selectedPaths.some((entry) => entry.critical && entry.verification_node_ids.length > 0);
    }
    if (boundary.category === "relevant_unknown_paths") categoryMatched = boundary.unknown_ids.length > 0;
    if (boundary.category === "excluded_sibling_paths") categoryMatched = boundary.excluded_sibling_ids.length > 0;
    if (!categoryMatched) {
      throw new ContractError("QUALITY_IMPACT_BOUNDARY_SUBJECT", `${boundary.id} does not reference evidence matching ${boundary.category}`);
    }
  }
  if (
    graph.coverage.completeness === "complete"
    && (
      graph.unknowns.length > 0
      || [...graph.nodes, ...graph.edges].some((entry) => entry.coverage !== "complete" || entry.confidence === "unknown")
      || graph.affected_paths.some((entry) => entry.confidence === "unknown")
    )
  ) {
    throw new ContractError("QUALITY_IMPACT_INCOMPLETE", "complete impact coverage cannot contain unknown or partially covered subjects");
  }
}

function fingerprintInput(graph) {
  const copy = { ...graph };
  delete copy.fingerprint;
  return copy;
}

export function validateEngineeringImpactGraph(value) {
  exact(value, GRAPH_KEYS, GRAPH_KEYS, "engineering impact graph");
  assertSchemaVersion(value.schema_version, ENGINEERING_IMPACT_GRAPH_SCHEMA_VERSION, "engineering impact graph");
  assertStableTypedId(value.graph_id, "GRAPH", "engineering impact graph.graph_id");
  assertEnum(value.risk_class, QUALITY_RISK_CLASSES, "engineering impact graph.risk_class");
  assertArray(value.nodes, "engineering impact graph.nodes", {
    min: 1,
    max: QUALITY_LIMITS.graphNodes,
    item: validateNode,
  });
  assertUniqueIds(value.nodes, "engineering impact graph.nodes");
  assertArray(value.edges, "engineering impact graph.edges", {
    max: QUALITY_LIMITS.graphEdges,
    item: validateEdge,
  });
  assertUniqueIds(value.edges, "engineering impact graph.edges");
  assertArray(value.affected_paths, "engineering impact graph.affected_paths", {
    min: ["high", "critical"].includes(value.risk_class) ? 1 : 0,
    max: QUALITY_LIMITS.arrayItems,
    item: validateAffectedPath,
  });
  assertUniqueIds(value.affected_paths, "engineering impact graph.affected_paths");
  assertArray(value.excluded_siblings, "engineering impact graph.excluded_siblings", {
    max: QUALITY_LIMITS.arrayItems,
    item: validateExcludedSibling,
  });
  assertUniqueIds(value.excluded_siblings, "engineering impact graph.excluded_siblings");
  assertArray(value.unknowns, "engineering impact graph.unknowns", {
    max: QUALITY_LIMITS.arrayItems,
    item: validateUnknown,
  });
  assertUniqueIds(value.unknowns, "engineering impact graph.unknowns");
  validateCoverage(value.coverage, "engineering impact graph.coverage", value.risk_class);
  assertReferences(value);
  assertFingerprint(value.fingerprint, "engineering impact graph.fingerprint");
  const expected = fingerprint(fingerprintInput(value));
  if (!fingerprintsEqual(value.fingerprint, expected)) {
    throw new ContractError("QUALITY_IMPACT_FINGERPRINT", "engineering impact graph fingerprint does not match persisted fields");
  }
  return value;
}

export function buildEngineeringImpactGraph(input) {
  exact(input, GRAPH_INPUT_KEYS, GRAPH_INPUT_KEYS, "engineering impact graph input");
  const withoutFingerprint = {
    schema_version: ENGINEERING_IMPACT_GRAPH_SCHEMA_VERSION,
    ...JSON.parse(canonicalJson(input)),
  };
  const graph = {
    ...withoutFingerprint,
    fingerprint: fingerprint(withoutFingerprint),
  };
  validateEngineeringImpactGraph(graph);
  return deepFrozenClone(graph, "engineering impact graph");
}

export function engineeringImpactGraphFingerprintInput(graph) {
  validateEngineeringImpactGraph(graph);
  return deepFrozenClone(fingerprintInput(graph), "engineering impact graph fingerprint input");
}
