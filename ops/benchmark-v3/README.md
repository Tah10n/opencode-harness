# Benchmark v3 operator environment

This image is the operational authority host for one benchmark-v3 campaign. It
pins Node 24.11.1 by multi-platform image digest and OpenCode 1.18.21 by the
published Linux asset SHA-256 for arm64 and x64.

The source tree is mounted read-only at `/workspace/source`. Root-only private
keys, protected channels, and the one physical append-only execution registry
live in two separate named volumes: `opencode-harness-benchmark-v3-custody`
for keys and the physical registry, and
`opencode-harness-benchmark-v3-channels` for persistent root-owned
`/var/run/opencode-harness` receipts and private holdout custody. Campaign
outputs live only in the external directory mounted at `/campaign`.

The operational trust roots were rotated from non-operational development
placeholders on 2026-08-27. Public SPKI fingerprints and the custody-inventory
binding are committed in
`benchmarks/v3/operator-key-fingerprints.v1.json`; private keys are never part
of the source tree. `authority:init` creates six distinct Ed25519 keys once. A
complete existing custody is verified, while a partial custody, mismatched
inventory, weak mode, or key/registry mismatch fails closed.

Build the image:

```sh
ops/benchmark-v3/operator-container.sh build
```

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
BENCHMARK_V3_CAMPAIGN_ROOT=/absolute/private/campaign \
ops/benchmark-v3/operator-container.sh run \
  npm run bench:v3:operator:verify -- \
  --source-root /workspace/source \
  --custody-root /var/lib/opencode-harness/custody \
  --opencode /usr/local/bin/opencode
```

On the final clean, frozen source, issue the execution authority without
reserving it:

```sh
BENCHMARK_V3_CAMPAIGN_ROOT=/absolute/private/campaign \
ops/benchmark-v3/operator-container.sh run \
  npm run bench:v3:authority:issue -- \
  --source-root /workspace/source \
  --custody-root /var/lib/opencode-harness/custody \
  --output /campaign/study \
  --receipt /var/run/opencode-harness/execution-authority/authority.json
```

Before baseline, derive the complete external sampling frame from the exact
frozen ESLint provenance bundle. The generator excludes all 210 public split
commitments and every public source path, calibrates pre-fix failure and both
the source-commit reference and a byte-distinct nearest-later real-Git semantic
alternative from the frozen history, then stores the frame, family pool, and unpredictable salt only in
private holdout custody. Stdout contains fingerprints and counts, never
identities, controls, reference bytes, or salt:

```sh
BENCHMARK_V3_CAMPAIGN_ROOT=/absolute/private/campaign \
ops/benchmark-v3/operator-container.sh run \
  npm run bench:v3:holdout:commit -- \
  --source-root /workspace/source \
  --custody-root /var/lib/opencode-harness/custody \
  --output /campaign/study \
  --execution-authority /var/run/opencode-harness/execution-authority/authority.json \
  --provenance-bundle /campaign/private/eslint-provenance.bundle \
  --semantic-runtime /campaign/private/eslint-runtime \
  --campaign-custody /var/run/opencode-harness/holdout/campaign-001
```

Each independent read-only reviewer supplies a structured result bound to the
exact source SHA and tree. `review:issue` signs only zero-HIGH/zero-MEDIUM
results with that reviewer's separate key and channel:

```sh
npm run bench:v3:review:issue -- \
  --source-root /workspace/source \
  --custody-root /var/lib/opencode-harness/custody \
  --reviewer one \
  --result /campaign/reviews/reviewer-one-result.json \
  --receipt /var/run/opencode-harness/reviews/reviewer-one/review.json
```

Use `--reviewer two` and the reviewer-two paths for the second receipt. Issue
development readiness receipts only by running the real probes:

```sh
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
npm run bench:v3:holdout:materialize -- \
  --source-root /workspace/source \
  --custody-root /var/lib/opencode-harness/custody \
  --output /campaign/study \
  --execution-authority /var/run/opencode-harness/execution-authority/authority.json \
  --holdout-commitment /var/run/opencode-harness/holdout/campaign-001/commitment.json \
  --campaign-report /campaign/study/report.json \
  --family-pool /var/run/opencode-harness/holdout/campaign-001/family-pool.private.json \
  --semantic-runtime /campaign/private/eslint-runtime \
  --provenance-bundle /campaign/private/eslint-provenance.bundle \
  --holdout-root /var/run/opencode-harness/holdout/campaign-001/materialized
```

Provider authorization is mounted as a root-only Docker secret file and named
with `OPENAI_API_KEY_FILE`; never pass the key as a Docker environment value or
command argument. The runner consumes the key through its one-shot credential
bridge, and Bubblewrap does not mount `/run/secrets` into model workspaces.

For the sealed holdout only, set `BENCHMARK_V3_PROVIDER_ONLY_EGRESS=1`. The
entrypoint then installs a default-deny OUTPUT policy allowing DNS and HTTPS to
the currently resolved `api.openai.com` addresses. `readiness:issue` verifies
both the allowed provider origin and denied hostname/direct-IP controls before
issuing the provider-only egress receipt.
