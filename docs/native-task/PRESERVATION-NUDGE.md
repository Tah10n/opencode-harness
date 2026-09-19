# Early preservation advisory (experimental, default off)

`HARNESS_TASK_PRESERVATION_NUDGE=1` adds at most one short advisory to a native
Bash receipt in a direct author session. After a confirmed focused pass of a new
feature test following production changes, it asks the author to choose an
existing public behavioral check. The author selects the check and handles its
real result normally. This is a feedback-order hypothesis, not a demonstrated
model-quality improvement.

Materialize a fresh bundle using the normal `--native --profile core --task`
installation, then enable it for a fresh task:

```sh
HARNESS_TASK_FILE=/absolute/original-task.txt \
HARNESS_TASK_STRATEGY=direct \
HARNESS_TASK_PRESERVATION_NUDGE=1 \
HARNESS_TASK_TIMEOUT_MS=900000 \
OPENCODE_CONFIG_DIR=/absolute/task-config opencode run --command harness-task
```

This command is documentation, not an instruction to start a model experiment.
Values other than `0` and `1`, and enabling it with D or check-first, are rejected
before author work. Omitting the flag is `0`: no advisory module import, extra
project reads, post-tool classification or changed prompt. TYPE_COMPAT, command
hints and the other optional components are independent.

## Exact supported scope

This advisory is separate from the existing trusted command observer. It never
sets `successful`, changes requirements, resolves failures, grants repair authority
or promotes an incomplete workflow. A receipt and an applicable terminal patch
can coexist with `incomplete` when the main observer cannot interpret a route.

The first version recognizes these root-cwd routes only:

* `node --test relative/file.test.js` (also `.mjs`/`.cjs`) under an initial
  `scripts.test: "node --test"`, without lifecycle hooks. The file must contain one
  literal `test(name, ...)`, imported from `node:test`, and exactly one resolvable
  relative production-module import. A full single-case TAP or Node spec report
  must agree with the name, count, exit and completion. Execution scope includes
  that production module; another module's test is not interchangeable.
* `npm test -- --grep 'literal name'`, optionally preceded by
  `. /usr/local/nvm/nvm.sh && nvm use X.Y.Z &&`. Initial `scripts.test` must be
  `mocha --opts relative.opts`, with a single entry file using literal
  `glob.sync("*/index.js", {cwd: "..."})` and `require("./" + file)` registration.
  At most 32 original index runners are inspected. Each selected suite must have
  one literal `describe` and an unambiguous literal `fs.readdirSync` case directory
  associated with a dynamic `it)(dir, ...)` or template beginning with `${dir}`.
  The case name must resolve uniquely to an actual directory in that runner.
  These are bounded source-shape observations, not general JavaScript analysis.
  `pretest` must be `npm run build`; the build shape is a literal `node file`
  followed by one or more `rollup -c [config]` steps joined by `&&`. The unchanged
  recipes, observed lifecycle banners and completed build output precede a full
  named Mocha spec section and its matching nonzero total. No project code is
  imported or executed by the classifier.

Only wholly new files/case directories relative to the captured initial task can
be positive feature origins. Allowed uncommitted user work is part of that
initial state. A changed existing file/case is unknown, even if only one line
changed; this version does not identify modified individual case bodies.
Production change detection supports ordinary JS/TS diff paths outside test and
configuration paths. Quoted/ambiguous diff paths and unsupported layouts skip.

Suppression requires a supported, unchanged original case in each candidate
execution scope on the same captured tree. Partial scope confirmation removes
only that scope from the advisory. Identical short names in different suites do
not combine. Earlier results on a different snapshot are conservatively not used;
a result before a new production edit is never current. No suppression is a
certificate of compatibility or coverage of all consumers.

## Unknown, lifecycle and limits

Unknown means no message: unsupported runner/command/regex filter, nested cwd,
ambiguous sample or import, changed/unavailable configuration, changed existing
case, zero/pending/skipped tests, incomplete/truncated/inconsistent reports,
masked exits, missing admission, source changes during execution or an incomplete
snapshot chain. Raw output is bounded to 128 KiB. Reads reuse the original
observer's permissions, symlink refusal and 2 MiB per-file bound; refusal does
not widen access. Initial configuration reads happen only with the flag enabled.
No baseline suite, discovery command or project-supplied JavaScript runs on the
host.

Eligibility requires an active, admitted, completed Bash call with matching
arguments/callID, production changes, the supported feature pass, a contiguous
retained event chain from the initial snapshot and at least 120 seconds left.
Cancellation, denial, terminal state and the remaining budget are checked again
before attachment. The existing pending ticket stays held during synchronous
classification and attachment; `finally` releases it after advisory errors.
No second scheduler, tool, model request, continuation allowance or repair gate
is introduced. Once attached, later tools cannot produce another advisory.

The 120 seconds in the message is a recommendation for the author's selected
check including its normal build. It is not a new enforced Bash timeout or a
promise to replace another run for free. The existing total task deadline still
limits execution. The author may need additional edits and repeat both checks.
Ignoring the advice creates no extra turn.

An example receipt block:

> Preservation advisory: A focused new-feature check completed: "test: new double".
> After production changes, retained results do not confirm an existing-behavior
> check in this execution scope. Before further snapshot updates, choose and run
> one existing public behavioral check on the current implementation, with its
> normal build preparation. Prefer a check that fits within 120 seconds including
> preparation, and name its actual coverage. This advice does not replace task
> requirements or final checks; feature checks may need repeating after another
> production edit.

`preservation-nudge.json` contains bounded counters, reason counts, timing and
one candidate linked to the original callID/snapshots. `eligible` and
`attached_to_receipt` are distinct. Neither proves model receipt: only a captured
subsequent provider request can establish that. Original outputs, exits and
snapshots remain in the existing `tool-events.json`; the advisory never feeds
back into stdout interpretation.

## Local evidence

[Implementation evidence](../../development/preservation-nudge/REPORT.md) records
the historical offline trigger replay, two fresh public-test copies and actual
OpenCode 1.18.26 Linux scripted-provider integration. The scripted author's
choice and correction are predetermined. They establish the installed mechanism,
real red→green feedback and portable patch, not autonomous model test selection.

```sh
node scripts/verify-native-preservation-nudge.mjs
node scripts/verify-native-preservation-hooks.mjs
node development/preservation-nudge/replay.mjs
python3 development/preservation-nudge/public-check.py
node scripts/run-native-preservation-installed.mjs
```

Replay/public checks require the retained private inputs. Installed checks reuse
the existing prepared local toolchain and Docker image, without network installs.
Historical model usage, patches, evaluation artifacts and frozen slots are unchanged.
