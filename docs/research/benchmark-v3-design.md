# Benchmark v3 development, validation, and sealed-holdout contract

Benchmark v3 is executable model-free infrastructure, not model-backed evidence.
No model entry point may run until the deterministic gates, exact materialized
candidate, containment and namespace evidence, and two independent current-HEAD
reviews have passed. The harness never creates a candidate automatically.

## Public corpus and visible contracts

The public rendered corpus contains exactly 60 development and 60 validation
family clusters, balanced as 20 small, 20 medium, and 20 high per split. It
contains no rendered holdout family. The seeded allocation retains 90 additional
source identities only as `reserved` exclusions, preventing accidental reuse by
the public generator or external custodian. A reserved identity is not a task,
control, solution, observation, or confirmatory split.

Every development/validation family exposes a self-contained behavioral
contract with five mandatory clauses:

1. observed bug;
2. required behavior;
3. preserved behavior;
4. boundary and error cases;
5. allowed mutation scope.

The authored upstream defect report and test-only behavioral delta are visible.
Implementation diffs, reference source bytes, complete hidden tests, and oracle
outcomes are not model-visible. The contract audit verifies that all five
clauses and their witnesses are present, the visible surface does not disclose
the source patch, every pre-fix state fails, every reference repair passes, and
two independently authored byte-distinct alternatives—one development and one
validation representative—pass the same hidden oracle.

The runner-owned `control.json` retains reference bytes only for model-free
oracle calibration. Scored outcomes never compare candidate bytes to a
reference. After the model exits, changed entries must remain ordinary source
files with their original modes and every changed path must be within the
declared mutation scope. The copied workspace is then judged by a contained,
no-network semantic oracle. Semantically equivalent repairs are accepted.

The public corpus is always development/validation evidence. It is never
promotion-eligible and cannot authorize a confirmatory claim.

## Frozen study semantics

The study has exactly one preregistered candidate. Development runs the
baseline before the candidate, evaluates the preregistered opportunity gate,
and executes every development family at most once per arm. Selection is
deterministic: highest paired delta, then lower new HIGH/MEDIUM upper confidence
bound, then lower mean duration, then candidate ID. Validation runs only that
candidate once. Passing validation freezes the exact candidate source SHA and
product bundle and stops with `sealed-holdout-required`.

The opportunity gate is evaluated after development baseline and before the
first candidate call. At n=60, alpha 0.05, minimum practical delta 0.10,
preregistered fix probability 0.80, and permitted regression probability 0.02,
at least 11 baseline failures are required and every stratum needs at least two
opportunities. Failure ends the campaign with candidate tokens zero.

Frozen safety requirements include zero new critical, unclassified semantic,
and HIGH/MEDIUM regressions; one-sided exact 95% upper bound at most 0.033;
candidate safety not worse than baseline; small-stratum non-inferiority by
`zero-discordance-pass-else-conservative-ci`; timeout delta at most +0.02;
median duration at most 2.0x; mean duration at most 2.5x; and activation at
least 0.95. At zero events the exact upper bounds are 0.0487029133 for n=60,
0.0327380338 for n=90, and 0.0199048162 for n=149.

An attempt is durably reserved before execution. Successful completed families
are never repeated. One retry is allowed only after a proven infrastructure
failure before a scored outcome, with unchanged bindings. Missing or ambiguous
completion evidence fails closed instead of spending model tokens again.

## Campaign lease and exact resume

The Git-private registry binds one campaign fingerprint to one output directory.
The checkpoint, ledger, candidate/product fingerprint, model binding, semantic
runtime entries, review fingerprints, source SHA, and source-tree fingerprint
must reproduce exactly on resume.

Any existing campaign lease is authoritative. Same-host stale-looking leases
and every foreign-host lease fail closed. PID death, heartbeat age, PID reuse,
or start-identity mismatch never permits automatic reclamation. Reclamation is
a separate manual operation requiring a fresh signed auditor receipt bound to
the current source SHA, campaign fingerprint, exact lease target, and exact
observed lease bytes. The previous lease is preserved under
`takeover-evidence/` before a new coordinator can acquire it. The two-worktree
shared-Git negative test represents two containers mounting the same Git common
directory and proves a foreign-host lease cannot be displaced.

## Readiness boundaries

`npm run verify:portable` validates deterministic design, corpus, ledger,
runner, provenance, lease, and holdout-negative contracts without privileged
environment receipts. A portable pass does not authorize a campaign.

`npm run verify:development-readiness` requires the frozen semantic runtime,
the full contract audit, exact candidate/product equivalence, process
containment, and hidden-namespace receipts. It does not require an external
holdout directory, manifest, or holdout-only egress receipt. Therefore an
external custodian cannot block a pre-freeze development/validation campaign.

`npm run verify:holdout-readiness` is post-freeze. It requires exact resume of
the completed campaign, passed validation efficacy, the frozen final candidate,
all three capability receipts including provider-only egress, zero prior
holdout executions, and a signed external manifest from the configured private
custodian channel. A plain directory, boolean environment variable, unsigned
JSON, public-Git controls, reused public source identity, or manifest containing
reference solutions fails closed.

## External holdout custody

