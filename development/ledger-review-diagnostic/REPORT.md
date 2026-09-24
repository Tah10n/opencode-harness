# Independent ledger review: concrete detection, limited control

**Both reviewers completed and independently found reproducible defects.** AR0
has three confirmed findings, but the reviewer missed all four concrete violations
in the pre-frozen assessment table. The calibrated control also has real defects,
including an explicit version-scope violation. This is a positive detection signal,
not evidence of specificity on correct implementations, reliability, improved
complete delivery, or a reason to enable mandatory review after direct.

There is also a protocol limitation: unchanged native OpenCode offered `skill`
alongside read/glob/grep in both real sessions and the corrected fixture. It was
never called. The exact three-tool inventory was not achieved; Bash, writes,
delegation and todo tools were absent, and actual calls were only read/grep.
The preflight checked the named forbidden tools but did not reject this additional
native tool. No runtime permission change or replacement session followed.

| Object | Normal completion | Confirmed concrete findings | Unsupported / incorrect | Unverified findings / hypotheses | Pre-known violations missed | Time; requests; input / output tokens |
| --- | --- | --- | --- | --- | --- | --- |
| candidate-A: unchanged AR0 | yes | 3 | 0 / 0 | 0 / 1 question | 4 / 4 | 373.444 s; 12; 485,580 / 10,391 |
| candidate-B: reference + saved compatibility patch | yes | 4: 3 task-contract findings, 1 additional source-traced implementation defect | 0 / 0 | 0 / 0 | no pre-frozen defect list | 390.595 s; 15; 2,353,271 / 12,179 |

Source-traced confirmation does not imply execution of every integration path:
the control reconnect finding was checked through code, with PostgreSQL/server
execution NOT RUN. All proposed repairs remain unvalidated suggestions.
[Full claim-by-claim dispositions](findings.json) include the exact statements,
contracts, entry points, inputs, observations, evidence and limits.

## Findings and meaningful limits

AR0's unchanged [review response](candidate-A-response.md) identified:

- **Valid usage lost beside unsupported input.** Public Antigravity and OpenCode
  SQLite collection each return no entries instead of 15 tokens when one valid
  event accompanies an unsupported candidate. Both results are partial.
- **An accepted event counted twice through an unterminated moved file.** After
  accepting 15 tokens and serializing state, moving the same event into a file
  without a final newline produces 30 for both Antigravity and Claude. The tested
  move trigger is specific; not every rewrite takes the provisional branch.
- **Eviction loses accepted usage and permits identity reacceptance.** At the
  implementation's native 65,536-event cap, accepting 7 more tokens returns
  65,542 instead of 65,543; the evicted identity is accepted again on replay.
  The probe seeds the actual serialized tuple shape and invokes the public
  collector. It does not parse 65,536 files or show simultaneous doubled totals.

All four pre-frozen AR0 defects remain **missed**: confirmed-cutover accepted-total
loss, missing-cutover fail-open behavior, corrupt-state fail-open behavior, and
conflict diagnostics dropped by the actual normalizer. The reviewer's question
about `cutoverPending` is not a concrete finding for these cases. Its eviction
finding relates to an older source-review concern, which was deliberately not
promoted to a known confirmed defect before review.

The control's unchanged [review response](candidate-B-response.md) identified:

- **Cutover guard accepts malformed/incomplete evidence.** With valid private
  state-directory metadata, malformed config JSON, an invalid source ID or an
  invalid sequence each allow real `source add` to exit 0 and create local source
  state without confirmed cutover. This confirms guard bypass; actual subsequent
  usage loss was not executed. The reviewer's HIGH severity is not independently
  established by this local check.
- **Saved logical Codex source reconnect fails.** Source tracing follows revoke
  marking the logical row disconnected, pairing excluding logical rows, reconnect
  explicitly re-registering them, and registration returning 409 unless the
  existing row is active. This is a real additional defect in the control's
  supplied implementation, outside the original task's Codex/server scope. It is
  not permission to expand the requested task or implement auto-reactivation.
- **Legacy counter conflict silently reports complete.** Actual baseline-generated
  Antigravity state accepts 15; the migrated identity later changes to 150 alongside
  a new event of 7. The control correctly retains total 22, but returns complete
  with no conflict diagnostic. Old state lacks exact per-ID tuples, so the proposed
  retroactive tuple reconstruction is not established; any repair needs separate
  design rather than assuming unavailable information can be recovered.
