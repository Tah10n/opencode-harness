import path from "node:path";
import process from "node:process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buildBenchmarkV2CampaignPlan,
  executeBenchmarkV2Acceptance,
  executeBenchmarkV2Campaign,
  writeBenchmarkV2CampaignReport,
} from "../lib/benchmark/v2-campaign.mjs";
import { resolveSyntheticOpenCodeExecutableIdentity } from "../lib/benchmark/opencode-adapter.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parse(values) {
  const result = {
    split: null,
    generationId: null,
    baselineArmId: null,
    candidateArmId: null,
    model: null,
    provider: null,
    variant: null,
    seed: null,
    timeoutMs: 300_000,
    repetitions: 1,
    validationUseOrdinal: null,
    planOnly: false,
    acceptanceOnly: false,
    allowDirty: false,
    freezePath: null,
    selectionPath: null,
    saltFile: null,
  };
  const mapping = {
    "--split": "split",
    "--generation": "generationId",
    "--baseline": "baselineArmId",
    "--candidate": "candidateArmId",
    "--model": "model",
    "--provider": "provider",
    "--variant": "variant",
    "--seed": "seed",
    "--timeout-ms": "timeoutMs",
    "--repetitions": "repetitions",
    "--validation-use-ordinal": "validationUseOrdinal",
    "--freeze": "freezePath",
    "--selection": "selectionPath",
    "--salt-file": "saltFile",
  };
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (key === "--plan-only") {
      result.planOnly = true;
      continue;
    }
    if (key === "--acceptance-only") {
      result.acceptanceOnly = true;
      continue;
    }
    if (key === "--allow-dirty") {
      result.allowDirty = true;
      continue;
    }
    const property = mapping[key];
    const next = values[index + 1];
    if (property === undefined || typeof next !== "string" || next.startsWith("--")) throw new Error(`invalid argument ${key}`);
    result[property] = ["timeoutMs", "repetitions", "validationUseOrdinal"].includes(property) ? Number(next) : next;
    index += 1;
  }
  for (const key of ["split", "generationId", "baselineArmId", "candidateArmId", "model", "provider", "variant", "seed"]) {
    if (result[key] === null) throw new Error(`missing ${key}`);
  }
  if (result.planOnly && result.acceptanceOnly) throw new Error("plan-only and acceptance-only are mutually exclusive");
  if (result.allowDirty && !result.planOnly) throw new Error("--allow-dirty is restricted to plan-only inspection");
  if (result.split === "holdout" && [result.freezePath, result.selectionPath, result.saltFile].some((value) => value === null)) {
    throw new Error("holdout requires --freeze, --selection, and --salt-file");
  }
  return result;
}

function readJson(value) {
  return value === null ? null : JSON.parse(fs.readFileSync(path.resolve(root, value), "utf8"));
}

try {
  const options = parse(process.argv.slice(2));
  const executableIdentity = resolveSyntheticOpenCodeExecutableIdentity();
  if (executableIdentity === null && !options.planOnly) throw new Error("OpenCode executable identity is unavailable");
  const freezeManifest = readJson(options.freezePath);
  const selectionManifest = readJson(options.selectionPath);
  const salt = options.saltFile === null ? null : fs.readFileSync(path.resolve(root, options.saltFile), "utf8").trim();
  const plan = buildBenchmarkV2CampaignPlan({
    repositoryRoot: root,
    ...options,
    executableIdentity,
    freezeManifest,
    selectionManifest,
    salt,
  });
  if (options.planOnly) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } else if (options.acceptanceOnly) {
    const acceptance = await executeBenchmarkV2Acceptance({ repositoryRoot: root, plan, executableIdentity });
    process.stdout.write(`${JSON.stringify(acceptance, null, 2)}\n`);
    if (acceptance.status !== "passed") process.exitCode = 2;
  } else {
    const report = await executeBenchmarkV2Campaign({
      repositoryRoot: root, plan, executableIdentity, freezeManifest, selectionManifest, salt,
    });
    const reportPath = writeBenchmarkV2CampaignReport(root, report, {
      freezeManifest, selectionManifest, salt,
    });
    process.stdout.write(`${JSON.stringify({ status: report.status, decision: report.decision, report_path: reportPath, report_fingerprint: report.report_fingerprint }, null, 2)}\n`);
    if (report.status !== "complete") process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(`${error.code ?? "BENCHMARK_V2_CAMPAIGN_UNEXPECTED"}: ${error.message}\n`);
  process.exitCode = 1;
}
