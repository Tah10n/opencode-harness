# text-diff-patch-state

Implement applyPatch(lines,hunks), returning {lines,inverse}. Hunks are {at,remove,insert}; at is a zero-based index in the ORIGINAL lines array, remove is the exact expected original slice, insert is replacement lines. Process hunks in supplied order and require at>=the previous hunk removal end. At may equal lines.length for insertion. Invalid integer/range/order or removal past EOF throws RangeError; mismatched expected remove content throws Error with message "conflict". Empty removal is insertion. Multiple zero-removal hunks at the same position are valid and insert in supplied order. Do not mutate input lines or hunks, including on failure. Return a fresh result and inverse hunks whose positions address the RESULT array and whose application restores original lines exactly. Adjacent deletions may yield inverse insertions at one position; support those. No requirement to minimize/coalesce inverse hunks. Domain: dense arrays up to10000 lines, strings without CR/LF (empty and Unicode lines permitted), exact hunk shape, valid line arrays; bad positions/order/context are included for rejection. This is line-array patch application, not a unified-diff parser or a diff generator. Preserve a single valid replacement.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Multiple original-coordinate hunks with length changes and inverse restoring original lines.
- Later context conflict does not mutate input lines/hunks.

Update project documentation to explain:
- Original coordinate and nonoverlap rules, same-position insertions and exact context checks.
- Inverse addresses resulting lines; adjacent deletion handling and failure/ownership guarantees.

Run npm test after the last source or test change.

Size bound applies to both source and resulting line arrays: each is at most10000 lines. Calls whose result would exceed this bound are outside the domain; generated inverse application remains inside the same bound.
