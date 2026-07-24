import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = fs.realpathSync.native(os.tmpdir());
const cacheRoot = fs.mkdtempSync(path.join(temporaryRoot, "opencode-harness-pack-"));

function resolveNpmCli() {
  const executableDirectory = path.dirname(fs.realpathSync.native(process.execPath));
  const candidates = [
    process.env.npm_execpath,
    path.join(executableDirectory, "node_modules", "npm", "bin", "npm-cli.js"),
    path.resolve(executableDirectory, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    path.resolve(executableDirectory, "..", "node_modules", "npm", "bin", "npm-cli.js"),
  ].filter((candidate) => typeof candidate === "string" && candidate.length > 0);
  const npmCli = candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  if (!npmCli) {
    throw new Error("trusted npm CLI is unavailable for the package-boundary check");
  }
  return fs.realpathSync.native(npmCli);
}

function assertIgnorePolicy() {
  const npmIgnorePath = path.join(root, ".npmignore");
  const ignorePath = fs.existsSync(npmIgnorePath) ? npmIgnorePath : path.join(root, ".gitignore");
  const entries = fs.readFileSync(ignorePath, "utf8")
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry && !entry.startsWith("#"));
  if (!entries.includes(".qwen/")) {
    throw new Error(`${path.basename(ignorePath)} must exclude .qwen/ from the npm package`);
  }
}

function assertOwnedTemporaryDirectory(directory) {
  const canonical = fs.realpathSync.native(directory);
  const relative = path.relative(temporaryRoot, canonical);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("package-boundary cache escaped the system temporary directory");
  }
  return canonical;
}

function normalizePackagePath(value) {
  return String(value).replaceAll("\\", "/").replace(/^package\//u, "");
}

let verificationError;
try {
  assertIgnorePolicy();
  const npmCli = resolveNpmCli();
  const result = spawnSync(process.execPath, [
    npmCli,
    "pack",
    "--dry-run",
    "--json",
    "--ignore-scripts",
    "--cache",
    cacheRoot,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120_000,
    windowsHide: true,
    shell: false,
  });
  if (result.error) {
    throw new Error(`npm pack could not run: ${result.error.code ?? result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`npm pack failed with exit ${result.status}: ${result.stderr.trim()}`);
  }

  const report = JSON.parse(result.stdout);
  if (!Array.isArray(report) || report.length !== 1 || !Array.isArray(report[0]?.files)) {
    throw new Error("npm pack returned an unexpected JSON report");
  }
  const files = report[0].files.map((entry) => normalizePackagePath(entry.path));
  const forbiddenPrefixes = [".cache/", ".codex/", ".oc_harness/", ".qwen/", "node_modules/"];
  const leaked = files.filter((file) => forbiddenPrefixes.some(
    (prefix) => file === prefix.slice(0, -1) || file.startsWith(prefix),
  ));
  if (leaked.length > 0) {
    throw new Error(`npm package contains local operational files: ${leaked.join(", ")}`);
  }
  for (const required of [
    "LICENSE",
    "README.md",
    "package.json",
    "lib/quality/index.mjs",
    "scripts/verify-package-boundary.mjs",
    "skills/global-wide-deep-context/SKILL.md",
  ]) {
    if (!files.includes(required)) {
      throw new Error(`npm package is missing required artifact: ${required}`);
    }
  }

  console.log(`Package boundary verification passed (${files.length} files; ${report[0].size} bytes).`);
} catch (error) {
  verificationError = error;
} finally {
  try {
    fs.rmSync(assertOwnedTemporaryDirectory(cacheRoot), { recursive: true, force: true });
  } catch (error) {
    verificationError ??= error;
  }
}

if (verificationError) {
  throw verificationError;
}
