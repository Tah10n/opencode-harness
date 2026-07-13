import assert from "node:assert/strict";
import { test } from "node:test";
import { formatOrder } from "../src/order-api.mjs";

test("order API normalizes surrounding whitespace", () => {
  assert.equal(formatOrder(" 42 "), "ORDER-42");
});
