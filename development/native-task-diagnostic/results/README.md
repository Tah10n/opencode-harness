# H1 directed stateful diagnostic: hypothesis closed

**No advantage of H1 in restored coverage was demonstrated.** H0 and H1 each
repair A, fail to deliver a repair for B, and preserve the correct control.
H1 adds actual-state preconditions to its queue suites, but does not repair more
substantive defects. No new regression or artificial nonempty requirement was
observed in the control. This closes this hypothesis with the existing wording;
there is no next formulation, harder input search, retry or automatic benchmark.

This is deliberately seeded development diagnosis, not a measurement of natural
error frequency, statistical superiority or general harness/product lift. Plain
was not measured. The B pair is limited by identical early native directory
denials, so it supplies no completed-author evidence about precompleted setup
repair. That limitation does not turn its empty patches into successful deliveries
or justify replacement runs.

## All six outcomes

| Slot | Input | Arm | Delivered outcome | Internal status | Seconds | Provider requests | Tools | Observed tokens |
|---:|---|---|---|---|---:|---:|---:|---:|
| 1 | queue-lost-retry | H0 | coverage repaired | incomplete | 121.362 | 14 | 20 | 134,598 |
| 2 | queue-lost-retry | H1 | coverage repaired | incomplete | 144.304 | 19 | 27 | 207,798 |
| 3 | editor-precompleted | H1 | unrepaired; empty patch | incomplete | 45.028 | 6 | 13 | 39,168 |
| 4 | editor-precompleted | H0 | unrepaired; empty patch | incomplete | 49.351 | 7 | 13 | 46,213 |
| 5 | queue-valid-empty | H0 | control preserved | incomplete | 146.898 | 20 | 24 | 215,602 |
| 6 | queue-valid-empty | H1 | control preserved | incomplete | 191.462 | 27 | 33 | 352,114 |

| Quantity | H0 | H1 |
|---|---:|---:|
| Seeded problems addressed, demonstrated by delivered repair | 1 | 1 |
| Seeded problems with detection unestablished after early denial | 1 | 1 |
| Correct substantive repairs, out of two defective inputs | 1/2 | 1/2 |
| New regressions observed across three inputs | 0 | 0 |
| Correct control preserved | 1/1 | 1/1 |
| Suitable complete task patches, including the control | 2/3 | 2/3 |

“Detected” above is an inference from the delivered semantic repair, not an
assertion about unrecorded reasoning or an explicit diagnosis count. The retained
prose does not establish a precise original-cause explanation for every author.
The control's documentation/test rewrite is not counted as a discovered problem
or repair. All six production implementations remain byte-identical to their
initial, already-correct implementations. All six offline ordinary suites,
`npm test`, original test suites and independent public-behavior checks pass;
those green results alone do not qualify the two B patches.

## What the patches actually cover

**A: lost retry.** Both authors replace the shared-state/adaptive-expectation
fragment with a fresh populated queue and call `work` with a real failed send.
Both assert that the failed job returns to ready with its payload, leaves no lease,
and preserves the unrelated job; later work consumes the queued jobs successfully.
Both preserve success and lawful idle coverage. H0 does this without adding an
actual-store precondition. H1 asserts the actual ready/leased snapshot before the
call. Neither simply adapts a mock to the empty state, and both fixes are in the
final patch.

In separate offline copies, suppressing only `retry` leaves the failed job leased
instead of ready. Both A suites fail at their **post-action state assertion**:
H0 `test/worker.test.mjs:20`, H1 `test/worker.test.mjs:50`. Return arrays remain
success-shaped; syntax, module loading, success and idle tests still work.
This demonstrates restored transition sensitivity rather than merely added text
or the presence of an assertion.

**B: precompleted cancellation.** Both authors attempt `npm test` with a working
directory ending at the harness run directory, omitting `/worktree`. Native
`external_directory: deny` rejects that tool. The unchanged controller ends the
individual task without correction or further provider submission. Termination,
capture and cleanup are verified; under the existing scheduler this is a terminal
local task failure, not an OpenAI authorization refusal or unknown submission.
Remaining frozen slots therefore run. Neither denial is bypassed or retried.
Both terminal patches are empty. The original setup still cancels the replacement
before `apply`, and its final absence check still passes with consumer cancellation
disabled. Coverage is **not restored**, even though production behavior and ordinary
tests pass. No failing state precondition detects this setup during either run.

**Correct control.** Both retain meaningful populated processing and a genuinely
empty queue whose `send` is never invoked. Both rewrite/format tests and document
the already-correct contract. H0 omits actual-store preconditions; H1 includes them
and explicitly permits empty state. Neither changes production or requires work
where the contract permits none. Offline disabled retry fails their populated
postconditions: H0 lines 36 and 49; H1 lines 41 and 64. Idle still passes. The
rewrite is unnecessary to repair a defect, but no unnecessary contract change or
new error was observed.

All six internal statuses remain `incomplete`, with zero corrections used out of
three available. B retains native directory denial. The other four retain earlier
uninterpreted sequential-tool scheduling failures. These are reported as internal
limitations and have not been repaired or recast as successful workflow statuses.
Patch suitability is assessed independently.

