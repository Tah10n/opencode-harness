# Model amendment before the first attempt

On 2026-10-20 the owner explicitly requested `openai/gpt-6-luna` and authorized
changing the model and freeze. This supersedes the `openai/gpt-5.6-luna` model
pin in the original [plan](PLAN.md), without changing the experimental design.
The original [preflight](PREFLIGHT.md) remains historical preparation evidence.

The first invocation of the authorized launcher was stopped during its
model-free input checks after the owner's new instruction arrived. Three of
eight input checks had completed; no slot directory or provider request existed.
The launcher terminated with exit 143. Its remaining input-check container
exited with code 0 and was removed. This was not a model attempt or a retry.
The partial input-check evidence and original local freeze are retained privately.

The accepted original head was
`c57888631a8c75bd31f800957428fc80028ebdd5`, with adapter
`16d390e7458383fd94efb67c4bd76e1ee498a198`. Its freeze SHA-256 remains
`ab80a1800f9b4a5622a33e80eb87c8be63c85fc16f1acc3c596a7f732ca8579b`;
the original public manifest is preserved byte-for-byte in
[history/gpt-5.6-luna-frozen-manifest.json](history/gpt-5.6-luna-frozen-manifest.json).
The active [frozen manifest](frozen-manifest.json) binds adapter
`41dd7ecc7b05be623f8b54186d80b53b4ed8870a` and the amended model before any
participant starts. Its freeze SHA-256 is
`e66e10b7725609fae063f444856f91ec6474e2308ad6e360fe24b3e8b4904970`.

Only the model pin, its small-model/provider configuration, and the hashes and
adapter provenance affected by this amendment change. The campaign name and
canonical batch path, selected tasks and their order, exact original/augmented
inputs, comments and cutoffs, product/core/prompts, dependencies, OpenCode
1.18.26, evaluator, `high` reasoning, 1800-second complete-attempt budget,
concurrency one, 16 one-shot slots, zero retries, scoring and stop policy remain
unchanged. No original baseline/gold control is rerun for this model-only change.
Existing code generates the replacement freeze at the canonical batch path;
no alternate launcher or batch copy is used for model execution.

The model identifier and `high` reasoning are documented in the
[official GPT-6 Luna model reference](https://developers.openai.com/api/docs/models/gpt-6-luna).
That documentation and the owner's successful interactive OpenCode use do not
prove provider availability inside this frozen experiment. No separate model
smoke or authentication inference probe is authorized or performed.

The four comparisons remain P1 − P0, C1 − C0, C0 − P0 and C1 − P1, each with
R/T/D, wins/losses/ties/unknown and usage. Results will describe GPT-6 Luna on
this limited development set; they must not be attributed to GPT-5.6 Luna or
pooled with historical campaigns.

## Validation of the amended configuration

The existing four-cell allocation and fail-closed mutation checks passed.
The existing real-launcher scripted preflight also passed for P0/P1/C0/C1:
each cell emitted five local scripted requests, all with `gpt-6-luna` and
`high`, and completed with captured evidence, verified termination and relay
removal. Whole task envelopes and core presence were checked by the unchanged
preflight. These 20 scripted requests are separate from model usage and prove
configuration delivery only; external model requests remain zero at this point.

The ordinary freeze generator completed using existing preparation. A structural
comparison with the original private freeze confirmed that only `adapterSha`,
`model`, the model fields in `config`, and three entries in `files` changed.
Those three hashes bind `campaign.json`, `selection.json` and
`public-context-campaign.mjs`. All source/runtime manifests, environments,
attempts, input variants, templates, budgets and other fields are identical.
The public manifest differs only in model, adapter SHA, configuration hash and
freeze hash. Original plan/preflight bytes and all original control hashes
remain unchanged.
