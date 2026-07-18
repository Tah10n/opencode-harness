import assert from "node:assert/strict";
import { test } from "node:test";
import { createManagedClient } from "../src/client.mjs";

test("normal start returns the resource value and stop closes it", async () => {
  let closes = 0;
  const client = createManagedClient(() => ({
    async open() {},
    value: 42,
    async close() { closes += 1; },
  }));
  assert.equal(await client.start(), 42, "OC_HARNESS_VISIBLE_ASSERTION_MARKER:quality-resource-lifecycle:v1");
  await client.stop();
  assert.equal(closes, 1);
});
