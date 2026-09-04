import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { command } from "./process.mjs";
import { relativePath } from "./config.mjs";

const gitEnv = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
  GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" };
async function git(workspace, args, maxBytes = 8 * 1024 * 1024, extraEnv = {}) {
  const result = await command(["git", "-c", "core.hooksPath=/dev/null", "-c", "core.autocrlf=false", ...args], { cwd: workspace, env: { ...gitEnv, ...extraEnv }, maxBytes });
  if (result.exitCode !== 0 || result.truncated || result.timedOut || result.spawnError) {
    throw new Error(`GIT_OPERATION_FAILED: ${args[0]}: ${result.stderr}`);
  }
  return result.stdout;
}

export async function inspectWorkspace(directory) {
  const workspace = fs.realpathSync(directory);
  const root = (await git(workspace, ["rev-parse", "--show-toplevel"])).trim();
  if (fs.realpathSync(root) !== workspace) throw new Error("WORKSPACE_MUST_BE_REPOSITORY_ROOT");
  const status = await git(workspace, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=none"]);
  if (status) throw new Error("WORKSPACE_DIRTY: commit or separately save your changes; no reset, clean, or stash was performed");
  const flags = (await git(workspace, ["ls-files", "-v", "-z"])).split("\0").filter(Boolean);
  if (flags.some((line) => !line.startsWith("H "))) throw new Error("WORKSPACE_INDEX_FLAGS_UNSUPPORTED: remove assume-unchanged or skip-worktree flags before running");
  const head = (await git(workspace, ["rev-parse", "HEAD"])).trim();
  const entries = (await git(workspace, ["ls-tree", "-rz", "--full-tree", head])).split("\0").filter(Boolean);
  for (const entry of entries) {
    const mode = entry.slice(0, 6), name = entry.slice(entry.indexOf("\t") + 1);
    if (!["100644", "100755"].includes(mode)) throw new Error("WORKSPACE_UNSUPPORTED_ENTRY: version 1 requires regular files, without submodules or symlinks");
    if (!relativePath(name)) throw new Error("WORKSPACE_PATH_UNSUPPORTED");
  }
  return { workspace, head };
}

function filesIn(root, prefix = "") {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    if (!prefix && entry.name === ".git") continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) throw new Error("WORKSPACE_UNSUPPORTED_ENTRY");
    if (entry.isDirectory()) result.push(...filesIn(root, relative));
    else result.push(relative);
  }
  return result.sort();
}

export function treeFingerprint(root) {
  const hash = createHash("sha256");
  for (const relative of filesIn(root)) {
    const file = path.join(root, relative);
    hash.update(JSON.stringify([relative, fs.statSync(file).mode & 0o111, fs.statSync(file).size]));
    hash.update(fs.readFileSync(file));
  }
  return hash.digest("hex");
}

export async function createCandidate(original, destination) {
  // No commits or modifications to the user's Git metadata. Clone configuration
  // is newly generated; global hooks and smudge filters are not inherited.
  await git(path.dirname(destination), ["clone", "--no-checkout", "--no-hardlinks", "--no-local", "--", original.workspace, destination]);
  await git(destination, ["checkout", "--detach", original.head]);
  if ((await git(destination, ["rev-parse", "HEAD"])).trim() !== original.head) throw new Error("BASE_CHANGED");
  return destination;
}

