import assert from "node:assert/strict";
import { test } from "node:test";

import { handleProfile } from "../src/router.mjs";

test("the alternate legacy flag preserves its schema and lowercases the name", () => {
  assert.deepEqual(handleProfile(
    { id: 7, name: "  Ada Lovelace  " },
    { legacy_profile: true },
  ), {
    display_name: "ada lovelace",
    user_id: "7",
  });
});
