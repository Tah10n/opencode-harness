// Planning only. Execution goes through the existing native Bash permission,
// cancellation and containment path. A/B are neither imported nor required.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {projectScope, sourcePath, testPath, quoteShell} from './native-project-scope.mjs';
import {commandWords} from './native-task-observations.mjs';

export const sensitivityLimits = Object.freeze({variants: 8, taskMs: 180000, files: 4, lines: 120});
export function sensitivityEnabled(env = process.env) {
  const value = env.HARNESS_TASK_SENSITIVITY ?? '0';
  if (!['0', '1'].includes(value)) throw Error('HARNESS_TASK_SENSITIVITY must be 0 or 1');
  return value === '1';
}
export const sensitivityInstruction = 'After changing behavior and passing the relevant suite, use native Bash `harness-sense <production path|changed> [test-script-or-quoted-local-test-command]` with workdir "." when supported to check whether tests distinguish a meaningful violation. Inspect the concrete surviving diff against the original task/public contract: add an ordinary API regression only for a required property; explain equivalent or allowed changes. Tests must exercise API behavior, not source text, mutation names, environment markers or tool paths. Rerun after editing tests. Observations are partial, not a bug verdict or task-completion certificate; no mutation score is required.';

const match = (value, pattern) => new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$').test(value);
function allowedCommand(command, rules) {
  let action = 'ask';
  for (const rule of rules) if (['*', 'bash'].includes(rule.permission) && match(command, rule.pattern)) action = rule.action;
  return action === 'allow';
}
export function sensitivityPlan({directory, rules, command, base = 'HEAD'}) {
  const words = commandWords(command);
  if (!words || words[0] !== 'harness-sense' || words.length > 3) throw Error('Use harness-sense <production path|changed> [test-script]');
  const query = words[1] ?? 'changed', script = words[2] ?? 'test';
  const explicit = commandWords(script);
  const localRunner = explicit && (explicit[0] === 'node' && explicit[1] === '--test' || ['node_modules/.bin/ava', 'node_modules/.bin/mocha'].includes(explicit[0]) || explicit[0] === 'node_modules/.bin/vitest' && explicit[1] === 'run');
  if (!localRunner && !/^test(?::[\w-]+)*$/.test(script)) throw Error('Use an existing test script or an explicit local Node/AVA/Mocha/Vitest test command');
  const scope = projectScope(directory, rules, {allFiles: true});
  if (scope.omitted) throw Error('Incomplete readable snapshot; diagnostic copy not admitted: ' + scope.limits.join(' '));
  if (localRunner) {
    const positional = explicit.slice(['node', 'node_modules/.bin/vitest'].includes(explicit[0]) ? 2 : 1);
    for (const arg of positional) if (arg.startsWith('-') || path.isAbsolute(arg) || !scope.files.has(scope.relative(arg)) || !testPath(scope.relative(arg)))
      throw Error('Explicit runner arguments must be readable relative project test files; use a declared test script for runner flags');
  }
  // Initial scope deliberately excludes workspaces and alternate package managers.
  const pkg = scope.packages.find(p => p.directory === '.');
  if (!pkg || pkg.value.workspaces || (pkg.value.packageManager && !pkg.value.packageManager.startsWith('npm@')))
    throw Error('Supported scope: small single-package npm JS/TS projects');
  if (!localRunner && !pkg.value.scripts?.[script]?.trim()) throw Error('No declared ' + script + ' script');
  const testCommand = localRunner ? script : 'npm run ' + script;
  if (!allowedCommand(testCommand, rules) || !localRunner && !allowedCommand(pkg.value.scripts[script], rules))
    throw Error('Selected test command requires native Bash permission; no diagnostic execution admitted');
  const git = spawnSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', 'diff', '--no-ext-diff', '--no-textconv', '--unified=0', '--no-renames', base, '--'], {cwd: directory, encoding: 'utf8', timeout: 10000, maxBuffer: 2 * 1024 * 1024});
  if (git.status !== 0) throw Error('Changed production scope unavailable');
  const changed = new Map(); let name;
  for (const line of git.stdout.split('\n')) {
    if (line.startsWith('+++ b/')) { name = line.slice(6); continue; }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && scope.files.has(name)) {
      const size = scope.files.get(name).split('\n').length, start = Math.max(1, Number(hunk[1]) - 1);
      const end = Math.min(size, Number(hunk[1]) + Number(hunk[2] ?? 1));
      changed.set(name, [...(changed.get(name) ?? []), {start, end}]);
    }
  }
  const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {cwd: directory, encoding: 'utf8', timeout: 10000});
  if (untracked.status !== 0) throw Error('New source enumeration unavailable');
  for (const name of untracked.stdout.split('\0')) if (scope.files.has(name)) changed.set(name, [{start: 1, end: scope.files.get(name).split('\n').length}]);
  const requested = query === 'changed' ? null : scope.relative(query);
  if (requested && (!sourcePath(requested) || testPath(requested) || /\.d\.[cm]?ts$/.test(requested))) throw Error('Scope must be a JS/TS production file');
  const ranges = [...changed].filter(([name]) => sourcePath(name) && !testPath(name) && !/\.d\.[cm]?ts$/.test(name) && (!requested || name === requested));
  if (!ranges.length) throw Error('No changed production lines in requested scope; unchanged files and test-only edits are not mutated');
  if (ranges.length > sensitivityLimits.files || ranges.reduce((n, [, r]) => n + r.reduce((s, x) => s + x.end - x.start + 1, 0), 0) > sensitivityLimits.lines)
    throw Error('Changed scope exceeds 4 files/120 lines; request one smaller production path');
  const files = [...scope.files].map(([name, text]) => {
    const bytes = fs.readFileSync(path.join(directory, name));
    if (!Buffer.from(text).equals(bytes)) throw Error('Binary data is outside the first supported scope: ' + name);
    return [name, text];
  });
  let dependencies = path.join(directory, 'node_modules');
  if (!fs.existsSync(dependencies)) {
    // Native task worktrees are nested in the original repository's .git.
    // Ordinary Node/npm execution inherits that ancestor's installed modules.
    // Preserve this existing resolution path, never search arbitrary host roots.
    const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {cwd: directory, encoding:'utf8', timeout:10000});
    if (common.status === 0) {
      const original = path.dirname(common.stdout.trim());
      if (directory.startsWith(original + path.sep)) dependencies = path.join(original, 'node_modules');
    }
  }
  return {query, command: testCommand, argv: localRunner ? explicit : ['npm', 'run', script], script: localRunner ? null : pkg.value.scripts[script], snapshot: scope.hash, files, ranges, rules, dependencies,
    limits: ['Only changed production lines and one neighboring line; no cross-package or semantic requirement coverage inference.', 'Standard Stryker operators may miss identity loss or a specific state transition.', 'Ignored project files are excluded; installed node_modules is copied. Fresh baseline and variant commands; no result cache.', 'Nonzero command exits need inspection; no assertion classification or mutation score. Surviving variants may be equivalent or allowed.']};
}

