import assert from "node:assert/strict";
import { test } from "node:test";
import { clamp } from "../src/range.mjs";

test("clamp preserves exact boundaries and handles the lower edge", () => {
  assert.equal(clamp(10, 0, 10), 10);
  assert.equal(clamp(-4, 0, 10), 0);
});
