import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import {
  PROJECT_CHECK_LIMITS,
  PROJECT_CHECK_CATALOG_PATH,
  loadProjectCheckCatalog,
  parseProjectCheckCatalog,
  projectCheckCatalogFingerprint,
  validateProjectCheckCatalog,
} from "../lib/quality/project-check-catalog.mjs";
import { runTrustedProjectCheck } from "../lib/quality/trusted-project-runner.mjs";
import { ContractError } from "../lib/quality/validation.mjs";

const workspaceRoot = fs.realpathSync(new URL("..", import.meta.url));

function expectCode(callback, code) {
  assert.throws(callback, (error) => error instanceof ContractError && error.code === code);
}

function catalog(overrides = {}) {
  return {
    schema_version: 1,
    catalog_id: "fixture-checks-v1",
    checks: [{
      check_id: "fixture",
      argv: ["node", "--version"],
      cwd: ".",
      phases: ["preimplementation", "integration"],
      timeout_ms: 1000,
      max_output_chars: 4096,
    }],
    ...overrides,
  };
}

const loaded = loadProjectCheckCatalog(workspaceRoot);
const schema = JSON.parse(fs.readFileSync(path.join(workspaceRoot, "quality", "schemas", "project-check-catalog.schema.json"), "utf8"));
const example = JSON.parse(fs.readFileSync(path.join(workspaceRoot, "quality", "examples", "project-checks.example.json"), "utf8"));
assert.equal(schema.additionalProperties, false);
assert.equal(schema.properties.checks.items.additionalProperties, false);
assert.equal(schema.properties.checks.maxItems, 64);
assert(schema.$comment.includes("normative runtime validator"));
assert(schema.properties.checks.items.properties.argv.$comment.includes("shell interpreters"));
assert.doesNotThrow(() => validateProjectCheckCatalog(example));
assert.equal(loaded.relative_path, PROJECT_CHECK_CATALOG_PATH);
assert.match(loaded.fingerprint, /^sha256:[a-f0-9]{64}$/u);
assert.equal(loaded.fingerprint, projectCheckCatalogFingerprint(loaded.catalog));
assert(loaded.catalog.checks.some((entry) => entry.check_id === "verify-all"));
assert.deepEqual(loaded.catalog.standard_lite_policy.allowed_ownership_prefixes, ["docs", "src", "tests"]);
assert(loaded.catalog.standard_lite_policy.protected_paths.includes("src/security"));
assert(Object.isFrozen(loaded.catalog));
const runActualStaticCheck = () => runTrustedProjectCheck({
  catalog: loaded.catalog,
  checkId: "verify-static",
  phase: "integration",
  workspaceRoot,
  catalogFingerprint: loaded.fingerprint,
});
if (process.platform === "win32") {
  const actualStaticReceipt = runActualStaticCheck();
  assert.equal(actualStaticReceipt.status, "passed", "the Windows production runner must execute a real catalog check in this worktree");
  assert.equal(actualStaticReceipt.workspace_fingerprint, actualStaticReceipt.post_workspace_fingerprint);
  assert.equal(Object.hasOwn(actualStaticReceipt, "stdout"), false);
  assert.equal(Object.hasOwn(actualStaticReceipt, "stderr"), false);
} else {
  expectCode(runActualStaticCheck, "QUALITY_CHECK_CONTAINMENT_UNAVAILABLE");
}

