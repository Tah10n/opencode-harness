# Real development changes, 2026-09-07

Purpose: diagnose ordinary OpenCode on real, multi-file compatibility work before
choosing one small addition to the existing 0.2.0 product. These three tasks are
development examples, not a new benchmark epoch or an effectiveness estimate.
All tasks come from the local public VibeRacing history. Historical solutions
are withheld from execution copies; existing source, docs and tests are visible.
No task is selected based on its observed plain outcome. No plain attempt is
replaced or retried to obtain a desired result. Infrastructure interruptions
remain separately recorded, never counted as agent errors.

Common execution: native OpenCode 1.18.26 build agent and ordinary tools;
openai/gpt-5.6-luna, low; 900 seconds per first attempt. Isolated archives with
fresh Git history and no origin; no host credentials exposed to repository tools.
Native shell, search, read, edit, patch and todo tools remain available. No harness
planning prompt is added to plain. Each task preserves original test bytes;
additional tests may be written. Validation is performed on another copy and
records commands, exit status, diagnostics, scope and patch. Existing checks do
not by themselves establish completion of the new requirement. New development
checks are diagnostic examples, not model-certified repair authority.

## collectors-preserve-state

Base: VibeRacing 4913b05975dcfdec9a37adba5a0c5ea5c3e8a88f.
Documented correction: 0f8b1c7e1e502bb27ee01fc647e6b618035ca42c, PR #48.

Requirement: make the non-Codex usage collectors fail closed on malformed or
unsupported usage records. Such records must report partial/incomplete data and
the schema diagnostic instead of authoritatively clearing previously collected
days. Preserve the last committed incremental state. Handle an unterminated
JSONL append/rewrite as provisional and retry it when completed. Apply the policy
consistently across Claude, Gemini, Kimi, Qwen, Antigravity and OpenCode consumers.
Keep diagnostics content-free.

Preserve: valid usage totals and components, deduplication, time ranges, ignored
irrelevant records, byte/scan bounds, parser-state upgrades, exported parser APIs,
Codex behavior and original regression tests. No unrelated server/release work.

Verification: original connector reader/diagnostic tests; the exact public reader
regressions introduced by PR #48, inspected against the requested clauses;
source review of all six adapters and shared helpers. Diagnostic tests alone do
not authorize product repair. Every failing command is retained.

## account-switch-ledger

Base: VibeRacing 2b16b6a8ad75b6b852adc5e2189e6d4a8d93eabd.
Documented correction: 9e389a6 (PR #50).

Requirement: support safe account switching in the connector's event accounting
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

Verification: original reader/config/protocol tests; selected public PR #50
reader regressions for 0.4.3 migration, Kimi/Gemini copy/move, OpenCode deletion,
ledger overflow, identity conflict and corrupt ledger. Inspect shared helpers,
each event adapter, and state persistence consumers. Tests that require excluded
Codex identity APIs are not relevant and must not be imposed.

## cursor-compatible-versions

Base: VibeRacing f2fdbf718c72ca4c27ea7dd225481b111e01f800.
Documented correction: bbff8e4fa90497ba411c6487e07a004bcb8b84c3, PR #66.

Requirement: Cursor auto-updates must not reject otherwise valid exact per-turn
usage. Accept stable Desktop 3.x from 3.18.25 and valid dated CLI builds from
2026.09.02, including Desktop 3.19.13. Integrate the compatibility policy across
parser, CLI capture/account routing tests and public support documentation.

Preserve: rejection of old, malformed, prerelease and new-major Desktop versions;
exact mandatory counters, completion/identity validation, aggregate consistency,
pairing, deduplication and immutable UTC capture time. No estimated fallback,
protocol/schema migration, deadline change or package release/version change.

Verification: original cursor-events, cursor-cli and cursor-sync suites; exact
public version-related regressions from PR #66 with unrelated wrapper timeout
and release edits excluded; inspect the documented support boundary.

## Evidence and next decision

Before model execution save the task text, source SHA, immutable original test
hashes, check commands and runtime identity privately. Save the produced patch,
material tool events (including inputs), final message, tokens/cache/cost metadata,
wall time and check logs. Zero provider cost metadata means unavailable price.
Diagnose missed requirement/consumer, incomplete integration, lost context or
misread check separately from runtime/evaluator defects. Select at most one
mechanism after these artifacts exist. Validate the installed full path from a
fresh task, without importing plain D0 or intervening mid-run. Retain regressions
and overhead. Do not change defaults, release, rescore the historical study or
claim lift. Only reproducible development improvement permits planning a separate
new-task evaluation with tasks and analysis fixed before outcomes.
