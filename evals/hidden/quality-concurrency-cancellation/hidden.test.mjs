import assert from "node:assert/strict";
import { test } from "node:test";
import { executeTask } from "../src/pool.mjs";

test("cancellation and rejection release the active slot", async () => {
  const aborted = new AbortController();
  aborted.abort();
  const tracker = { active: 0 };
  await assert.rejects(
    executeTask(async () => 9, { signal: aborted.signal, tracker }),
    (error) => error?.name === "AbortError",
  );
  assert.equal(tracker.active, 0);

  await assert.rejects(
    executeTask(async () => { throw new Error("task failed"); }, { tracker }),
    /task failed/,
  );
  assert.equal(tracker.active, 0);
});
