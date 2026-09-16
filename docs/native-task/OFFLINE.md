# Explicit offline task configuration

For a task fully specified by available source and local materials, select the
[build override](../../development/native-task-offline/build.json) before creating
a session. It removes native `webfetch` from the parent and author tool inventories
without changing the task runtime, normal core defaults, or error handling.
The installed scope is OpenCode **1.18.26**, native `build`, direct task workflow.

Offline means task tools have no external network access. Model communication is
separate. The regression below uses only a local scripted provider. Keep the
existing OS network isolation: denying webfetch is not a general egress firewall
for Bash, plugins, MCP or other tools. Do not use this mode for tasks requiring
current external information or unavailable documentation; obtain the materials
first or select a suitable environment without silently reducing the task.

## Prepare and launch

Use the existing materializer to create a new, separate configuration directory:

```sh
node scripts/profile-materialize.mjs --native --profile core --task \
  --output /absolute/offline-task-config
```

Prepare dependencies through the already authorized installation procedure. The
reproduction below reuses existing dependencies and never downloads packages.
Keep the project's normal config and model/variant selection. Do not copy this
override into a global or project config, or change the materialized core prompt.

Run the following inside the already network-isolated execution environment.
It is a per-process environment, inside a subshell. Set the absolute
paths first. It deliberately refuses an existing inline override instead of
silently discarding model, effort or permission settings in it. Existing file
configuration is merged by OpenCode. This recipe supports only a **fresh build
session**: no `--session`, `--continue`, attach, session permission overrides,
agent switching, or configuration changes during the run.

```sh
(
  if test "${OPENCODE_CONFIG_CONTENT+x}" = x; then
    echo 'Existing OPENCODE_CONFIG_CONTENT: unsupported combination; stop preparation.' >&2
    exit 1
  fi
  export OPENCODE_CONFIG_DIR=/absolute/offline-task-config
  offline_override=$(cat /absolute/opencode-harness/development/native-task-offline/build.json) || exit 1
  export OPENCODE_CONFIG_CONTENT="$offline_override"
  export HARNESS_TASK_FILE=/absolute/original-task.txt
  export HARNESS_TASK_STRATEGY=direct
  export HARNESS_TASK_TYPE_COMPAT=0 HARNESS_TASK_COMMAND_HINTS=0
  export HARNESS_TASK_CONTEXT=0 HARNESS_TASK_CHECKS=0
  export HARNESS_TASK_SENSITIVITY=0 HARNESS_TASK_INVESTIGATION=0
  export HARNESS_TASK_EXTRA_ATTENTION=0

  # Resolve the selected agent before author work. Keep this output local:
  # it can contain project-specific configuration.
  opencode debug agent build > "$OPENCODE_CONFIG_DIR/offline-agent.json" || exit 1
  node --input-type=module - "$OPENCODE_CONFIG_DIR/offline-agent.json" <<'JS'
import fs from 'node:fs';
import assert from 'node:assert/strict';
const agent = JSON.parse(fs.readFileSync(process.argv[2]));
const rule = agent.permission.filter(p => ['*', 'webfetch'].includes(p.permission)).at(-1);
assert.equal(rule?.pattern, '*', 'Unsupported webfetch permission precedence');
assert.equal(rule?.action, 'deny', 'Offline preparation did not disable webfetch');
for (const name of ['read', 'edit', 'bash', 'glob', 'grep'])
  assert.equal(agent.tools[name], true, `Required native tool unavailable: ${name}`);
JS
  test "$?" = 0 || exit 1
  opencode run --agent build --command harness-task
)
```

This command can communicate with the configured model; **it was not used with a
real model in this validation**. Apply your existing model authorization and
network policy. To reproduce this stage with zero research-provider calls, use
the installed scripted command below instead.

The override sets only `permission.webfetch` and
`agent.build.permission.webfetch` to `deny`. Native agent rules can otherwise
re-enable the tool after a general deny. Model, effort, prompts, plugins, commands,
and other permission entries are not replaced. Applying the same override again
is idempotent; leaving the subshell leaves ordinary sessions unchanged.

Native session rules have higher precedence. API users must create a new parent
with no custom permission rules and verify the returned `permission` is empty
before sending `/harness-task`. Reject resumed/child sessions and custom session
permissions before author work. The installed regression exercises this rejection
and inspects the actual child, which adds only the runtime's existing recursive
`harness_task`/`task` denials. This recipe does not cover arbitrary custom agents,
custom session permissions, later config mutation, or network-enabled plugins.

## Reproduce the installed check

From the native-task worktree with its existing sibling toolchain and prepared
`local/native-task-integrated/plain-dependencies`:

```sh
node scripts/run-native-task-offline-installed.mjs
```

The runner pins the existing Linux image and OpenCode binary, mounts source
read-only, and uses `--network none` with loopback provider/HTTP controls. It runs
offline then ordinary, followed by independent offline/ordinary configurations
concurrently. Every author request is checked, including requests after tool
results. The ordinary author performs a real successful loopback webfetch.
Both paths read source, edit implementation/tests, run `npm test` and
`git diff --check`, finish normally, and apply the unchanged patch in an ordinary
clone. It checks bytes, modes, terminal tool state, zero aborts, and unchanged
original checkout/index.

Safe inventories, request hashes, permissions and results are published in the
[report](../../development/native-task-offline/REPORT.md). Full fixture requests
stay under ignored `local/native-task-offline-integration/`; no authorization
headers or personal configuration are recorded. No request schema is filtered
or rewritten. No missing-tool call is forced and no recovery branch is added.

The [webfetch lifecycle limitation](../../development/native-webfetch-lifecycle/REPORT.md)
still applies to ordinary mode. This stage neither repairs historical attempts
nor establishes model-quality improvement.
