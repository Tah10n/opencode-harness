# Can declaration-derived consumers expose the saved B regression?

**Decision A, within the bounds below.** A small baseline-only generator exposes
both unchanged B patches and a second module's returned-function regression.
The same generated consumers accept the checked additive extensions. This is a
local feasibility result, sufficient to discuss a future diagnostic separately.
It is not a compatibility proof, a runtime component, a mandatory gate, or evidence
of improved Luna deliveries. No historical Q/T/D or costs change.

Run the offline check from this Git checkout with an existing source repository
and the already prepared compiler; no install, package scripts, network fetch,
OpenCode session or provider request is involved:

```sh
node development/native-type-compatibility/check.mjs \
  --compiler "$PWD/local/native-command-hints-comparison/batch/bundle/node_modules/typescript/bin/tsc" \
  --source "$PWD/local/native-task-h00-transfer/sources/eventemitter3"
```

The compiler argument is the explicit path to TypeScript's `bin/tsc`, with its
adjacent `../lib/typescript.js` and standard libraries. `--output /path` optionally
selects another results directory. Missing inputs or a compiler other than 6.0.3
produce NOT RUN; this script does not restore dependencies. Full public project
copies are extracted into temporary directories and removed on exit. A 120-second
parent watchdog bounds the entire run, including synchronous Compiler API work;
individual CLI compiles have a 15-second timeout. No checked project is executed.

## What counts as a break

The same consumer bytes, import specifier and compiler configuration must pass
with old declarations and fail with new declarations on the changed API. That is
an observed incompatibility for that consumer, not proof of runtime behavior.
A signature edit is only a structural difference; a stronger receiver requirement
is a potential narrowing until an old admissible consumer actually fails.

The local task boundary is explicit: B adds typed `subscribe`; it does not
explicitly authorize narrowing direct invocation of callbacks returned by the
old API. Its new context requirement is not permission to change old callback
contracts. For the separate Parcel permission control, the hypothetical task
explicitly asks to require the callback's Owner receiver: the identical technical
failure remains visible but is **not** classified as a task violation. There is
no automatic requirements interpreter.

Result vocabulary in the runner/report:

- `reproduced-incompatibility`: old consumer passes and new consumer fails after
  declaration preparation succeeds.
- Suspicious change without a distinguishing consumer: potential risk only;
  a text/signature difference alone cannot earn the first classification.
- `no-difference-in-checked-scope`: these consumers found no difference.
- `unsupported-baseline-consumer`, unsupported/no consumer, or NOT RUN:
  no compatibility conclusion. Preparation errors are a separate category.

## Source and compiler provenance

Historical artifacts are read with `git show` at
`f2b586e731656eda2b399e6a11dc3709582d4a3f`, even if the branch advances.
The source archive is `primus/eventemitter3` commit
`b0144e940ace8add8f335a8adfbed9284eb419f3`. Both full patches are applied without
edits using `git apply --check`, `git apply` and reverse application checks.
Hashes are recorded in [results/results.json](results/results.json).

The saved reference comes from the **B branch** of the historical
`make-calibration.mjs`, verified against the private freeze whose SHA-256 is
published in historical `frozen-inputs.json`. All 27 reference-file hashes matched.
[reference.patch.json](reference.patch.json) stores the exact diff bytes as a JSON string (including blank context-line markers) and captures its existing public changes relative
to that baseline; [reference-provenance.json](reference-provenance.json) records
its preparation and file hashes. Reproduction checks every bound public file;
`TASK.md` is checked against its historical Git blob. Neither the original reference
nor model patches are rewritten. Dependency trees and private manifests/traces are
not published. The generator never uses the reference to select a signature.

The original `compatibility-check.mjs` establishes the exact flags repeated here:
`--ignoreConfig --noEmit --strict --target es2020 --module commonjs
--moduleResolution node --ignoreDeprecations 6.0`. Current host Node is v24.19.0;
TypeScript is 6.0.3. The historical diagnostic did not record an exact Node version,
so host binary identity with that earlier invocation is not established.

