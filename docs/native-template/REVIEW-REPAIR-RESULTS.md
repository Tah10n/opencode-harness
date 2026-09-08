# Separate native review and one repair: development observations

This follows the [pre-run plan](REVIEW-REPAIR-PLAN.md) on the three saved on-patches
from report `42af300a5bcf17da7c542879d7a20a61305b556d`. It does not rescore the six
historical outcomes. These reused tasks support mechanism diagnosis, not p-values,
a general lift estimate, or release evidence.

## Review findings and independent adjudication

All six fresh reviews completed once. Each had the original requirement, complete
supplied source, original/supplied Git history, documentation and normal checks.
No author completion claim, arm label, research explanation, external diagnostic,
reference patch or other review was mounted. Review-only instructions took
precedence over the quoted implementation task. `/input` was mounted read-only;
commands ran on `/work/repo`, a separate diagnostic copy. The same model in a fresh
context is not an independent model architecture. Native task delegation was denied.

| Finding | What the reviewer reported | Independent disposition |
|---|---|---|
| R01.1, collectors candidate | One malformed JSONL file suppresses valid files through global `schemaInvalid` | Confirmed new defect. The shared per-file commit gate reads an aggregate flag. Two file assignments reproduce order-dependent loss; ordering must be controlled when testing it. |
| R01.2, collectors candidate | Antigravity nested `result.usage` / timestamp records miss incremental event keys | Confirmed existing defect, not introduced by this patch. Append of the same accepted record changes total 3 to 6 on both original and candidate. Parser support establishes the valid input shape. |
| R02.1, ledger control | Old Qwen state loses valid components during migration | Confirmed. Original reader regression gets missing input components instead of 7; repeated independently. |
| R02.2, ledger control | Cutover pending state is absent after rejected upload | Confirmed. Existing config test fails independently; pending/confirmation delivery is not established by the control. |
| R03.1, Cursor candidate | Numeric date concatenation rejects later valid dates | Confirmed. September 10 and October 1 compare below the September 2 floor. Independent original CLI/sync assertions with the October fixture pass only 1/11. |
| R03.2, Cursor candidate | Required CLI capture/account-routing test changes absent | Confirmed missing explicit deliverable. Only parser tests changed; the original task explicitly names consumer tests. |
| R04.1, collectors control | Antigravity metadata should be ignored | Unsupported assumption. Metadata becomes partial, but the dedicated capture writer emits validated usage records; arbitrary metadata has not been established as valid irrelevant input. Do not convert this criticism into a fail-open instruction. |
| R04.2, collectors control | Qwen schema-less metadata should be ignored | Unsupported assumption. Old silent skipping does not prove that a record outside the dedicated usage-log schema must remain authoritative/complete. |
| R05.1, ledger candidate | Hash-only ledger loses accepted tuples on rewrite/truncation | Confirmed. It cannot reconstruct accepted daily usage. Independent lifecycle checks fail. |
| R05.2, ledger candidate | Persisted `clientSourceId` key disagrees with cutover `sourceId` readers | Confirmed new regression. Existing cutover acceptance test fails; the live consumers were not migrated. |
| R05.3, ledger candidate | Existing 0.4.3 accounting is not conservatively migrated | Confirmed missing behavior. All three public 0.4.3 migration sequences fail on a separate candidate copy. No ready fix or these tests were sent to repair. |
| R05.4, ledger candidate | Every out-of-range observation must enter the ledger | Unsupported assumption. No distinct double-count reproduction establishes this claim beyond the confirmed rewrite loss; the precise retention requirement must respect bounded accounting. |
| R06.1, Cursor control | Support docs say 0.7.1 while package/version remain 0.7.0 | Confirmed documentation inconsistency created by extracting task files without release files. This is a control-construction limitation, not a runtime defect. |

Of 13 atomic findings, 9 are confirmed defects (one pre-existing), 1 is a confirmed
missing explicit test deliverable, and 3 are unsupported assumptions. There are
zero conclusively demonstrated false requirements; that does **not** make the
three unsubstantiated claims true. All three were presented too confidently by
the reviewer. No test requirement was inferred merely from optional test wording.

The reviewers did not specifically identify the collectors' unsupported-Gemini
and retry failures, nor the unchanged OpenCode SQLite accounting path in the
ledger candidate. Missing new collectors/ledger lifecycle regressions were not
made into specific delivery findings. Criticism of a control was adjudicated
rather than automatically counted as a false positive.

## Controls and their limits

