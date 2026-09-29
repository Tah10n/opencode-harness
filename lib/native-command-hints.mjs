// Optional host-derived context, never a command runner or trusted check result.
import fs from 'node:fs';
import path from 'node:path';
import {commandWords} from './native-task-observations.mjs';
import {dependencyAncestors, digest, quoteShell, readableProjectPath} from './native-project-scope.mjs';

export const commandHintLimits = Object.freeze({paths: 512, bytes: 65536, metadata: 16384, milliseconds: 75, output: 2400, layers: 12, pathEntries: 16});
export function commandHintRequest(command) {
  const words = commandWords(command);
  // No shell chains, environment assignments, expansions, flags on the manager,
  // quoting ambiguities, or arbitrary exec programs. Keep original argv exactly.
  if (!words || !/^(?:npm|pnpm)(?: [A-Za-z0-9_./:@=-]+)+$/.test(command) || !['npm', 'pnpm'].includes(words[0])) return null;
  let script;
  if ((words[0] === 'npm' ? ['test'] : ['test', 'lint', 'typecheck', 'check', 'build']).includes(words[1])) script = words[1];
  else if (words[1] === 'run' && /^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/.test(words[2] ?? '')) script = words[2];
  else return null;
  const offset = words[1] === 'run' ? 3 : 2;
  if (words.length > offset && words[offset] !== '--') return null;
  return {manager: words[0], script, words};
}

function reader({directory, rules, active}, cost, deadline) {
  const facts = new Map(), stats = new Map();
  const signature = s => s && (s.isDirectory() ? [s.dev, s.ino, s.mode] : [s.dev, s.ino, s.mode, s.size, s.mtimeMs, s.ctimeMs]);
  const check = () => {
    if (!active() || performance.now() >= deadline || cost.paths >= commandHintLimits.paths) throw Error('observation budget or task no longer active');
  };
  const permitted = file => {
    check();
    if (!readableProjectPath(directory, file, rules)) throw Error('path is not permitted for observation');
  };
  const stat = (file, refresh = false) => {
    permitted(file);
    if (!refresh && stats.has(file)) return stats.get(file);
    cost.paths++;
    try {
      const s = fs.lstatSync(file);
      facts.set(file, signature(s)); stats.set(file, s);
      return s;
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      facts.set(file, null); stats.set(file, null); return null;
    }
  };
  const resolve = (file, links = 0, followFinal = true) => {
    permitted(file);
    if (links > 8) throw Error('symlink limit');
    // Check each link before traversing it, including links in parent paths.
    const parsed = path.parse(file); let cursor = parsed.root, last;
    for (const part of file.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, part);
      // Ancestor traversal metadata is not package content; still require policy.
      const s = last = stat(cursor);
      if (!s) return null;
      if (s.isSymbolicLink()) {
        if (!followFinal && cursor === file) return {file: cursor, stat: s};
        const target = path.resolve(path.dirname(cursor), fs.readlinkSync(cursor));
        permitted(target);
        const suffix = path.relative(cursor, file);
        return resolve(path.resolve(target, suffix), links + 1, followFinal);
      }
    }
    return {file: cursor, stat: last};
  };
  const json = file => {
    const result = resolve(file);
    if (!result) return null;
    const s = result.stat;
    if (!s.isFile() || s.size > commandHintLimits.metadata || cost.bytes + s.size > commandHintLimits.bytes) throw Error('metadata size or file kind unsupported');
    permitted(result.file);
    const fd = fs.openSync(result.file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const opened = fs.fstatSync(fd);
      if (opened.ino !== s.ino || opened.dev !== s.dev || opened.size !== s.size) throw Error('metadata changed');
      const bytes = Buffer.alloc(s.size); const n = fs.readSync(fd, bytes, 0, bytes.length, 0);
      cost.reads++; cost.bytes += n;
      if (n !== bytes.length) throw Error('metadata changed');
      facts.set('bytes:' + result.file, digest(bytes));
      return JSON.parse(bytes.toString('utf8'));
    } finally { fs.closeSync(fd); }
  };
  const fresh = (newDeadline) => {
    if (newDeadline !== undefined) deadline = newDeadline;
    for (const [file, previous] of [...facts]) {
      check();
      if (file.startsWith('bytes:')) {
        const name = file.slice(6); json(name);
        if (facts.get(file) !== previous) return false;
      } else {
        stat(file, true);
        if (JSON.stringify(facts.get(file)) !== JSON.stringify(previous)) return false;
      }
    }
    return true;
  };
  return {resolve, json, fresh};
}

