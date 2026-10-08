Make this asynchronous asset cache safe under overlap, invalidation and caller
cancellation. Keep Cache(source), get, has, peek, clear, Client.loadMany and the
memorySource adapter. Source becomes source(key,{signal}); existing sources that
ignore the second argument remain compatible. Values must remain detached copies.

Within one key generation, concurrent get(key,{signal}={}) calls share exactly
one source operation. Each caller receives its own cloned value. Invalid keys
(not a nonempty string) reject TypeError. Failed loads reject every live caller,
are never cached, and a later get can retry. A synchronous source throw behaves
like an async rejection. An already aborted caller rejects AbortError without
starting source work, including when a cached value exists.

Cancelling one subscriber rejects only that subscriber with name:'AbortError'.
Keep the load alive for other subscribers. Cancelling all live subscribers
aborts the source signal and retires that in-flight generation; a subsequent get
starts a fresh one. A loader may ignore abort, so late completion must not cache
its stale result. Remove signal listeners on completion/cancellation.

Add invalidate(key). It evicts a cached value and detaches in-flight work from
the current generation. Existing subscribers can still receive that old result;
new get calls start new work. Old success/error must not overwrite a newer cached
value or remove a newer pending operation. clear() applies this to every key.
has/peek expose only cached completed current values, never pending work.
Client.loadMany keeps caller order and duplicates and forwards options; repeated
keys share the underlying load. Empty lists return []. Preserve missing-asset
errors and input immutability. No timers or network required; run npm test.
