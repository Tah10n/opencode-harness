# Add custom clipping suffix

compatible extension. Support options.suffix string in label(text,width,options); empty suffix is meaningful. Width counts Unicode code points, excluding the suffix.

Preserve: Calls with omitted options retain code point counting, default ellipsis, zero width, no change for short strings, and input immutability. Domain text strings and integer widths 0..64.

Allowed changes: Only explicitly supplied suffix changes clipped output.

Run `npm test`. Add focused tests for the requested change and preserved cases. `compat.json` declares the fixed public preservation corpus; it excludes the new behavior and is not task acceptance.
