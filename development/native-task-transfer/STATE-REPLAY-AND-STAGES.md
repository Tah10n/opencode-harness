# State-boundary regression replay and retained stage attribution

This change follows published report head `bcfeaf57c492654fe48130c0b695ebc3b763e8cf`.
It does not rerun or rescore the transfer pilot measured at
`db99470ab3517b741e0452613a9ff04f68a49bc1`. **New real provider calls: 0.**
The transfer result remains **A 5/6, B 6/6**, including the original two
`reviewed_delivery` and four `incomplete` B statuses. The earlier A 5/6, B 4/6
pilot and all continuations remain unchanged. Tasks, rubric, grader, delivery
patches and historic cost records are unchanged. The disputed document `toJSON`
case is not an additional B win.

## Narrow runtime change

The controller now uses one state-boundary function for final commands,
documentation checks and reproduction admission. Known unequal snapshots mean
changed; known equal snapshots mean unchanged. A failed event with `before:null`
can mean unchanged only when a separate host observation records rejection before
execution against the same expected snapshot and a subsequent actual capture
confirms that snapshot. The plugin produces this observation only for its own
sequential guard; it never derives it from model text or a command name. The
original null endpoint and failed event remain intact.

Missing or inconsistent observations remain unknown and invalidate prior evidence.
A fresh check can establish evidence after an unknown boundary; unknown state
alone cannot complete the task. A real change, including separately observed
change then revert, still invalidates earlier checks. Permission denial, scope
violation, cancellation and failed external-change control remain blocking.
An external mismatch latches a violation without updating expected state. Failed
tool events stay in the journal and cannot themselves become successful evidence.
This is a small host/controller change; prompts, roles, tools, write policy,
admission requirements and the single evidence-correction limit are unchanged.

The selected old transactional-settings/document-backup event fields are retained
in `scripts/fixtures/native-task-state/`. Their original null events still yield
`incomplete` when replayed alone: the old logs do not contain the new host proof.
A separately augmented regression replay exercises the new observation shape.
That is not a claim that historical observations were retroactively collected.
Installed scripted tests independently exercise the actual production hooks:

- passing `npm test`, then sequential rejection with unchanged state preserves
  that command as usable evidence;
- an external save injected after guard rejection and before its error event
  invalidates earlier evidence, stops further stages and preserves saved bytes;
- an upstream rejection without a host before snapshot remains unknown;
- a real later mutation, and mutation followed by revert, require a new check;
- documentation reads and failing behavioral assertions survive only a confirmed
  unchanged rejection; the latter reaches one scripted repair and final checks;
- print with exit zero is not behavioral reproduction; native automatic deny,
  user rejection and cancellation still stop work; full evidence-correction replay
  still reaches repair within the unchanged limit.

Fixture responses test routing, not model repair quality. Its wrapper injects an
external actor/upstream failure only in test scaffolding; the production controller
and guard do the classification. The first unknown-state fixture draft used an
invalid read argument; installed OpenCode actually supplied a before snapshot for
that error. It was replaced with explicit upstream rejection to test the intended
unknown boundary. No runtime relaxation was made to satisfy that test.

## What the saved stages contributed

All six B D0 deliveries already met the unchanged rubric, including required
tests/docs, and passed the retained independent behavior and preservation checks.
All six finals also met that rubric. No production repair occurred after D0.

| Task | D0 / final complete | Actual post-D0 change and historical internal outcome |
|---|---|---|
| partial-checkout | yes / yes | No patch change; review accepted delivery. |
| http-error-consumer | yes / yes | Added URL/options assertions on another error branch. Missing disposition for obligation-0 is a separate protocol outcome; it remains incomplete, not automatically discharged. |
| transactional-settings | yes / yes | D0 and final identical; successful npm reference was invalidated by a null-before sequential rejection. Historical incomplete is preserved. |
| document-backup | yes / yes | D0 and final identical; same false-stale pattern. Historical incomplete is preserved. |
| dual-lookup | yes / yes | Temporarily added and removed a test for unsupported consumer-callback throw propagation; final patch equals D0. The author rejected an expectation not established by the task. Those real test mutations invalidated earlier checks. A later npm run passed, but review cited both old and final commands and requested stronger callback error-identity coverage. These remain distinct facts and the historical status stays incomplete. |
| quoted-contact-import | yes / yes | No patch change. The scored CSV win was already present at D0; review did not repair it. |

