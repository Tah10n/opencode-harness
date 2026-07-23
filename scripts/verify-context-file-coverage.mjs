import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  assertContextFileCoverage,
  deriveCompleteContentPaths,
  deriveContextFileCoverage,
} from "../lib/quality/context-file-coverage.mjs";
import {
  contentBackedInspectedRanges,
  contentBackedInspectedPaths,
  createContextReceiptEvidenceIndex,
  createStandardLiteContextSummary,
  evaluateContextSufficiency,
  validateContextReceiptEvidenceIndex,
} from "../lib/quality/context-sufficiency.mjs";
import { selectMinimumContextStrategy } from "../lib/quality/context-strategies.mjs";
import {
  beginContextReceiptOperation,
  completeContextReceiptOperation,
  validateContextReceipt,
} from "../lib/quality/context-receipts.mjs";
import { CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION, adaptContextToolOutput } from "../lib/quality/context-tool-adapters.mjs";
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
  contextTestTaskProfileEvidence,
} from "./context-test-fixtures.mjs";
import {
  LARGE_CONTEXT_FINGERPRINT_SALT,
  LARGE_CONTEXT_LINE_COUNT,
  LARGE_CONTEXT_RELATIVE_PATH,
  createLargeContextFileFixture,
  createLargeContextRangeReceipt,
} from "./context-large-file-fixture.mjs";

const tests = [];
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-context-file-coverage-"));
const fixture = createLargeContextFileFixture(tempRoot);
const highDossier = contextTestDossier({ transitiveImpact: "excluded", excludedSiblingPath: LARGE_CONTEXT_RELATIVE_PATH });
const highStrategy = selectMinimumContextStrategy({ risk_class: highDossier.risk_class, task_type: highDossier.task_type });

function test(name, callback) {
  tests.push({ name, callback });
}

function clone(value) {
  return structuredClone(value);
}

function expectIncomplete(receipts, code, options = {}) {
  const coverage = deriveContextFileCoverage({ receipts }, options);
  const file = coverage.find((entry) => entry.path === LARGE_CONTEXT_RELATIVE_PATH);
  assert(file, JSON.stringify(coverage));
  assert.notEqual(file.status, "complete", JSON.stringify(file));
  assert(file.reason_codes.includes(code), JSON.stringify(file));
  return file;
}

function ranges(definitions, overrides = {}) {
  let previous = overrides.previousReceiptFingerprint ?? null;
  return definitions.map(([startLine, endLine], index) => {
    const receipt = createLargeContextRangeReceipt({
      fixture,
      dossier: overrides.dossier ?? highDossier,
      strategy: overrides.strategy ?? highStrategy,
      receiptId: `${overrides.prefix ?? "CTX-LARGE"}-${String(index + 1).padStart(3, "0")}`,
      sequence: (overrides.sequenceStart ?? 1) + index,
      previousReceiptFingerprint: previous,
      startLine,
      endLine,
      ...overrides.receipt,
      ...(overrides.perReceipt?.[index] ?? {}),
    });
    previous = receipt.fingerprint;
    return receipt;
  });
}

function legacyIndexFrom(index) {
  const receipts = index.receipts.map((entry) => ({
    receipt_id: entry.receipt_id,
    sequence: entry.sequence,
    tool_id: entry.tool_id,
    status: entry.status,
    requested_paths: entry.requested_paths,
    observed_paths: entry.observed_paths,
    relationship_paths: entry.relationship_paths,
    relationships: entry.relationships,
    guidance_paths: entry.guidance_paths,
    tool_inventory: entry.tool_inventory,
    coverage: entry.coverage === null ? null : {
      partial: entry.coverage.partial,
      complete: entry.coverage.complete,
      stable: entry.coverage.stable,
      changed_during_operation: entry.coverage.changed_during_operation,
    },
    fingerprint: entry.fingerprint,
  }));
  const source = {
    schema_version: 3,
    session_key: index.session_key,
    run_id: index.run_id,
    task_id: index.task_id,
    source_fingerprint: index.source_fingerprint,
    receipts,
    metrics: index.metrics,
  };
  return { ...source, fingerprint: fingerprint(source) };
}

