import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { assertSafeId, fingerprint } from "../lib/feedback/contracts.mjs";
import { atomicWriteJson, ensureConfinedDirectory, resolveInside } from "../lib/feedback/files.mjs";

const root = fs.realpathSync.native(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const values = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  allowPositionals: false,
  options: {
    job: { type: "string" },
    suite: { type: "string" },
    family: { type: "string" },
    generation: { type: "string" },
    classification: { type: "string" },
    "exit-code": { type: "string" },
  },
}).values;
const requiredId = (name) => assertSafeId(values[name], name);
const classification = requiredId("classification");
if (!["benchmark-failed-before-report", "artifact-missing"].includes(classification)) {
  throw new Error("workflow status classification is invalid");
}
const exitCode = Number(values["exit-code"]);
if (!Number.isSafeInteger(exitCode) || exitCode < 0 || exitCode > 255) {
  throw new Error("workflow status exit code is invalid");
}
const optionalId = (name) => values[name] === undefined ? null : requiredId(name);
const model = process.env.OPENCODE_BENCH_MODEL;
const status = Object.freeze({
  schema_version: 1,
  artifact_kind: "synthetic-workflow-status",
  classification,
  job_id: requiredId("job"),
  suite_id: requiredId("suite"),
  family_id: optionalId("family"),
  parent_generation_id: optionalId("generation"),
  benchmark_exit_code: exitCode,
  model_binding_fingerprint: typeof model === "string" && model.length > 0
    ? fingerprint({
        schema: "synthetic-model-binding-v1",
        provider: process.env.OPENCODE_BENCH_PROVIDER || null,
        model,
        variant: process.env.OPENCODE_BENCH_VARIANT || null,
      })
    : null,
});
const statusRoot = resolveInside(root, "evals", "reports", "synthetic", "workflow-status");
ensureConfinedDirectory(root, statusRoot);
atomicWriteJson(resolveInside(statusRoot, `${status.job_id}.json`), status, { immutable: true, basePath: root });
process.stdout.write(`${JSON.stringify({ status: "published", job_id: status.job_id })}\n`);
