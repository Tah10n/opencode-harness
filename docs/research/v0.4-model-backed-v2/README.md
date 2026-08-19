# v0.4 model-backed component study

## Outcome

**STUDY COMPLETE — NO COMPONENT PROMOTED.**

The primary campaign completed all five preregistered profile-transition
estimands with trusted, contained, model-backed standard evidence. All 130
standard pairs were complete, none were marked incomplete, and the frozen
runner returned `reject` for every transition. No full suite was run because
the in-process standard-to-full gate never returned `promotable: true`.

These results are specific to `openai/gpt-5.6-luna`, provider `openai`, variant
`low`, on studied source SHA
`7e4c3bd26f073f66a0ad6fd07451cbb9eb4b622a`. They do not establish a
provider-independent or architecture-independent conclusion.

Campaign fingerprint:
`sha256:29508d7ed1a63a03e6554e1e020d0586ad4c945195e17ad524a3fc8c8753b406`.
It is the SHA-256 of the exact 20-line [artifact ledger](artifact-hashes.sha256),
which binds the frozen manifest and the 19 primary/diagnostic JSON evidence
artifacts. Derived summaries such as this report and `component_decisions.json`
are deliberately outside that non-recursive campaign fingerprint and have
separate hashes in `derived-hashes.sha256`.

## Studied transitions

| Estimand | Target metric | Baseline | Candidate | Paired delta, 95% CI | Failed guardrail | Runner verdict |
| --- | --- | ---: | ---: | --- | --- | --- |
| `plain-to-core-rules` | functional hidden-check success | 0.0769 | 0.1154 | +0.0385, [0, 0.1154] | introduced HIGH/MEDIUM defects: 0.0385 > 0 | reject |
| `core-rules-to-core-verified` | verification omission | 0.9231 | 0.9231 | 0, [0, 0] | introduced HIGH/MEDIUM defects: 0.0769 > 0 | reject |
| `core-verified-to-core-reviewed` | introduced HIGH/MEDIUM defects | 0.0769 | 0.0769 | 0, [0, 0] | introduced HIGH/MEDIUM defects: 0.0769 > 0 | reject |
| `core-reviewed-to-deep` | missed-consumer rate | 0 | 0 | 0, [0, 0] | introduced HIGH/MEDIUM defects: 0.0769 > 0 | reject |
| `deep-to-assurance` | regression-free high-risk success | 0 | 0 | 0, [0, 0] | introduced HIGH/MEDIUM defects: 0.0769 > 0 | reject |

The exact machine decisions, run/evidence/comparison fingerprints, target
effects, and failed guardrails are in
[`component_decisions.json`](component_decisions.json). The comparison JSON
files retain all product, operational, family, stratum, Pareto, confidence
interval, and guardrail detail.

The observed target deltas must not be read in isolation. The first transition,
for example, had a positive point estimate for hidden-check success but failed
the preregistered zero-tolerance introduced-defect guardrail. The other four
transitions did not improve their target metric and failed the same guardrail.

## Study design and frozen bindings

The [campaign manifest](campaign-manifest.json) was written before official
model runs. It binds:

- base SHA `47f58de1f51930610dd9cf2272f38de9f7485e35` and studied source SHA
  `7e4c3bd26f073f66a0ad6fd07451cbb9eb4b622a`;
- the five estimands and separate smoke, standard, full, and replication seeds;
- model `openai/gpt-5.6-luna`, provider `openai`, variant `low`, and a
  300,000 ms per-agent timeout;
- promotion-policy fingerprint
  `sha256:f050a814723943d10c4346aa295606a316c02f21c250eeef82611a8c7409e6f3`.

The fingerprint-bound post-run envelopes additionally record the inventory
fingerprint
  `sha256:8054c2a1e944ecbc6278a6e5577936f0b99550423183d8defe5d50741f7f441f`;
the contract fingerprint
  `sha256:84130aa932b04a3e090a6b6750c73cccba6b5c5e2ff4e4326e5ab409869b3274`;
