# transport-injected-uploader

Separate byte chunk formation from existing upload in src/upload.mjs into public chunkBytes(bytes,size) in src/chunks.mjs. Existing async upload(bytes,{chunkSize=65536,send}={}) must use that core and preserve transport semantics. Domain: non-shared Uint8Array/Buffer views<=1MiB, size integer1..1048576. Chunk formation returns fresh Uint8Array copies of only visible bytes, ordered and at most size long, no empty trailing chunk. Empty input =>[]. Reject invalid bytes/size with TypeError. upload validates callable send before chunking even for empty input, snapshots all chunks synchronously before its first await, then awaits send serially with undefined thisArg and exactly (chunk,{index,offset,total,final}). Indices/offsets zero-based, total original visible byte count, final true only for last chunk. send may synchronously return/throw or return a promise; stop immediately on first failure and reject with its exact value, including falsy values. No retry or network/global transport lookup. Empty input sends nothing. Success returns {bytes:total,chunks:count}. Source bytes and transport metadata must not alias internal bookkeeping; callers may change source bytes while transport is pending. send can mutate byte contents and metadata but not detach/resize backing storage. No duplicate chunking in wrapper.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert subview byte boundaries and copy isolation.
- Assert serial awaiting, source snapshot before first await, exact metadata and stop on first failure.

Update project documentation to explain:
- Document core byte-copy boundaries and domain.
- Describe transport injection, eager snapshot, ordering and error/no-retry semantics.

Run npm test after the last source or test change.
