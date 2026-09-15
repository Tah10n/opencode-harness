# iterative-deep-flatten

flatten delegates to iterative flattenValues. Depth-first left-to-right; Infinity default, nonnegative safe integer finite depths, invalid TypeError. Depth0 copies present root values, preserving nested identity. Missing own slots skip, explicit undefined stays; all non-array values opaque and shared noncyclic arrays flatten per occurrence. Getter reads once in depth-first order, no mutation. Stable acyclic sparse ordinary arrays up to100000 slots/depth; standard prototype, no mutating getters. Explicit stack avoids JS recursion overflow. Run npm test.
