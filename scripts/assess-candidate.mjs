import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  assessCandidate,
  validateAcceptancePolicy,
  writeDecisionArtifacts,
} from "../lib/feedback/acceptance.mjs";
import { ContractError, fingerprint } from "../lib/feedback/contracts.mjs";
import { assertNoSymlinkEscape, isInside, readJson } from "../lib/feedback/files.mjs";
import { loadScenarioCorpus } from "../lib/feedback/manifests.mjs";
import { createReportHistory } from "../lib/feedback/report-history.mjs";

const root = process.cwd();

function usage() {
  return [
    "Usage: node scripts/assess-candidate.mjs --report <file> [--report <file> ...]",
    "  --baseline-id <id> --candidate-id <id>",
    "  [--static-evidence <file>]",
    "  [--baseline-permissions <file>] [--candidate-permissions <file>]",
    "  [--policy <file>]",
    "  [--output-dir <relative-directory>]",
  ].join("\n");
}

function cliError(code, message) {
  throw new ContractError(code, message);
}

function parseArgs(argv) {
  const options = {
    reports: [],
    policy: "evals/acceptance-policy.json",
    outputDirectory: "evals/decisions",
  };
  const valueFlags = new Map([
    ["--report", "reports"],
    ["--static-evidence", "staticEvidence"],
    ["--baseline-permissions", "baselinePermissions"],
    ["--candidate-permissions", "candidatePermissions"],
    ["--policy", "policy"],
    ["--baseline-id", "baselineId"],
    ["--candidate-id", "candidateId"],
    ["--output-dir", "outputDirectory"],
  ]);
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    const target = valueFlags.get(argument);
    if (!target) cliError("ACCEPTANCE_CLI_ARGUMENT", `unsupported argument ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) cliError("ACCEPTANCE_CLI_VALUE", `${argument} requires a value`);
    index += 1;
    if (target === "reports") options.reports.push(value);
    else {
      if (seen.has(target)) cliError("ACCEPTANCE_CLI_DUPLICATE", `${argument} may be specified only once`);
      seen.add(target);
      options[target] = value;
    }
  }
  if (options.reports.length === 0) cliError("ACCEPTANCE_CLI_REPORT", "at least one --report is required");
  if (!options.baselineId || !options.candidateId) {
    cliError("ACCEPTANCE_CLI_PROFILE", "--baseline-id and --candidate-id are required");
  }
  return options;
}

function readExplicitJson(inputPath, label) {
  if (typeof inputPath !== "string" || inputPath.length === 0) cliError("ACCEPTANCE_CLI_PATH", `${label} path is required`);
  const resolved = path.resolve(root, inputPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    cliError("ACCEPTANCE_CLI_PATH", `${label} file does not exist`);
  }
  try {
    return readJson(resolved);
  } catch (error) {
    cliError("ACCEPTANCE_CLI_JSON", `${label} is not valid JSON: ${error.message}`);
  }
}

function confinedDirectory(inputPath, label) {
  if (typeof inputPath !== "string" || inputPath.length === 0 || path.isAbsolute(inputPath)) {
    cliError("ACCEPTANCE_CLI_OUTPUT", `${label} must be a relative local directory`);
  }
  const resolved = path.resolve(root, inputPath);
  if (!isInside(root, resolved)) cliError("ACCEPTANCE_CLI_OUTPUT", `${label} escapes the workspace`);
  assertNoSymlinkEscape(root, resolved);
  return resolved;
}

function optionalJson(inputPath, label) {
  return inputPath ? readExplicitJson(inputPath, label) : null;
}

function reportInput(history, reportPath) {
  const resolved = path.resolve(root, reportPath);
  try {
    const inspected = history.inspect(resolved);
    const marker = inspected.marker;
    return {
      report: inspected.report,
      attestation: {
        evaluation_run_id: inspected.report.evaluation_run_id,
        generation: marker.generation,
        report_fingerprint: marker.report_fingerprint,
        json_text_fingerprint: marker.json_text_fingerprint,
        markdown_fingerprint: marker.markdown_fingerprint,
        json_file: marker.json_file,
        markdown_file: marker.markdown_file,
        marker_fingerprint: fingerprint(marker),
        marker,
      },
    };
  } catch (error) {
    // A schema-valid raw report is still useful to produce a durable
    // inconclusive decision, but it never receives a trusted attestation.
    return { report: readExplicitJson(reportPath, "live report"), attestation: null };
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const policy = readExplicitJson(options.policy, "acceptance policy");
  validateAcceptancePolicy(policy);
  const { scenarios, suiteManifest } = loadScenarioCorpus({ root });
  const reportDirectory = path.join(root, "evals", "reports");
  const history = createReportHistory({ workspaceRoot: root, reportDir: reportDirectory });
  const reportInputs = options.reports.map((reportPath) => reportInput(history, reportPath));
  const decision = assessCandidate({
    reports: reportInputs.map(({ report }) => report),
    reportAttestations: reportInputs.flatMap(({ attestation }) => attestation ? [attestation] : []),
    staticEvidence: optionalJson(options.staticEvidence, "static evidence"),
    baselinePermissionSnapshot: optionalJson(options.baselinePermissions, "baseline permission snapshot"),
    candidatePermissionSnapshot: optionalJson(options.candidatePermissions, "candidate permission snapshot"),
    policy,
    suiteManifest,
    canonicalScenarios: scenarios,
    baselineId: options.baselineId,
    candidateId: options.candidateId,
  });
  const outputDirectory = confinedDirectory(options.outputDirectory, "output directory");
  const artifacts = writeDecisionArtifacts({ decision, workspaceRoot: root, outputDirectory });
  console.log(`Candidate decision: ${decision.decision}`);
  console.log(`Decision artifact: ${path.relative(root, artifacts.jsonPath).replaceAll("\\", "/")}`);
  if (decision.decision !== "accepted") process.exitCode = 2;
}

try {
  main();
} catch (error) {
  const message = error instanceof ContractError ? error.message : `ACCEPTANCE_CLI_FAILURE: ${error.message}`;
  console.error(message);
  console.error(usage());
  process.exitCode = 1;
}
