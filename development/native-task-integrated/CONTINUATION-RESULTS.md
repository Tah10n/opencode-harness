# Final-pair addendum: Hbase delivery did not repeat on UFO

**Product decision:** this completed pair reveals **non-repeatability of Hbase's
UFO delivery**. Both P and Hbase finish the two UFO repetitions at **D = 1/2**.
Do not treat Hbase as a demonstrated repeatable winner or promote it on this
series. No third repeat, new campaign, component, forced delegation or runtime/default
change follows from this result.

## Execution amendment and preserved history

New execution period (UTC): **2026-09-15T18:28:48.116Z → 2026-09-15T18:45:50.299Z**.

The user explicitly authorized only original slots **11 (P/r2), then 12 (Hbase/r2)**
after slot 10's verified local termination, accepting its unresolved remote
execution. This was a new execution period, not a retry or session resume.
[Pre-run amendment](CONTINUATION.md) and [preparation record](continuation-preparation.json)
bind the original freeze, pause, launcher changes and unchanged trees.
Preparation was published at `16b82bf2` before either new task request.
Measured runtime remains `797ce6f1b75af217e00224d1b38790346dee1d19`.

The [original report](RESULTS.md), first-ten rows/grades/accounting, reference and
alternative are unchanged. Slot 10 remains Q=false/T=false with its retained
patch and one unknown provider usage. Nothing replaces or excludes it.
Only the two independent assigned sessions were started; retries, probes and
additional real smokes were zero. Both new attempts used the identical frozen
UFO tree, task, dependencies, OpenCode 1.18.26, Luna high and 1800-second limit.
P retained native stdin; Hbase retained direct with optional components off.

Both inputs matched 10,551 frozen files before provider forwarding. Saved request
schemas show the full task, intended model/effort, no harness tools in P and only
harness_task in Hbase. No evaluator, previous patch or calibration solution was
mounted in an author session. [Actual-request audit](continuation-11-12/accounting-audit.json).

## All 12 assigned slots

Q = complete correct portable patch; T = normal autonomous delivery plus verified
termination; D = Q ∧ T. Internal incomplete alone does not decide any grade.

| Slot | Task | Arm | Repeat | Q | T | D | Seconds | Requests | Known tokens | Patch |
|---|---|---|---:|---|---|---|---:|---:|---:|---|
| 1 | A | P | 1 | ✓ | ✓ | ✓ | 380.237 | 26 | 790,910 | [n07](patches/n07.patch) |
| 2 | A | Hbase | 1 | ✓ | ✓ | ✓ | 487.273 | 40 | 1,347,600 | [n02](patches/n02.patch) |
| 3 | A | Htools | 1 | ✓ | ✓ | ✓ | 439.731 | 40 | 1,437,604 | [n11](patches/n11.patch) |
| 4 | A | Htools | 2 | ✓ | ✓ | ✓ | 491.850 | 45 | 1,645,365 | [n04](patches/n04.patch) |
| 5 | A | Hbase | 2 | ✓ | ✓ | ✓ | 590.900 | 42 | 1,822,589 | [n09](patches/n09.patch) |
| 6 | A | P | 2 | ✓ | ✓ | ✓ | 513.774 | 40 | 1,579,409 | [n01](patches/n01.patch) |
| 7 | B | Hbase | 1 | ✓ | ✓ | ✓ | 567.227 | 55 | 2,386,065 | [n12](patches/n12.patch) |
| 8 | B | P | 1 | ✗ | ✓ | ✗ | 671.759 | 53 | 2,602,917 | [n05](patches/n05.patch) |
| 9 | B | Htools | 1 | ✓ | ✓ | ✓ | 761.662 | 47 | 2,562,684 | [n10](patches/n10.patch) |
| 10 | B | Htools | 2 | ✗ | ✗ | ✗ | 470.541 | 21 | ≥582,782 | [n03](patches/n03.patch) |
| 11 | B | P | 2 | ✓ | ✓ | ✓ | 594.670 | 45 | 1,991,331 | [n08](patches/n08.patch) |
| 12 | B | Hbase | 2 | ✗ | ✗ | ✗ | 417.369 | 20 | 761,587 | [n06](patches/n06.patch) |

Slot 10 has one unknown usage; its token total is only the known lower bound.
Slot 12 saved a `terminal.patch` during a permission stop, but neither parent nor
author reached normal `step_finish: stop`; file existence does not establish T.
The raw launcher outcome is `finished` because scheduling exhausted its two slots,
not because both tasks succeeded. [Exact rows/hashes](continuation-11-12/results.json).

| UFO repetition | P | Hbase | Interpretation |
|---|---|---|---|
| 1 | Q✗ T✓ D✗ | Q✓ T✓ D✓ | Hbase delivered; P failed lint and append compatibility. |
| 2 | Q✓ T✓ D✓ | Q✗ T✗ D✗ | P delivered; Hbase stopped with an incomplete, defective patch. |
| Both assigned repeats | **1/2 D** | **1/2 D** | Opposite winners across repeats; no repeatable Hbase edge. |

A remains P 2/2, Hbase 2/2 and Htools 2/2; B is P 1/2, Hbase 1/2 and Htools
1/2. The series contains 12 started attempts, 10 normal completions and 9 D.
Two repetitions of UFO are not two independent projects. No pooled lift,
p-value, confidence interval or causal attribution to a prompt/worktree is made.

## New patches: four separate layers of evaluation

Both patches applied **unchanged** in ordinary Git copies, preserve original
tests/dependencies, and contain no harness administrative files. Source, consumers,
public types, delivered regressions and docs were read under n08/n06 before
explanatory traces. The integrator knew their mapping; this was not fully blinded.

