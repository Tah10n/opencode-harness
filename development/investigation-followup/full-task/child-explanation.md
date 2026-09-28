Added test-only regressions:

- `readers.test.mjs`: account-switch sequences across Claude, Kimi, Qwen, Gemini, and Antigravity, covering first-tuple-wins, partial conflicts, truncation retention, new events, and content-free state.
- `config.test.mjs`: OpenCode exact-ID cutover retention and same-tuple new-event counting.

Results:

- Readers: 86 passed, 1 expected new failure exposing raw Claude IDs in state.
- Config: 102 passed, 1 expected new failure exposing lost OpenCode usage.
- Protocol: 14 passed.
- `git diff --check`: passed.
- `corepack pnpm verify`: unavailable because network access is disabled.

No numeric bound or explicit 0.4.3 schema assertion was added because neither is exposed as a stable public contract.
