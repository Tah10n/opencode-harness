# multi-value-query-state

Implement ordered query multimap state through createQuery(text=""). Parse an optional leading ?, split on &, ignore empty components, and split each component on its first =; a bare key has empty value. Decode + as space and valid UTF-8 percent sequences; preserve all decoded key/value pairs in encounter order, including duplicate keys and empty keys/values. append adds a pair at the end. set(key,value) replaces all occurrences at the position of the first occurrence, retaining other pairs in order; absent key appends. delete removes all occurrences. getAll returns ordered values; entries returns detached [key,value] pairs. serialize returns canonical form without ?: each pair has =, space encodes as +, only ASCII letters/digits/*/-/./_ remain unescaped, everything else is uppercase UTF-8 percent encoding. This canonical form need not preserve original spelling. Domain: well-formed Unicode strings, valid percent escapes encoding valid UTF-8; malformed encoding and unpaired surrogates are outside scope. State must retain duplicates and explicit empty values through serialize/parse. Preserve plain single-key parsing.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Duplicate and explicit empty values survive parse/serialize round trip.
- set replaces at first position and returned entries are detached.

Update project documentation to explain:
- Ordered multimap edit semantics and missing/empty distinction.
- Canonical form encoding, valid UTF-8 domain and no original-spelling guarantee.

Run npm test after the last source or test change.
