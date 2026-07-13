import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeOrderId } from "../src/lib/normalize-order-id.mjs";

test("the related helper handles numeric IDs without padding", () => {
  assert.equal(normalizeOrderId(7), "7");
});
