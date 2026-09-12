# content-addressed-chunks

Implement createStore(chunkSize) as a logical content-addressed byte store. put(name,bytes) replaces that file with a manifest of fixed-size consecutive chunks, final chunk possibly shorter. A chunk ID is lowercase SHA-256 hex of its visible bytes. Identical byte chunks share the same logical chunk entry, including repeats within one file. Reference count equals the total number of manifest occurrences across all files, not the number of distinct files. Replacing/removing a file decrements its old occurrences; remove chunks with zero references while preserving chunks still used elsewhere. get(name) reconstructs a fresh Uint8Array, or null for absent name; an empty stored file returns an empty array and has an empty manifest. remove returns boolean. stats returns {files:[{name,chunks:[IDs]}],chunks:[{hash,size,refs}]}, sorting file names and chunk hashes lexicographically; return detached arrays/records. Snapshot inputs so later caller changes cannot alter content. Internal representation and physical memory layout are unrestricted; observable manifests/counts/readback define deduplication. Domain: chunkSize1..64 integer, Uint8Array including subviews up to65536 bytes, at most100 nonempty ASCII names; no filesystem, and hash collisions outside scope. Preserve ordinary put/get and absence.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Repeated chunks within one file and across files count occurrences; removal preserves shared readback.
- Replacing a file with empty content releases chunks and retains empty-file existence.

Update project documentation to explain:
- Fixed chunk boundaries, SHA-256 IDs and logical occurrence-count deduplication.
- Replacement/removal cleanup, empty versus absent and detached byte/view ownership.

Run npm test after the last source or test change.
