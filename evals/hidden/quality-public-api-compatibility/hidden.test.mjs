import assert from "node:assert/strict";
import { test } from "node:test";
import { userRecord } from "../src/api.mjs";

test("new output preserves legacy fields and validation semantics", () => {
  assert.deepEqual(userRecord({ id: 7, name: " Ada " }), {
    id: "7",
    name: "Ada",
    displayName: "Ada",
  });
  assert.throws(
    () => userRecord({ id: 8 }),
    (error) => error instanceof TypeError && error.code === "ERR_USER_INPUT" && error.message === "invalid user",
  );
});
