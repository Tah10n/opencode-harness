// Model-free real-compiler regression controls. Never installs a compiler.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {captureTypeInputs, runTypeComparison, createTypeCompatibility, typeCompatProfile, typeCompatCommand} from '../lib/native-type-compat.mjs';
const compiler = process.env.HARNESS_TASK_TYPE_COMPAT_COMPILER;
if (!compiler) {console.log('NOT RUN: select existing TypeScript 6.0.3 with HARNESS_TASK_TYPE_COMPAT_COMPILER'); process.exitCode = 1;} else {
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'type-compat-controls-')));
const rules = [{permission: '*', pattern: '*', action: 'allow'}];
const baseline = 'export class Parcel { lookup(n: number): { action: (s: string) => void }; }\n';
const broken = baseline.replace('(s: string)', '(this: {owner: string}, s: string)');
const write = (name, bytes) => fs.writeFileSync(path.join(root, name), bytes);
const capture = extra => captureTypeInputs({directory: root, rules, compiler, profile: typeCompatProfile, ...extra});
const results = [];
try {
write('package.json', JSON.stringify({types: 'index.d.ts'})); write('index.d.ts', baseline);
const input = capture();
const compare = async (name, old, candidate, expected) => {
  const row = await runTypeComparison({compiler: input.compiler, libraries: input.libraries, specifier: './index', baseline: [['index.d.ts', old]], candidate: [['index.d.ts', candidate]]});
  assert.equal(row.status, expected, name + ': ' + JSON.stringify(row)); assert.equal(row.process.terminationVerified, true);
  results.push({name, status: row.status, cost: row.cost}); return row;
};
const regression = await compare('different method and object return', baseline, broken, 'reproduced-incompatibility');
assert.match(regression.consumers[0].text, /lookup.*1/); assert.equal(regression.consumers[0].candidate[0].code, 2684);
await compare('additive API', baseline, baseline.replace('lookup(', 'inspect(): number; lookup('), 'no-difference-in-checked-scope');
await compare('alias refactor', baseline, 'export type Action = (s: string) => void;\n' + baseline.replace('(s: string) => void', 'Action'), 'no-difference-in-checked-scope');
await compare('receiver already required', broken, broken, 'unsupported');
await compare('private identity separated', baseline.replace('lookup(', 'private value: number; lookup('), baseline.replace('lookup(', 'private value: number; lookup('), 'no-difference-in-checked-scope');
const overload = 'export class Other { get(): { (x: string): void; (x: number): void }; generic(): <T>(x: T) => T; }';
await compare('overloaded and generic callbacks', overload, overload, 'unsupported');
await compare('no consumers', 'export class Empty {}', 'export class Empty {}', 'unsupported');
await compare('malformed declarations', baseline, 'export class {', 'preparation-error');
await compare('missing import', baseline, "import {Missing} from './missing';\n" + baseline.replace('(s: string)', '(s: Missing)'), 'preparation-error');
const timed = await runTypeComparison({compiler: input.compiler, libraries: input.libraries, specifier: './index', baseline: input.files, candidate: input.files}, {budgetMs: 1});
assert.equal(timed.status, 'NOT RUN'); assert.equal(timed.reason, 'timeout'); assert.equal(timed.process.terminationVerified, true);
const aborted = new AbortController(); aborted.abort();
assert.equal((await runTypeComparison({}, {signal: aborted.signal})).reason, 'cancelled');
assert.equal((await runTypeComparison({}, {node: '/missing/node'})).status, 'NOT RUN');
assert.equal((await runTypeComparison({compiler: 'throw Error("crash")'})).status, 'NOT RUN');
const rejects = (name, fn, regex) => {assert.throws(fn, regex); results.push({name, rejected: true});};
rejects('missing compiler', () => capture({compiler: '/missing/typescript.js'}), /Missing input/);
rejects('unselected config', () => capture({profile: undefined}), /Explicit diagnostic profile/);
write('index.d.ts', "export {X} from './private';"); write('private.d.ts', 'export class X {}');
rejects('denied import', () => capture({rules: [...rules, {permission: 'read', pattern: '*private*', action: 'deny'}]}), /not permitted/);
fs.unlinkSync(path.join(root, 'private.d.ts')); fs.symlinkSync(compiler, path.join(root, 'private.d.ts'));
rejects('symlink import', () => capture(), /Symlink/); fs.unlinkSync(path.join(root, 'private.d.ts'));
write('index.d.ts', baseline); write('tsconfig.json', '{"extends":"../secret.json"}');
rejects('extends is not read', () => capture(), /extends/); fs.unlinkSync(path.join(root, 'tsconfig.json'));
write('package.json', '{"types":"index.d.ts","exports":{".":{"import":"./a.js","require":"./b.js"}}}');
rejects('ambiguous exports', () => capture(), /exports/); write('package.json', '{"types":"index.d.ts"}');

write('index.d.ts', "export {Parcel} from './public';"); write('public.d.ts', baseline);
const graph = capture(); assert.equal(graph.files.length, 2);
write('public.d.ts', broken); assert.notEqual(capture().surfaceHash, graph.surfaceHash);
const linked = await runTypeComparison({compiler: input.compiler, libraries: input.libraries, specifier: './index', baseline: graph.files, candidate: capture().files});
assert.equal(linked.status, 'reproduced-incompatibility'); results.push({name: 'imported public declaration change', status: linked.status});
write('index.d.ts', "export {Parcel} from './node_modules/pkg/index';");
fs.mkdirSync(path.join(root, 'node_modules/pkg'), {recursive: true}); write('node_modules/pkg/index.d.ts', baseline);
rejects('relative dependency is not public source', () => capture(), /Dependency declarations/);
write('index.d.ts', baseline);
let current = 'initial-with-user-dirty-edit', active = true;
const saved = new Map();
const create = () => createTypeCompatibility({directory: root, rules, compiler, profile: typeCompatProfile,
  save: (n, r) => saved.set(n, structuredClone(r)), signal: new AbortController().signal,
  active: () => {if (!active) throw Error('cancelled');}, remainingMs: () => 120000, snapshot: current, capture: () => current});
const mechanism = create();
const event = (id, command = 'npm test') => ({tool: 'bash', state: 'completed', executionAdmitted: true, exit: 0,
  args: {command}, admittedArgs: {command}, after: current, callID: id});
assert.equal(await mechanism.after(event('unchanged')), '');
assert.equal(typeCompatCommand(event('compound', 'npm test && echo ok'), root), false);
write('index.d.ts', broken); current = 'author-broken';
const text = await mechanism.after(event('first')); assert.match(text, /TS|2684/); assert.match(text, /Этот старый вызов/);
assert.equal(await mechanism.after(event('first')), ''); assert.equal(await mechanism.after(event('same')), '');
write('index.d.ts', baseline + 'export type NewAPI = string;'); current = 'author-fixed';
assert.match(await mechanism.after(event('second')), /no-difference-in-checked-scope/);
assert.equal(mechanism.finish(current).current, true);
write('index.d.ts', broken); current = 'later'; assert.equal(await mechanism.after(event('third')), '');
const final = mechanism.finish(current); assert.equal(final.current, false); assert.equal(final.runs.length, 2);
assert.equal(final.baselineSnapshot, 'initial-with-user-dirty-edit');
write('index.d.ts', baseline); const environment = create(); write('tsconfig.json', '{"compilerOptions":{"strict":false}}'); current = 'config-change';
assert.match(await environment.after(event('config')), /conditions/); fs.unlinkSync(path.join(root, 'tsconfig.json'));
const removed = create(); fs.renameSync(path.join(root, 'index.d.ts'), path.join(root, 'moved.d.ts')); current = 'rename';
assert.match(await removed.after(event('rename')), /Missing input/); fs.renameSync(path.join(root, 'moved.d.ts'), path.join(root, 'index.d.ts'));
const isolated = create(); assert.equal(isolated.finish(current).runs.length, 0);
// External mutation during actual asynchronous compile must suppress delivery.
const external = create(); write('index.d.ts', broken); current = 'before-external';
const pending = external.after(event('external')); setTimeout(() => {write('index.d.ts', baseline); current = 'external';}, 50);
assert.equal(await pending, ''); assert.equal(external.finish(current).runs[0].delivered, undefined);
const cancelled = create(); write('index.d.ts', broken); current = 'cancelling';
const later = cancelled.after(event('cancel')); setTimeout(() => {active = false;}, 50);
assert.equal(await later, ''); assert.equal(cancelled.finish(current).runs[0].status, 'NOT RUN');
console.log(JSON.stringify({passed: true, controls: results, lifecycle: ['unchanged','duplicate','two-run-limit','baseline-frozen','stale','config-change','rename','isolated','external-write','cancelled'], realProviderCalls: 0}, null, 2));
} finally {fs.rmSync(root, {recursive: true, force: true});}
}