function symbolsAdapterResult() {
  const output = JSON.stringify({
    schemaVersion: CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION,
    tool: "context_symbols",
    worktree: ".",
    scope: { path: LARGE_CONTEXT_RELATIVE_PATH, filters: {} },
    snapshot: {
      fingerprint: createHash("sha256").update("large-symbol-snapshot").digest("hex"),
      fingerprintKind: "metadata",
      fingerprintScope: LARGE_CONTEXT_RELATIVE_PATH,
      complete: true,
      stable: true,
      changedDuringOperation: false,
      truncationReasons: [],
    },
    coverage: {
      candidateFiles: 1,
      scannedFiles: 1,
      bytesScanned: fixture.bytes,
      skippedSecret: 0,
      skippedGenerated: 0,
      skippedLarge: 0,
      skippedUnreadable: 0,
      unsupportedLanguages: {},
      truncation: Object.fromEntries([
        "inventoryLimitReached", "resultLimitReached", "matchLimitReached", "byteLimitReached",
        "lineLimitReached", "durationLimitReached", "excerptTruncated", "contextBeforeTruncated",
        "contextAfterTruncated", "symbolLimitReached", "relationshipLimitReached", "snapshotChanged",
        "coveragePartial",
      ].map((key) => [key, false])),
      truncationReasons: [],
      partial: false,
    },
    limits: {},
    usage: { files: 1, directories: 0, bytes: fixture.bytes, lines: LARGE_CONTEXT_LINE_COUNT, matches: 0, ranges: 0 },
    truncated: false,
    symbols: [{ path: LARGE_CONTEXT_RELATIVE_PATH, line: 1, kind: "constant", name: "branch0001" }],
  });
  return adaptContextToolOutput("context_symbols", output, { fingerprintSalt: LARGE_CONTEXT_FINGERPRINT_SALT });
}

test("fixture contains 1,200 actual meaningful source lines", () => {
  assert.equal(fixture.lines.length, 1200);
  assert(fixture.lines.every((line, index) => line.includes(`branch${String(index + 1).padStart(4, "0")}`)));
  assert.equal(fs.readFileSync(fixture.absolute_path, "utf8").split("\n").length, 1200);
});

test("three bounded normalized context_read receipts cover one exact file version", () => {
  const receipts = ranges([[1, 500], [501, 1000], [1001, 1200]], { prefix: "CTX-LARGE-EXACT" });
  assert(receipts.every((entry) => entry.tool_output_schema_version === 2 && entry.result.content_ranges.length === 1));
  assert(receipts.every((entry) => entry.request.ranges[0].max_lines <= 500));
  assert(!JSON.stringify(receipts).includes(fixture.lines[0]), "normalized receipts must not persist source text");
  const [coverage] = assertContextFileCoverage({ receipts });
  assert.deepEqual(coverage, {
    path: LARGE_CONTEXT_RELATIVE_PATH,
    status: "complete",
    content_version_fingerprint: receipts[0].result.content_ranges[0].content_version_fingerprint,
    total_lines: 1200,
    covered_ranges: [{ start_line: 1, end_line: 1200 }],
    gap_ranges: [],
    contributing_receipt_ids: receipts.map((entry) => entry.receipt_id),
    reason_codes: [],
  });
  assert(receipts.every((entry) => (
    entry.result.content_ranges[0].content_version_fingerprint
      === receipts[0].result.content_ranges[0].content_version_fingerprint
  )));
  assert(!JSON.stringify(receipts).includes(fixture.sha256), "unsalted full-file SHA-256 must not be persisted");
  assert.throws(
    () => createLargeContextRangeReceipt({
      fixture,
      dossier: highDossier,
      strategy: highStrategy,
      receiptId: "CTX-LARGE-OVERSIZED-RANGE",
      sequence: 1,
      startLine: 1,
      endLine: 501,
    }),
    (error) => error instanceof ContractError && error.code === "CONTEXT_RECEIPT_INTEGER",
  );
});

