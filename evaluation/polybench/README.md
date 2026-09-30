# SWE-PolyBench adapter

The maintained evaluation path uses the official SWE-PolyBench evaluator at
`9c836c5d7f3cb991934132b77d29e6941d912a07` and Verified dataset revision
`b3fca77b637379f0c01ad86d18753a7ac1998b53`. `resolved` is the primary score.
Preparation reuses the existing ten metadata-selected tasks and cyclic P/H0/H1
allocation; it does not choose new tasks or resume the stopped historical pilot.
[Historical results](../../docs/RESULTS.md) are separate from a new run.

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
