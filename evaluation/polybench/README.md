# SWE-PolyBench adapter

The maintained evaluation path uses the official SWE-PolyBench evaluator at
`9c836c5d7f3cb991934132b77d29e6941d912a07` and Verified dataset revision
`b3fca77b637379f0c01ad86d18753a7ac1998b53`. `resolved` is the primary score.
Preparation reuses the existing ten metadata-selected tasks and cyclic P/H0/H1
allocation; it does not choose new tasks or resume the stopped historical pilot.
[Historical results](../../docs/RESULTS.md) are separate from a new run.

The explicitly selected [TAP identity diagnostic](TAP_IDENTITY.md) replays one
saved Three.js case and public model-free controls in a separate patched copy.
It preserves official files, scoring and integrity checks. Rendered-name
collisions keep the complete case ambiguous; it cannot select a new candidate.

## Interface

Run from the repository root. Node 24, Python 3.12+, npm, Git, Docker with
Linux ARM64 support and x86_64 emulation are required for full preparation.
Official project images are x86_64; the preserved diagnostic toolchain is ARM64.
The native product itself does not require Docker or a specific model.

```sh
npm run verify:evaluation
npm run polybench:prepare -- --plan
# Model choice is explicit. Preparation itself makes no provider request.
export POLYBENCH_MODEL=openai/YOUR_MODEL
export POLYBENCH_VARIANT=YOUR_VARIANT
python3 evaluation/polybench/prepare.py --full
node evaluation/polybench/freeze.mjs
```

Full preparation downloads the pinned dataset/evaluator and public dependencies,
runs official gold/baseline controls and scripted local sessions, builds a local
diagnostic image, isolates author inputs, and writes a new `local/polybench/`
preparation. It needs substantial disk space and Docker access. Do not run it in
ordinary CI. Partial preparations remain inspectable and are never silently
replaced. The `--plan` and ordinary regression checks are model-free and need
neither model credentials nor downloaded gold data.

After separately authorizing a frozen run, inspect `local/polybench/batch/manifest.json`:

```sh
npm run polybench:run -- local/polybench/batch --authorize-model-runs
npm run polybench:evaluate
npm run polybench:summary
```

Only explicit model admission reads the existing OpenCode OpenAI OAuth record.
This adapter's transport currently supports that OpenAI Responses path; it is
not a universal provider framework. Model and variant come from the explicit
preparation settings, not a hard-coded Luna default. No retries, stopped-batch
resume, task replacements or automatic paid preflight are supported.

All arms share public inputs, toolchain, deadline and offline environment. P has
no harness instructions/plugin; H0 uses direct task delivery; H1 additionally
opts into TYPE_COMPAT. Official evaluator patch order, parser and scoring are
preserved. Input gold/test patches remain outside author mounts. The container
uses network none, read-only mounts/root, dropped capabilities and resource
limits. Verify actual containment with `verify-container.mjs` after preparation.

Captured patch bytes are exported unchanged. Unstarted slots, missing captures,
unknown server completion and unknown usage stay unknown. Strict patch
applicability and autonomous delivery are separate diagnostics, not replacement
scores. Cached/reasoning tokens are subsets; no exact price is inferred.
Raw requests and receipts are private under `local/` and must not be published.

The scripts moved from the stopped pilot and common development helpers. Clean
model-free checks validate the migrated configuration/export/reader; they do not
prove a fresh full Docker preparation, official evaluation or new model quality.
The full preparation and paid run require their own recorded validation later.

## Input preparation bounds

Before future model admission, every ready task's actual isolated `/work/repo`
must pass a model-free manifest comparison and task Git capture. The shared
Plain/Core/Task scripted demonstration alone does not establish input readiness.
The launcher checks all ready inputs before the first slot; each slot still
rechecks its actual container immediately before starting the native phase.
Frozen runtime/dependency checks and the admission pause remain enforced.

The actual manifest streams to an owned private file, with a small producer
completion record bound to the immutable container ID, session, unique export
and `/work/repo`. Completion, byte count, SHA-256, full JSON read and entry count
must agree before comparison. All paths, hashes, executable modes and symlink
targets are compared, including dependency directories. No model-supplied export
path is accepted. The ordinary `session.exec` retains its 32 MiB stdout limit.

