# preference-tombstone-overlay

## Supported contract

Implement shallow-key overlay(defaults,patch) and compose(first,second). Defaults is own JSON record with non-null values. Patch values null are tombstones removing entire key; every other JSON value replaces the entire prior value, including objects/arrays (no deep merge). compose returns a patch equivalent to applying first then second to any defaults; second own keys win, and tombstones must remain in composed patch. Both return deep independent JSON copies, never mutate arguments. Arbitrary own keys incl __proto__/constructor; returned ordinary object and no prototype mutation. JSON domain, no undefined/cycles/special objects, <=1000 keys.

Run `npm test` for the preserved legacy and new project regressions.
