import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmCliPath = process.env.npm_execpath;
const RUNTIME_QUALITY_FIXTURE_SCRIPTS = Object.freeze([
  "verify:runtime:quality-hooks:core-fixture",
  "verify:live-eval",
  "verify:process-containment",
  "verify:acceptance",
]);

if (typeof npmCliPath !== "string" || npmCliPath.length === 0 || !path.isAbsolute(npmCliPath)) {
  throw new Error("runtime quality fixture composite must be invoked through npm");
}

function runNpmScript(scriptName) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [npmCliPath, "run", scriptName], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(Object.freeze({ scriptName, ...result }));
    };
    child.once("error", (error) => finish({
      code: null,
      signal: null,
      error: error.message,
    }));
    child.once("close", (code, signal) => finish({
      code,
      signal,
      error: null,
    }));
  });
}

console.log(`Running ${RUNTIME_QUALITY_FIXTURE_SCRIPTS.length} independent runtime quality fixture checks in parallel.`);
const results = await Promise.all(RUNTIME_QUALITY_FIXTURE_SCRIPTS.map(runNpmScript));
const failures = results.filter((entry) => entry.code !== 0 || entry.signal !== null || entry.error !== null);
if (failures.length > 0) {
  for (const failure of failures) {
    console.error(
      `${failure.scriptName} failed (exit=${String(failure.code)}, signal=${String(failure.signal)}, error=${failure.error ?? "none"}).`,
    );
  }
  process.exitCode = 1;
} else {
  console.log("Runtime quality fixture composite passed.");
}
