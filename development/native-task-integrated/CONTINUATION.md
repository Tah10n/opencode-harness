# Explicit continuation: original slots 11–12

The user authorizes the two previously unstarted independent UFO attempts:
11 = P / repetition 2, then 12 = Hbase / repetition 2. This execution amendment
accepts the still-unknown remote execution of slot 10 after verified local
termination. It does not resume or retry slot 10. Any new external stop closes
this continuation; no subsequent continuation or replacement is authorized.

Original freeze SHA-256:
`7bbd0d7c72f99a06d2a2a5ed4ae429efa261f23b0a7ad2659c44a3ce93891b6a`.
Local explicit amendment SHA-256:
`33752be6536a134db5563a971e422159eccbdeb80dde01e4d5208a2b8dde084c`.
The original pause, ten attempts, report, grades and accounting remain intact.
The new period is `local/native-task-integrated/continuation-11-12`.

The existing integrated entry point delegates amended admission and execution to
`native-task-ab/run-comparison.mjs`, with its original integrated container,
native runner, auth and capture implementations. The shared request lifecycle
matches the original integrated loop. The only launcher additions select this
fixed pair, retain request/response evidence, and admit its separate directory.
There is no new transport, retry, probe, scheduler or general resume switch.

The measured product remains `797ce6f1b75af217e00224d1b38790346dee1d19`.
UFO tree, full TASK.md, synthetic baseline, dependencies, isolated global config,
OpenCode 1.18.26, Luna high, 1800-second task deadline, container limits and
existing OAuth route remain unchanged. P receives native stdin; Hbase uses the
same direct bundle with all optional components disabled. Evaluator tests,
previous patches and results are not mounted into either author session.

Before admission, actual bundle/dependency/input manifests matched, all ten
historical stops and absent containers were verified, and no new-period or
slot 11–12 artifacts existed. Hashes bind the historical captures/accounting.
See `continuation-preparation.json`. Targeted scripted checks cover selection,
preservation, invalid admission, fresh 503 closure, blocked subsequent send,
and rejecting another invocation after either success or pause. Existing
continuation and targeted scheduler regressions also pass. Real probes: zero.
These local checks are not full CI or model quality evidence.

Invocation (from the worktree root):

```sh
node development/native-task-integrated/run.mjs \
  local/native-task-integrated local/native-task-integrated/amendment-11-12.json
```

Evaluation will retain original frozen checks, the separately labelled post-hoc
append compatibility check, manual full-patch assessment, and Q/T/D. Historical
reference/alternative calibration defects stay disclosed. Results and accounting
will be a separate addendum; the old report and first-ten totals are not rewritten.
