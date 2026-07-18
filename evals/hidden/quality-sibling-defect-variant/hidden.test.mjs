import assert from "node:assert/strict";
import { test } from "node:test";

import { smsAlias } from "../src/sms.mjs";

test("the analogous SMS sibling uses the same normalization contract", () => {
  assert.equal(smsAlias("  Support Team  "), "support-team");
});
