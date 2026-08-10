import fs from "node:fs";
import path from "node:path";

import { assertEnum } from "../feedback/contracts.mjs";
import { normalizeRelativePath } from "../feedback/privacy.mjs";
import { PREMORTEM_CATEGORIES } from "./constants.mjs";
import {
  ADVANCED_CONTEXT_TOOLS,
  MINIMAL_CONTEXT_TOOLS,
} from "./context-strategies.mjs";
import { detectInstalledContextToolSurface } from "./context-tool-overlay.mjs";
import { contentBackedInspectedPaths } from "./context-sufficiency.mjs";
import { buildEngineeringImpactGraph, IMPACT_BOUNDARY_CATEGORIES } from "./impact-graph.mjs";
import {
  ContractError,
  assertArray,
  assertBoolean,
  assertPlain,
  assertString,
  deepFrozenClone,
  exact,
} from "./validation.mjs";

const DOSSIER_ANALYSIS_KEYS = Object.freeze([
  "entry_path",
  "related_paths",
  "compatibility_decision",
  "compatibility_analysis",
  "owning_abstraction",
  "impact_analysis",
  "has_downstream_side_effects",
  "side_effect_analysis",
  "has_cross_boundary_contracts",
  "contract_analysis",
  "rollback_expectation",
  "recovery_expectation",
  "counterexample",
  "premortem_analysis",
  "unresolved_unknowns",
]);

const REPORT_ANALYSIS_KEYS = Object.freeze([
  "observed_system_behavior",
  "owning_abstraction",
  "input_summary",
  "output_summary",
  "falsification_observation",
  "sibling_variant_observation",
  "compatibility_observation",
  "negative_path_observation",
  "unresolved_questions",
]);

const WIDE_BOUNDARY_MAP = Object.freeze({
  module_service_map: ["direct_affected_paths", "transitive_affected_paths"],
  externally_reachable_entry_points: ["externally_reachable_entry_points"],
  direct_callers_callees: ["direct_affected_paths"],
  transitive_consumers_side_effects: ["transitive_affected_paths", "downstream_state_or_side_effects"],
  public_contracts_configuration: ["cross_boundary_contracts"],
  state_external_dependencies: ["downstream_state_or_side_effects"],
  existing_tests: ["critical_path_tests"],
  sibling_implementations: ["excluded_sibling_paths"],
  excluded_sibling_paths: ["excluded_sibling_paths"],
  relevant_unknown_paths: ["relevant_unknown_paths"],
});

const PROVISIONAL_DISCOVERY_ENTRY_LIMIT = 4096;
const PROVISIONAL_CONTROL_ROOTS = new Set([".git", ".oc_harness", "node_modules"]);
const PROVISIONAL_SOURCE_EXTENSIONS = new Set([
  ".c", ".cc", ".cpp", ".cs", ".go", ".java", ".js", ".jsx", ".kt",
  ".mjs", ".mts", ".php", ".py", ".rb", ".rs", ".swift", ".ts", ".tsx",
]);

function canonicalPath(value, label) {
  assertString(value, label, { maxBytes: 1024 });
  const normalized = normalizeRelativePath(value, label);
  if (normalized !== value || normalized === ".") {
    throw new ContractError("QUALITY_PATH_CANONICAL", `${label} must be a canonical repository-relative path`);
  }
  return normalized;
}

function stringList(value, label, { max = 16, pathValues = false } = {}) {
  assertArray(value, label, { max });
  const normalized = value.map((entry, index) => pathValues
    ? canonicalPath(entry, `${label}[${index}]`)
    : assertString(entry, `${label}[${index}]`, { maxBytes: 2000 }));
  if (new Set(normalized).size !== normalized.length) {
    throw new ContractError("QUALITY_DUPLICATE_VALUE", `${label} contains duplicates`);
  }
  return normalized;
}

function validateDossierAnalysis(value, registration) {
  assertPlain(value, "compact high dossier analysis");
  exact(value, DOSSIER_ANALYSIS_KEYS, DOSSIER_ANALYSIS_KEYS, "compact high dossier analysis");
  const entryPath = canonicalPath(value.entry_path, "compact high dossier analysis.entry_path");
  if (!registration.ownership_paths.some((scope) => entryPath === scope || entryPath.startsWith(`${scope}/`))) {
    throw new ContractError(
      "QUALITY_OWNERSHIP_IMMUTABLE",
      "compact high dossier entry_path must remain inside the classified ownership",
    );
  }
  const relatedPaths = stringList(value.related_paths, "compact high dossier analysis.related_paths", {
    max: 12,
    pathValues: true,
  }).filter((entry) => entry !== entryPath);
  assertEnum(value.compatibility_decision, [
    "preserve", "versioned", "breaking_approved", "not_applicable",
  ], "compact high dossier analysis.compatibility_decision");
  for (const key of [
    "compatibility_analysis", "owning_abstraction", "impact_analysis", "side_effect_analysis",
    "contract_analysis", "rollback_expectation", "recovery_expectation", "counterexample",
    "premortem_analysis",
  ]) {
    assertString(value[key], `compact high dossier analysis.${key}`, { minBytes: 12, maxBytes: 4000 });
  }
  assertBoolean(value.has_downstream_side_effects, "compact high dossier analysis.has_downstream_side_effects");
  assertBoolean(value.has_cross_boundary_contracts, "compact high dossier analysis.has_cross_boundary_contracts");
  const unresolvedUnknowns = stringList(
    value.unresolved_unknowns,
    "compact high dossier analysis.unresolved_unknowns",
    { max: 8 },
  );
  return { ...value, entry_path: entryPath, related_paths: relatedPaths, unresolved_unknowns: unresolvedUnknowns };
}

function validateReportAnalysis(value) {
  assertPlain(value, "compact context report analysis");
  exact(value, REPORT_ANALYSIS_KEYS, REPORT_ANALYSIS_KEYS, "compact context report analysis");
  for (const key of REPORT_ANALYSIS_KEYS.filter((entry) => entry !== "unresolved_questions")) {
    assertString(value[key], `compact context report analysis.${key}`, { minBytes: 12, maxBytes: 4000 });
  }
  const unresolvedQuestions = stringList(
    value.unresolved_questions,
    "compact context report analysis.unresolved_questions",
    { max: 8 },
  );
  return { ...value, unresolved_questions: unresolvedQuestions };
}

