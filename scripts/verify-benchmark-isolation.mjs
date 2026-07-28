import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ContractError } from "../lib/feedback/contracts.mjs";
import {
  captureOrdinaryTreeManifest,
} from "../lib/feedback/evidence.mjs";
import {
  createConfinedTemporaryDirectory,
  evaluateWorkspacePolicy,
  prepareIsolatedFixture,
  stageIsolatedFiles,
} from "../lib/benchmark/isolation.mjs";

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-benchmark-isolation-test-"));

function expectContract(code, operation) {
  assert.throws(operation, (error) => error instanceof ContractError && error.code === code);
}

try {
  const publicFixture = path.join(temporaryRoot, "public-fixture");
  const hiddenSource = path.join(temporaryRoot, "hidden-source");
  fs.mkdirSync(publicFixture, { recursive: true });
  fs.mkdirSync(hiddenSource, { recursive: true });
  fs.writeFileSync(path.join(publicFixture, "index.js"), "export const value = 1;\n", "utf8");
  fs.writeFileSync(path.join(hiddenSource, "hidden.test.js"), "hidden\n", "utf8");

  const fixture = prepareIsolatedFixture({
    scenarioId: "isolation-self-test",
    fixturePath: "public-fixture",
    profileId: "plain",
    sourceRoot: temporaryRoot,
  });
  try {
    assert.equal(fs.readFileSync(path.join(fixture.repo, "index.js"), "utf8"), "export const value = 1;\n");
    assert.equal(fs.existsSync(path.join(fixture.repo, "hidden.test.js")), false);

    const before = captureOrdinaryTreeManifest(fixture.repo);
    fs.writeFileSync(path.join(fixture.repo, "index.js"), "export const value = 2;\n", "utf8");
    const afterAllowed = captureOrdinaryTreeManifest(fixture.repo);
    const allowed = evaluateWorkspacePolicy({
      workspacePolicy: { mode: "allowlist", allowed_paths: ["index.js"] },
      beforeManifest: before,
      afterManifest: afterAllowed,
    });
    assert.equal(allowed.passed, true);
    assert.deepEqual(allowed.changedPaths, ["index.js"]);

    fs.writeFileSync(path.join(fixture.repo, "unexpected.js"), "unexpected\n", "utf8");
    const afterUnexpected = captureOrdinaryTreeManifest(fixture.repo);
    const denied = evaluateWorkspacePolicy({
      workspacePolicy: { mode: "allowlist", allowed_paths: ["index.js"] },
      beforeManifest: before,
      afterManifest: afterUnexpected,
    });
    assert.equal(denied.passed, false);
    assert.deepEqual(denied.unexpectedPaths, ["unexpected.js"]);

    stageIsolatedFiles({
      scenarioId: "isolation-self-test",
      files: [{ source: "hidden-source/hidden.test.js", target: "hidden.test.js" }],
      repo: fixture.repo,
      sourceRoot: temporaryRoot,
    });
    assert.equal(fs.readFileSync(path.join(fixture.repo, "hidden.test.js"), "utf8"), "hidden\n");
    expectContract("ISOLATION_HIDDEN_COLLISION", () => stageIsolatedFiles({
      scenarioId: "isolation-self-test",
      files: [{ source: "hidden-source/hidden.test.js", target: "hidden.test.js" }],
      repo: fixture.repo,
      sourceRoot: temporaryRoot,
    }));
  } finally {
    fs.rmSync(fixture.temporaryRoot, { recursive: true, force: true });
  }

  expectContract("ISOLATION_FIXTURE", () => prepareIsolatedFixture({
    scenarioId: "isolation-self-test",
    fixturePath: "../outside",
    profileId: "plain",
    sourceRoot: publicFixture,
  }));
  expectContract("ISOLATION_TEMP_ROOT", () => createConfinedTemporaryDirectory(".."));
  expectContract("ISOLATION_TEMP_ROOT", () => createConfinedTemporaryDirectory("."));
  console.log("Benchmark isolation verifier passed.");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
