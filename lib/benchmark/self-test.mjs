import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";

import {
  ContractError,
  assertSafeId,
  canonicalJson,
  fingerprint,
} from "../feedback/contracts.mjs";
import {
  assertConfinedExistingPath,
  atomicWriteImmutable,
  atomicWriteJson,
  ensureConfinedDirectory,
  resolveIdPath,
  resolveInside,
  withExclusiveLock,
} from "../feedback/files.mjs";
import { sanitizedNodeBootstrapEnvironment } from "../feedback/process-tree.mjs";
import {
  assertPortableContractPath,
  resolveRepositoryEntry,
} from "./contracts.mjs";
import {
  DEFAULT_MODEL_FREE_CHECKS,
  MODEL_FREE_CHECK_TIMEOUT_MS,
  SYNTHETIC_MODEL_FREE_CONTAINMENT_CHECK_IDS,
  SYNTHETIC_MODEL_FREE_CONTAINMENT_ENVIRONMENT_KEYS,
  SYNTHETIC_MODEL_FREE_ENVIRONMENT_MARKER,
  SYNTHETIC_MODEL_FREE_FORBIDDEN_ENVIRONMENT_KEYS,
} from "./model-free-manifest.mjs";

export { DEFAULT_MODEL_FREE_CHECKS } from "./model-free-manifest.mjs";

export const SYNTHETIC_MODEL_FREE_SELF_TEST_VERSION = 2;
export const DEFAULT_MODEL_FREE_SELF_TEST_ROOT =
  "evals/reports/synthetic/model-free-self-tests";
const CHECK_STATUSES = new Set(["passed", "failed", "timed_out", "spawn_failed"]);
const SAFE_SCRIPT = /^scripts\/[A-Za-z0-9._-]+\.mjs$/u;
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;
const MAX_OUTPUT_BYTES = 1024 * 1024;

function fail(code, message) {
  throw new ContractError(code, message);
}

function expect(condition, code, message) {
  if (!condition) fail(code, message);
}

function exact(value, keys, label) {
  expect(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "SYNTHETIC_SELF_TEST_SHAPE",
    `${label} must be an object`,
  );
  expect(
    canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort()),
    "SYNTHETIC_SELF_TEST_SHAPE",
    `${label} keys are invalid`,
  );
}

function iso(value, label) {
  expect(
    typeof value === "string"
      && value.length <= 32
      && !Number.isNaN(Date.parse(value))
      && new Date(value).toISOString() === value,
    "SYNTHETIC_SELF_TEST_TIME",
    `${label} must be a canonical ISO timestamp`,
  );
  return value;
}

function boundedInteger(value, label, maximum) {
  expect(
    Number.isSafeInteger(value) && value >= 0 && value <= maximum,
    "SYNTHETIC_SELF_TEST_INTEGER",
    `${label} is outside its allowed range`,
  );
  return value;
}

