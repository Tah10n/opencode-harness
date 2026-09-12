# D development results: one author and at most one factual correction

The frozen D revision did **not demonstrate a gain in complete patch delivery** on these four reused development tasks. A delivered 2/4 complete patches; D delivered 2/4. Working behavior passed the independent observer checks in 3/4 for each arm. D used more time and provider requests. One correction repaired a damaged old suite, but none of the three observable D0-to-final transitions converted an incomplete patch into a complete one. These are development observations, not an independent benchmark or a general lift estimate.

D remains experimental. Its installed mechanism works with one native author session, actual execution/snapshot evidence, exact test diffs and zero or one corrective pass. This result does not justify promoting it to the ordinary default or starting another campaign.

## Frozen run and evaluation contract

- Candidate: `3b877f69782619f0ce6097d894bf0158cb365355`, frozen before any real request. Later commits only publish results/documentation.
- Four task sources, instructions and independent checks are the same as the completed A/B/C series. All eight A/D runs are new. [Plan and source identities](../plan.json), [freeze](../freeze.json), [evaluation input hashes](evaluation-inputs.json).
- OpenCode 1.18.26, `openai/gpt-5.6-luna`, variant `low`, 900 seconds per task, including D checks and correction. Order: API A/D, runtime D/A, reconnect D/A, refactor A/D.
- Eight assigned, eight terminated; no retries, timeouts, quota stop or replacement attempts. All 220 forwarded requests have usage. No model requests during independent grading.
- Fresh isolated Linux containers and source checkouts. Only public task inputs entered model containers; grader/reference files and host authorization were not mounted there. The unchanged evaluator ran after all author processes terminated.
- Eleven graded endpoints: eight finals and three D0s. API D stopped at a real native permission denial before D0 capture. Its terminal patch is retained and evaluated as final, never relabeled as D0.

The executable grader is independent of the harness and its reported status. It runs delivered tests first, then original/task-adapted preservation tests only in its own disposable observer copy. Source, documentation and delivered-coverage inspection was performed by the integrator who knew the arm schedule; it is **not an independent blinded human assessment**. Requirements and executable grading inputs were unchanged after results.

## All eight outcomes

“Behavior” is the independent observer's product/preservation checks. “Coverage” requires the necessary scenarios to be present and executable in the delivered project tests. “Complete patch” requires both, the delivered checks, source conformance and documentation within the bounded task. It is separate from native workflow completion and from broader platform acceptance.

| Slot | Task | Arm | Behavior | Delivered checks | Necessary coverage | Complete patch | Principal result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Protocol error API | A | Pass | Pass | Yes | **Yes** | Direct API error contract adapted; invalid controls and CLI consumer coverage retained. |
| 2 | Protocol error API | D | Pass | Pass externally | Yes | **Yes** | Valid retained patch, but native run incomplete after permission denial; D0 unavailable. |
| 3 | Legacy runtime reload | D | Fail | Pass in final | No | **No** | Rejects valid complete flat layout; correction restores old suite but supplies no new legacy regression. |
| 4 | Legacy runtime reload | A | Pass | Pass | No | **No** | New legacy acceptance fixture exists, but no delivered combined legacy preparation/executable/repeat-loading regression. |
| 5 | Revoked reconnect | D | Pass | Fail | No | **No** | External 401/403 and lifecycle scenarios pass; the delivered disconnected test branch runs with invalid state. |
| 6 | Revoked reconnect | A | Fail | Pass | No | **No** | Stale pending payload survives revoked recovery; no new positive 401/403 regression. |
| 7 | Request module extraction | A | Pass | Pass | Yes | **Yes** | Transport extraction, installed module contract and regression coverage delivered. |
| 8 | Request module extraction | D | Pass | Pass externally | Yes | **Yes** | Same task requirements met at D0 and final; correction performs cleanup, with native broad-check failures retained. |

Machine-readable [all outcomes](outcomes.json) include every check's exit code/counts, source/coverage reasoning, workflow status, correction reasons, timings and usage. [Summary](summary.json) distinguishes delivered-check pass (A 4/4, D 3/4), all frozen check pass (A 3/4, D 2/4), working behavior (A 3/4, D 3/4) and complete patch delivery (A 2/4, D 2/4). A green modified suite alone would incorrectly accept A reconnect; external behavior alone would incorrectly accept D reconnect and A runtime as complete.

## What changed from D0 to final

