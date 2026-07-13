import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
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
