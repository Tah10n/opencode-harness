# optional-result-unwrapping

Extend unwrap(input,fallback,options?) with explicit {tagged:true} protocol mode while preserving legacy default mode: only undefined input returns fallback, all other direct values (including null and objects shaped like protocol packets) return unchanged. Default/missing/undefined tagged is false. In tagged mode input must be an ordinary non-null object with own kind. kind='some' requires own value and returns it unchanged, including undefined. kind='none' returns fallback unchanged. kind='error' requires own error and throws that exact value, even undefined/null/false. Unknown tags, missing required own fields and non-object packets throw TypeError, never silently become none. Inherited fields do not satisfy protocol fields. Extra fields are ignored. Do not mutate packets, evaluate fallback functions, await promises or recursively unwrap values. Domain: options ordinary object with optional boolean tagged; tagged inputs ordinary stable data objects (including null/custom prototype/frozen) plus explicitly rejected malformed inputs, no proxies/getters; direct mode accepts arbitrary values. Preserve existing direct API behavior. This is an explicit protocol opt-in, not shape-based guessing.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert some(undefined) differs from none and explicit error retains thrown identity.
- Assert default-mode packet lookalikes stay direct and malformed tagged packets reject.

Update project documentation to explain:
- Explain opt-in versus legacy direct values and undefined fallback.
- Document some/none/error own fields, extra fields, unchanged values and no eager fallback/awaiting.

Run npm test after the last source or test change.
