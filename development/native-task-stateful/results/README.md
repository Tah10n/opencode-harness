# Nine fixed P/H0/H1 stateful task runs

The executable-state technique appeared in two of three H1 deliveries, but did
not improve complete patch delivery on these tasks. By the original task contract,
P, H0 and H1 each delivered 3/3 suitable patches. No H1 precondition was observed
catching a broken setup during the model runs. This stage does not establish a
product advantage or close the broader goal of demonstrated superiority.

There is a material evaluator limitation: the frozen queue evaluator requires
`TypeError` for invalid `limit`, while the frozen task specifies validation before
mutation without choosing an exception subtype. All three authors used
`RangeError`. The raw frozen result is therefore **2/3 per arm**, unchanged.
A separate offline check of the original contract passes all three queue patches;
it removes only the unsupported subtype restriction, retains every input and
no-mutation/send assertion, and is applied equally to P/H0/H1. These are supplemental
adjudications, not retroactive frozen-evaluator passes. The defect was noticed
while reading the first P delivery; no task, reference, frozen evaluator, model
input, schedule or instruction was changed. Preflight did not validate every valid
alternative, which weakens this comparison's evaluator-readiness evidence.

The original requirement, preserved behavior, delivered regressions, actual
transition coverage and documentation were inspected for every patch. All nine
ordinary project suites and original suites pass offline. All nine delivered
suites fail when the target store transition is disabled in a separate copy while
keeping a success-shaped return. Failure details confirm result/state checks,
not syntax or loading errors. No new regression was observed in this bounded scope.
The old vacuous fragment is retained by some authors, but independent meaningful
regressions supply equivalent coverage; retaining that fragment is not itself
credited as coverage or rejected as a patch defect.

| Task | Arm | Original contract / complete patch | Raw frozen evaluator | Meaningful delivered transition | Workflow | Corrections | Seconds | Requests | Tools | Observed tokens |
|---|---|---|---|---|---|---:|---:|---:|---:|---:|
| queue-batch | P | pass | fail: unsupported subtype | yes | ordinary OpenCode | — | 98.225 | 10 | 18 | 87,299 |
| queue-batch | H0 | pass | fail: unsupported subtype | yes | incomplete | 3 | 284.066 | 30 | 37 | 715,077 |
| queue-batch | H1 | pass | fail: unsupported subtype | yes | incomplete | 0 | 157.825 | 17 | 25 | 202,597 |
| editor-cancel | H0 | pass | pass | yes | incomplete | 0 | 148.718 | 16 | 23 | 172,095 |
| editor-cancel | H1 | pass | pass | yes | incomplete | 1 | 287.988 | 31 | 36 | 696,444 |
| editor-cancel | P | pass | pass | yes | ordinary OpenCode | — | 90.663 | 11 | 18 | 98,319 |
| invite-single-use | H1 | pass | pass | yes | incomplete | 2 | 338.441 | 42 | 45 | 1,058,936 |
| invite-single-use | P | pass | pass | yes | ordinary OpenCode | — | 101.235 | 12 | 19 | 113,364 |
| invite-single-use | H0 | pass | pass | yes | incomplete | 3 | 306.087 | 37 | 41 | 1,089,970 |

Every row has required project regressions and documentation, preserved behavior,
a suitable whole patch under the original task contract, and no observed new
regression. The queue rows need the evaluator qualification above. These verdicts
are independent of internal workflow status. All six harness runs finish with
`incomplete`; retained uninterpreted command failures and, in some cases, an earlier
additional test invocation remain unresolved internally. Later successful suites
and a suitable patch do not rewrite those statuses. Controller behavior is outside
this change; no fix or additional model run was added.

| Task | P | H0 | H1 |
|---|---|---|---|
| queue-batch | Fresh meaningful setup and postconditions; no executable state precondition | Fresh meaningful setup and postconditions; no executable state precondition | Did not execute the added technique; independent legacy retry is restored, but required state is not asserted immediately before the transition |
| editor-cancel | Populated cancellation regression without explicit state assertion before action | Populated cancellation regression without explicit state assertion before action | Reads and asserts staged replacement, existing publication and unrelated drafts before `apply`; verifies removal and preserved state afterward |
| invite-single-use | Valid use/replay, expiry and independent removal coverage; no explicit state read before action | Independently uses `peek` to assert absence before the legal no-work `accept` scenario; this remains H0's result | Independently selects `peek` of the actual pending record before valid/expired `accept`; verifies removal, replay, membership and unrelated records; also allows the empty-state scenario |

The instruction gave no task-specific predicate. In the editor and invitation H1
runs, Luna selected the assertions from the task and existing read APIs. They
observe actual stored state, not just constructor input, and the postconditions
survive in the delivered patch. No observed predicate was fitted to an incorrect
state or used to demand an unauthorized production change. **Setup failure caught
by a precondition: 0/3 H1. Setup repair attributable to a failing precondition: 0/3.**
The editor's first failing tests exercised unimplemented cancellation/validation;
the invitation failure concerned unimplemented single-use/expiration. Those are
behavior failures, not evidence of setup detection. The scenarios' intended
behavior is supplied, but no causal claim that the new rule restored them is made.

