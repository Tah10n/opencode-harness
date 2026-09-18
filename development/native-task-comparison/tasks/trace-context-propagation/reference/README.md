# trace-context-propagation

This implements only the stated v00 lowercase parent subset; invalid parent starts a fresh trace with flags 00. Children use new span IDs. Baggage is filtered by a case-sensitive allowlist and first valid occurrence, preserving percent text. No unrelated headers are forwarded.

A parent is exactly `00-<32 lowercase hex traceId>-<16 lowercase hex parentId>-<00 or 01 flags>`. Both IDs must be nonzero; whitespace, uppercase hex, other versions and flags are rejected. Fresh IDs are supplied by the caller and assumed valid under the task domain.

Baggage entries use optional ASCII spaces around `key=value`: keys match `[A-Za-z0-9_-]+`, values match `[A-Za-z0-9_.%-]*`. Commas separate entries. Skip malformed/disallowed entries; keep the first valid allowed occurrence in encounter order. Percent text is not decoded. An empty result omits the baggage header.
