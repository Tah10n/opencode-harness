# Installed type compatibility integration results

Final local mechanism verification on 2026-09-16. No real research provider calls, Luna task runs, probes or benchmarks. This is not a model-quality comparison.

The actual materialized bundle ran on Linux with OpenCode 1.18.26, Node 24.19.0 and the selected TypeScript 6.0.3. Docker used the existing image, no pull, no network except loopback, read-only host inputs and isolated writable fixture copies. All recorded installed module hashes match the delivered source.

## Installed outcomes

| Scenario | Analyses | Observed outcome | Portable project checks |
|---|---:|---|---|
| emitter | 2 | no-difference-in-checked-scope | passed |
| parcel | 2 | no-difference-in-checked-scope | passed |
| off | 0 | disabled; modules absent | passed |
| allowed-break | 1 | reproduced-incompatibility | passed |
| no-command | 0 | NOT RUN | passed |

EventEmitter and Parcel outgoing author requests contained the real generated old-call source and diagnostic with the correct snapshot; final requests retained that evidence and the repair observation. Fixtures supplied original tasks and scripted ordinary edits, never a consumer to the generator. New test files used available native write; declarations were repaired through native edit. Both original checkout and index stayed unchanged. The imported prepared toolchain was read-only.

The EventEmitter-like control uses the public index.js/index.d.ts from the existing EventEmitter3 source at b0144e940ace8add8f335a8adfbed9284eb419f3, with a small fixture package/check command and independent new-feature tests. The original test directory and ESM entry are preserved in the fixture, and its available upstream CommonJS/ESM Mocha tests run using the existing read-only dependencies. Both upstream Mocha files passed (42 tests). No dependencies were installed. The fixture checks contextual this, non-any argument inference, incorrect-argument rejection, independent idempotent cancellation, on/once/emit/listeners/removeAllListeners behavior. Removing the new subscribe declaration fails acceptance. The second small module independently exercises numeric arguments and an object-returned callable.

User-uncommitted UserDraft declarations appear in generated baseline consumers. The permitted-breaking case retains the technical difference and patch. The no-command case has zero analyses and NOT RUN. Disabled mode has no type artifact/output and works with diagnostic modules removed from its disposable bundle. All native/diagnostic termination checks passed.

All installed workflow statuses remain **incomplete**: the existing project observer does not interpret the compound runtime/type command. Actual command success, copied-patch checks and generated evidence are separately asserted. The new mechanism never overwrites the workflow status.

## Measured diagnostic cost

| Module / analysis | Semantic compilations | Total ms | Preparation ms | Admitted bytes per capture | Actual bytes read for analysis | JSON bytes sent | Result bytes |
|---|---:|---:|---:|---:|---:|---:|---:|
| emitter / 1 | 13 | 4642 | 101 | 11945766 | 35837298 | 12248023 | 13639 |
| emitter / 2 | 13 | 4700 | 127 | 11945736 | 35837208 | 12247993 | 12581 |
| parcel / 1 | 9 | 3359 | 106 | 11942140 | 35826420 | 12240741 | 3298 |
| parcel / 2 | 9 | 3281 | 101 | 11942117 | 35826351 | 12240718 | 2935 |
| allowed-break / 1 | 9 | 3340 | 116 | 11942147 | 35826441 | 12240741 | 3256 |

Total includes input consistency checks after compilation. Preparation time covers the two pre-compiler captures; the final consistency capture is in total time/read volume. Admitted bytes describe one bounded input map; actual read volume includes repeated consistency captures. Semantic compilation count includes declaration preparation, three baseline generation programs and paired consumer programs.

Initial baseline preparation is separate from each analysis: emitter 94 ms, parcel 98 ms, allowed-break 99 ms, no-command 116 ms. It captures inputs without running the compiler.

These are final-run diagnostic measurements, not full development expenses. Earlier local attempts included an intentionally small heap that exited with SIGABRT/NOT RUN and fixture corrections (OpenCode schema normalization and an unavailable apply_patch tool). None are model runs; no aggregate development token/cost measurement was collected. Scripted local HTTP requests are recorded separately in JSON and must not be read as external model usage.

## Other checks and remaining coverage

- Real-compiler/input controls and native hook controls passed on macOS; see the separate local result artifact. They cover unsupported/baseline failure, malformed/missing inputs, permission and symlink boundaries, linked declarations, dependency layouts, crash, timeout, cancellation, same-state deduplication, two-run bound, immutable baseline, environment/path changes, independent instances, external mutation and staleness.
- Hook controls confirm a queued writer cannot overtake compiler delivery; denial before and during execution never returns late evidence and does not deadlock. Original tool events remain unchanged.
- Existing native-task regression, direct/check-first/compact delivery checks, 23 command-observation scenarios and native materialization tests passed. The materialization CLI command from the guide was also executed against a fresh temporary output.
- Full aggregate verifier and full platform CI: NOT RUN. Historical PROCESS_CONTAINMENT_UNAVAILABLE remains unresolved; no assertion or permission boundary was weakened. No manual Actions, merge, release or package publication.
- Scope remains fixed specimens/returned callables and an explicit diagnostic profile; no full API compatibility, arbitrary dependency resolution, runtime-failure inference or Luna quality claim.

[Installed hashes, snapshots, receipts and costs](type-compat-installed-results.json) · [Local control results](type-compat-local-results.json) · [Installation and supported scope](TYPE-COMPATIBILITY.md)
