# account-switch-ledger: one current native plain attempt

Known, deliberately revisited development task, not a held-out task or a sample
of model reliability. Starting branch/remote: fa8daa7e5b8ec47d0fabc3ccaed6955db6217707.
Material UI 18141 stays a separate successful control and is not rerun.

## Source and admission

`original-task.txt` and `original-PLAN.md` are exact archived bytes, verified
against the saved archive index. `original-before.json` binds the public baseline
2b16b6a8ad75b6b852adc5e2189e6d4a8d93eabd and every original connector test/fixture
hash. Reference 9e389a6dbc1b0c9813599fb61eceb6958d8c4de4 is evaluator-only.
No reference code, historical patch, failure, evaluator, or this research plan
may enter the author copy. A source archive with newly initialized Git history
must be used; no origin, old objects, reflogs, or neighboring evaluator.

The user subsequently authorized correcting the compatibility defect. A separate
reference-derived copy now has `reference-compatibility.patch`; the historical
reference and the author baseline remain unchanged. Two baseline-supported
Antigravity shapes and pre-fix checkpoint recovery pass in that corrected copy.
This removes the identified compatibility obstacle. Behavioral calibration below
uses the unchanged reference where it passes and the explicitly corrected copy
for complete compatibility. The model has not been launched.

## Requirement → real execution path → observation

All clauses below come from the archived task's requirement/preservation text.
Automated behavioral checks and bounded source review are separate evidence.

| Required contract | Actual execution path | Observable check / status |
| --- | --- | --- |
| Retain accepted events on file moves/truncation, count new events once | Claude independent collector; Gemini, Antigravity, Qwen and Kimi decoders through shared JSONL collection | Unchanged five-adapter lifecycle probe, baseline 0/5 and reference 5/5 |
| Retain accepted database usage after deletion, count new IDs once | OpenCode independent SQLite collector via `adapterFor('opencode').collect` | Unchanged SQLite public probe, baseline 0/1 and reference 1/1 |
| State survives serialization and is reused | Each probe passes `JSON.parse(JSON.stringify(nextState))` to the next collection | Six probes plus cli-persistence.test.mjs: four distinct sync processes per adapter, disk reload and two isolated source mappings; baseline 0/6, corrected reference 6/6 |
| First tuple wins on conflict; unrelated new events continue; range and privacy preserved | Four stable-ID JSONL paths in lifecycle probe | Reference reaches lifecycle assertions; migration-contract.test.mjs covers SQLite conflict and Kimi legacy replacement after JSON reload (complete migration suite baseline 0/8, corrected reference 8/8) |
| Existing parser APIs and supported older inputs stay valid | Public parser exports and independent adapter collection | Two Antigravity legacy forms pass baseline, fail reference; historical discrepancy is retained, supplementary corrected copy passes |
| Conservative 0.4.3 migration | Claude state, shared JSONL state, Kimi/Gemini historical fixtures, OpenCode confirmed exact-ID cutover | Exact Kimi 0.4.3 fixture plus baseline-generated Claude/Gemini/Qwen/Antigravity accepted states, Kimi legacy input and OpenCode confirmed/missing cutover; preserved totals and new events after JSON reload |
| Account/source boundaries and collection/config propagation | CLI sync → adapter state keyed by source ID → runtime `writeState/readState`; config source mapping | Original baseline suite 203/203; cli-persistence.test.mjs verifies actual sync and disk persistence for all six adapters, two source IDs with the same event ID and distinct tuples, source deletion and new events |
| Bounded scans/storage, partial/error semantics, corruption fail-closed | Adapter scan bounds and persisted state validation | Original tests plus source review: separate Claude/SQLite paths and shared JSONL enforce scan and ledger bounds, validate persisted tuples before use and report partial/fail closed. Candidate review follows the procedure below without requiring reference limits or layout |
| No raw IDs/content in persisted accounting/upload | Adapter state, CLI snapshot construction, protocol | Lifecycle and migration checks reject raw fixture IDs in state; real CLI tests reject IDs/source paths in uploads and raw IDs in stored state |
| No unrelated Codex identity/server/release changes | Final complete patch against baseline | Final diff review; no patch yet |

Account switching must follow existing adapter identity and aggregation contracts.
Do not invent provider-account discovery or require separation of combined local
history; Codex account identity discovery and server account dedup are excluded.
Shared JSONL success does not establish Claude or SQLite success. Kimi current
and legacy inputs, accepted old state and fresh state are distinct paths.

