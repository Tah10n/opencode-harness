# version-vector-relations

Implement version vector comparison and merge with a local clock. compare(a,b) returns equal, before, after or concurrent: compare every actor component with missing components treated as 0; before/after require at least one strict inequality and none in the other direction. merge(a,b) returns a new vector containing componentwise maxima and omitting zero-valued entries; keys appear in normal JavaScript enumeration order after construction from ASCII-sorted actor entries (integer-like keys still follow JS own-key rules). createClock(initial={}) canonicalizes a snapshot, observe(other) merges without incrementing, tick(actor) increments only that actor and returns its new counter, snapshot() returns a detached vector. Inputs and results must not alias state. Domain: plain own-data records with nonempty ASCII actor keys including __proto__/constructor, nonnegative safe integer counters with safe increments, no getters or inherited vector components. All emitted actor keys must be own enumerable data properties; result prototype is not constrained. Preserve empty equality and single-actor ticks.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Causal order versus concurrency and explicit zero equivalence.
- Observe does not reduce local counters, tick is actor-local and snapshots detached.

Update project documentation to explain:
- Missing means zero, componentwise relation and max merge with zero omission.
- Observe versus tick, special actor own properties and state snapshot ownership.

Run npm test after the last source or test change.
