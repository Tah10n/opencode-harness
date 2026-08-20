# Benchmark v2 methodology

Status: development-only design contract. No model-backed v2 result exists yet.
The development and validation manifests are executable and their reference
solutions pass every visible, hidden, and consumer check. No model-backed v2
outcome exists, and the holdout is intentionally unselected.

## Development campaign runner

`npm run bench:v2:campaign` materializes the physical development or sealed
validation split, counterbalances adjacent cumulative arms per family and
repetition, and executes the existing isolated OpenCode adapter. The manual
`benchmark-v2-development.yml` workflow pins the primary binding to
`openai/gpt-5.6-luna`, provider `openai`, variant `low`, and 300000 ms. It first
runs a model-backed baseline/candidate acceptance pair, requires Linux cgroup-v2
configuration, then runs the full paired campaign.

After the compact-rules ablation was neutral, development-only arm `P6` was
reserved for the isolated `P0:P6` host-verification experiment. It uses the
same plain primary agent as P0 and differs only by the runner-owned
post-mutation verification gate. P6 is not a product profile or a vNext
release arm; it exists to remove the rejected prompt component as a confounder.

Development-only arm `P7` adds the host-triggered read-only reviewer to P6.
The `P6:P7` transition isolates reviewer activation and effect after current
runner verification, while `P0:P7` is reserved for a later plain comparison
only if the incremental reviewer transition first passes development gates.
P7 is not a product profile or release arm.

The automatic-review acceptance smoke uses the existing
`dev-medium-config-propagation` family because both arms must reach a bounded
multi-file integration for the reviewer lifecycle to be exercised. This
selector affects acceptance only; it does not remove, reorder, or reweight any
family in a full campaign.

Persisted reports exclude prompts, fixture contents, hidden files, reference
solutions, stdout/stderr, and credentials. The artifact reader recomputes plan,
pair, and report fingerprints before upload. Development output may retain or
reject a candidate for another architecture generation; it is not confirmatory
evidence and cannot produce a product promotion claim.

The primary test is the preregistered one-sided exact paired sign permutation
over discordant task outcomes (`candidate-greater`), matching the power model.
Confidence intervals resample whole task families, so paired repetitions from
one family remain clustered. Development reports also emit stratum, safety,
timeout, activation, defect-relation, and duration guardrails from the frozen
policy without changing thresholds after observing outcomes.

Example plan inspection (model-free and allowed on a dirty development tree):

```sh
npm run bench:v2:campaign -- --plan-only --allow-dirty \
  --split development --generation generation-1 \
  --baseline P1 --candidate P2 \
  --model openai/gpt-5.6-luna --provider openai --variant low \
  --timeout-ms 300000 --seed preregistered-development-seed --repetitions 1
```

Validation requires `--validation-use-ordinal 1` or `2`; the runner rejects a
missing or out-of-range ordinal. The manual workflow gives each validation
generation/ordinal a stable artifact name and rejects a run when that persisted
artifact already exists. Deleting evidence to reuse an ordinal violates the
sealed-validation contract even if the repository cannot prevent that external
administrative action.

## Pre-selection freeze

The committed salt commitment binds a private, git-ignored 256-bit preimage;
the preimage is not an evidence artifact. `npm run bench:v2:freeze` may run only
from a clean committed tree and combines that salt with the frozen candidate SHA
and previously unknown workflow run ID. Its manifest binds the Git tree, harness
closure, evaluator, promotion policy, task-generator closure, complete benchmark
contract, model/provider/variant/timeout, executable identity, candidate arm,
alpha round, and arm-ordering policy.

The freeze manifest is written with create-only semantics under `.oc_harness/`
and has `holdout_selected: false`. It neither selects nor exposes holdout tasks.
The strict reader rebuilds every binding from the current source and salt; any
post-freeze source, evaluator, policy, generator, model, timeout, executable, or
seed drift invalidates the manifest. Holdout selection must consume the
validated manifest in a later workflow step and publish it as immutable evidence.

The post-freeze selector is deterministic over that frozen seed. It requires
canonical executable procedural and real-commit pools, rejects overlap with
earlier splits, selects exactly 30 families per stratum with 23 real-commit
families overall, and writes a privacy-safe create-only selection manifest under
the ignored `.oc_harness/benchmark-v2/holdout/` evidence directory. Provenance
metadata alone is rejected as non-executable, so the committed real-commit
candidate registry cannot trigger an early selection. Runtime selections do not
mutate the source contract and therefore do not invalidate later verification
of the same frozen source; each manifest remains bound to one freeze fingerprint.

The procedural universe is also preregistered before selection: 72 recipe
identities, 24 per stratum. Every medium recipe declares a two-file solution and
the high-risk registry covers all eleven preregistered risk domains. Recipe
metadata alone cannot be passed to the selector: the executable pool is built
only from the complete set of validated task-identity and fixture fingerprints.

The first materialization slice covers all 24 small recipes. Their generated
reference solutions pass visible and post-settlement hidden tests, including
precision, encoding, date-canonicalization, and integer-boundary cases.

The medium slice adds 24 entry-point and remote-consumer fixtures. Every
reference solution changes exactly two files: the implementation and its
explicit public API contract. Public and post-settlement hidden checks import
through that entry point, while a hidden consumer verifies the visible
entry-to-service-to-worker chain.

The high-risk slice adds 24 two-file fixtures covering all eleven declared risk
domains. Every instance carries a closed high-risk contract with the recipe,
risk domain, and executable hidden oracle; public and hidden checks still enter
through the same explicit API and remote-consumer topology. With all 72
reference solutions passing, the procedural registry now materializes as a
canonical executable pool; real-commit materialization remains a separate gate.

