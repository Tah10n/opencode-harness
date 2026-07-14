import assert from "node:assert/strict";
import { test } from "node:test";
import { loadProfile } from "../src/profile.mjs";

test("availability failures degrade but invalid contracts remain failures", async () => {
  const unavailable = Object.assign(new Error("offline"), { code: "E_UNAVAILABLE" });
  assert.deepEqual(
    await loadProfile(async () => { throw unavailable; }, async () => ({ id: "cached", name: "Grace" })),
    { id: "cached", name: "Grace" },
  );

  const invalid = Object.assign(new Error("bad payload"), { code: "E_INVALID_RESPONSE" });
  await assert.rejects(
    loadProfile(async () => { throw invalid; }, async () => ({ id: "cached", name: "Grace" })),
    (error) => error === invalid,
  );
});
