# Transfer was not measured: two projects did not pass bounded admission

The six-candidate search did not produce two admissible projects for the unchanged
TYPE_COMPAT candidate. No Luna task-run or other research-provider request was
started. All twelve reserved slots remain **not_started**, with **unknown Q/T/D**.
There is no transfer, H1–H0 or H1–plain effectiveness result from this stage.

This is the explicit pre-launch stop specified in the assignment. It is not a
model failure, provider refusal, transport pause, completed freeze or negative
effectiveness finding. TYPE_COMPAT remains experimental/default-off. The useful
subscribe results remain development evidence from one known project.

## Six candidates and observed admission

Exact commits, archive/package/declaration hashes, project commands and complete
safe compiler diagnostics are in [selection.json](selection.json). The check used
original declaration bytes in both worlds: no prospective author patch, reference,
seeded defect or generated expected failure entered the generator.

| Project | Source commit | Result and reason |
| --- | --- | --- |
| sindresorhus/quick-lru | `f2fe88e2932603c038c61ca29de6ad5286148e1b` | Rejected: original exports is the top-level `{types, default}` form; capture rejects it before entry selection. |
| invertase/denque | `539105bb57854e997dd469221cdc52a0ad80e0a2` | Rejected: its existing root `index.d.ts` was selected explicitly without editing package metadata. Original `export = Denque` fails the diagnostic namespace import with TS2497 in both identical worlds. No generated consumer was admitted. |
| DirtyHairy/async-mutex | `b0bb4c5aa0e42eb5ffc8d9342e56bb6de1b95554` | Rejected: metadata identifies `lib/index.d.ts`, but the exact source checkout contains TypeScript sources and no existing generated public declaration. Capture reports ENOENT. No build/declaration generation was substituted. |
| sindresorhus/emittery | `147a8591045e00d0fe8088e2393e3eefea3aa4a5` | Rejected: original top-level conditional exports is unsupported. No exports rewrite or older-version search. |
| EventEmitter2/EventEmitter2 | `39313aa1399e8c477aa7cc324676384c3757bbee` | Structurally admitted: two compiler-valid original consumers, both detached `Boolean.valueOf()` calls reached through `stopListeningTo()` / `hasListeners()`. This is at most one provisional project, not an accepted/frozen full task. |
| zenparsing/zen-observable | `8406a7e3a3a3faa080ec228b9a743f48021fba8b` | Rejected: no existing public `.d.ts` in this source checkout and no types/typings entry. No external DefinitelyTyped surface was substituted. |

The two EventEmitter2 consumers do **not** cover its returned event callbacks:
`listeners()` and `listenersAny()` are explicitly skipped for non-concrete rest
tuples. Registration methods need unsupported function-shaped arguments and
`listenTo` is overloaded. The Boolean observations are compile-only; they do not
establish safe runtime execution of detached Boolean methods. Even counting this
project generously as structurally eligible leaves only one, below the required
two. No extension was designed around those incidental consumers to force a win.

The bounded candidates span cache, deque, locking, async emitter, wildcard emitter
and observable APIs. Potential complete-extension directions were bulk cache
access preserving expiry/order, bounded deque draining, cancellation of one pending
lock acquisition, settled event-dispatch outcomes, listener-query/forwarding
management, and count-based observable buffering. These are feasibility directions,
**not frozen prompts or newly added acceptance requirements**. Each would need
runtime, public consumers, old-call compatibility, tests/types/docs. Declaration
admission failed before that task design/calibration was justified.

Local prepared dependency trees exist for QuickLRU and Denque (AVA and Mocha
package entries were checked); their current project commands were not rerun after
declaration rejection. Four other exact public source checkouts were fetched
read-only. No dependency installation, cache reconstruction, new toolchain or
project lifecycle script was executed. Their offline project-check readiness
therefore remains unproven. The pinned Node/compiler environment itself was usable.

Selection limitation: the historical TYPE_COMPAT comparison plan already mentions
screening out QuickLRU, Denque and Emittery. Their rechecks add no fresh project
diversity; they were not previously successful tuning tasks, but are not newly
discovered exclusions either. The search was not expanded beyond six after this
was found. These results describe these exact checkouts and this bounded search,
not a proof that no suitable public project exists. No other version was silently
substituted, and no declaration graph/configuration was simplified.

## Reserved slots and comparisons

The user's order is preserved in [PLAN.md](PLAN.md) and [RESULTS.json](RESULTS.json).
A/B never became selected project tasks, so no fictitious per-project 0/2 score is
reported. Unknown is not a failed delivery.