Thus populated-transition preconditions appear in H1 2/3, H0 0/3, P 0/3. Including
valid empty-state applications gives H1 2/3, H0 1/3, P 0/3. This distinction prevents
penalizing a correct idempotency test or erasing independently chosen H0 behavior.
The local scripted fixture demonstrates a failed setup being detected and repaired;
it is not counted as an additional Luna success.

| Arm | Total seconds | Requests | Tools | Input tokens | Output tokens | Cached input tokens | Reasoning output tokens | Total observed tokens |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| P | 290.123 | 33 | 55 | 286,579 | 12,403 | 69,120 | 4,967 | 298,982 |
| H0 | 738.871 | 83 | 101 | 1,946,876 | 30,266 | 350,208 | 14,834 | 1,977,142 |
| H1 | 784.254 | 90 | 106 | 1,925,243 | 32,734 | 463,872 | 15,662 | 1,957,977 |

H1 versus H0 used 45.383 additional seconds
(6.1%), 7 additional requests and
5 additional tool calls; total observed tokens were
19,165 lower. H1 took
2.70 times P's task time. Aggregate task time was
1813.248 seconds across 206 provider requests.
These are observed costs, not an isolated estimate of the instruction's compute:
corrections, command failures, output size and caching also differ. All forwarded
requests have recorded usage; input totals include repeated context and cached input,
and reasoning is a subset of output. Monetary charges are not exposed. No paid
quota probes, retry, model switch or effort search occurred.

All nine runs used OpenCode 1.18.26, openai/gpt-5.6-luna/high, a fresh session and
separate project copy, and a 900-second shared task deadline including harness
stages. The existing container launcher and provider boundary were retained;
only schedule/arm/template selection was parameterized for the nine slots.
The container has no network; authorization stays in the host relay. Only the
initial public project, task and ordinary instructions/tests enter a model container.
Reference and independent checks are supplied only to offline evaluation copies.
Two existing scripted container preflights passed (8 local fixture requests each,
0 real provider requests). No reconnect model run, observer intervention, manual
patch repair, second formulation, manual Actions, full platform matrix, merge,
release or default change was performed.

All 11,127 frozen file hashes remain unchanged. Each final patch reapplies cleanly
and reproduces the graded bytes and executable modes. Original model input manifests
match the actual containers. Termination and cleanup are verified for all model
runs and offline evaluations. The result data retains the distinction between
ordinary suite, preserved suite, raw acceptance, supplemental contract and sensitivity.

Local technique evidence is in [local-replay.json](../local-replay.json), with
six real-process cases: vacuous original pass; guarded setup failure; repaired
setup pass; postcondition failure with disabled transition; valid empty-state
pass; and passing precondition without postcondition despite a disabled transition.
The installed fixture changes a real project test, executes the failing assertion,
repairs setup in the same native author session, reruns the project test and
emits a patch. Direct native task/template/review regressions passed. One independent
review found two evaluator gaps (unsafe integer and clock count for existing
invitations); both were fixed and rechecked before freezing. The later exception
subtype defect remains explicitly documented rather than hidden by rewriting.

The minimal revision remains an experimental candidate for separately authorized
assessment on new tasks: actual state assertions appeared in two H1 patches,
but no complete-delivery gain or observed setup-detection gain occurred. This
series does not justify another wording, reviewer or larger evaluation automatically.
The three compact synthetic tasks, one run per combination, evaluator limitation,
and variable harness overhead prevent any durable general superiority claim.

Historical addendum: the prior reconnect H D0→D1 statement “changed only the test”
was wrong; a production condition changed as well. Historical artifacts and grades
remain unchanged. Reconnect was not re-run by a model in this stage.

Artifacts: [per-run assessments](outcomes.json), [metrics](metrics.json),
[accounting](accounting.json), [offline checks](offline-checks.json),
[patch manifest](patch-manifest.json), [mechanism examples](mechanism-examples.json),
[evaluator limitation](evaluator-limitation.json), [frozen plan](../plan.json),
[freeze and hashes](../freeze.json), [exact instruction diff](../instruction.diff).

- [queue-batch-P final patch](patches/queue-batch-P/final.patch)
- [queue-batch-H0 final patch](patches/queue-batch-H0/final.patch)
- [queue-batch-H1 final patch](patches/queue-batch-H1/final.patch)
- [editor-cancel-H0 final patch](patches/editor-cancel-H0/final.patch)
- [editor-cancel-H1 final patch](patches/editor-cancel-H1/final.patch)
- [editor-cancel-P final patch](patches/editor-cancel-P/final.patch)
- [invite-single-use-H1 final patch](patches/invite-single-use-H1/final.patch)
- [invite-single-use-P final patch](patches/invite-single-use-P/final.patch)
- [invite-single-use-H0 final patch](patches/invite-single-use-H0/final.patch)
