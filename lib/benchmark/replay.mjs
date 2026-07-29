import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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
import {
  assertPortableContractPath,
  loadSyntheticContracts,
} from "./contracts.mjs";
import {
  loadSyntheticTemplateSet,
  renderSyntheticInstance,
  replaySyntheticInstance,
} from "./renderer.mjs";
import {
  DEFAULT_SYNTHETIC_AGENT_TIMEOUT_MS,
  runSyntheticProfileAttempt,
} from "./runner.mjs";

export const SYNTHETIC_REPLAY_REPORT_VERSION = 1;
export const DEFAULT_SYNTHETIC_REPLAY_ROOT = "evals/reports/synthetic/replays";

const FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;
const EXECUTION_STATUSES = new Set([
  "completed",
  "failed",
  "incomplete",
  "blocked_external_state",
]);

function fail(code, message) {
  throw new ContractError(code, message);
}

function expect(condition, code, message) {
  if (!condition) fail(code, message);
}

function exact(value, keys, label) {
  expect(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "SYNTHETIC_REPLAY_SHAPE",
    `${label} must be an object`,
  );
  expect(
    canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort()),
    "SYNTHETIC_REPLAY_SHAPE",
    `${label} keys are invalid`,
  );
}

function boundedSingleLine(value, label, {
  nullable = false,
  maximum = 256,
} = {}) {
  if (nullable && value === null) return value;
  expect(
    typeof value === "string"
      && value.length >= 1
      && value.length <= maximum
      && !/[\0\r\n]/u.test(value),
    "SYNTHETIC_REPLAY_STRING",
    `${label} must be a bounded single-line string`,
  );
  return value;
}

function canonicalIso(value, label) {
  expect(
    typeof value === "string"
      && !Number.isNaN(Date.parse(value))
      && new Date(value).toISOString() === value,
    "SYNTHETIC_REPLAY_TIME",
    `${label} must be a canonical ISO timestamp`,
  );
  return value;
}

function sha256Bytes(contents) {
  return `sha256:${createHash("sha256").update(contents, "utf8").digest("hex")}`;
}

export function syntheticModelBindingFingerprint({
  provider,
  model,
  variant,
}) {
  boundedSingleLine(model, "model");
  boundedSingleLine(provider, "provider", { nullable: true, maximum: 128 });
  boundedSingleLine(variant, "variant", { nullable: true, maximum: 128 });
  return fingerprint({
    schema: "synthetic-model-binding-v1",
    provider,
    model,
    variant,
  });
}

export function validateSyntheticReplayReport(report) {
  exact(report, [
    "schema_version",
    "report_kind",
    "run_id",
    "created_at",
    "evidence_class",
    "model_execution_confirmed",
    "family_id",
    "seed",
    "repetition",
    "instance_fingerprint",
    "profile_id",
    "model_binding_fingerprint",
    "execution_status",
    "termination_reason",
    "reason",
    "adapter_completed_correctly",
    "evidence_complete",
    "whole_task_success",
    "result_fingerprint",
    "residual_caveats",
  ], "synthetic replay report");
  expect(
    report.schema_version === SYNTHETIC_REPLAY_REPORT_VERSION
      && report.report_kind === "synthetic-profile-replay"
      && report.evidence_class === "model-backed-attempt",
    "SYNTHETIC_REPLAY_VERSION",
    "replay report version or evidence class is invalid",
  );
  for (const [label, value] of [
    ["run_id", report.run_id],
    ["family_id", report.family_id],
    ["seed", report.seed],
    ["profile_id", report.profile_id],
  ]) {
    try {
      assertSafeId(value, label);
    } catch {
      fail("SYNTHETIC_REPLAY_ID", `${label} is invalid`);
    }
  }
  canonicalIso(report.created_at, "created_at");
  expect(
    Number.isInteger(report.repetition) && report.repetition >= 1 && report.repetition <= 5,
    "SYNTHETIC_REPLAY_REPETITION",
    "repetition must be between 1 and 5",
  );
  for (const [label, value] of [
    ["instance_fingerprint", report.instance_fingerprint],
    ["model_binding_fingerprint", report.model_binding_fingerprint],
    ["result_fingerprint", report.result_fingerprint],
  ]) {
    expect(FINGERPRINT.test(value), "SYNTHETIC_REPLAY_FINGERPRINT", `${label} is invalid`);
  }
  expect(
    ["plain", "profile-only", "instrumented"].includes(report.profile_id),
    "SYNTHETIC_REPLAY_PROFILE",
    "profile_id is invalid",
  );
  expect(
    EXECUTION_STATUSES.has(report.execution_status),
    "SYNTHETIC_REPLAY_STATUS",
    "execution_status is invalid",
  );
  boundedSingleLine(report.termination_reason, "termination_reason", { maximum: 128 });
  boundedSingleLine(report.reason, "reason", { nullable: true });
  for (const field of [
    "model_execution_confirmed",
    "adapter_completed_correctly",
    "evidence_complete",
    "whole_task_success",
  ]) {
    expect(typeof report[field] === "boolean", "SYNTHETIC_REPLAY_BOOLEAN", `${field} must be boolean`);
  }
  expect(
    report.model_execution_confirmed === report.adapter_completed_correctly,
    "SYNTHETIC_REPLAY_EVIDENCE",
    "confirmed model execution must reflect adapter completion",
  );
  if (report.evidence_complete) {
    expect(
      report.model_execution_confirmed
        && report.adapter_completed_correctly
        && report.execution_status === "completed",
      "SYNTHETIC_REPLAY_EVIDENCE",
      "complete replay evidence requires confirmed completed model execution",
    );
  }
  if (report.execution_status === "blocked_external_state") {
    expect(
      !report.model_execution_confirmed
        && !report.adapter_completed_correctly
        && !report.evidence_complete
        && !report.whole_task_success
        && report.termination_reason === "blocked_external_state",
      "SYNTHETIC_REPLAY_EVIDENCE",
      "blocked replay evidence semantics are inconsistent",
    );
  }
  expect(
    !report.whole_task_success || report.evidence_complete,
    "SYNTHETIC_REPLAY_EVIDENCE",
    "whole-task success requires complete evidence",
  );
  expect(
    canonicalJson(report.residual_caveats)
      === canonicalJson(["single-profile-replay-no-comparison"]),
    "SYNTHETIC_REPLAY_CAVEATS",
    "replay caveats are not canonical",
  );
  return report;
}

