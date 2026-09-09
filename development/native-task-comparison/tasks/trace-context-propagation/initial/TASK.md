# trace-context-propagation

Integrate a deliberately limited trace header contract. parseParent(text) accepts only exact 00-<32 lowercase hex traceId>-<16 lowercase hex parentId>-<00 or 01 flags>, rejects all-zero IDs, and returns {traceId,parentId,flags} or null. No whitespace, uppercase hex or other versions/flags are accepted. filterBaggage(text,allowed) scans comma-separated entries of optional ASCII spaces, key=value, optional spaces; key is [A-Za-z0-9_-]+, value is [A-Za-z0-9_.%-]*. Keep only allowed keys, first valid occurrence per key, in encounter order; skip malformed or disallowed entries and do not decode percent sequences. Join retained pairs with commas, no spaces. childHeaders(incoming,allowed,newTraceId,newSpanId) returns a new record with traceparent: valid incoming parent keeps its traceId/flags but uses newSpanId; invalid/missing incoming parent uses newTraceId/newSpanId with flags 00. Add baggage only when filtered result is nonempty. Never forward other headers. Domain: incoming plain own-data record with lowercase string-valued header keys, valid fresh nonzero lowercase hex IDs of lengths 32/16, allowed array of valid keys; parent/baggage strings may be malformed. This is exactly the limited contract above, not a full web standard implementation. Preserve no-baggage output and input values.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Valid parent yields a new span while preserving trace ID and flags, with deduplicated allowlisted baggage.
- Invalid parent falls back to fresh context.

Update project documentation to explain:
- Exact limited parent grammar and fresh-ID fallback.
- Baggage grammar, case-sensitive allowlist, first valid occurrence and no unrelated headers.

Run npm test after the last source or test change.
