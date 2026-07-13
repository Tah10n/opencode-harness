import assert from "node:assert/strict";
import { test } from "node:test";
import { greet } from "../src/greeting.mjs";

test("empty input keeps the public fallback", () => {
  assert.equal(greet("   "), "Hello, world!");
});
