# Two-run sensitivity usage check

This is a deliberately selected development usage check, not a paired evaluation
against plain or H0. Exactly two fresh Luna task-runs are authorized, one per
input, without replacement, intervention, real smokes or a subsequent campaign.

Runtime candidate: `5001f4cd4bccc1befad8e916580bbfd59443344f`. The same installed
bundle is used for container preflight, input admission and both model runs.
OpenCode 1.18.26; Linux arm64 Node 24.19; `openai/gpt-5.6-luna`, high;
direct, context A=0, checks B=0, sensitivity=1; 900 seconds per full task,
including the existing shared 180-second/eight-variant diagnostic limits.
The image and read-only mounts are those of the existing container runner.
The existing scheduler gains only a strictly bounded two-H1-input schedule;
transport, quotas, accounting, unknown-response stop and capture rules stay.

## Inputs fixed before model execution

Both inputs use the existing public denque 2.1.0 `removeWhere` development task:
[complete original requirement](../../native-task-h00-transfer/tasks/denque-remove-where/TASK.md).
Both receive the same ordinary request to verify and finish an unfinished patch,
followed by the complete original task. No extra tool-use instruction, labels,
mutations, expected assertions, preparation observations or evaluator is sent.

- Case 1 (A): [saved patch 27](../../native-task-h00-transfer/continuation-20260914/patches/27-denque-remove-where-r2-P.patch).
  Correct implementation; the suite misses a valid predicate on an empty deque
  and does not fully exercise bounded capacity preservation after filtering.
  Current standard Stryker BooleanLiteral generation changes `_copyArray(false)`
  to `_copyArray(true)`. The weak suite passes although a predicate is then
  called for unoccupied slots of an empty deque. Visiting only initially present
  values is an explicit contract, so a public empty-deque callback/count test is
  a relevant regression. No bespoke mutation is added.
- Case 2 (B): [saved patch 28](../../native-task-h00-transfer/continuation-20260914/patches/28-denque-remove-where-r2-H00.patch).
  Correct implementation with ordered/mixed/none/all, same-error atomicity,
  invalid predicate, wrapped/falsy/duplicate/identity/capacity scenarios, types
  and API docs. Current standard mutants include an unconditional early return
  rejected by its suite and an allowed empty error message that still passes.
  A surviving equivalent or unspecified change creates no extra requirement.

The TTL development example is not selected: previous standard-operator
observations did not expose the named expiry gap. Selection uses supported
observations; it is not random sampling or evidence of a quality advantage.
The preparation observations remain outside the author environment.

Inputs are preserved as base trees plus uncommitted seed patches, not committed
on top of a new baseline. Before every actual run the existing runner applies
the seed after creating the base Git commit, then compares all input bytes/modes
and dependencies to the frozen manifest. Both baseline and patched manifests,
seed hashes, full tasks, bundle manifest and execution files are frozen locally.
No runtime, prompt or input changes are allowed between model runs.

## Acceptance fixed before model execution

For each case separately record actual advertised tools, autonomous tool calls,
baseline/engine/variant execution, exact returned observations, author reasoning,
subsequent test changes, final ordinary checks, final source/terminal patch,
native stop event/process exit and verified termination. Internal observer
status is retained separately from complete patch suitability and handoff.

A needs ordinary API assertions that pass on correct production and reject the
observed empty-input violation, while preserving every original requirement,
independent scenario, types and docs. A fix preceding the observation gets no
causal credit. If the author omits rerunning sensitivity, distinguish that from
a post-stop offline check. Capacity checks still belong to full acceptance.

B must preserve useful assertions and the public contract, remain correct on
ordinary and independent behavioral checks, and avoid changes made only to
satisfy irrelevant/equivalent variants. No mutation-score threshold applies.

Apply both final terminal patches in ordinary copies and compare author bytes
and executable modes. Run npm tests/types and the existing independent behavior
checks only after the authors stop; they and the frozen acceptance logic are
never mounted in model containers. Verify the delivered tests' sensitivity
offline where necessary, using the actual standard observation, and inspect the
failure rather than treating any nonzero exit as assertion evidence.

Report known usage and unknown requests separately; retain provider requests,
input/output/cache/reasoning subsets, native tool calls, diagnostic preparation,
engine/test time, native elapsed time and cleanup/capture costs. Do not invent
monetary cost. Preserve both attempts even when unsuccessful; stop further
admission on quota/auth/unknown execution or unverified termination.

A useful A observation followed by an appropriate delivered regression and a
preserved B supports only: real tool use and a useful local chain were confirmed.
There is no new comparative baseline. Historical H0 4/4 and H1 3/4 remain intact.
