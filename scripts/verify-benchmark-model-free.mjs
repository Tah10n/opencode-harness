import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  createSyntheticModelFreeDiagnosticAccumulator,
  runSyntheticModelFreeSelfTest,
  sanitizeSyntheticModelFreeFailureDiagnostic,
  validateSyntheticModelFreeFailureDiagnosticEnvelope,
  validateSyntheticModelFreeSelfTestReport,
} from "../lib/benchmark/self-test.mjs";

const defaultRoot = fs.realpathSync.native(path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
));

export async function verifyBenchmarkModelFree({
  root = defaultRoot,
  diagnosticWriter = null,
} = {}) {
  const report = await runSyntheticModelFreeSelfTest({
    sourceRoot: root,
    failureReporter: diagnosticWriter,
  });
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
  const diagnostics = createSyntheticModelFreeDiagnosticAccumulator();
  try {
    const report = await verifyBenchmarkModelFree({
      diagnosticWriter: (diagnostic) => diagnostics.append(`${diagnostic}\n`),
    });
    process.stdout.write(`Synthetic benchmark model-free graph verified (${report.check_count} checks).\n`);
  } catch (error) {
    const detail = error instanceof Error
      ? `${error.name}: ${error.message}\n${error.stack ?? ""}`
      : String(error);
    diagnostics.append(`${sanitizeSyntheticModelFreeFailureDiagnostic(detail)}\n`);
    process.stderr.write(`${validateSyntheticModelFreeFailureDiagnosticEnvelope(diagnostics.value())}\n`);
    process.exitCode = 1;
  }
}
