import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { loadVnextContracts } from "../lib/benchmark/vnext-contracts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  process.stdout.write(`${JSON.stringify(loadVnextContracts(root).validation, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`vNext benchmark validation failed: ${error.message}\n`);
  process.exitCode = 1;
}
