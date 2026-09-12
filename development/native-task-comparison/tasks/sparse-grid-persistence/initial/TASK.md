# sparse-grid-persistence

Implement createGrid() with sparse cell state and atomic persistence. set(row,column,value) deep-copies the value; has distinguishes absent from stored null; get returns a detached value or undefined if absent; delete returns whether a cell existed. entries returns detached {row,column,value} records sorted numerically by row then column. serialize returns compact JSON of those entries. restore(text) replaces all cells only after validating the entire snapshot: JSON must be an array of objects with exactly row,column,value keys, integer coordinates in [-1000,1000] and no duplicate coordinate pair. Malformed JSON throws SyntaxError; invalid shape/coordinate/duplicate throws TypeError and leaves old grid unchanged. Restore values are ordinary JSON as parsed; no extra validation beyond JSON value support. Runtime set values are ordinary acyclic JSON data, dense arrays, no undefined/getters/custom methods/nonfinite numbers or -0; coordinates may use -0 but are canonically represented as 0 in entries and keys. Domain: bounded coordinates, arbitrary supported JSON values. Returned values and snapshots cannot modify grid state. Preserve empty serialization and one scalar cell.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Sparse JSON round trip with numerical order and stored null versus absence.
- Invalid duplicate restore is atomic.

Update project documentation to explain:
- Coordinate domain, numerical ordering, deep-copy ownership and absent/null semantics.
- Exact persisted cell shape, replacement restore, parse/validation errors and unchanged state on failure.

Run npm test after the last source or test change.

Restored value trees use the same supported value domain as set. Texts producing nonfinite numbers or negative zero inside values are outside this task domain; negative-zero coordinates remain allowed and normalize to 0.
