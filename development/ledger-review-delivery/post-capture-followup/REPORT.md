# Separate D0 review and completion follow-up

**The new R → F path completed normally, but the full ledger task remains
incomplete: Q_followup=false, T_followup=true, D_followup=false.** The complete
[B → final patch](M.patch) reproduces the actual delivery files and executable
modes; [D0 → final](D0-to-final.patch) is a separate delta. No manual repair follows
F. Historical D0, pause, report and Q=false/T=false/D=false are unchanged.

## Native-result consumer repair and preparation

The research consumer previously called `stages.map` directly on a valid compact
receipt. It now uses full structured data when present, or reads the contract's
`result.json` beneath the collector-owned run directory. It validates parent and
author sessions, stage messages, execution directory, terminal snapshot and patch;
then the existing single-author/zero-repair and actual-tree checks run. The same
path captured F. Invalid or missing evidence is `evidence_incomplete`; no empty
stage list or assumed repairs value substitutes for evidence. Runtime, prompts,
collector, recorder, transport and provider policy remain unchanged at f98a9612.

Replay reproduced the old failure on saved A and resolved its actual 200927-byte
artifact. Eight negative controls cover missing/corrupt data, a foreign run,
receipt contradiction, missing repairs, wrong snapshot/session and cancellation;
they reject resolution and the transition gate while preserving original evidence.
These are resolver/transition controls, not eight additional installed runs.

The first installed fixture finished A/R/F and cleanup but failed large-report
coverage: its extra commands preceded the last mutation. Its 66 synthetic requests
remain recorded as an unsuccessful preparation attempt. After explicit user
authorization, one corrected fixture moved the same native events after the last
edit. The unchanged runtime returned `detailOmitted` for both A and F, linked to
33399- and 137815-byte full artifacts. Capture, stage/patch integrity, transitions,
exact reviewer inventory, failing-to-passing tests, executable mode and cleanup
passed. Another 66 synthetic requests were used; neither fixture used a real model.
[Large-result evidence](scripted-large-results.json), [replay and controls](resolver-verification.json).

Exact D0 was restored from hash/index-verified historical evidence, without edits.
D0 and M.partial are identical and their applied tree/modes match recovered A.
All 76 old responses have known completion; old local execution was absent.
Pinned bundles/configs matched their old hashes. A was not repeated and the old
scheduler was never reopened. [Provenance](provenance.json).

## The two new operations

Local commit `69a66199` froze the [plan](PLAN.md), [manifest](manifest.json), full
original task/environment, unchanged handoff, acceptance and a separate admission.
OpenCode 1.18.26 used openai/gpt-5.6-luna/high, existing OAuth and the specified
Codex responses endpoint in the original network-none Linux image. No availability
probe, real smoke, extra reviewer, retry or second author pass ran.

The common 1800-second budget began with R. The complete new chain took **998.037
seconds**, including transition/capture/delivery. R used 320.084 native seconds;
F used 670.552. F began with 1474.597 seconds remaining; the clock was not reset.
Both operations have verified local termination, capture and relay removal, no
active handlers and no unknown server completion. F's legitimate compact result
resolved successfully. Its internal observer remains `incomplete` because it
retained an earlier failing focused test command; this is distinct from native
completion and independent task acceptance.

R received only the full task/environment and exact B+D0 snapshot/code. Its actual
inventory was exactly read/glob/grep, including requests after tool results; it
made 31 calls and left the snapshot unchanged. No old assessments, private probes,
reference, historical reviews or author captures were mounted or sent.
[Unchanged R response](R.md), [inventory](review-inventory.json), [actual request inputs](model-input-verification.json).

R identified complete-record loss before an unfinished tail, duplicate-ID conflict
bypass, and unpersisted overflow accounting. It also raised Kimi identity and corrupt
state questions. Its “Checks NOT RUN” statement describes the review snapshot's
available evidence; it is not proof that historical A never ran tests.

F received the entire unchanged R response as untrusted diagnostics plus the full
original task and frozen handoff. It changed shared/Claude collection and added
four regressions: complete records preceding tails, conflict comparison, and
bounded overflow. The duplicate regression uses replacement rather than the exact
append trigger; source trace supports the change, with that coverage limitation.
[Unchanged F response](F-response.md), [actual files/modes](final-files.json).

## Independent acceptance of the entire final task

The full M was applied unchanged to an ordinary clean Git baseline and matched
actual F delivery. Independent F/E copies remained identical. All existing frozen
probes and expected behaviors were reused. Only the already-declared selection of
actual state discriminants/bounds was applied; no final-dependent new requirement
or hidden repair was introduced. Results were not fed back to F.

