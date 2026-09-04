import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { inspectWorkspace, createCandidate, snapshotCandidate, checkScope, publishSnapshot } from "../lib/workspace.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "verified-change-workspace-"));
  const repo = path.join(root, "user");
  fs.mkdirSync(repo);
  const git = (...args) => {
    const result = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: repo, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init");
  fs.mkdirSync(path.join(repo, "src"));
  fs.writeFileSync(path.join(repo, "src/api.mjs"), "export const value = 1;\n");
  fs.writeFileSync(path.join(repo, "test.mjs"), "// protected regression\n");
  git("add", ".");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture baseline");
  return { root, repo, git };
}

test("snapshots contain new files, source deletion, and preserve user HEAD", async () => {
  const f = fixture();
  const original = await inspectWorkspace(f.repo);
  const candidate = await createCandidate(original, path.join(f.root, "candidate"));
  fs.unlinkSync(path.join(candidate, "src/api.mjs"));
  fs.writeFileSync(path.join(candidate, "src/new.mjs"), "export const value = 2;\n");
  const out = path.join(f.root, "output"); fs.mkdirSync(out);
  const snapshot = await snapshotCandidate(candidate, out, "D0");
  assert.equal(checkScope(snapshot, f.repo, ["src"]).passed, true);
  assert.equal((await publishSnapshot(original, snapshot)).applied, true);
  assert.equal(fs.existsSync(path.join(f.repo, "src/api.mjs")), false);
  assert.match(fs.readFileSync(path.join(f.repo, "src/new.mjs"), "utf8"), /value = 2/);
  assert.equal(f.git("rev-parse", "HEAD"), original.head);
  assert.equal(f.git("diff", "--cached", "--name-only"), "", "publication must not stage the user's changes");
});

test("concurrent user work is left untouched and patch remains available", async () => {
  const f = fixture();
  const original = await inspectWorkspace(f.repo);
  const candidate = await createCandidate(original, path.join(f.root, "candidate"));
  fs.writeFileSync(path.join(candidate, "src/api.mjs"), "export const value = 2;\n");
  const out = path.join(f.root, "output"); fs.mkdirSync(out);
  const snapshot = await snapshotCandidate(candidate, out, "D0");
  fs.writeFileSync(path.join(f.repo, "src/api.mjs"), "user changes\n");
  const result = await publishSnapshot(original, snapshot);
  assert.equal(result.applied, false);
  assert.equal(result.reason, "workspace_changed");
  assert.equal(fs.readFileSync(path.join(f.repo, "src/api.mjs"), "utf8"), "user changes\n");
  assert.equal(fs.existsSync(result.patchPath), true);
});

test("cancellation before publication cannot apply a verified patch", async () => {
  const f = fixture();
  const original = await inspectWorkspace(f.repo);
  const candidate = await createCandidate(original, path.join(f.root, "candidate"));
  fs.writeFileSync(path.join(candidate, "src/api.mjs"), "export const value = 2;\n");
  const out = path.join(f.root, "output"); fs.mkdirSync(out);
  const snapshot = await snapshotCandidate(candidate, out, "D0");
  const control = new AbortController(); control.abort();
  const result = await publishSnapshot(original, snapshot, control.signal);
  assert.equal(result.reason, "cancelled");
  assert.match(fs.readFileSync(path.join(f.repo, "src/api.mjs"), "utf8"), /value = 1/);
});

test("dirty inputs and hidden index flags cannot enter a run", async () => {
  const f = fixture();
  f.git("update-index", "--assume-unchanged", "src/api.mjs");
  await assert.rejects(() => inspectWorkspace(f.repo), /INDEX_FLAGS_UNSUPPORTED/);
  f.git("update-index", "--no-assume-unchanged", "src/api.mjs");
  fs.writeFileSync(path.join(f.repo, "new.txt"), "user data");
  await assert.rejects(() => inspectWorkspace(f.repo), /WORKSPACE_DIRTY/);
});

test("protected tests and tampered snapshot patches are rejected", async () => {
  const f = fixture();
  const original = await inspectWorkspace(f.repo);
  const candidate = await createCandidate(original, path.join(f.root, "candidate"));
  fs.writeFileSync(path.join(candidate, "test.mjs"), "// weakened\n");
  const out = path.join(f.root, "output"); fs.mkdirSync(out);
  const snapshot = await snapshotCandidate(candidate, out, "D0");
  assert.deepEqual(checkScope(snapshot, f.repo, ["src"]).violations, ["test.mjs"]);
  fs.appendFileSync(snapshot.patchPath, "tampered");
  await assert.rejects(() => publishSnapshot(original, snapshot), /PATCH_CHANGED/);
});

test("a non-overlapping user edit during publication is not merged into a supposedly verified tree", async () => {
  const f = fixture();
  const content = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n") + "\n";
  fs.writeFileSync(path.join(f.repo, "src/api.mjs"), content);
  f.git("add", ".");
  f.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "long fixture");
  const original = await inspectWorkspace(f.repo);
  const candidate = await createCandidate(original, path.join(f.root, "candidate"));
  fs.writeFileSync(path.join(candidate, "src/api.mjs"), content.replace("line 1\n", "candidate change\n"));
  const out = path.join(f.root, "output"); fs.mkdirSync(out);
  const snapshot = await snapshotCandidate(candidate, out, "D0");
  let edited = false;
  const watcher = fs.watch(out, (_event, file) => {
    if (!edited && String(file).startsWith("apply-index-")) {
      edited = true;
      fs.writeFileSync(path.join(f.repo, "src/api.mjs"), content.replace("line 45\n", "concurrent user edit\n"));
    }
  });
  try {
    const result = await publishSnapshot(original, snapshot);
    assert.equal(edited, true);
    assert.equal(result.applied, false);
    const after = fs.readFileSync(path.join(f.repo, "src/api.mjs"), "utf8");
    assert.match(after, /concurrent user edit/);
    assert.doesNotMatch(after, /candidate change/);
  } finally { watcher.close(); }
});

test('draft import ignores inherited Git redirection and preserves the user worktree', async () => {
  const f=fixture();
  const original=await inspectWorkspace(f.repo);
  const candidate=await createCandidate(original,path.join(f.root,'candidate'));
  const patch=path.join(f.root,'input.patch');
  fs.writeFileSync(patch,'diff --git a/src/api.mjs b/src/api.mjs\n--- a/src/api.mjs\n+++ b/src/api.mjs\n@@ -1 +1 @@\n-export const value = 1;\n+export const value = 2;\n');
  const modulePath=new URL('../lib/workspace.mjs',import.meta.url).href;
  const run=spawnSync(process.execPath,['--input-type=module','-e',`import {importDraft} from ${JSON.stringify(modulePath)}; await importDraft(${JSON.stringify(candidate)},${JSON.stringify(patch)});`],{encoding:'utf8',env:{...process.env,GIT_DIR:path.join(f.repo,'.git'),GIT_WORK_TREE:f.repo,GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'core.worktree',GIT_CONFIG_VALUE_0:f.repo}});
  assert.equal(run.status,0,run.stderr);
  assert.match(fs.readFileSync(path.join(candidate,'src/api.mjs'),'utf8'),/value = 2/);
  assert.match(fs.readFileSync(path.join(f.repo,'src/api.mjs'),'utf8'),/value = 1/);
  assert.equal(f.git('status','--porcelain'),'');
});
