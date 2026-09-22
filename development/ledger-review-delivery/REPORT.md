# Ledger review delivery: budget fixed; scripted preflight stopped

**The real A → R → F pilot remains not_started.** The explicitly authorized
budget amendment is implemented. The single scripted preflight then stopped
because of a fixture error in the parent-input assertion, before an author tool
or author session began. No real provider request was sent. The stopped fixture
has not been repeated, and its admission record remains closed.

## Authorized amendment and preparation

The user approved the narrow development ceiling change after the original
[budget blocker](budget-blocker-REPORT.md). Only two shared guards changed:
`container-session.mjs` and `container-relay.mjs` now accept up to 3600000 ms.
The caller still assigns A at most 1800 s, R at most 600 s and F only the
remaining shared budget. All local deadlines are capped by the same global
3600-second deadline, started once immediately before the first native stage.
No delay, new session or container resets it. The original 30-minute rejection
receipt and the previous published result are preserved.

Pilot-local wiring now prepares fresh baseline/D0 copies for the three operations,
passes an unchanged independent review as untrusted diagnostics to F, and exports
D0, a delta and a portable full patch on successful completion. The existing
request/recording/cancellation/capture/cleanup lifecycle is reused in a scoped
single-operation adapter; a source comparison verifies the request handler is
byte-identical to the existing scheduler's handler. The shared scheduler itself,
provider route, denial policy, recorder, collector, product controller, prompts,
defaults and experimental status are unchanged. The two ceiling guards are the
only changes outside this development pilot directory.

This wiring is **not validated as a complete installed path**: its only installed
scripted attempt failed in the first parent session. No real-execution acceptance
freeze was committed; the real entry point requires one before any dispatch.
The same prepared baseline, bundles, task and environment are retained. Reviewer
permissions are configured, but the exact offered R inventory remains NOT RUN.

## Actual scripted stop and correction

The local scripted provider incorrectly asserted that every non-title request
contained the original task. The recorded parent request actually contains the
unchanged command `Invoke harness_task exactly once` and offers `harness_task`;
the task belongs in the author's subsequent context, loaded from TASK.md.
The assertion failed before the parent could call that tool. This was an error
in this pilot's fixture, not a model error, missing task file or remote-provider
failure.

The reused lifecycle recorded `unknown_submission` for the throwing scripted
fetch callback and closed admission. That status describes the local scripted
operation; **there was no unknown real upstream submission**. R and F did not
start. The collector independently saved all available patch/task/output evidence
successfully, including an empty baseline diff. The later author-delivery assertion
failed with `No delivered author worktree`, so scheduler `captureSaved` is false.
The empty diff is not D0 or a successful author delivery. The container was removed
only after the successful underlying collection; a subsequent Docker inspection
confirmed its absence. No missing author result was reconstructed.

The fixture assertion has been corrected to distinguish parent/title, author
and reviewer roles. A local replay of the exact two saved request bodies accepts
the valid parent/title requests; negative controls still reject an author lacking
the original task and F lacking the unchanged review. This uses no native process
or provider request. The full installed preflight was **not repeated**.

[Safe failed-preflight receipt](preflight.json) retains stop, capture, accounting
and private-evidence hashes. The original private requests, response, records,
errors and cleanup receipts are preserved. This correction is not permission to
clear the pause, resume the parent session or replace the attempt.

## Results and accounting

| Item | Current result |
| --- | --- |
| Real A / R / F | all not_started |
| D0 / R response / delta / final M | unavailable |
| Actual R inventory | NOT RUN |
| Installed full-chain preflight | FAILED in A parent; R/F not_started |
| Installed false-review negative control | NOT RUN |
| State transfer / delivery patch application | NOT RUN |
| Independent assessment / raw 23 probes / Q/T/D | NOT RUN / unknown |
| Real common deadline | not started |

One installed scripted attempt launched one parent session, zero author sessions
and zero tools. Two local provider callback invocations occurred: one completed
synthetic title response and one parent assertion failure. Synthetic known usage
is 1 input + 1 output token; one scripted request has unknown usage. These numbers
are **not Luna usage or monetary cost**. Elapsed time from the scripted deadline
start to saved stop was 2795 ms, excluding earlier container/bootstrap preparation.
Real provider calls, availability probes, real smokes and paid judges are zero.
The earlier no-provider budget-check container remains separately accounted for.
Developing-agent work is separate from these figures.

Model-free checks pass for the exact two guard changes, host method acceptance
of 3150000/3600000 ms and rejection beyond bounds, A/R/F/shared-deadline arithmetic,
cancellation/unknown/capture-failure transition refusal, recorded-request replay
and source identity of the reused transport. Syntax and final diff review are
local evidence. Actual installed F greater than 30 minutes is NOT RUN; the relay's
new limit is source-verified, not demonstrated by that failed fixture. No claim of
CI, product quality, reviewer utility or whole-chain success is made.

Historical patches, the two completed reviewer runs, AR0 findings, missed defects,
control flaws, scores and costs are unchanged. No runtime campaign or continuation
is scheduled after the stop. Continuing requires explicit authorization for one
corrected scripted preflight; only a successful preflight and committed exact
freeze could admit the original single real A/R/F chain.
