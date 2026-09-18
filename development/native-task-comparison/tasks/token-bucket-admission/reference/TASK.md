# token-bucket-admission

Implement createBucket(capacity,perSecond,now) and integrate createGate(capacity,rate,now,handler). Bucket starts full at construction-time now(); each take(cost=1) refills continuously by elapsed milliseconds, capped at capacity, then spends only if enough. Return {allowed:true,retryAfterMs:0} on admission; otherwise {allowed:false,retryAfterMs:ceil(missing*1000/rate)}. Cost above capacity is permanently impossible and returns retryAfterMs:null. Rejected requests must not consume tokens. Backwards clock throws RangeError without changing the prior bucket state. Gate invokes synchronous handler(value) only on admission and adds its return as value; rejected result has no value property. Domain: positive integer capacity/cost, positive finite refill rate, finite nonnegative millisecond clock. Preserve immediate requests within capacity.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- A rejected partial-refill request followed by admission at the exact refill time.
- Gate does not call its handler on rejection.

Update project documentation to explain:
- Continuous refill, capacity cap and retryAfterMs:null for impossible cost.
- Rejected requests do not spend tokens or invoke handlers; backwards clock rejection.

Run npm test after the last source or test change.
