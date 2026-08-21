# Specialized visible-contract remediation

Development-only component. After a completed medium or high-risk first
attempt, the host starts one edit-capable contract auditor with a 64-step cap.
The auditor is distinct from the general implementation agent and has native
read, glob, grep, and edit access but no shell, task delegation, quality state,
hidden data, or reference solution access.

The pass receives only visible requirements, current public diff, the fixed
public check status, and a sanitized public diagnostic on failure. It audits
each visible clause against implicated public call sites and changes the
workspace only for a concrete mismatch. Any mutation makes verification stale
and the host reruns the same fixed trusted check. Small tasks receive no pass.
