import assert from "node:assert/strict";
import { test } from "node:test";

import { handleProfile } from "../src/router.mjs";

test("the default profile path lowercases display names", () => {
  assert.deepEqual(handleProfile({ id: 7, name: "  Ada Lovelace  " }), {
    name: "ada lovelace",
    id: 7,
  }, "OC_HARNESS_VISIBLE_ASSERTION_MARKER:quality-alternate-config-path:v1");
});
