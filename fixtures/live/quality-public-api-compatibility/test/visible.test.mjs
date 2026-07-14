import assert from "node:assert/strict";
import { test } from "node:test";
import { userRecord } from "../src/api.mjs";

test("the API exposes a normalized displayName", () => {
  assert.equal(userRecord({ id: 7, name: " Ada " }).displayName, "Ada");
});
