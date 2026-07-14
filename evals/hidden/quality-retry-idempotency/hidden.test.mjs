import assert from "node:assert/strict";
import { test } from "node:test";
import { deliver } from "../src/events.mjs";

test("duplicate and out-of-order retries do not repeat side effects", () => {
  const state = { processed: new Set(), effects: [] };
  assert.equal(deliver({ id: "evt-2", value: 8 }, state), true);
  assert.equal(deliver({ id: "evt-2", value: 8 }, state), false);
  assert.equal(deliver({ id: "evt-1", value: 3 }, state), true);
  assert.deepEqual(state.effects, [8, 3]);
  assert.deepEqual([...state.processed].sort(), ["evt-1", "evt-2"]);
});
