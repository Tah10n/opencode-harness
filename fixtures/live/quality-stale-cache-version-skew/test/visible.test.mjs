import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/cache.mjs";

test("an empty cache is populated from the dependency", async () => {
  const cache = new Map();
  const value = await loadConfig(cache, async () => ({ schemaVersion: 2, value: "fresh" }));
  assert.equal(value, "fresh");
  assert.deepEqual(cache.get("config"), { schemaVersion: 2, value: "fresh" });
});
