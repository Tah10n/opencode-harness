# Three targeted test-sensitivity tasks

Runtime is unchanged at 46572619e8a9d567f680667bdf6083a2e82be406: OpenCode
1.18.26, openai/gpt-5.6-luna / high, direct, A=0, B=0, sensitivity enabled,
one native author per attempt, 900s total including the shared 180s diagnostic
budget. Exactly one fresh attempt per input, fixed order A, B, C, no retry,
real smoke, intervention, plain arm, reviewer or integration work.

The only launcher change admits this three-H1 schedule and retains request
capture under the existing transport, stop, pause, accounting and containment
rules. Unknown submission, auth/quota refusal and unverified execution close
further admission. Historical campaigns remain untouched.

## Deliberately selected inputs

A: denque 2.1.0 removeWhere, historical input patch 27 from continuation-20260914.
Correct implementation with existing supplemental tests; ordinary suite misses
predicate calls for unoccupied slots. Standard BooleanLiteral false -> true in
_copyArray is the assigned variant. Original contract restricts visits to
initially present values.

B: quick-lru 7.3.0 getOrInsertComputed, saved implementation/declarations/docs
and type-test hunks from historical input patch 38. Preserve the original public
115-test runtime suite byte for byte; omit only the prior author's added
runtime test.js hunk when constructing this input. This is an intentionally
prepared coverage gap, not a naturally sampled repository bug. The complete
historical patch was also checked during preparation: its first eight variants
were all rejected, so it is unsuitable for this subtask. No engine support,
production implementation or original suite assertions are changed. Standard
ConditionalExpression this.#cache.has(key) -> false is the assigned variant.
The contract requires returning an unexpired hit without invoking the factory.

C: denque removeWhere, historical patch 28. Standard StringLiteral replaces
'predicate must be a function' with an empty message. The contract requires an
Error for invalid predicate and does not specify subtype/message.
Preserve correct delivery without imposing a new message requirement.

All seeds remain uncommitted over the original base. Inputs are public project
copies with installed dependencies, full original contracts and the identical
[TASK.template.md](TASK.template.md), substituting only contract, method and
actual engine diff. The evaluator's chosen input, expected assertions, outcome
labels, mutation refs, reference solutions and other author histories are not
mounted or passed. The model must obtain a fresh workflow ref itself. Assigning
one exact variant is an intentional advantage and is not credited to Luna.

## Acceptance

S for A/B requires an ordinary portable public-API regression in the delivered
terminal patch, contract-justified expected behavior, success on correct code,
assertion-caused failure on the assigned variant, preservation of useful old
tests and no production/dependency changes. Accept any valid distinguishing
scenario. For C, require justified absence of an artificial restriction and
preservation of correct delivery. Honest unresolved is not S.

T requires a normal returned result, one author, normal native exit,
step_finish: stop, applicable terminal patch and verified stop/cleanup. Report
S, T and S AND T separately, never repurpose historical D or rescore Q.

After native termination apply the terminal patch in ordinary fresh copies,
compare author bytes/modes, run project checks, and independently inspect
mutation failure causality. Never repair the author patch. Attribute author
checks and later evaluator checks separately, including tests discovered before
tool observations. Retain unverified areas, usage unknowns and internal status.

No representative benchmark, new plain baseline or paired task-formulation
comparison exists. No lift claim is allowed. End with one decision on whether
testing integration into new complete tasks makes sense; do not implement it.
Raw streams, full project copies, credentials and transient state stay local.
Report preparation/evaluator/developing-agent time and known usage separately;
cache/reasoning are subsets, no invented monetary cost.
