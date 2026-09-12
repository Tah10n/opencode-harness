# Native task workflow diagnostic pilot

This report compares ordinary native OpenCode (A) with the explicitly enabled
`/harness-task` workflow (B). It is a six-task development diagnostic, not evidence
of general or statistically significant lift. The reusable candidate is commit
`0f23e03cb1594987a6ae8ac61f7e9f699e8662bc`; the pre-call freeze was committed as
`ce7a4c4`. The candidate and all task/reference/grading files stayed fixed during
these attempts. No scored attempt was retried.

Both arms use OpenCode 1.18.26, `openai/gpt-5.6-luna`, variant `low`, the same
initial task project, native tools, and a 900-second total task limit. Native
auxiliary title requests use the runtime's `none` effort; they are included in
requests and tokens for both arms. B's bootstrap, author, reviewer, reproduction,
repair and final response all consume its total limit. Equal time limits do not
mean equal token or request budgets.

The existing offline development container and native relay were reused. Each
attempt received a fresh project/session. Model generation ended and workload
termination was verified before independent grader files were injected. The
original tests were restored in a separate copy and run by explicit frozen file
names, independently of the candidate's npm script. Original project checks also
ran separately. D0 was reconstructed and graded with the same checks. Raw native
messages, source archives and runtime state remain local; the public aggregate
contains counts and scoped source-review conclusions.

Completeness requires the visible behavior, preserved behavior, explicit project
tests and documentation, normal checks, and fixed source criteria. Independent
source review can identify a visible requirement missed by the finite executable
checks; no new executable criteria were added after observing results. A native
reviewer verdict or `reviewed_delivery` status does not determine the grade.

Token accounting uses observed provider usage. Input includes cache reads/writes;
output includes reasoning. Those subsets must not be added again to totals.
Tool calls include failed native tool events and B's orchestration call; session
counts include parent, author and all separate reviewers. Observer grading tools
are excluded from task-run tool counts and time.

## Results

**Complete deliveries: A 5/6; B 4/6.** Executable acceptance passed 17/18 checks
for A and 18/18 for B. All original preservation checks and ordinary project
checks passed. The difference between executable counts and completeness is
intentional: B loses a required v2 data field in source and omits one explicitly
requested project test. Finite acceptance coverage does not override those
visible requirements.

| Task | A: delivered requirements | B: delivered requirements | Complete A / B | Independent D0 defects or gaps / fixed | New regressions | Expense A / B (seconds; tools; requests; input+output tokens) |
|---|---|---|---|---|---|---|
| expense-export | All behavior/tests/docs | All behavior/tests/docs | yes / yes | 0 / 0 | 0 | 95.038; 25; 15; 135,319 / 147.508; 33; 22; 236,917 |
| catalog-cache | All behavior/tests/docs | All behavior/tests/docs | yes / yes | 0 / 0 | 0 | 91.329; 20; 14; 123,895 / 129.297; 29; 19; 187,790 |
| bookmark-migration | All behavior/tests/docs | R2 v2 extra bookmark fields lost; tests/docs delivered | yes / no | 1 data-loss defect / 0 | 0 | 86.590; 21; 13; 115,201 / 133.013; 25; 18; 180,614 |
| delivery-outbox | All behavior/tests/docs | All behavior/tests/docs | yes / yes | 0 / 0 | 0 | 112.664; 23; 15; 140,261 / 136.415; 26; 18; 180,804 |
| dual-config | Supplied undefined indent wrongly accepted; tests/docs delivered | All behavior/tests/docs on D0 | no / yes | 0 / 0 | 0 | 79.111; 23; 14; 118,505 / 123.869; 25; 20; 211,681 |
| lazy-pagination | All behavior/tests/docs | Behavior/docs pass; empty intermediate-page project test missing | yes / no | 1 missing test obligation / 0 | 0 | 88.856; 23; 15; 142,573 / 126.589; 27; 20; 198,476 |

The defects/fixed column counts independently confirmed gaps in B's D0 and actual
fixes, not differences between independent A and B initial implementations. Native
review identified the bookmark data loss. It missed the specific empty-page test
gap in lazy-pagination; that gap was found by independent final source grading. Every B D0 patch equals its terminal
patch byte-for-byte. **Repairs admitted: 0; initial errors fixed: 0; post-review
regressions: 0.** B's dual-config advantage existed before review. Zero regressions
here does not demonstrate repair safety: no real repair happened.

Explicit tests/docs delivery: A has no missing categories; B misses the requested
successful empty-intermediate-page project test in lazy-pagination. Its only
empty-page project case immediately repeats a cursor and expects TypeError, so it
does not establish successful continuation. No required documentation is missing
in either arm. Old necessary test coverage is retained in all twelve deliveries.

Bookmark B's R2 data loss is a source-backed finding outside the finite executable
acceptance: `src/schema.mjs` rebuilds valid v2 records from only id/url/title/tags,
dropping extra existing fields. R2 requires valid v2 without data loss. A spreads
the record. No scored tests or expectations were changed to make this finding.
Dual-config A's recorded acceptance failure is a missing TypeError for a supplied
`indent: undefined`, which its implementation treats as omission.

## Cost and mechanism

| Metric | A | B |
|---|---:|---:|
| Total task seconds | 553.588 | 796.691 |
| Native tool calls | 135 | 165 |
| Provider requests including auxiliaries | 86 | 117 |
| Native sessions | 6 | 18 |
| Input tokens | 754,215 | 1,164,991 |
| Output tokens | 21,539 | 31,291 |
| Cached input subset | 320,000 | 297,472 |
| Cache write input subset | 0 | 0 |
| Reasoning output subset | 3,015 | 4,825 |
| Requests with unknown usage | 0 | 0 |

B used 43.9% more time, 36.0% more requests and 54.2% more input+output tokens.
All observed requests succeeded, all attempts ended before their limit, and each
container cleanup returned success. Requests and internal sessions are distinct:
B used six parent sessions, six author sessions and six reviewer sessions; A used
six author sessions. There were no reproduction or repair model sessions.

Only delivery-outbox B reached `reviewed_delivery`. The other five B attempts
retained their deliverable and returned `incomplete`:

- expense-export: a general reviewer caveat about not independently running
  commands populated `unverified`, although reviewers intentionally consume the
  author's recorded commands and final checks were present.
- catalog-cache: reviewer JSON contained a trailing comma and could not parse.
- bookmark-migration: reviewer identified the real data-loss defect, but included
  production files in `verificationFiles`; the reproduction path guard rejected
  the list before reproduction/repair.
- dual-config: reviewer structured output omitted required `reproduction`.
- lazy-pagination: production paths in `verificationFiles` were rejected before
  reproduction/repair. Native review reported other coverage concerns but missed
  the empty-page test obligation identified by independent grading.

**Decision: the review-to-verified-repair portion did not deliver the expected
result.** The installed scripted fixtures establish stage control, preservation
and fail-closed behavior; this real pilot shows that native reviewer protocol and
reproduction-file selection prevented all repairs. Full-delivery performance did
not improve, and overhead increased. This candidate is published as a draft
implementation with a negative diagnostic result, not recommended for independent
lift evaluation or default promotion. There is no automatic follow-on benchmark,
rescue revision, merge or release.

Per-attempt counts, usage subsets, grading, source assessments and evidence hashes
are in [results.json](results.json). The frozen corpus and pre-call measurements
are in [freeze.json](freeze.json); installation is documented in
[the workflow guide](../../docs/native-task/README.md).
