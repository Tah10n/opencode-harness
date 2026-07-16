import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildArchitecturePolicy,
  evaluateArchitecturePolicy,
  parseArchitecturePolicy,
  validateArchitectureEvaluation,
  validateArchitecturePolicy,
} from "../lib/quality/architecture.mjs";
import {
  IMPACT_BOUNDARY_CATEGORIES,
  buildEngineeringImpactGraph,
  validateEngineeringImpactGraph,
} from "../lib/quality/impact-graph.mjs";
import {
  createPostEditArchitectureEvidence,
  validatePostEditArchitectureEvidence,
} from "../lib/quality/post-architecture-evidence.mjs";

const fileEvidence = (value) => [{ kind: "file", value }];

const impactSchema = JSON.parse(fs.readFileSync(new URL("../quality/schemas/engineering-impact-graph.schema.json", import.meta.url), "utf8"));
const policySchema = JSON.parse(fs.readFileSync(new URL("../quality/schemas/architecture-policy.schema.json", import.meta.url), "utf8"));
const evaluationSchema = JSON.parse(fs.readFileSync(new URL("../quality/schemas/architecture-evaluation.schema.json", import.meta.url), "utf8"));
const postEvidenceSchema = JSON.parse(fs.readFileSync(new URL("../quality/schemas/post-edit-architecture-evidence.schema.json", import.meta.url), "utf8"));
const policyExample = JSON.parse(fs.readFileSync(new URL("../quality/schemas/architecture-policy.example.json", import.meta.url), "utf8"));

function rejects(fn, code) {
  assert.throws(fn, (error) => error?.code === code, `expected ${code}`);
}

function boundary(category, references = {}, rationale = null) {
  const represented = rationale === null;
  return {
    id: `BOUNDARY-${category}`,
    category,
    classification: represented ? "represented" : "reasoned_excluded",
    node_ids: references.node_ids ?? [],
    edge_ids: references.edge_ids ?? [],
    path_ids: references.path_ids ?? [],
    unknown_ids: references.unknown_ids ?? [],
    excluded_sibling_ids: references.excluded_sibling_ids ?? [],
    rationale,
    evidence_refs: fileEvidence("docs/harness-map.md"),
  };
}

