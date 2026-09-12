# bigint-wire-boundary

Extend stringify(value)/parse(text) JSON API with this explicit BigInt wire format. If input has no BigInt, stringify must retain exact JSON.stringify bytes. Otherwise output 'bigint-json:1:' followed by JSON.stringify({data,paths}): data is the same tree with each BigInt replaced by its canonical decimal String, paths lists every BigInt location in depth-first traversal (Object.keys order, array index order). Path segments are string object keys or numeric array indices; root BigInt has path[]. Shared acyclic objects are visited at each occurrence. parse accepts primitive string arguments only; non-string argument behavior is outside this task. parse of ordinary JSON strings remains JSON.parse; a prefix at byte0 activates the extension, so quoted strings or lookalike objects are never auto-converted. Restore only listed BigInt paths. Validate extension: exact version1, envelope has only data/paths, nonempty paths array, unique path arrays, type-correct own-property traversal, and each target is canonical decimal BigInt string (0 or optional '-' then nonzero digit followed by digits, no -0, <=100 digits excluding minus). Malformed extension/version/JSON/path/target rejects TypeError; ordinary malformed JSON retains SyntaxError. Do not mutate input or interpret arbitrary tag-shaped objects. Domain for stringify: finite acyclic ordinary JSON data plus BigInt<=100 digits, dense arrays/own enumerable data objects with Object.prototype or null, depth<=100 and<=10000 nodes; strings arbitrary, finite numbers including legacy -0 normalization. Shared acyclic references allowed. No getters, callable toJSON, symbols, undefined, custom prototypes or nonenumerable fields. A plain own toJSON string is ordinary data. This is a fixed wire extension, not a general serialization framework.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert exact large/root/nested BigInt round trip without altering ordinary lookalikes or unmarked strings.
- Assert own special keys and invalid version/path/decimal rejection.

Update project documentation to explain:
- Describe plain JSON compatibility and exact prefixed data/paths representation.
- Document explicit conversion boundary, canonical decimals, supported data domain and rejection rules.

Run npm test after the last source or test change.
