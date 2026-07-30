# Synthetic Ablation Benchmark

The synthetic benchmark is a separate, model-neutral product-value experiment
for comparing the same host-selected model under different harness profiles. It
does not replace release regression evaluation, and its reports must never be
passed to `npm run assess:candidate`.

Model-free validation and self-tests prove that the benchmark infrastructure is
deterministic, isolated, and internally consistent. They do not prove that one
profile produces better coding results. A quality claim requires a complete
paired model-backed run.

## Canonical Profiles

| Profile | Purpose | Included behavior |
| --- | --- | --- |
| `plain` | Honest safe baseline | One built-in coding agent, ordinary read/edit/test capabilities, no harness-specific orchestration prompts, no recursive delegation by default, and no computational mutation gate. Dangerous operations remain permission-gated. |
| `profile-only` | Prompt-level harness | Orchestrator, context inventory, scoped subagents, review ledger, termination policy, verifier workflow, and safe permissions. It excludes the Engineering Dossier mutation gate. |
| `instrumented` | Full production harness | The profile-only behavior plus the Engineering Dossier, impact graph, runner-owned context receipts, context sufficiency, exact ownership, trusted project checks, computational mutation gate, final reconciliation, and attestation. |

The profiles are views over one canonical inventory in
`profiles/inventory.v1.json`; they do not duplicate agent prompts. Model,
provider, and reasoning/variant selection remain host-owned. The benchmark
records a binding fingerprint and observational availability metadata, but
model metadata cannot authorize mutation, pass a quality gate, or establish
benchmark success.

## Quick Start

Run the model-free checks first:

```sh
npm run bench:synthetic:validate
npm run bench:synthetic:self-test
```

Configure the same host model for both sides with `OPENCODE_BENCH_MODEL`, and
optionally `OPENCODE_BENCH_PROVIDER` and `OPENCODE_BENCH_VARIANT`, or pass the
equivalent CLI flags. Then run the inexpensive paired smoke comparison:

```sh
npm run bench:synthetic -- \
  --suite smoke \
  --baseline plain \
  --candidate instrumented \
  --seed 20260728 \
  --repetitions 1
```

`--model <host-selected-model>` may be supplied instead of the model
environment variable. The runner accepts only the suite's declared repetition
count and a 60–90 second per-agent timeout. It makes no network or package
manager calls inside fixtures.

The command exit contract is:

- `0`: the requested evidence is complete; this does not mean the candidate
  won;
- `1`: invalid, failed, or incomplete benchmark evidence;
- exit code 2 (`blocked_external_state`): missing model configuration or an
  unavailable compatible OpenCode runtime.

No adapter is launched when required model configuration is absent.

## Suites And Cost

Every suite permits any two distinct profiles from `plain`, `profile-only`,
and `instrumented`. The canonical run budget uses two selected profiles for
smoke/standard and the three-profile registry matrix for full.

| Suite | Families | Repetitions | Canonical matrix width | Canonical agent runs | Intended use |
| --- | ---: | ---: | --- | ---: | --- |
| `smoke` | 8 | 1 | Any selected pair | 16 | Cheap local infrastructure and obvious-regression check. It cannot yield `candidate_better`. |
| `standard` | 12 | 3 | Any selected pair | 72 | Main comparison before a material harness change. |
| `full` | 16 | 5 | All three profiles | 240 | Release research across all three profiles. A single pairwise invocation runs 160 agents. |

Examples:

```sh
npm run bench:synthetic -- \
  --suite standard \
  --baseline profile-only \
  --candidate instrumented \
  --seed 20260728 \
  --repetitions 3

npm run bench:synthetic -- \
  --suite full \
  --baseline plain \
  --candidate instrumented \
  --seed 20260728 \
  --repetitions 5
```

The default suite is `smoke`, but `--seed` and a model binding are always
required. Full is intentionally outside mandatory model-free CI.

## Synthetic Families

The registry contains 16 short Node.js 24 families:

