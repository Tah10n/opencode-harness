# seat-reservation-snapshot

Upgrade createSeats(initial=[]) to return reserve(seats), release(seats), snapshot(). Domain integer seat IDs0..9999; initial unique IDs; requested arrays may contain duplicates and may be frozen. reserve is atomic: if any requested ID is already reserved or duplicated within the request return false and reserve none; otherwise reserve all and return true, including empty request. release is idempotent and removes listed IDs. snapshot returns a fresh numerically sorted array reusable as initial to restore independent state. Input arrays and returned snapshots cannot mutate internal state. No persistence service/concurrency.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- atomic conflicts and duplicates
- snapshot restore ownership and sorting

Update project documentation to explain:
- Document atomic conflicts, duplicate requests, idempotent release, numeric snapshots and independent restore.

Run npm test after the last source or test change.
