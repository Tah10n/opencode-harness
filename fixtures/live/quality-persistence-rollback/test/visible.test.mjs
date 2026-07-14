import assert from "node:assert/strict";
import { test } from "node:test";
import { transfer } from "../src/store.mjs";

test("a successful transfer preserves total value", () => {
  const store = { source: 10, target: 1 };
  assert.equal(transfer(store, "source", "target", 4), true);
  assert.deepEqual(store, { source: 6, target: 5 });
});
