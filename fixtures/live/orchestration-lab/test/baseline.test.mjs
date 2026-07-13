import assert from "node:assert/strict";
import { test } from "node:test";
import { aliases } from "../src/registry.mjs";

test("baseline registry remains parseable", () => {
  assert.equal(Array.isArray(aliases), true);
});