test("overlap, out-of-order input, and adjacency normalize while duplicate identities fail closed", () => {
  const overlapping = ranges([[1, 500], [400, 899], [700, 1000], [1001, 1200]], { prefix: "CTX-LARGE-OVERLAP" });
  const shuffled = [overlapping[3], overlapping[1], overlapping[0], overlapping[2]];
  const [coverage] = deriveContextFileCoverage({ receipts: shuffled });
  assert.equal(coverage.status, "complete");
  assert.deepEqual(coverage.covered_ranges, [{ start_line: 1, end_line: 1200 }]);
  assert.deepEqual(coverage.contributing_receipt_ids, overlapping.map((entry) => entry.receipt_id).sort());
  assert.throws(
    () => deriveContextFileCoverage({ receipts: [...shuffled, overlapping[1]] }),
    (error) => error instanceof ContractError && error.code === "CONTEXT_RECEIPT_DUPLICATE",
  );
});

test("exact receipt subsets cannot borrow coverage from an unrelated file version", () => {
  const complete = ranges([[1, 500], [501, 1000], [1001, 1200]], { prefix: "CTX-LARGE-SUBSET" });
  const other = ranges([[1, 500]], {
    prefix: "CTX-LARGE-SUBSET-OTHER",
    sequenceStart: 4,
    receipt: { fullFileSha256: "f".repeat(64) },
  });
  assert.deepEqual(
    deriveCompleteContentPaths({ receipts: [...complete, ...other] }, { receipt_ids: complete.map((entry) => entry.receipt_id) }),
    [LARGE_CONTEXT_RELATIVE_PATH],
  );
  assert.throws(
    () => deriveCompleteContentPaths({ receipts: complete }, { receipt_ids: [complete[0].receipt_id, complete[0].receipt_id] }),
    (error) => error instanceof ContractError && error.code === "CONTEXT_RECEIPT_DUPLICATE",
  );
  assert.throws(
    () => deriveCompleteContentPaths({ receipts: complete }, { receipt_ids: ["CTX-LARGE-UNKNOWN"] }),
    (error) => error instanceof ContractError && error.code === "CONTEXT_RECEIPT_UNKNOWN",
  );
  expectIncomplete([...complete, ...other], "CONTEXT_FILE_VERSION_MISMATCH");
});

test("gaps at line 501, the final line, and the first line remain incomplete", () => {
  const middle = ranges([[1, 500], [502, 1001], [1002, 1200]], { prefix: "CTX-LARGE-GAP-MIDDLE" });
  assert.deepEqual(expectIncomplete(middle, "CONTEXT_FILE_COVERAGE_GAP").gap_ranges, [{ start_line: 501, end_line: 501 }]);
  const final = ranges([[1, 500], [501, 1000], [1001, 1199]], { prefix: "CTX-LARGE-GAP-FINAL" });
  assert.deepEqual(expectIncomplete(final, "CONTEXT_FILE_COVERAGE_GAP").gap_ranges, [{ start_line: 1200, end_line: 1200 }]);
  const first = ranges([[2, 500], [501, 1000], [1001, 1200]], { prefix: "CTX-LARGE-GAP-FIRST" });
  assert.deepEqual(expectIncomplete(first, "CONTEXT_FILE_COVERAGE_GAP").gap_ranges, [{ start_line: 1, end_line: 1 }]);
});

test("mixed file identities and mixed total-line counts fail closed", () => {
  const identity = ranges([[1, 500], [501, 1000], [1001, 1200]], {
    prefix: "CTX-LARGE-MIXED-ID",
    perReceipt: { 1: { fullFileSha256: "e".repeat(64) } },
  });
  expectIncomplete(identity, "CONTEXT_FILE_VERSION_MISMATCH");
  const totals = ranges([[1, 500], [501, 1000], [1001, 1200]], {
    prefix: "CTX-LARGE-MIXED-TOTAL",
    perReceipt: { 1: { totalLines: 1201 } },
  });
  expectIncomplete(totals, "CONTEXT_FILE_TOTAL_LINES_MISMATCH");
});

