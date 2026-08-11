import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";

import {
  ContractError,
  assertSafeId,
  canonicalJson,
  fingerprint,
} from "../feedback/contracts.mjs";
import { assertConfinedExistingPath } from "../feedback/files.mjs";
import {
  SYNTHETIC_AGENT_TIMEOUT_MAX_MS,
  SYNTHETIC_AGENT_TIMEOUT_MIN_MS,
  assertPortableContractPath,
  loadSyntheticContracts,
  resolveRepositoryEntry,
} from "./contracts.mjs";
import {
  publishSyntheticComparisonArtifacts,
} from "./comparison-reporting.mjs";
import {
  loadSyntheticTemplateSet,
  renderSyntheticInstance,
  replaySyntheticInstance,
} from "./renderer.mjs";
import {
  DEFAULT_SYNTHETIC_ARTIFACT_ROOT,
  publishSyntheticRunArtifacts,
  renderSyntheticRunCsv,
  renderSyntheticRunMarkdown,
  validateSyntheticRunReport,
  validateSyntheticRunReportSourceBinding,
} from "./reporting.mjs";
import {
  publishSyntheticReplayReport,
  runSyntheticReplay,
  syntheticModelBindingFingerprint,
  validateSyntheticReplayReportSourceBinding,
} from "./replay.mjs";
import {
  DEFAULT_SYNTHETIC_AGENT_TIMEOUT_MS,
  runSyntheticPairedBenchmark,
} from "./runner.mjs";
import {
  DEFAULT_SYNTHETIC_SHARD_ROOT,
  loadSyntheticShardReportArtifact,
  mergeSyntheticShardArtifacts,
  prepareSyntheticBenchmarkMatrix,
  runSyntheticShardWorkflow,
} from "./sharding.mjs";
import {
  DEFAULT_MODEL_FREE_SELF_TEST_ROOT,
  publishSyntheticModelFreeSelfTestReport,
  runSyntheticModelFreeSelfTest,
} from "./self-test.mjs";
import { validateSyntheticSuiteProfilePair } from "./suite-plan.mjs";
import { analyzeSyntheticRunReport } from "./statistics.mjs";
import { syntheticModelJobBudget } from "./workflow-budget.mjs";

export const SYNTHETIC_CLI_EXIT = Object.freeze({
  success: 0,
  failure: 1,
  blocked_external_state: 2,
});

const MAX_REPORT_BYTES = 16 * 1024 * 1024;
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;

const USAGE = Object.freeze({
  run: [
    "Usage: npm run bench:synthetic -- --suite <micro|smoke|standard|full> --baseline <profile> --candidate <profile> --seed <seed> [--semantic-variants <1-5>] [--trajectory-repetitions <1-5>] [--model <id>] [--provider <id>] [--variant <id>] [--timeout-ms <60000-3600000>]",
    "Model selection is host-owned: use --model or OPENCODE_BENCH_MODEL.",
    "The per-attempt timeout defaults to 300000 ms; long quality lifecycles should set it explicitly.",
  ].join("\n"),
  compare: "Usage: npm run bench:synthetic:compare -- --report <repo-relative-report.json>",
  runValidate: "Usage: npm run bench:synthetic:report:validate -- --report <repo-relative-report.json>",
  prepare: "Usage: npm run bench:synthetic:prepare -- --suite <micro|smoke|standard|full> --baseline <profile> --candidate <profile> --seed <seed> [--timeout-ms <60000-3600000>]",
  shard: "Usage: npm run bench:synthetic:shard -- --suite <standard|full> --family <family> --baseline <profile> --candidate <profile> --seed <seed> [--model <id>] [--provider <id>] [--variant <id>] [--timeout-ms <60000-3600000>]",
  shardValidate: "Usage: npm run bench:synthetic:shard:validate -- --report <repo-relative-shard-report.json>",
  merge: "Usage: npm run bench:synthetic:merge -- --suite <standard|full> --baseline <profile> --candidate <profile> --seed <seed> [--shards <repo-relative-directory>]",
  replay: [
    "Usage: npm run bench:synthetic:replay -- --family <id> --seed <seed> --profile <profile> [--semantic-variant-index <1-5>] [--trajectory-repetition <1-5>] [--instance-fingerprint <sha256:...>] [--model <id>] [--provider <id>] [--variant <id>] [--timeout-ms <60000-3600000>]",
    "Model selection is host-owned: use --model or OPENCODE_BENCH_MODEL.",
    "The replay timeout defaults to 300000 ms; pass the original run timeout for an exact execution binding.",
  ].join("\n"),
  validate: "Usage: npm run bench:synthetic:validate",
  selfTest: "Usage: npm run bench:synthetic:self-test",
});

export class SyntheticCliUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "SyntheticCliUsageError";
    this.code = "SYNTHETIC_CLI_USAGE";
  }
}

export class SyntheticCliExternalStateError extends Error {
  constructor(reason) {
    super("Synthetic benchmark model configuration is unavailable.");
    this.name = "SyntheticCliExternalStateError";
    this.code = "SYNTHETIC_CLI_BLOCKED_EXTERNAL_STATE";
    this.reason = reason;
  }
}

function fail(code, message) {
  throw new ContractError(code, message);
}

function expect(condition, code, message) {
  if (!condition) fail(code, message);
}