## Real-repository pilot boundary

Real-commit materialization is phase-separated. The pre-model phase validates
the exact origin, sole parent, MIT license blob, and changed-path metadata, then
reads only a bounded parent-tree snapshot. It cannot return child-commit file
contents. Reference files are read in a distinct post-settlement call only after
an authenticated receipt binds the candidate, public fixture fingerprint, and
settled model run. The settlement secret belongs to the trusted runner process
and is neither written into the task workspace nor exposed through model tools.

This boundary does not by itself make the canonical real-commit registry
executable. That registry remains provenance-only until every preregistered
repository can be fetched in the trusted runtime, every visible requirement is
audited for completeness, and every prepared fixture and post-settlement oracle
passes the corpus gate.

The pre-model source audit is reproducible against an object-filtered cache in
which each repository directory is named by its registry ID:

```sh
npm run bench:v2:real-commit:verify-sources -- --cache-root /trusted/cache
```

The command verifies the origin, commit-parent relation, historical MIT blob,
changed-path identity, bounded parent snapshot, and unique fixture identity for
all 36 candidates. It does not fetch repositories, read reference files, or
claim that visible requirements and post-settlement oracles are complete.

Visible requirements are curated separately from public commit, issue, and pull
request metadata without reading patch bodies. The requirement manifest binds
one explicit behavior contract and evidence URL to every candidate. Its oracle
scope permits post-settlement checks to assert only that contract and public
contracts already present in the parent snapshot. The manifest remains marked
`curated-pre-reference-oracle-audit` until the trusted post-settlement phase
confirms that each historical oracle stays inside that scope.

The preregistered pilot runs only after a positive synthetic holdout gate and is
external-validity evidence, never promotion evidence. It requires at least 12
new paired tasks from at least three compatible-license repositories. Every
canonical task identity is checked against the complete 156-family development,
validation, and holdout identity universe. The frozen binding is shared by both
arms, raw model text is not persisted, and reference solutions remain runner-only
until model settlement.

The pilot supports external validity only when its paired direction is
nonnegative, it introduces no CRITICAL regression, no more than 20% of the 24+
arm executions fail at runtime, and installation/materialization passes for
every task. Its summary publishes success direction, runtime and CRITICAL
outcomes, duration/tool/turn ratios, task-evidence fingerprints, and the hash of
the excluded identity universe. A negative or incomplete pilot cannot be hidden
by the earlier synthetic result.

## Why the design is paired and sealed

The primary outcome is binary and both arms run the same task/seed/binding, so
the confirmatory test is paired. Exact McNemar power depends on discordant
pairs, not merely the total sample size. The preregistered calculation assumes
candidate-only success probability 0.10 and baseline-only success probability
0.02: an eight-point effect and 0.12 discordance. With 90 families and two
paired trajectories per family, 180 paired observations give exact one-sided
power 0.8695 at round-one alpha 0.025. A sensitivity calculation applies a
1.10 design effect for within-family correlation and still gives power 0.8297.
The executable calculation lives in `lib/benchmark/v2-contracts.mjs` and is
recomputed by `npm run verify:benchmark:v2:contracts`.

Matched-pair design literature emphasizes that discordance probability is a
primary sample-size input and that exact size/power should be considered for
binary pairs: [Efficient experimental design for binary matched pairs data](https://pubmed.ncbi.nlm.nih.gov/19691023/).

Repeatedly inspecting and tuning against one holdout makes the candidate depend
on that holdout. This is the adaptive reuse failure described in
[Generalization in Adaptive Data Analysis and Holdout Reuse](https://papers.nips.cc/paper/5993-generalization-in-adaptive-data-analysis-and-holdout-reuse).
Accordingly, the v2 holdout has no selected-family manifest before source,
evaluator, policy, generator, and model binding freeze. A post-selection product
or evaluator mutation invalidates the round rather than producing a rerun.

## Split boundary

- Development contains 36 executable families: 12 per stratum. Six of the 12
  medium reference solutions change two files.
- Validation contains 30 disjoint executable families: 10 per stratum, with at
  most two uses for one architecture generation. Five of ten medium reference
  solutions change two files.
- Holdout selection is deferred until freeze. The contract requires 90 families
  (30 per stratum), two paired trajectories per family, and at least 23
  compatible-license real-commit-derived families.

The committed real-commit registry is provenance only: 36 non-merge commit
candidates, 12 per stratum, from five MIT repositories. It records immutable
commit/parent identities, license-blob identities, titles, and changed-path
metadata obtained without patch bodies. It is neither a selected holdout nor an
executable task corpus. Task materialization and any reference-patch access must
occur inside the frozen runner boundary; reference patches remain inaccessible
until the corresponding model execution has settled.

All task requirements must be visible. Hidden material may contain only
concrete examples, consumers, and tests; it may not add requirements. Reference
solutions stay runner-only and hidden files are installed only after model
settlement. A task exposes at most 20 public files and changes one to four.

## Evidence storage

The repository will retain only manifests, summaries, decisions, hashes,
methodology, and reproduction commands. Full envelopes belong in an immutable
workflow artifact. GitHub documents that uploaded artifacts expose a digest,
and artifact attestations bind provenance such as repository, workflow, commit,
and triggering event:
[workflow artifact digest](https://docs.github.com/en/actions/tutorials/store-and-share-data) and
[artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations).
The final summary must bind the archive digest and attestation; neither raw
model text nor hidden solutions belongs in Git history.