| Evidence | Final result |
| --- | --- |
| Ordinary Git application and actual delivery tree/modes | pass |
| Readers / config / protocol | 92/92, 103/103, 14/14 pass |
| Offline repository-wide `pnpm verify` | unavailable: pinned pnpm 11.7.0 cannot be fetched |
| Unchanged raw 23 probes | 15 pass, 8 fail; separate from semantic Q |
| Independent F/E integrity | verified |
| Actual storage byte-bound retention | pass; concrete improvement over D0 |

At the implementation's actual 16 MiB byte bound, 33 large valid tuples persist;
the next oversized tuple is rejected with partial diagnostics and is no longer
included in reported usage. Deleting input preserves the accepted total, replay
of an old event does not recount it, and a smaller new event is accepted. This
uses collector-produced JSON-roundtripped state, not a synthetic ledger. The two
selected checks used 130.603 seconds within the frozen 180-second cap. A separate
collector run at the entry-count bound and a full scan-boundary matrix were not run.

Confirmed violations remain:

- Migration from actual 0.4.3 Claude/Gemini/Qwen/Antigravity state loses previously
  accepted daily usage after source replacement. No absent historical per-ID data
  is required by the expectation.
- Relocated unterminated Claude/Antigravity replay still reports 30 instead of 15.
- Antigravity with prior 15 loses a valid new 7 beside unsupported input and still
  reports 15 after deletion, rather than 22.
- Corrupting the actual returned ledger version to -1 and deleting input returns
  complete empty usage with no diagnostic.
- OpenCode retains first/conflicting totals correctly with unrelated new usage,
  but its conflict diagnostic disappears in the actual normalization consumer.
  Diagnostic spelling alone is not a semantic failure.
- Raw Claude provider IDs, including a valid 64-hex ID, persist in state and the
  actual CLI persistence path.
- Missing exact-ID cutover returns rather than failing closed. Passing confirmed
  cutover and server-acceptance cases do not establish the missing-cutover guard.

Five complete CLI source-isolation/deletion cases pass. Claude fails privacy
before later deletion assertions, so that later coverage remains unknown. Range,
component and parser preservation is supported by the stated suites and probes,
not an exhaustive claim. [Contract assessment](assessment.json), [raw 23 results](raw-probes.json),
[supplemental](supplemental-observations.json), [selected state/bound observations](selected-observations.json),
[evaluation receipt](evaluation-receipt.json).

| Period/result | Outcome |
| --- | --- |
| Historical D0 | Q=false |
| Historical A native completion | true |
| Historical full pilot | T=false, D=false; R/F not_started |
| New R | completed; three findings, read-only |
| New F delivery | Q_followup=false, T_followup=true, D_followup=false |

This is partial help on a saved draft with extra model time. It does not establish
continuous autonomous success of old A→R→F, the causal effect of review, or an
advantage over equal-time independent author work. No additional repair follows.

## Accounting and delivery boundaries

| Real model period | Requests | Input tokens | Output tokens |
| --- | ---: | ---: | ---: |
| Historical A, counted once | 76 | 13,568,381 | 33,999 |
| New R | 16 | 819,319 | 14,774 |
| New F | 49 | 4,191,917 | 22,999 |
| New R/F total | 65 | 5,011,236 | 37,773 |
| Related old + new total | 141 | 18,579,617 | 71,772 |

New cached input is 2,863,104 and reasoning output 26,720; combined values are
12,494,336 and 44,130. These are included subsets, not additional tokens. All 65
new responses completed with known usage and verified research-full-v1 request/raw
response hashes, including parent/title requests. Raw recordings and full artifacts
remain private; saved stdout/full artifacts are not automatically model context.

Preparation is separate: 132 new scripted requests plus 27 historical preparation
requests. Evaluator model requests are zero; command receipts are separate.
Developing-agent work is excluded from experiment tokens and is not measured by
that recorder. No monetary estimate is made without a bill. Old A native time plus
new chain time is 1978.400 seconds across separate periods, not one continuous run.
[Costs](costs.json), [safe recording receipts](recording-receipts.json).

One ordinary final push updates the existing Draft PR #25 on its original base.
No VibeRacing publication, merge, release, default change, manual Actions or
leaderboard submission is performed. Local checks are distinct from remote CI.
Eight native/fixture containers and both selected-check containers were removed.
After verifying all 1265 new archive entries and modes, task copies/bundles were
removed; about 469 MiB of allocated file storage was released net of the retained
23.6 MB archive and index. The historical archive and shared resources are intact.
Final resource archival/removal and publication verification are recorded in
[cleanup](cleanup.json), [final checks](final-verification.json) and the local
publication receipt. Historical artifacts are linked, never rewritten.
