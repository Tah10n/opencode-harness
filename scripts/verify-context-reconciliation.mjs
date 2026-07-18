import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildArchitecturePolicy, evaluateArchitecturePolicy } from "../lib/quality/architecture.mjs";
import { selectMinimumContextStrategy } from "../lib/quality/context-strategies.mjs";
import { evaluateContextSufficiency } from "../lib/quality/context-sufficiency.mjs";
import {
  CONTEXT_RECONCILIATION_REASON_CODES,
  assertContextReconciliationCurrent,
  classifyContextReconciliationPathKind,
  createReviewerReconciliationEvidence,
  reconcileFinalBlastRadius,
  validateContextReconciliation,
} from "../lib/quality/context-reconciliation.mjs";
import { updateEngineeringDossierDraft } from "../lib/quality/dossier.mjs";
import { buildEngineeringImpactGraph, engineeringImpactGraphFingerprintInput } from "../lib/quality/impact-graph.mjs";
import {
  createPostEditArchitectureEvidence,
  derivePostEditArchitectureGraphDelta,
  validatePostEditArchitectureEvidence,
} from "../lib/quality/post-architecture-evidence.mjs";
import { createWholeSystemContextReportDraft, finalizeWholeSystemContextReport } from "../lib/quality/whole-system-context-report.mjs";
import { fingerprint } from "../lib/quality/validation.mjs";
import {
  completeContextContent,
  CONTEXT_TEST_FINAL_TIME,
  CONTEXT_TEST_TIME,
  CONTEXT_TEST_WORKSPACE,
  contextTestDossier,
  contextTestReceipt,
  contextTestTaskProfileEvidence,
} from "./context-test-fixtures.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(fs.readFileSync(path.join(root, "quality/schemas/context-reconciliation.schema.json"), "utf8"));
function resolveSchemaNode(node) {
  if (node?.$ref === undefined) return node;
  const segments = node.$ref.replace(/^#\//u, "").split("/");
  return segments.reduce((value, segment) => value[segment], schema);
}
function schemaStringAccepts(node, value) {
  const resolved = resolveSchemaNode(node);
  if (resolved.anyOf) return resolved.anyOf.some((entry) => schemaStringAccepts(entry, value));
  if (value === null) return resolved.type === "null" || (Array.isArray(resolved.type) && resolved.type.includes("null"));
  if (typeof value !== "string" || (resolved.type !== "string" && !(Array.isArray(resolved.type) && resolved.type.includes("string")))) return false;
  const length = [...value].length;
  if (Number.isInteger(resolved.minLength) && length < resolved.minLength) return false;
  if (Number.isInteger(resolved.maxLength) && length > resolved.maxLength) return false;
  if (typeof resolved.pattern === "string" && !new RegExp(resolved.pattern, "u").test(value)) return false;
  return true;
}
assert.equal(schema.additionalProperties, false);
assert.equal(schema.properties.schema_version.const, 1);
const reconciliationIdPattern = new RegExp(schema.properties.reconciliation_id.pattern);
for (const id of ["CTXREC-valid", `CTXREC-${"x".repeat(121)}`]) {
  assert.equal(reconciliationIdPattern.test(id), true, `schema must accept reconciliation ID ${id}`);
}
for (const id of ["CTXREC-", "CTXREC-trailing.", "WRONG-reconciliation", `CTXREC-${"x".repeat(122)}`]) {
  assert.equal(reconciliationIdPattern.test(id), false, `schema must reject reconciliation ID ${id}`);
}
const reconciliationUnplannedIdPattern = new RegExp(schema.$defs.unplannedItem.properties.id.pattern);
for (const id of ["UNPLANNED-valid", `UNPLANNED-${"x".repeat(118)}`]) {
  assert.equal(reconciliationUnplannedIdPattern.test(id), true, `schema must accept reconciliation unplanned ID ${id}`);
}
for (const id of ["UNPLANNED-", "UNPLANNED-trailing.", "WRONG-unplanned", `UNPLANNED-${"x".repeat(119)}`]) {
  assert.equal(reconciliationUnplannedIdPattern.test(id), false, `schema must reject reconciliation unplanned ID ${id}`);
}
assert.equal(resolveSchemaNode(schema.properties.verified_post_mutation_test_obligation_ids).maxItems, 256);
assert.equal(resolveSchemaNode(resolveSchemaNode(schema.properties.verified_post_mutation_test_obligation_ids).items).maxLength, 512);
assert.equal(resolveSchemaNode(schema.$defs.mappingIdArray).maxItems, 64);
assert.equal(resolveSchemaNode(resolveSchemaNode(schema.$defs.mappingIdArray).items).maxLength, 512);
assert.equal(resolveSchemaNode(schema.properties.unrelated_paths).maxItems, 256);
assert.equal(resolveSchemaNode(resolveSchemaNode(schema.properties.unrelated_paths).items).maxLength, 1000);
assert.deepEqual(
  [...resolveSchemaNode(schema.properties.reason_codes).items.enum].sort(),
  [...CONTEXT_RECONCILIATION_REASON_CODES].sort(),
);
assert.equal(schemaStringAccepts(schema.$defs.unplannedItem.properties.description, "é".repeat(2000)), true);
assert.equal(schemaStringAccepts(schema.$defs.unplannedItem.properties.description, "é".repeat(2001)), false);
assert.equal(schemaStringAccepts(schema.$defs.unplannedItem.properties.analysis_update_id, "é".repeat(512)), true);
assert.equal(schemaStringAccepts(schema.$defs.unplannedItem.properties.analysis_update_id, "é".repeat(513)), false);

const PLANNED_SCOPE_DEFINITIONS = Object.freeze([
  { areaId: "AREA-config", nodeId: "NODE-config", path: "config/context-settings.json", nodeKind: "config", changedKind: "config", relationship: "configures" },
  { areaId: "AREA-doc", nodeId: "NODE-doc", path: "docs/context-notes.md", nodeKind: "doc", changedKind: "documentation", relationship: "documents" },
  { areaId: "AREA-fixture", nodeId: "NODE-fixture", path: "fixtures/context-case.json", nodeKind: "file", changedKind: "fixture", relationship: "tests" },
  { areaId: "AREA-artifact", nodeId: "NODE-artifact", path: "assets/context-artifact.png", nodeKind: "generated_artifact", changedKind: "other", relationship: "generates" },
  { areaId: "AREA-container", nodeId: "NODE-container", path: ".github", nodeKind: "repository", changedKind: null, relationship: "owns" },
]);
const baseDossier = contextTestDossier({
  riskClass: "high",
  taskType: "bug_fix",
  additionalTestObligations: [{
    id: "TEST-optional-context",
    check_id: "context-optional-regression",
    kind: "integration",
    phase: "integration",
    scope_ids: ["AREA-main"],
    command_or_mechanism: "node scripts/verify-context-optional.mjs",
    required: false,
    trusted_producer: "opencode-harness-context-verifier",
  }],
});
const plannedScopeGraph = derivedImpactGraph(baseDossier.impact_graph, "GRAPH-context-high-planned-scopes", (input) => {
  for (const entry of PLANNED_SCOPE_DEFINITIONS) {
    input.nodes.push({
      id: entry.nodeId,
      kind: entry.nodeKind,
      path: entry.path,
      symbol: null,
      label: `planned ${entry.nodeKind} scope`,
      boundary: "operational",
      confidence: "observed",
      coverage: "complete",
      evidence_refs: [{ kind: "file", value: entry.path }],
    });
    const edgeId = `EDGE-entry-${entry.nodeId.slice("NODE-".length)}`;
    input.edges.push({
      id: edgeId,
      from: "NODE-entry",
      to: entry.nodeId,
      relationship: entry.relationship,
      confidence: "observed",
      coverage: "complete",
      evidence_refs: [{ kind: "file", value: entry.path }],
    });
    input.affected_paths.push({
      id: `BLAST-${entry.nodeId.slice("NODE-".length)}`,
      kind: "direct",
      node_ids: ["NODE-entry", entry.nodeId],
      edge_ids: [edgeId],
      critical: false,
      verification_node_ids: [],
      confidence: "observed",
      evidence_refs: [{ kind: "file", value: entry.path }],
    });
  }
  input.coverage.boundaries.find((entry) => entry.category === "direct_affected_paths").path_ids.push(
    ...PLANNED_SCOPE_DEFINITIONS.map((entry) => `BLAST-${entry.nodeId.slice("NODE-".length)}`),
  );
});
const plannedAffectedAreas = PLANNED_SCOPE_DEFINITIONS.map((entry) => ({
  id: entry.areaId,
  path: entry.path,
  node_kind: entry.nodeKind,
  reason: `planned ${entry.nodeKind} ownership scope`,
  confidence: "observed",
  evidence_refs: [{ kind: "file", value: entry.path }],
}));
const dossier = updateEngineeringDossierDraft(baseDossier, {
  expected_revision: baseDossier.revision,
  updated_at: "2026-07-17T10:00:00.001Z",
  patch: {
    affected_areas: [...baseDossier.affected_areas, ...plannedAffectedAreas],
    test_obligations: [...baseDossier.test_obligations, {
      id: "TEST-config",
      check_id: "context-config-regression",
      kind: "integration",
      phase: "integration",
      scope_ids: ["AREA-config"],
      command_or_mechanism: "node scripts/verify-context-config.mjs",
      required: true,
      trusted_producer: "opencode-harness-context-verifier",
    }],
    impact_graph: plannedScopeGraph,
    context_coverage: {
      ...baseDossier.context_coverage,
      affected_area_ids: [...baseDossier.context_coverage.affected_area_ids, ...plannedAffectedAreas.map((entry) => entry.id)].sort(),
      covered_area_ids: [...baseDossier.context_coverage.covered_area_ids, ...plannedAffectedAreas.map((entry) => entry.id)].sort(),
    },
  },
});
const strategy = selectMinimumContextStrategy({ risk_class: "high", task_type: "bug_fix" });
const outline = contextTestReceipt({
  receiptId: "CTXRECEIPT-reconciliation-outline",
  sequence: 1,
  dossier,
  toolId: "context_outline",
  startedAt: "2026-07-17T10:01:00.000Z",
  completedAt: "2026-07-17T10:02:00.000Z",
});
const receipt = contextTestReceipt({
  receiptId: "CTXRECEIPT-reconciliation-content",
  sequence: 2,
  dossier,
  previousReceiptFingerprint: outline.fingerprint,
});
const receipts = [outline, receipt];
const draft = createWholeSystemContextReportDraft({
  report_id: "CONTEXT-reconciliation",
  session_key: receipt.session_key,
  strategy_binding: strategy,
  workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
  dossier,
  created_at: CONTEXT_TEST_TIME,
  content: completeContextContent({ strategyBinding: strategy, dossier, receiptIds: receipts.map((entry) => entry.receipt_id) }),
});
const report = finalizeWholeSystemContextReport(draft, {
  finalized_at: CONTEXT_TEST_FINAL_TIME,
  strategy_binding: strategy,
  workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
  dossier,
  receipt_index: { receipts },
});
const decision = evaluateContextSufficiency({
  decision_id: "CTXDEC-reconciliation",
  session_key: receipt.session_key,
  strategy_binding: strategy,
  dossier,
  workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
  receipt_index: { receipts },
  report,
  task_profile_evidence: contextTestTaskProfileEvidence({ dossier, sessionKey: receipt.session_key }),
  evaluated_at: "2026-07-17T10:06:00.000Z",
});
assert.equal(decision.status, "sufficient");

const FINAL_WORKSPACE = fingerprint({ workspace: "final", revision: 1 });
const DEFAULT_CHANGED_PATHS = [{
  path: "lib/context-example.mjs",
  kind: "source",
  ownership_ids: ["AREA-main"],
  context_subject_ids: ["NODE-entry", "BLAST-direct"],
  test_obligation_ids: ["TEST-context"],
}];
const PASSED_CHECKS = Object.fromEntries([
  "changed_path_ownership",
  "public_contracts",
  "dependency_directions",
  "side_effect_edges",
  "critical_path_tests",
  "unrelated_changes",
].map((key) => [key, { status: "passed", finding_ids: [] }]));
const ARCHITECTURE_POLICY = buildArchitecturePolicy({
  policy_id: "ARCHPOLICY-context-reconciliation",
  enforce_existing: false,
  required_evaluator_ids: ["dependency-graph-v1"],
  rules: [{
    id: "ARCHRULE-context-no-never-import",
    kind: "deny_dependency",
    source: { type: "exact_path", value: "lib/context-example.mjs" },
    target: { type: "exact_path", value: "lib/never.mjs" },
    relationship_kinds: ["imports"],
    evaluator_id: "dependency-graph-v1",
    rationale: "the bounded context fixture must not import an excluded layer",
  }],
});

function derivedImpactGraph(sourceGraph, graphId, mutate = () => {}) {
  const input = JSON.parse(JSON.stringify(engineeringImpactGraphFingerprintInput(sourceGraph)));
  delete input.schema_version;
  input.graph_id = graphId;
  mutate(input);
  return buildEngineeringImpactGraph(input);
}

function finalImpactGraph(label, mutate = () => {}) {
  return derivedImpactGraph(dossier.impact_graph, `GRAPH-context-final-${label}`, mutate);
}

function postArchitectureEvidence(finalGraph, { workspaceFingerprint = FINAL_WORKSPACE, evidenceId = `post-${finalGraph.graph_id}` } = {}) {
  const evaluation = evaluateArchitecturePolicy({
    graph: finalGraph,
    policy: ARCHITECTURE_POLICY,
    baseline: dossier.impact_graph,
  });
  assert.equal(evaluation.status, "passed", JSON.stringify(evaluation.violations));
  return createPostEditArchitectureEvidence({
    evidence_id: evidenceId,
    mechanism_kind: "runner_owned_extractor",
    extractor_identity: {
      producer: "context-reconciliation-test-extractor",
      mechanism_id: "context-reconciliation-test-extractor",
      implementation_fingerprint: fingerprint({ implementation: "context-reconciliation-test-extractor-v1" }),
    },
    evaluator_identity: {
      producer: "context-reconciliation-test-evaluator",
      algorithm_ids: evaluation.evaluators.map((entry) => entry.id).sort(),
      implementation_fingerprint: fingerprint({ implementation: "context-reconciliation-test-evaluator-v1" }),
    },
    command_receipt_fingerprint: null,
    extractor_output_fingerprint: finalGraph.fingerprint,
    policy: ARCHITECTURE_POLICY,
    final_workspace_fingerprint: workspaceFingerprint,
    planned_graph: dossier.impact_graph,
    extracted_graph: finalGraph,
    architecture_evaluation: evaluation,
    completed_at: "2026-07-17T10:09:00.000Z",
  });
}

function refingerprintPostArchitectureEvidence(evidence) {
  delete evidence.graph_delta.fingerprint;
  evidence.graph_delta.fingerprint = fingerprint(evidence.graph_delta);
  delete evidence.fingerprint;
  evidence.fingerprint = fingerprint(evidence);
  return evidence;
}

function diffFingerprint({ changedPaths = DEFAULT_CHANGED_PATHS, publicContracts = [], dependencies = [], sideEffects = [], unrelated = [], unplanned = [] } = {}) {
  return fingerprint({
    changed_paths: JSON.parse(JSON.stringify(changedPaths)).sort((left, right) => left.path.localeCompare(right.path)),
    unexpected_public_contracts: [...publicContracts].sort(),
    unexpected_dependency_directions: [...dependencies].sort(),
    unexpected_side_effect_edges: [...sideEffects].sort(),
    unrelated_paths: [...unrelated].sort(),
    unplanned_items: JSON.parse(JSON.stringify(unplanned)).sort((left, right) => left.id.localeCompare(right.id)),
  });
}

function reviewerEvidence({ changedPaths = DEFAULT_CHANGED_PATHS, publicContracts = [], dependencies = [], sideEffects = [], unrelated = [], unplanned = [], checks = PASSED_CHECKS } = {}) {
  return createReviewerReconciliationEvidence({
    reviewer_result_id: `reviewer-${unplanned.length}-${changedPaths.length}`,
    session_key: receipt.session_key,
    context_decision: decision,
    final_workspace_fingerprint: FINAL_WORKSPACE,
    final_diff_fingerprint: diffFingerprint({ changedPaths, publicContracts, dependencies, sideEffects, unrelated, unplanned }),
    changed_paths: changedPaths,
    checks,
    unplanned_item_ids: unplanned.map((entry) => entry.id).sort(),
    completed_at: "2026-07-17T10:10:00.000Z",
  });
}

let counter = 0;
function reconcile({
  changedPaths = DEFAULT_CHANGED_PATHS,
  publicContracts = [],
  dependencies = [],
  sideEffects = [],
  unrelated = [],
  unplanned = [],
  evidence = undefined,
  evidenceMode = "reviewer_grounded",
  postArchitectureEvidence = null,
  verifiedTestObligationIds = ["TEST-context"],
} = {}) {
  counter += 1;
  return reconcileFinalBlastRadius({
    reconciliation_id: `CTXREC-test-${counter}`,
    session_key: receipt.session_key,
    context_decision: decision,
    dossier,
    context_report: report,
    final_workspace_fingerprint: FINAL_WORKSPACE,
    changed_paths: changedPaths,
    unexpected_public_contracts: publicContracts,
    unexpected_dependency_directions: dependencies,
    unexpected_side_effect_edges: sideEffects,
    unrelated_paths: unrelated,
    unplanned_items: unplanned,
    evidence_mode: evidenceMode,
    post_architecture_evidence: postArchitectureEvidence,
    reviewer_evidence: evidence === undefined && evidenceMode === "reviewer_grounded"
      ? reviewerEvidence({ changedPaths, publicContracts, dependencies, sideEffects, unrelated, unplanned })
      : evidence,
    verified_post_mutation_test_obligation_ids: verifiedTestObligationIds,
    reconciled_at: "2026-07-17T10:11:00.000Z",
  });
}

function hasCode(result, code) {
  assert.ok(result.reason_codes.includes(code), `expected ${code}; got ${result.reason_codes.join(", ")}`);
}

function refingerprintContextReconciliation(reconciliation) {
  delete reconciliation.fingerprint;
  reconciliation.fingerprint = fingerprint(reconciliation);
  return reconciliation;
}

const passed = reconcile();
validateContextReconciliation(passed);
assert.equal(passed.status, "passed");
assert.equal(passed.graph_completeness, "not_claimed");
assert.equal(passed.invalidates_context_decision, false);
assert.deepEqual(passed.verified_post_mutation_test_obligation_ids, ["TEST-context"]);
assertContextReconciliationCurrent(passed, { context_decision: decision, final_workspace_fingerprint: FINAL_WORKSPACE });
function reconciliationWithId(id) {
  const reconciliation = JSON.parse(JSON.stringify(passed));
  reconciliation.reconciliation_id = id;
  return refingerprintContextReconciliation(reconciliation);
}
function reconciliationWithStringField(field, value) {
  const reconciliation = JSON.parse(JSON.stringify(passed));
  reconciliation[field] = value;
  return refingerprintContextReconciliation(reconciliation);
}
const boundedIdentityFields = [
  "session_key",
  "run_id",
  "task_id",
  "context_decision_id",
  "context_report_id",
  "impact_graph_id",
];
for (const field of boundedIdentityFields) {
  for (const value of ["a".repeat(256), "é".repeat(256), "😀".repeat(256)]) {
    assert.equal(schemaStringAccepts(schema.properties[field], value), true, `${field} schema rejected its 256-code-point boundary`);
    assert.equal(validateContextReconciliation(reconciliationWithStringField(field, value))[field], value);
  }
  for (const value of ["", "a".repeat(257), "é".repeat(257), "😀".repeat(257)]) {
    assert.equal(schemaStringAccepts(schema.properties[field], value), false, `${field} schema accepted an out-of-bounds value`);
    assert.throws(
      () => validateContextReconciliation(reconciliationWithStringField(field, value)),
      (error) => error?.code === "QUALITY_STRING_BOUNDS",
    );
  }
}
const maxSchemaPath = `${"a".repeat(996)}.mjs`;
const oversizedSchemaPath = `${"a".repeat(997)}.mjs`;
assert.equal(schemaStringAccepts(schema.$defs.relativePath, maxSchemaPath), true);
assert.equal(schemaStringAccepts(schema.$defs.relativePath, oversizedSchemaPath), false);
const reconciliationWithPath = (value) => {
  const reconciliation = JSON.parse(JSON.stringify(passed));
  reconciliation.changed_paths[0].path = value;
  reconciliation.changed_paths[0].kind = classifyContextReconciliationPathKind(value);
  return refingerprintContextReconciliation(reconciliation);
};
assert.equal(validateContextReconciliation(reconciliationWithPath(maxSchemaPath)).changed_paths[0].path, maxSchemaPath);
assert.throws(
  () => validateContextReconciliation(reconciliationWithPath(oversizedSchemaPath)),
  (error) => error?.code === "QUALITY_STRING_BOUNDS",
);
for (const validPath of [
  ".github/workflows/ci.yml",
  "packages/foo.bar/file.mjs",
  "données/é.mjs",
  "space allowed/file name.md",
]) {
  assert.equal(schemaStringAccepts(schema.$defs.relativePath, validPath), true, `schema rejected canonical path ${validPath}`);
  assert.equal(validateContextReconciliation(reconciliationWithPath(validPath)).changed_paths[0].path, validPath);
}
for (const invalidPath of [
  "../escape.mjs",
  "dir/../escape.mjs",
  "/absolute.mjs",
  "C:/absolute.mjs",
  "dir\\file.mjs",
  "dir//file.mjs",
  "dir/",
  "./file.mjs",
  "dir/file.",
  "dir/file ",
  "CON",
  "dir/NUL.txt",
  "dir:name/file.mjs",
  "\0bad.mjs",
  "foo\n/../escape.mjs",
  "foo\n/NUL.txt",
  "foo\n/name./child.mjs",
  "foo\n/dir:name/file.mjs",
]) {
  assert.equal(schemaStringAccepts(schema.$defs.relativePath, invalidPath), false, `schema accepted non-canonical path ${JSON.stringify(invalidPath)}`);
  assert.throws(() => validateContextReconciliation(reconciliationWithPath(invalidPath)));
}
const reconciliationWithMappingIds = (values) => {
  const reconciliation = JSON.parse(JSON.stringify(passed));
  reconciliation.changed_paths[0].ownership_ids = values;
  return refingerprintContextReconciliation(reconciliation);
};
const maxMappingIds = Array.from({ length: 64 }, (_, index) => `AREA-boundary-${index}`);
assert.equal(validateContextReconciliation(reconciliationWithMappingIds(maxMappingIds)).changed_paths[0].ownership_ids.length, 64);
assert.throws(
  () => validateContextReconciliation(reconciliationWithMappingIds([...maxMappingIds, "AREA-boundary-64"])),
  (error) => error?.code === "QUALITY_ARRAY",
);
const mappingIdItemSchema = resolveSchemaNode(resolveSchemaNode(schema.$defs.mappingIdArray).items);
assert.equal(schemaStringAccepts(mappingIdItemSchema, "é".repeat(512)), true);
assert.equal(schemaStringAccepts(mappingIdItemSchema, "é".repeat(513)), false);
assert.equal(validateContextReconciliation(reconciliationWithMappingIds(["é".repeat(512)])).changed_paths[0].ownership_ids.length, 1);
assert.throws(
  () => validateContextReconciliation(reconciliationWithMappingIds(["é".repeat(513)])),
  (error) => error?.code === "QUALITY_STRING_BOUNDS",
);
const reconciliationWithVerifiedIds = (values) => {
  const reconciliation = JSON.parse(JSON.stringify(passed));
  reconciliation.verified_post_mutation_test_obligation_ids = [...values].sort();
  return refingerprintContextReconciliation(reconciliation);
};
const maxVerifiedIds = Array.from({ length: 256 }, (_, index) => `TEST-boundary-${index}`);
assert.equal(validateContextReconciliation(reconciliationWithVerifiedIds(maxVerifiedIds)).verified_post_mutation_test_obligation_ids.length, 256);
assert.throws(
  () => validateContextReconciliation(reconciliationWithVerifiedIds([...maxVerifiedIds, "TEST-boundary-256"])),
  (error) => error?.code === "QUALITY_ARRAY",
);
const reconciliationWithPublicContract = (value) => {
  const reconciliation = JSON.parse(JSON.stringify(passed));
  reconciliation.unexpected_public_contracts = [value];
  return refingerprintContextReconciliation(reconciliation);
};
assert.equal(validateContextReconciliation(reconciliationWithPublicContract("é".repeat(1000))).unexpected_public_contracts.length, 1);
assert.throws(
  () => validateContextReconciliation(reconciliationWithPublicContract("é".repeat(1001))),
  (error) => error?.code === "QUALITY_STRING_BOUNDS",
);
for (const [id, code] of [
  ["CTXREC-", "QUALITY_TYPED_ID"],
  ["CTXREC-trailing.", "CONTRACT_ID"],
  ["WRONG-reconciliation", "QUALITY_TYPED_ID"],
  [`CTXREC-${"x".repeat(122)}`, "CONTRACT_ID"],
]) {
  assert.throws(
    () => validateContextReconciliation(reconciliationWithId(id)),
    (error) => error?.code === code,
  );
}
const maxLengthReconciliation = reconciliationWithId(`CTXREC-${"x".repeat(121)}`);
assert.equal(validateContextReconciliation(maxLengthReconciliation), maxLengthReconciliation);

const unowned = [{ ...DEFAULT_CHANGED_PATHS[0], ownership_ids: [] }];
hasCode(reconcile({ changedPaths: unowned }), "CONTEXT_RECONCILIATION_CHANGED_PATH_UNOWNED");
const unrepresented = [{ ...DEFAULT_CHANGED_PATHS[0], context_subject_ids: [] }];
const unrepresentedResult = reconcile({ changedPaths: unrepresented });
hasCode(unrepresentedResult, "CONTEXT_RECONCILIATION_CHANGED_PATH_UNREPRESENTED");
assert.equal(unrepresentedResult.invalidates_context_decision, true);
const untested = [{ ...DEFAULT_CHANGED_PATHS[0], test_obligation_ids: [] }];
hasCode(reconcile({ changedPaths: untested }), "CONTEXT_RECONCILIATION_CRITICAL_TEST_MISSING");
hasCode(reconcile({ verifiedTestObligationIds: [] }), "CONTEXT_RECONCILIATION_CRITICAL_TEST_MISSING");
hasCode(reconcile({
  changedPaths: [{ ...DEFAULT_CHANGED_PATHS[0], test_obligation_ids: ["TEST-reproducer"] }],
  verifiedTestObligationIds: ["TEST-reproducer"],
}), "CONTEXT_RECONCILIATION_CRITICAL_TEST_MISSING");
hasCode(reconcile({
  changedPaths: [{ ...DEFAULT_CHANGED_PATHS[0], test_obligation_ids: ["TEST-optional-context"] }],
  verifiedTestObligationIds: ["TEST-optional-context"],
}), "CONTEXT_RECONCILIATION_CRITICAL_TEST_MISSING");
const mappedConfig = [{
  path: "config/context-settings.json",
  kind: "config",
  ownership_ids: ["AREA-config"],
  context_subject_ids: ["NODE-config"],
  test_obligation_ids: ["TEST-config"],
}];
assert.equal(reconcile({ changedPaths: mappedConfig, verifiedTestObligationIds: ["TEST-config"] }).status, "passed");
hasCode(reconcile({
  changedPaths: [{ ...mappedConfig[0], test_obligation_ids: [] }],
  verifiedTestObligationIds: ["TEST-config"],
}), "CONTEXT_RECONCILIATION_CRITICAL_TEST_MISSING");
hasCode(reconcile({
  changedPaths: [{ ...mappedConfig[0], test_obligation_ids: ["TEST-donor"] }],
}), "CONTEXT_RECONCILIATION_CRITICAL_TEST_MISSING");
const inventedOwnership = [{ ...DEFAULT_CHANGED_PATHS[0], ownership_ids: ["SLICE-donor"] }];
hasCode(reconcile({ changedPaths: inventedOwnership }), "CONTEXT_RECONCILIATION_CHANGED_PATH_UNOWNED");
const inventedSubject = [{ ...DEFAULT_CHANGED_PATHS[0], context_subject_ids: ["NODE-donor"] }];
hasCode(reconcile({ changedPaths: inventedSubject }), "CONTEXT_RECONCILIATION_CHANGED_PATH_UNREPRESENTED");
const wrongPathSubject = [{ ...DEFAULT_CHANGED_PATHS[0], context_subject_ids: ["NODE-store"] }];
hasCode(reconcile({ changedPaths: wrongPathSubject }), "CONTEXT_RECONCILIATION_CHANGED_PATH_UNREPRESENTED");
assert.throws(
  () => reconcile({ changedPaths: [{ ...DEFAULT_CHANGED_PATHS[0], kind: "fixture" }] }),
  (error) => error?.code === "CONTEXT_RECONCILIATION_PATH_KIND",
);
const inventedTest = [{ ...DEFAULT_CHANGED_PATHS[0], test_obligation_ids: ["TEST-donor"] }];
hasCode(reconcile({ changedPaths: inventedTest }), "CONTEXT_RECONCILIATION_CRITICAL_TEST_MISSING");
hasCode(reconcile({ publicContracts: ["public error shape changed"] }), "CONTEXT_RECONCILIATION_UNEXPECTED_PUBLIC_CONTRACT");
hasCode(reconcile({ dependencies: ["controller imports persistence"] }), "CONTEXT_RECONCILIATION_UNEXPECTED_DEPENDENCY");
hasCode(reconcile({ sideEffects: ["new cache invalidation edge"] }), "CONTEXT_RECONCILIATION_UNEXPECTED_SIDE_EFFECT");

const unplanned = [{
  id: "UNPLANNED-new-consumer",
  kind: "edge",
  severity: "high",
  path: "lib/context-consumer.mjs",
  description: "Implementation introduced a high-impact consumer outside the planned graph.",
  disposition: "requires_reanalysis",
  analysis_update_id: null,
}];
const unplannedResult = reconcile({ unplanned });
hasCode(unplannedResult, "CONTEXT_RECONCILIATION_UNPLANNED_HIGH_IMPACT");
assert.equal(unplannedResult.invalidates_context_decision, true);
function reconciliationWithUnplannedFields({ description, analysisUpdateId = null, disposition = "requires_reanalysis" }) {
  const reconciliation = JSON.parse(JSON.stringify(unplannedResult));
  reconciliation.unplanned_items[0].description = description;
  reconciliation.unplanned_items[0].analysis_update_id = analysisUpdateId;
  reconciliation.unplanned_items[0].disposition = disposition;
  return refingerprintContextReconciliation(reconciliation);
}
assert.equal(
  validateContextReconciliation(reconciliationWithUnplannedFields({ description: "é".repeat(2000) })).unplanned_items[0].description.length,
  2000,
);
assert.throws(
  () => validateContextReconciliation(reconciliationWithUnplannedFields({ description: "é".repeat(2001) })),
  (error) => error?.code === "QUALITY_STRING_BOUNDS",
);
assert.equal(
  validateContextReconciliation(reconciliationWithUnplannedFields({
    description: unplanned[0].description,
    analysisUpdateId: "é".repeat(512),
    disposition: "planned_equivalent",
  })).unplanned_items[0].analysis_update_id.length,
  512,
);
assert.throws(
  () => validateContextReconciliation(reconciliationWithUnplannedFields({
    description: unplanned[0].description,
    analysisUpdateId: "é".repeat(513),
    disposition: "planned_equivalent",
  })),
  (error) => error?.code === "QUALITY_STRING_BOUNDS",
);
function reconciliationWithUnplannedId(id) {
  const reconciliation = JSON.parse(JSON.stringify(unplannedResult));
  reconciliation.unplanned_items[0].id = id;
  return refingerprintContextReconciliation(reconciliation);
}
for (const [id, code] of [
  ["UNPLANNED-", "QUALITY_TYPED_ID"],
  ["UNPLANNED-trailing.", "CONTRACT_ID"],
  ["WRONG-unplanned", "QUALITY_TYPED_ID"],
  [`UNPLANNED-${"x".repeat(119)}`, "CONTRACT_ID"],
]) {
  assert.throws(
    () => validateContextReconciliation(reconciliationWithUnplannedId(id)),
    (error) => error?.code === code,
  );
}
const maxLengthUnplannedReconciliation = reconciliationWithUnplannedId(`UNPLANNED-${"x".repeat(118)}`);
assert.equal(validateContextReconciliation(maxLengthUnplannedReconciliation), maxLengthUnplannedReconciliation);

hasCode(reconcile({ evidence: null }), "CONTEXT_RECONCILIATION_REVIEWER_EVIDENCE_MISSING");
const staleReviewer = reviewerEvidence();
const staleBody = JSON.parse(JSON.stringify(staleReviewer));
staleBody.final_workspace_fingerprint = fingerprint({ stale: true });
delete staleBody.fingerprint;
staleBody.fingerprint = fingerprint(staleBody);
hasCode(reconcile({ evidence: staleBody }), "CONTEXT_RECONCILIATION_REVIEWER_EVIDENCE_STALE");
hasCode(reconcile({ evidenceMode: "extractor_grounded", evidence: null, postArchitectureEvidence: null }), "CONTEXT_RECONCILIATION_EXTRACTOR_EVIDENCE_MISSING");

const identicalFinalGraph = finalImpactGraph("identical");
const identicalDelta = derivePostEditArchitectureGraphDelta({
  planned_graph: dossier.impact_graph,
  final_graph: identicalFinalGraph,
});
assert.equal(Object.values(identicalDelta.counts).every((count) => count === 0), true);
const identicalEvidence = postArchitectureEvidence(identicalFinalGraph);
validatePostEditArchitectureEvidence(identicalEvidence);
const extractorPassed = reconcile({
  evidenceMode: "extractor_grounded",
  postArchitectureEvidence: identicalEvidence,
});
assert.equal(extractorPassed.status, "passed", JSON.stringify(extractorPassed.reason_codes));
assert.equal(extractorPassed.graph_completeness, "complete");
assert.equal(identicalEvidence.schema_version, 3);
assert.equal(identicalEvidence.graph_delta.schema_version, 2);
assert.deepEqual(identicalEvidence.graph_delta.trust_regressions, []);

const omittedUnrelatedNonSourcePaths = [
  { path: "docs/unrelated.md", kind: "documentation" },
  { path: "fixtures/unrelated-case.json", kind: "fixture" },
  { path: "assets/unrelated.png", kind: "other" },
];
for (const entry of omittedUnrelatedNonSourcePaths) {
  const result = reconcile({
    changedPaths: [{
      ...entry,
      ownership_ids: [],
      context_subject_ids: [],
      test_obligation_ids: [],
    }],
    unrelated: [],
    evidenceMode: "extractor_grounded",
    postArchitectureEvidence: identicalEvidence,
  });
  hasCode(result, "CONTEXT_RECONCILIATION_UNRELATED_WRITE");
  assert.deepEqual(result.unrelated_paths, [entry.path]);
}

const plannedNonSourcePaths = [
  ...PLANNED_SCOPE_DEFINITIONS
    .filter((entry) => ["documentation", "fixture", "other"].includes(entry.changedKind))
    .map((entry) => ({
      path: entry.path,
      kind: entry.changedKind,
      ownership_ids: [entry.areaId],
      context_subject_ids: [entry.nodeId],
    })),
];
for (const entry of plannedNonSourcePaths) {
  const result = reconcile({
    changedPaths: [{
      ...entry,
      test_obligation_ids: [],
    }],
    unrelated: [entry.path],
    evidenceMode: "extractor_grounded",
    postArchitectureEvidence: identicalEvidence,
  });
  assert.equal(result.status, "passed", JSON.stringify(result.reason_codes));
  assert.deepEqual(result.unrelated_paths, []);
}

const fileScopeDescendant = {
  path: "lib/context-example.mjs/notes.md",
  kind: "documentation",
  ownership_ids: ["AREA-main"],
  context_subject_ids: ["NODE-entry"],
  test_obligation_ids: [],
};
const fileScopeDescendantResult = reconcile({
  changedPaths: [fileScopeDescendant],
  unrelated: [],
  evidenceMode: "extractor_grounded",
  postArchitectureEvidence: identicalEvidence,
});
hasCode(fileScopeDescendantResult, "CONTEXT_RECONCILIATION_UNRELATED_WRITE");
assert.deepEqual(fileScopeDescendantResult.unrelated_paths, [fileScopeDescendant.path]);

const plannedContainerDescendant = {
  path: ".github/workflows/context-notes.md",
  kind: "documentation",
  ownership_ids: ["AREA-container"],
  context_subject_ids: ["NODE-container"],
  test_obligation_ids: [],
};
const plannedContainerResult = reconcile({
  changedPaths: [plannedContainerDescendant],
  unrelated: [plannedContainerDescendant.path],
  evidenceMode: "extractor_grounded",
  postArchitectureEvidence: identicalEvidence,
});
assert.equal(plannedContainerResult.status, "passed", JSON.stringify(plannedContainerResult.reason_codes));
assert.deepEqual(plannedContainerResult.unrelated_paths, []);

function assertTrustRegression(label, mutate, expectedKind) {
  const finalGraph = finalImpactGraph(label, mutate);
  const evidence = postArchitectureEvidence(finalGraph);
  assert.ok(
    evidence.graph_delta.trust_regressions.some((entry) => entry.kind === expectedKind),
    `expected ${expectedKind}; got ${evidence.graph_delta.trust_regressions.map((entry) => entry.kind).join(", ")}`,
  );
  assert.equal(evidence.graph_delta.counts.trust_regressions, evidence.graph_delta.trust_regressions.length);
  const result = reconcile({ evidenceMode: "extractor_grounded", postArchitectureEvidence: evidence });
  hasCode(result, "CONTEXT_RECONCILIATION_GRAPH_TRUST_REGRESSION");
  hasCode(result, "CONTEXT_RECONCILIATION_UNPLANNED_HIGH_IMPACT");
  assert.equal(result.invalidates_context_decision, true);
  return { evidence, result };
}

const confidenceRegression = assertTrustRegression("confidence-regression", (input) => {
  input.nodes.find((entry) => entry.id === "NODE-service").confidence = "inferred";
}, "confidence_regression");
function evidenceWithTypedId(collection, id) {
  const evidence = JSON.parse(JSON.stringify(confidenceRegression.evidence));
  evidence.graph_delta[collection][0].id = id;
  return refingerprintPostArchitectureEvidence(evidence);
}
function assertTypedIdRejected(collection, id, code) {
  assert.throws(
    () => validatePostEditArchitectureEvidence(evidenceWithTypedId(collection, id)),
    (error) => error?.code === code,
    `expected ${collection} ID ${JSON.stringify(id)} to fail with ${code}`,
  );
}
for (const [id, code] of [
  ["TRUSTREG-", "QUALITY_TYPED_ID"],
  ["TRUSTREG-trailing.", "CONTRACT_ID"],
  ["WRONG-trust-regression", "QUALITY_TYPED_ID"],
  [`TRUSTREG-${"x".repeat(120)}`, "CONTRACT_ID"],
]) assertTypedIdRejected("trust_regressions", id, code);
for (const [id, code] of [
  ["UNPLANNED-trailing.", "CONTRACT_ID"],
  ["WRONG-unplanned-item", "QUALITY_TYPED_ID"],
  [`UNPLANNED-${"x".repeat(119)}`, "CONTRACT_ID"],
]) assertTypedIdRejected("unplanned_items", id, code);
const maxLengthTrustIdEvidence = evidenceWithTypedId("trust_regressions", `TRUSTREG-${"x".repeat(119)}`);
assert.equal(validatePostEditArchitectureEvidence(maxLengthTrustIdEvidence), maxLengthTrustIdEvidence);
const maxLengthUnplannedIdEvidence = evidenceWithTypedId("unplanned_items", `UNPLANNED-${"x".repeat(118)}`);
assert.equal(validatePostEditArchitectureEvidence(maxLengthUnplannedIdEvidence), maxLengthUnplannedIdEvidence);
const trustInvalidationTamper = JSON.parse(JSON.stringify(confidenceRegression.result));
trustInvalidationTamper.invalidates_context_decision = false;
delete trustInvalidationTamper.fingerprint;
trustInvalidationTamper.fingerprint = fingerprint(trustInvalidationTamper);
assert.throws(
  () => validateContextReconciliation(trustInvalidationTamper),
  (error) => error?.code === "CONTEXT_RECONCILIATION_INVALIDATION",
);

assertTrustRegression("coverage-regression", (input) => {
  input.nodes.find((entry) => entry.id === "NODE-service").coverage = "partial";
  input.coverage.completeness = "partial";
}, "coverage_regression");

const evaluatorLossRegression = assertTrustRegression("evaluator-loss", (input) => {
  input.coverage.available_evaluator_ids = input.coverage.available_evaluator_ids
    .filter((entry) => entry !== "context-test-graph");
  input.coverage.unavailable_evaluator_ids = ["context-test-graph"];
}, "coverage_regression");
assert.ok(evaluatorLossRegression.evidence.graph_delta.trust_regressions.some(
  (entry) => entry.subject === "evaluator context-test-graph"
    && entry.before === "availability:available"
    && entry.after === "availability:unavailable",
));

assertTrustRegression("new-unknown", (input) => {
  input.unknowns.push({
    id: "GRAPHUNKNOWN-new-final",
    statement: "A newly reachable consumer has not been resolved.",
    scope_ids: ["NODE-service"],
    impact: "The final blast radius may omit a caller.",
    resolution_plan: "Inspect the caller graph before attestation.",
    owner: "runner",
    blocking: true,
    evidence_refs: [{ kind: "file", value: "lib/context-service.mjs" }],
  });
  input.coverage.completeness = "partial";
  const boundary = input.coverage.boundaries.find((entry) => entry.category === "relevant_unknown_paths");
  boundary.classification = "represented";
  boundary.unknown_ids = ["GRAPHUNKNOWN-new-final"];
  boundary.rationale = null;
}, "unknown_added");

const UNKNOWN_COLLISION_STATEMENT = "A shared unresolved caller remains outside the bounded graph.";
const UNKNOWN_COLLISION_IMPACT = "The final blast radius may omit the shared caller.";
function addCollisionUnknown(input, { id, impact = UNKNOWN_COLLISION_IMPACT, blocking = false }) {
  input.unknowns.push({
    id,
    statement: UNKNOWN_COLLISION_STATEMENT,
    scope_ids: ["NODE-service"],
    impact,
    resolution_plan: `Resolve ${id} before attestation.`,
    owner: "runner",
    blocking,
    evidence_refs: [{ kind: "file", value: "lib/context-service.mjs" }],
  });
  input.coverage.completeness = "partial";
  const boundary = input.coverage.boundaries.find((entry) => entry.category === "relevant_unknown_paths");
  boundary.classification = "represented";
  boundary.unknown_ids.push(id);
  boundary.rationale = null;
}

const unknownCollisionPlannedGraph = finalImpactGraph("unknown-collision-planned");
const unknownCollisionFinalGraph = derivedImpactGraph(
  unknownCollisionPlannedGraph,
  "GRAPH-context-final-unknown-collision-final",
  (input) => {
    addCollisionUnknown(input, { id: "GRAPHUNKNOWN-collision-impact-a" });
    addCollisionUnknown(input, {
      id: "GRAPHUNKNOWN-collision-impact-b",
      impact: "A distinct downstream state transition may be omitted.",
    });
  },
);
const unknownCollisionDelta = derivePostEditArchitectureGraphDelta({
  planned_graph: unknownCollisionPlannedGraph,
  final_graph: unknownCollisionFinalGraph,
});
const unknownCollisionRegressions = unknownCollisionDelta.trust_regressions
  .filter((entry) => entry.kind === "unknown_added");
assert.equal(unknownCollisionRegressions.length, 2);
assert.equal(new Set(unknownCollisionRegressions.map((entry) => entry.id)).size, 2);
assert.ok(unknownCollisionRegressions.every((entry) => entry.before === "absent" && entry.after === "count:1"));
const unknownCollisionUnplannedItems = unknownCollisionDelta.unplanned_items
  .filter((entry) => entry.kind === "unknown" && entry.description.includes(UNKNOWN_COLLISION_STATEMENT));
assert.equal(unknownCollisionUnplannedItems.length, 2);
assert.equal(new Set(unknownCollisionUnplannedItems.map((entry) => entry.id)).size, 2);

const blockingUnknownPlannedGraph = finalImpactGraph("blocking-unknown-planned", (input) => {
  addCollisionUnknown(input, { id: "GRAPHUNKNOWN-blocking-transition", blocking: false });
});
const blockingUnknownFinalGraph = derivedImpactGraph(
  blockingUnknownPlannedGraph,
  "GRAPH-context-final-blocking-unknown-final",
  (input) => {
    input.unknowns.find((entry) => entry.id === "GRAPHUNKNOWN-blocking-transition").blocking = true;
  },
);
const blockingUnknownDelta = derivePostEditArchitectureGraphDelta({
  planned_graph: blockingUnknownPlannedGraph,
  final_graph: blockingUnknownFinalGraph,
});
assert.ok(blockingUnknownDelta.trust_regressions.some(
  (entry) => entry.kind === "unknown_added"
    && entry.before === "blocking:false"
    && entry.after === "blocking:true",
));

assertTrustRegression("new-exclusion", (input) => {
  input.excluded_siblings.push({
    id: "EXCLUDED-new-final",
    path: "lib/context-new-sibling.mjs",
    reason: "The final extractor excluded a newly discovered sibling.",
    confidence: "observed",
    evidence_refs: [{ kind: "file", value: "lib/context-new-sibling.mjs" }],
  });
  const boundary = input.coverage.boundaries.find((entry) => entry.category === "excluded_sibling_paths");
  boundary.excluded_sibling_ids.push("EXCLUDED-new-final");
}, "exclusion_added");

const EXCLUSION_COLLISION_PATH = "docs/collision-regression.md";
const exclusionCollisionFinalGraph = finalImpactGraph("exclusion-collision", (input) => {
  input.excluded_siblings.push({
    id: "EXCLUDED-collision-reason-a",
    path: EXCLUSION_COLLISION_PATH,
    reason: "the generated document does not execute the runtime path",
    confidence: "observed",
    evidence_refs: [{ kind: "file", value: EXCLUSION_COLLISION_PATH }],
  });
  input.excluded_siblings.push({
    id: "EXCLUDED-collision-reason-b",
    path: EXCLUSION_COLLISION_PATH,
    reason: "the generated document is outside the selected product boundary",
    confidence: "observed",
    evidence_refs: [{ kind: "file", value: EXCLUSION_COLLISION_PATH }],
  });
  const boundary = input.coverage.boundaries.find((entry) => entry.category === "excluded_sibling_paths");
  boundary.excluded_sibling_ids.push("EXCLUDED-collision-reason-a", "EXCLUDED-collision-reason-b");
});
const exclusionCollisionDelta = derivePostEditArchitectureGraphDelta({
  planned_graph: dossier.impact_graph,
  final_graph: exclusionCollisionFinalGraph,
});
const exclusionCollisionRegressions = exclusionCollisionDelta.trust_regressions
  .filter((entry) => entry.kind === "exclusion_added");
assert.equal(exclusionCollisionRegressions.length, 2);
assert.equal(new Set(exclusionCollisionRegressions.map((entry) => entry.id)).size, 2);
assert.ok(exclusionCollisionRegressions.every((entry) => entry.before === "absent" && entry.after === "count:1"));
const exclusionCollisionUnplannedItems = exclusionCollisionDelta.unplanned_items
  .filter((entry) => entry.kind === "exclusion" && entry.path === EXCLUSION_COLLISION_PATH);
assert.equal(exclusionCollisionUnplannedItems.length, 2);
assert.equal(new Set(exclusionCollisionUnplannedItems.map((entry) => entry.id)).size, 2);

const exclusionConfidenceRegression = assertTrustRegression("exclusion-confidence-regression", (input) => {
  input.excluded_siblings.find((entry) => entry.id === "EXCLUDED-docs").confidence = "inferred";
}, "confidence_regression");
assert.ok(exclusionConfidenceRegression.evidence.graph_delta.trust_regressions.some(
  (entry) => entry.subject === "excluded sibling docs/harness-map.md"
    && entry.before === "confidence:observed"
    && entry.after === "confidence:inferred",
));

assertTrustRegression("boundary-loss", (input) => {
  const boundary = input.coverage.boundaries.find((entry) => entry.category === "direct_affected_paths");
  boundary.classification = "reasoned_excluded";
  boundary.node_ids = [];
  boundary.edge_ids = [];
  boundary.path_ids = [];
  boundary.unknown_ids = [];
  boundary.excluded_sibling_ids = [];
  boundary.rationale = "The final extractor no longer represents the direct path.";
}, "boundary_loss");

assertTrustRegression("critical-downgrade", (input) => {
  input.affected_paths.find((entry) => entry.id === "BLAST-direct").critical = false;
}, "critical_path_downgrade");

const semanticToolPlannedGraph = finalImpactGraph("semantic-tool-planned", (input) => {
  input.coverage.semantic_tool_status = "available";
  input.coverage.semantic_tools = ["context-related", "context-symbol-index"];
  input.coverage.fallback_tools = [];
  input.coverage.reduced_semantic_coverage = false;
});
const semanticToolFinalGraph = derivedImpactGraph(
  semanticToolPlannedGraph,
  "GRAPH-context-final-semantic-tool-loss",
  (input) => {
    input.coverage.semantic_tools = ["context-symbol-index"];
  },
);
const semanticToolDelta = derivePostEditArchitectureGraphDelta({
  planned_graph: semanticToolPlannedGraph,
  final_graph: semanticToolFinalGraph,
});
assert.ok(semanticToolDelta.trust_regressions.some(
  (entry) => entry.kind === "coverage_regression"
    && entry.subject === "semantic tool context-related"
    && entry.before === "availability:available"
    && entry.after === "availability:absent",
));

const fallbackToolLossRegression = assertTrustRegression("fallback-tool-loss", (input) => {
  input.coverage.fallback_tools = ["context_search"];
}, "coverage_regression");
assert.ok(fallbackToolLossRegression.evidence.graph_delta.trust_regressions.some(
  (entry) => entry.subject === "fallback tool context_read"
    && entry.before === "availability:available"
    && entry.after === "availability:absent",
));

const fallbackToolAdditionGraph = finalImpactGraph("fallback-tool-addition", (input) => {
  input.coverage.fallback_tools.push("bounded_literal_search");
});
const fallbackToolAdditionEvidence = postArchitectureEvidence(fallbackToolAdditionGraph);
assert.deepEqual(fallbackToolAdditionEvidence.graph_delta.trust_regressions, []);
assert.equal(reconcile({
  evidenceMode: "extractor_grounded",
  postArchitectureEvidence: fallbackToolAdditionEvidence,
}).status, "passed");

const standardLitePlannedGraph = finalImpactGraph("standard-lite-planned", (input) => {
  input.risk_class = "standard-lite";
});
const standardLiteFinalGraph = derivedImpactGraph(
  standardLitePlannedGraph,
  "GRAPH-context-final-standard-lite-boundary-loss",
  (input) => {
    input.coverage.boundaries = input.coverage.boundaries
      .filter((entry) => entry.category !== "cross_boundary_contracts");
  },
);
const standardLiteBoundaryDelta = derivePostEditArchitectureGraphDelta({
  planned_graph: standardLitePlannedGraph,
  final_graph: standardLiteFinalGraph,
});
assert.ok(standardLiteBoundaryDelta.trust_regressions.some(
  (entry) => entry.kind === "boundary_loss"
    && entry.subject === "coverage boundary cross_boundary_contracts"
    && entry.before === "classification:represented"
    && entry.after === "classification:missing",
));

const improvedCoverageGraph = finalImpactGraph("coverage-improvement", (input) => {
  input.coverage.completeness = "complete";
  input.coverage.semantic_tool_status = "available";
  input.coverage.semantic_tools = ["context-symbol-index"];
  input.coverage.reduced_semantic_coverage = false;
  input.coverage.available_evaluator_ids.push("context-test-improvement");
});
const improvedCoverageEvidence = postArchitectureEvidence(improvedCoverageGraph);
assert.deepEqual(improvedCoverageEvidence.graph_delta.trust_regressions, []);
assert.equal(reconcile({
  evidenceMode: "extractor_grounded",
  postArchitectureEvidence: improvedCoverageEvidence,
}).status, "passed");

const legacyEvidence = JSON.parse(JSON.stringify(identicalEvidence));
legacyEvidence.schema_version = 1;
legacyEvidence.producer = "opencode-harness/post-edit-architecture-v1";
delete legacyEvidence.planned_graph_fingerprint;
delete legacyEvidence.graph_delta;
delete legacyEvidence.fingerprint;
legacyEvidence.fingerprint = fingerprint(legacyEvidence);
validatePostEditArchitectureEvidence(legacyEvidence);
const legacyResult = reconcile({
  evidenceMode: "extractor_grounded",
  postArchitectureEvidence: legacyEvidence,
});
hasCode(legacyResult, "CONTEXT_RECONCILIATION_GRAPH_DELTA_MISSING");
assert.equal(legacyResult.graph_completeness, "incomplete");

const historicalV2Evidence = JSON.parse(JSON.stringify(identicalEvidence));
historicalV2Evidence.schema_version = 2;
historicalV2Evidence.producer = "opencode-harness/post-edit-architecture-v2";
historicalV2Evidence.graph_delta.schema_version = 1;
delete historicalV2Evidence.graph_delta.trust_regressions;
delete historicalV2Evidence.graph_delta.counts.trust_regressions;
delete historicalV2Evidence.graph_delta.fingerprint;
historicalV2Evidence.graph_delta.fingerprint = fingerprint(historicalV2Evidence.graph_delta);
delete historicalV2Evidence.fingerprint;
historicalV2Evidence.fingerprint = fingerprint(historicalV2Evidence);
validatePostEditArchitectureEvidence(historicalV2Evidence);
const historicalChangeGraph = finalImpactGraph("historical-empty-suffix", (input) => {
  input.nodes.push({
    id: "NODE-historical-change",
    kind: "module",
    path: "lib/historical-change.mjs",
    symbol: null,
    label: "historical compatibility change",
    boundary: "module",
    confidence: "observed",
    coverage: "complete",
    evidence_refs: [{ kind: "file", value: "lib/historical-change.mjs" }],
  });
});
const historicalEmptySuffixEvidence = JSON.parse(JSON.stringify(postArchitectureEvidence(historicalChangeGraph)));
historicalEmptySuffixEvidence.schema_version = 2;
historicalEmptySuffixEvidence.producer = "opencode-harness/post-edit-architecture-v2";
historicalEmptySuffixEvidence.graph_delta.schema_version = 1;
delete historicalEmptySuffixEvidence.graph_delta.trust_regressions;
delete historicalEmptySuffixEvidence.graph_delta.counts.trust_regressions;
historicalEmptySuffixEvidence.graph_delta.unplanned_items[0].id = "UNPLANNED-";
refingerprintPostArchitectureEvidence(historicalEmptySuffixEvidence);
assert.equal(validatePostEditArchitectureEvidence(historicalEmptySuffixEvidence), historicalEmptySuffixEvidence);
assert.throws(
  () => validatePostEditArchitectureEvidence(evidenceWithTypedId("unplanned_items", "UNPLANNED-")),
  (error) => error?.code === "QUALITY_TYPED_ID",
);
const historicalV2Result = reconcile({
  evidenceMode: "extractor_grounded",
  postArchitectureEvidence: historicalV2Evidence,
});
hasCode(historicalV2Result, "CONTEXT_RECONCILIATION_GRAPH_DELTA_MISSING");
assert.equal(historicalV2Result.graph_completeness, "incomplete");

const historicalV2WithV2Delta = JSON.parse(JSON.stringify(historicalV2Evidence));
historicalV2WithV2Delta.graph_delta = identicalEvidence.graph_delta;
delete historicalV2WithV2Delta.fingerprint;
historicalV2WithV2Delta.fingerprint = fingerprint(historicalV2WithV2Delta);
assert.throws(
  () => validatePostEditArchitectureEvidence(historicalV2WithV2Delta),
  (error) => error?.code === "QUALITY_POST_ARCHITECTURE_DELTA_SCHEMA",
);

const staleExtractorResult = reconcile({
  evidenceMode: "extractor_grounded",
  postArchitectureEvidence: postArchitectureEvidence(identicalFinalGraph, {
    workspaceFingerprint: fingerprint({ workspace: "stale-extractor" }),
    evidenceId: "post-stale-extractor",
  }),
});
hasCode(staleExtractorResult, "CONTEXT_RECONCILIATION_EXTRACTOR_EVIDENCE_MISSING");
assert.equal(staleExtractorResult.graph_completeness, "incomplete");

const publicContractGraph = finalImpactGraph("public-contract", (input) => {
  input.nodes.push({
    id: "NODE-new-public-contract",
    kind: "contract",
    path: "lib/new-public-contract.mjs",
    symbol: "NewContract",
    label: "new public contract",
    boundary: "entry_point",
    confidence: "observed",
    coverage: "complete",
    evidence_refs: [{ kind: "file", value: "lib/new-public-contract.mjs" }],
  });
});
const publicContractResult = reconcile({
  evidenceMode: "extractor_grounded",
  postArchitectureEvidence: postArchitectureEvidence(publicContractGraph),
});
hasCode(publicContractResult, "CONTEXT_RECONCILIATION_UNEXPECTED_PUBLIC_CONTRACT");
hasCode(publicContractResult, "CONTEXT_RECONCILIATION_UNPLANNED_HIGH_IMPACT");
hasCode(publicContractResult, "CONTEXT_RECONCILIATION_EXTRACTOR_FACT_MISMATCH");
assert.ok(publicContractResult.unexpected_public_contracts.some((entry) => entry.includes("new-public-contract")));

const dependencyGraph = finalImpactGraph("dependency", (input) => {
  input.edges.push({
    id: "EDGE-reversed-dependency",
    from: "NODE-service",
    to: "NODE-entry",
    relationship: "imports",
    confidence: "observed",
    coverage: "complete",
    evidence_refs: [{ kind: "file", value: "lib/context-service.mjs" }],
  });
});
const dependencyResult = reconcile({
  evidenceMode: "extractor_grounded",
  postArchitectureEvidence: postArchitectureEvidence(dependencyGraph),
});
hasCode(dependencyResult, "CONTEXT_RECONCILIATION_UNEXPECTED_DEPENDENCY");
hasCode(dependencyResult, "CONTEXT_RECONCILIATION_UNPLANNED_HIGH_IMPACT");
const tamperedDependencyEvidence = JSON.parse(JSON.stringify(postArchitectureEvidence(dependencyGraph, {
  evidenceId: "post-tampered-dependency",
})));
tamperedDependencyEvidence.graph_delta.added_edges = [];
delete tamperedDependencyEvidence.graph_delta.fingerprint;
tamperedDependencyEvidence.graph_delta.fingerprint = fingerprint(tamperedDependencyEvidence.graph_delta);
delete tamperedDependencyEvidence.fingerprint;
tamperedDependencyEvidence.fingerprint = fingerprint(tamperedDependencyEvidence);
assert.throws(
  () => validatePostEditArchitectureEvidence(tamperedDependencyEvidence),
  (error) => error?.code === "QUALITY_POST_ARCHITECTURE_DELTA_COUNT",
);

const sideEffectGraph = finalImpactGraph("side-effect", (input) => {
  input.nodes.push({
    id: "NODE-new-cache",
    kind: "cache",
    path: "lib/context-cache.mjs",
    symbol: "invalidate",
    label: "new cache",
    boundary: "persistence",
    confidence: "observed",
    coverage: "complete",
    evidence_refs: [{ kind: "file", value: "lib/context-cache.mjs" }],
  });
  input.edges.push({
    id: "EDGE-service-cache",
    from: "NODE-service",
    to: "NODE-new-cache",
    relationship: "invalidates",
    confidence: "observed",
    coverage: "complete",
    evidence_refs: [{ kind: "file", value: "lib/context-service.mjs" }],
  });
  input.affected_paths.push({
    id: "BLAST-new-cache",
    kind: "direct",
    node_ids: ["NODE-service", "NODE-new-cache"],
    edge_ids: ["EDGE-service-cache"],
    critical: true,
    verification_node_ids: ["NODE-test"],
    confidence: "observed",
    evidence_refs: [{ kind: "file", value: "lib/context-service.mjs" }],
  });
});
const sideEffectResult = reconcile({
  evidenceMode: "extractor_grounded",
  postArchitectureEvidence: postArchitectureEvidence(sideEffectGraph),
});
hasCode(sideEffectResult, "CONTEXT_RECONCILIATION_UNEXPECTED_SIDE_EFFECT");
hasCode(sideEffectResult, "CONTEXT_RECONCILIATION_UNPLANNED_HIGH_IMPACT");

for (const variant of [
  { label: "persistence", kind: "data_store", boundary: "persistence", relationship: "persists" },
  { label: "event", kind: "event_producer", boundary: "module", relationship: "emits" },
  { label: "external", kind: "external_dependency", boundary: "external", relationship: "calls" },
  { label: "lifecycle", kind: "background_job", boundary: "operational", relationship: "schedules" },
]) {
  const graph = finalImpactGraph(variant.label, (input) => {
    input.nodes.push({
      id: `NODE-new-${variant.label}`,
      kind: variant.kind,
      path: `lib/context-${variant.label}.mjs`,
      symbol: "run",
      label: `new ${variant.label}`,
      boundary: variant.boundary,
      confidence: "observed",
      coverage: "complete",
      evidence_refs: [{ kind: "file", value: `lib/context-${variant.label}.mjs` }],
    });
    input.edges.push({
      id: `EDGE-service-${variant.label}`,
      from: "NODE-service",
      to: `NODE-new-${variant.label}`,
      relationship: variant.relationship,
      confidence: "observed",
      coverage: "complete",
      evidence_refs: [{ kind: "file", value: "lib/context-service.mjs" }],
    });
  });
  hasCode(reconcile({
    evidenceMode: "extractor_grounded",
    postArchitectureEvidence: postArchitectureEvidence(graph),
  }), "CONTEXT_RECONCILIATION_UNEXPECTED_SIDE_EFFECT");
}

const oversizedDeltaGraph = finalImpactGraph("oversized-delta", (input) => {
  for (let index = 0; index < 129; index += 1) {
    input.nodes.push({
      id: `NODE-overflow-${index}`,
      kind: "module",
      path: `lib/overflow-${index}.mjs`,
      symbol: null,
      label: `overflow ${index}`,
      boundary: "module",
      confidence: "observed",
      coverage: "complete",
      evidence_refs: [{ kind: "file", value: `lib/overflow-${index}.mjs` }],
    });
  }
});
const oversizedDeltaResult = reconcile({
  evidenceMode: "extractor_grounded",
  postArchitectureEvidence: postArchitectureEvidence(oversizedDeltaGraph),
});
hasCode(oversizedDeltaResult, "CONTEXT_RECONCILIATION_GRAPH_DELTA_TRUNCATED");
assert.equal(oversizedDeltaResult.graph_completeness, "incomplete");
assert.equal(oversizedDeltaResult.invalidates_context_decision, true);

const oversizedTrustPlannedGraph = finalImpactGraph("oversized-trust-planned", (input) => {
  for (let index = 0; index < 129; index += 1) {
    input.nodes.push({
      id: `NODE-trust-${index}`,
      kind: "module",
      path: `lib/trust-${index}.mjs`,
      symbol: null,
      label: `trust ${index}`,
      boundary: "module",
      confidence: "observed",
      coverage: "complete",
      evidence_refs: [{ kind: "file", value: `lib/trust-${index}.mjs` }],
    });
  }
});
const oversizedTrustFinalInput = JSON.parse(JSON.stringify(engineeringImpactGraphFingerprintInput(oversizedTrustPlannedGraph)));
delete oversizedTrustFinalInput.schema_version;
oversizedTrustFinalInput.graph_id = "GRAPH-context-final-oversized-trust-final";
for (const node of oversizedTrustFinalInput.nodes.filter((entry) => entry.id.startsWith("NODE-trust-"))) node.coverage = "partial";
oversizedTrustFinalInput.coverage.completeness = "partial";
const oversizedTrustDelta = derivePostEditArchitectureGraphDelta({
  planned_graph: oversizedTrustPlannedGraph,
  final_graph: buildEngineeringImpactGraph(oversizedTrustFinalInput),
});
assert.equal(oversizedTrustDelta.truncated, true);
assert.equal(oversizedTrustDelta.trust_regressions.length, 128);
assert.equal(oversizedTrustDelta.counts.trust_regressions, 130);
assert.equal(oversizedTrustDelta.unplanned_items.length, 128);

const missingTestEdgeGraph = finalImpactGraph("missing-test-edge", (input) => {
  input.edges = input.edges.filter((entry) => entry.id !== "EDGE-test-service");
});
const missingTestEdgeResult = reconcile({
  evidenceMode: "extractor_grounded",
  postArchitectureEvidence: postArchitectureEvidence(missingTestEdgeGraph),
});
hasCode(missingTestEdgeResult, "CONTEXT_RECONCILIATION_UNPLANNED_HIGH_IMPACT");
assert.ok(missingTestEdgeResult.unplanned_items.some((entry) => entry.description.includes("verifies")));

const fabricatedCallerFacts = reconcile({
  evidenceMode: "extractor_grounded",
  postArchitectureEvidence: identicalEvidence,
  publicContracts: ["caller-invented-contract"],
});
hasCode(fabricatedCallerFacts, "CONTEXT_RECONCILIATION_EXTRACTOR_FACT_MISMATCH");
assert.deepEqual(fabricatedCallerFacts.unexpected_public_contracts, []);

assert.throws(
  () => assertContextReconciliationCurrent(unplannedResult, { context_decision: decision, final_workspace_fingerprint: FINAL_WORKSPACE }),
  (error) => error?.code === "CONTEXT_RECONCILIATION_REQUIRED",
);

console.log("Context reconciliation verification passed (v3 authoritative graph delta, directional trust regressions, verified test obligations, reviewer fallback, and high-impact invalidation).");
