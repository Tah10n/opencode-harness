import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildBoundedRepositoryMap,
  renderBoundedRepositoryMapContext,
} from "../lib/quality/bounded-repository-map.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "bounded-repository-map-"));
try {
  const files = {
    "src/public-api.mjs": 'export { execute } from "./service.mjs";\n',
    "src/service.mjs": 'import { parse } from "./parser.mjs"; export const execute = parse;\n',
    "src/parser.mjs": "export const parse = (value) => value;\n",
    "src/consumer.mjs": 'import { execute } from "./public-api.mjs"; export const run = execute;\n',
    "test/service.test.mjs": 'import { execute } from "../src/public-api.mjs";\n',
    "config/service.json": "{}\n",
    "docs/contract.md": "# service contract\n",
  };
  for (let index = 0; index < 20; index += 1) files[`src/unrelated-${index}.mjs`] = `export const value${index} = ${index};\n`;
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
  }
  const map = buildBoundedRepositoryMap({
    workspace_root: root,
    visible_paths: Object.keys(files),
    task_prompt: "Update the public service parser and preserve its consumer contract",
    required_relevant_paths: ["src/public-api.mjs", "src/service.mjs", "src/parser.mjs", "test/service.test.mjs"],
    required_consumer_paths: ["src/consumer.mjs"],
  });
  assert(map.entries.length <= 20);
  assert(map.context_bytes <= 12_000);
  assert.equal(Buffer.byteLength(JSON.stringify(map), "utf8"), map.context_bytes);
  assert.equal(map.relevant_file_recall, 1);
  assert.equal(map.consumer_recall, 1);
  assert(map.context_precision > 0);
  assert.match(renderBoundedRepositoryMapContext(map), /^HOST_REPOSITORY_MAP_V1=/u);
  const unlabeledMap = buildBoundedRepositoryMap({
    workspace_root: root,
    visible_paths: Object.keys(files),
    task_prompt: "Update the public service parser and preserve its consumer contract",
  });
  assert.deepEqual(
    map.entries,
    unlabeledMap.entries,
    "measurement labels must not influence repository-map selection or ranking",
  );
  assert.throws(() => buildBoundedRepositoryMap({
    workspace_root: root,
    visible_paths: ["../escape"],
    task_prompt: "x",
  }), /BOUNDED_REPOSITORY_MAP_PATH/u);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "bounded-repository-map-outside-"));
  try {
    fs.writeFileSync(path.join(outside, "outside.mjs"), "export const outside = true;\n", "utf8");
    fs.symlinkSync(outside, path.join(root, "linked"), "dir");
    assert.throws(() => buildBoundedRepositoryMap({
      workspace_root: root,
      visible_paths: ["linked/outside.mjs"],
      task_prompt: "outside",
    }), /BOUNDED_REPOSITORY_MAP_ESCAPE/u);
  } finally {
    fs.rmSync(path.join(root, "linked"), { force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

process.stdout.write("bounded repository map passed\n");
