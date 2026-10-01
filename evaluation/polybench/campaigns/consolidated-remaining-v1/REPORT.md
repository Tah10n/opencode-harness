# Remaining eight-task comparison

**24/24 once-only attempts completed; no new admission stop.** Official R:
P 3/8, C 2/8, T 3/8. Core did not improve resolved on this fixed eight-task
remainder. T exchanged one P success for one different success, with no net
increase in R or full correct deliveries. It used 133.4% more execution time and
41.0% more input tokens than P; the extra expense did not buy an observed gain.
This small nonrandom remainder establishes neither sustained advantage nor
model equivalence.

| Mode | Official R | Delivery | D = R ∧ delivery | Execution | Input / output tokens | Requests |
| --- | --- | --- | --- | --- | --- | --- |
| Plain (P) | 3/8 (37.5%) | 8/8 | 3/8 | 3,216.568 s | 10,823,226 / 58,317 | 204 |
| Native core (C) | 2/8 (25.0%) | 8/8 | 2/8 | 4,220.026 s | 10,321,319 / 65,412 | 220 |
| Task + investigator (T) | 3/8 (37.5%) | 7/8 | 3/8 | 7,509.009 s | 15,264,202 / 81,411 | 279 |

All requests have known usage and provider completion; all 24 full recordings,
local stops and M roundtrips are verified. No missing capture, unknown quality,
evaluator process error, retry, replacement or continuation occurred. P/C each
have two official patch rejections. T has one rejection and one applied full M
whose test command raises duplicate-identifier SyntaxError before parsed tests.
The latter stays official R=false, with_logs=true and zero observed tests.
Seven T deliveries reported internal workflow `incomplete`; that status alone
does not negate delivery. Code-server T reached its 1800-second hard deadline:
a real nonempty partial M (5723 bytes) was captured and evaluated R=false.

## Per-task outcomes and paired analysis

R is the unchanged official resolved criterion. Delivery is operational native
completion; D is their conjunction. Every resolved result was also delivered,
so R and D paired outcomes coincide in this party. A successful operational
handoff does not certify a patch. All eight pairs are observed.

| Task | P R | C R | T R | T delivery | Real investigator children |
| --- | --- | --- | --- | --- | --- |
| mui__material-ui-42412 | 1 | 1 | 1 | 1 | 0 |
| mui__material-ui-18683 | 0 | 0 | 0 | 1 | 0 |
| microsoft__vscode-135805 | 0 | 0 | 0 | 1 | 0 |
| serverless__serverless-2945 | 0 | 0 | 0 | 1 | 1 |
| mrdoob__three.js-24461 | 0 | 0 | 1 | 1 | 0 |
| serverless__serverless-8159 | 1 | 0 | 0 | 1 | 0 |
| microsoft__vscode-108964 | 1 | 1 | 1 | 1 | 0 |
| coder__code-server-3277 | 0 | 0 | 0 | 0 | 0 |

| Comparison | Wins / losses / ties | R difference | Paired 95% interval | Exact McNemar |
| --- | --- | --- | --- | --- |
| T-P | 1 / 1 / 6 | +0.0 pp | -37.5 to +37.5 pp | 1.0 |
| C-P | 0 / 1 / 7 | -12.5 pp | -37.5 to +0.0 pp | not tested |
| T-C | 1 / 0 / 7 | +12.5 pp | +0.0 to +37.5 pp | not tested |

T/P is primary; C/P secondary; T/C descriptive. The precommitted method uses
100000 task-level paired percentile bootstrap resamples, Python Random seed
20260929 and linear empirical 2.5/97.5 percentiles. Only primary T/P R receives
two-sided exact McNemar at alpha .05. D intervals use the same fixed method
without another formal test. No interval is degenerate here; eight tasks and
only two primary discordances still leave wide uncertainty. Non-significance
is not evidence of equivalence. Leave-one-repository-out is descriptive:

| Repository excluded | Paired tasks left | T/P R difference |
| --- | --- | --- |
| coder/code-server | 7 | +0.000 pp |
| microsoft/vscode | 6 | +0.000 pp |
| mrdoob/three.js | 7 | -14.286 pp |
| mui/material-ui | 6 | +0.000 pp |
| serverless/serverless | 6 | +16.667 pp |

## Investigator and delivery evidence

Three T investigation preparations were observed, but only **one child actually
performed model work**: Serverless-2945. One nonempty child test patch, changing
one test file, was accepted and integrated. These are patch/file counts, not an
inferred number of assertions or test cases. VSCode-135805 exceeded the snapshot
file bound; Serverless-8159 exceeded dependency-copy bounds; neither started a
child. The T-only resolved win on Three.js used no investigator. This campaign
therefore supplies no observed investigator quality gain.

Serverless-2945 retains its complete authored tests in M. Its official full-M
application had strict check exit 1; unchanged upstream application ultimately
reported applied=true, followed by `Identifier 'sinon' has already been declared`
and zero parsed tests. The upstream git-apply/reject then patch/fuzz fallback
can reapply a successful hunk; that explanation is an inference, because the
branch output was not recorded. No evaluator infrastructure exception or process
failure was recorded. Tests were neither stripped nor repaired to change R.

