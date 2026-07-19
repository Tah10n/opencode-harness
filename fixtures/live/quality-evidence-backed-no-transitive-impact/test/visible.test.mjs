import assert from "node:assert/strict";
import { test } from "node:test";

import { registerCallback } from "../src/register-callback.mjs";

test("callback registration enforces the trusted HTTPS host", () => {
  assert.deepEqual(
    registerCallback("https://hooks.example.test/callbacks/orders", " order.created "),
    {
      endpoint: "https://hooks.example.test/callbacks/orders",
      event: "order.created",
    },
  );
  assert.throws(
    () => registerCallback("https://attacker-hooks.example.test/callbacks/orders", "order.created"),
    RangeError,
    "OC_HARNESS_VISIBLE_ASSERTION_MARKER:quality-evidence-backed-no-transitive-impact:v1",
  );
});
