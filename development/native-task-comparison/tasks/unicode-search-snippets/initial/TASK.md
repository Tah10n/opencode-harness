# unicode-search-snippets

Fix findMatches(text,query) in src/matches.mjs and snippets(text,query,context=0) in src/snippets.mjs so offsets and context lengths count Unicode code points, not UTF-16 code units. Matches are exact case-sensitive, non-overlapping, in ascending order, returned as {start,end} with exclusive end. snippets returns {start,end,excerpt}; start/end remain match offsets and excerpt includes up to context code points on each side, clipped at text boundaries. No case folding or normalization. Domain: well-formed Unicode text/query, no lone surrogates; query must be nonempty (otherwise TypeError); context integer 0..10000. Preserve existing ASCII results.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Astral characters before/inside matches with correct code-point context.
- Non-overlapping matches and empty-query rejection.

Update project documentation to explain:
- Code-point offsets and exclusive end, including excerpt context semantics.
- Exact case-sensitive non-overlapping search with no normalization.

Run npm test after the last source or test change.
