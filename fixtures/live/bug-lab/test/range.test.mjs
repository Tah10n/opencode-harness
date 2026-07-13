import assert from "node:assert/strict";
import { test } from "node:test";
import { clamp } from "../src/range.mjs";

test("values above the maximum are clamped", () => {
  assert.equal(clamp(12, 0, 10), 10);
});