test("cross-session, cross-workspace, and cross-strategy ranges fail closed", () => {
  const expectBindingFailure = (receipts) => assert.throws(
    () => deriveContextFileCoverage({ receipts }),
    (error) => error instanceof ContractError && error.code === "CONTEXT_RECEIPT_BINDING_INVALID",
  );
  const crossSession = ranges([[1, 500], [501, 1000], [1001, 1200]], {
    prefix: "CTX-LARGE-CROSS-SESSION",
    perReceipt: { 1: { sessionKey: "b".repeat(64) } },
  });
  expectBindingFailure(crossSession);
  const crossWorkspace = ranges([[1, 500], [501, 1000], [1001, 1200]], {
    prefix: "CTX-LARGE-CROSS-WORKSPACE",
    perReceipt: { 1: { workspaceFingerprint: `sha256:${"c".repeat(64)}`, sourceFingerprint: `sha256:${"c".repeat(64)}` } },
  });
  expectBindingFailure(crossWorkspace);
  const standardStrategy = selectMinimumContextStrategy({ risk_class: "standard-lite", task_type: "maintenance" });
  const crossStrategy = ranges([[1, 500], [501, 1000], [1001, 1200]], {
    prefix: "CTX-LARGE-CROSS-STRATEGY",
    perReceipt: { 1: { strategy: standardStrategy } },
  });
  expectBindingFailure(crossStrategy);
});

test("post-mutation ranges are stale and unstable producer success fails closed", () => {
  const postMutation = ranges([[1, 500], [501, 1000], [1001, 1200]], {
    prefix: "CTX-LARGE-POST-MUTATION",
    perReceipt: { 1: { mutationRevisionStarted: 1, mutationRevisionCompleted: 1 } },
  });
  expectIncomplete(postMutation, "CONTEXT_FILE_RANGE_STALE");
  const drifted = ranges([[1, 500], [501, 1000], [1001, 1200]], {
    prefix: "CTX-LARGE-DRIFT",
    perReceipt: { 1: { snapshotStable: false, changedDuringOperation: true, stableDuringRead: false } },
  });
  assert.equal(drifted[1].status, "failed");
  assert.equal(drifted[1].reason_code, "unsupported_schema");
  assert.equal(drifted[1].result, null);
  expectIncomplete(drifted, "CONTEXT_FILE_IDENTITY_MISSING");
});

