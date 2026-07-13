import assert from "node:assert/strict";
import { test } from "node:test";
import { countRecords } from "../src/count-records.mjs";

test("every non-empty record is counted as data", () => {
  assert.equal(countRecords("one\ntwo\nthree\n"), 3);
});
