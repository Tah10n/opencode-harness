# Benchmark v3 design boundary

Benchmark v3 is a model-free lab design, not an executable benchmark and not
release evidence. It exists to prevent another sequence of candidate runs from
starting before the statistical gate is demonstrably attainable. The design
does not add or change an active OpenCode profile, does not contain prompts, and
forbids model execution until a fresh corpus, runner, and immutable bindings are
reviewed and frozen in a later version.

## Why v2 is not reused

The P52 development generation produced a 34/36 baseline. With only two
baseline failures, even a perfect 36/36 candidate could create at most two
all-positive discordant family clusters. Its best possible one-sided exact
probability would therefore be 0.25, above the frozen 0.025 threshold. That run
was valid negative evidence for P52, but it also demonstrated that the design
could spend every candidate prompt in a generation where promotion was
mathematically impossible.

V3 forbids reuse of the v2 development, validation, and holdout splits. The
validation and holdout targets in the v3 design remain sealed and
unmaterialized. No prior hidden outcome may become a candidate instruction,
fixture selector, or routing signal.

## Frozen model-free controls

The design permits at most two registered architecture fingerprints and one
execution per candidate. A per-candidate alpha of 0.025 therefore has a
Bonferroni familywise upper bound of 0.05. Candidates must be registered before
their baseline is executed, failed candidates cannot be rerun, and an
architecture fingerprint cannot be relabeled and reused.

Development is planned around 60 independent family clusters, balanced 20/20/20
across small, medium, and high-risk strata. The exact-test power witness uses 20
discordant clusters and an alternative candidate win probability of 0.8. The
critical result is 15 candidate wins against five baseline wins:

- one-sided exact probability: 0.020694732666015625;
- power at the preregistered alternative: 0.8042077854595496;
- paired delta over 60 families: +0.16666666666666666;
- exact empirical cluster-bootstrap interval: [+0.03333333333333333, +0.3].

These values are recomputed rather than trusted from the JSON contract.
Changing the family count, alpha, candidate budget, effect floor, confidence
method, or power assumption requires a new design version.

## Baseline opportunity gate

Candidate execution is forbidden until its already-bound baseline finishes and
the host observes at least 15 baseline failures overall, with at least four in
each stratum. Only aggregate counts enter this gate. Baseline outcomes, family
identities, and hidden findings remain unavailable to the candidate.

If the opportunity bound is not met, the campaign terminates as
`design-uninformative-no-candidate-execution`. It is not a candidate rejection,
does not consume the candidate's one execution, and must not be bypassed by
changing thresholds or selecting families after the result. The former P52
baseline distribution (0 small, 0 medium, and 2 high-risk failures) is a
computational negative fixture and must be stopped before any candidate prompt.

## Remaining work before any model run

V3 is deliberately incomplete. A separate change must still provide and
review:

1. a fresh public development corpus with no v2 family reuse;
2. separately generated, sealed validation and holdout corpora;
3. a baseline-first runner that never exposes baseline outcomes to the
   candidate and enforces the opportunity gate before candidate execution;
4. a persistent candidate ledger bound to source, executable, model, provider,
   variant, evaluator, fixtures, and design fingerprints;
5. negative integration fixtures for abort, rerun, relabel, split-reuse,
   containment, and hidden-data access paths;
6. an explicit exact-SHA authorization for the first model-backed calibration
   or candidate run.

Until those controls exist and pass model-free verification, benchmark v3 must
not be described as runnable, frozen, powered in practice, or evidence of an
improved production harness.
