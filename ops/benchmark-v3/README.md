# Benchmark v3 operator environment

This image is the operational authority host for one benchmark-v3 campaign. It
pins Node 24.11.1 by multi-platform image digest and OpenCode 1.18.21 by the
published Linux asset SHA-256 for arm64 and x64.

The source tree is mounted read-only at `/workspace/source`. Four authority
keys and the one physical append-only execution registry live in
`opencode-harness-benchmark-v3-authority-v2`; reviewer one and reviewer two each
have a separate single-key volume that is never mounted into the authority
container. Protected channels live in
`opencode-harness-benchmark-v3-channels` for persistent root-owned
`/var/run/opencode-harness` receipts and private holdout custody. Campaign
outputs live only in the external directory mounted at `/campaign`.

The operational trust roots were rotated from non-operational development
placeholders on 2026-08-27. Public SPKI fingerprints and the custody-inventory
binding are committed in
`benchmarks/v3/operator-key-fingerprints.v1.json`; private keys are never part
of the source tree. `authority:init` creates the four authority keys once, and
each `reviewer:init` creates exactly one reviewer key. A complete existing custody is verified, while a partial custody, mismatched
inventory, weak mode, or key/registry mismatch fails closed.

The launcher resolves the built image to its immutable image ID and requires
its embedded source label to equal the exact reviewed SHA. It is also an npm-script allowlist whose accepted names are mapped directly
to fixed Node entrypoints, bypassing npm lifecycle hooks. `authority:init` runs
with no network, all Linux capabilities dropped, and no host cgroup access.
Every command, including bootstrap, requires `BENCHMARK_V3_REVIEWED_SOURCE_SHA` to equal the
exact clean mounted HEAD; only containment, calibration, readiness, and
canonical runner commands receive the privileged host-cgroup environment.
Provider authorization is accepted only for `bench:v3` or `bench:v3:holdout`.

Build the image from a clean tree; the launcher embeds that exact SHA:

```sh
ops/benchmark-v3/operator-container.sh build
```

Prepare a new semantic runtime with the public keys plus deterministic ESLint
4.0--4.19 (excluding the unreleased 4.9), 5.0--5.16, and 6.0--6.4
representatives, or extend an existing pre-freeze runtime in place:

```sh
BENCHMARK_V3_PROVENANCE_BUNDLE=/absolute/private/eslint-provenance.bundle \
npm run bench:v3:prepare-eslint-runtime -- \
  --extend-existing /absolute/private/eslint-runtime
```

The development gate fingerprints every valid named runtime directory, not
only keys exercised by the public corpus. The official study rechecks that exact
key set, and the holdout can use only a key with the same pre-baseline frozen
fingerprint.

Initialize custody once and copy only the generated public registry bundle to
the external campaign directory:

```sh
BENCHMARK_V3_CAMPAIGN_ROOT=/absolute/private/campaign \
ops/benchmark-v3/operator-container.sh run \
  npm run bench:v3:authority:init -- \
  --source-root /workspace/source \
  --custody-root /var/lib/opencode-harness/custody \
  --registry-output /campaign/operator-registry.json
```

After the public keys in that bundle have been reviewed and committed, run the
model-free operator verification. It checks the private keys against the
committed fingerprint ledger, scans the prospective source inventory for
parseable private keys, and performs real cgroup, descendant-teardown,
non-root Bubblewrap, hidden-read-denial, bounded-write, and executable-identity
probes:

```sh
BENCHMARK_V3_REVIEWED_SOURCE_SHA=<exact-reviewed-sha> \
BENCHMARK_V3_CAMPAIGN_ROOT=/absolute/private/campaign \
BENCHMARK_V3_PROVENANCE_BUNDLE=/absolute/private/eslint-provenance.bundle \
BENCHMARK_V3_SEMANTIC_RUNTIME_ROOT=/absolute/private/eslint-runtime \
ops/benchmark-v3/operator-container.sh run \
  npm run bench:v3:operator:verify -- \
  --source-root /workspace/source \
  --custody-root /var/lib/opencode-harness/custody \
  --opencode /usr/local/bin/opencode \
  --provenance-bundle /opt/benchmark-v3/provenance.bundle \
  --semantic-runtime /opt/benchmark-v3/semantic-runtime
```

