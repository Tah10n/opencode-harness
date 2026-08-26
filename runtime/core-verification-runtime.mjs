import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  completeCoreVerification,
  coreVerificationActivationObservation,
  coreVerificationTerminalDecision,
  createCoreVerificationGate,
  recordCoreWorkspaceMutation,
  startCoreVerification,
} from "./core-verification-gate.mjs";

export const CORE_CHECK_CATALOG_PATH = ".git/opencode-harness/core/checks.json";
const CORE_CHECK_GIT_PATH = "opencode-harness/core/checks.json";
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const MAX_CATALOG_BYTES = 256 * 1024;

export class CoreVerificationRuntimeError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "CoreVerificationRuntimeError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new CoreVerificationRuntimeError(code, message);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
}

function exact(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    fail("CORE_RUNTIME_SCHEMA", `${label} must contain exactly ${keys.join(", ")}`);
  }
}

function safeId(value, label) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail("CORE_RUNTIME_SCHEMA", `${label} is invalid`);
  return value;
}

function relativePath(value, label, { rootAllowed = true } = {}) {
  if (typeof value !== "string" || value.length < 1 || value.length > 512
    || value.includes("\\") || value.includes("\0") || path.isAbsolute(value)) {
    fail("CORE_RUNTIME_SCHEMA", `${label} is invalid`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === ".." || normalized.startsWith("../")
    || (!rootAllowed && normalized === ".")) fail("CORE_RUNTIME_SCHEMA", `${label} is invalid`);
  return normalized;
}

function ordinaryFile(target, label) {
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch {
    fail("CORE_RUNTIME_UNAVAILABLE", `${label} is unavailable`);
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    fail("CORE_RUNTIME_UNTRUSTED_FILE", `${label} must be a singly-linked ordinary file`);
  }
  return stat;
}

function readStableOrdinaryFile(target, label, { executable = false } = {}) {
  const canonicalPath = fs.realpathSync.native(target);
  let descriptor;
  try {
    descriptor = fs.openSync(canonicalPath, "r");
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n
      || (executable && process.platform !== "win32" && (before.mode & 0o111n) === 0n)) {
      fail("CORE_RUNTIME_UNTRUSTED_FILE", `${label} is not a trusted ordinary file`);
    }
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor, { bigint: true });
    const pathAfter = fs.lstatSync(canonicalPath, { bigint: true });
    for (const key of ["dev", "ino", "mode", "nlink", "size", "mtimeNs", "ctimeNs"]) {
      if (before[key] !== after[key] || after[key] !== pathAfter[key]) {
        fail("CORE_RUNTIME_IDENTITY_CHANGED", `${label} changed while it was read`);
      }
    }
    return Object.freeze({ bytes, identity: Object.freeze({
      canonical_path: canonicalPath,
      size: Number(after.size),
      mode: Number(after.mode),
      device: after.dev.toString(10),
      inode: after.ino.toString(10),
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    }) });
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function sha256File(target) {
  return readStableOrdinaryFile(target, "workspace file").identity.sha256;
}

function fileIdentity(target, label, options = {}) {
  return readStableOrdinaryFile(target, label, options).identity;
}

function directoryIdentity(target, label) {
  const canonicalPath = fs.realpathSync.native(target);
  const stat = fs.statSync(canonicalPath);
  if (!stat.isDirectory()) fail("CORE_RUNTIME_UNTRUSTED_CWD", `${label} is not a directory`);
  return Object.freeze({ canonical_path: canonicalPath, mode: stat.mode, device: stat.dev, inode: stat.ino });
}

function assertIdentityCurrent(expected, label, { directory = false } = {}) {
  let current;
  try {
    current = directory ? directoryIdentity(expected.canonical_path, label) : fileIdentity(
      expected.canonical_path,
      label,
      { executable: label.includes("executable") },
    );
  } catch {
    fail("CORE_RUNTIME_IDENTITY_CHANGED", `${label} identity is unavailable`);
  }
  for (const key of Object.keys(expected)) {
    if (current[key] !== expected[key]) fail("CORE_RUNTIME_IDENTITY_CHANGED", `${label} identity changed`);
  }
}

function assertTrustedAncestry(target, label) {
  let current = path.dirname(target);
  while (true) {
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail("CORE_RUNTIME_UNTRUSTED_ANCESTRY", `${label} ancestry is not ordinary`);
    const writableByOthers = (stat.mode & 0o022) !== 0;
    const stickyDirectory = (stat.mode & 0o1000) !== 0;
    if (writableByOthers && !stickyDirectory) {
      fail("CORE_RUNTIME_UNTRUSTED_ANCESTRY", `${label} ancestry is writable by another principal`);
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function gitValue(root, args, label) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false, windowsHide: true });
  if (result.error || result.status !== 0 || result.signal !== null || result.stdout.includes("\0")) {
    fail("CORE_RUNTIME_REPOSITORY", `${label} is unavailable`);
  }
  return result.stdout.trim();
}

function resolveDefaultCatalog(root) {
  const topLevel = fs.realpathSync.native(gitValue(root, ["rev-parse", "--show-toplevel"], "repository top level"));
  if (topLevel !== root) fail("CORE_RUNTIME_REPOSITORY", "workspace does not match the repository top level");
  const gitDirectoryValue = gitValue(root, ["rev-parse", "--absolute-git-dir"], "repository Git directory");
  const gitDirectory = fs.realpathSync.native(path.resolve(root, gitDirectoryValue));
  const catalogValue = gitValue(root, ["rev-parse", "--git-path", CORE_CHECK_GIT_PATH], "core catalog Git path");
  const candidate = path.resolve(root, catalogValue);
  const relative = path.relative(gitDirectory, candidate);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    fail("CORE_RUNTIME_REPOSITORY", "core catalog is outside the repository Git directory");
  }
  return Object.freeze({ candidate, git_directory: gitDirectory, top_level: topLevel });
}

