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
Native permission rejection, cancellation, quota/native errors and uncertain
process completion prevent new workflow stages. A native task permission grants
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

Required checks retain their initial task/project source and every execution result.
The observer binds literal supported task/instruction commands and complete initial
Node package test routes. A targeted projection of an already required complete
package route is diagnostic, not another mandatory rerun. Other recognized targeted
checks have unresolved relevance: their material failures remain limitations.
Unsupported commands and prose scope cannot be classified automatically. This is
not a universal relevance analyzer; the author must justify the selected checks
against the original task, including new behavior and preservation obligations.
A baseline/environment exception requires actual corresponding initial-state evidence.

Previously executed checks are reused only when current after the last observed
mutation, including mutations subsequently reverted to identical bytes. Missing
or failed required/unresolved verification triggers updated factual feedback.
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
actual tool events, observations and each updated feedback message. Adopt the patch
through normal review; the workflow does not apply it to the original checkout.
Do not publish private task/source/tool artifacts automatically.

`checks_passed` means the supported required checks passed on the final snapshot
and no observed required/unresolved failure remains. Diagnostic failures stay in
the observations; they are not reported as passes. It does not certify all task requirements, test equivalence or complete
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
