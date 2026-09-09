# subscription-proration-lines

Integrate plan-change segmentation and prorated invoice adjustments. segments(start,end,initial,changes) covers the half-open billing period [start,end). changes is unordered with unique day values within [start,end]; each {day,plan:{id,price}} becomes active at day, including a start-day replacement. A change at end creates no line. Return positive-length {plan:id,price,start,end} segments in chronological order. Merge adjacent segments having the same plan ID AND price before rounding, including redundant changes; same ID with different price is not mergeable. invoice(start,end,initial,changes,alreadyCharged) maps each merged segment to {plan,start,end,cents}, where cents=floor(price*(segmentEnd-segmentStart)/(end-start)), sums total, and returns {lines,total,adjustment:total-alreadyCharged}. Price means cents for the entire billing period, not daily price. Negative adjustment represents a credit; do not clamp it or redistribute rounding residuals. Domain: integer day indices 0..100000 with start<end, unique change days in bounds, nonnegative integer prices/alreadyCharged, nonempty ASCII plan IDs and safe intermediate arithmetic. Do not mutate input arrays or plans. Preserve full-period single-plan charge.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Unordered changes produce chronological prorated lines and a negative credit adjustment.
- Redundant same-plan/same-price changes merge before rounding.

Update project documentation to explain:
- Half-open period, start/end changes and price is for whole period.
- Merge condition, floor per merged line without residual redistribution, signed adjustment.

Run npm test after the last source or test change.
