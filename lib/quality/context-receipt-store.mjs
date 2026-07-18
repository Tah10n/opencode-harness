import fs from "node:fs";
import path from "node:path";

import {
  assertConfinedExistingPath,
  assertNoSymlinkEscape,
  atomicWriteJson,
  ensureConfinedDirectory,
  resolveHarnessRoot,
  resolveInside,
  withExclusiveLock,
} from "../feedback/files.mjs";
import { assertSafePersistenceId } from "../feedback/privacy.mjs";
import {
  ContractError,
  assertInteger,
  deepFrozenClone,
  exact,
  fingerprintsEqual,
} from "./validation.mjs";
import { validateContextReceipt } from "./context-receipts.mjs";

export const DEFAULT_CONTEXT_RECEIPT_STORE_LIMITS = Object.freeze({
  maxReceiptsPerSession: 256,
  maxReceiptBytes: 64 * 1024,
  maxSessionBytes: 8 * 1024 * 1024,
  maxSessions: 128,
  maxStoreBytes: 32 * 1024 * 1024,
});

const SESSION_KEY_PATTERN = /^[0-9a-f]{64}$/;
const RECEIPT_FILE_PATTERN = /^([0-9]{16})-([A-Za-z0-9][A-Za-z0-9._-]{0,127})\.json$/;

function assertSessionKey(value, label = "session key") {
  if (typeof value !== "string" || !SESSION_KEY_PATTERN.test(value)) {
    throw new ContractError("CONTEXT_RECEIPT_SESSION", `${label} must be a lowercase SHA-256 session key`);
  }
  return value;
}

function normalizeLimits(input = {}) {
  exact(input, Object.keys(DEFAULT_CONTEXT_RECEIPT_STORE_LIMITS), [], "context receipt store limits");
  const limits = { ...DEFAULT_CONTEXT_RECEIPT_STORE_LIMITS, ...input };
  for (const [key, value] of Object.entries(limits)) assertInteger(value, `context receipt store limits.${key}`, { min: 1 });
  if (limits.maxReceiptBytes > limits.maxSessionBytes || limits.maxSessionBytes > limits.maxStoreBytes) {
    throw new ContractError("CONTEXT_RECEIPT_STORE_LIMIT", "context receipt byte limits must be monotonic");
  }
  return Object.freeze(limits);
}

function receiptFilename(receipt) {
  if (receipt.sequence > 9_999_999_999_999_999) {
    throw new ContractError("CONTEXT_RECEIPT_SEQUENCE", "receipt sequence exceeds filename capacity");
  }
  return `${String(receipt.sequence).padStart(16, "0")}-${receipt.receipt_id}.json`;
}

