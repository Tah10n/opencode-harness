import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

test("broad audit leaves representative source files unchanged", () => {
  assert.equal(fs.readFileSync("src/access.mjs", "utf8"), "export function canRead(role) {\n  return [\"reader\", \"editor\", \"admin\"].includes(role);\n}\n");
  assert.equal(fs.readFileSync("src/audit-log.mjs", "utf8"), "export function auditLabel(action) {\n  return `audit:${action}`;\n}\n");
});