expectCode(() => parseProjectCheckCatalog("{"), "QUALITY_CHECK_CATALOG_JSON");
expectCode(() => validateProjectCheckCatalog({ ...catalog(), extra: true }), "CONTRACT_UNKNOWN_FIELD");
expectCode(() => validateProjectCheckCatalog(catalog({ schema_version: 2 })), "QUALITY_CHECK_CATALOG_VERSION");
expectCode(() => validateProjectCheckCatalog(catalog({ checks: [] })), "QUALITY_ARRAY");
expectCode(() => validateProjectCheckCatalog(catalog({
  standard_lite_policy: { allowed_ownership_prefixes: ["."], protected_paths: [] },
})), "QUALITY_STANDARD_LITE_POLICY");
expectCode(() => validateProjectCheckCatalog(catalog({
  standard_lite_policy: { allowed_ownership_prefixes: ["src"], protected_paths: ["src/security"], extra: true },
})), "CONTRACT_UNKNOWN_FIELD");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [catalog().checks[0], { ...catalog().checks[0] }],
})), "QUALITY_CHECK_DUPLICATE");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [{ ...catalog().checks[0], shell: true }],
})), "CONTRACT_UNKNOWN_FIELD");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [{ ...catalog().checks[0], argv: "node --version" }],
})), "QUALITY_ARRAY");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [{ ...catalog().checks[0], argv: ["node\0.exe"] }],
})), "QUALITY_CHECK_ARGV");
for (const argv of [
  ["sh", "-c", "echo bypass"],
  ["powershell", "-Command", "Write-Output bypass"],
  ["cmd.exe", "/c", "echo bypass"],
  ["node", "--eval", "process.exit(0)"],
  ["node", "-eprocess.exit(0)"],
  ["node", "-p1+1"],
  ["python", "-c", "print('bypass')"],
  ["python", "-cprint('bypass')"],
  ["perl", "-eprint 1"],
  ["ruby", "-eputs 1"],
  ["busybox", "sh", "-c", "echo bypass"],
  ["env", "sh", "-c", "echo bypass"],
  ["npx", "some-package"],
  ["npm", "exec", "some-package"],
]) {
  expectCode(() => validateProjectCheckCatalog(catalog({
    checks: [{ ...catalog().checks[0], argv }],
  })), "QUALITY_CHECK_EXECUTABLE");
}
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [{ ...catalog().checks[0], cwd: "../outside" }],
})), "QUALITY_CHECK_CWD");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [{ ...catalog().checks[0], cwd: path.parse(workspaceRoot).root }],
})), "QUALITY_CHECK_CWD");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [{ ...catalog().checks[0], phases: ["integration", "integration"] }],
})), "QUALITY_CHECK_PHASE");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-catalog-"));
const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-catalog-outside-"));
try {
  fs.mkdirSync(path.join(tempRoot, ".opencode", "quality"), { recursive: true });
  fs.writeFileSync(
    path.join(tempRoot, ".opencode", "quality", "checks.json"),
    `${JSON.stringify(catalog())}\n`,
    "utf8",
  );
  assert.equal(loadProjectCheckCatalog(tempRoot).catalog.catalog_id, "fixture-checks-v1");

  expectCode(() => validateProjectCheckCatalog(catalog({
    checks: [{ ...catalog().checks[0], cwd: "missing" }],
  }), { workspaceRoot: tempRoot }), "QUALITY_CHECK_CWD_UNAVAILABLE");

  const link = path.join(tempRoot, "outside-link");
  fs.symlinkSync(outsideRoot, link, process.platform === "win32" ? "junction" : "dir");
  expectCode(() => validateProjectCheckCatalog(catalog({
    checks: [{ ...catalog().checks[0], cwd: "outside-link" }],
  }), { workspaceRoot: tempRoot }), "QUALITY_CHECK_CWD_ESCAPE");

  fs.mkdirSync(path.join(tempRoot, "real-check-cwd"));
  const internalLink = path.join(tempRoot, "internal-link");
  fs.symlinkSync(path.join(tempRoot, "real-check-cwd"), internalLink, process.platform === "win32" ? "junction" : "dir");
  expectCode(() => validateProjectCheckCatalog(catalog({
    checks: [{ ...catalog().checks[0], cwd: "internal-link" }],
  }), { workspaceRoot: tempRoot }), "QUALITY_CHECK_CWD_SYMLINK");

  fs.writeFileSync(
    path.join(tempRoot, ".opencode", "quality", "checks.json"),
    Buffer.alloc(PROJECT_CHECK_LIMITS.max_catalog_bytes + 1, 0x20),
  );
  expectCode(() => loadProjectCheckCatalog(tempRoot), "QUALITY_CHECK_CATALOG_SIZE");

  fs.writeFileSync(
    path.join(tempRoot, ".opencode", "quality", "checks.json"),
    `${JSON.stringify(catalog())}\n`,
    "utf8",
  );
  const first = loadProjectCheckCatalog(tempRoot);
  fs.writeFileSync(
    path.join(tempRoot, ".opencode", "quality", "checks.json"),
    `${JSON.stringify(catalog({ catalog_id: "fixture-checks-v2" }))}\n`,
    "utf8",
  );
  const second = loadProjectCheckCatalog(tempRoot);
  assert.notEqual(first.fingerprint, second.fingerprint, "catalog edits must invalidate the fingerprint");
  const policyA = projectCheckCatalogFingerprint(catalog({
    standard_lite_policy: { allowed_ownership_prefixes: ["src"], protected_paths: [] },
  }));
  const policyB = projectCheckCatalogFingerprint(catalog({
    standard_lite_policy: { allowed_ownership_prefixes: ["src"], protected_paths: ["src/security"] },
  }));
  assert.notEqual(policyA, policyB, "standard-lite policy changes must invalidate the catalog fingerprint");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.rmSync(outsideRoot, { recursive: true, force: true });
}

console.log("Project check catalog checks passed.");
