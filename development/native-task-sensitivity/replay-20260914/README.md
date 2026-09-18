# Addressed replay works locally; this development comparison is a tie

`harness_sense` can now repeat one previously generated variant with the current
ordinary project tests. Local installed/container fixtures delivered a justified
API regression through a terminal patch. **Luna did not use addressed replay in
either S1 attempt, and the four-run comparison shows no additional complete
correct delivery or useful diagnostic-to-test chain.** The feature stays
experimental and opt-in; sustained product advantage remains unproven.

The ordinary check already supported running a new test against baseline and all
standard variants. This extension saves repeating the other variants; it is not
a new mutation engine or an automatic counterexample search. See the
[complete invocation and setup example](../../../docs/native-task/SENSITIVITY.md).
Each returned diff includes a short workflow reference and ready-to-copy replay
arguments. Updated tests invalidate old observations but preserve the mutation
definition; changed production requires new diagnosis. A fresh baseline and
exactly one selected variant share the same tests, command and 180-second task
budget. Permissions, npm lifecycle, copying and cancellation remain enforced.

## Four actual outcomes

These intentionally selected, previously studied development inputs are fixed in
[the pre-run plan](PLAN.md) and [frozen inputs](frozen-inputs.json). Case 1 starts
with correct production and a missing regression; case 2 is a usable control.
Both use the same complete original denque `removeWhere` task and public seed
patches, with the production diff visible against the original Git base.
S0 uses the previous sensitivity at a9155778; S1 uses addressed replay and its
usage instruction at e2089247. **Both have sensitivity enabled**; S0 is not the
historical H0 without the tool. A/B are disabled, direct uses one author session.

| Slot / input | Arm | Q | D | Sense / replay calls | Native time | Known tokens | Patch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 / missing regression | S0 | no | yes | 1 / 0 | 177.487 s | 505,249 | [01](patches/01-case-1-S0.patch) |
| 2 / missing regression | S1 | no | yes | 1 / 0 | 116.003 s | 317,764 | [02](patches/02-case-1-S1.patch) |
| 3 / good control | S1 | yes | yes | 1 / 0 | 197.040 s | 583,500 | [03](patches/03-case-2-S1.patch) |
| 4 / good control | S0 | yes | yes | 1 / 0 | 188.265 s | 421,195 | [04](patches/04-case-2-S0.patch) |

Q means a complete correct applicable patch under the frozen task/regression
acceptance. D records normal autonomous terminal handoff: one native author,
normal exit, `step_finish: stop`, verified termination and an applicable terminal
patch. All internal workflow observers reported `incomplete`; those statuses
remain in the artifacts and are not rewritten as success. Terminal handoff alone
does not establish Q or a successful product outcome.

All four actual terminal patches apply in ordinary Git copies and reproduce the
captured author bytes/modes. All pass the project suite (55 runtime tests and
TypeScript) and existing independent public behavior checks. No author patch
was manually corrected. Offline sensitivity is evaluator evidence, separate
from author calls. See [assessments](assessment.json), [results](results.json)
and per-attempt observations [01](attempts/01.json), [02](attempts/02.json),
[03](attempts/03.json), [04](attempts/04.json).

On case 1, both final suites still accept the standard BooleanLiteral change
`_copyArray(false)` to `_copyArray(true)`. The task permits visiting only initially
present values: an empty deque must call the predicate zero times. The known
local API example demonstrates four calls on that variant, and the corresponding
ordinary regression rejects it. Neither author delivered that regression.
S0 added a `toArray()` setup assertion at event 27 before diagnosis at event 34,
then claimed only equivalent/allowed survivors. S1 received the survivor and
replay arguments at event 20 but made no project edit or repeated diagnostic.
A mutation difference alone is not the justification for the expected zero;
the initially-present-values requirement supplies that justification.

On the control, S0 kept the supplied patch unchanged. S1 added length and
shift/unshift sequence assertions after a predicate error, plus capacity wording
in docs, at event 19 before diagnosis at event 33. Existing assertions remain.
Those improvements are not attributed to the later observation. The only
survivor changes an unspecified Error message, which creates no new requirement.
No new control regression was observed.

S0 and S1 therefore each deliver Q=1/2, D=2/2, and Q-and-D=1/2. There are zero
useful author diagnostic-to-test chains and zero addressed author repeats.
The predeclared practical-help criterion is not met. Lower aggregate S1 time
or token usage in these two selected inputs is not evidence of a quality gain.
No criteria were changed, runs excluded, replacements made or next batch started.

## Local verification and execution limits

[Local evidence](local-verification.json) covers fresh baseline/selected-variant
commands after test edits, retained mutation definitions and stale observations,
wrong-workflow/changed-production references, independent writable source and
dependency copies, equivalent numeric comparison, allowed message changes,
import/setup failure, insufficient/shared budget and cancellation. The ordinary
full-generation path remains covered. Native fixtures also exercise aliases,
parallel serialized calls, denied commands/lifecycle/dependency reads, disabled
tool registration, workflow checks and template configuration.

The final installed container path uses the same read-only image and prepared
bundle as the model runs. A small module and the known denque development example
both receive real standard-engine observations in a scripted native author
session, add a project test, run exactly two fresh sides and deliver the test in
a terminal patch that passes in an ordinary project copy. The known example is
explicitly scripted offline evidence, not an independent discovery by Luna.
A sleeping diagnostic child is cancelled with termination verified. Two denque
fixture preparation errors (multiline-task JSON comparison and a value-module
file lookup) were fixed before model admission; failed local attempts remain
accounted. An initial host fixture needed loopback permission. None used a real
provider. One bounded implementation review and changed-source whitespace passed.

Both runtime bundles and public inputs were frozen before the first model
request and remained unchanged. OpenCode 1.18.26, Luna/high, 900 seconds per task
and 180 seconds diagnostics were fixed. The common corrected launcher retains
its stop/retry policy; only four-slot S0/S1 admission and arm mapping were added.
[Execution integrity](execution-integrity.json) records all four captures,
verified termination, removed containers, zero transport errors, no duplicate
request bodies and preserved historical pauses. The initial launch approval
review stopped execution before any task began; the reviewed exact public-data
scope and existing authorization were then admitted. No bypass or provider retry.

The required full verifier remains unavailable with
`PROCESS_CONTAINMENT_UNAVAILABLE`, both sandboxed and elevated. Targeted checks
are not a full CI pass. No manual Actions or full platform matrix was run; no
check or containment policy was disabled. Historical results are unchanged.

## Usage and retained artifacts

The four task-runs made **69 actual provider requests**, including bootstrap/title
work: **1,802,104 input + 25,604 output = 1,827,708 known tokens**, unknown-usage
requests **0**. Cached input 778,240 and reasoning 15,373 are subsets, not added
again. Per-request records are retained separately for
[01](attempts/01-requests.json), [02](attempts/02-requests.json),
[03](attempts/03-requests.json), [04](attempts/04-requests.json).

Author diagnostics ran 36 project commands and consumed 44.746 s inside the
678.795 s of native execution: engine 1.346 s, preparation 21.734 s, project
commands 20.169 s, plus adapter overhead. Native cleanup was 0.230 s;
preparation/capture outside native execution was 13.459 s. The full
[cost record](costs.json) separates admission, successful and failed scripted
preflights, offline verification and model usage. Aggregate developer preparation
and monetary charges are unavailable, not zero.

Complete project trees, credentials, raw streams and private sessions stay local.
Only compact evidence, public patches and reproduction scripts are committed.
Runtime imports no development/evaluator code. No merge, release, package
publication or default change is performed.
