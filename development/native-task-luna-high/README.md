# Luna/high diagnostics: stopped after the first deadline

The first planned run, plain OpenCode on `legacy-runtime-reload`, reached its
900-second deadline. One in-flight provider response was still `in_progress` and
ended locally with `AbortError`, without terminal status or usage. The frozen
launcher therefore stopped scheduling on **unknown submission**, as required.
The other three slots were never started. No run was retried or replaced.

The retained P patch passes the frozen scoped evaluator and adds a fresh-process
regression, but is **not a complete delivery**: a separate post-run test demonstrates
that preparation from the retained legacy launcher installs those old launcher
bytes alongside current libraries. **There is no measured H run and no P/H comparison.**
This series cannot establish whether Luna/high can deliver both tasks completely or
whether the harness helps it. It is development diagnosis on known tasks, not an
independent benchmark or evidence for changing the default model.

## Execution and actual delivery

| Frozen slot | Task | Arm | Execution | Delivery assessment |
| --- | --- | --- | --- | --- |
| 1 | legacy-runtime-reload | P | Deadline; unknown submission; patch captured | Frozen checks pass; incomplete whole delivery |
| 2 | legacy-runtime-reload | H | Not started after mandatory stop | Unmeasured; no author/correction/final stages |
| 3 | reconnect-revoked | H | Not started after mandatory stop | Unmeasured; no author/correction/final stages |
| 4 | reconnect-revoked | P | Not started after mandatory stop | Unmeasured; no patch |

[Machine-readable outcomes](results/outcomes.json) retain all four scheduled slots.
The first process is confirmed terminated and its container removed; the server-side
terminal state of the interrupted request remains unknown. An interrupted request
is not called a provider-completed response, a quota refusal, or a zero-cost request.
No attempt was made to resume it or poll the account through a different access path.

The launch used the existing OpenCode OAuth authorization only after the user's
additional direct chat confirmation. Two earlier local approval-review rejections
occurred before process creation and sent zero model requests. These are distinct
from the later deadline/unknown-submission stop.

## What P changed, and what remains

The [unaltered P-final patch](results/patches/legacy-runtime-reload/P-final.patch)
applies to the original public task baseline and includes its saved D-final input.
It changes connector config, two test files and connector README only.

P fixed the directory link-count check so the full historical layout can migrate.
It added a regression that migrates without a preinstalled marker, preserves the
installation, repeats runtime preparation and loads modules in a fresh process.
Its ordinary relevant tests and the frozen independent checks all pass:

| Offline check on retained final bytes | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Delivered state-security, executables, protocol suites | 24 | 0 | 1 |
| Delivered runtime config tests, including the new regression | 3 | 0 | 0 |
| Restored original preservation suites | 23 | 0 | 1 |
| Restored original runtime config tests | 2 | 0 | 0 |
| Independent full-layout migration and fresh-process reload | 1 | 0 | 0 |
| Independent legacy state and preservation checks | 9 | 0 | 0 |

The skip in each preservation route is platform-specific; it is not passing Windows
coverage. [Frozen grading results](results/grading-results.json) are unchanged by
subsequent diagnosis.

Whole-patch review identified a remaining entry-point defect. `runtimeSourceRoot()`
selects current libraries when `prepareRuntime()` receives the retained legacy
`bin/viberacing.mjs` URL, but `installRuntime()` still copies `sourceScript` as the
new launcher. The [separate post-run diagnostic](results/legacy-source-diagnostic.test.mjs)
supplies the complete historical layout and a distinguishable retained launcher,
then invokes the installed CLI. It prints `RETAINED_OLD_LAUNCHER` instead of current
help containing `connect`. [Diagnostic result](results/supplemental-diagnosis.json):
fail. This is supplemental evidence of an unfulfilled original behavior, not a
replacement frozen score, an author-delivered regression or a repaired model patch.

The authored migration fixture copies the current CLI into the historical fixture,
so it cannot detect that launcher/library mismatch. Its new rejection variants also
all use nonempty custom state directories, which have a separate fail-closed rule;
there is no valid positive control at that same location. Existing preservation
checks remain, but the new negative cases alone do not prove default-directory
legacy rejection coverage.

