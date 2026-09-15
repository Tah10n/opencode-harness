# plugin-hook-composition

Integrate deterministic hook dependencies and asynchronous transformations. orderHooks(hooks) returns hooks in topological order by repeatedly choosing the earliest input hook whose dependencies have already been emitted. This is sequential selection, not wave sorting. after lists hook IDs that must precede the hook, duplicate dependencies are harmless. Reject duplicate IDs or unknown dependency IDs with TypeError and cycles with Error whose message is "cycle". runHooks(hooks,input) validates the entire graph before invoking any hook, then awaits each run(value) in that order. Each result={value,stop?}; always adopt result.value, append that hook ID to trace, and when stop is true return immediately {value,trace,stopped:true}. Otherwise return stopped:false at the end. Propagate a thrown/rejected error unchanged and invoke no later hooks. Domain: finite hook arrays, nonempty string IDs, finite numeric values, valid returned object shape with optional boolean stop; sync/async run functions. Do not mutate hook arrays or dependency arrays. Empty hooks preserve input.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Dependency ordering with asynchronous transformation and a stop that preserves its transformed value.
- Invalid dependency graph rejects before any hook side effect.

Update project documentation to explain:
- Earliest currently eligible input hook selection and validation errors.
- Sequential await, stop after adopting value and unchanged error propagation.

Run npm test after the last source or test change.
