# Ordinary checks on the supplied incomplete patch

These are observed results, not a baseline exception or independent evaluator feedback. Tests for newly required behavior still must be delivered.

## node --test --test-concurrency=1 packages/connector/test/state-security.test.mjs packages/connector/test/executables.test.mjs packages/connector/test/protocol.test.mjs

Exit: 0

```text
✔ finds a bundled macOS Codex even when PATH does not contain it (1.036ms)
✔ prefers an explicit executable and then the user's PATH (0.221834ms)
✔ covers Windows package managers and installed application roots (0.64525ms)
✔ ignores extensionless Windows npm shims and resolves the command shim (0.312125ms)
✔ uses common standalone locations for every executable-backed agent (0.092334ms)
✔ routes Windows command shims through ComSpec with escaped arguments (0.487334ms)
﹣ executes Codex and Antigravity Windows npm shims with literal argv (0.063334ms) # SKIP
✔ accepts the exact pairing contract and preserves local-only source authority (13.718417ms)
✔ rejects server attempts to add local paths, executables, or unknown mapping fields (0.946209ms)
✔ protocol errors are snake_case and terminal output strips control characters (0.703792ms)
✔ rejects agent substitution and non-exact pairing source sets (0.333916ms)
✔ pairing accepts a previously connected local source omitted from current discovery (0.370792ms)
✔ rejects oversized, incomplete, and reconciliation responses without sources (1.05175ms)
✔ compact reconciliation requires every requested source and supports 100 mappings (0.477458ms)
✔ accepts only the expected verification origin, path, code, and web protocols (0.508417ms)
✔ stored network mappings cannot override local collection authority (0.146125ms)
✔ POSIX state security migrates only recognized legacy state and writes its marker (55.053958ms)
✔ POSIX state security rejects unrelated content before changing modes (10.35125ms)
✔ POSIX state security accepts a new custom directory but rejects a nonempty dot directory (7.603042ms)
✔ an unmarked custom directory with a foreign config remains completely unchanged (92.74275ms)
✔ legacy migration locks the root before accepting a final unchanged tree (54.403458ms)
✔ state initialization recovers after its migration-lock owner is terminated (152.850666ms)
✔ orphaned migration artifacts do not make custom state substantive (27.019667ms)
✔ a live state migration lock is not displaced by another initializer (157.905458ms)
✔ stored connector origins fail closed before configuration is returned (7.310792ms)
ℹ tests 25
ℹ suites 0
ℹ pass 24
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 675.809459

```

## node --test --test-name-pattern=reconnect packages/connector/test/config.test.mjs

Exit: 1

```text
✔ keeps a manual Qwen hook root through reconnect and uninstall (60.000292ms)
✔ reconnect rejects omission and retains a temporarily unavailable source (520.214126ms)
✖ reconnect retires only an explicitly disconnected unavailable source before pairing (281.782708ms)
✔ doctor disables a revoked installation and recommends reconnecting (61.449334ms)
✔ reconnect replaces authorization after an in-flight sync without token resurrection (195.782417ms)
ℹ tests 5
ℹ suites 0
ℹ pass 4
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1167.215042

✖ failing tests:

test at packages/connector/test/config.test.mjs:3363:1
✖ reconnect retires only an explicitly disconnected unavailable source before pairing (281.782708ms)
  Error: Command failed: /usr/local/bin/node /work/repo/packages/connector/bin/viberacing.mjs connect --origin http://127.0.0.1:36291
  Vibe Racing: Vibe Racing returned an invalid protocol response
  
      at genericNodeError (node:internal/errors:985:15)
      at wrappedFn (node:internal/errors:539:14)
      at ChildProcess.exithandler (node:child_process:417:12)
      at ChildProcess.emit (node:events:509:28)
      at maybeClose (node:internal/child_process:1141:16)
      at ChildProcess._handle.onexit (node:internal/child_process:306:5) {
    code: 1,
    killed: false,
    signal: null,
    cmd: '/usr/local/bin/node /work/repo/packages/connector/bin/viberacing.mjs connect --origin http://127.0.0.1:36291',
    stdout: 'Detecting supported agent sources…\n',
    stderr: 'Vibe Racing: Vibe Racing returned an invalid protocol response\n'
  }

```
