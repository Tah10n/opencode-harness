# duration-bigint-adapter

Extend splitMillis(ms) and display(ms) from nonnegative safe-integer numbers to nonnegative bigint of arbitrary size. Number returns {seconds:number floor(ms/1000),millis:number remainder}; bigint returns {seconds:bigint quotient,millis:number0..999}. display works for both without precision loss: decimal seconds + dot + exactly3 remainder digits + s. Negative/inexact/unsafe number or negative bigint RangeError("duration"); other types TypeError("duration"). Preserve numeric output/types and accept0/0n. No coercion, timers or unit-library dependencies.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- bigint precision through display
- validation preserves type contract

Update project documentation to explain:
- Describe number/bigint result types, exact formatting and type/range errors without coercion.

Run npm test after the last source or test change.
