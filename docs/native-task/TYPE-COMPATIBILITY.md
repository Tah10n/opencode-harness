# Old TypeScript call observations in the direct author session

`HARNESS_TASK_TYPE_COMPAT=1` independently enables a bounded diagnostic after an
ordinary project check. It generates consumers from the original public declarations,
confirms each consumer compiles there, and replays identical bytes against the
current declarations. Evidence is appended to the Bash response before the next
normal author request. The author decides whether the original task permits the
observed difference and uses ordinary native edits to continue.

This is experimental installed integration, not evidence of improved Luna quality.
There is no new tool, reviewer, model request, automatic source edit, trusted-repair
gate or terminal finisher. Default is off; disabled workflows do not import the
core or perform its reads/compilations. D/check-first are not supported. Ordinary
prompts, model, effort, permission rules and the user's default remain unchanged.

## Install and enable

Materialize into a new directory with an existing parent:

```sh
node scripts/profile-materialize.mjs --native --profile core --task \
  --output /absolute/task-config

HARNESS_TASK_FILE=/absolute/original-task.txt \
HARNESS_TASK_STRATEGY=direct \
HARNESS_TASK_TYPE_COMPAT=1 \
HARNESS_TASK_TYPE_COMPAT_COMPILER=/absolute/prepared/typescript/lib/typescript.js \
HARNESS_TASK_TYPE_COMPAT_NODE=/absolute/prepared/node \
HARNESS_TASK_TYPE_COMPAT_PROFILE=returned-callable-strict-v1 \
HARNESS_TASK_CONTEXT=0 HARNESS_TASK_CHECKS=0 \
HARNESS_TASK_SENSITIVITY=0 HARNESS_TASK_INVESTIGATION=0 \
HARNESS_TASK_COMMAND_HINTS=0 HARNESS_TASK_EXTRA_ATTENTION=0 \
OPENCODE_CONFIG_DIR=/absolute/task-config opencode
```

Invoke `/harness-task` in a fresh session. Existing OpenCode dependencies must
already be prepared for an offline launch. The diagnostic never installs a
compiler, fetches packages, builds declarations or executes lifecycle scripts.
Select an already authorized Node 24+ executable and TypeScript installation.
OpenCode's embedded Bun executable cannot substitute for Node's permission runner.
Project and native read/external-directory permissions must already allow the
selected inputs; asks/denies produce a limitation, never a permission expansion.

Only TypeScript **6.0.3**, API SHA-256
`569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39`, is supported.
A changed compiler does not silently fall back to this installation.

## Public entry, inputs and explicit diagnostic conditions

The root package must identify one existing `.d.ts` through `types`/`typings`, or
the user must select `HARNESS_TASK_TYPE_COMPAT_ENTRY` relative to the project root.
The simple exports layout with one `.` object containing a unique string `types`
and string runtime `import`/`require`/`default` is supported; `./package.json` may
also be exported. Conflicting types, other subpaths, nested conditions,
`typesVersions`, `.d.mts`/`.d.cts` and ambiguous resolution are unsupported.
An arbitrary modified `.d.ts` is not assumed public.

Existing relative declaration imports/reexports and path references are captured
recursively with their original layout. An edit of an imported declaration can
trigger the observation. Only one unambiguous relative file or directory-index
resolution is admitted. External packages and project type/lib references are
unsupported in this first version. No ambient ancestor `node_modules` lookup
occurs. Missing imports are preparation errors. Symlinks are refused; literal
and real paths are checked before content access. Config extends/plugins/project
references are refused without reading their targets.

`returned-callable-strict-v1` is an **explicit diagnostic profile**, not an
interpretation of project tsconfig. It uses noEmit, strict, ES2020, CommonJS,
Node10 resolution, ignoreDeprecations 6.0, no automatic `types`, skipLibCheck false
and noUncheckedIndexedAccess false. ES2020/DOM standard libraries come from the
selected compiler installation. The same library bytes and options serve both
worlds. Root tsconfig/jsconfig, package metadata, lockfiles, compiler/libraries,
selected entry and Node executable identity are guarded; changes stop the
comparison. Custom project builds/configs are not run or certified.

The original seeded workflow snapshot, including permitted uncommitted user
changes, is frozen before the first author session. Baseline is never updated by
an incompatibility or repair. The generator receives only baseline declarations
and fixed configuration. It has no development/evaluator/reference/patch inputs.
A candidate never selects old consumers. Worlds use the same virtual project
paths and import specifier, avoiding cross-directory private-class assignment.

## Trigger, ordering and limits

An admitted, completed native Bash command at the project root can trigger:
`npm test`, `npm run test`, `npm run test:types`, `npm run typecheck`,
`npm run check`, `npm run build`; `pnpm`/`yarn` followed by `test`, `typecheck`,
`check`, `build`; or `node --test` with simple path arguments. Environment prefixes,
flags, pipelines, shell chains and other cwd forms are not interpreted.
A confirmed nonzero project check can still trigger; native signal/timeout,
unconfirmed execution, denial and cancellation cannot. The internal test runner
need not be recognized by the ordinary observer.

