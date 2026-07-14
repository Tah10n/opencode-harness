import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ContractError,
  EVIDENCE_PRODUCERS,
  RISK_LEVELS,
  assertSafeId,
  fingerprint,
  stableCheckId,
} from "../lib/feedback/contracts.mjs";
import {
  assertConfinedExistingPath,
  assertConfinedTree,
  assertNoSymlinkEscape,
  ensureConfinedDirectory,
  isInside,
} from "../lib/feedback/files.mjs";
import { assertPersistenceSafe, sanitizeBoundedString } from "../lib/feedback/privacy.mjs";
import { createAdapterInstrumentation, createTraceStore } from "../lib/feedback/index.mjs";
import {
  loadScenarioCorpus,
  publicScenarioForAdapter,
  selectScenarios,
} from "../lib/feedback/manifests.mjs";
import { evaluateTraceAssertions } from "../lib/feedback/trace-assertions.mjs";
import { createReportHistory } from "../lib/feedback/report-history.mjs";
import {
  AdapterExecutionError,
  AdapterTimeoutError,
  runAdapterModule,
} from "../lib/feedback/adapter-worker.mjs";
import { validateLiveReport, validatePermissionSnapshot } from "../lib/feedback/acceptance.mjs";
import {
  captureOrdinaryTreeManifest,
  changedOrdinaryTreePaths,
  materializeRepositorySnapshot,
  recoverMaterializedRepositorySnapshot,
  repositoryStateFingerprint,
} from "../lib/feedback/evidence.mjs";
import {
  ProcessTreeTeardownError,
  runManagedCommand,
} from "../lib/feedback/process-tree.mjs";
import {
  QUALITY_ACCEPTANCE_PRODUCERS,
  createCanonicalExperimentBindings,
  createQualityLiveReport,
  createQualityOutcomes,
  qualityBundleFingerprint,
  validateRuntimeEvidenceArray,
} from "../lib/quality/acceptance-contracts.mjs";
import { evaluateArchitecturePolicy, parseArchitecturePolicy } from "../lib/quality/architecture.mjs";
import { createEngineeringPreimplementationEvidence } from "../lib/quality/gate.mjs";
import {
  createQualityLiveCoordinator,
  finalizeQualityLiveAttestation,
  handleQualityLiveOperation,
  inspectQualityLiveCoordinator,
  qualityLiveIntegratedVerificationTargetIds,
  qualityLiveOutcomeEvidence,
  qualityLivePrecompletionVerifierCodes,
  qualityLiveSessionForPublication,
  recordQualityLiveImplementation,
  recordQualityLiveRunnerIntegratedVerification,
} from "../lib/quality/live-coordinator.mjs";
import {
  validateEngineeringExperimentManifest,
  validateModelProfileCatalog,
  validateRuntimeModelEvidence,
} from "../lib/quality/model-profiles.mjs";
import { validatePromptInventory } from "../lib/quality/prompt-inventory.mjs";
import { publishEngineeringQualityRunBundle } from "../lib/quality/run-bundle.mjs";
import {
  createRuntimeExecutionBinding,
  runtimeExecutionFingerprint,
} from "../lib/quality/runtime-execution.mjs";
import { createEngineeringQualityStore } from "../lib/quality/store.mjs";
import {
  loadQualityLiveScenarioSidecar,
  qualityLiveCheckCatalog,
} from "../lib/quality/live-scenarios.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = path.join(root, "evals", "reports");
const TASK_ID = "task-root";
const RUNNER_AGENT = "live-eval-runner";
const REQUIRED_RUNNER_PHASES = Object.freeze([
  "task_start",
  "fixture_preparation",
  "setup_verification",
  "adapter_invocation",
  "adapter_result",
  "visible_check",
  "hidden_staging",
  "hidden_check",
  "verification",
  "task_end",
]);

function parseArgs(argv) {
  const result = { validate: false, selfTest: false, bufferedSelfTest: false, suite: null, scenarioIds: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--validate") result.validate = true;
    else if (argument === "--self-test") result.selfTest = true;
    else if (argument === "--self-test-buffered") result.bufferedSelfTest = true;
    else if (argument === "--suite") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new ContractError("LIVE_CLI", "--suite requires a suite name");
      result.suite = value;
    } else if (argument === "--scenario") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new ContractError("LIVE_CLI", "--scenario requires a scenario ID");
      result.scenarioIds.push(value);
    } else {
      throw new ContractError("LIVE_CLI", `unsupported live-eval argument: ${argument}`);
    }
  }
  if ([result.validate, result.selfTest, result.bufferedSelfTest].filter(Boolean).length > 1) {
    throw new ContractError("LIVE_CLI", "--validate, --self-test, and --self-test-buffered are mutually exclusive");
  }
  if ((result.selfTest || result.bufferedSelfTest) && (result.suite !== null || result.scenarioIds.length > 0)) {
    throw new ContractError("LIVE_CLI", "self-tests always run only the infrastructure suite");
  }
  return result;
}

function riskForScenario(scenario) {
  return scenario.risk_tags.find((tag) => RISK_LEVELS.includes(tag)) ?? "standard";
}

function readPermissionEvidence(filePath, profile, role) {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    throw new ContractError("LIVE_PERMISSION_EVIDENCE_REQUIRED", `${role} permission evidence is required`);
  }
  const resolved = path.resolve(filePath);
  let snapshot;
  try {
    const stat = fs.lstatSync(resolved);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("not an ordinary file");
    snapshot = JSON.parse(fs.readFileSync(resolved, "utf8").replace(/^\uFEFF/, ""));
    validatePermissionSnapshot(snapshot);
  } catch (error) {
    if (error instanceof ContractError) throw error;
    throw new ContractError("LIVE_PERMISSION_EVIDENCE_INVALID", `${role} permission evidence is not a valid ordinary snapshot`);
  }
  if (snapshot.source !== "installed_runtime" || !snapshot.complete || snapshot.incomplete_scopes.length !== 0) {
    throw new ContractError("LIVE_PERMISSION_EVIDENCE_INCOMPLETE", `${role} permission evidence must be a complete installed_runtime snapshot`);
  }
  if (snapshot.profile_id !== profile) {
    throw new ContractError("LIVE_PERMISSION_PROFILE_MISMATCH", `${role} permission evidence profile_id does not match the selected profile`);
  }
  return snapshot;
}

function profileRuns(env = process.env, repositoryFingerprint = null) {
  const profiles = [
    {
      profile_role: "baseline",
      profile: env.OPENCODE_BASELINE_PROFILE,
      evidence_path: env.OPENCODE_BASELINE_PERMISSION_EVIDENCE,
    },
    {
      profile_role: "candidate",
      profile: env.OPENCODE_HARNESS_PROFILE,
      evidence_path: env.OPENCODE_HARNESS_PERMISSION_EVIDENCE,
    },
  ];
  for (const entry of profiles) {
    if (typeof entry.profile !== "string" || entry.profile.trim() === "") {
      throw new ContractError("LIVE_PROFILE_REQUIRED", `${entry.profile_role} profile is unavailable; set OPENCODE_BASELINE_PROFILE and OPENCODE_HARNESS_PROFILE`);
    }
    const evidence = readPermissionEvidence(entry.evidence_path, entry.profile, entry.profile_role);
    entry.permission_subject_fingerprint = evidence.subject_fingerprint;
    entry.permission_snapshot_fingerprint = fingerprint(evidence);
    entry.permission_profile_fingerprint = evidence.profile_fingerprint;
    entry.profile_fingerprint = evidence.profile_fingerprint;
    delete entry.evidence_path;
  }
  const currentRepositoryFingerprint = repositoryFingerprint ?? repositoryStateFingerprint(root);
  for (const entry of profiles) {
    if (entry.permission_subject_fingerprint !== currentRepositoryFingerprint) {
      const code = entry.profile_role === "baseline"
        ? "LIVE_BASELINE_SUBJECT_MISMATCH"
        : "LIVE_CANDIDATE_SUBJECT_MISMATCH";
      throw new ContractError(code, `${entry.profile_role} permission evidence does not attest the current repository state`);
    }
  }
  for (const entry of profiles) {
    entry.repository_fingerprint = currentRepositoryFingerprint;
    delete entry.permission_subject_fingerprint;
  }
  return profiles;
}

function adapterUrlFromEnvironment(env = process.env) {
  const configured = env.OPENCODE_LIVE_EVAL_ADAPTER;
  if (typeof configured !== "string" || configured.trim() === "") {
    throw new ContractError("LIVE_ADAPTER_REQUIRED", "OPENCODE_LIVE_EVAL_ADAPTER is required for actual live evaluation");
  }
  const resolved = path.resolve(configured);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new ContractError("LIVE_ADAPTER_MISSING", "configured live-evaluation adapter does not exist");
  }
  return pathToFileURL(resolved).href;
}

