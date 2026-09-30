# Consolidated candidate: fixed comparison plan

Candidate: `39def2ed0b1476299b104b38f8c93747d828a87a`. Product files, prompts,
permissions and deadline implementation remain unchanged. One branch and PR:
`eval/polybench-consolidated`. This is a new campaign, not a pilot continuation.

## Selection fixed before technical preparation

Dataset `AmazonScience/SWE-PolyBench_Verified` at
`b3fca77b637379f0c01ad86d18753a7ac1998b53`; CSV SHA-256
`0c8138e73c34fa29a5276b675b146b72d78ce001fcc4560d76302c908b4808a5`.
Evaluator `amazon-science/SWE-PolyBench` at
`9c836c5d7f3cb991934132b77d29e6941d912a07`.

`campaign.json` records the exclusion list and source hashes. Exclude the ten
pilot tasks, including all subsequent indexed PolyBench/MUI/preservation case
studies. Merely listing metadata in the pilot reserve order does not count as
using or deeply analysing a task. No solution content informs selection.

Sort eligible IDs by SHA-256 of `opencode-harness-consolidated-v1\n` plus ID,
with ID as collision tiebreaker. Select the lexicographically earliest feasible
sequence with 10 tasks per language and at most four per repository globally.
Hamilton largest-remainder quotas use the eligible language pool, with category
name breaking fractional ties. Fail if quotas are infeasible; do not adapt them
after technical controls. Eligible JS: 76 Bug Fix, 17 Feature, 2 Refactoring;
TS: 74 Bug Fix, 21 Feature. Quotas are 8 Bug Fix + 2 Feature per language.
The 20 IDs and 60 cyclic slots are saved in `selection.json` before preparation.
Keep every selected ID; technical failures affect all three arms, without replacement.
New to our development process does not mean absent from model training.

## Arms and common conditions

P: normal OpenCode build, native tools, no harness or user plugins/instructions.
C: stock `--native --profile core`, no task/review plugin.
T: stock native core with `--task`; `/harness-task`, direct strategy,
INVESTIGATION=1. CONTEXT, CHECKS, TYPE_COMPAT, SENSITIVITY, COMMAND_HINTS,
PRESERVATION_NUDGE and EXTRA_ATTENTION are explicitly zero. No review command,
manual investigation call, author reminder or extra continuation.

All use OpenCode 1.18.26, `openai/gpt-5.6-luna`, high; the existing OAuth route
`https://chatgpt.com/backend-api/codex/responses`. No paid probes/smokes.
Outgoing model/effort must match before forwarding. One attempt per assigned
slot; cyclic P-C-T, C-T-P, T-P-C in saved task order, serial execution.
1800 seconds per task-run from the existing timer start after preliminary host
container/input preparation (user clarification, 2026-09-30). This preliminary
preparation has no model requests, task solving or agent-selected actions.
The budget includes OpenCode bootstrap, title/parent requests, all author work,
project commands, investigator and its preparation, additional worktrees created
after task start, inspect, integration and native delivery. Children have no
independent budget. No post-start delay is deducted retrospectively. This boundary
is identical for P/C/T; the deadline implementation and stop rules are unchanged.
At most 60 task-runs, 108000 seconds / 30 hours total assigned wall-clock budget.
The three preparation exclusions keep nine slots not_started; the remaining
seventeen tasks admit at most 51 attempts. Exclusions are not model failures.
No independent monetary limit or price is inferred from this wall-clock limit.

Report timing from existing receipts, without new runtime telemetry:
- Preliminary preparation: `started.json.at` to `timing.taskStarted.at`.
- Agent execution: taskStarted to forwardingClosed; include all post-start
  overhead and investigator work. Also retain native execution/cleanup fields.
- Capture and cleanup: existing captureStarted/captureFinished and
  cleanupStarted/cleanupFinished marks, separately; retain the entire interval
  after execution as post-execution overhead so gaps are not silently removed.
- Full slot processing: started.json.at to completed.json.at, or the last verified
  receipt when completion is missing (explicitly incomplete, not a full duration).
Use monotonic differences within timing records and wall timestamps across
receipts. Missing boundaries remain unknown. Report all modes' overhead,
including T; these components must not be double-counted in total slot time.

Use the same public source tree, problem statement, environment facts, resources,
network and native permission policy. Preserve project AGENTS/README. Remove
host-global context and hidden/future Git objects; inspect image build outputs as
well as source. Reuse containment, recorder, capture and artifact resolver.
Recording: `research-full-inspect-ledger-1g-v1`, 1 GiB per slot with existing
per-request/response limits; no default changes. Reserve space for all evidence.

## Admission and evidence

Before any real request: official baseline/gold controls without parser/test/gold
edits; per-instance author isolation and dependency checks; one short scripted
connection check per arm; exact final snapshot/patch round trip including new
files, deletions and modes. C/P capture their author tree; T captures delivery
worktree. Clean pinned evaluator includes checking untracked/importable sources;
Python assertions remain enabled. Record product SHA separately from adapter SHA,
installed bundle/configuration hashes and image digests. Commit final PLAN,
preparation results, slots and freeze locally before model admission.

Unknown submission, auth/quota, incomplete evidence or unverified local stop
closes admission. Preserve pauses and remaining not_started slots. Do not resume
without a separate decision. Ordinary incorrect patches, voluntary completion,
non-use of investigator and verified timeouts stand. A new adapter fault after
start stops the batch; no silent repair and replay. Never stop because an arm loses.
Archive and verify evidence before deleting exact campaign-owned temporary data.

## Scoring and analysis fixed before results

Official evaluator receives the exact complete captured patch, including tests
and fixtures. Its patch order, commands, parser and resolved criterion stand.
No synthetic empty patch when capture is missing. Empty delivered patch is distinct.
Per slot: R (official resolved), T (autonomous delivery with verified stop),
D = R and T, terminal/partial artifact kind, provider outcome, evidence status,
usage completeness. T is an operational delivery measure: all native sessions end,
no tools remain pending, local stop/capture/cleanup are verified and the complete
captured patch applies to its base. T additionally requires a captured task
terminal record for the task arm. Product `workflow_status` (including missing
project checks) is reported separately, since ordinary P/C have no corresponding
product self-assessment. Neither T nor a captured terminal record certifies
correctness. R_partial is separate from delivered success.

Primary comparison T versus P. Secondary C versus P and descriptive T versus C.
Report complete paired counts, wins/losses/ties, paired percentage-point delta
and incomplete pairs. For fully observed pairs use a two-sided percentile paired
bootstrap 95% interval: 100000 task-level resamples, Python Random seed 20260929,
linear empirical 2.5/97.5 percentiles. This small-sample interval can degenerate
with no discordances; it is not evidence of equivalence. Do not impute missing
scores or claim no advantage from missing data. Formal test only for primary
T versus P: two-sided exact McNemar at alpha .05; C/P has no significance claim,
so no second formal hypothesis is tested. Report leave-one-repository-out deltas
as sensitivity, without choosing a favorable subset. Tasks, not HTTP requests
or tests, are the units; repository clustering limits generalisation.

Show resolved/evaluated, rate, autonomous deliveries, execution time, input/output
usage and unknown/evaluator/infra counts per arm in README. All author/child/title
requests count; cached input/reasoning output are included subsets. Money unknown
without a route-specific reliable bill/rate. Preparation/evaluator/CI/developer
work are separate from inference. Twenty JS/TS tasks are not a leaderboard score.
Publish small public results and report, retain raw captures privately. If a real
blocker prevents measurement, publish exactly what failed and what was observed;
never convert blocked or unstarted cases into zero scores or full completion.
