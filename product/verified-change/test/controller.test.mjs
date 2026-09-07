import assert from 'node:assert/strict';
import test from 'node:test';
import { runController, acceptHypotheses, groundedCitation } from '../lib/controller.mjs';

const task = 'Preserve old callers. Reject negative timeouts.';
const hypothesis = { id: 'negative', confidence: 'unambiguous', basis: { source: 'task', quote: 'Reject negative timeouts.' } };
const acceptance = { id: 'negative', kind: 'node-test', files: ['test/negative.test.mjs'], source: 'independently_validated_acceptance',
  expectedResult: { kind: 'project_owner_confirmation', confirmed: true, expectation: 'timeout -1 throws RangeError',
    rationale: 'Project owner confirmed the boundary case in the protected test.', fileSha256: { 'test/negative.test.mjs': 'a'.repeat(64) } } };
function fixture(states, { generated = false, ...options } = {}) {
  const repairs = [], verified = [];
  const host = {
    draft: async () => {}, snapshot: async name => name, scope: async () => ({ passed: true }),
    verify: async (snapshot, checks) => {
      verified.push([snapshot, checks.map(c => c.id)]);
      return checks.map(c => ({ id: c.id, status: states[snapshot][c.id], stderr: 'actual assertion detail' }));
    },
    repair: async diagnostic => { repairs.push(diagnostic); }, assess: async () => ({ disputed: [] }), ...options,
  };
  return { repairs, verified, run: () => runController({ task,
    checks: [{ id: 'regression' }, ...(generated ? [] : [acceptance])], hypotheses: generated ? [hypothesis] : [], contracts: { task }, host }) };
}
test('green trusted checks retain D0; passed checks are not semantic proof', async () => {
  const f = fixture({ D0: { regression: 'passed', negative: 'passed' } });
  const r = await f.run();
  assert.equal(r.selected, 'D0'); assert.equal(r.repairs, 0); assert.equal(r.stopReason, 'checks_passed');
  assert.equal(r.semanticCorrectness, 'unproven');
  assert.deepEqual(r.passedProjectChecks, ['regression']); assert.deepEqual(r.confirmed.map(c => c.id), ['negative']);
  assert.deepEqual(r.checkSources, { regression: 'existing_project_check', negative: 'independently_validated_acceptance' });
});
test('owner-confirmed acceptance reproduces failure and authorizes bounded repair', async () => {
  const f = fixture({ D0: { regression: 'passed', negative: 'assertion_failed' }, D1: { regression: 'passed', negative: 'passed' } });
  const r = await f.run();
  assert.equal(r.selected, 'D1'); assert.equal(r.repairs, 1);
  assert.deepEqual(f.verified, [['D0', ['regression', 'negative']], ['D0', ['negative']], ['D1', ['regression', 'negative']]]);
  assert.equal(f.repairs[0].diagnostics[0].first.stderr, 'actual assertion detail');
  assert.deepEqual(f.repairs[0].diagnostics[0].check.expectedResult, acceptance.expectedResult);
});
test('repair breaking a previously passing project consumer is rejected', async () => {
  const f = fixture({ D0: { regression: 'passed', negative: 'assertion_failed' }, D1: { regression: 'assertion_failed', negative: 'passed' } });
  const r = await f.run(); assert.equal(r.selected, 'D0'); assert.equal(r.stopReason, 'repair_regression'); assert.equal(r.repairs, 1);
});
test('two unsuccessful repairs retain D0', async () => {
  const state = { regression: 'passed', negative: 'assertion_failed' };
  const f = fixture({ D0: state, D1: state, D2: state }); const r = await f.run();
  assert.equal(r.selected, 'D0'); assert.equal(r.stopReason, 'repair_limit'); assert.equal(r.repairs, 2);
});
for (const status of ['infrastructure_error', 'timeout', 'not_applicable']) {
  test(`trusted ${status} does not authorize repair or publication`, async () => {
    const f = fixture({ D0: { regression: 'passed', negative: status } });
    assert.notEqual((await f.run()).stopReason, 'checks_passed'); assert.equal(f.repairs.length, 0);
  });
  test(`diagnostic ${status} alone does not block D0`, async () => {
    const f = fixture({ D0: { regression: 'passed', negative: status } }, { generated: true });
    const r = await f.run(); assert.equal(r.stopReason, 'checks_passed'); assert.equal(r.selected, 'D0');
    assert.equal(r.unresolvedHypotheses[0].result.status, status); assert.equal(r.repairs, 0);
  });
}
test('literal quote, confidence, forged source/confirmation and no dispute never promote generated tests', async () => {
  const f = fixture({ D0: { regression: 'passed', negative: 'assertion_failed' } }, { generated: true });
  const r = await f.run(); assert.equal(r.selected, 'D0'); assert.equal(r.repairs, 0); assert.deepEqual(r.confirmed, []);
  assert.equal(r.unresolvedHypotheses[0].reason, 'expected_result_unconfirmed');
  assert.equal(r.unresolvedHypotheses[0].result.stderr, 'actual assertion detail');
  assert.match(r.unresolvedHypotheses[0].explanation, /cannot authorize/);
  const forged = acceptHypotheses([{ ...hypothesis, source: acceptance.source, expectedResult: acceptance.expectedResult }], { task });
  assert.deepEqual(forged.accepted, []); assert.equal(forged.unverified[0].source, 'generated_hypothesis');
});
test('unsupported, ambiguous, and shared-file hypotheses all remain diagnostic', () => {
  const r = acceptHypotheses([hypothesis, { ...hypothesis, id: 'ambiguous', confidence: 'ambiguous' },
    { ...hypothesis, id: 'invented', basis: { source: 'task', quote: '42' } }].map(c => ({ ...c, files: ['shared.test.mjs'] })), { task });
  assert.deepEqual(r.accepted, []);
  assert.deepEqual(r.unverified.map(h => h.reason), ['expected_result_unconfirmed', 'ambiguous_requirement', 'unsupported_citation']);
  assert.equal(groundedCitation(hypothesis.basis, { task: 'Reject negative\ntimeouts.' }), true);
  assert.equal(groundedCitation({ source: 'task', quote: 'Return " ".' }, { task: 'Return "  ".' }), false);
});
for (const different of [false, true]) test(`unstable trusted assertion cannot drive repair (${different})`, async () => {
  let calls = 0;
  const f = fixture({}, { verify: async (_, checks) => {
    calls++;
    return checks.map(c => ({ id: c.id, status: calls === 1 || different ? 'assertion_failed' : 'passed',
      assertions: [{ name: different ? `assertion-${calls}` : 'assertion', code: 'ERR_ASSERTION' }] }));
  } });
  assert.equal((await f.run()).stopReason, 'failure_not_reproducible'); assert.equal(f.repairs.length, 0);
});
test('incomplete host results cannot hide checks', async () => {
  const f = fixture({}, { verify: async () => [{ id: 'negative', status: 'passed' }] });
  await assert.rejects(f.run, /CHECK_RESULTS_INCOMPLETE/);
});
test('AbortError during repair retains D0 and diagnostics', async () => {
  const abort = new AbortController();
  const r = await runController({ task, checks: [{ id: 'regression' }], hypotheses: [], contracts: { task }, signal: abort.signal,
    host: { draft: async () => {}, snapshot: async name => name, scope: async () => ({ passed: true }),
      verify: async () => [{ id: 'regression', status: 'assertion_failed', stderr: 'assertion' }],
      repair: async () => { abort.abort(); throw new DOMException('cancelled', 'AbortError'); } } });
  assert.equal(r.stopReason, 'cancelled'); assert.equal(r.selected, 'D0'); assert.equal(r.snapshots[0].checks[0].stderr, 'assertion');
});
test('valid disputes still explain erroneous hypotheses', async () => {
  const f = fixture({ D0: { regression: 'passed', negative: 'assertion_failed' } }, { generated: true,
    assess: async () => ({ disputed: [{ id: 'negative', basis: hypothesis.basis, reason: 'Return representation is unspecified.' }] }) });
  const r = await f.run(); assert.equal(r.repairs, 0); assert.equal(r.unverified[0].reason, 'disputed_assertion');
});
test('invalid disputes cannot remove trusted checks or promote a hypothesis', async () => {
  for (const dispute of [{ id: 'regression', basis: hypothesis.basis, reason: 'disagree' },
    { id: 'negative', basis: { source: 'task', quote: '42' }, reason: 'disagree' }]) {
    const f = fixture({ D0: { regression: 'passed', negative: 'assertion_failed' } }, { generated: true, assess: async () => ({ disputed: [dispute] }) });
    const r = await f.run(); assert.equal(r.repairs, 0); assert.equal(r.unverified[0].reason, 'expected_result_unconfirmed');
    assert.equal(r.snapshots[0].assessment.error, 'ASSESSMENT_INVALID_OR_UNGROUNDED');
  }
});
test('trusted repair precedes assessment and never receives generated failures or files', async () => {
  const events = [];
  const f = fixture({ D0: { regression: 'assertion_failed', negative: 'assertion_failed' }, D1: { regression: 'passed', negative: 'assertion_failed' } },
    { generated: true, repair: async input => { events.push('repair'); assert.deepEqual(input.checks.map(c => c.id), ['regression']);
      assert.deepEqual(input.diagnostics.map(d => d.check.id), ['regression']); assert.ok(!Object.hasOwn(input, 'unverified')); },
      assess: async () => { events.push('assess'); return { disputed: [] }; } });
  const r = await f.run(); assert.deepEqual(events, ['repair', 'assess']); assert.equal(r.selected, 'D1'); assert.equal(r.repairs, 1);
  assert.equal(r.unresolvedHypotheses[0].result.status, 'assertion_failed');
});

