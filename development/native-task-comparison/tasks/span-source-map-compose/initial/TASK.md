# span-source-map-compose

Implement true one-hop span composition in composeMaps(outer,innerBySource) in src/maps.mjs and integrate existing createDiagnosticMapper in src/diagnostics.mjs. Maps are sorted arrays of anchors {generated:{line,column},original:null|{source,line,column}}. Lines1-based, columns0-based nonnegative safe integers; all position arithmetic in this task remains safe integer. Each anchor covers until next anchor on SAME generated line (last to line end), advances original column by generated-column delta, never advances original line; before first anchor/on unrepresented line is unmapped. lookupPosition(map,point) remains public, returns fresh original location or null, no carry from preceding line. compose validates strict unique generated position order/all position shapes (TypeError('map')), including every own enumerable inner map even unused. Domain<=100 anchors per map,<=20 own data map entries, plain/null-prototype dictionary with string source keys, frozen inputs. For each outer span whose original.source is an own inner key, compose through that inner map at matching original line/column, INSERT generated anchors for every inner boundary strictly inside outer span, including null/unmapped and later remapping. An inner boundary exactly at outer end loses to the next outer anchor. Preserve all original outer anchor positions, even redundant/null. If source has no inner map retain original mapping. Exactly one hop: don't recursively remap resulting source names. Clone output, preserve inputs. Diagnostic factory snapshots composed map; returned mapper yields {message,source,line,column,mapped}, using '<generated>' and original diagnostic coordinates when unmapped. Dense maps/valid diagnostic positions and primitive message/source strings; no VLQ/source-map-file format or name fields required.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert insertion of inner boundaries, unmapped/remapped spans and exact mapped diagnostic coordinates.
- Assert outer-end precedence, one-hop behavior, missing line/anchor, snapshots and malformed map ordering.

Update project documentation to explain:
- Document anchor span/coordinate semantics and boundary insertion.
- Explain one-hop source lookup, unmapped diagnostics, validation and snapshot behavior.

Run npm test after the last source or test change.
