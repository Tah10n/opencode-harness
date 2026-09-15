# event-cursor-compaction

Implement createLog(saved={next:1,acked:0,events:[]}) with append(value), ack(id), snapshot(). append assigns increasing integer next IDs and returns ID, copying JSON value. ack accepts integer acked<=id<next, advances cumulative cursor and removes every event ID<=id; same ack is valid. Otherwise RangeError("ack"), state unchanged. snapshot/restore preserve next even after all events removed, so IDs never restart. saved is valid contiguous remaining event state, independent JSON copies required both in/out; values contain JSON data <=1MB, <=1000 events and safe IDs. Initial ack0 allowed. No external storage/background work.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- compaction and restore keep next id
- invalid ack and deep ownership

Update project documentation to explain:
- Explain cumulative acknowledgement, compaction, valid ack interval, monotonic IDs after restore and JSON ownership.

Run npm test after the last source or test change.
