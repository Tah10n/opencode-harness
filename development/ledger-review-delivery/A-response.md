Implemented safe account switching with:

- Bounded hashed event ledgers storing exact usage tuples.
- First-tuple conflict handling with partial diagnostics.
- State migration and client-source keyed persistence across account changes.
- Coverage across event-based adapters.
- OpenCode cutover remaining fail closed.
- Focused regressions for switching, truncation, conflicts, and privacy.

Passed:
- `readers.test.mjs`: 88/88
- `config.test.mjs`: 103/103
- `protocol.test.mjs`: 14/14

`corepack pnpm verify` was unavailable because pnpm could not be downloaded without network access. No commit or version change was made.
