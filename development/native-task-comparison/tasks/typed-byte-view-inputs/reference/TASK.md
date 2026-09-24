# typed-byte-view-inputs

Extend checksum(input) to accept an ArrayBuffer or any built-in typed array (including BigInt and clamped arrays), Node Buffer, or DataView backed by an ArrayBuffer. Return the unsigned sum of visible raw bytes modulo 2^32 as a Number. ArrayBuffer uses all bytes; a view uses exactly byteOffset..byteOffset+byteLength, regardless of element type, values, host byte order or unrelated backing bytes. Empty inputs return0. Read current backing contents on each call and do not mutate or retain them. Preserve ordinary Uint8Array behavior. Reject arrays, strings, null, undefined, lookalike objects, SharedArrayBuffer and shared-backed views with TypeError. Domain: same-realm genuine unmodified built-ins with attached fixed-size non-resizable ArrayBuffers; at most20 million visible bytes. Detached/resizable buffers, proxies, subclasses except Buffer and concurrent mutation are out of scope. No encoding of typed elements and no cryptographic claim.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert DataView and typed-array subviews exclude unrelated backing bytes.
- Assert raw bytes of a non-byte numeric view, empty input and no input mutation.

Update project documentation to explain:
- List input forms and byte-offset/byte-length semantics, modular unsigned result.
- Explain rejected forms, live reads, limits and non-cryptographic nature.

Run npm test after the last source or test change.
