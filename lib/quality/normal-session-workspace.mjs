import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { isInside } from "../feedback/files.mjs";
import { normalizeRelativePath } from "../feedback/privacy.mjs";
import {
  ContractError,
  assertArray,
  assertFingerprint,
  assertPlain,
  assertString,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

const MAX_CHANGED_PATHS = 4096;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_AGGREGATE_BYTES = 128 * 1024 * 1024;
const CONTROL_COMPONENTS = new Set([".git", ".oc_harness"]);

function sha256Bytes(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function runGit(workspaceRoot, args, maxBuffer = 16 * 1024 * 1024) {
  const result = spawnSync("git", args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 30_000,
    maxBuffer,
  });
  if (result.error || result.status !== 0) {
    throw new ContractError("QUALITY_WORKSPACE_GIT", `trusted Git observation failed: git ${args[0]}`);
  }
  return result.stdout;
}

function canonicalChangedPath(value, workspaceRoot, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") || Buffer.byteLength(value, "utf8") > 1000) {
    throw new ContractError("QUALITY_WORKSPACE_PATH", `${label} is not a bounded path`);
  }
  const slash = value.replaceAll("\\", "/");
  const normalized = normalizeRelativePath(slash, label);
  if (normalized !== slash || path.isAbsolute(value)) {
    throw new ContractError("QUALITY_WORKSPACE_PATH", `${label} is not a canonical worktree-relative path`);
  }
  const resolved = path.resolve(workspaceRoot, ...normalized.split("/"));
  if (!isInside(workspaceRoot, resolved)) {
    throw new ContractError("QUALITY_WORKSPACE_PATH", `${label} escapes the worktree`);
  }
  return normalized;
}

function parseStatus(serialized, workspaceRoot) {
  if (serialized === "") return new Map();
  const parts = serialized.split("\0");
  if (parts.at(-1) !== "") {
    throw new ContractError("QUALITY_WORKSPACE_GIT", "git status output is partial");
  }
  parts.pop();
  const result = new Map();
  for (let index = 0; index < parts.length; index += 1) {
    const entry = parts[index];
    if (entry.length < 4 || entry[2] !== " ") {
      throw new ContractError("QUALITY_WORKSPACE_GIT", "git status output is malformed");
    }
    const status = entry.slice(0, 2);
    const current = canonicalChangedPath(entry.slice(3), workspaceRoot, "git status path");
    result.set(current, status);
    if (status.includes("R") || status.includes("C")) {
      index += 1;
      if (index >= parts.length) throw new ContractError("QUALITY_WORKSPACE_GIT", "git rename status is partial");
      const source = canonicalChangedPath(parts[index], workspaceRoot, "git status source path");
      result.set(source, `${status}:source`);
    }
  }
  if (result.size > MAX_CHANGED_PATHS) {
    throw new ContractError("QUALITY_WORKSPACE_SNAPSHOT_LIMIT", `workspace has more than ${MAX_CHANGED_PATHS} changed paths`);
  }
  return result;
}

function parsePathList(serialized, workspaceRoot, label) {
  if (serialized === "") return [];
  const parts = serialized.split("\0");
  if (parts.at(-1) !== "") throw new ContractError("QUALITY_WORKSPACE_GIT", `${label} output is partial`);
  parts.pop();
  const paths = parts.map((entry) => canonicalChangedPath(entry, workspaceRoot, `${label} path`));
  if (paths.length > MAX_CHANGED_PATHS) {
    throw new ContractError("QUALITY_WORKSPACE_SNAPSHOT_LIMIT", `${label} returned more than ${MAX_CHANGED_PATHS} paths`);
  }
  return paths;
}

function canonicalIncludedPaths(values, workspaceRoot) {
  assertArray(values, "workspace included paths", { max: MAX_CHANGED_PATHS });
  const result = values.map((entry, index) => {
    const normalized = canonicalChangedPath(entry, workspaceRoot, `workspace included paths[${index}]`);
    if (normalized.split("/").some((component) => CONTROL_COMPONENTS.has(component.toLowerCase()))) {
      throw new ContractError("QUALITY_CONTROL_PATH", `workspace included paths[${index}] cannot target runner or Git control state`);
    }
    return normalized;
  });
  return [...new Set(result)].sort();
}

