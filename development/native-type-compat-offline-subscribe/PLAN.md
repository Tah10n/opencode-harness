# Offline subscribe development pair

Measure only e18db1fe10223db52dcc05b3e769bca140367c2b, OpenCode 1.18.26,
openai/gpt-5.6-luna/high, 1800 seconds per complete task run. Order is A/OFF,
then A/ON. Exactly two fresh runs, no availability requests, retries,
continuation or substitute sessions. A provider/admission/unknown-execution
stop closes remaining sends and leaves the remaining slot not_started.

Both use direct with CONTEXT, CHECKS, SENSITIVITY, INVESTIGATION,
COMMAND_HINTS and EXTRA_ATTENTION zero. Only TYPE_COMPAT is 0/1. Both have
the same compiler, project dependencies, permissions and ordinary CLI.
ON uses returned-callable-strict-v1, at most two analyses, 60 seconds each,
120 seconds total within the task deadline. No hidden OFF analysis.

Use the original EventEmitter3 b0144e940ace8add8f335a8adfbed9284eb419f3 archive,
without Git history. TASK.md consists of the exact bytes of the original
[task A](../native-type-compat-comparison/tasks/A.md), followed by the same
short environment block. Original-task and actual-prompt hashes are separate:
the new prompt is not historically identical. No evaluator, reference,
historical outcome or counterexample enters the model mounts or prompt.

Use the existing offline build.json as the entire inline override. Preserve
model/provider/permission settings in /work/config/experiment.json via
OPENCODE_CONFIG. Reject a pre-existing host inline override. Use fresh build
sessions without custom session permissions. Never rewrite tool schemas.
Check all actual parent/author inventories, including after tool outputs.
Container network stays none; only the existing host model transport can use
https://chatgpt.com/backend-api/codex/responses with existing authorization.

The compiler API is /template/node_modules/typescript/lib/typescript.js;
the ordinary CLI is /usr/local/bin/node
/template/node_modules/typescript/lib/tsc.js. TypeScript is 6.0.3, API SHA256
569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39.
Reuse the pinned installed image and Node. CLI flags are --ignoreConfig
--noEmit --strict --target es2020 --module commonjs --moduleResolution node
--ignoreDeprecations 6.0 followed by project-relative consumer files.

Before any paid request, the local scripted pair must demonstrate native Bash
in the delivery worktree: Node execution, standard libraries and local imports,
a passing semantic consumer, a failing TS2322 consumer with nonzero exit,
and npm test, npm run test-esm, npm run rollup. Preparation consumers are
removed before scripted delivery and never enter real baseline copies.
Verify unchanged-patch application, compiler receipt/callID/snapshot in the
next request, terminal events/usage and container cleanup. Scripted failures
are preparation failures, never real model attempts.

## Independent acceptance (frozen before model work)

Reuse evaluation/A.cjs, A.types.ts and legacy.types.ts from
native-type-compat-comparison, together with its corrected calibration/A
reference and alternative. Recheck baseline, reference, alternative, missing,
erased-types, legacy-break and runtime-break using existing calibration
commands. No generated TYPE_COMPAT consumer alone establishes acceptance.

Q requires an unchanged applicable patch meeting every original task clause:
implementation and runtime lifecycle/identity/independent cancellation,
old API preservation, CJS/ESM, contextual new argument/receiver typing,
callable void cancellation, required regression tests and documentation.
Run ordinary runtime, ESM, build and independent old/new type consumers.
Compile author-added consumers separately. Review tests semantically for
all explicitly required regressions and meaningful positive/negative types,
retaining existing assertions; no required helper, filename or architecture.
Missing regression coverage or documentation rejects Q even if external
runtime/type checks pass. The reference with its added regression coverage
removed is consequently rejected by this same coverage review. This is a
coverage control, not another broad executable matrix. Invalid listeners
require Error without a new Error subtype requirement.

T means normal autonomous delivery and verified termination; D = Q and T.
Internal incomplete is recorded separately and does not itself reject Q.
Recovered patches may have Q, but recovery is not T. Not-started is unknown.
Separate author checks from evaluator checks and compare author claims with
events. Prefer neutral patch IDs before explanatory trace review.

Attribute compiler help only through pre-analysis declarations, actual
receipt in the next request, first relevant edit, repeat result/currentness,
and final full feature preservation. Correct pre-diagnostic code is not a
compiler gain. Later declaration edits make old observations stale. No
hidden third analysis. Freeze rubric before real requests; later findings
remain supplemental.

One bounded decision: additional full ON delivery plus a supported repair
chain is a positive signal on this known task only; two successes tie;
partial repair is partial help; absent/unused diagnostics prove no effect.
Provider-only D differences are separated from code quality. No automatic
next campaign, runtime/default change, merge or release.

Keep raw bodies/streams private locally and authorization headers unsaved.
Publish only safe excerpts, hashes, unchanged patches and accounting. Count
all work/title requests and unknown usage explicitly; cache/reasoning are
subsets of totals. Separate preparation/evaluator effort; no invented price.
Preserve prior results, PR draft/base, and the historical aggregate
PROCESS_CONTAINMENT_UNAVAILABLE limitation.
