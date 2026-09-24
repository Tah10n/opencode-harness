# Native task delivery: development result

The installed experimental candidate works on the verified delivery path, but the
requested quality advantage over ordinary OpenCode is **not established**. All
48 development task-runs are complete. Independent evaluation remains **0/80**:
the selected approach has no positive full-delivery balance across different tasks
and no repeat confirming such a balance. No further campaign starts automatically.
The product goal is not achieved by this engineering delivery or budget exhaustion.

Measured runtime source: `4203021dc7eb41172baa62a1932e46576fa21100`.
Subsequent documentation commits are report-only and are not measured candidates.
Use the [installation and full-task command](../../docs/native-task/README.md#install-and-use)
with `HARNESS_TASK_STRATEGY=direct`. The model remains user-selected; this cycle used
OpenCode 1.18.26, `openai/gpt-5.6-luna`, high, 900 seconds for the entire task.

## Full patches and cost by frozen version

H is harness, P is ordinary OpenCode. A full patch includes required behavior,
consumers, regressions, docs and preservation. Native status and normal operational
completion are assessed separately. Each pair has identical source/task/dependencies,
fresh sessions and copies, balanced order and no evaluator/reference access.

| Source / approach | Pairs | Full H / P | Wins / losses / ties | Seconds H / P | Requests H / P | Tools H / P |
|---|---:|---:|---:|---:|---:|---:|
| `db7f374f` author + fresh finisher | 6 | 6/6 / 5/6 | 1 / 0 / 5 | 3173.582 / 1216.365 | 222 / 110 | 450 / 217 |
| `e0728dea` broad regression preparation | 5 | 4/5 / 4/5 | 1 / 1 / 3 | 2040.007 / 1675.547 | 125 / 136 | 238 / 239 |
| `c962d30a` focused observation + absolute root | 5 | 3/5 / 3/5 | 1 / 1 / 3 | 1271.391 / 1653.730 | 111 / 102 | 181 / 181 |
| `aa20e638` relative file guidance | 1 | 0/1 / 1/1 | 0 / 1 / 0 | 92.977 / 499.624 | 9 / 39 | 19 / 56 |
| `d3e24a9e` explicit relative Bash root | 2 | 1/2 / 2/2 | 0 / 1 / 1 | 364.779 / 767.399 | 42 / 60 | 89 / 96 |
| `c5b999b1` completed read errors with parallel reads | 2 | 1/2 / 1/2 | 0 / 0 / 2 | 1518.277 / 1061.126 | 120 / 70 | 179 / 113 |
| `67f8e948` one complete author pass | 2 | 2/2 / 2/2 | 0 / 0 / 2 | 574.299 / 502.167 | 62 / 46 | 97 / 89 |
| `4203021d` direct + completed grep errors | 1 | 1/1 / 1/1 | 0 / 0 / 1 | 383.453 / 504.314 | 35 / 54 | 58 / 91 |

These are development observations across 12 chosen tasks and repeated cases in
queue/limiter/iterator APIs, CJS/ESM consumer integration, catalog caching, HTTP
refactoring and connector state recovery/migration. Versions and repeated task
families are not pooled as independent evidence. No confirmatory effect estimate
or 95% interval is claimed, and no bootstrap zero-width interval proves equality.
The independent target remains +10 percentage points with the 95% interval lower
bound above zero; its readiness conditions were not met.

## What changed and what the patches showed

The fresh finisher changed no full-delivery outcome: all six initial H patches were
already complete. Mandatory regression preparation also failed to justify its cost.
The selected opt-in direct path removes those phases and report-driven corrective
replies. One author receives the complete original task and can investigate,
implement and test in the same pass. For stateful changes, conditional guidance
asks for actual state immediately before the real action, then the transition and
preserved invariants. This technique has not demonstrated a quality advantage.

Some H wins supplied required render-consumer regressions or rejected explicit
undefined as required. Losses included incomplete code after transport failure,
UUID typos in native paths and unjustified termination after ordinary completed
source-tool errors. Both iterator patches on the last check-first revision passed
behavior checks but omitted explicitly required late-promised-value regression
coverage: removing that guard still passed each delivered suite and failed the
same independent observer. The two failures were retained symmetrically.

The first direct revision produced H 2/2 and P 2/2 full patches. Its recovery H
stopped on a completed native grep parse error. The saved patch was complete and
passed external final connector tests (162 pass, 5 platform skips), but the failed
native handoff remains a separate operational failure. The planned same-SHA repeat
was not started; the remaining pair tested the corrected revision instead.

The corrected revision's final recovery pair was full for both arms. H completed
normally and ran 166 connector tests (161 pass, 5 platform skips) plus whitespace
verification after its last edit. P ran 165 tests (160 pass, 5 platform skips) and
whitespace verification after its last edit. Both passed the frozen independent
401/403, lifecycle and ordinary checks. H's internal incomplete retains an optional
`corepack pnpm verify` network failure, outside the task's bounded acceptance.
P also disclosed an unavailable optional formatter, but its final text named
`pnpm verify` while the recorded attempt was `pnpm exec prettier --check`; required
check results were accurate. Report accuracy is separate from patch suitability.

## Token accounting

All 1,343 forwarded requests and 2,393 tool calls are counted, including parent,
title, author, finisher, failed and timed-out attempts. Summed full-task runtime is
17,299.037 seconds (about 4.81 hours), not total development wall time. Five interrupted
requests have unknown usage. The following numbers are known subtotals; `*` marks
an incomplete row. Cache is part of input and reasoning is part of output, so they
are not added again. No monetary price is inferred from OAuth usage.

| Source | Arm | Input | Output | Cached input | Reasoning output | Unknown requests |
|---|---|---:|---:|---:|---:|---:|
| `db7f374f` | H | 8,531,106* | 120,559* | 2,863,104* | 60,195* | 1 |
| `db7f374f` | P | 4,440,540 | 48,618 | 1,831,936 | 21,231 | 0 |
| `e0728dea` | H | 5,473,443 | 87,580 | 1,363,456 | 46,426 | 0 |
| `e0728dea` | P | 6,249,594 | 65,912 | 2,947,072 | 34,347 | 0 |
| `c962d30a` | H | 3,200,475* | 51,581* | 963,584* | 23,135* | 2 |
| `c962d30a` | P | 6,212,730* | 54,497* | 3,022,336* | 28,538* | 2 |
| `aa20e638` | H | 130,849 | 4,331 | 27,136 | 2,867 | 0 |
| `aa20e638` | P | 1,282,667 | 23,028 | 619,008 | 14,543 | 0 |
| `d3e24a9e` | H | 1,064,174 | 16,453 | 378,880 | 8,359 | 0 |
| `d3e24a9e` | P | 4,414,704 | 29,768 | 2,315,264 | 16,512 | 0 |
| `c5b999b1` | H | 8,722,010 | 66,446 | 5,149,184 | 39,693 | 0 |
| `c5b999b1` | P | 4,492,289 | 47,252 | 2,375,168 | 30,849 | 0 |
| `67f8e948` | H | 4,188,748 | 25,337 | 2,143,744 | 12,789 | 0 |
| `67f8e948` | P | 3,633,044 | 20,411 | 1,519,104 | 10,483 | 0 |
| `4203021d` | H | 2,524,334 | 15,097 | 1,208,832 | 8,268 | 0 |
| `4203021d` | P | 4,670,824 | 17,496 | 2,947,584 | 10,137 | 0 |

Known cycle subtotals: 69,231,531 input and 694,366 output tokens, including
31,675,392 cached-input and 368,372 reasoning-output tokens. Exact totals remain
unknown because five request usages are missing; they are not zero.

## Installed validation and limitations

The final native suite passed with real temporary worktrees and preserved old
read/edit/permission, cancellation, snapshot and queue cases. Ten grep lifecycle
cases cover completion and negative boundaries. The failing baseline reproduction
and fixture-preparation failures are retained alongside the final passes.

The installed OpenCode preflight used 12 scripted requests and zero real provider
calls. It exercised native read/edit/glob/grep/Bash, a real grep regex error overlapping
source reads, red-to-green checks, one complete author task, source protection and
verified termination. The terminal patch applied and passed tests in an ordinary
copy without harness administrative data; the visible reply retained its path and
actual checks. The four installed runtime modules equal the committed source bytes.
This is execution evidence, separate from the scored Luna results above.

Completed read/grep errors remain errors and are never replayed by the controller.
Continuation requires matching lifecycle timestamps, admitted tools and unchanged
snapshots. Unknown live execution, permission boundaries, cancellation and external
changes still prevent unsafe progress. Safely captured partial patches remain
available. Unsupported test runners and unresolved optional failures stay visible;
internal status is not a semantic certificate.

The scored projects were checked on Linux Node 24; their full platform/web/database
matrices were explicitly excluded. In particular, a legacy H POSIX-mode assertion
was not validated on Windows. Runtime installation contains core instructions,
native config and four runtime modules; it imports no development/evaluation code.
Corpora, raw traces and grader inputs remain excluded from installation and Git.

At report preparation PR #25 remains open/draft at `97b38413`, with its base unchanged.
Local commits have not been pushed: automatic approval review rejected the earlier
ordinary push pending explicit chat authorization. No CI result is attributed to
these local SHAs. The single allowed manual final checkpoint remains unused.
No merge, release, registry publication or user-default change occurred.

The [development chronology](README.md) preserves reasons for each revision.
Private task inputs, outcomes, preparation incidents, stop receipts, grades and
complete accounting remain in `local/native-task-finish-20260912/`. Original failures
were never replaced; old closed campaigns remain closed.
