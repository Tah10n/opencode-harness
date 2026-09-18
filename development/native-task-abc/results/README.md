# Frozen native harness: four real-project A/B/C results

The full harness did not produce more complete deliveries than ordinary OpenCode on these four tasks, and the observed differences do not establish an advantage from its special review stages over one ordinary author continuation. Keep the complete configuration experimental; do not promote it to a mandatory product path. This is a diagnostic outcome, not evidence that the architecture is universally ineffective.

All 12 preregistered task-runs completed once. There were no model retries, replacements, timeouts, quota pauses or manual interventions. Each ran OpenCode 1.18.26 with `openai/gpt-5.6-luna`, variant `low`, and one total 900-second deadline. B used exactly one continuation of its own original native session. C used the full `/harness-task`. The native title request uses effort `none` in every run; all 298 task requests use `low`. Both kinds are included in the 310-request usage totals.

Runtime candidate `66b7b33fc6bd66201ee24ec84d6e6fcae9daaf28` was frozen before execution. Task selection, prompts, schedule and preflight were committed in `2a4b101f` before new model results. [The final freeze check](final-freeze-verification.json) verified all 9,106 source, reference, independent-test, runtime, prompt, runner and toolchain files unchanged. The cancelled 100-pair goal and completed 20-pair evaluation were neither resumed nor regraded.

## All twelve final outcomes

“Delivered” includes behavior, integration, required docs/tests, preserved necessary coverage and portable patch application within the agreed targeted scope. It is an independent adjudication, not a harness verdict. A raw green test result alone does not override lost coverage. C’s commented old transport body is reported as maintenance debt rather than a fabricated runtime regression.

| Slot | Task | Arm | Independent delivery | Seconds | Requests | Internal harness status | Patch |
|---:|---|:---:|---|---:|---:|---|---|
| 1 | Protocol error API | A | Delivered | 119.1 | 15 | n/a | [final](patches/protocol-error-api/A-final.patch) |
| 2 | Protocol error API | B | Delivered | 160.4 | 18 | n/a | [final](patches/protocol-error-api/B-final.patch) |
| 3 | Protocol error API | C | Delivered | 261.2 | 26 | incomplete | [final](patches/protocol-error-api/C-final.patch) |
| 4 | Legacy state reload | B | Incomplete: Windows path handling | 245.3 | 34 | n/a | [final](patches/legacy-runtime-reload/B-final.patch) |
| 5 | Legacy state reload | C | Delivered | 337.7 | 30 | incomplete | [final](patches/legacy-runtime-reload/C-final.patch) |
| 6 | Legacy state reload | A | Delivered | 146.5 | 16 | n/a | [final](patches/legacy-runtime-reload/A-final.patch) |
| 7 | Revoked reconnect | C | Incomplete: lost reconnect coverage | 276.9 | 30 | incomplete | [final](patches/reconnect-revoked/C-final.patch) |
| 8 | Revoked reconnect | A | Incomplete: stale pending data | 216.8 | 25 | n/a | [final](patches/reconnect-revoked/A-final.patch) |
| 9 | Revoked reconnect | B | Incomplete: lost reconnect coverage | 324.9 | 50 | n/a | [final](patches/reconnect-revoked/B-final.patch) |
| 10 | HTTP extraction | A | Delivered | 195.4 | 17 | n/a | [final](patches/request-module-extraction/A-final.patch) |
| 11 | HTTP extraction | C | Delivered; dead-code maintenance note | 296.8 | 29 | incomplete | [final](patches/request-module-extraction/C-final.patch) |
| 12 | HTTP extraction | B | Delivered | 293.8 | 20 | n/a | [final](patches/request-module-extraction/B-final.patch) |

The resulting delivery counts are A **3/4**, B **2/4**, C **3/4**. Every C run internally ended `incomplete`; no C run reached `reviewed_delivery`, and none exhausted its deadline. Final raw behavior checks passed for A 3/4, B 3/4, C 4/4. Their difference from delivery counts is intentional: B’s Windows regression and B/C’s lost existing reconnect coverage matter. Treat the four-task denominator as fixed and diagnostic.

## What changed in the actual code

**Protocol error API:** all arms reject validated server errors with status/code and integrate the existing CLI request consumers while retaining invalid-response handling, messages, retries and Retry-After. All pass 12 independent protocol cases, 14 real CLI consumer cases and preserved ordinary suites. B’s additional 503 assertion existed in D0. C requested additional consumer tests despite equivalent existing CLI coverage; its attempted stderr assertion expected a server code that the legitimate existing quarantine message does not expose, and the author reverted that assertion. Neither B nor C changed final file bytes after D0.

