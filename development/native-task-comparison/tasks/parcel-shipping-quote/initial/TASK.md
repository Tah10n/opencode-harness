# parcel-shipping-quote

Integrate dimensional shipping weight into quote(parcels,zone). billable(parcel,divisor) returns max(actual grams, ceil(length*width*height/divisor)); divisor is expressed in cubic-mm per gram. A parcel is oversize iff any side is strictly greater than zone.maxSide. Preserve input order and return either {id,status:"rejected",reason:"oversize"} or {id,status:"quoted",grams,cents}; cents = zone.base + ceil(billable grams/zone.stepGrams)*zone.stepCents. Reject oversize parcels individually rather than failing the batch. Domain: positive integer dimensions/weights/divisor/stepGrams/maxSide, nonnegative integer rates, unique string IDs and safe arithmetic. Do not mutate input; preserve existing weight-dominated single parcel quotes.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Dimensional weight needs rounding and affects the billed step.
- An oversize parcel is rejected while other batch entries still quote.

Update project documentation to explain:
- Units and the two ceiling operations.
- Strict side limit, per-parcel rejection and stable order.

Run npm test after the last source or test change.