export async function runSyntheticReplay({
  sourceRoot,
  familyId,
  seed,
  repetition = 1,
  profileId,
  instanceFingerprint = null,
  model,
  provider = null,
  variant = null,
  timeoutMs = DEFAULT_SYNTHETIC_AGENT_TIMEOUT_MS,
  runProfileAttempt = runSyntheticProfileAttempt,
  clock = () => new Date(),
  idFactory = () => `synthetic-replay-${randomUUID()}`,
} = {}) {
  const root = fs.realpathSync.native(path.resolve(sourceRoot));
  expect(root === path.resolve(sourceRoot), "SYNTHETIC_REPLAY_ROOT", "sourceRoot must be physically canonical");
  boundedSingleLine(model, "model");
  boundedSingleLine(provider, "provider", { nullable: true, maximum: 128 });
  boundedSingleLine(variant, "variant", { nullable: true, maximum: 128 });
  expect(
    instanceFingerprint === null || FINGERPRINT.test(instanceFingerprint),
    "SYNTHETIC_REPLAY_FINGERPRINT",
    "instance fingerprint is invalid",
  );
  expect(typeof runProfileAttempt === "function", "SYNTHETIC_REPLAY_DEPENDENCY", "runProfileAttempt must be a function");
  const contracts = loadSyntheticContracts(root);
  expect(
    contracts.inventory.profiles.some((entry) => entry.id === profileId),
    "SYNTHETIC_REPLAY_PROFILE",
    `unknown profile ${profileId}`,
  );
  const templateSet = loadSyntheticTemplateSet(root, contracts);
  const instance = renderSyntheticInstance({
    contracts,
    templateSet,
    familyId,
    seed,
    repetition,
  });
  if (instanceFingerprint !== null) {
    expect(
      instance.instance_fingerprint === instanceFingerprint,
      "SYNTHETIC_REPLAY_STALE_FINGERPRINT",
      "provided instance fingerprint does not match the deterministic fixture",
    );
  }
  replaySyntheticInstance({ contracts, templateSet, manifest: instance });
  const runId = idFactory("synthetic-replay");
  try {
    assertSafeId(runId, "run_id");
  } catch {
    fail("SYNTHETIC_REPLAY_RUN_ID", "idFactory returned an invalid run ID");
  }
  const attempt = await runProfileAttempt({
    sourceRoot: root,
    instance,
    profileId,
    operationalRunId: runId,
    model,
    provider,
    variant,
    timeoutMs,
    clock,
  });
  expect(
    attempt !== null
      && typeof attempt === "object"
      && attempt.result !== null
      && typeof attempt.result === "object",
    "SYNTHETIC_REPLAY_RESULT",
    "profile attempt returned an invalid result",
  );
  const createdAtValue = clock();
  const createdAt = createdAtValue instanceof Date ? createdAtValue.toISOString() : createdAtValue;
  const result = attempt.result;
  const report = Object.freeze({
    schema_version: SYNTHETIC_REPLAY_REPORT_VERSION,
    report_kind: "synthetic-profile-replay",
    run_id: runId,
    created_at: createdAt,
    evidence_class: "model-backed-attempt",
    model_execution_confirmed: result.adapter_completed_correctly === true,
    family_id: instance.family_id,
    seed: instance.seed,
    repetition: instance.repetition,
    instance_fingerprint: instance.instance_fingerprint,
    profile_id: profileId,
    model_binding_fingerprint: syntheticModelBindingFingerprint({ provider, model, variant }),
    execution_status: result.execution_status,
    termination_reason: result.termination_reason,
    reason: result.reason,
    adapter_completed_correctly: result.adapter_completed_correctly === true,
    evidence_complete: result.evidence_complete === true,
    whole_task_success: result.whole_task_success === true,
    result_fingerprint: fingerprint(result),
    residual_caveats: Object.freeze(["single-profile-replay-no-comparison"]),
  });
  validateSyntheticReplayReport(report);
  return Object.freeze({ report, instance });
}

