# Terminal failure replacement

This development-only component extends terminal-failure remediation with one
host-owned clean replacement boundary. It is eligible only after a correctly
completed edit attempt either made no mutation or made an allowed mutation and
failed the runner-selected trusted public check. An unavailable check is not a
failure trigger.

For a no-mutation attempt, the host starts one fresh bounded implementation
pass from the already-clean workspace. For a failed public check, the host
first captures the bounded public diff and sanitized public diagnostic, then
restores every runner-declared allowed target to its exact pre-attempt snapshot.
The restore must reproduce the complete initial public task manifest; otherwise
the replacement is unavailable and terminal success remains denied. The fresh
pass receives only the visible requirements, rejected public diff, fixed check
identity, sanitized public diagnostic, and public repository files or tests.
It receives no hidden check, hidden example, evaluator finding, or reference
solution.

Activation requires the replacement to start, complete, create a new workspace
mutation relative to the restored snapshot, rerun the immutable trusted check
after that mutation, and pass it. A failed-check replacement additionally
requires one attempted and completed host restore. A no-mutation replacement
requires no restore. No-change, invalid, unavailable, still-failing, or
partially restored replacements are not activated. Successful first attempts
receive no replacement call.
