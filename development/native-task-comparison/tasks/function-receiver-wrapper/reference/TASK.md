# function-receiver-wrapper

Extend timed(fn,{now,record}) so the returned function preserves the caller's dynamic this, every argument (including explicit undefined and zero arguments), exact returned value identity and exact thrown value identity. Measure only synchronous invocation: call injected now once immediately before fn and once immediately after its return/throw, then call record exactly once with {duration:end-start,outcome:'return'|'throw'} before settling the wrapper call. Returning a Promise is an ordinary return: preserve its identity and do not await, attach settlement handlers or emit a later event. Plain strict-mode calls forward undefined this. Nested or repeated wrapped calls have independent timing state. Do not mutate fn or receiver. Domain: ordinary callable functions including arrow functions, no constructor use; now returns finite nondecreasing numbers and does not throw; record is synchronous and does not throw. Argument/return/thrown values may be arbitrary, including promises and undefined. Metadata (name,length,prototype) of the new wrapper is not required to match fn. Preserve legacy plain successful-call timing.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert method receiver, arguments and exact return identity.
- Assert thrown identity and one timing event, plus Promise identity without waiting.

Update project documentation to explain:
- Explain dynamic receiver/arguments and timing event fields.
- State synchronous-only Promise handling, injection assumptions and excluded constructor/metadata behavior.

Run npm test after the last source or test change.
