# abortable-delay-consumer

Extend delay(ms,options?) with optional AbortSignal while preserving promise-based delay without a signal. options may provide setTimeout(fn,ms) and clearTimeout(handle), defaulting individually to global timers; pass ms unchanged to the scheduler. ms must be integer0..1000000, otherwise return a rejected Promise with RangeError before timers/listeners. Already-aborted signal rejects with exactly signal.reason without scheduling or adding a listener. While pending, abort rejects with the same reason, clears the scheduled timer exactly once (handle0 is valid), and removes its abort listener. Normal timer completion resolves undefined and removes its abort listener without clearing an already-completed timer. Later abort or stale timer callback cannot change settlement or cause extra cleanup. No synchronous resolution before scheduler callback. Independent calls must not share state. Domain: native AbortSignal (possibly with transparent listener instrumentation), ordinary options, nonthrowing injected timers that return opaque handles and never invoke callback synchronously, matching clear function; no scheduler reentrancy or malformed signal/options. Do not change authorization/environment timers globally, poll signal, retry cancellation or introduce another cancellation abstraction.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert active and pre-abort reason identity with timer/listener cleanup.
- Assert successful completion cleans listener and legacy no-signal promise behavior.

Update project documentation to explain:
- Document duration validation, optional signal and injected timer defaults.
- Explain cancellation reason identity, zero handles, cleanup, independent calls and no retries.

Run npm test after the last source or test change.