function sha256Bytes(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function normalizeOutput(value, label) {
  const text = value === null || value === undefined ? "" : String(value);
  expect(
    Buffer.byteLength(text, "utf8") <= MAX_OUTPUT_BYTES,
    "SYNTHETIC_SELF_TEST_OUTPUT",
    `${label} exceeded the bounded output limit`,
  );
  return text;
}

export function syntheticModelFreeCheckEnvironment(environment = process.env, {
  includeContainment = false,
} = {}) {
  const result = sanitizedNodeBootstrapEnvironment(environment);
  // Every canonical check is launched with process.execPath. A minimal PATH
  // lets synthetic command fixtures resolve that same trusted Node binary
  // without restoring caller-controlled executable search directories.
  result.PATH = path.dirname(process.execPath);
  if (process.platform === "win32") result.PATHEXT = ".EXE";
  if (includeContainment) {
    for (const key of SYNTHETIC_MODEL_FREE_CONTAINMENT_ENVIRONMENT_KEYS) {
      if (typeof environment[key] === "string") result[key] = environment[key];
    }
  }
  for (const key of SYNTHETIC_MODEL_FREE_FORBIDDEN_ENVIRONMENT_KEYS) {
    delete result[key];
  }
  result[SYNTHETIC_MODEL_FREE_ENVIRONMENT_MARKER] = "1";
  return result;
}

export function executeModelFreeCheck({
  sourceRoot,
  script,
  timeoutMs = MODEL_FREE_CHECK_TIMEOUT_MS,
  environment = process.env,
  includeContainment = false,
} = {}) {
  const executable = resolveRepositoryEntry(sourceRoot, script, {
    expectedKind: "file",
    maxFileBytes: 2 * 1024 * 1024,
  });
  const started = performance.now();
  const result = spawnSync(process.execPath, [executable], {
    cwd: sourceRoot,
    env: syntheticModelFreeCheckEnvironment(environment, { includeContainment }),
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: MAX_OUTPUT_BYTES,
    windowsHide: true,
    shell: false,
  });
  return {
    exitCode: Number.isInteger(result.status) ? result.status : null,
    signal: typeof result.signal === "string" ? result.signal : null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    errorCode: typeof result.error?.code === "string" ? result.error.code : null,
    durationMs: Math.max(0, Math.round(performance.now() - started)),
  };
}

function validateCheckDefinition(check, label) {
  exact(check, ["id", "script"], label);
  try {
    assertSafeId(check.id, `${label}.id`);
  } catch {
    fail("SYNTHETIC_SELF_TEST_CHECK", `${label}.id is invalid`);
  }
  assertPortableContractPath(check.script, `${label}.script`);
  expect(SAFE_SCRIPT.test(check.script), "SYNTHETIC_SELF_TEST_CHECK", `${label}.script is invalid`);
  return check;
}

function validateCanonicalCheckDefinitions(checks, label) {
  expect(
    canonicalJson(checks.map(({ id, script }) => ({ id, script })))
      === canonicalJson(DEFAULT_MODEL_FREE_CHECKS),
    "SYNTHETIC_SELF_TEST_CHECKS",
    `${label} must match the canonical model-free check manifest`,
  );
}

function normalizeCheckResult(definition, raw) {
  expect(
    raw !== null && typeof raw === "object" && !Array.isArray(raw),
    "SYNTHETIC_SELF_TEST_RESULT",
    `${definition.id} returned an invalid result`,
  );
  const stdout = normalizeOutput(raw.stdout, `${definition.id}.stdout`);
  const stderr = normalizeOutput(raw.stderr, `${definition.id}.stderr`);
  const exitCode = Number.isInteger(raw.exitCode) && raw.exitCode >= 0 && raw.exitCode <= 255
    ? raw.exitCode
    : null;
  const timedOut = raw.errorCode === "ETIMEDOUT";
  const status = timedOut
    ? "timed_out"
    : raw.errorCode !== null && raw.errorCode !== undefined
      ? "spawn_failed"
      : exitCode === 0
        ? "passed"
        : exitCode !== null
          ? "failed"
          : "spawn_failed";
  return Object.freeze({
    id: definition.id,
    script: definition.script,
    status,
    exit_code: exitCode,
    timed_out: timedOut,
    duration_ms: boundedInteger(raw.durationMs, `${definition.id}.durationMs`, 900_000),
    stdout_bytes: Buffer.byteLength(stdout, "utf8"),
    stderr_bytes: Buffer.byteLength(stderr, "utf8"),
    stdout_fingerprint: sha256Bytes(stdout),
    stderr_fingerprint: sha256Bytes(stderr),
  });
}

export async function runSyntheticModelFreeSelfTest({
  sourceRoot,
  checks = DEFAULT_MODEL_FREE_CHECKS,
  executor = executeModelFreeCheck,
  timeoutMs = MODEL_FREE_CHECK_TIMEOUT_MS,
  clock = () => new Date(),
  idFactory = () => `model-free-${randomUUID()}`,
} = {}) {
  const root = fs.realpathSync.native(path.resolve(sourceRoot));
  expect(root === path.resolve(sourceRoot), "SYNTHETIC_SELF_TEST_ROOT", "sourceRoot must be physically canonical");
  expect(
    Array.isArray(checks) && checks.length >= 1 && checks.length <= 16,
    "SYNTHETIC_SELF_TEST_CHECKS",
    "checks must contain 1 through 16 entries",
  );
  expect(typeof executor === "function", "SYNTHETIC_SELF_TEST_EXECUTOR", "executor must be a function");
  boundedInteger(timeoutMs, "timeoutMs", 900_000);
  expect(timeoutMs >= 1_000, "SYNTHETIC_SELF_TEST_TIMEOUT", "timeoutMs must be at least 1000");
  const normalizedChecks = checks.map((check, index) => validateCheckDefinition(
    check,
    `checks[${index}]`,
  ));
  validateCanonicalCheckDefinitions(normalizedChecks, "checks");
  expect(
    new Set(normalizedChecks.map((entry) => entry.id)).size === normalizedChecks.length,
    "SYNTHETIC_SELF_TEST_CHECKS",
    "check IDs must be unique",
  );
  expect(
    new Set(normalizedChecks.map((entry) => entry.script)).size === normalizedChecks.length,
    "SYNTHETIC_SELF_TEST_CHECKS",
    "check scripts must be unique",
  );
  const results = [];
  for (const check of normalizedChecks) {
    const raw = await executor({
      sourceRoot: root,
      script: check.script,
      timeoutMs,
      includeContainment: SYNTHETIC_MODEL_FREE_CONTAINMENT_CHECK_IDS.includes(check.id),
    });
    results.push(normalizeCheckResult(check, raw));
  }
  const createdAtValue = clock();
  const createdAt = createdAtValue instanceof Date ? createdAtValue.toISOString() : createdAtValue;
  const runId = idFactory();
  try {
    assertSafeId(runId, "run_id");
  } catch {
    fail("SYNTHETIC_SELF_TEST_RUN_ID", "idFactory returned an invalid run ID");
  }
  const report = Object.freeze({
    schema_version: SYNTHETIC_MODEL_FREE_SELF_TEST_VERSION,
    report_kind: "synthetic-model-free-self-test",
    run_id: runId,
    created_at: createdAt,
    evidence_class: "model-free-fixture",
    model_execution: false,
    complete: results.every((entry) => entry.status === "passed"),
    check_count: results.length,
    checks: Object.freeze(results),
    residual_caveats: Object.freeze([
      "model-free-only",
      "no-model-quality-claim",
    ]),
  });
  validateSyntheticModelFreeSelfTestReport(report);
  return report;
}

export function validateSyntheticModelFreeSelfTestReport(report) {
  exact(report, [
    "schema_version",
    "report_kind",
    "run_id",
    "created_at",
    "evidence_class",
    "model_execution",
    "complete",
    "check_count",
    "checks",
    "residual_caveats",
  ], "model-free self-test report");
  expect(
    report.schema_version === SYNTHETIC_MODEL_FREE_SELF_TEST_VERSION,
    "SYNTHETIC_SELF_TEST_VERSION",
    "unsupported self-test report version",
  );
  expect(
    report.report_kind === "synthetic-model-free-self-test"
      && report.evidence_class === "model-free-fixture"
      && report.model_execution === false,
    "SYNTHETIC_SELF_TEST_EVIDENCE",
    "self-test evidence classification is invalid",
  );
  try {
    assertSafeId(report.run_id, "run_id");
  } catch {
    fail("SYNTHETIC_SELF_TEST_RUN_ID", "run_id is invalid");
  }
  iso(report.created_at, "created_at");
  expect(
    Array.isArray(report.checks)
      && report.checks.length === DEFAULT_MODEL_FREE_CHECKS.length
      && report.check_count === report.checks.length,
    "SYNTHETIC_SELF_TEST_CHECKS",
    "self-test check cardinality is invalid",
  );
  for (const [index, check] of report.checks.entries()) {
    exact(check, [
      "id",
      "script",
      "status",
      "exit_code",
      "timed_out",
      "duration_ms",
      "stdout_bytes",
      "stderr_bytes",
      "stdout_fingerprint",
      "stderr_fingerprint",
    ], `checks[${index}]`);
    validateCheckDefinition({ id: check.id, script: check.script }, `checks[${index}]`);
    expect(CHECK_STATUSES.has(check.status), "SYNTHETIC_SELF_TEST_STATUS", `checks[${index}].status is invalid`);
    expect(
      check.exit_code === null
        || (Number.isInteger(check.exit_code) && check.exit_code >= 0 && check.exit_code <= 255),
      "SYNTHETIC_SELF_TEST_EXIT",
      `checks[${index}].exit_code is invalid`,
    );
    expect(
      typeof check.timed_out === "boolean"
        && check.timed_out === (check.status === "timed_out"),
      "SYNTHETIC_SELF_TEST_STATUS",
      `checks[${index}] timeout semantics are invalid`,
    );
    const exitSemanticsValid = check.status === "passed"
      ? check.exit_code === 0
      : check.status === "failed"
        ? Number.isInteger(check.exit_code)
          && check.exit_code >= 1
          && check.exit_code <= 255
        : check.exit_code === null;
    expect(
      exitSemanticsValid,
      "SYNTHETIC_SELF_TEST_STATUS",
      `checks[${index}] exit semantics are invalid`,
    );
    boundedInteger(check.duration_ms, `checks[${index}].duration_ms`, 900_000);
    boundedInteger(check.stdout_bytes, `checks[${index}].stdout_bytes`, MAX_OUTPUT_BYTES);
    boundedInteger(check.stderr_bytes, `checks[${index}].stderr_bytes`, MAX_OUTPUT_BYTES);
    expect(
      FINGERPRINT.test(check.stdout_fingerprint) && FINGERPRINT.test(check.stderr_fingerprint),
      "SYNTHETIC_SELF_TEST_FINGERPRINT",
      `checks[${index}] output fingerprint is invalid`,
    );
  }
  validateCanonicalCheckDefinitions(report.checks, "report checks");
  expect(
    new Set(report.checks.map((entry) => entry.id)).size === report.checks.length,
    "SYNTHETIC_SELF_TEST_CHECKS",
    "self-test check IDs must be unique",
  );
  expect(
    new Set(report.checks.map((entry) => entry.script)).size === report.checks.length,
    "SYNTHETIC_SELF_TEST_CHECKS",
    "self-test check scripts must be unique",
  );
  expect(
    report.complete === report.checks.every((entry) => entry.status === "passed"),
    "SYNTHETIC_SELF_TEST_COMPLETE",
    "self-test completeness does not match its checks",
  );
  expect(
    canonicalJson(report.residual_caveats)
      === canonicalJson(["model-free-only", "no-model-quality-claim"]),
    "SYNTHETIC_SELF_TEST_CAVEATS",
    "self-test caveats are not canonical",
  );
  return report;
}

function readMarker(pathname, root, code, message) {
  assertConfinedExistingPath(root, pathname, { type: "file" });
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    fail(code, message);
  }
}

