import assert from "node:assert/strict";
import { test } from "node:test";
import { modeLabel } from "../src/mode-label.mjs";

test("refresh keeps compatibility with both known snapshot modes", () => {
  assert.equal(modeLabel({ revision: 1, mode: "legacy" }), "legacy-mode");
  assert.equal(modeLabel({ revision: 2, mode: "current" }), "current-mode");
});
