import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  runSyntheticModelFreeSelfTest,
  validateSyntheticModelFreeSelfTestReport,
} from "../lib/benchmark/self-test.mjs";

const defaultRoot = fs.realpathSync.native(path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
));

export async function verifyBenchmarkModelFree({ root = defaultRoot } = {}) {
  const report = await runSyntheticModelFreeSelfTest({ sourceRoot: root });
  validateSyntheticModelFreeSelfTestReport(report);
  if (!report.complete) {
    const failures = report.checks
      .filter((check) => check.status !== "passed")
      .map((check) => `${check.id}:${check.status}`)
      .join(", ");
    throw new Error(`synthetic model-free verifier failed: ${failures}`);
  }
  return report;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const report = await verifyBenchmarkModelFree();
  process.stdout.write(`Synthetic benchmark model-free graph verified (${report.check_count} checks).\n`);
}
