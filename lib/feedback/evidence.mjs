import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { ContractError, fingerprint } from "./contracts.mjs";
import { isInside } from "./files.mjs";

const snapshotCleanupRoots = new WeakMap();

function fail(code, message) {
  throw new ContractError(code, message);
}

function runGit(workspaceRoot, args) {
  const result = spawnSync("git", args, {
    cwd: workspaceRoot,
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    fail("STATIC_EVIDENCE_GIT", `git ${args[0]} could not fingerprint the repository`);
  }
  return result.stdout ?? Buffer.alloc(0);
}

function repositoryPaths(workspaceRoot) {
  const resolvedRoot = path.resolve(workspaceRoot);
  return [...new Set(runGit(resolvedRoot, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((relativePath) => relativePath.replaceAll("\\", "/")))]
    .sort();
}

function contentDigest(contents) {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

export function captureOrdinaryTreeManifest(treeRoot) {
  const resolvedRoot = path.resolve(treeRoot);
  let rootStat;
  try {
    rootStat = fs.lstatSync(resolvedRoot);
  } catch {
    fail("EVIDENCE_TREE", "workspace manifest root is unavailable");
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    fail("EVIDENCE_TREE", "workspace manifest root must be an ordinary directory");
  }
  const entries = [];
  const pending = [{ absolute: resolvedRoot, relative: "" }];
  while (pending.length > 0) {
    const directory = pending.pop();
    const children = fs.readdirSync(directory.absolute, { withFileTypes: true })
      .sort((left, right) => right.name.localeCompare(left.name));
    for (const child of children) {
      const absolute = path.join(directory.absolute, child.name);
      const relative = directory.relative ? `${directory.relative}/${child.name}` : child.name;
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) fail("EVIDENCE_TREE_SYMLINK", `workspace manifest refuses symbolic link ${relative}`);
      if (stat.isDirectory()) {
        entries.push({
          path: relative,
          type: "directory",
          mode: stat.mode & 0o777,
        });
        pending.push({ absolute, relative });
      } else if (stat.isFile()) {
        const contents = fs.readFileSync(absolute);
        entries.push({
          path: relative,
          type: "file",
          mode: stat.mode & 0o777,
          size: contents.length,
          content_fingerprint: contentDigest(contents),
        });
      } else {
        fail("EVIDENCE_TREE_FILE", `workspace manifest path ${relative} is not a regular file`);
      }
    }
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return Object.freeze({
    entries: Object.freeze(entries.map((entry) => Object.freeze(entry))),
    fingerprint: fingerprint({ schema: "ordinary-tree-manifest-v1", entries }),
  });
}

export function changedOrdinaryTreePaths(before, after) {
  if (!before?.entries || !after?.entries) fail("EVIDENCE_TREE", "workspace manifests are required");
  const beforeEntries = new Map(before.entries.map((entry) => [entry.path, entry]));
  const afterEntries = new Map(after.entries.map((entry) => [entry.path, entry]));
  return [...new Set([...beforeEntries.keys(), ...afterEntries.keys()])]
    .filter((relativePath) => JSON.stringify(beforeEntries.get(relativePath)) !== JSON.stringify(afterEntries.get(relativePath)))
    .sort();
}

function captureRepositoryManifest(workspaceRoot, { materializeTo = null } = {}) {
  const resolvedRoot = path.resolve(workspaceRoot);
  const relativePaths = repositoryPaths(resolvedRoot);
  const entries = [];
  for (const relativePath of relativePaths) {
    if (path.isAbsolute(relativePath) || relativePath.split("/").some((segment) => segment === ".." || segment === "")) {
      fail("STATIC_EVIDENCE_PATH", "git returned an unsafe repository path");
    }
    const targetPath = path.resolve(resolvedRoot, ...relativePath.split("/"));
    if (!isInside(resolvedRoot, targetPath)) fail("STATIC_EVIDENCE_PATH", "git returned a path outside the repository");
    let stat;
    try {
      stat = fs.lstatSync(targetPath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        entries.push({ path: relativePath, type: "missing" });
        continue;
      }
      throw error;
    }
    if (stat.isSymbolicLink()) {
      fail("STATIC_EVIDENCE_SYMLINK", `repository snapshot refuses symbolic link ${relativePath}`);
    }
    if (!stat.isFile()) fail("STATIC_EVIDENCE_FILE", `repository path ${relativePath} is not a regular file`);
    const contents = fs.readFileSync(targetPath);
    const mode = stat.mode & 0o777;
    entries.push({
      path: relativePath,
      type: "file",
      mode,
      size: contents.length,
      content_fingerprint: contentDigest(contents),
    });
    if (materializeTo !== null) {
      const snapshotPath = path.resolve(materializeTo, ...relativePath.split("/"));
      if (!isInside(materializeTo, snapshotPath)) fail("STATIC_EVIDENCE_PATH", "snapshot path escapes its root");
      fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
      fs.writeFileSync(snapshotPath, contents, { mode });
      fs.chmodSync(snapshotPath, mode);
    }
  }
  return { entries, fingerprint: fingerprint({ schema: "repository-content-manifest-v1", entries }) };
}

function verifyMaterializedManifest(snapshotRoot, expected) {
  const expectedFiles = new Set(expected.entries.filter((entry) => entry.type === "file").map((entry) => entry.path));
  const expectedDirectories = new Set();
  for (const relativePath of expectedFiles) {
    let parent = path.posix.dirname(relativePath);
    while (parent !== ".") {
      expectedDirectories.add(parent);
      parent = path.posix.dirname(parent);
    }
  }
  const actualFiles = new Set();
  const actualDirectories = new Set();
  const pending = [{ absolute: snapshotRoot, relative: "" }];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory.absolute, { withFileTypes: true })) {
      const absolute = path.join(directory.absolute, entry.name);
      const relative = directory.relative ? `${directory.relative}/${entry.name}` : entry.name;
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) fail("STATIC_EVIDENCE_SNAPSHOT", `snapshot contains symbolic link ${relative}`);
      if (stat.isDirectory()) {
        actualDirectories.add(relative);
        pending.push({ absolute, relative });
      } else if (stat.isFile()) {
        actualFiles.add(relative);
      } else {
        fail("STATIC_EVIDENCE_SNAPSHOT", `snapshot contains non-regular path ${relative}`);
      }
    }
  }
  if (
    actualFiles.size !== expectedFiles.size
    || [...actualFiles].some((entry) => !expectedFiles.has(entry))
    || actualDirectories.size !== expectedDirectories.size
    || [...actualDirectories].some((entry) => !expectedDirectories.has(entry))
  ) {
    fail("STATIC_EVIDENCE_SNAPSHOT", "materialized snapshot path set differs from the captured source manifest");
  }
  const entries = expected.entries.map((entry) => {
    if (entry.type === "missing") return entry;
    const snapshotPath = path.resolve(snapshotRoot, ...entry.path.split("/"));
    if (!isInside(snapshotRoot, snapshotPath)) fail("STATIC_EVIDENCE_SNAPSHOT", `snapshot path escapes for ${entry.path}`);
    let stat;
    try {
      stat = fs.lstatSync(snapshotPath);
    } catch (error) {
      if (error?.code === "ENOENT") fail("STATIC_EVIDENCE_SNAPSHOT", `snapshot is missing ${entry.path}`);
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) fail("STATIC_EVIDENCE_SNAPSHOT", `snapshot path ${entry.path} is not a regular file`);
    const contents = fs.readFileSync(snapshotPath);
    return {
      path: entry.path,
      type: "file",
      mode: stat.mode & 0o777,
      size: contents.length,
      content_fingerprint: contentDigest(contents),
    };
  });
  const actualFingerprint = fingerprint({ schema: "repository-content-manifest-v1", entries });
  if (actualFingerprint !== expected.fingerprint) {
    fail("STATIC_EVIDENCE_SNAPSHOT", "materialized snapshot does not match the captured source manifest");
  }
}

