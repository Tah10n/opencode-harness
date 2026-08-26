# Benchmark v3 executable bounded-study contract

Benchmark v3 has executable model-free infrastructure, not model-backed
evidence. Candidate execution remains forbidden until the complete deterministic
gate, installed materialized-core runtime, containment and hidden-data
isolation, and two independent read-only reviews pass. The runner never creates
a prompt candidate automatically.

The public corpus uses 60 development, 60 validation, and 90 development-only
holdout family clusters,
balanced by small, medium, and high stratum. All 210 are derived from distinct,
semantically discriminating rule-change commits in the MIT-licensed
`eslint/eslint` history; source commit,
semantic-kernel, source-identity, and family fingerprints are globally unique.
The imported commit messages were not complete behavioral specifications and
one independent review found reference-implementation leakage in that public
surface. They have therefore been removed from model-visible artifacts. Every
family is explicitly marked `contract_completeness: unverified`. That boundary
permits only exploratory development/validation execution; it can never
authorize a confirmatory claim.
The versioned generator contract freezes its generator version, deterministic
`corpus_generation_seed`, split-specific source and seed commitments, public
behavior contract, hidden oracle contract, pre-fix failure witness,
reference-fix success witness, license/provenance record, and family-cluster
identity. No public rendered instance is promotion-eligible. Validation and
public development-holdout commitments are frozen before the first candidate
run; baseline outcomes may not alter generation or selection. The current 210
instances are permanently development-only. A real sealed holdout must be
created after the design and exact candidate are frozen, stored outside public
Git, and supplied through the external sealed-holdout boundary.

The frozen exclusion manifest binds the archived v2/P0-P52 registries and
forbids their real-commit repositories. Each model workspace is staged only
from the commit parent plus `public.json`, after removing Git history and every
hidden test. The runner-owned `control.json` contains the upstream hidden test,
reference calibration bytes, closed mutation paths, and provenance; none is
sent in the attempt envelope or mounted while the model runs. After model exit,
the verifier copies the scored workspace into a separate runner-owned oracle
namespace with an empty home, no network, read-only hidden/runtime inputs, and
verified process-tree teardown. Its supervisor requires a structured Mocha test
count receipt and rejects early `process.exit(0)` or post-test workspace
mutation before accepting an oracle result. The verifier then mounts a
fingerprinted historical dependency runtime and proves
that all 210 parent states fail while all 210 reference states pass. Alternative
repairs pass whenever the upstream semantic test passes and the mutation set is
closed.

## Power and opportunity

The conditional witness and attainable power are distinct. With 20 conditional
discordances, candidate win probability 0.8, and current one-candidate alpha
0.05, rejection requires
15 wins; conditional power is 0.8042077854595496. This witness does not decide
whether an observed baseline has enough opportunities.

Before the first candidate call, the runner recomputes attainable power from
family count, observed baseline failures, alpha, minimum practical delta,
preregistered fix probability, and permitted regression probability. For the
frozen 60-family development design (alpha 0.05, MDE 0.10, fix probability
0.80, regression probability 0.02), the computed minimum is 11 baseline
failures; attainable power at that boundary is 0.8512584537246037. Each stratum
must also have at least `ceil(20 * 0.10) = 2` opportunities. Failure of any
criterion ends the campaign as design-uninformative with candidate tokens zero.

## Frozen execution semantics

The campaign is frozen as a one-candidate study: minimum, maximum, and current
registered candidate count are all 1, with familywise and per-candidate alpha
0.05. Two-candidate execution is not implemented and is rejected; no second
prompt or architecture is created. Development permits one run per family for
the single registered candidate.
Selection is deterministic: highest paired delta, then lower upper CI for new
HIGH/MEDIUM regression delta, then lower mean duration, then candidate ID.
Validation runs that candidate once. The tracked public `holdout` split is a
development diagnostic only and is never executed by the confirmatory path.
After validation freezes the exact SHA, the runner stops with
`STUDY BLOCKED — EXTERNAL SEALED HOLDOUT REQUIRED`; a separate externally
sealed study is required for any confirmatory inference.

The ledger distinguishes acceptance probes, pre-scoring infrastructure
failures, development, validation, and holdout executions. At most one exact
per-family infrastructure retry is allowed before scoring; successful first
attempts are retained and never rerun. A persistent Git-private campaign
registry binds one campaign fingerprint to one output directory, rejects the
same bindings in a new directory, and resumes the exact checkpoint after a
crash without repeating completed/scored families. A long-lived PID/start/host/nonce
lease rejects concurrent coordinators, stale short locks are recovered, every
attempt is durably reserved before execution, and its fsynced completion is
written before the coordinator can record it. A crash with no authentic durable
completion fails closed instead of spending model tokens again. A retry consumes no extra architecture slot,
and every sanitized attempt fingerprint, cost, status, and containment binding
is persisted in the report alongside the sealed ledger. Relabel, reuse, extra
retries, stage reordering, and changed retry bindings fail closed.

The representative estimand uses every preregistered family in a split. The
challenge estimand uses baseline-failure opportunities only and must never be
reported as repository-wide lift. Frozen guardrails are: zero new critical
regressions and zero new HIGH/MEDIUM regressions; the one-sided exact 95% upper
bound for the new HIGH/MEDIUM regression rate must be <= 0.033; candidate safety
must not be worse than baseline; the small-stratum rule is frozen as
`zero-discordance-pass-else-conservative-ci` at n=20 validation and n=30
holdout with lower CI >= -0.03 whenever discordance is observed; timeout delta
<= +0.02; median duration <= 2.0x; mean
duration <= 2.5x; activation >= 0.95.
Paired-delta intervals use conservative Bonferroni-combined exact binomial
bounds. For zero observed regressions the one-sided exact bound is
`1 - 0.05^(1/n)`: 0.0487029133 at n=60, 0.0327380338 at n=90, and
0.0199048162 at n=149 (the minimum count that reaches 2%). If units are
clustered, `n` is the independent family-cluster count, never the nominal row
count. In particular, a zero-event small stratum no longer collapses to a
misleading `[0, 0]` empirical-resampling interval.

