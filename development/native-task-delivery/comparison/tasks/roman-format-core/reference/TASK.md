# roman-format-core

Extract pure roman(n) into src/roman.mjs and have existing label(n,prefix="Chapter ") in src/label.mjs delegate to it, without parallel Roman conversion logic. Preserve uppercase standard subtractive Roman numerals for integers1..3999 and RangeError("roman") for other numeric inputs including NaN/fractional, plus all existing prefix behavior (string including empty). Core must not use I/O/global mutable state. Domain numeric n, string prefix. Add direct core and consumer tests, preserve old assertions. This is refactoring, no extended number notation.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- subtractive core and consumer prefix
- invalid input consistently rejects

Update project documentation to explain:
- Document pure Roman core, 1..3999 subtractive range, unchanged label/prefix and RangeError.

Run npm test after the last source or test change.
