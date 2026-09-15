// Invoked by the task-owned native tool adapter. No provider, evaluator, host relay or model API.
// Bounded adapter around StrykerJS's exported Instrumenter and Mutant API.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {sensitivityPlan, sensitivityLimits} from './native-sensitivity.mjs';
import {digest, testPath} from './native-project-scope.mjs';

const self = fileURLToPath(import.meta.url);
const excerpt = s => s.length <= 1200 ? s : s.slice(0, 300) + '\n[truncated]\n' + s.slice(-900);
const inside = (root, file) => file === root || file.startsWith(root + path.sep);
const log = {debug() {}, info() {}, warn() {}, error() {}, trace() {}, fatal() {}, isDebugEnabled: () => false};

async function generate(inputFile, outputFile) {
  const require = createRequire(new URL('./sensitivity/package.json', import.meta.url));
  const version = require('@stryker-mutator/instrumenter/package.json').version;
  if (version !== '10.0.0') throw Error('Expected StrykerJS instrumenter 10.0.0');
  const {Instrumenter} = await import(pathToFileURL(require.resolve('@stryker-mutator/instrumenter')).href);
  const plan = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const inputs = plan.ranges.map(([name, ranges]) => ({name: path.resolve(name), content: fs.readFileSync(name, 'utf8'),
    mutate: ranges.map(r => ({start: {line: r.start - 1, column: 0}, end: {line: r.end - 1, column: fs.readFileSync(name, 'utf8').split('\n')[r.end - 1].length}}))}));
  const result = await new Instrumenter(log).instrument(inputs, {plugins: null, excludedMutations: [], ignorers: []});
  // Instrumenter API locations are zero based (unlike rendered report lines).
  const candidates = result.mutants.filter(m => !m.status).map(m => ({...m, fileName: path.relative(process.cwd(), m.fileName), location: {
    start: {...m.location.start, line: m.location.start.line + 1}, end: {...m.location.end, line: m.location.end.line + 1},
  }})).filter(m =>
    plan.ranges.find(([name]) => name === m.fileName)?.[1].some(r => m.location.start.line >= r.start && m.location.end.line <= r.end));
  // Deterministic code order, no task names, answers, custom operators or reranking.
  candidates.sort((a, b) => a.fileName.localeCompare(b.fileName) || a.location.start.line - b.location.start.line || a.location.start.column - b.location.start.column || Number(a.id) - Number(b.id));
  fs.writeFileSync(outputFile, JSON.stringify({engine: 'StrykerJS instrumenter ' + version, candidates: candidates.slice(0, sensitivityLimits.variants), totalGenerated: candidates.length, ignored: result.mutants.length - candidates.length}));
}

// Host-owned independent copies; preserve each resolution level and file mode.
export async function copySensitivityDependencies(plan, layout, {directory, rules, active = () => {}}) {
  let dependencies, dependencyDestination, depFacts = [], count = 0, bytes = 0;
  const readable = file => {
      const name = path.join('node_modules', path.relative(dependencies, file));
      for (const value of [name, file]) {
        let action = 'ask';
        for (const rule of rules) if (['read', '*'].includes(rule.permission)) {
          const pattern = '^' + rule.pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
          if (new RegExp(pattern).test(value)) action = rule.action;
        }
        if (action !== 'allow') throw Error('Dependency path requires read permission');
      }
    };
    const copyDeps = async (src, dest) => {
      active(); readable(src); const stat = await fsp.lstat(src);
      if (++count > 80000 || (bytes += stat.isFile() ? stat.size : 0) > 300 * 1024 * 1024) throw Error('Dependency copy exceeds first-version bounds');
      if (stat.isSymbolicLink()) {
        const target = await fsp.realpath(src);
        if (!inside(dependencies, target)) throw Error('External dependency symlink is unsupported');
        readable(target);
        await fsp.symlink(path.relative(path.dirname(dest), path.join(dependencyDestination, path.relative(dependencies, target))), dest);
      } else if (stat.isDirectory()) {
        await fsp.mkdir(dest, {recursive: true});
        for (const name of await fsp.readdir(src)) await copyDeps(path.join(src, name), path.join(dest, name));
      } else if (stat.isFile()) {
        await fsp.copyFile(src, dest, fs.constants.COPYFILE_FICLONE);
        await fsp.chmod(dest, stat.mode & 0o777);
        depFacts.push({name: path.relative(directory, src), size: stat.size, mtimeMs: stat.mtimeMs});
      } else throw Error('Unsupported dependency file kind');
    };
  for (dependencies of plan.dependencyLayers) {
    active(); readable(dependencies);
    let stat;
    try { stat = await fsp.lstat(dependencies); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!stat.isDirectory()) throw Error('Dependency root links and non-directory layouts are unsupported');
    dependencyDestination = path.join(layout, path.relative(plan.dependencyRoot, dependencies));
    await copyDeps(dependencies, dependencyDestination);
  }
  return {depFacts, bytes};
}

