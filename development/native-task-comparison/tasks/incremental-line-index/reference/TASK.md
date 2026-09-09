# incremental-line-index

Implement createIndex(input). Normalize CRLF and lone CR to LF at construction. replace(start,end,value) uses half-open UTF-16 offsets in current normalized text, normalizes replacement independently, then splices it. Reject noninteger/out-of-range offsets or start>end with RangeError without mutation. starts() returns a fresh array beginning with 0 and containing the position after each LF, including an empty final line after trailing LF. locate(offset) returns zero-based {line,column}; an offset on LF belongs to the preceding line at content length, and text.length is valid. offset(line,column) reverses the mapping, allowing columns 0..content length excluding LF; invalid coordinates throw RangeError. text() returns current normalized text. Empty text has one empty line. Offsets count UTF-16 code units, not code points; edits may split surrogate pairs and resulting strings remain supported. Texts use at most100000 code units. No complexity requirement: recomputing starts is permitted. Preserve initial LF-only coordinates.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- CRLF/lone-CR normalization and updated starts after replacing across lines.
- Invalid edit preserves text and trailing LF creates empty final line.

Update project documentation to explain:
- UTF-16 offsets, independent replacement normalization and half-open edits.
- LF endpoint ownership, final empty line, inverse positions and RangeError atomicity.

Run npm test after the last source or test change.
