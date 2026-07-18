import assert from "node:assert/strict";
import { test } from "node:test";

import { handleHttp } from "../src/http.mjs";

test("HTTP validation errors expose a normalized message", () => {
  assert.deepEqual(handleHttp(), {
    status: 400,
    body: { code: "INVALID_INPUT", message: "invalid user input" },
  }, "OC_HARNESS_VISIBLE_ASSERTION_MARKER:quality-owning-abstraction:v1");
});