The existing operation queue retains the exclusive Bash ticket while a consistent
input snapshot is captured, compared and delivered. Waiting edits cannot overtake
it. External snapshot/environment changes suppress the result. Raw tool output
and its native event are saved first, unchanged; the appended block never becomes
project-check evidence. Cancellation aborts the compiler without awaiting a native
session abort from inside its own hook.

At most two analyses are admitted: the first changed surface and one changed
surface after that. Duplicate/unchanged events do not rerun the compiler. Each
child has a 60-second external watchdog, within a 120-second total diagnostic
budget and the existing task deadline; failed/incomplete attempts consume budget.
There is no third or post-author run. `result.json` marks an observation stale if
its bound snapshot is no longer current. If no eligible command occurs, it says
NOT RUN with the reason.

Limits retained from the prototype: 2 generic parameters, 18 root seeds, 60 method
calls, depth 3, 160 visited nodes, 24 consumers. Specimens remain `string`,
`{ sample: [string] }`, `{ marker: string }`. Supported single signatures reach
returned functions through arrays/plain properties; overloads, unresolved generic
returns and unsupported arguments are reported as skipped. An existing mandatory
receiver does not become a new regression. Zero admissible consumers is unsupported.

Input preparation caps 128 files/16 MiB, individual declarations 512 KiB, compiler
10 MiB, a standard library 3 MiB. Child output is capped at 256 KiB, each program
at 100 diagnostics and each message at 2,000 characters. Node has a 768 MiB V8 heap
limit. The hash-pinned compiler executes only in the child, with Node filesystem
permissions limited to its worker/generator modules, empty environment and a closed
virtual CompilerHost. No project JavaScript or plugin is loaded. CompilerHost can
only read the prepared map; it cannot read physical project/home/evaluator paths.
No generated source is written into the author's project. Child close confirms
stopping before another operation; timeout/crash/OOM produces NOT RUN, never a
semantic incompatibility claim.

## Interpreting evidence

- **reproduced-incompatibility**: the same generated consumer passed baseline,
  then obtained a comparison-related candidate diagnostic after both declaration
  preparations passed. Check whether the task authorizes the difference.
- **no-difference-in-checked-scope**: admissible checked consumers found no
  difference. Skipped paths remain unsupported; this is not full compatibility.
- **unsupported / NOT RUN / preparation-error**: no compatibility conclusion.
  Baseline failures, absent inputs/compiler, malformed declarations and child
  failure remain distinct in the artifact. A change without a distinguishing
  admissible consumer is at most a potential risk, never a reproduced regression.

At most three distinct examples appear in the response; they are not three
independent defects. The block binds public path, source bytes/hash, compiler,
profile, baseline and candidate snapshots. Full diagnostics, skipped cases and
costs remain in `type-compat.json`; `result.json` and the compact summary retain
status, delivery/currentness and limitations. The author still verifies new types,
features, runtime, tests and docs independently. An authorized breaking change is
not automatically rolled back or declared a task failure.

## Reproduce the integration checks

No real provider calls, probes, Luna task runs or benchmark are needed:

```sh
export HARNESS_TASK_TYPE_COMPAT_COMPILER="$PWD/local/native-command-hints-comparison/batch/bundle/node_modules/typescript/lib/typescript.js"
node scripts/verify-native-type-compat.mjs
node scripts/verify-native-type-compat-hooks.mjs
node scripts/run-native-type-compat-installed.mjs
```

The last command uses the existing pinned Linux image/toolchain and prepared
plugin dependencies, `--pull=never --network none`, with a local loopback scripted
provider. Missing prepared resources are a genuine environment limitation; no
installation is attempted. The fixture invokes the actual materializer and checks
bundle hashes. It implements the complete extension, receives generated evidence
in real outgoing requests, repairs via native edit, repeats ordinary checks and
applies the terminal patch in an ordinary Git clone. The provider never supplies
a counterexample to the generator.

EventEmitter checks cover contextual this, non-any event arguments, cancellation,
legacy runtime behavior and old generated consumers. Removing the new declaration
or passing wrong argument types fails independent acceptance. A second Parcel
module checks a numeric argument/object-return path. User-uncommitted declarations
appear in generated baseline consumers. Flag-off works even with the diagnostic
modules removed from its disposable installed bundle. Other installed controls
retain an explicitly authorized type break and finish without any check command.

See [integration results](TYPE-COMPATIBILITY-RESULTS.md). Scripted integration
supports mechanism claims only, with historical `PROCESS_CONTAINMENT_UNAVAILABLE`
and full-platform/aggregate CI coverage kept separate. Historical prototype files,
reference, patches, campaign results and costs remain unchanged.
