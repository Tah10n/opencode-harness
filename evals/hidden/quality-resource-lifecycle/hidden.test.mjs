import assert from "node:assert/strict";
import { test } from "node:test";
import { createManagedClient } from "../src/client.mjs";

test("close is idempotent and initialization failure is cleaned up", async () => {
  let closes = 0;
  const client = createManagedClient(() => ({
    async open() {},
    value: 5,
    async close() { closes += 1; },
  }));
  assert.equal(await client.start(), 5);
  await client.stop();
  await client.stop();
  assert.equal(closes, 1);

  let failedCloses = 0;
  const failed = createManagedClient(() => ({
    async open() { throw new Error("open failed"); },
    value: 0,
    async close() { failedCloses += 1; },
  }));
  await assert.rejects(failed.start(), /open failed/);
  assert.equal(failedCloses, 1);
});