| Layer | P/r2 — n08 | Hbase/r2 — n06 |
|---|---|---|
| Original project commands | npm test (ESLint, Prettier, runtime/type tests) and build pass; 501 assertions, no source errors | ESLint passes; formatting fails in three files. Runtime/type invocation exits 1: 498 assertions pass, but three source TypeCheckErrors remain. Build separately exits 0. |
| Original frozen public checks | 6 assertions pass, process exit 0 | 6 assertions pass, process exit 1 because the same source type errors remain. |
| Separate post-hoc append check | 2/2 pass | 1/2: params-backed receiver incorrectly retains an incoming own undefined key. |
| Manual completeness / Q | Three consumers, public union, no mutation, regressions and docs integrated; **Q=true** | Three consumers/tests/docs present, but source typing, required formatting and append semantics are defective; **Q=false**. |

Hbase's `withQuery` flatMap casts a nested tuple array as a single tuple, causing
source errors at `src/utils.ts:383,389,397`. Prettier flags `src/query.ts`,
`src/utils.ts` and `test/url.test.ts`. Passing runtime assertions and a successful
build do not cancel those original acceptance failures.

The unchanged [append check](evaluation/append-compatibility.test.ts) expects
`/base/child?keep=ok#new` after incoming `{drop: undefined}`; n06 returns
`/base/child?drop=old&keep=ok#new`. It forms replacement keys after serialization
has discarded undefined. n08 uses the incoming object's own keys before value
serialization and passes. This test was created after earlier patch inspection;
it remains **post-hoc**, not an original frozen test. Both frozen calibration
solutions still have the gap. **The new Hbase Q=false does not depend solely on
this follow-up:** formatting and source types already fail the original checks.
No new required assertions or architecture constraints were introduced.

[Individual n08 review](reviews/n08.json), [n06 review](reviews/n06.json),
[separate append results](continuation-11-12/append-followup.json).

## Native completion and environment

P/r2 initially found no bare pnpm, then used the existing local
`./node_modules/.bin/pnpm`, repaired its own intermediate errors and reran the
full project test/build after its final changes. Its final answer matches the
observed successful checks. It ended normally in **594.670 seconds**.

Hbase/r2 searched for unavailable global package commands and attempted registry
resolution in the unchanged network-isolated environment. A native grep of
`/work/home/.npm` then hit the existing external-directory denial. The workflow
preserved the error and stopped; native exit was **1**, without timeout, at
**417.369 seconds**. No parent or author normal stop was recorded. Its terminal
artifact is independently gradeable but is not a normal autonomous delivery.
No claim is made that this interrupted author would necessarily have retained
its defects if allowed to finish; its assigned result remains Q=false/T=false.
No permissions, dependency paths, transport or candidate were changed afterward.

All 20 Hbase provider responses are completed with known usage. This is a native
permission stop, not an unknown provider submission or a quota refusal.
Local workload termination, capture, closed forwarding, absent relay/container,
and zero active handlers were confirmed for both new attempts.
[Stop evidence](continuation-11-12/native-stop.json),
[final preservation and containment checks](continuation-11-12/final-integrity.json).

## Accounting and comparable costs

**New period:** 65 requests = 2 titles + 63 work requests; all usage known. **2,752,918 tokens** = 2,711,499 input + 41,419 output. Cached input 1,943,552 and reasoning output 26,098 are included subsets.

**Combined once with history:** 474 requests = 12 titles + 462 work; 473 known usages and the original one unknown. Known inclusive usage is **19,510,843 tokens** = 19,270,348 input + 240,495 output; cached 9,399,808, reasoning 138,904, neither added again. No money estimate.

The P work total matches native accounting. Hbase's provider work total is
760,895; its retained native total is 701,489. The 59,406 difference equals the
last completed provider response whose author message was aborted at denial.
The provider ledger is counted once; the lower native snapshot neither replaces
it nor adds another usage amount. Slot 10's old unknown usage remains unknown.

| Matched normal-completion pair | P requests / tokens / seconds | Hbase requests / tokens / seconds |
|---|---|---|
| A/r1 | 26 / 790,910 / 380.237 | 40 / 1,347,600 / 487.273 |
| A/r2 | 40 / 1,579,409 / 513.774 | 42 / 1,822,589 / 590.900 |
| B/r1 | 53 / 2,602,917 / 671.759 | 55 / 2,386,065 / 567.227 |

B/r2 costs are 45 / 1,991,331 / 594.670 for P and 20 / 761,587 /
417.369 for stopped Hbase. **These are not a completed comparable cost pair**;
the cheaper interrupted run is not an efficiency win. B/r1's normal P completion
still failed Q, so cost and delivery are kept distinct. A costs more tokens under
Hbase. Across B, success flips between repetitions; Hbase/Htools each delivered
only their first B repeat, and no extra-component benefit emerges.

Heavyweight new-period evaluation began only after both model attempts ended.
Unrelated development containers remained on the host. Equal per-attempt limits
do not make elapsed time a clean speed benchmark. Preparation and evaluation
used zero real task-provider requests; developing/evaluating agent usage is
separate and unmeasured by this ledger. The earlier brief evaluation overlap
remains part of the historical timing limitation.

## Boundaries

This is an amended development series with a disclosed calibration gap, not
independent confirmatory lift evidence. The pair fails to reproduce Hbase's UFO
success; no automatic campaign or product change is scheduled.

The historical general-verifier `PROCESS_CONTAINMENT_UNAVAILABLE` remains
separate. It was not rediagnosed or bypassed. Targeted scheduler tests and actual
container stops are not a full CI/platform pass. PR #25 stays Draft on its
existing base. No force push, merge, release, package publication, manual Actions
or full matrix was run. Full trees, dependencies, credentials and private
sessions remain uncommitted.
