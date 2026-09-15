# unit-conversion-graph

Refactor direct conversion table into reusable compileUnitGraph(edges) in src/unit-graph.mjs and have existing createConverter(edges) in src/convert.mjs delegate. Preserve supported direct/reverse numeric results and add multi-hop conversions. Each edge {from,to,numerator,denominator} means target=value*numerator/denominator, implicitly reversible. Domain: dense<=100 edges,<=50 distinct lowercase ASCII unit names1..30 chars, positive integer numerator/denominator1..1000000; invalid edge TypeError('edge'). Compile snapshots all edges, allows disconnected components/equivalent duplicate edges, but rejects any inconsistent cycle/duplicate/self-edge anywhere with RangeError('inconsistent conversions') at construction. Consistency is exact rational, not epsilon acceptance. Returned synchronous convert(value,from,to) first validates finite numeric value abs<=1000000 (else TypeError('value')), then unknown unit RangeError('unknown unit'), disconnected known units RangeError('disconnected units'); same known unit identity including -0. Valid connected results use standard JS number arithmetic with relative/absolute tolerance1e-12*max(1,abs(expected)); preserve direct behavior within that tolerance. No input mutation; later edge edits irrelevant. No dimension inference beyond components, offsets/affine conversion, or implicit unit creation. Keep graph compilation in core, not duplicate traversal in facade.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert multihop/reverse round-trip, disconnected/unknown distinctions and snapshot/frozen inputs.
- Assert consistent rational duplicates, inconsistent cycles in any component and input/value errors.

Update project documentation to explain:
- Document edge direction/reversal and exact consistency checks.
- Explain converter numeric tolerance, snapshot and unknown/disconnected/error behavior.

Run npm test after the last source or test change.