export function createCommandHints({directory, originalDirectory = directory, rules, active, save, env = process.env}) {
  let spent = false;
  const total = {paths: 0, reads: 0, bytes: 0, elapsedMs: 0, executions: 0};
  const environmentSafe = e => !e.BASH_ENV && !e.ENV && !Object.keys(e).some(k => k.startsWith('BASH_FUNC_'));
  const eligible = () => !spent && active() && total.paths < commandHintLimits.paths && total.bytes < commandHintLimits.bytes;
  // Called only from the admitted native shell.env hook; no process is spawned.
  function before(args, shellInput, shellOutput) {
    if (!eligible()) return null;
    const request = commandHintRequest(args?.command);
    if (!request || (args.workdir !== undefined && typeof args.workdir !== 'string') || !shellOutput?.env ||
        path.resolve(directory, args.workdir ?? '.') !== shellInput?.cwd) return null;
    const started = performance.now();
    const effective = {...env, ...shellOutput.env};
    if (!environmentSafe(effective)) return null;
    const dirs = effective.PATH?.split(path.delimiter);
    if (!dirs?.length || dirs.length > commandHintLimits.pathEntries || dirs.some(d => !path.isAbsolute(d))) return null;
    const cost = total;
    try {
      const read = reader({directory, rules, active}, cost, started + commandHintLimits.milliseconds);
      for (const dir of new Set(dirs)) if (read.resolve(path.join(dir, request.manager), 0, false)) return null;
      if (!read.fresh()) return null;
      return {request, cwd: shellInput.cwd, args: JSON.stringify(args), read, effectivePath: effective.PATH, shellOutput};
    } catch { return null; }
    finally {
      total.elapsedMs += performance.now() - started;
    }
  }
  function after(event, pre) {
    if (!pre || !eligible() || event.tool !== 'bash' || event.state !== 'completed' || event.executionAdmitted !== true ||
        event.exit !== 127 || event.signal || event.timeout || event.permissionDenied || event.scopeViolation ||
        JSON.stringify(event.args) !== pre.args || JSON.stringify(event.admittedArgs) !== pre.args) return null;
    const expected = new RegExp('^/(?:usr/)?bin/bash: (?:line 1: )?' + pre.request.manager + ': command not found\\n?$');
    if (!expected.test(event.output ?? '')) return null;
    spent = true; // Reserve synchronously, before resolution; concurrent results cannot repeat it.
    const started = performance.now(), cost = total;
    let hint;
    try {
      if (!environmentSafe({...env, ...pre.shellOutput.env}) || (pre.shellOutput.env.PATH ?? env.PATH) !== pre.effectivePath || !pre.read.fresh(started + commandHintLimits.milliseconds)) return null;
      const read = reader({directory, rules, active}, cost, started + commandHintLimits.milliseconds);
      let packageDirectory = pre.cwd, pkg;
      if (packageDirectory !== directory && !packageDirectory.startsWith(directory + path.sep)) return null;
      for (let n = 0; n < commandHintLimits.layers; n++) {
        pkg = read.json(path.join(packageDirectory, 'package.json'));
        if (pkg || packageDirectory === directory) break;
        packageDirectory = path.dirname(packageDirectory);
      }
      const {manager, script, words} = pre.request;
      let reason = 'no applicable declared script', route, installed, scope = 'original-script';
      const declared = typeof pkg?.scripts?.[script] === 'string' && pkg.scripts[script].trim();
      if (declared) {
        reason = 'no installed executable found in permitted dependency layers';
        const layers = dependencyAncestors(pre.cwd, originalDirectory);
        if (layers.length > commandHintLimits.layers) throw Error('dependency layer limit');
        const findBinary = (name, requirement) => {
          for (const layer of layers) {
            const bin = read.resolve(path.join(layer, '.bin', name));
            const metadata = read.json(path.join(layer, name, 'package.json'));
            if (!bin && !metadata) continue;
            // A broken or mismatched nearer installation shadows ancestors.
            reason = 'nearest installation is incomplete or does not match declared packageManager';
            if (!bin?.stat.isFile() || !(bin.stat.mode & 0o111) || metadata?.name !== name || !/^\d+\.\d+\.\d+$/.test(metadata.version ?? '')) return null;
            if (requirement && requirement !== name + '@' + metadata.version) return null;
            const entry = typeof metadata.bin === 'string' ? metadata.bin : metadata.bin?.[name];
            if (typeof entry !== 'string' || path.isAbsolute(entry) || entry.split(/[\\/]/).includes('..')) return null;
            const target = read.resolve(path.join(layer, name, entry));
            if (!target || target.file !== bin.file) return null;
            return {name, version: metadata.version, versionBasis: 'package metadata, not --version', executable: path.join(layer, '.bin', name)};
          }
          return null;
        };
        installed = findBinary(manager, pkg.packageManager);
        if (installed) {
          route = [quoteShell(installed.executable), ...words.slice(1).map(quoteShell)].join(' ');
          reason = null;
          // A parent pnpm does not establish PATH for nested scripts. A narrowly
          // recognized declared lint prefix can offer one explicitly partial step.
          // Do not execute script text, substitute managers, or claim lifecycle equivalence.
          if (manager === 'pnpm' && !installed.executable.startsWith(path.join(pre.cwd, 'node_modules') + path.sep) &&
              packageDirectory === pre.cwd && words.length === (words[1] === 'run' ? 3 : 2) &&
              /^(?:pnpm (?:run )?lint|npm run lint)(?: && |$)/.test(declared) &&
              /^eslint \.(?: && |$)/.test(pkg.scripts.lint ?? '')) {
            const partial = findBinary('eslint');
            if (partial) {
              installed = partial; route = quoteShell(partial.executable) + " '.'"; scope = 'partial-lint';
              reason = 'Only the declared lint script eslint . prefix; skips lifecycle hooks and remaining commands. Does not restore the original script or test suite.';
            } else reason = null; // Retain only the verified manager path, with readiness unverified.
          }
        }
      }
      if (!read.fresh() || !pre.read.fresh() || !active()) return null;
      hint = {kind: 'project-command-hint', callID: event.callID, status: route ? 'path-found' : 'unavailable',
        missing: manager, cwd: pre.cwd, script: declared ? script : null, packageManager: pkg?.packageManager ?? null,
        ...(installed ? {installed} : {}), scope, routes: route ? [route] : [], reason,
        notice: 'Host-derived context only. Original command failed. Executable path/metadata were read; proposed command has not run. Suite readiness, check success and task correctness are unverified. Native permissions still apply.'};
    } catch (error) {
      if (!active()) return null;
      hint = {kind: 'project-command-hint', callID: event.callID, status: 'unavailable', missing: pre.request.manager,
        cwd: pre.cwd, routes: [], reason: ['path is not permitted for observation', 'symlink limit', 'metadata size or file kind unsupported', 'metadata changed', 'dependency layer limit', 'observation budget or task no longer active'].includes(error.message) ? error.message : 'allowed metadata unavailable or invalid',
        notice: 'No command was run or retried; no installation is suggested. Original failure remains.'};
    } finally {
      total.elapsedMs += performance.now() - started;
    }
    if (!hint || !active()) return null;
    hint.cost = {...total};
    const text = JSON.stringify(hint);
    if (Buffer.byteLength(text) > commandHintLimits.output) return null;
    try { save('command-hint.json', hint); } catch { return null; }
    return '\nHost-derived project command context:\n' + text;
  }
  return {before, after};
}
