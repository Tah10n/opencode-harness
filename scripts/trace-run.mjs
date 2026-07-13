#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { createTraceStore } from "../lib/feedback/index.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/trace-run.mjs create  [--workspace PATH] (--json JSON | --file FILE)",
    "  node scripts/trace-run.mjs emit    [--workspace PATH] --run-id ID (--json JSON | --file FILE)",
    "  node scripts/trace-run.mjs inspect [--workspace PATH] --run-id ID",
  ].join("\n");
}

function parseArguments(argv) {
  const command = argv[0];
  if (!["create", "emit", "inspect"].includes(command)) throw new Error(usage());
  const options = { workspace: process.cwd(), runId: null, json: null, file: null };
  const known = new Map([
    ["--workspace", "workspace"],
    ["--run-id", "runId"],
    ["--json", "json"],
    ["--file", "file"],
  ]);
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const key = known.get(flag);
    if (!key || index + 1 >= argv.length) throw new Error(`Unknown or incomplete option: ${flag ?? "<missing>"}\n${usage()}`);
    options[key] = argv[index + 1];
  }
  if (options.json !== null && options.file !== null) throw new Error("Use only one of --json or --file");
  if (["emit", "inspect"].includes(command) && !options.runId) throw new Error(`--run-id is required for ${command}`);
  if (["create", "emit"].includes(command) && options.json === null && options.file === null) throw new Error(`--json or --file is required for ${command}`);
  if (command === "inspect" && (options.json !== null || options.file !== null)) throw new Error("inspect does not accept input JSON");
  return { command, options };
}

function readInput(options) {
  const source = options.file === null
    ? options.json
    : fs.readFileSync(path.resolve(options.file), "utf8");
  let value;
  try {
    value = JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`Input is not valid JSON: ${error.message}`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Input JSON must be an object");
  return value;
}

function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  const store = createTraceStore({ workspaceRoot: path.resolve(options.workspace) });
  const result = command === "create"
    ? store.createRun(readInput(options))
    : command === "emit"
      ? store.appendEvent(options.runId, readInput(options))
      : store.inspectRun(options.runId);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  const code = typeof error?.code === "string" ? `${error.code}: ` : "";
  process.stderr.write(`Trace command failed: ${code}${error?.message ?? "unknown error"}\n`);
  process.exitCode = 1;
}
