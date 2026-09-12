# central-money-rounding

Extract exported roundRatio(numerator,denominator) into src/money-core.mjs and make taxCents in src/tax.mjs and shareCents in src/share.mjs use that one rounding policy, removing duplicated rounding formulas. Preserve invoiceTotal in src/totals.mjs, which sums separately rounded per-line taxes (never tax rounded aggregate). Round exact integer ratio to nearest integer, half ties toward positive infinity:1/2->1, -1/2->+0, -3/2->-1. Normalize any zero result to positive0. Core numerator integer magnitude<=10^15, denominator integer1..10^6, invalid values RangeError. taxCents amount integer±10^9 and basisPoints integer0..100000, ratio amount*basisPoints/10000. shareCents amount integer±10^9, whole integer1..10^6 and part integer0..whole, ratio amount*part/whole. Helpers keep their validation and RangeErrors. invoiceTotal valid lines dense array<=1000 and valid rate, returns {subtotal,tax,total}; empty gives zeros. Preserve input and existing signatures/outputs. No floating monetary inputs, currency conversion, new rounding option or precision library. Any implementation preserving exact bounded results is acceptable; central delegation is required, not a specific arithmetic technique.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert positive/negative half ties and positive zero at core and consumer level.
- Assert per-line invoice tax totals and preserved helper validation/bounds.

Update project documentation to explain:
- Document one common rounding policy, negative ties and zero normalization.
- Explain helper bounds and per-line invoice totals versus aggregate rounding.

Run npm test after the last source or test change.
