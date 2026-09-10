# inventory-kit-availability

Implement kitCapacity(stock,parts) and wire quote(stock,kits) to it. stock is an own-data record of nonnegative integer quantities (missing SKU=0); parts are {sku,qty} with positive integer qty. Repeated SKU requirements within one kit add before capacity is computed. Capacity is min floor(stock/combined qty), empty parts capacity0. quote returns fresh {id,available} for each kit in original order, each computed independently against unchanged stock: quoting never reserves inventory. Domain <=1000 records, plain/frozen objects, SKUs ASCII letters/digits/underscores including __proto__, own fields only, safe summed integers. No database or pricing.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- combined repeated parts through quote
- independent quotes and frozen stock

Update project documentation to explain:
- Document duplicate-part summation, empty/missing stock behavior and independent non-reserving quotes.

Run npm test after the last source or test change.
