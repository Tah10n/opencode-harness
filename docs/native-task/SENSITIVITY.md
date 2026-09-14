# Test sensitivity in direct (experimental, off by default)

After a behavior change and a passing suite, `harness-sense` shows a small set of
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

In native Bash, with `workdir: "."`:

```sh
harness-sense src/value.ts
harness-sense changed test:unit
harness-sense index.js "node_modules/.bin/ava"
harness-sense index.js "node_modules/.bin/mocha"
harness-sense src/value.ts "node_modules/.bin/vitest run"
```

The default command is the existing `npm run test`. An optional existing
`test:*` script or explicit local Node (`node --test`), AVA, Mocha or Vitest
command avoids confusing a combined lint/build pipeline with runtime tests.
Native Bash and selected-command permissions must allow execution; this adapter
does not authorize a denied command. Native read restrictions apply to copying.

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
confirm the correct implementation still passes, and rerun `harness-sense`.
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