export function createSensitivity({directory, rules, base, save, checkActive, remainingMs}) {
  let spentMs = 0;
  const events = [];
  return {
    before(input, output, snapshot) {
      if (input.tool !== 'bash') return null;
      const direct = commandWords(output.args.command ?? '');
      const rawRunner = direct && path.basename(direct[0] ?? '') === 'node' && path.basename(direct[1] ?? '') === 'native-sensitivity-runner.mjs';
      if (!rawRunner && !/^harness-sense(?:\s|$)/.test(output.args.command ?? '')) return null;
      const startedAt = Date.now(); let plan;
      try {
        checkActive();
        if (rawRunner) throw Error('Invoke harness-sense so the shared diagnostic budget is applied');
        if (path.resolve(directory, output.args.workdir ?? '.') !== directory) throw Error('Use workdir "."');
        const requestedMs = Number(output.args.timeout) || sensitivityLimits.taskMs;
        const budgetMs = Math.min(sensitivityLimits.taskMs - spentMs, remainingMs() - 1000, requestedMs - 500);
        if (budgetMs < 1000) throw Error('Diagnostic task budget exhausted');
        plan = sensitivityPlan({directory, rules, command: output.args.command, base});
        const runner = fileURLToPath(new URL('./native-sensitivity-runner.mjs', import.meta.url));
        // Snapshot is captured once more by the runner; no source content in shell args.
        const spec = {query: plan.query, script: output.args.command, base, rules, snapshot: plan.snapshot, budgetMs: Math.max(1, budgetMs - (Date.now() - startedAt))};
        output.args.command = 'node ' + quoteShell(runner) + ' ' + quoteShell(Buffer.from(JSON.stringify(spec)).toString('base64'));
        output.args.timeout = Math.max(1000, Math.min(Number(output.args.timeout) || budgetMs + 500, budgetMs + 500));
      } catch (error) {
        plan = {status: 'not-run', limitation: error.message};
        output.args.command = 'printf %s ' + quoteShell(JSON.stringify({sensitivity: plan}));
      }
      output.args.workdir = '.';
      return {startedAt, snapshot, plan: {query: plan.query, command: plan.command, snapshot: plan.snapshot, status: plan.status, limitation: plan.limitation}};
    },
    after(input, output, pending, snapshot) {
      for (const event of events) if (event.sourceState !== snapshot) event.stale = true;
      if (events.length) save('sensitivity-events.json', events);
      const prior = pending.sensitivity;
      if (!prior) return;
      const elapsedMs = Date.now() - prior.startedAt;
      spentMs += elapsedMs;
      const event = {...prior.plan, callID: input.callID, sourceState: prior.snapshot, stale: snapshot !== prior.snapshot, elapsedMs, taskDiagnosticMs: spentMs, output: output.output};
      if (prior.plan.status !== 'not-run') {
        try { event.terminationVerified = JSON.parse(output.output).terminationVerified === true; }
        catch { event.terminationVerified = false; }
      }
      events.push(event); save('sensitivity-events.json', events);
      output.output += '\nSensitivity state: ' + JSON.stringify({sourceState: prior.snapshot, stale: event.stale, taskDiagnosticMs: spentMs, remainingDiagnosticMs: Math.max(0, sensitivityLimits.taskMs - spentMs), notice: 'Only this captured state was checked. Subsequent file edits invalidate applicability; rerun explicitly.'});
      return event;
    },
  };
}
