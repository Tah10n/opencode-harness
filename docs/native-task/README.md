# Explicit native task workflow

`/harness-task` executes a task in a separate Git delivery worktree using ordinary
OpenCode author tools, a separate read-only reviewer, and at most two correcting
cycles shared by missing implementation and behavior repair. It is opt-in and does not change the default agent, model, provider,
variant, authentication, or `/harness-review` behavior.

## Install and invoke

From this candidate checkout, with an existing parent directory:

```sh
node scripts/profile-materialize.mjs --native --profile core --task \
  --output /absolute/task-config

HARNESS_TASK_FILE=/absolute/original-task.txt \
HARNESS_TASK_TIMEOUT_MS=900000 \
OPENCODE_CONFIG_DIR=/absolute/task-config opencode
```

Choose your normal model/variant and invoke **`/harness-task` without arguments**.
The original task is supplied once in the task file. Native command arguments
undergo shell/file expansion before plugin hooks; do not paste task text as
arguments. Use a new native session for each invocation. `--review` may also be
passed at installation to include the unchanged diagnostic `/harness-review`.
The native CLI entry point is `opencode run --command harness-task` with the same
environment. Do not use `--pure`, which disables the required opt-in plugin.

The timeout defaults to 600000 ms; accepted values are 1000 through 3600000 ms.
It bounds the command from admission, including bootstrap and summary, and all
internal stages. Native cancellation propagates to active workflow sessions.
Explicit task delegation authorization remains subject to native permissions.

## Delivery and preserved work

The workflow captures the original task and complete nonignored tracked/new-file
patch under the resolved reviewer read rules. It creates one detached Git
worktree at the exact captured base and seeds it with those bytes. The user's
original index and evolving working files are never replaced by a result patch.
**The delivery is in the returned worktree**, including incomplete work. Adopt it
through your normal review/merge process; this command performs no automatic
transfer, reset, cleanup, merge or deletion of the original checkout.

The delivery worktree and private artifacts are retained under the original
Git administrative directory at `harness-task/<run-id>/`. Snapshots include the
initial input, D0, each admitted repair patch, reproduction patches, and a terminal
patch. Stage messages and actual native tool inputs/results bind evidence to code
snapshots; model completion prose and todo state are not check results. These are
local records, not certificates. They can contain task/source/command contents;
do not publish the private artifact directory.

A worktree supplies tracked files and nonignored captured additions. Ignored
build artifacts/dependencies are not copied; normal project setup/checks remain
the author's responsibility. This is normal Git/OpenCode execution, not a new
sandbox or a security boundary against arbitrary authorized shell behavior.
Project-absolute permission patterns that cannot safely move with a worktree are
refused; workspace-relative rules retain their native meaning. Missing/denied,
oversized or unsupported snapshots stop the workflow rather than exporting a
partial task/diff. The existing 1 MiB snapshot limit remains.

## Review and bounded completion

The author receives the complete task. The reviewer receives the original task,
initial state, current patch including new files, source-reading tools, and
actual tool evidence. Reviewer shell/edit/delegation/todo remain denied.

Concrete findings, missing explicit obligations and lost old test coverage are
candidates for grounding, not automatic requirements. Before repair the author
checks the basis and expected value. Only reviewer-named conventional test/docs
files may change during reproduction; a production change stops admission and is
retained as an incomplete delivery. A behavior repair requires an observed
assertion/test failure, not command-not-found, a timeout, or model confidence.
Unsupported runner failure formats remain unverified. Documentation grounding may
use observed native read/search evidence; executable tests are not mandatory for
documentation changes.

A missing explicit original production requirement can instead proceed through
ordinary implementation continuation. The author must inspect its current
consumer/entry point with native tools, explain the missing work and its original
task basis, and identify the affected paths. This does not grant preparation write
permissions or relabel an existing behavior defect. The next author turn receives
the full task, current patch, inspected paths, outstanding requirement and actual
checks. Reviewer inventions remain rejected or unresolved.

Implementation continuation and behavior repair share the same two-cycle limit
(`repairs` counts this shared total; `implementationContinuations` is its subset).
A cycle with no file progress stops instead of repeating. Missing/duplicate
dispositions remain explicit unresolved records: other admitted work can proceed,
but the protocol omission prevents successful completion.

After a correcting cycle the author executes consumer/discriminating and
preservation checks after the last edit, and the
same reviewer checks the current patch and test diff. Only commands after the
last observed mutation qualify, even if later edits restore identical bytes.
The reviewer selects short references from the supplied executed-check list and
explains their purposes. Each reference names one existing native event in that
workflow and review; repeated command text never merges events. Unknown, failed,
incomplete and stale selections remain unverified. The host retains the original
review response, the evidence projection, and the resolved bindings separately
(`review-*-original.json`, `review-*-evidence.json`, `review-*-bindings.json`).
Selecting a reference does not execute a command again. This binds
actual execution; it cannot mechanically prove the semantic adequacy of an
arbitrary test. A final disposition review also follows rejected/unverified
findings when no repair is admitted. There is no second reviewer or unbounded
revision loop.

Statuses distinguish `reviewed_delivery`, `incomplete`, `environment_error` and
`cancelled`. `reviewed_delivery` is scoped model review plus observed relevant
checks, never APPROVED/SAFE or universal correctness. Independent pilot grading
uses the original requirements and preserved behavior, not this status. Missing
obligations, unavailable evidence and exhausted repairs remain visible.

## Verification and limitations

```sh
npm run verify:native-task
npm run verify:native-task:fixture
npm run verify:native-task:pilot
```

The first command checks the evidence gates. The installed scripted fixture uses
native OpenCode sessions and checks bounded repair, rejection, real test-fixture
replacement, final mutation, cancellation, incompleteness and a concurrent user
save in the original checkout. Scripted fixtures establish workflow control, not
model quality. The corpus preflight establishes diagnostic task/reference/check
consistency, not improvement. See [implementation/API notes](IMPLEMENTATION.md)
and the [six-task pilot](../../development/native-task-pilot/README.md).

### Development revision

The next development controller distinguishes provenance caveats from unresolved
requirements, and affected source paths from host-approved preparation paths.
One isolated format-only correction is permitted per structured stage. Missing
meaning is not filled with successful defaults. Missing tests/docs can be delivered
without forcing a failing behavior test or unnecessary production repair. The
historical [six-task pilot](../../development/native-task-pilot/RESULTS.md) remains
unchanged and does not measure this revision.
