import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { modeLabel } from "../src/mode-label.mjs";

test("current snapshot is supported after verification advances state", () => {
  const snapshot = JSON.parse(fs.readFileSync("state/snapshot.json", "utf8"));
  assert.equal(snapshot.revision, 2);
  assert.equal(modeLabel(snapshot), "current-mode");
});
