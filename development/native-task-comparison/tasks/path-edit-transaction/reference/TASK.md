# path-edit-transaction

Implement edit(value,operations) as an atomic pure JSON edit transaction. Apply operations sequentially to a detached working copy; later paths see earlier edits. set on an object adds/replaces an own field; on an array it replaces an existing numeric index only. insert requires an array parent and numeric index0..length inclusive, shifting later elements. remove requires an existing own object field or existing array index, and array removal shifts. Missing intermediate parents are never created; inherited properties are not traversable. Empty path permits set of the root only. Invalid operation name throws TypeError; invalid paths, parent types, indices, absent removal or invalid root operation throw RangeError. On any error no partial result is returned and input value/operations stay unchanged. Deep-copy inserted values and the returned tree. Own object keys such as __proto__/constructor are ordinary data keys and must not change prototypes; no blanket name rejection. Domain: ordinary acyclic JSON records/dense arrays without undefined/getters/custom methods/symbols/nonfinite numbers or -0, up to100 operations and depth100; object path segments strings, array segments numbers (numeric strings are invalid array indices). Operation shape is {op,path,value} for set/insert or {op,path} for remove. Invalid names/paths/indices included for rejection. Preserve simple own-field set.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Sequential array insert/remove and nested set use updated positions.
- A later invalid edit leaves source and operations unchanged.

Update project documentation to explain:
- Set/insert/remove path rules, own-only traversal and root replacement.
- Atomic failure, deep-copy ownership and special object keys as data.

Run npm test after the last source or test change.
