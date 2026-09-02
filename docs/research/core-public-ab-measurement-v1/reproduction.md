# Reproduction commands

These commands intentionally use operator-supplied environment variables for
private local custody paths. Do not commit their values.

```sh
git switch research/core-public-ab-measurement-v1
node scripts/benchmark-core-public-ab.mjs --mode contract-self-test
node scripts/benchmark-core-public-ab.mjs --mode self-test

node scripts/benchmark-core-public-ab.mjs --mode prepare-public-runtime \
  --public-repository "$PUBLIC_ESLINT_BARE_REPOSITORY" \
  --output "$PUBLIC_SEMANTIC_RUNTIME"

node scripts/benchmark-core-public-ab.mjs --mode freeze \
  --product-source-root "$EXACT_PRODUCT_SOURCE_ROOT" \
  --core-bundle "$EXACT_CORE_BUNDLE" \
  --opencode "$OPENCODE_EXECUTABLE" \
  --public-runtime "$PUBLIC_SEMANTIC_RUNTIME" \
  --pilot-root "$EPOCH2_PRIVATE_ROOT" \
  --pilot-artifact "$EPOCH2_PRIVATE_CALIBRATION_ARTIFACT" \
  --pilot-public-key "$EPOCH2_CALIBRATION_PUBLIC_KEY" \
  --pilot-runtime-manifest "$EPOCH2_RUNTIME_MANIFEST" \
  --pilot-manifest-output "$PRIVATE_PILOT_MANIFEST" \
  --manifest-output research/measurements/core-public-ab-v1/measurement-manifest.json \
  --timeout-ms 900000 \
  --parallel-pairs 1

git add -- research/measurements/core-public-ab-v1/measurement-manifest.json
git commit -m "research: freeze oracle-validated measurement manifest"
git push
gh pr checks --watch
test "$(gh pr view --json headRefOid --jq .headRefOid)" = "$(git rev-parse HEAD)"
test -z "$(git status --porcelain=v1 --untracked-files=all)"

node scripts/benchmark-core-public-ab.mjs --mode acceptance-probe \
  --manifest research/measurements/core-public-ab-v1/measurement-manifest.json \
  --core-bundle "$EXACT_CORE_BUNDLE" \
  --opencode "$OPENCODE_EXECUTABLE" \
  --acceptance-output "$PRIVATE_ACCEPTANCE_RECEIPT"

node scripts/benchmark-core-public-ab.mjs --mode run \
  --manifest research/measurements/core-public-ab-v1/measurement-manifest.json \
  --pilot-manifest "$PRIVATE_PILOT_MANIFEST" \
  --acceptance-receipt "$PRIVATE_ACCEPTANCE_RECEIPT" \
  --product-source-root "$EXACT_PRODUCT_SOURCE_ROOT" \
  --core-bundle "$EXACT_CORE_BUNDLE" \
  --opencode "$OPENCODE_EXECUTABLE" \
  --opencode-auth "$OPENCODE_AUTH_FILE" \
  --public-repository "$PUBLIC_ESLINT_BARE_REPOSITORY" \
  --public-runtime "$PUBLIC_SEMANTIC_RUNTIME" \
  --pilot-root "$EPOCH2_PRIVATE_ROOT" \
  --pilot-artifact "$EPOCH2_PRIVATE_CALIBRATION_ARTIFACT" \
  --pilot-public-key "$EPOCH2_CALIBRATION_PUBLIC_KEY" \
  --pilot-runtime-manifest "$EPOCH2_RUNTIME_MANIFEST" \
  --campaign-root "$PRIVATE_CAMPAIGN_ROOT"

node scripts/benchmark-core-public-ab.mjs --mode report \
  --manifest research/measurements/core-public-ab-v1/measurement-manifest.json \
  --pilot-manifest "$PRIVATE_PILOT_MANIFEST" \
  --campaign-root "$PRIVATE_CAMPAIGN_ROOT" \
  --summary-output benchmarks/results/core-public-ab-measurement-v1/summary.json \
  --report-output benchmarks/results/core-public-ab-measurement-v1/report.md \
  --ledger-output benchmarks/results/core-public-ab-measurement-v1/attempt-hash-ledger.json
```

The manifest is created only after the runner commit has passed exact-head CI.
Freeze itself must pass both the real OpenCode Seatbelt startup probe and the
private trusted-Node core-catalog probe; both are provider-free.
It is then committed without changing the runner, pushed to the existing draft
PR, and required to pass exact-head CI again before the first model call. The
manifest binds the earlier runner source SHA and exact runner SHA-256; the
runner requires that source SHA to remain an ancestor and its bytes to remain
identical. The `run` command also requires a clean tree and is exact-resumable
against the same campaign directory. A different manifest, runner, task
binding, candidate, executable, runtime, or pilot artifact is rejected.
Pair execution is frozen to one because the macOS containment boundary owns one
exclusive workload UID and one lease. Running sibling attempts concurrently
under that UID would violate the controller's process-exclusivity contract.

After the manifest commit passes exact-head CI, `acceptance-probe` executes one
full `opencode run` startup path for each arm through the same provider-only
Unix-socket bridge and the real core wrapper. The bridge returns a deterministic
local synthetic response and makes zero external provider submissions and zero
model calls, so the frozen 196-call ceiling remains unchanged. The campaign
refuses to start without the content-bound two-arm acceptance receipt.

The two superseded preflight epochs reached two and eight OpenCode process
starts respectively, but zero proxy requests and zero provider submissions.
Both were invalidated as critical pre-model runner defects; none of their
synthetic process outcomes may be imported into, or retried within, the frozen
model-backed campaign.

The first committed manifest freeze was also invalidated before any model or
provider call. Its provider-free plain acceptance path showed that the proxy
plugin file had been copied but was absent from OpenCode's effective `plugin`
array. The failed probe and one retained-root diagnostic probe each made zero
proxy requests and zero provider submissions. Their manifest and private
acceptance artifacts are superseded and must not be reused.
