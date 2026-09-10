# map-record-catalog

## Supported contract

Extend rows(input)/total(input) to accept same-realm Map in addition to original own-data plain records. Map string keys/finite-number prices only; records string own enumerable keys/finite-number prices. Preserve Object.entries order for records and Map iteration order for Map, including numeric-looking strings and __proto__. Invalid Map key or nonfinite/nonnumber price throws TypeError("entry") through either export, even if price might otherwise coerce. rows returns fresh {key,price} records; total sums rows, empty0. Inputs unchanged; frozen records supported; <=1000 entries, safe totals. Other input types/subclasses/proxies out of domain.

Run `npm test` for the preserved legacy and new project regressions.
