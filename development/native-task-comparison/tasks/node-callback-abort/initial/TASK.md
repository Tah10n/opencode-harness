# node-callback-abort

Extend createReader(readFile), which returns a callback-only read function, with read(path,{signal},callback) while retaining read(path,callback). readFile is the injected error-first (path,callback) API; forward path unchanged. Wrapper returns undefined and forwards exactly two callback arguments (error,data) with undefined thisArg using normal JavaScript receiver rules. Deliver at most once per invocation, even if readFile calls back repeatedly. Native AbortSignal is optional. Pre-abort calls callback synchronously with (signal.reason,undefined), without invoking readFile or adding a listener. Active abort delivers that pair once, removes listener, and ignores late underlying callbacks. Underlying callback first preserves both argument identities and removes listener before user callback; later abort has no effect. This API cannot cancel underlying I/O itself and must not retry it. Support underlying callbacks that are synchronous or asynchronous. Synchronous readFile throws are rethrown unchanged, with listener cleanup and no synthesized callback; user callback throws also propagate unchanged with cleanup. Validate callable callback before I/O (TypeError otherwise). Domain: path strings, ordinary options with optional native signal (transparent listener instrumentation allowed), injected reader and callbacks as described, no options getters/proxies or promise adaptation. Independent invocations share no settlement state. Preserve legacy callback arguments and synchronous timing.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert both signatures and synchronous callback-once behavior with exact data identity.
- Assert active/pre-abort and late callback handling with listener cleanup.

Update project documentation to explain:
- Explain overload signatures, callback-once timing and argument identity.
- Document cancellation without underlying I/O cancellation, listener cleanup and synchronous throws.

Run npm test after the last source or test change.
