# bounded-lru-persistence

Implement createCache(capacity) with persisted least-to-most-recent ordering. put(key,value) snapshots the value and makes key most recent, replacing existing key without consuming another slot. get(key) returns detached value and promotes a hit; a miss returns undefined and changes no order. peek(key) returns a detached value without promotion; entries() returns detached {key,value} records least-recent first and is also side-effect free. After puts, evict oldest until size<=capacity. restore(entries) replaces the cache using input order as least-to-most recent, validates duplicate keys before any mutation (TypeError on duplicate), deep-copies values, and retains only the last capacity entries if input is oversized. Do not interpret inspection or restoration as reads that promote keys. Domain: capacity integer 1..100; arbitrary ASCII string keys, ordinary acyclic JSON values/dense arrays without getters/custom methods/undefined/symbols/nonfinite numbers or -0; valid dense record arrays except duplicate keys included for rejection. Preserve single put/get and miss behavior.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- get promotion versus side-effect-free peek and capacity eviction.
- Restore retains newest ordered entries and duplicate failure is atomic.

Update project documentation to explain:
- Least-to-most order, replacement promotion and inspection semantics.
- Snapshot ownership and restore validation before capacity trimming.

Run npm test after the last source or test change.