function includeDirectObservablePath(selected, workspaceRoot, relativePath) {
  const resolved = path.resolve(workspaceRoot, ...relativePath.split("/"));
  try {
    if (fs.lstatSync(resolved).isDirectory()) return;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw new ContractError("QUALITY_WORKSPACE_UNREADABLE", `included path cannot be inspected: ${relativePath}`);
    }
  }
  if (!selected.has(relativePath)) selected.set(relativePath, "explicit");
}

function parseIndex(serialized, workspaceRoot, selectedPaths) {
  const result = new Map();
  if (serialized === "") return result;
  const entries = serialized.split("\0");
  if (entries.at(-1) !== "") throw new ContractError("QUALITY_WORKSPACE_GIT", "git index output is partial");
  entries.pop();
  for (const entry of entries) {
    const tab = entry.indexOf("\t");
    if (tab < 1) throw new ContractError("QUALITY_WORKSPACE_GIT", "git index output is malformed");
    const metadata = entry.slice(0, tab);
    if (!/^\d{6} [0-9a-f]{40,64} [0-3]$/u.test(metadata)) {
      throw new ContractError("QUALITY_WORKSPACE_GIT", "git index metadata is malformed");
    }
    const file = canonicalChangedPath(entry.slice(tab + 1), workspaceRoot, "git index path");
    if (selectedPaths.has(file)) result.set(file, metadata);
  }
  return result;
}

function hashRegularFile(file, bytesBudget) {
  const stat = fs.lstatSync(file);
  if (stat.size > MAX_FILE_BYTES || bytesBudget.used + stat.size > MAX_AGGREGATE_BYTES) {
    throw new ContractError("QUALITY_WORKSPACE_SNAPSHOT_LIMIT", "changed-file hashing limit was exceeded");
  }
  bytesBudget.used += stat.size;
  return `regular:${stat.mode}:${stat.size}:${sha256Bytes(fs.readFileSync(file))}`;
}

function worktreeMarker(workspaceRoot, relativePath, bytesBudget) {
  const resolved = path.resolve(workspaceRoot, ...relativePath.split("/"));
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    if (error?.code === "ENOENT") return "absent";
    throw new ContractError("QUALITY_WORKSPACE_UNREADABLE", `changed path cannot be inspected: ${relativePath}`);
  }
  if (stat.isSymbolicLink()) {
    const target = fs.readlinkSync(resolved);
    return `symlink:${sha256Bytes(target)}`;
  }
  if (stat.isFile()) return hashRegularFile(resolved, bytesBudget);
  throw new ContractError("QUALITY_WORKSPACE_UNSUPPORTED_KIND", `changed path has an unsupported file kind: ${relativePath}`);
}

export function observeContentBoundWorkspace(workspaceRoot, salt = "normal-session-workspace-v2", includedPaths = []) {
  assertString(salt, "workspace observation salt", { maxBytes: 256 });
  const root = fs.realpathSync(path.resolve(workspaceRoot));
  const headSha = runGit(root, ["rev-parse", "HEAD"]).trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/u.test(headSha)) throw new ContractError("QUALITY_WORKSPACE_GIT", "trusted Git HEAD is invalid");
  const status = parseStatus(runGit(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]), root);
  const included = canonicalIncludedPaths(includedPaths, root);
  const selected = new Map(status);
  if (included.length > 0) {
    const ignored = parsePathList(runGit(root, [
      "--literal-pathspecs",
      "ls-files",
      "--others",
      "--ignored",
      "--exclude-standard",
      "-z",
      "--",
      ...included,
    ]), root, "git ignored-path query");
    for (const file of ignored) if (!selected.has(file)) selected.set(file, "!!");
    for (const file of included) includeDirectObservablePath(selected, root, file);
  }
  if (selected.size > MAX_CHANGED_PATHS) {
    throw new ContractError("QUALITY_WORKSPACE_SNAPSHOT_LIMIT", `workspace has more than ${MAX_CHANGED_PATHS} observed paths`);
  }
  const index = parseIndex(runGit(root, ["ls-files", "--stage", "-z"]), root, new Set(selected.keys()));
  const bytesBudget = { used: 0 };
  const entries = [...selected.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([file, code]) => {
    const source = {
      salt,
      path: file,
      status: code,
      index: index.get(file) ?? "absent",
      worktree: worktreeMarker(root, file, bytesBudget),
    };
    return { path: file, fingerprint: fingerprint(source) };
  });
  return deepFrozenClone({
    head_sha: headSha,
    entries,
    fingerprint: fingerprint({ head_sha: headSha, entries }),
  }, "content-bound workspace snapshot");
}

