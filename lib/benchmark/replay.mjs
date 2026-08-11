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
  cleanupSyntheticProfile,
  materializeSyntheticProfile,
} from "./profiles.mjs";
import {
  SYNTHETIC_OPENCODE_ADAPTER_VERSION,
  syntheticOpenCodeAdapterFingerprint,
} from "./opencode-adapter.mjs";
import {
  validateSyntheticAttemptEvidence,
} from "./reporting.mjs";
import {
  DEFAULT_SYNTHETIC_AGENT_TIMEOUT_MS,
  runSyntheticProfileAttempt,
  syntheticEffectivePublicInputFingerprint,
  syntheticRunnerLimitsFingerprint,
} from "./runner.mjs";

export const SYNTHETIC_REPLAY_REPORT_VERSION = 3;
export const SYNTHETIC_LEGACY_REPLAY_REPORT_VERSIONS = Object.freeze([1, 2]);
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

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
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
  const sharedKeys = [
    "schema_version",
    "report_kind",
    "run_id",
    "created_at",
    "evidence_class",
    "model_execution_confirmed",
    "family_id",
    "seed",
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
  ];
  const isCurrent = report?.schema_version === SYNTHETIC_REPLAY_REPORT_VERSION;
  const isLegacyV2 = report?.schema_version === 2;
  const isLegacyV1 = report?.schema_version === 1;
  const isLegacy = isLegacyV1 || isLegacyV2;
  exact(
    report,
    isCurrent
      ? [
          ...sharedKeys,
          "semantic_variant_index",
          "semantic_variant_id",
          "semantic_variant_fingerprint",
          "trajectory_id",
          "trajectory_fingerprint",
          "trajectory_repetition",
          "profile_fingerprint",
          "task_correct",
          "claimed_completion",
          "false_block",
          "attempt",
        ]
      : isLegacyV2
        ? [...sharedKeys, "repetition", "profile_fingerprint", "task_correct", "attempt"]
        : [...sharedKeys, "repetition"],
    "synthetic replay report",
  );
  expect(
    (isCurrent || isLegacy)
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
  const trajectoryRepetition = isCurrent ? report.trajectory_repetition : report.repetition;
  expect(
    Number.isInteger(trajectoryRepetition) && trajectoryRepetition >= 1 && trajectoryRepetition <= 5,
    "SYNTHETIC_REPLAY_REPETITION",
    "trajectory repetition must be between 1 and 5",
  );
  if (isCurrent) {
    expect(Number.isInteger(report.semantic_variant_index) && report.semantic_variant_index >= 1 && report.semantic_variant_index <= 5, "SYNTHETIC_REPLAY_VARIANT", "semantic variant index must be between 1 and 5");
    for (const [label, value] of [["semantic_variant_id", report.semantic_variant_id], ["trajectory_id", report.trajectory_id]]) {
      try { assertSafeId(value, label); } catch { fail("SYNTHETIC_REPLAY_ID", `${label} is invalid`); }
    }
    for (const [label, value] of [["semantic_variant_fingerprint", report.semantic_variant_fingerprint], ["trajectory_fingerprint", report.trajectory_fingerprint]]) {
      expect(FINGERPRINT.test(value), "SYNTHETIC_REPLAY_FINGERPRINT", `${label} is invalid`);
    }
  }
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
    ...(isCurrent || isLegacyV2 ? ["task_correct"] : []),
    ...(isCurrent ? ["claimed_completion"] : []),
  ]) {
    expect(typeof report[field] === "boolean", "SYNTHETIC_REPLAY_BOOLEAN", `${field} must be boolean`);
  }
  const expectedModelExecutionConfirmation = isCurrent || isLegacyV2
    ? report.adapter_completed_correctly || report.evidence_complete
    : report.adapter_completed_correctly;
  expect(
    report.model_execution_confirmed === expectedModelExecutionConfirmation,
    "SYNTHETIC_REPLAY_EVIDENCE",
    isCurrent
      ? "confirmed model execution requires adapter completion or complete observational evidence"
      : "legacy confirmed model execution must reflect adapter completion",
  );
  if (report.evidence_complete) {
    expect(
      report.model_execution_confirmed
        && (isLegacy
          ? report.adapter_completed_correctly && report.execution_status === "completed"
          : ["completed", "failed"].includes(report.execution_status)),
      "SYNTHETIC_REPLAY_EVIDENCE",
      "complete replay evidence requires a confirmed settled model attempt",
    );
  }
  if (report.execution_status === "blocked_external_state") {
    expect(
      !report.model_execution_confirmed
        && !report.adapter_completed_correctly
        && (!(isCurrent || isLegacyV2) || !report.task_correct)
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
  if (isCurrent || isLegacyV2) {
    expect(
      FINGERPRINT.test(report.profile_fingerprint),
      "SYNTHETIC_REPLAY_FINGERPRINT",
      "profile_fingerprint is invalid",
    );
    expect(
      report.attempt !== null
        && typeof report.attempt === "object"
        && !Array.isArray(report.attempt),
      "SYNTHETIC_REPLAY_SHAPE",
      "synthetic replay report.attempt must be an object",
    );
    expect(
      report.attempt.binding !== null
        && typeof report.attempt.binding === "object"
        && !Array.isArray(report.attempt.binding),
      "SYNTHETIC_REPLAY_SHAPE",
      "synthetic replay report.attempt.binding must be an object",
    );
  }
  if (isCurrent) {
    expect(
      report.false_block === null || typeof report.false_block === "boolean",
      "SYNTHETIC_REPLAY_BOOLEAN",
      "false_block must be boolean or null",
    );
    validateSyntheticAttemptEvidence(report.attempt, {
      profileId: report.profile_id,
      profileFingerprint: report.profile_fingerprint,
      modelBindingFingerprint: report.model_binding_fingerprint,
      timeoutMs: report.attempt.binding.timeout_ms,
      limitsFingerprint: report.attempt.binding.limits_fingerprint,
      adapterProtocolVersion: SYNTHETIC_OPENCODE_ADAPTER_VERSION,
      executableFingerprint: report.attempt.binding.executable_fingerprint,
      executableVersion: report.attempt.binding.executable_version,
      executableBasename: report.attempt.binding.executable_basename,
      executablePlatform: report.attempt.binding.executable_platform,
      executableIdentityPolicyVersion:
        report.attempt.binding.executable_identity_policy_version,
      operationalRunId: report.run_id,
      label: "synthetic replay report.attempt",
    });
    const result = report.attempt.result;
    expect(
      report.result_fingerprint === fingerprint(result),
      "SYNTHETIC_REPLAY_EVIDENCE",
      "result_fingerprint does not bind the stored attempt result",
    );
    for (const field of [
      "execution_status",
      "termination_reason",
      "reason",
      "adapter_completed_correctly",
      "task_correct",
      "claimed_completion",
      "false_block",
      "evidence_complete",
      "whole_task_success",
    ]) {
      expect(
        report[field] === result[field],
        "SYNTHETIC_REPLAY_EVIDENCE",
        `${field} does not project the stored attempt result`,
      );
    }
    expect(
      report.model_execution_confirmed
        === (result.adapter_completed_correctly || result.evidence_complete),
      "SYNTHETIC_REPLAY_EVIDENCE",
      "model_execution_confirmed does not project settled stored attempt evidence",
    );
  }
  return report;
}

export function validateSyntheticReplayReportSourceBinding(report, {
  sourceRoot,
} = {}) {
  validateSyntheticReplayReport(report);
  expect(
    report.schema_version === SYNTHETIC_REPLAY_REPORT_VERSION,
    "SYNTHETIC_REPLAY_SOURCE_BINDING",
    "legacy replay reports are structural-only evidence",
  );
  expect(
    typeof sourceRoot === "string" && sourceRoot.length > 0,
    "SYNTHETIC_REPLAY_SOURCE_BINDING",
    "sourceRoot is required",
  );
  let root;
  try {
    root = fs.realpathSync.native(path.resolve(sourceRoot));
  } catch {
    fail("SYNTHETIC_REPLAY_SOURCE_BINDING", "sourceRoot is unavailable");
  }
  expect(
    root === path.resolve(sourceRoot),
    "SYNTHETIC_REPLAY_SOURCE_BINDING",
    "sourceRoot must be physically canonical",
  );
  const contracts = loadSyntheticContracts(root);
  expect(
    contracts.families.some((entry) => entry.id === report.family_id),
    "SYNTHETIC_REPLAY_SOURCE_BINDING",
    "replay report references an unknown family",
  );
  expect(
    contracts.inventory.profiles.some((entry) => entry.id === report.profile_id),
    "SYNTHETIC_REPLAY_SOURCE_BINDING",
    "replay report references an unknown profile",
  );
  const templateSet = loadSyntheticTemplateSet(root, contracts);
  const instance = renderSyntheticInstance({
    contracts,
    templateSet,
    familyId: report.family_id,
    seed: report.seed,
    semanticVariantIndex: report.semantic_variant_index,
    repetition: report.trajectory_repetition,
  });
  replaySyntheticInstance({ contracts, templateSet, manifest: instance });
  expect(
    report.semantic_variant_id === instance.semantic_variant_id
      && report.semantic_variant_fingerprint === instance.semantic_variant_fingerprint
      && report.trajectory_id === instance.trajectory_id
      && report.trajectory_fingerprint === instance.trajectory_fingerprint,
    "SYNTHETIC_REPLAY_SOURCE_BINDING",
    "replay semantic or trajectory identity is stale",
  );
  const profile = materializeSyntheticProfile({
    sourceRoot: root,
    profileId: report.profile_id,
  });
  try {
    expect(
      report.instance_fingerprint === instance.instance_fingerprint,
      "SYNTHETIC_REPLAY_SOURCE_BINDING",
      "replay instance fingerprint is stale",
    );
    expect(
      report.profile_fingerprint === profile.profileFingerprint,
      "SYNTHETIC_REPLAY_SOURCE_BINDING",
      "replay profile fingerprint is stale",
    );
    const binding = report.attempt.binding;
    expect(
      binding.public_fixture_fingerprint === instance.public_fixture_fingerprint
        && binding.hidden_fixture_fingerprint === instance.hidden_fixture_fingerprint
        && binding.task_scope_fingerprint === fingerprint(instance.task_scope)
        && binding.effective_public_input_fingerprint
          === syntheticEffectivePublicInputFingerprint(instance),
      "SYNTHETIC_REPLAY_SOURCE_BINDING",
      "replay attempt binding differs from the canonical rendered instance",
    );
    expect(
      binding.limits_fingerprint === syntheticRunnerLimitsFingerprint(),
      "SYNTHETIC_REPLAY_SOURCE_BINDING",
      "replay attempt does not bind the canonical default runner limits",
    );
    expect(
      binding.adapter_protocol_version === SYNTHETIC_OPENCODE_ADAPTER_VERSION,
      "SYNTHETIC_REPLAY_SOURCE_BINDING",
      "replay attempt adapter protocol is stale",
    );
    const adapterFingerprint = report.attempt.result.fingerprints.adapter;
    expect(
      adapterFingerprint === null
        || adapterFingerprint === syntheticOpenCodeAdapterFingerprint(),
      "SYNTHETIC_REPLAY_SOURCE_BINDING",
      "replay attempt adapter fingerprint is not canonical",
    );
    expect(
      !report.attempt.result.adapter_completed_correctly
        || adapterFingerprint === syntheticOpenCodeAdapterFingerprint(),
      "SYNTHETIC_REPLAY_SOURCE_BINDING",
      "completed replay adapter evidence lacks its canonical fingerprint",
    );
    return report;
  } finally {
    cleanupSyntheticProfile(profile);
  }
}

export async function runSyntheticReplay({
  sourceRoot,
  familyId,
  seed,
  semanticVariantIndex = 1,
  trajectoryRepetition = 1,
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
    semanticVariantIndex,
    repetition: trajectoryRepetition,
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
  expect(
    attempt.binding !== null
      && typeof attempt.binding === "object"
      && !Array.isArray(attempt.binding),
    "SYNTHETIC_REPLAY_RESULT",
    "profile attempt returned an invalid binding",
  );
  const frozenAttempt = deepFreeze(structuredClone({
    binding: attempt.binding,
    result: attempt.result,
  }));
  const result = frozenAttempt.result;
  const modelBindingFingerprint = syntheticModelBindingFingerprint({
    provider,
    model,
    variant,
  });
  validateSyntheticAttemptEvidence(frozenAttempt, {
    profileId,
    profileFingerprint: result.profile_fingerprint,
    modelBindingFingerprint,
    timeoutMs,
    limitsFingerprint: syntheticRunnerLimitsFingerprint(),
    adapterProtocolVersion: SYNTHETIC_OPENCODE_ADAPTER_VERSION,
    executableFingerprint: frozenAttempt.binding.executable_fingerprint,
    executableVersion: frozenAttempt.binding.executable_version,
    executableBasename: frozenAttempt.binding.executable_basename,
    executablePlatform: frozenAttempt.binding.executable_platform,
    executableIdentityPolicyVersion:
      frozenAttempt.binding.executable_identity_policy_version,
    operationalRunId: runId,
    label: "synthetic replay attempt",
  });
  const report = deepFreeze({
    schema_version: SYNTHETIC_REPLAY_REPORT_VERSION,
    report_kind: "synthetic-profile-replay",
    run_id: runId,
    created_at: createdAt,
    evidence_class: "model-backed-attempt",
    model_execution_confirmed:
      result.adapter_completed_correctly === true || result.evidence_complete === true,
    family_id: instance.family_id,
    seed: instance.seed,
    semantic_variant_index: instance.semantic_variant_index,
    semantic_variant_id: instance.semantic_variant_id,
    semantic_variant_fingerprint: instance.semantic_variant_fingerprint,
    trajectory_id: instance.trajectory_id,
    trajectory_fingerprint: instance.trajectory_fingerprint,
    trajectory_repetition: instance.repetition,
    instance_fingerprint: instance.instance_fingerprint,
    profile_id: profileId,
    profile_fingerprint: result.profile_fingerprint,
    model_binding_fingerprint: modelBindingFingerprint,
    execution_status: result.execution_status,
    termination_reason: result.termination_reason,
    reason: result.reason,
    adapter_completed_correctly: result.adapter_completed_correctly === true,
    task_correct: result.task_correct === true,
    claimed_completion: result.claimed_completion === true,
    false_block: result.false_block,
    evidence_complete: result.evidence_complete === true,
    whole_task_success: result.whole_task_success === true,
    result_fingerprint: fingerprint(frozenAttempt.result),
    attempt: frozenAttempt,
    residual_caveats: ["single-profile-replay-no-comparison"],
  });
  validateSyntheticReplayReportSourceBinding(report, { sourceRoot: root });
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
  contractSourceRoot = sourceRoot,
  report,
  relativeRoot = DEFAULT_SYNTHETIC_REPLAY_ROOT,
  beforeMarker = null,
} = {}) {
  validateSyntheticReplayReportSourceBinding(report, {
    sourceRoot: contractSourceRoot,
  });
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
