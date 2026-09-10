# Native task D validation

Required local checks for this revision:

```sh
node scripts/verify-native-template.mjs
node scripts/verify-native-review.mjs
node scripts/verify-native-task.mjs
node scripts/verify-native-task-fixture.mjs
node development/native-task-ad/replay-reconnect.mjs
node scripts/verify-native-container-preflight.mjs local/native-task-ad/container-preflight
```

The direct D regression uses real temporary Git repositories, test files and Node
processes. It covers initial route provenance, unrelated smoke rejection, standard
Node filenames, pure-addition coverage changes, stale/reverted/unknown states,
permission/cancellation boundaries and final snapshot mismatch.

The installed fixture exercises correct D0 without correction, real failed check
and one repair, coverage loss with a green suite, intentional expectation change,
equivalent move, missing final check, repeated failure, stale corrective output,
actual native permission denial, cancellation/deadline child process termination,
staged/unstaged user bytes, concurrent original saves and external delivery edits.
The same provider also exercises the evaluation container path without OpenAI.

Retained B/C reconnect replay distinguishes removal of the obsolete 401 rejection
from replacement of the separate disconnected-source scenario. It asserts that
both diffs reach feedback. Historical patches and outcomes remain unchanged.

One independent read-only review found route provenance, pure-addition coverage,
Node filename and final snapshot binding gaps. The bounded remediation adds
regressions for all four. The final executed check results are recorded with the
D development artifacts; this document describes coverage, not a synthetic pass.

Scripted providers establish mechanism and containment only. Model effectiveness
requires the eight fixed A/D development outcomes, with D0/final patches graded
separately using the unchanged external evaluator. Four reused tasks cannot
establish general lift. No further series is automatically authorized.
