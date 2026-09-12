# radix-tree-edit-state

Implement an immutable prefix dictionary through createDictionary(entries=[]). Entries are {key,value}; duplicate initial keys keep the last value. set(key,value) and delete(key) return a new dictionary while all older dictionaries remain unchanged; deleting an absent key leaves equivalent contents. No requirement on internal tree shape, structural sharing, or dictionary object identity. get(key) returns a detached value or undefined if absent. find(prefix,limit?) returns {key,value} records for matching whole-key prefixes, sorted by ASCII key, limited after sorting; omitted limit means all, zero means none. entries() returns all sorted records. Snapshot initial/set input values and deep-copy returned values, so mutations through caller objects or results cannot affect any version. Domain: nonempty ASCII keys, ASCII prefix including empty, finite dictionaries, limit integer 0..1000 when supplied; ordinary acyclic JSON values with dense arrays, no getters/custom methods/undefined/symbols/nonfinite numbers or -0. Preserve empty dictionary and exact lookup.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Old versions survive set/delete while prefix results sort before limiting.
- Nested input and output mutations cannot change stored versions.

Update project documentation to explain:
- Persistent updates, duplicate initialization, missing deletion and internal structure freedom.
- ASCII prefix/limit semantics and detached value ownership.

Run npm test after the last source or test change.
