// One native tool adapter around the existing bounded planner and runner.
// A/B are neither imported nor required.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {digest} from './native-project-scope.mjs';
import {spawnSync} from 'node:child_process';
import {projectScope, sourcePath, testPath} from './native-project-scope.mjs';
import {commandWords} from './native-task-observations.mjs';

export const sensitivityLimits = Object.freeze({variants: 8, taskMs: 180000, files: 4, lines: 120});
export function sensitivityEnabled(env = process.env) {
  const value = env.HARNESS_TASK_SENSITIVITY ?? '0';
  if (!['0', '1'].includes(value)) throw Error('HARNESS_TASK_SENSITIVITY must be 0 or 1');
  return value === '1';
}
export const sensitivityInstruction = 'After changing behavior and passing the relevant suite, call native tool `harness_sense` with `{path: "changed", check: "test"}` (check defaults to test). Before dismissing a meaningful survivor as equivalent, try a small distinguishing scenario through the public API and check it on both implementations using the returned replay example. If the difference concerns required behavior, retain the test in the ordinary project suite. Not finding a difference does not prove equivalence. Return values, exceptions, state, callbacks/order and object identity are possible observations, not a checklist. Expected assertions need independent justification from the original task/public contract; a rejected variant does not prove the original correct. Tests must not inspect source text, mutation names, environment markers or tool paths. Control time/randomness in the ordinary test when needed. Equivalent or allowed differences need no change. Disclose unresolved limitations; no mutation score or completion protocol is required.';

const match = (value, pattern) => new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$').test(value);
function allowedCommand(command, rules) {
  let action = 'ask';
  for (const rule of rules) if (['*', 'bash'].includes(rule.permission) && match(command, rule.pattern)) action = rule.action;
  return action === 'allow';
}
export function sensitivityPlan({directory, rules, args = {}, base = 'HEAD', selectedMutation}) {
  // Inspect the permission-filtered package before reporting available scripts.
  const scope = projectScope(directory, rules, {allFiles: true});
  if (scope.omitted) throw Error('Incomplete readable snapshot; diagnostic copy not admitted: ' + scope.limits.join(' '));
  // Initial scope deliberately excludes workspaces and alternate package managers.
  const pkg = scope.packages.find(p => p.directory === '.');
  if (!pkg || pkg.value.workspaces || (pkg.value.packageManager && !pkg.value.packageManager.startsWith('npm@')))
    throw Error('Supported scope: small single-package npm JS/TS projects');
  const availableScripts = Object.entries(pkg.value.scripts ?? {}).filter(([name, value]) => /^test(?::[\w-]+)*$/.test(name) && typeof value === 'string' && value.trim()).map(([name]) => name);
  const invalid = reason => { throw Error(reason + '. Example: harness_sense({path: "changed", check: "npm test"}). Available test scripts: ' + (availableScripts.join(', ') || '(none)')); };
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(k => !['path', 'check', 'variant'].includes(k))) invalid('Only path, check and variant arguments are supported');
  if (args.variant !== undefined && (typeof args.variant !== 'string' || !selectedMutation || selectedMutation.ref !== args.variant)) invalid('Unknown variant reference in this workflow; run a fresh diagnostic');
  const query = args.path ?? selectedMutation?.fileName ?? 'changed', check = args.check ?? 'test';
  if (typeof query !== 'string' || !query.trim() || typeof check !== 'string') invalid('path and check must be nonempty strings');
  const explicit = commandWords(check);
  const localRunner = explicit && (explicit[0] === 'node' && explicit[1] === '--test' || ['node_modules/.bin/ava', 'node_modules/.bin/mocha'].includes(explicit[0]) || explicit[0] === 'node_modules/.bin/vitest' && explicit[1] === 'run');
  let script;
  if (localRunner) {
    const positional = explicit.slice(['node', 'node_modules/.bin/vitest'].includes(explicit[0]) ? 2 : 1);
    for (const arg of positional) if (arg.startsWith('-') || path.isAbsolute(arg) || !scope.files.has(scope.relative(arg)) || !testPath(scope.relative(arg)))
      invalid('Explicit runner arguments must be readable relative project test files; use a declared test script for runner flags');
  } else {
    // No shell evaluation, flags, extra words, or silently discarded suffixes.
    script = explicit?.length === 1 ? explicit[0] : explicit?.length === 2 && explicit[0] === 'npm' && explicit[1] === 'test' ? 'test' : explicit?.length === 3 && explicit[0] === 'npm' && explicit[1] === 'run' ? explicit[2] : null;
    if (!script || !/^test(?::[\w-]+)*$/.test(script)) invalid('Unsupported check; use test, npm test, npm run test, or an existing test:... script without extra arguments');
    if (!availableScripts.includes(script)) invalid('No declared ' + script + ' script');
  }
  const testCommand = localRunner ? check : 'npm run ' + script;
  const permissionCommands = [testCommand, ...(localRunner ? [] : ['pre' + script, script, 'post' + script].map(name => pkg.value.scripts[name]).filter(Boolean))];
  if (permissionCommands.some(command => !allowedCommand(command, rules)))
    throw Error('Selected test command or npm lifecycle hook requires native Bash permission; no diagnostic execution admitted');
  if (selectedMutation) {
    const source = scope.files.get(selectedMutation.fileName);
    if (source === undefined || digest(source) !== selectedMutation.sourceSha256)
      throw Error('Production file changed since this variant was generated; run a fresh diagnostic. Old offsets are not applied.');
    if (query !== 'changed' && scope.relative(query) !== selectedMutation.fileName) invalid('variant and path refer to different production files');
  }
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
  return {query, originalArguments: {...args}, availableScripts, permissionCommands, command: testCommand, argv: localRunner ? explicit : ['npm', 'run', script], script: localRunner ? null : pkg.value.scripts[script], snapshot: scope.hash, files, ranges, rules, dependencies,
    limits: ['Only changed production lines and one neighboring line; no cross-package or semantic requirement coverage inference.', 'Standard Stryker operators may miss identity loss or a specific state transition.', 'Ignored project files are excluded; installed node_modules is copied. Fresh baseline and variant commands; no result cache.', 'Nonzero command exits need inspection; no assertion classification or mutation score. Surviving variants may be equivalent or allowed.']};
}

