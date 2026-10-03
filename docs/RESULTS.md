# Results and limits

**No sustained harness quality advantage is established.** These separate
campaigns have different runtimes, datasets and scoring contracts; they must not
be pooled into a project success rate. Technical fixtures are not model lift.

## Evidence-backed core: completed development rejection

The [report](../evaluation/polybench/campaigns/evidence-backed-core-development-v1/REPORT.md)
and [18 full slot records](../evaluation/polybench/campaigns/evidence-backed-core-development-v1/results.json)
screen H1 product `8253fa1c` against fresh Plain and unchanged C0 `358cb0a3`.
All six prescribed tasks ran once per arm and received official evaluation:
P R=D **4/6**, C0 R=D **3/6**, H1 R=D **3/6**; each delivery **6/6**.
No unknown outcomes, repeats, replacements or new admission stop. All full
author patches, strict applicability and exact capture/roundtrip are retained;
three MUI-18683 full submissions were officially rejected.

H1/P: zero wins, one loss, five ties; −16.7 pp, descriptive conservative 95%
interval [−69.13, +51.62] pp. H1/C0: six ties; 0 pp, interval [−51.83, +51.83] pp.
The only H1/P difference is Three.js test identity with identical production.
Serverless supplies visible method use, but no additional D versus either control.
H1 is rejected and active core restored. An insufficiently grounded H2 proposal
was declined before implementation or model runs. Confirmation was not started.
The intended quality increase was not achieved; this is a bounded development
decision, not formal independent testing or proof of equivalence.

[Cost data](../evaluation/polybench/campaigns/evidence-backed-core-development-v1/costs.json)
attribute 546 real requests: 18 title, 513 author/parent, 15 native child; zero
unknown usage. Input/output totals 29,669,291 / 159,936; cached/reasoning are
included subsets. H1 used 65.6% more agent time and 73.4% more input than P.
Preparation, complete task timers, evaluator and unmetered maintainer/CI costs
are separate. Money is unknown. Historical results below are unchanged and
are not added to this candidate's score or expenses.

## Remaining eight tasks: candidate f83b101b

The [new report](../evaluation/polybench/campaigns/consolidated-remaining-v1/REPORT.md)
and [24 slot records](../evaluation/polybench/campaigns/consolidated-remaining-v1/results.json)
cover eight exact remaining assignments, each once in P/C/T, on product
`f83b101bd9050c81443acddf71c1e364c4c786c4`. Adapter `04727944`; pre-model freeze
`27786ad7`. All 24 started and were evaluated; no new admission stop or retry.
Official R **P 3/8, C 2/8, T 3/8**; delivery 8/8, 8/8, 7/8;
full correct delivery D 3/8, 2/8, 3/8. All captures/roundtrips/local stops verified;
zero unknown quality or evaluator process errors. Full authored tests are retained.

T/P: one win, one loss, six ties; delta 0 pp, paired 95% interval −37.5 to
+37.5 pp, exact McNemar p=1.0. C/P −12.5 pp; descriptive T/C +12.5 pp.
Core did not improve resolved. T cost 133.4% more execution time and 41.0% more
input tokens than P without more full correct deliveries. This small fixed
remainder establishes neither general advantage nor equivalence.

One real investigator produced one accepted nonempty test patch in one file.
Two preparations exceeded existing bounds before a child ran. T's Three.js
win had no investigator; Serverless-8159 was its loss. Code-server T reached
the hard deadline with a real nonempty partial capture. Serverless-2945 T's
official applied-M evaluation reported a duplicate-identifier test-command
error with zero parsed tests; its unchanged official R=false remains. Seven delivered T workflows
reported internal incomplete status; this alone did not negate delivery.

[Expense receipts](../evaluation/polybench/campaigns/consolidated-remaining-v1/costs.json)
record 703 known requests, 36,408,747 input / 205,140 output tokens, cached/reasoning
subsets, preparation/agent/capture/cleanup/controller/evaluator boundaries and
partial developing-agent metering. Money is unknown. Historical 849 requests
are not added again. This new cohort uses 5 TS / 3 JS tasks in five repositories;
17 original eligible tasks are covered across two versions, never pooled as
f83b101b's score. Historical records and pause below remain byte-identical.

## Consolidated candidate: partial comparison, admission closed

