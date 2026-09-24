// Verification of this stopped stage, not a new experiment runner/evaluator.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const directory = new URL('./', import.meta.url);
const read = name => JSON.parse(fs.readFileSync(new URL(name, directory)));
const selection = read('selection.json'), results = read('RESULTS.json'), manifest = read('manifest.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(selection.runtimeSha, manifest.candidate);
assert.equal(results.candidate, manifest.candidate);
assert.equal(manifest.successfulFreeze, false);
assert.equal(results.outcome.successfulFreeze, false);
assert.equal(selection.baselineOnly, true);
assert.equal(selection.results.length, 6);
assert.equal(selection.realProviderRequests, 0);
assert.deepEqual(selection.results.map(r => r.name), manifest.sources.map(r => r.name));
for (const [name, digest] of Object.entries(selection.modules)) {
  assert.equal(sha(execFileSync('git', ['show', manifest.candidate + ':lib/' + name])), digest);
}
for (const row of selection.results) {
  assert.equal(row.commit, manifest.sources.find(s => s.name === row.name).commit);
  assert.equal(row.archiveSha256, manifest.sources.find(s => s.name === row.name).archiveSha256);
  if (!row.comparison) continue;
  assert.equal(row.comparison.process.terminationVerified, true);
  for (const consumer of row.comparison.consumers) {
    assert.equal(sha(consumer.text), consumer.sha256);
    assert.deepEqual(consumer.baseline, consumer.candidate);
  }
  assert.equal(row.admissibleConsumers, row.comparison.consumers.filter(c => c.status === 'no-difference-in-checked-scope').length);
}
assert.deepEqual(selection.results.filter(r => r.admissibleConsumers > 0).map(r => r.name), ['eventemitter2']);
const expected = ['A/1/P','A/1/H0','A/1/H1','B/1/H1','B/1/P','B/1/H0',
  'A/2/H0','A/2/H1','A/2/P','B/2/P','B/2/H0','B/2/H1'];
assert.deepEqual(results.rows.map(r => `${r.task}/${r.repetition}/${r.arm}`), expected);
assert.deepEqual(manifest.order, results.rows.map(({slot, task, repetition, arm, project}) => ({slot, task, repetition, arm, project})));
results.rows.forEach((r, i) => {
  assert.equal(r.slot, i + 1);
  assert.equal(r.status, 'not_started');
  for (const key of ['Q', 'T', 'D', 'project', 'executionElapsedMs', 'cleanupElapsedMs']) assert.equal(r[key], null);
  for (const key of ['requests', 'nativeTools', 'compilerAnalyses']) assert.equal(r[key], 0);
});
assert.ok(Object.values(results.totals).every(n => n === 0));
assert.equal(results.pairwise.length, 4);
assert.ok(results.pairwise.every(r => r.H1_H0 === null && r.H1_P === null));
assert.equal(results.positiveThresholdSatisfied, null);
assert.equal(results.perProjectScores, null);
const comparisons = selection.results.filter(r => r.comparison).map(r => r.comparison);
assert.equal(results.preparation.modelFreeComparisons, comparisons.length);
assert.equal(results.preparation.comparisonElapsedMs, comparisons.reduce((n, r) => n + r.cost.elapsedMs, 0));
assert.equal(results.preparation.compilations, comparisons.reduce((n, r) => n + r.cost.compilations, 0));
assert.equal(results.preparation.authorAnalyses, 0);
const changes = execFileSync('git', ['diff', '--name-only', manifest.publicationStart, '--'], {encoding: 'utf8'}).trim().split('\n').filter(Boolean);
assert.ok(changes.every(p => p.startsWith('development/native-type-compat-transfer/')), changes.join('\n'));
console.log(JSON.stringify({passed: true, candidates: 6, structurallyAdmitted: 1,
  notStarted: 12, frozenTasks: 0, realProviderRequests: 0, runtimeAndHistoryUnchanged: true}));
