import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";

import {
  createCanonicalExperimentBindings,
  validateCanonicalAcceptanceScenarios,
  validateQualityAcceptancePolicy,
} from "../lib/quality/acceptance-contracts.mjs";
import { assessQualityCandidate } from "../lib/quality/acceptance-engine.mjs";
import { validateRuntimeModelEvidence } from "../lib/quality/model-profiles.mjs";
import { ContractError, assertSafeId, fingerprint } from "../lib/feedback/contracts.mjs";
import {
  assertNoSymlinkEscape,
  ensureConfinedDirectory,
  isInside,
  publishImmutableSet,
  readJson,
} from "../lib/feedback/files.mjs";
import { loadScenarioCorpus } from "../lib/feedback/manifests.mjs";
import { createReportHistory } from "../lib/feedback/report-history.mjs";

const root = process.cwd();

function usage() {
  return [
    "Usage: node scripts/assess-quality-candidate.mjs --report <file> [--report <file> ...]",
    "  --runtime-evidence <file-or-complete-runtime-batch-directory> [--runtime-evidence <file> ...]",
    "  --baseline-permission-evidence <file> --candidate-permission-evidence <file>",
    "  --baseline-id <id> --candidate-id <id>",
    "  Reports must be immutable history JSON artifacts with matching .complete.json and .md files.",
    "  Policy, experiment, model catalog, prompt inventory, and the exact 96-pair universe are checked-in inputs.",
    "  [--output-dir evals/decisions]",
  ].join("\n");
}

function cliError(code, message) {
  throw new ContractError(code, message);
}

