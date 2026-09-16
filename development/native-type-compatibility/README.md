# Local TypeScript compatibility feasibility

**Decision A, for a bounded class of returned-callable contracts.** A small
baseline-only Compiler API generator builds consumers that expose the old API
regression in both saved B patches. The same rule detects a different module's
returned-function receiver change and accepts the checked additive extensions.
This warrants a separate discussion of diagnostics, not automatic integration,
a mandatory gate or a claim that Luna delivers better patches.

## Reproduce offline

Use the existing compiler and local source repository; nothing is installed:

```sh
node development/native-type-compatibility/check.mjs \
  --compiler "$PWD/local/native-command-hints-comparison/batch/bundle/node_modules/typescript/bin/tsc" \
  --source "$PWD/local/native-task-h00-transfer/sources/eventemitter3"
```

`--output /directory` is optional. TypeScript must be 6.0.3, with its adjacent
Compiler API and standard libraries. Historical artifacts come from
`f2b586e731656eda2b399e6a11dc3709582d4a3f`; EventEmitter3 is archived at
`b0144e940ace8add8f335a8adfbed9284eb419f3`. Missing inputs produce NOT RUN.
The runner uses temporary copies, removes them and has a 120-second watchdog.
It runs no project lifecycle scripts, runtime sessions or network installation.

## Findings

| Method | n03 / n04 | Limitation |
|---|---|---|
| Saved manual consumer | Both TS2684 | Separate reproduction of known observation |
| Pre-existing TypeScript consumers | NOT RUN | None exist in the baseline tree |
| New public types assignable to old | Both pass | Misses this returned-callback failure |
| Generated baseline consumers | Both TS2684, 3/3 each | Bounded development rule, not general compatibility |

The unchanged baseline copy, saved reference, harmless alias factoring and tested
additive controls pass generated replay. A second module uses a numeric method
argument and a callback nested in an object. Existing `this` requirements are not
flagged as new regressions; unsupported overloads/generics and preparation errors
stay separate. Symmetric and cross-directory private-member comparisons demonstrate
false positives. A manually disclosed new-feature check also finds missing contextual
`this` inference in the saved reference; only a new diagnostic copy is adjusted.

- [Full report, control matrix, provenance and limitations](REPORT.md)
- [Runner](check.mjs) and [filesystem-free baseline generator](generate.mjs)
- [Actual commands, versions, configuration and diagnostics](results/results.json)
- [Generated example](results/generated/historical-2.ts)
- [Reference provenance](reference-provenance.json) and [exact diff bytes](reference.patch.json)
- [Local compilation counts and timing, separate from developer/model usage](development-accounting.json)

Final run: **90 semantic compilations, 39.33 seconds**. Including preliminary local
work: 270 compilations, 113.91 seconds of recorded run time. Syntax, artifact-byte
bindings and whitespace are checked; these are not full CI or runtime evidence.
The closing review was performed by the current agent without a separate reviewer.

No runtime, prompt, tool, profile, dependency, historical result or Q/T/D is changed.
New research provider calls, Luna task runs and OpenCode sessions: **0**. The current
developing agent's usage is separate and uninstrumented. Integration and model
assessment require another decision. Existing PR Draft/base are preserved.