function exact(value, keys, label) {
  expect(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "SYNTHETIC_CLI_SHAPE",
    `${label} must be an object`,
  );
  expect(
    canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort()),
    "SYNTHETIC_CLI_SHAPE",
    `${label} keys are invalid`,
  );
}

function requiredOption(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new SyntheticCliUsageError(`--${name} is required`);
  }
  return value;
}

function boundedSingleLine(value, name, {
  nullable = false,
  maximum = 256,
} = {}) {
  if (nullable && value === null) return value;
  if (
    typeof value !== "string"
      || value.length < 1
      || value.length > maximum
      || /[\0\r\n]/u.test(value)
  ) {
    throw new SyntheticCliUsageError(`--${name} is invalid`);
  }
  return value;
}

function safeIdOption(value, name) {
  const normalized = boundedSingleLine(value, name, { maximum: 128 });
  try {
    return assertSafeId(normalized, name);
  } catch {
    throw new SyntheticCliUsageError(`--${name} is invalid`);
  }
}

function integerOption(value, name, {
  minimum,
  maximum,
  fallback = null,
} = {}) {
  if (value === undefined) return fallback;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new SyntheticCliUsageError(`--${name} must be an integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new SyntheticCliUsageError(`--${name} is outside its allowed range`);
  }
  return parsed;
}

function canonicalRoot(sourceRoot) {
  const resolved = path.resolve(sourceRoot);
  const root = fs.realpathSync.native(resolved);
  expect(root === resolved, "SYNTHETIC_CLI_ROOT", "sourceRoot must be physically canonical");
  return root;
}

function modelBinding(values, environment, { required = true } = {}) {
  const model = values.model ?? environment.OPENCODE_BENCH_MODEL;
  if (required && (typeof model !== "string" || model.length === 0)) {
    throw new SyntheticCliExternalStateError("model_not_configured");
  }
  const optionalBinding = (optionName, environmentName) => {
    if (values[optionName] !== undefined) {
      return boundedSingleLine(values[optionName], optionName, {
        nullable: true,
        maximum: 128,
      });
    }
    const environmentValue = environment[environmentName];
    if (environmentValue === undefined || environmentValue === null || environmentValue === "") {
      return null;
    }
    return boundedSingleLine(environmentValue, optionName, {
      nullable: true,
      maximum: 128,
    });
  };
  return Object.freeze({
    model: model === undefined || model === null || model === ""
      ? null
      : boundedSingleLine(model, "model"),
    provider: optionalBinding("provider", "OPENCODE_BENCH_PROVIDER"),
    variant: optionalBinding("variant", "OPENCODE_BENCH_VARIANT"),
  });
}

function parseStrict(argv, options) {
  try {
    return parseArgs({
      args: argv,
      options,
      strict: true,
      allowPositionals: false,
    }).values;
  } catch {
    throw new SyntheticCliUsageError("invalid command arguments");
  }
}

export function parseSyntheticCliArguments(command, argv, environment = process.env) {
  if (!Array.isArray(argv) || argv.some((entry) => typeof entry !== "string")) {
    throw new SyntheticCliUsageError("arguments must be strings");
  }
  if (command === "run") {
    const values = parseStrict(argv, {
      suite: { type: "string", default: "smoke" },
      baseline: { type: "string", default: "plain" },
      candidate: { type: "string", default: "instrumented" },
      seed: { type: "string" },
      "semantic-variants": { type: "string" },
      "trajectory-repetitions": { type: "string" },
      model: { type: "string" },
      provider: { type: "string" },
      variant: { type: "string" },
      "timeout-ms": { type: "string" },
      help: { type: "boolean", default: false },
    });
    if (values.help) return Object.freeze({ help: true });
    return Object.freeze({
      help: false,
      suiteId: safeIdOption(values.suite, "suite"),
      baselineProfileId: safeIdOption(values.baseline, "baseline"),
      candidateProfileId: safeIdOption(values.candidate, "candidate"),
      seed: safeIdOption(requiredOption(values.seed, "seed"), "seed"),
      semanticVariants: integerOption(values["semantic-variants"], "semantic-variants", {
        minimum: 1,
        maximum: 5,
      }),
      trajectoryRepetitions: integerOption(values["trajectory-repetitions"], "trajectory-repetitions", {
        minimum: 1,
        maximum: 5,
      }),
      timeoutMs: integerOption(values["timeout-ms"], "timeout-ms", {
        minimum: SYNTHETIC_AGENT_TIMEOUT_MIN_MS,
        maximum: SYNTHETIC_AGENT_TIMEOUT_MAX_MS,
        fallback: DEFAULT_SYNTHETIC_AGENT_TIMEOUT_MS,
      }),
      ...modelBinding(values, environment, { required: false }),
    });
  }
  if (command === "prepare") {
    const values = parseStrict(argv, {
      suite: { type: "string", default: "smoke" },
      baseline: { type: "string", default: "plain" },
      candidate: { type: "string", default: "instrumented" },
      seed: { type: "string" },
      "timeout-ms": { type: "string" },
      help: { type: "boolean", default: false },
    });
    if (values.help) return Object.freeze({ help: true });
    return Object.freeze({
      help: false,
      suiteId: safeIdOption(values.suite, "suite"),
      baselineProfileId: safeIdOption(values.baseline, "baseline"),
      candidateProfileId: safeIdOption(values.candidate, "candidate"),
      seed: safeIdOption(requiredOption(values.seed, "seed"), "seed"),
      timeoutMs: integerOption(values["timeout-ms"], "timeout-ms", {
        minimum: SYNTHETIC_AGENT_TIMEOUT_MIN_MS,
        maximum: SYNTHETIC_AGENT_TIMEOUT_MAX_MS,
        fallback: DEFAULT_SYNTHETIC_AGENT_TIMEOUT_MS,
      }),
    });
  }
  if (command === "shard") {
    const values = parseStrict(argv, {
      suite: { type: "string" },
      family: { type: "string" },
      baseline: { type: "string", default: "plain" },
      candidate: { type: "string", default: "instrumented" },
      seed: { type: "string" },
      model: { type: "string" },
      provider: { type: "string" },
      variant: { type: "string" },
      "timeout-ms": { type: "string" },
      help: { type: "boolean", default: false },
    });
    if (values.help) return Object.freeze({ help: true });
    return Object.freeze({
      help: false,
      suiteId: safeIdOption(requiredOption(values.suite, "suite"), "suite"),
      familyId: safeIdOption(requiredOption(values.family, "family"), "family"),
      baselineProfileId: safeIdOption(values.baseline, "baseline"),
      candidateProfileId: safeIdOption(values.candidate, "candidate"),
      seed: safeIdOption(requiredOption(values.seed, "seed"), "seed"),
      timeoutMs: integerOption(values["timeout-ms"], "timeout-ms", {
        minimum: SYNTHETIC_AGENT_TIMEOUT_MIN_MS,
        maximum: SYNTHETIC_AGENT_TIMEOUT_MAX_MS,
        fallback: DEFAULT_SYNTHETIC_AGENT_TIMEOUT_MS,
      }),
      ...modelBinding(values, environment),
    });
  }
  if (command === "shardValidate") {
    const values = parseStrict(argv, {
      report: { type: "string" },
      help: { type: "boolean", default: false },
    });
    if (values.help) return Object.freeze({ help: true });
    return Object.freeze({ help: false, reportPath: requiredOption(values.report, "report") });
  }
  if (command === "merge") {
    const values = parseStrict(argv, {
      suite: { type: "string" },
      baseline: { type: "string", default: "plain" },
      candidate: { type: "string", default: "instrumented" },
      seed: { type: "string" },
      shards: { type: "string", default: DEFAULT_SYNTHETIC_SHARD_ROOT },
      help: { type: "boolean", default: false },
    });
    if (values.help) return Object.freeze({ help: true });
    return Object.freeze({
      help: false,
      suiteId: safeIdOption(requiredOption(values.suite, "suite"), "suite"),
      baselineProfileId: safeIdOption(values.baseline, "baseline"),
      candidateProfileId: safeIdOption(values.candidate, "candidate"),
      seed: safeIdOption(requiredOption(values.seed, "seed"), "seed"),
      shardsDirectory: requiredOption(values.shards, "shards"),
    });
  }
  if (command === "compare" || command === "runValidate") {
    const values = parseStrict(argv, {
      report: { type: "string" },
      help: { type: "boolean", default: false },
    });
    if (values.help) return Object.freeze({ help: true });
    return Object.freeze({
      help: false,
      reportPath: requiredOption(values.report, "report"),
    });
  }
  if (command === "replay") {
    const values = parseStrict(argv, {
      family: { type: "string" },
      seed: { type: "string" },
      "semantic-variant-index": { type: "string" },
      "trajectory-repetition": { type: "string" },
      profile: { type: "string" },
      "instance-fingerprint": { type: "string" },
      model: { type: "string" },
      provider: { type: "string" },
      variant: { type: "string" },
      "timeout-ms": { type: "string" },
      help: { type: "boolean", default: false },
    });
    if (values.help) return Object.freeze({ help: true });
    const instanceFingerprint = values["instance-fingerprint"] ?? null;
    if (instanceFingerprint !== null && !FINGERPRINT.test(instanceFingerprint)) {
      throw new SyntheticCliUsageError("--instance-fingerprint is invalid");
    }
    return Object.freeze({
      help: false,
      familyId: safeIdOption(requiredOption(values.family, "family"), "family"),
      seed: safeIdOption(requiredOption(values.seed, "seed"), "seed"),
      semanticVariantIndex: integerOption(values["semantic-variant-index"], "semantic-variant-index", {
        minimum: 1,
        maximum: 5,
        fallback: 1,
      }),
      trajectoryRepetition: integerOption(values["trajectory-repetition"], "trajectory-repetition", {
        minimum: 1,
        maximum: 5,
        fallback: 1,
      }),
      profileId: safeIdOption(requiredOption(values.profile, "profile"), "profile"),
      instanceFingerprint,
      timeoutMs: integerOption(values["timeout-ms"], "timeout-ms", {
        minimum: SYNTHETIC_AGENT_TIMEOUT_MIN_MS,
        maximum: SYNTHETIC_AGENT_TIMEOUT_MAX_MS,
        fallback: DEFAULT_SYNTHETIC_AGENT_TIMEOUT_MS,
      }),
      ...modelBinding(values, environment),
    });
  }
  if (command === "validate" || command === "selfTest") {
    const values = parseStrict(argv, {
      help: { type: "boolean", default: false },
    });
    return Object.freeze({ help: values.help });
  }
  throw new SyntheticCliUsageError("unknown synthetic benchmark command");
}

function sha256Bytes(contents) {
  return `sha256:${createHash("sha256").update(contents, "utf8").digest("hex")}`;
}

function loadJsonFile(file, code) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
  } catch {
    fail(code, "synthetic report JSON is invalid");
  }
  return parsed;
}

export function loadSyntheticRunReportArtifact({
  sourceRoot,
  contractSourceRoot = sourceRoot,
  reportPath,
} = {}) {
  const root = canonicalRoot(sourceRoot);
  assertPortableContractPath(reportPath, "reportPath");
  const reportFile = resolveRepositoryEntry(root, reportPath, {
    expectedKind: "file",
    maxFileBytes: MAX_REPORT_BYTES,
  });
  const report = loadJsonFile(reportFile, "SYNTHETIC_CLI_REPORT_JSON");
  validateSyntheticRunReportSourceBinding(report, {
    sourceRoot: contractSourceRoot,
  });
  const expectedPath = `${DEFAULT_SYNTHETIC_ARTIFACT_ROOT}/runs/${report.run_id}/report.json`;
  expect(
    reportPath === expectedPath,
    "SYNTHETIC_CLI_REPORT_PATH",
    "report path is not the canonical immutable run-report path",
  );
  const runRoot = path.dirname(reportFile);
  const completionPath = path.join(runRoot, "completion.json");
  for (const [artifactPath, expectedContents] of [
    [path.join(runRoot, "report.md"), renderSyntheticRunMarkdown(report)],
    [path.join(runRoot, "pairs.csv"), renderSyntheticRunCsv(report)],
  ]) {
    assertConfinedExistingPath(root, artifactPath, { type: "file" });
    expect(
      fs.statSync(artifactPath).size <= MAX_REPORT_BYTES
        && fs.readFileSync(artifactPath, "utf8") === expectedContents,
      "SYNTHETIC_CLI_REPORT_ARTIFACT",
      "run report sidecar is missing, stale, or tampered",
    );
  }
  if (report.complete) {
    expect(
      fs.existsSync(completionPath),
      "SYNTHETIC_CLI_REPORT_COMPLETION",
      "complete report is missing its completion marker",
    );
    assertConfinedExistingPath(root, completionPath, { type: "file" });
    const completion = loadJsonFile(completionPath, "SYNTHETIC_CLI_REPORT_COMPLETION");
    exact(completion, [
      "schema_version",
      "artifact_kind",
      "run_id",
      "report_fingerprint",
      "created_at",
      "files",
    ], "run completion marker");
    expect(
      completion.schema_version === 1
        && completion.artifact_kind === "synthetic-run-completion"
        && completion.run_id === report.run_id
        && completion.report_fingerprint === fingerprint(report)
        && completion.created_at === report.created_at,
      "SYNTHETIC_CLI_REPORT_COMPLETION",
      "completion marker does not bind the report",
    );
    expect(
      Array.isArray(completion.files)
        && completion.files.length === 3
        && canonicalJson(completion.files.map((entry) => entry?.id))
          === canonicalJson(["json", "markdown", "csv"]),
      "SYNTHETIC_CLI_REPORT_COMPLETION",
      "completion marker does not enumerate the canonical run artifacts",
    );
    const artifactFiles = new Map([
      ["json", reportFile],
      ["markdown", path.join(runRoot, "report.md")],
      ["csv", path.join(runRoot, "pairs.csv")],
    ]);
    for (const [index, entry] of completion.files.entries()) {
      exact(entry, ["id", "fingerprint"], `run completion marker files[${index}]`);
      expect(
        typeof entry.fingerprint === "string" && FINGERPRINT.test(entry.fingerprint),
        "SYNTHETIC_CLI_REPORT_COMPLETION",
        "completion marker contains an invalid artifact fingerprint",
      );
      const artifactFile = artifactFiles.get(entry.id);
      expect(
        artifactFile !== undefined && fs.existsSync(artifactFile),
        "SYNTHETIC_CLI_REPORT_COMPLETION",
        "complete run is missing an immutable artifact",
      );
      assertConfinedExistingPath(root, artifactFile, { type: "file" });
      expect(
        entry.fingerprint === sha256Bytes(fs.readFileSync(artifactFile, "utf8")),
        "SYNTHETIC_CLI_REPORT_COMPLETION",
        "completion marker does not bind the immutable artifact bytes",
      );
    }
  } else {
    expect(
      !fs.existsSync(completionPath),
      "SYNTHETIC_CLI_REPORT_COMPLETION",
      "incomplete report must not have a completion marker",
    );
  }
  return Object.freeze({ report, reportPath });
}

export function validateSyntheticBenchmark({ sourceRoot } = {}) {
  const root = canonicalRoot(sourceRoot);
  const contracts = loadSyntheticContracts(root);
  const templateSet = loadSyntheticTemplateSet(root, contracts);
  const fingerprints = new Set();
  let instanceCount = 0;
  for (const suite of contracts.suites) {
    const seed = `validation-${suite.id}`;
    for (const familyId of suite.family_ids) {
      for (let semanticVariantIndex = 1; semanticVariantIndex <= suite.semantic_variants; semanticVariantIndex += 1) {
        for (let repetition = 1; repetition <= suite.trajectory_repetitions; repetition += 1) {
          const instance = renderSyntheticInstance({
            contracts,
            templateSet,
            familyId,
            seed,
            semanticVariantIndex,
            repetition,
          });
          replaySyntheticInstance({ contracts, templateSet, manifest: instance });
          expect(
            !fingerprints.has(instance.instance_fingerprint),
            "SYNTHETIC_CLI_VALIDATE",
            "validation generated a duplicate instance fingerprint",
          );
          fingerprints.add(instance.instance_fingerprint);
          instanceCount += 1;
        }
      }
    }
  }
  for (const familyId of contracts.families.map((entry) => entry.id)) {
    const first = renderSyntheticInstance({
      contracts,
      templateSet,
      familyId,
      seed: "validation-seed-a",
      repetition: 1,
    });
    const second = renderSyntheticInstance({
      contracts,
      templateSet,
      familyId,
      seed: "validation-seed-b",
      repetition: 1,
    });
    expect(
      first.instance_fingerprint !== second.instance_fingerprint,
      "SYNTHETIC_CLI_VALIDATE",
      `${familyId} does not vary across validation seeds`,
    );
  }
  return Object.freeze({
    status: "passed",
    evidence_class: "model-free-validation",
    model_execution: false,
    schema_version: contracts.schema_version,
    profile_count: contracts.inventory.profiles.length,
    family_count: contracts.families.length,
    suite_count: contracts.suites.length,
    validated_instance_count: instanceCount,
    inventory_fingerprint: contracts.fingerprints.inventory,
    template_set_fingerprint: fingerprint(templateSet),
  });
}

export async function runSyntheticBenchmarkWorkflow({
  sourceRoot,
  contractSourceRoot = sourceRoot,
  suiteId,
  baselineProfileId,
  candidateProfileId,
  seed,
  semanticVariants,
  trajectoryRepetitions,
  model,
  provider,
  variant,
  timeoutMs,
  runPairedBenchmark = runSyntheticPairedBenchmark,
  publishRunArtifacts = publishSyntheticRunArtifacts,
  analyzeRunReport = analyzeSyntheticRunReport,
  publishComparisonArtifacts = publishSyntheticComparisonArtifacts,
  loadContracts = loadSyntheticContracts,
} = {}) {
  const root = canonicalRoot(sourceRoot);
  const contractRoot = canonicalRoot(contractSourceRoot);
  const contracts = loadContracts(contractRoot);
  const suite = validateSyntheticSuiteProfilePair({
    contracts,
    suiteId,
    baselineProfileId,
    candidateProfileId,
  });
  if (semanticVariants !== null && semanticVariants !== undefined) {
    expect(
      semanticVariants === suite.semantic_variants,
      "SYNTHETIC_CLI_SEMANTIC_VARIANTS",
      `suite ${suite.id} requires ${suite.semantic_variants} semantic variants`,
    );
  }
  if (trajectoryRepetitions !== null && trajectoryRepetitions !== undefined) {
    expect(
      trajectoryRepetitions === suite.trajectory_repetitions,
      "SYNTHETIC_CLI_TRAJECTORIES",
      `suite ${suite.id} requires ${suite.trajectory_repetitions} trajectory repetitions`,
    );
  }
  const resolvedModelBinding = modelBinding({ model, provider, variant }, {});
  if (runPairedBenchmark === runSyntheticPairedBenchmark) {
    expect(
      !["standard", "full"].includes(suite.id),
      "SYNTHETIC_CLI_SHARD_REQUIRED",
      `suite ${suite.id} requires family sharding; use bench:synthetic:prepare and bench:synthetic:shard`,
    );
    syntheticModelJobBudget({
      pairCount: suite.family_ids.length * suite.semantic_variants * suite.trajectory_repetitions,
      timeoutMs,
    });
  }
  const report = await runPairedBenchmark({
    sourceRoot: root,
    suiteId,
    seed,
    baselineProfileId,
    candidateProfileId,
    model: resolvedModelBinding.model,
    provider: resolvedModelBinding.provider,
    variant: resolvedModelBinding.variant,
    timeoutMs,
  });
  validateSyntheticRunReportSourceBinding(report, {
    sourceRoot: contractRoot,
  });
  expect(
    report.suite.id === suiteId
      && report.suite.seed === seed
      && report.suite.semantic_variants === suite.semantic_variants
      && report.suite.trajectory_repetitions === suite.trajectory_repetitions
      && report.profiles.baseline.id === baselineProfileId
      && report.profiles.candidate.id === candidateProfileId
      && report.execution.model === resolvedModelBinding.model
      && report.execution.provider === resolvedModelBinding.provider
      && report.execution.variant === resolvedModelBinding.variant
      && report.execution.timeout_ms === timeoutMs,
    "SYNTHETIC_CLI_RUN_BINDING",
    "runner output does not bind the requested comparison",
  );
  const runPublication = publishRunArtifacts({
    sourceRoot: root,
    contractSourceRoot: contractRoot,
    report,
  });
  const comparison = analyzeRunReport({
    report,
    policy: contracts.comparison_policy,
    contractSourceRoot: contractRoot,
  });
  const comparisonPublication = publishComparisonArtifacts({
    sourceRoot: root,
    contractSourceRoot: contractRoot,
    report,
    comparison,
    policy: contracts.comparison_policy,
  });
  const results = report.pairs.flatMap((pair) => [pair.baseline, pair.candidate]);
  const blockedExternal = results.some(
    (entry) => entry.execution_status === "blocked_external_state",
  );
  const exitCode = report.complete
    ? SYNTHETIC_CLI_EXIT.success
    : blockedExternal
      ? SYNTHETIC_CLI_EXIT.blocked_external_state
      : SYNTHETIC_CLI_EXIT.failure;
  return Object.freeze({
    exitCode,
    output: Object.freeze({
      status: report.complete
        ? "completed"
        : blockedExternal
          ? "blocked_external_state"
          : "verification_failed",
      run_id: report.run_id,
      suite: report.suite.id,
      baseline: report.profiles.baseline.id,
      candidate: report.profiles.candidate.id,
      complete: report.complete,
      verdict: comparison.verdict.status,
      model_binding_fingerprint: syntheticModelBindingFingerprint(resolvedModelBinding),
      run_artifacts: runPublication.files,
      comparison_artifacts: comparisonPublication.files,
      incomplete_reasons: report.incomplete_reasons,
    }),
  });
}

export function prepareSyntheticBenchmarkWorkflow({ sourceRoot, ...options } = {}) {
  return Object.freeze({
    exitCode: SYNTHETIC_CLI_EXIT.success,
    output: prepareSyntheticBenchmarkMatrix({ sourceRoot: canonicalRoot(sourceRoot), ...options }),
  });
}

export async function runSyntheticBenchmarkShardWorkflow({ sourceRoot, ...options } = {}) {
  const result = await runSyntheticShardWorkflow({
    sourceRoot: canonicalRoot(sourceRoot),
    ...options,
  });
  const attempts = result.report.pairs.flatMap((pair) => [pair.baseline, pair.candidate]);
  const blockedExternal = attempts.some((attempt) => attempt.execution_status === "blocked_external_state");
  return Object.freeze({
    exitCode: result.report.complete
      ? SYNTHETIC_CLI_EXIT.success
      : blockedExternal
        ? SYNTHETIC_CLI_EXIT.blocked_external_state
        : SYNTHETIC_CLI_EXIT.failure,
    output: Object.freeze({
      status: result.report.complete ? "completed" : blockedExternal ? "blocked_external_state" : "verification_failed",
      shard_id: result.report.shard_id,
      parent_generation_id: result.report.parent_generation_id,
      suite: result.report.suite.id,
      family: result.report.family_id,
      complete: result.report.complete,
      shard_artifacts: result.publication.files,
      budget: result.budget,
      incomplete_reasons: result.report.incomplete_reasons,
    }),
  });
}

export function validateSyntheticBenchmarkShardWorkflow({ sourceRoot, reportPath } = {}) {
  const loaded = loadSyntheticShardReportArtifact({
    sourceRoot: canonicalRoot(sourceRoot),
    reportPath,
  });
  return Object.freeze({
    exitCode: SYNTHETIC_CLI_EXIT.success,
    output: Object.freeze({
      status: "validated",
      shard_id: loaded.report.shard_id,
      parent_generation_id: loaded.report.parent_generation_id,
      family: loaded.report.family_id,
      complete: loaded.report.complete,
      report_fingerprint: fingerprint(loaded.report),
      artifact_files: Object.freeze([
        reportPath,
        ...(loaded.report.complete
          ? [`${path.posix.dirname(reportPath)}/completion.json`]
          : []),
      ]),
    }),
  });
}

export function mergeSyntheticBenchmarkShardWorkflow({
  sourceRoot,
  suiteId,
  seed,
  baselineProfileId,
  candidateProfileId,
  shardsDirectory,
  mergeShards = mergeSyntheticShardArtifacts,
  analyzeRunReport = analyzeSyntheticRunReport,
  publishComparisonArtifacts = publishSyntheticComparisonArtifacts,
  loadContracts = loadSyntheticContracts,
} = {}) {
  const root = canonicalRoot(sourceRoot);
  const merged = mergeShards({
    sourceRoot: root,
    suiteId,
    seed,
    baselineProfileId,
    candidateProfileId,
    shardsDirectory,
  });
  const contracts = loadContracts(root);
  const comparison = analyzeRunReport({
    report: merged.report,
    policy: contracts.comparison_policy,
    contractSourceRoot: root,
  });
  const comparisonPublication = publishComparisonArtifacts({
    sourceRoot: root,
    report: merged.report,
    comparison,
    policy: contracts.comparison_policy,
  });
  return Object.freeze({
    exitCode: SYNTHETIC_CLI_EXIT.success,
    output: Object.freeze({
      status: "completed",
      run_id: merged.report.run_id,
      parent_generation_id: merged.report.generation_id,
      suite: merged.report.suite.id,
      complete: true,
      verdict: comparison.verdict.status,
      run_artifacts: merged.publication.files,
      comparison_artifacts: comparisonPublication.files,
    }),
  });
}

export function compareSyntheticRunReportWorkflow({
  sourceRoot,
  contractSourceRoot = sourceRoot,
  reportPath,
  loadRunArtifact = loadSyntheticRunReportArtifact,
  analyzeRunReport = analyzeSyntheticRunReport,
  publishComparisonArtifacts = publishSyntheticComparisonArtifacts,
  loadContracts = loadSyntheticContracts,
} = {}) {
  const root = canonicalRoot(sourceRoot);
  const contractRoot = canonicalRoot(contractSourceRoot);
  const contracts = loadContracts(contractRoot);
  const { report } = loadRunArtifact({
    sourceRoot: root,
    contractSourceRoot: contractRoot,
    reportPath,
  });
  const comparison = analyzeRunReport({
    report,
    policy: contracts.comparison_policy,
    contractSourceRoot: contractRoot,
  });
  const publication = publishComparisonArtifacts({
    sourceRoot: root,
    contractSourceRoot: contractRoot,
    report,
    comparison,
    policy: contracts.comparison_policy,
  });
  return Object.freeze({
    exitCode: report.complete
      ? SYNTHETIC_CLI_EXIT.success
      : SYNTHETIC_CLI_EXIT.failure,
    output: Object.freeze({
      status: report.complete ? "analyzed" : "incomplete_evidence",
      run_id: report.run_id,
      complete: report.complete,
      verdict: comparison.verdict.status,
      comparison_fingerprint: fingerprint(comparison),
      comparison_artifacts: publication.files,
    }),
  });
}

export function validateSyntheticRunReportArtifactWorkflow({
  sourceRoot,
  contractSourceRoot = sourceRoot,
  reportPath,
  compareRunReport = compareSyntheticRunReportWorkflow,
  ...dependencies
} = {}) {
  const compared = compareRunReport({
    sourceRoot,
    contractSourceRoot,
    reportPath,
    ...dependencies,
  });
  expect(
    compared?.output?.status === (compared.output.complete ? "analyzed" : "incomplete_evidence")
      && compared.exitCode === (compared.output.complete
        ? SYNTHETIC_CLI_EXIT.success
        : SYNTHETIC_CLI_EXIT.failure),
    "SYNTHETIC_CLI_REPORT_VALIDATION",
    "run artifact validation returned contradictory completeness",
  );
  return Object.freeze({
    exitCode: SYNTHETIC_CLI_EXIT.success,
    output: Object.freeze({
      status: "validated",
      run_id: compared.output.run_id,
      complete: compared.output.complete,
      verdict: compared.output.verdict,
      comparison_fingerprint: compared.output.comparison_fingerprint,
      comparison_artifacts: compared.output.comparison_artifacts,
      artifact_files: Object.freeze([...new Set([
        reportPath,
        `${path.posix.dirname(reportPath)}/report.md`,
        `${path.posix.dirname(reportPath)}/pairs.csv`,
        compared.output.complete ? `${path.posix.dirname(reportPath)}/completion.json` : null,
        ...Object.values(compared.output.comparison_artifacts),
      ].filter((entry) => entry !== null))]),
    }),
  });
}

export async function replaySyntheticBenchmarkWorkflow({
  sourceRoot,
  contractSourceRoot = sourceRoot,
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
  runReplay = runSyntheticReplay,
  publishReplay = publishSyntheticReplayReport,
} = {}) {
  const root = canonicalRoot(sourceRoot);
  const contractRoot = canonicalRoot(contractSourceRoot);
  const replay = await runReplay({
    sourceRoot: contractRoot,
    familyId,
    seed,
    semanticVariantIndex,
    trajectoryRepetition,
    profileId,
    instanceFingerprint,
    model,
    provider,
    variant,
    timeoutMs,
  });
  validateSyntheticReplayReportSourceBinding(replay.report, {
    sourceRoot: contractRoot,
  });
  expect(
    replay.report.family_id === familyId
      && replay.report.seed === seed
      && replay.report.semantic_variant_index === semanticVariantIndex
      && replay.report.trajectory_repetition === trajectoryRepetition
      && replay.report.profile_id === profileId
      && (instanceFingerprint === null
        || replay.report.instance_fingerprint === instanceFingerprint)
      && replay.report.model_binding_fingerprint
        === syntheticModelBindingFingerprint({ provider, model, variant })
      && replay.report.attempt.binding.timeout_ms === timeoutMs,
    "SYNTHETIC_CLI_REPLAY_BINDING",
    "replay result differs from the requested execution binding",
  );
  const publication = publishReplay({
    sourceRoot: root,
    contractSourceRoot: contractRoot,
    report: replay.report,
  });
  const exitCode = replay.report.evidence_complete
    ? SYNTHETIC_CLI_EXIT.success
    : replay.report.execution_status === "blocked_external_state"
      ? SYNTHETIC_CLI_EXIT.blocked_external_state
      : SYNTHETIC_CLI_EXIT.failure;
  return Object.freeze({
    exitCode,
    output: Object.freeze({
      status: replay.report.execution_status,
      run_id: replay.report.run_id,
      family: replay.report.family_id,
      profile: replay.report.profile_id,
      instance_fingerprint: replay.report.instance_fingerprint,
      evidence_complete: replay.report.evidence_complete,
      whole_task_success: replay.report.whole_task_success,
      model_binding_fingerprint: replay.report.model_binding_fingerprint,
      replay_artifacts: publication.files,
      reason: replay.report.reason,
    }),
  });
}

export async function executeSyntheticCli({
  command,
  argv,
  sourceRoot,
  environment = process.env,
  dependencies = {},
} = {}) {
  const options = parseSyntheticCliArguments(command, argv, environment);
  if (options.help) {
    return Object.freeze({
      exitCode: SYNTHETIC_CLI_EXIT.success,
      output: USAGE[command],
      plainText: true,
    });
  }
  if (command === "run") {
    return runSyntheticBenchmarkWorkflow({
      sourceRoot,
      ...options,
      ...dependencies.run,
    });
  }
  if (command === "prepare") {
    return prepareSyntheticBenchmarkWorkflow({ sourceRoot, ...options });
  }
  if (command === "shard") {
    return runSyntheticBenchmarkShardWorkflow({
      sourceRoot,
      ...options,
      ...dependencies.shard,
    });
  }
  if (command === "shardValidate") {
    return validateSyntheticBenchmarkShardWorkflow({ sourceRoot, ...options });
  }
  if (command === "merge") {
    return mergeSyntheticBenchmarkShardWorkflow({
      sourceRoot,
      ...options,
      ...dependencies.merge,
    });
  }
  if (command === "compare") {
    return compareSyntheticRunReportWorkflow({
      sourceRoot,
      ...options,
      ...dependencies.compare,
    });
  }
  if (command === "runValidate") {
    return validateSyntheticRunReportArtifactWorkflow({
      sourceRoot,
      ...options,
      ...dependencies.runValidate,
    });
  }
  if (command === "replay") {
    return replaySyntheticBenchmarkWorkflow({
      sourceRoot,
      ...options,
      ...dependencies.replay,
    });
  }
  if (command === "validate") {
    const validator = dependencies.validate ?? validateSyntheticBenchmark;
    return Object.freeze({
      exitCode: SYNTHETIC_CLI_EXIT.success,
      output: validator({ sourceRoot }),
    });
  }
  if (command === "selfTest") {
    const selfTestRunner = dependencies.selfTest?.run ?? runSyntheticModelFreeSelfTest;
    const selfTestPublisher =
      dependencies.selfTest?.publish ?? publishSyntheticModelFreeSelfTestReport;
    const report = await selfTestRunner({
      sourceRoot: canonicalRoot(sourceRoot),
      ...(dependencies.selfTest?.options ?? {}),
    });
    const publication = selfTestPublisher({
      sourceRoot: canonicalRoot(sourceRoot),
      report,
      relativeRoot:
        dependencies.selfTest?.relativeRoot ?? DEFAULT_MODEL_FREE_SELF_TEST_ROOT,
    });
    return Object.freeze({
      exitCode: report.complete
        ? SYNTHETIC_CLI_EXIT.success
        : SYNTHETIC_CLI_EXIT.failure,
      output: Object.freeze({
        status: report.complete ? "passed" : "failed",
        evidence_class: report.evidence_class,
        model_execution: report.model_execution,
        complete: report.complete,
        check_count: report.check_count,
        report_fingerprint: publication.report_fingerprint,
        self_test_artifacts: publication.files,
        residual_caveats: report.residual_caveats,
      }),
    });
  }
  throw new SyntheticCliUsageError("unknown synthetic benchmark command");
}

function errorPayload(error) {
  if (error instanceof SyntheticCliExternalStateError) {
    return {
      exitCode: SYNTHETIC_CLI_EXIT.blocked_external_state,
      stream: "stdout",
      value: {
        status: "blocked_external_state",
        reason: error.reason,
        code: error.code,
      },
    };
  }
  if (error instanceof SyntheticCliUsageError) {
    return {
      exitCode: SYNTHETIC_CLI_EXIT.failure,
      stream: "stderr",
      value: {
        status: "invalid_arguments",
        code: error.code,
        message: error.message,
      },
    };
  }
  if (error instanceof ContractError && (
    error.code === "SYNTHETIC_WORKFLOW_BUDGET"
      || error.code === "SYNTHETIC_CLI_SHARD_REQUIRED"
      || error.code === "SYNTHETIC_CLI_SEMANTIC_VARIANTS"
      || error.code === "SYNTHETIC_CLI_TRAJECTORIES"
      || error.code === "SYNTHETIC_SHARD_WORKFLOW"
      || error.code === "SYNTHETIC_RUNNER_SHARD_SUITE"
      || error.code.startsWith("SYNTHETIC_SUITE_PLAN_")
  )) {
    return {
      exitCode: SYNTHETIC_CLI_EXIT.failure,
      stream: "stderr",
      value: {
        status: "invalid_configuration",
        code: error.code,
        message: error.message,
      },
    };
  }
  return {
    exitCode: SYNTHETIC_CLI_EXIT.failure,
    stream: "stderr",
    value: {
      status: "failed",
      code: typeof error?.code === "string" ? error.code : "SYNTHETIC_CLI_INTERNAL",
      message: "Synthetic benchmark command failed.",
    },
  };
}

export async function runSyntheticCliMain({
  command,
  argv = process.argv.slice(2),
  sourceRoot,
  environment = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  dependencies = {},
} = {}) {
  try {
    const result = await executeSyntheticCli({
      command,
      argv,
      sourceRoot,
      environment,
      dependencies,
    });
    const rendered = result.plainText === true
      ? `${result.output}\n`
      : `${JSON.stringify(result.output, null, 2)}\n`;
    stdout.write(rendered);
    return result.exitCode;
  } catch (error) {
    const payload = errorPayload(error);
    const stream = payload.stream === "stdout" ? stdout : stderr;
    stream.write(`${JSON.stringify(payload.value, null, 2)}\n`);
    return payload.exitCode;
  }
}