function referencedInputIdentities(argv, cwdPath) {
  const candidates = new Set();
  const packageManifest = path.join(cwdPath, "package.json");
  if (fs.existsSync(packageManifest)) candidates.add(packageManifest);
  for (const argument of argv) {
    if (argument.startsWith("-") || argument.length === 0) continue;
    const candidate = path.isAbsolute(argument) ? argument : path.resolve(cwdPath, argument);
    if (fs.existsSync(candidate) && fs.lstatSync(candidate).isFile()) candidates.add(candidate);
  }
  return Object.freeze([...candidates].sort().map((candidate) => fileIdentity(candidate, "argv input")));
}

function inside(root, target, label) {
  const relative = path.relative(root, target);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return target;
  fail("CORE_RUNTIME_ESCAPE", `${label} escapes the workspace`);
}

function normalizeCheck(value, index, workspaceRoot) {
  const label = `checks[${index}]`;
  exact(value, ["check_id", "scope_prefixes", "cost_rank", "executable_path", "argv", "cwd", "timeout_ms"], label);
  safeId(value.check_id, `${label}.check_id`);
  if (!Array.isArray(value.scope_prefixes) || value.scope_prefixes.length > 128) {
    fail("CORE_RUNTIME_SCHEMA", `${label}.scope_prefixes is invalid`);
  }
  const scopePrefixes = value.scope_prefixes.map((entry, entryIndex) => (
    relativePath(entry, `${label}.scope_prefixes[${entryIndex}]`, { rootAllowed: false })
  ));
  if (new Set(scopePrefixes).size !== scopePrefixes.length) fail("CORE_RUNTIME_SCHEMA", `${label}.scope_prefixes contains duplicates`);
  if (!Number.isSafeInteger(value.cost_rank) || value.cost_rank < 0 || value.cost_rank > 1_000_000) {
    fail("CORE_RUNTIME_SCHEMA", `${label}.cost_rank is invalid`);
  }
  if (typeof value.executable_path !== "string" || !path.isAbsolute(value.executable_path)
    || value.executable_path.includes("\0")) fail("CORE_RUNTIME_SCHEMA", `${label}.executable_path must be absolute`);
  const executableIdentity = fileIdentity(value.executable_path, `${label}.executable_path`, { executable: true });
  const executablePath = executableIdentity.canonical_path;
  assertTrustedAncestry(executablePath, `${label}.executable_path`);
  if (!Array.isArray(value.argv) || value.argv.length > 64
    || value.argv.some((entry) => typeof entry !== "string" || entry.length > 4096 || entry.includes("\0"))) {
    fail("CORE_RUNTIME_SCHEMA", `${label}.argv is invalid`);
  }
  const cwd = relativePath(value.cwd, `${label}.cwd`);
  const cwdPath = fs.realpathSync.native(path.resolve(workspaceRoot, ...cwd.split("/")));
  inside(workspaceRoot, cwdPath, `${label}.cwd`);
  if (!fs.statSync(cwdPath).isDirectory()) fail("CORE_RUNTIME_SCHEMA", `${label}.cwd is not a directory`);
  const cwdIdentity = directoryIdentity(cwdPath, `${label}.cwd`);
  assertTrustedAncestry(cwdPath, `${label}.cwd`);
  if (!Number.isSafeInteger(value.timeout_ms) || value.timeout_ms < 1 || value.timeout_ms > 15 * 60 * 1000) {
    fail("CORE_RUNTIME_SCHEMA", `${label}.timeout_ms is invalid`);
  }
  return Object.freeze({
    check_id: value.check_id,
    scope_prefixes: Object.freeze([...scopePrefixes].sort()),
    cost_rank: value.cost_rank,
    executable_path: executablePath,
    executable_identity: executableIdentity,
    argv: Object.freeze([...value.argv]),
    cwd,
    cwd_path: cwdPath,
    cwd_identity: cwdIdentity,
    input_manifest: referencedInputIdentities(value.argv, cwdPath),
    timeout_ms: value.timeout_ms,
  });
}

