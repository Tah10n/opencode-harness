# canonical-json-digest

Implement canonical(value) and digest(value) for a precisely defined JSON-like domain. canonical emits compact JSON with object keys sorted by JavaScript default UTF-16 string sort at every depth, including integer-looking keys; arrays retain order. Primitive escaping/number spelling follow JSON.stringify; -0 becomes 0. digest returns lowercase SHA-256 hex of the UTF-8 canonical string. Supported containers are dense arrays having only index properties and length, and Object.prototype/null-prototype records with own enumerable data properties. Reject unsupported primitives (undefined, functions, symbols, BigInt), nonfinite numbers, symbol keys, accessor properties, nonenumerable record properties, array holes/extra properties, other object prototypes, and cycles with TypeError. Do not call accessors or custom toJSON methods; a data property named toJSON whose value is an ordinary supported value is permitted. Repeated shared references without a cycle are allowed. Proxies are outside the domain. Never mutate input. This is the local contract, not a claim of conformance to another canonicalization standard. Preserve primitive JSON encoding and array ordering.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Nested and integer-looking object keys canonicalize independently of insertion order.
- Cycle and accessor rejection without invoking the accessor.

Update project documentation to explain:
- UTF-16 sorted object keys, array ordering, JSON primitive spelling and UTF-8 SHA-256.
- Exact supported container domain, shared references, rejection rules and no toJSON/accessor execution.

Run npm test after the last source or test change.

Supported arrays have exactly Array.prototype as prototype, enumerable own data indices and the usual nonenumerable length property. Reject altered/subclass array prototypes and nonenumerable indices with TypeError. Writable/configurable flags on data indices do not affect acceptance.
