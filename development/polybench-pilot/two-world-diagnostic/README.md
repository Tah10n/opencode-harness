# Full delivery and independent acceptance

This development-only, post-hoc diagnostic separates a complete historical
patch's public/author checks (F) from unchanged PolyBench test acceptance on
an independently restored assessment surface (E). See [PLAN.md](PLAN.md) and
the two instance manifests. The plan/manifests were committed at `35939cc5`
before evaluating any P/H0/H1 patch. This is not official PolyBench scoring,
a new model comparison, or a repair of historical outputs.

From the existing `feat/native-task-workflow` worktree, one shell command:

```sh
local/polybench-pilot/venv/bin/python development/polybench-pilot/two-world-diagnostic/driver.py calibrate --out local/polybench-pilot/two-world-reproduction-calibration && local/polybench-pilot/venv/bin/python development/polybench-pilot/two-world-diagnostic/driver.py evaluate --calibration local/polybench-pilot/two-world-reproduction-calibration --out local/polybench-pilot/two-world-reproduction-six
```

Both output paths must be absent. Prerequisites: retained Python 3.12 pilot venv,
two original per-instance CSVs, historical patches/predictions, local freeze/pause
files, pinned upstream checkout at `local/polybench-pilot/patch-contract-sources/evaluator`
(`9c836c5d`), Docker Desktop (or DOCKER_HOST), and the two exact manifest images.
No install, image build, implicit pull or provider access occurs. The original
`run_evaluation.py` is not invoked and upstream files are not edited. Reproduction
refuses changed driver/manifests between calibration and evaluation. `freeze`
is a development bootstrap operation, not part of reproduction; it refuses to
overwrite existing manifests.

Each source F is the strict Git-index result of B+M, preserved as a Git tree and
in-memory archive. Execution consumes a disposable copy in a fresh container.
E is copied from that complete F archive, then the declared paths are deleted
and exactly restored from S=B+T, including modes and absence. Every source path
outside the surface must still match F. All source symlinks are unsupported.
Manifests fix helpers, discovery and setup: one explicit Serverless test;
Svelte's test/ plus mocha.opts. New author files inside the region are removed
only from E. Outside-region src/**/__test__.js additions or execution-config
changes are rejected instead of being silently used. Serverless's explicit
command does not discover unrelated test files; its preserved delivery checks
are intentionally scoped to mergeIamTemplates.

Svelte package.json/yarn.lock and Serverless Dockerfile from the original image
are separate, hash-pinned execution overlays, installed only after comparing
source trees. Any M intersection is unsupported. Package/build settings are
validated against B, never restored over M. Installed dependencies remain from
the exact image, with no installs. Svelte compiler, SSR, shared, store UMD and
generated shared declarations are removed before the original npm pretest
recipe rebuilds them. Recorded source/build hashes and exact module resolution
bind tests to this fresh tree; no gold checkout, shared build directory or
persistent require cache is available.

Official test_command, parser class and F2P/P2P scoring are reused. The parser
receives the upstream-compatible `Container exited with status code:` envelope;
raw stdout/stderr are preserved separately. Tests run with a 1200-second process
limit, 8 GiB, four CPUs, 1024 PIDs, network none, dropped capabilities and
no-new-privileges. There are no mounts. Only this stage's containers are removed.

The runner writes diagnostic `_actual.*` and sourcemap `output.*`; these are
outputs, not auto-accepted expectations. Assertions, expected files, fixtures and
setup are checked unchanged after execution. No snapshot-update option is used.
The Svelte command's existing lint=noop setting is retained and is not a lint
pass. Its original 53 pending tests are reported in runner_stats and are not
counted as executed passes/failures. Test-level timeouts are reported separately from the outer process timeout.
Nondecisive historical failures can coexist with acceptance_diag=true; F still
fails its executed suite in that case. Parser failures, missing decisive tests,
build/load errors and integrity failures have unknown acceptance.

Calibration includes real baseline, exact gold, and both with a local author
removal of an existing overlapping test file. E must restore the original
independent tests in both controls. Small preparation checks reject an
outside-surface production rollback and an import into /gold. A binary snapshot
control covers deleted author tests: tar stderr stays separate from its archive,
all remaining files must be present, and unrelated read errors are rejected. These are driver
controls, not new benchmark assertions or tasks. See the report for attempts,
results, timing and the limits of these controls.

Raw logs and source inventories stay under ignored local/. Published evidence
contains safe test names/failure excerpts, command/status records and hashes,
not copies of projects, old patches, dependencies or private provider streams.
Historical R/T/D, official outputs, runtime and the twelve not_started slots
remain unchanged. No next campaign is scheduled.

After reproducing, export safe evidence to a new directory with `publish.py
--calibration <calibration-dir> --evaluation <six-dir> --out <new-dir>`.
The checked-in result is validated without re-running suites by:

```sh
local/polybench-pilot/venv/bin/python development/polybench-pilot/two-world-diagnostic/verify.py
```

This verifies current historical/input hashes, six-row completeness, original
F2P/P2P arithmetic, source/import/expectation checks, calibration controls and
container accounting. It is a local diagnostic check, not aggregate/platform CI.
