# run-length-bitmap-codec

Implement a row-major binary bitmap run-length codec. encode(width,height,bits) returns {width,height,start,runs}; runs are positive counts of alternating bits beginning with start, spanning row boundaries without reset. Bits must be exactly numeric 0 or 1. Dimensions must be integers 0..1000 with area<=100000 (RangeError otherwise), and bits.length must equal area (RangeError). Invalid bit values throw TypeError. For zero area use start:null and runs:[]. decode(packet) validates dimensions, requires positive-area start 0/1 and positive integer run counts (TypeError otherwise), and requires counts sum exactly to area (RangeError). Empty positive-area runs therefore fail coverage. Zero-area packet must have start:null and empty runs, otherwise TypeError. Return a fresh flat bit array. Domain: dense arrays; packet has width,height,start,runs fields, with malformed values in these explicitly listed rejection cases. Do not mutate inputs; preserve single-bit encoding. No image formats or row padding.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- A run spanning row boundaries round-trips and zero-area bitmap encodes canonically.
- Invalid runs and incorrect total coverage reject.

Update project documentation to explain:
- Row-major alternating positive runs without row reset; empty encoding.
- Dimension/bit/run constraints and distinct validation failures, with detached output.

Run npm test after the last source or test change.
