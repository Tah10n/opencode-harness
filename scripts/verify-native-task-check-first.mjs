import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { runWorkflow } from '../lib/native-task-workflow.mjs';
import { compactTaskResult, taskResultText } from '../lib/native-task-plugin.mjs';

export async function verifyCheckFirst() {
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-check-first-'));
try {
  for (const failure of [null, 'preparation-error', 'denial', 'deadline', 'implementation-error', 'stale']) {
    const dir = path.join(root, failure ?? 'success'); fs.mkdirSync(dir);
    const source = path.join(dir, 'api.cjs');
    fs.writeFileSync(source, 'exports.value = () => 7; exports.legacy = () => 3;\n');
    fs.writeFileSync(path.join(dir, 'legacy.test.cjs'), "const {test}=require('node:test');const assert=require('node:assert/strict');test('legacy consumer',()=>assert.equal(require('./api.cjs').legacy(),3));\n");
    const initial = fs.readFileSync(source, 'utf8');
    const calls = [], saved = new Map(); let active = true, checks = 0, observed = false;
    const original = 'Change value to 8 including omitted arguments; preserve legacy()=3; deliver a public regression and docs. FULL_ORIGINAL_SENTINEL';
    const capture = () => ({ status: 'captured', task: original, diff: fs.readFileSync(source, 'utf8'), snapshotSha256: fs.readFileSync(source, 'utf8') + (observed && failure === 'stale' ? 'external' : '') });
    const result = await runWorkflow({
      capture, save: (name, value) => saved.set(name, value), messages: async role => [{ role }],
      checkActive: () => { if (!active) throw Error('deadline'); }, aborted: () => !active,
      terminalReason: () => failure === 'denial' && calls.length ? { kind: 'permission_denied', message: 'forbidden' } : null,
      observe: () => { observed = true; return { reasons: checks ? [] : ['missing'], limits: [], checksCurrent: !!checks }; },
      prompt: async (role, prompt) => {
        calls.push(role); assert.equal(role, 'author'); assert.ok(prompt.includes(original));
        if (calls.length === 1) {
          assert.match(prompt, /before implementing production changes/);
          fs.writeFileSync(path.join(dir, 'api.test.cjs'), "const {test}=require('node:test');const assert=require('node:assert/strict');test('omitted argument through public consumer',()=>assert.equal(require('./api.cjs').value(),8));\n");
          const red = spawnSync(process.execPath, ['--test'], { cwd: dir, encoding: 'utf8' });
          assert.equal(red.status, 1); assert.match(red.stdout, /7 !== 8/);
          assert.equal(fs.readFileSync(source, 'utf8'), initial);
          if (failure === 'deadline') active = false;
          if (failure === 'preparation-error' || failure === 'denial') return { info: { error: { name: 'failed' } } };
        } else {
          assert.match(prompt, /same session/); assert.match(prompt, /generated test is a hypothesis/);
          fs.writeFileSync(source, 'exports.value = () => 8; exports.legacy = () => 3;\n');
          fs.writeFileSync(path.join(dir, 'README.md'), 'value() returns 8, including when called without arguments. legacy() remains 3.\n');
          assert.equal(spawnSync(process.execPath, ['--test'], { cwd: dir }).status, 0); checks++;
          if (failure === 'implementation-error') return { info: { error: { name: 'quota' } } };
        }
        return { info: { finish: 'stop' }, parts: [{ type: 'text', text: 'Actual project checks recorded.' }] };
      },
    }, { strategy: 'check-first' });
    assert.deepEqual(calls, ['preparation-error', 'denial', 'deadline'].includes(failure) ? ['author'] : ['author', 'author']);
    assert.equal(result.status, failure === 'deadline' ? 'cancelled' : failure ? 'incomplete' : 'checks_passed');
    assert.equal(result.repairs, 0);
    if (!failure) { assert.equal(saved.get('regressions.patch'), initial); assert.match(saved.get('D0.patch'), /value = \(\) => 8/); assert.equal(saved.get('D0.patch'), saved.get('final.patch')); }
    if (failure === 'denial') assert.equal(result.terminalReason.kind, 'permission_denied');
  }
  for (const failure of [null, 'red', 'denial', 'deadline', 'stage-error', 'stale']) {
    const dir = path.join(root, `direct-${failure ?? 'success'}`); fs.mkdirSync(dir);
    const source = path.join(dir, 'api.cjs');
    fs.writeFileSync(source, 'exports.value = () => 7; exports.legacy = () => 3;\n');
    const original = 'Change public value to8; preserve legacy3; deliver tests and docs. DIRECT_FULL_ORIGINAL';
    const calls = [], saved = new Map(); let active = true, checked = false, observed = false;
    const capture = () => ({ status: 'captured', task: original, diff: fs.readFileSync(source, 'utf8'), snapshotSha256: fs.readFileSync(source, 'utf8') + (observed && failure === 'stale' ? 'external' : '') });
    const result = await runWorkflow({
      capture, save: (name, value) => saved.set(name, value), messages: async role => [{ role }],
      checkActive: () => { if (!active) throw Error('deadline'); }, aborted: () => !active,
      terminalReason: () => failure === 'denial' ? { kind: 'permission_denied', message: 'forbidden' } : null,
      observe: () => { observed = true; return { reasons: checked ? [] : ['Public regression still fails'], limits: [], checksCurrent: checked, testChanges: [] }; },
      prompt: async (role, prompt) => {
        calls.push(role); assert.equal(role, 'author'); assert.ok(prompt.includes(original));
        assert.ok(prompt.includes('state the action will actually use immediately before'));
        fs.writeFileSync(path.join(dir, 'api.test.cjs'), "const {test}=require('node:test');const assert=require('node:assert/strict');test('public consumer',()=>assert.equal(require('./api.cjs').value(),8));test('legacy consumer',()=>assert.equal(require('./api.cjs').legacy(),3));\n");
        const red = spawnSync(process.execPath, ['--test'], { cwd: dir, encoding: 'utf8' });
        assert.equal(red.status, 1); assert.match(red.stdout, /7 !== 8/);
        if (failure === 'denial' || failure === 'stage-error') return { info: { error: { name: 'failed' } } };
        if (failure !== 'red') {
          fs.writeFileSync(source, 'exports.value = () => 8; exports.legacy = () => 3;\n');
          fs.writeFileSync(path.join(dir, 'README.md'), 'value() returns8 and legacy() remains3.\n');
          assert.equal(spawnSync(process.execPath, ['--test'], { cwd: dir, encoding: 'utf8' }).status, 0); checked = true;
        }
        if (failure === 'deadline') active = false;
        return { info: { finish: 'stop' }, parts: [{ type: 'text', text: 'Actual project checks recorded.' }] };
      },
    }, { strategy: 'direct' });
    assert.deepEqual(calls, ['author'], 'Direct never adds preparation or corrective replies');
    assert.equal(result.revision, 'direct'); assert.equal(result.repairs, 0);
    assert.equal(result.status, failure === 'deadline' ? 'cancelled' : failure ? 'incomplete' : 'checks_passed');
    assert.ok(!saved.has('regressions.patch')); assert.ok(!result.stopReason, 'No invented three-pass exhaustion');
    if (!failure) { assert.equal(saved.get('D0.patch'), saved.get('final.patch')); assert.match(saved.get('final.patch'), /value = \(\) => 8/); }
    if (failure === 'red') assert.deepEqual(result.remaining, ['Public regression still fails']);
    if (failure === 'denial') assert.equal(result.terminalReason.kind, 'permission_denied');
  }
  const check = { command: 'node --test', exit: 0, current: true, output: 'test output\n'.repeat(20000), before: 'state', after: 'state' };
  const original = { status: 'incomplete', repairs: 0, termination: { verified: true }, terminalPatch: '/artifacts/terminal.patch',
    completedCommands: [{command:'npm test',exit:0}], remaining: ['Missing required consumer'], limits: ['Unsupported command failed'],
    observations: { checks: [check], latestChecks: [check], unclassifiedFailures: [{command:'npm run lint',exit:1,output:'real failure'.repeat(10000)}], testChanges: [{path:'test.mjs',before:'old'.repeat(10000),after:'new'.repeat(10000)}] } };
  const retained = JSON.stringify(original), details = {artifacts:'/artifacts',executionDirectory:'/delivery'};
  const summary = compactTaskResult(original, details);
  assert.ok(Buffer.byteLength(JSON.stringify(summary)) < 16000);
  assert.deepEqual(summary.remaining,original.remaining); assert.deepEqual(summary.limits,original.limits);
  assert.equal(summary.observations.latestChecks[0].current,true); assert.equal(summary.observations.unclassifiedFailures[0].exit,1);
  assert.equal(JSON.stringify(original),retained,'Projection must not mutate retained report');
  assert.match(taskResultText(original,details), /npm test/); assert.match(taskResultText(original,details), /Missing required consumer/);
  assert.match(taskResultText({...original,terminalPatch:null},details), /unavailable/);
  const large = compactTaskResult({...original,authorSummary:'long explanation'.repeat(10000)},details);
  assert.ok(Buffer.byteLength(JSON.stringify(large)) < 16000);assert.ok(large.detailOmitted);assert.equal(large.limitationCount,1);assert.equal(large.terminalPatch,original.terminalPatch);
  return { passed: true, checkFirst: true, direct: true, compactDelivery: true, realProviderRequests: 0 };
} finally { fs.rmSync(root, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(JSON.stringify(await verifyCheckFirst()));
