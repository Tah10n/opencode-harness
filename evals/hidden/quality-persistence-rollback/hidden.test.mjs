import assert from "node:assert/strict";
import { test } from "node:test";
import { transfer } from "../src/store.mjs";

test("failed and invalid transfers leave both balances unchanged", () => {
  const failed = { source: 10, target: 1 };
  assert.throws(() => transfer(failed, "source", "target", 4, { failAfterDebit: true }), /injected/);
  assert.deepEqual(failed, { source: 10, target: 1 });

  const insufficient = { source: 2, target: 1 };
  assert.throws(() => transfer(insufficient, "source", "target", 4), /insufficient/);
  assert.deepEqual(insufficient, { source: 2, target: 1 });
});
