# immutable-board-moves

Extract pure movedBoard(board,from,to) into src/board-core.mjs and make existing moveInPlace in src/board.mjs delegate validation/move policy to it. Domain: nonempty rectangular dense arrays1..50 rows/columns; distinct ordinary row arrays; cells null (empty) or any non-null value including object pieces. Coordinates are arrays of exactly two integer [row,col] within bounds; invalid coordinates RangeError('coordinate'), validated before cell checks. Empty source Error('empty source'), even same-square move; different occupied target Error('occupied target'). Successful pure move returns fresh outer array AND fresh array for every row, including unchanged rows/same-square; cell payload identities preserved, source+coordinates untouched, frozen input supported. Same occupied square is valid no-op contents but still copied. Existing moveInPlace returns exact original board, keeps every row identity, commits moved contents only after full validation; failure leaves contents untouched. Wrapper inputs are writable ordinary arrays with no accessors/proxies. Pure core cannot mutate pieces, input arrays or coordinates. No second validation/move policy in wrapper.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert pure move with frozen input, all-row isolation and piece identity.
- Assert legacy board/row identities, same-square behavior and no mutation on invalid/occupied/empty moves.

Update project documentation to explain:
- Document coordinate and occupancy errors, pure copying and payload identity.
- Explain compatibility wrapper identities and failure atomicity.

Run npm test after the last source or test change.
