# slug-token-policy

Extract tokens(text) into src/tokens.mjs and wire slug(text,max=40) in src/slug.mjs through it. Preserve existing deliberately ASCII slug policy: lowercase text using JS toLowerCase, split on runs of anything outside ASCII a-z0-9, discard empties; tokens returns fresh array. slug joins tokens with hyphen, then truncates to first max UTF16 units and strips trailing hyphens; if empty return "untitled" even when max0. max is integer0..1000 (valid domain), text arbitrary UTF16<=10000. No transliteration, Unicode normalization or underscore preservation. Pure core and no duplicated tokenization in consumer.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- token policy and truncation through consumer
- empty fallback and repeat ownership

Update project documentation to explain:
- Explain ASCII tokens, lowercase/split policy, truncation then trailing-hyphen removal and untitled fallback.

Run npm test after the last source or test change.