export function materializeRepositorySnapshot(workspaceRoot) {
  const resolvedRoot = path.resolve(workspaceRoot);
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-static-"));
  if (temporaryRoot === resolvedRoot || isInside(resolvedRoot, temporaryRoot)) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    fail("STATIC_EVIDENCE_SNAPSHOT", "immutable verification snapshot must be outside the workspace");
  }
  const snapshotRoot = path.join(temporaryRoot, "repository");
  fs.mkdirSync(snapshotRoot);
  try {
    const manifest = captureRepositoryManifest(resolvedRoot, { materializeTo: snapshotRoot });
    verifyMaterializedManifest(snapshotRoot, manifest);
    const handle = {
      snapshotRoot,
      repositoryFingerprint: manifest.fingerprint,
      verifyIntegrity: () => verifyMaterializedManifest(snapshotRoot, manifest),
      cleanup: () => {
        fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
        snapshotCleanupRoots.delete(handle);
      },
    };
    snapshotCleanupRoots.set(handle, temporaryRoot);
    return handle;
  } catch (error) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    throw error;
  }
}

export function recoverMaterializedRepositorySnapshot(handle) {
  const temporaryRoot = snapshotCleanupRoots.get(handle);
  if (!temporaryRoot) return false;
  const resolvedTemporaryRoot = path.resolve(temporaryRoot);
  const resolvedOsTemp = path.resolve(os.tmpdir());
  if (
    path.dirname(resolvedTemporaryRoot) !== resolvedOsTemp
    || !path.basename(resolvedTemporaryRoot).startsWith("opencode-harness-static-")
  ) {
    fail("STATIC_EVIDENCE_CLEANUP", "snapshot recovery root is not a harness-owned OS temporary directory");
  }
  fs.rmSync(resolvedTemporaryRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  snapshotCleanupRoots.delete(handle);
  return !fs.existsSync(resolvedTemporaryRoot);
}

export function repositoryStateFingerprint(workspaceRoot) {
  return captureRepositoryManifest(path.resolve(workspaceRoot)).fingerprint;
}

export function runtimeOutputsFingerprint({ configOutput, agentOutputs, agentInventory }) {
  const inventory = [...agentInventory]
    .map(({ name, mode }) => ({ name, mode }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const agents = inventory.map(({ name, mode }) => ({
    name,
    mode,
    output: agentOutputs.get(name) ?? "",
  }));
  return fingerprint({ config: configOutput, inventory, agents });
}

export function permissionProfileFingerprint({ subjectFingerprint, runtimeFingerprint, surfaceFingerprint }) {
  return fingerprint({
    subject_fingerprint: subjectFingerprint,
    runtime_fingerprint: runtimeFingerprint,
    surface_fingerprint: surfaceFingerprint,
  });
}
