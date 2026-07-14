import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runManagedCommand } from "../lib/feedback/process-tree.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = fs.realpathSync(os.tmpdir());
const bundleRoot = fs.mkdtempSync(path.join(temporaryRoot, "opencode-harness-adoption-"));

const adoptionEntries = [
  ".gitattributes",
  ".github",
  ".gitignore",
  "AGENTS.md",
  "CHANGELOG.md",
  "CODEOWNERS",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "agents",
  "commands",
  "docs",
  "evals",
  "examples",
  "fixtures",
  "lib",
  "opencode.json",
  "package.json",
  "quality",
  "scripts",
  "skills",
];

const requiredQualityDirectories = Object.freeze([
  "lib/quality",
  "quality",
  "quality/acceptance",
  "quality/live-scenarios",
  "quality/live-scenarios/artifacts",
  "quality/model-profiles",
  "quality/prompt-inventory",
  "quality/schemas",
]);

const requiredQualityFiles = Object.freeze([
  "lib/quality/index.mjs",
  "lib/quality/milestone-dod.mjs",
  "lib/quality/runtime-execution.mjs",
  "quality/acceptance/acceptance-policy.v2.json",
  "quality/live-scenarios/quality-architecture-boundary.v1.json",
  "quality/live-scenarios/quality-concurrency-cancellation.v1.json",
  "quality/live-scenarios/quality-cross-module-invariant.v1.json",
  "quality/live-scenarios/quality-migration-compatibility.v1.json",
  "quality/live-scenarios/quality-parser-boundaries.v1.json",
  "quality/live-scenarios/quality-partial-dependency-failure.v1.json",
  "quality/live-scenarios/quality-persistence-rollback.v1.json",
  "quality/live-scenarios/quality-public-api-compatibility.v1.json",
  "quality/live-scenarios/quality-resource-lifecycle.v1.json",
  "quality/live-scenarios/quality-retry-idempotency.v1.json",
  "quality/live-scenarios/quality-small-local-control.v1.json",
  "quality/live-scenarios/quality-stale-cache-version-skew.v1.json",
  "quality/milestone-2-dod.v1.json",
  "quality/model-profiles/catalog.v1.json",
  "quality/model-profiles/experiment.v1.json",
  "quality/model-profiles/runtime-fixture-evidence.v1.json",
  "quality/prompt-inventory/baseline.v1.json",
  "quality/prompt-inventory/declared-changes.v1.json",
  "quality/schemas/architecture-evaluation.schema.json",
  "quality/schemas/architecture-policy.example.json",
  "quality/schemas/architecture-policy.schema.json",
  "quality/schemas/engineering-dossier.schema.json",
  "quality/schemas/engineering-gate-decision.schema.json",
  "quality/schemas/engineering-impact-graph.schema.json",
  "quality/schemas/integrated-verification-evidence.schema.json",
  "quality/schemas/preimplementation-evidence.schema.json",
  "quality/schemas/quality-attestation.schema.json",
  "scripts/verify-milestone-2-dod.mjs",
  "scripts/verify-all.mjs",
  "scripts/verify-quality-contracts.mjs",
  "scripts/verify-quality-live-manifests.mjs",
]);

const requiredQualityExports = Object.freeze([
  "createRuntimeExecutionBinding",
  "runtimeExecutionFingerprint",
  "validateArchitecturePolicy",
  "validateEngineeringDossier",
  "validateEngineeringExperimentManifest",
  "validateEngineeringGateDecision",
  "validateEngineeringImpactGraph",
  "validateIntegratedVerificationEvidence",
  "validateModelProfileCatalog",
  "validatePromptInventory",
  "validateQualityAcceptancePolicy",
  "validateRuntimeModelEvidence",
  "validateRuntimeExecutionBinding",
]);

const excludedOperationalPrefixes = [
  ".git",
  ".oc_harness",
  "evals/decisions",
  "evals/reports",
  "local",
  "node_modules",
];

