import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { selectMinimumContextStrategy } from "../lib/quality/context-strategies.mjs";
import {
  contentBackedInspectedPaths,
  createStandardLiteContextSummary,
  evaluateContextSufficiency,
  validateContextSufficiencyDecision,
} from "../lib/quality/context-sufficiency.mjs";
import {
  createWholeSystemContextReportDraft,
  finalizeWholeSystemContextReport,
} from "../lib/quality/whole-system-context-report.mjs";
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
const schema = JSON.parse(fs.readFileSync(path.join(root, "quality/schemas/context-sufficiency-decision.schema.json"), "utf8"));
assert.equal(schema.additionalProperties, false);
assert.equal(schema.properties.schema_version.const, 1);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function refingerprint(value) {
  const copy = clone(value);
  delete copy.fingerprint;
  return { ...copy, fingerprint: fingerprint(copy) };
}

function fullFlow({
  riskClass = "high",
  taskType = "bug_fix",
  transitiveImpact = "represented",
  requestedTaskProfile = null,
  receiptObservedPaths = null,
  receiptToolId = "context_batch_read",
  receiptTruncated = false,
  receiptCompletedAt = undefined,
  mutateContent = null,
} = {}) {
  const dossier = contextTestDossier({ riskClass, taskType, transitiveImpact });
  const strategy = selectMinimumContextStrategy({
    risk_class: riskClass,
    task_type: taskType,
    ...(requestedTaskProfile === null ? {} : { requested_task_profile: requestedTaskProfile }),
  });
  const advancedAvailable = ["context_map", "context_batch_read", "context_symbols", "context_related"].includes(receiptToolId)
    ? [receiptToolId]
    : [];
  const outline = contextTestReceipt({
    receiptId: "CTXRECEIPT-OUTLINE",
    sequence: 1,
    dossier,
    toolId: "context_outline",
    availableToolIds: ["context_outline", "context_files", "context_search", "context_read", ...advancedAvailable],
    startedAt: "2026-07-17T10:01:00.000Z",
    completedAt: "2026-07-17T10:02:00.000Z",
  });
  const receipt = contextTestReceipt({
    receiptId: "CTXRECEIPT-001",
    sequence: 2,
    dossier,
    toolId: receiptToolId,
    availableToolIds: ["context_outline", "context_files", "context_search", "context_read", ...advancedAvailable],
    previousReceiptFingerprint: outline.fingerprint,
    truncated: receiptTruncated,
    ...(receiptCompletedAt === undefined ? {} : { completedAt: receiptCompletedAt }),
    ...(receiptObservedPaths === null ? {} : { observedPaths: receiptObservedPaths }),
  });
  const receipts = [outline, receipt];
  const content = completeContextContent({
    strategyBinding: strategy,
    dossier,
    receiptIds: receipts.map((entry) => entry.receipt_id),
    advancedAvailable,
  });
  if (mutateContent) mutateContent(content, { dossier, strategy, receipt, outline, receipts });
  const draft = createWholeSystemContextReportDraft({
    report_id: `CONTEXT-${riskClass}-${strategy.task_profile}`,
    session_key: receipt.session_key,
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
  const taskProfileEvidence = contextTestTaskProfileEvidence({
    dossier,
    sessionKey: receipt.session_key,
  });
  return { dossier, strategy, receipt, outline, receipts, report, taskProfileEvidence };
}

function reportForReceipts(flow, receipts, reportId) {
  const content = completeContextContent({
    strategyBinding: flow.strategy,
    dossier: flow.dossier,
    receiptIds: receipts.map((entry) => entry.receipt_id),
    minimalAvailable: flow.report.tool_state.minimal_available,
    advancedAvailable: flow.report.tool_state.advanced_available,
    readOnlySubagents: flow.report.budget_state.read_only_subagents_used,
  });
  const draft = createWholeSystemContextReportDraft({
    report_id: reportId,
    session_key: flow.receipt.session_key,
    strategy_binding: flow.strategy,
    workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
    dossier: flow.dossier,
    created_at: CONTEXT_TEST_TIME,
    content,
  });
  return finalizeWholeSystemContextReport(draft, {
    finalized_at: CONTEXT_TEST_FINAL_TIME,
    strategy_binding: flow.strategy,
    workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
    dossier: flow.dossier,
    receipt_index: { receipts },
  });
}

let sequence = 0;
function decide(flow, overrides = {}) {
  sequence += 1;
  return evaluateContextSufficiency({
    decision_id: `CTXDEC-test-${sequence}`,
    session_key: flow.receipt.session_key,
    strategy_binding: flow.strategy,
    dossier: flow.dossier,
    workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
    receipt_index: { receipts: flow.receipts },
    report: flow.report,
    task_profile_evidence: flow.taskProfileEvidence,
    evaluated_at: "2026-07-17T10:06:00.000Z",
    ...overrides,
  });
}

function hasCode(decision, code) {
  assert.ok(decision.reasons.some((entry) => entry.code === code), `expected ${code}; got ${decision.reasons.map((entry) => entry.code).join(", ")}`);
}

const valid = fullFlow();
const sufficient = decide(valid);
validateContextSufficiencyDecision(sufficient);
assert.equal(sufficient.status, "sufficient");
assert.deepEqual(sufficient.reasons, []);

for (const forbiddenKind of ["reasoned_exclusion", "unresolved_hypothesis", "inferred"]) {
  const forbiddenTransitiveClaim = fullFlow({
    mutateContent: (content) => {
      const wide = content.wide_analysis.find((entry) => entry.category === "transitive_consumers_side_effects");
      for (const claim of content.claims.filter((entry) => wide.claim_ids.includes(entry.id))) {
        claim.kind = forbiddenKind;
      }
    },
  });
  hasCode(decide(forbiddenTransitiveClaim), "CONTEXT_TRANSITIVE_PATH_MISSING");
}

const validEvidenceBackedExclusion = fullFlow({ transitiveImpact: "excluded" });
const exclusionDecision = decide(validEvidenceBackedExclusion);
assert.equal(exclusionDecision.status, "sufficient");
assert.deepEqual(exclusionDecision.reasons, []);

const oneReadAllSubjects = fullFlow({ receiptObservedPaths: ["lib/context-example.mjs"] });
const oneReadDecision = decide(oneReadAllSubjects);
hasCode(oneReadDecision, "CONTEXT_CLAIM_EVIDENCE_MISSING");
hasCode(oneReadDecision, "CONTEXT_DIRECT_PATH_MISSING");
hasCode(oneReadDecision, "CONTEXT_TRANSITIVE_PATH_MISSING");

const inventoryOnlyAllSubjects = fullFlow({ receiptToolId: "context_files" });
const inventoryOnlyDecision = decide(inventoryOnlyAllSubjects);
hasCode(inventoryOnlyDecision, "CONTEXT_CLAIM_EVIDENCE_MISSING");
hasCode(inventoryOnlyDecision, "CONTEXT_DIRECT_PATH_MISSING");
hasCode(inventoryOnlyDecision, "CONTEXT_TRANSITIVE_PATH_MISSING");

const omittedTruncation = fullFlow({ receiptTruncated: true });
hasCode(decide(omittedTruncation), "CONTEXT_TRUNCATION_UNRESOLVED");
assert.throws(
  () => fullFlow({ receiptCompletedAt: "2026-07-17T10:05:30.000Z" }),
  (error) => error?.code === "CONTEXT_RECEIPT_AFTER_FINALIZATION",
);

const negativeCases = [
  ["CONTEXT_WIDE_CATEGORY_MISSING", () => fullFlow({ mutateContent: (content) => content.wide_analysis.pop() })],
  ["CONTEXT_DIRECT_PATH_MISSING", () => fullFlow({ mutateContent: (content) => content.claims.forEach((claim) => { claim.subject_ids = claim.subject_ids.filter((id) => id !== "BLAST-direct"); }) })],
  ["CONTEXT_TRANSITIVE_PATH_MISSING", () => fullFlow({ mutateContent: (content) => content.claims.forEach((claim) => { claim.subject_ids = claim.subject_ids.filter((id) => id !== "BLAST-transitive"); }) })],
  ["CONTEXT_CRITICAL_PATH_DEEP_MISSING", () => fullFlow({ mutateContent: (content) => content.deep_analyses.pop() })],
  ["CONTEXT_DEEP_DIMENSION_UNCLASSIFIED", () => fullFlow({ mutateContent: (content) => content.deep_analyses[0].dimensions.pop() })],
  ["CONTEXT_BLOCKING_UNKNOWN", () => fullFlow({ mutateContent: (content) => { content.questions[0].status = "uncertain"; content.questions[0].actual_observation = null; content.questions[0].next_action = "inspect the unresolved alternate path"; } })],
  ["CONTEXT_REFUTED_HYPOTHESIS_UNAPPLIED", () => fullFlow({ mutateContent: (content) => { content.questions[0].status = "refuted"; content.questions[0].actual_observation = "The counterexample reached an unexpected branch."; content.questions[0].applied_update_ids = []; } })],
  ["CONTEXT_TRUNCATION_UNRESOLVED", () => fullFlow({ mutateContent: (content, { receipt }) => content.tool_state.unresolved_truncation_receipt_ids.push(receipt.receipt_id) })],
  ["CONTEXT_SEMANTIC_COMPLETENESS_UNSUPPORTED", () => fullFlow({ mutateContent: (content) => { content.tool_state.semantic_completeness_claimed = true; } })],
  ["CONTEXT_TOOL_AVAILABILITY_UNOBSERVED", () => fullFlow({ mutateContent: (content) => { content.tool_state.advanced_available = ["context_related"]; content.tool_state.advanced_unavailable = content.tool_state.advanced_unavailable.filter((tool) => tool !== "context_related"); } })],
  ["CONTEXT_SIBLING_DISCOVERY_MISSING", () => fullFlow({ mutateContent: (content) => { content.task_evidence.sibling_variant_question_ids = []; } })],
  ["CONTEXT_OWNING_ABSTRACTION_MISSING", () => fullFlow({ mutateContent: (content) => { content.task_evidence.owning_abstraction_claim_id = null; } })],
  ["CONTEXT_CLAIM_EVIDENCE_MISSING", () => fullFlow({ mutateContent: (content) => content.claims.forEach((claim) => { claim.subject_ids = claim.subject_ids.filter((id) => id !== "EXCLUDED-docs"); }) })],
  ["CONTEXT_REPRODUCTION_MISSING", () => fullFlow({ mutateContent: (content) => { content.task_evidence.reproduction_status = "unavailable_material"; content.task_evidence.reproduction_evidence_ids = []; } })],
  ["CONTEXT_VERIFICATION_MAPPING_MISSING", () => fullFlow({ mutateContent: (content) => { content.deep_analyses[0].test_obligation_ids = []; } })],
  ["CONTEXT_CHARACTERIZATION_MISSING", () => fullFlow({ taskType: "behavior_preserving_refactor", mutateContent: (content) => { content.task_evidence.characterization_test_ids = []; } })],
  ["CONTEXT_NEGATIVE_PATH_MISSING", () => fullFlow({ taskType: "new_feature", mutateContent: (content) => { content.task_evidence.negative_path_ids = []; } })],
  ["CONTEXT_COMPATIBILITY_ANALYSIS_MISSING", () => fullFlow({ taskType: "new_feature", mutateContent: (content) => { content.task_evidence.compatibility_ids = []; } })],
  ["CONTEXT_BUDGET_EXHAUSTED", () => fullFlow({ mutateContent: (content) => { content.budget_state.exhausted = true; content.budget_state.unresolved_area = "unresolved external consumer"; } })],
];
for (const [code, build] of negativeCases) hasCode(decide(build()), code);

hasCode(decide(valid, { receipt_index: { receipts: [] } }), "CONTEXT_RECEIPT_UNKNOWN");
hasCode(decide(valid, { receipt_index: { receipts: [{ ...valid.receipt, receipt_id: "forged-receipt" }] } }), "CONTEXT_RECEIPT_UNKNOWN");
hasCode(decide(valid, { receipt_index: { receipts: [{ ...valid.receipt, session_key: "other-session" }] } }), "CONTEXT_RECEIPT_BINDING_INVALID");
hasCode(decide(valid, { receipt_index: { receipts: [{ ...valid.receipt, mutation_revision_started: 1 }] } }), "CONTEXT_RECEIPT_AFTER_MUTATION");
hasCode(decide(valid, { receipt_index: { receipts: [valid.receipt, valid.receipt] } }), "CONTEXT_RECEIPT_DUPLICATE");
hasCode(decide(valid, { workspace_fingerprint: fingerprint({ stale: true }) }), "CONTEXT_EVIDENCE_STALE");
hasCode(decide(valid, { implementation_started_sequence: 2 }), "CONTEXT_FINALIZED_AFTER_MUTATION");
hasCode(decide(valid, { session_key: fingerprint({ donor: "another-session" }).slice("sha256:".length) }), "CONTEXT_RECEIPT_BINDING_INVALID");
hasCode(decide(valid, { task_profile_evidence: null }), "CONTEXT_REPRODUCTION_MISSING");

const omittedBoundReceipt = contextTestReceipt({
  receiptId: "CTXRECEIPT-OMITTED",
  sequence: 3,
  dossier: valid.dossier,
  toolId: "context_read",
  observedPaths: ["lib/context-example.mjs"],
  previousReceiptFingerprint: valid.receipt.fingerprint,
  startedAt: "2026-07-17T10:04:01.000Z",
  completedAt: "2026-07-17T10:04:10.000Z",
});
hasCode(decide(valid, {
  receipt_index: { receipts: [...valid.receipts, omittedBoundReceipt] },
}), "CONTEXT_CLAIM_EVIDENCE_MISSING");

const unclassifiedReceipt = contextTestReceipt({
  receiptId: "CTXRECEIPT-UNCLASSIFIED",
  sequence: 3,
  dossier: valid.dossier,
  toolId: "context_read",
  observedPaths: ["src/unclassified-consumer.mjs"],
  previousReceiptFingerprint: valid.receipt.fingerprint,
  startedAt: "2026-07-17T10:04:01.000Z",
  completedAt: "2026-07-17T10:04:10.000Z",
});
const unclassifiedReceipts = [...valid.receipts, unclassifiedReceipt];
hasCode(decide({
  ...valid,
  receipts: unclassifiedReceipts,
  report: reportForReceipts(valid, unclassifiedReceipts, "CONTEXT-unclassified-observation"),
}), "CONTEXT_CLAIM_EVIDENCE_MISSING");

assert.throws(
  () => fullFlow({ taskType: "new_feature", mutateContent: (content) => { content.task_evidence.negative_path_ids = ["EDGE-fake"]; } }),
  (error) => error?.code === "CONTEXT_TASK_EVIDENCE_INVALID",
);
assert.throws(
  () => fullFlow({ taskType: "behavior_preserving_refactor", mutateContent: (content) => { content.task_evidence.characterization_test_ids = ["TEST-fake"]; } }),
  (error) => error?.code === "CONTEXT_TASK_EVIDENCE_INVALID",
);
assert.throws(
  () => fullFlow({ taskType: "new_feature", mutateContent: (content) => { content.task_evidence.compatibility_ids = ["INV-fake"]; } }),
  (error) => error?.code === "CONTEXT_TASK_EVIDENCE_INVALID",
);
assert.throws(
  () => fullFlow({ mutateContent: (content) => { content.claims[0].kind = "inferred"; content.claims[0].receipt_ids = []; } }),
  (error) => error?.code === "CONTEXT_OWNING_ABSTRACTION_EVIDENCE",
);

const mismatch = clone(valid.report);
mismatch.deep_analyses[0].node_ids.reverse();
const mismatchReport = refingerprint(mismatch);
hasCode(decide(valid, { report: mismatchReport }), "CONTEXT_GRAPH_PATH_MISMATCH");

const critical = fullFlow({ riskClass: "critical", taskType: "security", receiptToolId: "context_search" });
const criticalDecision = decide(critical);
assert.equal(criticalDecision.status, "sufficient", JSON.stringify(criticalDecision.reasons));
assert.equal(critical.report.tool_state.fallback_used, true);
assert.equal(critical.report.tool_state.reduced_semantic_coverage, true);
assert.equal(critical.dossier.impact_graph.coverage.semantic_tool_status, "unavailable");
const criticalAdvanced = fullFlow({ riskClass: "critical", taskType: "security" });
assert.equal(decide(criticalAdvanced).status, "sufficient");
const criticalUnknown = fullFlow({
  riskClass: "critical",
  taskType: "security",
  receiptToolId: "context_search",
  mutateContent: (content) => {
    content.questions[0].status = "uncertain";
    content.questions[0].actual_observation = null;
    content.questions[0].next_action = "resolve the material relationship uncertainty";
  },
});
hasCode(decide(criticalUnknown), "CONTEXT_BLOCKING_UNKNOWN");
const criticalMissing = clone(critical.report);
criticalMissing.deep_analyses[0].dimensions = criticalMissing.deep_analyses[0].dimensions.filter((entry) => entry.dimension !== "recovery_restart");
const criticalMissingReport = refingerprint(criticalMissing);
hasCode(decide(critical, { report: criticalMissingReport }), "CONTEXT_DEEP_DIMENSION_UNCLASSIFIED");

const standardDossier = contextTestDossier({ riskClass: "standard-lite", taskType: "maintenance" });
const standardStrategy = selectMinimumContextStrategy({ risk_class: "standard-lite", task_type: "maintenance" });
const standardReceipt = contextTestReceipt({
  dossier: standardDossier,
  toolId: "context_read",
  observedPaths: ["lib/context-example.mjs"],
});
assert.deepEqual(contentBackedInspectedPaths({ receipts: [standardReceipt] }), ["lib/context-example.mjs"]);
const standardSummary = createStandardLiteContextSummary({
  summary_id: "CTXLOCAL-valid",
  session_key: standardReceipt.session_key,
  strategy_binding: standardStrategy,
  workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
  dossier: standardDossier,
  receipt_ids: [standardReceipt.receipt_id],
  inspected_paths: contentBackedInspectedPaths({ receipts: [standardReceipt] }),
  context_calls: 1,
  finalized_at: CONTEXT_TEST_FINAL_TIME,
});
const standardInput = {
  decision_id: "CTXDEC-standard-valid",
  session_key: standardReceipt.session_key,
  strategy_binding: standardStrategy,
  dossier: standardDossier,
  workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
  receipt_index: { receipts: [standardReceipt] },
  standard_lite_summary: standardSummary,
  evaluated_at: "2026-07-17T10:06:00.000Z",
};
assert.equal(evaluateContextSufficiency(standardInput).status, "sufficient");

const standardOutline = contextTestReceipt({
  receiptId: "CTXRECEIPT-STANDARD-OUTLINE",
  sequence: 1,
  dossier: standardDossier,
  toolId: "context_outline",
  observedPaths: ["lib/context-example.mjs", "lib/inventory-only.mjs"],
  startedAt: "2026-07-17T10:01:00.000Z",
  completedAt: "2026-07-17T10:02:00.000Z",
});
const standardSearch = contextTestReceipt({
  receiptId: "CTXRECEIPT-STANDARD-SEARCH",
  sequence: 2,
  dossier: standardDossier,
  toolId: "context_search",
  observedPaths: ["lib/context-example.mjs"],
  previousReceiptFingerprint: standardOutline.fingerprint,
});
assert.deepEqual(
  contentBackedInspectedPaths({ receipts: [standardOutline, standardSearch] }),
  ["lib/context-example.mjs"],
);
assert.deepEqual(contentBackedInspectedPaths({ receipts: [standardOutline] }), []);
const truncatedStandardSearch = contextTestReceipt({
  receiptId: "CTXRECEIPT-STANDARD-SEARCH-TRUNCATED",
  dossier: standardDossier,
  toolId: "context_search",
  observedPaths: ["lib/context-example.mjs"],
  truncated: true,
});
assert.deepEqual(contentBackedInspectedPaths({ receipts: [truncatedStandardSearch] }), []);

const inventoryPollutedSummary = createStandardLiteContextSummary({
  summary_id: "CTXLOCAL-inventory-polluted",
  session_key: standardSearch.session_key,
  strategy_binding: standardStrategy,
  workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
  dossier: standardDossier,
  receipt_ids: [standardOutline.receipt_id, standardSearch.receipt_id],
  inspected_paths: ["lib/context-example.mjs", "lib/inventory-only.mjs"],
  context_calls: 2,
  finalized_at: CONTEXT_TEST_FINAL_TIME,
});
hasCode(evaluateContextSufficiency({
  ...standardInput,
  decision_id: "CTXDEC-standard-inventory-polluted",
  receipt_index: { receipts: [standardOutline, standardSearch] },
  standard_lite_summary: inventoryPollutedSummary,
}), "CONTEXT_STANDARD_LITE_EVIDENCE_MISSING");

const zeroEvidenceSummary = createStandardLiteContextSummary({
  summary_id: "CTXLOCAL-zero-evidence",
  session_key: standardReceipt.session_key,
  strategy_binding: standardStrategy,
  workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
  dossier: standardDossier,
  receipt_ids: [],
  inspected_paths: [],
  context_calls: 0,
  finalized_at: CONTEXT_TEST_FINAL_TIME,
});
hasCode(evaluateContextSufficiency({
  ...standardInput,
  decision_id: "CTXDEC-standard-zero-evidence",
  receipt_index: { receipts: [] },
  standard_lite_summary: zeroEvidenceSummary,
}), "CONTEXT_STANDARD_LITE_EVIDENCE_MISSING");

const emptyStandardReceipt = contextTestReceipt({
  receiptId: "CTXRECEIPT-STANDARD-EMPTY",
  dossier: standardDossier,
  toolId: "context_files",
  observedPaths: [],
});
const emptyEvidenceSummary = createStandardLiteContextSummary({
  summary_id: "CTXLOCAL-empty-evidence",
  session_key: emptyStandardReceipt.session_key,
  strategy_binding: standardStrategy,
  workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
  dossier: standardDossier,
  receipt_ids: [emptyStandardReceipt.receipt_id],
  inspected_paths: [],
  context_calls: 1,
  finalized_at: CONTEXT_TEST_FINAL_TIME,
});
hasCode(evaluateContextSufficiency({
  ...standardInput,
  decision_id: "CTXDEC-standard-empty-evidence",
  receipt_index: { receipts: [emptyStandardReceipt] },
  standard_lite_summary: emptyEvidenceSummary,
}), "CONTEXT_STANDARD_LITE_EVIDENCE_MISSING");

const escalatedSummary = refingerprint({
  ...standardSummary,
  discovered_scope_facts: { ...standardSummary.discovered_scope_facts, transitive_consumer: true },
});
hasCode(evaluateContextSufficiency({ ...standardInput, decision_id: "CTXDEC-standard-escalate", standard_lite_summary: escalatedSummary }), "CONTEXT_STANDARD_LITE_ESCALATION_REQUIRED");
const overbuiltSummary = refingerprint({ ...standardSummary, broad_fanout: true });
hasCode(evaluateContextSufficiency({ ...standardInput, decision_id: "CTXDEC-standard-overbuilt", standard_lite_summary: overbuiltSummary }), "CONTEXT_STANDARD_LITE_OVERANALYSIS");

console.log("Context sufficiency verification passed (portable critical fallback, strict unknown/truncation gates, and content-backed standard-lite evidence).");
