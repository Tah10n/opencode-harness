# terminal-table-render

## Supported contract

Implement visibleWidth(text) and integrate render(rows) for a rectangular string table. Width counts Unicode code points after removing only ANSI SGR sequences ESC [ zero-or-more digits/semicolons m; other escapes/text count literally. This deliberately does not implement grapheme or East Asian display widths. render finds max visible width per column, right-pads every cell including last column with ASCII spaces, joins cells with " | " and rows with LF, no extra LF. Preserve original color escapes in output and inputs unchanged. Empty rows array or rows of zero columns produce expected empty text/LF joins. Domain <=100x20, strings no LF/CR, arbitrary UTF16.

Run `npm test` for the preserved legacy and new project regressions.
