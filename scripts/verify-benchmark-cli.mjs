import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  SYNTHETIC_CLI_EXIT,
  compareSyntheticRunReportWorkflow,
  loadSyntheticRunReportArtifact,
  parseSyntheticCliArguments,
  replaySyntheticBenchmarkWorkflow,
  runSyntheticBenchmarkWorkflow,
  runSyntheticCliMain,
} from "../lib/benchmark/cli.mjs";
import { loadSyntheticContracts } from "../lib/benchmark/contracts.mjs";
import { fingerprint } from "../lib/feedback/contracts.mjs";
import {
  publishSyntheticReplayReport,
  runSyntheticReplay,
  syntheticModelBindingFingerprint,
  validateSyntheticReplayReport,
  validateSyntheticReplayReportSourceBinding,
} from "../lib/benchmark/replay.mjs";
import {
  syntheticEffectivePublicInputFingerprint,
  syntheticRunnerLimitsFingerprint,
} from "../lib/benchmark/runner.mjs";
import {
  SYNTHETIC_OPENCODE_ADAPTER_VERSION,
  syntheticOpenCodeAdapterFingerprint,
} from "../lib/benchmark/opencode-adapter.mjs";
import {
  cleanupSyntheticProfile,
  materializeSyntheticProfile,
} from "../lib/benchmark/profiles.mjs";
import { publishSyntheticRunArtifacts } from "../lib/benchmark/reporting.mjs";
import {
  DEFAULT_MODEL_FREE_CHECKS,
  executeModelFreeCheck,
  publishSyntheticModelFreeSelfTestReport,
  runSyntheticModelFreeSelfTest,
  validateSyntheticModelFreeSelfTestReport,
} from "../lib/benchmark/self-test.mjs";
import { createStatisticsFixtureReport } from "./verify-benchmark-statistics.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXED_TIME = "2026-01-01T00:00:00.000Z";

function captureStream() {
  let contents = "";
  return {
    stream: {
      write(chunk) {
        contents += String(chunk);
        return true;
      },
    },
    read() {
      return contents;
    },
  };
}

function passingExecution(stdout = "", stderr = "") {
  return {
    exitCode: 0,
    signal: null,
    stdout,
    stderr,
    errorCode: null,
    durationMs: 1,
  };
}

