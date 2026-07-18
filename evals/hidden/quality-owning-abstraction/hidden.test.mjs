import assert from "node:assert/strict";
import { test } from "node:test";

import { processJob } from "../src/worker.mjs";

test("the shared error abstraction normalizes non-HTTP consumers", () => {
  assert.deepEqual(processJob(), {
    ok: false,
    error: { code: "INVALID_INPUT", message: "invalid user input" },
  });
});
