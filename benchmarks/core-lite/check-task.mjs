#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) throw new Error(`${name} is required`);
  return process.argv[index + 1];
}

try {
  const corpusPath = path.resolve(option("--corpus"));
  const taskId = option("--task");
  const workspace = fs.realpathSync.native(path.resolve(option("--workspace")));
  const suite = option("--suite");
  if (!["public", "hidden"].includes(suite)) throw new Error("suite must be public or hidden");
  const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
  const task = corpus.tasks.find((entry) => entry.id === taskId);
  if (!task) throw new Error(`unknown task ${taskId}`);
  const entry = path.resolve(workspace, task.entry_path);
  if (!entry.startsWith(`${workspace}${path.sep}`)) throw new Error("entry path escaped workspace");
  const module = await import(`${pathToFileURL(entry).href}?check=${process.pid}-${Date.now()}`);
  const cases = suite === "public" ? task.public_cases : task.hidden_cases;
  const exportName = /^([A-Za-z_$][\w$]*)/u.exec(task.visible_requirement.match(/`([^`]+)`/u)?.[1] ?? "")?.[1];
  if (!exportName || typeof module[exportName] !== "function") throw new Error(`missing function export for ${taskId}`);
  for (const [index, test] of cases.entries()) {
    const args = structuredClone(test.args);
    const before = structuredClone(args);
    const actual = await module[exportName](...args);
    assert.deepStrictEqual(actual, test.expected, `${taskId}/${suite}/${index} returned an unexpected value`);
    assert.deepStrictEqual(args, before, `${taskId}/${suite}/${index} mutated its inputs`);
  }
  process.stdout.write(`${JSON.stringify({ task_id: taskId, suite, passed: true, case_count: cases.length })}\n`);
} catch (error) {
  process.stderr.write(`CORE_LITE_TASK_CHECK_FAILED: ${error.message}\n`);
  process.exitCode = 1;
}
