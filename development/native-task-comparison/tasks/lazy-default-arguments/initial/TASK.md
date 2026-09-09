# lazy-default-arguments

Add an optional fourth argument to synchronous getSetting(settings,key,fallback,options?): {lazy:boolean}, default false. Preserve legacy three-argument behavior: return an existing own property's value, including explicit undefined/null/false/0/empty string; otherwise return fallback unchanged (including a function value). When lazy is true and the own key is absent, call fallback exactly once for that invocation with undefined thisArg (normal JavaScript receiver rules apply) and the original key as its single argument. Return its result directly without awaiting, cloning or caching; errors propagate unchanged. Never invoke lazy fallback for present own keys. Own getters are read once with settings as receiver; their failures propagate and must not activate fallback. Inherited properties count as absent and inherited getters must not run. Do not modify settings or memoize missing results into it. Domain: ordinary same-realm objects including null/custom prototype/frozen objects, stable data/accessor structure, string or symbol key; fallback may be any value in default mode and is a callable function in lazy mode. options is omitted or an ordinary object with optional boolean lazy. No proxies, structure-mutating getters, malformed options or noncallable lazy fallback are in scope. Preserve existing default and present-property API behavior.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Prove missing lazy factory executes once per call while explicit undefined/null do not invoke it.
- Prove ordinary function fallback is returned unchanged and getter/factory errors retain identity.

Update project documentation to explain:
- Explain own-key presence versus value truthiness and inherited properties.
- Document fourth-argument opt-in, factory receiver/key, no caching or awaiting and errors.

Run npm test after the last source or test change.
