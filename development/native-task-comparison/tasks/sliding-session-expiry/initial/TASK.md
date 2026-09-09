# sliding-session-expiry

Implement pure sliding-session state helpers createSession(created,idle,maxAge), expires(state), touch(state,now), serialize(state), restore(text). createSession sets lastSeen=created. expires is min(created+maxAge,lastSeen+idle). touch rejects now<lastSeen with RangeError; if now>=expires return {active:false,state:detached unchanged state}, otherwise {active:true,state:new state with lastSeen=now}. Do not mutate the input. Expiry is derived from the supplied timestamp, not remembered observation history; calls do not consult Date.now or any clock. serialize uses compact JSON fields in order created,lastSeen,idle,maxAge. restore validates exact field names, integer bounds and created<=lastSeen<created+maxAge, returning a new state; invalid JSON throws SyntaxError and invalid state TypeError. It must not rewrite timestamps relative to restoration time. Domain: created integer0..1e12, idle/maxAge integer1..1e9, valid state invariants above, now nonnegative safe integer with earlier-now cases included for rejection. Snapshots have no duplicate JSON member names; malformed shape/values are in rejection scope. Stored states may be expired at a later supplied time, without becoming invalid snapshots. Preserve creation and valid state round trip.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Idle extension cannot exceed absolute deadline and equality is expired.
- Snapshot timestamps round-trip unchanged; rejected/expired touch does not mutate source.

Update project documentation to explain:
- Minimum idle/absolute deadline, pure timestamp-based evaluation and no system clock.
- Snapshot shape/bounds, earlier-time rejection and distinct parse/state errors.

Run npm test after the last source or test change.
