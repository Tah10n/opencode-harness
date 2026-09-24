# stable-sort-comparator

Extend sorted(values, compare?) to accept an optional custom comparator while preserving default JavaScript lexicographic sort. Return a fresh shallow array with the same length; never mutate the input. The comparator receives only present non-undefined elements, uses result sign for order, and zero, -0 or NaN means tie. Sorting must be stable: ties retain original order and object identities. Present undefined values follow all defined values; holes follow undefined values and remain absent own indices, rather than being filled with undefined. Comparator errors propagate unchanged, with input unchanged. Default/undefined comparator compares String(value) lexicographically by UTF-16 order. Domain: same-realm ordinary arrays length<=10000, possibly sparse/frozen, no inherited indexed properties, index getters or extra properties; elements are strings, finite numbers, booleans, null, undefined, or (only with custom comparator) plain objects. A custom comparator is pure, consistent, synchronous, nonmutating; it may return any Number including infinities/NaN or throw. Do not require any particular comparison count or sorting algorithm. Preserve legacy dense default sorting. No in-place sort, async comparator or deep cloning.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert custom comparator stable object ties and original input/identity preservation.
- Assert explicit undefined versus holes with comparator excluding undefined.

Update project documentation to explain:
- Explain default lexicographic versus custom sign comparator and NaN ties.
- Explain stable order, shallow fresh output, undefined/hole placement and errors.

Run npm test after the last source or test change.
