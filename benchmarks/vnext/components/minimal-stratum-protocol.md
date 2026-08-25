# Minimal stratum protocol candidate

This development-only component tests one host-owned routing boundary without
adding another model pass or another context transform.

- Small tasks use the installed runtime's built-in `build` primary with the
  original visible task requirements.
- Medium and high-risk tasks use the compact `core-v4-build` primary with the
  original visible task requirements.
- The host selects the route from the public task stratum before model
  execution.
- Host-owned post-mutation verification remains mandatory on every mutated
  task.

The candidate has no visible-contract compiler, repository-map injection,
reviewer, remediation pass, subagent, hidden signal, or family-specific rule.
Activation requires the exact stratum route, no compiled contract, no context
injection, no review or remediation lifecycle, and current host verification
after every mutation.
