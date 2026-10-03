# OpenCode Harness

Native OpenCode instructions and an opt-in task workflow for developers changing
Git projects. The task workflow executes in an isolated worktree, preserves the
user checkout and index, and delivers a patch with observed checks and explicit
incomplete/unknown outcomes. It does not certify task correctness.

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

## Evidence-backed core: development candidate rejected

The fresh six-task screening evaluated Plain P, unchanged core C0 from
`358cb0a3`, and H1 from `8253fa1c` using OpenCode 1.18.26,
`openai/gpt-5.6-luna`, high, and the same 1,800-second total budget. H1 added a
same-call observation of a changed configuration member and a needed retained
member before choosing a new representation.

| Mode | Official R | Autonomous delivery | D = R ∧ delivery | Requests | Input / output | Agent execution |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Plain P | 4/6 | 6/6 | 4/6 | 163 | 7,883,167 / 44,131 | 2,687.946 s |
| Unchanged C0 | 3/6 | 6/6 | 3/6 | 162 | 8,117,132 / 46,846 | 2,700.663 s |
| Candidate H1 | 3/6 | 6/6 | 3/6 | 221 | 13,668,992 / 68,959 | 4,452.398 s |

H1 did not exceed either control. The sole H1/P difference has identical
production patches and shifted official TAP test identities. H1/P D delta is
−16.7 pp, descriptive 95% interval [−69.13, +51.62] pp. All 18 captures and
official evaluations completed; three submissions were officially rejected.
All 546 requests have usage; money is unknown. H1 used 65.6% more execution
time and 73.4% more input than P. This known development set is not independent
confirmation and establishes neither advantage nor equivalence.

**The quality goal was not achieved.** H1 was removed from active instructions;
its full diff and all results are retained. The result-grounded H2 proposal did
not justify a new distinguishing public action, so H2 was not implemented or
run. No candidate qualified for the 30-task confirmation; it was not started.
See the [report](evaluation/polybench/campaigns/evidence-backed-core-development-v1/REPORT.md),
[complete data](evaluation/polybench/campaigns/evidence-backed-core-development-v1/results.json)
and [expenses](evaluation/polybench/campaigns/evidence-backed-core-development-v1/costs.json).

Official figures remain unchanged. A [reproducible TAP identity diagnostic](evaluation/polybench/TAP_IDENTITY.md)
confirms ordinal-dependent comparison in this Three.js QUnit path and ambiguous
duplicate identities. This is a measurement limitation, not demonstrated lift.

## A. Historical candidate 39def2ed: nine tasks

The stopped consolidated-v1 ran 27 of 60 slots: nine tasks in all three modes.
Three tasks were preparation exclusions; a pre-model adapter failure at original
slot 31 closed admission. Its 33 not_started records, freeze and pause remain
unchanged. The separate campaign below does not replace those historical rows.

| Mode | Resolved / evaluated | Rate | Autonomous deliveries | Agent execution | Input / output tokens | Unknown / evaluator / infrastructure |
| --- | --- | --- | --- | --- | --- | --- |
| Plain (P) | 2 / 9 | 22.2% | 9 / 9 (100%) | 4472.004 s | 13,213,483 / 92,731 | 11 not started; 1 official patch rejection |
| Native core (C) | 3 / 9 | 33.3% | 9 / 9 (100%) | 4240.290 s | 12,497,925 / 84,682 | 11 not started; 1 official patch rejection |
| Task + investigator (T) | 2 / 9 | 22.2% | 7 / 9 (77.8%) | 6425.786 s | 18,369,635 / 87,790 | 11 not started; 2 official patch rejections; 2 captured empty partial artifacts |

T/P had one win, one loss and seven ties: delta 0 pp, paired 95% interval
−33.3 to +33.3 pp, exact McNemar p=1.0. C/P was +11.1 pp, a secondary observation.
T used 43.7% more execution time and 39.0% more input tokens than P. All 849
requests had usage; money is unknown. Candidate `39def2ed` ran only these nine
tasks. See its [report](evaluation/polybench/campaigns/consolidated-v1/REPORT.md)
for the exact stop, rejections, time boundaries and limitations.

## B. Candidate f83b101b: remaining eight tasks

All 24 once-only P/C/T assignments completed and were officially evaluated,
without a new admission stop, retry, replacement or real availability probe.
Product lib/, profiles, prompts and runtime were unchanged during measurement.

| Mode | Official R | Delivery | D = R ∧ delivery | Execution | Input / output tokens | Requests |
| --- | --- | --- | --- | --- | --- | --- |
| Plain (P) | 3/8 (37.5%) | 8/8 | 3/8 | 3,216.568 s | 10,823,226 / 58,317 | 204 |
| Native core (C) | 2/8 (25.0%) | 8/8 | 2/8 | 4,220.026 s | 10,321,319 / 65,412 | 220 |
| Task + investigator (T) | 3/8 (37.5%) | 7/8 | 3/8 | 7,509.009 s | 15,264,202 / 81,411 | 279 |

Primary T/P: one win, one loss, six ties; **0 pp**, paired 95% interval
**−37.5 to +37.5 pp**, exact McNemar p=1.0. C/P: zero wins, one loss, seven ties;
−12.5 pp (interval −37.5 to 0 pp). Core did not improve R on this fixed remainder.
T provided the same three full correct deliveries as P, with 133.4% more execution
time and 41.0% more input tokens. Its additional expense did not buy an observed
gain. Small samples establish neither sustained advantage nor equivalence.

There was one real investigator and one accepted nonempty test patch in one
file; two other preparations stopped on snapshot/dependency-copy bounds before
child model work. Seven T deliveries had internal `incomplete` check status;
one code-server T hit the hard deadline and yielded a captured nonempty partial.
All 703 requests have known usage; total input/output are 36,408,747 / 205,140
with cached/reasoning included as subsets, and monetary charge unknown.
OpenCode 1.18.26, openai/gpt-5.6-luna, high; official evaluator unchanged.

This is eight tasks on `f83b101b`, separate from nine on `39def2ed` above.
Together they cover 17 original eligible tasks, without a pooled score or a
claim that f83b101b ran on 17 tasks. See the
[new report](evaluation/polybench/campaigns/consolidated-remaining-v1/REPORT.md)
for exact M, official rejections/no-tests outcome, paired sensitivity,
preparation/execution/capture/cleanup accounting and provenance.

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