export function loadCoreVerificationCatalog(workspaceRoot, {
  catalogPath = CORE_CHECK_CATALOG_PATH,
  catalogRequired = true,
} = {}) {
  const root = fs.realpathSync.native(path.resolve(workspaceRoot));
  const resolvedCatalog = catalogPath === CORE_CHECK_CATALOG_PATH
    ? resolveDefaultCatalog(root)
    : { candidate: inside(root, path.resolve(root, ...relativePath(catalogPath, "catalogPath", { rootAllowed: false }).split("/")), "catalogPath"), git_directory: null, top_level: root };
  const { candidate } = resolvedCatalog;
  if (!fs.existsSync(candidate)) {
    if (catalogRequired) fail("CORE_RUNTIME_CATALOG_REQUIRED", "required core verification catalog is absent");
    const sealedSource = { schema_version: 1, catalog_id: "absent", checks: [] };
    return Object.freeze({
      workspace_root: root,
      catalog_path: candidate,
      catalog_status: "absent",
      catalog_fingerprint: fingerprint(sealedSource),
      checks: Object.freeze([]),
    });
  }
  const stat = ordinaryFile(candidate, "core verification catalog");
  if (stat.size > MAX_CATALOG_BYTES) fail("CORE_RUNTIME_SCHEMA", "core verification catalog is too large");
  const realCatalog = fs.realpathSync.native(candidate);
  if (realCatalog !== candidate) fail("CORE_RUNTIME_UNTRUSTED_FILE", "core verification catalog cannot traverse links");
  if (resolvedCatalog.git_directory !== null) {
    const relative = path.relative(resolvedCatalog.git_directory, realCatalog);
    if (relative.startsWith("..") || path.isAbsolute(relative)) fail("CORE_RUNTIME_REPOSITORY", "core catalog escaped the repository Git directory");
  }
  const observed = readStableOrdinaryFile(realCatalog, "core verification catalog");
  let value;
  try {
    value = JSON.parse(observed.bytes.toString("utf8").replace(/^\uFEFF/u, ""));
  } catch {
    fail("CORE_RUNTIME_SCHEMA", "core verification catalog must be valid JSON");
  }
  exact(value, ["schema_version", "catalog_id", "checks"], "catalog");
  if (value.schema_version !== 1) fail("CORE_RUNTIME_SCHEMA", "core verification catalog version is unsupported");
  safeId(value.catalog_id, "catalog.catalog_id");
  if (!Array.isArray(value.checks) || value.checks.length > 64) fail("CORE_RUNTIME_SCHEMA", "catalog.checks is invalid");
  const checks = value.checks.map((entry, index) => normalizeCheck(entry, index, root));
  if (new Set(checks.map((entry) => entry.check_id)).size !== checks.length) {
    fail("CORE_RUNTIME_SCHEMA", "catalog check IDs must be unique");
  }
  const sealedSource = {
    schema_version: 1,
    catalog_id: value.catalog_id,
    checks: checks.map(({ cwd_path: _cwdPath, ...entry }) => entry),
  };
  const catalogIdentity = observed.identity;
  return Object.freeze({
    workspace_root: root,
    catalog_path: realCatalog,
    catalog_status: "loaded",
    catalog_fingerprint: fingerprint(sealedSource),
    catalog_identity: catalogIdentity,
    repository_identity: Object.freeze(resolvedCatalog),
    checks: Object.freeze(checks),
  });
}

const SNAPSHOT_EXCLUDED_PREFIXES = Object.freeze([".git", ".oc_harness", "node_modules", ".opencode/node_modules"]);

