# Luna delivers both selected regressions; one investigation remains unresolved

Three fixed targeted tasks produced two correct ordinary test patches and a
preserved control. **Strict task completion is S=2/3, normal terminal delivery
T=3/3, and S∧T=2/3.** The quick-lru regression is valid, but Luna did not execute
its assigned variant: the author reported unresolved sensitivity after a
reproducible dependency-resolution failure in `harness_sense`. Later evaluator
success is recorded separately and does not complete that author investigation.

**Decision: do not advance to integration testing in new full tasks on this
runtime yet.** Test-generation ability is demonstrated on both deliberately
selected APIs, but autonomous completion of the investigation transferred only
partially. The dependency-selection defect is concrete evidence, not a reason
to invent another reviewer or redesign the tool interface. No fix, integration,
new campaign, fourth attempt, default change, merge or release was performed.

## Fixed setup and limits

The [pre-run plan](PLAN.md), [common task](TASK.template.md), and
[frozen inputs](frozen-inputs.json) precede every real request. Runtime files,
reusable prompt, tool description, engine and mutators are unchanged at
`46572619e8a9d567f680667bdf6083a2e82be406`. The only shared launcher modification
admits exactly three H1 slots and retains their existing request capture.

OpenCode 1.18.26, `openai/gpt-5.6-luna`, high, direct, A=0, B=0, sensitivity on;
900 seconds per task including the shared 180-second diagnostic budget. Fixed
order A → B → C; one native author per attempt, separate containers/worktrees and
state. Each run also has the existing bootstrap session; it is not a second
author. There were no real smokes, retries, replacement authors or interventions.
All 73 upstream requests have bound terminal responses and known usage.

These are intentionally selected development examples with known solutions,
not a representative benchmark. The evaluator supplied the exact standard
mutation diff as an explicit advantage; Luna did not select it. Only the full
original contract, public project sources/tests, uncommitted seed patch and
common task with contract/method/diff substitutions reached each author.
Fresh workflow refs had to come from the tool. Evaluators, prior answers,
other attempts, historical Git refs and host research directories were absent
from the author mounts. Git bases retained the incoming production diff.

- **A, denque 2.1.0:** existing patch 27 has correct `removeWhere` production and
  supplemental tests that miss the assigned `_copyArray(false) → true` behavior.
  [Task](inputs/case-a/TASK.md), [seed](inputs/case-a/input.patch),
  [variant](inputs/case-a/variant.diff).
- **B, quick-lru 7.3.0:** existing patch 38 supplies production, declarations,
  type tests and documentation; its added runtime `test.js` hunk is omitted
  during input construction, preserving the original 115-test upstream suite.
  This is an explicitly prepared coverage hole. The complete patch's first
  eight variants were already rejected, so it was not used unchanged. The
  assigned variant replaces `this.#cache.has(key)` with `false`.
  [Task](inputs/case-b/TASK.md), [seed](inputs/case-b/input.patch),
  [variant](inputs/case-b/variant.diff).
- **C, denque:** existing correct patch 28; the assigned empty error-message
  string is allowed because the contract requires an Error without fixing its
  text. [Task](inputs/case-c/TASK.md), [seed](inputs/case-c/input.patch),
  [variant](inputs/case-c/variant.diff).

[Preparation evidence](preparation.json) includes fresh baselines, real standard
engine generation, hidden public-API counterexamples for A/B, the control,
source revisions and the actual installed preflight. All three full ordinary
`npm test` baselines passed. Container preflight demonstrated sense, a fresh
post-test snapshot, addressed replay and portable terminal delivery using a
scripted provider with zero real requests. The known full-verifier
`PROCESS_CONTAINMENT_UNAVAILABLE` limitation remains separate: it was neither
bypassed nor represented as a full verification pass.

## Per-case results

S means the assigned investigation was completed correctly; honest unresolved
is not S. T requires a normal returned result, one author, `step_finish: stop`,
normal native process exit, applicable terminal patch and verified termination.
These metrics do not reinterpret historical Q or D, and do not measure complete
original multi-file task delivery.

