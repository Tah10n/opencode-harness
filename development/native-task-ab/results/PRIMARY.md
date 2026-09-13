# Primary development result

The retained patches score **P 3/6, H00 6/6, H10 5/6, H01 6/6, H11 6/6**
under the rubric fixed before execution. H11 beats P on three tasks and loses on
none, but **does not improve full delivery over H00**. The data supports a small
conditional transfer check of H11; it does not establish an incremental quality
benefit from A, B, or their combination. Both components remain experimental and
default off. The [final transfer result](FINAL.md) is incomplete after an unknown provider submission.

| Task | P | H00 | H10 | H01 | H11 |
| --- | ---: | ---: | ---: | ---: | ---: |
| limitFunction controls | 1 | 1 | 1 | 1 | 1 |
| atomic bindMethods | 0 | 1 | 1 | 1 | 1 |
| abortable queue waiters | 0 | 1 | 1 | 1 | 1 |
| clearQueue reason | 0 | 1* | 0* | 1 | 1 |
| deduplicated listenerCount | 1 | 1 | 1 | 1 | 1 |
| clear discarded count | 1 | 1 | 1 | 1 | 1 |

`*` A 900-second task deadline prevented native completion. H00's captured patch
is a full delivery despite failed handoff; H10's is a useful implementation with
broken delivered tests. Neither was retried. The other 28/30 native runs completed.
All 30 local process stops, captures, forwarding shutdowns and relay removals were
verified. The two interrupted provider requests have unknown server completion
and missing usage, not zero usage. No global unknown-submission or quota pause
occurred; continuation after own-deadline local stop followed the frozen scheduler.

[All 30 grades, claims and patch links](primary.json), [contrasts](contrasts.json),
[cost by configuration](accounting.json), [transfer gate](transfer-gate.json).
P is ordinary OpenCode; H00 is the unchanged direct foundation; H10=A, H01=B,
H11=A+B on that foundation. All executing calls used OpenCode 1.18.26,
openai/gpt-5.6-luna/high with the same 900-second task deadline. Primary candidate
`1cebebb0`, runtime implementation `cf1360bc`; exact snapshots/order/digests are
in [the public freeze](../FREEZE.json). No version changed between primary outcomes.

## What full-patch review found

All 30 frozen independent behavior/type checks passed. The original project
workflow with the actual delivered tests passed for 29/30. Those automated
results are insufficient for the full rubric:

- **P / bindMethods:** implementation correct, but the added receiver test emits
  with no listener and then asserts a zero listener count. It does not prove an
  event reaches the original emitter. A deliberately wrong receiver version
  still passes every delivered bindMethods test. Required receiver regression
  coverage is absent; this is a delivery gap, not a claimed implementation bug.
- **P / abortable waiters:** onEmpty gains an active-event path even without a
  signal, changing an explicitly preserved contract. With the last queued task
  newly active and blocked (size=0, pending=1), the original onEmpty remains
  unsettled until its existing empty event, while the patch has already settled.
  Baseline/candidate traces confirm the difference. The new cancellation behavior
  passes independent checks; preservation fails.
- **P / clearQueue reason:** implementation correct, but the disabled-option test
  discards the returned queued promise and only checks invocation/counts. It
  cannot establish required discard-without-settlement behavior. The old suite
  likewise contains no meaningful settlement assertion for that scenario.
- **H10 / clearQueue reason:** ordinary npm test fails at 16 lint errors. A focused
  unchanged-patch AVA run additionally fails at `test.js:289` (`undefined` versus
  `1`): the new wrapper tests access activeCount/pendingCount, which do not exist
  in this task snapshot. Those controls belong to a different task. The reason
  implementation itself passes independent behavior/types. Native handoff timed out.

All full diffs were inspected, including prior test changes, docs and public type
uses. Review notes were written with arm labels hidden where possible; the final
two clear-count slots were inferable from timing. Mapping was then opened for
aggregation. This is not a strictly blinded final assessment. No author patch was
repaired for grading; all originals are supplied as patches against their pinned
project snapshots and applied in ordinary isolated project copies.

The supplementary receiver control first accidentally modified constructor
binding and recursed; this was invalid evidence and was retained. A corrected
pre-execution uniqueness guard then stopped on two matches. After targeting only
the actual bindMethods section, the wrong receiver passed the full matching
suite. These preparation mistakes did not alter the scored patches. The frozen
automated evaluator missed the receiver-coverage gap, disabled-settlement
coverage gap, and no-signal timing regression; the predeclared manual rubric
caught them. Evaluator source and thresholds were not silently changed.

## Execution, use and quality are different observations

A code exists and is materialized with pinned TypeScript 6.0.3; installed fixtures
prove native delivery and continuation. In primary it delivered 102 reports in
all 12 enabled slots and zero in disabled slots. Reports include compiler-derived
source/export/importer/test paths and provenance. Authors subsequently inspected
some reported files. The compact library layout often meant ordinary grep had
already exposed the same paths. No unique newly discovered consumer followed by
a substantive B failure/repair chain was established. A's reports are useful
investigation data, not demonstrated incremental patch-quality gains or durable
cross-task memory.