function gitOutput(workspaceRoot, args, label) {
  const result = spawnSync("git", args, {
    cwd: workspaceRoot,
    encoding: "buffer",
    shell: false,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail("CORE_RUNTIME_SNAPSHOT", `${label} is unavailable`);
  }
  return result.stdout.toString("utf8");
}

function snapshotPathExcluded(relative) {
  return SNAPSHOT_EXCLUDED_PREFIXES.some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`));
}

function gitSnapshotInventory(workspaceRoot) {
  const visible = gitOutput(workspaceRoot, ["ls-files", "-co", "--exclude-standard", "-z"], "workspace file inventory")
    .split("\0").filter(Boolean);
  const ignored = gitOutput(workspaceRoot, ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"], "ignored workspace inventory")
    .split("\0").filter(Boolean);
  const ignoredSet = new Set(ignored);
  const stageEntries = new Map();
  for (const record of gitOutput(workspaceRoot, ["ls-files", "--stage", "-z"], "workspace index inventory").split("\0").filter(Boolean)) {
    const match = /^(\d{6}) ([0-9a-f]{40,64}) ([0-3])\t([\s\S]+)$/u.exec(record);
    if (match === null || match[3] !== "0") fail("CORE_RUNTIME_REPOSITORY_SHAPE", "workspace index contains an unsupported entry");
    stageEntries.set(match[4], Object.freeze({ mode: match[1], object: match[2] }));
  }
  const files = [...new Set([...visible, ...ignored])].filter((entry) => !snapshotPathExcluded(entry)).sort();
  return Object.freeze({ files, ignored: ignoredSet, stage_entries: stageEntries });
}

function snapshotSubmodule(candidate, relative, indexEntry) {
  if (!fs.existsSync(candidate)) return null;
  const stat = fs.lstatSync(candidate);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("CORE_RUNTIME_REPOSITORY_SHAPE", `submodule ${relative} has an unsupported shape`);
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: candidate, encoding: "utf8", shell: false, windowsHide: true });
  const status = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: candidate, encoding: "utf8", shell: false, windowsHide: true });
  if (head.status !== 0 || status.status !== 0 || !/^[0-9a-f]{40,64}\n?$/u.test(head.stdout)) {
    fail("CORE_RUNTIME_REPOSITORY_SHAPE", `submodule ${relative} identity is unavailable`);
  }
  return Object.freeze({
    kind: "submodule",
    index_object: indexEntry.object,
    head: head.stdout.trim(),
    worktree_status: fingerprint(status.stdout),
  });
}

export function snapshotCoreWorkspace(workspaceRoot) {
  const root = fs.realpathSync.native(path.resolve(workspaceRoot));
  const inventory = gitSnapshotInventory(root);
  const files = {};
  for (const relative of inventory.files) {
    relativePath(relative, "workspace path", { rootAllowed: false });
    const candidate = path.resolve(root, ...relative.split("/"));
    inside(root, candidate, "workspace path");
    // `git ls-files -c` intentionally retains deleted tracked paths. Preserve
    // that absence in the snapshot instead of dereferencing a path that no
    // longer exists: deletion and the old side of a rename are mutations too.
    if (!fs.existsSync(candidate)) {
      files[relative] = null;
      continue;
    }
    const indexEntry = inventory.stage_entries.get(relative);
    if (indexEntry?.mode === "160000") {
      files[relative] = snapshotSubmodule(candidate, relative, indexEntry);
      continue;
    }
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink()) {
      files[relative] = Object.freeze({
        kind: "symlink",
        target: fs.readlinkSync(candidate),
        ignored: inventory.ignored.has(relative),
      });
      continue;
    }
    if (!stat.isFile()) fail("CORE_RUNTIME_REPOSITORY_SHAPE", `workspace path ${relative} has an unsupported type`);
    const real = fs.realpathSync.native(candidate);
    if (real !== candidate) fail("CORE_RUNTIME_REPOSITORY_SHAPE", `workspace path ${relative} traverses a link`);
    files[relative] = Object.freeze({
      kind: "file",
      sha256: sha256File(real),
      executable: process.platform === "win32" ? null : (stat.mode & 0o111) !== 0,
      ignored: inventory.ignored.has(relative),
    });
  }
  return Object.freeze({ files: Object.freeze(files), workspace_fingerprint: fingerprint(files) });
}

export function changedCoreWorkspacePaths(before, after) {
  const paths = [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])].sort();
  return Object.freeze(paths.filter((entry) => (
    JSON.stringify(canonical(before.files[entry])) !== JSON.stringify(canonical(after.files[entry]))
  )));
}

export function runCoreTrustedCheck(check) {
  try {
    assertIdentityCurrent(check.executable_identity, "check executable");
    assertIdentityCurrent(check.cwd_identity, "check cwd", { directory: true });
    for (const input of check.input_manifest) assertIdentityCurrent(input, "check argv input");
    assertTrustedAncestry(check.executable_path, "check executable");
    assertTrustedAncestry(check.cwd_path, "check cwd");
  } catch (error) {
    return Object.freeze({
      status: "unavailable",
      detail_code: error?.code === "CORE_RUNTIME_IDENTITY_CHANGED"
        ? "trusted-input-identity-changed" : "trusted-input-untrusted",
      command_fingerprint: fingerprint({
        executable_identity: check.executable_identity,
        cwd_identity: check.cwd_identity,
        input_manifest: check.input_manifest,
        argv: check.argv,
      }),
    });
  }
  const commandFingerprint = fingerprint({
    executable_identity: check.executable_identity,
    argv: check.argv,
    cwd_identity: check.cwd_identity,
    input_manifest: check.input_manifest,
    timeout_ms: check.timeout_ms,
  });
  const result = spawnSync(check.executable_path, check.argv, {
    cwd: check.cwd_path,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: check.timeout_ms,
    maxBuffer: 4 * 1024 * 1024,
  });
  let status;
  let detailCode;
  if (result.error?.code === "ENOENT" || result.error?.code === "EACCES") {
    status = "unavailable";
    detailCode = "executable-unavailable";
  } else if (result.error !== undefined || result.signal !== null) {
    status = "unrelated_infrastructure_failure";
    detailCode = result.error?.code === "ETIMEDOUT" ? "check-timeout" : "check-infrastructure-failure";
  } else if (result.status === 0) {
    status = "passed";
    detailCode = "exit-zero";
  } else {
    status = "failed";
    detailCode = "nonzero-exit";
  }
  return Object.freeze({ status, detail_code: detailCode, command_fingerprint: commandFingerprint });
}

export function verifyCoreWorkspaceMutation({ catalog, before, after, checkRunner = runCoreTrustedCheck }) {
  const changedPaths = changedCoreWorkspacePaths(before, after);
  let state = createCoreVerificationGate({
    catalog_fingerprint: catalog.catalog_fingerprint,
    checks: catalog.checks.map((entry) => ({
      check_id: entry.check_id,
      scope_prefixes: entry.scope_prefixes,
      cost_rank: entry.cost_rank,
    })),
  });
  if (changedPaths.length === 0) {
    return Object.freeze({ state, decision: coreVerificationTerminalDecision(state), observation: coreVerificationActivationObservation(state), check: null });
  }
  state = recordCoreWorkspaceMutation(state, {
    changed_paths: changedPaths,
    workspace_fingerprint: after.workspace_fingerprint,
  });
  if (state.selected_check_id === null) {
    return Object.freeze({ state, decision: coreVerificationTerminalDecision(state), observation: coreVerificationActivationObservation(state), check: null });
  }
  const selected = catalog.checks.find((entry) => entry.check_id === state.selected_check_id);
  state = startCoreVerification(state, { check_id: selected.check_id });
  let outcome;
  try {
    if (catalog.catalog_identity !== undefined) assertIdentityCurrent(catalog.catalog_identity, "core verification catalog");
    outcome = checkRunner(selected);
  } catch (error) {
    outcome = Object.freeze({
      status: "unavailable",
      detail_code: error?.code === "CORE_RUNTIME_IDENTITY_CHANGED"
        ? "catalog-identity-changed" : "catalog-untrusted",
      command_fingerprint: catalog.catalog_fingerprint,
    });
  }
  state = completeCoreVerification(state, {
    check_id: selected.check_id,
    mutation_revision: state.mutation_revision,
    workspace_fingerprint: state.workspace_fingerprint,
    ...outcome,
  });
  const postCheck = snapshotCoreWorkspace(catalog.workspace_root);
  const checkMutations = changedCoreWorkspacePaths(after, postCheck);
  if (checkMutations.length > 0) {
    state = recordCoreWorkspaceMutation(state, {
      changed_paths: checkMutations,
      workspace_fingerprint: postCheck.workspace_fingerprint,
    });
  }
  return Object.freeze({
    state,
    decision: coreVerificationTerminalDecision(state),
    observation: coreVerificationActivationObservation(state),
    check: outcome,
  });
}