Delivery reporting binds captured parent and author sessions to native terminal,
applicable round-tripped M and verified shutdown. Internal investigator finish
is separate. The frozen collector's all-session verdict is retained per slot as
`raw_collector_verdict`; the reporting correction changed **zero** delivery/D
verdicts in this party. It changed no runtime, M, R or statistical method.

## Time and expense

| Mode | Preliminary prep s | Execution s | Capture s | Cleanup s | Post-execution overhead s | Full observed slot s |
| --- | --- | --- | --- | --- | --- | --- |
| P | 172.997 | 3,216.568 | 10.801 | 2.243 | 13.566 | 3,403.135 |
| C | 173.328 | 4,220.026 | 10.757 | 2.303 | 13.591 | 4,406.949 |
| T | 170.330 | 7,509.009 | 13.486 | 3.806 | 18.281 | 7,697.625 |

Capture and cleanup are subsets of post-execution overhead, not additive to it.
Each execution includes OpenCode startup, parent/title, author, child preparation,
child work, project commands and delivery within the common 1800-second budget.
Only container/fixed-input preparation preceding taskStarted is preliminary.
Batch wall: 17,333.205 s; full observed slot intervals:
15,507.709 s; residual:
1,825.496 s. All slot intervals are complete.
The residual includes pre-slot full-input checks and controller work; it is not
an instrumented pure controller duration.

New-party usage: **703 requests**, 36,408,747
input and 205,140 output tokens.
Cached input 13,210,112 and reasoning
output 105,686 are included
subsets. There are zero unknown usages. No historical 849 requests are added.
Money is unknown without a reliable bill.

Pre-admission inventory through invocation start: 3,943.678
s, including restoration, technical controls, checks, development and waits.
Eight immutable-image downloads and 16 fresh gold/baseline controls are recorded
within that interval; gold official R=true and baseline R=false for every task.
There was one distinct scripted-export official control, zero real probes/smokes
and zero copied historical controls. Component durations overlap pre-admission
wall and must not be added twice. Official model evaluation process durations:
P 789.340 s, C
786.023 s, T
788.799 s.
Developing-agent work has a partial goal-meter checkpoint in [costs.json](costs.json):
the meter was reset during preparation, later publication/CI/cleanup and full
child-agent inclusion are unmeasured. Its wall overlaps preparation and benchmark
waits, and is not provider billing. CI is separate from benchmark inference.

## Provenance, preservation and verification

Product `f83b101bd9050c81443acddf71c1e364c4c786c4`; adapter
`047279449b88730f113017bb6035aebb9362e773`; pre-model freeze commit `27786ad7`.
OpenCode 1.18.26, openai/gpt-5.6-luna, high, direct task with investigation only,
1 GiB shared recording per slot. Five TypeScript and three JavaScript tasks from
five repositories use exactly the preserved 24 original-slot mappings.
Dataset `b3fca77b637379f0c01ad86d18753a7ac1998b53`; official evaluator
`9c836c5d7f3cb991934132b77d29e6941d912a07`, unchanged commands/parser/patch order.

All eight full actual-input manifests, task Git-context and hidden isolation
checks passed before real admission and again per slot. Pinned official images
and original project toolchains/PATH are preserved. Diagnostic/author images
were rebuilt from pinned sources, with new hashes and common P/C/T conditions;
this is not a claim that every OS package matches the old diagnostic image.
Gold calibration R=true does not mean every unrelated test passes: Three.js
control still had 897 failed tests under the unchanged resolved criterion.

Historical consolidated-v1 remains byte-identical and stopped: 27 attempts,
P 2/9, C 3/9, T 2/9, original slot 31 pre-OpenCode error/zero requests and all
old not_started states, freeze, pause and archives. Coverage is now 17 original
eligible tasks across **two different product versions**; f83b101b ran only these
eight, and no 17-task pooled score is reported. The three preparation exclusions
and old nine graded tasks were not rerun.

[Results](results.json), [exact predictions](predictions/),
[artifact hashes](artifact-manifest.json), [input/control receipts](preparation.json),
[costs](costs.json), [frozen manifest](frozen-manifest.json) and [plan](PLAN.md)
retain outcomes separately. Targeted model-free adapter/export/statistical
checks verify their own scope; they do not prove model lift. Required ordinary
CI and qualifying GitHub review belong to the publication PR. Full raw
outputs/requests/responses/native captures/M and metadata remain in a verified
private archive before owned-source cleanup; [cleanup receipts](cleanup.json)
record the actual result: 24.31 GB of allocated filesystem space reclaimed,
17 owned images, nine completed build records and 128 exact owned cache records
removed. Docker separately reported 17.84 GB reclaimed cache; these space
figures are not added together. The 336.74 MB full archive and small audit
metadata/24 started-slot guards are retained for recovery and source binding.
Raw logs, credentials and benchmark copies are not
committed. No runtime fix, additional paid evaluation or release is assigned.
