# Feedback development v1

Eight small Node.js repositories prepare a development comparison of **direct
(control)** against **D (candidate)** after the accepted actionable-feedback fix
in PR #31. Both use the unchanged native core, one identical materialized task
bundle, native isolated delivery, the same permissions and a 600-second total
task deadline. This is a limited JavaScript screening set, separate from all
historical campaigns and official SWE-PolyBench scoring. Neither strategy has an
established quality advantage here.

The default path runs deterministic controls and an installed scripted provider.
Real inference requires both an explicit `--authorize-model-runs` launch flag
and a committed seal of a separately authorized execution freeze. The opt-in
only covers this sixteen-slot development campaign, `openai/gpt-5.6-luna`, high,
OpenCode 1.18.26 and Node 24.19.0. It never changes product or global settings.

## Reproduce the model-free checks

From the repository root, with Node 24.19.0 and Git:

```sh
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix profiles/native/sensitivity
node evaluation/feedback-development/preflight.mjs "$PWD/local/feedback-preflight"
npm run verify
OPENCODE_BIN=/absolute/path/to/opencode npm run verify:installed
```

Use a fresh output directory for each fixture; retain earlier outputs. The
ordinary verify path runs all eight baseline/gold/wrong triples, two additional
negative controls and lightweight configuration, reporting and schedule regressions.
It never executes real model requests.

For the actual container path, install the platform-matching Linux OpenCode
**1.18.26** binary without lifecycle scripts, build the existing support
Dockerfile and prepare a native bundle with its committed dependency lock:

```sh
feedback_builder="och-feedback-$(date +%s)-$$"
docker buildx create --driver docker-container --name "$feedback_builder"
docker buildx build --builder "$feedback_builder" --load \
  --iidfile "$PWD/local/feedback-image-id" \
  -f evaluation/support/Dockerfile evaluation/support
export EVALUATION_IMAGE="$(cat local/feedback-image-id)"
node evaluation/feedback-development/assets.mjs \
  "$PWD/local/feedback-assets" /absolute/path/to/linux/opencode
node evaluation/feedback-development/preflight.mjs \
  "$PWD/local/feedback-contained" --contained \
  --toolchain "$PWD/local/feedback-assets/toolchain"
node evaluation/feedback-development/installed.mjs \
  "$PWD/local/feedback-installed" "$PWD/local/feedback-assets/bundle" \
  "$PWD/local/feedback-assets/toolchain"
```

The installed command exercises both full 600-second configurations, then
separate five-second synthetic deadline controls. The latter demonstrate stop
semantics and do not change the development budget or product correction limit.
The existing Verify container job runs these commands too. Preserve the small
result directories and stop/remove owned assets, images and build caches after
checking them; keep pre-existing resources. The stage-2 local run used a separate
temporary builder for that reason. Its retained diagnostic container was recovered
with the existing `evaluation/support/recover.mjs` before removal.
After preserving and checking the fixture outputs, remove the owned builder with
`docker buildx rm "$feedback_builder"`, remove the owned execution image with
`docker image rm "$EVALUATION_IMAGE"`, and remove `local/feedback-assets`.

## Tasks and public contracts

Each task directory contains `source/` (including TASK.md and ordinary tests),
independent `acceptance.test.mjs`, `gold.patch`, `wrong.patch` and an obligation
inventory. Task 01 also retains `discount-field-loss.patch`; task 03 retains
`all-holds-refund.patch`. Preflight regenerates both from gold with the existing
`controlPatch`, checks the complete retained bytes and grades each separately.
Only `source/` is copied into author input. Tasks have no dependencies;
the package locks make that explicit.