The [campaign report](../evaluation/polybench/campaigns/consolidated-v1/REPORT.md)
and [60 slot records](../evaluation/polybench/campaigns/consolidated-v1/results.json)
cover candidate `39def2ed0b1476299b104b38f8c93747d828a87a`. Of twenty fixed JS/TS
tasks, seventeen passed preparation; nine actually ran in all three modes.
Official resolved: **P 2/9, C 3/9, T 2/9**. Autonomous delivery: 9/9, 9/9, 7/9;
delivered-and-resolved: 2/9, 3/9, 2/9. T includes two real empty partial captures
following stock Git-context failures. Four other patches were officially rejected.
All seven delivered T workflows reported `incomplete` project-check status.

T/P: one win, one loss, seven ties; delta 0 pp, paired 95% interval −33.3 to
+33.3 pp, exact McNemar p=1.0. C/P: one win, zero losses, eight ties; +11.1 pp,
interval 0 to +33.3 pp. The latter is descriptive, not a separately tested claim.
Eleven pairs are unobserved, and the result does not establish equivalence.

At slot 31, before any model request, the adapter's 32 MiB subprocess output
buffer truncated a 43,229,958-byte input manifest. The batch closed admission.
All 33 remaining assignments are not started: nine preparation exclusions and
24 slots affected by the stop. The adapter was not repaired or the run replayed.

Provider usage: 849 known requests; 44,081,043 input and 265,203 output tokens.
T used 6425.786 s of agent execution versus P 4472.004 s and C 4240.290 s.
Host preparation, capture/cleanup, full slot wall time, unallocated batch overhead
and official evaluation are separately reported; no post-start time was deducted.
Money is unknown. Earlier pilot results and costs remain separate below.

## Historical pilot: SWE-PolyBench Verified