| Task | Correction | Concrete change | Effect on acceptance |
| --- | --- | --- | --- |
| Protocol error API | 0 | Author used the parent artifact directory as `git diff --check` workdir, omitting `/worktree`; native `external_directory` permission denied. No later author stage started. | No D0 comparison possible. Final patch passes external checks; native completion remains incomplete. |
| Legacy runtime reload | 1 | Restores `state-security.test.mjs` to the original after a stray `*/` caused `SyntaxError`; removes the unfinished added regression; replaces a false condition with the exact file-count guard. | Real repair of old test execution. Ordinary check changes from 1 failure to pass. Complete-layout behavior still fails and required new coverage is absent: incomplete → incomplete. |
| Revoked reconnect | 1 | Replaces the obsolete 401 rejection with successful pairing assertions and then retains `mode = "disconnected"`. The earlier pairing changes config to one source; the old two-source response is reused without restoring its starting state. | Intended 401 behavior is preserved, but the old distinct scenario is not functionally restored. Delivered test still fails with invalid protocol response: incomplete → incomplete. No production behavior improvement in correction. |
| Request module extraction | 1 | Removes a commented copy of the former CLI implementation and restores `NODE_ENV` during test cleanup. Transport logic and meaningful assertions are unchanged. | Cleanup only; complete → complete. Both endpoints pass the scoped external checks. |

Runtime and refactor feedback contained stale/missing final checks, actual outputs, the task/current patch and exact existing-test changes. Reconnect D0 had not changed a test; its trigger was the unsuccessful/stale reconnect check. The final coverage change was observed after its only correction, with no second pass. No grader or reference repair was supplied to any author.

The mechanism did not make a second author pass unconditional: the installed correct-D0 fixture uses none. In these real runs, three received a concrete correction trigger and the fourth stopped at permission denial. This set therefore does not demonstrate that correct real-world patches routinely avoid additional work.

## Behavior failures, coverage gaps and regression boundaries

**Runtime D:** the frozen full-layout acceptance fails with `state contains an unrelated entry: lib` in D0 and final. `recognizedLegacyRuntimePaths` checks `info.nlink !== 1` for directories too, rejecting the nested adapters directory on the Linux task filesystem. The old-suite syntax damage is repaired, but the requested behavior remains unfixed. No new final failure of previously supported product behavior was established by the scoped preservation checks. The separate negative legacy check stops on diagnostic wording (`lib` instead of the unrelated filename); that failure is not evidence that privacy protection was weakened.

The supplemental reload evaluator uses a subset of known legacy files, while the task's wording about complete-set presence is ambiguous. Its raw failure is retained, but subset refusal or file-count policy alone is **not** used to fail D. The complete-layout failure and missing delivered regressions independently establish incomplete delivery. A's code passes these observer checks, but its single initialization fixture does not supply the explicitly required repeat-loading coverage.

**Reconnect:** removing the original expectation that 401 must abort is a legitimate task change. The separate unavailable/disconnected-source scenario must still be covered. D's final suite retains its name and statements but reaches them with incompatible state; the frozen delivered-consumers check fails. Observer copies with the correct independent starting state pass 401, 403 and lifecycle preservation for D0 and final. This is a delivered-test regression, not proof that production disconnected behavior broke. A preserves that old scenario but calls cleanup without clearing pending payloads; both independent 401 and 403 recovery checks fail with `Invalid pending payload`. A's supplied suite remains green because no positive revoked-recovery regression was added.

**API and extraction:** altered assertions are evaluated against task intent rather than frozen byte identity. The API change keeps invalid-response controls and already-present CLI coverage; it does not need a redundant CLI test edit to count that retained coverage. Both extraction patches copy the new module into the installed runtime and extend the existing runnable installed-CLI test, preserving consumer contracts.

## Time, requests, tools and observed usage

| Task | Arm | Seconds | Requests | Tool calls | Input tokens | Cached input | Output tokens | Reasoning tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Protocol error API | A | 117.792 | 15 | 21 | 316,675 | 94,208 | 2,949 | 719 |
| Protocol error API | D | 166.071 | 19 | 21 | 388,263 | 29,184 | 3,229 | 661 |
| Legacy runtime reload | D | 372.672 | 47 | 50 | 1,990,350 | 879,104 | 11,783 | 4,378 |
| Legacy runtime reload | A | 167.544 | 21 | 30 | 777,755 | 104,960 | 4,727 | 1,283 |
| Revoked reconnect | D | 195.452 | 33 | 34 | 946,263 | 281,088 | 7,239 | 2,507 |
| Revoked reconnect | A | 248.264 | 36 | 40 | 982,390 | 435,200 | 7,892 | 3,842 |
| Request module extraction | A | 194.000 | 17 | 26 | 575,433 | 56,320 | 6,418 | 591 |
| Request module extraction | D | 288.010 | 32 | 34 | 1,310,528 | 484,864 | 8,037 | 941 |
| **Total A** | | **727.600** | **89** | **117** | **2,652,253** | **690,688** | **21,986** | **6,435** |
| **Total D** | | **1,022.205** | **131** | **139** | **4,635,404** | **1,674,240** | **30,288** | **8,487** |

