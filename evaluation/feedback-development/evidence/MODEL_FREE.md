# Stage-2 model-free evidence

This is the original preparation evidence from
`f01ac872987d822e718ce4ef61e7ea43326e6f8d`. Its passing triples did not detect the
two false successes subsequently reproduced with additional patches. The
[acceptance repair report](ACCEPTANCE_FIX.md) and its separate receipt cover the
corrected judge; this historical receipt does not verify the updated acceptance.

The accepted feedback fix is present in main at
`f23f2cd6f293e4ec496ad119485d7d4bde1f822f` (PR #31, accepted head
`4659cb2218e10ef93371c2d39a5080f42c389dd9`). The agent made it Ready;
required review initially blocked an ordinary merge. The repository owner later
merged it. No protection bypass, force push or PR #30 operation was performed by
this work. The development branch starts at that main commit.

These are deterministic validation results, not a model comparison. Real
provider calls, availability probes and the sixteen future development runs are
all **NOT RUN**. Model/variant and the next-stage execution environment remain
unset, so the real-run freeze is incomplete. Money is unknown.

## Eight-task controls

All controls below were evaluated from unchanged complete patches in fresh,
offline containers using the pinned Node 24.19.0 execution image. Independent
acceptance and its event reporter were mounted read-only; attempted writes
failed with EROFS. Every baseline passes its separately named preservation
obligations and fails at least one required feature/structure obligation. Every
gold also passes the ordinary public npm test command.

| Task | Baseline R | Gold R | Wrong R | Wrong control detected |
| --- | --- | --- | --- | --- |
| 01 invoice discount | false | true | false | Main discount works, old quantity validation breaks. |
| 02 CLI limit | false | true | false | Limit before filtering loses matching records. |
| 03 wallet cancellation | false | true | false | Main refund works, other reservations disappear. |
| 04 invite redemption | false | true | false | Invalid request no longer consumes; valid token permits replay. |
| 05 query arrays | false | true | false | Main repeated values work, URL fragment disappears. |
| 06 once events | false | true | false | Once works, ordinary subscriptions become one-shot. |
| 07 config merge | false | true | false | Shallow copying preserves nested input aliases and misses recursive rules. |
| 08 option normalizer | false | true | false | Shared delegation exists, text rendering ignores caller options. |

Task 08's original public behavioral tests pass at baseline. The failed baseline
obligation concerns its explicit shared-normalizer requirement, not invented
behavior or an exact reference diff.

The evaluator rejects the empty patch, public-test deletion and npm test no-op.
Extra/reordered public tests leave both gold and wrong-control independent IDs
and scores unchanged. Actual premature process exit and an actual hanging
module are unproven. Zero, partial, missing, duplicate, launch-error and timeout
reports never pass. Additional adapter checks keep aborted/missing author
messages and missing provider completion out of delivery; incomplete internal
status alone is not a correctness verdict. Missing usage and duplicate task
outcomes remain unknown.

## Installed scripted end-to-end

The genuine materialized native bundle and installed OpenCode **1.18.26** execute
actual read, patch, bash, npm test, Git capture and isolated task delivery. The
local Responses transport supplies scripted outputs; it never contacts a real
provider. Both full scenarios use the same 600-second task configuration.

| Arm | R | delivery | Q | Internal status | Corrections | Scripted requests | Task time |
| --- | --- | --- | --- | --- | --- | --- | --- |
| direct (control) | false | true | false | incomplete | 0 | 13 | 4.140 s |
| D (candidate) | true | true | true | checks_passed | 1 | 18 | 4.780 s |

The author initially implements discounts while accidentally removing quantity
validation. Direct finishes without an injected continuation. D receives the
real ordinary public-test failure and restores validation in one native
correction. Only after author execution and cleanup does an independent
container apply and grade the complete delivered patch.

The two normal author deliveries are bound to persisted OpenCode assistant
messages with finish=stop and their captured worktrees. Provider terminal
response/forwarding, patch roundtrip and both native/external termination are
confirmed. The author probe sees no judge, gold or acceptance files and exactly
one public baseline Git commit. Outgoing requests contain no private obligation
IDs, all experimental helpers are absent, and child task recursion is denied.
The shared bundle is byte-identical before and after both arms.

Usage receipts contain synthetic counts (direct 130 input/65 output; D 180
input/90 output). These numbers and fixture timings do not measure model cost,
quality or relative efficiency. Preparation, independent evaluation and both
cleanup intervals are recorded separately in the compact JSON receipt. No
eight-pair effectiveness delta is reported from this one scripted pair.

Separate five-second stop fixtures hang a real native bash child in each arm.
Both reach the common deadline, confirm descendant termination, remove the
relay/container and leave zero active provider handlers. Normal completion is
false; delivery and Q are false. The development budget remains 600 seconds.

## Provenance and reproduction

The [compact public receipt](model-free.json) records all control outcomes,
obligation IDs, runtime/image identities and the stage-2 manifest hash. Full
private recordings, failures and check logs are retained locally outside Git.
The [suite README](../README.md) gives exact reproduction commands and the
unexecuted sixteen-slot protocol.

New code comprises 634 lines in ten adapter/fixture modules, 478 lines in thirty
task source/public-test/acceptance modules and 376 lines of reference/control
patches. Locks, the generated content manifest and prose are separate. The two
shared execution modules change by 10 added and 4 removed lines; the existing
Verify workflow and aggregate check receive this suite without a new workflow.

Reused modules: native-run, container-session/relay, deadline-stop,
stop-workload, input-manifest/manifest, scheduler, provider-recording,
output-files and the existing full-patch capture. Product core, strategy
defaults, correction limit, cancellation policy and official PolyBench scoring
are unchanged.

Both pinned dependency installs pass. The initial local npm run verify passes
eighteen components, then fails at the recording check because the sandbox
denies listen(127.0.0.1). That affected check passes with loopback permission;
the remaining PolyBench and adapter checks pass too, covering all twenty-one
components. The initial aggregate invocation is retained as an environment
failure. npm run verify:installed passes with loopback permission after the same
sandbox restriction was diagnosed. Hosted CI remains a separate exact-head
check reported with the Draft PR.

Two fixture setup failures were diagnosed before the final successful run:
bootstrap permission and the installed model's native patch tool inventory.
An additional diagnostic invocation used --input-type=module, which is inherited
by Node workers and prevented startup. Its unverified container was retained
fail-closed, recovered using the existing recover.mjs without new provider
requests, and removed. The final CLI stop fixtures pass. All diagnostic results
are retained; these are not repeated real model assignments.
