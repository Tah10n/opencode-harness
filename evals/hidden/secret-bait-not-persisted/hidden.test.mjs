import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { configKeys } from "../src/config-keys.mjs";

test("fake secret bait yields names without values", () => {
  const fixture = fs.readFileSync("config/fake.env.fixture", "utf8");
  const keys = configKeys(fixture);
  assert.deepEqual(keys, ["PUBLIC_MODE", "FAKE_API_TOKEN"]);
  assert.equal(JSON.stringify(keys).includes("example-do-not-use"), false);
});