function replayAttempt({
  sourceRoot,
  instance,
  profileId,
  operationalRunId,
  model,
  provider,
  variant,
  timeoutMs,
}, {
  status = "completed",
  terminationReason = "verified",
  reason = null,
  adapterCompleted = true,
  evidenceComplete = true,
  wholeTaskSuccess = true,
} = {}) {
  const profile = materializeSyntheticProfile({ sourceRoot, profileId });
  const profileFingerprint = profile.profileFingerprint;
  cleanupSyntheticProfile(profile);
  const completed = status === "completed";
  const checkOutcome = () => completed
    ? { status: "passed", passed: true, violations: [] }
    : { status: "not_run", passed: null, violations: ["adapter_unavailable"] };
  const initialWorkspace = fingerprint({
    fixture: "replay-initial-workspace",
    instance: instance.instance_fingerprint,
  });
  const changedAllowedPaths = completed && instance.task_scope.mode === "edit"
    ? [...instance.task_scope.allowed_changed_paths]
    : [];
  const scopeAudit = {
    mode: instance.task_scope.mode,
    allowed_changed_paths: [...instance.task_scope.allowed_changed_paths],
    max_changed_files: instance.task_scope.max_changed_files,
    observation_status: completed ? "available" : "unavailable",
    changed_allowed_paths: changedAllowedPaths,
    changed_path_count: completed ? changedAllowedPaths.length : null,
    changed_paths_fingerprint: completed
      ? fingerprint({ schema: "synthetic-changed-paths-v1", paths: changedAllowedPaths })
      : null,
    unexpected_path_count: completed ? 0 : null,
    unexpected_path_ids: [],
    unexpected_path_ids_complete: completed,
    forbidden_path_count: completed ? 0 : null,
    forbidden_path_ids: [],
    forbidden_path_ids_complete: completed,
    violation_codes: completed ? [] : ["workspace_not_observed"],
  };
  const instrumented = profileId === "instrumented" && completed;
  const controlAudit = {
    classification: instrumented ? "attested" : "absent",
    session_count: instrumented ? 1 : 0,
    registration_count: instrumented ? 1 : 0,
    registration_only_count: 0,
    owner_session_count: instrumented ? 1 : 0,
    child_session_count: 0,
    attested_owner_count: instrumented ? 1 : 0,
    control_state_fingerprint: instrumented ? fingerprint({ fixture: "replay-control", operationalRunId }) : null,
    violation_codes: [],
  };
  const reviewAudit = (check) => ({
    strategy: "semantic-concept-one-to-one-v2",
    candidate_count: 1,
    oracle_count: check.expected_findings.length,
    matched_count: check.expected_findings.length,
    severity_calibrated_count: check.expected_findings.length,
    location_calibrated_count: check.expected_findings.length,
    oracle_fingerprint: fingerprint(check.expected_findings),
  });
  const reviewMatchAudit = instance.visible_check.kind === "structured-review"
    ? {
        visible: completed ? reviewAudit(instance.visible_check) : null,
        hidden: completed ? reviewAudit(instance.hidden_check) : null,
      }
    : null;
  const auditEvidenceSource = {
    scope: scopeAudit,
    control: controlAudit,
    review_match: reviewMatchAudit,
  };
  const result = {
    profile_id: profileId,
    profile_fingerprint: profileFingerprint,
    operational_run_id: operationalRunId,
    execution_status: status,
    termination_reason: terminationReason,
    reason,
    cli_version: completed ? "1.17.0" : null,
    adapter_evidence_observed: completed,
    adapter_completed_correctly: adapterCompleted,
    agent_reported_success: completed ? true : null,
    claimed_completion: completed,
    claimed_outcome_availability: completed ? "available" : "unavailable",
    explicit_block: false,
    explicit_failure: false,
    termination_acceptable: completed,
    visible_check: checkOutcome(),
    hidden_check: checkOutcome(),
    workspace_policy: checkOutcome(),
    common_safety: checkOutcome(),
    treatment_compliance: checkOutcome(),
    trace_policy: checkOutcome(),
    teardown: { status: "passed", passed: true, violations: [] },
    cleanup: { status: "passed", passed: true, violations: [] },
    hidden_safety_failed: false,
    task_evidence_complete: completed,
    task_correct: completed,
    evidence_complete: evidenceComplete,
    whole_task_success: wholeTaskSuccess,
    defect_escape_v2: false,
    false_block: null,
    audit_evidence: {
      ...auditEvidenceSource,
      fingerprint: fingerprint(auditEvidenceSource),
    },
    fingerprints: {
      adapter: completed ? syntheticOpenCodeAdapterFingerprint() : null,
      initial_workspace: initialWorkspace,
      final_workspace: completed
        ? fingerprint({ fixture: "replay-final-workspace", operationalRunId })
        : null,
      trace: completed ? fingerprint({ fixture: "replay-trace", operationalRunId }) : null,
    },
    metrics: {
      total_tool_call_count: completed ? 1 : null,
      task_action_call_count: completed ? 1 : null,
      computational_control_call_count: completed ? 0 : null,
      subagent_call_count: completed ? 0 : null,
      discretionary_delegation_count: completed ? 0 : null,
      runner_assigned_delegation_count: completed ? 0 : null,
      context_read_count: null,
      permission_request_count: null,
      model_turn_count: completed ? 1 : null,
      continuation_turn_count: completed && profileId === "instrumented" ? 1 : completed ? 0 : null,
      dangerous_command_count: completed ? 0 : null,
      network_action_count: completed ? 0 : null,
      hidden_access_attempt_count: completed ? 0 : null,
      workspace_mutation_count: completed ? 1 : null,
      fix_command_count: completed ? 1 : null,
      repository_instruction_action_count: completed ? 0 : null,
      secret_write_count: completed ? 0 : null,
      duration_ms: completed ? 1 : null,
      cost_usd: null,
      availability: {
        context_reads: "unavailable",
        permission_requests: "unavailable",
        network_actions: completed ? "available" : "unavailable",
        cost: "unavailable",
      },
    },
    operational_trace_id: completed ? `trace-${operationalRunId}` : null,
  };
  return {
    binding: {
      public_fixture_fingerprint: instance.public_fixture_fingerprint,
      hidden_fixture_fingerprint: instance.hidden_fixture_fingerprint,
      task_scope_fingerprint: fingerprint(instance.task_scope),
      effective_public_input_fingerprint: syntheticEffectivePublicInputFingerprint(instance),
      initial_public_manifest_fingerprint: initialWorkspace,
      model_fingerprint: syntheticModelBindingFingerprint({ provider, model, variant }),
      executable_fingerprint: fingerprint({ fixture: "executable" }),
      executable_version: "1.17.0",
      executable_basename: "opencode",
      executable_platform: "linux",
      executable_identity_policy_version: 2,
      timeout_ms: timeoutMs,
      limits_fingerprint: syntheticRunnerLimitsFingerprint(),
      adapter_protocol_version: SYNTHETIC_OPENCODE_ADAPTER_VERSION,
    },
    result,
  };
}

function completeNegativeReplayAttempt(input, {
  reason = "opencode_missing_final",
  terminationReason = "verification_failed",
} = {}) {
  const attempt = replayAttempt(input);
  Object.assign(attempt.result, {
    execution_status: "failed",
    termination_reason: terminationReason,
    reason,
    adapter_completed_correctly: false,
    agent_reported_success: null,
    claimed_completion: false,
    claimed_outcome_availability: "unavailable",
    explicit_block: false,
    explicit_failure: false,
    termination_acceptable: false,
    evidence_complete: true,
    whole_task_success: false,
    defect_escape_v2: false,
    false_block: null,
  });
  return attempt;
}

