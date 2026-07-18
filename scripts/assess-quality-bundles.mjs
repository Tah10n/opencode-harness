import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { assertConfinedExistingPath } from "../lib/feedback/files.mjs";
import { assessQualityCandidate } from "../lib/quality/acceptance-engine.mjs";
import { validateQualityAcceptancePolicy } from "../lib/quality/acceptance-contracts.mjs";
import { validateEngineeringCheckCatalog } from "../lib/quality/gate.mjs";
import { validateEngineeringQualityRunBundle } from "../lib/quality/run-bundle.mjs";
import { ContractError } from "../lib/quality/validation.mjs";

const MAX_JSON_BYTES = 1024 * 1024;

function usage() {
  return [
    "Usage: node scripts/assess-quality-bundles.mjs --policy <file>",
    "  --bundle <run-directory> --catalog <catalog.json>",
    "  [--bundle <run-directory> --catalog <catalog.json> ...]",
    "  [--decision-id <id>]",
    "",
    "Every run directory is revalidated from its persisted quality bundle before assessment.",
  ].join("\n");
}

function cliError(code, message) {
  throw new ContractError(code, message);
}

export function parseQualityBundleAssessmentArgs(argv) {
  const options = { policyPath: null, decisionId: "quality-bundle-decision", bundlePaths: [], catalogPaths: [] };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (["--help", "-h"].includes(argument)) return { help: true };
    if (!["--policy", "--bundle", "--catalog", "--decision-id"].includes(argument)) {
      cliError("QUALITY_ASSESSMENT_CLI_ARGUMENT", `unsupported argument ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      cliError("QUALITY_ASSESSMENT_CLI_VALUE", `${argument} requires a value`);
    }
    index += 1;
    if (argument === "--bundle") options.bundlePaths.push(value);
    else if (argument === "--catalog") options.catalogPaths.push(value);
    else {
      if (seen.has(argument)) cliError("QUALITY_ASSESSMENT_CLI_DUPLICATE", `${argument} may be specified only once`);
      seen.add(argument);
      if (argument === "--policy") options.policyPath = value;
      else options.decisionId = value;
    }
  }
  if (options.policyPath === null) cliError("QUALITY_ASSESSMENT_CLI_POLICY", "--policy is required");
  if (options.bundlePaths.length === 0 || options.bundlePaths.length !== options.catalogPaths.length) {
    cliError("QUALITY_ASSESSMENT_CLI_PAIR", "each --bundle requires one positionally paired --catalog");
  }
  return options;
}

function boundedOrdinaryPath(inputPath, label, expectedType) {
  if (typeof inputPath !== "string" || inputPath.trim() === "") {
    cliError("QUALITY_ASSESSMENT_PATH", `${label} path is required`);
  }
  const resolved = path.resolve(inputPath);
  let stat;
  try {
    assertConfinedExistingPath(path.parse(resolved).root, resolved, { type: expectedType });
    stat = fs.lstatSync(resolved);
  } catch {
    cliError("QUALITY_ASSESSMENT_PATH", `${label} must be an existing ordinary ${expectedType} with no linked path component`);
  }
  if (stat.isSymbolicLink() || (expectedType === "file" ? !stat.isFile() : !stat.isDirectory())) {
    cliError("QUALITY_ASSESSMENT_PATH", `${label} must be an ordinary ${expectedType}`);
  }
  if (expectedType === "file" && stat.size > MAX_JSON_BYTES) {
    cliError("QUALITY_ASSESSMENT_JSON_BYTES", `${label} exceeds ${MAX_JSON_BYTES} bytes`);
  }
  return resolved;
}

function readBoundedJson(inputPath, label) {
  const resolved = boundedOrdinaryPath(inputPath, label, "file");
  try {
    return JSON.parse(fs.readFileSync(resolved, "utf8").replace(/^\uFEFF/u, ""));
  } catch (error) {
    cliError("QUALITY_ASSESSMENT_JSON", `${label} is not valid JSON: ${error.message}`);
  }
}

export function assessQualityBundles({
  policyPath,
  bundlePairs,
  decisionId = "quality-bundle-decision",
  clock = () => new Date(),
} = {}) {
  const policy = readBoundedJson(policyPath, "quality acceptance policy");
  validateQualityAcceptancePolicy(policy);
  if (!Array.isArray(bundlePairs) || bundlePairs.length === 0) {
    cliError("QUALITY_ASSESSMENT_INPUT", "bundlePairs must be a non-empty array");
  }
  const bundles = bundlePairs.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      cliError("QUALITY_ASSESSMENT_INPUT", `bundlePairs[${index}] must be an object`);
    }
    const keys = Object.keys(entry).sort();
    if (JSON.stringify(keys) !== JSON.stringify(["catalogPath", "runDirectory"])) {
      cliError("QUALITY_ASSESSMENT_INPUT", `bundlePairs[${index}] has an invalid field set`);
    }
    const runDirectory = boundedOrdinaryPath(entry.runDirectory, `bundlePairs[${index}].runDirectory`, "directory");
    const checkCatalog = readBoundedJson(entry.catalogPath, `bundlePairs[${index}].catalogPath`);
    validateEngineeringCheckCatalog(checkCatalog);
    return {
      run_bundle: validateEngineeringQualityRunBundle(runDirectory),
      check_catalog: checkCatalog,
    };
  });
  return assessQualityCandidate({
    policy,
    bundles,
    decision_id: decisionId,
    clock,
  });
}

function main() {
  const options = parseQualityBundleAssessmentArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const decision = assessQualityBundles({
    policyPath: options.policyPath,
    bundlePairs: options.bundlePaths.map((runDirectory, index) => ({
      runDirectory,
      catalogPath: options.catalogPaths[index],
    })),
    decisionId: options.decisionId,
  });
  console.log(JSON.stringify(decision, null, 2));
  if (decision.decision !== "accepted") process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    const message = error instanceof ContractError
      ? `${error.code}: ${error.message}`
      : `QUALITY_ASSESSMENT_CLI_FAILURE: ${error.message}`;
    console.error(message);
    console.error(usage());
    process.exitCode = 1;
  }
}
