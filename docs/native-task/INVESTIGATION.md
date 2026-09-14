# Focused test investigation in direct (experimental)

An optional `harness_investigate` tool lets the main author request one concrete
public-API investigation from a separate session of the same model. The child
works on a copy of the current implementation and delivers a project test patch
or explains why no assertion is justified. The author checks the expectation
against the complete original task, accepts or declines the patch, then finishes
the full implementation, consumers, types, docs and final checks.

With Node 24 and OpenCode 1.18.26, create a new configuration directory, then
prepare the plugin and sensitivity dependencies before launching a task:

```sh
node scripts/profile-materialize.mjs --native --profile core --task \
  --output /absolute/task-config
npm install --prefix /absolute/task-config --ignore-scripts
npm ci --prefix /absolute/task-config/sensitivity --ignore-scripts
```

From the project with its dependencies already installed, run one command with
the original complete request in a file:

```sh
HARNESS_TASK_FILE=/absolute/original-task.txt \
HARNESS_TASK_STRATEGY=direct \
HARNESS_TASK_INVESTIGATION=1 \
HARNESS_TASK_SENSITIVITY=1 \
HARNESS_TASK_TIMEOUT_MS=900000 \
OPENCODE_CONFIG_DIR=/absolute/task-config \
opencode run --agent build --model openai/gpt-5.6-luna --variant high \
  --command harness-task
```

Investigation and sensitivity are independent opt-ins. Without the investigation
flag, the new tool and its instruction are absent. Defaults remain unchanged.
The author decides whether there is a useful question; an unused capability is
an ordinary outcome. No operator supplies a mutation or counterexample. The
request has `action: investigate`, `question`, `location`, and `reason`. The host
adds the unchanged original task, current files, current diff and remaining time.
No long author transcript or evaluator is passed to the child.

The author waits during the child session. Both use the selected model, effort,
project instructions and native permission boundaries. The child cannot delegate
again. It may edit JS/TS project tests; production/config/docs are checked for
preservation, as are installed package bytes, modes and links (ordinary `.cache`
writes remain permitted). Unsupported source layouts are reported explicitly.
The current bounded snapshot copier rejects deleted baseline files, binary files,
symlinked project source, missing read permission and oversized snapshots.

The result includes a test patch, actual command/tool results, prose contract
basis and limitations. Use `action: accept` with the author's contract `rationale`,
or `action: decline`. Acceptance requires the exact captured author snapshot and
successful ordinary Git patch preflight; later user bytes are never overwritten
by an automatic three-way merge. A passing child test is not proof of the expected
value. The original task still determines whether production needs correction.

A maximum of one child may start per task. New delegation requires at least 120
seconds remaining, with no intermediate cutoff after it starts. The existing
whole-task deadline and cancellation apply to every native session and diagnostic
process. Sensitivity shares one 180-second task budget between author and child;
child-local mutation references are obtained freshly rather than copied from the
author session. A child error retains the author's existing patch; real denial,
cancellation and uncertain execution retain the existing terminal behavior.

The retained task artifacts include `before-investigation.patch`,
`investigation-tests.patch`, `investigation-result.json`, child native messages
and tool events, and the final `terminal.patch`. The host records acceptance or
rejection and command facts; it does not certify semantic task completeness.
These artifacts can contain private project content and are not published by
runtime. Development evaluators and calibration answers are excluded from the
installed bundle. [The fixed comparison plan](../../development/native-task-investigation/PLAN.md)
describes the separate P/R/H development experiment. R's internal
`HARNESS_TASK_EXTRA_ATTENTION=1` control adds one general same-session pass and
is not required for the focused investigation path.
