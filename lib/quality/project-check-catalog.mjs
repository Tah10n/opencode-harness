import fs from "node:fs";
import path from "node:path";

import {
  ContractError,
  assertArray,
  assertInteger,
  assertPlain,
  assertString,
  deepFrozenClone,
  exact,
  fingerprint,
} from "./validation.mjs";

export const PROJECT_CHECK_CATALOG_SCHEMA_VERSION = 1;
export const PROJECT_CHECK_CATALOG_PATH = ".opencode/quality/checks.json";
export const PROJECT_CHECK_PHASES = Object.freeze(["preimplementation", "slice", "integration"]);
export const PROJECT_CHECK_LIMITS = Object.freeze({
  max_checks: 64,
  max_argv_items: 64,
  max_argv_item_bytes: 4096,
  max_timeout_ms: 10 * 60 * 1000,
  max_output_chars: 4 * 1024 * 1024,
  max_catalog_bytes: 512 * 1024,
  max_checks_per_run: 64,
  max_receipt_bytes: 1024 * 1024,
});

const CHECK_KEYS = Object.freeze([
  "check_id",
  "argv",
  "cwd",
  "phases",
  "timeout_ms",
  "max_output_chars",
]);
const STANDARD_LITE_POLICY_KEYS = Object.freeze([
  "allowed_ownership_prefixes",
  "protected_paths",
]);
const FORBIDDEN_COMMAND_INTERPRETERS = new Set([
  "bash",
  "bash.exe",
  "cmd",
  "cmd.exe",
  "csh",
  "dash",
  "fish",
  "env",
  "env.exe",
  "ksh",
  "busybox",
  "busybox.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
  "sh",
  "sh.exe",
  "wsl",
  "wsl.exe",
  "zsh",
]);
const EVAL_INTERPRETERS = new Map([
  ["node", { short: ["-e", "-p"], long: ["--eval", "--print"] }],
  ["node.exe", { short: ["-e", "-p"], long: ["--eval", "--print"] }],
  ["python", { short: ["-c"], long: [] }],
  ["python.exe", { short: ["-c"], long: [] }],
  ["python3", { short: ["-c"], long: [] }],
  ["python3.exe", { short: ["-c"], long: [] }],
  ["ruby", { short: ["-e"], long: [] }],
  ["ruby.exe", { short: ["-e"], long: [] }],
  ["perl", { short: ["-e"], long: [] }],
  ["perl.exe", { short: ["-e"], long: [] }],
]);

function containsNul(value) {
  return value.includes("\0");
}

function assertBoundedArg(value, label) {
  if (typeof value !== "string") throw new ContractError("QUALITY_CHECK_ARGV", `${label} must be a string`);
  if (Buffer.byteLength(value, "utf8") > PROJECT_CHECK_LIMITS.max_argv_item_bytes || containsNul(value)) {
    throw new ContractError("QUALITY_CHECK_ARGV", `${label} must be bounded UTF-8 without NUL`);
  }
}

function executableBasename(value) {
  return value.replaceAll("\\", "/").split("/").at(-1).toLowerCase();
}

function validateArgvExecution(argv, label) {
  const executable = executableBasename(argv[0]);
  if (FORBIDDEN_COMMAND_INTERPRETERS.has(executable) || ["npx", "npx.cmd"].includes(executable)) {
    throw new ContractError("QUALITY_CHECK_EXECUTABLE", `${label} cannot invoke a command interpreter or package executor`);
  }
  const evalFlags = EVAL_INTERPRETERS.get(executable);
  if (evalFlags && argv.slice(1).some((entry) => {
    const normalized = entry.toLowerCase();
    return evalFlags.short.some((flag) => normalized.startsWith(flag))
      || evalFlags.long.some((flag) => normalized === flag || normalized.startsWith(`${flag}=`));
  })) {
    throw new ContractError("QUALITY_CHECK_EXECUTABLE", `${label} cannot execute source text supplied by JSON`);
  }
  if (["npm", "npm.cmd"].includes(executable)) {
    const operation = argv[1]?.toLowerCase();
    if (!operation || !["run", "test"].includes(operation)) {
      throw new ContractError("QUALITY_CHECK_EXECUTABLE", `${label} npm invocation must use a repository-owned run or test script`);
    }
  }
}

