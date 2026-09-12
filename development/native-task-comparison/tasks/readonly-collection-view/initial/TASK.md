# readonly-collection-view

Change viewMap(source) from a detached Map copy into a live read-only Map-like view. source must be a same-realm native Map with unmodified built-in methods (non-Map input rejects TypeError). Expose size, get, has, keys, values, entries, Symbol.iterator, forEach and mutator names set/delete/clear. Reads and insertion-order iterators reflect source updates made by its owner; use native Map key equality and iterator liveness. set/delete/clear always throw TypeError without changing source. Freeze the view object. forEach(callback,thisArg) must use native Map iteration semantics, call callback(value,key,view) with the supplied thisArg, return undefined and propagate callback errors unchanged. It must not pass the mutable source Map as third argument. Owner mutations during finite callbacks/iteration are allowed and follow native Map semantics (deleted unvisited entries skipped, appended entries visited). Read-only is shallow: keys/values preserve identity and referenced objects are not frozen or cloned. Do not add an extra source backreference or expose it as callback metadata. Ordinary keys/values remain shared even if the owner stored a reference to source itself. Preserve existing get/has/size/iteration behavior for unchanged sources. Domain: native Maps<=10000 entries, finite iterations, ordinary callback functions; no subclass/proxy/overridden Map methods or detached borrowed method calls. Result need not be instanceof Map or share its prototype. No serialization, recursive immutability or mutation of the owner's Map.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert source changes remain visible and mutators are rejected.
- Assert forEach passes the view with correct receiver and preserves key/value identity.

Update project documentation to explain:
- Explain live Map-like methods, ordering and shallow read-only scope.
- Document forbidden mutators, safe forEach third argument, owner changes and no source exposure.

Run npm test after the last source or test change.
