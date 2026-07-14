import assert from "node:assert/strict";
import { test } from "node:test";
import { readAny, rollbackV2, writeV2 } from "../src/migration.mjs";

test("new writes remain old-reader compatible and roll back losslessly", () => {
  const payload = writeV2({ name: " Ada " });
  const oldReader = (value) => value.name;
  assert.equal(oldReader(payload), "Ada");
  assert.equal(readAny({ version: 1, name: "Grace" }), "Grace");
  assert.deepEqual(rollbackV2(payload), { version: 1, name: "Ada" });
});