the OpenCode executable identity
  `sha256:535c3132070d10ef43506e061933834728aa0ff611fe55e7dffb3ab89de821d8`;
the adapter/engine fingerprint
  `sha256:dfd2ca4271042a2416e30c82fbd2e0fa7b4566cf7d87b49093fff8038126ec20`;
and the evaluator fingerprint
  `sha256:7f8f56432c7401b938cc5fcf0ef413107e8855fe02d0d3131742cdba6aefa6e0`.
These values were validated by the frozen runner but were not all explicitly
copied into the preregistration manifest. Fixture fingerprints are
estimand-specific and are retained in each envelope; for the five transitions
they are `ae2bad93…`, `5b23c44d…`, `bcb8a6f0…`, `f4199b17…`, and
`4e88fde8…`, respectively.

Each official standard promotion result binds 26 complete paired outcomes:
16 target-stratum pairs and 10 small negative-control pairs, across 13 task
families. The runner serialized pairs and persisted no raw model output.

### Manifest erratum

The frozen manifest records `runner_policy.trajectory_repetitions` as 1, while
the suite-owned standard plans and reports bind 2. This field was not rewritten
after results. This is a preregistration protocol deviation. The independently
frozen suite contract selected two repetitions and the fingerprint-bound report
records the executed value; neither retroactively corrects the manifest.
Seeds, thresholds, family selection, and decisions were not changed. The
deviation is retained visibly rather than silently corrected.

## Benchmark repair before the campaign

The studied source includes the benchmark repair committed as:

`7e4c3bd26f073f66a0ad6fd07451cbb9eb4b622a fix(benchmark): validate multi-file visible checks end to end`

The repair makes multi-file rendered visible checks execute every exact
renderer-created public file in one `node --test` invocation, preserves all
existing confinement and duplicate/options checks, and makes the preflight run
syntax, primary reproducer, auxiliary checks, and the combined visible suite.
It also adds deterministic verification for all 26 vNext families and negative
fixtures. During pre-campaign review, bounded P5 facade/continuation/parser and
atomic-start defects exposed by the repaired benchmark were fixed and covered
by regression tests.

The final frozen source passed `npm run verify:v0.4`,
`npm run bench:vnext:self-test`, `npm run verify:benchmark:adapter`, and
`npm run verify:normal-session-quality-bridge`. The installed normal-session
runtime hook check remained externally unavailable without a host-owned adapter;
the deterministic bridge check passed. Model-free and structural checks are
reported separately and are not treated as model-backed success.

## Contained environment and acceptance

The campaign ran in a purpose-built Linux container:

- Linux `7.0.12-linuxkit` on `aarch64`;
- OpenCode `1.18.18`, Node.js `24.19.0`;
- image `opencode-vnext-study:1.18.18`, digest
  `sha256:876706be8057ab586186838a30984f45a3d97fd37e132f9471e9422009dd79bc`;
- non-privileged container with only `SYS_ADMIN` added, private PID namespace,
  and private cgroup-v2 namespace;
- workload user `opencode`, UID 1001;
- root-owned, workload-read-only frozen source;
- separate guarded cgroup roots and privileged allow-listed attach helpers for
  adapter work and trusted checks.

`verify:trusted-project-runner` and `verify:process-containment` both reported
`linux-cgroup-v2: verified`. Before the official campaign, two model-backed
acceptance envelopes completed with 2/2 pairs and no incomplete outcomes:

- plain acceptance: file SHA-256 `8a88e7a6…`, evidence fingerprint
  `sha256:adf92369a4531f660e5746956ffdf088a5aa32181c87a5c43df3399880e115d5`;
- P5 assurance acceptance: file SHA-256 `e76c975b…`, evidence fingerprint
  `sha256:62a35611c9d484ca543958cc49e7fa5efe552cd3d0765e5392b2e09537f00000`.