test("hash mismatch, partial batch failure, and non-range truncation poison an otherwise complete union", () => {
  const complete = ranges([[1, 500], [501, 1000], [1001, 1200]], { prefix: "CTX-LARGE-POISON" });
  const hashMismatch = createLargeContextRangeReceipt({
    fixture,
    dossier: highDossier,
    strategy: highStrategy,
    receiptId: "CTX-LARGE-HASH-MISMATCH",
    sequence: 4,
    previousReceiptFingerprint: complete.at(-1).fingerprint,
    startLine: 1,
    endLine: 500,
    fullFileSha256: "f".repeat(64),
    failure: "hash-mismatch",
  });
  assert.equal(hashMismatch.reason_code, "hash_mismatch");
  expectIncomplete([...complete, hashMismatch], "CONTEXT_FILE_IDENTITY_MISSING");
  const companionPath = "fixtures/context-batch-companion.mjs";
  const companionSource = "export const companion = true;";
  const companionSha256 = createHash("sha256").update(companionSource).digest("hex");
  const batchPending = beginContextReceiptOperation({
    receipt_id: "CTX-LARGE-PARTIAL-BATCH",
    sequence: 4,
    previous_receipt_fingerprint: complete.at(-1).fingerprint,
    session_key: CONTEXT_TEST_SESSION_KEY,
    parent_session_key: null,
    producer_session_key: CONTEXT_TEST_SESSION_KEY,
    producer_role: "runner",
    run_id: highDossier.run_id,
    task_id: highDossier.task_id,
    worktree_fingerprint: CONTEXT_TEST_WORKSPACE,
    source_fingerprint: CONTEXT_TEST_WORKSPACE,
    context_strategy_id: highStrategy.strategy_id,
    context_strategy_fingerprint: highStrategy.fingerprint,
    parent_question_id: null,
    evidence_refs: [{ kind: "file", value: LARGE_CONTEXT_RELATIVE_PATH }],
    mutation_revision_started: 0,
    tool_id: "context_batch_read",
    call_key_fingerprint: fingerprint({ call: "partial-batch" }),
    started_at: "2026-07-17T10:18:00.000Z",
    args: { ranges: [
      { path: LARGE_CONTEXT_RELATIVE_PATH, startLine: 1, maxLines: 500, expectedSha256: fixture.sha256 },
      { path: companionPath, startLine: 1, maxLines: 1, expectedSha256: companionSha256 },
    ] },
    fingerprint_salt: LARGE_CONTEXT_FINGERPRINT_SALT,
  });
  const batchOutput = JSON.stringify({
    schemaVersion: CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION,
    tool: "context_batch_read",
    worktree: ".",
    scope: { path: ".", filters: {} },
    snapshot: {
      fingerprint: createHash("sha256").update("partial-batch-snapshot").digest("hex"),
      fingerprintKind: "content",
      fingerprintScope: ".",
      complete: true,
      stable: true,
      changedDuringOperation: false,
      truncationReasons: [],
    },
    coverage: {
      candidateFiles: 2,
      scannedFiles: 2,
      bytesScanned: Buffer.byteLength(companionSource, "utf8"),
      skippedSecret: 0,
      skippedGenerated: 0,
      skippedLarge: 0,
      skippedUnreadable: 0,
      unsupportedLanguages: {},
      truncation: Object.fromEntries([
        "inventoryLimitReached", "resultLimitReached", "matchLimitReached", "byteLimitReached",
        "lineLimitReached", "durationLimitReached", "excerptTruncated", "contextBeforeTruncated",
        "contextAfterTruncated", "symbolLimitReached", "relationshipLimitReached", "snapshotChanged",
        "coveragePartial",
      ].map((key) => [key, false])),
      truncationReasons: [],
      partial: false,
    },
    limits: { maxLines: 501 },
    usage: { files: 1, directories: 0, bytes: Buffer.byteLength(companionSource, "utf8"), lines: 1, matches: 0, ranges: 1 },
    truncated: false,
    results: [
      {
        path: LARGE_CONTEXT_RELATIVE_PATH,
        ok: false,
        error: "hash-mismatch",
        expectedSha256: fixture.sha256,
        actualSha256: "f".repeat(64),
      },
      {
        path: companionPath,
        ok: true,
        sha256: companionSha256,
        bytes: Buffer.byteLength(companionSource, "utf8"),
        totalLines: 1,
        selectedRange: { startLine: 1, endLine: 1 },
        encoding: "utf-8",
        stableDuringRead: true,
        truncatedBefore: false,
        truncatedAfter: false,
        text: companionSource,
      },
    ],
    usedLines: 1,
  });
  const partialBatch = completeContextReceiptOperation(batchPending, {
    output: batchOutput,
    completed_at: "2026-07-17T10:18:01.000Z",
    mutation_revision_completed: 0,
    fingerprint_salt: LARGE_CONTEXT_FINGERPRINT_SALT,
  });
  assert.equal(partialBatch.status, "truncated");
  assert.equal(partialBatch.reason_code, "partial_tool_failure");
  assert.deepEqual(partialBatch.result.item_failures, [{
    path: LARGE_CONTEXT_RELATIVE_PATH,
    reason_code: "hash_mismatch",
  }]);
  const inspectedRanges = contentBackedInspectedRanges({ receipts: [partialBatch] });
  assert.deepEqual(inspectedRanges.map((entry) => entry.path), [companionPath]);
  assert.equal(inspectedRanges[0].requested_scope_complete, false);
  assert.deepEqual(contentBackedInspectedPaths({ receipts: [partialBatch] }), []);
  assert.equal(inspectedRanges.some((entry) => entry.path === LARGE_CONTEXT_RELATIVE_PATH), false);
  expectIncomplete([...complete, partialBatch], "CONTEXT_FILE_IDENTITY_MISSING");
  const lineLimited = ranges([[1, 500], [501, 1000], [1001, 1200]], {
    prefix: "CTX-LARGE-LINE-LIMIT",
    perReceipt: { 1: { truncationOverrides: { lineLimitReached: true } } },
  });
  expectIncomplete(lineLimited, "CONTEXT_FILE_RANGE_UNTRUSTED");
});

