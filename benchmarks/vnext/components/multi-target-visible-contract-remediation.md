# Multi-target visible-contract remediation

Development-only component. It retains P15's deterministic public gate and
adds one eligibility signal: a completed medium task with more than one
explicitly allowed visible target receives the single bounded conformance pass.
This targets cross-file contract reconciliation without adding a second model
invocation to single-target lower-risk work.

High-risk tasks, failed public checks, and missing visible targets retain their
P15 behavior. The pass has only visible requirements, current public diff,
fixed public check status, and a sanitized diagnostic on failure. Any mutation
makes verification stale and the host reruns the same fixed trusted check.
