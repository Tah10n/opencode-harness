# Verified-change development

These are development scenarios, not the frozen evaluation corpus. Materializing
a scenario makes a fresh temporary Git repository and task file; it never starts
a model request:

```sh
node development/verified-change/materialize.mjs queue-cancellation
node development/verified-change/materialize.mjs config-propagation
```

The planned development set is approximately 24 repository scenarios. Only these
initial two have been authored so far. No official evaluation has started.

## First actual model run

The queue-cancellation scenario ran through the installed CLI using
`openai/gpt-5.6-luna`, variant `low`, with a 240-second limit per session. The
initial bundle came from commit `576c43c5addaf3facd0487937e5e2da76175100b`.

- The acceptance author and primary agent both completed.
- Public regression checks passed; D0 was selected with zero repairs.
- **All five proposed acceptance checks were rejected at admission.** Their
  quotations flattened line wrapping in the visible requirement, while the
  host required a byte-identical substring. Thus the run did not test the
  intended new-requirement verification mechanism.
- Generated tests also grouped several check IDs into one file. This identified
  a separate admission risk: rejecting one hypothesis must not execute its
  assertions through another accepted entry referencing the same file.
- Reported session usage: 17 steps, 30 tool events, 120,470 total tokens including
  70,144 cached-read tokens. Provider cost metadata was zero; this is not evidence
  of zero monetary cost. Raw reasoning was not retained by the harness.

This is diagnostic development evidence, not a task-success or lift claim.
Original generated tests, D0, check results and tool diagnostics remain in the
private run artifacts. They were not modified to turn the outcome into a pass.

## Development revision 1: test admission

Normalize prose line wrapping in source citations, while preserving inline
whitespace and punctuation. Quarantine any accepted check sharing a test file
with an unverified hypothesis. Ask the author to keep independent checks in
separate files, use bounded assertion-based failure guards, and avoid requiring
implementation details that the public contract does not mandate.

Both admission regressions passed through the installed CLI with actual OpenCode
and a localhost scripted provider. They do not constitute a second model-backed
development outcome. A real requirement-failure-to-repair cycle is still to be
demonstrated before a larger model campaign.
