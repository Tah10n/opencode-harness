import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { validateBenchmarkV2CampaignReport } from "../lib/benchmark/v2-campaign.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const values = process.argv.slice(2);
if (values.length !== 2 || values[0] !== "--report" || values[1].startsWith("/") || values[1].includes("\\")) {
  throw new Error("usage: --report <workspace-relative-json>");
}
const relativePath = values[1];
const target = path.resolve(root, ...relativePath.split("/"));
const relative = path.relative(root, target).split(path.sep).join("/");
const stat = fs.lstatSync(target);
if (relative !== relativePath || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size < 2 || stat.size > 16 * 1024 * 1024) {
  throw new Error("campaign report path is unsafe or unbounded");
}
const report = JSON.parse(fs.readFileSync(target, "utf8"));
validateBenchmarkV2CampaignReport(report, { repositoryRoot: root });
process.stdout.write(`${JSON.stringify({
  status: "validated",
  report_status: report.status,
  decision: report.decision,
  report_fingerprint: report.report_fingerprint,
  artifact_files: [relativePath],
})}\n`);
