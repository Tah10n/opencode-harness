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

export const PROJECT_CHECK_CATALOG_SCHEMA_VERSION = 2;
export const PROJECT_CHECK_CATALOG_PATH = ".opencode/quality/checks.json";
export const PROJECT_CHECK_PHASES = Object.freeze(["preimplementation", "slice", "integration"]);
export const PROJECT_CHECK_PURPOSES = Object.freeze(["verification", "architecture_graph", "bug_reproducer"]);
export const PROJECT_CHECK_OUTCOMES = Object.freeze([
  "failing_reproducer",
  "passing_regression",
  "unrelated_failure",
  "unavailable",
]);
export const PROJECT_CHECK_LIMITS = Object.freeze({
  max_checks: 64,
  max_argv_items: 64,
  max_argv_item_bytes: 4096,
  max_generated_output_paths: 32,
  max_timeout_ms: 10 * 60 * 1000,
  max_output_chars: 4 * 1024 * 1024,
  max_catalog_bytes: 512 * 1024,
  max_checks_per_run: 64,
  max_receipt_bytes: 1024 * 1024,
});

const CHECK_KEYS = Object.freeze([
  "check_id",
  "executable_id",
  "argv",
  "cwd",
  "phases",
  "purpose",
  "outcome_protocol",
  "generated_output_paths",
  "timeout_ms",
  "max_output_chars",
]);
const CHECK_REQUIRED_KEYS = Object.freeze([
  "check_id",
  "executable_id",
  "argv",
  "cwd",
  "phases",
  "purpose",
  "timeout_ms",
  "max_output_chars",
]);
const STANDARD_LITE_POLICY_KEYS = Object.freeze(["allowed_ownership_prefixes", "protected_paths"]);
const CONTROL_COMPONENTS = new Set([".git", ".oc_harness", ".opencode"]);
const SECRET_FILE_NAMES = new Set([".env", ".npmrc", ".pypirc", ".netrc", "credentials", "credentials.json", "secrets.json"]);
const EXECUTABLE_ARG_NAMES = new Set([
  "node", "node.exe", "npm", "npm.cmd", "python", "python.exe", "python3", "python3.exe",
  "pytest", "pytest.exe", "go", "go.exe", "cargo", "cargo.exe", "java", "java.exe",
  "mvn", "mvn.cmd", "mvn.exe", "maven", "gradle", "gradle.bat", "gradle.exe",
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

function validateExecutableId(value, label) {
  if (typeof value !== "string" || value.includes("\0") || Buffer.byteLength(value, "utf8") > 128
    || !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(value)
    || value.includes("/") || value.includes("\\") || path.isAbsolute(value)) {
    throw new ContractError("QUALITY_CHECK_EXECUTABLE_ID", `${label} must be a logical executable ID`);
  }
  return value;
}

function canonicalRelativePath(value, label, { allowRoot = true, code = "QUALITY_CHECK_CWD" } = {}) {
  if (typeof value === "string"
    && (containsNul(value) || value.includes("\\") || path.isAbsolute(value) || /^[A-Za-z]:/u.test(value) || value.startsWith("\\\\"))) {
    throw new ContractError(code, `${label} must be a canonical forward-slash worktree path`);
  }
  assertString(value, label, { maxBytes: 1000 });
  const forward = value.replaceAll("\\", "/");
  const segments = forward.split("/");
  if (segments.some((segment) => segment === "..")) {
    throw new ContractError(code, `${label} cannot contain parent traversal`);
  }
  const normalized = path.posix.normalize(segments.filter((segment) => segment !== "").join("/") || ".");
  if (normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/")) {
    throw new ContractError(code, `${label} escapes the worktree`);
  }
  if (!allowRoot && normalized === ".") throw new ContractError(code, `${label} cannot target the entire worktree`);
  if (forward !== normalized && !(normalized === "." && forward === ".")) {
    throw new ContractError(code, `${label} must be canonical and use forward slashes`);
  }
  return normalized;
}

function canonicalPolicyPath(value, label) {
  return canonicalRelativePath(value, label, { allowRoot: false, code: "QUALITY_STANDARD_LITE_POLICY" });
}

function canonicalGeneratedOutputPath(value, label) {
  const normalized = canonicalRelativePath(value, label, { allowRoot: false, code: "QUALITY_CHECK_OUTPUT_PATH" });
  const components = normalized.toLowerCase().split("/");
  if (components.some((segment) => CONTROL_COMPONENTS.has(segment))) {
    throw new ContractError("QUALITY_CONTROL_PATH", `${label} cannot target Git or runner control state`);
  }
  if (components.some((segment) => SECRET_FILE_NAMES.has(segment) || segment.startsWith(".env.")
    || /(?:^|[._-])(?:secret|credential|private[-_]?key)(?:[._-]|$)/u.test(segment))) {
    throw new ContractError("QUALITY_CHECK_OUTPUT_PATH", `${label} cannot target secret-like material`);
  }
  return normalized;
}

function validateDistinctPaths(values, label, normalizer, { min = 0, max = 128 } = {}) {
  assertArray(values, label, { min, max });
  const normalized = values.map((entry, index) => normalizer(entry, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    throw new ContractError("QUALITY_CHECK_PATH_DUPLICATE", `${label} must contain unique paths`);
  }
  const sorted = [...normalized].sort();
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted.some((candidate, candidateIndex) => candidateIndex !== index
      && (candidate.startsWith(`${sorted[index]}/`) || sorted[index].startsWith(`${candidate}/`)))) {
      throw new ContractError("QUALITY_CHECK_PATH_OVERLAP", `${label} cannot contain overlapping paths`);
    }
  }
  return sorted;
}

function validatePolicyPaths(values, label, { min = 0 } = {}) {
  return validateDistinctPaths(values, label, canonicalPolicyPath, { min, max: 128 });
}

function validateStandardLitePolicy(value) {
  if (value === undefined) return null;
  assertPlain(value, "project check catalog.standard_lite_policy");
  exact(value, STANDARD_LITE_POLICY_KEYS, STANDARD_LITE_POLICY_KEYS, "project check catalog.standard_lite_policy");
  return {
    allowed_ownership_prefixes: validatePolicyPaths(
      value.allowed_ownership_prefixes,
      "project check catalog.standard_lite_policy.allowed_ownership_prefixes",
      { min: 1 },
    ),
    protected_paths: validatePolicyPaths(
      value.protected_paths,
      "project check catalog.standard_lite_policy.protected_paths",
    ),
  };
}

function validateOutcomeProtocol(value, label) {
  assertPlain(value, label);
  exact(value, ["kind", "exit_codes"], ["kind", "exit_codes"], label);
  if (value.kind !== "exit_code") {
    throw new ContractError("QUALITY_CHECK_OUTCOME_PROTOCOL", `${label}.kind must be exit_code`);
  }
  assertPlain(value.exit_codes, `${label}.exit_codes`);
  exact(value.exit_codes, PROJECT_CHECK_OUTCOMES, PROJECT_CHECK_OUTCOMES, `${label}.exit_codes`);
  const seen = new Set();
  const exitCodes = {};
  for (const outcome of PROJECT_CHECK_OUTCOMES) {
    const outcomeLabel = `${label}.exit_codes.${outcome}`;
    assertArray(value.exit_codes[outcome], outcomeLabel, { min: 1, max: 16 });
    const codes = value.exit_codes[outcome].map((entry, index) => {
      assertInteger(entry, `${outcomeLabel}[${index}]`, { min: 0, max: 0xffff_ffff });
      if (seen.has(entry)) {
        throw new ContractError("QUALITY_CHECK_OUTCOME_PROTOCOL", `${label} exit-code classifications must be disjoint`);
      }
      seen.add(entry);
      return entry;
    });
    exitCodes[outcome] = [...codes].sort((left, right) => left - right);
  }
  return { kind: "exit_code", exit_codes: exitCodes };
}

function assertInside(root, target, label) {
  const relative = path.relative(root, target);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return;
  throw new ContractError("QUALITY_CHECK_CWD_ESCAPE", `${label} resolves outside the worktree`);
}

export function resolveProjectCheckCwd(workspaceRoot, cwd, label = "project check cwd") {
  const root = fs.realpathSync(path.resolve(workspaceRoot));
  const relative = canonicalRelativePath(cwd, label);
  const candidate = path.resolve(root, ...relative.split("/"));
  assertInside(root, candidate, label);
  let resolved;
  try {
    resolved = fs.realpathSync(candidate);
  } catch {
    throw new ContractError("QUALITY_CHECK_CWD_UNAVAILABLE", `${label} does not exist`);
  }
  assertInside(root, resolved, label);
  if ((process.platform === "win32" ? path.relative(candidate, resolved).toLowerCase() : path.relative(candidate, resolved)) !== "") {
    throw new ContractError("QUALITY_CHECK_CWD_SYMLINK", `${label} cannot traverse a symlink or junction`);
  }
  const stat = fs.statSync(resolved, { bigint: true });
  if (!stat.isDirectory()) throw new ContractError("QUALITY_CHECK_CWD", `${label} must resolve to a directory`);
  return Object.freeze({ relative, resolved });
}

function validateCheck(value, index, workspaceRoot) {
  const label = `project check catalog.checks[${index}]`;
  assertPlain(value, label);
  exact(value, CHECK_KEYS, CHECK_REQUIRED_KEYS, label);
  assertString(value.check_id, `${label}.check_id`, { maxBytes: 128 });
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(value.check_id)) {
    throw new ContractError("QUALITY_CHECK_ID", `${label}.check_id is invalid`);
  }
  const executableId = validateExecutableId(value.executable_id, `${label}.executable_id`);
  assertArray(value.argv, `${label}.argv`, { max: PROJECT_CHECK_LIMITS.max_argv_items });
  value.argv.forEach((entry, argvIndex) => assertBoundedArg(entry, `${label}.argv[${argvIndex}]`));
  if (value.argv.length > 0 && EXECUTABLE_ARG_NAMES.has(value.argv[0].toLowerCase())) {
    throw new ContractError("QUALITY_CHECK_ARGV_EXECUTABLE", `${label}.argv contains an executable instead of arguments only`);
  }
  const cwd = canonicalRelativePath(value.cwd, `${label}.cwd`);
  if (workspaceRoot !== null) resolveProjectCheckCwd(workspaceRoot, cwd, `${label}.cwd`);
  assertArray(value.phases, `${label}.phases`, { min: 1, max: PROJECT_CHECK_PHASES.length });
  if (new Set(value.phases).size !== value.phases.length
    || value.phases.some((phase) => !PROJECT_CHECK_PHASES.includes(phase))) {
    throw new ContractError("QUALITY_CHECK_PHASE", `${label}.phases must be unique supported phases`);
  }
  if (!PROJECT_CHECK_PURPOSES.includes(value.purpose)) {
    throw new ContractError("QUALITY_CHECK_PURPOSE", `${label}.purpose is unsupported`);
  }
  const outcomeProtocol = value.outcome_protocol === undefined
    ? null
    : validateOutcomeProtocol(value.outcome_protocol, `${label}.outcome_protocol`);
  if (value.purpose === "bug_reproducer"
    && (!value.phases.includes("preimplementation") || !value.phases.includes("integration") || outcomeProtocol === null)) {
    throw new ContractError(
      "QUALITY_CHECK_REPRODUCER",
      `${label} bug reproducer must support preimplementation and integration with an outcome protocol`,
    );
  }
  const generatedOutputPaths = value.generated_output_paths === undefined
    ? []
    : validateDistinctPaths(
      value.generated_output_paths,
      `${label}.generated_output_paths`,
      canonicalGeneratedOutputPath,
      { max: PROJECT_CHECK_LIMITS.max_generated_output_paths },
    );
  if (value.purpose === "architecture_graph"
    && (!value.phases.includes("integration") || generatedOutputPaths.length !== 1
      || !generatedOutputPaths[0].toLowerCase().endsWith(".json"))) {
    throw new ContractError(
      "QUALITY_CHECK_ARCHITECTURE_OUTPUT",
      `${label} architecture graph check requires integration and one declared JSON output file`,
    );
  }
  assertInteger(value.timeout_ms, `${label}.timeout_ms`, { min: 1, max: PROJECT_CHECK_LIMITS.max_timeout_ms });
  assertInteger(value.max_output_chars, `${label}.max_output_chars`, { min: 1, max: PROJECT_CHECK_LIMITS.max_output_chars });
  return {
    check_id: value.check_id,
    executable_id: executableId,
    argv: [...value.argv],
    cwd,
    phases: [...value.phases],
    purpose: value.purpose,
    ...(outcomeProtocol === null ? {} : { outcome_protocol: outcomeProtocol }),
    generated_output_paths: generatedOutputPaths,
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
  if (new Set(checks.map((entry) => entry.check_id)).size !== checks.length) {
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
  const normalizedPath = relativePath.replaceAll("\\", "/");
  const directoryPath = canonicalRelativePath(path.posix.dirname(normalizedPath), "project check catalog directory");
  const manifestName = path.posix.basename(normalizedPath);
  if (manifestName !== "checks.json") throw new ContractError("QUALITY_CHECK_CATALOG_PATH", "project check catalog filename must be checks.json");
  const directory = resolveProjectCheckCwd(root, directoryPath, "project check catalog directory");
  const candidate = path.join(directory.resolved, manifestName);
  let realManifest;
  try {
    realManifest = fs.realpathSync(candidate);
  } catch {
    throw new ContractError("QUALITY_CHECK_CATALOG_MISSING", `missing ${PROJECT_CHECK_CATALOG_PATH}`);
  }
  assertInside(root, realManifest, "project check catalog");
  if ((process.platform === "win32" ? path.relative(candidate, realManifest).toLowerCase() : path.relative(candidate, realManifest)) !== "") {
    throw new ContractError("QUALITY_CHECK_CATALOG_PATH", "project check catalog cannot be a symlink");
  }
  let descriptor;
  let serialized;
  try {
    descriptor = fs.openSync(realManifest, "r");
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n) {
      throw new ContractError("QUALITY_CHECK_CATALOG_PATH", "project check catalog must be a singly-linked regular file");
    }
    if (before.size > BigInt(PROJECT_CHECK_LIMITS.max_catalog_bytes)) {
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
    const after = fs.fstatSync(descriptor, { bigint: true });
    const identity = (stat) => [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs]
      .map((entry) => BigInt(entry).toString(10));
    if (JSON.stringify(identity(before)) !== JSON.stringify(identity(after)) || bytesRead !== Number(before.size)) {
      throw new ContractError("QUALITY_CHECK_CATALOG_RACE", "project check catalog changed while it was read");
    }
    try {
      serialized = new TextDecoder("utf-8", { fatal: true }).decode(bounded.subarray(0, bytesRead));
    } catch {
      throw new ContractError("QUALITY_CHECK_CATALOG_JSON", "project check catalog must contain valid UTF-8 JSON");
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  const catalog = parseProjectCheckCatalog(serialized, { workspaceRoot: root });
  return Object.freeze({ relative_path: normalizedPath, catalog, fingerprint: projectCheckCatalogFingerprint(catalog) });
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
