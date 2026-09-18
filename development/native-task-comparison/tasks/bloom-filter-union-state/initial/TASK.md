# bloom-filter-union-state

Complete fixed multi-hash Bloom filter state in src/filter.mjs while preserving createFilter(bits=256,hashes=3), restoreFilter(snapshot), add(string), has(string), union(snapshot), snapshot(). Domain bits multiple8 in8..8192, hashes integer1..8; invalid TypeError. String domain primitive UTF16<=10000 units, encoded using TextEncoder UTF8 including standard replacement for isolated surrogates. Compute h1 FNV-1a32:2166136261 then unsigned imul(h1 XOR byte,16777619); h2 DJB2 unsigned (imul(h2,33)+byte), start5381; after all bytes force h2 odd with (h2|1) unsigned. Positions for i0..hashes-1 are (h1+i*h2)%bits using ordinary exact integer sum, NO uint32 wrapping of that final sum. Byte packing bit index b uses byte floor(b/8), LSB-first bit b%8. add sets all positions, has true iff all set, non-string TypeError before mutation. False positives are allowed; do not track an exact inserted-key set or clear bits to reject uninserted values. Snapshot {version:1,bits,hashes,data:canonical padded base64 bytes}, exact bits/8 length; restore accepts any such bit vector incl all-one, rejects malformed version/dimensions/noncanonical base64/wrong length with TypeError. union first validates complete incoming snapshot and identical bits/hashes, then bitwise OR; mismatch must not change state. add/union return undefined. Snapshot/restore are independent copies; JSON round-trip then continued adds yields identical state. No removal, resizing, salt or approximate hash policy.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert fixed bitmap vectors, no false negatives and resumed snapshot continuation.
- Assert union commutativity/idempotence and membership preservation, legitimate false positives, malformed/mismatched state atomicity.

Update project documentation to explain:
- Document exact hashes, position arithmetic, bit order and false-positive semantics.
- Explain snapshot format/canonical validation, compatible union and copy ownership.

Run npm test after the last source or test change.