function normalize(relativePath) {
  return relativePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isExcluded(relativePath) {
  const normalized = normalize(relativePath);
  return excludedOperationalPrefixes.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

function copyConfined(relativePath) {
  const normalized = normalize(relativePath);
  if (isExcluded(normalized)) {
    return;
  }

  const source = path.join(sourceRoot, normalized);
  const destination = path.join(bundleRoot, normalized);
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) {
    throw new Error(`adoption source must not contain symbolic links: ${normalized}`);
  }
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source).sort()) {
      copyConfined(path.posix.join(normalized, entry));
    }
    return;
  }
  if (!stat.isFile()) {
    throw new Error(`unsupported adoption source entry: ${normalized}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function bundlePathPresent(relativePath, type = "file") {
  const target = path.join(bundleRoot, relativePath);
  return type === "directory"
    ? fs.existsSync(target) && fs.statSync(target).isDirectory()
    : fs.existsSync(target) && fs.statSync(target).isFile();
}

function assertBundlePath(relativePath, type = "file") {
  const present = bundlePathPresent(relativePath, type);
  if (!present) {
    throw new Error(`adoption bundle missing required ${type}: ${relativePath}`);
  }
}

function assertQualityAdoptionContract({ entries, hasPath, exportNames }) {
  if (!entries.includes("quality")) {
    throw new Error("quality adoption contract requires the top-level quality copy entry");
  }
  for (const requiredDirectory of requiredQualityDirectories) {
    if (!hasPath(requiredDirectory, "directory")) {
      throw new Error(`quality adoption contract is missing directory: ${requiredDirectory}`);
    }
  }
  for (const requiredFile of requiredQualityFiles) {
    if (!hasPath(requiredFile, "file")) {
      throw new Error(`quality adoption contract is missing checked artifact: ${requiredFile}`);
    }
  }
  const availableExports = new Set(exportNames);
  for (const requiredExport of requiredQualityExports) {
    if (!availableExports.has(requiredExport)) {
      throw new Error(`quality adoption contract is missing public export: ${requiredExport}`);
    }
  }
}

function expectQualityContractFailure(label, input) {
  try {
    assertQualityAdoptionContract(input);
  } catch {
    return;
  }
  throw new Error(`${label} did not fail closed`);
}

async function runNode(label, args) {
  const result = await runManagedCommand({
    file: process.execPath,
    args,
    cwd: bundleRoot,
    timeout: 120_000,
    maxOutputChars: 2 * 1024 * 1024,
  });
  if (result.timed_out) {
    throw new Error(`${label} timed out after verified process-tree teardown`);
  }
  if (result.error) {
    throw new Error(`${label} could not run: ${result.error.code ?? result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit ${result.status} (stdout chars ${result.stdout_chars}, stderr chars ${result.stderr_chars})`);
  }
}

let verificationError;
try {
  const completeDeclaration = {
    entries: adoptionEntries,
    hasPath: () => true,
    exportNames: requiredQualityExports,
  };
  assertQualityAdoptionContract(completeDeclaration);
  expectQualityContractFailure("quality allowlist omission sensor", {
    ...completeDeclaration,
    entries: adoptionEntries.filter((entry) => entry !== "quality"),
  });
  expectQualityContractFailure("quality subtree omission sensor", {
    ...completeDeclaration,
    hasPath: (relativePath) => relativePath !== "quality/schemas",
  });
  expectQualityContractFailure("quality manifest omission sensor", {
    ...completeDeclaration,
    hasPath: (relativePath) => relativePath !== "quality/model-profiles/catalog.v1.json",
  });
  expectQualityContractFailure("quality export omission sensor", {
    ...completeDeclaration,
    exportNames: requiredQualityExports.filter((name) => name !== "validateModelProfileCatalog"),
  });

  for (const entry of adoptionEntries) {
    copyConfined(entry);
  }

  assertQualityAdoptionContract({
    entries: adoptionEntries,
    hasPath: bundlePathPresent,
    exportNames: requiredQualityExports,
  });

  for (const requiredDirectory of [
    "evals/hidden",
    "evals/scenarios",
    "fixtures/live",
    "fixtures/sample-project",
    "lib/feedback",
    "scripts",
  ]) {
    assertBundlePath(requiredDirectory, "directory");
  }
  for (const requiredFile of [
    "evals/acceptance-policy.json",
    "evals/scenario.schema.json",
    "evals/suite.schema.json",
    "evals/suites.json",
    "fixtures/sample-project/WORKFLOW.md",
    "lib/feedback/index.mjs",
    "package.json",
    "scripts/assess-candidate.mjs",
    "scripts/capture-static-evidence.mjs",
    "scripts/evaluate-live.mjs",
    "scripts/verify-live-manifests.mjs",
  ]) {
    assertBundlePath(requiredFile);
  }
  for (const forbiddenPath of [".oc_harness", "evals/decisions", "evals/reports"]) {
    if (fs.existsSync(path.join(bundleRoot, forbiddenPath))) {
      throw new Error(`adoption bundle copied operational state: ${forbiddenPath}`);
    }
  }

  await runNode("public package export smoke", [
    "--input-type=module",
    "--eval",
    [
      'import fs from "node:fs";',
      'const feedback = await import("opencode-harness/feedback");',
      'const traceStore = await import("opencode-harness/trace-store");',
      'const quality = await import("opencode-harness/quality");',
      'if (typeof feedback.createTraceStore !== "function") throw new Error("missing createTraceStore");',
      'if (feedback.createTraceStore !== traceStore.createTraceStore) throw new Error("compatibility export mismatch");',
      `const requiredQualityExports = ${JSON.stringify(requiredQualityExports)};`,
      'const assertQualityExports = (surface) => { for (const name of requiredQualityExports) { if (typeof surface[name] !== "function") throw new Error(`missing quality export ${name}`); } };',
      'let missingExportRejected = false;',
      'try { assertQualityExports({}); } catch { missingExportRejected = true; }',
      'if (!missingExportRejected) throw new Error("quality export omission sensor did not fail closed");',
      'assertQualityExports(quality);',
      'const readJson = (relativePath) => JSON.parse(fs.readFileSync(relativePath, "utf8"));',
      'const catalog = readJson("quality/model-profiles/catalog.v1.json");',
      'const experiment = readJson("quality/model-profiles/experiment.v1.json");',
      'const runtimeFixture = readJson("quality/model-profiles/runtime-fixture-evidence.v1.json");',
      'quality.validateModelProfileCatalog(catalog);',
      'quality.validateEngineeringExperimentManifest(experiment, { catalog });',
      'quality.validateRuntimeModelEvidence(runtimeFixture, { catalog });',
      'const fp = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";',
      'const bindingInput = { repository_fingerprint: fp, host_profile_id: "candidate-v1", experiment_id: experiment.experiment_id, experiment_fingerprint: experiment.content_fingerprint, comparison_id: experiment.comparisons[0].comparison_id, variant_id: experiment.comparisons[0].variant_id, harness_role: experiment.comparisons[0].role, scenario_id: experiment.comparisons[0].scenario_id, scenario_fingerprint: fp, repetition: experiment.comparisons[0].repetition, profile_role: "candidate", profile_fingerprint: fp, model_profile_id: experiment.comparisons[0].candidate_invocation.profile_id, model_profile_fingerprint: fp, model_id: experiment.comparisons[0].candidate_invocation.model_id, reasoning_effort: experiment.comparisons[0].candidate_invocation.reasoning_effort, text_verbosity: experiment.comparisons[0].candidate_invocation.text_verbosity, mode: experiment.comparisons[0].candidate_invocation.mode, prompt_profile_id: "baseline-engineering-prompts-v1", prompt_profile_fingerprint: fp, runtime_model_evidence_fingerprint: runtimeFixture.content_fingerprint, permission_snapshot_fingerprint: fp, permission_profile_fingerprint: fp };',
      'const runtimeBinding = quality.createRuntimeExecutionBinding(bindingInput);',
      'quality.validateRuntimeExecutionBinding(runtimeBinding);',
      'if (quality.runtimeExecutionFingerprint(bindingInput) !== runtimeBinding.runtime_execution_fingerprint) throw new Error("runtime execution fingerprint export mismatch");',
      'quality.validatePromptInventory(readJson("quality/prompt-inventory/baseline.v1.json"));',
      'quality.validateArchitecturePolicy(readJson("quality/schemas/architecture-policy.example.json"));',
      'quality.validateQualityAcceptancePolicy(readJson("quality/acceptance/acceptance-policy.v2.json"));',
    ].join("\n"),
  ]);
  await runNode("quality contract verifier", ["scripts/verify-quality-contracts.mjs"]);
  await runNode("quality live manifest verifier", ["scripts/verify-quality-live-manifests.mjs"]);
  await runNode("milestone 2 DoD contract-only verifier", ["scripts/verify-milestone-2-dod.mjs"]);
  await runNode("static bundle verifier", ["scripts/verify-harness.mjs"]);
  await runNode("live manifest verifier", ["scripts/verify-live-manifests.mjs"]);
  await runNode("live manifest runner validation", ["scripts/evaluate-live.mjs", "--validate"]);
  await runNode("buffered infrastructure self-test", ["scripts/evaluate-live.mjs", "--self-test-buffered"]);
} catch (error) {
  verificationError = error;
}

try {
  const resolvedBundleRoot = path.resolve(bundleRoot);
  if (path.dirname(resolvedBundleRoot) !== temporaryRoot) {
    throw new Error(`refusing to remove non-owned temporary path: ${resolvedBundleRoot}`);
  }
  fs.rmSync(resolvedBundleRoot, { recursive: true, force: true });
} catch (cleanupError) {
  verificationError = verificationError
    ? new AggregateError([verificationError, cleanupError], "adoption verification and cleanup failed")
    : cleanupError;
}

if (verificationError) {
  console.error(`Adoption bundle verification failed: ${verificationError.message}`);
  process.exit(1);
}

console.log("Adoption bundle verification passed (isolated temp copy, no live provider).");
