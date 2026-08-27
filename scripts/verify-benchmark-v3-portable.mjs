#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const checks = [
  "verify:evaluator:paired-defects",
  "verify:core-product-runtime",
  "verify:benchmark:v3:design",
  "verify:benchmark:v3:corpus",
  "verify:benchmark:v3:ledger",
  "verify:benchmark:v3:counterbalancing",
  "verify:benchmark:v3:global-authority",
  "verify:benchmark:v3:operator",
  "verify:benchmark:v3:runner",
  "verify:benchmark:v3:holdout-negative",
  "verify:benchmark:v3:provenance",
  "verify:benchmark:v3:no-raw-bundles",
];
if (checks.includes("verify:core-product-installed-runtime")) {
  throw new Error("the portable gate must not require host-installed opencode evidence");
}
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
