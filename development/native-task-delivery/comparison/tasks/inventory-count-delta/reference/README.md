# inventory-count-delta

## Supported contract

Implement diffCounts(before,after) and applyCounts(before,changes). before/after own-data records of positive integer counts, missing=0, safe totals. diff returns only nonzero {key,delta}, sorted by default JS string order over union of own keys. apply sequentially adds signed safe integer deltas (repeated keys allowed), removes zero entries, throws RangeError("negative") at first intermediate negative even if later delta would recover; never mutate input. Keys arbitrary strings including __proto__/constructor; inherited properties ignored. Changes/domain <=1000. Returned record ordinary object with enumerable own data fields; empty diff/no-op still returns new object.

Run `npm test` for the preserved legacy and new project regressions.
