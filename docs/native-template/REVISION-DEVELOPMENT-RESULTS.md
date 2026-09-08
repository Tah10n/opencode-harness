# Published native revision: six new development outcomes

The [pre-run plan](REVISION-DEVELOPMENT.md) was followed with candidate
`1d79ce9e87b43c156f132e59acd5fce1df706814`. Six fresh sessions completed once,
without timeout, intervention or replacement. This batch does not replace or
rescore the earlier six outcomes. These repeatedly used tasks do not establish
general lift. No next prompt revision is proposed or applied.

## Result: the implementation workflow did not materialize

| Task | Off: behavior / delivery | On: behavior / delivery | Correct new shipped regressions | Remaining errors | Off / on seconds; tools |
|---|---|---|---|---|---|
| Collectors | Incomplete / incomplete | Incomplete / incomplete | None in either patch | Unsupported usage still reports complete; no required state-sequence regression | 191.966 / 148.320; 40 / 33 |
| Account-switch ledger | Incomplete / incomplete | Incomplete / incomplete, plus cutover regression | None in either patch | Accepted history still lost; SQLite unchanged; on breaks state lookup for cutover | 244.592 / 273.889; 42 / 46 |
| Cursor versions | Required behavior supported in audited cases / incomplete delivery | Date-range implementation defect / incomplete delivery | Both ship useful partial parser assertions; neither ships CLI/sync regressions | On rejects valid later dates; both omit explicit consumer-test additions | 155.302 / 264.593; 24 / 45 |

A/B/C are separated here: required runtime behavior, shipped regression coverage,
and complete delivery. Complete delivery remains **0/3 off and 0/3 on**. No task
showed the proposed D workflow of demonstrating a new regression against the
original defect before changing implementation. D is an observed process result,
not an alternative success score. More edited files or assertions are not wins.

## A. Independent functional and preservation evidence

| Task | Off original preservation / frozen probes | On original preservation / frozen probes |
|---|---|---|
| Collectors | 88/88; 0/2 | 88/88; 0/2 |
| Ledger | 203/203; 0/6 | 202/203; 0/6 |
| Cursor | 20/20; 2/2 | 20/20; 2/2 |

Original audited suites were overlaid on separate candidate copies. Frozen probe
bytes were not changed. A first failed assertion leaves later clauses unproven;
it does not count every later assertion as another independent failure.

**Collectors:** both retained patches return complete for a parsed unsupported
Gemini record after accepting and reloading prior usage. On's changed
`packages/connector/lib/adapters/gemini.mjs`, `geminiEventKey`, contains:

```js
if (record?.type !== "gemini" || !usage) return null;
```

This bypasses the invalid-record signal on the required unsupported input. Off's
`parseGeminiLines` only marks JSON parse errors invalid, while the existing parser
still skips unsupported types. Both frozen retained-state/retry probes fail at
complete versus partial. No production repair was applied during evaluation.

**Ledger:** both leave `packages/connector/lib/adapters/opencode.mjs` unchanged.
The unchanged SQLite collector returns current rows, so the independent sequence
accept old usage → delete rows → add new usage → reload state loses the old day.
All five event-adapter lifecycle probes fail too. Off changes only shared.mjs;
on changes shared.mjs and bin/viberacing.mjs. Neither patch delivers new tests.

On's persistence hunk adds:

```js
state.adapters[source.clientSourceId] = outcome.value.result.nextState ?? {};
if (source.sourceId !== source.clientSourceId) delete state.adapters[source.sourceId];
```

But cutover candidate/pending/confirmation consumers in that same file still read
`state.adapters[source.sourceId]` (candidate lines 935, 1385). The unchanged named
config test, “OpenCode cutover aliases become confirmed only after server
acceptance”, fails because its source state is absent. A targeted fresh-copy
reproduction passes baseline and off (1/1 each), fails on (0/1). This is not merely
an assertion demanding one representation: live cutover readers were not migrated.

**Cursor:** the frozen examples miss a new on defect in cursor-events.mjs:

```js
date.join("") >= minimumCliDate.join("")
```

For the valid later date 2026.10.01, this compares `"2026101" >= "202692"`, false.
The original task supplies a lower date bound, so rejecting this later valid date
violates the requirement. Direct public-API checks confirm off accepts 2026.09.10
and 2026.10.01 while on rejects both; both accept the floor and the tested 2027 date.

This is a **post-run source-derived confirmation**, kept separate from the unchanged
frozen probe scores. On fresh copies, the existing original CLI/sync assertions
were retained, with only the positive CLI fixture changed to 2026.10.01-c22c1a3
and positive Desktop default to 3.19.13. Off passes 11/11; on passes 1/11. The shared
version rejection accounts for dependent downstream failures, not ten task losses.
No historical outcome was checked again with this additional example.

## B. Shipped assertions and expected-result validity

Collectors/ledger have no test changes, and no recorded temporary assertion sequence
for the required state transitions. Their old suites include related state checks,
but do not provide the missing new obligation coverage.

Cursor/off extends `cursor-events.test.mjs` with Desktop 3.19.13 through parseCursorStop,
a later dated CLI positive, an explicit cross-surface rejection and an invalid
calendar date. Cursor/on adds “Cursor version gates accept supported auto-updates”:
same-major Desktop releases and valid later CLI dates. Positive expectations follow
the task's floors; surface/calendar negatives follow preserved validation. These
are meaningful but partial checks, not requirements to match an evaluator example.
No original preservation assertion is removed from either final Cursor patch.

