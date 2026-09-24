Implement this connector development task in the existing repository.

support safe account switching in the connector's event accounting
path. Keep a bounded, content-free ledger of observed event identities and exact
usage tuples so copying/moving/truncating session files or deleting database
history cannot erase accepted usage or count a previously observed event twice.
New events after a switch must still be counted. Apply this across event-based
adapters, migrate existing 0.4.3 state conservatively, and propagate new state
through collection/config persistence. Conflicting tuples retain the first
accepted tuple, flag partial data and still allow unrelated valid events.
OpenCode exact-ID cutover requirements must remain fail closed.

Preserve: original parser APIs, daily totals/components and range filtering,
bounded scans/storage, complete/partial and diagnostics semantics, privacy (no
raw provider IDs/content in persisted state or upload), exact OpenCode identity
requirements and existing tests. Codex account identity discovery, server account
dedup and release/version changes are outside this task.


Run the existing connector tests with Node 24: node --test packages/connector/test/readers.test.mjs ; node --test packages/connector/test/config.test.mjs ; node --test packages/connector/test/protocol.test.mjs. Add focused regressions where useful. Do not weaken preserved behavior. Do not commit, publish, release or change package versions.

Execution environment (separate from the historical task above):
The complete baseline project is writable in /work/repo with fresh local Git.
Node v24.19.0 and Git 2.39.5 are installed. TMPDIR is configured for this run.
Use the ordinary Node commands in the task; connector reader/config/protocol
tests need no package installation. Network access is disabled. The pinned
pnpm 11.7.0 and web-workspace dependencies are not cached, so the repository-wide
corepack pnpm verify command may be unavailable. Report unavailable checks
honestly; do not upgrade dependencies. Native tools and your own todo are available.
