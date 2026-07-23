import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createContextReceiptStore } from "../lib/quality/context-receipt-store.mjs";
import {
  CONTEXT_RECEIPT_PRODUCER,
  CONTEXT_RECEIPT_SCHEMA_VERSION,
  assertPreMutationContextReceipt,
  assertSameSessionContextReceipt,
  beginContextReceiptOperation,
  completeContextReceiptOperation,
  createContextReceipt,
  failContextReceiptOperation,
  validateContextReceipt,
} from "../lib/quality/context-receipts.mjs";
import { selectMinimumContextStrategy } from "../lib/quality/context-strategies.mjs";
import {
  CONTEXT_TOOL_IDS,
  CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION,
  adaptContextToolOutput,
} from "../lib/quality/context-tool-adapters.mjs";
import { ContractError } from "../lib/quality/validation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tests = [];
const salt = "context-receipt-verifier-salt-2026";
const contextStrategy = selectMinimumContextStrategy({ risk_class: "high", task_type: "maintenance" });
const sessionKey = "a".repeat(64);
const worktreeFingerprint = digest("worktree");
const sourceFingerprint = digest("source");
const RAW_SOURCE_CANARY = "RAW_SOURCE_CANARY_DO_NOT_PERSIST";
const RAW_SEARCH_CANARY = "RAW_SEARCH_CANARY_DO_NOT_PERSIST";
const RAW_ERROR_CANARY = "Bearer raw-error-token-do-not-persist";
const ABSOLUTE_PATH_CANARY = "C:\\Users\\private\\secret.txt";

function digest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function test(name, callback) {
  tests.push({ name, callback });
}

function expectContract(callback, code = null) {
  assert.throws(callback, (error) => error instanceof ContractError && (code === null || error.code === code));
}

function truncation(overrides = {}) {
  return {
    inventoryLimitReached: false,
    resultLimitReached: false,
    matchLimitReached: false,
    byteLimitReached: false,
    lineLimitReached: false,
    durationLimitReached: false,
    excerptTruncated: false,
    contextBeforeTruncated: false,
    contextAfterTruncated: false,
    symbolLimitReached: false,
    relationshipLimitReached: false,
    snapshotChanged: false,
    coveragePartial: false,
    ...overrides,
  };
}

function envelope(tool, result, overrides = {}) {
  return JSON.stringify({
    schemaVersion: CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION,
    tool,
    worktree: ".",
    scope: { path: ".", filters: {} },
    snapshot: {
      fingerprint: createHash("sha256").update(`${tool}-snapshot`).digest("hex"),
      fingerprintKind: "metadata",
      fingerprintScope: ".",
      complete: true,
      stable: true,
      changedDuringOperation: false,
      truncationReasons: [],
    },
    coverage: {
      candidateFiles: 3,
      scannedFiles: 2,
      bytesScanned: 120,
      skippedSecret: 0,
      skippedGenerated: 0,
      skippedLarge: 0,
      skippedUnreadable: 0,
      unsupportedLanguages: {},
      truncation: truncation(),
      truncationReasons: [],
      partial: false,
    },
    limits: {},
    usage: { files: 2, directories: 1, bytes: 120, lines: 10, matches: 1, ranges: 1 },
    truncated: false,
    ...result,
    ...overrides,
  }, null, 2);
}

const toolCases = {
  context_outline: {
    args: {},
    result: {
      guidance: [{ path: "AGENTS.md", text: RAW_SOURCE_CANARY }],
      filesSample: [{ path: "src/app.js", size: 10 }],
      tools: [...CONTEXT_TOOL_IDS, "unrelated_tool"],
      toolset: "advanced",
      explicitEnabledTools: [],
    },
    expectedPath: "src/app.js",
  },
  context_files: {
    args: { path: "src", contains: RAW_SEARCH_CANARY, limit: 10 },
    result: {
      files: [{ path: "src/app.js", size: 10 }],
      prompt: RAW_SOURCE_CANARY,
      completion: RAW_SOURCE_CANARY,
      transcript: RAW_SOURCE_CANARY,
      raw_source: RAW_SOURCE_CANARY,
    },
    expectedPath: "src/app.js",
  },
  context_search: {
    args: { query: RAW_SEARCH_CANARY, path: "src", contextLines: 1 },
    result: {
      query: RAW_SEARCH_CANARY,
      scanned: 1,
      matches: [{
        path: "src/app.js",
        line: 7,
        text: RAW_SOURCE_CANARY,
        textTruncated: false,
        fileSha256: "1".repeat(64),
        contextBefore: [{ line: 6, text: RAW_SOURCE_CANARY }],
      }],
      matchedFiles: [{ path: "src/app.js", sha256: "1".repeat(64), bytes: 10, matches: 1 }],
      matchedFileCount: 1,
      totalBytesScanned: 10,
    },
    expectedPath: "src/app.js",
  },
  context_read: {
    args: { path: "src/app.js", startLine: 1, maxLines: 10, format: "json" },
    result: {
      ok: true,
      path: "src/app.js",
      sha256: "2".repeat(64),
      bytes: 10,
      totalLines: 10,
      selectedRange: { startLine: 1, endLine: 10 },
      encoding: "utf-8",
      stableDuringRead: true,
      metadataBefore: { path: ABSOLUTE_PATH_CANARY },
      metadataAfter: { path: ABSOLUTE_PATH_CANARY },
      truncatedBefore: false,
      truncatedAfter: false,
      text: RAW_SOURCE_CANARY,
    },
    expectedPath: "src/app.js",
  },
  context_map: {
    args: { path: "src", includeSymbols: true },
    result: {
      path: "src",
      guidance: [{ path: "AGENTS.md", text: RAW_SOURCE_CANARY }],
      files: [{ path: "src/app.js", size: 10, language: "javascript", role: "source" }],
      directories: [{ path: "src", files: 1 }],
      languages: { javascript: 1 },
      roles: { source: 1 },
      manifests: [],
      ci: [],
      docs: [],
      tests: [],
      symbols: [{ path: "src/app.js", line: 1, kind: "function", name: RAW_SOURCE_CANARY, signature: RAW_SOURCE_CANARY }],
      symbolsCoverage: { note: RAW_SOURCE_CANARY },
    },
    expectedPath: "src/app.js",
  },
  context_batch_read: {
    args: { ranges: [{ path: "src/app.js", startLine: 1, maxLines: 10 }] },
    result: {
      results: [{
        path: "src/app.js",
        ok: true,
        sha256: "3".repeat(64),
        bytes: 10,
        totalLines: 10,
        selectedRange: { startLine: 1, endLine: 10 },
        encoding: "utf-8",
        stableDuringRead: true,
        metadataBefore: { path: ABSOLUTE_PATH_CANARY },
        metadataAfter: { path: ABSOLUTE_PATH_CANARY },
        truncatedBefore: false,
        truncatedAfter: false,
        text: RAW_SOURCE_CANARY,
      }],
      usedLines: 10,
    },
    expectedPath: "src/app.js",
  },
  context_symbols: {
    args: { path: "src", query: RAW_SEARCH_CANARY, kind: "function" },
    result: {
      path: "src",
      symbols: [{ path: "src/app.js", line: 2, kind: "function", name: RAW_SOURCE_CANARY, signature: RAW_SOURCE_CANARY }],
      semanticCoverage: { note: RAW_SOURCE_CANARY },
    },
    expectedPath: "src/app.js",
  },
  context_related: {
    args: { path: "src/app.js", relationshipKinds: ["likely-test"] },
    result: {
      target: "src/app.js",
      related: [{ path: "tests/app.test.js", relationship: "likely-test", confidence: "high", evidence: RAW_SOURCE_CANARY }],
      directImports: [],
      importedBy: [],
      likelyTests: [],
      sameBasename: [],
      siblings: [],
      semanticCoverage: { note: RAW_SOURCE_CANARY },
    },
    expectedPath: "src/app.js",
  },
};

