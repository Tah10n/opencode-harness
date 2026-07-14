import assert from "node:assert/strict";
import { test } from "node:test";
import { executeTask } from "../src/pool.mjs";

test("normal execution returns the task result and releases the slot", async () => {
  const tracker = { active: 0 };
  assert.equal(await executeTask(async () => 7, { tracker }), 7);
  assert.equal(tracker.active, 0);
});
