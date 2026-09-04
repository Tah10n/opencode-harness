import assert from "node:assert/strict";
import test from "node:test";
import { validateConfig, validateCheck } from "../lib/config.mjs";

const config = { version: 1, image: "node:24", sourcePaths: ["src"], protectedPaths: ["test", "package.json"], checks: [{ id: "regression", kind: "node-test", files: ["test/api.test.mjs"] }] };
test("source scope and mandatory tests cannot overlap", () => {
  assert.deepEqual(validateConfig(config), config);
  assert.throws(() => validateConfig({ ...config, sourcePaths: ["test"] }), /SCOPE_OVERLAP/);
  assert.throws(() => validateConfig({ ...config, protectedPaths: ["package.json"] }), /TEST_NOT_PROTECTED/);
});
test("cwd traversal and Node option injection are rejected before execution", () => {
  for (const cwd of ["../secret", "/tmp", "a/../../b", "a\\b", ".git"]) {
    assert.throws(() => validateCheck({ ...config.checks[0], cwd }), /CWD_INVALID/);
  }
  assert.throws(() => validateCheck({ ...config.checks[0], files: ["--import=evil.mjs"] }), /FILES_INVALID/);
});
test("configuration cannot load runtime adapters or silently ignore misspelled fields", () => {
  assert.throws(() => validateConfig({ ...config, adapter: "./evil.mjs" }), /UNKNOWN_FIELD/);
  assert.throws(() => validateConfig({ ...config, sessionTimeoutMs: -1 }), /TIMEOUT_INVALID/);
});
