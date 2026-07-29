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
import {
  publishSyntheticReplayReport,
  runSyntheticReplay,
  syntheticModelBindingFingerprint,
  validateSyntheticReplayReport,
} from "../lib/benchmark/replay.mjs";
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

function replayResult({
  status = "completed",
  terminationReason = "verified",
  reason = null,
  adapterCompleted = true,
  evidenceComplete = true,
  wholeTaskSuccess = true,
} = {}) {
  return {
    execution_status: status,
    termination_reason: terminationReason,
    reason,
    adapter_completed_correctly: adapterCompleted,
    evidence_complete: evidenceComplete,
    whole_task_success: wholeTaskSuccess,
  };
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
    id: "benchmark-evaluation-contracts",
    script: "scripts/verify-benchmark-evaluation-contracts.mjs",
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
      repetitions: report.suite.repetitions,
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
        "process.stdout.write(keys.some((key) => Object.hasOwn(process.env, key)) ? \"present\" : \"absent\");",
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
    assert.equal(environmentCheck.stdout, "absent");

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
      repetition: 1,
      profileId: "plain",
      instanceFingerprint:
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      model: "fixture/model",
      provider: "fixture",
      runProfileAttempt: async () => {
        staleAttemptCalls += 1;
        return { result: replayResult() };
      },
    }), (error) => error?.code === "SYNTHETIC_REPLAY_STALE_FINGERPRINT");
    assert.equal(staleAttemptCalls, 0);

    const successfulReplay = await runSyntheticReplay({
      sourceRoot: root,
      familyId,
      seed: "replay-success-seed",
      repetition: 1,
      profileId: "plain",
      model: "fixture/model",
      provider: "fixture",
      runProfileAttempt: async () => ({ result: replayResult() }),
      clock: () => new Date(FIXED_TIME),
      idFactory: () => "replay-cli-success",
    });
    validateSyntheticReplayReport(successfulReplay.report);
    assert.equal(successfulReplay.report.model_execution_confirmed, true);
    assert.equal(
      JSON.stringify(successfulReplay.report).includes("fixture/model"),
      false,
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
      report: contradictoryReplay,
      relativeRoot: "replays-invalid",
    }));
    const replayPublication = publishSyntheticReplayReport({
      sourceRoot: fixtureRoot,
      report: successfulReplay.report,
      relativeRoot: "replays",
    });
    assert.deepEqual(publishSyntheticReplayReport({
      sourceRoot: fixtureRoot,
      report: successfulReplay.report,
      relativeRoot: "replays",
    }), replayPublication);
    assert.equal(fs.existsSync(path.join(fixtureRoot, replayPublication.files.completion)), true);

    const blockedReplay = await runSyntheticReplay({
      sourceRoot: root,
      familyId,
      seed: "replay-blocked-seed",
      repetition: 1,
      profileId: "instrumented",
      model: "fixture/model",
      provider: "fixture",
      runProfileAttempt: async () => ({
        result: replayResult({
          status: "blocked_external_state",
          terminationReason: "blocked_external_state",
          reason: "opencode_unavailable",
          adapterCompleted: false,
          evidenceComplete: false,
          wholeTaskSuccess: false,
        }),
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
      familyId,
      seed: "replay-blocked-seed",
      repetition: 1,
      profileId: "instrumented",
      instanceFingerprint: null,
      model: "fixture/model",
      provider: "fixture",
      variant: null,
      timeoutMs: 60_000,
      runReplay: async () => blockedReplay,
      publishReplay: ({ sourceRoot, report: replayReport }) =>
        publishSyntheticReplayReport({
          sourceRoot,
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
