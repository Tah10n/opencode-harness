# header-multimap-api

Extend headers(input={}) to snapshot either the legacy ordinary object of own enumerable header fields (value string or array of strings) or a finite iterable of exactly-two-element [name,value] arrays with string values. Preserve every repeated value and global arrival order; do not comma-join, including Set-Cookie. Header names are nonempty ASCII HTTP-token characters: letters,digits and !#$%&'*+-.^_`|~. Normalize names to lowercase; invalid names throw TypeError, including object keys with empty value arrays. Values must be strings without CR,LF,NUL; trim only leading/trailing ASCII space/tab, preserve interior and all other text. Invalid values/tuple shapes throw TypeError. Return get(name) for first value or undefined, getAll(name) for a fresh list or [], entries() and Symbol.iterator yielding fresh [normalizedName,value] arrays in input order. Lookups validate and normalize names too. Object arrays expand in order; empty arrays contribute no entries. Ignore inherited object fields. Input/returned-array mutation after construction must not affect stored snapshot. Domain: ordinary stable own-data objects (possibly frozen/null-prototype), finite iterables<=1000 pairs with no mutation during traversal, strings<=10000 units; no malformed top-level input, proxies/getters, async iteration, mutable bag API or full HTTP wire parser. Preserve legacy simple object lookup.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert repeated case-insensitive iterable headers with preserved order, including Set-Cookie.
- Assert legacy object arrays and snapshot/returned-array independence.

Update project documentation to explain:
- Document input forms, token validation, lowercase names and space/tab trimming.
- Explain first/all values, duplicate order, no joining and immutable snapshot reads.

Run npm test after the last source or test change.
