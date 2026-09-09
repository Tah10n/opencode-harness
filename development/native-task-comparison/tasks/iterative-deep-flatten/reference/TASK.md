# iterative-deep-flatten

Replace recursive flatten implementation with iterative flattenValues(input,depth=Infinity) in src/flatten-core.mjs and keep existing flatten export in src/flatten.mjs delegating to core. Preserve left-to-right depth-first order, explicit undefined and opaque value identities; skip absent own array indices rather than materializing holes. Nested arrays flatten only while remaining depth>0; depth0 copies root present elements and retains nested array identities. Shared noncyclic arrays may occur repeatedly and must be flattened each occurrence. Domain: acyclic ordinary possibly sparse arrays<=100000 total visited slots/depth, standard Array prototype without added numeric properties, stable lengths/indices during call; getters may report access or throw but do not mutate arrays. Other values are opaque (including strings/objects). Read each visited present value once in depth-first order. No input/payload mutation. Valid depth is Infinity or nonnegative safe integer, default only undefined; invalid input/depth TypeError('flatten'). Deep valid input must not overflow JS call stack. Wrapper must not duplicate traversal.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert sparse holes versus explicit undefined, depth0/1/Infinity and shared identities.
- Assert deep stack safety, finite cut-off and depth-first getter order.

Update project documentation to explain:
- Document depth, holes, shared values and nonmutation.
- Explain iterative stack safety and valid input/depth limits.

Run npm test after the last source or test change.
