# Explicit native diagnostic review

Requires Node 24 and installed OpenCode; integration checked against **1.18.26**.
This is a product wiring step, not proof of quality lift. Review can miss a defect
or present a mistaken assumption. No automatic repair, plugin or idle trigger.

## Enable and invoke

From the harness checkout, create a new config directory (its parent must exist):

```sh
npm run profile:materialize -- --native --review --profile core --output /absolute/review-config
```

Save the **original user requirement** verbatim in a text file. From the project
to review, launch a **new** ordinary OpenCode session, not `--continue` or `--session`:

```sh
HARNESS_REVIEW_BASE=main \
HARNESS_REVIEW_TASK_FILE=/absolute/original-task.txt \
OPENCODE_CONFIG_DIR=/absolute/review-config opencode
```

Choose your usual model and invoke **`/harness-review` with no arguments**. The base
is an explicit commit/ref, resolved to its exact commit; it is not an implicit
merge-base. Use the intended merge-base SHA yourself when that is your scope.
Omit `HARNESS_REVIEW_TASK_FILE` for code review only; unknown-task completeness
cannot be checked. Put task text in the file, not command arguments: OpenCode
expands shell/file syntax in command arguments. A task file's literal shell syntax
is data in the snapshot, not an executed command.

If using an already-open review configuration, use native `/new` first. The
command selects `harness-reviewer` for this review but does **not** create a new
session or clear history. Running it in an author's existing session is not an
independent context. No default agent, model, variant or authentication is set by
the bundle. Windows users can set the same environment variables in PowerShell
before launching OpenCode.

The explicit command executes a fixed read-only context exporter. It resolves the
installed review agent's project read rules and refuses capture if a changed path
requires ask/deny. It captures the original task, base/HEAD, full tracked changes
and nonignored new files, and binds them with SHA-256. It never stages files or
updates the index. Ignored files are excluded. Oversized input, unmerged/hidden
index state, submodule limits, unavailable permissions or capture races produce
`incomplete`, not a silently truncated full review. The diff limit is 1 MiB.

Every result applies only to that snapshot. Subsequent edits require a new review;
the command does not lock files, watch changes, or automatically invalidate a
message already displayed. The review must disclose source/snapshot discrepancies.

## Checks and permissions

Native source-reading tools remain available under project restrictions. Reviewer
`edit`, `bash`, `task` and todo writes are denied; no wildcard shell allowlist is
copied from the old role. Command expansion is user-invoked native preprocessing,
not a permission-checked agent bash tool: only the fixed read-only exporter is
included. Its conservative project-rule preflight is not a sandbox and cannot
see transient session-only permission overrides. Do not use a session whose
restrictions differ from project configuration for automatic snapshot export.
Existing third-party tools/plugins remain governed by the user's configuration;
this bundle does not establish filesystem isolation or authorize tool workarounds.

No test command runs automatically in the worktree. Where your project already
has a separate diagnostic-copy procedure, run its ordinary checks there and
supply the evidence with its matching snapshot/commit. Otherwise tests are **NOT
RUN**. There is no new sandbox, wrapper, session manager or test runner. A repair
requires a separate explicit request to the main agent.

Output separates defects, missing explicit obligations, assumptions/questions and
unverified areas. No finding quota or APPROVED/SAFE verdict. Empty findings,
provider errors and incomplete output do not certify correctness or completion.
This output discipline is an instruction, not a semantic validator of model text.

## Disable, cost and evidence

Remove `OPENCODE_CONFIG_DIR` (or restore its prior value), or select a separate
bundle materialized without `--review`. The original two-file native mode remains
unchanged. To combine existing settings, merge only the supplied instruction,
agent and command entries without replacing your settings; preserve the helper
at its installed absolute path. Do not move the bundle; rematerialize it.

Installation/debug checks make no model calls. Invoking review uses the selected
provider and can consume tokens, cache budget, time and money, including auxiliary
native requests. Nothing is scheduled automatically.

Unlike the [historical experiment](REVIEW-REPAIR-RESULTS.md), this ships no Docker
transport, credentials handling, frozen research protocol, repair stage or model
binding. It reuses the body of `agents/core-reviewer.md` with a native diagnostic
contract and narrower permissions, leaving historical bytes unchanged.

`verify:native-review`, `verify:native-review:config` and
`verify:native-review:fixture` test materialization, installed config and local
scripted transport/denials. The fixture uses fresh native sessions and verifies
that author history is absent, task/base/new-file diff arrive, denied shell cannot
write, and provider error/empty output produce no synthesized approval. It does
not script findings or measure reviewer quality. **Zero real provider calls.**

Native references: [commands](https://opencode.ai/docs/commands/),
[agents](https://opencode.ai/docs/agents/), [permissions](https://opencode.ai/docs/permissions/).
In 1.18.26, subtask commands resume the parent with “continue with your task”.
This command deliberately uses `subtask: false` in a fresh review session to avoid
that author continuation. It is not a pre-completion hook or idle barrier.