function readBoundedJson(basePath, targetPath, maxBytes) {
  assertConfinedExistingPath(basePath, targetPath, { type: "file" });
  const before = fs.lstatSync(targetPath);
  if (before.isSymbolicLink() || !before.isFile() || before.size > maxBytes) {
    throw new ContractError("CONTEXT_RECEIPT_STORE_TAMPER", "receipt artifact is linked, non-file, or oversized");
  }
  let descriptor;
  try {
    descriptor = fs.openSync(targetPath, "r");
    const opened = fs.fstatSync(descriptor);
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) {
      throw new ContractError("CONTEXT_RECEIPT_STORE_TAMPER", "receipt identity changed during inspection");
    }
    const buffer = Buffer.alloc(opened.size + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const count = fs.readSync(descriptor, buffer, bytesRead, buffer.length - bytesRead, null);
      if (count === 0) break;
      bytesRead += count;
    }
    const completed = fs.fstatSync(descriptor);
    if (bytesRead !== opened.size || completed.dev !== opened.dev || completed.ino !== opened.ino
      || completed.size !== opened.size || completed.mtimeMs !== opened.mtimeMs) {
      throw new ContractError("CONTEXT_RECEIPT_STORE_TAMPER", "receipt changed while it was read");
    }
    try {
      return { value: JSON.parse(buffer.subarray(0, bytesRead).toString("utf8").replace(/^\uFEFF/, "")), bytes: bytesRead };
    } catch {
      throw new ContractError("CONTEXT_RECEIPT_STORE_TAMPER", "receipt artifact is not valid JSON");
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function sessionIndex(sessionKey, receipts, totalBytes) {
  const resultGroups = new Map();
  const receiptRefs = receipts.map(({ receipt }) => {
    const resultFingerprint = receipt.result?.result_fingerprint ?? null;
    if (resultFingerprint !== null) {
      const ids = resultGroups.get(resultFingerprint) ?? [];
      ids.push(receipt.receipt_id);
      resultGroups.set(resultFingerprint, ids);
    }
    return {
      receipt_id: receipt.receipt_id,
      sequence: receipt.sequence,
      tool_id: receipt.tool_id,
      status: receipt.status,
      completed_at: receipt.completed_at,
      call_key_fingerprint: receipt.call_key_fingerprint,
      result_fingerprint: resultFingerprint,
      fingerprint: receipt.fingerprint,
    };
  });
  const duplicateResults = [...resultGroups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([resultFingerprint, receiptIds]) => ({
      result_fingerprint: resultFingerprint,
      receipt_ids: [...receiptIds].sort(),
    }))
    .sort((left, right) => left.result_fingerprint.localeCompare(right.result_fingerprint));
  return deepFrozenClone({
    session_key: sessionKey,
    receipt_count: receipts.length,
    total_bytes: totalBytes,
    first_sequence: receipts[0]?.receipt.sequence ?? null,
    last_sequence: receipts.at(-1)?.receipt.sequence ?? null,
    latest_receipt_fingerprint: receipts.at(-1)?.receipt.fingerprint ?? null,
    receipt_refs: receiptRefs,
    duplicate_results: duplicateResults,
  }, "context receipt session index");
}

function scanSession(internals, sessionKey) {
  assertSessionKey(sessionKey);
  const directory = resolveInside(internals.receiptRoot, sessionKey);
  if (!fs.existsSync(directory)) return { receipts: [], index: sessionIndex(sessionKey, [], 0) };
  assertConfinedExistingPath(internals.receiptRoot, directory, { type: "directory" });
  const directoryStat = fs.lstatSync(directory);
  if (directoryStat.isSymbolicLink()) throw new ContractError("CONTEXT_RECEIPT_STORE_TAMPER", "receipt session directory is linked");

  const receipts = [];
  let totalBytes = 0;
  for (const name of fs.readdirSync(directory).sort()) {
    const match = RECEIPT_FILE_PATTERN.exec(name);
    if (!match) throw new ContractError("CONTEXT_RECEIPT_STORE_TAMPER", "receipt session directory contains an unknown artifact");
    const target = resolveInside(directory, name);
    assertNoSymlinkEscape(internals.receiptRoot, target);
    const read = readBoundedJson(internals.receiptRoot, target, internals.limits.maxReceiptBytes);
    totalBytes += read.bytes;
    if (totalBytes > internals.limits.maxSessionBytes) {
      throw new ContractError("CONTEXT_RECEIPT_STORE_QUOTA", "stored session receipts exceed the bounded byte budget");
    }
    const receipt = validateContextReceipt(read.value, `stored context receipt ${name}`);
    if (receipt.session_key !== sessionKey || receipt.sequence !== Number(match[1]) || receipt.receipt_id !== match[2]) {
      throw new ContractError("CONTEXT_RECEIPT_STORE_TAMPER", "receipt filename binding is invalid");
    }
    receipts.push({ receipt, bytes: read.bytes });
  }
  receipts.sort((left, right) => left.receipt.sequence - right.receipt.sequence);
  if (receipts.length > internals.limits.maxReceiptsPerSession) {
    throw new ContractError("CONTEXT_RECEIPT_STORE_QUOTA", "stored session receipts exceed the bounded count budget");
  }

  const ids = new Set();
  const sequences = new Set();
  const calls = new Set();
  for (const [index, entry] of receipts.entries()) {
    const receipt = entry.receipt;
    if (ids.has(receipt.receipt_id) || sequences.has(receipt.sequence) || calls.has(receipt.call_key_fingerprint)) {
      throw new ContractError("CONTEXT_RECEIPT_STORE_DUPLICATE", "stored receipts contain duplicate identity, sequence, or call binding");
    }
    ids.add(receipt.receipt_id);
    sequences.add(receipt.sequence);
    calls.add(receipt.call_key_fingerprint);
    const expectedPrevious = index === 0 ? null : receipts[index - 1].receipt.fingerprint;
    if (receipt.previous_receipt_fingerprint !== expectedPrevious) {
      throw new ContractError("CONTEXT_RECEIPT_STORE_CHAIN", "stored receipt fingerprint chain is invalid");
    }
  }
  return { receipts, index: sessionIndex(sessionKey, receipts, totalBytes) };
}

function scanStore(internals) {
  assertConfinedExistingPath(internals.harnessRoot, internals.receiptRoot, { type: "directory" });
  const sessions = [];
  let totalBytes = 0;
  for (const name of fs.readdirSync(internals.receiptRoot).sort()) {
    if (name === ".store.lock") continue;
    if (!SESSION_KEY_PATTERN.test(name)) {
      throw new ContractError("CONTEXT_RECEIPT_STORE_TAMPER", "receipt store contains an unknown artifact");
    }
    const target = resolveInside(internals.receiptRoot, name);
    const stat = fs.lstatSync(target);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new ContractError("CONTEXT_RECEIPT_STORE_TAMPER", "receipt store session entry is not a local directory");
    }
    const scanned = scanSession(internals, name);
    sessions.push(scanned);
    totalBytes += scanned.index.total_bytes;
    if (sessions.length > internals.limits.maxSessions || totalBytes > internals.limits.maxStoreBytes) {
      throw new ContractError("CONTEXT_RECEIPT_STORE_QUOTA", "receipt store exceeds its bounded budget");
    }
  }
  return { sessions, totalBytes };
}

function publicStoreIndex(scanned) {
  return deepFrozenClone({
    session_count: scanned.sessions.length,
    receipt_count: scanned.sessions.reduce((sum, entry) => sum + entry.index.receipt_count, 0),
    total_bytes: scanned.totalBytes,
    sessions: scanned.sessions.map((entry) => ({
      session_key: entry.index.session_key,
      receipt_count: entry.index.receipt_count,
      total_bytes: entry.index.total_bytes,
      first_sequence: entry.index.first_sequence,
      last_sequence: entry.index.last_sequence,
      latest_receipt_fingerprint: entry.index.latest_receipt_fingerprint,
      duplicate_result_count: entry.index.duplicate_results.length,
    })),
  }, "context receipt store index");
}

export function createContextReceiptStore({ workspaceRoot, limits = {} } = {}) {
  if (typeof workspaceRoot !== "string" || workspaceRoot.trim() === "") {
    throw new ContractError("CONTEXT_RECEIPT_WORKSPACE", "workspaceRoot must be a non-empty path");
  }
  const harnessRoot = resolveHarnessRoot(workspaceRoot);
  const qualityRoot = resolveInside(harnessRoot, "quality");
  const receiptRoot = resolveInside(qualityRoot, "context-receipts");
  ensureConfinedDirectory(harnessRoot, receiptRoot);
  const internals = {
    harnessRoot,
    receiptRoot,
    lockPath: resolveInside(receiptRoot, ".store.lock"),
    limits: normalizeLimits(limits),
  };

  function locked(callback) {
    return withExclusiveLock(internals.lockPath, callback, { basePath: internals.harnessRoot });
  }

  function publishReceipt(receiptInput) {
    const receipt = validateContextReceipt(structuredClone(receiptInput));
    return locked(() => {
      const store = scanStore(internals);
      const existingSession = store.sessions.find((entry) => entry.index.session_key === receipt.session_key)
        ?? { receipts: [], index: sessionIndex(receipt.session_key, [], 0) };
      const sameId = existingSession.receipts.find((entry) => entry.receipt.receipt_id === receipt.receipt_id);
      if (sameId) {
        if (fingerprintsEqual(sameId.receipt.fingerprint, receipt.fingerprint)) {
          return deepFrozenClone({ receipt: sameId.receipt, duplicate: true }, "context receipt publication");
        }
        throw new ContractError("CONTEXT_RECEIPT_DUPLICATE_CONFLICT", "receipt_id already exists with different content");
      }
      if (existingSession.receipts.some((entry) => entry.receipt.call_key_fingerprint === receipt.call_key_fingerprint)) {
        throw new ContractError("CONTEXT_RECEIPT_DUPLICATE_CALL", "call binding already has a receipt");
      }
      if (existingSession.receipts.some((entry) => entry.receipt.sequence === receipt.sequence)) {
        throw new ContractError("CONTEXT_RECEIPT_DUPLICATE_SEQUENCE", "receipt sequence already exists");
      }
      const latest = existingSession.receipts.at(-1)?.receipt ?? null;
      if (latest === null) {
        if (receipt.previous_receipt_fingerprint !== null) {
          throw new ContractError("CONTEXT_RECEIPT_STORE_CHAIN", "first session receipt must start a new chain");
        }
      } else if (receipt.sequence <= latest.sequence || receipt.previous_receipt_fingerprint !== latest.fingerprint) {
        throw new ContractError("CONTEXT_RECEIPT_STORE_CHAIN", "receipt does not extend the current immutable chain");
      }

      const textBytes = Buffer.byteLength(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
      if (textBytes > internals.limits.maxReceiptBytes
        || existingSession.index.receipt_count + 1 > internals.limits.maxReceiptsPerSession
        || existingSession.index.total_bytes + textBytes > internals.limits.maxSessionBytes
        || store.totalBytes + textBytes > internals.limits.maxStoreBytes
        || (!store.sessions.some((entry) => entry.index.session_key === receipt.session_key)
          && store.sessions.length + 1 > internals.limits.maxSessions)) {
        throw new ContractError("CONTEXT_RECEIPT_STORE_QUOTA", "receipt publication exceeds the bounded store budget");
      }

      const sessionDirectory = resolveInside(internals.receiptRoot, receipt.session_key);
      ensureConfinedDirectory(internals.harnessRoot, sessionDirectory);
      const target = resolveInside(sessionDirectory, receiptFilename(receipt));
      atomicWriteJson(target, receipt, { immutable: true, basePath: internals.harnessRoot });
      const published = readBoundedJson(internals.receiptRoot, target, internals.limits.maxReceiptBytes).value;
      validateContextReceipt(published, "published context receipt");
      if (!fingerprintsEqual(published.fingerprint, receipt.fingerprint)) {
        throw new ContractError("CONTEXT_RECEIPT_STORE_TAMPER", "published receipt readback does not match");
      }
      return deepFrozenClone({ receipt: published, duplicate: false }, "context receipt publication");
    });
  }

  function inspectSession(sessionKey) {
    assertSessionKey(sessionKey);
    return locked(() => scanSession(internals, sessionKey).index);
  }

  function inspectIndex() {
    return locked(() => publicStoreIndex(scanStore(internals)));
  }

  function readReceipt(sessionKey, receiptId) {
    assertSessionKey(sessionKey);
    assertSafePersistenceId(receiptId, "receipt id");
    return locked(() => {
      const match = scanSession(internals, sessionKey).receipts.find((entry) => entry.receipt.receipt_id === receiptId);
      if (!match) throw new ContractError("CONTEXT_RECEIPT_NOT_FOUND", "context receipt was not found");
      return deepFrozenClone(match.receipt, "stored context receipt");
    });
  }

  return Object.freeze({
    publishReceipt,
    inspectSession,
    inspectIndex,
    readReceipt,
    limits: internals.limits,
  });
}
