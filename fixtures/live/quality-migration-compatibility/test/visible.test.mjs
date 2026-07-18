import assert from "node:assert/strict";
import { test } from "node:test";
import { readAny, writeV2 } from "../src/migration.mjs";

test("the new writer and reader normalize display names", () => {
  const payload = writeV2({ name: " Ada " });
  assert.equal(readAny(payload), "Ada", "OC_HARNESS_VISIBLE_ASSERTION_MARKER:quality-migration-compatibility:v1");
  assert.equal(payload.version, 2);
});
