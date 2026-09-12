# map-record-catalog

Extend rows(input)/total(input) to accept same-realm Map in addition to original own-data plain records. Map string keys/finite-number prices only; records string own enumerable keys/finite-number prices. Preserve Object.entries order for records and Map iteration order for Map, including numeric-looking strings and __proto__. Invalid Map key or nonfinite/nonnumber price throws TypeError("entry") through either export, even if price might otherwise coerce. rows returns fresh {key,price} records; total sums rows, empty0. Inputs unchanged; frozen records supported; <=1000 entries, safe totals. Other input types/subclasses/proxies out of domain.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- map order and totals reach exports
- invalid entry and independent result

Update project documentation to explain:
- Document record vs Map ordering, finite prices/string keys, independent rows and total behavior.

Run npm test after the last source or test change.
