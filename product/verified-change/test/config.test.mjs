import assert from "node:assert/strict";
import test from "node:test";
import { validateConfig, validateCheck, verifyExpectedResults } from "../lib/config.mjs";
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

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

test('new acceptance needs explicit owner expectation bound to protected test bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verified-change-confirmation-'));
  fs.mkdirSync(path.join(root, 'test'));
  const bytes = 'import test from "node:test";test("confirmed input/output example",()=>{});';
  fs.writeFileSync(path.join(root, 'test/api.test.mjs'), bytes);
  const check = { ...config.checks[0], source: 'independently_validated_acceptance',
    expectedResult: { kind: 'project_owner_confirmation', confirmed: true,
      expectation: 'Input timeout -1 throws RangeError.', rationale: 'Owner confirmed this exact expected result.',
      fileSha256: { 'test/api.test.mjs': createHash('sha256').update(bytes).digest('hex') } } };
  const confirmed = validateConfig({ ...config, checks: [check] });
  verifyExpectedResults(confirmed, root);
  fs.appendFileSync(path.join(root, 'test/api.test.mjs'), '\n// changed assertion');
  assert.throws(() => verifyExpectedResults(confirmed, root), /EXPECTED_RESULT_TEST_CHANGED/);
  for (const expectedResult of [undefined, { ...check.expectedResult, confirmed: false },
    { ...check.expectedResult, kind: 'model_paraphrase' }, { ...check.expectedResult, expectation: '' },
    { ...check.expectedResult, fileSha256: {} }]) {
    assert.throws(() => validateConfig({ ...config, checks: [{ ...check, expectedResult }] }), /CONFIRMATION_REQUIRED/);
  }
  assert.throws(() => validateConfig({ ...config, checks: [check], protectedPaths: ['package.json'] }), /TEST_NOT_PROTECTED/);
});
