import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluatePairedDefects } from "../lib/benchmark/paired-defect-evaluator.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, "benchmarks", "calibration", name), "utf8"));
const blinded = read("paired-defects-p0-p52.blinded.v1.json");

assert.equal(blinded.schema_version, 1);
assert.equal(blinded.evidence_use, "calibration-only-not-confirmatory");
assert.equal(new Set(blinded.cases.map((entry) => entry.case_id)).size, blinded.cases.length);
assert(blinded.cases.length > 0);

// Evaluate every opaque case before opening the answer key. Profile IDs,
// decisions, prompts, and aggregate campaign outcomes are absent from the
// evaluator input by construction.
const observed = Object.fromEntries(blinded.cases.map((entry) => {
  const result = evaluatePairedDefects({ baseline: entry.baseline, candidate: entry.candidate });
  return [entry.case_id, {
    relation: result.relations[0]?.relation ?? null,
    new_critical_regression: result.new_critical_regression,
    new_high_medium_regression: result.new_high_medium_regression,
    resolved_critical_defect: result.resolved_critical_defect,
    resolved_high_medium_defect: result.resolved_high_medium_defect,
    unchanged_blocking_defect: result.unchanged_blocking_defect,
  }];
}));

const key = read("paired-defects-p0-p52.answers.v1.json");
assert.equal(key.schema_version, 1);
assert.equal(key.calibration_id, blinded.calibration_id);
assert.equal(key.evidence_use, "calibration-only-not-confirmatory");
assert.deepEqual(observed, key.answers);

process.stdout.write(`${JSON.stringify({
  status: "passed",
  evidence_class: "blinded-calibration",
  confirmatory_evidence: false,
  calibration_id: blinded.calibration_id,
  case_count: blinded.cases.length,
}, null, 2)}\n`);
