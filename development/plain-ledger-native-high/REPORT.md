# One native plain account-switch-ledger attempt

**The complete task was not satisfied: Q=false, T=true, D=false.** One ordinary
native attempt ended normally and delivered a portable, unchanged patch. Its
project suites pass, but independent checks reproduce lost accepted usage,
duplicate accounting and incomplete compatibility. This is a deliberately
revisited development example, not held-out evidence or a reliability estimate.
Material UI 18141 remains a separate successful control and was not rerun.

## Run and delivery

The exact archived task (1,468 bytes; SHA-256
c855e75f5b4705f703f5c4c39e01d05c73505854c32a4ff97dd5d564e82573eb)
and baseline 2b16b6a8ad75b6b852adc5e2189e6d4a8d93eabd were restored from the
historical archive. The technical environment block is separate. The author
received the full public baseline, original task and verified environment; no
reference, old solution, evaluator or historical failure was supplied.

The single scripted preflight passed native read/edit/bash, ordinary Git diff,
203 original tests, spill retention, capture and termination. Its eight requests
were handled locally; it made zero real provider calls. The task, acceptance,
hashes, configuration, one slot and 1800-second budget were committed locally in
1648f34c before the first real request.

One OpenCode 1.18.26 / openai/gpt-5.6-luna high attempt used the pinned Node
v24.19.0/Git 2.39.5 image recorded in [manifest.json](manifest.json). The complete
project was writable in an isolated tmpfs with a fresh one-commit Git history
and no remote. Webfetch stayed denied globally and for build. No harness plugin,
advisory, externally assigned reviewer, intervention, continuation or second
attempt was used. The author independently invoked the ordinary native read-only
explore tool once; both build/explore sessions and their requests are counted.

Native execution lasted **1,737.870 seconds**, and the whole slot 1,740.187
seconds. It ended with exit 0 and an ordinary stop before the deadline. Capture
and termination are verified, the relay/container was removed, and no provider
handler remained. The corrected collector reported complete evidence. This real
run produced no native spill files; spill retention was exercised by the
scripted preflight, not inferred from the real run.

[M](model.patch) changes nine files, with 355 insertions and 45 deletions. All
patch bytes and modes were applied without repair to an exact baseline Git copy
F. E is a separate identical implementation copy with external probes. Its
implementation hashes match F before and after evaluation. No VibeRacing source
repository was edited or published.

## Observed checks

| Check on final unchanged M | Result | Scope |
| --- | --- | --- |
| F readers / config / protocol | 87/87 + 103/103 + 14/14 | 204 project tests pass |
| F corepack pnpm verify | Unavailable | Pinned pnpm/web dependencies not cached; network disabled |
| E saved SQLite lifecycle probe | 1/1 | Deletion retention, new event, JSON reload and replay |
| E five JSONL lifecycle probes | 0/5 | Accepted old day is lost after move/truncation |
| E legacy Antigravity input | 2/2 | Baseline-supported aliases and JSON reload |
| E historical Kimi 0.4.3 migration | 0/1 | Copy doubles 20/21 into 40/42 |
| E other migration/cutover/conflict checks | 1/8 | Confirmed-cutover fixture passes; six behavioral failures and one diagnostic-name mismatch |
| E real CLI persistence | 6/6 | Four separate sync processes per adapter, disk reload, deletion/new events and two isolated source mappings |

The frozen E inventory is **10 pass / 13 fail / 0 skipped, 23 tests**. Twelve
failures demonstrate retention, migration or cutover violations. The thirteenth
requires the reference spelling of a new conflict diagnostic; that spelling
alone is **not** treated as a product defect or used to determine Q. First-tuple
retention and unrelated valid SQLite usage pass that case. A separate consumer
observation confirms that the author's diagnostic is actually discarded by the
existing normalization path, which is an integration consequence rather than a
name preference.

Some later conflict/range assertions in the five lifecycle chains were not
reached after earlier failures. No pass is inferred for those assertions. Range
filters and finite scan/storage bounds were inspected in source, and ordinary
range/component tests pass; this is not an exhaustive load or performance test.

The author's final reader check followed its last Claude edit and passed 87/87.
Its config/protocol checks passed before that final edit. Independent F confirms
all 204 tests on the actual final M; evaluator success is not attributed to the
author. The author also attempted and accurately reported the unavailable
repository-wide gate. These are local results, not CI certification.

## Concrete consequences

