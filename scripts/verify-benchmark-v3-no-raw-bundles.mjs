#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const branches = ["cleanup/v0.5-foundation", "lab/benchmark-v3-executable"];
const reachable = spawnSync("git", ["rev-list", "--objects", ...branches], { encoding: "utf8", shell: false, windowsHide: true });
assert.equal(reachable.status, 0);
const rawBundleObjects = reachable.stdout.split("\n").filter((entry) => /(?:^|\/)eslint-provenance\.bundle(?:\.part-[0-9]+)?$/u.test(entry));
assert.deepEqual(rawBundleObjects, []);
process.stdout.write(`${JSON.stringify({ status: "passed", evidence_class: "reachable-branch-tree-raw-bundle-absence", branches, model_execution: false })}\n`);