An export is bounded to **128 MiB**, **500,000 entries** and **120 seconds**.
Producer errors, partial/corrupt bytes, cancellation and exceeded bounds prevent
model admission. Cancellation targets only the identified producer. These limits
bound service artifacts; their sizes do not estimate model tokens.

Synthetic regression commands (no provider calls, no benchmark tasks):

```sh
node scripts/verify-large-git.mjs --expect-original-failure
node scripts/verify-large-git.mjs
# EVALUATION_IMAGE must be an immutable fixture image built from
# evaluation/support/Dockerfile, as in the existing container CI job.
node evaluation/support/verify-large-input.mjs --expect-original-failure
node evaluation/support/verify-large-input.mjs
NATIVE_TASK_FIXTURE_LARGE_GIT=1 NATIVE_TASK_FIXTURE_DIRECT=1 \
  NATIVE_TASK_FIXTURE_MODES=missing-read \
  OPENCODE_BIN=/absolute/path/to/opencode node scripts/verify-native-task-fixture.mjs
```

The RED checks load only the original affected module bytes from commit
`25a446eaa7d5cb5c5776ab30d45ca338eb9ad581`; that commit must exist locally.
Fixtures are generated in owned temporary directories and removed afterward.
The Git regressions cover 2,579,497 and 2,534,961 bytes, tail index flags and exact
small patch export. The container regression covers 204,292 entries and a
48,416,621-byte manifest, independently expected values, changed/deleted/added
tail entries, executable/symlink changes, corruption, cancellation and bounds.
The installed fixture applies the ordinary terminal patch to a Git clone and
runs its project check while preserving user staged/unstaged/untracked state.
These are technical results for the corrected product/adapter. The stopped
consolidated-v1 scores, predictions, costs, freeze and pause remain historical
and unchanged; no new model quality result is inferred.

## Sources

[Official evaluator](https://github.com/amazon-science/SWE-PolyBench),
[Verified dataset](https://huggingface.co/datasets/AmazonScience/SWE-PolyBench_Verified).
Rashid et al., *SWE-PolyBench: A multi-language benchmark for repository level
evaluation of coding agents* (2025). Dataset card declares MIT. The original
[license](UPSTREAM-LICENSE) is retained; upstream source headers also declare
CC-BY-NC-4.0. The adapter does not alter upstream licensing or claim leaderboard
submission status.

## Consolidated candidate campaign

The separate [plan](campaigns/consolidated-v1/PLAN.md) fixes 20 new JS/TS tasks,
P/C/T allocation and analysis before technical preparation. It excludes the ten
pilot selections and their indexed subsequent case studies. The historical
`selection.json`, pilot results and stopped-batch state are not rewritten.

The existing preparation scripts accept the campaign paths via an environment
variable inherited by child processes:

```sh
export POLYBENCH_CAMPAIGN=evaluation/polybench/campaigns/consolidated-v1/campaign.json
export POLYBENCH_MODEL=openai/gpt-5.6-luna
export POLYBENCH_VARIANT=high
python3 evaluation/polybench/prepare.py --plan
# Use Python 3.12 for the pinned numpy/scikit-learn wheels.
python3.12 evaluation/polybench/prepare.py --full
```

Private data goes to `local/polybench-consolidated/`. Selection is a separate,
exclusive-create step (`selection.py --campaign "$POLYBENCH_CAMPAIGN"`) and must
already be committed before preparation. Never recreate a selected list to
replace an inconvenient instance. `remaining_controls.py` and
`prepare_authors.py` retain per-instance failures; all three arms receive the
same disposition. An uninspected partial preparation is an error, not a retry.

P uses ordinary build with native tools. C mounts the materialized core
instructions without task/review. T uses the materialized task command with
direct strategy and investigator enabled; the other declared optional features
are disabled. The product is extracted from the configured product commit,
independently of the evaluation adapter commit. Preparing OpenCode startup
files/dependencies for read-only mounts does not change product instructions.

Before admission, complete the short scripted P/C/T check, official export
control, container/capture checks and recorder check. Freeze verifies every
selected task's preparation disposition, exact installed hashes and evaluator
integrity including extra/ignored source files. Commit its public
`frozen-manifest.json` byte-for-byte before the existing `run.mjs` accepts model
admission. A new campaign name never authorizes resuming a stopped campaign.
The run uses the existing scheduler, transport, recorder and stop rules.