function begin(toolId, sequence = 1, overrides = {}) {
  return beginContextReceiptOperation({
    receipt_id: `receipt-${sequence}`,
    sequence,
    previous_receipt_fingerprint: null,
    session_key: sessionKey,
    parent_session_key: null,
    producer_session_key: sessionKey,
    producer_role: "runner",
    run_id: "run-context",
    task_id: "task-context",
    worktree_fingerprint: worktreeFingerprint,
    source_fingerprint: sourceFingerprint,
    context_strategy_id: contextStrategy.strategy_id,
    context_strategy_fingerprint: contextStrategy.fingerprint,
    parent_question_id: null,
    evidence_refs: [],
    mutation_revision_started: 0,
    tool_id: toolId,
    call_key_fingerprint: digest(`call-${sequence}`),
    started_at: `2026-07-17T00:00:${String(sequence).padStart(2, "0")}.000Z`,
    args: toolCases[toolId]?.args ?? {},
    fingerprint_salt: salt,
    ...overrides,
  });
}

function complete(pending, output, overrides = {}) {
  return completeContextReceiptOperation(pending, {
    output,
    completed_at: "2026-07-17T00:01:00.000Z",
    mutation_revision_completed: 0,
    fingerprint_salt: salt,
    ...overrides,
  });
}

function successfulReceipt(toolId, sequence = 1, overrides = {}) {
  const pending = begin(toolId, sequence, overrides.begin);
  return complete(pending, envelope(toolId, toolCases[toolId].result), overrides.complete);
}

test("all eight context-tool adapters persist only bounded allowlisted evidence", () => {
  assert.deepEqual(Object.keys(toolCases).sort(), [...CONTEXT_TOOL_IDS].sort());
  for (const [toolId, specification] of Object.entries(toolCases)) {
    const pending = begin(toolId);
    const pendingText = JSON.stringify(pending);
    assert.equal(pendingText.includes(RAW_SEARCH_CANARY), false, `${toolId} pending query privacy`);
    assert.equal(pendingText.includes(salt), false, `${toolId} pending salt privacy`);
    const receipt = complete(pending, envelope(toolId, specification.result));
    validateContextReceipt(receipt);
    assert.equal(receipt.status, "success", toolId);
    assert.equal(receipt.tool_output_schema_version, 2, toolId);
    assert.equal(receipt.result.relative_paths.includes(specification.expectedPath), true, toolId);
    if (toolId === "context_outline") {
      assert.equal(receipt.result.relative_paths.includes("AGENTS.md"), true, "outline retains bounded guidance path metadata");
    }
    const persisted = JSON.stringify(receipt);
    for (const canary of [RAW_SOURCE_CANARY, RAW_SEARCH_CANARY, RAW_ERROR_CANARY, ABSOLUTE_PATH_CANARY, salt]) {
      assert.equal(persisted.includes(canary), false, `${toolId} leaked ${canary}`);
    }
  }
});

test("legacy and typed guidance normalize to bounded metadata without contents", () => {
  const legacy = complete(begin("context_outline"), envelope("context_outline", {
    ...toolCases.context_outline.result,
    guidance: ["AGENTS.md", "WORKFLOW.md"],
  }));
  assert.equal(legacy.status, "success");
  assert.deepEqual(legacy.result.guidance_paths, ["AGENTS.md", "WORKFLOW.md"]);
  assert.deepEqual(legacy.result.guidance_entries, []);

  const typed = complete(begin("context_outline"), envelope("context_outline", {
    ...toolCases.context_outline.result,
    guidance: ["docs/legacy-fallback.md"],
    guidanceEntries: [{
      path: "packages/api/AGENTS.md",
      kind: "agents",
      appliesTo: "packages/api",
      source: "discovered",
    }],
  }));
  assert.equal(typed.status, "success");
  assert.deepEqual(typed.result.guidance_paths, ["packages/api/AGENTS.md"]);
  assert.deepEqual(typed.result.guidance_entries, [{
    path: "packages/api/AGENTS.md",
    kind: "agents",
    applies_to: "packages/api",
    source: "discovered",
  }]);
  assert.equal(JSON.stringify(typed).includes("legacy-fallback"), false);

  const typedMap = complete(begin("context_map"), envelope("context_map", {
    ...toolCases.context_map.result,
    guidanceEntries: [{ path: "src/WORKFLOW.md", kind: "workflow", appliesTo: "src", source: "discovered" }],
  }));
  assert.equal(typedMap.status, "success");
  assert.deepEqual(typedMap.result.guidance_entries, [{
    path: "src/WORKFLOW.md",
    kind: "workflow",
    applies_to: "src",
    source: "discovered",
  }]);
});

