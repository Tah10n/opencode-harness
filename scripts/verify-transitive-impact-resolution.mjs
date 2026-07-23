import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  beginContextReceiptOperation,
  completeContextReceiptOperation,
} from "../lib/quality/context-receipts.mjs";
import { selectMinimumContextStrategy } from "../lib/quality/context-strategies.mjs";
import {
  createContextReceiptEvidenceIndex,
  validateContextReceiptEvidenceIndex,
} from "../lib/quality/context-sufficiency.mjs";
import { deriveContextFileCoverage } from "../lib/quality/context-file-coverage.mjs";
import { CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION } from "../lib/quality/context-tool-adapters.mjs";
import {
  deriveTransitiveImpactMetrics,
  evaluateTransitiveImpactResolution,
} from "../lib/quality/transitive-impact-resolution.mjs";
import {
  createWholeSystemContextReportDraft,
  finalizeWholeSystemContextReport,
} from "../lib/quality/whole-system-context-report.mjs";
import { ContractError, fingerprint } from "../lib/quality/validation.mjs";
import {
  completeContextContent,
  CONTEXT_TEST_FINAL_TIME,
  CONTEXT_TEST_SESSION_KEY,
  CONTEXT_TEST_TIME,
  CONTEXT_TEST_WORKSPACE,
  contextTestDossier,
  contextTestReceipt,
} from "./context-test-fixtures.mjs";
import {
  LARGE_CONTEXT_RELATIVE_PATH,
  createLargeContextFileFixture,
  createLargeContextRangeReceipt,
} from "./context-large-file-fixture.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function completeCoverageTruncation() {
  return Object.fromEntries([
    "inventoryLimitReached", "resultLimitReached", "matchLimitReached", "byteLimitReached",
    "lineLimitReached", "durationLimitReached", "excerptTruncated", "contextBeforeTruncated",
    "contextAfterTruncated", "symbolLimitReached", "relationshipLimitReached", "snapshotChanged",
    "coveragePartial",
  ].map((key) => [key, false]));
}

function contextMapInventoryReceipt({ dossier, strategy, previousReceiptFingerprint, paths }) {
  const salt = "transitive-impact-map-only-verifier-salt";
  const pending = beginContextReceiptOperation({
    receipt_id: "CTXRECEIPT-001",
    sequence: 2,
    previous_receipt_fingerprint: previousReceiptFingerprint,
    session_key: CONTEXT_TEST_SESSION_KEY,
    parent_session_key: null,
    producer_session_key: CONTEXT_TEST_SESSION_KEY,
    producer_role: "runner",
    run_id: dossier.run_id,
    task_id: dossier.task_id,
    worktree_fingerprint: CONTEXT_TEST_WORKSPACE,
    source_fingerprint: CONTEXT_TEST_WORKSPACE,
    context_strategy_id: strategy.strategy_id,
    context_strategy_fingerprint: strategy.fingerprint,
    parent_question_id: null,
    evidence_refs: paths.map((value) => ({ kind: "file", value })),
    mutation_revision_started: 0,
    tool_id: "context_map",
    call_key_fingerprint: fingerprint({ purpose: "map-only-transitive-exclusion" }),
    started_at: "2026-07-17T10:03:00.000Z",
    args: { path: ".", includeSymbols: true },
    fingerprint_salt: salt,
  });
  const output = JSON.stringify({
    schemaVersion: CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION,
    tool: "context_map",
    worktree: ".",
    scope: { path: ".", filters: {} },
    snapshot: {
      fingerprint: "a".repeat(64),
      fingerprintKind: "metadata",
      fingerprintScope: ".",
      complete: true,
      stable: true,
      changedDuringOperation: false,
      truncationReasons: [],
    },
    coverage: {
      candidateFiles: paths.length,
      scannedFiles: paths.length,
      bytesScanned: paths.length * 32,
      skippedSecret: 0,
      skippedGenerated: 0,
      skippedLarge: 0,
      skippedUnreadable: 0,
      unsupportedLanguages: {},
      truncation: completeCoverageTruncation(),
      truncationReasons: [],
      partial: false,
    },
    limits: {},
    usage: { files: paths.length, directories: 1, bytes: paths.length * 32, lines: 0, matches: 0, ranges: 0 },
    truncated: false,
    path: ".",
    guidance: [],
    files: paths.map((path) => ({ path, size: 32, language: "javascript", role: "source" })),
    directories: [],
    languages: { javascript: paths.length },
    roles: { source: paths.length },
    manifests: [],
    ci: [],
    docs: [],
    tests: [],
    symbols: [],
    symbolsCoverage: {},
  });
  return completeContextReceiptOperation(pending, {
    output,
    completed_at: "2026-07-17T10:04:00.000Z",
    mutation_revision_completed: 0,
    fingerprint_salt: salt,
  });
}

