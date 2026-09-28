# One full ledger follow-up: delivered, task incomplete

**Q=false, T=true, D=false.** Exactly one fresh account-switch-ledger task ran on
runtime `d59a527d120e4cd256ded6d8270154fbbcff5d36`, OpenCode 1.18.26, Luna high,
direct with optional investigation. It ended normally in **1,865.025 seconds**
(31 min 5 s), with a complete portable **40,460-byte M** and confirmed local
stop. All **135 requests** have completed responses and known usage. No retry,
continuation, second task, reviewer or operator message was sent.

The user authorized a narrow capture-wrapper correction after the documented
[preparation blocker](PREPARATION-BLOCKED.md). The correction compares normal Git
application trees, including modes, against the actual author delivery tree.
Its counterexample and negative controls are in [capture-verification.json](capture-verification.json).
The runtime/resolver/watchdog/recorder/prompts remain the fixed candidate bytes.
Only this exact new campaign was admitted to the existing finite 1-GiB profile.
The execution freeze was locally committed as `237dbbd5434286e69053c5d857b3f1b53db056dc`
before the first provider request. [PLAN](PLAN.md) and [manifest](manifest.json).

## Whole-task acceptance

| Evidence | Result |
| --- | --- |
| Full unchanged M applied in a clean public baseline | PASS; all 258 original-project files/modes match captured delivery |
| Readers / config / protocol | 88/88, 103/103, 14/14: **205/205** |
| Frozen behavioral probes | **19/23**, four failures, no skips; score unchanged |
| Isolated original CLI privacy test | **3/3**; nonzero real CLI/state path |
| Affected Claude prototype-security test | **1/1** |
| Repository-wide pnpm verify | Attempted once by evaluator; unavailable offline, not PASS |
| Native delivery and host resolver | Normal terminal response, compact/full artifact binding, three equal Git trees |
| Semantic completeness | **Q=false** |

Two independently grounded defects prevent full acceptance:

- The historical Kimi 0.4.3 migration initially retains 20 tokens and counts a new
  21-token event. Copying that existing session then changes the old day's total
  from **20 to 40**. The failed assertion concerns actual totals, not internal
  ledger layout. The original contract forbids recounting copied accepted events.
- Starting from the implementation's own persisted OpenCode ledger, JSON reload
  followed by `ledger.version=-1` and deletion of source rows returns **empty
  entries with complete status**, without rejection. Corrupt state silently loses
  accepted usage instead of preserving uncertainty/failing closed.

The other three raw probe failures require qualification. Two OpenCode probes
inject `serverBaseline`, a state field not produced or consumed by this candidate
or the original baseline. Their red results remain in 19/23, but are not alone
proof of a real CLI regression or a requirement to adopt an experimental format.
The actual CLI cutover/config regression passes pending-before-acceptance,
confirmed aliases, and old 9 plus new exact-ID event 9 equals 18. That coverage is
not a blanket proof of every cutover scenario.

The remaining probe requires the exact diagnostic name `local_event_identity_conflict`.
First-tuple totals and unrelated usage are correct (15 + 7), with partial status.
Both adapter structured diagnostics and normalization are empty; the separate
`conflicting_usage_records` warning is retained and displayed by the CLI consumer.
The spelling assertion is not counted as an independent semantic defect.

The unchanged supplemental `diagnose.mjs` first failed with an evaluator TypeError:
it assumed the first ledger property was an object. That failure is retained.
A separate observation adapts only its corruption target to the actual numeric
`ledger.version`; it adds no acceptance clause and changes no frozen probe score.
[Assessment](assessment.json) records applicability, integrity and every contract
area separately. No implementation or generated test was repaired by the host.

## What the investigator actually contributed

The author delegated before making any source edit; `before-investigation.patch`
is empty. One child used 23 requests and 467.869 seconds, included in the task
budget. It produced an 8,824-byte test-only patch. Executed child tests exposed
raw Claude IDs in persisted state and an OpenCode 9-versus-18 retention failure.
Those two expectations follow the original privacy/retention task and exercise
real collectors/CLI, rather than checking a prescribed architecture.