export async function snapshotCandidate(candidate, output, name) {
  if (!/^D[012]$/.test(name)) throw new Error("SNAPSHOT_NAME_INVALID");
  filesIn(candidate); // Reject symlinks before host-side traversal or snapshotting.
  // Hash bytes without running filters, then update only the private index. This
  // includes newly created files without invoking candidate-defined commands.
  await git(candidate, ["read-tree", "--empty"]);
  for (const relative of filesIn(candidate)) {
    const hash = (await git(candidate, ["hash-object", "-w", "--no-filters", "--", relative])).trim();
    const mode = fs.statSync(path.join(candidate, relative)).mode & 0o111 ? "100755" : "100644";
    await git(candidate, ["update-index", "--add", "--cacheinfo", `${mode},${hash},${relative}`]);
  }
  const patch = await git(candidate, ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", "HEAD", "--"]);
  const directory = path.join(output, name);
  fs.mkdirSync(directory, { mode: 0o700 });
  for (const relative of filesIn(candidate)) {
    const target = path.join(directory, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(candidate, relative), target, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(target, fs.statSync(path.join(candidate, relative)).mode & 0o777);
  }
  const patchPath = path.join(output, `${name}.patch`);
  fs.writeFileSync(patchPath, patch, { mode: 0o600, flag: "wx" });
  return { name, directory, patchPath, fingerprint: treeFingerprint(directory),
    patchHash: createHash("sha256").update(patch).digest("hex") };
}

export function checkScope(snapshot, baseline, sourcePaths) {
  const before = new Map(filesIn(baseline).map((file) => [file, fs.readFileSync(path.join(baseline, file))]));
  const after = new Map(filesIn(snapshot.directory).map((file) => [file, fs.readFileSync(path.join(snapshot.directory, file))]));
  const violations = [];
  for (const file of new Set([...before.keys(), ...after.keys()])) {
    const equalBytes = before.has(file) && after.has(file) && before.get(file).equals(after.get(file));
    const equalMode = equalBytes && (fs.statSync(path.join(baseline, file)).mode & 0o111) === (fs.statSync(path.join(snapshot.directory, file)).mode & 0o111);
    if (!equalMode && !sourcePaths.some((p) => file === p || file.startsWith(`${p}/`))) violations.push(file);
  }
  return { passed: !violations.length, violations };
}

export async function publishSnapshot(original, snapshot, signal) {
  if (signal?.aborted) return { applied: false, reason: "cancelled", patchPath: snapshot.patchPath };
  if (treeFingerprint(snapshot.directory) !== snapshot.fingerprint) throw new Error("SNAPSHOT_CHANGED");
  if (createHash("sha256").update(fs.readFileSync(snapshot.patchPath)).digest("hex") !== snapshot.patchHash) throw new Error("PATCH_CHANGED");
  try {
    const current = await inspectWorkspace(original.workspace);
    if (current.head !== original.head) return { applied: false, reason: "workspace_changed", patchPath: snapshot.patchPath };
  } catch {
    return { applied: false, reason: "workspace_changed", patchPath: snapshot.patchPath };
  }
  // A private index makes --index compare whole touched-file preimages instead
  // of only patch context, without staging changes in the user's index.
  // External editors still do not participate in a filesystem transaction.
  if (fs.statSync(snapshot.patchPath).size === 0) return { applied: true, reason: "empty_patch" };
  try {
    const indexEnv = { GIT_INDEX_FILE: path.join(path.dirname(snapshot.patchPath), `apply-index-${randomUUID()}`) };
    await git(original.workspace, ["read-tree", original.head], undefined, indexEnv);
    await git(original.workspace, ["update-index", "--refresh"], undefined, indexEnv);
    await git(original.workspace, ["apply", "--index", "--check", "--", snapshot.patchPath], undefined, indexEnv);
    const latest = await inspectWorkspace(original.workspace);
    if (latest.head !== original.head) return { applied: false, reason: "workspace_changed", patchPath: snapshot.patchPath };
    if (signal?.aborted) return { applied: false, reason: "cancelled", patchPath: snapshot.patchPath };
    // Once application starts, do not kill Git halfway through its file writes.
    await git(original.workspace, ["apply", "--index", "--", snapshot.patchPath], undefined, indexEnv);
    return { applied: true, reason: "patch_applied", cancelledAfterApplyStarted: Boolean(signal?.aborted) };
  } catch {
    return { applied: false, reason: "patch_conflict", patchPath: snapshot.patchPath };
  }
}