## Test interpretation fixed before author execution

The old reader assertion dropping 2026-08-10 after truncation is explicitly
superseded by the new retention requirement. Preserve its other assertions.
Do not require reference field names, ledger layout, parser version numbers,
helper names, or exact JSON structure unless already a public contract.

The historical Qwen per-file `entries` mutation/parser-version assertion and
stale metadata deep-equality assertions for unsupported records are diagnostic.
They are not automatically discarded or counted as product failures: observable
migration/state preservation must be checked independently. All delivered
project test failures remain recorded, including internal assertions.
The full baseline reader/config/protocol commands run separately from contract
acceptance. Documentation and author regression tests have no new mandatory
criterion beyond the original task and project AGENTS.md. That file requests
`corepack pnpm verify`; any unavailable dependency/check is reported separately.

## Run and result rule

Exactly one fresh slot: account-switch-ledger / native plain / high,
OpenCode 1.18.26, openai/gpt-5.6-luna, 1800 seconds for the whole run.
Existing OAuth route, native tools/todo, offline webfetch denials, current
launcher/capture and pinned Node 24 image. No plugin, nudge, reviewer, repair,
continuation, smoke, availability request, deadline extension, or second attempt.
No collector, transport, lib, default, or product dependency changes.

Before a real request, complete calibration and environment verification, one
scripted preflight with read/edit/bash/Git/spill/capture, then commit task,
configuration, acceptance, hashes and budget locally. Retain full outputs before
container cleanup and use existing recovery if capture is incomplete.

F = exact baseline + complete unchanged M, including tests/docs/new files,
deletions and modes. Apply M to fresh ordinary Git and run delivered checks.
Independent assessment uses the same implementation bytes and verified imports;
no historical full test diff or hidden implementation requirement.
`delivery_apply`, `delivered_checks`, `assessment_integrity`, `contract_results`,
Q, T and D are separate. Q means the entire declared task is fulfilled; missing
checks or invalid environment/imports remain unknown/error. T requires native
stop, retained final response and verified termination. D = Q ∧ T.

Keep request roles, known/unknown usage and cached/reasoning subsets distinct;
never sum subsets twice or estimate money. Preparation/evaluator/developing
agent work is separate from Luna. Publish compact safe evidence only, with one
ordinary final push/update to draft PR #25, keeping base/main and history.

## Frozen assessment procedure

F is an exact baseline Git checkout plus the entire unmodified captured M,
including new files, modes and deletions. Apply without repair or exclusions;
record apply failures separately. Run delivered reader, config and protocol
suites there, and attempt the repository verify gate without dependency upgrades.
All real failures stay in receipts. A unavailable web-workspace dependency is an
environment limitation, not a model failure or an invented project-gate pass.

E is an independent copy of that same F implementation. Mount this directory
read-only at /workspace, the exact old baseline at /baseline for old-state input
generation, and evaluator probes separately at /probes. Execute unchanged
account-switch-ledger.test.mjs, ledger-lifecycle.test.mjs, legacy-input.test.mjs,
kimi-migration.test.mjs, migration-contract.test.mjs and cli-persistence.test.mjs.
Together they contain 23 behavioral tests. Loopback HTTP in the CLI probe supplies
protocol acknowledgements; the CLI, collectors, state loading and writes are real.
This tests configured source isolation, not excluded provider-account discovery.

Review M against the original preservation clauses, tracing each changed reader
through collection and persisted-state consumers. For boundedness, inspect scan
and storage caps, overflow handling, retention of already accepted tuples and
validation before using reloaded state in Claude, SQLite and the shared paths.
Different finite limits and internal representations are acceptable; no hidden
reference schema or numeric cap is mandatory. Record exact source locations and
any gap. Existing diagnostic tests referring to representation do not substitute
for this review. Baseline lacks an accepted-event ledger; the reference validates
bounded hashed tuples in shared.mjs and its independent Claude/SQLite paths,
with partial/error behavior at limits (covered by its existing reader suite).

Q=true only when all applicable user-contract checks and preservation review
pass. Q=false requires an observed contract violation; unavailable or invalid
evidence is unknown. T requires an ordinary native stop, complete capture and
verified termination; report deadline/transport/unknown submission independently.
D=Q AND T with unknown propagated unless a known false determines the result.
An unavailable full web gate limits verification claims even if the scoped task
contract is satisfied. No evaluator failure is returned to the author for repair.