Strict includes `noImplicitThis`, `strictFunctionTypes`, `strictBindCallApply` and
strict null checks. `skipLibCheck` and `noUncheckedIndexedAccess` are false; no
error suppressions or per-side changes are added. Target-default ES2020/DOM libraries,
actual loaded declaration paths, resolved imports, compiler/API hashes and exact
CLI commands are retained in the results. `./index` resolves to each copy's
`index.d.ts`. Temporary paths in diagnostics are replaced by `$WORK`; diagnostic
codes, positions and messages otherwise retain compiler output. Program checks
use `getPreEmitDiagnostics`, including semantic, declaration and library errors.

## Methods and observed coverage

| Method | n03 | n04 | Saved reference | What the evidence means |
|---|---|---|---|---|
| Historical manual consumer | TS2684 | TS2684 | Pass | Reproduces the known observation only |
| Old project TypeScript consumers | NOT RUN | NOT RUN | NOT RUN | No such consumers exist at the source commit |
| New instance/constructor/method surface assignable to old | Pass, miss | Pass, miss | Pass | Structural assignability misses this returned-callback invocation failure |
| Generated consumers from baseline only | TS2684, 3/3 | TS2684, 3/3 | Pass, 3/3 | Automatically builds discriminating semantic consumers within the selected rule |

The source tree has only `index.d.ts`, JavaScript runtime tests and JavaScript ESM
tests; it contains no old `.ts` examples/tests to recompile. The patches' new
`test/types.ts`, reference `subscription-types.ts` and evaluator types are not
counted as old consumers. Declaration-only preparation is executed, but does not
fill this coverage gap. Existing runtime checks are outside this declaration study.

Assignability is **new → old**: a replacement value must meet the old surface's
expectations. The comparison includes constructor type, an instantiated public
instance, and a mapped view of every old method. The manually selected concrete
arguments are `{ sample: [string] }` and `{ marker: string }`, with no inserted
`any`, cast, `never` or suppression. This intentionally small check passes even
for both regressions. It does not establish full substitution compatibility.

Requiring the reverse direction as well would reject the valid additive reference
with TS2741 because old lacks `subscribe`. A separate identical-class control with
a private member yields TS2322 when its two directory-specific nominal identities
are directly assigned. Those are false positives of these comparison strategies,
not API regressions. Baseline vs another EventEmitter3 baseline directory has no
such assignment error. Consumer replay uses the same import in separate worlds
and also accepts the private-member control.

## The single narrow prototype

[generate.mjs](generate.mjs) is a filesystem-free helper called by the single
[check.mjs](check.mjs) runner. Its only information is the baseline public entry
and TypeScript's analysis of its generated source. It receives no candidate,
reference, evaluator, historical compilation results or correctness labels.
The known consumer is loaded/run separately by the runner and never passed to
this helper. There is no branch on project, API name, patch ID or hash.

The rule is:

1. Discover exported classes through compiler symbols, deduplicating aliases.
2. Instantiate zero to two class generic parameters from the same small Cartesian
   dictionary: `string`, `{ sample: [string] }`, `{ marker: string }`. Compiler
   diagnostics reject invalid instantiations. These are explicit development
   choices: primitive, tuple-valued object and scalar-valued object; not inferred
   domain requirements. The developer knew the historical defect before choosing
   this rule and dictionary. This is **not held-out evidence**.
3. Inspect public methods with a single signature. Generate required primitive or
   literal arguments, or concrete rest-tuple elements. For constrained method
   generics, use a compiler-resolved constraint witness (first union member).
   Compile the method call to let TypeScript resolve conditional/generic returns.
4. Traverse returned arrays (index zero) and plain object properties. For a concrete
   single-signature callable, detach it into a variable and invoke it with generated
   primitive arguments. No guessed registration, callback name or context setup is
   inserted. The consumer concerns type admissibility, not array non-emptiness at
   runtime.
5. Require that exact consumer to pass on baseline before treating a new failure
   as incompatibility. Preserve its bytes/SHA on every side. Inspect candidate
   declaration preparation separately; unresolved imports cannot become API breaks.

