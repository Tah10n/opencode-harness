// Offline development runner. Never imports or runs the checked packages.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { generate } from './generate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
if (!args.includes('--compiler') || !args.includes('--source')) {
  console.error('Usage: node check.mjs --compiler /absolute/typescript/bin/tsc --source /local/eventemitter3-git [--output /result-directory]');
  process.exit(1);
}
const compiler = path.resolve(option('--compiler'));
const sourceRepo = path.resolve(option('--source'));
const output = path.resolve(args.includes('--output') ? option('--output') : path.join(here, 'results'));
fs.mkdirSync(output, { recursive: true });
const history = 'f2b586e731656eda2b399e6a11dc3709582d4a3f';
const baselineCommit = 'b0144e940ace8add8f335a8adfbed9284eb419f3';
const historical = 'development/native-command-hints-comparison';
const flags = ['--ignoreConfig', '--noEmit', '--strict', '--target', 'es2020', '--module', 'commonjs', '--moduleResolution', 'node', '--ignoreDeprecations', '6.0'];
const start = performance.now();
// A parent watchdog bounds even a synchronous Compiler API call. It owns cleanup.
const work = args.includes('--worker-dir') ? option('--worker-dir') : fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'native-type-compatibility-')));
if (args.includes('--worker-dir')) {
  assert.equal(path.dirname(work), fs.realpathSync(os.tmpdir()), 'worker must use the parent temporary directory');
  assert.ok(path.basename(work).startsWith('native-type-compatibility-'));
  assert.equal(fs.readFileSync(path.join(work, '.owner'), 'utf8'), String(process.ppid), 'worker directory ownership');
}
if (!args.includes('--worker-dir')) {
  fs.writeFileSync(path.join(work, '.owner'), String(process.pid));
  try {
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args, '--worker-dir', work], { encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 });
    process.stdout.write(run.stdout || ''); process.stderr.write(run.stderr || '');
    if (run.error) {
      writeFailure({ status: 'NOT RUN / runner timeout or launch error', error: run.error.message, timeLimitMs: 120000 });
    }
    process.exitCode = run.error ? 1 : run.status ?? 1;
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
  process.exit(process.exitCode);
}
function writeFailure(value) { fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(value, null, 2) + '\n'); }
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const write = (p, text) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const normalize = text => String(text).split(work).join('$WORK');
const report = { runnerSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))), generatorSha256: hash(fs.readFileSync(path.join(here, 'generate.mjs'))), timeLimitMs: 120000, history, baselineCommit, node: process.version, nodePath: process.execPath, compiler, flags, configuration: {}, preparation: {}, compilations: [], matrices: [], realProviderCalls: 0, newAuthorSessions: 0 };
let ts;
function command(bin, argv, cwd = here, input) {
  const r = spawnSync(bin, argv, { cwd, input, encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw Error(`${bin} ${argv.join(' ')}: ${r.error || r.stderr || r.stdout}`);
  return r.stdout;
}
const historic = name => command('git', ['show', `${history}:${historical}/${name}`]);
function cli(dir, text, label) {
  write(path.join(dir, 'consumer.ts'), text);
  const at = performance.now();
  const r = spawnSync(process.execPath, [compiler, ...flags, 'consumer.ts'], { cwd: dir, encoding: 'utf8', timeout: 15000 });
  const row = { label, kind: 'tsc --noEmit', cwd: normalize(dir), command: [process.execPath, compiler, ...flags, 'consumer.ts'], consumerSha256: hash(text), status: r.status, elapsedMs: performance.now() - at, diagnostics: normalize((r.stdout || '') + (r.stderr || '')), error: r.error?.message || null };
  report.compilations.push(row);
  return row;
}
function analyze(dir, text, label) {
  const file = path.join(dir, 'probe.ts');
  write(file, text);
  const at = performance.now();
  const program = ts.createProgram([file], options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const format = d => {
    const loc = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : null;
    return { code: d.code, file: d.file ? normalize(d.file.fileName) : null, line: loc ? loc.line + 1 : null, column: loc ? loc.character + 1 : null, message: ts.flattenDiagnosticMessageText(d.messageText, '\n') };
  };
  const row = { label, kind: 'TypeScript Program/getPreEmitDiagnostics', cwd: normalize(dir), consumerSha256: hash(text), status: diagnostics.length ? 2 : 0, elapsedMs: performance.now() - at, diagnostics: diagnostics.map(format) };
  report.compilations.push(row);
  if (!report.configuration.loadedFiles) {
    report.configuration.loadedFiles = program.getSourceFiles().map(f => normalize(f.fileName));
    report.configuration.resolvedImport = normalize(ts.resolveModuleName('./index', file, options, ts.sys).resolvedModule.resolvedFileName);
  }
  return { checker: program.getTypeChecker(), source: program.getSourceFile(file), diagnostics: row.diagnostics, rawDiagnostics: diagnostics, row };
}
let options;
function declarationCopy(name, bytes) {
  const dir = path.join(work, name); write(path.join(dir, 'index.d.ts'), bytes); return dir;
}
function verdict(oldRow, newRow) {
  const setup = row => row.error || (typeof row.diagnostics === 'string' ? /TS(2307|2688|6053|2318)|MODULE_NOT_FOUND/.test(row.diagnostics) : row.diagnostics.some(d => [2307, 2688, 6053, 2318].includes(d.code)));
  if (setup(oldRow) || setup(newRow)) return 'preparation-error';
  if (oldRow.status !== 0) return 'unsupported-baseline-consumer';
  if (newRow.status !== 0) return 'reproduced-incompatibility';
  return 'no-difference-in-checked-scope';
}
function controls(baseline, candidates, label) {
  const generated = generate(ts, (text, phase) => analyze(baseline, text, `${label}/generation/${phase}`));
  write(path.join(output, `${label}-generation.json`), JSON.stringify(generated, null, 2) + '\n');
  const matrix = { label, sourceDeclarationsSha256: hash(fs.readFileSync(path.join(baseline, 'index.d.ts'))), generated: generated.consumers.length, unsupported: generated.skipped.length, rows: [] };
  // Validate each declaration set by itself before any consumer is interpreted.
  const prepared = Object.fromEntries(Object.entries({ baseline, ...candidates }).map(([name, dir]) => [name, analyze(dir, "import * as API from './index';\n", `${label}/preparation/${name}`).row]));
  matrix.preparation = Object.fromEntries(Object.entries(prepared).map(([name, r]) => [name, r.status === 0 ? 'ready' : 'preparation-error']));
  for (const specimen of generated.consumers) {
    write(path.join(output, 'generated', `${label}-${specimen.id}.ts`), specimen.text);
    const before = cli(baseline, specimen.text, `${label}/${specimen.id}/baseline`);
    for (const [name, dir] of Object.entries(candidates)) {
      const after = cli(dir, specimen.text, `${label}/${specimen.id}/${name}`);
      matrix.rows.push({ consumer: specimen.id, candidate: name, baselineThis: specimen.baselineThis, before: before.status, after: after.status, result: prepared.baseline.status || prepared[name].status ? 'preparation-error' : verdict(before, after), consumerSha256: hash(specimen.text), diagnostic: after.diagnostics });
    }
  }
  if (!generated.consumers.length) matrix.result = 'unsupported/no-consumer-generated';
  report.matrices.push(matrix);
  return generated;
}
try {
  report.compilerVersion = command(process.execPath, [compiler, '--version']).trim();
  if (report.compilerVersion !== 'Version 6.0.3') throw Error('NOT RUN: exact historical compiler 6.0.3 is required by this runner');
  ts = createRequire(import.meta.url)(path.resolve(path.dirname(compiler), '../lib/typescript.js'));
  report.compilerSha256 = hash(fs.readFileSync(compiler));
  report.compilerApiSha256 = hash(fs.readFileSync(path.resolve(path.dirname(compiler), '../lib/typescript.js')));
  const parsed = ts.parseCommandLine(flags);
  assert.deepEqual(parsed.errors, []);
  options = parsed.options;
  report.configuration = { options, strictFunctionTypes: true, strictBindCallApply: true, noImplicitThis: true, strictNullChecks: true, skipLibCheck: false, noUncheckedIndexedAccess: false, lib: 'implicit target es2020 default libs (es2020 + DOM and related libs)', types: 'automatic; isolated temporary directories with no project dependencies', resolution: "relative './index' -> sibling index.d.ts; separate identical layouts" };
  const archive = spawnSync('git', ['-C', sourceRepo, 'archive', baselineCommit], { maxBuffer: 16 * 1024 * 1024 });
  assert.equal(archive.status, 0, archive.stderr?.toString());
  const versions = {};
  for (const name of ['baseline', 'baseline-copy', 'reference', 'n03', 'n04']) {
    const dir = versions[name] = path.join(work, name); fs.mkdirSync(dir);
    const r = spawnSync('tar', ['-xf', '-', '-C', dir], { input: archive.stdout, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    if (['reference', 'n03', 'n04'].includes(name)) {
      const patch = name === 'reference' ? JSON.parse(fs.readFileSync(path.join(here, 'reference.patch.json'), 'utf8')).patch : historic(`patches/${name}.patch`);
      command('git', ['apply', '--check', '-'], dir, patch);
      command('git', ['apply', '-'], dir, patch);
      command('git', ['apply', '--reverse', '--check', '-'], dir, patch);
      report.preparation[name] = { patchSha256: hash(patch), exactApply: true, reverseCheck: true };
    }
    report.preparation[name] = { ...report.preparation[name], declarationSha256: hash(fs.readFileSync(path.join(dir, 'index.d.ts'))) };
  }
  const provenance = JSON.parse(fs.readFileSync(path.join(here, 'reference-provenance.json')));
  assert.equal(hash(JSON.parse(fs.readFileSync(path.join(here, 'reference.patch.json'), 'utf8')).patch), provenance.patchSha256);
  for (const [name, digest] of Object.entries(provenance.referenceFiles)) {
    if (name === 'TASK.md') assert.equal(hash(historic('tasks/B.md')), digest);
    else assert.equal(hash(fs.readFileSync(path.join(versions.reference, name))), digest, name);
  }
  report.preparation.reference.manifestFilesVerified = Object.keys(provenance.referenceFiles).length;
  // Known evaluator is loaded only here; never passed to generate().
  const known = JSON.parse(historic('type-compatibility.json')).fixture;
  write(path.join(output, 'known-consumer.ts'), known);
  report.known = ['baseline', 'reference', 'n03', 'n04'].map(name => ({ name, ...cli(versions[name], known, `known/${name}`) }));
  const tracked = command('git', ['-C', sourceRepo, 'ls-tree', '-r', '--name-only', baselineCommit]).trim().split('\n');
  report.oldConsumers = { source: baselineCommit, typescriptConsumers: tracked.filter(p => /\.[cm]?tsx?$/.test(p) && !p.endsWith('.d.ts')), declarationFiles: tracked.filter(p => p.endsWith('.d.ts')), status: 'NOT RUN: no pre-existing TypeScript consumers in source tree', javascriptTests: tracked.filter(p => p.startsWith('test/')) };
  assert.deepEqual(report.oldConsumers.typescriptConsumers, []);
  // Minimal conventional comparison, explicitly manually selected concrete generic arguments.
  const comparison = path.join(work, 'assignability'); fs.mkdirSync(comparison);
  for (const [name, dir] of Object.entries(versions)) fs.cpSync(path.join(dir, 'index.d.ts'), path.join(comparison, `${name}.d.ts`));
  report.assignability = [];
  for (const name of ['baseline-copy', 'reference', 'n03', 'n04']) {
    const text = `import Old from './baseline';\nimport New from './${name}';\ntype Events = { sample: [string] };\ntype Receiver = { marker: string };\ndeclare const modern: New<Events, Receiver>;\nconst instance: Old<Events, Receiver> = modern;\nconst constructor: typeof Old = New;\ntype OldSurface = Old<Events, Receiver>;\ntype NewSurface = New<Events, Receiver>;\ndeclare const methods: { [K in keyof OldSurface]: K extends keyof NewSurface ? NewSurface[K] : unknown };\nconst oldMethods: OldSurface = methods;\n`;
    write(path.join(output, `assign-${name}.ts`), text);
    report.assignability.push({ candidate: name, direction: 'new -> old', ...cli(comparison, text, `assignability/${name}`) });
  }
  const reverse = "import Old from './baseline';\nimport New from './reference';\ndeclare const old: Old<{sample: [string]}, {marker: string}>;\nconst symmetric: New<{sample: [string]}, {marker: string}> = old;\n";
  write(path.join(output, 'symmetric-reference.ts'), reverse);
  report.symmetricFalsePositive = cli(comparison, reverse, 'reverse-direction/reference');
  // Harmless helper factoring via compiler AST; preserve the original public alias.
  const original = fs.readFileSync(path.join(versions.baseline, 'index.d.ts'), 'utf8');
  const ast = ts.createSourceFile('index.d.ts', original, ts.ScriptTarget.Latest, true);
  const namespace = ast.statements.find(ts.isModuleDeclaration);
  const alias = namespace.body.statements.find(s => ts.isTypeAliasDeclaration(s) && ts.isMappedTypeNode(s.type));
  assert.ok(alias);
  const edits = []; const visit = n => { if (ts.isIdentifier(n) && n.text === alias.name.text) edits.push([n.getStart(ast), n.end]); ts.forEachChild(n, visit); }; visit(ast);
  let renamed = original; for (const [a, b] of edits.reverse()) renamed = renamed.slice(0, a) + 'LocalMapAlias' + renamed.slice(b);
  const typeParameters = alias.typeParameters?.map(t => t.getText(ast)).join(', ');
  const names = alias.typeParameters?.map(t => t.name.text).join(', ');
  renamed += `\ndeclare namespace ${namespace.name.text} { export type ${alias.name.text}<${typeParameters}> = LocalMapAlias<${names}>; }\n`;
  versions.alias = declarationCopy('alias', renamed);
  report.alias = { oldName: alias.name.text, newName: 'LocalMapAlias', replacements: edits.length, note: 'helper factoring/rename with original public alias retained as forwarding alias; old callable usage preserved' };
  controls(versions.baseline, Object.fromEntries(['baseline-copy', 'reference', 'n03', 'n04', 'alias'].map(n => [n, versions[n]])), 'historical');
  const fixture = name => fs.readFileSync(path.join(here, 'controls', name), 'utf8');
  const parcel = declarationCopy('parcel-baseline', fixture('parcel-old.d.ts'));
  const changed = declarationCopy('parcel-changed', fixture('parcel-changed.d.ts'));
  const extended = declarationCopy('parcel-extended', fixture('parcel-extended.d.ts'));
  const missing = declarationCopy('parcel-missing-import', "import { Lost } from './dependency-not-present';\n" + fixture('parcel-old.d.ts'));
  controls(parcel, { changed, extended, missing }, 'parcel');
  const existing = declarationCopy('receiver-baseline', fixture('receiver-existing.d.ts'));
  const existingCopy = declarationCopy('receiver-copy', fixture('receiver-existing.d.ts'));
  controls(existing, { unchanged: existingCopy }, 'existing-receiver');
  const receiverConsumer = fixture('receiver-consumer.ts');
  report.existingReceiverManual = [cli(existing, receiverConsumer, 'manual-existing/baseline'), cli(existingCopy, receiverConsumer, 'manual-existing/copy')];
  const unsupported = declarationCopy('unsupported', fixture('unsupported.d.ts'));
  controls(unsupported, { unchanged: declarationCopy('unsupported-copy', fixture('unsupported.d.ts')) }, 'unsupported');
  const nominalOld = declarationCopy('nominal-old', fixture('private-identity.d.ts'));
  const nominalNew = declarationCopy('nominal-new', fixture('private-identity.d.ts'));
  const nominalComparison = path.join(work, 'nominal-comparison');
  fs.mkdirSync(nominalComparison);
  fs.copyFileSync(path.join(nominalOld, 'index.d.ts'), path.join(nominalComparison, 'old.d.ts'));
  fs.copyFileSync(path.join(nominalNew, 'index.d.ts'), path.join(nominalComparison, 'new.d.ts'));
  const nominalText = "import Old from './old';\nimport New from './new';\ndeclare const candidate: New;\nconst original: Old = candidate;\n";
  write(path.join(output, 'nominal-comparison.ts'), nominalText);
  report.nominalFalsePositive = cli(nominalComparison, nominalText, 'cross-module-private-identity');
  controls(nominalOld, { unchanged: nominalNew }, 'nominal');
  report.explicitPermission = { source: 'local plan: caller expressly requests the Parcel callback to require Owner; no requirements interpreter', technicalResult: 'same parcel/changed witness rows', taskViolation: false };
  const missingCompiler = spawnSync(process.execPath, [path.join(work, 'compiler-not-present', 'tsc'), '--noEmit'], { encoding: 'utf8', timeout: 15000 });
  report.missingCompiler = { result: 'preparation-error', status: missingCompiler.status, diagnostics: normalize(missingCompiler.stderr), semanticCompilation: false };
  // A manual new-feature check reveals a limitation of the saved reference.
  const contextText = fixture('reference-context.ts');
  report.referenceContext = [cli(versions.reference, contextText, 'manual-new-context/saved-reference')];
  const contextCopy = declarationCopy('reference-context-diagnostic', fs.readFileSync(path.join(versions.reference, 'index.d.ts'), 'utf8').replace('fn: EventEmitter.EventListener<EventTypes, T>, context?: Context): () => void;', 'fn: (this: Context, ...args: EventEmitter.EventArgs<EventTypes, T>) => void, context?: Context): () => void;'));
  report.referenceContext.push(cli(contextCopy, contextText, 'manual-new-context/diagnostic-copy'));
  controls(versions.baseline, { contextOnlyExtension: contextCopy }, 'context-extension');
  const resultsFor = (label, candidate) => report.matrices.find(m => m.label === label).rows.filter(r => r.candidate === candidate).map(r => r.result);
  const all = (label, candidate, expected) => { const rows = resultsFor(label, candidate); return rows.length > 0 && rows.every(r => r === expected); };
  const found = 'reproduced-incompatibility', clear = 'no-difference-in-checked-scope';
  const controlsPassed = ['n03', 'n04'].every(n => all('historical', n, found)) &&
    ['baseline-copy', 'reference', 'alias'].every(n => all('historical', n, clear)) &&
    all('parcel', 'changed', found) && all('parcel', 'extended', clear) && all('parcel', 'missing', 'preparation-error') &&
    all('existing-receiver', 'unchanged', 'unsupported-baseline-consumer') &&
    report.existingReceiverManual.every(r => r.status === 0) && all('context-extension', 'contextOnlyExtension', clear) && all('nominal', 'unchanged', clear);
  assert.ok(controlsPassed, 'Control matrix does not support decision A; inspect diagnostics');
  report.decision = 'A: bounded baseline-derived consumers reproduce both saved patches and the other module; checked additive controls have no new old-consumer failure. Development evidence only; unsupported cases remain unproven.';
  report.status = 'completed';
} catch (error) {
  report.status = 'NOT RUN / preparation or runner failure'; report.error = normalize(error.stack); process.exitCode = 1;
} finally {
  report.elapsedMs = performance.now() - start;
  report.semanticCompilations = report.compilations.length;
  report.compileElapsedMs = report.compilations.reduce((n, c) => n + c.elapsedMs, 0);
  write(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  fs.rmSync(work, { recursive: true, force: true });
  console.log(JSON.stringify({ status: report.status, error: report.error, compilations: report.semanticCompilations, elapsedMs: report.elapsedMs, matrices: report.matrices.map(m => ({ label: m.label, generated: m.generated, results: [...new Set(m.rows.map(r => r.result))] })) }, null, 2));
}
