# zoned-time-offset-records

Implement parse(text), format(record), withOffset(record,offsetMinutes) for a fixed-offset timestamp record {epochMs,offsetMinutes}. Parse exactly YYYY-MM-DDTHH:mm:ssZ or YYYY-MM-DDTHH:mm:ss+HH:mm/-HH:mm with local year2000..2099, valid Gregorian calendar/time, hours0..23/minutes-seconds0..59, offset magnitude<=14:00 and offset minute component0..59. No fractions, spaces, leap seconds or omitted offset. Invalid text throws TypeError. epochMs is the instant in UTC; retain the signed nonzero offsetMinutes, normalizing both signed zero offsets to numeric0. format uses record offset to recover local fields and emits the same fixed-width shape, with Z for zero. Record epochMs must be safe integer divisible by1000, offset integer -840..840, and the resulting local year2000..2099; invalid record throws RangeError. withOffset returns a new record preserving epochMs and changing offset, rejecting invalid offset or an out-of-range resulting local year with RangeError. Do not mutate records or use host local timezone. This is fixed offsets only, not IANA zones/DST. All boundary rules above are in rejection scope. Preserve a valid Z timestamp round trip.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Signed offset round trip and conversion across a local day preserve UTC instant.
- Invalid calendar rejection and canonical zero offset.

Update project documentation to explain:
- Fixed-offset grammar, valid calendar/time and normalization of zero.
- Instant-preserving offset changes, record bounds, host-timezone independence and no DST support.

Run npm test after the last source or test change.
