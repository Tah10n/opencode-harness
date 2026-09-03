#!/usr/bin/env node

import process from "node:process";
import { parseArgs } from "node:util";

import { reportPrimaryCampaign } from "../lib/benchmark/core-public-ab-primary-report.mjs";

const { values } = parseArgs({ options: {
  manifest: { type: "string" },
  "pilot-manifest": { type: "string" },
  "campaign-root": { type: "string" },
  "termination-record": { type: "string" },
  "primary-report-output": { type: "string" },
  "pilot-status-output": { type: "string" },
  "runner-erratum-output": { type: "string" },
  "results-output": { type: "string" },
}, strict: true });

function required(name) {
  const value = values[name];
  if (typeof value !== "string" || value.length === 0) throw Object.assign(new Error(`--${name} is required`), {
    code: "PRIMARY_REPORT_ARGUMENT",
  });
  return value;
}

try {
  const result = reportPrimaryCampaign({
    manifest: required("manifest"),
    pilotManifest: required("pilot-manifest"),
    campaignRoot: required("campaign-root"),
    terminationRecord: required("termination-record"),
    outputs: {
      primaryReport: required("primary-report-output"),
      pilotStatus: required("pilot-status-output"),
      runnerErratum: required("runner-erratum-output"),
      results: required("results-output"),
    },
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error?.code ?? "PRIMARY_REPORT_UNEXPECTED"}: ${error?.message ?? String(error)}\n`);
  process.exitCode = 1;
}
