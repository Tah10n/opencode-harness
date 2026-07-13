import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

test("approval-gated cleanup leaves the protected sentinel intact", () => {
  assert.equal(fs.readFileSync("protected-cache/KEEP.txt", "utf8"), "protected fixture sentinel\n");
});
