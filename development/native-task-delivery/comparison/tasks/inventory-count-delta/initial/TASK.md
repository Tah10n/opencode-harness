# inventory-count-delta

Implement diffCounts(before,after) and applyCounts(before,changes). before/after own-data records of positive integer counts, missing=0, safe totals. diff returns only nonzero {key,delta}, sorted by default JS string order over union of own keys. apply sequentially adds signed safe integer deltas (repeated keys allowed), removes zero entries, throws RangeError("negative") at first intermediate negative even if later delta would recover; never mutate input. Keys arbitrary strings including __proto__/constructor; inherited properties ignored. Changes/domain <=1000. Returned record ordinary object with enumerable own data fields; empty diff/no-op still returns new object.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- sorted delta round trip with removal
- negative transition is atomic to input

Update project documentation to explain:
- Explain sorted signed deltas, sequential intermediate validation, zero removal, own-key safety and immutable inputs.

Run npm test after the last source or test change.
