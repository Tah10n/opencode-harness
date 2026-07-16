import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "native", "macos-exclusive-uid-controller.c");
const xcrun = "/usr/bin/xcrun";

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== "--out") {
    throw new Error("usage: build-macos-containment.mjs --out <canonical-absolute-path>");
  }
  const output = argv[1];
  if (typeof output !== "string" || !path.isAbsolute(output)
    || path.resolve(output) !== output || path.normalize(output) !== output
    || output.includes("\0") || Buffer.byteLength(output, "utf8") > 4096) {
    throw new Error("--out must be a canonical absolute path");
  }
  if (fs.existsSync(output)) throw new Error("macOS containment output already exists");
  const parent = path.dirname(output);
  if (fs.realpathSync.native(parent) !== parent || !fs.statSync(parent).isDirectory()) {
    throw new Error("macOS containment output parent must be a canonical directory");
  }
  return output;
}

function main() {
  if (process.platform !== "darwin") {
    throw new Error("the macOS containment controller can only be built on macOS");
  }
  const output = parseArguments(process.argv.slice(2));
  const xcrunIdentity = fs.statSync(fs.realpathSync.native(xcrun), { bigint: true });
  if (!xcrunIdentity.isFile() || (xcrunIdentity.mode & 0o022n) !== 0n) {
    throw new Error("host xcrun executable is not trusted");
  }
  const execution = spawnSync(xcrun, [
    "--sdk", "macosx", "clang",
    "-std=c11",
    "-O2",
    "-Wall",
    "-Wextra",
    "-Werror",
    "-pedantic",
    source,
    "-o", output,
  ], {
    cwd: root,
    shell: false,
    stdio: "inherit",
    timeout: 120_000,
  });
  if (execution.status !== 0 || execution.signal !== null || execution.error !== undefined) {
    try { fs.rmSync(output, { force: true }); } catch { /* output was never accepted */ }
    throw new Error(`macOS containment controller build failed (${execution.error?.code ?? execution.status ?? execution.signal})`);
  }
  const identity = fs.statSync(output, { bigint: true });
  if (!identity.isFile() || identity.size === 0n) {
    fs.rmSync(output, { force: true });
    throw new Error("macOS containment controller build output is invalid");
  }
  fs.chmodSync(output, 0o555);
  console.log(`Built macOS exclusive-UID controller at ${output}.`);
}

try {
  main();
} catch (error) {
  console.error(`macOS containment controller build failed: ${error.message}`);
  process.exitCode = 1;
}
