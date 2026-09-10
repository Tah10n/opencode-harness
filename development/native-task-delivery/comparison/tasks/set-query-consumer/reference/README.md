# set-query-consumer

## Supported contract

Extend select(rows,required)/names(rows,required) so required accepts a same-realm Set of strings as well as the legacy dense string array. Every required tag must be present in row.tags (AND semantics); duplicate array requirements do not require duplicate row tags. Empty required matches all. select returns new array of original row objects in input order; names returns corresponding name strings. No mutation of Set, arrays, row data; frozen arrays/records supported. Domain rows {name:string,tags:dense string array}, <=1000 rows/tags, arbitrary strings incl empty; no predicate callbacks, normalization, OR semantics or Set subclasses.

Run `npm test` for the preserved legacy and new project regressions.
