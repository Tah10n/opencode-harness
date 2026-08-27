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
outcomes are not model-visible. Ordinary parent-revision source remains visible
and may contain reusable code; it is part of the problem, not a disclosed answer.
The contract audit verifies structurally across all 120 public families that
all five clauses and their witnesses are present, the visible contract text
does not disclose source-patch hunks, every pre-fix state fails, and every
reference repair passes. Two independently authored byte-distinct
alternatives—one development and one validation representative—pass the same
hidden oracle, and one representative multi-source family rejects a
destructive mutation of every allowed source path. These representative
alternatives are spot checks only: there is no 120-entry independently reviewed
semantic contract ledger, so the audit sets
`full_corpus_semantic_sufficiency_claimed:false` and must not be cited as proof
that every visible contract is independently sufficient. Corpus provenance
still requires every available upstream rule suite corresponding to an allowed
rule path.

The runner-owned `control.json` retains reference bytes only for model-free
oracle calibration. Scored outcomes never compare candidate bytes to a
reference. After the model exits, changed entries must remain ordinary source
files with their original modes and every changed path must be within the
declared mutation scope. The copied workspace is then judged by a contained,
no-network semantic oracle. Semantically equivalent repairs are accepted.

The public corpus is always development/validation evidence. It is never
promotion-eligible and cannot authorize a confirmatory claim.

## Frozen study semantics

The study has exactly one preregistered candidate. A frozen
`stratum-balanced-hash-rank-v1` arm-order policy is part of the design.
Development alone runs baseline-first because the preregistered opportunity
gate must settle before any candidate call. Validation and holdout are balanced
within every stratum: exactly half of families are baseline-first and half are
candidate-first. The exact schedules and fingerprints are bound into the
campaign, ledger events, external manifest, and every attempt envelope and
checkpoint reservation. Selection is
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

Before baseline, an independently signed execution-authority receipt assigns
distinct `campaign_execution_id` and `holdout_execution_id` values and binds
the current source, design, corpus, and output directory. A root-custodied
registry outside every clone is an append-only hash chain. Under an atomic
registry lock it records a `reserve` event before the first model call and a
`consume` event at terminal completion. Exact resume from the same physical
clone, host, output, authority, and campaign binding is allowed; a fresh clone,
different host, moved output, or rebound ID is rejected before a model call,
even when it has an independent Git common directory.

The Git-private registry remains a supplementary local checkpoint/lease and
binds one campaign fingerprint to one output directory.
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
Takeover first installs a guard observed by lease acquisition, atomically moves
the current lease to quarantine, and compares the quarantined bytes with the
signed observation. A heartbeat race restores the current lease and rejects the
receipt. A leftover guard after host failure is itself fail-closed and requires
manual audited recovery. Heartbeat updates take a separate lock and re-check the
takeover guard before writing; takeover rejects an already in-flight heartbeat.
A leftover heartbeat lock is also fail-closed and requires manual audited
recovery, so an old heartbeat can never recreate or overwrite a replacement
coordinator lease.

## Readiness boundaries

`npm run verify:portable` validates deterministic design, corpus, ledger,
runner, provenance, lease, and holdout-negative contracts without privileged
environment receipts. A portable pass does not authorize a campaign.

`npm run verify:development-readiness` requires the frozen semantic runtime,
the structural all-family contract audit with explicitly representative
alternative witnesses, exact candidate/product equivalence, signed global
execution authority, a signed pre-baseline holdout selection commitment,
process containment, and hidden-namespace receipts. It does not require the
post-freeze holdout reveal, rendered holdout directory, manifest, or
holdout-only egress receipt.

`npm run verify:holdout-readiness` is post-freeze. It requires exact resume of
the completed campaign, passed validation efficacy, the frozen final candidate,
all three capability receipts including provider-only egress, zero prior
holdout executions, and a signed external manifest from the configured private
custodian channel. A plain directory, boolean environment variable, unsigned
JSON, public-Git controls, reused public source identity, or manifest containing
reference solutions fails closed.
Readiness also recomputes the public split schedules, matches the report and
ledger to the signed execution IDs and holdout commitment, and atomically
inspects the external append-only registry. Only an unused holdout ID or the
same clone's exact reserved resume can pass; a rebound authority, another clone,
or a consumed ID cannot. Execution-authority and precommit receipts are valid
for at most 30 days and must still be unexpired, including on exact resume.
The host-readiness authority, external holdout custodian, and manual takeover
auditor are three distinct Ed25519 signing principals; the verifier rejects a
registry that collapses those trust roots.

## External holdout custody