function contextRelatedReceipt({
  dossier,
  strategy,
  previousReceiptFingerprint,
  target = "lib/context-service.mjs",
  relatedPath = "docs/harness-map.md",
  relationship = "imported-by",
  confidence = "high",
  duplicate = false,
}) {
  const salt = "transitive-impact-related-verifier-salt";
  const pending = beginContextReceiptOperation({
    receipt_id: "CTXRECEIPT-RELATED",
    sequence: 3,
    previous_receipt_fingerprint: previousReceiptFingerprint,
    session_key: CONTEXT_TEST_SESSION_KEY,
    parent_session_key: null,
    producer_session_key: CONTEXT_TEST_SESSION_KEY,
    producer_role: "runner",
    run_id: dossier.run_id,
    task_id: dossier.task_id,
    worktree_fingerprint: CONTEXT_TEST_WORKSPACE,
    source_fingerprint: CONTEXT_TEST_WORKSPACE,
    context_strategy_id: strategy.strategy_id,
    context_strategy_fingerprint: strategy.fingerprint,
    parent_question_id: null,
    evidence_refs: [target, relatedPath].map((value) => ({ kind: "file", value })),
    mutation_revision_started: 0,
    tool_id: "context_related",
    call_key_fingerprint: fingerprint({ purpose: "transitive-relationship-evidence", target, relatedPath, relationship, confidence }),
    started_at: "2026-07-17T10:04:10.000Z",
    args: { path: target, maxResults: 10, relationshipKinds: [relationship], scopePath: "." },
    fingerprint_salt: salt,
  });
  const output = JSON.stringify({
    schemaVersion: CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION,
    tool: "context_related",
    worktree: ".",
    scope: { path: ".", filters: {} },
    snapshot: {
      fingerprint: "b".repeat(64),
      fingerprintKind: "metadata",
      fingerprintScope: ".",
      complete: true,
      stable: true,
      changedDuringOperation: false,
      truncationReasons: [],
    },
    coverage: {
      candidateFiles: 1,
      scannedFiles: 1,
      bytesScanned: 32,
      skippedSecret: 0,
      skippedGenerated: 0,
      skippedLarge: 0,
      skippedUnreadable: 0,
      unsupportedLanguages: {},
      truncation: completeCoverageTruncation(),
      truncationReasons: [],
      partial: false,
    },
    limits: {},
    usage: { files: 1, directories: 0, bytes: 32, lines: 0, matches: 0, ranges: 0 },
    truncated: false,
    target,
    related: Array.from({ length: duplicate ? 2 : 1 }, () => ({
      path: relatedPath,
      relationship,
      confidence,
      evidence: "runner relationship evidence",
    })),
    directImports: [],
    importedBy: [],
    likelyTests: [],
    sameBasename: [],
    siblings: [],
    semanticCoverage: {},
  });
  return completeContextReceiptOperation(pending, {
    output,
    completed_at: "2026-07-17T10:04:30.000Z",
    mutation_revision_completed: 0,
    fingerprint_salt: salt,
  });
}

