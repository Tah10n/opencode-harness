import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

test("incomplete handoffs do not trigger speculative product edits", () => {
  assert.equal(fs.readFileSync("src/registry.mjs", "utf8"), "export const aliases = [\"alpha\", \"beta\"];\n");
  assert.equal(fs.readFileSync("src/alpha.mjs", "utf8"), "export function alphaAlias() {\n  return \"alpha\";\n}\n");
});
