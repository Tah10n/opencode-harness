#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rawBundle = /(?:^|\/)eslint-provenance\.bundle(?:\.part-[0-9]+)?$/u;

function git(root, args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false, windowsHide: true });
}
function archivePaths(root) {
  const paths = [];
  const visit = (directory, prefix = "") => {
    for (const name of fs.readdirSync(directory).sort()) {
      if (name === ".git") continue;
      const relative = prefix === "" ? name : `${prefix}/${name}`;
      const target = path.join(directory, name);
      const stat = fs.lstatSync(target);
      assert.equal(stat.isSymbolicLink(), false, `source archive contains a symlink at ${relative}`);
      if (stat.isDirectory()) visit(target, relative);
      else if (stat.isFile()) paths.push(relative);
      else assert.fail(`source archive contains an unsupported entry at ${relative}`);
    }
  };
  visit(root);
  return paths;
}

export function verifyBenchmarkV3NoRawBundles(root) {
  const repository = git(root, ["rev-parse", "--show-toplevel"]);
  const realRoot = fs.realpathSync.native(root);
  let repositoryRoot = null;
  if (repository.status === 0) {
    try { repositoryRoot = fs.realpathSync.native(repository.stdout.trim()); } catch { repositoryRoot = null; }
  }
  let paths;
  let evidenceClass;
  if (repositoryRoot === realRoot) {
    const reachable = git(root, ["rev-list", "--objects", "HEAD"]);
    assert.equal(reachable.status, 0, reachable.stderr);
    paths = reachable.stdout.split("\n").filter(Boolean).map((entry) => entry.replace(/^[0-9a-f]{40,64}(?:\s+|$)/u, ""));
    evidenceClass = "current-head-reachable-object-absence";
  } else {
    paths = archivePaths(root);
    evidenceClass = "source-archive-tree-absence";
  }
  assert.deepEqual(paths.filter((entry) => rawBundle.test(entry)), []);
  return Object.freeze({ status: "passed", evidence_class: evidenceClass, model_execution: false });
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = verifyBenchmarkV3NoRawBundles(root);

if (process.env.BENCHMARK_V3_NO_RAW_BUNDLES_CHILD !== "1") {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-v3-no-raw-portable-"));
  try {
    const archive = path.join(temporary, "source.tar");
    const source = path.join(temporary, "source");
    fs.mkdirSync(source);
    assert.equal(spawnSync("tar", ["-cf", archive, "--exclude=.git", "--exclude=.worktrees", "--exclude=.oc_harness",
      "--exclude=node_modules", "-C", root, "."], {
      encoding: "utf8", shell: false, windowsHide: true,
    }).status, 0);
    assert.equal(spawnSync("tar", ["-xf", archive, "-C", source], { encoding: "utf8", shell: false, windowsHide: true }).status, 0);
    const archived = spawnSync(process.execPath, [path.join(source, "scripts", "verify-benchmark-v3-no-raw-bundles.mjs")], {
      cwd: source, encoding: "utf8", shell: false, windowsHide: true,
      env: { ...process.env, BENCHMARK_V3_NO_RAW_BUNDLES_CHILD: "1" },
    });
    assert.equal(archived.status, 0, archived.stderr);

    const foreignRepository = path.join(temporary, "foreign-repository");
    const nestedArchive = path.join(foreignRepository, "nested-source-archive");
    fs.mkdirSync(nestedArchive, { recursive: true });
    assert.equal(git(foreignRepository, ["init", "--quiet"]).status, 0);
    fs.writeFileSync(path.join(foreignRepository, "tracked.txt"), "foreign head\n");
    assert.equal(git(foreignRepository, ["add", "tracked.txt"]).status, 0);
    assert.equal(git(foreignRepository, ["-c", "user.name=Portable verifier", "-c", "user.email=portable@example.invalid",
      "commit", "--quiet", "-m", "foreign head"]).status, 0);
    fs.writeFileSync(path.join(nestedArchive, "eslint-provenance.bundle"), "forbidden raw bundle\n");
    assert.throws(() => verifyBenchmarkV3NoRawBundles(nestedArchive), /eslint-provenance\.bundle/u,
      "a source archive nested under an unrelated Git checkout must be scanned as an archive");

    const branch = git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    const clean = git(root, ["diff", "--quiet", "HEAD", "--"]);
    if (branch.status === 0 && clean.status === 0) {
      const clone = path.join(temporary, "single-branch");
      const cloned = spawnSync("git", ["clone", "--quiet", "--single-branch", "--branch", branch.stdout.trim(), root, clone], {
        encoding: "utf8", shell: false, windowsHide: true,
      });
      assert.equal(cloned.status, 0, cloned.stderr);
      const clonedCheck = spawnSync(process.execPath, [path.join(clone, "scripts", "verify-benchmark-v3-no-raw-bundles.mjs")], {
        cwd: clone, encoding: "utf8", shell: false, windowsHide: true,
        env: { ...process.env, BENCHMARK_V3_NO_RAW_BUNDLES_CHILD: "1" },
      });
      assert.equal(clonedCheck.status, 0, clonedCheck.stderr);
    }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

process.stdout.write(`${JSON.stringify(result)}\n`);