test("informational truncation preserves complete successful coverage", () => {
  const middle = complete(begin("context_read", 1, {
    args: { path: "src/large.js", startLine: 100, maxLines: 21, format: "json" },
  }), envelope("context_read", {
    ...toolCases.context_read.result,
    path: "src/large.js",
    bytes: 5000,
    totalLines: 500,
    selectedRange: { startLine: 100, endLine: 120 },
    truncatedBefore: true,
    truncatedAfter: true,
  }));
  assert.equal(middle.status, "success");
  assert.equal(middle.reason_code, null);
  assert.equal(middle.result.coverage.partial, false);
  assert.equal(middle.result.coverage.complete, true);
  assert(middle.result.coverage.truncation_codes.includes("range_truncated_before"));
  assert(middle.result.coverage.truncation_codes.includes("range_truncated_after"));

  const excerpt = complete(begin("context_search"), envelope("context_search", {
    ...toolCases.context_search.result,
    matches: [{
      ...toolCases.context_search.result.matches[0],
      textTruncated: true,
    }],
  }, {
    coverage: {
      candidateFiles: 3,
      scannedFiles: 2,
      bytesScanned: 120,
      skippedSecret: 0,
      skippedGenerated: 0,
      skippedLarge: 0,
      skippedUnreadable: 0,
      unsupportedLanguages: {},
      truncation: truncation({ excerptTruncated: true }),
      truncationReasons: [],
      partial: false,
    },
  }));
  assert.equal(excerpt.status, "success");
  assert.equal(excerpt.result.coverage.partial, false);
  assert(excerpt.result.coverage.truncation_codes.includes("excerpt_truncated"));

  const inconsistent = complete(begin("context_search"), envelope("context_search", toolCases.context_search.result, {
    coverage: {
      candidateFiles: 3,
      scannedFiles: 2,
      bytesScanned: 120,
      skippedSecret: 0,
      skippedGenerated: 0,
      skippedLarge: 0,
      skippedUnreadable: 0,
      unsupportedLanguages: {},
      truncation: truncation({ matchLimitReached: true }),
      truncationReasons: [],
      partial: false,
    },
  }));
  assert.equal(inconsistent.status, "failed");
  assert.equal(inconsistent.reason_code, "unsupported_schema");
});

test("secret policy permits only the exact .env.example exception", () => {
  const allowed = complete(begin("context_read", 1, {
    args: { path: ".env.example", startLine: 1, maxLines: 1, format: "json" },
  }), envelope("context_read", {
    ...toolCases.context_read.result,
    path: ".env.example",
    bytes: 8,
    totalLines: 1,
    selectedRange: { startLine: 1, endLine: 1 },
  }));
  assert.equal(allowed.status, "success");
  assert(allowed.result.relative_paths.includes(".env.example"));
  for (const secret of [".env", ".env.local", ".env.production"]) {
    expectContract(
      () => begin("context_read", 1, { args: { path: secret, format: "json" } }),
      "CONTEXT_RECEIPT_SECRET_PATH",
    );
  }
  for (const secretDescendant of [".env.example/private.key", ".Env.Example/nested.txt"]) {
    expectContract(
      () => begin("context_read", 1, { args: { path: secretDescendant, format: "json" } }),
      "CONTEXT_RECEIPT_SECRET_PATH",
    );
  }
  expectContract(
    () => begin("context_read", 1, { args: { path: ".oc_harness/private/runtime.json", format: "json" } }),
    "CONTEXT_RECEIPT_CONTROL_PATH",
  );
});

test("authorizing request bindings are salted, explicit, and additive to early v3 receipts", () => {
  const expectedSha256 = "2".repeat(64);
  const expectedSnapshot = createHash("sha256").update("context_files-snapshot").digest("hex");
  const boundRead = begin("context_read", 1, {
    args: {
      path: "src/app.js",
      startLine: 1,
      maxLines: 10,
      expectedSha256,
      format: "json",
    },
  });
  assert.match(boundRead.request.ranges[0].expected_content_version_fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(boundRead.request).includes(expectedSha256), false);

  const boundPage = begin("context_files", 1, {
    args: {
      path: "src",
      pageSize: 2,
      afterPath: "src/a.js",
      expectedSnapshotFingerprint: expectedSnapshot,
      requireStableSnapshot: true,
    },
  });
  assert.equal(boundPage.request.after_path, "src/a.js");
  assert.equal(boundPage.request.expected_snapshot_fingerprint, `sha256:${expectedSnapshot}`);
  assert.equal(boundPage.request.require_stable_snapshot, true);

  const acceptedRead = complete(boundRead, envelope("context_read", toolCases.context_read.result));
  assert.equal(acceptedRead.status, "success");
  const wrongRead = complete(begin("context_read", 1, {
    args: { ...toolCases.context_read.args, expectedSha256: "4".repeat(64) },
  }), envelope("context_read", toolCases.context_read.result));
  assert.equal(wrongRead.reason_code, "unsupported_schema");

  const acceptedSearch = complete(begin("context_search", 1, {
    args: { ...toolCases.context_search.args, expectedSnapshotFingerprint: expectedSnapshot },
  }), envelope("context_search", {
    ...toolCases.context_search.result,
    verifiedSnapshotFingerprint: expectedSnapshot,
  }));
  assert.equal(acceptedSearch.status, "success");
  const wrongSearch = complete(begin("context_search", 1, {
    args: { ...toolCases.context_search.args, expectedSnapshotFingerprint: expectedSnapshot },
  }), envelope("context_search", {
    ...toolCases.context_search.result,
    verifiedSnapshotFingerprint: "5".repeat(64),
  }));
  assert.equal(wrongSearch.reason_code, "unsupported_schema");

  const legacyBody = structuredClone(successfulReceipt("context_read"));
  delete legacyBody.fingerprint;
  delete legacyBody.request.after_path;
  delete legacyBody.request.expected_snapshot_fingerprint;
  delete legacyBody.request.require_stable_snapshot;
  for (const range of legacyBody.request.ranges) delete range.expected_content_version_fingerprint;
  const legacyReceipt = createContextReceipt(legacyBody);
  validateContextReceipt(legacyReceipt);
  assert.equal(legacyReceipt.schema_version, CONTEXT_RECEIPT_SCHEMA_VERSION);
});