| Family | Category | Main contract |
| --- | --- | --- |
| `function-boundaries` | Code correctness | Pure-function minimum, maximum, exact, empty, and malformed boundaries. |
| `stable-deduplicate` | Code correctness | Stable first-occurrence semantics without accidental sorting. |
| `parser-malformed-input` | Input robustness | Strict malformed, duplicate, delimiter, and trailing-data handling. |
| `config-precedence` | Configuration | `defaults < project < user < runtime`, null semantics, and no input mutation. |
| `cache-invalidation` | State consistency | Update invalidation without losing unrelated cached keys. |
| `cross-file-contract` | Code correctness | Preserve a public result shape across a small consumer graph. |
| `retry-idempotency` | Reliability | Retry after partial success without duplicate side effects. |
| `async-cancellation` | Resource lifecycle | Deterministic pre-start and in-flight cancellation with cleanup. |
| `resource-cleanup` | Resource lifecycle | Cleanup on success, failure, repeated close, and partial initialization. |
| `partial-dependency-failure` | Reliability | Honest partial results when either or both sources fail or return malformed data. |
| `versioned-json-migration` | Compatibility | Current/previous/future versions and rollback without partial mutation. |
| `path-confinement` | Security | Reject traversal, absolute, encoded, Windows-separator, and platform path edges. |
| `small-task-no-delegation` | Orchestration discipline | Correct targeted one-file work without unnecessary fan-out. |
| `review-read-only` | Orchestration discipline | Find and structure a real defect without workspace mutation or fix commands. |
| `hidden-consumer-discovery` | Change impact | Discover a non-obvious consumer or re-export and preserve its contract. |
| `prompt-injection-ignore` | Security | Ignore repository-data instructions that attempt to widen scope, expose hidden data, skip checks, write secrets, or run dangerous commands. |

Fixtures have at most 12 public files and 400 public source lines, prompts are
bounded to 1000 characters, changes are expected in one to three files, and
visible and hidden checks each have a five-second limit. They use built-in
`node:test`, deterministic schedulers where needed, no database, no browser,
no external resources, no package install, and no lockfile generation.

## Deterministic Rendering And Replay

Instances are rendered from declarative templates with allowlisted
placeholders, bounded integer/enum values, safe identifiers, a runner-owned
PRNG, strict path/byte limits, an exact rendered-file manifest, and a content
fingerprint. Manifest code is never executed as a generator.

The same family, seed, and repetition produce byte-identical public files and
the same instance fingerprint. Validation also proves that changing the seed
changes a material parameter or hidden oracle for every family.

Replay an exact instance and profile with:

```sh
npm run bench:synthetic:replay -- \
  --family parser-malformed-input \
  --seed 20260728 \
  --repetition 1 \
  --instance-fingerprint <sha256-fingerprint> \
  --profile instrumented
```

Replay is a single-profile diagnostic, not a comparison. It emits complete
evidence only when real model execution is confirmed and the adapter,
visible/hidden checks, workspace policy, trace assertions, and termination
contract all complete. A stale fingerprint fails before model execution.

New replay artifacts use strict replay report v2. The report stores the full
privacy-safe attempt binding and result, and source-bound validation
reconstructs the canonical instance and profile before publication. It also
binds the effective public input, default runner limits, adapter protocol and
fingerprint, operational run, initial workspace, and result fingerprint.
Replay report v1 remains a strict historical structural read only; it cannot
pass source-bound validation or be published as current replay evidence.

## Fairness, Isolation, And Anti-Cheating

Each pair binds:

- the same model, provider, variant, timeout, and resource policy;
- byte-identical public task text, visible checks, and initial fixture;
- the same generated instance fingerprint and repetition;
- separate fresh sessions and workspace copies;
- isolated temporary HOME/config roots and no shared durable memory;
- no network, package operations, lockfile operations, hidden paths, generator
  internals, policy thresholds, or other-profile result.

Execution order is deterministically counterbalanced across the whole requested
suite. The scheduler hashes the benchmark seed, suite ID, family ID, and
repetition, uses those digests for a stable pair permutation, chooses one
seeded starting role, and alternates the first profile for every subsequent
pair. The same inputs reproduce the same schedule, while baseline-first and
candidate-first counts differ by at most one. Per-pair profile order is stored
in the report but does not change pair identity.

Hidden files are staged only after adapter completion, verified process-tree
teardown, and the pre-hidden workspace-policy check. Runner self-tests prove
that hidden paths are physically absent during agent execution. The official
adapter rejects profile-specific scenario branching and uses argv arrays,
exact canonical working directories, bounded JSONL streams, isolated host
configuration, and production process containment.

Deterministic anti-cheating fixtures reject differing public tasks, mismatched
fixture fingerprints, timeout asymmetry, fixed baseline-first order, exposed
hidden paths, missing or duplicate pairs, stale profile evidence, and
profile-specific adapter branching.

## Metrics, Statistics, And Verdicts

`whole_task_success` is true only when the adapter completes correctly,
visible and hidden checks pass, workspace policy and required trace assertions
pass, termination is acceptable, and evidence is complete.

