import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { selectMinimumContextStrategy } from "../lib/quality/context-strategies.mjs";
import {
  createWholeSystemContextReportDraft,
  finalizeWholeSystemContextReport,
  updateWholeSystemContextReportDraft,
  validateWholeSystemContextReport,
  wholeSystemContextReportAnalysisFingerprint,
} from "../lib/quality/whole-system-context-report.mjs";
import { fingerprint } from "../lib/quality/validation.mjs";
import {
  completeContextContent,
  CONTEXT_TEST_FINAL_TIME,
  CONTEXT_TEST_TIME,
  CONTEXT_TEST_WORKSPACE,
  contextTestDossier,
  contextTestReceipt,
} from "./context-test-fixtures.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(fs.readFileSync(path.join(root, "quality/schemas/whole-system-context-report.schema.json"), "utf8"));
assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
assert.equal(schema.additionalProperties, false);
assert.equal(schema.properties.schema_version.const, 1);
assert.equal(Object.hasOwn(schema.properties, "nodes"), false, "report must not duplicate the impact graph");
assert.equal(Object.hasOwn(schema.properties, "edges"), false, "report must not duplicate the impact graph");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function rejects(code, action) {
  assert.throws(action, (error) => error?.code === code, `expected ${code}`);
}

const dossier = contextTestDossier({ riskClass: "high", taskType: "bug_fix" });
const strategy = selectMinimumContextStrategy({ risk_class: "high", task_type: "bug_fix" });
const receipt = contextTestReceipt({ dossier });
const content = completeContextContent({ strategyBinding: strategy, dossier, receiptId: receipt.receipt_id });
const draft = createWholeSystemContextReportDraft({
  report_id: "CONTEXT-complete",
  session_key: receipt.session_key,
  strategy_binding: strategy,
  workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
  dossier,
  created_at: CONTEXT_TEST_TIME,
  content,
});
validateWholeSystemContextReport(draft, { dossier, impactGraph: dossier.impact_graph });
assert.equal(draft.status, "draft");
assert.equal(draft.receipt_ids.length, 1);
assert.equal(draft.deep_analyses.length, dossier.impact_graph.affected_paths.filter((entry) => entry.critical).length);
assert.deepEqual(draft.deep_analyses[1].node_ids, dossier.impact_graph.affected_paths[1].node_ids);

const updated = updateWholeSystemContextReportDraft(draft, {
  expected_revision: draft.revision,
  updated_at: "2026-07-17T10:03:00.000Z",
  patch: { budget_state: { ...draft.budget_state, context_calls_used: 5 } },
});
assert.equal(updated.revision, 2);
rejects("CONTEXT_REPORT_REVISION_CONFLICT", () => updateWholeSystemContextReportDraft(updated, {
  expected_revision: 1,
  updated_at: CONTEXT_TEST_FINAL_TIME,
  patch: { claims: updated.claims },
}));

const finalized = finalizeWholeSystemContextReport(updated, {
  finalized_at: CONTEXT_TEST_FINAL_TIME,
  strategy_binding: strategy,
  workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
  dossier,
  receipt_index: { receipts: [receipt] },
});
validateWholeSystemContextReport(finalized, { dossier, impactGraph: dossier.impact_graph });
assert.equal(finalized.status, "finalized");
assert.equal(finalized.revision, 3);
const reopened = updateWholeSystemContextReportDraft(finalized, {
  expected_revision: finalized.revision,
  updated_at: "2026-07-17T10:06:00.000Z",
  patch: { claims: finalized.claims },
});
assert.equal(reopened.status, "draft");
assert.equal(reopened.revision, finalized.revision + 1);
assert.equal(reopened.finalized_at, null);
assert.equal(finalized.status, "finalized", "the prior finalized report must remain immutable");
assert.equal(
  wholeSystemContextReportAnalysisFingerprint(reopened),
  wholeSystemContextReportAnalysisFingerprint(finalized),
);

rejects("CONTEXT_RECEIPT_UNKNOWN", () => finalizeWholeSystemContextReport(draft, {
  finalized_at: CONTEXT_TEST_FINAL_TIME,
  strategy_binding: strategy,
  workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
  dossier,
  receipt_index: { receipts: [] },
}));
rejects("CONTEXT_RECEIPT_CROSS_SESSION", () => finalizeWholeSystemContextReport(draft, {
  finalized_at: CONTEXT_TEST_FINAL_TIME,
  strategy_binding: strategy,
  workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
  dossier,
  receipt_index: { receipts: [{ ...receipt, session_key: "another-session" }] },
}));
rejects("CONTEXT_RECEIPT_AFTER_MUTATION", () => finalizeWholeSystemContextReport(draft, {
  finalized_at: CONTEXT_TEST_FINAL_TIME,
  strategy_binding: strategy,
  workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
  dossier,
  receipt_index: { receipts: [{ ...receipt, mutation_revision_started: 1 }] },
}));
rejects("CONTEXT_EVIDENCE_STALE", () => finalizeWholeSystemContextReport(draft, {
  finalized_at: CONTEXT_TEST_FINAL_TIME,
  strategy_binding: strategy,
  workspace_fingerprint: fingerprint({ stale: true }),
  dossier,
  receipt_index: { receipts: [receipt] },
}));

const pathMismatch = clone(draft);
pathMismatch.deep_analyses[0].node_ids.reverse();
delete pathMismatch.fingerprint;
pathMismatch.fingerprint = fingerprint(pathMismatch);
rejects("CONTEXT_GRAPH_PATH_MISMATCH", () => validateWholeSystemContextReport(pathMismatch, { dossier, impactGraph: dossier.impact_graph }));

const generic = clone(draft);
generic.claims[0].statement = "All callers checked.";
delete generic.fingerprint;
generic.fingerprint = fingerprint(generic);
rejects("CONTEXT_GENERIC_CLAIM", () => validateWholeSystemContextReport(generic));

const unsupportedDimension = clone(draft);
unsupportedDimension.deep_analyses[0].dimensions[0].dimension = "imaginary";
delete unsupportedDimension.fingerprint;
unsupportedDimension.fingerprint = fingerprint(unsupportedDimension);
rejects("CONTRACT_ENUM", () => validateWholeSystemContextReport(unsupportedDimension));

console.log("Whole-system context verification passed (strict versioned report, impact/dossier links, hypotheses, deep paths, receipts, and immutable finalization).");
