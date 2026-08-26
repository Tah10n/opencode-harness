#!/usr/bin/env node
import path from "node:path";
import { performBenchmarkV3LeaseTakeover } from "../lib/benchmark/v3-lease-takeover.mjs";

const values = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index]; const value = process.argv[index + 1];
  if (!key?.startsWith("--") || value === undefined || values.has(key.slice(2))) throw new Error("takeover arguments must be unique --name value pairs");
  values.set(key.slice(2), value);
}
for (const key of ["campaign-fingerprint", "takeover-receipt"]) if (!values.has(key)) throw new Error(`--${key} is required`);
const result = performBenchmarkV3LeaseTakeover({ sourceRoot: path.resolve(values.get("source-root") ?? process.cwd()),
  campaignFingerprint: values.get("campaign-fingerprint"), receiptPath: path.resolve(values.get("takeover-receipt")) });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