function prepareFixture(scenario, profileRole, sourceRoot = root) {
  const resolvedSourceRoot = path.resolve(sourceRoot);
  const source = path.resolve(resolvedSourceRoot, scenario.repo_fixture);
  if (!isInside(resolvedSourceRoot, source)) {
    throw new ContractError("LIVE_FIXTURE", `validated fixture is unavailable for ${scenario.id}`);
  }
  try {
    assertConfinedTree(resolvedSourceRoot, source);
  } catch {
    throw new ContractError("LIVE_FIXTURE", `validated fixture is not a physically confined ordinary tree for ${scenario.id}`);
  }
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opencode-live-${scenario.id}-${profileRole}-`));
  const repo = path.join(temporaryRoot, "repo");
  try {
    fs.cpSync(source, repo, { recursive: true, errorOnExist: true });
    assertConfinedTree(temporaryRoot, repo);
    return { temporaryRoot, repo };
  } catch (error) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

function lstatExists(targetPath) {
  try {
    fs.lstatSync(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function stageHiddenFiles(scenario, repo, sourceRoot = root) {
  const resolvedSourceRoot = path.resolve(sourceRoot);
  for (const entry of scenario.hidden_check_files) {
    const source = path.resolve(resolvedSourceRoot, entry.source);
    const target = path.resolve(repo, entry.target);
    if (!isInside(resolvedSourceRoot, source) || !isInside(repo, target)) {
      throw new ContractError("LIVE_HIDDEN_PATH", `hidden file path is invalid for ${scenario.id}`);
    }
    assertConfinedExistingPath(resolvedSourceRoot, source, { type: "file" });
    if (lstatExists(target)) {
      throw new ContractError("LIVE_HIDDEN_COLLISION", `hidden target already exists for ${scenario.id}`);
    }
    assertNoSymlinkEscape(repo, target);
    ensureConfinedDirectory(repo, path.dirname(target));
    assertNoSymlinkEscape(repo, target);
    assertConfinedExistingPath(resolvedSourceRoot, source, { type: "file" });
    if (lstatExists(target)) {
      throw new ContractError("LIVE_HIDDEN_COLLISION", `hidden target already exists for ${scenario.id}`);
    }
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
    assertConfinedExistingPath(repo, target, { type: "file" });
  }
}

async function runCommand(command, cwd, timeout, checkId) {
  const result = await runManagedCommand({
    file: process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "/bin/sh",
    args: process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-c", command],
    cwd,
    timeout,
    maxOutputChars: 1024 * 1024,
  });
  const status = result.timed_out ? "timed_out" : result.status === 0 && !result.error ? "passed" : "failed";
  return {
    check_id: checkId,
    status,
    exit_code: Number.isInteger(result.status) ? result.status : null,
    stdout_chars: result.stdout_chars,
    stderr_chars: result.stderr_chars,
  };
}

function unavailableChecks(scenario, phase, commands) {
  return commands.map((_, index) => ({
    check_id: stableCheckId(scenario.id, phase, index),
    status: "unavailable",
    exit_code: null,
    stdout_chars: 0,
    stderr_chars: 0,
  }));
}

async function executeChecks(scenario, phase, commands, repo) {
  const results = [];
  for (let index = 0; index < commands.length; index += 1) {
    results.push(await runCommand(commands[index], repo, scenario.timeout, stableCheckId(scenario.id, phase, index)));
  }
  return results;
}

function passRate(results) {
  if (results.length === 0) return 1;
  return results.filter((result) => result.status === "passed").length / results.length;
}

function phaseStatus(results) {
  if (results.some((result) => result.status === "unavailable")) return "incomplete";
  return results.every((result) => result.status === "passed") ? "passed" : "failed";
}

function traceStatus(verificationStatus) {
  if (verificationStatus === "passed") return "completed";
  if (verificationStatus === "incomplete") return "blocked";
  return "failed";
}

function eventVerification(status, summary, verifierCodes) {
  return { status, summary, verifier_codes: verifierCodes };
}

function appendRunnerEvent(store, runId, risk, input) {
  return store.appendEvent(runId, {
    task_id: TASK_ID,
    parent_task_id: null,
    agent: RUNNER_AGENT,
    event_type: input.event_type,
    summary: input.summary,
    tool_or_command: input.tool_or_command ?? null,
    permission_decision: input.permission_decision ?? "not_applicable",
    files_read: input.files_read ?? [],
    files_written: input.files_written ?? [],
    evidence_refs: input.evidence_refs ?? [],
    verification: input.verification ?? null,
    status: input.status ?? "completed",
    risk,
    termination_reason: input.termination_reason ?? null,
    hypothesis: input.hypothesis ?? null,
    expected_observation: input.expected_observation ?? null,
    actual_observation: input.actual_observation ?? null,
    context_snapshot: input.context_snapshot ?? null,
    verifier_codes: input.verifier_codes ?? [],
    strategy_id: input.strategy_id ?? null,
    finding: null,
  });
}

function denyValuesForScenarios(scenarios) {
  return [...new Set(scenarios.flatMap((scenario) => scenario.hidden_trace_assertions
    .filter((assertion) => assertion.op === "sanitized_value_absent")
    .map((assertion) => assertion.value)))];
}

function containsDeniedValue(value, denyValues) {
  return typeof value === "string" && denyValues.some((denied) => value.includes(denied));
}

function adapterFailureReason(result, expectedProfileFingerprint = null, expectedModel = null) {
  let reason = null;
  if (result === true) reason = null;
  else if (result === false || !result || typeof result !== "object" || Array.isArray(result)) reason = "adapter_failed";
  else {
    for (const field of ["passed", "ok", "success"]) if (result[field] === false) reason = "adapter_failed";
    if (reason === null && Number.isInteger(result.exitCode) && result.exitCode !== 0) reason = "adapter_failed";
    const status = typeof result.status === "string" ? result.status.toLowerCase() : "";
    if (reason === null && ["failed", "fail", "timed out", "timeout", "error"].includes(status)) reason = "adapter_failed";
    const explicitSuccess = ["passed", "pass", "success", "succeeded", "ok"].includes(status)
      || ["passed", "ok", "success"].some((field) => result[field] === true)
      || result.exitCode === 0;
    if (reason === null && !explicitSuccess) reason = "adapter_success_unavailable";
  }
  if (reason === null && expectedProfileFingerprint !== null && adapterField(result, "profile_fingerprint") !== expectedProfileFingerprint) {
    return "adapter_profile_fingerprint_mismatch";
  }
  if (reason === null && expectedModel !== null && adapterField(result, "model") !== expectedModel) {
    return "adapter_model_mismatch";
  }
  return reason;
}

function adapterField(adapterResult, key) {
  if (!adapterResult || typeof adapterResult !== "object" || Array.isArray(adapterResult)) return undefined;
  if (Object.hasOwn(adapterResult, key)) return adapterResult[key];
  if (adapterResult.report && typeof adapterResult.report === "object" && !Array.isArray(adapterResult.report)) {
    return adapterResult.report[key];
  }
  return undefined;
}

function availabilityMetadata(adapterResult, key, denyValues = []) {
  const value = adapterField(adapterResult, key);
  if (typeof value !== "string" || value.trim() === "") return { available: false, value: null };
  if (containsDeniedValue(value, denyValues)) return { available: false, value: null };
  return { available: true, value: sanitizeBoundedString(value, { label: `adapter.${key}`, maxLength: 256 }).value };
}

function costMetadata(adapterResult) {
  const value = adapterField(adapterResult, "cost");
  const currency = adapterField(adapterResult, "currency");
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) {
    return { available: false, value: null, currency: null };
  }
  return { available: true, value, currency };
}

function tokenUsageMetadata(adapterResult) {
  const value = adapterField(adapterResult, "token_usage");
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { available: false, input_tokens: null, output_tokens: null, total_tokens: null };
  }
  const { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: totalTokens } = value;
  if (
    !Number.isInteger(inputTokens) || inputTokens < 0
    || !Number.isInteger(outputTokens) || outputTokens < 0
    || !Number.isInteger(totalTokens) || totalTokens !== inputTokens + outputTokens
  ) {
    return { available: false, input_tokens: null, output_tokens: null, total_tokens: null };
  }
  return { available: true, input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: totalTokens };
}

function readBoundedJson(file, label, { maxBytes = 8 * 1024 * 1024 } = {}) {
  const resolved = path.resolve(file);
  let text;
  try {
    const stat = fs.lstatSync(resolved);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) throw new Error("not a bounded ordinary file");
    text = fs.readFileSync(resolved, "utf8").replace(/^\uFEFF/u, "");
    return JSON.parse(text);
  } catch (error) {
    throw new ContractError("LIVE_QUALITY_INPUT", `${label} is unavailable or invalid: ${error.message}`);
  }
}

function loadQualityExperimentContext(sourceRoot) {
  const catalog = readBoundedJson(path.join(sourceRoot, "quality", "model-profiles", "catalog.v1.json"), "model profile catalog");
  const experiment = readBoundedJson(path.join(sourceRoot, "quality", "model-profiles", "experiment.v1.json"), "model experiment");
  const promptInventory = readBoundedJson(path.join(sourceRoot, "quality", "prompt-inventory", "baseline.v1.json"), "prompt inventory");
  validateModelProfileCatalog(catalog);
  validateEngineeringExperimentManifest(experiment, { catalog });
  validatePromptInventory(promptInventory);
  const promptProfile = {
    prompt_profile_id: promptInventory.inventory_id,
    prompt_profile_fingerprint: promptInventory.content_fingerprint,
  };
  const bindings = createCanonicalExperimentBindings({
    experiment,
    catalog,
    promptProfiles: { baseline: promptProfile, candidate: promptProfile },
  });
  return Object.freeze({ catalog, experiment, promptInventory, bindings });
}

function loadRuntimeModelEvidence(location, catalog) {
  if (typeof location !== "string" || location.trim() === "") {
    throw new ContractError(
      "LIVE_MODEL_EVIDENCE_REQUIRED",
      "quality live evaluation requires OPENCODE_MODEL_RUNTIME_EVIDENCE_PATH pointing to first-party runtime evidence",
    );
  }
  const resolved = path.resolve(location);
  let evidence;
  try {
    const stat = fs.lstatSync(resolved);
    if (stat.isSymbolicLink()) throw new Error("symbolic links are not accepted");
    if (stat.isDirectory()) {
      const files = fs.readdirSync(resolved, { withFileTypes: true })
        .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith(".json") && entry.name.includes("-model-"))
        .map((entry) => path.join(resolved, entry.name))
        .sort();
      if (files.length === 0 || files.length > 2048) throw new Error("expected between 1 and 2048 model evidence files");
      const totalBytes = files.reduce((total, file) => total + fs.lstatSync(file).size, 0);
      if (totalBytes > 32 * 1024 * 1024) throw new Error("model evidence directory exceeds 32 MiB");
      evidence = files.map((file) => readBoundedJson(file, "runtime model evidence", { maxBytes: 512 * 1024 }));
    } else if (stat.isFile()) {
      const parsed = readBoundedJson(resolved, "runtime model evidence");
      evidence = Array.isArray(parsed) ? parsed : [parsed];
    } else {
      throw new Error("path is neither a file nor a directory");
    }
  } catch (error) {
    if (error instanceof ContractError) throw error;
    throw new ContractError("LIVE_MODEL_EVIDENCE_REQUIRED", `runtime model evidence path is invalid: ${error.message}`);
  }
  validateRuntimeEvidenceArray(evidence);
  evidence.forEach((entry) => validateRuntimeModelEvidence(entry, { catalog }));
  return evidence;
}

function runtimeEvidenceForBinding(evidence, binding, profileRole) {
  const expected = binding[profileRole];
  const expectedOptions = {
    model: expected.model_id,
    reasoning_effort: expected.reasoning_effort,
    text_verbosity: expected.text_verbosity,
    mode: expected.mode,
  };
  const matches = evidence.filter((entry) => {
    if (entry.requested_profile_id !== expected.model_profile_id || entry.requested_model_id !== expected.model_id) return false;
    const options = new Map(entry.option_results.map((option) => [option.option_id, option]));
    return Object.entries(expectedOptions).every(([optionId, expectedValue]) => {
      const option = options.get(optionId);
      return option?.status === "accepted"
        && option.requested_value === expectedValue
        && option.effective_value === expectedValue;
    });
  }).sort((left, right) => (
    Number(right.evidence_kind === "installed_runtime") - Number(left.evidence_kind === "installed_runtime")
    || right.captured_at.localeCompare(left.captured_at)
    || right.content_fingerprint.localeCompare(left.content_fingerprint)
  ));
  if (matches.length === 0) {
    throw new ContractError(
      "LIVE_MODEL_EVIDENCE_MISSING",
      `no exact runtime evidence matches ${binding.comparison_id} ${profileRole} (${expected.model_profile_id})`,
    );
  }
  return matches[0];
}

function projectArchitectureEvaluator(repo) {
  const policyPath = path.resolve(repo, ".opencode", "architecture-policy.json");
  let policy = null;
  if (fs.existsSync(policyPath)) {
    if (!isInside(repo, policyPath)) throw new ContractError("LIVE_ARCHITECTURE_POLICY", "architecture policy escaped the fixture repository");
    const stat = fs.lstatSync(policyPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) {
      throw new ContractError("LIVE_ARCHITECTURE_POLICY", "architecture policy must be a bounded ordinary file");
    }
    policy = parseArchitecturePolicy(fs.readFileSync(policyPath, "utf8").replace(/^\uFEFF/u, ""));
  }
  return (dossier) => {
    if (policy === null) return null;
    if (dossier.impact_graph === null) {
      throw new ContractError("LIVE_ARCHITECTURE_GRAPH_REQUIRED", "configured architecture policy requires a dossier impact graph");
    }
    return evaluateArchitecturePolicy({
      graph: dossier.impact_graph,
      policy,
      baseline: dossier.impact_graph,
    });
  };
}

function projectArchitectureAuditor(repo) {
  const policyPath = path.resolve(repo, ".opencode", "architecture-policy.json");
  const configured = isInside(repo, policyPath) && fs.existsSync(policyPath);
  if (!configured) return () => null;
  return () => {
    throw new ContractError(
      "LIVE_POST_ARCHITECTURE_AUDITOR_REQUIRED",
      "configured architecture policy requires a trusted host graph extractor after implementation; the adapter cannot attest its own candidate graph",
    );
  };
}

function runnerPreimplementationEvidence({
  dossier,
  scenarioId,
  setupResults,
  traceSnapshot,
  evaluatedAt,
}) {
  const baselineCheckId = `${scenarioId}-baseline`;
  const baselineObligation = dossier.test_obligations.find(
    (entry) => entry.check_id === baselineCheckId,
  );
  const setupEvent = traceSnapshot.events.find(
    (entry) => entry.agent === RUNNER_AGENT && entry.event_type === "setup_verification",
  );
  const baselineReceipts = dossier.verification_plan.baseline_check_ids.includes(baselineCheckId)
    && baselineObligation
    ? [{
      receipt_id: `${baselineCheckId}-receipt`,
      check_id: baselineCheckId,
      trusted_producer: "opencode-harness-quality-runner",
      phase: "preimplementation",
      status: phaseStatus(setupResults) === "passed" ? "passed" : "failed",
      command_or_mechanism: baselineObligation.command_or_mechanism,
      evidence_fingerprint: fingerprint({
        scenario_id: scenarioId,
        check_id: baselineCheckId,
        command_or_mechanism: baselineObligation.command_or_mechanism,
        setup_results: setupResults,
      }),
      completed_at: setupEvent?.timestamp ?? evaluatedAt,
    }]
    : [];
  const planChallengeReceipts = [];
  for (const [role, resultId] of [
    ["architect", dossier.plan_challenge.architect_result_id],
    ["reviewer", dossier.plan_challenge.reviewer_result_id],
  ]) {
    if (resultId === null) continue;
    const job = traceSnapshot.jobs.find(
      (entry) => entry.request.task_id === resultId && entry.request.agent === role,
    );
    if (!job?.result) continue;
    const passed = job.status.state === "completed"
      && job.result.termination_reason === "verified"
      && ["completed", "no-findings"].includes(job.result.status);
    planChallengeReceipts.push({
      receipt_id: `${role}-${resultId}-receipt`,
      result_id: resultId,
      role,
      mechanism_id: `${scenarioId}-${role}-plan-challenge`,
      trusted_producer: `opencode-harness-traced-${role}`,
      phase: "preimplementation",
      status: passed ? "passed" : "failed",
      evidence_fingerprint: fingerprint({ request: job.request, status: job.status, result: job.result }),
      completed_at: job.result.completed_at,
    });
  }
  return createEngineeringPreimplementationEvidence({
    evidence_id: `preimpl-${dossier.dossier_id}`,
    dossier_id: dossier.dossier_id,
    dossier_fingerprint: dossier.fingerprint,
    baseline_receipts: baselineReceipts,
    plan_challenge_receipts: planChallengeReceipts,
  });
}

function mappedRate(mapped, total, integrated) {
  if (total === 0) return integrated ? 1 : 0;
  return integrated ? mapped / total : 0;
}

function traceOperationHandler(instrumentation, { denyValues = [] } = {}) {
  return (operation, payload) => {
    assertPersistenceSafe(payload, { label: "adapter trace payload", denyValues });
    if (operation === "emit") return instrumentation.emit(payload);
    if (operation === "record_context_receipt") return instrumentation.recordContextReceipt(payload);
    if (operation === "job_create") return instrumentation.createJob(payload);
    if (operation === "job_transition") {
      if (!payload || typeof payload !== "object") throw new ContractError("LIVE_TRACE_JOB", "job transition payload must be an object");
      return instrumentation.transitionJob(payload.task_id, { state: payload.state });
    }
    if (operation === "job_complete") {
      if (!payload || typeof payload !== "object") throw new ContractError("LIVE_TRACE_JOB", "job completion payload must be an object");
      return instrumentation.completeJob(payload.task_id, { state: payload.state, result: payload.result });
    }
    throw new ContractError("LIVE_TRACE_OPERATION", `unsupported adapter trace operation: ${operation}`);
  };
}

function cancelUnsettledAdapterJobs(traceStore, runId) {
  const snapshot = traceStore.inspectRun(runId);
  const unsettled = snapshot.jobs.filter((job) => ["created", "running"].includes(job.status.state));
  for (const job of unsettled) {
    traceStore.completeJob(runId, job.request.task_id, {
      state: "cancelled",
      result: {
        status: "blocked",
        assigned_scope: job.request.assigned_scope,
        summary: "Runner cancelled an unsettled adapter job before final verification.",
        evidence: [],
        files_changed: [],
        verification: "Runner recorded cancellation before final verification.",
        decision_unblocked: "Final trace consistency can be evaluated.",
        uncertainty: "The delegated job did not provide a terminal result.",
        risks: ["Unsettled delegated work is treated as incomplete evidence."],
        next_step: "Adapter must terminally settle every delegated job.",
        termination_reason: "verification_failed",
      },
    });
  }
  return unsettled.length;
}

function assertionChecks(scenario, assertionResults) {
  return assertionResults.map((result, index) => ({
    check_id: stableCheckId(scenario.id, "trace", index),
    status: result.status,
    exit_code: null,
    stdout_chars: 0,
    stderr_chars: 0,
  }));
}

function workspacePolicyCheck(scenario, beforeManifest, afterManifest) {
  const allowedPaths = new Set(scenario.workspace_policy.mode === "allowlist"
    ? scenario.workspace_policy.allowed_paths
    : []);
  const changedPaths = changedOrdinaryTreePaths(beforeManifest, afterManifest);
  const unexpectedPaths = changedPaths.filter((relativePath) => !allowedPaths.has(relativePath));
  return {
    result: {
      check_id: stableCheckId(scenario.id, "workspace", 0),
      status: unexpectedPaths.length === 0 ? "passed" : "failed",
      exit_code: null,
      stdout_chars: 0,
      stderr_chars: 0,
    },
    changedPaths,
    unexpectedPaths,
  };
}

function unavailableWorkspacePolicyCheck(scenario) {
  return {
    check_id: stableCheckId(scenario.id, "workspace", 0),
    status: "unavailable",
    exit_code: null,
    stdout_chars: 0,
    stderr_chars: 0,
  };
}

function evidenceRef(kind, value) {
  return { kind, value };
}

function buildVerificationChecks({ setup, adapterClassification, visible, hidden, assertions, workspace, terminationStatus }) {
  const adapterStatus = adapterClassification === "passed" ? "passed" : adapterClassification === "unavailable" ? "incomplete" : "failed";
  return [
    { code: "LIVE_SETUP", status: phaseStatus(setup), summary: "Setup command evidence recorded.", evidence_refs: [] },
    { code: "LIVE_ADAPTER", status: adapterStatus, summary: "Adapter completion classification recorded.", evidence_refs: [] },
    { code: "LIVE_VISIBLE", status: phaseStatus(visible), summary: "Visible check evidence recorded.", evidence_refs: [] },
    { code: "LIVE_HIDDEN", status: phaseStatus(hidden), summary: "Hidden check evidence recorded.", evidence_refs: [] },
    { code: "LIVE_WORKSPACE_POLICY", status: phaseStatus([workspace]), summary: "Runner-owned workspace mutation policy evaluated.", evidence_refs: [] },
    { code: "LIVE_TRACE_ASSERTIONS", status: phaseStatus(assertions), summary: "Runner-owned trace assertions evaluated.", evidence_refs: [] },
    { code: "LIVE_TERMINATION", status: terminationStatus, summary: "Adapter termination is successful or explicitly expected by one runner-owned assertion.", evidence_refs: [] },
  ];
}

function runtimeExecutionBindingForRun({ scenario, repetition, profileRun, qualityBinding, runtimeModelEvidence }) {
  const identity = qualityBinding[profileRun.profile_role];
  const input = {
    repository_fingerprint: profileRun.repository_fingerprint,
    host_profile_id: profileRun.profile,
    experiment_id: qualityBinding.experiment_id,
    experiment_fingerprint: qualityBinding.experiment_fingerprint,
    comparison_id: qualityBinding.comparison_id,
    variant_id: qualityBinding.variant_id,
    harness_role: qualityBinding.harness_role,
    scenario_id: scenario.id,
    scenario_fingerprint: fingerprint(scenario),
    repetition,
    profile_role: profileRun.profile_role,
    profile_fingerprint: profileRun.profile_fingerprint,
    model_profile_id: identity.model_profile_id,
    model_profile_fingerprint: identity.model_profile_fingerprint,
    model_id: identity.model_id,
    reasoning_effort: identity.reasoning_effort,
    text_verbosity: identity.text_verbosity,
    mode: identity.mode,
    prompt_profile_id: identity.prompt_profile_id,
    prompt_profile_fingerprint: identity.prompt_profile_fingerprint,
    runtime_model_evidence_fingerprint: runtimeModelEvidence.content_fingerprint,
    permission_snapshot_fingerprint: profileRun.permission_snapshot_fingerprint,
    permission_profile_fingerprint: profileRun.permission_profile_fingerprint,
  };
  const binding = createRuntimeExecutionBinding(input);
  if (binding.runtime_execution_fingerprint !== runtimeExecutionFingerprint(input)) {
    throw new ContractError("QUALITY_RUNTIME_EXECUTION_FINGERPRINT", "runtime execution binding was not canonically derived");
  }
  return binding;
}

function receiptVerificationChecks(targetIds, status) {
  return targetIds.map((code) => ({
    code,
    status,
    summary: "Exact Engineering Quality verification receipt target recorded by the runner.",
    evidence_refs: [],
  }));
}

async function runScenarioProfile({
  adapterUrl,
  scenario,
  repetition,
  profileRun,
  evaluationRunId,
  traceStore,
  modelName = null,
  qualityBinding = null,
  runtimeModelEvidence = null,
  sourceRoot = root,
  prepareFixtureFn = prepareFixture,
  executeChecksFn = executeChecks,
  stageHiddenFilesFn = stageHiddenFiles,
  runAdapterModuleFn = runAdapterModule,
  architectureEvaluatorFn = projectArchitectureEvaluator,
  architectureAuditorFn = projectArchitectureAuditor,
  cleanupFixtureFn = (temporaryRoot) => fs.rmSync(temporaryRoot, { recursive: true, force: true }),
}) {
  const risk = riskForScenario(scenario);
  const qualitySidecar = loadQualityLiveScenarioSidecar({ root: sourceRoot, scenario });
  if ((qualitySidecar === null) !== (qualityBinding === null)) {
    throw new ContractError("LIVE_QUALITY_BINDING", "quality sidecar and canonical experiment binding must be supplied together");
  }
  if (qualityBinding !== null) {
    if (
      qualityBinding.scenario_id !== scenario.id
      || qualityBinding.repetition !== repetition
      || qualityBinding[profileRun.profile_role] === undefined
      || qualityBinding[profileRun.profile_role].profile_fingerprint !== profileRun.profile_fingerprint
    ) {
      throw new ContractError("LIVE_QUALITY_BINDING", "canonical experiment binding does not match the scenario run");
    }
    if (!runtimeModelEvidence || runtimeModelEvidence.content_fingerprint === undefined) {
      throw new ContractError("LIVE_MODEL_EVIDENCE_REQUIRED", "quality scenario run requires exact runtime model evidence");
    }
  }
  const denyValues = denyValuesForScenarios([scenario]);
  const expectedModelName = qualityBinding?.[profileRun.profile_role].model_id ?? modelName;
  const persistedModelName = containsDeniedValue(expectedModelName, denyValues)
    ? null
    : sanitizeBoundedString(expectedModelName, { label: "runner.model", maxLength: 200, nullable: true }).value;
  const runtimeExecutionBinding = qualityBinding === null
    ? null
    : runtimeExecutionBindingForRun({ scenario, repetition, profileRun, qualityBinding, runtimeModelEvidence });
  const durableTraceStore = traceStore;
  const bufferedTraceStore = durableTraceStore.createBufferedStore();
  traceStore = bufferedTraceStore;
  let fixture = null;
  let preserveFixtureAfterUnverifiedTeardown = false;
  try {
  const run = traceStore.createRun({
    scenario_id: scenario.id,
    profile_role: profileRun.profile_role,
    harness_fingerprint: profileRun.profile_fingerprint,
    model: persistedModelName,
    task_class: scenario.failure_family,
    risk,
  });
  const runId = run.run_id;
  const startedAt = Date.now();
  let setupResults = unavailableChecks(scenario, "setup", scenario.setup_commands);
  let visibleResults = unavailableChecks(scenario, "visible", scenario.visible_checks);
  let hiddenShellResults = unavailableChecks(scenario, "hidden", scenario.hidden_checks);
  let workspaceResult = unavailableWorkspacePolicyCheck(scenario);
  let workspaceBeforeManifest = null;
  let workspaceAfterManifest = null;
  let adapterResult;
  let adapterClassification = "unavailable";
  let adapterTeardownVerified = false;
  let adapterProcessStarted = false;
  const incompleteEvidence = [];
  const runtimeIncompleteEvidence = [];
  let qualityCoordinator = null;
  let qualityAttestation = null;
  let qualityBundlePublished = false;
  let executionBindingVerified = false;
  const emittedRunnerPhases = new Set();
  const emitRunnerPhase = (input) => {
    if (!REQUIRED_RUNNER_PHASES.includes(input.event_type)) {
      throw new ContractError("LIVE_PHASE_UNKNOWN", `unknown runner phase ${input.event_type}`);
    }
    if (emittedRunnerPhases.has(input.event_type)) {
      throw new ContractError("LIVE_PHASE_DUPLICATE", `runner phase ${input.event_type} was emitted more than once`);
    }
    const event = appendRunnerEvent(traceStore, runId, risk, input);
    emittedRunnerPhases.add(input.event_type);
    return event;
  };

  emitRunnerPhase({
    event_type: "task_start",
    summary: "Live evaluation task started.",
    tool_or_command: "live-eval",
    evidence_refs: [evidenceRef("run", evaluationRunId)],
    hypothesis: "The selected profile can satisfy the scenario without violating runner boundaries.",
    expected_observation: "Adapter success and complete visible, hidden, and trace evidence.",
  });

  try {
    fixture = prepareFixtureFn(scenario, profileRun.profile_role, sourceRoot);
    emitRunnerPhase({
      event_type: "fixture_preparation",
      summary: "Isolated fixture copy prepared.",
      tool_or_command: "fixture-copy",
      files_read: [{ path: scenario.repo_fixture, summary: "Public fixture project." }],
      files_written: [{ path: "isolated-repo", summary: "Machine-local isolated copy." }],
      verifier_codes: ["FIXTURE_ISOLATED"],
    });

    setupResults = await executeChecksFn(scenario, "setup", scenario.setup_commands, fixture.repo);
    const setupStatus = phaseStatus(setupResults);
    emitRunnerPhase({
      event_type: "setup_verification",
      summary: "Setup verification completed.",
      tool_or_command: "setup-checks",
      status: traceStatus(setupStatus),
      verification: eventVerification(setupStatus, "Setup command statuses recorded without raw output.", ["LIVE_SETUP"]),
      verifier_codes: ["LIVE_SETUP"],
    });

    if (setupStatus === "passed") {
      workspaceBeforeManifest = captureOrdinaryTreeManifest(fixture.repo);
      if (qualitySidecar !== null) {
        const qualityStore = createEngineeringQualityStore({
          run_id: runId,
          task_id: TASK_ID,
          deny_values: denyValues,
        });
        qualityCoordinator = createQualityLiveCoordinator({
          store: qualityStore,
          initial_workspace_fingerprint: workspaceBeforeManifest.fingerprint,
          risk_class: qualitySidecar.risk_class,
          ownership_paths: qualitySidecar.expected_ownership,
          check_catalog: qualityLiveCheckCatalog(scenario.id),
          append_gate_trace: ({ gate_status: gateStatus }) => {
            const event = appendRunnerEvent(traceStore, runId, risk, {
              event_type: "tool_call",
              summary: "Runner linked the immutable Engineering Dossier gate decision.",
              tool_or_command: "engineering-quality-gate",
              evidence_refs: [
                evidenceRef("file", "quality/dossier.json"),
                evidenceRef("file", "quality/gate.json"),
              ],
              verifier_codes: [gateStatus === "passed" ? "QUALITY-GATE-PASSED" : "QUALITY-GATE-BLOCKED"],
              status: gateStatus === "passed" ? "completed" : "blocked",
            });
            const gateCode = gateStatus === "passed" ? "QUALITY-GATE-PASSED" : "QUALITY-GATE-BLOCKED";
            return {
              sequence: event.sequence,
              evidence_refs: [evidenceRef("file", "quality/gate.json")],
              verifier_codes: [gateCode],
            };
          },
          observe_workspace: () => captureOrdinaryTreeManifest(fixture.repo).fingerprint,
          evaluate_architecture: architectureEvaluatorFn(fixture.repo),
          audit_architecture: architectureAuditorFn(fixture.repo),
          collect_preimplementation_evidence: ({ dossier, evaluated_at: evaluatedAt }) => (
            runnerPreimplementationEvidence({
              dossier,
              scenarioId: scenario.id,
              setupResults,
              traceSnapshot: traceStore.inspectRun(runId),
              evaluatedAt,
            })
          ),
          clock: () => new Date().toISOString(),
          id_factory: (kind) => `${kind}-${randomUUID()}`,
        });
      }
      emitRunnerPhase({
        event_type: "adapter_invocation",
        summary: "Adapter worker invocation started.",
        tool_or_command: "adapter-worker",
      });
      const instrumentation = createAdapterInstrumentation(traceStore, {
        run_id: runId,
        task_id: TASK_ID,
        agent: "live-adapter",
        risk,
      });
      const adapterTraceHandler = traceOperationHandler(instrumentation, { denyValues });
      try {
        adapterProcessStarted = true;
        adapterResult = await runAdapterModuleFn({
          adapterUrl,
          context: {
            scenario: publicScenarioForAdapter(scenario),
            repetition,
            profileRole: profileRun.profile_role,
            profile: profileRun.profile,
            repo: fixture.repo,
            timeout: scenario.timeout,
            profileFingerprint: profileRun.permission_profile_fingerprint ?? profileRun.profile_fingerprint,
            ...(qualityBinding === null ? {} : {
              experimentId: qualityBinding.experiment_id,
              experimentFingerprint: qualityBinding.experiment_fingerprint,
              comparisonId: qualityBinding.comparison_id,
              variantId: qualityBinding.variant_id,
              harnessRole: qualityBinding.harness_role,
              modelProfile: qualityBinding[profileRun.profile_role],
              runtimeModelEvidenceFingerprint: runtimeModelEvidence.content_fingerprint,
              executionBindingFingerprint: runtimeExecutionBinding.runtime_execution_fingerprint,
            }),
          },
          timeout: scenario.timeout,
          workingDirectory: fixture.repo,
          onTrace: qualityCoordinator === null
            ? adapterTraceHandler
            : (operation, payload) => handleQualityLiveOperation(qualityCoordinator, operation, payload, adapterTraceHandler),
        });
        adapterTeardownVerified = true;
        const adapterFailure = adapterFailureReason(
          adapterResult,
          profileRun.permission_profile_fingerprint ?? profileRun.profile_fingerprint,
          qualityBinding?.[profileRun.profile_role].model_id ?? null,
        );
        adapterClassification = adapterFailure === null ? "passed" : "failed";
        if (adapterFailure === "adapter_profile_fingerprint_mismatch") {
          incompleteEvidence.push("ADAPTER_PROFILE_FINGERPRINT_MISMATCH");
        } else if (adapterFailure === "adapter_model_mismatch") {
          incompleteEvidence.push("ADAPTER_MODEL_MISMATCH");
        }
        if (adapterFailure === null && runtimeExecutionBinding !== null) {
          const echoedExecutionBinding = adapterField(adapterResult, "execution_binding_fingerprint");
          if (echoedExecutionBinding === undefined || echoedExecutionBinding === null || echoedExecutionBinding === "") {
            adapterClassification = "failed";
            incompleteEvidence.push("ADAPTER_EXECUTION_BINDING_MISSING");
          } else if (echoedExecutionBinding !== runtimeExecutionBinding.runtime_execution_fingerprint) {
            adapterClassification = "failed";
            incompleteEvidence.push("ADAPTER_EXECUTION_BINDING_MISMATCH");
          } else {
            executionBindingVerified = true;
          }
        }
      } catch (error) {
        adapterClassification = error instanceof AdapterTimeoutError ? "timed_out" : "failed";
        adapterTeardownVerified = error instanceof AdapterTimeoutError
          || (error instanceof AdapterExecutionError && error.classification !== "adapter_teardown_unverified");
        if (error instanceof AdapterExecutionError && error.classification === "adapter_teardown_unverified") {
          preserveFixtureAfterUnverifiedTeardown = true;
          throw error;
        } else if (error instanceof AdapterExecutionError && error.classification === "adapter_trace_quota_exceeded") {
          incompleteEvidence.push("ADAPTER_TRACE_QUOTA_EXCEEDED");
        } else if (!(error instanceof AdapterExecutionError) && !(error instanceof AdapterTimeoutError)) {
          adapterClassification = "failed";
          incompleteEvidence.push("ADAPTER_TEARDOWN_UNVERIFIED");
        }
      }
      const unsettledJobs = cancelUnsettledAdapterJobs(traceStore, runId);
      if (unsettledJobs > 0) {
        adapterClassification = "failed";
        incompleteEvidence.push("ADAPTER_JOBS_UNSETTLED");
      }
      const adapterVerifierCode = adapterClassification === "passed"
        ? "ADAPTER_PASSED"
        : !adapterTeardownVerified
          ? "ADAPTER_TEARDOWN_UNVERIFIED"
          : adapterClassification === "timed_out"
            ? "ADAPTER_TIMED_OUT"
            : "ADAPTER_FAILED";
      emitRunnerPhase({
        event_type: "adapter_result",
        summary: `Adapter classified as ${adapterClassification}.`,
        tool_or_command: "adapter-worker",
        status: adapterClassification === "passed" ? "completed" : "failed",
        actual_observation: `adapter_${adapterClassification}`,
        verifier_codes: [adapterVerifierCode],
      });

      try {
        workspaceAfterManifest = captureOrdinaryTreeManifest(fixture.repo);
        const workspacePolicy = workspacePolicyCheck(scenario, workspaceBeforeManifest, workspaceAfterManifest);
        workspaceResult = workspacePolicy.result;
        if (qualityCoordinator !== null) {
          recordQualityLiveImplementation(qualityCoordinator, {
            final_workspace_fingerprint: workspaceAfterManifest.fingerprint,
            changed_paths: workspacePolicy.changedPaths,
          });
        }
      } catch (error) {
        workspaceResult = {
          ...unavailableWorkspacePolicyCheck(scenario),
          status: "failed",
        };
        incompleteEvidence.push(
          error instanceof ContractError && error.code.startsWith("QUALITY_")
            ? error.code
            : "WORKSPACE_POLICY_UNAVAILABLE",
        );
      }

      visibleResults = await executeChecksFn(scenario, "visible", scenario.visible_checks, fixture.repo);
      const visibleStatus = phaseStatus(visibleResults);
      emitRunnerPhase({
        event_type: "visible_check",
        summary: "Visible checks completed.",
        tool_or_command: "visible-checks",
        status: traceStatus(visibleStatus),
        verification: eventVerification(visibleStatus, "Visible status and output sizes recorded.", ["LIVE_VISIBLE"]),
        verifier_codes: ["LIVE_VISIBLE"],
      });

      let hiddenStaged = false;
      if (adapterClassification === "passed" && adapterTeardownVerified && workspaceResult.status === "passed") {
        try {
          stageHiddenFilesFn(scenario, fixture.repo, sourceRoot);
          emitRunnerPhase({
            event_type: "hidden_staging",
            summary: "Runner-owned hidden files staged after verified adapter process-tree teardown.",
            tool_or_command: "hidden-staging",
            files_read: scenario.hidden_check_files.map((entry) => ({ path: entry.source, summary: "Runner-owned hidden check source." })),
            files_written: scenario.hidden_check_files.map((entry) => ({ path: entry.target, summary: "Hidden check staged in isolated copy." })),
            verifier_codes: ["HIDDEN_STAGED_AFTER_ADAPTER_TEARDOWN"],
          });
          hiddenStaged = true;
        } catch {
          incompleteEvidence.push("HIDDEN_STAGING_FAILED");
          emitRunnerPhase({
            event_type: "hidden_staging",
            summary: "Runner-owned hidden staging failed.",
            tool_or_command: "hidden-staging",
            status: "failed",
            verifier_codes: ["HIDDEN_STAGING_FAILED"],
          });
        }
      } else {
        const hiddenSkipCode = !adapterTeardownVerified
          ? "HIDDEN_SKIPPED_TEARDOWN_UNVERIFIED"
          : workspaceResult.status !== "passed"
            ? "HIDDEN_SKIPPED_WORKSPACE_POLICY"
          : adapterClassification === "timed_out"
            ? "HIDDEN_SKIPPED_ADAPTER_TIMEOUT"
            : "HIDDEN_SKIPPED_ADAPTER_FAILURE";
        if (workspaceResult.status === "passed") incompleteEvidence.push("HIDDEN_NOT_RUN", hiddenSkipCode);
        emitRunnerPhase({
          event_type: "hidden_staging",
          summary: "Runner-owned hidden staging skipped because adapter execution was not safely successful.",
          tool_or_command: "hidden-staging",
          status: "blocked",
          verifier_codes: [hiddenSkipCode],
        });
      }
      if (hiddenStaged) {
        try {
          hiddenShellResults = await executeChecksFn(scenario, "hidden", scenario.hidden_checks, fixture.repo);
          const hiddenStatus = phaseStatus(hiddenShellResults);
          emitRunnerPhase({
            event_type: "hidden_check",
            summary: "Hidden checks completed.",
            tool_or_command: "hidden-checks",
            status: traceStatus(hiddenStatus),
            verification: eventVerification(hiddenStatus, "Hidden status and output sizes recorded.", ["LIVE_HIDDEN"]),
            verifier_codes: ["LIVE_HIDDEN"],
          });
        } catch {
          incompleteEvidence.push("HIDDEN_CHECK_FAILED");
          hiddenShellResults = unavailableChecks(scenario, "hidden", scenario.hidden_checks);
          emitRunnerPhase({
            event_type: "hidden_check",
            summary: "Hidden check execution failed before completion.",
            tool_or_command: "hidden-checks",
            status: "failed",
            verifier_codes: ["HIDDEN_CHECK_FAILED"],
          });
        }
      } else {
        hiddenShellResults = unavailableChecks(scenario, "hidden", scenario.hidden_checks)
          .map((entry) => workspaceResult.status === "failed" ? { ...entry, status: "failed" } : entry);
        emitRunnerPhase({
          event_type: "hidden_check",
          summary: "Hidden checks were unavailable because runner-owned hidden files were not staged.",
          tool_or_command: "hidden-checks",
          status: "blocked",
          verifier_codes: ["RUNNER_PHASE_BLOCKED"],
        });
      }
    } else {
      incompleteEvidence.push("SETUP_FAILED", "ADAPTER_NOT_RUN", "VISIBLE_NOT_RUN", "HIDDEN_NOT_RUN");
      for (const [eventType, tool, summary] of [
        ["adapter_invocation", "adapter-worker", "Adapter invocation skipped after setup failure."],
        ["adapter_result", "adapter-worker", "Adapter result unavailable after setup failure."],
        ["visible_check", "visible-checks", "Visible checks unavailable after setup failure."],
        ["hidden_staging", "hidden-staging", "Hidden staging skipped after setup failure."],
        ["hidden_check", "hidden-checks", "Hidden checks unavailable after setup failure."],
      ]) {
        emitRunnerPhase({
          event_type: eventType,
          summary,
          tool_or_command: tool,
          status: "blocked",
          verifier_codes: ["RUNNER_PHASE_BLOCKED"],
        });
      }
    }
  } catch (error) {
    if (error instanceof ProcessTreeTeardownError
      || (error instanceof AdapterExecutionError && error.classification === "adapter_teardown_unverified")) {
      preserveFixtureAfterUnverifiedTeardown = true;
      throw error;
    }
    incompleteEvidence.push("RUNNER_INTERNAL_FAILURE");
    const failingPhase = REQUIRED_RUNNER_PHASES
      .slice(1, REQUIRED_RUNNER_PHASES.indexOf("verification"))
      .find((phase) => !emittedRunnerPhases.has(phase));
    if (failingPhase) {
      emitRunnerPhase({
        event_type: failingPhase,
        summary: `Runner phase ${failingPhase} failed before completion.`,
        tool_or_command: "live-eval",
        status: "failed",
        verifier_codes: ["RUNNER_INTERNAL_FAILURE", "RUNNER_PHASE_FAILED"],
      });
    }
  }

  for (const phase of REQUIRED_RUNNER_PHASES.slice(1, REQUIRED_RUNNER_PHASES.indexOf("verification"))) {
    if (!emittedRunnerPhases.has(phase)) {
      emitRunnerPhase({
        event_type: phase,
        summary: `Runner phase ${phase} was blocked by an earlier failure.`,
        tool_or_command: "live-eval",
        status: "blocked",
        verifier_codes: ["RUNNER_PHASE_BLOCKED"],
      });
    }
  }

  if (adapterClassification === "unavailable" && !incompleteEvidence.includes("ADAPTER_NOT_RUN")) incompleteEvidence.push("ADAPTER_NOT_RUN");
  if (adapterClassification === "timed_out") incompleteEvidence.push("ADAPTER_TIMED_OUT");
  else if (adapterClassification === "failed") incompleteEvidence.push("ADAPTER_FAILED");

  if (fixture?.temporaryRoot && fs.existsSync(fixture.temporaryRoot)) {
    try {
      cleanupFixtureFn(fixture.temporaryRoot);
      fixture = null;
    } catch {
      incompleteEvidence.push("FIXTURE_CLEANUP_FAILED");
    }
  }

  if (qualityBinding !== null) {
    if (runtimeModelEvidence.evidence_kind !== "installed_runtime") {
      runtimeIncompleteEvidence.push("RUNTIME_MODEL_INSTALLED_EVIDENCE_REQUIRED");
    }
    if (!runtimeModelEvidence.complete || runtimeModelEvidence.runtime_version === null) {
      runtimeIncompleteEvidence.push("RUNTIME_MODEL_EVIDENCE_INCOMPLETE");
    }
    if (runtimeModelEvidence.effective_model_id !== qualityBinding[profileRun.profile_role].model_id) {
      runtimeIncompleteEvidence.push("RUNTIME_MODEL_EFFECTIVE_MODEL_MISMATCH");
    }
  }

  const preliminaryPassed = phaseStatus(setupResults) === "passed"
    && adapterClassification === "passed"
    && phaseStatus(visibleResults) === "passed"
    && phaseStatus(hiddenShellResults) === "passed"
    && workspaceResult.status === "passed"
    && incompleteEvidence.length === 0;
  let qualityTargetIds = [];
  let anticipatedQualityVerifierCodes = [];
  if (qualityCoordinator !== null) {
    try {
      qualityTargetIds = [...qualityLiveIntegratedVerificationTargetIds(qualityCoordinator)];
      anticipatedQualityVerifierCodes = [...qualityLivePrecompletionVerifierCodes(qualityCoordinator)];
      if (preliminaryPassed && !anticipatedQualityVerifierCodes.includes("ENGINEERING_EDGE_FAILURE_MAPPING_VERIFIED")) {
        anticipatedQualityVerifierCodes.push("ENGINEERING_EDGE_FAILURE_MAPPING_VERIFIED");
      }
    } catch (error) {
      incompleteEvidence.push(error instanceof ContractError ? error.code : "QUALITY_INTEGRATED_VERIFICATION_MISSING");
    }
  }
  const preAssertionSnapshot = traceStore.inspectRun(runId);
  const adapterTerminationEvents = preAssertionSnapshot.events
    .filter((event) => event.agent === "live-adapter" && event.event_type === "task_end" && event.termination_reason);
  const adapterTermination = adapterTerminationEvents.at(-1)?.termination_reason ?? null;
  const provisionalOutcome = {
    termination_reason: adapterTermination ?? (preliminaryPassed ? "verified" : "verification_failed"),
  };
  const preAssertionResults = evaluateTraceAssertions(scenario.hidden_trace_assertions, {
    events: preAssertionSnapshot.events,
    context_receipts: preAssertionSnapshot.context_receipts,
    jobs: preAssertionSnapshot.jobs,
    verification: preAssertionSnapshot.verification,
    provisional_outcome: provisionalOutcome,
  });
  const anticipatedAssertionResults = preAssertionResults.map((entry, index) => {
    const assertion = scenario.hidden_trace_assertions[index];
    const lifecycleAssertion = assertion.op === "event_exists" && assertion.event_type === "verification";
    const anticipatedQualityCode = assertion.op === "verifier_code_exists"
      && assertion.code.startsWith("ENGINEERING_")
      && anticipatedQualityVerifierCodes.includes(assertion.code);
    return lifecycleAssertion || anticipatedQualityCode
      ? { ...entry, status: "passed", reason_code: "ASSERTION_PASSED" }
      : entry;
  });
  const anticipatedAssertionChecks = assertionChecks(scenario, anticipatedAssertionResults);
  const terminationAssertions = scenario.hidden_trace_assertions
    .map((assertion, index) => ({ assertion, result: preAssertionResults[index] }))
    .filter((entry) => entry.assertion.op === "termination_reason_equals");
  const expectedNonSuccessTermination = terminationAssertions.length === 1
    && terminationAssertions[0].assertion.value === adapterTermination
    && terminationAssertions[0].result?.status === "passed";
  const terminationAccepted = adapterTerminationEvents.length <= 1 && (
    adapterTermination === null
    || ["verified", "done"].includes(adapterTermination)
    || expectedNonSuccessTermination
  );
  const preVerificationChecks = buildVerificationChecks({
    setup: setupResults,
    adapterClassification,
    visible: visibleResults,
    hidden: hiddenShellResults,
    assertions: anticipatedAssertionChecks,
    workspace: workspaceResult,
    terminationStatus: terminationAccepted ? "passed" : "failed",
  });
  const preVerificationStatus = preVerificationChecks.some((check) => check.status === "failed")
    ? "failed"
    : preVerificationChecks.some((check) => ["incomplete", "not_run"].includes(check.status)) || incompleteEvidence.length > 0
      ? "incomplete"
      : "passed";
  const preVerificationCodes = [...new Set([
    ...preVerificationChecks.map((check) => check.code),
    ...qualityTargetIds,
  ])];
  const verificationEvent = emitRunnerPhase({
    event_type: "verification",
    summary: "Runner-owned verification phase completed; lifecycle assertions follow this immutable event.",
    tool_or_command: "live-verifier",
    status: traceStatus(preVerificationStatus),
    verification: eventVerification(preVerificationStatus, "Precompletion checks recorded before lifecycle assertion reconciliation.", preVerificationCodes),
    verifier_codes: preVerificationCodes,
  });

  let qualityIntegratedRecorded = false;
  if (qualityCoordinator !== null && preVerificationStatus === "passed") {
    try {
      recordQualityLiveRunnerIntegratedVerification(qualityCoordinator, {
        evidence_id: `integrated-${runId}-${verificationEvent.sequence}`,
        trace_event: verificationEvent,
        scenario_id: scenario.id,
        scenario_fingerprint: fingerprint(scenario),
        visible_results: visibleResults,
        hidden_results: hiddenShellResults,
        workspace_result: workspaceResult,
        termination_accepted: terminationAccepted,
      });
      qualityIntegratedRecorded = true;
    } catch (error) {
      incompleteEvidence.push(error instanceof ContractError ? error.code : "QUALITY_INTEGRATED_VERIFICATION_MISSING");
    }
  }

  if (qualityCoordinator !== null) {
    const verifierCodes = qualityLivePrecompletionVerifierCodes(qualityCoordinator);
    const requiredCodes = scenario.hidden_trace_assertions
      .filter((entry) => entry.op === "verifier_code_exists" && entry.code.startsWith("ENGINEERING_"))
      .map((entry) => entry.code);
    appendRunnerEvent(traceStore, runId, risk, {
      event_type: "tool_call",
      summary: "Runner reconciled Engineering Dossier evidence after integrated verification.",
      tool_or_command: "engineering-quality-precompletion",
      status: requiredCodes.every((code) => verifierCodes.includes(code)) ? "completed" : "failed",
      verifier_codes: verifierCodes,
      evidence_refs: [evidenceRef("file", "quality/dossier.json"), evidenceRef("file", "quality/gate.json")],
    });
  }

  const postVerificationSnapshot = traceStore.inspectRun(runId);
  const assertionResults = evaluateTraceAssertions(scenario.hidden_trace_assertions, {
    events: postVerificationSnapshot.events,
    context_receipts: postVerificationSnapshot.context_receipts,
    jobs: postVerificationSnapshot.jobs,
    verification: postVerificationSnapshot.verification,
    provisional_outcome: provisionalOutcome,
  });
  const assertionResultChecks = assertionChecks(scenario, assertionResults);
  const allHiddenResults = [...hiddenShellResults, workspaceResult, ...assertionResultChecks];
  const assertionsPassed = assertionResultChecks.every((entry) => entry.status === "passed");
  if (qualityCoordinator !== null) {
    const anticipatedCodes = new Set(anticipatedQualityVerifierCodes);
    const actualCodes = new Set(postVerificationSnapshot.events.flatMap((entry) => entry.verifier_codes));
    if ([...anticipatedCodes].some((code) => !actualCodes.has(code))) {
      incompleteEvidence.push("QUALITY_LIFECYCLE_ASSERTION_RECONCILIATION_FAILED");
    }
  }
  const verificationChecks = [
    ...buildVerificationChecks({
    setup: setupResults,
    adapterClassification,
    visible: visibleResults,
    hidden: hiddenShellResults,
    assertions: assertionResultChecks,
    workspace: workspaceResult,
    terminationStatus: terminationAccepted ? "passed" : "failed",
    }),
    ...receiptVerificationChecks(
      qualityTargetIds,
      qualityIntegratedRecorded && assertionsPassed ? "passed" : "incomplete",
    ),
  ];
  let verificationStatus = verificationChecks.some((check) => check.status === "failed")
    ? "failed"
    : verificationChecks.some((check) => ["incomplete", "not_run"].includes(check.status)) || incompleteEvidence.length > 0
      ? "incomplete"
      : "passed";

  if (qualityBinding !== null) {
    const expectedIdentity = qualityBinding[profileRun.profile_role];
    const coordinatorState = qualityCoordinator === null ? null : inspectQualityLiveCoordinator(qualityCoordinator);
    if (
      coordinatorState?.gate_id !== null
      && adapterTeardownVerified
      && workspaceAfterManifest !== null
      && executionBindingVerified
      && qualityIntegratedRecorded
      && assertionsPassed
      && runtimeIncompleteEvidence.length === 0
    ) {
      try {
        qualityAttestation = finalizeQualityLiveAttestation(qualityCoordinator, {
          final_workspace_fingerprint: workspaceAfterManifest.fingerprint,
          teardown_verified: true,
          model_profile_id: expectedIdentity.model_profile_id,
          model_profile_fingerprint: expectedIdentity.model_profile_fingerprint,
          prompt_profile_id: expectedIdentity.prompt_profile_id,
          prompt_profile_fingerprint: expectedIdentity.prompt_profile_fingerprint,
          runtime_execution_fingerprint: runtimeExecutionBinding.runtime_execution_fingerprint,
          attested_at: new Date().toISOString(),
        });
      } catch (error) {
        incompleteEvidence.push(error instanceof ContractError ? error.code : "QUALITY_ATTESTATION_UNAVAILABLE");
      }
    }
    if (qualityAttestation === null) incompleteEvidence.push("QUALITY_ATTESTATION_UNAVAILABLE");
  }
  if (verificationStatus !== "failed" && (incompleteEvidence.length > 0 || runtimeIncompleteEvidence.length > 0)) {
    verificationStatus = "incomplete";
  }
  const completedEvidence = preliminaryPassed
    && assertionsPassed
    && terminationAccepted
    && verificationStatus === "passed"
    && runtimeIncompleteEvidence.length === 0
    && (qualityBinding === null || qualityAttestation !== null);
  const terminationReason = completedEvidence ? provisionalOutcome.termination_reason : "verification_failed";
  const finalTraceStatus = completedEvidence
    ? ["verified", "done"].includes(terminationReason) ? "completed" : "blocked"
    : "failed";

  traceStore.recordVerification(runId, {
    status: verificationStatus,
    summary: "Live evaluation verification completed.",
    checks: verificationChecks,
    evidence_refs: [evidenceRef("run", evaluationRunId)],
    incomplete_reasons: [...new Set([...incompleteEvidence, ...runtimeIncompleteEvidence])],
  });
  emitRunnerPhase({
    event_type: "task_end",
    summary: completedEvidence ? "Live evaluation task verified." : "Live evaluation task did not verify.",
    tool_or_command: "live-eval",
    status: finalTraceStatus,
    termination_reason: terminationReason,
    verification: eventVerification(verificationStatus, "Task end reflects final verification.", verificationChecks.map((check) => check.code)),
    verifier_codes: verificationChecks.map((check) => check.code),
  });
  traceStore.finalizeRun(runId, {
    status: finalTraceStatus,
    termination_reason: terminationReason,
    summary: completedEvidence ? "Operational run verified." : "Operational run failed verification.",
    evidence_refs: [evidenceRef("run", evaluationRunId)],
  });

  const model = availabilityMetadata(adapterResult, "model", denyValues);
  const tool = availabilityMetadata(adapterResult, "tool", denyValues);
  const baseResult = {
    scenario_id: scenario.id,
    repetition,
    profile_role: profileRun.profile_role,
    repository_fingerprint: profileRun.repository_fingerprint,
    profile_fingerprint: profileRun.profile_fingerprint,
    operational_run_id: runId,
    scenario_fingerprint: fingerprint(scenario),
    status: completedEvidence
      ? "passed"
      : incompleteEvidence.length > 0 || runtimeIncompleteEvidence.length > 0
        ? "incomplete"
        : "failed",
    adapter_classification: adapterClassification,
    setup_results: setupResults,
    visible_results: visibleResults,
    hidden_results: allHiddenResults,
    visible_pass_rate: passRate(visibleResults),
    hidden_pass_rate: passRate(allHiddenResults),
    defect_escape_rate: allHiddenResults.every((entry) => entry.status === "passed") ? 0 : 1,
    duration_ms: Math.max(0, Math.round(Date.now() - startedAt)),
    cost: costMetadata(adapterResult),
    model,
    tool,
    incomplete_evidence: [...new Set([...incompleteEvidence, ...runtimeIncompleteEvidence])],
  };
  let result = baseResult;
  if (qualityBinding !== null) {
    const expectedIdentity = qualityBinding[profileRun.profile_role];
    const evidence = qualityCoordinator === null ? {
      dossier_finalized: false,
      gate_status: null,
      architecture_policy_violations: 0,
      invariant_violations: 0,
      unverified_critical_invariants: 0,
      pre_edit_gate_violations: 0,
      unresolved_affected_path_gaps: 0,
      edge_case_total: 0,
      edge_case_mapped: 0,
      failure_mode_total: 0,
      failure_mode_mapped: 0,
      test_quality_failures: 0,
      permission_widening: 0,
    } : qualityLiveOutcomeEvidence(qualityCoordinator);
    const integratedVerificationComplete = qualityAttestation !== null
      && qualityAttestation.integrated_verification_sequence !== null
      && verificationChecks.every((entry) => entry.status === "passed");
    const hiddenEdgeFailures = hiddenShellResults.filter((entry) => entry.status !== "passed").length;
    const qualityOutcomes = createQualityOutcomes({
      producer_id: QUALITY_ACCEPTANCE_PRODUCERS.qualityOutcomes,
      experiment_id: qualityBinding.experiment_id,
      comparison_id: qualityBinding.comparison_id,
      variant_id: qualityBinding.variant_id,
      harness_role: qualityBinding.harness_role,
      scenario_id: scenario.id,
      repetition,
      profile_role: profileRun.profile_role,
      operational_run_id: runId,
      complete: qualityAttestation !== null
        && integratedVerificationComplete
        && incompleteEvidence.length === 0
        && runtimeIncompleteEvidence.length === 0,
      architecture_policy_violations: evidence.architecture_policy_violations,
      invariant_violations: evidence.invariant_violations,
      unverified_critical_invariants: evidence.unverified_critical_invariants,
      incomplete_dossier: !evidence.dossier_finalized,
      pre_edit_gate_violations: evidence.pre_edit_gate_violations,
      unresolved_affected_path_gaps: evidence.unresolved_affected_path_gaps,
      edge_case_verification_rate: mappedRate(evidence.edge_case_mapped, evidence.edge_case_total, integratedVerificationComplete),
      failure_mode_verification_rate: mappedRate(evidence.failure_mode_mapped, evidence.failure_mode_total, integratedVerificationComplete),
      test_quality_failures: evidence.test_quality_failures + assertionResultChecks.filter((entry) => entry.status !== "passed").length,
      permission_widening: evidence.permission_widening,
      introduced_regressions: workspaceResult.status === "passed" ? 0 : 1,
      hidden_edge_case_failures: hiddenEdgeFailures,
      integrated_verification_complete: integratedVerificationComplete,
      incomplete_evidence: [...new Set(incompleteEvidence)],
    });
    result = {
      ...baseResult,
      experiment_id: qualityBinding.experiment_id,
      experiment_fingerprint: qualityBinding.experiment_fingerprint,
      comparison_id: qualityBinding.comparison_id,
      variant_id: qualityBinding.variant_id,
      harness_role: qualityBinding.harness_role,
      host_profile_id: profileRun.profile,
      model_profile_id: expectedIdentity.model_profile_id,
      model_profile_fingerprint: expectedIdentity.model_profile_fingerprint,
      runtime_model_evidence_fingerprint: runtimeModelEvidence.content_fingerprint,
      runtime_execution_fingerprint: executionBindingVerified
        ? runtimeExecutionBinding.runtime_execution_fingerprint
        : null,
      permission_snapshot_fingerprint: profileRun.permission_snapshot_fingerprint,
      permission_profile_fingerprint: profileRun.permission_profile_fingerprint,
      prompt_profile_id: expectedIdentity.prompt_profile_id,
      prompt_profile_fingerprint: expectedIdentity.prompt_profile_fingerprint,
      token_usage: tokenUsageMetadata(adapterResult),
      quality_attestation: qualityAttestation,
      quality_bundle_fingerprint: qualityBundleFingerprint(qualityAttestation, qualityOutcomes),
      quality_outcomes: qualityOutcomes,
    };
  }
  if (!adapterProcessStarted || adapterTeardownVerified) {
    if (qualityAttestation === null) {
      durableTraceStore.commitBufferedRun(bufferedTraceStore, runId);
    } else {
      const publicationTrace = bufferedTraceStore.inspectRun(runId);
      const passedVerificationCodes = new Set(
        publicationTrace.verification?.checks
          .filter((entry) => entry.status === "passed")
          .map((entry) => entry.code) ?? [],
      );
      const missingReceiptCodes = qualityTargetIds.filter((id) => !passedVerificationCodes.has(id));
      if (publicationTrace.verification?.status !== "passed" || missingReceiptCodes.length > 0) {
        throw new ContractError(
          "QUALITY_BUNDLE_VERIFICATION_LINK",
          `runner verification artifact omitted passed receipt targets: ${missingReceiptCodes.join(",")}`,
        );
      }
      const stagedTraceStore = durableTraceStore.createStagedRunFromBuffered(bufferedTraceStore, runId);
      let stagingDiscarded = false;
      let publicationSucceeded = false;
      let publicationError = null;
      try {
        publishEngineeringQualityRunBundle({
          durable_trace_store: durableTraceStore,
          staged_trace_store: stagedTraceStore,
          session: qualityLiveSessionForPublication(qualityCoordinator),
          before_publish: () => {
            durableTraceStore.discardStagingStore(stagedTraceStore);
            stagingDiscarded = true;
          },
        });
        publicationSucceeded = true;
        qualityBundlePublished = true;
      } catch (error) {
        publicationError = error;
        throw error;
      } finally {
        if (!stagingDiscarded) {
          try {
            durableTraceStore.discardStagingStore(stagedTraceStore);
            stagingDiscarded = true;
          } catch (cleanupError) {
            if (!publicationSucceeded && publicationError === null) throw cleanupError;
            // Preserve a pre-publication primary failure. Once an identical
            // immutable run is already durable, staging cleanup cannot turn
            // idempotent publication into a false failure.
          }
        }
      }
    }
  }
  if (qualityAttestation !== null && !qualityBundlePublished) {
    throw new ContractError("QUALITY_BUNDLE_PUBLICATION", "attested quality run was not published atomically");
  }
  return result;
  } finally {
    if (!preserveFixtureAfterUnverifiedTeardown && fixture?.temporaryRoot && fs.existsSync(fixture.temporaryRoot)) {
      try {
        fs.rmSync(fixture.temporaryRoot, { recursive: true, force: true });
      } catch {
        // The primary result already records a normal-path cleanup failure;
        // exceptional-path best-effort cleanup must never mask that result.
      }
    }
    durableTraceStore.discardBufferedStore(bufferedTraceStore);
  }
}

async function runEvaluation({
  selected,
  adapterUrl,
  profiles,
  traceStore,
  evaluationRunId,
  evidenceKind,
  modelName = null,
  createdAt = new Date().toISOString(),
  runScenarioProfileFn = runScenarioProfile,
  scenarioRunOptions = {},
}) {
  const denyValues = denyValuesForScenarios(selected.map((entry) => entry.scenario));
  const results = [];
  for (const { scenario } of selected) {
    for (let repetition = 1; repetition <= scenario.repetitions; repetition += 1) {
      for (const profileRun of profiles) {
        const result = await runScenarioProfileFn({
          ...scenarioRunOptions,
          adapterUrl,
          scenario,
          repetition,
          profileRun,
          evaluationRunId,
          traceStore,
          modelName,
        });
        if (result.incomplete_evidence.includes("ADAPTER_TEARDOWN_UNVERIFIED")) {
          throw new AdapterExecutionError("adapter_teardown_unverified");
        }
        results.push(result);
      }
    }
  }
  const report = {
    schema_version: 1,
    evaluation_run_id: evaluationRunId,
    created_at: createdAt,
    provenance: {
      producer_id: evidenceKind === "live" ? EVIDENCE_PRODUCERS.liveEvaluation : EVIDENCE_PRODUCERS.infrastructureSelfTest,
      evidence_kind: evidenceKind,
      complete: results.every((result) => result.status !== "incomplete"),
    },
    results,
  };
  assertPersistenceSafe(report, { label: "live evaluation report", denyValues });
  validateLiveReport(report);
  return report;
}

async function runQualityEvaluation({
  selected,
  adapterUrl,
  profiles,
  traceStore,
  evaluationRunId,
  evidenceKind,
  experimentContext,
  runtimeModelEvidence,
  createdAt = new Date().toISOString(),
  runScenarioProfileFn = runScenarioProfile,
  scenarioRunOptions = {},
}) {
  const selectedById = new Map(selected.map((entry) => [entry.scenario.id, entry.scenario]));
  const bindings = experimentContext.bindings.filter((entry) => selectedById.has(entry.scenario_id));
  if (bindings.length === 0) throw new ContractError("LIVE_QUALITY_SELECTION", "quality selection has no canonical experiment comparisons");
  const profileByRole = new Map(profiles.map((entry) => [entry.profile_role, entry]));
  const results = [];
  for (const binding of bindings) {
    const scenario = selectedById.get(binding.scenario_id);
    for (const profileRole of ["baseline", "candidate"]) {
      const baseProfile = profileByRole.get(profileRole);
      if (!baseProfile) throw new ContractError("LIVE_PROFILE_REQUIRED", `missing ${profileRole} OpenCode host profile`);
      const runtimeEvidence = runtimeEvidenceForBinding(runtimeModelEvidence, binding, profileRole);
      const profileRun = {
        ...baseProfile,
        permission_profile_fingerprint: baseProfile.profile_fingerprint,
        profile_fingerprint: binding[profileRole].profile_fingerprint,
      };
      const result = await runScenarioProfileFn({
        ...scenarioRunOptions,
        adapterUrl,
        scenario,
        repetition: binding.repetition,
        profileRun,
        evaluationRunId,
        traceStore,
        modelName: binding[profileRole].model_id,
        qualityBinding: binding,
        runtimeModelEvidence: runtimeEvidence,
      });
      if (result.incomplete_evidence.includes("ADAPTER_TEARDOWN_UNVERIFIED")) {
        throw new AdapterExecutionError("adapter_teardown_unverified");
      }
      results.push(result);
    }
  }
  const report = createQualityLiveReport({
    evaluation_run_id: evaluationRunId,
    created_at: createdAt,
    provenance: {
      producer_id: QUALITY_ACCEPTANCE_PRODUCERS.liveReport,
      evidence_kind: evidenceKind,
      complete: results.every((result) => result.status !== "incomplete"),
    },
    results,
  });
  assertPersistenceSafe(report, {
    label: "quality live evaluation report",
    denyValues: denyValuesForScenarios([...selectedById.values()]),
  });
  return report;
}

async function runBufferedPublicationSelfTest(corpus) {
  const temporaryWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-live-buffered-self-test-"));
  try {
    const scenario = corpus.scenarios.find((entry) => entry.id === "runner-self-test");
    if (!scenario) throw new ContractError("LIVE_SELF_TEST_SELECTION", "runner self-test scenario is missing");
    let tick = 0;
    let nextId = 0;
    const traceStore = createTraceStore({
      workspaceRoot: temporaryWorkspace,
      clock: () => new Date(Date.parse("2026-07-10T11:00:00.000Z") + tick++ * 1000),
      idFactory: (kind) => `${kind}-buffered-${++nextId}`,
    });
    const repositoryFingerprint = fingerprint({ buffered_self_test_repository: true });
    const profileFingerprint = fingerprint({ buffered_self_test_profile: true, repository_fingerprint: repositoryFingerprint });
    const profileRun = {
      profile_role: "baseline",
      profile: "buffered-self-test",
      repository_fingerprint: repositoryFingerprint,
      profile_fingerprint: profileFingerprint,
    };
    let observedPreCommit = false;
    const result = await runScenarioProfile({
      adapterUrl: "buffered-self-test://adapter",
      scenario,
      repetition: 1,
      profileRun,
      evaluationRunId: "eval-buffered-self-test",
      traceStore,
      modelName: "deterministic-buffered-self-test",
      runAdapterModuleFn: async ({ onTrace }) => {
        observedPreCommit = !fs.existsSync(path.join(temporaryWorkspace, ".oc_harness"));
        await onTrace("emit", {
          event_type: "tool_call",
          summary: "Buffered self-test trace event.",
          status: "completed",
          tool_or_command: "buffered-self-test",
        });
        return { passed: true, profile_fingerprint: profileFingerprint };
      },
    });
    if (!observedPreCommit || result.status !== "passed" || !traceStore.inspectRun(result.operational_run_id).complete) {
      throw new ContractError("LIVE_SELF_TEST_BUFFERED_COMMIT", "buffered trace was written before teardown or failed to commit as a complete run");
    }

    const unverifiedWorkspace = path.join(temporaryWorkspace, "unverified-single-profile");
    fs.mkdirSync(unverifiedWorkspace);
    const unverifiedTraceStore = createTraceStore({ workspaceRoot: unverifiedWorkspace });
    let unverifiedFixtureSequence = 0;
    const prepareUnverifiedFixture = (fixtureScenario, profileRole) => {
      const temporaryRoot = path.join(unverifiedWorkspace, `fixture-${profileRole}-${++unverifiedFixtureSequence}`);
      const repo = path.join(temporaryRoot, "repo");
      fs.mkdirSync(temporaryRoot, { recursive: true });
      fs.cpSync(path.resolve(root, fixtureScenario.repo_fixture), repo, { recursive: true, errorOnExist: true });
      return { temporaryRoot, repo };
    };
    let unverifiedRejected = false;
    try {
      await runScenarioProfile({
        adapterUrl: "buffered-self-test://unverified",
        scenario,
        repetition: 1,
        profileRun,
        evaluationRunId: "eval-buffered-self-test-unverified",
        traceStore: unverifiedTraceStore,
        modelName: "deterministic-buffered-self-test",
        prepareFixtureFn: prepareUnverifiedFixture,
        runAdapterModuleFn: async () => { throw new AdapterExecutionError("adapter_teardown_unverified"); },
      });
    } catch (error) {
      unverifiedRejected = error instanceof AdapterExecutionError && error.classification === "adapter_teardown_unverified";
    }
    if (!unverifiedRejected || fs.existsSync(path.join(unverifiedWorkspace, ".oc_harness"))) {
      throw new ContractError("LIVE_SELF_TEST_BUFFERED_DISCARD", "unverified teardown did not abort or published a durable trace");
    }

    const abortWorkspace = path.join(temporaryWorkspace, "unverified-multi-profile");
    fs.mkdirSync(abortWorkspace);
    const abortTraceStore = createTraceStore({ workspaceRoot: abortWorkspace });
    const candidateProfileRun = {
      ...profileRun,
      profile_role: "candidate",
      profile: "buffered-self-test-candidate",
      profile_fingerprint: fingerprint({ buffered_self_test_profile: "candidate", repository_fingerprint: repositoryFingerprint }),
    };
    let profileCalls = 0;
    let reportPublicationBlocked = false;
    try {
      await runEvaluation({
        selected: [{ scenario, suite: "infrastructure" }],
        adapterUrl: "buffered-self-test://unverified-report",
        profiles: [profileRun, candidateProfileRun],
        traceStore: abortTraceStore,
        evaluationRunId: "eval-buffered-self-test-report",
        evidenceKind: "infrastructure_self_test",
        scenarioRunOptions: { prepareFixtureFn: prepareUnverifiedFixture },
        runScenarioProfileFn: async (options) => {
          profileCalls += 1;
          if (profileCalls > 1) throw new ContractError("LIVE_SELF_TEST_BUFFERED_ORDER", "evaluation continued after unverified teardown");
          return runScenarioProfile({
            ...options,
            runAdapterModuleFn: async () => { throw new AdapterExecutionError("adapter_teardown_unverified"); },
          });
        },
      });
    } catch (error) {
      reportPublicationBlocked = error instanceof AdapterExecutionError && error.classification === "adapter_teardown_unverified";
    }
    if (!reportPublicationBlocked || profileCalls !== 1 || fs.existsSync(path.join(abortWorkspace, ".oc_harness"))) {
      throw new ContractError("LIVE_SELF_TEST_BUFFERED_REPORT", "unverified teardown continued evaluation or produced a durable run/report candidate");
    }
    console.log("Harness buffered live-evaluation self-test passed (in-memory journal and post-teardown commit; no child process or LLM)." );
  } finally {
    fs.rmSync(temporaryWorkspace, { recursive: true, force: true });
  }
}

async function runSelfTest(corpus) {
  const temporaryWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-live-self-test-"));
  try {
    if (adapterFailureReason({}) !== "adapter_success_unavailable" || adapterFailureReason({ passed: true }) !== null) {
      throw new ContractError("LIVE_SELF_TEST_ADAPTER_SUCCESS", "adapter success must be explicit");
    }
    const mismatchedAttestation = fingerprint({ self_test: "mismatched-attestation" });
    if (adapterFailureReason({ passed: true }, mismatchedAttestation) !== "adapter_profile_fingerprint_mismatch") {
      throw new ContractError("LIVE_SELF_TEST_ADAPTER_ATTESTATION", "explicit success without matching profile attestation must fail closed");
    }
    const infrastructureScenario = corpus.scenarios.find((scenario) => scenario.id === "runner-self-test");
    if (!infrastructureScenario) throw new ContractError("LIVE_SELF_TEST_SELECTION", "runner self-test scenario is missing");
    const permissionSnapshot = (profileId, subjectFingerprint, tag) => {
      const permissions = { "config.permission.edit": "deny", "config.permission.read": "allow" };
      const runtimeFingerprint = fingerprint({ runtime: tag });
      const surfaceFingerprint = fingerprint(permissions);
      return {
        schema_version: 1,
        producer_id: EVIDENCE_PRODUCERS.runtimePermissionSnapshot,
        source: "installed_runtime",
        profile_id: profileId,
        subject_fingerprint: subjectFingerprint,
        runtime_fingerprint: runtimeFingerprint,
        surface_fingerprint: surfaceFingerprint,
        profile_fingerprint: fingerprint({
          subject_fingerprint: subjectFingerprint,
          runtime_fingerprint: runtimeFingerprint,
          surface_fingerprint: surfaceFingerprint,
        }),
        permissions,
        complete: true,
        incomplete_scopes: [],
        created_at: "2026-07-10T10:00:00.000Z",
      };
    };
    const attestedCandidateRepository = fingerprint({ self_test_repository: "candidate-attested" });
    const baselinePermissionPath = path.join(temporaryWorkspace, "baseline-permission.json");
    const candidatePermissionPath = path.join(temporaryWorkspace, "candidate-permission.json");
    fs.writeFileSync(baselinePermissionPath, JSON.stringify(permissionSnapshot("baseline-self-test", attestedCandidateRepository, "baseline")), "utf8");
    fs.writeFileSync(candidatePermissionPath, JSON.stringify(permissionSnapshot("candidate-self-test", attestedCandidateRepository, "candidate")), "utf8");
    const attestedProfiles = profileRuns({
      OPENCODE_BASELINE_PROFILE: "baseline-self-test",
      OPENCODE_HARNESS_PROFILE: "candidate-self-test",
      OPENCODE_BASELINE_PERMISSION_EVIDENCE: baselinePermissionPath,
      OPENCODE_HARNESS_PERMISSION_EVIDENCE: candidatePermissionPath,
    }, attestedCandidateRepository);
    if (attestedProfiles.length !== 2
      || attestedProfiles.some((entry) => !entry.profile_fingerprint || entry.repository_fingerprint !== attestedCandidateRepository)) {
      throw new ContractError("LIVE_SELF_TEST_PERMISSION_EVIDENCE", "complete installed-runtime evidence did not bind both live profiles");
    }
    fs.writeFileSync(
      candidatePermissionPath,
      JSON.stringify(permissionSnapshot("candidate-self-test", fingerprint({ self_test_repository: "stale-candidate" }), "candidate")),
      "utf8",
    );
    try {
      profileRuns({
        OPENCODE_BASELINE_PROFILE: "baseline-self-test",
        OPENCODE_HARNESS_PROFILE: "candidate-self-test",
      }, attestedCandidateRepository);
      throw new ContractError("LIVE_SELF_TEST_PERMISSION_EVIDENCE", "missing permission evidence did not fail before live execution");
    } catch (error) {
      if (error?.code !== "LIVE_PERMISSION_EVIDENCE_REQUIRED") throw error;
    }
    try {
      profileRuns({
        OPENCODE_BASELINE_PROFILE: "baseline-self-test",
        OPENCODE_HARNESS_PROFILE: "candidate-self-test",
        OPENCODE_BASELINE_PERMISSION_EVIDENCE: baselinePermissionPath,
        OPENCODE_HARNESS_PERMISSION_EVIDENCE: candidatePermissionPath,
      }, attestedCandidateRepository);
      throw new ContractError("LIVE_SELF_TEST_PERMISSION_EVIDENCE", "stale candidate subject evidence was accepted");
    } catch (error) {
      if (error?.code !== "LIVE_CANDIDATE_SUBJECT_MISMATCH") throw error;
    }
    fs.writeFileSync(candidatePermissionPath, JSON.stringify(permissionSnapshot("candidate-self-test", attestedCandidateRepository, "candidate")), "utf8");
    fs.writeFileSync(
      baselinePermissionPath,
      JSON.stringify(permissionSnapshot("baseline-self-test", fingerprint({ self_test_repository: "stale-baseline" }), "baseline")),
      "utf8",
    );
    try {
      profileRuns({
        OPENCODE_BASELINE_PROFILE: "baseline-self-test",
        OPENCODE_HARNESS_PROFILE: "candidate-self-test",
        OPENCODE_BASELINE_PERMISSION_EVIDENCE: baselinePermissionPath,
        OPENCODE_HARNESS_PERMISSION_EVIDENCE: candidatePermissionPath,
      }, attestedCandidateRepository);
      throw new ContractError("LIVE_SELF_TEST_PERMISSION_EVIDENCE", "stale baseline subject evidence was accepted");
    } catch (error) {
      if (error?.code !== "LIVE_BASELINE_SUBJECT_MISMATCH") throw error;
    }
    fs.writeFileSync(baselinePermissionPath, JSON.stringify(permissionSnapshot("baseline-self-test", attestedCandidateRepository, "baseline")), "utf8");
    const collisionRepo = path.join(temporaryWorkspace, "hidden-collision-repo");
    fs.cpSync(path.resolve(root, infrastructureScenario.repo_fixture), collisionRepo, { recursive: true, errorOnExist: true });
    const collisionTarget = path.resolve(collisionRepo, infrastructureScenario.hidden_check_files[0].target);
    fs.mkdirSync(path.dirname(collisionTarget), { recursive: true });
    fs.writeFileSync(collisionTarget, "existing runner-visible content", "utf8");
    try {
      stageHiddenFiles(infrastructureScenario, collisionRepo);
      throw new ContractError("LIVE_SELF_TEST_HIDDEN_COLLISION", "hidden staging overwrote an existing target");
    } catch (error) {
      if (error?.code !== "LIVE_HIDDEN_COLLISION") throw error;
    }

    const outsideDirectory = path.join(temporaryWorkspace, "outside-hidden-target");
    const linkedRepo = path.join(temporaryWorkspace, "hidden-linked-repo");
    fs.mkdirSync(outsideDirectory);
    fs.writeFileSync(path.join(outsideDirectory, "sentinel.txt"), "unchanged", "utf8");
    fs.cpSync(path.resolve(root, infrastructureScenario.repo_fixture), linkedRepo, { recursive: true, errorOnExist: true });
    const linkedParent = path.join(linkedRepo, "linked-parent");
    fs.symlinkSync(outsideDirectory, linkedParent, process.platform === "win32" ? "junction" : "dir");
    const linkedScenario = structuredClone(infrastructureScenario);
    linkedScenario.hidden_check_files[0].target = "linked-parent/hidden.test.js";
    try {
      stageHiddenFiles(linkedScenario, linkedRepo);
      throw new ContractError("LIVE_SELF_TEST_HIDDEN_LINK", "hidden staging traversed a linked target parent");
    } catch (error) {
      if (error?.code !== "FILES_SYMLINK") throw error;
    }
    fs.unlinkSync(linkedParent);
    if (fs.readFileSync(path.join(outsideDirectory, "sentinel.txt"), "utf8") !== "unchanged"
      || fs.existsSync(path.join(outsideDirectory, "hidden.test.js"))) {
      throw new ContractError("LIVE_SELF_TEST_HIDDEN_LINK", "linked target staging changed data outside the isolated repository");
    }

    const brokenTarget = path.join(linkedRepo, "broken-hidden.test.js");
    if (process.platform === "win32") {
      const removedJunctionTarget = path.join(temporaryWorkspace, "removed-junction-target");
      fs.mkdirSync(removedJunctionTarget);
      fs.symlinkSync(removedJunctionTarget, brokenTarget, "junction");
      fs.rmdirSync(removedJunctionTarget);
    } else {
      fs.symlinkSync(path.join(outsideDirectory, "missing-hidden.test.js"), brokenTarget);
    }
    const brokenScenario = structuredClone(infrastructureScenario);
    brokenScenario.hidden_check_files[0].target = "broken-hidden.test.js";
    try {
      stageHiddenFiles(brokenScenario, linkedRepo);
      throw new ContractError("LIVE_SELF_TEST_BROKEN_LINK", "hidden staging ignored a broken-link collision");
    } catch (error) {
      if (error?.code !== "LIVE_HIDDEN_COLLISION") throw error;
    }
    fs.unlinkSync(brokenTarget);

    const mutableEvaluationSource = path.join(temporaryWorkspace, "mutable-evaluation-source");
    const immutableEvaluationSource = path.join(temporaryWorkspace, "immutable-evaluation-source");
    const pairedFixtureRelative = "fixtures/live/paired-source";
    const mutableFixture = path.join(mutableEvaluationSource, ...pairedFixtureRelative.split("/"));
    fs.mkdirSync(mutableFixture, { recursive: true });
    fs.writeFileSync(path.join(mutableFixture, "source.txt"), "captured\n", "utf8");
    fs.cpSync(mutableEvaluationSource, immutableEvaluationSource, { recursive: true, errorOnExist: true });
    const pairedScenario = { id: "paired-source-self-test", repo_fixture: pairedFixtureRelative };
    const baselineFixture = prepareFixture(pairedScenario, "baseline", immutableEvaluationSource);
    fs.writeFileSync(path.join(mutableFixture, "source.txt"), "mutated-between-profiles\n", "utf8");
    const candidateFixture = prepareFixture(pairedScenario, "candidate", immutableEvaluationSource);
    try {
      if (fs.readFileSync(path.join(baselineFixture.repo, "source.txt"), "utf8") !== "captured\n"
        || fs.readFileSync(path.join(candidateFixture.repo, "source.txt"), "utf8") !== "captured\n") {
        throw new ContractError("LIVE_SELF_TEST_SOURCE_SNAPSHOT", "baseline and candidate fixtures did not share one immutable source snapshot");
      }
    } finally {
      fs.rmSync(baselineFixture.temporaryRoot, { recursive: true, force: true });
      fs.rmSync(candidateFixture.temporaryRoot, { recursive: true, force: true });
    }

    const adapterPath = path.join(temporaryWorkspace, "deterministic-adapter.mjs");
    fs.writeFileSync(adapterPath, `
import fs from "node:fs";
import path from "node:path";
export async function runScenario(context) {
  for (const forbidden of ["hidden_checks", "hidden_check_files", "hidden_trace_assertions", "failure_family", "expected_contracts", "forbidden_regressions", "suite", "canary", "evaluationRunId"]) {
    if (forbidden in context.scenario || forbidden in context) throw new Error("runner metadata exposed");
  }
  if (fs.existsSync(path.join(context.repo, "hidden.test.js"))) throw new Error("hidden file exposed before adapter completion");
  const otherRole = context.profileRole === "baseline" ? "candidate" : "baseline";
  if (fs.existsSync(path.join(context.repo, otherRole + ".profile"))) throw new Error("profile repositories are not isolated");
  if (context.scenario.id === "runner-self-test") {
    fs.writeFileSync(path.join(context.repo, context.profileRole + ".profile"), "isolated");
  }
  await context.trace.emit({ event_type: "tool_call", summary: "Deterministic adapter tool event.", status: "completed", tool_or_command: "self-test-tool", verifier_codes: ["SELF_TEST_TOOL"] });
  if (["review-read-only-trap", "broad-audit-bounded-context"].includes(context.scenario.id)) {
    await context.trace.emit({ event_type: "review_finding", summary: "Editor role can delete resources.", status: "completed", finding: { finding_id: "permissions-editor-delete", severity: "P1", file: "src/permissions.mjs", start_line: 2, end_line: 2, code: "excessive-delete-permission" } });
  }
  await context.trace.recordContextReceipt({ source_kind: context.scenario.id === "broad-audit-bounded-context" ? "tool" : "repository", summary: "Deterministic fixture receipt.", relative_paths: [context.scenario.id.includes("audit") || context.scenario.id.includes("review") ? "src/permissions.mjs" : "src/app.js"], snapshot_fingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
  const created = await context.trace.jobs.create({ task_id: "self-test-job", agent: "general", assigned_scope: "Exercise structured job lifecycle.", write_scope: ["src/app.js"], risk: "standard" });
  await context.trace.jobs.transition({ task_id: created.request.task_id, state: "running" });
  await context.trace.jobs.complete({ task_id: created.request.task_id, state: "completed", result: { status: "completed", assigned_scope: "Exercise structured job lifecycle.", summary: "Deterministic job completed.", evidence: ["self-test-event"], files_changed: [], verification: "deterministic", decision_unblocked: "runner integration", uncertainty: "none", risks: [], next_step: "none", termination_reason: "verified" } });
  return { passed: true, profile_fingerprint: context.profileFingerprint, model: "deterministic-self-test", tool: "node-worker", cost: 0, currency: "USD", transcript: "must never persist" };
}
`, "utf8");
    let nextId = 0;
    const traceStore = createTraceStore({
      workspaceRoot: temporaryWorkspace,
      clock: (() => {
        let tick = 0;
        return () => new Date(Date.parse("2026-07-10T10:00:00.000Z") + tick++ * 1000);
      })(),
      idFactory: (kind) => `${kind}-${++nextId}`,
    });
    const selected = selectScenarios({ scenarios: corpus.scenarios, suiteManifest: corpus.suiteManifest, suite: "infrastructure" });
    if (selected.length !== 1 || selected[0].scenario.id !== "runner-self-test") throw new ContractError("LIVE_SELF_TEST_SELECTION", "self-test selected a behavioral scenario");
    const baselineRepositoryFingerprint = fingerprint({ self_test_repository: "baseline" });
    const candidateRepositoryFingerprint = fingerprint({ self_test_repository: "candidate" });
    const baselineProfileFingerprint = fingerprint({ self_test_profile: "baseline", repository_fingerprint: baselineRepositoryFingerprint });
    const candidateProfileFingerprint = fingerprint({ self_test_profile: "candidate", repository_fingerprint: candidateRepositoryFingerprint });
    const selfTestProfiles = [
      {
        profile_role: "baseline",
        profile: "baseline-self-test",
        repository_fingerprint: candidateRepositoryFingerprint,
        profile_fingerprint: baselineProfileFingerprint,
      },
      {
        profile_role: "candidate",
        profile: "candidate-self-test",
        repository_fingerprint: candidateRepositoryFingerprint,
        profile_fingerprint: candidateProfileFingerprint,
      },
    ];
    const report = await runEvaluation({
      selected,
      adapterUrl: pathToFileURL(adapterPath).href,
      profiles: selfTestProfiles,
      traceStore,
      evaluationRunId: "eval-self-test",
      evidenceKind: "infrastructure_self_test",
      modelName: "deterministic-self-test",
      createdAt: "2026-07-10T10:00:00.000Z",
    });
    if (report.results.length !== 2 || report.results.some((result) => result.status !== "passed")) {
      throw new ContractError("LIVE_SELF_TEST_RESULTS", "infrastructure profiles did not both pass");
    }
    if (new Set(report.results.map((result) => result.operational_run_id)).size !== 2) {
      throw new ContractError("LIVE_SELF_TEST_RUNS", "baseline and candidate did not receive separate operational runs");
    }
    if (report.results.some((result) => result.profile_fingerprint !== (result.profile_role === "baseline" ? baselineProfileFingerprint : candidateProfileFingerprint))) {
      throw new ContractError("LIVE_SELF_TEST_ATTESTATION", "report did not preserve the content-derived profile fingerprint");
    }
    for (const result of report.results) {
      const inspected = traceStore.inspectRun(result.operational_run_id);
      const runnerEvents = inspected.events.filter((event) => event.agent === RUNNER_AGENT);
      if (!inspected.complete
        || JSON.stringify(runnerEvents.map((event) => event.event_type)) !== JSON.stringify(REQUIRED_RUNNER_PHASES)
        || REQUIRED_RUNNER_PHASES.some((eventType) => runnerEvents.filter((event) => event.event_type === eventType).length !== 1)
        || runnerEvents.some((event) => event.finding !== null)) {
        throw new ContractError("LIVE_SELF_TEST_TRACE", "operational trace is incomplete");
      }
      if (inspected.context_receipts.length !== 1 || inspected.jobs.length !== 1 || inspected.jobs[0].status.state !== "completed") {
        throw new ContractError("LIVE_SELF_TEST_INSTRUMENTATION", "adapter instrumentation did not record receipt and job lifecycle");
      }
    }

    const reviewScenario = corpus.scenarios.find((scenario) => scenario.id === "review-read-only-trap");
    const reviewResult = await runScenarioProfile({
      adapterUrl: pathToFileURL(adapterPath).href,
      scenario: reviewScenario,
      repetition: 1,
      profileRun: selfTestProfiles[0],
      evaluationRunId: "eval-self-test-review-finding",
      traceStore,
      modelName: "deterministic-self-test",
    });
    if (reviewResult.status !== "passed") throw new ContractError("LIVE_SELF_TEST_REVIEW_FINDING", "structured adapter review finding did not satisfy the positive assertion");
    const reviewTrace = traceStore.inspectRun(reviewResult.operational_run_id);
    if (!reviewTrace.events.some((event) => event.event_type === "review_finding" && event.finding?.code === "excessive-delete-permission")) {
      throw new ContractError("LIVE_SELF_TEST_REVIEW_FINDING", "structured review finding did not persist through the frozen trace contract");
    }

    const stealthWriteResult = await runScenarioProfile({
      adapterUrl: "self-test://stealth-write",
      scenario: reviewScenario,
      repetition: 1,
      profileRun: selfTestProfiles[0],
      evaluationRunId: "eval-self-test-stealth-write",
      traceStore,
      modelName: "deterministic-self-test",
      runAdapterModuleFn: async ({ context, onTrace }) => {
        fs.writeFileSync(path.join(context.repo, "stealth-write.txt"), "adapter omitted this write from its trace", "utf8");
        await onTrace("emit", {
          event_type: "review_finding",
          summary: "Editor role can delete resources.",
          status: "completed",
          finding: {
            finding_id: "permissions-editor-delete",
            severity: "P1",
            file: "src/permissions.mjs",
            start_line: 2,
            end_line: 2,
            code: "excessive-delete-permission",
          },
        });
        return { passed: true, profile_fingerprint: selfTestProfiles[0].profile_fingerprint };
      },
    });
    const stealthWorkspaceCheck = stealthWriteResult.hidden_results
      .find((entry) => entry.check_id === stableCheckId(reviewScenario.id, "workspace", 0));
    if (stealthWriteResult.status !== "failed" || stealthWorkspaceCheck?.status !== "failed") {
      throw new ContractError("LIVE_SELF_TEST_WORKSPACE_POLICY", "runner-owned workspace policy trusted a stealth adapter write");
    }

    const stealthDirectoryResult = await runScenarioProfile({
      adapterUrl: "self-test://stealth-directory",
      scenario: reviewScenario,
      repetition: 1,
      profileRun: selfTestProfiles[0],
      evaluationRunId: "eval-self-test-stealth-directory",
      traceStore,
      modelName: "deterministic-self-test",
      runAdapterModuleFn: async ({ context, onTrace }) => {
        fs.mkdirSync(path.join(context.repo, "stealth-empty-directory"));
        await onTrace("emit", {
          event_type: "review_finding",
          summary: "Editor role can delete resources.",
          status: "completed",
          finding: {
            finding_id: "permissions-editor-delete",
            severity: "P1",
            file: "src/permissions.mjs",
            start_line: 2,
            end_line: 2,
            code: "excessive-delete-permission",
          },
        });
        return { passed: true, profile_fingerprint: selfTestProfiles[0].profile_fingerprint };
      },
    });
    const stealthDirectoryCheck = stealthDirectoryResult.hidden_results
      .find((entry) => entry.check_id === stableCheckId(reviewScenario.id, "workspace", 0));
    if (stealthDirectoryResult.status !== "failed" || stealthDirectoryCheck?.status !== "failed") {
      throw new ContractError("LIVE_SELF_TEST_WORKSPACE_POLICY", "runner-owned workspace policy trusted an empty-directory mutation");
    }

    const blockedAdapter = async ({ onTrace }) => {
      await onTrace("emit", {
        event_type: "review_finding",
        summary: "Editor role can delete resources.",
        status: "completed",
        finding: {
          finding_id: "permissions-editor-delete",
          severity: "P1",
          file: "src/permissions.mjs",
          start_line: 2,
          end_line: 2,
          code: "excessive-delete-permission",
        },
      });
      await onTrace("emit", {
        event_type: "task_end",
        summary: "Adapter stopped for permission approval.",
        status: "blocked",
        termination_reason: "blocked_permission",
      });
      return { passed: true, profile_fingerprint: selfTestProfiles[0].profile_fingerprint };
    };
    const unexpectedBlockedResult = await runScenarioProfile({
      adapterUrl: "self-test://unexpected-blocked",
      scenario: reviewScenario,
      repetition: 1,
      profileRun: selfTestProfiles[0],
      evaluationRunId: "eval-self-test-unexpected-blocked",
      traceStore,
      modelName: "deterministic-self-test",
      runAdapterModuleFn: blockedAdapter,
    });
    if (unexpectedBlockedResult.status !== "failed") {
      throw new ContractError("LIVE_SELF_TEST_TERMINATION", "unexpected non-success adapter termination produced a passing result");
    }
    const expectedBlockedScenario = structuredClone(reviewScenario);
    expectedBlockedScenario.hidden_trace_assertions.push({
      assertion_id: "expected-blocked-permission",
      op: "termination_reason_equals",
      value: "blocked_permission",
    });
    const expectedBlockedResult = await runScenarioProfile({
      adapterUrl: "self-test://expected-blocked",
      scenario: expectedBlockedScenario,
      repetition: 1,
      profileRun: selfTestProfiles[0],
      evaluationRunId: "eval-self-test-expected-blocked",
      traceStore,
      modelName: "deterministic-self-test",
      runAdapterModuleFn: blockedAdapter,
    });
    if (expectedBlockedResult.status !== "passed") {
      throw new ContractError("LIVE_SELF_TEST_TERMINATION", "exact runner-owned non-success termination assertion did not pass");
    }

    const noOpReview = await runScenarioProfile({
      adapterUrl: pathToFileURL(adapterPath).href,
      scenario: reviewScenario,
      repetition: 1,
      profileRun: selfTestProfiles[0],
      evaluationRunId: "eval-self-test-review-no-op",
      traceStore,
      modelName: "deterministic-self-test",
      runAdapterModuleFn: async () => ({ passed: true, profile_fingerprint: selfTestProfiles[0].profile_fingerprint }),
    });
    if (noOpReview.status !== "failed" || noOpReview.hidden_results.every((entry) => entry.status === "passed")) {
      throw new ContractError("LIVE_SELF_TEST_REVIEW_NO_OP", "explicit-success no-op review adapter passed without positive finding evidence");
    }

    let teardownHiddenStageCalls = 0;
    const durableRunsRoot = path.join(temporaryWorkspace, ".oc_harness", "runs");
    const durableRunsBefore = fs.readdirSync(durableRunsRoot).sort();
    const teardownFixtureRoot = path.join(temporaryWorkspace, "teardown-unverified-fixture");
    let teardownRejected = false;
    try {
      await runScenarioProfile({
        adapterUrl: pathToFileURL(adapterPath).href,
        scenario: infrastructureScenario,
        repetition: 1,
        profileRun: selfTestProfiles[0],
        evaluationRunId: "eval-self-test-teardown-failure",
        traceStore,
        modelName: "deterministic-self-test",
        prepareFixtureFn: (fixtureScenario) => {
          const repo = path.join(teardownFixtureRoot, "repo");
          fs.mkdirSync(teardownFixtureRoot, { recursive: true });
          fs.cpSync(path.resolve(root, fixtureScenario.repo_fixture), repo, { recursive: true, errorOnExist: true });
          return { temporaryRoot: teardownFixtureRoot, repo };
        },
        runAdapterModuleFn: async () => { throw new AdapterExecutionError("adapter_teardown_unverified"); },
        stageHiddenFilesFn: () => { teardownHiddenStageCalls += 1; },
      });
    } catch (error) {
      teardownRejected = error instanceof AdapterExecutionError && error.classification === "adapter_teardown_unverified";
    }
    if (teardownHiddenStageCalls !== 0
      || !teardownRejected
      || JSON.stringify(fs.readdirSync(durableRunsRoot).sort()) !== JSON.stringify(durableRunsBefore)) {
      throw new ContractError("LIVE_SELF_TEST_TEARDOWN_BOUNDARY", "unverified teardown did not block hidden staging and durable trace publication");
    }
    for (const [label, invoke, expectedCode] of [
      ["timeout", async () => { throw new AdapterTimeoutError(1); }, "HIDDEN_SKIPPED_ADAPTER_TIMEOUT"],
      ["failure", async () => ({ passed: false }), "HIDDEN_SKIPPED_ADAPTER_FAILURE"],
    ]) {
      let hiddenStageCalls = 0;
      const failedAdapterResult = await runScenarioProfile({
        adapterUrl: pathToFileURL(adapterPath).href,
        scenario: infrastructureScenario,
        repetition: 1,
        profileRun: selfTestProfiles[0],
        evaluationRunId: `eval-self-test-adapter-${label}`,
        traceStore,
        modelName: "deterministic-self-test",
        runAdapterModuleFn: invoke,
        stageHiddenFilesFn: () => { hiddenStageCalls += 1; },
      });
      const failedTrace = traceStore.inspectRun(failedAdapterResult.operational_run_id);
      const hiddenStageEvent = failedTrace.events.find((event) => event.agent === RUNNER_AGENT && event.event_type === "hidden_staging");
      if (hiddenStageCalls !== 0
        || failedAdapterResult.status !== "incomplete"
        || !hiddenStageEvent?.verifier_codes.includes(expectedCode)) {
        throw new ContractError("LIVE_SELF_TEST_HIDDEN_BOUNDARY", `${label} adapter execution did not block hidden staging`);
      }
    }
    const unsettledJobResult = await runScenarioProfile({
      adapterUrl: pathToFileURL(adapterPath).href,
      scenario: infrastructureScenario,
      repetition: 1,
      profileRun: selfTestProfiles[0],
      evaluationRunId: "eval-self-test-unsettled-job",
      traceStore,
      modelName: "deterministic-self-test",
      runAdapterModuleFn: async ({ onTrace }) => {
        await onTrace("job_create", { task_id: "unsettled-job", agent: "general", assigned_scope: "Unsettled adapter work.", write_scope: ["src/app.js"], risk: "standard" });
        return { passed: true, profile_fingerprint: selfTestProfiles[0].profile_fingerprint };
      },
    });
    const unsettledTrace = traceStore.inspectRun(unsettledJobResult.operational_run_id);
    if (unsettledJobResult.status !== "incomplete"
      || !unsettledJobResult.incomplete_evidence.includes("ADAPTER_JOBS_UNSETTLED")
      || unsettledTrace.jobs[0]?.status.state !== "cancelled") {
      throw new ContractError("LIVE_SELF_TEST_UNSETTLED_JOB", "runner did not terminally cancel unsettled adapter jobs");
    }

    const cleanupFailure = await runScenarioProfile({
      adapterUrl: pathToFileURL(adapterPath).href,
      scenario: infrastructureScenario,
      repetition: 1,
      profileRun: selfTestProfiles[0],
      evaluationRunId: "eval-self-test-cleanup-failure",
      traceStore,
      modelName: "deterministic-self-test",
      runAdapterModuleFn: async () => ({ passed: true, profile_fingerprint: selfTestProfiles[0].profile_fingerprint }),
      cleanupFixtureFn: () => { throw new Error("injected cleanup failure"); },
    });
    if (cleanupFailure.status !== "incomplete" || !cleanupFailure.incomplete_evidence.includes("FIXTURE_CLEANUP_FAILED")) {
      throw new ContractError("LIVE_SELF_TEST_CLEANUP", "fixture cleanup failure masked or escaped result classification");
    }

    const arbitraryBait = "arbitrary-bait-value-42";
    const baitScenario = structuredClone(infrastructureScenario);
    baitScenario.hidden_trace_assertions.push({ assertion_id: "arbitrary-bait-absent", op: "sanitized_value_absent", value: arbitraryBait });
    const baitReport = await runEvaluation({
      selected: [{ scenario: baitScenario, suite: "infrastructure" }],
      adapterUrl: pathToFileURL(adapterPath).href,
      profiles: [selfTestProfiles[0]],
      traceStore,
      evaluationRunId: "eval-self-test-report-bait",
      evidenceKind: "infrastructure_self_test",
      modelName: arbitraryBait,
      createdAt: "2026-07-10T10:00:30.000Z",
      scenarioRunOptions: {
        runAdapterModuleFn: async () => ({
          passed: true,
          profile_fingerprint: selfTestProfiles[0].profile_fingerprint,
          model: arbitraryBait,
          tool: `tool-${arbitraryBait}`,
        }),
      },
    });
    if (JSON.stringify(baitReport).includes(arbitraryBait)
      || baitReport.results[0].model.available
      || baitReport.results[0].tool.available) {
      throw new ContractError("LIVE_SELF_TEST_REPORT_PRIVACY", "arbitrary deny-value reached report metadata");
    }
    const baitHistory = createReportHistory({
      workspaceRoot: temporaryWorkspace,
      reportDir: path.join(temporaryWorkspace, "bait-reports"),
      clock: () => new Date("2026-07-10T10:00:31.000Z"),
      idFactory: () => "bait-history",
    });
    const baitWritten = baitHistory.write(baitReport, { denyValues: [arbitraryBait] });
    if (fs.readFileSync(baitWritten.jsonPath, "utf8").includes(arbitraryBait)
      || fs.readFileSync(baitWritten.mdPath, "utf8").includes(arbitraryBait)) {
      throw new ContractError("LIVE_SELF_TEST_REPORT_PRIVACY", "arbitrary deny-value reached immutable report history");
    }

    const earlyFailure = await runScenarioProfile({
      adapterUrl: pathToFileURL(adapterPath).href,
      scenario: infrastructureScenario,
      repetition: 1,
      profileRun: selfTestProfiles[0],
      evaluationRunId: "eval-self-test-early-failure",
      traceStore,
      modelName: "deterministic-self-test",
      prepareFixtureFn: () => { throw new ContractError("LIVE_SELF_TEST_FIXTURE_FAILURE", "injected fixture failure"); },
    });
    const earlyTrace = traceStore.inspectRun(earlyFailure.operational_run_id);
    const earlyRunnerEvents = earlyTrace.events.filter((event) => event.agent === RUNNER_AGENT);
    if (!earlyTrace.complete
      || earlyFailure.status !== "incomplete"
      || earlyRunnerEvents.length !== REQUIRED_RUNNER_PHASES.length
      || JSON.stringify(earlyRunnerEvents.map((event) => event.event_type)) !== JSON.stringify(REQUIRED_RUNNER_PHASES)
      || REQUIRED_RUNNER_PHASES.some((eventType) => earlyRunnerEvents.filter((event) => event.event_type === eventType).length !== 1)) {
      throw new ContractError("LIVE_SELF_TEST_PHASE_LEDGER", "early fixture failure did not produce the complete exactly-once phase ledger");
    }
    const earlyStatuses = Object.fromEntries(earlyRunnerEvents.map((event) => [event.event_type, event.status]));
    if (earlyStatuses.fixture_preparation !== "failed"
      || ["setup_verification", "adapter_invocation", "adapter_result", "visible_check", "hidden_staging", "hidden_check"].some((phase) => earlyStatuses[phase] !== "blocked")) {
      throw new ContractError("LIVE_SELF_TEST_PHASE_LEDGER", "early fixture failure phase placeholders were not honest failed/blocked states");
    }
    const midRunFailure = await runScenarioProfile({
      adapterUrl: pathToFileURL(adapterPath).href,
      scenario: infrastructureScenario,
      repetition: 1,
      profileRun: selfTestProfiles[1],
      evaluationRunId: "eval-self-test-mid-run-failure",
      traceStore,
      modelName: "deterministic-self-test",
      executeChecksFn: (scenario, phase, commands, repo) => {
        if (phase === "visible") throw new ContractError("LIVE_SELF_TEST_VISIBLE_FAILURE", "injected visible-check failure");
        return executeChecks(scenario, phase, commands, repo);
      },
    });
    const midRunTrace = traceStore.inspectRun(midRunFailure.operational_run_id);
    const midRunEvents = midRunTrace.events.filter((event) => event.agent === RUNNER_AGENT);
    const midRunStatuses = Object.fromEntries(midRunEvents.map((event) => [event.event_type, event.status]));
    if (!midRunTrace.complete
      || midRunFailure.status !== "incomplete"
      || JSON.stringify(midRunEvents.map((event) => event.event_type)) !== JSON.stringify(REQUIRED_RUNNER_PHASES)
      || REQUIRED_RUNNER_PHASES.some((eventType) => midRunEvents.filter((event) => event.event_type === eventType).length !== 1)
      || midRunStatuses.visible_check !== "failed"
      || midRunStatuses.hidden_staging !== "blocked"
      || midRunStatuses.hidden_check !== "blocked") {
      throw new ContractError("LIVE_SELF_TEST_PHASE_LEDGER", "mid-run failure did not preserve exactly-once failed/blocked phase states");
    }
    if (JSON.stringify(report).includes("must never persist")) throw new ContractError("LIVE_SELF_TEST_PRIVACY", "raw adapter transcript reached report");
    const history = createReportHistory({
      workspaceRoot: temporaryWorkspace,
      reportDir: path.join(temporaryWorkspace, "reports"),
      clock: () => new Date("2026-07-10T10:01:00.000Z"),
      idFactory: () => "history-self-test",
      fileOptions: { tempIdFactory: (() => { let value = 0; return () => `temp-${++value}`; })() },
    });
    const written = history.write(report, { denyValues: denyValuesForScenarios(selected.map((entry) => entry.scenario)) });
    if (history.inspect(written.jsonPath).report.evaluation_run_id !== report.evaluation_run_id) {
      throw new ContractError("LIVE_SELF_TEST_HISTORY", "immutable report history did not read back");
    }
    console.log("Harness live evaluation self-tests passed (tracing, isolation, hidden boundary, immutable history; no LLM)." );
  } finally {
    fs.rmSync(temporaryWorkspace, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const localCorpus = loadScenarioCorpus({ root });
  if (args.validate) {
    const behavioralCount = localCorpus.scenarios.filter((scenario) => scenario.id !== "runner-self-test").length;
    console.log(`Harness live evaluation manifests valid (${behavioralCount} behavioral + 1 infrastructure).`);
    return;
  }
  if (args.selfTest) {
    await runSelfTest(localCorpus);
    return;
  }
  if (args.bufferedSelfTest) {
    await runBufferedPublicationSelfTest(localCorpus);
    return;
  }

  const sourceSnapshot = materializeRepositorySnapshot(root);
  let snapshotCleaned = false;
  try {
    const corpus = loadScenarioCorpus({ root: sourceSnapshot.snapshotRoot });
    const selected = selectScenarios({
      scenarios: corpus.scenarios,
      suiteManifest: corpus.suiteManifest,
      suite: args.suite,
      scenarioIds: args.scenarioIds,
    });
    const adapterUrl = adapterUrlFromEnvironment();
    const profiles = profileRuns(process.env, sourceSnapshot.repositoryFingerprint);
    const traceStore = createTraceStore({ workspaceRoot: root });
    const legacySelected = selected.filter(({ scenario }) => (
      loadQualityLiveScenarioSidecar({ root: sourceSnapshot.snapshotRoot, scenario }) === null
    ));
    const qualitySelected = selected.filter(({ scenario }) => (
      loadQualityLiveScenarioSidecar({ root: sourceSnapshot.snapshotRoot, scenario }) !== null
    ));
    const reports = [];
    if (legacySelected.length > 0) {
      reports.push(await runEvaluation({
        selected: legacySelected,
        adapterUrl,
        profiles,
        traceStore,
        evaluationRunId: assertSafeId(`eval-${randomUUID()}`, "evaluation run ID"),
        evidenceKind: "live",
        modelName: process.env.OPENCODE_MODEL || null,
        scenarioRunOptions: { sourceRoot: sourceSnapshot.snapshotRoot },
      }));
    }
    if (qualitySelected.length > 0) {
      const experimentContext = loadQualityExperimentContext(sourceSnapshot.snapshotRoot);
      reports.push(await runQualityEvaluation({
        selected: qualitySelected,
        adapterUrl,
        profiles,
        traceStore,
        evaluationRunId: assertSafeId(`quality-eval-${randomUUID()}`, "quality evaluation run ID"),
        evidenceKind: "live",
        experimentContext,
        runtimeModelEvidence: loadRuntimeModelEvidence(
          process.env.OPENCODE_MODEL_RUNTIME_EVIDENCE_PATH
            ?? process.env.OPENCODE_MODEL_RUNTIME_EVIDENCE_FILE,
          experimentContext.catalog,
        ),
        scenarioRunOptions: { sourceRoot: sourceSnapshot.snapshotRoot },
      }));
    }
    sourceSnapshot.verifyIntegrity();
    if (repositoryStateFingerprint(root) !== sourceSnapshot.repositoryFingerprint) {
      throw new ContractError("LIVE_SOURCE_CHANGED", "repository state changed after the immutable live-evaluation snapshot was captured");
    }
    sourceSnapshot.cleanup();
    snapshotCleaned = true;
    const denyValues = denyValuesForScenarios(selected.map((entry) => entry.scenario));
    const history = createReportHistory({ workspaceRoot: root, reportDir });
    for (const report of reports) {
      const written = history.write(report, { denyValues });
      console.log(`Harness live evaluation completed: ${path.basename(written.jsonPath)} and ${path.basename(written.mdPath)}.`);
      if (report.results.some((result) => result.status !== "passed")) process.exitCode = 1;
    }
  } finally {
    if (!snapshotCleaned) {
      try {
        sourceSnapshot.cleanup();
      } catch {
        try { recoverMaterializedRepositorySnapshot(sourceSnapshot); } catch { /* preserve primary failure */ }
      }
    }
  }
}

export {
  loadQualityExperimentContext,
  runnerPreimplementationEvidence,
  runQualityEvaluation,
  runScenarioProfile,
  runtimeEvidenceForBinding,
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    const code = error?.code ?? "LIVE_UNEXPECTED";
    const message = error instanceof ContractError || error instanceof AdapterTimeoutError || error instanceof AdapterExecutionError
      ? error.message
      : "unexpected live-evaluation failure";
    console.error(`Harness live evaluation failed: ${code}: ${message}`);
    process.exitCode = 1;
  }
}
