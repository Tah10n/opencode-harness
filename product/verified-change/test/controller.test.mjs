import assert from "node:assert/strict";
import test from "node:test";
import { runController, acceptHypotheses } from "../lib/controller.mjs";

const task = "Preserve old callers. Reject negative timeouts.";
const acceptance = { id: "negative", confidence: "unambiguous", basis: { source: "task", quote: "Reject negative timeouts." } };
function fixture(states, options = {}) {
  const repairs = [];
  const verified = [];
  const host = {
    draft: async () => {}, snapshot: async (name) => name,
    scope: async () => ({ passed: true }),
    verify: async (snapshot, checks) => {
      verified.push([snapshot, checks.map((c) => c.id)]);
      return checks.map((c) => ({ id: c.id, status: states[snapshot][c.id], stderr: "actual assertion detail" }));
    },
    repair: async (diagnostic) => { repairs.push(diagnostic); },
    assess: async () => ({ disputed: [] }),
    ...options,
  };
  return { repairs, verified, run: () => runController({ task, checks: [{ id: "regression" }], hypotheses: [acceptance], contracts: { task }, host }) };
}

test("green draft is retained with no cosmetic repair", async () => {
  const f = fixture({ D0: { regression: "passed", negative: "passed" } });
  const result = await f.run();
  assert.equal(result.selected, "D0");
  assert.equal(result.stopReason, "checks_passed");
  assert.equal(f.repairs.length, 0);
  assert.deepEqual(result.confirmed.map((c) => c.id), ["negative"]);
});

test("green old tests plus missed requirement causes reproducible repair", async () => {
  const f = fixture({ D0: { regression: "passed", negative: "assertion_failed" }, D1: { regression: "passed", negative: "passed" } });
  const result = await f.run();
  assert.equal(result.selected, "D1");
  assert.equal(result.repairs, 1);
  assert.deepEqual(f.verified, [["D0", ["regression", "negative"]], ["D0", ["negative"]], ["D1", ["regression", "negative"]]]);
  assert.equal(f.repairs[0].diagnostics[0].first.stderr, "actual assertion detail");
  assert.deepEqual(f.repairs[0].diagnostics[0].check.basis, acceptance.basis);
});

test("repair breaking an existing consumer is rejected", async () => {
  const f = fixture({ D0: { regression: "passed", negative: "assertion_failed" }, D1: { regression: "assertion_failed", negative: "passed" } });
  const result = await f.run();
  assert.equal(result.selected, "D0");
  assert.equal(result.stopReason, "repair_regression");
  assert.equal(f.repairs.length, 1);
});

test("two unsuccessful repairs retain D0 and report failure", async () => {
  const state = { regression: "passed", negative: "assertion_failed" };
  const f = fixture({ D0: state, D1: state, D2: state });
  const result = await f.run();
  assert.equal(result.selected, "D0");
  assert.equal(result.stopReason, "repair_limit");
  assert.equal(f.repairs.length, 2);
  assert.deepEqual(result.snapshots.map((s) => s.name), ["D0", "D1", "D2"]);
});

for (const status of ["infrastructure_error", "timeout", "not_applicable"]) {
  test(`${status} cannot drive repair or become a pass`, async () => {
    const f = fixture({ D0: { regression: "passed", negative: status } });
    const result = await f.run();
    assert.notEqual(result.stopReason, "checks_passed");
    assert.equal(f.repairs.length, 0);
  });
}

test("unsupported and ambiguous assertions remain unverified", () => {
  const result = acceptHypotheses([
    { ...acceptance, confidence: "ambiguous" },
    { ...acceptance, id: "invented", basis: { source: "task", quote: "Timeouts must equal 42" } },
  ], { task });
  assert.equal(result.accepted.length, 0);
  assert.deepEqual(result.unverified.map((h) => h.reason), ["ambiguous_requirement", "unsupported_citation"]);
});

test("line-wrapped prose citations remain grounded without changing inline literals", () => {
  const wrapped = { ...acceptance, basis: { source: "task", quote: "Reject negative timeouts." } };
  assert.equal(acceptHypotheses([wrapped], { task: "Reject negative\ntimeouts." }).accepted.length, 1);
  const spaces = { ...acceptance, basis: { source: "task", quote: 'Return " ".' } };
  assert.equal(acceptHypotheses([spaces], { task: 'Return "  ".' }).accepted.length, 0);
});

test("an accepted entry cannot execute ambiguous assertions through a shared file", () => {
  const result = acceptHypotheses([
    { ...acceptance, files: ["shared.test.mjs"] },
    { ...acceptance, id: "unsupported", confidence: "ambiguous", files: ["shared.test.mjs"] },
  ], { task });
  assert.equal(result.accepted.length, 0);
  assert.equal(result.unverified.find((h) => h.id === acceptance.id).reason, "shares_file_with_unverified_assertions");
});

test("flaky assertions do not cause code changes", async () => {
  let calls = 0;
  const f = fixture({}, { verify: async (_snapshot, checks) => checks.map((c) => ({ id: c.id, status: ++calls <= 2 ? "assertion_failed" : "passed" })) });
  assert.equal((await f.run()).stopReason, "failure_not_reproducible");
  assert.equal(f.repairs.length, 0);
});