The author additionally ran the full connector suite twice: each execution recorded
157 passes, two scheduler wait timeouts and five skips. These failures remain in
[author check facts](results/author-checks.json); they are not reclassified as passes
or newly proven regressions. The optional Prettier command could not obtain pnpm in
the network-disabled container. No full platform matrix or manual Actions run was
performed. No final author answer was delivered before the task deadline.

## Requests, time and usage

[Metrics](results/metrics.json) and [sanitized request metadata](results/provider-metadata.json)
are from the real run. All 51 requests targeted `gpt-5.6-luna` and contained outgoing
`reasoning.effort: high`. This includes all 50 work requests and one auxiliary title
request. No alternate model, lower effort or new model stage was used.

| Metric | Observed value |
| --- | ---: |
| Task elapsed time, including local stop accounting | 900.107 seconds |
| Provider requests | 51 |
| Requests with terminal response and usage | 50 |
| Requests with unknown terminal state / missing usage | 1 |
| Tool calls | 99 |
| Input tokens with reported usage | 4,494,812 |
| Output tokens with reported usage | 34,160 |
| Total tokens with reported usage | **4,528,972** |
| Cached input subset, already included above | 1,521,152 |
| Reasoning output subset, already included above | 22,755 |

These token totals are **incomplete lower bounds for the run**, because the final
request has no usage record. Billed monetary amount is unavailable. Cache and
reasoning subsets are not added to input/output/total again.

The title request accounts for 1,109 input, 76 output and 1,185 total tokens, including
62 reasoning tokens. Work requests with available usage account for 4,493,703 input,
34,084 output and 4,527,787 total tokens. H cost, initial work, corrections and final
state are unavailable because neither H slot started. Equal configured deadlines
would not imply equal token budgets; no H overhead estimate is invented here.

## Preparation frozen before any model output

The reusable H implementation was unchanged from PR head
`44f6a4b1a73ed8347b852247bbc533fa04497080`, retaining its maximum three corrections,
permissions, isolated worktree, cancellation and original task deadline. The
experiment uses **OpenCode 1.18.26**, `openai/gpt-5.6-luna`, **high** for both arms.
High lives in the experimental model options/high variant, not a reusable default.

- [Plan](plan.json): balanced runtime P/H and reconnect H/P order, one attempt each.
- [Freeze](freeze.json): candidate, model/effort config, input patch hashes, evaluator
  hashes and pre-run controls. All 8,223 frozen files remain unchanged.
- [Scripted provider proof](effort-preflight.json): 12 outgoing Responses requests
  through the real OpenCode/container path, including plain work, H bootstrap,
  initial author and same-session correction. Every request sends high; titles are
  separately labelled. This test made zero real provider calls.
- Four isolated input copies were verified inside containers: 218 runtime public
  files or 222 reconnect public files, plus identical task/check scaffolding.
  Their bytes and executable modes reconstruct the exact historical D-final patches
  used by `native-task-ph-corrected`. The actual first model container verified them
  again before its first request. No new P/H-final was used as input.

The new evaluator was prepared and tested before results. It was never mounted in
an author container. [Runtime migration/reload](evaluator/runtime.test.mjs) uses the
full legacy layout, starts without a marker and repeats preparation in a new process.
[State checks](evaluator/state-security.test.mjs) permit a parent-entry rejection
message while retaining subsequent byte/mode assertions, correcting the known old
grader's leaf-name contradiction. [Reconnect checks](evaluator/reconnect.test.mjs)
initialize disconnected, 401 and 403 scenarios independently and inject failure at
the required config-unlink boundary, requiring connect to stop before pairing.

| Pre-run evaluator control | Expected | Observed |
| --- | --- | --- |
| Full runtime layout with directory-link defect corrected | pass | pass |
| Retained directory-link defect | fail | fail |
| Correct reconnect implementation | pass | pass |
| Swallowed mandatory config-removal error | fail | fail |
| Skipped disconnected-source reconciliation | fail | fail |
| Retained stale pending payload after revocation | fail | fail |

[Artifact verification](results/artifact-validation.json) confirms exact patch
reapplication bytes/modes, original input verification, 78 prior published evidence
files unchanged, all frozen materials unchanged and all 24 recorded preparation,
control, author and observer containers absent. Raw model payloads, credentials,
private reasoning and session logs remain excluded from publication.

The mandated stop prevents a result for the remaining slots. No further model work
is scheduled. Historical results, product defaults and automatic required checks
remain intact. No merge, release or model substitution follows from this result.
