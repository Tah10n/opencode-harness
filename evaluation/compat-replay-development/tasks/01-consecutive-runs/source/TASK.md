# Extract consecutive run accumulation

refactor. Move accumulation into exported appendRun(out,value) in src/append.mjs; runs must delegate to it. Keep encode and summary consumers working.

Preserve: Consecutive equal strings coalesce; separated repeats remain separate and ordered. Empty input and input immutability.

Allowed changes: Internal structure only.

Run `npm test`. Add focused tests for the requested change and preserved cases. `compat.json` declares the fixed public preservation corpus; it excludes the new behavior and is not task acceptance.