function flow(
  transitiveImpact = "represented",
  { contentTool = "context_batch_read", relationshipEvidence = null } = {},
) {
  const dossier = contextTestDossier({ transitiveImpact });
  const strategy = selectMinimumContextStrategy({
    risk_class: dossier.risk_class,
    task_type: dossier.task_type,
  });
  const outline = contextTestReceipt({
    receiptId: "CTXRECEIPT-OUTLINE",
    sequence: 1,
    dossier,
    toolId: "context_outline",
    startedAt: "2026-07-17T10:01:00.000Z",
    completedAt: "2026-07-17T10:02:00.000Z",
  });
  const contentPaths = [
    ...new Set([
      ...dossier.impact_graph.nodes.map((entry) => entry.path),
      ...dossier.impact_graph.excluded_siblings.map((entry) => entry.path),
    ]),
  ];
  const contentRead = contentTool === "context_map"
    ? contextMapInventoryReceipt({ dossier, strategy, previousReceiptFingerprint: outline.fingerprint, paths: contentPaths })
    : contextTestReceipt({
      receiptId: "CTXRECEIPT-001",
      sequence: 2,
      dossier,
      toolId: contentTool,
      previousReceiptFingerprint: outline.fingerprint,
    });
  const receipts = [outline, contentRead];
  if (relationshipEvidence !== null) {
    receipts.push(contextRelatedReceipt({
      dossier,
      strategy,
      previousReceiptFingerprint: contentRead.fingerprint,
      ...relationshipEvidence,
    }));
  }
  const content = completeContextContent({
    strategyBinding: strategy,
    dossier,
    receiptIds: receipts.map((entry) => entry.receipt_id),
    advancedAvailable: [...new Set([contentTool, ...(relationshipEvidence === null ? [] : ["context_related"])])],
  });
  const draft = createWholeSystemContextReportDraft({
    report_id: `CONTEXT-transitive-${transitiveImpact}`,
    session_key: CONTEXT_TEST_SESSION_KEY,
    strategy_binding: strategy,
    workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
    dossier,
    created_at: CONTEXT_TEST_TIME,
    content,
  });
  const report = finalizeWholeSystemContextReport(draft, {
    finalized_at: CONTEXT_TEST_FINAL_TIME,
    strategy_binding: strategy,
    workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
    dossier,
    receipt_index: { receipts },
  });
  const receiptEvidence = createContextReceiptEvidenceIndex({ receipts }, {
    session_key: CONTEXT_TEST_SESSION_KEY,
    run_id: dossier.run_id,
    task_id: dossier.task_id,
    source_fingerprint: CONTEXT_TEST_WORKSPACE,
  });
  return { dossier, report, receiptEvidence, receipts };
}

function largeExcludedFlow(fixture, { complete = true } = {}) {
  const dossier = contextTestDossier({
    transitiveImpact: "excluded",
    excludedSiblingPath: LARGE_CONTEXT_RELATIVE_PATH,
  });
  const strategy = selectMinimumContextStrategy({ risk_class: dossier.risk_class, task_type: dossier.task_type });
  const outline = contextTestReceipt({
    receiptId: "CTXRECEIPT-LARGE-OUTLINE",
    sequence: 1,
    dossier,
    toolId: "context_outline",
    startedAt: "2026-07-17T10:01:00.000Z",
    completedAt: "2026-07-17T10:02:00.000Z",
  });
  const regularPaths = [...new Set(dossier.impact_graph.nodes.map((entry) => entry.path).filter(Boolean))];
  const regularContent = contextTestReceipt({
    receiptId: "CTXRECEIPT-001",
    sequence: 2,
    dossier,
    toolId: "context_batch_read",
    observedPaths: regularPaths,
    previousReceiptFingerprint: outline.fingerprint,
  });
  const definitions = complete
    ? [[1, 500], [501, 1000], [1001, 1200]]
    : [[1, 500], [501, 1000]];
  let previousReceiptFingerprint = regularContent.fingerprint;
  const rangeReceipts = definitions.map(([startLine, endLine], index) => {
    const receipt = createLargeContextRangeReceipt({
      fixture,
      dossier,
      strategy,
      receiptId: `CTXRECEIPT-LARGE-RANGE-${index + 1}`,
      sequence: index + 3,
      previousReceiptFingerprint,
      startLine,
      endLine,
    });
    previousReceiptFingerprint = receipt.fingerprint;
    return receipt;
  });
  const receipts = [outline, regularContent, ...rangeReceipts];
  const content = completeContextContent({
    strategyBinding: strategy,
    dossier,
    receiptIds: receipts.map((entry) => entry.receipt_id),
  });
  const draft = createWholeSystemContextReportDraft({
    report_id: `CONTEXT-large-excluded-${complete ? "complete" : "partial"}`,
    session_key: CONTEXT_TEST_SESSION_KEY,
    strategy_binding: strategy,
    workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
    dossier,
    created_at: CONTEXT_TEST_TIME,
    content,
  });
  const report = finalizeWholeSystemContextReport(draft, {
    finalized_at: "2026-07-17T10:30:00.000Z",
    strategy_binding: strategy,
    workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
    dossier,
    receipt_index: { receipts },
  });
  const receiptEvidence = createContextReceiptEvidenceIndex({ receipts }, {
    session_key: CONTEXT_TEST_SESSION_KEY,
    run_id: dossier.run_id,
    task_id: dossier.task_id,
    source_fingerprint: CONTEXT_TEST_WORKSPACE,
  });
  return { dossier, report, receiptEvidence, receipts };
}

