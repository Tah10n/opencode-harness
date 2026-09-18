# Frozen H00 transfer comparison

Compare ordinary OpenCode (P) and the exact installed H00 from source
`1cebebb082163250a0f78269acc164edfc3c6268`, with direct strategy and A=B=0.
PR publication begins at `e336b94b1511d232dac885960db9cda8cf5857d9`;
publication commits are not measured runtime commits.

Prepare and calibrate all 12 new tasks in six projects before scored requests.
Each task has two independent repetitions of P and H00: 48 task-runs, no extra
real smokes, no retries or replacement after outcomes. Balance P/H00 order by
task and reverse it in repetition two. Pair members run consecutively. Complete
repetition one across tasks before repetition two. No past transfer slots are
resumed. All attempts remain counted; unstarted slots remain not_started.

## Environment and equality

| Surface | P | H00 |
| --- | --- | --- |
| OpenCode/model | 1.18.26, openai/gpt-5.6-luna, high | same |
| Source, TASK.md, project instructions, installed project dependencies | identical snapshot per task | same |
| Ordinary native tools | native build agent, including task tool | same native editing/reading/check tools; unchanged direct product disables delegation task tool |
| Harness config/hooks | absent | original installed core instructions, command and plugin |
| Invocation | full task via ordinary run argument | original command bootstrap, original TASK.md capture and full author task |
| Runtime flags | no harness activation | direct, CONTEXT=0, CHECKS=0 |
| Sessions/state | fresh isolated container, repo, home/XDG/temp | same isolation; bootstrap plus product-owned child/worktree |
| Hidden evaluator/reference/other attempts | inaccessible | inaccessible |

The original freeze and full saved installed manifests are verified against
actual bytes; materialization from the detached measured checkout must match,
allowing only installation path relocation in opencode.json. Keep inactive
modules and exact product dependencies. The scripted installed fixture checks
unchanged full task text, flags, native tools, actual execution, terminal stop,
and lack of A/B context. Its outputs establish control flow, not model quality.

## Time and stop contract

Preparation of images/dependencies and independent evaluation are outside the
900,000 ms task budget and accounted separately. All native sessions, tools and
final handoff are inside one common absolute deadline; no intermediate kill.
A new series-only launcher setting replaces both previous absolute 180,000 ms
relay/forwarding timers with remaining task time. Old settings remain the
legacy default and in Git history. Response-header/connection timeout is
30,000 ms. No endpoint, account or authorization change. The actual endpoint is
the already configured OpenCode OAuth Codex responses endpoint.

At deadline forwarding closes, requests are aborted, native workload stops,
and partial patch/events/known usage are retained. Handler drain is bounded to
5 seconds after cancellation; it cannot extend author execution. Unknown
server status/usage remains unknown, never zero. A new slot is admitted only
after local workload termination, forwarding closure, artifact capture and
container removal are verified. Auth/quota refusal, unknown live local work,
isolation violation or unexplained submission stop scheduling. No probe calls.
Ordinary author failures do not stop assigned later slots.

## Rubric and analysis fixed before outcomes

Q is full patch suitability under TASK.md and the preregistered rubric.
D requires Q plus normal native completion, verified termination and usable
normal delivery without observer rescue. An internal incomplete label alone
sets neither Q nor D. Evaluate final claims/handoff usability separately.
Blind patch review uses neutral IDs, hides arm/workflow/final author narrative,
and examines actual test setup/action/assertion chains. Reference is not the
specification. Valid alternatives are admitted; concrete wrong variants must
fail the behavior they violate. No name/helper/exception-subtype requirements.

Compute each task's mean Q and D over its two repetitions, then equally weight
the twelve task means. Also show each repetition, wins/losses/ties, unstable
results, project/type groups, defects, missing coverage, compatibility failures,
timeouts/environment failures, final-claim errors and additional costs.

The 95% primary interval is a paired **project-block percentile bootstrap**:
resample the six projects as whole blocks, retaining both tasks, both arms and
both repetitions together. Enumerate all 6^6 equally likely draws (46,656),
using floor/ceil order-statistic percentile endpoints as in the existing paired
statistics implementation. Use existing macroFamilyPairedRate for paired
aggregation and exactTwoSidedFamilySignFlip for a descriptive project-level
sign-flip check. Neither raw-row bootstrap nor nominal McNemar on repetitions
is confirmatory evidence. With six groups precision is limited. A degenerate
interval does not establish equality or certainty. No added tasks after seeing
results; no minimum baseline success gate or power-based execution veto.

Positive Q with an interval covering zero is preliminary. Q improvement
without D improvement does not meet the product goal. Any conclusion is limited
to these Node/JS/TS tasks, Luna/high, this version and platform. Incomplete series
cannot establish advantage from a convenient completed subset.

## Delivery

Publish exact source/install fingerprints and installation instructions,
original task/rubric files, all slot states, applicable patches and independent
evaluations, concise Q/D/cost/uncertainty summary and limitations. Reapply patches
to ordinary project copies outside administrative harness paths. Keep full
source trees, credentials and raw private traces out of Git. Ordinary push to
the existing branch and draft PR only; no merge, release, base/default change,
force push, manual Actions or disabled automatic checks.
