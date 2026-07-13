import assert from "node:assert/strict";
import { test } from "node:test";
import { greet } from "../src/greeting.mjs";

test("named greeting uses documented punctuation", () => {
  assert.equal(greet("Ada"), "Hello, Ada!");
});