| Task | Group | Required work and preserved contracts |
| --- | --- | --- |
| [01 invoice discount](tasks/01-invoice-discount/source/TASK.md) | Related files | Carry optional discounts through validation, per-line cent rounding and JSON export; retain old shape and validation. |
| [02 CLI limit](tasks/02-cli-limit/source/TASK.md) | Related files | Parse and apply a limit after tag filtering in both render formats; preserve filtering, order, errors and inputs. |
| [03 wallet cancellation](tasks/03-wallet-cancel/source/TASK.md) | State sequences | Reserve, observe persisted state, cancel, reopen, repeat and commit; refund one hold while preserving other holds and accounting. |
| [04 invite redemption](tasks/04-invite-redeem/source/TASK.md) | State sequences | Create, reject without consuming, redeem, reopen, reject replay and revoke; preserve team membership, other tokens and idempotency. |
| [05 query arrays](tasks/05-query-arrays/source/TASK.md) | Compatible behavior | Add repeated query values and deletion; preserve scalar rules, unrelated repeated keys, path, fragment and encoding. |
| [06 once events](tasks/06-events-once/source/TASK.md) | Compatible behavior | Remove once registrations before recursive or throwing callbacks; preserve ordinary listeners, snapshots, order and unsubscription. |
| [07 config merge](tasks/07-config-merge/source/TASK.md) | Diagnosis | Repair shared input mutation and recursive merge; preserve null/undefined and array replacement while eliminating input aliases. |
| [08 option normalizer](tasks/08-options-refactor/source/TASK.md) | Refactor | Share one exported normalizer between two entrypoints; retain defaults, values, exceptions and input immutability. |

Task 08 intentionally passes its original behavioral tests at baseline. Its
separate, public structural requirement is tested by replacing every exported
normalizer function in a fresh process and observing delegation from both
entrypoints. No helper name or reference diff is required.

## Independent scoring and isolation

`evaluate.mjs` applies the complete delivered patch to a new baseline without
editing it or removing author tests. Delivered patches are scored in a separate
offline container; the fast verification path is limited to repository-owned
model-free controls. The shared container session optionally mounts the judge at
`/judge` read-only **only in evaluation containers**, after the author has stopped.
The read-only property is checked by actual failed writes. Public checks are
ordinary `npm test`; private evaluation never invokes that mutable script.

The author receives neither the harness repository/history nor acceptance,
gold, wrong-control artifacts or evaluation output. Its mounts are the allowlisted
public input, installed binary, relay and native bundle. The scripted author
checks that `/judge` and reference files are absent and that Git contains exactly
one public baseline commit. Outgoing requests are checked for private obligation
identities. Native child tool inventories also confirm no recursive task or
experimental helper tools. `.gitignore` is not the isolation boundary.

The independent reporter consumes real node:test events with stable obligation
IDs, ignoring console/TAP text. It requires every named obligation exactly once,
a matching complete summary, a known process exit and no launch error, signal,
timeout, cancellation, skipped or todo obligation. Missing or contradictory
evidence is `unproven`, never PASS. Adding or reordering ordinary public tests
cannot shift acceptance identities.

`R` means the independent checks passed. `delivery` separately requires normal
native completion, confirmed provider terminal responses and forwarding, a
roundtrip-verified applicable full patch, native child termination, external
workload termination and completed container cleanup. `Q = R AND delivery`.
Each author stage is bound to its persisted OpenCode assistant message, normal
`stop` completion and the captured worktree; verified process stopping alone is
insufficient. Aborted or missing author stages fail delivery.
Internal status and correction count remain separate; `incomplete` alone does
not determine R or delivery. Unknown completion or grading never gives Q=true.

The thin adapter reuses `evaluation/support/native-run.mjs`, container session
and relay, deadline/stop modules, input manifest/comparison, scheduler, full
provider recording/accounting, private result writing and
`evaluation/polybench/capture.mjs`. The only shared extensions are an optional
read-only judge mount and validation of the explicit eight-pair schedule;
defaults and historical campaign branches remain unchanged. No product prompt,
default strategy, correction limit, cancellation policy or official evaluator
changes are included.

## Once-only development execution

The [frozen manifest](frozen-manifest.json) pins task/source/public-test,
acceptance, gold, wrong-control, configuration, adapter and native runtime bytes,
and the exact order of sixteen once-only assignments. All eight present
HARNESS experimental interventions are explicitly zero; inherited HARNESS_* and
OPENCODE_* are removed from host subprocess environments. Container execution
receives only the deliberate configuration. Both modes allow the bootstrap task;
the existing native child denies task recursion.