export function publishSyntheticModelFreeSelfTestReport({
  sourceRoot,
  report,
  relativeRoot = DEFAULT_MODEL_FREE_SELF_TEST_ROOT,
  beforeMarker = null,
} = {}) {
  validateSyntheticModelFreeSelfTestReport(report);
  assertPortableContractPath(relativeRoot, "relativeRoot");
  expect(
    typeof beforeMarker === "function" || beforeMarker === null,
    "SYNTHETIC_SELF_TEST_HOOK",
    "beforeMarker must be a function or null",
  );
  const root = fs.realpathSync.native(path.resolve(sourceRoot));
  expect(root === path.resolve(sourceRoot), "SYNTHETIC_SELF_TEST_ROOT", "sourceRoot must be physically canonical");
  const artifactRoot = resolveInside(root, ...relativeRoot.split("/"));
  ensureConfinedDirectory(root, artifactRoot);
  const runsRoot = resolveInside(artifactRoot, "runs");
  ensureConfinedDirectory(root, runsRoot);
  const runRoot = resolveIdPath(runsRoot, report.run_id);
  ensureConfinedDirectory(root, runRoot);
  const paths = {
    report: resolveInside(runRoot, "report.json"),
    completion: resolveInside(runRoot, "completion.json"),
    latest: resolveInside(artifactRoot, "latest.json"),
    lock: resolveInside(artifactRoot, ".publish.lock"),
  };
  const contents = `${JSON.stringify(report, null, 2)}\n`;
  const reportFingerprint = fingerprint(report);
  const completion = Object.freeze({
    schema_version: 1,
    artifact_kind: "synthetic-model-free-self-test-completion",
    run_id: report.run_id,
    report_fingerprint: reportFingerprint,
    report_bytes_fingerprint: sha256Bytes(contents),
    created_at: report.created_at,
    report_path: `runs/${report.run_id}/report.json`,
  });
  const latest = Object.freeze({
    schema_version: 1,
    pointer_kind: "synthetic-model-free-self-test-latest",
    run_id: report.run_id,
    report_fingerprint: reportFingerprint,
    completion_path: `runs/${report.run_id}/completion.json`,
    created_at: report.created_at,
  });
  return withExclusiveLock(paths.lock, () => {
    const completionExists = fs.existsSync(paths.completion);
    if (report.complete && completionExists) {
      expect(
        canonicalJson(readMarker(
          paths.completion,
          root,
          "SYNTHETIC_SELF_TEST_ARTIFACT_DIVERGENCE",
          "self-test completion marker is invalid",
        )) === canonicalJson(completion),
        "SYNTHETIC_SELF_TEST_ARTIFACT_DIVERGENCE",
        "self-test completion marker differs from the existing run",
      );
    } else if (!report.complete) {
      expect(
        !completionExists,
        "SYNTHETIC_SELF_TEST_ARTIFACT_COMPLETION",
        "incomplete self-test must not have a completion marker",
      );
    }
    if (fs.existsSync(paths.report)) {
      assertConfinedExistingPath(root, paths.report, { type: "file" });
      expect(
        fs.readFileSync(paths.report, "utf8") === contents,
        "SYNTHETIC_SELF_TEST_ARTIFACT_DIVERGENCE",
        "self-test report bytes differ from the existing run",
      );
    } else {
      atomicWriteImmutable(paths.report, contents, { basePath: root });
    }
    if (report.complete) {
      if (!completionExists) {
        beforeMarker?.({ markerPath: paths.completion });
        atomicWriteJson(paths.completion, completion, {
          immutable: true,
          basePath: root,
        });
      }
      atomicWriteJson(paths.latest, latest, { basePath: root });
    }
    return Object.freeze({
      status: report.complete ? "published" : "incomplete-uncommitted",
      report_fingerprint: reportFingerprint,
      files: Object.freeze({
        report: `${relativeRoot}/runs/${report.run_id}/report.json`,
        completion: report.complete
          ? `${relativeRoot}/runs/${report.run_id}/completion.json`
          : null,
        latest: report.complete ? `${relativeRoot}/latest.json` : null,
      }),
    });
  }, { basePath: root });
}
