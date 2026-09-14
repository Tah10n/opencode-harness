# Opt-in test sensitivity development

Scope: installed direct, one native author, A/B off, unchanged default. New
`HARNESS_TASK_SENSITIVITY=1` exposes `harness-sense` through native Bash.
StrykerJS instrumenter 10.0.0 supplies standard operators via its exported API.
No evaluator/runtime dependency, reviewer, mutation score, or automatic repair.

Fixed limits before any model batch: eight candidates per call, 180 seconds
aggregate diagnostic time per task (inside the existing task deadline), four
changed production files, 120 changed/context lines. Commands get at most 30s,
generation 15s. Missing work is reported. No incremental result reuse.

Local admission first: actual baseline, variants, stronger API regression,
equivalent control, import error, red baseline, timeout, unsupported scope,
permissions and installed same-session applicable patch. Scripted fixture success
is not evidence of Luna's ability to use the feedback.

Historical development selection (no Q/D recomputation): continuation slot 37
quick-lru computed insertion (missing default TTL regression), slot 27 denque
removeWhere (missing configured-capacity regression). Controls: retained passing
quick-lru computed historical H00 patch and continuation slot 28 removeWhere.
These are chosen weak regressions and controls, not a random sample. Standard
operators may not encode either omission; do not add task-specific operators.

Only after useful local historical observations and a frozen candidate: exactly
8 new diagnostic task-runs (one H0/H1 pair per saved patch). Balanced order
H0/H1, H1/H0, H1/H0, H0/H1. OpenCode 1.18.26, Luna/high, 900s each, fresh copies,
no replacement or real smoke. Both sides receive only the original task and same
unfinished source patch. No evaluator, known defect explanation, reference, or
other result in author input. A further four P/H pairs are conditional on an
additional full H1 delivery with substantive observation use and no new control
regression. Otherwise zero transfer runs.

Remote checked at start: Tah10n/opencode-harness, draft PR 25, head
f6d0ba3f38b779a148467382640e25abf98b21ea, base
feat/native-template-regression-workflow. Local checkout clean. Old campaign
process/container inventory empty; slots 43-48 and historical pauses untouched.
Ordinary push to feat/native-task-workflow and draft update are authorized;
merge/release/package/default changes and manual Actions are not.
