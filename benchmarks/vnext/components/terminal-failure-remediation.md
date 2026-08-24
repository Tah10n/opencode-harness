# Terminal failure remediation

This development-only candidate adds one host-owned recovery pass to the
universal compact core. The host may start it only after a completed edit-task
attempt when either the public workspace has no mutation or the runner-selected
trusted public check failed after a mutation.

The two trigger states are mutually exclusive. No-mutation takes precedence;
an unavailable check never activates the failed-check branch. The same compact
primary receives the complete visible requirements and immutable check
identity. A failed-check retry additionally receives the bounded public diff
and sanitized public diagnostic. Hidden checks, reference solutions, and
runner-owned evaluation data are never supplied.

There is exactly one retry. It is successful activation only when it changes
the workspace and the fixed trusted check is rerun after that change and
passes. A no-change, invalid, unavailable, or still-failing retry cannot enable
terminal success. Tasks whose first implementation has a mutation and passes
the fixed check receive no retry and are negative controls.
