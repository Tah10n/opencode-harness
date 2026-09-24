# reservoir-sample-resume

Upgrade existing reservoir API in src/reservoir.mjs from retaining first capacity items to deterministic online Algorithm R, preserving createReservoir(capacity,seed=1), restoreReservoir(snapshot), add(value), addAll(values), values(), snapshot(). Domain: capacity integer1..1000, nonzero uint32 seed;<=1000000 total items, each finite JSON data (plain string-keyed data objects/dense arrays/scalars, no cycles, getters, toJSON, exotic types), depth<=50. addAll receives dense array. First capacity items fill sample slots unchanged with NO RNG draws. For every later item with1-based count n, advance uint32 xorshift32 state exactly once: x ^= x<<13; x ^= x>>>17; x ^= x<<5; unsigned32 result. Let j=floor((rng/4294967296)*n); replace sample[j] iff j<capacity, otherwise retain sample but still advance RNG/count. Slot order is retained, not sorted. add/addAll return undefined. Snapshot schema {version:1,capacity,count,rng,sample}; count integer0..1000000, sample length=min(capacity,count), rng nonzero uint32; invalid metadata TypeError('snapshot'). Restore accepts any structurally valid metadata/sample, need not prove reachability from seed. At input and restore boundaries normalize numeric -0 to positive0 recursively, matching JSON value semantics. All API boundaries deep-copy data, including input and returned/restored samples. JSON round-trip then continuation must equal uninterrupted state. Before any mutation, addAll checks entire count limit and deep-copies batch; over limit RangeError('count') leaves state unchanged. No ambient Math.random, replay of past items or new seed during restore.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert fixed sampling/PRNG vectors and resumed JSON snapshot equals uninterrupted batch/sample state.
- Assert deep-copy ownership, metadata errors and atomic count-limit rejection.

Update project documentation to explain:
- Document Algorithm R draw timing, xorshift steps, replacement rule and slot order.
- Explain snapshot schema, deep copies, restore and count-limit behavior.

Run npm test after the last source or test change.
