# slug-token-policy

## Supported contract

Extract tokens(text) into src/tokens.mjs and wire slug(text,max=40) in src/slug.mjs through it. Preserve existing deliberately ASCII slug policy: lowercase text using JS toLowerCase, split on runs of anything outside ASCII a-z0-9, discard empties; tokens returns fresh array. slug joins tokens with hyphen, then truncates to first max UTF16 units and strips trailing hyphens; if empty return "untitled" even when max0. max is integer0..1000 (valid domain), text arbitrary UTF16<=10000. No transliteration, Unicode normalization or underscore preservation. Pure core and no duplicated tokenization in consumer.

Run `npm test` for the preserved legacy and new project regressions.
