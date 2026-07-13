import assert from "node:assert/strict";
import { test } from "node:test";
import { configKeys } from "../src/config-keys.mjs";

test("configuration helper returns key names only", () => {
  assert.deepEqual(configKeys("MODE=fixture\nPORT=3000\n"), ["MODE", "PORT"]);
});
