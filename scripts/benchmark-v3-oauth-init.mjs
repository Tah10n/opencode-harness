#!/usr/bin/env node
import path from "node:path";

import { initializeBenchmarkV3OpenAIOAuthState } from "../lib/benchmark/v3-provider-auth-state.mjs";

function fail(message) { process.stderr.write(`${message}\n`); process.exit(64); }
const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== "--input" || args[2] !== "--output") {
  fail("usage: benchmark-v3-oauth-init --input <absolute-opencode-auth.json> --output <absolute-private-state.jsonl>");
}
if (!path.isAbsolute(args[1]) || !path.isAbsolute(args[3])) fail("OAuth initialization paths must be absolute");
try {
  const result = initializeBenchmarkV3OpenAIOAuthState({ inputPath: args[1], outputPath: args[3] });
  process.stdout.write(`${JSON.stringify({ status: "initialized", ...result })}\n`);
} catch (error) {
  process.stderr.write(`${error?.code ?? "BENCHMARK_V3_PROVIDER_CREDENTIAL"}: initialization failed closed\n`);
  process.exit(78);
}