| Slot | Task | Repetition | Arm | Status | Q | T | D |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | 1 | P | not_started | unknown | unknown | unknown |
| 2 | A | 1 | H0 | not_started | unknown | unknown | unknown |
| 3 | A | 1 | H1 | not_started | unknown | unknown | unknown |
| 4 | B | 1 | H1 | not_started | unknown | unknown | unknown |
| 5 | B | 1 | P | not_started | unknown | unknown | unknown |
| 6 | B | 1 | H0 | not_started | unknown | unknown | unknown |
| 7 | A | 2 | H0 | not_started | unknown | unknown | unknown |
| 8 | A | 2 | H1 | not_started | unknown | unknown | unknown |
| 9 | A | 2 | P | not_started | unknown | unknown | unknown |
| 10 | B | 2 | P | not_started | unknown | unknown | unknown |
| 11 | B | 2 | H0 | not_started | unknown | unknown | unknown |
| 12 | B | 2 | H1 | not_started | unknown | unknown | unknown |

All four task/repetition pairs have unknown H1–H0 and H1–P outcomes. No best-patch
selection, pooled subscribe data, useful repair count or performance claim is
possible. No patches/receipts/native events exist for these unstarted slots.
The positive engineering threshold was preserved but cannot be evaluated.

## Verification and preserved state

Remote origin was verified as Tah10n/opencode-harness; head matched the requested
publication starting point, and PR #25 was open/draft with the requested base.
The task worktree was clean. The root worktree and existing source caches were
not edited; existing QuickLRU/Denque lockfile changes were preserved by archiving
their exact Git commits instead of using dirty source bytes.

The separate candidate archive comes from
`e18db1fe10223db52dcc05b3e769bca140367c2b`. All three diagnostic module hashes and
TypeScript API hash match the prior repeatability freeze. Screening ran with Node
v24.19.0 in the retained image
`sha256:0ed6cee0b095ecf1e1e780418cb373d462f1b99643bb86db0a8de7dd58fc83a6`,
as user node, read-only root/source, network none, dropped capabilities,
no-new-privileges, init/reaping, CPU/memory/PID bounds. Compiler workers use the
unchanged permission-limited launcher and verified termination. This model-free
screening container sees research files for evaluation; it is **not** an author
mount or a P/H0/H1 isolation/preflight claim. The temporary container was removed.

One preparation-script attempt failed before screening because it used `hashes`
instead of the prior freeze's `files` key. That local reader was corrected and
the bounded screening rerun; no product source or measured input changed.
An earlier archive-helper invocation rejected an unsupported Python tarfile
argument before extraction; ordinary `git archive`/`tar` completed preparation.
Neither is a paid attempt or evidence of product failure.

There were no old live OpenCode processes or containers before preparation.
Historical pauses were neither ignored nor changed. No transport/authentication
code was invoked for a research model. All runtime/profile/launcher/transport and
historical development files remain unchanged from the publication starting point.

Local checks cover exact candidate/compiler identity, six-source admission,
worker stopping, twelve-slot order and null outcomes, accounting, artifact hashes
and one final scope/diff review. Full task calibration, ordinary per-project CLI
semantic success/failure, P/H0/H1 inventories/capture/delivery and patch application
were **not reached**. No full suite, platform matrix, manual Actions or aggregate
CI success is claimed; PROCESS_CONTAINMENT_UNAVAILABLE remains untouched.

To verify the committed records, run
`node development/native-type-compat-transfer/verify.mjs` from this worktree.
For source-level reproduction, obtain exactly the six commits in manifest.json
and archive each into `local/native-type-compat-transfer/baselines/<name>`;
write that manifest's `sources` array to the local `sources.json`. Archive the
candidate's `lib` and `profiles` into `local/native-type-compat-transfer/candidate`.
Keep the prior prepared compiler at its recorded location. Run screen.mjs inside
the recorded image with the worktree mounted read-only at `/repo` and a disposable
writable directory at `/out`, network none, user node and the isolation limits
described above. It writes `/out/selection.json`; it neither fetches dependencies
nor executes a model/project script. The image is a retained local research image,
not a promised public pull location. Do not overwrite the committed observations
when reproducing. OpenCode/model settings in manifest.json are planned conditions,
not evidence of an OpenCode execution in this stopped stage.

## Cost and bounded decision

Luna task-runs, research-provider requests, tools, token usage and compiler analyses
inside author sessions: **zero**. There is no unknown provider usage because no
request was submitted. Slot elapsed/cleanup remain null, not measured zero-duration
runs. Two model-free original-vs-original compiler comparisons belong to preparation
only; their elapsed/compilation counts are retained in selection.json. Four other
projects stopped during capture. Current developing-agent effort and GitHub reads
are separate, with no precise agent cost telemetry or invented currency estimate.

Decision: **do not start this transfer batch**. The unchanged candidate did not
admit the required two projects in the authorized bounded search. Mechanism
transfer, extra complete deliveries over H0 and product benefit over true plain
remain unproven. There is no new default/runtime change, seventh candidate, alternate
model or automatically authorized campaign. Further progress needs a separately
authorized selection/scope decision; this report preserves the stopped stage.