test("inconsistent producer partial coverage fails closed and cannot prove content", () => {
  const relativePath = "fixtures/context-explicit-partial.mjs";
  const absolutePath = path.join(tempRoot, ...relativePath.split("/"));
  const source = "export const explicitlyPartial = true;";
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, source, "utf8");
  const fullFileSha256 = createHash("sha256").update(fs.readFileSync(absolutePath, "utf8")).digest("hex");
  const pending = beginContextReceiptOperation({
    receipt_id: "CTX-EXPLICIT-PARTIAL",
    sequence: 1,
    previous_receipt_fingerprint: null,
    session_key: CONTEXT_TEST_SESSION_KEY,
    parent_session_key: null,
    producer_session_key: CONTEXT_TEST_SESSION_KEY,
    producer_role: "runner",
    run_id: highDossier.run_id,
    task_id: highDossier.task_id,
    worktree_fingerprint: CONTEXT_TEST_WORKSPACE,
    source_fingerprint: CONTEXT_TEST_WORKSPACE,
    context_strategy_id: highStrategy.strategy_id,
    context_strategy_fingerprint: highStrategy.fingerprint,
    parent_question_id: null,
    evidence_refs: [{ kind: "file", value: relativePath }],
    mutation_revision_started: 0,
    tool_id: "context_read",
    call_key_fingerprint: fingerprint({ call: "explicit-partial-without-code" }),
    started_at: "2026-07-17T10:19:00.000Z",
    args: { path: relativePath, startLine: 1, maxLines: 1, expectedSha256: fullFileSha256, format: "json" },
    fingerprint_salt: LARGE_CONTEXT_FINGERPRINT_SALT,
  });
  const output = JSON.stringify({
    schemaVersion: CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION,
    tool: "context_read",
    worktree: ".",
    scope: { path: relativePath, filters: {} },
    snapshot: {
      fingerprint: createHash("sha256").update("explicit-partial-snapshot").digest("hex"),
      fingerprintKind: "content",
      fingerprintScope: relativePath,
      complete: true,
      stable: true,
      changedDuringOperation: false,
      truncationReasons: [],
    },
    coverage: {
      candidateFiles: 1,
      scannedFiles: 1,
      bytesScanned: Buffer.byteLength(source, "utf8"),
      skippedSecret: 0,
      skippedGenerated: 0,
      skippedLarge: 0,
      skippedUnreadable: 0,
      unsupportedLanguages: {},
      truncation: Object.fromEntries([
        "inventoryLimitReached", "resultLimitReached", "matchLimitReached", "byteLimitReached",
        "lineLimitReached", "durationLimitReached", "excerptTruncated", "contextBeforeTruncated",
        "contextAfterTruncated", "symbolLimitReached", "relationshipLimitReached", "snapshotChanged",
        "coveragePartial",
      ].map((key) => [key, false])),
      truncationReasons: [],
      partial: true,
    },
    limits: { maxLines: 1 },
    usage: { files: 1, directories: 0, bytes: Buffer.byteLength(source, "utf8"), lines: 1, matches: 0, ranges: 1 },
    truncated: false,
    ok: true,
    path: relativePath,
    sha256: fullFileSha256,
    bytes: Buffer.byteLength(source, "utf8"),
    totalLines: 1,
    selectedRange: { startLine: 1, endLine: 1 },
    encoding: "utf-8",
    stableDuringRead: true,
    truncatedBefore: false,
    truncatedAfter: false,
    text: source,
  });
  const receipt = completeContextReceiptOperation(pending, {
    output,
    completed_at: "2026-07-17T10:19:01.000Z",
    mutation_revision_completed: 0,
    fingerprint_salt: LARGE_CONTEXT_FINGERPRINT_SALT,
  });
  validateContextReceipt(receipt);
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.reason_code, "unsupported_schema");
  assert.equal(receipt.result, null);
  const [coverage] = deriveContextFileCoverage({ receipts: [receipt] });
  assert.equal(coverage.status, "incomplete");
  assert(coverage.reason_codes.includes("CONTEXT_FILE_IDENTITY_MISSING"));
});

