# Bounded map only candidate

P50 keeps the universal compact `core-v4-build` primary, no visible-contract
compiler, and the host-owned post-mutation verification gate. It adds exactly
one mechanism: before the first model call for a medium task with more than one
allowed changed path, the host generates and injects the existing bounded
repository map.

The map is derived only from the public workspace and task scope. It remains
path-confined, limited to 20 files and 12,000 UTF-8 bytes, contains evidence
paths rather than file contents, and is unavailable as a model-controlled
tool. Small, high, and single-target medium tasks are negative controls and do
not receive a map. P50 adds no visible-contract manifest, reviewer,
remediation, second model pass, coordinator lifecycle, hidden input, or
family-specific instruction.

Component activation is eligible only on mapped medium multi-target tasks. It
requires the exact `core-v4-build/NONE` route, an activated bounded map, and
actual host verification after every mutation. A failed check still proves
verification activation but independently fails task success. The development
candidate is rejected if fewer than 95% of eligible maps activate, if the
medium target effect is absent, or if any frozen promotion guardrail fails.
