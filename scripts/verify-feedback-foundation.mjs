import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalJson, fingerprint } from "../lib/feedback/contracts.mjs";
import {
  assertPersistenceSafe,
  assertSafePersistenceId,
  assertNoForbiddenPersistenceKeys,
  isAbsoluteLikePath,
  normalizeRelativePath,
  sanitizeBoundedString,
  sanitizeBoundedValue,
} from "../lib/feedback/privacy.mjs";
import {
  assertNoSymlinkEscape,
  atomicWriteImmutable,
  atomicWriteMutable,
  ensureConfinedDirectory,
  publishImmutableSet,
  resolveInside,
  withExclusiveLock,
} from "../lib/feedback/files.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-feedback-foundation-"));

function rejects(fn, code) {
  assert.throws(fn, (error) => error?.code === code, `expected ${code}`);
}

try {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');
  assert.equal(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 }));
  const protoKey = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.notEqual(fingerprint(protoKey), fingerprint({}));
  assert.equal(canonicalJson(protoKey), '{"__proto__":{"polluted":true}}');

  const token = sanitizeBoundedString("FAKE_API_TOKEN=example-do-not-use");
  assert.equal(token.value, "[redacted]");
  assert(token.metadata.redactions.includes("secret_assignment"));
  for (const [value, reason, fragment] of [
    ['TOKEN="quoted-token-value"', "secret_assignment", "quoted-token-value"],
    ["Authorization: Bearer bearer-token-value", "bearer_token", "bearer-token-value"],
    ["Bearer standalone-token-value", "bearer_token", "standalone-token-value"],
    ["provider sk-proj-abcdefghijklmnop", "token_pattern", "abcdefghijklmnop"],
    ["jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123", "token_pattern", "signature123"],
    ["aws AKIA1234567890ABCDEF", "token_pattern", "AKIA1234567890ABCDEF"],
    ["google AIzaSyA1234567890abcdefghijk", "token_pattern", "AIzaSyA1234567890abcdefghijk"],
    ["github github_pat_11AA22BB33CC44DD", "token_pattern", "github_pat_11AA22BB33CC44DD"],
    ["scoped path /@scope/private/file", "absolute_path", "/@scope/private/file"],
    ["network path //srv/private/file", "absolute_path", "//srv/private/file"],
  ]) {
    const sanitized = sanitizeBoundedString(value);
    assert.equal(sanitized.value, "[redacted]");
    assert(sanitized.metadata.redactions.includes(reason));
    assert.equal(sanitized.value.includes(fragment), false);
  }
  const key = sanitizeBoundedString("-----BEGIN PRIVATE KEY----- fake");
  assert.equal(key.value, "[redacted]");
  assert(key.metadata.redactions.includes("private_key_marker"));

  for (const absolute of ["C:\\Users\\demo\\file.txt", "C:/Users/demo/file.txt", "\\\\server\\share\\file.txt", "\\\\?\\C:\\private", "/home/demo/file.txt", "/tmp/file.txt", "/srv/app/config", "/workspace/repo/file", "/data/private/value"]) {
    assert.equal(isAbsoluteLikePath(absolute), true, absolute);
    assert.equal(sanitizeBoundedString(absolute).value, "[redacted]", absolute);
  }
  assert.equal(normalizeRelativePath("src\\module.js"), "src/module.js");
  for (const unsafe of ["../secret", "src/../secret", "./src", "C:\\secret", "/etc/passwd", "\\\\server\\share", "src//file", "NUL"]) {
    rejects(() => normalizeRelativePath(unsafe), "PRIVACY_PATH");
  }

  const oversized = sanitizeBoundedString("x".repeat(20), { maxLength: 5 });
  assert.equal(oversized.value, "xxxxx");
  assert.equal(oversized.metadata.truncated, true);
  assert.equal(oversized.metadata.original_length, 20);
  const bounded = sanitizeBoundedValue({ values: ["a", "b", "c"], nested: { child: { leaf: "ok" } } }, {
    limits: { string: 5, summary: 5, array: 2, objectKeys: 1, depth: 2 },
  });
  assert.equal(bounded.metadata.truncated, true);
  assert.deepEqual(Object.keys(bounded.value), ["values"]);
  rejects(() => assertNoForbiddenPersistenceKeys({ safe: { stdout: "raw" } }), "PRIVACY_FORBIDDEN_FIELD");
  rejects(() => assertNoForbiddenPersistenceKeys({ transcript: "raw" }), "PRIVACY_FORBIDDEN_FIELD");
  rejects(() => assertSafePersistenceId("AKIA1234567890ABCDEF", "run_id"), "PRIVACY_ID");
  rejects(() => assertSafePersistenceId("github_pat_11AA22BB33CC44DD", "task_id"), "PRIVACY_ID");
  for (const unsafeId of ["CON", "NUL.txt", "COM1", "LPT9.log", "run."]) {
    rejects(() => assertSafePersistenceId(unsafeId, "portable_id"), "CONTRACT_ID");
  }
  assert.equal(assertSafePersistenceId("secret-bait-not-persisted", "scenario_id"), "secret-bait-not-persisted");
  assert.equal(assertPersistenceSafe({ scenario_id: "secret-bait-not-persisted" }).scenario_id, "secret-bait-not-persisted");
  rejects(() => assertPersistenceSafe({ note: "password: hunter2" }), "PRIVACY_UNSAFE_VALUE");
  rejects(() => assertPersistenceSafe({ model: "opaque-canary-value" }, { denyValues: ["opaque-canary-value"] }), "PRIVACY_DENY_VALUE");
  rejects(() => assertPersistenceSafe(Object.fromEntries([["opaque-canary-value", true]]), { denyValues: ["opaque-canary-value"] }), "PRIVACY_DENY_VALUE");
  rejects(() => assertPersistenceSafe(Object.fromEntries([["github_pat_11AA22BB33CC44DD", true]])), "PRIVACY_UNSAFE_KEY");
  rejects(() => assertPersistenceSafe({ nested: { value: "read /srv/private/file" } }), "PRIVACY_UNSAFE_VALUE");
  const boundedProto = sanitizeBoundedValue(JSON.parse('{"__proto__":"preserved"}'));
  assert.equal(Object.hasOwn(boundedProto.value, "__proto__"), true);
  assert.equal(boundedProto.value.__proto__, "preserved");

  const immutable = path.join(tmp, "immutable.json");
  atomicWriteImmutable(immutable, "first\n", { tempIdFactory: () => "one" });
  rejects(() => atomicWriteImmutable(immutable, "second\n", { tempIdFactory: () => "two" }), "FILES_IMMUTABLE_EXISTS");
  assert.equal(fs.readFileSync(immutable, "utf8"), "first\n");

  const mutable = path.join(tmp, "mutable.json");
  atomicWriteMutable(mutable, "one\n", { tempIdFactory: () => "three" });
  atomicWriteMutable(mutable, "two\n", { tempIdFactory: () => "four" });
  assert.equal(fs.readFileSync(mutable, "utf8"), "two\n");

  const failedTemp = path.join(tmp, "failed-temp.json");
  assert.throws(() => atomicWriteMutable(failedTemp, "nope\n", {
    tempIdFactory: () => "write-failure",
    afterTempWrite: () => { throw new Error("injected temp write failure"); },
  }), /injected temp write failure/);
  assert.equal(fs.existsSync(failedTemp), false);
  assert.equal(fs.readdirSync(tmp).some((entry) => entry.includes("write-failure.tmp")), false);

  const failedLock = path.join(tmp, "failed.lock");
  assert.throws(() => withExclusiveLock(failedLock, () => {}, {
    lockIdFactory: () => "lock-id",
    afterLockWrite: () => { throw new Error("injected lock write failure"); },
  }), /injected lock write failure/);
  assert.equal(fs.existsSync(failedLock), false);

  const originalFstatSync = fs.fstatSync;
  try {
    fs.fstatSync = () => {
      const error = new Error("injected identity read failure");
      error.code = "EIO";
      throw error;
    };
    const identityTemp = path.join(tmp, "identity-temp.json");
    assert.throws(() => atomicWriteMutable(identityTemp, "nope\n", {
      basePath: tmp,
      tempIdFactory: () => "identity",
    }), /injected identity read failure/);
    assert.equal(fs.existsSync(identityTemp), false);
    assert.equal(fs.existsSync(path.join(tmp, ".identity-temp.json.identity.tmp")), false);

    const identityLock = path.join(tmp, "identity.lock");
    assert.throws(() => withExclusiveLock(identityLock, () => {}, { basePath: tmp }), /injected identity read failure/);
    assert.equal(fs.existsSync(identityLock), false);
  } finally {
    fs.fstatSync = originalFstatSync;
  }

  const setDir = path.join(tmp, "set");
  fs.mkdirSync(setDir);
  const marker = path.join(setDir, "complete.json");
  assert.throws(() => publishImmutableSet({
    files: [
      { path: path.join(setDir, "report.json"), contents: "{}\n" },
      { path: path.join(setDir, "report.md"), contents: "# report\n" },
    ],
    markerPath: marker,
    markerValue: { complete: true },
  }, {
    tempIdFactory: (() => { let i = 0; return () => `set-${++i}`; })(),
    beforeMarker: () => { throw new Error("injected before marker"); },
  }), /injected before marker/);
  assert.equal(fs.existsSync(marker), false);

  rejects(() => resolveInside(tmp, "..", "escape"), "FILES_TRAVERSAL");

  const confined = path.join(tmp, "confined");
  const outside = path.join(tmp, "outside");
  fs.mkdirSync(confined);
  fs.mkdirSync(outside);
  const outsideSentinel = path.join(outside, "sentinel.txt");
  fs.writeFileSync(outsideSentinel, "unchanged", "utf8");
  const linkedParent = path.join(confined, "linked-parent");
  fs.symlinkSync(outside, linkedParent, process.platform === "win32" ? "junction" : "dir");
  rejects(() => assertNoSymlinkEscape(confined, path.join(linkedParent, "new.txt")), "FILES_SYMLINK");
  rejects(() => ensureConfinedDirectory(confined, path.join(linkedParent, "nested")), "FILES_SYMLINK");
  assert.equal(fs.readFileSync(outsideSentinel, "utf8"), "unchanged");
  assert.equal(fs.existsSync(path.join(outside, "new.txt")), false);

  const swapBase = path.join(tmp, "swap-base");
  const swapDirectory = path.join(swapBase, "artifacts");
  const movedDirectory = path.join(tmp, "swapped-outside");
  fs.mkdirSync(swapDirectory, { recursive: true });
  const swapTarget = path.join(swapDirectory, "result.json");
  rejects(() => atomicWriteMutable(swapTarget, "unsafe\n", {
    basePath: swapBase,
    tempIdFactory: () => "swap",
    beforeCommit: () => {
      fs.renameSync(swapDirectory, movedDirectory);
      fs.symlinkSync(movedDirectory, swapDirectory, process.platform === "win32" ? "junction" : "dir");
    },
  }), "FILES_SYMLINK");
  assert.equal(fs.existsSync(path.join(movedDirectory, "result.json")), false);
  fs.unlinkSync(swapDirectory);
  fs.rmSync(movedDirectory, { recursive: true, force: true });

  if (process.platform !== "win32") {
    const brokenTarget = path.join(confined, "broken-target");
    fs.symlinkSync(path.join(outside, "missing"), brokenTarget);
    rejects(() => assertNoSymlinkEscape(confined, brokenTarget), "FILES_SYMLINK");
  }

  console.log("Feedback foundation self-tests passed (redaction and physical confinement included).");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
