import assert from "node:assert/strict";
import { test } from "node:test";
import { loadProfile } from "../src/profile.mjs";

test("the primary dependency result is preserved", async () => {
  assert.deepEqual(
    await loadProfile(async () => ({ id: "u1", name: "Ada" }), async () => null),
    { id: "u1", name: "Ada" },
    "OC_HARNESS_VISIBLE_ASSERTION_MARKER:quality-partial-dependency-failure:v1",
  );
});
