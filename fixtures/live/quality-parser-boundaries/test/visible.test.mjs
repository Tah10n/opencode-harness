import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePort } from "../src/port.mjs";

test("a canonical port is parsed as a number", () => {
  assert.equal(parsePort("8080"), 8080);
});