test("producer contract metadata is additive and incompatible contracts fail clearly", () => {
  const metadata = {
    producer: "opencode-recursive-context",
    producerVersion: "0.2.0",
    contractVersion: "2.0",
    policyVersion: 1,
  };
  assert.equal(complete(begin("context_files"), envelope("context_files", toolCases.context_files.result)).status, "success");
  assert.equal(complete(begin("context_files"), envelope("context_files", toolCases.context_files.result, metadata)).status, "success");
  for (const incompatible of [
    { ...metadata, producer: "unknown-producer" },
    { ...metadata, contractVersion: "3.0" },
    { producer: metadata.producer },
  ]) {
    const receipt = complete(begin("context_files"), envelope("context_files", toolCases.context_files.result, incompatible));
    assert.equal(receipt.status, "failed");
    assert.equal(receipt.reason_code, "unsupported_contract");
  }
});

test("adapter receipts fail closed when output exceeds the exact normalized request", () => {
  const unsupported = (pending, output) => {
    const receipt = complete(pending, output);
    assert.equal(receipt.status, "failed");
    assert.equal(receipt.reason_code, "unsupported_schema");
    return receipt;
  };
  unsupported(begin("context_related"), envelope("context_related", {
    ...toolCases.context_related.result,
    target: "src/other.js",
  }));
  unsupported(begin("context_related"), envelope("context_related", {
    ...toolCases.context_related.result,
    related: [{ path: "src/dependency.js", relationship: "direct-import", confidence: "high" }],
  }));
  unsupported(begin("context_related", 1, {
    args: { path: "src/app.js", scopePath: "src", relationshipKinds: ["likely-test"] },
  }), envelope("context_related", {
    ...toolCases.context_related.result,
    related: [{ path: "tests/app.test.js", relationship: "likely-test", confidence: "high" }],
  }));
  unsupported(begin("context_related", 1, {
    args: { path: "src/app.js", relationshipKinds: ["likely-test"], extensions: [".js"] },
  }), envelope("context_related", {
    ...toolCases.context_related.result,
    related: [{ path: "src/app.test.ts", relationship: "likely-test", confidence: "high" }],
  }));
  unsupported(begin("context_related", 1, {
    args: { path: "src/app.js", maxResults: 1, relationshipKinds: ["likely-test"] },
  }), envelope("context_related", {
    ...toolCases.context_related.result,
    related: [
      { path: "src/app-a.test.js", relationship: "likely-test", confidence: "high" },
      { path: "src/app-b.test.js", relationship: "likely-test", confidence: "high" },
    ],
  }));
  unsupported(begin("context_files", 1, {
    args: { path: "src", limit: 1 },
  }), envelope("context_files", {
    files: [{ path: "src/app.js" }, { path: "src/other.js" }],
  }));
  for (const result of [
    { ...toolCases.context_read.result, path: "src/other.js" },
    { ...toolCases.context_read.result, selectedRange: { startLine: 1, endLine: 11 } },
    {
      ...toolCases.context_read.result,
      selectedRange: { startLine: 1, endLine: 5 },
      truncatedAfter: true,
    },
  ]) unsupported(begin("context_read"), envelope("context_read", result));
  unsupported(begin("context_batch_read"), envelope("context_batch_read", {
    results: [{
      ...toolCases.context_batch_read.result.results[0],
      path: "src/unrequested.js",
    }],
    usedLines: 10,
  }));

  const samePathArgs = {
    ranges: [
      { path: "src/app.js", startLine: 1, maxLines: 5 },
      { path: "src/app.js", startLine: 11, maxLines: 5 },
    ],
  };
  const samePathResult = (startLine, endLine) => ({
    path: "src/app.js",
    ok: true,
    sha256: "3".repeat(64),
    bytes: 20,
    totalLines: 20,
    selectedRange: { startLine, endLine },
    encoding: "utf-8",
    stableDuringRead: true,
    truncatedBefore: startLine > 1,
    truncatedAfter: endLine < 20,
    text: RAW_SOURCE_CANARY,
  });
  const samePathEnvelope = (results) => envelope("context_batch_read", {
    results,
    usedLines: results.reduce((total, entry) => total + entry.selectedRange.endLine - entry.selectedRange.startLine + 1, 0),
  });
  const samePathAccepted = complete(
    begin("context_batch_read", 1, { args: samePathArgs }),
    samePathEnvelope([samePathResult(1, 5), samePathResult(11, 15)]),
  );
  assert.equal(samePathAccepted.status, "success");
  assert.equal(samePathAccepted.reason_code, null);
  assert.notEqual(samePathAccepted.reason_code, "unsupported_schema");
  unsupported(
    begin("context_batch_read", 1, { args: samePathArgs }),
    samePathEnvelope([samePathResult(6, 10)]),
  );

  const reordered = complete(
    begin("context_batch_read", 1, { args: samePathArgs }),
    samePathEnvelope([samePathResult(11, 15), samePathResult(1, 5)]),
  );
  assert.equal(reordered.status, "success");
  unsupported(
    begin("context_batch_read", 1, { args: samePathArgs }),
    samePathEnvelope([samePathResult(1, 5), samePathResult(1, 5)]),
  );

  unsupported(
    begin("context_batch_read", 1, {
      args: { ranges: [{ path: "src/app.js", startLine: 1, maxLines: 10, expectedSha256: "4".repeat(64) }] },
    }),
    envelope("context_batch_read", toolCases.context_batch_read.result),
  );
  unsupported(
    begin("context_batch_read", 1, {
      args: { ranges: [{ path: "src/app.js", expectedSha256: "a".repeat(64) }] },
    }),
    envelope("context_batch_read", {
      results: [{
        path: "src/app.js",
        ok: false,
        error: "hash-mismatch",
        expectedSha256: "b".repeat(64),
        actualSha256: "c".repeat(64),
      }],
      usedLines: 0,
    }),
  );
});

