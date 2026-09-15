# Native launcher lifecycle correction

This is a program regression fix after selector revision 2 was rejected. The
historical result remains **1/6 acceptable selected patches**. Reconnect and
extraction remain unfinished historical attempts; their text, accounting and
selection outcomes are not reinterpreted. Historical source and results remain
available at `aaa44869b03fb4504b05afcf690500908b88c2c5`.

The old research timer awaited the outstanding provider response and immediately
killed the native process. A provider stream could end and deliver text containing
`DECISION` before native emitted `step_finish: stop` and closed normally. Killing
in that interval lost native completion. HTTP completion and decision-shaped text
are insufficient to establish a completed native answer.

The existing launcher now has separate research and hard-deadline timers. The
research callback closes admission and drains existing provider handlers; its
settlement does not kill native. Native can consume the response and finish within
the original overall deadline. The hard timer runs independently of a delayed,
failed or never-settling research callback. Cancellation also stops the process;
a boundary callback failure is retained as a failure, not normal completion.

A planned tool-free final stage can begin only after a normally completed research
phase, verified workload termination, settled boundary work, one session identity,
no emitted decision, remaining time and continuing authorization. A timeout,
AbortError, SIGKILL, parse failure, unknown termination or surviving tool process
cannot authorize continuation or a successful choice. The RESULT contract and
consistency check are unchanged.

Terminal facts are fixed before stop confirmation and journal persistence. The
launcher saves partial JSON events, stderr, the original stop reason, process
exit/signal, termination evidence, native completion time, execution time and
cleanup time. Usage present in native events is retained; absent usage stays
absent. The existing provider metadata reader still retains partial usage and
unknown usage/server completion without substituting zero. Cleanup after the
model deadline does not extend model work or invalidate an already fixed normal
completion. Late callback failures or cancellation cannot rewrite that result.

## Local regression evidence

`node development/native-task-selection/verify-local.mjs` checks seven acceptance
record combinations and eight phase branches, including consistency rejection,
unknown execution, cancellation and interrupted research without continuation.

`node development/native-task-selection/verify-lifecycle.mjs` runs 19 process
cases through real HTTP streams from the existing scripted provider. A small
child process replays native JSON events; it is program evidence, not an installed
native or model-quality claim. Cases cover:

- Provider end, then DECISION text, research boundary, delayed native step finish
  and process close; no second request.
- HTTP completion after the research boundary and normal completion without a
  decision followed by the planned final stage.
- Partial HTTP output at the hard deadline, including retained earlier usage and
  missing final usage; step finish with a process still alive at the deadline.
- Delayed, rejected and never-settling callbacks, including a callback still
  pending after native process close.
- User cancellation, cancellation before process creation and an already expired
  deadline without process creation; late failures and
  cancellation cannot rewrite saved terminal facts.
- Unknown stop verification, an actual surviving tool process that must be killed,
  native AbortError, malformed event output, ordinary execution without a research
  boundary and cleanup that finishes after the model deadline.

The first replay case was also run against the launcher source from `aaa44869`.
Only its spawn seam was adapted to the fixture process, with its original
research-limit/onTimeout interface and synchronous stop verification retained.
It failed as expected: DECISION text was saved, the process received SIGKILL,
no `step_finish: stop` arrived, and the choice remained null. No historical model
output was regraded.

The existing installed container preflight was checked with local scripted
responses using OpenCode 1.18.26:

```sh
node scripts/verify-native-container-preflight.mjs <fresh-output> --selection
NATIVE_SELECTION_DECISION=1 node scripts/verify-native-container-preflight.mjs <fresh-output> --selection
node scripts/verify-native-container-preflight.mjs <ordinary-output-with-existing-freeze>
```

The selection cases retain native scratch writes, real consumer commands,
separate candidate runtime states, immutable inputs, one native session and
verified process termination. The no-decision case uses six scripted requests
and two native phases; the direct-decision case uses five requests and one phase.
The ordinary `/harness-task` preflight passed with eight scripted requests using
the same launcher without a research boundary. These fixtures do not read provider authorization or evaluate Luna.
Raw fixture outputs stay in ignored `local/native-launcher-lifecycle-*` folders.

There are zero real provider calls, zero model task-runs and zero new selections
or candidate generations. No manual Actions, full platform matrix, merge, release
or default change is part of this correction. Automatic required checks remain
enabled; their state is separate from these local results. The unrelated
format-check baseline is untouched.

Selector imports remain confined to the development runner and opt-in fixture
entry. The selector is not wired into the user `/harness-task` path or its default,
so no new switch or mode is needed. Prompts, model/effort, candidate tasks,
evaluator, acceptance rules and historical artifacts are unchanged. The original
product goal remains open; this correction schedules no paid experiment.
