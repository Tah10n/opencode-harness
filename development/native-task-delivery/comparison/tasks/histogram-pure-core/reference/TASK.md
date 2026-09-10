# histogram-pure-core

Extract counts(values) into src/counts.mjs, returning fresh {value,count} entries in first-occurrence order, and have summary(values) in src/summary.mjs use it. Values are dense string arrays<=10000, including empty strings, __proto__, constructor, commas. summary sorts entries by descending count then ascending default JS UTF16 value, returns {entries,total}, total original length. counts itself must NOT sort, summary must not mutate counts inputs/entry arrays owned elsewhere, and no shared mutable state. Input arrays may be frozen. Preserve exact old summary contract, no casefolding, object-key enumeration order or locale sort.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- first order differs from summary ranking
- special keys and frozen input

Update project documentation to explain:
- Describe first-occurrence core order vs ranked consumer order, UTF16 ties, arbitrary strings and stateless copies.

Run npm test after the last source or test change.
