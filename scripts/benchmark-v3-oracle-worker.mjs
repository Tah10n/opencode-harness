import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

function stop() { process.exit(64); }
const [inputFile, outputFile, marker] = process.argv.slice(2);
if (![inputFile, outputFile, marker].every((entry) => typeof entry === "string" && entry.length > 0)) stop();
let input;
try { input = JSON.parse(fs.readFileSync(inputFile, "utf8")); } catch { stop(); }
if (input?.schema_version !== 1 || typeof input.workspace !== "string" || typeof input.runtime_root !== "string"
  || typeof input.runtime_key !== "string" || !Array.isArray(input.hidden_test_files)
  || !Array.isArray(input.test_argv) || !Array.isArray(input.allowed_mutation_paths)
  || !Array.isArray(input.before_entries) || !Array.isArray(input.model_entries)
  || !Number.isSafeInteger(input.expected_test_count) || input.expected_test_count < 1) stop();

const hashFile = (file) => `sha256:${createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`;
function snapshot(root) {
  const excluded = new Set(input.hidden_test_files.map((entry) => entry.path));
  const entries = [];
  const visit = (directory, prefix = "") => {
    for (const name of fs.readdirSync(directory).sort()) {
      if (prefix === "" && [".git", "node_modules"].includes(name)) continue;
      const relative = prefix === "" ? name : `${prefix}/${name}`;
      if (excluded.has(relative)) continue;
      const target = path.join(directory, name);
      const stat = fs.lstatSync(target);
      if (stat.isDirectory() && !stat.isSymbolicLink()) visit(target, relative);
      else if (stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1) {
        entries.push({ path: relative, sha256: hashFile(target), size: stat.size });
      } else stop();
    }
  };
  visit(root);
  return entries;
}
const root = fs.realpathSync.native(input.workspace);
const beforeMap = new Map(input.before_entries.map((entry) => [entry.path, `${entry.sha256}:${entry.size}`]));
const modelEntries = input.model_entries;
const modelMap = new Map(modelEntries.map((entry) => [entry.path, `${entry.sha256}:${entry.size}`]));
const changedPaths = [...new Set([...beforeMap.keys(), ...modelMap.keys()])]
  .filter((entry) => beforeMap.get(entry) !== modelMap.get(entry)).sort();
const allowed = new Set(input.allowed_mutation_paths);
const scopeViolations = changedPaths.filter((entry) => !allowed.has(entry));
const nodeModulesSource = path.join(fs.realpathSync.native(input.runtime_root), input.runtime_key, "node_modules");
const mocha = [path.join(nodeModulesSource, "mocha", "bin", "mocha.js"), path.join(nodeModulesSource, "mocha", "bin", "mocha")]
  .find((entry) => fs.existsSync(entry));
if (mocha === undefined || !fs.lstatSync(path.join(root, "node_modules")).isSymbolicLink()) stop();
const command = spawnSync(process.execPath, [mocha, "--reporter", "json", ...input.test_argv], {
    cwd: root, env: { PATH: "/usr/bin:/bin", HOME: input.empty_home, TMPDIR: input.empty_tmp,
      LANG: "C", LC_ALL: "C", NODE_ENV: "test" }, encoding: "utf8", shell: false, windowsHide: true,
    timeout: 120_000, maxBuffer: 64 * 1024 * 1024,
  });
let report = null;
try { report = JSON.parse(String(command.stdout ?? "")); } catch { report = null; }
const stats = report?.stats;
const testCountAuthentic = Number.isSafeInteger(stats?.tests) && stats.tests > 0
  && Number.isSafeInteger(stats?.passes) && Number.isSafeInteger(stats?.failures) && Number.isSafeInteger(stats?.pending)
  && stats.passes + stats.failures + stats.pending === stats.tests;
const oracleEntries = snapshot(root);
const oracleMutation = JSON.stringify(oracleEntries) !== JSON.stringify(modelEntries);
const semanticPassed = command.error === undefined && command.signal === null && command.status === 0
  && testCountAuthentic && stats.tests === input.expected_test_count
  && stats.passes === stats.tests && stats.failures === 0 && stats.pending === 0;
const receipt = { schema_version: 1, semantic_passed: semanticPassed,
  process_status: Number.isInteger(command.status) ? command.status : null, process_signal: command.signal ?? null,
  timed_out: command.error?.code === "ETIMEDOUT", test_count: testCountAuthentic ? stats.tests : null,
  changed_paths: changedPaths, scope_violations: scopeViolations, oracle_workspace_mutated: oracleMutation };
const descriptor = fs.openSync(outputFile, "wx", 0o600);
try { fs.writeFileSync(descriptor, `${JSON.stringify(receipt)}\n`); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
process.stdout.write(marker);
