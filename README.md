# OpenCode Harness

A minimal instruction/config bundle for using OpenCode's native tools to change
Git projects. The main installation contains exactly `core.md` and
`opencode.json`, with no plugin or custom runtime. Experimental task delivery
adds an isolated worktree and a saved patch with observed checks and explicit
incomplete/unknown outcomes. Diagnostic review is another explicit opt-in.

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
OpenCode [merges configuration sources](https://dev.opencode.ai/docs/config/):
`OPENCODE_CONFIG_DIR` adds a directory and does not isolate global/project
settings. [Usage](docs/USAGE.md#installation-and-upgrades) covers upgrades.

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

## Reading a task result

The result starts with the saved patch or its unavailability, followed by actual
command exits, snapshot freshness, unresolved work and limitations. An
`incomplete` run can retain a terminal patch and commands that exited 0. A saved
patch is an artifact to inspect; it does not establish task completeness.
Unsupported runner interpretation remains unverified even after a successful
command. Cancellation, deadlines and unconfirmed native tool termination are
shown explicitly. The result links to `result.json`, `tool-events.json` and the
retained delivery worktree. [Usage](docs/USAGE.md#reading-and-applying-a-task-result)
explains review and manual application, including runs seeded with user changes.

## Evidence and limits

**A sustained solution-quality improvement over Plain is not established.**
The separate fixed development samples found direct and D at 8/8 each without
Plain ([v3 report](evaluation/feedback-development/evidence/development-run-v3/REPORT.md)),
and Plain/direct at 6/6 versus D at 5/6
([calibration report](evaluation/feedback-development/evidence/calibration-run-v1/REPORT.md)).
Native corrections were zero in both samples, so correction benefit/harm was
not measured. Samples are not pooled; these results establish neither
superiority nor equivalence, and they do not transfer to every selectable model.

The core development candidate was rejected and withdrawn; the active core
retains its original bytes. The
[results index](docs/RESULTS.md) links the core screening, separate stopped and
completed PolyBench campaigns, exact runtimes, costs, unknown outcomes and TAP
identity diagnostic. The [outbox diagnosis](evaluation/feedback-development/evidence/calibration-run-v1/DIAGNOSIS.md)
retains the failure of an incorrect author expectation despite green tests.
The [historical deadline FAIL](evaluation/feedback-development/evidence/calibration-run-v1/DEADLINE.md)
remains **UNRESOLVED**; later green CI does not explain it. The
[confirmation draft](evaluation/feedback-development/calibration/CONFIRMATION_DRAFT.md)
remains **NOT RUN** and authorizes no model attempts.

Use [status](docs/STATUS.md) for version-bound technical checks and
[archive](docs/ARCHIVE.md) for retired generations and recovery. Worktree
isolation and native permissions do not certify protection from arbitrary
hostile code. Task/review execution uses the selected model and may consume its
quota; installation and ordinary verification perform no paid inference.

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

Work in a short branch from `main` and open a checked PR. Merge, release and
branch deletion require authorization in the current assignment. Research
outcomes belong in the results index, not permanent development branches.
