import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { validateBenchmarkV2CampaignReport } from "../lib/benchmark/v2-campaign.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const values = process.argv.slice(2);
const options = { report: null, freeze: null, selection: null, saltFile: null };
const mapping = { "--report": "report", "--freeze": "freeze", "--selection": "selection", "--salt-file": "saltFile" };
for (let index = 0; index < values.length; index += 2) {
  const property = mapping[values[index]];
  const value = values[index + 1];
  if (property === undefined || typeof value !== "string" || value.startsWith("/") || value.includes("\\")) {
    throw new Error("usage: --report <path> [--freeze <path> --selection <path> --salt-file <path>]");
  }
  options[property] = value;
}
if (options.report === null) throw new Error("--report is required");
const relativePath = options.report;
const target = path.resolve(root, ...relativePath.split("/"));
const relative = path.relative(root, target).split(path.sep).join("/");
const stat = fs.lstatSync(target);
if (relative !== relativePath || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size < 2 || stat.size > 16 * 1024 * 1024) {
  throw new Error("campaign report path is unsafe or unbounded");
}
const report = JSON.parse(fs.readFileSync(target, "utf8"));
const readOptionalJson = (value) => value === null ? null
  : JSON.parse(fs.readFileSync(path.resolve(root, ...value.split("/")), "utf8"));
const freezeManifest = readOptionalJson(options.freeze);
const selectionManifest = readOptionalJson(options.selection);
const salt = options.saltFile === null ? null
  : fs.readFileSync(path.resolve(root, ...options.saltFile.split("/")), "utf8").trim();
validateBenchmarkV2CampaignReport(report, {
  repositoryRoot: root, freezeManifest, selectionManifest, salt,
});
process.stdout.write(`${JSON.stringify({
  status: "validated",
  report_status: report.status,
  decision: report.decision,
  report_fingerprint: report.report_fingerprint,
  artifact_files: [relativePath],
})}\n`);
