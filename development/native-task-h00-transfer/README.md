# H00 transfer: incomplete series, no confirmed advantage

Eighteen of 48 scheduled Luna/high task-runs started; thirty remain
`not_started`. All local author execution and forwarding stopped and captures
were saved. A frozen launcher defect stopped scheduling during slot 18. No
request was replayed, no runtime was corrected mid-series, and no extra campaign
was started. The result does **not** establish transfer, stable superiority or
equality between H00 and ordinary OpenCode.

| Descriptive result, started slots only | P | H00 |
| --- | ---: | ---: |
| Started / planned | 9 / 24 | 9 / 24 |
| Q: complete suitable patch | 3 / 9 (33.3%) | 4 / 9 (44.4%) |
| D: complete autonomous delivery | 3 / 9 (33.3%) | 4 / 9 (44.4%) |
| Normal native completion | 8 / 9 | 8 / 9 |
| Hard task deadline | 1 | 0 |
| Interrupted by launcher stop | 0 | 1 |
| Not started | 15 | 15 |

The observed Q and D differences are each +11.1 percentage points for H00.
Across the nine first-repetition pairs H00 has three wins, two losses and four
ties. These are partial-series counts, **not a confirming estimate**. No task
has its second repetition, so task means over two repetitions, repeat stability,
the frozen six-project block-bootstrap 95% interval and sign-flip analysis are
unavailable. Missing slots have null Q/D; they are not model failures. We do not
replace the planned analysis with a favorable subset CI or infer equality from
missing evidence. Even a complete series would have only six project groups.

[All 48 slots and per-attempt evidence](SLOTS.md) ·
[Machine-readable results](results.json) · [Costs](costs.json) ·
[Independent evaluation and reproduction](EVALUATION.md).

## What was measured

The exact H00 product source is
`1cebebb082163250a0f78269acc164edfc3c6268`, with direct strategy, context A=0 and
checks B=0. The report-publication branch is separate from that source. The last
pre-outcome preparation publication is
`237c98e36d4e30b4c158a3d3450902c1cdd644bf`; later result commits change reports and
model-free diagnostic artifacts, not the measured candidate or frozen launcher.
No result is attributed to A/B, reviewers, selectors or finishers.

[PLAN.md](PLAN.md) fixes order, equality, timing and statistical method;
[FREEZE.json](FREEZE.json) fixes inputs before the first real request at
2026-09-13 19:42:18.746 UTC. [INSTALL.md](INSTALL.md), [h00/](h00/),
[restoration.json](restoration.json) and [equality.json](equality.json) give exact
installation fingerprints, retained inactive modules, dependency locks and
scripted verification of actual loaded instructions/tools/full task text.

| Surface | Both arms | Difference |
| --- | --- | --- |
| Model and executable | OpenCode 1.18.26, gpt-5.6-luna, high | none; all 405 provider requests including titles use this model/effort |
| Task input | Same pinned source, dependencies, full TASK.md and project guidance | H00 adds its original product instructions |
| Tools and workflow | Native editing, reading and project checks | P has ordinary delegation tool; unchanged H00 direct disables delegation and owns one author child/worktree |
| Environment | Fresh Linux arm64 container, Node 24.19.0, identical containment/toolchain | P has no harness hooks; H00 loads its exact installed plugin |
| Time | 900 s absolute task budget, 30 s response-header/connect limit; stream bounded by remaining task time | none; every H00 session and final handoff is included |

The common new-series relay setting replaced the old 180 s absolute stream timer
before outcomes. A real scripted 190 s stream completed normally in both arms;
model-free deadline/partial-output/unknown-usage/next-slot fixtures passed.
Cancellation handler drain is bounded to five seconds after author execution
stops. Endpoint, account and authorization were unchanged. Real preliminary
provider smokes: **zero**. Manual Actions and full platform matrix: **zero**.

The common image is retained locally by its exact hash. It is **not a verified
public pull location**: its older unpinned apt layers cannot be reconstructed
byte-for-byte from a short recipe. See [image-provenance.json](image-provenance.json).
The image-global OpenCode 1.18.18 was not used; the measured read-only executable
is 1.18.26 and was verified in every slot. Exact H00 source/config/npm dependency
installation is reproducible separately; complete environment reproduction
requires the retained image. No image or dependency changes occurred mid-series.

## Partial task comparison

Every entry below is Q/D for repetition one. Repetition two is entirely
not_started, so changes between repetitions cannot be assessed. Task types and
project breakdown are shown directly; all tasks concern public API behavior,
consumers, state, compatibility and required tests/docs/types.

| Project / task | P Q/D | H00 Q/D | Main loss |
| --- | --- | --- | --- |
| denque / rotate | 0/0 | 1/1 | P delivered tests miss object cloning during actual rotation |
| denque / removeWhere | 0/0 | 0/0 | Both suites miss loss of configured capacity |
| eventemitter3 / prepend | 1/1 | 0/0 | H00 omits required type consumer fixture |
| eventemitter3 / remove by context | 0/0 | 0/0 | Both omit required type consumer fixture |
| fastq / runningTasks | 0/0 | 1/1 | P reaches deadline with empty patch |
| fastq / onIdle | 0/0 | 0/0 | Both miss early kill-resolution regression; P also misses a reached idle transition |
| quick-lru / computed insert | 1/1 | 1/1 | None found within the frozen contract |
| quick-lru / prune expired | 0/0 | 1/1 | P misses required empty-cache reuse and live-old shadow regression |
| ufo / query sort | 1/1 | 0/0 | H00 interrupted with empty patch |
| ufo / append query | — | — | Not started |
| ms / format unit | — | — | Not started |
| ms / parse compound | — | — | Not started |

