import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import { ContractError } from "../feedback/contracts.mjs";

function fail(message) { throw new ContractError("BENCHMARK_V3_OPERATOR_SEMANTIC", message); }
function expect(condition, message) { if (!condition) fail(message); }
function passed(result) { return result.status === 0 && result.signal === null && result.error === undefined; }
function protectedExecutable(candidate) {
  expect(typeof candidate === "string" && path.isAbsolute(candidate), "Bubblewrap executable is unavailable");
  let canonical;
  try { canonical = fs.realpathSync.native(candidate); } catch { fail("Bubblewrap executable is unavailable"); }
  const stat = fs.lstatSync(canonical);
  expect(stat.isFile() && !stat.isSymbolicLink() && stat.uid === 0 && stat.nlink === 1
    && (stat.mode & 0o022) === 0 && (stat.mode & 0o111) !== 0,
  "Bubblewrap executable is not a protected root-owned ordinary executable");
  return canonical;
}
function systemRoots() {
  return ["/usr", "/bin", "/lib", "/lib64", "/opt", "/nix/store", "/etc/ssl", "/etc/pki",
    "/etc/ca-certificates", "/etc/nsswitch.conf", "/etc/passwd", "/etc/group"]
    .filter((entry, index, values) => fs.existsSync(entry) && values.indexOf(entry) === index);
}

export function runBenchmarkV3IsolatedSemanticCase({ repository, semanticRuntimeRoot, runtimeKey,
  testArgv, expectedTestCount = null, timeoutMs = 120_000 }) {
  expect(process.platform === "linux" && typeof process.getuid === "function" && process.getuid() === 0,
    "external semantic calibration requires the trusted Linux root coordinator");
  const source = fs.realpathSync.native(path.resolve(repository));
  const runtime = fs.realpathSync.native(path.resolve(semanticRuntimeRoot, runtimeKey));
  const nodeModules = path.join(runtime, "node_modules");
  const mochaRelative = ["mocha/bin/mocha.js", "mocha/bin/mocha"]
    .find((candidate) => fs.existsSync(path.join(nodeModules, candidate)));
  expect(fs.statSync(source).isDirectory() && fs.statSync(nodeModules).isDirectory() && mochaRelative !== undefined,
    "semantic runtime lacks the required isolated Mocha entrypoint");
  expect(Array.isArray(testArgv) && testArgv.length >= 1 && testArgv.length <= 4
    && testArgv.every((entry) => typeof entry === "string" && !path.isAbsolute(entry)
      && !entry.split("/").includes("..") && !entry.includes("\\")),
  "isolated semantic test arguments are invalid");
  const bwrap = protectedExecutable(["/usr/bin/bwrap", "/usr/local/bin/bwrap"].find((entry) => fs.existsSync(entry)) ?? "");
  const workspace = "/workspace";
  const result = spawnSync(bwrap, ["--die-with-parent", "--new-session", "--unshare-user", "--uid", "65534",
    "--gid", "65534", "--unshare-pid", "--unshare-ipc", "--unshare-uts", "--unshare-cgroup-try", "--unshare-net",
    "--cap-drop", "ALL", "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--dir", "/home",
    ...systemRoots().flatMap((entry) => ["--ro-bind", entry, entry]),
    "--chmod", "0555", "/", "--chmod", "0555", "/etc",
    "--ro-bind", source, workspace, "--ro-bind", nodeModules, `${workspace}/node_modules`,
    "--chdir", workspace, "--clearenv", "--setenv", "PATH", "/usr/local/bin:/usr/bin:/bin",
    "--setenv", "HOME", "/home", "--setenv", "TMPDIR", "/tmp", "--setenv", "LANG", "C",
    "--setenv", "LC_ALL", "C", "--setenv", "NODE_ENV", "test",
    process.execPath, `${workspace}/node_modules/${mochaRelative}`, "--reporter", "json", "--timeout", "30000", ...testArgv], {
    encoding: "utf8", shell: false, windowsHide: true, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024,
    env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent", LANG: "C", LC_ALL: "C" },
  });
  let report = null;
  try { report = JSON.parse(result.stdout); } catch { report = null; }
  const stats = report?.stats;
  const authentic = Number.isSafeInteger(stats?.tests) && stats.tests > 0
    && (expectedTestCount === null || stats.tests === expectedTestCount)
    && Number.isSafeInteger(stats.passes) && Number.isSafeInteger(stats.failures)
    && Number.isSafeInteger(stats.pending) && stats.passes + stats.failures + stats.pending === stats.tests;
  return Object.freeze({ authentic, passed: passed(result) && authentic && stats.passes === stats.tests
    && stats.failures === 0 && stats.pending === 0, tests: authentic ? stats.tests : null,
    isolated_non_root: true, network_unshared: true });
}