test("pagination and failure outputs remain bound to the exact request", () => {
  const unsupported = (pending, output) => {
    const receipt = complete(pending, output);
    assert.equal(receipt.reason_code, "unsupported_schema");
  };
  const snapshot = createHash("sha256").update("context_files-snapshot").digest("hex");
  const files = [{ path: "src/a.js", size: 1 }, { path: "src/b.js", size: 1 }];
  unsupported(
    begin("context_files", 1, { args: { path: "src", limit: 10, pageSize: 2 } }),
    envelope("context_files", { files }),
  );
  const firstPage = complete(
    begin("context_files", 1, { args: { path: "src", limit: 10, pageSize: 2 } }),
    envelope("context_files", { files, hasMore: true, nextAfterPath: "src/b.js" }),
  );
  assert.equal(firstPage.status, "truncated");
  assert.equal(firstPage.reason_code, "partial_coverage");
  assert(firstPage.result.coverage.truncation_codes.includes("pagination_page"));
  const unsolicitedContinuation = complete(
    begin("context_files", 1, { args: { path: "src", limit: 10 } }),
    envelope("context_files", { files, hasMore: true, nextAfterPath: "src/b.js" }),
  );
  assert.equal(unsolicitedContinuation.status, "truncated");
  assert(unsolicitedContinuation.result.coverage.truncation_codes.includes("pagination_page"));

  const continuedRequest = {
    path: "src",
    limit: 10,
    pageSize: 2,
    afterPath: "src/a.js",
    expectedSnapshotFingerprint: snapshot,
  };
  const continued = complete(
    begin("context_files", 1, { args: continuedRequest }),
    envelope("context_files", { files: [{ path: "src/b.js", size: 1 }], hasMore: false, nextAfterPath: null }),
  );
  assert.equal(continued.status, "truncated");
  assert.equal(continued.reason_code, "partial_coverage");
  assert(continued.result.coverage.truncation_codes.includes("pagination_page"));
  unsupported(
    begin("context_files", 1, { args: continuedRequest }),
    envelope("context_files", { files: [{ path: "src/a.js", size: 1 }], hasMore: false, nextAfterPath: null }),
  );
  unsupported(
    begin("context_files", 1, { args: { ...continuedRequest, expectedSnapshotFingerprint: "6".repeat(64) } }),
    envelope("context_files", { files: [{ path: "src/b.js", size: 1 }], hasMore: false, nextAfterPath: null }),
  );
  unsupported(
    begin("context_files"),
    envelope("context_files", { ok: false, error: "cursor-mismatch" }),
  );
  unsupported(
    begin("context_files", 1, {
      args: { path: "src", expectedSnapshotFingerprint: "7".repeat(64) },
    }),
    envelope("context_files", {
      ok: false,
      error: "snapshot-mismatch",
      expectedSnapshotFingerprint: "8".repeat(64),
      actualSnapshotFingerprint: snapshot,
    }),
  );

  const directFailure = complete(begin("context_read", 1, {
    args: { path: "src/app.js", expectedSha256: "a".repeat(64), format: "json" },
  }), envelope("context_read", {
    ok: false,
    error: "hash-mismatch",
    path: "src/app.js",
    expectedSha256: "a".repeat(64),
    actualSha256: "b".repeat(64),
  }));
  assert.equal(directFailure.reason_code, "hash_mismatch");
  unsupported(
    begin("context_read", 1, {
      args: { path: "src/app.js", expectedSha256: "a".repeat(64), format: "json" },
    }),
    envelope("context_read", {
      ok: false,
      error: "hash-mismatch",
      path: "src/app.js",
      expectedSha256: "c".repeat(64),
      actualSha256: "b".repeat(64),
    }),
  );
});

test("unstable reads and undeclared skipped content cannot authorize evidence", () => {
  const unstableRead = complete(begin("context_read"), envelope("context_read", {
    ...toolCases.context_read.result,
    stableDuringRead: false,
  }));
  assert.equal(unstableRead.reason_code, "unsupported_schema");
  const unstableBatch = complete(begin("context_batch_read"), envelope("context_batch_read", {
    ...toolCases.context_batch_read.result,
    results: [{ ...toolCases.context_batch_read.result.results[0], stableDuringRead: false }],
  }));
  assert.equal(unstableBatch.reason_code, "unsupported_schema");

  const forgedBody = structuredClone(successfulReceipt("context_read"));
  delete forgedBody.fingerprint;
  forgedBody.result.content_ranges[0].stable = false;
  expectContract(() => createContextReceipt(forgedBody), "CONTEXT_RECEIPT_RANGE_UNTRUSTED");

  const coverage = (partial) => ({
    candidateFiles: 3,
    scannedFiles: 1,
    bytesScanned: 120,
    skippedSecret: 0,
    skippedGenerated: 0,
    skippedLarge: 1,
    skippedUnreadable: 1,
    unsupportedLanguages: {},
    truncation: truncation({ coveragePartial: partial }),
    truncationReasons: partial ? ["skipped-large", "skipped-unreadable"] : [],
    partial,
  });
  const undeclared = complete(begin("context_files"), envelope(
    "context_files",
    { files: [{ path: "src/app.js", size: 10 }] },
    { coverage: coverage(false) },
  ));
  assert.equal(undeclared.reason_code, "unsupported_schema");
  const declared = complete(begin("context_files"), envelope(
    "context_files",
    { files: [{ path: "src/app.js", size: 10 }] },
    { coverage: coverage(true), truncated: true },
  ));
  assert.equal(declared.status, "truncated");
  assert.equal(declared.reason_code, "partial_coverage");
});

