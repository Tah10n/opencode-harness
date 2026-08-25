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
  const executablePath = fs.realpathSync.native(value.executable_path);
  const executableStat = ordinaryFile(executablePath, `${label}.executable_path`);
  if (process.platform !== "win32" && (executableStat.mode & 0o111) === 0) {
    fail("CORE_RUNTIME_UNTRUSTED_FILE", `${label}.executable_path is not executable`);
  }
  if (!Array.isArray(value.argv) || value.argv.length > 64
    || value.argv.some((entry) => typeof entry !== "string" || entry.length > 4096 || entry.includes("\0"))) {
    fail("CORE_RUNTIME_SCHEMA", `${label}.argv is invalid`);
  }
  const cwd = relativePath(value.cwd, `${label}.cwd`);
  const cwdPath = fs.realpathSync.native(path.resolve(workspaceRoot, ...cwd.split("/")));
  inside(workspaceRoot, cwdPath, `${label}.cwd`);
  if (!fs.statSync(cwdPath).isDirectory()) fail("CORE_RUNTIME_SCHEMA", `${label}.cwd is not a directory`);
  if (!Number.isSafeInteger(value.timeout_ms) || value.timeout_ms < 1 || value.timeout_ms > 15 * 60 * 1000) {
    fail("CORE_RUNTIME_SCHEMA", `${label}.timeout_ms is invalid`);
  }
  return Object.freeze({
    check_id: value.check_id,
    scope_prefixes: Object.freeze([...scopePrefixes].sort()),
    cost_rank: value.cost_rank,
    executable_path: executablePath,
    argv: Object.freeze([...value.argv]),
    cwd,
    cwd_path: cwdPath,
    timeout_ms: value.timeout_ms,
  });
}

export function loadCoreVerificationCatalog(workspaceRoot, { catalogPath = CORE_CHECK_CATALOG_PATH } = {}) {
  const root = fs.realpathSync.native(path.resolve(workspaceRoot));
  const relativeCatalog = relativePath(catalogPath, "catalogPath", { rootAllowed: false });
  const candidate = path.resolve(root, ...relativeCatalog.split("/"));
  inside(root, candidate, "catalogPath");
  if (!fs.existsSync(candidate)) {
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
  let value;
  try {
    value = JSON.parse(fs.readFileSync(realCatalog, "utf8").replace(/^\uFEFF/u, ""));
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
  return Object.freeze({
    workspace_root: root,
    catalog_path: realCatalog,
    catalog_status: "loaded",
    catalog_fingerprint: fingerprint(sealedSource),
    checks: Object.freeze(checks),
  });
}

function gitFiles(workspaceRoot) {
  const result = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
    cwd: workspaceRoot,
    encoding: "buffer",
    shell: false,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail("CORE_RUNTIME_SNAPSHOT", "workspace file inventory is unavailable");
  }
  return result.stdout.toString("utf8").split("\0").filter(Boolean).sort();
}

export function snapshotCoreWorkspace(workspaceRoot) {
  const root = fs.realpathSync.native(path.resolve(workspaceRoot));
  const files = {};
  for (const relative of gitFiles(root)) {
    relativePath(relative, "workspace path", { rootAllowed: false });
    const candidate = path.resolve(root, ...relative.split("/"));
    inside(root, candidate, "workspace path");
    const stat = fs.lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) fail("CORE_RUNTIME_SNAPSHOT", "workspace contains an unsupported tracked path");
    const real = fs.realpathSync.native(candidate);
    if (real !== candidate) fail("CORE_RUNTIME_SNAPSHOT", "workspace path traverses a link");
    files[relative] = `sha256:${createHash("sha256").update(fs.readFileSync(real)).digest("hex")}`;
  }
  return Object.freeze({ files: Object.freeze(files), workspace_fingerprint: fingerprint(files) });
}

export function changedCoreWorkspacePaths(before, after) {
  const paths = [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])].sort();
  return Object.freeze(paths.filter((entry) => before.files[entry] !== after.files[entry]));
}

export function runCoreTrustedCheck(check) {
  const commandFingerprint = fingerprint({
    executable_path: check.executable_path,
    argv: check.argv,
    cwd: check.cwd,
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
  const outcome = checkRunner(selected);
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