The external custodian creates the holdout only after validation and candidate
freeze. It contains exactly 90 private families (30 per stratum), self-contained
visible contracts, private hidden controls, expected test counts, and no
reference solution. Its signed manifest binds the campaign, design, final
candidate SHA, product bundle, index, private control fingerprints, calibration
attestation, execution limit one, issuer, and expiry. The complete custody tree
is outside public Git and owner-only.

The holdout runner resumes the same checkpoint and ledger, uses the same model,
runtime entries, source, and final candidate, and writes separate immutable
`holdout-ledger.json` and `holdout-report.json`. The ledger permits at most one
scored `holdout-execution`. Re-running a completed holdout returns the existing
report; it never performs a second confirmatory execution.

## Exact commands

Until the contract audit, readiness split, lease negatives, two current-HEAD
reviews, and exact-SHA CI are green, do not run either model entry point.

Development/validation readiness:

```sh
BENCHMARK_V3_PROVENANCE_BUNDLE=/private/custody/eslint-provenance.bundle \
BENCHMARK_V3_ESLINT_RUNTIME_ROOT=/private/custody/eslint-runtime \
BENCHMARK_V3_CANDIDATE_BUNDLE=/private/candidate/core \
OPENCODE_QUALITY_PROCESS_CONTAINMENT_RECEIPT=/var/run/opencode-harness/readiness/process.json \
BENCHMARK_V3_HIDDEN_NAMESPACE_ISOLATION_RECEIPT=/var/run/opencode-harness/readiness/namespace.json \
npm run verify:development-readiness
```

Development/validation execution:

```sh
npm run bench:v3 -- \
  --source-root "$PWD" \
  --semantic-runtime /private/custody/eslint-runtime \
  --opencode /absolute/path/to/opencode \
  --candidate-source "$PWD" \
  --candidate-bundle /private/candidate/core \
  --review-receipt /var/run/opencode-harness/reviews/reviewer-one/review.json \
  --review-receipt /var/run/opencode-harness/reviews/reviewer-two/review.json \
  --process-receipt /var/run/opencode-harness/readiness/process.json \
  --namespace-receipt /var/run/opencode-harness/readiness/namespace.json \
  --output /private/campaigns/benchmark-v3-campaign-001 \
  --provider provider-id --model model-id --variant variant-id
```

After `report.json` says `sealed-holdout-required`, the custodian creates
`/var/run/opencode-harness/holdout/<campaign>/` as owner-only `0700`, writes the
manifest and private controls as owner-only `0600`, signs the manifest, and
never commits or copies that directory into public Git. The custody directory
contains only `manifest.json`, `index.json`, and the declared three files per
family; undeclared files or directories fail closed. Every external commit is
disjoint from all 210 preregistered public/reserved source identities, every
external source path is disjoint from the public development/validation
corpus, and each commit is an ancestor of the frozen provenance tip.

Holdout readiness:

```sh
BENCHMARK_V3_CAMPAIGN_OUTPUT=/private/campaigns/benchmark-v3-campaign-001 \
BENCHMARK_V3_CANDIDATE_BUNDLE=/private/candidate/core \
BENCHMARK_V3_EXTERNAL_HOLDOUT_MANIFEST=/var/run/opencode-harness/holdout/campaign-001/manifest.json \
OPENCODE_QUALITY_PROCESS_CONTAINMENT_RECEIPT=/var/run/opencode-harness/readiness/process.json \
BENCHMARK_V3_HIDDEN_NAMESPACE_ISOLATION_RECEIPT=/var/run/opencode-harness/readiness/namespace.json \
BENCHMARK_V3_PROVIDER_ONLY_EGRESS_RECEIPT=/var/run/opencode-harness/readiness/egress.json \
npm run verify:holdout-readiness
```

The one confirmatory execution:

```sh
npm run bench:v3:holdout -- \
  --source-root "$PWD" \
  --semantic-runtime /private/custody/eslint-runtime \
  --output /private/campaigns/benchmark-v3-campaign-001 \
  --external-manifest /var/run/opencode-harness/holdout/campaign-001/manifest.json \
  --opencode /absolute/path/to/opencode \
  --candidate-source "$PWD" \
  --candidate-bundle /private/candidate/core \
  --process-receipt /var/run/opencode-harness/readiness/process.json \
  --namespace-receipt /var/run/opencode-harness/readiness/namespace.json \
  --egress-receipt /var/run/opencode-harness/readiness/egress.json
```

Audited lease takeover, only when needed:

```sh
npm run bench:v3:takeover -- \
  --source-root "$PWD" \
  --campaign-fingerprint sha256:<exact-campaign-fingerprint> \
  --takeover-receipt /var/run/opencode-harness/takeovers/takeover.json
```

No improvement, promotion, or confirmatory claim is allowed from development,
validation, readiness, or `report.json`. A claim becomes eligible only when
`holdout-report.json` says `holdout-confirmed`, records exactly one
confirmatory execution, passes all frozen efficacy and safety gates, and binds
the signed external manifest and unchanged final candidate. Model-free and
structural checks remain distinct from model-backed evidence.

Raw provenance bundles are excluded from Git and release assets. `SOURCE.json`
records repository, source tip, SHA-256, size, SPDX license, redistribution
status, and deterministic materializer. The bundle is supplied only through
`BENCHMARK_V3_PROVENANCE_BUNDLE` or the exact verified fetch flow.
