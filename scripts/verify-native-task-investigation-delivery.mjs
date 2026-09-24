import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {investigationDeliverySummary, inspectInvestigation, investigationReplyBytes} from '../lib/native-task-investigation.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'investigation-delivery-'));
const save = (name, value) => fs.writeFileSync(path.join(root, name), value, {mode: 0o600});
const inspect = (delivery, section, callID, cursor) => inspectInvestigation({delivery, artifacts: root, section, callID, cursor});
const bounded = value => assert.ok(Buffer.byteLength(JSON.stringify(value)) <= investigationReplyBytes);
const collect = (delivery, section, callID) => {
  let cursor, text = '', pages = 0, previous = -1, hash;
  do {
    const response = inspect(delivery, section, callID, cursor);
    assert.equal(response.status, 'page'); bounded(response);
    assert.ok(response.content.split('\n').length <= 61);
    assert.ok(!response.content.includes('\ufffd'));
    assert.ok(response.offset > previous); previous = response.offset;
    if (hash) assert.equal(response.sha256, hash);
    hash = response.sha256; text += response.content; cursor = response.nextCursor; pages++;
    assert.equal(response.complete, cursor === null);
  } while (cursor);
  assert.equal(sha(text), hash);
  return {text, pages};
};
try {
  assert.equal(inspect(null, 'patch').status, 'no-result');
  const patch = 'diff --git a/legacy.test.mjs b/legacy.test.mjs\n' +
    ('+test("😀 雪", () => assert.equal(legacy(), 7));\n').repeat(550);
  const bigOutput = '😀'.repeat(15_000);
  const multiOutput = ('error: expected 7, received 8\n').repeat(1200);
  const delivery = {authorSnapshot: 'a'.repeat(64), usable: true, patch,
    explanation: 'Child hypothesis: legacy() must remain 7.\n' + 'reasoning\n'.repeat(400),
    commands: [
      ...Array.from({length: 60}, (_, i) => ({callID: `noise-${i}`, tool: 'read', state: 'completed', output: 'x'.repeat(4000)})),
      {callID: 'check-1', tool: 'bash', state: 'completed', exit: 1, args: {command: 'node --test legacy.test.mjs'}, output: multiOutput},
      {callID: 'sense-1', tool: 'harness_sense', state: 'completed', args: {path: 'value.mjs'}, output: '{"diagnostic":"child only"}'},
      {callID: 'unknown-runner', tool: 'bash', state: 'completed', exit: 2, args: {command: 'custom-runner --cases public'}, output: 'runner exit 2; failure count unknown'},
      {callID: 'check-2', tool: 'bash', state: 'completed', exit: 0, args: {command: 'node --test existing.test.mjs'}, output: bigOutput},
    ], elapsedMs: 100, remainingTaskMs: 500000, remainingDiagnosticMs: 180000};
  save('investigation-result.json', JSON.stringify(delivery));
  save('investigation-tests.patch', patch);
  const receipt = investigationDeliverySummary(delivery);
  bounded(receipt); assert.equal(receipt.proposedTestPatch, true);
  assert.deepEqual(receipt.patch.files, ['legacy.test.mjs']);
  assert.equal(receipt.patch.sha256, sha(patch));
  assert.equal(receipt.observedChecks.at(-3).exit, 1);
  assert.equal(receipt.observedChecks.at(-2).state, 'completed');
  assert.equal(receipt.observedChecks.at(-1).exit, 0);
  assert.ok(!JSON.stringify(receipt).includes(bigOutput.slice(0, 1000)));
  const inspectedPatch = collect(delivery, 'patch');
  assert.equal(inspectedPatch.text, patch); assert.ok(inspectedPatch.pages > 1);
  assert.equal(collect(delivery, 'explanation').text, delivery.explanation);
  const checks = JSON.parse(collect(delivery, 'checks').text);
  assert.deepEqual(checks.map(x => x.callID), ['check-1', 'sense-1', 'unknown-runner', 'check-2']);
  assert.equal(checks[2].checkCandidate, false);
  assert.equal(collect(delivery, 'output', 'check-1').text, multiOutput);
  assert.equal(collect(delivery, 'output', 'sense-1').text, '{"diagnostic":"child only"}');
  assert.equal(collect(delivery, 'output', 'unknown-runner').text, 'runner exit 2; failure count unknown');
  assert.equal(collect(delivery, 'output', 'check-2').text, bigOutput);
  const first = inspect(delivery, 'patch');
  assert.equal(inspectInvestigation({delivery, artifacts: root, section: 'patch', currentSnapshot: 'changed'}).snapshotCurrent, false);
  assert.equal(inspectInvestigation({delivery, artifacts: root, section: 'patch', currentSnapshot: delivery.authorSnapshot}).snapshotCurrent, true);
  assert.equal(inspect(delivery, 'explanation', undefined, first.nextCursor).status, 'invalid-cursor');
  assert.equal(inspect(delivery, 'output', 'other-run').status, 'unavailable');
  assert.equal(inspect(delivery, 'patch', undefined, 'bad').status, 'invalid-cursor');
  const declined = {...delivery, disposition: 'declined'};
  assert.equal(inspect(declined, 'patch').status, 'page');
  const noPatch = {...delivery, usable: false, patch: '', limitation: 'Child check interrupted'};
  assert.equal(investigationDeliverySummary(noPatch).status, 'error');
  assert.equal(inspect(noPatch, 'patch').status, 'artifact-unavailable');
  save('investigation-result.json', JSON.stringify(noPatch));
  assert.equal(inspect(noPatch, 'patch').status, 'no-patch');
  assert.equal(investigationDeliverySummary({...noPatch, limitation: undefined}).status, 'incomplete');
  save('investigation-result.json', JSON.stringify(delivery));
  save('investigation-tests.patch', patch + 'tampered');
  assert.equal(inspect(delivery, 'patch').status, 'artifact-unavailable');
  fs.unlinkSync(path.join(root, 'investigation-tests.patch'));
  fs.symlinkSync('investigation-result.json', path.join(root, 'investigation-tests.patch'));
  assert.equal(inspect(delivery, 'patch').status, 'artifact-unavailable');
  fs.unlinkSync(path.join(root, 'investigation-result.json'));
  assert.equal(inspect(delivery, 'explanation').status, 'artifact-unavailable');
  console.log(JSON.stringify({passed: true, receiptBytes: Buffer.byteLength(JSON.stringify(receipt)), patchPages: inspectedPatch.pages,
    outputPages: collectOutputEstimate(bigOutput), realProviderCalls: 0}));
} finally { fs.rmSync(root, {recursive: true, force: true}); }

function collectOutputEstimate(content) { return Math.ceil(Buffer.byteLength(content) / 1024); }
