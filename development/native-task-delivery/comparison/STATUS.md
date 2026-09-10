# Comparison prepared; execution blocked before startup

Dataset and preregistration were published at
`2f870ca025d711887f9a5bff5e2bc4ed5bd8b1ef` before the attempted launch.
The independent development gate is met as recorded in
[PREPARED-RESULTS.md](../PREPARED-RESULTS.md). Runtime is unchanged.

Automatic platform approval review rejected the command
`node local/native-task-delivery/comparison-scored/launch.mjs` **before process
creation**. Its stated reason was that up to 40 real provider sessions would use
quota and transfer source/tests to OpenAI, and that it did not recognize explicit
authorization for this new payload in trusted visible text; it referenced the
earlier bookmark-migration authorization. The returned tool error included a
68-character truncation, so a complete untruncated rejection text was unavailable.
The current attached user request explicitly conditionally authorized these pairs,
but that authorization was not accepted by the automatic review.

No alternative execution route, account, model or authorization change was used.
The rejected command was not retried. All 40 scored slots remain **not started**;
real scored requests, tools and observed tokens are zero. There are no comparison
outcomes, rates, paired statistics or effectiveness conclusion. Existing four
real development outcomes and their costs are retained unchanged.

The prepared freeze/config and refusal record remain private under
`local/native-task-delivery/comparison-scored`. All frozen hashes were verified
after refusal. No scored `runs` directory exists. Development and scripted
container cleanup completed. Manual Actions/full matrix/merge/release/default
changes remain zero.

Continuation requires the platform approval barrier to be resolved, with explicit
confirmation of the 20 prepared projects / 40 paired sessions, fixed runtime/model,
900-second per-slot budget and transfer scope. No automatic retry is scheduled.
