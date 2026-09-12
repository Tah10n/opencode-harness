# terminal-table-render

Implement visibleWidth(text) and integrate render(rows) for a rectangular string table. Width counts Unicode code points after removing only ANSI SGR sequences ESC [ zero-or-more digits/semicolons m; other escapes/text count literally. This deliberately does not implement grapheme or East Asian display widths. render finds max visible width per column, right-pads every cell including last column with ASCII spaces, joins cells with " | " and rows with LF, no extra LF. Preserve original color escapes in output and inputs unchanged. Empty rows array or rows of zero columns produce expected empty text/LF joins. Domain <=100x20, strings no LF/CR, arbitrary UTF16.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- color and code points align consumer
- width contract and source preservation

Update project documentation to explain:
- Explain SGR-only removal, code-point rather than grapheme width, right padding including last column and preserved colors.

Run npm test after the last source or test change.
