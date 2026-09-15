# redirect-chain-report

Implement follow(start,links) and integrate report(starts,links). This is a local name graph, not HTTP/network. links own string keys map to string names; inherited keys ignored, any string name including __proto__ is allowed. follow visits start then targets until missing outgoing edge or repeat; returns {chain,terminal,cycle}. chain contains each first visited name once; terminal is last name for normal stop, repeated target for cycle. report joins chain with " -> "; a cycle adds " -> [cycle:TERMINAL]"; join requested starts with LF in input order, no final LF. Independent walks; inputs unchanged; finite <=1000 keys. Empty strings are valid targets.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- chains and cycles reach report
- own keys and empty target

Update project documentation to explain:
- Explain own-key graph traversal, terminal/chain cycle convention, independent reports and no network.

Run npm test after the last source or test change.
