// Installed native-session workflow fixture: control-flow evidence, zero model-quality claims.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { materializeNativeTemplate } from '../lib/native-template.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'native-task-fixture-'));
for (const name of ['home', 'config', 'data', 'cache', 'state', 'project']) fs.mkdirSync(path.join(temp, name));
const project = path.join(temp, 'project'), bundle = path.join(temp, 'bundle'), task = path.join(temp, 'task.txt');
const git = (...args) => { const r = spawnSync('git', args, { cwd: project, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
git('init', '-q');
fs.writeFileSync(path.join(project, 'value.mjs'), 'export const value = 2;\n');
fs.writeFileSync(path.join(project, 'value.test.mjs'), "import {value} from './value.mjs'; import assert from 'node:assert/strict'; import {test} from 'node:test'; test('public requirement',()=>assert.equal(value,2));\n");
fs.writeFileSync(path.join(project, 'opencode.json'), JSON.stringify({ permission: { task: 'allow', bash: 'allow' } }));
git('add', '.'); git('-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '-qm', 'base');
materializeNativeTemplate({ repositoryRoot: root, outputDirectory: bundle, task: true, review: true });
let mode = 'correct', counts = new Map(), requests = [], reproductionID = '';
const response = (res, call, content = '') => {
  if (call?.name === 'StructuredOutput') { content = JSON.stringify(call.args); call = null; }
  const delta = call ? { role: 'assistant', tool_calls: [{ index: 0, id: call.id ?? `fixture-${requests.length}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } }] } : { role: 'assistant', content };
  const base = { id: `response-${requests.length}`, object: 'chat.completion.chunk', created: 1, model: 'fixture' };
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.end(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`);
};
const finding = { id: 'F1', classification: 'concrete', basis: 'Original task requires value 2', files: ['value.mjs'], reproduction: 'node --test value.test.mjs', expected: '2' };
const fixture = http.createServer(async (req, res) => {
  const chunks = []; for await (const x of req) chunks.push(x);
  const body = JSON.parse(Buffer.concat(chunks));
  if (!body.tools?.length) { response(res, null, 'Task fixture'); return; }
  const user = body.messages.findLast(m => m.role === 'user');
  const userText = typeof user?.content === 'string' ? user.content : user?.content?.map(p => p.text ?? '').join('\n') ?? '';
  const stage = userText.includes('Investigate the concrete') ? 'reproduce' : userText.includes('Repair ONLY') ? 'repair' : (userText.includes('Review current delivery') || userText.includes('Re-review the ACTUAL')) ? 'review' : userText.includes('Implement the complete original') ? 'implementation' : 'bootstrap';
  const key = mode + stage, n = counts.get(key) ?? 0; counts.set(key, n + 1);
  requests.push({ mode, stage, n, tools: body.tools.map(t => t.function.name) });
  const bash = command => ({ name: 'bash', args: { command, description: 'Installed workflow fixture command' } });
  if (stage === 'bootstrap') { response(res, n === 0 ? { name: 'harness_task', args: {} } : null, 'Workflow result retained; see tool output.'); return; }
  if (stage === 'implementation') {
    if (n === 0) { response(res, bash(mode === 'defect' ? "printf 'export const value = 1;\\n' > value.mjs" : 'node --test value.test.mjs')); return; }
    if (mode === 'coverage-loss' && n === 1) { response(res, bash("printf 'import {test} from \"node:test\"; test(\"replacement only\",()=>{});\\n' > value.test.mjs")); return; }
    if (mode === 'last-mutation' && n === 1) { response(res, bash("printf 'export const value = 2; // later mutation\\n' > value.mjs")); return; }
    if (mode === 'concurrent-save' && n === 1) { response(res, bash("sleep 1; printf 'export const value = 2;\\n' > value.mjs; node --test value.test.mjs")); return; }
    if (mode === 'cancel' && n === 1) { response(res, bash('sleep 10')); return; }
    response(res, null, 'Implementation stage ended.'); return;
  }
  if (stage === 'review') {
    assert.ok(!body.tools.some(t => ['bash', 'edit', 'write', 'task', 'todowrite', 'harness_task'].includes(t.function.name)));
    assert.ok(userText.includes('ORIGINAL_TASK_FIXTURE'));
    const info = JSON.parse(userText.split('\nReturn only')[0]);
    const lastCheck = info.toolEvidence?.findLast(e => e.args?.command === 'node --test value.test.mjs' && e.exit === 0);
    if (mode === 'coverage-loss') assert.ok(info.current.diff.includes('replacement only'));
    const hasDefect = mode === 'defect' && !requests.some(r => r.mode === mode && r.stage === 'repair');
    const unsupported = mode === 'unsupported' && n === 0;
    response(res, { name: 'StructuredOutput', args: {
      findings: hasDefect || unsupported ? [{ ...finding, ...(unsupported ? { expected: '3', basis: 'Unsubstantiated reviewer assumption' } : {}) }] : [],
      obligations: [{ requirement: 'Return 2 and preserve test', status: mode === 'incomplete' || hasDefect ? 'missing' : 'delivered', evidence: 'Inspected source and supplied native tool events' }],
      checks: lastCheck ? [{callID:lastCheck.callID,purpose:'preservation',basis:'Runs the existing public Node test'}, {callID:lastCheck.callID,purpose:'discriminating',basis:'The same suite asserts value 2 and failed on D0'}] : [], verificationFiles: ['value.test.mjs'],
      unverified: [], coverageLost: mode === 'coverage-loss' ? ['Old fixture was replaced; requirement not preserved'] : [],
    } }); return;
  }
  if (stage === 'reproduce') {
    if (mode === 'defect' && n === 0) { const call = bash('node --test value.test.mjs'); call.id = `reproduce-${requests.length}`; reproductionID = call.id; response(res, call); return; }
    response(res, { name: 'StructuredOutput', args: { dispositions: [{ id: 'F1', decision: mode === 'unsupported' ? 'rejected' : 'grounded', basis: 'Task explicitly requires 2', expectedReason: 'Literal public requirement, not model confidence', reproductionCallID: reproductionID, checkKind: 'behavior', explanation: 'Observed the native command result' }], limitations: [] } }); return;
  }
  if (stage === 'repair') {
    if (n === 0) { response(res, bash("printf 'export const value = 2;\\n' > value.mjs")); return; }
    if (n === 1) { response(res, bash('node --test value.test.mjs')); return; }
    response(res, null, 'Repair finished after final checks.');
  }
});
await new Promise(r => fixture.listen(0, '127.0.0.1', r));
const probe = http.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); const port = probe.address().port; await new Promise(r => probe.close(r));
const config = { model: 'local-fixture/fixture', small_model: 'local-fixture/fixture', provider: { 'local-fixture': { npm: '@ai-sdk/openai-compatible', name: 'Scripted fixture', options: { baseURL: `http://127.0.0.1:${fixture.address().port}/v1`, apiKey: 'not-a-credential' }, models: { fixture: { name: 'fixture', limit: { context: 200000, output: 10000 } } } } } };
const env = { PATH: process.env.PATH, HOME: path.join(temp, 'home'), TMPDIR: os.tmpdir(), ...Object.fromEntries(['config', 'data', 'cache', 'state'].map(n => [`XDG_${n.toUpperCase()}_HOME`, path.join(temp, n)])), OPENCODE_DISABLE_MODELS_FETCH: 'true', OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_CONFIG_DIR: bundle, OPENCODE_CONFIG_CONTENT: JSON.stringify(config), HARNESS_TASK_FILE: task, HARNESS_TASK_TIMEOUT_MS: '45000' };
const child = spawn(process.env.OPENCODE_BIN ?? 'opencode', ['serve', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = ''; child.stderr.on('data', x => { stderr += x; fs.writeFileSync(path.join(temp, 'server.log'), stderr); }); child.stdout.resume();
const api = async (method, route, body) => { const r = await fetch(`http://127.0.0.1:${port}${route}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) }); if (!r.ok) throw Error(await r.text()); return r.json(); };
try {
  let ready = false; for (let n = 0; n < 150; n++) { try { await api('GET', '/global/health'); ready = true; break; } catch { await new Promise(r => setTimeout(r, 100)); } } assert.ok(ready, stderr);
  const commands = await api('GET', '/command'); assert.ok(commands.some(c => c.name === 'harness-task'));
  for (mode of ['correct', 'defect', 'unsupported', 'coverage-loss', 'last-mutation', 'cancel', 'incomplete', 'concurrent-save', 'staged-work']) {
    fs.writeFileSync(path.join(project, 'value.mjs'), 'export const value = 2;\n');
    fs.writeFileSync(path.join(project, 'value.test.mjs'), git('show','HEAD:value.test.mjs') + '\n');
    fs.writeFileSync(task, 'ORIGINAL_TASK_FIXTURE: Deliver value 2 from value.mjs and preserve the existing public test. Run node --test value.test.mjs.');
    if (mode === 'staged-work') { fs.writeFileSync(path.join(project,'value.mjs'),'export const value = 2; // staged\n');git('add','value.mjs');fs.writeFileSync(path.join(project,'value.mjs'),'export const value = 2; // partial user work\n'); }
    // Native OpenCode may refresh index stat metadata; compare staged entries/contents.
    const originalIndex=git('ls-files','--stage','-z');
    const session = await api('POST', '/session', {});
    const pending = api('POST', `/session/${session.id}/command`, { command: 'harness-task', arguments: '', model: 'local-fixture/fixture' });
    if (mode === 'concurrent-save') {
      for (let n = 0; n < 150 && !requests.some(r => r.mode === mode && r.stage === 'implementation' && r.n === 1); n++) await new Promise(r => setTimeout(r, 100));
      fs.writeFileSync(path.join(project,'value.mjs'),'export const value = 99; // USER_SAVE\n');
    }
    if (mode === 'cancel') {
      for (let n = 0; n < 150 && !requests.some(r => r.mode === 'cancel' && r.stage === 'implementation' && r.n === 1); n++) await new Promise(r => setTimeout(r, 100));
      await api('POST', `/session/${session.id}/abort`, {});
    }
    const result = await pending;
    const messages = await api('GET', `/session/${session.id}/message`);
    fs.writeFileSync(path.join(temp, `${mode}-messages.json`), JSON.stringify(messages, null, 2));
    const toolResult = messages.flatMap(m => m.parts).find(p => p.type === 'tool' && p.tool === 'harness_task');
    if (mode === 'cancel') { assert.ok(!requests.some(r => r.mode === mode && r.stage === 'review')); continue; }
    assert.equal(toolResult?.state.status, 'completed', JSON.stringify({ result, toolResult, temp }));
    const report = JSON.parse(toolResult.state.output);
    assert.equal(git('ls-files','--stage','-z'),originalIndex);
    if (mode === 'staged-work') { assert.equal(report.status,'reviewed_delivery',JSON.stringify(report));assert.equal(fs.readFileSync(path.join(project,'value.mjs'),'utf8'),'export const value = 2; // partial user work\n');git('restore','--staged','value.mjs'); }
    if (mode === 'concurrent-save') assert.equal(fs.readFileSync(path.join(project,'value.mjs'),'utf8'),'export const value = 99; // USER_SAVE\n');
    if (mode === 'correct') { assert.equal(report.repairs, 0); assert.equal(report.status, 'reviewed_delivery'); }
    if (mode === 'defect') { assert.equal(report.repairs, 1, JSON.stringify(report)); assert.equal(report.status, 'reviewed_delivery'); assert.equal(fs.readFileSync(path.join(report.executionDirectory, 'value.mjs'), 'utf8'), 'export const value = 2;\n'); }
    if (mode === 'unsupported') { assert.equal(report.repairs, 0); assert.equal(report.dispositions[0].decision, 'rejected'); }
    if (mode === 'coverage-loss') assert.ok(report.review.coverageLost.length);
    if (['last-mutation', 'incomplete'].includes(mode)) assert.equal(report.status, 'incomplete');
    console.log(JSON.stringify({ mode, status: report.status, repairs: report.repairs, artifacts: report.artifacts }));
  }
  console.log(JSON.stringify({ passed: true, installedWorkflow: true, scenarios: 9, realProviderRequests: 0, scriptedRequests: requests.length, temp }));
} finally {
  if (child.exitCode === null) await new Promise(resolve => { const timer = setTimeout(() => child.kill('SIGKILL'), 3000); child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill('SIGTERM'); });
  fixture.closeAllConnections(); await new Promise(r => fixture.close(r));
}
