# symbol-property-copy

Extend copyValues(source) to copy enumerable own symbol keys as well as enumerable own string keys. Domain: same-realm ordinary non-null objects with Object.prototype, null or an ordinary custom prototype, optionally frozen. Own keys are data or accessor properties; getters may count reads or throw but do not mutate property structure. No proxies, arrays, primitives or exotic objects are in input scope. Return a fresh ordinary Object.prototype object. Read included properties once each in standard Reflect.ownKeys order (integer-index strings ascending, other strings insertion, symbols insertion), using source as getter receiver. Skip inherited and nonenumerable keys without evaluating their getters. Copy the read value shallowly with identity preserved into an own enumerable writable configurable data property, never copy accessor descriptors. In particular own '__proto__' is data, not prototype assignment. Preserve distinct symbols even with identical descriptions. Getter failures propagate the identical thrown value and later getters are not evaluated. Do not mutate source or its prototype. Preserve existing plain enumerable-string shallow copy behavior. No recursive clone, merge, key renaming or getter sandboxing.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert symbol identity and exclusion of inherited/nonenumerable properties.
- Assert getter value copying once and own __proto__ data safety.

Update project documentation to explain:
- Describe shallow enumerable-own string/symbol copy, key order and ordinary result.
- Explain getter invocation/error propagation, data descriptors and input preservation.

Run npm test after the last source or test change.
