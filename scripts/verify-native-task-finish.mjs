import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runWorkflow } from '../lib/native-task-workflow.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-finish-'));
try {
  for (const failure of [null, 'author-error', 'denial', 'deadline', 'finisher-error', 'stale']) {
    const dir = path.join(root, failure ?? 'success'); fs.mkdirSync(dir);
    const source = path.join(dir, 'api.cjs');
    fs.writeFileSync(source, 'exports.value = () => 7;\n');
    const calls = [], saved = new Map(); let active = true, checks = 0, observed = false;
    const original = 'Change value to 8; preserve omitted arguments; deliver a public regression and docs. FULL_ORIGINAL_SENTINEL';
    const capture = () => ({ status: 'captured', task: original, diff: fs.readFileSync(source, 'utf8'), snapshotSha256: fs.readFileSync(source, 'utf8') + (observed && failure === 'stale' ? 'external' : '') });
    const result = await runWorkflow({
      capture, save: (name, value) => saved.set(name, value), messages: async role => [{ role }],
      checkActive: () => { if (!active) throw Error('deadline'); }, aborted: () => !active,
      terminalReason: () => failure === 'denial' && calls.length ? { kind: 'permission_denied', message: 'forbidden' } : null,
      observe: () => { observed = calls.length === 2; return { reasons: checks ? [] : ['missing'], limits: [], checksCurrent: !!checks }; },
      prompt: async (role, prompt) => {
        calls.push(role); assert.ok(prompt.includes(original));
        if (role === 'author') {
          assert.ok(!prompt.includes('state the action will actually use immediately before'));
          fs.writeFileSync(source, 'exports.value = x => x === undefined ? 7 : 8;\n');
          if (failure === 'deadline') active = false;
          if (failure === 'author-error' || failure === 'denial') return { info: { error: { name: 'failed' } } };
        } else {
          assert.equal(role, 'finisher'); assert.ok(!prompt.includes('AUTHOR_CLAIM'));
          assert.match(fs.readFileSync(source, 'utf8'), /undefined/);
          fs.writeFileSync(path.join(dir, 'api.test.cjs'), "const {test}=require('node:test');const assert=require('node:assert/strict');test('omitted argument',()=>assert.equal(require('./api.cjs').value(),8));\n");
          assert.notEqual(spawnSync(process.execPath, ['--test'], { cwd: dir }).status, 0);
          fs.writeFileSync(source, 'exports.value = () => 8;\n');
          assert.equal(spawnSync(process.execPath, ['--test'], { cwd: dir }).status, 0); checks++;
          if (failure === 'finisher-error') return { info: { error: { name: 'quota' } } };
        }
        return { info: { finish: 'stop' }, parts: [{ type: 'text', text: 'AUTHOR_CLAIM' }] };
      },
    }, { strategy: 'finish' });
    assert.deepEqual(calls, ['author-error', 'denial', 'deadline'].includes(failure) ? ['author'] : ['author', 'finisher']);
    assert.equal(result.status, failure === 'deadline' ? 'cancelled' : failure ? 'incomplete' : 'checks_passed');
    assert.equal(result.repairs, 0);
    if (!failure) { assert.ok(saved.get('D0.patch').includes('undefined')); assert.equal(saved.get('final.patch'), 'exports.value = () => 8;\n'); }
    if (failure === 'denial') assert.equal(result.terminalReason.kind, 'permission_denied');
  }
  console.log('Fresh completion: executable omitted-argument repair, full-task transfer, terminal boundaries and stale observation passed; zero provider requests.');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