The two external-sampling arguments and their two host environment paths are
optional only as pairs. The launcher mounts those exact inputs read-only only
for operator verification, commitment, and materialization. When present,
verification performs the complete model-free external calibration and prints
only the resulting counts and fingerprints; it does not reserve an authority
or create a holdout commitment.

On the final clean, frozen source, issue the execution authority without
reserving it. Issuance first creates a fixed O_EXCL claim in the physical
registry root, so a second authority cannot be minted while the model-execution
registry itself remains empty until the canonical runner reserves it:

```sh
BENCHMARK_V3_REVIEWED_SOURCE_SHA=<exact-reviewed-sha> \
BENCHMARK_V3_CAMPAIGN_ROOT=/absolute/private/campaign \
ops/benchmark-v3/operator-container.sh run \
  npm run bench:v3:authority:issue -- \
  --source-root /workspace/source \
  --custody-root /var/lib/opencode-harness/custody \
  --output /campaign/study \
  --receipt /var/run/opencode-harness/execution-authority/authority.json
```

Before baseline, derive the complete external sampling frame from the exact
frozen ESLint provenance bundle. The versioned
`semantic-private-subset-packing-frozen-eslint-history-v8` policy excludes all
210 public split commitments, removes every public source path from mixed
commits, and recalibrates only the remaining private ESLint runtime JavaScript
surface without relying on commit-subject keywords. For multi-file commits it
independently calibrates single-file witnesses and deterministically
maximum-matches commits to unique paths before considering remaining
whole-commit identities of at most four paths. Each single-file alternative is
byte-distinct and comes from the first passing later commit for that exact path.
For still-unmatched commits, it then calibrates the first minimal lexicographic
2--4 path subset composed only of paths unused by the single matching; this
second layer cannot evict or reuse a prior identity.
It calibrates pre-fix failure and both
the source-commit reference and the first byte-distinct later real-Git semantic
alternative that passes from the frozen history, then stores the frame, family pool, and unpredictable salt only in
private holdout custody. Stdout contains fingerprints and counts, never
identities, controls, reference bytes, or salt. All upstream JavaScript
calibration runs non-root in a no-network Bubblewrap namespace with the checkout
and semantic runtime mounted read-only. A fixed one-shot pre-baseline binding
also signs the exact private family-pool fingerprint and custody directory, so
neither a second salt nor a post-freeze pool substitution is accepted:

```sh
BENCHMARK_V3_REVIEWED_SOURCE_SHA=<exact-reviewed-sha> \
BENCHMARK_V3_CAMPAIGN_ROOT=/absolute/private/campaign \
BENCHMARK_V3_PROVENANCE_BUNDLE=/absolute/private/eslint-provenance.bundle \
BENCHMARK_V3_SEMANTIC_RUNTIME_ROOT=/absolute/private/eslint-runtime \
ops/benchmark-v3/operator-container.sh run \
  npm run bench:v3:holdout:commit -- \
  --source-root /workspace/source \
  --custody-root /var/lib/opencode-harness/custody \
  --output /campaign/study \
  --execution-authority /var/run/opencode-harness/execution-authority/authority.json \
  --provenance-bundle /opt/benchmark-v3/provenance.bundle \
  --semantic-runtime /opt/benchmark-v3/semantic-runtime \
  --campaign-custody /var/run/opencode-harness/holdout/campaign-001
```

