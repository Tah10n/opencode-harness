# Test sensitivity in direct (experimental, off by default)

After a behavior change and a passing suite, `harness_sense` shows a small set of
standard code changes that the same tests still accept or reject. A surviving
change is a question about a required observable property, not a bug verdict.
Use it while writing ordinary project regressions in the native author session.
The final patch must still contain the implementation, tests, types and docs.

Install the native task profile as usual, then explicitly prepare its separate,
locked engine **before** starting an author session:

```sh
node scripts/profile-materialize.mjs --native --task --profile core --output /absolute/new/profile
npm ci --prefix /absolute/new/profile/sensitivity --ignore-scripts --no-audit --no-fund
```

The engine is `@stryker-mutator/instrumenter@10.0.0`, with a committed dependency
lock. It is not added to the target project's dependencies or lockfile. The
runtime never runs an installer. Enable with `HARNESS_TASK_STRATEGY=direct` and
`HARNESS_TASK_SENSITIVITY=1`; A/B may both remain `0`. Without this flag the
tool and its instruction are inactive, and the user's default is unchanged.

In the author session, select the native **harness_sense** tool. Its description
and `path` / `check` schema appear in the actual tool list only when enabled.
For a changed production file, pass:

```json
{"path": "src/value.ts", "check": "npm test"}
```

`path` defaults to `changed`. Omitted `check`, `test`, `npm test`, and
`npm run test` select the existing `npm run test` script. `test:unit` and
`npm run test:unit` select an existing `test:unit` script. Execution stays with
npm, including applicable pre/post lifecycle hooks. Original arguments and the
normalized command are recorded separately. Flags, extra arguments, shell
chains, substitutions and redirections are rejected with an example and the
available test scripts; the response reports `engineExecuted=false`, zero checks
and actual elapsed time. Correct the next tool call normally in the same session.

The existing explicit local Node (`node --test`), AVA, Mocha and Vitest check
forms remain supported; runner arguments must be readable relative test files.
Prefer a declared `test:*` script for flags or a separate runtime suite.
The native tool uses the task's read and Bash rules, checks both the selected
npm command and lifecycle bodies, and asks through the native permission API.
It copies only admitted files/dependencies into its own temporary directories;
a denied command or unreadable snapshot never becomes diagnostic permission.
Task tools serialize around it, and cancellation reaches diagnostic process
groups before terminal capture. It has no standalone CLI: `command -v` is not
a discovery mechanism, and invoking the runner file cannot start project checks.

First scope: small single-package npm JS/TS projects with already installed,
locally runnable tests. It handles a normal file path or `changed`, mutating only
changed production lines plus one adjacent line. No mutation of tests or `.d.ts`
files, no repository-wide default. At most four files/120 selected lines, eight
deterministically selected variants per call, 180 seconds total diagnostics per
task inside the normal task deadline. Each command is capped at 30 seconds and
generation at 15 seconds; partial results retain untested variants. Copying and
generation consume this same budget.

The snapshot includes readable tracked/untracked text files, excluding ignored
files. Installed dependencies are copied afresh for every test command, including
the original repository's ancestor dependencies used by nested native task
worktrees. Symlinks outside that dependency tree, unreadable/binary/oversized
source data, workspaces and other package managers are unsupported. Source
capture is bounded to 1,500 files/8 MiB, dependencies to 80,000 entries/300 MiB.
Dependency applicability uses captured file size/mtime metadata, not a claim of
an immutable global environment. Test commands requiring omitted ignored data,
external services or generated build state may need an ordinary project check.

Production, tests and configuration in the author worktree are not mutated by
the diagnostic adapter. Every variant starts from the same source snapshot and
fresh copied dependencies in a temporary diagnostic directory. Standard Stryker
operators are generated through the package's exported `Instrumenter` API; its
zero-based locations and replacements are applied only to that diagnostic copy.
There are no custom task-specific mutators. The adapter runs the unchanged test
command on the ordinary baseline first, then each selected variant. It does not
ship instrumented code, special environment markers or external test assertions.

Results distinguish a nonpassing baseline, accepted/rejected variant, environment
or engine failure, timeout, partial execution and unsupported scope. The command
adapter observes exit codes: nonzero means **rejected by the command; inspect the
cause**. Import/build/lint errors do not become evidence of a behavioral assertion.
No mutation score or task-completeness verdict is produced. A valid equivalent
variant or unspecified error-message change may survive even excellent tests.

Inspect the concrete diff against the original task and public contract. If its
changed property is required, add a regression through the ordinary public API,
confirm the correct implementation still passes, and rerun `harness_sense`.
Never test source text, mutation names, tool paths or administrative environment
state. For equivalent/allowed changes, explain why no new requirement follows.
Do not change production code to satisfy an invented assertion.

No incremental result cache is used: changed tests are really rerun. Each result
has a snapshot identity; later author edits mark older observations stale in
`sensitivity-events.json`. Cancellation stops diagnostic process groups; missing
or unverified diagnostic termination stops the workflow's normal success path.
Standard operators and eight local variants cannot cover every identity,
state-transition or TTL requirement. Invocation without a useful observation,
and availability without author use, are legitimate measured outcomes.

Upstream references checked for this implementation:
[configuration](https://stryker-mutator.io/docs/stryker-js/configuration/),
[standard mutators](https://stryker-mutator.io/docs/mutation-testing-elements/supported-mutators/),
[incremental limitations](https://stryker-mutator.io/docs/stryker-js/incremental/),
[equivalent mutants](https://stryker-mutator.io/docs/mutation-testing-elements/equivalent-mutants/),
and the pinned package's exported Instrumenter/Mutant declarations. The runtime
uses a narrow command adapter; it does not implement a universal mutation engine
or a universal test-reporter parser.

See the [development plan and admission limits](../../development/native-task-sensitivity/PLAN.md).

## Local interface verification

With the pinned engine dependencies already installed, run:

```sh
node scripts/verify-native-sensitivity.mjs
NATIVE_TASK_FIXTURE_SENSITIVITY=1 NATIVE_TASK_FIXTURE_MODES=sensitivity,sensitivity-parallel,sensitivity-command-denial,sensitivity-hook-denial,sensitivity-read-denial,sensitivity-cancel node scripts/verify-native-task-fixture.mjs
NATIVE_TASK_FIXTURE_MODES=sensitivity-off node scripts/verify-native-task-fixture.mjs
```

The installed scripted provider checks the outgoing native tool schema and
receives real tool outputs. The weak boundary suite accepts Stryker's `n > 2`
replacement of `n >= 2`. The same author session adds `assert.equal(accepts(2),
true)` to its project test; a fresh baseline passes and the exact replacement
fails that assertion. Its terminal patch is applied and tested in an ordinary
Git copy. Parallel calls share accounting, and the fixture checks denied script,
lifecycle and dependency reads, cancellation, and the disabled tool list.

Targeted checks retain the equivalent numeric `max` comparison case, red
baseline, import failure, timeout, partial budget and unsupported scope.
Evidence is written separately under `local/native-sensitivity-interface/`.
These are installed-interface and program-behavior checks with a scripted
author, not evidence of Luna quality improvement. Historical H0 4/4 and H1 3/4
results are unchanged; this interface change does not authorize a new campaign.
