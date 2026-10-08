# Add optional packet separator

compatible extension. Support options.separator string in packet(parts,options), including an empty separator.

Preserve: Omitted options retain every string field including leading, trailing and adjacent empty fields, and exact field order; no input mutation. Domain arrays of strings.

Allowed changes: Explicit separator changes delimiters only.

Run `npm test`. Add focused tests for the requested change and preserved cases. `compat.json` declares the fixed public preservation corpus; it excludes the new behavior and is not task acceptance.
