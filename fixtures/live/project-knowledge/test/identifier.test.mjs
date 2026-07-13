import assert from "node:assert/strict";
import { test } from "node:test";
import { identifier } from "../src/identifier.mjs";

test("identifier follows the local workflow prefix", () => {
  assert.equal(identifier("42"), "LOCAL-42");
});