- **Version changes violate the explicit task.** Both connector package/version
  files change 0.4.4 to 0.5.0. These are real bytes in the full historical control,
  retained as required rather than removed to manufacture a clean comparison.

No confirmed false mandatory finding was established. However, this defective
control cannot measure false positives on a correct implementation. No proposed
patch was applied, no tests were weakened, and no evaluator feedback reached
reviewer sessions. The original task's test commands are NOT RUN by the reviewers;
this does not erase previously recorded author-suite results.

## Execution and custody

[PLAN](PLAN.md), [provenance](provenance.json) and [freeze manifest](manifest.json)
bind the exact 1,468-byte original task, complete implementation patches/modes,
order, bundle, model and 600-second budgets. Freeze commit `9157b29b` preceded
all real requests. The two model sessions used OpenCode 1.18.26, Luna/high and the
existing OAuth route in the pinned network-none Linux image with unchanged UID,
mount, CPU, memory and process restrictions. No author or repair stage ran.

The corrected preflight succeeded after the user's explicit fix request. Only
`.gitignore` was added to a separate bundle before its read-only mount. The first
failed preflight, its closed admission and recovery remain preserved in
[the initial preparation result](blocked-preparation-result.json) and Git history.
No old session was resumed. The known failure was OpenCode initialization of
`/template/.gitignore`, not unavailable auth or a model refusal.

Each real input has a fresh baseline/candidate history, no origin or author
conversation, and the entire patch. Initial actual provider requests contain
exactly the saved task/base/diff snapshots. Before/after snapshots and externally
captured patches match; validation copies also match the prepared sources. The
mapping and previous assessments remained outside reviewer mounts. The preparing
agent knew the mapping, and the control's larger diff is a visible indirect clue;
this was not a fully blind research procedure.

All 27 requests have complete client-object, upstream-body and raw-response
archives under `research-full-v1`, plus native records and safe linked-output
capture. Neither attempt hit its deadline, lost usage, or closed admission.
Both workloads stopped and their containers were removed. Private projects,
assessment and raw streams remain outside Git; published responses contain only
reviewed public material and are verified unchanged.

## Resources and verification

| Scope | Requests | Input tokens | Output tokens | Cached input subset | Reasoning output subset | Native read/grep calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| candidate-A, including title | 12 | 485,580 | 10,391 | 64,512 | 8,528 | 22 |
| candidate-B, including title | 15 | 2,353,271 | 12,179 | 765,952 | 10,338 | 25 |
| Total | 27 | 2,838,851 | 22,570 | 830,464 | 18,866 | 47 |

Cached/reasoning counts are included subsets, not extra tokens. Unknown usage
requests: zero. Total native execution: 764.039 seconds. Auxiliary titles account
for one request per slot; [safe result receipts](review-results.json) retain role
breakdowns. No monetary estimate is made, and this developing agent is not added
to reviewer usage.

Preparation: two installed attempts, the first failing before a native session or
request; the corrected attempt used one scripted native session and three local
requests. The earlier scheduler regression check has 16 mock scenarios and 13
synthetic fetch dispatches, separate from installed/model usage. Evaluator work
used three network-none disposable containers: AR0 observations; control migration
plus an initially invalid CLI fixture; corrected CLI-only observations. The first
CLI fixture lacked a state-directory marker and did not reach the mutation; its
output remains published separately. No historical cohort or full F/E reran.

`node development/ledger-review-diagnostic/verify-final.mjs` verifies frozen files,
source/copy integrity, actual full initial inputs, immutable responses, raw hashes,
usage arithmetic and stop/capture facts. Addressed observations, syntax, scoped
whitespace and one final diff review are complete. The unrestricted whitespace
check flags eight original Markdown hard-break lines in the immutable reviewer
responses; those exact bytes are intentionally retained. The scoped check excludes
only the two response Markdown artifacts and passes. Full controller/retention
matrices and `pnpm verify` were not rerun for unchanged runtime. Live server/
PostgreSQL checks for reconnect and production behavior are NOT RUN. Local checks
are not CI evidence.

The prior AR0/AR1 scores, plain run, historical pauses and lost historical SSE are
unchanged. No Q/T/D author-delivery score is assigned to these reviews. The result
supports considering the existing diagnostic capability separately; a complete
author → review → repair → delivered-result experiment remains outside this task.
No next campaign, default change, merge, release or automatic review is scheduled.