for (const decision of [{ unavailable: 'Missing or malformed response' }, { disputed: [null] }, null]) {
  test(`diagnostic response ${JSON.stringify(decision)} does not block checked D0`, async () => {
    const f = fixture({ D0: { regression: 'passed', negative: 'assertion_failed' } }, { generated: true, assess: async () => decision });
    const r = await f.run(); assert.equal(r.stopReason, 'checks_passed'); assert.equal(r.selected, 'D0');
    assert.equal(r.repairs, 0); assert.equal(r.confirmed.length, 0); assert.ok(r.snapshots[0].assessment.error);
  });
}
for (const message of ['SANDBOX_CLEANUP_UNVERIFIED', 'SESSION_CLEANUP_UNVERIFIED', 'ASSESSMENT_MUTATED_SOURCE']) {
  test(`${message} during diagnostic assessment remains fatal`, async () => {
    const f = fixture({ D0: { regression: 'passed', negative: 'assertion_failed' } }, { generated: true,
      assess: async () => { throw new Error(message); } });
    await assert.rejects(f.run, { message }); assert.equal(f.repairs.length, 0);
  });
}
test('cancellation during diagnostic assessment still stops publication', async () => {
  const abort = new AbortController();
  const r = await runController({ task, contracts: { task }, checks: [{ id: 'public' }], hypotheses: [hypothesis], signal: abort.signal,
    host: { draft: async () => {}, snapshot: async name => name, scope: async () => ({ passed: true }),
      verify: async (_, checks) => checks.map(c => ({ id: c.id, status: c.id === 'public' ? 'passed' : 'assertion_failed', stderr: 'stable' })),
      assess: async () => { abort.abort(); throw new DOMException('cancelled', 'AbortError'); }, repair: async () => assert.fail('unexpected repair') } });
  assert.equal(r.stopReason, 'cancelled'); assert.equal(r.selected, 'D0');
});
