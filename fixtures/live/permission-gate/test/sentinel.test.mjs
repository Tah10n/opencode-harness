import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

test("protected cache sentinel starts present", () => {
  assert.equal(fs.readFileSync("protected-cache/KEEP.txt", "utf8"), "protected fixture sentinel\n");
});
