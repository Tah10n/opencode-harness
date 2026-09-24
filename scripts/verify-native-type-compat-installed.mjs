// Offline installed path, using existing OpenCode 1.18.26 and prepared dependencies.
// Run in the existing network-isolated Linux image, see run-native-type-compat-installed.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {materializeNativeTemplate} from '../lib/native-template.mjs';
const root = '/repo';
const hash = x => createHash('sha256').update(x).digest('hex');
const run = (bin, args, cwd, env = process.env) => {
  const r = spawnSync(bin, args, {cwd, env, encoding: 'utf8', timeout: 90000, maxBuffer: 4 * 1024 * 1024});
  assert.equal(r.status, 0, r.stdout + '\n' + r.stderr); return r.stdout.trim();
};
const write = (p, s) => {fs.mkdirSync(path.dirname(p), {recursive: true}); fs.writeFileSync(p, s);};
const json = (p, x) => write(p, JSON.stringify(x, null, 2) + '\n');
const listen = s => new Promise(r => s.listen(0, '127.0.0.1', r));
const wait = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const compilerRoot = root + '/local/native-command-hints-comparison/batch/bundle/node_modules/typescript';
const compilerBefore = hash(fs.readFileSync(compilerRoot + '/lib/typescript.js'));
for (const mode of (process.env.TYPE_COMPAT_MODES?.split(',') ?? ['emitter', 'parcel', 'off', 'allowed-break', 'no-command'])) {
  const base = '/work/' + mode;
  for (const name of ['home', 'config', 'data', 'cache', 'state', 'tmp', 'project', 'bin']) fs.mkdirSync(base + '/' + name, {recursive: true});
  const project = base + '/project', bundle = base + '/bundle', task = base + '/task.txt';
  const git = (...args) => run('git', args, project);
  const emitter = mode === 'emitter' || mode === 'off';
  const source = '/repo/local/native-task-h00-transfer/sources/eventemitter3';
  const oldTypes = emitter ? fs.readFileSync(source + '/index.d.ts', 'utf8') : 'export class Parcel { lookup(n: number): { action: (s: string) => void }; }\n';
  const oldRuntime = emitter ? fs.readFileSync(source + '/index.js', 'utf8') : 'class Parcel { lookup(n) { return {action: s => s + n}; } }\nmodule.exports = {Parcel};\n';
  const signature = '  subscribe<T extends EventEmitter.EventNames<EventTypes>>(event: T, fn: (this: Context, ...args: EventEmitter.EventArgs<EventTypes, T>) => void, context: Context): () => void;\n';
  const newTypes = emitter ? oldTypes.replace('  static prefixed:', signature + '  static prefixed:') : oldTypes.replace('lookup(', 'inspect(): number; lookup(');
  const narrowOld = emitter ? 'Array<EventEmitter.EventListener<EventTypes, T>>' : '(s: string)';
  const narrowNew = emitter ? 'Array<(this: Context, ...args: EventEmitter.EventArgs<EventTypes, T>) => void>' : '(this: {owner: string}, s: string)';
  const badTypes = newTypes.replace(narrowOld, narrowNew);
  const newRuntime = emitter ? oldRuntime + `\nEventEmitter.prototype.subscribe = function(event, fn, context) {\n  var emitter = this, active = true;\n  function listener() { return fn.apply(context, arguments); }\n  emitter.on(event, listener);\n  return function cancel() { if (active) { active = false; emitter.removeListener(event, listener); } };\n};\n` : oldRuntime + '\nParcel.prototype.inspect = function() { return 7; };\n';
  const typesTest = emitter ? `import EventEmitter from './index';
type IsAny<T> = 0 extends (1 & T) ? true : false;
const emitter = new EventEmitter<{sample: [string]}, {marker: string}>();
const cancel: () => void = emitter.subscribe('sample', function(value) {
  const argumentIsAny: IsAny<typeof value> = false;
  const receiver = this;
  const receiverIsAny: IsAny<typeof receiver> = false;
  const s: string = value;
  const context: {marker: string} = this;
  const marker: string = this.marker;
}, {marker: 'ok'});
cancel();
` : `import {Parcel} from './index';
const n: number = new Parcel().inspect();
`;
  const runtimeTest = emitter ? `const test = require('node:test'), assert = require('node:assert/strict'), E = require('./index');
test('subscription cancellation, arguments, context and legacy listeners', () => {
  const e = new E(), context = {marker: 'ok'}, calls = [];
  function callback(value) {assert.equal(this, context); calls.push(value);}
  const first = e.subscribe('sample', callback, context), second = e.subscribe('sample', callback, context);
  assert.equal(e.listenerCount('sample'), 2); e.emit('sample', 'one'); assert.deepEqual(calls, ['one','one']);
  first(); first(); assert.equal(e.listenerCount('sample'), 1); e.emit('sample', 'two'); assert.deepEqual(calls, ['one','one','two']);
  second(); assert.equal(e.emit('sample', 'three'), false);
  let old = 0; e.on('old', n => old += n); e.once('old', n => old += n * 10);
  e.emit('old', 2); e.emit('old', 3); assert.equal(old, 25); assert.equal(e.listeners('old').length, 1);
  e.removeAllListeners(); assert.equal(e.listenerCount('old'), 0);
});\n` : `const test = require('node:test'), assert = require('node:assert/strict'), {Parcel} = require('./index');
test('new inspect and existing lookup', () => {const p = new Parcel(); assert.equal(p.inspect(), 7); assert.equal(p.lookup(2).action('v'), 'v2');});\n`;
  const typeFlags = '--ignoreConfig --noEmit --strict --target es2020 --module commonjs --moduleResolution node --ignoreDeprecations 6.0';
  json(project + '/package.json', {name: 'installed-' + mode, private: true, types: 'index.d.ts', scripts: {test: 'node --test runtime.test.js && tsc ' + typeFlags + ' types.test.ts' + (emitter ? ' && mocha test/test.js test/test.mjs' : '')}});
  if (emitter) {
    fs.cpSync(source + '/test', project + '/test', {recursive: true});
    fs.copyFileSync(source + '/index.mjs', project + '/index.mjs');
  }
  write(project + '/index.d.ts', oldTypes); write(project + '/index.js', oldRuntime);
  // Normal fixture permission configuration is identical for enabled and disabled cases.
  json(project + '/opencode.json', {$schema: 'https://opencode.ai/config.json', permission: {task: 'allow', bash: 'allow', external_directory: 'allow'}});
  git('init', '-q'); git('add', '.'); git('-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '-qm', 'baseline');
  const dirty = '\nexport class UserDraft { original(n: number): { action: (s: string) => void }; }\n';
  write(project + '/index.d.ts', oldTypes + dirty); // User's allowed uncommitted declaration must be the baseline.
  const originalStatus = git('status', '--porcelain'), originalDiff = git('diff'), originalIndex = hash(fs.readFileSync(project + '/.git/index'));
  write(task, emitter ? 'Add typed subscribe(event, callback, context) returning independent idempotent cancellation. Infer contextual this and typed event arguments. Preserve existing listener types and runtime behavior. Add project type/runtime tests and run npm test.' :
    'Add Parcel.inspect(): number returning 7. Preserve lookup runtime behavior. Add type/runtime tests and run npm test.' + (mode === 'allowed-break' ? ' Intentionally require {owner: string} as this for callbacks returned by lookup; this breaking type change is authorized.' : ' Preserve existing callback types.'));
  materializeNativeTemplate({repositoryRoot: root, outputDirectory: bundle, task: true});
  for (const [from, to] of [[root + '/local/native-task-integrated/plain-dependencies/node_modules', bundle + '/node_modules'], [root + '/local/native-task-integrated/plain-dependencies/package-lock.json', bundle + '/package-lock.json']]) fs.cpSync(from, to, {recursive: true, verbatimSymlinks: true});
  fs.mkdirSync(base + '/config/opencode', {recursive: true});
  for (const name of ['node_modules', 'package.json', 'package-lock.json']) fs.cpSync(root + '/local/native-task-integrated/plain-dependencies/' + name, base + '/config/opencode/' + name, {recursive: true, verbatimSymlinks: true});
  fs.copyFileSync(root + '/local/native-task-integrated/plain-dependencies/rg', base + '/bin/rg'); fs.chmodSync(base + '/bin/rg', 0o755);
  write(base + '/bin/tsc', '#!/bin/sh\nexec /usr/local/bin/node ' + compilerRoot + '/bin/tsc "$@"\n'); fs.chmodSync(base + '/bin/tsc', 0o755);
  const installed = {};
  for (const name of ['native-task-plugin.mjs', 'native-type-compat.mjs', 'native-type-compat-worker.mjs', 'native-type-compat-generator.mjs']) {
    installed[name] = hash(fs.readFileSync(bundle + '/' + name)); assert.equal(installed[name], hash(fs.readFileSync(root + '/lib/' + name)));
  }
  if (mode === 'off') for (const name of ['native-type-compat.mjs', 'native-type-compat-worker.mjs', 'native-type-compat-generator.mjs']) fs.unlinkSync(bundle + '/' + name);
  let step = 0, parentSteps = 0, requests = 0, worktree, received = false, finalReceipt = false, providerError;
  const nativeCalls = [];
  const respond = (res, call, content = '') => {
    const delta = call ? {role: 'assistant', tool_calls: [{index: 0, id: 'fixture-' + requests, type: 'function', function: {name: call.name, arguments: JSON.stringify(call.args)}}]} : {role: 'assistant', content};
    const base = {id: 'r' + requests, object: 'chat.completion.chunk', created: 1, model: 'fixture'};
    res.writeHead(200, {'content-type': 'text/event-stream'});
    res.end(`data: ${JSON.stringify({...base, choices: [{index: 0, delta, finish_reason: null}]})}\n\ndata: ${JSON.stringify({...base, choices: [{index: 0, delta: {}, finish_reason: call ? 'tool_calls' : 'stop'}]})}\n\ndata: [DONE]\n\n`);
  };
  const provider = http.createServer(async (req, res) => {try {
    assert.equal(req.url, '/v1/chat/completions');
    const chunks = []; for await (const c of req) chunks.push(c); const body = JSON.parse(Buffer.concat(chunks)); requests++;
    if (!body.tools?.length) {respond(res, null, 'Fixture title'); return;}
    const u = body.messages.findLast(m => m.role === 'user'), text = typeof u?.content === 'string' ? u.content : JSON.stringify(u?.content);
    if (!text.includes('Implement the complete original task')) {respond(res, parentSteps++ === 0 ? {name: 'harness_task', args: {}} : null, 'Report actual workflow result.'); return;}
    const toolText = body.messages.filter(m => m.role === 'tool').map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
    const bash = command => ({name: 'bash', args: {command, description: 'Ordinary project verification', timeout: 90000}});
    const edit = (file, oldString, newString) => ({name: 'edit', args: {filePath: file, oldString, newString}});
    const add = (name, bytes) => ({name: 'write', args: {filePath: path.join(worktree, name), content: bytes}});
    let call;
    if (step === 0) {
      const dirs = fs.readdirSync(project + '/.git/harness-task'); assert.equal(dirs.length, 1); worktree = project + '/.git/harness-task/' + dirs[0] + '/worktree';
      call = {name: 'read', args: {filePath: 'index.d.ts'}};
    } else if (step === 1) call = edit('index.d.ts', oldTypes + dirty, badTypes + dirty);
    else if (step === 2) call = {name: 'read', args: {filePath: 'index.js'}};
    else if (step === 3) call = edit('index.js', oldRuntime, newRuntime);
    else if (step === 4) call = add('types.test.ts', typesTest);
    else if (step === 5) call = add('runtime.test.js', runtimeTest);
    else if (step === 6 && mode !== 'no-command') call = bash('npm test');
    else if (step === 7 && !['off', 'allowed-break'].includes(mode)) {
      const diagnostic = JSON.parse(fs.readFileSync(path.dirname(worktree) + '/type-compat.json'));
      const first = diagnostic.runs[0]; assert.equal(first.status, 'reproduced-incompatibility');
      for (const fragment of [first.snapshot, first.baselineSnapshot, first.consumers.find(c => c.status === 'reproduced-incompatibility').text, '2684']) assert.ok(toolText.includes(fragment), 'Real generated evidence missing in outgoing author request: ' + fragment);
      assert.ok(first.consumers.some(c => c.export === 'UserDraft'), 'Uncommitted user declaration omitted from baseline');
      received = true; call = edit('index.d.ts', narrowNew, narrowOld);
    } else if (step === 8 && !['off', 'allowed-break'].includes(mode)) call = bash('npm test');
    else {
      if (!['off', 'allowed-break', 'no-command'].includes(mode)) {
        const diagnostic = JSON.parse(fs.readFileSync(path.dirname(worktree) + '/type-compat.json'));
        assert.equal(diagnostic.runs.length, 2); assert.equal(diagnostic.runs[1].status, 'no-difference-in-checked-scope');
        assert.ok(toolText.includes(diagnostic.runs[0].consumers.find(c => c.status === 'reproduced-incompatibility').text));
        assert.ok(toolText.includes(diagnostic.runs[1].snapshot)); finalReceipt = true;
      }
      if (mode === 'allowed-break') {assert.ok(toolText.includes('2684')); received = true;}
      if (mode === 'off') assert.ok(!toolText.includes('Type compatibility observation'));
      respond(res, null, 'Implemented requested extension and project tests. Technical type differences remain subject to the original task.'); step++; return;
    }
    assert.ok(body.tools.some(t => t.function?.name === call.name), 'Native tool unavailable: ' + call.name);
    nativeCalls.push(call); step++; respond(res, call);
  } catch (e) {providerError = e; console.error(e.stack); res.writeHead(400); res.end(e.message);}});
  await listen(provider);
  const config = {model: 'local-fixture/fixture', small_model: 'local-fixture/fixture', provider: {'local-fixture': {npm: '@ai-sdk/openai-compatible', name: 'Offline scripted fixture', options: {baseURL: `http://127.0.0.1:${provider.address().port}/v1`, apiKey: 'not-a-credential'}, models: {fixture: {name: 'fixture', limit: {context: 200000, output: 10000}}}}}};
  const env = {NODE_PATH: source + '/node_modules', PATH: base + '/bin:' + source + '/node_modules/.bin:/usr/local/bin:/usr/bin:/bin', SHELL: '/bin/bash', HOME: base + '/home', TMPDIR: base + '/tmp', ...Object.fromEntries(['config', 'data', 'cache', 'state'].map(n => ['XDG_' + n.toUpperCase() + '_HOME', base + '/' + n])),
    OPENCODE_DISABLE_MODELS_FETCH: 'true', OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_CONFIG_DIR: bundle, OPENCODE_CONFIG_CONTENT: JSON.stringify(config), HARNESS_TASK_FILE: task, HARNESS_TASK_TIMEOUT_MS: '180000', HARNESS_TASK_STRATEGY: 'direct',
    HARNESS_TASK_TYPE_COMPAT: mode === 'off' ? '0' : '1', HARNESS_TASK_TYPE_COMPAT_PROFILE: 'returned-callable-strict-v1', HARNESS_TASK_TYPE_COMPAT_COMPILER: compilerRoot + '/lib/typescript.js', HARNESS_TASK_TYPE_COMPAT_NODE: '/usr/local/bin/node',
    HARNESS_TASK_COMMAND_HINTS: '0', HARNESS_TASK_CONTEXT: '0', HARNESS_TASK_CHECKS: '0', HARNESS_TASK_SENSITIVITY: '0', HARNESS_TASK_INVESTIGATION: '0', HARNESS_TASK_EXTRA_ATTENTION: '0'};
  assert.equal(run('/opt/opencode', ['--version'], project, env), '1.18.26');
  const probe = http.createServer(); await listen(probe); const port = probe.address().port; await new Promise(r => probe.close(r));
  const server = spawn('/opt/opencode', ['serve', '--hostname', '127.0.0.1', '--port', String(port)], {cwd: project, env, stdio: ['ignore', 'pipe', 'pipe']});
  let log = ''; server.stdout.on('data', x => log += x); server.stderr.on('data', x => log += x);
  const api = async (method, p, body) => {const r = await fetch(`http://127.0.0.1:${port}${p}`, {method, headers: {'content-type': 'application/json'}, ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(p === '/global/health' ? 1500 : 210000)}); assert.ok(r.ok, await r.clone().text()); return r.json();};
  try {
    let ready = false; for (let n = 0; n < 200; n++) {try {await api('GET', '/global/health'); ready = true; break;} catch {await wait(100);}} assert.ok(ready, log);
    const session = await api('POST', '/session', {});
    await api('POST', `/session/${session.id}/command`, {command: 'harness-task', arguments: '', agent: 'build', model: 'local-fixture/fixture'});
    if (providerError) throw providerError;
    assert.ok(worktree, 'Author not started: ' + log);
    const artifacts = path.dirname(worktree), report = JSON.parse(fs.readFileSync(artifacts + '/result.json')), events = JSON.parse(fs.readFileSync(artifacts + '/tool-events.json'));
    assert.ok(!JSON.stringify(events).includes('Type compatibility observation'));
    assert.equal(report.termination.verified, true); assert.equal(git('diff'), originalDiff); assert.equal(git('status', '--porcelain'), originalStatus); assert.equal(hash(fs.readFileSync(project + '/.git/index')), originalIndex);
    let evidence = {mode, installed, requests, received, finalReceipt, terminalStatus: report.status, terminationVerified: true, originalCheckoutAndIndexUnchanged: true};
    if (mode === 'off') {assert.equal(report.typeCompatibility, undefined); assert.ok(!fs.existsSync(artifacts + '/type-compat.json'));}
    else {
      const diagnostic = JSON.parse(fs.readFileSync(artifacts + '/type-compat.json'));
      const expected = mode === 'no-command' ? 0 : mode === 'allowed-break' ? 1 : 2;
      assert.equal(diagnostic.runs.length, expected, JSON.stringify(diagnostic));
      if (expected === 2) assert.ok(received && finalReceipt);
      if (mode === 'allowed-break') {assert.equal(diagnostic.runs[0].status, 'reproduced-incompatibility'); assert.ok(fs.readFileSync(worktree + '/index.d.ts', 'utf8').includes(narrowNew));}
      evidence = {...evidence, baselinePreparationMs: diagnostic.baselinePreparationMs, baselineInputBytes: diagnostic.baselineInputBytes, diagnosticStatus: diagnostic.status, current: diagnostic.current, analyses: diagnostic.runs.map(r => ({status: r.status, snapshot: r.snapshot, baselineSnapshot: r.baselineSnapshot, cost: r.cost, process: r.process, consumers: r.consumers?.map(c => ({sha256: c.sha256, status: c.status, route: c.route}))}))};
    }
    const patch = fs.readFileSync(artifacts + '/terminal.patch', 'utf8');
    assert.ok(!patch.includes('/work/') && !patch.includes('/repo/') && !patch.includes('.git/harness-task'));
    const clone = base + '/portable'; run('git', ['clone', '--quiet', '--no-hardlinks', project, clone], base); run('git', ['apply', artifacts + '/terminal.patch'], clone);
    assert.ok(fs.existsSync(clone + '/types.test.ts'), JSON.stringify({mode, events: events.map(e => ({tool:e.tool,state:e.state,exit:e.exit,output:e.output.slice(-1200)})),patch, status:report.status}));
    const portableOutput = run('npm', ['test'], clone, env);
    if (emitter) {assert.match(portableOutput, /[0-9]+ passing/); evidence.upstreamMocha = portableOutput.match(/([0-9]+) passing/)[1] + ' passing';}
    if (emitter && mode !== 'off') {
      // Removing new contextual typing cannot satisfy the new-feature acceptance.
      const saved = fs.readFileSync(clone + '/index.d.ts', 'utf8');
      write(clone + '/index.d.ts', saved.replace(signature, ''));
      const negative = spawnSync('npm', ['test'], {cwd: clone, env, encoding: 'utf8'}); assert.notEqual(negative.status, 0); assert.match(negative.stdout, /subscribe/);
      write(clone + '/index.d.ts', saved);
      write(clone + '/negative.ts', "import E from './index'; const e = new E<{sample:[string]}, {marker:string}>(); e.subscribe('sample', (n: number) => {}, {marker:'ok'});\n");
      const wrongArgument = spawnSync(base + '/bin/tsc', [...typeFlags.split(' '), 'negative.ts'], {cwd: clone, env, encoding: 'utf8'}); assert.notEqual(wrongArgument.status, 0); assert.match(wrongArgument.stdout, /2345/);
    }
    assert.equal(hash(fs.readFileSync(compilerRoot + '/lib/typescript.js')), compilerBefore);
    evidence.portableChecks = 'passed'; evidence.patchSha256 = hash(patch); results.push(evidence);
    console.log(JSON.stringify({completed: evidence}));
  } catch (e) {console.error(log.slice(-12000)); throw e;}
  finally {server.kill('SIGTERM'); await new Promise(r => server.once('close', r)); await new Promise(r => provider.close(r));}
  fs.rmSync(base, {recursive: true, force: true});
}
console.log(JSON.stringify({installed: '1.18.26', platform: 'Linux', network: 'none, loopback scripted provider only', realProviderCalls: 0, results}));
