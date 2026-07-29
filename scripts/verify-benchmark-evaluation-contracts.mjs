import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  verifyBenchmarkEvaluationContracts,
} from "./verify-benchmark-contracts.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function verifyInstalledBenchmarkEvaluationContracts({
  root = defaultRoot,
} = {}) {
  return verifyBenchmarkEvaluationContracts({ root });
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  const result = verifyInstalledBenchmarkEvaluationContracts();
  console.log(
    `Synthetic benchmark evaluation contracts verified (${result.family_count} families; smoke=${result.suite_run_counts.smoke}, standard=${result.suite_run_counts.standard}, full=${result.suite_run_counts.full}).`,
  );
}