Each independent read-only reviewer supplies a role-specific structured result
bound to the exact source SHA and tree, a unique review execution ID, the fixed
`independent-read-only-agent-v1` method, and a privacy-safe evidence
fingerprint. The same result cannot be reused for both identities and each
reviewer channel accepts only one issuance. First provision each isolated
single-key custody with `bench:v3:reviewer:init`. The matching reviewer then
uses `bench:v3:review:sign` to sign the exact evidence bytes and structured
zero-HIGH/zero-MEDIUM result. The authority-side `review:issue` has no reviewer
private key; it only verifies and imports the signed receipt into its protected channel:

```sh
BENCHMARK_V3_REVIEWED_SOURCE_SHA=<exact-reviewed-sha> \
BENCHMARK_V3_CAMPAIGN_ROOT=/absolute/private/campaign \
ops/benchmark-v3/operator-container.sh run \
npm run bench:v3:review:issue -- \
  --source-root /workspace/source \
  --reviewer one \
  --result /campaign/reviews/reviewer-one-signed.json \
  --receipt /var/run/opencode-harness/reviews/reviewer-one/review.json
```

Use `--reviewer two` and the reviewer-two paths for the second receipt. Issue
development readiness receipts only by running the real probes:

```sh
BENCHMARK_V3_REVIEWED_SOURCE_SHA=<exact-reviewed-sha> \
BENCHMARK_V3_CAMPAIGN_ROOT=/absolute/private/campaign \
ops/benchmark-v3/operator-container.sh run \
npm run bench:v3:readiness:issue -- \
  --source-root /workspace/source \
  --custody-root /var/lib/opencode-harness/custody \
  --opencode /usr/local/bin/opencode \
  --process-receipt /var/run/opencode-harness/readiness/process.json \
  --namespace-receipt /var/run/opencode-harness/readiness/namespace.json
```

After a passed validation freezes the candidate, materialize only the exact 90
precommitted identities into a staging directory, calibrate them again, sign
the external manifest, validate the closed inventory, and atomically rename it:

```sh
BENCHMARK_V3_REVIEWED_SOURCE_SHA=<exact-reviewed-sha> \
BENCHMARK_V3_CAMPAIGN_ROOT=/absolute/private/campaign \
BENCHMARK_V3_PROVENANCE_BUNDLE=/absolute/private/eslint-provenance.bundle \
BENCHMARK_V3_SEMANTIC_RUNTIME_ROOT=/absolute/private/eslint-runtime \
ops/benchmark-v3/operator-container.sh run \
npm run bench:v3:holdout:materialize -- \
  --source-root /workspace/source \
  --custody-root /var/lib/opencode-harness/custody \
  --output /campaign/study \
  --execution-authority /var/run/opencode-harness/execution-authority/authority.json \
  --holdout-commitment /var/run/opencode-harness/holdout/campaign-001/commitment.json \
  --campaign-report /campaign/study/report.json \
  --family-pool /var/run/opencode-harness/holdout/campaign-001/family-pool.private.json \
  --semantic-runtime /opt/benchmark-v3/semantic-runtime \
  --provenance-bundle /opt/benchmark-v3/provenance.bundle \
  --holdout-root /var/run/opencode-harness/holdout/campaign-001/materialized
```

Provider authorization is mounted as a root-only Docker secret file and named
with `OPENAI_API_KEY_FILE`; never pass the key as a Docker environment value or
command argument. The runner consumes the key through its one-shot credential
bridge, and Bubblewrap does not mount `/run/secrets` into model workspaces.

For the sealed holdout, the launcher unconditionally enables provider-only
egress for both readiness verification and execution; there is no permissive
default or operator override. The
entrypoint resolves `api.openai.com` before installing a default-deny OUTPUT
policy, pins only those addresses in a read-only hosts file, and then allows
HTTPS only to those provider addresses. Runtime DNS and every other destination
remain denied. `readiness:issue` verifies the allowed provider origin and denied
hostname, DNS, and direct-IP controls before issuing the provider-only egress
receipt.
