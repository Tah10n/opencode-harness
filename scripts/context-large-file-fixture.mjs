import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  beginContextReceiptOperation,
  completeContextReceiptOperation,
} from "../lib/quality/context-receipts.mjs";
import { CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION } from "../lib/quality/context-tool-adapters.mjs";
import { fingerprint } from "../lib/quality/validation.mjs";
import {
  CONTEXT_TEST_SESSION_KEY,
  CONTEXT_TEST_WORKSPACE,
} from "./context-test-fixtures.mjs";

export const LARGE_CONTEXT_LINE_COUNT = 1200;
export const LARGE_CONTEXT_RELATIVE_PATH = "fixtures/context-large-excluded-sibling.mjs";
export const LARGE_CONTEXT_FINGERPRINT_SALT = "context-large-file-verifier-salt-2026";

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

export function createLargeContextFileFixture(directory) {
  const absolutePath = path.join(directory, ...LARGE_CONTEXT_RELATIVE_PATH.split("/"));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const lines = Array.from({ length: LARGE_CONTEXT_LINE_COUNT }, (_, index) => {
    const id = index + 1;
    const parity = id % 2 === 0 ? "even" : "odd";
    return `export const branch${String(id).padStart(4, "0")} = Object.freeze({ id: ${id}, parity: "${parity}" });`;
  });
  const source = lines.join("\n");
  fs.writeFileSync(absolutePath, source, "utf8");
  const observed = fs.readFileSync(absolutePath, "utf8");
  const observedLines = observed.split("\n");
  if (observedLines.length !== LARGE_CONTEXT_LINE_COUNT || observedLines.some((line) => line.length === 0)) {
    throw new Error("large context fixture must contain exactly 1,200 meaningful lines");
  }
  return Object.freeze({
    absolute_path: absolutePath,
    relative_path: LARGE_CONTEXT_RELATIVE_PATH,
    lines: Object.freeze(observedLines),
    bytes: Buffer.byteLength(observed, "utf8"),
    sha256: createHash("sha256").update(observed).digest("hex"),
  });
}

function rangeEnvelope(fixture, {
  startLine,
  endLine,
  fullFileSha256,
  totalLines,
  snapshotStable,
  changedDuringOperation,
  stableDuringRead,
  truncationOverrides,
}) {
  const coverageLimitReached = [
    "inventoryLimitReached", "resultLimitReached", "matchLimitReached", "byteLimitReached",
    "lineLimitReached", "durationLimitReached", "symbolLimitReached", "relationshipLimitReached",
  ].some((key) => truncationOverrides[key] === true);
  const coveragePartial = coverageLimitReached || !snapshotStable || changedDuringOperation;
  const text = fixture.lines.slice(startLine - 1, endLine).join("\n");
  const selectedBytes = Buffer.byteLength(text, "utf8");
  return JSON.stringify({
    schemaVersion: CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION,
    tool: "context_read",
    worktree: ".",
    scope: { path: fixture.relative_path, filters: {} },
    snapshot: {
      fingerprint: createHash("sha256").update(`snapshot:${fullFileSha256}`).digest("hex"),
      fingerprintKind: "content",
      fingerprintScope: fixture.relative_path,
      complete: !(!snapshotStable || changedDuringOperation),
      stable: snapshotStable,
      changedDuringOperation,
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
      truncation: truncation({
        ...truncationOverrides,
        snapshotChanged: !snapshotStable || changedDuringOperation,
        coveragePartial,
      }),
      truncationReasons: [],
      partial: coveragePartial,
    },
    limits: { maxLines: endLine - startLine + 1 },
    usage: { files: 1, directories: 0, bytes: selectedBytes, lines: endLine - startLine + 1, matches: 0, ranges: 1 },
    truncated: coveragePartial,
    ok: true,
    path: fixture.relative_path,
    sha256: fullFileSha256,
    bytes: fixture.bytes,
    totalLines,
    selectedRange: { startLine, endLine },
    encoding: "utf-8",
    stableDuringRead,
    truncatedBefore: startLine > 1,
    truncatedAfter: endLine < totalLines,
    text,
  });
}

function failureEnvelope(fixture, { error, expectedSha256 }) {
  return JSON.stringify({
    schemaVersion: CONTEXT_TOOL_OUTPUT_SCHEMA_VERSION,
    tool: "context_read",
    worktree: ".",
    scope: { path: fixture.relative_path, filters: {} },
    snapshot: {
      fingerprint: createHash("sha256").update(`snapshot:${fixture.sha256}`).digest("hex"),
      fingerprintKind: "content",
      fingerprintScope: fixture.relative_path,
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
      truncation: truncation(),
      truncationReasons: [],
      partial: false,
    },
    limits: {},
    usage: { files: 0, directories: 0, bytes: 0, lines: 0, matches: 0, ranges: 0 },
    truncated: false,
    ok: false,
    error,
    path: fixture.relative_path,
    expectedSha256,
    actualSha256: fixture.sha256,
  });
}

export function createLargeContextRangeReceipt({
  fixture,
  dossier,
  strategy,
  receiptId,
  sequence,
  previousReceiptFingerprint = null,
  startLine,
  endLine,
  sessionKey = CONTEXT_TEST_SESSION_KEY,
  workspaceFingerprint = CONTEXT_TEST_WORKSPACE,
  sourceFingerprint = workspaceFingerprint,
  fingerprintSalt = LARGE_CONTEXT_FINGERPRINT_SALT,
  fullFileSha256 = fixture.sha256,
  totalLines = LARGE_CONTEXT_LINE_COUNT,
  mutationRevisionStarted = 0,
  mutationRevisionCompleted = mutationRevisionStarted,
  snapshotStable = true,
  changedDuringOperation = false,
  stableDuringRead = true,
  truncationOverrides = {},
  failure = null,
} = {}) {
  const startedAt = new Date(Date.parse("2026-07-17T10:10:00.000Z") + sequence * 2000).toISOString();
  const pending = beginContextReceiptOperation({
    receipt_id: receiptId,
    sequence,
    previous_receipt_fingerprint: previousReceiptFingerprint,
    session_key: sessionKey,
    parent_session_key: null,
    producer_session_key: sessionKey,
    producer_role: "runner",
    run_id: dossier.run_id,
    task_id: dossier.task_id,
    worktree_fingerprint: workspaceFingerprint,
    source_fingerprint: sourceFingerprint,
    context_strategy_id: strategy.strategy_id,
    context_strategy_fingerprint: strategy.fingerprint,
    parent_question_id: null,
    evidence_refs: [{ kind: "file", value: fixture.relative_path }],
    mutation_revision_started: mutationRevisionStarted,
    tool_id: "context_read",
    call_key_fingerprint: fingerprint({ receiptId, sequence, startLine, endLine }),
    started_at: startedAt,
    args: {
      path: fixture.relative_path,
      startLine,
      maxLines: endLine - startLine + 1,
      expectedSha256: fullFileSha256,
      format: "json",
    },
    fingerprint_salt: fingerprintSalt,
  });
  const output = failure === null
    ? rangeEnvelope(fixture, {
      startLine,
      endLine,
      fullFileSha256,
      totalLines,
      snapshotStable,
      changedDuringOperation,
      stableDuringRead,
      truncationOverrides,
    })
    : failureEnvelope(fixture, { error: failure, expectedSha256: fullFileSha256 });
  return completeContextReceiptOperation(pending, {
    output,
    completed_at: new Date(Date.parse(startedAt) + 1000).toISOString(),
    mutation_revision_completed: mutationRevisionCompleted,
    fingerprint_salt: fingerprintSalt,
  });
}