We copied each delivered parser test file onto a separate original source tree:

| Delivered tests | On original implementation | On delivered implementation |
|---|---|---|
| Cursor off | 7/9; two behavioral failures | 9/9 |
| Cursor on | 9/10; new positive-case assertion fails | 10/10 |

Off's baseline failures are an actual version rejection through parseCursorStop
and a false-versus-true compatibility assertion. On's is false versus true for
an accepted release. Neither is an import error. Sensitivity does not itself prove
expected-result correctness; the task/contract grounds them as explained above.
The on test still accepts its incorrect date-ordering implementation because its
examples do not exercise the missed date boundaries.

On E98 also substitutes hex-shaped fixture suffixes for its earlier invented
`nextbuild`/`build1` examples while narrowing the implementation regex. We do not
count this post-result fixture substitution as a quality improvement or independent
validation of the suffix grammar. The confirmed date defect uses the original
known suffix and does not depend on that ambiguity.

Neither Cursor patch changes cursor-cli.test.mjs or cursor-sync.test.mjs. Both
run those old suites. No temporary CLI/sync regression was created and then lost.
Parser tests and our external checks do not complete this explicitly requested
consumer-test deliverable.

## D. Where the chain broke, from tool events

Event numbers are 1-based saved session/events.jsonl lines; artifact hashes are
in [the new evidence index](revision-evidence-index.json). These are descriptions
of executed tools and final patches, not inferred internal reasoning.

| Task/arm | Test-before-fix and delivery evidence | Checks after last edit |
|---|---|---|
| Collectors off | Production edits E47–77; no test mutation; E96 marks regressions complete | Readers E80, diagnostics E83 |
| Collectors on | Production edits E49–61; no test mutation; E77 marks regressions complete | Readers E68, diagnostics E71 |
| Ledger off | Shared edits E54–93; no test mutation | Last suites E78/81/84 precede final E93; later broad pnpm check unavailable |
| Ledger on | Shared/persistence edits E61–112; no test mutation; E121 marks regressions complete | Readers E115 only; config/protocol chain E103 precedes final edits |
| Cursor off | E30 changes production and tests together; no original-source sensitivity check in-session | Parser/CLI/sync E40–42 after final edit E33 |
| Cursor on | E36 changes production and tests together; no original-source sensitivity check in-session | After final edit E98 only parser E102; last CLI/sync E80–81 precede it |

Thus the chain breaks before **requirement → shipped discriminating regression**
for collectors/ledger and CLI/sync. For Cursor parser coverage it additionally
breaks at **partial regression → complete behavior**, and tests are not established
on original code before implementation. Todos and final responses are not evidence
of completing the missing links. The proposed instruction did not repair them in
this batch; no additional paragraph, scheduler or mandatory role is added.

## Exact binding, cost and limits

Core SHA-256: `9adcc862446ac6c0e5a407ec89e2f65fe4a249aedcc34ba36f143f3589edd4f7`.
Materialized runtime config is the unchanged [development-opencode.json](development-opencode.json)
with `/work/template/core.md`. Model, small_model and variant remain
openai/gpt-5.6-luna / low; OpenCode 1.18.26, Node 24.19.0, 900 seconds, same existing
prepared environment. Run-config SHA-256:
`ddf1a2888f68d2765382f21e143790f07eff670a277aa3317b9c894c37e1f5f1`.
Source/task/project-instruction hashes and actual order are in the evidence index.
The published candidate bytes did not change before or during the six sessions.

| Accounting | Off | On |
|---|---:|---:|
| Session seconds | 591.860 | 686.802 |
| Native tool calls | 106 | 124 |
| Provider requests | 77 | 93 |
| Recorded input | 1,940,820 | 2,110,488 |
| Recorded output | 10,669 | 12,883 |
| Recorded reasoning | 4,274 | 4,661 |
| Recorded cache read | 819,200 | 1,294,848 |
| Recorded cache write | 0 | 0 |
| Recorded normalized total | 2,774,963 | 3,422,880 |

On took 94.942 seconds more (16.0%) and used 18 more tools (17.0%). These are one-batch
observations. Normalized total sums input + output + reasoning + cache read/write
as returned in step_finish. Auxiliary requests without those fields are not covered;
monetary cost is unavailable. No p-value or general-lift estimate is computed.

The one local scripted smoke ran both arms, two tool-bearing requests per arm,
with zero real provider requests. Full materialized instruction text appeared only
on; project instructions, native tools, model selection and permission denial were
preserved. It reused the existing fixture/transport and installed nothing extra.
All six subsequent real sessions used fresh copies; 170 provider requests returned
HTTP 200. All six patches and raw candidate captures succeeded, with no retries.

Automatic approval initially rejected execution before any attempt started; a
public-origin audit confirmed all three GitHub commits and exact source archives,
with only the unchanged pre-existing audited test adjustments. Approval then allowed
the same transport/binding. This was not a model retry or environment change.

In-session command failures remain saved: unavailable pnpm retrieval and ledger
scheduler/hook/config failures are not silently replaced by later validation. The
separate preservation checks isolate the durable on cutover failure; other transient
failures are not asserted to be pre-existing. No evaluator was repaired between arms.
All 30 new frozen file digests and 43 historical freeze/amendment digests still match.
Old outcomes remain unchanged. No merge, release, default switch, large evaluation
or next candidate revision was performed. The effective-harness goal remains open.
