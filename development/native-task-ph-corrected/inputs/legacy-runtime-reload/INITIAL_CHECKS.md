# Ordinary checks on the supplied incomplete patch

These are observed results, not a baseline exception or independent evaluator feedback. Tests for newly required behavior still must be delivered.

## node --test --test-concurrency=1 packages/connector/test/state-security.test.mjs packages/connector/test/executables.test.mjs packages/connector/test/protocol.test.mjs

Exit: 0

```text
✔ finds a bundled macOS Codex even when PATH does not contain it (1.002958ms)
✔ prefers an explicit executable and then the user's PATH (0.169333ms)
✔ covers Windows package managers and installed application roots (0.704667ms)
✔ uses common standalone locations for every executable-backed agent (0.117916ms)
✔ routes Windows command shims through ComSpec with escaped arguments (0.645084ms)
﹣ executes Codex and Antigravity Windows npm shims with literal argv (0.051458ms) # SKIP
✔ accepts the exact pairing contract and preserves local-only source authority (12.89525ms)
✔ rejects server attempts to add local paths, executables, or unknown mapping fields (0.851042ms)
✔ protocol errors are snake_case and terminal output strips control characters (0.724458ms)
✔ rejects agent substitution and non-exact pairing source sets (0.319458ms)
✔ pairing accepts a previously connected local source omitted from current discovery (0.379917ms)
✔ rejects oversized, incomplete, and reconciliation responses without sources (1.053333ms)
✔ compact reconciliation requires every requested source and supports 100 mappings (0.554083ms)
✔ accepts only the expected verification origin, path, code, and web protocols (0.581209ms)
✔ stored network mappings cannot override local collection authority (0.124625ms)
✔ POSIX state security migrates only recognized legacy state and writes its marker (43.782583ms)
✔ POSIX state security rejects unrelated content before changing modes (7.35675ms)
✔ POSIX state security accepts a new custom directory but rejects a nonempty dot directory (7.982875ms)
✔ an unmarked custom directory with a foreign config remains completely unchanged (79.848375ms)
✔ legacy migration locks the root before accepting a final unchanged tree (38.542791ms)
✔ state initialization recovers after its migration-lock owner is terminated (100.927666ms)
✔ orphaned migration artifacts do not make custom state substantive (27.918ms)
✔ a live state migration lock is not displaced by another initializer (181.692125ms)
✔ stored connector origins fail closed before configuration is returned (9.545ms)
ℹ tests 24
ℹ suites 0
ℹ pass 23
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 604.227125

```

## node --test --test-name-pattern=runtime packages/connector/test/config.test.mjs

Exit: 0

```text
✔ rejects an incomplete runtime before pairing-compatible staging completes (15.140417ms)
✔ remote reconciliation cannot restore retired runtime state from a stale snapshot (70.022417ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 130.110084

```
