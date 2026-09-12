# tree-selection-propagation

Implement createSelection(forest). Nodes have {id,children}; empty children means leaf. Selection is stored only for leaves. toggle(id,checked) selects/deselects all descendant leaves, including the node itself if a leaf. status(id) returns {checked,indeterminate}: checked iff all descendant leaves selected, indeterminate iff some but not all selected. Unknown toggle/status ID throws RangeError before any mutation. snapshot returns detached selected leaf IDs sorted by ASCII. restore(ids) replaces selected leaves atomically, accepting duplicate leaf IDs idempotently but throwing TypeError for unknown or nonleaf IDs without changing previous state. Copy or index the initial topology so later caller mutations cannot alter behavior. Do not mutate the forest. Domain: finite acyclic forest up to1000 nodes/depth100 with globally unique nonempty ASCII IDs, exact id/children fields, dense arrays; checked boolean; restore IDs strings including invalid IDs for rejection. Empty forest has empty snapshot and supports restore([]). Preserve a single leaf selection.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Leaf selection makes ancestors indeterminate and parent toggle selects all descendant leaves.
- Invalid restore preserves selected leaves.

Update project documentation to explain:
- Leaf-only selection, checked/indeterminate propagation and subtree toggles.
- Frozen input topology, sorted snapshots and atomic leaf-only restore with duplicate normalization.

Run npm test after the last source or test change.
