# priority-inbox-state

Implement createInbox() with enqueue(id,payload,priority,readyAt), setPriority(id,priority), defer(id,readyAt), ready(now), claim(now), snapshot(), restore(snapshot). enqueue assigns monotonically increasing sequence starting at1, snapshots payload and returns sequence; duplicate pending ID throws TypeError without consuming a sequence. A removed ID may be enqueued again with a fresh sequence. setPriority/defer update only that field and retain sequence, returning false for missing ID and true otherwise. ready returns detached readyAt<=now items ordered highest priority first, then lowest sequence; no state change. claim removes and returns first ready item or null. A deferred high-priority item must not block lower ready items. Snapshot is {nextSequence,items}, items sorted by sequence, each {id,payload,priority,readyAt,sequence}. restore atomically replaces state, preserving provided nextSequence including gaps left by removed items. Validate positive safe nextSequence; unique pending IDs and sequences; positive safe item sequence<nextSequence; integer priority -10..10 and readyAt integer0..1e12. Invalid snapshot values throw TypeError without mutation. Snapshot shape/IDs/payload domain are already valid; only listed inconsistencies require rejection. All inputs/results are detached, no system clock. now is supplied explicitly. Preserve empty inbox and a single ready claim.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Deferred high-priority item does not block ready items; equal priority retains insertion order after edits.
- Snapshot restore preserves sequence gaps and invalid restore leaves state intact.

Update project documentation to explain:
- Readiness boundary, priority/sequence ordering and ID reuse rules.
- Detached snapshot schema, nextSequence gaps and atomic validation.

Run npm test after the last source or test change.

Input domain: IDs are nonempty ASCII strings. Payloads are ordinary acyclic JSON values with dense arrays, no getters/custom methods/undefined/symbols/nonfinite numbers or negative zero. priority is integer -10..10, readyAt and now are integers0..1e12. Snapshot shape is exactly {nextSequence,items}, and items have exactly id,payload,priority,readyAt,sequence. Every enqueue call occurs only when nextSequence<Number.MAX_SAFE_INTEGER, so incremented nextSequence remains safe; no behavior beyond that bound is required. A snapshot with nextSequence===Number.MAX_SAFE_INTEGER remains valid for restore and inspection.
