# pure-reducer-effects

Extract pure reduceCounter(state,event) into src/counter-core.mjs and make existing createCounter(initialValue,{persist,notify}) in src/controller.mjs delegate transitions to it, executing its returned effects instead of retaining parallel transition logic. state={value,savedValue}. add(amount integer -200..200) clamps value to[-100,100], reset sets value0; changed values emit [{type:'notify',event:{type:'changed',value}}], unchanged add/reset emit[] and preserve the exact existing value, including signed zero. save always sets savedValue=value and emits [{type:'persist',value},{type:'notify',event:{type:'saved',value}}] in that order, even already saved. Reducer returns {state:newState,effects}, does not mutate inputs or call adapters; unknown event/invalid add amount throws TypeError. Controller starts value=savedValue=initialValue, commits reducer state before running effects, then executes in order; first adapter throw propagates unchanged and stops remaining effects without rolling state back. This commit-before-effects behavior is legacy, not a new transaction guarantee. dispatch returns a fresh state snapshot on success; getState returns fresh snapshots. Domain: bounded integer initial/state values[-100,100], ordinary stable state/event records, callable synchronous adapters with no reentrant dispatch; frozen reducer inputs allowed. Preserve all existing controller behavior and error timing. No scheduler, persistence implementation or event bus.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert pure add/reset/save state/effect outputs and input preservation.
- Assert controller effect order, pre-effect state commit and first-error behavior.

Update project documentation to explain:
- Describe reducer contract and controller delegation/effect order.
- Explain clamping, save-even-unchanged, invalid events and legacy no-rollback error semantics.

Run npm test after the last source or test change.
