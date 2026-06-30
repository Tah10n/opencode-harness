import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scenarioDir = path.join(root, "evals", "scenarios");
const reportDir = path.join(root, "evals", "reports");
const validateOnly = process.argv.includes("--validate");
const selfTestOnly = process.argv.includes("--self-test");
const failures = [];
const publicScenarioFields = [
  "id",
  "description",
  "risk_tags",
  "repo_fixture",
  "task",
  "setup_commands",
  "visible_checks",
  "timeout",
  "repetitions",
  "expected_contracts",
  "forbidden_regressions",
];
const scenarioFields = new Set([...publicScenarioFields, "hidden_checks", "hidden_check_files"]);
const hiddenCheckFileFields = new Set(["source", "target"]);
const adapterReportFields = [
  "status",
  "passed",
  "ok",
  "success",
  "exitCode",
  "summary",
  "model",
  "durationMs",
  "tokens",
  "cost",
  "metrics",
];

class AdapterTimeoutError extends Error {
  constructor(timeout) {
    super(`adapter timed out after ${timeout}ms`);
    this.name = "AdapterTimeoutError";
  }
}

function fail(code, message, fix) {
  failures.push({ code, message, fix });
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    fail("HARNESS-L001", `${path.relative(root, file)} is not valid JSON: ${error.message}`, "Fix the manifest JSON.");
    return null;
  }
}

function listScenarioFiles() {
  if (!fs.existsSync(scenarioDir)) {
    fail("HARNESS-L002", "evals/scenarios is missing", "Restore the live-evaluation scenario directory.");
    return [];
  }
  return fs
    .readdirSync(scenarioDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(scenarioDir, name))
    .sort();
}

function assertString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    fail("HARNESS-L003", `${label} must be a non-empty string`, "Fill in the required scenario field.");
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function assertStringArray(value, label, { min = 0 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    fail("HARNESS-L004", `${label} must be an array of non-empty strings`, "Use explicit command or contract strings.");
  }
}

