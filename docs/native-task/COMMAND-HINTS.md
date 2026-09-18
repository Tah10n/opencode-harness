# Optional command hints

Set `HARNESS_TASK_COMMAND_HINTS=1` when launching the existing `/harness-task`
workflow to offer one short project-command hint after a confirmed missing
package manager. The default is `0`; any other value is rejected. This flag adds
no tool, prompt instruction, model request, author pass or automatic repair. It
works independently of CONTEXT, CHECKS, SENSITIVITY, INVESTIGATION and
EXTRA_ATTENTION. Their defaults and the selected strategy remain unchanged.

The author receives the original Bash failure followed by host-derived context
in the same tool result. The author decides whether to use it. A suggested
command still passes normal native permissions. The original command remains a
failure: a hint cannot satisfy a required command, erase stale evidence or
certify task correctness.

## Supported commands and evidence

The initial forms are `npm test`, `npm run SCRIPT`, `pnpm test`, `pnpm lint`,
`pnpm typecheck`, `pnpm check`, `pnpm build` and `pnpm run SCRIPT`. SCRIPT is a
simple alphanumeric/colon/underscore/hyphen name. Optional arguments must follow
an explicit ` -- ` separator and use only simple literal characters. For example,
`pnpm run test -- --reporter=dot` preserves its original arguments.

There is no general shell parser. Quoting, assignments, manager options before
the script, chains, redirections, substitutions, `npm exec` and `npx` are outside
this version. It does not change managers or recommend registry resolution.

The trigger requires matching admitted Bash arguments and cwd, an actual
completed native tool result, exit 127, and the exact English diagnostic from
`/bin/bash` or `/usr/bin/bash` naming the initial manager on its first line.
Before native execution, bounded permitted PATH-entry observations must show
that the manager is absent; those observations must still hold at completion.
A PATH entry, including a dangling manager symlink, suppresses the hint rather
than guessing whether that executable produced the error. Shell startup hooks
or inherited Bash functions also suppress it. Other shells/locales are unsupported.
Denied, interrupted, cancelled, timed-out or otherwise uncertain calls emit no
hint. A normal assertion/lint/type failure and a nested missing executable are
not environment triggers.

## What a route establishes

Resolution reads the nearest applicable `package.json`, its declared script and
`packageManager`, then ordered local/ancestor dependency layers bounded by the
original repository. Ignored `node_modules` is inspected through bounded exact
paths, never through a recursive glob. A cache-only directory proves nothing.
A nearer incomplete or mismatched installation is not replaced by a parent.

An executable must be a regular executable file, match its package's `bin`
metadata, and have a readable permitted symlink target. A manager version must
match the declared `packageManager` exactly when present. Metadata version is
reported explicitly as metadata, not as the result of `--version`. A found path
only establishes a candidate route; the executable and script have not run and
the remaining suite may still fail.

The normal route invokes the same installed manager and original argv at the
original cwd. There is one narrow partial alternative: for an ancestor-only
pnpm, a requested script starting with `pnpm lint`, `pnpm run lint` or
`npm run lint`, and a declared lint script starting with `eslint .`, a verified
local/ancestor ESLint may be offered as `eslint .`. The hint labels this
`partial-lint`: lifecycle hooks and remaining script commands are skipped; it
does not restore `pnpm test` or certify tests. This avoids treating a parent
pnpm path as proof that its nested scripts can resolve bare pnpm. No PATH or
project configuration is changed.

Read and external-directory permission rules apply to path observations,
including intermediate symlinks and targets. The opt-in grants no additional
access. Restrictive rules that prevent PATH absence confirmation mean no hint;
a confirmed error followed by denied dependency metadata yields an unavailable
context without exposing that resource. No home/cache/global package directory
is enumerated. Existing PATH entries are checked only for the named command;
a final PATH symlink is not followed into a global package merely to disprove
absence.

## Bounds and evidence separation

There is at most one hint and one post-failure dependency resolution per
workflow. Workflow-wide bounds are 512 path probes, 64 KiB of metadata bytes,
16 KiB per metadata file, 12 dependency layers, 16 PATH entries and 2,400 output
bytes. Each observation phase has a cooperative 75 ms limit inside the existing
task deadline. Filesystem system calls are synchronous and are not preempted.
No deadline is extended. Per-workflow cost records count path probes, metadata
reads/bytes, local observation time and executions (always zero).

Freshness checks compare relevant paths, symlinks, inode/mode/timestamps and
metadata bytes immediately before emission. They include ignored dependencies;
tracked Git state alone is insufficient. Changes or exhausted bounds suppress a
route or produce an explicit unavailable result. There is no cross-task cache.

The plugin saves unmodified output and exit to `tool-events.json` before
appending context. The separate `command-hint.json` is not read by trusted check
recognition. Disabled workflows never import the resolver, observe PATH/package
files for it, execute anything for it or append a block.

## Verification

Run `npm run verify:native-command-hints` for model-free controls. The
[installed fixture and evidence](../../development/native-command-hints/README.md)
exercise OpenCode 1.18.26 with a local scripted provider and real project checks.
Scripted receipt/use demonstrates this mechanism, not a Luna quality improvement.
