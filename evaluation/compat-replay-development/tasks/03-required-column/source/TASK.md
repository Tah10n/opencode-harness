# Extract required field validation

refactor. Extract exported requireField(row,key) into src/required.mjs and call it from readField; keep column and first public functions.

Preserve: Missing own field throws RangeError with message missing field: KEY; null and false are values; empty first returns null. Input rows unchanged.

Allowed changes: Internal structure only.

Run `npm test`. Add focused tests for the requested change and preserved cases. `compat.json` declares the fixed public preservation corpus; it excludes the new behavior and is not task acceptance.
