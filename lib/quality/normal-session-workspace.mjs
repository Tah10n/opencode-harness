import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import { isInside } from "../feedback/files.mjs";
import { normalizeRelativePath } from "../feedback/privacy.mjs";
import {
  ContractError,
  assertArray,
  assertFingerprint,
  assertInteger,
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

function trustedGitCandidates() {
  if (process.platform === "win32") {
    return [
      "C:\\Program Files\\Git\\cmd\\git.exe",
      "C:\\Program Files\\Git\\bin\\git.exe",
      "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
      "C:\\Program Files (x86)\\Git\\bin\\git.exe",
    ];
  }
  return ["/usr/bin/git", "/usr/local/bin/git", "/opt/homebrew/bin/git"];
}

function trustedGitInstallRoots() {
  if (process.platform === "win32") {
    return [
      "C:\\Program Files\\Git",
      "C:\\Program Files (x86)\\Git",
    ];
  }
  return ["/usr/bin", "/usr/local", "/opt/homebrew"];
}

export function resolveTrustedGitExecutable() {
  for (const candidate of trustedGitCandidates()) {
    try {
      const resolved = fs.realpathSync.native(candidate);
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) continue;
      const normalized = process.platform === "win32" ? resolved.toLowerCase() : resolved;
      const trusted = trustedGitInstallRoots().some((root) => {
        const canonicalRoot = fs.realpathSync.native(root);
        const normalizedRoot = process.platform === "win32" ? canonicalRoot.toLowerCase() : canonicalRoot;
        return normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}${path.sep}`);
      });
      if (trusted) return resolved;
    } catch {
      // Try the next fixed, system-owned install location.
    }
  }
  throw new ContractError("QUALITY_WORKSPACE_GIT", "trusted Git executable is unavailable at a fixed system install location");
}

function safeGitEnvironment(workspaceRoot, gitExecutable) {
  const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";
  const trustedPathEntries = [path.dirname(gitExecutable)];
  const environment = {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: nullDevice,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "safe.directory",
    GIT_CONFIG_VALUE_0: workspaceRoot,
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    LANG: "C",
    LC_ALL: "C",
  };
  if (process.platform === "win32") {
    const systemRoot = `${path.parse(gitExecutable).root}Windows`;
    environment.SystemRoot = systemRoot;
    environment.WINDIR = systemRoot;
    trustedPathEntries.push(path.join(systemRoot, "System32"));
  } else {
    trustedPathEntries.push("/usr/bin", "/bin");
  }
  environment.PATH = [...new Set(trustedPathEntries)].join(path.delimiter);
  return environment;
}

function sha256Bytes(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function runSafeGitObservation(workspaceRoot, args, maxBuffer = 16 * 1024 * 1024) {
  const root = fs.realpathSync(path.resolve(workspaceRoot));
  const gitExecutable = resolveTrustedGitExecutable();
  const noHooksPath = process.platform === "win32" ? "NUL" : "/dev/null";
  const safeArgs = [
    "-c", "core.fsmonitor=false",
    "-c", `core.hooksPath=${noHooksPath}`,
    "--no-optional-locks",
    ...args,
  ];
  const result = spawnSync(gitExecutable, safeArgs, {
    cwd: root,
    encoding: "utf8",
    env: safeGitEnvironment(root, gitExecutable),
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

function parseHiddenTrackedPaths(serialized, workspaceRoot) {
  if (serialized === "") return new Map();
  const parts = serialized.split("\0");
  if (parts.at(-1) !== "") throw new ContractError("QUALITY_WORKSPACE_GIT", "git hidden tracked-path output is partial");
  parts.pop();
  const result = new Map();
  for (const entry of parts) {
    if (entry.length < 3 || entry[1] !== " ") throw new ContractError("QUALITY_WORKSPACE_GIT", "git hidden tracked-path output is malformed");
    const flag = entry[0];
    if (flag === "H") continue;
    result.set(canonicalChangedPath(entry.slice(2), workspaceRoot, "git hidden tracked path"), flag);
  }
  if (result.size > MAX_CHANGED_PATHS) {
    throw new ContractError("QUALITY_WORKSPACE_SNAPSHOT_LIMIT", `workspace has more than ${MAX_CHANGED_PATHS} hidden tracked paths`);
  }
  return result;
}

function excludesControlState(relativePath) {
  return relativePath.split("/").some((component) => CONTROL_COMPONENTS.has(component.toLowerCase()));
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
  const headSha = runSafeGitObservation(root, ["rev-parse", "HEAD"]).trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/u.test(headSha)) throw new ContractError("QUALITY_WORKSPACE_GIT", "trusted Git HEAD is invalid");
  const status = parseStatus(runSafeGitObservation(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]), root);
  const included = canonicalIncludedPaths(includedPaths, root);
  const selected = new Map(status);
  const hiddenTracked = parseHiddenTrackedPaths(runSafeGitObservation(root, ["ls-files", "-v", "-z"]), root);
  const ignored = parsePathList(runSafeGitObservation(root, [
    "ls-files",
    "--others",
    "--ignored",
    "--exclude-standard",
    "-z",
  ]), root, "git ignored-path query");
  for (const file of ignored) {
    if (included.some((scope) => file === scope || file.startsWith(`${scope}/`)) && !selected.has(file)) selected.set(file, "!!");
  }
  for (const file of included) includeDirectObservablePath(selected, root, file);
  for (const file of [...selected.keys()]) {
    if (excludesControlState(file)) selected.delete(file);
  }
  if (selected.size > MAX_CHANGED_PATHS) {
    throw new ContractError("QUALITY_WORKSPACE_SNAPSHOT_LIMIT", `workspace has more than ${MAX_CHANGED_PATHS} observed paths`);
  }
  const hiddenInventory = new Map(hiddenTracked);
  for (const file of ignored) {
    if (!included.some((scope) => file === scope || file.startsWith(`${scope}/`))) hiddenInventory.set(file, "!!");
  }
  for (const file of [...hiddenInventory.keys()]) {
    if (excludesControlState(file)) hiddenInventory.delete(file);
  }
  const inventoryPaths = [...hiddenInventory.keys()]
    .sort();
  if (inventoryPaths.length > MAX_CHANGED_PATHS) {
    throw new ContractError("QUALITY_WORKSPACE_SNAPSHOT_LIMIT", `workspace has more than ${MAX_CHANGED_PATHS} inventory paths`);
  }
  const indexPaths = new Set([...selected.keys(), ...inventoryPaths]);
  const index = parseIndex(runSafeGitObservation(root, ["ls-files", "--stage", "-z"]), root, indexPaths);
  const bytesBudget = { used: 0 };
  const worktreeMarkers = new Map();
  const markerFor = (file) => {
    if (!worktreeMarkers.has(file)) worktreeMarkers.set(file, worktreeMarker(root, file, bytesBudget));
    return worktreeMarkers.get(file);
  };
  const entries = [...selected.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([file, code]) => {
    const source = {
      salt,
      path: file,
      status: code,
      index: index.get(file) ?? "absent",
      worktree: markerFor(file),
    };
    return { path: file, fingerprint: fingerprint(source) };
  });
  const inventoryFingerprint = fingerprint(inventoryPaths.map((file) => ({
    path_fingerprint: sha256Bytes(file),
    marker_fingerprint: fingerprint({
      salt,
      path: file,
      hidden_kind: hiddenInventory.get(file),
      index: index.get(file) ?? "absent",
      worktree: markerFor(file),
    }),
  })));
  const dirty = [...status.keys()].some((file) => !excludesControlState(file));
  return deepFrozenClone({
    head_sha: headSha,
    entries,
    dirty,
    inventory_count: inventoryPaths.length,
    inventory_fingerprint: inventoryFingerprint,
    fingerprint: fingerprint({ head_sha: headSha, entries, dirty, inventory_count: inventoryPaths.length, inventory_fingerprint: inventoryFingerprint }),
  }, "content-bound workspace snapshot");
}

export function validateContentBoundWorkspace(value, label = "workspace snapshot") {
  exact(value, ["head_sha", "entries", "dirty", "inventory_count", "inventory_fingerprint", "fingerprint"], ["head_sha", "entries", "fingerprint"], label);
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
  if (Object.hasOwn(value, "dirty") && typeof value.dirty !== "boolean") {
    throw new ContractError("QUALITY_WORKSPACE_SCHEMA", `${label}.dirty must be boolean`);
  }
  if (Object.hasOwn(value, "inventory_fingerprint")) {
    assertInteger(value.inventory_count, `${label}.inventory_count`, { min: 0, max: MAX_CHANGED_PATHS });
    assertFingerprint(value.inventory_fingerprint, `${label}.inventory_fingerprint`);
  } else if (Object.hasOwn(value, "inventory_count")) {
    throw new ContractError("QUALITY_WORKSPACE_SCHEMA", `${label} inventory fields must be present together`);
  }
  assertFingerprint(value.fingerprint, `${label}.fingerprint`);
  const fingerprintSource = Object.hasOwn(value, "inventory_fingerprint")
    ? { head_sha: value.head_sha, entries: value.entries, dirty: value.dirty, inventory_count: value.inventory_count, inventory_fingerprint: value.inventory_fingerprint }
    : { head_sha: value.head_sha, entries: value.entries };
  if (!fingerprintsEqual(value.fingerprint, fingerprint(fingerprintSource))) {
    throw new ContractError("QUALITY_WORKSPACE_FINGERPRINT", `${label}.fingerprint does not bind its entries`);
  }
  return value;
}

export function diffContentBoundWorkspaces(before, after) {
  validateContentBoundWorkspace(before, "workspace before");
  validateContentBoundWorkspace(after, "workspace after");
  if (before.head_sha !== after.head_sha) {
    throw new ContractError("QUALITY_WORKSPACE_HEAD_CHANGED", "workspace HEAD changed during an authorized operation");
  }
  if (Object.hasOwn(before, "inventory_fingerprint") && Object.hasOwn(after, "inventory_fingerprint")
    && (before.inventory_count !== after.inventory_count || before.inventory_fingerprint !== after.inventory_fingerprint)) {
    throw new ContractError("QUALITY_WORKSPACE_INVENTORY_CHANGED", "hidden workspace inventory changed outside an explicitly observable path");
  }
  const left = new Map(before.entries.map((entry) => [entry.path, entry.fingerprint]));
  const right = new Map(after.entries.map((entry) => [entry.path, entry.fingerprint]));
  const changed = [...new Set([...left.keys(), ...right.keys()])]
    .filter((file) => left.get(file) !== right.get(file))
    .sort();
  return Object.freeze(changed);
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
  let current = root;
  for (const component of normalized.split("/")) {
    current = path.join(current, component);
    let identity;
    try {
      identity = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw new ContractError("QUALITY_WORKSPACE_UNREADABLE", `${label} cannot be safely resolved`);
    }
    if (identity.isSymbolicLink()) {
      throw new ContractError("QUALITY_PATH_CANONICAL", `${label} cannot traverse a symbolic link or junction`);
    }
    if (identity.isFile() && identity.nlink > 1) {
      throw new ContractError("QUALITY_PATH_CANONICAL", `${label} cannot target a multiply-linked file`);
    }
    const canonical = fs.realpathSync(current);
    const comparable = (candidatePath) => {
      const normalizedPath = path.normalize(candidatePath);
      return process.platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
    };
    if (comparable(canonical) !== comparable(current)) {
      throw new ContractError("QUALITY_PATH_CANONICAL", `${label} cannot traverse a filesystem alias`);
    }
  }
  return normalized;
}
