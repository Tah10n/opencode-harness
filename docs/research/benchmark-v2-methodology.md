# Benchmark v2 methodology

Status: development-only design contract. No model-backed v2 result exists yet.
The development and validation manifests are executable and their reference
solutions pass every visible, hidden, and consumer check. No model-backed v2
outcome exists, and the holdout is intentionally unselected.

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
