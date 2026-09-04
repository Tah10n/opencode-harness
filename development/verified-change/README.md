# Verified-change development

These are development scenarios, not the frozen evaluation corpus. Materializing
a scenario makes a fresh temporary Git repository and task file; it never starts
a model request:

```sh
node development/verified-change/materialize.mjs queue-cancellation
node development/verified-change/materialize.mjs config-propagation
node development/verified-change/materialize.mjs transactional-store
```

The planned development set is approximately 24 repository scenarios. Only these
initial three have been authored so far. No official evaluation has started.

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

## Second actual model run

The config-propagation scenario used the installed bundle from `c19e467`, with
the same model, variant and per-session timeout. All six generated checks were
admitted. D0 passed public regression checks and failed three acceptance checks.
Two repair passes changed two of those outcomes to passing, but the third still
failed; the command stopped at `repair_limit`, retained D0, and applied no patch.

Manual diagnosis identified two different problems. The normalization checks
chose disputed interpretations of the relationship between legacy/new fields;
those changed outcomes are not evidence of two corrected product defects. The
validation check did expose a clear requirement violation: fractional `delayMs`
was accepted even though the request explicitly prohibited it. However, the
failure only said that a TypeError was missing at a loop's assertion line. The
repair agent could not read the acceptance file to identify the failing input,
and both repairs missed that error. Original patches, tests and diagnostics remain
unchanged in private artifacts.

## Development revision 2: actionable, qualified diagnostics

Before implementation, the same independent author audits its assertions for
alternative valid interpretations and marks uncertain checks ambiguous. This
does not make generated tests infallible and does not expose D0 to the author.
After D0, accepted test files and their reporter become read-only inputs to the
repair session. Diagnostics include cwd, so the exact failing check can be read
and rerun. Unverified test files are not exposed through this repair mount.

Each model attempt and completed host check is recorded in a small private
per-run journal, preserving assertions even if a later model request times out.
Doctor now runs the configured project's checks on an isolated clone and reports
missing libraries with their actual diagnostics; model access remains explicitly
unverified by this model-free command. Installed regression tests cover these
paths. The following replay tests this revision with the real model.

## Third actual model run: first real successful repair cycle

A fresh config-propagation repository ran with the installed bundle from
`0fe2e151218672c9abdf764daed15a6b95574ff1`, retaining the previous run unchanged.
The same Luna/low binding and per-session limits were used. D0 passed public
regressions but failed normalization and fractional-delay validation. One repair
produced D1, which passed public checks and all six admitted acceptance checks;
the selected patch was applied to the disposable development repository.

Inspection of D0/D1 confirms a real requirement correction: the original
nonnegative-number check for delayMs became the integer check required by the
task. This demonstrates a model-backed requirement failure, reproducible test,
repair and checked result through the installed product path.

It does **not** establish product lift or complete semantic correctness. The
repair also changed the returned legacy retries field to match the author's
disputed interpretation. The author's self-audit had not marked that assertion
ambiguous. This unresolved uncertainty-handling limitation must remain visible;
do not count both changed assertions as two validated fixes or rewrite these
development outcomes as benchmark evidence.

Status: three model-backed runs across two distinct development tasks, two
substantive implementation revisions used, one remaining under the requested
limit. The approximately 24-case development set, fresh 60-task frozen A/B/C
evaluation, statistical analysis, final independent review and PR remain pending.
