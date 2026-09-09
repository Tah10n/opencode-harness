# canonical-json-digest

Canonical JSON sorts every record’s keys by default UTF-16 order, even integer-looking keys; arrays retain order. Primitive spelling/escaping follows JSON.stringify, including -0 to 0. Hash the compact text as UTF-8 SHA-256. Supported containers are dense index-only arrays and own enumerable data records with Object.prototype or null prototype. Shared acyclic references are allowed. Cycles, accessors, nonenumerable record members, symbol keys, array holes/extras, other prototypes and unsupported/nonfinite primitives throw TypeError. No accessor or toJSON method is invoked; ordinary data named toJSON is supported. Proxies are outside the domain.

Arrays must have exactly Array.prototype, enumerable own data indices and the usual nonenumerable length. Altered/subclass prototypes and hidden indices are rejected. Data indices may be nonwritable/nonconfigurable; frozen arrays are supported.
