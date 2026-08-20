# Diff-guided verification remediation

Development-only component. When the runner-selected trusted visible check
settles as `failed`, the host starts exactly one fresh bounded edit attempt with
the visible requirements and a bounded snapshot of the current public diff.
The diff contains only public files already changed by the first attempt. The
retry must inspect that diff and relevant public call sites or tests before it
decides that no change is needed.

Hidden files, hidden output, reference solutions, executable selection, argv,
and check IDs remain unavailable to the model. A retry mutation makes previous
verification stale and the runner repeats the same trusted check. The retry is
ineligible for passed, unavailable, incomplete, or unrelated infrastructure
outcomes, and it has no second retry.
