import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  DEFAULT_MODEL_FREE_CHECKS,
  MODEL_FREE_AGGREGATE_OVERHEAD_MS,
  MODEL_FREE_AGGREGATE_STAGE_TIMEOUT_MS,
  MODEL_FREE_AGGREGATE_TIMEOUT_CEILING_MS,
  MODEL_FREE_CHECK_COUNT,
  MODEL_FREE_CHECK_TIMEOUT_MS,
  MODEL_FREE_SERIAL_INNER_BUDGET_MS,
  SYNTHETIC_MODEL_FREE_CONTAINMENT_CHECK_IDS,
  SYNTHETIC_MODEL_FREE_CONTAINMENT_ENVIRONMENT_KEYS,
  SYNTHETIC_MODEL_FREE_ENVIRONMENT_MARKER,
  SYNTHETIC_MODEL_FREE_FORBIDDEN_ENVIRONMENT_KEYS,
  modelFreeAggregateStageTimeoutMs,
} from "../lib/benchmark/model-free-manifest.mjs";
import {
  SYNTHETIC_MODEL_FREE_FAILURE_DIAGNOSTIC_MAX_BYTES,
  createSyntheticModelFreeDiagnosticAccumulator,
  formatSyntheticModelFreeFailureDiagnostic,
  runSyntheticModelFreeSelfTest,
  sanitizeSyntheticModelFreeFailureDiagnostic,
  syntheticModelFreeCheckEnvironment,
  validateSyntheticModelFreeFailureDiagnosticEnvelope,
} from "../lib/benchmark/self-test.mjs";
import {
  DEFAULT_DETERMINISTIC_STAGE_TIMEOUT_MS,
  DETERMINISTIC_VERIFY_WORKFLOW_JOB_TIMEOUT_MS,
  DETERMINISTIC_STAGE_REGISTRY,
  MAX_DETERMINISTIC_VERIFY_BUDGET_MS,
  MODEL_FREE_COORDINATOR_ENTRY,
  deterministicStageExecutionClass,
  deterministicStageInvocation,
  deterministicStageTimeoutMs,
  modelFreeCoordinatorStageEnvironment,
  runModelFreeCoordinatorCommand,
} from "./verify-all.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(root, relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8").replace(/^\uFEFF/u, "");
}

