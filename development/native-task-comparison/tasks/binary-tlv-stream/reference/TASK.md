# binary-tlv-stream

Implement a binary TLV codec. encode(records) concatenates each record as one unsigned type byte, two-byte unsigned big-endian payload length, then visible data bytes; return Uint8Array. Type 0 is reserved and payloads longer than 65535 bytes throw RangeError. Zero-length payloads for valid types are allowed. createDecoder().push(chunk) buffers partial headers/payloads, returns all newly completed {type,data:Uint8Array} records in order, and retains the incomplete suffix. Validate reserved type 0 as soon as its full three-byte header is available. push is transactional: if any reserved header is encountered, throw RangeError and leave the previous pending state unchanged, returning no records from that call. A failed chunk is not retained; a caller may provide a different valid chunk afterward. finish() returns true iff no incomplete bytes remain, otherwise throws RangeError without clearing state, so subsequent bytes may finish the record. Snapshot incoming bytes and return detached payloads. Domain: Uint8Array including subviews, integer type 0..255, bounded total stream <=1MB, arbitrary byte fragments; encode may receive oversize payloads for rejection. Never mutate inputs. Preserve simple single-record encoding/decoding.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Fragmented header/payload, zero-length record and finish detecting truncation.
- Reserved-tag error is transactional and a corrected chunk can complete prior pending data.

Update project documentation to explain:
- Three-byte header with big-endian length, reserved tag and size limits.
- Transactional push, non-clearing finish failure and detached byte-view ownership.

Run npm test after the last source or test change.