The exact 3,755-byte receipt reached author request 34. The author read all nine
patch pages and the complete explanation. It used `cursor="0"` successfully,
made two continuation-token typos, received corrective errors and recovered with
the real tokens. Reassembled pages equal the saved patch hash. Every inspect
reply is present intact in subsequent author requests; no hidden full transcript
was inserted. Only the first 1,024 of 2,410 check-list bytes were inspected, and
there were no output-section calls. Full saved logs are not attributed as read.

There was **no accept or decline call** and no formal disposition/rationale.
Instead, after inspection the author used ordinary `apply_patch` to add a
reworked reader regression and the OpenCode config extension. The final tests
pass, but the full child patch was never integrated through accept/snapshot/Git
preflight. The host did not auto-accept or copy it into the author tree.
This supports successful information delivery and partial manual reuse; it does
not establish a completed accept/decline workflow, causal lift or a whole-task win.
[Child result](child-result.json), [unchanged child patch](child-test.patch),
[explanation](child-explanation.md), [actual calls and delivery receipts](integration.json).

The internal direct status is `incomplete`, with coverage
`changed_scenarios_require_assessment`; native completion and semantic Q are
assessed independently. Here T=true follows the ordinary final author/parent
response, validated author patch and confirmed workload termination, not the
internal status label. Q=false follows the reproduced task failures above.

## Timing, recording and usage

All times below are UTC. The scheduler start is 17:40:37.333, with the original
18:40:37.332 deadline. Last dispatch was 18:11:37.701, with 1,739,633 ms recorded
remaining. Native execution closed normally at 18:11:42.361; independent normal
cleanup began at 18:11:42.362 and verified stop at 18:11:42.417 (**54.328 ms**).
No owned workload remained to kill. Capture ran 18:11:42.520–18:11:43.440;
container removal ran 18:11:43.447–18:11:43.553. These are separate from task
execution. The deadline did not expire: this run does not measure hard-timeout
latency or prove remote computation termination from local abort.
[Timing](timing.json), [delivery](delivery.json), [safe receipts](receipts.json).

Requests: author **109**, child **23**, parent **2**, title **1**. Known usage:
**18,622,056 input tokens**, **67,228 output tokens**; cached **512,512** and reasoning
**40,038** are included subsets. Unknown usage: **0**. No monetary estimate.
The 405 client/upstream/response files were hash-verified, totaling **192,669,371
bytes** under the shared profile; recorded cumulative storage time was **2,817.291
ms**. Native output capture was complete with zero separate external-output files;
tool/check text remains in native artifacts and recording. These are serialized
client requests, exact fetch bodies and bytes read from response.body, not a claim
of original client HTTP bytes or network-packet capture. [Costs](costs.json).

Preparation used only offline checks and no new scripted/provider requests.
Evaluator commands ran after native stop without model access; their logs and
exit codes are retained. Full preparation/evaluator/developing-agent wall time
was not separately instrumented and is not invented from the native duration.
Developing-agent usage is outside the native model totals.

## Preservation and decision

The evidence archive contains **1,306 verified files**, 80,627,307 compressed
bytes, SHA-256 `ef5b2d43045193e5564f21fb1f01dcd80ed09e8b53f6ba7190ba5466f5f02b37`.
It stays ignored alongside its index. The task container was checked absent.
Owned source/bundle/evaluation copies were removed after archive verification,
releasing **373,010,432 net allocated bytes** (about 356 MiB). Shared dependencies,
image, toolchains, worktrees and historical evidence remain. [Cleanup](cleanup.json).

This is a technically delivered but semantically incomplete development outcome,
with useful inspection and partial manual test reuse. It is not a product victory,
control comparison or general investigator benefit estimate. Historical Q/T/D,
patches, request-130 uncertainty and 4,087.196 seconds are unchanged. No subsequent
ledger run or mechanism revision is scheduled. [One result row](result.json) and
[verification](verification.json). Remote CI is separate from local checks.
