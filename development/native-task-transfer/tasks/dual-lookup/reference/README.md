# dual-lookup

# Add Promise lookup without breaking callback consumers
createLookup(transport) returns lookup(id, callback?). transport.get(id, cb) is callback-based and may finish synchronously, asynchronously, throw synchronously, or erroneously call back more than once. Preserve its this binding to transport and pass id unchanged.
With a function callback, lookup returns undefined and calls it at most once with error/value. Without a function callback, lookup returns a Promise resolving the value or rejecting the same error. The first completion wins: if transport callbacks and then throws/callbacks again, ignore later completions. A throw before any callback becomes the first error. Do not implement retries.
Keep existing listNames(lookup,ids,callback) behavior. Add listNamesAsync(lookup,ids) in src/names.mjs. It consumes Promise lookup, returns names in input order including duplicates regardless of response timing, returns [] for empty IDs, and propagates a lookup rejection by identity. Sequential or concurrent lookup scheduling is allowed; do not require one internally.
Add project tests for both API styles with first-completion wins, rejection identity, and listNamesAsync order/duplicates plus the old callback consumer. Document dual return styles, first completion, and ordering in README.md.

Use the existing Node built-ins and public exports. Keep old project tests and behavior. Do not add dependencies. Run npm test after the last change.