All inputs, expected/actual observations, receipts and final-source locations
are recorded in [assessment.json](assessment.json). The additional reproductions
confirm the already declared clauses; they do not alter the frozen E score and
were never returned to the author.

- **Public collection retention:** shared JSONL and independent Claude use the
  ledger only when source/account ID is present. Existing collection calls with
  only dataPath lose the accepted 15-token day after a move or truncation.
- **Migration with full source/account metadata also fails:** baseline-generated
  accepted state containing an old 15-token day, followed by source replacement
  and JSON reload, returns only the new day as complete for Claude, Gemini,
  Qwen and Antigravity. Rescanning surviving files is not a conservative migration
  of accepted data that has disappeared. Kimi's historical copied-state case
  additionally double-counts accepted usage.
- **Account remap duplicates an observed event:** the same unchanged 10-token
  event becomes 20 after a valid account ID changes. Account-dependent hashing
  creates another ledger identity while both tuples remain in the returned
  aggregate. The author-added regression itself expects this duplication.
- **OpenCode cutover is not fail closed:** an accepted server baseline of 100,
  empty database and missing confirmed exact-ID cutover yield empty entries with
  complete status. A corrupted serialized ledger also becomes an empty, complete
  result instead of rejection or explicit partial/unavailable accounting.
- **Diagnostic integration is incomplete:** a conflicting 150-token rewrite
  correctly retains the first 15 plus an unrelated 7 and reports partial, but
  normalizeAdapterDiagnostics removes the new unregistered diagnostic before
  the CLI's diagnostic state/outbox consumer.
- **A supported ID shape leaks into persisted state:** a raw Claude provider ID
  containing 64 hexadecimal characters is mistaken for an existing digest and
  remains in serialized state. The same record returns 15 tokens in both M and
  the corrected reference; only M retains the raw ID.

The supplemental corrected-reference observations preserve the accepted totals,
avoid remap duplication, retain the conflict diagnostic and reject invalid
cutover/state. They also omit the raw hexadecimal ID. This does not make the
historical reference a universal oracle: its real Antigravity compatibility
defect was separately reproduced and fixed at the user's request in
[reference-compatibility.patch](reference-compatibility.patch). The historical
reference and author baseline remain intact; that repair is not part of M.
[The earlier preparation record](PREPARATION-HISTORY.md) is retained separately.

## Supported trajectory conclusion

The relevant existing truncation-test failure reached actual author requests
45 and 49, including the retained old day and the old expectation that it vanish.
The first attempt to add an identity gate failed as a patch operation; successful
shared/Claude gate edits followed, with success receipts in requests 52/53. The
author explicitly said it isolated persistence to identity-bearing sources so
ordinary tests kept their old behavior. The final patch retains that split.
[trajectory.json](trajectory.json) binds the selected calls to delivered receipts.

For this retention defect, the evidence supports a wrong compatibility boundary
chosen while satisfying an old assertion explicitly superseded by the task.
It does not support blaming missing context, lost stdout or a stale final reader
result. Migration, cutover, privacy and diagnostic issues have their own code
causes; this one trajectory decision is not asserted to explain all of them.

One minimal process proposal follows: within the **existing final task/diff
review**, classify an old assertion that contradicts an explicitly requested
behavior as superseded, and verify the replacement through the same public
caller before adding a compatibility fallback. No new phase, reviewer, nudge or
mechanism has been implemented, and no additional comparison is assigned.

## Accounting and limits

| Provider accounting for this one real attempt | Value |
| --- | ---: |
| Requests | 90: 89 work, 1 title |
| Input tokens, including cached input | 13,513,241 |
| Output tokens, including reasoning | 50,472 |
| Cached input subset | 9,839,616 |
| Reasoning output subset | 29,410 |
| Requests with unknown usage | 0 |
| Native tool calls / sessions | 162 / 2 |

Cached/reasoning subsets are not added again. No monetary cost is estimated
without billing evidence. Preparation, local evaluator work and developing-agent
work are separate from these author numbers; their token/billing totals are not
available. Full private captures remain local; [result.json](result.json) exports
safe hashes, counts and statuses, and [evaluation.json](evaluation.json) retains
the actual check receipts.

The task remains a concrete incomplete plain implementation under the specified
current conditions. It is not a replacement for the historical low/old-environment
result, a causal reasoning-level comparison, an estimate such as “1 of 2,” or
evidence of general harness superiority or uselessness. No repair of M, model
repeat, availability probe, merge, release or product-default change was made.