function parseArgs(argv) {
  const options = {
    reports: [],
    runtimeEvidence: [],
    outputDirectory: "evals/decisions",
  };
  const flags = new Map([
    ["--report", "reports"],
    ["--runtime-evidence", "runtimeEvidence"],
    ["--baseline-id", "baselineId"],
    ["--candidate-id", "candidateId"],
    ["--baseline-permission-evidence", "baselinePermissionEvidence"],
    ["--candidate-permission-evidence", "candidatePermissionEvidence"],
    ["--output-dir", "outputDirectory"],
  ]);
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (["--help", "-h"].includes(argument)) return { help: true };
    const target = flags.get(argument);
    if (!target) cliError("QUALITY_ACCEPTANCE_CLI_ARGUMENT", `unsupported argument ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      cliError("QUALITY_ACCEPTANCE_CLI_VALUE", `${argument} requires a value`);
    }
    index += 1;
    if (["reports", "runtimeEvidence"].includes(target)) options[target].push(value);
    else {
      if (seen.has(target)) cliError("QUALITY_ACCEPTANCE_CLI_DUPLICATE", `${argument} may be specified only once`);
      seen.add(target);
      options[target] = value;
    }
  }
  if (options.reports.length === 0) cliError("QUALITY_ACCEPTANCE_CLI_REPORT", "at least one --report is required");
  if (options.runtimeEvidence.length === 0) {
    cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME", "at least one --runtime-evidence is required");
  }
  if (!options.baselineId || !options.candidateId) {
    cliError("QUALITY_ACCEPTANCE_CLI_PROFILE", "--baseline-id and --candidate-id are required");
  }
  if (!options.baselinePermissionEvidence || !options.candidatePermissionEvidence) {
    cliError(
      "QUALITY_ACCEPTANCE_CLI_PERMISSION",
      "--baseline-permission-evidence and --candidate-permission-evidence are required",
    );
  }
  return options;
}

function readExplicitJson(inputPath, label) {
  if (typeof inputPath !== "string" || inputPath.length === 0) {
    cliError("QUALITY_ACCEPTANCE_CLI_PATH", `${label} path is required`);
  }
  const resolved = path.resolve(root, inputPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    cliError("QUALITY_ACCEPTANCE_CLI_PATH", `${label} file does not exist`);
  }
  try {
    return readJson(resolved);
  } catch (error) {
    cliError("QUALITY_ACCEPTANCE_CLI_JSON", `${label} is not valid JSON: ${error.message}`);
  }
}

function confinedDirectory(inputPath) {
  if (typeof inputPath !== "string" || inputPath.length === 0 || path.isAbsolute(inputPath)) {
    cliError("QUALITY_ACCEPTANCE_CLI_OUTPUT", "output directory must be a relative local path");
  }
  const resolved = path.resolve(root, inputPath);
  if (!isInside(root, resolved)) cliError("QUALITY_ACCEPTANCE_CLI_OUTPUT", "output directory escapes the workspace");
  assertNoSymlinkEscape(root, resolved);
  return ensureConfinedDirectory(root, resolved);
}

function promptProfile(inventory, label) {
  if (
    !inventory
    || typeof inventory !== "object"
    || Array.isArray(inventory)
    || typeof inventory.inventory_id !== "string"
    || typeof inventory.content_fingerprint !== "string"
  ) {
    cliError("QUALITY_ACCEPTANCE_CLI_PROMPT", `${label} is not a sealed prompt inventory`);
  }
  return {
    prompt_profile_id: inventory.inventory_id,
    prompt_profile_fingerprint: inventory.content_fingerprint,
  };
}

function canonicalInputs() {
  const experiment = readExplicitJson("quality/model-profiles/experiment.v1.json", "engineering experiment");
  const catalog = readExplicitJson("quality/model-profiles/catalog.v1.json", "model profile catalog");
  const baselinePrompt = promptProfile(
    readExplicitJson("quality/prompt-inventory/baseline.v1.json", "baseline prompt inventory"),
    "baseline prompt inventory",
  );
  const candidatePrompt = promptProfile(
    readExplicitJson("quality/prompt-inventory/baseline.v1.json", "candidate prompt inventory"),
    "candidate prompt inventory",
  );
  const canonicalExperimentBindings = createCanonicalExperimentBindings({
    experiment,
    catalog,
    promptProfiles: { baseline: baselinePrompt, candidate: candidatePrompt },
  });
  const { scenarios, suiteManifest } = loadScenarioCorpus({ root });
  const scenariosById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const suiteByScenario = new Map(
    Object.entries(suiteManifest.suites)
      .flatMap(([suite, scenarioIds]) => scenarioIds.map((scenarioId) => [scenarioId, suite])),
  );
  const canonicalScenarios = experiment.scenario_cells.map((cell) => {
    const scenario = scenariosById.get(cell.scenario_id);
    if (!scenario) cliError("QUALITY_ACCEPTANCE_CLI_SCENARIO", `missing scenario ${cell.scenario_id}`);
    if (suiteByScenario.get(cell.scenario_id) !== cell.suite) {
      cliError("QUALITY_ACCEPTANCE_CLI_SCENARIO", `${cell.scenario_id} does not match its experiment suite`);
    }
    return {
      scenario_id: scenario.id,
      failure_family: scenario.failure_family,
      suite: cell.suite,
      repetitions: scenario.repetitions,
      scenario_fingerprint: fingerprint(scenario),
    };
  });
  validateCanonicalAcceptanceScenarios(canonicalScenarios);
  return { catalog, canonicalScenarios, canonicalExperimentBindings };
}

function readHistoricalReport(inputPath, index) {
  if (typeof inputPath !== "string" || inputPath.length === 0) {
    cliError("QUALITY_ACCEPTANCE_CLI_REPORT_HISTORY", `quality live report ${index + 1} path is required`);
  }
  const resolved = path.resolve(root, inputPath);
  if (!isInside(root, resolved)) {
    cliError("QUALITY_ACCEPTANCE_CLI_REPORT_HISTORY", "quality report history must remain inside the workspace");
  }
  try {
    const history = createReportHistory({ workspaceRoot: root, reportDir: path.dirname(resolved) });
    return history.inspect(resolved).report;
  } catch (error) {
    cliError(
      "QUALITY_ACCEPTANCE_CLI_REPORT_HISTORY",
      `quality live report ${index + 1} is not a complete immutable history generation: ${error.message}`,
    );
  }
}

function runtimeInvocationIdentity(entry) {
  const options = new Map(entry.option_results.map((option) => [option.option_id, option]));
  return JSON.stringify({
    requested_profile_id: entry.requested_profile_id,
    requested_model_id: entry.requested_model_id,
    reasoning_effort: options.get("reasoning_effort")?.requested_value,
    text_verbosity: options.get("text_verbosity")?.requested_value,
    mode: options.get("mode")?.requested_value,
  });
}

function expectedRuntimeInvocationIdentity(binding, role) {
  const invocation = binding[role];
  return JSON.stringify({
    requested_profile_id: invocation.model_profile_id,
    requested_model_id: invocation.model_id,
    reasoning_effort: invocation.reasoning_effort,
    text_verbosity: invocation.text_verbosity,
    mode: invocation.mode,
  });
}

function assertPortableArtifactName(value, label) {
  if (
    typeof value !== "string"
    || value.length === 0
    || Buffer.byteLength(value, "utf8") > 240
    || path.basename(value) !== value
    || /[\\/:*?"<>|\u0000-\u001f]/u.test(value)
    || value === "."
    || value === ".."
  ) {
    cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `${label} is not a portable bounded artifact name`);
  }
  return value;
}

function readOrdinaryBoundedJson(file, label, { maxBytes = 1024 * 1024 } = {}) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) {
    cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `${label} must be a bounded ordinary JSON file`);
  }
  try {
    return readJson(file);
  } catch (error) {
    cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `${label} is not valid JSON: ${error.message}`);
  }
}

function validateRuntimeBatchMarker(marker, label) {
  const keys = [
    "schema_version", "batch_id", "profile_role", "created_at", "entry_count", "batch_file",
    "batch_fingerprint", "model_files", "model_fingerprints",
  ];
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) {
    cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `${label} must be an object`);
  }
  const actualKeys = Object.keys(marker).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify([...keys].sort())) {
    cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `${label} has unexpected or missing fields`);
  }
  if (marker.schema_version !== 1) cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `${label}.schema_version must be 1`);
  assertSafeId(marker.batch_id, `${label}.batch_id`);
  if (!["baseline", "candidate"].includes(marker.profile_role)) {
    cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `${label}.profile_role is invalid`);
  }
  if (!Number.isSafeInteger(marker.entry_count) || marker.entry_count < 1 || marker.entry_count > 128) {
    cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `${label}.entry_count must be 1..128`);
  }
  assertPortableArtifactName(marker.batch_file, `${label}.batch_file`);
  if (!/^sha256:[0-9a-f]{64}$/u.test(marker.batch_fingerprint)) {
    cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `${label}.batch_fingerprint is invalid`);
  }
  if (!Array.isArray(marker.model_files) || marker.model_files.length !== marker.entry_count) {
    cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `${label}.model_files must match entry_count`);
  }
  marker.model_files.forEach((name, index) => assertPortableArtifactName(name, `${label}.model_files[${index}]`));
  if (new Set(marker.model_files).size !== marker.model_files.length) {
    cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `${label}.model_files contains duplicates`);
  }
  if (
    !Array.isArray(marker.model_fingerprints)
    || marker.model_fingerprints.length !== marker.entry_count
    || marker.model_fingerprints.some((value) => !/^sha256:[0-9a-f]{64}$/u.test(value))
  ) {
    cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `${label}.model_fingerprints is invalid`);
  }
  if (typeof marker.created_at !== "string" || !Number.isFinite(Date.parse(marker.created_at))) {
    cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `${label}.created_at is invalid`);
  }
  return marker;
}

function readCompleteRuntimeBatchDirectory(inputPath, catalog, canonicalExperimentBindings) {
  const resolved = path.resolve(root, inputPath);
  const directoryStat = fs.lstatSync(resolved);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", "runtime batch path must be an ordinary directory");
  }
  assertNoSymlinkEscape(resolved, resolved);
  const entries = fs.readdirSync(resolved, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  if (entries.length < 6 || entries.length > 512) {
    cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", "runtime batch directory must contain 6..512 contract artifacts");
  }
  let totalBytes = 0;
  for (const entry of entries) {
    assertPortableArtifactName(entry.name, "runtime batch artifact name");
    if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".json")) {
      cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `unknown or non-ordinary runtime batch artifact ${entry.name}`);
    }
    const file = path.join(resolved, entry.name);
    assertNoSymlinkEscape(resolved, file);
    totalBytes += fs.lstatSync(file).size;
  }
  if (totalBytes > 32 * 1024 * 1024) {
    cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", "runtime batch directory exceeds 32 MiB");
  }

  const names = new Set(entries.map((entry) => entry.name));
  const markerNames = [...names].filter((name) => name.endsWith(".complete.json") && name.includes("-runtime-batch-"));
  if (markerNames.length !== 2) {
    cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", "complete runtime batch directory requires exactly baseline and candidate completion markers");
  }
  const consumed = new Set();
  const allEvidence = [];
  const roles = new Set();
  for (const markerName of markerNames.sort()) {
    const marker = validateRuntimeBatchMarker(
      readOrdinaryBoundedJson(path.join(resolved, markerName), markerName),
      markerName,
    );
    if (roles.has(marker.profile_role)) {
      cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `duplicate ${marker.profile_role} runtime batch marker`);
    }
    roles.add(marker.profile_role);
    if (!names.has(marker.batch_file) || marker.model_files.some((name) => !names.has(name))) {
      cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `${markerName} references a missing artifact`);
    }
    for (const name of [markerName, marker.batch_file, ...marker.model_files]) {
      if (consumed.has(name)) cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `runtime batch artifact ${name} is referenced more than once`);
      consumed.add(name);
    }
    const batch = readOrdinaryBoundedJson(path.join(resolved, marker.batch_file), marker.batch_file, { maxBytes: 8 * 1024 * 1024 });
    if (!Array.isArray(batch) || batch.length !== marker.entry_count) {
      cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `${marker.batch_file} must be an array matching entry_count`);
    }
    batch.forEach((entry, index) => {
      validateRuntimeModelEvidence(entry, { catalog });
      if (entry.evidence_kind !== "installed_runtime" || !entry.complete) {
        cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `${marker.batch_file}[${index}] is not complete installed-runtime evidence`);
      }
      if (!entry.requested_profile_id.startsWith(`${marker.profile_role}-`)) {
        cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `${marker.batch_file}[${index}] does not match marker profile_role`);
      }
    });
    const fingerprints = batch.map((entry) => entry.content_fingerprint);
    if (
      marker.batch_fingerprint !== fingerprint(fingerprints)
      || JSON.stringify(marker.model_fingerprints) !== JSON.stringify(fingerprints)
    ) {
      cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `${markerName} fingerprint set does not match its batch array`);
    }
    marker.model_files.forEach((name, index) => {
      const individual = readOrdinaryBoundedJson(path.join(resolved, name), name);
      validateRuntimeModelEvidence(individual, { catalog });
      if (JSON.stringify(individual) !== JSON.stringify(batch[index])) {
        cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `${name} diverges from ${marker.batch_file}[${index}]`);
      }
    });
    allEvidence.push(...batch);
  }
  if (!roles.has("baseline") || !roles.has("candidate")) {
    cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", "runtime batch directory must contain baseline and candidate bundles");
  }
  const unknown = [...names].filter((name) => !consumed.has(name));
  if (unknown.length > 0) {
    cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", `runtime batch directory contains unknown artifacts: ${unknown.join(", ")}`);
  }
  const actualIdentities = allEvidence.map(runtimeInvocationIdentity);
  if (new Set(actualIdentities).size !== actualIdentities.length) {
    cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", "runtime batch directory contains duplicate exact invocations");
  }
  const expectedIdentities = [...new Set(canonicalExperimentBindings.flatMap((binding) => [
    expectedRuntimeInvocationIdentity(binding, "baseline"),
    expectedRuntimeInvocationIdentity(binding, "candidate"),
  ]))].sort();
  if (JSON.stringify([...actualIdentities].sort()) !== JSON.stringify(expectedIdentities)) {
    cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", "runtime batch directory does not exactly cover all canonical experiment invocations");
  }
  return allEvidence;
}

function runtimeEvidenceInputs(paths, catalog, canonicalExperimentBindings) {
  const directoryPaths = paths.filter((inputPath) => {
    const resolved = path.resolve(root, inputPath);
    return fs.existsSync(resolved) && fs.lstatSync(resolved).isDirectory();
  });
  if (directoryPaths.length > 0) {
    if (paths.length !== 1 || directoryPaths.length !== 1) {
      cliError("QUALITY_ACCEPTANCE_CLI_RUNTIME_BUNDLE", "a complete runtime batch directory must be the only --runtime-evidence input");
    }
    return readCompleteRuntimeBatchDirectory(directoryPaths[0], catalog, canonicalExperimentBindings);
  }
  return paths.flatMap((inputPath, index) => {
    const value = readExplicitJson(inputPath, `runtime evidence ${index + 1}`);
    const entries = Array.isArray(value) ? value : [value];
    entries.forEach((entry) => validateRuntimeModelEvidence(entry, { catalog }));
    return entries;
  });
}

function publishDecision(decision, outputDirectory) {
  assertSafeId(decision.decision_id, "decision.decision_id");
  const jsonFile = `quality-${decision.decision_id}.json`;
  const markerFile = `quality-${decision.decision_id}.complete.json`;
  const jsonText = `${JSON.stringify(decision, null, 2)}\n`;
  const marker = {
    schema_version: 1,
    decision_id: decision.decision_id,
    decision_fingerprint: decision.content_fingerprint,
    json_file: jsonFile,
    json_text_fingerprint: `sha256:${createHash("sha256").update(jsonText).digest("hex")}`,
  };
  const jsonPath = path.join(outputDirectory, jsonFile);
  const markerPath = path.join(outputDirectory, markerFile);
  publishImmutableSet({
    files: [{ path: jsonPath, contents: jsonText }],
    markerPath,
    markerValue: marker,
  }, { basePath: root });
  return { jsonPath, markerPath };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const policy = readExplicitJson("quality/acceptance/acceptance-policy.v2.json", "quality acceptance policy");
  validateQualityAcceptancePolicy(policy);
  const { catalog, canonicalScenarios, canonicalExperimentBindings } = canonicalInputs();
  const runtimeModelEvidence = runtimeEvidenceInputs(options.runtimeEvidence, catalog, canonicalExperimentBindings);
  const reports = options.reports.map((inputPath, index) => readHistoricalReport(inputPath, index));
  const decision = assessQualityCandidate({
    reports,
    policy,
    canonicalScenarios,
    canonicalExperimentBindings,
    runtimeModelEvidence,
    baselinePermissionSnapshot: readExplicitJson(
      options.baselinePermissionEvidence,
      "baseline permission evidence",
    ),
    candidatePermissionSnapshot: readExplicitJson(
      options.candidatePermissionEvidence,
      "candidate permission evidence",
    ),
    baselineId: options.baselineId,
    candidateId: options.candidateId,
  });
  const outputDirectory = confinedDirectory(options.outputDirectory);
  const artifacts = publishDecision(decision, outputDirectory);
  console.log(`Quality candidate decision: ${decision.decision}`);
  console.log(`Decision artifact: ${path.relative(root, artifacts.jsonPath).replaceAll("\\", "/")}`);
  console.log(`Completion marker: ${path.relative(root, artifacts.markerPath).replaceAll("\\", "/")}`);
  if (decision.decision !== "accepted") process.exitCode = 2;
}

try {
  main();
} catch (error) {
  const message = error instanceof ContractError
    ? error.message
    : `QUALITY_ACCEPTANCE_CLI_FAILURE: ${error.message}`;
  console.error(message);
  console.error(usage());
  process.exitCode = 1;
}
