import assert from "node:assert/strict";
import { test } from "node:test";

import { renderToken } from "../src/view.mjs";

test("display tokens are lowercase", () => {
  assert.equal(renderToken(" Ab-12 "), "token:ab-12", "OC_HARNESS_VISIBLE_ASSERTION_MARKER:quality-hidden-reexport-consumer:v1");
});
