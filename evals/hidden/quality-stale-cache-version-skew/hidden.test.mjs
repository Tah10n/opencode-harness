import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/cache.mjs";

test("a schema-v1 entry is refreshed before a schema-v2 read", async () => {
  const cache = new Map([["config", { schemaVersion: 1, value: "stale" }]]);
  let calls = 0;
  const value = await loadConfig(cache, async () => {
    calls += 1;
    return { schemaVersion: 2, value: "fresh" };
  });
  assert.equal(value, "fresh");
  assert.equal(calls, 1);
  assert.deepEqual(cache.get("config"), { schemaVersion: 2, value: "fresh" });
});
