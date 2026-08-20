# Risk-gated visible-contract remediation

Development-only component. After the first completed implementation attempt,
the host starts at most one bounded visible-contract conformance pass only when
a deterministic public signal requires it: the task is high-risk, the fixed
public check failed, or an explicitly allowed visible target path is absent
from the current diff. A passing public check and complete visible target set
skip the extra model invocation for lower-risk work.

The pass receives the visible requirements, current public diff, fixed public
check status, and a privacy-sanitized diagnostic only when the check failed.
Hidden files and output, reference solutions, credentials, and private paths
are unavailable. Any remediation mutation makes prior verification stale; the
host independently repeats the same fixed trusted check. There is no second
conformance or remediation pass.