**Legacy migration/reload:** A and C pass the historical ownership cases and fresh-process reload, repeated preparation and installed CLI checks. B passes the full historical layout and its own meaningful repeated-process test, but its added `hasValidLegacyRuntime` compares raw `path.relative` results with slash-only strings. [The exact-function path probe](D4-path-semantics.json) accepts the full POSIX layout and rejects the same Windows layout. That is a concrete new portability defect; it is not a claim of a completed Windows runtime test. The frozen independent reload case also uses a subset of known old files, which B refuses. Because the task did not explicitly settle whether missing recognized files must be accepted, that raw failure is preserved as an ambiguous boundary, not used alone to fail B. B’s continuation changed indentation only. C’s file bytes were unchanged after D0.

**Revoked reconnect:** A retains the original remote-disconnected-source test but calls `disableLocalConnection()` without pending-data cleanup. Both independent 401 and 403 cases pair successfully and then exit 1 with `Invalid pending payload` during initial sync. B and C use `disableLocalConnection(true)` and pass those cases plus five existing cancellation/ownership/source-preservation scenarios. That improvement is already present in both D0 patches. Both, however, replace the prior successful authenticated `mode="disconnected"` scenario with `mode="unauthorized"`; the original remote-source-retirement path is no longer executed by their supplied tests. Other omission and in-flight replacement tests are not substitutes. C’s review adds a real 403 test after D0; B’s continuation restores a dropped recovered-config source assertion. Neither restores the lost scenario. Therefore none of these three deliveries completes the full original task.

**HTTP extraction:** all arms route the actual CLI callers through a shared module, preserve transport behavior, update installed runtime copying, retain original assertions and pass 15 CLI consumer cases plus the independent installed CLI check. A and B remove the old functions; C leaves them in a block comment. This is avoidable maintenance debt, not a second executable implementation. New transport tests are meaningful in all three. The installed `--version` path eagerly loads the ESM transport dependency; an installed HTTP operation is stronger evidence but not the only admissible check of the requested loading path. B and C file bytes are unchanged after D0.

## What the special stages contributed

C produced one substantive post-D0 addition: the 403 reconnect regression. It did not change production code after D0 on any task and did not recover the lost reconnect coverage. The state result is better than B’s, but that difference was present before review. Independent initial outcomes and only four tasks do not isolate a causal architecture benefit. In this sample C improves one A runtime defect that B also avoids; C does not deliver more complete tasks than A.

The compact evidence adapter is a deterministic improvement, but model selection remains unreliable. For API and migration all 15 selected entries across the four reviews resolve exactly. For reconnect the reviewer invents a long suffix; for extraction it strips the scope and returns bare `E30`-style names. All 16 selections in those four reviews remain unresolved. The host correctly rejects them; there is no nearest-ID repair or false successful binding. Public per-run JSON records exact selected/ref/native event identity and state; the original reviewer responses and separate bindings remain in the retained local evidence. Failed and stale checks stay failed or stale.

C also rejected attempted parallel mutation/check calls in the reconnect run under the existing sequential evidence rule. Several full config runs reported scheduler failures. A post-score [unchanged-baseline diagnostic](baseline-scheduler-diagnostic.json) reproduces both exact failures in the same container: “the detached scheduler child owns its lock and later launchers exit” and “a hook persists its event while another hook holds the scheduler launch gate”. Both time out waiting for process conditions. These are baseline/environment failures, not newly demonstrated patch regressions. Their root cause was not repaired or guessed. They remain failures in the original C evidence; targeted independent successes do not rewrite that history.

## Observed resource use

| Arm | Total seconds | Requests | Input tokens | Cached input subset | Output tokens |
|:---:|---:|---:|---:|---:|---:|
| A | 677.8 | 73 | 2,445,729 | 724,992 | 17,035 |
| B | 1024.3 | 122 | 5,001,810 | 1,951,744 | 27,129 |
| C | 1172.6 | 115 | 4,252,830 | 951,808 | 37,818 |

