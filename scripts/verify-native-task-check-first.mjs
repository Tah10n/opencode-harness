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
  verifyTaskResultPresentation();
  return { passed: true, checkFirst: true, direct: true, compactDelivery: true, realProviderRequests: 0 };
} finally { fs.rmSync(root, { recursive: true, force: true }); }
}

function verifyTaskResultPresentation() {
  const check = { command: 'node --test', exit: 0, state: 'completed', current: true, successful: true,
    execution: {status: 'completed_exit_0'}, interpretation: {status: 'supported'},
    output: 'test output\n'.repeat(20000), before: 'state', after: 'state' };
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
  const delivered = taskResultText(original, details);
  assert.match(delivered, /^Saved terminal patch: \/artifacts\/terminal.patch/);
  assert.ok(delivered.indexOf('Saved terminal patch:') < delivered.indexOf('Workflow status: incomplete'));
  assert.match(delivered, /Unsupported command failed/);
  assert.doesNotMatch(delivered, /Original checkout unchanged|task fully complete|task correctness certified/i);

  const unsupported = {...check, command: 'npm test', successful: false, interpretation: {status: 'unsupported'}};
  const unsupportedResult = {...original, observations: {latestChecks: [unsupported]},
    remaining: ['Runner interpretation unconfirmed: npm test'], limits: ['Unsupported runner'],
    stopReason: 'No actionable corrective feedback remains; unresolved verification and limitations are retained.'};
  const unsupportedText = taskResultText(unsupportedResult, details);
  assert.match(unsupportedText, /Commands completed on the terminal captured state/);
  assert.match(unsupportedText, /"npm test".*exit 0/);
  assert.match(unsupportedText, /Internal runner results not interpreted/);
  assert.doesNotMatch(unsupportedText, /npm test[^\n]*(?:failed|PASS)/);
  assert.match(unsupportedText, /Corrective passes: 0\. No actionable/);

  const failed = {...check, command: 'npm run lint', exit: 2, successful: false, execution: {status: 'completed_nonzero'}};
  const stale = {...check, command: 'npm test', current: false};
  const failing = {...original, completedCommands: [], observations: {latestChecks: [failed, stale],
    unclassifiedFailures: [{command: 'opaque-check', state: 'error', exit: null}],
    requiredChecks: [{command: 'npm run typecheck', workdir: '.', observed: false, executionStatus: 'not_started'}]}};
  const failingText = taskResultText(failing, details);
  assert.match(failingText, /"npm run lint".*nonzero.*exit 2/);
  assert.match(failingText, /"npm test".*stale/);
  assert.match(failingText, /"opaque-check".*unconfirmed/);
  assert.match(failingText, /"npm run typecheck".*not started/);

  for (const reason of ['Total time budget exhausted', 'Native cancellation requested']) {
    const cancelled = taskResultText({...original, status: 'cancelled', limits: [reason]}, details);
    assert.match(cancelled, /^Saved patch at stop \(partial\/unverified\):/);
    assert.match(cancelled, /cancelled or reached its deadline/);
    assert.ok(cancelled.includes(reason));
  }
  const stopped = {...original, terminalReason: {kind: 'tool_state_unknown', message: 'Conflicting terminal native tool events'},
    termination: {verified: false}};
  const stoppedText = taskResultText(stopped, details);
  assert.match(stoppedText, /^Saved patch reference \(termination unverified\):/);
  assert.match(stoppedText, /Conflicting terminal native tool events/);
  assert.match(stoppedText, /Native tool termination: unverified/);
  assert.doesNotMatch(stoppedText, /Saved terminal patch:|patch ready/i);
  const unavailable = taskResultText({...stopped, terminalPatch: null, patches: ['D0.patch']}, details);
  assert.match(unavailable, /Stage patch references.*D0.patch/);

  const missing = taskResultText({}, {});
  assert.match(missing, /patch reference unavailable/);
  assert.match(missing, /Corrective passes: not recorded/);
  assert.match(missing, /termination: not recorded/);
  assert.match(missing, /Remaining work:\n- Not recorded/);
  assert.doesNotMatch(missing, /undefined|Corrective passes: 0|exit undefined|checks_passed/);
  assert.doesNotThrow(() => taskResultText({typeCompatibility: {status: 'NOT RUN'}}, {}));
  assert.doesNotMatch(taskResultText({...original, completedCommands: [{command: 'unknown'}]}, details), /"unknown".*exit 0/);

  const large = compactTaskResult({...original,authorSummary:'long explanation'.repeat(10000)},details);
  assert.ok(Buffer.byteLength(JSON.stringify(large)) < 16000);assert.ok(large.detailOmitted);assert.equal(large.limitationCount,1);assert.equal(large.terminalPatch,original.terminalPatch);
  const huge = {...stopped, stopReason: 'STOP_SENTINEL '+ 'long explanation'.repeat(10000),
    authorSummary: 'long author explanation'.repeat(10000), remaining: ['MISSING_SENTINEL', ...Array(1000).fill('unfinished'.repeat(1000))],
    limits: ['WARNING_SENTINEL', ...Array(1000).fill('warning'.repeat(1000))],
    observations: {latestChecks: Array(100).fill({...failed, output: 'PRIVATE_OUTPUT_SENTINEL'.repeat(1000)})}};
  const hugeBefore = JSON.stringify(huge), hugeSummary = compactTaskResult(huge, details), hugeText = taskResultText(huge, details);
  assert.ok(Buffer.byteLength(JSON.stringify(hugeSummary)) <= 16000);
  assert.ok(Buffer.byteLength(hugeText) <= 16000);
  for (const value of ['STOP_SENTINEL', 'MISSING_SENTINEL', 'WARNING_SENTINEL', stopped.terminalReason.message,
    'termination unverified', '/artifacts/result.json', '/artifacts/tool-events.json', '/artifacts/terminal.patch']) assert.ok(hugeText.includes(value), value);
  assert.ok(hugeSummary.stopReason.includes('STOP_SENTINEL'));
  assert.equal(hugeSummary.terminalReason.message, stopped.terminalReason.message);
  assert.ok(hugeSummary.limits.includes('WARNING_SENTINEL'));
  assert.ok(!JSON.stringify(hugeSummary).includes('PRIVATE_OUTPUT_SENTINEL'));
  assert.ok(!hugeText.includes('PRIVATE_OUTPUT_SENTINEL'));
  assert.equal(JSON.stringify(huge), hugeBefore, 'Formatting must preserve the retained report');
  const unicodeText = taskResultText({...huge, authorSummary: '😀'.repeat(20000), limits: ['WARNING_SENTINEL', '😀'.repeat(20000)]}, details);
  assert.ok(Buffer.byteLength(unicodeText) <= 16000, 'The output limit is in UTF-8 bytes');
  const longArtifacts = '/' + Array(19).fill('p'.repeat(200)).join('/') + '/' + 'p'.repeat(79);
  const longDetails = {artifacts: longArtifacts, executionDirectory: longArtifacts + '/worktree'};
  const longResult = {...huge, terminalPatch: longArtifacts + '/terminal.patch'};
  const longText = taskResultText(longResult, longDetails), longSummary = compactTaskResult(longResult, longDetails);
  assert.ok(Buffer.byteLength(longText) <= 16000, 'Valid long Linux paths must not hide warnings or exceed the limit');
  for (const value of [longArtifacts, 'terminal.patch', 'worktree', 'result.json', 'tool-events.json',
    'STOP_SENTINEL', 'MISSING_SENTINEL', 'WARNING_SENTINEL', stopped.terminalReason.message]) assert.ok(longText.includes(value), value);
  assert.ok(Buffer.byteLength(JSON.stringify(longSummary)) <= 16000);
  assert.equal(longSummary.terminalPatch, longResult.terminalPatch, 'Machine artifact paths must not be abbreviated');
  assert.ok(longSummary.remaining.some(r => r.includes('MISSING_SENTINEL')));
  assert.ok(longSummary.limits.some(r => r.includes('WARNING_SENTINEL')));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(JSON.stringify(await verifyCheckFirst()));
