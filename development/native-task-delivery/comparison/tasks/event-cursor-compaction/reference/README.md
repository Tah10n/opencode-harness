# event-cursor-compaction

## Supported contract

Implement createLog(saved={next:1,acked:0,events:[]}) with append(value), ack(id), snapshot(). append assigns increasing integer next IDs and returns ID, copying JSON value. ack accepts integer acked<=id<next, advances cumulative cursor and removes every event ID<=id; same ack is valid. Otherwise RangeError("ack"), state unchanged. snapshot/restore preserve next even after all events removed, so IDs never restart. saved is valid contiguous remaining event state, independent JSON copies required both in/out; values contain JSON data <=1MB, <=1000 events and safe IDs. Initial ack0 allowed. No external storage/background work.

Run `npm test` for the preserved legacy and new project regressions.
