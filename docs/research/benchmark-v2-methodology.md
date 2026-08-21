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
P7 is not a product profile or release arm. Its first full development campaign
failed operational activation because permitted shell inspection produced
ambiguous trace evidence.

Development-only arm `P8` is the next architecture generation. It keeps the
same P6 host-verification baseline and automatic-review lifecycle but removes
shell access from the reviewer; repository inspection is limited to native
read, glob, and grep tools. `P6:P8` is the only incremental transition for this
generation, and `P0:P8` is reserved for a later plain comparison only if that
transition passes every frozen development gate. P8 is not a product profile
or release arm. Its full development campaign also failed: only 14/24 required
reviews completed, accepted reviews produced no findings or fixes, and the
positive point estimate did not pass the confidence, exact-test, safety, small,
or activation guardrails. The automatic reviewer is therefore rejected rather
than retained in a later product candidate.

The automatic-review acceptance smoke uses the existing
`dev-medium-config-propagation` family because both arms must reach a bounded
multi-file integration for the reviewer lifecycle to be exercised. This
selector affects acceptance only; it does not remove, reorder, or reweight any
family in a full campaign.

Development-only arm `P9` replaces the rejected reviewer experiment with one
host-owned remediation retry on top of P6. The retry is eligible only when the
runner-selected trusted visible check settles as `failed`; passed, unavailable,
incomplete, and infrastructure outcomes do not trigger it. A fresh confined
primary attempt receives only the visible requirements and public repository,
may mutate once, and must pass the same runner-owned check after the mutation.
`P6:P9` isolates this retry; `P0:P9` remains reserved for a later plain
comparison only if the incremental transition passes every development gate.
P9 is development-only. Its full P6-to-P9 development campaign activated all
six required retries but declined from 27/36 to 26/36, introduced three
HIGH/MEDIUM regressions while resolving two, and failed the effect, confidence,
exact-test, safety, HIGH/MEDIUM, and small-task gates. It is rejected and cannot
advance to composite or validation.

Development-only arm `P10` is a new architecture generation derived from the
aggregate P9 retry categories. It keeps P6 verification and one retry, but the
host also injects a bounded snapshot of the current public diff so the retry
can inspect the failed implementation directly. The snapshot is restricted to
allowed changed public paths and excludes check output, hidden files, reference
content, executable selection, argv, and check IDs. `P6:P10` isolates the
diff-guided retry; `P0:P10` is reserved for a later plain composite only if the
incremental transition passes every frozen development gate. P10 has no
model-backed result yet.

The first P10 campaign attempt on source `0d83dfa49849d32de48cad59a0819a184d06fa40`
is study-invalid: a novel transition label fell through to composite activation
aggregation instead of verification-remediation lifecycle aggregation. Its
outcomes are not P10 evidence. P10 remains a new architecture generation of the
canonical `verification-remediation` component and requires a fresh full
development campaign after the registration repair.

The repaired P6-to-P10 campaign on source
`454a286b2189f0ea143227d0bac3822aa4aca28e` completed all 36 pairs and all six
eligible retries, but improved only from 26/36 to 27/36. Its confidence interval
crossed zero and the exact-test and safety gates failed, so P10 is rejected.

Development-only arm `P11` isolates retry-time bounded context on top of P10.
The primary attempt remains unchanged. Only when a medium task reaches an
eligible failed-check retry does the host build and inject the existing bounded
repository map alongside the public diff. `P10:P11` is the deep-context
ablation; `P0:P11` is reserved for a later plain composite only if the
incremental transition passes every development gate. P11 has no model-backed
result yet.

P11's full P10-to-P11 campaign activated its bounded map on the only eligible
medium retry, but that retry returned no change and overall success declined
from 25/36 to 24/36. P11 is rejected.

Development-only arm `P12` keeps P10's diff-guided retry and additionally
supplies the exact fixed public check invocation selected by the runner. The
retry may execute it for visible diagnostics, but the runner independently
reruns the same bound check and remains the evidence authority. The model
cannot select a different terminal executable, argv, or check ID. `P10:P12`
isolates check-addressed remediation; `P0:P12` remains reserved for a later
plain composite only after every development gate passes.