## Expenses

| Arm | Seconds | Provider requests | Tools | Input tokens | Output tokens | Cached input | Reasoning output | Total observed tokens |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| H0 | 317.611 | 41 | 57 | 383,285 | 13,128 | 81,920 | 5,268 | 396,413 |
| H1 | 380.794 | 52 | 73 | 583,766 | 15,314 | 169,984 | 5,480 | 599,080 |

Total task time: **698.405 seconds** across **93 internal provider requests**,
130 tool calls and **995,493 observed tokens**. H1 used 63.183 more seconds,
11 more provider requests and 202,667 more observed tokens than H0, without an
additional repair. These costs include all internal stages and repeated context;
they are not an isolated causal cost estimate of the rule. Cached input is already
included in input; reasoning is a subset of output. Every forwarded request has
usage recorded. Monetary charges are unavailable; unknown usage would remain null,
not zero. No paid quota probe, account/model/effort switch or retry occurred.

## Preparation and evidence limits

All three inputs and complete tasks were chosen before any model result, without
preliminary H0 runs. A retains the authored vacuous fragment from the existing
compact queue project. B deliberately adds setup cancellation to a correct editor
implementation. The control uses authored meaningful queue coverage. No prior
model answer, successful P patch, reconnect input, reference or evaluator entered
an author environment.

Fourteen local preflight cases establish: both defective initial suites tolerate
the lost transition; guards detect their broken setup; correct reference and a
different valid implementation without a new actual-state precondition pass;
repaired suites fail substantively under disabled transition; a precondition alone
still passes; the correct control and legitimate idle case remain valid. Each
evaluator requirement is mapped to TASK.md in the [frozen preparation](../README.md).
This is bounded evidence, not exhaustive acceptance of all possible implementations.
No exception subtype, helper name, test layout or reference-specific implementation
is required. Evaluator and task hashes remain unchanged during all model runs.

Both existing scripted container preflights passed with 8 fixture requests each
and **zero real provider requests**. The initial sandboxed preflight attempt could
not access Docker/loopback and produced no model call; the unchanged script then
passed with the required host execution permission. Existing materialized H0/H1
and dependency bundles were reused byte-for-byte; their sole difference is the
recorded H1 author instruction. The retained [schedule-only diff](../schedule-only.diff)
changes only nine-slot/P-H0-H1 cardinality validation to six-slot/H0-H1 validation.
Provider forwarding, native launcher, controller, prompts, observer, permissions,
three-correction limit and shared 900-second task deadline are unchanged.

Every run used OpenCode 1.18.26 and openai/gpt-5.6-luna/high with fresh sessions and
separate project copies. Actual container inputs match the frozen manifests before
provider access. Containers have no network; authorization remains in the host
relay. Independent evaluation runs only after all model runs stop. All 11,113
frozen file hashes remain unchanged. All final patches reapply with identical bytes
and executable modes, including the two empty patches. Original author checkouts
remain unchanged. Task-created containers are removed and this is verified in
[cleanup evidence](cleanup.json). Raw native events and test logs remain local;
public artifacts contain patches, metrics, structured outcomes and selected evidence.

Runtime was not changed. Validation is limited to these inputs, evaluator controls,
existing scripted preflights and result reproducibility. No full regression suite,
new historical-archive audit, manual Actions, full platform matrix, merge, release
or default change was performed. Automatic required checks remain enabled.

The scoped staged whitespace check passes for source, tasks, evaluator and JSON/Markdown.
The unfiltered Git check reports unified-diff blank context markers in the retained
patches and schedule diff. Those exact evidence bytes are intentionally preserved;
the unfiltered check is recorded as failed, not relabeled green.

The [previous nine-run series](../../native-task-stateful/results/README.md) remains
separate and unchanged: frozen results 2/3 per arm, separate original-contract
adjudication 3/3 per arm, with no complete-delivery gain. This diagnostic adds no
claim of general product advantage and is closed without an automatic next series.

Artifacts: [plan](../plan.json), [freeze](../freeze.json),
[preflight](../evaluator-preflight.json), [frozen evaluator](../evaluate.mjs),
[per-run semantic assessments](outcomes.json), [offline checks](offline-checks.json),
[metrics](metrics.json), [accounting](accounting.json),
[patch manifest](patch-manifest.json), [artifact validation](artifact-validation.json).

- [queue-lost-retry-H0 final patch](patches/queue-lost-retry-H0/final.patch)
- [queue-lost-retry-H1 final patch](patches/queue-lost-retry-H1/final.patch)
- [editor-precompleted-H1 final patch](patches/editor-precompleted-H1/final.patch)
- [editor-precompleted-H0 final patch](patches/editor-precompleted-H0/final.patch)
- [queue-valid-empty-H0 final patch](patches/queue-valid-empty-H0/final.patch)
- [queue-valid-empty-H1 final patch](patches/queue-valid-empty-H1/final.patch)
