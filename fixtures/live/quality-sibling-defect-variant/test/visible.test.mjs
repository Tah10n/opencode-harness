import assert from "node:assert/strict";
import { test } from "node:test";

import { emailAlias } from "../src/email.mjs";

test("email aliases are lowercase and dash-separated", () => {
  assert.equal(emailAlias("  Sales Team  "), "sales-team", "OC_HARNESS_VISIBLE_ASSERTION_MARKER:quality-sibling-defect-variant:v1");
});
