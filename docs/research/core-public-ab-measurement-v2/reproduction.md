# Reproduction commands

Run these commands as the ordinary invoking user. Do not use `sudo` and do not
set any `OPENCODE_QUALITY_MACOS_*` variable. Private paths are operator-supplied
and must not be committed.

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
  --manifest-output research/measurements/core-public-ab-v2/measurement-manifest.json \
  --timeout-ms 900000 \
  --parallel-pairs 1

git add -- research/measurements/core-public-ab-v2/measurement-manifest.json
git commit -m "research: freeze current-user measurement v2"
git push
gh pr checks --watch
test "$(gh pr view --json headRefOid --jq .headRefOid)" = "$(git rev-parse HEAD)"
test -z "$(git status --porcelain=v1 --untracked-files=all)"

node scripts/benchmark-core-public-ab.mjs --mode acceptance-probe \
  --manifest research/measurements/core-public-ab-v2/measurement-manifest.json \
  --core-bundle "$EXACT_CORE_BUNDLE" \
  --opencode "$OPENCODE_EXECUTABLE" \
  --acceptance-output "$PRIVATE_ACCEPTANCE_RECEIPT"

node scripts/benchmark-core-public-ab.mjs --mode run \
  --manifest research/measurements/core-public-ab-v2/measurement-manifest.json \
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
  --manifest research/measurements/core-public-ab-v2/measurement-manifest.json \
  --pilot-manifest "$PRIVATE_PILOT_MANIFEST" \
  --campaign-root "$PRIVATE_CAMPAIGN_ROOT" \
  --summary-output benchmarks/results/core-public-ab-measurement-v2/summary.json \
  --report-output benchmarks/results/core-public-ab-measurement-v2/report.md \
  --ledger-output benchmarks/results/core-public-ab-measurement-v2/attempt-hash-ledger.json
```

The runner creates the v2 manifest only from a clean tree. Commit and push the
manifest without changing the runner, wait for exact-head CI again, and run the
provider-free two-arm acceptance probe before the first model call. The
campaign is exact-resumable only against the same manifest and private campaign
directory.