B delivered 67 observations in all 12 enabled slots: 22 actual script executions,
44 labelled historical results and one not-run result (the requested script kind
was unavailable in package.json). There were no B results in disabled slots.
The three actual primary B failures were lint failures. For example:

- H01 limitFunction: a B object-shorthand error led immediately to a matching
  setter syntax edit. Later meaningful test-state failures and fixes came from
  ordinary AVA, not B. Six historical B requests before editing avoided rerunning
  npm but still consumed model requests/context.
- H11 waiters: B found two indentation errors and the next patch corrected them.
  Later ordinary tests hung on the old onEmpty timing. The author inspected
  existing tests and fixed the new test's setup with two actually active tasks,
  preserving the old source semantics. That substantive diagnosis came through
  ordinary native commands, not a B-specific behavior finding.
- H11 limitFunction: B supplied a passing baseline. The semantic test failure,
  repair, typecheck and broad pass all used ordinary Bash. Enabling B does not
  justify attributing those repairs to it.

B therefore showed actionable lint feedback; most B executions were passing
baseline/final checks or duplicated normal tooling. The arbitrary combination
hypothesis did not receive the requested strong causal trace. H01 and H11 both
reached full S=6, as did H00. H10 lost one complete delivery at a deadline.

The descriptive paired contrasts are H11−P=+3/6, H00−P=+3/6, H10−H00=−1/6,
H01−H00=0, H11−H01=0, H11−H10=+1/6. Interaction I=+1/6 comes entirely from
clearQueue reason. Six related tasks, one attempt per primary cell and two
operational timeouts do not establish synergy, repeatability, or population lift.

All 24 H internal workflow statuses remained **incomplete**: the preserved common
command observer does not recognize these npm/AVA/tsx forms as a relevant check,
even while listing their actual exit-0 native commands. This is a product/reporting
limitation. The 22 completed H runs have an autonomous native patch/report handoff,
not an internal checks-passed verdict. Some parent reports also dump long historical
printf commands. The status and presentation were not changed inside the experiment.

Final successful command claims were checked against native traces; no invented
successful project command was found. Three P responses present completed delivery
while omitting the three rubric failures above (the bind response explicitly
claims receiver regression coverage). H deadline runs contain no final claim.
Internal conservative H incompleteness is not counted as false completion.

## Cost and limitations

30 task-runs, 0 real technical smokes, **874 forwarded provider requests**; two
requests have unavailable usage. Known usage is 37,281,498 input tokens, 369,017
output tokens, 37,650,515 total, including 13,105,664 cached input and 196,982
reasoning output tokens. Cached/reasoning fields are subsets, not additional
charges. Monetary charges are unavailable from the existing OAuth metadata.

| Arm | Median full slot seconds | Requests | Known input | Known output |
| --- | ---: | ---: | ---: | ---: |
| P | 270.363 | 145 | 4,792,707 | 67,604 |
| H00 | 455.069 | 205 | 7,658,940* | 85,572* |
| H10 | 460.915 | 159 | 6,835,199* | 77,874* |
| H01 | 346.019 | 199 | 10,693,298 | 68,650 |
| H11 | 317.851 | 166 | 7,301,354 | 69,317 |

`*` Known subtotal excludes one unknown-usage request. Full slot time includes
container setup/input verification/capture/stop; native execution uses the shared
900-second deadline. Sum of full primary slot times: 13,286.275 seconds. H uses
one author phase plus a native bootstrap session (two sessions per H run), P one
session. All their requests are included.

Recorded A computation totals 13.128 seconds; actual B commands total 629.623
seconds, already inside native/slot time, not extra time to add. Model context
and follow-up requests generated by components are included in total usage and
cannot be causally isolated from these runs. Dependency/compiler installation,
source snapshots, calibration and orchestration are not free product benefits.

Preparation before the primary freeze took 3,782.096 seconds wall time. Recorded
pre-primary model-free project checks: 71 processes, 893.222 seconds summed process
time (overlap means this is not wall time), including expected negative controls
and preparation failures. Final grading: 60 isolated project processes,
1,266.274 seconds summed time. Supplementary checks and installed diagnostic
probes and transfer preparation are included in [final stage accounting](stage-costs.json). The Codex goal counter belongs to
this development/orchestration work and is separate from executing Luna usage.

## Post-freeze runtime correction

Model-free counterexamples found B could mistake a failed test named timeout for
an interruption, or a passing test named MODULE_NOT_FOUND for an environment
failure. The primary bundle stayed fixed. After all 30 runs, the correction makes
exit 0 authoritative and uses the native Bash footer separated from captured
command output to recognize timeout. Ordinary printed footer text is not timeout
proof. Nonzero missing-module diagnostics remain a disclosed inference.

Focused component regressions and corrected installed OpenCode fixtures passed:
real failing/passing commands, real native timeout, and a subsequent native read,
with zero real provider calls. A first corrected installed fixture lacked the
read-only template's .gitignore and failed before useful work; supplying that
same original file fixed preparation without changing permissions. No primary B
output carried either affected classification, so no measured outcome is claimed
to have changed. Transfer pins the corrected version separately; no matrix rerun.
