import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ProfileV3Error, fingerprintProfileValue } from "../lib/profile-v3.mjs";
import { buildVnextComparisonReport } from "../lib/benchmark/vnext-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readConfinedJson(value, label) {
  const lexical = path.resolve(value);
  const relative = path.relative(root, lexical);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new ProfileV3Error("VNEXT_COMPARISON_PATH", `${label} must be repository-confined`);
  }
  const stat = fs.lstatSync(lexical);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new ProfileV3Error("VNEXT_COMPARISON_PATH", `${label} must be a single-link regular file`);
  }
  return JSON.parse(fs.readFileSync(lexical, "utf8"));
}

try {
  const values = process.argv.slice(2);
  if (values.length !== 2 || values[0] !== "--run") {
    throw new ProfileV3Error("VNEXT_COMPARISON_ARGUMENT", "usage: --run <vnext-run-envelope.json>");
  }
  const envelope = readConfinedJson(values[1], "run envelope");
  const { envelope_fingerprint: declared, ...source } = envelope;
  if (envelope.run_kind !== "vnext-run-envelope" || declared !== fingerprintProfileValue(source)) {
    throw new ProfileV3Error("VNEXT_COMPARISON_RUN", "run envelope is stale or invalid");
  }
  const comparison = buildVnextComparisonReport({
    repositoryRoot: root,
    plan: envelope.plan,
    report: envelope.report,
  });
  process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof ProfileV3Error ? error.code : "VNEXT_COMPARISON_UNEXPECTED"}: ${error.message}\n`);
  process.exitCode = 1;
}
