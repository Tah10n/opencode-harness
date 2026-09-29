# Native usage

The materializer in the [quick start](../README.md) is the only supported install
path. Existing global settings remain unchanged. Use a new output directory for
upgrades; inspect and deliberately switch `OPENCODE_CONFIG_DIR` afterward.
`--native --profile core` remains accepted; legacy core/deep/assurance/lab
materializations and quality/feedback package exports are retired.

## Task delivery (experimental)

Install with `--task`, install its pinned dependencies, and set:

```sh
export OPENCODE_CONFIG_DIR=/absolute/path/to/harness-task
export HARNESS_TASK_FILE=/absolute/path/to/task.txt
export HARNESS_TASK_TIMEOUT_MS=900000
opencode --model PROVIDER/MODEL
```

Invoke `/harness-task` with no arguments. The workflow inherits the selected
native model and variant. `HARNESS_TASK_STRATEGY=direct` selects the measured
single-author direct strategy; the existing default remains unchanged. A run
uses an isolated worktree and captures its result under `.git/harness-task/`.
Read the returned result/patch location; incomplete execution or unknown provider
completion is not success. Patch delivery does not apply changes to your checkout.
The deadline and native cancellation are execution controls, not a host sandbox
against arbitrary hostile code. Respect native OpenCode permissions.

Additional diagnostics require `HARNESS_TASK_STRATEGY=direct` and remain explicit opt-ins: `HARNESS_TASK_CONTEXT=1`,
`HARNESS_TASK_CHECKS=1`, `HARNESS_TASK_SENSITIVITY=1`,
`HARNESS_TASK_INVESTIGATION=1`, `HARNESS_TASK_TYPE_COMPAT=1`,
`HARNESS_TASK_COMMAND_HINTS=1`, `HARNESS_TASK_EXTRA_ATTENTION=1` and
`HARNESS_TASK_PRESERVATION_NUDGE=1`. Their defaults are unchanged.
Sensitivity requires `npm ci --ignore-scripts --prefix "$OPENCODE_CONFIG_DIR/sensitivity"`.
Type compatibility requires `HARNESS_TASK_TYPE_COMPAT_COMPILER` to point to the
installed TypeScript 6.0.3 compiler,
`HARNESS_TASK_TYPE_COMPAT_PROFILE=returned-callable-strict-v1`, and an absolute
`HARNESS_TASK_TYPE_COMPAT_NODE` path to Node 24. Generated expectations are diagnostic
hypotheses and never trusted automatically as task acceptance.

## Diagnostic review (experimental)

Install with `--review`, set `HARNESS_REVIEW_BASE` to a Git commit/ref and
`HARNESS_REVIEW_TASK_FILE` to an absolute task file, then invoke
`/harness-review` in a new session. It captures a bounded snapshot of the explicit
base, index/worktree diff and task under read permissions. Edits, bash, task and
todo writes are denied. Incomplete capture remains unverified; review does not
repair or approve a PR.

## Boundaries

No installation or ordinary verification calls a paid provider. User-triggered
native task/review commands use the user's selected model and can consume quota.
Provider credentials are managed by OpenCode. The benchmark collector is
separate, private, opt-in infrastructure and is never installed into the native
bundle. Detailed retained checks are listed in [status](STATUS.md).
