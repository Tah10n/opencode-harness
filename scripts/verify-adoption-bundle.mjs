import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyProcessContainment } from "../lib/feedback/process-containment.mjs";
import { runManagedCommand } from "../lib/feedback/process-tree.mjs";
import { createInjectedTestContainmentFactory } from "./injected-test-containment.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = fs.realpathSync(os.tmpdir());
const bundleRoot = fs.mkdtempSync(path.join(temporaryRoot, "opencode-harness-adoption-"));
const platformContainment = classifyProcessContainment();
const deterministicContainmentFactory = platformContainment.support_state === "verified"
  ? null
  : createInjectedTestContainmentFactory("injected-adoption-test-containment-v1");

const adoptionEntries = [
  ".opencode/plugins/engineering-dossier.mjs",
  ".opencode/quality/checks.json",
  ".opencode/quality/toolchains.json",
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
  "lib/feedback",
  "lib/quality",
  "native",
  "opencode.json",
  "package.json",
  "quality",
  "scripts",
  "skills",
];

const requiredQualityDirectories = Object.freeze([
  ".opencode/plugins",
  ".opencode/quality",
  "lib/quality",
  "native",
  "quality",
  "quality/acceptance",
  "quality/examples",
  "quality/live-scenarios",
  "quality/live-scenarios/artifacts",
  "quality/prompt-inventory",
  "quality/schemas",
]);

const requiredQualityFiles = Object.freeze([
  "lib/quality/index.mjs",
  "lib/quality/milestone-dod.mjs",
  "lib/quality/normal-session-bridge.mjs",
  "lib/quality/normal-session-plugin.mjs",
  "lib/quality/normal-session-workspace.mjs",
  "lib/quality/project-check-catalog.mjs",
  "lib/quality/post-architecture-evidence.mjs",
  "lib/quality/quality-plugin.mjs",
  "lib/quality/runtime-hook-verification.mjs",
  "lib/quality/session-classification.mjs",
  "lib/quality/standard-lite.mjs",
  "lib/quality/trusted-project-runner.mjs",
  "lib/quality/trusted-toolchain-host-config.mjs",
  "lib/quality/trusted-toolchains.mjs",
  "lib/quality/verification-targets.mjs",
  "lib/quality/whitespace.mjs",
  ".opencode/plugins/engineering-dossier.mjs",
  ".opencode/quality/checks.json",
  ".opencode/quality/toolchains.json",
  "quality/examples/global-quality-plugin.mjs",
  "quality/examples/project-checks.example.json",
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
  "quality/milestone-2-dod.v2.json",
  "quality/milestone-2-dod.v3.json",
  "quality/prompt-inventory/baseline.v2.json",
  "quality/prompt-inventory/declared-changes.v2.json",
  "quality/schemas/architecture-evaluation.schema.json",
  "quality/schemas/architecture-policy.example.json",
  "quality/schemas/architecture-policy.schema.json",
  "quality/schemas/engineering-dossier.schema.json",
  "quality/schemas/engineering-gate-decision.schema.json",
  "quality/schemas/engineering-impact-graph.schema.json",
  "quality/schemas/integrated-verification-evidence.schema.json",
  "quality/schemas/preimplementation-evidence.schema.json",
  "quality/schemas/project-check-catalog.schema.json",
  "quality/schemas/post-edit-architecture-evidence.schema.json",
  "quality/schemas/toolchain-host-configuration.schema.json",
  "quality/schemas/toolchain-map.schema.json",
  "quality/schemas/quality-attestation.schema.json",
  "scripts/verify-milestone-2-dod.mjs",
  "scripts/build-macos-containment.mjs",
  "native/macos-exclusive-uid-controller.c",
  "scripts/verify-all.mjs",
  "scripts/verify-quality-contracts.mjs",
  "scripts/verify-quality-live-runner.mjs",
  "scripts/verify-quality-live-manifests.mjs",
  "scripts/verify-normal-session-quality-bridge.mjs",
  "scripts/probe-normal-session-plugin-api.mjs",
  "scripts/verify-session-classification.mjs",
  "scripts/verify-project-check-catalog.mjs",
  "scripts/verify-workspace-observation.mjs",
  "scripts/verify-trusted-toolchain-host-config.mjs",
  "scripts/verify-trusted-toolchains.mjs",
  "scripts/verify-process-containment.mjs",
  "scripts/verify-trusted-project-runner.mjs",
  "scripts/verify-bash-boundary.mjs",
  "scripts/verify-global-quality-plugin-export.mjs",
  "scripts/verify-normal-session-runtime.mjs",
  "scripts/verify-normal-session-runtime-fixtures.mjs",
  "scripts/verify-quality-verification-targets.mjs",
  "scripts/verify-committed-whitespace.mjs",
  "scripts/verify-committed-whitespace-fixtures.mjs",
]);

const requiredQualityExports = Object.freeze([
  "assessQualityCandidate",
  "createNormalSessionQualityBridge",
  "createNormalSessionQualityPlugin",
  "createQualityOutcomes",
  "validateArchitecturePolicy",
  "validateEngineeringDossier",
  "validateEngineeringGateDecision",
  "validateEngineeringImpactGraph",
  "validatePostEditArchitectureEvidence",
  "validateTrustedToolchainMap",
  "validateIntegratedVerificationEvidence",
  "validatePromptInventory",
  "validateQualityAcceptancePolicy",
  "requiredEngineeringVerificationTargets",
  "verifyCommittedWhitespace",
]);

