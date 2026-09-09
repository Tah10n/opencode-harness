# array-like-slice-consumer

Extend batches(input,size) from arrays to array-like ordinary objects and primitive strings. Validate size first: integer1..10000 or RangeError, without touching input. Null, undefined, numbers, booleans, symbols, BigInts and functions reject with TypeError. Read input.length exactly once; it must be an integer0..10000 (otherwise RangeError, no coercion). Split indexed positions [0,length) into successive fresh arrays of at most size positions; no empty trailing chunk, length0 gives []. For every index in ascending order, use ordinary property existence including inherited indexed properties. Present properties are read exactly once using the input object as receiver and copied shallowly; absent indices remain holes at their corresponding chunk positions. Present undefined is an own undefined entry, not a hole. Strings split into UTF-16 code units, not Unicode code points. Ignore other properties. Do not mutate input/prototype or retain state. Getter errors propagate the identical thrown value and stop further indexed reads. Domain: same-realm arrays, primitive strings and ordinary objects (including null/custom prototype/frozen), stable structure and nonmutating getters; inherited indexed data/getters may exist. No proxies/exotic collections, iterator protocol or length/index mutation during reads. Preserve legacy dense array batching and remainder behavior.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert object array-like batching preserves holes separately from explicit undefined.
- Assert length/getter read counts and string UTF16 behavior.

Update project documentation to explain:
- Explain accepted forms, bounds and validation order.
- Explain shallow chunks, holes/inherited properties, UTF16 strings and getter failures.

Run npm test after the last source or test change.
