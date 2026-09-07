import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";

// Only host-loaded project checks use this classification. Author manifests
// cannot promote themselves by supplying these same fields.
export function checkSource(check) {
  const source = check.source ?? "existing_project_check";
  if (source === "existing_project_check") return source;
  const basis = check.expectedResult;
  const files = (check.files ?? []).map((f) => check.cwd ? `${check.cwd}/${f}` : f);
  if (source !== "independently_validated_acceptance" || check.kind !== "node-test"
    || basis?.kind !== "project_owner_confirmation" || basis.confirmed !== true
    || ![basis.expectation, basis.rationale].every((s) => typeof s === "string" && s.trim())
    || !basis.fileSha256 || typeof basis.fileSha256 !== "object" || !files.length
    || Object.keys(basis.fileSha256).length !== new Set(files).size
    || !files.every((f) => /^[a-f0-9]{64}$/.test(basis.fileSha256[f]))) {
    throw new Error("EXPECTED_RESULT_CONFIRMATION_REQUIRED");
  }
  return source;
}

export function verifyExpectedResults(config, baseline) {
  for (const check of config.checks) {
    if (checkSource(check) !== "independently_validated_acceptance") continue;
    for (const [file, expected] of Object.entries(check.expectedResult.fileSha256)) {
      const actual = createHash("sha256").update(fs.readFileSync(path.join(baseline, file))).digest("hex");
      if (actual !== expected) throw new Error("EXPECTED_RESULT_TEST_CHANGED");
    }
  }
}

export function relativePath(value) {
  return typeof value === "string" && value.length > 0 && !path.isAbsolute(value)
    && !value.includes("\\") && !value.includes("\0")
    && value.split("/").every((segment) => segment && segment !== "." && segment !== "..")
    && value !== ".git" && !value.startsWith(".git/");
}

export function validateCheck(check) {
  if (!check || typeof check.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(check.id)) throw new Error("CHECK_ID_INVALID");
  if (check.cwd !== undefined && !relativePath(check.cwd)) throw new Error("CHECK_CWD_INVALID");
  if (check.timeoutMs !== undefined && (!Number.isSafeInteger(check.timeoutMs) || check.timeoutMs < 1 || check.timeoutMs > 3_600_000)) throw new Error("CHECK_TIMEOUT_INVALID");
  if (check.kind === "node-test") {
    if (!Array.isArray(check.files) || !check.files.length || !check.files.every((file) => relativePath(file) && !file.startsWith("-"))) throw new Error("CHECK_FILES_INVALID");
  } else if (check.kind === "command") {
    if (!Array.isArray(check.argv) || !check.argv.length || check.argv.some((arg) => typeof arg !== "string" || arg.includes("\0")) || !check.argv[0]) throw new Error("CHECK_ARGV_INVALID");
  } else throw new Error("CHECK_KIND_UNSUPPORTED");
  return check;
}

export function validateConfig(input) {
  if (!input || input.version !== 1) throw new Error("CONFIG_VERSION_UNSUPPORTED");
  const allowed = ["version", "image", "checks", "protectedPaths", "sourcePaths", "model", "variant", "sessionTimeoutMs"];
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new Error("CONFIG_UNKNOWN_FIELD");
  if (typeof input.image !== "string" || !input.image || input.image.startsWith("-")) throw new Error("CONFIG_IMAGE_REQUIRED");
  for (const key of ["protectedPaths", "sourcePaths"]) {
    if (!Array.isArray(input[key]) || !input[key].length || !input[key].every(relativePath)) throw new Error(`CONFIG_${key}_INVALID`);
  }
  for (const source of input.sourcePaths) {
    for (const protectedPath of input.protectedPaths) {
      if (source === protectedPath || protectedPath.startsWith(`${source}/`) || source.startsWith(`${protectedPath}/`)) throw new Error("CONFIG_SCOPE_OVERLAP");
    }
  }
  if (!Array.isArray(input.checks) || !input.checks.length) throw new Error("CONFIG_CHECKS_REQUIRED");
  input.checks.forEach(validateCheck);
  input.checks.forEach(checkSource);
  if (new Set(input.checks.map((check) => check.id)).size !== input.checks.length) throw new Error("DUPLICATE_CHECK_ID");
  for (const check of input.checks.filter((c) => c.kind === "node-test")) {
    for (const file of check.files) {
      const full = check.cwd ? `${check.cwd}/${file}` : file;
      if (!input.protectedPaths.some((p) => full === p || full.startsWith(`${p}/`))) throw new Error("EXISTING_TEST_NOT_PROTECTED");
    }
  }
  if (input.sessionTimeoutMs !== undefined && (!Number.isSafeInteger(input.sessionTimeoutMs) || input.sessionTimeoutMs < 1 || input.sessionTimeoutMs > 3_600_000)) throw new Error("SESSION_TIMEOUT_INVALID");
  for (const key of ["model", "variant"]) {
    if (input[key] !== undefined && (typeof input[key] !== "string" || !input[key] || input[key].includes("\0"))) throw new Error(`CONFIG_${key}_INVALID`);
  }
  return structuredClone(input);
}
