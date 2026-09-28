Added test-only regressions:

- `readers.test.mjs`: file replacement, copied events, 0.4.3 state migration, tuple conflicts, privacy, and OpenCode exact-ID behavior across adapters.
- `config.test.mjs`: persisted ledger behavior across real sync processes and upload/state privacy.
- `claude-security.test.mjs`: raw identity persistence and prototype-safety expectations.

Checks:

- Protocol tests: 14/14 passed.
- Reader tests: existing 86 passed; 3 new regressions fail against unchanged production.
- Config tests: existing 103 passed; 1 new regression fails against unchanged production.
- `git diff --check`: passed.
- `corepack pnpm verify`: unavailable because pnpm could not download with network disabled.

No numeric storage-bound assertion was added because the public contract specifies bounded storage but no public limit.