export async function verifyBenchmarkModelFreeContract({ root = defaultRoot } = {}) {
  const packageJson = JSON.parse(read(root, "package.json"));
  const expectedChecks = [
    ["benchmark-model-free-contract", "scripts/verify-benchmark-model-free-contract.mjs"],
    ["benchmark-evaluation-contracts", "scripts/verify-benchmark-evaluation-contracts.mjs"],
    ["benchmark-renderer", "scripts/verify-benchmark-renderer.mjs"],
    ["benchmark-isolation", "scripts/verify-benchmark-isolation.mjs"],
    ["benchmark-adapter", "scripts/verify-benchmark-adapter.mjs"],
    ["benchmark-runner", "scripts/verify-benchmark-runner.mjs"],
    ["benchmark-reporting", "scripts/verify-benchmark-reporting.mjs"],
    ["benchmark-statistics", "scripts/verify-benchmark-statistics.mjs"],
    ["benchmark-comparison-reporting", "scripts/verify-benchmark-comparison-reporting.mjs"],
    ["benchmark-cli", "scripts/verify-benchmark-cli.mjs"],
    ["benchmark-ci", "scripts/verify-benchmark-ci.mjs"],
  ];
  assert.deepEqual(DEFAULT_MODEL_FREE_CHECKS.map(({ id, script }) => [id, script]), expectedChecks);
  assert.equal(new Set(DEFAULT_MODEL_FREE_CHECKS.map((check) => check.id)).size, expectedChecks.length);
  assert.equal(new Set(DEFAULT_MODEL_FREE_CHECKS.map((check) => check.script)).size, expectedChecks.length);
  assert.deepEqual(
    SYNTHETIC_MODEL_FREE_CONTAINMENT_CHECK_IDS,
    ["benchmark-runner"],
    "only the production runner verifier may receive containment coordinates",
  );
  assert.equal(
    MODEL_FREE_CHECK_TIMEOUT_MS,
    300_000,
    "each model-free verifier needs finite headroom above the production runner regression duration",
  );
  assert.equal(MODEL_FREE_CHECK_COUNT, DEFAULT_MODEL_FREE_CHECKS.length);
  assert.equal(
    MODEL_FREE_SERIAL_INNER_BUDGET_MS,
    MODEL_FREE_CHECK_TIMEOUT_MS * DEFAULT_MODEL_FREE_CHECKS.length,
  );
  assert.equal(
    MODEL_FREE_AGGREGATE_STAGE_TIMEOUT_MS,
    MODEL_FREE_SERIAL_INNER_BUDGET_MS + MODEL_FREE_AGGREGATE_OVERHEAD_MS,
  );
  assert(MODEL_FREE_AGGREGATE_STAGE_TIMEOUT_MS >= MODEL_FREE_SERIAL_INNER_BUDGET_MS);
  assert(MODEL_FREE_AGGREGATE_STAGE_TIMEOUT_MS <= MODEL_FREE_AGGREGATE_TIMEOUT_CEILING_MS);
  assert.equal(
    modelFreeAggregateStageTimeoutMs({ checkCount: DEFAULT_MODEL_FREE_CHECKS.length + 1 }),
    MODEL_FREE_AGGREGATE_STAGE_TIMEOUT_MS + MODEL_FREE_CHECK_TIMEOUT_MS,
    "manifest cardinality must mechanically change the aggregate budget",
  );
  for (const { script } of DEFAULT_MODEL_FREE_CHECKS) {
    assert.equal(fs.statSync(path.join(root, ...script.split("/"))).isFile(), true, script);
  }
  assert.equal(
    packageJson.scripts?.["verify:benchmark:model-free"],
    "node scripts/verify-benchmark-model-free.mjs",
  );
  assert.equal(packageJson.scripts?.["preverify:benchmark:model-free"], undefined);
  assert.equal(packageJson.scripts?.["postverify:benchmark:model-free"], undefined);
  const aggregateSource = read(root, "scripts/verify-benchmark-model-free.mjs");
  assert.match(
    aggregateSource,
    /await runSyntheticModelFreeSelfTest\(\{\s*sourceRoot: root,\s*failureReporter: diagnosticWriter,\s*\}\)/u,
  );
  assert.equal(
    [...aggregateSource.matchAll(/await runSyntheticModelFreeSelfTest\(/gu)].length,
    1,
    "the aggregate must execute the canonical self-test exactly once",
  );
  const aggregateStages = DETERMINISTIC_STAGE_REGISTRY.filter(
    (stage) => stage.npm_script === "verify:benchmark:model-free",
  );
  assert.equal(aggregateStages.length, 1, "model-free aggregate must occur exactly once in npm run verify");
  assert.deepEqual(aggregateStages[0].check_ids, []);
  const coordinatorInvocation = deterministicStageInvocation(aggregateStages[0], {
    sourceRoot: root,
    environment: { npm_execpath: "/poison/npm-cli.js" },
  });
  assert.equal(coordinatorInvocation.file, process.execPath);
  assert.deepEqual(coordinatorInvocation.args, [
    fs.realpathSync.native(path.join(root, ...MODEL_FREE_COORDINATOR_ENTRY.split("/"))),
  ]);
  assert(!coordinatorInvocation.args.includes("/poison/npm-cli.js"));
  const ordinaryInvocation = deterministicStageInvocation({ npm_script: "verify:static" }, {
    sourceRoot: root,
    environment: { npm_execpath: "/trusted/npm-cli.js" },
  });
  assert.deepEqual(ordinaryInvocation, {
    file: process.execPath,
    args: ["/trusted/npm-cli.js", "run", "verify:static"],
  });
  assert.equal(
    deterministicStageExecutionClass(aggregateStages[0]),
    "model-free-coordinator",
  );
  assert.equal(deterministicStageExecutionClass({ npm_script: "verify:static" }), "managed");
  assert.throws(() => deterministicStageExecutionClass({
    ...aggregateStages[0],
    execution_class: "managed",
  }));
  assert.throws(() => deterministicStageExecutionClass({
    npm_script: "verify:static",
    execution_class: "model-free-coordinator",
  }));
  assert.equal(
    deterministicStageTimeoutMs(aggregateStages[0]),
    MODEL_FREE_AGGREGATE_STAGE_TIMEOUT_MS,
  );
  assert.throws(() => deterministicStageTimeoutMs({
    ...aggregateStages[0],
    timeout_ms: MODEL_FREE_SERIAL_INNER_BUDGET_MS - 1,
  }));
  assert.throws(() => deterministicStageTimeoutMs({
    command_id: "ordinary",
    npm_script: "verify:static",
    check_ids: [],
    timeout_ms: MODEL_FREE_AGGREGATE_STAGE_TIMEOUT_MS,
  }));
  assert.equal(
    deterministicStageTimeoutMs({ npm_script: "verify:static" }),
    DEFAULT_DETERMINISTIC_STAGE_TIMEOUT_MS,
  );
  assert.equal(
    DETERMINISTIC_STAGE_REGISTRY.some(
      (stage) => stage.npm_script.startsWith("verify:benchmark:")
        && stage.npm_script !== "verify:benchmark:model-free",
    ),
    false,
    "individual benchmark verifiers must not also be deterministic stages",
  );
  const harnessSource = read(root, "scripts/verify-harness.mjs");
  assert.doesNotMatch(harnessSource, /from "\.\/verify-benchmark-(?:adapter|ci|cli|comparison-reporting|contracts|renderer|reporting|runner|statistics)\.mjs"/u);
  const selfTestSource = read(root, "lib/benchmark/self-test.mjs");
  const verifyAllSource = read(root, "scripts/verify-all.mjs");
  const verifyWorkflow = read(root, ".github/workflows/verify.yml");
  assert.match(selfTestSource, /checks = DEFAULT_MODEL_FREE_CHECKS/u);
  assert.match(selfTestSource, /for \(const check of normalizedChecks\)/u);
  assert.equal(selfTestSource.includes("300_000"), false, "self-test must not duplicate the timeout value");
  assert(selfTestSource.includes("MODEL_FREE_CHECK_TIMEOUT_MS"));
  assert(verifyAllSource.includes("MODEL_FREE_AGGREGATE_STAGE_TIMEOUT_MS"));
  assert(
    360 * 60 * 1000 === DETERMINISTIC_VERIFY_WORKFLOW_JOB_TIMEOUT_MS
      && DETERMINISTIC_VERIFY_WORKFLOW_JOB_TIMEOUT_MS > MAX_DETERMINISTIC_VERIFY_BUDGET_MS,
    "the explicit GitHub job limit must exceed the bounded full verify budget",
  );
  for (const job of ["verify", "macos-containment"]) {
    assert.match(
      verifyWorkflow,
      new RegExp(`^  ${job}:\\n(?:    .+\\n){0,4}    timeout-minutes: 360$`, "mu"),
      `${job} must retain an explicit six-hour job budget`,
    );
  }
  assert(selfTestSource.includes(`result[SYNTHETIC_MODEL_FREE_ENVIRONMENT_MARKER] = "1"`));
  for (const key of SYNTHETIC_MODEL_FREE_FORBIDDEN_ENVIRONMENT_KEYS) {
    assert(selfTestSource.includes("SYNTHETIC_MODEL_FREE_FORBIDDEN_ENVIRONMENT_KEYS"), key);
  }
  const containmentFixture = Object.fromEntries(
    SYNTHETIC_MODEL_FREE_CONTAINMENT_ENVIRONMENT_KEYS.map((key, index) => [
      key,
      `/runner-owned/containment-${index + 1}`,
    ]),
  );
  const environmentFixture = {
    HOME: root,
    PATH: process.env.PATH ?? "",
    KEEP_ME: "ordinary-stage-value",
    OPENCODE_QUALITY_CGROUP_POISON: "/poison/cgroup",
    OPENCODE_QUALITY_MACOS_POISON: "/poison/controller",
    OPENCODE_BENCH_MODEL: "forbidden/model",
    OPENCODE_BENCH_PROVIDER: "forbidden",
    OPENCODE_BENCH_VARIANT: "forbidden",
    ...containmentFixture,
  };
  const coordinatorEnvironment = modelFreeCoordinatorStageEnvironment(environmentFixture);
  assert.equal(coordinatorEnvironment.KEEP_ME, "ordinary-stage-value");
  assert.equal(coordinatorEnvironment[SYNTHETIC_MODEL_FREE_ENVIRONMENT_MARKER], "1");
  assert.deepEqual(
    Object.fromEntries(SYNTHETIC_MODEL_FREE_CONTAINMENT_ENVIRONMENT_KEYS.map((key) => [
      key,
      coordinatorEnvironment[key],
    ])),
    containmentFixture,
  );
  assert.equal(coordinatorEnvironment.OPENCODE_QUALITY_CGROUP_POISON, undefined);
  assert.equal(coordinatorEnvironment.OPENCODE_QUALITY_MACOS_POISON, undefined);
  for (const key of SYNTHETIC_MODEL_FREE_FORBIDDEN_ENVIRONMENT_KEYS) {
    assert.equal(coordinatorEnvironment[key], undefined);
  }
  const checkEnvironment = syntheticModelFreeCheckEnvironment(environmentFixture);
  assert.equal(checkEnvironment.KEEP_ME, undefined, "check environments must retain strong bootstrap sanitation");
  assert.equal(
    checkEnvironment.PATH,
    path.dirname(process.execPath),
    "model-free checks may resolve only the current trusted Node distribution from PATH",
  );
  assert.equal(checkEnvironment[SYNTHETIC_MODEL_FREE_ENVIRONMENT_MARKER], "1");
  for (const key of SYNTHETIC_MODEL_FREE_CONTAINMENT_ENVIRONMENT_KEYS) {
    assert.equal(checkEnvironment[key], undefined);
  }
  const containedCheckEnvironment = syntheticModelFreeCheckEnvironment(environmentFixture, {
    includeContainment: true,
  });
  assert.deepEqual(
    Object.fromEntries(SYNTHETIC_MODEL_FREE_CONTAINMENT_ENVIRONMENT_KEYS.map((key) => [
      key,
      containedCheckEnvironment[key],
    ])),
    containmentFixture,
  );
  for (const key of SYNTHETIC_MODEL_FREE_FORBIDDEN_ENVIRONMENT_KEYS) {
    assert.equal(checkEnvironment[key], undefined);
  }
  const secretCanary = "FAKE_API_TOKEN=diagnostic-secret-canary";
  const absoluteCanary = "/private/diagnostic/path";
  const fileUrlCanary = "file:///Users/private/diagnostic.mjs:10:2";
  const formattedDiagnostic = formatSyntheticModelFreeFailureDiagnostic({
    checkId: "benchmark-runner",
    status: "failed",
    exitCode: 1,
    signal: null,
    timedOut: false,
    errorCode: null,
    stderr: `assertion marker\n${secretCanary}\n${absoluteCanary}\n${fileUrlCanary}\n\u001b[31mcolored\u001b[0m\u0000tail marker\n::error file=foo.js,line=1::forged annotation\n::add-mask::attacker-mask\n-----BEGIN PRIVATE KEY-----\nprivate-key-body-canary\n-----END PRIVATE KEY-----`,
  });
  assert(formattedDiagnostic.includes("model-free check benchmark-runner failed"));
  assert(formattedDiagnostic.includes("assertion marker"));
  assert(formattedDiagnostic.includes("colored?tail marker"));
  assert(formattedDiagnostic.includes("[redacted]"));
  assert(!formattedDiagnostic.includes(secretCanary));
  assert(!formattedDiagnostic.includes(absoluteCanary));
  assert(!formattedDiagnostic.includes(fileUrlCanary));
  assert(formattedDiagnostic.includes("[redacted-path]"));
  assert(!formattedDiagnostic.includes("\u001b"));
  assert(!formattedDiagnostic.includes("\u0000"));
  assert(!formattedDiagnostic.includes("private-key-body-canary"));
  assert(!formattedDiagnostic.includes("::error"));
  assert(!formattedDiagnostic.includes("::add-mask"));
  assert(formattedDiagnostic.split("\n").every(
    (line) => line.startsWith("[model-free-diagnostic] ")
      || line === "[...model-free diagnostic truncated...]",
  ));
  const longAssignmentCanary = "assignment-value-canary";
  const longAssignment = sanitizeSyntheticModelFreeFailureDiagnostic(
    `FAKE_API_TOKEN=${longAssignmentCanary.repeat(8_000)}`,
  );
  assert(longAssignment.includes("[redacted]"));
  assert(!longAssignment.includes(longAssignmentCanary));
  const pemDiagnostic = sanitizeSyntheticModelFreeFailureDiagnostic(
    "-----BEGIN PRIVATE KEY-----\npem-body-canary\n-----END PRIVATE KEY-----",
  );
  assert(!pemDiagnostic.includes("pem-body-canary"));
  assert(pemDiagnostic.split("\n").every((line) => line.startsWith("[model-free-diagnostic] ")));
  for (const armorLabel of [
    "ENCRYPTED PRIVATE KEY",
    "DSA PRIVATE KEY",
    "PGP PRIVATE KEY BLOCK",
    "PGP SECRET KEY BLOCK",
  ]) {
    const bodyCanary = `armor-body-canary-${armorLabel.replaceAll(" ", "-")}`;
    const armorDiagnostic = formatSyntheticModelFreeFailureDiagnostic({
      checkId: "benchmark-runner",
      status: "failed",
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorCode: null,
      stderr: `-----BEGIN ${armorLabel}-----\n${bodyCanary}\n-----END ${armorLabel}-----`,
    });
    assert(!armorDiagnostic.includes(bodyCanary));
    const armorAccumulator = createSyntheticModelFreeDiagnosticAccumulator();
    armorAccumulator.append(`${armorDiagnostic}\n`);
    assert.equal(
      validateSyntheticModelFreeFailureDiagnosticEnvelope(armorAccumulator.value()),
      armorDiagnostic,
    );
  }
  const oversizedDiagnostic = sanitizeSyntheticModelFreeFailureDiagnostic(
    Array.from({ length: 128 }, (_, index) => `safe-line-${index}-${"x".repeat(1024)}`).join("\n"),
  );
  assert(Buffer.byteLength(oversizedDiagnostic, "utf8") <= SYNTHETIC_MODEL_FREE_FAILURE_DIAGNOSTIC_MAX_BYTES);
  assert(oversizedDiagnostic.includes("[...model-free diagnostic truncated...]"));

  const accumulator = createSyntheticModelFreeDiagnosticAccumulator({ maxBytes: 1024 });
  accumulator.append(Buffer.from("head-marker\n", "utf8"));
  for (let index = 0; index < 128; index += 1) {
    accumulator.append(Buffer.from(`stream-${index}-${"x".repeat(256)}\n`, "utf8"));
  }
  accumulator.append(Buffer.from("tail-marker", "utf8"));
  const accumulatorStats = accumulator.stats();
  assert.equal(accumulatorStats.max_bytes, 1024);
  assert(accumulatorStats.total_bytes > accumulatorStats.max_bytes);
  assert(accumulatorStats.stored_bytes <= accumulatorStats.max_bytes);
  assert.equal(accumulatorStats.truncated, true);
  assert(accumulator.value().includes("head-marker"));
  assert(accumulator.value().includes("tail-marker"));
  assert(accumulator.value().includes("[...model-free diagnostic truncated...]"));
  const chunkInvariantPayload = Buffer.from(
    `single-head-${"z".repeat(256 * 1024)}-single-tail`,
    "utf8",
  );
  const singleChunkAccumulator = createSyntheticModelFreeDiagnosticAccumulator({ maxBytes: 1024 });
  singleChunkAccumulator.append(chunkInvariantPayload);
  const fragmentedAccumulator = createSyntheticModelFreeDiagnosticAccumulator({ maxBytes: 1024 });
  for (let offset = 0; offset < chunkInvariantPayload.length; offset += 37) {
    fragmentedAccumulator.append(chunkInvariantPayload.subarray(offset, offset + 37));
  }
  assert.equal(singleChunkAccumulator.value(), fragmentedAccumulator.value());
  assert(singleChunkAccumulator.stats().stored_bytes <= 1024);
  assert(fragmentedAccumulator.stats().stored_bytes <= 1024);
  const safeEnvelopeAccumulator = createSyntheticModelFreeDiagnosticAccumulator();
  safeEnvelopeAccumulator.append(Buffer.from(`${formattedDiagnostic}\n`, "utf8"));
  assert.equal(
    validateSyntheticModelFreeFailureDiagnosticEnvelope(safeEnvelopeAccumulator.value()),
    formattedDiagnostic,
  );
  for (const unsafeEnvelope of [
    `FAKE_API_TOKEN=${"assignment-value-canary".repeat(8_000)}`,
    `${"prefix".repeat(16_000)}\n-----BEGIN PRIVATE KEY-----\npem-envelope-body-canary\n-----END PRIVATE KEY-----`,
    "::error file=foo.js,line=1::forged annotation",
    "[model-free-diagnostic] /private/envelope/path",
    "[model-free-diagnostic] safe\rFORGED",
    "[model-free-diagnostic] safe\tFORGED",
    "[model-free-diagnostic] safe\u061CFORGED",
    "[model-free-diagnostic] safe\u200EFORGED",
    "[model-free-diagnostic] safe\u200FFORGED",
    "[model-free-diagnostic] safe\u202EFORGED",
    "[model-free-diagnostic] safe\u2067FORGED",
  ]) {
    const unsafeAccumulator = createSyntheticModelFreeDiagnosticAccumulator();
    unsafeAccumulator.append(Buffer.from(unsafeEnvelope, "utf8"));
    const validated = validateSyntheticModelFreeFailureDiagnosticEnvelope(unsafeAccumulator.value());
    assert(validated.includes("failure diagnostic unavailable"));
    assert(!validated.includes("assignment-value-canary"));
    assert(!validated.includes("pem-envelope-body-canary"));
    assert(!validated.includes("::error"));
    assert(!validated.includes("/private/envelope/path"));
  }

  const reportedFailures = [];
  const containmentOptions = [];
  const failedSelfTest = await runSyntheticModelFreeSelfTest({
    sourceRoot: root,
    executor: async ({ script, includeContainment }) => {
      containmentOptions.push([script, includeContainment]);
      const failed = script === "scripts/verify-benchmark-runner.mjs";
      return {
        exitCode: failed ? 1 : 0,
        signal: null,
        stdout: "",
        stderr: failed ? "runner assertion marker" : "successful stderr must stay silent",
        errorCode: null,
        durationMs: 1,
      };
    },
    failureReporter: (diagnostic) => reportedFailures.push(diagnostic),
  });
  assert.equal(failedSelfTest.complete, false);
  assert.equal(reportedFailures.length, 1);
  assert(reportedFailures[0].includes("benchmark-runner failed"));
  assert(reportedFailures[0].includes("runner assertion marker"));
  assert.deepEqual(
    containmentOptions.filter(([, includeContainment]) => includeContainment).map(([script]) => script),
    ["scripts/verify-benchmark-runner.mjs"],
  );

  const coordinatorStage = aggregateStages[0];
  const successfulCoordinator = await runModelFreeCoordinatorCommand({
    stage: coordinatorStage,
    file: process.execPath,
    args: ["-e", "process.stderr.write('successful diagnostic must stay hidden')"],
    cwd: root,
    env: syntheticModelFreeCheckEnvironment(),
    timeout: 5_000,
    maxOutputChars: 4 * 1024 * 1024,
  });
  assert.equal(successfulCoordinator.status, 0);
  assert.equal(successfulCoordinator.failure_diagnostic, null);
  const failedCoordinator = await runModelFreeCoordinatorCommand({
    stage: coordinatorStage,
    file: process.execPath,
    args: ["-e", `process.stderr.write(${JSON.stringify(`${formattedDiagnostic}\n`)}); process.exit(3)`],
    cwd: root,
    env: syntheticModelFreeCheckEnvironment(),
    timeout: 5_000,
    maxOutputChars: 4 * 1024 * 1024,
  });
  assert.equal(failedCoordinator.status, 3);
  assert(failedCoordinator.failure_diagnostic.includes("model-free check benchmark-runner failed"));
  assert(Buffer.byteLength(failedCoordinator.failure_diagnostic, "utf8") <= SYNTHETIC_MODEL_FREE_FAILURE_DIAGNOSTIC_MAX_BYTES);
  const unsafeLargeCoordinator = await runModelFreeCoordinatorCommand({
    stage: coordinatorStage,
    file: process.execPath,
    args: ["-e", "for (let index = 0; index < 128; index += 1) process.stderr.write(`unsafe-tail-${index}-${'x'.repeat(1024)}\\n`); process.exit(4)"],
    cwd: root,
    env: syntheticModelFreeCheckEnvironment(),
    timeout: 5_000,
    maxOutputChars: 4 * 1024 * 1024,
  });
  assert.equal(unsafeLargeCoordinator.status, 4);
  assert(unsafeLargeCoordinator.failure_diagnostic.includes("failure diagnostic unavailable"));
  assert(!unsafeLargeCoordinator.failure_diagnostic.includes("unsafe-tail"));
  const timedOutCoordinator = await runModelFreeCoordinatorCommand({
    stage: coordinatorStage,
    file: process.execPath,
    args: ["-e", "setInterval(() => {}, 1_000)"],
    cwd: root,
    env: syntheticModelFreeCheckEnvironment(),
    timeout: 50,
    maxOutputChars: 4 * 1024 * 1024,
  });
  assert.equal(timedOutCoordinator.status, null);
  assert.equal(timedOutCoordinator.timed_out, true);
  assert.equal(timedOutCoordinator.teardown_verified, false);
  const adapterSource = read(root, "lib/benchmark/opencode-adapter.mjs");
  const profilesSource = read(root, "lib/benchmark/profiles.mjs");
  assert.match(
    profilesSource,
    /TRUSTED_TOOLCHAIN_HOST_CONFIG_FILENAME,[\s\S]{0,800}flag: "wx",\s*mode: 0o600,[\s\S]{0,500}configurationMode === 0o600/u,
    "synthetic host toolchain configuration must not inherit a group-writable host umask",
  );
  assert(adapterSource.includes(`sourceEnvironment.${SYNTHETIC_MODEL_FREE_ENVIRONMENT_MARKER} === "1"`));
  assert.match(
    adapterSource,
    /sourceEnvironment\.OPENCODE_BENCH_MODEL_FREE === "1"[\s\S]{0,160}executable === null[\s\S]{0,160}resolvedExecutableIdentity === undefined/u,
  );
  assert.equal(DEFAULT_MODEL_FREE_CHECKS.some(({ script }) => [
    "scripts/benchmark-synthetic.mjs",
    "scripts/benchmark-synthetic-replay.mjs",
    "scripts/verify-benchmark-model-free.mjs",
  ].includes(script)), false);
  return { check_count: expectedChecks.length, aggregate_stage_count: aggregateStages.length };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = await verifyBenchmarkModelFreeContract();
  process.stdout.write(`Synthetic model-free manifest verified (${result.check_count} checks; exactly one aggregate stage).\n`);
}
