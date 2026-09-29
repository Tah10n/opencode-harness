// Read-only context export for a native command. No session/provider/test runner.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const hash = value => createHash('sha256').update(value).digest('hex');
const limit = 1024 * 1024;
export function reviewContext({ cwd = process.cwd(), base = process.env.HARNESS_REVIEW_BASE,
  taskFile = process.env.HARNESS_REVIEW_TASK_FILE, permissionRules } = {}) {
  try {
    if (!base || base.startsWith('-') || /[\0\r\n]/.test(base)) throw Error('An explicit HARNESS_REVIEW_BASE is required');
    // Command shell expansion is not a permission-checked agent tool. Resolve
    // installed project read rules before exporting any task/diff contents.
    if (!permissionRules) {
      const debug = spawnSync(process.env.OPENCODE_BIN ?? 'opencode', ['debug', 'agent', 'harness-reviewer'],
        { cwd, encoding: 'utf8', timeout: 30000, maxBuffer: limit });
      if (debug.status !== 0 || debug.error) throw Error('Native reviewer permissions unavailable');
      permissionRules = JSON.parse(debug.stdout).permission;
    }
    if (!Array.isArray(permissionRules)) throw Error('Native read rules unavailable');
    // Conservative preflight only, not a replacement permission engine. Native
    // 1.18.26 wildcard rules are ordered, last match wins. Check both spellings;
    // refuse asks as well as denies rather than exporting a partial diff.
    const matches = (value, pattern) => {
      if (typeof pattern !== 'string') throw Error('Unknown permission pattern');
      const escaped = pattern.replaceAll('\\', '/').replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*').replace(/\?/g, '.');
      return new RegExp('^' + escaped + '$', process.platform === 'win32' ? 'si' : 's').test(value.replaceAll('\\', '/'));
    };
    const readable = name => {
      const absolute = path.resolve(cwd, name), relative = path.relative(cwd, absolute);
      const spellings = [name, absolute];
      // Check project-relative task rules without turning a generic fallback ask
      // into a second requirement for an explicitly allowed absolute task path.
      if (permissionRules.some(rule => (rule.permission === 'read' || rule.permission === '*') &&
        matches(relative, rule.pattern) && !matches(absolute, rule.pattern))) spellings.push(relative);
      for (const spelling of spellings) {
        let action = 'ask';
        for (const rule of permissionRules)
          if ((rule.permission === 'read' || rule.permission === '*') && matches(spelling, rule.pattern)) action = rule.action;
        if (action !== 'allow') throw Error('Snapshot includes a path requiring read permission; no content exported');
      }
    };
    const git = (args, ok = [0]) => {
      const result = spawnSync('git', ['--no-pager', '--no-optional-locks', '-c', 'core.fsmonitor=false',
        '-c', 'core.untrackedCache=false', ...args], { cwd, encoding: 'utf8', maxBuffer: limit * 2, timeout: 15000 });
      if (result.error || !ok.includes(result.status)) throw Error(`Git context unavailable (${args[0]})`);
      return result.stdout;
    };
    const root = git(['rev-parse', '--show-toplevel']).trim();
    cwd = root;
    const resolvedBase = git(['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`]).trim();
    const capture = () => {
      const head = git(['rev-parse', 'HEAD']).trim();
      const status = git(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
      if (git(['ls-files', '--unmerged', '-z'])) throw Error('Unmerged index: full comparison is unavailable');
      if (git(['ls-files', '-v', '-z']).split('\0').some(s => /^[a-zS]/.test(s)))
        throw Error('Hidden index flags prevent a full worktree comparison');
      // Enumerate both sides of renames, under the same content options as export.
      const diffOptions = ['--no-ext-diff', '--no-textconv', '--ignore-submodules=none', '--submodule=short'];
      const changed = git(['diff', ...diffOptions, '--no-renames', '--name-only', '-z', resolvedBase, '--']).split('\0').filter(Boolean);
      for (const name of changed) readable(name);
      const tracked = git(['diff', ...diffOptions, '--binary', '--full-index', resolvedBase, '--']);
      const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
      const parts = [tracked];
      for (const name of untracked) {
        readable(name);
        if (!fs.lstatSync(path.join(root, name)).isFile() && !fs.lstatSync(path.join(root, name)).isSymbolicLink())
          throw Error('Unsupported new file kind');
        parts.push(git(['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--binary', '--full-index',
          '--', process.platform === 'win32' ? 'NUL' : '/dev/null', name], [0, 1]));
        if (Buffer.byteLength(parts.join('')) > limit) throw Error('Diff exceeds 1 MiB: not a complete review input');
      }
      // Dirty submodules cannot be represented by a superproject diff alone.
      if (git(['submodule', 'status', '--recursive']).split('\n').some(s => /^[+U-]/.test(s)))
        throw Error('Submodule content requires a separate explicit review');
      const entries = git(['status', '--porcelain=v2', '-z', '--ignore-submodules=none', '--untracked-files=no']).split('\0');
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!/^[12u] /.test(entry)) continue;
        const submodule = entry.split(' ', 3)[2]; // S<commit><modified><untracked>, or N...
        if (submodule.startsWith('S') && submodule !== 'S...')
          throw Error('Submodule content requires a separate explicit review');
        if (entry.startsWith('2 ')) i++; // Next NUL field is the original pathname.
      }
      const diff = parts.join('');
      if (Buffer.byteLength(diff) > limit)
        throw Error('Oversized diff: not a complete review input');
      return { head, status, untracked, diff };
    };
    let task = null;
    if (taskFile) {
      if (!path.isAbsolute(taskFile)) throw Error('Task file must be absolute');
      readable(taskFile);
      // Resolve file and parent-directory aliases before accessing contents.
      const actualTaskFile = fs.realpathSync(taskFile);
      readable(actualTaskFile);
      const stat = fs.statSync(actualTaskFile);
      if (!stat.isFile() || stat.size > limit)
        throw Error('Task file must be an absolute regular file no larger than 1 MiB');
      task = fs.readFileSync(actualTaskFile, 'utf8');
      if (!task.trim()) task = null;
    }
    const first = capture(), second = capture();
    if (JSON.stringify(first) !== JSON.stringify(second)) throw Error('Worktree changed during capture; rerun explicitly');
    const binding = { base: resolvedBase, head: first.head, status: first.status, diff: first.diff, task };
    return { status: 'captured', scope: task === null ? 'code-review-only' : 'original-task-review',
      base: resolvedBase, head: first.head, snapshotSha256: hash(JSON.stringify(binding)),
      taskSha256: task === null ? null : hash(task), task, untracked: first.untracked, diff: first.diff,
      limits: 'Snapshot only; ignored files excluded. Checks NOT RUN. Later edits require a new review. No correctness verdict.' };
  } catch (error) {
    return { status: 'incomplete', scope: 'unverified', error: error.message,
      limits: 'No full diff/task-completeness claim is possible. Checks NOT RUN. No repair started.' };
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.stdout.write(JSON.stringify(reviewContext()) + '\n');