function evaluate(value, options = {}) {
  return evaluateTransitiveImpactResolution({
    impact_graph: value.dossier.impact_graph,
    context_report: value.report,
    receipt_evidence_index: value.receiptEvidence,
    ...options,
  });
}

function expectUnresolved(value, code, options = {}) {
  const result = evaluate(value, options);
  assert.equal(result.resolution, "unresolved");
  assert.ok(result.reasons.some((entry) => entry.code === code), JSON.stringify(result.reasons));
  return result;
}

function transitiveWide(report) {
  return report.wide_analysis.find((entry) => entry.category === "transitive_consumers_side_effects");
}

function withSemanticImportEdge(value) {
  const result = clone(value);
  const edge = result.dossier.impact_graph.edges.find((entry) => entry.id === "EDGE-service-store");
  edge.relationship = "imports";
  const graphSource = clone(result.dossier.impact_graph);
  delete graphSource.fingerprint;
  result.dossier.impact_graph.fingerprint = fingerprint(graphSource);
  result.report.impact_graph_fingerprint = result.dossier.impact_graph.fingerprint;
  return result;
}

const representedFlow = flow("represented");
validateContextReceiptEvidenceIndex(representedFlow.receiptEvidence);
assert.equal(representedFlow.receiptEvidence.schema_version, 4);
assert.ok(representedFlow.receiptEvidence.receipts.every((entry) => Array.isArray(entry.relationships)));
const represented = evaluate(representedFlow);
assert.equal(represented.resolution, "represented");
assert.deepEqual(represented.represented_transitive_path_ids, ["BLAST-transitive"]);
assert.deepEqual(deriveTransitiveImpactMetrics(represented), {
  transitive_impact_resolution: "represented",
  represented_transitive_path_count: 1,
  evidence_backed_transitive_exclusion_count: 0,
  contradicted_transitive_exclusion_count: 0,
});

for (const forbiddenKind of ["reasoned_exclusion", "unresolved_hypothesis", "inferred"]) {
  const forbiddenClaim = clone(representedFlow);
  const wide = transitiveWide(forbiddenClaim.report);
  for (const claim of forbiddenClaim.report.claims.filter((entry) => wide.claim_ids.includes(entry.id))) {
    claim.kind = forbiddenKind;
  }
  expectUnresolved(forbiddenClaim, "CONTEXT_TRANSITIVE_PATH_MISSING");
}

const transitivePath = representedFlow.dossier.impact_graph.affected_paths.find((entry) => entry.kind === "transitive");
for (const subjectId of [transitivePath.id, transitivePath.node_ids[0], transitivePath.edge_ids[0]]) {
  const missingWideSubject = clone(representedFlow);
  const wide = transitiveWide(missingWideSubject.report);
  wide.subject_ids = wide.subject_ids.filter((entry) => entry !== subjectId);
  expectUnresolved(missingWideSubject, "CONTEXT_TRANSITIVE_PATH_MISSING");

  const missingClaimSubject = clone(representedFlow);
  const claimWide = transitiveWide(missingClaimSubject.report);
  for (const claim of missingClaimSubject.report.claims.filter((entry) => claimWide.claim_ids.includes(entry.id))) {
    claim.subject_ids = claim.subject_ids.filter((entry) => entry !== subjectId);
  }
  expectUnresolved(missingClaimSubject, "CONTEXT_TRANSITIVE_PATH_MISSING");
}

