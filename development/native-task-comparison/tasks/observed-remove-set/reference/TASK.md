# observed-remove-set

Implement an observed-remove replicated string set through createSet(). add(value,tag) records an addition; the same tag/value is idempotent, but reusing a tag for a different value throws TypeError. remove(value) tombstones only addition tags for that value already observed locally. A concurrent unseen add with a different tag survives after merge. merge(snapshot) unions additions and tombstones, validates all incoming tag/value associations before mutating any state, and throws TypeError for conflicts. Tombstones may arrive before their add and must prevent later resurrection. Keep tombstoned additions in exported state; do not garbage collect them. values() returns sorted unique visible values. snapshot() returns detached {adds:[[value,tag]],removed:[tag]}, additions sorted by value then tag and tombstones sorted, using default ASCII string order. Domain: arbitrary ASCII value/tag strings, dense finite arrays, duplicate identical associations harmless; invalid conflicting associations are in rejection scope. No caller mutation affects state. Preserve an empty set and a single visible add.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- An unseen concurrent addition survives an observed removal and replicas converge.
- Tombstone arriving before addition prevents resurrection.

Update project documentation to explain:
- Addition tags identify values and remove only observes local tags.
- Union merge, retained tombstones, atomic conflict rejection and detached sorted snapshots.

Run npm test after the last source or test change.
