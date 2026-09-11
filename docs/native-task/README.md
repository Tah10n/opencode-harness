# Experimental native task workflow D

`/harness-task` delivers a patch in a separate Git worktree using one native
OpenCode author session. After initial completion it observes project checks and
changes to existing tests/fixtures. A concrete reason can return the task and
updated factual feedback to the same author up to three times within one deadline.
A checked initial patch needs no additional model stage merely because a test changed. This revision is experimental;
its development results do not establish a recommended production mode.

## Install and use

```sh
node scripts/profile-materialize.mjs --native --profile core --task \
  --output /absolute/task-config

HARNESS_TASK_FILE=/absolute/original-task.txt \
HARNESS_TASK_TIMEOUT_MS=900000 \
OPENCODE_CONFIG_DIR=/absolute/task-config opencode
```

Invoke `/harness-task` without arguments in a fresh session, or use
`opencode run --command harness-task` with the same environment. Select the normal
model and variant; the reusable harness fixes neither. Add `--review` during
materialization to retain the independent diagnostic `/harness-review` command.
The ordinary OpenCode default is unchanged.

The total timeout includes native bootstrap, author work, checks, the bounded
corrections and summary. Its default is 600000 ms, supported range 1000–3600000 ms.
User permission rejection, repeated policy denial, cancellation, quota/native errors
and uncertain process completion prevent new workflow stages. One confirmed native
bash permission denial before execution may return to the same author normally,
with unchanged permissions and deadline (see below). A native task permission grants
entry; the author cannot recursively delegate or start another harness workflow.

## Factual feedback and scope

The host retains native tool commands, outputs, exits and before/after snapshots.
It recognizes Node project test routes from initial package scripts, including
bounded targeted runs of existing test files under an initial automatic discovery
route. A positive test count and successful exit are required. Required literal
`git diff --check` from the original task is tracked as an additional whitespace
check; it cannot replace tests. Echo, Git status and prose are not test evidence.
Other runners, shell compound commands and unavailable execution remain explicitly
unverified. The host does not execute arbitrary strings from model reports.

Required checks come from supported literal commands in the original task or
project instructions, with their original source and working directory retained.
Initial package scripts establish which Node routes can be observed; running a
route does not create a new obligation. All supported executions remain in history.
An extra passing command becoming stale does not require another author reply when
the actual required check is current. Two explicitly required forms remain separate;
concurrency, test filters, environment and file selection are not erased from identity.
Environment-prefixed commands remain unsupported evidence and cannot be satisfied
by a plain command. Unsupported runners and prose scope remain unverified.

Additional failures remain visible independently of whether the command is required.
A later different command passing does not resolve them. An actual later pass of
the same route resolves the earlier failure, without making that route mandatory
forever. Repeated failures stay in history but do not multiply the same correction
reason. Diagnostic execution errors remain limitations; substantive test failures
can still request correction. Classification never depends on whether a check passed.
A baseline/environment exception requires actual corresponding initial-state evidence.

Required checks must be current after the last observed mutation, including edits
subsequently reverted to identical bytes. Missing or failed required verification,
unresolved additional test failures or lack of any current successful project check
trigger updated factual feedback.
Up to three corrective replies reuse the same session, directory, edits and tool
history. Two consecutive replies with the same check problem and no new substantive
check evidence stop for lack of progress; comments, changed hashes and rephrased
completion claims alone do not count. Exhausting the bound is not completion.

Original test/fixture bytes, including the user's uncommitted input, are retained.
Feedback includes exact changed hunks with old/new context and newly added tests.
Changed tests carry a coverage warning, including additions that skip an old
branch; the warning alone never schedules another correction. Renames and intentional expectation changes are not
mechanically classified as lost coverage. The author must distinguish those from
separate scenarios that still belong in the delivered suite. No original tests
are automatically restored over any checkout.

There is no mandatory reviewer, reproduction/disposition report, command-ID
selection or JSON repair. Ordinary author prose is retained as explanation, not
as a fabricated execution receipt or proof of semantic equivalence.

## Delivery and evidence

