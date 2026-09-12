# structured-redaction-walk

Separate graph traversal from key policy: expose copyRedacted(value,shouldRedact,replacement='[REDACTED]') in src/structure.mjs and route existing redact(value,{keys=['password','token'],mask='[REDACTED]'}={}) in src/redact.mjs through it. Domain: finite possibly cyclic/shared graph<=10000 objects/depth100; dense arrays with no extra properties; ordinary/null-prototype objects with enumerable own string data properties only; leaves primitive strings/numbers/booleans/null/undefined. No getters, symbols, exotic prototypes or mutation during call. Clone all unredacted containers preserving their array/object kind and object prototype, own special keys including __proto__, shared references and cycles. Scalar identities unchanged. For each distinct object's own property call shouldRedact(key) once with undefined thisArg; array index keys bypass predicate, nested object keys still checked. Truthy result substitutes replacement string and does not traverse that property's original value. Predicate call order across different objects is unspecified; within each object use Object.keys order. Default redact compares keys case-insensitively via toLowerCase against supplied string array, mask is primitive string; value strings are never searched. Source/frozen objects unmodified, output properties writable/enumerable/configurable. No policy duplicated in traversal, no second graph walk in facade.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert nested arrays, shared aliases/cycles and source nonmutation.
- Assert casefold/custom policy, null/ordinary prototypes, own special keys and no traversal into redacted subtree.

Update project documentation to explain:
- Document key-only case-insensitive policy and custom mask/keys.
- Explain cycles/aliases, cloning domain and redacted-subtree behavior.

Run npm test after the last source or test change.
