# Independently inspect and reproduce the assessments

The specification is the original [tasks.json](tasks.json), each linked TASK.md,
and [RUBRIC.md](RUBRIC.md). The frozen evaluator and controls are unchanged.
[results.json](results.json) maps all scheduled slots to source patches,
neutral quality decisions and native delivery evidence. Empty patches for slots
9 and 18 are intentional started outcomes. A source patch's SHA-256 and pinned
upstream commit appear in its evaluation JSON.

Use a new ordinary Git checkout of the task's public remote at its exact
`sourceCommit`; do not use a harness administrative worktree. In that copy:

```sh
git apply --check /absolute/report/patches/02-denque-rotate-r1-H00.patch
git apply /absolute/report/patches/02-denque-rotate-r1-H00.patch
```

Restore the project's pinned dependencies as described in [INSTALL.md](INSTALL.md).
Both source patches and the eight original H00 [terminal patches](terminal-patches/)
were applied to independent ordinary copies; changed bytes, executable modes
and deletions match the evaluated author result. Terminal patches differ in Git
header formatting from normalized source patches, but deliver the same files.
No source implementation was edited to help it pass. Generated ignored fastq
lockfile deletions in raw observer capture are excluded from source patches
because that file never existed at the pinned upstream commit. H00's original
terminal patches do not contain that deletion.

## Ordinary verification actually run

Each check used a fresh isolated Linux arm64 copy with the common retained image,
pinned dependencies and no network. The source patch was applied before running:

| Project | Command | Measured attempts |
| --- | --- | ---: |
| denque | `npm test` (includes TypeScript) | 4 |
| eventemitter3 | `npm test && npm run test-esm` | 4 |
| fastq | `npm test && npm run typescript` | 4 |
| quick-lru | `npm test` (XO, AVA, coverage, tsd) | 4 |
| ufo | `PATH="$PWD/node_modules/.bin:$PATH" npm test && npm run build` | 2 |
| ms | No scored attempt; preflight only | 0 |

All 18 ordinary checks exit 0. The two empty attempts only reproduce the
unchanged baseline and are still Q=0. Eventemitter's delivered standalone
`test/types.ts` in slot 5 was also compiled with the same independent host
TypeScript 6.0.3 as calibration: strict, noEmit, types=[], target ES2022,
module/moduleResolution Node16. The other three eventemitter patches have no
required consumer type fixture; the assessor did not write one for the author.
Source review is not substituted for compilation.

The original independent behavior source can be emitted without executing it:

```sh
node /absolute/report/diagnostics.mjs denque-rotate original denque > /absolute/disposable-project/diagnostic.cjs
```

Run the emitted file from the patched ordinary project with Node. For ufo/ms,
build first, as the frozen evaluator consumes the generated dist package.
Use a bounded process timeout (the recorded checker used `timeout 10s node`).
This emitted source is exactly [evaluation-cases.mjs](evaluation-cases.mjs),
including its original limitations. It is only one part of Q.

## Post-start diagnostics and interpretations

[diagnostics.mjs](diagnostics.mjs) emits the exact additional source used in
post-execution checks. It makes no provider requests and launches no process.
Apply it only in a disposable ordinary copy after the unmodified author suite
passes. Do not append a sensitivity mutation to a retained author patch.

| Task / mode | How to use emitted source | Existing required distinction |
| --- | --- | --- |
| denque-rotate / `denque-sensitivity` | Append to `index.js`, run `npm test` | Nontrivial rotation must retain object identity |
| denque-remove-where / `denque-sensitivity` | Append to `index.js`, run `npm test` | Successful filtering must retain configured capacity |
| fastq-on-idle / `idle-transition` | Run as independent `.cjs` | A waiter must observe an already-reached idle state before later independent work |
| fastq-on-idle / `early-kill-sensitivity` | Append to `queue.js`, run `node node_modules/tape/bin/tape test/test.js test/promise.js` | kill/killAndDrain cannot resolve a waiter while a worker remains active |
| quick-lru-prune / `callback-order-interpretation` | Run as independent `.cjs` | Same frozen case with only unsupported relative callback order removed |

