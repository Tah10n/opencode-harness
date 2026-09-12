# line-ending-input-adapter

Extend splitLines(text) to CRLF input and export LineDecoder for incremental string chunks, using the same semantics. new LineDecoder().push(chunk) returns a fresh array of complete lines emitted by that chunk; finish() closes the decoder and returns the nonempty final unterminated content once. Each LF terminates a line; remove exactly one immediately preceding CR as part of CRLF. Other CR characters are ordinary content, including a final lone CR. Emit empty lines for separators but no extra empty line solely after the final separator. Empty whole input emits no lines. Chunk boundaries, including between CR and LF or between surrogate halves, must not change results; empty chunks are harmless. finish is idempotent returning [] after first call. Any push after finish, even empty, throws an Error with code LINE_DECODER_CLOSED and must not reopen state. Instances are independent and changing returned arrays must not change pending state. Preserve existing LF splitLines behavior. Domain: strings with arbitrary UTF-16 code units (including lone surrogates), total<=100000 units per instance; no byte buffers, invalid input types, async sources, resource streams or read-ahead constraints. Do not introduce universal newline normalization: lone CR stays literal.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert CRLF split across chunks and a final unterminated line.
- Assert lone CR preservation, blank lines and finish/push lifecycle.

Update project documentation to explain:
- Explain LF/CRLF grammar and bare CR preservation.
- Describe incremental API, chunk-boundary invariance, final-line and closed-state rules.

Run npm test after the last source or test change.
