# typed-byte-view-inputs

checksum accepts an ArrayBuffer, typed array including BigInt/clamped arrays, Buffer or DataView. Views use only their raw byteOffset/byteLength slice, not element values. Each call reads current bytes without mutation or retention. The Number result is an unsigned byte sum modulo 2^32; empty input gives 0. This is not cryptography. Inputs are same-realm attached fixed-size non-resizable buffers with at most 20 million visible bytes. Shared storage, arrays, strings and lookalikes throw TypeError. Run npm test.
