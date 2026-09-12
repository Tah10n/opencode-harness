# range-set-canonicalization

Implement half-open integer range sets through canonical(ranges), subtract(ranges,start,end), and createRanges(initial=[]). Canonical form sorts by start and merges overlapping OR touching ranges; omit empty intervals. subtract removes [start,end), splitting a containing interval if necessary and retaining canonical order. createRanges supports add(start,end), remove(start,end), contains(n), snapshot(); mutators return value unspecified. contains includes start but excludes end. Inputs and returned snapshots must be detached from internal state; helper functions do not mutate inputs. Domain: integer endpoints in [-100000,100000], start<=end, dense arrays of pairs; empty intervals are no-ops. Preserve isolated interval membership.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Touching/overlapping ranges merge then interior removal splits.
- Empty interval handling and detached snapshot.

Update project documentation to explain:
- Half-open membership and canonical merging including touching endpoints.
- Subtraction splitting, empty no-ops and ownership of helper/state results.

Run npm test after the last source or test change.
