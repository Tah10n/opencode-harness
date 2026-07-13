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
  "scripts",
  "skills",
];

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

function assertBundlePath(relativePath, type = "file") {
  const target = path.join(bundleRoot, relativePath);
  const present = type === "directory"
    ? fs.existsSync(target) && fs.statSync(target).isDirectory()
    : fs.existsSync(target) && fs.statSync(target).isFile();
  if (!present) {
    throw new Error(`adoption bundle missing required ${type}: ${relativePath}`);
  }
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
  for (const entry of adoptionEntries) {
    copyConfined(entry);
  }

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
      'const feedback = await import("opencode-harness/feedback");',
      'const traceStore = await import("opencode-harness/trace-store");',
      'if (typeof feedback.createTraceStore !== "function") throw new Error("missing createTraceStore");',
      'if (feedback.createTraceStore !== traceStore.createTraceStore) throw new Error("compatibility export mismatch");',
    ].join("\n"),
  ]);
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
