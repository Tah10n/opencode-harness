# normalization-once-pipeline

Refactor the name pipeline so processName(raw,{normalize}?) normalizes exactly once and shares the resulting string across validation and display. Missing/undefined normalize defaults to existing normalizeName; injected function gets raw once with one argument/undefined thisArg. It returns a string under the same normalized-core rules; propagate its throws unchanged. Extract validateNormalized(name) and displayNormalized(name) into src/name-core.mjs and make both pipeline and legacy validateName(raw)/displayName(raw) use them, without duplicated validation/display logic. Legacy raw wrappers still independently call default normalization once. normalizeName retains raw.trim() then ASCII A-Z lowercasing only, leaving other characters unchanged. Validation priority: empty string->'empty'; length>20 UTF16->'too_long'; otherwise require [a-z][a-z0-9_-]* or 'invalid'; valid->null. displayNormalized simply prefixes '@', even for invalid strings. processName returns {ok:false,error} or {ok:true,name,label}; failed validation still has exactly one normalize call. Core functions never normalize again. Domain: raw/normalized strings<=10000 UTF16 units, ordinary options/callable synchronous normalizer, no non-string coercion, proxies or global normalization hooks. Preserve existing default outputs and error priority.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert exactly one injected normalization for valid and invalid results and error identity.
- Assert legacy wrapper/default outputs and normalized core does not transform strings again.

Update project documentation to explain:
- Explain normalized core versus legacy raw wrappers and single pipeline call.
- Document ASCII lowercasing, validation priority, display behavior and injection errors.

Run npm test after the last source or test change.