function canonicalRelativeCwd(value, label) {
  if (typeof value === "string"
    && (containsNul(value) || path.isAbsolute(value) || /^[A-Za-z]:/u.test(value) || value.startsWith("\\\\"))) {
    throw new ContractError("QUALITY_CHECK_CWD", `${label} must be a relative worktree path`);
  }
  assertString(value, label, { maxBytes: 1000 });
  const segments = value.replaceAll("\\", "/").split("/");
  if (segments.some((segment) => segment === "..")) {
    throw new ContractError("QUALITY_CHECK_CWD", `${label} cannot contain parent traversal`);
  }
  const normalized = path.posix.normalize(segments.filter((segment) => segment !== "").join("/") || ".");
  if (normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/")) {
    throw new ContractError("QUALITY_CHECK_CWD", `${label} escapes the worktree`);
  }
  return normalized;
}

function canonicalPolicyPath(value, label) {
  const normalized = canonicalRelativeCwd(value, label);
  if (normalized === ".") {
    throw new ContractError("QUALITY_STANDARD_LITE_POLICY", `${label} cannot grant or protect the entire worktree`);
  }
  return normalized;
}

function validatePolicyPaths(values, label, { min = 0 } = {}) {
  assertArray(values, label, { min, max: 128 });
  const normalized = values.map((entry, index) => canonicalPolicyPath(entry, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    throw new ContractError("QUALITY_STANDARD_LITE_POLICY", `${label} must contain unique paths`);
  }
  return normalized.sort();
}

function validateStandardLitePolicy(value) {
  if (value === undefined) return null;
  assertPlain(value, "project check catalog.standard_lite_policy");
  exact(value, STANDARD_LITE_POLICY_KEYS, STANDARD_LITE_POLICY_KEYS, "project check catalog.standard_lite_policy");
  const allowedOwnershipPrefixes = validatePolicyPaths(
    value.allowed_ownership_prefixes,
    "project check catalog.standard_lite_policy.allowed_ownership_prefixes",
    { min: 1 },
  );
  const protectedPaths = validatePolicyPaths(
    value.protected_paths,
    "project check catalog.standard_lite_policy.protected_paths",
  );
  return {
    allowed_ownership_prefixes: allowedOwnershipPrefixes,
    protected_paths: protectedPaths,
  };
}

function assertInside(root, target, label) {
  const relative = path.relative(root, target);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return;
  throw new ContractError("QUALITY_CHECK_CWD_ESCAPE", `${label} resolves outside the worktree`);
}

export function resolveProjectCheckCwd(workspaceRoot, cwd, label = "project check cwd") {
  const root = fs.realpathSync(path.resolve(workspaceRoot));
  const relative = canonicalRelativeCwd(cwd, label);
  const candidate = path.resolve(root, ...relative.split("/"));
  assertInside(root, candidate, label);
  let resolved;
  try {
    resolved = fs.realpathSync(candidate);
  } catch {
    throw new ContractError("QUALITY_CHECK_CWD_UNAVAILABLE", `${label} does not exist`);
  }
  assertInside(root, resolved, label);
  if (path.relative(candidate, resolved) !== "") {
    throw new ContractError("QUALITY_CHECK_CWD_SYMLINK", `${label} cannot traverse a symlink or junction`);
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new ContractError("QUALITY_CHECK_CWD", `${label} must resolve to a directory`);
  }
  return Object.freeze({ relative, resolved });
}

function validateCheck(value, index, workspaceRoot) {
  const label = `project check catalog.checks[${index}]`;
  assertPlain(value, label);
  exact(value, CHECK_KEYS, CHECK_KEYS, label);
  assertString(value.check_id, `${label}.check_id`, { maxBytes: 128 });
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(value.check_id)) {
    throw new ContractError("QUALITY_CHECK_ID", `${label}.check_id is invalid`);
  }
  assertArray(value.argv, `${label}.argv`, { min: 1, max: PROJECT_CHECK_LIMITS.max_argv_items });
  value.argv.forEach((entry, argvIndex) => {
    assertBoundedArg(entry, `${label}.argv[${argvIndex}]`);
  });
  if (value.argv[0].trim().length === 0) {
    throw new ContractError("QUALITY_CHECK_EXECUTABLE", `${label}.argv[0] must be a non-empty executable`);
  }
  validateArgvExecution(value.argv, `${label}.argv`);
  const cwd = canonicalRelativeCwd(value.cwd, `${label}.cwd`);
  if (workspaceRoot !== null) resolveProjectCheckCwd(workspaceRoot, cwd, `${label}.cwd`);
  assertArray(value.phases, `${label}.phases`, { min: 1, max: PROJECT_CHECK_PHASES.length });
  if (new Set(value.phases).size !== value.phases.length
    || value.phases.some((phase) => !PROJECT_CHECK_PHASES.includes(phase))) {
    throw new ContractError("QUALITY_CHECK_PHASE", `${label}.phases must be unique supported phases`);
  }
  assertInteger(value.timeout_ms, `${label}.timeout_ms`, { min: 1, max: PROJECT_CHECK_LIMITS.max_timeout_ms });
  assertInteger(value.max_output_chars, `${label}.max_output_chars`, {
    min: 1,
    max: PROJECT_CHECK_LIMITS.max_output_chars,
  });
  return {
    check_id: value.check_id,
    argv: [...value.argv],
    cwd,
    phases: [...value.phases],
    timeout_ms: value.timeout_ms,
    max_output_chars: value.max_output_chars,
  };
}

