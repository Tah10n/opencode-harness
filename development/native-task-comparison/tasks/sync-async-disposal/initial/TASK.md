# sync-async-disposal

Extend asynchronous withResources(resources,body) to support Symbol.asyncDispose and Symbol.dispose alongside legacy dispose(). Before running body, snapshot each non-null/non-undefined resource occurrence and select its first non-nullish method in priority asyncDispose, dispose symbol, legacy dispose. Invoke body once with no arguments and await its result. Then invoke every selected disposal exactly once per occurrence in reverse array order, with resource as receiver and no arguments, awaiting its returned value/thenable before the next cleanup. This helper intentionally awaits even a legacy/sync-named method return. Continue all cleanups after errors. If body failed, rethrow that exact reason after cleanup regardless of cleanup failures, including falsy/undefined reasons. Otherwise reject with first cleanup failure in LIFO execution order; if none, return original body value identity. No mutation of resource array or extra fields on errors/resources by the helper. Nullish resources are ignored; duplicate occurrences are not deduplicated. Domain: arrays<=1000 of nullish values or ordinary resources with stable data methods (selected method callable), normal body functions and thenables; body does not modify array or disposal method fields. No acquisition, dynamic registrations, invalid resource validation or ECMAScript SuppressedError emulation requested. Preserve legacy LIFO dispose behavior.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert mixed legacy/symbol methods, precedence and awaited LIFO order.
- Assert body error wins while all cleanups run, and first cleanup error wins after body success.

Update project documentation to explain:
- Document method selection, occurrence semantics, receiver and serial awaiting.
- Explain body/cleanup error precedence, no error mutation and helper-specific sync-return awaiting.

Run npm test after the last source or test change.