The workflow captures the original task and nonignored patch under native author
read rules, creates a detached worktree at the captured base, and seeds those
bytes. The original index and working files remain untouched. Dependencies and
other ignored files are not copied; setup remains governed by the existing
project environment and permissions. A worktree is not a replacement sandbox.
Evaluation executes candidate code only in the existing isolated containers.

The returned delivery worktree and private artifacts live under the original Git
administrative directory at `harness-task/<run-id>/`. Retained artifacts include
original input, initial test bytes, D0, D1–D3 when reached, final and terminal patches,
actual tool events, observations and each updated feedback message. Terminal patches
are saved only after native prompt/tool termination is confirmed. An unacknowledged
abort or an active/pending tool keeps termination unverified and withholds that patch;
the worktree is retained. Adopt the patch
through normal review; the workflow does not apply it to the original checkout.
Do not publish private task/source/tool artifacts automatically.

`checks_passed` means the supported required checks passed on the final snapshot
and no observed required/unresolved failure remains. Diagnostic failures stay in
the observations and limitations; they are not reported as passes. It does not certify all task requirements, test equivalence or complete
delivery. `incomplete` and `cancelled` preserve the patch and limitations. The
independent evaluator separately assesses working behavior, necessary delivered
coverage and regressions.

The earlier C revision remains reproducible at
`66b7b33fc6bd66201ee24ec84d6e6fcae9daaf28`; its A/B/C results, earlier 20 pairs and
stopped incomplete-quota series are historical and unchanged. See
[the D development plan](../../development/native-task-ad/plan.json) and
[all eight D/A development outcomes](../../development/native-task-ad/results/README.md).
Both arms delivered 2/4 complete patches under the scoped external assessment;
the candidate showed no complete-delivery gain and remains experimental.

The subsequent [four attempted P/H continuations](../../development/native-task-ph/results/README.md)
have an invalid-input preparation incident and cannot establish the requested
D-final continuation result or any benefit of the added correction bound.

After separate authorization, the [four corrected-input P/H continuations](../../development/native-task-ph-corrected/results/README.md)
ran from the actual saved D-final patches. Neither arm delivered a fully acceptable
patch on either selected task. Two H corrections made no substantive delivery
progress; the added bound has no demonstrated benefit and remains experimental.

OpenCode 1.18.26 may continue the ordinary author session after one automatic
`PermissionDeniedError` from native bash preflight. The matching tool call must
have reached the host before hook but not `shell.env`, which follows native
permission checks and precedes process spawn. The captured worktree must still
match its expected state, with no other pending/live tool, cancellation, user
reject or terminal cause. The host does not infer a denied path or a winning rule:
external workdir and external command arguments receive the same treatment.

The original tool error and arguments remain unchanged. The author receives a
reminder through the ordinary system hook: the operation was forbidden and not
executed, permissions are unchanged, and accessing the same forbidden resource
through another path or tool is not permitted. Only independent allowed work may
continue. The host neither replays nor rewrites the command and creates no extra
session, recovery prompt or correction pass. A necessary forbidden resource
remains an unmet requirement; the reminder does not authorize a substitute.

`permission-continuations.json` and the result's `permissionContinuations` record
the allowed continuation separately, including the next completed tool call when
one exists. The original event stays `error` with preflight nonexecution evidence;
it is neither a test pass nor repair evidence. It does not invalidate unchanged
state or become a permanent test failure. Actual failures, missing checks and
delivery uncertainty remain. Duplicate events for one call do not spend another
allowance. Another denial, an explicit reject (including a nearby reject event),
cancellation, unknown execution state or an external edit prevents continuation.

A fatal native permission denial records its primary `permission_denied` cause
before requesting native session cancellation. It stops further author/correction
requests and the parent's model summary request. Cancellation is idempotent, including
a session created concurrently with cancellation. Late events cannot rewrite the
sealed terminal result. A denial remains `incomplete`, not an ordinary user
cancellation; local cancellation does not establish the server usage of an already
submitted provider request. Native permissions and the delivery worktree boundary
are unchanged.