The [original report](https://github.com/Tah10n/opencode-harness/blob/030b4ee2b5df7af050ef49bb58098b096ef486d6/development/polybench-pilot/REPORT.md)
and [frozen manifest](https://github.com/Tah10n/opencode-harness/blob/030b4ee2b5df7af050ef49bb58098b096ef486d6/development/polybench-pilot/frozen-manifest.json)
bind evaluator `9c836c5d7f3cb991934132b77d29e6941d912a07`, dataset
`b3fca77b637379f0c01ad86d18753a7ac1998b53`, CSV SHA-256
`0c8138e73c34fa29a5276b675b146b72d78ce001fcc4560d76302c908b4808a5`,
OpenCode 1.18.26 and harness `e18db1fe10223db52dcc05b3e769bca140367c2b`.
Model: `openai/gpt-5.6-luna`, high. Arms: plain P, direct harness H0,
direct harness with TYPE_COMPAT H1.

| Assigned | Started | Officially evaluated | Official `resolved` on six observed tasks |
| ---: | ---: | ---: | --- |
| 30 slots / 10 tasks | 18 | 18 | P 1/6; H0 0/6; H1 1/6 |

Twelve not-started slots remain **unknown**. Nine official patch rejections and
one empty delivery stay in the official outcome; post-hoc F/E diagnostics do not
replace the official score. The stopped batch must not resume. H1 ties P; no
TYPE_COMPAT contribution or general lift is established by this small observed
subset.

Provider accounting: 692 requests (18 title, 674 work), 691 known usages and one
unknown usage/remote completion. Observed input: 52,779,665 tokens; output:
251,646. Cached input 46,298,112 and reasoning output 134,403 are included subsets,
not extra totals. Monetary charge is unknown. These figures describe one campaign,
not multiple costs for each later summary.

## Archived custom benchmark campaigns

These are historical internal evaluations, not official SWE-PolyBench results.
All monetary charges below are unknown; token observations cannot supply an exact
bill. Original reports and manifests define their metrics and evaluator versions.

| Campaign and source | Model / variants | Assigned, started, evaluated | Metric and outcome | Usage / limitations |
| --- | --- | --- | --- | --- |
| [Synthetic protocol 17](https://github.com/Tah10n/opencode-harness/blob/030b4ee2b5df7af050ef49bb58098b096ef486d6/README.md) | Luna low; plain / harness | 320 / 320 / 320 sessions, 160 pairs | `task_correct` 85% → 86.875%; delta +1.875 pp, CI −13.125 to +18.125 pp; p=.8125; no clear difference | Tokens/cost unavailable; 12 canary regressions |
| Synthetic protocol 16, private canonical report `synthetic-merged-run-561d2675-9732-4fc0-8c1a-18b3399887e0` | Luna low; plain / harness | 320 / 320 / 320 sessions, 160 pairs | `task_correct` 89.375% → 0%; candidate worse | Tokens/cost unavailable; 133 canary regressions; distinct operational runs from protocol 17 |
| Synthetic micro, private canonical report `synthetic-run-1bed8664-ad2e-41f0-9c20-1ce702d9bcf5` | Nemotron free; plain / profile-only | 8 / 8 / 8 sessions, 4 pairs | `task_correct` 50% → 100%; insufficient sample | Tokens/cost unavailable; no general inference |
| [Pre-v2 protocol 14](https://github.com/Tah10n/opencode-harness/blob/030b4ee2b5df7af050ef49bb58098b096ef486d6/docs/synthetic-benchmark.md) | GPT-5.4-mini low; plain / harness | Historical report: 160 sessions, 80 complete pairs | `task_correct` 76.25% → 90% | Deprecated statistical contract; raw report not found in current local inventory; document-bound historical claim |
| [v0.4 original study](https://github.com/Tah10n/opencode-harness/blob/f2980c6a76ce68fe96c9a5fcdcd8ff938fcbe5f8/docs/research/v0.4-model-backed-study.md) | Luna low; five profile transitions | Planned smoke+standard worst case 280; launched/evaluated 0 | Invalid benchmark fixture; containment blocked before inference | Conservative stage accounting 8 is not 8 model attempts; tokens/cost unobservable |
| [v0.4 repaired study](https://github.com/Tah10n/opencode-harness/blob/4033780cca4d2e39a9990c807dcb2bd7a40b6608/docs/research/v0.4-model-backed-v2/README.md) | Luna low; five profile transitions | 130/130/130 standard pairs plus separately recorded smoke/acceptance diagnostics | All five transitions rejected; no full-stage promotion | Source `7e4c3bd2…`; campaign `29508d7e…`; protocol deviation and pre-scoring containment failure retained in report; costs/complete usage not established here |
| [Core public A/B](https://github.com/Tah10n/opencode-harness/blob/3c2d51b9e6d000b0a4aec49e158b18af7eb181af/docs/research/core-public-ab-measurement-v2/results.md) | Luna low; plain / materialized core | 60/60/60 primary pairs; real-repository pilot only 12/29 pairs | Oracle task success 0/60 vs 0/60; no clear difference | Tokens not observable; real-repository pilot excluded; regression severity outside frozen oracle unobservable |
| [Verified-change fixed60](https://github.com/Tah10n/opencode-harness/blob/dc06851816c384c6515b519d99c28960222bc93f/docs/verified-change-results.md) | Luna low; A D0 / B extra plain / C harness | 180/180/180 protocol arm outcomes; 179 checked snapshots, C32 operational zero | A 59/60, B 58/60, C 56/60; C recovered 0/1 failed D0; no advantage | Manifest `68c28c91…`; one incomplete usage; evidenceAvailable=false because C32 teardown unverified; A/B/C observed total tokens 2,876,882 / 2,428,952 / 4,888,497 |

[Canonical synthetic report hashes and suite identities](results/synthetic-provenance.json)
identify the three private source reports. The private archive contains them;
shards, self-tests and repeated summaries are not additional campaigns or expenses.
Original branch reports use pinned SHA links and remain recoverable from the
[archive](ARCHIVE.md), even where their implementation was rejected.

## Development examples (not benchmarks)

Native task revisions, template off/on, TYPE_COMPAT/preservation pairs,
post-hoc PolyBench contract diagnostics, plain MUI, Kimi and VibeRacing ledger
were development work. The [historical development tree](https://github.com/Tah10n/opencode-harness/tree/030b4ee2b5df7af050ef49bb58098b096ef486d6/development)
retains original plans, intermediate errors and reports.

The template comparison had full delivery 0/3 in both arms. Native V3 produced
4/6 accepted patches in each arm, one win/one loss/four ties, with no autonomous
complete deliveries. Later ledger work retained Q=false, T=true, D=false despite
passing ordinary project suites. These negative outcomes remain visible and do
not authorize further model runs or make ledger an official benchmark.

## Scripted and model-free checks

Native local-provider fixtures test actual installed interfaces, permissions,
index/checkout preservation, cancellation and patch delivery. Scheduler/recorder
fixtures test transport, deadlines, capture errors and unknown usage. Compiler
and sensitivity fixtures test their implemented diagnostic mechanisms. They
contain no evidence of improved model decisions. Current-head technical status
belongs in [STATUS](STATUS.md) and the actual PR check results.
