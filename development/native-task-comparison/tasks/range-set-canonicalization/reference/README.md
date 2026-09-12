# range-set-canonicalization

Ranges use inclusive start/exclusive end. Canonical form merges overlaps and touching endpoints, omitting empty ranges. Subtraction can split one interval; empty removals do nothing. Helpers preserve inputs and state snapshots are detached.