function readMarker(pathname, root, code, message) {
  assertConfinedExistingPath(root, pathname, { type: "file" });
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    fail(code, message);
  }
}

export function publishSyntheticReplayReport({
  sourceRoot,
  report,
  relativeRoot = DEFAULT_SYNTHETIC_REPLAY_ROOT,
  beforeMarker = null,
} = {}) {
  validateSyntheticReplayReport(report);
  assertPortableContractPath(relativeRoot, "relativeRoot");
  expect(
    typeof beforeMarker === "function" || beforeMarker === null,
    "SYNTHETIC_REPLAY_HOOK",
    "beforeMarker must be a function or null",
  );
  const root = fs.realpathSync.native(path.resolve(sourceRoot));
  expect(root === path.resolve(sourceRoot), "SYNTHETIC_REPLAY_ROOT", "sourceRoot must be physically canonical");
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
    artifact_kind: "synthetic-replay-completion",
    run_id: report.run_id,
    report_fingerprint: reportFingerprint,
    report_bytes_fingerprint: sha256Bytes(contents),
    created_at: report.created_at,
    report_path: `runs/${report.run_id}/report.json`,
  });
  const latest = Object.freeze({
    schema_version: 1,
    pointer_kind: "synthetic-replay-latest",
    run_id: report.run_id,
    report_fingerprint: reportFingerprint,
    completion_path: `runs/${report.run_id}/completion.json`,
    created_at: report.created_at,
  });
  return withExclusiveLock(paths.lock, () => {
    const completionExists = fs.existsSync(paths.completion);
    if (report.evidence_complete && completionExists) {
      expect(
        canonicalJson(readMarker(
          paths.completion,
          root,
          "SYNTHETIC_REPLAY_ARTIFACT_DIVERGENCE",
          "replay completion marker is invalid",
        )) === canonicalJson(completion),
        "SYNTHETIC_REPLAY_ARTIFACT_DIVERGENCE",
        "replay completion marker differs from the existing run",
      );
    } else if (!report.evidence_complete) {
      expect(
        !completionExists,
        "SYNTHETIC_REPLAY_ARTIFACT_COMPLETION",
        "incomplete replay must not have a completion marker",
      );
    }
    if (fs.existsSync(paths.report)) {
      assertConfinedExistingPath(root, paths.report, { type: "file" });
      expect(
        fs.readFileSync(paths.report, "utf8") === contents,
        "SYNTHETIC_REPLAY_ARTIFACT_DIVERGENCE",
        "replay report bytes differ from the existing run",
      );
    } else {
      atomicWriteImmutable(paths.report, contents, { basePath: root });
    }
    if (report.evidence_complete) {
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
      status: report.evidence_complete ? "published" : "incomplete-uncommitted",
      report_fingerprint: reportFingerprint,
      files: Object.freeze({
        report: `${relativeRoot}/runs/${report.run_id}/report.json`,
        completion: report.evidence_complete
          ? `${relativeRoot}/runs/${report.run_id}/completion.json`
          : null,
        latest: report.evidence_complete ? `${relativeRoot}/latest.json` : null,
      }),
    });
  }, { basePath: root });
}
