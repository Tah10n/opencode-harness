import assert from "node:assert/strict";
import { test } from "node:test";
import { alphaAlias } from "../src/alpha.mjs";
import { betaAlias } from "../src/beta.mjs";
import { aliases } from "../src/registry.mjs";

test("short aliases are registered with both handlers", () => {
  assert.equal(alphaAlias(), "a");
  assert.equal(betaAlias(), "b");
  assert.deepEqual(aliases, ["alpha", "a", "beta", "b"]);
});