export function createSensitivity({directory, rules, base, save, checkActive, remainingMs, signal}) {
  let spentMs = 0, inFlight;
  const events = [];
  const definitions = new Map(), referencePrefix = randomBytes(6).toString('hex');
  let referenceSequence = 0;
  return {
    before(input, output, snapshot) {
      if (input.tool !== 'harness_sense') return null;
      return {startedAt: Date.now(), snapshot, args: structuredClone(output.args)};
    },
    async execute(prior, context) {
      if (inFlight) throw Error('A sensitivity call is already running');
      const work = async () => {
        let report = {kind: 'sensitivity', status: 'not-run', engineExecuted: false, originalArguments: prior.args,
          baseline: null, variants: [], cost: {commands: 0, engineMs: 0, preparationMs: 0, commandMs: 0}, limits: [], terminationVerified: true};
        try {
          checkActive();
          const selectedMutation = prior.args?.variant === undefined ? undefined : definitions.get(prior.args.variant);
          const plan = sensitivityPlan({directory, rules, args: prior.args, base, selectedMutation});
          prior.plan = {query: plan.query, command: plan.command, snapshot: plan.snapshot, originalArguments: plan.originalArguments};
          report.command = plan.command;
          // Registration is not permission: enforce the selected command and its
          // npm lifecycle bodies through the native permission API as well.
          await context.ask({permission: 'bash', patterns: plan.permissionCommands, always: [], metadata: {command: plan.command, diagnosticCopies: true}});
          checkActive();
          const budgetMs = Math.min(sensitivityLimits.taskMs - spentMs - (Date.now() - prior.startedAt), remainingMs() - 1000);
          if (budgetMs < 1000) throw Error('Diagnostic task budget exhausted');
          const {runSensitivity} = await import('./native-sensitivity-runner.mjs');
          report = await runSensitivity({args: prior.args, base, rules, snapshot: plan.snapshot, budgetMs, selectedMutation},
            {directory, signal: signal ? AbortSignal.any([signal, context.abort]) : context.abort});
          for (const variant of report.variants) {
            const ref = selectedMutation?.ref ?? `v-${referencePrefix}-${++referenceSequence}`;
            const definition = selectedMutation ?? {ref, fileName: variant.fileName, location: variant.location, replacement: variant.replacement, mutatorName: variant.mutatorName, sourceSha256: variant.sourceSha256, original: variant.original, diff: variant.diff};
            definitions.set(ref, structuredClone(definition));
            variant.ref = ref;
            variant.replay = {variant: ref, check: prior.args.check ?? 'test'};
          }
          save('sensitivity-mutations.json', [...definitions.values()]);
        } catch (error) { report.limits.push(error.message); }
        finally {
          prior.elapsedMs = Date.now() - prior.startedAt;
          spentMs += prior.elapsedMs;
          report.cost.totalMs = prior.elapsedMs;
          report.originalArguments = prior.args;
        }
        return JSON.stringify(report);
      };
      inFlight = work();
      try { return await inFlight; } finally { inFlight = null; }
    },
    async settle() { if (inFlight) await inFlight; },
    after(input, output, pending, snapshot) {
      for (const event of events) if (event.sourceState !== snapshot) event.stale = true;
      if (events.length) save('sensitivity-events.json', events);
      const prior = pending.sensitivity;
      if (!prior) return;
      const event = {...prior.plan, originalArguments: prior.args, callID: input.callID, sourceState: prior.snapshot,
        stale: snapshot !== prior.snapshot, elapsedMs: prior.elapsedMs, taskDiagnosticMs: spentMs, output: output.output};
      try { event.terminationVerified = JSON.parse(output.output).terminationVerified === true; }
      catch { event.terminationVerified = false; }
      events.push(event); save('sensitivity-events.json', events);
      output.output += '\nSensitivity state: ' + JSON.stringify({sourceState: prior.snapshot, stale: event.stale, taskDiagnosticMs: spentMs, remainingDiagnosticMs: Math.max(0, sensitivityLimits.taskMs - spentMs), notice: 'Only this captured state was checked. Subsequent file edits invalidate applicability; rerun explicitly.'});
      return event;
    },
  };
}
