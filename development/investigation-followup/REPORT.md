# Investigation path technical follow-up

The installed scripted path now completes: author draft → separate investigator
cwd → compact receipt → historical `cursor="0"` and canonical first call → real
continuation pages → reasoned test-only acceptance → native production repair →
project checks → completed author result → host resolver → portable full patch.
This is technical/local evidence, not a new ledger acceptance or a model-quality
result. Real provider calls, Luna task-runs and reviewer sessions: **0**.

## Established historically

[HISTORY.md](HISTORY.md) reconstructs only the necessary nine archive records.
The historical cause of the 487-second late cancellation remains **unknown**.
The old request `finishedAt` measures abort handling/finalization, not the initial
cancellation request. Callback-entry, signal-send and monotonic/suspend observations
are missing. The historical 4,087.196 s, unknown request-130 usage, Q/T/D=false,
208/208, 19/23 and privacy 3/3 remain unchanged. No child patch or M was repaired.

## Reproduced and fixed

- First-page inspect returned only `invalid-cursor` for the historical call with
  `cursor="0"` and a superfluous check callID. The receipt/schema now show
  `{"action":"inspect","section":"patch"}`. Exactly string `"0"` is equivalent;
  callID is ignored outside output. Continuation copies the returned opaque token.
  Bad tokens remain errors with a working `firstInspect` example; they do not
  silently select another page. Tokens bind the run, immutable result and section.
- The development runner killed the docker-exec client and awaited its `close`
  before stopping workload. A real descendant holding its output pipe reproduced
  delayed stop. Cancellation now initiates one shared stop immediately and bounds
  process-close/stop waiting. A second fixture blocked the launcher event loop;
  a narrow worker thread now invokes the existing `stopWorkload` independently for
  the same owned container, with no new service, mounts, privileges or network.
- Scheduler cancellation reaches the native runner. The original wall deadline
  crosses bootstrap/child boundaries; monotonic time measures elapsed durations,
  with the original wall deadline also capping admission after resume. Final
  pre-fetch and forwarding gates recheck time. Relay admission closes locally.
  Bootstrap, queued tools, child creation and patch application recheck admission.
- The resolver's one-cwd predicate rejected a correct completed investigator run.
  It now validates the exact permitted child layout, explicit author investigation,
  run/session/message/tool links and author/child snapshot evidence. Delivery still
  comes from the author tree. Compact results safely read the same run's full
  artifact, without inventing stages or repairs. Terminal patch format is unchanged.

## Final evidence

[receipts.json](receipts.json) binds the final source hashes, installed result,
negative resolver controls and independent cancellation/termination timestamps.

The final positive installed run uses OpenCode 1.18.26 and 55 scripted requests.
The author receives the actual schema and intact receipt, obtains the same first
page via `"0"` and omission, receives a bad-cursor error, executes its returned
example, then copies real nextCursor values. Reassembled pages match the saved
patch hash. The child transcript is not silently inserted into author requests.
Before acceptance the child test is absent from the author tree; afterward its
bytes exactly equal the accepted test patch. Its red assertion is produced by
real `npm test` against a draft returning 8 instead of the required 7.

After native repair, project tests pass. Both the author terminal patch and the
collector's full M apply in fresh ordinary Git copies, produce the same tree and
pass `node --test`. Their diff ordering differs for untracked files; byte equality
of differently ordered patch files is not used as the delivery criterion.
Original staged, unstaged and untracked changes and the index hash are preserved.
A separate 18-request installed control inspects and declines an unjustified
expectation of 8; its child test never enters delivery.

Deadline controls use actual HTTP/SSE, native Linux processes and `/proc` workload
confirmation, not only mocked clocks. Cancellation tolerance is fixed at 250 ms;
installed stop grace is 3,000 ms (launcher default 5,000 ms). Independent worker
stamps distinguish initiation from confirmed local stop. Stream, endless command,
investigator and blocked-launcher controls preserve partial bytes and exclude a
later operation. The investigator fixture retains the existing 120-second start
threshold and therefore uses a 130-second task budget. A separate normal-completion
control ends before deadline and allows only cleanup to cross it. Grace grants no
author implementation time. Neither arbitrary-OS zero latency nor remote provider
termination is claimed; known terminal/usage and unknown final streams stay distinct.

Negative checks cover foreign run/section and stale cursors, invalid output callID,
corrupt/missing artifacts, stale author snapshot, cancelled/sealed inspect, expired
bootstrap, wrong expectation/decline, foreign session, unknown child, swapped child
cwd and substituted author final state. Full/compact resolver controls use the same
verified delivery. Existing lifecycle controls cover pending/queued cancellation,
never-settling research callbacks, delayed close and completion before deadline.

## Verification and limits

Investigation and delivery checks, the full native-task controller entry point,
19 lifecycle/process cases, 12 resolver negatives with full/compact delivery,
materialization, seven selected transport controls, 17 syntax checks, scoped
whitespace and static harness verification completed on final source bytes with
exit 0. See [verification.json](verification.json). The controller repeat was
observed through its final exit; no forced process.exit or synthetic PASS was used.
Remote CI remains separate.
A printed success line alone is not a PASS: only a completed process qualifies.
No dependency was installed for full pnpm verify; the unavailable platform matrix
and model-backed quality assessment were not replaced by local passes.

The experiment remains optional/default-off. Original ledger task, generic prompts,
snapshot copier, nudge/TYPE_COMPAT/sensitivity policies, retry policy, recording
profiles/quotas and user defaults are unchanged. Fixture corrections and earlier
non-final local attempts remain recorded; none contributes historical Luna usage.

Reproduction uses the existing image/toolchain/dependency tree:
`node development/investigation-followup/prepare.mjs`, the follow-up mode of
`development/native-task-investigation/preflight.mjs`, and the focused verification
scripts in this directory. `verify-blocked-loop.mjs` deliberately demonstrates the
baseline main-thread limitation without a container; the installed blocked-loop
case verifies its independent container-stop boundary.

## Preservation and cleanup

All 32 container names created by these local controls were checked absent. The
verified 3,878,243-byte local archive retains 2,026 unique evidence files, including
non-final fixtures and their failures. Materialized dependencies, duplicate source
copies and the nine redundant historical JSON extracts were removed; net allocated
space released is 129,953,792 bytes (about 124 MiB). Shared caches, images, toolchain,
worktrees and the original historical archive remain. [Cleanup receipt](cleanup.json).

The initial investigator timeout fixture failed its request-count assertion before
native-output capture; its timing/stop records remain, and no partial-output PASS
is credited to it. Final investigator controls use the existing capture/recovery
contract and preserve actual partial output before container removal.
