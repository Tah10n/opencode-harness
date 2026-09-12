# promise-finalizer-errors

Add finally(onFinally) to wrap(value)'s existing then/catch thenable API with standard Promise.finally semantics. A function finalizer runs once after fulfillment or rejection with no arguments and undefined thisArg under normal JavaScript receiver rules. Await/assimilate its returned value or thenable before settling the result. Successful cleanup preserves the original fulfilled value or rejection reason identity, ignoring cleanup's value. A thrown error or rejected cleanup overrides the original outcome with that exact reason. Non-function finalizers are ignored without inspecting/assimilating them. then,catch,finally must remain chainable with the same available API and ordinary await/Promise.resolve assimilation. Preserve existing handler transforms, catch recovery and independent branches; no mutation of input values. Domain: ordinary direct values, native Promises or well-behaved thenables and ordinary handlers; no Promise subclass/species or adversarial patched intrinsics. Result prototype/representation is unspecified. Do not replace finally with then(callback,callback) semantics.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert original fulfillment/rejection identity and no finalizer arguments.
- Assert awaited cleanup and overriding cleanup errors while chaining remains available.

Update project documentation to explain:
- Explain finally timing, no arguments and preserved original outcome.
- Document awaited thenables, cleanup-error precedence, ignored nonfunctions and chaining.

Run npm test after the last source or test change.