test("typed batch failures cannot coexist with complete success or an untyped partial failure", () => {
  const forgedSuccess = structuredClone(successfulReceipt("context_batch_read"));
  delete forgedSuccess.fingerprint;
  forgedSuccess.result.item_failures = [{ path: "src/app.js", reason_code: "hash_mismatch" }];
  expectContract(() => createContextReceipt(forgedSuccess), "CONTEXT_RECEIPT_ITEM_FAILURE");

  const forgedPartial = structuredClone(successfulReceipt("context_batch_read"));
  delete forgedPartial.fingerprint;
  forgedPartial.status = "truncated";
  forgedPartial.reason_code = "partial_tool_failure";
  forgedPartial.result.coverage.partial = true;
  forgedPartial.result.coverage.complete = false;
  expectContract(() => createContextReceipt(forgedPartial), "CONTEXT_RECEIPT_ITEM_FAILURE");
});

test("outline guidance overflow is bounded and explicitly truncated", () => {
  const guidance = Array.from({ length: 129 }, (_, index) => ({ path: `docs/guidance-${index}.md` }));
  const receipt = complete(begin("context_outline"), envelope("context_outline", {
    guidance,
    filesSample: [],
    tools: [...CONTEXT_TOOL_IDS],
    toolset: "advanced",
    explicitEnabledTools: [],
  }));
  assert.equal(receipt.status, "truncated");
  assert.equal(receipt.reason_code, "partial_coverage");
  assert.equal(receipt.result.guidance_paths.length, 128);
  assert(receipt.result.coverage.truncation_codes.includes("receipt_path_limit"));
});

test("create operation seals a validated runner-owned body", () => {
  const original = successfulReceipt("context_files");
  const body = structuredClone(original);
  delete body.fingerprint;
  const recreated = createContextReceipt(body);
  assert.equal(recreated.fingerprint, original.fingerprint);
  assert.equal(recreated.producer, CONTEXT_RECEIPT_PRODUCER);
  assert.equal(recreated.schema_version, CONTEXT_RECEIPT_SCHEMA_VERSION);
  assert.equal(Object.isFrozen(recreated), true);
});

test("producer provenance distinguishes an owner, runner, and serialized child without trusting prose", () => {
  const childSessionKey = "b".repeat(64);
  const childPending = begin("context_files", 1, {
    parent_session_key: sessionKey,
    producer_session_key: childSessionKey,
    producer_role: "explore",
  });
  const childReceipt = complete(childPending, envelope("context_files", toolCases.context_files.result));
  assert.equal(childReceipt.session_key, sessionKey);
  assert.equal(childReceipt.parent_session_key, sessionKey);
  assert.equal(childReceipt.producer_session_key, childSessionKey);
  assert.equal(childReceipt.producer_role, "explore");
  for (const overrides of [
    { parent_session_key: null, producer_session_key: childSessionKey, producer_role: "explore" },
    { parent_session_key: sessionKey, producer_session_key: sessionKey, producer_role: "reviewer" },
    { parent_session_key: null, producer_session_key: childSessionKey, producer_role: "runner" },
  ]) {
    assert.throws(
      () => begin("context_files", 1, overrides),
      (error) => error?.code === "CONTEXT_RECEIPT_PRODUCER_BINDING",
    );
  }
});

test("empty, truncated, timeout, unavailable, failed, and interrupted remain distinct", () => {
  const empty = complete(begin("context_files"), envelope("context_files", { files: [] }));
  assert.equal(empty.status, "empty");

  const partial = complete(begin("context_search"), envelope("context_search", {
    query: RAW_SEARCH_CANARY,
    scanned: 1,
    matches: [],
    matchedFiles: [],
  }, {
    coverage: {
      candidateFiles: 3,
      scannedFiles: 1,
      bytesScanned: 10,
      skippedSecret: 0,
      skippedGenerated: 0,
      skippedLarge: 0,
      skippedUnreadable: 0,
      unsupportedLanguages: {},
      truncation: truncation({ matchLimitReached: true, coveragePartial: true }),
      truncationReasons: [RAW_ERROR_CANARY],
      partial: true,
    },
    truncated: true,
  }));
  assert.equal(partial.status, "truncated");
  assert.equal(partial.reason_code, "partial_coverage");
  assert.equal(JSON.stringify(partial).includes(RAW_ERROR_CANARY), false);

  const semanticPartial = complete(begin("context_related"), envelope("context_related", toolCases.context_related.result, {
    snapshot: {
      fingerprint: createHash("sha256").update("context_related-partial-snapshot").digest("hex"),
      fingerprintKind: "metadata",
      fingerprintScope: ".",
      complete: false,
      stable: true,
      changedDuringOperation: false,
      truncationReasons: [],
    },
    coverage: {
      candidateFiles: 3,
      scannedFiles: 2,
      bytesScanned: 120,
      skippedSecret: 0,
      skippedGenerated: 0,
      skippedLarge: 0,
      skippedUnreadable: 0,
      unsupportedLanguages: {},
      truncation: truncation({ relationshipLimitReached: true, coveragePartial: true }),
      truncationReasons: [],
      partial: true,
    },
    truncated: true,
  }));
  assert.equal(semanticPartial.status, "truncated");
  assert.equal(semanticPartial.reason_code, "partial_coverage");
  assert(semanticPartial.result.coverage.truncation_codes.includes("relationship_limit_reached"));

  const timeout = complete(begin("context_files"), envelope("context_files", {
    ok: false,
    error: "deadline-exceeded",
  }));
  assert.equal(timeout.status, "timeout");
  assert.equal(timeout.reason_code, "deadline_exceeded");

  for (const [status, reason] of [
    ["unavailable", "tool_unavailable"],
    ["failed", "tool_failed"],
    ["interrupted", "host_interrupted"],
  ]) {
    const receipt = failContextReceiptOperation(begin("context_files"), {
      status,
      reason_code: reason,
      completed_at: "2026-07-17T00:01:00.000Z",
      mutation_revision_completed: 0,
    });
    assert.equal(receipt.status, status);
    assert.equal(receipt.reason_code, reason);
    assert.equal(receipt.result, null);
  }
});

