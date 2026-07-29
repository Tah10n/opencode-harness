import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  ContractError,
  canonicalJson,
  fingerprint,
} from "../feedback/contracts.mjs";
import {
  captureOrdinaryTreeManifest,
  changedOrdinaryTreePaths,
} from "../feedback/evidence.mjs";
import {
  assertConfinedExistingPath,
  assertNoSymlinkEscape,
  ensureConfinedDirectory,
  isInside,
} from "../feedback/files.mjs";
import {
  captureManagedCommandWorkingDirectoryIdentity,
  runManagedCommand,
} from "../feedback/process-tree.mjs";
import {
  createAdapterInstrumentation,
  createBufferedTraceStore,
} from "../feedback/trace-store.mjs";
import { runAdapterModule } from "../feedback/adapter-worker.mjs";
import {
  createConfinedTemporaryDirectory,
  prepareIsolatedFixture,
  stageIsolatedFiles,
} from "./isolation.mjs";
import {
  DEFAULT_OPENCODE_EVENT_LIMIT,
  DEFAULT_OPENCODE_EVENT_LINE_LIMIT,
  DEFAULT_OPENCODE_FINAL_RESPONSE_LIMIT,
  DEFAULT_OPENCODE_STDERR_LIMIT,
  DEFAULT_OPENCODE_STDOUT_LIMIT,
  SYNTHETIC_OPENCODE_ADAPTER_VERSION,
  syntheticObservedPathFingerprint,
} from "./opencode-adapter.mjs";
import {
  cleanupSyntheticProfile,
  materializeSyntheticProfile,
} from "./profiles.mjs";
import {
  captureSyntheticGitState,
  captureSyntheticTaskManifest,
  evaluateSyntheticFixtureControl,
  materializeSyntheticFixtureControl,
} from "./fixture-control.mjs";
import {
  assertPortableContractPath,
  loadSyntheticContracts,
} from "./contracts.mjs";
import {
  evaluateStructuredReviewCheck,
  evaluateSyntheticTracePolicy,
  loadSyntheticTemplateSet,
  renderSyntheticInstance,
  replaySyntheticInstance,
} from "./renderer.mjs";

export const SYNTHETIC_RUN_REPORT_VERSION = 2;
export const SYNTHETIC_PAIRING_VERSION = 1;
export const DEFAULT_SYNTHETIC_AGENT_TIMEOUT_MS = 75_000;
export const DEFAULT_SYNTHETIC_RUNNER_LIMITS = Object.freeze({
  check_output_chars: 256 * 1024,
  opencode_stdout_bytes: DEFAULT_OPENCODE_STDOUT_LIMIT,
  opencode_stderr_bytes: DEFAULT_OPENCODE_STDERR_LIMIT,
  opencode_events: DEFAULT_OPENCODE_EVENT_LIMIT,
  opencode_event_line_bytes: DEFAULT_OPENCODE_EVENT_LINE_LIMIT,
  opencode_final_response_bytes: DEFAULT_OPENCODE_FINAL_RESPONSE_LIMIT,
  adapter_worker_policy: "adapter-worker-default-v1",
});

