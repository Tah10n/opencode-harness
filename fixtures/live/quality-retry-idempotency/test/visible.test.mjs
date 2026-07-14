import assert from "node:assert/strict";
import { test } from "node:test";
import { deliver } from "../src/events.mjs";

test("first delivery records one side effect", () => {
  const state = { processed: new Set(), effects: [] };
  assert.equal(deliver({ id: "evt-1", value: 5 }, state), true);
  assert.deepEqual(state.effects, [5]);
});
