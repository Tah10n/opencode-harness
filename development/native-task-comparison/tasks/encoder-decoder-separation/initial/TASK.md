# encoder-decoder-separation

Extract percent component policy into src/component-codec.mjs exporting encodeComponent/decodeComponent, and route existing renderQuery/parseQuery in src/query.mjs through those functions. Encoding accepts primitive strings: only ASCII letters/digits/-._~ remain literal, all other characters UTF8 percent encoded with uppercase hex. No '+'-for-space substitution. Decode uses percent UTF8 decoding, accepts lowercase hex, preserves literal '+' and other unescaped characters; malformed escape/UTF8 raises URIError. Encoding isolated UTF16 surrogates raises URIError; non-string components TypeError. Domain: strings<=10000 units including malformed strings for stated errors. renderQuery takes dense array<=1000 of two-string pairs, preserving duplicates/order/empty keys/values; render as encodedKey=encodedValue joined '&'. Empty array=>''. parseQuery accepts primitive string, ''=>[]; otherwise split '&', each segment must contain '=' or SyntaxError('missing ='), split only at first '=' then decode both sides. Return array of pairs (never object); no '?' stripping, form decoding or deduplication. Both APIs preserve inputs, error classes, no duplicated percent policy in query layer. No dependencies.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert reserved ASCII/Unicode encoding, literal plus and round-trip.
- Assert ordered repeated/empty query pairs and malformed Unicode/percent/segment errors.

Update project documentation to explain:
- Document UTF8 uppercase percent policy and difference from form encoding.
- Explain pair preservation, first-equals parse rule and error classes.

Run npm test after the last source or test change.
