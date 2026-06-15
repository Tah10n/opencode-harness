import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verifier = path.join(root, "scripts", "verify-runtime.mjs");
const safeFixture = path.join(root, "fixtures", "runtime-debug");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-runtime-"));
const unsafeFixture = path.join(tempDir, "runtime-debug-unsafe");
const failures = [];

function runFixture(fixtureDir) {
  return spawnSync(process.execPath, [verifier, "--fixture-dir", fixtureDir], {
    cwd: root,
    encoding: "utf8",
  });
}

function fail(message) {
  failures.push(message);
}

function outputOf(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

try {
  const safe = runFixture(safeFixture);
  if (safe.status !== 0) {
    fail(`safe runtime fixture should pass, exited ${safe.status}\n${outputOf(safe)}`);
  }

  fs.cpSync(safeFixture, unsafeFixture, { recursive: true });

  const reviewerFixture = path.join(unsafeFixture, "debug-agent-reviewer.txt");
  fs.writeFileSync(
    reviewerFixture,
    fs.readFileSync(reviewerFixture, "utf8").replace("edit: deny", "edit: allow\n  bash: deny"),
  );

  const orchestratorFixture = path.join(unsafeFixture, "debug-agent-orchestrator.txt");
  fs.appendFileSync(orchestratorFixture, '\n  "oc_learning_*": ask\n');

  const unsafe = runFixture(unsafeFixture);
  const unsafeOutput = outputOf(unsafe);
  if (unsafe.status === 0) {
    fail("unsafe runtime fixture should fail, but it passed");
  }
  for (const code of ["HARNESS-R009", "HARNESS-R013"]) {
    if (!unsafeOutput.includes(code)) {
      fail(`unsafe runtime fixture should report ${code}\n${unsafeOutput}`);
    }
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("Harness runtime fixture verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Harness runtime fixture verification passed.");
