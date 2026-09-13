// B selects a real command; the existing native Bash owns permission, process,
// cancellation, deadline and output. This module never starts a process.
import path from 'node:path';
import {commandWords} from './native-task-observations.mjs';
import {quoteShell, testPath} from './native-project-scope.mjs';

export function selectProjectCheck(scope, input) {
  const words = commandWords(input);
  if (!words || words[0] !== 'harness-check' || words.length > 3) throw Error('Use harness-check <project path> [test|typecheck|check|lint|build]');
  const query = scope.relative(words[1] ?? '.'), kind = words[2] ?? 'test';
  if (!['test', 'typecheck', 'check', 'lint', 'build'].includes(kind)) throw Error('Unsupported check kind');
  const pkg = scope.packageFor(query);
  if (!pkg) throw Error('No readable package.json applies to this path');
  const script = pkg.value.scripts?.[kind];
  const available = Object.entries(pkg.value.scripts ?? {}).filter(([n]) => /^(test(?::.*)?|typecheck|check|lint|build)$/.test(n)).map(([name, command]) => ({name, command, source: pkg.file}));
  if (typeof script !== 'string' || !script.trim()) throw Error('No declared ' + kind + ' script in ' + pkg.file + '; use a project command through normal Bash');
  const manager = typeof pkg.value.packageManager === 'string' ? pkg.value.packageManager.split('@')[0] :
    scope.files.has(path.posix.join(pkg.directory, 'pnpm-lock.yaml')) || scope.files.has('pnpm-lock.yaml') ? 'pnpm' :
      scope.files.has(path.posix.join(pkg.directory, 'yarn.lock')) || scope.files.has('yarn.lock') ? 'yarn' : 'npm';
  if (!['npm', 'pnpm', 'yarn'].includes(manager)) throw Error('Unsupported package manager: ' + manager);
  let command = `${manager} run ${kind}`, selection = 'entire declared package script', completeSelection = true;
  // Narrow only a plain native Node discovery script with no lifecycle hooks.
  // Keep every other runner/configuration intact instead of guessing its CLI.
  if (kind === 'test' && script.trim() === 'node --test' && !pkg.value.scripts.pretest && !pkg.value.scripts.posttest && testPath(query) && scope.files.has(query)) {
    command = 'node --test ' + quoteShell(path.posix.relative(pkg.directory, query)); selection = 'explicit project test path'; completeSelection = false;
  }
  return {component: 'B', query, kind, snapshot: scope.hash, workdir: pkg.directory, command, script,
    basis: {source: pkg.file, field: 'scripts.' + kind, selection}, available, completeSelection,
    limits: [...scope.limits, 'Selection is package/path based; cross-package consumers and undeclared checks are not inferred. Narrow success does not close a required broad check. Tests/assertions are not independently certified. Baseline differences do not automatically mean regressions.']};
}

export function checkObservation(plan, output, metadata = {}, elapsedMs) {
  const raw = output ?? '', environment = /(?:MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|command not found|ENOENT|Cannot find (?:module|package)|Missing script:)/.test(raw);
  // OpenCode 1.18.26 retains command output in metadata.output and appends its
  // timeout footer separately. Test names (or a command printing that footer)
  // are not evidence that the native tool interrupted execution.
  const nativeSuffix = typeof metadata.output === 'string' && raw.startsWith(metadata.output) ? raw.slice(metadata.output.length) : '';
  const timeout = /(?:^|\n)<shell_metadata>\nshell tool terminated command after exceeding timeout \d+ ms\.[^\n]*\n<\/shell_metadata>\s*$/.test(nativeSuffix);
  return {...plan, executed: true, exit: metadata.exit ?? null, status: metadata.exit === 0 ? 'passed' : timeout ? 'timeout-or-interruption' : environment ? 'environment-or-resolution-error' : 'failed-or-unclassified',
    diagnostics: raw.length > 9000 ? raw.slice(0, 1500) + '\n[output truncated; inspect native Bash output]\n' + raw.slice(-7500) : raw,
    cost: {elapsedMs}, notice: 'A command result is an observation. Check setup and task intent before classifying a failure as a behavioral regression.'};
}
