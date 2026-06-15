import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeCwd = process.env.HARNESS_RUNTIME_CWD
  ? path.resolve(process.env.HARNESS_RUNTIME_CWD)
  : root;
const fixtureArgIndex = process.argv.indexOf("--fixture-dir");
const fixtureArg = fixtureArgIndex === -1 ? null : process.argv[fixtureArgIndex + 1];
const fixtureSource = fixtureArg || process.env.HARNESS_RUNTIME_FIXTURE_DIR;
const fixtureDir = fixtureSource
  ? path.resolve(fixtureSource)
  : null;
const failures = [];

function fail(code, message, fix) {
  failures.push({ code, message, fix });
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function readFixture(name) {
  if (!fixtureDir) {
    return null;
  }
  const file = path.join(fixtureDir, `${name}.txt`);
  if (!fs.existsSync(file)) {
    fail("HARNESS-R001", `runtime fixture missing: ${file}`, "Provide all debug output files or unset HARNESS_RUNTIME_FIXTURE_DIR.");
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

function spawnOpenCode(args) {
  if (process.platform === "win32") {
    return spawnSync("cmd.exe", ["/d", "/s", "/c", ["opencode", ...args].join(" ")], {
      cwd: runtimeCwd,
      encoding: "utf8",
    });
  }
  return spawnSync("opencode", args, {
    cwd: runtimeCwd,
    encoding: "utf8",
  });
}

function reportAndExit() {
  console.error("Harness runtime verification failed:");
  console.error(`Runtime cwd: ${runtimeCwd}`);
  for (const failure of failures) {
    console.error(`- ${failure.code}: ${failure.message}`);
    if (failure.fix) {
      console.error(`  fix: ${failure.fix}`);
    }
  }
  process.exit(1);
}

if (!fixtureDir) {
  const versionCheck = spawnOpenCode(["--version"]);
  if (versionCheck.error) {
    fail("HARNESS-R002", `failed to run opencode --version: ${versionCheck.error.message}`, "Install OpenCode, add it to PATH, set HARNESS_RUNTIME_CWD to an installed profile, or set HARNESS_RUNTIME_FIXTURE_DIR to saved debug outputs.");
    reportAndExit();
  }
  if (versionCheck.status !== 0) {
    fail("HARNESS-R002", `opencode --version exited with ${versionCheck.status}`, stripAnsi(`${versionCheck.stderr || versionCheck.stdout}`).trim());
    reportAndExit();
  }
}

function runOpenCode(name, args) {
  const fixture = readFixture(name);
  if (fixture !== null) {
    return stripAnsi(fixture);
  }

  const result = spawnOpenCode(args);

  if (result.error) {
    fail("HARNESS-R002", `failed to run opencode ${args.join(" ")}: ${result.error.message}`, "Install OpenCode or set HARNESS_RUNTIME_FIXTURE_DIR to saved debug outputs.");
    return "";
  }
  if (result.status !== 0) {
    fail("HARNESS-R003", `opencode ${args.join(" ")} exited with ${result.status}`, stripAnsi(`${result.stderr || result.stdout}`).trim());
    return stripAnsi(`${result.stdout || ""}\n${result.stderr || ""}`);
  }
  return stripAnsi(`${result.stdout || ""}\n${result.stderr || ""}`);
}

function assertContains(output, needle, label, code, fix) {
  if (!output.includes(needle)) {
    fail(code, `${label} missing ${needle}`, fix);
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function permissionValues(output, key) {
  const escapedKey = escapeRegex(key);
  const pattern = new RegExp(`^\\s*["']?${escapedKey}["']?\\s*[:=]\\s*["']?([^"',#}\\s]+)`, "gim");
  return [...output.matchAll(pattern)].map((match) => match[1].toLowerCase());
}

function assertPermission(output, key, expected, label, code, fix) {
  const values = permissionValues(output, key);
  if (!values.includes(expected)) {
    fail(code, `${label} expected ${key}: ${expected}, got ${values.length > 0 ? values.join(", ") : "<missing>"}`, fix);
  }
}

function assertNoPermission(output, key, forbiddenValues, label, code, fix) {
  const values = permissionValues(output, key);
  const forbidden = values.filter((value) => forbiddenValues.includes(value));
  if (forbidden.length > 0) {
    fail(code, `${label} unexpectedly exposes ${key}: ${forbidden.join(", ")}`, fix);
  }
}

const configOutput = runOpenCode("debug-config", ["debug", "config"]);
const agentOutputs = new Map();

for (const agent of ["orchestrator", "orchestrator-deep", "explore", "architect", "reviewer", "diagnose", "verifier", "researcher", "improver"]) {
  agentOutputs.set(agent, runOpenCode(`debug-agent-${agent}`, ["debug", "agent", agent]));
}

assertPermission(configOutput, "default_agent", "orchestrator", "opencode debug config", "HARNESS-R004", "The installed profile should use the harness orchestrator as default.");
assertPermission(configOutput, "oc_learning_*", "deny", "opencode debug config", "HARNESS-R006", "Root oc_learning tools should be denied outside the bounded improver path.");

for (const agent of ["orchestrator", "orchestrator-deep", "explore", "architect", "reviewer", "diagnose", "verifier"]) {
  const output = agentOutputs.get(agent) ?? "";
  for (const tool of ["context_outline", "context_files", "context_search", "context_read"]) {
    assertPermission(output, tool, "allow", `opencode debug agent ${agent}`, "HARNESS-R007", "Install or enable opencode-recursive-context for broad read-only context.");
  }
}

for (const agent of ["explore", "architect", "reviewer", "diagnose", "verifier", "researcher", "improver"]) {
  assertPermission(agentOutputs.get(agent) ?? "", "edit", "deny", `opencode debug agent ${agent}`, "HARNESS-R009", "Read-only subagents should deny edits.");
}

assertPermission(agentOutputs.get("researcher") ?? "", "websearch", "allow", "opencode debug agent researcher", "HARNESS-R010", "Researcher should retain web research tools.");
assertPermission(agentOutputs.get("researcher") ?? "", "webfetch", "allow", "opencode debug agent researcher", "HARNESS-R011", "Researcher should retain web research tools.");
assertPermission(agentOutputs.get("improver") ?? "", "oc_learning_*", "ask", "opencode debug agent improver", "HARNESS-R012", "Improver should be the bounded self-improvement write path.");

for (const agent of ["orchestrator", "orchestrator-deep", "explore", "architect", "reviewer", "diagnose", "verifier", "researcher"]) {
  assertNoPermission(agentOutputs.get(agent) ?? "", "oc_learning_*", ["ask", "allow"], `opencode debug agent ${agent}`, "HARNESS-R013", "Only improver should ask for oc_learning writes.");
}

if (failures.length > 0) {
  reportAndExit();
}

console.log(`Harness runtime verification passed for ${runtimeCwd}.`);
