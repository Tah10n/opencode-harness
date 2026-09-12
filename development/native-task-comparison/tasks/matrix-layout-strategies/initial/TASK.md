# matrix-layout-strategies

Extract public cellOrder(rows,cols,order='row') into src/cell-order.mjs and make existing layout(items,{rows,cols,order='row'}) in src/layout.mjs consume this shared strategy enumeration, preserving placement/render behavior. rows/cols integer1..50; order exactly 'row' or 'column', invalid TypeError('layout') even with no items. cellOrder returns fresh coordinate pairs covering every cell: row-major scans columns inside rows, column-major scans rows inside columns. Domain: dense arrays<=100 items {id,w,h}, unique ASCII-letter ids1..10 chars, w/h positive integers<=corresponding cols/rows, frozen allowed. Place items in input order, scanning same complete strategy from start for each, first rectangle wholly within bounds and entirely unoccupied. Mark every spanned cell with id. No fit throws RangeError('cannot place '+id) at first failed item; no input mutation. Return rectangular fresh independent rows of id/null. Existing renderLayout(grid) uses '.' for null, single spaces between cells, LF between rows, no trailing LF. No reorder, rotation, compaction or backtracking. Keep occupancy policy single, not duplicated per strategy; no new scheduler.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert row/column enumeration and distinct spanning placement.
- Assert full-rectangle conflict avoidance, exhaustion, input preservation and rendered text.

Update project documentation to explain:
- Document first-fit strategy order, span constraints and failure semantics.
- Explain renderer format and no backtracking/rotation.

Run npm test after the last source or test change.
