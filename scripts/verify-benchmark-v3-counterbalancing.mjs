#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildBenchmarkV3ArmOrderSchedule, validateBenchmarkV3ArmOrderSchedule } from "../lib/benchmark/v3-arm-order.mjs";
import { loadBenchmarkV3Corpus } from "../lib/benchmark/v3-corpus.mjs";
import { loadBenchmarkV3Design } from "../lib/benchmark/v3-design.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { value: design } = loadBenchmarkV3Design(root);
const corpus = loadBenchmarkV3Corpus(root);
const publicFamilies = (split) => corpus.families.filter((entry) => entry.split === split)
  .map((entry) => ({ family_id: entry.family_id, stratum: entry.stratum }));
const syntheticHoldout = ["small", "medium", "high"].flatMap((stratum) => Array.from({ length: 30 }, (_, index) => ({
  family_id: `v3-external-holdout-${stratum}-${String(index + 1).padStart(2, "0")}`, stratum,
})));

const development = buildBenchmarkV3ArmOrderSchedule({ policy: design.arm_order_schedule,
  split: "development", families: publicFamilies("development") });
assert.equal(development.entries.every((entry) => entry.order === "baseline-first"), true,
  "development may remain baseline-first only for the opportunity gate");

const checked = [];
for (const [split, families] of [["validation", publicFamilies("validation")], ["holdout", syntheticHoldout]]) {
  const schedule = buildBenchmarkV3ArmOrderSchedule({ policy: design.arm_order_schedule, split, families });
  assert.deepEqual(schedule, buildBenchmarkV3ArmOrderSchedule({ policy: design.arm_order_schedule, split, families }),
    `${split} schedule must reproduce exactly`);
  validateBenchmarkV3ArmOrderSchedule(schedule, { policy: design.arm_order_schedule, split, families });
  for (const stratum of ["small", "medium", "high"]) {
    const entries = schedule.entries.filter((entry) => entry.stratum === stratum);
    assert.equal(entries.filter((entry) => entry.order === "baseline-first").length, entries.length / 2);
    assert.equal(entries.filter((entry) => entry.order === "candidate-first").length, entries.length / 2);
  }
  const temporallyRebound = structuredClone(schedule);
  temporallyRebound.entries[0].order = temporallyRebound.entries[0].order === "baseline-first" ? "candidate-first" : "baseline-first";
  assert.throws(() => validateBenchmarkV3ArmOrderSchedule(temporallyRebound,
    { policy: design.arm_order_schedule, split, families }), /frozen deterministic schedule/u,
  `${split} temporal-order substitution must fail closed`);
  const familyReordered = structuredClone(schedule);
  [familyReordered.entries[0], familyReordered.entries[1]] = [familyReordered.entries[1], familyReordered.entries[0]];
  assert.throws(() => validateBenchmarkV3ArmOrderSchedule(familyReordered,
    { policy: design.arm_order_schedule, split, families }), /frozen deterministic schedule/u,
  `${split} schedule reordering must fail closed`);
  checked.push({ split, family_count: families.length, baseline_first: schedule.entries.filter((entry) => entry.order === "baseline-first").length,
    candidate_first: schedule.entries.filter((entry) => entry.order === "candidate-first").length,
    schedule_fingerprint: schedule.schedule_fingerprint });
}

process.stdout.write(`${JSON.stringify({ schema_version: 1, status: "passed", gate: "benchmark-v3-counterbalancing",
  model_calls: 0, development_baseline_first_for_opportunity_gate: true, checked, temporal_order_negative_cases: 4 }, null, 2)}\n`);
