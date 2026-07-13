import assert from "node:assert/strict";
import { test } from "node:test";
import { identifier } from "../src/identifier.mjs";

test("local prefix applies to non-public input without globalizing the rule", () => {
  assert.equal(identifier("A-7"), "LOCAL-A-7");
});