test("schema v2 is mandatory and unsupported output fails honestly", () => {
  const wrongVersion = complete(begin("context_files"), JSON.stringify({ schemaVersion: 1, tool: "context_files" }));
  assert.equal(wrongVersion.status, "failed");
  assert.equal(wrongVersion.reason_code, "unsupported_schema");
  assert.equal(wrongVersion.tool_output_schema_version, null);
  assert.equal(wrongVersion.result, null);

  const legacyText = complete(begin("context_read"), `path: src/app.js\n\n${RAW_SOURCE_CANARY}`);
  assert.equal(legacyText.status, "failed");
  assert.equal(legacyText.reason_code, "unsupported_schema");
  assert.equal(JSON.stringify(legacyText).includes(RAW_SOURCE_CANARY), false);

  const oversized = complete(begin("context_files"), envelope("context_files", { files: [], ignored: RAW_SOURCE_CANARY.repeat(20) }), {
    adapter_limits: { outputBytes: 128 },
  });
  assert.equal(oversized.status, "failed");
  assert.equal(oversized.reason_code, "output_too_large");
});

test("batch arbitrary errors and family raw fields never cross the allowlist", () => {
  const receipt = complete(begin("context_batch_read"), envelope("context_batch_read", {
    results: [{ path: "src/app.js", ok: false, error: RAW_ERROR_CANARY }],
    usedLines: 0,
  }));
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.reason_code, "tool_failed");
  assert.deepEqual(receipt.result.item_failures, [{ path: "src/app.js", reason_code: "tool_failed" }]);
  assert.equal(JSON.stringify(receipt).includes(RAW_ERROR_CANARY), false);

  const typedFailures = complete(begin("context_batch_read", 1, {
    args: { ranges: [
      { path: "src/hash.js", expectedSha256: "a".repeat(64) },
      { path: "src/bytes.js" },
      { path: "src/lines.js" },
    ] },
  }), envelope("context_batch_read", {
    results: [
      {
        path: "src/hash.js",
        ok: false,
        error: "hash-mismatch",
        expectedSha256: "a".repeat(64),
        actualSha256: "b".repeat(64),
      },
      { path: "src/bytes.js", ok: false, error: "byte-limit-reached" },
      { path: "src/lines.js", ok: false, error: "line-limit-reached" },
    ],
    usedLines: 0,
  }));
  assert.equal(typedFailures.status, "failed");
  assert.equal(typedFailures.reason_code, "tool_failed");
  assert.deepEqual(typedFailures.result.item_failures, [
    { path: "src/bytes.js", reason_code: "byte_limit_reached" },
    { path: "src/hash.js", reason_code: "hash_mismatch" },
    { path: "src/lines.js", reason_code: "line_limit_reached" },
  ]);
});

test("runner bindings reject unsafe paths, unknown args, raw failure payloads, and mutation races", () => {
  expectContract(() => begin("context_read", 1, { args: { path: ABSOLUTE_PATH_CANARY, format: "json" } }), "PRIVACY_PATH");
  expectContract(() => begin("context_read", 1, { args: { path: ".env", format: "json" } }), "CONTEXT_RECEIPT_SECRET_PATH");
  expectContract(() => begin("context_files", 1, { args: { path: "src", raw: RAW_SOURCE_CANARY } }), "CONTEXT_RECEIPT_REQUEST_FIELD");
  expectContract(() => begin("context_read", 1, { args: { path: "src/app.js", startLine: 1, maxLines: 501 } }), "CONTEXT_RECEIPT_INTEGER");
  expectContract(() => failContextReceiptOperation(begin("context_files"), {
    status: "failed",
    reason_code: "tool_failed",
    completed_at: "2026-07-17T00:01:00.000Z",
    mutation_revision_completed: 0,
    error: RAW_ERROR_CANARY,
  }), "CONTRACT_UNKNOWN_FIELD");

  const raced = complete(begin("context_files"), envelope("context_files", { files: [{ path: "src/app.js", size: 1 }] }), {
    mutation_revision_completed: 1,
  });
  assert.equal(raced.status, "failed");
  assert.equal(raced.reason_code, "mutation_during_context");

  const secretOutput = complete(begin("context_files"), envelope("context_files", { files: [{ path: ".env", size: 1 }] }));
  assert.equal(secretOutput.status, "failed");
  assert.equal(secretOutput.reason_code, "unsupported_schema");

  const original = successfulReceipt("context_files");
  const unsafeBody = structuredClone(original);
  delete unsafeBody.fingerprint;
  unsafeBody.request.scope_paths = ["credentials.json"];
  expectContract(() => createContextReceipt(unsafeBody), "CONTEXT_RECEIPT_SECRET_PATH");

  const oversizedRange = structuredClone(successfulReceipt("context_read"));
  delete oversizedRange.fingerprint;
  oversizedRange.result.content_ranges[0] = {
    ...oversizedRange.result.content_ranges[0],
    end_line: 501,
    total_lines: 501,
    range_truncated_after: false,
  };
  expectContract(() => createContextReceipt(oversizedRange), "CONTEXT_RECEIPT_RANGE");
});