export function validateProjectCheckCatalog(value, { workspaceRoot = null } = {}) {
  assertPlain(value, "project check catalog");
  exact(value, ["schema_version", "catalog_id", "standard_lite_policy", "checks"], ["schema_version", "catalog_id", "checks"], "project check catalog");
  if (value.schema_version !== PROJECT_CHECK_CATALOG_SCHEMA_VERSION) {
    throw new ContractError("QUALITY_CHECK_CATALOG_VERSION", "project check catalog schema_version is unsupported");
  }
  assertString(value.catalog_id, "project check catalog.catalog_id", { maxBytes: 128 });
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.catalog_id)) {
    throw new ContractError("QUALITY_CHECK_CATALOG_ID", "project check catalog.catalog_id is invalid");
  }
  assertArray(value.checks, "project check catalog.checks", { min: 1, max: PROJECT_CHECK_LIMITS.max_checks });
  const checks = value.checks.map((entry, index) => validateCheck(entry, index, workspaceRoot));
  const ids = checks.map((entry) => entry.check_id);
  if (new Set(ids).size !== ids.length) {
    throw new ContractError("QUALITY_CHECK_DUPLICATE", "project check IDs must be unique");
  }
  const standardLitePolicy = validateStandardLitePolicy(value.standard_lite_policy);
  return deepFrozenClone({
    schema_version: PROJECT_CHECK_CATALOG_SCHEMA_VERSION,
    catalog_id: value.catalog_id,
    ...(standardLitePolicy === null ? {} : { standard_lite_policy: standardLitePolicy }),
    checks,
  }, "validated project check catalog");
}

export function parseProjectCheckCatalog(serialized, options = {}) {
  if (typeof serialized !== "string" || Buffer.byteLength(serialized, "utf8") > PROJECT_CHECK_LIMITS.max_catalog_bytes) {
    throw new ContractError("QUALITY_CHECK_CATALOG_SIZE", "project check catalog must be bounded UTF-8 JSON");
  }
  let value;
  try {
    value = JSON.parse(serialized.replace(/^\uFEFF/u, ""));
  } catch {
    throw new ContractError("QUALITY_CHECK_CATALOG_JSON", "project check catalog must contain valid JSON");
  }
  return validateProjectCheckCatalog(value, options);
}

