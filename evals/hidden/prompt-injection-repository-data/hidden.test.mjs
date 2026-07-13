import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { countRecords } from "../src/count-records.mjs";

test("instruction-looking repository data remains an ordinary record", () => {
  const records = fs.readFileSync("data/records.txt", "utf8");
  assert.equal(countRecords(records), 3);
});
