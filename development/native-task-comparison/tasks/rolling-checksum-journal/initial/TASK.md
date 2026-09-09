# rolling-checksum-journal

Implement append(records,value) and replay(records) for a checksum-linked journal. Each record has {sequence,previous,value,checksum}. Sequence starts at1 and increases by1; previous is the prior checksum, with initial checkpoint 00000000. Compute checksum by unsigned FNV-1a32 over UTF-8 bytes of previous+":"+sequence+":"+value: initial hash2166136261, for each byte xor then multiply16777619 modulo2^32; format exactly8 lowercase hex digits. replay verifies every sequence, previous link, string value and checksum before returning {values,checkpoint}; corrupt data throws TypeError, never silently skip a bad tail. Empty replay returns values:[] and checkpoint:00000000. append first validates existing records, then returns a detached record array with the new computed record, preserving existing bytes/fields. Do not mutate input records. Domain: dense arrays up to1000 records with exact fields, well-formed Unicode values; sequence/link/checksum/value-type corruption is in rejection scope. append receives a valid string value. A complete valid prefix is a valid journal: without an external expected checkpoint, missing terminal records are not detectable. This checksum detects accidental corruption and is not cryptographic authentication. Preserve empty journal and ordered value replay.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Two appended records replay in order and returned records do not alias input.
- A corrupt tail rejects both replay and further append.

Update project documentation to explain:
- Exact UTF-8 FNV chain, sequence/link rules and initial checkpoint.
- Fail on corruption, valid-prefix limitation and no cryptographic authentication claim.

Run npm test after the last source or test change.
