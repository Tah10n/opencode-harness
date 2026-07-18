import assert from "node:assert/strict";
import { test } from "node:test";
import { userRecord } from "../src/consumer.mjs";

test("the API exposes a normalized displayName", () => {
  assert.equal(userRecord({ id: 7, name: " Ada " }).displayName, "Ada", "OC_HARNESS_VISIBLE_ASSERTION_MARKER:quality-public-api-compatibility:v1");
});