test("same-session and pre-mutation validators reject cross-run and post-mutation evidence", () => {
  const receipt = successfulReceipt("context_files");
  assert.equal(assertSameSessionContextReceipt(receipt, {
    session_key: sessionKey,
    run_id: "run-context",
    task_id: "task-context",
    worktree_fingerprint: worktreeFingerprint,
    source_fingerprint: sourceFingerprint,
  }), receipt);
  assert.equal(assertPreMutationContextReceipt(receipt, {
    session_key: sessionKey,
    run_id: "run-context",
    task_id: "task-context",
    worktree_fingerprint: worktreeFingerprint,
    source_fingerprint: sourceFingerprint,
    current_mutation_revision: 0,
    first_mutation_at: "2026-07-17T00:02:00.000Z",
  }), receipt);
  expectContract(() => assertSameSessionContextReceipt(receipt, {
    session_key: "b".repeat(64),
    run_id: "run-context",
    worktree_fingerprint: worktreeFingerprint,
  }), "CONTEXT_RECEIPT_SESSION_MISMATCH");
  expectContract(() => assertPreMutationContextReceipt(receipt, {
    session_key: sessionKey,
    run_id: "run-context",
    task_id: "task-context",
    worktree_fingerprint: worktreeFingerprint,
    source_fingerprint: sourceFingerprint,
    current_mutation_revision: 1,
    first_mutation_at: "2026-07-17T00:00:30.000Z",
  }), "CONTEXT_RECEIPT_POST_MUTATION");
});

function chainedReceipt(toolId, sequence, previous, callSeed, receiptId = `receipt-${sequence}`) {
  return successfulReceipt(toolId, sequence, {
    begin: {
      receipt_id: receiptId,
      previous_receipt_fingerprint: previous,
      call_key_fingerprint: digest(callSeed),
    },
  });
}

function allFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else result.push(target);
    }
  }
  return result;
}

test("immutable bounded store publishes, inspects, detects duplicates, and persists no raw canaries", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-context-receipts-"));
  try {
    const store = createContextReceiptStore({
      workspaceRoot: workspace,
      limits: {
        maxReceiptsPerSession: 3,
        maxReceiptBytes: 64 * 1024,
        maxSessionBytes: 192 * 1024,
        maxSessions: 2,
        maxStoreBytes: 384 * 1024,
      },
    });
    const first = chainedReceipt("context_search", 1, null, "store-call-1");
    assert.equal(store.publishReceipt(first).duplicate, false);
    assert.equal(store.publishReceipt(first).duplicate, true);
    assert.equal(store.readReceipt(sessionKey, first.receipt_id).fingerprint, first.fingerprint);

    const second = chainedReceipt("context_search", 2, first.fingerprint, "store-call-2");
    assert.equal(store.publishReceipt(second).duplicate, false);
    const inspected = store.inspectSession(sessionKey);
    assert.equal(inspected.receipt_count, 2);
    assert.equal(inspected.latest_receipt_fingerprint, second.fingerprint);
    assert.equal(inspected.duplicate_results.length, 1, "same salted output is reported as duplicate evidence");
    assert.equal(store.inspectIndex().receipt_count, 2);

    const conflictingId = chainedReceipt("context_files", 3, second.fingerprint, "store-call-3", first.receipt_id);
    expectContract(() => store.publishReceipt(conflictingId), "CONTEXT_RECEIPT_DUPLICATE_CONFLICT");
    const duplicateCall = chainedReceipt("context_files", 3, second.fingerprint, "store-call-2");
    expectContract(() => store.publishReceipt(duplicateCall), "CONTEXT_RECEIPT_DUPLICATE_CALL");

    const third = chainedReceipt("context_files", 3, second.fingerprint, "store-call-3");
    store.publishReceipt(third);
    const fourth = chainedReceipt("context_files", 4, third.fingerprint, "store-call-4");
    expectContract(() => store.publishReceipt(fourth), "CONTEXT_RECEIPT_STORE_QUOTA");

    const persisted = allFiles(path.join(workspace, ".oc_harness"))
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");
    for (const canary of [RAW_SOURCE_CANARY, RAW_SEARCH_CANARY, RAW_ERROR_CANARY, ABSOLUTE_PATH_CANARY, salt]) {
      assert.equal(persisted.includes(canary), false, `store leaked ${canary}`);
    }
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("store inspection rejects modified immutable artifacts", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-context-receipts-tamper-"));
  try {
    const store = createContextReceiptStore({ workspaceRoot: workspace });
    store.publishReceipt(chainedReceipt("context_files", 1, null, "tamper-call"));
    const receiptFile = allFiles(path.join(workspace, ".oc_harness"))
      .find((file) => file.endsWith(".json"));
    assert.ok(receiptFile);
    const value = JSON.parse(fs.readFileSync(receiptFile, "utf8"));
    value.task_id = "tampered-task";
    fs.writeFileSync(receiptFile, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    expectContract(() => store.inspectSession(sessionKey), "CONTEXT_RECEIPT_FINGERPRINT");
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("schema file is closed and aligned with the runtime receipt surface", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(root, "quality", "schemas", "context-receipt.schema.json"), "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema_version.const, CONTEXT_RECEIPT_SCHEMA_VERSION);
  assert.equal(schema.properties.producer.const, CONTEXT_RECEIPT_PRODUCER);
  assert.deepEqual(schema.$defs.toolId.enum, CONTEXT_TOOL_IDS);
  assert.deepEqual(Object.keys(schema.properties), schema.required);
  for (const definition of ["request", "snapshot", "lineRange", "symbolId", "relationship", "counts", "coverage", "result"]) {
    assert.equal(schema.$defs[definition].additionalProperties, false, `${definition} must be closed`);
  }
});

test("direct adapter API rejects unsupported tools and preserves bounded failure results", () => {
  expectContract(() => adaptContextToolOutput("read", "{}", { fingerprintSalt: salt }), "CONTEXT_RECEIPT_TOOL");
  const failure = adaptContextToolOutput("context_files", JSON.stringify({ schemaVersion: 99 }), { fingerprintSalt: salt });
  assert.equal(failure.status, "failed");
  assert.equal(failure.reason_code, "unsupported_schema");
  assert.match(failure.result_fingerprint, /^sha256:[0-9a-f]{64}$/);
});

let failures = 0;
for (const entry of tests) {
  try {
    entry.callback();
    console.log(`ok - ${entry.name}`);
  } catch (error) {
    failures++;
    console.error(`not ok - ${entry.name}`);
    console.error(error?.stack ?? error);
  }
}

if (failures > 0) {
  console.error(`Context receipt verification failed (${failures}/${tests.length}).`);
  process.exit(1);
}

console.log(`Context receipt verification passed (${tests.length} focused cases).`);