export function validateContentBoundWorkspace(value, label = "workspace snapshot") {
  exact(value, ["head_sha", "entries", "fingerprint"], ["head_sha", "entries", "fingerprint"], label);
  if (!/^[0-9a-f]{40}$/u.test(value.head_sha)) throw new ContractError("QUALITY_WORKSPACE_GIT", `${label}.head_sha is invalid`);
  assertArray(value.entries, `${label}.entries`, { max: MAX_CHANGED_PATHS });
  let previous = null;
  for (let index = 0; index < value.entries.length; index += 1) {
    const entry = value.entries[index];
    assertPlain(entry, `${label}.entries[${index}]`);
    exact(entry, ["path", "fingerprint"], ["path", "fingerprint"], `${label}.entries[${index}]`);
    assertString(entry.path, `${label}.entries[${index}].path`, { maxBytes: 1000 });
    assertFingerprint(entry.fingerprint, `${label}.entries[${index}].fingerprint`);
    if (previous !== null && previous.localeCompare(entry.path) >= 0) {
      throw new ContractError("QUALITY_WORKSPACE_ORDER", `${label}.entries must be unique and sorted`);
    }
    previous = entry.path;
  }
  assertFingerprint(value.fingerprint, `${label}.fingerprint`);
  if (!fingerprintsEqual(value.fingerprint, fingerprint({ head_sha: value.head_sha, entries: value.entries }))) {
    throw new ContractError("QUALITY_WORKSPACE_FINGERPRINT", `${label}.fingerprint does not bind its entries`);
  }
  return value;
}

export function diffContentBoundWorkspaces(before, after) {
  validateContentBoundWorkspace(before, "workspace before");
  validateContentBoundWorkspace(after, "workspace after");
  const left = new Map(before.entries.map((entry) => [entry.path, entry.fingerprint]));
  const right = new Map(after.entries.map((entry) => [entry.path, entry.fingerprint]));
  return Object.freeze([...new Set([...left.keys(), ...right.keys()])]
    .filter((file) => left.get(file) !== right.get(file))
    .sort());
}

export function normalizeNormalSessionOwnedPath(value, workspaceRoot, label, { allowHostPath = false } = {}) {
  assertString(value, label, { maxBytes: 4000 });
  const root = fs.realpathSync(path.resolve(workspaceRoot));
  let candidate = value;
  if (allowHostPath && path.isAbsolute(candidate)) {
    const absolute = path.resolve(candidate);
    if (!isInside(root, absolute)) throw new ContractError("QUALITY_WRITE_SCOPE_VIOLATION", `${label} escapes the worktree`);
    candidate = path.relative(root, absolute);
  }
  const slash = candidate.replaceAll("\\", "/");
  const normalized = normalizeRelativePath(slash, label);
  if (normalized !== slash || (!allowHostPath && normalized !== value) || path.isAbsolute(candidate)) {
    throw new ContractError("QUALITY_PATH_CANONICAL", `${label} must be a canonical relative path`);
  }
  if (normalized.split("/").some((component) => CONTROL_COMPONENTS.has(component.toLowerCase()))) {
    throw new ContractError("QUALITY_CONTROL_PATH", `${label} cannot target runner or Git control state`);
  }
  const resolved = path.resolve(root, ...normalized.split("/"));
  if (!isInside(root, resolved)) throw new ContractError("QUALITY_WRITE_SCOPE_VIOLATION", `${label} escapes the worktree`);
  let ancestor = resolved;
  while (!fs.existsSync(ancestor) && path.dirname(ancestor) !== ancestor) ancestor = path.dirname(ancestor);
  if (!isInside(root, fs.realpathSync(ancestor))) {
    throw new ContractError("QUALITY_WRITE_SCOPE_VIOLATION", `${label} resolves outside the real worktree`);
  }
  return normalized;
}