const splitObservedCoverage = clone(representedFlow);
const splitWide = transitiveWide(splitObservedCoverage.report);
const originalClaim = splitObservedCoverage.report.claims.find((entry) => entry.id === splitWide.claim_ids[0]);
const splitAt = Math.ceil(originalClaim.subject_ids.length / 2);
const secondClaim = {
  ...clone(originalClaim),
  id: "CLAIM-transitive-split",
  subject_ids: originalClaim.subject_ids.slice(splitAt),
};
originalClaim.subject_ids = originalClaim.subject_ids.slice(0, splitAt);
splitObservedCoverage.report.claims.push(secondClaim);
splitWide.claim_ids.push(secondClaim.id);
assert.equal(evaluate(splitObservedCoverage).resolution, "represented");

const semanticImport = withSemanticImportEdge(flow("represented", {
  relationshipEvidence: {
    target: "lib/context-service.mjs",
    relatedPath: "lib/context-store.mjs",
    relationship: "direct-import",
    confidence: "high",
  },
}));
assert.equal(evaluate(semanticImport, { require_semantic_edges: true }).resolution, "represented");
const semanticImportedBy = withSemanticImportEdge(flow("represented", {
  relationshipEvidence: {
    target: "lib/context-store.mjs",
    relatedPath: "lib/context-service.mjs",
    relationship: "imported-by",
    confidence: "high",
  },
}));
assert.equal(evaluate(semanticImportedBy, { require_semantic_edges: true }).resolution, "represented");

const duplicateRelationshipEvidence = flow("represented", {
  relationshipEvidence: {
    target: "lib/context-service.mjs",
    relatedPath: "lib/context-store.mjs",
    relationship: "direct-import",
    confidence: "high",
    duplicate: true,
  },
});
const deduplicatedRelationshipReceipt = duplicateRelationshipEvidence.receiptEvidence.receipts
  .find((entry) => entry.relationships.length > 0);
assert.equal(deduplicatedRelationshipReceipt.relationships.length, 1);
assert.deepEqual(deduplicatedRelationshipReceipt.relationship_paths, ["lib/context-store.mjs"]);
validateContextReceiptEvidenceIndex(duplicateRelationshipEvidence.receiptEvidence);

for (const relationshipEvidence of [
  {
    target: "lib/context-store.mjs",
    relatedPath: "lib/context-service.mjs",
    relationship: "direct-import",
    confidence: "high",
  },
  {
    target: "lib/context-service.mjs",
    relatedPath: "lib/context-store.mjs",
    relationship: "direct-import",
    confidence: "low",
  },
  {
    target: "lib/context-service.mjs",
    relatedPath: "lib/context-store.mjs",
    relationship: "same-basename",
    confidence: "high",
  },
]) {
  expectUnresolved(
    withSemanticImportEdge(flow("represented", { relationshipEvidence })),
    "CONTEXT_TRANSITIVE_PATH_MISSING",
    { require_semantic_edges: true },
  );
}

const legacyIndex = clone(representedFlow.receiptEvidence);
legacyIndex.schema_version = 2;
assert.throws(
  () => validateContextReceiptEvidenceIndex(legacyIndex),
  (error) => error instanceof ContractError && error.code === "CONTEXT_RECEIPT_INDEX_SCHEMA",
);
expectUnresolved({ ...representedFlow, receiptEvidence: legacyIndex }, "CONTEXT_CLAIM_EVIDENCE_MISSING");

const malformedIndex = clone(representedFlow.receiptEvidence);
delete malformedIndex.receipts[0].relationships;
assert.throws(() => validateContextReceiptEvidenceIndex(malformedIndex), (error) => error instanceof ContractError);

const excludedFlow = flow("excluded");
const excluded = evaluate(excludedFlow);
assert.equal(excluded.resolution, "evidence_backed_excluded");
assert.deepEqual(excluded.evidence_backed_exclusion_boundary_ids, ["BOUNDARY-transitive_affected_paths"]);
assert.equal(excluded.represented_transitive_path_ids.length, 0);
assert.deepEqual(deriveTransitiveImpactMetrics(excluded), {
  transitive_impact_resolution: "evidence_backed_excluded",
  represented_transitive_path_count: 0,
  evidence_backed_transitive_exclusion_count: 1,
  contradicted_transitive_exclusion_count: 0,
});