test("incomplete host result cannot hide missing regressions", async () => {
  const f = fixture({}, { verify: async () => [{ id: "negative", status: "passed" }] });
  await assert.rejects(f.run, /CHECK_RESULTS_INCOMPLETE/);
});

test("different failing assertions do not count as a reproduction", async () => {
  let count = 0;
  const f = fixture({}, { verify: async (_snapshot, checks) => {
    count += 1;
    return checks.map((c) => ({ id: c.id, status: "assertion_failed", assertions: [{ name: `assertion-${count}`, code: "ERR_ASSERTION" }] }));
  } });
  assert.equal((await f.run()).stopReason, "failure_not_reproducible");
  assert.equal(f.repairs.length, 0);
});

test("AbortError during repair retains D0 and accumulated diagnostics", async () => {
  const control = new AbortController();
  const result = await runController({ task, checks: [{ id: "regression" }], hypotheses: [], contracts: { task }, signal: control.signal,
    host: { draft: async () => {}, snapshot: async (name) => name, scope: async () => ({ passed: true }),
      verify: async () => [{ id: "regression", status: "assertion_failed", stderr: "assertion" }],
      repair: async () => { control.abort(); throw new DOMException("cancelled", "AbortError"); } } });
  assert.equal(result.stopReason, "cancelled");
  assert.equal(result.selected, "D0");
  assert.equal(result.snapshots[0].checks[0].stderr, "assertion");
});

test("disputed assertions cannot drive repairs or be reported confirmed", async () => {
  const f = fixture({ D0: { regression: "passed", negative: "assertion_failed" } }, {
    assess: async () => ({ disputed: [{ id: "negative", basis: acceptance.basis, reason: "The assertion chooses an unspecified return representation." }] }),
  });
  const result = await f.run();
  assert.equal(f.repairs.length, 0);
  assert.equal(result.selected, "D0");
  assert.equal(result.confirmed.length, 0);
  assert.equal(result.unverified[0].reason, "disputed_assertion");
});

test("a dispute cannot remove an existing regression or cite invented requirements", async () => {
  for (const dispute of [
    { id: "regression", basis: acceptance.basis, reason: "disagree" },
    { id: "negative", basis: { source: "task", quote: "Always return 42" }, reason: "disagree" },
  ]) {
    const f = fixture({ D0: { regression: "assertion_failed", negative: "assertion_failed" } }, { assess: async () => ({ disputed: [dispute] }) });
    await assert.rejects(f.run, /ASSESSMENT_/);
    assert.equal(f.repairs.length, 0);
  }
});

test("a disputed expectation does not prevent repair of a separate confirmed defect", async () => {
  let repair;
  const result = await runController({ task, checks: [{ id: "regression" }], contracts: { task },
    hypotheses: [acceptance, { ...acceptance, id: "representation" }],
    host: {
      draft: async () => {}, snapshot: async name => name, scope: async () => ({ passed: true }),
      verify: async (snapshot, checks) => checks.map(c => ({ id: c.id, status: snapshot === "D0" && c.id !== "regression" ? "assertion_failed" : "passed", stderr: "stable assertion" })),
      assess: async () => ({ disputed: [{ id: "representation", basis: acceptance.basis, reason: "Return shape is unspecified." }] }),
      repair: async input => { repair = input; },
    } });
  assert.deepEqual(repair.diagnostics.map(d => d.check.id), ["negative"]);
  assert.equal(result.selected, "D1");
  assert.deepEqual(result.confirmed.map(c => c.id), ["negative"]);
  assert.equal(result.unverified[0].id, "representation");
});

test('quarantine treats cwd aliases as the same file and follows shared-file chains', () => {
  const result = acceptHypotheses([
    {...acceptance,id:'tail',files:['b.test.mjs']},
    {...acceptance,id:'bridge',files:['group/shared.test.mjs','b.test.mjs']},
    {...acceptance,id:'disputed',cwd:'group',files:['shared.test.mjs'],confidence:'ambiguous'},
  ], {task});
  assert.equal(result.accepted.length,0);
  assert.equal(result.unverified.length,3);
});

test('assessment quarantines aliases before another repair', async () => {
  let repairs=0;
  const result=await runController({task,checks:[{id:'regression'}],contracts:{task},
    hypotheses:[{...acceptance,id:'a',cwd:'group',files:['shared.test.mjs']},{...acceptance,id:'b',files:['group/shared.test.mjs']}],
    host:{draft:async()=>{},snapshot:async name=>name,scope:async()=>({passed:true}),
      verify:async(_,checks)=>checks.map(c=>({id:c.id,status:c.id==='regression'?'passed':'assertion_failed',stderr:'stable'})),
      assess:async()=>({disputed:[{id:'a',basis:acceptance.basis,reason:'Competing valid interpretation.'}]}),
      repair:async()=>{repairs++;},
    }});
  assert.equal(repairs,0);
  assert.equal(result.confirmed.length,0);
  assert.deepEqual(result.unverified.map(c=>c.id).sort(),['a','b']);
});
