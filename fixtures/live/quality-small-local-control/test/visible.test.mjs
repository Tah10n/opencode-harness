import assert from "node:assert/strict";
import { test } from "node:test";
import { label } from "../src/label.mjs";

test("labels use uppercase display text", () => {
  assert.equal(label(" ready "), "READY", "OC_HARNESS_VISIBLE_ASSERTION_MARKER:quality-small-local-control:v1");
});
