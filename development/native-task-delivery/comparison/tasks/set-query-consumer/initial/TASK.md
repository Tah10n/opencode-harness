# set-query-consumer

Extend select(rows,required)/names(rows,required) so required accepts a same-realm Set of strings as well as the legacy dense string array. Every required tag must be present in row.tags (AND semantics); duplicate array requirements do not require duplicate row tags. Empty required matches all. select returns new array of original row objects in input order; names returns corresponding name strings. No mutation of Set, arrays, row data; frozen arrays/records supported. Domain rows {name:string,tags:dense string array}, <=1000 rows/tags, arbitrary strings incl empty; no predicate callbacks, normalization, OR semantics or Set subclasses.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- set AND selection through names
- identity and input preservation

Update project documentation to explain:
- Document array/Set AND requirements, empty matching, duplicate array semantics and original-row identity.

Run npm test after the last source or test change.