export async function runSensitivity(spec, {directory = process.cwd(), signal} = {}) {
  directory = fs.realpathSync(directory);
  const started = Date.now(), deadline = started + Math.min(spec.budgetMs, sensitivityLimits.taskMs);
  let cancelled = false, temp, currentChild, currentGroup, childUnverified = false;
  const report = {kind: 'sensitivity', status: 'not-run', engineExecuted: false, snapshot: spec.snapshot, baseline: null, variants: [], untested: [],
    cost: {commands: 0, engineMs: 0, preparationMs: 0, commandMs: 0}, limits: []};
  const active = () => { if (cancelled || Date.now() >= deadline) throw Error(cancelled ? 'cancelled' : 'diagnostic deadline'); };
  const killGroup = signal => { if (currentGroup) { try { process.kill(-currentGroup, signal); } catch (e) { if (e.code !== 'ESRCH') childUnverified = true; } } };
  const cancel = () => { cancelled = true; killGroup('SIGTERM'); };
  signal?.addEventListener('abort', cancel, {once: true});
  if (signal?.aborted) cancel();
  const execute = async (command, args, cwd, capMs) => {
    active(); const commandStart = Date.now();
    let output = '', overflow = false, timer, hardTimer, timedOut = false, stopping = false;
    const result = await new Promise(resolve => {
      const child = spawn(command, args, {cwd, env: {...process.env, npm_config_offline: 'true', npm_config_update_notifier: 'false'}, detached: true, stdio: ['ignore', 'pipe', 'pipe']});
      currentChild = child; currentGroup = child.pid;
      const append = data => { output += data.toString(); if (output.length > 24000) { output = output.slice(-24000); overflow = true; } };
      child.stdout.on('data', append); child.stderr.on('data', append);
      const stop = () => { if (stopping) return; stopping = true; timedOut = !cancelled; killGroup('SIGTERM'); hardTimer = setTimeout(() => killGroup('SIGKILL'), 150); };
      timer = setTimeout(stop, Math.max(1, Math.min(capMs, deadline - Date.now() - 400)));
      // Signal handling is cooperative only for the adapter; test descendants are killed.
      const poll = setInterval(() => { if (cancelled) stop(); }, 100);
      child.once('error', error => resolve({exit: null, error: error.message, status: 'environment-error'}));
      child.once('close', (exit, signal) => { clearInterval(poll); resolve({exit, signal, status: cancelled ? 'cancelled' : timedOut ? 'timeout' : exit === 0 ? 'passed' : 'command-rejected'}); });
    });
    clearTimeout(timer); clearTimeout(hardTimer);
    // A completed shell can leave background children. Kill its remaining group
    // before any next variant or delivery; never call that a successful test.
    if (currentGroup) {
      try {
        process.kill(-currentGroup, 0); killGroup('SIGKILL');
        if (!timedOut && !cancelled) { result.status = 'environment-error'; result.error = 'Command left background processes'; }
        for (let n = 0; n < 20; n++) {
          await new Promise(resolve => setTimeout(resolve, 20));
          try { process.kill(-currentGroup, 0); } catch (e) { if (e.code === 'ESRCH') break; throw e; }
          if (n === 19) childUnverified = true;
        }
      }
      catch (e) { if (e.code !== 'ESRCH') childUnverified = true; }
    }
    currentChild = null; currentGroup = null;
    if (childUnverified) { cancelled = true; result.status = 'environment-error'; result.error = 'Diagnostic child termination unverified'; }
    return {...result, elapsedMs: Date.now() - commandStart, output: excerpt((overflow ? '[earlier output omitted]\n' : '') + output)};
  };
  try {
    if (process.platform === 'win32' || !Number.isFinite(spec.budgetMs) || spec.budgetMs < 1000) throw Error('Unsupported environment or exhausted diagnostic budget');
    active();
    const plan = sensitivityPlan({directory, rules: spec.rules, args: spec.args, base: spec.base, selectedMutation: spec.selectedMutation});
    report.command = plan.command; report.argv = plan.argv;
    report.tests = plan.files.filter(([name]) => testPath(name)).map(([name, text]) => ({name, sha256: digest(text)}));
    report.selectedVariant = spec.selectedMutation?.ref ?? null; report.ranges = plan.ranges; report.limits = plan.limits;
    if (plan.snapshot !== spec.snapshot) throw Error('Author snapshot changed before diagnostic capture');
    temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'harness-sense-'));
    const snapshot = path.join(temp, 'snapshot'); await fsp.mkdir(snapshot);
    for (const [name, text] of plan.files) {
      active(); const dest = path.join(snapshot, name);
      await fsp.mkdir(path.dirname(dest), {recursive: true});
      await fsp.writeFile(dest, text, {mode: fs.statSync(path.join(directory, name)).mode & 0o777});
    }
    let depFacts = [], firstDependencies;
    const unchanged = () => {
      if (sensitivityPlan({directory, rules: spec.rules, args: spec.args, base: spec.base, selectedMutation: spec.selectedMutation}).snapshot !== spec.snapshot) return false;
      return depFacts.every(f => { const st = fs.statSync(path.join(directory, f.name)); return st.size === f.size && st.mtimeMs === f.mtimeMs; });
    };
    if (!unchanged()) throw Error('Snapshot changed while copying');
    report.cost.preparationMs = Date.now() - started;
    const runTest = async variant => {
      active(); const layout = path.join(temp, 'test');
      const copy = path.join(layout, path.relative(plan.dependencyRoot, directory));
      await fsp.rm(layout, {recursive: true, force: true});
      await fsp.cp(snapshot, copy, {recursive: true, dereference: false, verbatimSymlinks: true, mode: fs.constants.COPYFILE_FICLONE, filter: () => { active(); return true; }});
      // Only one writable dependency copy at a time. Recopy for every command
      // so test-side caches or writes cannot contaminate a later variant.
      const preparing = Date.now();
      const copied = await copySensitivityDependencies(plan, layout, {directory, rules: spec.rules, active});
      depFacts = copied.depFacts;
      const metadataSha256 = digest(JSON.stringify(depFacts));
      if (firstDependencies && firstDependencies !== metadataSha256) throw Error('Author dependencies changed between variants');
      firstDependencies ??= metadataSha256;
      report.dependencies = {layers: plan.dependencyLayers, files: depFacts.length, bytes: copied.bytes, metadataSha256};
      report.cost.preparationMs += Date.now() - preparing;
      if (!unchanged()) throw Error('Author snapshot changed before command');
      if (variant) {
        const source = plan.files.find(([n]) => n === variant.fileName)?.[1];
        if (source === undefined) throw Error('Engine returned an out-of-scope file');
        const offset = loc => source.split('\n').slice(0, loc.line - 1).reduce((n, s) => n + s.length + 1, 0) + loc.column;
        const a = offset(variant.location.start), b = offset(variant.location.end);
        if (a < 0 || b < a || b > source.length) throw Error('Engine returned an invalid location');
        variant.sourceSha256 = digest(source); variant.original = source.slice(a, b);
        if (spec.selectedMutation && (variant.original !== spec.selectedMutation.original || variant.sourceSha256 !== spec.selectedMutation.sourceSha256)) throw Error('Selected production fragment changed; run a fresh diagnostic');
        variant.diff = `--- a/${variant.fileName}\n+++ b/${variant.fileName}\n@@ ${variant.location.start.line}:${variant.location.start.column} @@\n-` + source.slice(a, b).replaceAll('\n', '\n-') + '\n+' + variant.replacement.replaceAll('\n', '\n+');
        await fsp.writeFile(path.join(copy, variant.fileName), source.slice(0, a) + variant.replacement + source.slice(b));
      }
      const result = await execute(plan.argv[0], plan.argv.slice(1), copy, 30000);
      report.cost.commands++; report.cost.commandMs += result.elapsedMs;
      return result;
    };
    report.baseline = await runTest();
    if (report.baseline.status !== 'passed') { report.status = 'baseline-not-passed'; return report; }
    active();
    let engine;
    if (spec.selectedMutation) {
      engine = {engine: 'StrykerJS instrumenter 10.0.0 (previously generated definition)', candidates: [spec.selectedMutation], totalGenerated: 1, ignored: 0};
    } else {
      const input = path.join(temp, 'engine-input.json'), output = path.join(temp, 'engine-output.json');
      await fsp.writeFile(input, JSON.stringify({ranges: plan.ranges}));
      report.engineExecuted = true;
      const generated = await execute('node', [self, '--generate', input, output], snapshot, 15000);
      report.cost.engineMs = generated.elapsedMs;
      if (generated.status !== 'passed') { report.status = 'engine-unavailable'; report.engineResult = generated; return report; }
      engine = JSON.parse(await fsp.readFile(output, 'utf8'));
    }
    report.engine = engine.engine; report.totalGenerated = engine.totalGenerated; report.ignored = engine.ignored;
    report.notSelected = engine.totalGenerated - engine.candidates.length;
    report.status = engine.candidates.length ? 'observed' : 'unsupported-scope';
    report.untested = engine.candidates.map(({fileName, location, mutatorName}) => ({fileName, location, mutatorName, reason: 'not reached'}));
    for (const candidate of engine.candidates) {
      if (cancelled || Date.now() + 1000 >= deadline) {
        report.status = 'partial'; for (const item of report.untested) item.reason = 'budget or cancellation'; break;
      }
      const variant = {...candidate};
      const result = await runTest(variant);
      report.untested.shift();
      report.variants.push({...variant, ...result, output: result.output, interpretation: result.status === 'command-rejected' ? 'Variant rejected by command; cause requires inspection (assertion, import, compilation and other failures are not distinguished).' : result.status === 'passed' ? 'Tests still pass. Check required observable behavior; this can be equivalent or allowed.' : 'No test-sensitivity conclusion.'});
    }
    report.stale = !unchanged();
  } catch (error) {
    report.status = report.baseline ? 'partial' : 'not-run'; report.limits.push(error.message);
  } finally {
    if (currentChild) { killGroup('SIGKILL'); childUnverified = true; }
    report.terminationVerified = !childUnverified;
    if (temp && !childUnverified) await fsp.rm(temp, {recursive: true, force: true});
    else if (temp) report.limits.push('Diagnostic process termination uncertain; copy retained for inspection');
    report.cost.totalMs = Date.now() - started;
    signal?.removeEventListener('abort', cancel);
  }
  return report;
}
// Embedded OpenCode/Bun has a virtual argv[1], not a filesystem entry.
let entry;
try { if (process.argv[1]) entry = fs.realpathSync(process.argv[1]); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (entry === self) {
  if (process.argv[2] === '--generate') await generate(process.argv[3], process.argv[4]);
  else {
    console.log(JSON.stringify({status: 'not-run', engineExecuted: false, cost: {commands: 0}, limitation: 'Use the harness_sense native tool; standalone diagnostic execution has no task budget and is not supported.'}));
    process.exitCode = 1;
  }
}
