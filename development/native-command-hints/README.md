# Conditional command-hint mechanism verification

This change adds `HARNESS_TASK_COMMAND_HINTS=1` to the existing native task
workflow, default off. See the [user contract](../../docs/native-task/COMMAND-HINTS.md).
It tests receipt and use of a proposed mechanism, not a quality improvement in Luna.
No real model/provider research requests were made.

## Installed evidence

[RESULTS.json](RESULTS.json) records the final OpenCode 1.18.26 scripted run,
resolver hash, materialization source hashes, costs and portable-patch checks.
The fixture materializes the real native task bundle, compares the installed
resolver bytes, uses the unchanged native Bash/read/edit tools and inspects
actual provider tool messages. The hint and lint failure are not canned outputs.

| Layout | Selected hint route | Native exits | Local hint overhead | Portable patch |
|---|---|---|---|---|
| A: local installed dependencies | Same local pnpm, original `test` script | 127 → 1 → 0 | 94 path probes; 4 metadata reads; 14,750 bytes; 2.93 ms | Applied in ordinary clone; real `pnpm test` passed |
| B: ancestor dependencies; no local `.bin` | Explicitly partial ancestor `eslint .` | 127 → 1 → 0; separate `npm test` → 0 | 112 path probes; 6 metadata reads; 28,920 bytes; 8.22 ms | Applied in ordinary clone; real `pnpm test` passed |
| Flag off | No hint/route/artifact | 127 | Resolver not imported by disabled runtime path | Original failure retained |

Both layouts run in the harness's mandatory isolated delivery worktree. A tests
ordinary **local dependency resolution**, not a new ordinary-session plugin
mode. Both deliveries are subsequently applied and checked in ordinary Git
clones. No workflow directory policy was changed to make A look like a plain
OpenCode session.

The complete saved UFO source/dependency layout is copied from
`local/native-task-integrated/inputs/url-search-params`. A syntax error is added
only to a new disposable copy of `src/encoding.ts`; scripted native edits remove
it and add a public numeric-input regression in `test/encoding.test.ts`. The
original suites remain. Historical author patches, append implementations,
reference/alternative, evaluator and scores are untouched.

The ancestor case exposed a real distinction: invoking an ancestor pnpm by full
path does **not** make the script's nested bare pnpm work. The implemented narrow
partial ESLint route reaches the real project diagnostic. The later `npm test`
choice belongs to the scripted author; the hint does not recommend it, claim
manager equivalence or infer its success.

The successful final run had 11/12/5 local scripted HTTP requests respectively,
including native parent/title requests; these are not real model calls. The
provider asserts that the same author request receives the original failure and
hint, uses its returned route, receives real lint diagnostics, edits source and
test, and receives actual final suite output. Raw `tool-events.json` has no hint
text. All hint executions are zero; measured native command times are separate.

Both terminal patches have SHA-256
`7502463228041968fbd5a2fbc196bf7651b5a0350b78f58f46e357f7a0d29c76`.
They contain source/test edits only, no administrative paths or dependency tree.
Normal native termination is verified. Workflow status deliberately remains
`incomplete`: original bare `pnpm test` failure remains and unsupported command
scope is not certified by a different passing command. A portable patch and
real suite passes do not override that evidence boundary.

Docker uses the existing pinned image, `--pull=never --network none`, read-only
host mounts, an unprivileged user, private tmpfs and automatic removal of its
own container. The provider listens only on container loopback. Final logs are
checked for registry/install failures. No packages are installed or downloaded.
Original tracked checkout/commit are unchanged. Installed package content is
unchanged except the explicitly recorded generated
`vitest/dist/tsconfig.tmp.tsbuildinfo` in the disposable ancestor dependency copy;
ordinary `.cache` contents are excluded from package fingerprints. The actual
saved source checkout is read-only throughout.

Earlier development fixture failures were retained as failures: missing offline
config/lock preparation caused blocked registry attempts, OpenCode added a
missing `$schema`, an unused variable was only a warning (exit 0), ancestor pnpm
could not resolve its nested pnpm, and Vitest wrote its incremental cache. These
were diagnosed before the final passing run; none is represented as a passing
historical experiment or a model result. OpenCode also emits its existing
named-export plugin-load warning (`details.executionDirectory`) while loading the
current plugin module; the real default plugin hooks and delivery path above
were nevertheless exercised. This adjacent existing warning is not fixed here.

## Controls and reproduction

`npm run verify:native-command-hints` passes 31 controls covering the narrow grammar, real shell
failure, exact-diagnostic spoof from an existing executable, nested missing
command, real success/failure distinctions, cache-only/missing/mismatched
installs, local precedence, denied targets/ancestors, current metadata and
untracked dependency changes, changed cwd/PATH, repeated events, cancellation,
metadata bounds, and explicit partial lint scope. A semantic counterexample has
a real passing Node suite but violates the independent zero-value contract; the
hint does not declare it correct.

The installed disabled control preserves the raw failed result, produces no hint
artifact or text, and leaves the original checkout untouched. The resolver is
only dynamically imported inside the enabled branch; neither hint observation
hook is invoked when disabled. Existing native observation tests separately
cover trusted evidence, stale state and unresolved failures.

Available local reproduction (no installations are performed):

```sh
npm run verify:native-command-hints
node scripts/verify-native-task.mjs
node scripts/verify-native-sensitivity-dependencies.mjs
node scripts/verify-native-template.mjs
node development/native-command-hints/run-installed.mjs
```

The installed runner expects the saved UFO input, prepared plugin dependencies,
Linux OpenCode binary and pinned Docker image already present at the paths
specified in the script. `COMMAND_HINT_LAYOUTS=ancestor,off` narrows fixture
layouts during diagnosis. Full raw local fixture output stays under ignored
`local/native-command-hints/`; dependency trees, project copies and streams are
not published. Temporary fixture containers are removed.

Native task/observation tests, dependency-layout regression tests and template
checks passed locally. Full aggregate verification was not rerun; its historical
`PROCESS_CONTAINMENT_UNAVAILABLE` limitation is separate. No manual Actions,
platform matrix, benchmark, Luna comparison, retry experiment, merge or release
was started. The next quality experiment is not authorized by this fixture.