const missing = clone(excludedFlow);
const missingBoundary = missing.dossier.impact_graph.coverage.boundaries.find(
  (entry) => entry.category === "transitive_affected_paths",
);
missingBoundary.classification = "represented";
missingBoundary.rationale = null;
expectUnresolved(missing, "CONTEXT_TRANSITIVE_PATH_MISSING");

const proseOnly = clone(excludedFlow);
proseOnly.dossier.impact_graph.coverage.boundaries.find(
  (entry) => entry.category === "transitive_affected_paths",
).evidence_refs = [{ kind: "file", value: "lib/context-example.mjs" }];
expectUnresolved(proseOnly, "CONTEXT_CLAIM_EVIDENCE_MISSING");

const literalOnly = clone(excludedFlow);
for (const entry of literalOnly.receiptEvidence.receipts) entry.tool_id = "context_search";
expectUnresolved(literalOnly, "CONTEXT_CLAIM_EVIDENCE_MISSING");

const outlinePlusSingleLiteralSearch = flow("excluded", { contentTool: "context_search" });
expectUnresolved(outlinePlusSingleLiteralSearch, "CONTEXT_CLAIM_EVIDENCE_MISSING");

const mapInventoryOnly = flow("excluded", { contentTool: "context_map" });
expectUnresolved(mapInventoryOnly, "CONTEXT_CLAIM_EVIDENCE_MISSING");

const partial = clone(excludedFlow);
partial.receiptEvidence.receipts[1].status = "truncated";
partial.receiptEvidence.receipts[1].coverage.partial = true;
partial.receiptEvidence.receipts[1].coverage.complete = false;
expectUnresolved(partial, "CONTEXT_CLAIM_EVIDENCE_MISSING");

const truncatedRootInventory = clone(excludedFlow);
truncatedRootInventory.receiptEvidence.receipts[0].status = "truncated";
truncatedRootInventory.receiptEvidence.receipts[0].requested_paths = ["."];
truncatedRootInventory.receiptEvidence.receipts[0].coverage.partial = true;
truncatedRootInventory.receiptEvidence.receipts[0].coverage.complete = false;
expectUnresolved(truncatedRootInventory, "CONTEXT_CLAIM_EVIDENCE_MISSING");

const crossWorkspace = clone(excludedFlow);
crossWorkspace.receiptEvidence.source_fingerprint = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
expectUnresolved(crossWorkspace, "CONTEXT_CLAIM_EVIDENCE_MISSING");

const crossSession = clone(excludedFlow);
crossSession.receiptEvidence.session_key = "another-session";
expectUnresolved(crossSession, "CONTEXT_CLAIM_EVIDENCE_MISSING");

const refutedSearch = clone(excludedFlow);
for (const claim of refutedSearch.report.claims) {
  if (claim.kind === "reasoned_exclusion") claim.kind = "observed";
}
refutedSearch.report.questions.push({
  ...refutedSearch.report.questions[0],
  id: "QUESTION-refuted-consumer-search",
  question_key: "all_boundary_consumers",
  status: "refuted",
  actual_observation: "A consumer was discovered outside the claimed boundary.",
});
expectUnresolved(refutedSearch, "CONTEXT_CLAIM_EVIDENCE_MISSING");

const lossyRelationshipMutation = clone(excludedFlow);
lossyRelationshipMutation.receiptEvidence.receipts[1].relationship_paths.push("lib/hidden-consumer.mjs");
assert.equal(evaluate(lossyRelationshipMutation).resolution, "evidence_backed_excluded");
assert.throws(
  () => validateContextReceiptEvidenceIndex(lossyRelationshipMutation.receiptEvidence),
  (error) => error instanceof ContractError && error.code === "CONTEXT_RECEIPT_INDEX_RELATIONSHIP_PATHS",
);

const importedByExcludedSibling = flow("excluded", {
  relationshipEvidence: {
    target: "lib/context-service.mjs",
    relatedPath: "docs/harness-map.md",
    relationship: "imported-by",
  },
});
const contradictedResult = expectUnresolved(
  importedByExcludedSibling,
  "CONTEXT_TRANSITIVE_EXCLUSION_CONTRADICTED",
);
assert.equal(contradictedResult.contradicted_exclusion_subject_ids.length, 1);