Before development baseline, the external custodian signs a commitment to the
complete sampling-frame fingerprint, `stratified-sha256-lowest-30-v1`
algorithm, salt commitment, frame counts, both execution IDs, current source,
design, and public corpus. After validation and candidate freeze, the custodian
reveals the exact frame and salt. The verifier deterministically recomputes the
30 selected identities per stratum and rejects a signed but candidate-aware
cherry-pick. The external custodian then materializes exactly those 90 private
families, with self-contained
visible contracts, private hidden controls, expected test counts, and no
reference solution. Its signed manifest binds the campaign, design, final
candidate SHA, product bundle, both execution IDs, precommitment, reveal,
selection proof, exact selected identities, balanced arm-order schedule, index,
private control fingerprints, calibration attestation, execution limit one,
issuer, and expiry. The complete custody tree
is outside public Git and owner-only.

The holdout custodian signing key is distinct from both current-HEAD reviewer
keys. Reviewers cannot choose or reveal holdout identities, and the custodian
cannot issue review receipts.

## Product decision

Host verification is a fail-closed safety filter only. It may reject unsafe or
unverified candidate outcomes, but benchmark v3 does not treat it as an
expected source of lift and does not add a remediation continuation to the
candidate. Any measured lift must come from the frozen candidate architecture;
adding a product-equivalent bounded remediation continuation would require a
new preregistered design rather than a post-result adjustment.

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
BENCHMARK_V3_CAMPAIGN_OUTPUT=/private/campaigns/benchmark-v3-campaign-001 \
BENCHMARK_V3_EXECUTION_AUTHORITY=/var/run/opencode-harness/execution-authority/campaign-001.json \
BENCHMARK_V3_HOLDOUT_SELECTION_COMMITMENT=/var/run/opencode-harness/holdout/campaign-001/commitment.json \
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
  --execution-authority /var/run/opencode-harness/execution-authority/campaign-001.json \
  --holdout-commitment /var/run/opencode-harness/holdout/campaign-001/commitment.json \
  --review-receipt /var/run/opencode-harness/reviews/reviewer-one/review.json \
  --review-receipt /var/run/opencode-harness/reviews/reviewer-two/review.json \
  --process-receipt /var/run/opencode-harness/readiness/process.json \
  --namespace-receipt /var/run/opencode-harness/readiness/namespace.json \
  --output /private/campaigns/benchmark-v3-campaign-001 \
  --provider provider-id --model model-id --variant variant-id
```

The custodian signs `commitment.json` before development baseline. After
`report.json` says `sealed-holdout-required`, the custodian reveals the committed
frame and salt, deterministically selects the identities, and creates
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
BENCHMARK_V3_PROVENANCE_BUNDLE=/private/custody/eslint-provenance.bundle \
BENCHMARK_V3_CANDIDATE_BUNDLE=/private/candidate/core \
BENCHMARK_V3_EXECUTION_AUTHORITY=/var/run/opencode-harness/execution-authority/campaign-001.json \
BENCHMARK_V3_HOLDOUT_SELECTION_COMMITMENT=/var/run/opencode-harness/holdout/campaign-001/commitment.json \
BENCHMARK_V3_EXTERNAL_HOLDOUT_MANIFEST=/var/run/opencode-harness/holdout/campaign-001/manifest.json \
OPENCODE_QUALITY_PROCESS_CONTAINMENT_RECEIPT=/var/run/opencode-harness/readiness/process.json \
BENCHMARK_V3_HIDDEN_NAMESPACE_ISOLATION_RECEIPT=/var/run/opencode-harness/readiness/namespace.json \
BENCHMARK_V3_PROVIDER_ONLY_EGRESS_RECEIPT=/var/run/opencode-harness/readiness/egress.json \
npm run verify:holdout-readiness
```

The one confirmatory execution (the provenance bundle is required here too):

```sh
BENCHMARK_V3_PROVENANCE_BUNDLE=/private/custody/eslint-provenance.bundle \
npm run bench:v3:holdout -- \
  --source-root "$PWD" \
  --semantic-runtime /private/custody/eslint-runtime \
  --output /private/campaigns/benchmark-v3-campaign-001 \
  --external-manifest /var/run/opencode-harness/holdout/campaign-001/manifest.json \
  --opencode /absolute/path/to/opencode \
  --candidate-source "$PWD" \
  --candidate-bundle /private/candidate/core \
  --execution-authority /var/run/opencode-harness/execution-authority/campaign-001.json \
  --holdout-commitment /var/run/opencode-harness/holdout/campaign-001/commitment.json \
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
