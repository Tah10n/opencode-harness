# Subscribe repeatability on the unchanged candidate

Measure e18db1fe10223db52dcc05b3e769bca140367c2b with precisely the prior
frozen prompt, baseline, evaluator, corrected references, image, dependencies,
OpenCode 1.18.26 and openai/gpt-5.6-luna/high. Each full run has 1800 seconds.
Reuse ../PLAN.md acceptance and environmental conditions without additions.
Only TYPE_COMPAT differs; no product/runtime/transport/permission changes.

All four slots are assigned before any real request:
1. repetition 1 ON
2. repetition 1 OFF
3. repetition 2 OFF
4. repetition 2 ON

Fresh isolated source/session per slot; no replacement, replay, probe, paid
reviewer or continuation. Ordinary task failure does not cancel later slots;
the existing launcher external/admission stop policy still closes the series.
Unstarted outcomes are unknown. Author context excludes this plan, evaluator,
reference, historical patches/results and other sessions. Scripted preflight
uses disposable copies and is never supplied to Luna.

Before real requests: verify previous freeze hashes and exact baseline manifest,
run the existing short scripted OFF/ON preflight and capture audit, freeze all
new inputs and commit this plan/manifest locally. The scheduler only gains an
explicit four-slot validation option; its transport and stop logic are unchanged.
Foreign host workloads remain untouched. Raw captures stay private and ignored.

Q = complete portable patch under the unchanged prior rubric; T = normal
autonomous delivery and verified termination; D = Q AND T. Review neutral
patches before revealing arms where possible. Compile author tests separately.
Preserve original patch bytes and modes; distinguish raw diff whitespace from
source whitespace. Evaluate after task-runs, without modifying author patches.

Two separate questions: (A) at least one new ON repeats new incompatibility ->
received compiler evidence -> correct repair -> full feature preservation;
(B) ON produces more D than OFF, not solely because of an external interruption.
A positive readiness decision requires BOTH ON D=true, more ON D than OFF,
and A. This is an engineering threshold on one known development task, not a
statistical lift estimate. Ties, partial repairs, outcome differences without
mechanism, reversals and incomplete series retain their distinct meanings.
The original positive pair is separate and excluded from this threshold.

Account all requests including titles, known/unknown usage, subsets, run and
cleanup time, compiler analyses and staleness. Preparation/evaluation/current
agent effort is separate; no invented monetary cost. No default change or next
campaign. One final ordinary push and update to existing draft PR #25, retaining
base feat/native-template-regression-workflow; no merge/release/manual Actions.