All 18 captured source patches were applied in ordinary clean Git copies and
checked against author bytes/modes. All 18 ordinary project checks passed
(including baseline checks for the two empty patches); this alone does not mean
Q=1. Fifteen original independent runtime checks passed, three failed. One
failure was an unsupported callback-order expectation and is interpreted as a
pass after a uniform supplemental check; Q still fails for its independently
confirmed required-coverage gaps. A further public API probe finds P's missed
idle-transition behavior despite its original independent pass. The seven Q=1
patches include required tests/types/docs under the stated review scope.
No additional compatibility or documentation loss was confirmed. Required type
**test** omissions are distinct from a demonstrated invalid declaration.

All eight completed H00 native handoffs name usable worktrees and terminal
patches. Their actual terminal patches also apply directly in ordinary copies
and deliver all evaluated author bytes, including the four Q=1 patches. They
therefore retain D=1 where Q=1 despite internal `incomplete`. Separately, each
H00 report claims no relevant observed project verification while listing
successful project commands. This is a misleading reporting defect. P's onIdle
final response overstates its handling of the confirmed idle-transition case.
A full patch rescued only after timeout would receive D=0; no such Q=1 case
occurred here.

## Why the series stopped and how interpretation changed

Slot 9 (P, runningTasks) reached the managed deadline: execution, capture,
forwarding closure and removal were verified; one request's final server status
and usage remain unknown. That request was never resent. The next independent
slot was admitted under the frozen rule.

Slot 18 (H00, query sort) ended after 48.947 s with native exit 137 and no final
handoff. Its last forwarded response already contained `response.completed`,
status `completed`, and usage. A subsequent stream `AbortError` was nevertheless
classified as `unknown_submission` by the frozen launcher's unconditional catch,
which invokes workload stop and pauses scheduling. The exact initiating client
transport-cancellation cause is not recorded. The retained H00 workflow also
records a webfetch transport failure as unconfirmed tool state. Neither is an
author patch correctness failure. No quota/auth refusal or isolation violation
was observed. All local stop/capture/forwarding/removal checks passed; the
server-completion label is corrected only in the report, not the raw records.

[Post-start observations](post-start-observations.json) preserve four limitations:

- Denque rotation's frozen reference and alternative tests themselves miss
  object identity under actual nontrivial rotation. Both pass a narrowly scoped
  object-cloning diagnostic. This is a calibration gap, not a new requirement;
  do not present the preflight as proof of complete rubric sensitivity.
- Raw capture included deletion of a generated, upstream-ignored fastq lockfile
  absent from the pinned Git commit. Ordinary-source patches omit only that
  preparation artifact under the same rule for both arms. Raw local captures
  remain intact. H00's own terminal patches already omit that artifact.
- The prune evaluator required old-generation callback order absent from the
  task. Original failure is retained, and an order-insensitive replacement of
  that one assertion passes for both authors and both controls. That expectation
  is not used to penalize Q.
- The frozen launcher incorrectly treated the completed slot-18 response as
  unknown after transport cancellation. Continuing with a repaired execution
  version would mix conditions, so the remaining slots remain not_started.

Post-outcome interpretation and the calibration gap independently limit the
confirmatory strength. Q decisions were saved before reading the arm mapping
or final author reports ([checkpoint](quality-decision-checkpoint.json),
[original neutral decisions](neutral-quality-decisions.json)). This was one
assessor who also monitored operations, not an independent double-blind review;
artifact differences can reveal clues. No author patch was repaired by the
assessor. All new diagnostics ran in independent copies after scored execution.

## Costs and remaining evidence

| Observed provider usage | P | H00 |
| --- | ---: | ---: |
| Requests | 201 | 204 |
| Requests with known usage | 200 | 204 |
| Known input tokens | 6,225,686 | 6,718,426 |
| Known output tokens | 104,804 | 107,596 |
| Known total tokens | 6,330,490 | 6,826,022 |
| Cached input subset | 2,231,808 | 2,351,616 |
| Reasoning output subset | 56,575 | 62,818 |
| Sum of slot elapsed seconds | 3,309.967 | 2,947.547 |
| Median slot elapsed seconds | 295.276 | 312.546 |

Across 405 requests, the known total is **13,156,512 tokens**, plus one unknown
request's usage. Cache and reasoning are subsets, never added again. Eighteen
requests generated titles and 387 were work requests; all are included. Known
H00 usage exceeds the known P total by 495,532 tokens, but P has missing usage;
this does not establish the full cost difference. Deadline and early-stop
imbalance also prevent a speed conclusion. No reliable monetary charges are
available from OAuth metadata.

Preparation recorded 169 model-free project-check invocations with 665.326 s
summed elapsed time and 395.361 s of installed scripted-session elapsed time.
Post-execution evaluation recorded 56 project-check invocations with 168.332 s
summed elapsed time, plus ordinary source/terminal patch application and host
type checking not separately timed. Expected failing controls are included;
nonzero counts are not defect counts. These elapsed sums are not total wall time.
The developing Codex agent's goal-tracker checkpoint is 845,117 tokens and
10,124 elapsed seconds through report assembly, recorded separately in
[costs.json](costs.json). It is a lower bound for this goal, not Luna usage or
a monetary charge. Image/dependency preparation has no complete separate resource
meter. Local results are not remote CI or evidence for other platforms.

The original product question remains unresolved: a +1 suitable autonomous
result among nine incomplete first-repetition pairs is insufficient to show
that H00's previous advantage transfers. The missing second repetition and
three unstarted tasks remain missing evidence. No new component, candidate
version or additional model campaign is part of this delivery.

Report-only verification: [verification.json](verification.json). All 112 frozen
file hashes remain unchanged; CI routing and package boundary checks pass.
Automatic remote checks are reported separately on the final PR head.
