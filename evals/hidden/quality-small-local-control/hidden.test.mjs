import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { label } from "../src/label.mjs";

test("the local fix remains one dependency-free source edit", () => {
  assert.equal(label(" ready "), "READY");
  assert.equal(label(""), "UNTITLED");
  assert.equal(fs.existsSync(new URL("../package.json", import.meta.url)), false);
  const source = fs.readFileSync(new URL("../src/label.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^\s*import\s/mu);
  assert(source.split(/\r?\n/u).filter(Boolean).length <= 5);
});