Usage is provider-reported, not a dollar bill or an estimate of remaining subscription quota. Cached and reasoning columns are detail subsets; do not add them again to input/output. Total tokens: A 2,674,239; D 4,665,692. The task variant was low. Provider metadata records 212 requests with low effort and eight with none (one additional request in every A and D run); all are included in the totals. D records two native sessions (command parent plus one author), not two authors or a reviewer. Corrections reuse the author session. Elapsed time covers each whole task run, not the later independent observer grading.

## Evidence limits and validation

All four retained D workflow artifacts say `incomplete`. API has a real permission denial; runtime and refactor include broad integration check failures; reconnect's delivered scenario is red. Native `checks_passed` was never substituted for complete task acceptance. OpenCode truncated large native tool outputs in runtime and refactor, so their raw scheduler status/repair/delivery fields are null. The separate `artifactWorkflowStatus` and `artifactRepairs` fields come from the retained native `result.json`; raw unknown fields remain unchanged.

Runtime/refactor native broad suites encountered two scheduler wait timeouts. Runtime also placed filtering options after test filenames. The frozen scoped observer checks avoid those broad scheduler cases by the predeclared task pattern. Their passes establish only that scoped acceptance; no baseline rerun was added and the broad failures are not relabeled as unrelated or fixed. Windows-specific tests remain skipped on Linux. There were zero manual Actions launches and no full platform matrix.

[Local mechanism validation](../local-validation.json) records three direct native regressions, fourteen installed scenarios, one independent diff review with four bounded fixes, and a same-container scripted preflight (8 scripted requests, zero OpenAI). [Historical reconnect replay](../reconnect-replay.json) confirms that both the lawful 401 expectation removal and separate old-scenario deletion reach author feedback, without regrading history.

[Final verification](verification.json) confirms all 9,099 frozen files unchanged, all eleven patches apply cleanly, all eight final reapplications match graded bytes/executable modes, four original D checkouts unchanged, and model/grader termination and cleanup. [Container cleanup](container-cleanup.json) confirms all 20 task-created containers absent. Raw private runtime/session/provider logs remain local; public outcome fields normalize the generated delivery-worktree prefix and preserve source/patch content.

## Retained patches

| Task | A final | D0 | D final |
| --- | --- | --- | --- |
| Protocol error API | [A final](patches/protocol-error-api/A-final.patch) | Unavailable after permission denial | [D final](patches/protocol-error-api/D-final.patch) |
| Legacy runtime reload | [A final](patches/legacy-runtime-reload/A-final.patch) | [D0](patches/legacy-runtime-reload/D-D0.patch) | [D final](patches/legacy-runtime-reload/D-final.patch) |
| Revoked reconnect | [A final](patches/reconnect-revoked/A-final.patch) | [D0](patches/reconnect-revoked/D-D0.patch) | [D final](patches/reconnect-revoked/D-final.patch) |
| Request module extraction | [A final](patches/request-module-extraction/A-final.patch) | [D0](patches/request-module-extraction/D-D0.patch) | [D final](patches/request-module-extraction/D-final.patch) |

[Patch hashes](patch-manifest.json) bind each available endpoint. Source/report whitespace checks pass; saved patch files pass `git apply --check --whitespace=error-all`. An unfiltered outer Git whitespace check flags their space-prefixed empty context lines, which are preserved as part of the original unified patch bytes. D0 and final patch serialization can differ in index length/order; semantic change claims use reconstructed file bytes and modes, not patch-text inequality.

The concrete limitation is that factual feedback repaired local test damage but did not produce a finished fix for the missing legacy behavior or the stateful reconnect regression. The one-pass bound correctly stopped further work without hiding failure. This candidate and its negative/mixed results are retained for inspection; no additional reviewer, variant, new-task evaluation, merge, release or default change is part of this run. Historical C (`66b7b33fc6bd66201ee24ec84d6e6fcae9daaf28`), A/B/C, old 20 pairs and the stopped `incomplete_quota` series are unchanged.
