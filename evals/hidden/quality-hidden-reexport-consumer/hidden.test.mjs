import assert from "node:assert/strict";
import { test } from "node:test";

import { workerKey } from "../apps/worker/key.mjs";
import { publicToken } from "../packages/api/index.mjs";

test("the hidden re-export consumer keeps the public uppercase contract", () => {
  assert.equal(publicToken(" Ab-12 "), "AB-12");
  assert.equal(workerKey(" Ab-12 "), "job:AB-12");
});
