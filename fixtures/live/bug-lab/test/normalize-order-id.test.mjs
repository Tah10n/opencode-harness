import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeOrderId } from "../src/lib/normalize-order-id.mjs";

test("related helper trims IDs", () => {
  assert.equal(normalizeOrderId(" A-7 "), "A-7");
});
