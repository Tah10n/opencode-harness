const assert = require("node:assert/strict");
const { test } = require("node:test");

test("hidden check validates a non-public input", async () => {
  const { add } = await import("./src/app.js");
  assert.equal(add(-2, 5), 3);
});