The full P10-to-P12 development campaign on source
`b6f28bc6c56c4bab0cbc55f007c32289d3eba565` activated all three eligible
retries but declined from 27/36 to 25/36, introduced three HIGH/MEDIUM
regressions while resolving one, and failed the effect, confidence, exact-test,
safety, HIGH/MEDIUM, and small-task gates. P12 is rejected.

Development-only arm `P13` keeps P10's single diff-guided retry and adds the
fixed public command from P12, but removes the model-owned diagnostic gap. The
credential-free host execution supplies a transient, privacy-sanitized public
check diagnostic capped at 8,000 UTF-8 bytes. Private absolute paths,
sensitive-looking lines, terminal controls, hidden output, and reference
content are unavailable. The diagnostic is never persisted, and the host
independently reruns the bound check after a mutation. `P10:P13` is the
incremental remediation estimand; `P0:P13` is reserved for a later plain
comparison only if the incremental transition passes every development gate.
Its first acceptance attempt inherited the generic remediation selector and
did not encounter an eligible failed public check, so it failed without a full
campaign. The repaired estimand uses `dev-high-durable-persistence` as its
acceptance-only lifecycle smoke; this does not filter or reweight the 36-family
development campaign.

That high-risk smoke also completed before remediation became eligible. Rather
than select families until a stochastic first attempt fails, P13 acceptance now
uses conditional activation semantics: an ineligible clean completion passes;
an eligible retry must be operationally complete. Deterministic integration
tests exercise the diagnostic retry path, while the unchanged full development
campaign measures model-backed activation over every eligible family.

The P13 full runner later emitted terminal `reject-development-candidate`, but
an external packaging filename error prevented canonical validation and durable
copy before the ephemeral container was removed. The architecture is rejected
and the generation is not rerun; no unavailable pair metric is reported.

Development-only arm `P14` replaces failed-check-only retries with one
host-triggered visible-contract conformance pass after every completed
medium/high first attempt. It receives only visible requirements, the current
public diff, fixed public check status, and a sanitized public diagnostic when
that check failed. Small tasks are an untreated negative control. Any mutation
makes verification stale and the host reruns the fixed check. `P6:P14` isolates
this mechanism; `P0:P14` remains reserved until every incremental development
gate passes.

The complete P6-to-P14 development report on source
`c60643ce30d67514f7730653a23025104650a142` was canonically validated with
fingerprint
`sha256:190d8aac6864f9dd49d686fd367e7605379c2cfca750d3b2cf9eaf4c07dffbef`.
It improved regression-free success from 19/36 to 28/36 (+25.00 pp, 95% CI
[5.56, 44.44] pp, one-sided exact p=0.01123) and completed all 24 eligible
passes. It is still rejected because the frozen small-stratum lower bound was
-33.33 pp and median duration was 2.20x baseline. Only four passes changed the
workspace, so this generation cannot justify the unconditional second model
call or advance to composite or validation.

Development-only arm `P15` retains one visible-contract conformance pass but
gates it on deterministic public state. High-risk tasks are always eligible;
other tasks are eligible only after a failed fixed public check or when an
explicitly allowed visible target path is missing from the first-attempt diff.
The lower-risk passing and complete path skips the extra model call. Any P15
mutation still invalidates prior verification and requires the same fixed
trusted check. `P6:P15` is the incremental estimand; no plain composite is
allowed unless the new acceptance and complete development report pass every
frozen guardrail.

The first P6-to-P15 report on source
`d77d7a8cabae8ed6a74adc141e4d8b5b8fcb3515` passed every incremental
development guardrail with fingerprint
`sha256:ee2d33593adcbc31a4837b8a4af4598a743487b037980f290166a6a226e44a01`.
It improved regression-free success from 23/36 to 29/36 (+16.67 pp, 95% CI
[5.56, 27.78] pp, one-sided exact p=0.015625), activated 13/13 eligible passes,
and used 1.69x median and 1.45x mean duration. Pre-composite review then found
that the reserved P0-to-P15 label lacked a dedicated activation dispatcher and
would fall through to the unrelated generic review-plus-context composite.
The incremental report remains valid, but the source cannot advance until a
new registration-repair generation repeats P6-to-P15 under its new campaign
fingerprint.

