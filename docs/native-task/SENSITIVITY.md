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
and `path` / `check` / `variant` schema appear in the actual tool list only when enabled.
For a changed production file, pass:

```json
{"path": "src/value.ts", "check": "npm test"}
```

A returned variant includes its concrete diff, a workflow-local `ref`, and a
ready-to-copy `replay` object. For example, after inspecting a survivor:

```json
{"variant": "v-<returned-reference>", "check": "npm test"}
```

Copy the actual returned `replay` object; do not construct the reference. Add a
small justified public API test to the project's normal suite, then issue that
call. It runs a fresh baseline and **only the selected variant**, with exactly
the same captured tests and command. It does not regenerate or run the other
variants. This is a targeted reuse of the existing engine/test adapter, not an
automatic counterexample finder. The ordinary full diagnostic already supports
the same weak-test → stronger-test path.

References exist only in the current workflow. `sensitivity-mutations.json`
retains definitions (file, whole-file hash, original fragment, replacement and
location) independently of observations in `sensitivity-events.json`. New tests
make old observations stale but preserve the definition. Any change to the
corresponding production file requires fresh diagnosis; old offsets are never
relocated. Arbitrary model patches, foreign references and a mismatched `path`
are rejected. A bad reference is a diagnostic error, not a task verdict or
permission to retry automatically. A new reference or check alias never resets
the shared budget. Insufficient time retains partial observations, without an
equivalence conclusion.

`path` defaults to `changed` for generation or the selected file for replay. Omitted `check`, `test`, `npm test`, and
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

Before dismissing a meaningful survivor as equivalent, try a small distinguishing
scenario through the public API, then check both implementations. A failure to
find one is not proof of equivalence. Return values, exceptions, state after an
action, callback order and object identity are examples, not a mandatory list.
Control clocks, randomness and external state through ordinary project testing
facilities. Temporary paths, timing and process identifiers alone do not show a
contract difference. A passing baseline and failing variant do not independently
justify the expected assertion: check it against the original task and contract.

Inspect the concrete diff against the original task and public contract. If its
changed property is required, add a regression through the ordinary public API,
confirm the current implementation still passes, and use the returned replay call.
Never test source text, mutation names, tool paths or administrative environment
state. For equivalent/allowed changes, explain why no new requirement follows.
Do not change production code to satisfy an invented assertion.

No incremental result cache is used: changed tests are really rerun. Each result
has a snapshot identity; later author edits mark older observations stale in
`sensitivity-events.json`. Cancellation stops diagnostic process groups; missing
or unverified diagnostic termination stops the workflow's normal success path.
Standard operators and eight local variants cannot cover every identity,
state-transition or TTL requirement. Invocation without a useful observation,
and availability without author use, are legitimate measured outcomes. Replay results
include current snapshot identity, test-file hashes, original arguments, executed
argv and output from both sides; explicit output truncation remains a limitation.

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
true)` to its project test; an addressed repeat runs only a fresh baseline and the exact replacement; it
fails that assertion. Its terminal patch is applied and tested in an ordinary
Git copy. Parallel calls share accounting, and the fixture checks denied script,
lifecycle and dependency reads, cancellation, and the disabled tool list.

Targeted checks retain the equivalent numeric `max` comparison case, red
baseline, import failure, timeout, partial budget and unsupported scope.
Evidence is written separately under `local/native-sensitivity-interface/`.
Additional targeted controls check a callback module, allowed message differences,
foreign/stale references, fresh tests, independent writable files/dependencies,
addressed cancellation and shared budget exhaustion. These are installed-interface and program-behavior checks with a scripted
author, not evidence of Luna quality improvement. Historical H0 4/4 and H1 3/4
results are unchanged; the separate [four-run development comparison](../../development/native-task-sensitivity/replay-20260914/PLAN.md) retains its own admission and outcome.
