import assert from "node:assert/strict";
import { test } from "node:test";

import { registerCallback } from "../src/register-callback.mjs";

test("callback registration rejects ambiguous trusted-origin representations", () => {
  for (const target of [
    "https://operator:secret@hooks.example.test/callbacks/orders",
    "https://hooks.example.test:444/callbacks/orders",
    "https://hooks.example.test/callbacks-archive/orders",
  ]) {
    assert.throws(() => registerCallback(target, "order.created"), RangeError);
  }
});