function isInside(basePath, targetPath) {
  const relative = path.relative(basePath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isInsideRoot(targetPath) {
  return isInside(root, targetPath);
}

function resolveRepoFixturePath(repoFixture) {
  const fixturePath = path.resolve(root, repoFixture);
  return isInsideRoot(fixturePath) ? fixturePath : null;
}

function resolveRootPath(relativePath) {
  const resolved = path.resolve(root, relativePath);
  return isInsideRoot(resolved) ? resolved : null;
}

function isSafeRelativeTarget(value) {
  if (!isNonEmptyString(value) || path.isAbsolute(value)) {
    return false;
  }
  const segments = value.split(/[\\/]+/).filter(Boolean);
  return segments.length > 0 && !segments.includes("..") && !segments.includes(".");
}

function resolveRepoTarget(repo, target) {
  if (!isSafeRelativeTarget(target)) {
    throw new Error(`hidden_check_files target must be a relative path inside the repo: ${target}`);
  }
  const resolved = path.resolve(repo, target);
  if (!isInside(repo, resolved)) {
    throw new Error(`hidden_check_files target escapes repo: ${target}`);
  }
  return resolved;
}

function publicScenarioForAdapter(scenario) {
  const publicScenario = {};
  for (const field of publicScenarioFields) {
    if (Object.hasOwn(scenario, field)) {
      publicScenario[field] = scenario[field];
    }
  }
  return publicScenario;
}

function unsupportedScenarioFields(scenario) {
  return Object.keys(scenario).filter((field) => !scenarioFields.has(field));
}

function commandResultsFailed(results) {
  return results.some((result) => result.status !== "passed");
}

function passRate(results) {
  if (results.length === 0) {
    return 1;
  }
  return results.filter((result) => result.status === "passed").length / results.length;
}

function commandReportSummary(result) {
  return {
    command: result.command,
    status: result.status,
    exitCode: result.exitCode,
    stdoutChars: (result.stdout || "").length,
    stderrChars: (result.stderr || "").length,
  };
}

function commandReportSummaries(results) {
  return results.map((result) => commandReportSummary(result));
}

function recordCommandFailures(scenarioId, repetition, profileRole, phase, results) {
  for (const result of results) {
    if (result.status !== "passed") {
      fail(
        "HARNESS-L016",
        `${scenarioId} repetition ${repetition} ${profileRole} ${phase} command failed: ${result.command} (${result.status})`,
        "Fix the scenario, adapter output, or changed repository state so required checks pass.",
      );
    }
  }
}

function adapterFailureReason(adapterResult) {
  if (adapterResult === true) {
    return null;
  }
  if (adapterResult === false) {
    return "adapter returned false";
  }
  if (!adapterResult || typeof adapterResult !== "object") {
    return `adapter returned non-object result: ${adapterResult}`;
  }
  for (const field of ["passed", "ok", "success"]) {
    if (adapterResult[field] === false) {
      return `adapter returned ${field}: false`;
    }
  }
  const status = typeof adapterResult.status === "string" ? adapterResult.status.toLowerCase() : "";
  if (["failed", "fail", "timed out", "timeout", "error"].includes(status)) {
    return `adapter returned status: ${adapterResult.status}`;
  }
  if (Number.isInteger(adapterResult.exitCode) && adapterResult.exitCode !== 0) {
    return `adapter returned exitCode: ${adapterResult.exitCode}`;
  }
  if (["passed", "pass", "success", "succeeded", "ok"].includes(status)) {
    return null;
  }
  for (const field of ["passed", "ok", "success"]) {
    if (adapterResult[field] === true) {
      return null;
    }
  }
  if (adapterResult.exitCode === 0) {
    return null;
  }
  return "adapter did not return explicit success";
}

function isSensitiveReportKey(key) {
  return /transcript|stdout|stderr|prompt|completion|message|raw|secret|path|log/i.test(key);
}

function sanitizeReportValue(value, depth = 0) {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.slice(0, 1000);
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => sanitizeReportValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === "object" && depth < 1) {
    const sanitized = {};
    for (const [key, nested] of Object.entries(value).slice(0, 20)) {
      if (isSensitiveReportKey(key)) {
        continue;
      }
      const safeValue = sanitizeReportValue(nested, depth + 1);
      if (safeValue !== undefined) {
        sanitized[key] = safeValue;
      }
    }
    return sanitized;
  }
  return undefined;
}

function adapterReportSummary(adapterResult) {
  if (typeof adapterResult === "boolean") {
    return { success: adapterResult };
  }
  if (!adapterResult || typeof adapterResult !== "object") {
    return { resultType: typeof adapterResult };
  }

  const summary = {};
  const adapterReport = adapterResult.report && typeof adapterResult.report === "object" ? adapterResult.report : {};
  for (const field of adapterReportFields) {
    const value = Object.hasOwn(adapterResult, field) ? adapterResult[field] : adapterReport[field];
    const safeValue = sanitizeReportValue(value);
    if (safeValue !== undefined) {
      summary[field] = safeValue;
    }
  }
  return Object.keys(summary).length > 0 ? summary : { resultType: "object" };
}

function adapterErrorSummary(adapterError, adapterTimedOut) {
  if (!adapterError) {
    return null;
  }
  return adapterTimedOut ? "adapter timed out" : "adapter failed";
}

function selfTestScenario(overrides = {}) {
  return {
    id: "self-test",
    description: "self-test scenario",
    risk_tags: ["self-test"],
    repo_fixture: "fixtures/sample-project",
    task: "visible task",
    setup_commands: [],
    visible_checks: ["node --test"],
    hidden_checks: ["node --test hidden.test.js"],
    hidden_check_files: [
      {
        source: "evals/hidden/runner-self-test/hidden.test.js",
        target: "hidden.test.js",
      },
    ],
    timeout: 60000,
    repetitions: 1,
    expected_contracts: ["visible contract"],
    forbidden_regressions: ["hidden regression"],
    ...overrides,
  };
}

async function runSelfTests() {
  const insidePath = path.join(root, "fixtures", "sample-project");
  const escapedPrefixPath = `${root}-fixture-escape`;
  const parentPath = path.resolve(root, "..");

  if (!isInsideRoot(insidePath)) {
    fail("HARNESS-L015", "live-eval path boundary self-test rejected an in-repository path", "Keep path.relative based containment checks.");
  }
  for (const candidate of [escapedPrefixPath, parentPath]) {
    if (isInsideRoot(candidate)) {
      fail("HARNESS-L015", `live-eval path boundary self-test accepted an escaped path: ${candidate}`, "Reject sibling or parent paths even when their string prefix matches the repository root.");
    }
  }

  const publicScenario = publicScenarioForAdapter(selfTestScenario({ hidden_notes: "runner-only note" }));
  if ("hidden_checks" in publicScenario || "hidden_check_files" in publicScenario || "hidden_notes" in publicScenario) {
    fail("HARNESS-L018", "public adapter scenario contains runner-only fields", "Expose only allowlisted public scenario fields to the adapter.");
  }
  if (!Array.isArray(publicScenario.visible_checks) || publicScenario.visible_checks[0] !== "node --test") {
    fail("HARNESS-L018", "public adapter scenario dropped visible_checks", "Expose visible checks to the adapter while hiding hidden checks.");
  }
  const unsupportedFields = unsupportedScenarioFields(selfTestScenario({ hidden_notes: "runner-only note" }));
  if (unsupportedFields.length !== 1 || unsupportedFields[0] !== "hidden_notes") {
    fail("HARNESS-L021", "live-eval unsupported-field self-test did not detect hidden_notes", "Reject unsupported scenario fields before adapter execution.");
  }
  if (commandResultsFailed([{ status: "passed" }])) {
    fail("HARNESS-L019", "live-eval command failure self-test misclassified passing results", "Keep command result status handling deterministic.");
  }
  if (!commandResultsFailed([{ status: "timed out" }]) || !commandResultsFailed([{ status: "failed" }])) {
    fail("HARNESS-L019", "live-eval command failure self-test accepted failed results", "Treat failed and timed-out checks as failed live evaluations.");
  }
  const commandReport = commandReportSummary({ command: "node --test", status: "failed", exitCode: 1, stdout: "raw stdout", stderr: "raw stderr" });
  if ("stdout" in commandReport || "stderr" in commandReport || commandReport.stdoutChars !== 10 || commandReport.stderrChars !== 10) {
    fail("HARNESS-L025", "live-eval command report self-test persisted raw command output", "Persist command status and output sizes instead of raw stdout/stderr.");
  }
  for (const adapterResult of [true, { status: "passed" }, { passed: true }, { ok: true }, { success: true }, { exitCode: 0 }]) {
    if (adapterFailureReason(adapterResult) !== null) {
      fail("HARNESS-L020", "live-eval adapter result self-test rejected explicit success", "Keep adapter success semantics explicit.");
    }
  }
  for (const adapterResult of [false, undefined, null, "passed", {}, { status: "failed" }, { passed: false }, { ok: false }, { success: false }, { exitCode: 1 }]) {
    if (adapterFailureReason(adapterResult) === null) {
      fail("HARNESS-L020", "live-eval adapter result self-test accepted missing or failed adapter success", "Require explicit adapter success before checks run.");
    }
  }

  try {
    await runAdapterWithTimeout({ runScenario: () => new Promise(() => {}) }, { timeout: 5 });
    fail("HARNESS-L022", "live-eval adapter timeout self-test did not time out", "Enforce runner-side timeouts around adapter execution.");
  } catch (error) {
    if (!(error instanceof AdapterTimeoutError)) {
      fail("HARNESS-L022", `live-eval adapter timeout self-test returned wrong error: ${error.message}`, "Timeouts should fail with AdapterTimeoutError.");
    }
  }

  const seenRuns = [];
  const isolatedAdapter = {
    runScenario: async (context) => {
      seenRuns.push(context);
      fs.writeFileSync(path.join(context.repo, `${context.profileRole}.txt`), context.profile, "utf8");
      return { passed: true, transcript: "must not be reported", report: { summary: `${context.profileRole} ok` } };
    },
  };
  const noCheckScenario = selfTestScenario({ visible_checks: [], hidden_checks: [], hidden_check_files: [], timeout: 1000 });
  await runScenarioProfile(isolatedAdapter, noCheckScenario, 1, { profileRole: "baseline", profile: "baseline-profile" });
  await runScenarioProfile(isolatedAdapter, noCheckScenario, 1, { profileRole: "harness", profile: "harness-profile" });
  if (seenRuns.length !== 2 || seenRuns[0].repo === seenRuns[1].repo) {
    fail("HARNESS-L023", "live-eval profile isolation self-test did not use separate repo copies", "Run baseline and harness profiles in separate fixture copies.");
  }
  if (seenRuns.some((context) => "hidden_checks" in context.scenario || "hidden_check_files" in context.scenario)) {
    fail("HARNESS-L018", "profile adapter context exposed hidden check fields", "Keep hidden check commands and files runner-only.");
  }

  const tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-live-hidden-"));
  try {
    fs.cpSync(path.join(root, "fixtures", "sample-project"), tempRepo, { recursive: true });
    const hiddenTarget = path.join(tempRepo, "hidden.test.js");
    if (fs.existsSync(hiddenTarget)) {
      fail("HARNESS-L024", "hidden file staging self-test fixture already exposed hidden.test.js", "Keep hidden check files outside public repo fixtures.");
    }
    stageHiddenCheckFiles(selfTestScenario(), tempRepo);
    if (!fs.existsSync(hiddenTarget)) {
      fail("HARNESS-L024", "hidden file staging self-test did not copy hidden.test.js", "Stage hidden check files after adapter execution.");
    }
  } finally {
    fs.rmSync(tempRepo, { recursive: true, force: true });
  }

  const adapterReport = adapterReportSummary({
    passed: true,
    transcript: "raw transcript",
    stdout: "raw stdout",
    report: { summary: "safe", hidden: "do not persist", metrics: { tokens: 3, transcript: "nested secret" } },
  });
  if ("transcript" in adapterReport || "stdout" in adapterReport || "hidden" in adapterReport || adapterReport.metrics?.transcript || adapterReport.summary !== "safe") {
    fail("HARNESS-L025", "live-eval adapter report self-test persisted unsafe adapter fields", "Persist only allowlisted adapter report summary fields.");
  }
  if (adapterErrorSummary("secret path C:/tmp/raw.log", false) !== "adapter failed" || adapterErrorSummary("adapter timed out after 5ms", true) !== "adapter timed out") {
    fail("HARNESS-L025", "live-eval adapter error self-test persisted raw adapter error text", "Persist adapter error classification instead of raw exception text.");
  }
}

function validateHiddenCheckFiles(scenario, label) {
  if (scenario.hidden_check_files === undefined) {
    return;
  }
  if (!Array.isArray(scenario.hidden_check_files)) {
    fail("HARNESS-L026", `${label}.hidden_check_files must be an array`, "Use explicit hidden check file source/target entries.");
    return;
  }
  const fixturePath = isNonEmptyString(scenario.repo_fixture) ? resolveRepoFixturePath(scenario.repo_fixture) : null;
  for (const [index, entry] of scenario.hidden_check_files.entries()) {
    const entryLabel = `${label}.hidden_check_files[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      fail("HARNESS-L026", `${entryLabel} must be an object`, "Use { source, target } for every hidden check file.");
      continue;
    }
    for (const field of Object.keys(entry)) {
      if (!hiddenCheckFileFields.has(field)) {
        fail("HARNESS-L026", `${entryLabel}.${field} is not supported`, "Hidden check file entries support only source and target.");
      }
    }
    assertString(entry.source, `${entryLabel}.source`);
    assertString(entry.target, `${entryLabel}.target`);
    if (isNonEmptyString(entry.source)) {
      const source = resolveRootPath(entry.source);
      if (!source || !fs.existsSync(source)) {
        fail("HARNESS-L027", `${entryLabel}.source does not resolve inside the repository: ${entry.source}`, "Use a checked-in hidden check file or directory.");
      } else if (fixturePath && isInside(fixturePath, source)) {
        fail("HARNESS-L028", `${entryLabel}.source is already inside repo_fixture: ${entry.source}`, "Keep hidden check files outside the public repo fixture.");
      }
    }
    if (isNonEmptyString(entry.target) && !isSafeRelativeTarget(entry.target)) {
      fail("HARNESS-L029", `${entryLabel}.target must be a safe relative path inside the repo: ${entry.target}`, "Use a relative target path without . or .. segments.");
    }
  }
}

function validateScenario(scenario, file) {
  const label = path.relative(root, file).replaceAll("\\", "/");
  if (!scenario) return;

  assertString(scenario.id, `${label}.id`);
  if (typeof scenario.id === "string" && !/^[a-z0-9][a-z0-9._-]*$/.test(scenario.id)) {
    fail("HARNESS-L005", `${label}.id has unsupported characters`, "Use lowercase letters, numbers, dots, underscores, or hyphens.");
  }
  assertString(scenario.description, `${label}.description`);
  for (const field of unsupportedScenarioFields(scenario)) {
    fail("HARNESS-L021", `${label}.${field} is not a supported field`, "Remove unsupported fields or add an explicit runner contract before exposing them.");
  }
  assertStringArray(scenario.risk_tags, `${label}.risk_tags`, { min: 1 });
  if (!scenario.repo_fixture) {
    fail("HARNESS-L006", `${label} must define repo_fixture`, "Provide a checked-in isolated fixture path.");
  }
  if (scenario.repo_fixture) {
    assertString(scenario.repo_fixture, `${label}.repo_fixture`);
    if (isNonEmptyString(scenario.repo_fixture)) {
      const fixturePath = resolveRepoFixturePath(scenario.repo_fixture);
      if (!fixturePath || !fs.existsSync(fixturePath)) {
        fail("HARNESS-L007", `${label}.repo_fixture does not resolve inside the repository: ${scenario.repo_fixture}`, "Use a checked-in fixture path.");
      }
    }
  }
  assertString(scenario.task, `${label}.task`);
  assertStringArray(scenario.setup_commands, `${label}.setup_commands`);
  assertStringArray(scenario.visible_checks, `${label}.visible_checks`);
  assertStringArray(scenario.hidden_checks, `${label}.hidden_checks`, { min: 1 });
  validateHiddenCheckFiles(scenario, label);
  if (!Number.isInteger(scenario.timeout) || scenario.timeout < 1000) {
    fail("HARNESS-L008", `${label}.timeout must be an integer >= 1000`, "Set an explicit millisecond timeout.");
  }
  if (!Number.isInteger(scenario.repetitions) || scenario.repetitions < 1) {
    fail("HARNESS-L009", `${label}.repetitions must be an integer >= 1`, "Set at least one repetition.");
  }
  assertStringArray(scenario.expected_contracts, `${label}.expected_contracts`, { min: 1 });
  assertStringArray(scenario.forbidden_regressions, `${label}.forbidden_regressions`, { min: 1 });
}

function validateAllScenarios() {
  const files = listScenarioFiles();
  if (files.length === 0) {
    fail("HARNESS-L010", "no live-evaluation scenarios found", "Add at least one deterministic manifest fixture.");
  }
  const scenarios = files.map((file) => ({ file, scenario: readJson(file) }));
  for (const { file, scenario } of scenarios) {
    validateScenario(scenario, file);
  }
  const ids = new Set();
  for (const { file, scenario } of scenarios) {
    if (!scenario?.id) continue;
    if (ids.has(scenario.id)) {
      fail("HARNESS-L011", `duplicate live-evaluation scenario id: ${scenario.id}`, "Use stable unique scenario IDs.");
    }
    ids.add(scenario.id);
  }
  return scenarios.filter(({ scenario }) => scenario);
}

function shell(command, cwd, timeout) {
  const result = process.platform === "win32"
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", command], { cwd, encoding: "utf8", timeout })
    : spawnSync(command, [], { cwd, encoding: "utf8", shell: true, timeout });
  return {
    command,
    status: result.error?.code === "ETIMEDOUT" ? "timed out" : result.status === 0 ? "passed" : "failed",
    exitCode: result.status,
    stdout: (result.stdout || "").slice(-4000),
    stderr: (result.stderr || result.error?.message || "").slice(-4000),
  };
}

async function loadAdapter() {
  const adapterPath = process.env.OPENCODE_LIVE_EVAL_ADAPTER;
  if (!adapterPath) {
    fail("HARNESS-L012", "OPENCODE_LIVE_EVAL_ADAPTER is not set", "Provide an adapter that can run one scenario against baseline and harness profiles, or use npm run verify:live-eval.");
    return null;
  }
  const resolved = path.resolve(adapterPath);
  if (!fs.existsSync(resolved)) {
    fail("HARNESS-L013", `live-eval adapter not found: ${resolved}`, "Point OPENCODE_LIVE_EVAL_ADAPTER at a local .mjs adapter.");
    return null;
  }
  const mod = await import(pathToFileURL(resolved));
  if (typeof mod.runScenario !== "function") {
    fail("HARNESS-L014", "live-eval adapter must export runScenario", "Export async function runScenario(context).");
    return null;
  }
  return mod;
}

function liveProfileRuns(env = process.env) {
  const profiles = [
    { profileRole: "baseline", profile: env.OPENCODE_BASELINE_PROFILE },
    { profileRole: "harness", profile: env.OPENCODE_HARNESS_PROFILE },
  ];
  for (const profile of profiles) {
    if (!isNonEmptyString(profile.profile)) {
      fail("HARNESS-L030", `${profile.profileRole} profile is not configured`, "Set OPENCODE_BASELINE_PROFILE and OPENCODE_HARNESS_PROFILE for live A/B evaluation.");
    }
  }
  return profiles.filter((profile) => isNonEmptyString(profile.profile));
}

function prepareFixture(scenario, profileRole) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `opencode-live-eval-${scenario.id}-${profileRole}-`));
  const source = resolveRepoFixturePath(scenario.repo_fixture);
  if (!source) {
    throw new Error(`repo_fixture escapes repository root: ${scenario.repo_fixture}`);
  }
  const target = path.join(tmp, "repo");
  fs.cpSync(source, target, { recursive: true });
  return { tmp, repo: target };
}

function stageHiddenCheckFiles(scenario, repo) {
  for (const entry of scenario.hidden_check_files ?? []) {
    const source = resolveRootPath(entry.source);
    if (!source || !fs.existsSync(source)) {
      throw new Error(`hidden_check_files source is missing: ${entry.source}`);
    }
    const target = resolveRepoTarget(repo, entry.target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true });
  }
}

async function runAdapterWithTimeout(adapter, context) {
  const timeout = Math.max(1, Number(context.timeout) || 1);
  const controller = new AbortController();
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AdapterTimeoutError(timeout));
    }, timeout);
  });

  try {
    return await Promise.race([
      adapter.runScenario({ ...context, signal: controller.signal }),
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function runScenarioProfile(adapter, scenario, repetition, profileRun) {
  const { tmp, repo } = prepareFixture(scenario, profileRun.profileRole);
  try {
    const setupResults = scenario.setup_commands.map((command) => shell(command, repo, scenario.timeout));
    const reports = [];
    if (setupResults.length > 0) {
      reports.push({
        scenario: scenario.id,
        repetition,
        profileRole: profileRun.profileRole,
        phase: "setup",
        results: commandReportSummaries(setupResults),
        passRate: passRate(setupResults),
      });
      recordCommandFailures(scenario.id, repetition, profileRun.profileRole, "setup", setupResults);
    }
    if (commandResultsFailed(setupResults)) {
      return reports;
    }

    const startedAt = Date.now();
    let adapterResult;
    let adapterError = null;
    let adapterTimedOut = false;
    try {
      adapterResult = await runAdapterWithTimeout(adapter, {
        scenario: publicScenarioForAdapter(scenario),
        repetition,
        profileRole: profileRun.profileRole,
        profile: profileRun.profile,
        repo,
        timeout: scenario.timeout,
      });
    } catch (error) {
      adapterError = error instanceof Error ? error.message : String(error);
      adapterTimedOut = error instanceof AdapterTimeoutError;
      fail("HARNESS-L017", `${scenario.id} repetition ${repetition} ${profileRun.profileRole} adapter failed: ${adapterError}`, "Fix the adapter or scenario so the live run completes.");
    }
    if (!adapterTimedOut) {
      const adapterFailure = adapterFailureReason(adapterResult);
      if (adapterFailure) {
        fail("HARNESS-L017", `${scenario.id} repetition ${repetition} ${profileRun.profileRole} ${adapterFailure}`, "Return a passing adapter result only after the agent task succeeds.");
      }
    }
    if (adapterTimedOut) {
      reports.push({
        scenario: scenario.id,
        repetition,
        profileRole: profileRun.profileRole,
        phase: "live",
        durationMs: Date.now() - startedAt,
        adapterReport: adapterReportSummary(adapterResult),
        adapterError: adapterErrorSummary(adapterError, adapterTimedOut),
        visibleResults: [],
        hiddenResults: [],
        visiblePassRate: 0,
        hiddenPassRate: 0,
        defectEscapeRate: 1,
      });
      return reports;
    }

    const visibleResults = scenario.visible_checks.map((command) => shell(command, repo, scenario.timeout));
    recordCommandFailures(scenario.id, repetition, profileRun.profileRole, "visible", visibleResults);

    let hiddenResults;
    try {
      stageHiddenCheckFiles(scenario, repo);
      hiddenResults = scenario.hidden_checks.map((command) => shell(command, repo, scenario.timeout));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      hiddenResults = [{ command: "<stage hidden_check_files>", status: "failed", exitCode: null, stdout: "", stderr: message }];
      fail("HARNESS-L024", `${scenario.id} repetition ${repetition} ${profileRun.profileRole} hidden file staging failed: ${message}`, "Keep hidden check files checked in outside the public fixture and copy them only after adapter execution.");
    }
    recordCommandFailures(scenario.id, repetition, profileRun.profileRole, "hidden", hiddenResults);

    reports.push({
      scenario: scenario.id,
      repetition,
      profileRole: profileRun.profileRole,
      phase: "live",
      durationMs: Date.now() - startedAt,
      adapterReport: adapterReportSummary(adapterResult),
      adapterError: adapterErrorSummary(adapterError, adapterTimedOut),
      visibleResults: commandReportSummaries(visibleResults),
      hiddenResults: commandReportSummaries(hiddenResults),
      visiblePassRate: passRate(visibleResults),
      hiddenPassRate: passRate(hiddenResults),
      defectEscapeRate: hiddenResults.some((result) => result.status !== "passed") ? 1 : 0,
    });
    return reports;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function runLive(scenarios) {
  const adapter = await loadAdapter();
  const profiles = liveProfileRuns();
  if (!adapter || profiles.length !== 2) return [];

  const reports = [];
  for (const { scenario } of scenarios) {
    for (let repetition = 1; repetition <= scenario.repetitions; repetition += 1) {
      for (const profileRun of profiles) {
        reports.push(...await runScenarioProfile(adapter, scenario, repetition, profileRun));
      }
    }
  }
  return reports;
}

function writeReports(reports) {
  fs.mkdirSync(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, "latest.json");
  const mdPath = path.join(reportDir, "latest.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2)}\n`);
  fs.writeFileSync(
    mdPath,
    [
      "# Live Evaluation Report",
      "",
      `Generated: ${new Date().toISOString()}`,
      "",
      ...reports.map((entry) => `- ${entry.scenario} repetition ${entry.repetition} ${entry.profileRole} phase ${entry.phase}: visible ${entry.visiblePassRate ?? entry.passRate ?? "n/a"}, hidden ${entry.hiddenPassRate ?? "n/a"}`),
      "",
    ].join("\n"),
  );
}

if (selfTestOnly) {
  await runSelfTests();
}

const scenarios = selfTestOnly ? [] : validateAllScenarios();

if (failures.length === 0 && !validateOnly && !selfTestOnly) {
  const reports = await runLive(scenarios);
  if (reports.length > 0) {
    writeReports(reports);
  }
}

if (failures.length > 0) {
  console.error("Harness live evaluation validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure.code}: ${failure.message}`);
    if (failure.fix) {
      console.error(`  fix: ${failure.fix}`);
    }
  }
  process.exit(1);
}

if (selfTestOnly) {
  console.log("Harness live evaluation self-tests passed.");
} else if (validateOnly) {
  console.log(`Harness live evaluation manifests valid (${scenarios.length} scenario${scenarios.length === 1 ? "" : "s"}).`);
} else {
  console.log("Harness live evaluation completed. Reports written to evals/reports/latest.json and evals/reports/latest.md.");
}
