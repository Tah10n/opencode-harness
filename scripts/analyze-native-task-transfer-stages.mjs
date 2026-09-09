// Read-only retrospective attribution; stdout is sanitized aggregate data.
// Usage: node scripts/analyze-native-task-transfer-stages.mjs local/native-task-transfer/runs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.argv[2];
assert.ok(root, 'Supply the retained transfer runs directory');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const empty = () => ({ requests: 0, observedTokens: 0, unknownUsageRequests: 0 });
const add = (sum, request) => {
  sum.requests++;
  if (Number.isFinite(request.usage?.total_tokens)) sum.observedTokens += request.usage.total_tokens;
  else sum.unknownUsageRequests++;
};
const tasks = [];
for (const name of fs.readdirSync(root).filter(n => n.endsWith('-B')).sort()) {
  const dir = path.join(root, name), result = read(path.join(dir, 'result.json'));
  const artifacts = path.dirname(result.delivery), workflow = read(path.join(artifacts, 'result.json'));
  const native = read(path.join(dir, 'native-evidence.json'));
  const requests = read(path.join(dir, 'provider-metadata.json'));
  const stages = workflow.stages.map(stage => {
    const final = native.messages.find(m => m.id === stage.messageID);
    assert.ok(final?.data.time.completed, 'Missing stage completion');
    const user = native.messages.filter(m => m.session_id === final.session_id && m.data.role === 'user' && m.data.time.created <= final.data.time.created)
      .sort((a,b) => b.data.time.created - a.data.time.created)[0];
    assert.ok(user, 'Missing stage start');
    return { label: stage.label, start: user.data.time.created, end: final.data.time.completed, elapsedMs: stage.elapsedMs, ...empty() };
  });
  for (let i=1;i<stages.length;i++) assert.ok(stages[i].start >= stages[i-1].end, 'Overlapping stage windows');
  const implementation = stages.find(s => s.label === 'implementation');
  const review = stages.find(s => s.label === 'review-0');
  assert.ok(implementation && review);
  const beforeD0 = empty(), afterD0 = empty(), withinD0Bracket = empty(), overhead = empty();
  for (const request of requests) {
    const at = Date.parse(request.at); assert.ok(Number.isFinite(at));
    const matches = stages.filter(s => at >= s.start && at <= s.end);
    assert.ok(matches.length <= 1, 'Ambiguous request stage');
    add(matches[0] ?? overhead, request);
    add(at <= implementation.end ? beforeD0 : at >= review.start ? afterD0 : withinD0Bracket, request);
  }
  assert.equal(stages.reduce((n,s)=>n+s.requests,overhead.requests), result.requests);
  const grading = read(path.join(dir,'behavior-grading.json'));
  tasks.push({ task: result.task, historicalStatus: result.workflowStatus, repairs: result.repairs,
    D0TimeBracket: { earliest: implementation.end, latest: review.start },
    beforeD0, afterD0, withinD0Bracket, stages, overhead,
    elapsedMs: result.elapsedMs,
    outsideStageElapsedMs: result.elapsedMs - stages.reduce((n,s)=>n+s.elapsedMs,0),
    savedChecks: Object.fromEntries(Object.entries(grading).map(([k,v])=>[k,{passed:v.passed,counts:v.counts}]))
  });
}
assert.equal(tasks.length, 6, 'Expected the six retained B runs');
console.log(JSON.stringify({ measuredRuntime: 'db99470ab3517b741e0452613a9ff04f68a49bc1',
  method: 'Provider request start timestamps matched to nonoverlapping child-stage user-to-final-assistant windows. Correlation, not causal provider IDs. D0 timestamp is bracketed, not invented. Totals include cache and reasoning; neither is added again. Unknown usage remains unknown.',
  realProviderCalls: 0, tasks }, null, 2));
