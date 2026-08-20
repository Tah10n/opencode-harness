# Check-addressed verification remediation

Development-only component. It keeps the single diff-guided retry, and the host
also supplies the exact fixed invocation of the runner-selected public check.
The retry may execute that invocation to obtain public diagnostics. It may not
choose or substitute a different command as terminal evidence.

The host independently reruns the bound trusted check after any retry mutation;
only that host result can authorize terminal success. Hidden checks, hidden
output, reference solutions, check IDs, credentials, and private paths remain
unavailable. The invocation is bounded to the already-public synthetic check
contract and contains no shell string.
