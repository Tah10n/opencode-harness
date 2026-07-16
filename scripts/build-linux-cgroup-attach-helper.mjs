import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function parseArguments(argv) {
  const result = { out: null, uid: null, control: null };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--out" && result.out === null) result.out = argv[++index] ?? null;
    else if (option === "--uid" && result.uid === null) result.uid = argv[++index] ?? null;
    else if (option === "--control" && result.control === null) result.control = argv[++index] ?? null;
    else throw new Error(`unsupported Linux helper build argument: ${option}`);
  }
  if (process.platform !== "linux") throw new Error("Linux cgroup attach helper can only be built on Linux");
  if (typeof result.out !== "string" || !path.isAbsolute(result.out)
    || path.normalize(result.out) !== result.out || path.resolve(result.out) !== result.out
    || result.out.includes("\0") || Buffer.byteLength(result.out, "utf8") > 4096) {
    throw new Error("--out must be a canonical absolute path");
  }
  if (fs.existsSync(result.out)) throw new Error("Linux helper output already exists");
  const parent = path.dirname(result.out);
  if (fs.realpathSync.native(parent) !== parent || !fs.statSync(parent).isDirectory()) {
    throw new Error("Linux helper output parent must be a canonical directory");
  }
  if (typeof result.control !== "string" || !path.isAbsolute(result.control)
    || path.normalize(result.control) !== result.control || path.resolve(result.control) !== result.control
    || result.control.includes("\0") || Buffer.byteLength(result.control, "utf8") > 4096) {
    throw new Error("--control must be a bounded canonical absolute path");
  }
  if (typeof result.uid !== "string" || !/^[1-9][0-9]*$/u.test(result.uid)
    || Number(result.uid) > 0x7fffffff) {
    throw new Error("--uid must be a positive 32-bit integer");
  }
  return result;
}

function cString(value) {
  return `\"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}\"`;
}

function trustedCompiler() {
  for (const candidate of ["/usr/bin/cc", "/usr/bin/clang", "/usr/bin/gcc"]) {
    try {
      const canonical = fs.realpathSync.native(candidate);
      const stat = fs.lstatSync(canonical, { bigint: true });
      if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== 0n || stat.nlink !== 1n
        || (stat.mode & 0o022n) !== 0n || (stat.mode & 0o111n) === 0n) continue;
      let current = path.dirname(canonical);
      let protectedPath = true;
      while (true) {
        const directory = fs.lstatSync(current, { bigint: true });
        if (!directory.isDirectory() || directory.isSymbolicLink() || directory.uid !== 0n
          || (directory.mode & 0o022n) !== 0n || fs.realpathSync.native(current) !== current) {
          protectedPath = false;
          break;
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
      if (protectedPath) return canonical;
    } catch {
      // Try the next fixed compiler path.
    }
  }
  throw new Error("a protected fixed system C compiler is required");
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const source = fileURLToPath(new URL("../native/linux-cgroup-attach-helper.c", import.meta.url));
  const compiler = trustedCompiler();
  const parent = fs.realpathSync.native(path.dirname(options.out));
  const execution = spawnSync(compiler, [
    "-std=c11", "-O2", "-Wall", "-Wextra", "-Werror", "-fstack-protector-strong",
    "-D_FORTIFY_SOURCE=2", "-fPIE", "-pie",
    `-DOPENCODE_EXPECTED_UID=${options.uid}`,
    `-DOPENCODE_CGROUP_CONTROL=${cString(options.control)}`,
    source,
    "-o", options.out,
  ], {
    cwd: parent,
    shell: false,
    windowsHide: true,
    stdio: "inherit",
    env: { LANG: "C", LC_ALL: "C", PATH: path.dirname(compiler) },
    timeout: 120_000,
  });
  if (execution.error !== undefined || execution.signal !== null || execution.status !== 0) {
    try { fs.rmSync(options.out, { force: true }); } catch { /* partial output remains untrusted */ }
    throw new Error(`Linux helper compilation failed (${execution.error?.code ?? execution.status ?? execution.signal})`);
  }
  let identity;
  try {
    identity = fs.lstatSync(options.out, { bigint: true });
    if (!identity.isFile() || identity.isSymbolicLink() || identity.nlink !== 1n || identity.size === 0n
      || fs.realpathSync.native(options.out) !== options.out) {
      throw new Error("invalid output identity");
    }
  } catch {
    fs.rmSync(options.out, { force: true });
    throw new Error("Linux helper build output is invalid");
  }
  fs.chmodSync(options.out, 0o555);
  console.log(`Built Linux cgroup attach helper: ${options.out}`);
}

try {
  main();
} catch (error) {
  console.error(`Linux cgroup attach helper build failed: ${error.message}`);
  process.exitCode = 1;
}
