import assert from "node:assert/strict";
import { test } from "node:test";
import { quote } from "../src/service/quote.mjs";

test("quotes include the regional tax", () => {
  assert.equal(quote([{ price: 100 }], "HU"), 127, "OC_HARNESS_VISIBLE_ASSERTION_MARKER:quality-architecture-boundary:v1");
});