const unreferencedRelationship = clone(importedByExcludedSibling);
const unreferencedReceiptId = unreferencedRelationship.receiptEvidence.receipts
  .find((entry) => entry.relationships.length > 0).receipt_id;
unreferencedRelationship.report.receipt_ids = unreferencedRelationship.report.receipt_ids
  .filter((entry) => entry !== unreferencedReceiptId);
for (const wide of unreferencedRelationship.report.wide_analysis) {
  wide.receipt_ids = wide.receipt_ids.filter((entry) => entry !== unreferencedReceiptId);
}
for (const claim of unreferencedRelationship.report.claims) {
  claim.receipt_ids = claim.receipt_ids.filter((entry) => entry !== unreferencedReceiptId);
}
const unreferencedResult = expectUnresolved(
  unreferencedRelationship,
  "CONTEXT_TRANSITIVE_EXCLUSION_CONTRADICTED",
);
assert(unreferencedResult.supporting_receipt_ids.includes(unreferencedReceiptId));

for (const relationshipEvidence of [
  {
    target: "docs/harness-map.md",
    relatedPath: "lib/context-service.mjs",
    relationship: "direct-import",
    confidence: "high",
  },
  {
    target: "lib/context-service.mjs",
    relatedPath: "docs/harness-map.md",
    relationship: "imported-by",
    confidence: "low",
  },
  {
    target: "docs/harness-map.md",
    relatedPath: "lib/context-service.mjs",
    relationship: "direct-import",
    confidence: "low",
  },
  {
    target: "lib/hidden-consumer.mjs",
    relatedPath: "lib/context-service.mjs",
    relationship: "direct-import",
    confidence: "high",
  },
]) {
  expectUnresolved(
    flow("excluded", { relationshipEvidence }),
    "CONTEXT_TRANSITIVE_EXCLUSION_CONTRADICTED",
  );
}

const affectedImportsDependency = flow("excluded", {
  relationshipEvidence: {
    target: "lib/context-service.mjs",
    relatedPath: "docs/harness-map.md",
    relationship: "direct-import",
  },
});
assert.equal(evaluate(affectedImportsDependency).resolution, "evidence_backed_excluded");

for (const relationship of ["likely-test", "same-basename", "sibling"]) {
  const inspectedHeuristic = flow("excluded", {
    relationshipEvidence: {
      target: "lib/context-service.mjs",
      relatedPath: "docs/harness-map.md",
      relationship,
    },
  });
  assert.equal(evaluate(inspectedHeuristic).resolution, "evidence_backed_excluded");
}

const unclassifiedHeuristic = flow("excluded", {
  relationshipEvidence: {
    target: "lib/context-service.mjs",
    relatedPath: "lib/hidden-consumer.mjs",
    relationship: "same-basename",
  },
});
expectUnresolved(unclassifiedHeuristic, "CONTEXT_CLAIM_EVIDENCE_MISSING");

const unreadHeuristic = clone(flow("excluded", {
  relationshipEvidence: {
    target: "lib/context-service.mjs",
    relatedPath: "docs/harness-map.md",
    relationship: "sibling",
  },
}));
const unreadContentReceipt = unreadHeuristic.receiptEvidence.receipts.find(
  (entry) => entry.tool_id === "context_batch_read",
);
unreadContentReceipt.observed_paths = unreadContentReceipt.observed_paths
  .filter((entry) => entry !== "docs/harness-map.md");
unreadContentReceipt.content_ranges = unreadContentReceipt.content_ranges
  .filter((entry) => entry.path !== "docs/harness-map.md");
expectUnresolved(unreadHeuristic, "CONTEXT_CLAIM_EVIDENCE_MISSING");

const truncatedImport = clone(importedByExcludedSibling);
const typedImportReceipt = truncatedImport.receiptEvidence.receipts.find((entry) => entry.relationships.length > 0);
typedImportReceipt.status = "truncated";
typedImportReceipt.coverage.partial = true;
typedImportReceipt.coverage.complete = false;
expectUnresolved(truncatedImport, "CONTEXT_TRANSITIVE_EXCLUSION_CONTRADICTED");

