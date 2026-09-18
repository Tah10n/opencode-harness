# css-layer-bundle

## Supported contract

Implement orderLayers(names,edges) and integrate bundle(blocks,edges) through it. Names are unique ASCII letters, edges [before,after] reference names, duplicates allowed; blocks {name,css} correspond one-to-one. Return a deterministic topological order, each step choosing lexicographically smallest currently available name (not a once-sorted depth-first order). A cycle including self-edge throws RangeError("cycle"). bundle orders blocks accordingly and joins exact @layer NAME { CSS } lines with LF, no trailing LF. Empty inputs return empty order/text. Preserve input arrays/records, support frozen inputs. No CSS parsing. Domain <=100 blocks/1000 edges.

Run `npm test` for the preserved legacy and new project regressions.
