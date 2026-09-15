# fractional-order-keys

Implement exact rational position keys. compare(a,b) returns -1/0/1 by rational value using exact integer arithmetic, not Number. Keys are numerator/denominator with signed integer numerator and positive denominator. Equivalent unreduced keys compare equal. between(left,right) returns the reduced arithmetic midpoint if both exist and left<right; otherwise RangeError. If only right exists return right minus 1; if only left exists return left plus 1; if both are null return 0/1. Return a reduced numerator/positive-denominator string, including zero as 0/1. rebalance(items) returns new records sorted by numeric rational key then ASCII id for equal keys, preserving id/label, assigning keys 0/1,1/1,... in that order. Do not mutate the input array or records. Domain: keys with canonical signed decimal integer components of finite length, positive denominator, no plus/whitespace/leading zeros/-0; unreduced fractions permitted. Items are {id,key,label}, unique nonempty ASCII ids and string labels. null is only an unbounded endpoint. Preserve simple integer key comparison.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Exact midpoint between large adjacent values remains strictly between endpoints.
- Rebalance sorts by rational value and deterministic ID ties while retaining labels.

Update project documentation to explain:
- Exact rational representation, reduction and unbounded-endpoint behavior.
- Invalid endpoint order and numeric/ID ordering preserved by rebalance.

Run npm test after the last source or test change.

Generated keys may have longer components than either input and remain valid inputs to compare and between.
