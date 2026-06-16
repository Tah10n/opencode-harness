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
const structuredSafeFixture = path.join(tempDir, "runtime-debug-structured-safe");
const structuredUnsafeFixture = path.join(tempDir, "runtime-debug-structured-unsafe");
const failures = [];
const expectedUnsafeCodes = [
  "HARNESS-R004",
  "HARNESS-R006",
  "HARNESS-R007",
  "HARNESS-R009",
  "HARNESS-R010",
  "HARNESS-R011",
  "HARNESS-R012",
  "HARNESS-R013",
  "HARNESS-R014",
  "HARNESS-R015",
  "HARNESS-R016",
];

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

function permissionLine(permission, action) {
  return JSON.stringify({ permission, action });
}

function writeStructuredFixture(dir, options = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "debug-config.txt"),
    [
      permissionLine("default_agent", "orchestrator"),
      ...(options.unsafe ? [permissionLine("default_agent", "general")] : []),
      permissionLine("oc_learning_*", "deny"),
      ...(options.unsafe ? [permissionLine("oc_learning_*", "allow")] : []),
      "",
    ].join("\n"),
  );

  const contextTools = ["context_outline", "context_files", "context_search", "context_read"];
  const contextLines = contextTools.map((tool) => permissionLine(tool, "allow"));

  for (const agent of ["orchestrator", "orchestrator-deep", "explore", "architect", "diagnose", "verifier"]) {
    const lines = [...contextLines];
    if (options.unsafe && agent === "architect") {
      lines.push(permissionLine("context_read", "deny"));
    }
    if (["explore", "architect", "diagnose", "verifier"].includes(agent)) {
      lines.unshift(permissionLine("edit", "deny"));
    }
    if (options.unsafe && agent === "verifier") {
      lines.push(permissionLine("websearch", "allow"));
      lines.push(permissionLine("webfetch", "allow"));
    }
    fs.writeFileSync(path.join(dir, `debug-agent-${agent}.txt`), `${lines.join("\n")}\n`);
  }

  const generalLines = [permissionLine("edit", "allow"), permissionLine("webfetch", "deny"), permissionLine("websearch", "deny")];
  if (options.unsafe) {
    generalLines.push(permissionLine("edit", "deny"));
  }
  fs.writeFileSync(path.join(dir, "debug-agent-general.txt"), `${generalLines.join("\n")}\n`);

  const reviewerLines = options.unsafe
    ? [
        JSON.stringify({ permission: "edit", note: "missing action should not be paired with another object" }),
        permissionLine("edit", "deny"),
        permissionLine("edit", "allow"),
        permissionLine("bash", "deny"),
        ...contextLines,
      ]
    : [permissionLine("edit", "deny"), ...contextLines];
  fs.writeFileSync(path.join(dir, "debug-agent-reviewer.txt"), `${reviewerLines.join("\n")}\n`);

  fs.writeFileSync(
    path.join(dir, "debug-agent-researcher.txt"),
    [
      permissionLine("edit", "deny"),
      permissionLine("websearch", "allow"),
      ...(options.unsafe ? [permissionLine("websearch", "deny")] : []),
      JSON.stringify({ action: "allow", permission: "webfetch" }),
      ...(options.unsafe ? [permissionLine("webfetch", "deny")] : []),
      "",
    ].join("\n"),
  );

  fs.writeFileSync(
    path.join(dir, "debug-agent-improver.txt"),
    [
      permissionLine("edit", "deny"),
      JSON.stringify({ action: "ask", permission: "oc_learning_*" }),
      ...(options.unsafe ? [permissionLine("oc_learning_*", "allow")] : []),
      "",
    ].join("\n"),
  );

  if (options.unsafe) {
    fs.appendFileSync(
      path.join(dir, "debug-agent-orchestrator.txt"),
      `${JSON.stringify({ action: "ask", permission: "oc_learning_*" })}\n`,
    );
  }
}

try {
  const safe = runFixture(safeFixture);
  if (safe.status !== 0) {
    fail(`safe runtime fixture should pass, exited ${safe.status}\n${outputOf(safe)}`);
  }

  writeStructuredFixture(structuredSafeFixture);
  const structuredSafe = runFixture(structuredSafeFixture);
  if (structuredSafe.status !== 0) {
    fail(`structured safe runtime fixture should pass, exited ${structuredSafe.status}\n${outputOf(structuredSafe)}`);
  }

  fs.cpSync(safeFixture, unsafeFixture, { recursive: true });

  fs.appendFileSync(path.join(unsafeFixture, "debug-config.txt"), '\n  "oc_learning_*": allow\n');
  fs.appendFileSync(path.join(unsafeFixture, "debug-config.txt"), '\n  default_agent: general\n');

  const reviewerFixture = path.join(unsafeFixture, "debug-agent-reviewer.txt");
  fs.writeFileSync(
    reviewerFixture,
    fs.readFileSync(reviewerFixture, "utf8").replace("edit: deny", "edit: deny\n  edit: allow\n  bash: deny"),
  );

  fs.appendFileSync(path.join(unsafeFixture, "debug-agent-architect.txt"), "\n  context_read: deny\n");
  fs.appendFileSync(path.join(unsafeFixture, "debug-agent-verifier.txt"), "\n  websearch: allow\n  webfetch: allow\n");
  fs.appendFileSync(path.join(unsafeFixture, "debug-agent-researcher.txt"), "\n  websearch: deny\n  webfetch: deny\n");
  fs.appendFileSync(path.join(unsafeFixture, "debug-agent-general.txt"), "\n  edit: deny\n");
  fs.appendFileSync(path.join(unsafeFixture, "debug-agent-improver.txt"), '\n  "oc_learning_*": allow\n');

  const orchestratorFixture = path.join(unsafeFixture, "debug-agent-orchestrator.txt");
  fs.appendFileSync(orchestratorFixture, '\n  "oc_learning_*": ask\n');

  const unsafe = runFixture(unsafeFixture);
  const unsafeOutput = outputOf(unsafe);
  if (unsafe.status === 0) {
    fail("unsafe runtime fixture should fail, but it passed");
  }
  for (const code of expectedUnsafeCodes) {
    if (!unsafeOutput.includes(code)) {
      fail(`unsafe runtime fixture should report ${code}\n${unsafeOutput}`);
    }
  }

  writeStructuredFixture(structuredUnsafeFixture, { unsafe: true });
  const structuredUnsafe = runFixture(structuredUnsafeFixture);
  const structuredUnsafeOutput = outputOf(structuredUnsafe);
  if (structuredUnsafe.status === 0) {
    fail("structured unsafe runtime fixture should fail, but it passed");
  }
  for (const code of expectedUnsafeCodes) {
    if (!structuredUnsafeOutput.includes(code)) {
      fail(`structured unsafe runtime fixture should report ${code}\n${structuredUnsafeOutput}`);
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