Order by task number: **direct,D; D,direct; direct,D; D,direct; direct,D; D,direct;
direct,D; D,direct**. Execution is sequential, one attempt per task and mode,
with no replacement, replay-to-success, added continuation or automatic candidate.
The 600 seconds includes OpenCode startup, title/author requests, tools, public
checks and all native D corrections. Input/container preparation, independent
evaluation and cleanup have separate timing fields.

The preparatory manifest leaves model/environment unset. A real execution freeze
requires fresh contained preflight and installed scripted/stop receipts from
one immutable image and unchanged bundle. Public gold checks run in that same
image. Commit the adapter and this protocol before preparing the private batch:

```sh
node evaluation/feedback-development/prepare.mjs \
  --output "$PWD/local/feedback-development-run-v1/batch" \
  --model openai/gpt-5.6-luna --variant high \
  --toolchain /absolute/path/to/toolchain \
  --bundle /absolute/path/to/bundle --image sha256:EXPLICIT_IMAGE_ID \
  --preflight /absolute/path/to/preflight.json \
  --installed /absolute/path/to/installed.json \
  --deadline /absolute/path/to/deadline-controls.json \
  --authorize-model-runs
```

Preparation still makes no provider call and reads no credentials. Copy the
generated safe `execution-manifest.json` to `evidence/execution-freeze.json` and
commit it before the first request. Keep `freeze.json` and all private paths and
recordings outside Git. Launch only with the same immutable `EVALUATION_IMAGE`:

```sh
node evaluation/feedback-development/run.mjs \
  "$PWD/local/feedback-development-run-v1/batch" --authorize-model-runs
```

Admission checks the committed seal, exact source bytes, public inputs, installed
runtime/bundle, configuration and order before credential access. Missing
scripted transport never falls back to real fetch; fixtures cannot select real
transport. A persisted admission marker forbids another campaign invocation,
including copied batches and already-started slots. The first real request must
belong to slot 1; there are no separate availability probes. Existing OAuth and
the shared scheduler/recorder/relay/native runner own all requests and stopping.
Technical admission stops preserve partial evidence and leave the remaining
slots not_started; they require a new user instruction, never automatic repair.

`report.mjs` stores every R/delivery/Q, original internal status, correction
count, requests, tokens, execution/preparation/evaluation/cleanup times,
environment errors and unknowns. Pair reporting gives candidate wins/losses/ties
and delta Q only after all eight pairs have outcomes. Missing pairs remain
unknown. Individual tests are obligations within a task, never independent
tasks. Monetary cost is always `unknown` without reliable billing. Fixture usage
is synthetic and must not be interpreted as model tokens or measured efficiency.
Missing usage leaves total token fields unknown; the known portion is reported
separately. Missing or duplicate task outcomes never complete a pair.

The [acceptance repair report](evidence/ACCEPTANCE_FIX.md) records two real false
successes on the original preparation head and the corrected controls. Invoice
items and exported lines have independently specified values, including discount
presence and omission. The multi-hold refund and accounting obligation belongs
to feature; the existing preservation obligations are unchanged.

To reproduce the original false successes, export commit
`f01ac872987d822e718ce4ef61e7ea43326e6f8d` into a fresh temporary checkout, then use
that checkout's `evaluate.mjs` with each retained additional patch and an explicit
immutable `EVALUATION_IMAGE` and absolute toolchain. The original source, public
tests and judge must remain unchanged. The ordinary `evaluate.mjs TASK_ID
ABS_PATCH ABS_OUTPUT ABS_TOOLCHAIN` interface runs the real independent reporter;
preflight on the current checkout must reject both patches with completed FAIL
results. No provider is needed for either reproduction.

See [the original stage-2 report](evidence/MODEL_FREE.md) for historical results on
the initial preparation. Its receipt does not verify the corrected acceptance;
the repair report and receipt record the new checks separately. The preparatory
manifest is refreshed before any real runs, with the same campaign, sixteen-row
order and 600-second budget. Ordinary verification and CI remain model-free.