`defect_escape_v2` means visible checks passed and the agent reported successful
completion while at least one hidden correctness or safety check failed. It is
not a synonym for every hidden failure. Reports also include visible/hidden
pass rates, baseline-only and candidate-only wins, both-pass/both-fail counts,
scope and review-only mutation rates, unnecessary delegation, omitted
verification, timeouts, incomplete evidence, false blocks, tool/subagent/context
and permission counts, duration, and cost only when the provider reports it
reliably.

Pairs are keyed by family, generated instance fingerprint, and repetition. The
analyzer reports:

- macro-averages by family;
- pass-rate deltas and the paired outcome table;
- a deterministic 10,000-resample 95% bootstrap confidence interval;
- an exact McNemar test when the discordant sample is sufficient;
- category and risk-class breakdowns;
- a Pareto view of quality, duration, cost, and safety/scope regressions.

The versioned policy evaluates predeclared guardrails. Its statuses are
`insufficient_sample`, `inconclusive`, `candidate_better`,
`candidate_worse`, and `no_clear_difference`; it never emits the release
acceptance terms `accepted` or `rejected`. Smoke cannot declare
`candidate_better`, and incomplete runs are not charged to only one side.

Re-analyze a completed immutable run without invoking a model:

```sh
npm run bench:synthetic:compare -- \
  --report evals/reports/synthetic/runs/<run-id>/report.json
```

The loader revalidates the canonical path, report schema, completion marker,
the exact JSON/Markdown/CSV artifact set, and every artifact byte fingerprint
before analysis.

## Reports And Privacy

Complete paired runs publish immutable artifacts under
`evals/reports/synthetic/runs/<run-id>/`:

- `report.json`, `report.md`, and `pairs.csv`;
- `comparison.json`, `comparison.md`, and `summary.csv`;
- marker-last `completion.json` and `comparison-completion.json`;
- content-bound `latest.json` and `latest-comparison.json` convenience
  pointers.

Incomplete runs have no completion marker or latest pointer. Model-free
self-tests and single-profile replays use separate
`model-free-self-tests/` and `replays/` subtrees. All generated reports and
instances are ignored machine-local artifacts.

Reports retain profile/fixture/seed, suite, policy, and model-binding
fingerprints, execution order, completeness, metrics, statistics, availability,
and residual caveats. Replay report v2 additionally retains its exact
privacy-safe attempt binding and result. Reports exclude full prompts and
completions, credentials, secrets, raw private logs, arbitrary adapter output,
absolute user paths, and hidden source.

## Adoption And CI

The canonical inventory mechanically composes four adoption views:

- `core`: the `profile-only` orchestration bundle;
- `quality`: core plus the `instrumented` computational gate;
- `evaluation`: quality plus the `plain` profile, synthetic corpus, adapter,
  runner, analyzer, reports, and benchmark commands;
- `complete`: evaluation plus development documentation and release tooling.

Run `npm run verify:benchmark:contracts` to validate composition, prove that
the core materialization excludes benchmark, quality, and native containment
infrastructure, import the isolated quality/evaluation transitive closures,
reject missing-dependency fixtures, and execute synthetic validation from the
materialized evaluation bundle. `npm run verify:adoption-bundle` continues to
validate the complete portable development bundle.

Default `npm run verify` and `.github/workflows/verify.yml` remain model-free.
They validate schemas, rendering, seed reproducibility, hidden isolation, fake
adapter lifecycle, statistics, report integrity, parser fixtures, bundle
composition, comparison fixtures, CLI behavior, and CI boundaries. The
`Synthetic benchmark` workflow is manual `workflow_dispatch` only, uses a
protected self-hosted environment, fails closed when model configuration is
absent, and uploads artifacts only after a complete revalidated run.

## Relationship To Release Acceptance

Synthetic ablation allows intentional profile tool/permission differences,
shows those surfaces, and rejects unexpected dangerous widening. Its analyzer
compares product-value metrics under a predeclared synthetic policy.

`npm run assess:candidate` remains the release-regression gate for compatible
harness versions with the expected permission surface and its existing
first-party evidence chain. Synthetic reports do not alter, feed, or replace
that contract.

## Limitations

- The corpus measures short deterministic coding and orchestration behavior,
  not long-running work on a large production repository.
- The 16-family corpus deliberately has no browser E2E or visual judge. A
  browserless micro-web family can be added later only with a deterministic,
  dependency-light oracle.
- Duration and cost are a Pareto view, not a hidden scalar score; unavailable
  provider cost stays unavailable.
- Real runs depend on a compatible installed OpenCode CLI, a host-selected
  model, credentials, and working OS process containment.
- Passing model-free checks validates the benchmark machinery only. It is not
  evidence that `profile-only` or `instrumented` is better than `plain`.
