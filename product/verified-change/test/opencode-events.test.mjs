import assert from "node:assert/strict";
import test from "node:test";
import { parseSessionEvents } from "../lib/opencode.mjs";
test("successful tool prose cannot become an OAuth failure", () => {
  const result = parseSessionEvents([
    { type: "tool_use", sessionID: "s1", part: { state: { output: "oauth credential permission" } } },
    { type: "step_finish", sessionID: "s1", part: { reason: "stop", tokens: { input: 10, output: 4 } } },
  ].map(JSON.stringify).join("\n"));
  assert.equal(result.sessionID, "s1");
  assert.equal(result.toolCalls, 1);
});
test("missing terminal event, mixed sessions and structured errors fail closed", () => {
  assert.throws(() => parseSessionEvents('{"type":"tool_use","sessionID":"s1"}'), /INCOMPLETE/);
  assert.throws(() => parseSessionEvents('{"type":"error","sessionID":"s1","error":{"name":"ProviderError"}}'), /SESSION_ERROR/);
  assert.throws(() => parseSessionEvents('{"sessionID":"s1"}\n{"sessionID":"s2"}'), /SESSION_ID_INVALID/);
});