function canonicalTemporaryRoot(prefix) {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

export async function verifyBenchmarkCli({ root = defaultRoot } = {}) {
  const contracts = loadSyntheticContracts(root);
  const loadRunArtifact = (options) => loadSyntheticRunReportArtifact({
    ...options,
    contractSourceRoot: root,
  });
  const compareRunReport = (options) => compareSyntheticRunReportWorkflow({
    ...options,
    contractSourceRoot: root,
  });
  const publishRun = (options) => publishSyntheticRunArtifacts({
    ...options,
    contractSourceRoot: root,
  });
  assert.deepEqual(DEFAULT_MODEL_FREE_CHECKS[0], {
    id: "benchmark-model-free-contract",
    script: "scripts/verify-benchmark-model-free-contract.mjs",
  });
  assert.equal(
    DEFAULT_MODEL_FREE_CHECKS.some(
      (entry) => entry.script === "scripts/verify-benchmark-contracts.mjs",
    ),
    false,
    "installed model-free self-test must not execute the complete-bundle verifier",
  );
  const fixtureRoot = canonicalTemporaryRoot("opencode-harness-benchmark-cli-");
  try {
    const parsed = parseSyntheticCliArguments("run", [
      "--suite",
      "smoke",
      "--baseline",
      "plain",
      "--candidate",
      "instrumented",
      "--seed",
      "cli-seed",
      "--model",
      "fixture/model",
      "--provider",
      "fixture",
    ], {});
    assert.equal(parsed.suiteId, "smoke");
    assert.equal(parsed.seed, "cli-seed");
    assert.equal(parsed.model, "fixture/model");
    assert.equal(parsed.timeoutMs, 300_000);
    assert.equal(parseSyntheticCliArguments("run", [
      "--seed",
      "extended-timeout",
      "--model",
      "fixture/model",
      "--timeout-ms",
      "300000",
    ], {}).timeoutMs, 300_000);
    assert.equal(parseSyntheticCliArguments("run", [
      "--seed",
      "maximum-timeout",
      "--model",
      "fixture/model",
      "--timeout-ms",
      "3600000",
    ], {}).timeoutMs, 3_600_000);
    assert.throws(
      () => parseSyntheticCliArguments("run", [
        "--seed",
        "excessive-timeout",
        "--model",
        "fixture/model",
        "--timeout-ms",
        "3600001",
      ], {}),
      (error) => error?.code === "SYNTHETIC_CLI_USAGE",
    );
    const emptyOptionalEnvironment = parseSyntheticCliArguments("run", [
      "--seed",
      "empty-optional-environment",
    ], {
      OPENCODE_BENCH_MODEL: "fixture/model",
      OPENCODE_BENCH_PROVIDER: "",
      OPENCODE_BENCH_VARIANT: "",
    });
    assert.equal(emptyOptionalEnvironment.provider, null);
    assert.equal(emptyOptionalEnvironment.variant, null);
    assert.throws(
      () => parseSyntheticCliArguments("run", [
        "--seed",
        "empty-explicit-provider",
        "--model",
        "fixture/model",
        "--provider",
        "",
      ], {}),
      (error) => error?.code === "SYNTHETIC_CLI_USAGE",
    );
    assert.throws(
      () => parseSyntheticCliArguments("run", [
        "--seed",
        "CON",
        "--model",
        "fixture/model",
      ], {}),
      (error) => error?.code === "SYNTHETIC_CLI_USAGE",
    );
    assert.throws(
      () => parseSyntheticCliArguments("replay", [
        "--family",
        "function-boundaries",
        "--seed",
        "cli-seed",
        "--profile",
        "plain",
        "--instance-fingerprint",
        "invalid",
        "--model",
        "fixture/model",
      ], {}),
      (error) => error?.code === "SYNTHETIC_CLI_USAGE",
    );

    const helpOut = captureStream();
    const helpErr = captureStream();
    assert.equal(await runSyntheticCliMain({
      command: "run",
      argv: ["--help"],
      sourceRoot: root,
      environment: {},
      stdout: helpOut.stream,
      stderr: helpErr.stream,
    }), SYNTHETIC_CLI_EXIT.success);
    assert.match(helpOut.read(), /OPENCODE_BENCH_MODEL/u);
    assert.equal(helpErr.read(), "");

    let forbiddenRunCalls = 0;
    const blockedOut = captureStream();
    const blockedErr = captureStream();
    assert.equal(await runSyntheticCliMain({
      command: "run",
      argv: ["--seed", "missing-model"],
      sourceRoot: root,
      environment: {},
      stdout: blockedOut.stream,
      stderr: blockedErr.stream,
      dependencies: {
        run: {
          runPairedBenchmark: async () => {
            forbiddenRunCalls += 1;
            throw new Error("must not run without a model binding");
          },
        },
      },
    }), SYNTHETIC_CLI_EXIT.blocked_external_state);
    assert.equal(forbiddenRunCalls, 0);
    assert.deepEqual(JSON.parse(blockedOut.read()), {
      status: "blocked_external_state",
      reason: "model_not_configured",
      code: "SYNTHETIC_CLI_BLOCKED_EXTERNAL_STATE",
    });
    assert.equal(blockedErr.read(), "");

    const invalidOut = captureStream();
    const invalidErr = captureStream();
    assert.equal(await runSyntheticCliMain({
      command: "validate",
      argv: ["--unknown"],
      sourceRoot: root,
      environment: {},
      stdout: invalidOut.stream,
      stderr: invalidErr.stream,
    }), SYNTHETIC_CLI_EXIT.failure);
    assert.equal(invalidOut.read(), "");
    assert.equal(JSON.parse(invalidErr.read()).status, "invalid_arguments");

    const report = createStatisticsFixtureReport(contracts, {
      mode: "better",
      suiteId: "standard",
      sourceRoot: root,
    });
    const runWorkflow = await runSyntheticBenchmarkWorkflow({
      sourceRoot: fixtureRoot,
      contractSourceRoot: root,
      suiteId: report.suite.id,
      baselineProfileId: report.profiles.baseline.id,
      candidateProfileId: report.profiles.candidate.id,
      seed: report.suite.seed,
      semanticVariants: report.suite.semantic_variants,
      trajectoryRepetitions: report.suite.trajectory_repetitions,
      model: report.execution.model,
      provider: report.execution.provider,
      variant: report.execution.variant,
      timeoutMs: report.execution.timeout_ms,
      loadContracts: () => contracts,
      runPairedBenchmark: async () => structuredClone(report),
    });
    assert.equal(runWorkflow.exitCode, SYNTHETIC_CLI_EXIT.success);
    assert.equal(runWorkflow.output.complete, true);
    assert.equal(runWorkflow.output.verdict, "candidate_better");
    assert.equal(
      runWorkflow.output.model_binding_fingerprint,
      syntheticModelBindingFingerprint(report.execution),
    );
    assert.equal(JSON.stringify(runWorkflow.output).includes(report.execution.model), false);

    let runPublishedBeforeAnalysisFailure = false;
    await assert.rejects(runSyntheticBenchmarkWorkflow({
      sourceRoot: fixtureRoot,
      contractSourceRoot: root,
      suiteId: report.suite.id,
      baselineProfileId: report.profiles.baseline.id,
      candidateProfileId: report.profiles.candidate.id,
      seed: report.suite.seed,
      semanticVariants: report.suite.semantic_variants,
      trajectoryRepetitions: report.suite.trajectory_repetitions,
      model: report.execution.model,
      provider: report.execution.provider,
      variant: report.execution.variant,
      timeoutMs: report.execution.timeout_ms,
      loadContracts: () => contracts,
      runPairedBenchmark: async () => structuredClone(report),
      publishRunArtifacts: () => {
        runPublishedBeforeAnalysisFailure = true;
        return { files: {} };
      },
      analyzeRunReport: () => {
        throw new Error("synthetic comparison analysis failed");
      },
    }), /synthetic comparison analysis failed/);
    assert.equal(
      runPublishedBeforeAnalysisFailure,
      true,
      "a valid expensive run must be published before fallible comparison analysis",
    );

    const reportPath = runWorkflow.output.run_artifacts.json;
    const loaded = loadRunArtifact({
      sourceRoot: fixtureRoot,
      reportPath,
    });
    assert.deepEqual(loaded.report, report);
    const firstComparison = compareRunReport({
      sourceRoot: fixtureRoot,
      reportPath,
      loadContracts: () => contracts,
    });
    const secondComparison = compareRunReport({
      sourceRoot: fixtureRoot,
      reportPath,
      loadContracts: () => contracts,
    });
    assert.deepEqual(secondComparison, firstComparison);
    assert.equal(firstComparison.exitCode, SYNTHETIC_CLI_EXIT.success);

    const completionFile = path.join(
      fixtureRoot,
      "evals",
      "reports",
      "synthetic",
      "runs",
      report.run_id,
      "completion.json",
    );
    const originalCompletion = fs.readFileSync(completionFile, "utf8");
    const divergentCompletion = JSON.parse(originalCompletion);
    divergentCompletion.report_fingerprint =
      "sha256:0000000000000000000000000000000000000000000000000000000000000000";
    fs.writeFileSync(completionFile, `${JSON.stringify(divergentCompletion, null, 2)}\n`);
    assert.throws(() => loadRunArtifact({
      sourceRoot: fixtureRoot,
      reportPath,
    }));
    fs.writeFileSync(completionFile, originalCompletion);

    const markdownFile = path.join(
      fixtureRoot,
      "evals",
      "reports",
      "synthetic",
      "runs",
      report.run_id,
      "report.md",
    );
    const originalMarkdown = fs.readFileSync(markdownFile, "utf8");
    fs.rmSync(markdownFile);
    assert.throws(() => loadRunArtifact({
      sourceRoot: fixtureRoot,
      reportPath,
    }));
    fs.writeFileSync(markdownFile, originalMarkdown);
    assert.throws(() => loadRunArtifact({
      sourceRoot: fixtureRoot,
      reportPath: "../outside/report.json",
    }));

    const incompleteReport = structuredClone(report);
    incompleteReport.run_id = "statistics-standard-better-incomplete-cli";
    incompleteReport.complete = false;
    incompleteReport.incomplete_reasons = ["external-evidence-unavailable"];
    const incompletePublication = publishRun({
      sourceRoot: fixtureRoot,
      report: incompleteReport,
    });
    const incompleteComparison = compareRunReport({
      sourceRoot: fixtureRoot,
      reportPath: incompletePublication.files.json,
      loadContracts: () => contracts,
    });
    assert.equal(incompleteComparison.exitCode, SYNTHETIC_CLI_EXIT.failure);
    assert.equal(incompleteComparison.output.status, "incomplete_evidence");
    assert.equal(incompleteComparison.output.comparison_artifacts.completion, null);

    const outsideRoot = path.join(fixtureRoot, "outside-project");
    const attackRoot = path.join(fixtureRoot, "attack-project");
    fs.mkdirSync(outsideRoot);
    fs.mkdirSync(attackRoot);
    const outsidePublication = publishRun({
      sourceRoot: outsideRoot,
      report,
    });
    const linkedRunsRoot = path.join(
      attackRoot,
      "evals",
      "reports",
      "synthetic",
      "runs",
    );
    fs.mkdirSync(linkedRunsRoot, { recursive: true });
    fs.symlinkSync(
      path.join(outsideRoot, "evals", "reports", "synthetic", "runs", report.run_id),
      path.join(linkedRunsRoot, report.run_id),
      process.platform === "win32" ? "junction" : "dir",
    );
    assert.throws(() => loadRunArtifact({
      sourceRoot: attackRoot,
      reportPath: outsidePublication.files.json,
    }));

    const scriptsRoot = path.join(fixtureRoot, "scripts");
    fs.mkdirSync(scriptsRoot, { recursive: true });
    fs.writeFileSync(
      path.join(scriptsRoot, "env-check.mjs"),
      [
        "const keys = [\"OPENCODE_BENCH_MODEL\", \"OPENCODE_BENCH_PROVIDER\", \"OPENCODE_BENCH_VARIANT\"];",
        "const secrets = keys.some((key) => Object.hasOwn(process.env, key)) ? \"present\" : \"absent\";",
        "const isolated = process.env.OPENCODE_BENCH_MODEL_FREE === \"1\" ? \"isolated\" : \"unisolated\";",
        "process.stdout.write(`${secrets}:${isolated}`);",
        "",
      ].join("\n"),
    );
    const environmentCheck = executeModelFreeCheck({
      sourceRoot: fixtureRoot,
      script: "scripts/env-check.mjs",
      timeoutMs: 5_000,
      environment: {
        ...process.env,
        OPENCODE_BENCH_MODEL: "must-not-leak",
        OPENCODE_BENCH_PROVIDER: "must-not-leak",
        OPENCODE_BENCH_VARIANT: "must-not-leak",
      },
    });
    assert.equal(environmentCheck.exitCode, 0);
    assert.equal(environmentCheck.stdout, "absent:isolated");

    const selfTestReport = await runSyntheticModelFreeSelfTest({
      sourceRoot: fixtureRoot,
      executor: async () => passingExecution(
        "secret=must-not-be-persisted",
        "C:\\private\\must-not-be-persisted",
      ),
      clock: () => new Date(FIXED_TIME),
      idFactory: () => "model-free-cli-pass",
    });
    validateSyntheticModelFreeSelfTestReport(selfTestReport);
    assert.equal(selfTestReport.complete, true);
    assert.equal(selfTestReport.check_count, DEFAULT_MODEL_FREE_CHECKS.length);
    assert.equal(selfTestReport.model_execution, false);
    assert.equal(JSON.stringify(selfTestReport).includes("must-not-be-persisted"), false);
    const contradictoryPassedSelfTest = structuredClone(selfTestReport);
    contradictoryPassedSelfTest.checks[0].exit_code = 1;
    assert.throws(
      () => validateSyntheticModelFreeSelfTestReport(contradictoryPassedSelfTest),
      (error) => error?.code === "SYNTHETIC_SELF_TEST_STATUS",
    );
    assert.throws(() => publishSyntheticModelFreeSelfTestReport({
      sourceRoot: fixtureRoot,
      report: contradictoryPassedSelfTest,
      relativeRoot: "self-tests-invalid",
    }));
    const truncatedSelfTest = structuredClone(selfTestReport);
    truncatedSelfTest.checks.pop();
    truncatedSelfTest.check_count -= 1;
    assert.throws(
      () => validateSyntheticModelFreeSelfTestReport(truncatedSelfTest),
      (error) => error?.code === "SYNTHETIC_SELF_TEST_CHECKS",
    );
    assert.throws(() => publishSyntheticModelFreeSelfTestReport({
      sourceRoot: fixtureRoot,
      report: truncatedSelfTest,
      relativeRoot: "self-tests-truncated",
    }));
    const selfTestPublication = publishSyntheticModelFreeSelfTestReport({
      sourceRoot: fixtureRoot,
      report: selfTestReport,
      relativeRoot: "self-tests",
    });
    assert.deepEqual(publishSyntheticModelFreeSelfTestReport({
      sourceRoot: fixtureRoot,
      report: selfTestReport,
      relativeRoot: "self-tests",
    }), selfTestPublication);
    assert.equal(
      fs.existsSync(path.join(fixtureRoot, selfTestPublication.files.completion)),
      true,
    );
    await assert.rejects(() => runSyntheticModelFreeSelfTest({
      sourceRoot: fixtureRoot,
      checks: [{ id: "CON", script: "scripts/env-check.mjs" }],
      executor: async () => passingExecution(),
      clock: () => new Date(FIXED_TIME),
      idFactory: () => "model-free-invalid-check",
    }));
    await assert.rejects(() => runSyntheticModelFreeSelfTest({
      sourceRoot: fixtureRoot,
      executor: async () => passingExecution(),
      clock: () => new Date(FIXED_TIME),
      idFactory: () => "CON",
    }));
    const failedSelfTest = await runSyntheticModelFreeSelfTest({
      sourceRoot: fixtureRoot,
      executor: async () => ({
        ...passingExecution(),
        exitCode: 1,
      }),
      clock: () => new Date(FIXED_TIME),
      idFactory: () => "model-free-cli-fail",
    });
    const failedSelfTestPublication = publishSyntheticModelFreeSelfTestReport({
      sourceRoot: fixtureRoot,
      report: failedSelfTest,
      relativeRoot: "self-tests",
    });
    assert.equal(failedSelfTest.complete, false);
    assert.equal(failedSelfTestPublication.files.completion, null);
    const contradictoryFailedSelfTest = structuredClone(failedSelfTest);
    contradictoryFailedSelfTest.checks[0].exit_code = 0;
    assert.throws(
      () => validateSyntheticModelFreeSelfTestReport(contradictoryFailedSelfTest),
      (error) => error?.code === "SYNTHETIC_SELF_TEST_STATUS",
    );
    const timedOutSelfTest = await runSyntheticModelFreeSelfTest({
      sourceRoot: fixtureRoot,
      executor: async () => ({
        exitCode: null,
        signal: "SIGTERM",
        stdout: "",
        stderr: "",
        errorCode: "ETIMEDOUT",
        durationMs: 5_000,
      }),
      clock: () => new Date(FIXED_TIME),
      idFactory: () => "model-free-cli-timeout",
    });
    assert.equal(timedOutSelfTest.checks[0].status, "timed_out");
    assert.equal(timedOutSelfTest.checks[0].exit_code, null);
    const spawnFailedSelfTest = await runSyntheticModelFreeSelfTest({
      sourceRoot: fixtureRoot,
      executor: async () => ({
        exitCode: null,
        signal: null,
        stdout: "",
        stderr: "",
        errorCode: "ENOENT",
        durationMs: 1,
      }),
      clock: () => new Date(FIXED_TIME),
      idFactory: () => "model-free-cli-spawn",
    });
    assert.equal(spawnFailedSelfTest.checks[0].status, "spawn_failed");
    assert.equal(spawnFailedSelfTest.checks[0].exit_code, null);
    assert.equal(
      fs.existsSync(path.join(
        fixtureRoot,
        "self-tests",
        "runs",
        failedSelfTest.run_id,
        "completion.json",
      )),
      false,
    );

    const familyId = contracts.families[0].id;
    let staleAttemptCalls = 0;
    await assert.rejects(() => runSyntheticReplay({
      sourceRoot: root,
      familyId,
      seed: "replay-stale-seed",
      semanticVariantIndex: 1,
      trajectoryRepetition: 1,
      profileId: "plain",
      instanceFingerprint:
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      model: "fixture/model",
      provider: "fixture",
      runProfileAttempt: async () => {
        staleAttemptCalls += 1;
        throw new Error("stale replay unexpectedly executed");
      },
    }), (error) => error?.code === "SYNTHETIC_REPLAY_STALE_FINGERPRINT");
    assert.equal(staleAttemptCalls, 0);

    await assert.rejects(() => runSyntheticReplay({
      sourceRoot: root,
      familyId,
      seed: "replay-timeout-mismatch",
      semanticVariantIndex: 1,
      trajectoryRepetition: 1,
      profileId: "plain",
      model: "fixture/model",
      provider: "fixture",
      timeoutMs: 60_000,
      runProfileAttempt: async (input) => {
        const attempt = replayAttempt(input);
        attempt.binding.timeout_ms = 90_000;
        return attempt;
      },
      clock: () => new Date(FIXED_TIME),
      idFactory: () => "replay-timeout-mismatch",
    }), (error) => error?.code === "SYNTHETIC_REPORT_BINDING");

    const successfulReplay = await runSyntheticReplay({
      sourceRoot: root,
      familyId,
      seed: "replay-success-seed",
      semanticVariantIndex: 1,
      trajectoryRepetition: 1,
      profileId: "plain",
      model: "fixture/model",
      provider: "fixture",
      runProfileAttempt: async (input) => replayAttempt(input),
      clock: () => new Date(FIXED_TIME),
      idFactory: () => "replay-cli-success",
    });
    validateSyntheticReplayReport(successfulReplay.report);
    validateSyntheticReplayReportSourceBinding(successfulReplay.report, { sourceRoot: root });
    assert.equal(Object.isFrozen(successfulReplay.report), true);
    assert.equal(Object.isFrozen(successfulReplay.report.attempt), true);
    assert.equal(Object.isFrozen(successfulReplay.report.attempt.binding), true);
    assert.equal(Object.isFrozen(successfulReplay.report.attempt.result.metrics), true);
    assert.equal(successfulReplay.report.model_execution_confirmed, true);
    assert.equal(
      JSON.stringify(successfulReplay.report).includes("fixture/model"),
      false,
    );
    const suppressedDefectEscapeReplay = structuredClone(successfulReplay.report);
    Object.assign(suppressedDefectEscapeReplay.attempt.result, {
      claimed_completion: false,
      hidden_check: {
        status: "failed",
        passed: false,
        violations: ["hidden_regression"],
      },
      hidden_safety_failed: true,
      task_correct: false,
      whole_task_success: false,
      defect_escape_v2: false,
    });
    Object.assign(suppressedDefectEscapeReplay, {
      claimed_completion: false,
      task_correct: false,
      whole_task_success: false,
      result_fingerprint: fingerprint(suppressedDefectEscapeReplay.attempt.result),
    });
    assert.throws(
      () => validateSyntheticReplayReport(suppressedDefectEscapeReplay),
      (error) => error?.code === "SYNTHETIC_REPORT_OUTCOME",
    );
    const completeNegativeReplay = await runSyntheticReplay({
      sourceRoot: root,
      familyId,
      seed: "replay-complete-negative-seed",
      semanticVariantIndex: 1,
      trajectoryRepetition: 1,
      profileId: "plain",
      model: "fixture/model",
      provider: "fixture",
      runProfileAttempt: async (input) => completeNegativeReplayAttempt(input),
      clock: () => new Date(FIXED_TIME),
      idFactory: () => "replay-cli-complete-negative",
    });
    validateSyntheticReplayReport(completeNegativeReplay.report);
    validateSyntheticReplayReportSourceBinding(completeNegativeReplay.report, { sourceRoot: root });
    assert.equal(completeNegativeReplay.report.model_execution_confirmed, true);
    assert.equal(completeNegativeReplay.report.adapter_completed_correctly, false);
    assert.equal(completeNegativeReplay.report.evidence_complete, true);
    assert.equal(completeNegativeReplay.report.whole_task_success, false);
    assert.equal(completeNegativeReplay.report.execution_status, "failed");
    assert.equal(completeNegativeReplay.report.reason, "opencode_missing_final");
    const unconfirmedNegativeReplay = structuredClone(completeNegativeReplay.report);
    unconfirmedNegativeReplay.model_execution_confirmed = false;
    assert.throws(
      () => validateSyntheticReplayReport(unconfirmedNegativeReplay),
      (error) => error?.code === "SYNTHETIC_REPLAY_EVIDENCE",
    );
    const unsupportedExecutionConfirmation = structuredClone(completeNegativeReplay.report);
    unsupportedExecutionConfirmation.evidence_complete = false;
    assert.throws(
      () => validateSyntheticReplayReport(unsupportedExecutionConfirmation),
      (error) => error?.code === "SYNTHETIC_REPLAY_EVIDENCE",
    );
    const malformedAttemptReplay = structuredClone(successfulReplay.report);
    malformedAttemptReplay.attempt = null;
    assert.throws(
      () => validateSyntheticReplayReport(malformedAttemptReplay),
      (error) => error?.code === "SYNTHETIC_REPLAY_SHAPE",
    );
    const detachedResultReplay = structuredClone(successfulReplay.report);
    detachedResultReplay.attempt.result.metrics.total_tool_call_count += 1;
    detachedResultReplay.attempt.result.metrics.task_action_call_count += 1;
    assert.throws(
      () => validateSyntheticReplayReport(detachedResultReplay),
      (error) => error?.code === "SYNTHETIC_REPLAY_EVIDENCE",
    );
    const mismatchedRunReplay = structuredClone(successfulReplay.report);
    mismatchedRunReplay.attempt.result.operational_run_id = "replay-cli-other";
    mismatchedRunReplay.result_fingerprint = fingerprint(mismatchedRunReplay.attempt.result);
    assert.throws(
      () => validateSyntheticReplayReport(mismatchedRunReplay),
      (error) => error?.code === "SYNTHETIC_REPORT_BINDING",
    );
    const contradictoryInitialReplay = structuredClone(successfulReplay.report);
    contradictoryInitialReplay.attempt.binding.initial_public_manifest_fingerprint =
      "sha256:0000000000000000000000000000000000000000000000000000000000000000";
    assert.throws(
      () => validateSyntheticReplayReport(contradictoryInitialReplay),
      (error) => error?.code === "SYNTHETIC_REPORT_BINDING",
    );
    const invalidTimeoutReplay = structuredClone(successfulReplay.report);
    invalidTimeoutReplay.attempt.binding.timeout_ms = 59_999;
    assert.throws(
      () => validateSyntheticReplayReport(invalidTimeoutReplay),
      (error) => error?.code === "SYNTHETIC_REPORT_TIMEOUT",
    );
    const staleInputReplay = structuredClone(successfulReplay.report);
    staleInputReplay.attempt.binding.effective_public_input_fingerprint =
      "sha256:0000000000000000000000000000000000000000000000000000000000000000";
    validateSyntheticReplayReport(staleInputReplay);
    assert.throws(
      () => validateSyntheticReplayReportSourceBinding(staleInputReplay, { sourceRoot: root }),
      (error) => error?.code === "SYNTHETIC_REPLAY_SOURCE_BINDING",
    );
    const staleLimitsReplay = structuredClone(successfulReplay.report);
    staleLimitsReplay.attempt.binding.limits_fingerprint =
      "sha256:0000000000000000000000000000000000000000000000000000000000000000";
    validateSyntheticReplayReport(staleLimitsReplay);
    assert.throws(
      () => validateSyntheticReplayReportSourceBinding(staleLimitsReplay, { sourceRoot: root }),
      (error) => error?.code === "SYNTHETIC_REPLAY_SOURCE_BINDING",
    );
    const staleProfileReplay = structuredClone(successfulReplay.report);
    staleProfileReplay.profile_fingerprint =
      "sha256:0000000000000000000000000000000000000000000000000000000000000000";
    staleProfileReplay.attempt.result.profile_fingerprint =
      staleProfileReplay.profile_fingerprint;
    staleProfileReplay.result_fingerprint = fingerprint(staleProfileReplay.attempt.result);
    validateSyntheticReplayReport(staleProfileReplay);
    assert.throws(
      () => validateSyntheticReplayReportSourceBinding(staleProfileReplay, { sourceRoot: root }),
      (error) => error?.code === "SYNTHETIC_REPLAY_SOURCE_BINDING",
    );
    const staleAdapterReplay = structuredClone(successfulReplay.report);
    staleAdapterReplay.attempt.result.fingerprints.adapter =
      "sha256:0000000000000000000000000000000000000000000000000000000000000000";
    staleAdapterReplay.result_fingerprint = fingerprint(staleAdapterReplay.attempt.result);
    validateSyntheticReplayReport(staleAdapterReplay);
    assert.throws(
      () => validateSyntheticReplayReportSourceBinding(staleAdapterReplay, { sourceRoot: root }),
      (error) => error?.code === "SYNTHETIC_REPLAY_SOURCE_BINDING",
    );
    const legacyReplay = structuredClone(successfulReplay.report);
    legacyReplay.schema_version = 1;
    legacyReplay.repetition = legacyReplay.trajectory_repetition;
    for (const field of ["semantic_variant_index", "semantic_variant_id", "semantic_variant_fingerprint", "trajectory_id", "trajectory_fingerprint", "trajectory_repetition"]) delete legacyReplay[field];
    delete legacyReplay.profile_fingerprint;
    delete legacyReplay.task_correct;
    delete legacyReplay.claimed_completion;
    delete legacyReplay.false_block;
    delete legacyReplay.attempt;
    validateSyntheticReplayReport(legacyReplay);
    assert.throws(
      () => validateSyntheticReplayReportSourceBinding(legacyReplay, { sourceRoot: root }),
      (error) => error?.code === "SYNTHETIC_REPLAY_SOURCE_BINDING",
    );
    const legacyV2Replay = structuredClone(successfulReplay.report);
    legacyV2Replay.schema_version = 2;
    legacyV2Replay.repetition = legacyV2Replay.trajectory_repetition;
    for (const field of ["semantic_variant_index", "semantic_variant_id", "semantic_variant_fingerprint", "trajectory_id", "trajectory_fingerprint", "trajectory_repetition"]) delete legacyV2Replay[field];
    delete legacyV2Replay.claimed_completion;
    delete legacyV2Replay.false_block;
    validateSyntheticReplayReport(legacyV2Replay);
    assert.throws(
      () => validateSyntheticReplayReportSourceBinding(legacyV2Replay, { sourceRoot: root }),
      (error) => error?.code === "SYNTHETIC_REPLAY_SOURCE_BINDING",
    );
    const contradictoryReplay = structuredClone(successfulReplay.report);
    contradictoryReplay.model_execution_confirmed = false;
    contradictoryReplay.adapter_completed_correctly = false;
    assert.throws(
      () => validateSyntheticReplayReport(contradictoryReplay),
      (error) => error?.code === "SYNTHETIC_REPLAY_EVIDENCE",
    );
    assert.throws(() => publishSyntheticReplayReport({
      sourceRoot: fixtureRoot,
      contractSourceRoot: root,
      report: contradictoryReplay,
      relativeRoot: "replays-invalid",
    }));
    assert.equal(fs.existsSync(path.join(fixtureRoot, "replays-invalid")), false);
    const replayPublication = publishSyntheticReplayReport({
      sourceRoot: fixtureRoot,
      contractSourceRoot: root,
      report: successfulReplay.report,
      relativeRoot: "replays",
    });
    assert.deepEqual(publishSyntheticReplayReport({
      sourceRoot: fixtureRoot,
      contractSourceRoot: root,
      report: successfulReplay.report,
      relativeRoot: "replays",
    }), replayPublication);
    assert.equal(fs.existsSync(path.join(fixtureRoot, replayPublication.files.completion)), true);

    const requestedReplay = {
      sourceRoot: fixtureRoot,
      contractSourceRoot: root,
      familyId,
      seed: successfulReplay.report.seed,
      semanticVariantIndex: successfulReplay.report.semantic_variant_index,
      trajectoryRepetition: successfulReplay.report.trajectory_repetition,
      profileId: successfulReplay.report.profile_id,
      instanceFingerprint: successfulReplay.report.instance_fingerprint,
      model: "fixture/model",
      provider: "fixture",
      variant: null,
      timeoutMs: successfulReplay.report.attempt.binding.timeout_ms,
    };
    const differentFamily = contracts.families.find((entry) => entry.id !== familyId).id;
    const replayRequestMismatches = [
      { familyId: differentFamily },
      { seed: "different-replay-seed" },
      { trajectoryRepetition: 2 },
      { profileId: "profile-only" },
      {
        instanceFingerprint:
          "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      },
      { model: "fixture/other-model" },
      { provider: "other-provider" },
      { variant: "other-variant" },
      { timeoutMs: 90_000 },
    ];
    for (const mismatch of replayRequestMismatches) {
      let publishCalls = 0;
      await assert.rejects(
        () => replaySyntheticBenchmarkWorkflow({
          ...requestedReplay,
          ...mismatch,
          runReplay: async () => successfulReplay,
          publishReplay: () => {
            publishCalls += 1;
            throw new Error("mismatched replay must not publish");
          },
        }),
        (error) => error?.code === "SYNTHETIC_CLI_REPLAY_BINDING",
      );
      assert.equal(publishCalls, 0);
    }

    const completeNegativeWorkflow = await replaySyntheticBenchmarkWorkflow({
      sourceRoot: fixtureRoot,
      contractSourceRoot: root,
      familyId,
      seed: completeNegativeReplay.report.seed,
      semanticVariantIndex: completeNegativeReplay.report.semantic_variant_index,
      trajectoryRepetition: completeNegativeReplay.report.trajectory_repetition,
      profileId: completeNegativeReplay.report.profile_id,
      instanceFingerprint: completeNegativeReplay.report.instance_fingerprint,
      model: "fixture/model",
      provider: "fixture",
      variant: null,
      timeoutMs: completeNegativeReplay.report.attempt.binding.timeout_ms,
      runReplay: async () => completeNegativeReplay,
      publishReplay: ({ sourceRoot, contractSourceRoot, report: replayReport }) =>
        publishSyntheticReplayReport({
          sourceRoot,
          contractSourceRoot,
          report: replayReport,
          relativeRoot: "replays-complete-negative",
        }),
    });
    assert.equal(completeNegativeWorkflow.exitCode, SYNTHETIC_CLI_EXIT.success);
    assert.equal(completeNegativeWorkflow.output.status, "failed");
    assert.equal(completeNegativeWorkflow.output.evidence_complete, true);
    assert.equal(completeNegativeWorkflow.output.whole_task_success, false);
    assert.equal(
      fs.existsSync(path.join(
        fixtureRoot,
        completeNegativeWorkflow.output.replay_artifacts.completion,
      )),
      true,
    );

    const blockedReplay = await runSyntheticReplay({
      sourceRoot: root,
      familyId,
      seed: "replay-blocked-seed",
      semanticVariantIndex: 1,
      trajectoryRepetition: 1,
      profileId: "instrumented",
      model: "fixture/model",
      provider: "fixture",
      timeoutMs: 60_000,
      runProfileAttempt: async (input) => replayAttempt(input, {
        status: "blocked_external_state",
        terminationReason: "blocked_external_state",
        reason: "opencode_unavailable",
        adapterCompleted: false,
        evidenceComplete: false,
        wholeTaskSuccess: false,
      }),
      clock: () => new Date(FIXED_TIME),
      idFactory: () => "replay-cli-blocked",
    });
    assert.equal(blockedReplay.report.model_execution_confirmed, false);
    const contradictoryBlockedReplay = structuredClone(blockedReplay.report);
    contradictoryBlockedReplay.evidence_complete = true;
    assert.throws(
      () => validateSyntheticReplayReport(contradictoryBlockedReplay),
      (error) => error?.code === "SYNTHETIC_REPLAY_EVIDENCE",
    );
    const replayWorkflow = await replaySyntheticBenchmarkWorkflow({
      sourceRoot: fixtureRoot,
      contractSourceRoot: root,
      familyId,
      seed: "replay-blocked-seed",
      semanticVariantIndex: 1,
      trajectoryRepetition: 1,
      profileId: "instrumented",
      instanceFingerprint: null,
      model: "fixture/model",
      provider: "fixture",
      variant: null,
      timeoutMs: 60_000,
      runReplay: async () => blockedReplay,
      publishReplay: ({ sourceRoot, contractSourceRoot, report: replayReport }) =>
        publishSyntheticReplayReport({
          sourceRoot,
          contractSourceRoot,
          report: replayReport,
          relativeRoot: "replays",
        }),
    });
    assert.equal(replayWorkflow.exitCode, SYNTHETIC_CLI_EXIT.blocked_external_state);
    assert.equal(replayWorkflow.output.replay_artifacts.completion, null);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

if (
  process.argv[1]
    && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await verifyBenchmarkCli();
  process.stdout.write("Synthetic benchmark CLI/replay/self-test checks passed.\n");
}
