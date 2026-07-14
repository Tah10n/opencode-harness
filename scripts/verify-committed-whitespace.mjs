import { verifyCommittedWhitespace, committedWhitespaceRequestFromEnvironment } from "../lib/quality/whitespace.mjs";
import { fingerprint } from "../lib/quality/validation.mjs";

function parseArguments(argv) {
  const parsed = {};
  const names = new Map([
    ["--mode", "mode"],
    ["--base", "baseSha"],
    ["--before", "beforeSha"],
    ["--cwd", "cwd"],
    ["--git-command", "gitCommand"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === "--json") continue;
    const key = names.get(name);
    if (!key) throw new Error(`unknown argument: ${name}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${name}`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function argumentFailure(message) {
  const value = {
    schema_version: 1,
    producer: "opencode-harness/committed-whitespace-v1",
    mode: null,
    status: "incomplete",
    reason: "invalid_arguments",
    head_sha: null,
    base_sha: null,
    before_sha: null,
    merge_base_sha: null,
    range: null,
    resolved_range: null,
    working_tree_state: null,
    commands: [],
    message,
  };
  return { ...value, evidence_fingerprint: fingerprint(value) };
}

let receipt;
try {
  const environment = committedWhitespaceRequestFromEnvironment();
  receipt = verifyCommittedWhitespace({ ...environment, ...parseArguments(process.argv.slice(2)) });
} catch (error) {
  receipt = argumentFailure(error instanceof Error ? error.message : "invalid arguments");
}

process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
if (receipt.status === "failed") process.exitCode = 1;
else if (receipt.status === "incomplete") process.exitCode = 2;
