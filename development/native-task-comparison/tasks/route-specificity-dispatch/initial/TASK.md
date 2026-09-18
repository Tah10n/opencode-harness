# route-specificity-dispatch

Implement match(pattern,path) and dispatch(routes,path) in their existing modules. Paths are split into segments before percent decoding, so encoded slash stays inside a captured segment. Pattern literal segments match decoded segments exactly; :name captures one segment; final *name captures zero or more decoded segments joined with /. match returns {params,rank} or null, where literal/parameter/wildcard rank entries are 2/1/0. dispatch must choose highest lexicographic rank, treating an exact route end as rank 3 for comparison, before invoking exactly one winning synchronous handle(params); ties retain registration order, no match returns null. Domain: paths start /, no query/fragment, empty interior segments or trailing slash except root; valid percent escapes; patterns have ASCII literals and unique identifier capture names; wildcard only at end. Preserve root and literal dispatch.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Literal route outranks an earlier parameter/wildcard and only one handler runs.
- Percent-decoded capture and zero-segment wildcard.

Update project documentation to explain:
- Segment decoding occurs after splitting and rank precedence includes exact end.
- Registration-order tie handling and no-match null result.

Run npm test after the last source or test change.

Capture names use ASCII [A-Za-z_][A-Za-z0-9_]*, including names such as __proto__ and constructor. Every capture must be an own enumerable data property; no particular result-object prototype is required.