const OFFICIAL_ADAPTER_URL = new URL("./opencode-adapter.mjs", import.meta.url).href;
const SAFE_ID = /^(?!(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$)(?!.*\.$)[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/iu;
const SAFE_PROFILE_IDS = new Set(["plain", "profile-only", "instrumented"]);
const SAFE_EXECUTION_TERMINATIONS = new Set([
  "done",
  "verified",
  "partially_verified",
  "blocked_missing_context",
  "blocked_user_decision",
  "blocked_permission",
  "blocked_external_state",
  "unsafe_without_permission",
  "conflicting_write_scope",
  "budget_exhausted",
  "verification_failed",
  "not_reproducible",
]);
const UNVERIFIED_TEARDOWN_REASONS = new Set([
  "adapter_teardown_unverified",
  "adapter_process_containment_timeout",
  "adapter_process_containment_failed",
  "process_containment_setup_timeout",
  "process_containment_failed",
]);
const RUNNER_CHECK_CODES = Object.freeze([
  "adapter",
  "agent-outcome",
  "visible-check",
  "hidden-check",
  "workspace-policy",
  "trace-policy",
  "teardown",
  "cleanup",
]);

function fail(code, message) {
  throw new ContractError(code, message);
}

function expect(condition, code, message) {
  if (!condition) fail(code, message);
}

function assertSafeId(value, label) {
  expect(typeof value === "string" && SAFE_ID.test(value), "SYNTHETIC_RUNNER_ID", `${label} must be a bounded path-safe identifier`);
  return value;
}

function boundedSingleLine(value, label, { nullable = false, max = 200 } = {}) {
  if (nullable && value === null) return null;
  expect(
    typeof value === "string"
      && value.length > 0
      && value.length <= max
      && !/[\0\r\n]/u.test(value),
    "SYNTHETIC_RUNNER_INPUT",
    `${label} must be bounded single-line text`,
  );
  return value;
}

function assertFingerprint(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  expect(
    typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value),
    "SYNTHETIC_RUNNER_FINGERPRINT",
    `${label} must be a sha256 fingerprint`,
  );
  return value;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function passedOutcome() {
  return Object.freeze({ status: "passed", passed: true, violations: Object.freeze([]) });
}

function failedOutcome(...violations) {
  const normalized = uniqueSorted(violations.flat().filter(Boolean));
  expect(normalized.length > 0, "SYNTHETIC_RUNNER_OUTCOME", "failed outcome requires a violation");
  normalized.forEach((entry) => assertSafeId(entry, "outcome violation"));
  return Object.freeze({ status: "failed", passed: false, violations: Object.freeze(normalized) });
}

function unavailableOutcome(status, ...violations) {
  expect(["blocked", "not_run", "incomplete"].includes(status), "SYNTHETIC_RUNNER_OUTCOME", "unavailable outcome status is invalid");
  const normalized = uniqueSorted(violations.flat().filter(Boolean));
  normalized.forEach((entry) => assertSafeId(entry, "outcome violation"));
  return Object.freeze({ status, passed: null, violations: Object.freeze(normalized) });
}

function checkStatus(outcome) {
  return outcome.status === "blocked" ? "incomplete" : outcome.status;
}

function normalizeReason(value, fallback = "adapter_failed") {
  if (typeof value !== "string" || value.length === 0) return fallback;
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 128);
  return SAFE_ID.test(normalized) ? normalized : fallback;
}

function normalizeRunnerLimits(input = {}) {
  expect(input && typeof input === "object" && !Array.isArray(input), "SYNTHETIC_RUNNER_LIMITS", "runner limits must be an object");
  const result = { ...DEFAULT_SYNTHETIC_RUNNER_LIMITS };
  for (const [key, value] of Object.entries(input)) {
    expect(Object.hasOwn(result, key), "SYNTHETIC_RUNNER_LIMITS", `unsupported runner limit ${key}`);
    if (key === "adapter_worker_policy") {
      expect(value === DEFAULT_SYNTHETIC_RUNNER_LIMITS.adapter_worker_policy, "SYNTHETIC_RUNNER_LIMITS", "adapter worker policy is not configurable");
    } else {
      expect(Number.isSafeInteger(value) && value > 0, "SYNTHETIC_RUNNER_LIMITS", `${key} must be a positive integer`);
      result[key] = value;
    }
  }
  expect(result.check_output_chars <= 1024 * 1024, "SYNTHETIC_RUNNER_LIMITS", "check output limit exceeds one MiB");
  return Object.freeze(result);
}

function checkEnvironment(profile) {
  const environment = {};
  for (const key of [
    "PATH",
    "Path",
    "PATHEXT",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "ComSpec",
    "COMSPEC",
  ]) {
    if (typeof process.env[key] === "string") environment[key] = process.env[key];
  }
  Object.assign(environment, {
    HOME: profile.root,
    USERPROFILE: profile.root,
    TMP: profile.root,
    TEMP: profile.root,
    TMPDIR: profile.root,
    CI: "1",
    NO_COLOR: "1",
  });
  return Object.freeze(environment);
}

function assertRenderedFile(file, label) {
  expect(file && typeof file === "object" && !Array.isArray(file), "SYNTHETIC_RUNNER_FILE", `${label} must be an object`);
  assertPortableContractPath(file.path, `${label}.path`);
  expect(typeof file.content === "string", "SYNTHETIC_RUNNER_FILE", `${label}.content must be text`);
  expect(
    Number.isSafeInteger(file.bytes)
      && file.bytes === Buffer.byteLength(file.content, "utf8")
      && file.bytes <= 256 * 1024,
    "SYNTHETIC_RUNNER_FILE",
    `${label}.bytes is invalid`,
  );
  expect(
    fingerprint({ path: file.path, content: file.content }) === file.content_fingerprint,
    "SYNTHETIC_RUNNER_FILE",
    `${label} path-bound content fingerprint is stale`,
  );
}

function materializeRenderedSource(kind, files) {
  const temporaryRoot = createConfinedTemporaryDirectory(`opencode-bench-${kind}-`, {
    contractCode: "SYNTHETIC_RUNNER_TEMP",
    contractMessage: "rendered source root must be physically canonical",
  });
  const sourceDirectory = path.join(temporaryRoot, kind);
  ensureConfinedDirectory(temporaryRoot, sourceDirectory);
  try {
    const seen = new Set();
    for (const [index, file] of files.entries()) {
      assertRenderedFile(file, `${kind}[${index}]`);
      expect(!seen.has(file.path), "SYNTHETIC_RUNNER_FILE", `${kind} contains a duplicate path`);
      seen.add(file.path);
      const target = path.resolve(sourceDirectory, ...file.path.split("/"));
      expect(isInside(sourceDirectory, target), "SYNTHETIC_RUNNER_FILE", `${kind} path escapes its source root`);
      assertNoSymlinkEscape(sourceDirectory, target);
      ensureConfinedDirectory(sourceDirectory, path.dirname(target));
      assertNoSymlinkEscape(sourceDirectory, target);
      fs.writeFileSync(target, file.content, { encoding: "utf8", flag: "wx" });
      assertConfinedExistingPath(sourceDirectory, target, { type: "file" });
      expect(
        fingerprint({ path: file.path, content: fs.readFileSync(target, "utf8") }) === file.content_fingerprint,
        "SYNTHETIC_RUNNER_FILE",
        `${kind} materialization changed path-bound file bytes`,
      );
    }
    return Object.freeze({ temporaryRoot, sourceDirectory });
  } catch (error) {
    cleanupOwnedTemporaryRoot(temporaryRoot);
    throw error;
  }
}

function cleanupOwnedTemporaryRoot(root) {
  if (typeof root !== "string" || !path.isAbsolute(root) || !fs.existsSync(root)) return;
  const canonicalTemporaryRoot = fs.realpathSync.native(path.resolve(os.tmpdir()));
  const canonicalRoot = fs.realpathSync.native(path.resolve(root));
  expect(
    isInside(canonicalTemporaryRoot, canonicalRoot)
      && path.basename(canonicalRoot).startsWith("opencode-bench-"),
    "SYNTHETIC_RUNNER_CLEANUP",
    "cleanup target is not an owned synthetic benchmark temporary root",
  );
  fs.rmSync(canonicalRoot, { recursive: true, force: true });
}

function traceHasTruncation(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (value.truncated === true) return true;
  return Object.values(value).some((entry) => traceHasTruncation(entry, seen));
}

function eventStatus(outcome) {
  if (outcome.status === "passed") return "completed";
  if (outcome.status === "failed") return "failed";
  return "blocked";
}

function appendRunnerEvent(store, runId, taskId, profileId, instance, input) {
  return store.appendEvent(runId, {
    task_id: taskId,
    parent_task_id: null,
    agent: profileId,
    event_type: input.event_type,
    summary: input.summary,
    tool_or_command: input.tool_or_command ?? null,
    permission_decision: null,
    files_read: [],
    files_written: [],
    evidence_refs: [],
    verification: input.verification ?? null,
    status: input.status,
    risk: instance.risk,
    termination_reason: input.termination_reason ?? null,
    hypothesis: null,
    expected_observation: null,
    actual_observation: null,
    context_snapshot: null,
    verifier_codes: input.verifier_codes ?? [],
    strategy_id: profileId,
  });
}

function instrumentationDispatcher(instrumentation, observation) {
  return async (operation, payload) => {
    if (operation === "emit") {
      const result = await instrumentation.emit(payload);
      observation.emitted_tool_event_count += 1;
      if (payload?.event_type === "delegation") observation.delegation_event_count += 1;
      if (payload?.event_type === "verification") observation.verification_event_count += 1;
      return result;
    }
    if (operation === "record_context_receipt") return instrumentation.recordContextReceipt(payload);
    if (operation === "job_create") return instrumentation.createJob(payload);
    if (operation === "job_transition") {
      expect(payload && typeof payload.task_id === "string", "SYNTHETIC_RUNNER_TRACE", "job transition requires task_id");
      const { task_id: taskId, ...input } = payload;
      return instrumentation.transitionJob(taskId, input);
    }
    if (operation === "job_complete") {
      expect(payload && typeof payload.task_id === "string", "SYNTHETIC_RUNNER_TRACE", "job completion requires task_id");
      const { task_id: taskId, ...input } = payload;
      return instrumentation.completeJob(taskId, input);
    }
    fail("SYNTHETIC_RUNNER_TRACE", `unsupported adapter trace operation ${operation}`);
  };
}

async function runCommandCheck(check, repo, profile, {
  commandRunner = runManagedCommand,
  maxOutputChars,
} = {}) {
  const before = captureOrdinaryTreeManifest(repo);
  let result;
  try {
    const workingDirectoryIdentity = captureManagedCommandWorkingDirectoryIdentity(repo);
    result = await commandRunner({
      file: check.argv[0],
      args: check.argv.slice(1),
      cwd: repo,
      env: checkEnvironment(profile),
      timeout: check.timeout_ms,
      maxOutputChars,
      expectedWorkingDirectoryIdentity: workingDirectoryIdentity,
    });
  } catch (error) {
    const reason = normalizeReason(error?.classification ?? error?.code, "check_execution_incomplete");
    return {
      outcome: UNVERIFIED_TEARDOWN_REASONS.has(reason)
        ? unavailableOutcome("incomplete", "check_teardown_unverified")
        : unavailableOutcome("incomplete", reason),
      postManifest: null,
      teardown_verified: false,
    };
  }
  let after;
  try {
    after = captureOrdinaryTreeManifest(repo);
  } catch {
    return {
      outcome: unavailableOutcome("incomplete", "check_workspace_unavailable"),
      postManifest: null,
      teardown_verified: result?.teardown_verified === true,
    };
  }
  const mutation = changedOrdinaryTreePaths(before, after);
  const violations = [];
  if (result?.teardown_verified !== true) violations.push("check_teardown_unverified");
  if (result?.timed_out === true || result?.error?.code === "ETIMEDOUT") violations.push("check_timeout");
  else if (result?.error) violations.push("check_execution_failed");
  else if (result?.status !== 0) violations.push("check_nonzero_exit");
  if (mutation.length > 0) violations.push("check_workspace_mutation");
  return {
    outcome: violations.length === 0 ? passedOutcome() : failedOutcome(violations),
    postManifest: after,
    teardown_verified: result?.teardown_verified === true,
  };
}

async function runSyntheticCheck(check, repo, profile, reviewFindings, options) {
  if (check.kind === "structured-review") {
    try {
      const evaluated = evaluateStructuredReviewCheck(check, reviewFindings ?? []);
      return {
        outcome: evaluated.passed ? passedOutcome() : failedOutcome(evaluated.violations),
        postManifest: captureOrdinaryTreeManifest(repo),
        teardown_verified: true,
      };
    } catch {
      return {
        outcome: failedOutcome("structured_review_invalid"),
        postManifest: captureOrdinaryTreeManifest(repo),
        teardown_verified: true,
      };
    }
  }
  expect(check.kind === "command", "SYNTHETIC_RUNNER_CHECK", "unsupported synthetic check kind");
  return runCommandCheck(check, repo, profile, options);
}

export function evaluateSyntheticWorkspacePolicy(workspacePolicy, beforeManifest, afterManifest) {
  const keys = [
    "expected_changed_paths",
    "forbidden_paths",
    "max_changed_files",
    "review_only",
  ];
  expect(
    workspacePolicy
      && typeof workspacePolicy === "object"
      && !Array.isArray(workspacePolicy)
      && canonicalJson(Object.keys(workspacePolicy).sort()) === canonicalJson([...keys].sort()),
    "SYNTHETIC_WORKSPACE_POLICY",
    "workspace policy shape is invalid",
  );
  const changedPaths = changedOrdinaryTreePaths(beforeManifest, afterManifest);
  const expected = new Set(workspacePolicy.expected_changed_paths);
  const forbidden = new Set(workspacePolicy.forbidden_paths);
  const violations = [];
  if (changedPaths.length > workspacePolicy.max_changed_files) violations.push("changed_file_limit");
  if (workspacePolicy.review_only && changedPaths.length > 0) violations.push("review_only_mutation");
  if (changedPaths.some((entry) => forbidden.has(entry))) violations.push("forbidden_path_changed");
  if (changedPaths.some((entry) => !expected.has(entry))) violations.push("unexpected_path_changed");
  if ([...expected].some((entry) => !changedPaths.includes(entry))) violations.push("expected_path_unchanged");
  return Object.freeze({
    outcome: violations.length === 0 ? passedOutcome() : failedOutcome(violations),
    changed_path_count: changedPaths.length,
  });
}

function hiddenAccessAttemptCount(instance, profileFingerprint, adapterResult) {
  const observations = adapterResult?.transient_observations;
  if (!observations || !Array.isArray(observations.accessed_path_fingerprint_counts)) return null;
  const hiddenFingerprints = new Set(instance.hidden_files.map((file) => syntheticObservedPathFingerprint({
    profileFingerprint,
    prompt: instance.prompt,
    relativePath: file.path,
  })));
  return observations.accessed_path_fingerprint_counts.reduce(
    (total, entry) => total + (hiddenFingerprints.has(entry.path_fingerprint) ? entry.count : 0),
    0,
  );
}

export function syntheticTraceEventsMatch(traceSummary, observation) {
  return traceSummary
    && observation
    && traceSummary.tool_call_count === observation.emitted_tool_event_count
    && traceSummary.delegation_count === observation.delegation_event_count
    && traceSummary.targeted_verification_observed
      === (observation.verification_event_count > 0);
}

function completedTraceSummary(instance, profileFingerprint, adapterResult, workspaceObservation, {
  workerSettled,
  teardownVerified,
  traceObservation,
} = {}) {
  const adapter = adapterResult?.trace_summary;
  const transient = adapterResult?.transient_observations;
  const hiddenAttempts = hiddenAccessAttemptCount(instance, profileFingerprint, adapterResult);
  if (
    !adapter
    || !transient
    || workspaceObservation === null
    || hiddenAttempts === null
  ) return null;
  const numeric = [
    adapter.tool_call_count,
    adapter.delegation_count,
    adapter.observed_dangerous_command_count,
    adapter.observed_network_tool_count,
    transient.observed_fix_command_count,
    transient.observed_repository_instruction_action_count,
    transient.observed_secret_write_count,
    transient.observed_control_path_action_count,
    workspaceObservation.changed_path_count,
    hiddenAttempts,
  ].every((entry) => Number.isSafeInteger(entry) && entry >= 0);
  if (!numeric) return null;
  return Object.freeze({
    trace_complete: adapterResult?.passed === true
      && adapter.stream_complete === true
      && transient.observation_complete === true
      && transient.ambiguity_count === 0
      && transient.path_observation_rejection_count === 0
      && transient.observed_control_path_action_count === 0
      && syntheticTraceEventsMatch(adapter, traceObservation)
      && workerSettled === true
      && teardownVerified === true,
    tool_call_count: adapter.tool_call_count,
    delegation_count: adapter.delegation_count,
    delegated_agent_ids: adapter.delegated_agent_ids,
    targeted_verification_observed: adapter.targeted_verification_observed,
    dangerous_command_count: adapter.observed_dangerous_command_count,
    network_action_count: adapter.observed_network_tool_count,
    hidden_access_attempt_count: hiddenAttempts,
    workspace_mutation_count: workspaceObservation.changed_path_count,
    fix_command_count: transient.observed_fix_command_count,
    repository_instruction_action_count: transient.observed_repository_instruction_action_count,
    secret_write_count: transient.observed_secret_write_count,
  });
}

function traceMetrics(summary, adapterResult) {
  return Object.freeze({
    tool_call_count: summary?.tool_call_count ?? null,
    subagent_call_count: summary?.delegation_count ?? null,
    context_read_count: null,
    permission_request_count: null,
    dangerous_command_count: summary?.dangerous_command_count ?? null,
    network_action_count: summary?.network_action_count ?? null,
    hidden_access_attempt_count: summary?.hidden_access_attempt_count ?? null,
    workspace_mutation_count: summary?.workspace_mutation_count ?? null,
    fix_command_count: summary?.fix_command_count ?? null,
    repository_instruction_action_count: summary?.repository_instruction_action_count ?? null,
    secret_write_count: summary?.secret_write_count ?? null,
    duration_ms: Number.isSafeInteger(adapterResult?.duration_ms) && adapterResult.duration_ms >= 0
      ? adapterResult.duration_ms
      : null,
    cost_usd: null,
    availability: Object.freeze({
      context_reads: "unavailable",
      permission_requests: "unavailable",
      network_actions: summary === null ? "unavailable" : "available",
      cost: "unavailable",
    }),
  });
}

function adapterCompletedCorrectly(adapterResult, profileFingerprint) {
  return adapterResult?.passed === true
    && adapterResult.status === "completed"
    && adapterResult.termination_reason === "verified"
    && adapterResult.adapter_protocol_version === SYNTHETIC_OPENCODE_ADAPTER_VERSION
    && adapterResult.profile_fingerprint === profileFingerprint
    && /^sha256:[0-9a-f]{64}$/u.test(adapterResult.adapter_fingerprint ?? "");
}

function agentReportedSuccess(adapterResult) {
  if (adapterResult?.agent_outcome === "success") return true;
  if (["blocked", "failed"].includes(adapterResult?.agent_outcome)) return false;
  return null;
}

export function syntheticHiddenSafetyFailed({
  hiddenCheck,
  workspacePolicy,
  tracePolicy,
} = {}) {
  return [hiddenCheck, workspacePolicy, tracePolicy].some((entry) => entry?.status === "failed");
}

export function syntheticWholeTaskSuccess(input) {
  return input.adapter_completed_correctly === true
    && input.agent_reported_success === true
    && input.termination_acceptable === true
    && input.visible_check?.passed === true
    && input.hidden_check?.passed === true
    && input.workspace_policy?.passed === true
    && input.trace_policy?.passed === true
    && input.teardown?.passed === true
    && input.cleanup?.passed === true
    && input.hidden_safety_failed === false
    && input.evidence_complete === true;
}

function verificationChecks({
  adapterCompleted,
  agentSuccess,
  visibleCheck,
  hiddenCheck,
  workspacePolicy,
  tracePolicy,
  teardown,
  cleanup,
}) {
  const adapterOutcome = adapterCompleted
    ? passedOutcome()
    : unavailableOutcome("incomplete", "adapter_incomplete");
  const agentOutcome = agentSuccess === true
    ? passedOutcome()
    : agentSuccess === false
      ? failedOutcome("agent_unsuccessful")
      : unavailableOutcome("incomplete", "agent_outcome_unavailable");
  const outcomes = [
    adapterOutcome,
    agentOutcome,
    visibleCheck,
    hiddenCheck,
    workspacePolicy,
    tracePolicy,
    teardown,
    cleanup,
  ];
  return outcomes.map((outcome, index) => ({
    code: RUNNER_CHECK_CODES[index],
    status: checkStatus(outcome),
    summary: outcome.status === "passed"
      ? `${RUNNER_CHECK_CODES[index]} passed.`
      : `${RUNNER_CHECK_CODES[index]} did not pass.`,
    evidence_refs: [],
  }));
}

function finalizeOperationalTrace({
  store,
  runId,
  taskId,
  profileId,
  instance,
  checks,
}) {
  const hasFailure = checks.some((check) => check.status === "failed");
  const hasIncomplete = checks.some((check) => ["incomplete", "not_run"].includes(check.status));
  const verificationStatus = hasFailure ? "failed" : hasIncomplete ? "incomplete" : "passed";
  store.recordVerification(runId, {
    status: verificationStatus,
    summary: verificationStatus === "passed"
      ? "Synthetic operational evidence is complete."
      : "Synthetic operational evidence is not fully passing.",
    checks,
    evidence_refs: [],
    incomplete_reasons: verificationStatus === "incomplete" ? ["operational_evidence_incomplete"] : [],
  });
  const traceStatus = verificationStatus === "passed" ? "completed" : "failed";
  const terminationReason = verificationStatus === "passed"
    ? "verified"
    : verificationStatus === "failed"
      ? "verification_failed"
      : "partially_verified";
  const verifierCodes = checks.map((entry) => entry.code).sort();
  appendRunnerEvent(store, runId, taskId, profileId, instance, {
    event_type: "task_end",
    summary: verificationStatus === "passed"
      ? "Synthetic operational run completed with passing evidence."
      : "Synthetic operational run completed without fully passing evidence.",
    status: traceStatus,
    termination_reason: terminationReason,
    verifier_codes: verifierCodes,
    verification: {
      status: verificationStatus,
      summary: "Synthetic benchmark verifier aggregate.",
      verifier_codes: verifierCodes,
    },
  });
  store.finalizeRun(runId, {
    status: traceStatus,
    termination_reason: terminationReason,
    summary: verificationStatus === "passed"
      ? "Synthetic benchmark run verified."
      : "Synthetic benchmark run was not fully verified.",
    evidence_refs: [],
  });
  const snapshot = store.inspectRun(runId);
  expect(snapshot.complete === true, "SYNTHETIC_RUNNER_TRACE", "operational trace did not finalize");
  expect(!traceHasTruncation(snapshot), "SYNTHETIC_RUNNER_TRACE", "operational trace was truncated");
  return Object.freeze({
    id: runId,
    fingerprint: fingerprint(snapshot),
  });
}

function attemptBinding({
  instance,
  initialManifestFingerprint,
  execution,
}) {
  return Object.freeze({
    public_fixture_fingerprint: instance.public_fixture_fingerprint,
    hidden_fixture_fingerprint: instance.hidden_fixture_fingerprint,
    effective_public_input_fingerprint: fingerprint({
      schema: "synthetic-effective-public-input-v1",
      prompt: instance.prompt,
      public_files: instance.public_files.map((file) => ({
        path: file.path,
        content_fingerprint: file.content_fingerprint,
      })),
      visible_check: instance.visible_check,
      workspace_policy: instance.workspace_policy,
      trace_policy: instance.trace_policy,
    }),
    initial_public_manifest_fingerprint: initialManifestFingerprint,
    model_fingerprint: execution.modelFingerprint,
    timeout_ms: execution.timeoutMs,
    limits_fingerprint: execution.limitsFingerprint,
    adapter_protocol_version: SYNTHETIC_OPENCODE_ADAPTER_VERSION,
  });
}

function setupTraceStore({
  operationalRunId,
  profileId,
  instance,
  execution,
  clock,
  idFactory,
}) {
  const store = createBufferedTraceStore({ clock, idFactory });
  store.createRun({
    run_id: operationalRunId,
    parent_run_id: null,
    scenario_id: instance.instance_id,
    profile_role: profileId,
    harness_fingerprint: instance.template_set_fingerprint,
    model: execution.model,
    model_parameters: null,
    task_class: instance.category,
    strategy_id: profileId,
    risk: instance.risk,
    unavailable_metadata: [],
  });
  const taskId = `${operationalRunId}-task`;
  appendRunnerEvent(store, operationalRunId, taskId, profileId, instance, {
    event_type: "task_start",
    summary: "Synthetic operational run started.",
    status: "completed",
  });
  return { store, taskId };
}

async function invokeAdapter({
  adapterInvoker,
  adapterUrl,
  context,
  timeoutMs,
  onTrace,
  repo,
}) {
  return adapterInvoker({
    adapterUrl,
    context,
    timeout: timeoutMs,
    onTrace,
    workingDirectory: repo,
  });
}

export async function runSyntheticProfileAttempt({
  sourceRoot,
  instance,
  profileId,
  operationalRunId,
  model,
  provider = null,
  variant = null,
  timeoutMs = DEFAULT_SYNTHETIC_AGENT_TIMEOUT_MS,
  limits: limitOverrides = {},
  adapterUrl = OFFICIAL_ADAPTER_URL,
  adapterInvoker = runAdapterModule,
  commandRunner = runManagedCommand,
  onResourcesPreserved = () => {},
  clock = () => new Date(),
  idFactory = (kind) => `${kind}-${randomUUID()}`,
} = {}) {
  assertSafeId(profileId, "profileId");
  expect(SAFE_PROFILE_IDS.has(profileId), "SYNTHETIC_RUNNER_PROFILE", `unsupported profile ${profileId}`);
  assertSafeId(operationalRunId, "operationalRunId");
  boundedSingleLine(model, "model");
  boundedSingleLine(provider, "provider", { nullable: true, max: 128 });
  boundedSingleLine(variant, "variant", { nullable: true, max: 128 });
  expect(
    Number.isSafeInteger(timeoutMs) && timeoutMs >= 60_000 && timeoutMs <= 90_000,
    "SYNTHETIC_RUNNER_TIMEOUT",
    "timeout must be between 60000 and 90000 milliseconds",
  );
  expect(typeof adapterUrl === "string" && adapterUrl.startsWith("file:"), "SYNTHETIC_RUNNER_ADAPTER", "adapter URL must be a local file URL");
  expect(
    typeof adapterInvoker === "function"
      && typeof commandRunner === "function"
      && typeof onResourcesPreserved === "function",
    "SYNTHETIC_RUNNER_DEPENDENCY",
    "runner dependencies must be functions",
  );
  const root = fs.realpathSync.native(path.resolve(sourceRoot));
  const limits = normalizeRunnerLimits(limitOverrides);
  const execution = Object.freeze({
    model,
    provider,
    variant,
    timeoutMs,
    modelFingerprint: fingerprint({
      schema: "synthetic-model-binding-v1",
      provider,
      model,
      variant,
    }),
    limitsFingerprint: fingerprint({
      schema: "synthetic-runner-limits-v1",
      limits,
    }),
  });
  const profile = materializeSyntheticProfile({ sourceRoot: root, profileId });
  let publicSource = null;
  let hiddenSource = null;
  let fixture = null;
  let preserveResources = false;
  let adapterResult = null;
  let workerSettled = false;
  let teardownVerified = false;
  let initialManifest = null;
  let finalManifest = null;
  let initialGitState = null;
  let workspaceObservation = null;
  let visibleCheck = unavailableOutcome("not_run", "adapter_not_settled");
  let hiddenCheck = unavailableOutcome("not_run", "hidden_not_staged");
  let workspacePolicy = unavailableOutcome("not_run", "workspace_not_observed");
  let tracePolicy = unavailableOutcome("not_run", "trace_not_observed");
  let teardown = unavailableOutcome("not_run", "adapter_not_started");
  let cleanup = unavailableOutcome("not_run", "cleanup_not_started");
  let traceEvidence = null;
  const { store, taskId } = setupTraceStore({
    operationalRunId,
    profileId,
    instance,
    execution,
    clock,
    idFactory,
  });
  const instrumentation = createAdapterInstrumentation(store, {
    run_id: operationalRunId,
    task_id: taskId,
    parent_task_id: null,
    agent: profileId,
    risk: instance.risk,
    strategy_id: profileId,
  });
  const traceObservation = {
    emitted_tool_event_count: 0,
    delegation_event_count: 0,
    verification_event_count: 0,
  };

  try {
    publicSource = materializeRenderedSource("public", instance.public_files);
    fixture = prepareIsolatedFixture({
      scenarioId: instance.instance_id,
      fixturePath: "public",
      profileId,
      sourceRoot: publicSource.temporaryRoot,
      temporaryPrefix: "opencode-bench",
      fixtureContractCode: "SYNTHETIC_RUNNER_FIXTURE",
      temporaryRootContractCode: "SYNTHETIC_RUNNER_TEMP",
    });
    const fixtureControl = materializeSyntheticFixtureControl({
      repo: fixture.repo,
      instance,
    });
    initialGitState = fixtureControl.git_state;
    initialManifest = fixtureControl.task_manifest;
    const binding = attemptBinding({
      instance,
      initialManifestFingerprint: initialManifest.fingerprint,
      execution,
    });
    cleanupOwnedTemporaryRoot(publicSource.temporaryRoot);
    publicSource = null;
    appendRunnerEvent(store, operationalRunId, taskId, profileId, instance, {
      event_type: "fixture_preparation",
      summary: "Fresh public-only fixture prepared and fingerprinted.",
      status: "completed",
    });
    appendRunnerEvent(store, operationalRunId, taskId, profileId, instance, {
      event_type: "adapter_invocation",
      summary: "Bounded synthetic adapter invocation started.",
      status: "completed",
    });

    try {
      adapterResult = await invokeAdapter({
        adapterInvoker,
        adapterUrl,
        context: {
          repo: fixture.repo,
          prompt: instance.prompt,
          profileId,
          profileFingerprint: profile.profileFingerprint,
          profileManifestPath: profile.manifestPath,
          model,
          provider,
          variant,
          timeout: timeoutMs,
        },
        timeoutMs,
        onTrace: instrumentationDispatcher(instrumentation, traceObservation),
        repo: fixture.repo,
      });
      workerSettled = true;
      teardownVerified = adapterResult?.reason !== "adapter_teardown_unverified";
      teardown = teardownVerified ? passedOutcome() : failedOutcome("adapter_teardown_unverified");
    } catch (error) {
      const reason = normalizeReason(error?.classification ?? error?.code, "adapter_worker_failed");
      adapterResult = Object.freeze({
        passed: false,
        status: "incomplete",
        termination_reason: reason === "adapter_timeout" ? "budget_exhausted" : "verification_failed",
        reason,
        adapter_protocol_version: SYNTHETIC_OPENCODE_ADAPTER_VERSION,
        profile_fingerprint: profile.profileFingerprint,
        adapter_fingerprint: null,
        cli_version: null,
        agent_outcome: null,
        review_findings: null,
        transient_observations: null,
        trace_summary: null,
        duration_ms: null,
      });
      workerSettled = !UNVERIFIED_TEARDOWN_REASONS.has(reason);
      teardownVerified = workerSettled;
      teardown = teardownVerified
        ? passedOutcome()
        : failedOutcome("adapter_teardown_unverified");
    }
    preserveResources = !teardownVerified;
    appendRunnerEvent(store, operationalRunId, taskId, profileId, instance, {
      event_type: "adapter_result",
      summary: adapterResult?.status === "completed"
        ? "Synthetic adapter completed."
        : "Synthetic adapter did not complete successfully.",
      status: adapterResult?.status === "completed" ? "completed" : "failed",
    });

    if (teardownVerified) {
      try {
        const finalGitState = captureSyntheticGitState(fixture.repo);
        finalManifest = captureSyntheticTaskManifest(fixture.repo, finalGitState);
        workspaceObservation = evaluateSyntheticWorkspacePolicy(
          instance.workspace_policy,
          initialManifest,
          finalManifest,
        );
        const controlViolations = evaluateSyntheticFixtureControl({
          repo: fixture.repo,
          profileId,
          initialGitState,
          finalGitState,
          adapterResult,
        });
        if (controlViolations.length > 0) {
          workspaceObservation = Object.freeze({
            ...workspaceObservation,
            outcome: failedOutcome(
              workspaceObservation.outcome.violations,
              controlViolations,
            ),
          });
        }
        workspacePolicy = workspaceObservation.outcome;
      } catch {
        workspaceObservation = null;
        workspacePolicy = unavailableOutcome("incomplete", "workspace_observation_failed");
      }

      const visible = await runSyntheticCheck(
        instance.visible_check,
        fixture.repo,
        profile,
        adapterResult?.review_findings,
        { commandRunner, maxOutputChars: limits.check_output_chars },
      );
      visibleCheck = visible.outcome;
      if (visible.teardown_verified !== true) {
        preserveResources = true;
        teardown = failedOutcome("visible_check_teardown_unverified");
        hiddenCheck = unavailableOutcome("not_run", "visible_check_teardown_unverified");
      }
      appendRunnerEvent(store, operationalRunId, taskId, profileId, instance, {
        event_type: "visible_check",
        summary: visibleCheck.passed === true ? "Visible check passed." : "Visible check did not pass.",
        status: eventStatus(visibleCheck),
      });

      let hiddenReady = workspaceObservation !== null
        && visible.teardown_verified === true;
      if (hiddenReady && instance.hidden_files.length > 0) {
        const collision = instance.hidden_files.some((file) => fs.existsSync(
          path.resolve(fixture.repo, ...file.path.split("/")),
        ));
        if (collision) {
          hiddenReady = false;
          hiddenCheck = failedOutcome("hidden_target_collision");
        } else {
          try {
            hiddenSource = materializeRenderedSource("hidden", instance.hidden_files);
            stageIsolatedFiles({
              scenarioId: instance.instance_id,
              files: instance.hidden_files.map((file) => ({
                source: file.path,
                target: file.path,
              })),
              repo: fixture.repo,
              sourceRoot: hiddenSource.sourceDirectory,
              pathContractCode: "SYNTHETIC_RUNNER_HIDDEN_PATH",
              collisionContractCode: "SYNTHETIC_RUNNER_HIDDEN_COLLISION",
            });
            cleanupOwnedTemporaryRoot(hiddenSource.temporaryRoot);
            hiddenSource = null;
          } catch {
            hiddenReady = false;
            hiddenCheck = unavailableOutcome("incomplete", "hidden_staging_failed");
          }
        }
      }
      appendRunnerEvent(store, operationalRunId, taskId, profileId, instance, {
        event_type: "hidden_staging",
        summary: hiddenReady
          ? "Hidden oracle staged after adapter teardown and workspace observation."
          : "Hidden oracle could not be staged safely.",
        status: hiddenReady ? "completed" : "failed",
      });
      if (hiddenReady) {
        const hidden = await runSyntheticCheck(
          instance.hidden_check,
          fixture.repo,
          profile,
          adapterResult?.review_findings,
          { commandRunner, maxOutputChars: limits.check_output_chars },
        );
        hiddenCheck = hidden.outcome;
        if (hidden.teardown_verified !== true) {
          preserveResources = true;
          teardown = failedOutcome("hidden_check_teardown_unverified");
        }
      }
      appendRunnerEvent(store, operationalRunId, taskId, profileId, instance, {
        event_type: "hidden_check",
        summary: hiddenCheck.passed === true ? "Hidden check passed." : "Hidden check did not pass.",
        status: eventStatus(hiddenCheck),
      });

      const summary = completedTraceSummary(
        instance,
        profile.profileFingerprint,
        adapterResult,
        workspaceObservation,
        { workerSettled, teardownVerified, traceObservation },
      );
      if (summary === null) {
        tracePolicy = unavailableOutcome("incomplete", "trace_evidence_incomplete");
      } else {
        const evaluated = evaluateSyntheticTracePolicy(instance.trace_policy, summary);
        tracePolicy = evaluated.passed ? passedOutcome() : failedOutcome(evaluated.violations);
      }

      if (!preserveResources) {
        try {
          if (fixture !== null) cleanupOwnedTemporaryRoot(fixture.temporaryRoot);
          fixture = null;
          cleanupSyntheticProfile(profile);
          cleanup = passedOutcome();
        } catch {
          cleanup = failedOutcome("runner_cleanup_failed");
        }
      }
    }

    if (preserveResources) {
      cleanup = unavailableOutcome("not_run", "unverified_teardown_preserved");
    }

    const adapterCompleted = adapterCompletedCorrectly(adapterResult, profile.profileFingerprint);
    const agentSuccess = agentReportedSuccess(adapterResult);
    const checks = verificationChecks({
      adapterCompleted,
      agentSuccess,
      visibleCheck,
      hiddenCheck,
      workspacePolicy,
      tracePolicy,
      teardown,
      cleanup,
    });
    try {
      traceEvidence = finalizeOperationalTrace({
        store,
        runId: operationalRunId,
        taskId,
        profileId,
        instance,
        checks,
      });
    } catch {
      traceEvidence = null;
    }
    const traceSummary = completedTraceSummary(
      instance,
      profile.profileFingerprint,
      adapterResult,
      workspaceObservation,
      { workerSettled, teardownVerified, traceObservation },
    );
    const metrics = traceMetrics(traceSummary, adapterResult);
    const hiddenSafetyFailed = syntheticHiddenSafetyFailed({
      hiddenCheck,
      workspacePolicy,
      tracePolicy,
    });
    const terminationAcceptable = adapterResult?.status === "completed"
      && ["done", "verified"].includes(adapterResult?.termination_reason);
    const evidenceComplete = adapterCompleted
      && finalManifest !== null
      && traceEvidence !== null
      && teardown.passed === true
      && cleanup.passed === true
      && ![visibleCheck, hiddenCheck, workspacePolicy, tracePolicy]
        .some((entry) => ["blocked", "not_run", "incomplete"].includes(entry.status));
    const provisional = {
      adapter_completed_correctly: adapterCompleted,
      agent_reported_success: agentSuccess,
      termination_acceptable: terminationAcceptable,
      visible_check: visibleCheck,
      hidden_check: hiddenCheck,
      workspace_policy: workspacePolicy,
      trace_policy: tracePolicy,
      teardown,
      cleanup,
      hidden_safety_failed: hiddenSafetyFailed,
      evidence_complete: evidenceComplete,
    };
    const wholeTaskSuccess = syntheticWholeTaskSuccess(provisional);
    const defectEscape = agentSuccess === true
      && visibleCheck.passed === true
      && hiddenSafetyFailed;
    const result = Object.freeze({
      profile_id: profileId,
      profile_fingerprint: profile.profileFingerprint,
      operational_run_id: operationalRunId,
      execution_status: adapterResult?.status === "blocked_external_state"
        ? "blocked_external_state"
        : adapterResult?.status === "completed"
          ? "completed"
          : teardownVerified
            ? "failed"
            : "incomplete",
      termination_reason: SAFE_EXECUTION_TERMINATIONS.has(adapterResult?.termination_reason)
        ? adapterResult.termination_reason
        : adapterResult?.status === "blocked_external_state"
          ? "blocked_external_state"
          : "verification_failed",
      reason: adapterResult?.reason === null || adapterResult?.reason === undefined
        ? null
        : normalizeReason(adapterResult.reason),
      cli_version: typeof adapterResult?.cli_version === "string"
        ? boundedSingleLine(adapterResult.cli_version, "cli_version", { max: 200 })
        : null,
      adapter_completed_correctly: adapterCompleted,
      agent_reported_success: agentSuccess,
      termination_acceptable: terminationAcceptable,
      visible_check: visibleCheck,
      hidden_check: hiddenCheck,
      workspace_policy: workspacePolicy,
      trace_policy: tracePolicy,
      teardown,
      cleanup,
      hidden_safety_failed: hiddenSafetyFailed,
      evidence_complete: evidenceComplete,
      whole_task_success: wholeTaskSuccess,
      defect_escape_v2: defectEscape,
      fingerprints: Object.freeze({
        adapter: assertFingerprint(adapterResult?.adapter_fingerprint ?? null, "adapter fingerprint", { nullable: true }),
        initial_workspace: initialManifest?.fingerprint ?? null,
        final_workspace: finalManifest?.fingerprint ?? null,
        trace: traceEvidence?.fingerprint ?? null,
      }),
      metrics,
      operational_trace_id: traceEvidence?.id ?? null,
    });
    if (preserveResources) {
      onResourcesPreserved(Object.freeze({
        reason: teardown.violations[0] ?? "unverified_teardown_preserved",
        fixture_root: fixture?.temporaryRoot ?? null,
        repo: fixture?.repo ?? null,
        profile_root: profile.root,
      }));
    }
    return Object.freeze({ result, binding });
  } finally {
    if (!preserveResources) {
      if (hiddenSource !== null) {
        try { cleanupOwnedTemporaryRoot(hiddenSource.temporaryRoot); } catch { /* cleanup outcome above remains authoritative */ }
      }
      if (publicSource !== null) {
        try { cleanupOwnedTemporaryRoot(publicSource.temporaryRoot); } catch { /* cleanup outcome above remains authoritative */ }
      }
      if (fixture !== null) {
        try { cleanupOwnedTemporaryRoot(fixture.temporaryRoot); } catch { /* cleanup outcome above remains authoritative */ }
      }
      if (fs.existsSync(profile.root)) {
        try { cleanupSyntheticProfile(profile); } catch { /* cleanup outcome above remains authoritative */ }
      }
    }
  }
}

export function counterbalancedProfileOrder({
  seed,
  familyId,
  repetition,
  baselineProfileId,
  candidateProfileId,
} = {}) {
  assertSafeId(seed, "seed");
  assertSafeId(familyId, "familyId");
  expect(Number.isSafeInteger(repetition) && repetition >= 1 && repetition <= 5, "SYNTHETIC_COUNTERBALANCE", "repetition is invalid");
  assertSafeId(baselineProfileId, "baselineProfileId");
  assertSafeId(candidateProfileId, "candidateProfileId");
  expect(baselineProfileId !== candidateProfileId, "SYNTHETIC_COUNTERBALANCE", "paired profiles must differ");
  const digest = createHash("sha256")
    .update(seed, "utf8")
    .update("\0")
    .update(familyId, "utf8")
    .update("\0")
    .update(String(repetition), "utf8")
    .digest();
  return Object.freeze(
    digest[0] % 2 === 0
      ? [baselineProfileId, candidateProfileId]
      : [candidateProfileId, baselineProfileId],
  );
}

export function syntheticPairBindingMismatchReasons(left, right) {
  const fields = [
    "public_fixture_fingerprint",
    "hidden_fixture_fingerprint",
    "effective_public_input_fingerprint",
    "initial_public_manifest_fingerprint",
    "model_fingerprint",
    "timeout_ms",
    "limits_fingerprint",
    "adapter_protocol_version",
  ];
  return Object.freeze(fields
    .filter((field) => left?.[field] !== right?.[field])
    .map((field) => `${field.replaceAll("_", "-")}-mismatch`));
}

export function syntheticPairAttemptMismatchReasons(left, right) {
  return Object.freeze(uniqueSorted([
    ...syntheticPairBindingMismatchReasons(left?.binding, right?.binding),
    ...(left?.result?.fingerprints?.adapter !== right?.result?.fingerprints?.adapter
      ? ["adapter-fingerprint-mismatch"]
      : []),
  ]));
}

export function validateSyntheticPairSet(pairs, expectedPairIds) {
  expect(Array.isArray(pairs) && Array.isArray(expectedPairIds), "SYNTHETIC_PAIR_SET", "pair lists are required");
  const actual = pairs.map((pair) => pair.pair_id);
  const duplicates = actual.filter((entry, index) => actual.indexOf(entry) !== index);
  const missing = expectedPairIds.filter((entry) => !actual.includes(entry));
  const unexpected = actual.filter((entry) => !expectedPairIds.includes(entry));
  return Object.freeze({
    passed: duplicates.length === 0 && missing.length === 0 && unexpected.length === 0,
    violations: Object.freeze(uniqueSorted([
      ...(duplicates.length > 0 ? ["duplicate-pair"] : []),
      ...(missing.length > 0 ? ["missing-pair"] : []),
      ...(unexpected.length > 0 ? ["unexpected-pair"] : []),
    ])),
  });
}

function pairIdentity(instance) {
  return Object.freeze({
    family_id: instance.family_id,
    category: instance.category,
    risk: instance.risk,
    generated_fixture_fingerprint: instance.generated_fixture_fingerprint,
    repetition: instance.repetition,
  });
}

function pairIdFor(identity) {
  return fingerprint({
    schema: "synthetic-pair-identity-v1",
    family_id: identity.family_id,
    generated_fixture_fingerprint: identity.generated_fixture_fingerprint,
    repetition: identity.repetition,
  });
}

export async function runSyntheticPair({
  sourceRoot,
  contracts,
  templateSet,
  instance,
  reportRunId,
  baselineProfileId,
  candidateProfileId,
  model,
  provider = null,
  variant = null,
  timeoutMs = DEFAULT_SYNTHETIC_AGENT_TIMEOUT_MS,
  limits = {},
  adapterUrl = OFFICIAL_ADAPTER_URL,
  adapterInvoker = runAdapterModule,
  commandRunner = runManagedCommand,
  clock = () => new Date(),
  idFactory = (kind) => `${kind}-${randomUUID()}`,
} = {}) {
  assertSafeId(reportRunId, "reportRunId");
  replaySyntheticInstance({ contracts, templateSet, manifest: instance });
  const identity = pairIdentity(instance);
  const pairId = pairIdFor(identity);
  const order = counterbalancedProfileOrder({
    seed: instance.seed,
    familyId: instance.family_id,
    repetition: instance.repetition,
    baselineProfileId,
    candidateProfileId,
  });
  const attempts = new Map();
  for (const profileId of order) {
    const operationalRunId = `op-${profileId}-${createHash("sha256")
      .update(reportRunId)
      .update("\0")
      .update(pairId)
      .update("\0")
      .update(profileId)
      .digest("hex")
      .slice(0, 24)}`;
    attempts.set(profileId, await runSyntheticProfileAttempt({
      sourceRoot,
      instance,
      profileId,
      operationalRunId,
      model,
      provider,
      variant,
      timeoutMs,
      limits,
      adapterUrl,
      adapterInvoker,
      commandRunner,
      clock,
      idFactory,
    }));
  }
  const baseline = attempts.get(baselineProfileId);
  const candidate = attempts.get(candidateProfileId);
  const bindingMismatches = syntheticPairAttemptMismatchReasons(baseline, candidate);
  const incompleteReasons = uniqueSorted([
    ...(bindingMismatches.length > 0 ? ["binding-mismatch"] : []),
    ...(!baseline.result.evidence_complete ? ["baseline-evidence-incomplete"] : []),
    ...(!candidate.result.evidence_complete ? ["candidate-evidence-incomplete"] : []),
  ]);
  return Object.freeze({
    pair: Object.freeze({
      pair_id: pairId,
      identity,
      order,
      binding: baseline.binding,
      complete: incompleteReasons.length === 0,
      incomplete_reasons: Object.freeze(incompleteReasons),
      baseline: baseline.result,
      candidate: candidate.result,
    }),
    profile_fingerprints: Object.freeze({
      baseline: baseline.result.profile_fingerprint,
      candidate: candidate.result.profile_fingerprint,
    }),
  });
}

function executionAvailability(pairs) {
  const results = pairs.flatMap((pair) => [pair.baseline, pair.candidate]);
  const reasons = new Set(results.map((entry) => entry.reason).filter(Boolean));
  const anyCompleted = results.some((entry) => entry.adapter_completed_correctly);
  return Object.freeze({
    opencode: reasons.has("opencode_version_unsupported")
      ? "unsupported"
      : reasons.has("opencode_not_found") && !anyCompleted
        ? "unavailable"
        : anyCompleted
          ? "available"
          : "unknown",
    model: anyCompleted ? "available" : reasons.has("opencode_not_found") ? "unavailable" : "unknown",
    cost: "unavailable",
  });
}

export async function runSyntheticPairedBenchmark({
  sourceRoot,
  suiteId,
  seed,
  baselineProfileId = "plain",
  candidateProfileId = "instrumented",
  model,
  provider = null,
  variant = null,
  timeoutMs = DEFAULT_SYNTHETIC_AGENT_TIMEOUT_MS,
  limits: limitOverrides = {},
  adapterUrl = OFFICIAL_ADAPTER_URL,
  adapterInvoker = runAdapterModule,
  commandRunner = runManagedCommand,
  clock = () => new Date(),
  idFactory = (kind) => `${kind}-${randomUUID()}`,
} = {}) {
  const root = fs.realpathSync.native(path.resolve(sourceRoot));
  const contracts = loadSyntheticContracts(root);
  const templateSet = loadSyntheticTemplateSet(root, contracts);
  const suite = contracts.suites.find((entry) => entry.id === suiteId);
  expect(suite !== undefined, "SYNTHETIC_RUNNER_SUITE", `unknown suite ${suiteId}`);
  expect(suite.profile_ids.includes(baselineProfileId), "SYNTHETIC_RUNNER_PROFILE", "baseline profile is not in the suite");
  expect(suite.profile_ids.includes(candidateProfileId), "SYNTHETIC_RUNNER_PROFILE", "candidate profile is not in the suite");
  expect(baselineProfileId !== candidateProfileId, "SYNTHETIC_RUNNER_PROFILE", "paired profiles must differ");
  assertSafeId(seed, "seed");
  boundedSingleLine(model, "model");
  const limits = normalizeRunnerLimits(limitOverrides);
  const runId = assertSafeId(idFactory("synthetic-run"), "run_id");
  const generationId = `generation-${createHash("sha256")
    .update(seed)
    .update("\0")
    .update(suite.id)
    .update("\0")
    .update(templateSet.template_set_id)
    .digest("hex")
    .slice(0, 24)}`;
  const pairs = [];
  let expectedBaselineFingerprint = null;
  let expectedCandidateFingerprint = null;
  for (const familyId of suite.family_ids) {
    for (let repetition = 1; repetition <= suite.repetitions; repetition += 1) {
      const instance = renderSyntheticInstance({
        contracts,
        templateSet,
        familyId,
        seed,
        repetition,
      });
      const executed = await runSyntheticPair({
        sourceRoot: root,
        contracts,
        templateSet,
        instance,
        reportRunId: runId,
        baselineProfileId,
        candidateProfileId,
        model,
        provider,
        variant,
        timeoutMs,
        limits,
        adapterUrl,
        adapterInvoker,
        commandRunner,
        clock,
        idFactory,
      });
      expectedBaselineFingerprint ??= executed.profile_fingerprints.baseline;
      expectedCandidateFingerprint ??= executed.profile_fingerprints.candidate;
      expect(
        executed.profile_fingerprints.baseline === expectedBaselineFingerprint
          && executed.profile_fingerprints.candidate === expectedCandidateFingerprint,
        "SYNTHETIC_RUNNER_PROFILE_DRIFT",
        "profile evidence changed within the paired benchmark",
      );
      pairs.push(executed.pair);
    }
  }
  const expectedPairIds = suite.family_ids.flatMap((familyId) => (
    Array.from({ length: suite.repetitions }, (_, index) => {
      const instance = renderSyntheticInstance({
        contracts,
        templateSet,
        familyId,
        seed,
        repetition: index + 1,
      });
      return pairIdFor(pairIdentity(instance));
    })
  ));
  const setValidation = validateSyntheticPairSet(pairs, expectedPairIds);
  const incompleteReasons = uniqueSorted([
    ...setValidation.violations,
    ...(pairs.some((pair) => !pair.complete) ? ["pair-evidence-incomplete"] : []),
  ]);
  const createdAtValue = clock();
  const createdAt = createdAtValue instanceof Date ? createdAtValue.toISOString() : createdAtValue;
  const report = Object.freeze({
    schema_version: SYNTHETIC_RUN_REPORT_VERSION,
    report_kind: "synthetic-paired-run",
    run_id: runId,
    generation_id: generationId,
    created_at: createdAt,
    suite: Object.freeze({
      id: suite.id,
      manifest_fingerprint: contracts.fingerprints.suites,
      template_set_fingerprint: fingerprint(templateSet),
      comparison_policy_fingerprint: contracts.fingerprints.comparison_policy,
      profile_inventory_fingerprint: contracts.fingerprints.inventory,
      seed,
      repetitions: suite.repetitions,
      declared_pair_count: expectedPairIds.length,
    }),
    execution: Object.freeze({
      provider,
      model,
      variant,
      timeout_ms: timeoutMs,
      limits_fingerprint: fingerprint({
        schema: "synthetic-runner-limits-v1",
        limits,
      }),
      adapter_protocol_version: SYNTHETIC_OPENCODE_ADAPTER_VERSION,
      model_tool_availability: executionAvailability(pairs),
    }),
    profiles: Object.freeze({
      baseline: Object.freeze({
        id: baselineProfileId,
        fingerprint: expectedBaselineFingerprint,
      }),
      candidate: Object.freeze({
        id: candidateProfileId,
        fingerprint: expectedCandidateFingerprint,
      }),
    }),
    complete: incompleteReasons.length === 0,
    incomplete_reasons: Object.freeze(incompleteReasons),
    pair_count: pairs.length,
    pairs: Object.freeze(pairs),
    residual_caveats: Object.freeze([
      "context-reads-unavailable",
      "cost-unavailable",
      "permission-requests-unavailable",
    ]),
  });
  return report;
}

export function officialSyntheticAdapterConfigurationIsProfileNeutral(source = fs.readFileSync(
  fileURLToPath(OFFICIAL_ADAPTER_URL),
  "utf8",
)) {
  return ![
    /\bfamilyId\b/u,
    /\bfamily_id\b/u,
    /\binstanceId\b/u,
    /\binstance_id\b/u,
    /\bscenarioId\b/u,
    /\bscenario_id\b/u,
  ].some((pattern) => pattern.test(source));
}