Bounds: 18 root seeds, 60 method calls, depth 3, 160 traversed nodes, 24 consumers,
and the runner timeouts above. The historical surface generates three consumers;
the second module generates three. Each record preserves the discovered path,
concrete generics, call arguments, source bytes, baseline `this` and results.
For example [historical-2.ts](results/generated/historical-2.ts) was generated as:

```ts
import { EventEmitter as API5 } from './index';
declare const subject5: API5<{ sample: [string] }, { marker: string }>;
const returned = subject5["listeners"]("sample");
const callable = returned[0];
callable("sample");
```

No alias/layout identity is required. The helper-factoring control preserves the
original public alias as a forwarding alias rather than deleting an exported name.
The same rule reaches `Parcel.lookup(1) → returned["action"]`, demonstrating a
changed API name, numeric input and object container, not only renamed emitter
syntax. This tiny hand-made control still cannot establish arbitrary-library transfer.

## Control matrix and limitations

| Control | Generated result |
|---|---|
| Same baseline, separate directory | 3/3 pass on both sides |
| Unchanged n03 and n04 | Each 3/3 baseline pass → TS2684 |
| Saved additive reference | 3/3 pass on both sides |
| Helper alias factoring with old exported alias retained | 3/3 pass on both sides |
| Parcel returned function gains required Owner `this` | 3/3 baseline pass → TS2684 |
| Parcel adds `inspect` only | 3/3 pass on both sides |
| Receiver already required in baseline | Direct-call candidate fails baseline; no regression claim |
| Explicitly permitted breaking task | Reuses Parcel technical result; task violation = false by local plan |
| Missing dependency | TS2307 preparation error, not incompatibility |
| Missing compiler | Actual failed launch, no semantic compilation, preparation error |
| Identical class with private member | Generated consumer passes in each world; cross-module assignment fails spuriously |
| Callable overload/generic control | Unsupported; no generated consumer and no compatibility claim |

For an existing receiver requirement, the generator does **not** conclude that all
callbacks must be directly callable. A separate disclosed manual `.call` consumer
passes both versions. The current generator cannot automatically construct that
receiver-aware positive case or detect every subsequent receiver change.

Unsupported exports, overloads, unresolved conditional/generic returns, non-concrete
rest parameters, callback-valued method arguments and class-return recursion are
reported as skipped. Resolvable conditionals after a concrete generic method call
are supported only for those concrete witnesses. Generics, parameter/return variance,
union alternatives, default arguments, all alias exports, symbol-keyed routes,
constructor behavior and runtime registration/lifecycle semantics are not exhaustively
checked. Three passing consumers never mean “API fully compatible”.

A **new, manual** context inference control reveals TS2683 in the saved reference:
its `subscribe` callback lacks contextual `this`. That limitation is separate from
old-consumer compatibility and does not alter historical grading. A diagnostic-only
copy types `this` on `subscribe` alone: the manual new-feature case then passes,
and all three generated old consumers still pass. This demonstrates that typing
new contexts need not narrow old returned callbacks; it does not fix past deliveries.

## Cost, review and publication boundary

[results/results.json](results/results.json) records final run counts and timings;
[development-accounting.json](development-accounting.json) separates preliminary
local work from that run. These are local semantic compilations and wall time,
not model usage or full harness quality measurements. New research provider calls,
Luna runs, probes/retries, benchmarks and OpenCode/scripted-author sessions: **0**.
The current developing Codex agent is separate; its token/cost usage was not
instrumented by this diagnostic and is not represented as zero.

The current agent performs the closing review: new→old direction, same consumer
bytes/configuration, exact source/reference provenance, no known-answer input to
the generator, no generic erasure, unsupported/error separation and conclusions
bounded to observed diagnostics. Syntax checks, local matrix and whitespace checks
cover these development artifacts only. No aggregate verifier, historical containment
investigation, manual Actions, platform matrix or product runtime check is claimed.

Only this development directory is delivered to the existing branch/PR. Runtime,
prompts, tools, permissions, profiles, dependencies, frozen inputs, reports, pause
files and historical patches remain unchanged. Integration and any model evaluation
require a separate decision; Draft and the existing PR base remain in place.