For example, emitting the idle-transition probe requires task, mode and project:

```sh
node /absolute/report/diagnostics.mjs fastq-on-idle idle-transition fastq > /absolute/disposable-project/diagnostic.cjs
```

The denque mutation clones object entries only for a non-no-op rotation; it
leaves primitive/no-op behavior and queue position bookkeeping intact. The
capacity mutation clears only the configured limit after successful filtering.
The fastq mutation wraps both factories, preserving `.promise` and drain, and
forces pending `onIdle` resolution on kill/killAndDrain with a running worker.
Its check runs underlying Tape tests so lint/coverage of injected diagnostic
code cannot produce a false sensitivity result. Passing a mutated suite proves
only that specific required discrimination is missing, not general test quality.
Nonzero runs were inspected for the relevant failed assertion.

| Diagnostic result (suite exit; independent probe pass/fail) | P | H00 | Reference / alternative |
| --- | --- | --- | --- |
| rotate clones objects | 0, missed | 2, caught by strict identity assertions | 0 / 0, both missed: calibration gap |
| removeWhere loses capacity | 0, missed | 0, missed | 1 / 1, caught by overflow order assertions |
| onIdle misses reached idle | fail | pass | pass / pass |
| onIdle resolves early on kill | 0, missed | 0, missed | 1 / 1, caught by pending-state assertions |
| prune callback order interpretation | pass | pass | pass / pass |

The original prune runtime evaluator fails P only because of callback ordering.
Its raw exit remains 1 in the assessment; the interpreted exit is 0. P's Q=0 is
based on separate missing required regressions (empty-cache reuse and expired
current/live old shadow), not this unsupported expectation. Frozen TASK.md does
not dictate callback ordering across generations. This interpretation was
applied to both authors and both controls with no other evaluator change.

Each [evaluation JSON](evaluations/) includes scenario-by-scenario content review,
ordinary/original/interpreted exit status, exact patch fingerprints,
applicability, diagnostic excerpts and D evidence. [supplemental-controls.json](supplemental-controls.json)
retains control exit status and relevant assertion excerpts. Full raw outputs
are retained locally with hashes; private provider/session traces and complete
project trees are not public report artifacts.

Q decisions and their checkpoint were saved before reading the arm mapping.
[neutral-quality-decisions.json](neutral-quality-decisions.json) preserves that
original decision document verbatim, including initial review notes marked
pending; top-level Q is the subsequent completed quality decision. The SHA-256
matches [quality-decision-checkpoint.json](quality-decision-checkpoint.json).
The final per-attempt assessments distinguish those initial notes from the
completed checks. There is one assessor, also involved in operational monitoring;
this is best-effort neutral-label review rather than independent double blinding.

## Reproduction scope and uncertainty

The exact H00 installation can be reproduced from public product source and
locked npm dependencies. The common image is a retained local artifact with a
recorded hash; its public availability/byte-identical rebuild is unverified.
Re-running checks on another environment is new local evidence, not a replay of
the exact measured platform. The standalone eventemitter type fixture was
checked on the host compiler; author/runtime checks used Linux arm64.

The frozen [statistics.mjs](statistics.mjs) requires complete two-repetition
paired task means and keeps whole projects together. It must not be run on the
18 observed rows as though they were the complete 48-slot series. Primary
estimates, 95% interval and repeat-stability fields are null in results.json.
No unstarted slot receives zero quality, and no significance-based enlargement,
new candidate, rerun or paid reproduction is authorized by this report.

The report/source whitespace check passes excluding archived `.patch` payloads.
The raw outer `git diff --check` exits 2 on those stored unified diffs (context
prefixes and tab indentation); payloads are preserved and actual application
checks pass. This is disclosed separately rather than called a clean full diff.
