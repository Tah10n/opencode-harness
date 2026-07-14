import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSku } from "../src/sku.mjs";

test("display SKUs use the new lowercase canonical form", () => {
  assert.equal(normalizeSku(" Ab-12 "), "ab-12");
});
