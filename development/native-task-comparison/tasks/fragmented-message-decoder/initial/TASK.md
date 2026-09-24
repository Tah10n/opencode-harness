# fragmented-message-decoder

Integrate fragment reassembly with UTF-8 decoding and interleaved ping frames. createDecoder().push(frame) returns an array of emitted records. A text frame begins a message; continuation is permitted only while a message is pending. Append each frame’s visible byte view; fin:false emits [], fin:true decodes the complete accumulated bytes and emits [{type:"message",text}]. Decode UTF-8 only after final reassembly with fatal invalid-byte detection; preserve a leading UTF-8 BOM as U+FEFF. A ping may occur anytime, must have fin:true and <=125 bytes, and emits [{type:"pong",data}] with a detached Uint8Array copy without affecting a pending message. Nested text, orphan continuation, invalid ping or invalid complete UTF-8 throws RangeError and resets any pending message so a subsequent fresh text may succeed. decodeText(chunks) exposes the same complete-message byte decoding contract. Domain: frames of types text/continuation/ping with boolean fin and Uint8Array data (including subviews), bounded messages <=1MB; invalid sequences/UTF8 are included for rejection. Snapshot accepted fragment bytes so later caller mutations do not change pending content. No binary protocol or network transport. Preserve simple complete ASCII messages.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Multibyte UTF-8 split over fragments with an interleaved ping.
- Protocol failure followed by successful fresh message.

Update project documentation to explain:
- Message reassembly, fatal complete UTF-8 validation and BOM preservation.
- Ping behavior, snapshot ownership and reset on errors.

Run npm test after the last source or test change.
