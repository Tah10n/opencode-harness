# Results and limits

**No sustained harness quality advantage is established.** These are separate
campaigns, with different runtimes, datasets and scoring contracts. Do not pool
them into a project success rate or interpret technical fixtures as model lift.
No model run was performed for consolidation.

## External benchmark: SWE-PolyBench Verified

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
