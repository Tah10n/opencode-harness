# streaming-summary-fold

Refactor summarize(values) to fold a single-pass iterable without materializing or retaining its values. Export createSummary() in the same src/summary.mjs: add(value) returns undefined and updates bounded state, snapshot() returns a fresh {count,sum,min,max,mean}. summarize must delegate updates to this accumulator rather than keep a second aggregation implementation. Use only O(1) retained aggregate state, independent of input length; no array/list of visited values. Domain values are integers[-1000000000,1000000000], count maximum100000; invalid value or add beyond limit throws RangeError before any state change. Sum starts+0 and is exact within these bounds; empty snapshot is {count:0,sum:0,min:null,max:null,mean:null}; otherwise mean=sum/count, min/max follow Math.min/Math.max including signed-zero extrema. Failed add does not poison later valid calls. Original summarize accepts finite iterable under same bounds, consumes it once, stops on the first invalid value/count without requesting later values, preserves input and source error identity. Snapshots cannot alter accumulator state. No async streams, floating-point aggregation, reset API or database storage. Preserve existing aggregate outputs and validation behavior for valid bounded sequences.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert incremental/empty outputs and detached snapshots with a single-pass source.
- Assert value/count rejection leaves state unchanged and exact sum/signed-zero behavior.

Update project documentation to explain:
- Explain accumulator API, delegation and O(1) retained state.
- Document numeric/count bounds, empty output, atomic invalid add and source errors.

Run npm test after the last source or test change.
