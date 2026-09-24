# redirect-chain-report

## Supported contract

Implement follow(start,links) and integrate report(starts,links). This is a local name graph, not HTTP/network. links own string keys map to string names; inherited keys ignored, any string name including __proto__ is allowed. follow visits start then targets until missing outgoing edge or repeat; returns {chain,terminal,cycle}. chain contains each first visited name once; terminal is last name for normal stop, repeated target for cycle. report joins chain with " -> "; a cycle adds " -> [cycle:TERMINAL]"; join requested starts with LF in input order, no final LF. Independent walks; inputs unchanged; finite <=1000 keys. Empty strings are valid targets.

Run `npm test` for the preserved legacy and new project regressions.