The repaired P6-to-P15 generation on source
`9e7d8bb330b341006b3dd0edbcbe3ac26a91bd89` passed all incremental gates, but
the dedicated P0-to-P15 composite was rejected. Its success delta was only
+2.78 pp with a 95% CI of [-5.56, 13.89] pp and one-sided exact p=0.5000; the
safety guard also failed after one new HIGH/MEDIUM regression. P15 therefore
does not advance to validation.

Development-only arm `P16` retains P15 and adds one deterministic eligibility
signal: a completed medium task with more than one explicitly allowed visible
target receives the bounded visible-contract pass. Campaign observations bind
the public trigger reasons, and `P15:P16` activation requires the exact
`multi-target` reason rather than any pre-existing P15 retry. `P15:P16` is the
incremental estimand; `P0:P16` remains prohibited unless that fresh full
development report passes every frozen gate.

The P15-to-P16 development report on source
`3e142776e9685c7c8005a6b66310401b57aa4a6c` was rejected. All six exact
multi-target activations completed and cost stayed near baseline, but success
improved only from 27/36 to 28/36 (+2.78 pp, 95% CI [-8.33, 13.89] pp,
one-sided exact p=0.5000). Medium outcomes were neutral, with one discordance in
each direction, so P16 cannot advance to composite or validation.

Development-only arm `P17` uses P6 as its unchanged first-attempt baseline and
starts one specialized contract auditor after every completed medium/high
attempt. The auditor has a 64-step cap, native read/glob/grep/edit access, and
no shell or delegation. It receives the same public-only conformance envelope
as P14. `P6:P17` isolates this specialist pass; `P0:P17` remains prohibited
unless fresh acceptance and the full development report pass every frozen
gate.

The full P6-to-P17 report on source
`6e28056926ad6e980b11353cec3f06053bdd91e4` completed all 24 specialist passes
and improved success from 25/36 to 29/36, but its 95% CI [-2.78, 25.00] pp
crossed zero and one-sided exact p=0.109375 missed the frozen threshold. The
untreated small stratum declined from 12/12 to 11/12. CI, exact-test, and small
guardrails failed, so P17 cannot advance.

Development-only arm `P18` is a deterministic stratified candidate. Small
tasks use the previously measured compact-rules primary role and no specialist;
medium/high tasks keep the plain primary plus P17's bounded specialist pass.
The public family stratum is the only dispatcher input. `P0:P18` is the full
development estimand and must pass fresh acceptance plus every frozen gate
before any sealed validation use.

P18 passed its development gate but failed sealed validation use 1 on all 30
validation families: +10.00 pp, 95% CI [-6.67, 26.67] pp, one-sided exact
p=0.2265625, with failed safety, small-stratum, and median-cost guardrails. It
is rejected and is not rerun. Development-only P19 removes compact-small and
combines the existing public-only risk gate with the bounded contract auditor.
It must pass isolated P6-to-P19 and full P0-to-P19 development gates before the
remaining sealed validation use can be consumed.

P19 passed its isolated P6 comparison and a complete P0 plain composite on
source `9588551bf0c5fcb3034f87cd39ea220a4218d1e9`. The complete composite was
22/36 to 30/36 (+22.22 pp, 95% CI [11.11, 36.11] pp, one-sided exact
p=0.00390625), with 36/36 activation, no new HIGH/MEDIUM or critical
regression, and 1.781x/1.665x median/mean duration. An earlier composite
generation is preserved separately as incomplete because one plain profile
bootstrap timed out; it emitted no summary and was not interpreted. P19 remains
development-only until its exact host lifecycle is materialized as a runtime
profile; only that source may use validation ordinal 2.

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
