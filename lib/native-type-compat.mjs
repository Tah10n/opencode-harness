// Opt-in direct workflow observation. No tool, repair gate or model stage.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {digest, readableProjectPath} from './native-project-scope.mjs';
export const typeCompatProfile = 'returned-callable-strict-v1';
export const typeCompatCompilerHash = '569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39';
export const typeCompatLimits = {runs: 2, runMs: 60000, totalMs: 120000, files: 128, inputBytes: 16 * 1024 * 1024, declarationBytes: 512 * 1024, outputBytes: 256 * 1024};
const fail = (status, reason) => {throw Object.assign(Error(reason), {status});};
const inside = (root, p) => p === root || p.startsWith(root + path.sep);
// Explicit root command forms only. Actual native execution, not test interpretation, is admission evidence.
export function typeCompatCommand(event, directory) {
  return event.tool === 'bash' && event.state === 'completed' && event.executionAdmitted === true &&
    Number.isInteger(event.exit) && !event.signal && !event.timeout &&
    JSON.stringify(event.args) === JSON.stringify(event.admittedArgs) &&
    path.resolve(directory, event.args?.workdir ?? '.') === directory &&
    /^(?:npm (?:test|run (?:test|test:types|typecheck|check|build))|(?:pnpm|yarn) (?:test|typecheck|check|build)|node --test(?: [\w./-]+)?)$/.test(event.args?.command ?? '');
}
export function captureTypeInputs({directory, rules, compiler, profile, entry}) {
  if (profile !== typeCompatProfile) fail('unsupported', `Explicit diagnostic profile required: ${typeCompatProfile}; project tsconfig options are not inherited`);
  if (!path.isAbsolute(compiler ?? '')) fail('NOT RUN', 'Explicit absolute HARNESS_TASK_TYPE_COMPAT_COMPILER (lib/typescript.js) required');
  directory = fs.realpathSync(directory);
  let bytes = 0, reads = 0;
  const read = (file, cap = typeCompatLimits.declarationBytes, root = directory) => {
    if (!inside(root, file) || !readableProjectPath(directory, file, rules)) fail('unsupported', 'Read not permitted: ' + file);
    let actual;
    try { actual = fs.realpathSync(file); } catch (e) { fail('preparation-error', `Missing input ${file}: ${e.code}`); }
    if (actual !== file || !inside(root, actual) || !readableProjectPath(directory, actual, rules)) fail('unsupported', 'Symlink/realpath layout unsupported: ' + file);
    const stat = fs.statSync(actual);
    if (!stat.isFile() || stat.size > cap || bytes + stat.size > typeCompatLimits.inputBytes || ++reads > typeCompatLimits.files)
      fail('unsupported', 'Input size/file bound');
    const value = fs.readFileSync(actual, 'utf8'); bytes += Buffer.byteLength(value);
    return value;
  };
  // Do not follow a compiler link into project-supplied JavaScript.
  const compilerRoot = path.dirname(compiler);
  const code = read(compiler, 10 * 1024 * 1024, compilerRoot);
  if (digest(code) !== typeCompatCompilerHash) fail('unsupported', 'Compiler bytes are not the supported TypeScript 6.0.3 build');
  const libraries = new Map();
  const library = name => {
    if (libraries.has(name)) return;
    if (!/^lib\.[a-z0-9.]+\.d\.ts$/.test(name)) fail('unsupported', 'Unsupported standard library name');
    const text = read(path.join(compilerRoot, name), 3 * 1024 * 1024, compilerRoot); libraries.set(name, text);
    for (const m of text.matchAll(/<reference\s+lib=["']([^"']+)["']/g)) library('lib.' + m[1] + '.d.ts');
  };
  library('lib.es2020.full.d.ts');
  const environment = new Map();
  const metadata = name => {const text = read(path.join(directory, name)); environment.set(name, text); return text;};
  let pkg;
  try { pkg = JSON.parse(metadata('package.json')); } catch (e) { if (e.status) throw e; fail('preparation-error', 'Invalid package.json'); }
  let exportTypes;
  if (pkg.typesVersions) fail('unsupported', 'typesVersions resolution unsupported');
  if (pkg.exports && typeof pkg.exports !== 'string') {
    const exports = pkg.exports;
    const root = exports['.'];
    if (!root || typeof root !== 'object' || Array.isArray(root) ||
      Object.keys(exports).some(k => k !== '.' && !(k === './package.json' && exports[k] === './package.json')) ||
      Object.entries(root).some(([k, v]) => !['types', 'import', 'require', 'default'].includes(k) || typeof v !== 'string' || (k !== 'types' && /\.d\.[cm]?ts$/.test(v))) ||
      typeof root.types !== 'string')
      fail('unsupported', 'Conditional/multiple exports unsupported; not selecting an entry');
    exportTypes = root.types;
  }
  if (pkg.types && pkg.typings && pkg.types !== pkg.typings) fail('unsupported', 'Conflicting types/typings');
  const selected = entry ?? pkg.types ?? pkg.typings ?? exportTypes;
  if (typeof selected !== 'string' || !selected.endsWith('.d.ts')) fail('unsupported', 'One explicit public .d.ts entry (types/typings or user path) required');
  if (exportTypes && path.resolve(directory, exportTypes) !== path.resolve(directory, selected)) fail('unsupported', 'exports/types entry conflict');
  const entryPath = path.resolve(directory, selected);
  if (!inside(directory, entryPath)) fail('unsupported', 'Public entry must be inside task project');
  const entryName = path.relative(directory, entryPath).split(path.sep).join('/');
  // Config is recorded as an environmental guard, never used as hidden historical compiler flags.
  for (const name of ['tsconfig.json', 'jsconfig.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'npm-shrinkwrap.json']) {
    const file = path.join(directory, name);
    if (!readableProjectPath(directory, file, rules)) fail('unsupported', 'Configuration path not permitted: ' + name);
    if (!fs.existsSync(file)) {environment.set(name, null); continue;}
    const text = metadata(name);
    if (name.endsWith('config.json') && /["'](?:extends|plugins|references)["']\s*:/.test(text))
      fail('unsupported', 'Config extends/plugins/references unsupported; no linked input read');
  }
  const files = new Map();
  const declaration = file => {
    const name = path.relative(directory, file).split(path.sep).join('/');
    if (name.split('/').includes('node_modules')) fail('unsupported', 'Dependency declarations require separately supported resolution');
    if (files.has(name)) return;
    if (!file.endsWith('.d.ts')) fail('unsupported', 'Only existing .d.ts declaration graph supported');
    const text = read(file); files.set(name, text);
    if (/<reference\s+(?:types|lib)\s*=/.test(text)) fail('unsupported', 'Project type/lib references unsupported in diagnostic profile');
    // This is bounded discovery, not a shell/TypeScript parser. The compiler independently verifies all resolution in the closed map.
    const imports = [...text.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*(?:\(\s*)?["']([^"']+)["']|<reference\s+path=["']([^"']+)["']/g)];
    for (const m of imports) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (!spec.startsWith('./') && !spec.startsWith('../')) fail('unsupported', 'External declaration dependency unsupported: ' + spec);
      const resolved = path.resolve(path.dirname(file), spec);
      if (!inside(directory, resolved)) fail('unsupported', 'Declaration import escapes project');
      const targets = m[3] || resolved.endsWith('.d.ts') ? [resolved] : resolved.endsWith('.js') ? [resolved.slice(0, -3) + '.d.ts'] : [resolved + '.d.ts', path.join(resolved, 'index.d.ts')];
      for (const target of targets) if (!readableProjectPath(directory, target, rules)) fail('unsupported', 'Declaration import not permitted');
      const existing = targets.filter(p => fs.existsSync(p));
      if (existing.length !== 1) fail('preparation-error', 'Missing or ambiguous declaration import: ' + spec);
      declaration(existing[0]);
    }
  };
  declaration(entryPath);
  const sorted = map => [...map].sort(([a], [b]) => a.localeCompare(b));
  return {entry: entryName, specifier: './' + entryName.slice(0, -5), compiler: code, libraries: sorted(libraries), files: sorted(files),
    environmentHash: digest(JSON.stringify([compiler, digest(code), sorted(libraries), sorted(environment), profile, entryName])),
    surfaceHash: digest(JSON.stringify(sorted(files))), cost: {inputBytes: bytes, files: reads}};
}
export async function runTypeComparison(input, {signal, budgetMs = 60000, node = process.execPath} = {}) {
  const started = Date.now();
  if (signal?.aborted || !Number.isFinite(budgetMs) || budgetMs <= 0) return {status: 'NOT RUN', reason: signal?.aborted ? 'cancelled' : 'diagnostic budget exhausted', cost: {elapsedMs: 0, compilations: 0}, process: {terminationVerified: true, started: false}};
  const payload = JSON.stringify(input);
  const worker = fileURLToPath(new URL('./native-type-compat-worker.mjs', import.meta.url));
  const generator = fileURLToPath(new URL('./native-type-compat-generator.mjs', import.meta.url));
  let reason, output = '', stderr = '', child;
  const finish = await new Promise(resolve => {
    child = spawn(node, ['--permission', '--allow-fs-read=' + worker, '--allow-fs-read=' + generator,
      '--max-old-space-size=768', worker], {env: {}, stdio: ['pipe', 'pipe', 'pipe']});
    const stop = why => { reason ??= why; child.kill('SIGKILL'); };
    const cancel = () => stop('cancelled');
    signal?.addEventListener('abort', cancel, {once: true});
    const timer = setTimeout(() => stop('timeout'), Math.max(1, Math.min(budgetMs, typeCompatLimits.runMs) - (Date.now() - started)));
    child.stdout.on('data', data => {output += data; if (Buffer.byteLength(output) > typeCompatLimits.outputBytes) {output = ''; stop('output bound');}});
    child.stderr.on('data', data => {stderr = (stderr + data).slice(-3000);});
    child.stdin.on('error', () => {});
    let error;
    child.once('error', e => {error = e.message;});
    child.once('close', (exit, killedBy) => {
      clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      resolve({exit, signal: killedBy, error, terminationVerified: true});
    });
    if (signal?.aborted) cancel();
    child.stdin.end(payload);
  });
  const cost = {elapsedMs: Date.now() - started, transferredInputBytes: Buffer.byteLength(payload), outputBytes: Buffer.byteLength(output), compilations: 0};
  if (reason || finish.error || finish.exit !== 0) return {status: 'NOT RUN', reason: reason ?? finish.error ?? 'compiler crash/nonzero exit', process: finish, cost, stderr};
  try {
    const report = JSON.parse(output);
    return {...report, process: finish, cost: {...cost, compilations: report.compilations.length}};
  } catch {return {status: 'preparation-error', reason: 'Invalid worker response', process: finish, cost};}
}
export function formatTypeComparison(row) {
  const examples = [], seen = new Set();
  for (const consumer of row.consumers ?? []) {
    if (consumer.status !== 'reproduced-incompatibility') continue;
    const key = JSON.stringify(consumer.candidate.map(d => [d.code, d.message]));
    if (seen.has(key) || examples.length >= 3) continue;
    seen.add(key); examples.push(`Consumer (${consumer.sha256}):\n${consumer.text}Baseline: pass. Candidate: ${JSON.stringify(consumer.candidate)}`);
  }
  return '\n\nType compatibility observation (separate from project command):\n' +
    `Public entry: ${row.entry ?? 'unresolved'}. Result: ${row.status}${row.reason ? '; ' + row.reason : ''}.\n` +
    `Compiler: TypeScript 6.0.3; explicit profile ${typeCompatProfile}. Baseline ${row.baselineSnapshot}; candidate ${row.snapshot}.\n` + examples.join('\n') +
    (examples.length ? '\nЭтот старый вызов перестал компилироваться при указанных условиях. Проверь, разрешено ли такое изменение исходным заданием.\n' : '\n') +
    `${row.skipped?.length ?? 0} unsupported/skipped paths; ${row.consumers?.length ?? 0} generated consumers (examples are not independent defects).\n` +
    'Scope: bounded class/generic specimens and returned callables only; not full API compatibility or a runtime test. New API types, runtime and task requirements need their own checks. No repair or workflow success is mandated. Full evidence in type-compat.json.\n';
}
export function createTypeCompatibility({directory, rules, save, signal, active, remainingMs, snapshot, capture,
  compiler = process.env.HARNESS_TASK_TYPE_COMPAT_COMPILER, profile = process.env.HARNESS_TASK_TYPE_COMPAT_PROFILE,
  entry = process.env.HARNESS_TASK_TYPE_COMPAT_ENTRY,
  node = process.env.HARNESS_TASK_TYPE_COMPAT_NODE ?? (process.versions.bun ? undefined : process.execPath)}) {
  const spec = {directory, rules, compiler, profile, entry};
  const report = {enabled: true, baselineSnapshot: snapshot, runs: [], status: 'NOT RUN', reason: 'No eligible command after declaration change', spentMs: 0, captureCost: {readBytes: 0, files: 0, captures: 0}};
  let baseline, lastSurface, busy;
  const preparingBaseline = Date.now();
  const record = () => save('type-compat.json', report);
  const captureInputs = () => {
    if (!path.isAbsolute(node ?? '') || !readableProjectPath(directory, node, rules)) fail('NOT RUN', 'Explicit permitted Node 24 executable required (HARNESS_TASK_TYPE_COMPAT_NODE)');
    const actual = fs.realpathSync(node);
    if (!readableProjectPath(directory, actual, rules) || inside(directory, actual)) fail('unsupported', 'Node executable must be a permitted external toolchain');
    const stat = fs.statSync(actual);
    const inputs = captureTypeInputs(spec);
    report.captureCost.readBytes += inputs.cost.inputBytes; report.captureCost.files += inputs.cost.files; report.captureCost.captures++;
    inputs.environmentHash = digest(JSON.stringify([inputs.environmentHash, actual, stat.size, stat.mtimeMs, stat.ino]));
    return inputs;
  };
  try {
    active(); const first = captureInputs(), second = captureInputs();
    if (first.environmentHash !== second.environmentHash || first.surfaceHash !== second.surfaceHash || capture() !== snapshot)
      fail('preparation-error', 'Initial snapshot changed during preparation');
    baseline = first; lastSurface = first.surfaceHash;
    report.entry = first.entry; report.compilerSha256 = typeCompatCompilerHash; report.profile = profile;
    report.baselineSurface = first.surfaceHash;
  } catch (e) {report.status = e.status ?? 'NOT RUN'; report.reason = e.message;}
  report.baselinePreparationMs = Date.now() - preparingBaseline;
  report.baselineInputBytes = baseline?.cost.inputBytes ?? 0;
  record();
  const seen = new Set();
  const after = async event => {
    if (!baseline || report.runs.length >= 2 || !typeCompatCommand(event, directory) || seen.has(event.callID)) return '';
    if (report.runs.some(r => r.snapshot === event.after)) return '';
    seen.add(event.callID);
    try {active();} catch {report.reason = 'Cancelled/denied/finished before eligible analysis'; record(); return '';}
    const started = Date.now(), readBefore = {...report.captureCost};
    let candidate, row;
    try {
      candidate = captureInputs();
      if (candidate.environmentHash !== baseline.environmentHash) fail('unsupported', 'Compiler, config, package/dependency conditions or entry changed; comparison stopped');
      if (candidate.surfaceHash === lastSurface) return '';
      const confirmed = captureInputs();
      if (candidate.surfaceHash !== confirmed.surfaceHash || candidate.environmentHash !== confirmed.environmentHash || capture() !== event.after)
        fail('preparation-error', 'Snapshot changed during diagnostic preparation');
      lastSurface = candidate.surfaceHash;
      active();
      const preparing = Date.now() - started;
      row = await runTypeComparison({compiler: baseline.compiler, libraries: baseline.libraries,
        specifier: baseline.specifier, baseline: baseline.files, candidate: candidate.files},
      {signal, node, budgetMs: Math.min(60000 - preparing, 120000 - report.spentMs - preparing, remainingMs())});
      row.cost = {...row.cost, ...candidate.cost, preparationMs: preparing, totalMs: Date.now() - started};
      active();
      const final = captureInputs();
      if (final.surfaceHash !== candidate.surfaceHash || final.environmentHash !== candidate.environmentHash || capture() !== event.after)
        row = {...row, status: 'NOT RUN', reason: 'Snapshot/environment changed during analysis; result not delivered', deliverable: false};
    } catch (e) {row = {...row, status: e.status ?? 'NOT RUN', reason: e.message, cost: {...(row?.cost ?? {compilations: 0}), totalMs: Date.now() - started}};}
    if (Date.now() - started >= 60000 || report.spentMs + Date.now() - started >= 120000) {row.status = 'NOT RUN'; row.reason = 'Diagnostic time budget exhausted';}
    row.cost = {...row.cost, readBytes: report.captureCost.readBytes - readBefore.readBytes, fileReads: report.captureCost.files - readBefore.files, totalMs: Date.now() - started};
    Object.assign(row, {entry: baseline.entry, baselineSnapshot: snapshot, snapshot: event.after, surfaceHash: candidate?.surfaceHash, callID: event.callID});
    try {active();} catch {row.status = 'NOT RUN'; row.reason = 'Cancelled/denied/finished before delivery'; row.deliverable = false;}
    report.runs.push(row); report.spentMs += Date.now() - started; report.status = row.status; report.reason = row.reason;
    record();
    if (row.deliverable === false) return '';
    active(); return formatTypeComparison(row);
  };
  return {
    after(event) {busy = after(event); return busy;},
    delivered(callID) {
      active(); const row = report.runs.find(r => r.callID === callID);
      if (row && row.deliverable !== false) {row.delivered = true; record();}
    },
    async settle() {await busy;},
    finish(terminalSnapshot) {
      const latest = report.runs.at(-1);
      report.current = false;
      if (latest) {
        try {const now = captureInputs(); report.current = latest.surfaceHash === now.surfaceHash && now.environmentHash === baseline.environmentHash && latest.snapshot === terminalSnapshot;}
        catch (e) {report.finalLimitation = e.message;}
        if (!report.current) report.finalLimitation ??= 'Observation belongs to an older snapshot; no late or third run';
      }
      record();
      return {...report, runs: report.runs.map(({consumers, compilations, ...row}) => ({...row, consumerCount: consumers?.length ?? 0}))};
    },
  };
}