Candidate registration binds the actual materialized core bundle fingerprint.
The runner recomputes that binding from a clean source tree, the materialized
manifest, its closed file set, and every installed byte; caller-supplied equal
strings are insufficient. Candidate attempts execute the installed
`runtime/opencode-core.mjs` in a separate process and receive only visible
requirements and public files—never baseline outputs, family failures, hidden
findings, hidden files, or reference repairs. The parent scores the resulting
workspace after the process exits. The OpenCode worker and every descendant run
inside the harness process-tree containment boundary; teardown and containment
fingerprints are required. Raw stdout, stderr, prompts, provider errors, and
credentials are discarded and never enter the durable artifacts.
Candidate activation is accepted only from one exact-schema receipt written by
the trusted wrapper to an anonymous pipe owned by the attempt worker. The
OpenCode child receives `/dev/null` on the wrapper descriptor and has no receipt
pathname to replace, so candidate-controlled stderr and descendants cannot
forge activation. The receipt is bound to the normalized catalog and
trusted-check command fingerprints. The catalog separates immutable host/check
inputs from ordered mutable subject paths: executable identity, host program,
ordered subjects, scope, cwd and timeout are bound, while subject bytes are not
mistaken for immutable inputs. The wrapper always records the authentic child
execution disposition after a child starts. Receipt authenticity is separate
from verification success: provider errors, timeouts, protocol errors, coding
failures, and authentic failed/unavailable checks use the same disposition
rules for baseline and candidate; only missing/forged execution evidence or
containment is infrastructure. A scored successful completion also requires a
non-empty final `text` event; `step_finish` is an intermediate usage event only.

The production entry point accepts no attempt callbacks. Its unforgeable
same-process authorization is created only after the canonical deterministic
gate, the installed real-OpenCode fixture, exact product bundle validation,
three signed current-host/current-SHA capability receipts (process containment,
hidden namespace, and provider-only egress), and two independently signed
current-SHA review receipts pass. Capability freshness is checked again before
every model attempt and contained oracle; expiry stops the campaign. Review
receipts must come from two distinct root-owned protected issuer channels in
addition to carrying distinct valid signatures. Keys or self-hashes committed
in the reviewed tree have no authority by themselves. The
runner then performs acceptance, baseline, the pre-candidate opportunity gate,
development, deterministic single-candidate selection, and validation. Only
when validation passes the frozen MDE, exact alpha, positive CI lower bound,
and every guardrail is the exact SHA frozen; the public holdout still cannot
start a confirmatory claim. A
pre-scoring infrastructure failure retries only
that unscored family once with identical bindings; a second failure terminates
the study. Failed validation reports `NO PROMOTABLE HARNESS`; passed validation
reports the external sealed-holdout blocker, never a positive holdout claim.
No study result reports ready before an external sealed holdout and a separately
preregistered real-repository pilot.

## Seed, binding, and staged verification

`corpus_generation_seed` is mandatory and deterministic.
`model_sampling_seed` is optional and may be unsupported. OpenCode 1.18.21 is
therefore not incompatible merely because it lacks `--seed`; the runner omits
that argument and binds the unsupported capability explicitly. Model bindings
retain the executable fingerprint, OpenCode version, provider, model, variant,
supported sampling parameters, candidate bundle fingerprint, evaluator
fingerprint, corpus fingerprint, and arm order. Retry/attempt budgets remain
bound to the deterministic corpus seed whether or not model sampling accepts a
seed.

`npm run verify:portable` checks deterministic contracts, product/materialized
core equivalence, provenance metadata, runner negative cases, and the
fail-closed unavailable-containment contract without requiring privileged
containment. A pass is not campaign readiness. `npm run
verify:campaign-readiness` separately requires fresh, fingerprinted receipts
bound to the current host, source SHA, environment, capability, and expiry for
real process containment,
hidden-data namespace isolation, exact
product/candidate fingerprint equivalence, and sealed-holdout provider-only
egress (or a proven equivalent), plus the external post-freeze sealed holdout
manifest. The pre-freeze readiness gate never treats a directory path as
sealed-holdout evidence: the external custodian can create and sign that
manifest only after the design and final candidate are frozen. These are actual
external prerequisites; the permanent development-only
status of the public holdout is a design invariant, not an environment blocker.
Boolean `READY=1` variables have no authority.
Missing prerequisites return a typed
`blocked_environment` result. Canonical `npm run verify` does not imply that
this separate campaign gate passed.

During development/validation, hidden artifacts are never mounted during model
execution, secrets are absent from the workspace, network-capable tools are
denied and attempts are audited; evidence remains development-only unless
hardened isolation is demonstrated. Sealed holdout additionally requires a
provider-only egress boundary. Without it, holdout does not start and promotion
remains `blocked_environment`.

Raw provenance bundles are intentionally excluded from Git and release assets.
`SOURCE.json` records the exact repository and source commit, frozen SHA-256 and
size, SPDX license and redistribution status; `THIRD_PARTY_NOTICES.md` carries
the notice. `scripts/materialize-benchmark-v3-provenance.mjs` fetches the exact
source commitment or verifies a locally supplied frozen bundle before trusted
provenance/oracle checks.
