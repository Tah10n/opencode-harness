# Fixed 20-pair comparison, preregistered before scored requests

The gate is the independent [development delivery assessment](../PREPARED-RESULTS.md),
not workflow status. Runtime source is fixed at
`328728b3ff1a416fb267d7de1b2b36b2b19cfbff`; preparation is `0868864`. No mechanism
changes or scored retries are permitted. Tasks here are newly prepared, not drawn
from losses of plain OpenCode. There are five tasks in each class: integration,
state, API compatibility and behavior-preserving refactoring. Contracts vary by
algorithm, data shape, consumer and ownership; this is not a renamed-function set.

[schedule.json](schedule.json) fixes all 40 slots: ten AB and ten BA pairs,
alternating by task in the recorded selection order. One fresh isolated session
and original initial project per slot. A is ordinary native OpenCode build; B is
same OpenCode with the fixed task workflow. Same model openai/gpt-5.6-luna low,
OpenCode 1.18.26, source tree, ordinary tests and project AGENTS, dependencies,
container boundary and 900-second total budget. B includes bootstrap, review,
formatting, preparation and any two shared correcting cycles. The treatment is
the opt-in harness including its core instructions; A does not acquire harness
instructions. No extra task-specific observer messages are supplied.

Only initial trees enter model containers. References, alternatives, mutants,
independent acceptance tests and grading files stay outside until verified model
termination. Existing external runPilot/native/container/capture/offline evaluator
are reused. No new benchmark framework or statistical library is introduced.

## Preflight and endpoint

Each original ordinary test passes. Each reference and alternate implementation
passes original, added ordinary, independent acceptance and preservation checks.
A deliberately incorrect implementation per task fails an independent assertion.
The existing corpus preflight evaluates 80 task/variant combinations; the final
model-free run passed all controls. A prior preparation-only run exposed malformed
string literals and two insensitive mutant controls; corrected before freeze.
No scored results existed when those changes were made.

All tasks retain their explicit contract and grading.json. Primary endpoint:
all required behavior plus preservation, final ordinary checks, meaningful project
regressions for the listed cases, and requested documentation. Manual integration
requirements (core actually used by consumer) are reviewed from source, not import
name matching or model prose. Equivalent assertions and alternative algorithms
are accepted; exact reference source/test names are never required. An assertion
that exits early does not credit later checks. Unknown/unavailable delivery is
not a successful baseline substitute. Review status is recorded separately.

Assess final A/B and B/D0 independently. Missing D0 remains unavailable. Report
content changes after D0 and full-delivery outcomes without assuming review caused
an improvement or unchanged D0 proves review unnecessary.

## Analysis fixed in advance

Use existing `development/native-task-comparison/statistics.mjs`:
`pairedTable`, exact two-sided McNemar p-value and Tango 95% paired difference
interval. Unit of analysis is the task pair, never assertions. Report all 20 pairs,
both-success/neither-success ties, B-only wins and A-only losses, full-delivery
rates and B-A difference. A positive-effect claim requires positive difference and
two-sided p <= .05; show the approximate interval and exact test separately if they
disagree. No equivalence claim from nonsignificance. Category breakdown is descriptive.
Twenty tasks give limited precision and selected-domain evidence only.

Usage: sum observed input/output/total once per provider response; cache/reasoning
are nested details, not additive to totals. Show requests without observed usage,
actual tool calls and elapsed native-process time including all B stages. Retain
failures/timeouts and partial captures; never choose or repeat a preferred outcome.
Do not pool these pairs with development or old pilots.

First confirmed quota exhaustion pauses all further requests/slots. Unknown 429
also pauses without being mislabeled quota. Common pre-session startup failure
stops shared scheduling. If incomplete, retain started outcomes, show pending slots
and do not present complete-sample rates/statistics from the partial denominator.
Maximum combined task slots stays 4 old failed starts + 4 development + 40 comparison.
No manual Actions, platform matrix, merge, release or default change.
