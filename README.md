# OpenCode Harness

Native OpenCode instructions and an opt-in task workflow for developers changing
Git projects. The task workflow executes in an isolated worktree, preserves the
user checkout and index, and delivers a patch with observed checks and explicit
incomplete/unknown outcomes. It does not certify task correctness.

## Consolidated candidate: measurement not started

The fixed SWE-PolyBench Verified comparison is prepared for **17 of 20 selected
JS/TS tasks**. Three tasks have preparation errors shared by all modes. All 60
assigned slots remain not started at this preparation checkpoint. The time-budget
boundary was clarified on 2026-09-30; final freeze precedes model admission.

| Mode | Resolved / evaluated | Rate | Autonomous deliveries | Inference time | Input / output tokens | Unknown / evaluator / infrastructure |
| --- | --- | --- | --- | --- | --- | --- |
| Plain | 0 / 0 (not run) | — | No attempts | 0 s | No requests | 20 unobserved; evaluator not run; 3 preparation errors |
| Native core | 0 / 0 (not run) | — | No attempts | 0 s | No requests | 20 unobserved; evaluator not run; 3 preparation errors |
| Task + investigator | 0 / 0 (not run) | — | No attempts | 0 s | No requests | 20 unobserved; evaluator not run; 3 preparation errors |

Candidate: `39def2ed0b1476299b104b38f8c93747d828a87a`. Planned runtime:
OpenCode 1.18.26, `openai/gpt-5.6-luna`, high. Dataset revision:
`b3fca77b637379f0c01ad86d18753a7ac1998b53`; official evaluator revision:
`9c836c5d7f3cb991934132b77d29e6941d912a07`. Selection: 10 JavaScript and 10
TypeScript tasks, deterministic hash order, fixed category quotas, at most four
per repository, excluding the ten historical pilot tasks. Requested ceiling:
60 attempts × 1800 s = 30 hours of assigned task time; 51 slots are technically
eligible. There have been no real model requests or monetary-cost estimates.

**Quality remains unmeasured.** The current scheduler includes native bootstrap
and parent/title/child work in its shared task clock, while container preparation
precedes it as separately accounted technical preparation, as confirmed by the
user on 2026-09-30. The deadline mechanism is unchanged. See the
[full report and per-task preparation results](evaluation/polybench/campaigns/consolidated-v1/REPORT.md).
The historical pilot remains separate.

## Quick start

Use Node.js 24+, Git, npm and OpenCode **1.18.26**. From a clean clone:

```sh
git clone https://github.com/Tah10n/opencode-harness.git
cd opencode-harness
npm ci --ignore-scripts
npm run profile:materialize -- --native --profile core --output "$PWD/../harness-native"
```

The output directory must not exist; its parent must exist. The materializer
refuses collisions and does not edit your project or global OpenCode settings.
Run in your own project:

```sh
OPENCODE_CONFIG_DIR="/absolute/path/to/harness-native" opencode --model PROVIDER/MODEL
```

Choose the model and reasoning variant in OpenCode. No model, subscription or
experimental Luna configuration is required by the product. The basic bundle
contains only instructions and a config file, with no plugin or provider calls.

## Additional commands

To install the same native path with experimental task delivery and diagnostic
review, choose a fresh output directory and add `--task --review`:

```sh
npm run profile:materialize -- --native --profile core --task --review --output "$PWD/../harness-task"
npm install --ignore-scripts --no-audit --no-fund --prefix "$PWD/../harness-task"
```

In your project, set `OPENCODE_CONFIG_DIR` to that absolute directory and
`HARNESS_TASK_FILE` to an absolute UTF-8 task file. Open OpenCode with your model
and invoke `/harness-task` with no arguments. Inspect its result and patch before
applying it. Diagnostic `/harness-review` is read-only and requires an explicit
base and task; see [usage](docs/USAGE.md).

**Current status:** the native mechanisms have regression and local-provider
fixtures. Task delivery and additional diagnostics remain experimental. Existing
benchmarks do **not** establish a sustained quality advantage. Technical checks,
benchmark scores and development examples are reported separately in
[status](docs/STATUS.md) and [results](docs/RESULTS.md).

## Development and evaluation

```sh
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix profiles/native/sensitivity
npm run verify
OPENCODE_BIN=/absolute/path/to/opencode npm run verify:installed
```

These commands use deterministic or loopback providers and do not run paid
inference. [SWE-PolyBench](evaluation/polybench/README.md) is the maintained
external evaluation adapter; model execution requires separate explicit
permission. Historical generations and campaigns are indexed in
[archive and migration notes](docs/ARCHIVE.md).

Work in a short branch from `main`, open a checked PR, merge, then delete the
branch. Research outcomes belong in results, not permanent development branches.
