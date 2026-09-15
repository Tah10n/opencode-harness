# Completed native errors and accurate command observations

This change lets the existing author continue after a confirmed completed native
`glob` error and keeps actual project-command execution visible when the observer
cannot interpret the runner. It adds no author prompts, roles, model passes,
retries, dependencies, or default-enabled experimental components.

## Reproduction and lifecycle

At baseline `c2e6880a0646b1711629514e08520c4bfc9e4e83`, the installed fixture's
real native `glob({pattern:"**/*",path:"src"})` returned `ripgrep execution failed`.
The plugin recorded `tool_error`, requested one abort and delivered no edit.
The fixture creates a project with no `src` directory; that observation belongs
only to this fixture, not to the historical EventEmitter error.

The inspected installed OpenCode binary reports **1.18.26** (SHA-256
`18446e5c1bfe662f058e365fa59128309e41c7777f936de5b2f089ad86532025`). Its embedded code
awaits `glob`'s scoped ripgrep operation. The child-process scope finalizer waits
for process close (or handles failed spawn) before the rejection reaches the
native tool-error handler. `SessionProcessor.failToolCall` then publishes an
error with the original callID/input and start/end timestamps. The before hook
runs before native tool execution. This lifecycle, together with the matching
host admission and unchanged file observations, permits the existing completed
read/grep-error path to cover glob. A timestamp or error string alone does not.

The controller keeps per-call admission, exact admitted arguments, FIFO writers,
and pending/live-operation checks. An error retains its original input and
output. It neither becomes an empty file list nor spends the separate permission
continuation allowance. Missing/contradictory completion, cancellation, denial,
unmatched calls, incompatible execution and external writes still stop the task.
Repeated terminal events cannot reopen a stopped task.

Baseline observer reproduction also executed a real `npm test` whose initial
script was `node --test && node --version`. The native command returned exit 0,
but the original observer produced no check row and said the literal npm test
was not observed. The regression now retains execution and reports the adapter
limitation.

## Command facts and interpretation

`observations.checks` remains a projection of `tool-events.json`. Each relevant
native command now includes execution status, exact command/cwd, callID/event
index, host/native timing where available, exit/signal/timeout, configured timeout
and before/after snapshot references. Missing native signal/timeout information
is `null`, not a claim that neither occurred.

`execution.successful` means a completed native command returned exit 0.
The existing `successful` field retains the stronger adapter evidence contract.
An unsupported runner keeps `tests: null`, `successful: false`, and an explicit
interpretation limitation. Literal obligations are matched by exact command and
cwd; unsupported shell syntax is retained without guessing equivalence. Initial
and observation-time package scripts/hooks and configuration continuity are
reported without pretending to reconstruct intermediate script bytes. Read
permissions still apply; npm configuration contents are never copied into the
report.

For example:

> Project command "npm test" (cwd "."): completed_exit_0; exit 0; current captured
> state. Internal runner results not interpreted by a supported adapter; task
> completeness remains unverified.

The workflow may remain `incomplete`. Execution facts do not certify semantics,
provide a new trusted check, or count as substantive repair progress. A failure
of another command remains unresolved. A mutation followed by a byte-for-byte
revert still requires fresh checks. A completed unchanged glob error preserves
already-current final commands.

## Historical evidence

Offline replay used the unchanged events of QuickLRU/H, Denque/R, Denque/H and
EventEmitter/H from `RECHECKED-RESULTS`. Each now exposes its final `npm test`,
exit 0 and saved current snapshot, with unknown test count and unsupported
interpretation. Historical reports are preserved beside the replay results in
local evidence. This is an observer replay over saved public inputs and events;
it executes no historical project command and changes no Q/T/D grade.

EventEmitter/R's saved glob error has a matching recorded callID, equal before/
after snapshots, native duration 5 ms and host admission-to-record duration 44 ms.
Its archive does not retain a per-process close observation or the complete
pending/live inventory. No such facts were added retroactively. Replaying its
unchanged terminal payload without a live matching before hook remains
`tool_error`; this is separate from the installed lifecycle reproduction.

## Validation entry points

```sh
npm run verify:native-task
NATIVE_TASK_FIXTURE_DIRECT=1 \
NATIVE_TASK_FIXTURE_MODES=glob-error,glob-parallel,glob-compound,glob-compound-failure,glob-after-check \
node scripts/verify-native-task-fixture.mjs
npm run verify:native-task:fixture
node scripts/verify-native-project-feedback.mjs
```

The direct suite includes actual local project commands, 23 command-observation
controls, and glob lifecycle/parallel admission controls. The installed scripted
provider invokes real native tools, receives the actual error, reads again,
edits source and its public test, runs npm test and git diff --check, reaches
normal terminal completion and applies the terminal patch in an ordinary Git
copy. The original fixture checkout and index are checked for preservation;
patch paths contain only the intended source/test changes. The compound script
is tested with both exit 0 and exit 7. Source materialization is exercised by
loading the installed bundle, not by importing source into the provider.

Full aggregate verification remains unavailable on this host:
`PROCESS_CONTAINMENT_UNAVAILABLE` stops `npm run verify` before its first
`verify:v0.4` stage runs. Targeted/installed success is not a complete CI pass.
There are no real Luna/OpenAI calls, new task runs, probes, benchmarks or resumed
historical attempts. These fixes do not establish a model-quality improvement.