function baseGraphInput(graphId = "GRAPH-quality") {
  const nodes = [
    {
      id: "NODE-entry",
      kind: "public_api",
      path: "src/api/index.mjs",
      symbol: "handleRequest",
      label: "public entry",
      boundary: "entry_point",
      confidence: "observed",
      coverage: "complete",
      evidence_refs: fileEvidence("src/api/index.mjs"),
    },
    {
      id: "NODE-service",
      kind: "module",
      path: "src/service/worker.mjs",
      symbol: "applyChange",
      label: "service worker",
      boundary: "module",
      confidence: "observed",
      coverage: "complete",
      evidence_refs: fileEvidence("src/service/worker.mjs"),
    },
    {
      id: "NODE-store",
      kind: "data_store",
      path: "src/store/records.mjs",
      symbol: "writeRecord",
      label: "record store",
      boundary: "persistence",
      confidence: "observed",
      coverage: "complete",
      evidence_refs: fileEvidence("src/store/records.mjs"),
    },
    {
      id: "NODE-test",
      kind: "test",
      path: "tests/service.test.mjs",
      symbol: null,
      label: "service contract test",
      boundary: "operational",
      confidence: "observed",
      coverage: "complete",
      evidence_refs: fileEvidence("tests/service.test.mjs"),
    },
  ];
  const edges = [
    {
      id: "EDGE-entry-service",
      from: "NODE-entry",
      to: "NODE-service",
      relationship: "calls",
      confidence: "observed",
      coverage: "complete",
      evidence_refs: fileEvidence("src/api/index.mjs"),
    },
    {
      id: "EDGE-service-store",
      from: "NODE-service",
      to: "NODE-store",
      relationship: "writes",
      confidence: "observed",
      coverage: "complete",
      evidence_refs: fileEvidence("src/service/worker.mjs"),
    },
    {
      id: "EDGE-test-service",
      from: "NODE-test",
      to: "NODE-service",
      relationship: "verifies",
      confidence: "observed",
      coverage: "complete",
      evidence_refs: fileEvidence("tests/service.test.mjs"),
    },
  ];
  const affectedPaths = [
    {
      id: "BLAST-direct",
      kind: "direct",
      node_ids: ["NODE-entry", "NODE-service"],
      edge_ids: ["EDGE-entry-service"],
      critical: true,
      verification_node_ids: ["NODE-test"],
      confidence: "observed",
      evidence_refs: fileEvidence("src/api/index.mjs"),
    },
    {
      id: "BLAST-transitive",
      kind: "transitive",
      node_ids: ["NODE-entry", "NODE-service", "NODE-store"],
      edge_ids: ["EDGE-entry-service", "EDGE-service-store"],
      critical: true,
      verification_node_ids: ["NODE-test"],
      confidence: "observed",
      evidence_refs: fileEvidence("src/service/worker.mjs"),
    },
  ];
  const excludedSiblings = [{
    id: "EXCLUDED-unrelated",
    path: "src/unrelated",
    reason: "separate entry and state ownership",
    confidence: "observed",
    evidence_refs: fileEvidence("src/unrelated/index.mjs"),
  }];
  const boundaryByCategory = {
    direct_affected_paths: boundary("direct_affected_paths", { path_ids: ["BLAST-direct"] }),
    transitive_affected_paths: boundary("transitive_affected_paths", { path_ids: ["BLAST-transitive"] }),
    externally_reachable_entry_points: boundary("externally_reachable_entry_points", { node_ids: ["NODE-entry"] }),
    downstream_state_or_side_effects: boundary("downstream_state_or_side_effects", {
      node_ids: ["NODE-store"],
      edge_ids: ["EDGE-service-store"],
    }),
    cross_boundary_contracts: boundary("cross_boundary_contracts", {
      node_ids: ["NODE-entry", "NODE-store"],
      edge_ids: ["EDGE-entry-service", "EDGE-service-store"],
    }),
    critical_path_tests: boundary("critical_path_tests", { node_ids: ["NODE-test"], path_ids: ["BLAST-direct", "BLAST-transitive"] }),
    relevant_unknown_paths: boundary("relevant_unknown_paths", {}, "bounded evidence found no unresolved affected path"),
    excluded_sibling_paths: boundary("excluded_sibling_paths", { excluded_sibling_ids: ["EXCLUDED-unrelated"] }),
  };
  return {
    graph_id: graphId,
    risk_class: "high",
    nodes,
    edges,
    affected_paths: affectedPaths,
    excluded_siblings: excludedSiblings,
    unknowns: [],
    coverage: {
      completeness: "complete",
      semantic_tool_status: "unavailable",
      semantic_tools: [],
      fallback_tools: ["rg", "bounded-read"],
      reduced_semantic_coverage: true,
      truncated: false,
      truncation_reason: null,
      available_evaluator_ids: ["dependency-graph-v1", "test-coverage-v1", "cycle-v1"],
      unavailable_evaluator_ids: [],
      boundaries: IMPACT_BOUNDARY_CATEGORIES.map((category) => boundaryByCategory[category]),
      evidence_refs: [
        { kind: "check", value: "quality-architecture-evaluator-probe" },
        ...fileEvidence("docs/recursive-context-mode.md"),
      ],
    },
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function graphWith({ id, mutate = () => {} }) {
  const input = baseGraphInput(id);
  mutate(input);
  return buildEngineeringImpactGraph(input);
}

function policyWith({ id, rules, required, enforceExisting = false }) {
  return buildArchitecturePolicy({
    policy_id: id,
    enforce_existing: enforceExisting,
    required_evaluator_ids: required,
    rules,
  });
}

function addForbiddenImport(input, targetPath = "src/library/index.mjs") {
  input.nodes.push({
    id: "NODE-library",
    kind: "module",
    path: targetPath,
    symbol: null,
    label: "library module",
    boundary: "module",
    confidence: "observed",
    coverage: "complete",
    evidence_refs: fileEvidence(targetPath),
  });
  input.edges.push({
    id: "EDGE-service-library",
    from: "NODE-service",
    to: "NODE-library",
    relationship: "imports",
    confidence: "observed",
    coverage: "complete",
    evidence_refs: fileEvidence("src/service/worker.mjs"),
  });
}

function addCycle(input) {
  for (const [id, relativePath] of [["NODE-cycle-a", "src/cycle/a.mjs"], ["NODE-cycle-b", "src/cycle/b.mjs"]]) {
    input.nodes.push({
      id,
      kind: "module",
      path: relativePath,
      symbol: null,
      label: id,
      boundary: "module",
      confidence: "observed",
      coverage: "complete",
      evidence_refs: fileEvidence(relativePath),
    });
  }
  input.edges.push(
    {
      id: "EDGE-cycle-a-b",
      from: "NODE-cycle-a",
      to: "NODE-cycle-b",
      relationship: "imports",
      confidence: "observed",
      coverage: "complete",
      evidence_refs: fileEvidence("src/cycle/a.mjs"),
    },
    {
      id: "EDGE-cycle-b-a",
      from: "NODE-cycle-b",
      to: "NODE-cycle-a",
      relationship: "imports",
      confidence: "observed",
      coverage: "complete",
      evidence_refs: fileEvidence("src/cycle/b.mjs"),
    },
  );
}

const baseGraph = buildEngineeringImpactGraph(baseGraphInput());
for (const schema of [impactSchema, policySchema, evaluationSchema, postEvidenceSchema]) {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema_version.const, 1);
}
assert.equal(validateArchitecturePolicy(policyExample), policyExample);
assert.equal(parseArchitecturePolicy(JSON.stringify(policyExample)).fingerprint, policyExample.fingerprint);
rejects(() => parseArchitecturePolicy("{"), "QUALITY_ARCHITECTURE_POLICY_JSON");
rejects(() => parseArchitecturePolicy("x".repeat(256 * 1024 + 1)), "QUALITY_ARCHITECTURE_POLICY_JSON_BYTES");
assert.equal(validateEngineeringImpactGraph(baseGraph), baseGraph);
assert(Object.isFrozen(baseGraph));
assert(Object.isFrozen(baseGraph.nodes));
assert(Object.isFrozen(baseGraph.nodes[0].evidence_refs));
assert.equal(buildEngineeringImpactGraph(baseGraphInput()).fingerprint, baseGraph.fingerprint);

rejects(() => buildEngineeringImpactGraph({ ...baseGraphInput(), surprise: true }), "CONTRACT_UNKNOWN_FIELD");
rejects(() => graphWith({
  id: "GRAPH-duplicate",
  mutate: (input) => input.nodes.push(clone(input.nodes[0])),
}), "QUALITY_DUPLICATE_ID");
rejects(() => graphWith({
  id: "GRAPH-dangling",
  mutate: (input) => { input.edges[0].to = "NODE-missing"; },
}), "QUALITY_IMPACT_DANGLING_EDGE");
rejects(() => graphWith({
  id: "GRAPH-kind",
  mutate: (input) => { input.nodes[0].kind = "invented_kind"; },
}), "CONTRACT_ENUM");
rejects(() => graphWith({
  id: "GRAPH-no-evidence",
  mutate: (input) => { input.nodes[0].evidence_refs = []; },
}), "QUALITY_ARRAY");
rejects(() => graphWith({
  id: "GRAPH-unknown-plan",
  mutate: (input) => {
    input.nodes[0].confidence = "unknown";
    input.nodes[0].coverage = "unknown";
    input.nodes[0].evidence_refs = [];
  },
}), "QUALITY_IMPACT_UNKNOWN_PLAN");
rejects(() => graphWith({
  id: "GRAPH-traversal",
  mutate: (input) => { input.nodes[0].path = "../outside.mjs"; },
}), "PRIVACY_PATH");
rejects(() => graphWith({
  id: "GRAPH-noncanonical",
  mutate: (input) => { input.nodes[0].path = "src\\api\\index.mjs"; },
}), "QUALITY_PATH_CANONICAL");
rejects(() => graphWith({
  id: "GRAPH-evidence-noncanonical",
  mutate: (input) => { input.nodes[0].evidence_refs[0].value = "src\\api\\index.mjs"; },
}), "QUALITY_PATH_CANONICAL");
rejects(() => graphWith({
  id: "GRAPH-chain",
  mutate: (input) => { input.affected_paths[0].node_ids.reverse(); },
}), "QUALITY_IMPACT_PATH_CHAIN");
rejects(() => graphWith({
  id: "GRAPH-boundary",
  mutate: (input) => { input.coverage.boundaries.pop(); },
}), "QUALITY_ARRAY");
rejects(() => graphWith({
  id: "GRAPH-boundary-subject",
  mutate: (input) => {
    const item = input.coverage.boundaries.find((entry) => entry.category === "critical_path_tests");
    item.node_ids = ["NODE-service"];
    item.path_ids = [];
  },
}), "QUALITY_IMPACT_BOUNDARY_SUBJECT");

const tamperedGraph = clone(baseGraph);
tamperedGraph.nodes[0].label = "tampered label";
rejects(() => validateEngineeringImpactGraph(tamperedGraph), "QUALITY_IMPACT_FINGERPRINT");

const cleanPolicy = policyWith({
  id: "ARCHPOLICY-clean",
  required: ["test-coverage-v1"],
  rules: [{
    id: "ARCHRULE-tests",
    kind: "require_test_coverage",
    subject: { type: "path_prefix", value: "src/service" },
    minimum_tests: 1,
    evaluator_id: "test-coverage-v1",
    rationale: "service changes need contract coverage",
  }],
});
assert.equal(validateArchitecturePolicy(cleanPolicy), cleanPolicy);
assert(Object.isFrozen(cleanPolicy.rules));
const cleanEvaluation = evaluateArchitecturePolicy({ graph: baseGraph, policy: cleanPolicy, baseline: null });
assert.equal(cleanEvaluation.status, "passed");
assert.equal(cleanEvaluation.computational, true);
assert.equal(validateArchitectureEvaluation(cleanEvaluation), cleanEvaluation);
assert(Object.isFrozen(cleanEvaluation));

const postEvidence = createPostEditArchitectureEvidence({
  evidence_id: "post-architecture-clean",
  mechanism_kind: "project_check",
  extractor_identity: {
    producer: "fixture/project-architecture-check-v1",
    mechanism_id: "architecture-graph",
    implementation_fingerprint: `sha256:${"1".repeat(64)}`,
  },
  evaluator_identity: {
    producer: "opencode-harness/architecture-policy-v1",
    algorithm_ids: ["test-coverage-v1"],
    implementation_fingerprint: `sha256:${"2".repeat(64)}`,
  },
  command_receipt_fingerprint: `sha256:${"3".repeat(64)}`,
  extractor_output_fingerprint: `sha256:${"5".repeat(64)}`,
  policy: cleanPolicy,
  final_workspace_fingerprint: `sha256:${"4".repeat(64)}`,
  extracted_graph: baseGraph,
  architecture_evaluation: cleanEvaluation,
  completed_at: "2026-07-15T12:00:00.000Z",
});
assert.equal(validatePostEditArchitectureEvidence(postEvidence), postEvidence);
assert.deepEqual(postEvidence.architecture_evaluation.violations, cleanEvaluation.violations);
assert(Object.isFrozen(postEvidence.architecture_evaluation));
rejects(() => createPostEditArchitectureEvidence({
  evidence_id: "post-architecture-unbound",
  mechanism_kind: "project_check",
  extractor_identity: postEvidence.extractor_identity,
  evaluator_identity: postEvidence.evaluator_identity,
  command_receipt_fingerprint: postEvidence.command_receipt_fingerprint,
  extractor_output_fingerprint: postEvidence.extractor_output_fingerprint,
  policy: cleanPolicy,
  final_workspace_fingerprint: postEvidence.final_workspace_fingerprint,
  extracted_graph: graphWith({ id: "GRAPH-post-unbound" }),
  architecture_evaluation: cleanEvaluation,
  completed_at: "2026-07-15T12:00:00.000Z",
}), "QUALITY_POST_ARCHITECTURE_BINDING");
const wrongEvaluatorIdentity = clone(postEvidence);
wrongEvaluatorIdentity.evaluator_identity.algorithm_ids = ["dependency-graph-v1"];
rejects(() => validatePostEditArchitectureEvidence(wrongEvaluatorIdentity), "QUALITY_POST_ARCHITECTURE_IDENTITY");
rejects(() => createPostEditArchitectureEvidence({
  evidence_id: "post-architecture-missing-receipt",
  mechanism_kind: "project_check",
  extractor_identity: postEvidence.extractor_identity,
  evaluator_identity: postEvidence.evaluator_identity,
  command_receipt_fingerprint: null,
  extractor_output_fingerprint: postEvidence.extractor_output_fingerprint,
  policy: cleanPolicy,
  final_workspace_fingerprint: postEvidence.final_workspace_fingerprint,
  extracted_graph: baseGraph,
  architecture_evaluation: cleanEvaluation,
  completed_at: "2026-07-15T12:00:00.000Z",
}), "QUALITY_POST_ARCHITECTURE_RECEIPT");

const notConfigured = evaluateArchitecturePolicy({ graph: baseGraph, policy: null, baseline: null });
assert.equal(notConfigured.status, "not_configured");
assert.equal(notConfigured.computational, false);
assert.deepEqual(notConfigured.violations, []);

const prefixPolicy = policyWith({
  id: "ARCHPOLICY-prefix",
  required: ["dependency-graph-v1"],
  rules: [{
    id: "ARCHRULE-prefix-allow",
    kind: "allow_dependency",
    source: { type: "exact_path", value: "src/service/worker.mjs" },
    target: { type: "path_prefix", value: "src/lib" },
    relationship_kinds: ["imports"],
    evaluator_id: "dependency-graph-v1",
    rationale: "service imports stay within the library boundary",
  }],
});
const prefixFalseMatch = graphWith({ id: "GRAPH-prefix-false", mutate: addForbiddenImport });
const prefixEvaluation = evaluateArchitecturePolicy({ graph: prefixFalseMatch, policy: prefixPolicy, baseline: baseGraph });
assert.equal(prefixEvaluation.status, "failed");
assert.equal(prefixEvaluation.violations[0].kind, "dependency_not_allowed");
const prefixTrueMatch = graphWith({
  id: "GRAPH-prefix-true",
  mutate: (input) => addForbiddenImport(input, "src/lib/index.mjs"),
});
assert.equal(evaluateArchitecturePolicy({ graph: prefixTrueMatch, policy: prefixPolicy, baseline: baseGraph }).status, "passed");
const caseMismatch = graphWith({
  id: "GRAPH-prefix-case",
  mutate: (input) => addForbiddenImport(input, "src/Lib/index.mjs"),
});
assert.equal(evaluateArchitecturePolicy({ graph: caseMismatch, policy: prefixPolicy, baseline: baseGraph }).status, "failed");

const conflictPolicy = policyWith({
  id: "ARCHPOLICY-conflict",
  required: ["dependency-graph-v1"],
  rules: [
    {
      id: "ARCHRULE-allow-store",
      kind: "allow_dependency",
      source: { type: "exact_path", value: "src/service/worker.mjs" },
      target: { type: "exact_path", value: "src/store/records.mjs" },
      relationship_kinds: ["writes"],
      evaluator_id: "dependency-graph-v1",
      rationale: "declared persistence target",
    },
    {
      id: "ARCHRULE-deny-store",
      kind: "deny_dependency",
      source: { type: "exact_path", value: "src/service/worker.mjs" },
      target: { type: "exact_path", value: "src/store/records.mjs" },
      relationship_kinds: ["writes"],
      evaluator_id: "dependency-graph-v1",
      rationale: "direct persistence writes are forbidden",
    },
  ],
});
const conflict = evaluateArchitecturePolicy({ graph: baseGraph, policy: conflictPolicy, baseline: null });
assert.equal(conflict.status, "failed");
assert.deepEqual(conflict.violations.map((entry) => entry.kind), ["dependency_denied"]);

const cyclePolicy = policyWith({
  id: "ARCHPOLICY-cycle",
  required: ["cycle-v1"],
  rules: [{
    id: "ARCHRULE-no-cycle",
    kind: "deny_cycle",
    scope: { type: "path_prefix", value: "src/cycle" },
    relationship_kinds: ["imports"],
    evaluator_id: "cycle-v1",
    rationale: "cycle modules must remain acyclic",
  }],
});
const cycleGraph = graphWith({ id: "GRAPH-cycle", mutate: addCycle });
const cycleEvaluation = evaluateArchitecturePolicy({ graph: cycleGraph, policy: cyclePolicy, baseline: baseGraph });
assert.equal(cycleEvaluation.status, "failed");
assert.equal(cycleEvaluation.violations[0].kind, "cycle_detected");
assert.deepEqual(cycleEvaluation.violations[0].subject_ids, ["NODE-cycle-a", "NODE-cycle-b"]);

const unchangedPolicy = policyWith({
  id: "ARCHPOLICY-unchanged",
  required: ["dependency-graph-v1"],
  rules: [{
    id: "ARCHRULE-deny-store-unchanged",
    kind: "deny_dependency",
    source: { type: "exact_path", value: "src/service/worker.mjs" },
    target: { type: "exact_path", value: "src/store/records.mjs" },
    relationship_kinds: ["writes"],
    evaluator_id: "dependency-graph-v1",
    rationale: "new direct writes are forbidden",
  }],
});
const unchanged = evaluateArchitecturePolicy({
  graph: graphWith({ id: "GRAPH-candidate-same" }),
  policy: unchangedPolicy,
  baseline: graphWith({ id: "GRAPH-baseline-same" }),
});
assert.equal(unchanged.status, "passed");
assert.equal(unchanged.violations[0].disposition, "unchanged");
assert.equal(unchanged.violations[0].blocking, false);

const enforceExistingPolicy = policyWith({
  id: "ARCHPOLICY-enforce-existing",
  required: ["dependency-graph-v1"],
  enforceExisting: true,
  rules: clone(unchangedPolicy.rules),
});
const enforced = evaluateArchitecturePolicy({
  graph: graphWith({ id: "GRAPH-candidate-enforced" }),
  policy: enforceExistingPolicy,
  baseline: graphWith({ id: "GRAPH-baseline-enforced" }),
});
assert.equal(enforced.status, "failed");
assert.equal(enforced.violations[0].disposition, "unchanged");
assert.equal(enforced.violations[0].blocking, true);

const unavailableGraph = graphWith({
  id: "GRAPH-unavailable",
  mutate: (input) => {
    input.coverage.available_evaluator_ids = input.coverage.available_evaluator_ids.filter((id) => id !== "cycle-v1");
    input.coverage.unavailable_evaluator_ids = ["cycle-v1"];
  },
});
const blocked = evaluateArchitecturePolicy({ graph: unavailableGraph, policy: cyclePolicy, baseline: null });
assert.equal(blocked.status, "blocked");
assert.equal(blocked.evaluators[0].candidate_status, "unavailable");

const unsupportedPolicy = policyWith({
  id: "ARCHPOLICY-unsupported",
  required: ["custom-evaluator-v1"],
  rules: [{
    id: "ARCHRULE-custom",
    kind: "deny_cycle",
    scope: { type: "path_prefix", value: "src/cycle" },
    relationship_kinds: ["imports"],
    evaluator_id: "custom-evaluator-v1",
    rationale: "custom evaluator must not pass silently",
  }],
});
const unsupported = evaluateArchitecturePolicy({ graph: cycleGraph, policy: unsupportedPolicy, baseline: null });
assert.equal(unsupported.status, "blocked");
assert.equal(unsupported.evaluators[0].candidate_status, "unsupported");

const tamperedPolicy = clone(cleanPolicy);
tamperedPolicy.enforce_existing = true;
rejects(() => validateArchitecturePolicy(tamperedPolicy), "QUALITY_ARCHITECTURE_POLICY_FINGERPRINT");
const tamperedEvaluation = clone(cleanEvaluation);
tamperedEvaluation.graph_id = "GRAPH-tampered";
rejects(() => validateArchitectureEvaluation(tamperedEvaluation), "QUALITY_ARCHITECTURE_EVALUATION_FINGERPRINT");
rejects(() => buildArchitecturePolicy({
  policy_id: "ARCHPOLICY-unsafe",
  enforce_existing: false,
  required_evaluator_ids: ["dependency-graph-v1"],
  rules: [{
    id: "ARCHRULE-unsafe",
    kind: "deny_dependency",
    source: { type: "path_prefix", value: "src\\service" },
    target: { type: "path_prefix", value: "src/store" },
    relationship_kinds: ["writes"],
    evaluator_id: "dependency-graph-v1",
    rationale: "canonical selectors only",
  }],
}), "QUALITY_PATH_CANONICAL");
rejects(() => evaluateArchitecturePolicy({ graph: baseGraph, policy: null, baseline: baseGraph }), "QUALITY_ARCHITECTURE_BASELINE_WITHOUT_POLICY");

console.log("Quality impact-graph and architecture-policy verification passed (strict schemas, bounded selectors, baseline comparison, fail-closed evaluators).");
