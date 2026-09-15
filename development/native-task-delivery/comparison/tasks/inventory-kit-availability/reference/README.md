# inventory-kit-availability

## Supported contract

Implement kitCapacity(stock,parts) and wire quote(stock,kits) to it. stock is an own-data record of nonnegative integer quantities (missing SKU=0); parts are {sku,qty} with positive integer qty. Repeated SKU requirements within one kit add before capacity is computed. Capacity is min floor(stock/combined qty), empty parts capacity0. quote returns fresh {id,available} for each kit in original order, each computed independently against unchanged stock: quoting never reserves inventory. Domain <=1000 records, plain/frozen objects, SKUs ASCII letters/digits/underscores including __proto__, own fields only, safe summed integers. No database or pricing.

Run `npm test` for the preserved legacy and new project regressions.