function directMapping(checkId) {
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

function mechanismMapping(mechanismId) {
  return {
    classification: "applicable_verified_by_other_mechanism",
    check_ids: [],
    mechanism_ids: [mechanismId],
    evidence_refs: [],
    rationale: null,
    blocked_reason: null,
    external_dependency: null,
  };
}

function notApplicableMapping(rationale) {
  return {
    classification: "not_applicable",
    check_ids: [],
    mechanism_ids: [],
    evidence_refs: [],
    rationale,
    blocked_reason: null,
    external_dependency: null,
  };
}

function uniqueEvidence(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const identity = `${entry.kind}:${entry.value}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function safeProjectFile(workspaceRoot, candidate) {
  if (typeof candidate !== "string" || candidate.startsWith("-") || candidate.includes("\\")) return null;
  let relative;
  try {
    relative = canonicalPath(candidate, "project check source path");
  } catch {
    return null;
  }
  const absolute = path.resolve(workspaceRoot, ...relative.split("/"));
  const rel = path.relative(workspaceRoot, absolute);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  try {
    const identity = fs.lstatSync(absolute);
    if (!identity.isFile() || identity.isSymbolicLink()) return null;
    const canonicalRoot = fs.realpathSync.native(workspaceRoot);
    const canonicalFile = fs.realpathSync.native(absolute);
    const canonicalRelative = path.relative(canonicalRoot, canonicalFile);
    if (canonicalRelative.startsWith("..") || path.isAbsolute(canonicalRelative)) return null;
  } catch {
    return null;
  }
  return relative;
}

function provisionalFilePriority(candidate) {
  const extension = path.posix.extname(candidate).toLowerCase();
  return [PROVISIONAL_SOURCE_EXTENSIONS.has(extension) ? 0 : 1, candidate.split("/").length, candidate];
}

function compareProvisionalFiles(left, right) {
  const leftPriority = provisionalFilePriority(left);
  const rightPriority = provisionalFilePriority(right);
  for (let index = 0; index < leftPriority.length; index += 1) {
    if (leftPriority[index] < rightPriority[index]) return -1;
    if (leftPriority[index] > rightPriority[index]) return 1;
  }
  return 0;
}

function boundedOwnedProjectFiles(workspaceRoot, ownershipPaths) {
  const files = [];
  const pending = [...ownershipPaths].sort().reverse();
  let inspectedEntries = 0;
  while (pending.length > 0 && inspectedEntries < PROVISIONAL_DISCOVERY_ENTRY_LIMIT) {
    const candidate = pending.pop();
    if (candidate.split("/").some((segment) => PROVISIONAL_CONTROL_ROOTS.has(segment))) continue;
    const directFile = safeProjectFile(workspaceRoot, candidate);
    if (directFile !== null) {
      files.push(directFile);
      continue;
    }
    const absolute = path.resolve(workspaceRoot, ...candidate.split("/"));
    const relative = path.relative(workspaceRoot, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
    let identity;
    try {
      identity = fs.lstatSync(absolute);
      if (!identity.isDirectory() || identity.isSymbolicLink()) continue;
      const canonicalRoot = fs.realpathSync.native(workspaceRoot);
      const canonicalDirectory = fs.realpathSync.native(absolute);
      const canonicalRelative = path.relative(canonicalRoot, canonicalDirectory);
      if (canonicalRelative.startsWith("..") || path.isAbsolute(canonicalRelative)) continue;
    } catch {
      continue;
    }
    let entries;
    try {
      entries = fs.readdirSync(absolute, { withFileTypes: true })
        .map((entry) => entry.name)
        .sort()
        .reverse();
    } catch {
      continue;
    }
    for (const name of entries) {
      inspectedEntries += 1;
      if (inspectedEntries > PROVISIONAL_DISCOVERY_ENTRY_LIMIT) break;
      const child = candidate === "." ? name : `${candidate}/${name}`;
      pending.push(child);
    }
  }
  return [...new Set(files)].sort(compareProvisionalFiles);
}

function projectVerificationPath(workspaceRoot, projectCatalog, requiredCheckIds, fallback) {
  const required = new Set(requiredCheckIds);
  for (const check of projectCatalog?.checks ?? []) {
    if (!required.has(check.check_id)) continue;
    for (const candidate of check.argv ?? []) {
      const relative = safeProjectFile(workspaceRoot, candidate);
      if (relative !== null) return relative;
    }
  }
  return fallback;
}

function obligationKinds(taskType, riskClass, reproducerAvailable) {
  const kinds = [];
  if (["bug_fix", "diagnosis_driven_implementation"].includes(taskType)) {
    if (reproducerAvailable) kinds.push(["reproducer", "preimplementation"]);
    kinds.push(["unit", "integration"]);
  } else if (taskType === "behavior_preserving_refactor") {
    kinds.push(["characterization", "preimplementation"], ["integration", "integration"]);
  } else if (taskType === "new_feature") {
    kinds.push(["contract", "integration"], ["negative_path", "integration"]);
  } else if (taskType === "migration") {
    kinds.push(["compatibility_version_skew", "integration"], ["rollback_recovery", "integration"]);
  } else if (taskType === "security") {
    kinds.push(["unit", "integration"], ["negative_path", "integration"]);
  } else {
    kinds.push(["unit", "integration"]);
  }
  if (riskClass === "critical") {
    if (!kinds.some(([kind]) => kind === "negative_path")) kinds.push(["negative_path", "integration"]);
    if (!kinds.some(([kind]) => kind === "rollback_recovery")) kinds.push(["rollback_recovery", "integration"]);
  }
  return kinds;
}

function graphBoundary(category, evidenceRefs, references = null, rationale = null) {
  const represented = references !== null;
  return {
    id: `BOUNDARY-compact-${category}`,
    category,
    classification: represented ? "represented" : "reasoned_excluded",
    node_ids: represented ? (references.node_ids ?? []) : [],
    edge_ids: represented ? (references.edge_ids ?? []) : [],
    path_ids: represented ? (references.path_ids ?? []) : [],
    unknown_ids: represented ? (references.unknown_ids ?? []) : [],
    excluded_sibling_ids: represented ? (references.excluded_sibling_ids ?? []) : [],
    rationale: represented ? null : rationale,
    evidence_refs: evidenceRefs,
  };
}

function withinClassifiedOwnership(candidate, ownershipPaths) {
  return ownershipPaths.some((scope) => (
    scope === "." || candidate === scope || candidate.startsWith(`${scope}/`)
  ));
}

export function buildProvisionalHighImpactGraph({
  dossier,
  registration,
  projectCatalog,
  workspaceRoot,
  candidatePaths = [],
} = {}) {
  if (!dossier || !["high", "critical"].includes(dossier.risk_class) || dossier.impact_graph !== null) {
    throw new ContractError(
      "QUALITY_PROVISIONAL_CONTRACT",
      "runner-owned provisional impact analysis requires a high or critical dossier without an impact graph",
    );
  }
  assertPlain(registration, "provisional high impact registration");
  assertArray(candidatePaths, "provisional high impact candidate paths", { max: 4096 });
  const suppliedFiles = candidatePaths
    .map((candidate) => safeProjectFile(workspaceRoot, candidate))
    .filter((candidate) => candidate !== null
      && withinClassifiedOwnership(candidate, registration.ownership_paths));
  const entryPath = [...new Set([
    ...suppliedFiles,
    ...boundedOwnedProjectFiles(workspaceRoot, registration.ownership_paths),
  ])].sort(compareProvisionalFiles)[0];
  if (entryPath === undefined) return null;

  const requiredCheckIds = [...registration.required_check_ids];
  if (requiredCheckIds.length === 0) {
    throw new ContractError("QUALITY_CHECK_UNAVAILABLE", "provisional high impact analysis requires a runner-bound check");
  }
  const verificationPath = projectVerificationPath(
    workspaceRoot,
    projectCatalog,
    requiredCheckIds,
    entryPath,
  );
  const entryEvidence = [{ kind: "file", value: entryPath }];
  const testEvidence = uniqueEvidence([
    { kind: "file", value: verificationPath },
    ...requiredCheckIds.map((checkId) => ({ kind: "check", value: checkId })),
  ]);
  const graphEvidence = uniqueEvidence([...entryEvidence, ...testEvidence]);
  const unknownId = "GRAPHUNKNOWN-provisional-receipt-classification";
  const directPathId = "BLAST-provisional-direct";
  const transitivePathId = "BLAST-provisional-transitive";
  const nodes = [{
    id: "NODE-provisional-test",
    kind: "test",
    path: verificationPath,
    symbol: null,
    label: "runner-bound verification target awaiting receipt classification",
    boundary: "operational",
    confidence: "inferred",
    coverage: "partial",
    evidence_refs: testEvidence,
  }, {
    id: "NODE-provisional-module",
    kind: "module",
    path: entryPath,
    symbol: null,
    label: "classified owned module awaiting content evidence",
    boundary: "module",
    confidence: "inferred",
    coverage: "partial",
    evidence_refs: entryEvidence,
  }, {
    id: "NODE-provisional-entry",
    kind: "symbol",
    path: entryPath,
    symbol: null,
    label: "provisional implementation entry awaiting caller discovery",
    boundary: "entry_point",
    confidence: "inferred",
    coverage: "partial",
    evidence_refs: entryEvidence,
  }];
  const edges = [{
    id: "EDGE-provisional-test-module",
    from: "NODE-provisional-test",
    to: "NODE-provisional-module",
    relationship: "tests",
    confidence: "inferred",
    coverage: "partial",
    evidence_refs: graphEvidence,
  }, {
    id: "EDGE-provisional-module-entry",
    from: "NODE-provisional-module",
    to: "NODE-provisional-entry",
    relationship: "defines",
    confidence: "inferred",
    coverage: "partial",
    evidence_refs: entryEvidence,
  }];
  const affectedPaths = [{
    id: directPathId,
    kind: "direct",
    node_ids: ["NODE-provisional-module", "NODE-provisional-entry"],
    edge_ids: ["EDGE-provisional-module-entry"],
    critical: true,
    verification_node_ids: ["NODE-provisional-test"],
    confidence: "inferred",
    evidence_refs: graphEvidence,
  }, {
    id: transitivePathId,
    kind: "transitive",
    node_ids: ["NODE-provisional-test", "NODE-provisional-module", "NODE-provisional-entry"],
    edge_ids: ["EDGE-provisional-test-module", "EDGE-provisional-module-entry"],
    critical: false,
    verification_node_ids: ["NODE-provisional-test"],
    confidence: "inferred",
    evidence_refs: graphEvidence,
  }];
  const unknowns = [{
    id: unknownId,
    statement: "Transitive consumers, sibling implementations, cross-boundary contracts, and downstream side effects are not yet receipt-classified.",
    scope_ids: ["NODE-provisional-module", "NODE-provisional-entry"],
    impact: "The final blast radius and preservation obligations may change after bounded context inspection.",
    resolution_plan: "Collect the runner-recommended outline and content reads, then replace this provisional graph with a receipt-grounded compact analysis.",
    owner: registration.agent_name,
    blocking: true,
    evidence_refs: entryEvidence,
  }];
  const pendingRationale = "This boundary is not yet represented by receipt-backed evidence and remains covered by the blocking provisional unknown.";
  const boundaries = [
    graphBoundary("direct_affected_paths", graphEvidence, { path_ids: [directPathId] }),
    graphBoundary("transitive_affected_paths", graphEvidence, { path_ids: [transitivePathId] }),
    graphBoundary("externally_reachable_entry_points", entryEvidence, { node_ids: ["NODE-provisional-entry"] }),
    graphBoundary("downstream_state_or_side_effects", entryEvidence, null, pendingRationale),
    graphBoundary("cross_boundary_contracts", entryEvidence, null, pendingRationale),
    graphBoundary("critical_path_tests", testEvidence, {
      node_ids: ["NODE-provisional-test"],
      path_ids: [directPathId],
    }),
    graphBoundary("relevant_unknown_paths", entryEvidence, { unknown_ids: [unknownId] }),
    graphBoundary("excluded_sibling_paths", entryEvidence, null, pendingRationale),
  ];
  return buildEngineeringImpactGraph({
    graph_id: `GRAPH-provisional-${dossier.risk_class}`,
    risk_class: dossier.risk_class,
    nodes,
    edges,
    affected_paths: affectedPaths,
    excluded_siblings: [],
    unknowns,
    coverage: {
      completeness: "partial",
      semantic_tool_status: "unavailable",
      semantic_tools: [],
      fallback_tools: ["context_outline", "context_read"],
      reduced_semantic_coverage: true,
      truncated: false,
      truncation_reason: null,
      available_evaluator_ids: [],
      unavailable_evaluator_ids: [],
      boundaries,
      evidence_refs: graphEvidence,
    },
  });
}

function buildImpactGraph({ analysis, dossier, verificationPath, requiredCheckIds }) {
  const entryEvidence = [{ kind: "file", value: analysis.entry_path }];
  const graphEvidence = uniqueEvidence([
    ...entryEvidence,
    { kind: "file", value: verificationPath },
    ...requiredCheckIds.map((checkId) => ({ kind: "check", value: checkId })),
  ]);
  const nodes = [{
    id: "NODE-compact-test",
    kind: "test",
    path: verificationPath,
    symbol: null,
    label: "runner-bound verification target",
    boundary: "operational",
    confidence: "observed",
    coverage: "complete",
    evidence_refs: uniqueEvidence([{ kind: "file", value: verificationPath }, { kind: "check", value: requiredCheckIds[0] }]),
  }, {
    id: "NODE-compact-module",
    kind: "module",
    path: analysis.entry_path,
    symbol: null,
    label: analysis.owning_abstraction,
    boundary: "module",
    confidence: "observed",
    coverage: "complete",
    evidence_refs: entryEvidence,
  }, {
    id: "NODE-compact-entry",
    kind: analysis.has_cross_boundary_contracts ? "public_api" : "symbol",
    path: analysis.entry_path,
    symbol: null,
    label: "bounded implementation entry",
    boundary: "entry_point",
    confidence: "observed",
    coverage: "complete",
    evidence_refs: entryEvidence,
  }];
  const edges = [{
    id: "EDGE-compact-test-module",
    from: "NODE-compact-test",
    to: "NODE-compact-module",
    relationship: "tests",
    confidence: "observed",
    coverage: "complete",
    evidence_refs: graphEvidence,
  }, {
    id: "EDGE-compact-module-entry",
    from: "NODE-compact-module",
    to: "NODE-compact-entry",
    relationship: "defines",
    confidence: "observed",
    coverage: "complete",
    evidence_refs: entryEvidence,
  }];
  const affectedPaths = [{
    id: "BLAST-compact-direct",
    kind: "direct",
    node_ids: ["NODE-compact-module", "NODE-compact-entry"],
    edge_ids: ["EDGE-compact-module-entry"],
    critical: true,
    verification_node_ids: ["NODE-compact-test"],
    confidence: "observed",
    evidence_refs: graphEvidence,
  }, {
    id: "BLAST-compact-transitive-verification",
    kind: "transitive",
    node_ids: ["NODE-compact-test", "NODE-compact-module", "NODE-compact-entry"],
    edge_ids: ["EDGE-compact-test-module", "EDGE-compact-module-entry"],
    critical: false,
    verification_node_ids: ["NODE-compact-test"],
    confidence: "observed",
    evidence_refs: graphEvidence,
  }];

  for (const [index, relatedPath] of analysis.related_paths.entries()) {
    const nodeId = `NODE-compact-related-${index + 1}`;
    const testEdgeId = `EDGE-compact-test-related-${index + 1}`;
    const dependencyEdgeId = `EDGE-compact-related-entry-${index + 1}`;
    nodes.push({
      id: nodeId,
      kind: "module",
      path: relatedPath,
      symbol: null,
      label: `receipt-classified related module ${index + 1}`,
      boundary: "module",
      confidence: "observed",
      coverage: "complete",
      evidence_refs: [{ kind: "file", value: relatedPath }],
    });
    edges.push({
      id: testEdgeId,
      from: "NODE-compact-test",
      to: nodeId,
      relationship: "tests",
      confidence: "observed",
      coverage: "complete",
      evidence_refs: graphEvidence,
    }, {
      id: dependencyEdgeId,
      from: nodeId,
      to: "NODE-compact-entry",
      relationship: "depends_on",
      confidence: "observed",
      coverage: "complete",
      evidence_refs: uniqueEvidence([{ kind: "file", value: relatedPath }, ...entryEvidence]),
    });
    affectedPaths.push({
      id: `BLAST-compact-related-${index + 1}`,
      kind: "transitive",
      node_ids: ["NODE-compact-test", nodeId, "NODE-compact-entry"],
      edge_ids: [testEdgeId, dependencyEdgeId],
      critical: false,
      verification_node_ids: ["NODE-compact-test"],
      confidence: "observed",
      evidence_refs: graphEvidence,
    });
  }

  let sideEffectNodeId = null;
  let sideEffectEdgeId = null;
  if (analysis.has_downstream_side_effects) {
    sideEffectNodeId = "NODE-compact-side-effect";
    sideEffectEdgeId = "EDGE-compact-entry-side-effect";
    nodes.push({
      id: sideEffectNodeId,
      kind: "event_producer",
      path: analysis.entry_path,
      symbol: null,
      label: analysis.side_effect_analysis,
      boundary: "external",
      confidence: "observed",
      coverage: "complete",
      evidence_refs: entryEvidence,
    });
    edges.push({
      id: sideEffectEdgeId,
      from: "NODE-compact-entry",
      to: sideEffectNodeId,
      relationship: "emits",
      confidence: "observed",
      coverage: "complete",
      evidence_refs: entryEvidence,
    });
  }

  const unknowns = analysis.unresolved_unknowns.map((statement, index) => ({
    id: `GRAPHUNKNOWN-compact-${index + 1}`,
    statement,
    scope_ids: ["NODE-compact-module"],
    impact: "The final impact boundary cannot be considered complete while this unknown remains.",
    resolution_plan: "Collect another bounded context receipt and submit a revised compact analysis.",
    owner: "orchestrator",
    blocking: true,
    evidence_refs: entryEvidence,
  }));
  const directIds = affectedPaths.filter((entry) => entry.kind === "direct").map((entry) => entry.id);
  const transitiveIds = affectedPaths.filter((entry) => entry.kind === "transitive").map((entry) => entry.id);
  const boundaries = [
    graphBoundary("direct_affected_paths", graphEvidence, { path_ids: directIds }),
    graphBoundary("transitive_affected_paths", graphEvidence, { path_ids: transitiveIds }),
    graphBoundary("externally_reachable_entry_points", entryEvidence, { node_ids: ["NODE-compact-entry"] }),
    analysis.has_downstream_side_effects
      ? graphBoundary("downstream_state_or_side_effects", entryEvidence, {
        node_ids: [sideEffectNodeId], edge_ids: [sideEffectEdgeId],
      })
      : graphBoundary("downstream_state_or_side_effects", entryEvidence, null, analysis.side_effect_analysis),
    analysis.has_cross_boundary_contracts
      ? graphBoundary("cross_boundary_contracts", entryEvidence, { node_ids: ["NODE-compact-entry"] })
      : graphBoundary("cross_boundary_contracts", entryEvidence, null, analysis.contract_analysis),
    graphBoundary("critical_path_tests", graphEvidence, {
      node_ids: ["NODE-compact-test"], path_ids: directIds,
    }),
    unknowns.length > 0
      ? graphBoundary("relevant_unknown_paths", entryEvidence, { unknown_ids: unknowns.map((entry) => entry.id) })
      : graphBoundary("relevant_unknown_paths", entryEvidence, null, "The bounded analysis records no unresolved affected path after explicit impact classification."),
    graphBoundary("excluded_sibling_paths", entryEvidence, null, "The bounded inventory and related-path analysis found no sibling implementation that requires a separate graph node."),
  ];
  if (boundaries.length !== IMPACT_BOUNDARY_CATEGORIES.length) {
    throw new ContractError("QUALITY_IMPACT_BOUNDARY_MISSING", "compact graph did not classify every impact boundary");
  }
  return buildEngineeringImpactGraph({
    graph_id: `GRAPH-compact-${dossier.risk_class}`,
    risk_class: dossier.risk_class,
    nodes,
    edges,
    affected_paths: affectedPaths,
    excluded_siblings: [],
    unknowns,
    coverage: {
      completeness: unknowns.length === 0 ? "complete" : "partial",
      semantic_tool_status: "unavailable",
      semantic_tools: [],
      fallback_tools: ["context_outline", "context_read"],
      reduced_semantic_coverage: true,
      truncated: false,
      truncation_reason: null,
      available_evaluator_ids: [],
      unavailable_evaluator_ids: [],
      boundaries,
      evidence_refs: graphEvidence,
    },
  });
}

export function buildCompactHighDossierPatch({
  analysis: rawAnalysis,
  dossier,
  registration,
  checkCatalog,
  projectCatalog,
  workspaceRoot,
  trustedProducer,
} = {}) {
  if (!dossier || !["high", "critical"].includes(dossier.risk_class)) {
    throw new ContractError("QUALITY_SESSION_CLASSIFICATION_MISMATCH", "compact dossier analysis requires a high or critical draft");
  }
  const analysis = validateDossierAnalysis(rawAnalysis, registration);
  const requiredCheckIds = [...registration.required_check_ids];
  const firstCheckId = requiredCheckIds[0];
  const firstCheck = projectCatalog?.checks?.find((entry) => entry.check_id === firstCheckId) ?? null;
  const verificationPath = projectVerificationPath(workspaceRoot, projectCatalog, requiredCheckIds, analysis.entry_path);
  const areaPaths = [...new Set([analysis.entry_path, ...analysis.related_paths])];
  const areaIds = areaPaths.map((_, index) => `AREA-compact-${index + 1}`);
  const entryId = "ENTRY-compact-main";
  const invariantId = "INV-compact-behavior";
  const edgeId = "EDGE-compact-counterexample";
  const failureId = "FAIL-compact-partial";
  const direct = directMapping(firstCheckId);
  const mechanismIds = new Set((checkCatalog?.mechanisms ?? []).filter((entry) => entry.available).map((entry) => entry.mechanism_id));
  const architectMechanism = mechanismIds.has("normal-architect-challenge")
    ? "normal-architect-challenge"
    : [...mechanismIds][0];
  const reviewerMechanism = mechanismIds.has("normal-reviewer-challenge")
    ? "normal-reviewer-challenge"
    : [...mechanismIds][1] ?? architectMechanism;
  if (architectMechanism === undefined || reviewerMechanism === undefined) {
    throw new ContractError("QUALITY_CHECK_UNAVAILABLE", "compact high dossier requires runner-bound architect and reviewer mechanisms");
  }
  const testObligations = [];
  let obligationIndex = 0;
  for (const [checkIndex, checkId] of requiredCheckIds.entries()) {
    const catalogCheck = projectCatalog?.checks?.find((entry) => entry.check_id === checkId) ?? null;
    const kinds = checkIndex === 0
      ? obligationKinds(dossier.task_type, dossier.risk_class, catalogCheck?.purpose === "bug_reproducer")
      : [["integration", "integration"]];
    const engineeringCheck = checkCatalog.checks.find((entry) => entry.check_id === checkId);
    for (const [kind, phase] of kinds) {
      obligationIndex += 1;
      testObligations.push({
        id: `TEST-compact-${obligationIndex}`,
        check_id: checkId,
        kind,
        phase,
        scope_ids: [...areaIds],
        command_or_mechanism: `trusted-project-check:${checkId}`,
        required: true,
        trusted_producer: engineeringCheck?.trusted_producer ?? trustedProducer,
      });
    }
  }
  const architectureCheckIds = (projectCatalog?.checks ?? [])
    .filter((entry) => requiredCheckIds.includes(entry.check_id) && entry.purpose === "architecture_graph")
    .map((entry) => entry.check_id);
  const baselineCheckIds = [...new Set(testObligations
    .filter((entry) => entry.phase === "preimplementation")
    .map((entry) => entry.check_id))];
  const impactGraph = buildImpactGraph({
    analysis,
    dossier,
    verificationPath,
    requiredCheckIds,
  });
  const fileEvidence = areaPaths.map((value) => ({ kind: "file", value }));
  const unknowns = analysis.unresolved_unknowns.map((statement, index) => ({
    id: `UNKNOWN-compact-${index + 1}`,
    scope_ids: [...areaIds],
    statement,
    impact: "This unknown can change the bounded implementation or verification plan.",
    resolution_plan: "Collect another runner-owned context receipt and revise the compact analysis.",
    owner: registration.agent_name,
    blocking: true,
  }));
  return deepFrozenClone({
    compatibility_contract: {
      status: "defined",
      default_decision: analysis.compatibility_decision,
      rationale: analysis.compatibility_analysis,
      evidence_refs: analysis.compatibility_decision === "not_applicable" ? [] : [{ kind: "file", value: analysis.entry_path }],
    },
    public_contracts: analysis.has_cross_boundary_contracts ? [{
      id: "CONTRACT-compact-main",
      kind: "public_api",
      path: analysis.entry_path,
      owner: registration.agent_name,
      compatibility_decision: analysis.compatibility_decision,
      evidence_refs: analysis.compatibility_decision === "not_applicable" ? [] : [{ kind: "file", value: analysis.entry_path }],
    }] : [],
    system_boundaries: [{
      id: "SYSBOUNDARY-compact-caller",
      category: "caller",
      path: verificationPath,
      status: "resolved",
      rationale: analysis.impact_analysis,
      evidence_refs: [{ kind: "file", value: verificationPath }],
    }, {
      id: "SYSBOUNDARY-compact-callee",
      category: "callee",
      path: analysis.entry_path,
      status: "resolved",
      rationale: analysis.owning_abstraction,
      evidence_refs: [{ kind: "file", value: analysis.entry_path }],
    }, {
      id: "SYSBOUNDARY-compact-state",
      category: "state",
      path: analysis.has_downstream_side_effects ? analysis.entry_path : null,
      status: analysis.has_downstream_side_effects ? "resolved" : "not_applicable",
      rationale: analysis.side_effect_analysis,
      evidence_refs: analysis.has_downstream_side_effects ? [{ kind: "file", value: analysis.entry_path }] : [],
    }, {
      id: "SYSBOUNDARY-compact-data-path",
      category: "data_path",
      path: analysis.entry_path,
      status: "resolved",
      rationale: analysis.impact_analysis,
      evidence_refs: [{ kind: "file", value: analysis.entry_path }],
    }, {
      id: "SYSBOUNDARY-compact-architecture-layer",
      category: "architecture_layer",
      path: analysis.entry_path,
      status: "resolved",
      rationale: analysis.owning_abstraction,
      evidence_refs: [{ kind: "file", value: analysis.entry_path }],
    }, {
      id: "SYSBOUNDARY-compact-ownership",
      category: "ownership",
      path: analysis.entry_path,
      status: "resolved",
      rationale: `The classified write boundary remains ${registration.ownership_paths.join(", ")}.`,
      evidence_refs: [{ kind: "file", value: analysis.entry_path }],
    }],
    affected_areas: areaPaths.map((areaPath, index) => ({
      id: areaIds[index],
      path: areaPath,
      node_kind: areaPath === analysis.entry_path ? "file" : "module",
      reason: areaPath === analysis.entry_path ? analysis.owning_abstraction : analysis.impact_analysis,
      confidence: "observed",
      evidence_refs: [{ kind: "file", value: areaPath }],
    })),
    entry_points: [{
      id: entryId,
      path: analysis.entry_path,
      symbol: null,
      reason: analysis.owning_abstraction,
      evidence_refs: [{ kind: "file", value: analysis.entry_path }],
    }],
    call_paths: [{
      id: "PATH-compact-main",
      steps: [entryId, areaIds[0]],
      confidence: "observed",
      evidence_refs: [{ kind: "file", value: analysis.entry_path }],
    }],
    invariants: [{
      id: invariantId,
      statement: dossier.behavior_contract.requested_behavior,
      scope_ids: [...areaIds],
      mapping: direct,
    }],
    edge_cases: [{
      id: edgeId,
      category: "unexpected_valid_state",
      condition: analysis.counterexample,
      expected_behavior: dossier.behavior_contract.requested_behavior,
      scope_ids: [entryId],
      mapping: direct,
    }],
    failure_modes: [{
      id: failureId,
      category: "partial_success_partial_failure",
      trigger: analysis.impact_analysis,
      impact: analysis.side_effect_analysis,
      expected_handling: dossier.behavior_contract.error_behavior[0],
      scope_ids: [...areaIds],
      mapping: direct,
    }],
    premortem_matrix: PREMORTEM_CATEGORIES.map((category, index) => ({
      id: `PREMORTEM-compact-${index + 1}`,
      category,
      subject_ids: category === "unexpected_valid_state"
        ? [edgeId]
        : category === "partial_success_partial_failure" ? [failureId] : [],
      mapping: category === "unexpected_valid_state" || category === "partial_success_partial_failure"
        ? direct
        : notApplicableMapping(`${analysis.premortem_analysis} Category assessed: ${category}.`),
    })),
    counterexamples: [{
      id: "COUNTEREXAMPLE-compact-main",
      statement: analysis.counterexample,
      expected_behavior: dossier.behavior_contract.requested_behavior,
      scope_ids: [entryId],
      mapping: direct,
    }],
    test_obligations: testObligations,
    specialized_checks: [{
      id: "SPECIAL-compact-architecture",
      category: "architecture",
      mapping: mechanismMapping(architectMechanism),
    }, {
      id: "SPECIAL-compact-compatibility",
      category: "compatibility",
      mapping: mechanismMapping(reviewerMechanism),
    }],
    unknowns,
    implementation_slices: [{
      id: "SLICE-compact-owned",
      owner: registration.agent_name,
      intent: "implementation",
      write_scope: [...registration.ownership_paths],
      concurrent_group: null,
      depends_on_slice_ids: [],
      invariant_ids: [invariantId],
      verification_check_ids: [...requiredCheckIds],
    }],
    impact_graph: impactGraph,
    context_coverage: {
      status: unknowns.length === 0 ? "complete" : "truncated",
      affected_area_ids: [...areaIds],
      covered_area_ids: unknowns.length === 0 ? [...areaIds] : [],
      truncated_area_ids: unknowns.length === 0 ? [] : [...areaIds],
      accepted_gap_ids: [],
      evidence_refs: fileEvidence,
    },
    verification_plan: {
      baseline_check_ids: baselineCheckIds,
      slice_check_ids: [...requiredCheckIds],
      integration_check_ids: [...requiredCheckIds],
      architecture_check_ids: architectureCheckIds,
      regression_check_ids: [...requiredCheckIds],
      hidden_check_ids: [],
      truncated_check_ids: [],
      evidence_refs: requiredCheckIds.map((value) => ({ kind: "check", value })),
    },
    rollback_recovery: {
      rollback_expectation: analysis.rollback_expectation,
      recovery_expectation: analysis.recovery_expectation,
      mapping: mechanismMapping(architectMechanism),
    },
  }, "compact high dossier patch");
}

function boundarySubjectIds(boundary) {
  return [
    ...boundary.node_ids,
    ...boundary.edge_ids,
    ...boundary.path_ids,
    ...boundary.unknown_ids,
    ...boundary.excluded_sibling_ids,
  ];
}

function expandedBoundarySubjectIds(boundary, graph) {
  const pathById = new Map(graph.affected_paths.map((entry) => [entry.id, entry]));
  return [...new Set([
    ...boundarySubjectIds(boundary),
    ...boundary.path_ids.flatMap((pathId) => {
      const affectedPath = pathById.get(pathId);
      return affectedPath === undefined
        ? []
        : [affectedPath.id, ...affectedPath.node_ids, ...affectedPath.edge_ids];
    }),
  ])];
}

function completeOutline(receipt) {
  return receipt.tool_id === "context_outline"
    && ["success", "empty"].includes(receipt.status)
    && receipt.result?.coverage.complete === true
    && receipt.result?.coverage.stable === true
    && receipt.result?.coverage.changed_during_operation === false;
}

function reportObservation(questionKey, analysis) {
  if (questionKey === "sibling_variants") return analysis.sibling_variant_observation;
  if (questionKey.includes("compat")) return analysis.compatibility_observation;
  if (questionKey.includes("negative") || questionKey.includes("failure")) return analysis.negative_path_observation;
  return analysis.falsification_observation;
}

export function requiredCompactContextReadPaths(dossier, receiptIndex = { receipts: [] }) {
  if (!dossier?.impact_graph) return [];
  const outlinedGuidance = (receiptIndex.receipts ?? [])
    .filter(completeOutline)
    .flatMap((entry) => entry.result?.guidance_paths ?? []);
  return [...new Set([
    ...dossier.impact_graph.nodes.map((entry) => entry.path).filter((entry) => typeof entry === "string"),
    ...dossier.impact_graph.excluded_siblings.map((entry) => entry.path),
    ...outlinedGuidance,
  ])].sort();
}

export function buildCompactWholeSystemContextPatch({
  analysis: rawAnalysis,
  dossier,
  strategyBinding,
  receiptIndex,
  readOnlySubagentsUsed = 0,
} = {}) {
  const analysis = validateReportAnalysis(rawAnalysis);
  if (!dossier?.impact_graph || !["high", "critical"].includes(dossier.risk_class)) {
    throw new ContractError("CONTEXT_GRAPH_REQUIRED", "compact context analysis requires a high or critical impact graph");
  }
  const receipts = receiptIndex?.receipts ?? [];
  const outlines = receipts.filter(completeOutline);
  if (outlines.length === 0) {
    throw new ContractError(
      "CONTEXT_COMPACT_ANALYSIS_EVIDENCE_MISSING",
      "compact context analysis requires one complete stable runner-owned context_outline receipt",
    );
  }
  const inspectedPaths = new Set(contentBackedInspectedPaths(receiptIndex));
  const requiredPaths = requiredCompactContextReadPaths(dossier, receiptIndex);
  const missingPaths = requiredPaths.filter((entry) => !inspectedPaths.has(entry));
  if (missingPaths.length > 0) {
    throw new ContractError(
      "CONTEXT_COMPACT_ANALYSIS_EVIDENCE_MISSING",
      `compact context analysis still needs complete bounded reads for: ${missingPaths.join(", ")}`,
    );
  }
  const allReceiptIds = receipts.map((entry) => entry.receipt_id);
  const observedReceipts = receipts.filter((entry) => ["success", "empty"].includes(entry.status));
  const observedReceiptIds = observedReceipts.map((entry) => entry.receipt_id);
  if (observedReceiptIds.length === 0) {
    throw new ContractError("CONTEXT_COMPACT_ANALYSIS_EVIDENCE_MISSING", "compact context analysis has no usable runner receipt");
  }
  const installedSurface = detectInstalledContextToolSurface({
    tool_ids: [...new Set(outlines.flatMap((entry) => entry.result?.tool_inventory ?? []))],
  });
  const available = new Set(installedSurface.available_tool_ids);
  const minimalAvailable = MINIMAL_CONTEXT_TOOLS.filter((tool) => available.has(tool)).sort();
  const advancedAvailable = ADVANCED_CONTEXT_TOOLS.filter((tool) => available.has(tool)).sort();
  const advancedUnavailable = ADVANCED_CONTEXT_TOOLS.filter((tool) => !available.has(tool)).sort();
  const unobservedAdvanced = advancedAvailable.filter((tool) => !observedReceipts.some((entry) => entry.tool_id === tool));
  if (unobservedAdvanced.length > 0) {
    throw new ContractError(
      "CONTEXT_COMPACT_ANALYSIS_EVIDENCE_MISSING",
      `installed advanced context tools require one settled call before report finalization: ${unobservedAdvanced.join(", ")}`,
    );
  }
  const minimalEvidenceUsed = observedReceipts.some((entry) => ["context_files", "context_search", "context_read"].includes(entry.tool_id));
  const advancedObserved = observedReceipts.some((entry) => ADVANCED_CONTEXT_TOOLS.includes(entry.tool_id));
  const fallbackUsed = advancedAvailable.length === 0 && minimalEvidenceUsed;
  const reducedSemanticCoverage = advancedAvailable.length < ADVANCED_CONTEXT_TOOLS.length
    || (minimalEvidenceUsed && !advancedObserved);
  const subjectIds = [
    ...dossier.impact_graph.nodes,
    ...dossier.impact_graph.edges,
    ...dossier.impact_graph.affected_paths,
    ...dossier.impact_graph.excluded_siblings,
    ...dossier.impact_graph.unknowns,
  ].map((entry) => entry.id);
  const moduleSubjectIds = dossier.impact_graph.nodes
    .filter((entry) => entry.kind === "module" || entry.boundary === "module")
    .map((entry) => entry.id);
  const claimId = "CLAIM-compact-owning-abstraction";
  const boundaryByCategory = new Map(dossier.impact_graph.coverage.boundaries.map((entry) => [entry.category, entry]));
  const guidancePaths = [...new Set(outlines.flatMap((entry) => entry.result?.guidance_paths ?? []))];
  const wideAnalysis = strategyBinding.required_wide_categories.map((category, index) => {
    if (category === "repository_guidance") {
      return {
        id: `WIDE-compact-${index + 1}`,
        category,
        classification: guidancePaths.length > 0 ? "represented" : "reasoned_excluded",
        claim_ids: [claimId],
        subject_ids: [],
        receipt_ids: observedReceiptIds,
        rationale: guidancePaths.length > 0 ? null : "The complete bounded repository outline reported no applicable repository guidance file.",
      };
    }
    if (category === "architecture_ownership") {
      return {
        id: `WIDE-compact-${index + 1}`,
        category,
        classification: "represented",
        claim_ids: [claimId],
        subject_ids: moduleSubjectIds,
        receipt_ids: observedReceiptIds,
        rationale: null,
      };
    }
    if (category === "context_tool_fallback" || category === "budget_truncation_state") {
      return {
        id: `WIDE-compact-${index + 1}`,
        category,
        classification: "represented",
        claim_ids: [claimId],
        subject_ids: moduleSubjectIds,
        receipt_ids: category === "budget_truncation_state" ? allReceiptIds : observedReceiptIds,
        rationale: null,
      };
    }
    const mappedBoundaries = (WIDE_BOUNDARY_MAP[category] ?? [])
      .map((entry) => boundaryByCategory.get(entry))
      .filter(Boolean);
    const representedBoundaries = mappedBoundaries.filter((entry) => entry.classification === "represented");
    if (mappedBoundaries.length > 0 && representedBoundaries.length === 0) {
      return {
        id: `WIDE-compact-${index + 1}`,
        category,
        classification: "reasoned_excluded",
        claim_ids: [claimId],
        subject_ids: [],
        receipt_ids: observedReceiptIds,
        rationale: mappedBoundaries.map((entry) => entry.rationale).filter(Boolean).join(" ")
          || `The bounded impact graph reasoned-excludes ${category}.`,
      };
    }
    const mappedSubjects = representedBoundaries.flatMap((boundary) => (
      expandedBoundarySubjectIds(boundary, dossier.impact_graph)
    ));
    return {
      id: `WIDE-compact-${index + 1}`,
      category,
      classification: "represented",
      claim_ids: [claimId],
      subject_ids: [...new Set(mappedSubjects.length > 0 ? mappedSubjects : subjectIds)],
      receipt_ids: observedReceiptIds,
      rationale: null,
    };
  });
  const requiredQuestions = strategyBinding.required_questions.map((questionKey, index) => ({
    id: `QUESTION-compact-required-${index + 1}`,
    question_key: questionKey,
    statement: `The bounded ${questionKey} hypothesis is consistent with the current impact graph and implementation plan.`,
    expected_observation: `Settled runner receipts should expose evidence relevant to ${questionKey} before mutation.`,
    actual_observation: reportObservation(questionKey, analysis),
    status: "confirmed",
    receipt_ids: observedReceiptIds,
    impact_if_wrong: "high",
    next_action: null,
    applied_update_ids: [],
    applied_update_fingerprint: null,
  }));
  const questions = [...requiredQuestions, ...analysis.unresolved_questions.map((statement, index) => ({
    id: `QUESTION-compact-unresolved-${index + 1}`,
    question_key: strategyBinding.required_questions[0],
    statement,
    expected_observation: "Additional bounded evidence should resolve this material question before mutation.",
    actual_observation: null,
    status: "uncertain",
    receipt_ids: observedReceiptIds,
    impact_if_wrong: "high",
    next_action: "Collect another task-relevant context receipt and revise the report analysis.",
    applied_update_ids: [],
    applied_update_fingerprint: null,
  }))];
  const testIds = dossier.test_obligations.map((entry) => entry.id);
  const preimplementationReproducerIds = dossier.test_obligations
    .filter((entry) => entry.phase === "preimplementation" && entry.kind === "reproducer")
    .map((entry) => entry.id);
  const invariantIds = dossier.invariants.map((entry) => entry.id);
  const edgeCaseIds = dossier.edge_cases.map((entry) => entry.id);
  const failureModeIds = dossier.failure_modes.map((entry) => entry.id);
  const symbolIds = [...new Set(observedReceipts.flatMap((entry) => (
    entry.result?.symbol_ids ?? []
  )).map((entry) => entry.symbol_id))];
  const deepAnalyses = dossier.impact_graph.affected_paths
    .filter((entry) => entry.critical)
    .map((entry, index) => ({
      id: `DEEP-compact-${index + 1}`,
      impact_path_id: entry.id,
      node_ids: [...entry.node_ids],
      edge_ids: [...entry.edge_ids],
      symbol_ids: symbolIds,
      inputs: [analysis.input_summary],
      outputs: [analysis.output_summary],
      dimensions: strategyBinding.required_deep_dimensions.map((dimension) => ({
        dimension,
        classification: "applicable",
        analysis: `${dimension}: ${analysis.observed_system_behavior}`,
        not_applicable_reason: null,
        receipt_ids: observedReceiptIds,
        verification_ids: testIds,
      })),
      falsification_question_id: requiredQuestions[0].id,
      invariant_ids: invariantIds,
      edge_case_ids: edgeCaseIds,
      failure_mode_ids: failureModeIds,
      test_obligation_ids: testIds,
      unresolved_question_ids: questions.filter((question) => question.status === "uncertain").map((question) => question.id),
      receipt_ids: observedReceiptIds,
    }));
  return deepFrozenClone({
    wide_analysis: wideAnalysis,
    claims: [{
      id: claimId,
      kind: "observed",
      statement: `${analysis.owning_abstraction} Receipt-backed observation: ${analysis.observed_system_behavior}`,
      subject_ids: subjectIds,
      receipt_ids: observedReceiptIds,
    }],
    deep_analyses: deepAnalyses,
    questions,
    task_evidence: {
      owning_abstraction_claim_id: claimId,
      sibling_variant_question_ids: strategyBinding.requires_sibling_variant_discovery
        ? requiredQuestions.filter((entry) => entry.question_key === "sibling_variants").map((entry) => entry.id)
        : [],
      characterization_test_ids: strategyBinding.requires_characterization
        ? dossier.test_obligations.filter((entry) => entry.kind === "characterization").map((entry) => entry.id)
        : [],
      negative_path_ids: strategyBinding.requires_negative_path ? failureModeIds : [],
      compatibility_ids: strategyBinding.requires_compatibility ? invariantIds : [],
      reproduction_status: strategyBinding.requires_pre_change_reproduction ? "reproduced" : "not_required",
      reproduction_evidence_ids: strategyBinding.requires_pre_change_reproduction
        ? preimplementationReproducerIds
        : [],
    },
    tool_state: {
      minimal_available: minimalAvailable,
      advanced_available: advancedAvailable,
      advanced_unavailable: advancedUnavailable,
      unsupported_schema_tools: [...new Set(receipts
        .filter((entry) => entry.reason_code === "unsupported_schema")
        .map((entry) => entry.tool_id))].sort(),
      fallback_used: fallbackUsed,
      reduced_semantic_coverage: reducedSemanticCoverage,
      semantic_completeness_claimed: false,
      unresolved_truncation_receipt_ids: receipts
        .filter((entry) => entry.status === "truncated")
        .map((entry) => entry.receipt_id),
    },
    budget_state: {
      context_calls_used: receipts.length,
      context_calls_max: strategyBinding.budgets.max_context_calls,
      read_only_subagents_used: readOnlySubagentsUsed,
      read_only_subagents_max: strategyBinding.budgets.max_read_only_subagents,
      exhausted: false,
      unresolved_area: null,
    },
  }, "compact Whole-System Context Report patch");
}
