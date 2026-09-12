# parser-diagnostic-locations

Refactor parseConfig(text) in src/config.mjs to consume new public scanAssignments(text) from src/assignment-scanner.mjs, separating line tokenization/location tracking from duplicate-key assembly. Preserve all existing parsing behavior and exact error messages. Domain: primitive strings<=10000 UTF16 units, lines split on LF or CRLF; bare CR is not whitespace. Each nonblank/noncomment line: optional ASCII spaces/tabs, key [A-Za-z_][A-Za-z0-9_]*, optional spaces/tabs, '=', optional spaces/tabs, nonempty value [A-Za-z0-9_./-]+, optional spaces/tabs, optional '#' comment to end. Comment-only lines allowed after leading space/tab. No quoted values or escapes. Scanner returns fresh records {key,value,line,keyColumn,valueColumn} in order, 1-based line and original UTF16 columns (tab counts one); duplicate keys remain separate. SyntaxError 'Invalid assignment at L:C' points to first unexpected/missing character, using length+1 for missing chars at line end. Scan whole input before assembly so any syntax error wins over duplicates. parseConfig returns fresh ordinary object with own enumerable writable configurable string properties including __proto__/constructor; duplicate keys produce SyntaxError 'Duplicate key at L:C' at second key. Non-string TypeError. Keep assembly free of duplicate scanner logic.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert scanner locations across comments, tabs and CRLF and retained duplicate entries.
- Assert exact syntax/duplicate positions, eager error precedence and own special keys.

Update project documentation to explain:
- Document assignment grammar and 1-based UTF16 columns.
- Explain scanner versus parser responsibilities and error precedence.

Run npm test after the last source or test change.
