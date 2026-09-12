# duration-bigint-adapter

## Supported contract

Extend splitMillis(ms) and display(ms) from nonnegative safe-integer numbers to nonnegative bigint of arbitrary size. Number returns {seconds:number floor(ms/1000),millis:number remainder}; bigint returns {seconds:bigint quotient,millis:number0..999}. display works for both without precision loss: decimal seconds + dot + exactly3 remainder digits + s. Negative/inexact/unsafe number or negative bigint RangeError("duration"); other types TypeError("duration"). Preserve numeric output/types and accept0/0n. No coercion, timers or unit-library dependencies.

Run `npm test` for the preserved legacy and new project regressions.
