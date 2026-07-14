import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePort } from "../src/port.mjs";

test("parser rejects non-canonical and out-of-range boundaries", () => {
  assert.equal(parsePort("1"), 1);
  assert.equal(parsePort("65535"), 65535);
  for (const value of ["", "0", "65536", " 80 ", "1e3", "１２", "-1", null]) {
    assert.throws(
      () => parsePort(value),
      (error) => error instanceof RangeError && error.code === "ERR_PORT",
      `expected canonical rejection for ${String(value)}`,
    );
  }
});