const blocking = clone(excludedFlow);
blocking.dossier.impact_graph.unknowns.push({
  id: "GRAPHUNKNOWN-consumer",
  statement: "An unresolved consumer may call the owning service.",
  scope_ids: ["EXCLUDED-docs"],
  impact: "The transitive boundary may be incomplete.",
  resolution_plan: "Inspect the unresolved relationship before implementation.",
  owner: "orchestrator",
  blocking: true,
  evidence_refs: [],
});
blocking.dossier.impact_graph.coverage.boundaries.find(
  (entry) => entry.category === "transitive_affected_paths",
).unknown_ids.push("GRAPHUNKNOWN-consumer");
expectUnresolved(blocking, "CONTEXT_BLOCKING_UNKNOWN");

const largeFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-transitive-large-"));
try {
  const largeFixture = createLargeContextFileFixture(largeFixtureRoot);
  const largeComplete = largeExcludedFlow(largeFixture);
  validateContextReceiptEvidenceIndex(largeComplete.receiptEvidence);
  const largeCoverage = largeComplete.receiptEvidence.file_coverage.find(
    (entry) => entry.path === LARGE_CONTEXT_RELATIVE_PATH,
  );
  assert.equal(largeCoverage.status, "complete");
  assert.deepEqual(largeCoverage.covered_ranges, [{ start_line: 1, end_line: 1200 }]);
  assert.equal(evaluate(largeComplete).resolution, "evidence_backed_excluded");

  const multiPathGap = clone(largeComplete);
  const secondPath = multiPathGap.dossier.impact_graph.nodes.find((entry) => typeof entry.path === "string").path;
  const regularProjection = multiPathGap.receiptEvidence.receipts.find((entry) => entry.receipt_id === "CTXRECEIPT-001");
  regularProjection.content_ranges = regularProjection.content_ranges.filter((entry) => entry.path !== secondPath);
  regularProjection.observed_paths = regularProjection.observed_paths.filter((entry) => entry !== secondPath);
  const batchProjection = multiPathGap.receiptEvidence.receipts.find((entry) => entry.receipt_id === "CTXRECEIPT-LARGE-RANGE-1");
  batchProjection.tool_id = "context_batch_read";
  batchProjection.observed_paths = [...new Set([...batchProjection.observed_paths, secondPath])].sort();
  batchProjection.content_ranges.push({
    path: secondPath,
    start_line: 1,
    end_line: 1,
    total_lines: 2,
    content_version_fingerprint: `sha256:${"d".repeat(64)}`,
    stable: true,
    changed_during_operation: false,
    range_truncated_before: false,
    range_truncated_after: true,
  });
  multiPathGap.receiptEvidence.file_coverage = deriveContextFileCoverage(multiPathGap.receiptEvidence);
  const multiPathIndexSource = clone(multiPathGap.receiptEvidence);
  delete multiPathIndexSource.fingerprint;
  multiPathGap.receiptEvidence.fingerprint = fingerprint(multiPathIndexSource);
  validateContextReceiptEvidenceIndex(multiPathGap.receiptEvidence);
  assert.equal(
    multiPathGap.receiptEvidence.file_coverage.find((entry) => entry.path === LARGE_CONTEXT_RELATIVE_PATH).status,
    "complete",
  );
  assert.equal(
    multiPathGap.receiptEvidence.file_coverage.find((entry) => entry.path === secondPath).status,
    "incomplete",
  );
  expectUnresolved(multiPathGap, "CONTEXT_CLAIM_EVIDENCE_MISSING");

  const largePartial = largeExcludedFlow(largeFixture, { complete: false });
  const partialCoverage = largePartial.receiptEvidence.file_coverage.find(
    (entry) => entry.path === LARGE_CONTEXT_RELATIVE_PATH,
  );
  assert.equal(partialCoverage.status, "incomplete");
  assert.deepEqual(partialCoverage.gap_ranges, [{ start_line: 1001, end_line: 1200 }]);
  expectUnresolved(largePartial, "CONTEXT_CLAIM_EVIDENCE_MISSING");
} finally {
  fs.rmSync(largeFixtureRoot, { recursive: true, force: true });
}

console.log("Transitive impact resolution verification passed (represented, bounded large-file exclusion, and fail-closed negatives).");