C uses 73.0% more elapsed time, 57.5% more requests, 73.9% more input tokens and 122.0% more output tokens than A. Against B it uses 14.5% more time, 5.7% fewer requests, 15.0% fewer input tokens and 39.4% more output tokens. B has much more cached input: C’s uncached input is about 8.2% higher than B’s. These are observed resource quantities, not a dollar invoice. OAuth quota charges or prices were not inferred from native cost estimates. Every request has usage metadata. Per-run usage, reasoning-token subsets and phase durations are in the adjacent JSON files and [summary](summary.json).

B’s continuation durations were 28.7s, 71.2s, 27.7s and 61.1s for API, state, reconnect and extraction. C’s implementation/review/reproduction/disposition timings are preserved individually, including its three formatter stages. A shared 900-second limit did not equalize token use.

## Product decision

Do not nominate this full C configuration as a proven candidate for mandatory use or independent final promotion: its closure failed in all four runs, its only review-attributable test addition did not yield a complete reconnect delivery, and it retained a coverage regression. This conclusion is limited to these observations; it does not establish that independent review is never useful.

The minimum configuration worth a separate next evaluation is one native author session behind the existing worktree, permissions, cancellation, deadline, patch capture and delivery controls, with at most one ordinary same-session completeness pass. Keep deterministic project checks and explicit remaining obligations. Do not require the formal reviewer/reproduction/disposition chain merely because it already exists. The ordinary B continuation is a control mechanism, not a new controller or product command. Its own 2/4 result means the extra pass is not established as a mandatory default either.

No runtime, default, historical evidence or profile is changed on the strength of this proposal. A future independent assessment must select new tasks from the same connected real-project class and justify its sample size and budget separately from the desired decision precision and measured run costs. No next series, fixed 20/100-task quota, merge or release is authorized or started here. The original project goal of a reliably useful complete autonomous path remains unproven.

## Delivery, verification and limitations

[All 20 final/D0 patches](patch-manifest.json) are preserved, including unsuccessful outcomes. [Clean application verification](delivery-verification.json) checks every patch and confirms every final reapplication has the same bytes and executable bits as the independently tested snapshot. Use the source commit in [the preregistered selection](../selection.json), apply one matching patch to a clean checkout, then run its targeted tests in the same isolated Node environment. Patches for one task/arm are alternatives and are not intended to be stacked. [Phase deltas](phase-deltas.json) distinguish content changes from diff ordering/hash-abbreviation differences.

The independent grader executed all 12 final snapshots and all eight B/C D0 snapshots after model termination, with zero provider calls. It first ran delivered tests, then restored original preservation suites in its own copy, adapting only the two deliberately changed protocol/revoked-auth contracts. Frozen independent assertions are published under [evaluation](evaluation/README.md); reference implementation code never entered a model context. Five existing lifecycle/cancellation tests additionally exercise the already-declared reconnect requirements. No scored task, prompt, expected result or threshold was changed.

All ordinary/preservation suites have one expected Windows-only skip on Linux; other targeted checks have none. The entire web/database/platform matrix was outside the declared scope. The two baseline scheduler failures remain explicitly unverified as a full-suite product signal. Human source review used opaque packet labels, but the same integrator knew the schedule: it was not fully blinded or an external independent human assessment. The executable checks and delivery decisions do not use the harness verdict as their answer.

The command-reference candidate passed controller tests, retained seat/Map event replays with new selections, direct native format/template/review/config regressions and seven affected installed fixture scenarios. After one bounded diff review, the final affected controller/installed cases were rerun successfully. Scripted container preflight used zero real provider calls and confirmed both C’s installed path and B’s same-session continuation. Old erroneous seat/Map responses and old statuses were not rewritten. Those checks establish binding/control-flow behavior; the model runs expose the separate unresolved selection and delivery limitations above.

The model, grading and diagnostic containers all have recorded successful cleanup. Raw provider/session evidence, original reviewer outputs, references and temporary run state stay in ignored local storage. Published artifacts contain public task patches, frozen evaluation assertions and curated observations only. Manual Actions dispatches, full platform-matrix runs, merges, releases and default changes: zero.

Publication checks: all result/usage totals, 20 patch hashes, evaluation artifact hashes and local links were verified. `git diff --cached --check` passes for prose/JSON/test files. The raw patch artifacts intentionally retain standard space-prefixed blank context lines (and original D0 trailing separators), which the outer repository whitespace check reports; their bytes are not rewritten. Every outcome and evaluation patch separately passes `git apply --check --whitespace=error-all` against its public baseline. All 45 known task/preflight/grading/diagnostic containers are absent after cleanup.