All five official smoke envelopes then completed 2/2 pairs with no incomplete
outcomes. Their file hashes are bound in the artifact ledger.

## Promotion execution and operational retry

Saved standard runs are inspectable but cannot authorize full. Each official
decision was therefore produced by `bench:vnext:promote`, which reruns standard
and applies the frozen policy in the same trusted process.

The first promotion attempt used incorrect abbreviated environment-variable
names, failed closed before scoring with `process_containment_unavailable`, and
marked all pairs incomplete. It is retained under `artifacts/diagnostic/` and
is excluded from the result. After both cgroup boundaries were reverified with
the contract-required `OPENCODE_QUALITY_*` variables, the same frozen seed was
retried once under the preregistered external-failure retry rule. That retry
completed 26/26 pairs and produced the official `reject` decision. No completed
bad model outcome was retried.

All five final in-process standard decisions were non-promotable. Running full
would therefore have violated the benchmark's authorization contract; no full
artifact exists.

## Secondary model status

The ephemeral runtime had one credential-qualified provider: OpenAI. Other
listed OpenAI models did not satisfy the requested independent-provider or
established independent-architecture condition. Anonymous `opencode/*-free`
catalog entries were not preregistered, credential-qualified, or availability
qualified. No confirmatory secondary campaign was run. The result is explicitly
model-specific.

## Privacy and artifact policy

Provider credentials existed only in the ephemeral workload user's Linux home.
They were excluded from the image, repository, logs, raw outputs, and published
artifacts. The runner persisted bounded observations and fingerprints, never raw
model output. Exact credential-fragment scans were performed before publication;
the privacy-safe [`privacy-scan-receipt.json`](privacy-scan-receipt.json) records
the exact scanned file-set fingerprint, counts, and pass/fail status, but not the
fragments themselves. The receipt is an operator verification record rather
than runner-produced model evidence.

The `artifacts/` directory contains only:

- final acceptance envelopes;
- five official smoke envelopes;
- five in-process standard promotion results;
- five inspectable comparison reports;
- one valid standalone standard diagnostic and the one fail-closed operational
  retry diagnostic.

## Reproduction and verification

From this directory, verify the complete published input/evidence bundle:

```sh
shasum -a 256 -c artifact-hashes.sha256
shasum -a 256 artifact-hashes.sha256
shasum -a 256 -c derived-hashes.sha256
```

The second command must print campaign fingerprint
`29508d7ed1a63a03e6554e1e020d0586ad4c945195e17ad524a3fc8c8753b406`.

Re-executing model-backed evidence additionally requires OpenCode 1.18.18, the
exact studied checkout, a compatible qualified model binding, provider
credentials, and both guarded Linux cgroup-v2 boundaries. The runner fails
closed when these prerequisites are absent. Reproduction can compare artifact
structure, bindings, policy decisions, and hashes exactly; stochastic model
outputs are not expected to be byte-identical across fresh provider calls.

The bundle is not sufficient to canonically rebuild the P5
`deep-to-assurance` plan independently. That plan binds the ephemeral
host-generated `quality-toolchains.host.v1.json` fingerprint
`sha256:7007642eff50163404e7a9458ecc33eab5b6cc4cfcd6d91405dc2c89829369ba`,
but the redacted configuration and a standalone container build recipe are not
published. The existing P5 envelope and decision remain fingerprint-verifiable;
a fresh external rebuild may correctly fail `VNEXT_PLAN_NONCANONICAL`. The
other four comparison plans rebuild from the published source/environment
inputs used in this campaign.

## Decision

No transition is promoted, no default behavior changes on the basis of this
study, and `assurance` remains experimental. The repaired benchmark and its
regression coverage are publishable independently of the negative product
study. Any future promotion attempt must start a new campaign with a new frozen
manifest, explicitly correct the repetition metadata, predeclare any secondary
binding, and satisfy every frozen guardrail without reusing these results to
tune thresholds.
