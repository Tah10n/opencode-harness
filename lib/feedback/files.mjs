import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { ContractError, assertSafeId } from "./contracts.mjs";

export function isInside(basePath, targetPath) {
  const relative = path.relative(path.resolve(basePath), path.resolve(targetPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveHarnessRoot(workspaceRoot) {
  if (typeof workspaceRoot !== "string" || workspaceRoot.trim() === "") {
    throw new ContractError("FILES_WORKSPACE", "workspaceRoot must be a non-empty path");
  }
  return path.join(path.resolve(workspaceRoot), ".oc_harness");
}

export function resolveInside(basePath, ...segments) {
  const resolvedBase = path.resolve(basePath);
  const resolved = path.resolve(resolvedBase, ...segments);
  if (!isInside(resolvedBase, resolved)) {
    throw new ContractError("FILES_TRAVERSAL", "resolved path escapes its confined base");
  }
  return resolved;
}

export function resolveIdPath(basePath, id, ...segments) {
  assertSafeId(id, "path id");
  return resolveInside(basePath, id, ...segments);
}

function lstatIfPresent(targetPath) {
  try {
    return fs.lstatSync(targetPath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function confinedComponents(basePath, targetPath) {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(targetPath);
  if (!isInside(resolvedBase, resolvedTarget)) {
    throw new ContractError("FILES_TRAVERSAL", "target escapes its confined base");
  }
  const relative = path.relative(resolvedBase, resolvedTarget);
  const components = [resolvedBase];
  let current = resolvedBase;
  for (const segment of relative === "" ? [] : relative.split(path.sep)) {
    current = path.join(current, segment);
    components.push(current);
  }
  return { resolvedBase, resolvedTarget, components };
}

export function assertNoSymlinkEscape(basePath, targetPath) {
  const { resolvedBase, resolvedTarget, components } = confinedComponents(basePath, targetPath);
  const baseStat = lstatIfPresent(resolvedBase);
  if (!baseStat) {
    let existingParent = path.dirname(resolvedBase);
    let parentStat = lstatIfPresent(existingParent);
    while (!parentStat && path.dirname(existingParent) !== existingParent) {
      existingParent = path.dirname(existingParent);
      parentStat = lstatIfPresent(existingParent);
    }
    if (!parentStat || parentStat.isSymbolicLink()) {
      throw new ContractError("FILES_SYMLINK", "confined base has no safe existing parent");
    }
    return resolvedTarget;
  }
  if (baseStat.isSymbolicLink()) {
    throw new ContractError("FILES_SYMLINK", "symbolic-link confined base is not allowed");
  }
  const realBase = fs.realpathSync(resolvedBase);
  for (const candidate of components) {
    const stat = lstatIfPresent(candidate);
    if (!stat) continue;
    if (stat.isSymbolicLink()) {
      throw new ContractError("FILES_SYMLINK", `symbolic-link path component is not allowed: ${path.basename(candidate)}`);
    }
    let realCandidate;
    try {
      realCandidate = fs.realpathSync(candidate);
    } catch {
      throw new ContractError("FILES_REALPATH", `existing path component cannot be resolved safely: ${path.basename(candidate)}`);
    }
    if (!isInside(realBase, realCandidate)) {
      throw new ContractError("FILES_REALPATH", "existing target ancestor escapes the confined real path");
    }
  }
  return resolvedTarget;
}

export function assertConfinedExistingPath(basePath, targetPath, { type = null } = {}) {
  const resolved = assertNoSymlinkEscape(basePath, targetPath);
  const stat = lstatIfPresent(resolved);
  if (!stat) throw new ContractError("FILES_MISSING", `confined ${type ?? "path"} does not exist`);
  if (stat.isSymbolicLink()) throw new ContractError("FILES_SYMLINK", "symbolic-link target is not allowed");
  if (type === "file" && !stat.isFile()) throw new ContractError("FILES_TYPE", "confined target must be a file");
  if (type === "directory" && !stat.isDirectory()) throw new ContractError("FILES_TYPE", "confined target must be a directory");
  return resolved;
}

export function assertConfinedTree(basePath, treePath) {
  const resolvedTree = assertConfinedExistingPath(basePath, treePath, { type: "directory" });
  const pending = [resolvedTree];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      const stat = lstatIfPresent(target);
      if (!stat || stat.isSymbolicLink()) {
        throw new ContractError("FILES_SYMLINK", `linked fixture entry is not allowed: ${entry.name}`);
      }
      assertNoSymlinkEscape(basePath, target);
      if (stat.isDirectory()) pending.push(target);
    }
  }
  return resolvedTree;
}

export function ensureConfinedDirectory(basePath, targetPath) {
  assertNoSymlinkEscape(basePath, targetPath);
  fs.mkdirSync(targetPath, { recursive: true });
  assertNoSymlinkEscape(basePath, targetPath);
  return targetPath;
}

function fsyncDirectoryBestEffort(directory) {
  let handle;
  try {
    handle = fs.openSync(directory, "r");
    fs.fsyncSync(handle);
  } catch (error) {
    if (!(["EINVAL", "EPERM", "EISDIR", "EBADF"].includes(error?.code))) throw error;
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
  }
}

function confinementBase(options) {
  const basePath = options.basePath ?? options.confinementRoot ?? null;
  if (basePath !== null && (typeof basePath !== "string" || basePath.trim() === "")) {
    throw new ContractError("FILES_CONFINEMENT", "basePath must be a non-empty path");
  }
  return basePath === null ? null : path.resolve(basePath);
}

function assertWriteConfinement(targetPath, options, { mustExist = false } = {}) {
  const basePath = confinementBase(options);
  if (basePath === null) return path.resolve(targetPath);
  const resolved = assertNoSymlinkEscape(basePath, targetPath);
  if (mustExist) assertConfinedExistingPath(basePath, resolved, { type: "file" });
  return resolved;
}

function sameFileIdentity(left, right) {
  return left && right && left.dev === right.dev && left.ino === right.ino;
}

function captureOpenedPathIdentity(targetPath, handle, options) {
  // Capture the path identity first so cleanup still owns the artifact if the
  // subsequent handle identity check itself fails.  No caller-controlled hook
  // runs between the exclusive open and these two observations.
  assertWriteConfinement(targetPath, options, { mustExist: true });
  const pathIdentity = fs.lstatSync(targetPath);
  if (!pathIdentity.isFile() || pathIdentity.isSymbolicLink()) {
    throw new ContractError("FILES_OWNERSHIP", `new artifact is not a regular file: ${path.basename(targetPath)}`);
  }
  const handleIdentity = fs.fstatSync(handle);
  if (!sameFileIdentity(pathIdentity, handleIdentity)) {
    throw new ContractError("FILES_OWNERSHIP", `new artifact identity changed during acquisition: ${path.basename(targetPath)}`);
  }
  return pathIdentity;
}

function unlinkOwnedFile(targetPath, identity, options, { bestEffort = false } = {}) {
  try {
    if (!fs.existsSync(targetPath)) return;
    assertWriteConfinement(targetPath, options, { mustExist: true });
    const current = fs.lstatSync(targetPath);
    if (!sameFileIdentity(identity, current)) {
      throw new ContractError("FILES_OWNERSHIP", `refusing to remove a replaced artifact: ${path.basename(targetPath)}`);
    }
    fs.unlinkSync(targetPath);
  } catch (error) {
    if (!bestEffort) throw error;
  }
}

function writeTempFile(targetPath, contents, { tempIdFactory = randomUUID, ...options } = {}) {
  const directory = path.dirname(targetPath);
  const basePath = confinementBase(options);
  if (basePath === null) fs.mkdirSync(directory, { recursive: true });
  else ensureConfinedDirectory(basePath, directory);
  assertWriteConfinement(targetPath, options);
  const tempPath = path.join(directory, `.${path.basename(targetPath)}.${tempIdFactory()}.tmp`);
  assertWriteConfinement(tempPath, options);
  let handle;
  let created = false;
  let identity;
  try {
    handle = fs.openSync(tempPath, "wx", 0o600);
    created = true;
    identity = fs.lstatSync(tempPath);
    identity = captureOpenedPathIdentity(tempPath, handle, options);
    options.afterTempOpen?.({ targetPath, tempPath, handle });
    fs.writeFileSync(handle, contents, "utf8");
    options.afterTempWrite?.({ targetPath, tempPath, handle });
    fs.fsyncSync(handle);
    options.afterTempFsync?.({ targetPath, tempPath, handle });
    fs.closeSync(handle);
    handle = undefined;
    assertWriteConfinement(tempPath, options, { mustExist: true });
    return tempPath;
  } catch (error) {
    if (handle !== undefined) {
      try { fs.closeSync(handle); } catch { /* preserve the acquisition/write error */ }
      handle = undefined;
    }
    if (created) {
      unlinkOwnedFile(tempPath, identity, options, { bestEffort: true });
    }
    throw error;
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
  }
}

export function atomicWriteImmutable(targetPath, contents, options = {}) {
  assertWriteConfinement(targetPath, options);
  if (fs.existsSync(targetPath)) {
    throw new ContractError("FILES_IMMUTABLE_EXISTS", `immutable artifact already exists: ${path.basename(targetPath)}`);
  }
  const tempPath = writeTempFile(targetPath, contents, options);
  const tempIdentity = fs.lstatSync(tempPath);
  try {
    options.beforeCommit?.({ targetPath, tempPath });
    assertWriteConfinement(tempPath, options, { mustExist: true });
    assertWriteConfinement(targetPath, options);
    fs.linkSync(tempPath, targetPath);
    assertWriteConfinement(targetPath, options, { mustExist: true });
    fsyncDirectoryBestEffort(path.dirname(targetPath));
  } catch (error) {
    if (["EEXIST", "EPERM"].includes(error?.code) && fs.existsSync(targetPath)) {
      throw new ContractError("FILES_IMMUTABLE_EXISTS", `immutable artifact already exists: ${path.basename(targetPath)}`);
    }
    throw error;
  } finally {
    unlinkOwnedFile(tempPath, tempIdentity, options);
  }
  return targetPath;
}

export function atomicWriteMutable(targetPath, contents, options = {}) {
  assertWriteConfinement(targetPath, options);
  const tempPath = writeTempFile(targetPath, contents, options);
  const tempIdentity = fs.lstatSync(tempPath);
  try {
    options.beforeCommit?.({ targetPath, tempPath });
    assertWriteConfinement(tempPath, options, { mustExist: true });
    assertWriteConfinement(targetPath, options);
    fs.renameSync(tempPath, targetPath);
    assertWriteConfinement(targetPath, options, { mustExist: true });
    fsyncDirectoryBestEffort(path.dirname(targetPath));
  } finally {
    unlinkOwnedFile(tempPath, tempIdentity, options);
  }
  return targetPath;
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function atomicWriteJson(targetPath, value, { immutable = false, ...options } = {}) {
  return immutable
    ? atomicWriteImmutable(targetPath, jsonText(value), options)
    : atomicWriteMutable(targetPath, jsonText(value), options);
}

export function atomicRewriteJsonLines(targetPath, entries, options = {}) {
  const text = entries.length === 0 ? "" : `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
  return atomicWriteMutable(targetPath, text, options);
}

export function readJson(targetPath) {
  return JSON.parse(fs.readFileSync(targetPath, "utf8").replace(/^\uFEFF/, ""));
}

export function readJsonLines(targetPath) {
  if (!fs.existsSync(targetPath)) return [];
  const text = fs.readFileSync(targetPath, "utf8");
  if (text === "") return [];
  if (!text.endsWith("\n")) {
    throw new ContractError("FILES_PARTIAL_JSONL", `${path.basename(targetPath)} has a partial final line`);
  }
  return text.trimEnd().split(/\r?\n/).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new ContractError("FILES_INVALID_JSONL", `${path.basename(targetPath)} line ${index + 1} is invalid JSON: ${error.message}`);
    }
  });
}

export function withExclusiveLock(lockPath, callback, { lockIdFactory = randomUUID, ...options } = {}) {
  const basePath = confinementBase(options);
  if (basePath === null) fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  else ensureConfinedDirectory(basePath, path.dirname(lockPath));
  assertWriteConfinement(lockPath, options);
  let handle;
  let created = false;
  let identity;
  try {
    handle = fs.openSync(lockPath, "wx", 0o600);
    created = true;
    identity = fs.lstatSync(lockPath);
    identity = captureOpenedPathIdentity(lockPath, handle, options);
    options.afterLockOpen?.({ lockPath, handle });
    fs.writeFileSync(handle, lockIdFactory(), "utf8");
    options.afterLockWrite?.({ lockPath, handle });
    fs.fsyncSync(handle);
  } catch (error) {
    if (error?.code === "EEXIST" && !created) {
      throw new ContractError("FILES_LOCKED", `artifact is already locked: ${path.basename(lockPath)}`);
    }
    if (handle !== undefined) {
      try { fs.closeSync(handle); } catch { /* preserve original failure */ }
      handle = undefined;
    }
    if (created) {
      unlinkOwnedFile(lockPath, identity, options, { bestEffort: true });
    }
    throw error;
  }
  try {
    assertWriteConfinement(lockPath, options, { mustExist: true });
    return callback();
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
    unlinkOwnedFile(lockPath, identity, options);
  }
}

const RECOVERABLE_LOCK_LEASE_SCHEMA_VERSION = 1;
const RECOVERABLE_RECLAIM_CLAIM_SCHEMA_VERSION = 1;
const RECOVERABLE_LOCK_MAX_BYTES = 4096;
const RECOVERABLE_LOCK_MAX_STALE_MS = 24 * 60 * 60 * 1000;
const RECOVERABLE_RECLAIM_MAX_GENERATIONS = 32;

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

function recoverableLockError(lockPath, detail = "artifact is already locked") {
  return new ContractError("FILES_LOCKED", `${detail}: ${path.basename(lockPath)}`);
}

function assertRecoverableLockOptions(lockPath, options) {
  if (!Number.isInteger(options.lockStaleMs)
    || options.lockStaleMs < 0
    || options.lockStaleMs > RECOVERABLE_LOCK_MAX_STALE_MS) {
    throw new ContractError("FILES_LOCK_LEASE", "lockStaleMs must be a bounded non-negative integer");
  }
  if (typeof options.clockMs !== "function" || typeof options.processIsAlive !== "function") {
    throw new ContractError("FILES_LOCK_LEASE", "recoverable lock clock and process probe must be callable");
  }
  const now = options.clockMs();
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new ContractError("FILES_LOCK_LEASE", "recoverable lock clock must return epoch milliseconds");
  }
  assertWriteConfinement(lockPath, options);
  return now;
}

function assertLeaseNonce(value) {
  if (typeof value !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)) {
    throw new ContractError("FILES_LOCK_LEASE", "recoverable lock nonce is invalid");
  }
  return value;
}

function recoverableLeaseText(value) {
  return `${JSON.stringify(value)}\n`;
}

function leaseTempPath(lockPath, nonce) {
  return path.join(path.dirname(lockPath), `.${path.basename(lockPath)}.lease-${nonce}.tmp`);
}

function sha256Text(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function reclaimClaimPath(lockPath, leaseNonce, generation) {
  const leaseKey = createHash("sha256")
    .update(`${path.basename(lockPath)}\0${leaseNonce}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return path.join(
    path.dirname(lockPath),
    `${path.basename(lockPath)}.reclaim-${leaseKey}-${generation}.claim`,
  );
}

function reclaimClaimTempPath(claimPath, claimNonce) {
  const claimKey = createHash("sha256").update(claimNonce, "utf8").digest("hex").slice(0, 16);
  return path.join(path.dirname(claimPath), `.${path.basename(claimPath)}.claim-${claimKey}.tmp`);
}

function readStableRegularFile(targetPath, options) {
  assertWriteConfinement(targetPath, options, { mustExist: true });
  const lexical = fs.lstatSync(targetPath);
  if (!lexical.isFile() || lexical.isSymbolicLink() || lexical.size > RECOVERABLE_LOCK_MAX_BYTES) {
    throw recoverableLockError(targetPath, "lock lease is not a bounded regular file");
  }
  let handle;
  try {
    handle = fs.openSync(targetPath, "r");
    const before = fs.fstatSync(handle);
    if (!sameFileIdentity(lexical, before) || !before.isFile() || before.size > RECOVERABLE_LOCK_MAX_BYTES) {
      throw recoverableLockError(targetPath, "lock lease identity changed while opening");
    }
    const raw = fs.readFileSync(handle, "utf8");
    const after = fs.fstatSync(handle);
    const current = fs.lstatSync(targetPath);
    if (!sameFileIdentity(before, after) || !sameFileIdentity(after, current)
      || after.size !== Buffer.byteLength(raw, "utf8")) {
      throw recoverableLockError(targetPath, "lock lease changed while reading");
    }
    return { identity: current, raw };
  } catch (error) {
    if (error instanceof ContractError) throw error;
    throw recoverableLockError(targetPath, "lock lease cannot be read safely");
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
  }
}

function parseRecoverableReclaimClaim(claimPath, {
  lockPath,
  leaseSnapshot,
  generation,
  options,
}) {
  let snapshot;
  let record;
  try {
    snapshot = readStableRegularFile(claimPath, options);
    record = JSON.parse(snapshot.raw);
  } catch {
    throw recoverableLockError(lockPath, "stale-reclaim claim is malformed or unsafe");
  }
  const keys = [
    "claim_nonce",
    "claimant_pid",
    "created_at_ms",
    "generation",
    "lease_fingerprint",
    "lease_nonce",
    "schema_version",
  ];
  if (Object.keys(record ?? {}).sort().join("\0") !== keys.join("\0")
    || record.schema_version !== RECOVERABLE_RECLAIM_CLAIM_SCHEMA_VERSION
    || record.generation !== generation
    || !Number.isSafeInteger(record.claimant_pid) || record.claimant_pid < 1
    || !Number.isSafeInteger(record.created_at_ms) || record.created_at_ms < 0
    || record.lease_nonce !== leaseSnapshot.record.nonce
    || record.lease_fingerprint !== sha256Text(leaseSnapshot.raw)) {
    throw recoverableLockError(lockPath, "stale-reclaim claim does not bind the observed lease generation");
  }
  try {
    assertLeaseNonce(record.claim_nonce);
  } catch {
    throw recoverableLockError(lockPath, "stale-reclaim claim nonce is invalid");
  }
  if (snapshot.raw !== recoverableLeaseText(record) || ![1, 2].includes(snapshot.identity.nlink)) {
    throw recoverableLockError(lockPath, "stale-reclaim claim publication is incomplete");
  }
  const tempPath = reclaimClaimTempPath(claimPath, record.claim_nonce);
  let tempSnapshot = null;
  if (snapshot.identity.nlink === 2) {
    if (!fs.existsSync(tempPath)) {
      throw recoverableLockError(lockPath, "stale-reclaim claim publication link is missing");
    }
    tempSnapshot = readStableRegularFile(tempPath, options);
    if (!sameFileIdentity(snapshot.identity, tempSnapshot.identity) || snapshot.raw !== tempSnapshot.raw) {
      throw recoverableLockError(lockPath, "stale-reclaim claim publication link is unrelated");
    }
  }
  return { ...snapshot, record, path: claimPath, tempPath, tempSnapshot };
}

function publishRecoverableReclaimClaim(lockPath, leaseSnapshot, generation, options) {
  const claimPath = reclaimClaimPath(lockPath, leaseSnapshot.record.nonce, generation);
  const createdAtMs = options.clockMs();
  if (!Number.isSafeInteger(createdAtMs) || createdAtMs < 0) {
    throw new ContractError("FILES_LOCK_LEASE", "recoverable lock clock must return epoch milliseconds");
  }
  const claimNonce = assertLeaseNonce((options.reclaimClaimIdFactory ?? randomUUID)());
  const record = {
    schema_version: RECOVERABLE_RECLAIM_CLAIM_SCHEMA_VERSION,
    claimant_pid: process.pid,
    created_at_ms: createdAtMs,
    generation,
    lease_nonce: leaseSnapshot.record.nonce,
    lease_fingerprint: sha256Text(leaseSnapshot.raw),
    claim_nonce: claimNonce,
  };
  const raw = recoverableLeaseText(record);
  const expectedTempPath = reclaimClaimTempPath(claimPath, claimNonce);
  const claimTempKey = createHash("sha256").update(claimNonce, "utf8").digest("hex").slice(0, 16);
  const tempPath = writeTempFile(claimPath, raw, {
    ...options,
    tempIdFactory: () => `claim-${claimTempKey}`,
  });
  if (tempPath !== expectedTempPath) {
    throw new ContractError("FILES_LOCK_LEASE", "stale-reclaim claim temporary path is not deterministic");
  }
  const tempIdentity = fs.lstatSync(tempPath);
  let linked = false;
  try {
    fs.linkSync(tempPath, claimPath);
    linked = true;
    const claimIdentity = fs.lstatSync(claimPath);
    if (!sameFileIdentity(tempIdentity, claimIdentity)) {
      throw new ContractError("FILES_OWNERSHIP", "published stale-reclaim claim changed identity");
    }
    unlinkOwnedFile(tempPath, tempIdentity, options);
    fsyncDirectoryBestEffort(path.dirname(claimPath));
    return parseRecoverableReclaimClaim(claimPath, {
      lockPath,
      leaseSnapshot,
      generation,
      options,
    });
  } catch (error) {
    if (linked && fs.existsSync(claimPath)) {
      try { unlinkOwnedFile(claimPath, tempIdentity, options, { bestEffort: true }); } catch { /* preserve claim publication error */ }
    }
    if (fs.existsSync(tempPath)) {
      try { unlinkOwnedFile(tempPath, tempIdentity, options, { bestEffort: true }); } catch { /* preserve claim publication error */ }
    }
    if (["EEXIST", "EPERM"].includes(error?.code) && fs.existsSync(claimPath)) return null;
    throw error;
  }
}

function acquireRecoverableReclaimClaim(lockPath, leaseSnapshot, options) {
  const claims = [];
  for (let generation = 0; generation < RECOVERABLE_RECLAIM_MAX_GENERATIONS; generation += 1) {
    const claimPath = reclaimClaimPath(lockPath, leaseSnapshot.record.nonce, generation);
    let claim = null;
    if (fs.existsSync(claimPath)) {
      claim = parseRecoverableReclaimClaim(claimPath, {
        lockPath,
        leaseSnapshot,
        generation,
        options,
      });
    } else {
      claim = publishRecoverableReclaimClaim(lockPath, leaseSnapshot, generation, options);
      if (claim === null) {
        generation -= 1;
        continue;
      }
      claims.push(claim);
      options.afterStaleReclaimClaim?.({
        lockPath,
        generation,
        claim: { ...claim.record },
      });
      return claims;
    }
    claims.push(claim);
    const now = options.clockMs();
    const age = now - claim.record.created_at_ms;
    if (!Number.isSafeInteger(now) || age < options.lockStaleMs
      || options.processIsAlive(claim.record.claimant_pid)) {
      throw recoverableLockError(lockPath, "another process owns the stale-reclaim claim");
    }
  }
  throw recoverableLockError(lockPath, "stale-reclaim claim generation limit was reached");
}

function cleanupRecoverableReclaimClaims(claims, options) {
  for (const claim of [...claims].reverse()) {
    if (claim.tempSnapshot !== null) {
      unlinkOwnedFile(claim.tempPath, claim.tempSnapshot.identity, options);
    }
    unlinkOwnedFile(claim.path, claim.identity, options);
  }
}

function reclaimPublishedRecoverableLease(lockPath, snapshot, options) {
  const claims = acquireRecoverableReclaimClaim(lockPath, snapshot, options);
  try {
    const current = readStableRegularFile(lockPath, options);
    if (!sameFileIdentity(snapshot.identity, current.identity) || current.raw !== snapshot.raw) {
      throw new ContractError("FILES_OWNERSHIP", "lock lease changed before claimed stale removal");
    }
    const nextClaimPath = reclaimClaimPath(
      lockPath,
      snapshot.record.nonce,
      claims.at(-1).record.generation + 1,
    );
    if (fs.existsSync(nextClaimPath)) {
      throw recoverableLockError(lockPath, "stale-reclaim claim ownership was superseded");
    }
    options.beforeStaleLeaseUnlink?.({
      lockPath,
      record: { ...snapshot.record },
      claim: { ...claims.at(-1).record },
    });
    unlinkOwnedFile(lockPath, snapshot.identity, options);
    if (snapshot.tempSnapshot !== null) {
      const currentTemp = readStableRegularFile(snapshot.tempPath, options);
      if (!sameFileIdentity(snapshot.identity, currentTemp.identity) || currentTemp.raw !== snapshot.raw) {
        throw new ContractError("FILES_OWNERSHIP", "lock lease publication link changed during stale reclaim");
      }
      unlinkOwnedFile(snapshot.tempPath, currentTemp.identity, options);
    }
    fsyncDirectoryBestEffort(path.dirname(lockPath));
  } finally {
    cleanupRecoverableReclaimClaims(claims, options);
  }
}

function parsePublishedRecoverableLease(lockPath, options) {
  let snapshot;
  let record;
  try {
    snapshot = readStableRegularFile(lockPath, options);
    record = JSON.parse(snapshot.raw);
  } catch (error) {
    if (error instanceof ContractError && error.code === "FILES_LOCKED") throw error;
    throw recoverableLockError(lockPath, "lock lease is malformed");
  }
  const keys = Object.keys(record ?? {}).sort();
  if (keys.join("\0") !== ["created_at_ms", "nonce", "pid", "schema_version"].sort().join("\0")
    || record.schema_version !== RECOVERABLE_LOCK_LEASE_SCHEMA_VERSION
    || !Number.isSafeInteger(record.pid) || record.pid < 1
    || !Number.isSafeInteger(record.created_at_ms) || record.created_at_ms < 0) {
    throw recoverableLockError(lockPath, "lock lease structure is invalid");
  }
  try {
    assertLeaseNonce(record.nonce);
  } catch {
    throw recoverableLockError(lockPath, "lock lease nonce is invalid");
  }
  if (snapshot.raw !== recoverableLeaseText(record)
    || ![1, 2].includes(snapshot.identity.nlink)) {
    throw recoverableLockError(lockPath, "lock lease publication is incomplete");
  }
  const tempPath = leaseTempPath(lockPath, record.nonce);
  let tempSnapshot = null;
  if (snapshot.identity.nlink === 2) {
    if (!fs.existsSync(tempPath)) {
      throw recoverableLockError(lockPath, "lock lease orphan publication link is missing");
    }
    tempSnapshot = readStableRegularFile(tempPath, options);
    if (!sameFileIdentity(snapshot.identity, tempSnapshot.identity) || snapshot.raw !== tempSnapshot.raw) {
      throw recoverableLockError(lockPath, "lock lease orphan publication link is unrelated");
    }
  }
  return { ...snapshot, record, tempPath, tempSnapshot };
}

function isolatePublishedRecoverableLease(lockPath, snapshot, options, purpose) {
  const quarantinePath = path.join(
    path.dirname(lockPath),
    `.${path.basename(lockPath)}.${purpose}-${(options.quarantineIdFactory ?? randomUUID)()}.tmp`,
  );
  assertWriteConfinement(quarantinePath, options);
  let isolated = null;
  try {
    // Capture the identity currently published at lockPath without first
    // making the lock name disappear. A stale snapshot that races with a
    // successor links that successor, detects the mismatch below, and removes
    // only this private hard link.
    fs.linkSync(lockPath, quarantinePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw recoverableLockError(lockPath, "lock lease disappeared during isolation");
    }
    throw recoverableLockError(lockPath, "lock lease could not be isolated");
  }
  try {
    isolated = readStableRegularFile(quarantinePath, options);
    if (!sameFileIdentity(snapshot.identity, isolated.identity) || isolated.raw !== snapshot.raw) {
      throw new ContractError("FILES_OWNERSHIP", "lock lease changed during isolation");
    }
    const current = readStableRegularFile(lockPath, options);
    if (!sameFileIdentity(snapshot.identity, current.identity) || current.raw !== snapshot.raw) {
      throw new ContractError("FILES_OWNERSHIP", "lock lease changed before identity-bound removal");
    }
    unlinkOwnedFile(lockPath, snapshot.identity, options);
    if (snapshot.tempSnapshot !== null) {
      const currentTemp = readStableRegularFile(snapshot.tempPath, options);
      if (!sameFileIdentity(snapshot.identity, currentTemp.identity) || currentTemp.raw !== snapshot.raw) {
        throw new ContractError("FILES_OWNERSHIP", "lock lease publication link changed during isolation");
      }
      unlinkOwnedFile(snapshot.tempPath, currentTemp.identity, options);
    }
    unlinkOwnedFile(quarantinePath, isolated.identity, options);
    fsyncDirectoryBestEffort(path.dirname(lockPath));
  } catch (error) {
    if (isolated !== null && fs.existsSync(quarantinePath)) {
      try { unlinkOwnedFile(quarantinePath, isolated.identity, options, { bestEffort: true }); } catch { /* preserve isolation error */ }
    }
    throw error;
  }
}

function publishRecoverableLease(lockPath, options) {
  const createdAtMs = options.clockMs();
  if (!Number.isSafeInteger(createdAtMs) || createdAtMs < 0) {
    throw new ContractError("FILES_LOCK_LEASE", "recoverable lock clock must return epoch milliseconds");
  }
  const nonce = assertLeaseNonce(options.lockIdFactory());
  const record = {
    schema_version: RECOVERABLE_LOCK_LEASE_SCHEMA_VERSION,
    pid: process.pid,
    created_at_ms: createdAtMs,
    nonce,
  };
  const raw = recoverableLeaseText(record);
  const expectedTempPath = leaseTempPath(lockPath, nonce);
  const tempPath = writeTempFile(lockPath, raw, {
    ...options,
    tempIdFactory: () => `lease-${nonce}`,
    afterTempOpen: options.afterLeaseTempOpen,
    afterTempWrite: options.afterLeaseTempWrite,
    afterTempFsync: options.afterLeaseTempFsync,
  });
  if (tempPath !== expectedTempPath) {
    throw new ContractError("FILES_LOCK_LEASE", "recoverable lock temporary path is not deterministic");
  }
  const tempIdentity = fs.lstatSync(tempPath);
  let linked = false;
  try {
    options.beforeLeasePublish?.({ lockPath, tempPath, record: { ...record } });
    fs.linkSync(tempPath, lockPath);
    linked = true;
    const linkedIdentity = fs.lstatSync(lockPath);
    if (!sameFileIdentity(tempIdentity, linkedIdentity)) {
      throw new ContractError("FILES_OWNERSHIP", "published lock lease does not bind its complete temporary file");
    }
    options.afterLeaseLink?.({ lockPath, tempPath, record: { ...record } });
    unlinkOwnedFile(tempPath, tempIdentity, options);
    fsyncDirectoryBestEffort(path.dirname(lockPath));
    const published = parsePublishedRecoverableLease(lockPath, options);
    options.afterLeasePublish?.({ lockPath, record: { ...record } });
    return published;
  } catch (error) {
    if (linked && fs.existsSync(lockPath)) {
      try { unlinkOwnedFile(lockPath, tempIdentity, options, { bestEffort: true }); } catch { /* preserve publication error */ }
    }
    if (fs.existsSync(tempPath)) {
      try { unlinkOwnedFile(tempPath, tempIdentity, options, { bestEffort: true }); } catch { /* preserve publication error */ }
    }
    if (["EEXIST", "EPERM"].includes(error?.code) && fs.existsSync(lockPath)) {
      throw recoverableLockError(lockPath);
    }
    throw error;
  }
}

export function withRecoverableExclusiveLock(lockPath, callback, {
  lockStaleMs = 5 * 60_000,
  clockMs = Date.now,
  processIsAlive: processProbe = processIsAlive,
  lockIdFactory = randomUUID,
  ...options
} = {}) {
  if (typeof callback !== "function") {
    throw new ContractError("FILES_LOCK_LEASE", "recoverable lock callback must be callable");
  }
  const lockOptions = {
    ...options,
    lockStaleMs,
    clockMs,
    processIsAlive: processProbe,
    lockIdFactory,
  };
  const basePath = confinementBase(lockOptions);
  if (basePath === null) fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  else ensureConfinedDirectory(basePath, path.dirname(lockPath));
  assertRecoverableLockOptions(lockPath, lockOptions);

  let published = null;
  for (let attempt = 0; attempt < 4 && published === null; attempt += 1) {
    if (fs.existsSync(lockPath)) {
      const existing = parsePublishedRecoverableLease(lockPath, lockOptions);
      const now = lockOptions.clockMs();
      const age = now - existing.record.created_at_ms;
      if (!Number.isSafeInteger(now) || age < lockStaleMs || lockOptions.processIsAlive(existing.record.pid)) {
        throw recoverableLockError(lockPath);
      }
      lockOptions.beforeStaleReclaim?.({
        lockPath,
        record: { ...existing.record },
        identity: existing.identity,
      });
      reclaimPublishedRecoverableLease(lockPath, existing, lockOptions);
      lockOptions.afterStaleReclaim?.({ lockPath, record: { ...existing.record } });
    }
    try {
      published = publishRecoverableLease(lockPath, lockOptions);
    } catch (error) {
      if (!(error instanceof ContractError) || error.code !== "FILES_LOCKED") throw error;
      if (attempt === 3) throw error;
    }
  }
  if (published === null) throw recoverableLockError(lockPath);

  try {
    return callback();
  } finally {
    lockOptions.beforeLeaseCleanup?.({
      lockPath,
      record: { ...published.record },
      identity: published.identity,
    });
    isolatePublishedRecoverableLease(lockPath, published, lockOptions, "release");
    lockOptions.afterLeaseCleanup?.({ lockPath, record: { ...published.record } });
  }
}

export function publishImmutableSet({ files, markerPath, markerValue }, options = {}) {
  for (const entry of files) {
    if (fs.existsSync(entry.path)) {
      throw new ContractError("FILES_IMMUTABLE_EXISTS", `immutable artifact already exists: ${path.basename(entry.path)}`);
    }
  }
  if (fs.existsSync(markerPath)) {
    throw new ContractError("FILES_IMMUTABLE_EXISTS", `completion marker already exists: ${path.basename(markerPath)}`);
  }
  for (const entry of files) {
    atomicWriteImmutable(entry.path, entry.contents, options);
  }
  options.beforeMarker?.({ markerPath });
  atomicWriteJson(markerPath, markerValue, { immutable: true, ...options });
  return markerPath;
}
