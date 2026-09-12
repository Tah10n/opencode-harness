# undo-redo-branching

Implement createHistory(initial,limit) with detached JSON snapshots and bounded undo/redo. commit(next) always records the previous current value, including equal-value commits; retain at most limit previous states (discard oldest), set current to a deep copy of next, and clear redo history. Return a detached copy of current. undo()/redo() return {changed,value}; transfer one state when available, otherwise changed:false and unchanged current. Returned value is always a detached deep copy. snapshot() returns {value,undo,redo}, where counts describe available operations and value is detached. A commit after undo branches and invalidates the old redo path. Caller mutations of initial, committed, returned or snapshot objects never affect stored states. Domain: acyclic plain own-data JSON values and dense arrays without undefined, custom methods, getters, symbols or nonfinite numbers/-0; limit integer 1..100. Preserve initial snapshot and unsuccessful undo behavior.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Undo capacity, redo and commit-after-undo branch invalidation.
- Deep snapshot isolation from caller mutation.

Update project documentation to explain:
- Capacity counts prior states and every commit counts, including equality.
- Branch/redo rules and detached JSON ownership across all returned values.

Run npm test after the last source or test change.
