# Executable stateful preconditions: fixed development comparison

The candidate adds one conditional technique to the existing author instruction:
observe the actual state immediately before the intended action, call the real
entry point, and check the result and preserved invariants. Generated assertions
remain hypotheses. No controller, permissions, correction limit, deadline or
command selection changes.

Run `node scripts/verify-native-stateful.mjs` for the local vacuous-test example
and `node scripts/verify-native-stateful-tasks.mjs` for evaluator controls.
The installed path is `NATIVE_TASK_FIXTURE_MODES=stateful node
scripts/verify-native-task-fixture.mjs`. All use real local test processes;
the installed provider is scripted and makes no model-quality claim.

`plan.json` fixes three new tasks and nine P/H0/H1 slots before any model result.
H0 is the author workflow at `1f554ee4fbc705b31bc0f6d4f96b0a92cd6026c7`;
H1 differs only in the initial author instruction. Both use existing OpenCode
1.18.26, Luna/high, three available corrections and one shared 900-second deadline.
P is ordinary OpenCode with the same task, project instructions and tools.
No retry, task replacement, observer message, or second formulation is permitted.

The tasks exercise FIFO batch retry, staged editor cancellation, and invitation
single-use/expiry through their existing consumers. Each has ordinary tests,
a complete reference, independent behavioral checks, three substantive negative
controls and a valid alternative. Full delivery also requires meaningful delivered
project regressions, preserved independent scenarios and documentation; a green
suite or harness status alone does not meet this criterion. Offline sensitivity
checks use separate copies after model termination and never change author patches.

Materialized bytes, exact instruction diff and task/evaluator hashes are retained
with the freeze. Private native events and runtime state stay under ignored local
artifacts. Public results will retain patches, assessments, usage and limitations.
Three development tasks cannot establish durable general superiority.

Historical correction: the earlier statement in
`../native-task-luna-high/completion/README.md` that reconnect H D0→D1 changed only
the test was incorrect: the production condition changed too. This addendum does
not rewrite the historical patches or grades. Reconnect is development context
only and is not a model task in this series.
