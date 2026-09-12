# deterministic-shuffle-source

Extract existing descending Fisher-Yates shuffle into exported shuffleWithRandom(values,random) in src/shuffle-core.mjs. Retain shuffle(values) in src/shuffle.mjs, extending it with optional {random}, missing/undefined default Math.random at call time, and delegate to core without a second shuffle implementation. Return a fresh shallow array, preserve source and element identities/duplicates. Exact existing sequence: for i=n-1 down to1, call random once with no arguments/undefined thisArg, require finite Number0<=r<1 (else RangeError), j=floor(r*(i+1)), then swap i,j. Do not sample for n0/1, retry invalid draws, use random sort or add extra draws. A throwing random propagates exact reason; failed calls leave source unchanged even after earlier swaps to the local result. Domain: dense ordinary arrays<=10000 arbitrary elements, possibly frozen, nonmutating synchronous callable random; no sparse arrays, async source, cryptographic claim or global RNG mutation. Preserve legacy default entry point and algorithm order.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert deterministic known draw sequence, n-1 calls and no input/identity loss.
- Assert zero/singleton no draws, invalid/throwing source and dynamic default source behavior.

Update project documentation to explain:
- Describe injected core/default wrapper and exact draw sequence.
- Explain valid random range, no retries, shallow permutation and no cryptographic guarantee.

Run npm test after the last source or test change.
