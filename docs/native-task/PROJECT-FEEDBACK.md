# Computed project context and early checks (experimental)

A and B are independently enabled additions to the one-author `direct` task
workflow. A adds compiler-derived context to ordinary source reads. B selects
and executes an existing project check through native Bash while the author can
still fix the code. Neither creates a reviewer, selector, repair phase or extra
deadline. Quality improvement is **unproven** pending the
[factorial development comparison](../../development/native-task-ab/PLAN.md).

## Install and run

Use Node 24 and OpenCode 1.18.26. Materialize into a new directory and install its
fixed runtime dependencies; the target project does not need harness imports.

```sh
node scripts/profile-materialize.mjs --profile core --native --task --output /absolute/path/to/task-profile
npm --prefix /absolute/path/to/task-profile install --ignore-scripts
```

From the target Git project, with the complete task in an ordinary text file:

```sh
OPENCODE_CONFIG_DIR=/absolute/path/to/task-profile \
HARNESS_TASK_FILE=/absolute/path/to/task.txt \
HARNESS_TASK_STRATEGY=direct \
HARNESS_TASK_CONTEXT=1 \
HARNESS_TASK_CHECKS=1 \
HARNESS_TASK_TIMEOUT_MS=900000 \
opencode run --agent build --model openai/gpt-5.6-luna --variant high --command harness-task
```

Set either flag to `0` to disable that component. Both default to `0`. All four
settings share the same direct instructions and runtime. A disabled component
does not scan, execute checks, emit results or create artifacts. B alone does not
load the compiler or emit A's report. Ordinary `--native` remains a two-file
instruction/config installation. Existing project tools remain available.

The author receives the interfaces automatically; no manual stage-to-stage
copying is needed. Output includes the retained delivery worktree and patch.
The original checkout is protected by the existing native task workflow.

## A: source relationships during ordinary investigation

A source `read` supplies its file path; `grep` with a literal identifier supplies
a symbol query. A returns definitions, public exports/re-exports, resolved static
imports, symbol references, reverse import chains, package-declared entry points,
reachable project tests, package scripts and explicit limitations. Each relation
includes its discovery method and a source location or package field. Read a
related file to expand that part of the graph. Textual/dynamic matches are not
presented as resolved call-graph edges.

The pinned TypeScript 6.0.3 compiler sees a permission-filtered Git file inventory.
It never follows a project import outside that snapshot. Scope is JS/TS source,
one root tsconfig/jsconfig, static ESM imports and compiler symbols. A does not
combine nested tsconfigs/project references or load node_modules configuration.
Unresolved configuration is reported. CommonJS require, dynamic imports,
reflection, registration, generated and ignored code can hide consumers.
Relations say where to investigate, not which files must change.

Bounds: 1,500 source/config files, 512 KiB per file, 8 MiB combined bytes, reverse
depth 6, first 8 items per section, compact reply target 12,000 characters.
Omissions and truncation are explicit. This is not a universal parser, complete
call graph or assertion-coverage proof. Parsing is cached per file; changed
sources are reparsed. Known artifacts become stale on a changed native snapshot
and are refreshed when queried again. `component-context.json` retains the query,
source state and result; the author also gets that result in its current tool
reply. This is task-local context, not cross-task memory.

## B: executable feedback through native Bash

With B enabled, the author may issue:

```text
harness-check src/module.ts
harness-check tests/module.test.mjs
harness-check packages/client typecheck
```

Use workdir `.` and project-relative paths. The optional kind is `test` (default),
`typecheck`, `check`, `lint` or `build`. B finds the nearest readable package.json,
reports the script/field and other available scripts, and runs that declared
script through npm, pnpm or yarn. It narrows only a plain `node --test` script
without lifecycle hooks when the supplied path is itself a project test file.
All other runners retain their declared script exactly; B does not guess runner
arguments, discover a universal relevant-test set or parse arbitrary prose into
executable commands. Explicit project commands remain runnable via normal Bash.

The before hook replaces the shorthand with the disclosed actual command and
workdir **before native Bash checks its permissions and starts the process**.
The normal cancellation, shared task deadline and terminal tool evidence apply.
B starts no detached process. Its result contains the command, basis, exit,
bounded diagnostics, elapsed time and execution limitations in the same session.
A zero exit is reported as passed even when test names contain diagnostic words.
Timeout recognition uses the native tool's appended timeout footer separately
from captured command output; a test named `timeout` is not timeout evidence.
For unsuccessful commands, missing-command/module diagnostic text is an
environment-or-resolution hint, not proof of a product regression. Unrecognized
failures retain their exit and diagnostics. No command failure is silently retried.

An explicit repeated request on unchanged observed files may return a labelled
historical result instead of executing again. This is not a fresh environment
check: dependency/runtime state outside tracked source can change. Use the
disclosed ordinary command when a fresh check is needed. Narrow success does not
close an explicitly required broad check. A successful command does not prove
task completeness, changed-branch coverage or sound assertions. Compare baseline
and current states explicitly when needed; intentional contract changes may
legitimately invalidate old expectations. B does not receive an evaluator or
reference patch.

## Evidence and accounting

`component-events.json`, `component-context.json`, `component-checks.json` and the
existing native tool events expose source snapshots, command results and cost.
A records discovery/parse timing and bytes; B records execution timing. Shared
native snapshots, installation, dependency preparation and prompt/tool tokens
also cost resources. Execution, receipt by the model, subsequent use and quality
improvement are distinct claims.

Run `npm run verify:native-project-feedback` for compiler and real-command checks.
The installed scripted fixture uses `NATIVE_TASK_FIXTURE_MODES=components` and
`NATIVE_TASK_FIXTURE_COMPONENTS=00`, `10`, `01` or `11`; it proves result delivery,
failure/repair and subsequent native calls with zero real model requests. These
are implementation checks, not Luna quality measurements.
