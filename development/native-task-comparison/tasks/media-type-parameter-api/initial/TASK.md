# media-type-parameter-api

Extend parseMediaType(text) from token-only parameters to quoted parameter values. Exact grammar: optional outer ASCII space/tab, type '/' subtype (no space around slash), then zero or more [space/tab]* ';' [space/tab]* name [space/tab]* '=' [space/tab]* value, with optional final space/tab. type,subtype,name and unquoted value are nonempty tokens of ASCII letters/digits and !#$%&'*+-.^_`|~. Quoted value is double-quoted and may contain ASCII printable characters and tab; quote/backslash must be escaped by backslash, which consumes the next allowed printable character/tab literally. Semicolon/equal signs inside quotes are data. No CR/LF/NUL/non-ASCII quoted content. Empty quoted value is valid, empty unquoted value is invalid. Return {type,subtype,parameters}: lowercase type/subtype/parameter names; preserve value case and quoted whitespace; duplicate names after normalization use last value. parameters contains own data properties even for '__proto__'. Do not impose output prototype or parameter key order. Reject any malformed grammar, unmatched quote/escape, trailing junk/semicolon, invalid characters or non-string with TypeError. Domain: strings<=10000 units. This is the stated syntax only, not MIME registry validation, RFC2231 decoding or charset conversion. Preserve token-only inputs.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert quoted semicolon/equal/escaped quote or backslash and empty value.
- Assert legacy tokens, case normalization/duplicate override and malformed quote rejection.

Update project documentation to explain:
- Document exact token/quoted grammar, ASCII limits and escape rules.
- Explain normalization versus preserved values, last duplicate wins and strict rejection.

Run npm test after the last source or test change.
