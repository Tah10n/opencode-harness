// Trusted compiler in a bounded child, with a closed virtual CompilerHost.
// No project JavaScript, plugins, physical module resolution or project execution.
import vm from 'node:vm';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {generate} from './native-type-compat-generator.mjs';
const hash = x => createHash('sha256').update(x).digest('hex');
const chunks = []; let bytes = 0;
for await (const chunk of process.stdin) {
  if ((bytes += chunk.length) > 32 * 1024 * 1024) throw Error('Input bound');
  chunks.push(chunk);
}
const input = JSON.parse(Buffer.concat(chunks));
const context = vm.createContext({module: {exports: {}}, exports: {}});
vm.runInContext(input.compiler, context); // Exact pinned compiler bytes; no require/process/filesystem in context.
const ts = context.module.exports;
if (ts.version !== '6.0.3') throw Error('Unsupported compiler');
const options = {noEmit: true, strict: true, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10, ignoreDeprecations: '6.0', types: [], skipLibCheck: false,
  noUncheckedIndexedAccess: false};
const libraries = new Map(input.libraries.map(([name, text]) => ['/lib/' + name, text]));
const compilations = [];
const librarySources = new Map();
function analyze(files, text, phase) {
  const start = performance.now();
  const probe = '/project/__consumer__.ts';
  const entries = new Map([...libraries, ...files.map(([name, value]) => ['/project/' + name, value]), [probe, text]]);
  const normalize = name => path.posix.resolve('/', name);
  const read = name => entries.get(normalize(name));
  const host = {getSourceFile: (name, language) => {
    const value = read(name);
    if (value === undefined) return undefined;
    if (name.startsWith('/lib/')) {
      if (!librarySources.has(name)) librarySources.set(name, ts.createSourceFile(name, value, language, true));
      return librarySources.get(name);
    }
    return ts.createSourceFile(name, value, language, true);
  }, getDefaultLibFileName: () => '/lib/lib.es2020.full.d.ts', writeFile() {throw Error('Emit prohibited');},
  getCurrentDirectory: () => '/project', getDirectories: () => [],
  directoryExists: name => [...entries.keys()].some(p => p.startsWith(normalize(name) + '/')),
  fileExists: name => entries.has(normalize(name)), readFile: read,
  getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n', realpath: normalize};
  const program = ts.createProgram([probe], options, host);
  const rawDiagnostics = ts.getPreEmitDiagnostics(program);
  if (rawDiagnostics.length > 100) throw Error('Diagnostic count bound');
  const diagnostics = rawDiagnostics.map(d => ({code: d.code, category: d.category,
    file: d.file?.fileName ?? null, start: d.start ?? null,
    message: ts.flattenDiagnosticMessageText(d.messageText, '\n').slice(0, 2000)}));
  compilations.push({phase, elapsedMs: performance.now() - start, diagnostics, consumerSha256: hash(text)});
  return {checker: program.getTypeChecker(), source: program.getSourceFile(probe), rawDiagnostics, diagnostics};
}
const importText = `import * as Surface from ${JSON.stringify(input.specifier)};\n`;
const before = analyze(input.baseline, importText, 'baseline/preparation');
const after = analyze(input.candidate, importText, 'candidate/preparation');
const report = {status: 'preparation-error', options, compilations, consumers: [], skipped: []};
if (!before.diagnostics.length && !after.diagnostics.length) {
  const generated = generate(ts, (text, phase) => analyze(input.baseline, text, 'generation/' + phase), input.specifier);
  report.skipped = generated.skipped; report.limits = generated.limits;
  for (const consumer of generated.consumers) {
    const old = analyze(input.baseline, consumer.text, 'baseline/' + consumer.id);
    const candidate = analyze(input.candidate, consumer.text, 'candidate/' + consumer.id);
    // Declaration errors and missing resolution never establish an old-call regression.
    const preparation = candidate.diagnostics.some(d => d.file !== '/project/__consumer__.ts' || [2307, 2688, 6053, 2318].includes(d.code));
    const status = old.diagnostics.length ? 'unsupported-baseline-consumer' : preparation ? 'preparation-error'
      : candidate.diagnostics.length ? 'reproduced-incompatibility' : 'no-difference-in-checked-scope';
    report.consumers.push({...consumer, sha256: hash(consumer.text), status, baseline: old.diagnostics, candidate: candidate.diagnostics});
  }
  report.status = report.consumers.some(c => c.status === 'preparation-error') ? 'preparation-error'
    : report.consumers.some(c => c.status === 'reproduced-incompatibility') ? 'reproduced-incompatibility'
    : report.consumers.some(c => c.status === 'no-difference-in-checked-scope') ? 'no-difference-in-checked-scope' : 'unsupported';
  if (report.status === 'unsupported') report.reason = 'No baseline-admissible consumer in supported scope';
}
process.stdout.write(JSON.stringify(report));
