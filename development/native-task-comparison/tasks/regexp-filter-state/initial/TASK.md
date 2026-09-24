# regexp-filter-state

Extend filterNames(names, filter) to accept either the existing literal case-sensitive substring string or a RegExp. names is a dense array of strings (possibly frozen), at most10000 entries and each at most10000 UTF-16 code units. Return a fresh array of matching original strings, preserving order and duplicates. Strings are literal substrings, never regexp syntax; empty string matches all. For RegExp independently test each name starting at lastIndex0 while preserving all flags (including g and y, so sticky still requires a match at position0). Never assign to or otherwise mutate caller RegExp, including its lastIndex, and ignore the caller's initial lastIndex for matching. Frozen RegExp must work. Domain includes same-realm genuine RegExp with built-in exec/test/source/flags behavior, possibly frozen, supported native patterns and flags; no subclasses, proxies or overridden members. Reject any other filter with TypeError even for empty names. Do not mutate names or retain cross-call matching state. No glob grammar, async predicates, sorting or pattern escaping changes.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert repeated entries with global/sticky expressions and unchanged caller lastIndex.
- Assert literal string compatibility and a frozen RegExp.

Update project documentation to explain:
- Explain literal strings versus native RegExp including flags and sticky-at-zero semantics.
- Explain fresh output, preserved order/duplicates and no caller state mutation.

Run npm test after the last source or test change.
