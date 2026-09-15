# iterable-stream-adapter

Extend async collect(source, options?) from arrays to synchronous and asynchronous iterables. options is an ordinary object with optional limit and map; omitted/undefined limit means Infinity, otherwise it must be Infinity or a nonnegative safe integer (invalid limit rejects with RangeError before acquiring source). Omitted/undefined map is identity. map(value,index) may return a value or promise; await each call sequentially and collect its result. Index is zero-based. Use async iterator protocol in preference to sync when both exist. For sync iterables await yielded promises as for-await does. Sources obey JavaScript iterator protocols, async next results contain ordinary non-promise values; failures may be arbitrary thrown/rejected values. A zero limit returns [] without acquiring an iterator. Stop immediately at the limit without an extra next call, close via iterator return when available, and await cleanup before settling. Normal exhaustion does not call return. Preserve source error identity. Mapper failure closes the active iterator and preserves the mapper error, even if cleanup fails. A cleanup failure during successful early stop rejects with its original error. No extra cleanup is required for a failing next call. Do not mutate input arrays. Preserve legacy array collection. No streams, concurrency, cancellation, malformed protocols or source retry are requested.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Exercise both sync and async sources with awaited mapping and index order.
- Assert early-stop cleanup and source or mapper error identity.

Update project documentation to explain:
- Explain source protocols, sequential mapper and limit defaults/zero.
- Document cleanup timing and failure propagation.

Run npm test after the last source or test change.