test("search, inventory, and symbol evidence never substitute for full content", () => {
  const search = contextTestReceipt({ receiptId: "CTX-NONCONTENT-SEARCH", dossier: highDossier, toolId: "context_search", observedPaths: [LARGE_CONTEXT_RELATIVE_PATH] });
  const inventory = contextTestReceipt({ receiptId: "CTX-NONCONTENT-INVENTORY", dossier: highDossier, toolId: "context_files", observedPaths: [LARGE_CONTEXT_RELATIVE_PATH] });
  const symbols = symbolsAdapterResult();
  assert.equal(symbols.status, "success");
  assert.deepEqual(deriveCompleteContentPaths({ receipts: [search, inventory] }), []);
  assert.throws(
    () => deriveCompleteContentPaths({ receipts: [{ tool_id: "context_symbols", result: symbols.result }] }),
    (error) => error instanceof ContractError && error.code === "CONTEXT_RECEIPT_BINDING_INVALID",
  );
});

test("evidence index v4 persists canonical diagnostics but schema v3 cannot prove aggregation", () => {
  const receipts = ranges([[1, 500], [501, 1000], [1001, 1200]], { prefix: "CTX-LARGE-INDEX" });
  const index = createContextReceiptEvidenceIndex({ receipts }, {
    session_key: CONTEXT_TEST_SESSION_KEY,
    run_id: highDossier.run_id,
    task_id: highDossier.task_id,
    source_fingerprint: CONTEXT_TEST_WORKSPACE,
  });
  validateContextReceiptEvidenceIndex(index);
  assert.equal(index.schema_version, 4);
  assert.equal(index.file_coverage[0].status, "complete");
  const legacy = legacyIndexFrom(index);
  validateContextReceiptEvidenceIndex(legacy);
  const [legacyCoverage] = deriveContextFileCoverage(legacy);
  assert.equal(legacyCoverage.status, "legacy_unavailable");
  assert(legacyCoverage.reason_codes.includes("CONTEXT_FILE_IDENTITY_MISSING"));
  assert.deepEqual(deriveCompleteContentPaths(legacy), []);
  const injectedLegacy = clone(legacy);
  injectedLegacy.receipts[0].receipt_schema_version = 3;
  injectedLegacy.receipts[0].tool_output_schema_version = 2;
  injectedLegacy.receipts[0].reason_code = index.receipts[0].reason_code;
  injectedLegacy.receipts[0].content_ranges = clone(index.receipts[0].content_ranges);
  const [injectedLegacyCoverage] = deriveContextFileCoverage(injectedLegacy, {
    receipt_ids: [injectedLegacy.receipts[0].receipt_id],
  });
  assert.equal(injectedLegacyCoverage.status, "legacy_unavailable");
  assert.deepEqual(deriveCompleteContentPaths(injectedLegacy, {
    receipt_ids: [injectedLegacy.receipts[0].receipt_id],
  }), []);
  const missingBinding = clone(index);
  delete missingBinding.receipts[0].worktree_fingerprint;
  assert.throws(
    () => deriveContextFileCoverage(missingBinding, { receipt_ids: [missingBinding.receipts[0].receipt_id] }),
    (error) => error instanceof ContractError && error.code === "CONTEXT_RECEIPT_BINDING_INVALID",
  );
  const unknownSchema = clone(index);
  unknownSchema.schema_version = 99;
  assert.throws(
    () => deriveContextFileCoverage(unknownSchema),
    (error) => error instanceof ContractError && error.code === "CONTEXT_RECEIPT_INDEX_SCHEMA",
  );
  const tampered = clone(index);
  tampered.file_coverage[0].covered_ranges = [{ start_line: 1, end_line: 1199 }];
  const source = clone(tampered);
  delete source.fingerprint;
  tampered.fingerprint = fingerprint(source);
  assert.throws(
    () => validateContextReceiptEvidenceIndex(tampered),
    (error) => error instanceof ContractError && error.code === "CONTEXT_FILE_RANGE_UNTRUSTED",
  );
});

