# Evidence-backed core: H1 rejected at development screening

The intended quality increase was **not achieved**. All 18 once-only fresh
P/C0/H1 task-runs completed and received the unchanged official evaluation.
H1 delivered three correct solutions, Plain four and C0 three. H1 is rejected;
its instruction and installed fixture were removed from the active product.
The [complete candidate diff](candidate-h1.patch), [slot results](results.json),
[decision](screening.json), [costs](costs.json), and exact full-M predictions
([P](predictions-P.jsonl), [C0](predictions-C0.jsonl), [H1](predictions-H1.jsonl))
remain available. There is no selected H, no H2 implementation or model run,
and no independent confirmation run. This closes this bounded direction,
without establishing universal ineffectiveness or equivalence.

## Candidate and frozen conditions

C0 is `358cb0a3fecce7f8b3af75d7ae6d6d4052257c04`. H1 product source is
`8253fa1c739b43917799f5c23ccffdf1dea618f6`; adapter freeze source is
`cafabe91aa717776a94df93a1f74262c60ce1113`. The
[pre-implementation analysis](ANALYSIS.md) was committed before changing core;
the [plan](PLAN.md), [selection](selection.json) and
[pre-model manifest](frozen-manifest.json) fix the six tasks and 18-slot order.
The private complete freeze SHA-256 is
`fae2df856e7d4fff531f4fef8806191b8357063c4b16bb7e478f2980f8e5b706`.

H1 changed only core step 1: use the task's small public-call example, and for
one-member configuration changes observe both the changed member and a needed
unchanged member in the same call before choosing a new representation. It
added no agent, hook, mandatory Task workflow, model dependency or new user
artifact. A scripted installed positive/negative contrast verified delivery of
the exact materialized instruction, public-call discrimination, project
guidance and permissions. That model-free check did not predict model quality.
The saved diff was independently applied outside this repository and all three
candidate files matched their Git bytes and modes before active withdrawal.

Every real run used OpenCode 1.18.26, existing `openai/gpt-5.6-luna`, high, and
the fixed 1,800-second author budget including startup, title/parent, model,
tools, normal delegation, checks and autonomous delivery. The scheduler clears
that timer before evidence extraction/capture; capture and cleanup are measured
separately. All actual full task timers, including capture/cleanup, were below
1,800 seconds (maximum 1,670.129 seconds), so no post-start time was deducted
from these observations. This is not a general timer-enforcement guarantee for
post-author capture. Runs were sequential in the prescribed
alternating order, once per task and arm. Common preparation passed all six
gold/baseline environment controls. The pinned dataset is
`AmazonScience/SWE-PolyBench_Verified@b3fca77b637379f0c01ad86d18753a7ac1998b53`;
CSV SHA-256 is
`0c8138e73c34fa29a5276b675b146b72d78ce001fcc4560d76302c908b4808a5`.
The official evaluator remains
`amazon-science/SWE-PolyBench@9c836c5d7f3cb991934132b77d29e6941d912a07`.

## Fresh results and uncertainty

R is official resolved; T_delivery is autonomous delivery with verified native
completion and stop; primary D is R AND T_delivery. Exact complete M, including
author tests, was submitted without repair, relocation, filtering or overlap
resolution. Strict applicability and capture/tree roundtrip are separate gates.

| Arm | R | T_delivery | D | Requests | Agent execution | Full task timers |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Plain P | 4/6 (66.7%) | 6/6 | 4/6 | 163 | 2,687.946 s | 2,701.018 s |
| Unchanged C0 | 3/6 (50.0%) | 6/6 | 3/6 | 162 | 2,700.663 s | 2,713.964 s |
| Candidate H1 | 3/6 (50.0%) | 6/6 | 3/6 | 221 | 4,452.398 s | 4,465.960 s |

| Task | P R/D | C0 R/D | H1 R/D | Official application/outcome |
| --- | --- | --- | --- | --- |
| mrdoob__three.js-24461 | true | false | false | All applied; test-identity discrepancy below |
| serverless__serverless-8159 | true | true | true | All applied and resolved |
| mui__material-ui-42412 | true | true | true | All applied and resolved |
| microsoft__vscode-108964 | true | true | true | All applied and resolved |
| mui__material-ui-18683 | false | false | false | All three full M officially rejected; no parsed tests |
| microsoft__vscode-135805 | false | false | false | All applied; same official multicursor failure and cleanup-error label |

All 18 are terminal nonempty artifacts with strict applicability, exact patch
roundtrip, complete recording/usage and verified termination. There are zero
unknown R, evaluator process errors, admission pauses, task-deadline triggers,
retries, replacements, real availability probes or post-run manual repairs.
Each official arm process exited 0; a completed evaluator can still return
R=false or reject a submitted patch, as the rows show.

H1/P has zero wins, one loss, five ties: D and R delta **−16.7 pp**, conservative
95% interval **[−69.13, +51.62] pp**. H1/C0 has zero wins, zero losses, six ties:
0 pp, interval **[−51.83, +51.83] pp**. The predeclared method uses the difference
of two 97.5% exact Clopper-Pearson intervals with a Bonferroni bound; its
independent numerical calibration preceded outcomes. These are descriptive
development intervals. Formal exact McNemar testing was reserved for the
conditional 30-task confirmation and was not performed here. Wide uncertainty
does not establish equivalence. Excluding Three.js gives zero delta; excluding
MUI or VS Code gives −25 pp. The complete repository-exclusion data is in
results.json. Historical campaigns and H variants are never pooled.

## What the trajectories support