const excludedOperationalPrefixes = [
  ".git",
  ".oc_harness",
  ".opencode/node_modules",
  ".opencode/package-lock.json",
  ".opencode/package.json",
  "evals/decisions",
  "evals/reports",
  "local",
  "node_modules",
];

function normalize(relativePath) {
  return relativePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function documentedAdoptionEntries(relativePath) {
  const text = fs.readFileSync(path.join(sourceRoot, relativePath), "utf8");
  const startMarker = "<!-- portable-adoption-bundle:start -->";
  const endMarker = "<!-- portable-adoption-bundle:end -->";
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start === -1 || end === -1 || text.indexOf(startMarker, start + startMarker.length) !== -1) {
    throw new Error(`${relativePath} must contain exactly one portable adoption bundle contract`);
  }
  const body = text.slice(start + startMarker.length, end);
  const match = body.match(/```text\s*\r?\n([\s\S]*?)\r?\n```/u);
  if (!match) {
    throw new Error(`${relativePath} portable adoption bundle contract must be a text code block`);
  }
  return match[1].split(/\r?\n/u).map((entry) => normalize(entry.trim())).filter(Boolean);
}

function assertPortableAdoptionDeclaration(entries) {
  if (new Set(entries).size !== entries.length) {
    throw new Error("portable adoption bundle entries must be unique");
  }
  for (const requiredEntry of [
    ".opencode/plugins/engineering-dossier.mjs",
    ".opencode/quality/checks.json",
    "lib/feedback",
    "lib/quality",
    "quality",
    "scripts",
    "evals",
  ]) {
    if (!entries.includes(requiredEntry)) {
      throw new Error(`portable adoption bundle is missing ${requiredEntry}`);
    }
  }
  for (const forbiddenEntry of [
    ".opencode",
    ".opencode/node_modules",
    ".opencode/package-lock.json",
    ".opencode/package.json",
    ".oc_harness",
    "evals/decisions",
    "evals/reports",
  ]) {
    if (entries.includes(forbiddenEntry)) {
      throw new Error(`portable adoption bundle must not declare ${forbiddenEntry}`);
    }
  }
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
    ...(deterministicContainmentFactory === null
      ? {}
      : { processContainmentFactory: deterministicContainmentFactory }),
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
  assertPortableAdoptionDeclaration(adoptionEntries);
  for (const documentationPath of ["README.md", "docs/adoption.md"]) {
    const documentedEntries = documentedAdoptionEntries(documentationPath);
    if (JSON.stringify(documentedEntries) !== JSON.stringify(adoptionEntries)) {
      throw new Error(`${documentationPath} portable adoption list drifted from adoptionEntries`);
    }
  }

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
  expectQualityContractFailure("quality bridge omission sensor", {
    ...completeDeclaration,
    hasPath: (relativePath) => relativePath !== ".opencode/plugins/engineering-dossier.mjs",
  });
  expectQualityContractFailure("quality export omission sensor", {
    ...completeDeclaration,
    exportNames: requiredQualityExports.filter((name) => name !== "requiredEngineeringVerificationTargets"),
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
  for (const forbiddenPath of [
    ".oc_harness",
    ".opencode/node_modules",
    ".opencode/package-lock.json",
    ".opencode/package.json",
    "evals/decisions",
    "evals/reports",
  ]) {
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
      'const qualityPlugin = await import("opencode-harness/quality-plugin");',
      'if (typeof feedback.createTraceStore !== "function") throw new Error("missing createTraceStore");',
      'if (feedback.createTraceStore !== traceStore.createTraceStore) throw new Error("compatibility export mismatch");',
      `const requiredQualityExports = ${JSON.stringify(requiredQualityExports)};`,
      'const assertQualityExports = (surface) => { for (const name of requiredQualityExports) { if (typeof surface[name] !== "function") throw new Error(`missing quality export ${name}`); } };',
      'let missingExportRejected = false;',
      'try { assertQualityExports({}); } catch { missingExportRejected = true; }',
      'if (!missingExportRejected) throw new Error("quality export omission sensor did not fail closed");',
      'assertQualityExports(quality);',
      'const readJson = (relativePath) => JSON.parse(fs.readFileSync(relativePath, "utf8"));',
      'if (typeof quality.requiredEngineeringVerificationTargets !== "function") throw new Error("missing canonical target function");',
      'if (typeof quality.createNormalSessionQualityBridge !== "function") throw new Error("missing normal-session bridge");',
      'if (typeof qualityPlugin.createNormalSessionQualityPlugin !== "function") throw new Error("missing public quality-plugin factory");',
      'if (typeof quality.verifyCommittedWhitespace !== "function") throw new Error("missing committed-whitespace verifier");',
      'quality.validatePromptInventory(readJson("quality/prompt-inventory/baseline.v2.json"));',
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

console.log(
  `Adoption bundle verification passed (isolated temp copy, no live provider; child containment: ${deterministicContainmentFactory === null ? `${platformContainment.kind}/verified` : "injected-test-only"}).`,
);
