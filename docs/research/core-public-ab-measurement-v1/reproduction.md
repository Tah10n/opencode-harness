# Reproduction commands

These commands intentionally use operator-supplied environment variables for
private local custody paths. Do not commit their values.

```sh
git switch research/core-public-ab-measurement-v1
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
  --manifest-output measurement-manifest.json \
  --timeout-ms 900000 \
  --parallel-pairs 4

node scripts/benchmark-core-public-ab.mjs --mode run \
  --manifest measurement-manifest.json \
  --pilot-manifest "$PRIVATE_PILOT_MANIFEST" \
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
  --manifest measurement-manifest.json \
  --pilot-manifest "$PRIVATE_PILOT_MANIFEST" \
  --campaign-root "$PRIVATE_CAMPAIGN_ROOT" \
  --summary-output benchmarks/results/core-public-ab-measurement-v1/summary.json \
  --report-output benchmarks/results/core-public-ab-measurement-v1/report.md \
  --ledger-output benchmarks/results/core-public-ab-measurement-v1/attempt-hash-ledger.json
```

The `run` command is exact-resumable against the same campaign directory. A
different manifest, runner, task binding, candidate, executable, runtime, or
pilot artifact is rejected.

