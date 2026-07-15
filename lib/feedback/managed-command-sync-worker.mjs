import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  ProcessTreeTeardownError,
  runManagedCommand,
} from "./process-tree.mjs";

const MAX_INPUT_BYTES = 512 * 1024;

function fail(errorCode, teardownVerified = false) {
  process.stdout.write(JSON.stringify({
    status: null,
    signal: null,
    stdout_bytes: 0,
    stderr_bytes: 0,
    timed_out: false,
    teardown_verified: teardownVerified,
    error_code: errorCode,
  }));
}

function readInput() {
  const bytes = fs.readFileSync(0);
  if (bytes.length === 0 || bytes.length > MAX_INPUT_BYTES) throw new Error("MANAGED_COMMAND_INPUT_INVALID");
  const input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || typeof input.file !== "string" || !path.isAbsolute(input.file)
    || !Array.isArray(input.args) || input.args.some((entry) => typeof entry !== "string")
    || typeof input.cwd !== "string" || !path.isAbsolute(input.cwd)
    || input.env === null || typeof input.env !== "object" || Array.isArray(input.env)
    || Object.values(input.env).some((entry) => typeof entry !== "string")
    || !Number.isSafeInteger(input.timeout_ms) || input.timeout_ms < 1
    || !Number.isSafeInteger(input.max_output_bytes) || input.max_output_bytes < 1) {
    throw new Error("MANAGED_COMMAND_INPUT_INVALID");
  }
  return input;
}

try {
  const input = readInput();
  const result = await runManagedCommand({
    file: input.file,
    args: input.args,
    cwd: input.cwd,
    env: input.env,
    timeout: input.timeout_ms,
    maxOutputChars: input.max_output_bytes,
  });
  process.stdout.write(JSON.stringify({
    status: Number.isInteger(result.status) ? result.status : null,
    signal: typeof result.signal === "string" ? result.signal : null,
    stdout_bytes: Number.isSafeInteger(result.stdout_bytes) ? result.stdout_bytes : 0,
    stderr_bytes: Number.isSafeInteger(result.stderr_bytes) ? result.stderr_bytes : 0,
    timed_out: result.timed_out === true,
    teardown_verified: result.teardown_verified === true,
    error_code: typeof result.error?.code === "string" ? result.error.code : null,
  }));
} catch (error) {
  if (error instanceof ProcessTreeTeardownError) {
    fail(error.code);
  } else {
    fail(typeof error?.code === "string" ? error.code : "MANAGED_COMMAND_SYNC_WORKER_FAILED");
  }
}
