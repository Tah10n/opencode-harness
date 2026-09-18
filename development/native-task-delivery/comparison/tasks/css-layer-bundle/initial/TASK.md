# css-layer-bundle

Implement orderLayers(names,edges) and integrate bundle(blocks,edges) through it. Names are unique ASCII letters, edges [before,after] reference names, duplicates allowed; blocks {name,css} correspond one-to-one. Return a deterministic topological order, each step choosing lexicographically smallest currently available name (not a once-sorted depth-first order). A cycle including self-edge throws RangeError("cycle"). bundle orders blocks accordingly and joins exact @layer NAME { CSS } lines with LF, no trailing LF. Empty inputs return empty order/text. Preserve input arrays/records, support frozen inputs. No CSS parsing. Domain <=100 blocks/1000 edges.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- dependency ordering reaches bundle
- cycle and immutable input

Update project documentation to explain:
- Describe dependency ordering, smallest ready name, cycle error, exact layer output and input preservation.

Run npm test after the last source or test change.
