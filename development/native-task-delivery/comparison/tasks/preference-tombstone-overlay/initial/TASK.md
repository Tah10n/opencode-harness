# preference-tombstone-overlay

Implement shallow-key overlay(defaults,patch) and compose(first,second). Defaults is own JSON record with non-null values. Patch values null are tombstones removing entire key; every other JSON value replaces the entire prior value, including objects/arrays (no deep merge). compose returns a patch equivalent to applying first then second to any defaults; second own keys win, and tombstones must remain in composed patch. Both return deep independent JSON copies, never mutate arguments. Arbitrary own keys incl __proto__/constructor; returned ordinary object and no prototype mutation. JSON domain, no undefined/cycles/special objects, <=1000 keys.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- composed tombstones equal sequential overlay
- replacement ownership and special keys

Update project documentation to explain:
- Document null tombstones, shallow replacement vs deep copying, composition order and safe own keys.

Run npm test after the last source or test change.
