# Host-triggered visible-contract remediation

Development-only component. After a completed first implementation on every
medium/high task, the host starts exactly one bounded conformance pass. It
supplies the visible requirements, current public diff, fixed public check, and
the privacy-sanitized public diagnostic only when that check failed. The pass
must audit each visible requirement against public call sites and tests, make
only concrete corrections, or leave the workspace unchanged.

Small tasks never receive the pass and remain the negative control. Hidden
files and output, reference solutions, credentials, and private paths are not
available. Any remediation mutation makes prior verification stale; the host
independently repeats the fixed trusted check before terminal success. There is
no second conformance or remediation pass.
