Implemented ledger fixes across shared JSONL and Claude collectors:

- Preserve complete records before unterminated tails.
- Detect conflicting duplicate IDs while retaining the first tuple.
- Prevent bounded-ledger overflow from emitting non-persisted usage.
- Preserve range filtering, partial diagnostics, and provisional-tail behavior.
- Added focused regressions.

Checks passed:
- Readers: 92/92
- Config: 103/103
- Protocol: 14/14
- Focused ledger tests and Claude security test
- `git diff --check`

`corepack pnpm verify` was unavailable because pnpm 11.7.0 could not be downloaded with network access disabled. No commit or package version changes made.