test("a complete bounded union satisfies a standard-lite inspected-path requirement", () => {
  const dossier = contextTestDossier({ riskClass: "standard-lite", taskType: "maintenance" });
  const strategy = selectMinimumContextStrategy({ risk_class: dossier.risk_class, task_type: dossier.task_type });
  const receipts = ranges([[1, 500], [501, 1000], [1001, 1200]], {
    prefix: "CTX-LARGE-STANDARD",
    dossier,
    strategy,
  });
  const inspectedPaths = contentBackedInspectedPaths({ receipts }, { receipt_ids: receipts.map((entry) => entry.receipt_id) });
  assert.deepEqual(inspectedPaths, [LARGE_CONTEXT_RELATIVE_PATH]);
  const summary = createStandardLiteContextSummary({
    summary_id: "CTXLOCAL-large-file",
    session_key: CONTEXT_TEST_SESSION_KEY,
    strategy_binding: strategy,
    workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
    dossier,
    receipt_ids: receipts.map((entry) => entry.receipt_id),
    inspected_paths: inspectedPaths,
    context_calls: receipts.length,
    finalized_at: "2026-07-17T10:20:00.000Z",
  });
  const decision = evaluateContextSufficiency({
    decision_id: "CTXDEC-standard-large-file",
    session_key: CONTEXT_TEST_SESSION_KEY,
    strategy_binding: strategy,
    dossier,
    workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
    receipt_index: { receipts },
    standard_lite_summary: summary,
    evaluated_at: "2026-07-17T10:21:00.000Z",
  });
  assert.equal(decision.status, "sufficient", JSON.stringify(decision.reasons));
});

test("informational high-risk range boundaries do not become unresolved truncations", () => {
  const outline = contextTestReceipt({
    receiptId: "CTX-LARGE-HIGH-OUTLINE",
    sequence: 1,
    dossier: highDossier,
    toolId: "context_outline",
    availableToolIds: ["context_outline", "context_files", "context_search", "context_read", "context_batch_read"],
  });
  const graphRead = contextTestReceipt({
    receiptId: "CTX-LARGE-HIGH-GRAPH",
    sequence: 2,
    dossier: highDossier,
    toolId: "context_batch_read",
    previousReceiptFingerprint: outline.fingerprint,
    availableToolIds: ["context_outline", "context_files", "context_search", "context_read", "context_batch_read"],
    observedPaths: highDossier.impact_graph.nodes.map((entry) => entry.path).filter((entry) => typeof entry === "string"),
  });
  const bounded = ranges([[1, 500], [501, 1000], [1001, 1200]], {
    prefix: "CTX-LARGE-HIGH-RANGE",
    sequenceStart: 3,
    previousReceiptFingerprint: graphRead.fingerprint,
  });
  const receipts = [outline, graphRead, ...bounded];
  const content = completeContextContent({
    strategyBinding: highStrategy,
    dossier: highDossier,
    receiptIds: receipts.map((entry) => entry.receipt_id),
    advancedAvailable: ["context_batch_read"],
  });
  assert(bounded.every((entry) => entry.status === "success"));
  content.tool_state.unresolved_truncation_receipt_ids = [];
  const draft = createWholeSystemContextReportDraft({
    report_id: "CONTEXT-large-range-union",
    session_key: CONTEXT_TEST_SESSION_KEY,
    strategy_binding: highStrategy,
    workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
    dossier: highDossier,
    created_at: CONTEXT_TEST_TIME,
    content,
  });
  const report = finalizeWholeSystemContextReport(draft, {
    finalized_at: "2026-07-17T10:25:00.000Z",
    strategy_binding: highStrategy,
    workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
    dossier: highDossier,
    receipt_index: { receipts },
  });
  const decision = evaluateContextSufficiency({
    decision_id: "CTXDEC-large-range-union",
    session_key: CONTEXT_TEST_SESSION_KEY,
    strategy_binding: highStrategy,
    dossier: highDossier,
    workspace_fingerprint: CONTEXT_TEST_WORKSPACE,
    receipt_index: { receipts },
    report,
    task_profile_evidence: contextTestTaskProfileEvidence({ dossier: highDossier }),
    evaluated_at: "2026-07-17T10:26:00.000Z",
  });
  assert.equal(
    decision.reasons.some((entry) => entry.code === "CONTEXT_TRUNCATION_UNRESOLVED"),
    false,
    JSON.stringify(decision.reasons),
  );
});

let passed = 0;
try {
  for (const entry of tests) {
    entry.callback();
    passed++;
    console.log(`ok - ${entry.name}`);
  }
  console.log(`Context file coverage verification passed (${passed}/${tests.length}).`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