The two original divergent cases were inspected before implementation; one
additional shared failure, VS Code 135805, was inspected after screening.
Deep analysis used three tasks, within the four-task limit. It used public task
text, source reads, visible tool results, checks and full patches; hidden
reasoning was not reconstructed. Other tasks retain metadata-level outcomes.

In fresh Three.js, all three production patches are identical: 848 bytes,
SHA-256 `107efece16f581847ae1e5e1477d26dc0f8a63917eed1a8414d3612dca2e41cf`.
Plain extends an existing QUnit test; C0/H1 introduce a test before the official
F2P labels. The official TAP parser retains numeric prefixes, so the new test
shifts identities although all three unit logs end with zero failed assertions.
Official full-M application succeeds in all three. R is retained exactly as
reported: this difference is scoring identity, not worse production behavior.
The hundreds of TODO labels classified by that parser are not a new regression
or an explanation of this difference. No author test was removed to gain score.

In fresh Serverless all modes implement per-member removal and retain JSON.
H1's added public compileMethods test observes absent form and retained JSON
in the same call, consistent with the new technique. It was added together with
implementation rather than observed executing on baseline first. P and C0 also
cover the needed scope and resolve. This is a substantive example, but supplies
no new correct delivery attributable to H1. Historical C/T selected all-defaults
interfaces; those historical failures remain separate from these fresh controls.

In VS Code 135805 H1 changes comments and adds tests of an existing `logicalLine`
argument, without changing production behavior. Source results showed that
existing argument before editing. Three compile-client invocations pass; its
single browser-test attempt stops before assertions because Chromium is absent.
The public desired behavior depends on two linked GIFs unavailable through the
authors' isolated tools. P/C0 add an editor option but still fail officially.
This evidence supports incomplete/unproven feature delivery, not a particular
required option name, default change or inferred hidden assertion.

A possible H2 would broaden the existing bug-first baseline check to feature
requests. It was rejected before implementation: C0 already requires observable
task outcomes and real public paths, and the available result supplies no new
distinguishing caller independent of the missing visual semantics. A green
existing-helper example was only a synthetic control, not an observed passing
behavior test in this trajectory. A read-only independent review reached the
same bounded conclusion. It does not prove that all feature baseline checks
are useless. No six-run budget was spent on an unsupported restatement.

## Costs, isolation and unused confirmation

| Arm | Input | Output | Cached input, included | Reasoning output, included |
| --- | ---: | ---: | ---: | ---: |
| P | 7,883,167 | 44,131 | 4,467,712 | 22,273 |
| C0 | 8,117,132 | 46,846 | 4,735,488 | 23,100 |
| H1 | 13,668,992 | 68,959 | 8,369,152 | 36,614 |

The 18 task-runs made **546 real requests**: 18 titles, 513 author/parent work
requests and 15 child requests. All child requests are H1's stock explore session
on VS Code 135805; delegation was optional, not a required harness workflow.
Recorded session IDs/parent IDs attribute every work request, with zero unknown
usage and every request using the fixed model/effort. All recorded client,
upstream and response hashes were checked against receipts. H1 used 65.6% more
agent execution time, 73.4% more input and 56.3% more output than P, without
increasing D. Increased cost alone was not the screening rejection criterion.
Monetary charges are unknown; cached/reasoning tokens are included subsets.

Common-control preparation totals 2,252.084 seconds and author-input preparation
648.401 seconds, as summed per-task intervals outside the timer. Official
evaluation adds 2,113.361 seconds and zero model requests. Agent, termination,
capture, cleanup and complete shared task-timer measurements appear separately
in costs.json; no post-start time was deducted. Maintainer analysis/implementation
and CI costs are separate and lack complete input/output or monetary metering.
They are not represented by the author-provider totals.

Gold/closed tests, credentials, private files, other-arm outputs and evaluator
feedback remained outside author mounts/context and private one-commit Git
history. The existing network, privilege, output quotas and fail-closed recording
and stop gates were preserved. No new service, evaluator or scheduler copy was
introduced; only the existing adapter's bounded 18/6/60-slot parameterization and
direct core capture were needed. Scripted/native/container checks establish
their mechanisms, separately from the model-quality outcome.

The metadata-only [confirmation protocol](../quality-confirmation-v1/PLAN.md)
and 30 primary/10 reserve selection were fixed before development outcomes.
Their task statements, code, gold, tests and outcomes were not used for candidate
development; no confirmation environment was prepared and no model run started.
H1 failed screening, so the 60-run stage is ineligible. The selected reserve
metadata also cannot guarantee replacement capacity under repository caps;
that limitation was not repaired after observing outcomes. There is no automatic
next experiment. Current source retains C0 instructions, normal materialization
and the existing experimental task/review tools.

Required project checks, PR review/CI and integration are technical publication
evidence, not quality confirmation. Private raw evidence is retained through
verified recovery archival; cleanup removes only this assignment's disposable
resources and preserves previous archives and preexisting resources. The
[cleanup receipt](cleanup.json) records actual retained artifacts and released
space separately. [Local verification](verification.json) reports all 20 passed
model-free groups, installed OpenCode's 35 task scenarios, and the bounded
semantic review. The private archive is 274,436,147 bytes, SHA-256
`86d7321ae9ba2e26fa02e603638d749c24944242fb9beacecfdbfeee7abab9d0`;
all 3,702 archived files were read back with byte/mode or symlink verification.
An independent shallow C0 clone restored the incremental development Git bundle.
Cleanup removed 21,029,335,040 allocated bytes of owned filesystem copies,
14 owned images, eight build records and 106 cache records. Docker separately
reported 15.92 GB logical cache reclamation; that is not added to filesystem
savings or called physical host disk reduction. Earlier archives, shared project
dependencies, foreign resources and all 18 once-only start/stop guards remain.
