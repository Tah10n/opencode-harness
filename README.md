# OpenCode Harness

Native OpenCode instructions and an opt-in task workflow for developers changing
Git projects. The task workflow executes in an isolated worktree, preserves the
user checkout and index, and delivers a patch with observed checks and explicit
incomplete/unknown outcomes. It does not certify task correctness.

## Consolidated candidate: partial comparison, admission closed

**27 of 60 assigned slots ran: nine identical tasks in each mode.** Three tasks
were excluded during preparation (nine not-started slots). A new adapter error
before slot 31's first model request stopped the batch; 24 other eligible slots
remain not started. There were no replacements, retries or continuation.

| Mode | Resolved / evaluated | Rate | Autonomous deliveries | Agent execution | Input / output tokens | Unknown / evaluator / infrastructure |
| --- | --- | --- | --- | --- | --- | --- |
| Plain (P) | 2 / 9 | 22.2% | 9 / 9 (100%) | 4472.004 s | 13,213,483 / 92,731 | 11 not started; 1 official patch rejection |
| Native core (C) | 3 / 9 | 33.3% | 9 / 9 (100%) | 4240.290 s | 12,497,925 / 84,682 | 11 not started; 1 official patch rejection |
| Task + investigator (T) | 2 / 9 | 22.2% | 7 / 9 (77.8%) | 6425.786 s | 18,369,635 / 87,790 | 11 not started; 2 official patch rejections; 2 captured empty partial artifacts |

The primary T/P comparison has one win, one loss and seven ties: difference
**0.0 percentage points**, paired 95% interval **−33.3 to +33.3 pp**, exact
McNemar p=1.0. C/P is +11.1 pp (interval 0.0 to +33.3 pp), one win and no losses,
an exploratory secondary observation. This small stopped sample establishes
neither a general advantage nor equivalence. T used 43.7% more execution time
and 39.0% more input tokens than P, including all child and parent work.

Candidate: `39def2ed0b1476299b104b38f8c93747d828a87a`. Actual runtime:
OpenCode 1.18.26, `openai/gpt-5.6-luna`, high. Dataset revision:
`b3fca77b637379f0c01ad86d18753a7ac1998b53`; official evaluator revision:
`9c836c5d7f3cb991934132b77d29e6941d912a07`. The fixed selection contains
10 JavaScript and 10 TypeScript tasks, in deterministic hash order with fixed
category quotas, at most four per repository, excluding ten historical pilot
IDs. Observed coverage is narrower: seven JS and two TS tasks from four repos.

Each eligible slot had the same 1800-second execution budget (51 eligible slots;
25.5 assigned hours). Preliminary host preparation preceded the unchanged timer;
OpenCode startup, parent/title, author, investigator and its preparation, project
commands, inspect and delivery all consumed it. Capture/cleanup are recorded
separately. Actual batch wall time was 19,336.954 s; observed slot preparation,
execution and capture/cleanup do not cover another 3768.986 s of batch overhead.
All 849 requests have usage: 44,081,043 input and 265,203 output tokens.
Monetary charge is unknown. Eleven tasks per mode remain unobserved, including
three preparation exclusions; they are not model failures. All 27 exact patches
have official outcomes; no evaluator errors or unknown quality among started
attempts. Autonomous delivery is an operational metric, not correctness; all
seven delivered T workflows reported their own check status as `incomplete`.

See the [full report](evaluation/polybench/campaigns/consolidated-v1/REPORT.md),
including per-slot time boundaries, expenses, artifact hashes and the exact stop.
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
