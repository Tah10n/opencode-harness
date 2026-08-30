import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createHash, createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";

function stop() { process.exit(64); }
const [inputFile, outputFile, marker] = process.argv.slice(2);
if (![inputFile, outputFile, marker].every((entry) => typeof entry === "string" && entry.length > 0)) stop();
let input;
try { input = JSON.parse(fs.readFileSync(inputFile, "utf8")); } catch { stop(); }
if (input?.schema_version !== 1 || typeof input.workspace !== "string" || typeof input.runtime_root !== "string"
  || typeof input.runtime_key !== "string" || !["direct-bind", "symlink"].includes(input.runtime_selector_kind)
  || !Array.isArray(input.hidden_test_files)
  || !Array.isArray(input.test_argv) || !Array.isArray(input.allowed_mutation_paths)
  || !Array.isArray(input.before_entries) || !Array.isArray(input.model_entries)
  || typeof input.authority_file !== "string") stop();
let authority;
try {
  authority = JSON.parse(fs.readFileSync(input.authority_file, "utf8"));
  fs.unlinkSync(input.authority_file);
} catch { stop(); }
if (typeof authority?.mac_key !== "string"
  || !(authority.expected_test_count === null || (Number.isSafeInteger(authority.expected_test_count) && authority.expected_test_count > 0))) stop();

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
        entries.push({ path: relative, sha256: hashFile(target), size: stat.size, mode: stat.mode & 0o7777 });
      } else stop();
    }
  };
  visit(root);
  return entries;
}
function hiddenControlSnapshot(root) {
  const entries = [];
  try {
    for (const hidden of input.hidden_test_files) {
      const target = path.resolve(root, ...hidden.path.split("/"));
      const relative = path.relative(root, target);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
      const stat = fs.lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) return null;
      entries.push({ path: hidden.path, sha256: hashFile(target), size: stat.size, mode: stat.mode & 0o7777,
        link_count: stat.nlink, device: String(stat.dev), inode: String(stat.ino) });
    }
  } catch { return null; }
  return entries;
}
function runtimeSelectorSnapshot(root, expectedSource) {
  try {
    const selector = path.join(root, "node_modules");
    const sourceStat = fs.statSync(expectedSource);
    const selectorStat = fs.lstatSync(selector);
    if (input.runtime_selector_kind === "symlink") {
      if (!selectorStat.isSymbolicLink() || fs.realpathSync.native(selector) !== expectedSource) return null;
    } else if (!selectorStat.isDirectory() || selectorStat.isSymbolicLink()
      || selectorStat.dev !== sourceStat.dev || selectorStat.ino !== sourceStat.ino) return null;
    return { kind: input.runtime_selector_kind, link_target: selectorStat.isSymbolicLink() ? fs.readlinkSync(selector) : null,
      resolved: fs.realpathSync.native(selector), mode: selectorStat.mode & 0o7777, link_count: selectorStat.nlink,
      device: String(selectorStat.dev), inode: String(selectorStat.ino),
      target_device: String(sourceStat.dev), target_inode: String(sourceStat.ino) };
  } catch { return null; }
}
const root = fs.realpathSync.native(input.workspace);
const beforeMap = new Map(input.before_entries.map((entry) => [entry.path, `${entry.sha256}:${entry.size}:${entry.mode}`]));
const modelEntries = input.model_entries;
const modelMap = new Map(modelEntries.map((entry) => [entry.path, `${entry.sha256}:${entry.size}:${entry.mode}`]));
const changedPaths = [...new Set([...beforeMap.keys(), ...modelMap.keys()])]
  .filter((entry) => beforeMap.get(entry) !== modelMap.get(entry)).sort();
const allowed = new Set(input.allowed_mutation_paths);
const scopeViolations = changedPaths.filter((entry) => !allowed.has(entry));
const hiddenControlsBefore = hiddenControlSnapshot(root);
const expectedHiddenControls = input.hidden_test_files.map((entry) => ({ path: entry.path,
  sha256: `sha256:${createHash("sha256").update(entry.content).digest("hex")}`,
  size: Buffer.byteLength(entry.content), mode: 0o400, link_count: 1 }));
if (hiddenControlsBefore === null || hiddenControlsBefore.some((entry, index) => {
  const { device: _device, inode: _inode, ...stable } = entry;
  return JSON.stringify(stable) !== JSON.stringify(expectedHiddenControls[index]);
})) stop();
const nodeModulesSource = path.join(fs.realpathSync.native(input.runtime_root), input.runtime_key, "node_modules");
const runtimeSelectorBefore = runtimeSelectorSnapshot(root, nodeModulesSource);
const mocha = [path.join(nodeModulesSource, "mocha", "bin", "mocha.js"), path.join(nodeModulesSource, "mocha", "bin", "mocha")]
  .find((entry) => fs.existsSync(entry));
if (mocha === undefined || runtimeSelectorBefore === null) stop();
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
const hiddenControlsAfter = hiddenControlSnapshot(root);
const runtimeSelectorAfter = runtimeSelectorSnapshot(root, nodeModulesSource);
const oracleMutation = JSON.stringify(oracleEntries) !== JSON.stringify(modelEntries)
  || hiddenControlsAfter === null || JSON.stringify(hiddenControlsAfter) !== JSON.stringify(hiddenControlsBefore)
  || runtimeSelectorAfter === null || JSON.stringify(runtimeSelectorAfter) !== JSON.stringify(runtimeSelectorBefore);
const semanticPassed = command.error === undefined && command.signal === null && command.status === 0
  && testCountAuthentic && (authority.expected_test_count === null || stats.tests === authority.expected_test_count)
  && stats.passes === stats.tests && stats.failures === 0 && stats.pending === 0;
const receiptBody = { schema_version: 2, semantic_passed: semanticPassed,
  process_status: Number.isInteger(command.status) ? command.status : null, process_signal: command.signal ?? null,
  timed_out: command.error?.code === "ETIMEDOUT", test_count: testCountAuthentic ? stats.tests : null,
  changed_paths: changedPaths, scope_violations: scopeViolations, oracle_workspace_mutated: oracleMutation };
const receipt = { ...receiptBody,
  receipt_mac: createHmac("sha256", Buffer.from(authority.mac_key, "base64url")).update(JSON.stringify(receiptBody)).digest("base64url") };
const descriptor = fs.openSync(outputFile, "wx", 0o600);
try { fs.writeFileSync(descriptor, `${JSON.stringify(receipt)}\n`); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
process.stdout.write(marker);