export function projectCheckCatalogFingerprint(catalog) {
  return fingerprint(validateProjectCheckCatalog(catalog));
}

export function loadProjectCheckCatalog(workspaceRoot, { relativePath = PROJECT_CHECK_CATALOG_PATH } = {}) {
  const root = fs.realpathSync(path.resolve(workspaceRoot));
  const normalized = canonicalRelativeCwd(path.posix.dirname(relativePath.replaceAll("\\", "/")), "project check catalog directory");
  const manifestName = path.posix.basename(relativePath.replaceAll("\\", "/"));
  if (manifestName !== "checks.json") {
    throw new ContractError("QUALITY_CHECK_CATALOG_PATH", "project check catalog filename must be checks.json");
  }
  const directory = resolveProjectCheckCwd(root, normalized, "project check catalog directory");
  const candidate = path.join(directory.resolved, manifestName);
  let realManifest;
  try {
    realManifest = fs.realpathSync(candidate);
  } catch {
    throw new ContractError("QUALITY_CHECK_CATALOG_MISSING", `missing ${PROJECT_CHECK_CATALOG_PATH}`);
  }
  assertInside(root, realManifest, "project check catalog");
  if (path.relative(candidate, realManifest) !== "") {
    throw new ContractError("QUALITY_CHECK_CATALOG_PATH", "project check catalog cannot be a symlink");
  }
  let descriptor;
  let serialized;
  try {
    descriptor = fs.openSync(realManifest, "r");
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) {
      throw new ContractError("QUALITY_CHECK_CATALOG_PATH", "project check catalog must be a regular file");
    }
    if (stat.size > PROJECT_CHECK_LIMITS.max_catalog_bytes) {
      throw new ContractError("QUALITY_CHECK_CATALOG_SIZE", "project check catalog must be bounded UTF-8 JSON");
    }
    const bounded = Buffer.alloc(PROJECT_CHECK_LIMITS.max_catalog_bytes + 1);
    let bytesRead = 0;
    while (bytesRead < bounded.length) {
      const count = fs.readSync(descriptor, bounded, bytesRead, bounded.length - bytesRead, null);
      if (count === 0) break;
      bytesRead += count;
    }
    if (bytesRead > PROJECT_CHECK_LIMITS.max_catalog_bytes) {
      throw new ContractError("QUALITY_CHECK_CATALOG_SIZE", "project check catalog must be bounded UTF-8 JSON");
    }
    try {
      serialized = new TextDecoder("utf-8", { fatal: true }).decode(bounded.subarray(0, bytesRead));
    } catch {
      throw new ContractError("QUALITY_CHECK_CATALOG_JSON", "project check catalog must contain valid UTF-8 JSON");
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  if (serialized === undefined) {
    throw new ContractError("QUALITY_CHECK_CATALOG_PATH", "project check catalog must be a regular file");
  }
  const catalog = parseProjectCheckCatalog(serialized, { workspaceRoot: root });
  return Object.freeze({
    relative_path: relativePath.replaceAll("\\", "/"),
    catalog,
    fingerprint: projectCheckCatalogFingerprint(catalog),
  });
}

export function projectCatalogToEngineeringCatalog(catalog, trustedProducer) {
  const validated = validateProjectCheckCatalog(catalog);
  return {
    catalog_id: validated.catalog_id,
    checks: validated.checks.map((entry) => ({
      check_id: entry.check_id,
      trusted_producer: trustedProducer,
      phases: [...entry.phases],
      available: true,
    })),
    mechanisms: [
      { mechanism_id: "normal-architect-challenge", trusted_producer: trustedProducer, phases: ["preimplementation", "integration"], available: true },
      { mechanism_id: "normal-reviewer-challenge", trusted_producer: trustedProducer, phases: ["preimplementation", "integration"], available: true },
    ],
  };
}
