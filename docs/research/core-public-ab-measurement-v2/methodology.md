# Core versus plain measurement v2 containment delta

Version 2 preserves the frozen task, candidate, model, scoring, retry, and call-budget
contracts from the v1 oracle-validated measurement. Its only intentional policy
change is the host process identity boundary.

The official freeze, acceptance probe, and campaign run as the invoking macOS
user. The manifest binds that user's numeric UID, and later phases reject a
different UID. The runner also rejects the superseded
`OPENCODE_QUALITY_MACOS_*` dedicated-UID environment in every official phase.
No `sudo`, account creation, UID lease, or controller file is part of the v2
reproduction path.

Seatbelt remains mandatory for every model process. It denies shell, web,
delegation, external-directory access, TCP, UDP, DNS, and general Internet
egress. Provider traffic still crosses only the attempt-private Unix-domain
socket to the host-side credential bridge. OAuth material remains in the host
process; the model receives a single-use capability through an owner-private
file that is erased before task execution.

The core arm retains nested descendant teardown by launching its OpenCode and
trusted-check workers in challenged, detached macOS process groups inside the
same Seatbelt sandbox. The nested launcher sends `SIGKILL` to the whole process
group and requires its challenged leader to exit; the host runner separately
requires verified teardown of the enclosing model process before accepting the
core receipt. This replaces only the product wrapper's dedicated-UID controller
dependency; it does not bypass the core post-mutation verification gate.

This change deliberately weakens one claim: v2 does not establish isolation
from unrelated processes running under the same macOS user. The manifest records
`same_user_cross_process_isolation: not_observable`. It continues to require
serial execution of one task pair at a time and all existing descendant,
workspace, hidden-control, credential-custody, and provider-submission checks.

The v1 manifest and evidence remain immutable historical records. A v2 manifest
has a new measurement identity and fingerprint and cannot import v1 outcomes.
The measurement still has exactly 178 scored calls and at most 18 eligible
pre-scoring infrastructure retries, for a hard maximum of 196 provider calls.
Timeouts and scored failures remain non-retryable.
