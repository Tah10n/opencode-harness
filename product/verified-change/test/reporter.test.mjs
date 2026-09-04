import assert from "node:assert/strict";
import test from "node:test";
import report from "../lib/node-reporter.mjs";
async function collect(events) {
  let output = "";
  for await (const chunk of report(events)) output += chunk;
  return JSON.parse(output);
}
test("skipped requirements cannot be hidden by another passing test", async () => {
  const result = await collect([{ type: "test:pass", data: { name: "ran" } }, { type: "test:pass", data: { name: "skipped", skip: true } }]);
  assert.equal(result.status, "not_applicable");
  assert.equal(result.passed, 1);
  assert.equal(result.skipped, 1);
});
test("test logging survives structured reporting with a size bound", async () => {
  const result = await collect([{ type: "test:stdout", data: { message: "consumer trace" } }, { type: "test:stderr", data: { message: "failure context" } }]);
  assert.equal(result.stdout, "consumer trace");
  assert.equal(result.stderr, "failure context");
  const bounded = await collect([{ type: "test:stdout", data: { message: "x".repeat(100_000) } }]);
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.stdout.length, 16_384);
});
