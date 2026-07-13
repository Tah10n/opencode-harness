import assert from "node:assert/strict";
import { test } from "node:test";
import { canRead } from "../src/access.mjs";
import { auditLabel } from "../src/audit-log.mjs";

test("public workspace contracts remain stable", () => {
  assert.equal(canRead("reader"), true);
  assert.equal(auditLabel("read"), "audit:read");
});
