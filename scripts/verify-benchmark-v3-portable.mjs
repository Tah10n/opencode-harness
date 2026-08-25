#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const checks = [
  "verify:evaluator:paired-defects",
  "verify:core-product-runtime",
  "verify:core-product-installed-runtime",
  "verify:benchmark:v3:design",
  "verify:benchmark:v3:corpus",
  "verify:benchmark:v3:ledger",
  "verify:benchmark:v3:runner",
  "verify:benchmark:v3:provenance",
  "verify:benchmark:v3:no-raw-bundles",
];
const results = [];
for (const npmScript of checks) {
  const result = spawnSync("npm", ["run", npmScript], { encoding: "utf8", shell: false, windowsHide: true, env: process.env });
  results.push({ npm_script: npmScript, status: result.status === 0 ? "passed" : "failed" });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    process.stdout.write(`${JSON.stringify({ schema_version: 1, gate: "portable", status: "failed", model_calls: 0, candidate_tokens: 0, results }, null, 2)}\n`);
    process.exit(1);
  }
}
process.stdout.write(`${JSON.stringify({ schema_version: 1, gate: "portable", status: "passed", campaign_ready: false,
  campaign_readiness: "separate-gate-required", model_calls: 0, candidate_tokens: 0, results }, null, 2)}\n`);
