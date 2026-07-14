import assert from "node:assert/strict";
import { test } from "node:test";
import { inventoryKey } from "../src/inventory.mjs";
import { normalizeSku } from "../src/sku.mjs";

test("lowercase display normalization preserves the uppercase inventory invariant", () => {
  assert.equal(normalizeSku(" Cd-34 "), "cd-34");
  assert.equal(inventoryKey("tenant-a", " Cd-34 "), "tenant-a:CD-34");
});
