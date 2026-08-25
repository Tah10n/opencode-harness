# Minimal stratum protocol with no-mutation remediation

This development-only candidate retains the minimal public-stratum route and
adds one host-owned terminal repair for an observable incomplete edit state.

- Small tasks start with the installed runtime's built-in `build` primary.
- Medium and high-risk tasks start with the compact `core-v4-build` primary.
- A correctly completed edit attempt that made no workspace mutation receives
  at most one bounded `core-v4-build` retry using only the original visible
  requirements, public repository content, and the fixed public check.
- Any retry mutation must pass fresh host-owned verification before terminal
  success.

Mutated first attempts, read-only tasks, failed model settlements, and public
check failures do not trigger the retry. The candidate has no compiled
contract, repository map, reviewer, coordinator, subagent, hidden signal, or
family-specific rule.