Controls use public commits [collectors #48](https://github.com/Tah10n/viberacing/commit/0f8b1c7e1e502bb27ee01fc647e6b618035ca42c),
[ledger #50](https://github.com/Tah10n/viberacing/commit/9e389a6dbc1b0c9813599fb61eceb6958d8c4de4),
and [Cursor #66](https://github.com/Tah10n/viberacing/commit/bbff8e4fa90497ba411c6487e07a004bcb8b84c3).
They are positive controls only for checked behavior, not fully correct deliveries.
The selected public files and their scope were fixed before reviews.

| Control | Supplied ordinary checks | Independent behavior | Original-test overlay and delivery limits |
|---|---:|---:|---|
| Collectors | 93/93 | 2/2 | 86/88 original overlay: one assertion fixes parser version at 3 while correction uses 4; another rejects provisional-tail entries which the public correction returns as partial without committing them. Neither failure is silently counted as preservation success. The version assertion alone does not prove a runtime regression; original test preservation is not complete. |
| Ledger | 210/212, including 9/9 selected public ledger sequences | 6/6 | 201/203 original overlay. Qwen components and cutover pending remain broken; both limitations were recorded before reviews. Adapter sequence success does not prove config/persistence completion. |
| Cursor | 23/23 | 2/2; October CLI/sync 11/11 | 20/20 original overlay, but extracted support docs have the 0.7.1/0.7.0 inconsistency found by review. |

Preflight did not repair a control to make it appear correct. These incomplete
controls constrain conclusions about false-positive rates and overall delivery.

## Repair boundary

Exactly one repair was admitted for each candidate with grounded findings. Each
fresh native session received its saved candidate, original task, unmodified own
review and that review's tool inputs/outputs and diagnostic files. It received no
adjudication, omitted defect, independent probe, reference implementation or ready
fix. Assumptions were explicitly hypotheses to check against the task. No human
edited production code. Both incremental repair and final-against-original patches
are retained, including failed/incomplete outcomes.

## What repair actually delivered

| Candidate | Confirmed improvement | Shipped regressions | Independent result after repair | Remaining delivery |
|---|---|---|---|---|
| Collectors | Cross-file contamination fixed for both file orders; nested Antigravity append replay remains 3 instead of doubling to 6 | Two new tests. Cross-file test fails on both original/saved source and passes repaired. Antigravity test merely rewrites identical content; it passes before repair and does not detect the append defect | Original preservation 88/88; shipped 90/90; unchanged functional probes still 0/2 | Unsupported-Gemini/retained-state/retry obligations remain. No discriminating shipped append regression. |
| Cursor | Validated numeric component comparison fixes September/October rejection | Added September-10 parser and CLI executable-capture checks; changed a sync fixture to Desktop 3.19.13 | Original preservation 20/20; shipped 22/22; frozen functional 2/2; October CLI/sync improves 1/11 to 11/11 | Sync change replaces its only CLI-version routing fixture rather than extending it. Existing CLI routing coverage is lost. New CLI test forces an empty executable extension on Windows. |
| Ledger | Restored source-key consistency and cutover transition in the checked path | No test changes | Original preservation improves 202/203 to 203/203; shipped 203/203; lifecycle remains 0/6; public migration remains 0/3 | Accepted history still disappears after move/truncation/database deletion. No lifecycle regressions ship. New unvalidated ledger-entry retention breaks a prior normalization boundary. |

Collectors source now uses a per-file flag for rollback and an aggregate flag for
diagnostics. Antigravity event keys follow the already-supported parser forms.
The independent append example verifies actual behavior; it does not rescue the
insensitive shipped test. On separate original and saved source copies, the final
reader tests pass 82/83: cross-file fails, append-test replacement passes. On the
repaired implementation all 83 reader tests pass. This proves useful but partial
regression delivery, not the original collectors task.

Cursor tests copied to original source pass 19/22, failing the broadened parser,
CLI capture and Desktop sync cases. On the saved candidate they pass 20/22:
parser and CLI fail while Desktop sync already passes. The repaired source passes
22/22. Expectations come from the date floor and explicitly permitted Desktop
version, not from a reference implementation. Independent October checks retain
all original assertions and pass 11/11 after repair. No executed Linux runtime
regression was found in this scope. However, changing the sole CLI sync fixture to
Desktop is a coverage regression. The new `fakeAgent(..., "", providerVersion)`
also bypasses its default `.cmd` suffix on Windows while writing batch contents;
`resolvedExecutableInvocation` routes only `.cmd`/`.bat` through the command shell.
This is a source-grounded test portability concern; Windows execution was not
available and is not represented as a measured Windows failure.

Ledger repair claims to migrate old identities using tombstones and stores parsed
entry objects beside tuple hashes. The frozen sequence tests still fail (Gemini,
Antigravity, Qwen and Kimi progress to truncation before losing the old day; Claude
fails on move; SQLite remains unchanged and loses the deleted day). A first failing
assertion leaves later conflict/range clauses unproven. The three public migration
sequences also remain 0/3. The cutover fix is real but does not establish safe
account switching. Its final in-session check reran readers/protocol and the
focused cutover test after the last edit, not the entire config suite; the separate
post-repair full preservation run provides the 203/203 evidence above.

### New ledger normalization regression

A separate public-API check starts with the adapter's current compatible
`nextState`, inserts one ledger entry with a valid 64-hex identity/hash and an
`entry` containing valid-looking date/total plus an unexpected canary field and
1 MiB extra string, then collects an empty directory. No actual secret is used.

- Saved candidate: 76-byte next state, unexpected field discarded.
- Repaired candidate: 1,048,954-byte next state, unexpected field retained,
  `completeness: complete`, no diagnostic.

`normalizeLedger` now copies `event.entry` without validating its keys, types or
byte size. Its 4,096-event cap no longer bounds persisted bytes, and content-free
state normalization no longer rejects arbitrary extra fields. This is a new
state-validation/privacy/bounds regression, not proof of an external data leak.
It was found independently after repair and was not fed back for another attempt.

## Additional cost and execution limits

| Accounting | Six reviews | Three repairs | Total |
|---|---:|---:|---:|
| Native session seconds | 720.792 | 558.418 | 1,279.210 |
| Native tool calls | 145 | 96 | 241 |
| Provider requests | 69 | 62 | 131 |
| Recorded input | 1,308,427 | 875,783 | 2,184,210 |
| Recorded output | 12,955 | 10,039 | 22,994 |
| Recorded reasoning token count | 5,493 | 2,683 | 8,176 |
| Recorded cache read | 243,712 | 374,272 | 617,984 |
| Recorded cache write | 0 | 0 | 0 |
| Recorded normalized total | 1,570,587 | 1,262,777 | 2,833,364 |

All nine sessions completed with zero timeout, no replacement, no intervention,
and successful patch/source capture. All 131 recorded provider responses were
HTTP 200. There were zero new initial implementations. Session time is summed
native elapsed time (21 min 19.210 s), excluding preparation, independent checks
and report work. Tokens cover recorded `step_finish` only; normalized total sums
input/output/reasoning/cache fields and is not billing. Auxiliary coverage and
monetary cost are unavailable. No hidden reasoning text is published.

Runtime remained OpenCode 1.18.26, Node 24.19.0, openai/gpt-5.6-luna / low,
900 seconds per session, unchanged materialized core bytes and the previous
network-none prepared container/image and transport. The transport remained
outside the product. A first approval review rejected execution before any model
attempt; public-origin checks then confirmed the public repository, all source/fix
commits and base-file correspondence, and approval permitted the unchanged
frozen run. This is not a retried model session.

In-session scheduler timing failures and unavailable `corepack pnpm verify`
(DNS/package retrieval in the isolated environment) remain recorded. They are not
silently replaced by the later focused/full-suite evidence. This report does not
claim full project verification, Windows/macOS test coverage, CI or production
validation. The historical 30-file revision freeze and original source/patch
captures remain unchanged; new evidence is in a separate private local journal.
[Privacy-safe binding and per-session accounting](review-repair-evidence-index.json)
contains hashes and summaries, not credentials, raw logs or reviewer transcripts.

## Integration decision

Separate review showed local utility: four concrete runtime corrections were
confirmed (two collectors issues, Cursor date ordering, ledger cutover), and
Cursor received real missing consumer-test coverage. It did not complete the
collectors/ledger obligations, did not preserve all test coverage, and the ledger
repair introduced a normalization regression. No candidate is promoted as a
complete safe delivery. The effective-harness goal remains open.

Do not implement a plugin from this batch or start automatic idle-triggered
reviews. A minimal design worth considering only as an explicit opt-in experiment
is a user-invoked command that snapshots a finished change, opens one fresh native
review session, then permits at most one repair against its grounded findings.
Ordinary OpenCode remains the executor; cancellation and a shared bounded session/
request/time budget stop both stages. Cancellation must not start a replacement
session. A no-findings result never becomes a correctness certificate. No second
reviewer is added to rescue outcomes. This is a design boundary, not an implemented
or verified integration.

Before any implementation, inspect the installed OpenCode SDK and supported
command/events/cancellation APIs. No pre-completion hook is assumed here, and
`session.idle` must not be described as a guaranteed block on the final answer.
No runtime, core instructions, default, historical outcome, release or merge was
changed by this work.
