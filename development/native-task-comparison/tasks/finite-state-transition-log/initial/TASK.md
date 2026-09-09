# finite-state-transition-log

Implement createMachine(states,start,edges) with deterministic transition journaling. Validate distinct states, start membership, known edge endpoints and unique (from,type) pairs; invalid configuration throws TypeError. Snapshot the configuration so later caller changes cannot alter behavior. apply({id,type}) follows the edge from the current state or throws RangeError without recording anything. On success append {id,type,from,to} and return {applied:true,state}. A previously applied ID with the same type is idempotent: return {applied:false,state:current}, regardless of current state, without replaying it. Reusing that ID for a different type throws TypeError. Failed IDs remain available for later valid application. state() returns current state; history() gives detached records. restore(records) replays from the original start, validates every from/to against the frozen graph and chain, rejects duplicate IDs or mismatches with TypeError, and replaces current state/history/ID memory only after all records validate. Empty restore resets to start. Domain: nonempty ASCII names/types/IDs, finite arrays; restore records have exactly id,type,from,to string fields. Graph membership/duplicates and replay-chain violations are in rejection scope. Preserve empty history and a valid first transition.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Duplicate event ID is idempotent after later transitions and changed-type reuse rejects.
- Valid replay rebuilds state; invalid replay preserves previous state and history.

Update project documentation to explain:
- Graph validation, frozen configuration, event-ID behavior and failed-ID reuse.
- Detached history and full-chain atomic replay including duplicate rejection and empty reset.

Run npm test after the last source or test change.
