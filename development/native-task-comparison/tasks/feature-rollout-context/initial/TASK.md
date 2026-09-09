# feature-rollout-context

Implement stable rollout evaluation. bucket(text) applies 32-bit unsigned FNV-1a to ASCII characters, starting 2166136261, XOR each character code, then multiply by 16777619 modulo 2^32; return hash modulo 10000. evaluate(flag,user) returns false if disabled; else an own explicit override if present; else bucket(seed+":"+user)<basisPoints. enabledFlags(flags,user) must use evaluate for every own flag name and return sorted enabled names without mutation. Domain: ASCII user/seed, plain own-data dictionaries, booleans, integer basisPoints 0..10000. Preserve fully enabled 10000-basis-point flags.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Stable bucket result and strict percentage threshold boundary.
- Explicit override plus disabled-flag precedence.

Update project documentation to explain:
- ASCII FNV-1a bucket and seed:user key construction.
- Disabled then override then rollout precedence, sorted consumer output.

Run npm test after the last source or test change.