| Case | Author observations and scenario | Final author patch | Actual sensitivity check | Preservation | S / T | Native seconds | Requests / known tokens |
| --- | --- | --- | --- | --- | --- | ---: | ---: |
| A | 3 full sense calls; empty deque must not call predicate or remove absent values | [2 ordinary tests](patches/case-a-author.patch) in `test/denque.js` | Author final sense and offline exact variant: baseline passes, new assertion rejects `4 !== 0`; no addressed replay | Old tests intact; production/declaration/dependency files unchanged; 57 tests + TS and independent checks pass | yes / yes | 294.294 | 26 / 991,413 |
| B | Public unexpired `undefined` hit test found before diagnosis; sense baseline fails `xo: not found`, no fresh variant/ref | [3 ordinary tests](patches/case-b-author.patch) in `test.js` | Evaluator only: same AVA suite passes baseline and rejects assigned mutant at `test.js:43`, `computed` vs `undefined` | Original 115 tests intact; production/dependency declarations unchanged; 118 tests + XO/TSD and independent checks pass | no / yes | 364.823 | 22 / 837,955 |
| C | Fresh sense ref, temporary public Error.message observation, 1 addressed replay, then full sense after removing diagnostic assertion | [No author delta](patches/case-c-author.patch); input preserved exactly | Temporary message assertion passes baseline/fails variant; final ordinary suite passes both, as contract permits | 55 tests + TS and independent checks pass; no new restriction | yes / yes | 193.341 | 25 / 599,813 |

All terminal patches were applied to fresh ordinary copies and reproduced the
captured author source bytes and executable modes. Canonical terminal patches
include the incoming seed: [A](patches/case-a-terminal.patch),
[B](patches/case-b-terminal.patch), [C](patches/case-c-terminal.patch). Author-only
patches above isolate newly delivered work. No model patch was manually fixed.
Detailed [assessments](assessment.json), [results](results.json) and author
observations [A](attempts/case-a.json), [B](attempts/case-b.json),
[C](attempts/case-c.json) retain failed commands and internal `incomplete`
workflow status separately from S/T.

A's new tests follow its first real observation. Its final report also credits
already supplied implementation/types/docs; the evidence credits only its test
changes. B's correct regression precedes its failed diagnostic and provides no
evidence that a tool observation caused it. Its deterministic unexpired-hit
assertion independently rejects the assigned mutation; the additional TTL test
uses a real-time delay, which is not needed for that causal rejection. Neither
import/setup errors nor different test data explain the evaluator's A/B failures.
C investigated a real message difference and deliberately did not preserve an
assertion based only on the current implementation.

## B's observed limitation

[Offline reproduction](b-baseline-reproduction.json) confirms this sequence on
the unchanged installed runtime: initially the nested worktree resolves project
dependencies to `/work/repo/node_modules`; ordinary `npm test` passes and creates
three local files under `node_modules/.cache` (AVA/XO). `sensitivityPlan` then
selects that existing but incomplete local directory. Its copied baseline
cannot find `xo` and exits 127 before the engine runs. The fresh ordinary-copy
preflight had not exercised this post-command nested-worktree cache state.

The author subsequently attempted `npm ci --ignore-scripts`; network isolation
caused `EAI_AGAIN`. This was a completed local tool failure, not an unknown
OpenAI submission, so the existing launcher proceeded to C. Dependency
manifests and delivered source remained unchanged; transient `node_modules`
bytes are excluded from candidate capture and are not independently certified.
No provider authorization, network boundary or containment was relaxed, and no
runtime change or extra model attempt was made.

## Costs and evidence boundary

[Costs](costs.json) preserve 2,400,350 input + 28,831 output = **2,429,181 known
tokens**. The 1,203,200 cached-input tokens and 18,045 reasoning tokens are
subsets, not additional totals. Unknown usage: **0 requests**. Native execution
is 852.458s plus 0.164s cleanup; input preparation/capture around the runs is
8.874s. The 51.703s of author diagnostics (48 commands) are inside native time.

Model-free preparation, the unused complete quick-lru candidate, scripted
preflight/transport checks, post-stop ordinary and independent checks, and the
B failure reproduction are accounted separately. Developing-agent usage and
wall-time boundaries are recorded in [developer usage](developer-usage.json);
this is a timed snapshot, with later reporting/publishing usage explicitly
outside its coverage. No monetary cost is inferred from model metadata.
Raw streams, complete repositories, credentials and transient state stay local.

There is no new plain arm or paired comparison between broad and targeted task
formulations. This does not prove that the formulation is better or that the
harness improves Luna's overall delivery rate. Earlier scores are unchanged;
historical attempts provide context only. Both selected regressions are real
Luna work, while the full autonomous investigation on the second API remains
unresolved on this candidate.
