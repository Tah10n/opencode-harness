# positional-options-overload

Add formatRange(options) alongside existing formatRange(start,end,step?). Legacy positional mode formats the inclusive integer progression start,start+step,... not passing end; step defaults to1 when omitted/undefined and output uses commas. Negative steps descend; a step pointing away from end produces an empty string, and equal endpoints produce one value. New ordinary options object has {start,end,step,separator}: start defaults to0, step to1, separator to',' only for omitted/undefined fields; end is required. Separator may be any string including empty. Use the same progression rules. All numeric inputs must be integers with start/end in[-10000,10000], nonzero step in[-20000,20000]; invalid numeric inputs, missing required values or numeric strings reject with RangeError, never coerce. Invalid non-string separator rejects with TypeError. Canonical decimal formatting uses String(number), including zero for -0. Do not mutate options. Domain is either positional calls with up to3 arguments or one ordinary options object with stable own data fields (possibly frozen); no getters/proxies/inherited option fields, arrays or mixed object-plus-positional calls required. Preserve existing positional output and defaults.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert positional/options equivalence including descending ranges.
- Assert undefined-only defaults, empty separator, zero-step rejection and frozen options.

Update project documentation to explain:
- Document both signatures and inclusive directional progression.
- Explain bounded validation, undefined-only defaults, empty separator and no mutation.

Run npm test after the last source or test change.
