import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { selfTestVnextContracts } from "../lib/benchmark/vnext-contracts.mjs";
import { verifyVnextFixtureControlBoundary } from "../lib/benchmark/vnext-fixture-verifier.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  process.stdout.write(`${JSON.stringify({
    ...selfTestVnextContracts(root),
    fixture_control_boundary: verifyVnextFixtureControlBoundary(root),
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`vNext benchmark self-test failed: ${error.message}\n`);
  process.exitCode = 1;
}
