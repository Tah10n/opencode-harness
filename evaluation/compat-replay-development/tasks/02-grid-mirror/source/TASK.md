# Extract row reversal for grid views

refactor. Extract exported reverseCopy(row) into src/reverse.mjs and delegate rotate to it; preserve both grid and row entry points.

Preserve: Array order is reversed in each row; original rows and nested grid are never mutated, including empty rows.

Allowed changes: Internal structure only.

Run `npm test`. Add focused tests for the requested change and preserved cases. `compat.json` declares the fixed public preservation corpus; it excludes the new behavior and is not task acceptance.