Reviewer requests beyond the rubric are not automatically false. HTTP's extra
assertions are useful stronger coverage. Dual-lookup's final stronger interpretation
is retained without adding new frozen scoring requirements after observation.
Neither protocol case is broadened or relabeled by this runtime fix.

## Cost attribution from saved timestamps and usage

Reproduce the sanitized aggregate (no network, models or grader execution):

```sh
node scripts/analyze-native-task-transfer-stages.mjs local/native-task-transfer/runs
```

[stage-attribution.json](stage-attribution.json) records windows and totals.
Each stage's final message ID identifies its native child session; the nearest
preceding user message in that session starts its window, and the final assistant's
completion ends it. Provider request start timestamps match nonoverlapping windows.
This is verified temporal correlation, not a stored causal provider-ID mapping.
No request has multiple matching windows. The remaining three requests per task
are title generation, parent bootstrap and parent summary. The parent assistant
spans the workflow and is not used as an implementation window.

Cells below are **requests / observed total tokens**. The single HTTP 503 usage
is unknown in quoted-contact-import implementation. Cache and reasoning are
already included in provider totals and are never added again.

| Task | Implementation | Review (including disposition review) | Investigation/preparation | Other overhead |
|---|---:|---:|---:|---:|
| partial-checkout | 19 / 205,417 | 2 / 35,893 | 0 / 0 | 3 / 14,581 |
| http-error-consumer | 12 / 114,798 | 1 / 14,093 | 5 / 82,014 | 3 / 15,436 |
| transactional-settings | 15 / 139,334 | 2 / 28,998 | 0 / 0 | 3 / 14,616 |
| document-backup | 16 / 156,149 | 1 / 14,337 | 0 / 0 | 3 / 14,458 |
| dual-lookup | 15 / 155,641 | 2 / 53,451 | 6 / 115,146 | 3 / 15,423 |
| quoted-contact-import | 13 / 125,022 + unknown | 1 / 18,902 | 0 / 0 | 3 / 14,382 |
| **Total** | **90 / 896,361 + unknown** | **9 / 165,674** | **11 / 197,160** | **18 / 88,896** |

Dual-lookup review comprises initial 1 / 18,772 and disposition review 1 / 34,679.
There are no repair, evidence-correction or format-correction requests in these B
traces. Before/after D0 includes the applicable overhead requests:

| Task | Before D0 requests / tokens | After D0 requests / tokens |
|---|---:|---:|
| partial-checkout | 21 / 212,503 | 3 / 43,388 |
| http-error-consumer | 14 / 121,889 | 7 / 104,452 |
| transactional-settings | 17 / 146,423 | 3 / 36,525 |
| document-backup | 18 / 163,243 | 2 / 21,701 |
| dual-lookup | 17 / 162,731 | 9 / 176,930 |
| quoted-contact-import | 15 / 132,115 + unknown | 2 / 26,191 |
| **Total** | **102 / 938,904 + unknown** | **26 / 409,187** |

D0.json has no timestamp. Its creation is bracketed by implementation completion
and first-review user creation. No provider request starts within that bracket in
these traces, so the table needs no guessed allocation. Unknown usage is still
unknown even though its stage is known. The 128 requests and 1,348,091 observed
tokens plus unknown reconcile with the unchanged historical B total.

Recorded workflow elapsed time: implementation 574.859 s, review 151.040 s,
investigation 74.898 s, and 46.925 s outside those stages, totaling 847.722 s.
The remainder includes orchestration, snapshots, bootstrap/summary and termination;
it is not pure provider latency. Provider metadata has request-start timestamps,
not response-end timestamps. No dollar cost is inferred from token totals or OAuth
quota. This observational decomposition does not establish that removing review
would preserve the same initial solution or outcomes.

## Validation boundary

Targeted controller tests and native-template materialization passed. The full installed
scripted fixture passed all 30 scenarios (207 local scripted requests, zero real
provider requests), including the six new state cases and the existing total-budget
and cancellation cases. The attribution script reproduced the committed JSON;
7,434 frozen inputs and 432 historical artifact hashes remained unchanged.
Independent read-only runtime diff review found no actionable defects. Exact-head
Verify CI is linked in the PR after publication. Local private traces and original
hash manifests remain outside committed artifacts; the new JSON contains only
aggregate accounting, stage timestamps and saved check counts. No new paid run,
benchmark campaign, merge, release or default change is part of this work.
