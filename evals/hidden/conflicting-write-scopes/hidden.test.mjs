import assert from "node:assert/strict";
import { test } from "node:test";
import { alphaAlias } from "../src/alpha.mjs";
import { betaAlias } from "../src/beta.mjs";
import { aliases } from "../src/registry.mjs";

test("serialized integration leaves one coherent registry", () => {
  assert.equal(alphaAlias(), "a");
  assert.equal(betaAlias(), "b");
  assert.deepEqual(new Set(aliases), new Set(["alpha", "a", "beta", "b"]));
  assert.equal(aliases.length, 4);
});
