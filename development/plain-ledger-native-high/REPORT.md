# Admission blocked by reference compatibility failure

The full original account-switch-ledger task has **not** been executed. No Luna
request or scripted preflight has been made. The source/task provenance is
established, but reference calibration does not satisfy the user's pre-run
condition for all mandatory behavior. This is neither a new plain-model failure
nor a replacement for the requested full task-run.

The exact archived task is 1,468 bytes, SHA-256
`c855e75f5b4705f703f5c4c39e01d05c73505854c32a4ff97dd5d564e82573eb`.
All baseline test/fixture hashes match the historical `before.json`. The archive
was read without changing historical experiments. Both public commits exist in
the local VibeRacing Git database; execution copies were extracted from exact
`git archive` outputs. No VibeRacing source was edited or published.

## Fresh observations

| Check | Baseline | Reference | Meaning |
| --- | --- | --- | --- |
| Original saved SQLite probe | 0/1 | 1/1 | Deletion retention, fresh event and replay after JSON roundtrip |
| Original saved five-adapter lifecycle probe | 0/5 | 5/5 | Claude, Gemini, Antigravity, Qwen, Kimi; move/truncation/replay/ranges; stable-ID conflicts and privacy |
| Public Antigravity compatibility probe | 2/2 | 0/2 | Reference silently drops supported old input forms |
| Each revision's reader/config/protocol suites | 203/203 | 241/246 | Different inventories; reference's five failures require unavailable historical npm packages, so not five product defects |

The two saved probes are unchanged, including their `/workspace` import target;
that mount points directly to the corresponding extracted revision. They use
real adapters and SQLite, without mocks. The lifecycle/SQLite probes serialize
nextState and use the restored object on the next call. No test-count aggregate
is used to claim whole-task calibration. CLI persistence, complete migration,
remaining independent old-input paths, account boundaries, overflow/corruption
and upload privacy remain incompletely calibrated as itemized in PLAN.md.

All checks used the existing native launcher image
`sha256:0ed6cee0b095ecf1e1e780418cb373d462f1b99643bb86db0a8de7dd58fc83a6`,
Node v24.19.0 and Git 2.39.5. `/tmp` stayed noexec; TMPDIR was the task's writable
exec tmpfs `/work`. No owner check or containment policy was disabled. Standalone
image `rg` is absent; the existing launcher normally supplies its prepared `rg`.
The complete native execution environment and project-wide `pnpm verify` were
not certified. Connector baseline scoped checks need no external npm packages.

## Concrete reference defect

Two separate one-record JSONL inputs are accepted by the public baseline parser
and collector:

```json
{"id":"private-legacy-event","timestamp":"2026-08-10T12:00:00Z","usage":{"input_tokens":10,"output_tokens":5,"total_tokens":15}}
{"session_id":"private-legacy-event","date":"2026-08-10","usage":{"input_tokens":10,"output_tokens":5,"total_tokens":15}}
```

With range 2026-07-15 through 2026-08-14, expected output is date 2026-08-10,
total 15, input 10, output 5, zero remaining components. Baseline collection
returns it and preserves it through JSON serialization/replay. Reference's
parser also returns it, but reference's collector returns `entries: []` with
`completeness: complete` in both cases. The failure occurs before reference
serialization assertions; no reference roundtrip success is claimed.

Reference `adapters/antigravity.mjs:73-82` accepts only literal `id` and `date`
when building the event key, although its public parser accepts `session_id`
and timestamps. Reference `adapters/shared.mjs:491-503` puts such records into
`unseenLines`; its later parser call checks unsupported counts but does not add
parsed totals to the returned ledger-derived entries. This is observable silent
loss, not a ledger-name or metadata assertion. Baseline preservation in the
original task is the criterion; the historical solution is not an oracle here.

The reference's separate five config-suite failures name missing
`@viberacing/connector-0.4.3` / `connector-0.4.4` npm aliases. Full outputs remain
private with hashes in calibration-receipts.json. No dependencies were upgraded,
no assertions removed, and no reference repair was attempted.

## Status and accounting

One intended slot, `account-switch-ledger / P / high`, remains `not_started`.
`delivery_apply`, `delivered_checks`, `assessment_integrity`, Q, T and D are null;
there is no M or author final response. Contract evaluation on an author patch
is NOT RUN. Requested 1800-second author budget remains unused. Scripted native
preflight, real task runs, author/title/service provider requests, author tokens
and author tools are zero because dispatch never occurred, not because unknown
usage was replaced with zero. Developing-agent work and six local calibration
commands are separate; monetary cost is unavailable and not estimated.

No current author trajectory exists, so no mechanism addition is proposed.
Material UI 18141 remains its separate successful control. Historical outcomes
and pauses are unchanged. The unresolved decision is whether to preserve the
strict all-reference-pass admission condition or explicitly permit the single
run with baseline-backed compatibility oracles and the reference defect exposed.
No model dispatch or final push is performed while that question is pending.
